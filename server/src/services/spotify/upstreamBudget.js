// A cap on how many Spotify requests Albumly makes, per visitor and in total.
//
// Why: Spotify's allowance for the whole app is small, and going over it gets an endpoint
// blocked for up to a day. Answers are cached, but anyone can ask for things that are not cached
// yet (random searches, random artist ids), and each of those costs real Spotify requests. Without
// a cap, one person with a loop could spend the allowance and take the live catalogue down for
// everybody. The general per-IP limit counts API calls, not Spotify requests: one cold artist
// page can cost dozens.
//
// How: the middleware remembers which visitor a request belongs to (AsyncLocalStorage carries
// that through every await). The Spotify client calls gate() just before each real request to
// Spotify. Cached answers never reach the gate, so they stay free and unlimited.
import { AsyncLocalStorage } from 'node:async_hooks'
import { ApiError } from '../../utils/errors.js'

const MINUTE = 60 * 1000
export const DEFAULT_UPSTREAM_LIMITS = {
  perVisitor: { windowMs: 10 * MINUTE, limit: 120 }, // a few big, never-seen artists
  overall: { windowMs: 10 * MINUTE, limit: 600 }, // everyone together
}
const MAX_TRACKED_VISITORS = 10_000

const positiveInt = (value, fallback) => (/^\d+$/.test(String(value ?? '').trim()) && Number(value) > 0 ? Number(value) : fallback)

// SPOTIFY_REQUESTS_PER_VISITOR and SPOTIFY_REQUESTS_OVERALL (per 10 minutes) override the defaults
export function upstreamLimitsFromEnv(env = process.env) {
  return {
    perVisitor: { ...DEFAULT_UPSTREAM_LIMITS.perVisitor, limit: positiveInt(env.SPOTIFY_REQUESTS_PER_VISITOR, DEFAULT_UPSTREAM_LIMITS.perVisitor.limit) },
    overall: { ...DEFAULT_UPSTREAM_LIMITS.overall, limit: positiveInt(env.SPOTIFY_REQUESTS_OVERALL, DEFAULT_UPSTREAM_LIMITS.overall.limit) },
  }
}

export function createUpstreamBudget({ perVisitor = DEFAULT_UPSTREAM_LIMITS.perVisitor, overall = DEFAULT_UPSTREAM_LIMITS.overall, now = Date.now } = {}) {
  const context = new AsyncLocalStorage()
  const visitors = new Map() // visitor → { count, resetAt }
  let total = { count: 0, resetAt: 0 }
  const counters = { refusedVisitor: 0, refusedOverall: 0 }

  const fresh = (windowMs) => ({ count: 0, resetAt: now() + windowMs })
  const secondsLeft = (window) => Math.max(1, Math.ceil((window.resetAt - now()) / 1000))

  function refuse(window, message) {
    return new ApiError(429, 'rate_limited', message, { retryAfter: secondsLeft(window) })
  }

  function visitorWindow(key) {
    let window = visitors.get(key)
    if (!window || window.resetAt <= now()) {
      // Never let the table grow without limit: drop finished windows first, then the oldest
      if (visitors.size >= MAX_TRACKED_VISITORS) {
        for (const [other, { resetAt }] of visitors) if (resetAt <= now()) visitors.delete(other)
        if (visitors.size >= MAX_TRACKED_VISITORS) visitors.delete(visitors.keys().next().value)
      }
      window = fresh(perVisitor.windowMs)
      visitors.set(key, window)
    }
    return window
  }

  return {
    // Express middleware: everything the request does from here on belongs to this visitor
    middleware(req, res, next) {
      context.run({ visitor: req.ip ?? 'unknown' }, next)
    },

    // Called before each real request to Spotify. Throws a 429 when a cap is reached.
    // Work that belongs to no visitor (none today) is held to the overall cap only.
    gate() {
      if (total.resetAt <= now()) total = fresh(overall.windowMs)
      const visitor = context.getStore()?.visitor
      const own = visitor === undefined ? null : visitorWindow(visitor)

      if (own && own.count >= perVisitor.limit) {
        counters.refusedVisitor++
        throw refuse(own, 'You have looked up a lot of new music in a short time. Pages you have already visited still work.')
      }
      if (total.count >= overall.limit) {
        counters.refusedOverall++
        throw refuse(total, 'Albumly is getting too many requests right now')
      }
      total.count++
      if (own) own.count++
    },

    stats: () => ({ ...counters, overallUsed: total.resetAt > now() ? total.count : 0, overallLimit: overall.limit, visitorLimit: perVisitor.limit }),
  }
}

// The one budget the running server uses (the Spotify client and the app share it)
export const upstreamBudget = createUpstreamBudget(upstreamLimitsFromEnv())
