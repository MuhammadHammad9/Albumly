import { LAZY_GROUPS, RELEASE_GROUPS, fetchGroup, mergeGroups } from '../services/catalog/discographyService.js'
import { normalizeArtist, normalizeRelease, normalizeTrack } from '../services/spotify/normalize.js'
import { createSpotifyIntelligence } from '../services/intelligence/spotifyIntelligence.js'
import { badRequest } from '../utils/errors.js'

// The real catalogue. Same methods and return shapes as mockProvider, backed by the Spotify
// Web API, with every answer cached so repeat visits cost no Spotify requests.

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
// Discographies are the expensive call (Spotify allows few per day), and artists rarely release
// more than once a week, so they are kept the longest.
const TTL = { search: 10 * MINUTE, artist: DAY, discography: 7 * DAY, album: 7 * DAY, featured: DAY, searchDiscography: 3 * 60 * MINUTE }

// Backup discography while Spotify pauses its album-list endpoint: up to this many search pages
const SEARCH_DISCOGRAPHY_PAGES = 5
const SEARCH_GROUPS = { album: 'album', single: 'single', compilation: 'compilation' }

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/
const MAX_TRACK_PAGES = 20 // safety stop when following an album's track pages
const FEATURED_ALBUMS_PER_ARTIST = 2

const newestFirst = (a, b) => b.releaseDate.localeCompare(a.releaseDate)

// Adds Spotify's field filters to the free text: ("dawn", { artist: 'The Weeknd', yearFrom: 2020, yearTo: 2022 })
// -> 'dawn artist:"The Weeknd" year:2020-2022'. Quotes are removed from the artist so it cannot break out of its own.
export function buildSearchQuery(text, { artist, yearFrom, yearTo } = {}) {
  const parts = [text]
  if (artist) parts.push(`artist:"${artist.replaceAll('"', '')}"`)
  if (yearFrom !== undefined || yearTo !== undefined) {
    const from = yearFrom ?? yearTo
    const to = yearTo ?? yearFrom
    parts.push(from === to ? `year:${from}` : `year:${from}-${to}`)
  }
  return parts.join(' ')
}

// A track found by search, with a small reference to its album so results can show a cover and link
function normalizeSearchTrack(raw) {
  const album = raw.album ? normalizeRelease(raw.album) : null
  return {
    ...normalizeTrack(raw),
    album: album && { id: album.id, name: album.name, coverUrl: album.coverUrl, releaseDate: album.releaseDate, year: album.year },
  }
}

const SEARCH_NORMALIZERS = { artist: normalizeArtist, album: (raw) => normalizeRelease(raw), track: normalizeSearchTrack }

export function createSpotifyProvider({ client, cache, market, featuredArtistIds = [] }) {
  // Reject malformed IDs before spending a Spotify request on them
  function assertId(id, what) {
    if (!SPOTIFY_ID.test(id)) throw badRequest(`"${id}" is not a valid Spotify ${what} ID`)
  }

  // One Spotify request per page, whatever the filters: they travel inside `q`
  function search(type, query, { offset, limit }, filters = {}) {
    const q = buildSearchQuery(query, filters)
    const key = `search:${type}:${q.toLowerCase()}:${offset}:${limit}`
    return cache.getOrLoad(key, TTL.search, async () => {
      const body = await client.get('/search', { params: { q, type, offset, limit, market } })
      const page = body[`${type}s`] // { artists: {...} }, { albums: {...} } or { tracks: {...} }
      const normalize = SEARCH_NORMALIZERS[type]
      return {
        items: page.items.filter(Boolean).map((item) => normalize(item)),
        total: page.total,
        offset,
        limit,
      }
    })
  }

  function assertGroup(group) {
    if (!RELEASE_GROUPS.includes(group)) throw badRequest(`"group" must be one of ${RELEASE_GROUPS.join(', ')}`)
  }

  // Discography pieces: a whole group, or only page one of a lazy group
  const groupKey = (artistId, group) => `discography:${artistId}:${group}`
  const firstPage = (artistId, group) =>
    cache.getOrLoad(`${groupKey(artistId, group)}:first`, TTL.discography, () => fetchGroup(client, artistId, group, { market, firstPageOnly: true }))
  const fullGroup = (artistId, group) =>
    cache.getOrLoad(groupKey(artistId, group), TTL.discography, async () => {
      // Lazy groups reuse the cached page one, so opening a tab costs only the pages after it
      const first = LAZY_GROUPS.includes(group) ? await firstPage(artistId, group) : undefined
      return fetchGroup(client, artistId, group, { market, firstPage: first })
    })

  // Albums and singles in full, but only page one of compilations and guest appearances (enough
  // for Spotify's total). The rest of those comes from getDiscographyGroup when a tab is opened.
  // Each group is cached on its own, so a failed group is the only one fetched again on retry.
  async function fullDiscography(artistId) {
    const pieces = await Promise.all(
      RELEASE_GROUPS.map((group) => {
        if (!LAZY_GROUPS.includes(group)) return fullGroup(artistId, group)
        // Someone already opened this tab? Then the whole group is cached and costs nothing.
        return cache.get(groupKey(artistId, group)) ?? firstPage(artistId, group)
      }),
    )
    return mergeGroups(artistId, pieces)
  }

  // Releases found by searching for the artist's name, kept only when the artist is credited on
  // them. Not complete (no guest appearances, at most 50 releases), so it is cached briefly and
  // never under the real discography's keys: the full list replaces it once Spotify allows.
  function searchDiscography(artistId) {
    return cache.getOrLoad(`discography-search:${artistId}`, TTL.searchDiscography, async () => {
      const artist = await getArtist(artistId)
      const q = buildSearchQuery('', { artist: artist.name }).trim()
      const byGroup = { album: [], single: [], compilation: [], appears_on: [] }
      const seen = new Set()
      let requests = 0
      for (let page = 0; page < SEARCH_DISCOGRAPHY_PAGES; page++) {
        requests++
        const body = await client.get('/search', { params: { q, type: 'album', offset: page * 10, limit: 10, market } })
        for (const raw of body.albums.items.filter(Boolean)) {
          if (seen.has(raw.id) || !raw.artists?.some((credited) => credited.id === artistId)) continue
          seen.add(raw.id)
          const group = SEARCH_GROUPS[raw.album_type] ?? 'album'
          byGroup[group].push(normalizeRelease(raw, group))
        }
        if (!body.albums.next) break
      }
      const fetchedAt = new Date().toISOString()
      const pieces = RELEASE_GROUPS.map((group) => ({
        group,
        releases: byGroup[group],
        reported: byGroup[group].length,
        retrieved: byGroup[group].length,
        complete: true,
        truncated: false, // the notice for partial lists already says not everything is here
        requests: group === 'album' ? requests : 0,
        fetchedAt,
      }))
      const discography = mergeGroups(artistId, pieces, { source: 'spotify-search' })
      discography.report.partial = true
      return discography
    })
  }

  async function getArtist(id) {
    assertId(id, 'artist')
    return cache.getOrLoad(`artist:${id}`, TTL.artist, async () => normalizeArtist(await client.get(`/artists/${id}`, { notFound: 'Artist' })))
  }

  return {
    name: 'spotify',

    searchArtists: (query, page) => search('artist', query, page),
    searchAlbums: (query, page, filters) => search('album', query, page, filters),
    searchTracks: (query, page, filters) => search('track', query, page, filters),
    getArtist,

    // The full discography, or while Spotify pauses album lists, what search can find
    async getDiscography(artistId) {
      assertId(artistId, 'artist')
      try {
        return await fullDiscography(artistId)
      } catch (error) {
        // Spotify is pausing album lists (it allows only a few per day): show what search finds
        if (error.code !== 'rate_limited') throw error
        try {
          return await searchDiscography(artistId)
        } catch {
          throw error // the backup failed too: report the original pause
        }
      }
    },

    async getDiscographyGroup(artistId, group) {
      assertId(artistId, 'artist')
      assertGroup(group)
      return { artistId, ...(await fullGroup(artistId, group)) }
    },
    async getAlbum(id) {
      assertId(id, 'album')
      return cache.getOrLoad(`album:${id}`, TTL.album, async () => {
        const raw = await client.get(`/albums/${id}`, { params: { market }, notFound: 'Album' })

        // The album includes the first page of tracks; follow Spotify's own `next` links for the rest
        const tracks = [...raw.tracks.items]
        let next = raw.tracks.next
        for (let page = 0; next && page < MAX_TRACK_PAGES; page++) {
          const body = await client.get(next)
          tracks.push(...body.items)
          next = body.next
        }

        const normalizedTracks = tracks.filter(Boolean).map(normalizeTrack)
        return {
          ...normalizeRelease(raw),
          tracks: normalizedTracks,
          totalDurationMs: normalizedTracks.reduce((sum, track) => sum + track.durationMs, 0),
        }
      })
    },

    // Not cached as a whole: each piece is cached on its own, so when one fails (say Spotify is
    // limiting album lookups) the rest is still shown, and the failed piece is retried next time
    // instead of the home page staying incomplete for a day.
    async getFeatured() {
      // allSettled: one artist failing (for example, removed from Spotify) must not empty the home page
      const artistResults = await Promise.allSettled(featuredArtistIds.map(getArtist))
      const artists = artistResults.filter((result) => result.status === 'fulfilled').map((result) => result.value)

      // The newest couple of albums from each featured artist (one page each)
      const albumResults = await Promise.allSettled(
        artists.map((artist) =>
          cache.getOrLoad(`latest-albums:${artist.id}`, TTL.featured, async () => {
            const page = await client.get(`/artists/${artist.id}/albums`, { params: { include_groups: 'album', limit: 10, market } })
            return page.items
              .filter(Boolean)
              .map((raw) => normalizeRelease(raw, 'album'))
              .sort(newestFirst)
              .slice(0, FEATURED_ALBUMS_PER_ARTIST)
          }),
        ),
      )
      const albums = albumResults
        .filter((result) => result.status === 'fulfilled')
        .flatMap((result) => result.value)
        .sort(newestFirst)

      return { artists, albums }
    },

    stats: () => ({ cache: cache.stats(), spotify: client.stats() }),

    // Budgeted artist lookups for recommendations, the graph and the calendar (Phase 6)
    ...createSpotifyIntelligence({ cache, client, market }),
  }
}
