// Combining two libraries. These are the same rules as the client's mergeLibrary
// (client/src/services/library/transfer.js), used here when a browser's library is uploaded:
// - albums and collections are matched by id, and the more recently updated copy wins
//   (on a tie, the copy already in the account stays)
// - a new collection whose name already exists is merged into that one: its albums are appended
// Uploading the same library twice changes nothing the second time.
import { LIBRARY_VERSION } from '../../schemas/library.js'

// "Mixtape" -> "Mixtape (2)" when "Mixtape" is taken
export function uniqueName(name, takenNames) {
  const taken = new Set(takenNames.map((existing) => existing.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  let n = 2
  while (taken.has(`${name} (${n})`.toLowerCase())) n++
  return `${name} (${n})`
}

// A clock more than 5 minutes ahead would make its changes "win" forever, so it is pulled back to now
const MAX_CLOCK_AHEAD_MS = 5 * 60 * 1000
export function clampTime(iso, now = Date.now()) {
  return Date.parse(iso) > now + MAX_CLOCK_AHEAD_MS ? new Date(now).toISOString() : iso
}

// Returns { library, summary, changedEntryIds, changedCollectionIds } so the caller only
// writes the rows that actually changed.
export function mergeLibrary(current, incoming) {
  const summary = { added: 0, updated: 0, unchanged: 0, collectionsAdded: 0, collectionsMerged: 0 }
  const entries = { ...current.entries }
  const changedEntryIds = new Set()
  const changedCollectionIds = new Set()

  for (const [id, entry] of Object.entries(incoming.entries)) {
    const existing = entries[id]
    if (!existing) {
      entries[id] = entry
      summary.added++
      changedEntryIds.add(id)
    } else if (entry.updatedAt > existing.updatedAt) {
      entries[id] = entry
      summary.updated++
      changedEntryIds.add(id)
    } else {
      summary.unchanged++
    }
  }

  const collections = current.collections.map((collection) => ({ ...collection }))
  for (const collection of incoming.collections) {
    const sameId = collections.find((existing) => existing.id === collection.id)
    if (sameId) {
      if (collection.updatedAt > sameId.updatedAt) {
        const otherNames = collections.filter((existing) => existing !== sameId).map((existing) => existing.name)
        Object.assign(sameId, { ...collection, name: uniqueName(collection.name, otherNames) })
        summary.collectionsMerged++
        changedCollectionIds.add(sameId.id)
      }
      continue
    }

    const sameName = collections.find((existing) => existing.name.toLowerCase() === collection.name.toLowerCase())
    if (sameName) {
      const newIds = collection.albumIds.filter((id) => !sameName.albumIds.includes(id))
      if (newIds.length > 0) {
        sameName.albumIds = [...sameName.albumIds, ...newIds]
        sameName.updatedAt = collection.updatedAt > sameName.updatedAt ? collection.updatedAt : sameName.updatedAt
        summary.collectionsMerged++
        changedCollectionIds.add(sameName.id)
      }
      continue
    }

    collections.push({ ...collection })
    summary.collectionsAdded++
    changedCollectionIds.add(collection.id)
  }

  return { library: { version: LIBRARY_VERSION, entries, collections }, summary, changedEntryIds, changedCollectionIds }
}
