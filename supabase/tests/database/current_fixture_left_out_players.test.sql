-- 20261004120000 (and its limits, 20261004130000): a finished fixture is no
-- longer held back by lineup players the catalogue cannot place, when no
-- Fantasy team holds any of them.
begin;
select extensions.no_plan();

-- Ids: md5 of a label, so every id is unique to this file.
create function pg_temp.uid(label text) returns uuid language sql immutable as
  $$ select md5('left-out-' || label)::uuid $$;

insert into app.countries (id, iso_alpha2, iso_alpha3)
select pg_temp.uid('country'), 'MA', 'MAR' where not exists (select 1 from app.countries where iso_alpha2 = 'MA');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.uid('competition'), 'left-out-league', 'Left Out League', 'LOL', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.uid('season'), pg_temp.uid('competition'), '2026/2027', current_date - 30, current_date + 300, 'active', true);
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.uid('team-' || t), 'left-out-team-' || t, 'Left Out Team ' || t, 'LO' || t, 'LO' || t,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 2) t;
-- Finished 2-1, two days ago.
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at, status, period,
  home_score, away_score, provider_updated_at, source_sequence, source_version, finalized_at)
values (pg_temp.uid('fixture'), pg_temp.uid('competition'), pg_temp.uid('season'), pg_temp.uid('team-1'),
  pg_temp.uid('team-2'), statement_timestamp() - interval '2 days', 'finished', 'post_match', 2, 1,
  statement_timestamp(), 1, 'left-out-fixture', statement_timestamp() - interval '2 days');

-- Provider rows 1-25: 1-11 home starters, 12-22 away starters, 23 and 25 home
-- substitutes, 24 an away substitute (none came on). 1 and 12 keep goal, 2-5
-- and 13-16 defend, 10, 11, 21 and 22 attack, the rest are midfielders.
-- Not placeable: 11 (a home starter who scored) and 25 have no canonical player
-- or mapping; 21 is mapped but has no club record at the away club.
create function pg_temp.pos(n integer) returns app.football_position language sql immutable as $$
  select (case when n in (1, 12) then 'goalkeeper' when n between 2 and 5 or n between 13 and 16 then 'defender'
    when n in (10, 11, 21, 22) then 'forward' else 'midfielder' end)::app.football_position $$;
create function pg_temp.club(n integer) returns integer language sql immutable as
  $$ select case when n <= 11 or n in (23, 25, 26) then 1 else 2 end $$;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.uid('player-' || n), 'left-out-player-' || n, 'Left Out Player ' || n, 'LOP ' || n, pg_temp.pos(n)
from generate_series(1, 26) n where n not in (11, 25);
insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, active)
select pg_temp.uid('player-' || n), pg_temp.uid('team-' || pg_temp.club(n)), pg_temp.uid('season'), n,
  current_date - 30, true
from generate_series(1, 26) n where n not in (11, 21, 25);
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at, active)
values ('sportsmonks', 'competition', '860', pg_temp.uid('competition'), 'lo', statement_timestamp(), true),
  ('sportsmonks', 'season', '28647', pg_temp.uid('season'), 'lo', statement_timestamp(), true),
  ('sportsmonks', 'team', '71001', pg_temp.uid('team-1'), 'lo', statement_timestamp(), true),
  ('sportsmonks', 'team', '71002', pg_temp.uid('team-2'), 'lo', statement_timestamp(), true),
  ('sportsmonks', 'fixture', '19950001', pg_temp.uid('fixture'), 'lo', statement_timestamp(), true);
-- Player 26 (home) has no mapping and is not on the match sheet.
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at, active)
select 'sportsmonks', 'player', (95000 + n)::text, pg_temp.uid('player-' || n), 'lo', statement_timestamp(), true
from generate_series(1, 24) n where n <> 11;

-- Fantasy: one provisional gameweek counting the fixture, a Fantasy player for
-- every canonical player, and one manager whose locked lineup holds 15 of them
-- (not 21, 24 or 26).
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.uid('fantasy-competition'), pg_temp.uid('competition'), 'left-out', 'Left Out', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.uid('fantasy-season'), pg_temp.uid('fantasy-competition'), pg_temp.uid('season'),
  'f6100000-0000-4000-8000-000000000100', 'Left Out', 'active', current_date - 30, current_date + 300);
insert into app.fantasy_gameweeks (id, fantasy_season_id, sequence_number, name, deadline_at, starts_at, ends_at, status)
values (pg_temp.uid('gameweek'), pg_temp.uid('fantasy-season'), 1, 'Left Out GW1',
  statement_timestamp() - interval '3 days', statement_timestamp() - interval '2 days 2 hours',
  statement_timestamp() - interval '1 day', 'provisional');
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, frozen_at, source_version)
values (pg_temp.uid('fantasy-season'), pg_temp.uid('fixture'), pg_temp.uid('gameweek'), pg_temp.uid('gameweek'),
  statement_timestamp() - interval '2 days', statement_timestamp() - interval '2 days',
  statement_timestamp() - interval '3 days', 1);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select pg_temp.uid('fantasy-player-' || n), pg_temp.uid('fantasy-season'), pg_temp.uid('player-' || n),
  pg_temp.uid('team-' || pg_temp.club(n)), pos.id, 5
from generate_series(1, 26) n
join app.fantasy_positions pos on pos.code = case pg_temp.pos(n) when 'goalkeeper' then 'GK'
  when 'defender' then 'DEF' when 'midfielder' then 'MID' else 'FWD' end
where n not in (11, 25);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.uid('user'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'left-out@test.invalid', '', now(), '{}', '{"username":"left_out"}', now(), now());
insert into app.profiles (id, display_name, created_at) values (pg_temp.uid('user'), 'Left Out', now())
on conflict (id) do update set display_name = excluded.display_name;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers)
values (pg_temp.uid('fantasy-team'), pg_temp.uid('user'), pg_temp.uid('fantasy-season'), pg_temp.uid('gameweek'),
  'Left Out FC', 25, 75, 1);
insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
values (pg_temp.uid('lineup'), pg_temp.uid('fantasy-team'), pg_temp.uid('gameweek'), 1,
  statement_timestamp() - interval '3 days');
insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, snapshot_price)
select pg_temp.uid('lineup'), pg_temp.uid('fantasy-player-' || n),
  case when ord <= 11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
  case when ord <= 11 then ord else ord - 11 end, n = 10, n = 22, 5
from unnest(array[1, 2, 3, 13, 14, 6, 7, 17, 18, 10, 22, 12, 4, 8, 23]) with ordinality as s(n, ord);

-- The importer's payload: every starter played 90 minutes; 10 and 11 scored
-- for the home side, 22 for the away side.
create temp table left_out_input as
select jsonb_agg(jsonb_build_object(
    'externalPlayerId', (95000 + n)::text,
    'externalTeamId', case when pg_temp.club(n) = 1 then '71001' else '71002' end,
    'started', n <= 22, 'appeared', n <= 22,
    'minutes', case when n <= 22 then 90 else 0 end,
    'goals', case when n in (10, 11, 22) then 1 else 0 end, 'assists', 0, 'cleanSheets', 0,
    'goalsConceded', case when n > 22 then 0 when n <= 11 then 1 else 2 end,
    'saves', case when n in (1, 12) then 2 else 0 end,
    'penaltiesSaved', 0, 'penaltiesMissed', 0, 'yellowCards', 0, 'redCards', 0,
    'secondYellowDismissals', 0, 'ownGoals', 0, 'providerRating', null) order by n) as rows,
  jsonb_build_object('lineupRowsSeen', 25, 'validPlayerRows', 25, 'excludedIncompleteRows', 0,
    'starterRows', 22, 'teamCount', 2, 'detailRows', 50, 'invalidDetailRows', 0, 'missingStatisticRows', 0,
    'scoringStatisticsComplete', true, 'cleanSheetSource', 'official_minutes_and_on_pitch_goals_conceded',
    'goalkeeperStatistics', 'explicit_value_or_null_canonical_position_checked_in_database') as coverage
from generate_series(1, 25) n;
grant select on left_out_input to service_role;
create function pg_temp.ingest(coverage_extra jsonb) returns jsonb language sql as $$
  select api.ingest_current_player_fixture_performance('sportsmonks', '28647', '19950001',
    rows, coverage || coverage_extra, statement_timestamp()) from left_out_input $$;
create function pg_temp.rule(extra jsonb default '{}'::jsonb) returns jsonb language sql as
  $$ select '{"leaveOutUnplacedUnheld": true}'::jsonb || extra $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 1. Without the rule, nothing changes: the fixture waits on the first unplaced row.
select extensions.throws_ok($$select pg_temp.ingest('{}')$$, 'P0002', 'PLAYER_MAPPING_NOT_FOUND',
  'without the rule the fixture still waits for every lineup player');

-- 2. With it, the three rows nobody holds are left out and the rest come in.
select extensions.is(
  (select jsonb_build_object('active', r -> 'active', 'leftOut', r -> 'leftOut', 'placed', r -> 'placedAtFixtureClub')
   from pg_temp.ingest(pg_temp.rule()) r),
  '{"active": 22, "leftOut": 3, "placed": 0}', 'three left out, 22 placed');
reset role;
select extensions.is(
  (select jsonb_agg(jsonb_build_array(external_player_id, reason, goals) order by external_player_id)
   from app_private.current_fixture_left_out_players where fixture_id = pg_temp.uid('fixture')),
  '[["95011","no_provider_mapping",1],["95021","no_club_record",0],["95025","no_provider_mapping",0]]',
  'each left-out row is recorded by provider id with its reason and goals');
select extensions.is(
  (select jsonb_build_object('seen', lineup_rows_seen, 'valid', valid_player_rows, 'excluded', excluded_incomplete_rows,
     'mapping', excluded_mapping_rows, 'starters', starter_rows, 'anonymous', anonymous_starter_rows,
     'performance', performance_rows, 'complete', scoring_statistics_complete)
   from app_private.historical_performance_fixture_coverage where fixture_id = pg_temp.uid('fixture')),
  '{"seen": 25, "valid": 22, "excluded": 3, "mapping": 3, "starters": 22, "anonymous": 0, "performance": 22, "complete": true}',
  'coverage counts the left-out rows as excluded by mapping, never as unnamed starters');
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances where fixture_id = pg_temp.uid('fixture') and active),
  22, 'only placed players get a performance row');

-- 3. The same facts again change nothing.
set local role service_role;
select extensions.is(
  (select r ->> 'sourceVersion' from pg_temp.ingest(pg_temp.rule()) r),
  (select source_version from app_private.historical_performance_fixture_coverage where fixture_id = pg_temp.uid('fixture')),
  'a retry keeps the same source version');
reset role;
select extensions.is(
  (select count(*)::integer from app_private.current_fixture_left_out_players where fixture_id = pg_temp.uid('fixture')),
  3, 'a retry records nothing new');

-- 4. Scoring: the fixture is complete and its goals add up, though player 11's
-- goal belongs to nobody in the catalogue.
select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document_v1(app_private.fantasy_scoring_input_document_v1(pg_temp.uid('gameweek')))$$,
  'the scoring document accepts the fixture');
select extensions.is(
  app_private.fantasy_goal_reconciliation(app_private.fantasy_scoring_input_document_v1(pg_temp.uid('gameweek'))),
  '[]'::jsonb, 'a left-out scorer''s goal counts toward the final score');
update app_private.historical_performance_fixture_coverage set excluded_mapping_rows = 2, excluded_incomplete_rows = 3
where fixture_id = pg_temp.uid('fixture');
select extensions.throws_ok(
  $$select app_private.fantasy_validate_scoring_document_v1(app_private.fantasy_scoring_input_document_v1(pg_temp.uid('gameweek')))$$,
  'PT409', 'fantasy_scoring_coverage_incomplete', 'excluded rows must equal the recorded left-out rows');
update app_private.historical_performance_fixture_coverage set excluded_mapping_rows = 3
where fixture_id = pg_temp.uid('fixture');

-- 5. A left-out player some team holds: refused.
update app.fantasy_lineup_players set fantasy_player_id = pg_temp.uid('fantasy-player-21')
where lineup_id = pg_temp.uid('lineup') and fantasy_player_id = pg_temp.uid('fantasy-player-22');
set local role service_role;
select extensions.throws_ok($$select pg_temp.ingest(pg_temp.rule('{"note":1}'))$$, 'P0001', 'LEFT_OUT_PLAYER_HELD',
  'a held player is never left out');
-- 6. ...unless the owner places him at the club he played for.
select extensions.is(
  (select jsonb_build_object('active', r -> 'active', 'leftOut', r -> 'leftOut', 'placed', r -> 'placedAtFixtureClub')
   from pg_temp.ingest(pg_temp.rule('{"placeAtFixtureClub":[{"externalPlayerId":"95021","externalTeamId":"71002"}]}')) r),
  '{"active": 23, "leftOut": 2, "placed": 1}', 'a placed player gets his row at the fixture club');
reset role;
select extensions.is(
  (select team_id from app.player_fixture_performances
   where fixture_id = pg_temp.uid('fixture') and player_id = pg_temp.uid('player-21') and active),
  pg_temp.uid('team-2'), 'his row is at the club he played for');
select extensions.is(app_private.fantasy_goal_reconciliation(app_private.fantasy_scoring_input_document_v1(pg_temp.uid('gameweek'))),
  '[]'::jsonb, 'goals still add up after the placement');
set local role service_role;
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rule('{"placeAtFixtureClub":[{"externalPlayerId":"95020","externalTeamId":"71002"}]}'))$$,
  'P0001', 'OWNER_DECISION_STALE', 'a placement for a player who already has a club record is stale');
reset role;
update app.fantasy_lineup_players set fantasy_player_id = pg_temp.uid('fantasy-player-22')
where lineup_id = pg_temp.uid('lineup') and fantasy_player_id = pg_temp.uid('fantasy-player-21');

-- 7. A held player at one of the clubs with no mapping could be a left-out row: refused...
update app.fantasy_lineup_players set fantasy_player_id = pg_temp.uid('fantasy-player-26')
where lineup_id = pg_temp.uid('lineup') and fantasy_player_id = pg_temp.uid('fantasy-player-23');
set local role service_role;
select extensions.throws_ok($$select pg_temp.ingest(pg_temp.rule())$$, 'P0001', 'HELD_PLAYER_UNMAPPED',
  'an unmapped held player at either club stops the rule');
-- ...unless the owner confirmed he is not on the match sheet.
select extensions.lives_ok(
  format($$select pg_temp.ingest(pg_temp.rule('{"heldPlayersNotInSquad":["%s"]}'))$$, pg_temp.uid('fantasy-player-26')),
  'an owner-confirmed absence clears it');
select extensions.throws_ok(
  format($$select pg_temp.ingest(pg_temp.rule('{"heldPlayersNotInSquad":["%s"]}'))$$, pg_temp.uid('fantasy-player-2')),
  'P0001', 'OWNER_DECISION_STALE', 'an absence declared for a mapped player is stale');
reset role;
update app.fantasy_lineup_players set fantasy_player_id = pg_temp.uid('fantasy-player-23')
where lineup_id = pg_temp.uid('lineup') and fantasy_player_id = pg_temp.uid('fantasy-player-26');

-- 8. Who is held is settled only once every lineup is locked.
update app.fantasy_lineups set locked_at = null where id = pg_temp.uid('lineup');
set local role service_role;
select extensions.throws_ok($$select pg_temp.ingest(pg_temp.rule())$$, 'P0001', 'LEAVE_OUT_GAMEWEEK_NOT_LOCKED',
  'an unlocked lineup stops the rule');
reset role;
update app.fantasy_lineups set locked_at = statement_timestamp() - interval '3 days' where id = pg_temp.uid('lineup');

-- 9. Forwards whose goals conceded are unknown.
set local role service_role;
select extensions.lives_ok($$select pg_temp.ingest(pg_temp.rule('{"defensiveUnknownForwards":["95010"]}'))$$,
  'a placed forward may carry unknown goals conceded');
select extensions.lives_ok($$select pg_temp.ingest(pg_temp.rule('{"defensiveUnknownForwards":["95011"]}'))$$,
  'so may a left-out row');
select extensions.throws_ok($$select pg_temp.ingest(pg_temp.rule('{"defensiveUnknownForwards":["95006"]}'))$$,
  '22023', 'DEFENSIVE_UNKNOWN_NOT_FORWARD', 'a midfielder may not');
select extensions.throws_ok($$select pg_temp.ingest(pg_temp.rule('{"defensiveUnknownForwards":["95023"]}'))$$,
  '22023', 'DEFENSIVE_UNKNOWN_NOT_FORWARD', 'nor a row that did not start');

-- 10. Limits (20261004130000): up to 40 left-out rows, counted apart from the
-- unnamed ones (still at most 20); at least 11 rows kept.
reset role;
update app_private.football_provider_mappings set active = false
where provider_name = 'sportsmonks' and entity_type = 'player'
  and external_id in ('95005', '95009', '95015', '95016', '95019', '95020', '95024');
set local role service_role;
select extensions.is(
  (select jsonb_build_object('active', r -> 'active', 'leftOut', r -> 'leftOut')
   from pg_temp.ingest(pg_temp.rule('{"lineupRowsSeen":43,"excludedIncompleteRows":18}')) r),
  '{"active": 15, "leftOut": 10}', '28 rows left out in all (18 unnamed, 10 named) and 15 kept come in');
reset role;
select extensions.is(
  (select jsonb_build_array(valid_player_rows, excluded_incomplete_rows, excluded_mapping_rows)
   from app_private.historical_performance_fixture_coverage where fixture_id = pg_temp.uid('fixture')),
  '[15, 28, 10]', 'coverage keeps fewer than 22 rows when the rest were left out');
select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document_v1(app_private.fantasy_scoring_input_document_v1(pg_temp.uid('gameweek')))$$,
  'the scoring document accepts it');
update app_private.football_provider_mappings set active = false
where provider_name = 'sportsmonks' and entity_type = 'player'
  and external_id in ('95002', '95003', '95004', '95013', '95014');
set local role service_role;
select extensions.throws_ok($$select pg_temp.ingest(pg_temp.rule())$$,
  '22023', 'LEFT_OUT_ROWS_EXCEEDED', 'fewer than 11 rows kept stops the fixture');
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rule('{"lineupRowsSeen":46,"excludedIncompleteRows":21}'))$$,
  '22023', 'CURRENT_PERFORMANCE_INCOMPLETE', 'unnamed rows keep their own bound of 20');
reset role;
update app_private.football_provider_mappings set active = true
where provider_name = 'sportsmonks' and entity_type = 'player'
  and external_id in ('95002', '95003', '95004', '95005', '95009', '95013', '95014', '95015', '95016', '95019', '95020', '95024');
set local role service_role;
-- 11. Declarations have one exact shape.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rule('{"placeAtFixtureClub":[{"externalPlayerId":"95021","externalTeamId":"71002","x":1}]}'))$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a malformed declaration is refused');
reset role;

-- 12. Nothing to leave out: the existing import, unchanged.
insert into app.players (id, slug, full_name, display_name, position) values
  (pg_temp.uid('player-11'), 'left-out-player-11', 'Left Out Player 11', 'LOP 11', 'forward'),
  (pg_temp.uid('player-25'), 'left-out-player-25', 'Left Out Player 25', 'LOP 25', 'midfielder');
insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, active)
select pg_temp.uid('player-' || n), pg_temp.uid('team-' || pg_temp.club(n)), pg_temp.uid('season'), n, current_date - 30, true
from unnest(array[11, 21, 25]) n;
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at, active)
select 'sportsmonks', 'player', (95000 + n)::text, pg_temp.uid('player-' || n), 'lo', statement_timestamp(), true
from unnest(array[11, 25]) n;
set local role service_role;
select extensions.is((select r -> 'leftOut' from pg_temp.ingest(pg_temp.rule()) r), null,
  'with everyone placed the existing import answers');
reset role;
select extensions.is(
  (select jsonb_build_array(excluded_mapping_rows, performance_rows) from app_private.historical_performance_fixture_coverage
   where fixture_id = pg_temp.uid('fixture')), '[0, 25]', 'and records no left-out rows');
select extensions.is(
  (select count(*)::integer from app_private.current_fixture_left_out_players recorded
   join app_private.historical_performance_fixture_coverage coverage on coverage.fixture_id = recorded.fixture_id
     and coverage.source_version = recorded.coverage_source_version
   where recorded.fixture_id = pg_temp.uid('fixture')),
  0, 'earlier left-out records do not belong to the new version of the same facts');
select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document_v1(app_private.fantasy_scoring_input_document_v1(pg_temp.uid('gameweek')))$$,
  'the scoring document accepts the fixture with everyone placed');
select extensions.is(app_private.fantasy_goal_reconciliation(app_private.fantasy_scoring_input_document_v1(pg_temp.uid('gameweek'))),
  '[]'::jsonb, 'goals add up with everyone placed');

-- 13. Grants.
select extensions.ok(not has_function_privilege('authenticated',
  'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)', 'execute'),
  'browsers cannot import');
select extensions.ok(not has_function_privilege('service_role',
  'api.ingest_current_player_fixture_performance_v2(text,text,text,jsonb,jsonb,timestamptz)', 'execute'),
  'the renamed import is reachable only through the rule');
select extensions.ok(not has_table_privilege('service_role', 'app_private.current_fixture_left_out_players', 'insert'),
  'only the import records left-out rows');

select * from extensions.finish();
rollback;
