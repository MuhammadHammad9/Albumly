// Requests per minute for the last hour, for the dashboard chart. Each minute is one bucket;
// buckets older than the window are thrown away, so memory never grows.

const MINUTE = 60_000

export function createTimeline({ minutes = 60, now = Date.now } = {}) {
  const buckets = new Map() // minute number → { requests, errors, rateLimited }

  const currentMinute = () => Math.floor(now() / MINUTE)

  function record({ error = false, rateLimited = false } = {}) {
    const minute = currentMinute()
    let bucket = buckets.get(minute)
    if (!bucket) {
      bucket = { requests: 0, errors: 0, rateLimited: 0 }
      buckets.set(minute, bucket)
      // Forget minutes that fell out of the window
      for (const key of buckets.keys()) if (key <= minute - minutes) buckets.delete(key)
    }
    bucket.requests++
    if (error) bucket.errors++
    if (rateLimited) bucket.rateLimited++
  }

  // Oldest first, one entry per minute, empty minutes included as zeros
  function series() {
    const last = currentMinute()
    const rows = []
    for (let minute = last - minutes + 1; minute <= last; minute++) {
      const bucket = buckets.get(minute) ?? { requests: 0, errors: 0, rateLimited: 0 }
      rows.push({ t: new Date(minute * MINUTE).toISOString(), ...bucket })
    }
    return rows
  }

  return { record, series }
}
