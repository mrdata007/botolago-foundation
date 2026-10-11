# SofaScore live release runbook (owner steps)

Production is `tkewgajrljbwgwedqsxn` (BotolaGO Production V2). SportsMonks is
unpaid, so production results stopped. PR 422 lets the Edge Function
`football-live-refresh` read SofaScore instead. Design and behaviour:
[`docs/backend/SOFASCORE_LIVE_EDGE.md`](../backend/SOFASCORE_LIVE_EDGE.md).

Every production write below is the owner's and covers only that step
(`CLAUDE.md`, production database writes). Nothing here is run by an agent.

## What ships

| What                                                                  | How                                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Migration `20261011090000` (switch, default `sportsmonks`)            | `scripts/backend/apply-sofascore-live-switch.sql`                                              |
| Migration `20261011100000` (`api.football_sofascore_live_snapshot()`) | same script                                                                                    |
| Edge Function `football-live-refresh`                                 | workflow `Football live refresh deploy` (`.github/workflows/football-live-refresh-deploy.yml`) |

## Before you start (AGENTS.md, one writer at a time)

1. Nothing else is writing to production: no agent, workflow or script of yours
   running against it. Check the Actions tab for runs in the
   `botolago-production-v2-mutation` group.
2. The script refuses while a pg_cron job is mid-run; if it does, run it again
   in a minute. The football live refresh has no SportsMonks key to spend, so
   its ticks do nothing useful until step (e); there is no need to pause it for
   the script.
3. Read and keep the settings before changing anything:

   ```sql
   select football_live_refresh_enabled, functions_base_url, mode
     from app_private.notification_email_settings;
   select jobname, schedule, active from cron.job
    where jobname in ('football-live-refresh', 'football-season-refresh');
   ```

## (a) Merge PR 422

Merge it to `main` (this release package is on the same PR). Merging runs
GitHub Actions; wait for them to finish. Do not publish the website for this.

## (b) Apply the migrations (rehearsal, then commit)

1. Open `scripts/backend/apply-sofascore-live-switch.sql` and run the whole
   file. As shipped it ends with `rollback;` and prints
   `Rehearsal passed. Nothing was saved.`
2. If it stops with a `stop:` message, nothing was saved. Read the message; do
   not edit a check to make it pass. A guard firing means production is not in
   the state the script assumes (already applied, a job running, a dependency
   missing).
3. Change the single `rollback;` near the bottom to `commit;` and run the whole
   file again. It prints `Applied.`
4. Confirm:

   ```sql
   select app_private.football_data_source();   -- sportsmonks
   select version from supabase_migrations.schema_migrations
    where version in ('20261011090000', '20261011100000');   -- 2 rows
   ```

The script refuses to run twice, refuses while a pg_cron job is running, and
refuses if any of the objects already exist. It does not pin the function
definitions by md5 (see "Known gap" below).

## (c) Deploy the function

Actions, `Football live refresh deploy`, Run workflow on `main`:

- `expected_commit`: the exact `main` commit you merged (full SHA);
- `confirmation`: `DEPLOY_FOOTBALL_LIVE_REFRESH`.

It runs only from `main`, only for the owner, only on the first attempt, in the
`production-admin-activation` environment (approve it), alone in the
`botolago-production-v2-mutation` group. It runs the function tests, reads
production's `schema_migrations` (one SELECT) and refuses to deploy unless both
migrations are recorded, then deploys `football-live-refresh` and nothing else.
`RAPIDAPI_KEY` is already set as an Edge Function secret; the workflow sets no
secret.

Without the workflow: `supabase functions deploy football-live-refresh
--project-ref tkewgajrljbwgwedqsxn` from the merged commit.

With the switch on `sportsmonks` the deployed function behaves as before.

## (d) Confirm the refresh gate is ON and record the settings

Both cron ticks are gated by `football_live_refresh_enabled`
(`app_private.notification_email_settings`) and need `functions_base_url`. The
switch does not change either tick.

```sql
select football_live_refresh_enabled, functions_base_url
  from app_private.notification_email_settings;
```

It must read `true` and a `.../functions/v1` URL. If it is `false`, record the
row, then turn it on with the documented command in
[`EMAIL_NOTIFICATIONS.md`](../backend/EMAIL_NOTIFICATIONS.md). Write down the
values you found, so you can restore them.

## (e) Shadow

```sql
select app_private.football_data_source_configure('shadow');
```

In `shadow` the function reads SofaScore, builds the `api.ingest_football_fixture`
calls and logs them; it writes nothing (SportsMonks is not called either). Wait
for a tick (the live tick calls the function only when a match is in play, about
to start or just finished; the season tick runs hourly regardless), then read
the Edge Function logs for `football-live-refresh` and look for the lines
`football_live_refresh_sofascore` with `"result":"shadow"`. Check:

- the calls it would make match what you see on the match day;
- unmapped events are logged, not written;
- `quotaRemaining` is healthy (the client refuses below
  `SOFASCORE_MIN_REMAINING`, default 100, and answers 429).

`scripts/backend/sofascore-live-shadow-compare.ts` compares the logs with the
database. Do not go on while the logs show errors or `database_unavailable`.

## (f) Go live

```sql
select app_private.football_data_source_configure('sofascore');
```

From the next tick the function writes through `api.ingest_football_fixture`.
Watch the next match: fixture status, score and `finalized_at` in
`app.fixtures`, and the `football_live_refresh_sofascore` lines in the logs.

### What reacts to new results

New results and finalized fixtures feed other scheduled jobs (AGENTS.md lists
them). They start working on their own once results flow, each only if it is
switched on:

- Pronostics: `predictions-score-tick` (every 5 min) scores predictions of
  finished fixtures while `app_private.prediction_settings` has a mode other
  than `off` and scoring on.
- Fantasy: `fantasy-lifecycle-tick` (every 5 min) syncs the calendar and moves
  gameweeks while `app_private.fantasy_automation_settings` has it on. Scoring
  of finished fixtures follows the Fantasy rules unchanged. Fantasy scoring
  inputs (player performances) are not produced by this path (match details are
  not read from SofaScore yet), so expect fixtures to finish without player
  data.
- Manager Card: `manager-card-tick` (every 15 min) recalculates from finished
  gameweeks while compute is on.
- Also `pepites-tick` and the notification/email results jobs, when on.

Know their state before step (f) (`select jobname, active from cron.job`, and the
settings tables above) and decide whether a first batch of results should reach
them. To hold one back, pause it with its documented command in AGENTS.md
before step (f) and restore it after.

## (g) Roll back

The switch is the rollback. `sportsmonks` is not a useful target (SportsMonks is
unpaid), so to stop writes set:

```sql
select app_private.football_data_source_configure('shadow');
```

That stops every write from the function and keeps the log lines. Rows already
written stay; correct them by hand through the normal fixture path if needed.
To stop the ticks as well, turn `football_live_refresh_enabled` off with the
command from `EMAIL_NOTIFICATIONS.md`.

To go back to the previous function code, run the deploy workflow on the earlier
`main` commit. The migrations stay (forward-only; they are inert while the
switch reads `sportsmonks`).

## Known gap: no md5 pins

The newest scripts pin function definitions by md5 measured on a database built
from the migrations. This one does not: no Docker was available where it was
written, and no value was invented. The `database-quality` CI job now prints
the md5s ("SofaScore switch function md5") and asserts the same security
properties on a freshly reset database. Copy them from a green run into the
script's postflight if you want them pinned; the script's other checks (objects,
security definer, search_path, grants, forced RLS, default source, byte-for-byte
sha256 of both files) are in place without them.
