-- Regression suite for 20260925210400_ops_health_fantasy_coverage_and_scoring:
-- the `fantasy_fixture_coverage` and `fantasy_scoring` health checks at each
-- ok / warn / fail boundary (statistics: warn 6 h, fail 12 h after the final
-- whistle; a counted match stuck unfinished: warn 3 h, fail 6 h after its due
-- end; one called off or moved after the lock: a warning that never fails;
-- points: warn 1 h, fail 8 h after the last statistics were certified), with
-- several gameweeks at once, their way through the alert tick, and the
-- owner's test message. Nothing is sent from a test: pg_net only queues the
-- request, and the rollback at the end discards the queue rows.
begin;
select extensions.plan(87);

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

-- ---------------------------------------------------------------------------
-- Shape: the two checks sit with the Fantasy checks; every earlier one stays.
-- ---------------------------------------------------------------------------
select extensions.is(
  (select array_agg(c ->> 'name' order by ordinality)
   from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') with ordinality as t(c, ordinality)),
  array['fantasy_lifecycle_tick', 'fantasy_gameweek_lock', 'fantasy_fixture_coverage', 'fantasy_scoring',
    'cron_jobs', 'news_publication', 'news_sitemap', 'news_import', 'live_scores', 'provider_refresh',
    'email_delivery', 'browser_errors'],
  'health lists the two new checks after the Fantasy ones, and every earlier check (no season yet, so no deadline watch)');
select extensions.ok(
  'fantasy_fixture_coverage' ~ '^[a-z][a-z0-9_]{1,60}$' and 'fantasy_scoring' ~ '^[a-z][a-z0-9_]{1,60}$',
  'both names pass the watchdog''s name filter (scripts/ops/watchdog.ts), which reports every such check');
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "ok", "detail": "no finished match counts for Fantasy points yet"}'::jsonb,
  'coverage: nothing to check is ok');
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "ok", "detail": "no gameweek in play or waiting for points"}'::jsonb,
  'scoring: nothing to score is ok');
select extensions.ok(not has_function_privilege('service_role', 'app_private.ops_health_checks()', 'execute')
  and has_function_privilege('service_role', 'api.service_ops_health()', 'execute')
  and not has_function_privilege('anon', 'api.service_ops_health()', 'execute')
  and not has_function_privilege('authenticated', 'api.service_ops_health()', 'execute'),
  'access is unchanged: the watchdog reads health through api.service_ops_health, nobody else');

-- ---------------------------------------------------------------------------
-- A season: GW1 settled, GW2 live with three counted matches.
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('e0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('e1000000-0000-4000-8000-000000000001', 'cov-test', 'Coverage Test', 'COV', 'league',
  'e0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
  'Coverage season', current_date - 10, current_date + 100, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
select ('e3000000-0000-4000-8000-00000000000' || n)::uuid, 'e2000000-0000-4000-8000-000000000001', n, 'Round ' || n
from generate_series(1, 3) n;
insert into app.teams (id, slug, name, short_name, code, country_id)
select md5('cov-club-' || n)::uuid, 'cov-club-' || n, 'Coverage Club ' || n, 'CC' || n, 'C' || n,
  'e0000000-0000-4000-8000-000000000001'
from generate_series(1, 8) n;
insert into app.players (id, slug, full_name, display_name, position)
values ('e8000000-0000-4000-8000-000000000001', 'cov-player', 'Coverage Player', 'CP', 'forward');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('e6000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
  'cov-test', 'Coverage Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('e6300000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Coverage season', 'active', current_date - 10, current_date + 100);
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, finalized_at)
values
  ('e7000000-0000-4000-8000-000000000001', 'e6300000-0000-4000-8000-000000000001',
   'e3000000-0000-4000-8000-000000000001', 1, 'Round 1', statement_timestamp() - interval '8 days',
   statement_timestamp() - interval '7 days', statement_timestamp() - interval '6 days', 'finalized', 'final',
   statement_timestamp() - interval '5 days'),
  ('e7000000-0000-4000-8000-000000000002', 'e6300000-0000-4000-8000-000000000001',
   'e3000000-0000-4000-8000-000000000002', 2, 'Round 2', statement_timestamp() - interval '1 day',
   statement_timestamp() - interval '20 hours', statement_timestamp() + interval '2 days', 'live', 'provisional', null);

-- Fixtures: e90..01 settled in GW1 (no statistics, never looked at again);
-- e90..11-13 counted in GW2 (11 finished, 12 kicks off in 2 h, 13 tomorrow);
-- e90..14 was in GW2 but deferred (superseded, not counted), long finished and
-- without statistics.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at, source_sequence)
values
  ('e9000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
   md5('cov-club-1')::uuid, md5('cov-club-2')::uuid, statement_timestamp() - interval '7 days',
   'finished', 1, 0, statement_timestamp() - interval '7 days' + interval '2 hours', statement_timestamp(), 1),
  ('e9000000-0000-4000-8000-000000000011', 'e1000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000002',
   md5('cov-club-1')::uuid, md5('cov-club-2')::uuid, statement_timestamp() - interval '15 hours',
   'finished', 1, 3, statement_timestamp() - interval '5 hours 59 minutes', statement_timestamp(), 1),
  ('e9000000-0000-4000-8000-000000000012', 'e1000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000002',
   md5('cov-club-3')::uuid, md5('cov-club-4')::uuid, statement_timestamp() + interval '2 hours',
   'not_started', null, null, null, statement_timestamp(), 1),
  ('e9000000-0000-4000-8000-000000000013', 'e1000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000002',
   md5('cov-club-5')::uuid, md5('cov-club-6')::uuid, statement_timestamp() + interval '1 day',
   'not_started', null, null, null, statement_timestamp(), 1),
  ('e9000000-0000-4000-8000-000000000014', 'e1000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000002',
   md5('cov-club-7')::uuid, md5('cov-club-8')::uuid, statement_timestamp() - interval '20 hours',
   'finished', 0, 0, statement_timestamp() - interval '18 hours', statement_timestamp(), 1);
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version, frozen_at)
select 'e6300000-0000-4000-8000-000000000001', f.id,
  case when f.id = 'e9000000-0000-4000-8000-000000000001'
    then 'e7000000-0000-4000-8000-000000000001'::uuid else 'e7000000-0000-4000-8000-000000000002'::uuid end,
  case when f.id = 'e9000000-0000-4000-8000-000000000001'
    then 'e7000000-0000-4000-8000-000000000001'::uuid else 'e7000000-0000-4000-8000-000000000002'::uuid end,
  f.kickoff_at, f.kickoff_at, 1, statement_timestamp() - interval '1 day'
from app.fixtures f where f.season_id = 'e2000000-0000-4000-8000-000000000001';
update app.fantasy_fixture_assignments
set superseded_at = statement_timestamp(), assignment_status = 'deferred',
    resolution = 'provider_postponed', counts_points = false
where fixture_id = 'e9000000-0000-4000-8000-000000000014';

-- Statistics certified as the strict current-season import
-- (api.ingest_current_player_fixture_performance) certifies them: a new
-- source version's performance rows, the earlier ones deactivated, and the
-- coverage row upserted in place (its created_at kept). p_since is how long
-- ago the certification happened; it lands on the performance rows, which is
-- where the check reads it.
create function pg_temp.certify(p_fixture uuid, p_since interval) returns void language plpgsql as $$
declare
  version text := 'sportsmonks-current-fixture:'
    || encode(extensions.digest(p_fixture::text || clock_timestamp()::text, 'sha256'), 'hex');
begin
  update app.player_fixture_performances set active = false where fixture_id = p_fixture and active;
  insert into app.player_fixture_performances (football_season_id, fixture_id, player_id, team_id, position,
    source_provider, source_version, started, appeared, minutes, goals, assists, clean_sheets,
    goals_conceded, saves, penalties_saved, penalties_missed, yellow_cards, red_cards,
    second_yellow_dismissals, own_goals, provider_observed_at, created_at)
  values ((select season_id from app.fixtures where id = p_fixture), p_fixture, 'e8000000-0000-4000-8000-000000000001',
    md5('cov-club-1')::uuid, 'forward', 'sportsmonks', version, true, true, 90, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, statement_timestamp(), statement_timestamp() - p_since);
  insert into app_private.historical_performance_fixture_coverage (fixture_id, football_season_id,
    source_provider, source_version, lineup_rows_seen, valid_player_rows, excluded_incomplete_rows,
    starter_rows, team_count, detail_rows, invalid_detail_rows, performance_rows, reconciled,
    provider_observed_at, scoring_statistics_complete)
  values (p_fixture, (select season_id from app.fixtures where id = p_fixture), 'sportsmonks', version,
    30, 30, 0, 22, 2, 30, 0, 30, true, statement_timestamp(), true)
  on conflict (fixture_id) do update set source_version = excluded.source_version, reconciled = true,
    provider_observed_at = excluded.provider_observed_at, scoring_statistics_complete = true;
end;
$$;

-- ---------------------------------------------------------------------------
-- fantasy_fixture_coverage: 6 h to warn, 12 h to fail. GitHub has left 6.3 h
-- between orchestrator runs, so 6 h without statistics is an ordinary night.
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "ok", "detail": "0 of 1 finished counted match(es) with complete player statistics (the others final under 6 h ago)"}'::jsonb,
  'a match final 5 h 59 min ago without statistics is ok; the settled GW1 match and the deferred one are not counted');

update app.fixtures set finalized_at = statement_timestamp() - interval '6 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000011';
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "warn", "detail": "1 counted match(es) final 6+ h ago without complete player statistics (oldest: GW2, final 6 h ago)"}'::jsonb,
  'past 6 h it warns, naming the gameweek and the age');
update app.fixtures set finalized_at = statement_timestamp() - interval '11 hours 59 minutes'
where id = 'e9000000-0000-4000-8000-000000000011';
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'warn', 'at 11 h 59 min it still only warns');

update app.fixtures set finalized_at = statement_timestamp() - interval '12 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000011';
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "fail", "detail": "1 counted match(es) final 12+ h ago without complete player statistics (oldest: GW2, final 12 h ago): their Fantasy points cannot be computed"}'::jsonb,
  'past 12 h it fails (and so pages): the 1-3 match of 2026-09-24, at 10:00 UTC the next morning');
select extensions.is(pg_temp.status('fantasy_scoring'), 'ok',
  'while the gameweek still has matches to play, scoring is not late');
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'GW2 live: 1 of 3 counted matches final; points come after the last one',
  'and says how far the gameweek has got');

-- ---------------------------------------------------------------------------
-- fantasy_scoring: an unfinished counted match is play only while it can
-- still finish on its own. A match still not started, live or suspended long
-- after its due end is stuck, and fails; one called off or moved after the
-- lock only warns, since no tool can free its gameweek yet.
-- ---------------------------------------------------------------------------
update app.fixtures set kickoff_at = statement_timestamp() - interval '4 hours 59 minutes'
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'GW2 live: 1 of 3 counted matches final; points come after the last one',
  'a match not started 4 h 59 min after its kickoff (due end 2 h 59 min ago) is still play');
update app.fixtures set kickoff_at = statement_timestamp() - interval '5 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "warn", "detail": "GW2: counted match CC3 v CC4 still not_started 5 h after its kickoff; points wait until it finishes or its Fantasy assignment is resolved"}'::jsonb,
  '3 h past its due end (kickoff + 2 h) it warns, naming the match and its status');
update app.fixtures set kickoff_at = statement_timestamp() - interval '7 hours 59 minutes'
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn', '5 h 59 min past its due end it still warns');
update app.fixtures set kickoff_at = statement_timestamp() - interval '8 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "fail", "detail": "GW2: counted match CC3 v CC4 still not_started 8 h after its kickoff; points wait until it finishes or its Fantasy assignment is resolved"}'::jsonb,
  '6 h past its due end it fails: the row has stopped following the match, and a provider refresh can correct it');
update app.fixtures set status = 'live_second_half', home_score = 1, away_score = 1
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.check('fantasy_scoring') ->> 'status' || ': ' || pg_temp.detail('fantasy_scoring'),
  'fail: GW2: counted match CC3 v CC4 still live_second_half 8 h after its kickoff; points wait until it finishes or its Fantasy assignment is resolved',
  'a match stuck live fails the same way');
update app.fixtures set kickoff_at = statement_timestamp() - interval '1 hour'
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'GW2 live: 1 of 3 counted matches final; points come after the last one',
  'a match live an hour after its kickoff is play');

-- Postponed after the lock: it will not finish here, whatever its kickoff says.
update app.fixtures set status = 'postponed', home_score = null, away_score = null,
  kickoff_at = date_trunc('day', statement_timestamp()) + interval '20 days'
where id = 'e9000000-0000-4000-8000-000000000012';
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() + interval '1 day'
where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null;
select extensions.is(pg_temp.check('fantasy_scoring'),
  jsonb_build_object('name', 'fantasy_scoring', 'status', 'warn', 'detail',
    'GW2: counted match CC3 v CC4 postponed after the lock (due '
    || (select to_char(assigned_kickoff_at at time zone 'UTC', 'DD Mon HH24:MI') from app.fantasy_fixture_assignments
        where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null)
    || ' UTC); points wait until it finishes or its Fantasy assignment is resolved'),
  'a counted match postponed after the lock warns at once, even before the kickoff it was frozen with');
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '8 hours 1 minute'
where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null;
select extensions.is(pg_temp.check('fantasy_scoring'),
  jsonb_build_object('name', 'fantasy_scoring', 'status', 'warn', 'detail',
    'GW2: counted match CC3 v CC4 postponed after the lock (due '
    || (select to_char(assigned_kickoff_at at time zone 'UTC', 'DD Mon HH24:MI') from app.fantasy_fixture_assignments
        where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null)
    || ' UTC); points wait until it finishes or its Fantasy assignment is resolved'),
  'and still only warns 6 h after the end it was due at its frozen kickoff: nothing can free the gameweek yet');
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '3 days'
where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null;
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn',
  'however long it lasts: it never pages hourly for a decision no tool can apply');

-- Moved past the gameweek's window (still not_started): the same hold.
update app.fixtures set status = 'not_started', kickoff_at = statement_timestamp() + interval '1 day'
where id = 'e9000000-0000-4000-8000-000000000012';
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() + interval '2 hours'
where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null;
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'GW2 live: 1 of 3 counted matches final; points come after the last one',
  'a kickoff moved a day later but inside the gameweek''s window is play');
update app.fixtures set kickoff_at = statement_timestamp() + interval '5 days'
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.check('fantasy_scoring'),
  jsonb_build_object('name', 'fantasy_scoring', 'status', 'warn', 'detail',
    'GW2: counted match CC3 v CC4 moved to '
    || (select to_char(kickoff_at at time zone 'UTC', 'DD Mon HH24:MI') from app.fixtures
        where id = 'e9000000-0000-4000-8000-000000000012')
    || ' UTC, past the gameweek''s window (due '
    || (select to_char(assigned_kickoff_at at time zone 'UTC', 'DD Mon HH24:MI') from app.fantasy_fixture_assignments
        where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null)
    || ' UTC); points wait until it finishes or its Fantasy assignment is resolved'),
  'moved past the window (ends_at) it warns at once');
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '8 hours 1 minute'
where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null;
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn',
  'and still only warns 6 h after the end it was due at its frozen kickoff');

-- The review's case: one match final, one postponed 28 h ago, one cancelled
-- 27 h ago. It used to read "1 of 3 counted matches final ... ok" for ever.
update app.fixtures set status = 'postponed', kickoff_at = date_trunc('day', statement_timestamp()) + interval '20 days'
where id = 'e9000000-0000-4000-8000-000000000012';
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '28 hours'
where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null;
update app.fixtures set status = 'cancelled', kickoff_at = statement_timestamp() - interval '27 hours'
where id = 'e9000000-0000-4000-8000-000000000013';
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '27 hours'
where fixture_id = 'e9000000-0000-4000-8000-000000000013' and superseded_at is null;
select extensions.ok(pg_temp.status('fantasy_scoring') = 'warn'
  and pg_temp.detail('fantasy_scoring') like 'GW2: counted match CC3 v CC4 postponed after the lock (due % UTC); points wait until it finishes or its Fantasy assignment is resolved (+1 more match(es))',
  'a gameweek held by a postponed and a cancelled match warns, naming the older and counting the other: '
    || pg_temp.detail('fantasy_scoring'));

-- Held both ways: the stuck match is the one that fails, and the one named.
update app.fixtures set status = 'not_started', kickoff_at = statement_timestamp() - interval '8 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000012';
update app.fantasy_fixture_assignments set assigned_kickoff_at = statement_timestamp() - interval '8 hours 1 minute'
where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null;
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "fail", "detail": "GW2: counted match CC3 v CC4 still not_started 8 h after its kickoff; points wait until it finishes or its Fantasy assignment is resolved (+1 more match(es))"}'::jsonb,
  'a match stuck unfinished fails the gameweek and is named before an older cancelled one, which is counted');

-- Both rescheduled inside the window: play again.
select set_config('app.allow_fixture_correction', 'on', true);
update app.fixtures set status = 'not_started', kickoff_at = statement_timestamp() + interval '1 day'
where id = 'e9000000-0000-4000-8000-000000000013';
select set_config('app.allow_fixture_correction', 'off', true);
update app.fixtures set status = 'not_started', kickoff_at = statement_timestamp() + interval '2 hours'
where id = 'e9000000-0000-4000-8000-000000000012';
update app.fantasy_fixture_assignments a set assigned_kickoff_at = f.kickoff_at
from app.fixtures f
where f.id = a.fixture_id and a.superseded_at is null
  and f.id in ('e9000000-0000-4000-8000-000000000012', 'e9000000-0000-4000-8000-000000000013');
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "ok", "detail": "GW2 live: 1 of 3 counted matches final; points come after the last one"}'::jsonb,
  'rescheduled inside the window, the gameweek is play again');

-- An uncertified coverage row is not coverage.
insert into app_private.historical_performance_fixture_coverage (fixture_id, football_season_id,
  source_provider, source_version, lineup_rows_seen, valid_player_rows, excluded_incomplete_rows,
  starter_rows, team_count, detail_rows, invalid_detail_rows, performance_rows, reconciled,
  provider_observed_at)
values ('e9000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000001', 'sportsmonks',
  'sportsmonks-fixture:' || repeat('b', 64), 30, 30, 0, 22, 2, 30, 0, 30, true, statement_timestamp());
select extensions.is(pg_temp.detail('fantasy_fixture_coverage'),
  '1 counted match(es) final 12+ h ago without complete player statistics (oldest: GW2, final 12 h ago; 1 with partial statistics): their Fantasy points cannot be computed',
  'a coverage row not certified for scoring still fails, and is called partial');
update app_private.historical_performance_fixture_coverage
set source_version = 'sportsmonks-current-fixture:' || repeat('c', 64), reconciled = false
where fixture_id = 'e9000000-0000-4000-8000-000000000011';
-- (A row certified complete is reconciled by constraint:
-- current_performance_coverage_complete_check.)
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail',
  'as does a current-season row that is neither reconciled nor certified complete');

select pg_temp.certify('e9000000-0000-4000-8000-000000000011', interval '2 hours');
select extensions.is(pg_temp.check('fantasy_fixture_coverage'),
  '{"name": "fantasy_fixture_coverage", "status": "ok", "detail": "1 of 1 finished counted match(es) with complete player statistics"}'::jsonb,
  'certified statistics (scoring_statistics_complete and reconciled) make it ok');

-- A finished match with no recorded final time: kickoff + 2 h stands in.
update app.fixtures set status = 'finished', home_score = 2, away_score = 2,
  kickoff_at = statement_timestamp() - interval '7 hours 59 minutes'
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'ok',
  'without finalized_at, a match that kicked off 7 h 59 min ago counts as final 5 h 59 min ago');
update app.fixtures set kickoff_at = statement_timestamp() - interval '8 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'warn',
  'and as final 6 h 1 min ago two minutes of kickoff later');
update app.fixtures set kickoff_at = statement_timestamp() - interval '14 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000012';
select extensions.is(pg_temp.check('fantasy_fixture_coverage') ->> 'status' || ': ' || pg_temp.detail('fantasy_fixture_coverage'),
  'fail: 1 counted match(es) final 12+ h ago without complete player statistics (oldest: GW2, final 12 h ago): their Fantasy points cannot be computed',
  'and fails 14 h 1 min after kickoff');
update app.fixtures set kickoff_at = statement_timestamp() - interval '13 hours',
  finalized_at = statement_timestamp() - interval '11 hours'
where id = 'e9000000-0000-4000-8000-000000000012';
select pg_temp.certify('e9000000-0000-4000-8000-000000000012', interval '3 hours');

-- ---------------------------------------------------------------------------
-- fantasy_scoring once every counted match is final. While a match lacks
-- statistics: due until 6 h after the last whistle, then a warning (the
-- coverage check is the one that fails). Once all are certified: due for an
-- hour, then a warning, and a failure 8 h after the last certification.
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'GW2 live: 2 of 3 counted matches final; points come after the last one',
  'two of three final: still in play, ok');

-- On a whole minute plus 30 s, so the due time printed to the minute is exact.
update app.fixtures set status = 'finished', home_score = 0, away_score = 1,
  kickoff_at = statement_timestamp() - interval '8 hours',
  finalized_at = date_trunc('minute', statement_timestamp()) - interval '2 hours' + interval '30 seconds'
where id = 'e9000000-0000-4000-8000-000000000013';
select extensions.is(pg_temp.status('fantasy_scoring'), 'ok',
  'every match final, the last 2 h ago: points are due, not late');
select extensions.ok(pg_temp.detail('fantasy_scoring') ~ '^GW2: every counted match final, points due by \d\d:\d\d UTC$',
  'and says by when: ' || pg_temp.detail('fantasy_scoring'));
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'GW2: every counted match final, points due by '
    || (select to_char((finalized_at + interval '6 hours') at time zone 'UTC', 'HH24:MI') from app.fixtures
        where id = 'e9000000-0000-4000-8000-000000000013') || ' UTC',
  'which, while a match lacks statistics, is 6 h after the last final whistle');

update app.fixtures set finalized_at = statement_timestamp() - interval '5 hours 59 minutes'
where id = 'e9000000-0000-4000-8000-000000000013';
select extensions.is(pg_temp.status('fantasy_scoring'), 'ok', 'at 5 h 59 min it is still due');
update app.fixtures set finalized_at = statement_timestamp() - interval '6 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000013';
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "warn", "detail": "GW2: every counted match final for 6 h, no points yet: 1 match(es) still without complete player statistics (fantasy_fixture_coverage)"}'::jsonb,
  'past 6 h with a match still lacking statistics it warns and points at the coverage check');
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'warn',
  'which warns for that match too: neither pages yet');
update app.fixtures set kickoff_at = statement_timestamp() - interval '14 hours',
  finalized_at = statement_timestamp() - interval '12 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000013';
select extensions.ok(pg_temp.status('fantasy_fixture_coverage') = 'fail' and pg_temp.status('fantasy_scoring') = 'warn',
  'past 12 h the coverage check fails for that match and scoring stays a warning: the cause pages once, not twice');
update app.fixtures set kickoff_at = statement_timestamp() - interval '8 hours',
  finalized_at = statement_timestamp() - interval '6 hours 1 minute'
where id = 'e9000000-0000-4000-8000-000000000013';

select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '59 minutes');
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'GW2: every counted match final, points due by '
    || (select to_char((min(created_at) + interval '1 hour') at time zone 'UTC', 'HH24:MI')
        from app.player_fixture_performances
        where fixture_id = 'e9000000-0000-4000-8000-000000000013' and active) || ' UTC',
  'statistics certified 59 min ago: the run that brought them may still be scoring, so points are due an hour after them');
select extensions.is(pg_temp.status('fantasy_scoring'), 'ok', 'and it is ok');

select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '61 minutes');
select extensions.is(pg_temp.check('fantasy_scoring'),
  jsonb_build_object('name', 'fantasy_scoring', 'status', 'warn', 'detail',
    'GW2: statistics complete for 1 h, no final points yet (still live, not handed to scoring): '
    || 'only a Fantasy season orchestrator run scores; fails at '
    || (select to_char((min(created_at) + interval '8 hours') at time zone 'UTC', 'HH24:MI')
        from app.player_fixture_performances
        where fixture_id = 'e9000000-0000-4000-8000-000000000013' and active) || ' UTC'),
  'an hour after the last statistics it warns, says what scores and when it fails: statistics certified outside a run wait for the next one');
select extensions.is(pg_temp.check('fantasy_fixture_coverage') ->> 'detail',
  '3 of 3 finished counted match(es) with complete player statistics',
  'while coverage is ok');

-- 8 h after the last certification. (Every match final before it was
-- certified, as in production.)
update app.fixtures set kickoff_at = statement_timestamp() - interval '11 hours',
  finalized_at = statement_timestamp() - interval '9 hours'
where id = 'e9000000-0000-4000-8000-000000000013';
select pg_temp.certify('e9000000-0000-4000-8000-000000000011', interval '10 hours');
select pg_temp.certify('e9000000-0000-4000-8000-000000000012', interval '10 hours');
select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '7 hours 59 minutes');
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn',
  '7 h 59 min after the last certification it still warns: GitHub has left 6.3 h between orchestrator runs');
select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '8 hours 1 minute');
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "fail", "detail": "GW2: every counted match final for 9 h, statistics complete for 8 h, no final points: still live, not handed to scoring"}'::jsonb,
  '8 h after the last certification it fails and names the stage');

-- The clock runs from when the current statistics were certified: not from
-- the coverage row's created_at (an earlier uncertified import may have set
-- it), and not from its updated_at (every re-observation moves it).
update app_private.historical_performance_fixture_coverage set provider_observed_at = statement_timestamp()
where fixture_id = 'e9000000-0000-4000-8000-000000000013';
select extensions.is(pg_temp.status('fantasy_scoring'), 'fail',
  'a re-observation of the same statistics (updated_at moves) does not restart the clock');
update app_private.historical_performance_fixture_coverage set created_at = statement_timestamp() - interval '10 hours'
where fixture_id in ('e9000000-0000-4000-8000-000000000011', 'e9000000-0000-4000-8000-000000000012',
  'e9000000-0000-4000-8000-000000000013');
select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '30 minutes');
select extensions.is(pg_temp.status('fantasy_scoring'), 'ok',
  'a new statistics version certified 30 min ago into a coverage row created 10 h ago: points are due, not late');

-- ---------------------------------------------------------------------------
-- Several gameweeks at once. A season has one gameweek past its lock at a
-- time (fantasy_gameweeks_one_current_idx), so that takes a second Fantasy
-- competition: a cup whose GW1 is locked, with one match final 13 h ago and
-- certified 9 h ago. Gameweeks are then named with their season; the most
-- severe is reported, then the earliest deadline, with how many more fail.
-- ---------------------------------------------------------------------------
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('e1000000-0000-4000-8000-000000000002', 'cov-cup', 'Coverage Cup', 'CUP', 'cup',
  'e0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002',
  'Cup season', current_date - 10, current_date + 100, 'active', false);
insert into app.rounds (id, season_id, round_number, name)
values ('e3000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000002', 1, 'Cup round 1');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('e6000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002',
  'cov-cup', 'Coverage Cup', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('e6300000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000002',
  'e2000000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000100',
  'Cup', 'active', current_date - 10, current_date + 100);
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, finalized_at)
values ('e7000000-0000-4000-8000-000000000000', 'e6300000-0000-4000-8000-000000000002',
  'e3000000-0000-4000-8000-000000000011', 1, 'Cup round 1', statement_timestamp() - interval '16 hours',
  statement_timestamp() - interval '15 hours', statement_timestamp() + interval '1 day', 'locked', 'provisional', null);
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at, source_sequence)
values
  ('e9000000-0000-4000-8000-000000000016', 'e1000000-0000-4000-8000-000000000002',
   'e2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000011',
   md5('cov-club-1')::uuid, md5('cov-club-2')::uuid, statement_timestamp() - interval '15 hours',
   'finished', 0, 0, statement_timestamp() - interval '13 hours', statement_timestamp(), 1),
  ('e9000000-0000-4000-8000-000000000017', 'e1000000-0000-4000-8000-000000000002',
   'e2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000011',
   md5('cov-club-5')::uuid, md5('cov-club-6')::uuid, statement_timestamp() - interval '8 hours 1 minute',
   'not_started', null, null, null, statement_timestamp(), 1);
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version, frozen_at)
select 'e6300000-0000-4000-8000-000000000002', f.id, 'e7000000-0000-4000-8000-000000000000',
  'e7000000-0000-4000-8000-000000000000', f.kickoff_at, f.kickoff_at, 1, statement_timestamp() - interval '16 hours'
from app.fixtures f where f.id = 'e9000000-0000-4000-8000-000000000016';
select pg_temp.certify('e9000000-0000-4000-8000-000000000016', interval '9 hours');

select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "fail", "detail": "Cup GW1: every counted match final for 13 h, statistics complete for 9 h, no final points: still locked, not handed to scoring"}'::jsonb,
  'a failing cup gameweek is reported over a league gameweek whose points are only due, named with its season and its locked stage');
select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '8 hours 1 minute');
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'Coverage season GW2: every counted match final for 9 h, statistics complete for 8 h, no final points: still live, not handed to scoring (+1 more gameweek(s))',
  'with both failing, the earlier deadline (league GW2) is reported and the other counted');

insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version, frozen_at)
select 'e6300000-0000-4000-8000-000000000002', f.id, 'e7000000-0000-4000-8000-000000000000',
  'e7000000-0000-4000-8000-000000000000', f.kickoff_at, f.kickoff_at, 1, statement_timestamp() - interval '16 hours'
from app.fixtures f where f.id = 'e9000000-0000-4000-8000-000000000017';
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'Coverage season GW2: every counted match final for 9 h, statistics complete for 8 h, no final points: still live, not handed to scoring (+1 more gameweek(s))',
  'a cup gameweek stalled by an unplayed match counts among the failing ones');
select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '30 minutes');
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "fail", "detail": "Cup GW1: counted match CC5 v CC6 still not_started 8 h after its kickoff; points wait until it finishes or its Fantasy assignment is resolved"}'::jsonb,
  'and is reported, stall first, once the league gameweek is only due');
delete from app_private.historical_performance_fixture_coverage
where fixture_id = 'e9000000-0000-4000-8000-000000000016';
select extensions.is(pg_temp.detail('fantasy_fixture_coverage'),
  '1 counted match(es) final 12+ h ago without complete player statistics (oldest: Cup GW1, final 13 h ago): their Fantasy points cannot be computed',
  'the coverage check names the season too when two are watched');

-- The cup closed: one season watched again, gameweeks named as before.
update app.fantasy_seasons set status = 'completed' where id = 'e6300000-0000-4000-8000-000000000002';
select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '8 hours 1 minute');
select extensions.is(pg_temp.detail('fantasy_scoring'),
  'GW2: every counted match final for 9 h, statistics complete for 8 h, no final points: still live, not handed to scoring',
  'a closed season leaves both checks');

update app.fantasy_gameweeks set status = 'provisional' where id = 'e7000000-0000-4000-8000-000000000002';
select extensions.ok(pg_temp.status('fantasy_scoring') = 'fail'
  and pg_temp.detail('fantasy_scoring') like '%no final points: no scoring run has stored anything',
  'provisional with no scoring snapshot: no scoring run has stored anything (not "zero points")');
insert into app_private.fantasy_scoring_snapshots (gameweek_id, calculation_version, input_digest, payload)
values ('e7000000-0000-4000-8000-000000000002', 1, repeat('d', 64), '{}'::jsonb);
select extensions.ok(pg_temp.status('fantasy_scoring') = 'fail'
  and pg_temp.detail('fantasy_scoring') like '%no final points: scoring started, not finished',
  'provisional with a snapshot: scoring started, not finished');
update app.fantasy_gameweeks set status = 'finalizing' where id = 'e7000000-0000-4000-8000-000000000002';
select extensions.ok(pg_temp.status('fantasy_scoring') = 'fail'
  and pg_temp.detail('fantasy_scoring') like '%no final points: points sealed, finalization not finished',
  'finalizing: points sealed, finalization not finished');
select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '2 hours');
select extensions.ok(pg_temp.status('fantasy_scoring') = 'warn'
  and pg_temp.detail('fantasy_scoring') like 'GW2: statistics complete for 2 h, no final points yet (points sealed, finalization not finished): only a Fantasy season orchestrator run scores; fails at __:__ UTC',
  'inside the 8 h the warning names the stage too: ' || pg_temp.detail('fantasy_scoring'));
select pg_temp.certify('e9000000-0000-4000-8000-000000000013', interval '8 hours 1 minute');

-- ---------------------------------------------------------------------------
-- The alert path, with both checks failing: the tick pages with them.
-- ---------------------------------------------------------------------------
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at, source_sequence)
values ('e9000000-0000-4000-8000-000000000015', 'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000002',
  md5('cov-club-7')::uuid, md5('cov-club-8')::uuid, statement_timestamp() - interval '15 hours',
  'finished', 2, 1, statement_timestamp() - interval '13 hours', statement_timestamp(), 1);
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version, frozen_at)
values ('e6300000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000015',
  'e7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000002',
  statement_timestamp() - interval '15 hours', statement_timestamp() - interval '15 hours', 1,
  statement_timestamp() - interval '1 day');
select extensions.is(pg_temp.detail('fantasy_fixture_coverage'),
  '1 counted match(es) final 12+ h ago without complete player statistics (oldest: GW2, final 13 h ago): their Fantasy points cannot be computed',
  'a fourth match final 13 h ago without statistics: coverage fails with its age');
select extensions.is(pg_temp.status('fantasy_scoring'), 'warn',
  'and scoring falls back to a warning, since that match blocks it');
update app.fixtures set finalized_at = statement_timestamp() - interval '2 hours 30 minutes'
where id = 'e9000000-0000-4000-8000-000000000015';
select extensions.ok(pg_temp.status('fantasy_scoring') = 'ok' and pg_temp.status('fantasy_fixture_coverage') = 'ok',
  'while a match lacks statistics the last final whistle sets the clock: final 2 h 30 min ago, points are due');
update app.fixtures set finalized_at = statement_timestamp() - interval '13 hours'
where id = 'e9000000-0000-4000-8000-000000000015';

-- Every other check pinned healthy, so the tick's decision is these two.
insert into app_private.news_schedule_heartbeat (id, last_run_at, last_outcome)
values (true, now(), 'idle')
on conflict (id) do update set last_run_at = excluded.last_run_at;
delete from cron.job_run_details where status = 'failed';
do $$ begin perform app_private.news_sitemap_refresh(true); end $$;
update app.fantasy_gameweeks set status = 'provisional' where id = 'e7000000-0000-4000-8000-000000000002';
select pg_temp.certify('e9000000-0000-4000-8000-000000000015', interval '8 hours 1 minute');
select extensions.is(
  (select array_agg(c ->> 'name' order by c ->> 'name') from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'status' = 'fail'),
  array['fantasy_scoring'], 'only fantasy_scoring fails now');

select extensions.is(app_private.ops_alert_tick(), 'disabled', 'alerts are off in a fresh database');
select extensions.throws_ok($$select app_private.ops_alert_test()$$, '22023', 'ops_alert_webhook_missing',
  'the test message needs the webhook in Vault first, and says so');

select vault.create_secret('https://alerts.example.invalid/ops', 'botolago_ops_alert_webhook');
select set_config('test.state_before',
  (select to_jsonb(s) from app_private.ops_alert_state s where id)::text, true);
select set_config('test.test_result', app_private.ops_alert_test()::text, true);
select extensions.ok((current_setting('test.test_result')::jsonb ->> 'alertsEnabled')::boolean = false
  and current_setting('test.test_result')::jsonb ->> 'healthStatus' = 'fail'
  and current_setting('test.test_result')::jsonb ->> 'delivery'
    = 'select status_code, timed_out, error_msg from net._http_response where id = '
      || (current_setting('test.test_result')::jsonb ->> 'requestId') || ';',
  'the test message goes out with alerts off, and says how to read the webhook''s answer');
select set_config('test.body', (select convert_from(body, 'utf8') from net.http_request_queue
  where id = (current_setting('test.test_result')::jsonb ->> 'requestId')::bigint), true);
select extensions.ok(current_setting('test.body')::jsonb ->> 'content'
    like 'TEST sent by hand with app_private.ops_alert_test(), not an incident. Alerts are OFF.%',
  'it is marked TEST and says alerts are off');
select extensions.ok(current_setting('test.body')::jsonb ->> 'content'
    like '%' || E'\n' || '[BotolaGO production] FAIL at %- fantasy_scoring [fail]: GW2: every counted match final for % h, statistics complete for % h, no final points: scoring started, not finished%',
  'and carries the current health in the alert''s own words, the new check included');
select extensions.ok(current_setting('test.body')::jsonb ->> 'text' = current_setting('test.body')::jsonb ->> 'content'
  and char_length(current_setting('test.body')::jsonb ->> 'content') <= 1950,
  'Slack (text) and Discord (content) read the same message, within Discord''s 2,000 characters');
select extensions.is((select to_jsonb(s) from app_private.ops_alert_state s where id)::text,
  current_setting('test.state_before'),
  'sending a test changes no alert state: not the switch, not the last incident');
select extensions.ok(not has_function_privilege('service_role', 'app_private.ops_alert_test()', 'execute')
  and not has_function_privilege('authenticated', 'app_private.ops_alert_test()', 'execute')
  and not has_function_privilege('anon', 'app_private.ops_alert_test()', 'execute'),
  'only the database owner can send a test');
select extensions.ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
  where oid = 'app_private.ops_alert_test()'::regprocedure),
  'the test function is SECURITY DEFINER with an empty search_path');

select app_private.ops_alert_configure(true);
select extensions.is(app_private.ops_alert_tick(), 'sent', 'with alerts on, the scoring failure pages');
select set_config('test.alert', (select convert_from(body, 'utf8') from net.http_request_queue
  where url = 'https://alerts.example.invalid/ops' order by id desc limit 1), true);
select extensions.ok(current_setting('test.alert')::jsonb ->> 'text'
    like '[BotolaGO production] FAIL at %- fantasy_scoring [fail]: GW2: every counted match final for % h, statistics complete for % h, no final points: scoring started, not finished%',
  'the alert names the check, the gameweek and the stage');
select extensions.is((select last_signature from app_private.ops_alert_state where id), 'fantasy_scoring',
  'and remembers the incident by check name');

delete from app_private.historical_performance_fixture_coverage
where fixture_id = 'e9000000-0000-4000-8000-000000000015';
select extensions.is(app_private.ops_alert_tick(), 'sent', 'a new failing check changes the incident and pages again');
select set_config('test.alert', (select convert_from(body, 'utf8') from net.http_request_queue
  where url = 'https://alerts.example.invalid/ops' order by id desc limit 1), true);
select extensions.ok(current_setting('test.alert')::jsonb ->> 'text'
    like '%- fantasy_fixture_coverage [fail]: 1 counted match(es) final 12+ h ago without complete player statistics (oldest: GW2, final 13 h ago): their Fantasy points cannot be computed%',
  'naming the match that lacks statistics');
select extensions.ok(current_setting('test.alert')::jsonb ->> 'text' like '%- fantasy_scoring [warn]: GW2: every counted match final for 9 h, no points yet%',
  'with the scoring warning after it, not a second failure');
select extensions.is((select last_signature from app_private.ops_alert_state where id), 'fantasy_fixture_coverage',
  'the incident is now the coverage check');

-- The sitemap check (20260925210050) is still there and still pages.
update app_private.news_sitemap_snapshot set computed_at = statement_timestamp() - interval '11 minutes',
  changed_at = least(changed_at, statement_timestamp() - interval '11 minutes') where id;
select extensions.is(app_private.ops_alert_tick(), 'sent', 'a stale sitemap snapshot joins the incident and pages');
select extensions.ok((select convert_from(body, 'utf8')::jsonb ->> 'text' from net.http_request_queue
    where url = 'https://alerts.example.invalid/ops' order by id desc limit 1)
    like '%- news_sitemap [fail]: last refresh 11 min ago (news-sitemap-refresh paused or failing)%',
  'with the sitemap''s own reason');
do $$ begin perform app_private.news_sitemap_refresh(true); end $$;

-- ---------------------------------------------------------------------------
-- Settled, and out of scope.
-- ---------------------------------------------------------------------------
select pg_temp.certify('e9000000-0000-4000-8000-000000000015', interval '2 hours');
update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = statement_timestamp()
where id = 'e7000000-0000-4000-8000-000000000002';
select extensions.is(pg_temp.check('fantasy_scoring'),
  '{"name": "fantasy_scoring", "status": "ok", "detail": "no gameweek in play or waiting for points"}'::jsonb,
  'a finalized gameweek has its points');
select extensions.is(pg_temp.check('fantasy_fixture_coverage') ->> 'status', 'ok',
  'and its matches leave the coverage check');
select extensions.is(app_private.ops_alert_tick(), 'sent_recovery', 'recovery is announced once');
select extensions.is(app_private.ops_alert_tick(), 'quiet', 'and then it stays quiet');

update app.fantasy_gameweeks set status = 'live', points_state = 'provisional', finalized_at = null
where id = 'e7000000-0000-4000-8000-000000000002';
delete from app_private.historical_performance_fixture_coverage
where fixture_id = 'e9000000-0000-4000-8000-000000000015';
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'fail',
  'reopened with a match lacking statistics, it fails again');
update app.fantasy_seasons set status = 'completed' where id = 'e6300000-0000-4000-8000-000000000001';
select extensions.ok(pg_temp.status('fantasy_fixture_coverage') = 'ok' and pg_temp.status('fantasy_scoring') = 'ok',
  'a season that is not registration_open or active is not watched');
update app.fantasy_seasons set status = 'active' where id = 'e6300000-0000-4000-8000-000000000001';
update app.fantasy_fixture_assignments set counts_points = false
where fixture_id = 'e9000000-0000-4000-8000-000000000015';
select extensions.is(pg_temp.status('fantasy_fixture_coverage'), 'ok',
  'nor is a match that does not count for points');


select * from extensions.finish();
rollback;
