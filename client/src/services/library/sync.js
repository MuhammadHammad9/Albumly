// Pure helpers for cloud sync (no network, no storage), so they are easy to test.
//
// The account repository keeps two copies of the library: `synced` (what the server is known to
// have) and `current` (what the user sees). diffLibraries works out the list of small changes
// ("operations") that turn the server's copy into the user's copy, and requestFor says which API
// call sends each one. Every operation is safe to send twice.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const byId = (collections) => new Map(collections.map((collection) => [collection.id, collection]))

// The order matters:
// 1. albums first, because collections can only hold saved albums
// 2. deleted collections before new ones, so a reused name is free
// 3. inside a collection: removals, then additions, then (only if still needed) a reorder
// 4. removed albums last
export function diffLibraries(synced, current) {
  const ops = []

  for (const [albumId, entry] of Object.entries(current.entries)) {
    if (!same(synced.entries[albumId], entry)) ops.push({ type: 'putEntry', albumId, entry })
  }

  const before = byId(synced.collections)
  const after = byId(current.collections)

  for (const id of before.keys()) {
    if (!after.has(id)) ops.push({ type: 'deleteCollection', id })
  }

  const membership = []
  for (const collection of current.collections) {
    const { id, name, description, albumIds, createdAt, updatedAt } = collection
    const old = before.get(id)
    if (!old) {
      ops.push({ type: 'createCollection', collection: { id, name, description, createdAt, updatedAt } })
    } else if (old.name !== name || old.description !== description || old.updatedAt !== updatedAt) {
      ops.push({ type: 'updateCollection', id, name, description, updatedAt })
    }

    const oldIds = old?.albumIds ?? []
    const removed = oldIds.filter((albumId) => !albumIds.includes(albumId))
    const added = albumIds.filter((albumId) => !oldIds.includes(albumId))
    for (const albumId of removed) membership.push({ type: 'removeFromCollection', id, albumId })
    for (const albumId of added) membership.push({ type: 'addToCollection', id, albumId })
    // What the server will hold after those changes; reorder only if that is not the wanted order
    const expected = [...oldIds.filter((albumId) => !removed.includes(albumId)), ...added]
    if (!same(expected, albumIds)) membership.push({ type: 'orderCollection', id, albumIds, updatedAt })
  }
  ops.push(...membership)

  for (const albumId of Object.keys(synced.entries)) {
    if (!current.entries[albumId]) ops.push({ type: 'deleteEntry', albumId })
  }
  return ops
}

// The library as the server holds it after `op` succeeded
export function applyOperation(library, op) {
  const collections = library.collections
  const editCollection = (id, change) => collections.map((c) => (c.id === id ? { ...c, ...change(c) } : c))

  switch (op.type) {
    case 'putEntry':
      return { ...library, entries: { ...library.entries, [op.albumId]: op.entry } }
    case 'deleteEntry': {
      const { [op.albumId]: removed, ...entries } = library.entries
      if (!removed) return library
      // The server removes it from every collection too
      return { ...library, entries, collections: collections.map((c) => ({ ...c, albumIds: c.albumIds.filter((id) => id !== op.albumId) })) }
    }
    case 'createCollection':
      if (collections.some((c) => c.id === op.collection.id)) return library
      return { ...library, collections: [...collections, { ...op.collection, albumIds: [] }] }
    case 'updateCollection':
      return { ...library, collections: editCollection(op.id, () => ({ name: op.name, description: op.description, updatedAt: op.updatedAt })) }
    case 'deleteCollection':
      return { ...library, collections: collections.filter((c) => c.id !== op.id) }
    case 'addToCollection':
      return { ...library, collections: editCollection(op.id, (c) => ({ albumIds: c.albumIds.includes(op.albumId) ? c.albumIds : [...c.albumIds, op.albumId] })) }
    case 'removeFromCollection':
      return { ...library, collections: editCollection(op.id, (c) => ({ albumIds: c.albumIds.filter((id) => id !== op.albumId) })) }
    case 'orderCollection':
      return { ...library, collections: editCollection(op.id, (c) => ({ albumIds: op.albumIds, updatedAt: op.updatedAt > c.updatedAt ? op.updatedAt : c.updatedAt })) }
    default:
      return library
  }
}

const enc = encodeURIComponent

// [method, path, body] for the API call that sends `op`
export function requestFor(op) {
  switch (op.type) {
    case 'putEntry':
      return ['PUT', `/api/albums/${enc(op.albumId)}/entry`, op.entry]
    case 'deleteEntry':
      return ['DELETE', `/api/albums/${enc(op.albumId)}/entry`]
    case 'createCollection':
      return ['POST', '/api/collections', op.collection]
    case 'updateCollection':
      return ['PATCH', `/api/collections/${enc(op.id)}`, { name: op.name, description: op.description, updatedAt: op.updatedAt }]
    case 'deleteCollection':
      return ['DELETE', `/api/collections/${enc(op.id)}`]
    case 'addToCollection':
      return ['POST', `/api/collections/${enc(op.id)}/albums`, { albumId: op.albumId }]
    case 'removeFromCollection':
      return ['DELETE', `/api/collections/${enc(op.id)}/albums/${enc(op.albumId)}`]
    case 'orderCollection':
      return ['PATCH', `/api/collections/${enc(op.id)}/order`, { albumIds: op.albumIds, updatedAt: op.updatedAt }]
    default:
      throw new Error(`Unknown sync operation ${op.type}`)
  }
}
