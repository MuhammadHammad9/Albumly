import { expect, test } from 'vitest'
import { buildCalendar, collectReleases, releaseYears, upcomingAndRecent } from './calendar.js'
import { KNOWN_ARTISTS, release } from './intelligenceFixtures.js'

test('collects every release once and remembers whose list it came from', () => {
  const all = collectReleases(KNOWN_ARTISTS)
  const velvet = all.find((r) => r.id === 'm2')
  expect(velvet.via).toEqual(['Neon Harbor', 'Mara Voss'])
  expect(all.filter((r) => r.id === 'k3').length).toBe(1)
})

test('years newest first', () => {
  expect(releaseYears(collectReleases(KNOWN_ARTISTS)).slice(0, 3)).toEqual([2023, 2022, 2021])
})

test('a year view: by month, unknown days last, year-only releases on their own', () => {
  const A = [{ id: 'a', name: 'A' }]
  const calendar = buildCalendar(
    [
      release('d1', 'Day 20', '2024-06-20', A),
      release('d2', 'Day 3', '2024-06-03', A),
      release('m', 'June Sometime', '2024-06', A),
      release('y', 'Sometime 2024', '2024', A),
      release('old', 'Other Year', '2023-06-01', A),
    ],
    2024,
  )
  expect(calendar.total).toBe(4)
  expect(calendar.months[5].label).toBe('June')
  expect(calendar.months[5].releases.map((r) => [r.name, r.day])).toEqual([
    ['Day 3', 3],
    ['Day 20', 20],
    ['June Sometime', null],
  ])
  expect(calendar.yearOnly.map((r) => r.id)).toEqual(['y'])
  expect(calendar.months[0].releases).toEqual([])
})

test('upcoming and recent releases around today', () => {
  const A = [{ id: 'a', name: 'A' }]
  const list = [release('f', 'Future', '2026-12-01', A), release('r', 'Recent', '2026-10-01', A), release('o', 'Old', '2025-01-01', A), release('y', 'Year', '2026', A)]
  const { upcoming, recent } = upcomingAndRecent(list, '2026-11-10')
  expect(upcoming.map((r) => r.id)).toEqual(['f'])
  expect(recent.map((r) => r.id)).toEqual(['r'])
})
