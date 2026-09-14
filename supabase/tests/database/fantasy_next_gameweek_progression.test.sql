begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3) values
  ('f0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('f1000000-0000-4000-8000-000000000001', 'fantasy-test', 'Fantasy Test', 'FT', 'league',
  'f0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  '2089/90', '2089-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  1, 'Gameweek 1', 'active');

insert into app.teams (id, slug, name, short_name, code, country_id)
select ('f4' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'fantasy-club-' || i, 'Fantasy Club ' || i, 'FC' || i, 'F' || lpad(i::text, 2, '0'),
  'f0000000-0000-4000-8000-000000000001'
from generate_series(1, 16) i;

insert into app.players (id, slug, full_name, display_name, position)
select ('f5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'fantasy-player-' || i, 'Fantasy Player ' || i, 'Player ' || i,
  case when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 then 'defender'::app.football_position
    when i <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 17) i;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  'fantasy-test', 'Fantasy Test', true);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('f6300000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2089/90', 'active', '2089-08-01', '2090-06-30');
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status
) values ('f6400000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
  '2090-01-01T11:00:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z', 'open');

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id, position_id, price
)
select ('f7' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'f6300000-0000-4000-8000-000000000001',
  ('f5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('f4' || lpad((((i - 1) % 16) + 1)::text, 6, '0')
    || '-0000-4000-8000-000000000001')::uuid,
  (select id from app.fantasy_positions where code = case
    when i <= 2 then 'GK' when i <= 7 then 'DEF' when i <= 12 then 'MID' else 'FWD' end),
  6
from generate_series(1, 17) i;

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f8000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'fantasy-one@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"fantasy_one"}', statement_timestamp(), statement_timestamp()),
  ('f8000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'fantasy-two@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"fantasy_two"}', statement_timestamp(), statement_timestamp());

select set_config('test.fantasy_selection', (
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id', player.id,
    'slot', case when player_number in (1,3,4,5,6,8,9,10,11,13,14) then 'starter' else 'bench' end,
    'slot_order', case player_number
      when 1 then 1 when 3 then 2 when 4 then 3 when 5 then 4 when 6 then 5
      when 8 then 6 when 9 then 7 when 10 then 8 when 11 then 9 when 13 then 10 when 14 then 11
      when 2 then 1 when 7 then 2 when 12 then 3 when 15 then 4 end,
    'captain', player_number = 8, 'vice_captain', player_number = 13
  ) order by player_number)::text from (
    select id, row_number() over (order by id) as player_number from app.fantasy_players
    order by id limit 15
  ) player
), true);


set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.normal_team', api.create_fantasy_team(
 'f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
 'Normal Progression',current_setting('test.fantasy_selection')::jsonb,'fa000000-0000-4000-8000-000000000001')->>'id',true);
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('test.free_hit_team', api.create_fantasy_team(
 'f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
 'Free Hit Progression',current_setting('test.fantasy_selection')::jsonb,'fa000000-0000-4000-8000-000000000002')->>'id',true);
select api.activate_fantasy_chip(current_setting('test.free_hit_team')::uuid,'f6400000-0000-4000-8000-000000000001','free_hit',1,'fa000000-0000-4000-8000-000000000003');
select api.confirm_fantasy_transfers(current_setting('test.free_hit_team')::uuid,'f6400000-0000-4000-8000-000000000001',
 '[{"player_out_id":"f7000013-0000-4000-8000-000000000001","player_in_id":"f7000016-0000-4000-8000-000000000001"}]',
 2,'fa000000-0000-4000-8000-000000000004','free_hit');
select api.confirm_fantasy_transfers(current_setting('test.free_hit_team')::uuid,'f6400000-0000-4000-8000-000000000001',
 '[{"player_out_id":"f7000014-0000-4000-8000-000000000001","player_in_id":"f7000017-0000-4000-8000-000000000001"}]',
 3,'fa000000-0000-4000-8000-000000000005','free_hit');
reset role;
select extensions.is((select count(*)::integer from app.fantasy_free_hit_snapshot_players),15,'two Free Hit batches preserve only the original 15 members');
select extensions.is((select count(*)::integer from app_private.fantasy_free_hit_lineup_snapshots),1,'Free Hit captures the original selection exactly once');
select extensions.is((select count(*)::integer from app.fantasy_squad_memberships where fantasy_team_id=current_setting('test.free_hit_team')::uuid and sold_at is null and fantasy_player_id in ('f7000016-0000-4000-8000-000000000001','f7000017-0000-4000-8000-000000000001')),2,'both temporary transfers were actually confirmed');
-- Different temporary captain choices must not replace the original selection.
update app.fantasy_lineup_players set captain=false,vice_captain=false where lineup_id in(select id from app.fantasy_lineups where fantasy_team_id=current_setting('test.free_hit_team')::uuid);
update app.fantasy_lineup_players set captain=(fantasy_player_id='f7000003-0000-4000-8000-000000000001'),vice_captain=(fantasy_player_id='f7000004-0000-4000-8000-000000000001') where lineup_id in(select id from app.fantasy_lineups where fantasy_team_id=current_setting('test.free_hit_team')::uuid);
update app.fantasy_lineups set locked_at=statement_timestamp(),finalized_at=statement_timestamp();
update app.fantasy_gameweeks set status='finalized',scoring_input_version=1,points_state='final',finalized_at=statement_timestamp() where id='f6400000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select api.service_restore_free_hit('f6400000-0000-4000-8000-000000000001',100);
select extensions.is((select count(*)::integer from app.fantasy_squad_memberships where fantasy_team_id=current_setting('test.free_hit_team')::uuid and sold_at is null),15,'Free Hit restoration retains exactly 15 original members');
select extensions.is((select count(*)::integer from app.fantasy_squad_memberships where fantasy_team_id=current_setting('test.free_hit_team')::uuid and sold_at is null and fantasy_player_id in ('f7000016-0000-4000-8000-000000000001','f7000017-0000-4000-8000-000000000001')),0,'temporary purchases are not restored');

insert into app.rounds(id,season_id,round_number,name,status) values('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001',2,'Next round','planned');
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
values('f6400000-0000-4000-8000-000000000002','f6300000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002',2,'Next week',
 app_private.fantasy_calculate_deadline('f6100000-0000-4000-8000-000000000100','2090-01-10T12:00:00Z'),'2090-01-10T12:00:00Z','2090-01-12T12:00:00Z','scheduled');
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,provider_updated_at,source_sequence,source_version)
select ('fb000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002',
 ('f4'||lpad((i*2-1)::text,6,'0')||'-0000-4000-8000-000000000001')::uuid,('f4'||lpad((i*2)::text,6,'0')||'-0000-4000-8000-000000000001')::uuid,'2090-01-10T12:00:00Z','scheduled','2089-12-01T12:00:00Z',1,'progression-test-v1' from generate_series(1,8)i;
insert into app.fantasy_fixture_assignments(fantasy_season_id,fixture_id,gameweek_id,original_gameweek_id,original_kickoff_at,assigned_kickoff_at,source_version)
select 'f6300000-0000-4000-8000-000000000001',id,'f6400000-0000-4000-8000-000000000002','f6400000-0000-4000-8000-000000000002',kickoff_at,kickoff_at,1 from app.fixtures where season_id='f2000000-0000-4000-8000-000000000001';
select extensions.ok(not has_function_privilege('authenticated','api.service_prepare_next_fantasy_gameweek(uuid,uuid,bigint,integer)','execute'),'user cannot run progression');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='app_private.fantasy_gameweek_progressions'::regclass),'progression journal forces RLS');
select extensions.throws_ok($$select api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,100)$$,'PT409','fantasy_previous_postwork_incomplete','price/notification completion is required');
-- This boundary test seeds the trusted postwork proof; separate postwork tests
-- verify that only completed prices and deterministic events can create it.
insert into app_private.fantasy_gameweek_postwork(gameweek_id,calculation_version,price_source_version,price_player_ids,prices_completed_at,completed_at)
values('f6400000-0000-4000-8000-000000000001',1,2,array(select id from app.fantasy_players order by id),statement_timestamp(),statement_timestamp());
select set_config('test.original_capture',(select selection::text from app_private.fantasy_free_hit_lineup_snapshots),true);
update app_private.fantasy_free_hit_lineup_snapshots set selection=jsonb_set(selection,'{0,captain}','true');
select extensions.throws_ok($$select api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,100)$$,'PT409','fantasy_carried_selection_invalid','malformed captured captain selection blocks the entire batch');
select extensions.is((select count(*)::integer from app.fantasy_lineups where gameweek_id='f6400000-0000-4000-8000-000000000002'),0,'failed batch did not leave partial lineups');
update app_private.fantasy_free_hit_lineup_snapshots set selection=current_setting('test.original_capture')::jsonb;
-- Preserve a valid pre-existing next lineup even when its captain differs.
insert into app.fantasy_lineups(fantasy_team_id,gameweek_id,team_version) values(current_setting('test.normal_team')::uuid,'f6400000-0000-4000-8000-000000000002',1);
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,multiplier,snapshot_price)
select next.id,old.fantasy_player_id,old.slot,old.slot_order,old.fantasy_player_id='f7000003-0000-4000-8000-000000000001',old.fantasy_player_id='f7000004-0000-4000-8000-000000000001',1,old.snapshot_price
from app.fantasy_lineups next join app.fantasy_lineups prior on prior.fantasy_team_id=next.fantasy_team_id and prior.gameweek_id='f6400000-0000-4000-8000-000000000001' join app.fantasy_lineup_players old on old.lineup_id=prior.id
where next.gameweek_id='f6400000-0000-4000-8000-000000000002';
select extensions.is(api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,1)->>'hasMore','true','one-team batch leaves further preparation');
select extensions.is((select status::text from app.fantasy_gameweeks where sequence_number=2),'scheduled','next transfer window stays closed during partial preparation');
select extensions.is(api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,1)->>'status','open','last batch opens the next window');
select extensions.is((select count(*)::integer from app.fantasy_teams where current_gameweek_id='f6400000-0000-4000-8000-000000000002'),2,'both active teams advance to the next gameweek');
select extensions.is((select count(*)::integer from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id=lp.lineup_id where l.gameweek_id='f6400000-0000-4000-8000-000000000002'),30,'both complete 15-player next lineups exist');
select extensions.is((select lp.fantasy_player_id::text from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id=lp.lineup_id where l.gameweek_id='f6400000-0000-4000-8000-000000000002' and l.fantasy_team_id=current_setting('test.free_hit_team')::uuid and lp.captain),'f7000008-0000-4000-8000-000000000001','Free Hit carries the captured original captain');
select extensions.is((select lp.fantasy_player_id::text from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id=lp.lineup_id where l.gameweek_id='f6400000-0000-4000-8000-000000000002' and l.fantasy_team_id=current_setting('test.normal_team')::uuid and lp.captain),'f7000003-0000-4000-8000-000000000001','existing next captain choice is preserved');
select extensions.is(api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,100)->>'alreadyAdvanced','true','completed progression is idempotent');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001')->>'advancedToGameweekId','f6400000-0000-4000-8000-000000000002','runner can discover completed progression without replaying prices');
select * from extensions.finish();
rollback;
