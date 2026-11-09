import { expect, test } from 'vitest'
import { normalizeArtist, normalizeRelease, normalizeTrack } from './normalize.js'

const images = [
  { url: 'big', width: 640 },
  { url: 'medium', width: 300 },
  { url: 'small', width: 64 },
]

test('picks the smallest image that is at least 300 px wide', () => {
  expect(normalizeArtist({ id: 'a', name: 'A', images }).imageUrl).toBe('medium')
  expect(normalizeArtist({ id: 'a', name: 'A', images: [{ url: 'tiny', width: 64 }, { url: 'small', width: 160 }] }).imageUrl).toBe('small')
  expect(normalizeArtist({ id: 'a', name: 'A', images: [{ url: 'unsized' }] }).imageUrl).toBe('unsized')
  expect(normalizeArtist({ id: 'a', name: 'A', images: [] }).imageUrl).toBeNull()
})

test('fields Spotify leaves out get safe defaults', () => {
  expect(normalizeArtist({ id: 'a', name: 'A' })).toEqual({
    id: 'a',
    name: 'A',
    imageUrl: null,
    genres: [],
    spotifyUrl: 'https://open.spotify.com/artist/a',
  })
  expect(normalizeRelease({ id: 'r', name: 'R' })).toMatchObject({ group: 'album', totalTracks: 0, year: null, artists: [], coverUrl: null })
  expect(normalizeTrack({ id: 't', name: 'T' })).toMatchObject({ discNumber: 1, explicit: false, durationMs: 0 })
})

test('album_type is lower-cased (Spotify has sent upper case before) and the group defaults to it', () => {
  expect(normalizeRelease({ id: 'r', name: 'R', album_type: 'SINGLE', total_tracks: 5 })).toMatchObject({
    albumType: 'single',
    group: 'single',
    inferredType: 'ep',
  })
})
