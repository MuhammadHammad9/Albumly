// The recommender: candidate generation -> weighted scoring -> a "why this?" explanation.
//   Score = (w1·G + w2·Y + w3·C + w4·U) / (sum of the weights of the parts that are known)
// G genre and tags, Y era, C connection, U your taste. Each part is a number from 0 to 1.
import { bfs, buildArtistGraph, pathTo } from './artistGraph.js'
import { normalizeTitle } from './library.js'
import { decadeLabel, decadeOf, rankedArtistIds } from './preferences.js'
import { cosineSimilarity, isEmptyVector, topEntries } from './vectors.js'

export const PARTS = ['genre', 'era', 'connection', 'taste']
export const PART_LABELS = { genre: 'Genre and tags', era: 'Era', connection: 'Connection', taste: 'Your taste' }

// Spotify gives new apps no genres, so genre has the smallest default share (scale 0 to 10)
export const DEFAULT_WEIGHTS = { genre: 1.5, era: 2.5, connection: 2.5, taste: 3.5 }
export const MAX_WEIGHT = 10

const MAX_CANDIDATES = 300
const KEPT_TYPES = new Set(['album', 'ep']) // plain singles and compilations are not recommended

const titleKey = (release) => `${release.artists?.[0]?.id ?? ''}|${normalizeTitle(release.name)}`
const byDateThenName = (a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '') || a.name.localeCompare(b.name)

// Releases worth scoring: albums and EPs from every known artist, minus anything owned, minus other
// editions of owned albums (same main artist, same title without "Deluxe" and so on), each once.
// The original edition is kept when several editions are candidates.
export function generateCandidates(knownArtists, profile, ownedAlbums = [], { max = MAX_CANDIDATES } = {}) {
  const ownedTitles = new Set(ownedAlbums.map(titleKey))
  const seenIds = new Set()
  const seenTitles = new Set()
  const all = []
  for (const { releases } of knownArtists) {
    for (const release of releases ?? []) {
      if (release.group === 'compilation' || !KEPT_TYPES.has(release.inferredType ?? release.albumType)) continue
      if (profile.ownedIds.has(release.id) || seenIds.has(release.id)) continue
      seenIds.add(release.id)
      all.push(release)
    }
  }
  const candidates = []
  for (const release of all.sort(byDateThenName)) {
    const key = titleKey(release)
    if (ownedTitles.has(key) || seenTitles.has(key)) continue
    seenTitles.add(key)
    candidates.push(release)
    if (candidates.length >= max) break
  }
  return candidates
}

// The genres of a candidate's artists plus the tags the user gave their other albums
export function candidateGenres(release, profile, genresByArtist) {
  const vector = {}
  for (const artist of release.artists ?? []) {
    for (const genre of genresByArtist[artist.id] ?? []) vector[genre.toLowerCase()] = 1
    const tags = profile.tagsByArtist[artist.id] ?? {}
    const strongest = Math.max(0, ...Object.values(tags))
    for (const [tag, weight] of Object.entries(tags)) vector[tag] = Math.max(Object.hasOwn(vector, tag) ? vector[tag] : 0, weight / strongest)
  }
  return vector
}

// Its decade at full strength and the decades either side at half, so near misses still count
export function decadeVector(year) {
  const decade = decadeOf(year)
  if (decade === null) return null
  return { [decade]: 1, [decade - 10]: 0.5, [decade + 10]: 0.5 }
}

// Combines the parts. A part that is null is unknown: it is left out of the top and the bottom,
// so a missing genre neither helps nor hurts.
export function combine(parts, weights) {
  let total = 0
  let weightSum = 0
  for (const part of PARTS) {
    if (parts[part] === null) continue
    total += weights[part] * parts[part]
    weightSum += weights[part]
  }
  return weightSum === 0 ? 0 : total / weightSum
}

// context: { profile, genresByArtist, distance: Map(artistId -> steps), maxArtistWeight }
export function scoreParts(release, { profile, genresByArtist, distance, maxArtistWeight }) {
  const genres = candidateGenres(release, profile, genresByArtist)
  const genre = isEmptyVector(genres) || isEmptyVector(profile.genres) ? null : cosineSimilarity(profile.genres, genres)

  const decades = decadeVector(release.year)
  const era = !decades || isEmptyVector(profile.decades) ? null : cosineSimilarity(profile.decades, decades)

  const steps = (release.artists ?? []).map((artist) => distance.get(artist.id)).filter((d) => d !== undefined)
  const connection = steps.length === 0 ? 0 : 1 / (1 + Math.min(...steps))

  const liked = Math.max(0, ...(release.artists ?? []).map((artist) => profile.artists[artist.id] ?? 0))
  const taste = maxArtistWeight > 0 ? liked / maxArtistWeight : 0

  return { genre, era, connection, taste }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const quoteList = (items) => (items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

// One sentence per part, saying where its number came from
function reasonFor(part, release, ctx) {
  const { profile, graph, search, genresByArtist } = ctx
  const name = (id) => profile.artistNames[id] ?? graph.nodes.get(id) ?? 'this artist'
  const artists = release.artists ?? []

  if (part === 'taste') {
    const best = [...artists].sort((a, b) => (profile.artists[b.id] ?? 0) - (profile.artists[a.id] ?? 0))[0]
    const stats = profile.artistStats[best.id]
    if (stats?.highlyRated) return `You rated ${plural(stats.highlyRated, `${name(best.id)} album`)} 8/10 or higher`
    if (stats?.favourites) return `You marked ${plural(stats.favourites, `${name(best.id)} album`)} as a favourite`
    if (stats?.albums) return `You have saved ${plural(stats.albums, `${name(best.id)} album`)}`
    return `You picked ${name(best.id)} in the discovery quiz`
  }

  if (part === 'connection') {
    const closest = [...artists].filter((a) => search.depth.has(a.id)).sort((a, b) => search.depth.get(a.id) - search.depth.get(b.id))[0]
    const path = pathTo(search, closest.id)
    if (path.length === 1) {
      const where = profile.artistStats[closest.id] ? 'your library' : 'your quiz picks'
      return closest.id === artists[0]?.id ? `By ${name(closest.id)}, from ${where}` : `${name(closest.id)}, from ${where}, is credited on it`
    }
    const via = graph.edges.get(path.at(-2))?.get(path.at(-1))?.[0]
    return `Connected to your library: ${path.map(name).join(' → ')}${via ? ` (on “${via.name}”)` : ''}`
  }

  if (part === 'era') {
    const decade = decadeOf(release.year)
    const top = topEntries(profile.decades, 1)[0]?.[0]
    return `From the ${decadeLabel(decade)}, ${String(decade) === top ? 'the decade you save most' : 'close to the eras you like'}`
  }

  // genre
  const genres = candidateGenres(release, profile, genresByArtist)
  const shared = topEntries(profile.genres)
    .map(([key]) => key)
    .filter((key) => Object.hasOwn(genres, key))
    .slice(0, 2)
  return shared.length ? `Shares ${quoteList(shared.map((key) => `“${key}”`))} with your library` : 'Similar genres and tags to your library'
}

// The strongest 1 to 3 reasons, plus notes for the parts that could not be counted
export function explain(release, parts, ctx) {
  const contributions = PARTS.filter((part) => parts[part] !== null && parts[part] > 0 && ctx.weights[part] > 0).sort(
    (a, b) => ctx.weights[b] * parts[b] - ctx.weights[a] * parts[a],
  )
  const reasons = contributions.slice(0, 3).map((part) => ({ part, text: reasonFor(part, release, ctx) }))
  const notes = []
  if (parts.genre === null) notes.push('Genre not counted: there is no genre or tag data for this artist.')
  if (parts.era === null) notes.push('Era not counted: the release year is unknown.')
  return { reasons, notes }
}

// Everything together. knownArtists: [{ id, artist, releases }] from /api/intelligence/artists.
// Returns { results: [{ release, score, parts, reasons, notes }], candidateCount, search, graph }
export function recommend({ knownArtists, profile, ownedAlbums = [], weights = DEFAULT_WEIGHTS, limit = 20 }) {
  const genresByArtist = Object.fromEntries(knownArtists.filter((a) => a.artist).map((a) => [a.id, a.artist.genres ?? []]))
  const names = Object.fromEntries(knownArtists.filter((a) => a.artist).map((a) => [a.id, a.artist.name]))
  const graph = buildArtistGraph(Object.fromEntries(knownArtists.map((a) => [a.id, a.releases])), { ...names, ...profile.artistNames })
  const search = bfs(graph, rankedArtistIds(profile), { maxDepth: 2, maxNodes: 500 })
  const maxArtistWeight = Math.max(0, ...Object.values(profile.artists))
  const ctx = { profile, genresByArtist, graph, search, distance: search.depth, maxArtistWeight, weights }

  const candidates = generateCandidates(knownArtists, profile, ownedAlbums)
  const results = []
  for (const release of candidates) {
    const parts = scoreParts(release, ctx)
    const score = combine(parts, weights)
    if (score <= 0) continue // nothing links it to the user: no honest reason to show it
    const { reasons, notes } = explain(release, parts, ctx)
    if (reasons.length === 0) continue
    results.push({ release, score, parts, reasons, notes })
  }
  results.sort((a, b) => b.score - a.score || (b.release.releaseDate ?? '').localeCompare(a.release.releaseDate ?? '') || a.release.name.localeCompare(b.release.name))
  return { results: results.slice(0, limit), candidateCount: candidates.length, search, graph }
}

// Weights from settings, clamped to 0..10; anything missing falls back to the default
export function sanitizeWeights(weights = {}) {
  return Object.fromEntries(
    PARTS.map((part) => {
      const value = Number(weights[part])
      return [part, Number.isFinite(value) ? Math.min(MAX_WEIGHT, Math.max(0, value)) : DEFAULT_WEIGHTS[part]]
    }),
  )
}
