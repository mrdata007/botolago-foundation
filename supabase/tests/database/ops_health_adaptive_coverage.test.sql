-- Regression suite for 20261011150000_ops_health_adaptive_coverage: the
-- `fantasy_fixture_coverage` and `fantasy_scoring` health checks count a
-- SofaScore/adaptive match as covered from its ready observation, without
-- waiting for the 12 h mode selection, while every non-adaptive answer stays
-- what 20260926003400 gave (a match without historical_performance coverage
-- fails 12 h after the whistle).
--
-- The "no final points" clocks of `fantasy_scoring` (warn 1 h, fail 8 h after
-- certification) were replaced by 20261013140000: core points missing 13 h
-- after the whistle warn, and provisional points never warn or fail. The
-- assertions below that concern them are updated; the full two-stage rules
-- are in ops_health_two_stage_fantasy_stats.test.sql.
begin;
select extensions.plan(20);

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

-- A season with one live gameweek holding one counted, finished match.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('ea000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('ea100000-0000-4000-8000-000000000001', 'adp-test', 'Adaptive Health Test', 'ADP', 'league',
  'ea000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('ea200000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001',
  'Adaptive health season', current_date - 10, current_date + 100, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
values ('ea300000-0000-4000-8000-000000000001', 'ea200000-0000-4000-8000-000000000001', 1, 'Round 1');
insert into app.teams (id, slug, name, short_name, code, country_id)
select md5('adp-club-' || n)::uuid, 'adp-club-' || n, 'Adaptive Club ' || n, 'AC' || n, 'A' || n,
  'ea000000-0000-4000-8000-000000000001'
from generate_series(1, 2) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('ea600000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001',
  'adp-test', 'Adaptive Health Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('ea630000-0000-4000-8000-000000000001', 'ea600000-0000-4000-8000-000000000001',
  'ea200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Adaptive health season', 'active', current_date - 10, current_date + 100);
insert into app.players (id, slug, full_name, display_name, position)
values ('ea800000-0000-4000-8000-000000000001', 'adp-player', 'Adaptive Player', 'ADP', 'forward');
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
values ('ead00000-0000-4000-8000-000000000001', 'ea630000-0000-4000-8000-000000000001',
  'ea800000-0000-4000-8000-000000000001', md5('adp-club-1')::uuid,
  (select id from app.fantasy_positions where code = 'FWD'), 6);
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, finalized_at)
values ('ea700000-0000-4000-8000-000000000001', 'ea630000-0000-4000-8000-000000000001',
  'ea300000-0000-4000-8000-000000000001', 1, 'Round 1', statement_timestamp() - interval '2 days',
  statement_timestamp() - interval '40 hours', statement_timestamp() + interval '1 day', 'live', 'provisional', null);
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at, source_sequence)
values ('ea900000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001',
  'ea200000-0000-4000-8000-000000000001', 'ea300000-0000-4000-8000-000000000001',
  md5('adp-club-1')::uuid, md5('adp-club-2')::uuid, statement_timestamp() - interval '15 hours',
  'finished', 1, 0, statement_timestamp() - interval '13 hours', statement_timestamp(), 1);
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version, frozen_at)
select 'ea630000-0000-4000-8000-000000000001', f.id, 'ea700000-0000-4000-8000-000000000001',
  'ea700000-0000-4000-8000-000000000001', f.kickoff_at, f.kickoff_at, 1, statement_timestamp() - interval '1 day'
from app.fixtures f where f.id = 'ea900000-0000-4000-8000-000000000001';

-- p_ready: the observation's simple_ready (full_ready is always false);
-- p_age: how long ago it was observed.
create function pg_temp.observe(p_ready boolean, p_age interval default interval '12 hours 30 minutes')
returns void language sql as $$
  insert into app_private.fantasy_fixture_observations (fixture_id, observed_at, source, digest, payload,
    full_ready, simple_ready)
  values ('ea900000-0000-4000-8000-000000000001', statement_timestamp() - p_age, 'sportsmonks',
    encode(extensions.digest(clock_timestamp()::text || random()::text, 'sha256'), 'hex'), '{}'::jsonb,
    false, p_ready)
$$;
-- The scoring worker has published the match's (provisional) core points.
create function pg_temp.publish() returns void language sql as $$
  insert into app.fantasy_player_point_events (fantasy_player_id, gameweek_id, fixture_id, category, points,
    state, scoring_version, source_sequence, source_key)
  values ('ead00000-0000-4000-8000-000000000001', 'ea700000-0000-4000-8000-000000000001',
    'ea900000-0000-4000-8000-000000000001', 'minutes', 2, 'provisional', 2, 1,
    'fixture-stats:ea900000-0000-4000-8000-000000000001:player:minutes')
$$;
create function pg_temp.finalized(p_ago interval) returns void language sql as $$
  update app.fixtures set finalized_at = statement_timestamp() - p_ago, kickoff_at = statement_timestamp() - p_ago - interval '2 hours'
  where id = 'ea900000-0000-4000-8000-000000000001';
$$;

-- ---------------------------------------------------------------------------
-- Not adaptive: nothing changes. No historical coverage row, 13 h after the
-- whistle: fail, as before; an observation does not make it covered.
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail',
  'not adaptive, no statistics 13 h after the whistle: fail, as before');
select pg_temp.observe(true);
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail',
  'not adaptive: a ready observation alone does not cover a match');
select extensions.ok(pg_temp.detail('fantasy_fixture_coverage') like '1 counted match(es) final 12+ h ago without complete player statistics%',
  'and the wording is the one 20260926003400 wrote');

-- ---------------------------------------------------------------------------
-- Adaptive from GW1 (policy row), no mode selected yet.
-- ---------------------------------------------------------------------------
insert into app_private.fantasy_adaptive_policy (season_id, from_gameweek, ruleset_id)
values ('ea630000-0000-4000-8000-000000000001', 1, 'f6200000-0000-4000-8000-000000000200');
select extensions.ok(app_private.fantasy_adaptive_enabled('ea700000-0000-4000-8000-000000000001'),
  'the gameweek is adaptive');
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "ok", "detail": "1 of 1 finished counted match(es) with core player statistics; info: 1 match(es) with core statistics waiting for full statistics (normal for up to 21 days after kickoff, not a fault)"}'::jsonb,
  'adaptive, 13 h after the whistle, ready observation, mode not selected yet: covered, ok (the wait for full statistics is information)');

delete from app_private.fantasy_fixture_observations;
select pg_temp.observe(false);
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail',
  'adaptive but the observation is not ready: still a failure at 13 h');
select extensions.ok(pg_temp.detail('fantasy_fixture_coverage') like '1 counted match(es) final 12+ h ago without complete player statistics%',
  'with the same wording');

delete from app_private.fantasy_fixture_observations;
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail',
  'adaptive without any observation: a failure at 13 h');

-- A later ready observation replaces an earlier unready one (the latest counts).
select pg_temp.observe(false, interval '3 hours');
select pg_temp.observe(true, interval '1 hour');
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'ok',
  'the latest observation decides: unready then ready is covered');
select pg_temp.observe(false, interval '10 minutes');
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail',
  'and ready then unready is not');
delete from app_private.fantasy_fixture_observations;
select pg_temp.observe(true);

-- 6 h to warn still applies to a match that is not ready.
select pg_temp.finalized(interval '7 hours');
delete from app_private.fantasy_fixture_observations;
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'warn',
  'adaptive without a ready observation: warns from 6 h, as for any match');
select pg_temp.observe(true);
select pg_temp.finalized(interval '13 hours');

-- A selected mode defers to the adaptive readiness answer, unchanged.
insert into app_private.fantasy_fixture_scoring_modes (gameweek_id, fixture_id, cutoff_at, mode, selected_at, reason)
values ('ea700000-0000-4000-8000-000000000001', 'ea900000-0000-4000-8000-000000000001',
  statement_timestamp() - interval '1 hour', 'full', statement_timestamp() - interval '1 hour', 'complete_at_cutoff');
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail',
  'a selected full mode whose observation is only simple-ready is not covered');
update app_private.fantasy_fixture_scoring_modes set mode = 'simple', reason = 'detailed_statistics_incomplete';
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'ok',
  'a selected simple mode with a simple-ready observation is covered');
delete from app_private.fantasy_fixture_scoring_modes;

-- ---------------------------------------------------------------------------
-- fantasy_scoring: core points cannot exist before the 12 h selection cutoff.
-- Since 20261013140000 it warns when a match's core points are still missing
-- 12 h + 1 h (the scoring run) after the whistle, and never fails for points
-- being provisional.
-- ---------------------------------------------------------------------------
delete from app_private.fantasy_fixture_observations;
select pg_temp.finalized(interval '9 hours');
select pg_temp.observe(true, interval '8 hours');
select extensions.is(pg_temp.status('fantasy_scoring'), 'ok',
  'adaptive, ready 8 h ago, 9 h after the whistle: points are due after the cutoff, not late');
select extensions.alike(pg_temp.detail('fantasy_scoring'), 'GW1: every counted match final, core points due by __:__ UTC',
  'and says when they are due');

select pg_temp.finalized(interval '19 hours');
delete from app_private.fantasy_fixture_observations;
select pg_temp.observe(true, interval '18 hours');
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn',
  '19 h after the whistle, no core points yet: warns');

select pg_temp.finalized(interval '21 hours');
delete from app_private.fantasy_fixture_observations;
select pg_temp.observe(true, interval '20 hours');
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn',
  '21 h after the whistle, still no core points: still only a warning (it no longer fails)');

select pg_temp.publish();
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "ok", "detail": "GW1 live: core points present for all 1 counted match(es); provisional points count as points"}'::jsonb,
  'with provisional core points published it is ok, however old the match');
delete from app.fantasy_player_point_events;

-- Not adaptive: the statistics answer is unchanged.
delete from app_private.fantasy_adaptive_policy;
delete from app_private.fantasy_fixture_observations;
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn',
  'not adaptive and no statistics: the statistics warning, as before');
select extensions.is(
  (select count(*)::integer from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' in ('fantasy_fixture_coverage', 'fantasy_scoring')),
  2, 'the output shape is unchanged: one row of each check');

select * from extensions.finish();
rollback;
