import { expect, test, vi } from 'vitest'
import { fakeFetch, fakeTokenService, json } from './fakeSpotify.js'
import { API_BASE, createSpotifyClient } from './spotifyClient.js'

function setup(handler, options = {}) {
  const fetch = fakeFetch(handler)
  const tokenService = fakeTokenService()
  // A fake clock: sleeping moves time forward instantly
  const clock = { time: 0 }
  const sleep = vi.fn(async (ms) => {
    clock.time += ms
  })
  const client = createSpotifyClient({ tokenService, fetch, sleep, random: () => 0, now: () => clock.time, ...options })
  return { client, fetch, sleep, tokenService, clock }
}

test('builds the URL from path and params, skipping undefined ones, and sends the token', async () => {
  let auth
  const { client, fetch } = setup((url, init) => {
    auth = init.headers.Authorization
    return json({ ok: true })
  })

  expect(await client.get('/search', { params: { q: 'neon harbor', type: 'artist', market: undefined } })).toEqual({ ok: true })
  expect(fetch.calls).toEqual([`${API_BASE}/search?q=neon+harbor&type=artist`])
  expect(auth).toBe('Bearer token-0')
})

test('on 429 waits exactly as long as Retry-After says, then retries', async () => {
  let calls = 0
  const { client, sleep } = setup(() => (++calls === 1 ? json({}, { status: 429, headers: { 'Retry-After': '3' } }) : json({ ok: true })))

  expect(await client.get('/artists/x')).toEqual({ ok: true })
  expect(sleep).toHaveBeenCalledWith(3000)
  expect(client.stats()).toMatchObject({ requests: 2, rateLimited: 1, retries: 1 })
})

test('gives up with a 503 rate_limited error when Spotify asks for too long a pause', async () => {
  const { client, sleep } = setup(() => json({}, { status: 429, headers: { 'Retry-After': '120' } }))

  await expect(client.get('/artists/x')).rejects.toMatchObject({ status: 503, code: 'rate_limited', retryAfter: 120 })
  expect(sleep).not.toHaveBeenCalled()
})

test('after a long 429, other requests fail at once without contacting Spotify', async () => {
  const { client, fetch, clock } = setup(() => json({}, { status: 429, headers: { 'Retry-After': '120' } }))

  const id = (letter) => letter.repeat(22)
  await expect(client.get(`/artists/${id('A')}`)).rejects.toMatchObject({ code: 'rate_limited' })
  await expect(client.get(`/artists/${id('B')}`)).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 120 })
  expect(fetch.calls).toHaveLength(1)
  expect(client.stats().shortCircuited).toBe(1)

  clock.time += 120_000 // the cooldown is over, so Spotify is asked again
  await expect(client.get(`/artists/${id('C')}`)).rejects.toMatchObject({ code: 'rate_limited' })
  expect(fetch.calls).toHaveLength(2)
})

test('a block on one endpoint does not stop the others', async () => {
  const { client, fetch } = setup((url) =>
    url.pathname.endsWith('/albums') ? json({}, { status: 429, headers: { 'Retry-After': '86400' } }) : json({ ok: true }),
  )
  const id = 'A'.repeat(22)
  const other = 'B'.repeat(22)

  await expect(client.get(`/artists/${id}/albums`)).rejects.toMatchObject({ code: 'rate_limited' })
  // Same endpoint, different artist: refused without contacting Spotify
  await expect(client.get(`/artists/${other}/albums`, { params: { offset: 10 } })).rejects.toMatchObject({ retryAfter: 86400 })
  // Different endpoints still work
  expect(await client.get(`/artists/${id}`)).toEqual({ ok: true })
  expect(await client.get('/search', { params: { q: 'x' } })).toEqual({ ok: true })

  expect(fetch.calls).toHaveLength(3)
  expect(client.stats().blocked).toEqual({ '/artists/:id/albums': 86400 })
})

test('remembers blocks through blockStorage, so a restart does not hit a banned endpoint', async () => {
  const saved = []
  const blockStorage = { load: () => saved.at(-1) ?? [], save: (map) => saved.push([...map]) }
  const id = 'A'.repeat(22)

  const first = setup(() => json({}, { status: 429, headers: { 'Retry-After': '86400' } }), { blockStorage })
  await expect(first.client.get(`/artists/${id}/albums`)).rejects.toMatchObject({ code: 'rate_limited' })
  expect(saved.at(-1)).toEqual([['/artists/:id/albums', 86_400_000]])

  // A "restarted" client with the same storage refuses without contacting Spotify
  const second = setup(() => json({ ok: true }), { blockStorage })
  await expect(second.client.get(`/artists/${id}/albums`)).rejects.toMatchObject({ code: 'rate_limited' })
  expect(second.fetch.calls).toHaveLength(0)
})

test('a short 429 makes requests already queued wait too, instead of each hitting the limit', async () => {
  let limited = true
  const { client, fetch, sleep } = setup(
    () => {
      if (limited) {
        limited = false
        return json({}, { status: 429, headers: { 'Retry-After': '2' } })
      }
      return json({ ok: true })
    },
    { concurrency: 1 },
  )

  await Promise.all([client.get(`/artists/${'A'.repeat(22)}`), client.get(`/artists/${'B'.repeat(22)}`)])
  expect(fetch.calls).toHaveLength(3) // a (429), a again, b: b never ran into the limit
  expect(sleep).toHaveBeenCalledTimes(1)
  expect(sleep).toHaveBeenCalledWith(2000)
})

test('retries server errors and network failures with growing waits, then gives up', async () => {
  let calls = 0
  const { client, sleep } = setup(() => {
    calls++
    if (calls === 2) throw new TypeError('fetch failed')
    return json({}, { status: 500 })
  })

  await expect(client.get('/artists/x')).rejects.toMatchObject({ status: 502, code: 'upstream_error' })
  expect(calls).toBe(4) // the first try plus three retries
  expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000, 2000])
})

test('on 401 fetches a fresh token once and retries', async () => {
  const { client, tokenService } = setup((url, init) =>
    init.headers.Authorization === 'Bearer token-0' ? json({}, { status: 401 }) : json({ ok: true }),
  )

  expect(await client.get('/artists/x')).toEqual({ ok: true })
  expect(tokenService.invalidations).toBe(1)
})

test('a second 401 in a row is not retried forever', async () => {
  const { client, fetch } = setup(() => json({}, { status: 401 }))

  await expect(client.get('/artists/x')).rejects.toMatchObject({ code: 'spotify_auth_failed' })
  expect(fetch.calls).toHaveLength(2)
})

test('404 and 403 become not_found and forbidden', async () => {
  const { client } = setup((url) => json({}, { status: url.pathname.endsWith('missing') ? 404 : 403 }))

  await expect(client.get('/artists/missing', { notFound: 'Artist' })).rejects.toMatchObject({ status: 404, message: 'Artist not found' })
  await expect(client.get('/artists/secret')).rejects.toMatchObject({ status: 403, code: 'forbidden' })
})

test('never runs more than `concurrency` requests at once', async () => {
  let running = 0
  let peak = 0
  const { client } = setup(
    async () => {
      peak = Math.max(peak, ++running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
      return json({ ok: true })
    },
    { concurrency: 2 },
  )

  await Promise.all(Array.from({ length: 7 }, (_, i) => client.get(`/albums/${i}`)))
  expect(peak).toBe(2)
  expect(client.stats()).toMatchObject({ requests: 7, active: 0, queued: 0 })
})

test('identical requests made at the same time share one call', async () => {
  const { client, fetch } = setup(() => json({ ok: true }))

  await Promise.all([client.get('/artists/x'), client.get('/artists/x'), client.get('/artists/y')])
  expect(fetch.calls).toHaveLength(2)
})

test('follows Spotify paging URLs but refuses any other host', async () => {
  const { client } = setup(() => json({ ok: true }))

  expect(await client.get(`${API_BASE}/albums/x/tracks?offset=50`)).toEqual({ ok: true })
  await expect(client.get('https://evil.example/steal')).rejects.toThrow('non-Spotify URL')
})

test('asks the gate before every real request, and a refusal never reaches Spotify', async () => {
  let allowed = 1
  const refusal = Object.assign(new Error('over the cap'), { status: 429 })
  const gate = () => {
    if (allowed-- <= 0) throw refusal
  }
  const { client, fetch } = setup(() => json({ ok: true }), { gate })

  await client.get('/artists/a')
  await expect(client.get('/artists/b')).rejects.toBe(refusal)
  expect(fetch.calls).toHaveLength(1)
})
