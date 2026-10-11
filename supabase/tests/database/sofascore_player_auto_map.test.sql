begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- Automatic SofaScore player matching (api.service_sofascore_auto_map_players and the staff list).
-- Real functions, synthetic world:
--   1 permissions   2 exact name, accents, hyphens   3 name + shirt number   4 doubtful ones are queued
--   5 existing mappings stay untouched   6 idempotent re-run   7 "reviewed" and its limits
--   8 staff list and resolution

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

-- World: team 1 (home) and team 2 (away) in one season, one fixture.
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
  pg_temp.id('c1', 2), '2026-08-10 12:00Z', 'finished', 1, 0, '2026-08-10 14:00Z', 10, '2026-08-10 14:00Z');

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
  (15, 1, 'Nayef Aguerd', 'defender', 4);
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id('a1', i), 'sfm-player-' || i, full_name, full_name, pos::app.football_position from roster;
insert into app.team_memberships (player_id, team_id, season_id, valid_from, shirt_number)
select pg_temp.id('a1', i), pg_temp.id('c1', club), pg_temp.id('c0', 3), '2026-08-01', shirt from roster;

-- Mappings that exist before the first call: S10 -> player 10 (an old, unreviewed row), and player 9 is
-- already carried by another SofaScore id (OLD9).
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sofascore', 'player', 'S10', pg_temp.id('a1', 10), 'legacy', now()),
  ('sofascore', 'player', 'OLD9', pg_temp.id('a1', 9), 'legacy', now());

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
  and not has_table_privilege('service_role', 'app_private.sofascore_player_match_log', 'select'),
  '1.3 the queue and the log are not readable by API roles');
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

-- The first call. Home side: exact, accents, hyphen, shirt rule, doubtful ones. Away side: a team-1 name.
create temporary table call1 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(
  pg_temp.pl('S1', 'Achraf Hakimi', 'home', 2, 'D'),                       -- exact
  pg_temp.pl('S2', 'Youssef En Nesyri', 'home', null, 'F'),                -- hyphen vs space
  pg_temp.pl('S3', 'SÉLIM  AMALLAH', 'home', null, 'M'),                   -- case, accent, double space
  pg_temp.pl('S4', 'Mohamed Ali', 'home', null, 'M'),                      -- two same-name players in the squad
  pg_temp.pl('S7', 'A. El Kaabi', 'home', 9, 'F'),                         -- last name + shirt
  pg_temp.pl('S8', 'Zakaria Aboukhlal', 'home', 7, 'F'),                   -- belongs to the other team
  pg_temp.pl('S9', 'Walid Cheddira', 'home', 11, 'F'),                     -- candidate already carries OLD9
  pg_temp.pl('S10', 'Totally Different Name', 'home', 8, 'M'),             -- already mapped, unchanged
  pg_temp.pl('S11', 'ISMAËL SAIBARI', 'home', null, 'M'),                  -- diaeresis
  pg_temp.pl('S12', 'Bilal Khannouss', 'home', null, 'M'),                 -- partial name
  pg_temp.pl('S13', 'Nobody Known', 'home', 30, 'M'),                      -- no candidate
  pg_temp.pl('S14', 'Unknown Substitute', 'home', 31, 'M', false),         -- did not appear: not queued
  pg_temp.pl('S15', 'Nayef Aguerd', 'away', 4, 'D'),                       -- right name, wrong side
  pg_temp.pl('S16', 'A. Mazraoui', 'home', 3, 'F'))) as r;                 -- name + shirt but position disagrees

select extensions.is((select r -> 'queued' from call1)::text, '7', '2.0 seven doubtful players are queued');
select extensions.is((select r -> 'conflicts' from call1)::text, '1', '2.0b one of them is a conflict');
select extensions.is(pg_temp.mapped_to('S1'), pg_temp.id('a1', 1), '2.1 exact full name maps');
select extensions.is(pg_temp.mapped_to('S2'), pg_temp.id('a1', 2), '2.2 hyphen and space are the same name');
select extensions.is(pg_temp.mapped_to('S3'), pg_temp.id('a1', 3), '2.3 case, accents and spacing do not matter');
select extensions.is(pg_temp.mapped_to('S11'), pg_temp.id('a1', 11), '2.4 a diaeresis is just an accent');
select extensions.is(pg_temp.mapped_to('S7'), pg_temp.id('a1', 7), '3.1 same last name and same shirt number maps');
select extensions.is(pg_temp.mapped_to('S16'), null, '3.2 name + shirt is not enough when the position disagrees');
select extensions.is((select reason from app_private.sofascore_player_match_queue where sofascore_player_id = 'S16'),
  'position_mismatch', '3.3 and the reason says so');
select extensions.is((select reason from app_private.sofascore_player_match_queue where sofascore_player_id = 'S4'),
  'ambiguous_name', '4.1 two players with the same name: queued as ambiguous');
select extensions.is((select cardinality(candidate_player_ids) from app_private.sofascore_player_match_queue where sofascore_player_id = 'S4'),
  2, '4.2 with both candidates listed');
select extensions.is(pg_temp.mapped_to('S4'), null, '4.3 nothing was mapped for it');
select extensions.is((select reason from app_private.sofascore_player_match_queue where sofascore_player_id = 'S9'),
  'candidate_already_mapped', '4.4 a candidate that already carries another SofaScore id is a conflict');
select extensions.is(pg_temp.mapped_to('S9'), null, '4.5 and is not mapped');
select extensions.is((select reason from app_private.sofascore_player_match_queue where sofascore_player_id = 'S12'),
  'partial_name', '4.6 a partial name is queued, never guessed');
select extensions.is((select reason from app_private.sofascore_player_match_queue where sofascore_player_id = 'S13'),
  'no_candidate', '4.7 no candidate is queued');
select extensions.is(pg_temp.mapped_to('S8'), null, '4.8 a player of the other team is never a candidate');
select extensions.is((select reason from app_private.sofascore_player_match_queue where sofascore_player_id = 'S8'),
  'no_candidate', '4.9 so it is queued as unknown on this side');
select extensions.is(pg_temp.mapped_to('S15'), null, '4.10 the side decides which team is searched');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_queue where sofascore_player_id = 'S14'), 0,
  '4.11 a player who did not appear is neither mapped nor queued');
select extensions.is(pg_temp.mapped_to('S10'), pg_temp.id('a1', 10), '5.1 an existing mapping is not changed');
select extensions.is((select source_version from app_private.football_provider_mappings where external_id = 'S10'), 'legacy',
  '5.2 not even its source_version');
select extensions.ok(exists(select 1 from call1, jsonb_array_elements(call1.r -> 'mapped') e
    where e ->> 'sofascorePlayerId' = 'S10' and e ->> 'playerId' = pg_temp.id('a1', 10)::text),
  '5.3 it is returned as mapped');
select extensions.is((select jsonb_array_length(r -> 'mapped') from call1), 6,
  '5.4 six players are returned as mapped (five new ones and the existing one)');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id = 'OLD9' and active),
  1, '5.5 the other mapping of the conflict is untouched');

-- 6 idempotent -----------------------------------------------------------------------------------------------
create temporary table before2 as select count(*)::int as maps from app_private.football_provider_mappings;
create temporary table call2 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(
  pg_temp.pl('S1', 'Achraf Hakimi', 'home', 2, 'D'), pg_temp.pl('S4', 'Mohamed Ali', 'home', null, 'M'),
  pg_temp.pl('S9', 'Walid Cheddira', 'home', 11, 'F'))) as r;
select extensions.is((select count(*)::int from app_private.football_provider_mappings), (select maps from before2),
  '6.1 a second run adds no mapping');
select extensions.is((select r -> 'mapped' from call2)::text,
  jsonb_build_array(jsonb_build_object('sofascorePlayerId', 'S1', 'playerId', pg_temp.id('a1', 1)))::text,
  '6.2 and returns the existing one');
select extensions.is((select times_seen from app_private.sofascore_player_match_queue where sofascore_player_id = 'S4'), 2,
  '6.3 a queued player is counted again, not duplicated');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_queue where sofascore_player_id = 'S4'), 1,
  '6.4 one queue row per SofaScore player');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_log), 5,
  '6.5 one log row per automatic mapping, none added by the re-run');

-- 7 reviewed -------------------------------------------------------------------------------------------------
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S1')) ->> 'reviewed')::boolean, true,
  '7.1 an automatic exact-name mapping is reviewed for the Fantasy function');
select extensions.is(app_private.football_mapping_supporting_state(pg_temp.map_id('S1')) ->> 'reviewProvenance',
  'automatic_exact_name', '7.2 and says why');
select extensions.is(app_private.football_mapping_supporting_state(pg_temp.map_id('S7')) ->> 'reviewProvenance',
  'automatic_name_and_shirt', '7.3 the shirt rule says so too');
select extensions.alike((select source_version from app_private.football_provider_mappings where external_id = 'S1'),
  'sofascore-auto-map:exact-name:%', '7.4 the source_version names the automatic method');
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S10')) ->> 'reviewed')::boolean, false,
  '7.5 a legacy unreviewed mapping stays unreviewed');
select extensions.is(app_private.football_mapping_supporting_dependency('F1_REVIEWED_SOFASCORE_EVENTS',
    pg_temp.map_id('S1'), pg_temp.id('a1', 1)) ->> 'code',
  'supporting_mapping_unreviewed', '7.6 an automatic match is not accepted as supporting evidence for another provider');
update app_private.football_provider_mappings set source_version = 'sofascore-auto-map:exact-name:' || gen_random_uuid()::text
 where external_id = 'S2';
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S2')) ->> 'reviewed')::boolean, false,
  '7.7 a marker without a matching log row proves nothing');
update app_private.football_provider_mappings set internal_entity_id = pg_temp.id('a1', 14) where external_id = 'S3';
select extensions.is((app_private.football_mapping_supporting_state(pg_temp.map_id('S3')) ->> 'reviewed')::boolean, false,
  '7.8 a mapping moved to another player after the fact is no longer reviewed');

-- 8 staff ----------------------------------------------------------------------------------------------------
select pg_temp.act('svc');
select extensions.isnt(pg_temp.code('select api.admin_sofascore_player_match_queue()'), 'ok',
  '8.1 the service role cannot read the staff list');
select pg_temp.act('anon');
select extensions.isnt(pg_temp.code('select api.admin_resolve_sofascore_player_match(''S13'', ''' || pg_temp.id('a1', 15) || ''')'), 'ok',
  '8.2 a caller who is not staff cannot resolve');
select pg_temp.act('op');
select extensions.is((select jsonb_array_length(api.admin_sofascore_player_match_queue())), 7,
  '8.3 staff see the seven open entries');
select extensions.ok((select e -> 'candidates' -> 0 ->> 'playerId' is not null
    from jsonb_array_elements(api.admin_sofascore_player_match_queue()) e where e ->> 'sofascorePlayerId' = 'S12'),
  '8.4 with the candidates listed');
select extensions.is(pg_temp.code('select api.admin_resolve_sofascore_player_match(''S9'', ''' || pg_temp.id('a1', 9) || ''')'),
  'sofascore_mapping_conflict', '8.5 resolving onto a player that already carries another id is refused');
select extensions.is(pg_temp.code('select api.admin_resolve_sofascore_player_match(''NOPE'', ''' || pg_temp.id('a1', 12) || ''')'),
  'queue_entry_not_found', '8.6 unknown queue entry');
select extensions.is(api.admin_resolve_sofascore_player_match('S12', pg_temp.id('a1', 12)) ->> 'playerId',
  pg_temp.id('a1', 12)::text, '8.7 staff resolve S12 to the right player');
select extensions.is(pg_temp.mapped_to('S12'), pg_temp.id('a1', 12), '8.8 the mapping exists');
select extensions.is(app_private.football_mapping_supporting_state(pg_temp.map_id('S12')) ->> 'reviewProvenance',
  'staff_resolution', '8.9 and counts as reviewed, by staff resolution');
select extensions.is((select resolved_player_id from app_private.sofascore_player_match_queue where sofascore_player_id = 'S12'),
  pg_temp.id('a1', 12), '8.10 the queue entry is marked resolved');
select extensions.is((api.admin_resolve_sofascore_player_match('S12', pg_temp.id('a1', 12)) ->> 'alreadyResolved')::boolean, true,
  '8.11 resolving again to the same player is harmless');
select extensions.is(pg_temp.code('select api.admin_resolve_sofascore_player_match(''S12'', ''' || pg_temp.id('a1', 15) || ''')'),
  'queue_entry_already_resolved', '8.12 but not to a different one');
select extensions.is((select jsonb_array_length(api.admin_sofascore_player_match_queue())), 6,
  '8.13 the resolved entry leaves the list');
select pg_temp.act('svc');
select extensions.is((select jsonb_array_length(
  api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(pg_temp.pl('S12', 'Bilal Khannouss', 'home', null, 'M'))) -> 'mapped')),
  1, '8.14 the matcher now returns the staff-made mapping unchanged');

select * from extensions.finish();
rollback;
