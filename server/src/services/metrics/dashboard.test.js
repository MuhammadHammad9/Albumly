import { expect, test } from 'vitest'
import { createRequestMetrics } from '../../middleware/requestMetrics.js'
import { buildMetricsReport } from './dashboard.js'

const spotifyProvider = {
  name: 'spotify',
  stats: () => ({
    cache: { hits: 6, shared: 2, misses: 2, size: 40, hitRate: 0.8 },
    spotify: { requests: 12, retries: 1, rateLimited: 1, failures: 0, shortCircuited: 3, totalLatencyMs: 1200, averageLatencyMs: 100, blocked: { '/artists/:id/albums': 3600 }, active: 0, queued: 0 },
  }),
}

test('combines request counters with Spotify and cache stats', () => {
  const metrics = createRequestMetrics({ now: () => Date.UTC(2026, 10, 10, 12) })
  const report = buildMetricsReport({ metrics, provider: spotifyProvider })

  expect(report.provider).toBe('spotify')
  expect(report.requests.total).toBe(0)
  expect(report.timeline).toHaveLength(60)
  expect(report.cache).toEqual({ hits: 6, shared: 2, misses: 2, size: 40, hitRate: 0.8 })
  expect(report.spotify).toEqual({ requests: 12, retries: 1, rateLimited: 1, failures: 0, shortCircuited: 3, averageLatencyMs: 100, blocked: { '/artists/:id/albums': 3600 } })
  expect(report.searches).toEqual({ tracked: 0, total: 0, minCount: 3 })
})

test('the demo provider has no stats, so those parts are null', () => {
  const report = buildMetricsReport({ metrics: createRequestMetrics(), provider: { name: 'mock' } })
  expect(report.provider).toBe('mock')
  expect(report.spotify).toBeNull()
  expect(report.cache).toBeNull()
})

test('top searches respect the minimum count', () => {
  const metrics = createRequestMetrics()
  const { searches } = metrics.snapshot()
  for (let i = 0; i < 3; i++) searches.record('daft punk')
  searches.record('once only')

  expect(buildMetricsReport({ metrics, provider: { name: 'mock' } }).topSearches).toEqual([{ query: 'daft punk', count: 3 }])
})
