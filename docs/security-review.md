# Security and hardening review

_Final review for Phase 8, 2026-11-10. Covers the whole app: catalogue, library, accounts, intelligence, community and admin._

## How to re-run the checks

| Check | Command | Result |
| --- | --- | --- |
| Secret scan (tracked + untracked, not ignored files) | `npm run check:secrets` | **0 findings** in 376 files. `server/.env`, `client/.env`, `client/.env.local` are git-ignored and none is tracked |
| Dependency audit (root, client, server) | `npm run check:audit` | **0 vulnerabilities** at any severity in all three packages |
| Bundle budget | `npm run build && npm run check:bundle` | Initial JS **159.5 KB gzip** (budget 200 KB). Recharts and auth-js load only when needed |
| End to end (demo catalogue, accounts on PGlite, production build with the real headers) | `npm run test:e2e` | All passing, twice in a row, no retries |
| Accessibility (axe-core, WCAG 2.1 A + AA) | part of `npm run test:e2e` | **0 violations of any severity** on 17 pages (signed out) + 3 signed-in pages |
| Lighthouse | `npm run test:lighthouse` | See "Lighthouse" below |

The secret scan prints only `file:line` and the rule name, never the matched text. Its rules cover:
- private keys
- Supabase secret keys
- JWTs
- database URLs with a password
- AWS, GitHub, Google and Stripe live keys
- 32-hex "secret" assignments
- filled-in secret variables in `.env*` files
- tracked or un-ignored `.env` files

## Controls in place

| Area | Status | Where |
| --- | --- | --- |
| Secrets | Spotify and Supabase secrets live only in `server/.env` (git-ignored) or the host's dashboard (`sync: false` in `render.yaml`). The browser bundle only gets public `VITE_` values. Scripts print variable *names*, never values | `.gitignore`, `server/scripts/scriptEnv.js`, `render.yaml` |
| Headers (API) | helmet defaults: CSP `default-src 'self'`, `nosniff`, `X-Frame-Options: SAMEORIGIN`, HSTS, `Referrer-Policy: no-referrer`, no `X-Powered-By` | `server/src/app.js`; `e2e/tests/api-headers.spec.js` |
| Headers (client) | `client/vercel.json`: CSP (`script-src 'self'`, no `unsafe-eval`, `frame-ancestors 'none'`, `object-src 'none'`), `nosniff`, `X-Frame-Options: DENY`, HSTS, `strict-origin-when-cross-origin`, `Permissions-Policy` | **Tested against the production build** by `e2e/tests/prod/production.spec.js`: any CSP violation fails |
| CORS | Allow-list from `CLIENT_ORIGIN`. Bearer tokens, no cookies (so no CSRF surface). Preflights cached 10 min | `server/src/app.js` |
| Authentication | Supabase access tokens verified locally against the project's JWKS: signature, issuer, `aud=authenticated`, expiry, algorithm allow-list (no `none`, no HS256 without the fallback) | `server/src/auth/verifyToken.js` (+ tests) |
| Authorization | Every library, community and admin query runs in `db.asUser()` as the `authenticated` role, so **RLS applies to our own server**. SQL also filters by `user_id`. Someone else's row is a 404, never a 403 | `server/src/db/database.js`, `database/migrations/0002_rls.sql`, `0004_community_rls.sql` |
| Admin | `app_admins` table plus `is_admin()`, checked in Express **and** again inside the database functions. Non-admins get 403 and no data. Granting needs SQL access to the project | `server/src/routes/adminRoutes.js`, `0003_community.sql` |
| Public data | Shared collections are read through a `security definer` function that returns whitelisted fields only (no notes, tags or statuses; ratings and reviews only if the owner opts in). Snapshots are cleaned again server-side, and links are re-checked client-side (`safeUrl.js`). `noindex` on shared pages and responses | `0003_community.sql`, `publicAlbum.js`, `useNoIndex.js` |
| Integrity rules in the database | One vote per user per battle (primary key). One report per person per target (unique index). A battle pair exists once. CHECK constraints mirror every zod limit | migrations |
| Rate limiting | Per IP: 300 / 5 min on `/api`. Per hour: import 10, delete account 5, create battle 20, vote 120, report 20. `TRUST_PROXY=1` on Render | `middleware/rateLimits.js`, `services/community/rateLimits.js` |
| Spotify budget | Outbound queue (4 at once), de-duplication, long cache, per-endpoint blocks on disk, and a daily cap for Discover's lookups (`INTELLIGENCE_DAILY_REQUESTS`) | `spotifyClient.js`, `requestBudget.js` |
| Body limits and errors | 100 KB JSON (5 MB on import). 413 and 400 instead of 500. One error envelope; 500s never include details | `app.js`, `errorHandler.js` |
| XSS | No `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `client/src` or `server/src`. React escapes text. Imported or shared links must be `http(s)`. zod's code generation is off (`zodSetup.js`), so the CSP can forbid `eval` | `schema.js`, `safeUrl.js`, `zodSetup.js` |
| CSV injection | Cells starting with `= + - @` are prefixed with `'` | `transfer.js` |
| Privacy | Top searches keep only the normalised text and a count, drop anything that looks like personal data, and show a query only after 3 searches. Request metrics live in memory only. The privacy page lists what is stored, sharing, votes and reports, and how to delete it all | `services/metrics/topSearches.js`, `pages/Privacy.jsx` |
| Account deletion | Deletes all library rows, then the auth user. Community rows cascade, and battles keep existing without their creator. A typed email confirms it, and the page confirms success | `accountRoutes.js`, `DeleteAccount.jsx`, `Account.jsx` |
| Error boundaries | Page-level `errorElement` inside the shell, plus a root `errorElement` for crashes in the shell itself. A failed lazy chunk (old tab after a redeploy) shows "Reload". The page crash and the failed chunk are tested on the production build | `router.jsx`, `RouteError.jsx`, `prod/production.spec.js` |

## Findings fixed in Phase 8

| # | Finding | Fix |
| --- | --- | --- |
| 1 | **CSP violation on every page of the production build.** zod 4 probes `new Function` to decide whether to generate code; the strict CSP reports it | `client/src/zodSetup.js` (`z.config({ jitless: true })`), imported by every zod user and `main.jsx` |
| 2 | Without accounts, Battles (and a shared link) still called the API, got 503 `accounts_unavailable`, and logged console errors | `hooks/useCommunity.js` and `pages/Battles.jsx` only query when accounts are on. `pages/PublicCollection.jsx` shows "Sharing isn't set up" without a request. Unit + e2e tests |
| 3 | A crash in the app shell would show React Router's raw developer screen | Root `errorElement` in `router.jsx` |
| 4 | axe "serious": focusable charts inside `aria-hidden` (Compare, Insights, Admin) | `accessibilityLayer={false}` on the Recharts charts (the tables beside them hold the numbers) |
| 5 | axe "serious": links nested in an SVG with `role="img"` (connection map) | `role="group"` in `ArtistGraph.jsx` |
| 6 | Escape in the search box also wiped the typed text; the empty Search page had no `<h1>` | Fixed by the coordinator from the Part A list |
| 7 | Deleting an account gave no confirmation | `Account.jsx` shows "Your account and all its data were deleted." |
| 8 | Google Fonts stylesheet blocked first paint (~0.9 s on mobile), and a font swap shifted the Discover layout | Stylesheet injected from `main.jsx` with `display=optional` (no blocking, no shift) |
| 9 | Every authenticated cross-origin request sent a CORS preflight | `cors({ maxAge: 600 })` |
| 10 | No share-preview tags | Open Graph and Twitter tags, `og-image.png`, `robots.txt`, `<noscript>` |

## Open items and accepted risks

| # | Severity | Item | Status |
| --- | --- | --- | --- |
| A | Medium (launch config) | `client/vercel.json` has a placeholder API host in `img-src` and `connect-src` | Replace at deploy time (`docs/deployment.md` step 2.4). The prod e2e strips it only because it tests through a same-origin proxy |
| B | Low | Mobile Lighthouse performance is below the PRD's 90 on some pages (see below). Desktop is 96–100 | The cause is the request chain (JS → page chunk → API → cover image) on simulated slow 4G. Ideas: preload the page chunk for the landing route, or fetch the artist/album with the page chunk |
| C | Info (accepted) | Supabase session tokens live in localStorage; an XSS could read them | Mitigated by no HTML-injection sinks, React escaping, and a CSP without inline scripts or eval. httpOnly cookies would need same-site hosting |
| D | Info (accepted) | Rate-limit counters and request metrics are in memory, per instance, and reset on restart | Fine for one free instance |
| E | Info (accepted) | Render's disk is temporary, so the Spotify cache, block file and intelligence budget file reset on redeploy | Deploy on `CATALOG_PROVIDER=mock` first. A Redis store would fix it |
| F | Info (accepted) | Device clocks decide "newest wins" sync conflicts; no tombstones | Documented in Phase 5 |
| G | Info | Fonts still come from Google (visitor IP is shared with Google) | Self-hosting Inter would remove it; needs a font package (not installed) |
| H | Before launch | The privacy page's contact is a placeholder address | Set `client/src/config/privacy.js` to a mailbox that exists |

## Lighthouse

`npm run test:lighthouse` runs against the production build with the `vercel.json` headers, on Playwright's Chromium. Mobile is the median of 3 runs per page (simulated slow 4G); desktop is one run. Scores from the last run, 2026-11-10:

| Page | Mobile perf | Desktop perf | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- |
| Home | 81 | 100 | 100 | 100 | 100 |
| Artist | 80 | 96 | 100 | 100 | 100 |
| Album | 82 | 97 | 100 | 100 | 100 |
| Library | 93 | 100 | 100 | 100 | 100 |
| Discover | 93 | 100 | 100 | 100 | 100 |

- Accessibility, best practices and SEO are 100 on every page in both modes.
- Single mobile runs of the same page varied between about 79 and 95 on this machine. The test enforces the PRD targets everywhere except mobile performance, which has a regression floor of 80 (open item B).
