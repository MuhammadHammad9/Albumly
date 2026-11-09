import { describe, expect, test } from 'vitest'
import { albumStats, compareAlbums, formatDelta, trackLengthSeries } from './compare.js'

const owner = { id: 'nh', name: 'Neon Harbor' }
const guest = (id) => ({ id, name: id })
const track = (n, { ms = 200_000, explicit = false, guests = [], disc = 1 } = {}) => ({
  id: `t${n}`,
  name: `Track ${n}`,
  discNumber: disc,
  trackNumber: n,
  durationMs: ms,
  explicit,
  artists: [owner, ...guests.map(guest)],
})

const albumA = {
  id: 'a',
  name: 'A',
  year: 2015,
  artists: [owner],
  totalTracks: 3,
  totalDurationMs: 600_000,
  tracks: [track(1, { explicit: true }), track(2, { guests: ['mara'] }), track(3, { guests: ['mara', 'kite'] })],
}

const albumB = {
  id: 'b',
  name: 'B',
  year: 2021,
  artists: [owner],
  totalTracks: 4,
  totalDurationMs: 900_000,
  tracks: [track(1, { ms: 300_000 }), track(2, { ms: 200_000 }), track(3, { ms: 200_000, disc: 2 }), track(4, { ms: 200_000, disc: 2, explicit: true })],
}

test('albumStats counts tracks, explicit tracks, distinct guests and discs', () => {
  expect(albumStats(albumA)).toEqual({
    year: 2015,
    trackCount: 3,
    durationMs: 600_000,
    averageTrackMs: 200_000,
    explicitCount: 1,
    featuredArtistCount: 2, // mara counted once
    featuredTrackCount: 2,
    discCount: 1,
  })
  expect(albumStats(albumB)).toMatchObject({ discCount: 2, featuredArtistCount: 0, averageTrackMs: 225_000 })
})

test('albumStats falls back to summed durations and the listed track count', () => {
  const { totalDurationMs, ...noTotal } = albumA // eslint-disable-line no-unused-vars
  expect(albumStats(noTotal).durationMs).toBe(600_000)
  expect(albumStats({ id: 'x', artists: [owner], totalTracks: 9 })).toMatchObject({ trackCount: 9, durationMs: 0, averageTrackMs: 0, year: null })
})

test('compareAlbums gives B minus A for every measure, in words', () => {
  const rows = Object.fromEntries(compareAlbums(albumA, albumB).map((row) => [row.key, row]))

  expect(rows.year).toMatchObject({ a: 2015, b: 2021, delta: 6, deltaText: '6 years later' })
  expect(rows.trackCount).toMatchObject({ delta: 1, deltaText: '+1' })
  expect(rows.durationMs).toMatchObject({ aText: '10 min', bText: '15 min', deltaText: '+5 min' })
  expect(rows.averageTrackMs).toMatchObject({ aText: '3:20', bText: '3:45', deltaText: '+0:25' })
  expect(rows.explicitCount.deltaText).toBe('Same')
  expect(rows.featuredArtistCount.deltaText).toBe('−2')
})

describe('formatDelta', () => {
  test.each([
    ['year', -1, '1 year earlier'],
    ['count', 0, 'Same'],
    ['length', 20_000, 'Same'], // under half a minute rounds to no difference
    ['length', -240_000, '−4 min'],
    ['trackLength', -65_000, '−1:05'],
    ['count', null, '—'],
  ])('%s %s -> %s', (kind, delta, expected) => {
    expect(formatDelta(kind, delta)).toBe(expected)
  })
})

test('trackLengthSeries lines tracks up by position, in minutes', () => {
  expect(trackLengthSeries(albumA, albumB)).toEqual([
    { position: 1, a: 3.33, b: 5 },
    { position: 2, a: 3.33, b: 3.33 },
    { position: 3, a: 3.33, b: 3.33 },
    { position: 4, a: null, b: 3.33 },
  ])
})
