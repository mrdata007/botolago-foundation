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
reset role;
-- GW1 played and finalized, with its postwork done.
update app.fantasy_lineups set locked_at=statement_timestamp(),finalized_at=statement_timestamp();
update app.fantasy_gameweeks set status='finalized',scoring_input_version=1,points_state='final',finalized_at=statement_timestamp() where id='f6400000-0000-4000-8000-000000000001';
-- GW2: its deadline passed and every match of the round was played.
insert into app.rounds(id,season_id,round_number,name,status) values('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001',2,'Missed round','active');
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
values('f6400000-0000-4000-8000-000000000002','f6300000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002',2,'Missed week',
 app_private.fantasy_calculate_deadline('f6100000-0000-4000-8000-000000000100','2026-01-10T12:00:00Z'),'2026-01-10T12:00:00Z','2026-01-12T12:00:00Z','scheduled');
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,provider_updated_at,source_sequence,source_version)
select ('fb000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002',
 ('f4'||lpad((i*2-1)::text,6,'0')||'-0000-4000-8000-000000000001')::uuid,('f4'||lpad((i*2)::text,6,'0')||'-0000-4000-8000-000000000001')::uuid,'2026-01-10T12:00:00Z','scheduled','2025-12-01T12:00:00Z',1,'missed-test-v1' from generate_series(1,8)i;
insert into app.fantasy_fixture_assignments(fantasy_season_id,fixture_id,gameweek_id,original_gameweek_id,original_kickoff_at,assigned_kickoff_at,source_version)
select 'f6300000-0000-4000-8000-000000000001',id,'f6400000-0000-4000-8000-000000000002','f6400000-0000-4000-8000-000000000002',kickoff_at,kickoff_at,1 from app.fixtures where season_id='f2000000-0000-4000-8000-000000000001';
update app.fixtures set status='finished',home_score=1,away_score=0 where round_id='f3000000-0000-4000-8000-000000000002' and id<>'fb000000-0000-4000-8000-000000000001';
-- One match is still live for now (finished further down).
update app.fixtures set status='live_first_half',home_score=0,away_score=0 where id='fb000000-0000-4000-8000-000000000001';

-- Owner only: no API role, not even the service role.
select extensions.ok(not has_function_privilege('authenticated','app_private.fantasy_open_missed_gameweek(uuid,uuid,bigint,text)','execute'),'a user cannot open a missed gameweek');
select extensions.ok(not has_function_privilege('service_role','app_private.fantasy_open_missed_gameweek(uuid,uuid,bigint,text)','execute'),'no schedule (service role) can open a missed gameweek');
select extensions.throws_ok($$select app_private.fantasy_open_missed_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,'short')$$,'22023','fantasy_open_missed_reason_required','the owner says why');
select extensions.throws_ok($$select app_private.fantasy_open_missed_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,'GW2 carries over (owner)')$$,'PT409','fantasy_previous_postwork_incomplete','the previous gameweek must be finalized with its postwork done');
insert into app_private.fantasy_gameweek_postwork(gameweek_id,calculation_version,price_source_version,price_player_ids,prices_completed_at,completed_at)
values('f6400000-0000-4000-8000-000000000001',1,2,array(select id from app.fantasy_players order by id),statement_timestamp(),statement_timestamp());
update app_private.fantasy_automation_settings set lifecycle_tick_enabled=true;
select extensions.throws_ok($$select app_private.fantasy_open_missed_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,'GW2 carries over (owner)')$$,'PT409','fantasy_tick_must_be_paused','one writer at a time: the Fantasy tick must be paused');
update app_private.fantasy_automation_settings set lifecycle_tick_enabled=false;
-- A deadline still ahead takes the normal opening, never this path.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update app.fantasy_gameweeks set ends_at=statement_timestamp()+interval '4 days',starts_at=statement_timestamp()+interval '2 days',deadline_at=statement_timestamp()+interval '1 day' where id='f6400000-0000-4000-8000-000000000002';
select extensions.throws_ok($$select app_private.fantasy_open_missed_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,'GW2 carries over (owner)')$$,'PT409','fantasy_gameweek_not_missed','a deadline still ahead is refused');
update app.fantasy_gameweeks set deadline_at=app_private.fantasy_calculate_deadline('f6100000-0000-4000-8000-000000000100','2026-01-10T12:00:00Z'),starts_at='2026-01-10T12:00:00Z',ends_at='2026-01-12T12:00:00Z' where id='f6400000-0000-4000-8000-000000000002';
-- The normal opening still refuses the missed gameweek.
select extensions.throws_ok($$select api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,100)$$,'PT409','fantasy_next_gameweek_not_openable','the normal opening refuses a passed deadline, as before');
-- A match neither finished nor yet to start is refused.
select extensions.throws_ok($$select app_private.fantasy_open_missed_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,'GW2 carries over (owner)')$$,'PT409','fantasy_next_fixture_unverified','a live match is refused');
update app.fixtures set status='finished',home_score=1,away_score=0 where id='fb000000-0000-4000-8000-000000000001';
select extensions.is((select count(*)::integer from app.fantasy_lineups where gameweek_id='f6400000-0000-4000-8000-000000000002'),0,'refusals leave nothing behind');

-- One team already has its own lineup for the gameweek (another captain): it is kept.
insert into app.fantasy_lineups(fantasy_team_id,gameweek_id,team_version) values(current_setting('test.normal_team')::uuid,'f6400000-0000-4000-8000-000000000002',1);
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,multiplier,snapshot_price)
select next.id,old.fantasy_player_id,old.slot,old.slot_order,old.fantasy_player_id='f7000003-0000-4000-8000-000000000001',old.fantasy_player_id='f7000004-0000-4000-8000-000000000001',1,old.snapshot_price
from app.fantasy_lineups next join app.fantasy_lineups prior on prior.fantasy_team_id=next.fantasy_team_id and prior.gameweek_id='f6400000-0000-4000-8000-000000000001' join app.fantasy_lineup_players old on old.lineup_id=prior.id
where next.gameweek_id='f6400000-0000-4000-8000-000000000002';

select set_config('test.opened',app_private.fantasy_open_missed_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,'GW2 carries over (owner)')::text,true);
select extensions.is(current_setting('test.opened')::jsonb->>'status','open','the missed gameweek opens');
select extensions.is(current_setting('test.opened')::jsonb->>'carriedLineups','1','the team without one gets its previous lineup');
select extensions.is(current_setting('test.opened')::jsonb->>'keptLineups','1','the team with its own lineup keeps it');
select extensions.is((select status::text from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000002'),'open','the gameweek is open');
select extensions.is((select count(*)::integer from app.fantasy_teams where current_gameweek_id='f6400000-0000-4000-8000-000000000002'),2,'both active teams move to the gameweek');
select extensions.is((select count(*)::integer from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id=lp.lineup_id where l.gameweek_id='f6400000-0000-4000-8000-000000000002'),30,'two complete 15-player lineups');
select extensions.is((select lp.fantasy_player_id::text from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id=lp.lineup_id where l.gameweek_id='f6400000-0000-4000-8000-000000000002' and l.fantasy_team_id=current_setting('test.free_hit_team')::uuid and lp.captain),
 (select lp.fantasy_player_id::text from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id=lp.lineup_id where l.gameweek_id='f6400000-0000-4000-8000-000000000001' and l.fantasy_team_id=current_setting('test.free_hit_team')::uuid and lp.captain),'the carried lineup keeps its previous captain');
select extensions.is((select lp.fantasy_player_id::text from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id=lp.lineup_id where l.gameweek_id='f6400000-0000-4000-8000-000000000002' and l.fantasy_team_id=current_setting('test.normal_team')::uuid and lp.captain),'f7000003-0000-4000-8000-000000000001','the kept lineup keeps its own captain');
select extensions.is((select count(*)::integer from app_private.admin_audit_events where action='fantasy_gameweek.open_missed' and target_entity_id='f6400000-0000-4000-8000-000000000002' and reason='GW2 carries over (owner)'),1,'the owner''s reason is recorded');
select extensions.is(api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,100)->>'alreadyAdvanced','true','the normal opening (the worker) sees it opened');
select extensions.is(app_private.fantasy_open_missed_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,'GW2 carries over (owner)')->>'alreadyOpened','true','a replay writes nothing');
select extensions.is((select count(*)::integer from app_private.admin_audit_events where action='fantasy_gameweek.open_missed'),1,'a replay records nothing');
-- Its deadline has passed, so the lifecycle locks every lineup on its next pass.
select api.service_advance_fantasy_lifecycle('f6400000-0000-4000-8000-000000000002',(select lock_version from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000002'),100);
select extensions.is((select count(*)::integer from app.fantasy_lineups where gameweek_id='f6400000-0000-4000-8000-000000000002' and locked_at is not null),2,'the lifecycle locks both lineups at once');
select * from extensions.finish();
rollback;
