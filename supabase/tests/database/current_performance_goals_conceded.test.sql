-- 20260925120000: goals conceded, which decide clean sheets, are checked
-- against the final score. A player on for the whole match (90 minutes)
-- conceded exactly what the side did, and nobody conceded more; a player on
-- for part of the match may have conceded less.
begin;
select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('13900000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (
  '33900000-0000-4000-8000-000000000001', 'goals-conceded-league',
  'Goals Conceded League', 'GCL', 'league', '13900000-0000-4000-8000-000000000001'
);
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('43900000-0000-4000-8000-000000000001', '33900000-0000-4000-8000-000000000001',
  '2026/2027', current_date - 30, current_date + 300, 'active', true);
insert into app.teams (id, slug, name, short_name, code, country_id)
values
  ('63900000-0000-4000-8000-000000000001', 'goals-conceded-home',
   'Goals Conceded Home', 'GC Home', 'GCH', '13900000-0000-4000-8000-000000000001'),
  ('63900000-0000-4000-8000-000000000002', 'goals-conceded-away',
   'Goals Conceded Away', 'GC Away', 'GCA', '13900000-0000-4000-8000-000000000001');
-- Fixture 1 finished 2-1; fixture 2 finished 1-0.
insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score,
  provider_updated_at, source_sequence, source_version
)
select md5('goals-conceded-fixture-' || n)::uuid, '33900000-0000-4000-8000-000000000001',
  '43900000-0000-4000-8000-000000000001', '63900000-0000-4000-8000-000000000001',
  '63900000-0000-4000-8000-000000000002', statement_timestamp() - interval '2 days',
  'finished', 'post_match', 3 - n, 2 - n,
  statement_timestamp(), 1, 'goals-conceded-fixture-' || n
from generate_series(1, 2) n;

-- 11 starters a side (players 1-11 home, 12-22 away) and one substitute each
-- (23 home, 24 away).
insert into app.players (id, slug, full_name, display_name, position)
select md5('goals-conceded-player-' || n)::uuid, 'goals-conceded-player-' || n,
  'Goals Conceded Player ' || n, 'GC Player ' || n,
  case when n in (1, 12) then 'goalkeeper'::app.football_position
    when (n - 1) % 11 < 5 then 'defender'::app.football_position
    when (n - 1) % 11 < 9 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 24) n;
insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, active)
select md5('goals-conceded-player-' || n)::uuid,
  case when n <= 11 or n = 23 then '63900000-0000-4000-8000-000000000001'::uuid
    else '63900000-0000-4000-8000-000000000002'::uuid end,
  '43900000-0000-4000-8000-000000000001'::uuid,
  case when n <= 22 then (n - 1) % 11 + 1 else 12 end, current_date - 30, true
from generate_series(1, 24) n;
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
) values
  ('sportsmonks','competition','860','33900000-0000-4000-8000-000000000001','gc-competition',statement_timestamp(),true),
  ('sportsmonks','season','28647','43900000-0000-4000-8000-000000000001','gc-season',statement_timestamp(),true),
  ('sportsmonks','team','69001','63900000-0000-4000-8000-000000000001','gc-home',statement_timestamp(),true),
  ('sportsmonks','team','69002','63900000-0000-4000-8000-000000000002','gc-away',statement_timestamp(),true),
  ('sportsmonks','fixture','19900001',md5('goals-conceded-fixture-1')::uuid,'gc-fixture-1',statement_timestamp(),true),
  ('sportsmonks','fixture','19900002',md5('goals-conceded-fixture-2')::uuid,'gc-fixture-2',statement_timestamp(),true);
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
)
select 'sportsmonks', 'player', (90000 + n)::text, md5('goals-conceded-player-' || n)::uuid,
  'gc-player-' || n, statement_timestamp(), true
from generate_series(1, 24) n;

-- Fixture 1, 2-1: every starter on for 90 minutes, so the home starters
-- conceded one goal and the away starters two; neither substitute came on.
-- Fixture 2, 1-0: the home side kept a clean sheet. Away forward 22 went off
-- after 70 minutes, before the goal, and keeps one; substitute 24 came on for
-- him and was on the pitch for it.
create temp table conceded_input as
select fixture, statement_timestamp() - interval '30 seconds' as observed_at,
  jsonb_agg(jsonb_build_object(
    'externalPlayerId', (90000 + n)::text,
    'externalTeamId', case when n <= 11 or n = 23 then '69001' else '69002' end,
    'started', n <= 22,
    'appeared', n <= 22 or (fixture = 2 and n = 24),
    'minutes', case when n = 23 or (fixture = 1 and n = 24) then 0
      when fixture = 2 and n = 22 then 70 when fixture = 2 and n = 24 then 20 else 90 end,
    'goals', case when fixture = 1 and n in (10, 11, 22) or fixture = 2 and n = 11 then 1 else 0 end,
    'assists', 0,
    'cleanSheets', case when fixture = 2 and (n <= 11 or n = 22) then 1 else 0 end,
    'goalsConceded', case when fixture = 1 then case when n > 22 then 0 when n <= 11 then 1 else 2 end
      else case when n <= 11 or n in (22, 23) then 0 else 1 end end,
    'saves', case when n in (1, 12) then 2 else 0 end,
    'penaltiesSaved', 0, 'penaltiesMissed', 0, 'yellowCards', 0, 'redCards', 0,
    'secondYellowDismissals', 0, 'ownGoals', 0, 'providerRating', null
  ) order by n) as rows,
  jsonb_build_object(
    'lineupRowsSeen', 24, 'validPlayerRows', 24, 'excludedIncompleteRows', 0,
    'starterRows', 22, 'teamCount', 2, 'detailRows', 48, 'invalidDetailRows', 0,
    'missingStatisticRows', 0, 'absentStatisticsCountedAsZero', 190,
    'scoringStatisticsComplete', true,
    'cleanSheetSource', 'official_minutes_and_on_pitch_goals_conceded',
    'goalkeeperStatistics', 'explicit_value_or_null_canonical_position_checked_in_database'
  ) as coverage
from generate_series(1, 2) fixture, generate_series(1, 24) n
group by fixture;
grant select on conceded_input to service_role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- The away goalkeeper played the whole 2-1 but carries no goals conceded, as
-- 40 goalkeepers did last season: that would be a clean sheet nobody kept.
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19900001',
    jsonb_set(jsonb_set(rows, '{11,goalsConceded}', '0'), '{11,cleanSheets}', '1'),
    coverage, observed_at) from conceded_input where fixture = 1$$,
  '22023', 'CURRENT_GOALS_CONCEDED_MISMATCH',
  'a player on for the whole match conceded what the side did'
);
-- No away player carries any (as if SportsMonks had not recorded them yet).
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19900001',
    (select jsonb_agg(case when value ->> 'externalTeamId' = '69002'
       then value || jsonb_build_object('goalsConceded', 0,
         'cleanSheets', case when (value ->> 'minutes')::integer >= 60 then 1 else 0 end)
       else value end order by ordinality)
     from jsonb_array_elements(rows) with ordinality),
    coverage, observed_at) from conceded_input where fixture = 1$$,
  '22023', 'CURRENT_GOALS_CONCEDED_MISMATCH',
  'a side that conceded cannot come in without goals conceded'
);
-- The away substitute never came on, so only the cap applies to him.
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19900001',
    jsonb_set(rows, '{23,goalsConceded}', '3'), coverage, observed_at)
    from conceded_input where fixture = 1$$,
  '22023', 'CURRENT_GOALS_CONCEDED_MISMATCH',
  'nobody conceded more than the side did'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = md5('goals-conceded-fixture-1')::uuid),
  0, 'the refusals wrote nothing'
);

-- Consistent with the 2-1: imported.
set local role service_role;
select extensions.is(
  (select api.ingest_current_player_fixture_performance('sportsmonks','28647','19900001',
    rows, coverage, observed_at) ->> 'active' from conceded_input where fixture = 1),
  '24', 'goals conceded consistent with the final score are imported'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = md5('goals-conceded-fixture-1')::uuid and active and clean_sheets = 0),
  24, 'nobody on either side of a 2-1 keeps a clean sheet'
);

-- A player on for part of the match may have conceded less than the side.
set local role service_role;
select extensions.is(
  (select api.ingest_current_player_fixture_performance('sportsmonks','28647','19900002',
    rows, coverage, observed_at) ->> 'active' from conceded_input where fixture = 2),
  '24', 'a player off the pitch for the goal is imported with none conceded'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = md5('goals-conceded-fixture-2')::uuid and active and clean_sheets = 1),
  12, 'the home starters and the away forward who went off before the goal keep clean sheets'
);

select * from extensions.finish();
rollback;
