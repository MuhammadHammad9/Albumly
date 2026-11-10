# Albumly API

Every endpoint of the Albumly API: catalogue (Release 1), intelligence, accounts and library (Release 2), community and admin (Release 3).

- **Base URL:**
  - Development: `http://localhost:5000` (the Vite dev server proxies `/api/*` to it).
  - Production: `<API_URL>` (see `docs/deployment.md`).
- **Format:** JSON in, JSON out. Every response shape below is Albumly's own; raw Spotify JSON is never passed through.
- **IDs:** Spotify uses 22-character base62 ids. The demo catalogue uses readable slugs such as `neon-harbor` (artist) or `neon-harbor--glass-arcade` (album).

## Common behaviour

### Errors

Every error has the same shape:

```json
{ "error": { "code": "not_found", "message": "Album not found", "retryAfter": 3600 } }
```

`retryAfter` (seconds) appears only on rate limits, together with a `Retry-After` header.

| Status | `code` | When |
| --- | --- | --- |
| 400 | `bad_request` | Invalid query parameter, malformed id, or a body that is not valid JSON |
| 401 | `unauthorized` / `session_expired` | Account routes: missing, invalid or expired token |
| 403 | `forbidden` | Admin routes for a signed-in user who is not an admin |
| 404 | `not_found` | Unknown artist, album or route (also "someone else's" collection, never 403) |
| 409 | `duplicate_name` / `already_voted` | A collection with that name exists / a second vote in the same battle |
| 413 | `payload_too_large` | Body over 100 KB (5 MB for library import) |
| 429 | `rate_limited` | Albumly's own per-IP limit, **or** Spotify has paused Albumly (then `retryAfter` can be hours) |
| 502 | `upstream_error` | Spotify (or the demo catalogue's `!error` search) failed |
| 502 | `spotify_auth_failed` | The server's Spotify credentials were rejected |
| 503 | `accounts_unavailable` | Account routes when Supabase is not configured |
| 500 | `internal_error` | A bug. The message is generic and stack traces are never sent |

### Rate limits

- Per IP address: **300 requests per 5 minutes** across `/api`.
- Stricter, per IP per hour: `POST /api/library/import` **10**, `DELETE /api/me` **5**, `POST /api/battles` **20**, `POST /api/battles/:id/vote` **120**, `POST /api/reports` **20**.
- Responses carry `RateLimit` and `RateLimit-Policy` headers (IETF draft-8).

### Security headers

helmet's defaults on every response: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, and more. `X-Powered-By` is removed. CORS allows only the origins in `CLIENT_ORIGIN`.

### Shapes

```text
Artist  { id, name, imageUrl|null, genres: string[], spotifyUrl }
Release { id, name, albumType, inferredType, releaseDate, precision: 'year'|'month'|'day', year,
          totalTracks, artists: [{ id, name }], coverUrl|null, spotifyUrl, group }
Track   { id, name, discNumber, trackNumber, durationMs, explicit, artists: [{ id, name }], spotifyUrl }
```

- `group` is one of `album`, `single`, `compilation`, `appears_on`.
- `inferredType` is `album`, `single`, `ep` or `compilation`. `ep` is inferred by Albumly: a single with 4–6 tracks.
- Spotify no longer returns genres for new apps, so `genres` is usually `[]` with live data.

---

## Catalogue

### `GET /api/health`

Liveness check, plus which catalogue is active.

```json
{ "status": "ok", "provider": "mock" }
```

- In development, with the Spotify provider, it also includes `cache` (hits, misses, size) and `spotify` (requests, average latency, retries, 429s, and endpoints currently blocked with seconds remaining). In production (`NODE_ENV=production`) these are left out; admins see them on `/api/admin/metrics`.
- Requests that need Spotify can answer `429 rate_limited` with `retryAfter` when a visitor, or everyone together, has caused too many real Spotify requests in 10 minutes. Cached answers are not affected.
- `accounts: true` appears when accounts are configured.
- CORS preflight answers may be cached by browsers for 10 minutes (`Access-Control-Max-Age: 600`).

### `GET /api/search`

| Param | Required | Rules |
| --- | --- | --- |
| `q` | yes | 1–100 characters |
| `type` | no | `artist` (default), `album` or `track` |
| `offset` | no | whole number 0–1000, default 0 |
| `limit` | no | whole number 1–10, default 10 (Spotify's cap) |
| `artist` | no | album/track only; at most 100 characters; narrows by artist name |
| `yearFrom`, `yearTo` | no | album/track only; 1900–2100; a reversed range is swapped |

```json
GET /api/search?q=mara
{
  "type": "artist", "query": "mara", "filters": {},
  "items": [{ "id": "mara-voss", "name": "Mara Voss", "imageUrl": "/api/mock/art/mara-voss.svg",
              "genres": ["alt r&b", "neo soul"], "spotifyUrl": "https://open.spotify.com/search/Mara%20Voss" }],
  "total": 1, "offset": 0, "limit": 10
}
```

- Album results are `Release` items.
- Track results are `Track` items plus `album: { id, name, coverUrl, releaseDate, year }`.
- Spotify cost: one request per page, cached for 10 minutes.

### `GET /api/artists/:id`

Returns one `Artist`. Unknown id → 404. Cached for 1 day.

### `GET /api/artists/:id/discography`

The whole discography in one response:
- albums and singles in full
- **page one only** of compilations and guest appearances (`report.pending` names them)
- a completeness report

```json
GET /api/artists/cass-marlowe/discography
{
  "artistId": "cass-marlowe",
  "releases": [ /* Release[], newest first, de-duplicated */ ],
  "counts": { "album": 2, "single": 0, "compilation": 0, "appears_on": 10 },
  "total": 12,
  "report": {
    "source": "mock", "requests": 0, "fetchedAt": "2026-11-10T06:24:58.297Z",
    "duplicatesRemoved": 0, "truncated": [], "pending": ["appears_on"],
    "groups": {
      "album":      { "reported": 2,  "retrieved": 2,  "duplicates": 0, "complete": true,  "truncated": false, "requests": 0, "fetchedAt": "…" },
      "appears_on": { "reported": 13, "retrieved": 10, "duplicates": 0, "complete": false, "truncated": false, "requests": 0, "fetchedAt": "…" }
    }
  }
}
```

- Spotify cost on a cold cache: all album pages, all single pages, and 1 page each of compilations and guest appearances (10 releases per page).
- Each group is cached separately for 7 days.
- Huge groups stop at a page cap and are listed in `truncated`.

### `GET /api/artists/:id/discography/:group`

One whole group: `group` is `album`, `single`, `compilation` or `appears_on`. Any other value → 400.

```json
{ "artistId": "cass-marlowe", "group": "appears_on", "releases": [ /* 13 */ ],
  "reported": 13, "retrieved": 13, "complete": true, "truncated": false, "requests": 0, "fetchedAt": "…" }
```

### `GET /api/albums/:id`

One `Release` plus `tracks: Track[]` (every track, across all pages and discs) and `totalDurationMs`, computed by Albumly. Unknown id → 404. Cached for 7 days.

```json
GET /api/albums/mara-voss--small-hours
{ "id": "mara-voss--small-hours", "name": "Small Hours", "albumType": "single", "inferredType": "ep",
  "releaseDate": "2018-06-01", "precision": "day", "year": 2018, "totalTracks": 4, "group": "single",
  "artists": [{ "id": "mara-voss", "name": "Mara Voss" }], "coverUrl": "/api/mock/art/mara-voss--small-hours.svg",
  "spotifyUrl": "…", "totalDurationMs": 752000,
  "tracks": [{ "id": "mara-voss--small-hours--t1", "name": "Broken Daylight", "discNumber": 1, "trackNumber": 1,
               "durationMs": 170000, "explicit": false, "artists": [{ "id": "mara-voss", "name": "Mara Voss" }], "spotifyUrl": "…" }] }
```

### `GET /api/featured`

The home page's sections: `{ artists: Artist[], albums: Release[] }`.
- Spotify removed "new releases" and "browse", so the artists are an editorial list (`server/src/data/featured.js`).
- `albums` are their latest albums.
- `albums` is empty while Spotify is limiting album lookups.

### `GET /api/mock/art/:file`

Generated SVG cover art for the demo catalogue: the same name always gives the same picture. It sends `Cross-Origin-Resource-Policy: cross-origin` so a client on another host can show it, and is cached by browsers for a day.

---

## Accounts and cloud library (Release 2, Phase 5)

Every route below needs `Authorization: Bearer <Supabase access token>`. They answer **503 `accounts_unavailable`** when the server has no Supabase settings. Bodies are validated with zod using the same limits as the browser library:
- rating 1–10
- review and notes ≤ 5000 characters
- tags lowercase, ≤ 30 characters, ≤ 20 per album
- collection names 1–60 characters, unique per user

| Method + path | Body | Result |
| --- | --- | --- |
| `GET /api/me` | — | `{ user: { id, email }, profile: { createdAt }, counts: { albums, collections } }` |
| `DELETE /api/me` | — | 204; deletes all the user's data and the account |
| `GET /api/library` | — | The whole library in the browser's v1 shape `{ version, entries, collections }` |
| `POST /api/library/import` | `{ library }` | Merge (newest `updatedAt` wins); `{ library, summary }` |
| `PUT /api/albums/:albumId/entry` | full entry | Upsert unless the stored copy is newer; `{ entry, applied }` |
| `DELETE /api/albums/:albumId/entry` | — | 204 (also removes it from collections) |
| `GET /api/collections` | — | List with `albumIds` |
| `POST /api/collections` | `{ id, name, description?, createdAt, updatedAt }` | 201; same id again is a no-op |
| `GET /api/collections/:collectionId` | — | One collection |
| `PATCH /api/collections/:collectionId` | `{ name?, description?, updatedAt }` | Newest wins |
| `DELETE /api/collections/:collectionId` | — | 204 |
| `POST /api/collections/:collectionId/albums` | `{ albumId }` | Append (album must be saved: 400 `not_saved`) |
| `DELETE /api/collections/:collectionId/albums/:albumId` | — | 204 |
| `PATCH /api/collections/:collectionId/order` | `{ albumIds, updatedAt }` | Same set, new order |

Full design notes: `docs/plans/phase-5-plan.md` §4.

---

## Intelligence (Phase 6)

### `GET /api/intelligence/artists`

What the server already knows about some artists: their details (genres) and releases. Recommendations, the release calendar and the connection graph are computed **in the browser** from this plus the user's library.

| Param | Required | Rules |
| --- | --- | --- |
| `ids` | yes | 1–40 comma-separated artist ids (letters, digits, dashes) |
| `load` | no | 0–3, default 0. How many of the ids that are **not cached yet** to look up now |

```json
{
  "mode": "mock",
  "artists": [{ "id": "neon-harbor", "artist": { /* Artist */ }, "releases": [ /* ≤ 80 Release, newest first */ ], "source": "mock" },
              { "id": "unknown-one", "artist": null, "releases": null, "source": null }],
  "loaded": [],
  "budget": { "limit": 30, "spent": 0, "remaining": 30, "resetsAt": "…" },
  "stopped": null
}
```

- `mode` is the catalogue (`mock` or `spotify`), or `unsupported` for a provider without this feature.
- `load=0` (what pages use on open) **never calls Spotify**.
- `load>0` (the "Look up" button) costs at most 2 Spotify requests per artist, under a server-wide daily budget (`INTELLIGENCE_DAILY_REQUESTS`, default 30).
- `stopped` is `{ code: 'rate_limited', retryAfter }` or `{ code: 'budget_exhausted' }` when lookups had to stop early. The response is still 200 with whatever was found.

---

## Community (Phase 7)

These answer **503 `accounts_unavailable`** when accounts are not configured.
- "Optional sign-in": no `Authorization` header means a visitor, but a header that is present and wrong is still 401.
- Album snapshots in shared collections and battles are cleaned again on the server, and only whitelisted fields leave it.

| Method + path | Sign-in | Body / params | Result |
| --- | --- | --- | --- |
| `GET /api/public/collections/:slug` | no | — | `{ collection: { slug, name, description, updatedAt, includeReviews, albums: [{ album, rating?, review? }] } }` (ratings and reviews only when the owner turned them on). A private, hidden, unknown or malformed slug → 404. Sends `X-Robots-Tag: noindex` and `Cache-Control: public, max-age=30` |
| `GET /api/collections/:collectionId/share` | yes | — | `{ share: { slug, visibility, includeReviews, hidden, hiddenReason } \| null }` |
| `PUT /api/collections/:collectionId/share` | yes | `{ visibility: 'private'\|'public', includeReviews? }` | `{ share }`. The slug is made once on first publish and kept on rename |
| `GET /api/battles` | optional | `view=recent\|vote` (vote needs sign-in), `limit` 1–50, `before` (ISO date) | `{ battles: [{ id, albumA, albumB, votesA, votesB, myVote, createdAt }] }` |
| `POST /api/battles` | yes | `{ albumIds: [a, b] }`: two different albums from **your** library | 201 new or 200 existing (each pair exists once) |
| `GET /api/battles/:battleId` | optional | — | `{ battle }` |
| `POST /api/battles/:battleId/vote` | yes | `{ choice: 'a'\|'b' }` | 201 `{ battle }`; a second vote → 409 `already_voted` (enforced by the primary key) |
| `GET /api/leaderboard` | no | `limit` 1–100 | Albums ranked by the Wilson lower bound of their win rate (minimum votes apply): `{ albums: [{ rank, album, wins, votes, winRate, score }], minVotes }` |
| `POST /api/reports` | yes | `{ targetType: 'collection', slug }` or `{ targetType: 'review', slug, albumId }` or `{ targetType: 'battle', battleId }`, plus `reason` (`spam`, `offensive`, `personal_info`, `copyright`, `other`) and optional `details` (≤ 500) | 201, or 200 if you already reported it |

## Admin (Phase 7)

Admins are the users listed in `public.app_admins` (README: "Making yourself an admin"). Everything needs sign-in. A signed-in non-admin gets **403**.

| Method + path | Result |
| --- | --- |
| `GET /api/admin/status` | `{ admin: true\|false }` (any signed-in user; used to decide what the page shows) |
| `GET /api/admin/metrics` | In-memory counters since the last restart: requests by status, latency percentiles, top routes, a 60-minute timeline, 429s, Spotify and cache stats, and top searches (only queries made at least 3 times). `Cache-Control: no-store` |
| `GET /api/admin/reports?status=open\|resolved` | The moderation queue |
| `POST /api/admin/reports/:reportId/resolve` | `{ action: 'hide'\|'dismiss', reason? }` → 204 |
| `DELETE /api/admin/hides/:type/:key` | Restore something hidden: `collection/<slug>`, `battle/<id>`, `review/<slug>:<albumId>` → 204 |
