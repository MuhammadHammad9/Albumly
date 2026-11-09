import { inferReleaseType } from '../catalog/classify.js'

// Turn Spotify's JSON into Albumly's own shapes, the same ones the mock catalogue produces.
// Every field Spotify might leave out (or has removed, like popularity) gets a safe default here,
// so nothing downstream has to guess.

// Spotify usually offers 640, 300 and 64 px versions. Cards display at about 180 px, so the
// smallest image at least 300 px wide looks sharp at roughly a quarter of the 640 px download.
// Falls back to the widest one when sizes are missing or all are small.
const MIN_IMAGE_WIDTH = 300
function firstImage(images) {
  if (!images?.length) return null
  const bySize = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  return (bySize.find((image) => image.width >= MIN_IMAGE_WIDTH) ?? bySize.at(-1)).url
}
const toArtistRef = (artist) => ({ id: artist.id, name: artist.name })
const spotifyUrl = (raw, kind) => raw.external_urls?.spotify ?? `https://open.spotify.com/${kind}/${raw.id}`

export function normalizeArtist(raw) {
  return {
    id: raw.id,
    name: raw.name,
    imageUrl: firstImage(raw.images),
    genres: raw.genres ?? [],
    spotifyUrl: spotifyUrl(raw, 'artist'),
  }
}

// `group` is how the release relates to the artist whose discography we are reading
// (album / single / compilation / appears_on). Spotify removed that field, so callers pass it in.
export function normalizeRelease(raw, group) {
  const albumType = raw.album_type?.toLowerCase() ?? 'album'
  const totalTracks = raw.total_tracks ?? 0
  const releaseDate = raw.release_date ?? ''

  return {
    id: raw.id,
    name: raw.name,
    group: group ?? albumType,
    albumType,
    inferredType: inferReleaseType({ albumType, totalTracks }),
    releaseDate,
    precision: raw.release_date_precision ?? 'day',
    year: Number(releaseDate.slice(0, 4)) || null,
    totalTracks,
    artists: (raw.artists ?? []).map(toArtistRef),
    coverUrl: firstImage(raw.images),
    spotifyUrl: spotifyUrl(raw, 'album'),
  }
}

export function normalizeTrack(raw) {
  return {
    id: raw.id,
    name: raw.name,
    discNumber: raw.disc_number ?? 1,
    trackNumber: raw.track_number ?? 0,
    durationMs: raw.duration_ms ?? 0,
    explicit: Boolean(raw.explicit),
    artists: (raw.artists ?? []).map(toArtistRef),
    spotifyUrl: spotifyUrl(raw, 'track'),
  }
}
