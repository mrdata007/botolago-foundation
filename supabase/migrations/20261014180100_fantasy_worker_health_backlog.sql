-- Fantasy worker health check: watch the same backlog the scheduler acts on
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
