-- BG-0158 P3: the `manager_card` health check.
--
-- Once the card's compute is switched on, the one silent failure that matters
-- is "a finished gameweek never got its cards". This adds a check named
-- `manager_card` to app_private.ops_health_checks(), last, like
-- `account_deletion` (20261006143700): warn after 2 hours, fail (which pages
-- the owner through ops-alert-tick) after 12 hours. The waiting-gameweek
-- warning and failure apply only while compute is on and the active rules are
-- usable. Counts only; no user id.
--
-- scripts/ops/watchdog.ts REQUIRED_DATABASE_CHECKS does not list it until
-- production has this migration.

alter function app_private.ops_health_checks() rename to ops_health_checks_before_manager_card;

create function app_private.manager_card_health()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_compute boolean;
  v_read boolean;
  v_usable boolean;
  v_version integer;
  v_stale integer;
  v_oldest timestamptz;
  v_errors integer;
  v_status text;
  v_detail text;
begin
  select s.compute_enabled, s.read_enabled into v_compute, v_read
  from app_private.manager_card_settings s where s.id;
  v_compute := coalesce(v_compute, false);
  v_read := coalesce(v_read, false);
  select r.version, r.usable into v_version, v_usable from app_private.manager_card_active_rules() r;
  v_usable := coalesce(v_usable, false);

  select count(*), min(work.completed_at) into v_stale, v_oldest
  from app.fantasy_gameweeks gw
  join app_private.fantasy_gameweek_postwork work
    on work.gameweek_id = gw.id and work.calculation_version = gw.scoring_input_version
    and work.completed_at is not null
  where gw.status in ('finalized', 'corrected') and gw.points_state = 'final'
    and v_version is not null
    and not exists (
      select 1 from app_private.manager_card_evaluations ev
      where ev.gameweek_id = gw.id and ev.scoring_input_version = gw.scoring_input_version
        and ev.rules_version = v_version);

  select count(*) into v_errors
  from app_private.manager_card_job_log l
  where l.outcome = 'error' and l.started_at > statement_timestamp() - interval '24 hours';

  if not v_compute and not v_read then
    v_status := 'ok';
    v_detail := 'switched off';
  elsif v_read and not v_usable then
    v_status := 'warn';
    v_detail := 'reads on but no usable rules: the section answers off';
  elsif v_compute and not v_usable then
    v_status := 'warn';
    v_detail := 'compute on but no usable rules';
  elsif v_read and not v_compute then
    v_status := 'warn';
    v_detail := 'reads on, compute off: cards frozen';
  elsif v_compute and v_stale > 0 and v_oldest < statement_timestamp() - interval '12 hours' then
    v_status := 'fail';
    v_detail := v_stale || ' finished gameweek(s) waiting for their cards for more than 12 hours';
  elsif v_compute and v_stale > 0 and v_oldest < statement_timestamp() - interval '2 hours' then
    v_status := 'warn';
    v_detail := v_stale || ' finished gameweek(s) waiting for their cards for more than 2 hours';
  elsif v_errors > 0 then
    v_status := 'warn';
    v_detail := v_errors || ' tick error(s) in the last 24 hours';
  else
    v_status := 'ok';
    v_detail := 'cards current under rules v' || coalesce(v_version::text, '?');
  end if;

  return jsonb_build_object('name', 'manager_card', 'status', v_status, 'detail', v_detail);
end;
$$;

comment on function app_private.manager_card_health() is
  'The manager_card health check: ok / warn / fail with counts only. Fails (and pages) when compute is on, the rules are usable and a finished gameweek has waited more than 12 hours for its cards; warns after 2 hours. No grant.';

create function app_private.ops_health_checks()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb := app_private.ops_health_checks_before_manager_card();
  checks jsonb := coalesce(result -> 'checks', '[]'::jsonb) || app_private.manager_card_health();
begin
  return result || jsonb_build_object(
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks);
end;
$$;

revoke all on function
  app_private.ops_health_checks(),
  app_private.ops_health_checks_before_manager_card(),
  app_private.manager_card_health()
from public, anon, authenticated, service_role;
grant execute on function
  app_private.ops_health_checks(),
  app_private.ops_health_checks_before_manager_card()
to postgres;
