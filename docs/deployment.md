# Deploying Albumly

This guide puts Albumly online for free:
- **Vercel** hosts the React client, the static files built by Vite.
- **Render** runs the Express API.

Nothing here has been deployed yet. The config files are ready in the repo:
- `render.yaml` (the API)
- `client/vercel.json` (the client, its security headers and its page routing)

Every value you have to fill in is written as a **placeholder in angle brackets**, for example `<API_URL>`. Write your real values down as you go:

| Placeholder | What it is | Example shape |
| --- | --- | --- |
| `<GIT_REPO>` | Your repository on GitHub, GitLab or Bitbucket | `<your-account>/<repo-name>` |
| `<API_SERVICE_NAME>` | The name you give the Render service | `albumly-api` |
| `<API_URL>` | The address Render gives the API | `https://<API_SERVICE_NAME>.onrender.com` |
| `<API_HOST>` | `<API_URL>` without `https://` | `<API_SERVICE_NAME>.onrender.com` |
| `<CLIENT_PROJECT_NAME>` | The name you give the Vercel project | `albumly` |
| `<CLIENT_URL>` | The address Vercel gives the client | `https://<CLIENT_PROJECT_NAME>.vercel.app` |
| `<SUPABASE_PROJECT_URL>` | Only with accounts: your Supabase Project URL | `https://<project-ref>.supabase.co` |

## How the pieces talk

```
Browser ──(HTML/JS/CSS)── Vercel: <CLIENT_URL>
   │
   └──(fetch /api/...)──── Render: <API_URL> ──── Spotify (only when CATALOG_PROVIDER=spotify)
                                              └── Supabase (only when accounts are set up)
```

- The client calls the API on a different address. The client is told the API address at build time through `VITE_API_BASE_URL`.
- The API only accepts browser requests from addresses listed in `CLIENT_ORIGIN`. That is the CORS allow-list.
- Logins use a token in a header, not cookies, so different addresses cause no cookie problems.
- Why not let Vercel forward `/api` to Render? Then every request would reach Render from Vercel's servers. The per-visitor rate limit would see one "visitor" and block everyone at once.

## Before you start

1. The code is pushed to `<GIT_REPO>`. Both hosts deploy from git.
   - `server/.env` and `client/.env.local` are git-ignored and must stay that way.
   - Run `npm run check:secrets` before pushing.
2. Run locally: `npm test`, `npm run lint`, `npm run build`, `npm run check:bundle` and `npm run test:e2e` all pass.
3. Free accounts on **render.com** and **vercel.com**. Signing in with your git host is easiest.

## Step 1: deploy the API on Render

1. Render dashboard → **New** → **Blueprint** → connect `<GIT_REPO>`. Render finds `render.yaml` at the repo root.
2. It proposes one web service. You can rename it; that name becomes `<API_SERVICE_NAME>`.
3. Render asks for the values marked `sync: false`. For the first deploy, fill in only:
   - `CLIENT_ORIGIN` = `<CLIENT_URL>`. You don't know it yet, so type a placeholder like `https://example.invalid` and fix it in step 3.
   - Leave every `SPOTIFY_*`, `SUPABASE_*` and `DATABASE_*` value **empty**. The API then serves the demo catalogue with accounts off. That always works.
4. Click **Apply**. The build runs `npm ci --omit=dev` in `server/`, then `npm start`.
5. When it says **Live**, open `<API_URL>/api/health`. You should see `{"status":"ok","provider":"mock",...}`.

What `render.yaml` sets for you:

| Variable | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | `server.js` then listens on Render's `PORT` |
| `NODE_VERSION` | `24` | Same major version as development |
| `CATALOG_PROVIDER` | `mock` | Demo catalogue first; see step 6 |
| `TRUST_PROXY` | `1` | One proxy (Render's) sits in front of the app, so rate limits see each visitor's real address |
| `INTELLIGENCE_DAILY_REQUESTS` | `30` | Most Spotify requests per day for Discover's "Look up" button (0 turns it off) |

## Step 2: deploy the client on Vercel

1. Vercel dashboard → **Add New** → **Project** → import `<GIT_REPO>`.
2. **Root Directory**: `client`. Vercel then reads `client/vercel.json`, which sets the Vite preset, `npm run build` and the `dist` output.
3. **Environment Variables** (Production). These end up inside the JavaScript bundle, so only public values belong here:

   | Name | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | `<API_URL>` (no trailing slash) |
   | `VITE_SITE_URL` | `<CLIENT_URL>`, so share previews get an absolute image link (`og:image`) |
   | `VITE_SUPABASE_URL` | empty, or `<SUPABASE_PROJECT_URL>` once accounts are set up |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | empty, or your Supabase **publishable** key (never the secret key) |

4. Before deploying, edit `client/vercel.json` and commit. It contains `REPLACE-WITH-API-HOST.onrender.com` twice, in `img-src` and `connect-src`. Replace both with `<API_HOST>`. Without this the browser's Content Security Policy blocks every API call.
5. **Deploy**. The project's address is `<CLIENT_URL>`.

## Step 3: connect them

1. Render → your service → **Environment** → set `CLIENT_ORIGIN` to `<CLIENT_URL>`. Use commas to allow several addresses, e.g. a custom domain too. Save; Render redeploys.
2. Open `<CLIENT_URL>`. The home page shows the demo artists and the footer says "Demo mode".

## Step 4: smoke test

| Check | Expected |
| --- | --- |
| `<API_URL>/api/health` | `status: ok` |
| Home page | Featured artists appear (the first visit after a quiet spell can take ~30–50 s, see "Free-tier limits") |
| Search `neon` → open Neon Harbor → open Glass Arcade | Artist page, explorer and album page load |
| Save an album → reload | It is still saved |
| `<CLIENT_URL>/no-such-page` | Albumly's "Page not found", not a Vercel 404 |
| `<CLIENT_URL>/robots.txt` and `<CLIENT_URL>/og-image.png` | Served as files (not the app) |
| Browser dev tools → Console | No "Content Security Policy" errors |
| `curl -I <CLIENT_URL>` | `content-security-policy`, `x-content-type-options: nosniff`, `strict-transport-security` |
| `curl -I <API_URL>/api/health` | helmet headers, plus `ratelimit-policy` |

## Step 5 (optional): accounts

Follow `docs/plans/phase-5-plan.md` §10 to create the Supabase project. Then:

1. Render → Environment: set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `DATABASE_URL`.
2. **SSL certificate**:
   - Render → your service → **Secret Files** → add a file named `supabase-ca.crt` with the certificate's contents.
   - Set `DATABASE_SSL_CA` to `/etc/secrets/supabase-ca.crt`.
   - In production the API refuses to start a database connection without it.
3. Vercel → Environment Variables: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then **Redeploy**. Vite reads them only at build time.
4. Supabase → Authentication → URL Configuration:
   - Site URL = `<CLIENT_URL>`
   - add `<CLIENT_URL>/account` to Redirect URLs
5. Run the migrations once from your computer: `npm run db:migrate --prefix server`, using your local `server/.env`. This applies `database/migrations/0001`–`0004`: library, RLS, community and community RLS.
6. Optional, to open the admin dashboard at `<CLIENT_URL>/admin`: make your account an admin (README, "Making yourself an admin").

## Step 6 (optional): live Spotify data

1. Render → Environment: set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` (and optionally `SPOTIFY_MARKET`). Then change `CATALOG_PROVIDER` to `spotify`.
2. Check `<API_URL>/api/health`: `provider` is `spotify`.
3. Know the limits (see `docs/phase-2-concepts.md`):
   - Spotify allows roughly 100 discography pages a day.
   - The app owner needs active Premium.
   - Render's disk is wiped on every restart or deploy, so the response cache and the "Spotify blocked us until…" file start empty each time. After a restart the server may ask Spotify once more and get blocked again.
   - If you expect visitors, staying on `mock` (demo mode) is the safer public demo.

## Free-tier limits

| Limit | Effect | What to do |
| --- | --- | --- |
| Render free services sleep after ~15 min without traffic | The next visit waits ~30–50 s while it wakes; the first page shows a loading state | Accept it for a portfolio demo, or use a paid instance |
| Render's disk is temporary | Spotify cache and block file vanish on restart | Fine on `mock`; a Redis cache (e.g. Upstash) is the long-term fix |
| In-memory rate-limit counters | Reset on restart; per instance | Fine for one instance |
| Supabase free projects pause after ~1 week idle | Accounts stop working until resumed | Dashboard → **Restore** |
| Vercel Hobby is for non-commercial use | — | Fine for a portfolio |

## Rolling back

- **Vercel**: Deployments → pick the last good one → **Promote to Production**.
- **Render**: Events → pick the last good deploy → **Rollback**.
- **Bad environment value**: fix it in the dashboard; both hosts redeploy.

## If the CSP blocks something

The browser console names the blocked address and the directive (e.g. `img-src`).
1. Add that host to the matching directive in `client/vercel.json` and redeploy.
2. To debug without breaking the site, temporarily rename the header to `Content-Security-Policy-Report-Only`. The browser then only warns.

## Alternatives considered

| Option | Verdict |
| --- | --- |
| Render static site for the client (one provider, one blueprint) | Works well: add a `type: web` + `runtime: static` service with `staticPublishPath: client/dist` and the same headers/rewrites. Vercel was kept because the PRD names it and its preview deployments are handy. |
| Vercel rewrite of `/api/*` to Render (same address for both) | Rejected: all visitors would share Vercel's IP addresses in our per-IP rate limit. |
| Railway | No free tier any more. |
| Fly.io / Koyeb for the API | Both workable; Fly needs a payment card, Koyeb's free instance also sleeps. Render keeps the setup simplest. |
