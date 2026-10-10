# Applied 10 October 2026: SofaScore ID bridge on Production V2

Project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`).
Result: **SOFASCORE_BRIDGE_PRODUCTION_APPLIED_AND_VERIFIED**.

Exactly **53 new active mapping rows** attach SofaScore IDs to existing internal
entities. No fixture, team, round, season or player was created. Existing
SofaScore player mappings and all other non-target mappings were preserved.

## What was applied

| Entity type | New links |
| ----------- | --------: |
| Competition |         1 |
| Season      |         1 |
| Round       |         4 |
| Team        |        16 |
| Fixture     |        31 |
| **Total**   |    **53** |

Competition `937`, season `102220`. Of 32 internal fixtures, 31 are linked;
`1296b2e5-bb59-4f18-8ef7-dc0b2990bc3a` remains intentionally unmapped.
One linked fixture has both `matched_by_round` and `postponed_only` flags.

The complete canonical plan is committed in
`docs/production/manifests/sofascore-id-bridge-2026-10-10.plan.json`.
Its required manifest pin and both workflow runs use SHA-256:

`8828c27fa6ce66c0e92b528e2cac7abe08a86799e5ec638af934c4fda88a0b74`

## How

| Step                        | Reference                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workflow/report preparation | [PR #415](https://github.com/mrdata007/botolago-foundation/pull/415), merged; [CI 38082054820](https://github.com/mrdata007/botolago-foundation/actions/runs/38082054820), both required checks passed |
| Production package          | [PR #416](https://github.com/mrdata007/botolago-foundation/pull/416), merged; [CI 38083262833](https://github.com/mrdata007/botolago-foundation/actions/runs/38083262833), both required checks passed |
| Exact reviewed main commit  | `632ab97cebefb369f6add662b86180bcc62b3457`                                                                                                                                                             |
| Complete read-only plan     | [Run 38083113415](https://github.com/mrdata007/botolago-foundation/actions/runs/38083113415), success                                                                                                  |
| Rehearsal, rolled back      | [Run 38084276293](https://github.com/mrdata007/botolago-foundation/actions/runs/38084276293), attempt 1, success                                                                                       |
| One-shot apply              | [Run 38084384400](https://github.com/mrdata007/botolago-foundation/actions/runs/38084384400), attempt 1, success                                                                                       |
| Rehearsal evidence          | `sofascore-id-bridge-rehearse-38084276293`, artifact 11681089268, expires 2026-10-24T20:34:57Z                                                                                                         |
| Apply evidence              | `sofascore-id-bridge-apply-38084384400`, artifact 11681890424, expires 2026-11-09T20:36:39Z                                                                                                            |

Both production runs were dispatched from `main` by `mrdata007` with the same
reviewed commit. The rehearsal hash was supplied to the apply. Neither run was
rerun. The API reported a 10,000-request quota rather than the free 500-request
quota. The workflows now refuse the free quota before any database write.

Runbook: `docs/production/SOFASCORE_ID_BRIDGE_PRODUCTION_RUNBOOK.md`.
Runner: `scripts/backend/sofascore-id-bridge-production-run.ts`.

## Pre-flight and pause

Immediately before pausing and again before the production writes:

- no active, queued, waiting or pending dispatched/scheduled workflow;
- no busy database client session or finalizing Fantasy gameweek;
- no relevant cron still running;
- zero SofaScore competition, season, round, team or fixture mappings, active or inactive;
- 198 existing SofaScore player mappings, all active;
- 1895 non-target mappings, full-row MD5 `303cd6bc8c6b7167caa8bf5655ab77d6`;
- player-row full digest `fd5ef384121ab0bdebbf3d37082703fc`.

Original configuration:

| Setting                 | Saved value | During rehearsal/apply | Restored value |
| ----------------------- | ----------- | ---------------------- | -------------- |
| Notification email mode | `off`       | `off`                  | `off`          |
| Football live refresh   | `true`      | `false`                | `true`         |
| Fantasy lifecycle tick  | `true`      | `false`                | `true`         |

The exact runbook commands paused and restored the jobs:

```sql
select app_private.notification_email_configure('off', null, null, false);
select app_private.fantasy_automation_configure(false);

-- After the apply was independently verified:
select app_private.notification_email_configure('off', null, null, true);
select app_private.fantasy_automation_configure(true);
```

Test-user IDs remained empty; the functions base URL remained the Production V2
URL. Email limits were unchanged: 250 per run, 100 daily, 3000 monthly, reserve 10.
All 21 cron job names, schedules and activation settings were identical before
the pause and after restoration. Email was already off and was restored to off.

## Rehearsal verification

The deliberate exception returned HTTP 400 and the computed state:

```json
{
  "byType": {
    "team": 16,
    "round": 4,
    "season": 1,
    "fixture": 31,
    "competition": 1
  },
  "planned": 53,
  "activeAfter": 53,
  "baselineRows": 0,
  "matchingPlan": 53
}
```

The workflow ended with
`SOFASCORE_BRIDGE_REHEARSAL_ROLLED_BACK_AND_VERIFIED`.
An independent database read then confirmed zero bridge mappings, the same
1895 non-target mappings and full-row digest, and the same
198 player mappings and player digest. Nothing from the bridge transaction
remained. Main, the pinned plan, mapping state and paused settings were checked
again before apply.

## Commit and post-commit verification

The single apply DO block returned **HTTP 201** and the workflow ended with
`SOFASCORE_BRIDGE_PRODUCTION_APPLIED_AND_VERIFIED`.

Before restoring automation, an independent production read confirmed:

- exactly 53 bridge mappings in any state, all 53 active;
- every `entityType / externalId / internalId` tuple equals the complete committed plan;
- counts 1 competition / 1 season / 4 rounds / 16 teams / 31 fixtures;
- all 198 existing SofaScore player mappings retained, all active, with the same full-row digest;
- all 1895 non-target mapping rows retained, full-row MD5 still `303cd6bc8c6b7167caa8bf5655ab77d6`.

Original notification configuration, Fantasy lifecycle flag and all cron schedules
and activation settings were then restored and compared against the saved values.

## Preparation and scope

Before merging, the production baseline was corrected to exclude existing
SofaScore players and protect them with the non-target digest. The formerly
optional plan pin is now required, and the complete approved rows are committed.
Read-only reports include exact rows; report-writing failures remain failures.
Validation included 41 bridge tests and 18 production-shell boundary checks.

This operation attached IDs only. It did not change the football provider
selection, Fantasy scoring rules or unrelated automation configuration.
