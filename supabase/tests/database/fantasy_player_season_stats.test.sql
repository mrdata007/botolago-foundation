-- BG-0071: api.fantasy_player_season_stats / api.fantasy_player_gameweek_history.
--
-- The fixture below is built so that every rule in the form definition is
-- exercised by a DIFFERENT player, and so that the three "looks like zero"
-- cases stay distinguishable from one another:
--
--   Season A has 7 gameweeks. Sequences 1-5 are finalized, 6 is provisional,
--   7 is open. So six gameweeks are "scored" and the 5-gameweek form window is
--   sequences 2..6 -- sequence 1 is the sixth-oldest and must fall out.
--
--   Striker (P1)  scored in all six -> total 35, form = (2+4+6+8+5)/5 = 5.0.
--                 Capped at GW3 the total is 16 and the window shrinks to the
--                 three gameweeks that exist: 16/3 -> 5.3.
--   Keeper (P2)   has no points row at all -> total 0, form 0.0 (NOT null:
--                 gameweeks have scored, this player simply did not).
--   Veteran (P3)  scored 7 in GW1 only -> total 7, form 0.0, because GW1 is
--                 outside the window. Proves the window is a cut by sequence.
--   Benched (P4)  is inactive and must not appear in the payload at all.
--
--   Season B has one open gameweek and nothing scored -> form is JSON null for
--   its player. This is the case the frontend renders as a dash, and it is the
--   only case that may be null.

begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('b0000000-0000-4000-8000-000000000001', 'MA', 'MAR');

insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('b0100000-0000-4000-8000-000000000001', 'bg0071-league', 'BG0071 League',
  'B71', 'league', 'b0000000-0000-4000-8000-000000000001');

insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  ('b0200000-0000-4000-8000-000000000001', 'b0100000-0000-4000-8000-000000000001',
    '2089/90', '2089-08-01', '2090-06-30', 'active', true),
  ('b0200000-0000-4000-8000-000000000002', 'b0100000-0000-4000-8000-000000000001',
    '2090/91', '2090-08-01', '2091-06-30', 'scheduled', false);

insert into app.rounds (id, season_id, round_number, name, status)
select ('b0300000-0000-4000-8000-00000000000' || i)::uuid,
  'b0200000-0000-4000-8000-000000000001', i, 'Round ' || i, 'planned'
from generate_series(1, 7) i;

insert into app.teams (id, slug, name, short_name, code, country_id) values
  ('b0400000-0000-4000-8000-000000000001', 'bg0071-home', 'BG0071 Home Club',
    'Home', 'BHM', 'b0000000-0000-4000-8000-000000000001'),
  ('b0400000-0000-4000-8000-000000000002', 'bg0071-away', 'BG0071 Away Club',
    'Away', 'BAW', 'b0000000-0000-4000-8000-000000000001');

insert into app.players (id, slug, full_name, display_name, position) values
  ('b0500000-0000-4000-8000-000000000001', 'bg0071-striker',
    'BG0071 Striker', 'Striker', 'forward'),
  ('b0500000-0000-4000-8000-000000000002', 'bg0071-keeper',
    'BG0071 Keeper', 'Keeper', 'goalkeeper'),
  ('b0500000-0000-4000-8000-000000000003', 'bg0071-veteran',
    'BG0071 Veteran', 'Veteran', 'midfielder'),
  ('b0500000-0000-4000-8000-000000000004', 'bg0071-benched',
    'BG0071 Benched', 'Benched', 'defender'),
  ('b0500000-0000-4000-8000-000000000005', 'bg0071-rookie',
    'BG0071 Rookie', 'Rookie', 'midfielder');

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('b0600000-0000-4000-8000-000000000001', 'b0100000-0000-4000-8000-000000000001',
  'bg0071-fantasy', 'BG0071 Fantasy', true);

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status,
  starts_at, ends_at
) values
  ('b0700000-0000-4000-8000-000000000001', 'b0600000-0000-4000-8000-000000000001',
    'b0200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000101',
    '2089/90', 'active', '2089-08-01T00:00:00Z', '2090-06-30T23:59:59Z'),
  ('b0700000-0000-4000-8000-000000000002', 'b0600000-0000-4000-8000-000000000001',
    'b0200000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000101',
    -- 'planned', not 'active': fantasy_seasons_one_active_idx allows exactly
    -- one live season per fantasy competition and season A holds that slot.
    '2090/91', 'planned', '2090-08-01T00:00:00Z', '2091-06-30T23:59:59Z');

-- Sequences 1-5 finalized (points_state final + finalized_at, as the catalog
-- check demands), 6 provisional, 7 open.
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, finalized_at
)
select
  ('b0800000-0000-4000-8000-00000000000' || i)::uuid,
  'b0700000-0000-4000-8000-000000000001',
  ('b0300000-0000-4000-8000-00000000000' || i)::uuid,
  i, 'Gameweek ' || i,
  '2089-09-01T11:00:00Z'::timestamptz + ((i - 1) * interval '7 days'),
  '2089-09-01T12:00:00Z'::timestamptz + ((i - 1) * interval '7 days'),
  '2089-09-02T12:00:00Z'::timestamptz + ((i - 1) * interval '7 days'),
  (case when i <= 5 then 'finalized' when i = 6 then 'provisional' else 'open' end)
    ::app.fantasy_gameweek_status,
  (case when i <= 5 then 'final' else 'provisional' end)::app.fantasy_points_state,
  case when i <= 5
    then '2089-09-02T12:00:00Z'::timestamptz + ((i - 1) * interval '7 days')
    else null end
from generate_series(1, 7) i;

insert into app.fantasy_gameweeks (
  id, fantasy_season_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status
) values (
  'b0800000-0000-4000-8000-000000000011', 'b0700000-0000-4000-8000-000000000002',
  1, 'Gameweek 1', '2090-09-01T11:00:00Z', '2090-09-01T12:00:00Z',
  '2090-09-02T12:00:00Z', 'open'
);

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id, position_id,
  price, active, eligible
) values
  ('b0900000-0000-4000-8000-000000000001', 'b0700000-0000-4000-8000-000000000001',
    'b0500000-0000-4000-8000-000000000001', 'b0400000-0000-4000-8000-000000000001',
    (select id from app.fantasy_positions where code = 'FWD'), 9.5, true, true),
  ('b0900000-0000-4000-8000-000000000002', 'b0700000-0000-4000-8000-000000000001',
    'b0500000-0000-4000-8000-000000000002', 'b0400000-0000-4000-8000-000000000001',
    (select id from app.fantasy_positions where code = 'GK'), 4.5, true, true),
  ('b0900000-0000-4000-8000-000000000003', 'b0700000-0000-4000-8000-000000000001',
    'b0500000-0000-4000-8000-000000000003', 'b0400000-0000-4000-8000-000000000002',
    (select id from app.fantasy_positions where code = 'MID'), 6.0, true, true),
  ('b0900000-0000-4000-8000-000000000004', 'b0700000-0000-4000-8000-000000000001',
    'b0500000-0000-4000-8000-000000000004', 'b0400000-0000-4000-8000-000000000002',
    (select id from app.fantasy_positions where code = 'DEF'), 4.0, false, true),
  ('b0900000-0000-4000-8000-000000000005', 'b0700000-0000-4000-8000-000000000002',
    'b0500000-0000-4000-8000-000000000005', 'b0400000-0000-4000-8000-000000000001',
    (select id from app.fantasy_positions where code = 'MID'), 5.0, true, true);

-- Striker: 10, 2, 4, 6, 8 (final) then 5 (provisional, no final_points yet).
insert into app.fantasy_player_gameweek_points (
  fantasy_player_id, gameweek_id, provisional_points, final_points,
  minutes_played, did_play, calculation_version, football_input_version, finalized_at
)
select
  'b0900000-0000-4000-8000-000000000001',
  ('b0800000-0000-4000-8000-00000000000' || i)::uuid,
  (array[10, 2, 4, 6, 8, 5])[i],
  case when i <= 5 then (array[10, 2, 4, 6, 8, 5])[i] else null end,
  90, true, 1, 1,
  case when i <= 5 then '2089-09-02T12:00:00Z'::timestamptz else null end
from generate_series(1, 6) i;

-- Veteran: one scored gameweek, and it is the one the form window drops.
insert into app.fantasy_player_gameweek_points (
  fantasy_player_id, gameweek_id, provisional_points, final_points,
  minutes_played, did_play, calculation_version, football_input_version, finalized_at
) values (
  'b0900000-0000-4000-8000-000000000003', 'b0800000-0000-4000-8000-000000000001',
  7, 7, 45, true, 1, 1, '2089-09-02T12:00:00Z'
);

-- A points row in the OPEN gameweek 7 must not reach any total: the gameweek
-- has not scored, whatever rows the worker has staged.
insert into app.fantasy_player_gameweek_points (
  fantasy_player_id, gameweek_id, provisional_points, final_points,
  minutes_played, did_play, calculation_version, football_input_version
) values (
  'b0900000-0000-4000-8000-000000000003', 'b0800000-0000-4000-8000-000000000007',
  99, null, 90, true, 1, 1
);

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select ('b1000000-0000-4000-8000-00000000000' || i)::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'bg0071-' || i || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'bg0071_' || i),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 3) i;

-- Two active squads and one archived squad. The archived one holds the striker,
-- so it would inflate ownership to 150% if it were counted.
insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, name, bank, team_value, free_transfers, status
) values
  ('b1100000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
    'b0700000-0000-4000-8000-000000000001', 'Active One', 0.5, 100, 1, 'active'),
  ('b1100000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002',
    'b0700000-0000-4000-8000-000000000001', 'Active Two', 0.5, 100, 1, 'active'),
  ('b1100000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003',
    'b0700000-0000-4000-8000-000000000001', 'Archived Three', 0.5, 100, 1, 'archived');

insert into app.fantasy_squad_memberships (
  id, fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price,
  acquired_gameweek_id, sold_gameweek_id, sold_at
) values
  -- Striker: held by both active squads, plus the archived one.
  ('b1200000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001',
    'b0900000-0000-4000-8000-000000000001', 9.5, 9.5,
    'b0800000-0000-4000-8000-000000000001', null, null),
  ('b1200000-0000-4000-8000-000000000002', 'b1100000-0000-4000-8000-000000000002',
    'b0900000-0000-4000-8000-000000000001', 9.5, 9.5,
    'b0800000-0000-4000-8000-000000000001', null, null),
  ('b1200000-0000-4000-8000-000000000003', 'b1100000-0000-4000-8000-000000000003',
    'b0900000-0000-4000-8000-000000000001', 9.5, 9.5,
    'b0800000-0000-4000-8000-000000000001', null, null),
  -- Veteran: held by one active squad, sold by the other.
  ('b1200000-0000-4000-8000-000000000004', 'b1100000-0000-4000-8000-000000000001',
    'b0900000-0000-4000-8000-000000000003', 6.0, 6.0,
    'b0800000-0000-4000-8000-000000000001', null, null),
  ('b1200000-0000-4000-8000-000000000005', 'b1100000-0000-4000-8000-000000000002',
    'b0900000-0000-4000-8000-000000000003', 6.0, 6.0,
    'b0800000-0000-4000-8000-000000000001',
    'b0800000-0000-4000-8000-000000000003', '2089-09-16T12:00:00Z');

insert into app.fixtures (
  id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score,
  provider_updated_at, source_sequence, finalized_at
) values (
  'b1300000-0000-4000-8000-000000000001', 'b0100000-0000-4000-8000-000000000001',
  'b0200000-0000-4000-8000-000000000001', 'b0300000-0000-4000-8000-000000000001',
  'b0400000-0000-4000-8000-000000000001', 'b0400000-0000-4000-8000-000000000002',
  '2089-09-01T18:00:00Z', 'finished', 'post_match', 2, 1,
  '2089-09-01T20:00:00Z', 1, '2089-09-01T20:00:00Z'
);

insert into app.fantasy_fixture_assignments (
  id, fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, assignment_status,
  counts_points, source_version
) values (
  'b1400000-0000-4000-8000-000000000001', 'b0700000-0000-4000-8000-000000000001',
  'b1300000-0000-4000-8000-000000000001', 'b0800000-0000-4000-8000-000000000001',
  'b0800000-0000-4000-8000-000000000001', '2089-09-01T18:00:00Z',
  '2089-09-01T18:00:00Z', 'assigned', true, 1
);

-- ---------------------------------------------------------------------------
-- The whole read surface is exercised as `anon`. /fantasy/players is a public
-- route, and BG-0063 showed that a signature naming an app-schema type fails
-- for exactly this role and no other.
-- ---------------------------------------------------------------------------
set local role anon;

select extensions.lives_ok(
  $$select api.fantasy_player_season_stats('b0700000-0000-4000-8000-000000000001')$$,
  'an anonymous visitor can call fantasy_player_season_stats'
);
select extensions.lives_ok(
  $$select api.fantasy_player_gameweek_history('b0900000-0000-4000-8000-000000000001')$$,
  'an anonymous visitor can call fantasy_player_gameweek_history'
);
select extensions.throws_ok(
  $$select * from app.fantasy_player_gameweek_points$$,
  '42501',
  'permission denied for schema app',
  'anonymous clients still cannot read the points table directly'
);

select set_config('test.bg0071_stats', api.fantasy_player_season_stats(
  'b0700000-0000-4000-8000-000000000001'
)::text, true);

select extensions.is(
  jsonb_array_length(current_setting('test.bg0071_stats')::jsonb -> 'items'),
  3,
  'only active, eligible fantasy players of the season appear'
);
select extensions.is(
  (current_setting('test.bg0071_stats')::jsonb ->> 'activeTeamCount')::integer,
  2,
  'the ownership denominator counts active squads only'
);
select extensions.is(
  (current_setting('test.bg0071_stats')::jsonb ->> 'scoredGameweeksInWindow')::integer,
  5,
  'the form window saturates at five once six gameweeks have scored'
);

select extensions.is(
  (select (item ->> 'totalPoints')::integer from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000001'),
  35,
  'totalPoints sums provisional and final points across every scored gameweek'
);
select extensions.is(
  (select (item ->> 'form')::numeric from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000001'),
  5.0::numeric,
  'form averages the last five scored gameweeks and drops the sixth-oldest'
);
select extensions.is(
  (select (item ->> 'minutes')::integer from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000001'),
  540,
  'minutes sums minutes_played over scored gameweeks'
);
select extensions.is(
  (select (item ->> 'gameweeksPlayed')::integer from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000001'),
  6,
  'gameweeksPlayed counts the gameweeks the player actually appeared in'
);

select extensions.is(
  (select (item ->> 'totalPoints')::integer from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000003'),
  7,
  'a points row in an open gameweek is excluded from the season total'
);
select extensions.is(
  (select (item ->> 'form')::numeric from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000003'),
  0.0::numeric,
  'a player whose only score is outside the window has form 0.0, not his old average'
);

select extensions.is(
  (select (item ->> 'totalPoints')::integer from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000002'),
  0,
  'a player with no points row at all totals zero'
);
select extensions.is(
  (select jsonb_typeof(item -> 'form') from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000002'),
  'number'::text,
  'form is a real 0.0 -- not null -- once any gameweek has scored'
);

-- Ownership is derived, never read from the placeholder counter.
select extensions.is(
  (select (item ->> 'ownershipCount')::integer from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000001'),
  2,
  'ownership ignores squads whose team is archived'
);
select extensions.is(
  (select (item ->> 'ownershipPercent')::numeric from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000001'),
  100.0::numeric,
  'a player held by both active squads is 100.0% owned'
);
select extensions.is(
  (select (item ->> 'ownershipPercent')::numeric from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000003'),
  50.0::numeric,
  'a sold membership drops out of ownership immediately'
);
select extensions.is(
  (select (item ->> 'ownershipCount')::integer from jsonb_array_elements(current_setting('test.bg0071_stats')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000002'),
  0,
  'an unowned player is 0, and app.fantasy_players.selected_by_count is never read'
);

-- ---------------------------------------------------------------------------
-- p_through_gameweek_id: cap the season at GW3. Three gameweeks have scored, so
-- the window is three wide and the mean divides by three, not by five.
-- ---------------------------------------------------------------------------
select set_config('test.bg0071_capped', api.fantasy_player_season_stats(
  'b0700000-0000-4000-8000-000000000001',
  'b0800000-0000-4000-8000-000000000003'
)::text, true);

select extensions.is(
  (current_setting('test.bg0071_capped')::jsonb ->> 'throughGameweekSequence')::integer,
  3,
  'the cutoff reports the sequence it was resolved to'
);
select extensions.is(
  (current_setting('test.bg0071_capped')::jsonb ->> 'scoredGameweeksInWindow')::integer,
  3,
  'with fewer than five scored gameweeks the window is exactly what exists'
);
select extensions.is(
  (select (item ->> 'totalPoints')::integer
   from jsonb_array_elements(current_setting('test.bg0071_capped')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000001'),
  16,
  'the cutoff excludes every gameweek after the requested sequence'
);
select extensions.is(
  (select (item ->> 'form')::numeric
   from jsonb_array_elements(current_setting('test.bg0071_capped')::jsonb -> 'items') item
   where item ->> 'fantasyPlayerId' = 'b0900000-0000-4000-8000-000000000001'),
  5.3::numeric,
  'with three scored gameweeks form is 16/3 rounded to one decimal'
);

-- ---------------------------------------------------------------------------
-- Nothing has scored yet: form must be null so the UI can render a dash.
-- ---------------------------------------------------------------------------
select set_config('test.bg0071_empty', api.fantasy_player_season_stats(
  'b0700000-0000-4000-8000-000000000002'
)::text, true);

select extensions.is(
  (current_setting('test.bg0071_empty')::jsonb ->> 'scoredGameweeksInWindow')::integer,
  0,
  'a season whose only gameweek is open has scored nothing'
);
select extensions.is(
  (select jsonb_typeof(item -> 'form')
   from jsonb_array_elements(current_setting('test.bg0071_empty')::jsonb -> 'items') item),
  'null'::text,
  'form is null -- never 0.0 -- before any gameweek has scored'
);
select extensions.is(
  (select (item ->> 'totalPoints')::integer
   from jsonb_array_elements(current_setting('test.bg0071_empty')::jsonb -> 'items') item),
  0,
  'total points is a real 0 even while form is unknown'
);
select extensions.is(
  (current_setting('test.bg0071_empty')::jsonb ->> 'activeTeamCount')::integer,
  0,
  'a season with no squads reports a zero denominator'
);
select extensions.is(
  (select (item ->> 'ownershipPercent')::numeric
   from jsonb_array_elements(current_setting('test.bg0071_empty')::jsonb -> 'items') item),
  0::numeric,
  'ownership is 0 rather than a division by zero when no squad exists'
);

-- ---------------------------------------------------------------------------
-- Gameweek history.
-- ---------------------------------------------------------------------------
select set_config('test.bg0071_history', api.fantasy_player_gameweek_history(
  'b0900000-0000-4000-8000-000000000001'
)::text, true);

select extensions.is(
  jsonb_array_length(current_setting('test.bg0071_history')::jsonb),
  6,
  'history returns one row per gameweek the player has a points row for'
);
select extensions.results_eq(
  $$select (item ->> 'gameweekSequence')::integer
    from jsonb_array_elements(current_setting('test.bg0071_history')::jsonb) item$$,
  $$values (1), (2), (3), (4), (5), (6)$$,
  'history is ordered oldest gameweek first'
);
select extensions.is(
  (select item ->> 'state'
   from jsonb_array_elements(current_setting('test.bg0071_history')::jsonb) item
   where (item ->> 'gameweekSequence')::integer = 6),
  'provisional'::text,
  'a gameweek without final_points is reported as provisional, not hidden'
);
select extensions.is(
  (select item ->> 'state'
   from jsonb_array_elements(current_setting('test.bg0071_history')::jsonb) item
   where (item ->> 'gameweekSequence')::integer = 5),
  'final'::text,
  'a finalized gameweek is reported as final'
);
select extensions.is(
  (select (item -> 'opponents' -> 0 ->> 'shortName')
   from jsonb_array_elements(current_setting('test.bg0071_history')::jsonb) item
   where (item ->> 'gameweekSequence')::integer = 1),
  'Away'::text,
  'the opponent is the other side of the assigned fixture'
);
select extensions.is(
  (select (item -> 'opponents' -> 0 ->> 'home')::boolean
   from jsonb_array_elements(current_setting('test.bg0071_history')::jsonb) item
   where (item ->> 'gameweekSequence')::integer = 1),
  true,
  'the fixture is flagged home when the player club is the home side'
);
select extensions.is(
  (select jsonb_array_length(item -> 'opponents')
   from jsonb_array_elements(current_setting('test.bg0071_history')::jsonb) item
   where (item ->> 'gameweekSequence')::integer = 2),
  0,
  'a gameweek with no assignment returns an empty opponents array, not null'
);
select extensions.is(
  jsonb_array_length(api.fantasy_player_gameweek_history(
    'b0900000-0000-4000-8000-000000000002'
  )),
  0,
  'a player who has never scored has an empty history rather than an error'
);

-- ---------------------------------------------------------------------------
-- Unknown ids answer 404 through PostgREST, not 500.
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  $$select api.fantasy_player_season_stats('b0700000-0000-4000-8000-0000000000ff')$$,
  'PGRST'::char(5),
  null::text,
  'an unknown season is a chosen 404 response, not a leak and not a 500'
);
select extensions.throws_ok(
  $$select api.fantasy_player_season_stats(
      'b0700000-0000-4000-8000-000000000001',
      'b0800000-0000-4000-8000-000000000011'
    )$$,
  'PGRST'::char(5),
  null::text,
  'a cutoff gameweek from another season is refused, not silently ignored'
);
select extensions.throws_ok(
  $$select api.fantasy_player_gameweek_history('b0900000-0000-4000-8000-0000000000ff')$$,
  'PGRST'::char(5),
  null::text,
  'an unknown fantasy player is a chosen 404 response'
);

reset role;

select * from extensions.finish();
rollback;
