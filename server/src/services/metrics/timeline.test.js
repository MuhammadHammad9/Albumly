import { expect, test } from 'vitest'
import { createTimeline } from './timeline.js'

const MINUTE = 60_000

test('counts per minute, oldest first, with empty minutes as zeros', () => {
  const clock = { time: 10 * MINUTE }
  const timeline = createTimeline({ minutes: 3, now: () => clock.time })

  timeline.record()
  timeline.record({ error: true })
  clock.time += 2 * MINUTE
  timeline.record({ rateLimited: true })

  expect(timeline.series()).toEqual([
    { t: new Date(10 * MINUTE).toISOString(), requests: 2, errors: 1, rateLimited: 0 },
    { t: new Date(11 * MINUTE).toISOString(), requests: 0, errors: 0, rateLimited: 0 },
    { t: new Date(12 * MINUTE).toISOString(), requests: 1, errors: 0, rateLimited: 1 },
  ])
})

test('forgets minutes older than the window', () => {
  const clock = { time: 0 }
  const timeline = createTimeline({ minutes: 2, now: () => clock.time })
  timeline.record()
  clock.time = 5 * MINUTE
  timeline.record()

  const series = timeline.series()
  expect(series).toHaveLength(2)
  expect(series.reduce((sum, row) => sum + row.requests, 0)).toBe(1)
})
