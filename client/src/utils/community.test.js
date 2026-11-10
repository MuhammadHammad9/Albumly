import { expect, test, vi } from 'vitest'
import { artistNames, choiceFromKey, leaderText, pickRandomPair, votePercentages } from './battles.js'
import { createCommunityApi, shareUrl } from './communityApi.js'
import { blockedList, errorRate, formatCount, formatMs, formatPercent, formatUptime, timelineRows } from './metrics.js'
import { safeImageUrl, safeSpotifyUrl } from './safeUrl.js'

test('image links: Spotify image servers and demo art only', () => {
  expect(safeImageUrl('https://i.scdn.co/image/abc')).toBe('https://i.scdn.co/image/abc')
  expect(safeImageUrl('/api/mock/art/glass-arcade.svg')).toBe('/api/mock/art/glass-arcade.svg')
  for (const bad of ['//evil.example/x.png', 'javascript:alert(1)', 'data:image/png;base64,AA', 'http://i.scdn.co/x', 'https://evil.example/x.png', '/api/mock/art/../x.svg', null]) {
    expect(safeImageUrl(bad), String(bad)).toBeNull()
  }
})

test('external links: open.spotify.com over https only', () => {
  expect(safeSpotifyUrl('https://open.spotify.com/album/x')).toBe('https://open.spotify.com/album/x')
  for (const bad of ['javascript:alert(1)', 'https://open.spotify.com.evil.example/', '//open.spotify.com/album/x', 'http://open.spotify.com/album/x', undefined]) {
    expect(safeSpotifyUrl(bad), String(bad)).toBeNull()
  }
})

test('vote percentages always add up to 100', () => {
  expect(votePercentages(0, 0)).toEqual({ a: 0, b: 0, total: 0 })
  expect(votePercentages(1, 2)).toEqual({ a: 33, b: 67, total: 3 })
  expect(votePercentages(2, 1)).toEqual({ a: 67, b: 33, total: 3 })
})

test('leader text, keys, random pairs and artist names', () => {
  const albumA = { name: 'Discovery' }
  const albumB = { name: 'Homework' }
  expect(leaderText({ votesA: 0, votesB: 0, albumA, albumB })).toBe('No votes yet')
  expect(leaderText({ votesA: 2, votesB: 2, albumA, albumB })).toBe("It's a tie")
  expect(leaderText({ votesA: 1, votesB: 3, albumA, albumB })).toBe('Homework is ahead')
  expect(choiceFromKey('ArrowLeft')).toBe('a')
  expect(choiceFromKey('ArrowRight')).toBe('b')
  expect(choiceFromKey('Enter')).toBeNull()
  expect(pickRandomPair(['x'])).toBeNull()
  expect(pickRandomPair(['x', 'y', 'z'], () => 0)).toEqual(['x', 'y'])
  expect(pickRandomPair(['x', 'y', 'z'], () => 0.99)).toEqual(['z', 'y'])
  for (let i = 0; i < 20; i++) {
    const [a, b] = pickRandomPair(['x', 'y', 'z'])
    expect(a).not.toBe(b)
  }
  expect(artistNames({ artists: [{ name: 'A' }, { name: 'B' }] })).toBe('A, B')
  expect(artistNames(null)).toBe('')
})

test('dashboard formatters', () => {
  expect(formatPercent(0.857)).toBe('85.7%')
  expect(formatPercent(0)).toBe('0%')
  expect(formatPercent(1)).toBe('100%')
  expect(formatPercent(NaN)).toBe('–')
  expect(formatMs(1234.4)).toBe('1,234 ms')
  expect(formatCount(12345)).toBe('12,345')
  expect(formatCount(undefined)).toBe('–')
  expect(formatUptime(42)).toBe('42 s')
  expect(formatUptime(3725)).toBe('1 h 2 min')
  expect(formatUptime(90000)).toBe('1 d 1 h')
  expect(formatUptime(600)).toBe('10 min')
  expect(errorRate({ total: 200, errors: 5 })).toBe(0.025)
  expect(errorRate({ total: 0, errors: 0 })).toBe(0)
  expect(blockedList({ '/a': 10, '/b': 3600 })).toEqual([
    { endpoint: '/b', secondsLeft: 3600 },
    { endpoint: '/a', secondsLeft: 10 },
  ])
  const [row] = timelineRows([{ t: new Date(2026, 10, 10, 9, 5).toISOString(), requests: 3, errors: 1, rateLimited: 0 }])
  expect(row).toEqual({ time: '09:05', requests: 3, errors: 1, rateLimited: 0 })
})

test('the API wrapper builds the right requests', async () => {
  const request = vi.fn(async () => ({}))
  const api = createCommunityApi(request)

  await api.getPublicCollection('road-trip-abc12345')
  await api.saveShare('c 1', { visibility: 'public', includeReviews: true })
  await api.listBattles({ view: 'vote', limit: 10 })
  await api.listBattles()
  await api.vote('b1', 'a')
  await api.report({ targetType: 'review', slug: 's-1', albumId: 'x' }, { reason: 'spam' })
  await api.resolveReport('r1', { action: 'dismiss' })
  await api.unhide('review', 's-1:x')

  expect(request.mock.calls).toEqual([
    ['GET', '/api/public/collections/road-trip-abc12345', { auth: false }],
    ['PUT', '/api/collections/c%201/share', { auth: true, body: { visibility: 'public', includeReviews: true } }],
    ['GET', '/api/battles?view=vote&limit=10', { auth: 'optional' }],
    ['GET', '/api/battles', { auth: 'optional' }],
    ['POST', '/api/battles/b1/vote', { auth: true, body: { choice: 'a' } }],
    ['POST', '/api/reports', { auth: true, body: { targetType: 'review', slug: 's-1', albumId: 'x', reason: 'spam', details: '' } }],
    ['POST', '/api/admin/reports/r1/resolve', { auth: true, body: { action: 'dismiss' } }],
    ['DELETE', '/api/admin/hides/review/s-1%3Ax', { auth: true }],
  ])
  expect(shareUrl('abc-12345678', 'https://albumly.test')).toBe('https://albumly.test/shared/abc-12345678')
})
