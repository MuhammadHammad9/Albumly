import { Router } from 'express'
import { getProvider } from '../providers/index.js'
import { badRequest } from '../utils/errors.js'

const MAX_PAGE_SIZE = 10 // Spotify's own cap for search results
const MAX_OFFSET = 1000

// Read a whole-number query parameter, falling back to a default and rejecting anything out of range
function intParam(value, { name, fallback, min, max }) {
  if (value === undefined) return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw badRequest(`"${name}" must be a whole number between ${min} and ${max}`)
  }
  return number
}

export const catalogRoutes = Router()

// Express 5 forwards a rejected promise from an async handler to the error handler automatically
catalogRoutes.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (!q || q.length > 100) throw badRequest('"q" is required and must be at most 100 characters')

  const type = req.query.type ?? 'artist'
  // Object.hasOwn: "constructor" or "__proto__" must not pass as a type
  if (typeof type !== 'string' || !Object.hasOwn(SEARCHERS, type)) throw badRequest('"type" must be "artist", "album" or "track"')

  const page = {
    offset: intParam(req.query.offset, { name: 'offset', fallback: 0, min: 0, max: MAX_OFFSET }),
    limit: intParam(req.query.limit, { name: 'limit', fallback: MAX_PAGE_SIZE, min: 1, max: MAX_PAGE_SIZE }),
  }

  // Album and track searches can be narrowed by artist and year. Artist search ignores them.
  const filters = type === 'artist' ? {} : searchFilters(req.query)

  const provider = getProvider()
  const result = await provider[SEARCHERS[type]](q, page, filters)
  res.json({ type, query: q, filters, ...result })
})

// Which provider method answers each search type
const SEARCHERS = { artist: 'searchArtists', album: 'searchAlbums', track: 'searchTracks' }

// Optional filters, sent along to the catalogue so they narrow the results without extra requests
function searchFilters(query) {
  const filters = {}
  const artist = String(query.artist ?? '').trim()
  if (artist.length > 100) throw badRequest('"artist" must be at most 100 characters')
  if (artist) filters.artist = artist

  const years = { name: 'yearFrom', fallback: undefined, min: 1900, max: 2100 }
  let yearFrom = intParam(query.yearFrom, years)
  let yearTo = intParam(query.yearTo, { ...years, name: 'yearTo' })
  // A reversed range ("2020 to 2015") is still clearly meant as a range
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom]
  if (yearFrom !== undefined) filters.yearFrom = yearFrom
  if (yearTo !== undefined) filters.yearTo = yearTo
  return filters
}

catalogRoutes.get('/artists/:id', async (req, res) => {
  res.json(await getProvider().getArtist(req.params.id))
})

catalogRoutes.get('/artists/:id/discography', async (req, res) => {
  res.json(await getProvider().getDiscography(req.params.id))
})

// One whole release group (for example every compilation), loaded when its tab is opened.
// The provider rejects an unknown group with a 400.
catalogRoutes.get('/artists/:id/discography/:group', async (req, res) => {
  res.json(await getProvider().getDiscographyGroup(req.params.id, req.params.group))
})

catalogRoutes.get('/albums/:id', async (req, res) => {
  res.json(await getProvider().getAlbum(req.params.id))
})

catalogRoutes.get('/featured', async (req, res) => {
  res.json(await getProvider().getFeatured())
})
