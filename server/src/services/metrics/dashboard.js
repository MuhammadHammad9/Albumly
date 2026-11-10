// Builds the body of GET /api/admin/metrics from our own request counters and the catalogue
// provider's stats (cache and Spotify counters that already exist). Reading these makes no
// Spotify request. The demo (mock) provider has no stats, so those parts are null.

export const MIN_SEARCH_COUNT = 3

export function buildMetricsReport({ metrics, provider, minSearchCount = MIN_SEARCH_COUNT, topRoutes = 15, topSearches = 10 }) {
  const snap = metrics.snapshot()
  const stats = provider?.stats?.() ?? {}

  return {
    since: snap.since,
    uptimeSeconds: snap.uptimeSeconds,
    provider: provider?.name ?? 'unknown',
    requests: {
      total: snap.total,
      byStatus: snap.byStatus,
      rateLimited: snap.rateLimited,
      errors: snap.errors,
      latency: snap.latency,
      topRoutes: snap.routes.slice(0, topRoutes),
    },
    timeline: snap.timeline,
    spotify: stats.spotify ? spotifySummary(stats.spotify) : null,
    cache: stats.cache ? cacheSummary(stats.cache) : null,
    topSearches: snap.searches.top({ limit: topSearches, minCount: minSearchCount }),
    searches: { ...snap.searches.stats(), minCount: minSearchCount },
  }
}

// Only the fields the dashboard shows (the client's internal fields stay internal)
function spotifySummary(spotify) {
  return {
    requests: spotify.requests ?? 0,
    retries: spotify.retries ?? 0,
    rateLimited: spotify.rateLimited ?? 0,
    failures: spotify.failures ?? 0,
    shortCircuited: spotify.shortCircuited ?? 0,
    averageLatencyMs: spotify.averageLatencyMs ?? 0,
    blocked: spotify.blocked ?? {},
  }
}

// hits / (hits + misses); a "shared" lookup waited for a request already running, so it saved a call too
function cacheSummary(cache) {
  const hits = cache.hits ?? 0
  const shared = cache.shared ?? 0
  const misses = cache.misses ?? 0
  const lookups = hits + shared + misses
  return { hits, shared, misses, size: cache.size ?? 0, hitRate: lookups === 0 ? 0 : Number(((hits + shared) / lookups).toFixed(3)) }
}
