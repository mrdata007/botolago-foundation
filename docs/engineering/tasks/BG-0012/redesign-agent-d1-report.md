# BG-0012 — Agent D1 completion report (Matches / results / tables)

Branch: `agent/d1-matches-redesign`, based on `agent/news-cms-launch` @
`668ea3d` (the frozen News/CMS checkpoint + route-ownership map).

## Starting point

`src/routes/matches.index.tsx`, `matches.$matchId.tsx` and
`src/components/matches/*` were **not** literally unstyled: they already used
a coherent "Design System V2" (glass surfaces, `--brand-*`/`--surface-*`
tokens, real loading/empty/error states via `States`/`Skeletons`) and were
already wired to real backend data (no fabricated scores/stats — e.g. the
"momentum" tab already showed an honest "not available" message instead of
invented numbers). The one thing the task's premise got exactly right: **zero
`--fpl-*` token usage**, confirmed by grep before starting. So the work here
is (a) pulling BotolaGO Fantasy's token language into these screens where it
adds real product value, and (b) closing two genuine functionality gaps
against real, already-available backend data that the previous pages left on
the table.

## What changed

### 1. Match lineups — new tab, backed by real data that was already exposed but unused
`FootballRepository.getLineups()` (contract in
`src/backend/football/contracts.ts`, implemented for real by
`SupabaseFootballRepository` via the `football_match_lineups` RPC) was never
called anywhere in the frontend. The match-detail "Momentum" tab had no
backing data source at all (no `getMomentum` method exists anywhere in the
repository contract) and only ever rendered a static "unavailable" message —
so per the ownership doc's instruction ("only build tabs for data that's
genuinely there"), I removed it and replaced it with a **Lineups** tab that
is genuinely backed by data:
- `src/services/football.ts` — `getMatchDetailPage` now also calls
  `repository.getLineups(...)` and returns `lineups` alongside the existing
  fields. No new fabricated fields, just wiring an already-existing contract
  method through.
- `src/components/matches/LineupsView.tsx` (new) — renders formation,
  starting XI (grouped goalkeeper → defender → midfielder → forward, then by
  the provider's own on-pitch order), substitutes, and a captain badge. The
  captain armband uses `var(--fpl-amber)` — a deliberate, thematically
  appropriate tie to BotolaGO Fantasy's captaincy concept. When the provider
  has not published lineups yet (true today for the mock repository, which
  returns `[]`), it renders `matches.detail.no_lineups` via the shared
  `EmptyState` rather than guessing a line-up.
- `src/components/matches/MatchTabs.tsx` — tab set is now
  `summary | stats | lineups | h2h` (was `summary | stats | momentum | h2h`).
- `src/routes/matches.$matchId.tsx` — wires the new tab; all `momentum.*`
  i18n keys were removed (they were referenced nowhere else in `src/`,
  confirmed by grep).

### 2. Full sortable standings table — real data that was being truncated
`StandingRowDto` (and the domain `TableRow` type) already carries
`won`/`drawn`/`lost`/`goalDifference`/`points`/`form`, all populated by both
the mock and Supabase repositories — but the Matches index page only ever
rendered `# / Team / Played / GD / Pts`, silently dropping W/D/L and the
real recent-form string entirely. Per the ownership doc's open question
("D1 to confirm whether standings live inside matches.index.tsx or need a
new minimal addition"): they do live there, and there **is** a real backing
data source (`getStandings`), so I built it out properly instead of adding a
separate route:
- `src/components/matches/StandingsTable.tsx` (new) — full table with W/D/L
  columns (collapsed on narrow viewports), goal difference, a last-5-results
  "form" strip, and **real client-side column sorting** (rank/played/W/D/L/
  GD/points) — a pure re-order of already-fetched rows, nothing recomputed
  or invented. `sortStandings` is exported and unit-tested in isolation.
  Form chips use the Fantasy palette (`--fpl-green`/`--fpl-grey`/
  `--fpl-pink` for win/draw/loss) so match-form reads consistently with the
  rest of the product's visual language.
- `src/routes/matches.index.tsx` — the old ~70-line inline `<table>` block is
  replaced by `<StandingsTable rows={...} clubById={...} />`; the loading /
  error / empty branches around it are unchanged. Removed now-unused
  `ClubCrest` import and `tr` destructure from that file (both moved into
  `StandingsTable`).

### 3. i18n
Added new `fr`/`ar` keys for the lineups tab (`matches.detail.tab.lineups`,
`lineups_title`, `no_lineups`, `lineup_provisional`, `starting_xi`,
`substitutes`, `captain`, `position.gk/def/mid/fwd`) and the standings table
(`table.won(_short)`, `drawn(_short)`, `lost(_short)`, `form`,
`form_win/draw/loss`, `sort_by`, `expand`, `collapse` — the last two are
currently unused scaffolding I left out of the shipped UI and should be
removed if the table doesn't grow a collapse affordance later; flagging
rather than silently leaving dead keys). Removed the now-dead `momentum.*`
keys from both languages. Verified via `bun test src/i18n/i18n-gate.test.ts`
that this doesn't regress the committed W1–W4 warning baselines — two of my
first-draft translation lookups used a dynamic key lookup table, which the
i18n usage-audit correctly flagged as "opaque" (W4); I refactored both to
literal-key switches/call sites instead of touching the committed baseline.

## Real data sources used (and what's genuinely blocked)

| Feature | Source | Status |
|---|---|---|
| Fixtures/results by date | `FootballRepository.getMatchesByDate` | Already wired, untouched |
| Live score/timeline/stats | `getMatchDetail` / `getTimeline` / `getStatistics` | Already wired, untouched |
| Standings (full, sortable) | `getStandings` (`StandingRowDto`) | **Newly exposed** — was truncated to 4 columns |
| Lineups (starting XI, bench, formation, captain) | `getLineups` (`MatchLineupDto`) | **Newly wired** — was never called |
| Head-to-head | `getHeadToHead` | Already wired, untouched |
| Match "momentum" (pressure/xG-over-time) | *(no contract method exists)* | **Blocked by real data** — removed the placeholder tab rather than keep a fake one |
| League-wide full standings page (separate route) | `getStandings` exists, but no dedicated `/standings`-style route was in scope or requested by the ownership map | Left as a table inside Matches index, per the ownership doc's own framing of this as an open question I was asked to resolve |

No scores, statistics, standings, or lineup data were invented anywhere.
Every new UI element consumes a field that a real repository (mock and/or
Supabase) genuinely returns, `MockFootballRepository.getLineups()`/
`getStatistics()` returning `[]` today is a **mock-data completeness gap**
that both `LineupsView` and the pre-existing `StatComparison` already handle
via explicit empty states — the Supabase repository implements both for
real via RPCs (`football_match_lineups`, `football_match_statistics`), so
these are correctly not "blocked", just currently empty in the dev/mock
environment.

## Out of scope / untouched
- `AppShell`, `MatchCard`, `ClubCrest`, `Section`, `SectionHeader`, `States`,
  `Skeletons` (Agent A's files) — consumed as-is, no prop-contract changes
  requested or made.
- No changes under `src/routes/admin.*`, `src/backend/news/*`,
  `supabase/*`, `src/routes/index.tsx`, `__root.tsx`, `fantasy.*`,
  `auth.*`, `profile.tsx`, `news*`, or `src/components/shell|common/*`.
- Did not build a dedicated `/standings` route or a pitch-graphic lineup
  visualization (Premier-League-style) — the in-tab list/table
  presentations cover the real data without adding new routes outside this
  agent's file list.
- Left `matches.table.expand`/`collapse` i18n keys added but unused (see
  above) — safe to drop in a follow-up if the standings section never grows
  a collapsed/expanded state.

## Validation
- `bun run typecheck` — clean.
- `bun test` (full suite) — **844 pass, 0 fail** (a couple of
  Postgres-dependent backend tests self-skip with no local Postgres
  available, unrelated to this change).
- `bun run lint` scoped to every file this task touched
  (`npx eslint <files>`) — 0 errors; 3 pre-existing-pattern warnings
  (`react-refresh/only-export-components`, the same kind already present on
  `MatchTabs.tsx` before this change, from files that export both a
  component and a small helper/type).
- `bun run build` — succeeds (Vite + Nitro/Cloudflare output generated
  normally).

## Files touched
- `src/services/football.ts`
- `src/services/football.test.ts`
- `src/components/matches/MatchTabs.tsx`
- `src/components/matches/LineupsView.tsx` (new)
- `src/components/matches/LineupsView.test.ts` (new)
- `src/components/matches/StandingsTable.tsx` (new)
- `src/components/matches/StandingsTable.test.ts` (new)
- `src/routes/matches.$matchId.tsx`
- `src/routes/matches.index.tsx`
- `src/i18n/dictionaries.ts`
- `docs/engineering/tasks/BG-0012/redesign-agent-d1-report.md` (this file)
