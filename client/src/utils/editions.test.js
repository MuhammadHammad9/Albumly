import { describe, expect, test } from 'vitest'
import { editionSimilarity, groupEditions, isAlternateTitle, levenshtein, normalizeTitle, ungrouped } from './editions.js'

const release = (name, releaseDate, totalTracks = 10, { group = 'album', artist = 'neon-harbor' } = {}) => ({
  id: name,
  name,
  group,
  releaseDate,
  totalTracks,
  artists: [{ id: artist, name: artist }],
})

// [[primary, ...editions], ...] by name
const shape = (groups) => groups.map((g) => [g.primary.name, ...g.editions.map((e) => e.name)])

describe('normalizeTitle', () => {
  test.each([
    ['Glass Arcade (Deluxe Edition)', 'glass arcade'],
    ['Paper Moons (Remastered)', 'paper moons'],
    ['Flicker (10th Anniversary Edition)', 'flicker'],
    ['Night Ferry - 2019 Remaster', 'night ferry'],
    ['Abbey Road [Super Deluxe]', 'abbey road'],
    ['Café Society', 'cafe society'],
    ['Kite & Ember', 'kite and ember'],
  ])('%s -> %s', (name, expected) => {
    expect(normalizeTitle(name)).toBe(expected)
  })

  test('keeps brackets and suffixes that are not about editions', () => {
    expect(normalizeTitle('Slow Lightning (Remixes)')).toBe('slow lightning remixes')
    expect(normalizeTitle('Live (Original Soundtrack)')).toBe('live original soundtrack')
    expect(normalizeTitle('Harbor Lines - Live in Oslo')).toBe('harbor lines live in oslo')
  })

  test('isAlternateTitle spots edition words', () => {
    expect(isAlternateTitle('Golden Hour Radio (Deluxe)')).toBe(true)
    expect(isAlternateTitle('Golden Hour Radio')).toBe(false)
  })
})

test('levenshtein counts single-character edits', () => {
  expect(levenshtein('kitten', 'sitting')).toBe(3)
  expect(levenshtein('', 'abc')).toBe(3)
  expect(levenshtein('same', 'same')).toBe(0)
})

test('editionSimilarity follows S = 0.4N + 0.3A + 0.2D + 0.1T', () => {
  const result = editionSimilarity(release('Glass Arcade', '2015-05-22', 12), release('Glass Arcade (Deluxe Edition)', '2015-05-22', 12))
  expect(result).toMatchObject({ n: 1, a: 1, d: 1, t: 1 })
  expect(result.score).toBeCloseTo(1)

  const other = editionSimilarity(release('Greatest Hits', '2010-01-01', 10), release('Greatest Hits', '2010-01-01', 10, { artist: 'someone-else' }))
  expect(other.a).toBe(0)
  expect(other.score).toBeCloseTo(0.7)
})

describe('groupEditions', () => {
  test('stacks deluxe, remastered and anniversary editions under the original', () => {
    const groups = groupEditions([
      release('Glass Arcade (Deluxe Edition)', '2016-02-05', 17),
      release('Glass Arcade', '2015-05-22', 12),
      release('Flicker (10th Anniversary Edition)', '2025-03-28', 16),
      release('Flicker', '2015-03-27', 10),
      release('Paper Moons (Remastered)', '2021-04-09', 11),
      release('Paper Moons', '2016-04-08', 11),
    ])

    expect(shape(groups)).toEqual([
      ['Glass Arcade', 'Glass Arcade (Deluxe Edition)'],
      ['Flicker', 'Flicker (10th Anniversary Edition)'],
      ['Paper Moons', 'Paper Moons (Remastered)'],
    ])
  })

  test('joins a chain of editions into one group, oldest first', () => {
    const groups = groupEditions([
      release('Afterimage (Anniversary Edition)', '2031-03-19', 30),
      release('Afterimage', '2021-03-19', 22),
      release('Afterimage (Deluxe)', '2022-03-19', 26),
    ])

    expect(shape(groups)).toEqual([['Afterimage', 'Afterimage (Deluxe)', 'Afterimage (Anniversary Edition)']])
  })

  test('never groups numbered volumes or sequels', () => {
    const groups = groupEditions([
      release('Driftwood Sampler Vol. 1', '2014-04-18', 14, { group: 'compilation' }),
      release('Driftwood Sampler Vol. 2', '2015-04-18', 15, { group: 'compilation' }),
      release('Driftwood Sampler Vol. 3', '2016-04-18', 16, { group: 'compilation' }),
      release('Driftwood Sampler Vol. 3 (Expanded Edition)', '2017-10-06', 20, { group: 'compilation' }),
      release('Night Ferry', '2018-10-12', 11),
      release('Night Ferry II', '2020-10-12', 11),
      release('Night Ferry III', '2022-10-12', 11),
    ])

    expect(shape(groups)).toEqual([
      ['Driftwood Sampler Vol. 1'],
      ['Driftwood Sampler Vol. 2'],
      ['Driftwood Sampler Vol. 3', 'Driftwood Sampler Vol. 3 (Expanded Edition)'],
      ['Night Ferry'],
      ['Night Ferry II'],
      ['Night Ferry III'],
    ])
  })

  test('does not group across release groups or across different artists', () => {
    const groups = groupEditions([
      release('Slow Lightning', '2024-06-07', 13),
      release('Slow Lightning (Deluxe)', '2024-11-15', 16, { group: 'single' }),
      release('Greatest Hits', '2010-01-01', 12, { group: 'appears_on', artist: 'a' }),
      release('Greatest Hits', '2011-01-01', 12, { group: 'appears_on', artist: 'b' }),
    ])

    expect(groups).toHaveLength(4)
  })

  test('keeps the input order, placing each group where its primary was', () => {
    const newestFirst = [
      release('Slow Lightning', '2024-06-07', 13),
      release('Glass Arcade (Deluxe Edition)', '2016-02-05', 17),
      release('Halogen', '2015-06-01', 1),
      release('Glass Arcade', '2015-05-22', 12),
    ]

    expect(shape(groupEditions(newestFirst))).toEqual([['Slow Lightning'], ['Halogen'], ['Glass Arcade', 'Glass Arcade (Deluxe Edition)']])
  })

  test('handles empty input and matches ungrouped when nothing pairs up', () => {
    expect(groupEditions([])).toEqual([])
    const singles = [release('A', '2020-01-01'), release('B', '2021-01-01')]
    expect(groupEditions(singles)).toEqual(ungrouped(singles))
  })
})
