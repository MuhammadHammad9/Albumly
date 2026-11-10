// Connects sign-in to the library. It listens to Supabase Auth and:
// - signed in  → switches the library to the account repository and starts syncing,
//                and offers to move this browser's own library into the account
// - signed out → switches back to the browser library and removes the account copy from the device
// - session ended without a sign-out (expired) → keeps the account copy on screen; changes wait
//   on the device until the user signs in again
import { librarySource, localLibrary } from '../stores/libraryStore.js'
import { sessionStore } from '../stores/sessionStore.js'
import { ApiError, apiRequest } from './api.js'
import { createAuthService, peekStoredUserId } from './auth/authService.js'
import { AUTH_STORAGE_KEY, accountsEnabled } from './auth/config.js'
import { CACHE_PREFIX, createApiRepository } from './library/apiRepository.js'
import { emptyLibrary } from './library/schema.js'

const DISMISS_PREFIX = 'albumly:import-dismissed:'

const safely = (fn) => {
  try {
    return fn()
  } catch {
    return null
  }
}

export function createSession({
  enabled = accountsEnabled,
  auth = createAuthService(),
  source = librarySource,
  local = localLibrary,
  store = sessionStore,
  storage = globalThis.localStorage,
  api = apiRequest,
  makeRepository = createApiRepository,
} = {}) {
  let repo = null // the account repository while someone is (or was) signed in
  let signingOut = false
  const set = (change) => store.setState(change)

  // ---------- calls to our API as the signed-in user ----------

  function expire() {
    if (!repo) return
    repo.pause()
    set({ status: 'expired' })
  }

  // Adds the access token. A 401 gets one fresh token and one retry; after that the session has ended.
  async function request(method, path, body) {
    const token = await auth.getAccessToken().catch(() => null)
    if (!token) {
      expire()
      throw new ApiError(401, 'session_expired', 'Your session has ended. Sign in again.')
    }
    try {
      return await api(method, path, { body, token })
    } catch (error) {
      if (error.status !== 401) throw error
      const fresh = await auth.refresh().catch(() => null)
      if (!fresh) {
        expire()
        throw error
      }
      try {
        return await api(method, path, { body, token: fresh })
      } catch (retryError) {
        if (retryError.status === 401) expire()
        throw retryError
      }
    }
  }

  // ---------- switching repositories ----------

  // Account copies of other users have no business on this device once someone else signs in
  function clearOtherCaches(userId) {
    safely(() => {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
      for (const key of keys) if (key?.startsWith(CACHE_PREFIX) && key !== `${CACHE_PREFIX}${userId}`) storage.removeItem(key)
    })
  }

  function switchToAccount(userId) {
    if (repo?.userId === userId) return repo
    repo?.stop()
    clearOtherCaches(userId)
    repo = makeRepository({
      userId,
      request,
      storage,
      onStatus: (status) => set({ sync: status.sync, syncMessage: status.message, pending: status.pending, loadingLibrary: Boolean(status.loading) }),
    })
    source.use(repo)
    return repo
  }

  function switchToBrowser() {
    repo?.stop()
    repo = null
    source.use(local)
    set({ sync: 'idle', syncMessage: '', pending: 0, loadingLibrary: false })
  }

  const localSize = () => {
    const library = local.load()
    return { albums: Object.keys(library.entries).length, collections: library.collections.length }
  }

  function checkImportOffer(userId) {
    const size = localSize()
    const dismissed = safely(() => storage.getItem(DISMISS_PREFIX + userId))
    set({ importOffer: size.albums + size.collections > 0 && !dismissed ? size : null })
  }

  // ---------- reacting to Supabase Auth ----------

  function signedIn(user) {
    const state = store.getState()
    const resuming = repo?.userId === user.id && (state.status === 'expired' || state.status === 'loading')
    const account = switchToAccount(user.id)
    set({ status: 'signedIn', user })
    if (resuming && state.status === 'expired') account.resume()
    else account.start()
    checkImportOffer(user.id)
  }

  function handle(event, user) {
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true })
    if (user) {
      const state = store.getState()
      if (state.status === 'signedIn' && state.user?.id === user.id) set({ user })
      else signedIn(user)
      return
    }
    if (signingOut) return
    if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
      if (repo) expire()
      else set({ status: 'signedOut', user: null })
    }
  }

  // ---------- what the UI calls ----------

  return {
    request,

    // Call once, before the first render: a returning user starts on their account copy at once
    start() {
      if (!enabled) {
        set({ status: 'disabled' })
        return Promise.resolve()
      }
      const peeked = peekStoredUserId(storage)
      if (peeked) switchToAccount(peeked)
      set({ status: 'loading', user: peeked ? { id: peeked, email: null } : null })
      return auth.onChange(handle).catch(() => set({ status: peeked ? 'expired' : 'signedOut' }))
    },

    signUp: (email, password) => auth.signUp(email, password),
    signIn: (email, password) => auth.signIn(email, password),
    resetPassword: (email) => auth.resetPassword(email),

    async updatePassword(password) {
      const result = await auth.updatePassword(password)
      if (result.ok) set({ recovery: false })
      return result
    },

    // Changes on this device that the account does not have yet (sign-out would lose them)
    pendingChanges: () => repo?.pendingCount() ?? 0,

    async signOut() {
      signingOut = true
      try {
        repo?.stop()
        await auth.signOut().catch(() => {})
        repo?.clearCache()
        switchToBrowser()
        set({ status: 'signedOut', user: null, importOffer: null, recovery: false })
      } finally {
        signingOut = false
      }
    },

    // Deletes the account and everything in it (server side), then signs out here
    async deleteAccount() {
      await request('DELETE', '/api/me')
      const userId = repo?.userId ?? store.getState().user?.id
      signingOut = true
      try {
        repo?.stop()
        repo?.clearCache()
        await auth.signOut().catch(() => {})
        safely(() => {
          storage.removeItem(AUTH_STORAGE_KEY)
          storage.removeItem(DISMISS_PREFIX + userId)
        })
        switchToBrowser()
        set({ status: 'signedOut', user: null, importOffer: null, recovery: false })
      } finally {
        signingOut = false
      }
    },

    // How much is saved in this browser's own library
    localLibrarySize: localSize,

    // Moves this browser's library into the account (newest change wins), then empties the
    // browser copy so there are never two diverging copies. Returns the merge summary.
    async importLocal() {
      if (!repo) throw new ApiError(401, 'session_expired', 'Sign in first.')
      await repo.flush()
      const result = await request('POST', '/api/library/import', { library: local.load() })
      repo.applyServer(result.library)
      local.save(emptyLibrary())
      set({ importOffer: null })
      return result.summary
    },

    dismissImport() {
      const userId = store.getState().user?.id
      if (userId) safely(() => storage.setItem(DISMISS_PREFIX + userId, '1'))
      set({ importOffer: null })
    },
  }
}

// The app's one session
export const session = createSession()
