// Counts every API request in memory for the admin dashboard: totals, status codes, errors,
// 429s, response times, which routes are busy, and the most common searches.
// Mount it early (right after helmet) so requests rejected later, e.g. by the rate limiter,
// are counted too. Everything resets when the server restarts.
import { createLatencyHistogram } from '../services/metrics/latency.js'
import { createTimeline } from '../services/metrics/timeline.js'
import { createTopSearches } from '../services/metrics/topSearches.js'

const OTHER = '(other)'
const MAX_ROUTES = 100 // route patterns are few, but never let this table grow without limit

export function createRequestMetrics({ now = Date.now, searchCapacity = 200 } = {}) {
  const since = now()
  const latency = createLatencyHistogram()
  const timeline = createTimeline({ now })
  const searches = createTopSearches({ capacity: searchCapacity })
  const byStatus = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }
  const routes = new Map() // '/api/artists/:id' → { count, errors }
  let total = 0
  let rateLimited = 0

  function routeStats(label) {
    let entry = routes.get(label)
    if (!entry && routes.size >= MAX_ROUTES) label = OTHER
    entry = routes.get(label)
    if (!entry) {
      entry = { count: 0, errors: 0 }
      routes.set(label, entry)
    }
    return entry
  }

  function middleware(req, res, next) {
    const start = process.hrtime.bigint()

    // Express sets req.route when a route matches. Catching that moment gives the route
    // *pattern* together with its mount path ("/api" + "/artists/:id"), never the real id.
    // (Reading req.baseUrl later is unreliable: Express resets it when an error leaves a router.)
    let label = OTHER
    let route
    Object.defineProperty(req, 'route', {
      configurable: true,
      enumerable: true,
      get: () => route,
      set(value) {
        route = value
        if (value?.path !== undefined) label = `${req.baseUrl}${String(value.path)}`
      },
    })

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6
      const status = res.statusCode
      const isError = status >= 500
      const isRateLimited = status === 429

      total++
      byStatus[`${Math.min(5, Math.max(2, Math.floor(status / 100)))}xx`]++
      if (isRateLimited) rateLimited++
      latency.record(ms)
      timeline.record({ error: isError, rateLimited: isRateLimited })
      const entry = routeStats(label)
      entry.count++
      if (isError) entry.errors++

      // Successful searches only: a rejected query (too long, bad type) is not a real search
      if (label === '/api/search' && req.method === 'GET' && status === 200) searches.record(req.query?.q)
    })
    next()
  }

  // A plain copy of the numbers, for the dashboard report
  function snapshot() {
    return {
      since: new Date(since).toISOString(),
      uptimeSeconds: Math.round((now() - since) / 1000),
      total,
      byStatus: { ...byStatus },
      rateLimited,
      errors: byStatus['5xx'],
      latency: latency.summary(),
      routes: [...routes].map(([route, stats]) => ({ route, ...stats })).sort((a, b) => b.count - a.count || a.route.localeCompare(b.route)),
      timeline: timeline.series(),
      searches,
    }
  }

  return { middleware, snapshot }
}
