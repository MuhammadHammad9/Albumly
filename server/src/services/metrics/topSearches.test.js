import { expect, test } from 'vitest'
import { createTopSearches, normaliseQuery } from './topSearches.js'

test('normalises case, spacing and full-width characters', () => {
  expect(normaliseQuery('  Daft   PUNK ')).toBe('daft punk')
  expect(normaliseQuery('Ｒａｄｉｏｈｅａｄ')).toBe('radiohead')
})

test('drops anything that looks like personal data, and empty or very long queries', () => {
  expect(normaliseQuery('me@example.com')).toBeNull()
  expect(normaliseQuery('https://example.com/x')).toBeNull()
  expect(normaliseQuery('www.example.com')).toBeNull()
  expect(normaliseQuery('call 0300 1234567')).toBeNull()
  expect(normaliseQuery('   ')).toBeNull()
  expect(normaliseQuery('a'.repeat(61))).toBeNull()
  expect(normaliseQuery(undefined)).toBeNull()
  expect(normaliseQuery(['array'])).toBeNull()
  // Short numbers are normal in music: "1989", "21", "blink-182"
  expect(normaliseQuery('1989')).toBe('1989')
})

test('only shows queries searched at least minCount times', () => {
  const searches = createTopSearches()
  for (let i = 0; i < 3; i++) searches.record('Daft Punk')
  searches.record('daft punk ')
  searches.record('my unusual search')
  searches.record('my unusual search')

  expect(searches.top({ minCount: 3 })).toEqual([{ query: 'daft punk', count: 4 }])
  expect(searches.top({ minCount: 1 })).toHaveLength(2)
  expect(searches.stats()).toEqual({ tracked: 2, total: 6 })
})

test('never tracks more than its capacity, and frequent queries survive', () => {
  const searches = createTopSearches({ capacity: 5 })
  for (let round = 0; round < 50; round++) {
    searches.record('popular')
    searches.record(`rare ${round}`)
  }

  expect(searches.stats().tracked).toBe(5)
  expect(searches.top({ limit: 1, minCount: 3 })).toEqual([{ query: 'popular', count: 50 }])
})

test('a newcomer that inherited a count is not shown until it is certain', () => {
  const searches = createTopSearches({ capacity: 2 })
  for (let i = 0; i < 4; i++) searches.record('a')
  for (let i = 0; i < 4; i++) searches.record('b')
  searches.record('c') // replaces a count-4 entry, so its count is 5 but only 1 is certain

  expect(searches.top({ minCount: 3 }).map((row) => row.query)).not.toContain('c')
})
