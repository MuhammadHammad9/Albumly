import { ApiError, badRequest, notFound } from '../../utils/errors.js'

// Every call to the Spotify Web API goes through here. It adds the access token and
//  - limits how many requests run at once (a queue), so a big discography cannot flood Spotify
//  - shares one request between identical calls made at the same time
//  - waits as long as Spotify asks on 429 (rate limited), then tries again
//  - backs off and retries when Spotify or the network fails (5xx)
//  - fetches a fresh token once on 401
// and turns everything else into an ApiError the rest of the server understands.

export const API_BASE = 'https://api.spotify.com/v1'
const MAX_RETRY_AFTER_S = 30 // if Spotify wants a longer pause, tell the user instead of hanging the request

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createSpotifyClient({
  tokenService,
  fetch = globalThis.fetch,
  concurrency = 4,
  maxRetries = 3,
  sleep = defaultSleep,
  random = Math.random,
  now = Date.now,
  blockStorage,
  gate, // optional: called before every real request to Spotify; throws to refuse it (see upstreamBudget.js)
}) {
  const counters = { requests: 0, retries: 0, rateLimited: 0, shortCircuited: 0, failures: 0, totalLatencyMs: 0 }
  const inFlight = new Map() // url -> promise, for de-duplication

  // When Spotify answers 429, the limit covers that whole endpoint for the app, not one URL.
  // The live spike showed limits are per endpoint: /artists/{id}/albums was blocked for 24 hours
  // while /search kept working. So until the time passes, requests to the same endpoint wait (or
  // fail without contacting Spotify, since hammering only extends the ban); other endpoints carry on.
  // `blockStorage` (optional, same load/save shape as the cache's file storage) remembers blocks
  // across restarts, so a restarted server does not walk straight back into a 24-hour ban.
  const blockedUntil = new Map((blockStorage?.load() ?? []).filter(([, until]) => until > now()))

  // '/v1/artists/4Z8W4fKeB5YxbusRsdQVPb/albums?offset=10' -> '/artists/:id/albums'
  const endpointOf = (url) => new URL(url).pathname.replace(/^\/v1/, '').replace(/\/[A-Za-z0-9]{22}(?=\/|$)/g, '/:id')

  const rateLimitedError = (retryAfter) =>
    new ApiError(503, 'rate_limited', 'Albumly is getting too many requests right now', { retryAfter })

  // ---- Concurrency limiter: at most `concurrency` requests in flight, the rest wait in line ----
  let active = 0
  const waiting = []

  function acquire() {
    if (active < concurrency) {
      active++
      return Promise.resolve()
    }
    return new Promise((resolve) => waiting.push(resolve))
  }

  function release() {
    const next = waiting.shift()
    // Hand the slot straight to the next in line; `active` stays the same, so nobody can jump the queue
    if (next) next()
    else active--
  }

  // Exponential backoff with jitter: ~0.5s, 1s, 2s... plus randomness so retries do not arrive in lockstep
  const backoff = (attempt) => 500 * 2 ** attempt + random() * 250

  function errorFor(status, notFoundLabel) {
    if (status === 400) return badRequest('Spotify rejected the request')
    if (status === 401) return new ApiError(502, 'spotify_auth_failed', 'Spotify rejected the access token')
    if (status === 403) return new ApiError(403, 'forbidden', "Spotify does not allow Albumly's app to access this")
    if (status === 404) return notFound(notFoundLabel)
    return new ApiError(502, 'upstream_error', `Spotify returned an unexpected error (HTTP ${status})`)
  }

  async function send(url, notFoundLabel) {
    let refreshedToken = false
    const endpoint = endpointOf(url)

    for (let attempt = 0; ; attempt++) {
      const waitMs = (blockedUntil.get(endpoint) ?? 0) - now()
      if (waitMs > 0) {
        const retryAfter = Math.ceil(waitMs / 1000)
        if (retryAfter > MAX_RETRY_AFTER_S || attempt > maxRetries) {
          counters.shortCircuited++
          counters.failures++
          throw rateLimitedError(retryAfter)
        }
        await sleep(waitMs)
      }

      // Our own cap on Spotify requests (per visitor and overall). Retries count too.
      gate?.()

      const token = await tokenService.getToken()
      const started = now()
      counters.requests++

      let response = null
      try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      } catch {
        // Network failure: handled like a 5xx below
      }
      counters.totalLatencyMs += now() - started

      if (response?.ok) return response.json()
      const status = response?.status ?? 0

      if (status === 401 && !refreshedToken) {
        refreshedToken = true
        tokenService.invalidate()
        continue
      }

      if (status === 429) {
        counters.rateLimited++
        const retryAfter = Number(response.headers.get('Retry-After')) || 1
        blockedUntil.set(endpoint, Math.max(blockedUntil.get(endpoint) ?? 0, now() + retryAfter * 1000))
        blockStorage?.save(blockedUntil)
        if (attempt >= maxRetries || retryAfter > MAX_RETRY_AFTER_S) {
          counters.failures++
          throw rateLimitedError(retryAfter)
        }
        counters.retries++
        continue // the cooldown check at the top of the loop does the waiting
      }

      if (status === 0 || status >= 500) {
        if (attempt >= maxRetries) {
          counters.failures++
          throw new ApiError(502, 'upstream_error', 'Spotify is not responding')
        }
        counters.retries++
        await sleep(backoff(attempt))
        continue
      }

      counters.failures++
      throw errorFor(status, notFoundLabel)
    }
  }

  function buildUrl(pathOrUrl, params) {
    // Spotify's paging responses include a ready-made `next` URL; only follow ones that point back at the API
    if (pathOrUrl.startsWith('https://')) {
      if (!pathOrUrl.startsWith(`${API_BASE}/`)) throw new Error(`Refusing to call a non-Spotify URL: ${pathOrUrl}`)
      return pathOrUrl
    }
    const query = params ? `?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined))}` : ''
    return `${API_BASE}${pathOrUrl}${query}`
  }

  return {
    // get('/artists/123') or get(nextUrlFromAPagingObject)
    async get(pathOrUrl, { params, notFound: notFoundLabel = 'Item' } = {}) {
      const url = buildUrl(pathOrUrl, params)
      if (inFlight.has(url)) return inFlight.get(url)

      const promise = (async () => {
        await acquire()
        try {
          return await send(url, notFoundLabel)
        } finally {
          release()
          inFlight.delete(url)
        }
      })()
      inFlight.set(url, promise)
      return promise
    },

    stats() {
      // Endpoints Spotify is currently refusing, and for how many more seconds
      const blocked = Object.fromEntries(
        [...blockedUntil].filter(([, until]) => until > now()).map(([endpoint, until]) => [endpoint, Math.ceil((until - now()) / 1000)]),
      )
      return {
        ...counters,
        blocked,
        averageLatencyMs: counters.requests === 0 ? 0 : Math.round(counters.totalLatencyMs / counters.requests),
        active,
        queued: waiting.length,
      }
    },
  }
}
