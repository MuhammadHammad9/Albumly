// The personal library as a Zustand store: the data plus every action that changes it.
// The store does not know where data is kept. It talks to a "repository" (load / save / subscribe),
// so tests use an in-memory one and a later phase can swap in one backed by the server.
import { createStore } from 'zustand/vanilla'
import { createLocalRepository } from '../services/library/localRepository.js'
import { createRepositorySwitch } from '../services/library/repositorySwitch.js'
import { LIBRARY_VERSION } from '../services/library/schema.js'
import { LIMITS, STATUS_KEYS, findSimilar, moveItem, normalizeTag, toSnapshot } from '../utils/library.js'

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const snapshotsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function createLibraryStore(repository, { now = () => new Date().toISOString(), newId = makeId } = {}) {
  const initial = repository.load()

  const store = createStore((set, get) => {
    // ---------- small private helpers ----------

    function updateEntry(id, changes) {
      const entry = get().entries[id]
      if (!entry) return false
      set({ entries: { ...get().entries, [id]: { ...entry, ...changes, updatedAt: now() } } })
      return true
    }

    function updateCollection(id, change) {
      let found = false
      const collections = get().collections.map((collection) => {
        if (collection.id !== id) return collection
        found = true
        return { ...collection, ...change(collection), updatedAt: now() }
      })
      if (found) set({ collections })
      return found
    }

    // A trimmed, unique name, or a reason it cannot be used
    function checkName(raw, exceptId) {
      const name = raw.trim().replace(/\s+/g, ' ')
      if (!name) return { ok: false, error: 'empty', message: 'Give the collection a name.' }
      if (name.length > LIMITS.collectionName) {
        return { ok: false, error: 'too_long', message: `Collection names can be at most ${LIMITS.collectionName} characters.` }
      }
      const clash = get().collections.find((c) => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase())
      if (clash) return { ok: false, error: 'duplicate_name', message: `You already have a collection called “${clash.name}”.` }
      return { ok: true, name }
    }

    function addEntry(album) {
      if (get().entries[album.id]) return
      const time = now()
      const entry = { album: toSnapshot(album), status: null, rating: null, review: '', notes: '', tags: [], addedAt: time, updatedAt: time }
      set({ entries: { ...get().entries, [album.id]: entry } })
    }

    return {
      entries: initial.entries,
      collections: initial.collections,
      storageOk: true, // false when the browser refuses to save (storage full or blocked)

      // ---------- saving albums ----------

      saveAlbum: addEntry,

      // Also removes the album from every collection, so collections only ever hold saved albums
      removeAlbum(id) {
        const { [id]: removed, ...entries } = get().entries
        if (!removed) return
        const time = now()
        const collections = get().collections.map((c) =>
          c.albumIds.includes(id) ? { ...c, albumIds: c.albumIds.filter((albumId) => albumId !== id), updatedAt: time } : c,
        )
        set({ entries, collections })
      },

      // Keeps a saved album's details current when its page is viewed. Costs no request, and is
      // not a change the user made, so updatedAt stays the same.
      refreshSnapshot(album) {
        const entry = get().entries[album.id]
        if (!entry) return
        const fresh = toSnapshot(album)
        if (fresh.totalDurationMs === null) fresh.totalDurationMs = entry.album.totalDurationMs
        if (snapshotsEqual(fresh, entry.album)) return
        set({ entries: { ...get().entries, [album.id]: { ...entry, album: fresh } } })
      },

      // ---------- details of one saved album ----------

      setStatus: (id, status) => updateEntry(id, { status: STATUS_KEYS.includes(status) ? status : null }),
      setRating: (id, rating) => updateEntry(id, { rating: Number.isInteger(rating) && rating >= 1 && rating <= 10 ? rating : null }),
      setReview: (id, text) => updateEntry(id, { review: text.slice(0, LIMITS.text) }),
      setNotes: (id, text) => updateEntry(id, { notes: text.slice(0, LIMITS.text) }),

      addTag(id, raw) {
        const entry = get().entries[id]
        if (!entry) return { ok: false, error: 'not_saved' }
        const tag = normalizeTag(raw)
        if (!tag) return { ok: false, error: 'empty', message: 'Type a tag first.' }
        if (tag.length > LIMITS.tag) return { ok: false, error: 'too_long', message: `Tags can be at most ${LIMITS.tag} characters.` }
        if (entry.tags.includes(tag)) return { ok: false, error: 'exists', message: `“${tag}” is already a tag.` }
        if (entry.tags.length >= LIMITS.tagsPerAlbum) return { ok: false, error: 'too_many', message: `At most ${LIMITS.tagsPerAlbum} tags per album.` }
        updateEntry(id, { tags: [...entry.tags, tag] })
        return { ok: true, tag }
      },

      removeTag(id, tag) {
        const entry = get().entries[id]
        if (entry) updateEntry(id, { tags: entry.tags.filter((existing) => existing !== tag) })
      },

      // ---------- collections ----------

      createCollection(rawName) {
        const check = checkName(rawName)
        if (!check.ok) return check
        const time = now()
        const collection = { id: newId(), name: check.name, description: '', albumIds: [], createdAt: time, updatedAt: time }
        set({ collections: [...get().collections, collection] })
        return { ok: true, id: collection.id }
      },

      renameCollection(id, rawName) {
        const check = checkName(rawName, id)
        if (!check.ok) return check
        updateCollection(id, () => ({ name: check.name }))
        return { ok: true }
      },

      deleteCollection(id) {
        set({ collections: get().collections.filter((collection) => collection.id !== id) })
      },

      // Saves the album too if needed. Refuses the exact same album twice; warns (but allows)
      // when a different edition of the same record is already there.
      addToCollection(collectionId, album) {
        const collection = get().collections.find((c) => c.id === collectionId)
        if (!collection) return { ok: false, error: 'no_collection' }
        if (collection.albumIds.includes(album.id)) {
          return { ok: false, error: 'already_in_collection', message: `Already in “${collection.name}”.` }
        }
        const similar = findSimilar(
          album,
          collection.albumIds.map((id) => get().entries[id].album),
        )
        addEntry(album)
        updateCollection(collectionId, (c) => ({ albumIds: [...c.albumIds, album.id] }))
        return { ok: true, similar }
      },

      removeFromCollection(collectionId, albumId) {
        updateCollection(collectionId, (c) => ({ albumIds: c.albumIds.filter((id) => id !== albumId) }))
      },

      moveInCollection(collectionId, from, to) {
        const collection = get().collections.find((c) => c.id === collectionId)
        if (!collection) return
        const albumIds = moveItem(collection.albumIds, from, to)
        if (albumIds !== collection.albumIds) updateCollection(collectionId, () => ({ albumIds }))
      },

      // ---------- import ----------

      // Replaces everything with an already-validated library (see services/library/transfer.js)
      setLibrary(library) {
        set({ entries: library.entries, collections: library.collections })
      },
    }
  })

  // Save after every change to the data. Changes that arrive from another tab are already saved.
  let applyingExternal = false
  store.subscribe((state, previous) => {
    if (applyingExternal) return
    if (state.entries === previous.entries && state.collections === previous.collections) return
    const ok = repository.save({ version: LIBRARY_VERSION, entries: state.entries, collections: state.collections })
    if (ok !== state.storageOk) store.setState({ storageOk: ok })
  })

  repository.subscribe((library) => {
    applyingExternal = true
    store.setState({ entries: library.entries, collections: library.collections })
    applyingExternal = false
  })

  return store
}

// The browser's own library (used when nobody is signed in)
export const localLibrary = createLocalRepository()

// The one library the app uses. It reads and writes through a switch: the browser library by
// default, the account library while signed in (services/session.js does the switching).
export const librarySource = createRepositorySwitch(localLibrary)
export const libraryStore = createLibraryStore(librarySource)
