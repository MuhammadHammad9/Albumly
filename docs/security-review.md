# Security and hardening review

_Phase 8 Part A draft, 2026-11-10. Covers Phases 1–4, the discography explorer, and the Phase 5 server code that exists today. Part B repeats the scans and reviews the accounts, intelligence and community routes once they land._

## How to re-run the checks

| Check | Command | Result today |
| --- | --- | --- |
| Secret scan (tracked + untracked, not ignored files) | `npm run check:secrets` | **0 findings** in 328 files; `server/.env`, `client/.env`, `client/.env.local` are git-ignored and none is tracked |
| Dependency audit (root, client, server) | `npm run check:audit` | **0 vulnerabilities** at any severity in all three packages |
| Bundle budget | `npm run build && npm run check:bundle` | Initial JS **157.5 KB gzip** (budget 200 KB); Recharts and auth-js are lazy |
| Browser checks incl. headers, error envelope, axe | `npm run test:e2e` | All passing (see the Part A report) |

The secret scan prints only `file:line` and the rule name, never the matched text. Its rules cover:
- private keys
- Supabase secret keys
- JWTs
- database URLs with a password
- AWS, GitHub, Google and Stripe live keys
- 32-hex "secret" assignments (the Spotify client secret format)
- filled-in secret variables in `.env*` files
- tracked or un-ignored `.env` files

## What is already in place

| Area | Status | Where |
| --- | --- | --- |
| Secrets | Spotify and Supabase secrets live only in `server/.env` (git-ignored). The browser bundle only gets public `VITE_` values. Scripts print variable *names*, never values | `.gitignore`, `server/scripts/scriptEnv.js` |
| Security headers (API) | helmet defaults on every response: CSP `default-src 'self'`, `nosniff`, `X-Frame-Options: SAMEORIGIN`, HSTS, `Referrer-Policy: no-referrer`, no `X-Powered-By` | `server/src/app.js`; checked by `e2e/tests/api-headers.spec.js` |
| Security headers (client) | Prepared in `client/vercel.json`: CSP (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), `nosniff`, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` | `client/vercel.json` |
| CORS | Allow-list from `CLIENT_ORIGIN` (comma-separated). No credentials mode: auth uses a Bearer header, not cookies | `server/src/app.js` |
| Rate limiting | Per IP: 300 requests / 5 min on `/api`; import 10/h; delete account 5/h; envelope-shaped 429 with `Retry-After`. `TRUST_PROXY` makes `req.ip` the real visitor behind a host's proxy | `server/src/middleware/rateLimits.js` |
| Body limits | 100 KB JSON everywhere, 5 MB on library import. Too large → 413, broken JSON → 400 (never a 500) | `app.js`, `errorHandler.js` |
| Input validation | Search params range-checked. Spotify ids checked before any outbound call. Account bodies validated by zod with the same limits as the client | `catalogRoutes.js`, `spotifyProvider.js`, `server/src/schemas/` |
| Error leakage | One envelope for every error. 500s say only "Something went wrong"; details go to the server log | `errorHandler.js` |
| Outbound abuse | Spotify calls go through one queue (4 at once), are de-duplicated and cached, and long blocks are respected without contacting Spotify | `spotifyClient.js` |
| XSS | No `dangerouslySetInnerHTML`, `innerHTML` or `eval` anywhere in `client/src` or `server/src`. React escapes all text. Imported links must start with `http`, which blocks `javascript:` URLs | `client/src/services/library/schema.js` |
| CSV injection | Exported cells starting with `= + - @` are prefixed with `'` | `transfer.js` |
| External links | Every `target="_blank"` link has `rel="noreferrer"` (checked by e2e for the album tracklist) | components, `album.spec.js` |
| Mock art route | The file name is only hashed into colours; no file system access, so no path traversal | `server/src/routes/mockArtRoutes.js` |
| Account data isolation | RLS plus explicit `user_id` filters; someone else's row is a 404, never a 403 | Phase 5 (`database/migrations`, `libraryRoutes.js`) |

## Findings

Severity: **High** = fix before launch, **Medium** = fix before launch if possible, **Low** = should fix, **Info** = noted or accepted.

| # | Severity | Finding | Evidence | Fix (who applies it) |
| --- | --- | --- | --- | --- |
| 1 | Medium (config) | The client CSP has a placeholder API host. Until it is replaced, a deployed client cannot reach the API | `client/vercel.json`: `REPLACE-WITH-API-HOST.onrender.com` | Replace at deploy time (`docs/deployment.md` step 2.4). Part B tests the CSP against a production build |
| 2 | Low | A crash inside the app shell (Navbar, Sidebar, footer) is not caught: React Router would show its raw developer error screen | `client/src/router.jsx`: `errorElement` only on the inner route | Add `errorElement: <RouteError />` on the root route as well (hub edit 5, coordinator, Part B) |
| 3 | Low (a11y) | axe "serious" `aria-hidden-focus` on the Compare page. Recharts 3 makes the chart focusable (`accessibilityLayer` is on by default), but it sits inside `<div aria-hidden="true">`, so keyboard users can focus something screen readers cannot see | `e2e/test-results/.../axe-compare.json` | `client/src/components/compare/CompareChart.jsx`: add `accessibilityLayer={false}` to `<LineChart …>` (the table already holds every number). Phase 4 file; coordinator or owner |
| 4 | Low (a11y/SEO) | The empty Search page (`/search` with no query) has no `<h1>`; the page title heading only appears once there is a query | `client/src/pages/Search.jsx`: `{raw && header}` | Always render an `<h1>` ("Search") in the empty state. Owner: Phase 4 file |
| 5 | Low (UX) | Pressing Escape in the search box closes the suggestions **and clears the typed text**. This is Chromium's built-in behaviour for `type="search"` inputs, which the handler doesn't prevent | Found by `search.spec.js` | `client/src/components/common/SearchBar.jsx`, `handleKeyDown`: in the `Escape` branch call `event.preventDefault()` when the list is open (a second Escape can still clear). Owner: Phase 1 file |
| 6 | Info | In development, React StrictMode mounts pages twice, so an errored query can be fetched twice. Production is unaffected | `resilience.spec.js` allows ≤ 2 calls, then asserts no further retries | None |
| 7 | Info | Google Fonts is loaded from Google's servers: a third-party request on every visit (visitor IP shared with Google), and two extra CSP hosts | `client/index.html` | Optional: self-host Inter (`@fontsource/inter`). Decide in Part B after Lighthouse |
| 8 | Info | CORS preflights are not cached. Once accounts are on, every authenticated request sends an `OPTIONS` first | `cors({ origin })` | `server/src/app.js`: `cors({ origin: origins, maxAge: 600 })` (hub edit 6, approved for Part B) |
| 9 | Info (accepted) | Rate-limit counters are in memory and per instance | `rateLimits.js` | Fine for one free instance; a shared store (Redis) is needed only when scaling out |
| 10 | Info (accepted) | Supabase session tokens live in localStorage (Phase 5 decision); a successful XSS could read them | `docs/plans/phase-5-plan.md` §5 | Mitigated by React escaping, no HTML injection sinks, and the strict `script-src 'self'` CSP |
| 11 | Info | Render's disk is temporary, so the Spotify block file is lost on redeploy. A redeploy during a 24-hour block can trigger one more blocked request | `providers/index.js` | Deploy on `CATALOG_PROVIDER=mock` first (`render.yaml` default) |

No High findings.

## Part B to-do

- Re-run the scan and audit after Phases 5–7 land.
- Review every new route: auth required, zod validation, 404-not-403, admin checks via `is_admin()`, the field whitelist for public collections, the database constraint for one vote per battle, rate limits on new write routes.
- Run the production-preview e2e with the `vercel.json` headers applied, so CSP violations fail tests.
- Run Lighthouse and a full axe pass (serious + critical fail).
