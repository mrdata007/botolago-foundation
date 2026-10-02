-- Regression suite for 20260928090000_matches_by_date_explicit_utc_bounds.
-- Three kickoffs around a UTC day edge: 22:30Z and 23:30Z on 2030-01-02 and
-- 00:30Z on 2030-01-03. The app sends the day it means as exact UTC bounds.
begin;
select extensions.no_plan();

insert into app.competitions (id, slug, name, short_name, competition_type)
values ('32000000-0000-4000-8000-0000000000b1', 'bounds-football', 'Bounds Football', 'BND', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('42000000-0000-4000-8000-0000000000b1', '32000000-0000-4000-8000-0000000000b1',
  '2029/30', '2029-08-01', '2030-06-30', 'active', true);
insert into app.teams (id, slug, name, short_name)
values
  ('62000000-0000-4000-8000-0000000000b1', 'bounds-home', 'Bounds Home', 'BH'),
  ('62000000-0000-4000-8000-0000000000b2', 'bounds-away', 'Bounds Away', 'BA');
insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, minute, home_score, away_score,
  provider_updated_at, source_sequence
) values
  ('92000000-0000-4000-8000-0000000000b1', '32000000-0000-4000-8000-0000000000b1',
   '42000000-0000-4000-8000-0000000000b1', '62000000-0000-4000-8000-0000000000b1',
   '62000000-0000-4000-8000-0000000000b2', '2030-01-02T22:30:00Z', 'scheduled', 'pre_match',
   null, null, null, '2030-01-01T00:00:00Z', 1),
  ('92000000-0000-4000-8000-0000000000b2', '32000000-0000-4000-8000-0000000000b1',
   '42000000-0000-4000-8000-0000000000b1', '62000000-0000-4000-8000-0000000000b2',
   '62000000-0000-4000-8000-0000000000b1', '2030-01-02T23:30:00Z', 'scheduled', 'pre_match',
   null, null, null, '2030-01-01T00:00:00Z', 2),
  ('92000000-0000-4000-8000-0000000000b3', '32000000-0000-4000-8000-0000000000b1',
   '42000000-0000-4000-8000-0000000000b1', '62000000-0000-4000-8000-0000000000b1',
   '62000000-0000-4000-8000-0000000000b2', '2030-01-03T00:30:00Z', 'scheduled', 'pre_match',
   null, null, null, '2030-01-01T00:00:00Z', 3);

set local role anon;

-- The UTC day of 2030-01-02 holds the 22:30Z and the 23:30Z kickoff, not 00:30Z.
select extensions.is(
  jsonb_array_length(api.football_matches_by_date(
    '2030-01-02', p_season_id => '42000000-0000-4000-8000-0000000000b1',
    p_range_start => '2030-01-02T00:00:00Z', p_range_end => '2030-01-03T00:00:00Z'
  ) -> 'items'), 2,
  'a kickoff between 23:00 and 24:00 UTC belongs to its UTC day');
select extensions.is(
  jsonb_array_length(api.football_matches_by_date(
    '2030-01-03', p_season_id => '42000000-0000-4000-8000-0000000000b1',
    p_range_start => '2030-01-03T00:00:00Z', p_range_end => '2030-01-04T00:00:00Z'
  ) -> 'items'), 1,
  'the next UTC day holds only the 00:30Z kickoff');

-- A day that starts at 23:00Z (a UTC+1 day) takes the 23:30Z kickoff with it.
select extensions.is(
  jsonb_array_length(api.football_matches_by_date(
    '2030-01-03', p_season_id => '42000000-0000-4000-8000-0000000000b1',
    p_range_start => '2030-01-02T23:00:00Z', p_range_end => '2030-01-03T23:00:00Z'
  ) -> 'items'), 2,
  'explicit bounds decide the day, whatever the date argument says');

-- Bounds win over the zone: an unknown zone is not even looked up.
select extensions.lives_ok(
  $$select api.football_matches_by_date('2030-01-02', p_timezone => 'Mars/Olympus_Mons',
      p_range_start => '2030-01-02T00:00:00Z', p_range_end => '2030-01-03T00:00:00Z')$$,
  'with bounds the time-zone name is not consulted');

-- Without bounds the old date-and-zone path still works and is still checked.
select extensions.ok(
  api.football_matches_by_date('2030-01-02', p_timezone => 'UTC') ? 'items',
  'callers that send only a date and a zone keep working');
select extensions.throws_ok(
  $$select api.football_matches_by_date('2030-01-02', p_timezone => 'Mars/Olympus_Mons')$$,
  '22023', 'INVALID_TIMEZONE', 'without bounds an unknown zone is still refused');

-- Bad bounds are refused.
select extensions.throws_ok(
  $$select api.football_matches_by_date('2030-01-02', p_range_start => '2030-01-02T00:00:00Z')$$,
  '22023', 'INVALID_DAY_BOUNDS', 'a start without an end is refused');
select extensions.throws_ok(
  $$select api.football_matches_by_date('2030-01-02',
      p_range_start => '2030-01-03T00:00:00Z', p_range_end => '2030-01-02T00:00:00Z')$$,
  '22023', 'INVALID_DAY_BOUNDS', 'an end before the start is refused');
select extensions.throws_ok(
  $$select api.football_matches_by_date('2030-01-02',
      p_range_start => '2030-01-01T00:00:00Z', p_range_end => '2030-01-05T00:00:00Z')$$,
  '22023', 'INVALID_DAY_BOUNDS', 'a window longer than a day is refused');

reset role;
select * from extensions.finish();
rollback;
