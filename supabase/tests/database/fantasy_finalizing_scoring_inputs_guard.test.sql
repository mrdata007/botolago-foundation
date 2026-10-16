begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- A finalizing gameweek's scoring inputs cannot change underneath it (20261016110000, audit finding SEC-01).
-- Real functions and triggers, synthetic world (the matcher world of sofascore_player_auto_map.test.sql
-- plus a Fantasy gameweek with one match, a pool of two, and two lineups):
--   1 nothing is finalizing: every write passes, the matcher creates a player
--   2 a gameweek of the season is finalizing: pool, membership and lineup writes that feed the scoring
--     input document are refused with fantasy_scoring_inputs_frozen; the writes that do not feed it pass
--     and leave the document's digest where it was; the matcher holds a new player and carries on
--   3 the gameweek leaves finalizing: the same matcher call creates him
--   4 the existing guards are unaffected

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.act_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '{"role":"service_role"}', true); end $$;
create function pg_temp.pl(p_sid text, p_name text, p_side text default 'home', p_shirt integer default null,
  p_pos text default null, p_appeared boolean default true) returns jsonb language sql as $$
  select jsonb_build_object('sofascorePlayerId', p_sid, 'side', p_side, 'name', p_name, 'shortName', null,
    'shirtNumber', p_shirt, 'position', p_pos, 'appeared', p_appeared) $$;
create function pg_temp.mapped_to(p_sid text) returns uuid language sql as $$
  select internal_entity_id from app_private.football_provider_mappings
   where provider_name = 'sofascore' and entity_type = 'player' and external_id = p_sid $$;
create function pg_temp.reason(p_sid text) returns text language sql as $$
  select reason from app_private.sofascore_player_match_queue where sofascore_player_id = p_sid $$;
-- The sha256 of the scoring input document of the gameweek, as fantasy_assert_scoring_snapshot compares it.
create function pg_temp.doc_digest() returns text language sql as $$
  select encode(extensions.digest(app_private.fantasy_scoring_input_document(pg_temp.id('c0', 6))::text, 'sha256'), 'hex') $$;
create temporary table stash (k text primary key, v text);
create function pg_temp.put(p_key text, p_value text) returns void language sql as
  $$ insert into stash values (p_key, p_value) on conflict (k) do update set v = excluded.v $$;
create function pg_temp.get(p_key text) returns text language sql as $$ select v from stash where k = p_key $$;

-- World: two clubs in the current season, one finished match between them, the season's Fantasy season.
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'fin-guard-test', 'Finalizing Guard Test', 'FG', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id('c0', 7), pg_temp.id('c0', 3), 1, 'Round 1', 'completed');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'fg-club-' || i, 'Fg Club ' || i, 'FC' || i, 'FC' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 2) i;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, finalized_at)
values (pg_temp.id('f0', 1), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 1),
  pg_temp.id('c1', 2), '2026-08-10 12:00Z', 'finished', 1, 0, '2026-08-10 14:00Z', 10, '2026-08-10 14:00Z');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id('c0', 4), pg_temp.id('c0', 2), 'fin-guard-test-fantasy', 'Finalizing Guard Test Fantasy', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.id('c0', 5), pg_temp.id('c0', 4), pg_temp.id('c0', 3), 'f6100000-0000-4000-8000-000000000100',
  '2026/2027', 'active', '2026-08-01', '2027-06-30');
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at,
  ends_at, status, scoring_input_version)
values (pg_temp.id('c0', 6), pg_temp.id('c0', 5), pg_temp.id('c0', 7), 1, 'GW1', '2026-08-10 10:30Z',
  '2026-08-10 12:00Z', '2026-08-12 12:00Z', 'provisional', 1);
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, frozen_at, source_version)
select pg_temp.id('c0', 5), f.id, pg_temp.id('c0', 6), pg_temp.id('c0', 6), f.kickoff_at, f.kickoff_at, '2026-08-10 10:30Z', 1
from app.fixtures f where f.id = pg_temp.id('f0', 1);

-- i, club, name, position, shirt. Players 1 and 6 are in the Fantasy pool; 2 and 3 are not.
create temporary table roster (i integer primary key, club integer, full_name text, pos text, shirt integer);
insert into roster values
  (1, 1, 'Achraf Hakimi', 'defender', 2),
  (2, 1, 'Youssef En-Nesyri', 'forward', 19),
  (3, 2, 'Zakaria Aboukhlal', 'forward', 7),
  (6, 1, 'Yassine Bounou', 'goalkeeper', 1);
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id('a1', i), 'fg-player-' || i, full_name, full_name, pos::app.football_position from roster;
insert into app.team_memberships (player_id, team_id, season_id, valid_from, shirt_number)
select pg_temp.id('a1', i), pg_temp.id('c1', club), pg_temp.id('c0', 3), '2026-08-01', shirt from roster;
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
values
  (pg_temp.id('d1', 1), pg_temp.id('c0', 5), pg_temp.id('a1', 1), pg_temp.id('c1', 1),
    (select id from app.fantasy_positions where code = 'DEF'), 6.0),
  (pg_temp.id('d1', 6), pg_temp.id('c0', 5), pg_temp.id('a1', 6), pg_temp.id('c1', 1),
    (select id from app.fantasy_positions where code = 'GK'), 6.0);

-- Two managers, each with a locked lineup in the gameweek.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id('e1', i), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'fg-manager-' || i || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'fg_manager_' || i), statement_timestamp(), statement_timestamp()
from generate_series(1, 2) i;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers)
select pg_temp.id('e2', i), pg_temp.id('e1', i), pg_temp.id('c0', 5), pg_temp.id('c0', 6), 'Fg Team ' || i, 10, 90, 1
from generate_series(1, 2) i;
insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
select pg_temp.id('e3', i), pg_temp.id('e2', i), pg_temp.id('c0', 6), 1, '2026-08-10 10:30Z'
from generate_series(1, 2) i;

create temporary table before1 as select
  (select count(*)::int from app.players) as players,
  (select count(*)::int from app.team_memberships) as memberships,
  (select count(*)::int from app.fantasy_players) as pool;

-- 1 nothing is finalizing -------------------------------------------------------------------------------------
select extensions.is((select status::text from app.fantasy_gameweeks where id = pg_temp.id('c0', 6)), 'provisional',
  '1.0 the gameweek is provisional');
select extensions.lives_ok(format($$insert into app.players (id, slug, full_name, display_name, position)
  values (%L, 'fg-player-40', 'Pool Newcomer', 'Pool Newcomer', 'midfielder')$$, pg_temp.id('a1', 40)),
  '1.1 a new player exists');
select extensions.lives_ok(format($$insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
  values (%L, %L, %L, %L, (select id from app.fantasy_positions where code = 'MID'), 6.0)$$,
  pg_temp.id('d1', 40), pg_temp.id('c0', 5), pg_temp.id('a1', 40), pg_temp.id('c1', 2)),
  '1.2 a pool entry can be added while no gameweek is finalizing');
select extensions.lives_ok(format($$update app.fantasy_players set football_team_id = %L where id = %L$$,
  pg_temp.id('c1', 1), pg_temp.id('d1', 40)), '1.3 and his club changed');
select extensions.lives_ok(format($$delete from app.fantasy_players where id = %L$$, pg_temp.id('d1', 40)),
  '1.4 and the entry removed');
select extensions.lives_ok(format($$insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
  values (%L, %L, %L, '2026-09-01', false)$$, pg_temp.id('a1', 1), pg_temp.id('c1', 2), pg_temp.id('c0', 3)),
  '1.5 a pool player''s membership can be added');
select extensions.lives_ok(format($$update app.team_memberships set team_id = %L where player_id = %L and valid_from = '2026-09-01'$$,
  pg_temp.id('c1', 1), pg_temp.id('a1', 1)), '1.6 changed');
select extensions.lives_ok(format($$delete from app.team_memberships where player_id = %L and valid_from = '2026-09-01'$$,
  pg_temp.id('a1', 1)), '1.7 and deleted');
select extensions.lives_ok(format($$delete from app.fantasy_lineups where id = %L$$, pg_temp.id('e3', 2)),
  '1.8 a lineup can be deleted (as account erasure does)');
delete from app.players where id = pg_temp.id('a1', 40);

select pg_temp.act_service();
create temporary table call1 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(
  pg_temp.pl('N1', 'Newcomer One', 'home', 31, 'M'))) as r;
select extensions.is((select r -> 'created' from call1)::text, '1', '1.9 the matcher creates a player nobody had');
select extensions.is((select count(*)::int from app.fantasy_players), (select pool from before1) + 1,
  '1.10 with his pool entry');
select extensions.is((select count(*)::int from app.fantasy_lineups where gameweek_id = pg_temp.id('c0', 6)), 1,
  '1.11 (one lineup is left for the checks below)');

-- 2 a gameweek of the season is finalizing ---------------------------------------------------------------------
update app.fantasy_gameweeks set status = 'finalizing' where id = pg_temp.id('c0', 6);
select pg_temp.put('digest', pg_temp.doc_digest());
create temporary table before2 as select
  (select count(*)::int from app.players) as players,
  (select count(*)::int from app.team_memberships) as memberships,
  (select count(*)::int from app.fantasy_players) as pool,
  (select count(*)::int from app.fantasy_lineups) as lineups;

-- 2a the pool
select extensions.throws_ok(format($$insert into app.fantasy_players (fantasy_season_id, football_player_id, football_team_id, position_id, price)
  values (%L, %L, %L, (select id from app.fantasy_positions where code = 'FWD'), 6.0)$$,
  pg_temp.id('c0', 5), pg_temp.id('a1', 2), pg_temp.id('c1', 1)),
  'PT409', 'fantasy_scoring_inputs_frozen', '2.1 a pool entry cannot be added');
select extensions.throws_ok(format($$delete from app.fantasy_players where id = %L$$, pg_temp.id('d1', 6)),
  'PT409', 'fantasy_scoring_inputs_frozen', '2.2 or removed');
select extensions.throws_ok(format($$update app.fantasy_players set football_team_id = %L where id = %L$$,
  pg_temp.id('c1', 2), pg_temp.id('d1', 6)),
  'PT409', 'fantasy_scoring_inputs_frozen', '2.3 or moved to another club');
select extensions.throws_ok(format($$update app.fantasy_players set football_player_id = %L where id = %L$$,
  pg_temp.id('a1', 2), pg_temp.id('d1', 6)),
  'PT409', 'fantasy_scoring_inputs_frozen', '2.4 or given to another player');
select extensions.throws_ok(format($$update app.fantasy_players set position_id = (select id from app.fantasy_positions where code = 'FWD')
  where id = %L$$, pg_temp.id('d1', 6)),
  'PT409', 'fantasy_gameweek_locked', '2.5 a position change still gets the existing guard''s answer (it fires first)');

-- 2b writes that do not feed the document pass
select extensions.lives_ok(format($$update app.fantasy_players set price = 6.3 where id = %L$$, pg_temp.id('d1', 6)),
  '2.6 a price change passes');
select extensions.lives_ok(format($$update app.fantasy_players set eligible = false, active = false where id = %L$$, pg_temp.id('d1', 6)),
  '2.7 so do eligibility and the active flag');
select extensions.lives_ok(format($$update app.fantasy_players set football_team_id = football_team_id, position_id = position_id where id = %L$$,
  pg_temp.id('d1', 6)), '2.8 and an update that leaves the watched columns as they are');
select extensions.lives_ok(format($$update app.players set display_name = 'Yassine B.' where id = %L$$, pg_temp.id('a1', 6)),
  '2.9 a player''s name changes');
-- Player 6, not player 1: the matcher below must still find player 1 by his shirt (2).
select extensions.lives_ok(format($$update app.team_memberships set shirt_number = 22 where player_id = %L$$, pg_temp.id('a1', 6)),
  '2.10 a pool player''s shirt number changes');
select extensions.lives_ok(format($$update app.team_memberships set active = false where player_id = %L$$, pg_temp.id('a1', 1)),
  '2.11 and his active flag');
select extensions.lives_ok(format($$update app.team_memberships set active = true where player_id = %L$$, pg_temp.id('a1', 1)),
  '2.12 (back)');
select extensions.lives_ok(format($$update app.team_memberships set team_id = %L where player_id = %L$$,
  pg_temp.id('c1', 1), pg_temp.id('a1', 3)),
  '2.13 the membership of a player outside the pool can change club');
select extensions.lives_ok(format($$insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
  values (%L, %L, %L, '2026-09-01', false)$$, pg_temp.id('a1', 2), pg_temp.id('c1', 2), pg_temp.id('c0', 3)),
  '2.14 and a player outside the pool can get a second membership');
select extensions.lives_ok(format($$delete from app.team_memberships where player_id = %L and valid_from = '2026-09-01'$$,
  pg_temp.id('a1', 2)), '2.15 and lose it');
select extensions.is(pg_temp.doc_digest(), pg_temp.get('digest'),
  '2.16 none of these writes changed the scoring input document (the seal still holds)');

-- 2c the memberships of pool players
select extensions.throws_ok(format($$update app.team_memberships set team_id = %L where player_id = %L$$,
  pg_temp.id('c1', 2), pg_temp.id('a1', 6)),
  'PT409', 'fantasy_scoring_inputs_frozen', '2.17 a pool player''s membership cannot change club');
select extensions.throws_ok(format($$update app.team_memberships set valid_to = '2026-12-31' where player_id = %L$$, pg_temp.id('a1', 6)),
  'PT409', 'fantasy_scoring_inputs_frozen', '2.18 or its dates');
select extensions.throws_ok(format($$insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
  values (%L, %L, %L, '2026-09-01', false)$$, pg_temp.id('a1', 6), pg_temp.id('c1', 2), pg_temp.id('c0', 3)),
  'PT409', 'fantasy_scoring_inputs_frozen', '2.19 or get a second one');
select extensions.throws_ok(format($$delete from app.team_memberships where player_id = %L$$, pg_temp.id('a1', 6)),
  'PT409', 'fantasy_scoring_inputs_frozen', '2.20 or be deleted');

-- 2d the lineups
select extensions.throws_ok(format($$delete from app.fantasy_lineups where id = %L$$, pg_temp.id('e3', 1)),
  'PT409', 'fantasy_scoring_inputs_frozen', '2.21 a lineup of the gameweek cannot be deleted (account erasure waits)');

-- 2e the matcher holds the new player and carries on
select pg_temp.act_service();
create temporary table call2 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(
  pg_temp.pl('N2', 'Newcomer Two', 'home', 32, 'M'),                       -- nobody in the catalog: would be created
  pg_temp.pl('S1', 'Achraf H.', 'home', 2, 'D'),                           -- one candidate: linked, whatever the gameweek
  pg_temp.pl('N3', 'Newcomer Three', 'away', 33, 'F'))) as r;              -- also created, on the other side
select extensions.is((select r -> 'created' from call2)::text, '0', '2.22 nobody is created');
select extensions.is((select r -> 'createFailed' from call2)::text, '2', '2.23 both refusals are counted, not raised');
select extensions.is((select jsonb_array_length(r -> 'mapped') from call2), 1,
  '2.24 the player with one candidate is still linked in the same call');
select extensions.is(pg_temp.mapped_to('S1'), pg_temp.id('a1', 1), '2.25 to the right player');
select extensions.is(pg_temp.reason('N2'), 'no_candidate', '2.26 each held player stays on the list, to be tried again');
select extensions.is(pg_temp.reason('N3'), 'no_candidate', '2.27 (both)');
select extensions.is((select count(*)::int from app.players), (select players from before2), '2.28 no player is left behind');
select extensions.is((select count(*)::int from app.team_memberships), (select memberships from before2) , '2.29 no membership');
select extensions.is((select count(*)::int from app.fantasy_players), (select pool from before2), '2.30 no pool entry');
select extensions.is(pg_temp.doc_digest(), pg_temp.get('digest'), '2.31 and the scoring input document is as sealed');

-- 3 the gameweek leaves finalizing --------------------------------------------------------------------------
update app.fantasy_gameweeks set status = 'provisional' where id = pg_temp.id('c0', 6);
select pg_temp.act_service();
create temporary table call3 as
select api.service_sofascore_auto_map_players(pg_temp.id('f0', 1), jsonb_build_array(
  pg_temp.pl('N2', 'Newcomer Two', 'home', 32, 'M'),
  pg_temp.pl('N3', 'Newcomer Three', 'away', 33, 'F'))) as r;
select extensions.is((select r -> 'created' from call3)::text, '2', '3.1 the next call creates both');
select extensions.is((select r -> 'createFailed' from call3)::text, '0', '3.2 none held');
select extensions.is((select count(*)::int from app.fantasy_players), (select pool from before2) + 2, '3.3 with their pool entries');
select extensions.isnt(pg_temp.doc_digest(), pg_temp.get('digest'),
  '3.4 which is what changes the document: the reason the guard exists');
select extensions.lives_ok(format($$delete from app.fantasy_lineups where id = %L$$, pg_temp.id('e3', 1)),
  '3.5 and lineups can be deleted again');

-- 4 the existing guards are unaffected ----------------------------------------------------------------------
select extensions.ok(
  (select count(*) = 3 from pg_trigger t where t.tgrelid = 'app.fantasy_players'::regclass and t.tgenabled = 'O'
     and t.tgname in ('fantasy_guard_unfinished_price_catalog', 'fantasy_guard_unfinished_close_price_catalog',
                      'fantasy_players_enforce_rules')),
  '4.1 the two price-processing guards and the rule trigger are still on the pool, enabled');
select extensions.ok(
  (select count(*) = 1 from pg_trigger t
    where t.tgrelid = 'app.fantasy_players'::regclass and t.tgenabled = 'O'
      and t.tgname = 'fantasy_players_guard_finalizing_inputs'),
  '4.2 the new guard is one more trigger beside them');
select extensions.ok(
  ('fantasy_players_enforce_rules' collate "C") < ('fantasy_players_guard_finalizing_inputs' collate "C")
  and ('fantasy_guard_unfinished_price_catalog' collate "C") < ('fantasy_players_guard_finalizing_inputs' collate "C")
  and ('fantasy_guard_unfinished_close_price_catalog' collate "C") < ('fantasy_players_guard_finalizing_inputs' collate "C"),
  '4.3 and sorts after them (triggers fire in name order), so each existing guard answers first where it applies');
select extensions.ok(
  (select count(*) = 1 from pg_trigger t where t.tgrelid = 'app.team_memberships'::regclass and t.tgenabled = 'O'
     and t.tgname = 'team_memberships_guard_finalizing_inputs')
  and (select count(*) = 1 from pg_trigger t where t.tgrelid = 'app.fantasy_lineups'::regclass and t.tgenabled = 'O'
     and t.tgname = 'fantasy_lineups_guard_finalizing_inputs'),
  '4.4 the membership and lineup guards exist');
select extensions.ok(
  (select bool_and(p.prosecdef and p.proconfig = array['search_path=""'] and not has_function_privilege('public', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('service_role', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname in ('fantasy_guard_finalizing_player_catalog',
      'fantasy_guard_finalizing_squad_membership', 'fantasy_guard_finalizing_lineups')),
  '4.5 the three guard functions are security definer with an empty search path and callable by no API role');
select extensions.ok(
  (select bool_and(p.prosrc ~* 'for key share' and p.prosrc ~* 'status in \(''open'', ''locked'', ''live'', ''provisional'', ''finalizing''\)')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname in ('fantasy_guard_finalizing_player_catalog',
      'fantasy_guard_finalizing_squad_membership', 'fantasy_guard_finalizing_lineups')),
  '4.6 each guard takes FOR KEY SHARE on the season''s current gameweek row before it reads the status (the lock the finalization''s FOR UPDATE conflicts with)');
select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname in ('fantasy_guard_finalizing_player_catalog',
      'fantasy_guard_finalizing_squad_membership', 'fantasy_guard_finalizing_lineups')), 3,
  '4.7 and there are exactly three');

select * from extensions.finish();
rollback;
