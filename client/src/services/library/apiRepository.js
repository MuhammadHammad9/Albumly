// The library of a signed-in user, kept in their account on the server.
// It has the same load / save / subscribe methods as localRepository, so the store and the
// components work unchanged. The store expects load and save to be instant, so this repository
// is "cache first": it keeps a copy on the device and syncs with the server in the background.
//
// Two copies are cached under albumly:cloud:<userId>:
//   synced  – what the server is known to have
//   current – what the user sees (synced + changes not sent yet)
// Sending = diffLibraries(synced, current), one operation at a time. After each success the
// operation is applied to `synced`, so a closed tab resumes where it stopped.
import { librarySchema, emptyLibrary, migrate } from './schema.js'
import { salvage } from './localRepository.js'
import { applyOperation, diffLibraries, requestFor } from './sync.js'

export const cacheKey = (userId) => `albumly:cloud:${userId}`
export const CACHE_PREFIX = 'albumly:cloud:'

// Accepts anything; returns a valid library (damaged parts dropped)
function toLibrary(raw) {
  try {
    const result = librarySchema.safeParse(migrate(raw))
    return result.success ? result.data : salvage(raw)
  } catch {
    return emptyLibrary()
  }
}

const BULK_THRESHOLD = 50 // more album changes than this go up as one import request

export function createApiRepository({
  userId,
  request, // (method, path, body) => Promise<body>; throws ApiError
  storage = globalThis.localStorage,
  target = globalThis.window,
  debounceMs = 150,
  retryDelays = [2000, 5000, 15000, 60000],
  pullEveryMs = 30_000,
  onStatus = () => {},
  timers = globalThis,
}) {
  const key = cacheKey(userId)
  const listeners = new Set()
  let synced
  let current
  let hasCache = false
  let started = false
  let blocked = null // 'expired' while the session has ended: changes wait on this device
  let chain = Promise.resolve() // flushes and pulls run one at a time
  let flushTimer = null
  let retryTimer = null
  let failures = 0
  let lastPull = 0
  let status = { sync: 'idle', message: '', loading: false }

  // ---------- the device copy ----------

  function readCache() {
    try {
      const text = storage.getItem(key)
      if (!text) return false
      const parsed = JSON.parse(text)
      synced = toLibrary(parsed.synced)
      current = toLibrary(parsed.current)
      return true
    } catch {
      return false
    }
  }

  function writeCache() {
    try {
      storage.setItem(key, JSON.stringify({ synced, current }))
      return true
    } catch {
      return false
    }
  }

  hasCache = readCache()
  if (!hasCache) {
    synced = emptyLibrary()
    current = emptyLibrary()
  }

  const pendingCount = () => diffLibraries(synced, current).length

  function setStatus(change) {
    status = { ...status, ...change, pending: pendingCount() }
    onStatus(status)
  }

  const notify = () => listeners.forEach((listener) => listener(current))

  // ---------- sending changes ----------

  const enqueue = (task) => {
    chain = chain.then(task, task)
    return chain
  }

  function scheduleFlush(delay = debounceMs) {
    if (!started || blocked) return
    timers.clearTimeout(flushTimer)
    flushTimer = timers.setTimeout(() => flush(), delay)
  }

  function scheduleRetry(seconds) {
    timers.clearTimeout(retryTimer)
    const delay = seconds ? seconds * 1000 : retryDelays[Math.min(failures, retryDelays.length - 1)]
    failures++
    retryTimer = timers.setTimeout(() => flush(), delay)
  }

  // Sends one operation, or one bulk import for many album changes
  async function send(ops) {
    const puts = ops.filter((op) => op.type === 'putEntry')
    if (puts.length > BULK_THRESHOLD) {
      const entries = Object.fromEntries(puts.map((op) => [op.albumId, op.entry]))
      await request('POST', '/api/library/import', { library: { version: 1, entries, collections: [] } })
      for (const op of puts) synced = applyOperation(synced, op)
      return
    }
    const [method, path, body] = requestFor(ops[0])
    await request(method, path, body)
    synced = applyOperation(synced, ops[0])
  }

  // Returns true when everything was sent
  async function doFlush() {
    if (!started || blocked) return false
    timers.clearTimeout(retryTimer)
    for (;;) {
      const ops = diffLibraries(synced, current)
      if (ops.length === 0) {
        failures = 0
        setStatus({ sync: 'idle', message: '' })
        return true
      }
      setStatus({ sync: 'syncing' })
      try {
        await send(ops)
        writeCache()
      } catch (error) {
        return handleFailure(error)
      }
    }
  }

  async function handleFailure(error) {
    if (error.status === 401) {
      blocked = 'expired'
      setStatus({ sync: 'expired', message: '' })
    } else if (error.status === 0 || error.status >= 500) {
      setStatus({ sync: 'offline', message: '' })
      scheduleRetry()
    } else if (error.status === 429) {
      setStatus({ sync: 'offline', message: '' })
      scheduleRetry(error.retryAfter ?? 30)
    } else {
      // The server refused a change (e.g. a name taken on another device): its copy wins
      await doPull({ force: true, serverWins: true })
      setStatus({ sync: 'error', message: 'Some changes could not be saved to your account.' })
    }
    return false
  }

  const flush = () => enqueue(doFlush)

  // ---------- fetching the account copy ----------

  async function doPull({ force = false, serverWins = false } = {}) {
    if (!started || blocked) return
    if (!force && Date.now() - lastPull < pullEveryMs) return
    // Never throw away changes that were not sent yet
    if (!serverWins && pendingCount() > 0 && !(await doFlush())) return
    if (!hasCache) setStatus({ loading: true })
    try {
      const library = toLibrary(await request('GET', '/api/library'))
      lastPull = Date.now()
      synced = library
      current = library
      hasCache = true
      writeCache()
      notify()
      setStatus({ loading: false, ...(status.sync === 'offline' && { sync: 'idle' }) })
    } catch (error) {
      setStatus({ loading: false })
      if (!serverWins) await handleFailure(error)
    }
  }

  const pull = (options) => enqueue(() => doPull(options))

  // ---------- browser events ----------

  const onVisible = () => {
    if (target?.document?.visibilityState !== 'hidden') pull()
  }
  const onOnline = () => {
    failures = 0
    flush().then(() => pull({ force: true }))
  }
  // Another tab of this browser changed the cached copy
  const onStorage = (event) => {
    if (event.key !== key || !readCache()) return
    notify()
    setStatus({})
  }

  // Starts syncing: fetch the account copy, then keep sending changes
  function start() {
    if (started) return chain
    started = true
    target?.addEventListener?.('visibilitychange', onVisible)
    target?.addEventListener?.('focus', onVisible)
    target?.addEventListener?.('online', onOnline)
    target?.addEventListener?.('storage', onStorage)
    return pull({ force: true })
  }

  return {
    // ---------- the repository interface ----------
    load: () => current,

    save(library) {
      current = library
      const ok = writeCache()
      setStatus({})
      scheduleFlush()
      return ok
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // ---------- account extras ----------

    userId,
    get status() {
      return { ...status, pending: pendingCount() }
    },
    hasCache: () => hasCache,
    pendingCount,

    start,

    stop() {
      started = false
      timers.clearTimeout(flushTimer)
      timers.clearTimeout(retryTimer)
      target?.removeEventListener?.('visibilitychange', onVisible)
      target?.removeEventListener?.('focus', onVisible)
      target?.removeEventListener?.('online', onOnline)
      target?.removeEventListener?.('storage', onStorage)
    },

    // The session ended: keep changes on the device until the user signs in again
    pause() {
      blocked = 'expired'
      setStatus({ sync: 'expired' })
    },
    resume() {
      blocked = null
      failures = 0
      if (!started) return start()
      return flush().then(() => pull({ force: true }))
    },

    flush,
    pull,

    // After an import the server's answer is the new truth for both copies
    applyServer(library) {
      synced = toLibrary(library)
      current = synced
      hasCache = true
      writeCache()
      notify()
      setStatus({})
    },

    clearCache() {
      try {
        storage.removeItem(key)
      } catch {
        // nothing to do
      }
    },
  }
}
