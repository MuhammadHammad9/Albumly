# Technical challenges

Each entry covers the problem, what made it hard, what Albumly does, the trade-off, and where to look in the code.

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

## 11. One library, two homes, no lost edits

**Problem.** The store expects a synchronous `load` and `save`, but the cloud is asynchronous, can be offline, and the same account can be open on two devices.
**Solution.**
- `apiRepository` keeps a per-user copy on the device, so the UI is instant and works offline.
- It turns every change into a queue of small **idempotent** operations (safe to send twice). They are sent in a fixed order and each is applied to the "confirmed" copy as it succeeds, so a closed tab resumes where it stopped.
- Conflicts use "newest `updatedAt` wins", with future timestamps clamped on the server.
- The first sign-in offers to move the browser library into the account, as one merge transaction.

**Trade-off.** Device clocks decide "newest", and there are no tombstones, so an album deleted on one device can come back from an offline device's queued edit. This is documented and acceptable at this scale.
**Code.** `client/src/services/library/sync.js`, `apiRepository.js`, `server/src/services/library/merge.js`.

## 12. Row-level security that also covers our own server

**Problem.** The Supabase publishable key is public, so anyone could call Supabase's Data API directly. A forgotten `where user_id = …` in our own SQL would leak data.
**Solution.**
- Express verifies the JWT itself and runs every query inside `db.asUser()`. That is one transaction that switches to the `authenticated` role and sets the user id, so the same RLS policies Supabase uses filter **our** queries too.
- CHECK constraints repeat the zod limits, so bad data cannot get in by another route.
- Someone else's row is always a 404, never a 403, so ids cannot be probed.

**Code.** `server/src/db/database.js`, `database/migrations/0002_rls.sql`; tested on PGlite in `server/src/db/rls.test.js`.

## 13. Public collections without leaking private columns

**Problem.** RLS decides about whole **rows**. A policy "anyone may read entries in a public collection" would also expose private notes, tags and statuses through the Data API.
**Solution.**
- A `security definer` function returns a fixed, whitelisted JSON shape for one slug.
- No public policy opens `library_entries`.
- Snapshots are cleaned again on the way out, and links are checked again in the browser.
- One vote per user per battle is the votes table's **primary key**, so the database itself refuses a second vote.

**Code.** `database/migrations/0003_community.sql`, `server/src/services/community/publicAlbum.js`, `client/src/utils/safeUrl.js`.

## 14. Recommendations without a recommendations API

**Problem.** Spotify gives new apps no recommendations, related artists or genres, and allows only about 100 discography pages a day.
**Solution.**
- Albumly builds a preference profile from the library: three vectors (genres/tags, decades, artists), compared with cosine similarity.
- Candidates come only from discographies the server has already cached.
- Every result has a written reason, and a result with no link to you scores 0 and is not shown.
- Opening a page never calls Spotify. Only the "Look up" button does, at most 2 requests per artist, under a server-wide daily budget.

**Code.** `client/src/utils/vectors.js`, `recommender.js`, `artistGraph.js`; `server/src/routes/intelligenceRoutes.js`, `server/src/services/intelligence/requestBudget.js`.

## 15. Testing account flows without Supabase

**Problem.** Sign-in normally needs a live Supabase project. Using it would make tests slow, flaky and dependent on secrets.
**Solution.**
- A second e2e API (`e2e-server.js --accounts`) uses PGlite (real Postgres in memory, with the real migrations and RLS) and a key pair made at start-up. Our real token verifier checks signature, issuer and expiry.
- In the browser, Playwright answers Supabase Auth's requests itself (`e2e/support/fakeSupabase.js`), handing out tokens signed by that server.
- The tests cover sign-in, a wrong password, sign-up confirmation, moving the browser library into the account, the same library in a second browser, sharing a collection with a logged-out visitor, admin refusal, and account deletion.

**Code.** `server/scripts/e2e-server.js`, `e2e/support/fakeSupabase.js`, `e2e/tests/accounts/`.

## 16. A strict Content Security Policy versus a validation library

**Problem.** The production CSP allows scripts only from Albumly itself (no `eval`). Running the real build under the real headers (`e2e/tests/prod/`) showed a CSP violation on **every page**. zod 4 probes whether it may generate code with `new Function`; the probe is caught, but browsers still report it.
**Solution.** `z.config({ jitless: true })` in `client/src/zodSetup.js`, imported by every module that uses zod, so it runs before any schema. The test now fails on any violation. Without that test, the first sign of the problem would have been console errors in production.

## 17. Fonts versus first paint

**Problem.** Lighthouse's mobile test showed the Google Fonts stylesheet blocking the first paint for about 0.9 s. Loading it later with `display=swap` then made the layout jump when the font arrived.
**Solution.** The stylesheet is added from `main.jsx`, because the CSP forbids the usual inline `onload` trick, and uses `display=optional`. If Inter isn't ready almost immediately, the visit keeps the fallback font. There is no blocking and no jump; the next visit has Inter cached.
