// Turns the library (and the discovery quiz) into a preference profile: three vectors saying how
// much the user likes each genre or tag, each decade and each artist. Pure functions only.
import { addWeighted } from './vectors.js'

// How much one saved album counts. A favourite counts double, an album only on the wish list
// a bit less than one, and the rating scales it: 10/10 doubles it, 1/10 nearly removes it.
export const STATUS_WEIGHTS = { favourite: 2, listened: 1, listening: 1, want: 0.6 }
export const NO_STATUS_WEIGHT = 0.8
export const HIGH_RATING = 8

// One quiz pick counts as much as three saved albums: enough to seed an empty library,
// small enough to fade as the library grows
export const QUIZ_WEIGHT = 3

export const EMPTY_QUIZ = { genres: [], decades: [], artists: [] }

// A few common genres to start from; the user's own tags and catalogue genres are added to these
export const STARTER_GENRES = ['pop', 'rock', 'indie rock', 'hip hop', 'r&b', 'electronic', 'synthwave', 'dream pop', 'jazz', 'soul', 'folk', 'ambient', 'classical', 'metal', 'afrobeats', 'qawwali']
export const QUIZ_DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020]

export function entryWeight(entry) {
  const status = entry.status ? (STATUS_WEIGHTS[entry.status] ?? 1) : NO_STATUS_WEIGHT
  const rating = entry.rating ? entry.rating / 5 : 1
  return status * rating
}

// 1987 -> 1980; anything that is not a year -> null
export const decadeOf = (year) => (Number.isInteger(year) && year > 0 ? Math.floor(year / 10) * 10 : null)
export const decadeLabel = (decade) => `${decade}s`

// genresByArtist: { artistId: ['synthwave', ...] }, from the catalogue (empty on Spotify today)
export function buildProfile(entries, { genresByArtist = {}, quiz = EMPTY_QUIZ } = {}) {
  const genres = {} // genres and tags share one vocabulary, all lowercase
  const decades = {}
  const artists = {}
  const tagsByArtist = {} // the tags the user put on each artist's albums
  const artistNames = {}
  const artistStats = {} // { albums, highlyRated, favourites } per artist, for the explanations
  const ownedIds = new Set()

  for (const entry of entries) {
    const { album } = entry
    const weight = entryWeight(entry)
    ownedIds.add(album.id)

    const decade = decadeOf(album.year)
    if (decade !== null) addWeighted(decades, decade, weight)
    for (const tag of entry.tags) addWeighted(genres, tag, weight)

    album.artists.forEach((artist, index) => {
      artistNames[artist.id] = artist.name
      // The main artist gets the full weight, guests half
      addWeighted(artists, artist.id, index === 0 ? weight : weight / 2)
      for (const genre of genresByArtist[artist.id] ?? []) addWeighted(genres, genre.toLowerCase(), weight)

      tagsByArtist[artist.id] ??= {}
      for (const tag of entry.tags) addWeighted(tagsByArtist[artist.id], tag, weight)

      const stats = (artistStats[artist.id] ??= { albums: 0, highlyRated: 0, favourites: 0 })
      stats.albums++
      if (entry.rating >= HIGH_RATING) stats.highlyRated++
      if (entry.status === 'favourite') stats.favourites++
    })
  }

  for (const genre of quiz.genres) addWeighted(genres, genre.toLowerCase(), QUIZ_WEIGHT)
  for (const decade of quiz.decades) addWeighted(decades, decade, QUIZ_WEIGHT)
  for (const artist of quiz.artists) {
    addWeighted(artists, artist.id, QUIZ_WEIGHT)
    artistNames[artist.id] ??= artist.name
  }

  return {
    genres,
    decades,
    artists,
    tagsByArtist,
    artistNames,
    artistStats,
    ownedIds,
    quizArtistIds: new Set(quiz.artists.map((artist) => artist.id)),
    size: entries.length,
  }
}

// Artist ids, most liked first: the order in which Albumly asks about artists
export function rankedArtistIds(profile) {
  return Object.entries(profile.artists)
    .sort((a, b) => b[1] - a[1] || (profile.artistNames[a[0]] ?? a[0]).localeCompare(profile.artistNames[b[0]] ?? b[0]))
    .map(([id]) => id)
}
