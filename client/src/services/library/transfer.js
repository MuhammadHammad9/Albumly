// Export and import of the library. Only the Library page uses this file, so it is downloaded
// with that page instead of on first load.
import { STATUSES, uniqueName } from '../../utils/library.js'
import { LIBRARY_VERSION, LibraryFormatError, describeIssues, librarySchema, migrate } from './schema.js'

// ---------- Export ----------

export function exportJson(library, now = new Date()) {
  const { entries, collections } = library
  return JSON.stringify({ app: 'albumly', version: LIBRARY_VERSION, exportedAt: now.toISOString(), entries, collections }, null, 2)
}

const CSV_COLUMNS = ['album_id', 'title', 'artists', 'year', 'type', 'status', 'rating', 'tags', 'collections', 'review', 'notes', 'added_at', 'spotify_url']

// RFC 4180: wrap in quotes when needed and double any quote inside. A cell that starts with
// = + - or @ is prefixed with ' so spreadsheet apps show it as text instead of running it as a formula.
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

// One row per saved album. CSV cannot hold collection order, so it is for spreadsheets, not backups.
export function exportCsv(library) {
  const collectionsByAlbum = new Map()
  for (const collection of library.collections) {
    for (const id of collection.albumIds) collectionsByAlbum.set(id, [...(collectionsByAlbum.get(id) ?? []), collection.name])
  }

  const rows = Object.values(library.entries).map(({ album, ...entry }) =>
    [
      album.id,
      album.name,
      album.artists.map((artist) => artist.name).join('; '),
      album.year,
      album.inferredType,
      entry.status ? STATUSES[entry.status] : '',
      entry.rating,
      entry.tags.join('; '),
      (collectionsByAlbum.get(album.id) ?? []).join('; '),
      entry.review,
      entry.notes,
      entry.addedAt,
      album.spotifyUrl,
    ]
      .map(csvCell)
      .join(','),
  )
  // \r\n is what the CSV standard (and Excel) expects between rows
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n')
}

// Hands a text file to the browser's download, built entirely on this device
export function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// ---------- Import ----------

// Checks an imported file completely before anything is changed. Returns
// { ok: true, library, counts } or { ok: false, errors: [{ path, message }] }.
export function parseImport(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: [{ path: '(file)', message: 'This file is not valid JSON. Choose a file exported from Albumly.' }] }
  }

  let migrated
  try {
    migrated = migrate(raw)
  } catch (error) {
    if (error instanceof LibraryFormatError) return { ok: false, errors: [{ path: '(file)', message: error.message }] }
    throw error
  }

  // Unknown keys such as "app" and "exportedAt" are ignored by the schema
  const result = librarySchema.safeParse(migrated)
  if (!result.success) return { ok: false, errors: describeIssues(result.error) }

  const library = result.data
  return { ok: true, library, counts: { albums: Object.keys(library.entries).length, collections: library.collections.length } }
}

// Combines an imported library into the current one without losing anything:
// - albums and collections are matched by id, and the more recently updated copy wins
//   (the same rule cloud sync will use)
// - a new collection whose name already exists is merged into that one: its albums are appended
// Importing the same file twice changes nothing the second time.
export function mergeLibrary(current, incoming) {
  const summary = { added: 0, updated: 0, unchanged: 0, collectionsAdded: 0, collectionsMerged: 0 }
  const entries = { ...current.entries }

  for (const [id, entry] of Object.entries(incoming.entries)) {
    const existing = entries[id]
    if (!existing) {
      entries[id] = entry
      summary.added++
    } else if (entry.updatedAt > existing.updatedAt) {
      entries[id] = entry
      summary.updated++
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
      }
      continue
    }

    collections.push(collection)
    summary.collectionsAdded++
  }

  return { library: { version: LIBRARY_VERSION, entries, collections }, summary }
}

// "Added 12 albums, updated 3, 2 new collections" (only the parts that happened)
export function describeSummary({ added, updated, collectionsAdded, collectionsMerged }) {
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
  const parts = []
  if (added) parts.push(`added ${plural(added, 'album')}`)
  if (updated) parts.push(`updated ${plural(updated, 'album')}`)
  if (collectionsAdded) parts.push(`${plural(collectionsAdded, 'new collection')}`)
  if (collectionsMerged) parts.push(`${plural(collectionsMerged, 'collection')} updated`)
  if (parts.length === 0) return 'Nothing new: your library already had everything in this file.'
  const text = parts.join(', ')
  return `${text[0].toUpperCase()}${text.slice(1)}.`
}
