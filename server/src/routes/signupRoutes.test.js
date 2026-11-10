import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { createTestDatabase, resetTestDatabase } from '../test/testDb.js'
import { startTestApp } from '../test/testApp.js'

// POST /api/auth/signup: accounts created already confirmed (SIGNUP_EMAIL_CONFIRMATION=off)

const NEW_ID = '00000000-0000-4000-8000-0000000000aa'
let db

function fakeAdmin() {
  const admin = {
    created: [],
    confirmed: [],
    async createConfirmedUser(email, password) {
      const { rows } = await db.query('select id from auth.users where lower(email) = $1', [email])
      if (rows.length) return { exists: true }
      admin.created.push({ email, password })
      await db.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())', [NEW_ID, email])
      return { id: NEW_ID }
    },
    async confirmUser(id, password) {
      admin.confirmed.push({ id, password })
    },
    async deleteUser() {},
  }
  return admin
}

beforeAll(async () => {
  process.env.MOCK_DELAY_MS = '0'
  db = await createTestDatabase()
})
afterAll(() => db.close())
beforeEach(() => resetTestDatabase(db))

describe('with instant sign-up on', () => {
  let app
  let admin
  beforeEach(async () => {
    admin = fakeAdmin()
    app = await startTestApp(db, { authAdmin: admin, instantSignup: true })
  })
  afterAll(() => app?.close())

  test('creates a confirmed account, with the email trimmed and lowercased', async () => {
    const { status, body } = await app.request('POST', '/api/auth/signup', { body: { email: ' New@Example.com ', password: 'long-enough-1' } })
    expect(status).toBe(201)
    expect(body).toEqual({ ok: true })
    expect(admin.created).toEqual([{ email: 'new@example.com', password: 'long-enough-1' }])
    await app.close()
  })

  test('rejects a bad email or a short password before calling Supabase', async () => {
    for (const body of [{ email: 'nope', password: 'long-enough-1' }, { email: 'x@example.com', password: 'short' }, {}]) {
      const res = await app.request('POST', '/api/auth/signup', { body })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('invalid_signup')
    }
    expect(admin.created).toEqual([])
    await app.close()
  })

  test('finishes an earlier sign-up that was never confirmed or used', async () => {
    await db.query("insert into auth.users (id, email) values ($1, 'stuck@example.com')", [NEW_ID])
    const { status } = await app.request('POST', '/api/auth/signup', { body: { email: 'stuck@example.com', password: 'long-enough-1' } })
    expect(status).toBe(201)
    expect(admin.confirmed).toEqual([{ id: NEW_ID, password: 'long-enough-1' }])
    await app.close()
  })

  test('refuses an email that belongs to a confirmed account, without changing it', async () => {
    // a@example.com is a confirmed test user
    await db.query("update auth.users set email_confirmed_at = now() where email = 'a@example.com'")
    const { status, body } = await app.request('POST', '/api/auth/signup', { body: { email: 'a@example.com', password: 'long-enough-1' } })
    expect(status).toBe(409)
    expect(body.error.code).toBe('user_already_exists')
    expect(admin.confirmed).toEqual([])
    await app.close()
  })

  test('refuses an unconfirmed account that has already been signed in to', async () => {
    await db.query("insert into auth.users (id, email, last_sign_in_at) values ($1, 'used@example.com', now())", [NEW_ID])
    const { status } = await app.request('POST', '/api/auth/signup', { body: { email: 'used@example.com', password: 'long-enough-1' } })
    expect(status).toBe(409)
    expect(admin.confirmed).toEqual([])
    await app.close()
  })
})

test('without the setting the route does not exist, so the browser uses Supabase email sign-up', async () => {
  const app = await startTestApp(db, { authAdmin: fakeAdmin() })
  const { status } = await app.request('POST', '/api/auth/signup', { body: { email: 'x@example.com', password: 'long-enough-1' } })
  expect(status).toBe(404)
  await app.close()
})

test('sign-ups are rate limited per address', async () => {
  const app = await startTestApp(db, { authAdmin: fakeAdmin(), instantSignup: true, rateLimits: { signup: { windowMs: 60_000, limit: 2 } } })
  const statuses = []
  for (let i = 0; i < 3; i++) statuses.push((await app.request('POST', '/api/auth/signup', { body: { email: 'bad', password: 'x' } })).status)
  expect(statuses).toEqual([400, 400, 429])
  await app.close()
})
