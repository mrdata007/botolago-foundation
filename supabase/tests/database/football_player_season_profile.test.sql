-- api.football_player_season_profile: the football season of a Fantasy player.
--
-- Fixture, all in one football season "2089/90" (plus one in a second season):
--
--   Club A (home of the striker), Club B, Club C.
--   F1  A v B  finished 2-1   striker starts, 90', 1 goal, 1 assist, rating 7.50
--   F2  C v A  finished 0-0   striker comes on, 20', 1 yellow card, NO rating,
--                             assists NOT REPORTED (null)
--                             (+ an INACTIVE older row with 5 goals: ignored)
--   F3  A v C  finished 3-3   no performance rows yet  -> uncovered
--   F4  A v B  scheduled      no rows; not finished, so not counted at all
--   F5  B v C  finished 1-0   rows for Club C only (not Club A's fixture)
--   F6  A v B  finished, but in the SECOND season: never in the first's figures
--
-- So Club A has 3 finished fixtures this season (F1, F2, F3) and 2 are covered.
-- The winger plays for Club C, which has F2, F3 and F5 finished, all covered:
-- the "no note" case. The reserve is a Club A player with no row at all.

begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('c0000000-0000-4000-8000-000000000001', 'MA', 'MAR');

insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('c0100000-0000-4000-8000-000000000001', 'fpsp-league', 'FPSP League',
  'FPS', 'league', 'c0000000-0000-4000-8000-000000000001');

insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  ('c0200000-0000-4000-8000-000000000001', 'c0100000-0000-4000-8000-000000000001',
    '2089/90', '2089-08-01', '2090-06-30', 'active', true),
  ('c0200000-0000-4000-8000-000000000002', 'c0100000-0000-4000-8000-000000000001',
    '2088/89', '2088-08-01', '2089-06-30', 'completed', false);

insert into app.teams (id, slug, name, short_name, code, country_id) values
  ('c0400000-0000-4000-8000-000000000001', 'fpsp-a', 'FPSP Club A', 'Alpha', 'FPA',
    'c0000000-0000-4000-8000-000000000001'),
  ('c0400000-0000-4000-8000-000000000002', 'fpsp-b', 'FPSP Club B', 'Bravo', 'FPB',
    'c0000000-0000-4000-8000-000000000001'),
  ('c0400000-0000-4000-8000-000000000003', 'fpsp-c', 'FPSP Club C', 'Charlie', 'FPC',
    'c0000000-0000-4000-8000-000000000001');

insert into app.players (id, slug, full_name, display_name, position) values
  ('c0500000-0000-4000-8000-000000000001', 'fpsp-striker', 'FPSP Striker', 'Striker', 'forward'),
  ('c0500000-0000-4000-8000-000000000002', 'fpsp-winger', 'FPSP Winger', 'Winger', 'midfielder'),
  ('c0500000-0000-4000-8000-000000000003', 'fpsp-reserve', 'FPSP Reserve', 'Reserve', 'defender'),
  ('c0500000-0000-4000-8000-000000000004', 'fpsp-other', 'FPSP Other', 'Other', 'forward');

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('c0600000-0000-4000-8000-000000000001', 'c0100000-0000-4000-8000-000000000001',
  'fpsp-fantasy', 'FPSP Fantasy', true);

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status,
  starts_at, ends_at
) values (
  'c0700000-0000-4000-8000-000000000001', 'c0600000-0000-4000-8000-000000000001',
  'c0200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000101',
  '2089/90', 'active', '2089-08-01T00:00:00Z', '2090-06-30T23:59:59Z'
);

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id, position_id,
  price, active, eligible
) values
  ('c0900000-0000-4000-8000-000000000001', 'c0700000-0000-4000-8000-000000000001',
    'c0500000-0000-4000-8000-000000000001', 'c0400000-0000-4000-8000-000000000001',
    (select id from app.fantasy_positions where code = 'FWD'), 9.5, true, true),
  ('c0900000-0000-4000-8000-000000000002', 'c0700000-0000-4000-8000-000000000001',
    'c0500000-0000-4000-8000-000000000002', 'c0400000-0000-4000-8000-000000000003',
    (select id from app.fantasy_positions where code = 'MID'), 6.0, true, true),
  ('c0900000-0000-4000-8000-000000000003', 'c0700000-0000-4000-8000-000000000001',
    'c0500000-0000-4000-8000-000000000003', 'c0400000-0000-4000-8000-000000000001',
    (select id from app.fantasy_positions where code = 'DEF'), 4.0, true, true);

insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id, kickoff_at, status, period,
  home_score, away_score, provider_updated_at, source_sequence, finalized_at
) values
  ('c1300000-0000-4000-8000-000000000001', 'c0100000-0000-4000-8000-000000000001',
    'c0200000-0000-4000-8000-000000000001', 'c0400000-0000-4000-8000-000000000001',
    'c0400000-0000-4000-8000-000000000002', '2089-09-01T18:00:00Z', 'finished', 'post_match',
    2, 1, '2089-09-01T20:00:00Z', 1, '2089-09-01T20:00:00Z'),
  ('c1300000-0000-4000-8000-000000000002', 'c0100000-0000-4000-8000-000000000001',
    'c0200000-0000-4000-8000-000000000001', 'c0400000-0000-4000-8000-000000000003',
    'c0400000-0000-4000-8000-000000000001', '2089-09-08T18:00:00Z', 'finished', 'post_match',
    0, 0, '2089-09-08T20:00:00Z', 1, '2089-09-08T20:00:00Z'),
  ('c1300000-0000-4000-8000-000000000003', 'c0100000-0000-4000-8000-000000000001',
    'c0200000-0000-4000-8000-000000000001', 'c0400000-0000-4000-8000-000000000001',
    'c0400000-0000-4000-8000-000000000003', '2089-09-15T18:00:00Z', 'finished', 'post_match',
    3, 3, '2089-09-15T20:00:00Z', 1, '2089-09-15T20:00:00Z'),
  ('c1300000-0000-4000-8000-000000000004', 'c0100000-0000-4000-8000-000000000001',
    'c0200000-0000-4000-8000-000000000001', 'c0400000-0000-4000-8000-000000000001',
    'c0400000-0000-4000-8000-000000000002', '2089-09-22T18:00:00Z', 'scheduled', 'pre_match',
    null, null, '2089-09-01T20:00:00Z', 1, null),
  ('c1300000-0000-4000-8000-000000000005', 'c0100000-0000-4000-8000-000000000001',
    'c0200000-0000-4000-8000-000000000001', 'c0400000-0000-4000-8000-000000000002',
    'c0400000-0000-4000-8000-000000000003', '2089-09-29T18:00:00Z', 'finished', 'post_match',
    1, 0, '2089-09-29T20:00:00Z', 1, '2089-09-29T20:00:00Z'),
  ('c1300000-0000-4000-8000-000000000006', 'c0100000-0000-4000-8000-000000000001',
    'c0200000-0000-4000-8000-000000000002', 'c0400000-0000-4000-8000-000000000001',
    'c0400000-0000-4000-8000-000000000002', '2089-05-01T18:00:00Z', 'finished', 'post_match',
    4, 0, '2089-05-01T20:00:00Z', 1, '2089-05-01T20:00:00Z');

create function pg_temp.perf(
  p_season text, p_fixture text, p_player text, p_team text, p_version text,
  p_started boolean, p_appeared boolean, p_minutes integer, p_goals integer,
  p_assists integer, p_yellow integer, p_red integer, p_rating numeric, p_active boolean
) returns void language sql as $$
  insert into app.player_fixture_performances (
    football_season_id, fixture_id, player_id, team_id, position, source_provider,
    source_version, started, appeared, minutes, goals, assists, clean_sheets,
    goals_conceded, saves, penalties_saved, penalties_missed, yellow_cards, red_cards,
    second_yellow_dismissals, own_goals, provider_rating, active, provider_observed_at
  ) values (
    ('c0200000-0000-4000-8000-00000000000' || p_season)::uuid,
    ('c1300000-0000-4000-8000-00000000000' || p_fixture)::uuid,
    ('c0500000-0000-4000-8000-00000000000' || p_player)::uuid,
    ('c0400000-0000-4000-8000-00000000000' || p_team)::uuid,
    'forward', 'sportsmonks',
    'sportsmonks:' || encode(extensions.digest('fpsp-' || p_version, 'sha256'), 'hex'),
    p_started, p_appeared, p_minutes, p_goals, p_assists, 0, 0, 0, 0, 0, p_yellow, p_red,
    0, 0, p_rating, p_active, timestamptz '2089-09-30 21:00:00+00'
  );
$$;

--                season fixture player team version  started appeared min goals assists yel red rating active
select pg_temp.perf('1', '1', '1', '1', 'a1', true,  true,  90, 1, 1, 0, 0, 7.50, true);
select pg_temp.perf('1', '2', '1', '1', 'a2', false, true,  20, 0, null, 1, 0, null, true);
-- An older, superseded row for the same match: inactive, so it is not counted.
select pg_temp.perf('1', '2', '1', '1', 'a2-old', true, true, 90, 5, 5, 0, 1, 9.00, false);
-- The same striker the season before: another season, never in this one.
select pg_temp.perf('2', '6', '1', '1', 'a6', true,  true,  90, 4, 0, 0, 0, 9.50, true);
-- A different player in F1 must not leak into the striker's figures.
select pg_temp.perf('1', '1', '4', '2', 'b1', true,  true,  90, 1, 0, 0, 0, 6.00, true);
-- Winger (Club C): every finished Club C match (F2, F3, F5) has a row.
select pg_temp.perf('1', '2', '2', '3', 'c2', true,  true,  80, 0, 0, 0, 0, 6.40, true);
select pg_temp.perf('1', '3', '2', '3', 'c3', true,  true,  90, 2, 0, 0, 0, 8.60, true);
select pg_temp.perf('1', '5', '2', '3', 'c5', false, false, 0,  0, 0, 0, 0, null, true);

-- The whole read is exercised as `anon`: /fantasy/players/$playerId is public.
set local role anon;

select extensions.lives_ok(
  $$select api.football_player_season_profile('c0900000-0000-4000-8000-000000000001')$$,
  'an anonymous visitor can call football_player_season_profile'
);
select extensions.throws_ok(
  $$select * from app.player_fixture_performances$$,
  '42501',
  'permission denied for schema app',
  'anonymous clients still cannot read the performances table directly'
);

select set_config('test.fpsp_striker', api.football_player_season_profile(
  'c0900000-0000-4000-8000-000000000001')::text, true);

-- Totals: F1 + F2 only (F6 is another season, the inactive row is superseded).
select extensions.is(
  current_setting('test.fpsp_striker')::jsonb -> 'totals',
  '{"goals": 1, "minutes": 110, "starts": 1, "assists": 1, "redCards": 0,
    "yellowCards": 1, "appearances": 2, "ratedMatches": 1, "averageRating": 7.50,
    "assistsMissing": 1}'::jsonb,
  'totals count active rows of finished matches of this season only; an unreported assist count is counted as missing, not as zero'
);
select extensions.is(
  current_setting('test.fpsp_striker')::jsonb -> 'coverage',
  '{"covered": 2, "finished": 3}'::jsonb,
  'coverage: the club has 3 finished matches this season and 2 carry performance rows'
);
select extensions.is(
  jsonb_array_length(current_setting('test.fpsp_striker')::jsonb -> 'lastMatches'),
  2,
  'the last matches are the appearances, not the club''s whole calendar'
);
select extensions.is(
  current_setting('test.fpsp_striker')::jsonb -> 'lastMatches' -> 0,
  jsonb_build_object(
    'fixtureId', 'c1300000-0000-4000-8000-000000000002',
    'kickoffAt', (select kickoff_at from app.fixtures where id = 'c1300000-0000-4000-8000-000000000002'),
    'home', false,
    'opponent', jsonb_build_object('teamId', 'c0400000-0000-4000-8000-000000000003',
      'shortName', 'Charlie', 'name', 'FPSP Club C'),
    'homeScore', 0, 'awayScore', 0, 'minutes', 20, 'started', false,
    'goals', 0, 'assists', null, 'rating', null
  ),
  'newest first; an away match names the home club as opponent; an unrated match has a null rating and an unreported assist count stays null'
);
select extensions.is(
  current_setting('test.fpsp_striker')::jsonb -> 'lastMatches' -> 1 ->> 'home',
  'true',
  'a match at the player''s own ground is home'
);
select extensions.is(
  (current_setting('test.fpsp_striker')::jsonb -> 'lastMatches' -> 1 ->> 'rating')::numeric,
  7.5::numeric,
  'the provider rating of the match is passed through'
);

-- Complete coverage: covered = finished, so the screen shows no note.
select set_config('test.fpsp_winger', api.football_player_season_profile(
  'c0900000-0000-4000-8000-000000000002')::text, true);
select extensions.is(
  current_setting('test.fpsp_winger')::jsonb -> 'coverage',
  '{"covered": 3, "finished": 3}'::jsonb,
  'complete coverage reports covered = finished'
);
select extensions.is(
  current_setting('test.fpsp_winger')::jsonb -> 'totals',
  '{"goals": 2, "minutes": 170, "starts": 2, "assists": 0, "redCards": 0,
    "yellowCards": 0, "appearances": 2, "ratedMatches": 2, "averageRating": 7.50,
    "assistsMissing": 0}'::jsonb,
  'a bench row with no appearance counts for coverage but not for appearances, and the average is over rated matches'
);

-- A player with no row at all: zeros, a JSON null rating, no matches. Never invented.
select set_config('test.fpsp_reserve', api.football_player_season_profile(
  'c0900000-0000-4000-8000-000000000003')::text, true);
select extensions.is(
  current_setting('test.fpsp_reserve')::jsonb -> 'totals',
  '{"goals": 0, "minutes": 0, "starts": 0, "assists": 0, "redCards": 0,
    "yellowCards": 0, "appearances": 0, "ratedMatches": 0, "averageRating": null,
    "assistsMissing": 0}'::jsonb,
  'a player with no performance row has zero totals and a null average rating'
);
select extensions.is(
  current_setting('test.fpsp_reserve')::jsonb -> 'lastMatches',
  '[]'::jsonb,
  'a player with no performance row has no last matches'
);
select extensions.is(
  current_setting('test.fpsp_reserve')::jsonb -> 'coverage',
  '{"covered": 2, "finished": 3}'::jsonb,
  'coverage is the club''s, so a player with no row still tells how much is missing'
);

select extensions.throws_ok(
  $$select api.football_player_season_profile('c0900000-0000-4000-8000-0000000000ff')$$,
  'PGRST'::char(5),
  null::text,
  'an unknown fantasy player is a chosen 404 response'
);

reset role;

select * from extensions.finish();
rollback;
