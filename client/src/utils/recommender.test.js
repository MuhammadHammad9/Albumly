import { expect, test } from 'vitest'
import { ENTRIES, GENRES, KNOWN_ARTISTS, release } from './intelligenceFixtures.js'
import { buildProfile } from './preferences.js'
import { DEFAULT_WEIGHTS, combine, generateCandidates, recommend, sanitizeWeights, scoreParts } from './recommender.js'

const profile = buildProfile(ENTRIES, { genresByArtist: GENRES })
const owned = ENTRIES.map((entry) => entry.album)

test('candidates: no owned albums, no other editions of them, no plain singles or compilations', () => {
  const ids = generateCandidates(KNOWN_ARTISTS, profile, owned).map((r) => r.id)
  expect(ids.sort()).toEqual(['k3', 'm3', 'm4', 'n4', 'o1'])
})

test('exit criterion: recommendations exclude owned albums and each has a reason', () => {
  const { results } = recommend({ knownArtists: KNOWN_ARTISTS, profile, ownedAlbums: owned })
  expect(results.length).toBeGreaterThan(0)
  const ownedIds = new Set(owned.map((album) => album.id))
  for (const result of results) {
    expect(ownedIds.has(result.release.id)).toBe(false)
    expect(result.release.id).not.toBe('n2d')
    expect(result.reasons.length).toBeGreaterThan(0)
    expect(result.reasons[0].text).toMatch(/\w/)
  }
})

test('the connection reason names the path through the graph', () => {
  const { results } = recommend({ knownArtists: KNOWN_ARTISTS, profile, ownedAlbums: owned, weights: { genre: 0, era: 0, connection: 1, taste: 0 } })
  const sleepMaps = results.find((r) => r.release.id === 'o1')
  expect(sleepMaps.parts.connection).toBeCloseTo(0.5)
  expect(sleepMaps.reasons[0].text).toBe('Connected to your library: Kite & Ember → Oda Lindqvist (on “Wintering”)')
  // Oda has no genres and the user tagged none of her albums, so genre is not counted
  expect(sleepMaps.parts.genre).toBeNull()
  expect(sleepMaps.notes[0]).toMatch(/Genre not counted/)
})

test('a strong taste reason for the favourite artist', () => {
  const { results } = recommend({ knownArtists: KNOWN_ARTISTS, profile, ownedAlbums: owned })
  const afterimage = results.find((r) => r.release.id === 'n4')
  expect(afterimage.parts.taste).toBe(1)
  expect(afterimage.reasons.map((r) => r.text)).toContain('You rated 2 Neon Harbor albums 8/10 or higher')
  expect(results[0].release.id).toBe('n4') // the favourite artist's unsaved album comes first
})

test('combine by hand, leaving the unknown part out of the denominator', () => {
  // (2.5·0.8 + 2.5·1 + 3.5·0.5) / (2.5 + 2.5 + 3.5) = 6.25 / 8.5
  expect(combine({ genre: null, era: 0.8, connection: 1, taste: 0.5 }, DEFAULT_WEIGHTS)).toBeCloseTo(6.25 / 8.5)
  // With genre known as 0 it now drags the score down: 6.25 / 10
  expect(combine({ genre: 0, era: 0.8, connection: 1, taste: 0.5 }, DEFAULT_WEIGHTS)).toBeCloseTo(0.625)
  expect(combine({ genre: 1, era: 1, connection: 1, taste: 1 }, { genre: 0, era: 0, connection: 0, taste: 0 })).toBe(0)
})

test('score parts by hand for a one-album library', () => {
  const tiny = buildProfile([{ ...ENTRIES[6], tags: ['a'] }]) // k2: no status, no rating -> weight 0.8, 2014
  const candidate = release('x', 'X', '2015-01-01', [{ id: 'kite-and-ember', name: 'Kite & Ember' }])
  const parts = scoreParts(candidate, { profile: tiny, genresByArtist: {}, distance: new Map([['kite-and-ember', 0]]), maxArtistWeight: 0.8 })
  expect(parts.genre).toBeCloseTo(1) // its only tag matches the only profile tag
  expect(parts.era).toBeCloseTo(1 / Math.sqrt(1.5)) // {2010:1} vs {2010:1, 2000:.5, 2020:.5}
  expect(parts.connection).toBe(1)
  expect(parts.taste).toBe(1)
})

test('equal scores keep a stable order: newer first, then title', () => {
  const twins = [{ id: 'z', artist: null, releases: [release('b1', 'Beta', '2015-01-01', [{ id: 'z', name: 'Z' }]), release('a1', 'Alpha', '2015-01-01', [{ id: 'z', name: 'Z' }])] }]
  const quizProfile = buildProfile([], { quiz: { genres: [], decades: [], artists: [{ id: 'z', name: 'Z' }] } })
  const first = recommend({ knownArtists: twins, profile: quizProfile }).results.map((r) => r.release.id)
  expect(first).toEqual(['a1', 'b1'])
})

test('sanitizeWeights clamps and fills gaps', () => {
  expect(sanitizeWeights({ genre: -1, era: 99, connection: 'x' })).toEqual({ genre: 0, era: 10, connection: 2.5, taste: 3.5 })
})
