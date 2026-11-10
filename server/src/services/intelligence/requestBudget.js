// A daily allowance of Spotify requests for the recommendation, graph and calendar lookups.
// Spotify lets Albumly read artist discographies only ~100 times a day, so these optional
// features get a small, fixed share and can never use up the rest.
//
// `storage` (optional) has the same load/save shape as services/cache/fileStorage.js, so the
// count survives the restarts `node --watch` does on every code change.

export const DEFAULT_DAILY_REQUESTS = 30

// "30" -> 30. Missing, negative or junk -> the default, so the server starts without the setting.
export function dailyLimitFromEnv(value) {
  const number = Number(value)
  return value !== undefined && value !== '' && Number.isInteger(number) && number >= 0 ? number : DEFAULT_DAILY_REQUESTS
}

export function createRequestBudget({ limit = DEFAULT_DAILY_REQUESTS, storage, now = () => new Date() } = {}) {
  const today = () => now().toISOString().slice(0, 10) // the UTC day, e.g. "2026-11-10"

  const saved = new Map(storage?.load() ?? [])
  let day = today()
  let spent = Number(saved.get(day)) || 0

  // A new UTC day starts with nothing spent
  function rollOver() {
    const current = today()
    if (current !== day) {
      day = current
      spent = 0
    }
  }

  return {
    // Is there room for `count` more requests today?
    canSpend(count) {
      rollOver()
      return spent + count <= limit
    },

    spend(count) {
      if (!count) return
      rollOver()
      spent += count
      storage?.save(new Map([[day, spent]]))
    },

    snapshot() {
      rollOver()
      const resetsAt = new Date(`${day}T00:00:00.000Z`)
      resetsAt.setUTCDate(resetsAt.getUTCDate() + 1)
      return { limit, spent, remaining: Math.max(limit - spent, 0), resetsAt: resetsAt.toISOString() }
    },
  }
}
