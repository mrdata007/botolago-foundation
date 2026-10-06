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
| 7   | Fantasy rankings: one board per owner, page/search/sort done locally     | next        |
| 8   | News article and Pronostics: same Arabic double read as 3                | next        |
| 9   | Home and top players reuse the cached player pool                        | next        |
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

Pending: the before/after runs are still in progress and land in the next
commit.

## Trade-offs

- **A resting pointer.** On a computer, after a click the pointer stays
  where it was; whatever link the new page puts under it is loaded ahead.
  Seen in testing: one match loaded ahead (7 reads) after opening a club.
- **Swipes.** On a phone, a swipe that starts on a card is a touch on it,
  so that card's page loads ahead (cost being measured).
- **Tab title for Arabic readers.** In the browser the match and club pages
  now read Arabic data for an Arabic reader, so the browser tab's title
  shows the club names in Arabic (it showed them in French). Search engines
  still get the French title from the server.

## Remaining bottlenecks and next batch

1. Fantasy rankings re-download the whole board on every keystroke, page and
   sort (plan 7). Largest remaining waste.
2. Home (signed in) and top players each load the full player pool under
   their own keys (plan 9): about 9 reads each, one after another.
3. News article and Pronostics have the Arabic double read (plan 8); the
   article's related stories wait for the article though they need only its
   id.
4. A first visit to a match still waits for 7 reads (the match, then six in
   parallel); loading ahead hides it only when the pointer or finger arrives
   early enough.
5. Every first page load renders on the server and reads the database, with
   no edge caching.

Recommended next batch: plan 7, 8 and 9 together (Fantasy rankings, the
Arabic double read on the article and Pronostics, and one player pool),
then 10 and 11.
