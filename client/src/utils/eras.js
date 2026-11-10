// Eras: an artist's career split into chapters, each anchored on a studio album.
// A single, EP or guest appearance belongs to the next album if it came out up to 24 months
// before it (the lead-up singles); otherwise to the album before it (the aftermath).
import { normalizeTitle } from './library.js'

export const LEAD_UP_MONTHS = 24

// '2019' -> '2019-01-01', '2019-05' -> '2019-05-01': partial dates sort at the start of their period
export const sortableDate = (date = '') => (date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date)

const monthIndex = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
const chronological = (a, b) => sortableDate(a.releaseDate).localeCompare(sortableDate(b.releaseDate)) || a.name.localeCompare(b.name)

const isStudioAlbum = (release) => release.group === 'album' && (release.inferredType ?? release.albumType) === 'album'

// Returns [{ key, title, anchor | null, year, releases: [{ ...release, role }], editions: [] }], oldest first.
// role is 'lead-up' (before its album), 'after' (after it) or 'before' (before the first album).
export function buildEras(releases) {
  const sorted = [...releases].sort(chronological)
  const eras = []
  const byTitle = new Map()

  // Anchors first. A later album with the same title (a deluxe or remaster) joins the original's era.
  for (const release of sorted.filter(isStudioAlbum)) {
    const title = normalizeTitle(release.name)
    const existing = byTitle.get(title)
    if (existing) {
      existing.editions.push(release)
      continue
    }
    const era = { key: release.id, title: release.name, anchor: release, year: release.year, releases: [], editions: [] }
    byTitle.set(title, era)
    eras.push(era)
  }

  if (eras.length === 0) {
    return sorted.length ? [{ key: 'all', title: 'All releases', anchor: null, year: sorted[0].year, releases: sorted.map((r) => ({ ...r, role: 'before' })), editions: [] }] : []
  }

  let before = null
  const anchored = new Set(eras.flatMap((era) => [era.anchor.id, ...era.editions.map((e) => e.id)]))
  for (const release of sorted) {
    if (anchored.has(release.id)) continue
    const date = sortableDate(release.releaseDate)
    const next = eras.find((era) => sortableDate(era.anchor.releaseDate) >= date)
    const previous = eras.findLast((era) => sortableDate(era.anchor.releaseDate) <= date)

    if (next && monthIndex(sortableDate(next.anchor.releaseDate)) - monthIndex(date) <= LEAD_UP_MONTHS) {
      next.releases.push({ ...release, role: 'lead-up' })
    } else if (previous) {
      previous.releases.push({ ...release, role: 'after' })
    } else {
      before ??= { key: 'before', title: `Before ${eras[0].title}`, anchor: null, year: release.year, releases: [], editions: [] }
      before.releases.push({ ...release, role: 'before' })
    }
  }
  return before ? [before, ...eras] : eras
}
