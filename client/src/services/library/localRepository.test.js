import { describe, expect, test, vi } from 'vitest'
import { collection, entry } from '../../test/libraryFixtures.js'
import { BACKUP_KEY, STORAGE_KEY, createLocalRepository, salvage } from './localRepository.js'
import { emptyLibrary } from './schema.js'

// A stand-in for localStorage that can be told to fail
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    failWrites: false,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem(key, value) {
      if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      data.set(key, String(value))
    },
  }
}

const valid = () => ({ version: 1, entries: { a: entry('a') }, collections: [collection('c1', ['a'])] })

describe('load and save', () => {
  test('starts empty when nothing is saved', () => {
    expect(createLocalRepository({ storage: fakeStorage() }).load()).toEqual(emptyLibrary())
  })

  test('round-trips a library through storage', () => {
    const storage = fakeStorage()
    const repository = createLocalRepository({ storage })

    expect(repository.save(valid())).toBe(true)
    expect(repository.load()).toEqual(valid())
  })

  test('reports a failed save instead of throwing', () => {
    const storage = fakeStorage()
    storage.failWrites = true

    expect(createLocalRepository({ storage }).save(valid())).toBe(false)
  })

  test('survives storage that cannot even be read', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(createLocalRepository({ storage }).load()).toEqual(emptyLibrary())
  })
})

describe('damaged data', () => {
  test('backs up text that is not JSON and starts fresh', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '{oops' })

    expect(createLocalRepository({ storage }).load()).toEqual(emptyLibrary())
    expect(storage.data.get(BACKUP_KEY)).toBe('{oops')
  })

  test('keeps the valid parts of a partly broken library, after backing it up', () => {
    const broken = {
      version: 1,
      entries: { a: entry('a'), b: entry('b', { rating: 99 }) },
      collections: [collection('c1', ['a', 'b']), collection('c2', [], { name: '' })],
    }
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(broken) })

    const library = createLocalRepository({ storage }).load()

    expect(Object.keys(library.entries)).toEqual(['a'])
    expect(library.collections).toEqual([collection('c1', ['a'])])
    expect(JSON.parse(storage.data.get(BACKUP_KEY))).toEqual(broken)
  })

  test('does not open data from a newer version, but keeps it safe', () => {
    const newer = JSON.stringify({ version: 7, entries: {} })
    const storage = fakeStorage({ [STORAGE_KEY]: newer })

    expect(createLocalRepository({ storage }).load()).toEqual(emptyLibrary())
    expect(storage.data.get(BACKUP_KEY)).toBe(newer)
  })

  test('salvage drops duplicate collection names and ids', () => {
    const result = salvage({
      entries: {},
      collections: [collection('c1', [], { name: 'Mix' }), collection('c2', [], { name: 'MIX' }), collection('c1', [], { name: 'Other' })],
    })
    expect(result.collections.map((c) => c.id)).toEqual(['c1'])
  })
})

test('subscribe passes on changes made in another tab', () => {
  const storage = fakeStorage()
  const target = new EventTarget()
  const repository = createLocalRepository({ storage, target })
  const listener = vi.fn()
  const unsubscribe = repository.subscribe(listener)

  storage.setItem(STORAGE_KEY, JSON.stringify(valid()))
  target.dispatchEvent(Object.assign(new Event('storage'), { key: STORAGE_KEY }))
  target.dispatchEvent(Object.assign(new Event('storage'), { key: 'something-else' }))

  expect(listener).toHaveBeenCalledTimes(1)
  expect(listener).toHaveBeenCalledWith(valid())

  unsubscribe()
  target.dispatchEvent(Object.assign(new Event('storage'), { key: STORAGE_KEY }))
  expect(listener).toHaveBeenCalledTimes(1)
})
