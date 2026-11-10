import { expect, test } from 'vitest'
import { addWeighted, cosineSimilarity, isEmptyVector, topEntries } from './vectors.js'

test('cosine similarity: same direction 1, nothing shared 0', () => {
  expect(cosineSimilarity({ a: 1, b: 2 }, { a: 1, b: 2 })).toBeCloseTo(1)
  expect(cosineSimilarity({ a: 1 }, { b: 1 })).toBe(0)
})

test('cosine similarity by hand: {a:1,b:2}·{a:2,b:1} = 4 / (√5·√5) = 0.8', () => {
  expect(cosineSimilarity({ a: 1, b: 2 }, { a: 2, b: 1 })).toBeCloseTo(0.8)
})

test('only direction matters, not size', () => {
  expect(cosineSimilarity({ a: 1, b: 2 }, { a: 10, b: 20 })).toBeCloseTo(1)
  expect(cosineSimilarity({ a: 3 }, { a: 3, b: 4 })).toBeCloseTo(3 / 5)
})

test('an empty or all-zero vector is similar to nothing', () => {
  expect(cosineSimilarity({}, { a: 1 })).toBe(0)
  expect(cosineSimilarity({ a: 0 }, { a: 1 })).toBe(0)
})

test('keys that look like object properties are ordinary keys', () => {
  const vector = addWeighted({}, 'constructor', 2)
  expect(vector.constructor).toBe(2)
  expect(cosineSimilarity({ toString: 1 }, { a: 1 })).toBe(0)
})

test('addWeighted, topEntries and isEmptyVector', () => {
  const vector = {}
  addWeighted(vector, 'x', 1)
  addWeighted(vector, 'x', 2)
  addWeighted(vector, 'y', 3)
  addWeighted(vector, 'z', 0.5)
  expect(topEntries(vector, 2)).toEqual([
    ['x', 3],
    ['y', 3],
  ])
  expect(isEmptyVector({})).toBe(true)
  expect(isEmptyVector({ a: 0 })).toBe(true)
  expect(isEmptyVector(vector)).toBe(false)
})
