// Pure maths for comparing two albums: no React, easy to test.
import { formatDuration, formatLongDuration } from './format.js'

// The numbers worth comparing, computed from an album with its tracklist
export function albumStats(album) {
  const tracks = album.tracks ?? []
  const albumArtistIds = new Set(album.artists.map((artist) => artist.id))
  const guests = new Set()
  let featuredTrackCount = 0
  let explicitCount = 0

  for (const track of tracks) {
    if (track.explicit) explicitCount++
    // A guest is anyone credited on the track who is not one of the album's own artists
    const trackGuests = track.artists.filter((artist) => !albumArtistIds.has(artist.id))
    if (trackGuests.length > 0) featuredTrackCount++
    trackGuests.forEach((artist) => guests.add(artist.id))
  }

  const trackCount = tracks.length || album.totalTracks || 0
  const durationMs = album.totalDurationMs ?? tracks.reduce((sum, track) => sum + track.durationMs, 0)

  return {
    year: album.year ?? null,
    trackCount,
    durationMs,
    averageTrackMs: trackCount > 0 ? Math.round(durationMs / trackCount) : 0,
    explicitCount,
    featuredArtistCount: guests.size,
    featuredTrackCount,
    discCount: new Set(tracks.map((track) => track.discNumber)).size || 1,
  }
}

const MINUS = '−' // a real minus sign, the same width as "+"

const signed = (delta, text) => (delta > 0 ? `+${text}` : `${MINUS}${text}`)

// How to show each measure and its difference. `kind` picks the formatting.
export const COMPARE_METRICS = [
  { key: 'year', label: 'Release year', kind: 'year' },
  { key: 'trackCount', label: 'Tracks', kind: 'count' },
  { key: 'durationMs', label: 'Total length', kind: 'length' },
  { key: 'averageTrackMs', label: 'Average track length', kind: 'trackLength' },
  { key: 'explicitCount', label: 'Explicit tracks', kind: 'count' },
  { key: 'featuredArtistCount', label: 'Featured artists', kind: 'count' },
  { key: 'featuredTrackCount', label: 'Tracks with a guest', kind: 'count' },
  { key: 'discCount', label: 'Discs', kind: 'count' },
]

export function formatValue(kind, value) {
  if (value === null || value === undefined) return '—'
  if (kind === 'length') return formatLongDuration(value)
  if (kind === 'trackLength') return formatDuration(value)
  return String(value)
}

// Difference B minus A, in words: "+3", "−4 min", "+0:25", "5 years later", or "Same"
export function formatDelta(kind, delta) {
  if (delta === null) return '—'
  if (kind === 'length') {
    const minutes = Math.round(Math.abs(delta) / 60000)
    return minutes === 0 ? 'Same' : signed(delta, `${minutes} min`)
  }
  if (delta === 0) return 'Same'
  if (kind === 'year') {
    const years = Math.abs(delta)
    return `${years} ${years === 1 ? 'year' : 'years'} ${delta > 0 ? 'later' : 'earlier'}`
  }
  if (kind === 'trackLength') return signed(delta, formatDuration(Math.abs(delta)))
  return signed(delta, String(Math.abs(delta)))
}

// Rows for the comparison table: [{ key, label, a, b, delta, aText, bText, deltaText }]
export function compareAlbums(albumA, albumB) {
  const a = albumStats(albumA)
  const b = albumStats(albumB)
  return COMPARE_METRICS.map(({ key, label, kind }) => {
    const delta = a[key] === null || b[key] === null ? null : b[key] - a[key]
    return { key, label, a: a[key], b: b[key], delta, aText: formatValue(kind, a[key]), bText: formatValue(kind, b[key]), deltaText: formatDelta(kind, delta) }
  })
}

// Track lengths by running order, for the chart: [{ position: 1, a: 3.75, b: 4.1 }, ...] in minutes.
// The shorter album simply has no value past its last track.
export function trackLengthSeries(albumA, albumB) {
  const tracksA = albumA.tracks ?? []
  const tracksB = albumB.tracks ?? []
  const toMinutes = (track) => (track ? Math.round((track.durationMs / 60000) * 100) / 100 : null)
  return Array.from({ length: Math.max(tracksA.length, tracksB.length) }, (_, index) => ({
    position: index + 1,
    a: toMinutes(tracksA[index]),
    b: toMinutes(tracksB[index]),
  }))
}
