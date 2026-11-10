// Response times in a fixed set of "buckets" (a histogram). Storing every single duration would
// grow forever; buckets use the same small amount of memory however many requests arrive.
// Percentiles are then approximate: "95 % of requests took at most about this long".

export const BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, Infinity]

export function createLatencyHistogram(bounds = BUCKETS_MS) {
  const counts = new Array(bounds.length).fill(0)
  let count = 0
  let totalMs = 0
  let maxMs = 0

  function record(ms) {
    const value = Math.max(0, ms)
    counts[bounds.findIndex((bound) => value <= bound)]++
    count++
    totalMs += value
    maxMs = Math.max(maxMs, value)
  }

  // The upper edge of the bucket that holds the p-th fraction of requests (never above the max seen)
  function percentile(p) {
    if (count === 0) return 0
    const target = Math.ceil(p * count)
    let seen = 0
    for (let i = 0; i < bounds.length; i++) {
      seen += counts[i]
      if (seen >= target) return Math.round(Math.min(bounds[i], maxMs))
    }
    return Math.round(maxMs)
  }

  function summary() {
    return {
      count,
      avgMs: count === 0 ? 0 : Math.round(totalMs / count),
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: Math.round(maxMs),
    }
  }

  return { record, percentile, summary }
}
