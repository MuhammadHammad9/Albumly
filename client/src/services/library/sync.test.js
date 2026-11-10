import { describe, expect, test } from 'vitest'
import { emptyLibrary } from './schema.js'
import { applyOperation, diffLibraries, requestFor } from './sync.js'
import { collection, entry } from '../../test/libraryFixtures.js'

const lib = (entries = {}, collections = []) => ({ ...emptyLibrary(), entries, collections })
const T2 = '2026-02-01T00:00:00.000Z'

// Applying every operation to the old copy must give exactly the new copy
const replay = (from, ops) => ops.reduce(applyOperation, from)

describe('diffLibraries', () => {
  test('nothing to send when both copies are the same', () => {
    const library = lib({ a: entry('a') }, [collection('c', ['a'])])
    expect(diffLibraries(library, structuredClone(library))).toEqual([])
  })

  test('new and changed albums are sent, removed ones deleted last', () => {
    const synced = lib({ a: entry('a'), gone: entry('gone') })
    const current = lib({ a: entry('a', { rating: 7, updatedAt: T2 }), b: entry('b') })
    const ops = diffLibraries(synced, current)

    expect(ops.map((op) => [op.type, op.albumId])).toEqual([
      ['putEntry', 'a'],
      ['putEntry', 'b'],
      ['deleteEntry', 'gone'],
    ])
    expect(replay(synced, ops)).toEqual(current)
  })

  test('a new collection is created, then filled in order, with no extra reorder', () => {
    const synced = lib({ a: entry('a'), b: entry('b') })
    const current = lib(synced.entries, [collection('c', ['b', 'a'])])
    const ops = diffLibraries(synced, current)

    expect(ops.map((op) => op.type)).toEqual(['createCollection', 'addToCollection', 'addToCollection'])
    expect(ops.slice(1).map((op) => op.albumId)).toEqual(['b', 'a'])
    expect(replay(synced, ops)).toEqual(current)
  })

  test('a reorder is one order operation', () => {
    const synced = lib({ a: entry('a'), b: entry('b') }, [collection('c', ['a', 'b'])])
    const current = lib(synced.entries, [collection('c', ['b', 'a'], { updatedAt: T2 })])
    const ops = diffLibraries(synced, current)

    expect(ops.map((op) => op.type)).toEqual(['updateCollection', 'orderCollection'])
    expect(replay(synced, ops)).toEqual(current)
  })

  test('deleting a collection comes before creating one, so its name can be reused', () => {
    const synced = lib({}, [collection('old', [], { name: 'Mix' })])
    const current = lib({}, [collection('new', [], { name: 'Mix' })])
    expect(diffLibraries(synced, current).map((op) => op.type)).toEqual(['deleteCollection', 'createCollection'])
  })

  test('removing a saved album also takes it out of collections, as the server does', () => {
    const synced = lib({ a: entry('a'), b: entry('b') }, [collection('c', ['a', 'b'])])
    const current = lib({ b: entry('b') }, [collection('c', ['b'], { updatedAt: T2 })])
    const ops = diffLibraries(synced, current)

    expect(ops.map((op) => op.type)).toEqual(['updateCollection', 'removeFromCollection', 'deleteEntry'])
    expect(replay(synced, ops)).toEqual(current)
  })
})

test('requestFor maps each operation to its API call, with ids made safe for the address', () => {
  expect(requestFor({ type: 'putEntry', albumId: 'a b', entry: { x: 1 } })).toEqual(['PUT', '/api/albums/a%20b/entry', { x: 1 }])
  expect(requestFor({ type: 'removeFromCollection', id: 'c', albumId: 'a' })).toEqual(['DELETE', '/api/collections/c/albums/a'])
  expect(requestFor({ type: 'orderCollection', id: 'c', albumIds: ['b'], updatedAt: T2 })).toEqual(['PATCH', '/api/collections/c/order', { albumIds: ['b'], updatedAt: T2 }])
})
