import { expect, test } from 'vitest'
import { DEFAULT_DAILY_REQUESTS, createRequestBudget, dailyLimitFromEnv } from './requestBudget.js'

const memoryStorage = (initial = []) => {
  const storage = { saved: initial, load: () => storage.saved, save: (map) => (storage.saved = [...map]) }
  return storage
}

test('counts spending against the daily limit and never allows more than the limit', () => {
  const budget = createRequestBudget({ limit: 5, now: () => new Date('2026-11-10T12:00:00Z') })
  expect(budget.canSpend(2)).toBe(true)
  budget.spend(2)
  budget.spend(2)
  expect(budget.canSpend(2)).toBe(false) // 4 + 2 > 5
  expect(budget.canSpend(1)).toBe(true)
  expect(budget.snapshot()).toEqual({ limit: 5, spent: 4, remaining: 1, resetsAt: '2026-11-11T00:00:00.000Z' })
})

test('a new UTC day starts from zero', () => {
  let time = new Date('2026-11-10T23:59:00Z')
  const budget = createRequestBudget({ limit: 4, now: () => time })
  budget.spend(4)
  expect(budget.canSpend(1)).toBe(false)
  time = new Date('2026-11-11T00:01:00Z')
  expect(budget.canSpend(4)).toBe(true)
  expect(budget.snapshot().spent).toBe(0)
})

test('the count survives a restart through storage, but only for the same day', () => {
  const storage = memoryStorage()
  const now = () => new Date('2026-11-10T08:00:00Z')
  createRequestBudget({ limit: 30, storage, now }).spend(6)
  expect(storage.saved).toEqual([['2026-11-10', 6]])

  expect(createRequestBudget({ limit: 30, storage, now }).snapshot().spent).toBe(6)
  expect(createRequestBudget({ limit: 30, storage, now: () => new Date('2026-11-12T08:00:00Z') }).snapshot().spent).toBe(0)
})

test('spending nothing does not write', () => {
  const storage = memoryStorage()
  createRequestBudget({ storage }).spend(0)
  expect(storage.saved).toEqual([])
})

test('the daily limit setting is optional', () => {
  expect(dailyLimitFromEnv(undefined)).toBe(DEFAULT_DAILY_REQUESTS)
  expect(dailyLimitFromEnv('')).toBe(DEFAULT_DAILY_REQUESTS)
  expect(dailyLimitFromEnv('lots')).toBe(DEFAULT_DAILY_REQUESTS)
  expect(dailyLimitFromEnv('-3')).toBe(DEFAULT_DAILY_REQUESTS)
  expect(dailyLimitFromEnv('12')).toBe(12)
  expect(dailyLimitFromEnv('0')).toBe(0) // 0 turns lookups off
})
