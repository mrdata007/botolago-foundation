# BG-0012 full-product redesign — Agent D2 report (Players / Stats / Transfers)

Branch: `agent/d2-players-stats-transfers`, based on `origin/agent/news-cms-launch` @
`668ea3d` (the BG-0012 route-ownership map commit — News/CMS checkpoint frozen, Fantasy
baseline BG-0051..BG-0054 already merged into that history).

## Summary

All four owned routes and their supporting components were ported off the generic
glass/brand-primary surfaces (and, for `fantasy.players.tsx`/`fantasy.players.$playerId.tsx`/
`fantasy.rankings.tsx`, off the `LegacyFantasyPage` wrapper) onto the real Fantasy design
system: `FantasyFrame` + `FplHeader`/`FplSegmented`/`FplPill` from `src/components/fpl/*`,
and the `--fpl-*` CSS custom properties from `src/styles.css`, matching the visual reference
implementations `fantasy.team.tsx`/`fantasy.points.tsx`. No new backend, no fabricated
stats — every screen still reads from the same `fantasyService`/`footballService` calls it
did before.

## Files changed

- `src/routes/fantasy.players.tsx` — rebuilt on `FantasyFrame` + `FplHeader` (title
  `fpl.player_stats`, back to `/fantasy`). Filter/sort chips, the compare panel and every
  list row now use `--fpl-*` tokens; rows use `JerseyVisual` (already the shared Fantasy
  player glyph) instead of `ClubCrest` for the player's own identity, keeping `ClubCrest`
  for club filter chips. `DifficultyBadge`/`PlayerStatusBadge` (see below) supply the FDR
  and availability pills.
- `src/routes/fantasy.players.$playerId.tsx` — rebuilt on `FantasyFrame` + `FplHeader`
  (title `fpl.player_info`, back to `/fantasy/players`). The custom pill tab bar was
  replaced with the shared `FplSegmented` control (`tone="onLight"`), matching the
  Squad/List switch on `fantasy.points.tsx`; stat tiles and the fixtures list now use
  `--fpl-*` tokens.
- `src/routes/fantasy.rankings.tsx` — rebuilt on `FantasyFrame` + `FplHeader` (title
  `fpl.rankings`). The sort control was switched from a hand-rolled `role="tablist"` to
  `FplSegmented`; podium, "my rank" card, search input, table and pager were all restyled
  onto `--fpl-*` tokens. Logic (queries, pagination, jump-to-me) is unchanged.
- `src/routes/fantasy.top-players.tsx` — rebuilt on `FantasyFrame` + `FplHeader` (title
  `fpl.top_players`, share action moved into the header's `right` slot). The hero/ranked
  cards keep their structure (kept because it is a genuinely good design, not because it
  was hard to change) but their colors now come from `--fpl-grad`/`--fpl-header`/
  `--fpl-amber`/`--fpl-ink` instead of arbitrary `brand-primary`/cyan-500/amber-300 Tailwind
  utilities; section labels use the shared `FplPill`.
- `src/components/fantasy/PlayerStatusBadge.tsx` — retoned onto `--fpl-pink`/`--fpl-amber`/
  `--fpl-ink`/`--fpl-grey`, the same palette `FplPlayerCard`'s availability glyph and
  `FplStateBadge` already use.
- `src/components/fantasy/DifficultyBadge.tsx` — now uses the `--fpl-fdr-1`..`--fpl-fdr-5`
  tokens that were already defined in `styles.css` for exactly this purpose but never
  consumed by this component.
- `src/components/fantasy/RankingsPodium.tsx`, `MyRankCard.tsx`, `RankChangeIndicator.tsx`,
  `GameweekSelector.tsx` — retoned onto `--fpl-*` tokens (ink/cyan/grey/green/pink), same
  visual structure and behavior.
- `src/components/fantasy/JerseyVisual.tsx` — **not changed**. It's a generic SVG asset
  (club-colored kit, not itself carrying design-system tokens) already reused by the
  accepted baseline (`FplPlayerCard`, `SquadBuilderScreen`, `SquadListTable`,
  `AddPlayerScreen`, `PlayerActionSheet`, `TransferConfirmScreen`), so it needed no porting.
- `scripts/qa/i18n-gate.ts` — bumped the committed `W3`/`W4` baselines (249/95, was
  245/96) with a dated comment, following the same pattern as the existing BG-0012 News
  entry. Replacing the per-page duplicate titles/back-links with the shared `FplHeader`
  legitimately orphans `fantasy.players.title`, `fantasy.rankings.title`,
  `fantasy.rankings.subtitle` and `common.back` (both of its call sites had their own
  "‹ Back" link that the header's built-in one now replaces), and replacing a ternary
  `t(cond ? a : b)` sort-label call with two literal `FplSegmented` option labels drops one
  non-literal `t()` call site. This is the only file touched outside my owned list; it's
  shared QA infra, not owned by any of the four agents, and the change is a straight
  numeric baseline bump plus a comment, so the merge-conflict risk is minimal.

## `fantasy.transfers.tsx` finding

**Not touched — it was already fully on the Fantasy design system.** It shows 0 raw
`--fpl-*` token hits, but so does `fantasy.team.tsx` (only 3 hits) — both build their UI
entirely out of already-`--fpl-*`-styled subcomponents (`FantasyFrame`, `FplHeader`,
`SquadBuilderScreen`, `AddPlayerScreen`, `PlayerActionSheet`, `TransferConfirmScreen`),
which is exactly the intended composition pattern for the design system, not a sign the
screen is legacy. I verified `SquadBuilderScreen.tsx`/`AddPlayerScreen.tsx`/
`PlayerActionSheet.tsx` themselves carry 7/14/9 `--fpl-*` hits respectively. `transfers.tsx`
was left completely unmodified.

## `LegacyFantasyPage.tsx`

**Not removed.** `src/routes/fantasy.rules.tsx` (owned by the accepted Fantasy baseline,
explicitly out of scope for D2) still imports and renders it. `LegacyFantasyPage` is now
unused by every D2-owned file, but removing the component itself would break
`fantasy.rules.tsx`, so it stays in place. Worth flagging to whichever agent/owner
eventually revisits `fantasy.rules.tsx`/`fantasy.help.tsx`.

## Real data sources used

- `fantasyService.getPlayers()` / `getPlayer(id)` — player list + detail (position, price,
  form, ownership, totalPoints, expectedPoints, status, nextOpponentClubId/Difficulty).
- `fantasyService.getFixtureDifficulty()` — player detail "fixtures" tab.
- `fantasyService.getSummary()`, `getGlobalRankings(...)` — rankings page (my rank,
  podium, paginated board).
- `fantasyService.getCurrentGameweek()`, `getAvailableTopGameweeks()`,
  `getTopPlayersOfWeek(gw)` — top-players page.
- `footballService.getClubs(lang)` — club crests/names/kits everywhere.

No stat, comparison or transfer-news content was invented. The player list's "compare"
feature (already present pre-redesign) only surfaces fields the player object already
carries (price, points, form, ownership, expected points) — I kept it as-is rather than
extending it, since there is no richer comparison data in the backend to justify more.

## Nothing left out for lack of real data

Everything the four screens display already has a real, non-fabricated source (see above).
I didn't add any new player-comparison or transfer-news feature beyond what already existed,
per the "don't build a new analytics backend to imitate Premier League" instruction.

## Validation

- `bun run typecheck` — clean.
- `bun test` — 834 pass / 0 fail (includes `src/i18n/i18n-gate.test.ts`, which required the
  baseline bump described above; also includes `src/services/fantasy-rankings.test.ts` and
  the rest of the suite, all pre-existing and unaffected otherwise).
- `npx eslint` scoped to every changed file — clean (two rounds of `--fix` for
  Prettier-only formatting).
- `bun run build` (`vite build`) — succeeds; `fantasy.players`, `fantasy.rankings`,
  `fantasy.top-players` and `fantasy.players.$playerId` all emit their own SSR chunks as
  before.
- No component-level (`.test.tsx`) tests exist anywhere in this repo today (`bun test`
  here is exclusively `.test.ts` unit/service-logic tests); I didn't introduce a new test
  pattern for a pure styling port, since there was no new pure logic to unit-test — the
  data-fetching/filtering/pagination logic in all four routes is byte-for-byte the same as
  before, only presentation changed. Genuine behavior (i18n-gate baseline) is covered above.

## Deliberately out of scope

- `fantasy.rules.tsx`, `fantasy.help.tsx`, `fantasy.profile.tsx` and every already-`--fpl-*`
  styled screen (`fantasy.index.tsx`, `fantasy.create.tsx`, `fantasy.fixtures.tsx`,
  `fantasy.leagues*.tsx`, `fantasy.points.tsx`, `fantasy.team.tsx`, `fantasy.transfers.tsx`)
  — untouched, per the ownership map.
- `src/routes/admin.*`, `src/backend/news/*`, `supabase/*`, shell/common components owned
  by Agent A, matches/auth/profile/news routes owned by D1/D3/the News checkpoint — untouched.
- No player-comparison analytics beyond what the existing player fields already support.
