-- Regression suite for 20261013140000_ops_health_two_stage_fantasy_stats: the
-- `fantasy_fixture_coverage` and `fantasy_scoring` health checks judge the two
-- stages SofaScore publishes statistics in apart.
--
--   fantasy_fixture_coverage: FAIL only when a counted match has NO core data
--   (a ready observation) 12 h after full time, or is still not full coverage
--   21 days after kickoff (final limited). WARN for no core data from 6 h. A
--   match with core data waiting for full statistics is information in the
--   detail text, never a warning or a failure.
--   fantasy_scoring: provisional points count as points. WARN only when core
--   points are missing 12 h (+ 1 h scoring run grace) after full time; it no
--   longer fails because points are provisional rather than final.
--
-- Nothing is sent from a test, and the rollback discards every row.
begin;
select extensions.plan(35);

create function pg_temp.check(p_name text) returns jsonb language sql as $$
  select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
  where c ->> 'name' = p_name
$$;
create function pg_temp.status(p_name text) returns text language sql as $$
  select pg_temp.check(p_name) ->> 'status'
$$;
create function pg_temp.detail(p_name text) returns text language sql as $$
  select pg_temp.check(p_name) ->> 'detail'
$$;
create function pg_temp.fx(n integer) returns uuid language sql as $$
  select ('ec900000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

-- One adaptive season; GW1 is provisional with four finished counted matches.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('ec000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('ec100000-0000-4000-8000-000000000001', 'two-stage-test', 'Two Stage Test', 'TST', 'league',
  'ec000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('ec200000-0000-4000-8000-000000000001', 'ec100000-0000-4000-8000-000000000001',
  'Two stage season', current_date - 60, current_date + 100, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
values ('ec300000-0000-4000-8000-000000000001', 'ec200000-0000-4000-8000-000000000001', 1, 'Round 1');
insert into app.teams (id, slug, name, short_name, code, country_id)
select md5('ts-club-' || n)::uuid, 'ts-club-' || n, 'Two Stage Club ' || n, 'TS' || n, 'T' || n,
  'ec000000-0000-4000-8000-000000000001'
from generate_series(1, 8) n;
insert into app.players (id, slug, full_name, display_name, position)
values ('ec800000-0000-4000-8000-000000000001', 'ts-player', 'Two Stage Player', 'TSP', 'forward');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('ec600000-0000-4000-8000-000000000001', 'ec100000-0000-4000-8000-000000000001',
  'two-stage-test', 'Two Stage Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('ec630000-0000-4000-8000-000000000001', 'ec600000-0000-4000-8000-000000000001',
  'ec200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Two stage season', 'active', current_date - 60, current_date + 100);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
values ('ecd00000-0000-4000-8000-000000000001', 'ec630000-0000-4000-8000-000000000001',
  'ec800000-0000-4000-8000-000000000001', md5('ts-club-1')::uuid,
  (select id from app.fantasy_positions where code = 'FWD'), 6);
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, finalized_at)
values ('ec700000-0000-4000-8000-000000000001', 'ec630000-0000-4000-8000-000000000001',
  'ec300000-0000-4000-8000-000000000001', 1, 'Round 1', statement_timestamp() - interval '30 days',
  statement_timestamp() - interval '29 days', statement_timestamp() + interval '1 day', 'provisional', 'provisional', null);
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at, source_sequence)
select pg_temp.fx(n), 'ec100000-0000-4000-8000-000000000001', 'ec200000-0000-4000-8000-000000000001',
  'ec300000-0000-4000-8000-000000000001', md5('ts-club-' || (2 * n - 1))::uuid, md5('ts-club-' || (2 * n))::uuid,
  statement_timestamp() - interval '15 hours', 'finished', 1, 0, statement_timestamp() - interval '13 hours',
  statement_timestamp(), 1
from generate_series(1, 4) n;
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version, frozen_at)
select 'ec630000-0000-4000-8000-000000000001', f.id, 'ec700000-0000-4000-8000-000000000001',
  'ec700000-0000-4000-8000-000000000001', f.kickoff_at, f.kickoff_at, 1, statement_timestamp() - interval '40 days'
from app.fixtures f where f.season_id = 'ec200000-0000-4000-8000-000000000001';
insert into app_private.fantasy_adaptive_policy (season_id, from_gameweek, ruleset_id)
values ('ec630000-0000-4000-8000-000000000001', 1, 'f6200000-0000-4000-8000-000000000200');

-- p_full / p_core: the observation's full_ready and simple_ready (core data).
create function pg_temp.observe(p_fixture uuid, p_full boolean, p_core boolean) returns void language sql as $$
  insert into app_private.fantasy_fixture_observations (fixture_id, observed_at, source, digest, payload,
    full_ready, simple_ready)
  values (p_fixture, statement_timestamp() - interval '1 hour', 'sportsmonks',
    encode(extensions.digest(clock_timestamp()::text || random()::text, 'sha256'), 'hex'), '{}'::jsonb,
    p_full, p_core)
$$;
-- The final whistle p_ago ago; the kickoff p_kickoff_ago ago (default: 2 h before the whistle).
create function pg_temp.whistle(p_fixture uuid, p_ago interval, p_kickoff_ago interval default null)
returns void language sql as $$
  update app.fixtures
  set finalized_at = statement_timestamp() - p_ago,
      kickoff_at = statement_timestamp() - coalesce(p_kickoff_ago, p_ago + interval '2 hours')
  where id = p_fixture
$$;
-- The scoring worker has published the match's core points (provisional).
create function pg_temp.publish(p_fixture uuid) returns void language sql as $$
  insert into app.fantasy_player_point_events (fantasy_player_id, gameweek_id, fixture_id, category, points,
    state, scoring_version, source_sequence, source_key)
  values ('ecd00000-0000-4000-8000-000000000001', 'ec700000-0000-4000-8000-000000000001', p_fixture, 'minutes', 2,
    'provisional', 2, 1, 'fixture-stats:' || p_fixture || ':player:minutes')
$$;
create function pg_temp.clean() returns void language sql as $$
  delete from app_private.fantasy_fixture_observations;
  delete from app.fantasy_player_point_events;
$$;

-- ---------------------------------------------------------------------------
-- Coverage, stage one: no core data. Warn from 6 h, fail from 12 h, as before.
-- ---------------------------------------------------------------------------
select pg_temp.whistle(pg_temp.fx(n), interval '5 hours 59 minutes') from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'ok',
  'no core data 5 h 59 min after the whistle: ok, still waiting');
select pg_temp.whistle(pg_temp.fx(n), interval '6 hours 1 minute') from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'warn', 'no core data past 6 h: warn');
select pg_temp.whistle(pg_temp.fx(n), interval '11 hours 59 minutes') from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'warn', 'at 11 h 59 min it still only warns');
select pg_temp.whistle(pg_temp.fx(n), interval '12 hours 1 minute') from generate_series(1, 4) n;
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "fail", "detail": "4 counted match(es) final 12+ h ago without complete player statistics (oldest: GW1, final 12 h ago): their Fantasy points cannot be computed"}'::jsonb,
  'no core data 12 h after full time: fail, in the wording the check has always used');

-- ---------------------------------------------------------------------------
-- Stage two: core data present, waiting for full statistics. Information only.
-- ---------------------------------------------------------------------------
select pg_temp.observe(pg_temp.fx(n), false, true) from generate_series(1, 4) n;
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "ok", "detail": "4 of 4 finished counted match(es) with core player statistics; info: 4 match(es) with core statistics waiting for full statistics (normal for up to 21 days after kickoff, not a fault)"}'::jsonb,
  'core data and no full statistics 12 h after full time: ok, reported as information');
select pg_temp.whistle(pg_temp.fx(n), interval '20 days', interval '20 days 2 hours') from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'ok',
  'still waiting for full statistics 20 days after kickoff: ok');
select pg_temp.whistle(pg_temp.fx(n), interval '20 days 23 hours 58 minutes', interval '20 days 23 hours 59 minutes')
from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'ok', '21 days less a minute after kickoff: still ok');
select pg_temp.whistle(pg_temp.fx(n), interval '21 days', interval '21 days 1 minute') from generate_series(1, 4) n;
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "fail", "detail": "4 counted match(es) with core statistics only, still without full player statistics 21+ days after kickoff (oldest: GW1, kicked off 21 days ago): final limited"}'::jsonb,
  '21 days after kickoff and still not full coverage: fail (final limited), nothing to wait for');

-- A mixed gameweek: one match completed its full statistics, one is final limited,
-- one is waiting inside the window, one has no core data at all.
select pg_temp.clean();
select pg_temp.observe(pg_temp.fx(1), true, true);
select pg_temp.observe(pg_temp.fx(2), false, true);
select pg_temp.observe(pg_temp.fx(3), false, true);
select pg_temp.whistle(pg_temp.fx(1), interval '22 days', interval '22 days 2 hours');
select pg_temp.whistle(pg_temp.fx(2), interval '22 days', interval '22 days 2 hours');
select pg_temp.whistle(pg_temp.fx(3), interval '3 days', interval '3 days 2 hours');
select pg_temp.whistle(pg_temp.fx(4), interval '5 days', interval '5 days 2 hours');
select extensions.is(pg_temp.detail('fantasy_fixture_coverage'),
  '1 counted match(es) final 12+ h ago without complete player statistics (oldest: GW1, final 120 h ago): their Fantasy points cannot be computed; 1 more counted match(es) final limited (full player statistics still missing 21+ days after kickoff); info: 1 match(es) with core statistics waiting for full statistics (normal for up to 21 days after kickoff, not a fault)',
  'no core data, a final-limited match and a waiting one together: the failure says both and counts the waiting one as information');
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail', 'and the status is fail');
-- The failing pair repaired: only the waiting match is left.
select pg_temp.observe(pg_temp.fx(4), false, true);
select pg_temp.observe(pg_temp.fx(2), true, true);
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'ok',
  'every match has core data and none is 21 days old without full statistics: ok');
select extensions.alike(pg_temp.detail('fantasy_fixture_coverage'), '%info: 2 match(es) with core statistics waiting%',
  'and the two matches still waiting are information');

-- The latest observation decides: a full-ready observation after a core-only one is full coverage.
select pg_temp.clean();
select pg_temp.observe(pg_temp.fx(n), false, true) from generate_series(1, 4) n;
select pg_temp.whistle(pg_temp.fx(n), interval '30 days', interval '30 days 2 hours') from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail', 'core only, 30 days: final limited');
select pg_temp.observe(pg_temp.fx(n), true, true) from generate_series(1, 4) n;
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "ok", "detail": "4 of 4 finished counted match(es) with complete player statistics"}'::jsonb,
  'full statistics arrived later: ok, with the usual wording and no information');

-- Not adaptive: one stage only. Certified complete statistics are core and full.
delete from app_private.fantasy_adaptive_policy;
select pg_temp.clean();
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail',
  'not adaptive and no certified statistics 30 days on: fail (no core data)');
insert into app_private.historical_performance_fixture_coverage (fixture_id, football_season_id,
  source_provider, source_version, lineup_rows_seen, valid_player_rows, excluded_incomplete_rows,
  starter_rows, team_count, detail_rows, invalid_detail_rows, performance_rows, reconciled,
  provider_observed_at, scoring_statistics_complete)
select pg_temp.fx(n), 'ec200000-0000-4000-8000-000000000001', 'sportsmonks',
  'sportsmonks-current-fixture:' || repeat('a', 64), 30, 30, 0, 22, 2, 30, 0, 30, true,
  statement_timestamp(), true
from generate_series(1, 4) n;
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "ok", "detail": "4 of 4 finished counted match(es) with complete player statistics"}'::jsonb,
  'not adaptive and certified complete, 30 days on: ok, nothing waits for a second stage');
delete from app_private.historical_performance_fixture_coverage;
insert into app_private.fantasy_adaptive_policy (season_id, from_gameweek, ruleset_id)
values ('ec630000-0000-4000-8000-000000000001', 1, 'f6200000-0000-4000-8000-000000000200');

-- ---------------------------------------------------------------------------
-- fantasy_scoring: core points, provisional or not. Warn only when they are
-- missing 12 h (+ the 1 h scoring run grace) after full time; never fail for
-- points being provisional.
-- ---------------------------------------------------------------------------
select pg_temp.clean();
select pg_temp.observe(pg_temp.fx(n), false, true) from generate_series(1, 4) n;
select pg_temp.whistle(pg_temp.fx(n), interval '12 hours 30 minutes') from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_scoring'), 'ok',
  'core data ready, 12 h 30 min after the whistle: the worker is selecting the mode, not late');
select extensions.alike(pg_temp.detail('fantasy_scoring'), 'GW1: every counted match final, core points due by __:__ UTC',
  'and the detail says when the points are due');
select pg_temp.whistle(pg_temp.fx(n), interval '13 hours 1 minute') from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn', 'no core points 13 h 1 min after the whistle: warn');
select extensions.ok(pg_temp.detail('fantasy_scoring') like 'GW1: core points missing for 4 counted match(es) 12+ h after full time (oldest final 13 h ago): no scoring run has stored anything',
  'no snapshot yet: says no scoring run has stored anything: ' || pg_temp.detail('fantasy_scoring'));

select pg_temp.publish(pg_temp.fx(n)) from generate_series(1, 4) n;
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "ok", "detail": "GW1 provisional: core points present for all 4 counted match(es); provisional points count as points"}'::jsonb,
  'provisional core points present: ok, and said to count');
select pg_temp.whistle(pg_temp.fx(n), interval '20 days', interval '20 days 2 hours') from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_scoring'), 'ok',
  '20 days later, the gameweek still provisional, full statistics still missing: scoring does not warn or fail');
select pg_temp.whistle(pg_temp.fx(n), interval '45 days', interval '45 days 2 hours') from generate_series(1, 4) n;
select extensions.is(pg_temp.status('fantasy_scoring'), 'ok',
  'nor after 45 days: the final-limited failure belongs to fantasy_fixture_coverage');

-- One match without points among matches with points.
select pg_temp.whistle(pg_temp.fx(n), interval '14 hours') from generate_series(1, 4) n;
delete from app.fantasy_player_point_events where fixture_id = pg_temp.fx(3);
select extensions.ok(pg_temp.status('fantasy_scoring') = 'warn'
    and pg_temp.detail('fantasy_scoring') like 'GW1: core points missing for 1 counted match(es) 12+ h after full time (oldest final 14 h ago): %',
  'one match without core points warns for that one: ' || pg_temp.detail('fantasy_scoring'));
select extensions.ok(pg_temp.status('fantasy_fixture_coverage') = 'ok',
  'while coverage is ok, it has core data');

-- Where the matches have no core data either, the warning points at the coverage check.
delete from app_private.fantasy_fixture_observations where fixture_id = pg_temp.fx(3);
select extensions.ok(pg_temp.detail('fantasy_scoring') like '%; 1 match(es) without core player statistics (fantasy_fixture_coverage)'
    and pg_temp.status('fantasy_fixture_coverage') = 'fail',
  'a match with no core data: coverage fails and scoring names it: ' || pg_temp.detail('fantasy_scoring'));

-- Live scoring publishes a ready match at once, so a gameweek still in play warns
-- for a final match without points; without live scoring points come after the last match.
-- (a finished match leaving 'finished' is a correction, which the fixture guard allows only under this setting)
select set_config('app.allow_fixture_correction', 'on', true);
update app.fixtures set status = 'not_started', home_score = null, away_score = null, finalized_at = null,
  kickoff_at = statement_timestamp() + interval '1 day'
where id = pg_temp.fx(4);
select set_config('app.allow_fixture_correction', 'off', true);
select extensions.ok(pg_temp.status('fantasy_scoring') = 'ok'
    and pg_temp.detail('fantasy_scoring') = 'GW1 provisional: 3 of 4 counted matches final; points come after the last one',
  'live scoring off, a match still to play: in play, ok: ' || pg_temp.detail('fantasy_scoring'));
insert into app_private.fantasy_live_scoring_policy (season_id, enabled)
values ('ec630000-0000-4000-8000-000000000001', true);
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn',
  'live scoring on: the final match without points warns although another match is still to play');
delete from app_private.fantasy_live_scoring_policy;
update app.fixtures set status = 'finished', home_score = 1, away_score = 0, kickoff_at = statement_timestamp() - interval '16 hours',
  finalized_at = statement_timestamp() - interval '14 hours'
where id = pg_temp.fx(4);

-- ---------------------------------------------------------------------------
-- The shape: same checks, same names.
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' in ('fantasy_fixture_coverage', 'fantasy_scoring')),
  2, 'one row of each check');
select extensions.ok(
  (select bool_and(c ->> 'status' in ('ok', 'warn', 'fail') and jsonb_typeof(c -> 'detail') = 'string')
   from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' in ('fantasy_fixture_coverage', 'fantasy_scoring')),
  'both keep the name, status and detail keys the alert tick and the watchdog read');
select extensions.is(app_private.fantasy_core_data_window(), interval '12 hours', 'named constant: core data window 12 h');
select extensions.is(app_private.fantasy_full_stats_window(), interval '21 days', 'named constant: full statistics window 21 days');
select extensions.is(app_private.fantasy_core_data_warn_window(), interval '6 hours', 'named constant: early warning 6 h');
select extensions.is(app_private.fantasy_scoring_run_grace(), interval '1 hour', 'named constant: scoring run grace 1 h');
select extensions.ok(not has_function_privilege('anon', 'app_private.fantasy_fixture_full_stats(uuid,uuid,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.fantasy_core_data_window()', 'execute')
  and not has_function_privilege('service_role', 'app_private.fantasy_full_stats_window()', 'execute'),
  'the helpers are not callable by API roles');

select * from extensions.finish();
rollback;
