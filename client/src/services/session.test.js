import { beforeEach, expect, test, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { createSession } from './session.js'
import { AUTH_STORAGE_KEY } from './auth/config.js'
import { cacheKey } from './library/apiRepository.js'
import { createRepositorySwitch } from './library/repositorySwitch.js'
import { emptyLibrary } from './library/schema.js'
import { createLibraryStore } from '../stores/libraryStore.js'
import { initialSession } from '../stores/sessionStore.js'
import { entry, memoryRepository } from '../test/libraryFixtures.js'

const USER = { id: 'user-1', email: 'a@example.com' }
const lib = (entries = {}) => ({ ...emptyLibrary(), entries })

let auth, api, local, source, library, store, account

// A stand-in for Supabase Auth: the test decides which events happen
function fakeAuth() {
  const fake = {
    listener: null,
    token: 'token-1',
    onChange: vi.fn(async (listener) => {
      fake.listener = listener
    }),
    emit: (event, user) => fake.listener(event, user),
    getAccessToken: vi.fn(async () => fake.token),
    refresh: vi.fn(async () => null),
    signOut: vi.fn(async () => ({ ok: true })),
  }
  return fake
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup({ localLibrary = lib(), enabled = true } = {}) {
  auth = fakeAuth()
  account = lib({ cloud: entry('cloud') })
  api = vi.fn(async (method, path, { body } = {}) => {
    if (method === 'GET' && path === '/api/library') return structuredClone(account)
    if (path === '/api/library/import') {
      account = { ...account, entries: { ...account.entries, ...body.library.entries } }
      return { library: account, summary: { added: Object.keys(body.library.entries).length } }
    }
    return null
  })
  local = memoryRepository(localLibrary)
  source = createRepositorySwitch(local)
  library = createLibraryStore(source)
  store = createStore(() => ({ ...initialSession }))
  return createSession({ enabled, auth, source, local, store, storage: localStorage, api })
}

const entryIds = () => Object.keys(library.getState().entries)

beforeEach(() => localStorage.clear())

test('without account settings nothing happens and the browser library stays', async () => {
  const session = setup({ enabled: false, localLibrary: lib({ local: entry('local') }) })
  await session.start()
  expect(store.getState().status).toBe('disabled')
  expect(auth.onChange).not.toHaveBeenCalled()
  expect(entryIds()).toEqual(['local'])
})

test('signing in switches to the account library and offers to move the browser library', async () => {
  const session = setup({ localLibrary: lib({ local: entry('local') }) })
  await session.start()
  expect(store.getState().status).toBe('loading')

  auth.emit('SIGNED_IN', USER)
  await settle()

  expect(store.getState()).toMatchObject({ status: 'signedIn', user: USER, importOffer: { albums: 1, collections: 0 } })
  expect(entryIds()).toEqual(['cloud'])
  expect(api).toHaveBeenCalledWith('GET', '/api/library', { body: undefined, token: 'token-1' })
})

test('importing moves the browser library into the account and empties the browser copy', async () => {
  const session = setup({ localLibrary: lib({ local: entry('local') }) })
  await session.start()
  auth.emit('SIGNED_IN', USER)
  await settle()

  const summary = await session.importLocal()

  expect(summary).toEqual({ added: 1 })
  expect(entryIds().sort()).toEqual(['cloud', 'local'])
  expect(local.saved.at(-1)).toEqual(emptyLibrary())
  expect(store.getState().importOffer).toBeNull()
})

test('"Not now" is remembered for this user on this device', async () => {
  const session = setup({ localLibrary: lib({ local: entry('local') }) })
  await session.start()
  auth.emit('SIGNED_IN', USER)
  await settle()
  session.dismissImport()

  const again = setup({ localLibrary: lib({ local: entry('local') }) })
  await again.start()
  auth.emit('SIGNED_IN', USER)
  await settle()
  expect(store.getState().importOffer).toBeNull()
})

test('signing out goes back to the browser library and removes the account copy from the device', async () => {
  const session = setup({ localLibrary: lib({ local: entry('local') }) })
  await session.start()
  auth.emit('SIGNED_IN', USER)
  await settle()
  expect(localStorage.getItem(cacheKey(USER.id))).not.toBeNull()

  await session.signOut()

  expect(auth.signOut).toHaveBeenCalled()
  expect(store.getState()).toMatchObject({ status: 'signedOut', user: null })
  expect(entryIds()).toEqual(['local'])
  expect(localStorage.getItem(cacheKey(USER.id))).toBeNull()
})

test('a session that ends by itself keeps the account library on screen (expired)', async () => {
  const session = setup()
  await session.start()
  auth.emit('SIGNED_IN', USER)
  await settle()

  auth.emit('SIGNED_OUT', null)
  expect(store.getState().status).toBe('expired')
  expect(entryIds()).toEqual(['cloud'])
})

test('a request refused with 401 tries one fresh token, then marks the session expired', async () => {
  const session = setup()
  await session.start()
  auth.emit('SIGNED_IN', USER)
  await settle()

  api.mockRejectedValueOnce(Object.assign(new Error('expired'), { status: 401 }))
  await expect(session.request('GET', '/api/me')).rejects.toMatchObject({ status: 401 })
  expect(auth.refresh).toHaveBeenCalledOnce()
  expect(store.getState().status).toBe('expired')
})

test('a returning user starts on their cached account copy before Supabase has even loaded', async () => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: { id: USER.id } }))
  localStorage.setItem(cacheKey(USER.id), JSON.stringify({ synced: lib({ cached: entry('cached') }), current: lib({ cached: entry('cached') }) }))
  const session = setup({ localLibrary: lib({ local: entry('local') }) })

  session.start() // no await: this part happens synchronously, before the first render
  expect(entryIds()).toEqual(['cached'])
})

test('deleting the account signs out and clears everything about it from the device', async () => {
  const session = setup()
  await session.start()
  auth.emit('SIGNED_IN', USER)
  await settle()

  await session.deleteAccount()

  expect(api).toHaveBeenCalledWith('DELETE', '/api/me', { body: undefined, token: 'token-1' })
  expect(store.getState().status).toBe('signedOut')
  expect(localStorage.getItem(cacheKey(USER.id))).toBeNull()
})
