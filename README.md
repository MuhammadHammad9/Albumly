# Albumly

A music-discovery and discography-management app: search an artist, explore every release, inspect albums and tracklists, and keep a personal album library.

Albumly is an independent project that uses the Spotify Web API. It is not affiliated with or endorsed by Spotify.

## Status

Phases 1 to 3 are done: search, artist pages with a sortable, filterable release explorer (grid, list and timeline), and album pages with track search. They run on live Spotify data (`CATALOG_PROVIDER=spotify` in `server/.env`) or on a fictional demo catalogue (`mock`, no Spotify account needed).

- Product spec and roadmap: [docs/PRD.md](docs/PRD.md)
- What Phase 1 built and why: [docs/phase-1-concepts.md](docs/phase-1-concepts.md)
- What Phase 2 built, and what Spotify allows: [docs/phase-2-concepts.md](docs/phase-2-concepts.md)
- What Phase 3 built and why: [docs/phase-3-concepts.md](docs/phase-3-concepts.md)

## Structure

- `client/` — React app (Vite)
- `server/` — Express API; the only place Spotify credentials ever live
- `docs/` — product and technical documentation

## Getting started

Requires Node.js 20.19+.

```bash
npm run install:all
```

```bash
npm run dev
```

The client runs on http://localhost:5173 and the API on http://localhost:5000 (check http://localhost:5000/api/health). In development the client proxies `/api/*` to the server.

Copy `server/.env.example` to `server/.env` to change settings. The demo catalogue needs no Spotify credentials. For live data, fill in the Spotify settings, set `CATALOG_PROVIDER=spotify`, and run `npm run spike` in `server/` to check your app works.

## Accounts setup (optional)

Without these settings, Albumly runs without accounts and keeps the library in the browser. To turn accounts on, create a free Supabase project by following the steps in `docs/plans/phase-5-plan.md` §10. Then fill in:

| File | Variables |
| --- | --- |
| `server/.env` (git-ignored) | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (secret), `DATABASE_URL` (secret), `DATABASE_SSL_CA` |
| `client/.env.local` (git-ignored; public values only) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

Then run `npm run db:migrate --prefix server` to create the tables, and `npm run live-check --prefix server` for an end-to-end check with two throwaway accounts that are deleted afterwards. How it works: `docs/phase-5-concepts.md`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start client and server together |
| `npm test` | Run server and client tests |
| `npm run lint` | Lint the client |
| `npm run build` | Production build of the client |

## Author

- **Muhammad Hammad** (<muhammad.hammad.03115@gmail.com>)

