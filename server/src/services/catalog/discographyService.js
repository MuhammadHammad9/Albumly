import { normalizeRelease } from '../spotify/normalize.js'

// Builds an artist's discography from Spotify.
//
// Why this is more than one request:
//  - GET /artists/{id}/albums returns at most 10 releases per call, so we page through.
//  - Spotify removed the `album_group` field, so a release no longer says whether it is the
//    artist's own album or a guest appearance. We ask for one group at a time and label each
//    release with the group we asked for.
//  - The same release can come back in more than one group; we keep it once.
//
// The work is split into "pieces": one piece is one group (all of it, or only its first page).
// Pieces are cached on their own, and mergeGroups turns any set of pieces into one discography.

// Also the priority order: when a release is in two groups, the earlier group wins
export const RELEASE_GROUPS = ['album', 'single', 'compilation', 'appears_on']

// Groups that are fetched only one page at a time until someone opens their tab. They are the
// expensive ones (some artists are on hundreds of compilations) and the least visited.
export const LAZY_GROUPS = ['compilation', 'appears_on']

const PAGE_SIZE = 10 // Spotify's maximum for this endpoint

// Caps on pages per group keep the worst case bounded: an artist featured on thousands of
// compilations would otherwise cost hundreds of requests, and the live spike showed that a burst
// like that gets the whole app rate limited. Hitting a cap is listed in the report and sent to
// the client, which says the list is incomplete. Worst case: 30 + 30 + 5 + 10 = 75 requests.
export const MAX_PAGES = { album: 30, single: 30, compilation: 5, appears_on: 10 }

const newestFirst = (a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name)

// Fetch one group and return it as a piece:
//   { group, releases, reported, retrieved, complete, truncated, requests, fetchedAt }
// - firstPageOnly: stop after page one (it still tells us Spotify's total for the group)
// - firstPage: a page-one piece fetched earlier; only the pages after it are requested
export async function fetchGroup(client, artistId, group, { market, firstPageOnly = false, firstPage } = {}) {
  let requests = 0
  function fetchPage(offset) {
    requests++
    return client.get(`/artists/${artistId}/albums`, {
      params: { include_groups: group, limit: PAGE_SIZE, offset, market },
      notFound: 'Artist',
    })
  }

  let firstItems
  let reported
  if (firstPage) {
    firstItems = firstPage.releases
    reported = firstPage.reported
  } else {
    const page = await fetchPage(0)
    // Spotify occasionally returns null in place of an unavailable item
    firstItems = page.items.filter(Boolean).map((raw) => normalizeRelease(raw, group))
    reported = page.total
  }

  const pagesNeeded = Math.ceil(reported / PAGE_SIZE)
  if (firstPageOnly) {
    return piece({ group, releases: firstItems, reported, complete: pagesNeeded <= 1, truncated: false, requests })
  }

  // The first page told us the total, so the remaining pages can all be requested at once
  // (the client's queue still limits how many actually run in parallel)
  const pageCount = Math.min(pagesNeeded, MAX_PAGES[group])
  const rest = await Promise.all(Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) => fetchPage((index + 1) * PAGE_SIZE)))
  const restItems = rest.flatMap((page) => page.items).filter(Boolean).map((raw) => normalizeRelease(raw, group))

  return piece({
    group,
    releases: [...firstItems, ...restItems],
    reported,
    complete: true,
    truncated: pagesNeeded > pageCount,
    requests: requests + (firstPage?.requests ?? 0),
  })
}

const piece = ({ releases, ...rest }) => ({ ...rest, releases, retrieved: releases.length, fetchedAt: new Date().toISOString() })

// Pure: turns one piece per group into the discography the client receives, with a report on
// how complete it is. Used by both providers, so the demo and Spotify answers have the same shape.
export function mergeGroups(artistId, pieces, { source = 'spotify' } = {}) {
  const byGroup = Object.fromEntries(pieces.map((p) => [p.group, p]))

  // Hash-map de-duplication: O(n). Groups are walked in priority order, so an artist's own
  // album is never relabelled as a guest appearance.
  const byId = new Map()
  const groups = {}
  for (const group of RELEASE_GROUPS) {
    const p = byGroup[group] ?? { releases: [], reported: 0, complete: true, truncated: false, requests: 0, fetchedAt: null }
    let duplicates = 0
    for (const release of p.releases) {
      if (byId.has(release.id)) duplicates++
      else byId.set(release.id, release)
    }
    groups[group] = {
      reported: p.reported,
      retrieved: p.releases.length,
      duplicates,
      complete: p.complete,
      truncated: p.truncated,
      requests: p.requests ?? 0,
      fetchedAt: p.fetchedAt,
    }
  }

  const releases = [...byId.values()].sort(newestFirst)
  const counts = Object.fromEntries(RELEASE_GROUPS.map((group) => [group, 0]))
  for (const release of releases) counts[release.group]++

  // The oldest piece decides "fetched at", so the app never claims fresher data than it has
  const times = pieces.map((p) => p.fetchedAt).filter(Boolean).sort()

  return {
    artistId,
    releases,
    counts,
    total: releases.length,
    report: {
      source,
      requests: pieces.reduce((sum, p) => sum + (p.requests ?? 0), 0),
      fetchedAt: times[0] ?? new Date().toISOString(),
      duplicatesRemoved: RELEASE_GROUPS.reduce((sum, group) => sum + groups[group].duplicates, 0),
      truncated: RELEASE_GROUPS.filter((group) => groups[group].truncated),
      pending: RELEASE_GROUPS.filter((group) => !groups[group].complete),
      groups,
    },
  }
}

// Every group in full. The app itself now loads compilations and guest appearances lazily
// (see spotifyProvider), but the spike script still measures the full cost with this.
export async function fetchDiscography(client, artistId, { market } = {}) {
  const pieces = await Promise.all(RELEASE_GROUPS.map((group) => fetchGroup(client, artistId, group, { market })))
  return mergeGroups(artistId, pieces)
}
