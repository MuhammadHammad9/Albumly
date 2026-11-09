// Pure functions for exploring a discography in the browser. They work on whatever has been
// loaded, so sorting and filtering never cost an API call.

const byName = (a, b) => a.name.localeCompare(b.name)
// ISO dates sort correctly as plain strings, even partial ones ("2022" < "2022-03" < "2022-03-19")
const byNewest = (a, b) => b.releaseDate.localeCompare(a.releaseDate)

// Each comparator falls back to a second rule so that ties always come out in the same order
const SORTERS = {
  newest: (a, b) => byNewest(a, b) || byName(a, b),
  oldest: (a, b) => byNewest(b, a) || byName(a, b),
  az: (a, b) => byName(a, b) || byNewest(a, b),
  tracks: (a, b) => b.totalTracks - a.totalTracks || byNewest(a, b),
}

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'az', label: 'A to Z' },
  { key: 'tracks', label: 'Most tracks' },
]

export const DEFAULT_SORT = 'newest'

export const VIEW_KEYS = ['grid', 'list', 'timeline']

// Returns a new array; the input (which lives in the query cache) is never mutated
export function sortReleases(releases, sortKey = DEFAULT_SORT) {
  return [...releases].sort(SORTERS[sortKey] ?? SORTERS[DEFAULT_SORT])
}

// text matches the release title (or the host artist of a guest appearance); years are inclusive and may be given in either order
export function filterReleases(releases, { text = '', yearFrom, yearTo } = {}) {
  const needle = text.trim().toLowerCase()
  let minYear = Number.isFinite(yearFrom) ? yearFrom : -Infinity
  let maxYear = Number.isFinite(yearTo) ? yearTo : Infinity
  if (minYear > maxYear) [minYear, maxYear] = [maxYear, minYear]

  return releases.filter((release) => {
    if (release.year < minYear || release.year > maxYear) return false
    if (!needle) return true
    if (release.name.toLowerCase().includes(needle)) return true
    // Artist names only count on guest appearances. On the artist's own releases the name is
    // always the same, so matching it would make every release match.
    return release.group === 'appears_on' && release.artists.some((artist) => artist.name.toLowerCase().includes(needle))
  })
}

// [{ year: 2012, releases: [...] }, ...] in the order the years first appear
export function groupByYear(releases) {
  const groups = new Map()
  for (const release of releases) {
    if (!groups.has(release.year)) groups.set(release.year, [])
    groups.get(release.year).push(release)
  }
  return [...groups.entries()].map(([year, items]) => ({ year, releases: items }))
}

// Every year from the earliest release to the latest, for the year pickers
export function yearRange(releases) {
  if (releases.length === 0) return []
  const years = releases.map((release) => release.year)
  const min = Math.min(...years)
  const max = Math.max(...years)
  return Array.from({ length: max - min + 1 }, (_, index) => min + index)
}

// Tracks whose title or any artist matches the text
export function filterTracks(tracks, text) {
  const needle = text.trim().toLowerCase()
  if (!needle) return tracks
  return tracks.filter(
    (track) => track.name.toLowerCase().includes(needle) || track.artists.some((artist) => artist.name.toLowerCase().includes(needle)),
  )
}
