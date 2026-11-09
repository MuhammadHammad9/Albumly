import { describe, expect, test } from 'vitest'
import { formatDuration, formatLongDuration, formatReleaseDate, initials, pluralize, releaseTypeLabel } from './format.js'

describe('formatDuration', () => {
  test.each([
    [225000, '3:45'],
    [61000, '1:01'],
    [59499, '0:59'],
    [600000, '10:00'],
  ])('%i ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})

describe('formatLongDuration', () => {
  test.each([
    [43 * 60000, '43 min'],
    [60 * 60000, '1 hr'],
    [73 * 60000, '1 hr 13 min'],
  ])('%i ms -> %s', (ms, expected) => {
    expect(formatLongDuration(ms)).toBe(expected)
  })
})

describe('formatReleaseDate', () => {
  test('shows only as much as the precision allows', () => {
    expect(formatReleaseDate('2021-03-19', 'day')).toBe('Mar 19, 2021')
    expect(formatReleaseDate('2013-11', 'month')).toBe('Nov 2013')
    expect(formatReleaseDate('2022', 'year')).toBe('2022')
  })

  test('does not drift to the previous day in timezones behind UTC', () => {
    expect(formatReleaseDate('2021-01-01', 'day')).toBe('Jan 1, 2021')
  })
})

test('pluralize picks the right form', () => {
  expect(pluralize(1, 'track')).toBe('1 track')
  expect(pluralize(12, 'track')).toBe('12 tracks')
  expect(pluralize(0, 'release')).toBe('0 releases')
})

test('releaseTypeLabel covers known types and falls back safely', () => {
  expect(releaseTypeLabel('ep')).toBe('EP')
  expect(releaseTypeLabel('compilation')).toBe('Compilation')
  expect(releaseTypeLabel('something-new')).toBe('Release')
})

test('initials uses the first two words and skips symbols', () => {
  expect(initials('Neon Harbor')).toBe('NH')
  expect(initials('Kite & Ember')).toBe('KE')
  expect(initials('Rivermouth')).toBe('R')
})
