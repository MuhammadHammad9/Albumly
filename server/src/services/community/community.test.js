// Pure helpers for shared collections and battles: slugs, public snapshots, ranking, input rules
import express from 'express'
import { expect, test } from 'vitest'
import { errorHandler } from '../../middleware/errorHandler.js'
import { safeCoverUrl, safeSpotifyUrl, toPublicAlbum } from './publicAlbum.js'
import { createCommunityLimits } from './rateLimits.js'
import { rankLeaderboard, wilsonLowerBound } from './ranking.js'
import { battleCreateSchema, battlesQuerySchema, hideTargetSchema, reportSchema, shareSettingsSchema } from './schemas.js'
import { makeSlug, randomSuffix, slugSchema, slugifyName } from './slug.js'

// ---------- slugs ----------

test('slug names keep letters and digits, drop accents and turn the rest into dashes', () => {
  expect(slugifyName('Late Night Drives')).toBe('late-night-drives')
  expect(slugifyName('Café Noir — Live!')).toBe('cafe-noir-live')
  expect(slugifyName('  --Hello__World--  ')).toBe('hello-world')
  expect(slugifyName('🎧🎶')).toBe('collection')
  expect(slugifyName('')).toBe('collection')
  expect(slugifyName('a'.repeat(39) + ' bcd')).toBe('a'.repeat(39)) // cut at 40, no trailing dash
})

test('a full slug is valid, at most 60 characters and random at the end', () => {
  const slug = makeSlug('x'.repeat(100))
  expect(slugSchema.safeParse(slug).success).toBe(true)
  expect(slug.length).toBeLessThanOrEqual(60)
  expect(randomSuffix()).toMatch(/^[a-z0-9]{8}$/)
  expect(makeSlug('Road Trip', 'abc12345')).toBe('road-trip-abc12345')
  expect(randomSuffix(3, () => 0)).toBe('aaa')
})

test('the slug check rejects anything that is not lowercase words and dashes', () => {
  for (const bad of ['Road-Trip', 'road--trip', '-road', 'road/trip', '../etc', 'a'.repeat(61), '']) {
    expect(slugSchema.safeParse(bad).success, bad).toBe(false)
  }
})

// ---------- public album snapshots ----------

const snapshot = {
  id: '4aawyAB9vmqN3uQ7FjRGTy',
  name: 'Discovery',
  artists: [{ id: 'daft', name: 'Daft Punk' }],
  albumType: 'album',
  inferredType: 'album',
  releaseDate: '2001-03-12',
  precision: 'day',
  year: 2001,
  totalTracks: 14,
  coverUrl: 'https://i.scdn.co/image/ab67616d0000b273',
  spotifyUrl: 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy',
  totalDurationMs: 3662000,
  notes: 'private!',
}

test('a public snapshot keeps only the whitelisted fields', () => {
  expect(toPublicAlbum(snapshot)).toEqual({
    id: '4aawyAB9vmqN3uQ7FjRGTy',
    name: 'Discovery',
    artists: [{ id: 'daft', name: 'Daft Punk' }],
    albumType: 'album',
    releaseDate: '2001-03-12',
    year: 2001,
    totalTracks: 14,
    coverUrl: 'https://i.scdn.co/image/ab67616d0000b273',
    spotifyUrl: 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy',
  })
})

test('unsafe links are dropped but the album still shows', () => {
  const album = toPublicAlbum({ ...snapshot, coverUrl: 'https://tracker.example/pixel.gif', spotifyUrl: 'javascript:alert(1)' })
  expect(album.coverUrl).toBeNull()
  expect(album.spotifyUrl).toBeNull()
  expect(album.name).toBe('Discovery')
})

test('cover and Spotify link rules', () => {
  expect(safeCoverUrl('/api/mock/art/glass-arcade.svg')).toBe('/api/mock/art/glass-arcade.svg')
  expect(safeCoverUrl('https://mosaic.scdn.co/640/abc')).toBe('https://mosaic.scdn.co/640/abc')
  expect(safeCoverUrl('https://image-cdn-ak.spotifycdn.com/image/abc')).toBe('https://image-cdn-ak.spotifycdn.com/image/abc')
  for (const bad of ['//evil.example/x.png', 'http://i.scdn.co/image/x', 'https://scdn.co.evil.example/x', 'https://evilscdn.co/x', 'data:image/png;base64,AAAA', '/api/mock/art/../../x.svg', 'https://user@i.scdn.co/x', null, 42]) {
    expect(safeCoverUrl(bad), String(bad)).toBeNull()
  }
  expect(safeSpotifyUrl('https://open.spotify.com/album/x')).toBe('https://open.spotify.com/album/x')
  for (const bad of ['https://open.spotify.com.evil.example/album/x', 'http://open.spotify.com/album/x', '/album/x', 'javascript:alert(1)']) {
    expect(safeSpotifyUrl(bad), bad).toBeNull()
  }
})

test('a broken snapshot is rejected', () => {
  expect(toPublicAlbum(null)).toBeNull()
  expect(toPublicAlbum({ ...snapshot, name: '   ' })).toBeNull()
  expect(toPublicAlbum({ ...snapshot, id: 'bad id!' })).toBeNull()
  expect(toPublicAlbum({ ...snapshot, artists: 'Daft Punk' })).toBeNull()
})

// ---------- ranking ----------

test('Wilson lower bound rewards evidence, not just a high rate', () => {
  expect(wilsonLowerBound(0, 0)).toBe(0)
  expect(wilsonLowerBound(1, 1)).toBeCloseTo(0.207, 3)
  expect(wilsonLowerBound(90, 100)).toBeCloseTo(0.826, 3)
  expect(wilsonLowerBound(90, 100)).toBeGreaterThan(wilsonLowerBound(5, 5))
})

test('the leaderboard ranks by score, needs enough votes and numbers the rows', () => {
  const album = (name) => ({ id: name, name })
  const rows = [
    { albumId: 'a', album: album('A'), wins: 5, votes: 5 },
    { albumId: 'b', album: album('B'), wins: 90, votes: 100 },
    { albumId: 'c', album: album('C'), wins: 3, votes: 3 }, // too few votes
    { albumId: 'd', album: album('D'), wins: 10, votes: 40 },
  ]
  const ranked = rankLeaderboard(rows, { minVotes: 5 })
  expect(ranked.map((row) => [row.rank, row.albumId])).toEqual([
    [1, 'b'],
    [2, 'a'],
    [3, 'd'],
  ])
  expect(ranked[0]).toMatchObject({ winRate: 0.9, score: 0.826, wins: 90, votes: 100 })
  expect(rankLeaderboard(rows, { minVotes: 5, limit: 1 })).toHaveLength(1)
})

// ---------- input rules ----------

test('share settings, battle and query rules', () => {
  expect(shareSettingsSchema.parse({ visibility: 'public' })).toEqual({ visibility: 'public', includeReviews: false })
  expect(shareSettingsSchema.safeParse({ visibility: 'public', hiddenAt: null }).success).toBe(false) // owners cannot sneak in moderation fields
  expect(battleCreateSchema.safeParse({ albumIds: ['a', 'a'] }).success).toBe(false)
  expect(battleCreateSchema.safeParse({ albumIds: ['a'] }).success).toBe(false)
  expect(battleCreateSchema.safeParse({ albumIds: ['a', 'b'] }).success).toBe(true)
  expect(battlesQuerySchema.parse({ limit: '5' })).toEqual({ view: 'recent', limit: 5 })
  expect(battlesQuerySchema.safeParse({ limit: '500' }).success).toBe(false)
})

test('reports need the right target for their type', () => {
  expect(reportSchema.parse({ targetType: 'collection', slug: 'road-trip-abc12345', reason: 'spam' })).toEqual({ targetType: 'collection', slug: 'road-trip-abc12345', reason: 'spam', details: '' })
  expect(reportSchema.safeParse({ targetType: 'review', slug: 'road-trip-abc12345', reason: 'spam' }).success).toBe(false)
  expect(reportSchema.safeParse({ targetType: 'battle', battleId: 'nope', reason: 'spam' }).success).toBe(false)
  expect(reportSchema.safeParse({ targetType: 'collection', slug: 'road-trip-abc12345', reason: 'because' }).success).toBe(false)
  expect(reportSchema.safeParse({ targetType: 'collection', slug: 'x-y', reason: 'other', details: 'x'.repeat(501) }).success).toBe(false)
})

test('hide targets', () => {
  expect(hideTargetSchema.safeParse({ type: 'review', key: 'road-trip-abc12345:4aawyAB9vmqN3uQ7FjRGTy' }).success).toBe(true)
  expect(hideTargetSchema.safeParse({ type: 'review', key: 'road-trip-abc12345' }).success).toBe(false)
  expect(hideTargetSchema.safeParse({ type: 'battle', key: '1f0c2a5e-8d3b-4c1a-9e7f-2b6d4a8c0e11' }).success).toBe(true)
})

// ---------- rate limits ----------

test('community limits answer with the usual 429 envelope, and can be turned off', async () => {
  const app = express()
  const limits = createCommunityLimits({ vote: { windowMs: 60_000, limit: 1 } })
  app.post('/vote', limits.vote, (req, res) => res.json({ ok: true }))
  app.post('/free', createCommunityLimits(false).vote, (req, res) => res.json({ ok: true }))
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://localhost:${server.address().port}`
  try {
    expect((await fetch(`${url}/vote`, { method: 'POST' })).status).toBe(200)
    const limited = await fetch(`${url}/vote`, { method: 'POST' })
    expect(limited.status).toBe(429)
    expect((await limited.json()).error).toMatchObject({ code: 'rate_limited' })
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
    expect((await fetch(`${url}/free`, { method: 'POST' })).status).toBe(200)
    expect((await fetch(`${url}/free`, { method: 'POST' })).status).toBe(200)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
