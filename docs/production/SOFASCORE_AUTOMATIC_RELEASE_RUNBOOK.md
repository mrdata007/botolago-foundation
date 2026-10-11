# SofaScore automatic release runbook (owner steps)

Production is `tkewgajrljbwgwedqsxn` (BotolaGO Production V2).

This replaces the separate packages
[`SOFASCORE_LIVE_RELEASE_RUNBOOK.md`](SOFASCORE_LIVE_RELEASE_RUNBOOK.md) (already
done on production) and
[`SOFASCORE_MATCH_DETAILS_RELEASE_RUNBOOK.md`](SOFASCORE_MATCH_DETAILS_RELEASE_RUNBOOK.md)
for everything that is still to do. You do **one script**, **one deploy** and a
short list of switches. Nothing here is run by an agent: every production write
is yours and covers only the step you were told to do (`CLAUDE.md`, production
database writes).

> **Status: ready for the owner after the pull request is merged.** The script
> contains every migration of this release and the md5 fingerprints of the
> functions it checks, copied from the `database-quality` job of the pull request
> (run 38127384687). If production differs from what the script expects, it stops
> before changing anything and says why.

## What you will do, in short

1. Make sure nothing else is working on production (two minutes).
2. Run the script once as a **rehearsal** (it saves nothing) and read the answer.
3. Run it again for real (you change one word).
4. Deploy one function.
5. Switch on the automatic Fantasy scoring and Pronostics, in the order given.
6. Check that it works.

## What the script installs

It checks which of these are already in production, skips the ones that are, and
**checks** the ones it skipped instead of redoing them:

| Order | Migration                                          | What it gives you                                                                                                                                                    |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `20261003180000_reconciled_provider_observations`  | The place where a finished match is recorded as a scoring input (service-only). Skipped if it is already in production.                                              |
| 2     | `20261011110000_football_sofascore_snapshot_teams` | The two clubs of each fixture, which the SofaScore match details need.                                                                                               |
| 3     | `20261011120000_sofascore_fantasy_observations`    | The function that records a finished SofaScore match for Fantasy scoring (SofaScore only).                                                                           |
| 4     | `20261011130000_sofascore_player_auto_map`         | Automatic player matching: matches the safe cases by itself, puts the doubtful ones on a short review list. Two empty private tables and the staff review functions. |
| 5     | `20261011140000_sofascore_fantasy_auto_state`      | The memory of the automatic Fantasy path (retries, what was tried). One empty private table and three service-only functions.                                        |
| 6     | `20261011150000_ops_health_adaptive_coverage`      | The health checks count SofaScore Fantasy matches as covered, so they do not page by mistake. Same checks, same output.                                              |

It changes no fixture, no player, no point and no user. It only adds or replaces
functions and creates three empty private tables. Nothing anyone sees changes by
itself.

## Before you hand over (for whoever finishes the work, not the owner)

- **The md5 pins.** In the green `database-quality` run of the merged pull
  request, two steps print them: `SofaScore automatic pre-state md5` (three
  values, measured on a database built up to `20261011120000`, which is what
  production holds) and the md5 step after the full reset, which prints
  `SofaScore Fantasy observation md5` and `SofaScore automatic post-state md5`
  (twelve values). Each line has a `pin` column naming the placeholder
  (`FILL_FROM_CI_...`) in `PINS` of
  `scripts/backend/build-apply-sofascore-automatic.ts` that it fills; the
  Fantasy observation one is the single `SofaScore Fantasy observation md5` line
  with function `api.service_record_sofascore_fantasy_observation`. Put the
  real values in, then run `bun scripts/backend/build-apply-sofascore-automatic.ts`
  and `bun test scripts/backend`. The script refuses to run while any
  placeholder is left, and says which one. Only the CI values count.
- When the pins are in, change the status note at the top of this runbook and the
  test `apply-sofascore-automatic-script.test.ts` (the last-but-one test) will
  tell you if the wording and the pins disagree.

## Before you start

AGENTS.md: one writer at a time.

1. **Nothing else is writing to production.** Open the repository's Actions tab
   and make sure no run is going in the group `botolago-production-v2-mutation`
   (and no `Fantasy season orchestrator` run). No agent of yours is working
   against production either.
2. **Fantasy automatic updates.** Paste this and read the answer:

   ```sql
   select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
   ```

   - `false`: nothing to do.
   - `true`: the script will refuse the first time, only if migration 1 is still
     to be installed. In that case run
     `select app_private.fantasy_automation_configure(false);` first, and write
     down that it was on, so you switch it back on in step 5.

   You do not need to pause anything else for the script (live refresh, emails,
   predictions, Manager Card, Pépites): it touches none of their data. If a job is
   running at that very second, the script says so and you run it again in a
   minute.

3. **The pull request is merged to `main`**, its Actions have finished (merging
   runs them), and the md5 pins are in the script on `main`. Do not publish the
   website for this.

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
    where version in ('20261003180000', '20261011110000', '20261011120000',
                      '20261011130000', '20261011140000', '20261011150000')
    order by 1;                                  -- 6 rows
   ```

If the real run stops, nothing is saved either (it is one all-or-nothing
operation). Running it again afterwards is safe: it skips what is installed and
verifies it.

## Step 3: deploy the Edge Function (the one deploy)

Actions, `Football live refresh deploy`, **Run workflow** on `main`:

- `expected_commit`: the full code of the `main` commit you merged;
- `confirmation`: `DEPLOY_FOOTBALL_LIVE_REFRESH`.

Approve the `production-admin-activation` environment. It deploys this one
function, sets no secret and applies no migration. It first reads production and
refuses unless `20261011090000`, `20261011100000` and `20261011110000` are all
recorded (step 2 records the last one). **Success looks like:** the workflow
finishes green.

The live switch already reads SofaScore, so the new code works at once: from the
next tick it also fetches the details (goals, cards, lineups) of up to 4 fixtures
(12 SofaScore requests) and stores them, and, once the switches in step 5 are on,
records each finished match for Fantasy scoring.

## Step 4: check the match pages

Open a finished match page: the summary lists the goals and cards, the stats the
shots, the line-ups both teams. (The Fantasy checks come after the switches,
at the end of step 5.)

## Step 5: the final switches (automatic Fantasy scoring and Pronostics)

Do these in order. Each one is a production write that you decide on; none is
done by an agent. In the SQL Editor, run each block alone and read the answer
before the next.

### 5.1 Check the two switches that are already on

```sql
select app_private.football_data_source() as data_source;                -- must say: sofascore
select football_live_refresh_enabled, functions_base_url is not null as base_url_set
  from app_private.notification_email_settings;                          -- must say: true, true
```

If either is different, stop here and ask. (They were switched on by the live
release.)

### 5.2 Pause the two jobs that read the gameweeks, for the next step only

Step 5.3 changes the gameweeks, so AGENTS.md wants the jobs that read them paused.
First write down what is on now:

```sql
select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
select compute_enabled, read_enabled from app_private.manager_card_settings;
```

Then pause them (leave the Manager Card read switch as it is):

```sql
select app_private.fantasy_automation_configure(false);
select app_private.manager_card_configure(false, null);
```

You switch them back in 5.5, to what you wrote down.

### 5.3 Turn on the SofaScore scoring policy for the current gameweek

This tells Fantasy to score from the SofaScore records, from the current gameweek
on, for the current season. It does not change any rule or any past, finished
gameweek (the database refuses if a gameweek from that point on is already being
finalized). It is done once per season.

**a. Find the ids and see whether it is already on.** Read only:

```sql
select s.id as season_id, s.name as season, g.id as gameweek_id,
       g.sequence_number as gameweek, g.status, g.starts_at
  from app.fantasy_gameweeks g
  join app.fantasy_seasons s on s.id = g.fantasy_season_id
 where s.status = 'active' and g.status in ('open', 'locked', 'live', 'provisional')
 order by g.sequence_number;

select season_id, from_gameweek, paused, activated_at from app_private.fantasy_adaptive_policy;
```

Take the first row of the first answer that is the gameweek whose matches are
being played now (for round 3, `gameweek` = 3). Write down its `season_id`,
`gameweek_id` and `gameweek`.

- Second answer has **no row** for your season: continue with b and c.
- It has a row, `paused` = `true`: the policy is installed but off. Switch it on
  with `select api.service_pause_adaptive_scoring('<season_id>'::uuid, false);` run
  like block c (the two lines that start `begin;` and `select set_config`), then
  go to 5.4.
- It has a row, `paused` = `false`, and `from_gameweek` is at or below the
  current gameweek: it is already on. Go to 5.4.
- It has a row with a `from_gameweek` that is **higher** than the current
  gameweek: stop and ask. The database does not let it be moved.

**b. Read the guard code (read only, saves nothing).** Replace `<gameweek_id>`:

```sql
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_adaptive_scoring_audit('<gameweek_id>'::uuid) ->> 'activationDigest' as digest;
rollback;
```

The answer is a long code (64 characters). Copy it.

**c. Switch it on.** Replace the three values. The digest must be the one you just
read; if the gameweeks changed in between, the database refuses with
`adaptive_activation_baseline_changed` and you read it again.

```sql
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_activate_adaptive_scoring(
  '<season_id>'::uuid, <gameweek>, '<digest from b>', false);
commit;
```

**Success looks like:** `{"enabled": true, "fromGameweek": 3}` (your number).
Check: `select season_id, from_gameweek, paused from app_private.fantasy_adaptive_policy;`
shows your season, `paused` = `false`.

### 5.4 Matches already played: record them (one-off, if there are any)

New finished matches are recorded by themselves from now on. For the matches of
the current gameweek that finished earlier, nothing needs a command in most cases:

- The match-details backfill (below) fetches every finished match of the season
  that has no stored details, and **records it for Fantasy at the same time**,
  with the same SofaScore replies. It is not scheduled; you start it by hand.
- In addition, every refresh tick catches up one finished match
  from the **last 72 hours** that was never tried, 3 SofaScore requests each. If
  all the matches you care about finished less than 72 hours ago and you are in no
  hurry, you can skip the backfill and just wait.

Run the backfill (up to 4 matches per call, 12 SofaScore requests; repeat until
`due` is 0):

```sql
select app_private.invoke_scheduled_function(
  (select functions_base_url from app_private.notification_email_settings where id),
  'football-live-refresh',
  '{"job":"match_details_backfill"}'::jsonb
) as request_id;
```

Wait 30 seconds, then read the answer (use the `request_id` above):

```sql
select status_code,
       content::jsonb -> 'due' as due,
       content::jsonb -> 'matchDetails' as details,
       content::jsonb -> 'fantasy' as fantasy
  from net._http_response where id = <request_id>;
```

Expect `status_code` 200. A 429 means the SofaScore quota floor was reached: stop
and wait (the Fantasy catch-up shares that quota). A match is held, not lost,
when a player has no reviewed mapping yet: it is retried by itself (15 minutes,
then an hour, then six hours), also after the automatic matching or you have
resolved the player.

A match that finished **more than 72 hours ago and whose details were already
stored** is reached by neither the backfill nor the catch-up. If the check in 5.6
shows such a match without a record, tell whoever handed you this runbook: the
catch-up window (`SOFASCORE_FANTASY_CATCHUP_HOURS`) can be widened, or the manual
runner of `SOFASCORE_FANTASY_SIMPLE.md` covers it.

### 5.5 Switch Fantasy automatic updates back on

Use the values you wrote down in 5.2. Switch on only what was on:

```sql
select app_private.fantasy_automation_configure(true);       -- only if it was true before
select app_private.manager_card_configure(true, null);       -- only if compute_enabled was true before
```

The first one makes the database move gameweeks forward by itself (lock, live,
provisional). Points are scored and gameweeks finalized by the hourly
GitHub workflow in 5.6.

### 5.6 Let the hourly scoring run (GitHub)

In the repository on GitHub: **Settings, Secrets and variables, Actions,
Variables, New repository variable** (or edit it):

- Name: `FANTASY_AUTOMATION_ENABLED`
- Value: `true`

From then on `Fantasy season orchestrator` runs every hour at minute 12 and does
the calendar, the scoring, the rankings and the finalization. While the data
source is `sofascore` it does **not** need `SPORTSMONKS_API_TOKEN` (the SportsMonks
steps are skipped by themselves); you can leave that secret empty or remove it
(`SOFASCORE_ORCHESTRATOR.md`). You can start it now by hand from the Actions tab
(`Fantasy season orchestrator`, **Run workflow** on `main`) instead of waiting.

### 5.7 Pronostics (only if they are meant to be on)

Pronostics score from the same fixtures and need nothing else from this release.
Read first:

```sql
select mode, scoring_enabled from app_private.prediction_settings;
```

If `mode` is already `public` and `scoring_enabled` is `true`: **leave it as is**,
nothing to do. If they are meant to be on and are not:

```sql
select app_private.predictions_configure('public', true);   -- or 'testers' for a trial first
```

If they are not meant to be on yet, do not run it.

## Check that it worked

All read only. Run them after the first finished match following step 5, or
straight away for the matches you ran in 5.4.

1. **A Fantasy record exists for a finished match** (newest first):

   ```sql
   select o.fixture_id, o.observed_at, o.simple_ready, o.full_ready
     from app_private.fantasy_fixture_observations o
    order by o.observed_at desc, o.id desc limit 10;
   ```

   `simple_ready` = `true` is enough for points; `full_ready` is `true` when
   SofaScore also gave assists and saves for that match.

2. **What the automatic path did, per match** (`recorded` is the goal; `held` has
   a reason in `last_outcome`; `gave_up` needs the manual runner):

   ```sql
   select status, count(*) from app_private.sofascore_fantasy_attempts group by 1;
   select fixture_id, status, attempts, last_outcome, next_retry_at
     from app_private.sofascore_fantasy_attempts
    where status <> 'recorded' order by last_attempt_at desc limit 20;
   ```

   A match with a record from the manual runner does not appear in this table;
   that is normal.

3. **Players waiting for you (the review list).** How many, and who:

   ```sql
   select count(*) from app_private.sofascore_player_match_queue where resolved_at is null;
   select sofascore_player_id, name, shirt_number, side, reason, times_seen, last_seen_at
     from app_private.sofascore_player_match_queue
    where resolved_at is null order by last_seen_at desc limit 30;
   ```

   Each is resolved by staff with
   `api.admin_resolve_sofascore_player_match('<sofascore id>', '<player id>')`
   (`SOFASCORE_PLAYER_MATCHING.md`); the list itself is
   `api.admin_sofascore_player_match_queue()`. The matches that wait for that
   player are retried by themselves afterwards. What was matched automatically is
   in `app_private.sofascore_player_match_log` (`method` says how).

4. **Points appear** (after the next hourly run, or the one you started by hand;
   replace `<gameweek_id>` with the one from 5.3):

   ```sql
   select count(*) as players_with_points, max(updated_at) as last_update
     from app.fantasy_player_gameweek_points where gameweek_id = '<gameweek_id>';
   select id, sequence_number, status from app.fantasy_gameweeks where id = '<gameweek_id>';
   ```

   `players_with_points` grows as matches are scored; the gameweek moves to
   `provisional` and, after the 12-hour selection window and the last match, to
   `finalizing` and `finalized` by itself. The Actions run
   `Fantasy season orchestrator` shows `ok` in its summary.

5. **The health checks stay green** (they know SofaScore matches now). In the
   operations health page, `fantasy_fixture_coverage` and `fantasy_scoring` should
   not fail for a match that was recorded.

## If it stops

| The message says                                                                 | What it means and what to do                                                                                                                                                      |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `this script is not final`                                                       | A fingerprint (md5 pin) is still empty. Stop and tell whoever gave you the script.                                                                                                |
| `a scheduled (pg_cron) job is running right now`                                 | A background job was in the middle of a run. Wait a minute and run it again.                                                                                                      |
| `the Fantasy lifecycle tick is on`                                               | Run `select app_private.fantasy_automation_configure(false);`, then run the script again. Switch it back on in step 5.5.                                                          |
| `a scoring observation is being written right now`                               | Something was recording a match. Wait until it is finished, then run again.                                                                                                       |
| `migration 20261011090000 or 20261011100000 is not recorded`                     | The earlier live-switch release is missing in production. Stop. Run `scripts/backend/apply-sofascore-live-switch.sql` first (its own runbook).                                    |
| `... is not the reviewed version ... (md5)`                                      | A function in production is not the one the script was checked against (someone changed it). Stop and ask: do not change anything yourself.                                       |
| `... already exists` while the migration is not recorded                         | The object is there but the record is missing. Stop and ask. Do not insert a record by hand.                                                                                      |
| `... is missing`                                                                 | A migration this one builds on is not in production. Stop and ask.                                                                                                                |
| `an object it creates already exists` or `neither recorded nor part of this run` | Production is not the state the script was written for (an object is there without its record, or an earlier migration is missing). Stop and ask. Do not insert a record by hand. |
| `is not the repository file byte for byte`                                       | The text pasted was cut short or changed. Copy the whole file again from `main` and run it again.                                                                                 |
| `the update did not check out`                                                   | After installing, a check found something wrong. Nothing was saved. Stop and send the full message.                                                                               |

## How to undo

- **Before step 2:** nothing to undo. The rehearsal saves nothing.
- **After step 2:** the migrations only add things nobody calls yet (new
  service-only functions, three private tables that no API role can read, two
  staff functions, a recorder and a "reviewed" check that behave as before for
  what already existed, and a health check that now also counts SofaScore
  matches). They cannot be removed by hand: migrations only go forward. If
  something must change, a new reviewed migration does it. Leaving them in place
  is safe.
- **The Edge Function:** run the `Football live refresh deploy` workflow on the
  earlier `main` commit.
- **Stop the automatic Fantasy records, keep everything else:** set the Edge
  Function secret `SOFASCORE_FANTASY_ENABLED` to `false` (no deploy needed). The
  scores and the match details carry on.
- **Stop every SofaScore write (scores, details, Fantasy):**
  `select app_private.football_data_source_configure('shadow');`. It reads and logs
  but writes nothing, and the Fantasy step only does a dry run. Go back with
  `select app_private.football_data_source_configure('sofascore');`.
- **Stop the scoring and the gameweek moves:**
  `select app_private.fantasy_automation_configure(false);` for the database tick,
  and set the GitHub variable `FANTASY_AUTOMATION_ENABLED` to `false` (or remove
  it) for the hourly workflow. Observations already recorded stay recorded.
- **Pause the SofaScore scoring policy** (Fantasy keeps its old behaviour for
  new matches, no past result is touched; the 5.3 lines with `begin;` and
  `set_config`):
  `select api.service_pause_adaptive_scoring('<season_id>'::uuid, true);`
- **Pronostics:** `select app_private.predictions_configure('off');` (or put back
  the mode you read in 5.7).

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
| `20261011130000_sofascore_player_auto_map`                                                                 | **Not applied**    | Installed by this script                                                                                                                                                                                    |
| `20261011140000_sofascore_fantasy_auto_state`                                                              | **Not applied**    | Installed by this script                                                                                                                                                                                    |
| `20261011150000_ops_health_adaptive_coverage`                                                              | **Not applied**    | Installed by this script                                                                                                                                                                                    |

One more number worth knowing: on 2026-10-10 production had 173 recorded
migrations while the repository then held 175 files up to the newest one, so two
repository migrations at or below `20261010073509` were not recorded then. Which
two is not written anywhere; `20261003180000` ("staging, not applied" on
2026-10-04) is a candidate. This is why the script does not assume either way.

## Why the script does not pause the background jobs

The earlier scripts for this work (`apply-sofascore-live-switch.sql`,
`apply-sofascore-match-details.sql`) pause nothing: they refuse while any
scheduled job is mid-run, and so does this one. The migrations here add and
replace functions and create three empty private tables and write no row of fixtures, Fantasy, news,
Pépites, predictions, notifications or users, so pausing those jobs would be
extra steps for no gain. The one exception is the Fantasy observation recorder
that migration 1 replaces: the script holds the observation table for the
moment of the change and, only when migration 1 is to be installed, wants the
Fantasy automatic updates off (step "Before you start" 2), as the single-purpose
script for it always did. The script never changes any switch itself, so there is
nothing to forget to restore except the Fantasy one you chose to turn off.
