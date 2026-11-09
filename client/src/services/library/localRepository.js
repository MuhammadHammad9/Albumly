// Stores the library in this browser's localStorage. One of possibly several "repositories" with
// the same three methods (load, save, subscribe): when accounts arrive, an API-backed one can
// replace it without the store or any component changing.
import { collectionSchema, emptyLibrary, entrySchema, librarySchema, migrate } from './schema.js'

export const STORAGE_KEY = 'albumly:library'
export const BACKUP_KEY = 'albumly:library:backup'

// Keep whatever is still valid from damaged data instead of throwing it all away
export function salvage(data) {
  const library = emptyLibrary()
  if (!data || typeof data !== 'object') return library

  for (const [key, value] of Object.entries(data.entries ?? {})) {
    const result = entrySchema.safeParse(value)
    if (result.success && result.data.album.id === key) library.entries[key] = result.data
  }

  const names = new Set()
  for (const value of Array.isArray(data.collections) ? data.collections : []) {
    const result = collectionSchema.safeParse(value)
    if (!result.success) continue
    const collection = result.data
    const name = collection.name.toLowerCase()
    if (names.has(name) || library.collections.some((existing) => existing.id === collection.id)) continue
    names.add(name)
    // Drop references to albums that did not survive
    library.collections.push({ ...collection, albumIds: collection.albumIds.filter((id) => library.entries[id]) })
  }
  return library
}

export function createLocalRepository({ storage = globalThis.localStorage, target = globalThis.window } = {}) {
  // Before replacing damaged data, keep a copy of it so nothing is silently lost
  function backUp(text) {
    try {
      storage.setItem(BACKUP_KEY, text)
    } catch {
      // Nothing more we can do
    }
  }

  function load() {
    let text
    try {
      text = storage.getItem(STORAGE_KEY)
    } catch {
      return emptyLibrary() // storage is blocked: work in memory for this visit
    }
    if (text === null) return emptyLibrary()

    let raw
    try {
      raw = JSON.parse(text)
    } catch {
      backUp(text)
      return emptyLibrary()
    }

    try {
      const result = librarySchema.safeParse(migrate(raw))
      if (result.success) return result.data
      backUp(text)
      return salvage(raw)
    } catch {
      // Unknown or newer format: keep the original safe and start fresh
      backUp(text)
      return emptyLibrary()
    }
  }

  // true when saved; false when the browser refused (full, or blocked)
  function save(library) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(library))
      return true
    } catch {
      return false
    }
  }

  // Another tab changed the library: hand the fresh copy to `listener`
  function subscribe(listener) {
    if (!target) return () => {}
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) listener(load())
    }
    target.addEventListener('storage', onStorage)
    return () => target.removeEventListener('storage', onStorage)
  }

  return { load, save, subscribe }
}
