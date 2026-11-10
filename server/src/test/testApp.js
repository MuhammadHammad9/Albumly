// Starts the real Express app on a free port with test stand-ins for Supabase:
// PGlite for the database, an in-memory key pair for tokens, and a fake Admin API.
import { createApp } from '../app.js'
import { createTokenVerifier } from '../auth/verifyToken.js'
import { TEST_ISSUER, createTestKeys } from './tokens.js'

export async function startTestApp(db, { rateLimits = false, authAdmin } = {}) {
  const keys = await createTestKeys()
  const verify = createTokenVerifier({ issuer: TEST_ISSUER, keySet: keys.keySet })
  const admin = authAdmin ?? {
    deleted: [],
    async deleteUser(id) {
      admin.deleted.push(id)
      await db.query('delete from auth.users where id = $1', [id]) // what Supabase would do
    },
  }

  const server = createApp({ accounts: { verify, db, authAdmin: admin }, rateLimits }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const baseUrl = `http://localhost:${server.address().port}`

  // request('GET', '/api/library', { token, body }) → { status, body, headers }
  async function request(method, path, { token, body, rawBody } = {}) {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)) })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
  }

  return { request, sign: keys.sign, admin, close: () => new Promise((resolve) => server.close(resolve)) }
}

// Builders matching the client's library shape
export const T1 = '2026-01-01T00:00:00.000Z'
export const T2 = '2026-02-01T00:00:00.000Z'
export const T3 = '2026-03-01T00:00:00.000Z'

export const snapshot = (id, overrides = {}) => ({
  id,
  name: `Album ${id}`,
  artists: [{ id: 'neon-harbor', name: 'Neon Harbor' }],
  albumType: 'album',
  inferredType: 'album',
  releaseDate: '2015-05-22',
  precision: 'day',
  year: 2015,
  totalTracks: 12,
  coverUrl: `/api/mock/art/${id}.svg`,
  spotifyUrl: `https://open.spotify.com/album/${id}`,
  totalDurationMs: null,
  ...overrides,
})

export const entry = (id, overrides = {}) => ({
  album: snapshot(id),
  status: null,
  rating: null,
  review: '',
  notes: '',
  tags: [],
  addedAt: T1,
  updatedAt: T1,
  ...overrides,
})

export const collection = (id, albumIds = [], overrides = {}) => ({
  id,
  name: `Collection ${id}`,
  description: '',
  albumIds,
  createdAt: T1,
  updatedAt: T1,
  ...overrides,
})
