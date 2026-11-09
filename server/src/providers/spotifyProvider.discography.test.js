import { expect, test } from 'vitest'
import { createCache } from '../services/cache/lruCache.js'
import { createSpotifyClient } from '../services/spotify/spotifyClient.js'
import { fakeFetch, fakeTokenService, json, rawAlbum } from '../services/spotify/fakeSpotify.js'
import { createSpotifyProvider } from './spotifyProvider.js'

// Discography tests live in their own file so they never collide with edits to the search tests

const ARTIST = 'A'.repeat(22)
const albums = (prefix, count, options) => Array.from({ length: count }, (_, i) => rawAlbum(`${prefix}${i}`, options))

// Simulates GET /artists/{id}/albums: `groups` maps include_groups -> the full list of releases
function setup(groups) {
  const fetch = fakeFetch((url) => {
    const group = url.searchParams.get('include_groups')
    const offset = Number(url.searchParams.get('offset'))
    const limit = Number(url.searchParams.get('limit'))
    const all = groups[group] ?? []
    return json({ items: all.slice(offset, offset + limit), total: all.length, limit, offset })
  })
  const client = createSpotifyClient({ tokenService: fakeTokenService(), fetch, sleep: async () => {} })
  return { provider: createSpotifyProvider({ client, cache: createCache() }), fetch }
}

const callsFor = (fetch, group) => fetch.calls.filter((url) => url.includes(`include_groups=${group}`))

const CATALOGUE = {
  album: albums('al', 15),
  single: albums('si', 12, { type: 'single', tracks: 1 }),
  compilation: albums('co', 34, { type: 'compilation' }),
  appears_on: albums('ap', 47, { artist: 'other' }),
}

test('an artist page fetches albums and singles in full but only page one of the lazy groups', async () => {
  const { provider, fetch } = setup(CATALOGUE)

  const discography = await provider.getDiscography(ARTIST)

  expect(callsFor(fetch, 'album')).toHaveLength(2)
  expect(callsFor(fetch, 'single')).toHaveLength(2)
  expect(callsFor(fetch, 'compilation')).toHaveLength(1)
  expect(callsFor(fetch, 'appears_on')).toHaveLength(1)
  expect(discography.counts).toEqual({ album: 15, single: 12, compilation: 10, appears_on: 10 })
  expect(discography.report.pending).toEqual(['compilation', 'appears_on'])
  expect(discography.report.groups.appears_on).toMatchObject({ reported: 47, retrieved: 10, complete: false })

  // Cached: a second visit costs nothing
  await provider.getDiscography(ARTIST)
  expect(fetch.calls).toHaveLength(6)
})

test('opening a lazy group fetches only the pages after page one, and later summaries use it', async () => {
  const { provider, fetch } = setup(CATALOGUE)
  await provider.getDiscography(ARTIST)

  const group = await provider.getDiscographyGroup(ARTIST, 'appears_on')

  expect(group).toMatchObject({ artistId: ARTIST, group: 'appears_on', reported: 47, retrieved: 47, complete: true, truncated: false })
  expect(callsFor(fetch, 'appears_on')).toHaveLength(5) // page one earlier + pages two to five now

  const before = fetch.calls.length
  const summary = await provider.getDiscography(ARTIST)
  expect(fetch.calls).toHaveLength(before)
  expect(summary.counts.appears_on).toBe(47)
  expect(summary.report.pending).toEqual(['compilation'])
})

test('opening a group before the summary still shares page one', async () => {
  const { provider, fetch } = setup(CATALOGUE)

  await Promise.all([provider.getDiscographyGroup(ARTIST, 'compilation'), provider.getDiscography(ARTIST)])

  expect(callsFor(fetch, 'compilation').filter((url) => url.includes('offset=0'))).toHaveLength(1)
  expect(callsFor(fetch, 'compilation')).toHaveLength(4)
})

test('an unknown group or malformed ID is rejected without a Spotify request', async () => {
  const { provider, fetch } = setup(CATALOGUE)

  await expect(provider.getDiscographyGroup(ARTIST, 'bootlegs')).rejects.toMatchObject({ status: 400 })
  await expect(provider.getDiscographyGroup('nope', 'compilation')).rejects.toMatchObject({ status: 400 })
  expect(fetch.calls).toHaveLength(0)
})
