# Technical challenges

_Draft (Phases 1–4). Each entry covers the problem, what made it hard, what Albumly does, the trade-off, and where to look in the code. Phase 8 Part B adds accounts, intelligence and community._

## 1. Spotify took away most of the API

**Problem.** In 2026 Spotify cut what new apps may use:
- batch lookups (`/albums?ids=`) are gone
- genres, popularity and followers come back empty
- "new releases", "top tracks", "related artists" and recommendations answer 403
- search and discography pages are capped at 10 items

**Constraint.** The product idea (a complete discography, a library and recommendations) assumed all of those.

**Solution.**
- The whole core product was rebuilt on the six endpoints that still work (PRD §2).
- The home page uses an editorial artist list.
- The library stores a **snapshot** of each album when it is saved, so a library of 200 albums renders with zero requests.
- "EP" is inferred (a single with 4–6 tracks) and labelled as inferred.
- Recommendations (Phase 6) are computed by Albumly from the user's own library.

**Trade-off.** Some numbers can never be shown (popularity, followers). The UI simply leaves them out rather than faking them.
**Code.** `server/src/services/spotify/normalize.js`, `server/src/services/catalog/classify.js`, `client/src/services/library/schema.js`.

## 2. A discography costs dozens of requests, and Spotify blocks you for a day

**Problem.** Some numbers:
- 10 releases per page, one release group per request: a big artist costs 20+ requests.
- The spike was blocked from the artist-albums endpoint for **24 hours** after about 100 requests in a few minutes.

**Solution.** The server is a *caching aggregator*, not a thin proxy:
- One outbound queue: at most 4 Spotify calls at once, and identical in-flight calls share one promise.
- `Retry-After` is honoured. Short waits are retried. Long blocks are remembered **per endpoint** and saved to disk, so search keeps working while discographies are blocked, and a restart does not hammer Spotify again.
- Compilations and guest appearances, the costly and least-visited groups, are **lazy**: page one is sent with the summary (it carries the total for the tab label), and the rest loads only when the tab is opened.
- Each group is cached separately for 7 days. A failed group can be retried without re-fetching the ones that worked.

**Trade-off.** First visits to huge artists show "first 10 of 57 compilations" until the tab is opened. Page caps stop pathological artists, and the UI says so.
**Code.** `server/src/services/spotify/spotifyClient.js`, `server/src/services/catalog/discographyService.js`, `client/src/utils/discography.js`.

## 3. `album_group` disappeared

**Problem.** Spotify no longer says *why* a release is in an artist's list (their own album or a guest appearance).
**Solution.** The server asks once per group (`include_groups=album`, `single`, `compilation`, `appears_on`) and stamps the group itself. A release listed in two groups is kept once, in priority order, using a hash map. The client applies the same rule when merging lazily loaded groups, so the result does not depend on which group arrived first.
**Code.** `discographyService.js`, `mergeDiscography` in `client/src/utils/discography.js`.

## 4. Token refresh stampede

**Problem.** Client Credentials tokens last an hour. When one expires, every request in flight would try to renew it at once.
**Solution.** The token is renewed a minute early, and the refresh is single-flight: everyone waits on one promise. A 401 triggers exactly one forced refresh and retry.
**Code.** `server/src/services/spotify/tokenService.js` (+ tests with a fake clock).

## 5. A cache that is small, fast and survives restarts

**Problem.** Free hosting has little memory, and restarts empty an in-memory cache.
**Solution.**
- A hand-written LRU + TTL cache. A JavaScript `Map` keeps insertion order, so re-inserting on every read keeps the least recently used entry first, and eviction is O(1).
- `getOrLoad` coalesces concurrent misses into one load.
- Entries are written to a JSON file with an atomic rename, so a crash never leaves half a file.

**Trade-off.** Render's disk is temporary, so in production the file only survives *process* restarts, not redeploys. A Redis-backed storage would fix that behind the same interface.
**Code.** `server/src/services/cache/lruCache.js`, `fileStorage.js`.

## 6. Grouping deluxe editions without grouping sequels

**Problem.** "Glass Arcade (Deluxe Edition)" belongs under "Glass Arcade". "Night Ferry II" and "Sampler Vol. 2" must stay separate, and are only one letter apart.
**Solution.**
- Titles are normalised (accents, edition words in brackets).
- A weighted score `S = 0.4N + 0.3A + 0.2D + 0.1T`, with N from Levenshtein similarity.
- Two extra gates: N ≥ 0.9, and the numbers in both titles must match.
- Union-find joins matching pairs into groups.
- Filtering runs before grouping, so editions are never hidden for good.

**Code.** `client/src/utils/editions.js` (+ tests with the tricky cases).

## 7. Never trusting localStorage

**Problem.** Stored data can be missing, full, blocked, edited by hand, or from an older version of the app. An imported file can contain anything, including a `javascript:` link.
**Solution.**
- One zod schema validates both. **Loading is forgiving:** valid parts are kept, a backup of the original is saved first, and the app keeps working without storage. **Importing is strict:** all or nothing, with an error report that names each field.
- Saved data carries a version, and migrations run step by step.
- Links must start with `http`.
- CSV export escapes formula characters.

**Code.** `client/src/services/library/schema.js`, `localRepository.js`, `transfer.js`.

## 8. "1989" is an album, not only a year

**Problem.** A universal search box should understand `the weeknd 2020 album`. But `1989`, `Singles` and `Songs` are real album titles.
**Solution.** A two-step tokenizer and parser:
- A year or type word only becomes a filter when other text remains.
- Quotes force text (`taylor swift "1989"`).
- The page shows what it understood ("Understood as: …").
- The first time a filter is touched, the parsed values move into the URL, so the text and the controls never disagree.

**Code.** `client/src/utils/queryParser.js` (dozens of examples in its tests).

## 9. Testing the whole app without Spotify, Supabase or the developer's servers

**Problem.** A browser test that called live Spotify would burn the daily allowance and fail whenever Spotify blocks the app. A test that read `server/.env` could pick up real keys. The developer's own dev servers already occupy the usual ports.
**Solution.**
- Playwright starts its **own** API on port 5066. It builds the Express app directly instead of going through `server.js`, so `.env` is never read and the demo catalogue is always used.
- It starts its own Vite on 5288 with an empty env folder, so no Supabase keys load, and a separate cache folder.
- Both shut down after the run.
- Selectors use roles and accessible names, so the tests double as an accessibility check and survive styling changes.

**Code.** `playwright.config.js`, `server/scripts/e2e-server.js`, `client/vite.e2e.config.js`, `e2e/`.

## 10. Keeping the first load small

**Problem.** Recharts, dnd-kit and zod are large. PRD §3.3 sets a 200 KB gzip budget for the initial JavaScript.
**Solution.**
- Every page except Home is a lazy route chunk.
- Recharts only loads with the Compare page.
- `npm run check:bundle` measures the initial files after each build and fails if the budget is broken or a heavy library sneaks into the first load.

**Code.** `client/src/router.jsx`, `scripts/bundle-budget.js`.
