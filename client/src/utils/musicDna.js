// The "Music DNA" card: a few short traits that describe a library, built from computeInsights.
import { pluralize } from './format.js'

const RATING_MIDPOINT = 5.5

const listOf = (items) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)
const percent = (part, whole) => Math.round((part / whole) * 100)

export function explorerStyle(artists, albums) {
  const ratio = artists / albums
  if (ratio >= 0.8) return { label: 'Explorer', detail: 'Almost every album is by a different artist.' }
  if (ratio >= 0.5) return { label: 'Balanced', detail: 'A mix of favourite artists and new names.' }
  return { label: 'Deep diver', detail: 'You go deep into the artists you love.' }
}

export function ratingStyle(averageRating) {
  if (averageRating === null) return null
  if (averageRating >= 7) return { label: 'Generous', detail: `Average rating ${averageRating}/10, above the middle of the scale.` }
  if (averageRating <= RATING_MIDPOINT - 1) return { label: 'Critical', detail: `Average rating ${averageRating}/10, below the middle of the scale.` }
  return { label: 'Balanced', detail: `Average rating ${averageRating}/10, close to the middle of the scale.` }
}

// Returns null for an empty library. Otherwise { headline, traits: [{ key, label, value, detail }] }
export function buildMusicDna(insights) {
  const { totals } = insights
  if (totals.albums === 0) return null
  const traits = []

  const sounds = insights.genres.length ? insights.genres : insights.tags
  if (sounds.length) {
    const kind = insights.genres.length ? 'genres' : 'tags'
    const top = sounds.slice(0, 3).map((item) => item.name)
    traits.push({ key: 'core', label: kind === 'genres' ? 'Core genres' : 'Core tags', value: listOf(top), detail: `Your most common ${kind}.` })
  }

  const home = [...insights.decades].sort((a, b) => b.albums - a.albums || b.decade - a.decade)[0]
  if (home) traits.push({ key: 'decade', label: 'Home decade', value: home.label, detail: `${home.albums} of ${pluralize(totals.albums, 'album')} come from the ${home.label}.` })

  if (insights.topArtists.length) {
    traits.push({ key: 'artists', label: 'Top artists', value: listOf(insights.topArtists.slice(0, 3).map((a) => a.name)), detail: 'The artists with the most albums in your library.' })
  }

  const explorer = explorerStyle(totals.artists, totals.albums)
  traits.push({ key: 'explorer', label: 'Listening style', value: explorer.label, detail: `${pluralize(totals.artists, 'artist')} across ${pluralize(totals.albums, 'album')}. ${explorer.detail}` })

  const rating = ratingStyle(insights.averageRating)
  if (rating) traits.push({ key: 'rating', label: 'Rating style', value: rating.label, detail: rating.detail })

  const listened = insights.statusCounts.listened
  traits.push({ key: 'finisher', label: 'Listened', value: `${percent(listened, totals.albums)}%`, detail: `${listened} of your saved albums are marked Listened.` })

  const headline = [rating?.label, explorer.label].filter(Boolean).join(' ')
  return { headline, traits }
}
