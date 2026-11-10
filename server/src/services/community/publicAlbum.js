// What strangers may see of a saved album snapshot. Snapshots come from users' browsers, so
// before one is shown publicly (shared collection, battle) it is cut down to a fixed list of
// fields and its links are checked:
// - covers only from Spotify's image servers or our own demo artwork (an image from any other
//   host could be a tracking pixel that tells a stranger who opened the page)
// - the Spotify link only to open.spotify.com
// A bad link is dropped (the album still shows, without it); a broken album is rejected.
import { z } from 'zod'

const ALBUM_ID = /^[A-Za-z0-9_-]{1,100}$/
const MOCK_ART = /^\/api\/mock\/art\/[A-Za-z0-9_-]{1,100}\.svg$/
const IMAGE_HOSTS = /(^|\.)(scdn\.co|spotifycdn\.com)$/

function parseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function safeCoverUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return null
  if (MOCK_ART.test(value)) return value
  const url = parseUrl(value)
  return url && url.protocol === 'https:' && IMAGE_HOSTS.test(url.hostname) && !url.username ? url.href : null
}

export function safeSpotifyUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return null
  const url = parseUrl(value)
  return url && url.protocol === 'https:' && url.hostname === 'open.spotify.com' && !url.username ? url.href : null
}

const text = (max) => z.string().trim().min(1).max(max)

const publicAlbumSchema = z.object({
  id: z.string().regex(ALBUM_ID),
  name: text(300),
  artists: z
    .array(z.object({ id: z.string().max(200), name: text(200) }))
    .max(20)
    .default([]),
  albumType: z.string().max(30).nullish().transform((value) => value ?? null),
  releaseDate: z.string().max(10).nullish().transform((value) => value ?? null),
  year: z.number().int().min(1000).max(3000).nullish().transform((value) => value ?? null),
  totalTracks: z.number().int().min(0).max(10000).nullish().transform((value) => value ?? null),
  coverUrl: z.string().nullable(),
  spotifyUrl: z.string().nullable(),
})

// The cleaned public snapshot, or null when the snapshot cannot be shown at all
export function toPublicAlbum(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const result = publicAlbumSchema.safeParse({
    ...snapshot,
    coverUrl: safeCoverUrl(snapshot.coverUrl),
    spotifyUrl: safeSpotifyUrl(snapshot.spotifyUrl),
  })
  return result.success ? result.data : null
}
