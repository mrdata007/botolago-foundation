begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- Real table triggers in a disposable synthetic world. Verify both refused
-- corrections and harmless metadata against the complete scoring-document hash.

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
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

insert into app.player_fixture_performances(football_season_id,fixture_id,player_id,team_id,position,
 source_provider,source_version,started,appeared,minutes,goals,assists,clean_sheets,goals_conceded,
 saves,penalties_saved,penalties_missed,yellow_cards,red_cards,second_yellow_dismissals,own_goals,provider_observed_at)
values(pg_temp.id('c0',3),pg_temp.id('f0',1),pg_temp.id('a1',1),pg_temp.id('c1',1),'defender',
 'sportsmonks','sportsmonks-current-fixture:'||repeat('a',64),true,true,90,1,0,0,0,0,0,0,0,0,0,0,now());
insert into app_private.historical_performance_fixture_coverage(fixture_id,football_season_id,source_provider,
 source_version,lineup_rows_seen,valid_player_rows,excluded_incomplete_rows,starter_rows,team_count,
 detail_rows,invalid_detail_rows,performance_rows,reconciled,provider_observed_at,scoring_statistics_complete)
values(pg_temp.id('f0',1),pg_temp.id('c0',3),'sportsmonks','sportsmonks-current-fixture:'||repeat('a',64),
 22,22,0,22,2,264,0,22,true,now(),true);

select extensions.lives_ok(format('update app.fixtures set home_score=2 where id=%L',pg_temp.id('f0',1)),
 'ordinary fixture correction succeeds before finalization');
select extensions.lives_ok(format('update app.player_fixture_performances set goals=2 where fixture_id=%L',pg_temp.id('f0',1)),
 'ordinary performance correction succeeds before finalization');
update app.fantasy_gameweeks set status='finalizing' where id=pg_temp.id('c0',6);
select pg_temp.put('digest',pg_temp.doc_digest());
insert into app_private.fantasy_scoring_snapshots(gameweek_id,calculation_version,input_digest,payload,sealed_at)
values(pg_temp.id('c0',6),1,pg_temp.get('digest'),app_private.fantasy_scoring_input_document(pg_temp.id('c0',6)),now());
select extensions.lives_ok(format('select app_private.fantasy_assert_scoring_snapshot(%L,1,%L)',pg_temp.id('c0',6),pg_temp.get('digest')),
 'the actual snapshot assertion accepts the baseline sealed document');

select extensions.throws_ok(format('update app.fixtures set home_score=3 where id=%L',pg_temp.id('f0',1)),
 'PT409','fantasy_scoring_inputs_frozen','score correction is refused while finalizing');
select extensions.throws_ok(format('update app.fixtures set source_sequence=11 where id=%L',pg_temp.id('f0',1)),
 'PT409','fantasy_scoring_inputs_frozen','source sequence cannot invalidate the seal');
select extensions.throws_ok(format('update app.fixtures set kickoff_at=kickoff_at+interval ''1 minute'' where id=%L',pg_temp.id('f0',1)),
 'PT409','fantasy_scoring_inputs_frozen','kickoff cannot change adaptive membership selection');
select extensions.throws_ok(format('delete from app.fixtures where id=%L',pg_temp.id('f0',1)),
 'PT409','fantasy_scoring_inputs_frozen','fixture deletion is refused before any cascade');
select extensions.lives_ok(format('update app.fixtures set home_score=home_score where id=%L',pg_temp.id('f0',1)),
 'no-op fixture replay is accepted');
select extensions.lives_ok(format('update app.fixtures set provider_updated_at=now() where id=%L',pg_temp.id('f0',1)),
 'fixture observation metadata is writable');

select extensions.throws_ok(format('update app.player_fixture_performances set goals=3 where fixture_id=%L',pg_temp.id('f0',1)),
 'PT409','fantasy_scoring_inputs_frozen','performance correction cannot change a sealed input');
select extensions.throws_ok(format('update app.player_fixture_performances set active=false where fixture_id=%L',pg_temp.id('f0',1)),
 'PT409','fantasy_scoring_inputs_frozen','an import cannot deactivate an active sealed row');
select extensions.throws_ok(format('delete from app.player_fixture_performances where fixture_id=%L',pg_temp.id('f0',1)),
 'PT409','fantasy_scoring_inputs_frozen','an active row cannot be removed');
select extensions.throws_ok(format($q$insert into app.player_fixture_performances(
 football_season_id,fixture_id,player_id,team_id,position,source_provider,source_version,started,appeared,
 minutes,goals,assists,clean_sheets,goals_conceded,saves,penalties_saved,penalties_missed,yellow_cards,
 red_cards,second_yellow_dismissals,own_goals,provider_observed_at)
 select football_season_id,fixture_id,%L,team_id,'goalkeeper',source_provider,source_version,false,false,
 0,0,0,0,0,0,0,0,0,0,0,0,provider_observed_at from app.player_fixture_performances where fixture_id=%L$q$,
 pg_temp.id('a1',6),pg_temp.id('f0',1)), 'PT409','fantasy_scoring_inputs_frozen','new active performance is refused');
select extensions.lives_ok(format('update app.player_fixture_performances set provider_observed_at=now() where fixture_id=%L',pg_temp.id('f0',1)),
 'performance observation metadata does not change the document');
select extensions.throws_ok(format('update app_private.historical_performance_fixture_coverage set reconciled=false where fixture_id=%L',pg_temp.id('f0',1)),
 'PT409','fantasy_scoring_inputs_frozen','coverage cannot be downgraded');
select extensions.throws_ok(format('delete from app_private.historical_performance_fixture_coverage where fixture_id=%L',pg_temp.id('f0',1)),
 'PT409','fantasy_scoring_inputs_frozen','coverage cannot be removed');
select extensions.lives_ok(format('update app_private.historical_performance_fixture_coverage set provider_observed_at=now() where fixture_id=%L',pg_temp.id('f0',1)),
 'coverage heartbeat metadata is writable');
select extensions.is(pg_temp.doc_digest(),pg_temp.get('digest'),'all refused and permitted operations preserve the full document digest');
select extensions.lives_ok(format('select app_private.fantasy_assert_scoring_snapshot(%L,1,%L)',pg_temp.id('c0',6),pg_temp.get('digest')),
 'the actual sealed snapshot still passes after all guarded and metadata writes');
select extensions.is((select home_score from app.fixtures where id=pg_temp.id('f0',1)),2,
 'refused fixture correction rolls back');
select extensions.is((select goals from app.player_fixture_performances where fixture_id=pg_temp.id('f0',1)),2,
 'refused performance correction rolls back');
select extensions.ok((select reconciled from app_private.historical_performance_fixture_coverage where fixture_id=pg_temp.id('f0',1)),
 'refused coverage change rolls back');

-- A different fixture is free to refresh while this gameweek finalizes.
insert into app.fixtures(id,competition_id,season_id,home_team_id,away_team_id,kickoff_at,status,provider_updated_at)
values(pg_temp.id('f0',2),pg_temp.id('c0',2),pg_temp.id('c0',3),pg_temp.id('c1',1),pg_temp.id('c1',2),now()+interval '7 days','scheduled',now());
select extensions.lives_ok(format('update app.fixtures set kickoff_at=kickoff_at+interval ''1 minute'' where id=%L',pg_temp.id('f0',2)),
 'unassigned fixture refresh remains available');
-- Finalization ends: ordinary corrections can be retried without any bypass.
update app.fantasy_gameweeks set status='provisional' where id=pg_temp.id('c0',6);
select extensions.lives_ok(format('update app.fixtures set home_score=3 where id=%L',pg_temp.id('f0',1)),
 'fixture correction is retryable after the finalizing window');
select extensions.lives_ok(format('update app.player_fixture_performances set goals=3 where fixture_id=%L',pg_temp.id('f0',1)),
 'performance correction is retryable after the finalizing window');
select extensions.ok(pg_temp.doc_digest()<>pg_temp.get('digest'),'control corrections really change the input document');
select extensions.ok(not has_function_privilege('anon','app_private.fantasy_assert_fixture_inputs_writable(uuid[])','execute')
 and not has_function_privilege('authenticated','app_private.fantasy_assert_fixture_inputs_writable(uuid[])','execute')
 and not has_function_privilege('service_role','app_private.fantasy_assert_fixture_inputs_writable(uuid[])','execute'),
 'the lock helper exposes no privileged API');
-- Review regression: the observation RPC already takes gameweeks FOR UPDATE
-- before the fixture and explicitly rejects finalizing/finalized/corrected.
-- Exercise that actual entry point on an adaptive document, not just a source pin.
insert into app_private.fantasy_adaptive_policy(season_id,from_gameweek,ruleset_id)
values(pg_temp.id('c0',5),1,'f6200000-0000-4000-8000-000000000200');
insert into app_private.fantasy_fixture_observations(fixture_id,source,digest,payload,full_ready,simple_ready)
values(pg_temp.id('f0',1),'sportsmonks',repeat('b',64),'{"players":[],"references":["guard regression"]}',false,false);
update app.fantasy_gameweeks set status='finalizing' where id=pg_temp.id('c0',6);
select pg_temp.put('adaptive_digest',pg_temp.doc_digest());
select pg_temp.put('adaptive_version',(select scoring_input_version::text from app.fantasy_gameweeks where id=pg_temp.id('c0',6)));
insert into app_private.fantasy_scoring_snapshots(gameweek_id,calculation_version,input_digest,payload,sealed_at)
values(pg_temp.id('c0',6),pg_temp.get('adaptive_version')::bigint,pg_temp.get('adaptive_digest'),
 app_private.fantasy_scoring_input_document(pg_temp.id('c0',6)),now());
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select extensions.throws_ok(format($q$select api.service_record_fantasy_observation(%L,
 jsonb_build_object('players',(select jsonb_agg('{}'::jsonb) from generate_series(1,18)),
 'references',jsonb_build_array('guard regression')),'sportsmonks')$q$,pg_temp.id('f0',1)),
 'PT409','adaptive_reviewed_correction_required','existing observation RPC refuses a finalizing adaptive gameweek');
select extensions.is((select count(*)::int from app_private.fantasy_fixture_observations where fixture_id=pg_temp.id('f0',1)),1,
 'the refused recorder inserted no new adaptive observation');
select extensions.is(pg_temp.doc_digest(),pg_temp.get('adaptive_digest'),
 'the real recorder refusal preserves the complete adaptive input digest');
select extensions.lives_ok(format('select app_private.fantasy_assert_scoring_snapshot(%L,%s,%L)',
 pg_temp.id('c0',6),pg_temp.get('adaptive_version'),pg_temp.get('adaptive_digest')),
 'the adaptive snapshot remains valid after the refused recorder call');

select * from extensions.finish();
rollback;
