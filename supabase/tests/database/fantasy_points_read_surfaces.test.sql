begin;

select extensions.no_plan();

-- BG-0074 / BG-0075. The Fantasy read surfaces that could only ever render a
-- blank manager name or a zero.
--
-- Three things are pinned here and nothing else:
--
--   1. api.fantasy_league_standings carries `managerName`, under exactly the
--      rule api.fantasy_overall_standings already uses -- profile display name
--      for signed-in callers, fantasy team name otherwise -- and its signature,
--      row order and existing keys are untouched.
--   2. api.fantasy_gameweek_summary answers null (never 0) while nobody has
--      been scored, aggregates correctly once they have, and is callable by
--      anon without USAGE on schema `app`.
--   3. api.get_my_fantasy_points carries the per-player scoring events and the
--      auto-substitutions, so the acceptance case -- a captain double, a -4
--      transfer hit and one auto-substitution -- is all visible on the page.
--
-- The fixture is built here rather than taken from
-- scripts/backend/fantasy-staging-seed.sql: that seed is a 50 000-team
-- capacity load set that writes no point events and no auto-substitutions at
-- all, so it cannot express the acceptance case. A pgTAP file also has to be
-- self-contained and roll back.

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('b0740000-0000-4000-8000-000000000000'::uuid, 'MB', 'MBG');

insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('b0740000-0000-4000-8000-000000000001', 'bg0074-league', 'BG0074 League', 'B74',
  'league', 'b0740000-0000-4000-8000-000000000000');

insert into app.seasons (id, competition_id, label, starts_on, ends_on, status)
values ('b0740000-0000-4000-8000-000000000002', 'b0740000-0000-4000-8000-000000000001',
  'BG0074 Season', '2099-08-01', '2100-06-30', 'active');

insert into app.rounds (id, season_id, round_number, name, status)
values
  ('b0740000-0000-4000-8000-000000000003', 'b0740000-0000-4000-8000-000000000002', 1, 'R1', 'completed'),
  ('b0740000-0000-4000-8000-000000000004', 'b0740000-0000-4000-8000-000000000002', 2, 'R2', 'planned');

insert into app.teams (id, slug, name, short_name, country_id)
values
  ('b0740000-0000-4000-8000-000000000005', 'bg0074-club-home', 'BG0074 Club', 'B74C',
    'b0740000-0000-4000-8000-000000000000'),
  ('b0740000-0000-4000-8000-00000000000b', 'bg0074-club-away', 'BG0074 Rivals', 'B74R',
    'b0740000-0000-4000-8000-000000000000');

insert into app.players (id, slug, full_name, display_name, position)
select ('b0740000-0000-4000-8000-0000000001' || lpad(number::text, 2, '0'))::uuid,
  'bg0074-player-' || number, 'BG0074 Player ' || number, 'Player ' || number,
  case when number <= 2 then 'goalkeeper'::app.football_position
    when number <= 7 then 'defender'::app.football_position
    when number <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 15) number;

insert into app.fixtures (
  id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, provider_updated_at
)
values ('b0740000-0000-4000-8000-000000000006', 'b0740000-0000-4000-8000-000000000001',
  'b0740000-0000-4000-8000-000000000002', 'b0740000-0000-4000-8000-000000000003',
  'b0740000-0000-4000-8000-000000000005', 'b0740000-0000-4000-8000-00000000000b',
  '2099-08-05T15:00:00Z', '2099-08-05T17:00:00Z');

insert into app.fantasy_competitions (id, football_competition_id, slug, name)
values ('b0740000-0000-4000-8000-000000000007', 'b0740000-0000-4000-8000-000000000001',
  'bg0074-fantasy', 'BG0074 Fantasy');

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('b0740000-0000-4000-8000-000000000008', 'b0740000-0000-4000-8000-000000000007',
  'b0740000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000100',
  'BG0074 Fantasy Season', 'active', '2099-08-01', '2100-06-30');

insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, finalized_at
) values
  ('b0740000-0000-4000-8000-000000000009', 'b0740000-0000-4000-8000-000000000008',
    'b0740000-0000-4000-8000-000000000003', 1, 'GW1',
    '2099-08-05T13:30:00Z', '2099-08-05T15:00:00Z', '2099-08-07T22:00:00Z',
    'finalized', 'final', '2099-08-08T00:00:00Z'),
  ('b0740000-0000-4000-8000-00000000000a', 'b0740000-0000-4000-8000-000000000008',
    'b0740000-0000-4000-8000-000000000004', 2, 'GW2',
    '2099-08-12T13:30:00Z', '2099-08-12T15:00:00Z', '2099-08-14T22:00:00Z',
    'open', 'provisional', null);

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id, position_id, price
)
select ('b0740000-0000-4000-8000-0000000002' || lpad(number::text, 2, '0'))::uuid,
  'b0740000-0000-4000-8000-000000000008',
  ('b0740000-0000-4000-8000-0000000001' || lpad(number::text, 2, '0'))::uuid,
  'b0740000-0000-4000-8000-000000000005',
  (select id from app.fantasy_positions where code = case
    when number <= 2 then 'GK' when number <= 7 then 'DEF'
    when number <= 12 then 'MID' else 'FWD' end),
  5.0
from generate_series(1, 15) number;

-- Three managers, covering the three branches of the display_name fallback: a
-- real name, an empty one (app.profiles allows exactly '' and nothing else
-- blank -- profiles_display_name_check), and a soft-deleted profile.
set session_replication_role = replica;
insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
values
  ('b0740000-0000-4000-8000-000000000031', 'bg0074-a@example.invalid', now(), now(), now()),
  ('b0740000-0000-4000-8000-000000000032', 'bg0074-b@example.invalid', now(), now(), now()),
  ('b0740000-0000-4000-8000-000000000033', 'bg0074-c@example.invalid', now(), now(), now());
set session_replication_role = origin;

insert into app.profiles (id, display_name, created_at, deleted_at)
values
  ('b0740000-0000-4000-8000-000000000031', 'Amina Benali', now(), null),
  ('b0740000-0000-4000-8000-000000000032', '', now(), null),
  ('b0740000-0000-4000-8000-000000000033', 'Ghost Manager',
    now() - interval '1 day', now());

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name,
  bank, team_value, free_transfers
) values
  ('b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000031',
    'b0740000-0000-4000-8000-000000000008', 'b0740000-0000-4000-8000-00000000000a',
    'Atlas Lions', 2.0, 100.0, 1),
  ('b0740000-0000-4000-8000-000000000042', 'b0740000-0000-4000-8000-000000000032',
    'b0740000-0000-4000-8000-000000000008', 'b0740000-0000-4000-8000-00000000000a',
    'Blank Name FC', 2.0, 100.0, 1),
  ('b0740000-0000-4000-8000-000000000043', 'b0740000-0000-4000-8000-000000000033',
    'b0740000-0000-4000-8000-000000000008', 'b0740000-0000-4000-8000-00000000000a',
    'Deleted Profile United', 2.0, 100.0, 1);

insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility,
  invite_code_digest, invite_code_hint, member_count
) values ('b0740000-0000-4000-8000-000000000051', 'b0740000-0000-4000-8000-000000000008',
  'b0740000-0000-4000-8000-000000000031', 'BG0074 Private League', 'private',
  repeat('a', 64), 'AB12', 3);

insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role)
values
  ('b0740000-0000-4000-8000-000000000051', 'b0740000-0000-4000-8000-000000000041',
    'b0740000-0000-4000-8000-000000000031', 'owner'),
  ('b0740000-0000-4000-8000-000000000051', 'b0740000-0000-4000-8000-000000000042',
    'b0740000-0000-4000-8000-000000000032', 'member'),
  ('b0740000-0000-4000-8000-000000000051', 'b0740000-0000-4000-8000-000000000043',
    'b0740000-0000-4000-8000-000000000033', 'member');

-- A public league with the same three teams, so the anonymous branch of the
-- managerName rule can be exercised without tripping the private-league
-- membership check first.
insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility, member_count
) values ('b0740000-0000-4000-8000-000000000052', 'b0740000-0000-4000-8000-000000000008',
  'b0740000-0000-4000-8000-000000000031', 'BG0074 Public League', 'public', 3);

insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role)
values
  ('b0740000-0000-4000-8000-000000000052', 'b0740000-0000-4000-8000-000000000041',
    'b0740000-0000-4000-8000-000000000031', 'owner'),
  ('b0740000-0000-4000-8000-000000000052', 'b0740000-0000-4000-8000-000000000042',
    'b0740000-0000-4000-8000-000000000032', 'member'),
  ('b0740000-0000-4000-8000-000000000052', 'b0740000-0000-4000-8000-000000000043',
    'b0740000-0000-4000-8000-000000000033', 'member');

insert into app.fantasy_rankings (
  fantasy_season_id, gameweek_id, league_id, fantasy_team_id,
  rank, total_points, gameweek_points, calculation_version, calculated_at
)
select 'b0740000-0000-4000-8000-000000000008', null, league, team, rank, points, points, 1, now()
from (values
  ('b0740000-0000-4000-8000-000000000041'::uuid, 1::bigint, 60),
  ('b0740000-0000-4000-8000-000000000042'::uuid, 2::bigint, 44),
  ('b0740000-0000-4000-8000-000000000043'::uuid, 3::bigint, 30)
) as standing(team, rank, points)
cross join (values
  ('b0740000-0000-4000-8000-000000000051'::uuid),
  ('b0740000-0000-4000-8000-000000000052'::uuid)
) as leagues(league);

-- ---------------------------------------------------------------------------
-- BG-0074 -- managerName, and nothing else about the league reader, changed
-- ---------------------------------------------------------------------------

-- The BG-0063 trap: an argument is coerced to its parameter type in the
-- CALLER's context, so an app-schema type in a public signature would force
-- anon to hold USAGE on app. Both readers must stay on pg_catalog types.
select extensions.ok(
  not has_schema_privilege('anon', 'app', 'usage'),
  'anon still holds no USAGE on the app schema'
);
select extensions.is(
  (select pg_get_function_identity_arguments(procedure.oid)
     from pg_proc procedure
     join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api' and procedure.proname = 'fantasy_league_standings'),
  'p_league_id uuid, p_gameweek_id uuid, p_after_rank bigint, p_after_team_id uuid, p_limit integer',
  'api.fantasy_league_standings keeps its exact signature'
);
select extensions.ok(
  has_function_privilege('anon', 'api.fantasy_league_standings(uuid, uuid, bigint, uuid, integer)', 'execute'),
  'anon can still execute api.fantasy_league_standings'
);
select extensions.ok(
  not exists (
    select 1 from app.profiles
    where has_table_privilege('anon', 'app.profiles', 'select')
  ),
  'anon holds no select privilege on app.profiles'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b0740000-0000-4000-8000-000000000031","role":"authenticated"}', true);

select extensions.is(
  api.fantasy_league_standings('b0740000-0000-4000-8000-000000000051') #>> '{items,0,managerName}',
  'Amina Benali',
  'a signed-in league member sees the profile display name'
);
select extensions.is(
  api.fantasy_league_standings('b0740000-0000-4000-8000-000000000051') #>> '{items,1,managerName}',
  'Blank Name FC',
  'an empty display_name falls back to the fantasy team name'
);
select extensions.is(
  api.fantasy_league_standings('b0740000-0000-4000-8000-000000000051') #>> '{items,2,managerName}',
  'Deleted Profile United',
  'a soft-deleted profile falls back to the fantasy team name'
);

-- Row order and every pre-existing key are unchanged by the added field.
select extensions.is(
  (select array_agg(item ->> 'teamName' order by ordinality)
     from jsonb_array_elements(
       api.fantasy_league_standings('b0740000-0000-4000-8000-000000000051') -> 'items'
     ) with ordinality as page(item, ordinality)),
  array['Atlas Lions', 'Blank Name FC', 'Deleted Profile United'],
  'the league page is still ordered by rank, then team id'
);
select extensions.is(
  (select array_agg(key order by key)
     from jsonb_object_keys(
       api.fantasy_league_standings('b0740000-0000-4000-8000-000000000051') #> '{items,0}'
     ) as key),
  array['calculatedAt', 'gameweekPoints', 'managerName', 'previousRank', 'rank',
    'teamId', 'teamName', 'totalPoints'],
  'the item shape is the previous one plus managerName, nothing removed'
);

reset role;

-- ---------------------------------------------------------------------------
-- BG-0075 -- the gameweek summary. Null, never zero.
-- ---------------------------------------------------------------------------

select extensions.ok(
  has_function_privilege('anon', 'api.fantasy_gameweek_summary(uuid)', 'execute'),
  'anon can execute api.fantasy_gameweek_summary -- /fantasy/points is public'
);
select extensions.throws_ok(
  $$select api.fantasy_gameweek_summary(null)$$,
  'PT400', 'validation_failed',
  'a null gameweek id is a client bug, not a 500'
);
select extensions.throws_ok(
  $$select api.fantasy_gameweek_summary('b0740000-0000-4000-8000-0000000000ff')$$,
  'PT404', 'fantasy_gameweek_not_found',
  'an unknown gameweek is a 404'
);

-- Nobody has been scored in GW2. This is production today.
select extensions.ok(
  api.fantasy_gameweek_summary('b0740000-0000-4000-8000-00000000000a') -> 'averagePoints'
    = 'null'::jsonb,
  'an unscored gameweek returns a null average, not 0'
);
select extensions.ok(
  api.fantasy_gameweek_summary('b0740000-0000-4000-8000-00000000000a') -> 'highestPoints'
    = 'null'::jsonb,
  'an unscored gameweek returns a null highest, not 0'
);
select extensions.is(
  (api.fantasy_gameweek_summary('b0740000-0000-4000-8000-00000000000a') ->> 'teamCount')::bigint,
  0::bigint,
  'teamCount tells an unscored gameweek apart from an average that is really 0'
);

-- Now score GW1. 60 (final), 44 (final) and 30 (still provisional) -> the mean
-- is 44.666..., and the reader must use coalesce(final, provisional) so the
-- provisional team is counted exactly as api.get_my_fantasy_history counts it.
insert into app.fantasy_team_gameweek_results (
  fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points,
  transfer_hit, provisional_score, final_score, state, calculation_version, finalized_at
) values
  ('b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009',
    56, 4, 8, 4, 60, 60, 'final', 1, now()),
  ('b0740000-0000-4000-8000-000000000042', 'b0740000-0000-4000-8000-000000000009',
    44, 2, 0, 0, 44, 44, 'final', 1, now()),
  ('b0740000-0000-4000-8000-000000000043', 'b0740000-0000-4000-8000-000000000009',
    30, 1, 0, 0, 30, null, 'provisional', 1, null);

select extensions.is(
  (api.fantasy_gameweek_summary('b0740000-0000-4000-8000-000000000009') ->> 'averagePoints')::numeric,
  44.7::numeric,
  'the average is the mean of coalesce(final_score, provisional_score)'
);
select extensions.is(
  (api.fantasy_gameweek_summary('b0740000-0000-4000-8000-000000000009') ->> 'highestPoints')::integer,
  60,
  'the highest is the best score in the gameweek'
);
select extensions.is(
  (api.fantasy_gameweek_summary('b0740000-0000-4000-8000-000000000009') ->> 'teamCount')::bigint,
  3::bigint,
  'teamCount counts every scored team, provisional ones included'
);
select extensions.is(
  api.fantasy_gameweek_summary('b0740000-0000-4000-8000-000000000009') ->> 'pointsState',
  'final',
  'the summary reports the gameweek points state'
);

-- ---------------------------------------------------------------------------
-- BG-0075 -- the acceptance case, end to end on one page read:
-- one captain double, one -4 transfer hit, one auto-substitution.
-- ---------------------------------------------------------------------------

insert into app.fantasy_lineups (
  id, fantasy_team_id, gameweek_id, team_version, locked_at, finalized_at
) values ('b0740000-0000-4000-8000-000000000061', 'b0740000-0000-4000-8000-000000000041',
  'b0740000-0000-4000-8000-000000000009', 1, now() - interval '1 hour', now());

-- Players 1..11 start, 12..15 are the bench. Player 9 is the captain on a x2
-- multiplier; player 13 is the vice. Player 11 did not play and is replaced.
insert into app.fantasy_lineup_players (
  lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain,
  multiplier, snapshot_price
)
select 'b0740000-0000-4000-8000-000000000061',
  ('b0740000-0000-4000-8000-0000000002' || lpad(number::text, 2, '0'))::uuid,
  case when number <= 11 then 'starter'::app.fantasy_lineup_slot
    else 'bench'::app.fantasy_lineup_slot end,
  case when number <= 11 then number else number - 11 end,
  number = 9, number = 13,
  case when number = 9 then 2 else 1 end, 5.0
from generate_series(1, 15) number;

insert into app.fantasy_player_gameweek_points (
  fantasy_player_id, gameweek_id, provisional_points, final_points,
  minutes_played, did_play, calculation_version, football_input_version, finalized_at
)
select ('b0740000-0000-4000-8000-0000000002' || lpad(number::text, 2, '0'))::uuid,
  'b0740000-0000-4000-8000-000000000009',
  case when number = 11 then 0 when number = 9 then 8 else 3 end,
  case when number = 11 then 0 when number = 9 then 8 else 3 end,
  case when number = 11 then 0 else 90 end,
  number <> 11, 1, 1, now()
from generate_series(1, 15) number;

-- The captain's 8 points, itemised. The superseded row is the pre-correction
-- copy of the goal line and must never reach the page.
insert into app.fantasy_player_point_events (
  fantasy_player_id, gameweek_id, fixture_id, category, points, state,
  scoring_version, source_sequence, source_key, superseded_at
) values
  ('b0740000-0000-4000-8000-000000000209', 'b0740000-0000-4000-8000-000000000009',
    'b0740000-0000-4000-8000-000000000006', 'appearance', 2, 'final', 1, 1,
    'fixture-stats:bg0074:p9:appearance', null),
  ('b0740000-0000-4000-8000-000000000209', 'b0740000-0000-4000-8000-000000000009',
    'b0740000-0000-4000-8000-000000000006', 'goal', 5, 'final', 1, 2,
    'fixture-stats:bg0074:p9:goal', null),
  ('b0740000-0000-4000-8000-000000000209', 'b0740000-0000-4000-8000-000000000009',
    'b0740000-0000-4000-8000-000000000006', 'assist', 3, 'final', 1, 3,
    'fixture-stats:bg0074:p9:assist', null),
  ('b0740000-0000-4000-8000-000000000209', 'b0740000-0000-4000-8000-000000000009',
    'b0740000-0000-4000-8000-000000000006', 'yellow_card', -2, 'final', 1, 4,
    'fixture-stats:bg0074:p9:superseded-goal', now());

insert into app.fantasy_auto_substitutions (
  lineup_id, player_out_id, player_in_id, sequence_number, reason, calculation_version
) values ('b0740000-0000-4000-8000-000000000061',
  'b0740000-0000-4000-8000-000000000211', 'b0740000-0000-4000-8000-000000000212',
  1, 'outfield_did_not_play', 1);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b0740000-0000-4000-8000-000000000031","role":"authenticated"}', true);

-- The -4 transfer hit was already in the fixture's result row.
select extensions.is(
  (api.get_my_fantasy_points(
    'b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009'
  ) #>> '{result,transferHit}')::integer,
  4,
  'acceptance: the -4 transfer hit reaches the page'
);
select extensions.is(
  (select (item ->> 'multiplier')::numeric
     from jsonb_array_elements(api.get_my_fantasy_points(
       'b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009'
     ) -> 'players') as item
    where (item ->> 'captain')::boolean),
  2.00::numeric,
  'acceptance: the captain double reaches the page'
);
select extensions.is(
  api.get_my_fantasy_points(
    'b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009'
  ) #>> '{autoSubstitutions,0,reason}',
  'outfield_did_not_play',
  'acceptance: the auto-substitution reaches the page'
);
select extensions.is(
  api.get_my_fantasy_points(
    'b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009'
  ) #>> '{autoSubstitutions,0,playerOutId}',
  'b0740000-0000-4000-8000-000000000211',
  'the substitution names the player who came out'
);
select extensions.is(
  jsonb_array_length(api.get_my_fantasy_points(
    'b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009'
  ) -> 'autoSubstitutions'),
  1,
  'only this team''s substitutions are returned'
);

-- The per-player breakdown: three live lines, the superseded one dropped.
select extensions.is(
  (select array_agg(event ->> 'category' order by event ->> 'category')
     from jsonb_array_elements(
       (select item -> 'events'
          from jsonb_array_elements(api.get_my_fantasy_points(
            'b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009'
          ) -> 'players') as item
         where item ->> 'fantasyPlayerId' = 'b0740000-0000-4000-8000-000000000209')
     ) as event),
  array['appearance', 'assist', 'goal'],
  'the breakdown shows the live scoring lines and drops the superseded one'
);
select extensions.is(
  (select sum((event ->> 'points')::integer)
     from jsonb_array_elements(
       (select item -> 'events'
          from jsonb_array_elements(api.get_my_fantasy_points(
            'b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009'
          ) -> 'players') as item
         where item ->> 'fantasyPlayerId' = 'b0740000-0000-4000-8000-000000000209')
     ) as event),
  10::bigint,
  'the live lines sum to the pre-multiplier total the ledger recorded'
);
select extensions.is(
  (select item -> 'events'
     from jsonb_array_elements(api.get_my_fantasy_points(
       'b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009'
     ) -> 'players') as item
    where item ->> 'fantasyPlayerId' = 'b0740000-0000-4000-8000-000000000201'),
  '[]'::jsonb,
  'a player with no ledger rows gets an empty array, never null'
);

-- Ownership is still asserted: the added fields did not widen the RPC.
select set_config('request.jwt.claims',
  '{"sub":"b0740000-0000-4000-8000-000000000032","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.get_my_fantasy_points(
    'b0740000-0000-4000-8000-000000000041', 'b0740000-0000-4000-8000-000000000009')$$,
  'PT404', 'fantasy_team_not_found',
  'another manager still cannot read this team''s points'
);

reset role;

-- An anonymous caller gets the team name for every row and never a profile
-- field, which is the whole point of the BG-0074 rule.
set local role anon;
select set_config('request.jwt.claims', '', true);
select extensions.is(
  (select count(*) from jsonb_array_elements(
     api.fantasy_league_standings('b0740000-0000-4000-8000-000000000052') -> 'items'
   ) as item
   where item ->> 'managerName' = item ->> 'teamName'),
  3::bigint,
  'an anonymous caller sees team names only, never a display_name'
);
select extensions.throws_ok(
  $$select api.fantasy_league_standings('b0740000-0000-4000-8000-000000000051')$$,
  'PT403', 'league_access_denied',
  'the private-league membership check is unchanged for anonymous callers'
);
select extensions.ok(
  api.fantasy_gameweek_summary('b0740000-0000-4000-8000-00000000000a') -> 'averagePoints'
    = 'null'::jsonb,
  'an anonymous caller can read the gameweek summary without USAGE on app'
);

reset role;

rollback;
