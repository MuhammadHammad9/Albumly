// Extra per-IP limits for community actions, on top of the general /api limit. They stop one
// visitor from flooding battles, votes or reports. Same 429 envelope as the rest of the API.
import { rateLimit } from 'express-rate-limit'
import { ApiError } from '../../utils/errors.js'

const HOUR = 60 * 60 * 1000

export const DEFAULT_COMMUNITY_LIMITS = {
  battleCreate: { windowMs: HOUR, limit: 20 },
  vote: { windowMs: HOUR, limit: 120 },
  report: { windowMs: HOUR, limit: 20 },
}

function limiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res, next) {
      const retryAfter = Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000))
      next(new ApiError(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.', { retryAfter }))
    },
  })
}

// settings: false turns limiting off (tests); an object overrides some of the defaults
export function createCommunityLimits(settings) {
  const names = Object.keys(DEFAULT_COMMUNITY_LIMITS)
  if (settings === false) return Object.fromEntries(names.map((name) => [name, (req, res, next) => next()]))
  const merged = { ...DEFAULT_COMMUNITY_LIMITS, ...settings }
  return Object.fromEntries(names.map((name) => [name, limiter(merged[name])]))
}
