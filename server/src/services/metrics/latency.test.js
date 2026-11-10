import { expect, test } from 'vitest'
import { createLatencyHistogram } from './latency.js'

test('an empty histogram reports zeros', () => {
  expect(createLatencyHistogram().summary()).toEqual({ count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 })
})

test('percentiles report the upper edge of the right bucket', () => {
  const histogram = createLatencyHistogram()
  for (let i = 0; i < 90; i++) histogram.record(8) // bucket ≤ 10
  for (let i = 0; i < 10; i++) histogram.record(400) // bucket ≤ 500

  const summary = histogram.summary()
  expect(summary.count).toBe(100)
  expect(summary.p50Ms).toBe(10)
  expect(summary.p95Ms).toBe(400) // the bucket edge is 500, but nothing took longer than 400
  expect(summary.maxMs).toBe(400)
  expect(summary.avgMs).toBe(47)
})

test('very slow requests land in the last bucket and report the real maximum', () => {
  const histogram = createLatencyHistogram()
  histogram.record(30_000)
  expect(histogram.percentile(0.95)).toBe(30_000)
})
