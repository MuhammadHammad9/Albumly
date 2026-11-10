import { expect, test } from 'vitest'
import { bfs, buildArtistGraph, neighboursOf, pathTo, radialLayout, unknownNeighbours, visitedEdges } from './artistGraph.js'

// A chain A - B - C - D, plus E connected to A and B (a cycle A-B-E)
const r = (id, ...artists) => ({ id, name: `R ${id}`, artists: artists.map((a) => ({ id: a, name: a.toUpperCase() })) })
const graph = buildArtistGraph({
  a: [r('1', 'a'), r('2', 'b')], // A appears on B's release 2
  b: [r('3', 'b', 'c'), r('4', 'e')],
  c: [r('5', 'c', 'd')],
  e: [r('6', 'e', 'a')],
})

test('artists on the same release are connected, with the shared releases kept', () => {
  expect(graph.nodes.get('b')).toBe('B')
  expect(graph.edges.get('a').get('b')).toEqual([{ id: '2', name: 'R 2' }])
  expect(graph.edges.get('b').get('a')).toEqual([{ id: '2', name: 'R 2' }])
  expect(neighboursOf(graph, 'b')).toEqual(['a', 'c', 'e'])
})

test('BFS visits by distance and remembers how it got there', () => {
  const result = bfs(graph, ['a'], { maxDepth: 5 })
  expect(result.order).toEqual(['a', 'b', 'e', 'c', 'd'])
  expect(Object.fromEntries(result.depth)).toEqual({ a: 0, b: 1, e: 1, c: 2, d: 3 })
  expect(pathTo(result, 'd')).toEqual(['a', 'b', 'c', 'd'])
  expect(pathTo(result, 'zzz')).toBeNull()
})

test('BFS stops at the depth limit', () => {
  const result = bfs(graph, ['a'], { maxDepth: 1 })
  expect(result.order).toEqual(['a', 'b', 'e'])
  expect(result.truncated).toBe(false)
})

test('BFS stops at the node cap and says so', () => {
  const result = bfs(graph, ['a'], { maxDepth: 5, maxNodes: 3 })
  expect(result.order).toEqual(['a', 'b', 'e'])
  expect(result.truncated).toBe(true)
})

test('several starting artists all start at distance 0; cycles are visited once', () => {
  const result = bfs(graph, ['d', 'a', 'd'], { maxDepth: 2 })
  expect(result.depth.get('d')).toBe(0)
  expect(result.depth.get('a')).toBe(0)
  expect(result.depth.get('c')).toBe(1)
  expect(result.order.length).toBe(new Set(result.order).size)
})

test('a starting artist with no data is still placed', () => {
  expect(bfs(graph, ['lonely']).order).toEqual(['lonely'])
})

test('visited edges are listed once each', () => {
  const result = bfs(graph, ['a'], { maxDepth: 1 })
  expect(visitedEdges(graph, result).map((e) => `${e.from}-${e.to}`).sort()).toEqual(['a-b', 'a-e', 'b-e'])
})

test('radial layout: start in the centre, each step further out', () => {
  const result = bfs(graph, ['a'], { maxDepth: 2 })
  const positions = radialLayout(result, { size: 400, padding: 40 })
  expect(positions.get('a')).toEqual({ x: 200, y: 200 })
  const distance = (id) => Math.hypot(positions.get(id).x - 200, positions.get(id).y - 200)
  expect(distance('b')).toBeCloseTo(80, 0)
  expect(distance('c')).toBeCloseTo(160, 0)
})

test('unknown neighbours: credited artists without data, most frequent first', () => {
  const known = [
    { id: 'a', releases: [r('1', 'a', 'x'), r('2', 'y', 'x')] },
    { id: 'b', releases: null },
  ]
  expect(unknownNeighbours(known)).toEqual(['x', 'y'])
  expect(unknownNeighbours(known, 1)).toEqual(['x'])
})
