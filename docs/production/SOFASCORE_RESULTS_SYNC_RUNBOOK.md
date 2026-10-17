# SofaScore results sync on Production V2: owner runbook

Project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`).
What it does: reads Botola results from SofaScore (the live list and the last
matches of competition `937`, season `102220`) and writes each changed fixture's
status and score through the reviewed RPC `api.ingest_football_fixture`, the same
call the SportsMonks path makes. It exists because SportsMonks is no longer paid
and results stopped arriving. It runs only when you dispatch it.

Pieces: `scripts/backend/sofascore-results-sync.ts` and the workflow
`.github/workflows/sofascore-results-sync.yml`. Same pins as the ID bridge
workflows: `main` only, owner actor (`mrdata007`), exact 40-character
`expected_commit`, no reruns, environment `production-admin-activation`,
concurrency group `botolago-production-v2-mutation`, a confirmation phrase.

## What a poll does

1. Two RapidAPI requests, never more, never retried: `get-live-events` and
   `get-last-matches` page 0 for 937/102220 (so a just-finished match and the
   previous matchday are in it). `get-next-matches` is not used: a kickoff time
   change is only written together with a status or score change.
2. One read of production (the mapped fixtures and their stored state).
3. It writes a fixture only if it is mapped to a SofaScore event, SofaScore's
   status, period or score differs from production, and production is not newer
   than SofaScore. It never writes: a stale fixture (`blocked_stale`), an unknown
   status, an unmapped event, a finished match without a score, a fixture
   production already holds as finished/cancelled/abandoned whose status would
   change, or a final score that would be overwritten by a different one (those
   are manual corrections). It cannot create a fixture: each call first checks the
   fixture mapping still points at the fixture it read.
4. One `DO` block, one transaction, calls `api.ingest_football_fixture` once per
   fixture. No service-role claim is set: that function has no
   `is_service_request()` guard, it is `security definer` and the Management API
   session is the database owner.
5. A re-read. Rehearsal: nothing changed. Apply: every written fixture now shows
   SofaScore's status, period, score and `providerUpdatedAt`, and no other mapped
   fixture or mapping changed.

If one call fails in apply, the whole block rolls back and is repeated once
without the failed fixture(s); the job summary names them.

The job summary has one table per poll: event, SofaScore status and score,
production before, written yes/no, production after, and the reason.

## Before tonight: one writer only

The SportsMonks live refresh (pg_cron `football-live-refresh`, every 15 minutes,
and `football-season-refresh` under the same switch) writes fixtures too. It is
unpaid and failing, but it must be off so two writers never touch fixtures
([AGENTS.md](../../AGENTS.md#one-writer-at-a-time-per-database)). **The workflow
refuses to write while `football_live_refresh_enabled` is true**, and refuses
while any other dispatched or scheduled run is active (the read-only SofaScore
shadow compare is allowed).

Switch it off, keeping every other setting (`null` means "leave it"; the mode
argument is required, so pass the current one):

```sql
select app_private.notification_email_configure(
  (select mode from app_private.notification_email_settings where id),
  null, null, false);
select football_live_refresh_enabled, mode
  from app_private.notification_email_settings where id;
```

Check the second query returns `false`. Do not switch it back on while the sync
is in use.

## Steps for tonight

1. Merge the pull request that adds this package to `main`. Note the merge commit
   sha (40 characters): `git rev-parse origin/main` or the commit page.
2. Switch the live refresh off with the SQL above and confirm `false`.
3. Rehearse once: Actions, "Production V2 SofaScore results sync (owner-run)",
   Run workflow on `main` with `expected_commit` = the sha, `mode` = `rehearse`,
   `confirmation` = `REHEARSE_SOFASCORE_RESULTS_SYNC`. Read the summary: the
   Saturday matches (Kawkab Marrakech v Ittihad Tanger, Amal Tiznit v Difaa El
   Jadida) should show `written: rolled back (rehearsal)` and `would be finished 2-1`
   style results, outcome `SOFASCORE_SYNC_REHEARSAL_ROLLED_BACK_AND_VERIFIED`.
   Anything else: do not apply; send the summary.
4. At kickoff (WAC v CODM, 19:00 UTC, SofaScore 17256972) dispatch with `mode` =
   `apply`, `confirmation` = `APPLY_SOFASCORE_RESULTS_SYNC`, `repeat` = `12`,
   `interval_minutes` = `10` (about two hours; the first poll writes Saturday's
   results straight away). Monday 12 Oct 19:00 UTC: dispatch again, same inputs.
5. Read the job summary while it runs. Healthy polls end
   `SOFASCORE_SYNC_APPLIED_AND_VERIFIED` or `SOFASCORE_SYNC_NOTHING_TO_WRITE`.

## Outcomes and exit codes

| Outcome                                   | Meaning                                          | The run                 |
| ----------------------------------------- | ------------------------------------------------ | ----------------------- |
| `SOFASCORE_SYNC_NOTHING_TO_WRITE`         | production already matches                       | continues               |
| `SOFASCORE_SYNC_APPLIED_AND_VERIFIED`     | written and re-read equals SofaScore             | continues               |
| `SOFASCORE_SYNC_POLL_FAILED_BEFORE_WRITE` | RapidAPI or a read failed; nothing written       | continues, run ends red |
| `SOFASCORE_SYNC_APPLY_FAILED_ROLLED_BACK` | the write failed and the re-read shows no change | continues, run ends red |
| `SOFASCORE_SYNC_REFUSED_BEFORE_WRITE`     | live refresh on, or a guard                      | stops                   |
| `SOFASCORE_SYNC_OUTCOME_UNVERIFIED`       | the re-read failed: check production by hand     | stops                   |
| `SOFASCORE_SYNC_COMMITTED_NEEDS_REVIEW`   | production differs from what was written         | stops                   |
| `SOFASCORE_SYNC_REHEARSAL_NEEDS_REVIEW`   | the rehearsal did not behave as designed         | stops                   |

## How to stop

- Cancel the workflow run in Actions. A poll in progress is one transaction: it
  commits whole or not at all, and the next poll never starts.
- Nothing else runs on its own; there is no schedule. To stop for good, do not
  dispatch again.
- To hand results back to SportsMonks later, switch the live refresh on again
  with `p_football_live_refresh_enabled` = `true` (same call as above), only after
  no sync run is active.

## Read this before you rely on it

- `get-last-matches` page 0 is only the most recent page: a match older than
  that page is not seen. Saturday's two matches are expected to be on it; the
  rehearsal summary shows whether they were.
- A fixture is finalized (`finalized_at`, which Fantasy scoring waits for) only
  for SofaScore finish codes 100, 110 and 120. Those codes are an assumption (see
  `sofascore-fixtures.ts`): after the first finished match, check that its
  `finalized_at` is set in `app.fixtures` (the rehearsal's job evidence JSON also
  carries it); the Fantasy lifecycle reacts to it.
- If SportsMonks wrote a fixture with a newer `provider_updated_at` than
  SofaScore's change time, the row shows `blocked_stale` and is left alone.
- The RPC, like the SportsMonks path, stores no venue, minute or half-time score
  for these fixtures.
- Other pg_cron jobs that read fixtures (Pepites, Manager Card, the Fantasy
  lifecycle tick, predictions scoring) react to results being written; that is
  the point, but pause the ones you do not want per AGENTS.md before the apply.
