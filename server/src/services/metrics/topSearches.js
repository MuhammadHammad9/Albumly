// Counts the most common search queries for the admin dashboard, while keeping as little as
// possible: only the cleaned-up query text and a count. No IP, user, time or filters.
//
// Memory stays bounded with the Space-Saving algorithm: at most `capacity` queries are tracked.
// When a new query arrives and the table is full, the query with the smallest count is replaced,
// and the newcomer inherits that count (+1). `error` remembers how much of a count may be
// inherited, so `count - error` is a number we are sure of. Frequent queries always stay in.

const MAX_LENGTH = 60

// Lowercase, trimmed, inner spaces collapsed. Returns null for anything that looks like personal
// data (an email address, a web address, or a long run of digits such as a phone number).
export function normaliseQuery(raw) {
  if (typeof raw !== 'string') return null
  const query = raw.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!query || query.length > MAX_LENGTH) return null
  if (query.includes('@') || query.includes('://') || query.startsWith('www.') || /\d{5,}/.test(query)) return null
  return query
}

export function createTopSearches({ capacity = 200 } = {}) {
  const counts = new Map() // query → { count, error }
  let total = 0

  function record(rawQuery) {
    const query = normaliseQuery(rawQuery)
    if (!query) return false
    total++

    const existing = counts.get(query)
    if (existing) {
      existing.count++
      return true
    }
    if (counts.size < capacity) {
      counts.set(query, { count: 1, error: 0 })
      return true
    }

    // Full: replace the smallest entry. A linear scan is fine for a few hundred entries.
    let smallestKey
    let smallest
    for (const [key, value] of counts) {
      if (!smallest || value.count < smallest.count) [smallestKey, smallest] = [key, value]
    }
    counts.delete(smallestKey)
    counts.set(query, { count: smallest.count + 1, error: smallest.count })
    return true
  }

  // The `limit` most searched queries that were certainly searched at least `minCount` times.
  // The threshold means one person's unusual search never shows up on the dashboard.
  function top({ limit = 10, minCount = 3 } = {}) {
    return [...counts]
      .filter(([, { count, error }]) => count - error >= minCount)
      .sort(([a, x], [b, y]) => y.count - x.count || a.localeCompare(b))
      .slice(0, limit)
      .map(([query, { count }]) => ({ query, count }))
  }

  return { record, top, stats: () => ({ tracked: counts.size, total }) }
}
