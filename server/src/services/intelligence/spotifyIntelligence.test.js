import { expect, test } from 'vitest'
import { createSpotifyProvider } from '../../providers/spotifyProvider.js'
import { createCache } from '../cache/lruCache.js'
import { ApiError } from '../../utils/errors.js'
import { createSpotifyIntelligence } from './spotifyIntelligence.js'

// Never live Spotify: a fake client answers /artists/{id}/albums with a few made-up releases

const ARTIST = 'A'.repeat(22)
const GUEST = 'G'.repeat(22)

const rawRelease = (id, date, artists = [{ id: ARTIST, name: 'Main Act' }]) => ({
  id,
  name: `Release ${id}`,
  album_type: 'album',
  total_tracks: 10,
  release_date: date,
  release_date_precision: 'day',
  artists,
  images: [],
})

const PAGES = {
  album: [rawRelease('alb1', '2020-01-01'), rawRelease('alb2', '2022-01-01')],
  single: [rawRelease('sin1', '2021-05-01')],
  compilation: [],
  appears_on: [rawRelease('feat1', '2019-03-01', [{ id: GUEST, name: 'Guest' }])],
}

function fakeClient({ blocked = {}, fail } = {}) {
  const client = {
    calls: [],
    async get(path, { params } = {}) {
      client.calls.push(`${path}?${params?.include_groups}`)
      if (fail) throw fail
      if (path.endsWith('/albums')) {
        const items = PAGES[params.include_groups]
        return { items, total: items.length }
      }
      return { id: ARTIST, name: 'Main Act', genres: [], images: [] }
    },
    stats: () => ({ blocked }),
  }
  return client
}

function setup(options) {
  const cache = createCache()
  const client = fakeClient(options)
  const provider = createSpotifyProvider({ client, cache })
  const intelligence = createSpotifyIntelligence({ cache, client })
  return { cache, client, provider, intelligence }
}

test('peeks find what the real provider cached, without sending a request', async () => {
  const { client, provider, intelligence } = setup()
  expect(intelligence.peekReleases(ARTIST)).toBeNull()
  expect(intelligence.peekArtist(ARTIST)).toBeNull()

  await provider.getDiscography(ARTIST)
  await provider.getArtist(ARTIST)
  const sent = client.calls.length

  const known = intelligence.peekReleases(ARTIST)
  expect(known.source).toBe('full')
  expect(known.releases.map((r) => r.id).sort()).toEqual(['alb1', 'alb2', 'feat1', 'sin1'])
  expect(intelligence.peekArtist(ARTIST).name).toBe('Main Act')
  expect(client.calls.length).toBe(sent)
})

test('a preview costs exactly 2 requests, is cached, and the artist page reuses its appears-on page', async () => {
  const { client, provider, intelligence } = setup()
  expect(await intelligence.loadPreview(ARTIST)).toEqual({ requests: 2 })
  expect(client.calls).toEqual([`/artists/${ARTIST}/albums?album`, `/artists/${ARTIST}/albums?appears_on`])

  const preview = intelligence.peekReleases(ARTIST)
  expect(preview.source).toBe('preview')
  expect(preview.releases.map((r) => r.id).sort()).toEqual(['alb1', 'alb2', 'feat1'])

  // Already cached: a second preview is free
  expect(await intelligence.loadPreview(ARTIST)).toEqual({ requests: 0 })

  // The artist page then needs albums, singles and compilations, but not appears-on page one again
  client.calls.length = 0
  await provider.getDiscography(ARTIST)
  expect(client.calls).not.toContain(`/artists/${ARTIST}/albums?appears_on`)
})

test('the featured "latest albums" cache counts as a preview', () => {
  const { cache, intelligence } = setup()
  cache.set(`latest-albums:${ARTIST}`, [{ id: 'new1', name: 'New', releaseDate: '2025-01-01', artists: [] }], 60_000)
  expect(intelligence.peekReleases(ARTIST)).toMatchObject({ source: 'preview', releases: [{ id: 'new1' }] })
})

test('ids that are not Spotify ids cost nothing', async () => {
  const { client, intelligence } = setup()
  expect(await intelligence.loadPreview('neon-harbor')).toEqual({ requests: 0 })
  expect(client.calls).toEqual([])
})

test('a failed lookup reports the requests it may have used', async () => {
  const { intelligence } = setup({ fail: new ApiError(503, 'rate_limited', 'slow down', { retryAfter: 600 }) })
  await expect(intelligence.loadPreview(ARTIST)).rejects.toMatchObject({ code: 'rate_limited', requestsSpent: 1 })
})

test('blockedFor reads the client block on the discography endpoint', () => {
  expect(setup({ blocked: { '/artists/:id/albums': 3600 } }).intelligence.blockedFor()).toBe(3600)
  expect(setup({ blocked: { '/search': 50 } }).intelligence.blockedFor()).toBe(0)
})
