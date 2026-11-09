import { expect, test } from 'vitest'
import { createCache } from '../services/cache/lruCache.js'
import { API_BASE, createSpotifyClient } from '../services/spotify/spotifyClient.js'
import { fakeFetch, fakeTokenService, json, rawAlbum, rawArtist, rawTrack } from '../services/spotify/fakeSpotify.js'
import { buildSearchQuery, createSpotifyProvider } from './spotifyProvider.js'

const ARTIST = 'A'.repeat(22)
const ALBUM = 'B'.repeat(22)
const GONE = 'Z'.repeat(22)

function setup(handler, options = {}) {
  const fetch = fakeFetch(handler)
  const client = createSpotifyClient({ tokenService: fakeTokenService(), fetch, sleep: async () => {} })
  const provider = createSpotifyProvider({ client, cache: createCache(), ...options })
  return { provider, fetch }
}

test('getArtist normalizes Spotify’s shape and caches the answer', async () => {
  const { provider, fetch } = setup(() => json(rawArtist(ARTIST, 'Neon Harbor')))

  const artist = await provider.getArtist(ARTIST)
  await provider.getArtist(ARTIST)

  expect(artist).toEqual({
    id: ARTIST,
    name: 'Neon Harbor',
    imageUrl: `https://i.scdn.co/image/${ARTIST}`,
    genres: ['indie'],
    spotifyUrl: `https://open.spotify.com/artist/${ARTIST}`,
  })
  expect(fetch.calls).toHaveLength(1)
})

test('rejects a malformed ID without spending a Spotify request', async () => {
  const { provider, fetch } = setup(() => json({}))

  await expect(provider.getArtist('neon-harbor')).rejects.toMatchObject({ status: 400 })
  await expect(provider.getAlbum('../../me')).rejects.toMatchObject({ status: 400 })
  expect(fetch.calls).toHaveLength(0)
})

test('getAlbum follows every page of tracks and totals the duration', async () => {
  const { provider, fetch } = setup((url) => {
    if (url.pathname.endsWith('/tracks')) {
      return json({ items: [rawTrack(3), rawTrack(4)], next: null })
    }
    return json({
      ...rawAlbum(ALBUM, { tracks: 4 }),
      tracks: { items: [rawTrack(1), rawTrack(2)], next: `${API_BASE}/albums/${ALBUM}/tracks?offset=2&limit=2` },
    })
  })

  const album = await provider.getAlbum(ALBUM)

  expect(album.tracks.map((track) => track.trackNumber)).toEqual([1, 2, 3, 4])
  expect(album.totalDurationMs).toBe(800_000)
  expect(album).toMatchObject({ id: ALBUM, group: 'album', inferredType: 'album', totalTracks: 4 })
  expect(fetch.calls).toHaveLength(2)
})

test('search returns Albumly’s paging shape', async () => {
  const { provider, fetch } = setup(() => json({ artists: { items: [rawArtist(ARTIST)], total: 31 } }))

  const result = await provider.searchArtists('Neon', { offset: 10, limit: 10 })

  expect(result).toMatchObject({ total: 31, offset: 10, limit: 10 })
  expect(result.items[0].id).toBe(ARTIST)
  expect(fetch.calls[0]).toContain('q=Neon&type=artist&offset=10&limit=10')
})

test('buildSearchQuery adds artist and year field filters', () => {
  expect(buildSearchQuery('dawn')).toBe('dawn')
  expect(buildSearchQuery('dawn', { artist: 'The "Weeknd"', yearFrom: 2020, yearTo: 2022 })).toBe('dawn artist:"The Weeknd" year:2020-2022')
  expect(buildSearchQuery('dawn', { yearFrom: 2020, yearTo: 2020 })).toBe('dawn year:2020')
  expect(buildSearchQuery('dawn', { yearTo: 2019 })).toBe('dawn year:2019')
})

test('searchTracks sends filters inside q, attaches the album, and caches each page', async () => {
  const track = { ...rawTrack(1), album: rawAlbum(ALBUM, { name: 'Dawn FM', date: '2022-01-07' }) }
  const { provider, fetch } = setup(() => json({ tracks: { items: [track], total: 1 } }))

  const filters = { artist: 'The Weeknd', yearFrom: 2022, yearTo: 2022 }
  const result = await provider.searchTracks('dawn', { offset: 0, limit: 10 }, filters)
  await provider.searchTracks('dawn', { offset: 0, limit: 10 }, filters)

  expect(result.items[0]).toMatchObject({ id: 't1-1', durationMs: 200_000, album: { id: ALBUM, name: 'Dawn FM', year: 2022 } })
  expect(fetch.calls).toHaveLength(1)
  const params = new URL(fetch.calls[0]).searchParams
  expect(params.get('q')).toBe('dawn artist:"The Weeknd" year:2022')
  expect(params.get('type')).toBe('track')
})

test('getFeatured skips an artist that no longer exists instead of failing', async () => {
  const { provider } = setup(
    (url) => {
      if (url.pathname === `/v1/artists/${GONE}`) return json({}, { status: 404 })
      if (url.pathname.endsWith('/albums')) {
        return json({ items: [rawAlbum('x1', { date: '2019-01-01' }), rawAlbum('x2', { date: '2023-01-01' }), rawAlbum('x3', { date: '2021-01-01' })] })
      }
      return json(rawArtist(ARTIST))
    },
    { featuredArtistIds: [ARTIST, GONE] },
  )

  const featured = await provider.getFeatured()

  expect(featured.artists.map((artist) => artist.id)).toEqual([ARTIST])
  expect(featured.albums.map((album) => album.id)).toEqual(['x2', 'x3']) // the newest two
})

test('getFeatured does not cache failed album lookups, so they fill in once Spotify allows', async () => {
  let albumsBlocked = true
  const { provider } = setup(
    (url) => {
      if (url.pathname.endsWith('/albums')) {
        return albumsBlocked ? json({}, { status: 500 }) : json({ items: [rawAlbum('x1')] })
      }
      return json(rawArtist(ARTIST))
    },
    { featuredArtistIds: [ARTIST] },
  )

  expect((await provider.getFeatured()).albums).toEqual([])
  albumsBlocked = false
  expect((await provider.getFeatured()).albums.map((album) => album.id)).toEqual(['x1'])
})
