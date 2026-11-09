import { describe, expect, test } from 'vitest'
import { filterReleases, filterTracks, groupByYear, sortReleases, yearRange } from './releases.js'

const release = (name, releaseDate, totalTracks = 10, artist = 'Neon Harbor') => ({
  id: name,
  name,
  group: artist === 'Neon Harbor' ? 'album' : 'appears_on',
  releaseDate,
  year: Number(releaseDate.slice(0, 4)),
  totalTracks,
  artists: [{ id: artist, name: artist }],
})

const releases = [
  release('Night Ferry', '2018-10-12', 11),
  release('Low Tide Signals', '2012-09-14', 10),
  release('Harbor Lines', '2022', 18), // year-only date
  release('Afterimage', '2021-03-19', 22),
  release('Static Bloom', '2018-08-17', 2),
  release('Velvet Hours', '2019-09-27', 14, 'Mara Voss'),
]

const names = (list) => list.map((item) => item.name)

describe('sortReleases', () => {
  test('newest first, handling a year-only date', () => {
    expect(names(sortReleases(releases, 'newest'))).toEqual([
      'Harbor Lines',
      'Afterimage',
      'Velvet Hours',
      'Night Ferry',
      'Static Bloom',
      'Low Tide Signals',
    ])
  })

  test('oldest first is the exact reverse when there are no ties', () => {
    expect(names(sortReleases(releases, 'oldest'))).toEqual(names(sortReleases(releases, 'newest')).reverse())
  })

  test('A to Z and most tracks', () => {
    expect(names(sortReleases(releases, 'az'))[0]).toBe('Afterimage')
    expect(names(sortReleases(releases, 'tracks')).slice(0, 2)).toEqual(['Afterimage', 'Harbor Lines'])
  })

  test('ties are broken by name, so the order is always the same', () => {
    const tied = [release('B', '2020-01-01'), release('A', '2020-01-01')]

    expect(names(sortReleases(tied, 'newest'))).toEqual(['A', 'B'])
    expect(names(sortReleases(tied, 'oldest'))).toEqual(['A', 'B'])
  })

  test('does not mutate its input and falls back to newest for an unknown key', () => {
    const before = names(releases)

    expect(names(sortReleases(releases, 'nonsense'))).toEqual(names(sortReleases(releases, 'newest')))
    expect(names(releases)).toEqual(before)
  })
})

describe('filterReleases', () => {
  test('with no filters returns everything', () => {
    expect(filterReleases(releases)).toHaveLength(releases.length)
  })

  test('matches title text case-insensitively, ignoring surrounding spaces', () => {
    expect(names(filterReleases(releases, { text: '  FERRY ' }))).toEqual(['Night Ferry'])
  })

  test('matches the host artist of a guest appearance, but not the page artist on their own releases', () => {
    expect(names(filterReleases(releases, { text: 'mara' }))).toEqual(['Velvet Hours'])
    expect(names(filterReleases(releases, { text: 'neon harbor' }))).toEqual([])
  })

  test('year range is inclusive and either end may be open', () => {
    expect(names(filterReleases(releases, { yearFrom: 2018, yearTo: 2019 }))).toEqual(['Night Ferry', 'Static Bloom', 'Velvet Hours'])
    expect(names(filterReleases(releases, { yearFrom: 2021 }))).toEqual(['Harbor Lines', 'Afterimage'])
    expect(names(filterReleases(releases, { yearTo: 2012 }))).toEqual(['Low Tide Signals'])
  })

  test('a reversed range is treated as the same range', () => {
    expect(filterReleases(releases, { yearFrom: 2019, yearTo: 2018 })).toHaveLength(3)
  })

  test('text and years combine', () => {
    expect(names(filterReleases(releases, { text: 'static', yearFrom: 2019 }))).toEqual([])
  })
})

test('groupByYear keeps the incoming order of years and of releases within a year', () => {
  const groups = groupByYear(sortReleases(releases, 'oldest'))

  expect(groups.map((group) => group.year)).toEqual([2012, 2018, 2019, 2021, 2022])
  expect(names(groups[1].releases)).toEqual(['Static Bloom', 'Night Ferry'])
})

test('yearRange lists every year between the first and last release', () => {
  expect(yearRange([release('a', '2019'), release('b', '2022-05-01')])).toEqual([2019, 2020, 2021, 2022])
  expect(yearRange([])).toEqual([])
})

test('filterTracks matches title or guest artist, and returns everything for blank text', () => {
  const tracks = [
    { name: 'Salt Rivers', artists: [{ name: 'Neon Harbor' }] },
    { name: 'Winter Daylight', artists: [{ name: 'Neon Harbor' }, { name: 'Kite & Ember' }] },
  ]

  expect(filterTracks(tracks, 'salt')).toEqual([tracks[0]])
  expect(filterTracks(tracks, 'kite')).toEqual([tracks[1]])
  expect(filterTracks(tracks, '   ')).toBe(tracks)
})
