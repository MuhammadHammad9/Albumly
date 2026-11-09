import { expect, test } from 'vitest'
import { fakeFetch, fakeTokenService, json, rawAlbum } from '../spotify/fakeSpotify.js'
import { createSpotifyClient } from '../spotify/spotifyClient.js'
import { MAX_PAGES, fetchDiscography, fetchGroup, mergeGroups } from './discographyService.js'

// Simulates GET /artists/{id}/albums: `groups` maps include_groups -> the full list of releases
function setup(groups) {
  const fetch = fakeFetch((url) => {
    const group = url.searchParams.get('include_groups')
    const offset = Number(url.searchParams.get('offset'))
    const limit = Number(url.searchParams.get('limit'))
    const all = groups[group] ?? []
    return json({ items: all.slice(offset, offset + limit), total: all.length, limit, offset })
  })
  const client = createSpotifyClient({ tokenService: fakeTokenService(), fetch })
  return { client, fetch }
}

const albums = (prefix, count, options) => Array.from({ length: count }, (_, i) => rawAlbum(`${prefix}${i}`, options))

test('pages through every group and labels each release with its group', async () => {
  const { client, fetch } = setup({
    album: albums('al', 23),
    single: albums('si', 4, { type: 'single', tracks: 1 }),
    compilation: [],
    appears_on: albums('ap', 2, { artist: 'other' }),
  })

  const result = await fetchDiscography(client, 'artist1')

  expect(result.total).toBe(29)
  expect(result.counts).toEqual({ album: 23, single: 4, compilation: 0, appears_on: 2 })
  expect(result.releases.find((release) => release.id === 'ap0').group).toBe('appears_on')
  // 3 pages of albums + 1 each for the other three groups
  expect(fetch.calls).toHaveLength(6)
  expect(result.report.groups.album).toMatchObject({ reported: 23, retrieved: 23, complete: true, truncated: false })
})

test('a release in two groups is kept once, under the artist’s own group', async () => {
  const shared = rawAlbum('shared')
  const { client } = setup({ album: [shared], appears_on: [shared, rawAlbum('guest')] })

  const result = await fetchDiscography(client, 'artist1')

  expect(result.releases.map((release) => [release.id, release.group]).sort()).toEqual([
    ['guest', 'appears_on'],
    ['shared', 'album'],
  ])
  expect(result.report.duplicatesRemoved).toBe(1)
})

test('sorts newest first, handles year-only dates and skips null items', async () => {
  const { client } = setup({
    album: [rawAlbum('old', { date: '2001' }), null, rawAlbum('new', { date: '2024-05-01' }), rawAlbum('mid', { date: '2015-02-03' })],
  })

  const { releases } = await fetchDiscography(client, 'artist1')

  expect(releases.map((release) => release.id)).toEqual(['new', 'mid', 'old'])
  expect(releases[2]).toMatchObject({ year: 2001, precision: 'year' })
})

test('infers EPs from singles with 4 to 6 tracks', async () => {
  const { client } = setup({ single: [rawAlbum('ep', { type: 'single', tracks: 5 }), rawAlbum('one', { type: 'single', tracks: 1 })] })

  const { releases } = await fetchDiscography(client, 'artist1')

  expect(Object.fromEntries(releases.map((release) => [release.id, release.inferredType]))).toEqual({ ep: 'ep', one: 'single' })
})

test('stops at the page cap for huge groups and says so in the report', async () => {
  const { client, fetch } = setup({ appears_on: albums('ap', 450, { artist: 'other' }) })

  const result = await fetchDiscography(client, 'artist1')

  expect(result.counts.appears_on).toBe(MAX_PAGES.appears_on * 10)
  expect(result.report.truncated).toEqual(['appears_on'])
  expect(fetch.calls).toHaveLength(MAX_PAGES.appears_on + 3) // capped appears_on pages + 1 for each other group
})

test('firstPageOnly makes one request and reports Spotify’s total', async () => {
  const { client, fetch } = setup({ compilation: albums('co', 34) })

  const piece = await fetchGroup(client, 'artist1', 'compilation', { firstPageOnly: true })

  expect(fetch.calls).toHaveLength(1)
  expect(piece).toMatchObject({ group: 'compilation', reported: 34, retrieved: 10, complete: false, truncated: false, requests: 1 })
})

test('a first page that holds the whole group is already complete', async () => {
  const { client } = setup({ compilation: albums('co', 7) })

  const piece = await fetchGroup(client, 'artist1', 'compilation', { firstPageOnly: true })

  expect(piece).toMatchObject({ reported: 7, retrieved: 7, complete: true })
})

test('finishing a group reuses page one instead of fetching it again', async () => {
  const { client, fetch } = setup({ appears_on: albums('ap', 25, { artist: 'other' }) })
  const first = await fetchGroup(client, 'artist1', 'appears_on', { firstPageOnly: true })

  const full = await fetchGroup(client, 'artist1', 'appears_on', { firstPage: first })

  expect(fetch.calls).toHaveLength(3) // page one, then pages two and three
  expect(fetch.calls.filter((url) => url.includes('offset=0'))).toHaveLength(1)
  expect(full).toMatchObject({ reported: 25, retrieved: 25, complete: true, requests: 3 })
  expect(new Set(full.releases.map((release) => release.id)).size).toBe(25)
})

// A hand-made piece, as fetchGroup would return it
const piece = (group, ids, extra = {}) => ({
  group,
  releases: ids.map((id) => ({ id, name: id, group, releaseDate: '2020-01-01' })),
  reported: ids.length,
  complete: true,
  truncated: false,
  requests: 1,
  fetchedAt: '2026-11-10T10:00:00.000Z',
  ...extra,
})

test('mergeGroups counts duplicates per group and lists pending and capped groups', () => {
  const result = mergeGroups('artist1', [
    piece('album', ['a', 'b']),
    piece('single', ['s', 'a']),
    piece('compilation', ['c', 'b'], { reported: 40, complete: false, fetchedAt: '2026-11-08T10:00:00.000Z' }),
    piece('appears_on', ['x', 'c', 's'], { reported: 150, truncated: true }),
  ])

  expect(result.counts).toEqual({ album: 2, single: 1, compilation: 1, appears_on: 1 })
  expect(result.total).toBe(5)
  expect(result.report).toMatchObject({
    source: 'spotify',
    requests: 4,
    duplicatesRemoved: 4,
    truncated: ['appears_on'],
    pending: ['compilation'],
    fetchedAt: '2026-11-08T10:00:00.000Z', // the oldest piece
  })
  expect(result.report.groups.compilation).toEqual({
    reported: 40,
    retrieved: 2,
    duplicates: 1,
    complete: false,
    truncated: false,
    requests: 1,
    fetchedAt: '2026-11-08T10:00:00.000Z',
  })
  expect(result.report.groups.appears_on.duplicates).toBe(2)
})
