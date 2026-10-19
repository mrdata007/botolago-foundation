-- Fresh f951 fixture for real Edge runtime/restart measurements, derived from
-- staging-5000-rating-fixture.sql. Never reopens the measured f950 fixture.
-- Isolated, disposable STAGING fixture. Never a production migration.
-- Reuses 5,000 existing synthetic load identities; no user/account is changed.
-- All 66 provider participants rate 7.5 => 8 points each. Independently:
-- 11 starters * 8 + one captain bonus * 8 = 96; bench = 4 * 8 = 32.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
do $$ begin
 if current_setting('botolago.release_drill',true) is distinct from 'srdrflfrfpwixsllveid' then
   raise exception 'staging_drill_target_guard'; end if;
 if exists(select 1 from cron.job where active)
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now())
 or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled)
 or exists(select 1 from app_private.notification_push_settings where mode<>'off') then
   raise exception 'staging_drill_writers_not_paused'; end if;
 if (select count(*) from auth.users where id in
   (select md5('fantasy-load-user-'||n)::uuid from generate_series(1,5000) n)
   and email like 'fantasy-load-%@staging.botolago.invalid')<>5000 then
   raise exception 'staging_drill_synthetic_identity_guard'; end if;
 if exists(select 1 from app.fantasy_seasons where id='f9510000-0000-4000-8000-000000000005') then
   raise exception 'staging_drill_fixture_already_exists'; end if;
end $$;
create function pg_temp.did(n integer) returns uuid language sql stable as $$
 select case when n=1 then (select id from app.countries where iso_alpha2='MA')
 else ('f9510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid end;
$$;
insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
values(pg_temp.did(2),'staging-edge-drill-20261019','Staging Edge Drill','DRILL','league',pg_temp.did(1));
insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
values(pg_temp.did(3),pg_temp.did(2),'2026 Staging Edge Drill',current_date-7,current_date+30,'active',false);
insert into app.rounds(id,season_id,round_number,name,status)
values(pg_temp.did(11),pg_temp.did(3),1,'Drill GW1','completed'),
 (pg_temp.did(12),pg_temp.did(3),2,'Drill GW2','planned');
insert into app.teams(id,slug,name,short_name,code,country_id)
select pg_temp.did(100+c),'staging-edge-drill-club-'||c,'Staging Edge Drill Club '||c,'DC'||c,'DC'||c,pg_temp.did(1)
from generate_series(0,5) c;
insert into app.players(id,slug,full_name,display_name,position)
select pg_temp.did(1000+i),'staging-edge-drill-player-'||i,'Drill Player '||i,'DP'||i,
 case when i%11=0 then 'goalkeeper'::app.football_position
 when i%11 between 1 and 4 then 'defender'::app.football_position
 when i%11 between 5 and 8 then 'midfielder'::app.football_position
 else 'forward'::app.football_position end from generate_series(0,65) i;
insert into app.team_memberships(player_id,team_id,season_id,valid_from)
select pg_temp.did(1000+i),pg_temp.did(100+i/11),pg_temp.did(3),current_date-7 from generate_series(0,65) i;
insert into app.fantasy_competitions(id,football_competition_id,slug,name,active)
values(pg_temp.did(4),pg_temp.did(2),'staging-edge-drill-20261019','Staging Edge Drill',true);
insert into app.fantasy_seasons(id,fantasy_competition_id,football_season_id,ruleset_id,name,status,starts_at,ends_at)
values(pg_temp.did(5),pg_temp.did(4),pg_temp.did(3),'f6100000-0000-4000-8000-000000000100',
 'Staging Edge Drill 5000','active',now()-interval '7 days',now()+interval '30 days');
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
values(pg_temp.did(21),pg_temp.did(5),pg_temp.did(11),1,'Drill GW1',now()-interval '2 days 90 minutes',
 now()-interval '2 days',now()-interval '2 days'+interval '2 hours','provisional'),
 (pg_temp.did(22),pg_temp.did(5),pg_temp.did(12),2,'Drill GW2',now()+interval '7 days'-interval '90 minutes',
 now()+interval '7 days',now()+interval '7 days 2 hours','scheduled');
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,home_score,away_score,source_sequence,provider_updated_at,finalized_at)
select pg_temp.did(3000+j),pg_temp.did(2),pg_temp.did(3),pg_temp.did(11),pg_temp.did(100+2*j),pg_temp.did(101+2*j),
 now()-interval '2 days','finished',0,0,1,now()-interval '46 hours',now()-interval '46 hours' from generate_series(0,2) j;
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,provider_updated_at)
select pg_temp.did(3010+j),pg_temp.did(2),pg_temp.did(3),pg_temp.did(12),pg_temp.did(100+2*j),pg_temp.did(101+2*j),
 now()+interval '7 days','scheduled',now() from generate_series(0,2) j;
insert into app.fantasy_fixture_assignments(fantasy_season_id,fixture_id,gameweek_id,original_gameweek_id,original_kickoff_at,assigned_kickoff_at,frozen_at,source_version)
select pg_temp.did(5),f.id,pg_temp.did(case when f.round_id=pg_temp.did(11) then 21 else 22 end),
 pg_temp.did(case when f.round_id=pg_temp.did(11) then 21 else 22 end),f.kickoff_at,f.kickoff_at,
 case when f.status='finished' then now()-interval '2 days 90 minutes' end,1
from app.fixtures f where f.season_id=pg_temp.did(3);
insert into app.fantasy_players(id,fantasy_season_id,football_player_id,football_team_id,position_id,price)
select pg_temp.did(2000+i),pg_temp.did(5),pg_temp.did(1000+i),pg_temp.did(100+i/11),pos.id,6
from generate_series(0,65) i join app.players p on p.id=pg_temp.did(1000+i)
join app.fantasy_positions pos on pos.code=case p.position when 'goalkeeper' then 'GK' when 'defender' then 'DEF' when 'midfielder' then 'MID' else 'FWD' end;
-- This policy belongs only to the new synthetic fixture; no existing season's
-- activation/recovery path is changed or certified by setting up this fixture.
insert into app_private.fantasy_api_rating_seasons(season_id,from_gameweek,owner_approval)
values(pg_temp.did(5),1,'Owner-requested staging-only 5000-team synthetic scoring drill');
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
select 'sofascore','fixture',(995100000+j)::text,pg_temp.did(3000+j),'staging-drill',now() from generate_series(0,2) j;
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
select 'sofascore','player',(995101000+i)::text,pg_temp.did(1000+i),'staging-drill',now() from generate_series(0,65) i;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select api.service_record_fantasy_api_ratings(pg_temp.did(3000+j),(995100000+j)::text,
 (select jsonb_agg(jsonb_build_object('externalId',(995101000+i)::text,'side',case when i<22*j+11 then 'home' else 'away' end,
 'starter',true,'minutes',90,'rating',7.5,'appeared',true,'uncertain',false) order by i)
 from generate_series(22*j,22*j+21) i),statement_timestamp()) from generate_series(0,2) j;
insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,bank,team_value,free_transfers)
select pg_temp.did(10000+n),md5('fantasy-load-user-'||n)::uuid,pg_temp.did(5),pg_temp.did(21),'Rating Drill Team '||n,10,90,1
from generate_series(1,5000) n;
insert into app.fantasy_squad_memberships(id,fantasy_team_id,fantasy_player_id,purchase_price,current_sale_price,acquired_gameweek_id)
select md5('staging-edge-drill-membership-'||n||'-'||i)::uuid,pg_temp.did(10000+n),pg_temp.did(2000+i),6,6,pg_temp.did(21)
from generate_series(1,5000) n cross join unnest(array[0,1,12,23,34,5,16,27,38,42,53,11,45,49,64]) i;
insert into app.fantasy_lineups(id,fantasy_team_id,gameweek_id,team_version,locked_at)
select pg_temp.did(20000+n),pg_temp.did(10000+n),pg_temp.did(21),1,now()-interval '2 days 90 minutes' from generate_series(1,5000) n;
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,snapshot_price)
select pg_temp.did(20000+n),pg_temp.did(2000+i),case when ord<=11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
 case when ord<=11 then ord else ord-11 end,i=5,i=42,6
from generate_series(1,5000) n cross join unnest(array[0,1,12,23,34,5,16,27,38,42,53,11,45,49,64]) with ordinality as chosen(i,ord);
insert into app.fantasy_leagues(id,fantasy_season_id,owner_user_id,name,visibility,member_count,active)
select pg_temp.did(40000+l),pg_temp.did(5),md5('fantasy-load-user-1')::uuid,'Rating Drill League '||l,'public',
 case when l=0 then 1000 else 50 end,true from generate_series(0,499) l;
insert into app.fantasy_league_memberships(id,league_id,fantasy_team_id,user_id,role,status)
select md5('staging-edge-drill-league-'||l||'-'||n)::uuid,pg_temp.did(40000+l),pg_temp.did(10000+n),md5('fantasy-load-user-'||n)::uuid,
 case when n=1 then 'owner'::app.fantasy_league_role else 'member'::app.fantasy_league_role end,'active'
from generate_series(0,499) l cross join lateral generate_series(1,case when l=0 then 1000 else 50 end) n;
select jsonb_build_object('season','f9510000-0000-4000-8000-000000000005','teams',
 (select count(*) from app.fantasy_teams where fantasy_season_id=pg_temp.did(5)),
 'lineups',(select count(*) from app.fantasy_lineups where gameweek_id=pg_temp.did(21)),
 'leagues',(select count(*) from app.fantasy_leagues where fantasy_season_id=pg_temp.did(5)),
 'resultsBeforeWorker',(select count(*) from app.fantasy_team_gameweek_results where gameweek_id=pg_temp.did(21)));
commit;
