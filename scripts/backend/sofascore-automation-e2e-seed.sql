-- ISOLATED LOCAL E2E ONLY. The harness refuses non-loopback DB connections.
-- Synthetic clubs/players and actual reviewed-mapping approval functions.
begin;
select set_config('app.environment','test',true);
create function pg_temp.id(p_prefix text,n integer) returns uuid language sql immutable as $$
 select (p_prefix||'000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.rid(n integer) returns uuid language sql immutable as $$
  select ('cb000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into app.countries(id,iso_alpha2,iso_alpha3) values(pg_temp.rid(1),'MA','MAR');
insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
values(pg_temp.rid(2),'rating-points-test','Rating Points Test','RPT','league',pg_temp.rid(1));
insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
values(pg_temp.rid(3),pg_temp.rid(2),'2026/2027','2026-08-01','2027-06-30','active',true);
insert into app.rounds(id,season_id,round_number,name,status)
select pg_temp.rid(10+n),pg_temp.rid(3),n,'Round '||n,'completed' from generate_series(4,6) n;
insert into app.teams(id,slug,name,short_name,code,country_id)
select pg_temp.rid(100+i),'rating-club-'||i,'Rating Club '||i,'RC'||i,'RC'||i,pg_temp.rid(1) from generate_series(1,4) i;
-- 44 players: fixture 1 (GW4) is players 1-22 of clubs 101/102, fixture 2 (GW5) players 23-44
-- of clubs 103/104. Player 45 is a forward of club 104 who does not play in fixture 2.
insert into app.players(id,slug,full_name,display_name,position)
select pg_temp.rid(1000+i),'rating-player-'||i,'Rating Player '||i,'RP'||i,
  case when i=45 then 'forward'::app.football_position
    when (i-1)%11=0 then 'goalkeeper'::app.football_position
    when (i-1)%11 between 1 and 4 then 'defender'::app.football_position
    when (i-1)%11 between 5 and 8 then 'midfielder'::app.football_position else 'forward'::app.football_position end
from generate_series(1,45) i;
insert into app.fantasy_competitions(id,football_competition_id,slug,name,active)
values(pg_temp.rid(4),pg_temp.rid(2),'rating-points-test','Rating Points Test',true);
insert into app.fantasy_seasons(id,fantasy_competition_id,football_season_id,ruleset_id,name,status,starts_at,ends_at)
values(pg_temp.rid(5),pg_temp.rid(4),pg_temp.rid(3),'f6100000-0000-4000-8000-000000000100','2026/2027','active','2026-08-01','2027-06-30');
-- GW4 closed on provisional points (so GW5 may be the current gameweek), GW5 open, GW6 scheduled.
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status,closed_at,closed_calculation_version)
values (pg_temp.rid(24),pg_temp.rid(5),pg_temp.rid(14),4,'GW4','2026-08-10 10:30Z','2026-08-10 12:00Z','2026-08-12 12:00Z','provisional','2026-08-12 12:00Z',1),
  (pg_temp.rid(25),pg_temp.rid(5),pg_temp.rid(15),5,'GW5','2026-08-17 10:30Z','2026-08-17 12:00Z','2026-08-19 12:00Z','open',null,null),
  (pg_temp.rid(26),pg_temp.rid(5),pg_temp.rid(16),6,'GW6','2026-08-24 10:30Z','2026-08-24 12:00Z','2026-08-26 12:00Z','scheduled',null,null);
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,home_score,away_score,provider_updated_at,source_sequence,finalized_at)
values (pg_temp.rid(3001),pg_temp.rid(2),pg_temp.rid(3),pg_temp.rid(14),pg_temp.rid(101),pg_temp.rid(102),'2026-08-10 12:00Z','finished',0,0,'2026-08-10 14:00Z',10,'2026-08-10 14:00Z'),
  (pg_temp.rid(3002),pg_temp.rid(2),pg_temp.rid(3),pg_temp.rid(15),pg_temp.rid(103),pg_temp.rid(104),'2026-08-17 12:00Z','finished',0,0,'2026-08-17 14:00Z',10,'2026-08-17 14:00Z');
insert into app.fantasy_fixture_assignments(fantasy_season_id,fixture_id,gameweek_id,original_gameweek_id,original_kickoff_at,assigned_kickoff_at,frozen_at,source_version)
values (pg_temp.rid(5),pg_temp.rid(3001),pg_temp.rid(24),pg_temp.rid(24),'2026-08-10 12:00Z','2026-08-10 12:00Z','2026-08-10 10:30Z',1),
  (pg_temp.rid(5),pg_temp.rid(3002),pg_temp.rid(25),pg_temp.rid(25),'2026-08-17 12:00Z','2026-08-17 12:00Z','2026-08-17 10:30Z',1);
insert into app.fantasy_players(id,fantasy_season_id,football_player_id,football_team_id,position_id,price)
select pg_temp.rid(2000+i),pg_temp.rid(5),pg_temp.rid(1000+i),pg_temp.rid(case when i=45 then 104 else 101+(i-1)/11 end),pos.id,6
from generate_series(1,45) i join app.players p on p.id=pg_temp.rid(1000+i)
join app.fantasy_positions pos on pos.code=case p.position when 'goalkeeper' then 'GK' when 'defender' then 'DEF' when 'midfielder' then 'MID' else 'FWD' end;
insert into app.team_memberships(player_id,team_id,season_id,valid_from)
select pg_temp.rid(1000+i),pg_temp.rid(case when i=45 then 104 else 101+(i-1)/11 end),pg_temp.rid(3),'2026-08-01' from generate_series(1,45) i;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.rid(8),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rating-points@example.test',statement_timestamp(),'hash','{}','{"username":"rating_points"}',statement_timestamp(),statement_timestamp());
insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,bank,team_value,free_transfers)
values(pg_temp.rid(9),pg_temp.rid(8),pg_temp.rid(5),pg_temp.rid(25),'Rating Eleven',10,90,1);

-- Staff operator who reviews the identities (aal2, single approver).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.id('e1', 1), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'sfs-op@example.test', 'hash', now(), '{}', '{"username":"sfs_op"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.id('e3', 1), pg_temp.id('e1', 1), 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at) values (pg_temp.id('e2', 1), pg_temp.id('e1', 1), now());
insert into app_private.staff_principals (auth_user_id) values (pg_temp.id('e1', 1));
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Operator for the SofaScore Fantasy test.'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = pg_temp.id('e1', 1) and r.name = 'football_operator';
update app_private.football_mapping_settings set allow_self_approval = true;

create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  if p_who = 'svc' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('e1', 1), 'role', 'authenticated',
      'aal', 'aal2', 'session_id', pg_temp.id('e2', 1))::text, true);
  end if;
end $$;


select pg_temp.act('svc');
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
 'provider','sofascore','externalPlayerId',i::text,'providerTeamId',case when i<=33 then '11' else '22' end,
 'clubKey',case when i<=33 then 'ratings-e2e-home' else 'ratings-e2e-away' end,
 'appTeamId',pg_temp.rid(case when i<=33 then 103 else 104 end),'squadCompleteness','COMPLETE',
 'registeredTeamDisagreement',false,'shirtNumber',1+(i-23)%11,
 'positionSignal',case when (i-23)%11=0 then 'G' when (i-23)%11 between 1 and 4 then 'D' when (i-23)%11 between 5 and 8 then 'M' else 'F' end,
 'dobState','missing','displayName','Synthetic provider player '||i))) from generate_series(23,44)i;
select pg_temp.act('op');
select api.admin_football_mapping_propose((select jsonb_agg(jsonb_build_object('kind','map',
 'sofascoreCandidateId',(select id from app_private.football_player_mapping_candidates where provider_name='sofascore' and external_id=i::text),
 'appPlayerId',pg_temp.rid(1000+i),'basis','manual') order by i) from generate_series(23,44)i),
 'Approve synthetic identities in an isolated automated integration test.',gen_random_uuid());
do $$ declare p record; begin
 for p in select id,fingerprint from app_private.football_player_mapping_proposals where status='pending' loop
  perform api.admin_football_mapping_decide(p.id,'approve','Isolated synthetic automation test.',p.fingerprint,false,gen_random_uuid());
  perform api.admin_football_mapping_execute(p.id,gen_random_uuid());
 end loop;
end $$;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select api.service_activate_adaptive_estimates(pg_temp.rid(5),4,api.service_adaptive_scoring_audit(pg_temp.rid(24))->>'activationDigest');
select app_private.fantasy_rating_points_configure(pg_temp.rid(5),true,5);
insert into app_private.fantasy_live_scoring_policy(season_id,enabled) values(pg_temp.rid(5),true);
select app_private.fantasy_staged_stats_configure(pg_temp.rid(5),true,5);
insert into app.fantasy_lineups(id,fantasy_team_id,gameweek_id,team_version,locked_at)
values(pg_temp.rid(30),pg_temp.rid(9),pg_temp.rid(25),1,'2026-08-17 10:30Z');
-- Starters: GK 23, DEF 24-27, MID 28-30, FWD 32, 33 and 45 (who does not play). Bench: GK 34,
-- then 31 (MID), 35 (DEF), 43 (FWD). Captain 28, vice-captain 29.
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,snapshot_price)
select pg_temp.rid(30),pg_temp.rid(2000+n),case when ord<=11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
  case when ord<=11 then ord else ord-11 end,n=28,n=29,6
from unnest(array[23,24,25,26,27,28,29,30,32,33,45,34,31,35,43]) with ordinality as selected(n,ord);
update app.fantasy_gameweeks set status='provisional' where id=pg_temp.rid(25);

update app.fixtures set kickoff_at=statement_timestamp()-interval '4 hours',provider_updated_at=statement_timestamp(),finalized_at=statement_timestamp()-interval '2 hours'
 where id=pg_temp.rid(3002);
update app.fantasy_fixture_assignments set original_kickoff_at=statement_timestamp()-interval '4 hours',assigned_kickoff_at=statement_timestamp()-interval '4 hours' where fixture_id=pg_temp.rid(3002);
update app.fantasy_gameweeks set starts_at=statement_timestamp()-interval '4 hours',ends_at=statement_timestamp()+interval '1 day',deadline_at=statement_timestamp()-interval '5 hours' where id=pg_temp.rid(25);
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at) values
 ('sofascore','competition','937',pg_temp.rid(2),'e2e-approved',now()),
 ('sofascore','season','102220',pg_temp.rid(3),'e2e-approved',now()),
 ('sofascore','team','11',pg_temp.rid(103),'e2e-approved',now()),
 ('sofascore','team','22',pg_temp.rid(104),'e2e-approved',now()),
 ('sofascore','fixture','123',pg_temp.rid(3002),'e2e-approved',now());
select app_private.football_data_source_configure('sofascore');
select app_private.sofascore_collection_configure(true);
select app_private.fantasy_automation_configure(true);
select app_private.fantasy_worker_configure(true);
-- Suppress unrelated local jobs. Only the two real schedulers under test are
-- accelerated by the harness, with their actual production SQL entry points.
select cron.alter_job(jobid,active:=false) from cron.job;
commit;
