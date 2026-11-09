# Phase 1 — what was built and the ideas behind it

Phase 1 delivers the whole Release 1 click-through (Home → search → artist → album) on a fictional catalogue, with no Spotify account needed. Read this alongside the code; each section names the file to open.

## How a request travels

1. You type in the search box (`client/src/components/common/SearchBar.jsx`).
2. `useDebounce` waits until you pause for 400 ms (`client/src/hooks/useDebounce.js`).
3. `useArtistSearch` asks TanStack Query for the data (`client/src/hooks/catalog.js`).
4. `apiGet` sends `GET /api/search?q=...` (`client/src/services/api.js`).
5. In development, Vite forwards `/api/*` to Express on port 5000 (`client/vite.config.js`).
6. The route validates the input and calls the catalogue provider (`server/src/routes/catalogRoutes.js`).
7. The mock provider answers from fixtures (`server/src/providers/mockProvider.js`).
8. JSON comes back, React renders cards.

## Server ideas

| Idea | Where | Why it matters |
| --- | --- | --- |
| Provider interface | `server/src/providers/` | Routes call `getProvider().searchArtists()` and never know the source. In Phase 2 a Spotify provider is added to the map and nothing else changes. |
| Normalized data shape | `server/src/data/mockCatalog.js` | The client only ever sees Albumly's own `Artist`, `Release` and `Track` shapes, never raw Spotify JSON. |
| One error format | `server/src/utils/errors.js`, `server/src/middleware/errorHandler.js` | Every failure is `{ error: { code, message } }` with the right HTTP status, so the client handles errors in one place. |
| Input validation | `intParam` in `catalogRoutes.js` | Never trust query parameters; reject bad input with a 400 before doing any work. |
| App vs server split | `server/src/app.js`, `server/src/server.js` | Tests import the app and start it on a random port, without touching port 5000. |
| EP inference | `server/src/services/catalog/classify.js` | Spotify has no "EP" type. A single with 4 to 6 tracks is labelled EP, and the UI says it is inferred. |

## Client ideas

| Idea | Where | Why it matters |
| --- | --- | --- |
| Design tokens | `client/src/styles/variables.css` | Colours, spacing and radii are defined once as CSS variables. |
| CSS Modules | any `*.module.css` | Class names are scoped to the component that imports them, so styles cannot collide. |
| Mobile-first layout | `client/src/components/layout/layout.module.css` | Base styles are the phone layout; a single `min-width: 1024px` block adds the sidebar. |
| Nested routes | `client/src/router.jsx` | Every page renders inside `AppShell`'s `<Outlet />`, so navigation chrome is written once. |
| Server state vs UI state | `client/src/hooks/catalog.js` | Data from the API lives in TanStack Query (cached, de-duplicated, cancellable). Only local things like "is the dropdown open" use `useState`. |
| State in the URL | `Search.jsx` (`?q=`), `Artist.jsx` (`?tab=`) | The Back button, refresh and shared links all work without extra code. |
| Debouncing | `useDebounce.js` | Six keystrokes become one request. |
| Accessible combobox | `SearchBar.jsx` | Focus stays in the input; arrow keys move `aria-activedescendant`; Enter chooses; Escape closes. |
| Four states per page | `Feedback.jsx` and every page | Loading skeleton, empty, error with retry, and success are all designed, not only the happy path. |
| Pure utilities | `client/src/utils/` | Formatting and tab-sorting logic has no React in it, which makes it trivial to test. |

## Try these

- Search `neon`: two similarly named artists, one with no image or genres.
- Search `!error`: the mock simulates the catalogue failing, to show the error state.
- Search `zzzz`: the no-results state.
- Open Neon Harbor → EPs tab: inferred EPs with the explanation note.
- Open the album *Afterimage*: two discs, guest artists, explicit badges, computed total duration.
- Visit `/artist/nobody`: the not-found state.
- Stop the server and reload: the "can't reach Albumly" state.

## Tests

`npm test` runs both suites: server route tests (`server/src/app.test.js`) and client tests for the debounce hook, formatters, tab logic and the album card.

## Known limits of this phase

- The catalogue is fictional; "Open on Spotify" links go to a Spotify search for the name.
- "Load more" on search only appears when a query has more than 10 matches, which the 14-artist mock catalogue never produces. The paging itself is covered by server tests.
- Sorting, year filters, timeline, track search and recent searches come in Phase 3; the library in Phase 4.
