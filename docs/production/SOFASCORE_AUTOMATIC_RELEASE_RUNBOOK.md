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
> functions it checks, copied from the `database-quality` jobs of the pull
> requests (runs 38137117250 and 38141817120). If production differs from what
> the script expects, it stops before changing anything and says why.

## What you will do, in short

1. Make sure nothing else is working on production (two minutes).
2. Run the script once as a **rehearsal** (it saves nothing) and read the answer.
3. Run it again for real (you change one word).
4. Deploy one function.
5. Switch on the automatic Fantasy scoring and Pronostics, in the order given.
6. Check that it works.

## What the script installs

On 2026-10-11 you read production (read-only) and found that 27 migrations the
repository has are missing from the migration history
(`supabase_migrations.schema_migrations`). They are not all the same case, and
the script treats each case on its own terms. In plain words:

- **24 of them are already in production** (someone applied them another way);
  only the line in the history is missing. The script does **not** run them
  again. Before it writes a history line it checks, in the database itself, that
  what the migration made is really there: every function it made has exactly
  the text of the repository (it compares a fingerprint of the function body),
  every table is there, every list of values (enum) has its values, and, for the
  three that put data in, that the data is there (the editorial secret row, the
  email settings row, and at least the 23 club links the team seed reported). If
  one check fails the script stops, names the migration and the object, and
  writes nothing. This is the "history" block; it covers
  `20260919130000`, `20260919150000`, `20260919160000`, `20260921120000`,
  `20260921140000`, `20260921160000`, `20260921170000`, `20260921180000`,
  `20260921190000`, `20260921200000`, `20260921220000`, `20260922180000`,
  `20260922180100`, `20260922180200`, `20260922200000`, `20260922200100`,
  `20260924100000`, `20260924120000`, `20260924140000`, `20260924140100`,
  `20260924163000`, `20260924170000`, `20260924173000` and `20260927153000`.
  Two details: where a later migration (already recorded) changed a function
  afterwards, the check compares with that later text, because that is what
  production must hold. And `api.fantasy_player_season_stats` is compared with
  its text **without the full-line `--` comments**, because that is how you
  measured production (the comments are not part of what the function does).
- **One function is in production in a slightly different, unreviewed form:**
  `api.fantasy_gameweek_summary` (the average and highest score of a gameweek,
  from `20260921200000`). Production holds a shorter text (1090 characters; the
  reviewed one is 1432, almost all of the difference is explanatory comments,
  and nobody knows exactly what else differs). The script first checks that
  production still holds **exactly the version you measured** (fingerprint
  `ae72632e...`); if it holds anything else it stops. It then replaces the
  function with the reviewed text of the repository (with its comment and
  permissions: signed-out visitors, signed-in users and the service can call
  it, nobody else), checks the result, and only then writes the history line of
  `20260921200000`. If the function already has the reviewed text it is left
  alone.
- **Four were never applied** and are installed as full steps below, each only
  if its objects are really absent, and each checked afterwards.
- `20261003180000` **is** recorded (you saw it), so it is skipped and only
  verified, as before.

The full steps, in the order the script runs them (it is the version order,
and no step depends on one that comes after it):

| Order | Migration                                              | What it gives you                                                                                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `20260925090500_fantasy_league_page_skip_empty`        | The Fantasy scoring worker stops walking leagues that have no Fantasy member (a league created from Pronostics starts with none), so they cannot use up its call budget. Replaces one function (production still holds the older `20260914200719` text); no data.                                                                          |
| 2     | `20261001170000_curated_team_crests`                   | Club crests supplied by BotolaGO are kept apart from the provider's: adds `api.service_set_curated_team_crest` and replaces `api.attach_football_team_crest` so the provider sync never overwrites a supplied crest. Functions only; no data.                                                                                              |
| 3     | `20261003180000_reconciled_provider_observations`      | The place where a finished match is recorded as a scoring input (service-only). Recorded in production, so it is skipped and verified.                                                                                                                                                                                                     |
| 4     | `20261010140000_sofascore_repoint_fixture_mapping`     | A replayed (postponed) SofaScore match gets a new event number: one service-only function moves that fixture's SofaScore mapping to the new number, in place, and writes an audit line. Creates no table; changes no existing row.                                                                                                         |
| 5     | `20261011110000_football_sofascore_snapshot_teams`     | The two clubs of each fixture, which the SofaScore match details need.                                                                                                                                                                                                                                                                     |
| 6     | `20261011120000_sofascore_fantasy_observations`        | The function that records a finished SofaScore match for Fantasy scoring (SofaScore only).                                                                                                                                                                                                                                                 |
| 7     | `20261011130000_sofascore_player_auto_map`             | Automatic player matching: matches the safe cases by itself, puts the doubtful ones on a short review list. Two empty private tables and the staff review functions.                                                                                                                                                                       |
| 8     | `20261011140000_sofascore_fantasy_auto_state`          | The memory of the automatic Fantasy path (retries, what was tried). One empty private table and three service-only functions.                                                                                                                                                                                                              |
| 9     | `20261011150000_ops_health_adaptive_coverage`          | The health checks count SofaScore Fantasy matches as covered, so they do not page by mistake. Same checks, same output.                                                                                                                                                                                                                    |
| 10    | `20261011160000_public_ranking_exclusions`             | Test accounts can be hidden from public rankings; nothing is hidden until you do the step in docs/backend/PUBLIC_RANKING_EXCLUSIONS.md (optional, at the end of this page). One empty private list, two staff functions, one staff permission, and the four public ranking readers replaced (permissions unchanged, the script proves it). |
| 11    | `20261011170000_news_article_detail_other_language_id` | An article link carrying the id of the other language's edition now opens the reader's own language edition instead of answering "not found" (which left a failed request in the browser console). Replaces one function; permissions unchanged (the script proves it); no data.                                                           |
| 12    | `20261011180000_sofascore_player_performances`         | Pépites works again: each finished SofaScore match fills the table Pépites reads, from the data Fantasy already recorded. One service-only function; see below.                                                                                                                                                                            |

Why this order: it is simply the order of the migration numbers, and none of the
four new ones needs anything that a later one brings. `20261011160000` (the
public ranking exclusions) and `20261011170000` (the article function) touch
nothing the SofaScore steps use, so they sit between `20261011150000` and
`20261011180000` by number. Before the article step replaces
`api.news_article_detail` the script has already checked, in the history block,
that production holds the text of `20260924200600` (the last one that function
had), and the step checks it again.

For every function a step **replaces**, the script pins the text production
holds now, and stops if it differs. Where you measured the fingerprint of the
function **body** on production, the guard says so in its message ("md5 of
pg_proc.prosrc, the body alone"); the whole-definition fingerprints (printed by
CI) are used for the results.

It changes no fixture, no player, no point and no user. It adds or replaces
functions, creates four empty private tables, lets two statistics columns
(assists, penalties missed) be empty, adds one staff permission (`rankings.manage`,
given to `platform_admin`), and writes the migration history lines.
Nothing anyone sees changes by itself, apart from the reviewed gameweek summary
and the article link fix. The four public ranking readers are replaced by
versions that look at an empty list, so the rankings read exactly as before: test
accounts can be hidden from public rankings, but nothing is hidden until you do
the step in docs/backend/PUBLIC_RANKING_EXCLUSIONS.md (optional, at the end of
this page).

**Fantasy automatic updates must be off for `20260925090500`** (and for
`20261003180000` if it were not recorded): both replace a Fantasy function. See
"Before you start", item 2. Run the script when Fantasy gameweek 1 is already
scored (the league-list migration was written for that; the script checks it
and stops otherwise), and not at minute 12 of an hour, when the Fantasy
orchestrator may start.

**Pépites, in plain words (the last row, `20261011180000`).** Pépites reads each player's appearances
from one table, and only SportsMonks used to write it. Step 7 lets the
football-live-refresh function write it from SofaScore, using the finished-match
data Fantasy has already recorded: no extra SofaScore request, the same checked
players. Where SofaScore does not give a number (assists, saves or penalties on a
match with limited coverage) the cell stays empty; it is never filled with a
zero. A match SportsMonks already covered keeps its SportsMonks rows. The matches
finished since SportsMonks stopped are filled by the same function on its next
runs, nothing to do by hand. It does not change a single Fantasy input: the two
Fantasy functions it touches are changed so they ignore these new rows. If you
deploy the function before this row is installed, Pépites simply stays as it is and the log
says so once.

## Before you hand over (for whoever finishes the work, not the owner)

- **The md5 pins.** In the green `database-quality` run of the merged pull
  request, two steps print them: `SofaScore automatic pre-state md5` (nine
  values, measured on a database built up to `20261011120000`, which is what
  production holds; none of them is for the catch-up migrations, whose "before"
  fingerprints are the body-text ones you measured on production and are already
  in the script) and the md5 step after the full reset, which prints
  `SofaScore Fantasy observation md5` and `SofaScore automatic post-state md5`
  (twenty-nine values: sixteen for the SofaScore steps, five for the catch-up migrations and eight for the public ranking exclusions). Each line has a `pin` column naming the placeholder
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
   - `true`: the script will refuse the first time if `20260925090500` (the
     league list) is still to be installed, which it is. In that case run
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

6. **Pépites has appearances again** (read only). Rows from SofaScore, per
   match; `unknown_assists` and `unknown_saves` are the cells left empty on
   matches with limited coverage, never zeros:

   ```sql
   select p.fixture_id, count(*) as players, max(p.provider_observed_at) as observed,
          count(*) filter (where p.assists is null) as unknown_assists,
          count(*) filter (where p.saves is null and p.position = 'goalkeeper') as unknown_saves
     from app.player_fixture_performances p
    where p.source_provider = 'sofascore' and p.active
    group by p.fixture_id order by observed desc limit 20;
   ```

   The log line `football_live_refresh_performances` of the Edge Function says
   `written`, `unchanged`, `rated` or `refused:<reason>` per match
   (`sofascore_performances_other_provider_rows` means SportsMonks covered that
   match and keeps it). Pépites picks the rows up at its next run.

## Follow-up: unknown substitutes (`20261011190000`)

Needed only once the automatic path is live and a match is held with
`held:unmapped_players` because a **substitute** the app has no player record
for (the review list shows `no_candidate`) came on. Example: UTS Rabat 0-0 RSB
Berkane, SofaScore event 17256977. A player the app does not know cannot be in
anyone's team and cannot earn points, so he no longer needs to hold the match
for everyone; a starter, or a substitute who scored, assisted or was carded,
still does.

1. Merge the pull request and wait for a green `database-quality` run.
2. Run `scripts/backend/apply-20261011190000-sofascore-unmapped-substitutes.sql`
   exactly like the release script: rehearsal first (it rolls back and says
   "Rehearsal passed"), then change `rollback;` to `commit;`. It replaces one
   function, checks the function it replaces by its md5, and writes no fixture,
   Fantasy, Pépites or user row.
3. Deploy the Edge Function `football-live-refresh` (same code deploy as step 3
   above) **after** step 2. In the other order nothing is lost: the old recorder
   refuses the new request (`sofascore_request_invalid`) and the match stays
   held.
4. The held match is picked up by itself within the retry delays; the log line
   `football_live_refresh_fantasy` shows `recorded` and `excludedUnmapped` (the
   SofaScore ids left out). If it says
   `held:sofascore_unmapped_exclusion_refused`, the database found a squad member
   of that club who could be the player (same shirt number): map him in the
   review list instead.

## Optional: hide the test accounts

Only if you want test and QA accounts out of the public rankings. Skip it
otherwise: after step 2 the rankings read exactly as before, and nothing is
hidden until you do this. It is a separate production write that you decide on,
after step 2, never as part of the script.

The steps are in
[`docs/backend/PUBLIC_RANKING_EXCLUSIONS.md`](../backend/PUBLIC_RANKING_EXCLUSIONS.md);
this is the order, in plain words:

1. Same check as "Before you start", item 1: nothing else is writing to
   production. This write touches only the hidden-accounts list and the admin
   audit log, which no scheduled job writes.
2. Run the read-only query "Finding the test accounts" of that page and decide,
   account by account, which ones to hide. Write the user ids down.
3. Run the guarded block "2. A guarded SQL script (from the SQL editor)" once,
   with your own sign-in id (the `auth` user id of your active staff account) and
   the confirmed user ids filled in. It is one transaction: it refuses if you
   are not an active staff member or an id has no profile, and writes one audit
   line per account. Running it again with the same ids changes nothing.
4. Read back (read only):

   ```sql
   select e.user_id, p.username, e.reason, e.created_at
     from app_private.public_ranking_exclusions e
     left join app.profiles p on p.id = e.user_id order by e.created_at;
   ```

   Then open the Fantasy season ranking and the Pronostics leaderboard: the
   listed accounts are gone and the ranks read 1, 2, 3 with no hole. A change
   shows on the next read (cached pages follow their own time).

To show an account again, follow "Hide or show an account" in that page: delete
its row and write the audit line the same way. Nothing else needs undoing; no
score or rank is recalculated either way.

## If it stops

| The message says                                                                                             | What it means and what to do                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `this script is not final`                                                                                   | A fingerprint (md5 pin) is still empty. Stop and tell whoever gave you the script.                                                                                                                                                                                        |
| `a scheduled (pg_cron) job is running right now`                                                             | A background job was in the middle of a run. Wait a minute and run it again.                                                                                                                                                                                              |
| `the Fantasy lifecycle tick is on`                                                                           | Run `select app_private.fantasy_automation_configure(false);`, then run the script again. Switch it back on in step 5.5.                                                                                                                                                  |
| `a scoring observation is being written right now`                                                           | Something was recording a match. Wait until it is finished, then run again.                                                                                                                                                                                               |
| `migration 20261011090000 or 20261011100000 is not recorded`                                                 | The earlier live-switch release is missing in production. Stop. Run `scripts/backend/apply-sofascore-live-switch.sql` first (its own runbook).                                                                                                                            |
| `... is not the reviewed version ... (md5)`                                                                  | A function in production is not the one the script was checked against (someone changed it). Stop and ask: do not change anything yourself.                                                                                                                               |
| `... already exists` while the migration is not recorded                                                     | The object is there but the record is missing. Stop and ask. Do not insert a record by hand.                                                                                                                                                                              |
| `... is missing`                                                                                             | A migration this one builds on is not in production. Stop and ask.                                                                                                                                                                                                        |
| `an object it creates already exists` or `neither recorded nor part of this run`                             | Production is not the state the script was written for (an object is there without its record, or an earlier migration is missing). Stop and ask. Do not insert a record by hand.                                                                                         |
| `is not the repository file byte for byte`                                                                   | The text pasted was cut short or changed. Copy the whole file again from `main` and run it again.                                                                                                                                                                         |
| `production does not match what migrations missing from the history create`                                  | A migration that is in production but missing from the history does not look like the repository (the message lists each function, table, type or data row, with its migration). Nothing was saved. Stop and send the full message: do not insert a history line by hand. |
| `api.fantasy_gameweek_summary is neither the version production held on 2026-10-11 ... nor the reviewed one` | The function was changed again after you measured it. Stop and ask.                                                                                                                                                                                                       |
| `does not have the body text ... replaces (md5 of pg_proc.prosrc`                                            | A function that a step replaces is not the text production was measured to hold. Stop and ask.                                                                                                                                                                            |
| `Fantasy gameweek 1 has not been scored yet`                                                                 | The league-list migration waits until Fantasy gameweek 1 is finalized. Run the script after that.                                                                                                                                                                         |
| `the update did not check out`                                                                               | After installing, a check found something wrong. Nothing was saved. Stop and send the full message.                                                                                                                                                                       |

## How to undo

- **Before step 2:** nothing to undo. The rehearsal saves nothing.
- **After step 2:** the migrations only add things nobody calls yet (new
  service-only functions, four private tables that no API role can read, two
  staff functions, a recorder and a "reviewed" check that behave as before for
  what already existed, and a health check that now also counts SofaScore
  matches). They cannot be removed by hand: migrations only go forward. If
  something must change, a new reviewed migration does it. Leaving them in place
  is safe.
- **The Edge Function:** run the `Football live refresh deploy` workflow on the
  earlier `main` commit.
- **Stop only the Pépites feed:** set the Edge Function secret
  `SOFASCORE_PEPITES_SYNC_PER_TICK` to `0` (no deploy needed). Rows already
  written stay; a new reviewed migration is the only way to remove them.
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
| `20261003180000_reconciled_provider_observations`                                                          | Applied            | Recorded in the history (your read of production on 2026-10-11). The script skips it and verifies it.                                                                                                       |
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
| `20261010140000_sofascore_repoint_fixture_mapping`                                                         | **Not applied**    | Your read of 2026-10-11: `api.repoint_football_fixture_mapping` is absent. Installed by this script.                                                                                                        |
| `20261011090000_football_data_source_switch`                                                               | Applied            | Production release of `main` at `01910e1b` (PR 422), as stated for this work; the match-details runbook says production reads `sofascore`                                                                   |
| `20261011100000_football_sofascore_live_snapshot`                                                          | Applied            | same                                                                                                                                                                                                        |
| `20261011110000_football_sofascore_snapshot_teams`                                                         | **Not applied**    | Installed by this script                                                                                                                                                                                    |
| `20261011120000_sofascore_fantasy_observations`                                                            | **Not applied**    | Installed by this script                                                                                                                                                                                    |
| `20261011130000_sofascore_player_auto_map`                                                                 | **Not applied**    | Installed by this script                                                                                                                                                                                    |
| `20261011140000_sofascore_fantasy_auto_state`                                                              | **Not applied**    | Installed by this script                                                                                                                                                                                    |
| `20261011150000_ops_health_adaptive_coverage`                                                              | **Not applied**    | Installed by this script                                                                                                                                                                                    |
| `20261011160000_public_ranking_exclusions`                                                                 | **Not applied**    | Installed by this script (test accounts can be hidden from the public rankings; hides nothing by itself)                                                                                                    |
| `20261011170000_news_article_detail_other_language_id`                                                     | **Not applied**    | Merged to `main` after the SofaScore work (page speed, PR 427). Installed by this script (the article link fix).                                                                                            |
| `20261011180000_sofascore_player_performances`                                                             | **Not applied**    | Installed by this script (Pépites feed)                                                                                                                                                                     |

**The 27 versions missing from the history** (your read of production on
2026-10-11; every other repository version up to `20261011100000` is recorded,
`20261003180000` included):

| Case                                                             | Versions                                                                                                                                                                                                                                                                                                                                                                                                   | What the script does                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Applied by another path, objects match the repository (22 of 24) | `20260919130000`, `20260919150000`, `20260919160000`, `20260921120000`, `20260921140000`, `20260921170000`, `20260921180000`, `20260921190000`, `20260921220000`, `20260922180000`, `20260922180100`, `20260922180200`, `20260922200000`, `20260922200100`, `20260924100000`, `20260924120000`, `20260924140000`, `20260924140100`, `20260924163000`, `20260924170000`, `20260924173000`, `20260927153000` | Checks them again at run time, then writes the history line only.                                               |
| Applied, with the full-line comments removed                     | `20260921160000` (`api.fantasy_player_season_stats`)                                                                                                                                                                                                                                                                                                                                                       | Compares with the comment-free text (fingerprint `1b141bf8...`), then writes the history line.                  |
| Applied in a different, unreviewed form                          | `20260921200000` (`api.fantasy_gameweek_summary`)                                                                                                                                                                                                                                                                                                                                                          | Brings the function to the reviewed text (only from the exact text you measured), then writes the history line. |
| Never applied                                                    | `20260925090500`, `20261001170000`, `20261010140000`                                                                                                                                                                                                                                                                                                                                                       | Installed as full steps (rows 1, 2 and 4 above); `20261011170000`, merged later, is row 11.                     |

On 2026-10-10 production had 173 recorded migrations; the 27 above are why the
count did not match the repository then. The script does not assume anything
about them: each decision is made from the database at the moment you run it.

## Why the script does not pause the background jobs

The earlier scripts for this work (`apply-sofascore-live-switch.sql`,
`apply-sofascore-match-details.sql`) pause nothing: they refuse while any
scheduled job is mid-run, and so does this one. The migrations here add and
replace functions and create four empty private tables and write no row of fixtures, Fantasy, news,
Pépites, predictions, notifications or users, so pausing those jobs would be
extra steps for no gain. The one exception is the Fantasy functions that two migrations
replace (the league list `20260925090500`, and the observation recorder of
`20261003180000` if it were not recorded): the script holds the observation
table for the moment of the recorder change and, only when one of them is to be
installed, wants the Fantasy automatic updates off (step "Before you start" 2), as the single-purpose
script for it always did. The script never changes any switch itself, so there is
nothing to forget to restore except the Fantasy one you chose to turn off.

## Follow-up: current mapping review proofs

Migration `20261011191737_sofascore_fantasy_context_review_proofs` makes the automatic context reader use the same current review-proof helper as the strict observation recorder. It changes no mapping or scoring rule. Apply it after its PR passes database-quality and merges, using `scripts/backend/apply-sofascore-context-review-proofs.sql`: pause and drain production writers, rehearse, independently confirm the original function and absent history row, commit, and independently confirm the exact new body and service-only grants. Restore the measured switches with `sofascore-held-maintenance-resume.sql` immediately after maintenance. Existing automatic exact-name and name-and-shirt proofs become visible to the builder; legacy or tampered rows remain unreviewed.

## Follow-up: fewer holds

Migration `20261012120000_sofascore_hands_off` and the football-live-refresh code of the same pull request make a match wait for a person less often:

- An unknown player with nothing the score depends on (no goal, own goal or penalty) no longer holds the match, whether he started or came on. A starter left out counts as an anonymous starter of his club, at most two a club; three or more on one side still hold the match. The database still confirms each one against the auto-mapping list (`no_candidate` for that club) and the squad, and now also that each club's goals in the rows add up to the score.
- A first half with long stoppage time no longer makes a correct `minutesPlayed` look wrong: for a player on the pitch at half time the limit is the first half's stoppage time plus 2 (announced, or proved by a 45+n incident), never less than the old 6.
- Players are offered to the auto-mapping while the match is on, from the replies the live refresh already fetches, so doubtful names reach the staff list before full time.
- When staff match a player (`api.admin_resolve_sofascore_player_match`), his club's matches that wait on a player identity are tried on the next tick instead of after their back-off, even when they had been given up.
- Once, at install: the matches held or given up for an unknown player or a minutes disagreement are reopened, so the new rules apply to them.

Order matters: deploy `football-live-refresh` from the merged main commit first (`football-live-refresh-deploy.yml`), then apply the migration with `scripts/backend/apply-20261012120000-sofascore-hands-off.sql`: pause and drain writers with `sofascore-held-maintenance-pause.sql`, rehearse (the script ends in `rollback`), confirm independently that the history row is absent, change only the final `rollback` to `commit`, read back, and resume with `sofascore-held-maintenance-resume.sql` immediately. The script refuses unless the two functions it replaces are exactly the reviewed versions, and checks the new bodies and grants. It also reopens the matches the previous database refused as `sofascore_request_invalid` after the function was deployed (from 11:04 UTC on 12 October): between the two steps, a request leaving an unknown starter out is refused that way, and the function treats it as final. Its last result lists the reopened matches. A match whose stored replies were dropped (`refetch_needed`) is fetched again by the catch-up (three requests) only while it finished within `SOFASCORE_FANTASY_CATCHUP_HOURS` (72 by default).

Migration `20261012170000_manager_card_shrinkage_and_selection` (Manager Card rules v2, "calm scores") has nothing to do with SofaScore: it replaces one Manager Card calculation function and is installed by its own guarded script, `scripts/backend/apply-manager-card-rules-v2-calm.sql` (see `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`, "Rules v2"). It is listed here only so this runbook accounts for every migration after `20261003180000`.

Migrations `20261012200000_manager_card_ovr_change_type` and `20261012200100_manager_card_week_one` (Manager Card rules v3, "week one", and the rating-change notification) have nothing to do with SofaScore either. They are installed after the rules v2 script by their own guarded scripts, `scripts/backend/apply-20261012200000-manager-card-ovr-change-type.sql` then `scripts/backend/apply-manager-card-rules-v3-week-one.sql` (see `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`, "Rules v3"), and are listed here for the same reason.

Migration `20261014160000_manager_card_gameweek_percentile` (Manager Card rules v4: CAP, SEL and TRF ranked among the managers of each week, so the card no longer depends on the size of Fantasy points after the GW5 switch to rating points) has nothing to do with the SofaScore release either. It is installed after the rules v3 script by its own guarded script, `scripts/backend/apply-manager-card-rules-v4-percentile.sql` (see `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`, "Rules v4"), and is listed here for the same reason.

Migrations `20261013100000_premium_schema`, `20261013100100_card_editions`, `20261013100200_premium_api` and `20261013100300_premium_account_erasure` (the BotolaGO+ membership backend: tables, card editions, billing events, staff grants, and the account erasure's handling of memberships) have nothing to do with SofaScore. They ship switched off and are installed by their own guarded script, `scripts/backend/apply-20261013100000-premium-foundation.sql` (see `docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md`), and are listed here only so this runbook accounts for every migration after `20261003180000`.

Migration `20261013100400_premium_card_reads` (the BotolaGO+ career and duel reads and the card-history privacy switch) has nothing to do with SofaScore either. It ships switched off and is installed after the BotolaGO+ foundation by its own guarded script, `scripts/backend/apply-20261013100400-premium-card-reads.sql` (see `docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md`, "Premium card reads"), and is listed here for the same reason.

Migration `20261013100500_premium_admin_overview_by_product` (the BotolaGO+ admin overview also counting members by product: one function replaced, counts only) has nothing to do with SofaScore either. It ships through its own guarded script, `scripts/backend/apply-20261013100500-premium-admin-overview.sql` (see `docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md`, "Applying the migrations"), and is listed here for the same reason.

Migration `20261014150000_premium_card_league_context` (the BotolaGO+ league figures behind the member analytics: one read function and its helpers, no table, no write) has nothing to do with SofaScore either. It ships switched off with the card reads and is installed after `20261013100400` by its own guarded script, `scripts/backend/apply-20261014150000-premium-card-league-context.sql` (see `docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md`, "Premium league context: the figures behind the member analytics"), and is listed here for the same reason.

Migration `20261015120000_premium_round_recap` (the BotolaGO+ « Votre journée expliquée » read: one function and two helpers, no table, no job, no write) has nothing to do with SofaScore either. It ships switched off with BotolaGO+ and is installed after `20261014150000` by its own guarded script, `scripts/backend/apply-20261015120000-premium-round-recap.sql` (see `docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md`, "Premium round recap"), and is listed here for the same reason.

Migrations `20261015130000_rivals_notification_type`, `20261015130100_rivals` and `20261015130200_rivals_tick` (BotolaGO+ Rivaux: the lead-change notification type, the pinned rivals with their reads, and a lead-change tick with two scheduled jobs that ship switched off) have nothing to do with SofaScore either. They are installed after `20261014150000` by their own guarded scripts, `scripts/backend/apply-20261015130000-rivals-notification-type.sql` then `scripts/backend/apply-20261015130100-rivals.sql` (see `docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md`, "Rivaux"), and are listed here for the same reason.

Migration `20261015140000_premium_deadline_briefing` (the BotolaGO+ « Briefing avant la deadline » reads: functions only, no table, no job, no write) has nothing to do with SofaScore either. It ships switched off with BotolaGO+ and is installed after `20261014150000` by its own guarded script, `scripts/backend/apply-20261015140000-premium-deadline-briefing.sql` (see `docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md`, "Premium deadline briefing"), and is listed here for the same reason.

Migrations `20261015150000_trophies_schema`, `20261015150100_trophies_evaluator` and `20261015150200_trophies_reads` (BotolaGO+ Trophées: the trophies a manager earns by playing, the card frames, an evaluator with two scheduled jobs that ships switched off, and three reads) have nothing to do with SofaScore either. They are installed after `20261014150000` by their own guarded script, `scripts/backend/apply-20261015150000-trophies.sql` (see `docs/backend/TROPHIES_OPERATIONS_RUNBOOK.md`), and are listed here for the same reason.

Migrations `20261016150000_premium_season_schema` and `20261016150100_premium_season_api` (BotolaGO+ « Saison »: the one season product at 200 MAD, the payment details and personal payment codes, the payment record on a grant and the functions to read them and to activate a Saison by hand) have nothing to do with SofaScore either. They ship switched off with BotolaGO+ and are installed after `20261015150200` by their own guarded script, `scripts/backend/apply-20261016150000-premium-season.sql` (see `docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md`, "Saison (paiement manuel)"), and are listed here for the same reason.

Migrations `20261013110000_rapidapi_call_budget`, `20261013110100_football_live_refresh_60s` and `20261013110200_football_live_refresh_post_final_30min` (live polling every 60 seconds, the post-match refresh every 30 minutes, and the RapidAPI call counter with its monthly budget check) belong to the live-polling work, not to the SofaScore automatic release above. None has a guarded production script yet: they are not installed by this runbook, and nothing above depends on them. Their order, what they change and the request-cost estimate are in `docs/backend/SOFASCORE_LIVE_EDGE.md` ("Live polling every 60 seconds", "RapidAPI call counter and budget"). Production installs them only through the reviewed migration path, with the owner's go-ahead. This paragraph only lets this runbook account for every migration after `20261003180000`.

Migrations `20261013120000_sofascore_standings_apply` (the Botola table from SofaScore), `20261013120100_sofascore_catalog_weekly` (weekly clubs, players and crests, read and written only for already-mapped ids) and `20261013120200_football_catalog_weekly_cron` (the Sunday `football-catalog-weekly` job) have nothing to do with Fantasy and are not installed by this runbook. They follow the reviewed migration path, migrations before the Edge Function deploy; design, switches and deploy order are in `docs/backend/SOFASCORE_CATALOG_AND_STANDINGS.md`. They are listed here only so this runbook accounts for every migration after `20261003180000`.

## Follow-up: matching without names

Two migrations, owner decision: a name never decides who a SofaScore player is, and SofaScore is the single source, so the player catalog is keyed on the SofaScore player id.

- `20261013150000_sofascore_automatch_no_names` replaces the automatic player matcher. It links a SofaScore player at once when exactly one squad member of that club has his shirt number at a compatible position; it **creates** a player the catalog has nobody for (player, season membership, reviewed link, priced Fantasy pool entry); every other player goes on the staff list with a reason (`ambiguous_shirt`, `shirt_conflict`, `no_shirt_on_file`, `position_mismatch`, `no_shirt`, `weak_match`, `no_candidate`) and the candidate already filled in, so staff confirm in one click. Details: `docs/backend/SOFASCORE_PLAYER_MATCHING.md`.
- `20261013150100_sofascore_fantasy_hold_21_days` makes a held match retry until 21 days after kickoff instead of for 24 tries (about 3.5 days), so any link made in that window releases it. The back-off (15 minutes, 1 hour, then at most 6 hours) and the stored replies are unchanged, so the long retry costs no SofaScore request.

What they change in the database: two helper functions, widened check constraints (the old values stay valid, and a queue entry may have no side), and replaced functions (`api.service_sofascore_auto_map_players` and `app_private.football_mapping_supporting_state`, which now also accepts the `side-shirt-position` and `sofascore-created` proofs, the same kind of log-backed proof the older automatic methods use; `api.service_sofascore_fantasy_due` and `_note`). Neither writes data when applied: no mapping, player, pool entry or attempt is created, changed or removed. Existing links, including those made by name, stay and stay reviewed. Open queue entries keep their old (name-based) reason until the player is next seen.

**Order.** Deploy `football-live-refresh` from the merged main commit first (`football-live-refresh-deploy.yml`): its catch-up window now defaults to 504 hours (21 days) and it no longer counts attempts (it sends a constant for the old attempt-limit argument, which both databases accept and the new one ignores). The new function works against the previous database: until the second migration is installed, the old database still stops retrying a held match after 100 tries (about 22 days). Then install the two migrations, each with its guarded script, exactly as for the hands-off migration:

1. Merge the reviewed PR; its `database-quality` job must have passed (it runs `supabase/tests/database/sofascore_player_auto_map.test.sql` and `sofascore_fantasy_hold_21_days.test.sql`).
2. Pause and drain every writer with `scripts/backend/sofascore-held-maintenance-pause.sql`.
3. Run `scripts/backend/apply-20261013150000-automatch-no-names.sql` as it is, then `scripts/backend/apply-20261013150100-fantasy-hold-21-days.sql`. Each ends in `rollback`: every guard and the whole migration run, then nothing stays. The preflight refuses unless the functions it replaces are exactly the reviewed bodies (md5), none of the new objects exist, and the writers are paused and drained; the verification checks the new bodies, the grants, and that nothing was written. Read the last result rows and confirm independently that the `schema_migrations` row is absent again.
4. Change only the final `rollback` to `commit` in each, run it once, read it back independently, and resume the writers with `scripts/backend/sofascore-held-maintenance-resume.sql` right away.

**One-time link of the existing catalog (after the migrations).**

1. Run the workflow _SofaScore squad link (production, read only report)_ from `main` (`sofascore-squad-link-production-read.yml`; leave `show_names` off unless the artifact may be seen). About 16 RapidAPI requests (one `teams/get-squad` per club; cap 40). Its step summary opens with the counts: linked automatically once applied (CONFIRMED), need review (SUGGESTIONS), unmatched.
2. Review the lists in the artifact. Make the apply script locally: `bun scripts/backend/sofascore-squad-link.ts --from-report report.json --emit-sql --out-dir out --owner-auth-user-id <your staff auth user id>`.
3. Pause and drain the writers, run `out/apply.sql` as it is (it ends in `DRY_RUN_ROLLBACK` and prints the counts), then set `c_one_writer_checked` and `c_commit` to `true`, run it once, read it back, and resume the writers. CONFIRMED rows are written as staff resolutions (they count as reviewed); SUGGESTIONS become pre-filled entries for the one-click admin screen; held matches of the linked clubs are set to be retried.

Expect, afterwards: a SofaScore player the catalog does not have is created when he first appears, and does not hold the match. Only the leftovers on the staff list can. To undo the matching rule, restore the previous function bodies from `20261011130000` in a new migration; do not edit these.

Migrations `20261013140000_ops_health_two_stage_fantasy_stats` and `20261013140100_ops_health_two_stage_progression` (the two-stage statistics alerts: core data at once, full statistics 5 to 16 days later) change no data and no Fantasy rule. They add four interval constants and one read helper, and replace the bodies of the `fantasy_fixture_coverage`, `fantasy_scoring` and `fantasy_progression` health checks by patching the deployed functions (`pg_get_functiondef`, refusing if an expected fragment is missing). They are applied through the reviewed migration path (`docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`), the first before the second, with the reads described in `docs/operations/ALERTS.md`, "Two-stage statistics". They are listed here for the same reason.

## Follow-up: staged statistics (`20261013160000` to `20261013160300`)

Design: `docs/backend/SOFASCORE_STAGED_STATS.md`. Four migrations, all new, none applied anywhere yet, applied through the reviewed migration path (`docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`) in this order, after `20261013150100`:

- `20261013160000_staged_stats_gameweek_schema` adds `closed_at` and `closed_calculation_version` to the gameweeks, replaces the "one current gameweek" index so a closed gameweek no longer holds the slot, and adds the policy, close-journal and mode-change tables with the owner switch `app_private.fantasy_staged_stats_configure`. The switch is off for every season.
- `20261013160100_sofascore_staged_stats` adds the per-match schedule (`PROVISIONAL`, `FINAL`, `FINAL_LIMITED`), the pull history, the observation trigger that registers a match, `api.service_sofascore_staged_due`, `api.service_sofascore_staged_record_pull` and the staff list `api.admin_sofascore_final_limited`.
- `20261013160200_staged_stats_progression` makes the scoring mode follow the coverage, adds the close pipeline (`service_begin_fantasy_close`, `service_run_fantasy_close_price_batch`, `service_complete_fantasy_close`, `service_adopt_fantasy_close_prices`), the lock gate in front of `service_begin_fantasy_finalization`, and patches `service_apply_fantasy_price_changes`, `service_prepare_next_fantasy_gameweek` and `fantasy_lifecycle_tick` by `pg_get_functiondef` replacement (each refuses if the expected text is missing).
- `20261013160300_ops_health_staged_stats` adds the `fantasy_staged_stats` health check.

Nothing changes until the owner runs `select app_private.fantasy_staged_stats_configure('<fantasy season id>', true, <first gameweek>);` (adaptive and live scoring must already be on for the season). Pause the writers listed in `AGENTS.md` first; the pull job writes observations. Edge function: `SOFASCORE_STAGED_ENABLED=false` stops the pulls without a deploy. Deploying the Edge Function and the GitHub worker/orchestrator change is the owner's step.

## Follow-up: the Fantasy lifecycle worker on a database schedule (`20261013170000`, `20261013170100`)

Design: `docs/backend/FANTASY_WORKER_SCHEDULE.md`. Two new migrations, applied nowhere yet, through the reviewed migration path in this order, after `20261013160300`: `20261013170000_fantasy_worker_schedule` adds the worker switch (`lifecycle_worker_enabled`, off) and pass interval to `app_private.fantasy_automation_settings`, the single lifecycle lease, the run log and the tick bookkeeping, the five service functions (`service_fantasy_worker_lease_acquire`, `_lease_extend`, `_lease_release`, `_status`, `_record_run`), `fantasy_worker_work_pending`, `fantasy_worker_tick` and the pg_cron job `fantasy-worker-tick` (every 10 minutes); `20261013170100_ops_health_fantasy_worker` adds the `fantasy_worker` health check through a wrapper. Nothing changes until the Edge Function `fantasy-lifecycle-worker` is deployed and the owner runs `select app_private.fantasy_worker_configure(true);` (with `fantasy_automation_configure(true)` also on); the GitHub orchestrator keeps its schedule as the fallback and stands aside only while the database job is keeping up. Pause the writers listed in `AGENTS.md` first, as for any Fantasy write.

## Follow-up: faster points save (`20261013180000`)

On 2026-10-12 at 13:49 UTC `api.service_persist_fantasy_scoring_results` was cancelled by the statement timeout (SQLSTATE 57014) while saving gameweek 3's point events. The cause was in the function: for every player-fixture of the snapshot it scanned the whole submitted result array (twice), inserted the events one row at a time, and summed each player's points and minutes with a subquery that re-read the whole snapshot array. Time grew with the square of the match count. `20261013180000_fast_fantasy_points_save` replaces that one function with a set-based body: one statement validates every row (the first failing snapshot row still decides which error is raised), one statement writes the events, two grouped sets give each player's points and minutes. The team results are still saved one team at a time (at most 100 a call, a few indexed lookups each, and their error codes are the contract), with the snapshot document read once instead of on every use and a cheaper substitution check.

It changes no Fantasy rule, no points, no signature, no grant, no error code or message, and no table. `supabase/tests/database/fantasy_persist_scoring_equivalence.test.sql` keeps the previous body under a throwaway name and runs both on identical rows, step by step (first call with every player and a page of teams, the next page, an identical replay, a replay with different points, a newer calculation, the older one arriving late), over a gameweek of 440 player-fixtures and 120 lineups (chips, hits, captains, auto-substitutions), with and without adaptive per-row categories, plus a matrix of malformed and edge inputs; it compares every row written, every result and every error. The existing Fantasy scoring tests (worker, incremental, adaptive, reviewed estimates, staged statistics, finalization) pass unchanged.

Measured on a scratch PostgreSQL 16 (statistics gathered, three finished gameweeks behind, one call with every player and 60 teams): 440 player-fixtures took 2.0 s before and 0.55 s after (adaptive rows: 2.9 s and 0.75 s); 2,200 player-fixtures took 50 s before and 2.5 s after (adaptive rows: 72 s and 2.7 s). A call with 100 teams takes about 1 s of that. Time now grows in step with the number of rows written.

Install, after `20261013160300`: pause and drain the writers with `scripts/backend/sofascore-held-maintenance-pause.sql`, run `scripts/backend/apply-20261013180000-fast-fantasy-points-save.sql` as it is (it ends in `rollback`; the preflight refuses unless the function body is exactly the one of `20260927140000`, and the migration refuses by itself too), then change only the final `rollback` to `commit`, run it once, read `select md5(prosrc) from pg_proc where oid = 'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure` back independently (the script prints the expected value), and resume the writers. A scoring call already running keeps the old body until it ends. Afterwards, watch the duration of the next real scoring call before lowering the `service_role` statement timeout again.

## Follow-up: the stored minute on the live snapshot (`20261013190000`)

`20261013190000_football_sofascore_snapshot_minute` redefines `api.football_sofascore_live_snapshot()` with the same signature, grants and comment style, adding one key per fixture: `minute`, the stored `app.fixtures.minute` (integer or null). It is a pure read function and changes no data. Applied nowhere yet; through the reviewed migration path, after `20261011110000`. The Edge code reads the key when present and keeps its previous behaviour without it, so the migration and the deploy can go in either order. With both in place, a minute the provider stopped sending is cleared instead of left frozen, and an unchanged minute is no longer rewritten. Design: `docs/backend/SOFASCORE_LIVE_EDGE.md` ("The live minute").

## Follow-up: Fantasy points from the SofaScore rating (`20261014090000`, `20261014090100`)

Owner decision of 2026-10-13; design and risks in `docs/backend/FANTASY_RATING_POINTS.md`. From gameweek 5 a player's points for a match are his SofaScore rating rounded half up, 5 when he appeared without a rating, 0 when he did not appear; captain, chips, automatic substitutions and transfer hits are unchanged. Two new migrations, applied nowhere yet, through the reviewed migration path in this order, after `20261013180000`: `20261014090000_fantasy_rating_points` adds ruleset v3.0, the per-season switch `app_private.fantasy_rating_policy` (off), its owner-only configure function, a check on the rating carried by new observations, the rating layer of the scoring input document (every gameweek outside the rule keeps its document byte for byte) and `ratingScoring` in `api.fantasy_rules`; `20261014090100_fantasy_rating_points_save` replaces `api.service_persist_fantasy_scoring_results` (it refuses unless the body is exactly the one of `20261013180000`) so a scoring-version-3 snapshot saves one `rating` event per appearing player, recomputed and checked; v1/v2 snapshots keep their checks. Pause the Fantasy writers listed in `AGENTS.md` for the save migration, as for `20261013180000`. Then deploy `fantasy-lifecycle-worker` and `football-live-refresh` with this code, and, before the GW5 deadline, the owner runs `scripts/backend/activate-fantasy-rating-points.sql` (a rehearsal ending in `rollback`; change only that line to `commit` once it reads right). Nothing changes before that script is committed.

## Follow-up: match details stored section by section (`20261014120000`)

`20261014120000_football_match_details_partial_sections` replaces `api.ingest_football_match_details` (same signature and grants) so one bad section or row of a match-details delivery no longer refuses the whole delivery, adds three private row checks (`app_private.football_detail_*_ok`), and adds `hasLineups` per fixture to `api.football_sofascore_live_snapshot()`. It writes no match data. It is not part of `apply-sofascore-automatic.sql`: it has its own guarded script, `scripts/backend/apply-live-match-details-sections.sql` (a rehearsal ending in `rollback`; change only that line to `commit` once it reads "Rehearsal passed"), which refuses unless `20260925170000` and `20261013190000` are recorded and both functions are the reviewed versions it replaces. Then deploy `football-live-refresh` (workflow `football-live-refresh-deploy.yml`); the Edge code reads the new keys when present and works without them, so the order is safe either way, migration first preferred. Why and what changed: `docs/backend/SOFASCORE_LIVE_EDGE.md` ("Match details").

## Follow-up: second SofaScore ids and the review list's actions (`20261014170000`, `20261014170100`)

Owner review of 2026-10-14; design in `docs/backend/SOFASCORE_PLAYER_MATCHING.md` ("Second SofaScore ids", "What staff can do on the list"). `20261014170000_sofascore_catalog_aliases` adds `app_private.sofascore_player_aliases` (a catalog player's second SofaScore ids), makes the matcher, the Fantasy context and recorder and the player performances read a second id as the same player (reviewed only through its staff proof and the main link's), and adds three staff RPCs for the review list: link options, link as second ID and create the player. It replaces six functions and changes no data. The mapping table is not altered. Applied nowhere yet. Install it through `scripts/backend/apply-20261014170000-sofascore-catalog-aliases.sql`, after `20261014090100`: pause and drain the writers with `sofascore-rating-release-pause.sql`, run the script as it is (it ends in `rollback`; the preflight refuses unless the six replaced bodies are the reviewed ones), change only the final `rollback` to `commit`, run it once, and resume with `sofascore-rating-release-resume.sql`. Right after it, still paused, install `20261014170100_sofascore_alias_match_details` the same way with `scripts/backend/apply-20261014170100-sofascore-alias-match-details.sql` (it refuses unless `api.ingest_football_match_details` is the `20261014120000` version); it makes the match page's lineups and events link a second id to the same player and writes no data. Then, with the writers paused again, the owner runs `scripts/backend/attach-sofascore-verified-aliases.sql` once (dry by default) to attach the five verified pairs. Run the separate script that moves Abu Zrayq's main link to 2837528 first. No Edge Function changes. The admin screen ships with the Lovable publish.

## Follow-up: the Fantasy worker health check watches the whole backlog (`20261014180100`)

Audit finding ASTRA-02, 2026-10-14. `20261014180100_fantasy_worker_health_backlog` replaces one function, `app_private.fantasy_worker_health()`, so the `fantasy_worker` health check uses the scheduler's own definition of work (locked, live, provisional, finalizing, open past a confirmed deadline, finalized with its successor unopened or its postwork owed) instead of three of those states. It changes no data, no table and no setting, and it needs `20261013170000` and `20261013170100` first (it refuses to run without them). Applied nowhere yet and not part of the bundled release script: install it after the release through the reviewed migration path, with no other writer running. See `docs/backend/FANTASY_WORKER_SCHEDULE.md`.

## Follow-up: old rounds name their own players (`20261015120300`)

Audit finding FANT-07, 2026-10-15. `20261015120300_fantasy_points_player_identity` wraps `api.get_my_fantasy_points` once more (after `20261013160200`) so each player of a round also carries his name, position and club, read from his own `app.fantasy_players` row whether or not he is still active or eligible. That row is the player's current one, not a copy of that round: a player who transferred mid-season shows his current club in old rounds. Club history needs a snapshot taken when the lineup is saved, or the `team_memberships` row valid at the gameweek's date; neither is done. It is a read (a payload with no `players` key now has an empty list): no data, table or setting changes, and the wrapped function keeps its ownership and step-up guards. Without it the points screen still works and says that some players of an old round cannot be named. Applied nowhere yet and not part of the bundled release script: install it after the release through the reviewed migration path, with no other writer running. It needs no pause of any job.

## Follow-up: the browser error intake budget is exact and counts what it refuses (`20261015120200`)

Audit finding SEC-06, 2026-10-14. `20261015120200_client_error_intake_budget` replaces one function, `api.report_client_errors`, and adds one table, `app_private.client_error_intake`. Admitting a new kind of error now happens under a per-hour advisory lock with the count taken again inside it, so the 300-kinds-per-hour limit holds when callers arrive together (before, two calls that counted before either inserted could both pass); new kinds refused for a full hour are counted per hour in the new table, in 32 shards with an asynchronous commit (counters only, kept 30 days). The endpoint, its arguments, its return value and who may call it do not change, and no existing data is touched. No pg_cron job writes either table (`ops-alert-tick` and the watchdog only read `client_error_counts`), so nothing needs pausing for it; the writers are ordinary visitors, whom no pause stops. Applied nowhere yet and not part of the bundled release script: install it after the release through the reviewed migration path, with no other writer running. See `docs/operations/ALERTS.md` ("Browser errors").

## Follow-up: Morocco's clock in the database (`20261016090000` to `20261016090400`)

Audit finding of 2026-10-15 (confirmed by a read-only check of both databases). Both Supabase databases still carry time-zone data in which `Africa/Casablanca` is UTC+1 after 2026-09-20, while the application (and the owner, 2026-10-15) says UTC+0. `20261016090000_morocco_time_helpers` adds ten small helper functions in `app_private` that apply the application's rule, and four more migrations replace, one family each, the live functions that used the old zone: `20261016090100_morocco_time_deadline_text` (the Fantasy deadline printed in push and in-app text, an hour late), `20261016090200_morocco_time_email_planner_quiet_hours`, `20261016090300_morocco_time_pepites` and `20261016090400_morocco_time_read_models`. None has anything to do with SofaScore. They change function definitions only (no table, no column, no job, no setting, no row), are not part of the bundled release script, and are installed after it by their own five guarded scripts, in order, from `docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md`. None needs a job paused. See `docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md` for what drifted and what each migration fixes.

## Follow-up: the weekly list's bell text says Prospects / المواهب (`20261016100000`)

Audit finding LOC-09, owner decision 2026-10-15. `20261016100000_prospects_weekly_notification_text` has nothing to do with SofaScore. The in-app (bell) notification of the weekly under-23 list took its title from two template rows, `pepites_weekly` / `in_app` / `fr` and `ar`, version 1, that said "Pépites". The migration retires version 1 (kept, not deleted: stored notifications point at it) and adds version 2 with the title « Prospects : le Top 10 de la semaine {{week}} » and « المواهب: توب 10 للأسبوع {{week}} »; the bodies and everything else are unchanged. It changes two rows and inserts two in `app.notification_templates`, nothing else (no function, table, column, job, setting or privilege), is not part of the bundled release script, and is installed by its own guarded script, `scripts/backend/apply-20261016100000-prospects-weekly-notification-text.sql`. No job writes that table, so nothing needs pausing. Notifications already in readers' bells are not rewritten.

## Follow-up: a finalizing gameweek's scoring inputs are frozen (`20261016110000`)

Audit finding SEC-01 of 2026-10-16. While a gameweek is `finalizing` its scoring snapshot is sealed, and the matcher in this release (`api.service_sofascore_auto_map_players`, called by `football-live-refresh` every minute) could still create a player with his Fantasy pool entry, which changes the scoring input document and leaves the gameweek unable to complete (`fantasy_scoring_input_changed`). `20261016110000_fantasy_finalizing_scoring_inputs_guard` adds three row triggers that refuse such writes while any gameweek of the season is `finalizing` (`fantasy_scoring_inputs_frozen`): inserts, deletes and club, player or position changes on `app.fantasy_players`, the club memberships of pool players, and the deletion of a lineup of that gameweek (account erasure waits and is retried hourly), taking a short row lock on the season's current gameweek so no such write can commit after the seal. The matcher is not changed: it creates each player inside a `BEGIN ... EXCEPTION WHEN OTHERS` block, so a refusal holds that one player (counted in `createFailed`, still queued) without failing the call, and the next call creates him once the gameweek is finalized. The migration adds three functions and three triggers, replaces nothing and writes no data. It is not part of the bundled release script and is installed by its own guarded script, `scripts/backend/apply-20261016110000-fantasy-finalizing-guard.sql` (see `docs/production/FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md`), which needs the Fantasy lifecycle tick, the live refresh and the account-deletion tick paused.

## Follow-up: the pilot cap, shipped off (`20261016170000`)

Owner decision of 2026-10-16: BotolaGO launches as a pilot capped at 1,000 managers. `20261016170000_pilot_cap` has nothing to do with SofaScore. It adds `app_private.pilot_settings` (one row, switched OFF, 1,000, counting teams), the owner's switch `app_private.pilot_configure` and the count `app_private.pilot_manager_count`, and replaces `api.create_fantasy_team` with a copy of its latest definition plus a guard that, only while the cap is switched on, refuses a new team with `fantasy_pilot_full` once the season has its maximum number of managers. Applied, it changes nothing for anyone until the owner switches the cap on in a separate authorised operation. It is not part of the bundled release script and is installed by its own guarded script, `scripts/backend/apply-20261016170000-pilot-cap.sql` (see `docs/production/PILOT_CAP_OWNER_RUNBOOK.md`). No job or Edge Function creates a team, so nothing needs pausing.

## Follow-up: a change that passed the deadline check cannot land after the lock (`20261016180000`)

Audit finding SEC-01 of 2026-10-16, second gap, proven real with two sessions on PostgreSQL 16. It has nothing to do with SofaScore. A new squad (`api.create_fantasy_team`) whose call started just before a deadline could commit after the lock step had moved the gameweek to `locked`, leaving an unlocked lineup that `api.service_get_fantasy_scoring_snapshot` refuses on every pass (`fantasy_lineup_not_locked`); a chip could likewise land after the lock. `20261016180000_fantasy_deadline_mutation_lock` comes after `20261016170000` (the pilot cap) and replaces four functions: `app_private.fantasy_assert_mutable_gameweek` (now `VOLATILE`: the same unlocked check, then `FOR KEY SHARE` on the gameweek row and the check again; no lock in a read-only transaction), `api.create_fantasy_team` as the pilot cap left it (the same lock and a second look at the gameweek a squad joins), and `api.activate_fantasy_chip` / `api.cancel_fantasy_chip` (refused once the team's lineup is locked). Managers' writes now wait while the lifecycle tick holds the gameweek rows (see that runbook, "What it costs"). Same refusals, codes and deadline; no table, trigger, job, setting or privilege changes and no data is written. It is not part of the bundled release script and is installed by its own guarded script, `scripts/backend/apply-20261016180000-fantasy-deadline-lock.sql` (see `docs/production/FANTASY_DEADLINE_LOCK_OWNER_RUNBOOK.md`), which needs the Fantasy lifecycle tick paused and refuses within 30 minutes of a deadline.
