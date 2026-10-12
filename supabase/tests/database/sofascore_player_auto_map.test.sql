begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- Automatic SofaScore player matching (api.service_sofascore_auto_map_players and the staff list),
-- as rewritten by 20261013150000: club + shirt number + position, never a name. One candidate links
-- at once; nobody in the catalog creates the player (membership, mapping, priced Fantasy pool entry).
-- Real functions, synthetic world:
--   1 permissions   2 first call: links, creations, leftovers   3 never by name
--   4 a created player end to end   5 existing mappings untouched   6 idempotent re-run, second match
--   7 "reviewed" and its limits   8 a refused creation rolls back   9 staff list and resolution
--   10 position rule

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Staff operator (aal2, football_operator), as in the SofaScore Fantasy test.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.id('e1', 1), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'sfm-op@example.test', 'hash', now(), '{}', '{"username":"sfm_op"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.id('e3', 1), pg_temp.id('e1', 1), 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at) values (pg_temp.id('e2', 1), pg_temp.id('e1', 1), now());
insert into app_private.staff_principals (auth_user_id) values (pg_temp.id('e1', 1));
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Operator for the SofaScore player matching test.'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = pg_temp.id('e1', 1) and r.name = 'football_operator';

create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  if p_who = 'svc' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  elsif p_who = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('e1', 1), 'role', 'authenticated',
      'aal', 'aal2', 'session_id', pg_temp.id('e2', 1))::text, true);
  end if;
end $$;

-- World: team 1 (home) and team 2 (away) in the current season, two fixtures between them, and its Fantasy season.
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'sofa-match-test', 'SofaScore Match Test', 'SM', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id('c0', 7), pg_temp.id('c0', 3), 1, 'Round 1', 'completed');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'sfm-club-' || i, 'Sfm Club ' || i, 'MC' || i, 'MC' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 2) i;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, finalized_at)
values (pg_temp.id('f0', 1), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 1),
  pg_temp.id('c1', 2), '2026-08-10 12:00Z', 'finished', 1, 0, '2026-08-10 14:00Z', 10, '2026-08-10 14:00Z'),
  (pg_temp.id('f0', 2), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 1),
  pg_temp.id('c1', 2), '2026-08-17 12:00Z', 'finished', 2, 1, '2026-08-17 14:00Z', 11, '2026-08-17 14:00Z');

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id('c0', 4), pg_temp.id('c0', 2), 'sofa-match-test-fantasy', 'Sofa Match Test Fantasy', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.id('c0', 5), pg_temp.id('c0', 4), pg_temp.id('c0', 3), 'f6100000-0000-4000-8000-000000000100',
  '2026/2027', 'active', '2026-08-01', '2027-06-30');

-- i, club, full name, position, shirt
create temporary table roster (i integer primary key, club integer, full_name text, pos text, shirt integer);
insert into roster values
  (1, 1, 'Achraf Hakimi', 'defender', 2),
  (2, 1, 'Youssef En-Nesyri', 'forward', 19),
  (3, 1, 'Selim Amallah', 'midfielder', 15),
  (4, 1, 'Mohamed Ali', 'midfielder', 5),
  (5, 1, 'Mohamed Ali', 'defender', 6),
  (6, 1, 'Yassine Bounou', 'goalkeeper', 1),
  (7, 1, 'Ayoub El Kaabi', 'forward', 9),
  (8, 2, 'Zakaria Aboukhlal', 'forward', 7),
  (9, 1, 'Walid Cheddira', 'forward', 11),
  (10, 1, 'Oussama Tannane', 'midfielder', 8),
  (11, 1, 'Ismael Saibari', 'midfielder', 14),
  (12, 1, 'Bilal El Khannouss', 'midfielder', 20),
  (14, 1, 'Noussair Mazraoui', 'defender', 3),
  (15, 1, 'Nayef Aguerd', 'defender', 4),
  (16, 1, 'Twin One', 'midfielder', 21),
  (17, 1, 'Twin Two', 'midfielder', 21),
  (18, 1, 'Outfield Twelve', 'defender', 12),
  (19, 1, 'Inactive Holder', 'midfielder', 13),
  (27, 1, 'No Number Keeper', 'goalkeeper', null);
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id('a1', i), 'sfm-player-' || i, full_name, full_name, pos::app.football_position from roster;
-- Two active squad members of one club cannot share a shirt number while the unique index below exists;
-- the matcher must still refuse to choose if two ever do (the index is defence, not the rule), so the
-- test lifts it inside this rolled-back transaction.
drop index app.team_memberships_team_season_shirt_active_key;
insert into app.team_memberships (player_id, team_id, season_id, valid_from, shirt_number)
select pg_temp.id('a1', i), pg_temp.id('c1', club), pg_temp.id('c0', 3), '2026-08-01', shirt from roster;

-- Mappings that exist before the first call: S10 -> player 10 (an old, unreviewed row), player 9 is
-- already carried by another SofaScore id (OLD9, active), and player 19 by an INACTIVE one (OLD19).
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active)
values ('sofascore', 'player', 'S10', pg_temp.id('a1', 10), 'legacy', now(), true),
  ('sofascore', 'player', 'OLD9', pg_temp.id('a1', 9), 'legacy', now(), true),
  ('sofascore', 'player', 'OLD19', pg_temp.id('a1', 19), 'legacy', now(), false);
-- A finished match of club 1 that waits on a player identity, with a long back-off still running.
insert into app_private.sofascore_fantasy_attempts (fixture_id, sofascore_event_id, status, attempts, last_attempt_at,
  next_retry_at, last_outcome)
values (pg_temp.id('f0', 1), '1001', 'held', 14, statement_timestamp(), statement_timestamp() + interval '5 hours',
  'unmapped_players');

create function pg_temp.pl(p_sid text, p_name text, p_side text default 'home', p_shirt integer default null,
  p_pos text default null, p_appeared boolean default true) returns jsonb language sql as $$
  select jsonb_build_object('sofascorePlayerId', p_sid, 'side', p_side, 'name', p_name, 'shortName', null,
    'shirtNumber', p_shirt, 'position', p_pos, 'appeared', p_appeared) $$;
create function pg_temp.code(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.mapped_to(p_sid text) returns uuid language sql as $$
  select internal_entity_id from app_private.football_provider_mappings
   where provider_name = 'sofascore' and entity_type = 'player' and external_id = p_sid $$;
create function pg_temp.map_id(p_sid text) returns uuid language sql as $$
  select id from app_private.football_provider_mappings
   where provider_name = 'sofascore' and entity_type = 'player' and external_id = p_sid $$;
create function pg_temp.reason(p_sid text) returns text language sql as $$
  select reason from app_private.sofascore_player_match_queue where sofascore_player_id = p_sid $$;

-- 1 permissions ---------------------------------------------------------------------------------------------
select extensions.ok(has_function_privilege('service_role', 'api.service_sofascore_auto_map_players(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_sofascore_auto_map_players(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'api.service_sofascore_auto_map_players(uuid,jsonb)', 'execute'),
  '1.1 only the service role may run the matcher');
select extensions.ok(has_function_privilege('authenticated', 'api.admin_sofascore_player_match_queue()', 'execute')
  and has_function_privilege('authenticated', 'api.admin_resolve_sofascore_player_match(text,uuid)', 'execute')
  and not has_function_privilege('anon', 'api.admin_sofascore_player_match_queue()', 'execute')
  and not has_function_privilege('anon', 'api.admin_resolve_sofascore_player_match(text,uuid)', 'execute')
  and not has_function_privilege('service_role', 'api.admin_resolve_sofascore_player_match(text,uuid)', 'execute'),
  '1.2 staff functions: authenticated only, never anon or the service role');
select extensions.ok(not has_table_privilege('authenticated', 'app_private.sofascore_player_match_queue', 'select')
  and not has_table_privilege('anon', 'app_private.sofascore_player_match_queue', 'select')
  and not has_table_privilege('service_role', 'app_private.sofascore_player_match_log', 'select')
  and not has_function_privilege('service_role', 'app_private.sofascore_position_compatible(text,text)', 'execute'),
  '1.3 the queue, the log and the position rule are not reachable by API roles');
select pg_temp.act('anon');
select extensions.is(pg_temp.code(format('select api.service_sofascore_auto_map_players(%L, %L)', pg_temp.id('f0', 1), '[]')),
  'forbidden', '1.4 a caller without the service role is refused inside the function too');
select pg_temp.act('svc');
select extensions.is(pg_temp.code(format('select api.service_sofascore_auto_map_players(%L, %L)', pg_temp.id('f0', 1), '{}')),
  'sofascore_auto_map_invalid', '1.5 the players must be an array');
select extensions.is(pg_temp.code(format('select api.service_sofascore_auto_map_players(%L, %L)', pg_temp.id('f0', 1),
  '[{"sofascorePlayerId":"X","side":"left","name":"A B"}]')), 'sofascore_auto_map_invalid', '1.6 the side must be home or away');
select extensions.is(pg_temp.code(format('select api.service_sofascore_auto_map_players(%L, %L)', pg_temp.id('f0', 9), '[]')),
  'sofascore_fixture_not_found', '1.7 unknown fixture');

create temporary table before1 as select
  (select count(*)::int from app.players) as players,
  (select count(*)::int from app.fantasy_players) as pool;

-- 2 the first call. Home side unless said. Names are deliberately misleading: they never decide.
create temporary table call1 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(
  pg_temp.pl('S1', 'Achraf H.', 'home', 2, 'D'),                           -- one candidate: linked on the first sighting
  pg_temp.pl('S2', 'Y. Ennesyri', 'home', 19, 'F'),                        -- spelled differently, same club, shirt, position
  pg_temp.pl('S3', 'Totally Different Spelling', 'home', 15, 'M'),         -- no resemblance at all
  pg_temp.pl('S4', 'Mohamed Ali', 'home', 7, 'M'),                         -- a squad name, but nobody wears 7: a new player
  pg_temp.pl('S5', 'Other Name', 'home', 5, 'M'),                          -- shirt 5 = player 4 ...
  pg_temp.pl('S23', 'Rival', 'home', 5, 'M'),                              -- ... and so does this one: a conflict for both
  pg_temp.pl('S6', 'Twin', 'home', 21, 'M'),                               -- two squad members wear 21
  pg_temp.pl('S7', 'Goalkeeper Guy', 'home', 12, 'G'),                     -- shirt 12 is an outfield player
  pg_temp.pl('S8', 'Outfield Guy', 'home', 1, 'D'),                        -- shirt 1 is the goalkeeper
  pg_temp.pl('S9', 'Walid Cheddira', 'home', 11, 'F'),                     -- exact name, but player 9 carries OLD9 and shirt 11
  pg_temp.pl('S10', 'Totally Different Name', 'home', 8, 'M'),             -- already mapped, unchanged
  pg_temp.pl('S11', 'Ismael Saibari', 'home', null, 'M'),                  -- exact name, no shirt number
  pg_temp.pl('S12', 'Unknown Substitute', 'home', 31, 'M', false),         -- did not appear: neither created nor queued
  pg_temp.pl('S13', 'Nayef Aguerd', 'away', 4, 'D'),                       -- right name, but the away squad has no 4: a new player
  pg_temp.pl('S14', 'Zak', 'away', 7, 'F'),                                -- the away side's own 7
  pg_temp.pl('S15', 'A. Mazraoui', 'home', 3, 'F'),                        -- shirt 3 is a defender: not a neighbour of forward
  pg_temp.pl('S19', 'Holder', 'home', 13, 'M'),                            -- player 19 carries an inactive OLD19
  pg_temp.pl('S20', 'Keeper Without Number', 'home', 40, 'G'),             -- a goalkeeper with no shirt on file could be him
  pg_temp.pl('S22', 'X', 'home', 42, 'M'))) as r;                          -- a one-letter name cannot become a player

select extensions.is((select jsonb_array_length(r -> 'mapped') from call1), 8,
  '2.1 eight are mapped: the old one, four links and three new players');
select extensions.is((select r -> 'created' from call1)::text, '3', '2.2 three players were created');
select extensions.is((select r -> 'createFailed' from call1)::text, '0', '2.3 none failed');
select extensions.is((select r -> 'queued' from call1)::text, '10', '2.4 ten are queued for staff');
select extensions.is((select r -> 'conflicts' from call1)::text, '3', '2.5 three of them are conflicts');
select extensions.is(pg_temp.mapped_to('S1'), pg_temp.id('a1', 1), '2.6 one candidate links on the first sighting');
select extensions.is(pg_temp.mapped_to('S2'), pg_temp.id('a1', 2), '2.7 a different spelling with the same club, shirt and position links');
select extensions.is(pg_temp.mapped_to('S3'), pg_temp.id('a1', 3), '2.8 no resemblance of names at all: still links');
select extensions.is(pg_temp.mapped_to('S14'), pg_temp.id('a1', 8), '2.9 the away side links to the away squad');
select extensions.is(pg_temp.reason('S5'), 'shirt_conflict', '2.10 two SofaScore ids pointing at one candidate: neither is linked');
select extensions.is(pg_temp.reason('S23'), 'shirt_conflict', '2.11 whichever comes first in the list');
select extensions.is(pg_temp.reason('S6'), 'ambiguous_shirt', '2.12 two squad members with that shirt: ambiguous');
select extensions.is((select cardinality(candidate_player_ids) from app_private.sofascore_player_match_queue where sofascore_player_id = 'S6'),
  2, '2.13 with both candidates listed');
select extensions.is(pg_temp.reason('S7'), 'position_mismatch', '2.14 a goalkeeper never matches an outfield player');
select extensions.is(pg_temp.reason('S8'), 'position_mismatch', '2.15 an outfield player never matches the goalkeeper');
select extensions.is(pg_temp.reason('S15'), 'position_mismatch', '2.16 defender and forward are not neighbours');
select extensions.is(pg_temp.reason('S11'), 'no_shirt', '2.17 no shirt number: queued, even with an exact name');
select extensions.is(pg_temp.reason('S19'), 'candidate_already_mapped', '2.18 a candidate with an inactive mapping is a conflict, not a link');
select extensions.is(pg_temp.reason('S20'), 'no_shirt_on_file', '2.19 a squad member with no shirt on file could be him: queued, not created');
select extensions.is((select candidate_player_ids from app_private.sofascore_player_match_queue where sofascore_player_id = 'S20'),
  array[pg_temp.id('a1', 27)], '2.20 with that member pre-filled');
select extensions.is(pg_temp.reason('S22'), 'no_candidate', '2.21 a name too short to create a player is queued');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_queue where sofascore_player_id = 'S12'), 0,
  '2.22 a player who did not appear is neither created nor queued');
select extensions.is((select count(*)::int from app.players) - (select players from before1), 3, '2.23 exactly three players were added');

-- 3 never by name -----------------------------------------------------------------------------------------
select extensions.isnt(pg_temp.mapped_to('S4'), pg_temp.id('a1', 4), '3.1 the same name with a different shirt is not linked to Mohamed Ali (player 4)');
select extensions.isnt(pg_temp.mapped_to('S4'), pg_temp.id('a1', 5), '3.2 nor to the other Mohamed Ali (player 5)');
select extensions.isnt(pg_temp.mapped_to('S9'), pg_temp.id('a1', 9), '3.3 an exact name does not take over a player who already carries another id');
select extensions.isnt(pg_temp.mapped_to('S13'), pg_temp.id('a1', 15), '3.4 an exact name on the wrong side is a new player of the right club');
select extensions.is((select team_id from app.team_memberships where player_id = pg_temp.mapped_to('S13')), pg_temp.id('c1', 2),
  '3.5 at the away club');

-- 4 a created player, end to end ----------------------------------------------------------------------------
create function pg_temp.new_player(p_sid text) returns uuid language sql as $$ select pg_temp.mapped_to(p_sid) $$;
select extensions.is((select position::text from app.players where id = pg_temp.new_player('S4')), 'midfielder', '4.1 position G/D/M/F maps to the app position');
select extensions.is((select display_name from app.players where id = pg_temp.new_player('S4')), 'Mohamed Ali', '4.2 the SofaScore name is kept for display');
select extensions.is((select shirt_number from app.team_memberships where player_id = pg_temp.new_player('S4')), 7,
  '4.3 his membership carries the shirt');
select extensions.ok((select valid_from <= '2026-08-10' and (valid_to is null or valid_to >= '2026-08-10') and active
    from app.team_memberships where player_id = pg_temp.new_player('S4')),
  '4.4 and covers the match being read (valid for the whole season)');
select extensions.is((select shirt_number from app.team_memberships where player_id = pg_temp.new_player('S9')), null,
  '4.5 a shirt another active member wears is left blank');
select extensions.is((select count(*)::int from app.fantasy_players) - (select pool from before1), 3, '4.6 three Fantasy pool entries');
select extensions.ok((select fp.active and fp.eligible and fp.status = 'available'
    and fp.price = round(app_private.fantasy_initial_price_v1('MID', 6.0, 0.0), 1)
    from app.fantasy_players fp where fp.football_player_id = pg_temp.new_player('S4')),
  '4.7 priced by the existing initial-price rule, available and eligible');
select extensions.ok((select fp.price = round(app_private.fantasy_initial_price_v1('DEF', 6.0, 0.0), 1)
    from app.fantasy_players fp where fp.football_player_id = pg_temp.new_player('S13')),
  '4.8 priced by position');
select extensions.is((select count(*)::int from app_private.fantasy_initial_price_evidence e
    join app.fantasy_players fp on fp.id = e.fantasy_player_id where fp.football_player_id = pg_temp.new_player('S4')), 1,
  '4.9 with its price evidence');
select extensions.is((select count(*)::int from app.fantasy_player_price_history h
    join app.fantasy_players fp on fp.id = h.fantasy_player_id where fp.football_player_id = pg_temp.new_player('S4')
      and h.reason = 'sofascore_player_created_v1'), 1, '4.10 and its price history');
select extensions.ok(exists (select 1 from jsonb_array_elements(api.fantasy_player_pool(pg_temp.id('c0', 5), 'MID', pg_temp.id('c1', 1), null, null, null, null, 50) -> 'items') i
    where i ->> 'footballPlayerId' = pg_temp.new_player('S4')::text),
  '4.11 he is in the pool a manager picks from');
select extensions.is(app_private.football_mapping_supporting_state(pg_temp.map_id('S4')) ->> 'reviewProvenance',
  'automatic_sofascore_created', '4.12 his mapping counts as reviewed, by the created proof');
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S4')) ->> 'reviewed')::boolean, true, '4.13 reviewed');
select extensions.is((select status || '/' || attempts from app_private.sofascore_fantasy_attempts where fixture_id = pg_temp.id('f0', 1)),
  'held/0', '4.14 a link or a creation reopens the club''s match that waited on a player identity');
select extensions.ok((select next_retry_at <= statement_timestamp() from app_private.sofascore_fantasy_attempts where fixture_id = pg_temp.id('f0', 1)),
  '4.15 to be tried on the next tick instead of after its back-off');

-- 5 existing mappings stay untouched -----------------------------------------------------------------------
select extensions.is(pg_temp.mapped_to('S10'), pg_temp.id('a1', 10), '5.1 an existing mapping is not changed');
select extensions.is((select source_version from app_private.football_provider_mappings where external_id = 'S10'), 'legacy',
  '5.2 not even its source_version');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id = 'OLD9' and active),
  1, '5.3 the other mapping of player 9 is untouched');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id = 'OLD19' and not active),
  1, '5.4 and so is the inactive one');

-- 6 idempotent, and a later match ---------------------------------------------------------------------------
create temporary table before2 as select
  (select count(*)::int from app_private.football_provider_mappings) as maps,
  (select count(*)::int from app.players) as players,
  (select count(*)::int from app.fantasy_players) as pool,
  (select count(*)::int from app_private.sofascore_player_match_log) as logs;
create temporary table call2 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(
  pg_temp.pl('S1', 'Achraf H.', 'home', 2, 'D'), pg_temp.pl('S4', 'Mohamed Ali', 'home', 7, 'M'),
  pg_temp.pl('S6', 'Twin', 'home', 21, 'M'))) as r;
select extensions.is((select count(*)::int from app_private.football_provider_mappings), (select maps from before2),
  '6.1 a re-run adds no mapping');
select extensions.is((select count(*)::int from app.players), (select players from before2), '6.2 no second player is created for the same id');
select extensions.is((select count(*)::int from app.fantasy_players), (select pool from before2), '6.3 nor a second pool entry');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_log), (select logs from before2), '6.4 nor a log row');
select extensions.is((select jsonb_array_length(r -> 'mapped') from call2), 2, '6.5 the two mapped ones are returned as they are');
select extensions.is((select r -> 'created' from call2)::text, '0', '6.6 nothing created');
select extensions.is((select times_seen from app_private.sofascore_player_match_queue where sofascore_player_id = 'S6'), 2,
  '6.7 a queued player is counted again, not duplicated');
-- Next match: the rival is gone, so S5 now has a single claim and links.
create temporary table call3 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 2), jsonb_build_array(
  pg_temp.pl('S5', 'Other Name', 'home', 5, 'M'), pg_temp.pl('S6', 'Twin', 'home', 21, 'M'))) as r;
select extensions.is(pg_temp.mapped_to('S5'), pg_temp.id('a1', 4), '6.8 an uncontended candidate links at the next match');
select extensions.is(pg_temp.reason('S6'), 'ambiguous_shirt', '6.9 an ambiguous one stays ambiguous');
select extensions.is(pg_temp.mapped_to('S6'), null, '6.10 and is never linked');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_queue where sofascore_player_id = 'S5' and resolved_at is not null), 1,
  '6.11 the queue entry of the linked one is closed');

-- 7 reviewed -------------------------------------------------------------------------------------------------
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S1')) ->> 'reviewed')::boolean, true,
  '7.1 an automatic side-shirt-position mapping is reviewed for the Fantasy function');
select extensions.is(app_private.football_mapping_supporting_state(pg_temp.map_id('S1')) ->> 'reviewProvenance',
  'automatic_side_shirt_position', '7.2 and says why');
select extensions.alike((select source_version from app_private.football_provider_mappings where external_id = 'S1'),
  'sofascore-auto-map:side-shirt-position:%', '7.3 the source_version names the automatic method');
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S10')) ->> 'reviewed')::boolean, false,
  '7.4 a legacy unreviewed mapping stays unreviewed');
select extensions.is(app_private.football_mapping_supporting_dependency('F1_REVIEWED_SOFASCORE_EVENTS',
    pg_temp.map_id('S1'), pg_temp.id('a1', 1)) ->> 'code',
  'supporting_mapping_unreviewed', '7.5 an automatic match is not accepted as supporting evidence for another provider');
update app_private.football_provider_mappings set source_version = 'sofascore-auto-map:side-shirt-position:' || gen_random_uuid()::text
 where external_id = 'S2';
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S2')) ->> 'reviewed')::boolean, false,
  '7.6 a marker without a matching log row proves nothing');
update app_private.football_provider_mappings set internal_entity_id = pg_temp.id('a1', 14) where external_id = 'S3';
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S3')) ->> 'reviewed')::boolean, false,
  '7.7 a mapping moved to another player after the fact is no longer reviewed');
create function pg_temp.context_reviewed(p_sid text) returns boolean language sql as $context$
  select (e ->> 'reviewed')::boolean
    from jsonb_array_elements(api.service_sofascore_fantasy_context(
      pg_temp.id('f0', 1), array[p_sid]) -> 'players') e where e ->> 'externalId' = p_sid $context$;
select extensions.is(pg_temp.context_reviewed('S1'), true, '7.8 automatic context accepts a side-shirt-position proof');
select extensions.is(pg_temp.context_reviewed('S4'), true, '7.9 and a created proof');
select extensions.is(pg_temp.context_reviewed('S10'), false, '7.10 and rejects an unreviewed legacy row');
select extensions.is(pg_temp.context_reviewed('S2'), false, '7.11 and a missing proof log');
select extensions.is(pg_temp.context_reviewed('S3'), false, '7.12 and a mapping moved after review');

-- 8 a refused creation rolls back -----------------------------------------------------------------------------
create function public.sfm_refuse_pool() returns trigger language plpgsql as $$
begin raise exception 'sfm_pool_refused'; end $$;
create trigger sfm_refuse_pool before insert on app.fantasy_players for each row execute function public.sfm_refuse_pool();
create temporary table before3 as select
  (select count(*)::int from app.players) as players,
  (select count(*)::int from app.team_memberships) as memberships,
  (select count(*)::int from app_private.football_provider_mappings) as maps;
create temporary table call4 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 2), jsonb_build_array(
  pg_temp.pl('S30', 'Refused Newcomer', 'home', 50, 'M'))) as r;
select extensions.is((select r -> 'createFailed' from call4)::text, '1', '8.1 a refusal by the catalog is counted');
select extensions.is((select r -> 'created' from call4)::text, '0', '8.2 and nothing is created');
select extensions.is((select count(*)::int from app.players), (select players from before3), '8.3 no player is left behind');
select extensions.is((select count(*)::int from app.team_memberships), (select memberships from before3), '8.4 no membership');
select extensions.is((select count(*)::int from app_private.football_provider_mappings), (select maps from before3), '8.5 no mapping');
select extensions.is(pg_temp.reason('S30'), 'no_candidate', '8.6 he is queued, and the next call tries again');
drop trigger sfm_refuse_pool on app.fantasy_players;
select extensions.is((select r -> 'created' from (select api.service_sofascore_auto_map_players(pg_temp.id('f0', 2), jsonb_build_array(
  pg_temp.pl('S30', 'Refused Newcomer', 'home', 50, 'M'))) as r) x)::text, '1', '8.7 and then creates him');

-- 9 staff ----------------------------------------------------------------------------------------------------
select pg_temp.act('svc');
select extensions.isnt(pg_temp.code('select api.admin_sofascore_player_match_queue()'), 'ok',
  '9.1 the service role cannot read the staff list');
select pg_temp.act('anon');
select extensions.isnt(pg_temp.code('select api.admin_resolve_sofascore_player_match(''S20'', ''' || pg_temp.id('a1', 27) || ''')'), 'ok',
  '9.2 a caller who is not staff cannot resolve');
select pg_temp.act('op');
select extensions.is((select jsonb_array_length(api.admin_sofascore_player_match_queue())), 9,
  '9.3 staff see the nine open entries (the leftovers)');
select extensions.ok((select e -> 'candidates' -> 0 ->> 'playerId' = pg_temp.id('a1', 27)::text
    from jsonb_array_elements(api.admin_sofascore_player_match_queue()) e where e ->> 'sofascorePlayerId' = 'S20'),
  '9.4 a leftover arrives with its candidate pre-filled');
select extensions.is(pg_temp.code('select api.admin_resolve_sofascore_player_match(''S19'', ''' || pg_temp.id('a1', 19) || ''')'),
  'sofascore_mapping_conflict', '9.5 resolving onto a player that already carries another id is refused');
select extensions.is(pg_temp.code('select api.admin_resolve_sofascore_player_match(''NOPE'', ''' || pg_temp.id('a1', 12) || ''')'),
  'queue_entry_not_found', '9.6 unknown queue entry');
select extensions.is(api.admin_resolve_sofascore_player_match('S20', pg_temp.id('a1', 27)) ->> 'playerId',
  pg_temp.id('a1', 27)::text, '9.7 staff confirm the pre-filled candidate in one call');
select extensions.is(app_private.football_mapping_supporting_state(pg_temp.map_id('S20')) ->> 'reviewProvenance',
  'staff_resolution', '9.8 and it counts as reviewed, by staff resolution');
select extensions.is((api.admin_resolve_sofascore_player_match('S20', pg_temp.id('a1', 27)) ->> 'alreadyResolved')::boolean, true,
  '9.9 resolving again to the same player is harmless');
select extensions.is(pg_temp.code('select api.admin_resolve_sofascore_player_match(''S20'', ''' || pg_temp.id('a1', 15) || ''')'),
  'queue_entry_already_resolved', '9.10 but not to a different one');
select extensions.is((select jsonb_array_length(api.admin_sofascore_player_match_queue())), 8,
  '9.11 the resolved entry leaves the list');
select pg_temp.act('svc');
select extensions.is(pg_temp.context_reviewed('S20'), true, '9.12 automatic context accepts the staff-resolution proof');

-- 10 the position rule --------------------------------------------------------------------------------------
select extensions.ok(app_private.sofascore_position_compatible('defender', 'defender')
  and app_private.sofascore_position_compatible('goalkeeper', 'goalkeeper')
  and app_private.sofascore_position_compatible('defender', 'midfielder')
  and app_private.sofascore_position_compatible('midfielder', 'forward')
  and app_private.sofascore_position_compatible('forward', 'midfielder')
  and app_private.sofascore_position_compatible(null, 'goalkeeper')
  and app_private.sofascore_position_compatible('forward', null),
  '10.1 equal, neighbouring lines and unknown are compatible');
select extensions.ok(not app_private.sofascore_position_compatible('goalkeeper', 'defender')
  and not app_private.sofascore_position_compatible('midfielder', 'goalkeeper')
  and not app_private.sofascore_position_compatible('goalkeeper', 'forward')
  and not app_private.sofascore_position_compatible('defender', 'forward'),
  '10.2 a goalkeeper only with a goalkeeper, and defender never with forward');

select * from extensions.finish();
rollback;
