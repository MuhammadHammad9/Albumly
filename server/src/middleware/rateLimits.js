// Per-IP rate limits for our own API, so one visitor cannot flood it (or our Spotify budget).
// Counts are kept in memory, which is fine for a single server.
import { rateLimit } from 'express-rate-limit'
import { ApiError } from '../utils/errors.js'

export const DEFAULT_RATE_LIMITS = {
  general: { windowMs: 5 * 60 * 1000, limit: 300 }, // every /api request
  import: { windowMs: 60 * 60 * 1000, limit: 10 }, // POST /api/library/import
  deleteAccount: { windowMs: 60 * 60 * 1000, limit: 5 }, // DELETE /api/me
  signup: { windowMs: 60 * 60 * 1000, limit: 5 }, // POST /api/auth/signup
}

function limiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Over the limit: the same error envelope as everything else, with the seconds to wait
    handler(req, res, next) {
      const retryAfter = Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000))
      next(new ApiError(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.', { retryAfter }))
    },
  })
}

// settings: false turns limiting off (tests); otherwise the defaults with any overrides
export function createRateLimits(settings = DEFAULT_RATE_LIMITS) {
  const pass = (req, res, next) => next()
  if (settings === false) return { general: pass, import: pass, deleteAccount: pass, signup: pass }
  const merged = { ...DEFAULT_RATE_LIMITS, ...settings }
  return { general: limiter(merged.general), import: limiter(merged.import), deleteAccount: limiter(merged.deleteAccount), signup: limiter(merged.signup) }
}
