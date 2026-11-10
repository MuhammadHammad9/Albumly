import { fetchGroup, mergeGroups } from '../catalog/discographyService.js'

// Extra provider methods for the intelligence features, for the Spotify provider.
// The coordinator spreads them into spotifyProvider:  ...createSpotifyIntelligence({ cache, client, market })
//
// "peek" methods only read the cache and never send a request. loadPreview is the one method
// that talks to Spotify, and it costs at most PREVIEW_COST requests.
//
// The cache keys below must match spotifyProvider.js. spotifyIntelligence.test.js fills the cache
// through the real provider and checks that the peeks find it, so the two cannot drift apart.

const DAY = 24 * 60 * 60 * 1000
const PREVIEW_TTL = 7 * DAY // same as the provider's discography TTL
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/
const ALBUMS_ENDPOINT = '/artists/:id/albums' // how the Spotify client names this endpoint in its blocks

// Page one of these two groups: the artist's 10 newest albums and 10 releases they guest on
const PREVIEW_GROUPS = ['album', 'appears_on']
export const PREVIEW_COST = PREVIEW_GROUPS.length

export function createSpotifyIntelligence({ cache, client, market }) {
  const groupKey = (artistId, group) => `discography:${artistId}:${group}`
  const firstKey = (artistId, group) => `${groupKey(artistId, group)}:first`
  const wholeOrFirst = (artistId, group) => cache.get(groupKey(artistId, group)) ?? cache.get(firstKey(artistId, group))

  function peekArtist(id) {
    return cache.get(`artist:${id}`) ?? null
  }

  // The fullest release list already in the cache: { source: 'full' | 'preview', releases }, or null
  function peekReleases(artistId) {
    const album = cache.get(groupKey(artistId, 'album'))
    const single = cache.get(groupKey(artistId, 'single'))
    if (album && single) {
      const pieces = [album, single, wholeOrFirst(artistId, 'compilation'), wholeOrFirst(artistId, 'appears_on')].filter(Boolean)
      return { source: 'full', releases: mergeGroups(artistId, pieces).releases }
    }

    // Not a whole discography: put together whatever pieces exist
    const pieces = [album ?? cache.get(firstKey(artistId, 'album')), single, wholeOrFirst(artistId, 'appears_on')].filter(Boolean)
    const latest = cache.get(`latest-albums:${artistId}`) ?? [] // the home page's "newest albums" for featured artists
    if (pieces.length === 0 && latest.length === 0) return null

    const releases = mergeGroups(artistId, pieces).releases
    const seen = new Set(releases.map((release) => release.id))
    for (const release of latest) if (!seen.has(release.id)) releases.push(release)
    return { source: 'preview', releases }
  }

  // Looks up the groups that are not cached yet. Returns { requests } actually sent.
  // On failure the error carries `requestsSpent`, so the budget still counts what was used.
  async function loadPreview(artistId) {
    if (!SPOTIFY_ID.test(artistId)) return { requests: 0 }
    let requests = 0
    for (const group of PREVIEW_GROUPS) {
      if (cache.get(groupKey(artistId, group)) || cache.get(firstKey(artistId, group))) continue
      try {
        const piece = await fetchGroup(client, artistId, group, { market, firstPageOnly: true })
        requests += piece.requests
        cache.set(firstKey(artistId, group), piece, PREVIEW_TTL)
      } catch (error) {
        // Counted as sent: safer to under-use the allowance than to overshoot it
        error.requestsSpent = requests + 1
        throw error
      }
    }
    return { requests }
  }

  // Seconds left on a Spotify block of the discography endpoint (0 when not blocked)
  function blockedFor() {
    return client.stats?.().blocked?.[ALBUMS_ENDPOINT] ?? 0
  }

  return { peekArtist, peekReleases, loadPreview, blockedFor, previewCost: PREVIEW_COST }
}
