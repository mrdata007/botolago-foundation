-- ---------------------------------------------------------------------------
-- Catch-up: bring the Fantasy season up to the new rule, with the same
-- service calls the season orchestrator makes. A refusal here is reported,
-- not fatal: the migrations above still apply and the orchestrator retries.
-- ---------------------------------------------------------------------------
create temporary table launch_fix_catch_up (step text primary key, outcome jsonb) on commit drop;

do $catch_up$
declare
  sync jsonb;
  gameweek record;
  state jsonb;
  attempts integer;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    sync := api.service_sync_fantasy_calendar(null);
    insert into launch_fix_catch_up values ('calendar', jsonb_build_object(
      'gameweeksCreated', sync -> 'gameweeksCreated',
      'assignmentsDeferred', sync -> 'assignmentsDeferred',
      'assignmentsAdded', sync -> 'assignmentsAdded',
      'deadlineChanges', sync -> 'deadlineChanges'));
  exception when others then
    insert into launch_fix_catch_up values ('calendar', jsonb_build_object('refused', sqlerrm));
  end;

  for gameweek in
    select g.id, g.sequence_number from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id
    where s.status in ('registration_open', 'active')
      and g.status = 'open' and g.deadline_at <= statement_timestamp()
    order by g.sequence_number
  loop
    begin
      attempts := 0;
      loop
        state := api.service_advance_fantasy_lifecycle(gameweek.id,
          (select lock_version from app.fantasy_gameweeks where id = gameweek.id), 500);
        attempts := attempts + 1;
        exit when not coalesce((state ->> 'hasMore')::boolean, false) or attempts >= 20;
      end loop;
      insert into launch_fix_catch_up values ('lifecycle GW' || gameweek.sequence_number,
        jsonb_build_object('status', state ->> 'status',
          'deferredAssignments', state -> 'deferredAssignments',
          'waitingReason', state ->> 'waitingReason'));
    exception when others then
      insert into launch_fix_catch_up values ('lifecycle GW' || gameweek.sequence_number,
        jsonb_build_object('refused', sqlerrm));
    end;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end
$catch_up$;

-- ---------------------------------------------------------------------------
-- Postflight: the objects the batch promises are there, with their grants.
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  batch_version text;
begin
  foreach batch_version in array string_to_array(current_setting('botolago.batch_versions'), ',') loop
    if not exists (select 1 from supabase_migrations.schema_migrations m where m.version = batch_version) then
      problems := problems || ('history row missing for ' || batch_version);
    end if;
  end loop;

  if to_regprocedure('app_private.fantasy_enrolment_gameweek(uuid)') is null
    or to_regprocedure('app_private.fantasy_defer_postponed_assignments(uuid)') is null then
    problems := problems || 'Fantasy helper functions missing'::text;
  end if;
  if has_function_privilege('authenticated', 'app_private.fantasy_enrolment_gameweek(uuid)', 'execute')
    or has_function_privilege('anon', 'app_private.fantasy_defer_postponed_assignments(uuid)', 'execute') then
    problems := problems || 'a private Fantasy helper is callable by API roles'::text;
  end if;
  if not has_function_privilege('authenticated', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute')
    or not has_function_privilege('service_role', 'api.service_sync_fantasy_calendar(uuid)', 'execute')
    or has_function_privilege('anon', 'api.service_sync_fantasy_calendar(uuid)', 'execute') then
    problems := problems || 'Fantasy API grants changed'::text;
  end if;
  if pg_get_functiondef('api.fantasy_hub(text)'::regprocedure) not like '%enrolmentGameweek%'
    or pg_get_functiondef('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)'::regprocedure)
      not like '%fantasy_enrolment_gameweek%' then
    problems := problems || 'Fantasy functions were not replaced'::text;
  end if;
  if pg_get_constraintdef((select oid from pg_constraint
      where conname = 'fantasy_fixture_assignments_resolution_check')) not like '%provider_postponed%' then
    problems := problems || 'provider_postponed resolution not allowed'::text;
  end if;

  if (select schedule from cron.job where jobname = 'fantasy-lifecycle-tick') is distinct from '*/5 * * * *' then
    problems := problems || 'fantasy-lifecycle-tick is not scheduled every five minutes'::text;
  end if;
  if (select lifecycle_tick_enabled from app_private.fantasy_automation_settings) is distinct from false then
    problems := problems || 'the lifecycle tick must arrive switched off'::text;
  end if;
  if has_function_privilege('service_role', 'app_private.fantasy_automation_configure(boolean)', 'execute') then
    problems := problems || 'the automation switch is callable by service_role'::text;
  end if;
  if not has_function_privilege('service_role', 'api.service_ops_health()', 'execute')
    or has_function_privilege('anon', 'api.service_ops_health()', 'execute')
    or has_function_privilege('authenticated', 'api.service_ops_health()', 'execute') then
    problems := problems || 'api.service_ops_health grants are wrong'::text;
  end if;
  if (select schedule from cron.job where jobname = 'ops-alert-tick') is distinct from '*/5 * * * *'
    or (select enabled from app_private.ops_alert_state) is distinct from false then
    problems := problems || 'the ops alert tick must be scheduled and arrive switched off'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- Tell the API about the new definitions (delivered only on commit).
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Summary, then REHEARSAL stops here with everything thrown away.
-- ---------------------------------------------------------------------------
do $finish$
declare
  summary jsonb;
begin
  summary := jsonb_build_object(
    'catchUp', (select coalesce(jsonb_object_agg(step, outcome), '{}'::jsonb) from launch_fix_catch_up),
    'gameweeks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'gameweek', g.sequence_number,
        'status', g.status,
        'deadlineUtc', to_char(g.deadline_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
        'countingFixtures', (select count(*) from app.fantasy_fixture_assignments a
          where a.gameweek_id = g.id and a.superseded_at is null and a.counts_points),
        'lockedLineups', (select count(*) from app.fantasy_lineups l
          where l.gameweek_id = g.id and l.locked_at is not null),
        'unlockedLineups', (select count(*) from app.fantasy_lineups l
          where l.gameweek_id = g.id and l.locked_at is null)
      ) order by g.sequence_number), '[]'::jsonb)
      from app.fantasy_gameweeks g
      join app.fantasy_seasons s on s.id = g.fantasy_season_id
      where s.status in ('registration_open', 'active')),
    'deferredByThisRun', (
      select coalesce(jsonb_agg(ht.name || ' v ' || awt.name order by f.kickoff_at), '[]'::jsonb)
      from app.fantasy_fixture_assignments a
      join app.fixtures f on f.id = a.fixture_id
      join app.teams ht on ht.id = f.home_team_id
      join app.teams awt on awt.id = f.away_team_id
      where a.resolution = 'provider_postponed'),
    'health', (select jsonb_object_agg(c ->> 'name', c ->> 'status' || ': ' || (c ->> 'detail'))
      from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c),
    'newTeamsJoin', (
      select case when e.id is null then 'no gameweek (registration closed)'
        else 'gameweek ' || e.sequence_number || ', deadline '
          || to_char(e.deadline_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' end
      from app.fantasy_seasons s
      cross join lateral app_private.fantasy_enrolment_gameweek(s.id) e
      where s.status in ('registration_open', 'active')
      order by s.starts_at desc limit 1)
  );
  if current_setting('botolago.launch_fixes_mode') <> 'APPLY' then
    raise exception using
      message = 'REHEARSAL PASSED -- nothing was saved. DETAIL shows what applying would change.',
      detail = jsonb_pretty(summary),
      hint = 'To apply for real: change REHEARSAL to APPLY on the MODE line near the top, and run again.';
  end if;
  raise notice 'launch fixes applied: %', summary;
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260924190000')
    then 'Applied. New managers can join the next gameweek; postponed fixtures no longer block the season.'
  else 'Not applied. Nothing was saved.'
end as result;
