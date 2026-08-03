begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('a0000000-0000-4000-8000-000000000001', 'MA', 'MAR');

insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id
) values (
  'a1000000-0000-4000-8000-000000000001', 'fdr-test',
  'Fixture Difficulty Test', 'FDR', 'league',
  'a0000000-0000-4000-8000-000000000001'
);

insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  '2090/91', '2090-08-01', '2091-06-30', 'active', true
);

insert into app.teams (id, slug, name, short_name, code, country_id) values
  ('a3000000-0000-4000-8000-000000000001', 'fdr-strong',
    'FDR Strong Club', 'Strong', 'STR', 'a0000000-0000-4000-8000-000000000001'),
  ('a3000000-0000-4000-8000-000000000002', 'fdr-weak',
    'FDR Weak Club', 'Weak', 'WEA', 'a0000000-0000-4000-8000-000000000001');

insert into app.standings (
  id, competition_id, season_id, team_id, rank, played, won, drawn, lost,
  goals_for, goals_against, points, form, provider_updated_at, source_sequence
) values
  ('a4000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001', 1, 3, 3, 0, 0,
    9, 0, 9, 'WWW', '2090-10-01T00:00:00Z', 1),
  ('a4000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002', 2, 3, 0, 0, 3,
    0, 9, 0, 'LLL', '2090-10-01T00:00:00Z', 1);

insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id, kickoff_at,
  status, period, home_score, away_score, winner_team_id,
  provider_updated_at, source_sequence, finalized_at
) values
  ('a5000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002',
    '2090-08-10T18:00:00Z', 'finished', 'post_match', 3, 0,
    'a3000000-0000-4000-8000-000000000001', '2090-08-10T20:00:00Z', 1,
    '2090-08-10T20:00:00Z'),
  ('a5000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000001',
    '2090-08-17T18:00:00Z', 'finished', 'post_match', 0, 3,
    'a3000000-0000-4000-8000-000000000001', '2090-08-17T20:00:00Z', 2,
    '2090-08-17T20:00:00Z'),
  ('a5000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002',
    '2090-08-24T18:00:00Z', 'finished', 'post_match', 3, 0,
    'a3000000-0000-4000-8000-000000000001', '2090-08-24T20:00:00Z', 3,
    '2090-08-24T20:00:00Z'),
  ('a5000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002',
    '2091-01-10T18:00:00Z', 'scheduled', 'pre_match', null, null,
    null, '2091-01-01T00:00:00Z', 4, null);

insert into app.fantasy_competitions (
  id, football_competition_id, slug, name, active
) values (
  'a6000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'fdr-test', 'Fixture Difficulty Test', true
);

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at
) values (
  'a7000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000101',
  '2090/91', 'active', '2090-08-01T00:00:00Z', '2091-06-30T23:59:59Z'
);

insert into app.fantasy_gameweeks (
  id, fantasy_season_id, sequence_number, name, deadline_at,
  starts_at, ends_at, status
) values (
  'a8000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
  '2091-01-10T16:30:00Z', '2091-01-10T18:00:00Z',
  '2091-01-17T23:59:59Z', 'scheduled'
);

insert into app.fantasy_fixture_assignments (
  id, fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, assignment_status,
  counts_points, source_version
) values (
  'a9000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000004',
  'a8000000-0000-4000-8000-000000000001',
  'a8000000-0000-4000-8000-000000000001',
  '2091-01-10T18:00:00Z', '2091-01-10T18:00:00Z',
  'assigned', true, 1
);

select extensions.is((
  select count(*)::integer from app.fantasy_fixture_difficulty_rules
  where ruleset_id = 'f6100000-0000-4000-8000-000000000101'
    and algorithm_code = 'table-strength-v1.0'
), 1, 'the published v1.1 ruleset owns one versioned difficulty model');

set local role anon;
select set_config('test.fdr_result', api.fantasy_fixture_difficulty(
  'a7000000-0000-4000-8000-000000000001', 1, 6
)::text, true);
select extensions.is(
  jsonb_array_length(current_setting('test.fdr_result')::jsonb),
  2,
  'the safe public RPC returns one difficulty row per club side'
);
select extensions.ok(
  (select (strong_side.item ->> 'difficulty')::integer
   from jsonb_array_elements(current_setting('test.fdr_result')::jsonb) strong_side(item)
   where strong_side.item ->> 'clubId' = 'a3000000-0000-4000-8000-000000000002')
  >
  (select (weak_side.item ->> 'difficulty')::integer
   from jsonb_array_elements(current_setting('test.fdr_result')::jsonb) weak_side(item)
   where weak_side.item ->> 'clubId' = 'a3000000-0000-4000-8000-000000000001'),
  'the stronger opponent receives a deterministically higher difficulty'
);
select extensions.results_eq(
  $$select distinct item ->> 'algorithmVersion'
    from jsonb_array_elements(current_setting('test.fdr_result')::jsonb) item$$,
  $$values ('table-strength-v1.0'::text)$$,
  'public results identify the immutable algorithm version'
);
select extensions.throws_ok(
  $$select * from app.fantasy_fixture_difficulty_rules$$,
  '42501',
  'permission denied for schema app',
  'anonymous clients cannot read canonical difficulty rules directly'
);
reset role;

select * from extensions.finish();
rollback;
