# Durable Fantasy progression

The October 2026 failure replayed GW2's completed 623-player price pass after a
roster update added 113 players. The live-catalog equality guard rejected the
retry before the worker could open GW3. The five-minute lifecycle tick did not
handle scheduled successors, so GitHub retries remained the only opening path.

Migration `20261009091728_fantasy_durable_progression.sql` changes that boundary:

- Completed pricing certifies the recorded cohort for the exact finalized
  calculation. Catalog growth cannot invalidate it, including while notification
  enqueue is still pending. Version, authorization and cursor checks remain.
- A private trigger refuses catalog additions, removals and identity/team/position
  changes while the season's current finalized price pass is unfinished. Price
  batches acquire a table lock before reading the cohort or creating the journal;
  catalog DML acquires a conflicting lock before checking the journal. This closes
  the first-page race and protects the gaps between transactions. Price updates
  themselves do not fire the catalog trigger. Retry a refused roster update after
  pricing completes; never delete or enlarge a historical journal to unblock it.
- The existing five-minute tick attempts one 500-team preparation page for every
  scheduled successor with exact-version completed predecessor postwork. It calls
  the existing guarded service RPC and records progress/refusals in its heartbeat.
  Both callers share the calendar advisory lock followed by gameweek row locks.
  Opening still requires all lineups prepared, a verified calendar and a future
  deadline. No provider fetch or scoring is added to the database tick.
- `fantasy_progression` health warns within 24 hours of a scheduled deadline and
  fails within six hours or after completed postwork and a staged successor have
  coexisted for 15 minutes. A passed deadline fails immediately. Successful empty
  ticks cannot clear this check; actual gameweek state must recover. The existing
  ops alert path receives this check automatically. These are intervention
  thresholds, not a guarantee of external scheduler or alert delivery availability.
  Since migration `20261013140100` (two-stage statistics, below) the check does
  not warn or fail merely because the previous gameweek is provisional and
  waiting: see "Provisional predecessors".

## Provisional predecessors (two-stage statistics)

SofaScore publishes core data (minutes, goals, cards) at once and full
statistics 5 to 16 days later. The owner's rule of 2026-10-12: a gameweek may
close and the next one open on provisional points; later re-pulls refine points
without blocking progression.

What the code requires today (nothing here was changed by the alert lane):

- A successor opens only through `api.service_prepare_next_fantasy_gameweek`,
  which refuses unless the previous gameweek is `finalized` with its postwork
  complete (`fantasy_previous_postwork_incomplete`,
  `20261009091728_fantasy_durable_progression.sql` lines 197-199), and the
  successor's deadline is still ahead (`fantasy_next_gameweek_not_openable`, line
  203). The five-minute tick only calls it for a `finalized` predecessor with
  complete postwork (same file, lines 345-359); it never finalizes anything.
- The lifecycle worker finalizes (`scripts/backend/fantasy-lifecycle-runner.ts`,
  `service_begin_fantasy_finalization` at line 700) only when no counted match
  is pending. A match is pending unless its scoring mode is selected and its
  latest observation is ready in that mode (`adaptiveReady`, set in
  `20260927120659_adaptive_reviewed_estimates.sql` lines 219-222 from the mode
  row; tested at runner lines 611-613). Otherwise the worker publishes the points it
  has and returns `points_published` / `remaining_fixtures_pending` (lines
  686-696) without finalizing.
- The mode is selected 12 h after the final whistle by
  `api.service_select_fantasy_scoring_modes`
  (`20260927094823_adaptive_fantasy_scoring.sql`, the 12 h cutoff at line 200):
  `full` when the latest observation is `full_ready`,
  otherwise `simple`. A match with core data is therefore ready in `simple`
  mode from its cutoff, and its full statistics never block finalization or the
  next gameweek.
- What does block: a counted match with no ready observation. It is selected as
  `simple` but `simple_ready` is false (no observation), so `adaptiveReady` stays
  false until an observation arrives, and the gameweek stays provisional and the
  next one scheduled. This is a missing-core-data problem, reported by
  `fantasy_fixture_coverage` (fails 12 h after full time) and, through this
  check, as `previous_core_data_missing`.

So the alert rule is: information only while the previous gameweek is
provisional with core data for every counted match and its last whistle is under
13 h old (12 h cutoff plus one hour for the hourly worker run); the usual
warn/fail thresholds otherwise (a match without core data, a predecessor that
should have finalized and has not, a match not finished, a passed deadline).

### Built since: staged statistics

The owner decided on 2026-10-12 to build it. The gameweek may now close on
provisional points (it stays `provisional` with `closed_at` set, the next gameweek
opens), later pulls re-score it, and it locks only when every counted match is
`FINAL` or `FINAL_LIMITED`. See
[SOFASCORE_STAGED_STATS.md](SOFASCORE_STAGED_STATS.md). It is off until a season is
switched on, so the text below still describes a season that is not. Written before
that decision:

### Decision for the owner: what the code does not do

The owner's sentence also says that later re-pulls update points. The code does
not do that yet, and doing it changes Fantasy scoring and lifecycle logic, which
the alert lane must not:

- The automatic SofaScore path records one observation per match and then leaves
  it alone (SOFASCORE_FANTASY_SIMPLE.md, "Retries"); a full-statistics re-pull is
  the manual runner (`--include-observed`).
- `service_select_fantasy_scoring_modes` fills a mode once (the update is
  `... and mode is null`, adaptive migration line 218). A later `full_ready`
  observation does not change a `simple` match of a gameweek that is not
  finalized, and once the gameweek is `finalizing` or later the recorder
  refuses it (`adaptive_reviewed_correction_required`, `20260927120659` line 71;
  the reviewed correction path).
- Making full statistics refine finalized points would need: a periodic
  re-fetch of finished matches' SofaScore data for up to 21 days (the Edge
  Function's post-final window is 2 hours today), an observation per fetch with
  the recorder's digest dedupe, a rule for upgrading a `simple` mode to `full`
  (a new mode-selection function or a reviewed-correction batch), and the
  correction flow for already finalized gameweeks (points events are versioned
  by `scoring_version`; rankings and prizes read final points). That is a
  Fantasy scoring decision, so it is not in this lane.

## Validation and review

Run the normal database reset, pgTAP suite and database lint against a disposable
local database. `fantasy_durable_progression.test.sql` exercises actual price and
notification postwork, 113 later additions, a successor staged afterward, partial
preparation resumed by the tick, repeated retries, existing/Free Hit selections,
immutable journal/prices/balances/events and stalled-state health. The extended
postwork suite covers catalog mutation during partial pricing, the
prices-complete/notifications-pending gap, and invalid cursors/versions.

Also run the lifecycle runner and season orchestrator unit suites, migration
validation, committed-secret and config-integrity checks. Review the complete
migration and exact-file rollout wrapper before pushing. No deployed migration
is edited, no API signature changes, and no new public execution grants are added.

## Production promotion

Target only BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`). Follow `AGENTS.md`:
check all GitHub writer workflows, running database/Edge workers and scheduled
jobs immediately before each write. Do not overlap another writer.

`scripts/backend/apply-fantasy-durable-progression.sql` is the exact-file rollout:

1. Review its source hashes against production and its embedded migration checksum
   against the committed migration. It refuses a changed baseline or a repeat.
2. Run the whole file with its default `rollback`. It interlocks all pg_cron jobs,
   pauses the Fantasy switch inside the transaction, applies the migration and
   probes completed GW2 pricing/postwork twice. A business-state digest must stay
   unchanged. It restores the original switch before ending the transaction.
3. Reread migration history and business state to confirm rollback. Recheck writers,
   then run the identical file with only the final `rollback` changed to `commit`.
4. Verify exact migration history/checksum, private grants, unchanged historical
   journal/prices, the restored switch, and the new health check. Observe a normal
   subsequent tick. Preserve baseline and postflight evidence with the incident.

The transaction holds `cron.job_run_details` through
`app_private.hold_scheduled_jobs()`; any active scheduled writer refuses the
operation. Normal schedules/settings are unchanged after both rehearsal and apply.
A failed guard is a reason to inspect current state, never to remove the guard.

## GW3 recovery (separate operation)

The migration cannot normally open GW3 because its deadline already passed.
`scripts/backend/recover-fantasy-gw3.sql` uses the existing owner-only missed-week
function for GW2 -> GW3, calculation version 2. It preserves a team's existing
next lineup, otherwise the restored Free Hit selection or locked previous lineup,
without carrying chips. It then locks GW3 inside the same transaction, so no
editable window is exposed. It retains every fixture/calendar/lineup guard,
including refusal while any fixture is live, and records the owner's reason.

Check writers, rehearse with rollback, confirm the baseline is unchanged, then
apply the same reviewed script with commit under the owner's authorization.
Verify every active team has a full locked lineup, the progression journal is
opened once, previous pricing/postwork is unchanged and the prior tick switch is
restored. Let normal provider ingestion and scoring resume; this operation does
not invent missing performance data or mark unfinished matches final.
