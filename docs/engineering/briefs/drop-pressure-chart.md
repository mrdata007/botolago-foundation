# Drop the pressure chart from the match page: screen brief

Owner decision, 2026-10-10: BotolaGO is moving off SportsMonks to SofaScore.
The pressure chart is SportsMonks-only, so it leaves the match page.

Branch `claude/drop-pressure-chart`, from `origin/main`. Frontend only.

## What was inspected

`/matches/$matchId`, Stats tab: `StatComparison.tsx` renders `PressureChart`
(from `pressure-bins.ts`) above the statistics card, and also above the
empty-state message when there are no statistics. The route reads
`detailQ.data.pressure` and passes it down.

## What must be preserved

- The Stats tab otherwise as today: heading and live pill, the two-club
  header, possession split bar, every statistic row, expected goals rows,
  and the empty-state message that follows `phase`.
- Every other tab, the score header, the top bar, French and Arabic (RTL).
- Backend pressure contracts, repository methods, mock data, generated
  types and the service's `pressure` field stay in place; they are retired
  later with the SportsMonks code. Nothing under `supabase/`,
  `scripts/backend/` or `src/backend/` changes.

## The change

1. `StatComparison` no longer takes a `pressure` prop or renders a chart.
2. The route stops reading and passing `pressure`.
3. `PressureChart.tsx`, `pressure-bins.ts` and its test are deleted (nothing
   outside `src/components/matches` imports them).
4. The `matches.pressure.*` strings in the French and Arabic dictionaries,
   used only by the chart, are removed.
5. `match-page.option-a.test.tsx`: the pressure-chart cases go; the xG cases
   stay, plus one case asserting no pressure chart renders.

## Acceptance criteria

Visual: at 390px and 1280px, in French and Arabic, the Stats tab shows the
heading, then the statistics card directly; no "Pression" / "الضغط" block, no
gap where it was. Before/after screenshots are in `drop-pressure-chart/`.

Functional: lint, typecheck and the matches unit tests pass; no remaining
import of the deleted files; no horizontal overflow introduced.
