-- Regression suite for 20261013140100_ops_health_two_stage_progression: the
-- `fantasy_progression` health check no longer fails because the previous
-- gameweek is provisional and waiting.
--
-- A scheduled gameweek whose predecessor is not finalized is information only
-- while every counted match of the predecessor is final with core data and the
-- worker has not yet had its chance (12 h + 1 h after the last whistle). It
-- stays a warning or a failure when a counted match has no core data (the
-- lifecycle cannot finalize the predecessor, so it cannot open the successor),
-- when the predecessor should have finalized by now, when a counted match is
-- not finished, and when the deadline has passed. Nothing is sent from a test,
-- and the rollback discards every row.
begin;
select extensions.plan(26);

create function pg_temp.check(p_name text) returns jsonb language sql as $$
  select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
  where c ->> 'name' = p_name
$$;
create function pg_temp.progression() returns jsonb language sql as $$
  select pg_temp.check('fantasy_progression')
$$;
create function pg_temp.fx(n integer) returns uuid language sql as $$
  select ('ed900000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

-- No season yet: nothing to progress.
select extensions.is(pg_temp.progression(),
  '{"name": "fantasy_progression", "status": "ok", "detail": "no stalled or deadline-risk scheduled gameweek", "gameweeks": []}'::jsonb,
  'nothing scheduled: ok');

-- One adaptive season. GW1 provisional with two finished counted matches, GW2 scheduled.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('ed000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('ed100000-0000-4000-8000-000000000001', 'two-stage-progression', 'Two Stage Progression', 'TSP', 'league',
  'ed000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('ed200000-0000-4000-8000-000000000001', 'ed100000-0000-4000-8000-000000000001',
  'Two stage progression season', current_date - 10, current_date + 100, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
select ('ed300000-0000-4000-8000-00000000000' || n)::uuid, 'ed200000-0000-4000-8000-000000000001', n, 'Round ' || n
from generate_series(1, 2) n;
insert into app.teams (id, slug, name, short_name, code, country_id)
select md5('tp-club-' || n)::uuid, 'tp-club-' || n, 'Progression Club ' || n, 'PC' || n, 'P' || n,
  'ed000000-0000-4000-8000-000000000001'
from generate_series(1, 4) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('ed600000-0000-4000-8000-000000000001', 'ed100000-0000-4000-8000-000000000001',
  'two-stage-progression', 'Two Stage Progression', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('ed630000-0000-4000-8000-000000000001', 'ed600000-0000-4000-8000-000000000001',
  'ed200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Two stage progression season', 'active', current_date - 10, current_date + 100);
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, finalized_at)
values
  ('ed700000-0000-4000-8000-000000000001', 'ed630000-0000-4000-8000-000000000001',
   'ed300000-0000-4000-8000-000000000001', 1, 'Round 1', statement_timestamp() - interval '2 days',
   statement_timestamp() - interval '40 hours', statement_timestamp() + interval '1 day', 'provisional', 'provisional', null),
  ('ed700000-0000-4000-8000-000000000002', 'ed630000-0000-4000-8000-000000000001',
   'ed300000-0000-4000-8000-000000000002', 2, 'Round 2', statement_timestamp() + interval '3 hours',
   statement_timestamp() + interval '3 hours', statement_timestamp() + interval '3 days', 'scheduled', 'provisional', null);
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at, source_sequence)
select pg_temp.fx(n), 'ed100000-0000-4000-8000-000000000001', 'ed200000-0000-4000-8000-000000000001',
  'ed300000-0000-4000-8000-000000000001', md5('tp-club-' || (2 * n - 1))::uuid, md5('tp-club-' || (2 * n))::uuid,
  statement_timestamp() - interval '7 hours', 'finished', 1, 0, statement_timestamp() - interval '5 hours',
  statement_timestamp(), 1
from generate_series(1, 2) n;
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version, frozen_at)
select 'ed630000-0000-4000-8000-000000000001', f.id, 'ed700000-0000-4000-8000-000000000001',
  'ed700000-0000-4000-8000-000000000001', f.kickoff_at, f.kickoff_at, 1, statement_timestamp() - interval '2 days'
from app.fixtures f where f.season_id = 'ed200000-0000-4000-8000-000000000001';
insert into app_private.fantasy_adaptive_policy (season_id, from_gameweek, ruleset_id)
values ('ed630000-0000-4000-8000-000000000001', 1, 'f6200000-0000-4000-8000-000000000200');

create function pg_temp.observe(p_fixture uuid, p_full boolean, p_core boolean) returns void language sql as $$
  insert into app_private.fantasy_fixture_observations (fixture_id, observed_at, source, digest, payload,
    full_ready, simple_ready)
  values (p_fixture, statement_timestamp() - interval '1 hour', 'sportsmonks',
    encode(extensions.digest(clock_timestamp()::text || random()::text, 'sha256'), 'hex'), '{}'::jsonb,
    p_full, p_core)
$$;
create function pg_temp.whistle(p_ago interval) returns void language sql as $$
  update app.fixtures set finalized_at = statement_timestamp() - p_ago,
    kickoff_at = statement_timestamp() - p_ago - interval '2 hours'
  where season_id = 'ed200000-0000-4000-8000-000000000001'
$$;
-- A deadline moves only in a service request (fantasy_guard_deadline_change).
create function pg_temp.deadline(p_in interval) returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select set_config('request.jwt.claim.role', 'service_role', true);
  update app.fantasy_gameweeks set deadline_at = statement_timestamp() + p_in,
    starts_at = greatest(statement_timestamp() + p_in, starts_at)
  where id = 'ed700000-0000-4000-8000-000000000002'
$$;

-- ---------------------------------------------------------------------------
-- GW1 provisional, both matches final 5 h ago with core data only (limited
-- coverage), GW2's deadline in 3 h: the worker has not been due yet.
-- ---------------------------------------------------------------------------
select pg_temp.observe(pg_temp.fx(n), false, true) from generate_series(1, 2) n;
select extensions.is(pg_temp.progression() ->> 'status', 'ok',
  'previous gameweek provisional, core data everywhere, 3 h to the deadline: not a failure');
select extensions.is(jsonb_array_length(pg_temp.progression() -> 'gameweeks'), 0, 'and nothing is listed as blocked');
select extensions.is(pg_temp.progression() ->> 'detail',
  'no stalled or deadline-risk scheduled gameweek; info: 1 scheduled gameweek(s) wait for the previous one to finalize (every counted match has core data; provisional points count, full statistics do not block)',
  'it is reported as information');
select pg_temp.deadline(interval '20 hours');
select extensions.is(pg_temp.progression() ->> 'status', 'ok', '20 h to the deadline: still ok (it used to warn)');

-- Past the worker's chance (12 h + 1 h after the last whistle) and still provisional:
-- the lifecycle should have finalized it, so it is a real stall again.
select pg_temp.whistle(interval '14 hours');
select extensions.is(pg_temp.progression() ->> 'status', 'warn', '14 h after the whistle, 20 h to the deadline: warn, as before');
select pg_temp.deadline(interval '3 hours');
select extensions.is(pg_temp.progression() ->> 'status', 'fail', '14 h after the whistle, 3 h to the deadline: fail, as before');
select extensions.is(pg_temp.progression() #>> '{gameweeks,0,reason}', 'previous_postwork_incomplete',
  'with the reason the check has always given');
select extensions.is(pg_temp.progression() #>> '{gameweeks,0,previousStatus}', 'provisional', 'and the previous gameweek''s status');
select pg_temp.whistle(interval '12 hours 59 minutes');
select extensions.is(pg_temp.progression() ->> 'status', 'ok', 'at 12 h 59 min after the whistle it is still inside the worker''s window');
select pg_temp.whistle(interval '13 hours 1 minute');
select extensions.is(pg_temp.progression() ->> 'status', 'fail', 'at 13 h 1 min it is not');

-- ---------------------------------------------------------------------------
-- A counted match with no core data keeps the previous gameweek from
-- finalizing: a real block, whatever the age.
-- ---------------------------------------------------------------------------
select pg_temp.whistle(interval '5 hours');
delete from app_private.fantasy_fixture_observations where fixture_id = pg_temp.fx(2);
select extensions.is(pg_temp.progression() ->> 'status', 'fail',
  'a counted match without core data, 3 h to the deadline: fail even inside the window');
select extensions.is(pg_temp.progression() #>> '{gameweeks,0,reason}', 'previous_core_data_missing', 'with its own reason');
select extensions.is((pg_temp.progression() #>> '{gameweeks,0,previousMatchesWithoutCoreData}')::integer, 1,
  'and the number of matches without core data');
select extensions.alike(pg_temp.progression() ->> 'detail',
  '1 scheduled gameweek(s) need attention; see FANTASY_DURABLE_PROGRESSION_RUNBOOK.md; the previous gameweek cannot finalize while a counted match has no core player data (minutes, goals, cards)',
  'and the detail says why');
select pg_temp.deadline(interval '20 hours');
select extensions.is(pg_temp.progression() ->> 'status', 'warn', 'the same 20 h before the deadline: warn');
select pg_temp.deadline(interval '-1 hour');
select extensions.is(pg_temp.progression() #>> '{gameweeks,0,reason}', 'deadline_passed',
  'a passed deadline is deadline_passed whatever the cause');

-- The core data is back and the deadline has passed: still a failure (the
-- gameweek can no longer open on its own), never information.
select pg_temp.observe(pg_temp.fx(2), false, true);
select extensions.is(pg_temp.progression() ->> 'status', 'fail',
  'deadline passed, previous provisional with core data everywhere: fail');
select extensions.is(pg_temp.progression() #>> '{gameweeks,0,reason}', 'deadline_passed', 'as deadline_passed');
select pg_temp.deadline(interval '3 hours');
select extensions.is(pg_temp.progression() ->> 'status', 'ok', 'deadline ahead again: back to information');

-- A counted match not finished is not "waiting for full statistics".
-- (a finished match leaving 'finished' is a correction, which the fixture guard allows only under this setting)
select set_config('app.allow_fixture_correction', 'on', true);
update app.fixtures set status = 'not_started', home_score = null, away_score = null, finalized_at = null,
  kickoff_at = statement_timestamp() - interval '1 hour'
where id = pg_temp.fx(2);
select set_config('app.allow_fixture_correction', 'off', true);
select extensions.is(pg_temp.progression() ->> 'status', 'fail', 'a counted match not finished, 3 h to the deadline: fail, as before');
update app.fixtures set status = 'finished', home_score = 1, away_score = 0,
  kickoff_at = statement_timestamp() - interval '7 hours', finalized_at = statement_timestamp() - interval '5 hours'
where id = pg_temp.fx(2);

-- A finalized previous gameweek whose postwork has not completed: unchanged.
update app.fantasy_gameweeks set status = 'finalized', points_state = 'final', finalized_at = statement_timestamp()
where id = 'ed700000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.progression() ->> 'status', 'fail', 'previous finalized, successor not opened, 3 h to the deadline: fail');
select extensions.is(pg_temp.progression() #>> '{gameweeks,0,reason}', 'previous_postwork_incomplete', 'with the reason it always had');
select pg_temp.deadline(interval '30 hours');
select extensions.is(pg_temp.progression() ->> 'status', 'ok', 'a deadline more than 24 h away is not at risk');

-- Shape: the same name, the same keys.
select extensions.is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.progression()) k),
  array['detail', 'gameweeks', 'name', 'status'], 'the check keeps its keys');
select extensions.is(
  (select count(*)::integer from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' = 'fantasy_progression'),
  1, 'and appears once');

select * from extensions.finish();
rollback;
