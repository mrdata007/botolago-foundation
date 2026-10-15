-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261014180100_fantasy_worker_health_backlog
-- (audit finding ASTRA-02, 2026-10-14; docs/backend/FANTASY_WORKER_SCHEDULE.md):
--   the `fantasy_worker` health check watches every kind of gameweek the
--   scheduler wakes the Fantasy worker for (locked, live, provisional,
--   finalizing, open past a confirmed deadline, finalized with its successor
--   unopened or its postwork owed), not only three of them (live, provisional,
--   finalizing). A worker that is broken while a round sits locked, overdue-open
--   or finalized-with-work-owed no longer reads `ok`.
--   It replaces ONE function, app_private.fantasy_worker_health(), and creates
--   nothing. Same signature, return shape and privileges (owner only), so the
--   wrapper in app_private.ops_health_checks() keeps working. The thresholds
--   (30 and 90 minutes, or twice and four times a longer pass interval) are
--   not changed. It writes no table: not a setting, not a Fantasy or football
--   row, not the alert switch.
--
-- WHEN
--   Only after scripts/backend/apply-20261014-sofascore-rating-release.sql has
--   been COMMITTED: that release carries 20261013170000 (the worker's
--   schedule, its dispatch table, run log and work_pending function) and
--   20261013170100 (the OLD health function this one replaces). This script
--   refuses before it: it needs both history rows, the old function byte for
--   byte, and the tables and columns the new predicate reads. It does not
--   depend on the other two Phase A/B scripts (client error intake budget,
--   Fantasy points player identity) nor on 20261014120000..20261014170100;
--   apply the three in the order of their timestamps (this one first).
--   Any time of day; it needs well under a second.
--
--   What changes for the alerts. When the database worker is switched off
--   (`select app_private.fantasy_worker_enabled();` returns false, how it ships)
--   the check answers ok whatever the gameweeks do, before and after. When it
--   is switched on, the check can now warn (30 min) or fail (90 min) in
--   states it used to ignore, if no ok worker pass has happened for that long
--   while a round has work for the worker. Alerts page on `fail`, hourly
--   while it lasts (docs/operations/ALERTS.md). That is the check doing its
--   job, not a fault of this update. The rehearsal prints what the new check
--   says right now as a NOTICE (and the answer of the current one in the
--   result row): read it before you commit.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing, because this script writes no table at all: its
--   only change is to the definition of one function in the system catalog.
--   The jobs that CALL the function (ops-alert-tick through
--   app_private.ops_health_checks(), and the GitHub watchdog through
--   api.service_ops_health()) only read; they see the new definition on their
--   next call. No cron job, the Fantasy tick, the Fantasy worker tick
--   (fantasy-worker-tick) or the football refresh writes pg_proc. Still make
--   sure that no other schema change (another apply script, a migration, a
--   deploy) is running right now: a rehearsal that ends in rollback takes
--   locks too. The script compares the Fantasy switches and the cron job list
--   before and after and stops if they moved.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address
--      contains tkewgajrljbwgwedqsxn; the database holds no project name this
--      script could check, so look at the address) -> SQL Editor -> New query.
--      Optional read-only pre-checks: docs/production/PHASE_A_B_MIGRATIONS_OWNER_RUNBOOK.md.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied" and show what the check says.
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20261013170000 and 20261013170100 are both
--     recorded, on a database missing a table, column or function the new
--     predicate reads, where the old health function is not the one
--     20261013170100 installs (md5 of its source, owner-only privileges,
--     stable, security definer, empty search_path), where the scheduler's own
--     predicate (fantasy_worker_work_pending, which the new one copies) is not
--     the text of 20261013170000, or where app_private.ops_health_checks() no
--     longer lists the check;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1] (the form the migration promoter and the other
--     apply scripts use), and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without writing anything: the new source is the one in
--     the file; the grants are unchanged (owner only); the check answers with
--     a well formed ok/warn/fail; app_private.ops_health_checks() lists the
--     same checks as before; the Fantasy switches and the cron job list are
--     where they were; the history row is there. It never calls
--     ops_alert_tick(), so it sends nothing.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  absent text;
  fn record;
  leaked boolean;
  names text;
  -- md5 of the source of the OLD fantasy_worker_health (20261013170100, the
  -- text between its $$ marks) and of fantasy_worker_work_pending
  -- (20261013170000). The tests recompute both from the repository files.
  old_health_md5 constant text := 'b9ea0ed957008a24dc6b3bdfcc8f6e58';
  work_pending_md5 constant text := '9100a14290823dddcdb5db32506ad36c';
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261014180100') then
    raise exception 'stop: migration 20261014180100 is already recorded as applied';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
        where version in ('20261013170000', '20261013170100')) <> 2 then
    raise exception 'stop: 20261013170000 and 20261013170100 are not both applied -- run scripts/backend/apply-20261014-sofascore-rating-release.sql (committed) first';
  end if;

  -- Tables and columns the new predicate and the rest of the function read.
  select string_agg(v.rel || '.' || v.col, ', ' order by v.rel, v.col) into absent
  from (values
    ('app.fantasy_seasons', 'id'), ('app.fantasy_seasons', 'status'),
    ('app.fantasy_gameweeks', 'id'), ('app.fantasy_gameweeks', 'fantasy_season_id'),
    ('app.fantasy_gameweeks', 'sequence_number'), ('app.fantasy_gameweeks', 'status'),
    ('app.fantasy_gameweeks', 'deadline_at'), ('app.fantasy_gameweeks', 'closed_at'),
    ('app.fantasy_gameweeks', 'scoring_input_version'),
    ('app.fantasy_fixture_assignments', 'gameweek_id'), ('app.fantasy_fixture_assignments', 'fixture_id'),
    ('app.fantasy_fixture_assignments', 'superseded_at'), ('app.fantasy_fixture_assignments', 'counts_points'),
    ('app.fixtures', 'id'), ('app.fixtures', 'kickoff_at'),
    ('app_private.fantasy_gameweek_progressions', 'previous_gameweek_id'),
    ('app_private.fantasy_gameweek_progressions', 'opened_at'),
    ('app_private.fantasy_gameweek_postwork', 'gameweek_id'),
    ('app_private.fantasy_gameweek_postwork', 'calculation_version'),
    ('app_private.fantasy_gameweek_postwork', 'completed_at'),
    ('app_private.fantasy_worker_dispatch', 'id'), ('app_private.fantasy_worker_dispatch', 'counting_from'),
    ('app_private.fantasy_worker_dispatch', 'pending_since'), ('app_private.fantasy_worker_dispatch', 'last_outcome'),
    ('app_private.fantasy_worker_runs', 'outcome'), ('app_private.fantasy_worker_runs', 'worker_code'),
    ('app_private.fantasy_worker_runs', 'finished_at'),
    ('app_private.fantasy_automation_settings', 'id'),
    ('app_private.fantasy_automation_settings', 'lifecycle_worker_interval_minutes')
  ) v(rel, col)
  where not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass(v.rel) and a.attname = v.col and a.attnum > 0 and not a.attisdropped);
  if absent is not null then
    raise exception 'stop: the database is missing what the new health predicate reads: %', absent;
  end if;

  select string_agg(v.sig, ', ' order by v.sig) into absent
  from (values
    ('app_private.fantasy_worker_health()'), ('app_private.fantasy_worker_work_pending()'),
    ('app_private.fantasy_worker_enabled()'), ('app_private.fantasy_kickoff_confirmed(timestamp with time zone)'),
    ('app_private.ops_health_checks()')
  ) v(sig)
  where to_regprocedure(v.sig) is null;
  if absent is not null then
    raise exception 'stop: the database is missing functions this update needs: %', absent;
  end if;

  -- The old health function must be exactly what 20261013170100 installs.
  select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.prorettype::regtype::text as rettype,
         l.lanname, p.proacl
    into fn
  from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
  where p.oid = 'app_private.fantasy_worker_health()'::regprocedure;
  if md5(fn.prosrc) <> old_health_md5 then
    raise exception 'stop: app_private.fantasy_worker_health() is not the version this update replaces (20261013170100)';
  end if;
  if not fn.prosecdef or fn.provolatile <> 's' or fn.rettype <> 'jsonb' or fn.lanname <> 'plpgsql'
    or fn.proconfig is distinct from array['search_path=""'] then
    raise exception 'stop: app_private.fantasy_worker_health() has attributes other than the reviewed ones (security definer, stable, plpgsql, jsonb, empty search_path)';
  end if;
  select exists (
    select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', (
        select proowner from pg_catalog.pg_proc where oid = 'app_private.fantasy_worker_health()'::regprocedure)))) a
    where a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles
      where rolname in ('anon', 'authenticated', 'service_role'))) into leaked;
  if leaked then
    raise exception 'stop: app_private.fantasy_worker_health() is executable by PUBLIC, anon, authenticated or service_role';
  end if;

  -- The scheduler's own predicate, which the new one copies, is still the text
  -- the migration was written against.
  if md5((select prosrc from pg_catalog.pg_proc where oid = 'app_private.fantasy_worker_work_pending()'::regprocedure))
    <> work_pending_md5 then
    raise exception 'stop: app_private.fantasy_worker_work_pending() is not the version the new health predicate was copied from (20261013170000)';
  end if;

  -- The wrapper must list the check (else replacing it changes nothing anyone sees).
  if position('app_private.fantasy_worker_health()' in
      pg_catalog.pg_get_functiondef('app_private.ops_health_checks()'::regprocedure)) = 0 then
    raise exception 'stop: app_private.ops_health_checks() no longer calls app_private.fantasy_worker_health()';
  end if;

  -- Baseline: the checks listed today, the Fantasy switches and the job list.
  select string_agg(c ->> 'name', ',' order by c ->> 'name') into names
  from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c;
  perform set_config('bg.health_checks_before', coalesce(names, ''), true);
  perform set_config('bg.fantasy_switches_before',
    md5(coalesce((select s::text from app_private.fantasy_automation_settings s where s.id), '')), true);
  perform set_config('bg.cron_jobs_before',
    (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
     from cron.job j), true);
  raise notice 'before: %', (select (c ->> 'status') || ': ' || (c ->> 'detail')
    from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c where c ->> 'name' = 'fantasy_worker');
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261014180100, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261014180100',
  'fantasy_worker_health_backlog',
  array[$bg_20261014180100_file$-- Fantasy worker health check: watch the same backlog the scheduler acts on
-- (audit finding ASTRA-02, docs/backend/FANTASY_WORKER_SCHEDULE.md).
--
-- WHAT WAS WRONG. `app_private.fantasy_worker_work_pending()` (20261013170000)
-- wakes the Edge worker for six kinds of gameweek: locked, live, provisional,
-- finalizing, open past its deadline, and finalized with its successor unopened
-- or its postwork owed. The health check `fantasy_worker`
-- (`app_private.fantasy_worker_health()`, 20261013170100) only looked at three of
-- them (live, provisional, finalizing). A worker that was broken while a round
-- sat locked, overdue-open or finalized-with-work-owed therefore read `ok`.
--
-- WHAT THIS CHANGES. Only the predicate that picks the gameweek the check talks
-- about: it is now the scheduler's own definition, copied from
-- `fantasy_worker_work_pending()` with one exception that the worker shares:
-- an `open` gameweek past its deadline whose deadline is unconfirmed (a counting
-- fixture still has a placeholder kickoff) is left alone by the worker
-- (`deadline_unconfirmed`, selectWorkerTargets) and so is not held against it
-- here. Unchanged: the switched-off exception, the thresholds (30 and 90 minutes,
-- or twice and four times a longer interval; none is relaxed), the clock that
-- starts at the latest of the last ok pass, the switch-on instant and the instant
-- the work appeared, and which passes count (only `ok`). Changed in the detail
-- text, because the check now talks about more states: the idle message reads
-- "no gameweek has work for the worker" (was "no gameweek is live, provisional or
-- finalizing"), and an open or finalized round is named "open past its deadline" /
-- "finalized with work still owed" where a live, provisional, finalizing or
-- locked one still shows its status.
--
-- The latest definition before this one is 20261013170100 (no later migration
-- redefines the function); the signature, the return shape and the privileges
-- are the same, so `create or replace` keeps the wrapper in
-- `ops_health_checks()` working.
--
-- NOT RUN against any database in the authoring session (no Docker, one writer at
-- a time): CI's database-quality job is the authority. The test is
-- supabase/tests/database/fantasy_worker_health_backlog.test.sql.

do $$
begin
  if to_regprocedure('app_private.fantasy_worker_health()') is null
    or to_regprocedure('app_private.fantasy_worker_work_pending()') is null
    or to_regprocedure('app_private.fantasy_kickoff_confirmed(timestamp with time zone)') is null then
    raise exception 'fantasy_worker_health_prerequisite_missing: apply 20261013170000 and 20261013170100 first';
  end if;
end $$;

create or replace function app_private.fantasy_worker_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_enabled boolean := app_private.fantasy_worker_enabled();
  v_active record;
  v_beat app_private.fantasy_worker_dispatch%rowtype;
  v_last_ok timestamptz;
  v_last record;
  v_since timestamptz;
  v_minutes numeric;
  v_interval integer;
  v_status text := 'ok';
  v_detail text;
begin
  if not v_enabled then
    return jsonb_build_object('name', 'fantasy_worker', 'status', 'ok',
      'detail', 'the database lifecycle worker is switched off; the GitHub orchestrator schedules the lifecycle');
  end if;
  -- The scheduler's backlog (fantasy_worker_work_pending), minus a round the
  -- worker deliberately leaves alone: open past a deadline that is unconfirmed.
  select g.sequence_number as sequence,
         case
           when g.status = 'open' then 'open past its deadline'
           when g.status = 'finalized' then 'finalized with work still owed'
           else g.status::text
         end as label
    into v_active
    from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id
   where s.status in ('registration_open', 'active')
     and (
       g.status in ('locked', 'live', 'provisional', 'finalizing')
       or (g.status = 'open' and g.deadline_at <= statement_timestamp()
         and not exists (
           select 1
           from app.fantasy_fixture_assignments a
           join app.fixtures f on f.id = a.fixture_id
           where a.gameweek_id = g.id and a.superseded_at is null and a.counts_points
             and not app_private.fantasy_kickoff_confirmed(f.kickoff_at)))
       or (g.status = 'finalized' and (
         -- the successor is staged but not opened
         (exists (select 1 from app.fantasy_gameweeks nx
             where nx.fantasy_season_id = g.fantasy_season_id
               and nx.sequence_number = g.sequence_number + 1)
           and not exists (select 1 from app_private.fantasy_gameweek_progressions pr
             where pr.previous_gameweek_id = g.id and pr.opened_at is not null))
         -- or it closed early and its postwork is still owed
         or (g.closed_at is not null and not exists (
             select 1 from app_private.fantasy_gameweek_postwork w
             where w.gameweek_id = g.id and w.calculation_version = g.scoring_input_version
               and w.completed_at is not null))
       ))
     )
   order by g.sequence_number limit 1;
  select * into v_beat from app_private.fantasy_worker_dispatch where id;
  select lifecycle_worker_interval_minutes into v_interval from app_private.fantasy_automation_settings where id;
  select max(finished_at) into v_last_ok from app_private.fantasy_worker_runs where outcome = 'ok';
  select r.outcome, r.worker_code, r.finished_at into v_last
    from app_private.fantasy_worker_runs r order by r.finished_at desc limit 1;
  v_since := greatest(v_last_ok, v_beat.counting_from, v_beat.pending_since);
  v_minutes := extract(epoch from statement_timestamp() - v_since) / 60;
  if v_active.sequence is null then
    v_detail := 'no gameweek has work for the worker';
  elsif v_since is null or v_minutes < greatest(30, 2 * v_interval) then
    v_detail := 'GW' || v_active.sequence || ' ' || v_active.label || '; last ok pass '
      || coalesce(to_char(v_last_ok at time zone 'UTC', 'HH24:MI') || ' UTC', 'none yet');
  else
    v_status := case when v_minutes >= greatest(90, 4 * v_interval) then 'fail' else 'warn' end;
    v_detail := 'no ok pass for ' || round(v_minutes)::integer || ' min while GW' || v_active.sequence
      || ' is ' || v_active.label || '; last pass '
      || coalesce(v_last.outcome || coalesce(' (' || v_last.worker_code || ')', '')
           || ' at ' || to_char(v_last.finished_at at time zone 'UTC', 'HH24:MI') || ' UTC', 'none')
      || '; tick answered ' || v_beat.last_outcome;
  end if;
  return jsonb_build_object('name', 'fantasy_worker', 'status', v_status, 'detail', v_detail);
end $$;
revoke all on function app_private.fantasy_worker_health() from public, anon, authenticated, service_role;
comment on function app_private.fantasy_worker_health() is
  'Health check fantasy_worker: warn at 30 minutes and fail at 90 minutes without an ok pass of the database lifecycle worker while a gameweek has work for it (the scheduler''s backlog: locked, live, provisional, finalizing, open past a confirmed deadline, finalized with its successor unopened or its postwork owed). Ok while the worker is switched off.';
$bg_20261014180100_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261014180100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261014180100'
  );
begin
  if encode(sha256(convert_to(part_20261014180100, 'UTF8')), 'hex')
    is distinct from '0807d8ab5f057598cf398c40d20b4be65e16901cbb332eaea289c5309c555372' then
    raise exception 'stop: 20261014180100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261014180100;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn record;
  leaked boolean;
  answer jsonb;
  names text;
  new_health_md5 constant text := '6ac9c102176250cf4e47d4691301ce47';
begin
  select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.prorettype::regtype::text as rettype,
         l.lanname, p.proacl, p.proowner, obj_description(p.oid, 'pg_proc') as comment
    into fn
  from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
  where p.oid = 'app_private.fantasy_worker_health()'::regprocedure;

  -- The function is the migration's, with the attributes it had.
  if md5(fn.prosrc) <> new_health_md5 then
    problems := problems || 'the health function is not the new source'::text;
  end if;
  if not fn.prosecdef or fn.provolatile <> 's' or fn.rettype <> 'jsonb' or fn.lanname <> 'plpgsql'
    or fn.proconfig is distinct from array['search_path=""'] then
    problems := problems || 'the health function changed its attributes'::text;
  end if;
  if fn.comment is null or position('finalized with its successor unopened or its postwork owed' in fn.comment) = 0 then
    problems := problems || 'the health function comment was not updated'::text;
  end if;

  -- Grants: still the database owner's only.
  select exists (
    select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a
    where a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles
      where rolname in ('anon', 'authenticated', 'service_role'))) into leaked;
  if leaked then
    problems := problems || 'the health function became executable by PUBLIC, anon, authenticated or service_role'::text;
  end if;

  -- The check answers, well formed.
  answer := app_private.fantasy_worker_health();
  if answer ->> 'name' is distinct from 'fantasy_worker'
    or answer ->> 'status' is null or answer ->> 'status' not in ('ok', 'warn', 'fail')
    or coalesce(answer ->> 'detail', '') = '' then
    problems := problems || 'the check does not answer ok, warn or fail with a detail'::text;
  end if;

  -- The wrapper lists the same checks as before, the new answer among them.
  select string_agg(c ->> 'name', ',' order by c ->> 'name') into names
  from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c;
  if names is distinct from current_setting('bg.health_checks_before', true) then
    problems := problems || 'the list of health checks changed'::text;
  end if;
  if (select count(*) from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
        where c ->> 'name' = 'fantasy_worker') <> 1 then
    problems := problems || 'fantasy_worker is not listed exactly once'::text;
  end if;

  -- Nothing but the function moved: Fantasy switches, job list.
  if md5(coalesce((select s::text from app_private.fantasy_automation_settings s where s.id), ''))
    is distinct from current_setting('bg.fantasy_switches_before', true) then
    problems := problems || 'the Fantasy switches moved'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.cron_jobs_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261014180100') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'after: %: %', answer ->> 'status', answer ->> 'detail';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261014180100')
    then 'Applied. The fantasy_worker health check now watches the scheduler''s whole backlog and says: '
      || (app_private.fantasy_worker_health() ->> 'status') || ': ' || (app_private.fantasy_worker_health() ->> 'detail')
  else 'Rehearsal passed. Nothing was saved. The check as it stands now (old definition) says: '
      || (app_private.fantasy_worker_health() ->> 'status') || ': ' || (app_private.fantasy_worker_health() ->> 'detail')
      || ' -- the new answer was printed as a NOTICE (after:). Change rollback; to commit; and run again.'
end as result;
