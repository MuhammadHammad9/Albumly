// Formatting for the admin dashboard

// 0.857 → "85.7%"; nothing to divide → "–"
export function formatPercent(ratio) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '–'
  // One decimal at most, and none when it is ".0" (0.9 → "90%")
  return `${Number((ratio * 100).toFixed(1))}%`
}

export const formatMs = (ms) => (typeof ms === 'number' ? `${Math.round(ms).toLocaleString('en')} ms` : '–')

export const formatCount = (n) => (typeof n === 'number' ? n.toLocaleString('en') : '–')

// 3725 → "1 h 2 min"; 42 → "42 s"
export function formatUptime(seconds) {
  if (typeof seconds !== 'number' || seconds < 0) return '–'
  if (seconds < 60) return `${Math.floor(seconds)} s`
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min`
}

// Share of requests that failed on the server (5xx)
export const errorRate = (requests) => (requests?.total ? requests.errors / requests.total : 0)

// Timeline rows → chart rows with a short local time label ("14:05")
export function timelineRows(timeline = []) {
  return timeline.map((row) => {
    const date = new Date(row.t)
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return { time, requests: row.requests, errors: row.errors, rateLimited: row.rateLimited }
  })
}

// { '/artists/:id/albums': 3600 } → [{ endpoint, secondsLeft }], longest first
export const blockedList = (blocked = {}) =>
  Object.entries(blocked)
    .map(([endpoint, secondsLeft]) => ({ endpoint, secondsLeft }))
    .sort((a, b) => b.secondsLeft - a.secondsLeft)
