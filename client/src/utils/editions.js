// Edition grouping: "Glass Arcade" and "Glass Arcade (Deluxe Edition)" are one record released
// twice. These pure functions find such editions so the explorer can stack them under one card.
//
// Two releases are scored with the PRD's similarity  S = 0.4N + 0.3A + 0.2D + 0.1T
//   N  title similarity (Levenshtein) after edition words are stripped
//   A  artist overlap
//   D  how close the release dates are
//   T  how close the track counts are

// Same title + same artist already scores 0.7, so date or track closeness must add a little more.
// A 10th-anniversary edition with 16 tracks instead of 10 still scores about 0.76, while the same
// title by a different artist ("Greatest Hits") can reach at most 0.7.
export const SIMILARITY_THRESHOLD = 0.75

// The weights alone cannot tell "Night Ferry II" from a deluxe edition (both score well above
// 0.75), so titles must also be nearly identical once edition words are removed.
export const TITLE_GATE = 0.9

// Dates further apart than this count as "not close" at all (D = 0)
const DATE_SPAN_YEARS = 10

// Words that mark a re-release of the same record. "Remixes", "Live" or "Acoustic" are missing
// on purpose: those are different recordings, not editions.
const EDITION_WORDS =
  /\b(deluxe|expanded|remaster(ed)?|anniversary|edition|version|reissue|bonus tracks?|special|collector'?s|legacy|platinum|definitive|complete)\b/

const BRACKETED = /\s*[([]([^)\]]*)[)\]]/g // "(Deluxe Edition)", "[2011 Remaster]"
const DASH_SUFFIX = /\s+[-–—]\s+(.*)$/ // "Night Ferry - 2019 Remaster"

// Lowercase, without accents, and with punctuation turned into single spaces
function simplify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// "Glass Arcade (Deluxe Edition)" -> "glass arcade". Brackets without edition words are kept,
// so "Live (Original Soundtrack)" stays different from "Live".
export function normalizeTitle(name) {
  const lower = name.toLowerCase()
  const withoutBrackets = lower.replace(BRACKETED, (match, inside) => (EDITION_WORDS.test(inside) ? '' : match))
  const withoutSuffix = withoutBrackets.replace(DASH_SUFFIX, (match, suffix) => (EDITION_WORDS.test(suffix) ? '' : match))
  return simplify(withoutSuffix)
}

// True for "Paper Moons (Remastered)", false for "Paper Moons"
export function isAlternateTitle(name) {
  return normalizeTitle(name) !== simplify(name)
}

// The fewest single-character edits (insert, delete, replace) that turn a into b.
// Dynamic programming with two rows: O(a × b) time, O(b) memory.
export function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

// 1 for identical titles, 0 for nothing in common
export function titleSimilarity(a, b) {
  const longest = Math.max(a.length, b.length)
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest
}

// Shared artists / all artists (Jaccard). IDs, not names, so two artists called the same never match.
function artistOverlap(a, b) {
  const idsA = new Set(a.artists?.map((artist) => artist.id))
  const idsB = new Set(b.artists?.map((artist) => artist.id))
  const all = new Set([...idsA, ...idsB])
  if (all.size === 0) return 0
  let shared = 0
  for (const id of idsA) if (idsB.has(id)) shared++
  return shared / all.size
}

// Partial dates ("2015", "2013-11") are padded to the first day, as in formatReleaseDate
const toTime = (date) => Date.parse(`${date}${'-01-01'.slice(date.length - 4)}`)
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

function dateCloseness(a, b) {
  const years = Math.abs(toTime(a.releaseDate) - toTime(b.releaseDate)) / YEAR_MS
  return Number.isFinite(years) ? Math.max(0, 1 - years / DATE_SPAN_YEARS) : 0
}

function trackCloseness(a, b) {
  const most = Math.max(a.totalTracks, b.totalTracks)
  return most === 0 ? 1 : 1 - Math.abs(a.totalTracks - b.totalTracks) / most
}

// The full score with its parts, so tests (and curious readers) can see why two releases matched
// `titles` lets groupEditions pass titles it has already normalised
export function editionSimilarity(a, b, titles = [normalizeTitle(a.name), normalizeTitle(b.name)]) {
  const n = titleSimilarity(titles[0], titles[1])
  const parts = { n, a: artistOverlap(a, b), d: dateCloseness(a, b), t: trackCloseness(a, b) }
  return { score: 0.4 * parts.n + 0.3 * parts.a + 0.2 * parts.d + 0.1 * parts.t, ...parts }
}

// Numbers in a title ("Vol. 2", "Night Ferry III") name a different record, not an edition.
// "driftwood sampler vol 1" and "... vol 2" are one edit apart, so the title gate alone would let them through.
const ROMAN = /^x{0,3}(ix|iv|v?i{0,3})$/
const numbersIn = (title) =>
  title
    .split(' ')
    .filter((word) => word && (/^\d+$/.test(word) || ROMAN.test(word)))
    .join(' ')

export function areEditions(a, b, titles = [normalizeTitle(a.name), normalizeTitle(b.name)]) {
  if (numbersIn(titles[0]) !== numbersIn(titles[1])) return false
  const { score, n } = editionSimilarity(a, b, titles)
  return n >= TITLE_GATE && score >= SIMILARITY_THRESHOLD
}

// The original comes first: the earliest release, then the one without edition words in its
// title, then the shorter one, then by name so the order never changes between renders.
function originalFirst(a, b) {
  return (
    a.releaseDate.localeCompare(b.releaseDate) ||
    isAlternateTitle(a.name) - isAlternateTitle(b.name) ||
    a.totalTracks - b.totalTracks ||
    a.name.localeCompare(b.name)
  )
}

// Groups editions of the same release: [{ key, primary, editions: [...] }].
// Groups come out in the order their primary appears in `releases`, so grouping a sorted list
// keeps it sorted. Only releases of the same group (album, single, ...) are compared.
export function groupEditions(releases) {
  // Union-find (disjoint sets): parent[i] points towards the representative of i's set.
  // Joining matching pairs this way puts a base, its deluxe and its anniversary edition in one
  // set even when only neighbouring pairs match each other.
  const parent = releases.map((_, index) => index)
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]] // path halving keeps the chains short
      i = parent[i]
    }
    return i
  }

  const titles = releases.map((release) => normalizeTitle(release.name))
  for (let i = 0; i < releases.length; i++) {
    for (let j = i + 1; j < releases.length; j++) {
      if (releases[i].group !== releases[j].group) continue
      // Cheap check first: if the lengths differ this much, N cannot reach the gate
      const longest = Math.max(titles[i].length, titles[j].length)
      if (longest > 0 && Math.abs(titles[i].length - titles[j].length) / longest > 1 - TITLE_GATE) continue
      if (areEditions(releases[i], releases[j], [titles[i], titles[j]])) parent[find(i)] = find(j)
    }
  }

  const sets = new Map() // representative -> members, in input order
  releases.forEach((release, index) => {
    const root = find(index)
    if (!sets.has(root)) sets.set(root, [])
    sets.get(root).push(release)
  })

  const groups = [...sets.values()].map((members) => {
    const [primary, ...editions] = [...members].sort(originalFirst)
    return { key: primary.id, primary, editions }
  })
  // Keep the caller's order: a group sits where its primary was
  const position = new Map(releases.map((release, index) => [release.id, index]))
  return groups.sort((a, b) => position.get(a.primary.id) - position.get(b.primary.id))
}

// One group per release, for when edition grouping is switched off
export function ungrouped(releases) {
  return releases.map((release) => ({ key: release.id, primary: release, editions: [] }))
}
