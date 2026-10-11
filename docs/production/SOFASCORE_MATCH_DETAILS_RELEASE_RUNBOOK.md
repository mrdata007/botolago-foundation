# SofaScore match details release runbook (owner steps)

Production is `tkewgajrljbwgwedqsxn` (BotolaGO Production V2). The live scores
already come from SofaScore (`app_private.football_data_source()` reads
`sofascore`; see
[`SOFASCORE_LIVE_RELEASE_RUNBOOK.md`](SOFASCORE_LIVE_RELEASE_RUNBOOK.md)). This
release adds the match details (goals, cards, substitutions, lineups, team
statistics) to that path. Design and behaviour:
[`docs/backend/SOFASCORE_LIVE_EDGE.md`](../backend/SOFASCORE_LIVE_EDGE.md),
section "Match details".

Every production write below is the owner's and covers only that step
(`CLAUDE.md`, production database writes). Nothing here is run by an agent.

## What ships

| What                                                                                                     | How                                                 |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Migration `20261011110000` (home and away team ids on `api.football_sofascore_live_snapshot()`)          | `scripts/backend/apply-sofascore-match-details.sql` |
| Edge Function `football-live-refresh` (details after the scores; `match_details_backfill` for SofaScore) | workflow `Football live refresh deploy`             |

Optional Edge Function settings: `SOFASCORE_DETAILS_PER_TICK` (default 4, `0` =
off) and `SOFASCORE_DETAILS_BACKFILL_LIMIT` (default 4, max 10, `0` = off).
Quota: 3 requests per fixture, so up to 12 more requests per live tick and per
backfill call.

## Before you start (AGENTS.md, one writer at a time)

1. Nothing else is writing to production. Check the Actions tab for runs in the
   `botolago-production-v2-mutation` group.
2. The script refuses while a pg_cron job is mid-run; if it does, run it again
   in a minute.
3. The script's postflight pins the new function definition by md5. Before you
   run it, `FILL_FROM_CI_SNAPSHOT_TEAMS_MD5` in the script must have been
   replaced by the value the green `database-quality` run prints ("SofaScore
   snapshot teams md5"). While the placeholder is there the script stops at the
   end and saves nothing; do not edit the check to get past it.

## (a) Merge

Merge the PR to `main` and wait for the Actions to finish. Do not publish the
website for this.

## (b) Apply the migration (rehearsal, then commit)

1. Open `scripts/backend/apply-sofascore-match-details.sql` and run the whole
   file. As shipped it ends with `rollback;` and prints
   `Rehearsal passed. Nothing was saved.`
2. If it stops with a `stop:` message, nothing was saved. Read it; a guard
   firing means production is not in the state the script assumes (already
   applied, the two earlier migrations missing, a job running, the snapshot
   function not the reviewed one).
3. Change the single `rollback;` near the bottom to `commit;` and run the whole
   file again. It prints `Applied.`
4. Confirm:

   ```sql
   select version from supabase_migrations.schema_migrations
    where version = '20261011110000';                         -- 1 row
   select jsonb_object_keys(api.football_sofascore_live_snapshot() -> 'fixtures' -> 0);
   -- the list includes homeTeamId and awayTeamId (run as the service role)
   ```

The migration is inert on its own: the keys it adds are ignored by the code
that is deployed now.

## (c) Deploy the function

Production is already on `sofascore`, so the new function code goes live the
moment it is deployed: from the next tick it fetches details for up to 4 fixtures
(12 requests) and writes them. To check it before it writes, switch to `shadow`
first:

```sql
select app_private.football_data_source_configure('shadow');
```

Actions, `Football live refresh deploy`, Run workflow on `main`:

- `expected_commit`: the exact `main` commit you merged (full SHA);
- `confirmation`: `DEPLOY_FOOTBALL_LIVE_REFRESH`.

(Approve the `production-admin-activation` environment. It deploys only this
function and sets no secret; `RAPIDAPI_KEY` is already set.)

## (d) Shadow check, then back to sofascore

In `shadow` the function reads the three SofaScore replies for the fixtures it
would fetch, logs one `shadow_match_details` line each (event, lineup and
statistic counts, and the payload) and writes nothing. Wait for a live tick (the
live tick calls the function when a match is in play, about to start or just
finished), then read the Edge Function logs for `football-live-refresh`. Check:

- lines with `"result":"shadow_match_details"` and `"written":0`;
- goals match the real score, cards and substitutions are on the right side,
  both lineups have 11 starters;
- no `errors` other than expected, `rateLimited` false, `quotaRemaining` healthy
  (the client refuses below `SOFASCORE_MIN_REMAINING`, default 100);
- never more than 4 fixtures (12 detail requests) in one tick.

If a tick shows nothing to fetch, no fixture changed that tick; the backfill
check in (e) can be rehearsed in `shadow` too (it fetches and logs, no write).

Then go back:

```sql
select app_private.football_data_source_configure('sofascore');
```

## (e) Backfill the matches already played

`match_details_backfill` fetches finished matches of the current season, mapped
to SofaScore, with no details stored: up to 4 per call (3 requests each), most
recent first. A match stored once, or refused twice by the backfill, is not asked
for again. Invoke it from the SQL Editor (same pattern as
[`APPLY_2026_09_25_MATCH_DETAILS.md`](APPLY_2026_09_25_MATCH_DETAILS.md), step 4):

```sql
select app_private.invoke_scheduled_function(
  (select functions_base_url from app_private.notification_email_settings where id),
  'football-live-refresh',
  '{"job":"match_details_backfill"}'::jsonb
) as request_id;
```

Wait 30 seconds, then read the answer (use the `request_id` from above):

```sql
select status_code,
       content::jsonb -> 'due' as due,
       content::jsonb -> 'matchDetails' as details
from net._http_response where id = <request_id>;
```

Expect `status_code` 200 and `details.stored` equal to `due`. `unresolvedTeams`
should be 0. Run it again until `due` is 0. A 429 means the quota floor was
reached: stop and wait. Do not run it at the same time as a live match tick on
a day with many matches if quota is short; it shares the same RapidAPI quota.

Backfilled matches may show unmapped players by name only; that is expected
(SofaScore player mappings are not created by this release).

## (f) Check

Open a finished match page: Résumé lists the goals and cards, Stats the shots,
shots on target and saves, Compos both lineups. Or in SQL:

```sql
select count(*) from app_private.football_match_details_syncs;   -- grows with each backfill
```

## (g) Roll back

- Stop the details only: set `SOFASCORE_DETAILS_PER_TICK=0` and
  `SOFASCORE_DETAILS_BACKFILL_LIMIT=0` as Edge Function secrets, or set the
  source to `shadow` (scores stop too, logs stay).
- Previous code: run the deploy workflow on the earlier `main` commit. The
  migration stays (forward-only; the extra keys are ignored by the older code).
- Rows already written stay. One caveat: a match whose details were stored by
  SportsMonks and are then fetched from SofaScore shows both sets of events. The
  backfill skips such matches.
