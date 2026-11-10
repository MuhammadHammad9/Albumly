// Runs the middleware inside a small real Express app (on a free port) with a few fake routes
import express, { Router } from 'express'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { ApiError } from '../utils/errors.js'
import { errorHandler } from './errorHandler.js'
import { createRequestMetrics } from './requestMetrics.js'

let server
let baseUrl
const metrics = createRequestMetrics()

beforeAll(async () => {
  const app = express()
  app.use(metrics.middleware)
  // Stand-in for the rate limiter: rejects before any route matches
  app.use('/api/limited', (req, res, next) => next(new ApiError(429, 'rate_limited', 'Too many', { retryAfter: 1 })))

  const api = Router()
  api.get('/search', (req, res) => {
    if (!req.query.q) throw new ApiError(400, 'bad_request', 'q is required')
    res.json({ ok: true })
  })
  api.get('/artists/:id', (req, res) => res.json({ id: req.params.id }))
  api.get('/boom', () => {
    throw new Error('kaput')
  })
  app.use('/api', api)
  app.use(errorHandler)

  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${server.address().port}`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

// The finish event fires right after the response is sent; give it a tick
const get = async (path) => {
  const res = await fetch(`${baseUrl}${path}`)
  await res.text()
  await new Promise((resolve) => setTimeout(resolve, 10))
  return res.status
}

test('counts requests by status and route pattern, never by real id', async () => {
  const consoleError = console.error
  console.error = () => {} // the 500 route logs its error on purpose
  try {
    expect(await get('/api/artists/abc')).toBe(200)
    expect(await get('/api/artists/xyz')).toBe(200)
    expect(await get('/api/search?q=Daft%20Punk')).toBe(200)
    expect(await get('/api/search?q=daft+punk')).toBe(200)
    expect(await get('/api/search?q=DAFT%20PUNK')).toBe(200)
    expect(await get('/api/search')).toBe(400)
    expect(await get('/api/boom')).toBe(500)
    expect(await get('/api/limited')).toBe(429)
    expect(await get('/nowhere')).toBe(404)
  } finally {
    console.error = consoleError
  }

  const snap = metrics.snapshot()
  expect(snap.total).toBe(9)
  expect(snap.byStatus).toEqual({ '2xx': 5, '3xx': 0, '4xx': 3, '5xx': 1 })
  expect(snap.rateLimited).toBe(1)
  expect(snap.errors).toBe(1)
  expect(snap.latency.count).toBe(9)

  const routes = Object.fromEntries(snap.routes.map(({ route, count, errors }) => [route, { count, errors }]))
  expect(routes['/api/artists/:id']).toEqual({ count: 2, errors: 0 })
  // The 400 left the router through the error handler and still counts under the right pattern
  expect(routes['/api/search']).toEqual({ count: 4, errors: 0 })
  expect(routes['/api/boom']).toEqual({ count: 1, errors: 1 })
  expect(routes['(other)']).toEqual({ count: 2, errors: 0 })
  expect(JSON.stringify(snap.routes)).not.toContain('abc')

  // Only the three successful searches count, as one normalised query
  expect(snap.searches.top({ minCount: 3 })).toEqual([{ query: 'daft punk', count: 3 }])
  expect(snap.timeline.at(-1).requests).toBe(9)
})
