# Page speed: fewer, non-repeated requests (2026-10-11)

Owner-approved performance-only change (AGENTS.md, "Screen work"). Branch
`claude/page-speed`. No database write, no migration, no workflow, no visual or
behavioural change.

## What was observed

Live QA on 2026-10-11 and a local production build (`vite build`, served on
port 5193, same public Supabase backend, mobile 390x844, French): cold content
in 3-5 s; the home page never reaches network idle; the same RPCs fired more
than once on Fantasy pages; Fantasy pages slow to settle.

Measured before the change, per page (RPC and image calls to Supabase; the
numbers are in the pull request description):

- `/fantasy/top-players`: 36 Supabase calls, 20 of them an identical call made
  a second or third time (the 8-page player pool walked three times, the
  gameweek list three times, the season statistics three times).
- `/fantasy/fixtures`: waits for the whole player pool (8 serial pages) that it
  never reads before it draws; `fantasy_hub` read twice.
- Home: reads the hub, the top five, the season statistics and the whole player
  pool (10 RPCs, serial) to dress an alert strip that is always empty in the
  Supabase mode.

## What must be preserved

- Every screen looks and reads the same, in French and Arabic, mobile and
  desktop, LTR and RTL. No copy, spacing, colour or component change.
- Fantasy rules, scoring, gameweek lifecycle, prices, ownership, who may see
  what: untouched. The same RPCs return the same data to the same screens.
- Live data stays live: match polling intervals, the live strip, refetch on
  focus and every `staleTime` stay as they are.
- A failed read is never cached or shared.
- Mock mode behaves as before.

## Improvements

1. One read for public season data that several queries start together: a
   `shareRead` helper (5 s window, browser only, failures not shared) under
   `allPlayers()` and the gameweek list in `fantasy-runtime.ts`.
2. Top players no longer fetches the round of "gameweek 1" and throws it away
   when the current gameweek arrives.
3. The home alert strip reads the player list only when there is an alert to
   dress.
4. The Fantasy fixtures grid no longer waits for the player pool
   (`useFantasyScreen({ needsPlayers: false })`).

Found and left alone (needs a product or backend decision, listed in the pull
request): Arabic readers fetch French data first and Arabic again after
hydration (the stored language is applied after the first render); the player
pool is paged 100 at a time by the RPC; the first-load JavaScript is about
465 KB gzip across 87 module preloads.

## Acceptance criteria

Measured the same way before and after (Playwright, Chromium, 390x844, French,
median of 3 cold loads, local production build, own port):

- Identical Supabase calls (same function and arguments) on the six measured
  pages (home, `/matches`, a match page, `/fantasy`, `/fantasy/top-players`,
  `/fantasy/fixtures`): 0 on each (before: 20 on top players, 1 on fixtures).
- `/fantasy/top-players`: at most 16 Supabase calls (before: 36).
- `/fantasy/fixtures`: at most 12 Supabase calls (before: 30), and its content
  appears at least 1 s sooner.
- Home: at most 23 Supabase calls (before: 33), none of them a
  `fantasy_player_pool` page.
- No page makes more requests than before; none aborts a request that it
  re-fires.
- Screenshots, French and Arabic, mobile and desktop, before and after, show
  the same pages (the live data in them differs only as the data moved).
- `bun run typecheck`, `bun run lint`, `bun run format:check` and the unit
  tests pass as they did on `main`.
