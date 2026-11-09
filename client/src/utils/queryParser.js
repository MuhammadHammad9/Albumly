// The universal search parser. Turns what someone types into a structured search:
//   "the weeknd 2020 album"  ->  { text: 'the weeknd', yearFrom: 2020, yearTo: 2020, tab: 'album', albumType: 'album' }
// Two steps, both pure functions: tokenize (split into pieces) and parse (decide what each piece means).

export const SEARCH_TABS = ['artist', 'album', 'track']
export const ALBUM_TYPES = ['album', 'single', 'ep', 'compilation']

// Words that pick a kind of result. Plural forms work too ("singles", "songs").
const TYPE_WORDS = {
  album: { tab: 'album', albumType: 'album' },
  single: { tab: 'album', albumType: 'single' },
  ep: { tab: 'album', albumType: 'ep' },
  compilation: { tab: 'album', albumType: 'compilation' },
  track: { tab: 'track' },
  song: { tab: 'track' },
  artist: { tab: 'artist' },
}

const MIN_YEAR = 1900
const MAX_YEAR = 2099

// field:"several words" | field:word | "a quoted phrase" | word
const TOKEN = /(\w+):"([^"]*)"?|(\w+):(\S+)|"([^"]*)"?|(\S+)/g

// Split text into tokens: { kind: 'field', field, value } | { kind: 'phrase', value } | { kind: 'word', value }
export function tokenize(input) {
  const tokens = []
  for (const match of input.matchAll(TOKEN)) {
    const [, quotedField, quotedValue, field, value, phrase, word] = match
    if (quotedField !== undefined) tokens.push({ kind: 'field', field: quotedField.toLowerCase(), value: quotedValue.trim() })
    else if (field !== undefined) tokens.push({ kind: 'field', field: field.toLowerCase(), value })
    else if (phrase !== undefined) {
      if (phrase.trim()) tokens.push({ kind: 'phrase', value: phrase.trim() })
    } else tokens.push({ kind: 'word', value: word })
  }
  return tokens
}

const isYear = (n) => Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR

// "2020" -> { from: 2020, to: 2020 }; "2015-2020", "2015–2020" or "2015..2020" -> a range; anything else -> null
export function parseYears(text) {
  const range = /^(\d{4})(?:-|–|\.\.)(\d{4})$/.exec(text)
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b)
    return isYear(from) && isYear(to) ? { from, to } : null
  }
  if (/^\d{4}$/.test(text) && isYear(Number(text))) return { from: Number(text), to: Number(text) }
  return null
}

// "Albums" -> the album type; "song" -> tracks; anything else -> null
function typeOf(text) {
  const word = text.toLowerCase()
  return TYPE_WORDS[word] ?? TYPE_WORDS[word.replace(/s$/, '')] ?? null
}

// Turn tokens into a structured search. Rules, in order:
// - field syntax always counts: artist:"x", year:2020 or year:2015-2020, type:single
// - a bare year, year range or type word counts only if some other text (or an artist) is left, so searching
//   "1989" or "Singles" alone still looks for that title. Quote it to keep it as text: "1989"
// - only the first type word counts; any later ones stay as text
// - "<title> by <artist>": the words after "by" are the artist
export function parseQuery(input) {
  const result = { text: '', artist: '', yearFrom: undefined, yearTo: undefined, tab: undefined, albumType: undefined }
  const tokens = tokenize(input ?? '')
  const rest = [] // tokens that might be plain text

  for (const token of tokens) {
    if (token.kind === 'field') {
      if (token.field === 'artist' && token.value) result.artist = token.value
      else if (token.field === 'year' && parseYears(token.value)) Object.assign(result, toRange(parseYears(token.value)))
      else if (token.field === 'type' && typeOf(token.value)) Object.assign(result, typeOf(token.value))
      else rest.push({ kind: 'word', value: `${token.field}:${token.value}` }) // unknown field: keep it as typed
    } else rest.push(token)
  }

  // Bare years and type words: decided only now, because they need other text to be left over
  const isSpecial = (token) => token.kind === 'word' && (parseYears(token.value) || typeOf(token.value))
  // An artist given with artist:"..." counts as something to search for, too
  const hasOtherText = Boolean(result.artist) || rest.some((token) => !isSpecial(token) && token.value.toLowerCase() !== 'by')
  const text = []
  for (const token of rest) {
    const years = token.kind === 'word' && parseYears(token.value)
    const type = token.kind === 'word' && typeOf(token.value)
    if (hasOtherText && years && result.yearFrom === undefined) Object.assign(result, toRange(years))
    else if (hasOtherText && type && result.tab === undefined) Object.assign(result, type)
    else text.push(token)
  }

  // "starboy by the weeknd": split at the first "by" that has words on both sides
  const by = text.findIndex((token, index) => token.kind === 'word' && token.value.toLowerCase() === 'by' && index > 0 && index < text.length - 1)
  if (by > 0 && !result.artist) {
    result.artist = join(text.slice(by + 1))
    result.text = join(text.slice(0, by))
  } else {
    result.text = join(text)
  }
  return result
}

const toRange = ({ from, to }) => ({ yearFrom: from, yearTo: to })
const join = (tokens) => tokens.map((token) => token.value).join(' ')

// What to send to the server. The free text is the query; when only an artist was given
// ('artist:"neon harbor" album'), the artist name becomes the query instead.
// Returns { type, q, artist, yearFrom, yearTo }.
export function toSearchRequest({ text, artist, yearFrom, yearTo }, tab) {
  if (tab === 'artist') return { type: 'artist', q: (text || artist).trim() }
  if (!text.trim()) return { type: tab, q: artist.trim(), yearFrom, yearTo }
  return { type: tab, q: text.trim(), artist: artist || undefined, yearFrom, yearTo }
}

// Once someone edits a filter by hand, what the parser understood moves out of the text into
// explicit URL values, so the text box and the filter controls can never disagree.
// Returns URL params as { q, tab, from, to, artist, kind } (only the parts that were found).
export function explode(input) {
  const parsed = parseQuery(input)
  const params = { q: parsed.text }
  if (parsed.tab) params.tab = parsed.tab
  if (parsed.albumType) params.kind = parsed.albumType
  if (parsed.yearFrom !== undefined) params.from = String(parsed.yearFrom)
  if (parsed.yearTo !== undefined) params.to = String(parsed.yearTo)
  if (parsed.artist) params.artist = parsed.artist
  return params
}

// ---------- Refining results already loaded ----------
// Spotify search cannot filter by release type or track count, or sort. These run in the browser on
// the pages already loaded, so they cost no request. The year check repeats the server's filter as a
// safety net: Spotify's `year:` filter is not guaranteed to be honoured.

export const SEARCH_SORTS = {
  album: [
    { key: 'relevance', label: 'Best match' },
    { key: 'newest', label: 'Newest first' },
    { key: 'oldest', label: 'Oldest first' },
    { key: 'az', label: 'A to Z' },
    { key: 'tracks', label: 'Most tracks' },
  ],
  track: [
    { key: 'relevance', label: 'Best match' },
    { key: 'az', label: 'A to Z' },
    { key: 'longest', label: 'Longest first' },
    { key: 'shortest', label: 'Shortest first' },
  ],
}

const RESULT_SORTERS = {
  newest: (a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''),
  oldest: (a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''),
  az: (a, b) => a.name.localeCompare(b.name),
  tracks: (a, b) => b.totalTracks - a.totalTracks,
  longest: (a, b) => b.durationMs - a.durationMs,
  shortest: (a, b) => a.durationMs - b.durationMs,
}

export function refineResults(items, tab, { kind, minTracks, yearFrom, yearTo, sort } = {}) {
  if (tab === 'artist') return items
  const yearOf = (item) => (tab === 'track' ? item.album?.year : item.year)
  const inYears = (year) => (yearFrom === undefined || year >= yearFrom) && (yearTo === undefined || year <= yearTo)

  const kept = items.filter((item) => {
    if (!inYears(yearOf(item))) return false
    if (tab === 'album' && kind && item.inferredType !== kind) return false
    if (tab === 'album' && minTracks && item.totalTracks < minTracks) return false
    return true
  })
  const sorter = SEARCH_SORTS[tab].some((option) => option.key === sort) && RESULT_SORTERS[sort]
  // Array.prototype.sort is stable, so ties keep the catalogue's "best match" order
  return sorter ? [...kept].sort(sorter) : kept
}
