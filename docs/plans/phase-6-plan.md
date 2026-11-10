# Phase 6 plan: Intelligence

Recommendations, a discovery quiz, an era explorer, an artist connection graph, a release calendar, an insights dashboard and a Music DNA card. Everything is computed by Albumly from data it already has. Spotify is asked only when the user presses a button, and never for more than a small, fixed number of requests.

## 1. The constraints that shape the design

| Fact | Consequence |
| --- | --- |
| Spotify returns **no genres, no popularity, no related artists, no recommendations, no new releases** for new apps | Genre dimension (G) uses **artist genres when present** (demo catalogue has them) **plus the user's own tags**. When a candidate has neither, G counts as *unknown* and is left out of that candidate's score (the other weights are renormalised), so it is neither punished nor boosted. The UI and docs say why. Default weights move away from genre. |
| `/artists/{id}/albums` allows ~100 requests a day and is **blocked right now** | Nothing loads discographies on page open. Pages read only what the server already has in its cache (0 Spotify requests). Extra data is loaded only when the user presses a button, at most **2 requests per artist and 3 artists per press**, under a **server-wide daily cap of 30 requests** (configurable). When the endpoint is blocked the server does not even try; the existing `rate_limited` message is shown. |
| The library is in the browser today and may be in the cloud after Phase 5 | All maths runs **in the browser** on the library read through `useEntries()` / `useCollections()`. It works the same with either repository. The server only supplies catalogue data (artists, releases). The pure functions could later run server-side unchanged (`GET /api/recommendations`, PRD 6.1) once the library lives in the database. |
| Four agents share the folder | New files only (listed in section 7). Hub edits are listed in section 8 for the coordinator. Every module is testable without them. |

## 2. Data flow

```
Library store (useEntries, useCollections)      Preferences store (quiz answers + weights, this browser)
              \                                   /
               buildProfile()  ──────────────►  profile vectors (genres+tags, decades, artists)
                                                        │
GET /api/intelligence/artists?ids=…&load=0  ──►  known artists: { artist (genres), releases }  (cache only, 0 Spotify)
GET /api/intelligence/artists?ids=…&load=3  ──►  same, after looking up ≤3 uncached artists (≤6 Spotify requests, on a button)
                                                        │
             buildArtistGraph() → bfs()  ──────────►  connection depth of every artist
             generateCandidates() → scoreCandidate() → explain()  ──►  recommendations with reasons
             computeInsights() → buildMusicDna()  ──►  insights page
             buildCalendar(), buildEras()          ──►  calendar page, artist page eras
```

## 3. Server: one read-mostly endpoint

### `GET /api/intelligence/artists?ids=a,b,c&load=0`

- `ids`: 1 to 40 artist ids, comma separated, each `^[A-Za-z0-9-]{1,64}$` (demo ids have dashes; Spotify ids are checked again before any Spotify call). Order = priority.
- `load`: 0 to 3 (default 0). How many of the ids **not already cached** to look up now, in the given order.
- Validated with zod in the route (errors through `badRequest` → existing envelope).

Response (always 200 unless the input is invalid):

```js
{
  mode: 'mock' | 'spotify' | 'unsupported',
  artists: [{ id, artist: { id, name, imageUrl, genres } | null, releases: Release[] | null, source: 'full' | 'preview' | null }],
  loaded: ['id', ...],                       // looked up during this call
  budget: { limit: 30, spent: 6, remaining: 24, resetsAt: '2026-11-11T00:00:00.000Z' },
  stopped: null | { code: 'rate_limited', retryAfter } | { code: 'budget_exhausted' },
}
```

A failed or refused lookup never fails the whole request; the cached part is still returned with `stopped` saying why.

### Where the data comes from: `services/intelligence/intelligenceSource.js`

`intelligenceSource(provider)` returns `{ mode, peekArtist, peekReleases, loadPreview, blockedFor }`:

- **Mock provider** (no hub edit needed): everything is free. `peekReleases` = `getDiscography`, `peekArtist` = `getArtist`, cost 0. Demo mode gets the full experience, genres included.
- **Spotify provider** with the hub edit: uses the methods added by `createSpotifyIntelligence({ cache, client, market })` (my file, spread into the provider by the coordinator):
  - `peekArtist(id)`: `cache.get('artist:<id>')`, never a request.
  - `peekReleases(id)`: never a request. Full discography if the album and single groups are cached (merged with `mergeGroups`, the same keys the provider uses: `discography:<id>:<group>` and `:first`). Otherwise a **preview** from whatever is cached: page one of albums, page one of appears-on, and the featured `latest-albums:<id>` entry. Otherwise `null`.
  - `loadPreview(id)`: **exactly 2 requests worst case**: page one of `album` (10 newest albums) and page one of `appears_on` (`fetchGroup(…, { firstPageOnly: true })`), cached 7 days. The appears-on key is the provider's own lazy-group key, so a later visit to the artist page reuses it. Returns the requests actually spent.
  - `blockedFor()`: seconds left on a block of `/artists/:id/albums` (from `client.stats().blocked`), so the route skips lookups instead of queueing them.
- **Spotify without the hub edit**: `mode: 'unsupported'`, peeks return `null`, lookups are off. The pages say "this server has not been updated for recommendations yet" instead of breaking.

A test builds the real `createSpotifyProvider` with a fake client, fills the cache through `getDiscography`, and checks that `peekReleases` finds it with 0 new requests. That guards against the cache keys drifting apart.

### Daily budget: `services/intelligence/requestBudget.js`

`createRequestBudget({ limit, storage, now })`: counts Spotify requests spent by intelligence lookups per UTC day. `canSpend(n)`, `spend(n)`, `snapshot()`. Saved with the existing `createFileStorage` to `server/.cache/intelligence-budget.json` (already git-ignored), so `node --watch` restarts do not reset it. A lookup starts only if `remaining >= 2` (its worst case), so the cap can never be overshot. `limit` comes from `INTELLIGENCE_DAILY_REQUESTS` (default 30).

### Route: `routes/intelligenceRoutes.js`

`createIntelligenceRoutes({ getProvider, budget } = {})` returns an Express `Router`. Defaults use the real `getProvider` and a file-backed budget, so the hub edit is one line. Tests pass a fake provider and an in-memory budget and mount it on their own tiny express app with the existing `errorHandler`.

## 4. Client: pure logic (`client/src/utils/`, no React)

| File | Exports | Notes |
| --- | --- | --- |
| `vectors.js` | `cosineSimilarity(a, b)`, `addWeighted(vector, key, w)`, `normalizeVector`, `topEntries(vector, k)` | Sparse vectors as plain objects. Empty or zero vectors → 0. |
| `preferences.js` | `entryWeight(entry)`, `decadeOf(year)`, `buildProfile(entries, { genresByArtist, quiz })` | Weight per album: status (favourite 2, listened/listening 1, want 0.6, none 0.8) × rating factor (`rating / 5`, so 10 → 2, 5 → 1, 1 → 0.2; unrated 1). Vectors: `genres` (artist genres + the album's tags, one vocabulary, lowercase), `decades`, `artists`, plus `tagsByArtist`. Each quiz pick adds the weight of 3 albums (`QUIZ_WEIGHT`), so it seeds an empty library and fades as the library grows. |
| `artistGraph.js` | `buildArtistGraph(releasesByArtist)`, `bfs(graph, sources, { maxDepth = 2, maxNodes = 40 })`, `pathTo(result, id)`, `radialLayout(result, { size })` | Edge = two artists credited on the same release (includes appears-on). Edge keeps the shared release names for the explanation. Multi-source BFS with a queue, depth limit and node cap; parents kept for paths. Layout: ring = depth, angle ordered by parent so lines cross less. |
| `recommender.js` | `DEFAULT_WEIGHTS`, `generateCandidates(...)`, `scoreCandidate(...)`, `explain(...)`, `recommend(...)` | See section 5. |
| `insights.js` | `groupBy`, `computeInsights(entries, collections, { genresByArtist })` | Totals (albums, artists, collections, rated, tracks, known listening time), status counts, top artist (album count, tie → higher average rating → name), top genre (artist genres; falls back to top tag and says "tag"), decade distribution, rating distribution 1–10, average rating (rated albums only, 1 decimal), top tags. |
| `musicDna.js` | `buildMusicDna(insights, profile)` | Traits: core genres/tags (top 3), home decade, top artists, "explorer" score (distinct artists ÷ albums), rating style (generous / balanced / critical vs. midpoint 5.5), finisher share (listened ÷ saved). Each trait has a short sentence. |
| `eras.js` | `buildEras(releases)` | Each studio album (group `album`, inferred type `album`, alternate editions folded into the original via `normalizeTitle`) anchors an era. A single, EP or feature joins the **next** album if it comes out up to 24 months before it (lead-up singles), otherwise the **previous** album's era. Releases before the first album: "Before {first album}". After the last album: "After {last album}". Year-only dates sort as 1 January but are labelled "sometime in 2019". |
| `calendar.js` | `buildCalendar(releases, { year })`, `releaseYears(releases)`, `upcomingAndRecent(releases, today)` | Year view = 12 months with counts; month view = releases by day. Month-precision releases go under "day not known", year-only under "sometime this year". De-duplicates by id. |

## 5. The recommender

**Candidates** (only from data the server returned; no search, because Spotify's genre/year search filters are unconfirmed and genres are empty):
1. Other albums and EPs by artists in the library or chosen in the quiz (full or preview releases).
2. Appears-on releases of those artists (albums by other artists that feature them).
3. Albums by artists one or two BFS steps away whose releases are already cached.

Removed: anything in the library by id, **other editions of owned albums** (same main artist and same `normalizeTitle`), plain singles of 1–3 tracks, compilations, and duplicates. Capped at 300 before scoring; top 20 shown.

**Score** (each part in 0 to 1):

- **G, genre and tags**: `cosine(profile.genres, candidate genre vector)`. The candidate vector is its artists' genres plus the tags the user put on their *other* albums by those artists. Neither present → *unknown*.
- **Y, era**: `cosine(profile.decades, candidate decade vector)`, where the candidate vector is its decade at 1 and the neighbouring decades at 0.5, so the 2010s also partly match a 2000s fan.
- **C, connection**: `1 / (1 + d)` where `d` is the BFS distance from the library's artists to the closest credited artist (0 → 1, 1 → 0.5, 2 → 0.33, not reached → 0).
- **U, your taste**: the main artist's weight in the profile divided by the largest artist weight (ratings and statuses are already inside those weights).

`Score = (w1·G + w2·Y + w3·C + w4·U) / (sum of the weights of the known parts)`

Default weights (rebalanced because there are no Spotify genres): **G 15, Y 25, C 25, U 35** (sliders 0 to 10 in the settings panel, stored as numbers; the defaults are 1.5 / 2.5 / 2.5 / 3.5 on that scale). "Reset to defaults" button. Ties break by newer release, then title, so the order is stable.

**"Why this?"**: every result lists its strongest one to three reasons, built from the parts that contributed most, plus a small breakdown (four labelled bars, numbers in text too). Examples:
- U: "You rated 2 Neon Harbor albums 8/10 or higher"
- C: "Mara Voss, who you have saved, features on it" / "Connected through Neon Harbor → Mara Voss (Velvet Hours)"
- Y: "From the 2010s, the decade you save most"
- G: "Shares synthwave and the tag “late night” with your library"
- Parts counted as unknown are named: "Genre not counted: no genre or tag data for this artist".

## 6. Pages and components

All pages are lazy routes under `/discover`, share one sub-navigation (`IntelligenceNav`), use the existing `Feedback` states (skeleton, empty, error with `describeError`) and the existing design tokens. Only one hub nav item is needed.

| Route | Page file | What it shows |
| --- | --- | --- |
| `/discover` | `pages/Discover.jsx` | Recommendations with reasons and breakdown; "Tune recommendations" settings panel (weight sliders, reset); discovery quiz (genres incl. the user's tags, decades, artists from library + recently explored + search); `LookupButton` ("Look up 3 more artists · uses up to 6 of today's 24 remaining Spotify lookups"); `DataNote` explaining the missing Spotify genres. Empty library → the quiz first. |
| `/discover/insights` | `pages/Insights.jsx` | Title "Your Albumly library". Stat tiles, decade bar chart, rating bar chart, status breakdown, top artists and tags, Music DNA card. Every chart has the same numbers in a visible table or list. Never says "listening stats". 0 Spotify requests. |
| `/discover/calendar` | `pages/ReleaseCalendar.jsx` | Year/month view of releases by saved and recently explored artists (`useRecents`, read only), from cached data; `LookupButton` for more. Year and month in the URL (`?year=2024&month=6`). |
| `/discover/connections` | `pages/Connections.jsx` | Artist graph from `?artist=<id>` (default: the library's top artist). Depth 1 or 2 toggle, at most 40 artists. Hand-drawn SVG (rings by distance) plus an accessible nested list that holds the same information and works with a keyboard. "Expand" on an artist with no cached releases uses the same capped lookup. |
| artist page section | `components/intelligence/ArtistIntelligence.jsx` | Era explorer for that artist (uses `useDiscography(id)`, the query the artist page already ran, so 0 extra requests) and a "See connections" link. |

Components in `components/intelligence/`: `IntelligenceNav`, `DataNote`, `LookupButton`, `PreferenceQuiz`, `WeightsPanel`, `RecommendationCard`, `ScoreBreakdown`, `StatTiles`, `InsightsCharts` (Recharts, already installed; only loaded with the Insights page), `MusicDnaCard`, `EraExplorer`, `ArtistGraph`, `ConnectionList`, `CalendarView`, `ArtistIntelligence`, `intelligence.module.css`.

Hooks (new files in `client/src/hooks/`):
- `useIntelligence.js`: `useKnownArtists(ids)` (TanStack Query, key `['intelligence', 'artists', ids]`, `load=0`, `staleTime` 5 min, `placeholderData` keeps the previous result) and `useArtistLookup()` (a mutation with `load=3`; on success it invalidates the `['intelligence']` queries, which refetch from cache at 0 Spotify cost). Uses the existing `apiGet` (GET, no body, no auth needed).
- `usePreferences.js`: quiz answers and weights in a tiny store like `services/recents.js` (`useSyncExternalStore`, localStorage `albumly:intelligence:v1`, checked with zod, every read and write in try/catch). This is Albumly's own preference data, not the library, so it does not go through the library repository. Phase 5 could sync it later.
- `useLibraryProfile.js`: glues `useEntries()` + known artists + preferences into `{ profile, genresByArtist, artistIds }` with `useMemo`.

### Why not React Flow

The graph has at most 40 nodes in at most 3 rings, needs no dragging or zooming, and BFS depth already gives a clean layout. React Flow (`@xyflow/react`) would add roughly 150 KB of JavaScript and its own styling for something a 120-line SVG component does, and an SVG drawn by hand is a learning goal in itself. Accessibility comes from the nested list beside it, which a canvas library would not give for free either. **No npm packages are needed for Phase 6.**

## 7. Files to create

**Server**
- `server/src/services/intelligence/requestBudget.js` + `.test.js`
- `server/src/services/intelligence/spotifyIntelligence.js` + `.test.js` (peeks and the 2-request preview; key-compatibility test with the real provider)
- `server/src/services/intelligence/intelligenceSource.js` + `.test.js` (mock / spotify / unsupported)
- `server/src/routes/intelligenceRoutes.js` + `.test.js` (own express app; validation, cache-only by default, `load` respects budget and blocks, partial results on `rate_limited`)

**Client**
- `client/src/utils/vectors.js`, `preferences.js`, `artistGraph.js`, `recommender.js`, `insights.js`, `musicDna.js`, `eras.js`, `calendar.js`, each with a `.test.js`
- `client/src/utils/intelligenceFixtures.js` (fixed fixture library + releases, shared by the tests; the insights numbers are hand-computed in comments)
- `client/src/hooks/useIntelligence.js`, `usePreferences.js` (+ test), `useLibraryProfile.js`
- `client/src/components/intelligence/*` (listed above), with tests for `RecommendationCard`, `EraExplorer`, `ArtistGraph`/`ConnectionList`, `WeightsPanel`
- `client/src/pages/Discover.jsx`, `Insights.jsx`, `ReleaseCalendar.jsx`, `Connections.jsx`, with `Discover.test.jsx` and `Insights.test.jsx` (rendered directly in a `MemoryRouter` + `QueryClientProvider`, `fetch` stubbed, library set with `resetLibrary`)

**Docs**
- `docs/plans/phase-6-plan.md` (this file), `docs/phase-6-concepts.md` (cosine similarity, weighted scoring with unknown parts, BFS, group-by aggregation, budget-capped crawling, why the work runs in the browser)

## 8. Hub edits for the coordinator (I will not make these)

1. **`client/src/router.jsx`**, inside the children list before `'*'`:
   ```js
   { path: 'discover', lazy: page(() => import('./pages/Discover.jsx')) },
   { path: 'discover/insights', lazy: page(() => import('./pages/Insights.jsx')) },
   { path: 'discover/calendar', lazy: page(() => import('./pages/ReleaseCalendar.jsx')) },
   { path: 'discover/connections', lazy: page(() => import('./pages/Connections.jsx')) },
   ```
2. **`client/src/components/layout/navItems.js`**: add `Sparkles` to the lucide import and `{ to: '/discover', label: 'Discover', icon: Sparkles }` after Library (no `end`, so it stays highlighted on the sub-pages). The bottom bar goes from 4 to 5 items.
3. **`client/src/pages/Artist.jsx`**: `import ArtistIntelligence from '../components/intelligence/ArtistIntelligence.jsx'` and, after the Discography `<section>`, `<ArtistIntelligence key={id} artistId={id} />`.
4. **`server/src/app.js`**: `import { createIntelligenceRoutes } from './routes/intelligenceRoutes.js'` and `app.use('/api', createIntelligenceRoutes())` just before `app.use('/api', catalogRoutes)`.
5. **`server/src/providers/spotifyProvider.js`**: `import { createSpotifyIntelligence } from '../services/intelligence/spotifyIntelligence.js'` and add `...createSpotifyIntelligence({ cache, client, market }),` inside the returned provider object. (Until this lands, Spotify mode answers `mode: 'unsupported'`; demo mode works without it.)
6. **`server/.env.example`**: `# Most Spotify requests the recommendation, graph and calendar lookups may spend per day (UTC)` / `INTELLIGENCE_DAILY_REQUESTS=30`.
7. Optional, **`README.md`**: one line under features pointing at `/discover` and `docs/phase-6-concepts.md`.

## 9. Spotify request budget (worst case, `/artists/{id}/albums`)

| Feature | On page open | On a button press | Per day |
| --- | --- | --- | --- |
| Insights + Music DNA | 0 (library snapshots; one call to our server, cache only) | n/a | 0 |
| Era explorer | 0 extra (reuses the artist page's discography query) | n/a | 0 |
| Recommendations | 0 | ≤ 6 (3 artists × 2) | shared cap |
| Connection graph | 0 | ≤ 6 per "Expand" | shared cap |
| Release calendar | 0 | ≤ 6 per "Look up more" | shared cap |
| Quiz artist picker | 0 | 1 search request per typed query (search endpoint, cached 10 min, not the albums endpoint) | small |
| **All lookups together** | **0** | **≤ 6** | **≤ 30** (`INTELLIGENCE_DAILY_REQUESTS`) |

While the albums endpoint is blocked, lookups cost **0** requests: the server sees the block and answers `stopped: rate_limited` with the time left, shown with the existing message. Previews are cached 7 days; the appears-on page is shared with the artist page's own cache.

## 10. Tests and exit criteria

- Cosine similarity: identical → 1, orthogonal → 0, empty → 0, scale does not matter, hand example `{a:1,b:2}·{a:2,b:1}` → 0.8.
- Scoring: a hand-computed score for one candidate; an unknown G is left out of the denominator; weights of zero; stable tie order.
- Recommendations never include an owned album or another edition of one, and every result has at least one reason (exit criterion).
- BFS: visiting order, depth limit, node cap, shortest path, multiple sources, cycles.
- Insights: a fixed 8-album fixture whose totals, top artist, top genre/tag, decade counts and average rating were worked out by hand in the test file (exit criterion).
- Eras, calendar, Music DNA, budget (day rollover, never overshooting), route (validation, cache-only default, budget, block, partial results).
- Before reporting: root `npm test`, `npm run lint`, `npm run build`.

## 11. Not in this phase

- Edges from track-level credits (needs each album's tracks, which costs album requests); the graph uses release-level credits and appears-on.
- Search-based candidates by genre or year (Spotify gives no genres and the `year:` filter is unconfirmed).
- Syncing quiz answers and weights to an account (they stay in this browser; Phase 5's sync could pick them up later).
- Server-side `GET /api/recommendations` / `GET /api/insights`: the same pure functions can move there once the library is in the database.
