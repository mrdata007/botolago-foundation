-- Fantasy lifecycle worker on a schedule we control (docs/backend/FANTASY_WORKER_SCHEDULE.md), part 2:
-- one health check, added through a wrapper like the earlier ones.
--
-- fantasy_worker (reads state, writes nothing):
--   * ok    the database worker is switched off (the GitHub orchestrator
--           schedules the lifecycle; `fantasy_points` and `fantasy_scoring`
--           watch the result), or no gameweek is live, provisional or
--           finalizing, or an ok pass ran within 30 minutes;
--   * warn  no ok pass for 30 minutes while a gameweek is live, provisional
--           (including one closed on provisional points and not yet locked) or
--           finalizing;
--   * fail  the same for 90 minutes.
-- With a pass interval longer than 15 minutes the limits grow with it: warn at
-- twice the interval, fail at four times (never below 30 and 90 minutes).
-- "Since" counts from the latest of the last ok pass, the instant the worker
-- was switched on (or back on) and the instant the work appeared, so hours it
-- was off or had nothing to do are not held against it. A pass that stopped on
-- its budget (`partial`), failed, or found the lease held is not an ok pass; the
-- detail names the last pass.

do $$
begin
  if to_regprocedure('app_private.fantasy_worker_work_pending()') is null then
    raise exception 'fantasy_worker_health_prerequisite_missing: apply 20261013170000 first';
  end if;
end $$;

create function app_private.fantasy_worker_health()
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
  select g.sequence_number as sequence, g.status
    into v_active
    from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id
   where s.status in ('registration_open', 'active')
     and g.status in ('live', 'provisional', 'finalizing')
   order by g.sequence_number limit 1;
  select * into v_beat from app_private.fantasy_worker_dispatch where id;
  select lifecycle_worker_interval_minutes into v_interval from app_private.fantasy_automation_settings where id;
  select max(finished_at) into v_last_ok from app_private.fantasy_worker_runs where outcome = 'ok';
  select r.outcome, r.worker_code, r.finished_at into v_last
    from app_private.fantasy_worker_runs r order by r.finished_at desc limit 1;
  v_since := greatest(v_last_ok, v_beat.counting_from, v_beat.pending_since);
  v_minutes := extract(epoch from statement_timestamp() - v_since) / 60;
  if v_active.sequence is null then
    v_detail := 'no gameweek is live, provisional or finalizing';
  elsif v_since is null or v_minutes < greatest(30, 2 * v_interval) then
    v_detail := 'GW' || v_active.sequence || ' ' || v_active.status || '; last ok pass '
      || coalesce(to_char(v_last_ok at time zone 'UTC', 'HH24:MI') || ' UTC', 'none yet');
  else
    v_status := case when v_minutes >= greatest(90, 4 * v_interval) then 'fail' else 'warn' end;
    v_detail := 'no ok pass for ' || round(v_minutes)::integer || ' min while GW' || v_active.sequence
      || ' is ' || v_active.status || '; last pass '
      || coalesce(v_last.outcome || coalesce(' (' || v_last.worker_code || ')', '')
           || ' at ' || to_char(v_last.finished_at at time zone 'UTC', 'HH24:MI') || ' UTC', 'none')
      || '; tick answered ' || v_beat.last_outcome;
  end if;
  return jsonb_build_object('name', 'fantasy_worker', 'status', v_status, 'detail', v_detail);
end $$;
revoke all on function app_private.fantasy_worker_health() from public, anon, authenticated, service_role;
comment on function app_private.fantasy_worker_health() is
  'Health check fantasy_worker: warn at 30 minutes and fail at 90 minutes without an ok pass of the database lifecycle worker while a gameweek is live, provisional or finalizing. Ok while the worker is switched off.';

alter function app_private.ops_health_checks() rename to ops_health_checks_before_fantasy_worker;

create function app_private.ops_health_checks()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  result jsonb := app_private.ops_health_checks_before_fantasy_worker();
  checks jsonb := coalesce(result -> 'checks', '[]'::jsonb) || app_private.fantasy_worker_health();
begin
  return result || jsonb_build_object(
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks);
end $$;

revoke all on function app_private.ops_health_checks(), app_private.ops_health_checks_before_fantasy_worker()
  from public, anon, authenticated, service_role;
grant execute on function app_private.ops_health_checks(), app_private.ops_health_checks_before_fantasy_worker()
  to postgres;
