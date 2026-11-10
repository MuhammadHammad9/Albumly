# Phase 4: your library, comparing albums, and smarter search

Albumly now remembers what you think of albums. It can also put two albums side by side, and it understands searches like `neon harbor 2015 album`. Everything in the library is stored in your browser; no account is needed yet. (Edition grouping and the completeness report, also part of Phase 4, were built separately.)

## What was added

| Feature | Where to look |
| --- | --- |
| Library data, its rules and its checks | `client/src/services/library/schema.js` |
| Saving to localStorage, repairing damaged data | `client/src/services/library/localRepository.js` |
| The library store (every action that changes it) | `client/src/stores/libraryStore.js`, `client/src/hooks/useLibrary.js` |
| Filters, sorting, duplicate detection | `client/src/utils/library.js` |
| Export JSON/CSV, import with an error report | `client/src/services/library/transfer.js`, `components/library/ImportExport.jsx` |
| Save button on every album card | `components/library/SaveToggle.jsx` |
| Status, rating, tags, notes, collections on the album page | `components/library/LibraryPanel.jsx` |
| Library page and collection page (drag to reorder) | `pages/Library.jsx`, `pages/Collection.jsx`, `components/library/SortableAlbumList.jsx` |
| Compare two albums | `pages/Compare.jsx`, `utils/compare.js`, `components/compare/` |
| Search tabs, filters and the query parser | `pages/Search.jsx`, `utils/queryParser.js`, `components/search/` |
| Track search on the server | `/search?type=track` in `server/src/routes/catalogRoutes.js` and both providers |

## Ideas worth understanding

**A store with actions (Zustand).** The library is one object (`entries` and `collections`) plus the functions that are allowed to change it: `saveAlbum`, `setRating`, `addToCollection`, and so on. Components never edit the data directly; they call an action. All the rules therefore live in one file, for example "collections only hold saved albums" and "no two collections share a name". Zustand is the same idea as the `recents.js` store from Phase 3, with less code.

**Selecting a small slice.** `useLibrary((state) => state.entries[id])` re-renders a component only when *that* album changes. If a selector returned a brand-new array every time, Zustand would think something changed on every render and loop forever. So `useEntries()` selects the stored object and builds the array with `useMemo`.

**The repository pattern.** The store does not know about localStorage. It is given a *repository* with three methods: `load`, `save` and `subscribe`. Today that is `localRepository`. When accounts arrive, an `apiRepository` with the same three methods replaces it, and no component changes. The tests use the same trick: they give the store a fake in-memory repository.

**Snapshots.** Spotify no longer lets an app fetch many albums in one request, so a library of 200 albums cannot be re-downloaded every visit. Instead, saving an album keeps a small copy of its details (title, artists, year, cover link). The library page renders from those copies with zero requests, and keeps working offline. When you open a saved album's page, the copy is quietly refreshed. If an album ever disappears from the catalogue, its page still shows the saved copy with an "unavailable" badge.

**Versioned data and migrations.** Saved data carries `version: 1`. One day the shape will change. When it does, the version is bumped and a *migration* is added: a function that turns version-1 data into version 2. `migrate()` runs every step in order, so data saved years ago still opens. The list of migrations is empty today. The mechanism is tested with sample steps, so it is ready when it is needed.

**Validation with zod.** The library's shape is written once as a zod *schema*. Examples: "rating is a whole number from 1 to 10", "a link must start with http", "every album in a collection must be saved". The same schema checks two things that cannot be trusted: what is in localStorage, and any file you import. The `http` rule is also a security rule. Without it, an imported file could set a link to `javascript:...` and run code when clicked.

**Forgiving load, strict import.** If localStorage holds damaged data, Albumly keeps every part that is still valid and drops the rest. It first copies the original to `albumly:library:backup`, so nothing is silently lost. An imported file is the opposite: if *anything* is wrong, nothing is imported, and you get a list of exactly what and where (`entries.abc.rating: Must be 1 to 10`). Half-importing a file would leave you unsure what you have.

**Merge or replace.** Import merges by default. Albums and collections are matched by id, and the copy edited more recently wins (each item records `updatedAt`). A new collection with the same name as one of yours is combined with it. Merging is safe to repeat: importing the same file twice changes nothing the second time. Replace is there for restoring a backup onto a fresh browser, and asks first. Cloud sync in Phase 5 will use the same "newest wins" rule.

**CSV safety.** A CSV cell that starts with `=` is run as a formula by spreadsheet apps, so an album titled `=HYPERLINK(...)` could do something nasty. The export puts a `'` in front of such cells. Values with commas, quotes or line breaks are wrapped in quotes, following the CSV standard.

**Confirm steps on the page, not pop-ups.** Removing an album that has a rating or notes, deleting a collection, and replacing the library all ask "are you sure?" in the page itself. Focus moves to Cancel, so a stray Enter cannot delete anything. Escape closes the question. A browser `confirm()` pop-up would freeze the page and cannot be styled.

**Drag and drop that works without a mouse.** The collection list uses dnd-kit. A mouse or finger drags the grip. A keyboard user focuses the grip, presses Space, moves with the arrow keys, and presses Space again. A screen reader announces "moved to position 3 of 8". There are also plain Move up / Move down buttons, because not everyone discovers dragging.

**A tokenizer and a parser.** Understanding `the weeknd 2020 album` happens in two steps:
1. *Tokenize*: split the text into pieces. Words, `"quoted phrases"` and `field:value` pairs each become one piece.
2. *Parse*: decide what each piece means. A four-digit year becomes a year filter, `album` becomes the release type, and `by` followed by words becomes the artist. Whatever is left is the text to search.

A year or type word on its own stays as text, because `1989` and `Singles` are real album titles. Quotes keep a year in the text: `taylor swift "1989"`. Both steps are pure functions, which makes them easy to test with dozens of examples.

**Filters that cost nothing vs filters that cost a request.** Spotify's search accepts `artist:` and `year:` inside the query, so those are sent to the server. The search still costs one request per page, and the result is cached for 10 minutes. Spotify cannot filter by release type or track count, or sort results. Albumly does those in the browser on the results already loaded, for free, and says so when more pages exist. The phase 2 spike could not confirm that Spotify still honours `year:`, so the browser also re-checks years as a safety net.

**One source of truth for two inputs.** A search's settings can come from the text you typed *or* from the filter controls. To stop them disagreeing, the first time you touch a filter, what the parser understood moves out of the text and into the URL (`?q=the weeknd&tab=album&from=2020&to=2020`). From then on the controls are in charge.

**Compare maths as pure functions.** `compareAlbums(a, b)` returns rows of numbers and differences ("+3 tracks", "−4 min", "6 years later"); the page only displays them. The chart shows track lengths in running order. It uses one unit on one axis, because a chart mixing minutes and counts would mislead. Its two colours were checked with a colour-blindness validator. The table holds every number too, so nobody depends on seeing the chart. Recharts is big, so it is only downloaded when you open the Compare page.

**The URL is still the state.** Library filters, the search tab and filters, and the two compared albums (`/compare?a=…&b=…`) all live in the URL. They survive refresh, work with Back, and can be shared.

## Try these

- On the home page, press the bookmark on a few album cards. Then open **Library**: they are there, and still there after a refresh.
- Open *Glass Arcade*. Set a status and a rating, add the tag `late night`, and create a collection "Night drives". Open the collection from the Library's Collections tab and reorder it with the arrow buttons, or by focusing the grip and pressing Space then the arrow keys.
- Open the Library's "Back up or restore" section and export JSON. Change a rating in the file to `42`, then import it: the error report names the exact field. Import the original file twice with Merge: the second time says "Nothing new".
- Search `neon harbor 2015 album`, then `mara voss singles`, then `glass arcade songs`. Notice the "Understood as" line and the tab it picks.
- On *Glass Arcade* press **Add to compare**, open *Afterimage*, and press **Compare with Glass Arcade**.

## Not done in this phase

- **Automated browser tests (Playwright)** are still deferred, because disk space is tight. The flows above were checked by hand against the demo catalogue, and the logic has unit and component tests.
- Collections themselves cannot be reordered yet (albums inside them can). Collection descriptions are stored but not yet editable.
