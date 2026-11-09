import { describe, expect, test } from 'vitest'
import { entry } from '../test/libraryFixtures.js'
import { entrySummary, filterEntries, findSimilar, libraryFacets, moveItem, normalizeTag, normalizeTitle, sortEntries, toSnapshot, uniqueName } from './library.js'

describe('normalizeTitle', () => {
  test.each([
    ['Glass Arcade (Deluxe Edition)', 'glass arcade'],
    ['Paper Moons (Remastered)', 'paper moons'],
    ['Flicker - 10th Anniversary Edition', 'flicker'],
    ['Glass Arcade [2016 Remaster]', 'glass arcade'],
    // Brackets that are part of the real title stay
    ['Songs (For Rainy Days)', 'songs for rainy days'],
    ['Harbor Lines: 2012–2022', 'harbor lines 2012 2022'],
  ])('%s -> %s', (title, expected) => {
    expect(normalizeTitle(title)).toBe(expected)
  })
})

test('findSimilar spots another edition by the same artist, but not other artists', () => {
  const base = toSnapshot(entry('a', {}, { name: 'Glass Arcade' }).album)
  const deluxe = toSnapshot(entry('b', {}, { name: 'Glass Arcade (Deluxe Edition)' }).album)
  const cover = toSnapshot(entry('c', {}, { name: 'Glass Arcade', artists: [{ id: 'tribute', name: 'Tribute' }] }).album)

  expect(findSimilar(deluxe, [cover, base])).toBe(base)
  expect(findSimilar(base, [base])).toBeNull() // the album itself is not a duplicate of itself
  expect(findSimilar(cover, [base, deluxe])).toBeNull()
})

test('toSnapshot keeps only library fields and fills safe defaults', () => {
  const snapshot = toSnapshot({ id: 'x', name: 'X', artists: [{ id: 'a', name: 'A', extra: 1 }], tracks: [1, 2], group: 'album' })

  expect(snapshot).toEqual({
    id: 'x',
    name: 'X',
    artists: [{ id: 'a', name: 'A' }],
    albumType: 'album',
    inferredType: 'album',
    releaseDate: '',
    precision: 'day',
    year: null,
    totalTracks: 0,
    coverUrl: null,
    spotifyUrl: '',
    totalDurationMs: null,
  })
})

test('normalizeTag trims, lowercases and collapses spaces', () => {
  expect(normalizeTag('  Late   Night ')).toBe('late night')
})

test('moveItem moves without mutating, and ignores out-of-range moves', () => {
  const list = ['a', 'b', 'c', 'd']

  expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  expect(moveItem(list, 0, 9)).toBe(list)
  expect(list).toEqual(['a', 'b', 'c', 'd'])
})

describe('filterEntries and sortEntries', () => {
  const entries = [
    entry('a', { status: 'listened', rating: 8, tags: ['night'], addedAt: '2026-01-03T00:00:00.000Z' }, { name: 'Night Ferry', year: 2018, releaseDate: '2018-10-12' }),
    entry('b', { status: 'want', addedAt: '2026-01-01T00:00:00.000Z' }, { name: 'Afterimage', year: 2021, releaseDate: '2021-03-19' }),
    entry(
      'c',
      { rating: 10, tags: ['night', 'soul'], addedAt: '2026-01-02T00:00:00.000Z' },
      { name: 'Paper Moons', year: 2016, releaseDate: '2016-04-08', artists: [{ id: 'mara-voss', name: 'Mara Voss' }] },
    ),
  ]
  const names = (list) => list.map((item) => item.album.name)

  test('filters by text (title or artist), artist, years, status and tag', () => {
    expect(names(filterEntries(entries, { text: 'mara' }))).toEqual(['Paper Moons'])
    expect(names(filterEntries(entries, { artist: 'neon-harbor' }))).toEqual(['Night Ferry', 'Afterimage'])
    expect(names(filterEntries(entries, { yearFrom: 2020, yearTo: 2015 }))).toEqual(['Night Ferry', 'Paper Moons'])
    expect(names(filterEntries(entries, { status: 'want' }))).toEqual(['Afterimage'])
    expect(names(filterEntries(entries, { tag: 'night', text: 'paper' }))).toEqual(['Paper Moons'])
    expect(filterEntries(entries, {})).toHaveLength(3)
  })

  test('sorts by each key, with recently added as the default', () => {
    expect(names(sortEntries(entries))).toEqual(['Night Ferry', 'Paper Moons', 'Afterimage'])
    expect(names(sortEntries(entries, 'title'))).toEqual(['Afterimage', 'Night Ferry', 'Paper Moons'])
    expect(names(sortEntries(entries, 'artist'))).toEqual(['Paper Moons', 'Night Ferry', 'Afterimage'])
    expect(names(sortEntries(entries, 'oldest'))).toEqual(['Paper Moons', 'Night Ferry', 'Afterimage'])
    expect(names(sortEntries(entries, 'rating'))).toEqual(['Paper Moons', 'Night Ferry', 'Afterimage'])
    expect(names(sortEntries(entries, 'nonsense'))).toEqual(names(sortEntries(entries)))
  })

  test('libraryFacets lists the artists, years and tags in use', () => {
    expect(libraryFacets(entries)).toEqual({
      artists: [
        { id: 'mara-voss', name: 'Mara Voss' },
        { id: 'neon-harbor', name: 'Neon Harbor' },
      ],
      years: [2016, 2018, 2021],
      tags: ['night', 'soul'],
    })
  })
})

test('uniqueName adds a number when the name is taken, ignoring case', () => {
  expect(uniqueName('Mixtape', ['Road trip'])).toBe('Mixtape')
  expect(uniqueName('Mixtape', ['mixtape', 'Mixtape (2)'])).toBe('Mixtape (3)')
})

test('entrySummary describes status and rating', () => {
  expect(entrySummary(entry('a', { status: 'listened', rating: 8 }))).toBe('Listened · 8/10')
  expect(entrySummary(entry('a'))).toBe('')
})
