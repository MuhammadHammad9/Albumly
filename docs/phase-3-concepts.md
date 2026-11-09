# Phase 3 — the release explorer (built on the demo catalogue)

Phase 3 was built before Phase 2 because none of it depends on Spotify: it works on whatever the catalogue provider returns. When the Spotify provider arrives, these features need no changes.

## What was added

| Feature | Where to look |
| --- | --- |
| Sort, title filter, year range | `client/src/utils/releases.js`, `client/src/components/albums/DiscographyToolbar.jsx` |
| Grid, list and timeline views | `Discography.jsx`, `ReleaseList.jsx`, `client/src/components/artists/Timeline.jsx` |
| Track search on albums | `Tracks` in `client/src/pages/Album.jsx` |
| Copy Spotify link, native share | `client/src/components/albums/AlbumActions.jsx` |
| Recent searches, recently explored | `client/src/services/recents.js`, `client/src/hooks/useRecents.js` |
| Pages loaded on demand | `client/src/router.jsx` |
| Crash safety net | `client/src/pages/RouteError.jsx` |

## Ideas worth understanding

**Derived data, not stored data.** The discography is fetched once. What you see is computed on every render as `tab → filter → sort → view`. Nothing filtered or sorted is kept in state, so it can never fall out of step with the controls.

**The URL is the state.** Tab, filter text, years, sort and view all live in the query string (`?tab=album&sort=oldest&view=timeline`). Refresh, Back and copy-pasting the link all reproduce the same view for free. Defaults are left out to keep links short, and unknown values are ignored rather than trusted.

**Controlled components.** `DiscographyToolbar` owns no state. It receives the current values and reports changes through one `onChange`. That makes it reusable and easy to reason about.

**A store outside React.** `recents.js` is a plain module with `subscribe` and `getSnapshot`. `useSyncExternalStore` connects it to React, so the home page and the search box both update the moment a search or artist is recorded. This is the same idea Zustand is built on, which Phase 4 uses for the library.

**Never trust localStorage.** It can be missing, full, or contain anything. `recents.js` validates what it loads and keeps working (just without remembering) when saving fails.

**Stable sorting.** Every comparator has a tie-breaker, so two releases with the same date always appear in the same order.

**Code splitting.** Each page except Home is a separate JavaScript file fetched on first visit. `npm run build` lists the resulting chunks.

**Resetting state with `key`.** `<Discography key={id} />` and `<Tracks key={album.id} />` tell React to start fresh when the artist or album changes, instead of carrying over the previous one's filter text.

## Try these

- Neon Harbor → switch between the three views; pick a year range; type `glass` in the filter.
- Copy the URL of a filtered view into a new tab: the same view appears.
- Open *Afterimage* and type `kite` in "Find a track".
- Visit a few artists, then go Home: they appear under "Recently explored". Click the empty search box: recent searches appear.

## Discography explorer, part 2: lazy groups, editions and the completeness report

Added once real Spotify data arrived (PRD M3-6 and M3-7, plus the lever from Phase 2's "Not done yet").

| Feature | Where to look |
| --- | --- |
| Compilations and guest appearances loaded on demand | `server/src/services/catalog/discographyService.js`, `getDiscography` / `getDiscographyGroup` in both providers, `useDiscographyGroups` in `client/src/hooks/catalog.js` |
| Merging whole groups into the page | `mergeDiscography` in `client/src/utils/discography.js` |
| Edition grouping | `client/src/utils/editions.js`, `Editions.jsx`, `ReleaseGrid.jsx` |
| Completeness report | `client/src/components/artists/CompletenessReport.jsx` |

### Lazy release groups

An artist page used to fetch all four release groups in full. Guest appearances and compilations are the costly part (one artist appeared on hundreds) and the least visited. Now:

- `GET /api/artists/:id/discography` returns albums and singles in full, but only **page one** of compilations and guest appearances. Page one already carries Spotify's total, so the tabs can still say "Appears On 120".
- `GET /api/artists/:id/discography/:group` returns one whole group. The page asks for it when you open that tab (or follow a link with `?tab=appears_on`), or press **Load all** / **Load the rest**.
- The **All** tab never fetches on its own. It is the tab every visit starts on, so loading there would bring the full cost straight back. It says what is missing instead ("Includes the first 10 of 57 compilations…").

**Caching pieces, not whole answers.** The server caches each group separately (`discography:{id}:{group}`, plus `…:first` for a page one). That has three benefits: opening a tab reuses the cached page one, so it costs only the pages after it; once anyone has opened a tab, every later summary includes the whole group for free; and when one group fails, the ones that worked stay cached, so a retry only fetches what is missing.

**Merging on the client.** When a whole group arrives, `mergeDiscography` walks the groups in priority order (album, single, compilation, appears_on) and keeps each release once with a `Map`, which is the same rule the server uses. Because it always starts again from the beginning, the result is the same whichever group finished loading first. Tab counts use Spotify's reported total until a group is complete, so a count can drop slightly once duplicates are removed.

**Disabled but still watching.** Each whole group is a TanStack query that is only *enabled* when wanted. A disabled query still returns data it already has, so a group loaded on its own tab stays loaded when you go back to All.

### Edition grouping

"Glass Arcade" and "Glass Arcade (Deluxe Edition)" are one record released twice. The explorer stacks them under one card with a "+1 edition" button. The **Group editions** toggle turns this off (`?editions=separate`).

**Normalising titles.** `normalizeTitle` lowercases, removes accents, and strips brackets or " - …" endings that contain edition words (deluxe, remastered, anniversary, edition…). "Remixes" and "Live" are not edition words: those are different recordings.

**Levenshtein distance** is the fewest single-letter edits that turn one string into another ("kitten" → "sitting" is 3). It is computed with dynamic programming, filling a table row by row, keeping only two rows in memory. Title similarity is `1 − distance / longer length`.

**The similarity score** (from the PRD): `S = 0.4N + 0.3A + 0.2D + 0.1T`, where N is title similarity, A the share of artists in common, D how close the dates are (0 after ten years) and T how close the track counts are. Two releases count as editions when **S ≥ 0.75**, the titles are nearly identical (**N ≥ 0.9**) and any numbers in them match. The extra checks exist because the score alone would happily stack "Night Ferry II" or "Vol. 2" under "Night Ferry" or "Vol. 1".

**Union-find** (disjoint sets) joins matching pairs into groups. Every release starts as its own group; joining two means pointing one group's leader at the other's. A base album, its deluxe and its anniversary edition end up together even if only neighbouring pairs match. The original (the earliest release) becomes the card; the rest are listed under it.

**Filter first, then group.** If a filter matches only the deluxe edition, it appears on its own. Editions are never hidden for good.

### The completeness report

A collapsed "About this discography" panel at the bottom of the explorer (a native `<details>` element, so it opens with mouse or keyboard without any JavaScript). Per group it shows how many releases were loaded against how many the catalogue reports, and whether the group is complete, only on its first page, or stopped at the page limit. It also lists duplicates removed, alternate editions detected, and when the data was fetched (the *oldest* piece, so it never claims to be fresher than it is). The demo catalogue sends the same report, so the panel works without Spotify.

### Try these (demo catalogue)

- **Cass Marlowe** → Appears On says 13 although only 10 arrived; open the tab and the other 3 load. Open the report panel before and after.
- **Driftwood Recordings** → Compilations: Vol. 1 to Vol. 12 stay separate, but Vol. 3 and its Expanded Edition stack together.
- **Neon Harbor** → "Glass Arcade" shows "+1 edition"; turn off **Group editions** and the deluxe edition gets its own card again.

## Deferred from the original Phase 3 plan

- **Automated browser tests (Playwright)** and the **first deployment** wait until real Spotify data is in.
- **"Most explored" on the home page** needs server-side counting, which arrives with the database.
