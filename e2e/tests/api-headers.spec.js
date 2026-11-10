import { expect, test } from '../fixtures.js'

// Checks the API itself (through the dev proxy), without a browser page

test('health reports the demo catalogue and accounts off', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.ok()).toBe(true)
  const body = await response.json()
  expect(body.status).toBe('ok')
  expect(body.provider).toBe('mock')
  expect(body.accounts).toBeFalsy()
})

test('security headers from helmet are present', async ({ request }) => {
  const response = await request.get('/api/health')
  const headers = response.headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('SAMEORIGIN')
  expect(headers['content-security-policy']).toContain("default-src 'self'")
  expect(headers['x-powered-by']).toBeUndefined()
})

test('errors use the standard envelope', async ({ request }) => {
  const notFound = await request.get('/api/nothing-here')
  expect(notFound.status()).toBe(404)
  expect((await notFound.json()).error).toMatchObject({ code: 'not_found' })

  const badQuery = await request.get('/api/search?q=')
  expect(badQuery.status()).toBe(400)
  expect((await badQuery.json()).error.code).toBe('bad_request')

  // Account routes answer 503 when accounts are not configured
  const library = await request.get('/api/library')
  expect(library.status()).toBe(503)
  expect((await library.json()).error.code).toBe('accounts_unavailable')
})

test('an over-large or broken JSON body is a 4xx, not a crash', async ({ request }) => {
  const broken = await request.put('/api/albums/abc/entry', { headers: { 'content-type': 'application/json' }, data: '{not json' })
  expect(broken.status()).toBeLessThan(500)
})
