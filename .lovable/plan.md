## Goal

Add a global rankings page for fantasy teams — a season-wide leaderboard of every manager, not just private leagues.

Route: `/fantasy/rankings`, added as a new tab in the existing fantasy sub-navigation.

## What the page shows

1. **Header** — title + subtitle, with the current gameweek badge.
2. **My rank card** — a highlighted glass card at the top with the signed-in manager's overall rank, total points, gameweek points, and rank movement. Falls back to a "create your team" prompt when the user has no team.
3. **Podium** — top 3 managers rendered as a premium podium (crest, manager name, team name, points), with the leader raised.
4. **Ranking table** — rows 1..N with rank badge, club crest, manager/team name, gameweek score, total score, and rank-change indicator. Reuses the existing `LeagueTable` presentation language (its row markup is extracted/shared rather than duplicated).
5. **Controls** — Overall / Gameweek sort toggle, manager search, and "Jump to my rank" action. Sort and search live in the URL via `validateSearch` so the view is shareable.
6. **Pagination** — page through the leaderboard in chunks (50 per page), URL-driven.

All copy goes through i18n with new `fantasy.rankings.*` keys added identically to the `fr` and `ar` blocks. Full RTL support, ≥44px tap targets, glass surfaces per Design System V2.

## Data

The service layer today only exposes per-league standings (`getLeagues`, `getLeague`, `getLeagueStandings`) and the `LeagueStanding` type. Global rankings need a new read:

- Add `getGlobalRankings({ page, pageSize, sort, query })` to the fantasy service contract, returning `{ rows: LeagueStanding[]; total: number; myRank?: LeagueStanding }`.
- Implement it in the mock service (`fantasy-mock.ts`) by generating a deterministic seeded leaderboard of ~500 managers derived from the existing mock managers and clubs, so ordering is stable across reloads.
- Implement the cloud path in `fantasy-runtime.ts` / the Supabase repository by ranking `fantasy_teams` joined to the latest `fantasy_gameweek_results` (total points desc, tie-broken by gameweek points then team name), with the caller's own row resolved separately. Note: this is a read of existing tables — no schema change, no new migration — and the exact query shape will be verified against the repository before wiring.

Mock vs cloud selection continues to flow through the existing `selectFantasyDataMode` switch, so nothing changes for mock mode users.

## Technical details

- New route file `src/routes/fantasy.rankings.tsx` with `createFileRoute("/fantasy/rankings")`, its own `head()` metadata (unique title/description/og), `validateSearch` for `{ page, sort, q }`, `errorComponent` and `notFoundComponent`.
- Data read uses `queryOptions` + `useQuery` (keyed on lang/page/sort/query) consistent with other fantasy routes; the personal "my rank" read stays client-side so a public route never calls an auth-protected loader.
- New components under `src/components/fantasy/`: `RankingsPodium.tsx`, `MyRankCard.tsx`, and a shared `RankingRow.tsx` extracted from `LeagueTable.tsx` so both surfaces stay visually identical.
- `FantasySubNav.tsx` gains `{ to: "/fantasy/rankings", labelKey: "fantasy.tab.rankings" }`.
- Skeleton loading states matching the existing shimmer utilities; empty state when search returns nothing.
- Unit tests for the mock ranking generator (stable ordering, pagination boundaries, search filtering) and for rank-movement formatting.
