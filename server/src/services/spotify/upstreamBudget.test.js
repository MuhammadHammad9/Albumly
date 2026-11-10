import { expect, test } from 'vitest'
import { createUpstreamBudget, upstreamLimitsFromEnv } from './upstreamBudget.js'

const MINUTE = 60 * 1000

function setup(overrides = {}) {
  let time = 1_000_000
  const budget = createUpstreamBudget({
    perVisitor: { windowMs: 10 * MINUTE, limit: 3 },
    overall: { windowMs: 10 * MINUTE, limit: 5 },
    now: () => time,
    ...overrides,
  })
  // Runs fn as if it were inside a request from this address
  const as = (ip, fn) => new Promise((resolve, reject) => budget.middleware({ ip }, {}, () => Promise.resolve().then(fn).then(resolve, reject)))
  return { budget, as, advance: (ms) => (time += ms) }
}

test('one visitor is stopped at their own cap while others carry on', async () => {
  const { budget, as } = setup()
  await as('1.1.1.1', () => {
    budget.gate()
    budget.gate()
    budget.gate()
    expect(() => budget.gate()).toThrow(expect.objectContaining({ status: 429, code: 'rate_limited', retryAfter: 600 }))
  })
  await as('2.2.2.2', () => expect(() => budget.gate()).not.toThrow())
})

test('the visitor is remembered across awaits', async () => {
  const { budget, as } = setup()
  await as('1.1.1.1', async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1))
      budget.gate()
    }
    await new Promise((resolve) => setTimeout(resolve, 1))
    expect(() => budget.gate()).toThrow(expect.objectContaining({ status: 429 }))
  })
})

test('everyone together is stopped at the overall cap, even from many addresses', async () => {
  const { budget, as } = setup()
  for (let i = 0; i < 5; i++) await as(`10.0.0.${i}`, () => budget.gate())
  await as('10.0.0.99', () => expect(() => budget.gate()).toThrow(expect.objectContaining({ status: 429, message: expect.stringContaining('too many requests') })))
  expect(budget.stats()).toMatchObject({ refusedOverall: 1, overallUsed: 5 })
})

test('a refused request is not counted, and the caps reset when the window ends', async () => {
  const { budget, as, advance } = setup()
  await as('1.1.1.1', () => {
    for (let i = 0; i < 3; i++) budget.gate()
    for (let i = 0; i < 10; i++) expect(() => budget.gate()).toThrow()
  })
  expect(budget.stats().overallUsed).toBe(3)
  advance(10 * MINUTE)
  await as('1.1.1.1', () => expect(() => budget.gate()).not.toThrow())
})

test('work outside any request is held to the overall cap only', () => {
  const { budget } = setup()
  for (let i = 0; i < 5; i++) budget.gate()
  expect(() => budget.gate()).toThrow(expect.objectContaining({ status: 429 }))
})

test('limits can be set from the environment; nonsense falls back to the defaults', () => {
  expect(upstreamLimitsFromEnv({ SPOTIFY_REQUESTS_PER_VISITOR: '50', SPOTIFY_REQUESTS_OVERALL: '200' })).toMatchObject({ perVisitor: { limit: 50 }, overall: { limit: 200 } })
  expect(upstreamLimitsFromEnv({ SPOTIFY_REQUESTS_PER_VISITOR: '-1', SPOTIFY_REQUESTS_OVERALL: 'lots' })).toMatchObject({ perVisitor: { limit: 120 }, overall: { limit: 600 } })
})
