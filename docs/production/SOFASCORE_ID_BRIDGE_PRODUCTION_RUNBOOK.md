# SofaScore ID bridge on Production V2: owner runbook

Project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`).
What it does: attaches SofaScore ids (competition `937`, season `102220`) to the
**existing** internal competition, season, 4 rounds, 16 teams and 31 fixtures, by
calling `api.resolve_football_mapping` 53 times in one transaction. It creates
no fixture, team, round or season, and maps no player. Background:
[SOFASCORE_ID_BRIDGE.md](../backend/SOFASCORE_ID_BRIDGE.md).

Everything here is owner-run. Nothing in this package runs by itself, and the
apply is one-shot.

## What is pinned

| Item                                                                   | Where                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Approved team pairing, competition and season ids, the expected counts | `docs/production/manifests/sofascore-id-bridge-2026-10-10.manifest.json`                                     |
| Rehearsal (rolled back, never commits)                                 | `.github/workflows/sofascore-id-bridge-production-rehearsal.yml`                                             |
| Apply (commits once)                                                   | `.github/workflows/sofascore-id-bridge-production-apply.yml`                                                 |
| Runner and pure logic                                                  | `scripts/backend/sofascore-id-bridge-production-run.ts`, `scripts/backend/sofascore-id-bridge-production.ts` |

Expected plan (from read-only run 38080678843): competition 1, season 1, round 4,
team 16, fixture 31, total **53**. Fixtures 32, matched 31 (1 `matched_by_round`,
1 `postponed_only`), conflicts 0, multi-match 0, re-points 0, already mapped 0.
One fixture has no event: `1296b2e5-bb59-4f18-8ef7-dc0b2990bc3a` (left unmapped
on purpose).

Both workflows: `main` only, owner actor (`mrdata007`), exact 40-character
`expected_commit`, no reruns, environment `production-admin-activation`,
concurrency group `botolago-production-v2-mutation`, a confirmation phrase, and
masked secrets. Before anything else they refuse to start while any other
dispatched or scheduled workflow run is active, queued or waiting.

## Refusals (no drift)

The runner rebuilds the plan from fresh reads (SofaScore events and a read-only
production snapshot) and stops, writing nothing, if:

- any count in the plan differs from the manifest, or a competition, season or team
  row is not the manifest's;
- the manifest pins `planSha256` and the computed hash differs;
- the apply's `plan_sha256` input is not exactly the computed hash;
- a second read just before the write gives a different hash than the first;
- any `sofascore` mapping row of these entity types exists, active or not (the
  database block checks this again inside its own transaction). This is what makes
  the apply refuse to run twice;
- the notification email mode is not `off`, football live refresh is on, the
  Fantasy lifecycle tick is on, a gameweek is finalizing, or another database
  session is busy.

## Steps

1. **Merge** the pull request that adds this package (owner approval). The
   workflows appear in GitHub only once they are on `main`.
2. **Note the commit.** Copy the full 40-character SHA of the merged `main` commit.
   Use the same SHA for both dispatches; if `main` moves, review the new commit and
   start again from step 4.
3. **Pause the crons** (next section). One pause covers the rehearsal and the
   apply; both refuse to run while the crons are on.
4. **Rehearse.** Actions, "Production V2 SofaScore ID bridge rehearsal":
   `expected_commit` = the SHA, `confirmation` = `REHEARSE_SOFASCORE_ID_BRIDGE_PRODUCTION`,
   `plan_sha256` empty. Success ends with
   `SOFASCORE_BRIDGE_REHEARSAL_ROLLED_BACK_AND_VERIFIED`.
5. **Check the result in the run summary.**
   - `Plan sha256: <hash>` and `Approve this exact hash for the apply: <hash>`.
   - Rehearsal computed state: `baselineRows 0`, `planned 53`, `activeAfter 53`,
     `matchingPlan 53`, `byType` 1 / 1 / 4 / 16 / 31.
   - "Re-read after rollback: 0 sofascore mappings; other providers unchanged."
   - Any other outcome (`..._NEEDS_REVIEW`, a refusal) means stop and investigate; do not apply.
6. **Approve the hash.** Compare the printed hash with the one you approve. It
   covers every row (entity type, external id, internal id, flags), the no-match
   fixture and the provider/source version.
7. **Apply.** Actions, "Production V2 SofaScore ID bridge APPLY": same
   `expected_commit`, `confirmation` = `APPLY_SOFASCORE_ID_BRIDGE_PRODUCTION`,
   `plan_sha256` = the approved hash. Never rerun it; a rerun is refused by
   GitHub and by the baseline check.
8. **Verify 53.** Success ends with
   `SOFASCORE_BRIDGE_PRODUCTION_APPLIED_AND_VERIFIED` and
   "Verified: 53 active sofascore mappings, exactly the plan." The runner reads
   production afterwards (not the call's reply) and checks the 53 rows equal the
   plan, the total sofascore rows are 53, and every other provider's mappings are
   unchanged (count and digest). Other outcomes:
   `..._APPLY_FAILED_ROLLED_BACK` (nothing written; find out why before anything
   else), `..._COMMITTED_NEEDS_REVIEW` or `..._OUTCOME_UNVERIFIED` (read production
   by hand; do not rerun).
9. **Restore the crons** to exactly the settings recorded in step 3.
10. **Record** `docs/production/APPLIED_2026_10_XX_SOFASCORE_ID_BRIDGE.md` in the
    style of `APPLIED_2026_10_02_PLAYER_MAPPING_BACKEND.md`: project, result, reviewed
    commit, rehearsal run id, apply run id, plan hash, pre-flight, post-commit
    verification, evidence artifact names.

## Pausing the crons (AGENTS.md, one writer at a time)

The apply writes `app_private.football_provider_mappings`. The live refresh and
the season refresh resolve fixtures through that table, and the Fantasy tick
reads fixtures, so pause them for the length of both runs. Take the settings
first and keep them.

Record (read only):

```sql
select mode, test_user_ids, functions_base_url, football_live_refresh_enabled
  from app_private.notification_email_settings where id;
select lifecycle_tick_enabled from app_private.fantasy_automation_settings where id;
select jobname, schedule, active from cron.job order by jobname;
```

Pause (the runner refuses unless these hold):

```sql
select app_private.notification_email_configure('off', null, null, false);
select app_private.fantasy_automation_configure(false);
```

`football-season-refresh` runs under the live refresh switch, so the first
statement stops it as well as the email jobs. Also confirm no workflow is running
(the workflows check this themselves) and that no agent or session is writing to
the production database.

The apply does not need Pépites, Manager Card, predictions, news or account
deletion paused: it writes only the mapping table and none of those jobs writes
it. If you want belt and braces, pause `pepites-tick` and Manager Card compute as
`AGENTS.md` describes; the runner does not check them.

Restore (use the recorded values; `mode` and the base URL are whatever step 3
recorded):

```sql
select app_private.notification_email_configure(
  '<recorded mode>', null, null, <recorded football_live_refresh_enabled>);
select app_private.fantasy_automation_configure(<recorded lifecycle_tick_enabled>);
```

Run `select jobname, schedule, active from cron.job order by jobname;` again and
compare with the recording. Do not forget this step: until it is done, Fantasy
gameweeks do not transition and live scores do not refresh.

## Rollback (described, not automated)

The rehearsal needs none: it rolls back by itself and the run proves it.

After a committed apply, undoing it is a separate owner-authorised production
write that this package does not automate. Shape of it:

1. Pause the same crons and check nothing else is writing.
2. Take a baseline: 53 rows in `app_private.football_provider_mappings` with
   `provider_name = 'sofascore'`, `active`, `source_version = 'sofascore-id-bridge'`.
3. In a guarded `DO` block, set `active = false` on exactly those rows, check the
   updated count is 53 and that no other row changed, and rehearse it first with a
   deliberate trailing `raise` as the rehearsal workflow does.
4. Re-read: 0 active sofascore mappings, other providers unchanged.

Notes: deactivating keeps the rows, so the bridge's baseline check (any sofascore
row, active or not) will refuse a later apply; a re-apply after a rollback needs a
new reviewed package that deals with the inactive rows. Nothing in SportsMonks
data is touched by the apply, so nothing there needs restoring.
