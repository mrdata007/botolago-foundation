begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- Automatic SofaScore player matching (api.service_sofascore_auto_map_players and the staff list),
-- as rewritten by 20261013150000: side + shirt number + position over two matches, never a name.
-- Real functions, synthetic world:
--   1 permissions   2 first sighting: queued awaiting_second_match, names never decide
--   3 doubtful ones are queued with a reason   4 the second match links; conflicts do not
--   5 existing mappings stay untouched   6 idempotent re-run   7 "reviewed" and its limits
--   8 staff list and resolution   9 position rule and the two constants

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

-- World: team 1 (home) and team 2 (away) in one season, two fixtures between them.
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'sofa-match-test', 'SofaScore Match Test', 'SM', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', false);
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
  (26, 1, 'Lonely Player', 'midfielder', 25);
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
create function pg_temp.sightings(p_sid text) returns integer language sql as $$
  select count(distinct fixture_id)::int from app_private.sofascore_player_sightings where sofascore_player_id = p_sid $$;

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
  and not has_table_privilege('authenticated', 'app_private.sofascore_player_sightings', 'select')
  and not has_table_privilege('anon', 'app_private.sofascore_player_sightings', 'select')
  and not has_table_privilege('service_role', 'app_private.sofascore_player_sightings', 'select')
  and not has_function_privilege('service_role', 'app_private.sofascore_position_compatible(text,text)', 'execute')
  and not has_function_privilege('service_role', 'app_private.sofascore_automatch_min_matches()', 'execute'),
  '1.3 the queue, the log, the sightings and their helpers are not reachable by API roles');
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

-- The first match. Home side unless said. Names are deliberately misleading: they never decide.
create temporary table call1 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(
  pg_temp.pl('S1', 'Achraf Hakimi', 'home', 2, 'D'),                       -- same name, shirt, position as player 1
  pg_temp.pl('S2', 'Y. Ennesyri', 'home', 19, 'F'),                        -- spelled differently
  pg_temp.pl('S3', 'Totally Different Spelling', 'home', 15, 'M'),         -- no resemblance at all
  pg_temp.pl('S4', 'Mohamed Ali', 'home', 7, 'M'),                         -- a squad name, but no home player wears 7
  pg_temp.pl('S5', 'Other Name', 'home', 5, 'M'),                          -- shirt 5 = player 4
  pg_temp.pl('S6', 'Twin', 'home', 21, 'M'),                               -- two squad members wear 21
  pg_temp.pl('S7', 'Goalkeeper Guy', 'home', 12, 'G'),                     -- shirt 12 is an outfield player
  pg_temp.pl('S8', 'Outfield Guy', 'home', 1, 'D'),                        -- shirt 1 is the goalkeeper
  pg_temp.pl('S9', 'Walid Cheddira', 'home', 11, 'F'),                     -- exact name, but player 9 carries OLD9
  pg_temp.pl('S10', 'Totally Different Name', 'home', 8, 'M'),             -- already mapped, unchanged
  pg_temp.pl('S11', 'Ismael Saibari', 'home', null, 'M'),                  -- exact name, no shirt number
  pg_temp.pl('S12', 'Unknown Substitute', 'home', 31, 'M', false),         -- did not appear: not queued
  pg_temp.pl('S13', 'Nayef Aguerd', 'away', 4, 'D'),                       -- right name, wrong side
  pg_temp.pl('S14', 'Zak', 'away', 7, 'F'),                                -- the away side's own 7
  pg_temp.pl('S15', 'A. Mazraoui', 'home', 3, 'F'),                        -- shirt 3 is a defender: not a neighbour of forward
  pg_temp.pl('S19', 'Holder', 'home', 13, 'M'),                            -- player 19 carries an inactive OLD19
  pg_temp.pl('S24', 'Nine', 'home', 9, 'F'),                               -- shirt 9 here, shirt 6 next time
  pg_temp.pl('S26', 'Lonely', 'home', 25, 'M'))) as r;

select extensions.is((select r -> 'queued' from call1)::text, '16', '2.0 sixteen players are queued after the first match');
select extensions.is((select r -> 'conflicts' from call1)::text, '0', '2.0b none is a conflict yet');
select extensions.is((select jsonb_array_length(r -> 'mapped') from call1), 1,
  '2.0c only the already-mapped one is returned: nobody is linked on one sighting');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_log), 0, '2.0d and no log row exists');
select extensions.is(pg_temp.reason('S1'), 'awaiting_second_match', '2.1 an exact name, shirt and position is still only a first sighting');
select extensions.is(pg_temp.reason('S2'), 'awaiting_second_match', '2.2 a different spelling is the same first sighting');
select extensions.is(pg_temp.reason('S3'), 'awaiting_second_match', '2.3 a name with no resemblance is too');
select extensions.is(pg_temp.mapped_to('S1'), null, '2.4 nothing is linked after one match');
select extensions.is((select candidate_player_ids from app_private.sofascore_player_match_queue where sofascore_player_id = 'S3'),
  array[pg_temp.id('a1', 3)], '2.5 the candidate is pre-filled for staff');
select extensions.is(pg_temp.reason('S4'), 'no_candidate', '3.1 the same name with a different shirt number is not a match');
select extensions.is(pg_temp.mapped_to('S4'), null, '3.2 and links to neither Mohamed Ali');
select extensions.is(pg_temp.reason('S6'), 'ambiguous_shirt', '3.3 two squad members with that shirt: ambiguous');
select extensions.is((select cardinality(candidate_player_ids) from app_private.sofascore_player_match_queue where sofascore_player_id = 'S6'),
  2, '3.4 with both candidates listed');
select extensions.is(pg_temp.sightings('S6'), 0, '3.5 and no sighting is recorded for an ambiguous one');
select extensions.is(pg_temp.reason('S7'), 'position_mismatch', '3.6 a goalkeeper never matches an outfield player');
select extensions.is(pg_temp.reason('S8'), 'position_mismatch', '3.7 an outfield player never matches the goalkeeper');
select extensions.is(pg_temp.reason('S9'), 'no_candidate', '3.8 a player who already has an active SofaScore mapping is not a candidate');
select extensions.is(pg_temp.reason('S11'), 'no_shirt', '3.9 no shirt number: queued, even with an exact name');
select extensions.is(pg_temp.reason('S13'), 'no_candidate', '3.10 the side decides which club is searched');
select extensions.is(pg_temp.reason('S14'), 'awaiting_second_match', '3.11 the away side finds the away squad');
select extensions.is(pg_temp.reason('S15'), 'position_mismatch', '3.12 defender and forward are not neighbours');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_queue where sofascore_player_id = 'S12'), 0,
  '3.13 a player who did not appear is neither linked nor queued');
select extensions.is(pg_temp.reason('S26'), 'awaiting_second_match', '3.14 a lone sighting waits');
select extensions.is((select count(*)::int from app_private.sofascore_player_sightings), 8,
  '3.15 eight sightings: one for each player with exactly one candidate (S1, S2, S3, S5, S14, S19, S24, S26)');

-- 4 the second match ----------------------------------------------------------------------------------------
-- A finished match of club 1 that waits on a player identity, with a long back-off still running.
insert into app_private.sofascore_fantasy_attempts (fixture_id, sofascore_event_id, status, attempts, last_attempt_at,
  next_retry_at, last_outcome)
values (pg_temp.id('f0', 1), '1001', 'held', 14, statement_timestamp(), statement_timestamp() + interval '5 hours',
  'unmapped_players');
create temporary table call2 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 2), jsonb_build_array(
  pg_temp.pl('S1', 'H. Achraf', 'home', 2, 'D'),                           -- spelled differently, same side + shirt + position
  pg_temp.pl('S2', 'Nesyri', 'home', 19, 'M'),                             -- midfielder is a neighbour of forward
  pg_temp.pl('S3', 'Whoever', 'home', 15, 'M'),
  pg_temp.pl('S4', 'Mohamed Ali', 'home', 7, 'M'),                         -- still no 7
  pg_temp.pl('S5', 'Other Name', 'home', 5, 'M'),                          -- rival below points at the same player
  pg_temp.pl('S23', 'Rival', 'home', 5, 'M'),
  pg_temp.pl('S6', 'Twin', 'home', 21, 'M'),
  pg_temp.pl('S7', 'Goalkeeper Guy', 'home', 12, 'G'),
  pg_temp.pl('S8', 'Outfield Guy', 'home', 1, 'D'),
  pg_temp.pl('S14', 'Zak', 'away', 7, 'F'),
  pg_temp.pl('S19', 'Holder', 'home', 13, 'M'),
  pg_temp.pl('S24', 'Nine', 'home', 6, 'D'))) as r;                        -- seen with player 7, now with player 5

select extensions.is(pg_temp.mapped_to('S1'), pg_temp.id('a1', 1), '4.1 same side, shirt and position in two matches: linked');
select extensions.is(pg_temp.mapped_to('S2'), pg_temp.id('a1', 2), '4.2 a different spelling and a neighbouring line: linked');
select extensions.is(pg_temp.mapped_to('S3'), pg_temp.id('a1', 3), '4.3 no resemblance of names at all: linked');
select extensions.is(pg_temp.mapped_to('S14'), pg_temp.id('a1', 8), '4.4 the away side links to the away squad');
select extensions.is((select jsonb_array_length(r -> 'mapped') from call2), 4, '4.5 four players are returned as mapped');
select extensions.is((select r -> 'queued' from call2)::text, '8', '4.6 eight are queued');
select extensions.is((select r -> 'conflicts' from call2)::text, '4', '4.7 and four of those are conflicts');
select extensions.is(pg_temp.mapped_to('S4'), null, '4.8 two matches of the same name with the wrong shirt link nothing');
select extensions.is(pg_temp.reason('S4'), 'no_candidate', '4.9 and say so');
select extensions.is(pg_temp.reason('S5'), 'shirt_conflict', '4.10 two SofaScore ids pointing at one player: neither is linked');
select extensions.is(pg_temp.reason('S23'), 'shirt_conflict', '4.11 whichever comes first in the list');
select extensions.is(pg_temp.mapped_to('S5'), null, '4.12 S5 stays unlinked');
select extensions.is(pg_temp.reason('S24'), 'shirt_conflict', '4.13 one SofaScore id paired with two players: conflict');
select extensions.is((select array(select unnest(candidate_player_ids) order by 1) from app_private.sofascore_player_match_queue
    where sofascore_player_id = 'S24'), array[pg_temp.id('a1', 5), pg_temp.id('a1', 7)],
  '4.14 with both players offered to staff');
select extensions.is(pg_temp.reason('S6'), 'ambiguous_shirt', '4.15 an ambiguous one stays ambiguous after two matches');
select extensions.is(pg_temp.mapped_to('S6'), null, '4.16 and is never linked');
select extensions.is(pg_temp.mapped_to('S7'), null, '4.17 a goalkeeper is not linked to an outfield player, even after two matches');
select extensions.is(pg_temp.mapped_to('S8'), null, '4.18 an outfield player is not linked to the goalkeeper');
select extensions.is(pg_temp.reason('S19'), 'candidate_already_mapped', '4.19 a candidate with an inactive mapping is a conflict, not a link');
select extensions.is(pg_temp.mapped_to('S19'), null, '4.20 nothing is linked to it');
select extensions.is(pg_temp.sightings('S1'), 2, '4.21 "seen in two matches" is a count of distinct fixtures');
select extensions.is(pg_temp.sightings('S7'), 0, '4.22 a position mismatch records no sighting');
select extensions.is(pg_temp.sightings('S26'), 1, '4.23 one fixture is one sighting');
select extensions.is((select status || '/' || attempts from app_private.sofascore_fantasy_attempts where fixture_id = pg_temp.id('f0', 1)),
  'held/0', '4.24 a new link reopens the club''s match that waited on a player identity');
select extensions.ok((select next_retry_at <= statement_timestamp() from app_private.sofascore_fantasy_attempts where fixture_id = pg_temp.id('f0', 1)),
  '4.25 to be tried on the next tick instead of after its back-off');

-- 5 existing mappings stay untouched -----------------------------------------------------------------------
select extensions.is(pg_temp.mapped_to('S10'), pg_temp.id('a1', 10), '5.1 an existing mapping is not changed');
select extensions.is((select source_version from app_private.football_provider_mappings where external_id = 'S10'), 'legacy',
  '5.2 not even its source_version');
select extensions.ok(exists(select 1 from call1, jsonb_array_elements(call1.r -> 'mapped') e
    where e ->> 'sofascorePlayerId' = 'S10' and e ->> 'playerId' = pg_temp.id('a1', 10)::text),
  '5.3 it is returned as mapped');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id = 'OLD9' and active),
  1, '5.4 the other mapping of player 9 is untouched');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id = 'OLD19' and not active),
  1, '5.5 and so is the inactive one');

-- 6 idempotent -----------------------------------------------------------------------------------------------
create temporary table before2 as select
  (select count(*)::int from app_private.football_provider_mappings) as maps,
  (select count(*)::int from app_private.sofascore_player_sightings) as sights,
  (select count(*)::int from app_private.sofascore_player_match_log) as logs;
create temporary table call3 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(
  pg_temp.pl('S1', 'H. Achraf', 'home', 2, 'D'), pg_temp.pl('S5', 'Other Name', 'home', 5, 'M'),
  pg_temp.pl('S26', 'Lonely', 'home', 25, 'M'))) as r;
select extensions.is((select count(*)::int from app_private.football_provider_mappings), (select maps from before2),
  '6.1 a re-run adds no mapping');
select extensions.is((select count(*)::int from app_private.sofascore_player_sightings), (select sights from before2),
  '6.2 and no sighting: a fixture counts once');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_log), (select logs from before2),
  '6.3 and no log row');
select extensions.is((select r -> 'mapped' from call3)::text,
  jsonb_build_array(jsonb_build_object('sofascorePlayerId', 'S1', 'playerId', pg_temp.id('a1', 1)))::text,
  '6.4 and returns the existing one');
select extensions.is(pg_temp.reason('S26'), 'awaiting_second_match', '6.5 seeing a lone player in the same match again does not make two matches');
select extensions.is((select times_seen from app_private.sofascore_player_match_queue where sofascore_player_id = 'S5'), 3,
  '6.6 a queued player is counted again, not duplicated');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_queue where sofascore_player_id = 'S5'), 1,
  '6.7 one queue row per SofaScore player');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_log), 4,
  '6.8 one log row per automatic mapping');

-- 7 reviewed -------------------------------------------------------------------------------------------------
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S1')) ->> 'reviewed')::boolean, true,
  '7.1 an automatic side-shirt-position mapping is reviewed for the Fantasy function');
select extensions.is(app_private.football_mapping_supporting_state(pg_temp.map_id('S1')) ->> 'reviewProvenance',
  'automatic_side_shirt_position', '7.2 and says why');
select extensions.alike((select source_version from app_private.football_provider_mappings where external_id = 'S1'),
  'sofascore-auto-map:side-shirt-position:%', '7.3 the source_version names the automatic method');
select extensions.is((select method from app_private.sofascore_player_match_log where mapping_id = pg_temp.map_id('S3')),
  'side-shirt-position', '7.4 the log names it too');
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S10')) ->> 'reviewed')::boolean, false,
  '7.5 a legacy unreviewed mapping stays unreviewed');
select extensions.is(app_private.football_mapping_supporting_dependency('F1_REVIEWED_SOFASCORE_EVENTS',
    pg_temp.map_id('S1'), pg_temp.id('a1', 1)) ->> 'code',
  'supporting_mapping_unreviewed', '7.6 an automatic match is not accepted as supporting evidence for another provider');
update app_private.football_provider_mappings set source_version = 'sofascore-auto-map:side-shirt-position:' || gen_random_uuid()::text
 where external_id = 'S2';
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S2')) ->> 'reviewed')::boolean, false,
  '7.7 a marker without a matching log row proves nothing');
update app_private.football_provider_mappings set internal_entity_id = pg_temp.id('a1', 14) where external_id = 'S3';
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S3')) ->> 'reviewed')::boolean, false,
  '7.8 a mapping moved to another player after the fact is no longer reviewed');

-- The automatic ingestion context must agree with the writer's review proof.
create function pg_temp.context_reviewed(p_sid text) returns boolean language sql as $context$
  select (e ->> 'reviewed')::boolean
    from jsonb_array_elements(api.service_sofascore_fantasy_context(
      pg_temp.id('f0', 1), array[p_sid]) -> 'players') e where e ->> 'externalId' = p_sid $context$;
select extensions.is(pg_temp.context_reviewed('S1'), true,
  '7.9 automatic context accepts a side-shirt-position proof');
select extensions.is(pg_temp.context_reviewed('S10'), false,
  '7.10 automatic context rejects an unreviewed legacy row');
select extensions.is(pg_temp.context_reviewed('S2'), false,
  '7.11 automatic context rejects a missing proof log');
select extensions.is(pg_temp.context_reviewed('S3'), false,
  '7.12 automatic context rejects a mapping moved after review');

-- 8 staff ----------------------------------------------------------------------------------------------------
select pg_temp.act('svc');
select extensions.isnt(pg_temp.code('select api.admin_sofascore_player_match_queue()'), 'ok',
  '8.1 the service role cannot read the staff list');
select pg_temp.act('anon');
select extensions.isnt(pg_temp.code('select api.admin_resolve_sofascore_player_match(''S26'', ''' || pg_temp.id('a1', 26) || ''')'), 'ok',
  '8.2 a caller who is not staff cannot resolve');
select pg_temp.act('op');
select extensions.is((select jsonb_array_length(api.admin_sofascore_player_match_queue())), 13,
  '8.3 staff see the thirteen open entries');
select extensions.ok((select e -> 'candidates' -> 0 ->> 'playerId' = pg_temp.id('a1', 26)::text
    from jsonb_array_elements(api.admin_sofascore_player_match_queue()) e where e ->> 'sofascorePlayerId' = 'S26'),
  '8.4 a first sighting arrives with its candidate pre-filled');
select extensions.is(pg_temp.code('select api.admin_resolve_sofascore_player_match(''S19'', ''' || pg_temp.id('a1', 19) || ''')'),
  'sofascore_mapping_conflict', '8.5 resolving onto a player that already carries another id is refused');
select extensions.is(pg_temp.code('select api.admin_resolve_sofascore_player_match(''NOPE'', ''' || pg_temp.id('a1', 12) || ''')'),
  'queue_entry_not_found', '8.6 unknown queue entry');
select extensions.is(api.admin_resolve_sofascore_player_match('S26', pg_temp.id('a1', 26)) ->> 'playerId',
  pg_temp.id('a1', 26)::text, '8.7 staff confirm the pre-filled candidate in one call');
select extensions.is(pg_temp.mapped_to('S26'), pg_temp.id('a1', 26), '8.8 the mapping exists');
select extensions.is(app_private.football_mapping_supporting_state(pg_temp.map_id('S26')) ->> 'reviewProvenance',
  'staff_resolution', '8.9 and counts as reviewed, by staff resolution');
select extensions.is((select resolved_player_id from app_private.sofascore_player_match_queue where sofascore_player_id = 'S26'),
  pg_temp.id('a1', 26), '8.10 the queue entry is marked resolved');
select extensions.is((api.admin_resolve_sofascore_player_match('S26', pg_temp.id('a1', 26)) ->> 'alreadyResolved')::boolean, true,
  '8.11 resolving again to the same player is harmless');
select extensions.is(pg_temp.code('select api.admin_resolve_sofascore_player_match(''S26'', ''' || pg_temp.id('a1', 15) || ''')'),
  'queue_entry_already_resolved', '8.12 but not to a different one');
select extensions.is((select jsonb_array_length(api.admin_sofascore_player_match_queue())), 12,
  '8.13 the resolved entry leaves the list');
select extensions.is(api.admin_resolve_sofascore_player_match('S24', pg_temp.id('a1', 5)) ->> 'playerId',
  pg_temp.id('a1', 5)::text, '8.14 staff settle a conflict by choosing one of the offered players');
select pg_temp.act('svc');
select extensions.is((select jsonb_array_length(
  api.service_sofascore_auto_map_players(pg_temp.id('f0', 2), jsonb_build_array(pg_temp.pl('S26', 'Lonely', 'home', 25, 'M'))) -> 'mapped')),
  1, '8.15 the matcher now returns the staff-made mapping unchanged');
select extensions.is(pg_temp.context_reviewed('S26'), true,
  '8.16 automatic context accepts the staff-resolution proof');

-- 9 the position rule and the constants ---------------------------------------------------------------------
select extensions.is(app_private.sofascore_automatch_min_matches(), 2, '9.1 two matches are needed');
select extensions.ok(app_private.sofascore_position_compatible('defender', 'defender')
  and app_private.sofascore_position_compatible('goalkeeper', 'goalkeeper')
  and app_private.sofascore_position_compatible('defender', 'midfielder')
  and app_private.sofascore_position_compatible('midfielder', 'forward')
  and app_private.sofascore_position_compatible('forward', 'midfielder')
  and app_private.sofascore_position_compatible(null, 'goalkeeper')
  and app_private.sofascore_position_compatible('forward', null),
  '9.2 equal, neighbouring lines and unknown are compatible');
select extensions.ok(not app_private.sofascore_position_compatible('goalkeeper', 'defender')
  and not app_private.sofascore_position_compatible('midfielder', 'goalkeeper')
  and not app_private.sofascore_position_compatible('goalkeeper', 'forward')
  and not app_private.sofascore_position_compatible('defender', 'forward'),
  '9.3 a goalkeeper only with a goalkeeper, and defender never with forward');

select * from extensions.finish();
rollback;
