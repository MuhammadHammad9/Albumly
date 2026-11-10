# Phase 8 plan: hardening, docs, launch prep

Scope: PRD §8 "Phase 8", checked against the §3.3 metrics, the §5 non-functional rules and the §11 verification list.
Phases 5–7 are being built at the same time, so the work is split in two:
- **Part A** covers what exists today: Phases 1–4 and the discography explorer.
- **Part B** starts when the coordinator says Phases 5–7 have landed.

Ground rules for this phase:
- Nothing is deployed. Configs and a guide are written, and no hosting provider is contacted.
- E2E runs only on the demo catalogue, never on live Spotify, and never touches Supabase.
- No git commits. No edits to existing files. Hub-file changes are listed in §9 for the coordinator to apply.
- Only Chromium is used for browser tests.

What I read on 2026-11-10: `docs/PRD.md`, `docs/phase-1..4-concepts.md`, `docs/plans/*.md`, `server/src/app.js`, `server.js`, `scripts/dev-demo.js`, the providers, `catalogRoutes.js`, the rate-limit and error middleware, `client/vite.config.js`, `router.jsx`, `main.jsx`, `index.html`, `services/api.js`, the layout components, and the accessible names used by the pages.

---

## 1. Key decisions (please confirm or adjust)

| # | Decision | Choice | Why / alternative |
| --- | --- | --- | --- |
| P1 | Where Playwright lives | `@playwright/test` at the **repo root**, `playwright.config.js` at the root, tests in `e2e/`. Run with `npm run test:e2e`. | E2E drives both packages, so it belongs to neither. A root config means plain `npx playwright test` works. |
| P2 | How the E2E API starts | A new `server/scripts/e2e-server.js` **imports `createApp` directly** and calls `createApp({ accounts: null, rateLimits: false })` on `127.0.0.1:5066`, with `CATALOG_PROVIDER=mock` set first. | It never imports `server.js`, so `dotenv` never reads `server/.env`. Spotify keys and Supabase settings cannot leak in, and accounts are always off in Part A. Rate limits are off because a parallel suite would hit 300 requests in 5 minutes. One test turns them back on (§3). `dev-demo.js` was not reused: it goes through `server.js`, and so through `.env`. |
| P3 | How the E2E client starts | A new `client/vite.e2e.config.js`. It calls the base `vite.config.js` function and overrides only: the proxy `/api → http://127.0.0.1:5066`, port 5288 with `strictPort`, `cacheDir: node_modules/.vite-e2e`, and `envDir: ../e2e/env` (an empty folder). | The base config stays the single source of truth for plugins. A **separate cacheDir** stops the E2E Vite and the coordinator's preview Vite from fighting over `node_modules/.vite`. An **empty envDir** means `client/.env.local` (Supabase keys) is never loaded, so the account UI stays hidden and the suite is deterministic. Part B opts in on purpose (§6). |
| P4 | Dev server or production build | Part A tests against the **Vite dev server** (fast, no build step). Part B adds a second Playwright project that runs `vite build` into `e2e/.dist` and serves it with `vite preview` on 5288. Lighthouse, the CSP and the real bundle are checked there. | It builds into its own folder, so it never overwrites `client/dist` while another agent runs `npm run build`. |
| P5 | Browsers | Chromium only. Two projects: `desktop` (1280×800) and `mobile` (Pixel 7 profile, which is Chromium). The mobile project runs only tests tagged `@mobile`. | The disk budget allows Chromium only. I suggest `npx playwright install chromium --only-shell` (headless shell, about 110 MB instead of about 300 MB). Use the full `chromium` only if you want to watch tests run headed. |
| P6 | Selectors | Only `getByRole`, `getByLabel` and `getByText` with accessible names, e.g. `getByRole('combobox', { name: 'Search artists, albums and tracks' })` or `getByRole('button', { name: 'Save Glass Arcade' })`. No CSS classes and no test ids. | Other agents are still changing the markup. This also checks accessibility for free: if a test can't find a control by its name, neither can a screen reader. |
| P7 | Hosting (prepared, not deployed) | **Vercel** (Hobby) for the static client and **Render** (free web service) for the API. The browser calls the API **cross-origin**: `VITE_API_BASE_URL` points to the Render URL, and `CLIENT_ORIGIN` on Render points to the Vercel URL. | Matches PRD §8. The code already supports this: `api.js` reads `VITE_API_BASE_URL`, CORS takes a comma-separated allow-list, mock art sends `Cross-Origin-Resource-Policy: cross-origin`, and auth uses Bearer tokens rather than cookies, so there are no third-party-cookie problems. I rejected having Vercel rewrite `/api/*` to Render: every request would reach Render from Vercel's IP addresses, so the per-IP rate limit would become one shared limit for all visitors. Alternatives are covered in the guide: Render static site for the client (one provider, one blueprint), Koyeb or Fly.io for the API (Railway has no free tier). |
| P8 | Production catalogue | The guide deploys with `CATALOG_PROVIDER=mock` first (always works, no Premium needed). Switching to `spotify` is a separate step. | The live demo must never show a raw error (PRD §3.1 "reviewer" persona). Render's disk is wiped on restart, so the Spotify file cache and block file do not survive. The guide says so. |
| P9 | Lighthouse (Part B) | The `lighthouse` npm package, run against the Part B preview build using **Playwright's Chromium** (`chromium.executablePath()`), so no second browser is downloaded. Results go to `e2e/lighthouse/` (git-ignored). The targets from §3.3 become the pass marks. | If the headless shell does not work with Lighthouse, the fallback is axe-core (accessibility) plus my own timing and bundle checks, and I report that §3.3's Lighthouse line could not be measured. |
| P10 | Secret scan | A small dependency-free Node script (`scripts/secret-scan.js`). It reads the file list with `git ls-files` (tracked) plus `git ls-files --others --exclude-standard` (untracked, not ignored), and greps for secret patterns. | Read-only git commands, no new tool to download. gitleaks is the industry tool, but it is a Go binary from GitHub: an untrusted download plus disk use. The script never prints a matched value, only the file, line, rule and a masked preview. |

---

## 2. Packages (root `devDependencies`, exact, all at least 14 days old on 2026-11-10)

| Package | Version | Published | Why | Part |
| --- | --- | --- | --- | --- |
| `@playwright/test` | `1.64.1` | 14 Oct 2026 | Test runner and browser driver. `1.65.0` is only 5 days old, so it is skipped. | A |
| `@axe-core/playwright` | `4.14.0` | 15 Oct 2026 | Accessibility rules engine used inside E2E pages. | A (smoke), B (full pass) |
| `lighthouse` | `13.5.0` | 18 Sep 2026 | Perf, a11y, best-practices and SEO scores. `13.6.0` is 14 days old, which is borderline, so `13.5.0`. | B only, installed when Part B starts |

Install commands for the coordinator (Part A):
```bash
npm install --save-dev --save-exact @playwright/test@1.64.1 @axe-core/playwright@4.14.0
npx playwright install chromium --only-shell
```
Nothing goes into `client/` or `server/` packages.

---

## 3. Part A — E2E suite (features that exist today)

### Layout

```
playwright.config.js            root; webServer starts the API (5066) and Vite (5288), then stops both
e2e/
  env/.gitkeep                  empty envDir for vite.e2e.config.js (no .env files ever go here)
  fixtures.js                   extends `test`: fails a test on any uncaught page error or console.error
                                (with a small allow-list); exposes helpers below
  support/catalog.js            demo-catalogue constants: artist ids/names, album ids, track counts
  support/library.js            seedLibrary(page, albums): writes a v1 library to localStorage via
                                addInitScript (hand-written, so it also checks the stored format stays compatible)
  support/a11y.js               runAxe(page): attaches the full report; fails only on "critical" in Part A
  tests/
    smoke.spec.js               home loads; featured artists; demo-mode note in footer; skip link; page title
    search.spec.js              combobox suggestions + ↑/↓/Enter/Esc; disambiguation (Neon Harbor vs
                                Neon Harbour Tribute Band); Search page tabs; "Understood as" for
                                `neon harbor 2015 album`; tracks tab; load more; URL survives reload
    artist-explorer.spec.js     release-type tabs and counts; filter text; year range; sort; grid/list/
                                timeline; URL state survives reload and Back; edition stacking
                                (Glass Arcade + Deluxe); completeness report; inferred-EP note;
                                lazy "Appears On" (Cass Marlowe) and compilations (Driftwood Recordings)
    album.spec.js               title, track count, computed duration; Find a track; two discs (Afterimage);
                                unknown album → not-found message; Spotify links have rel="noreferrer"
    library.spec.js             save from card → Library → reload → still saved (PRD §11 flow);
                                status, rating, tag, collection on the album page; collection page
                                Move up/down; remove-with-confirm; filters in URL; export JSON (download
                                event, file kept in test output) and import of a broken file → exact
                                error report; importing the same file twice → "Nothing new"
    compare.spec.js             Add to compare on Glass Arcade → open Afterimage → "Compare with Glass Arcade"
                                → table rows and deltas; Swap; Clear; chart heading present (Recharts lazy-loaded)
    resilience.spec.js          `!error` search → error state with Retry; API unreachable
                                (page.route abort) → "Can't reach the Albumly server"; a mocked 429
                                envelope → friendly message, no retry storm; unknown route → 404 page;
                                slow API (delayed route) → loading status is announced
    rate-limit.spec.js          starts its own tiny in-process app on a random port with `limit: 3` (no
                                browser) and checks the 429 envelope + Retry-After header
    mobile.spec.js  @mobile     bottom nav works; no horizontal scroll at 390 px on Home, Artist, Album, Library
    a11y.spec.js                axe on Home, Search, Artist, Album, Library, Compare (critical = fail;
                                serious = listed in the report and in docs/security-review.md for Part B)
```

### Config details

- `fullyParallel: true`, `workers: 2`. Each test gets a fresh browser context, so localStorage starts empty and no test depends on another.
- `retries: 0` locally and 1 under `CI`.
- `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'off'` (video would need ffmpeg, another download).
- Output: `e2e/test-results/`. HTML report: `e2e/playwright-report/` with `open: 'never'`. Both are git-ignored (§9).
- `webServer` (2 entries):
  - `node server/scripts/e2e-server.js`, waiting on `http://127.0.0.1:5066/api/health`.
  - `npx vite --config vite.e2e.config.js` (cwd `client/`), waiting on `http://127.0.0.1:5288`.
  - `reuseExistingServer: false`, so the suite never attaches to someone else's server. If a port is taken it fails loudly instead.
  - Playwright stops both processes when the run ends. I will confirm afterwards with `netstat` that 5066 and 5288 are free.
- `baseURL: http://127.0.0.1:5288`.

### Bundle budget — `scripts/bundle-budget.js`

- Run after `npm run build`.
- It reads `client/dist/index.html` to find the **initial** files: the entry script, `modulepreload` links and CSS.
- It gzips each one with Node's `zlib` and fails if the initial JS is over **200 KB gzip** (PRD §3.3).
- It prints a table of every chunk (raw and gzip), marking which are lazy.
- It also checks that `recharts` is not in the initial chunks and that `@supabase/auth-js` is lazy (when present).
- A stale build from today measured about **154 KB gzip** initial JS, so there is about 46 KB of headroom. The ~220 KB raw `pages.module-*.js` shared chunk is the one to watch.

### Security tooling (Part A)

- `scripts/secret-scan.js` (see P10). Rules:
  - private-key blocks
  - `sb_secret_…`
  - JWT-shaped strings (`eyJ…`.`…`.`…`)
  - `postgres(ql)://user:password@`
  - 32-hex values next to `secret`/`client_secret`
  - AWS, GitHub and Google key prefixes
  - also: `.env` files are tracked, or `.env` is not ignored (checked with `git check-ignore`)
  - Allow-list: `*.example`, test fixtures with obviously fake keys, and the generated JWKS in tests. Each entry has a reason.
  - Exit code 1 on findings.
- `scripts/audit-report.js` runs `npm audit --json` in root, `client/` and `server/`. It prints counts by severity and the advisory list, then exits non-zero on high or critical issues in **production** dependencies. It is read-only: it never runs `npm audit fix`.
- `docs/security-review.md` (Part A draft) records:
  - The scan and audit results.
  - Headers: helmet defaults on the API. The static client gets its headers from `vercel.json` (§4).
  - CORS: an allow-list from `CLIENT_ORIGIN`, no credentials.
  - Rate limits: 300 requests per 5 min per IP, plus the import and delete-account limits; `TRUST_PROXY=1` on Render.
  - Body limits, the error envelope (no stack traces leak), zod validation, the `javascript:` URL guard and the CSV formula guard.
  - Token storage trade-off (localStorage, from the Phase 5 plan).
  - Each finding gets severity, evidence and the fix (or "accepted, because …").

### Deployment preparation (no deployment)

- `render.yaml` (Render Blueprint, repo root), one web service `albumly-api`:
  - `rootDir: server`, `buildCommand: npm ci --omit=dev`, `startCommand: npm start`, `healthCheckPath: /api/health`, `plan: free`.
  - env: `NODE_ENV=production`, `NODE_VERSION=24`, `CATALOG_PROVIDER=mock`, `TRUST_PROXY=1`.
  - These are `sync: false`, so they are typed in the dashboard and never stored in git: `CLIENT_ORIGIN`, `SPOTIFY_*`, `SUPABASE_*`, `DATABASE_URL`, `DATABASE_SSL_CA`.
- `client/vercel.json`:
  - Vite framework preset, `dist` output.
  - SPA fallback rewrite to `/index.html`.
  - `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`.
  - Security headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, mic, geolocation off), `frame-ancestors 'none'`.
  - The CSP allows: self; Google Fonts (`fonts.googleapis.com` styles, `fonts.gstatic.com` fonts); Spotify images (`i.scdn.co`, `*.spotifycdn.com`); the API origin (for data and mock art); `*.supabase.co` (auth).
  - `style-src` needs `'unsafe-inline'`, because React `style` props and Recharts use inline styles. Scripts stay `'self'` only.
  - The API URL is a clearly marked placeholder (`https://albumly-api.onrender.com`) that the guide tells you to replace.
- `docs/deployment.md`, a step-by-step guide:
  - accounts to create
  - Render Blueprint import
  - env vars table (what, where, secret or not)
  - Vercel import with root `client/` and `VITE_API_BASE_URL` plus the `VITE_SUPABASE_*` values
  - updating `CLIENT_ORIGIN` and the CSP with the real URLs
  - Supabase redirect URLs for production
  - a post-deploy smoke checklist (health, search, artist, album, save → refresh, 404 page, headers check with `curl -I`)
  - switching to `CATALOG_PROVIDER=spotify`
  - known free-tier limits: cold start of about 30–50 s after 15 min idle, ephemeral disk, Supabase pauses after a week idle
  - rollback
  - alternatives (P7)

### Docs drafts (Part A)

- `docs/architecture.md`:
  - A Mermaid diagram: browser SPA → Express (routes, provider interface, token service, queue, LRU cache, discography aggregator) → Spotify / mock, plus the Phase 5 Supabase path drawn dashed ("Release 2").
  - A request lifecycle walk-through (search → cache miss → queue → normalize → cache).
  - Client layers (pages → hooks/TanStack Query → `api.js`; Zustand library store → repository).
  - Code-splitting map, the demo-mode design, and where each PRD §6.3 algorithm lives.
- `docs/api-documentation.md`: every existing endpoint, with method, path, parameters and limits, an example response (taken from the mock provider), error codes and the error envelope:
  - `health`, `search`, `artists/:id`, `discography`, `discography/:group`, `albums/:id`, `featured`, `mock/art`
  - the Phase 5 account and library endpoints as far as they exist in code today, marked "Release 2, needs accounts"
  - rate-limit headers (`RateLimit` draft-8)
- `docs/technical-challenges.md`: about eight short case studies, each with problem, constraint, solution, trade-off and where in the code:
  - Spotify's removed batch endpoints and the 10-item cap
  - `album_group` removal
  - token stampede
  - 429 handling and the 22-hour block file
  - LRU+TTL cache
  - edition grouping heuristics
  - EP inference
  - localStorage salvage and migrations
  - query parser ambiguity (`1989` as a title)
  - running E2E without Spotify or Supabase
- `docs/demo-script.md`: a 2–3 minute video script with timestamps, on-screen actions, narration and fallback notes, on the demo catalogue. The Part B version adds accounts, intelligence and community.

---

## 4. Part B — after Phases 5–7 land

1. **Re-read** the landed code and plans (`phase-5/6/7-*.md`), and update the E2E support constants and server script if `createApp`'s dependencies changed.
2. **E2E extensions:**
   - **Accounts:** a second webServer variant. `e2e-server.js --accounts` builds `accounts` from **PGlite** plus a **locally generated JWKS key pair**, the same technique as Phase 5's route tests. The browser side has the same problem: auth-js talks to Supabase directly. Two ways to handle that:
     - Stub the Supabase Auth endpoints with `page.route('**/auth/v1/**')`, returning tokens signed by the local key.
     - Or, if that proves brittle, skip the account E2E with `test.skip(!accountsConfigured, …)` and rely on Phase 5's integration tests and `live-check`.
     - Flows: sign-up form validation, sign-in, the import prompt, the same library in a second browser context, sign-out clears the device copy, the expired-session banner, delete account.
     - The whole group is skippable via `E2E_ACCOUNTS=0` and is skipped automatically when the dependencies are missing.
   - **Intelligence:** recommendations exclude saved albums and show a reason; insights numbers match a seeded library; quiz; eras, graph and calendar render on the demo catalogue.
   - **Community:** a logged-out visitor opens a shared collection; battle vote; leaderboard; admin metrics page is hidden from non-admins.
3. **Prod-preview project** (P4) with the `vercel.json` headers applied through `preview.headers`, so the **CSP is tested** against the real bundle. Any CSP violation in the console fails the test.
4. **Lighthouse** (P9) on Home, Artist, Album and Library, desktop and mobile. Targets: perf ≥ 90, a11y ≥ 95, best practices ≥ 95, plus SEO. Plus an **axe full pass** where serious and critical violations fail. I list fixes; I don't apply them to other agents' files.
5. **SEO/meta/OG:** the `index.html` edit in §9, per-route `document.title` (already done by `usePageTitle`), `public/robots.txt`, and an `og-image.png` (1200×630, generated as an SVG→PNG asset from the design tokens with no artwork from Spotify). `public/` files are new files, so I can create them.
6. **Error boundary and demo-mode checks:**
   - E2E forces a render crash (a route that throws, via a `page.route` that returns malformed JSON) and checks `RouteError` appears inside the shell.
   - A shell-level crash test, once the root `errorElement` (§9) is added.
   - A stale lazy chunk (a 404 on `/assets/*.js`) shows "Reload".
   - Demo mode: with `CATALOG_PROVIDER=mock` the footer note shows, and with the API down the app shows the offline state, not a blank page.
   - The "waking server" state for Render cold starts, if Phase 7 adds it; otherwise I recommend it.
7. **Final security review:** re-run the scan and audit. Review the new routes: auth on every route, zod, 404-not-403, admin role check, public collection data minimisation, vote uniqueness. Check the CSP against the final bundle and the rate limits on the new write routes.
8. **Docs:** update `architecture.md` (Supabase, intelligence, community), `api-documentation.md` (all routes), `technical-challenges.md`, `demo-script.md`, and `deployment.md` (Supabase production URLs). Then the **README rewrite** (a hub file: I write it as `docs/README.draft.md` and the coordinator moves it into place). It covers overview, features by release, a screenshots section (paths only, unless screenshots are wanted from the E2E run), a Mermaid architecture diagram, a Mermaid ER diagram from `database/migrations`, setup, an env-vars table, scripts, testing, deployment link, limitations (Spotify removals, demo mode, free-tier sleep) and credits/affiliation.

---

## 5. Verification before each report

- Root `npm test`, `npm run lint`, `npm run build`, then `node scripts/bundle-budget.js`, `node scripts/secret-scan.js`, `node scripts/audit-report.js`, and `npm run test:e2e` (Chromium, both projects).
- I confirm ports 5066 and 5288 are free afterwards.
- Failures that come only from another agent's in-progress files are reported, not fixed.

## 6. Ports and processes

- Only Playwright's webServer, on **5066** (API) and **5288** (Vite), is ever started, and it stops after the run.
- Never 5000, 5173, 5055 or 5199. No other browser tools.
- The Part B prod-preview uses the same 5288 port; the two projects never run at the same time, and the config chooses one by `E2E_TARGET=dev|prod`.

## 7. Files I will create

**Part A**
- `playwright.config.js`
- `e2e/env/.gitkeep`, `e2e/fixtures.js`, `e2e/support/{catalog,library,a11y}.js`
- `e2e/tests/{smoke,search,artist-explorer,album,library,compare,resilience,rate-limit,mobile,a11y}.spec.js`
- `server/scripts/e2e-server.js`
- `client/vite.e2e.config.js`
- `render.yaml`, `client/vercel.json`
- `scripts/bundle-budget.js`, `scripts/secret-scan.js`, `scripts/audit-report.js`
- `docs/architecture.md`, `docs/api-documentation.md`, `docs/technical-challenges.md`, `docs/deployment.md`, `docs/security-review.md`, `docs/demo-script.md`

**Part B (adds)**
- `e2e/tests/{accounts,intelligence,community,prod-headers,error-boundary,lighthouse}.spec.js`, plus any support for them
- `scripts/lighthouse.js` (if the runner is kept outside Playwright)
- `client/public/robots.txt`, `client/public/og-image.png`
- `docs/README.draft.md`

## 8. Not done / out of scope

- No deployment, no DNS, no provider accounts.
- No commits or tags.
- No `npm audit fix`. Upgrades are recommended, not applied.
- Screenshots for the README are only taken if you want them. They would come from the E2E run on the demo catalogue.

---

## 9. Hub and existing-file edits I need (the coordinator applies these)

### Part A

1. **`package.json` (root)**
   - devDependencies: `"@playwright/test": "1.64.1"`, `"@axe-core/playwright": "4.14.0"` (via the install command in §2, which also updates `package-lock.json`).
   - scripts:
     ```json
     "test:e2e": "playwright test",
     "test:e2e:report": "playwright show-report e2e/playwright-report",
     "check:bundle": "node scripts/bundle-budget.js",
     "check:secrets": "node scripts/secret-scan.js",
     "check:audit": "node scripts/audit-report.js"
     ```
2. **`.gitignore`**: append
   ```
   # Playwright / Lighthouse output
   e2e/test-results/
   e2e/playwright-report/
   e2e/.dist/
   e2e/lighthouse/
   ```
3. **Coordinator action**: `npx playwright install chromium --only-shell` (about 110 MB, into `%LOCALAPPDATA%\ms-playwright`).

### Part B (listed now so they can be planned)

4. **`client/index.html`**: inside `<head>`, after the description meta:
   ```html
   <meta property="og:type" content="website" />
   <meta property="og:site_name" content="Albumly" />
   <meta property="og:title" content="Albumly — explore every release" />
   <meta property="og:description" content="Search any artist and explore every album, single and EP they have released." />
   <meta property="og:image" content="/og-image.png" />
   <meta name="twitter:card" content="summary_large_image" />
   <link rel="canonical" href="https://albumly.vercel.app/" />   <!-- replace with the real URL at deploy -->
   ```
   Plus `<noscript>Albumly needs JavaScript to run.</noscript>` in `<body>`.
   Optional: self-host Inter instead of Google Fonts (better privacy and Lighthouse, and a simpler CSP). I'll measure in Part B before recommending it.
5. **`client/src/router.jsx`**: add `errorElement: <RouteError />` on the **root** route too (next to `element: <AppShell />`).
   - Reason: today a crash inside `AppShell` itself (Navbar, Sidebar, footer) is not caught. React Router would show its built-in developer error screen, which violates PRD §3.1's "never show a raw error".
   - The inner `errorElement` stays, so page crashes still render inside the shell.
6. **`server/src/app.js`**: `cors({ origin: origins, maxAge: 600 })`.
   - Reason: with the API cross-origin (P7), every signed-in request carries an `Authorization` header and so triggers a CORS preflight. Caching preflights for 10 minutes halves those round trips.
   - It is a one-word change, and the security behaviour is unchanged.
7. **`README.md`**: replace with `docs/README.draft.md`.
8. Anything else the Part B security review, Lighthouse run or axe pass finds will be listed with file, exact edit and reason. It goes to the coordinator or to the owning agent.

## 10. Risks

- **Other agents change accessible names mid-run.** Selectors are by role and name, so a rename breaks one locator with a clear message. I'll report these rather than edit their UI.
- **`createApp`'s signature changes** in Phases 6–7. `e2e-server.js` is ten lines and will be adapted in Part B.
- **Windows process cleanup.** Playwright kills the webServer process tree. If a stray `node` keeps 5066 or 5288 open, I'll report the PID, not kill other agents' processes.
- **Lighthouse with the headless shell** may not be supported. Fallback in P9.
- **The CSP breaks something in production** (for example, a Supabase or Spotify image host not listed). The Part B prod-preview test catches this locally, and the guide shows how to switch to `Content-Security-Policy-Report-Only` while debugging.
