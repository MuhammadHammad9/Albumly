import { describe, expect, test } from 'vitest'
import { clampTime, mergeLibrary, uniqueName } from './merge.js'
import { T1, T2, collection, entry } from '../../test/testApp.js'

const lib = (entries = {}, collections = []) => ({ version: 1, entries, collections })

test('uniqueName adds the first free number', () => {
  expect(uniqueName('Mix', ['Other'])).toBe('Mix')
  expect(uniqueName('Mix', ['mix', 'Mix (2)'])).toBe('Mix (3)')
})

test('clampTime pulls far-future times back to now and leaves normal ones alone', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z')
  expect(clampTime('2099-01-01T00:00:00.000Z', now)).toBe('2026-06-01T00:00:00.000Z')
  expect(clampTime(T1, now)).toBe(T1)
})

describe('mergeLibrary', () => {
  test('reports which rows changed so only those are written', () => {
    const current = lib({ a: entry('a'), b: entry('b', { updatedAt: T2 }) })
    const incoming = lib({ a: entry('a', { rating: 5, updatedAt: T2 }), b: entry('b'), c: entry('c') })
    const result = mergeLibrary(current, incoming)

    expect([...result.changedEntryIds].sort()).toEqual(['a', 'c'])
    expect(result.summary).toMatchObject({ added: 1, updated: 1, unchanged: 1 })
  })

  test('a newer same-id collection whose name clashes with another gets a number', () => {
    const current = lib({ a: entry('a') }, [collection('c1', [], { name: 'Old' }), collection('c2', [], { name: 'Taken' })])
    const incoming = lib({ a: entry('a') }, [collection('c1', ['a'], { name: 'Taken', updatedAt: T2 })])
    const { library } = mergeLibrary(current, incoming)

    expect(library.collections.find((c) => c.id === 'c1')).toMatchObject({ name: 'Taken (2)', albumIds: ['a'] })
  })
})
