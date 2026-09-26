-- Regression suite for 20260926113100_football_season_refresh: the season's
-- fixtures refreshed hourly by the database, and `provider_refresh` failing
-- once they are 4 h old. Nothing is sent from a test: pg_net only queues the
-- request, and the rollback at the end discards it.
begin;
select extensions.no_plan();

create function pg_temp.provider_refresh() returns jsonb language sql as $$
  select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
  where c ->> 'name' = 'provider_refresh';
$$;
create function pg_temp.season_calls() returns integer language sql as $$
  select count(*)::integer from net.http_request_queue
  where url = 'https://functions.example.invalid/functions/v1/football-live-refresh'
    and convert_from(body, 'utf8')::jsonb ->> 'job' = 'season_fixtures';
$$;
-- A fixture refresh that ended as `p_status`, reading `p_from` to `p_to` days
-- from today, started `p_ago` ago.
create function pg_temp.fixture_run(p_status text, p_from integer, p_to integer, p_ago interval)
returns void language sql as $$
  insert into app_private.football_ingestion_runs (provider_name, job_type, status, started_at, target_scope)
  values ('sportsmonks', 'fixtures', p_status::app_private.ingestion_run_status, statement_timestamp() - p_ago,
    jsonb_build_object('leagueId', '860', 'seasonId', '28647',
      'from', to_char(current_date + p_from, 'YYYY-MM-DD'), 'to', to_char(current_date + p_to, 'YYYY-MM-DD')));
$$;

-- ---------------------------------------------------------------------------
-- Access and schedule.
-- ---------------------------------------------------------------------------
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.football_season_refresh_tick()', 'execute')
  and not has_function_privilege('authenticated', 'app_private.football_season_refresh_tick()', 'execute')
  and not has_function_privilege('anon', 'app_private.football_season_refresh_tick()', 'execute'),
  'only the database runs the season refresh tick');
select extensions.ok(
  not has_table_privilege('service_role', 'app_private.football_season_refresh_heartbeat', 'select')
  and not has_table_privilege('authenticated', 'app_private.football_season_refresh_heartbeat', 'select'),
  'nor can anyone else read its heartbeat');
select extensions.is(
  (select schedule || ' ' || command from cron.job where jobname = 'football-season-refresh'),
  '*/10 * * * * select app_private.football_season_refresh_tick();',
  'pg_cron runs the tick every 10 minutes');

-- ---------------------------------------------------------------------------
-- The tick: under the live refresh switch, once an hour.
-- ---------------------------------------------------------------------------
update app_private.notification_email_settings
set football_live_refresh_enabled = false, functions_base_url = 'https://functions.example.invalid/functions/v1';
select extensions.is(app_private.football_season_refresh_tick(), 'disabled',
  'with the live refresh switched off, it does nothing');
select extensions.is(pg_temp.season_calls(), 0, 'and calls nothing');
select extensions.is((select last_outcome from app_private.football_season_refresh_heartbeat), 'disabled',
  'and says so');

update app_private.football_season_refresh_heartbeat set counting_from = statement_timestamp() - interval '1 day';
update app_private.notification_email_settings set football_live_refresh_enabled = true;
select extensions.is(app_private.football_season_refresh_tick(), 'invoked', 'switched on, it calls at once');
select extensions.is(pg_temp.season_calls(), 1,
  'the Edge Function football-live-refresh, for the season_fixtures job');
select extensions.is(
  (select headers ->> 'x-botolago-scheduler-token' from net.http_request_queue
   where url = 'https://functions.example.invalid/functions/v1/football-live-refresh' order by id desc limit 1),
  app_private.scheduler_token(), 'with the scheduler token');
select extensions.ok((select counting_from > statement_timestamp() - interval '1 minute'
    from app_private.football_season_refresh_heartbeat),
  'and staleness is counted from now, not from before it was switched off');

select extensions.is(app_private.football_season_refresh_tick(), 'waiting', 'not again within the hour');
update app_private.football_season_refresh_heartbeat set last_invoked_at = statement_timestamp() - interval '57 minutes';
select extensions.is(app_private.football_season_refresh_tick(), 'waiting', 'nor at 57 minutes');
update app_private.football_season_refresh_heartbeat set last_invoked_at = statement_timestamp() - interval '59 minutes';
select extensions.is(app_private.football_season_refresh_tick(), 'invoked',
  'but at the tick closest to the hour');
select extensions.is(pg_temp.season_calls(), 2, 'a second call');

-- ---------------------------------------------------------------------------
-- One refresh from the database at a time: live and season calls take turns.
-- ---------------------------------------------------------------------------
create function pg_temp.live_calls() returns integer language sql as $$
  select count(*)::integer from net.http_request_queue
  where url = 'https://functions.example.invalid/functions/v1/football-live-refresh'
    and convert_from(body, 'utf8')::jsonb ->> 'job' = 'fixtures';
$$;
-- pg_net's answer to the last call the database dispatched.
create function pg_temp.answer_last_call(p_status integer, p_error text default null) returns void
language sql as $$
  insert into net._http_response (id, status_code, error_msg)
  select request_id, p_status, p_error from app_private.football_refresh_dispatch where id;
$$;
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.football_refresh_invoke(text, text)', 'execute')
  and not has_table_privilege('service_role', 'app_private.football_refresh_dispatch', 'select'),
  'only the database dispatches refreshes, or reads the dispatch record');

-- A match in play, so the live refresh calls every 2 minutes.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('f6000000-0000-4000-8000-000000000001', 'ZQ', 'ZQZ');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('f6100000-0000-4000-8000-000000000001', 'season-refresh', 'Season Refresh', 'SR', 'league',
  'f6000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f6200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000001',
  'Season refresh', current_date - 30, current_date + 200, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
values ('f6300000-0000-4000-8000-000000000001', 'f6200000-0000-4000-8000-000000000001', 1, 'Round 1');
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('f6400000-0000-4000-8000-00000000000' || n)::uuid, 'season-club-' || n, 'Season Club ' || n,
  'SC' || n, 'SC' || n, 'f6000000-0000-4000-8000-000000000001'
from generate_series(1, 2) n;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, provider_updated_at, source_sequence)
values ('f6500000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001',
  'f6400000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000002',
  statement_timestamp() - interval '70 minutes', 'live_second_half', statement_timestamp() - interval '1 day', 1);
update app_private.football_live_refresh_heartbeat set last_invoked_at = null;

-- The season call from above is still running: the live refresh waits.
select extensions.is((select job from app_private.football_refresh_dispatch), 'season_fixtures',
  'the season call is the last one dispatched');
select extensions.is(app_private.football_live_refresh_tick(), 'busy',
  'the live refresh waits while a season call is running');
select extensions.is(pg_temp.live_calls(), 0, 'and calls nothing');
select extensions.is((select last_invoked_at from app_private.football_live_refresh_heartbeat), null,
  'nor counts a call, so it tries again at the next minute');
select pg_temp.answer_last_call(null, 'Timeout of 60000 ms reached');
select extensions.is(app_private.football_live_refresh_tick(), 'busy',
  'pg_net giving up after 60 s does not end the call');
select pg_temp.answer_last_call(200);
select extensions.is(app_private.football_live_refresh_tick(), 'invoked', 'once the season call has answered, it goes');
select extensions.is(pg_temp.live_calls(), 1, 'one live call');

-- And the other way round.
update app_private.football_season_refresh_heartbeat set last_invoked_at = statement_timestamp() - interval '2 hours';
select extensions.is(app_private.football_season_refresh_tick(), 'busy',
  'the season refresh waits while a live call is running');
select extensions.is(pg_temp.season_calls(), 2, 'and calls nothing');
update app_private.football_live_refresh_heartbeat set last_invoked_at = statement_timestamp() - interval '3 minutes';
select extensions.is(app_private.football_live_refresh_tick(), 'invoked',
  'the live refresh keeps its own pace meanwhile');
update app_private.football_refresh_dispatch set dispatched_at = statement_timestamp() - interval '151 seconds';
select extensions.is(app_private.football_season_refresh_tick(), 'invoked',
  'a call is taken as over 150 s after it left, answer or not');
select extensions.is(pg_temp.season_calls(), 3, 'the season call goes');
delete from app.fixtures where id = 'f6500000-0000-4000-8000-000000000001';
update app_private.football_refresh_dispatch set dispatched_at = statement_timestamp() - interval '151 seconds';

-- ---------------------------------------------------------------------------
-- provider_refresh with the hourly refresh on.
-- ---------------------------------------------------------------------------
delete from app_private.football_ingestion_runs;
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'ok',
  'just switched on, nothing is late yet');
select extensions.alike(pg_temp.provider_refresh() ->> 'detail',
  'hourly season refresh on since % UTC, no season-wide refresh yet', 'and it says why');

update app_private.football_season_refresh_heartbeat set counting_from = statement_timestamp() - interval '3 hours';
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'warn', '3 h without a season-wide refresh warns');
update app_private.football_season_refresh_heartbeat set counting_from = statement_timestamp() - interval '5 hours';
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'fail', '5 h fails');
select extensions.alike(pg_temp.provider_refresh() ->> 'detail',
  'no season-wide fixture refresh recorded (hourly season refresh on, last called % UTC): kickoff changes and postponements are not reaching the app',
  'naming what is at stake');

select pg_temp.fixture_run('succeeded', -1, 1, interval '10 minutes');
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'fail',
  'the live refresh''s three days around a match do not count');
select pg_temp.fixture_run('succeeded', -60, -20, interval '10 minutes');
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'fail',
  'nor does a wide window that ended before today');

select pg_temp.fixture_run('succeeded', -1, 42, interval '5 hours');
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'fail', 'a season-wide refresh 5 h old fails');
select extensions.alike(pg_temp.provider_refresh() ->> 'detail', 'no season-wide fixture refresh for 5 h %',
  'with its age');
select pg_temp.fixture_run('failed', -1, 42, interval '40 minutes');
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'fail', 'a failed one does not count');

select pg_temp.fixture_run('succeeded', -1, 42, interval '30 minutes');
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'ok', 'a season-wide refresh 30 min old is fine');
select extensions.alike(pg_temp.provider_refresh() ->> 'detail', 'last season-wide fixture refresh % UTC',
  'and says when it was');
delete from app_private.football_ingestion_runs where target_scope ->> 'to' = to_char(current_date + 42, 'YYYY-MM-DD');
select pg_temp.fixture_run('succeeded', 0, 29, interval '30 minutes');
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'ok',
  'the orchestrator''s 30-day windows count too');

select pg_temp.fixture_run('failed', -1, 1, interval '1 hour');
select pg_temp.fixture_run('failed', -1, 1, interval '2 hours');
select pg_temp.fixture_run('failed', -1, 1, interval '3 hours');
select extensions.is(pg_temp.provider_refresh() ->> 'detail', '3 failed fixture refreshes in 6 h',
  'repeated failures still fail first');
delete from app_private.football_ingestion_runs where status::text = 'failed';

-- ---------------------------------------------------------------------------
-- With the switch off, as before 20260926113100.
-- ---------------------------------------------------------------------------
delete from app_private.football_ingestion_runs;
update app_private.notification_email_settings set football_live_refresh_enabled = false;
select pg_temp.fixture_run('succeeded', -1, 1, interval '11 hours');
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'ok',
  'off, any fixture refresh in the last 12 h is enough');
select extensions.alike(pg_temp.provider_refresh() ->> 'detail', '% UTC; hourly season refresh off',
  'and it says the hourly refresh is off');
delete from app_private.football_ingestion_runs;
select pg_temp.fixture_run('succeeded', -1, 1, interval '13 hours');
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'warn', 'and 12 h without one only warns');

-- Switched back on after a long pause: counted from then, not paged at once.
select app_private.football_season_refresh_tick();
update app_private.notification_email_settings set football_live_refresh_enabled = true;
select extensions.is(app_private.football_season_refresh_tick(), 'invoked', 'switched back on, it calls');
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'ok',
  'and the hours it was off do not page');

-- The alert tick pages on it like any failing check.
update app_private.football_season_refresh_heartbeat set counting_from = statement_timestamp() - interval '5 hours';
select extensions.is(pg_temp.provider_refresh() ->> 'status', 'fail', 'stale again');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(
  (select bool_or(c ->> 'name' = 'provider_refresh') from jsonb_array_elements(api.service_ops_health() -> 'checks') c
   where c ->> 'status' = 'fail'),
  'and the watchdog''s health read reports it failing');
select set_config('request.jwt.claims', '', true);

select * from extensions.finish();
rollback;
