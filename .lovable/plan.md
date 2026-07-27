## Goal

Redesign `/matches/:id` into a flagship live match experience: a live-first scoreboard header, a key-events timeline, team stat comparison bars, and a momentum graph — in Design System V2, fully bilingual FR/AR with RTL, mobile-first.

## Current state (verified)

- `src/routes/matches.$matchId.tsx` (388 lines) already renders a score header with `LiveIndicator`, head-to-head, standings rows, share, and related news.
- `footballService.getMatchDetailPage` returns `{ match, clubs, standings, headToHead }`.
- The `Match` domain type has only `status`, `minute`, scores, venue, gameweek — **no events, no stats, no momentum**. Those need a new typed layer.

## What gets built

### 1. Typed live-detail data (mock, deterministic)

Extend the domain with new read-only types: `MatchEvent` (`goal | own_goal | penalty | yellow | red | sub | var`, minute, clubId, player name as `LocalizedString`, optional assist), `MatchTeamStats` (possession, shots, shots on target, corners, fouls, offsides, saves, pass accuracy), and `MatchMomentumPoint` (minute bucket, -100..100 pressure value).

Add `footballService.getMatchLiveDetail(id, lang)` returning `{ events, stats, momentum }`. Values are generated deterministically from the match id + current score so they are stable across renders and consistent with the scoreline (goal events always sum to the displayed score). No Supabase, no schema change.

### 2. Live-first header

- Larger crest-vs-crest scoreboard, big score, pulsing live chip with minute and stoppage.
- Live-only progress bar of match time (first half / half-time / second half), venue + gameweek meta row.
- State-aware: scheduled shows countdown to kickoff, finished shows FT badge, postponed shows its own notice.
- Live polling: refetch every 30s while `status === "live"` only (React Query `refetchInterval`), paused when the tab is hidden.

### 3. Tabbed body

Sticky segmented control: **Summary · Stats · Momentum · H2H**. Tabs are URL-driven via `validateSearch` so a tab is shareable and back-navigable.

- **Summary** — vertical timeline of key events, alternating home/away sides (mirrored in RTL), icons per event type, goal rows showing the running score, half-time divider, and a "latest" highlight for the most recent live event.
- **Stats** — possession donut/split bar plus dual-direction comparison bars per metric, with the leading side accented in brand blue and numeric labels on both ends.
- **Momentum** — smooth area chart above/below a centre line showing which team is pressing, with goal markers pinned on the timeline.
- **H2H** — existing head-to-head and standings-row comparison, kept and restyled.

### 4. Polish

- New keys in FR + AR dictionaries for every label (no hardcoded strings); numbers formatted with locale.
- Skeletons per tab reusing the shimmer utilities; empty state when a match has no events yet ("no key moments yet").
- All controls ≥44px, `aria-live="polite"` on the live score and latest event, chart has a text summary for screen readers.
- Route `head()` keeps a unique title/description built from the two club names.

## Technical notes

- New components under `src/components/matches/`: `MatchScoreHeader.tsx`, `MatchTabs.tsx`, `EventTimeline.tsx`, `StatComparison.tsx`, `MomentumChart.tsx` (SVG, no new dependency).
- New `src/services/match-live.ts` with pure generators + unit tests (score consistency, momentum bounds, RTL-agnostic ordering).
- `matches.$matchId.tsx` becomes composition only; existing H2H/related-news sections are moved into tabs rather than rewritten.
- Verification: `tsgo` typecheck, full vitest suite, and a Playwright screenshot pass on a live, finished, and scheduled match in both FR and AR.
