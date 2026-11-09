# Albumly — Product Requirements Document & Phased Build Plan

## 1. Context

**What:** Albumly is an independent music-discovery and discography-management web app built on the Spotify Web API. A user searches an artist, explores the complete discography (albums / singles / EPs / compilations / appears-on), inspects albums and tracklists, compares releases, saves albums into personal collections, and gets recommendations and insights computed by Albumly itself.

**Why:** A portfolio-grade full-stack project that demonstrates real engineering (API proxying, token management, pagination, caching, rate-limit handling, data modelling, algorithms, testing, deployment), not just a search page.

**Starting point:** The project folder is empty (no code, no git repo). Everything is greenfield.

**Decisions confirmed with you**

| Decision | Choice |
|---|---|
| Scope | Full product, shipped as 3 releases, working app at every phase |
| Build mode | Claude writes the code and explains each piece as it goes |
| Stack | React (Vite, JavaScript) + plain CSS · Node/Express · Spotify Web API · Supabase/Postgres later |
| Data layer (Release 2+) | React → Express → Supabase (React never talks to Supabase directly) |
| Auth | Local library first (no accounts) → Albumly email accounts later. No Spotify login. |
| Spotify Premium | Not active yet; you will subscribe before Phase 2. Phase 1 runs on mock data. |
| Design | Premium dark interface (tokens in §7) |

---

## 2. Feasibility analysis — what Spotify actually allows (verified 2026-11-10)

I checked the live Spotify docs (Feb 2026 migration guide, Feb/March 2026 changelogs, endpoint references). Several items in the original blueprint are no longer possible, and the plan is redesigned around that.

### 2.1 Hard facts

| Fact | Consequence for Albumly |
|---|---|
| Dev Mode app needs owner's **active Premium**; if it lapses the app stops working | Blocker for Phase 2. Also a production risk → cache + "demo mode" fixtures (see §9) |
| `GET /search` max `limit` **10** (default 5), offset ≤ 1000 | Search pages are 10 items; "load more" pagination; aggressive caching |
| `GET /artists/{id}/albums` max `limit` **10** | A 300-release discography ≈ 30+ sequential requests → **server-side aggregation + long cache is mandatory** |
| Album field `album_group` **removed** | Cannot tell "appears on" from the response. Server must fetch **once per `include_groups` value** (album, single, compilation, appears_on) and stamp the group itself |
| Batch endpoints `GET /albums?ids=`, `/artists?ids=`, `/tracks?ids=` **removed** | One request per ID. Library must store a metadata snapshot at save time; compare = 2 calls; never re-fetch N albums to render a list |
| `popularity`, `followers`, `label`, `available_markets` **removed** | No popularity sort, no follower counts, no "most popular releases". Ranking comes from Albumly's own data (saves, ratings, battles) |
| `GET /browse/new-releases`, `/browse/categories`, `/artists/{id}/top-tracks` **removed** | Home "trending" cannot come from Spotify → curated editorial list + Albumly's own "most explored" counters |
| Album `genres` is **always empty** | Genres can only come from the artist object |
| `album_type` is only `album` / `single` / `compilation` | "EP" is an **inferred** label, shown as such |
| Still available: `/search`, `/artists/{id}`, `/artists/{id}/albums`, `/albums/{id}`, `/albums/{id}/tracks`, `/tracks/{id}` | The whole core product fits inside these six endpoints |

### 2.2 Unverified — resolved by the Phase 2 spike before any feature depends on them

- Does the **artist object still return `genres`** (and are they populated)? Recommendations, insights and Music DNA weight genre heavily.
- Are `/artists/{id}/related-artists` and `/recommendations` reachable? Assumed **no**; nothing depends on them.
- Do search field filters (`year:2020-2025`, `genre:"..."`, `artist:`, `album:`, `tag:new`) still work? Needed for advanced search and recommendation candidate generation.
- Does the 5-authorized-user cap affect Client Credentials traffic (no user login)? Expected no, since nobody authorizes; confirm.

**Fallback if genres are gone:** genre dimension is replaced by user tags + (optionally) MusicBrainz tags behind the same provider interface; recommendation weights rebalance toward year/collaboration/user-preference.

### 2.3 Request-budget design (the central engineering problem)

Because every list is capped at 10 and batching is gone, the backend is designed as a **caching aggregator**, not a thin proxy:

1. **Token service** — Client Credentials token cached in memory, refreshed ~60 s before expiry, single in-flight refresh (no stampede).
2. **Outbound request queue** — all Spotify calls go through one limiter (concurrency 3–4), with `Retry-After` handling on 429 and exponential backoff + jitter on 5xx.
3. **In-flight de-duplication** — identical concurrent requests share one promise.
4. **LRU + TTL cache** (hand-written, an explicit learning goal): search 10 min · artist 24 h · full discography 24 h · album + tracks 7 days.
5. **Discography aggregation** — `GET /api/artists/:id/discography` loops all pages of all 4 groups server-side, de-duplicates by ID, stamps `group`, infers EP, computes edition keys, and returns one normalized payload. First load is slow (progress skeleton); every later load is a cache hit. Filtering / sorting / search-within then happen **entirely client-side** with zero API calls.

---

## 3. Product definition

### 3.1 Personas
- **The deep diver** — wants every release of an artist in order, with editions de-cluttered.
- **The collector** — keeps lists, ratings and notes on albums.
- **The explorer** — wants "what next?" based on what they already like.
- **The reviewer (recruiter/interviewer)** — opens the deployed link for 2 minutes; it must work instantly, look polished, and never show a raw error.

### 3.2 Goals / non-goals
**Goals:** complete accessible discography in one view · fast repeat navigation · personal library that survives refresh and later syncs to an account · Albumly-native intelligence · deployed, tested, documented.

**Non-goals:** audio playback or previews · Spotify login / reading a user's Spotify library · popularity or follower stats · lyrics/credits · native mobile app · presenting Albumly as a Spotify product.

### 3.3 Success metrics
| Metric | Target |
|---|---|
| Search → artist results (warm cache / cold) | < 300 ms / < 1.5 s |
| Discography load (warm / cold, 100 releases) | < 300 ms / < 8 s with progress UI |
| Cache hit ratio after warm-up | > 70 % |
| Spotify 429s reaching the user as errors | 0 (absorbed by queue/retry) |
| Lighthouse (perf / a11y / best practices) | ≥ 90 / ≥ 95 / ≥ 95 |
| Initial JS bundle (gzip) | < 200 KB, routes code-split |
| Test coverage on `utils/` and server services | ≥ 80 % |

---

## 4. Functional requirements

Priority: **P0** = MVP (Release 1) · **P1** = Release 2 · **P2** = Release 3 · **P3** = optional.

### M1 Artist discovery
| ID | Requirement | Pri |
|---|---|---|
| M1-1 | Search artists by name; cards with image, name, genres (if any), "Explore" action, Spotify link | P0 |
| M1-2 | Debounced input (400 ms), `AbortController` cancellation, min 2 chars | P0 |
| M1-3 | Suggestions dropdown with full keyboard navigation (↑ ↓ Enter Esc), ARIA combobox | P0 |
| M1-4 | Disambiguation: same-name artists shown as separate cards with genres/image to tell apart | P0 |
| M1-5 | Recent searches + recently explored artists carousel (localStorage) | P0 |
| M1-6 | "Load more" pagination (10 per page) | P0 |
| M1-7 | Home discovery sections from a curated list (`server/src/data/featured.json`) + Albumly "most explored" | P1 |

### M2 Artist profile
| ID | Requirement | Pri |
|---|---|---|
| M2-1 | Header: image, name, genres, Spotify link, release counts per group | P0 |
| M2-2 | Tabs: Albums · Singles · EPs (inferred) · Compilations · Appears On | P0 |
| M2-3 | Every optional field renders gracefully when missing (no image, no genres) | P0 |

### M3 Album explorer
| ID | Requirement | Pri |
|---|---|---|
| M3-1 | Release grid cards: artwork, title, date, type badge, track count, artists, Spotify link | P0 |
| M3-2 | Filters: group, year range, text search within discography | P0 |
| M3-3 | Sort: newest, oldest, A–Z, track count (date precision `year`/`month`/`day` handled) | P0 |
| M3-4 | Grid / list toggle; group-by-year view | P0 |
| M3-5 | **Discography timeline** (chronological, studio albums emphasized) | P0 |
| M3-6 | **Edition grouping**: Deluxe/Remaster/Anniversary stacked under a base release, expandable, never hidden permanently; "hide alternate editions" toggle | P1 |
| M3-7 | **Completeness report**: releases retrieved per group, duplicates removed, editions detected | P1 |
| M3-8 | **Era explorer**: eras anchored on studio albums, with surrounding singles/features | P2 |

### M4 Album details
| ID | Requirement | Pri |
|---|---|---|
| M4-1 | Artwork (unmodified), title, artists, date, type, track count, **computed total duration**, explicit indicator, Spotify link | P0 |
| M4-2 | Tracklist: #, title, featured artists, duration, explicit; grouped by disc; albums > 50 tracks paginated server-side | P0 |
| M4-3 | Search within tracklist; open track on Spotify; copy link; Web Share | P0 |
| M4-4 | Save / add to collection / rate from this page | P1 |

### M5 Advanced search
| ID | Requirement | Pri |
|---|---|---|
| M5-1 | Tabbed search over artists / albums / tracks | P1 |
| M5-2 | Filters: year range, type, artist, min track count, order | P1 |
| M5-3 | Universal query parser: `"the weeknd 2020 album"` → `{artist, year, type}` (pure JS tokenizer, unit-tested) | P1 |

### M6 Personal library
| ID | Requirement | Pri |
|---|---|---|
| M6-1 | Status per album: Favourite / Want to listen / Listening / Listened | P1 |
| M6-2 | Custom collections: create, rename, delete, reorder (drag-and-drop), duplicate detection | P1 |
| M6-3 | Rating 1–10, review text, tags, notes | P1 |
| M6-4 | Library filters (artist, year, status, tag); export/import JSON, export CSV | P1 |
| M6-5 | Accounts + cloud sync; one-time migration of the local library on first sign-in | P1 |
| M6-6 | Public collections via share URL | P2 |

### M7 Comparison · M8 Recommendations · M9 Insights · M10 Admin
| ID | Requirement | Pri |
|---|---|---|
| M7-1 | Side-by-side compare of 2 albums: year, tracks, duration, explicit count, featured-artist count, deltas, chart | P1 |
| M7-2 | **Album Battle**: vote between two albums, community results + leaderboard (needs accounts) | P2 |
| M8-1 | Content-based recommender: `Score = w1·G + w2·Y + w3·C + w4·U`, configurable weights, "why this?" explanation per result | P2 |
| M8-2 | Discovery quiz (genres, decades, artists) seeding a preference profile | P2 |
| M8-3 | Artist connection graph from shared track credits / appears-on (BFS, depth-limited) | P2 |
| M8-4 | Release calendar (month/year view of saved + explored artists' releases) | P2 |
| M9-1 | Insights: totals, top artist, top genre, decade distribution, avg rating, charts (Recharts). Labeled "your Albumly library", never "Spotify listening stats" | P2 |
| M9-2 | Music DNA profile card | P2 |
| M10-1 | Ops dashboard: request count, Spotify latency, cache hit/miss, 429s, errors, top searches | P2 |
| M10-2 | Moderation for public reviews/collections | P3 |

**Recommendation candidate generation** (since Spotify offers no recommend/related/browse endpoints): other releases by saved artists → artists credited on saved albums' tracks → `appears_on` neighbours → search with `genre:`/`year:` filters (if the spike confirms them). Candidates are scored, de-duplicated against the library, and capped to keep the request budget small; results are cached per profile hash.

---

## 5. Non-functional requirements

- **Security:** Client Secret and Supabase service-role key only in `server/.env`; `.env` git-ignored, `.env.example` committed; zod validation on every route (Spotify IDs = 22-char base62); `helmet`, CORS allow-list, per-IP rate limit on our own API; Supabase RLS enabled as defence in depth; JWT verified in Express middleware.
- **Resilience:** uniform error envelope `{ error: { code, message, retryAfter? } }`; 401 → refresh token once and retry; 403 → "access restricted" message; 404 → not-found page; 429 → queue waits `Retry-After`; 5xx → backoff then retry button. Saved albums whose Spotify ID no longer resolves render from snapshot with an "unavailable" badge.
- **UX states on every data page:** skeleton, empty, no-results, error, API-unavailable, offline; later expired-session.
- **Accessibility:** semantic landmarks, keyboard-complete, visible focus, alt text `"{album} by {artist} cover"`, contrast ≥ 4.5:1, `prefers-reduced-motion`.
- **Responsive:** desktop sidebar + top search; mobile bottom nav + full-screen detail; breakpoints 640 / 1024.
- **Spotify compliance:** artwork never cropped/overlaid/recolored; every artist/album/track links back to Spotify; attribution in footer; no audio; "Albumly is not affiliated with Spotify"; privacy policy once accounts exist; account + data deletion.

---

## 6. Architecture

```
Browser (React SPA)
  pages → feature components → hooks (TanStack Query) → services/api.js
  Zustand: library store, UI prefs      localStorage: library v1, recents
        │  HTTP/JSON  (/api/*)
Express API
  routes → validate (zod) → controllers → services
     spotify/: tokenService · spotifyClient (queue, retry, dedupe) · normalizers
     catalog/: discographyService (aggregate, EP inference, edition keys)
     cache/:   LRU+TTL (interface allows Redis later)
     library/, battles/, insights/ (Release 2+) → Supabase (service role)
     middleware: errorHandler · rateLimiter · requestMetrics · auth (JWT)
        │                         │
  Spotify Web API           Supabase Postgres + Auth
```

**Key design rules**
- **Provider interface:** controllers depend on a `catalogProvider` (`searchArtists`, `getArtist`, `getDiscography`, `getAlbum`, `getAlbumTracks`). Implementations: `mockProvider` (Phase 1 fixtures, also the production "demo mode") and `spotifyProvider`. This is what lets Phase 1 ship before Premium and protects the demo if Spotify access breaks.
- **Normalized DTOs:** the client never sees raw Spotify JSON. `Artist {id,name,imageUrl,genres[],spotifyUrl}` · `Release {id,name,group,albumType,inferredType,releaseDate,precision,year,totalTracks,artists[],coverUrl,spotifyUrl,editionKey,isAlternateEdition}` · `Track {id,name,discNumber,trackNumber,durationMs,explicit,artists[],spotifyUrl}`.
- **Library repository pattern (client):** `libraryRepository` interface with `localRepository` (localStorage, versioned schema + migrations) and later `apiRepository`. UI code does not change when accounts arrive.
- **Pure logic in `utils/`**, framework-free and unit-tested: sorting, filtering, duration, EP inference, title normalization, edition similarity, query parser, recommender, graph BFS, aggregations.

### 6.1 Albumly API contract
| Endpoint | Purpose | Release |
|---|---|---|
| `GET /api/health` | Liveness + provider mode | 1 |
| `GET /api/search?q=&type=artist\|album\|track&offset=` | Search (10/page) | 1 |
| `GET /api/artists/:id` | Artist | 1 |
| `GET /api/artists/:id/discography` | Full aggregated discography + completeness report | 1 |
| `GET /api/albums/:id` | Album + all tracks + computed duration | 1 |
| `GET /api/featured` | Curated home sections | 1 |
| `POST /api/auth/*` (Supabase-backed), `GET /api/me` | Accounts | 2 |
| `GET/POST/PATCH/DELETE /api/collections[/:id]` | Collections CRUD | 2 |
| `POST/DELETE /api/collections/:id/albums[/:albumId]`, `PATCH .../order` | Membership + ordering | 2 |
| `PUT/DELETE /api/albums/:id/entry` | Status, rating, review, tags, notes | 2 |
| `POST /api/library/import` | Local → cloud migration | 2 |
| `GET /api/insights`, `GET /api/recommendations` | Computed server-side | 3 |
| `GET/POST /api/battles`, `POST /api/battles/:id/vote`, `GET /api/leaderboard` | Album Battle | 3 |
| `GET /api/public/collections/:slug` | Shared collections | 3 |
| `GET /api/admin/metrics` | Ops dashboard (admin role) | 3 |

### 6.2 Data model (Supabase, Release 2+)
- `profiles` (id → auth.users, username, created_at)
- `albums` (spotify_album_id PK, name, release_date, precision, album_type, total_tracks, cover_url, primary_artist_id, primary_artist_name, snapshot_at) — snapshot cache, not a catalogue mirror
- `artists` (spotify_artist_id PK, name, image_url, genres text[])
- `library_entries` (id, user_id, spotify_album_id, status, rating 1–10, review, notes, created_at, updated_at; unique(user_id, album))
- `tags`, `entry_tags`
- `collections` (id, user_id, name, description, visibility private|public, slug unique)
- `collection_albums` (collection_id, spotify_album_id, position, added_at; PK(collection_id, album)) — the many-to-many
- `battles` (id, album_a, album_b), `battle_votes` (battle_id, user_id, choice; unique(battle_id, user_id))
- `search_events`, `api_metrics` (aggregated, for M10)

RLS: owners read/write their own rows; public collections readable by anyone; votes insert-own only. Schema lives in `database/migrations/*.sql`.

The localStorage v1 schema mirrors `library_entries` / `collections` / `collection_albums` (including the album snapshot) so migration is a straight upload.

### 6.3 Algorithms (deliberate CS content)
| Algorithm | Where |
|---|---|
| Debounce + cancellation | search input |
| LRU cache (Map/doubly-linked list) + TTL | server cache |
| Token-bucket / concurrency queue, exponential backoff | Spotify client |
| Hash-map de-duplication | discography aggregation |
| Title normalization + similarity `S = 0.4N + 0.3A + 0.2D + 0.1T` (N via Levenshtein/Jaro on stripped titles) | edition grouping |
| EP inference: `album_type = single` and 4–6 tracks (or ≤ 30 min when durations known) → "EP · inferred" | classification |
| Stable multi-key sort handling partial dates | explorer |
| Tokenizer/parser | universal search |
| Weighted scoring + cosine similarity on preference vector | recommender |
| BFS with depth limit | artist graph |
| Group-by aggregation | insights |

---

## 7. Design system

Tokens (`client/src/styles/variables.css`): bg `#101010` / `#181818` / card `#202020`; accent `#1DB954`, secondary `#8B5CF6`; text `#FFFFFF` / muted `#A7A7A7`; border `#303030`; radius 12–16 px; font Inter; sidebar 240 px; 4-pt spacing scale. Plain CSS with CSS Modules per component (no Tailwind — CSS fundamentals are a learning goal).

Screens: Home · Search · Artist (grid / timeline / eras) · Album · Library · Collection · Compare · Recommendations · Insights · Auth · Settings · 404/Error.

---

## 8. Phased delivery plan

Each phase ends with a runnable app, a short explanation doc of the concepts used, tests for that phase's logic, and a git commit/tag. Tests are written **inside each phase**, not saved for the end.

### Phase 0 — Environment & scaffolding (½–1 day)
- Verify Node ≥ 20.19 / npm; `git init`; root `.gitignore`, `README.md`, `.env.example`.
- **Move or exclude from OneDrive:** the folder is inside OneDrive; syncing `node_modules` causes file locks and slow installs. Recommended: relocate the project to e.g. `C:\dev\Albumly` (or exclude `node_modules` from sync). Decide before installing.
- Scaffold `client/` (Vite React JS) and `server/` (Express, ESM, nodemon); root `package.json` with `npm run dev` running both (`concurrently`); Vite dev proxy `/api → localhost:5000`.
- ESLint + Prettier; Vitest wired in both packages.
- **Exit:** `npm run dev` serves the Vite page and `GET /api/health` returns OK.

### Phase 1 — UI foundation on mock data (≈ 1 week) — *no Spotify needed*
- Design tokens, global styles, app shell (Sidebar, Navbar, mobile BottomNav), React Router routes for all Release 1 pages.
- Common components: SearchBar (debounce + keyboard nav), ArtistCard, AlbumCard, AlbumGrid, Skeleton, EmptyState, ErrorState, Badge, Tabs.
- Server `mockProvider` with realistic fixtures in the **normalized DTO shape**, served through the real `/api/*` routes; client data layer (`services/api.js` + TanStack Query hooks) already talks to the backend.
- Home, Search, Artist, Album pages working end-to-end on fixtures; all UX states built.
- Tests: `useDebounce`, formatters, component smoke tests.
- **Exit:** full click-through Home → search → artist → album on desktop and mobile, with loading/empty/error states demonstrable.

### Phase 2 — Spotify integration (≈ 1–1.5 weeks) — **requires Premium**
- You: subscribe to Premium, create the Spotify Developer app, put Client ID/Secret in `server/.env` (I never handle the secret values).
- **Feasibility spike first** (`server/scripts/spike.js`): call each of the six endpoints, record real limits, fields present, artist `genres`, search field filters, 429 behaviour → written up in `docs/spotify-feasibility.md`. Any surprise adjusts later phases before they are built.
- `tokenService`, `spotifyClient` (queue, retry, dedupe), LRU+TTL cache, normalizers, `spotifyProvider`; provider chosen by `CATALOG_PROVIDER=spotify|mock`.
- `discographyService`: 4-group paginated aggregation, de-dup, group stamping, completeness report.
- zod validation, error envelope, error-handling middleware, request-metrics middleware (counts kept for M10).
- Tests: token refresh, cache eviction/expiry, retry/429 with mocked HTTP, normalizers against recorded fixtures.
- **Exit:** real artist search, profile and complete discography; a repeated request is a cache hit visible in the server log; a forced 429 is absorbed.

### Phase 3 — Explorer & album details → **Release 1 (MVP)** (≈ 1–1.5 weeks)
- Client-side filter/sort/search-within, grid/list toggle, group-by-year, discography timeline.
- Album page: tracklist by disc, computed duration, featured artists, track search, copy/share.
- EP inference with "inferred" labelling; recent searches / recently explored; curated home sections.
- Responsive + accessibility pass; route-level code splitting; image lazy-loading with fixed aspect ratio.
- Tests: sorter/filter/duration/EP utils; first Playwright flow (search → artist → album).
- **First deployment** (Vercel client + Render/Railway server) so the MVP is live early; tag `v1.0`.
- **Exit:** every P0 requirement in §4 passes its acceptance check on the deployed URL.

### Phase 4 — Local library, comparison, advanced search (≈ 1.5 weeks)
- Zustand library store over `localRepository` (versioned localStorage schema with album snapshots).
- Statuses, collections CRUD, drag-and-drop ordering, ratings, reviews, tags, notes, duplicate detection, library filters, JSON/CSV export + JSON import (zod-validated).
- Edition grouping + completeness report UI (M3-6, M3-7).
- Compare page with deltas + Recharts chart.
- Advanced search tabs, filters and universal query parser.
- Tests: repository + migrations, edition similarity, query parser, compare maths; Playwright: save → refresh → still saved.
- **Exit:** library persists across reloads and round-trips through export/import; tag `v1.5`.

### Phase 5 — Accounts & database → **Release 2** (≈ 1.5–2 weeks)
- Supabase project, migrations, RLS policies; Express auth middleware (verify Supabase JWT), `/api/me`.
- Sign-up / sign-in / sign-out / expired-session UI; account deletion.
- Library/collections/entries endpoints; `apiRepository`; local → cloud import on first sign-in with conflict rule (newest `updated_at` wins); anonymous users keep working locally.
- Privacy policy page.
- Tests: route integration tests (supertest) incl. unauthorized and cross-user access; RLS checks.
- **Exit:** same library on two browsers after sign-in; user A cannot read or modify user B's private data; tag `v2.0`.

### Phase 6 — Intelligence (≈ 2 weeks)
- Preference profile from library (genres, decades, artists, ratings) + discovery quiz.
- Recommender (candidate generation → scoring → explanation), weights adjustable in Settings.
- Era explorer; artist connection graph (React Flow, depth-limited, budget-capped); release calendar.
- Insights dashboard + Music DNA card.
- Tests: scoring, cosine similarity, BFS, aggregations on fixed fixtures.
- **Exit:** recommendations exclude owned albums and each shows a reason; insights numbers match a hand-computed fixture.

### Phase 7 — Community & ops → **Release 3** (≈ 1–1.5 weeks)
- Public collections (slug URLs, visibility toggle); Album Battle + leaderboard; admin metrics dashboard (cache hit ratio, latency, 429s, top searches); basic report/hide moderation.
- **Exit:** a logged-out visitor can open a shared collection; one vote per user per battle enforced at DB level; tag `v3.0`.

### Phase 8 — Hardening, docs, launch (≈ 1 week)
- Full Playwright suite; Lighthouse and bundle budgets; security review (headers, CORS, rate limits, secret scan, dependency audit); SEO/meta/OG tags; error boundary; demo-mode fallback verified.
- Docs: README (overview, features, architecture diagram, ER diagram, setup, env vars, limitations), `docs/api-documentation.md`, `docs/architecture.md`, `docs/technical-challenges.md`; screenshots; demo video script.
- **Exit:** metrics in §3.3 met; production deploy green.

**Estimated total:** ~11–13 weeks at a few focused hours per day. (The original 6–9-week estimate did not account for the API-budget engineering in §2.3 or for building accounts after a local-first library.) The MVP is live at the end of Phase 3, roughly week 4.

### Dependency order
Phase 0 → 1 → **[Premium]** → 2 → 3 (Release 1) → 4 → 5 (Release 2) → 6 → 7 (Release 3) → 8. Phase 6 features that need no accounts (eras, graph, calendar) can be pulled forward if Phase 5 stalls.

---

## 9. Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Premium lapses or Spotify tightens access again → live demo dies | Med / High | Provider interface + demo mode on fixtures; long-TTL cache; demo video; `docs/spotify-feasibility.md` records what was true and when |
| Rate limits from discography aggregation | High / Med | Queue, 24 h cache, in-flight dedupe, progressive loading, never fetch on filter/sort |
| Artist genres unavailable | Med / Med | Spike in Phase 2; rebalance weights; user tags / MusicBrainz tags fallback |
| Free backend hosting sleeps (cold start 30 s+) and loses in-memory cache | High / Med | Health-ping on app load with "waking server" state; cache interface ready for Redis/Upstash |
| Scope creep across 10 modules | High / High | P0–P3 priorities; a phase is not started until the previous exit criteria pass |
| Storing Spotify metadata snapshots vs. policy | Low / Med | Store minimal fields, refresh on view, always link back, delete on account deletion |
| OneDrive syncing `node_modules` | High / Low | Relocate or exclude in Phase 0 |
| localStorage quota / corruption | Low / Med | Versioned schema, zod-validated load, export backup |

---

## 10. Target structure

```
Albumly/
├─ client/src/{components/{layout,common,artists,albums,library},pages,hooks,services,store,utils,styles}/
├─ server/src/{routes,controllers,services/{spotify,catalog,cache,library},providers,middleware,schemas,data,utils}/  server/scripts/
├─ database/migrations/
├─ docs/   e2e/   .env.example   README.md   package.json
```
Folders are created only when the phase that needs them begins.

---

## 11. Verification

- **Per phase:** `npm run lint`, `npm test` (Vitest, client + server), and the phase's exit criteria checked by running the app in the browser preview (desktop + mobile viewport) rather than by tests alone.
- **API:** `GET /api/health`; scripted calls for each route incl. invalid ID (400), unknown ID (404), forced 429 (mocked) and expired token (401 → transparent refresh).
- **Cache:** request the same discography twice and confirm hit in metrics/log and near-zero latency.
- **E2E (Playwright):** search → artist → filter/sort → album → save → refresh → compare → (Release 2) sign-in sync on a second browser context.
- **Quality gates before each release tag:** Lighthouse budgets, bundle size, a11y keyboard walkthrough, secret scan of the repo.

## 12. First steps after approval
1. Decide project location (OneDrive vs `C:\dev\Albumly`).
2. Phase 0 scaffolding and first commit.
3. Phase 1 on mock data while you arrange Spotify Premium for Phase 2.
