# Phase A and B migrations: owner runbook

Target: BotolaGO Production V2, project `tkewgajrljbwgwedqsxn`, Supabase SQL editor.
Written 2026-10-15. Nothing in this document has been run against any shared or
production database; see "What was and was not run" at the end.

Three repository migrations from the audit remediation are not on production.
You run each one with its own guarded, rehearsal-first script, the same way as
`apply-20260926003400-ops-health-fantasy-coverage.sql` and
`apply-20261014170000-sofascore-catalog-aliases.sql`.

| Order | Migration                                       | Audit    | Script (in `scripts/backend/`)                            | What it changes                                                                                                                        |
| ----- | ----------------------------------------------- | -------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `20261014180100_fantasy_worker_health_backlog`  | ASTRA-02 | `apply-20261014180100-fantasy-worker-health-backlog.sql`  | Replaces one function, `app_private.fantasy_worker_health()`: the `fantasy_worker` health check watches the scheduler's whole backlog. |
| 2     | `20261015120200_client_error_intake_budget`     | SEC-06   | `apply-20261015120200-client-error-intake-budget.sql`     | Replaces `api.report_client_errors` and adds the empty table `app_private.client_error_intake`.                                        |
| 3     | `20261015120300_fantasy_points_player_identity` | FANT-07  | `apply-20261015120300-fantasy-points-player-identity.sql` | Wraps `api.get_my_fantasy_points` once more so old rounds name every player. A read; no data changes.                                  |

The three do not depend on each other. Use the order above (the order of their
timestamps) and finish one completely, including its post-checks, before you
open the next. Never run two of them, or one of them and anything else that
changes the database, at the same time (`AGENTS.md`, "One writer at a time").

## Before you start

The three scripts need the SofaScore rating release
(`apply-20261014-sofascore-rating-release.sql`) to be **committed**. It carries
`20261013160200`, `20261013170000` and `20261013170100`, which scripts 1 and 3
build on. Script 2 needs only `20260924200200`, which production has had for a
long time. Whether the release's jobs have been switched back on
(`sofascore-rating-release-resume.sql`) does not matter to these scripts.

**None of the three needs a job paused.** None writes a table that a job writes
(script 2 creates a table that nothing writes yet). Do not run the SofaScore
pause scripts for them. Each script says so in its header and checks the claim
that can be checked (script 2 stops if any other function or cron job writes the
error tables).

Read-only checks, any time, in the SQL editor:

```sql
-- 1. What is recorded. Expect the first four rows, and none of the last three.
select version, name from supabase_migrations.schema_migrations
where version in ('20260924200200', '20261013160200', '20261013170000', '20261013170100',
                  '20261014180100', '20261015120200', '20261015120300')
order by version;

-- 2. The functions the scripts replace are the reviewed ones (md5 of their source).
--    Expect b9ea0ed957008a24dc6b3bdfcc8f6e58, bb281eafb252da7770f92b7f72d83c97
--    and b5cfcb2f2484ced5b9d18894fffe0ae4.
select 'fantasy_worker_health' as fn, md5(prosrc) from pg_proc
  where oid = to_regprocedure('app_private.fantasy_worker_health()')
union all select 'report_client_errors', md5(prosrc) from pg_proc
  where oid = to_regprocedure('api.report_client_errors(jsonb)')
union all select 'get_my_fantasy_points', md5(prosrc) from pg_proc
  where oid = to_regprocedure('api.get_my_fantasy_points(uuid,uuid)');

-- 3. Not done yet: expect true, true.
select to_regclass('app_private.client_error_intake') is null as intake_table_absent,
       to_regprocedure('api.get_my_fantasy_points_before_identity(uuid,uuid)') is null as rename_not_done;

-- 4. Is anything else writing? Expect only your own session.
select pid, usename, state, left(query, 80) as query from pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle'
  and backend_type = 'client backend';

-- 5. The jobs (nothing to pause, but know what is there).
select jobname, schedule, active from cron.job order by jobname;

-- 6. Script 1 only. When the database worker is off the check answers ok whatever
--    the gameweeks do, before and after. When it is on, read the current answer.
select app_private.fantasy_worker_enabled() as worker_on, app_private.fantasy_worker_health() as answer;
```

If query 1 or 2 shows anything different, stop and send the result; the scripts
will refuse for the same reason, and that refusal is the point.

## For each script

1. Supabase dashboard, project **BotolaGO Production V2**; check the address
   contains `tkewgajrljbwgwedqsxn` (the database holds no project name a script
   could check, so this check is yours). SQL Editor, New query.
2. Paste the whole file and press Run. As shipped it is a **rehearsal**: it
   applies the migration inside one transaction, checks the result, and rolls
   back. The result row must say `Rehearsal passed`. Any `stop:` message means
   nothing was saved; send it, do not edit a check.
3. Change the single line `rollback;` near the bottom to `commit;` and press Run
   once. The result row says `Applied`.
4. Run the post-checks below, then go to the next script.

A rehearsal is not free of effect: it takes locks for a moment (the scripts set a
5 second lock timeout and a 60 second statement timeout, and give up rather than
wait). It saves nothing.

### Script 1: `fantasy_worker` health check

Expect in the rehearsal: the NOTICE lines `before:` and `after:` (if your editor
shows notices) and, in the result row, the answer of the current check. If the
database worker is switched on and a round is locked, overdue-open or
finalized-with-work-owed with no `ok` worker pass for 30 minutes (warn) or 90
minutes (fail), the new check says so, and alerts page on `fail`. That is the
check doing its job. Decide before you commit.

Post-checks:

```sql
select version, name from supabase_migrations.schema_migrations where version = '20261014180100';
select md5(prosrc) from pg_proc where oid = 'app_private.fantasy_worker_health()'::regprocedure;
-- expect 6ac9c102176250cf4e47d4691301ce47
select app_private.fantasy_worker_health();   -- ok, warn or fail with a detail
select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
where c ->> 'name' = 'fantasy_worker';          -- listed once
```

### Script 2: browser error intake budget

Anyone can call this endpoint, so no pause could stop its writers; replacing it
while visitors report errors is safe (a call already running finishes on the old
text). The rehearsal does not call the endpoint (a call would store a report).

Post-checks:

```sql
select version, name from supabase_migrations.schema_migrations where version = '20261015120200';
select md5(prosrc) from pg_proc where oid = 'api.report_client_errors(jsonb)'::regprocedure;
-- expect f0a2be65778843fc5de00e996b56cd8c
select has_function_privilege('anon', 'api.report_client_errors(jsonb)', 'execute') as anon,
       has_function_privilege('authenticated', 'api.report_client_errors(jsonb)', 'execute') as authenticated;
-- expect true, true (unchanged)
select relrowsecurity, relforcerowsecurity from pg_class
where oid = 'app_private.client_error_intake'::regclass;           -- expect true, true
-- Later, after a busy hour: never more than 300 kinds, and what was refused is counted.
select bucket_hour, count(*) as kinds from app_private.client_error_counts
group by 1 order by 1 desc limit 3;
select bucket_hour, sum(dropped_new_kinds) as refused_new_kinds from app_private.client_error_intake
group by 1 order by 1 desc limit 3;
```

### Script 3: points screen identity

Run it **once**: the migration renames the current function, so a second run
would find the renamed one and the script refuses (and so would the migration).
If it refuses and you do not know why, send the message; do not run the
migration file by hand.

Post-checks:

```sql
select version, name from supabase_migrations.schema_migrations where version = '20261015120300';
select md5(prosrc) from pg_proc where oid = 'api.get_my_fantasy_points(uuid,uuid)'::regprocedure;
-- expect d55a006a09592712e19a8442d65384dc
select md5(prosrc) from pg_proc
where oid = 'api.get_my_fantasy_points_before_identity(uuid,uuid)'::regprocedure;
-- expect b5cfcb2f2484ced5b9d18894fffe0ae4 (the wrapper that was current before)
select has_function_privilege('anon', 'api.get_my_fantasy_points(uuid,uuid)', 'execute') as anon,
       has_function_privilege('authenticated', 'api.get_my_fantasy_points(uuid,uuid)', 'execute') as authenticated;
-- expect false, true
```

Then, signed in with a real manager account (and its sign-in step-up), open a
past round on the points screen: every player of that round should now have a
name, including one who has left the buying pool. The club shown is the player's
**current** club, not the club at that round (a transferred player's old round
shows the new club). That limit is in the migration and the audit record; it is
not a fault of the script.

## Rolling back

The repository is forward-only: never edit a migration that has been applied
anywhere, and do not delete a history row by hand. The rehearsal is the
rollback you have; it saves nothing. After a commit, a problem is fixed with a
new migration (for example one that restores the previous function text, which is
in `20261013170100`, `20260924200200` and `20261013160200` respectively), reviewed
and applied the same way. Script 2's new table can stay empty and unused.

## How this relates to the batch promoter

`scripts/backend/phase7e-production-migration-promoter.py` (the
"Phase 7E-B Production V2 migration promotion" workflow) cannot apply these
migrations, and it was not changed. Its manifest lists 63 migrations, the last
being `20260919120000_historical_anonymous_starter_tolerance.sql`, and it stops
before writing anything unless the repository's migration directory is exactly
that list (it holds 230 files today) and the remote history is an exact prefix
of the batch it is asked to run. That is by design: it promotes reviewed
batches, not the chain after them.

The apply scripts record each migration the way the promoter and the other apply
scripts do: one `supabase_migrations.schema_migrations` row with the file whole as
`statements[1]`, and the sha256 of that text checked against the repository file
before it runs. So the history stays canonical, and a future tool that reads it
sees the same shape as for every other migration here.

The release runbook (`docs/production/SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md`)
already lists the three migrations in its follow-up sections and says each is
"applied nowhere yet"; this document is how you apply them.

## What was and was not run

- Each script was rehearsed and then committed on a throwaway **local**
  PostgreSQL 16 (unix socket only, never a network database), against stub
  schemas that hold the real function text cut from the repository migrations
  and minimal stand-in tables, roles and a stand-in `cron.job`. The stubs are
  not production; they prove the script's own logic, not production's state.
- On that local server: the rehearsal of each script ends in rollback and saves
  nothing; the committed run records the history row; a second run refuses; 29
  deliberately broken starting states are each refused with the right message; each
  script edited by one character is refused by its sha256 check. The new health
  check was exercised on every backlog state (it agrees with the scheduler's
  `fantasy_worker_work_pending()` except for an open round past an unconfirmed
  deadline, which the worker leaves alone). Under 40 concurrent clients the old
  error endpoint stored 630 kinds in an hour and the new one exactly 300, with
  11,700 refused kinds counted and no failed calls. The new points function
  returned `identity` for a retired player.
- Not run: anything on Supabase or production, the real pg_cron, pg_net and
  Vault, the real pgTAP database tests (CI's `database-quality` job is the
  authority), and any browser or signed-in check of the points screen.
