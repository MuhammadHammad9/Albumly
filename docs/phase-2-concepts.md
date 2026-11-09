# Phase 2: real Spotify data

Albumly can now read the live Spotify catalogue. Set `CATALOG_PROVIDER=spotify` in `server/.env` (with your app's client ID and secret) to use it, or `mock` to go back to the demo catalogue. The browser never talks to Spotify and never sees the secret: every request goes through the Albumly server.

## Spike findings (10 November 2026)

`npm run spike` (from `server/`) checks the live API with your credentials and writes `docs/spotify-spike-results.md`. The first run found:

| Artist | Releases | Albums | Singles | Compilations | Appears on | Spotify requests | Time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Radiohead | 59 | 15 | 30 | 0 | 14 | 8 | 1.0 s |
| Taylor Swift | 170 | 34 | 80 | 1 | 55 | 19 | 1.9 s |
| Daft Punk | 63 | 15 | 20 | 1 | 27 | 8 | 0.8 s |
| Arooj Aftab | 50 | 7 | 11 | 0 | 32 | 8 | 0.7 s |

What works: Client Credentials sign-in, artist and album search, artist details, album details with tracklists, artist discographies (paged 10 at a time, one release group per request), artist photos and album covers, and all six featured artist IDs.

What Spotify no longer provides to new apps:

- **Genres, popularity and followers** come back empty or missing. The genre badges simply do not appear.
- **New releases, top tracks and related artists** are forbidden (403). Albumly does not use them; the home page uses a hand-picked list of artists in `server/src/data/featured.js` instead.

### The important limit

Partway through the first run, Spotify blocked the **artist-albums endpoint** (the one discographies are built from) for **24 hours** (`Retry-After: 86280`). That was after roughly 100 successful requests to it in a few minutes, most of them for Nusrat Fateh Ali Khan, who appears on hundreds of compilations. Search, artist and album lookups kept working throughout.

Spotify does not publish the exact allowance, so treat about 100 discography pages a day as the working assumption until there is evidence otherwise. At 8 to 20 pages per artist, that is roughly 5 to 12 new discographies a day. That is fine for building and demonstrating Albumly, but not for many people at once. Spotify's extended quota is only open to registered businesses.

## How the server copes

| Problem | What Albumly does | Where |
| --- | --- | --- |
| Tokens expire hourly | Renews a minute early; simultaneous requests share one renewal | `services/spotify/tokenService.js` |
| Short rate limits (429) | Waits as long as Spotify asks (up to 30 s), then retries | `services/spotify/spotifyClient.js` |
| Long rate limits | Remembers the block **per endpoint** and refuses further requests to it without contacting Spotify; other endpoints carry on | same |
| Restarts forgetting the block | Saves blocks to `server/.cache/spotify-blocks.json` | `providers/index.js` |
| Spotify or network failures (5xx) | Retries 3 times, waiting 0.5 s, 1 s, 2 s plus a little randomness | `spotifyClient.js` |
| Floods of parallel requests | At most 4 Spotify requests at once; identical requests share one call | `spotifyClient.js` |
| Repeat lookups | Cached: search 10 minutes, artists 1 day, discographies and albums 7 days | `providers/spotifyProvider.js` |
| Restarts emptying the cache | The cache is saved to `server/.cache/spotify-cache.json` | `services/cache/fileStorage.js` |
| Huge discographies | Page caps (30 album, 30 single, 5 compilation and 10 guest-appearance pages); the app says when a list was cut short | `services/catalog/discographyService.js` |
| Malformed IDs | Rejected before any Spotify request is made | `spotifyProvider.js` |

When Spotify has paused access, the page says so in plain words and estimates when to try again. It hides "Try again" when retrying cannot help yet.

`GET /api/health` shows cache hits, Spotify request counts, latency and any endpoints currently blocked, with how many seconds remain.

## Ideas worth understanding

**Adapter pattern.** `mockProvider` and `spotifyProvider` have the same methods and return the same shapes, so not one route or React component changed when real data arrived. `normalize.js` is where Spotify's format is translated into Albumly's.

**Cache-aside with request coalescing.** `cache.getOrLoad(key, ttl, load)` checks the cache first and loads on a miss. If ten requests miss the same key at once, they all wait on one load instead of making ten Spotify calls.

**LRU eviction in O(1).** A JavaScript `Map` remembers insertion order. Re-inserting an entry on every read keeps the least recently used entry first, so evicting it is instant.

**Concurrency limiting.** A counter and a waiting line: a request runs if fewer than 4 are active, and otherwise waits for a finished request to hand over its slot.

**Exponential backoff with jitter.** Waiting longer after each failure gives Spotify room to recover. The randomness stops many retries from arriving at the same instant.

**Atomic file writes.** The cache is written to a temporary file and then renamed, so a crash can never leave a half-written cache behind.

**Testing without the network.** `services/spotify/fakeSpotify.js` is a stand-in for `fetch` that answers like Spotify. The tests cover rate limits, outages, expired tokens and paging without making a single real request.

## Not done yet

(Done since: guest appearances and compilations are now fetched only when their tab is opened. See "Lazy release groups" in `phase-3-concepts.md`.)

- **Choosing a market.** `SPOTIFY_MARKET` is empty, so the same album can appear once per regional release. Setting a two-letter country code removes those duplicates but hides releases unavailable there.
