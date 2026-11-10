# Phase 6: recommendations, insights and connections

Albumly now suggests albums and explains why. It describes your library in numbers and a "Music DNA" card, shows how artists connect, splits an artist's career into eras, and puts releases on a calendar. All of it is worked out by Albumly itself, mostly in your browser, from what you saved.

## What was added

| Feature | Where to look |
| --- | --- |
| Preference profile (genres and tags, decades, artists) | `client/src/utils/preferences.js` |
| Cosine similarity and small vector helpers | `client/src/utils/vectors.js` |
| The recommender: candidates, scoring, "why this?" | `client/src/utils/recommender.js`, `pages/Discover.jsx` |
| Discovery quiz and weight settings (saved in this browser) | `hooks/usePreferences.js`, `components/intelligence/PreferenceQuiz.jsx`, `WeightsPanel.jsx` |
| Artist connection graph (BFS) | `client/src/utils/artistGraph.js`, `pages/Connections.jsx`, `ArtistGraph.jsx`, `ConnectionList.jsx` |
| Insights and Music DNA | `client/src/utils/insights.js`, `musicDna.js`, `pages/Insights.jsx` |
| Eras on the artist page | `client/src/utils/eras.js`, `components/intelligence/EraExplorer.jsx` |
| Release calendar | `client/src/utils/calendar.js`, `pages/ReleaseCalendar.jsx` |
| What the server already knows, and the daily lookup budget | `server/src/routes/intelligenceRoutes.js`, `server/src/services/intelligence/` |

## Ideas worth understanding

**A profile is three lists of numbers.** Albumly turns your library into three *vectors*: how much you like each genre or tag, each decade, and each artist. Every saved album adds its weight to the entries it touches. A favourite counts double. A rating of 10 doubles it again, and a 1 nearly cancels it. So `{ synthwave: 7.4, "late night": 5.2, folk: 0.8 }` says "mostly synthwave and late-night music". Each quiz answer counts as much as three saved albums. That is enough to get started with an empty library, and it fades as your library grows.

**Cosine similarity: do two vectors point the same way?** Picture each vector as an arrow. Two arrows pointing the same way are similar, however long they are. The cosine of the angle between them measures this:

```
cos = (a · b) / (|a| × |b|)        a · b = sum of a[k] × b[k] over every key k
```

`{a: 1, b: 2}` against `{a: 2, b: 1}` gives `(1·2 + 2·1) / (√5 · √5) = 4 / 5 = 0.8`. A result of 1 means the same direction and 0 means nothing in common. Because it divides by the lengths, a huge library and a tiny one can still match. Albumly uses it twice: for genres and tags (G), and for decades (Y). For decades, an album's own decade counts 1 and the decades either side count 0.5, so a 2000s fan still partly matches a 2010s record.

**Weighted scoring, with "unknown" kept honest.** Each candidate gets four numbers between 0 and 1:

- **G**, genre and tags
- **Y**, era
- **C**, connection to your artists
- **U**, your taste for its artist

They are combined as

```
Score = (w1·G + w2·Y + w3·C + w4·U) / (sum of the weights of the parts that are known)
```

The weights are the sliders under "Tune recommendations". The important detail is the bottom of that fraction. Spotify no longer gives new apps any genres. If an artist has no genres and you never tagged their albums, Albumly does not know G for them. Counting an unknown G as 0 would quietly punish every new artist. So it is left out of both the top and the bottom, and the card says "Genre not counted". For the same reason the default weights lean away from genre: G 1.5, Y 2.5, C 2.5, U 3.5.

**Candidates first, then scores.** Spotify has no "recommend" or "related artists" endpoints for Albumly. So the recommender builds its own shortlist from discographies it has already seen:

- other albums and EPs by your artists
- albums your artists guest on
- albums by artists one step away

Before scoring it removes anything you own, and other editions of albums you own (same main artist, same title once "Deluxe" or "Remastered" is stripped). It also removes plain singles and compilations. Then every candidate is scored, sorted, and the top 20 shown. Ties are broken by newer release, then title, so the order never jumps around.

**Every result explains itself.** The parts that added most to the score become sentences. "You rated 2 Neon Harbor albums 8/10 or higher" comes from U. "Connected to your library: Kite & Ember → Oda Lindqvist (on “Wintering”)" comes from C. A result with nothing linking it to you scores 0 and is not shown, so every card has a reason.

**Breadth-first search (BFS).** Two artists are connected when they are credited on the same release. To find everyone near an artist, BFS uses a queue:

1. Put the start in the queue at distance 0.
2. Take the next artist out of the queue.
3. Add each neighbour you have not seen yet, at distance + 1.
4. Repeat from step 2.

Everyone one step away is reached before anyone two steps away. So the first time BFS reaches an artist, it has found a shortest path. Remembering the *parent* each artist was reached from lets Albumly print that path. Two limits keep it small: a depth limit (1 or 2 steps) and a cap of 40 artists. The queue is read with a moving index rather than `shift()`, which would copy the whole array on every step. The recommender runs the same BFS from all your artists at once (a *multi-source* BFS) to get each candidate's distance for C.

**A hand-drawn graph instead of a library.** With at most 40 artists in at most three rings, an SVG drawn by hand is enough. The start goes in the middle and each step out sits on a wider ring, ordered by its parent so lines cross less. A graph library such as React Flow would add roughly 150 KB of code for dragging and zooming we do not need. The nested list beside the picture holds the same information and works with a keyboard and a screen reader.

**Group-by aggregation.** Most insights are one pattern: put items into buckets by a key, then count each bucket. `groupBy(entries, entry => decadeOf(entry.album.year))` gives `{ 2000: [1 album], 2010: [7 albums] }`. The key can be a list, so an album by two artists lands in both artists' buckets. Top artist, top genre, the decade chart and the rating chart are all group-bys followed by a sort. `insights.test.js` checks the results against numbers worked out by hand. The page is titled "Your Albumly library" because Albumly only knows what you saved here. These are not Spotify listening stats.

**Budget-capped crawling.** Spotify lets Albumly read artist discographies only about 100 times a day, and sometimes blocks that endpoint for a day. So the Discover pages follow strict rules:

- **Opening a page costs nothing.** The server answers only from its cache (`load=0`).
- **More data only on a button press.** "Look up 3 more artists" fetches a *preview* of each: page one of their albums and page one of their guest appearances. That is at most 2 requests per artist and 6 per press.
- **A daily cap.** The server keeps a count per UTC day (30 by default, `INTELLIGENCE_DAILY_REQUESTS`). It starts a lookup only if the worst case still fits, so the cap is never overshot. The count is saved to a file so restarts do not reset it.
- **Nothing while blocked.** If Spotify has blocked the endpoint, the server does not even try. The page shows the usual "Spotify has paused Albumly" message.

The demo catalogue is free to read, so in demo mode everything is known at once and there is nothing to look up.

**Why the maths runs in the browser.** Today your library lives in the browser. With an account (Phase 5) it lives on the server, but the page still reads it through the same library hooks. Running the recommender and insights in the browser works the same either way. The functions are pure (no React, no fetching), so they could later move to `GET /api/recommendations` unchanged.

**Eras.** Each studio album starts a chapter of an artist's career. A single or guest spot released up to 24 months before an album counts as its lead-up. Otherwise it belongs to the album before it. A deluxe edition joins the original album's era instead of starting a new one. Eras reuse the discography the artist page already loaded, so they cost no extra request.

## Try these (demo mode)

- Save Glass Arcade and Low Tide Signals and rate one 9/10. Open **Discover**: Neon Harbor's other albums come first, with the reason "You rated…". The Deluxe Edition is never suggested.
- Drag the **Connection** slider to 10 and watch artists connected through guest appearances move up.
- Open **Insights**. The decade table links to your library filtered to that decade.
- Open an artist page and scroll to **Eras**, then press **See connections**.

## Not done in this phase

- Connections from track-level credits. These would need every album's tracks, which costs requests. Release-level credits and guest appearances are used instead.
- Searching Spotify for candidates by genre or year (no genres, and the year filter is unconfirmed).
- Syncing quiz answers and weights to your account. They stay in this browser.
