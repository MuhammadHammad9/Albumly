// Pure helpers for the personal library: no React, no storage, easy to unit test.

export const STATUSES = {
  favourite: 'Favourite',
  want: 'Want to listen',
  listening: 'Listening',
  listened: 'Listened',
}
export const STATUS_KEYS = Object.keys(STATUSES)

// The same limits are enforced by the schema (services/library/schema.js) and by the store
export const LIMITS = {
  text: 5000, // review and notes
  tag: 30,
  tagsPerAlbum: 20,
  collectionName: 60,
  collectionDescription: 500,
}

// The few album fields the library keeps, so saved albums render without asking the server.
// Works with a full album (album page) or a release from a list (cards), which has no duration.
export function toSnapshot(album) {
  return {
    id: album.id,
    name: album.name,
    artists: (album.artists ?? []).map(({ id, name }) => ({ id, name })),
    albumType: album.albumType ?? 'album',
    inferredType: album.inferredType ?? album.albumType ?? 'album',
    releaseDate: album.releaseDate ?? '',
    precision: album.precision ?? 'day',
    year: album.year ?? null,
    totalTracks: album.totalTracks ?? 0,
    coverUrl: album.coverUrl ?? null,
    spotifyUrl: album.spotifyUrl ?? '',
    totalDurationMs: album.totalDurationMs ?? null,
  }
}

// "  Late Night  " -> "late night"
export const normalizeTag = (raw) => raw.trim().toLowerCase().replace(/\s+/g, ' ')

// "Glass Arcade (Deluxe Edition)" and "Glass Arcade - 2016 Remaster" -> "glass arcade".
// Used to warn about probable duplicates: the same album saved twice under different editions.
const EDITION_WORDS = /\b(deluxe|remaster(ed)?|anniversary|expanded|edition|version|bonus|special|explicit|clean)\b/
export function normalizeTitle(name) {
  return name
    .toLowerCase()
    .replace(/\s*[([][^)\]]*[)\]]/g, (part) => (EDITION_WORDS.test(part) ? '' : part)) // (Deluxe Edition), [Remastered]
    .replace(/\s+-\s+.*$/, (part) => (EDITION_WORDS.test(part) ? '' : part)) // " - 2016 Remaster"
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Another album that looks like the same record: same main artist and the same title once
// edition words are stripped. Returns its snapshot, or null.
export function findSimilar(album, candidates) {
  const title = normalizeTitle(album.name)
  const artistId = album.artists[0]?.id
  return candidates.find((other) => other.id !== album.id && other.artists[0]?.id === artistId && normalizeTitle(other.name) === title) ?? null
}

// A new array with the item at `from` moved to `to`; out-of-range moves return the list unchanged
export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

const artistNames = (entry) => entry.album.artists.map((artist) => artist.name).join(', ')

// Every filter is optional. Years are inclusive and may come in either order.
export function filterEntries(entries, { text = '', artist, yearFrom, yearTo, status, tag } = {}) {
  const needle = text.trim().toLowerCase()
  let minYear = Number.isFinite(yearFrom) ? yearFrom : -Infinity
  let maxYear = Number.isFinite(yearTo) ? yearTo : Infinity
  if (minYear > maxYear) [minYear, maxYear] = [maxYear, minYear]

  return entries.filter((entry) => {
    const { album } = entry
    if (artist && !album.artists.some((a) => a.id === artist)) return false
    if ((minYear > -Infinity || maxYear < Infinity) && !(album.year >= minYear && album.year <= maxYear)) return false
    if (status && entry.status !== status) return false
    if (tag && !entry.tags.includes(tag)) return false
    if (!needle) return true
    return album.name.toLowerCase().includes(needle) || artistNames(entry).toLowerCase().includes(needle)
  })
}

const byTitle = (a, b) => a.album.name.localeCompare(b.album.name)
const byDate = (a, b) => a.album.releaseDate.localeCompare(b.album.releaseDate)

// Each comparator ends with a tie-breaker, so equal items always come out in the same order
const SORTERS = {
  added: (a, b) => b.addedAt.localeCompare(a.addedAt) || byTitle(a, b),
  title: (a, b) => byTitle(a, b) || byDate(b, a),
  artist: (a, b) => artistNames(a).localeCompare(artistNames(b)) || byDate(a, b) || byTitle(a, b),
  newest: (a, b) => byDate(b, a) || byTitle(a, b),
  oldest: (a, b) => byDate(a, b) || byTitle(a, b),
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byTitle(a, b),
}

export const LIBRARY_SORTS = [
  { key: 'added', label: 'Recently added' },
  { key: 'title', label: 'Title A to Z' },
  { key: 'artist', label: 'Artist A to Z' },
  { key: 'newest', label: 'Newest release' },
  { key: 'oldest', label: 'Oldest release' },
  { key: 'rating', label: 'Highest rated' },
]
export const DEFAULT_LIBRARY_SORT = 'added'

export function sortEntries(entries, sortKey = DEFAULT_LIBRARY_SORT) {
  return [...entries].sort(SORTERS[sortKey] ?? SORTERS[DEFAULT_LIBRARY_SORT])
}

// The choices for the filter menus, taken from what is actually in the library
export function libraryFacets(entries) {
  const artists = new Map()
  const years = new Set()
  const tags = new Set()
  for (const { album, tags: entryTags } of entries) {
    for (const artist of album.artists) artists.set(artist.id, artist.name)
    if (album.year) years.add(album.year)
    entryTags.forEach((tag) => tags.add(tag))
  }
  return {
    artists: [...artists].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    years: [...years].sort((a, b) => a - b),
    tags: [...tags].sort(),
  }
}

// "Mixtape" is taken -> "Mixtape (2)", then "Mixtape (3)"...; case is ignored when comparing
export function uniqueName(name, takenNames) {
  const taken = new Set(takenNames.map((existing) => existing.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  let n = 2
  while (taken.has(`${name} (${n})`.toLowerCase())) n++
  return `${name} (${n})`
}

// Does removing this album lose anything the user typed or chose? Then ask first.
export const entryHasData = (entry, collectionCount = 0) =>
  Boolean(entry && (entry.status || entry.rating || entry.review || entry.notes || entry.tags.length > 0 || collectionCount > 0))

export const countCollectionsWith = (collections, albumId) => collections.filter((c) => c.albumIds.includes(albumId)).length

// The question asked before removing an album that has data
export function removalMessage(name, collectionCount) {
  const collections = collectionCount > 0 ? ` and take it out of ${collectionCount === 1 ? '1 collection' : `${collectionCount} collections`}` : ''
  return `Remove “${name}”? This deletes its status, rating, tags and notes${collections}.`
}

// "Listened · 8/10", or '' when there is nothing to say
export function entrySummary(entry) {
  return [entry.status && STATUSES[entry.status], entry.rating && `${entry.rating}/10`].filter(Boolean).join(' · ')
}
