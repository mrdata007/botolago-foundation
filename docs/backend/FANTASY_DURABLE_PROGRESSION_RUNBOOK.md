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
