# Phase 4 plan (Agent B): local library, compare, advanced search

Scope: PRD Phase 4 minus edition grouping and the completeness report (Agent A). Requirements covered: M4-4, M5-1..3, M6-1..4, M7-1.
Nothing here calls live Spotify. All tests use the mock provider, the fake fetch or an in-memory repository.

---

## 1. Packages (client only)

| Package | Version | Why |
| --- | --- | --- |
| `zustand` | `5.0.16` (22 Oct 2026; 5.1.0 is only 4 days old) | Library store (PRD §6 names it). About 1 KB. |
| `zod` | `4.6.7` (12 Oct 2026) | Validates the saved library on load and import files, and produces the error report. |
| `recharts` | `3.10.1` (25 Jul 2026) | Compare chart. Only loaded on the lazy Compare route, so the first page load does not grow. |
| `react-is` | `19.3.1` (14 Oct 2026) | Peer dependency of recharts. It must match React 19.3.1, but only 17.0.2 is installed (pulled in by testing tools). |
| `@dnd-kit/core` | `6.3.1` | Drag-and-drop with built-in pointer, touch and **keyboard** sensors, plus screen-reader announcements. |
| `@dnd-kit/sortable` | `10.0.0` | Sortable-list preset on top of core. |
| `@dnd-kit/utilities` | `3.2.2` | `CSS.Transform` helper for the dragged row. |

All are pinned exactly (`--save-exact`). The total on disk is a few MB, mostly recharts and its d3 pieces.
Fallback if dnd-kit is rejected: native HTML5 drag for the mouse, plus the Move up/down buttons below for the keyboard. There would be no touch dragging.

## 2. Library data model (localStorage, versioned)

Key `albumly:library`. The payload carries its own version so migrations can run:

```js
{
  version: 1,
  entries: {                       // keyed by album id; an album is "in the library" iff it has an entry
    [albumId]: {
      album: { id, name, artists:[{id,name}], albumType, inferredType, releaseDate, precision, year,
               totalTracks, coverUrl, spotifyUrl, totalDurationMs|null },   // snapshot: renders with no network
      status: 'favourite'|'want'|'listening'|'listened'|null,
      rating: 1..10|null, review: '', notes: '', tags: ['lowercase', ...],
      addedAt: ISO, updatedAt: ISO,
    },
  },
  collections: [ { id, name, description, albumIds: [ordered], createdAt, updatedAt } ],
}
```

- This mirrors PRD §6.2 (`library_entries`, `collections`, `collection_albums.position` = array index), so Phase 5's upload is a straight mapping.
- Rules: adding an album to a collection also saves it. Removing an album from the library also removes it from every collection, after a `confirm()` if it has data worth losing (rating, review, notes, tags or collections).
- Limits enforced by the schema: rating is a whole number from 1 to 10. Review and notes are at most 5000 characters. Tags are trimmed, lowercase, unique, at most 30 characters each and 20 per album. A collection name is 1–60 characters, unique regardless of case.
- **Migrations**: `migrate(raw, migrations = MIGRATIONS)` runs `MIGRATIONS[n]` (n → n+1) until it reaches `LIBRARY_VERSION`.
  - Data with no version or an unknown version is rejected.
  - Data from a newer Albumly is rejected with a clear message.
  - Today the version is 1 and the list is empty. The mechanism is unit-tested with injected sample migrations (1→2→3 chain, missing step, future version). The concepts doc explains when to add a real one.
- **Loading is forgiving; importing is strict.**
  - On load, a document that fails validation is salvaged item by item: bad entries or collections are dropped and dangling collection ids are removed. The raw original is copied to `albumly:library:backup` first, so nothing is silently destroyed.
  - Missing, blocked or full storage means the app still works for the current visit, the same way `recents.js` behaves.

## 3. Repository and store

- `services/library/localRepository.js` exposes `{ load(), save(data), subscribe(onExternalChange) }`.
  - `subscribe` uses the `storage` event, so a change in another tab shows up here.
  - This is the `libraryRepository` interface from PRD §6. Phase 5 adds `apiRepository` with the same three methods.
- `stores/libraryStore.js` provides `createLibraryStore(repository)` (a factory, so tests use an in-memory repository) and the app instance `useLibraryStore`.
  - The store subscribes to itself and calls `repository.save()` after each change.
  - Actions:
    - Albums: `saveAlbum(album)`, `removeAlbum(id)`, `refreshSnapshot(album)`, which updates a saved album's details when its page is viewed (no extra request).
    - Entry details: `setStatus`, `setRating`, `setReview`, `setNotes`, `addTag`, `removeTag`.
    - Collections: `createCollection(name)` returns `{ok, id}` or `{ok:false, error:'duplicate_name'}`. Also `renameCollection`, `deleteCollection`, and `addToCollection(collectionId, album)`, which returns `{ok:false, error:'already_in_collection'}` plus a `similar` warning. Also `removeFromCollection` and `moveInCollection(id, from, to)`.
    - Import: `importLibrary(data, mode)` returns a summary.
  - Components select narrow slices (`useLibraryStore(s => s.entries[id])`) and derive lists with `useMemo`. Returning a fresh array from a selector would cause render loops in zustand 5.
- **Duplicate detection** (pure, in `utils/library.js`):
  - The same album id in a collection is blocked.
  - A **probable duplicate** is flagged with a warning but still allowed: same primary artist plus the same normalized title, after lowercasing and stripping `(Deluxe…)`, `- Remastered…` and punctuation, e.g. *Glass Arcade* vs *Glass Arcade (Deluxe Edition)*.
  - Duplicate collection names are blocked.
  - I write a small `normalizeTitle` myself rather than importing Agent A's in-progress `utils/editions.js`.

## 4. Export / import

`services/library/transfer.js`:
- **Export JSON**: the full payload plus `exportedAt` and `app: 'albumly'`, downloaded through a Blob link. It is built in the browser; no server is involved.
- **Export CSV**: one row per saved album.
  - Columns: `album_id, title, artists, year, type, status, rating, tags, collections, review, notes, added_at, spotify_url`.
  - Fields are quoted per RFC 4180. Cells starting with `= + - @` get a leading `'` so spreadsheet apps do not run them as formulas.
  - CSV is export-only, because it cannot carry collection order.
- **Import JSON**:
  - Steps: `JSON.parse` → version check and `migrate` → zod `safeParse` → referential check (collection ids must exist in entries).
  - The result is either `{ ok: true, data, counts }` or `{ ok: false, errors: [{ path: 'entries.abc.rating', message: 'Must be between 1 and 10' }, …] }`. The UI shows the first 10 errors and "and N more".
  - All-or-nothing: an invalid file imports nothing.
  - **Merge (default):**
    - Entries and collections are matched by id, and the newer `updatedAt` wins. This is the same conflict rule Phase 5's cloud sync uses.
    - A collection with a new id but an existing name merges its album lists: existing order kept, new albums appended.
    - Importing the same file twice changes nothing.
    - A summary is shown: "Added 12 albums, updated 3, 2 new collections".
  - **Replace** overwrites everything, after an explicit confirm. It is suggested for restoring a backup onto a fresh browser.

## 5. Library UI

- `pages/Library.jsx` replaces the placeholder. It has a header with counts, an Export/Import panel, and tabs **Albums | Collections** (`?view=collections`).
  - **Albums tab** filters: text, artist, year from/to, status, tag. Sort options: recently added, title A–Z, artist A–Z, newest, oldest, highest rated.
    - Everything is kept in the URL, like the explorer.
    - Cards render from snapshots, with a status and rating line ("Listened · 8/10").
  - **Collections tab**: a list with album count and first cover, plus a "New collection" form with a duplicate-name error.
  - Empty states: an empty library, and a filter that matches nothing.
- `pages/Collection.jsx` (**new page**, route `/library/collections/:id`):
  - Inline rename and delete (with confirm).
  - A sortable list using dnd-kit with pointer, touch and keyboard sensors (Space to lift, arrows to move, Space to drop, with announcements).
  - Each row also has explicit **Move up / Move down** buttons and a Remove button. These are easy to discover and easy to test in jsdom.
  - An unknown collection id shows NotFound.
- Album page (`pages/Album.jsx`) gets `components/library/LibraryPanel.jsx`:
  - Save / Remove button.
  - Status as a radio group of 4 (Favourite, Want to listen, Listening, Listened, plus clear).
  - Rating 1–10 as native radios styled as pills, plus "No rating".
  - Tag input: Enter adds, chips have remove buttons, and a `<datalist>` suggests existing tags.
  - Review and notes textareas, saved on blur with a "Saved" status.
  - "Add to collection" checklist with an inline "New collection" field and duplicate warnings.
  - The album snapshot is refreshed on view.
  - If a saved album now 404s, the page renders its snapshot with an "Unavailable in the catalogue" badge and a Remove button (PRD §5 resilience).
- `components/library/SaveToggle.jsx`: a compact bookmark button with `aria-pressed` and the label "Save {album} to library".
  - It goes on **AlbumCard**, placed beside the title and **outside** the `<Link>` (no nested interactive elements, and the artwork is never overlaid, per Spotify rules).
  - Every grid using AlbumCard gets it, including Agent A's explorer grid and Home.
- Home: a small "Recently saved" row when the library is not empty.

## 6. Compare page (M7-1)

- Route `/compare?a=<id>&b=<id>`. The URL is the only source of truth. The page makes 2 `useAlbum` calls, which hit the existing caches (server album cache is 7 days).
- Slots A and B:
  - Each is picked from a library `<select>` (grouped by artist), or filled through **Add to compare**.
  - Swap and Clear buttons.
  - An invalid or unknown id shows an error in that slot only.
- **Add to compare** (Album page button): a tiny in-memory `stores/compareStore.js` remembers the last half-filled comparison.
  - If slot A is waiting, the button links to `/compare?a=<waiting>&b=<this>`. Otherwise it links to `/compare?a=<this>`.
  - The compare page tells the user to "open any album and press Add to compare, or pick from your library".
- `utils/compare.js` (pure, tested):
  - `albumStats(album)` returns year, track count, total duration, average track length, explicit-track count, disc count, featured-artist count (unique track artists who are not album artists) and tracks with features.
  - `compareAlbums(a, b)` returns rows `{ key, label, a, b, delta, better? }`. Delta is B − A, formatted per unit ("+3 tracks", "−4 min").
- `components/compare/CompareTable.jsx` is a semantic table with deltas. `CompareChart.jsx` is a Recharts chart, loaded only on this route.
  - Planned chart: **track lengths by position** (x = track number, y = minutes, one series per album). It uses a single unit; a bar chart mixing minutes and counts would mislead.
  - Colours: `--accent` and `--accent-secondary`.
  - It includes a text summary, and the table holds the same numbers, so screen-reader users lose nothing.
  - jsdom tests cover the table and maths, not the SVG.
- Nav: add **Compare** to `navItems.js` (sidebar and bottom bar, 4 items).

## 7. Advanced search (M5)

### Server (small, targeted edits)
- `/search` route:
  - Accepts `type=artist|album|track`, plus optional `artist` (at most 100 characters), `yearFrom` and `yearTo` (whole numbers 1900–2100, swapped if reversed).
  - The filters only apply to album and track searches. The response echoes `filters`.
- `spotifyProvider`:
  - `search()` builds the Spotify `q` with field filters, e.g. `the weeknd artist:"Name" year:2020` or `year:2015-2020`.
  - It adds `searchTracks`, whose items are `Track` plus `album: { id, name, coverUrl, releaseDate, year }`, built with the existing `normalizeTrack` and `normalizeRelease`. `normalize.js` itself is not edited.
  - It is still **one Spotify request per page**, and the cache key is the built query, cached 10 minutes.
  - `buildSearchQuery` is exported and tested.
- `mockProvider`:
  - Adds `searchTracks`, which flattens album tracks and adds the album reference.
  - Album and track search now match every query word against the title **or artist names**, like Spotify's free text. Title-prefix matches still rank first, so the existing "glass arcade" test keeps passing.
  - Adds the year and artist filters. `!error` still simulates a failure.
- No `mockCatalog.js` change is needed (albums already contain tracks).
- Tests:
  - Route: `type=track`, filters, and bad years or type → 400.
  - Mock: title and artist matching, year filter.
  - Spotify: track normalization, the field-filter query string, cache hit, one request per page.

### Client
- `utils/queryParser.js` is a pure tokenizer plus parser:
  - Quoted phrases stay together.
  - `1900–2099` → year. `2015-2020` or `2015..2020` → year range.
  - `album(s)`, `single(s)`, `ep(s)` and `compilation(s)` → albums tab plus that type. `track(s)` or `song(s)` → tracks tab. `artist(s)` → artists tab.
  - `artist:"x"`, `year:`, `type:` field syntax is supported. `… by <name>` → artist.
  - Everything else is the free text.
  - `"the weeknd 2020 album"` → `{ text: 'the weeknd', yearFrom: 2020, yearTo: 2020, tab: 'album', albumType: 'album' }`.
  - The same module provides `toSearchRequest(parsed)`. If the text is empty but an artist is set, the artist becomes the text.
  - Also `explode(q)`, which turns parsed tokens into explicit URL params when the user edits a filter, so the filters panel and the text never disagree.
- `hooks/search.js` has `useCatalogSearch({ type, q, artist, yearFrom, yearTo })`, an infinite query with `staleTime: 10 min` to match the server cache. In `hooks/catalog.js` only `useArtistSearch` changes, to delegate to it, so the search box and the Search page share one cache entry instead of making duplicate requests.
- `pages/Search.jsx` is rebuilt:
  - Tabs: Artists, Albums, Tracks.
  - `components/search/SearchFilters.jsx` covers year from/to, artist, release type, minimum track count and order. Artist is applied on Enter or blur, not per keystroke.
  - `ParsedQuery.jsx` shows chips explaining how the text was understood.
  - `TrackResults.jsx` shows each track with a cover thumbnail, the album link, duration, an explicit badge and a Spotify link.
  - Album results reuse AlbumGrid.
  - The URL holds `q, tab, from, to, artist, kind, min, sort`.
- **Request cost**:
  - Year and artist go to the server (they change the result set).
  - Type, minimum tracks and order are applied **client-side to the loaded pages**, at zero cost; Spotify has no such search filters. A note says so when more pages exist.
  - Year is also filtered client-side as a safety net, because the spike could not confirm Spotify still honours `year:`.
- `SearchBar`:
  - The placeholder becomes "Search artists, albums, tracks".
  - Artist suggestions are only fetched when the parsed query has no year or type tokens, so a structured query costs no suggestion request. "See all results" still works.

## 8. Tests (Vitest; no Playwright)

| Area | File |
| --- | --- |
| Schema, validation, migrations | `services/library/schema.test.js` |
| Repository: round-trip, corrupt → salvage + backup, storage failure, other-tab event | `services/library/localRepository.test.js` |
| Export CSV escaping / injection guard, import error report, merge vs replace | `services/library/transfer.test.js` |
| Store actions + persistence through a memory repository | `stores/libraryStore.test.js` |
| Library filters/sort, normalizeTitle, duplicates, move | `utils/library.test.js` |
| Query parser + toSearchRequest + explode | `utils/queryParser.test.js` |
| Compare maths | `utils/compare.test.js` |
| Components: SaveToggle on AlbumCard (update existing test), LibraryPanel status/rating/tags, Collection Move up/down + duplicate name, Import error report, CompareTable, SearchFilters/tabs | `*.test.jsx` next to each |
| Server: route, mock and Spotify search | `app.test.js`, `spotifyProvider.test.js` |

Finish with root `npm test`, `npm run lint` (0 warnings), `npm run build`. Also check that the initial JS chunk stays well under 200 KB gzip and recharts lands only in the Compare chunk.

## 9. Files

**Create (client)**
- `src/services/library/schema.js`, `localRepository.js`, `transfer.js` (+ 3 tests)
- `src/stores/libraryStore.js` (+ test), `src/stores/compareStore.js`
- `src/utils/library.js`, `src/utils/queryParser.js`, `src/utils/compare.js` (+ 3 tests). These are new files; Agent A's utils are untouched.
- `src/hooks/search.js`, `src/hooks/useLibrary.js` (thin selectors)
- `src/components/library/`: `SaveToggle.jsx`, `LibraryPanel.jsx`, `StatusPicker.jsx`, `RatingPicker.jsx`, `TagInput.jsx`, `CollectionPicker.jsx`, `LibraryFilters.jsx`, `CollectionList.jsx`, `SortableAlbumList.jsx`, `ImportExport.jsx`, `library.module.css`, tests
- `src/components/compare/`: `ComparePicker.jsx`, `CompareTable.jsx`, `CompareChart.jsx`, `AddToCompare.jsx`, `compare.module.css`, tests
- `src/components/search/`: `SearchFilters.jsx`, `ParsedQuery.jsx`, `TrackResults.jsx`, `search.module.css`, tests
- `src/pages/Compare.jsx`, `src/pages/Collection.jsx` (new page; flagged for approval)

**Modify (client)**
- `src/pages/Library.jsx` (replace), `Search.jsx`, `Album.jsx`, `Home.jsx`, `src/router.jsx` (routes `compare`, `library/collections/:id`)
- `src/components/albums/AlbumCard.jsx` (+ its test), `AlbumGrid.jsx` (pass-through `note`), `AlbumActions.jsx` (Add to compare)
- `src/components/common/SearchBar.jsx` (and `SearchBar.module.css` if needed), `src/components/layout/navItems.js`
- `src/hooks/catalog.js` (only `useArtistSearch`)
- `src/pages/pages.module.css`, `src/components/common/common.module.css` (append only)
- `client/package.json`, `client/package-lock.json`
- `TrackList.jsx`: no change planned.

**Modify (server)**: `routes/catalogRoutes.js` (`/search` handler only), `providers/mockProvider.js` (`search*` + matcher), `providers/spotifyProvider.js` (`search`, `searchTracks`, `buildSearchQuery`), `app.test.js`, `providers/spotifyProvider.test.js`.

**Docs**: this plan, `docs/phase-4-concepts.md`.

**Not touched**: everything listed as Agent A's, `README.md`, `server/.env`, git state.

## 10. Risks / notes

- **Spotify field filters are unverified** (the spike was rate-limited). The worst case is that a year or artist filter is ignored by Spotify. The client-side year filter keeps results correct, and the concepts doc notes it.
- **AlbumCard change shows up in Agent A's explorer grid.** That is intended, since the save toggle belongs on every album card. If their `ReleaseList` (list view) should also get a save button, that is a one-line `<SaveToggle album={release} />` I will describe rather than add.
- **Zod lands in the main bundle**, because the store loads at startup for the card toggles. That is acceptable (roughly 15–20 KB gzip) and will be checked with `npm run build`.
