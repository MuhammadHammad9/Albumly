# Phase 5: accounts and a real database

Phase 5 adds optional accounts. When you are signed in, your library lives in a Postgres database (Supabase) and you see the same library on every device. When you are not signed in, nothing changes: the library stays in the browser, as in Phase 4.

The full design is in `docs/plans/phase-5-plan.md`. Setup steps are in §10 of that plan.

## Where to look

| Piece | Files |
| --- | --- |
| Database tables and RLS rules | `database/migrations/0001_library.sql`, `0002_rls.sql` |
| Applying migrations | `server/src/db/migrate.js`, `server/scripts/db-migrate.js` |
| Running queries as one user | `server/src/db/database.js` (`asUser`) |
| Checking tokens | `server/src/auth/verifyToken.js`, `server/src/middleware/auth.js` |
| Library API | `server/src/routes/libraryRoutes.js`, `accountRoutes.js`, `server/src/services/library/` |
| Rate limits, security headers | `server/src/middleware/rateLimits.js`, `server/src/app.js` |
| Sign-in in the browser | `client/src/services/auth/authService.js` |
| Switching libraries on sign-in/out | `client/src/services/session.js`, `client/src/services/library/repositorySwitch.js` |
| Syncing with the server | `client/src/services/library/apiRepository.js`, `sync.js` |
| Screens | `client/src/pages/Account.jsx`, `Privacy.jsx`, `client/src/components/account/` |
| Check against the real project | `server/scripts/live-check.js` |

## Ideas worth understanding

**JWT (JSON Web Token).**
- When you sign in, Supabase gives the browser an *access token*. It has three parts separated by dots: a header, a payload, and a signature.
  - The payload says who you are (`sub` = your user id), who issued the token (`iss`), who it is for (`aud = authenticated`), and when it expires (`exp`, after 1 hour).
  - Anyone can read the payload. Nobody can change it, because the signature would no longer match.
- Supabase signs with a **private** key and publishes the matching **public** keys (the JWKS).
- Our server checks the signature with the public keys (`jose` library), so it needs no secret and makes no call to Supabase per request.
- It also checks the issuer, the audience and the expiry. An expired token gets `401 session_expired`; anything else wrong gets `401 unauthorized`.

**Sessions and refresh tokens.**
- An access token lives 1 hour. Next to it, Supabase gives a long-lived *refresh token*, which can be swapped for a new access token.
- The auth library does that automatically before the hour is up.
- Both tokens are kept in localStorage under `albumly:auth`. The trade-off: a malicious script running in the page could read them. React escapes everything it renders, which is the main protection.
- If refreshing fails (the session was revoked, or the account was deleted), the session has *expired*. The app keeps your library on screen, queues your changes on the device, and asks you to sign in again.

**Row Level Security (RLS).**
- RLS rules are written in the database itself, for example `using ((select auth.uid()) = user_id)`.
- Postgres then adds that condition to every query on the table, like an automatic `WHERE`.
- Why it is needed:
  - The Supabase *publishable* key is public. Anyone could call Supabase's own Data API with their token.
  - With RLS they can still only ever touch their own rows.
  - CHECK constraints (rating 1–10, tag rules, lengths) stop them storing junk that skipped our validation.
- Our own server also runs every request as the `authenticated` role with your user id (`db.asUser`), so the same rules protect us from our own bugs.
- The queries still say `where user_id = $1` as well: two locks on the same door.

**Migrations.**
- A migration is a numbered SQL file that changes the database, applied once and in order.
- The `schema_migrations` table remembers which ones already ran, so `npm run db:migrate` can be run any time.
- You never edit an old migration. To change the schema later you add `0003_…sql`.

**The repository pattern, and the switch.**
- The library store only knows three methods: `load`, `save`, `subscribe`.
- Phase 4 gave it a browser repository; Phase 5 adds an account repository with the same methods.
- The store is built on a *switch* that forwards to whichever repository is active.
- Signing in swaps in the account one and signing out swaps the browser one back. No component had to change.

**Cache first, then sync.**
- The store expects `load`/`save` to answer instantly, but the network is slow and sometimes gone. So the account repository keeps two copies on the device:
  - `synced`: what the server is known to have
  - `current`: what you see
- The difference between them is a list of small *operations* ("save album X", "add Y to collection Z").
- Operations are sent one by one. Each success is applied to `synced`, so closing the tab mid-way loses nothing.
- After a network failure it retries with growing waits (2 s, 5 s, 15 s, 60 s).
- When you come back to the tab, it fetches the account copy. That is how a change made on your phone shows up on your laptop.

**Idempotent requests.**
- An operation is *idempotent* if sending it twice has the same effect as sending it once. Examples:
  - "Save album X with these details"
  - "Create collection 123", where an id that already exists is a no-op
  - "Delete Y", where something already gone is fine
- Retries and two open tabs therefore cannot do damage.

**Merging: the newest change wins.**
- Every album and collection carries `updatedAt`. When two copies disagree, the one with the later time wins.
- This is used when your browser library is moved into the account on first sign-in, and for every later change.
- A collection with a new id but an existing name is merged into the existing one.
- Limits of the rule:
  - It trusts device clocks. The server pulls back times more than 5 minutes in the future, so a wrong clock cannot win forever.
  - An album deleted on one device can come back if another device had an unsynced edit to it.

**Rate limiting and security headers.**
- The API counts requests per IP address:
  - 300 per 5 minutes overall
  - 10 library imports per hour
  - 5 account deletions per hour
- Over the limit, the answer is `429 rate_limited` with how long to wait.
- `helmet` adds standard protective HTTP headers. Request bodies are size-limited, and invalid JSON is a `400`, not a crash.

**Why the tests use PGlite.**
- PGlite is real Postgres compiled to WebAssembly, running inside the test process. No Docker or server is needed.
- A small test-only file (`database/test/supabase-shim.sql`) recreates the Supabase pieces our SQL uses: `auth.users`, `auth.uid()`, and the roles.
- So the tests run the **same migrations and RLS rules** as the real project, including "user A cannot read user B's rows".

**Accounts are optional.**
- With no Supabase settings, the server answers account routes with `503 accounts_unavailable`, and the client shows "Accounts aren't set up on this server".
- Everything else works as before.
