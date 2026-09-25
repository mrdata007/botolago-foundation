-- Regression suite for 20260924200500_football_live_refresh_cadence.
--
-- Every fixture is placed relative to statement_timestamp(), with odd
-- seconds so none lands on the provider's 00:00:00 UTC placeholder.
begin;
select extensions.no_plan();

select extensions.is((select schedule from cron.job where jobname = 'football-live-refresh'),
  '* * * * *', 'pg_cron wakes the live refresh every minute');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.football_live_refresh_heartbeat'::regclass), 'its heartbeat forces RLS');
select extensions.ok(not has_table_privilege('service_role', 'app_private.football_live_refresh_heartbeat', 'select')
  and not has_function_privilege('service_role', 'app_private.football_live_refresh_tick()', 'execute'),
  'no API role reads the heartbeat or runs the tick');

-- One current season with four clubs.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('f5000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('f5100000-0000-4000-8000-000000000001', 'live-cadence', 'Live Cadence', 'LC', 'league',
  'f5000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001',
  'Live season', current_date - 30, current_date + 200, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
values ('f5300000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-000000000001', 1, 'Round 1');
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('f5400000-0000-4000-8000-00000000000' || n)::uuid, 'live-club-' || n, 'Live Club ' || n,
  'LC' || n, 'LC' || n, 'f5000000-0000-4000-8000-000000000001'
from generate_series(1, 4) n;

create function pg_temp.fixture(p_id integer, p_kickoff timestamptz, p_status app.fixture_status)
returns void language sql as $$
  insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
    kickoff_at, status, provider_updated_at, source_sequence)
  values (('f5500000-0000-4000-8000-00000000000' || p_id)::uuid,
    'f5100000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-000000000001',
    'f5300000-0000-4000-8000-000000000001', 'f5400000-0000-4000-8000-000000000001',
    'f5400000-0000-4000-8000-000000000002', p_kickoff, p_status,
    statement_timestamp() - interval '1 day', 1)
$$;
create function pg_temp.set_status(p_id integer, p_status app.fixture_status) returns void
language sql as $$
  update app.fixtures set status = p_status,
    provider_updated_at = provider_updated_at + interval '1 minute', source_sequence = source_sequence + 1
  where id = ('f5500000-0000-4000-8000-00000000000' || p_id)::uuid
$$;
-- "The last call was this long ago."
create function pg_temp.last_call(p_ago interval) returns void language sql as $$
  update app_private.football_live_refresh_heartbeat
  set last_invoked_at = statement_timestamp() - p_ago where id
$$;

-- ---------------------------------------------------------------------------
-- Off, then on with nothing to play.
-- ---------------------------------------------------------------------------
select extensions.is(app_private.football_live_refresh_tick(), 'disabled',
  'nothing is called while the switch is off');
-- Live scores on, email still off: the owner's switch-on, exactly.
select app_private.notification_email_configure('off', 'https://live.example.invalid/functions/v1', null, true);
select extensions.is(app_private.football_live_refresh_tick(), 'idle',
  'switched on with no match: no provider call');

-- A postponed match and a kick-off time the provider has not set yet
-- (its 00:00 UTC placeholder) are not matches to refresh.
select pg_temp.fixture(1, statement_timestamp() - interval '20 minutes 7 seconds', 'postponed');
select pg_temp.fixture(2, date_trunc('day', statement_timestamp()), 'not_started');
select extensions.is(app_private.football_live_refresh_tick(), 'idle',
  'a postponed match, or one without a real kick-off time, is not polled');

-- ---------------------------------------------------------------------------
-- Before kick-off: every 5 minutes.
-- ---------------------------------------------------------------------------
select pg_temp.fixture(3, statement_timestamp() + interval '6 minutes 7 seconds', 'not_started');
select extensions.is(app_private.football_live_refresh_tick(), 'invoked',
  'a kick-off within ten minutes is refreshed at once');
select extensions.ok(
  (select headers ->> 'x-botolago-scheduler-token' ~ '^[0-9a-f]{64}$'
     and url = 'https://live.example.invalid/functions/v1/football-live-refresh'
   from net.http_request_queue order by id desc limit 1),
  'the Edge Function is called with the scheduler token');
select extensions.is(app_private.football_live_refresh_tick(), 'waiting',
  'and not again at the next minute');
select pg_temp.last_call(interval '3 minutes');
select extensions.is(app_private.football_live_refresh_tick(), 'waiting',
  'nor three minutes later');
select pg_temp.last_call(interval '4 minutes 45 seconds');
select extensions.is(app_private.football_live_refresh_tick(), 'invoked',
  'but five minutes later (a late pg_cron start included)');

-- ---------------------------------------------------------------------------
-- In play: every 2 minutes, however late the provider says so.
-- ---------------------------------------------------------------------------
update app.fixtures set kickoff_at = statement_timestamp() - interval '2 minutes 7 seconds'
where id = 'f5500000-0000-4000-8000-000000000003';
select pg_temp.last_call(interval '90 seconds');
select extensions.is(app_private.football_live_refresh_tick(), 'waiting',
  'past kick-off, still "not started" at the provider: not before two minutes');
select pg_temp.last_call(interval '1 minute 45 seconds');
select extensions.is(app_private.football_live_refresh_tick(), 'invoked',
  'then every two minutes, so the kick-off itself is seen');
select pg_temp.set_status(3, 'live_first_half');
select pg_temp.last_call(interval '2 minutes');
select extensions.is(app_private.football_live_refresh_tick(), 'invoked',
  'a match in play is refreshed every two minutes');
select pg_temp.set_status(3, 'half_time');
select extensions.is(app_private.football_live_refresh_tick(), 'waiting',
  'half-time counts as in play, at the same cadence');

-- ---------------------------------------------------------------------------
-- Finished: polling stops, and the next match starts afresh.
-- ---------------------------------------------------------------------------
update app.fixtures set status = 'finished', period = 'post_match', home_score = 2, away_score = 1,
  provider_updated_at = provider_updated_at + interval '1 hour', source_sequence = source_sequence + 10
where id = 'f5500000-0000-4000-8000-000000000003';
select extensions.is(app_private.football_live_refresh_tick(), 'idle',
  'a finished match is not polled');
select extensions.ok((select last_invoked_at is null and last_outcome = 'idle'
  from app_private.football_live_refresh_heartbeat), 'and the last call is forgotten');
select pg_temp.fixture(4, statement_timestamp() - interval '1 minute 7 seconds', 'live_first_half');
select extensions.is(app_private.football_live_refresh_tick(), 'invoked',
  'so the next match is refreshed at once');
select extensions.is(
  (select count(*)::integer from net.http_request_queue
   where url = 'https://live.example.invalid/functions/v1/football-live-refresh'),
  5, 'five provider calls in all, one per invocation');

-- ---------------------------------------------------------------------------
-- The ops health check notices a stalled refresh within ten minutes.
-- ---------------------------------------------------------------------------
insert into app_private.football_ingestion_runs (provider_name, job_type, status, started_at)
values ('sportsmonks', 'fixtures', 'succeeded', statement_timestamp() - interval '11 minutes');
select extensions.is(
  (select c ->> 'status' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' = 'live_scores'),
  'fail', 'a match in play with no fixture refresh for eleven minutes fails the live-scores check');
insert into app_private.football_ingestion_runs (provider_name, job_type, status, started_at)
values ('sportsmonks', 'fixtures', 'succeeded', statement_timestamp() - interval '1 minute');
select extensions.is(
  (select c ->> 'status' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' = 'live_scores'),
  'ok', 'a refresh a minute ago passes it');

select * from extensions.finish();
rollback;
