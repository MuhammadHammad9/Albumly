// The release calendar: releases from many artists, put into years, months and days.
// Dates can be a full day, a month ("2019-05") or only a year ("2019"); each is shown honestly.
import { sortableDate } from './eras.js'

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Every release once, remembering which of the followed artists it came from:
// knownArtists [{ id, artist, releases }] -> [{ ...release, via: ['Neon Harbor'] }]
export function collectReleases(knownArtists) {
  const byId = new Map()
  for (const { id, artist, releases } of knownArtists) {
    const name = artist?.name ?? releases?.[0]?.artists?.find((a) => a.id === id)?.name ?? id
    for (const release of releases ?? []) {
      const existing = byId.get(release.id)
      if (existing) {
        if (!existing.via.includes(name)) existing.via.push(name)
      } else {
        byId.set(release.id, { ...release, via: [name] })
      }
    }
  }
  return [...byId.values()]
}

const yearOf = (release) => Number(release.releaseDate?.slice(0, 4)) || null

// Years that have releases, newest first
export function releaseYears(releases) {
  return [...new Set(releases.map(yearOf).filter(Boolean))].sort((a, b) => b - a)
}

// { year, total, months: [{ month: 1..12, label, releases }], yearOnly: [] }
// Releases in a month are ordered by day; those whose day is unknown come last in their month.
export function buildCalendar(releases, year) {
  const months = MONTH_NAMES.map((label, index) => ({ month: index + 1, label, releases: [] }))
  const yearOnly = []
  for (const release of releases) {
    if (yearOf(release) !== year) continue
    const date = release.releaseDate ?? ''
    if (date.length < 7) yearOnly.push(release)
    else months[Number(date.slice(5, 7)) - 1]?.releases.push({ ...release, day: date.length === 10 ? Number(date.slice(8, 10)) : null })
  }
  for (const month of months) month.releases.sort((a, b) => (a.day ?? 99) - (b.day ?? 99) || a.name.localeCompare(b.name))
  yearOnly.sort((a, b) => a.name.localeCompare(b.name))
  const total = months.reduce((sum, m) => sum + m.releases.length, 0) + yearOnly.length
  return { year, total, months, yearOnly }
}

// Releases with a known day after `today`, and those in the last `days` days. today: 'YYYY-MM-DD'
export function upcomingAndRecent(releases, today, { days = 90 } = {}) {
  const since = new Date(`${today}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - days)
  const from = since.toISOString().slice(0, 10)
  const dated = releases.filter((r) => r.releaseDate?.length === 10).sort((a, b) => sortableDate(a.releaseDate).localeCompare(sortableDate(b.releaseDate)))
  return {
    upcoming: dated.filter((r) => r.releaseDate > today),
    recent: dated.filter((r) => r.releaseDate <= today && r.releaseDate >= from).reverse(),
  }
}
