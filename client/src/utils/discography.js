// Pure helpers for an artist's discography as the server sends it (see discographyService.js).

// Also the priority order: a release listed in two groups belongs to the earlier one
export const RELEASE_GROUPS = ['album', 'single', 'compilation', 'appears_on']

// Groups the server sends only the first page of, until their tab is opened
export const LAZY_GROUPS = ['compilation', 'appears_on']

export const GROUP_LABELS = { album: 'Albums', single: 'Singles', compilation: 'Compilations', appears_on: 'Appears On' }

// The tabs on an artist page, in display order, each with the rule that decides membership.
// An inferred EP is a "single" as far as the catalogue is concerned, so it leaves the Singles tab.
// `group` marks tabs that match exactly one catalogue group, so they can show its reported total.
export const DISCOGRAPHY_TABS = [
  { key: 'all', label: 'All', matches: () => true },
  { key: 'album', label: 'Albums', group: 'album', matches: (r) => r.group === 'album' },
  { key: 'single', label: 'Singles', matches: (r) => r.group === 'single' && r.inferredType !== 'ep' },
  { key: 'ep', label: 'EPs', matches: (r) => r.group === 'single' && r.inferredType === 'ep' },
  { key: 'compilation', label: 'Compilations', group: 'compilation', matches: (r) => r.group === 'compilation' },
  { key: 'appears_on', label: 'Appears On', group: 'appears_on', matches: (r) => r.group === 'appears_on' },
]

// Partly loaded: only page one so far, or stopped at the page cap
const isPartial = (info) => Boolean(info && (!info.complete || info.truncated))

// How many releases to show for a group: what we have once it is complete, otherwise the
// catalogue's own total, so a tab never claims "10" for an artist on 57 compilations
function groupCount(group, releases, report) {
  const info = report?.groups?.[group]
  const loaded = releases.filter((release) => release.group === group).length
  return isPartial(info) ? Math.max(info.reported, loaded) : loaded
}

// The header's "N releases" and the All tab's count
export function discographyTotal({ releases, report }) {
  return RELEASE_GROUPS.reduce((sum, group) => sum + groupCount(group, releases, report), 0)
}

// Returns the tabs worth showing (plus "All"), each with its releases and the count for its label
export function buildDiscographyTabs(releases, report) {
  return DISCOGRAPHY_TABS.map((tab) => {
    const list = releases.filter(tab.matches)
    let count = list.length
    if (tab.key === 'all') count = discographyTotal({ releases, report })
    else if (tab.group) count = groupCount(tab.group, releases, report)
    return { ...tab, releases: list, count, partial: tab.group ? isPartial(report?.groups?.[tab.group]) : false }
  }).filter((tab) => tab.key === 'all' || tab.count > 0)
}

// Groups that have only their first page so far
export const pendingGroups = (discography) => discography?.report?.pending ?? []

const newestFirst = (a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name)

// Combines the summary with whole groups loaded later from /discography/:group.
// The same rule as the server: walk the groups in priority order and keep each release once
// (a hash map, O(n)). A group still taken from the summary keeps the server's duplicate count
// plus anything newly claimed by a fuller group above it, so the result does not depend on
// which group finished loading first.
export function mergeDiscography(summary, fullGroups = {}) {
  if (!RELEASE_GROUPS.some((group) => fullGroups[group])) return summary

  const byId = new Map()
  const groups = {}
  for (const group of RELEASE_GROUPS) {
    const full = fullGroups[group]
    const before = summary.report.groups[group]
    const list = full ? full.releases : summary.releases.filter((release) => release.group === group)
    let dropped = 0
    for (const release of list) {
      if (byId.has(release.id)) dropped++
      else byId.set(release.id, release)
    }
    groups[group] = full
      ? {
          reported: full.reported,
          retrieved: full.retrieved,
          duplicates: dropped,
          complete: full.complete,
          truncated: full.truncated,
          requests: full.requests,
          fetchedAt: full.fetchedAt,
        }
      : { ...before, duplicates: before.duplicates + dropped }
  }

  const releases = [...byId.values()].sort(newestFirst)
  const counts = Object.fromEntries(RELEASE_GROUPS.map((group) => [group, 0]))
  for (const release of releases) counts[release.group]++
  const times = RELEASE_GROUPS.map((group) => groups[group].fetchedAt).filter(Boolean).sort()

  return {
    ...summary,
    releases,
    counts,
    total: releases.length,
    report: {
      ...summary.report,
      groups,
      requests: RELEASE_GROUPS.reduce((sum, group) => sum + (groups[group].requests ?? 0), 0),
      fetchedAt: times[0] ?? summary.report.fetchedAt,
      duplicatesRemoved: RELEASE_GROUPS.reduce((sum, group) => sum + groups[group].duplicates, 0),
      truncated: RELEASE_GROUPS.filter((group) => groups[group].truncated),
      pending: RELEASE_GROUPS.filter((group) => !groups[group].complete),
    },
  }
}

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

// "just now", "5 minutes ago", "yesterday", "3 days ago"
export function describeAge(isoTime, now = Date.now()) {
  const seconds = (now - Date.parse(isoTime)) / 1000
  if (!Number.isFinite(seconds) || seconds < 60) return 'just now'
  const [unit, size] = UNITS.find(([, unitSeconds]) => seconds >= unitSeconds)
  return relative.format(-Math.floor(seconds / size), unit)
}
