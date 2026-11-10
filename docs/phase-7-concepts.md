# Phase 7 concepts: community and ops

Phase 7 adds things other people can see: shared collections, Album Battle, and an admin dashboard with basic moderation. This page explains the ideas behind them in plain words. The plan is in `docs/plans/phase-7-plan.md`.

---

## 1. Slugs: readable, stable share links

A **slug** is the human-readable part of a web address: `/shared/late-night-drives-k3x9q2mw`.

- **The name part** (`late-night-drives`) makes a link recognisable when you paste it into a chat. It is made by `slugifyName` in `server/src/services/community/slug.js`:
  - accents are dropped (`Café` becomes `cafe`)
  - anything that is not a letter or digit becomes a dash
  - it is cut to 40 characters
- **The random part** (`k3x9q2mw`, 8 characters from 36) is there for two reasons:
  - two collections called "Favourites" never clash
  - nobody can guess someone else's link from a collection name
- **A slug never changes.** If you rename the collection, old links keep working. Making a collection private makes its link answer "not found"; sharing it again brings back the same link.
- **The database also checks the shape.** It has a pattern check, and a **unique index** so two shares can never get the same slug.

**Why not the collection id?** The ids are made by the browser and mean nothing to people. Also, exposing internal ids makes it easier to probe for other people's data.

---

## 2. Unique constraints: letting the database enforce a rule

"One vote per user per battle" could be checked in JavaScript: look for an existing vote, and insert if there is none. But that check and that insert are two steps. Two requests arriving at the same moment (a double-click, two tabs, a script) can both see "no vote yet" and both insert. This is a **race condition**.

The fix is to let Postgres enforce it:

```sql
create table battle_votes (
  battle_id uuid not null references battles (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  choice    text not null check (choice in ('a', 'b')),
  primary key (battle_id, user_id)          -- at most one row per user per battle
);
```

- A primary key (or a `unique` constraint) is backed by an **index**. Postgres checks it inside the insert itself, so two inserts can never both succeed.
- The second insert fails with error code `23505` ("unique violation"). The server turns that into **409 `already_voted`**.
- The rule holds even for someone who skips our server and talks to the database directly.

Battles use the same idea for **pairs**:
- `album_a_id < album_b_id` (a check constraint) puts each pair in one fixed order.
- `unique (album_a_id, album_b_id)` then means "Discovery vs Homework" and "Homework vs Discovery" are the same battle, which exists once.

---

## 3. RLS for public read, and when to use a function instead

Phase 5 introduced **Row Level Security**: policies that act like an automatic `WHERE` on every query. Phase 7 needs some data to be readable by **everyone**, including visitors who are not signed in (the `anon` role).

**Where RLS fits well: battles.**

```sql
create policy "battles: anyone can read visible ones" on battles
  for select to anon, authenticated using (hidden_at is null);
```

Hidden battles disappear for everyone, automatically.

**The catch: RLS decides about whole rows, not columns.** Suppose we added a policy "anyone may read `library_entries` rows that are in a public collection". Then a visitor calling Supabase's Data API with the public key would receive the **whole row**: private notes, tags and statuses included.

So shared collections use a **`security definer` function** instead:

```sql
create function public.get_public_collection(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$ ... $$;
grant execute on function public.get_public_collection(text) to anon, authenticated;
```

- `security definer` means the function runs with its **owner's** rights. It can read the tables even though the caller cannot.
- That makes it a **door with a fixed shape**:
  - it only returns collections that are public and not hidden
  - it returns only whitelisted album fields: name, artists, year, cover, Spotify link
  - it includes rating and review only if the owner switched that on and no moderator hid the review
  - it never returns notes, tags, statuses or the owner's user id
- `set search_path = ''` and fully written names (`public.collections`) stop anyone from tricking the function into using a look-alike table they created.

**Also check on the way out.** Snapshots were written by browsers, so the server cleans them again (`publicAlbum.js`) and the page checks links again (`client/src/utils/safeUrl.js`):
- Covers only from Spotify's image servers or our own demo art. An image from any other host could be a tracking pixel that tells a stranger who opened the page.
- External links only to `https://open.spotify.com`. This blocks `javascript:`, `data:` and `//other-site` links.
- Everything is rendered as React text (never `dangerouslySetInnerHTML`), so a review containing `<script>` shows as those characters.

---

## 4. Aggregation: turning votes into results and a leaderboard

**Aggregation** means turning many rows into a few numbers: `count(*)`, `sum(...)`, `group by`.

- **Battle results** are `count(*) filter (where choice = 'a')` and the same for `'b'`, per battle.
- Who voted for what stays private: users can only read their own vote rows. Everyone sees the totals, which come from a definer function that returns numbers only.
- **Counting on read vs keeping counters.** We count when someone asks. At our size this is fast, especially with an index on `(battle_id, choice)`. A busy site might keep `votes_a`/`votes_b` columns updated by a trigger, or a materialised view refreshed every few minutes. That is faster to read, but it is a second copy that can drift.

### Ranking fairly: the Wilson score

Sorting by plain win rate is unfair to evidence. An album with **1 win out of 1 vote** (100 %) would beat one with **90 out of 100** (90 %).

The **Wilson score lower bound** (`server/src/services/community/ranking.js`) asks: *"Given these votes, what is the lowest win rate we can be 95 % sure of?"*

| Wins / votes | Win rate | Wilson lower bound |
| --- | --- | --- |
| 1 / 1 | 100 % | 0.21 |
| 5 / 5 | 100 % | 0.57 |
| 90 / 100 | 90 % | 0.83 |

With few votes the uncertainty is large, so the bound is low. More votes shrink the uncertainty, so the score approaches the real rate. Albums also need at least 5 votes to appear at all.

---

## 5. Metrics: measuring the server without slowing it down

`server/src/middleware/requestMetrics.js` watches every request and counts it when the response has been sent (`res.on('finish')`).

- **Counters**: total requests, by status class (2xx/3xx/4xx/5xx), 429s (our rate limiter said "slow down") and 5xx (our server failed).
- **Route patterns, not addresses.** It records `/api/artists/:id`, never `/api/artists/4tZwfgrHOc3mvqYlEYSvVi`. That keeps the table small and avoids storing what individual people looked at.
- **Latency histogram** (`latency.js`). Storing every response time would grow forever. Instead each request adds 1 to a "bucket" (≤5 ms, ≤10 ms, ≤25 ms, …). The **p95** ("95 % of requests were at least this fast") is read from the buckets. It is approximate, but memory stays the same size forever.
- **Timeline** (`timeline.js`): one bucket per minute for the last 60 minutes, for the chart. Older minutes are thrown away.
- **Spotify and cache numbers** are not measured again. The dashboard reads the counters the Spotify client and cache already keep (`provider.stats()`), so opening the dashboard **never** calls Spotify.
  - **Cache hit ratio** = hits ÷ all lookups. 85 % means 85 of 100 catalogue requests cost nothing.
- **In memory only.** Numbers reset when the server restarts and are per server process. That is fine for one small server; a bigger setup would send them to a metrics service.

### Top searches without collecting personal data

Knowing what people search for helps, but search boxes attract personal data (people paste emails, phone numbers, links). So `topSearches.js`:

1. **Keeps only the cleaned-up text.**
   - lowercased, extra spaces removed, at most 60 characters
   - no IP, user, time or filters
   - dropped entirely if it contains `@`, a web address, or 5+ digits in a row
2. **Bounds memory with the Space-Saving algorithm.** At most 200 different queries are tracked. When a new query arrives and the table is full, it replaces the query with the smallest count and inherits that count. Popular queries can never be pushed out. A newcomer's inherited part is remembered as its possible `error`, so `count − error` is a number we are sure of.
3. **Shows a query only after 3 certain searches.** This is a simple form of **k-anonymity**: one person's unusual search never appears on the dashboard.

---

## 6. Roles: who is an admin?

Admins are listed in a table, `public.app_admins`, and checked with a function `public.is_admin()`. To make yourself an admin, run this once in the Supabase SQL editor with your own email:

```sql
insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.com';
```

Remove the row to revoke it. Why a table and not a "role" claim inside the sign-in token (JWT)?
- **A token lives up to an hour.** A revoked claim would keep working until it expires; a table row is gone at once.
- **RLS policies can call `is_admin()`.** Moderators then get exactly the extra rights the policies give, and the database itself checks them.
- Nothing about a real person is written in the code.

The admin API answers **403 `forbidden`** to signed-in non-admins. That is different from Phase 5's rule of answering 404 for someone else's data: the dashboard's existence is not a secret, a person's collection is.

---

## 7. Moderation: report, hide, restore

1. **Report.** Anyone signed in can report a shared collection, a review in it, or a battle, choosing a reason.
   - One report per person per thing: a unique constraint again.
   - Reports have their own rate limit, so the button can't be used to flood the queue.
2. **Review.** Admins see open reports with a preview of the content.
3. **Hide** sets a `hidden_at` mark (or adds a row to `review_hides`). Every public query already filters on it:
   - a hidden collection's link answers 404
   - a hidden review disappears from the shared page
   - a hidden battle leaves the lists and the leaderboard, and refuses votes
4. **Dismiss** closes a report without hiding anything. **Restore** removes the mark.

Things to notice:
- **Hiding is not deleting.** The owner's private data is never changed, so a mistake is fully reversible.
- **Owners see why.** The share panel shows "Moderators hid this collection" and the reason. Column-level grants stop owners from clearing `hidden_at` themselves.
- **Reasons, not free text, first.** A fixed list of reasons makes the queue easier to sort and keeps the reporter's own words optional.

---

## 8. Deleting an account: cascades and one edge case

Community rows point at `auth.users` with **`on delete cascade`** (votes, reports, admin rows) or **`on delete set null`** (who created a battle). Shares point at their collection, so they go when the collection goes.

When someone deletes their account (Phase 5's `DELETE /api/me`):
1. Phase 5 removes the library data in one transaction. Shares go with the collections.
2. Phase 5 asks Supabase to delete the auth user. Votes, reports and admin rows then go with it, through the cascade. Battles they created stay, because others voted on them, but are no longer linked to anyone. A battle holds only album data.

**Edge case.** If step 2 fails (Supabase unreachable), the library data is already gone but votes and reports remain for now. Retrying the deletion, which the app offers, finishes the job. Votes don't show who cast them, so nothing personal is visible in the meantime.
