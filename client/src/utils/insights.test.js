import { expect, test } from 'vitest'
import { COLLECTIONS, ENTRIES, GENRES } from './intelligenceFixtures.js'
import { computeInsights, groupBy } from './insights.js'
import { buildMusicDna } from './musicDna.js'

// Exit criterion: these numbers were worked out by hand from intelligenceFixtures.js
//
//  id  artist(s)              year  status     rating  tags                  tracks
//  n1  Neon Harbor            2012  listened   8       late night            10
//  n2  Neon Harbor            2015  favourite  10      late night, driving   12  (45 min)
//  n3  Neon Harbor            2018  listened   6                             11
//  m1  Mara Voss              2016  listened   9       late night            11  (40 min)
//  m2  Mara Voss, Neon Harbor 2019  want       -                             14
//  k1  Kite & Ember           2010  listened   4       acoustic              9
//  k2  Kite & Ember           2014  -          -                             10
//  l1  The Paper Lanterns     2008  listening  7       driving               12
//
//  ratings 8+10+6+9+4+7 = 44 over 6 rated albums = 7.33 -> 7.3
//  tracks 10+12+11+11+14+9+10+12 = 89

const insights = computeInsights(ENTRIES, COLLECTIONS, { genresByArtist: GENRES })

test('totals', () => {
  expect(insights.totals).toEqual({ albums: 8, artists: 4, collections: 1, rated: 6, tracks: 89, durationMs: 5_100_000, durationKnownFor: 2 })
  expect(insights.averageRating).toBe(7.3)
})

test('top artist counts every credited artist (Neon Harbor: n1, n2, n3, m2)', () => {
  expect(insights.topArtist).toEqual({ id: 'neon-harbor', name: 'Neon Harbor', albums: 4, averageRating: 8 })
  // Mara Voss and Kite & Ember both have 2; Mara's average (9) beats Kite's (4)
  expect(insights.topArtists.map((a) => [a.name, a.albums])).toEqual([
    ['Neon Harbor', 4],
    ['Mara Voss', 2],
    ['Kite & Ember', 2],
    ['The Paper Lanterns', 1],
  ])
})

test('top genre: dream pop and synthwave both have 4 albums and the same average, so A to Z decides', () => {
  expect(insights.topGenre).toEqual({ name: 'dream pop', albums: 4, averageRating: 8, kind: 'genre' })
  expect(insights.genres.map((g) => [g.name, g.albums])).toEqual([
    ['dream pop', 4],
    ['synthwave', 4],
    ['alt r&b', 2],
    ['neo soul', 2],
    ['indie folk', 2],
  ])
})

test('without genres (Spotify today) the top tag is used and labelled as a tag', () => {
  const noGenres = computeInsights(ENTRIES, [])
  expect(noGenres.topGenre).toEqual({ name: 'late night', albums: 3, averageRating: 9, kind: 'tag' })
  expect(noGenres.tags.map((t) => [t.name, t.albums])).toEqual([
    ['late night', 3],
    ['driving', 2],
    ['acoustic', 1],
  ])
})

test('decades, statuses and ratings', () => {
  expect(insights.decades).toEqual([
    { decade: 2000, label: '2000s', albums: 1 },
    { decade: 2010, label: '2010s', albums: 7 },
  ])
  expect(insights.unknownYear).toBe(0)
  expect(insights.statusCounts).toEqual({ favourite: 1, want: 1, listening: 1, listened: 4, none: 1 })
  expect(insights.ratingDistribution.filter((r) => r.albums).map((r) => r.rating)).toEqual([4, 6, 7, 8, 9, 10])
})

test('an empty library gives zeros, not errors', () => {
  const empty = computeInsights([])
  expect(empty.totals.albums).toBe(0)
  expect(empty.averageRating).toBeNull()
  expect(empty.topArtist).toBeNull()
  expect(empty.topGenre).toBeNull()
  expect(buildMusicDna(empty)).toBeNull()
})

test('groupBy puts an item in every group its keys name, once each', () => {
  const groups = groupBy([{ k: ['x', 'y', 'x'] }, { k: 'x' }, { k: null }], (item) => item.k)
  expect([...groups.keys()]).toEqual(['x', 'y'])
  expect(groups.get('x').length).toBe(2)
})

test('Music DNA from the same fixture', () => {
  const dna = buildMusicDna(insights)
  const trait = (key) => dna.traits.find((t) => t.key === key)
  expect(trait('core').value).toBe('dream pop, synthwave and alt r&b')
  expect(trait('decade')).toMatchObject({ value: '2010s', detail: '7 of 8 albums come from the 2010s.' })
  expect(trait('artists').value).toBe('Neon Harbor, Mara Voss and Kite & Ember')
  expect(trait('explorer').value).toBe('Balanced') // 4 artists / 8 albums = 0.5
  expect(trait('rating').value).toBe('Generous') // 7.3
  expect(trait('finisher').value).toBe('50%') // 4 of 8 listened
  expect(dna.headline).toBe('Generous Balanced')
})
