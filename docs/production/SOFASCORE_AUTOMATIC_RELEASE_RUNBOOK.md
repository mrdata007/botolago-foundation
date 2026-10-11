# SofaScore automatic release runbook (owner steps)

Production is `tkewgajrljbwgwedqsxn` (BotolaGO Production V2).

This replaces the separate packages
[`SOFASCORE_LIVE_RELEASE_RUNBOOK.md`](SOFASCORE_LIVE_RELEASE_RUNBOOK.md) (already
done on production) and
[`SOFASCORE_MATCH_DETAILS_RELEASE_RUNBOOK.md`](SOFASCORE_MATCH_DETAILS_RELEASE_RUNBOOK.md)
for everything that is still to do. You do **one script** and **one deploy**.
Nothing here is run by an agent: every production write is yours and covers only
the step you were told to do (`CLAUDE.md`, production database writes).

> **Status: not final.** Two things must be filled in before you run anything:
> the player auto-map migration and Lane A's migration (see "Slots to fill"
> below), and one fingerprint from the automated checks. Until then the script
> refuses to run by itself and saves nothing. Do not start until the person who
> hands you this says it is final.

## What you will do, in short

1. Make sure nothing else is working on production (two minutes).
2. Run the script once as a **rehearsal** (it saves nothing) and read the answer.
3. Run it again for real (you change one word).
4. Deploy one function.
5. Switch on the automatic Fantasy scoring (the last switches).

## What the script installs

It checks which of these are already in production, skips the ones that are, and
**checks** the ones it skipped instead of redoing them:

| Order | Migration                                          | What it gives you                                                                                                       |
| ----- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1     | `20261003180000_reconciled_provider_observations`  | The place where a finished match is recorded as a scoring input (service-only). Skipped if it is already in production. |
| 2     | `20261011110000_football_sofascore_snapshot_teams` | The two clubs of each fixture, which the SofaScore match details need.                                                  |
| 3     | `20261011120000_sofascore_fantasy_observations`    | The function that records a finished SofaScore match for Fantasy scoring (SofaScore only).                              |
| 4     | _slot_ `20261011130000_sofascore_player_auto_map`  | Lane B: the player matching. **Not in the script yet.**                                                                 |
| 5     | _slot_ `20261011140000` (Lane A, if it adds one)   | **Not in the script yet.**                                                                                              |

It changes no fixture, no player, no point and no user. It only adds or replaces
functions and one table. Nothing anyone sees changes by itself.

## Slots to fill (before the owner starts)

Whoever finishes the work does this, not the owner:

- **Migration slots 4 and 5.** In `scripts/backend/build-apply-sofascore-automatic.ts`
  move the entry from `RESERVED_SLOTS` to `STEPS`, with its checks and its
  fingerprints. Then run `bun scripts/backend/build-apply-sofascore-automatic.ts`.
  The test `apply-sofascore-automatic-script.test.ts` fails if the script and the
  migration files ever differ.
- **The fingerprint (md5) of the Fantasy function.** The green `database-quality`
  run prints it as `SofaScore Fantasy observation md5`. Put it in `PINS` in the
  same file (a local PostgreSQL 16 gave `e97f34f2bf5acfc7447b3e9dd35386ac`;
  only the CI value counts). Rebuild.
- **The last switches** (step 5 below): `[SLOT - LANE A: exact switches]`.

## Before you start

AGENTS.md: one writer at a time.

1. **Nothing else is writing to production.** Open the repository's Actions tab
   and make sure no run is going in the group `botolago-production-v2-mutation`.
   No agent of yours is working against production either.
2. **Fantasy automatic updates.** Paste this and read the answer:

   ```sql
   select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
   ```

   - `false`: nothing to do.
   - `true`: the script will refuse the first time, only if migration 1 is still
     to be installed. In that case run
     `select app_private.fantasy_automation_configure(false);` first, and write
     down that it was on, so you switch it back on in step 5.

   You do not need to pause anything else (live refresh, emails, predictions,
   Manager Card, Pépites): the script touches none of their data. If a job is
   running at that very second, the script says so and you run it again in a
   minute.

3. **The pull request is merged to `main`** and its Actions have finished (merging
   runs them). Do not publish the website for this.

## Step 1: rehearsal (saves nothing)

1. Open `scripts/backend/apply-sofascore-automatic.sql` on `main` in GitHub, copy
   the whole file, and paste it in the Supabase SQL Editor of production. Do not
   change anything. Run it.
2. **Success looks like:** a single row saying
   `Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.`
   (the second column says `none`, or lists the migrations that were already
   there).
3. **If it says `stop: ...`:** nothing was saved. Read the message, then see
   "If it stops" below. Never edit a check to make it pass.

## Step 2: the real run

1. In the same text, find the single line `rollback;` near the bottom and change
   it to `commit;`. Nothing else. Run the whole text again.
2. **Success looks like:** one row saying
   `Installed and verified. Deploy the Edge Function next (runbook, step 3).` and a
   list of the migrations now in production.
3. Check (optional, two lines):

   ```sql
   select version from supabase_migrations.schema_migrations
    where version in ('20261003180000', '20261011110000', '20261011120000')
    order by 1;                                  -- 3 rows (more once the slots are filled)
   ```

If the real run stops, nothing is saved either (it is one all-or-nothing
operation). Running it again afterwards is safe: it skips what is installed and
verifies it.

## Step 3: deploy the Edge Function (the one deploy)

Actions, `Football live refresh deploy`, **Run workflow** on `main`:

- `expected_commit`: the full code of the `main` commit you merged;
- `confirmation`: `DEPLOY_FOOTBALL_LIVE_REFRESH`.

Approve the `production-admin-activation` environment. It deploys this one
function, sets no secret and applies no migration. **Success looks like:** the
workflow finishes green.

The live switch already reads SofaScore, so the new code works at once: from the
next tick it also fetches the details (goals, cards, lineups) of up to 4 fixtures
(12 SofaScore requests) and stores them.

## Step 4: check it works

1. Open a finished match page: the summary lists the goals and cards, the stats
   the shots, the line-ups both teams.
2. `[SLOT - LANE A: the check that the first Fantasy observation was recorded]`

## Step 5: the final switches (automatic Fantasy scoring)

1. If you switched Fantasy automatic updates off in "Before you start", switch
   them back on:

   ```sql
   select app_private.fantasy_automation_configure(true);
   ```

2. `[SLOT - LANE A: exact switches and commands so Fantasy scoring runs by itself,
with what to look at to see the first scored match]`

## If it stops

Every `stop:` message means production is not in the state the script was written
for. **Nothing was saved.** Do not edit the script.

| The message says                                             | What it means and what to do                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `this script is not final`                                   | A slot or a fingerprint above is still empty. Stop and tell whoever gave you the script.                                                       |
| `a scheduled (pg_cron) job is running right now`             | A background job was in the middle of a run. Wait a minute and run it again.                                                                   |
| `the Fantasy lifecycle tick is on`                           | Run `select app_private.fantasy_automation_configure(false);`, then run the script again. Switch it back on in step 5.                         |
| `a scoring observation is being written right now`           | Something was recording a match. Wait until it is finished, then run again.                                                                    |
| `migration 20261011090000 or 20261011100000 is not recorded` | The earlier live-switch release is missing in production. Stop. Run `scripts/backend/apply-sofascore-live-switch.sql` first (its own runbook). |
| `... is not the reviewed version ... (md5)`                  | A function in production is not the one the script was checked against (someone changed it). Stop and ask: do not change anything yourself.    |
| `... already exists` while the migration is not recorded     | The object is there but the record is missing. Stop and ask. Do not insert a record by hand.                                                   |
| `... is missing`                                             | A migration this one builds on is not in production. Stop and ask.                                                                             |
| `is not the repository file byte for byte`                   | The text pasted was cut short or changed. Copy the whole file again from `main` and run it again.                                              |
| `the update did not check out`                               | After installing, a check found something wrong. Nothing was saved. Stop and send the full message.                                            |

## How to undo

- **Before step 2:** nothing to undo. The rehearsal saves nothing.
- **After step 2:** the migrations only add things nobody calls yet (new
  service-only functions, one table that no API role can read, and a recorder that
  behaves as before for the sources it already had). They cannot be removed by
  hand: migrations only go forward. If something must change, a new reviewed
  migration does it. Leaving them in place is safe.
- **The Edge Function:** run the `Football live refresh deploy` workflow on the
  earlier `main` commit.
- **The scores:** `select app_private.football_data_source_configure('shadow');`
  stops every write from the function and keeps the logs.
- **Fantasy scoring:** switch it off again with the command in step 5 (slot).

## What is in production now (so nothing between is missed)

Every migration after `20261003180000`, and what is known. "Applied" has a
written record; "Unknown" has none in the repository (it may well be applied).
None of the unknown ones is needed by this release, except the first row above
(`20261003180000`), which the script handles whichever way it is.

| Migration                                                                                                  | In production?     | Evidence                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261003180000_reconciled_provider_observations`                                                          | **Unknown**        | Script and docs exist; `RECONCILED_SCORING_INGESTION.md` says it "goes on production" (owner decision 2026-10-04); no `APPLIED_*` record. The script copes with both.                                       |
| `20261004120000_current_fixture_left_out_players`                                                          | Applied 2026-10-04 | `APPLIED_2026_10_04_GW1_LEFT_OUT_PLAYERS.md` (06:18)                                                                                                                                                        |
| `20261004130000_current_fixture_left_out_limit`                                                            | Applied 2026-10-04 | same file (06:45)                                                                                                                                                                                           |
| `20261004140000_fantasy_completion_skips_inactive_leagues`                                                 | Applied 2026-10-04 | same file (07:24)                                                                                                                                                                                           |
| `20261004150000_fantasy_open_missed_gameweek`                                                              | Applied 2026-10-04 | same file (08:07)                                                                                                                                                                                           |
| `20261005090000_fantasy_player_pool_photo`                                                                 | Unknown            | No apply script, no record                                                                                                                                                                                  |
| `20261005100000_push_delivery_claim`                                                                       | Unknown            | Script exists; `PUSH_NOTIFICATIONS.md` records only a rehearsal on a throwaway database                                                                                                                     |
| `20261005110000_push_fanout_and_tick`                                                                      | Unknown            | same                                                                                                                                                                                                        |
| `20261005120000_push_goal_cancelled_type`                                                                  | Unknown            | same                                                                                                                                                                                                        |
| `20261005130000_fantasy_public_recaps`                                                                     | Applied            | `MANAGER_CARD_OPERATIONS_RUNBOOK.md`, "Production order" 1: on production as of 2026-10-08                                                                                                                  |
| `20261005135000_push_remaining_alerts`                                                                     | Unknown            | same as the other push ones                                                                                                                                                                                 |
| `20261005140000_notification_device_takeover`                                                              | Unknown            | same                                                                                                                                                                                                        |
| `20261006143700_account_deletion_automatic`                                                                | Applied            | same document as `20261005130000`                                                                                                                                                                           |
| `20261008123000`, `20261008123100`, `20261008123200`, `20261008123300`, `20261008123400` (Manager Card, 5) | Applied 2026-10-08 | `APPLIED_2026_10_08_MANAGER_CARD.md`                                                                                                                                                                        |
| `20261009091728_fantasy_durable_progression`                                                               | Applied (stated)   | Owner's read of production on 2026-10-10: "every earlier migration already applied (173 rows, newest `20261010073509`)" (`MANAGER_CARD_OPERATIONS_RUNBOOK.md`, `MANAGER_CARD_GAP_PLAN.md`). Not row by row. |
| `20261009094920_home_stories`                                                                              | Applied (stated)   | same                                                                                                                                                                                                        |
| `20261009113132_home_stories_force_rls`                                                                    | Applied (stated)   | same                                                                                                                                                                                                        |
| `20261009195943_ai_home_stories`                                                                           | Applied (stated)   | same                                                                                                                                                                                                        |
| `20261009211234_story_presentation_repair`                                                                 | Applied (stated)   | same                                                                                                                                                                                                        |
| `20261010055425_compact_story_labels`                                                                      | Applied (stated)   | same                                                                                                                                                                                                        |
| `20261010073509_no_public_ai_notices`                                                                      | Applied            | same (the newest row of that read)                                                                                                                                                                          |
| `20261010120000`, `20261010120100`, `20261010120200`, `20261010120300` (Manager Card read API, 4)          | Unknown            | `apply-20261010120000-manager-card-api-v2.sql` exists; no `APPLIED_*` record                                                                                                                                |
| `20261010140000_sofascore_repoint_fixture_mapping`                                                         | Unknown            | On `main`; no script, no record. Nothing in this release needs it                                                                                                                                           |
| `20261011090000_football_data_source_switch`                                                               | Applied            | Production release of `main` at `01910e1b` (PR 422), as stated for this work; the match-details runbook says production reads `sofascore`                                                                   |
| `20261011100000_football_sofascore_live_snapshot`                                                          | Applied            | same                                                                                                                                                                                                        |
| `20261011110000_football_sofascore_snapshot_teams`                                                         | **Not applied**    | Installed by this script                                                                                                                                                                                    |
| `20261011120000_sofascore_fantasy_observations`                                                            | **Not applied**    | Installed by this script                                                                                                                                                                                    |
| `20261011130000` (Lane B), `20261011140000` (Lane A)                                                       | Not applied        | Slots, see above                                                                                                                                                                                            |

One more number worth knowing: on 2026-10-10 production had 173 recorded
migrations while the repository then held 175 files up to the newest one, so two
repository migrations at or below `20261010073509` were not recorded then. Which
two is not written anywhere; `20261003180000` ("staging, not applied" on
2026-10-04) is a candidate. This is why the script does not assume either way.

## Why the script does not pause the background jobs

The earlier scripts for this work (`apply-sofascore-live-switch.sql`,
`apply-sofascore-match-details.sql`) pause nothing: they refuse while any
scheduled job is mid-run, and so does this one. The migrations here add and
replace functions and one table and write no row of fixtures, Fantasy, news,
Pépites, predictions, notifications or users, so pausing those jobs would be
extra steps for no gain. The one exception is the Fantasy observation recorder
that migration 1 replaces: the script holds the observation table for the
moment of the change and, only when migration 1 is to be installed, wants the
Fantasy automatic updates off (step "Before you start" 2), as the single-purpose
script for it always did. The script never changes any switch itself, so there is
nothing to forget to restore except the Fantasy one you chose to turn off.
