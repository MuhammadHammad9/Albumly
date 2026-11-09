# Plan: discography explorer — lazy groups, edition grouping, completeness report

Owner: Agent A. Status: **approved and implemented** (Stage 2).

Changes made while building it, compared with the plan below:

- Edition matching also requires the **numbers in both titles to match**. With longer titles the 0.9 title gate was not enough: "Driftwood Sampler Vol. 1" and "Vol. 2" are one edit apart (N ≈ 0.96).
- Each `report.groups[g]` also carries `requests`, so the client can keep `report.requests` correct after merging groups.
- The Spotify provider's discography tests went into a new file, `server/src/providers/spotifyProvider.discography.test.js`, so they never collide with edits to the search tests in `spotifyProvider.test.js`.

Three pieces, built in this order because each one leans on the one before:

1. Lazy-load the expensive release groups (server + client).
2. Edition grouping (PRD M3-6), pure client logic.
3. Completeness report panel (PRD M3-7), which shows numbers produced by 1 and 2.

---

## 1. Lazy-loading compilations and guest appearances

### Why

Spotify blocked `/artists/{id}/albums` for 24 h after ~100 requests. Today one artist page fetches all four groups in full (up to 75 requests). For artists like Nusrat Fateh Ali Khan, most of those pages are compilations and guest appearances that most visitors never open.

After this change an artist page costs: all album pages + all single pages + **1** compilation page + **1** appears_on page. Opening the Compilations or Appears On tab costs only the *remaining* pages of that group, because page one is reused from the server cache.

### API shape

I kept the suggested shape (summary + per-group endpoint). I considered a single endpoint with `?expand=compilation,appears_on` (the server would merge, the client would not), and rejected it: every expand re-downloads the whole discography, one failed group would fail the whole response, and TanStack Query could not cache groups separately. With a per-group endpoint each group has its own loading and error state, and the client merge is one small pure function.

**`GET /api/artists/:id/discography`** (existing route, same top-level shape, richer `report`):

```js
{
  artistId,
  releases: Release[],   // de-duplicated, newest first (unchanged)
  counts: { album, single, compilation, appears_on }, // releases shown per group (unchanged meaning)
  total,                 // releases.length (unchanged)
  report: {
    source: 'spotify' | 'mock',
    requests,            // Spotify requests it took to build the pieces in this answer (0 for mock)
    fetchedAt,           // ISO time of the OLDEST piece, so the panel never overstates freshness
    duplicatesRemoved,   // sum of groups[g].duplicates
    truncated: ['appears_on'], // groups stopped by the page cap (the existing note keeps using this)
    pending: ['compilation'],  // groups where only page one is loaded so far
    groups: {
      album:       { reported, retrieved, duplicates, complete, truncated, fetchedAt },
      single:      { ... },
      compilation: { reported: 57, retrieved: 10, duplicates: 0, complete: false, truncated: false, fetchedAt },
      appears_on:  { ... },
    },
  },
}
```

- `reported`: Spotify's `total` for the group (known after page one).
- `retrieved`: releases actually fetched for that group.
- `duplicates`: how many of those were dropped because an earlier group already had them (album beats single beats compilation beats appears_on, as today).
- `complete`: every page we are going to fetch has been fetched (true for album/single; true for a lazy group when page one held everything, or after its full fetch).
- `truncated`: the full fetch stopped at `MAX_PAGES` (page caps unchanged: 30/30/5/10).

**`GET /api/artists/:id/discography/:group`** (new): the full group, not de-duplicated against other groups.

```js
{ artistId, group, releases: Release[], reported, retrieved, complete: true, truncated, requests, fetchedAt }
```

`:group` must be one of `album | single | compilation | appears_on`, else 400. (Accepting all four keeps the route simple; album/single are already cached in full, so they cost nothing.)

### Server design

`services/catalog/discographyService.js` is split into small functions:

- `fetchGroup(client, artistId, group, { market, firstPageOnly, firstPage })` → one *piece* `{ group, releases, reported, retrieved, complete, truncated, requests, fetchedAt }`. With `firstPageOnly` it makes one request. With `firstPage` (an already fetched piece) it fetches only pages 2..n.
- `mergeGroups(artistId, pieces, { source })` → the summary payload above. Pure: hash-map de-duplication in group priority order, counts, report. **Both providers use it**, so the shapes cannot drift apart.
- `fetchDiscography(client, artistId, { market })` stays as "everything in full" (built from the two functions above), so `scripts/spike.js` keeps working untouched.
- Exports `LAZY_GROUPS = ['compilation', 'appears_on']`.

`providers/spotifyProvider.js` caches **pieces**, not whole discographies (TTL 7 days, as now):

| Cache key | Holds |
| --- | --- |
| `discography:{id}:{group}` | a full group (album, single, or a lazy group once opened) |
| `discography:{id}:{group}:first` | page one of a lazy group |

- `getDiscography(id)`: album and single in full; for each lazy group, the cached full piece if someone already opened that tab, otherwise page one. Then `mergeGroups`. If one piece fails, the pieces that succeeded stay cached, so a retry only fetches what is missing.
- `getDiscographyGroup(id, group)`: full piece, built from the cached page one (one request saved per opened tab).
- No old cache entries are lost: the current cache file holds no discographies (checked), and the new keys do not clash with anything.

`providers/mockProvider.js`: the same two methods. It splits the demo discography into pieces, gives lazy groups only their first 10 releases (Spotify's page size), and calls the shared `mergeGroups` with `source: 'mock'`. `requests` is 0. The report therefore exists for the demo catalogue too.

`data/mockCatalog.js`: today no demo artist has more than 10 compilations or guest spots, so lazy loading would never be visible in the demo. I will add two fictional artists (no existing artist, album or tracklist changes):

- **Driftwood Recordings** (label sampler artist): 12 compilations, "Driftwood Sampler Vol. 1" … "Vol. 12" (2014–2025), plus "Driftwood Sampler Vol. 3 (Expanded Edition)". Exercises lazy compilations, and shows edition grouping must *not* merge Vol. 1 with Vol. 2 but *must* merge Vol. 3 with its Expanded Edition.
- **Cass Marlowe** (session guitarist): two albums from 2009/2011 (too old to change the home page's "newest albums"), and featured on all the samplers, so 13 guest appearances → lazy Appears On.

New names contain neither "neon" nor "glass arcade", so existing search tests keep their results.

`routes/catalogRoutes.js`: only the discography routes — the existing one unchanged, plus the new `/:group` route with group validation.

### Client design

`hooks/catalog.js` (only discography hooks):

- `useDiscography(artistId)` unchanged (summary; `Artist.jsx` header shares it).
- New `useDiscographyGroups(artistId, wantedGroups, pendingGroups)`: `useQueries`, one query per lazy group, key `['discography', artistId, group]`, `enabled` only when the group is pending **and** wanted, `staleTime: Infinity` (a full group does not change during a visit). Because the queries stay observed while disabled, a group loaded once stays loaded when the user moves back to another tab.

`utils/discography.js` (pure, tested):

- `LAZY_GROUPS`, `pendingGroups(discography)`.
- `mergeDiscography(summary, fullGroups)`: walks the four groups in priority order, using the full list for a loaded group and the summary's releases otherwise, de-duplicating with a `Map` (the same rule as the server). A group taken from the summary keeps the server's duplicate count plus anything newly dropped. Result has the same shape as the summary, so everything downstream is unchanged. The order groups finish loading in does not matter (tested).
- `buildDiscographyTabs(releases, report)` gains counts: a tab that maps to one partly loaded group (pending or capped) shows Spotify's **reported** total; otherwise it shows the releases you will actually see. (Singles/EPs share one Spotify group, so they always show loaded counts; they are fetched in full anyway.) A lazy tab is shown whenever `reported > 0`. "All" = sum of the tab counts of the four groups.
- `discographyTotal(discography)` for the header's "N releases", same rule.
- `describeAge(isoTime, now)` → "just now", "3 hours ago" (Intl.RelativeTimeFormat), for the panel.

**When the rest is fetched (decision):**

- **Opening the Compilations or Appears On tab** (by click, arrow keys or a `?tab=` link) loads that group automatically. Opening a tab is a clear sign of interest.
- **The "All" tab and filters do not auto-load.** "All" is the default tab, so auto-loading there would make every page visit pay full price again and undo the saving. A filter is typed on any tab and is not a sign of interest in guest appearances. Instead, when groups are pending, the All tab shows a short note — "Includes the first 10 of 57 compilations and 10 of 120 guest appearances." — with a **Load all** button; when a filter is active the note says the results may be missing some of them. The completeness panel offers the same per-group "Load the rest" button. The user stays in control of the expensive requests.
- While a group loads, its first-page releases stay visible with a status line ("Loading 47 more compilations…", `role="status"`). On failure an inline message (from `describeError`) with "Try again" when retrying can help; the rest of the page keeps working.

The existing truncated note ("This artist has more … than Albumly can load") stays, fed from the merged report's `truncated`.

---

## 2. Edition grouping (M3-6)

### `client/src/utils/editions.js` (pure, framework-free, unit-tested)

- `normalizeTitle(name)`: lowercase, strip accents, remove bracketed parts `(…)`/`[…]` and ` - …` suffixes **that contain an edition word** (deluxe, expanded, remaster(ed), anniversary, edition, version, reissue, bonus track(s), special, collector's, legacy, platinum, definitive, complete, or a 4-digit year next to one of these), then `&`→`and`, punctuation→spaces, collapse spaces. Brackets without edition words (e.g. "(Original Soundtrack)") are kept, and "Remixes", "Live", "Acoustic" are *not* edition words: those are different works.
- `isAlternateTitle(name)`: true when normalising removed edition words.
- `levenshtein(a, b)`: two-row dynamic programming, O(n·m) time, O(m) memory.
- `editionSimilarity(a, b)` → `{ score, n, a, d, t }` with the PRD formula **S = 0.4N + 0.3A + 0.2D + 0.1T**:
  - N = 1 − levenshtein / longer title length (normalised titles)
  - A = Jaccard overlap of artist IDs (|shared| / |all|)
  - D = max(0, 1 − years apart / 10) (partial dates padded, as in `formatReleaseDate`)
  - T = 1 − |track difference| / larger track count
- `groupEditions(releases)` → `[{ key, primary, editions: [] }]`:
  - Only releases with the same `group` are compared (a remix single is never stacked under an album; also cuts comparisons).
  - Two releases are editions when **N ≥ 0.9** (title gate) **and S ≥ 0.75**.
    - Why the gate: weights alone cannot tell "Night Ferry II" (N ≈ 0.79, same artist, close date) from a deluxe edition; it would score ≈ 0.84. The gate also rejects "Vol. 1" vs "Vol. 2".
    - Why 0.75: same title + same artist already gives 0.7, so date or track closeness must add a little; a 10th-anniversary edition with 16 vs 10 tracks still scores ≈ 0.76, while the same title by a *different* artist ("Greatest Hits") tops out at 0.7.
  - Pairs are joined with **union-find** (disjoint sets), so a base, its deluxe and its anniversary edition end in one group even if only consecutive pairs match.
  - Cheap pre-check skips Levenshtein when title lengths differ by more than 10 % (N could not reach the gate).
  - Primary = earliest release date; ties → the title without edition words, then fewer tracks, then name. Other editions are listed oldest first.
  - Groups come out in the order their primary appears in the input, so grouping a sorted list keeps it sorted.
- `ungrouped(releases)` → one group per release (toggle off).

### Explorer

- Pipeline becomes `tab → filter → sort → group editions → view`. Filtering before grouping means a filter that matches only the Deluxe Edition shows it on its own as the primary: editions are never hidden permanently (PRD).
- Toolbar gets a **Group editions** toggle button (`aria-pressed`, lucide `Layers` icon). Stored in the URL like the other controls: on by default (omitted from the URL), `?editions=separate` when off. Unknown values are ignored.
- New `components/albums/Editions.jsx`: a disclosure button ("+2 editions", `aria-expanded`/`aria-controls`) that expands a compact list of the other editions (title, year, track count, link to the album page). Open/closed is local UI state, not URL state: it is momentary, like hovering.
- New `components/albums/ReleaseGrid.jsx` replaces `AlbumGrid` inside the explorer only: renders `AlbumCard` unchanged for single releases; for a group, a stacked cell (`AlbumCard` + `Editions`, with a CSS "stacked sleeves" shadow). `AlbumCard`/`AlbumGrid` are not edited, so Agent B's save button appears automatically.
- `ReleaseList.jsx` and `Timeline.jsx` take groups instead of releases and show `Editions` under a grouped row/item.
- Result line: "12 releases · 3 alternate editions grouped".

---

## 3. Completeness report panel (M3-7)

New `components/artists/CompletenessReport.jsx`, rendered at the bottom of the discography section, as a native `<details>` element (collapsed by default, keyboard accessible, no JavaScript needed to open). Summary line, e.g. *"About this discography · 2 groups not fully loaded · fetched 3 hours ago"* or *"… complete · fetched just now"*.

Expanded content:

| Group | Loaded | Reported | Status |
| --- | --- | --- | --- |
| Albums | 15 | 15 | Complete |
| Compilations | 10 | 57 | First page only · **Load the rest** |
| Appears On | 100 | 450 | Stopped at 10 pages |

Followed by: duplicates removed ("listed in more than one group, shown once"), alternate editions grouped (from `groupEditions` over all loaded releases), and "Fetched from Spotify 3 hours ago" (full date in a `<time>` element) or "From the demo catalogue". Styles go in `explorer.module.css`.

---

## Files

### Create

| File | Purpose |
| --- | --- |
| `docs/plans/discography-explorer-plan.md` | this plan |
| `server/src/providers/mockProvider.test.js` | summary/report shape, lazy first page, full group |
| `server/src/routes/discographyRoutes.test.js` | both routes over HTTP on the mock provider, 400/404 cases (a new file so `app.test.js`, which I do not own, stays untouched) |
| `client/src/utils/editions.js` + `editions.test.js` | similarity, normalisation, union-find grouping |
| `client/src/components/albums/ReleaseGrid.jsx` | grid with edition stacks |
| `client/src/components/albums/Editions.jsx` | "N editions" disclosure |
| `client/src/components/artists/CompletenessReport.jsx` | the report panel |
| `client/src/components/albums/Discography.test.jsx` | explorer test with a stubbed `fetch`: reported tab counts, opening a lazy tab loads it, Load all, edition toggle in URL, report panel |

### Modify

| File | Change |
| --- | --- |
| `server/src/services/catalog/discographyService.js` (+ test) | `fetchGroup`, `mergeGroups`, `LAZY_GROUPS`; `fetchDiscography` rebuilt on them |
| `server/src/providers/spotifyProvider.js` (+ test) | `getDiscography` (piece cache), new `getDiscographyGroup`; nothing else touched |
| `server/src/providers/mockProvider.js` | `getDiscography` with report, new `getDiscographyGroup`; nothing else touched |
| `server/src/data/mockCatalog.js` | add Driftwood Recordings and Cass Marlowe |
| `server/src/routes/catalogRoutes.js` | new `/artists/:id/discography/:group` route only |
| `client/src/hooks/catalog.js` | add `useDiscographyGroups`; `useDiscography` unchanged |
| `client/src/utils/discography.js` (+ test) | `LAZY_GROUPS`, `pendingGroups`, `mergeDiscography`, tab counts, `discographyTotal`, `describeAge` |
| `client/src/components/albums/Discography.jsx` | lazy loading, notes, editions pipeline, report panel |
| `client/src/components/albums/DiscographyToolbar.jsx` | Group editions toggle |
| `client/src/components/albums/ReleaseList.jsx` | groups + Editions |
| `client/src/components/artists/Timeline.jsx` | groups + Editions |
| `client/src/components/albums/explorer.module.css` | stack, editions, status line, report panel styles |
| `client/src/pages/Artist.jsx` | header count uses `discographyTotal` |
| `docs/phase-3-concepts.md` | new section: lazy loading, piece cache, client merge, Levenshtein, similarity score, union-find, completeness report |
| `docs/phase-2-concepts.md` | "Not done yet": lazy loading moved to done (pointer to Phase 3 section) |

`client/src/utils/releases.js` most likely needs no change (grouping keeps the sorted order); I will only touch its header comment if the wording becomes wrong.

### Not touched

Everything on Agent B's list, `app.test.js`, `scripts/spike.js` (keeps working because `fetchDiscography` keeps its output), `server/.env`, git state.

## Testing

- Server (Vitest, fake fetch only, no live Spotify): page-one-only fetch is 1 request; full fetch reuses page one; caps still apply; merge priority, per-group duplicates, `pending`/`truncated`, oldest `fetchedAt`; provider request counts (artist page = album pages + single pages + 2; opening a tab = remaining pages only; summary afterwards uses the full group with zero requests); invalid group → 400; mock report shape; routes over HTTP.
- Client: editions (pairs that must/must not group, chains, primary choice, order kept, determinism), merge (order independence, duplicates), tab counts, the explorer component test.
- Finish with root `npm test`, `npm run lint` (zero warnings), `npm run build`.

## Risks / notes

- Header total and "All" count use reported totals for unloaded groups, so they can drop slightly once a group loads and duplicates are removed. The panel explains why.
- Edition rules are heuristics; thresholds are constants at the top of `editions.js` with the reasoning next to them.
- If Agent B's in-progress files break tests, lint or build, I will report it rather than fix their files.
