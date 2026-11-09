import { expect, test } from 'vitest'
import { fakeFetch, json } from './fakeSpotify.js'
import { createTokenService } from './tokenService.js'

function setup(handler) {
  const clock = { time: 0 }
  let issued = 0
  const fetch = fakeFetch(handler ?? (() => json({ access_token: `tok-${++issued}`, expires_in: 3600 })))
  const tokens = createTokenService({ clientId: 'id', clientSecret: 'secret', fetch, now: () => clock.time })
  return { clock, fetch, tokens }
}

test('sends the client ID and secret as Basic auth, and reuses the token', async () => {
  let authHeader
  const { fetch, tokens } = setup((url, init) => {
    authHeader = init.headers.Authorization
    return json({ access_token: 'tok', expires_in: 3600 })
  })

  expect(await tokens.getToken()).toBe('tok')
  expect(await tokens.getToken()).toBe('tok')
  expect(fetch.calls).toHaveLength(1)
  expect(authHeader).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`)
})

test('renews the token a minute before it expires', async () => {
  const { clock, tokens } = setup()

  expect(await tokens.getToken()).toBe('tok-1')
  clock.time = (3600 - 61) * 1000
  expect(await tokens.getToken()).toBe('tok-1')
  clock.time = (3600 - 60) * 1000
  expect(await tokens.getToken()).toBe('tok-2')
})

test('many callers at once share one token request', async () => {
  const { fetch, tokens } = setup()

  const results = await Promise.all([tokens.getToken(), tokens.getToken(), tokens.getToken()])
  expect(results).toEqual(['tok-1', 'tok-1', 'tok-1'])
  expect(fetch.calls).toHaveLength(1)
})

test('invalidate forces a new token on the next call', async () => {
  const { tokens } = setup()

  await tokens.getToken()
  tokens.invalidate()
  expect(await tokens.getToken()).toBe('tok-2')
})

test('rejected credentials become a clear spotify_auth_failed error', async () => {
  const { tokens } = setup(() => json({ error: 'invalid_client' }, { status: 400 }))

  await expect(tokens.getToken()).rejects.toMatchObject({ status: 502, code: 'spotify_auth_failed' })
})

test('a network failure becomes an upstream_error, and the next call retries', async () => {
  let fail = true
  const { tokens } = setup(() => {
    if (fail) throw new TypeError('fetch failed')
    return json({ access_token: 'tok', expires_in: 3600 })
  })

  await expect(tokens.getToken()).rejects.toMatchObject({ code: 'upstream_error' })
  fail = false
  expect(await tokens.getToken()).toBe('tok')
})
