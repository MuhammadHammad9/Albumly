// The community and admin routes end to end: real Express, PGlite with RLS, real signed tokens
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { snapshot } from '../test/testApp.js'
import { USER_A, USER_B, createTestDatabase, resetTestDatabase } from '../test/testDb.js'
import { createCollection, makeAdmin, saveAlbums, startCommunityApp } from './communityTestApp.js'

let db
let app
let tokenA
let tokenB

beforeAll(async () => {
  db = await createTestDatabase()
  app = await startCommunityApp(db, {
    provider: { name: 'spotify', stats: () => ({ cache: { hits: 3, shared: 0, misses: 1, size: 4 }, spotify: { requests: 1, averageLatencyMs: 120, blocked: {} } }) },
  })
  tokenA = await app.sign(USER_A)
  tokenB = await app.sign(USER_B)
}, 60_000) // starting PGlite can take several seconds when many test files start at once
afterAll(async () => {
  await app.close()
  await db.close()
})
beforeEach(() => resetTestDatabase(db))

const request = (...args) => app.request(...args)

// A shares collection c1 with two albums (a1 has a review)
async function sharedCollection(settings = { visibility: 'public', includeReviews: false }) {
  await saveAlbums(db, USER_A, [{ id: 'a1', review: 'Loved it', rating: 9, notes: 'private note' }, 'b2'])
  await createCollection(db, USER_A, 'c1', ['a1', 'b2'], 'Road trip')
  const res = await request('PUT', '/api/collections/c1/share', { token: tokenA, body: settings })
  expect(res.status).toBe(200)
  return res.body.share
}

describe('shared collections', () => {
  test('a logged-out visitor can open a shared collection (exit criterion)', async () => {
    const share = await sharedCollection()
    expect(share).toMatchObject({ visibility: 'public', includeReviews: false, hidden: false })
    expect(share.slug).toMatch(/^road-trip-[a-z0-9]{8}$/)

    const res = await request('GET', `/api/public/collections/${share.slug}`) // no token
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(res.body.collection).toMatchObject({ slug: share.slug, name: 'Road trip', includeReviews: false })
    expect(res.body.albums.map((item) => [item.position, item.album.id])).toEqual([
      [0, 'a1'],
      [1, 'b2'],
    ])
    expect(res.body.albums[0]).not.toHaveProperty('review')
    expect(JSON.stringify(res.body)).not.toMatch(/private note|Loved it|inferredType/)
  })

  test('reviews appear when the owner turns them on', async () => {
    const share = await sharedCollection({ visibility: 'public', includeReviews: true })
    const res = await request('GET', `/api/public/collections/${share.slug}`)
    expect(res.body.albums[0]).toMatchObject({ rating: 9, review: 'Loved it' })
    expect(res.body.albums[1]).toMatchObject({ rating: null, review: null })
  })

  test('private, unknown and malformed links are all 404; the slug survives turning sharing off and on', async () => {
    const share = await sharedCollection()
    const off = await request('PUT', '/api/collections/c1/share', { token: tokenA, body: { visibility: 'private' } })
    expect(off.body.share.slug).toBe(share.slug)
    expect((await request('GET', `/api/public/collections/${share.slug}`)).status).toBe(404)
    expect((await request('GET', '/api/public/collections/nope-12345678')).status).toBe(404)
    expect((await request('GET', '/api/public/collections/Bad_Slug')).status).toBe(404)

    const on = await request('PUT', '/api/collections/c1/share', { token: tokenA, body: { visibility: 'public' } })
    expect(on.body.share.slug).toBe(share.slug)
    expect((await request('GET', `/api/public/collections/${share.slug}`)).status).toBe(200)
  })

  test('share settings need sign-in, valid input and your own synced collection', async () => {
    await sharedCollection()
    expect((await request('GET', '/api/collections/c1/share')).status).toBe(401)
    expect((await request('GET', '/api/collections/c1/share', { token: tokenA })).body.share.visibility).toBe('public')
    expect((await request('GET', '/api/collections/c1/share', { token: tokenB })).status).toBe(404)
    expect((await request('PUT', '/api/collections/c1/share', { token: tokenB, body: { visibility: 'public' } })).status).toBe(404)
    expect((await request('PUT', '/api/collections/c1/share', { token: tokenA, body: { visibility: 'everyone' } })).status).toBe(400)
    expect((await request('PUT', '/api/collections/c1/share', { token: tokenA, body: { visibility: 'public', hidden: false } })).status).toBe(400)

    await createCollection(db, USER_A, 'c2', [], 'Empty')
    expect((await request('GET', '/api/collections/c2/share', { token: tokenA })).body).toEqual({ share: null })
  })
})

describe('Album Battle', () => {
  async function battleBetween(ids = ['b2', 'a1']) {
    await saveAlbums(db, USER_A, ['a1', 'b2'])
    return request('POST', '/api/battles', { token: tokenA, body: { albumIds: ids } })
  }

  test('creating a battle copies the snapshots from your library; the same pair again is the same battle', async () => {
    const created = await battleBetween()
    expect(created.status).toBe(201)
    expect(created.body.battle).toMatchObject({ albumA: { id: 'a1', name: 'Album a1' }, albumB: { id: 'b2' }, votesA: 0, votesB: 0, myVote: null })

    const again = await request('POST', '/api/battles', { token: tokenA, body: { albumIds: ['a1', 'b2'] } })
    expect(again.status).toBe(200)
    expect(again.body.battle.id).toBe(created.body.battle.id)
  })

  test('both albums must be saved, different, and you must be signed in', async () => {
    await saveAlbums(db, USER_A, ['a1'])
    expect((await request('POST', '/api/battles', { body: { albumIds: ['a1', 'b2'] } })).status).toBe(401)
    expect((await request('POST', '/api/battles', { token: tokenA, body: { albumIds: ['a1', 'b2'] } })).body.error.code).toBe('not_saved')
    expect((await request('POST', '/api/battles', { token: tokenA, body: { albumIds: ['a1', 'a1'] } })).status).toBe(400)
  })

  test('a snapshot that cannot be shown publicly is refused', async () => {
    await saveAlbums(db, USER_A, [{ id: 'a1', album: snapshot('a1', { name: ' ' }) }, 'b2'])
    expect((await request('POST', '/api/battles', { token: tokenA, body: { albumIds: ['a1', 'b2'] } })).status).toBe(400)
  })

  test('one vote per user: 201 the first time, 409 already_voted after (exit criterion)', async () => {
    const { id } = (await battleBetween()).body.battle
    const first = await request('POST', `/api/battles/${id}/vote`, { token: tokenB, body: { choice: 'b' } })
    expect(first.status).toBe(201)
    expect(first.body.battle).toMatchObject({ votesA: 0, votesB: 1, myVote: 'b' })

    const second = await request('POST', `/api/battles/${id}/vote`, { token: tokenB, body: { choice: 'a' } })
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('already_voted')

    expect((await request('POST', `/api/battles/${id}/vote`, { body: { choice: 'a' } })).status).toBe(401)
    expect((await request('POST', `/api/battles/${id}/vote`, { token: tokenA, body: { choice: 'c' } })).status).toBe(400)
    expect((await request('POST', '/api/battles/00000000-0000-4000-8000-000000000000/vote', { token: tokenA, body: { choice: 'a' } })).status).toBe(404)
    expect((await request('POST', '/api/battles/not-a-uuid/vote', { token: tokenA, body: { choice: 'a' } })).status).toBe(404)
  })

  test('lists: visitors see totals, signed-in users see their vote, "vote" view skips voted battles', async () => {
    const { id } = (await battleBetween()).body.battle
    await request('POST', `/api/battles/${id}/vote`, { token: tokenB, body: { choice: 'a' } })

    const visitor = await request('GET', '/api/battles')
    expect(visitor.body.battles).toEqual([expect.objectContaining({ id, votesA: 1, votesB: 0, myVote: null })])
    expect((await request('GET', '/api/battles', { token: tokenB })).body.battles[0].myVote).toBe('a')
    expect((await request('GET', '/api/battles?view=vote', { token: tokenB })).body.battles).toEqual([])
    expect((await request('GET', '/api/battles?view=vote', { token: tokenA })).body.battles).toHaveLength(1)
    expect((await request('GET', '/api/battles?view=vote')).status).toBe(401)
    expect((await request('GET', '/api/battles', { token: 'not-a-token' })).status).toBe(401) // a bad token is not "logged out"
    expect((await request('GET', `/api/battles/${id}`)).body.battle.votesA).toBe(1)
  })

  test('the leaderboard ranks albums once they have enough votes', async () => {
    const { id } = (await battleBetween()).body.battle
    // Five extra voters
    const voters = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000010${i}`)
    for (const voter of voters) {
      await db.query('insert into auth.users (id) values ($1)', [voter])
      await request('POST', `/api/battles/${id}/vote`, { token: await app.sign(voter), body: { choice: voter.endsWith('4') ? 'b' : 'a' } })
    }
    const res = await request('GET', '/api/leaderboard')
    expect(res.status).toBe(200)
    expect(res.body.minVotes).toBe(5)
    expect(res.body.albums.map((row) => [row.rank, row.album.id, row.wins, row.votes])).toEqual([
      [1, 'a1', 4, 5],
      [2, 'b2', 1, 5],
    ])
  })
})

describe('reports and moderation', () => {
  test('reporting: needs sign-in, a public target, and is safe to send twice', async () => {
    const share = await sharedCollection({ visibility: 'public', includeReviews: true })
    const body = { targetType: 'collection', slug: share.slug, reason: 'spam' }
    expect((await request('POST', '/api/reports', { body })).status).toBe(401)
    expect((await request('POST', '/api/reports', { token: tokenB, body })).status).toBe(201)
    expect((await request('POST', '/api/reports', { token: tokenB, body })).status).toBe(200)
    expect((await request('POST', '/api/reports', { token: tokenB, body: { ...body, slug: 'nope-12345678' } })).status).toBe(404)
    // Only reviews that are actually shown can be reported
    expect((await request('POST', '/api/reports', { token: tokenB, body: { targetType: 'review', slug: share.slug, albumId: 'a1', reason: 'offensive' } })).status).toBe(201)
    expect((await request('POST', '/api/reports', { token: tokenB, body: { targetType: 'review', slug: share.slug, albumId: 'b2', reason: 'offensive' } })).status).toBe(404)
  })

  test('admin routes: 401 signed out, 403 for non-admins, status says who is admin', async () => {
    expect((await request('GET', '/api/admin/metrics')).status).toBe(401)
    expect((await request('GET', '/api/admin/metrics', { token: tokenA })).status).toBe(403)
    expect((await request('GET', '/api/admin/reports', { token: tokenA })).status).toBe(403)
    expect((await request('GET', '/api/admin/status', { token: tokenA })).body).toEqual({ admin: false })
    await makeAdmin(db, USER_A)
    expect((await request('GET', '/api/admin/status', { token: tokenA })).body).toEqual({ admin: true })
  })

  test('the metrics report includes our counters and the provider stats', async () => {
    await makeAdmin(db, USER_A)
    await request('GET', '/api/battles')
    const res = await request('GET', '/api/admin/metrics', { token: tokenA })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.body.provider).toBe('spotify')
    expect(res.body.cache.hitRate).toBe(0.75)
    expect(res.body.spotify.averageLatencyMs).toBe(120)
    expect(res.body.requests.topRoutes.map((row) => row.route)).toContain('/api/battles')
  })

  test('hide a reported review and collection, then restore them', async () => {
    const share = await sharedCollection({ visibility: 'public', includeReviews: true })
    await request('POST', '/api/reports', { token: tokenB, body: { targetType: 'review', slug: share.slug, albumId: 'a1', reason: 'offensive', details: 'rude' } })
    await makeAdmin(db, USER_B)

    const queue = await request('GET', '/api/admin/reports', { token: tokenB })
    expect(queue.body.reports).toEqual([
      expect.objectContaining({ targetType: 'review', reason: 'offensive', details: 'rude', resolvedAt: null, target: { label: 'Album a1 in “Road trip”', excerpt: 'Loved it', hidden: false, hideKey: `${share.slug}:a1` } }),
    ])
    const reportId = queue.body.reports[0].id
    expect((await request('POST', `/api/admin/reports/${reportId}/resolve`, { token: tokenB, body: { action: 'hide', reason: 'Insults' } })).status).toBe(204)
    expect((await request('GET', `/api/public/collections/${share.slug}`)).body.albums[0].review).toBeNull()
    expect((await request('GET', '/api/admin/reports', { token: tokenB })).body.reports).toEqual([])

    expect((await request('DELETE', `/api/admin/hides/review/${encodeURIComponent(`${share.slug}:a1`)}`, { token: tokenB })).status).toBe(204)
    expect((await request('GET', `/api/public/collections/${share.slug}`)).body.albums[0].review).toBe('Loved it')

    // A whole collection: its link stops working and the owner sees why
    await request('POST', '/api/reports', { token: tokenB, body: { targetType: 'collection', slug: share.slug, reason: 'spam' } })
    const [collectionReport] = (await request('GET', '/api/admin/reports', { token: tokenB })).body.reports
    await request('POST', `/api/admin/reports/${collectionReport.id}/resolve`, { token: tokenB, body: { action: 'hide', reason: 'Spam' } })
    expect((await request('GET', `/api/public/collections/${share.slug}`)).status).toBe(404)
    expect((await request('GET', '/api/collections/c1/share', { token: tokenA })).body.share).toMatchObject({ hidden: true, hiddenReason: 'Spam' })
    // The owner cannot bring it back by toggling
    await request('PUT', '/api/collections/c1/share', { token: tokenA, body: { visibility: 'public' } })
    expect((await request('GET', `/api/public/collections/${share.slug}`)).status).toBe(404)

    expect((await request('DELETE', `/api/admin/hides/collection/${share.slug}`, { token: tokenB })).status).toBe(204)
    expect((await request('GET', `/api/public/collections/${share.slug}`)).status).toBe(200)
  })

  test('a hidden battle leaves the lists, refuses votes and cannot be re-created', async () => {
    await saveAlbums(db, USER_A, ['a1', 'b2'])
    const { id } = (await request('POST', '/api/battles', { token: tokenA, body: { albumIds: ['a1', 'b2'] } })).body.battle
    await request('POST', '/api/reports', { token: tokenB, body: { targetType: 'battle', battleId: id, reason: 'other' } })
    await makeAdmin(db, USER_B)
    const [report] = (await request('GET', '/api/admin/reports', { token: tokenB })).body.reports
    expect(report.target.label).toBe('Album a1 vs Album b2')
    await request('POST', `/api/admin/reports/${report.id}/resolve`, { token: tokenB, body: { action: 'hide' } })

    expect((await request('GET', '/api/battles')).body.battles).toEqual([])
    expect((await request('POST', `/api/battles/${id}/vote`, { token: tokenA, body: { choice: 'a' } })).status).toBe(404)
    expect((await request('POST', '/api/battles', { token: tokenA, body: { albumIds: ['a1', 'b2'] } })).status).toBe(404)

    expect((await request('DELETE', `/api/admin/hides/battle/${id}`, { token: tokenB })).status).toBe(204)
    expect((await request('GET', '/api/battles')).body.battles).toHaveLength(1)
  })

  test('dismissing closes a report without hiding anything; unknown ids are 404', async () => {
    const share = await sharedCollection()
    await request('POST', '/api/reports', { token: tokenB, body: { targetType: 'collection', slug: share.slug, reason: 'other' } })
    await makeAdmin(db, USER_B)
    const [report] = (await request('GET', '/api/admin/reports', { token: tokenB })).body.reports
    expect((await request('POST', `/api/admin/reports/${report.id}/resolve`, { token: tokenB, body: { action: 'dismiss' } })).status).toBe(204)
    expect((await request('GET', '/api/admin/reports?status=resolved', { token: tokenB })).body.reports[0]).toMatchObject({ resolution: 'dismissed' })
    expect((await request('GET', `/api/public/collections/${share.slug}`)).status).toBe(200)
    expect((await request('POST', '/api/admin/reports/00000000-0000-4000-8000-000000000000/resolve', { token: tokenB, body: { action: 'dismiss' } })).status).toBe(404)
    expect((await request('DELETE', '/api/admin/hides/collection/nope-12345678', { token: tokenB })).status).toBe(404)
    expect((await request('DELETE', '/api/admin/hides/planet/x', { token: tokenB })).status).toBe(400)
  })
})

test('community rate limits answer 429 with the usual envelope', async () => {
  const limited = await startCommunityApp(db, { rateLimits: { report: { windowMs: 60_000, limit: 1 } } })
  try {
    const token = await limited.sign(USER_B)
    const body = { targetType: 'collection', slug: 'nope-12345678', reason: 'spam' }
    expect((await limited.request('POST', '/api/reports', { token, body })).status).toBe(404)
    const res = await limited.request('POST', '/api/reports', { token, body })
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('rate_limited')
  } finally {
    await limited.close()
  }
})
