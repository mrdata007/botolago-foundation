-- 20260925110000: this season's statistics follow last season's rule for
-- players the provider has not identified (BG-0011 option B, owner decision
-- 2026-09-25). Up to 4 of the 22 starters may be unnamed; they are left out
-- and every named player is kept. More than 4 still waits.
begin;
select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('13890000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (
  '33890000-0000-4000-8000-000000000001', 'unnamed-starters-league',
  'Unnamed Starters League', 'USL', 'league', '13890000-0000-4000-8000-000000000001'
);
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('43890000-0000-4000-8000-000000000001', '33890000-0000-4000-8000-000000000001',
  '2026/2027', current_date - 30, current_date + 300, 'active', true);
insert into app.teams (id, slug, name, short_name, code, country_id)
values
  ('63890000-0000-4000-8000-000000000001', 'unnamed-starters-home',
   'Unnamed Starters Home', 'US Home', 'USH', '13890000-0000-4000-8000-000000000001'),
  ('63890000-0000-4000-8000-000000000002', 'unnamed-starters-away',
   'Unnamed Starters Away', 'US Away', 'USA', '13890000-0000-4000-8000-000000000001');
insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score,
  provider_updated_at, source_sequence, source_version
) values (
  md5('unnamed-starters-fixture')::uuid, '33890000-0000-4000-8000-000000000001',
  '43890000-0000-4000-8000-000000000001', '63890000-0000-4000-8000-000000000001',
  '63890000-0000-4000-8000-000000000002', statement_timestamp() - interval '2 days',
  'finished', 'post_match', 1, 0, statement_timestamp(), 1, 'unnamed-starters-fixture'
);

-- 22 named players: home 1-11, away 12-22. Players 1 and 12 keep goal.
insert into app.players (id, slug, full_name, display_name, position)
select md5('unnamed-starters-player-' || n)::uuid, 'unnamed-starters-player-' || n,
  'Unnamed Starters Player ' || n, 'US Player ' || n,
  case when n in (1, 12) then 'goalkeeper'::app.football_position
    when (n - 1) % 11 < 5 then 'defender'::app.football_position
    when (n - 1) % 11 < 9 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 22) n;
insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, active)
select md5('unnamed-starters-player-' || n)::uuid,
  case when n <= 11 then '63890000-0000-4000-8000-000000000001'::uuid
    else '63890000-0000-4000-8000-000000000002'::uuid end,
  '43890000-0000-4000-8000-000000000001'::uuid, (n - 1) % 11 + 1, current_date - 30, true
from generate_series(1, 22) n;
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
) values
  ('sportsmonks','competition','860','33890000-0000-4000-8000-000000000001','us-competition',statement_timestamp(),true),
  ('sportsmonks','season','28647','43890000-0000-4000-8000-000000000001','us-season',statement_timestamp(),true),
  ('sportsmonks','team','68901','63890000-0000-4000-8000-000000000001','us-home',statement_timestamp(),true),
  ('sportsmonks','team','68902','63890000-0000-4000-8000-000000000002','us-away',statement_timestamp(),true),
  ('sportsmonks','fixture','19890001',md5('unnamed-starters-fixture')::uuid,'us-fixture',statement_timestamp(),true);
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
)
select 'sportsmonks', 'player', (89000 + n)::text, md5('unnamed-starters-player-' || n)::uuid,
  'us-player-' || n, statement_timestamp(), true
from generate_series(1, 22) n;

-- The provider named 19 starters and 3 substitutes who stayed on the bench
-- (players 9, 10 and 20); 3 starters (2 home, 1 away) and 1 substitute were
-- unnamed. So 22 named rows, 26 rows in all, 4 left out.
create temp table unnamed_input as
select statement_timestamp() - interval '30 seconds' as observed_at,
  jsonb_agg(jsonb_build_object(
    'externalPlayerId', (89000 + n)::text,
    'externalTeamId', case when n <= 11 then '68901' else '68902' end,
    'started', n not in (9, 10, 20), 'appeared', n not in (9, 10, 20),
    'minutes', case when n in (9, 10, 20) then 0 else 90 end,
    'goals', case when n = 11 then 1 else 0 end, 'assists', 0,
    'cleanSheets', case when n <= 11 and n not in (9, 10) then 1 else 0 end,
    'goalsConceded', case when n <= 11 or n = 20 then 0 else 1 end,
    'saves', case when n in (1, 12) then 2 else 0 end,
    'penaltiesSaved', 0, 'penaltiesMissed', 0, 'yellowCards', 0, 'redCards', 0,
    'secondYellowDismissals', 0, 'ownGoals', 0, 'providerRating', null
  ) order by n) as rows,
  jsonb_build_object(
    'lineupRowsSeen', 26, 'validPlayerRows', 22, 'excludedIncompleteRows', 4,
    'starterRows', 19, 'identifiedStarterRows', 19, 'anonymousStarterRows', 3,
    'teamCount', 2, 'detailRows', 264, 'invalidDetailRows', 0, 'missingStatisticRows', 0,
    'scoringStatisticsComplete', true,
    'cleanSheetSource', 'official_minutes_and_on_pitch_goals_conceded',
    'goalkeeperStatistics', 'explicit_value_or_null_canonical_position_checked_in_database'
  ) as coverage
from generate_series(1, 22) n;
grant select on unnamed_input to service_role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Refused before anything is written.
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19890001',rows,
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(coverage,
      '{anonymousStarterRows}','5'),'{identifiedStarterRows}','17'),'{starterRows}','17'),
      '{excludedIncompleteRows}','6'),'{lineupRowsSeen}','28'),
    observed_at) from unnamed_input$$,
  '22023', 'CURRENT_PERFORMANCE_INCOMPLETE', 'more than 4 unnamed starters still waits'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19890001',
    jsonb_set(jsonb_set(rows,'{8,started}','true'),'{8,appeared}','true'),coverage,observed_at)
    from unnamed_input$$,
  '22023', 'CURRENT_PERFORMANCE_INCOMPLETE',
  'named starters must be exactly 22 minus the unnamed ones'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19890001',rows,
    jsonb_set(jsonb_set(coverage,'{excludedIncompleteRows}','2'),'{lineupRowsSeen}','24'),observed_at)
    from unnamed_input$$,
  '22023', 'CURRENT_PERFORMANCE_INCOMPLETE',
  'the rows left out must include every unnamed starter'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19890001',rows,
    jsonb_set(coverage,'{lineupRowsSeen}','22'),observed_at) from unnamed_input$$,
  '22023', 'CURRENT_PERFORMANCE_INCOMPLETE',
  'the rows seen must be the named rows plus the ones left out'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19890001',rows,
    jsonb_set(coverage,'{anonymousStarterRows}','"3"'),observed_at) from unnamed_input$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the unnamed-starter count must be a number'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = md5('unnamed-starters-fixture')::uuid),
  0, 'the refusals wrote nothing'
);

-- Accepted: the 22 named players, and the coverage says what was left out.
set local role service_role;
select extensions.is(
  api.ingest_current_player_fixture_performance('sportsmonks','28647','19890001',
    (select rows from unnamed_input),(select coverage from unnamed_input),
    (select observed_at from unnamed_input)) ->> 'active',
  '22', 'a match with 3 unnamed starters imports its 22 named players'
);
reset role;
select extensions.is(
  (select jsonb_build_object(
     'lineupRowsSeen', lineup_rows_seen, 'validPlayerRows', valid_player_rows,
     'excluded', excluded_incomplete_rows, 'starters', starter_rows,
     'unnamed', anonymous_starter_rows, 'identified', identified_starter_rows,
     'outcome', coverage_outcome, 'certified', scoring_statistics_complete and reconciled)
   from app_private.historical_performance_fixture_coverage
   where fixture_id = md5('unnamed-starters-fixture')::uuid),
  '{"lineupRowsSeen":26,"validPlayerRows":22,"excluded":4,"starters":19,"unnamed":3,
    "identified":19,"outcome":"accepted","certified":true}'::jsonb,
  'the coverage records the 3 unnamed starters and certifies the named ones'
);
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = md5('unnamed-starters-fixture')::uuid and active and started),
  19, 'only the named starters are stored as starters'
);

-- Scoring takes a match with up to 4 unnamed starters, counted consistently.
create function pg_temp.scoring_document(p_coverage jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'footballSeasonId', '43890000-0000-4000-8000-000000000001',
    'features', jsonb_build_object('bonus_points_enabled', false, 'player_of_match_enabled', false),
    'players', jsonb_build_array(jsonb_build_object(
      'fantasyPlayerId', md5('unnamed-scoring-player')::uuid,
      'teamId', '63890000-0000-4000-8000-000000000001')),
    'playerFixtures', jsonb_build_array(jsonb_build_object(
      'fantasyPlayerId', md5('unnamed-scoring-player')::uuid,
      'fixtureId', md5('synthetic-unnamed-scoring-fixture')::uuid,
      'fixtureTeamId', '63890000-0000-4000-8000-000000000001',
      'statisticsComplete', true, 'stats', jsonb_build_object('goals', 0, 'ownGoals', 0))),
    'fixtures', jsonb_build_array(jsonb_build_object(
      'fixtureId', md5('synthetic-unnamed-scoring-fixture')::uuid,
      'homeTeamId', '63890000-0000-4000-8000-000000000001',
      'awayTeamId', '63890000-0000-4000-8000-000000000002',
      'homeScore', 0, 'awayScore', 0,
      'status', 'finished', 'finalizedAt', statement_timestamp(),
      'seasonId', '43890000-0000-4000-8000-000000000001', 'activePerformanceCount', 22,
      'assignment', jsonb_build_object('frozen_at', statement_timestamp(), 'counts_points', true,
        'assignment_status', 'assigned'),
      'coverage', jsonb_build_object('reconciled', true, 'scoring_statistics_complete', true,
        'invalid_detail_rows', 0, 'excluded_mapping_rows', 0, 'team_count', 2,
        'performance_rows', 22, 'football_season_id', '43890000-0000-4000-8000-000000000001',
        'coverage_outcome', 'accepted', 'anonymous_starter_rows', 0,
        'excluded_incomplete_rows', 0, 'starter_rows', 22) || p_coverage)))
$$;
select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document(pg_temp.scoring_document('{}'))$$,
  'a match with 22 named starters is scored as before'
);
select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document(pg_temp.scoring_document(
    '{"anonymous_starter_rows":3,"excluded_incomplete_rows":4,"starter_rows":19}'))$$,
  'a match with 3 unnamed starters is scored on its 19 named ones'
);
select extensions.throws_ok(
  $$select app_private.fantasy_validate_scoring_document(pg_temp.scoring_document(
    '{"anonymous_starter_rows":5,"excluded_incomplete_rows":5,"starter_rows":17}'))$$,
  'PT409', 'fantasy_scoring_coverage_incomplete', 'a match with 5 unnamed starters is not scored'
);
select extensions.throws_ok(
  $$select app_private.fantasy_validate_scoring_document(pg_temp.scoring_document(
    '{"anonymous_starter_rows":3,"excluded_incomplete_rows":4,"starter_rows":22}'))$$,
  'PT409', 'fantasy_scoring_coverage_incomplete', 'named starters must be 22 minus the unnamed ones'
);
select extensions.throws_ok(
  $$select app_private.fantasy_validate_scoring_document(pg_temp.scoring_document(
    '{"anonymous_starter_rows":3,"excluded_incomplete_rows":2,"starter_rows":19}'))$$,
  'PT409', 'fantasy_scoring_coverage_incomplete', 'every unnamed starter is among the rows left out'
);
select extensions.throws_ok(
  $$select app_private.fantasy_validate_scoring_document(pg_temp.scoring_document(
    '{"coverage_outcome":"quarantined"}'))$$,
  'PT409', 'fantasy_scoring_coverage_incomplete', 'a quarantined match is never scored'
);
select extensions.is(
  app_private.fantasy_goal_reconciliation(pg_temp.scoring_document('{}')),
  '[]'::jsonb, 'a 0-0 result with no credited goals reconciles'
);
select extensions.throws_ok(
  $$select app_private.fantasy_validate_scoring_document(
    jsonb_set(pg_temp.scoring_document('{}'), '{fixtures,0,homeScore}', '1'))$$,
  'PT409', 'fantasy_goal_totals_mismatch',
  'an unattributed goal prevents a scoring snapshot even with certified coverage'
);
select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document(
    jsonb_set(jsonb_set(pg_temp.scoring_document('{}'), '{fixtures,0,homeScore}', '1'),
      '{playerFixtures,0,stats,goals}', '1'))$$,
  'a goal credited to the scoring team reconciles'
);
select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document(
    jsonb_set(jsonb_set(jsonb_set(pg_temp.scoring_document('{}'),
      '{fixtures,0,homeScore}', '1'), '{playerFixtures,0,stats,goals}', '1'),
      '{players,0,teamId}', '"63890000-0000-4000-8000-000000000002"'))$$,
  'a later club transfer does not move the credited goal away from its fixture team'
);
select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document(
    jsonb_set(jsonb_set(pg_temp.scoring_document('{}'), '{fixtures,0,awayScore}', '1'),
      '{playerFixtures,0,stats,ownGoals}', '1'))$$,
  'an own goal is credited to the opposing team'
);

select * from extensions.finish();
rollback;
