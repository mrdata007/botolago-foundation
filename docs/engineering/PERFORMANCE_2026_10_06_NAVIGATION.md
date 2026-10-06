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

| #   | change                                                                   | status      |
| --- | ------------------------------------------------------------------------ | ----------- |
| 1   | Links load their page on intent (pointer rests, focus, finger touches)   | **batch 1** |
| 2   | Fantasy player page reads the player from the cached pool                | **batch 1** |
| 3   | Match and club loaders fetch in the reader's language in the browser     | **batch 1** |
| 4   | Club page: matches and table start with the club, not after it           | **batch 1** |
| 5   | Freshness by kind of data; keep screens' data 30 min in the browser      | **batch 1** |
| 6   | Matches tab: the day's fixtures start loading with the tab               | **batch 1** |
| 7   | Fantasy rankings: one board per owner, page/search/sort done locally     | **batch 2** |
| 8   | News article and Pronostics: same Arabic double read as 3                | **batch 2** |
| 9   | Home and top players reuse the cached player pool                        | **batch 2** |
| 10  | One key per data set (fixture difficulty, gameweeks, club list)          | next        |
| 11  | Rows that navigate by `navigate()` (top players, search) become links    | next        |
| 12  | Standings, Clubs, News lists warm their data in the browser like Matches | later       |

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
  trending players and the top players page take the cached
  `["fantasy-players"]` pool through the query function's own client,
  instead of reading all of it again inside their reads
  (`getTrendingPlayers` and `getTopPlayersOfWeek` now take where the pool
  comes from; by default they still read it). The inner pool read does not
  retry on its own, so a failing pool is still asked twice in all, not four
  times. Home no longer reads trending players for a visitor (only a
  signed-in reader's Home shows them). The top players page asks for its
  gameweek's top five once the current gameweek is known, so a stand-in
  gameweek's read (now quick) cannot land first and show the wrong week.
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

### Checks

`bun run typecheck` clean; `bun run lint` no errors (the 31 warnings already
on main); `bun test` 5,947 pass, 17 skipped, 1 fail (the same Ramadan 2027
test as on main); `bun run build` passes.

## Remaining bottlenecks and next batch

1. Matches tabs (Calendrier / Classement / Pronostics) and some rows (top
   players, header search) navigate with buttons rather than links, so they
   do not load on intent (plan 11).
2. The same data under several keys: fixture difficulty (3 keys), available
   gameweeks (2), the club list (3), the news feed (2 shapes) (plan 10). The
   top players page still reads the gameweek list 3 times on a cold load.
3. Home's trending players exist only to name alerts, and in production the
   alerts are always empty: a signed-in Home still reads the top five for
   nothing (needs the owner's decision).
4. A first visit to a match still waits for 7 reads (the match, then six in
   parallel); loading ahead hides it only when the pointer or finger arrives
   early enough.
5. Every first page load renders on the server and reads the database, with
   no edge caching.

Recommended next batch: plan 10 and 11 (one key per data set; Matches tabs
and button rows load on intent), then plan 12.
