# Phase 7 plan: community and ops (Release 3)

Scope: PRD M6-6 (public collections), M7-2 (Album Battle), M10-1 (ops dashboard), M10-2 (basic moderation), §6.1 endpoints, §6.2 tables.
Exit: a logged-out visitor can open a shared collection; one vote per user per battle is enforced by the database.

Ground rules for this phase:
- **No new Spotify calls.** Nothing in Phase 7 calls the catalogue provider. Shared collections and battles render from the album **snapshots** already stored in `library_entries.album`. The admin dashboard only reads counters that already exist (`provider.stats()`).
- **No new packages.** Everything needed is already installed: `express-rate-limit`, `zod`, `recharts`, `lucide-react`, `@electric-sql/pglite`.
- Built on Phase 5 as read from the code on 2026-11-10: `db.asUser(userId, fn)`, `db.transaction(fn)`, `requireAuth(verify)` (gives `req.user = { id, email }`), `applyMigrations`, `createTestDatabase()`/`resetTestDatabase()`, `createTestKeys()`, migrations `0001_library.sql` and `0002_rls.sql`.
- I only create new files. Every change to an existing file is listed in §9 for the coordinator.

---

## 1. Key decisions (please confirm or adjust)

| # | Decision | Choice | Why / alternative |
| --- | --- | --- | --- |
| D1 | How the admin role is granted | A table **`public.app_admins (user_id)`** plus a function **`public.is_admin()`**. You grant it once in the Supabase SQL editor: `insert into public.app_admins (user_id) select id from auth.users where email = '<your email>';` No person is hard-coded anywhere. | The alternative is a JWT claim (`app_metadata.role = 'admin'`). Phase 5's verifier returns only `{ id, email }` and its HS256 fallback has no claims, so it would need a Phase 5 edit. A claim also stays valid until the token expires (up to 1 h) after you revoke it. A table takes effect instantly, and RLS policies can call `is_admin()`. Cost: one tiny query per admin request. |
| D2 | Where share settings live | A new table **`collection_shares`** (one row per shared collection: `slug`, `visibility`, `include_reviews`, moderation fields), linked to `collections` with `on delete cascade`. | The PRD puts `visibility`/`slug` on `collections`. A separate table leaves Phase 5's table, RLS and repository untouched, and a share row only exists for collections that were ever shared. |
| D3 | How logged-out visitors read a shared collection | A **`security definer` function `public.get_public_collection(slug)`** that returns a fixed, safe JSON shape. Express calls it as the `anon` role. No RLS policy opens `library_entries` to the public. | RLS works per **row**, not per column. A "public read" policy on `library_entries` would also expose `notes`, tags and private ratings through Supabase's Data API with the public key. The function whitelists fields. RLS still does the work on all new tables (battles, votes, reports). The concepts doc explains both approaches. |
| D4 | Slug format | `<name-part>-<8 random chars>`, e.g. `late-night-drives-k3x9q2mw`. Lowercase ASCII, made once on first publish, **kept** when the collection is renamed. Unique index in the database. | Readable and stable (old links keep working), and not guessable from the name alone. Making a collection private makes its link answer 404; publishing again restores the same link. |
| D5 | Reviews in shared collections | Off by default. The owner can tick **"Show my ratings and reviews"**. `notes` are **never** shared. A moderator can hide one review without hiding the collection. | Reviews are the only free text the public sees besides names and descriptions, so they are what moderation has to cover (M10-2). |
| D6 | Who creates battles | A signed-in user picks **two albums from their own library** (or "random pair from my library"). The snapshots are copied from their `library_entries`, re-checked by a strict schema, and stored in the battle. Pairs are stored in a fixed order (`album_a_id < album_b_id`) with a **unique** pair, so the same match-up exists once; creating it again returns the existing battle. | No Spotify calls. Trade-off: a snapshot is client-made data, so a user could fake an album name. Strict URL checks, length limits and report/hide moderation cover this. Alternative: check each album against the catalogue at creation time (cache first, one `/albums/:id` call when uncached). Not chosen because of the "no new Spotify calls" rule. |
| D7 | Votes | One row per `(battle_id, user_id)`, enforced by the **primary key**. A vote is final (no update policy). A second vote gets **409 `already_voted`**. Who voted for what is private: users can read only their own votes; everyone sees totals. | Matches the PRD ("votes insert-own only"). Allowing a changed vote would mean an update policy; easy to add later. |
| D8 | Who can see battle results and the leaderboard | **Anyone**, logged out too (totals only). Voting and creating need an account. On the Vote tab, a battle's result is shown only after you vote, so earlier votes do not sway you. | Shareable community content. |
| D9 | Leaderboard ranking | Albums ranked by the **Wilson score lower bound** of their battle win rate (95 %), minimum 5 votes. | Plain win rate puts an album with 1 vote out of 1 (100 %) above one with 90 out of 100. Wilson asks "how high is the win rate at least, given how little data we have?". Deliberate CS content (PRD §6.3). |
| D10 | Request metrics storage | **In memory** in the API process, reset on restart. Counters plus a 60-minute per-minute timeline. Not saved to the database in Phase 7. | One server, free tier, no extra writes per request. The PRD's `api_metrics`/`search_events` tables are deferred (Phase 8 can add an hourly snapshot if wanted). |
| D11 | Top searches and privacy | Only the **normalised query text** and a count are kept: no IP, user, time or filters. Queries that look like personal data (contain `@`, a URL, or 5+ digits in a row) are dropped. Memory is bounded (at most 200 tracked queries, the Space-Saving algorithm). The dashboard shows a query only once it was searched **at least 3 times** (a simple k-anonymity threshold), so one person's unusual search is never shown. | M10-1 asks for top searches; this is the least data that answers the question. |
| D12 | When accounts are not configured | All Phase 7 API routes answer **503 `accounts_unavailable`**, like Phase 5's routes. The request-metrics middleware still runs (no database needed), but the dashboard needs an admin, so it is unavailable too. | Consistent with Phase 5's local-only mode. |

---

## 2. Packages

None. (`express-rate-limit 8.7.1`, `zod 4.6.7`, `recharts 3.10.1`, `lucide-react`, `@electric-sql/pglite 0.5.12` are already in the manifests.)

---

## 3. Data model: `database/migrations/0003_community.sql` and `0004_community_rls.sql`

Same split as Phase 5 (tables first, then grants and policies). If Phase 6 also needs `0003`, the coordinator assigns numbers; my files only depend on 0001/0002.

```
app_admins          user_id uuid PK → auth.users ON DELETE CASCADE, granted_at timestamptz default now(), note text ≤ 200

collection_shares   id uuid PK default gen_random_uuid(),
                    user_id uuid default auth.uid(), collection_id text,
                    FOREIGN KEY (user_id, collection_id) → collections ON DELETE CASCADE, UNIQUE (user_id, collection_id),
                    slug text UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
                    visibility text default 'private' CHECK (visibility IN ('private','public')),
                    include_reviews boolean default false,
                    hidden_at timestamptz null, hidden_by uuid null → auth.users ON DELETE SET NULL, hidden_reason text ≤ 200,
                    created_at, updated_at timestamptz default now()

review_hides        user_id uuid, album_id text, PK (user_id, album_id),
                    FOREIGN KEY (user_id, album_id) → library_entries ON DELETE CASCADE,
                    hidden_by uuid → auth.users ON DELETE SET NULL, reason text ≤ 200, hidden_at timestamptz default now()

battles             id uuid PK default gen_random_uuid(),
                    album_a_id text, album_b_id text (same id pattern as 0001), CHECK (album_a_id < album_b_id),
                    UNIQUE (album_a_id, album_b_id),
                    album_a jsonb, album_b jsonb  CHECK (object, ->>'id' matches, pg_column_size ≤ 20000),
                    created_by uuid default auth.uid() → auth.users ON DELETE SET NULL,
                    created_at timestamptz default now(),
                    hidden_at timestamptz null, hidden_by uuid null, hidden_reason text ≤ 200

battle_votes        battle_id uuid → battles ON DELETE CASCADE,
                    user_id uuid default auth.uid() → auth.users ON DELETE CASCADE,
                    choice text CHECK (choice IN ('a','b')), created_at timestamptz default now(),
                    PRIMARY KEY (battle_id, user_id)          ← the "one vote per user per battle" rule

reports             id uuid PK default gen_random_uuid(),
                    reporter_id uuid default auth.uid() → auth.users ON DELETE CASCADE,
                    target_type text CHECK (IN ('collection','review','battle')),
                    share_id uuid null → collection_shares ON DELETE CASCADE,
                    album_id text null,                        (reviews: share + album)
                    battle_id uuid null → battles ON DELETE CASCADE,
                    CHECK (the right columns are set for each target_type),
                    reason text CHECK (IN ('spam','offensive','personal_info','copyright','other')),
                    details text default '' ≤ 500,
                    created_at, resolved_at null, resolved_by uuid null, resolution text null CHECK (IN ('hidden','dismissed')),
                    UNIQUE (reporter_id, target_type, share_id, album_id, battle_id) NULLS NOT DISTINCT  ← one report per person per thing
```

Indexes: `battle_votes (battle_id, choice)` for tallies; `reports (resolved_at) where resolved_at is null` for the open queue; `battles (created_at desc) where hidden_at is null`.

### Functions (all `set search_path = ''`, fully qualified names)

| Function | Kind | Granted to | Returns |
| --- | --- | --- | --- |
| `is_admin()` | `security definer`, stable | authenticated | `exists (select 1 from app_admins where user_id = auth.uid())` |
| `get_public_collection(p_slug text)` | `security definer`, stable | anon, authenticated | `null` unless the share is public and not hidden. Otherwise `{ slug, name, description, updatedAt, includeReviews, albums: [{ position, album: <whitelisted snapshot fields>, rating?, review? }] }`. Rating/review only when `include_reviews` and the review is not in `review_hides`. Never `user_id`, `notes`, tags or the status. |
| `battle_tallies(p_ids uuid[])` | `security definer`, stable | anon, authenticated | `(battle_id, votes_a, votes_b)` for visible battles only |
| `album_leaderboard(p_min_votes int, p_limit int)` | `security definer`, stable | anon, authenticated | per album over visible battles: `album_id, album (latest snapshot), wins, votes`. Ranking (Wilson) is done in JavaScript so it is unit-tested. |

### RLS (0004)

- RLS on for all five new tables; `revoke all … from anon, authenticated`, then grant only what is listed.
- `app_admins`: no grants at all (only `is_admin()` reads it).
- `collection_shares`: owner select/insert/update/delete (`user_id = auth.uid()`). The owner can **not** change `hidden_*` (column-level `grant update (visibility, include_reviews, updated_at)`). Admins: select + update all (`is_admin()`).
- `review_hides`: admins only (select/insert/delete).
- `battles`: select for anon + authenticated where `hidden_at is null`, column grants exclude `created_by` (who made a battle is not public). Insert for authenticated with check `created_by = auth.uid() and hidden_at is null`. No user update/delete. Admins: select all + update `hidden_*`.
- `battle_votes`: authenticated select own; insert own with check `user_id = auth.uid()` **and the battle is visible**. No update/delete. No anon access.
- `reports`: authenticated insert own, select own (so the UI can show "Reported"). Admins select all + update `resolved_*`.

The Express server talks to the database the Phase 5 way: `db.asUser(userId, fn)` for signed-in requests, and a new helper `asVisitor(db, fn)` (in my service folder, built on `db.transaction`) that runs `set local role anon` for logged-out requests. So RLS also applies to our own server's queries.

---

## 4. Server

### Files

```
server/src/middleware/requestMetrics.js          createRequestMetrics({ now }) → { middleware, snapshot() }
server/src/services/metrics/topSearches.js       normaliseQuery(q) → string | null (privacy filters); createTopSearches({ capacity: 200 }) Space-Saving counter
server/src/services/metrics/latency.js           fixed histogram buckets → { count, avgMs, p50Ms, p95Ms, maxMs }
server/src/services/metrics/timeline.js          ring buffer of 60 one-minute buckets { t, requests, errors, rateLimited }
server/src/services/metrics/dashboard.js         buildMetricsReport({ metrics, providerStats, minSearchCount: 3 }) → the /api/admin/metrics body
server/src/services/community/slug.js            makeSlug(name, random) and slugSchema
server/src/services/community/publicAlbum.js     zod schema that whitelists snapshot fields; coverUrl only https:// or /api/mock/art/…, spotifyUrl only https://open.spotify.com/…
server/src/services/community/ranking.js         wilsonLowerBound(wins, total), rankLeaderboard(rows, { minVotes })
server/src/services/community/schemas.js         zod for share settings, battle create, vote, report, admin resolve
server/src/services/community/dbAccess.js        asVisitor(db, fn), isAdmin(tx), toCommunityError(pgError) (23505 → 409, 23503 → 404, 42501 → 404/403)
server/src/services/community/shareRepository.js getShare, saveShare (slug retry on collision), getPublicCollection
server/src/services/community/battleRepository.js listBattles, createBattle, vote, getLeaderboard
server/src/services/community/reportRepository.js createReport, listReports, resolveReport, unhide
server/src/services/community/rateLimits.js      createCommunityLimits(settings|false): battleCreate 20/h, vote 120/h, report 20/h per IP, same 429 envelope as Phase 5
server/src/routes/communityRoutes.js             createCommunityRoutes({ verify, db, rateLimits })
server/src/routes/adminRoutes.js                 createAdminRoutes({ verify, db, metrics, getProvider })
+ tests next to each (*.test.js)
```

`communityRoutes.js` contains a small `optionalAuth(verify)`: no `Authorization` header → visitor; a header → same checks as `requireAuth` (a bad token is still a 401, never silently "logged out").

### Endpoints

| Method + path | Auth | Body / query | Result |
| --- | --- | --- | --- |
| `GET /api/public/collections/:slug` | none | slug checked by zod | `200 { collection, albums }` or **404** (missing, private and hidden all look the same). Headers: `Cache-Control: public, max-age=30`, `X-Robots-Tag: noindex`. |
| `GET /api/collections/:id/share` | required | — | `{ share: { slug, visibility, includeReviews, hidden, hiddenReason } \| null }` |
| `PUT /api/collections/:id/share` | required | `{ visibility, includeReviews }` | Creates the share (and slug) on first use, else updates. 404 if the collection is not yours or not synced yet. |
| `GET /api/battles` | optional | `?view=vote\|recent&limit=20&before=<iso>` | `{ battles: [{ id, albumA, albumB, createdAt, votesA, votesB, myVote }] }`. `view=vote` (signed in) = battles you have not voted on, fewest votes first. |
| `POST /api/battles` | required + limit | `{ albumIds: [a, b] }` | Both must be in your library (else 400 `not_saved`), different (400). `201` new, `200` existing pair, 404 if that pair was hidden. |
| `POST /api/battles/:id/vote` | required + limit | `{ choice: 'a' \| 'b' }` | `201 { battle with totals, myVote }`. Second vote → **409 `already_voted`**. Hidden or unknown battle → 404. |
| `GET /api/leaderboard` | none | `?limit=50` | `{ albums: [{ rank, album, wins, votes, winRate, score }], minVotes }` |
| `POST /api/reports` | required + limit | `{ targetType, slug?, albumId?, battleId?, reason, details? }` | `201`; same person reporting the same thing again → `200` (idempotent). Target not public → 404. |
| `GET /api/admin/status` | required | — | `{ admin: true \| false }` (lets the client show or hide the dashboard) |
| `GET /api/admin/metrics` | admin | — | see below |
| `GET /api/admin/reports` | admin | `?status=open\|resolved` | reports with a short preview of the target (name, review excerpt, album names) |
| `POST /api/admin/reports/:id/resolve` | admin | `{ action: 'hide' \| 'dismiss', reason? }` | `hide` hides the target and resolves every open report about it |
| `DELETE /api/admin/hides/:type/:key` | admin | — | un-hide (restore) a collection, review or battle |

Non-admins get **403 `forbidden`** on `/api/admin/*` (the dashboard's existence is not a secret, unlike someone's collection).

### Request metrics

- `requestMetrics.middleware` is mounted **right after `helmet()`** (before CORS and the rate limiter), so rejected and rate-limited requests are counted. It records on `res.on('finish')`.
- Per request: total, status class (2xx/3xx/4xx/5xx), **429s**, **5xx errors**, latency (histogram → p50/p95), the **route pattern** (`req.baseUrl + req.route.path`, e.g. `/api/artists/:id`, never the real id; unmatched → `(other)`), and the per-minute timeline.
- `GET /api/search` with status 200 also feeds `topSearches` with `normaliseQuery(req.query.q)`: NFKC, lowercase, trimmed, inner spaces collapsed, max 60 characters; dropped when it contains `@`, `://`/`www.`, or 5+ digits in a row.
- `/api/admin/metrics` body:

```
{ since, uptimeSeconds, provider: 'mock' | 'spotify',
  requests: { total, byStatus: { '2xx', '3xx', '4xx', '5xx' }, rateLimited, errors, latency: { avgMs, p50Ms, p95Ms, maxMs }, topRoutes: [{ route, count, errors }] },
  timeline: [{ t, requests, errors, rateLimited }],                 // last 60 minutes
  spotify: { requests, retries, rateLimited, failures, shortCircuited, averageLatencyMs, blocked: { endpoint: secondsLeft } } | null,
  cache: { hits, misses, shared, size, hitRate } | null,           // null in demo (mock) mode
  topSearches: [{ query, count }], searchesTracked }
```

Spotify latency is the **average** that `spotifyClient.stats()` already keeps; a p95 would need a Phase 2 change, which I am not making.

---

## 5. Client

### Files

```
client/src/utils/safeUrl.js                 safeImageUrl / safeExternalUrl: only https:// (or /api/mock/art/… for images); rejects "//host", "javascript:", "data:"
client/src/utils/battles.js                 percentages, "who is ahead" text, keyboard choice mapping (pure)
client/src/utils/metrics.js                 formatters for the dashboard (ratio → %, ms, uptime), timeline → chart rows (pure)
client/src/utils/communityApi.js            createCommunityApi(request): one function per endpoint above (pure wrapper, tested with a fake request)
client/src/hooks/useCommunity.js            TanStack Query hooks: useShare, useSaveShare, useBattles, useVote, useCreateBattle, useLeaderboard, useReport (Part B)
client/src/hooks/useAdmin.js                useAdminStatus, useAdminMetrics (refetch every 15 s, our API only), useReports, useResolveReport (Part B)
client/src/pages/PublicCollection.jsx       /shared/:slug, works logged out; uses the existing apiGet
client/src/pages/Battles.jsx                /battles with tabs Vote · Recent · Leaderboard, plus "Create a battle"
client/src/pages/Admin.jsx                  /admin; signed out or not admin → plain explanation, no data
client/src/components/community/            SharePanel, ShareLink (copy button), PublicAlbumList, ReportButton (dialog with reasons),
                                            BattleCard, BattleResult (bar + numbers), Leaderboard, CreateBattle, community.module.css
client/src/components/admin/                MetricTiles, RequestsChart (Recharts area chart), RouteTable, SpotifyPanel,
                                            TopSearches, ReportsQueue, admin.module.css
+ tests next to each (*.test.js / *.test.jsx)
```

### Behaviour

- **Shared collection page** (`/shared/:slug`): title, description, album count, "Shared from Albumly". Each album shows its snapshot cover (existing `Artwork`), title, artists, year, a Spotify link (compliance) and a link to the album page. With reviews on: rating and review text, each with a **Report** button. The page also has "Report this collection". Everything is rendered as React text (no `dangerouslySetInnerHTML`), and every URL goes through `safeUrl.js`, a second check after the server's. States: loading skeleton, 404 "This collection isn't shared, or the link is wrong", offline/503. `<meta name="robots" content="noindex">` via the page title hook pattern.
- **SharePanel** (mounted on the collection page): a switch "Public link", "Show my ratings and reviews", the link with a Copy button, and a notice if moderators hid it. Signed out → "Sign in to share this collection". Accounts not set up → renders nothing. Collection not synced yet (404) → "Still syncing; try again in a moment".
- **Battles**: one battle at a time, two covers side by side, buttons "Pick A"/"Pick B" (also the ← and → keys). After voting, the result bar animates (respects `prefers-reduced-motion`) and "Next battle" appears. Recent tab: list with results. Leaderboard tab: table (rank, album, wins/votes, win rate). Create: pick two albums from your library (searchable select) or "Random pair". Signed out: results and leaderboard are visible, voting buttons say "Sign in to vote".
- **Admin dashboard**: tiles (requests, error rate, 429s, p95 latency, cache hit ratio, Spotify average latency), a requests-per-minute chart, top routes, blocked Spotify endpoints with time left, top searches (with the "shown after 3 searches" note), and the reports queue with Hide / Dismiss / Restore. Not in the navigation; reached at `/admin` (an optional nav link for admins is listed in §9).
- All controls keyboard-usable with visible focus, labelled, errors in `role="alert"`, live region for vote results.

---

## 6. Moderation flow

1. Anyone signed in reports a public collection, a review in it, or a battle (reason + optional details). One report per person per thing.
2. Admin opens `/admin` → reports queue (grouped by target, newest first, with a preview).
3. **Hide**: sets `hidden_at` on the share or battle, or adds a `review_hides` row; resolves all open reports about it. Effects: a hidden collection's link answers 404; a hidden review disappears from the public page; a hidden battle leaves the lists and the leaderboard, and votes on it are refused. The owner's private data is never changed or deleted.
4. **Dismiss**: resolves the report, nothing hidden. **Restore** undoes a hide.
5. The owner's SharePanel shows "Hidden by moderators: <reason>". The owner cannot un-hide (column grants), only an admin can.

---

## 7. Testing

### Part A (no database)

| Area | File |
| --- | --- |
| Query normalising and privacy filters; Space-Saving keeps the true heavy hitters within capacity; threshold hides rare queries | `services/metrics/topSearches.test.js` |
| Histogram percentiles; timeline rolls over minutes with a fake clock | `services/metrics/latency.test.js`, `timeline.test.js` |
| Middleware through a real Express app on port 0: counts, route patterns not ids, 429/5xx, search tracking only on 200 | `middleware/requestMetrics.test.js` |
| Report builder with fake provider stats (Spotify mode and mock mode) | `services/metrics/dashboard.test.js` |
| Slugs (accents, emoji, empty names, max length), snapshot whitelist and URL rules, Wilson ranking | `services/community/*.test.js` |
| Client pure utils | `utils/safeUrl.test.js`, `battles.test.js`, `metrics.test.js`, `communityApi.test.js` |
| Presentational components with fixture props: BattleCard (keys, disabled when signed out), BattleResult, Leaderboard, PublicAlbumList (bad URLs not rendered as links), ReportButton dialog, admin tiles/tables | `components/**/**.test.jsx` |
| PublicCollection page with mocked `fetch`: renders snapshots, 404 state, no Spotify request | `pages/PublicCollection.test.jsx` |

### Part B (PGlite, after Phase 5 lands)

| Area | File |
| --- | --- |
| 0003/0004 apply after 0001/0002; re-run is a no-op | `services/community/migrations.test.js` |
| **One vote per user per battle at DB level**: a second raw `insert` as the same user fails with a unique violation (23505), even bypassing our routes | `services/community/battles.rls.test.js` |
| RLS: votes of others unreadable; vote with another `user_id` rejected; vote on hidden battle rejected; `created_by` not selectable; `anon` cannot read `collection_shares`, `reports`, `battle_votes`, `app_admins`; owner cannot change `hidden_at`; non-admin cannot read others' reports; `is_admin()` true only for a granted user | `services/community/*.rls.test.js` |
| `get_public_collection`: public → data; private, hidden or unknown → null; never contains notes/tags/user id; reviews only when enabled and not hidden; deleting the collection removes the share | `services/community/shareRepository.test.js` |
| Routes (own Express app with the community/admin routers, PGlite, local test keys): **logged-out GET of a shared collection works**; owner flow; battle create/idempotent pair/not_saved; vote 201 then 409; leaderboard order; reports idempotent; admin 403 for normal users; hide/dismiss/restore end to end; rate-limit envelope with a tiny limit | `routes/communityRoutes.test.js`, `routes/adminRoutes.test.js` |
| Client hooks with a fake request; SharePanel, Battles and Admin pages wired | `hooks/*.test.js`, `pages/*.test.jsx` |

Before each report: root `npm test`, `npm run lint` (0 warnings), `npm run build`. No dev servers, no browser, no live Spotify or Supabase.

---

## 8. Part A / Part B split

**Part A (now, no Phase 5 code needed):**
- All of `services/metrics/*` and `middleware/requestMetrics.js`, with tests.
- `services/community/slug.js`, `publicAlbum.js`, `ranking.js`, `schemas.js`, `rateLimits.js`, with tests.
- Client: `utils/safeUrl.js`, `battles.js`, `metrics.js`, `communityApi.js`; all presentational components in `components/community/` and `components/admin/` (props in, callbacks out); `pages/PublicCollection.jsx` (only needs `apiGet`, which exists).
- `docs/phase-7-concepts.md` (first version).

**Part B (after the coordinator says Phase 5 has landed):**
- Migrations `0003_community.sql`, `0004_community_rls.sql`.
- `dbAccess.js`, the three repositories, `communityRoutes.js`, `adminRoutes.js`, and all PGlite/route tests.
- `hooks/useCommunity.js`, `hooks/useAdmin.js` (need Phase 5's authenticated `apiRequest` and session store), `SharePanel` wiring, `pages/Battles.jsx`, `pages/Admin.jsx`.
- Concepts doc final pass, root test/lint/build, report.

---

## 9. Edits to existing (HUB / Phase 5) files, for the coordinator

**`server/src/app.js`**
```js
import { createRequestMetrics } from './middleware/requestMetrics.js'
import { createAdminRoutes } from './routes/adminRoutes.js'
import { createCommunityRoutes } from './routes/communityRoutes.js'

// add to ACCOUNT_PATHS:
'/api/public/{*rest}', '/api/battles', '/api/battles/{*rest}', '/api/leaderboard', '/api/reports', '/api/admin/{*rest}'

export function createApp({ accounts = null, rateLimits, trustProxy, metrics = createRequestMetrics() } = {}) {
  ...
  app.use(helmet())
  app.use(metrics.middleware)            // NEW: right after helmet, before cors and limits.general
  ...
  if (accounts) {
    app.use('/api', createAccountRoutes(accounts, limits))
    app.use('/api', createLibraryRoutes(accounts, limits))
    app.use('/api', createCommunityRoutes({ ...accounts, rateLimits: rateLimits === false ? false : undefined }))   // NEW
    app.use('/api', createAdminRoutes({ ...accounts, metrics, getProvider }))                                       // NEW
  }
```
`server/src/server.js`: no change (the default `metrics` is created inside `createApp`).

**`client/src/router.jsx`** (children of the error-boundary route, before `*`):
```js
{ path: 'shared/:slug', lazy: page(() => import('./pages/PublicCollection.jsx')) },
{ path: 'battles', lazy: page(() => import('./pages/Battles.jsx')) },
{ path: 'admin', lazy: page(() => import('./pages/Admin.jsx')) },
```

**`client/src/components/layout/navItems.js`**: add `{ to: '/battles', label: 'Battles', icon: Swords }` (import `Swords` from lucide-react). Optional: an "Admin" link shown only when `useAdminStatus()` is true (Sidebar.jsx), otherwise `/admin` is reached by URL.

**`client/src/pages/Collection.jsx`** (Phase 4/5 file): under the title/description block, `<SharePanel collectionId={collection.id} collectionName={collection.name} />` from `../components/community/SharePanel.jsx`.

**Optional, `client/src/pages/Compare.jsx`**: `<StartBattleButton albumIds={[a.id, b.id]} />` when two saved albums are compared.

**Phase 5's `client/src/pages/Privacy.jsx`** text: add "If you share a collection, its name, description, album list (and, only if you turn it on, your ratings and reviews) are visible to anyone with the link. Battle votes are stored with your account; only totals are shown. Reports you make are seen by moderators." Deleting the account removes shares, votes and reports (database cascades); battles you created stay but are no longer linked to you.

**`README.md`** (optional): "Making yourself an admin" with the one SQL line from D1.

No `package.json`, lockfile, `.env*`, `vite.config.js` or `.claude/launch.json` change.

---

## 10. Risks and notes

- **Migration number clash with Phase 6.** Names are unique either way; the coordinator may renumber my two files before they are first applied anywhere.
- **Phase 5 snapshot URL check accepts `//host/...`** (protocol-relative) because `client/src/services/library/schema.js` allows any value starting with `/`. Phase 7 does not rely on it (strict whitelist on server and client), but Phase 5 may want to tighten it.
- **Account deletion order.** Phase 5's `DELETE /api/me` removes its own tables, then the auth user; my rows go with the auth user through cascades. If the Admin API call fails, votes/reports stay until the retry. Optional hub edit: call `deleteCommunityData(tx, userId)` (I can provide it) inside Phase 5's delete transaction.
- **PGlite column-level grants and `security definer`.** Expected to work (PGlite is real Postgres 17); checked first thing in Part B. Fallback: table-level grants plus a view-free design, reported to you.
- **Fake accounts** can vote more than once. Email confirmation (Phase 5) is the mitigation; anything stronger is out of scope.
- **Metrics reset on restart and are per process.** Fine for one server; documented.

---

## 11. Implementation notes (where the build differs from the plan above)

- **Moderation writes go through `security definer` functions** (`admin_set_hidden`, `admin_resolve_report`, `admin_list_reports`, `admin_share_id`). Each one checks `is_admin()` itself. There are no admin RLS policies on the tables, so a bug in our routes still cannot let a normal user moderate. Owners have no `delete` right on `collection_shares`, so they cannot swap a hidden share for a fresh link.
- **`review_hides` points at `auth.users`, not at `library_entries`.** Removing and re-adding an album therefore does not undo a hide.
- **Reports use `reportable_share(slug, albumId)`** to find the share id. It only accepts reviews that are actually shown on the public page.
- **Vote tab order is newest first** (not "fewest votes first"). Other people's votes are invisible under RLS, so sorting by totals would need one function call per battle. That can be added later.
- **Extra endpoint:** `GET /api/battles/:battleId` (sign-in optional).
- **Client.** `hooks/useCommunity.js` sends signed-in calls through `session.request` and public ones through `apiRequest`. Pages and components take an optional `api` prop so tests can pass a fake. The optional `StartBattleButton` is for the Compare page.
