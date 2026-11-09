// An in-memory cache that forgets entries after a time-to-live (TTL) and, when full, drops the
// entry that was used least recently (LRU).
//
// The LRU trick: a JavaScript Map remembers insertion order. Every time an entry is read we
// delete and re-insert it, which moves it to the end. The first key in the Map is therefore
// always the least recently used one, and evicting it is O(1).

//
// `storage` (optional) makes the cache survive restarts: `load()` returns saved [key, entry]
// pairs, and `save(entries)` is called after every change (the file storage batches the writes).

export function createCache({ maxEntries = 500, now = Date.now, storage } = {}) {
  const entries = new Map() // key -> { value, expiresAt }
  for (const [key, entry] of storage?.load() ?? []) {
    if (entry?.expiresAt > now()) entries.set(key, entry)
  }
  const persist = () => storage?.save(entries)
  const inFlight = new Map() // key -> promise of a load that has not finished yet
  const counters = { hits: 0, misses: 0, shared: 0 }

  function get(key) {
    const entry = entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= now()) {
      entries.delete(key)
      return undefined
    }
    entries.delete(key)
    entries.set(key, entry) // now the most recently used
    return entry.value
  }

  function set(key, value, ttlMs) {
    entries.delete(key)
    entries.set(key, { value, expiresAt: now() + ttlMs })
    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value) // the oldest key
    }
    persist()
  }

  // Return the cached value, or run `load` once to produce it. If several callers ask for the
  // same missing key at the same moment, they all wait for the one load instead of starting
  // their own. A failed load is not cached, so the next caller tries again.
  async function getOrLoad(key, ttlMs, load) {
    const cached = get(key)
    if (cached !== undefined) {
      counters.hits++
      return cached
    }
    if (inFlight.has(key)) {
      counters.shared++
      return inFlight.get(key)
    }

    counters.misses++
    const promise = (async () => {
      try {
        const value = await load()
        set(key, value, ttlMs)
        return value
      } finally {
        inFlight.delete(key)
      }
    })()
    inFlight.set(key, promise)
    return promise
  }

  function stats() {
    const lookups = counters.hits + counters.shared + counters.misses
    return {
      ...counters,
      size: entries.size,
      hitRate: lookups === 0 ? 0 : Number(((counters.hits + counters.shared) / lookups).toFixed(3)),
    }
  }

  return { get, set, getOrLoad, stats }
}
