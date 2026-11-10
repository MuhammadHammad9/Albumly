# Demo video script

_Draft for Phases 1–4 on the demo catalogue. Target length: 2½–3 minutes. Part B adds accounts, recommendations, insights and community._

**Setup before recording**
- Run `npm run dev:demo` (demo catalogue; no Spotify, so nothing can be rate-limited mid-take).
- Use a fresh browser profile, or clear site data, so the library starts empty.
- Window 1440×900, browser zoom 100 %, dark OS theme. Hide bookmarks and extensions.
- Have a second window ready at mobile size (or dev tools device mode at 390 px).

| Time | On screen | Narration (say roughly this) |
| --- | --- | --- |
| 0:00 | Home page, slowly scroll the featured artists | "This is Albumly: a music discovery app for people who want an artist's *whole* discography in one place. It's built on the Spotify Web API. Today I'm running it on its built-in demo catalogue, the same code path that keeps the live demo working if Spotify access ever breaks." |
| 0:15 | Click the search box, type `neon`, arrow down, Enter | "Search suggests artists as you type. It's debounced, cancels stale requests, and is fully keyboard-accessible as a proper ARIA combobox." |
| 0:25 | Artist page: switch tabs All → Albums → EPs | "Every release, split into albums, singles, EPs, compilations and guest appearances. Spotify doesn't label EPs any more, so Albumly infers them and says so." |
| 0:40 | Type `glass` in the filter, pick a year range, switch Grid → List → Timeline | "Filtering, sorting and the three views all run in the browser on data that's already loaded: zero extra API calls. Everything is in the URL, so this exact view survives a refresh or can be shared." |
| 0:55 | Clear filters, Albums tab, press "+1 edition" under Glass Arcade | "Deluxe and remastered editions are stacked under the original. It's a similarity score on normalised titles, artists, dates and track counts, plus union-find to build the groups." |
| 1:05 | Open "About this discography" | "The completeness report shows what was loaded per group. On real Spotify data, compilations and guest appearances load lazily because Spotify only allows about a hundred discography pages a day." |
| 1:15 | Open Glass Arcade | "Album pages compute the total running time, group tracks by disc, and link every track back to Spotify." |
| 1:25 | In "Your library": Save, choose Listened, rating 8, add tag `late night`, create collection "Night drives" | "The personal library lives in the browser for now: statuses, ratings, tags, notes and collections. It's a Zustand store over a repository, so swapping in cloud sync later doesn't touch the UI." |
| 1:45 | Library → reload → still there; open the collection, press Move down | "It survives reloads and is validated against a versioned schema on load. Collections can be reordered by drag, keyboard or buttons." |
| 2:00 | Back up or restore → Export JSON; import a file with rating 42 | "Export and import are strict. A broken file changes nothing and the report names the exact field." |
| 2:15 | Glass Arcade → Add to compare → Afterimage → Compare with Glass Arcade | "Compare puts two albums side by side: the deltas in an accessible table, and track lengths in a chart that only downloads on this page." |
| 2:30 | Search `neon harbor 2015 album` | "The search box understands structured queries: a tokenizer and parser turn this into artist text, a year and a type." |
| 2:40 | Switch to the mobile window: bottom navigation | "It's responsive, with a bottom bar on phones." |
| 2:45 | Terminal: `npm run test:e2e` summary, then back to the app | "It's tested at every level: unit tests on the pure logic, Spotify behaviour against a fake, and a Playwright suite that drives the real app in Chromium on the demo catalogue." |
| 2:55 | Footer | "Albumly is an independent project, not affiliated with Spotify. Thanks for watching." |

**Fallbacks while recording**
- If a lazy chunk is slow on first open, cut; the second take loads from cache.
- Never record against live Spotify: a 429 or 24-hour block mid-take would end the session.
- To show an error state on purpose, search `!error`.
