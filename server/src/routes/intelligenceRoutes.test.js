import express from 'express'
import { afterEach, beforeAll, expect, test } from 'vitest'
import { apiNotFound, errorHandler } from '../middleware/errorHandler.js'
import { mockProvider } from '../providers/mockProvider.js'
import { createRequestBudget } from '../services/intelligence/requestBudget.js'
import { ApiError } from '../utils/errors.js'
import { createIntelligenceRoutes } from './intelligenceRoutes.js'

// A small app of its own, so these tests do not depend on app.js mounting the route

let server

async function start({ provider, budget = createRequestBudget({ limit: 30 }) }) {
  const app = express()
  app.use('/api', createIntelligenceRoutes({ getProvider: () => provider, budget }))
  app.use('/api', apiNotFound)
  app.use(errorHandler)
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://localhost:${server.address().port}`
  return async (path) => {
    const res = await fetch(`${base}${path}`)
    return { status: res.status, body: await res.json() }
  }
}

afterEach(() => server?.close())
beforeAll(() => {
  process.env.MOCK_DELAY_MS = '0'
})

// A provider whose cache knows only the artists in `known`; loadPreview "fetches" the rest
function fakeSpotify({ known = ['aaa'], blocked = 0, failWith } = {}) {
  const cached = new Set(known)
  const provider = {
    name: 'spotify',
    previewCost: 2,
    loads: [],
    peekArtist: (id) => (cached.has(id) ? { id, name: `Artist ${id}`, genres: [] } : null),
    peekReleases: (id) => (cached.has(id) ? { source: 'preview', releases: [{ id: `${id}-r`, name: 'R', releaseDate: '2020-01-01', artists: [] }] } : null),
    async loadPreview(id) {
      provider.loads.push(id)
      if (failWith) throw failWith
      cached.add(id)
      return { requests: 2 }
    },
    blockedFor: () => blocked,
  }
  return provider
}

test('by default only reads the cache: unknown artists come back empty and nothing is loaded', async () => {
  const provider = fakeSpotify()
  const get = await start({ provider })
  const { status, body } = await get('/api/intelligence/artists?ids=aaa,bbb')

  expect(status).toBe(200)
  expect(body.mode).toBe('spotify')
  expect(body.artists).toEqual([
    { id: 'aaa', artist: { id: 'aaa', name: 'Artist aaa', imageUrl: null, genres: [] }, releases: [expect.objectContaining({ id: 'aaa-r' })], source: 'preview' },
    { id: 'bbb', artist: null, releases: null, source: null },
  ])
  expect(provider.loads).toEqual([])
  expect(body.budget).toMatchObject({ limit: 30, spent: 0, remaining: 30 })
})

test('load looks up uncached artists in order, up to the number asked, and spends the budget', async () => {
  const provider = fakeSpotify()
  const get = await start({ provider })
  const { body } = await get('/api/intelligence/artists?ids=aaa,bbb,ccc,ddd&load=2')

  expect(provider.loads).toEqual(['bbb', 'ccc'])
  expect(body.loaded).toEqual(['bbb', 'ccc'])
  expect(body.artists.map((a) => a.source)).toEqual(['preview', 'preview', 'preview', null])
  expect(body.budget).toMatchObject({ spent: 4, remaining: 26 })
  expect(body.stopped).toBeNull()
})

test('stops before overshooting the daily budget', async () => {
  const provider = fakeSpotify()
  const get = await start({ provider, budget: createRequestBudget({ limit: 3 }) })
  const { body } = await get('/api/intelligence/artists?ids=bbb,ccc&load=2')

  expect(provider.loads).toEqual(['bbb']) // 2 spent; a second lookup could cost 2 more > 3
  expect(body.stopped).toEqual({ code: 'budget_exhausted' })
  expect(body.budget.spent).toBe(2)
})

test('spends nothing while Spotify blocks the discography endpoint', async () => {
  const provider = fakeSpotify({ blocked: 79_000 })
  const get = await start({ provider })
  const { body } = await get('/api/intelligence/artists?ids=aaa,bbb&load=3')

  expect(provider.loads).toEqual([])
  expect(body.stopped).toEqual({ code: 'rate_limited', retryAfter: 79_000 })
  expect(body.artists[0].source).toBe('preview') // the cached part is still there
})

test('a rate-limited lookup returns the partial result and counts what it used', async () => {
  const error = Object.assign(new ApiError(503, 'rate_limited', 'slow down', { retryAfter: 600 }), { requestsSpent: 1 })
  const provider = fakeSpotify({ failWith: error })
  const get = await start({ provider })
  const { status, body } = await get('/api/intelligence/artists?ids=aaa,bbb,ccc&load=3')

  expect(status).toBe(200)
  expect(provider.loads).toEqual(['bbb'])
  expect(body.stopped).toEqual({ code: 'rate_limited', retryAfter: 600 })
  expect(body.budget.spent).toBe(1)
})

test('the demo catalogue answers everything from memory', async () => {
  const get = await start({ provider: mockProvider })
  const { body } = await get('/api/intelligence/artists?ids=neon-harbor,mara-voss&load=3')

  expect(body.mode).toBe('mock')
  expect(body.loaded).toEqual([])
  expect(body.artists[0].artist.genres).toEqual(['synthwave', 'dream pop'])
  expect(body.artists[1].releases.length).toBeGreaterThan(3)
})

test('a provider without cache access reports "unsupported"', async () => {
  const get = await start({ provider: { name: 'spotify' } })
  const { body } = await get('/api/intelligence/artists?ids=aaa&load=3')
  expect(body.mode).toBe('unsupported')
  expect(body.artists).toEqual([{ id: 'aaa', artist: null, releases: null, source: null }])
})

test.each([
  ['', '"ids" is required'],
  ['?ids=', '"ids" needs at least one artist id'],
  ['?ids=a;b', 'Each id must be letters, digits or dashes'],
  ['?ids=aaa&load=4', '"load" must be 0 to 3'],
  [`?ids=${Array.from({ length: 41 }, (_, i) => `a${i}`).join(',')}`, '"ids" can list at most 40 artists'],
])('rejects bad input %s', async (query, message) => {
  const get = await start({ provider: fakeSpotify() })
  const { status, body } = await get(`/api/intelligence/artists${query}`)
  expect(status).toBe(400)
  expect(body.error).toEqual({ code: 'bad_request', message })
})
