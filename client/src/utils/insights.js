// Numbers about the user's Albumly library (never "Spotify listening stats": Albumly only knows
// what was saved here). Mostly group-by aggregation: put items into buckets by a key, then count.
import { STATUS_KEYS } from './library.js'
import { decadeLabel, decadeOf } from './preferences.js'

// Group-by: Map(key -> items with that key), in the order keys were first seen.
// keyOf may return an array, so one item can land in several groups (an album with two artists).
export function groupBy(items, keyOf) {
  const groups = new Map()
  for (const item of items) {
    const keys = [keyOf(item)].flat().filter((key) => key !== null && key !== undefined)
    for (const key of new Set(keys)) {
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(item)
    }
  }
  return groups
}

const round1 = (value) => Math.round(value * 10) / 10
const average = (numbers) => (numbers.length ? round1(numbers.reduce((sum, n) => sum + n, 0) / numbers.length) : null)
const ratingsOf = (entries) => entries.map((entry) => entry.rating).filter(Boolean)

// Bigger groups first, then the higher average rating, then A to Z
const byCount = (a, b) => b.albums - a.albums || (b.averageRating ?? 0) - (a.averageRating ?? 0) || a.name.localeCompare(b.name)

export function computeInsights(entries, collections = [], { genresByArtist = {} } = {}) {
  // Artists: every credited artist counts, so a duet counts for both
  const artistNames = new Map(entries.flatMap((entry) => entry.album.artists.map((a) => [a.id, a.name])))
  const topArtists = [...groupBy(entries, (entry) => entry.album.artists.map((a) => a.id))]
    .map(([id, group]) => ({ id, name: artistNames.get(id), albums: group.length, averageRating: average(ratingsOf(group)) }))
    .sort(byCount)

  // Genres come from the catalogue's artists (none on Spotify today), each counted once per album
  const genres = [...groupBy(entries, (entry) => entry.album.artists.flatMap((a) => (genresByArtist[a.id] ?? []).map((g) => g.toLowerCase())))]
    .map(([name, group]) => ({ name, albums: group.length, averageRating: average(ratingsOf(group)) }))
    .sort(byCount)
  const tags = [...groupBy(entries, (entry) => entry.tags)].map(([name, group]) => ({ name, albums: group.length, averageRating: average(ratingsOf(group)) })).sort(byCount)
  const topGenre = genres[0] ? { ...genres[0], kind: 'genre' } : tags[0] ? { ...tags[0], kind: 'tag' } : null

  const byDecade = groupBy(entries, (entry) => decadeOf(entry.album.year))
  const decades = [...byDecade]
    .map(([decade, group]) => ({ decade, label: decadeLabel(decade), albums: group.length }))
    .sort((a, b) => a.decade - b.decade)

  const ratings = ratingsOf(entries)
  const byRating = groupBy(entries, (entry) => entry.rating)
  const ratingDistribution = Array.from({ length: 10 }, (_, i) => ({ rating: i + 1, albums: byRating.get(i + 1)?.length ?? 0 }))

  const statusCounts = Object.fromEntries([...STATUS_KEYS, 'none'].map((key) => [key, 0]))
  for (const entry of entries) statusCounts[entry.status ?? 'none']++

  const durations = entries.map((entry) => entry.album.totalDurationMs).filter((ms) => Number.isFinite(ms) && ms > 0)

  return {
    totals: {
      albums: entries.length,
      artists: artistNames.size,
      collections: collections.length,
      rated: ratings.length,
      tracks: entries.reduce((sum, entry) => sum + (entry.album.totalTracks ?? 0), 0),
      durationMs: durations.reduce((sum, ms) => sum + ms, 0),
      durationKnownFor: durations.length,
    },
    statusCounts,
    topArtists,
    topArtist: topArtists[0] ?? null,
    genres,
    tags,
    topGenre,
    decades,
    unknownYear: entries.length - decades.reduce((sum, d) => sum + d.albums, 0),
    ratingDistribution,
    averageRating: average(ratings),
  }
}
