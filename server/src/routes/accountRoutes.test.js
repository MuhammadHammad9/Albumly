import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { createApp } from '../app.js'
import { USER_A, USER_B, createTestDatabase, resetTestDatabase } from '../test/testDb.js'
import { entry, startTestApp } from '../test/testApp.js'

let db
let app

beforeAll(async () => {
  process.env.MOCK_DELAY_MS = '0'
  db = await createTestDatabase()
  app = await startTestApp(db)
})
afterAll(async () => {
  await app.close()
  await db.close()
})
beforeEach(() => resetTestDatabase(db))

describe('without account settings (local-only mode)', () => {
  let server
  let baseUrl
  beforeAll(async () => {
    server = createApp().listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`
  })
  afterAll(() => new Promise((resolve) => server.close(resolve)))

  test('account routes answer 503 accounts_unavailable', async () => {
    for (const [method, path] of [['GET', '/api/me'], ['GET', '/api/library'], ['POST', '/api/library/import'], ['PUT', '/api/albums/abc/entry'], ['GET', '/api/collections'], ['DELETE', '/api/collections/x/albums/y']]) {
      const res = await fetch(`${baseUrl}${path}`, { method })
      expect(res.status, `${method} ${path}`).toBe(503)
      expect((await res.json()).error.code).toBe('accounts_unavailable')
    }
  })

  test('the catalogue still works and health does not mention accounts', async () => {
    expect(await (await fetch(`${baseUrl}/api/health`)).json()).toEqual({ status: 'ok', provider: 'mock' })
    expect((await fetch(`${baseUrl}/api/search?q=neon`)).status).toBe(200)
  })
})

test('health says accounts are on when configured', async () => {
  expect((await app.request('GET', '/api/health')).body.accounts).toBe(true)
})

test('responses carry security headers (helmet)', async () => {
  const { headers } = await app.request('GET', '/api/health')
  expect(headers.get('x-content-type-options')).toBe('nosniff')
  expect(headers.get('x-powered-by')).toBeNull()
})

describe('GET /api/me', () => {
  test('needs a token', async () => {
    const { status, body } = await app.request('GET', '/api/me')
    expect(status).toBe(401)
    expect(body.error.code).toBe('unauthorized')
  })

  test('says session_expired for an expired token', async () => {
    const token = await app.sign(USER_A, { expiresIn: Math.floor(Date.now() / 1000) - 10 })
    const { status, body } = await app.request('GET', '/api/me', { token })
    expect(status).toBe(401)
    expect(body.error.code).toBe('session_expired')
  })

  test('returns the user, their profile and library counts', async () => {
    const token = await app.sign(USER_A, { email: 'a@example.com' })
    await app.request('PUT', '/api/albums/x1/entry', { token, body: entry('x1') })

    const { status, body } = await app.request('GET', '/api/me', { token })
    expect(status).toBe(200)
    expect(body.user).toEqual({ id: USER_A, email: 'a@example.com' })
    expect(body.profile.createdAt).toMatch(/Z$/)
    expect(body.counts).toEqual({ albums: 1, collections: 0 })
  })
})

describe('DELETE /api/me', () => {
  test("removes the account and all of its data, and nobody else's", async () => {
    const a = await app.sign(USER_A)
    const b = await app.sign(USER_B)
    await app.request('PUT', '/api/albums/x1/entry', { token: a, body: entry('x1') })
    await app.request('POST', '/api/collections', { token: a, body: { id: 'c1', name: 'Mine', createdAt: entry('x').addedAt, updatedAt: entry('x').addedAt } })
    await app.request('PUT', '/api/albums/x1/entry', { token: b, body: entry('x1') })

    expect((await app.request('DELETE', '/api/me', { token: a })).status).toBe(204)

    expect(app.admin.deleted).toEqual([USER_A])
    expect((await db.query('select user_id from library_entries')).rows).toEqual([{ user_id: USER_B }])
    expect((await db.query('select * from collections')).rows).toEqual([])
    expect((await db.query('select id from auth.users')).rows).toEqual([{ id: USER_B }])
  })

  test('when Supabase fails to delete the account, the data is gone and a retry finishes the job', async () => {
    let failures = 1
    const flaky = await startTestApp(db, {
      authAdmin: {
        async deleteUser(id) {
          if (failures-- > 0) throw new Error('down')
          await db.query('delete from auth.users where id = $1', [id])
        },
      },
    })
    try {
      const token = await flaky.sign(USER_A)
      await flaky.request('PUT', '/api/albums/x1/entry', { token, body: entry('x1') })

      const first = await flaky.request('DELETE', '/api/me', { token })
      expect(first.status).toBe(502)
      expect(first.body.error.code).toBe('account_delete_failed')
      expect((await db.query('select * from library_entries')).rows).toEqual([])

      expect((await flaky.request('DELETE', '/api/me', { token })).status).toBe(204)
      expect((await db.query('select id from auth.users where id = $1', [USER_A])).rows).toEqual([])
    } finally {
      await flaky.close()
    }
  })
})

describe('protection', () => {
  let limited
  beforeAll(async () => {
    limited = await startTestApp(db, { rateLimits: { general: { windowMs: 60_000, limit: 2 } } })
  })
  afterAll(() => limited.close())

  test('too many requests from one address get a 429 in the usual error shape', async () => {
    await limited.request('GET', '/api/health')
    await limited.request('GET', '/api/health')
    const { status, body, headers } = await limited.request('GET', '/api/health')
    expect(status).toBe(429)
    expect(body.error.code).toBe('rate_limited')
    expect(body.error.retryAfter).toBeGreaterThan(0)
    expect(headers.get('retry-after')).toBe(String(body.error.retryAfter))
  })

  test('a body that is too large is refused with 413, broken JSON with 400', async () => {
    const token = await app.sign(USER_A)
    const big = await app.request('PUT', '/api/albums/x1/entry', { token, body: entry('x1', { review: 'x'.repeat(200_000) }) })
    expect(big.status).toBe(413)
    expect(big.body.error.code).toBe('payload_too_large')

    const broken = await app.request('PUT', '/api/albums/x1/entry', { token, rawBody: '{"album":' })
    expect(broken.status).toBe(400)
    expect(broken.body.error.code).toBe('bad_request')
  })
})
