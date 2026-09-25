-- 20260925200000: this season's player list, corrected from what SportsMonks
-- shows. One observation (every club's squad, and a lineup) is recorded, planned
-- and applied. Only positive evidence changes anything, Fantasy teams keep
-- their players, and a hand-typed duplicate is retired only if nobody used it.
begin;
select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('13a00000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('33a00000-0000-4000-8000-000000000001', 'player-list-league', 'Player List League', 'PLL',
  'league', '13a00000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current) values
  ('43a00000-0000-4000-8000-000000000001', '33a00000-0000-4000-8000-000000000001',
   '2026/2027', current_date - 30, current_date + 300, 'active', true),
  ('43a00000-0000-4000-8000-000000000002', '33a00000-0000-4000-8000-000000000001',
   '2025/2026', current_date - 400, current_date - 60, 'completed', false);
insert into app.rounds (id, season_id, round_number, name, status)
values ('53a00000-0000-4000-8000-000000000001', '43a00000-0000-4000-8000-000000000001', 1, 'Round 1', 'active');
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('63a00000-0000-4000-8000-00000000000' || n)::uuid, 'player-list-club-' || n,
  'Player List Club ' || n, 'Club ' || chr(64 + n), 'PL' || n, '13a00000-0000-4000-8000-000000000001'
from generate_series(1, 3) n;
-- Fixture 1, club A against club B, has been played; fixture 2 brings club C in.
insert into app.fixtures (
  id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score, provider_updated_at, source_sequence, source_version
) values
  ('73a00000-0000-4000-8000-000000000001', '33a00000-0000-4000-8000-000000000001',
   '43a00000-0000-4000-8000-000000000001', '53a00000-0000-4000-8000-000000000001',
   '63a00000-0000-4000-8000-000000000001', '63a00000-0000-4000-8000-000000000002',
   statement_timestamp() - interval '2 days', 'finished', 'post_match', 1, 0, statement_timestamp(), 1, 'pl-f1'),
  ('73a00000-0000-4000-8000-000000000002', '33a00000-0000-4000-8000-000000000001',
   '43a00000-0000-4000-8000-000000000001', '53a00000-0000-4000-8000-000000000001',
   '63a00000-0000-4000-8000-000000000002', '63a00000-0000-4000-8000-000000000003',
   statement_timestamp() + interval '2 days', 'scheduled', 'pre_match', null, null, statement_timestamp(), 1, 'pl-f2');
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
) values
  ('sportsmonks','competition','860','33a00000-0000-4000-8000-000000000001','pl-competition',statement_timestamp(),true),
  ('sportsmonks','season','28647','43a00000-0000-4000-8000-000000000001','pl-season',statement_timestamp(),true),
  ('sportsmonks','team','71001','63a00000-0000-4000-8000-000000000001','pl-a',statement_timestamp(),true),
  ('sportsmonks','team','71002','63a00000-0000-4000-8000-000000000002','pl-b',statement_timestamp(),true),
  ('sportsmonks','team','71003','63a00000-0000-4000-8000-000000000003','pl-c',statement_timestamp(),true),
  ('sportsmonks','fixture','19910001','73a00000-0000-4000-8000-000000000001','pl-f1',statement_timestamp(),true),
  ('sportsmonks','fixture','19910002','73a00000-0000-4000-8000-000000000002','pl-f2',statement_timestamp(),true);

-- The list before. Numbers 1-13 carry a SportsMonks id (81000 + n); the
-- others were typed in by hand.
create temp table roster (n integer, full_name text, position app.football_position, club integer, mapped boolean)
on commit drop;
insert into roster values
  (1, 'Anas Keeper', 'goalkeeper', 1, true),       -- still at A
  (2, 'Badr Mover', 'midfielder', 1, true),        -- played for B
  (3, 'Chafik Returner', 'defender', null, true),  -- no club this season; C's squad lists them
  (6, 'Mouad Goulouss', 'midfielder', 3, true),    -- played for B, where they were also typed in
  (10, 'Yassine Belfada', 'midfielder', 3, true),  -- A's squad lists them; A's hand-typed record is owned
  (11, 'Bilal Bee', 'defender', 2, true),
  (12, 'Bouchaib Bee', 'defender', 2, true),
  (13, 'Brahim Bee', 'forward', 2, true),
  (14, 'Hatim Bouhbouh', 'forward', 2, false),     -- played for B, never linked
  (16, 'Mouad Goulouss', 'midfielder', 2, false),  -- the hand-typed duplicate, unused
  (19, 'Ahmed Baha', 'forward', 3, false),         -- two of them at C
  (20, 'Ahmed Baha', 'forward', 3, false),
  (21, 'Yassine Belfada', 'midfielder', 1, false); -- the hand-typed duplicate, owned
insert into app.players (id, slug, full_name, display_name, position)
select md5('player-list-' || n)::uuid, 'player-list-' || n, full_name, full_name, position from roster;
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
)
select 'sportsmonks', 'player', (81000 + n)::text, md5('player-list-' || n)::uuid, 'pl-player', statement_timestamp(), true
from roster where mapped;
insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, valid_to, active)
select md5('player-list-' || n)::uuid, ('63a00000-0000-4000-8000-00000000000' || club)::uuid,
  '43a00000-0000-4000-8000-000000000001', null, current_date - 30, current_date + 300, true
from roster where club is not null;
-- Last season, Chafik Returner was rated 7.5 with confidence 0.8.
insert into app.team_memberships (player_id, team_id, season_id, valid_from, valid_to, active)
values (md5('player-list-3')::uuid, '63a00000-0000-4000-8000-000000000003',
  '43a00000-0000-4000-8000-000000000002', current_date - 400, current_date - 60, false);
insert into app.player_season_ratings (
  football_season_id, player_id, position, source_provider, source_version, algorithm_version,
  appearances, starts, minutes, goals, assists, clean_sheets, goals_conceded, saves,
  penalties_saved, penalties_missed, yellow_cards, red_cards, second_yellow_dismissals, own_goals,
  fantasy_equivalent_points, points_per_90, confidence, rating, active, source_updated_at, calculated_at
) values (
  '43a00000-0000-4000-8000-000000000002', md5('player-list-3')::uuid, 'defender', 'sportsmonks',
  'pl-rating', 'player-list-test-v1', 20, 20, 1800, 1, 1, 5, 20, 0, 0, 0, 3, 0, 0, 0,
  60, 3.0, 0.8, 7.5, true, statement_timestamp(), statement_timestamp()
);

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('83a00000-0000-4000-8000-000000000001', '33a00000-0000-4000-8000-000000000001',
  'player-list-fantasy', 'Player List Fantasy', true);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('83a00000-0000-4000-8000-000000000002', '83a00000-0000-4000-8000-000000000001',
  '43a00000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2026/2027', 'active', current_date - 30, current_date + 300);
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status
) values ('83a00000-0000-4000-8000-000000000003', '83a00000-0000-4000-8000-000000000002',
  '53a00000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
  statement_timestamp() - interval '3 days', statement_timestamp() - interval '2 days',
  statement_timestamp() + interval '3 days', 'live');
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select md5('player-list-fantasy-' || n)::uuid, '83a00000-0000-4000-8000-000000000002',
  md5('player-list-' || n)::uuid, ('63a00000-0000-4000-8000-00000000000' || club)::uuid,
  (select id from app.fantasy_positions where code = case position when 'goalkeeper' then 'GK'
    when 'defender' then 'DEF' when 'midfielder' then 'MID' else 'FWD' end),
  6
from roster where club is not null;

-- One Fantasy team holds three of club B's players, Badr Mover (still listed
-- at A) and the hand-typed Yassine Belfada.
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values ('93a00000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'player-list-owner@example.test', statement_timestamp(), 'hash',
  '{}', '{"username":"player_list_owner"}', statement_timestamp(), statement_timestamp());
insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
) values ('93a00000-0000-4000-8000-000000000002', '93a00000-0000-4000-8000-000000000001',
  '83a00000-0000-4000-8000-000000000002', '83a00000-0000-4000-8000-000000000003',
  'Player List XI', 10, 100, 1);
insert into app.fantasy_squad_memberships (
  fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
)
select '93a00000-0000-4000-8000-000000000002', md5('player-list-fantasy-' || n)::uuid, 6, 6,
  '83a00000-0000-4000-8000-000000000003'
from unnest(array[2, 11, 12, 13, 21]) n;
update app.fantasy_players set selected_by_count = 1
where id in (select md5('player-list-fantasy-' || n)::uuid from unnest(array[2, 11, 12, 13, 21]) n);

-- What SportsMonks shows: every club's squad, and the lineup of fixture 1.
create temp table sighting (n integer, club integer, full_name text, position text) on commit drop;
insert into sighting values
  (1, 1, 'Anas Keeper', 'goalkeeper'),
  (3, 3, 'Chafik Returner', 'defender'),
  (5, 3, 'Nabil Newcomer', 'defender'),      -- unknown to the list
  (7, 1, 'Ziad Twoclubs', 'forward'),        -- in two squads, in no lineup
  (7, 3, 'Ziad Twoclubs', 'forward'),
  (8, 2, 'Omar Nopos', null),                -- no position anywhere
  (9, 3, 'Ahmed Baha', 'forward'),           -- two hand-typed Ahmed Bahas at C
  (10, 1, 'Yassine Belfada', 'midfielder'),
  (11, 2, 'Bilal Bee', 'defender'),
  (12, 2, 'Bouchaib Bee', 'defender'),
  (13, 2, 'Brahim Bee', 'forward');
create temp table observation_input on commit drop as
select jsonb_build_object(
  'providerName', 'sportsmonks',
  'seasonExternalId', '28647',
  'observedAt', to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'clubs', (select jsonb_agg(jsonb_build_object(
      'teamExternalId', (71000 + club)::text,
      'source', 'season-squad',
      'players', coalesce((select jsonb_agg(jsonb_build_object(
          'externalPlayerId', (81000 + sighting.n)::text, 'fullName', sighting.full_name,
          'displayName', sighting.full_name, 'firstName', null, 'lastName', null,
          'dateOfBirth', null, 'position', sighting.position, 'shirtNumber', null) order by sighting.n)
        from sighting where sighting.club = clubs.club), '[]'::jsonb)) order by club)
    from generate_series(1, 3) clubs(club)),
  'lineups', jsonb_build_array(jsonb_build_object(
    'fixtureExternalId', '19910001',
    'players', jsonb_build_array(
      jsonb_build_object('externalPlayerId', '81002', 'teamExternalId', '71002', 'fullName', 'Badr Mover',
        'displayName', 'B. Mover', 'position', 'midfielder', 'shirtNumber', 8),
      jsonb_build_object('externalPlayerId', '81004', 'teamExternalId', '71002', 'fullName', 'Hatim Bouhbouh',
        'displayName', 'H. Bouhbouh', 'position', 'forward', 'shirtNumber', 9),
      jsonb_build_object('externalPlayerId', '81006', 'teamExternalId', '71002', 'fullName', 'Mouad Goulouss',
        'displayName', 'M. Goulouss', 'position', 'midfielder', 'shirtNumber', 10),
      jsonb_build_object('externalPlayerId', '81001', 'teamExternalId', '71001', 'fullName', 'Anas Keeper',
        'displayName', 'A. Keeper', 'position', 'goalkeeper', 'shirtNumber', 1)
    )))
) as observations;
grant select on observation_input to service_role;

-- Only the service role records, plans or applies.
select extensions.ok(
  not has_function_privilege('anon', 'api.service_record_current_player_list(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_record_current_player_list(jsonb)', 'execute')
  and not has_function_privilege('anon', 'api.service_plan_current_player_list(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_plan_current_player_list(uuid)', 'execute')
  and not has_function_privilege('anon', 'api.service_apply_current_player_list(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_apply_current_player_list(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'api.service_apply_current_player_list(uuid,text)', 'execute'),
  'only the service role may call the player list functions'
);
select extensions.throws_ok(
  $$select api.service_record_current_player_list(observations) from observation_input$$,
  'PT403', 'forbidden', 'a caller without the service role claim is refused'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.throws_ok(
  $$select api.service_record_current_player_list(
    jsonb_set(observations, '{clubs}', (observations -> 'clubs') - 2)) from observation_input$$,
  'PT409', 'player_list_club_scope_mismatch', 'every club of the season must be observed'
);
select extensions.throws_ok(
  $$select api.service_record_current_player_list(
    jsonb_set(observations, '{lineups,0,players,0,teamExternalId}', '"71003"')) from observation_input$$,
  'PT409', 'player_list_fixture_scope_mismatch', 'a lineup names only its two clubs'' players'
);
select extensions.throws_ok(
  $$select api.service_record_current_player_list(
    jsonb_set(observations, '{observedAt}', '"2026-01-01T00:00:00.000Z"')) from observation_input$$,
  'PT400', 'player_list_observation_not_fresh', 'an old observation is not recorded'
);
select extensions.throws_ok(
  $$select api.service_record_current_player_list(
    jsonb_set(observations, '{clubs,0,players,0,fullName}', '" Anas Keeper"')) from observation_input$$,
  'PT400', 'invalid_player_list_observations', 'an untrimmed name is refused'
);

create temp table recorded on commit drop as
select api.service_record_current_player_list(observations) as result from observation_input;
create temp table planned on commit drop as
select api.service_plan_current_player_list((result ->> 'observationId')::uuid) as plan from recorded;

reset role;
select extensions.is((select (result ->> 'squadPlayers')::integer from recorded), 11,
  'the observation holds the eleven squad rows');
select extensions.is(
  (select plan -> 'summary' from planned),
  jsonb_build_object(
    'observedPlayers', 13, 'changes', 6, 'unchanged', 4, 'fromLineups', 4,
    'link', 1, 'add', 1, 'move', 3, 'join', 1, 'fantasyMove', 3, 'fantasyAdd', 2,
    'retireDuplicate', 1, 'usedDuplicate', 1,
    'skipAmbiguousClub', 1, 'skipAmbiguousName', 1, 'skipNoPosition', 1, 'skipInactiveMapping', 0,
    'clubLimitViolations', 1),
  'the plan: three moves, one return, one link, one newcomer, one duplicate retired'
);
select extensions.is(
  (select jsonb_agg(value ->> 'reason' order by value ->> 'externalPlayerId') from planned, jsonb_array_elements(plan -> 'skipped')),
  '["skip_ambiguous_club", "skip_no_position", "skip_ambiguous_name"]'::jsonb,
  'two squads, no position, or two hand-typed namesakes: left alone'
);
select extensions.is(
  (select (value ->> 'fantasyPrice')::numeric from planned, jsonb_array_elements(plan -> 'changes') where value ->> 'externalPlayerId' = '81003'),
  5.6, 'a returning player is priced from last season''s rating, as the opening catalog was'
);
select extensions.is(
  (select (value ->> 'fantasyPrice')::numeric from planned, jsonb_array_elements(plan -> 'changes') where value ->> 'externalPlayerId' = '81005'),
  5.0, 'a newcomer gets the neutral price for their position'
);
select extensions.is(
  (select (value ->> 'duplicatePlayerId')::uuid from planned, jsonb_array_elements(plan -> 'changes') where value ->> 'externalPlayerId' = '81006'),
  md5('player-list-16')::uuid, 'Mouad Goulouss''s unused hand-typed record is retired'
);
select extensions.is(
  (select (plan #>> '{usedDuplicates,0,duplicatePlayerId}')::uuid from planned),
  md5('player-list-21')::uuid, 'Yassine Belfada''s hand-typed record is owned, so it stays'
);
select extensions.is(
  (select plan -> 'digest' from planned),
  (select api.service_plan_current_player_list((result ->> 'observationId')::uuid) -> 'digest'
   from recorded),
  'planning the same observation twice gives the same digest'
);

-- Apply: refused while the tick runs, while a squad would go over the club
-- limit, and for a digest that is not the plan's.
select app_private.fantasy_automation_configure(true);
set local role service_role;
select extensions.throws_ok(
  $$select api.service_apply_current_player_list((result ->> 'observationId')::uuid, plan ->> 'digest')
    from recorded, planned$$,
  'PT409', 'fantasy_tick_must_be_paused', 'the Fantasy tick must be paused first'
);
reset role;
select app_private.fantasy_automation_configure(false);
set local role service_role;
select extensions.throws_ok(
  $$select api.service_apply_current_player_list((result ->> 'observationId')::uuid, plan ->> 'digest')
    from recorded, planned$$,
  'PT409', 'fantasy_club_limit_exceeded', 'Badr Mover would be the team''s fourth club B player'
);
select extensions.throws_ok(
  $$select api.service_apply_current_player_list((result ->> 'observationId')::uuid, repeat('0', 64))
    from recorded$$,
  'PT409', 'player_list_plan_changed', 'only the reviewed plan is applied'
);
reset role;
select extensions.is(
  (select count(*)::integer from app_private.football_provider_mappings
   where provider_name = 'sportsmonks' and entity_type = 'player' and external_id in ('81004', '81005')),
  0, 'the refusals wrote nothing'
);

-- The owner sells one club B player; the same plan now applies.
update app.fantasy_squad_memberships set sold_at = statement_timestamp(),
  sold_gameweek_id = '83a00000-0000-4000-8000-000000000003'
where fantasy_player_id = md5('player-list-fantasy-13')::uuid;
set local role service_role;
create temp table applied on commit drop as
select api.service_apply_current_player_list((result ->> 'observationId')::uuid, plan ->> 'digest') as result
from recorded, planned;
reset role;
select extensions.is(
  (select result - 'observationId' - 'planDigest' from applied),
  jsonb_build_object('changes', 6, 'linked', 1, 'added', 1, 'moved', 3, 'joined', 1,
    'fantasyMoved', 3, 'fantasyAdded', 2, 'duplicatesRetired', 1),
  'applied as planned'
);

create temp view current_club as
select membership.player_id, team.short_name
from app.team_memberships membership join app.teams team on team.id = membership.team_id
where membership.season_id = '43a00000-0000-4000-8000-000000000001' and membership.active;
select extensions.is(
  (select array_agg(short_name order by short_name) from current_club where player_id = md5('player-list-2')::uuid),
  array['Club B'], 'Badr Mover is at club B only'
);
select extensions.is(
  (select team.short_name from app.fantasy_players fp join app.teams team on team.id = fp.football_team_id
   where fp.id = md5('player-list-fantasy-2')::uuid),
  'Club B', 'and scores for club B in Fantasy, still in the squad that holds them'
);
select extensions.ok(
  exists (select 1 from app.fantasy_squad_memberships where fantasy_player_id = md5('player-list-fantasy-2')::uuid and sold_at is null),
  'the squad keeps Badr Mover'
);
select extensions.is(
  (select jsonb_build_object('club', team.short_name, 'price', fp.price, 'position', pos.code,
     'reason', history.reason, 'rating', evidence.source_rating)
   from app.fantasy_players fp
   join app.teams team on team.id = fp.football_team_id
   join app.fantasy_positions pos on pos.id = fp.position_id
   join app.fantasy_player_price_history history on history.fantasy_player_id = fp.id
   join app_private.fantasy_initial_price_evidence evidence on evidence.fantasy_player_id = fp.id
   where fp.football_player_id = md5('player-list-3')::uuid),
  '{"club": "Club C", "price": 5.6, "position": "DEF", "reason": "player_list_addition_v1", "rating": 7.5}'::jsonb,
  'Chafik Returner joins club C and the game, with a record of the price'
);
select extensions.is(
  (select mapping.internal_entity_id from app_private.football_provider_mappings mapping
   where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'player' and mapping.external_id = '81004'),
  md5('player-list-14')::uuid, 'the hand-typed Hatim Bouhbouh now carries their SportsMonks id'
);
select extensions.is(
  (select jsonb_build_object('name', player.full_name, 'position', player.position, 'club', club.short_name,
     'fantasyClub', fantasy_club.short_name, 'price', fp.price)
   from app_private.football_provider_mappings mapping
   join app.players player on player.id = mapping.internal_entity_id
   join current_club club on club.player_id = player.id
   join app.fantasy_players fp on fp.football_player_id = player.id
   join app.teams fantasy_club on fantasy_club.id = fp.football_team_id
   where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'player' and mapping.external_id = '81005'),
  '{"name": "Nabil Newcomer", "position": "defender", "club": "Club C", "fantasyClub": "Club C", "price": 5.0}'::jsonb,
  'Nabil Newcomer is created, at club C and in the game'
);
select extensions.is(
  (select jsonb_build_object('goulouss', (select array_agg(short_name) from current_club where player_id = md5('player-list-6')::uuid),
     'duplicateListed', exists (select 1 from current_club where player_id = md5('player-list-16')::uuid),
     'duplicateInGame', (select active or eligible from app.fantasy_players where id = md5('player-list-fantasy-16')::uuid))),
  '{"goulouss": ["Club B"], "duplicateListed": false, "duplicateInGame": false}'::jsonb,
  'Mouad Goulouss moves to club B and the hand-typed double leaves the list and the game'
);
select extensions.is(
  (select jsonb_build_object('belfada', (select array_agg(short_name) from current_club where player_id = md5('player-list-10')::uuid),
     'duplicateInGame', (select active and eligible from app.fantasy_players where id = md5('player-list-fantasy-21')::uuid))),
  '{"belfada": ["Club A"], "duplicateInGame": true}'::jsonb,
  'the owned hand-typed Yassine Belfada stays in the game'
);
select extensions.is(
  (select count(*)::integer from app_private.football_provider_mappings
   where provider_name = 'sportsmonks' and entity_type = 'player' and external_id in ('81007', '81008', '81009')),
  0, 'the skipped players are not created'
);
select extensions.is(
  (select count(*)::integer from app_private.current_player_list_updates), 1, 'the update is recorded'
);

set local role service_role;
select extensions.is(
  (select (api.service_plan_current_player_list((result ->> 'observationId')::uuid) #>> '{summary,changes}')::integer
   from recorded),
  0, 'the same observation now plans nothing'
);
select extensions.throws_ok(
  $$select api.service_apply_current_player_list((result ->> 'observationId')::uuid, plan ->> 'digest')
    from recorded, planned$$,
  'PT409', 'player_list_observation_already_applied', 'an observation is applied once'
);
reset role;

select * from extensions.finish();
rollback;
