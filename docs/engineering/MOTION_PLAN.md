# Motion plan — making the app feel alive

Status: **all seven PRs built, plus the reveal card flip (#10, follow-up). Left out on purpose: pull-to-refresh (#13).** Covers the 13 animation ideas agreed with the
owner on 2026-10-02. Nothing here is built yet.

## What already exists (build on it, don't duplicate it)

- Motion tokens in `src/styles.css`: `--duration-tap` 120ms, `--duration-quick`
  180ms, `--duration-route` 260ms, `--duration-sheet` 320ms, `--duration-hero`
  420ms, and the easings `--ease-standard`, `--ease-emphasized`,
  `--ease-decelerate`. **Every new animation uses these, no raw numbers.**
- Utilities already in `src/styles.css`: `shimmer`, `press-tile`,
  `live-breathe`, `event-enter`, and the splash keyframes.
- `GoalMoment` (`src/components/matches/GoalMoment.tsx`) — the goal
  celebration. Its `tokenMs()` helper reads a token in JS.
- `UiSkeleton` (`src/components/ui-kit`) and `src/components/common/Skeletons.tsx`.
- A global `prefers-reduced-motion` rule that shortens every CSS animation and
  transition to almost nothing.

## Rules every item follows

1. **Reduced motion.** The global CSS rule only covers CSS. Anything driven
   from JavaScript (count-up numbers, row sliding, confetti, page transitions)
   must check `prefersReducedMotion()` itself and jump straight to the end
   state.
2. **Arabic (RTL).** Anything that slides sideways flips in RTL, the same way
   `shimmer` and the splash already do (a `--dir` custom property set to `1`
   or `-1`).
3. **Smooth on cheap phones.** Animate only `transform` and `opacity`. No
   animating width, height, top or left (the one existing exception,
   `event-enter`, stays as it is).
4. **No content hidden if something fails.** A fade-in must end visible even
   if JS never runs. Server-rendered HTML must show the page.
5. **No new animation library.** Everything below fits in CSS plus a few small
   hooks. This keeps the download size where `PERFORMANCE_2026_09_24.md` left
   it. If a later item truly needs one, it gets its own decision.
6. **Celebrations are rare.** Big moments are only for real events: a goal, a
   correct pick, a rank jump, a confirmed transfer, a captain choice.

## Phase 0 — shared toolkit (one small PR, everything else depends on it)

New file `src/lib/motion.ts`:
- `prefersReducedMotion()` — reads the media query, safe on the server
  (returns `true` there, so the server never renders a half-animated state).
- `tokenMs(name, fallback)` — moved from `GoalMoment.tsx`, which then imports it.
- `useCountUp(value, { durationToken })` — counts from the previous value to
  the new one with `requestAnimationFrame`, using the user's number format
  (Arabic/French digits as today).
- `useFlip(keys)` — remembers where each row was, and after a re-order slides
  each row from its old place to its new one (the "FLIP" trick: measure,
  move, animate the gap away).
- `useChangeFlash(value)` — returns `"up" | "down" | null` for ~1s after a
  number changes, to colour it briefly.

New CSS utilities in `src/styles.css`, next to the existing ones:
- `enter-rise` — fade + 8px rise on appear; `stagger` sets
  `animation-delay: calc(var(--i) * 40ms)` capped at 8 items.
- `pop` — quick scale 0.9 → 1.05 → 1 for badges and checkmarks.
- `flash-up` / `flash-down` — short green/red background tint that fades out.
- `wiggle` — small rotate back and forth (bell).
- Add the new ones to the reduced-motion block where they loop.

Tests: unit tests for `useCountUp` (ends on exact value, skips under reduced
motion), `useFlip` (no movement when order is unchanged), `useChangeFlash`.

## Phase 1 — quick wins across the whole app

_Built. Notes: only page-loading spinners became skeletons (`LoadingState`, the Fantasy gate, the shared loading panel); spinners inside buttons and the sign-in redirect screen stay. The stagger is on the Matches day list, a club's matches, the Home news preview, the Pépites top ten and the prediction fixtures._

**#4 Press effect on buttons and cards.**
- Extend `press-tile` with a hover lift (`translateY(-1px)` + stronger shadow,
  only on devices with a mouse: `@media (hover: hover)`), and a slight
  `scale(0.98)` on press.
- Apply it in the ui-kit primitives (`src/components/ui-kit/primitives.tsx`)
  and `src/components/ui/button.tsx` so every button gets it from one place,
  then to `MatchCard`, `ArticleCard`, `FixtureCard`, player rows.

**#5 Skeletons instead of spinners.**
- Inventory every `Loader2`/`animate-spin` used for *page or section loading*
  (found in: `FantasyScreenGate`, `FantasyFrame`, `AppShell`, `profile`,
  `clubs.$clubId`, `matches.$matchId`, `news.$articleId`, …). Replace each with
  a skeleton shaped like the final content, using `UiSkeleton`.
- **Keep** spinners inside buttons while a form submits (login, register,
  saving) — that is the right signal there.
- Add any missing shapes to `Skeletons.tsx` (match detail header, club page,
  article page).

**#3 Cards that appear one after another.**
- Add `enter-rise stagger` with `style={{ "--i": index }}` to list items in:
  match lists (`matches.index`, `ClubMatchList`), news lists, fantasy player
  lists, Pépites top-ten, prediction cards.
- Only on first show of a list, not on every refresh (otherwise live updates
  that arrive every few seconds would re-animate everything).

Check: Playwright run on a 375px screen in light, dark and Arabic; record a
short video of each screen to review.

## Phase 2 — numbers and tables that react

_Built. Notes: `AnimatedNumber` renders plain text (a text change outside a live region is not announced, so no hidden duplicate is needed). Count-up and flash are on the Fantasy rank card (points and rank), the Home Fantasy card, the Fantasy points total, the league table and the predictions board. Rows slide on the league table, the predictions board and the standings. Not done: the Pépites ranking (its rows re-order when the reader changes the sort, which should not animate 100+ rows), `PointsChart` labels, and Pépites scores (static per edition)._

**#1 Numbers that count up.**
- Use `useCountUp` in: `MyRankCard`, `FantasySummaryCard`, points on
  `fantasy.points`, the predictions score total, `PointsChart` labels, Pépites
  scores.
- Rank change: `useChangeFlash` adds `flash-up`/`flash-down` and a small ▲/▼
  arrow for ~1s.
- Screen readers get the final number only (the animated text sits in an
  `aria-hidden` span next to a visually hidden real value).

**#2 Table rows slide when positions change.**
- Apply `useFlip` to `StandingsTable` (matches), `LeagueTable` (fantasy),
  `PredictionsLeaderboard`, `PepitesRanking`.
- Rows need a stable key (club id / user id), not the row position.
- Skip the slide when the whole table is replaced (e.g. switching season or
  gameweek) — only animate when the same table updates.

## Phase 3 — moving between pages

_Built. Notes: every page renders its own `AppShell`, so the tab bar is a new component on each navigation. The pill's last position is therefore remembered at module level (written only in effects, so the server never reads it) and a new bar starts there and slides. The pop is a scale-only bounce (`tab-pop`) so the icon is never hidden if the bar is redrawn part-way through. Page transitions: `src/lib/page-transition.ts` picks forward / back / fade; nothing runs for search-only changes, under reduced motion, or on the first page. Measured: the pill slides in French, mirrors in Arabic, and jumps under reduced motion; back restores the scroll position. The tab bar's pill-only background contract test (`shell.option-a.test.tsx`) was updated to the sliding pill._

**#11 Smooth page changes.**
- Turn on TanStack Router's built-in view transitions
  (`defaultViewTransition` in `src/router.tsx`). Browsers without support just
  switch pages as today.
- Default: quick cross-fade (`--duration-route`). Going deeper (list → detail)
  slides in from the reading side; going back slides the other way. Flip in RTL.
- Keep the top bar and bottom nav still during the transition (give them their
  own `view-transition-name`).
- Under reduced motion, turn view transitions off entirely.
- Check that scroll restoration still lands in the right place.

**#12 Bottom tab bar.**
- In `src/components/shell/BottomNav.tsx`, the active tab's gradient pill
  becomes one shared element that slides to the new tab (absolutely positioned,
  moved with `transform`), instead of appearing/disappearing per tab.
- The newly active icon does a `pop`.
- Keep `aria-current` and the label weight change (the file's comment says not
  to remove them).

## Phase 4 — football moments

_PR 5 built (#9 live cards, #8 pronostics); PR 6 built (#6 pitch, #7 captain and transfers: the pitch rows drop in goalkeeper first, a swap slides both players, the new captain gets a gold ring and a popped C, a confirmed transfer throws a 24-piece CSS confetti burst; none of it under reduced motion). `useFlip` now records positions inside the container after every render and with any slide in flight taken out, so scrolling between renders no longer throws a slide off (fixes a flaw in the PR 3 version, which recorded viewport positions only when the order changed). `fantasy/Pitch.tsx` is unused, so the pitch work is in `FplPitch` and `UiPitchSurface`. #10 remains. Notes: the live minute ticks at most ONE minute ahead of the data and snaps back to it on every refresh, so a stalled feed is never shown as a running clock; it does not tick at half-time. The progress bar is two halves with a gap, filled by `scaleX` from the inline start. A pick is "locked in" only when the server's copy equals the pick (signed-in readers); guests' picks stay on the phone and do not celebrate. A result celebrates only if it arrives while the page is open. The match page's own header bar keeps its width-based fill, fed by the ticking minute._

**#9 Live match cards.**
- `MatchCard`, `MatchScoreHeader`, `LiveStrip`: when the score changes, the
  digit flips (old slides up and out, new slides in) and flashes once.
- Match minute ticks on its own between refreshes (from kick-off time), so it
  isn't frozen between data refreshes.
- Thin progress bar along the bottom of a live card: 0–90 min, half-time pause
  shown as a gap, `transform: scaleX()` only.
- The goal celebration (`GoalMoment`) stays the one big moment; this is the
  quiet version for every other card.

**#8 Pronostic locked in.**
- `MatchPredictionCard`, `FixturePredictionCard`, `SwipeDeck`: on successful
  save, a checkmark `pop`s and the card does a small bounce. Only after the
  server confirms, never on tap.
- When results arrive: correct pick → green glow + points count up (uses #1);
  exact score → slightly bigger celebration; wrong pick → plain, no shake.

**#6 Pitch players dropping in.**
- `src/components/fantasy/Pitch.tsx`: on first show, players drop in row by row
  (goalkeeper first, then defence, midfield, attack) using `stagger`.
- Swapping two players (`SquadBuilderScreen`, `PlayerActionSheet`): they slide
  to each other's places using `useFlip` keyed by player id.

**#7 Captain and transfers.**
- Choosing captain (`PlayerActionSheet`, `PlayerShirt`/`PlayerNameplate`): a
  gold ring pulses once around the shirt and the "C" badge `pop`s.
- Confirming transfers (`fantasy.transfers`): a small confetti burst. Built
  in-house: ~20 small CSS particles, removed after 1s, no library. Skipped under
  reduced motion (show the checkmark only).

**#10 Pépites reveal.**
- Player cards (`PepitesPlayerPage`, `TopTenList`, `PepitesReveal`): gentle 3D
  tilt following the pointer, only on devices with a mouse, max 6°.
- Stat bars fill from start to end when scrolled into view
  (`IntersectionObserver`, once per page), flipped in RTL.
- `PepitesReveal` (weekly reveal) gets a short card-flip reveal per player.

## Phase 5 — notifications

_Built, with #10 (PR 7). Notes: the bell shakes and the badge pops only when the unread count goes UP while the page is open. Inbox cards that arrive above the old first card fade in one by one (`newAtTop`); older cards added by "load more", a filter switch and the first load do not. #10: the stat bars, the score ring and the minutes bars fill the first time they are scrolled into view (server HTML and reduced motion show them finished), and the player photo leans up to 6 degrees towards a mouse (`TiltFrame`; never touch or pen). The weekly-reveal card flip was added afterwards: on `/pepites/revelation` each player's photo (or shirt) card turns over from a night-blue back showing the rank, and the name, figures and editor's line rise in after it; it replays for every player of the story (keyed by player id) and shows the front straight away under reduced motion. Pépites is switched off on the test backend, so #10 was checked on a scratch page, not in the app._

**#13 New items and the bell.**
- `NotificationBell`: when the unread count goes up (the 60s check in
  `src/services/use-my-notifications.ts`), the bell does one `wiggle` and the badge `pop`s.
- `notifications` page: new items slide in at the top (`enter-rise`).
- **Pull-to-refresh: recommend not building it.** Phones' browsers already do
  their own pull-to-refresh, and a custom one fights it. If wanted later, only
  for the installed (home-screen) app, as a separate decision.

## Order and size

| PR | Contents | Rough size |
| --- | --- | --- |
| 1 | Phase 0 toolkit | small |
| 2 | #4 press, #5 skeletons, #3 stagger | medium (many files, simple changes) |
| 3 | #1 count-up, #2 sliding rows | medium |
| 4 | #11 page transitions, #12 tab bar | small–medium |
| 5 | #9 live cards, #8 pronostics | medium |
| 6 | #6 pitch, #7 captain/transfers | medium |
| 7 | #10 Pépites, #13 notifications | small–medium |

One PR at a time, each reviewed on a phone-sized screen before the next.

## How each PR is checked

- `bun run lint`, `bun run typecheck` and `bun test`, as CI does.
- Playwright screenshots/video at 375px in light, dark, French and Arabic.
- Turn on "reduce motion" in the browser and confirm nothing moves and nothing
  stays hidden.
- No horizontal overflow — measured per `CLAUDE.md` (not `scrollWidth`, since
  `overflow-x: clip` hides it).
- Performance: Chrome performance panel on a throttled CPU (4×) for the match
  list and the fantasy pitch; no dropped frames during the animations.

## Out of scope

- No backend or database changes — this is front-end only.
- No sound or vibration (could be a later idea).
