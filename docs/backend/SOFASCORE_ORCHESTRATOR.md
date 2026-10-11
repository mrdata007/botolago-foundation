# Fantasy orchestrator and ops health with SofaScore as the source

Production football data now comes from SofaScore, and SportsMonks is not paid
for. This page says what the hourly Fantasy season orchestrator and the
database health checks do for each value of `api.football_data_source()`
(migration 20261011090000). Nothing here changes a Fantasy rule, a score or the
gameweek lifecycle.

## What the orchestrator does, by data source

The orchestrator (`scripts/backend/fantasy-season-orchestrator.ts`, run hourly by
`.github/workflows/fantasy-season-orchestrator.yml`) reads the source at the
start of every pass, through the service client.

| Step                                                   | `sportsmonks` or unreadable | `sofascore` or `shadow`                                                                                                         |
| ------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Workflow: read the source                              | runs                        | runs                                                                                                                            |
| Workflow: provider fixture refresh (SportsMonks)       | runs, as before             | skipped (step outcome `skipped`)                                                                                                |
| `SPORTSMONKS_API_TOKEN` required                       | yes                         | no                                                                                                                              |
| Calendar sync (before and after)                       | runs                        | runs                                                                                                                            |
| Finished-fixture performance ingestion (SportsMonks)   | runs, as before             | skipped, `skipped:data_source_<source>`                                                                                         |
| Lifecycle worker (lock, score, rankings, finalization) | runs                        | runs                                                                                                                            |
| Prize catch-up, deadline watch                         | runs                        | runs                                                                                                                            |
| Failed provider refresh turns the run red              | yes                         | not read, cannot turn it red                                                                                                    |
| Coverage escalation (finished match without stats)     | as before                   | nothing to age: ingestion is skipped                                                                                            |
| Gameweek past its window without final points          | escalates after 6 h         | escalates after 6 h, or 18 h if the worker waits on an adaptive code (`adaptive_scoring_pending`, `remaining_fixtures_pending`) |

The 18 h is the 6 h allowance plus the 12 h adaptive mode selection window
(`api.service_select_fantasy_scoring_modes` picks a fixture's scoring mode 12 h
after its final whistle, so adaptive final points cannot come sooner). Any other
wait, such as `football_not_final`, still escalates at 6 h.

The run's summary (`fantasy-season-orchestrator.json` and the GitHub run page)
carries `dataSource`, and under SofaScore `providerSteps` and
`performances.skipped` name what was skipped. A skip is not a failure and not a
wait: when everything else is fine the verdict is `ok` and the run is green.

**Fail safe.** If the source cannot be read (network, an unexpected value, a
missing function), the pass behaves exactly as it did before the switch
existed: it needs `SPORTSMONKS_API_TOKEN`, runs the SportsMonks steps and fails
as it would have. `shadow` is treated like `sofascore` here by the owner's
instruction, although the switch describes it as "SportsMonks writes"; do not
use `shadow` while SportsMonks is the only working feed.

## Workflows

- `fantasy-season-orchestrator.yml`: a new step `Read the football data source`
  (`scripts/backend/read-football-data-source.ts`, read-only, cannot fail)
  decides whether `Refresh provider fixtures and results` runs. The step
  `Provider refresh failed` only fires on a real failure, never on a skip.
- `gate2e-sportsmonks-current-season-readiness.yml`: the daily schedule now
  runs only when the repository variable `SPORTSMONKS_CHECKS_ENABLED` is
  `true`. The push trigger and the owner's manual dispatch are unchanged, and
  the workflow is not removed.
- `football-current-season-recovery.yml` is untouched. Its schedule already runs
  only when `FOOTBALL_CURRENT_SCHEDULE_ENABLED` is `true`; leave it off while
  SportsMonks is unpaid, because it calls SportsMonks.

## Database health checks

Migration `20261011150000_ops_health_adaptive_coverage.sql` changes two
checks, `fantasy_fixture_coverage` and `fantasy_scoring`, in
`api.service_ops_health`. Their output shape and wording are unchanged.

Before, a finished counted match was covered only through
`historical_performance_fixture_coverage` (SportsMonks ingestion) or, since
20260927094823, through its selected adaptive mode. The mode is selected 12 h
after the final whistle and the check fails 12 h after it, so an adaptive match
that was ready within minutes could still page. Now, for a gameweek under
`app_private.fantasy_adaptive_policy`:

- a fixture with no selected mode yet is covered when its latest observation in
  `app_private.fantasy_fixture_observations` is ready (`simple_ready` or
  `full_ready`);
- once a mode is selected the answer is the adaptive one, unchanged (a selected
  `full` mode with an observation that is only `simple_ready` is still not
  covered);
- the "no final points" clocks of `fantasy_scoring` (warn 1 h, fail 8 h after
  certification) count from the later of the observation and the mode cutoff
  (final whistle + 12 h), because adaptive final points cannot exist earlier.

Non-adaptive gameweeks keep the previous answers exactly. The migration patches
the deployed body of the checks (`ops_health_checks_before_adaptive`) the same
way 20260927094823 did, and raises if an expected fragment is missing, so it
cannot silently patch nothing. The later wrappers (adaptive summary, account
deletion, durable progression, Manager Card) are not touched.

pgTAP: `supabase/tests/database/ops_health_adaptive_coverage.test.sql`.

## Fixture finalization from SofaScore

`supabase/functions/_shared/sofascore-fixtures.ts` sets `finalizedAt` only for
raw status codes 100, 110 and 120 on a `finished` event. The 2026-10-10 live
probe (SOFASCORE_FULL_MIGRATION_PLAN.md, "Live status codes") watched a real
Botola match, Kawkab Marrakech 2-1 Ittihad Tanger (17256979), to full time:
SofaScore reported `finished` "Ended" with code 100. That confirms 100. Codes
110 (after extra time) and 120 (after penalties) have not been observed, since
Botola league matches do not use them, and the code's own comment marks them as
an assumption. Every repo test that exercises a finished match uses code 100.
A finished match with any other code is ingested as finished but never
finalized, and a fixture without `finalized_at` is skipped by mode selection and
keeps its gameweek `live` on `football_not_final`.
