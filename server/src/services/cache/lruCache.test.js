import { expect, test, vi } from 'vitest'
import { createCache } from './lruCache.js'

function cacheWithClock(options) {
  const clock = { time: 0 }
  return { clock, cache: createCache({ ...options, now: () => clock.time }) }
}

test('returns stored values until their time-to-live runs out', () => {
  const { clock, cache } = cacheWithClock()
  cache.set('a', 1, 1000)

  clock.time = 999
  expect(cache.get('a')).toBe(1)
  clock.time = 1000
  expect(cache.get('a')).toBeUndefined()
})

test('when full, drops the least recently used entry', () => {
  const { cache } = cacheWithClock({ maxEntries: 2 })
  cache.set('a', 1, 1000)
  cache.set('b', 2, 1000)
  cache.get('a') // "a" is now more recent than "b"
  cache.set('c', 3, 1000)

  expect(cache.get('a')).toBe(1)
  expect(cache.get('b')).toBeUndefined()
  expect(cache.get('c')).toBe(3)
})

test('getOrLoad loads once, then serves from the cache', async () => {
  const { cache } = cacheWithClock()
  const load = vi.fn(async () => 'value')

  expect(await cache.getOrLoad('k', 1000, load)).toBe('value')
  expect(await cache.getOrLoad('k', 1000, load)).toBe('value')
  expect(load).toHaveBeenCalledTimes(1)
  expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, size: 1, hitRate: 0.5 })
})

test('simultaneous requests for the same missing key share one load', async () => {
  const { cache } = cacheWithClock()
  let finish
  const load = vi.fn(() => new Promise((resolve) => (finish = resolve)))

  const results = Promise.all([cache.getOrLoad('k', 1000, load), cache.getOrLoad('k', 1000, load), cache.getOrLoad('k', 1000, load)])
  finish('value')

  expect(await results).toEqual(['value', 'value', 'value'])
  expect(load).toHaveBeenCalledTimes(1)
  expect(cache.stats().shared).toBe(2)
})

test('with storage, restores unexpired entries and saves after each change', () => {
  const saved = [
    ['fresh', { value: 1, expiresAt: 5000 }],
    ['stale', { value: 2, expiresAt: 10 }],
  ]
  const storage = { load: () => saved, save: vi.fn() }
  const clock = { time: 100 }
  const cache = createCache({ storage, now: () => clock.time })

  expect(cache.get('fresh')).toBe(1)
  expect(cache.get('stale')).toBeUndefined()

  cache.set('new', 3, 1000)
  expect(storage.save).toHaveBeenCalledTimes(1)
  expect([...storage.save.mock.calls[0][0].keys()]).toEqual(['fresh', 'new'])
})

test('a failed load is not cached, so the next call tries again', async () => {
  const { cache } = cacheWithClock()
  const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('value')

  await expect(cache.getOrLoad('k', 1000, load)).rejects.toThrow('boom')
  expect(await cache.getOrLoad('k', 1000, load)).toBe('value')
  expect(load).toHaveBeenCalledTimes(2)
})
