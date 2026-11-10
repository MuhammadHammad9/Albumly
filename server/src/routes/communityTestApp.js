// Test helper for Phase 7: a small Express app with only the community and admin routes, on a
// free port, using PGlite and in-memory signing keys (Phase 5's test helpers, used as they are).
import express from 'express'
import { createTokenVerifier } from '../auth/verifyToken.js'
import { apiNotFound, errorHandler } from '../middleware/errorHandler.js'
import { createRequestMetrics } from '../middleware/requestMetrics.js'
import { snapshot } from '../test/testApp.js'
import { TEST_ISSUER, createTestKeys } from '../test/tokens.js'
import { createAdminRoutes } from './adminRoutes.js'
import { createCommunityRoutes } from './communityRoutes.js'

export async function startCommunityApp(db, { rateLimits = false, provider = { name: 'mock' } } = {}) {
  const keys = await createTestKeys()
  const verify = createTokenVerifier({ issuer: TEST_ISSUER, keySet: keys.keySet })
  const metrics = createRequestMetrics()

  const app = express()
  app.use(metrics.middleware)
  app.use(express.json({ limit: '100kb' }))
  app.use('/api', createCommunityRoutes({ verify, db, rateLimits }))
  app.use('/api', createAdminRoutes({ verify, db, metrics, getProvider: () => provider }))
  app.use('/api', apiNotFound)
  app.use(errorHandler)

  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const baseUrl = `http://localhost:${server.address().port}`

  // request('GET', '/api/battles', { token, body }) → { status, body, headers }
  async function request(method, path, { token, body } = {}) {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
  }

  return { request, sign: keys.sign, metrics, close: () => new Promise((resolve) => server.close(resolve)) }
}

// ---------- seeding the database the way the Phase 5 routes would ----------

const T = '2026-01-01T00:00:00.000Z'

// Saves albums to a user's library. entries: [albumId | { id, review, rating, notes, tags, album }]
export async function saveAlbums(db, userId, entries) {
  await db.asUser(userId, async (tx) => {
    for (const item of entries) {
      const e = typeof item === 'string' ? { id: item } : item
      await tx.query(
        `insert into library_entries (user_id, album_id, album, rating, review, notes, tags, added_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [userId, e.id, e.album ?? snapshot(e.id), e.rating ?? null, e.review ?? '', e.notes ?? '', e.tags ?? [], T],
      )
    }
  })
}

export async function createCollection(db, userId, id, albumIds = [], name = `Collection ${id}`) {
  await db.asUser(userId, async (tx) => {
    await tx.query('insert into collections (user_id, id, name, created_at, updated_at) values ($1, $2, $3, $4, $4)', [userId, id, name, T])
    for (const [position, albumId] of albumIds.entries()) {
      await tx.query('insert into collection_albums (user_id, collection_id, album_id, position) values ($1, $2, $3, $4)', [userId, id, albumId, position])
    }
  })
}

export const makeAdmin = (db, userId) => db.query('insert into public.app_admins (user_id) values ($1)', [userId])
