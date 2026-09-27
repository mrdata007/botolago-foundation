# Fixture-ready Fantasy points

Scoring publication no longer needs gameweek finalization. Once a counted
fixture passes the assigned ruleset's existing validation, its player points
contribute to every locked fantasy lineup and to overall and league rankings.
Totals remain provisional until the gameweek's normal finalization completes.
Unplayed fixtures and fixtures with missing core data stay pending and contribute
no invented statistics. Double gameweeks retain each fixture separately.

`app_private.fantasy_live_scoring_policy` opts a season in. It does not change its
ruleset, activate adaptive scoring, or modify finalized history. The adaptive
migrations must precede this migration; the original full-scoring rules continue
when no adaptive ruleset is assigned. Under an adaptive assignment, the selected
fixture mode and core readiness remain required for fixture publication.

## Worker and display

- `service_prepare_fantasy_live_scoring` chooses an immutable calculation version
  for the current input digest. Same inputs reuse the version; changed facts get
  a new version. Existing snapshot locks and digest checks reject stale writers.
- The document retains the pending fixtures and pending player identities in its
  digest, while only eligible fixture statistics feed the point calculation.
- Each team receives its starters' available points, captain multiplier when the
  captain has appeared, chip effects, and the transfer hit once. An unresolved
  squad participant delays automatic substitutions and vice-captain promotion
  for that team. Teams with settled participation use the existing full rules.
- After all team pages are persisted, the worker refreshes gameweek and season
  ranking scopes, both overall and for every active league. It returns
  `points_published` while fixtures remain outstanding.
- A correction recomputes the aggregate; losing certification retracts the old
  fixture awards. Stable ledger keys and team upserts prevent duplicate points.
- The points page renders the frozen server lineup, multipliers, substitutions,
  hits and totals directly. It does not recalculate them from an editable squad.
  Points refresh every 30 seconds while provisional; ranking pages every minute
  while visible. French and Arabic explain that scores count during the round.
- Sealing/finalization remains blocked by any pending fixture or participation.
  Free-hit restoration, transfer rollover, prices, prizes and final notifications
  still belong to the existing gameweek completion process.

## Rollout

Run the incremental, existing scoring and adaptive database tests, worker tests,
UI adapter tests, generated-type check and CI. Rehearse and apply on staging
before production. Production promotion uses the guarded owner SQL path from
CLAUDE.md, in migration order, with other writers paused and a baseline recorded.

Before enabling a season, inspect its locked lineups and current fixture
coverage. In a transaction with the gameweek locked, enable the season's policy,
read the resulting document, and compare its ready/pending fixture lists and
proposed team scores. Roll back that rehearsal and confirm unchanged counts.
Then apply the same guarded configuration and dispatch the reviewed manual
worker for the gameweek. Verify live totals/rankings, unchanged finalization
state, and an identical retry. Restore each scheduler's recorded prior state.

Rollback pauses new worker runs and disables this policy. Preserve existing
provisional/final results, immutable snapshots and ledger history; do not replace
published scores with the previous scoring method.

## Season reliability checks

The enabled policy applies to every gameweek in that season; a new season still
requires explicit activation. Regression coverage visits GW1 through GW30,
checks open-to-live capability refresh, and exercises partial publication,
coverage loss, corrected snapshots, settlement and completion retries. The
same-gameweek snapshot and ledger guards remain authoritative.

Unknown participation is blocking only when a locked lineup selects the player.
All fixture coverage and scorer reconciliation checks still apply. Unknown
selected players cannot cause premature bench substitutions or vice promotion.

The orchestrator keeps its bounded worker limit, reports deferred gameweeks as
an escalation, and records a failed worker without skipping independent selected
work. The database permits only one current gameweek per season. Provider data
incidents therefore remain visible and may delay progression; this change does
not manufacture essential facts or declare a blocked round complete.

Before promoting the participation-scope migration, pause writers and rehearse
it against production. Its narrower pending-player list changes the input digest
for partial rounds: prepare a new calculation version, never mutate the old
snapshot, then verify identical ready-fixture points and ranking totals. Sealed
rounds have no pending participation and retain their semantic input digest.
