# Phase 5 plan: accounts and database (Release 2)

Scope: PRD Phase 5 and M6-5, plus the §5 security items for our own API. Phases 6–8 are out of scope.
Everything must build and pass its tests **without a live Supabase project**. A separate "connect" step (§11) runs once the keys exist.
Live Spotify is never called, and nothing is sent to the dev servers on ports 5000 or 5173.

Phase 4 interfaces this plan builds on, as read from the code on 2026-11-10:
- `createLibraryStore(repository)` calls `repository.load()` **synchronously** once.
- It calls `repository.save(library)` (synchronous, returns `true`/`false`) after every data change.
- It calls `repository.subscribe(listener)` once and treats whatever arrives there as an "external" change, which it does not save back.
- It also has `setLibrary(library)`, and `transfer.js` has `mergeLibrary` and `describeSummary`.
- Phase 4 is still being finished. If these change, §5 adapts; the rest of the design does not depend on the details.

---

## 1. Key decisions (please confirm or adjust)

| # | Decision | Choice | Why / alternative |
| --- | --- | --- | --- |
| D1 | Where sign-up and sign-in run | The **browser talks to Supabase Auth directly** for auth only, using `@supabase/auth-js` and the public publishable key. All **data** goes React → Express → Postgres. | Supabase Auth is built to be called from browsers with the public key. Its client handles refresh-token rotation, multi-tab sign-out and email-confirmation links. Proxying it through Express (the PRD's `POST /api/auth/*`) means re-implementing all of that, plus cross-site refresh cookies once client and API are on different hosts. The PRD rule "React never talks to Supabase directly" still holds for **data**. |
| D2 | How Express checks who is calling | Verify the Supabase **access token (JWT) locally with the project's public JWKS** (`jose`), checking issuer and `aud=authenticated`. Fallback for projects still on the legacy HS256 secret: ask Supabase Auth (`GET /auth/v1/user`). | Local verification is fast (no network call per request) and needs no secret on our server. Keys are fetched once and cached. `getUser` on every request adds about 100 ms and depends on Supabase being up. The legacy JWT secret is being retired by Supabase and is a shared secret, so it is not used. Trade-off: a token from a session that was signed out elsewhere stays valid until it expires (at most 1 h). That is acceptable here. |
| D3 | How Express reaches the database | A **direct Postgres connection** (`pg`, `DATABASE_URL`). Each request runs in a transaction that switches to the `authenticated` role with that user's id, so **RLS applies to our own server's queries too**. | This is how Supabase's own Data API works. A forgotten `where user_id = …` cannot leak data. It allows real transactions (import, reorder), and the **same SQL runs in tests on PGlite**. The alternative, supabase-js with the service-role key, bypasses RLS, has no transactions and cannot be tested offline. The secret key is still needed, only for deleting the auth user. |
| D4 | Album snapshot and tags in the database | `library_entries.album jsonb` (the Phase 4 snapshot as-is) and `tags text[]`, both guarded by CHECK constraints. | This makes the import a straight upload. A **shared** `albums` table written from user input would let one user change what another user sees. The PRD's shared `albums`/`artists` cache tables and the `tags`/`entry_tags` tables are deferred to Phase 6, where the server fills them from the catalogue. |
| D5 | First sign-in with a non-empty local library | A **prompt**: "You have 12 albums and 2 collections saved on this device. Add them to your account?" with **[Add to account]** and **[Not now]**. After a successful import the anonymous local copy is **cleared** ("move"), so two diverging copies never exist. | On a shared computer, someone else's local library is not silently merged into your account. "Not now" is remembered per user on this device, and the Account page keeps an "Import from this device" button. Alternative: keep the local copy after import. |
| D6 | Sign-out | Switch back to the anonymous local library and **delete this user's cached copy** from the device. If changes are still waiting to sync, ask first. | Privacy on shared machines. |
| D7 | Password reset | **Included** as a small addition: "Forgot password?", then an email link, then a "Set new password" form. | Without it, a forgotten password locks the user out forever. It is about 60 lines. Can be dropped. |
| D8 | Privacy page contact | Needs your input: which contact to show (an email address, or "open an issue on the GitHub repo"). | — |

---

## 2. Packages (exact versions, all at least 14 days old on 2026-11-10)

| Where | Package | Version | Published | Why |
| --- | --- | --- | --- | --- |
| server | `jose` | `6.2.13` | 20 Oct 2026 | JWT + JWKS verification. No dependencies. |
| server | `pg` | `8.23.1` | 30 Sep 2026 | Postgres driver (pool, transactions). |
| server | `helmet` | `8.3.0` | 12 Jul 2026 | Security headers (PRD §5). |
| server | `express-rate-limit` | `8.7.1` | 6 Oct 2026 | Per-IP rate limits (PRD §5). |
| server | `zod` | `4.6.7` | 12 Oct 2026 | Request validation. Same version as the client. |
| server (dev) | `@electric-sql/pglite` | `0.5.12` | 26 Oct 2026 | Real Postgres compiled to WASM, in-process. Runs the migrations and RLS in tests. About 25 MB, no Docker. |
| client | `@supabase/auth-js` | `2.118.0` | 15 Oct 2026 | Sign-up/in/out, session storage and refresh. This is only the auth part of supabase-js (no realtime/storage/postgrest), so the bundle stays small. It is **lazy-loaded**, so the first page load does not grow. |

All installed with `--save-exact`. No supertest: the existing tests already use `fetch` against `createApp().listen(0)`, and Phase 5 tests follow that pattern.

**PGlite check (first step of Stage 2, a 20-line throwaway script in the scratchpad).** I could not confirm from the docs that PGlite supports `CREATE ROLE`, `SET LOCAL ROLE` and RLS policies. It is real Postgres running as a superuser, so it should.
- If it works: as planned.
- If not: route and repository tests keep running on PGlite as the owner (no RLS), RLS is tested only in the live check (§11), and I report this to you.
- `pg-mem` is not an option: it has no RLS.

---

## 3. Data model and migrations

Files:
- `database/migrations/0001_library.sql`: the tables.
- `database/migrations/0002_rls.sql`: grants and policies.
- Test-only: `database/test/supabase-shim.sql`. It recreates the few Supabase pieces the migrations rely on: schema `auth`, `auth.users(id uuid pk, email text)`, `auth.uid()` (same definition as Supabase: reads `sub` from the `request.jwt.claims` setting), and roles `anon`, `authenticated`, `service_role`. It is **never** applied to the real project.

The migration runner is `server/src/db/migrate.js`. It applies files in name order, each in its own transaction, and records them in `public.schema_migrations`, which has RLS on, no policies, and grants revoked from `anon`/`authenticated`. The same runner is used by tests (PGlite) and by `npm run db:migrate` (real project).

### Tables (mapping to the Phase 4 local schema)

```
profiles          id uuid PK → auth.users(id) ON DELETE CASCADE, username text null unique, created_at timestamptz default now()
library_entries   user_id uuid default auth.uid() → auth.users ON DELETE CASCADE,
                  album_id text   CHECK (album_id ~ '^[A-Za-z0-9_-]{1,100}$'),
                  album jsonb     CHECK (jsonb_typeof(album)='object' AND album->>'id' = album_id),
                  status text null CHECK (status IN ('favourite','want','listening','listened')),
                  rating smallint null CHECK (rating BETWEEN 1 AND 10),
                  review text default '' CHECK (char_length(review) <= 5000),
                  notes  text default '' CHECK (char_length(notes)  <= 5000),
                  tags text[] default '{}' CHECK (cardinality(tags) <= 20 AND tags_valid(tags)),  -- lowercase, ≤30 chars, no repeats
                  added_at, updated_at timestamptz not null,
                  PRIMARY KEY (user_id, album_id)
collections       user_id uuid default auth.uid() → auth.users ON DELETE CASCADE,
                  id text CHECK (char_length(id) BETWEEN 1 AND 100),
                  name text CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
                  description text default '' CHECK (char_length(description) <= 500),
                  created_at, updated_at timestamptz not null,
                  PRIMARY KEY (user_id, id), UNIQUE INDEX (user_id, lower(name))
collection_albums user_id uuid default auth.uid(), collection_id text, album_id text, position int not null, added_at timestamptz default now(),
                  PRIMARY KEY (user_id, collection_id, album_id),
                  FOREIGN KEY (user_id, collection_id) → collections ON DELETE CASCADE,
                  FOREIGN KEY (user_id, album_id)      → library_entries ON DELETE CASCADE
```

| Local (Phase 4) | Database |
| --- | --- |
| `entries[albumId]` | one `library_entries` row; `album` = the snapshot, `addedAt`/`updatedAt` → `added_at`/`updated_at` |
| `collections[i]` | one `collections` row (the client-made id is kept, so **no id remapping**) |
| `collection.albumIds[k]` | one `collection_albums` row with `position = k` |

- **Composite keys with `user_id`.**
  - Ids only need to be unique per user, so one user can never block another user's id.
  - The two foreign keys guarantee, at the database level, that a collection only holds albums that **the same user** has saved. This is the same rule as Phase 4.
  - Removing an entry removes it from every collection, through the cascade.
- **No `updated_at` trigger.** The client's `updatedAt` is the conflict clock ("newest wins").
  - The server clamps timestamps more than 5 minutes in the future to `now()`, so a device with a wrong clock cannot "win" forever.
- **Timestamps** always leave the server as `Date.toISOString()` (`…Z`). The client's zod `z.iso.datetime()` rejects `+00:00`, and the "newest wins" string comparison needs one format.
- **Deferred to later phases:** `albums`, `artists`, `tags`, `entry_tags` (Phase 6), `visibility`/`slug` on collections, `battles`/`battle_votes` (Phase 7), and `search_events`/`api_metrics` (Phase 7–8).

### RLS (0002)

- `alter table … enable row level security` on all four tables.
- `revoke all … from anon`, then `grant select, insert, update, delete … to authenticated`. Supabase grants new public tables to `anon` by default; this undoes that.
- One policy per action per table: `using ((select auth.uid()) = user_id)` and the same `with check` for insert and update. On `profiles` the column is `id`.
- Why this matters even though our client never uses Supabase's Data API: the publishable key is public. Anyone signed in could call PostgREST with their own token. RLS limits them to their own rows, and the CHECK constraints stop them storing junk that skipped our zod validation.
- `auth.uid()` is wrapped in `(select …)`, Supabase's recommended form: it is evaluated once per query instead of once per row.

---

## 4. Server

### New and changed files

```
server/src/config/accounts.js           read + check env; returns null when accounts are not configured (names in messages, never values)
server/src/auth/verifyToken.js          createTokenVerifier({ issuer, jwks, fallbackGetUser }) → verify(token) → { id, email }
server/src/auth/supabaseAdmin.js        createAuthAdmin({ url, secretKey, fetch }) → deleteUser(id); getUser(token) for the HS256 fallback
server/src/db/database.js               createPgDatabase(config) / createPgliteDatabase(pglite) → { asUser(userId, fn), close() }
server/src/db/migrate.js                applyMigrations(db, dir)
server/src/middleware/auth.js           requireAuth(verifier): Bearer token → req.user, or 401
server/src/middleware/rateLimits.js     createRateLimits(options): general + strict limiters, envelope-shaped 429
server/src/middleware/validate.js       parse(schema, value) → data, or ApiError 400 with the first issue's path + message
server/src/schemas/library.js           zod: album snapshot, entry, collection, import body, ids (mirrors client schema.js limits)
server/src/services/library/libraryRepository.js   SQL for every operation, all inside asUser(...)
server/src/services/library/merge.js    server copy of mergeLibrary rules (newest updatedAt wins; same-name collections merge)
server/src/routes/accountRoutes.js      /api/me
server/src/routes/libraryRoutes.js      /api/library, /api/albums/:id/entry, /api/collections…
server/scripts/db-migrate.js            npm run db:migrate   (real project)
server/scripts/live-check.js            npm run live-check   (real project smoke + RLS test, §11)
modify: src/app.js (createApp(deps), helmet, rate limits, body limits, mount routes), src/server.js (build deps from env),
        src/middleware/errorHandler.js (map body-parser 400/413 to the envelope instead of 500), .env.example, package.json
```

### `createApp(deps = {})`

- Existing tests call `createApp()` with no arguments. In that case accounts are "not configured", the new routes answer **503 `accounts_unavailable`**, and every existing test keeps passing.
- `server.js` builds the real deps from env. If any Supabase variable is missing, it logs `Accounts disabled: SUPABASE_URL is not set` (names only) and starts anyway.
- `/api/health` gains `accounts: true|false`.

### Middleware order

1. `helmet()`. `crossOriginResourcePolicy` is set to `cross-origin` on `/api/mock/art`, so mock covers still load when client and API are on different hosts in production.
2. CORS: the allow-list now accepts a comma-separated `CLIENT_ORIGIN`.
3. General per-IP limit on `/api`: **300 requests per 5 minutes**.
4. Stricter limits:
   - `POST /api/library/import`: **10 per hour**.
   - `DELETE /api/me`: **5 per hour**.
   - Over the limit returns `429 { error: { code: 'rate_limited', message, retryAfter } }`.
   - `TRUST_PROXY` env sets Express's `trust proxy` for hosting later.
   - Tests pass `rateLimits: false`, except one test that uses a tiny limit.
5. Body limits: `express.json({ limit: '5mb' })` on the import route only, `100kb` everywhere else. Too large returns 413 `payload_too_large`. Broken JSON returns 400 `bad_request`; today it becomes a 500.
6. `requireAuth` on every account and library route:
   - No or malformed `Authorization: Bearer` header → **401 `unauthorized`**.
   - An expired token → **401 `session_expired`**.
   - Bad signature, wrong issuer, wrong audience or `alg: none` → **401 `unauthorized`**.

### `asUser(userId, fn)`

Runs this sequence in a single transaction:
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<id>","role":"authenticated"}', true);
-- fn(tx) runs here; every query is filtered by RLS
commit;
```
Queries also say `where user_id = $1` explicitly. That is belt and braces: RLS is the safety net, not the only check. The pool is small (max 5) for Supabase's free tier. Connections use TLS: with `DATABASE_SSL_CA` the certificate is verified; in production a CA is required.

### Endpoints (all need sign-in; bodies validated with zod)

| Method + path | Body | Result |
| --- | --- | --- |
| `GET /api/me` | — | `{ user: { id, email }, profile: { createdAt }, counts: { albums, collections } }`. Creates the profile row the first time (upsert). |
| `DELETE /api/me` | — | Deletes all the user's rows in one transaction, then deletes the auth user through the Admin API (cascade as a second safety net). Returns 204. Safe to retry. If the Admin call fails, returns 502 `account_delete_failed`; the data is already gone, and retrying finishes the job. |
| `GET /api/library` | — | The whole library in the **exact Phase 4 shape** `{ version: 1, entries: {…}, collections: [{ id, name, description, albumIds, createdAt, updatedAt }] }` |
| `POST /api/library/import` | `{ library }` (Phase 4 shape, `librarySchema` rules) | Merge in one transaction (§6). Returns `{ library, summary }`. |
| `PUT /api/albums/:id/entry` | full entry (`album, status, rating, review, notes, tags, addedAt, updatedAt`) | Upsert, applied only `where existing.updated_at <= incoming.updated_at` (so a snapshot refresh with the same time applies). Returns `{ entry, applied }`. |
| `DELETE /api/albums/:id/entry` | — | 204, even if it was not there. Cascades out of collections. |
| `GET /api/collections` / `GET /api/collections/:id` | — | List / one, with `albumIds` |
| `POST /api/collections` | `{ id, name, description?, createdAt, updatedAt }` | 201. Same id again = no-op (safe to retry). Duplicate name → 409 `duplicate_name`. |
| `PATCH /api/collections/:id` | `{ name?, description?, updatedAt }` | Newest wins. 404 if it is not yours. |
| `DELETE /api/collections/:id` | — | 204, safe to retry |
| `POST /api/collections/:id/albums` | `{ albumId }` | Appends. The album must be saved first (400 `not_saved`). Already there = no-op. |
| `DELETE /api/collections/:id/albums/:albumId` | — | 204 |
| `PATCH /api/collections/:id/order` | `{ albumIds, updatedAt }` | Must be exactly the current set, reordered (400 otherwise). Positions are rewritten in one transaction. |

- **Someone else's collection or entry always looks like "not found" (404), never "forbidden" (403).** A 403 would confirm that the id exists.
- Album ids: `^[A-Za-z0-9_-]{1,100}$`. This accepts Spotify's 22-character base62 ids and the mock catalogue's slugs.
- Collection ids: 1–100 characters from the same set. Phase 4 uses `crypto.randomUUID()`, with a `c-…` fallback.

---

## 5. Client: auth, repositories and the store switch

### Files

```
client/.env.example                          VITE_SUPABASE_URL=, VITE_SUPABASE_PUBLISHABLE_KEY=
src/services/auth/config.js                  reads the two VITE_ vars; accountsEnabled = both present
src/services/auth/authService.js             lazy import('@supabase/auth-js'); signUp, signIn, signOut, resetPassword, updatePassword,
                                             getAccessToken, refresh, onChange; peekStoredUserId() (sync, reads the saved session)
src/services/api.js                          + apiRequest(method, path, { body, auth }) – adds the Bearer token, one refresh-and-retry on 401
src/services/library/sync.js                 pure: diffLibraries(synced, current) → ordered operations; applyOperation(library, op)
src/services/library/apiRepository.js        createApiRepository({ userId, request, storage, target }) – same load/save/subscribe + start/stop/flush/pull
src/services/library/repositorySwitch.js     createRepositorySwitch(initial) – { load, save, subscribe, use(repository) }
src/services/session.js                      wires auth events → repository switch, import offer, expired state
src/stores/sessionStore.js                   zustand: { status, user, sync, importOffer }
src/pages/Account.jsx, src/pages/Privacy.jsx
src/components/account/AuthForm.jsx, ResetPassword.jsx, DeleteAccount.jsx, AccountButton.jsx, SessionBanner.jsx, ImportPrompt.jsx, account.module.css
modify: stores/libraryStore.js (last line only), router.jsx (routes account, privacy), main.jsx (start session),
        components/layout/Navbar.jsx (AccountButton), AppShell.jsx (SessionBanner + ImportPrompt, Privacy link in footer),
        pages/Library.jsx (only a "Loading your library…" state during the very first cloud load on a new browser)
```

### Where tokens live

- auth-js keeps the session (a 1-hour access token plus a refresh token) in localStorage under `albumly:auth`, and refreshes it before it expires.
- Flow type is `implicit`, so an email confirmation link also works when opened on another device. auth-js reads and removes the tokens from the URL.
- Tokens are never logged or put in query strings. Only `apiRequest` reads them.
- Trade-off, explained in the concepts doc: a script injected into the page (XSS) could read localStorage. React's escaping and having no `dangerouslySetInnerHTML` are the defence. Moving the refresh token into an httpOnly cookie needs same-site hosting, which is a Phase 8 consideration.

### The switch (no store or component change)

```js
// stores/libraryStore.js, last line becomes:
export const librarySource = createRepositorySwitch(startingRepository())   // local, or the cached account copy if a session is stored
export const libraryStore = createLibraryStore(librarySource)
```

- `use(repository)` unsubscribes from the old repository and subscribes to the new one.
- It then hands `repository.load()` to the store's listener. The store already treats that as an external change: it is shown, not saved back.
- Sign-in calls `use(apiRepo)`. Sign-out calls `use(localRepo)`.
- `peekStoredUserId()` lets a returning signed-in user start on their cached account copy straight away, instead of seeing the anonymous library flash first. This depends on auth-js's saved-session format; if it cannot be read, the app starts local and switches as soon as auth loads.

### `apiRepository`: cache-first with a sync queue

The store's interface is synchronous, but the network is not. So the repository keeps a per-user copy on the device and syncs it in the background.

- **Storage.** `albumly:cloud:<userId>` holds `{ synced, current }`.
  - `synced` is the last state the server confirmed. `current` is what the user sees.
  - Both are validated and salvaged with the Phase 4 schema on load.
- **`load()`** returns `current`. It is instant and works offline.
- **`save(library)`** writes `current` and schedules a flush (150 ms debounce). It returns `true`, or `false` if storage is full.
- **Flush.**
  - Computes `ops = diffLibraries(synced, current)` and sends the operations one at a time, in this order:
    1. entry upserts
    2. new collections
    3. collection edits
    4. membership adds
    5. order changes
    6. membership removes
    7. collection deletes
    8. entry deletes
  - After each success, the operation is applied to `synced`. This means a crash or a closed tab resumes where it left off.
  - **Every operation is idempotent** (safe to send twice), so two tabs, or a retry after a timeout, cannot do harm.
  - **Bulk path:** more than 50 upserts (for example after a file import) go as one `POST /api/library/import`, followed by any deletes.
- **Pull.** `GET /api/library` runs on start, when the tab becomes visible again (at most every 30 s) and when the browser comes back online.
  - It is applied only when nothing is waiting to be sent; otherwise it flushes first.
  - The result becomes `synced = current = server` and is handed to the store as an external change.
  - This is what makes **"same library on two browsers"** work.
- **Other tabs** in the same browser pick up the new copy through the `storage` event, as in Phase 4.
- **Failures:**
  - Network error or 5xx: retry with backoff (2 s, 5 s, 15 s, then every 60 s). Sync status shows "offline".
  - 429: wait the `retryAfter` time.
  - 401: `apiRequest` refreshes once and retries. If that still fails, the status becomes `expired`.
  - Other 4xx (the server rejected a change, for example a duplicate name created on another device): pull the server state (server wins) and show "Some changes could not be saved".

### Sign-in, sign-out and expired session

Sign-in flow:
1. `SIGNED_IN` arrives.
2. If this is a different user from the one whose cache is on the device, the other user's cache is cleared.
3. `use(createApiRepository(user))` and `start()`.
4. If the anonymous library is non-empty and "Not now" was not chosen for this user, `sessionStore.importOffer` is set and the prompt is shown.

Sign-out:
- If operations are still pending, the user is asked to confirm.
- Then `signOut()`, the user's cache is deleted, and the store switches to `use(localRepo)`.

Expired session (a `SIGNED_OUT` we did not start, or a final 401):
- `status = 'expired'`.
- The account copy stays on screen and stays editable. Changes queue up on the device.
- `SessionBanner` says "Your session has ended. Sign in again to keep syncing; your changes are kept on this device", with a "Sign in" link to `/account?reason=expired`.
- Signing back in as the same user resumes the queue.

Accounts not configured (no client env vars):
- No account button, and `/account` explains that accounts are not set up.
- Everything else works locally, exactly as in Phase 4.

### UI

**`/account`, signed out.** Tabs for Sign in and Create account.
- Email field.
- Password field, at least 8 characters, with a show/hide toggle.
- After sign-up, a "Check your email" state.
- Supabase errors are mapped to plain messages: wrong email or password, email not confirmed, too many attempts, password too short.
- A "Forgot password?" link (D7).

**`/account`, signed in.**
- The email address, sync status, and "Import N albums from this device" when relevant.
- Sign out.
- **Delete account**, a danger zone:
  - The user types their email to confirm.
  - On success: local sign-out, the cache is cleared, and the message "Your account and all its data were deleted".

**Navbar.** `AccountButton` shows an icon when signed out and the user's initial when signed in, with the label "Account".

**`/privacy` page** (linked from the footer and the sign-up form). It covers:
- what is stored (email; the password is held by Supabase as a hash; library data)
- where it is stored (Supabase project region; this device's localStorage for the anonymous library, recents and the session)
- no tracking or ads
- Spotify metadata is shown via Spotify and never linked to a Spotify account
- how to delete everything (Delete account; clearing site data removes the device copy)
- contact (D8)

All forms have labelled inputs, errors announced with `role="alert"`, and visible focus.

---

## 6. First-sign-in import and conflicts

1. The prompt (D5) sends `POST /api/library/import { library: <anonymous local library> }`.
2. The server, in one transaction:
   - Locks the user's profile row (`select … for update`), so two devices importing at the same moment run one after the other.
   - Loads the account library.
   - Runs `merge.js`, which follows the same rules as Phase 4 `mergeLibrary`:
     - **Entries:** matched by album id. The **strictly newer `updatedAt` wins**; on a tie the account copy stays.
     - **Collections with the same id:** the newer one wins, including its album order. A clashing name gets a " (2)"-style suffix.
     - **A new id with an existing name** (case-insensitive): its albums are appended to the existing collection, keeping the existing order.
     - Importing twice changes nothing the second time.
   - Writes only the rows that changed, using bulk `insert … select from jsonb_to_recordset($1)`.
   - Returns the merged library and a summary.
3. The client resets `synced = current = response.library`, shows the summary using Phase 4's `describeSummary`, and clears the anonymous local copy.
4. If the import fails, nothing is cleared and the prompt offers "Try again".

Later conflicts between devices use the same clock: `PUT entry` and `PATCH collection` only overwrite when the incoming `updatedAt` is not older. Known limits, documented:
- Device clocks decide "newest".
- A device with an unsynced edit to an album that another device removed will bring the album back when it syncs.
- No tombstones. That is acceptable at this scale.

---

## 7. Account deletion

- `DELETE /api/me`, as described in §4. The client sends it only after the typed confirmation.
- Afterwards the client clears `albumly:cloud:<id>`, `albumly:auth` and the "Not now" markers.
- The anonymous local library (if any) is untouched, and the success message says how to clear it.
- The live check (§11) proves deletion end to end on the real project: rows gone, auth user gone.

---

## 8. Testing strategy

### Runs offline in `npm test` (fakes + PGlite)

**Server:**

| Area | File |
| --- | --- |
| Token verifier: valid ES256 token from a locally generated key pair + local JWKS; expired → `session_expired`; wrong issuer/audience; bad signature; `alg: none`; missing `sub`; HS256 → fallback called | `auth/verifyToken.test.js` |
| Migrations apply cleanly on PGlite (shim + 0001 + 0002), re-run is a no-op | `db/migrate.test.js` |
| **RLS checks on PGlite**: as user A cannot select/update/delete B's rows; insert with B's `user_id` rejected; `anon` gets permission denied; constraints reject rating 11, 21 tags, uppercase tag, mismatched `album.id`, a collection holding another user's album; deleting the auth user cascades everything | `db/rls.test.js` |
| Repository SQL + merge rules (same cases as Phase 4 `mergeLibrary` tests) | `services/library/*.test.js` |
| **Route integration** (`createApp({ accounts: { verifier: real verifier with local JWKS, db: PGlite, authAdmin: fake } }).listen(0)` + `fetch`): every route → 401 without a token and with an expired one; full CRUD; import merge; validation 400s; **cross-user**: B gets 404 on A's collection/entry for GET/PATCH/DELETE/order/membership and A's data is unchanged; `DELETE /api/me` removes everything and calls the admin fake; 413 body limit; 429 envelope with a tiny limit; helmet headers present; 503 when accounts are not configured | `routes/libraryRoutes.test.js`, `routes/accountRoutes.test.js` |
| Existing `app.test.js` unchanged and passing | — |

**Client:**

| Area | File |
| --- | --- |
| `diffLibraries` ordering and `applyOperation` | `services/library/sync.test.js` |
| `apiRepository` with a fake `request`: cache load; save → queued ops; resume after failure; bulk path; pull only when queue empty; 401 → expired; other 4xx → server wins; per-user keys; two-tab storage event | `services/library/apiRepository.test.js` |
| Repository switch: store shows the new source, saves go only to the active one, local library untouched while signed in | `services/library/repositorySwitch.test.js` |
| Session orchestration with a fake auth client: sign-in switch, import offer rules, sign-out clears cache, expiry keeps data | `services/session.test.js` |
| Components: AuthForm validation + error mapping; DeleteAccount typed confirm; SessionBanner; ImportPrompt summary; Account page "not configured"; Privacy renders | `*.test.jsx` |

Finish with root `npm test`, `npm run lint` (0 warnings) and `npm run build`. Then check that the initial JS chunk has not grown by auth-js (it should be in its own lazy chunk).

### Needs the real project (§11)

- The real JWKS, real tokens and the real Admin API.
- RLS through Supabase's own Data API with the public key.
- That `set local role authenticated` works for the `postgres` user over the pooler.

### Browser check

- I will **not** use ports 5000/5173.
- Optional: a second dev instance with `CATALOG_PROVIDER=mock` on other ports (API 5055, Vite 5175) for a click-through of the account UI once keys exist. Before that, the UI is covered by component tests.

---

## 9. Environment variables

### `server/.env` (git-ignored; server only)

| Name | Value comes from | Secret? |
| --- | --- | --- |
| `SUPABASE_URL` | Project URL, e.g. `https://abcd1234.supabase.co` | no |
| `SUPABASE_PUBLISHABLE_KEY` | API Keys → publishable key (`sb_publishable_…`), or legacy `anon` | no (public); used by the live check and the HS256 fallback |
| `SUPABASE_SECRET_KEY` | API Keys → secret key (`sb_secret_…`), or legacy `service_role` | **yes** |
| `DATABASE_URL` | Connect → **Session pooler** URI, with your DB password filled in | **yes** |
| `DATABASE_SSL_CA` | path to the downloaded CA cert, `certs/supabase-ca.crt` (relative to `server/`) | no |
| `TRUST_PROXY` | leave empty locally (for hosting later) | no |

### `client/.env.local` (git-ignored by `.env.*`; ends up in the browser bundle, so public values only)

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | same Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same publishable (or legacy anon) key |

I update `server/.env.example`, create `client/.env.example` (names only), and add `server/certs/` to `.gitignore`. I never read, print or commit the values. Scripts report only "set" or "missing" per name.

---

## 10. Creating the Supabase project (your steps)

1. Go to **supabase.com** and sign in (GitHub is easiest). Click **New project**.
   - Organization: your personal one, plan **Free**.
   - Name: `albumly`.
   - **Database password:** click *Generate*, then save it in your password manager. You need it in step 4 and it is shown only once.
   - Region: the closest one to you (e.g. *South Asia (Mumbai)* or *Southeast Asia (Singapore)*).
   - Leave the Data API enabled.
   - Click **Create**, then wait 1–2 minutes.
2. **Project URL and keys:** *Project Settings → API Keys*.
   - Copy the **publishable** key (`sb_publishable_…`).
   - Create or reveal a **secret** key (`sb_secret_…`).
   - If the page only shows legacy `anon` / `service_role` keys, use those instead.
   - The Project URL is under *Project Settings → Data API* (or in the **Connect** dialog).
3. **JWT signing keys:** *Project Settings → JWT Keys*.
   - If the current key is **ECC (P-256)**, nothing to do.
   - If it says **Legacy HS256 (Shared Secret)**, click **Migrate JWT secret**, then **Rotate keys** (recommended). Or tell me and the server will use its slower fallback.
4. **Database connection string:** the **Connect** button at the top, then **Connection string → Session pooler**. Copy the URI and replace `[YOUR-PASSWORD]` with the password from step 1. Do not use "Direct connection": on the free plan it is IPv6-only.
5. **SSL certificate:** *Project Settings → Database → SSL Configuration → Download certificate*. Save it as `server/certs/supabase-ca.crt`.
6. **Email sign-in:** *Authentication → Sign In / Providers → Email*.
   - Keep it enabled and keep **Confirm email** on.
   - Set the minimum password length to **8**.
   - Note: Supabase's built-in email sender only allows a few emails per hour. If you hit that limit while testing, you can turn "Confirm email" off temporarily.
7. **Redirects:** *Authentication → URL Configuration*.
   - Site URL: `http://localhost:5173`.
   - Redirect URLs: add `http://localhost:5173/account`.
   - Production URLs get added at deployment.
8. Put the values into `server/.env` and `client/.env.local` (§9) and save. Don't paste them into the chat. Just tell me "keys are in".
9. Note: free projects pause after about a week of no use. Click **Restore** in the dashboard if that happens.

---

## 11. Connecting to the real project (I run this after step 10)

1. `npm run db:migrate --prefix server`
   - Checks that each variable is set (prints names only).
   - Connects over TLS and applies `0001` and `0002` (not the shim).
   - Lists the tables with RLS on and their policy counts.
2. `npm run live-check --prefix server`. It uses only throwaway data, cleans up in `finally`, and never prints a secret.
   1. Creates two throwaway users `albumly-check-<random>@example.com` through the Admin API (pre-confirmed, so no email is sent). Passwords are random and kept in memory only.
   2. Signs both in through Supabase Auth, giving real ES256 tokens, and checks they verify against the JWKS.
   3. Starts our Express app **in-process on a random port** (not the dev server, mock catalogue) and runs:
      - 401 without a token
      - `/api/me` for both users
      - A saves an album and creates a collection
      - B's `GET /api/library` does not contain them
      - B's PATCH/DELETE on A's collection → 404, and A's data is unchanged
      - an import merge
   4. **RLS through Supabase's own Data API:** B's token plus the publishable key, querying `library_entries` directly, returns only B's rows. Inserting a row for A is rejected. The publishable key with no token sees nothing.
   5. `DELETE /api/me` for both. Then checks that no rows remain and that the users no longer exist in Auth.
3. You (or I, in the preview on the alternate ports) do the manual exit check: sign in on two browsers and see the same library; edit in one, focus the other, and the change shows up.

---

## 12. Docs

- `docs/phase-5-concepts.md`, in plain language:
  - JWT (what is inside, signatures, why verifying with public keys works, expiry)
  - sessions and refresh tokens
  - RLS (policies as automatic `WHERE` clauses, why the public key makes it necessary)
  - migrations
  - the repository pattern and the switch
  - cache-first sync, the operation queue and idempotency
  - "newest wins" merging and its limits
  - rate limiting and security headers
  - why tests run on PGlite
- `server/.env.example` and `client/.env.example`.
- A short "Accounts setup" section in `README.md` pointing to §10. Only if you want README touched.

## 13. Order of work (Stage 2)

1. PGlite capability spike (scratchpad).
2. Install packages.
3. SQL migrations, shim, runner, and RLS tests.
4. Token verifier and auth middleware.
5. Repository, merge, routes, and app wiring (helmet, rate limits, error mapping); integration tests.
6. Client `sync.js`, `apiRepository`, switch, `authService`, session.
7. Account, privacy and banner UI; component tests.
8. Scripts (`db:migrate`, `live-check`).
9. Docs.
10. Root `npm test`, `npm run lint` and `npm run build`; bundle check; report.

## 14. Risks

- **PGlite lacks role/RLS support.** Fallback in §2.
- **auth-js saved-session format changes.** `peekStoredUserId` falls back to starting local, which costs only a brief flash.
- **Supabase's `postgres` user cannot `set role authenticated` through the pooler.** Very unlikely; it is Supabase's documented way to test RLS. Fallback: the server queries as `postgres` with explicit `where user_id` filters, and RLS keeps protecting the public Data API. The live check detects this.
- **Phase 4 store interface changes before Stage 2.** I re-read the store first and adapt the switch.
- **Free-tier email limits** slow down manual sign-up testing. See §10 step 6.
