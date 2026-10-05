begin;

select extensions.no_plan();

-- Fantasy R4 / P6 -- opt-in public gameweek recaps
-- (20261005130000_fantasy_public_recaps.sql).
--
-- Pinned here: the switches start off and gate publish and read separately;
-- only the signed-in owner publishes, only a final result, with a valid
-- alias; publishing is idempotent; the public read is anonymous, narrow and
-- built server-side; an unknown, revoked or switched-off id answers the same
-- null; a revoked link never comes back and republishing mints a new id; a
-- correction shows on the link; figures that do not add up drop the captain;
-- and neither anon nor authenticated can touch the table directly.

-- ---------------------------------------------------------------------------
-- Fixture (as fantasy_points_read_surfaces.test.sql builds it)
-- ---------------------------------------------------------------------------

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('c4c40000-0000-4000-8000-000000000000'::uuid, 'MR', 'MRC');

insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('c4c40000-0000-4000-8000-000000000001', 'r4rec-league', 'R4REC League', 'R4R',
  'league', 'c4c40000-0000-4000-8000-000000000000');

insert into app.seasons (id, competition_id, label, starts_on, ends_on, status)
values ('c4c40000-0000-4000-8000-000000000002', 'c4c40000-0000-4000-8000-000000000001',
  'R4REC Season', '2099-08-01', '2100-06-30', 'active');

insert into app.rounds (id, season_id, round_number, name, status)
values
  ('c4c40000-0000-4000-8000-000000000003', 'c4c40000-0000-4000-8000-000000000002', 1, 'R1', 'completed'),
  ('c4c40000-0000-4000-8000-000000000004', 'c4c40000-0000-4000-8000-000000000002', 2, 'R2', 'planned');

insert into app.teams (id, slug, name, short_name, country_id)
values
  ('c4c40000-0000-4000-8000-000000000005', 'r4rec-club-home', 'R4REC Club', 'R4C',
    'c4c40000-0000-4000-8000-000000000000'),
  ('c4c40000-0000-4000-8000-00000000000b', 'r4rec-club-away', 'R4REC Rivals', 'R4X',
    'c4c40000-0000-4000-8000-000000000000');

insert into app.players (id, slug, full_name, display_name, position)
select ('c4c40000-0000-4000-8000-0000000001' || lpad(number::text, 2, '0'))::uuid,
  'r4rec-player-' || number, 'R4REC Player ' || number, 'Player ' || number,
  case when number <= 2 then 'goalkeeper'::app.football_position
    when number <= 7 then 'defender'::app.football_position
    when number <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 15) number;

insert into app.fixtures (
  id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, provider_updated_at
)
values ('c4c40000-0000-4000-8000-000000000006', 'c4c40000-0000-4000-8000-000000000001',
  'c4c40000-0000-4000-8000-000000000002', 'c4c40000-0000-4000-8000-000000000003',
  'c4c40000-0000-4000-8000-000000000005', 'c4c40000-0000-4000-8000-00000000000b',
  '2099-08-05T15:00:00Z', '2099-08-05T17:00:00Z');

insert into app.fantasy_competitions (id, football_competition_id, slug, name)
values ('c4c40000-0000-4000-8000-000000000007', 'c4c40000-0000-4000-8000-000000000001',
  'r4rec-fantasy', 'R4REC Fantasy');

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('c4c40000-0000-4000-8000-000000000008', 'c4c40000-0000-4000-8000-000000000007',
  'c4c40000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000100',
  'R4REC Fantasy Season', 'active', '2099-08-01', '2100-06-30');

insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, finalized_at
) values
  ('c4c40000-0000-4000-8000-000000000009', 'c4c40000-0000-4000-8000-000000000008',
    'c4c40000-0000-4000-8000-000000000003', 1, 'GW1',
    '2099-08-05T13:30:00Z', '2099-08-05T15:00:00Z', '2099-08-07T22:00:00Z',
    'finalized', 'final', '2099-08-08T00:00:00Z'),
  ('c4c40000-0000-4000-8000-00000000000a', 'c4c40000-0000-4000-8000-000000000008',
    'c4c40000-0000-4000-8000-000000000004', 2, 'GW2',
    '2099-08-12T13:30:00Z', '2099-08-12T15:00:00Z', '2099-08-14T22:00:00Z',
    'open', 'provisional', null);

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id, position_id, price
)
select ('c4c40000-0000-4000-8000-0000000002' || lpad(number::text, 2, '0'))::uuid,
  'c4c40000-0000-4000-8000-000000000008',
  ('c4c40000-0000-4000-8000-0000000001' || lpad(number::text, 2, '0'))::uuid,
  'c4c40000-0000-4000-8000-000000000005',
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
  ('c4c40000-0000-4000-8000-000000000031', 'r4rec-a@example.invalid', now(), now(), now()),
  ('c4c40000-0000-4000-8000-000000000032', 'r4rec-b@example.invalid', now(), now(), now()),
  ('c4c40000-0000-4000-8000-000000000033', 'r4rec-c@example.invalid', now(), now(), now());
set session_replication_role = origin;

insert into app.profiles (id, display_name, created_at, deleted_at)
values
  ('c4c40000-0000-4000-8000-000000000031', 'Amina Benali', now(), null),
  ('c4c40000-0000-4000-8000-000000000032', '', now(), null),
  ('c4c40000-0000-4000-8000-000000000033', 'Ghost Manager',
    now() - interval '1 day', now());

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name,
  bank, team_value, free_transfers
) values
  ('c4c40000-0000-4000-8000-000000000041', 'c4c40000-0000-4000-8000-000000000031',
    'c4c40000-0000-4000-8000-000000000008', 'c4c40000-0000-4000-8000-00000000000a',
    'Atlas Lions', 2.0, 100.0, 1),
  ('c4c40000-0000-4000-8000-000000000042', 'c4c40000-0000-4000-8000-000000000032',
    'c4c40000-0000-4000-8000-000000000008', 'c4c40000-0000-4000-8000-00000000000a',
    'Blank Name FC', 2.0, 100.0, 1),
  ('c4c40000-0000-4000-8000-000000000043', 'c4c40000-0000-4000-8000-000000000033',
    'c4c40000-0000-4000-8000-000000000008', 'c4c40000-0000-4000-8000-00000000000a',
    'Deleted Profile United', 2.0, 100.0, 1);

-- Amina's GW1 result: starters 50 (captain's own 8 inside), bonus 8, hit 4.
insert into app.fantasy_player_gameweek_points (
  fantasy_player_id, gameweek_id, provisional_points, final_points,
  minutes_played, did_play, calculation_version, football_input_version, finalized_at
) values ('c4c40000-0000-4000-8000-000000000213', 'c4c40000-0000-4000-8000-000000000009',
  8, 8, 90, true, 3, 1, '2099-08-08T00:00:00Z');

insert into app.fantasy_team_gameweek_results (
  fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points, transfer_hit,
  chip_type, provisional_score, final_score, state, calculation_version, finalized_at,
  scoring_details
) values
  ('c4c40000-0000-4000-8000-000000000041', 'c4c40000-0000-4000-8000-000000000009',
    50, 6, 8, 4, null, 54, 54, 'final', 3, '2099-08-08T00:00:00Z',
    jsonb_build_object(
      'effectiveCaptainId', 'c4c40000-0000-4000-8000-000000000213',
      'players', jsonb_build_array(jsonb_build_object(
        'fantasyPlayerId', 'c4c40000-0000-4000-8000-000000000213', 'multiplier', 2)))),
  ('c4c40000-0000-4000-8000-000000000041', 'c4c40000-0000-4000-8000-00000000000a',
    10, 0, 0, 0, null, 10, null, 'provisional', 1, null, null);

-- The public ids the steps below mint, kept across role switches.
create temporary table r4_ids (label text primary key, public_id text) on commit drop;
grant all on r4_ids to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Grants and switches
-- ---------------------------------------------------------------------------

select extensions.ok(
  not has_table_privilege('anon', 'app.fantasy_public_recaps', 'select')
  and not has_table_privilege('authenticated', 'app.fantasy_public_recaps', 'select')
  and not has_table_privilege('authenticated', 'app.fantasy_public_recaps', 'insert'),
  'no client role reads or writes the publications table directly'
);
select extensions.ok(
  has_function_privilege('anon', 'api.public_fantasy_gameweek_recap(text)', 'execute'),
  'anon can read a public recap'
);
select extensions.ok(
  not has_function_privilege('anon', 'api.publish_fantasy_gameweek_recap(uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'api.revoke_fantasy_gameweek_recap(text)', 'execute'),
  'anon can neither publish nor revoke'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'app_private.fantasy_public_recap_configure(boolean, boolean)', 'execute')
  and not has_function_privilege('service_role', 'app_private.fantasy_public_recap_configure(boolean, boolean)', 'execute'),
  'no client role can flip the switches'
);
select extensions.is(
  (select array[publish_enabled, read_enabled] from app_private.fantasy_public_recap_settings),
  array[false, false],
  'both switches start off'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c4c40000-0000-4000-8000-000000000031","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.publish_fantasy_gameweek_recap('c4c40000-0000-4000-8000-000000000041',
    'c4c40000-0000-4000-8000-000000000009', 'Atlas Lions')$$,
  'PT403', 'public_recap_disabled', 'publishing is refused while the switch is off'
);
reset role;

select app_private.fantasy_public_recap_configure(true, true);

-- ---------------------------------------------------------------------------
-- Publish
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c4c40000-0000-4000-8000-000000000031","role":"authenticated"}', true);

select extensions.throws_ok(
  $$select api.publish_fantasy_gameweek_recap('c4c40000-0000-4000-8000-000000000041',
    'c4c40000-0000-4000-8000-00000000000a', 'Atlas Lions')$$,
  'PT409', 'public_recap_not_final', 'a gameweek that is not final cannot be published'
);
select extensions.throws_ok(
  $$select api.publish_fantasy_gameweek_recap('c4c40000-0000-4000-8000-000000000041',
    'c4c40000-0000-4000-8000-000000000009', ' x ')$$,
  'PT400', 'public_recap_alias_invalid', 'an alias under two characters is refused'
);
select extensions.throws_ok(
  $$select api.publish_fantasy_gameweek_recap('c4c40000-0000-4000-8000-000000000042',
    'c4c40000-0000-4000-8000-000000000009', 'Not mine')$$,
  'PT403', 'fantasy_team_forbidden', 'nobody publishes another manager''s team'
);

insert into r4_ids
select 'first', api.publish_fantasy_gameweek_recap('c4c40000-0000-4000-8000-000000000041',
  'c4c40000-0000-4000-8000-000000000009', '  Atlas Lions  ') ->> 'publicId';

select extensions.matches(
  (select public_id from r4_ids where label = 'first'),
  '^[A-Za-z0-9_-]{22}$',
  'the public id is 22 base64url characters (128 random bits)'
);
select extensions.is(
  api.publish_fantasy_gameweek_recap('c4c40000-0000-4000-8000-000000000041',
    'c4c40000-0000-4000-8000-000000000009', 'Atlas') ->> 'publicId',
  (select public_id from r4_ids where label = 'first'),
  'publishing again returns the same live publication'
);
select extensions.is(
  api.my_fantasy_gameweek_recap_publication('c4c40000-0000-4000-8000-000000000041',
    'c4c40000-0000-4000-8000-000000000009') #>> '{publication,alias}',
  'Atlas',
  'the owner sees the live publication with its latest alias'
);

reset role;

-- ---------------------------------------------------------------------------
-- The public read
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '', true);

select extensions.is(
  api.public_fantasy_gameweek_recap((select public_id from r4_ids where label = 'first'))
    - 'updatedAt',
  jsonb_build_object(
    'seasonName', 'R4REC Fantasy Season', 'gameweek', 1, 'alias', 'Atlas', 'total', 54,
    'corrected', false, 'calculationVersion', 3, 'reconciled', true, 'transferHit', 4,
    'chipType', null,
    'captain', jsonb_build_object('name', 'Player 13', 'points', 8, 'multiplier', 2, 'counted', 16)
  ),
  'anon reads the narrow projection, built from the stored result'
);
select extensions.ok(
  not (api.public_fantasy_gameweek_recap((select public_id from r4_ids where label = 'first'))
    ?| array['teamId', 'userId', 'email', 'teamName', 'managerName', 'leagues', 'squad']),
  'no ids, names, leagues or squad in the public projection'
);
select extensions.ok(
  api.public_fantasy_gameweek_recap('AAAAAAAAAAAAAAAAAAAAAA') is null
  and api.public_fantasy_gameweek_recap('not a valid id') is null,
  'an unknown or malformed id answers null'
);

reset role;

-- ---------------------------------------------------------------------------
-- Revoke, republish, correct, switch off
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c4c40000-0000-4000-8000-000000000032","role":"authenticated"}', true);
select extensions.throws_ok(
  format('select api.revoke_fantasy_gameweek_recap(%L)',
    (select public_id from r4_ids where label = 'first')),
  'PT404', 'public_recap_not_found', 'another account cannot revoke the link'
);

select set_config('request.jwt.claims',
  '{"sub":"c4c40000-0000-4000-8000-000000000031","role":"authenticated"}', true);
select extensions.lives_ok(
  format('select api.revoke_fantasy_gameweek_recap(%L); select api.revoke_fantasy_gameweek_recap(%L)',
    (select public_id from r4_ids where label = 'first'),
    (select public_id from r4_ids where label = 'first')),
  'the owner revokes, and revoking twice is harmless'
);
select extensions.ok(
  api.public_fantasy_gameweek_recap((select public_id from r4_ids where label = 'first')) is null,
  'a revoked link answers null'
);
insert into r4_ids
select 'second', api.publish_fantasy_gameweek_recap('c4c40000-0000-4000-8000-000000000041',
  'c4c40000-0000-4000-8000-000000000009', 'Atlas Lions') ->> 'publicId';
select extensions.ok(
  (select public_id from r4_ids where label = 'second')
    <> (select public_id from r4_ids where label = 'first')
  and api.public_fantasy_gameweek_recap((select public_id from r4_ids where label = 'first')) is null,
  'republishing mints a new link; the revoked one stays dead'
);

reset role;

update app.fantasy_gameweeks set status = 'corrected', corrected_at = '2099-08-09T00:00:00Z'
where id = 'c4c40000-0000-4000-8000-000000000009';
update app.fantasy_team_gameweek_results
set starting_points = 52, provisional_score = 56, final_score = 56, calculation_version = 4
where fantasy_team_id = 'c4c40000-0000-4000-8000-000000000041'
  and gameweek_id = 'c4c40000-0000-4000-8000-000000000009';

select extensions.is(
  (select array[r ->> 'total', r ->> 'corrected', r ->> 'calculationVersion']
     from (select api.public_fantasy_gameweek_recap(
       (select public_id from r4_ids where label = 'second')) as r) read),
  array['56', 'true', '4'],
  'a correction shows on the link with its revision'
);

update app.fantasy_team_gameweek_results set provisional_score = 99, final_score = 99
where fantasy_team_id = 'c4c40000-0000-4000-8000-000000000041'
  and gameweek_id = 'c4c40000-0000-4000-8000-000000000009';
select extensions.is(
  (select array[r ->> 'reconciled', coalesce(r ->> 'captain', 'none'), r ->> 'transferHit']
     from (select api.public_fantasy_gameweek_recap(
       (select public_id from r4_ids where label = 'second')) as r) read),
  array['false', 'none', '0'],
  'figures that do not add up show the total alone'
);

select app_private.fantasy_public_recap_configure(null, false);
select extensions.ok(
  api.public_fantasy_gameweek_recap((select public_id from r4_ids where label = 'second')) is null,
  'switching reads off withdraws every public recap at once'
);

select extensions.is(
  (select array_agg(status || ':' || coalesce(alias, '-') order by published_at)
     from app.fantasy_public_recaps),
  array['revoked:-', 'published:Atlas Lions'],
  'a revoked publication keeps no alias'
);

select * from extensions.finish();
rollback;
