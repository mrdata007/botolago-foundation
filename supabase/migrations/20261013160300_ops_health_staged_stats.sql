-- SofaScore staged statistics (docs/backend/SOFASCORE_STAGED_STATS.md), part 4:
-- one health check, added through a wrapper like the earlier ones.
--
-- fantasy_staged_stats (reads state, writes nothing):
--   * ok    when no season has the staged policy on, or nothing is late;
--   * warn  a PROVISIONAL match is 12 hours or more past its next pull time
--           (the pull job is not running, or the switch/deploy is missing);
--   * warn  a gameweek whose matches are all FINAL or FINAL_LIMITED has not
--           locked 3 hours after the last one settled; fail from 12 hours
--           (the hourly worker should have locked it).
-- FINAL_LIMITED matches of the last 30 days are named in the detail as
-- information; the staff list is api.admin_sofascore_final_limited().

do $$
begin
  if to_regprocedure('app_private.fantasy_staged_lock_blocker(uuid)') is null then
    raise exception 'staged_stats_health_prerequisite_missing: apply 20261013160200 first';
  end if;
end $$;

create function app_private.fantasy_staged_stats_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_enabled integer;
  v_late integer;
  v_limited integer;
  v_wait record;
  v_status text := 'ok';
  v_detail text;
begin
  select count(*) into v_enabled from app_private.fantasy_staged_stats_policy where enabled;
  if v_enabled = 0 then
    return jsonb_build_object('name', 'fantasy_staged_stats', 'status', 'ok',
      'detail', 'staged SofaScore statistics are off for every season');
  end if;
  select count(*) into v_late from app_private.sofascore_staged_stats s
   where s.status = 'PROVISIONAL' and s.next_pull_at < statement_timestamp() - interval '12 hours'
     and exists(select 1 from app.fantasy_fixture_assignments a
                 where a.fixture_id = s.fixture_id and a.superseded_at is null
                   and app_private.fantasy_staged_enabled(a.gameweek_id));
  select count(*) into v_limited from app_private.sofascore_staged_stats
   where status = 'FINAL_LIMITED' and settled_at > statement_timestamp() - interval '30 days';
  select g.sequence_number as sequence,
         extract(epoch from statement_timestamp() - max(s.settled_at)) / 3600 as hours
    into v_wait
    from app.fantasy_gameweeks g
    join app.fantasy_fixture_assignments a on a.gameweek_id = g.id and a.superseded_at is null and a.counts_points
    join app_private.sofascore_staged_stats s on s.fixture_id = a.fixture_id
   where g.status = 'provisional' and app_private.fantasy_staged_enabled(g.id)
     and app_private.fantasy_staged_lock_blocker(g.id) is null
   group by g.id, g.sequence_number
  having max(s.settled_at) < statement_timestamp() - interval '3 hours'
   order by max(s.settled_at) limit 1;
  if v_wait.sequence is not null then
    v_status := case when v_wait.hours >= 12 then 'fail' else 'warn' end;
    v_detail := 'GW' || v_wait.sequence || ' has every match FINAL or FINAL_LIMITED for ' || round(v_wait.hours::numeric, 1) || ' h and is not locked';
  elsif v_late > 0 then
    v_status := 'warn';
    v_detail := v_late || ' provisional match(es) are 12 h or more past their next pull';
  else
    v_detail := 'no late pull and no gameweek waiting to lock';
  end if;
  return jsonb_build_object('name', 'fantasy_staged_stats', 'status', v_status,
    'detail', v_detail || '; info: ' || v_limited || ' match(es) ended FINAL_LIMITED in the last 30 days');
end $$;
revoke all on function app_private.fantasy_staged_stats_health() from public, anon, authenticated, service_role;

alter function app_private.ops_health_checks() rename to ops_health_checks_before_staged_stats;

create function app_private.ops_health_checks()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  result jsonb := app_private.ops_health_checks_before_staged_stats();
  checks jsonb := coalesce(result -> 'checks', '[]'::jsonb) || app_private.fantasy_staged_stats_health();
begin
  return result || jsonb_build_object(
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks);
end $$;

revoke all on function app_private.ops_health_checks(), app_private.ops_health_checks_before_staged_stats()
  from public, anon, authenticated, service_role;
grant execute on function app_private.ops_health_checks(), app_private.ops_health_checks_before_staged_stats()
  to postgres;
