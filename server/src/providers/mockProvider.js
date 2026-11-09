import { catalog } from '../data/mockCatalog.js'
import { LAZY_GROUPS, RELEASE_GROUPS, mergeGroups } from '../services/catalog/discographyService.js'
import { ApiError, badRequest, notFound } from '../utils/errors.js'

const { artistsById, albumsById, discographies, featuredArtistIds } = catalog

// Pretend to be a network call so loading states are visible. Read on every call so tests can set it to 0.
const simulateLatency = () => {
  const ms = Number(process.env.MOCK_DELAY_MS ?? 250)
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

// A release as it appears in lists: everything except the tracklist
function toRelease(album, group = album.albumType) {
  // eslint-disable-next-line no-unused-vars
  const { tracks, totalDurationMs, ...release } = album
  return { ...release, group }
}

// Newest first; ISO dates (even partial ones like "2022") sort correctly as plain strings
const newestFirst = (a, b) => b.releaseDate.localeCompare(a.releaseDate)

// Discographies are served the way spotifyProvider serves them: as one piece per group, with
// compilations and guest appearances cut to their first page until their tab is opened.
const MOCK_PAGE_SIZE = 10 // same as Spotify's

function discographyGroup(artistId, group, { firstPageOnly = false } = {}) {
  const entries = discographies.get(artistId)
  if (!entries) throw notFound('Artist')
  const all = entries
    .filter((entry) => entry.group === group)
    .map(({ albumId }) => toRelease(albumsById.get(albumId), group))
    .sort(newestFirst)
  const releases = firstPageOnly ? all.slice(0, MOCK_PAGE_SIZE) : all
  return {
    group,
    releases,
    reported: all.length,
    retrieved: releases.length,
    complete: releases.length === all.length,
    truncated: false,
    requests: 0,
    fetchedAt: new Date().toISOString(),
  }
}

function searchByName(items, query, { offset, limit }) {
  const q = query.toLowerCase()
  // Searching for "!error" simulates the upstream API failing, to exercise error states
  if (q.startsWith('!error')) throw new ApiError(502, 'upstream_error', 'The music catalogue is unavailable')

  const matches = items
    .filter((item) => item.name.toLowerCase().includes(q))
    // Names that start with the query rank above names that merely contain it
    .sort((a, b) => b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q) || a.name.localeCompare(b.name))

  return { items: matches.slice(offset, offset + limit), total: matches.length, offset, limit }
}

// Album and track search, closer to Spotify's free text: every word must appear in the title or in
// an artist's name, so "neon harbor glass" finds Glass Arcade. Optional artist and year filters
// narrow the results, like Spotify's `artist:` and `year:` field filters.
function searchByWords(items, query, { offset, limit }, { artist, yearFrom = -Infinity, yearTo = Infinity } = {}, yearOf) {
  const q = query.toLowerCase()
  if (q.startsWith('!error')) throw new ApiError(502, 'upstream_error', 'The music catalogue is unavailable')

  const words = q.split(/\s+/).filter(Boolean)
  const artistNeedle = artist?.toLowerCase()
  const artistText = (item) => item.artists.map((a) => a.name.toLowerCase()).join(' ')

  const matches = items
    .filter((item) => {
      const year = yearOf(item)
      if (year < yearFrom || year > yearTo) return false
      if (artistNeedle && !artistText(item).includes(artistNeedle)) return false
      const text = `${item.name.toLowerCase()} ${artistText(item)}`
      return words.every((word) => text.includes(word))
    })
    // Titles that start with the query first, then titles that contain it, then the rest (artist matches)
    .sort((a, b) => {
      const rank = (item) => (item.name.toLowerCase().startsWith(q) ? 2 : item.name.toLowerCase().includes(q) ? 1 : 0)
      return rank(b) - rank(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    })

  return { items: matches.slice(offset, offset + limit), total: matches.length, offset, limit }
}

// Every track in the catalogue, each carrying a small reference to its album (built once, on first use)
let allTracks
function tracksWithAlbums() {
  allTracks ??= [...albumsById.values()].flatMap((album) =>
    album.tracks.map((track) => ({
      ...track,
      album: { id: album.id, name: album.name, coverUrl: album.coverUrl, releaseDate: album.releaseDate, year: album.year },
    })),
  )
  return allTracks
}

export const mockProvider = {
  name: 'mock',

  async searchArtists(query, page) {
    await simulateLatency()
    return searchByName([...artistsById.values()], query, page)
  },

  async searchAlbums(query, page, filters) {
    await simulateLatency()
    const releases = [...albumsById.values()].map((album) => toRelease(album))
    return searchByWords(releases, query, page, filters, (release) => release.year)
  },

  async searchTracks(query, page, filters) {
    await simulateLatency()
    return searchByWords(tracksWithAlbums(), query, page, filters, (track) => track.album.year)
  },

  async getArtist(id) {
    await simulateLatency()
    const artist = artistsById.get(id)
    if (!artist) throw notFound('Artist')
    return artist
  },

  async getDiscography(artistId) {
    await simulateLatency()
    const pieces = RELEASE_GROUPS.map((group) => discographyGroup(artistId, group, { firstPageOnly: LAZY_GROUPS.includes(group) }))
    return mergeGroups(artistId, pieces, { source: 'mock' })
  },

  async getDiscographyGroup(artistId, group) {
    await simulateLatency()
    if (!RELEASE_GROUPS.includes(group)) throw badRequest(`"group" must be one of ${RELEASE_GROUPS.join(', ')}`)
    return { artistId, ...discographyGroup(artistId, group) }
  },

  async getAlbum(id) {
    await simulateLatency()
    const album = albumsById.get(id)
    if (!album) throw notFound('Album')
    return { ...album, group: album.albumType }
  },

  async getFeatured() {
    await simulateLatency()
    const artists = featuredArtistIds.map((id) => artistsById.get(id))
    const albums = [...albumsById.values()]
      .filter((album) => album.albumType === 'album')
      .sort(newestFirst)
      .slice(0, 12)
      .map((album) => toRelease(album))
    return { artists, albums }
  },
}
