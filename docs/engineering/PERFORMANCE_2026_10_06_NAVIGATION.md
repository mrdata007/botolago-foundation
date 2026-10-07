# Navigation speed, 2026-10-06: data cache and loading ahead

Goal: screens open at once when a reader moves around the app (Home →
match → club → player → back; Fantasy list → player → back), without
changing what any screen shows, the live refresh rules, or any business
rule. This is batch 1 of an incremental plan; the rest of the plan is at the
end.

"Before" is `af8b0a7` (main); "after" is this branch.

## Audit

**The app is not Next.js.** It is TanStack Start (Vite, TanStack Router,
server rendering), wrapped by the Capacitor phone app, which opens the live
site (`capacitor.config.ts`). So Next.js caching does not exist here, and
everything below applies to the phone app as it is.

1. **How data is fetched.** Screens read through TanStack Query (React Query
   v5.101, already installed, ~115 files). Queries call `src/services/*`,
   which call Supabase RPCs (`api.*` functions) with the publishable key,
   behind Row Level Security. One `QueryClient` per request on the server
   and one per tab in the browser (`src/router.tsx`).
2. **Direct Supabase calls from pages.** None: every page goes through a
   service and a repository (`src/backend/*/supabase-repository.ts`). Admin
   uses server functions.
3. **Server vs browser.** Public pages render on the server: Home, Matches,
   Standings, Clubs, News, and the match, club, player and article pages.
   List pages hand their data to the browser through the query cache
   (`prefetchForSsr` + dehydrate, `meta.ssr`); detail pages through loader
   data that seeds the page's query (`initialData`). Everything personal
   (Fantasy team, rankings, follows, notifications) is browser-only.
4. **Caching library.** TanStack Query, plus TanStack Router's own loader
   cache. Defaults: fresh for 15 s (`src/services/query-client.ts`), one
   retry, season list 10 min.
5. **React Query already installed?** Yes (`@tanstack/react-query`
   ^5.101.1), with server-to-browser hydration already wired.
6. **Repeated requests.**
   - Opening a Fantasy player re-read the whole player pool (9 reads one
     after another, ~2 s) even when the list had just loaded it:
     `getPlayer(id)` is the pool with one player picked out.
   - Arabic readers: the match and club loaders always fetched the French
     copy in the browser too; the page then showed a skeleton and fetched
     the Arabic one. Twice the reads, and a skeleton, on every visit.
   - Fantasy rankings: page, search and sort are in the query key, and
     search is not debounced, so each keystroke, page or sort re-downloads
     the whole board (up to 20 reads) only to slice it locally.
   - The same data under several keys: the player pool (`["fantasy-players"]`
     and Home's `["all-players-for-alerts"]`, and again inside top players),
     fixture difficulty (3 keys), available gameweeks (2), the club list (3),
     the news feed (2 shapes).
   - Rarely changing data on the 15-second default: club profile, club
     lists, squad, the player pool.
7. **Screens that reload on the way back.** Going back was already served
   from the cache. But data kept only 5 minutes after leaving a screen, so a
   later return waited on the network again; and data that rarely changes
   was refreshed after 15 s.
8. **Where loading ahead helps most.** No link loaded anything ahead
   (`defaultPreload` was unset, so `defaultPreloadStaleTime: 0` did
   nothing). Biggest wins: the match page (7 reads), the Fantasy player page,
   the club page (the club, then its matches and table, one after another),
   the Matches tab.
9. **Server-side caching.** No HTML caching at the edge (`no-cache`), by
   design for live scores; the server render warms its data with a 3 s
   budget (`src/lib/ssr-prefetch.ts`). Not changed.
10. **Conflicts to respect.** The server's render and the browser's first
    render must be the same tree (React #418 was fixed on these pages by
    seeding queries from loader data); the server always renders French.
    Loading ahead runs in loaders, which the router does not run while it
    hydrates the first page (it reuses the server's loader data), so the
    first render is unchanged.

## Plan, ranked by impact

| #   | change                                                                   | status                             |
| --- | ------------------------------------------------------------------------ | ---------------------------------- |
| 1   | Links load their page on intent (pointer rests, focus, finger touches)   | **batch 1**                        |
| 2   | Fantasy player page reads the player from the cached pool                | **batch 1**                        |
| 3   | Match and club loaders fetch in the reader's language in the browser     | **batch 1**                        |
| 4   | Club page: matches and table start with the club, not after it           | **batch 1**                        |
| 5   | Freshness by kind of data; keep screens' data 30 min in the browser      | **batch 1**                        |
| 6   | Matches tab: the day's fixtures start loading with the tab               | **batch 1**                        |
| 7   | Fantasy rankings: one board per owner, page/search/sort done locally     | **batch 2**                        |
| 8   | News article and Pronostics: same Arabic double read as 3                | **batch 2**                        |
| 9   | Home and top players reuse the cached player pool                        | **batch 2**                        |
| 10  | One key per data set (fixture difficulty, gameweeks)                     | **batch 3**                        |
| 11  | Matches tabs, header search and top players rows load on intent          | **batch 3**                        |
| 12  | Standings, Clubs, News lists warm their data in the browser like Matches | Standings: **batch 3**; rest later |

## What changed (batch 1)

- `src/router.tsx`: `defaultPreload: "intent"`. Every `<Link>` starts its
  page's code and loader when the pointer rests on it (50 ms), on keyboard
  focus, or on touch. Admin routes opt out (`preload: false`): their
  loaders are staff access checks that log refusals
  (`src/routes/admin-preload.test.ts` keeps it that way).
- `src/services/query-client.ts`: freshness per kind of data (below) and a
  30-minute browser cache time (browser only; on the server a timer would
  keep each request's cache in memory).
- `src/services/fantasy-player-query.ts`: the player page's query reads the
  pool through the cache instead of calling `getPlayer`.
- `src/i18n/active-language.ts`: the language pages read their data in,
  for loaders (from `<html data-lang>`, which the language provider writes).
- `src/lib/browser-prefetch.ts`: `prefetchInBrowser`, the browser-side
  counterpart of `prefetchForSsr`: starts reads from a loader without
  waiting for them. Loaders use `ensureQueryData` inside it, which fetches
  only what the cache lacks; refreshing an old copy stays the page's job.
- `src/services/football-queries.ts`: one definition for the football
  queries a loader warms and its page reads, so their keys cannot drift.
- Match, club, player and Matches routes use the above.

Nothing visual changed. Skeletons stay where they were for a first visit.

## Freshness rules

| data                                                                            | fresh for          | why                                          |
| ------------------------------------------------------------------------------- | ------------------ | -------------------------------------------- |
| club profile, club lists, squad, seasons played (`["football", "club" …]` etc.) | 10 min (was 15 s)  | changes at a transfer window or a new season |
| season list                                                                     | 10 min (unchanged) |                                              |
| Fantasy player pool, a player from it                                           | 5 min (was 15 s)   | prices and totals move about once a gameweek |
| Fantasy pool on the team and transfer screens                                   | 60 s (unchanged)   | those screens keep their own setting         |
| standings, club matches, match day, home fixtures, match page                   | 15 s (unchanged)   | plus their live refresh rules                |
| live match page / live strip / Home live card                                   | unchanged          | every 30 s while live, 60 s around kick-off  |
| Fantasy points, rankings, league tables, availability                           | unchanged          | 30 s / 60 s refresh as before                |
| everything else                                                                 | 15 s (unchanged)   |                                              |

Refetch on window focus and on reconnect stay on (React Query's default),
so a stale screen refreshes when the reader comes back to the tab; fresh
data is not refetched. Retries stay at one.

## What loads ahead

| interaction                              | loaded ahead                                                       |
| ---------------------------------------- | ------------------------------------------------------------------ |
| any link: pointer rests, focus, or touch | the page's code, and its loader's data (below)                     |
| match card                               | the match (all its tabs' data except the table), reader's language |
| club row or crest                        | the club, the seasons, the club's matches and the season's table   |
| Fantasy player row                       | the player (from the cached pool), history, fixtures, clubs        |
| Matches tab                              | the seasons and the opening day's fixtures                         |
| Matches tabs (Classement, Pronostics)    | the season's table; the journée (batch 3)                          |
| header search result                     | the club or the player, as their links do (batch 3)                |
| top players: a row, "Voir le joueur"     | the player, as a player row does (batch 3)                         |
| Admin links                              | nothing (opted out)                                                |

## Before and after

### How it was measured

Both versions built the way production builds them (`vite build`, production
mode), run as Node servers on this machine, both reading the live database
as an anonymous visitor (reads only, the same reads any visitor makes). No
network throttling; a database round trip from here is about 0.2-0.6 s.
Runs alternated the two versions; times are medians (3 runs before, 2
after), reads are per run.

The script (Playwright, Chromium) walks two flows and, for each step,
records the time from the click (or tap, or Back) until the new page's own
heading is on screen, every database read made during the step (Supabase
REST/RPC calls and server functions; crest images excluded), exact duplicate
reads, and whether a loading skeleton appeared on the new page:

- **A**: Standings → club → match → back → same match → back → back → same
  club → back → another club.
- **B**: Fantasy players → player → back → same player → back → another
  player.

Four settings: desktop (the pointer rests 200 ms on the link before the
click, the clock starts at the click), phone with an instant tap (no head
start at all), the same in Arabic, and phone with a realistic tap (the
finger rests 0.1 s; the clock starts when it lifts).

Not measured: signed-in screens (Home for a member, the Fantasy team and
transfer screens), for want of a test account.

### Results

| step (desktop, French)                   | before     | after      | reads before → after |
| ---------------------------------------- | ---------- | ---------- | -------------------- |
| Fantasy list → player (first visit)      | 1,995 ms   | **130 ms** | 12 → 3               |
| Fantasy list → another player            | 1,933 ms   | **111 ms** | 11 → 1               |
| Standings → club (first visit)           | 501 ms     | **162 ms** | 3 → 3                |
| club → match (first visit)               | 752 ms     | 694 ms     | 10 → 10              |
| Standings → same club again (after 15 s) | 176 ms     | 180 ms     | 3 → 2                |
| every Back step                          | 110-134 ms | 108-150 ms | unchanged or fewer   |
| **whole flow**                           |            |            | **46 → 34**          |

| step (phone, Arabic)           | before                 | after                   | reads before → after |
| ------------------------------ | ---------------------- | ----------------------- | -------------------- |
| Standings → club (first visit) | 501 ms, **skeleton**   | **324 ms**, no skeleton | 4 → 3                |
| club → match (first visit)     | 1,216 ms, **skeleton** | **724 ms**, no skeleton | 17 → 10              |
| Standings → another club       | 458 ms, **skeleton**   | **331 ms**, no skeleton | 4 → 3                |
| Fantasy list → player          | 1,872 ms               | **142 ms**              | 12 → 3               |
| Fantasy list → another player  | 2,133 ms               | **122 ms**              | 11 → 1               |
| **whole flow**                 |                        |                         | **55 → 25**          |

Two desktop steps read more: Back to Standings (1 → 3) and Standings →
another club (3 → 10). In both, the pointer left resting where the click
was ended up over a club row or a match card on the new page, which loaded
that page ahead (see Trade-offs). They are included in the 46 → 34.

Phone in French: the whole flow went from 46 to 25 reads, and the player
page from about 2,000 ms to 140-150 ms. With an instant tap there is no
head start to use, so the first visit to a club or a match takes about as
long as before (378 → 432 ms and 715 → 780 ms, within this setup's run-to-run
noise): those pages wait on the network either way.

A realistic tap (the finger lands, rests 0.1 s, lifts; the clock starts at
the lift; French; 2 runs each, range):

| step (phone, realistic tap)   | before         | after          |
| ----------------------------- | -------------- | -------------- |
| Standings → club              | 318-323 ms     | **183-227 ms** |
| club → match                  | 665-838 ms     | **388-392 ms** |
| Standings → another club      | 336-679 ms     | **137-148 ms** |
| Fantasy list → player         | 1,816-1,938 ms | **77-86 ms**   |
| Fantasy list → another player | 1,844-2,045 ms | **76-82 ms**   |

Exact duplicate reads: 0-1 before, 0 after. Back steps and repeat visits
were already served from the cache before this change, and still are.

### JavaScript

Production build, gzip: the shared entry grows from 164.64 KB to 165.27 KB
(+0.6 KB); the match, club, player and Matches page files are the same size
or slightly smaller. No library added (React Query was already there).

### Checks

`bun run typecheck` clean; `bun run lint` no errors (the 31 warnings already
on main); `bun test` 5,931 pass, 17 skipped, 1 fail, the same failure as on
main before this change (`editorial-session.test.ts`, Ramadan 2027 clock
change, a time-zone data difference on this machine); `bun run build` passes.

## Trade-offs

- **A resting pointer.** On a computer, after a click the pointer stays
  where it was; whatever link the new page puts under it is loaded ahead.
  Seen in testing: one match loaded ahead (7 reads) after opening a club.
- **Swipes.** On a phone, a swipe that starts on a card is a touch on it,
  so that card's page loads ahead. Measured: six swipes down Standings cost
  6 reads (3 clubs loaded ahead, 2 reads each), six down the Fantasy players
  list 8 reads (6 player histories, plus fixtures once); before, none. About
  one or two reads a swipe, each a read the page would make if opened.
- **Tab title for Arabic readers.** In the browser the match and club pages
  now read Arabic data for an Arabic reader, so the browser tab's title
  shows the club names in Arabic (it showed them in French). Search engines
  still get the French title from the server.

## Batch 2

Plan items 7, 8 and 9. "Before" is batch 1 (`c6e0549`), "after" is
`6923441`.

### What changed

- **Fantasy rankings** (`src/routes/fantasy.rankings.tsx`,
  `src/services/fantasy-rankings.ts`, `fantasy-runtime.ts`): the whole season
  board is read once per owner (`key("rankings")`, `getGlobalBoard`) and
  refreshed every minute as before; pages, the Général/Journée sort and the
  search are cut from it in the browser (`selectGlobalRankingsPage`, the same
  two selection rules the read used to apply). Page, sort, search and the
  reader's total used to be in the key, so each letter typed, page turned or
  tab changed read the whole board again (up to 20 reads each).
- **One player pool** (`src/services/fantasy-player-query.ts`): Home's
  trending players, the top players page and a player's page take the
  season's player pool from the cache when it is fresh, else join the pool
  read a screen already has on its way, else read it themselves and store it
  for every other screen; they never start the pool's own query, so a
  screen's pool read keeps its own retry whatever else reads the pool, and a
  failing pool costs two reads through such a read alone (up to four when a
  screen reads the pool at the same time, as before). `getTrendingPlayers` and `getTopPlayersOfWeek` now take
  where the pool comes from (by default they still read it). Home no longer
  reads trending players for a visitor (only a signed-in reader's Home shows
  them). The top players page asks for its gameweek's top five once the
  current gameweek is known, so a stand-in gameweek's read (now quick)
  cannot land first and show the wrong week.
- **Arabic double read** (`src/routes/news.$articleId.tsx`,
  `src/routes/pronostics.index.tsx`, `use-predictions-round.ts`): the article
  loader reads an edition in the reader's language; in production an
  edition id gives the same edition in either language
  (`getArticleWithLanguageFallback`), so the page shows the copy it already
  has whatever the language, on a tap and on a shared link alike, instead of
  a skeleton and a second read. Slugs and the mock repository keep the
  French read. The related stories are keyed by the edition alone (the RPC
  takes no language) and start with the article on the navigation itself
  (not on a hover or touch). The Pronostics loader reads the journée in the
  reader's language and seeds only a page in that language (team names come
  translated).

### Results

Same setup as batch 1 (production builds, live database as an anonymous
visitor, reads only). Before: 2-3 runs; after: 2 runs; ranges.

| step                                      | before                         | after                          |
| ----------------------------------------- | ------------------------------ | ------------------------------ |
| Fantasy rankings: type a 6-letter search  | 7 reads                        | **0 reads**                    |
| Top players: open the page (cold)         | 35-36 reads (20 exact repeats) | **15-16 reads (1 repeat)**     |
| Article, phone in Arabic (first visit)    | 538-716 ms, skeleton, 4 reads  | **185-256 ms, no skeleton, 2** |
| another article, phone in Arabic          | 632-704 ms, skeleton, 5 reads  | **151-195 ms, no skeleton, 3** |
| Pronostics tab, phone in Arabic           | 2 reads                        | **1 read**                     |
| Article, desktop in French                | 502-839 ms, 2 reads            | 520-553 ms, 2 reads            |
| whole flow, reads (desktop FR / phone AR) | 49-50 / 56                     | **23 / 24**                    |

- The rankings board here is small (one page of 100 rows), so a keystroke
  cost one board read before; on a full board it was up to 20.
- The Pronostics page shows its title while the journée loads, so this
  script's time to the title does not see the loading panel; reads are the
  measure there.
- Not measured: signed-in screens (Home's trending players, a member's
  rankings), for want of a test account.

### Trade-offs

- **Rankings refresh.** The board refreshes every minute, on focus and when
  the page opens, as before; a page turn, a search or a tab change no longer
  triggers a read of its own, so they show the board as of its last refresh
  (rows change only when a gameweek is scored). The page shown on a tab or
  page change is right at once, where it used to show the previous page for
  one round trip. If the board read fails, the error panel stays until
  Réessayer, focus or the next minute; a tab change no longer retries.
- **Top players' price, ownership and form** come from the player pool,
  which is fresh for five minutes, as on the players list and a player's
  page since batch 1; a focus refresh of the page no longer re-reads them.
  Weekly points and minutes still come from the gameweek's own read.
- **Language switch on Pronostics.** After an Arabic reader opens Pronostics,
  switching the page to French loads the French journée behind the loading
  panel (team names differ by language); before, the French copy was already
  in the cache because the loader always read it.

### JavaScript

Production build, gzip: the shared entry is 164.41 KB, against 164.64 KB on
main and 165.27 KB after batch 1.

### Review

The batch was reviewed from five angles (behaviour, React Query semantics,
freshness, security, tests), each finding checked by three independent
skeptics, then each fix by three more. Two findings were confirmed:

- The pool read first ran without a retry of its own (to keep a failing
  pool at two reads), and a screen joining that read inherited it, so one
  dropped connection could show a screen's error state. Two further fixes
  that kept starting the pool's own read from inside another read were each
  broken by the next skeptic round (four reads when the top five failed
  first; a retry cancelled during its wait counted as two failures; a read
  left waiting after a cancelled pool read). The final version (above) never
  starts the pool's own read from another read; tests cover each path and
  fail on all three earlier versions. A third round found one more race (a
  read's own pool read finishing after a screen's newer one overwrote it;
  now it is not stored over a newer copy) and five guards no test pinned;
  each now has a test that fails when the guard is removed. A fourth round
  found that reads reading the pool themselves at the same moment did not
  share it (a finger scrolling a list left open over five minutes could
  start a full pool read per row touched); they now share one read, and a
  read that finds a newer copy already stored shows that one. The fifth
  round found no defect in the code, only two behaviours no test pinned
  (the shared read is cleared once done; each query client has its own);
  both are now tested.
- A test claimed two gameweeks shared one pool read when only one reached
  it; it now holds the read open until both join it.

Two findings were judged intended trade-offs: the Pronostics language switch
(below) and the related stories read alongside an article that turns out to
be missing. Re-measured on the final code: the same read counts as in the
table above (top players 15-16 reads, rankings search 0, Arabic articles
with no skeleton).

### Checks

`bun run typecheck` clean; `bun run lint` no errors (the 31 warnings already
on main); `bun test` 5,965 pass, 17 skipped, 1 fail (the same Ramadan 2027
test as on main); `bun run build` passes.

## Batch 3

Plan items 10 and 11, and the Standings part of 12. "Before" is batch 2 as
merged with main (`2fbed47`), "after" is this batch.

### What changed

- **One key per data set** (`src/services/fantasy-queries.ts`): the fixture
  difficulty was read under three keys (the hub's per-owner key, the fixtures
  grid's, a player page's), so opening a player after the grid read it
  again; it is now one key, `["fantasy-fixture-difficulty"]`. The gameweeks
  the Points and Top players steppers offer were read under two keys; now
  one. Every screen keeps its own freshness and conditions. These rows are
  the same for every visitor (the hub picks the season and gameweek without
  looking at who asks), so a shared key hands nothing of one account to
  another.
- **The current gameweek's id from the hub** (`gameweekIdOf`,
  `fantasy-runtime.ts`): the top players, the points and a recap looked up a
  gameweek's id in the season's list of gameweeks every time, the points every
  30 seconds while live. The hub already names the current gameweek, so asking
  about it no longer reads the list; another gameweek reads it as before and
  gets the same id.
- **Buttons that load their page ahead** (`src/lib/intent-preload.ts`): the
  Matches tabs, the header search's results and the top players' rows and
  "Voir le joueur" button are buttons that navigate on click, so they had none
  of a link's loading ahead. They now start their page the way a link does:
  the pointer resting on one for the router's delay (50 ms), a finger touching
  one at once, a pointer leaving it before the delay calls it off. The same
  router loader runs, through the same cache, so data already fresh costs
  nothing; routes that opt out (Admin) stay opted out. They stay buttons: the
  tabs must stay tabs, and nothing on screen changes. `UiTabs` takes an
  optional `tabIntent` for this; the chosen tab and a disabled one get none.
- **Classement warms its table in the browser**
  (`src/routes/matches.standings.tsx`), as the Calendrier does since batch 1:
  the loader starts the seasons and the table in the reader's language without
  waiting for them, for the season the page opens on, under the page's own
  keys. A touched or hovered Classement tab therefore starts the table before
  the click.

### Results

Same setup as before (production builds, live database as an anonymous
visitor, reads only). Tabs and rows: 7 fresh visits each, median; Fantasy
moves: 2 runs each.

| step                                                | before                        | after                                  |
| --------------------------------------------------- | ----------------------------- | -------------------------------------- |
| Matches -> Classement tab, phone: table on screen   | 534 ms, skeleton 7/7          | **290 ms**, skeleton 6/7 (shorter)     |
| Matches -> Classement tab, desktop: table on screen | 422 ms, skeleton 7/7          | **203 ms**, skeleton 3/7               |
| Matches -> Pronostics tab, phone                    | 409 ms                        | **275 ms**                             |
| Matches -> Pronostics tab, desktop                  | 463 ms                        | **230 ms**                             |
| Top players -> a player (row), phone / desktop      | 114 / 190 ms                  | 104 / 151 ms                           |
| Fantasy: fixtures grid -> players -> a player       | 3 reads                       | **1 read** (no second difficulty read) |
| Fantasy: -> top players                             | 4 reads (gameweek list twice) | **3 reads, no repeat**                 |
| whole flow, reads (phone / desktop)                 | 28 / 28-29, 1 repeat          | **25-26 / 25-26, no repeat**           |

- On a phone the finger rests on the glass about 100 ms in a tap, less than
  the table's reads take, so the skeleton still shows briefly; the table
  arrives about a quarter of a second sooner. On desktop the pointer usually
  rests long enough for the table to be in before the click.
- The top players' rows gain less: since batch 2 the player's page already
  comes from the cached pool, so only the page's code and the player's
  history are left to load ahead.
- One phone run showed a second hub read on the cold fixtures load (14
  reads): the hub is shared for two seconds (`fantasy-hub-share.ts`) and that
  load's reads were spread over more; the other three runs, and every run
  before, read it once. Not a change of this batch.
- Not measured: the header search (its results list needs typing; it uses the
  same loaders as the club and player links measured in batch 1) and
  signed-in screens (the points' gameweek shortcut), for want of a test
  account; tests cover the shortcut (`fantasy-gameweek-id.test.ts`).

### Trade-offs

- **A preload that fails** is kept by the router like any preload, so a tap
  within the next few minutes opens that page on its loading state, as a
  link's failed preload already does since batch 1.
- **A preloaded page can be up to five minutes old when opened** (the router
  keeps preloads that long); its loader and its queries refresh it in the
  background as they do for links.
- **Each touch of a tab or row costs its page's reads** when they are not in
  the cache, as a link's touch does (batch 1): a finger scrolling over the
  top players' rows starts each player it touches, all from the one cached
  pool.
- **Pronostics while the game is open to testers only.** The router keeps a
  page's loader data for five minutes and does not forget it when the account
  changes (the query cache does: `forgetAccountPredictions`). A tester's
  journée, loaded by visiting or preloading Pronostics, can therefore seed the
  page for the next account on the same device within those minutes, until
  the page's own read replaces it. The journée holds the matches and whether
  the game is open, never anyone's picks. This was already so for a visit or a
  link's preload; the tab's preload adds one more way in. Clearing the
  router's cache on an account change is left to a separate change.
- **Deliberately not merged:** the club directory and the club list (different
  data), the news feed's two shapes (one is behind a flag), and the per-screen
  freshness of the shared keys.

### JavaScript

Production build, gzip: the shared entry is 161,810 bytes, against 161,789
before this batch (+21 bytes).

### Review

The batch was reviewed from four angles (the loading-ahead timing against
the router's own link code, cache keys and account safety, unchanged
behaviour and markup, tests), each finding then checked by a skeptic. No
defect was found in the code. Two gaps in the tests were reported and judged
hardening rather than defects; both are now covered: the warm-up's keys are
checked against the page's own, and a recap read or publish for another
gameweek is checked to name that gameweek (the test fails if publishing
takes the current gameweek instead).

### Checks

`bun run typecheck` clean; `bun run lint` no errors (the 31 warnings already
on main); `bun test` 6,135 pass, 17 skipped, 1 fail (the same Ramadan 2027
test as on main: this machine's time-zone data prints "GMT+0" where it
expects "GMT"); `bun run build` passes. The new tests were each checked to
fail when the behaviour they pin is broken.

## Remaining bottlenecks and next batch

1. On a phone a tap gives about 100 ms of head start, less than most first
   reads take (the Classement table, a match's seven reads), so a first visit
   still shows a short skeleton; only data already in the cache removes it.
2. Clubs and the News lists still wait for the page to render before asking
   for their data in the browser (the rest of plan 12).
3. Home's trending players exist only to name alerts, and in production the
   alerts are always empty: a signed-in Home still reads the top five for
   nothing (kept, as the owner decided).
4. The router's loader cache is not cleared when the account changes (see the
   Pronostics trade-off above).
5. Every first page load renders on the server and reads the database, with
   no edge caching.

Recommended next batch: the rest of plan 12 (Clubs and News lists warm their
data in the browser), and clearing the router's cache on an account change.
