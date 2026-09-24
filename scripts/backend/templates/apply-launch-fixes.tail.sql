-- ---------------------------------------------------------------------------
-- Catch-up: bring the Fantasy season up to the new rule, with the same
-- service calls the season orchestrator makes. A refusal here is reported,
-- not fatal: the migrations above still apply and the orchestrator retries.
-- ---------------------------------------------------------------------------
create temporary table launch_fix_catch_up (step text primary key, outcome jsonb) on commit drop;

-- Before anything locks: squads saved after their gameweek's deadline while it
-- stayed open. Locking freezes them as they are, so the owner sees the count
-- in the rehearsal and decides before applying (0 on 2026-09-24 at 21:24 UTC).
insert into launch_fix_catch_up
select 'lineupsChangedAfterDeadline', coalesce(jsonb_object_agg('GW' || t.sequence_number, t.changed), '{}'::jsonb)
from (
  select g.sequence_number, count(*) filter (where l.updated_at > g.deadline_at) as changed
  from app.fantasy_gameweeks g
  join app.fantasy_seasons s on s.id = g.fantasy_season_id
  join app.fantasy_lineups l on l.gameweek_id = g.id
  where s.status in ('registration_open', 'active') and g.status = 'open'
    and g.deadline_at < statement_timestamp() and l.locked_at is null
  group by g.sequence_number
) t;

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
-- Planner statistics. pg_stat_user_tables on 2026-09-24: app.players (read
-- by every player pool and match sheet) and app.rounds had never been
-- analysed, so the planner was guessing their sizes (it counted 42 players;
-- each full read returned ~930). ANALYZE takes no lock that blocks readers or
-- writers, and a rehearsal rolls it back with everything else.
-- ---------------------------------------------------------------------------
analyze app.players;
analyze app.rounds;

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
  if not has_function_privilege('anon', 'api.report_client_errors(jsonb)', 'execute')
    or has_table_privilege('anon', 'app_private.client_error_counts', 'select')
    or has_table_privilege('authenticated', 'app_private.client_error_counts', 'select')
    or not (select relrowsecurity and relforcerowsecurity from pg_class
            where oid = 'app_private.client_error_counts'::regclass) then
    problems := problems || 'browser error reports: callable by visitors, readable by nobody'::text;
  end if;

  if not app_private.is_valid_timezone('Africa/Casablanca')
    or app_private.is_valid_timezone('UTC+3')
    or (select count(*) from app_private.timezone_names)
      <> (select count(*) from pg_catalog.pg_timezone_names) then
    problems := problems || 'the timezone snapshot does not match the catalogue'::text;
  end if;
  if not has_function_privilege('anon',
      'api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamptz,uuid,integer)', 'execute')
    or has_function_privilege('anon', 'app_private.is_valid_timezone(text)', 'execute')
    or has_function_privilege('authenticated', 'app_private.is_valid_timezone(text)', 'execute') then
    problems := problems || 'timezone function grants are wrong'::text;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('api', 'app', 'app_private') and p.prokind = 'f'
        and pg_get_functiondef(p.oid) ilike '%pg_timezone_names%') then
    problems := problems || 'a function still scans pg_timezone_names'::text;
  end if;
  if pg_get_functiondef('api.news_related_articles(uuid,integer)'::regprocedure) not like '%scored as (%'
    or not has_function_privilege('anon', 'api.news_related_articles(uuid,integer)', 'execute') then
    problems := problems || 'api.news_related_articles was not replaced, or lost its grant'::text;
  end if;
  if (select schedule from cron.job where jobname = 'football-live-refresh') is distinct from '* * * * *'
    or to_regclass('app_private.football_live_refresh_heartbeat') is null
    or has_function_privilege('service_role', 'app_private.football_live_refresh_tick()', 'execute') then
    problems := problems || 'the live refresh cadence is not in place'::text;
  end if;
  if pg_get_functiondef('api.news_article_detail(text,text)'::regprocedure) not like '%contentUpdatedAt%'
    or pg_get_functiondef('api.news_sitemap_entries(integer)'::regprocedure) not like '%contentUpdatedAt%'
    or not has_function_privilege('anon', 'api.news_sitemap_entries(integer)', 'execute')
    or has_function_privilege('anon', 'app_private.news_content_updated_at(app.article_editions)', 'execute') then
    problems := problems || 'article modified dates are not in place'::text;
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
  started timestamptz;
  matches_ms numeric;
  related_ms numeric;
  newest_article uuid;
begin
  -- The two calls measured before this batch, timed again: the matches page
  -- (1,025 ms) and the related rail under the newest article (608-644 ms).
  started := clock_timestamp();
  perform api.football_matches_by_date(current_date, 'fr', 'Africa/Casablanca', null, null, null, null, null, 20);
  matches_ms := round(extract(epoch from clock_timestamp() - started)::numeric * 1000, 1);
  select e.id into newest_article from app.article_editions e
  where e.language = 'fr' and e.status = 'published' and e.published_at is not null
    and app_private.news_is_public(e)
  order by e.published_at desc, e.id desc limit 1;
  if newest_article is not null then
    started := clock_timestamp();
    perform api.news_related_articles(newest_article, 6);
    related_ms := round(extract(epoch from clock_timestamp() - started)::numeric * 1000, 1);
  end if;

  summary := jsonb_build_object(
    'matchesByDateMs', matches_ms,
    'relatedArticlesMs', related_ms,
    -- Was 15,690 (every article) on 2026-09-24: now only real edits today.
    'articlesClaimingAnEditToday', (select count(*) from app.article_editions e
      where e.status = 'published' and e.visibility = 'public'
        and app_private.news_content_updated_at(e) >= date_trunc('day', statement_timestamp())
        and app_private.news_content_updated_at(e) > e.published_at + interval '1 minute'),
    'liveScores', (select case when football_live_refresh_enabled and functions_base_url is not null
        then 'on' else 'off (switch on: docs/backend/EMAIL_NOTIFICATIONS.md)' end
      from app_private.notification_email_settings where id),
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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260924200000')
    then 'Applied. New managers can join the next gameweek; postponed fixtures no longer block the season.'
  else 'Not applied. Nothing was saved.'
end as result;
