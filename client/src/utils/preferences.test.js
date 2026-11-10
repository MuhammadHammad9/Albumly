import { expect, test } from 'vitest'
import { ENTRIES, GENRES } from './intelligenceFixtures.js'
import { QUIZ_WEIGHT, buildProfile, decadeOf, entryWeight, rankedArtistIds } from './preferences.js'

test('entry weight: status times rating / 5', () => {
  expect(entryWeight({ status: 'favourite', rating: 10 })).toBe(4)
  expect(entryWeight({ status: 'listened', rating: 5 })).toBe(1)
  expect(entryWeight({ status: 'want', rating: null })).toBe(0.6)
  expect(entryWeight({ status: null, rating: null })).toBe(0.8)
  expect(entryWeight({ status: null, rating: 1 })).toBeCloseTo(0.16)
})

test('decadeOf', () => {
  expect(decadeOf(1987)).toBe(1980)
  expect(decadeOf(2010)).toBe(2010)
  expect(decadeOf(null)).toBeNull()
})

test('the profile adds up albums, tags, genres and decades', () => {
  const profile = buildProfile(ENTRIES, { genresByArtist: GENRES })
  // late night: n1 (listened 8 -> 1.6) + n2 (favourite 10 -> 4) + m1 (listened 9 -> 1.8) = 7.4
  expect(profile.genres['late night']).toBeCloseTo(7.4)
  // Neon Harbor as main artist on n1, n2, n3 (1.6 + 4 + 1.2) and guest on m2 (0.6 / 2)
  expect(profile.artists['neon-harbor']).toBeCloseTo(7.1)
  expect(profile.decades[2000]).toBeCloseTo(1.4) // l1: listening 7 -> 1.4
  expect(profile.artistStats['neon-harbor']).toEqual({ albums: 4, highlyRated: 2, favourites: 1 })
  expect(profile.ownedIds.has('m2')).toBe(true)
  expect(rankedArtistIds(profile)[0]).toBe('neon-harbor')
})

test('quiz picks seed an empty library', () => {
  const profile = buildProfile([], { quiz: { genres: ['Ambient'], decades: [1990], artists: [{ id: 'x', name: 'X' }] } })
  expect(profile.genres).toEqual({ ambient: QUIZ_WEIGHT })
  expect(profile.decades).toEqual({ 1990: QUIZ_WEIGHT })
  expect(profile.artists).toEqual({ x: QUIZ_WEIGHT })
  expect(profile.quizArtistIds.has('x')).toBe(true)
})
