import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api.js'
import { cacheKey, createApiRepository } from './apiRepository.js'
import { emptyLibrary } from './schema.js'
import { collection, entry } from '../../test/libraryFixtures.js'

const USER = 'user-1'
const lib = (entries = {}, collections = []) => ({ ...emptyLibrary(), entries, collections })

// A pretend server: keeps a library, answers GET /api/library, records every other call
function fakeServer(initial = lib()) {
  const server = {
    library: initial,
    calls: [],
    failNext: null, // an ApiError to throw once
    request: vi.fn(async (method, path, body) => {
      if (server.failNext) {
        const error = server.failNext
        server.failNext = null
        throw error
      }
      if (method === 'GET' && path === '/api/library') return structuredClone(server.library)
      server.calls.push([method, path, body])
      return {}
    }),
  }
  return server
}

// Timers run only when the test says so
function manualTimers() {
  const pending = new Map()
  let next = 1
  return {
    setTimeout: (fn) => {
      pending.set(next, fn)
      return next++
    },
    clearTimeout: (id) => pending.delete(id),
    runAll() {
      const fns = [...pending.values()]
      pending.clear()
      fns.forEach((fn) => fn())
    },
    get count() {
      return pending.size
    },
  }
}

let timers
const make = (server, options = {}) =>
  createApiRepository({ userId: USER, request: server.request, storage: localStorage, target: null, timers, ...options })

beforeEach(() => {
  localStorage.clear()
  timers = manualTimers()
})

test('starts empty without a cached copy, then shows the account library once fetched', async () => {
  const server = fakeServer(lib({ a: entry('a') }))
  const repo = make(server)
  const listener = vi.fn()
  repo.subscribe(listener)

  expect(repo.load()).toEqual(emptyLibrary())
  expect(repo.hasCache()).toBe(false)
  await repo.start()

  expect(listener).toHaveBeenLastCalledWith(server.library)
  expect(repo.load()).toEqual(server.library)
  // The copy stays on the device for the next visit
  expect(make(fakeServer()).load()).toEqual(server.library)
})

test('changes are sent as small API calls after a short pause', async () => {
  const server = fakeServer()
  const repo = make(server)
  await repo.start()

  expect(repo.save(lib({ a: entry('a') }, [collection('c', ['a'])]))).toBe(true)
  expect(repo.pendingCount()).toBe(3)
  timers.runAll()
  await repo.flush()

  expect(server.calls.map(([method, path]) => `${method} ${path}`)).toEqual([
    'PUT /api/albums/a/entry',
    'POST /api/collections',
    'POST /api/collections/c/albums',
  ])
  expect(repo.pendingCount()).toBe(0)
  expect(repo.status.sync).toBe('idle')
})

test('a network failure keeps the change and retries later, resuming where it stopped', async () => {
  const server = fakeServer()
  const statuses = []
  const repo = make(server, { onStatus: (status) => statuses.push(status.sync) })
  await repo.start()

  repo.save(lib({ a: entry('a'), b: entry('b') }))
  server.failNext = new ApiError(0, 'network_error', 'offline')
  await repo.flush()
  expect(statuses.at(-1)).toBe('offline')
  expect(repo.pendingCount()).toBe(2)

  // A new repository (e.g. after reloading the tab) still knows what is left to send
  expect(make(server).pendingCount()).toBe(2)

  timers.runAll()
  await repo.flush()
  expect(server.calls).toHaveLength(2)
  expect(repo.pendingCount()).toBe(0)
})

test('more than 50 album changes go up as one import request', async () => {
  const server = fakeServer()
  const repo = make(server)
  await repo.start()

  const entries = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`a${i}`, entry(`a${i}`)]))
  repo.save(lib(entries))
  await repo.flush()

  expect(server.calls).toHaveLength(1)
  expect(server.calls[0][1]).toBe('/api/library/import')
  expect(Object.keys(server.calls[0][2].library.entries)).toHaveLength(60)
  expect(repo.pendingCount()).toBe(0)
})

test('a refused change (4xx) makes the account copy win', async () => {
  const server = fakeServer(lib({ a: entry('a') }))
  const repo = make(server)
  await repo.start()

  repo.save(lib({ a: entry('a') }, [collection('c', [], { name: 'Taken elsewhere' })]))
  server.failNext = new ApiError(409, 'duplicate_name', 'taken')
  await repo.flush()

  expect(repo.load()).toEqual(server.library)
  expect(repo.status.sync).toBe('error')
})

test('a 401 pauses syncing; resume() sends what waited', async () => {
  const server = fakeServer()
  const repo = make(server)
  await repo.start()

  repo.save(lib({ a: entry('a') }))
  server.failNext = new ApiError(401, 'session_expired', 'ended')
  await repo.flush()
  expect(repo.status.sync).toBe('expired')

  repo.save(lib({ a: entry('a'), b: entry('b') })) // still editable while paused
  await repo.flush()
  expect(server.calls).toHaveLength(0)

  await repo.resume()
  expect(server.calls).toHaveLength(2)
})

test('a pull never throws away changes that were not sent yet', async () => {
  const server = fakeServer()
  const repo = make(server)
  await repo.start()

  repo.save(lib({ mine: entry('mine') }))
  server.library = lib({ other: entry('other') }) // added on another device
  await repo.pull({ force: true })

  expect(server.calls.map(([, path]) => path)).toEqual(['/api/albums/mine/entry'])
})

test('each user has their own cached copy, and clearCache removes it', async () => {
  const repo = make(fakeServer(lib({ a: entry('a') })))
  await repo.start()
  expect(localStorage.getItem(cacheKey(USER))).not.toBeNull()
  expect(createApiRepository({ userId: 'someone-else', request: vi.fn(), target: null, timers }).load()).toEqual(emptyLibrary())

  repo.clearCache()
  expect(localStorage.getItem(cacheKey(USER))).toBeNull()
})

describe('applyServer', () => {
  test('replaces both copies, so nothing is re-sent', async () => {
    const server = fakeServer()
    const repo = make(server)
    await repo.start()
    repo.applyServer(lib({ a: entry('a') }))
    expect(repo.load().entries.a).toBeDefined()
    expect(repo.pendingCount()).toBe(0)
  })
})
