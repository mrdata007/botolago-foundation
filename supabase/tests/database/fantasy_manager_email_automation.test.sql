-- Real database planner/fanout/claim/send-boundary integration. No provider calls.
begin;
select extensions.no_plan();
create function pg_temp.eid(n integer)returns uuid language sql immutable as $$
 select ('ea190000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into app.countries(id,iso_alpha2,iso_alpha3)values(pg_temp.eid(1),'MA','MAR');
insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
values(pg_temp.eid(2),'manager-email-test','Manager Email Test','MET','league',pg_temp.eid(1));
insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
values(pg_temp.eid(3),pg_temp.eid(2),'Manager email season',current_date-30,current_date+200,'active',true);
insert into app.rounds(id,season_id,round_number,name)values(pg_temp.eid(4),pg_temp.eid(3),1,'Round 1');
insert into app.teams(id,slug,name,short_name,code,country_id)
select pg_temp.eid(100+n),'manager-email-club-'||n,'Manager Club '||n,'MC'||n,'MC'||n,pg_temp.eid(1)from generate_series(1,2)n;
insert into app.fantasy_competitions(id,football_competition_id,slug,name,active)
values(pg_temp.eid(5),pg_temp.eid(2),'manager-email-test','Manager Emails',true);
insert into app.fantasy_seasons(id,fantasy_competition_id,football_season_id,ruleset_id,name,status,starts_at,ends_at)
values(pg_temp.eid(6),pg_temp.eid(5),pg_temp.eid(3),'f6100000-0000-4000-8000-000000000100','Manager emails','active',current_date-30,current_date+200);
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.eid(200+n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'manager-email-'||n||'@example.test',case when n=6 then null else statement_timestamp()end,'hash','{}',
 jsonb_build_object('username','manager_email_'||n,'preferred_language',case when n=2 then 'ar'else 'fr'end),now(),now()
from generate_series(1,6)n;
update app.user_preferences set email_notifications_enabled=false where user_id=pg_temp.eid(203);
update app.user_preferences set fantasy_deadline_reminders=false where user_id=pg_temp.eid(204);
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
values(pg_temp.eid(7),pg_temp.eid(6),pg_temp.eid(4),1,'GW1',date_trunc('hour',now())+interval '19 hours 43 minutes',
 date_trunc('hour',now())+interval '21 hours 13 minutes',now()+interval '3 days','scheduled');
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,provider_updated_at,source_sequence)
values(pg_temp.eid(8),pg_temp.eid(2),pg_temp.eid(3),pg_temp.eid(4),pg_temp.eid(101),pg_temp.eid(102),
 date_trunc('hour',now())+interval '21 hours 13 minutes','not_started',now(),1);
insert into app.fantasy_fixture_assignments(fantasy_season_id,fixture_id,gameweek_id,original_gameweek_id,original_kickoff_at,assigned_kickoff_at,source_version)
select pg_temp.eid(6),id,pg_temp.eid(7),pg_temp.eid(7),kickoff_at,kickoff_at,1 from app.fixtures where id=pg_temp.eid(8);
insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,status,bank,team_value,free_transfers)
select pg_temp.eid(300+n),pg_temp.eid(200+n),pg_temp.eid(6),pg_temp.eid(7),'Manager '||n,'active',10,90,1 from generate_series(1,6)n where n<>5;

select extensions.is((select manager_automation_enabled from app_private.notification_email_settings),false,'new manager automation ships off');
select extensions.ok(not exists(select 1 from app_private.fantasy_email_openings where gameweek_id=pg_temp.eid(7)),'scheduled gameweeks have no fabricated opening timestamp');
select app_private.notification_email_configure('live','http://kong:8000/functions/v1');
update app_private.notification_email_settings set manager_automation_enabled=true,
 enabled_types=array['gameweek_opened','deadline_24h','gameweek_finalized'],activated_at=statement_timestamp()-interval '1 second';
update app.fantasy_gameweeks set status='open'where id=pg_temp.eid(7);
select extensions.is((select count(*)::integer from app_private.fantasy_email_openings where gameweek_id=pg_temp.eid(7)),1,'real opening transition records one private moment');
select extensions.is(app_private.notification_email_plan_openings(statement_timestamp()),1,'opening planner creates one future-eligible event');
select extensions.is(app_private.notification_email_plan_openings(statement_timestamp()),0,'a repeated planner pass never duplicates the opening event');
select app_private.notification_email_fanout(statement_timestamp(),'live','{}',(select activated_at from app_private.notification_email_settings),100);
select extensions.is((select count(*)::integer from app.notifications where notification_type='gameweek_opened'),2,'only confirmed, opted-in managers get the opening email; no non-manager, email-off or topic-off recipients');
select extensions.is((select count(distinct language)::integer from app.notifications where notification_type='gameweek_opened'),2,'French and Arabic managers both receive their own language');
select extensions.ok(not exists(select 1 from app.notifications where notification_type='gameweek_opened'and deep_link_target<>'fantasy_team'),'opening inbox entry links directly to team selection');
select app_private.notification_email_fanout(statement_timestamp(),'live','{}',(select activated_at from app_private.notification_email_settings),100);
select extensions.is((select count(*)::integer from app.notification_deliveries where channel='email'),2,'repeated fanout creates no duplicate deliveries');

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.manager_claim',api.service_claim_email_deliveries(20,180)::text,true);
reset role;
select extensions.is(jsonb_array_length(current_setting('test.manager_claim')::jsonb),2,'real claim returns both eligible manager deliveries');
select extensions.ok(not exists(select 1 from jsonb_array_elements(current_setting('test.manager_claim')::jsonb)x where x#>>'{payload,automationVersion}'<>'1'or x#>>'{payload,selectionState}'<>'open'),'claim supplies canonical live state rather than trusting event payload');
create function pg_temp.validate_first()returns boolean language plpgsql as $$
declare x jsonb:=current_setting('test.manager_claim')::jsonb->0;begin
 return api.service_validate_fantasy_email_delivery((x->>'id')::uuid,x->'payload',x#>>'{recipient,email}',x->>'timezone');
end $$;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select extensions.ok(pg_temp.validate_first(),'claimed opening is eligible immediately before send');
update app.user_preferences set fantasy_deadline_reminders=false where user_id=(select n.user_id from app.notifications n join app.notification_deliveries d on d.notification_id=n.id where d.id=(current_setting('test.manager_claim')::jsonb->0->>'id')::uuid);
select extensions.ok(not pg_temp.validate_first(),'opting out after claim blocks the send');
update app.user_preferences set fantasy_deadline_reminders=true where user_id=(select n.user_id from app.notifications n join app.notification_deliveries d on d.notification_id=n.id where d.id=(current_setting('test.manager_claim')::jsonb->0->>'id')::uuid);
update app.fantasy_gameweeks set deadline_at=deadline_at+interval '1 hour'where id=pg_temp.eid(7);
select extensions.ok(not pg_temp.validate_first(),'a revised deadline after claim blocks the old email');
update app.fantasy_gameweeks set deadline_at=deadline_at-interval '1 hour'where id=pg_temp.eid(7);
select extensions.ok(pg_temp.validate_first(),'matching live state is independently rechecked without consuming the claim');
update app_private.notification_email_settings set enabled_types=array['deadline_24h','gameweek_finalized'];
select extensions.ok(not pg_temp.validate_first(),'a disabled email type cannot send an existing claim');
update app_private.notification_email_settings set enabled_types=array['gameweek_opened','deadline_24h','gameweek_finalized'];

-- Deadline uses the existing planner, with canonical state and per-GW dedup.
select app_private.notification_email_plan(statement_timestamp());
select app_private.notification_email_fanout(statement_timestamp(),'live','{}',(select activated_at from app_private.notification_email_settings),100);
select extensions.is((select count(*)::integer from app.notifications where notification_type='deadline_24h'),2,'existing deadline planner reaches only opted-in managers under the new automation');
select extensions.ok(not exists(select 1 from app.notifications where notification_type='deadline_24h'and deep_link_target<>'fantasy_team'),'deadline reminder links to the team editor');
select app_private.notification_email_enqueue('deadline_24h','fantasy',pg_temp.eid(7),'test:alternate-deadline-event',
 jsonb_build_object('gameweek',jsonb_build_object('id',pg_temp.eid(7),'sequence',1,'name','GW1'),'deadlineAt',(select deadline_at from app.fantasy_gameweeks where id=pg_temp.eid(7))),statement_timestamp());
select app_private.notification_email_fanout(statement_timestamp(),'live','{}',(select activated_at from app_private.notification_email_settings),100);
select extensions.is((select count(*)::integer from app.notifications where notification_type='deadline_24h'),2,'an alternate event cannot duplicate a manager/gameweek deadline reminder');
update app.fantasy_gameweeks set status='locked'where id=pg_temp.eid(7);
select extensions.ok(not pg_temp.validate_first(),'a locked selection cannot send its queued opening email');
select extensions.ok((select bool_and(app_private.notification_email_event_is_stale(e,statement_timestamp()))from app_private.notification_events e where source_entity_id=pg_temp.eid(7)and event_type in('gameweek_opened','deadline_24h')),'both reminder moments become stale on lock');

-- Old opening records never catch up when a later activation starts.
update app_private.notification_email_settings set activated_at=statement_timestamp()+interval '1 minute';
update app.fantasy_gameweeks set status='open'where id=pg_temp.eid(7);
select extensions.is(app_private.notification_email_plan_openings(statement_timestamp()),0,'activation never back-sends a historical opening');

-- Independent final-result fixture; the selected lineup has real final points.
insert into app.rounds(id,season_id,round_number,name)values(pg_temp.eid(14),pg_temp.eid(3),2,'Round 2');
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status,points_state,finalized_at,scoring_input_version)
values(pg_temp.eid(17),pg_temp.eid(6),pg_temp.eid(14),2,'GW2',now()-interval '4 days',now()-interval '3 days',now()-interval '1 day','finalized','final',now(),1);
insert into app.players(id,slug,full_name,display_name,position)
select pg_temp.eid(1000+n),'manager-email-player-'||n,'Player '||n,'P'||n,
case when n<=2 then 'goalkeeper'::app.football_position when n<=7 then 'defender'::app.football_position when n<=12 then 'midfielder'::app.football_position else 'forward'::app.football_position end
from generate_series(1,15)n;
insert into app.fantasy_players(id,fantasy_season_id,football_player_id,football_team_id,position_id,price,status,eligible,active)
select pg_temp.eid(2000+n),pg_temp.eid(6),pg_temp.eid(1000+n),pg_temp.eid(101),p.id,6,'available',true,true
from generate_series(1,15)n join app.fantasy_positions p on p.code=case when n<=2 then 'GK'when n<=7 then 'DEF'when n<=12 then 'MID'else 'FWD'end;
insert into app.fantasy_lineups(id,fantasy_team_id,gameweek_id,team_version,locked_at)
values(pg_temp.eid(18),pg_temp.eid(301),pg_temp.eid(17),1,now()-interval '4 days');
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,snapshot_price)
select pg_temp.eid(18),pg_temp.eid(2000+n),case when n<=11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
case when n<=11 then n else n-11 end,n=3,n=4,6 from generate_series(1,15)n;
update app.fantasy_lineups set finalized_at=now()where id=pg_temp.eid(18);
insert into app.fantasy_player_gameweek_points(fantasy_player_id,gameweek_id,provisional_points,final_points,minutes_played,did_play,calculation_version,football_input_version,finalized_at)
select pg_temp.eid(2000+n),pg_temp.eid(17),5,5,90,true,1,1,now()from generate_series(1,15)n;
insert into app.fantasy_team_gameweek_results(fantasy_team_id,gameweek_id,starting_points,bench_points,captain_points,transfer_hit,provisional_score,final_score,state,calculation_version,finalized_at)
values(pg_temp.eid(301),pg_temp.eid(17),55,20,5,0,60,60,'final',1,now());
insert into app_private.fantasy_api_rating_seasons(season_id,from_gameweek,owner_approval)
values(pg_temp.eid(6),1,'Test owner approved actual API ratings only');
insert into app_private.fantasy_rating_policy(season_id,from_gameweek,enabled)values(pg_temp.eid(6),1,true);
insert into app_private.notification_events(id,event_type,source_domain,source_entity_id,target_user_id,occurred_at,schema_version,deduplication_key,correlation_id,safe_payload)
values(pg_temp.eid(19),'gameweek_finalized','fantasy',pg_temp.eid(17),pg_temp.eid(201),now(),1,'test:manager-final-result',pg_temp.eid(17),'{"gameweek":2,"points":60}');
-- Native-only production keeps the obsolete policy disabled. A complete,
-- persisted and sealed current native snapshot is the authority instead.
update app_private.fantasy_rating_policy set enabled=false where season_id=pg_temp.eid(6);
select extensions.ok((select app_private.fantasy_email_payload(e,pg_temp.eid(201),statement_timestamp())is null from app_private.notification_events e where id=pg_temp.eid(19)),'a final raw score without a native seal cannot email');
insert into app_private.fantasy_scoring_snapshots(gameweek_id,calculation_version,input_digest,payload,players_persisted)
values(pg_temp.eid(17),1,repeat('a',64),'{"apiNativeRatings":true,"ratingScoring":true,"scoringVersion":3,"ruleset":{"version":3},"pendingFixtures":[],"pendingPlayerIds":[],"playerFixtures":[],"fixtures":[]}',true);
select extensions.ok((select app_private.fantasy_email_payload(e,pg_temp.eid(201),statement_timestamp())is null from app_private.notification_events e where id=pg_temp.eid(19)),'an unsealed native calculation cannot email');
update app_private.fantasy_scoring_snapshots set sealed_at=statement_timestamp()where gameweek_id=pg_temp.eid(17);
select extensions.is((select app_private.fantasy_email_payload(e,pg_temp.eid(201),statement_timestamp())->>'points'from app_private.notification_events e where id=pg_temp.eid(19)),'60','verified native final points email while the legacy scoring policy remains disabled');
create function pg_temp.native_email_rejects(p_change jsonb)returns boolean language plpgsql as $$
declare original jsonb;rejected boolean;begin
 select payload into original from app_private.fantasy_scoring_snapshots where gameweek_id=pg_temp.eid(17);
 update app_private.fantasy_scoring_snapshots set payload=original||p_change where gameweek_id=pg_temp.eid(17);
 select app_private.fantasy_email_payload(e,pg_temp.eid(201),statement_timestamp())is null into rejected from app_private.notification_events e where id=pg_temp.eid(19);
 update app_private.fantasy_scoring_snapshots set payload=original where gameweek_id=pg_temp.eid(17);
 return rejected;end $$;
select extensions.ok(pg_temp.native_email_rejects('{"apiNativeRatings":false}'),'a non-native seal cannot email');
select extensions.ok(pg_temp.native_email_rejects('{"ruleset":{"version":2}}'),'an old scoring ruleset cannot email');
select extensions.ok(pg_temp.native_email_rejects('{"pendingFixtures":[{}]}'),'a seal with pending fixtures cannot email');
select extensions.ok(pg_temp.native_email_rejects('{"pendingPlayerIds":["missing"]}'),'a seal with pending players cannot email');
select extensions.ok(pg_temp.native_email_rejects('{"pendingFixtures":null}'),'missing readiness evidence cannot email');
select extensions.ok(pg_temp.native_email_rejects('{"playerFixtures":[{"apiAppeared":true,"rating":null,"stats":{"minutes":12}}]}'),'an unrated appearance without approved proof cannot email');
select extensions.ok(pg_temp.native_email_rejects('{"playerFixtures":[{"apiAppeared":true,"rating":null,"apiNotRated":true,"participationKnown":true,"notRatedEvidence":{"policyVersion":1,"minutes":4},"stats":{"minutes":4}}]}'),'a forged Not rated flag cannot authorize email');
update app_private.fantasy_scoring_snapshots set players_persisted=false where gameweek_id=pg_temp.eid(17);
select extensions.ok((select app_private.fantasy_email_payload(e,pg_temp.eid(201),statement_timestamp())is null from app_private.notification_events e where id=pg_temp.eid(19)),'unpersisted player results cannot email');
update app_private.fantasy_scoring_snapshots set players_persisted=true where gameweek_id=pg_temp.eid(17);
update app.fantasy_gameweeks set scoring_input_version=2 where id=pg_temp.eid(17);
select extensions.ok((select app_private.fantasy_email_payload(e,pg_temp.eid(201),statement_timestamp())is null from app_private.notification_events e where id=pg_temp.eid(19)),'a stale sealed calculation cannot email');
update app.fantasy_gameweeks set scoring_input_version=1 where id=pg_temp.eid(17);
select extensions.is((select app_private.fantasy_email_payload(e,pg_temp.eid(201),statement_timestamp())->>'points'from app_private.notification_events e where id=pg_temp.eid(19)),'60','ready payload agrees with the owned visible final result');
select extensions.is((select app_private.fantasy_email_payload(e,pg_temp.eid(202),statement_timestamp())from app_private.notification_events e where id=pg_temp.eid(19)),null::jsonb,'another manager cannot receive the first manager score');
update app.fantasy_player_gameweek_points set final_points=null,finalized_at=null where fantasy_player_id=pg_temp.eid(2001)and gameweek_id=pg_temp.eid(17);
select extensions.ok((select app_private.fantasy_email_payload(e,pg_temp.eid(201),statement_timestamp())is null from app_private.notification_events e where id=pg_temp.eid(19)),'one pending selected player blocks a final score email');
update app.fantasy_player_gameweek_points set final_points=5,finalized_at=now()where fantasy_player_id=pg_temp.eid(2001)and gameweek_id=pg_temp.eid(17);
-- Exercise fanout and claim with legacy scoring disabled, as in production.
update app_private.notification_email_settings set activated_at=statement_timestamp()-interval '1 second';
select app_private.notification_email_fanout(statement_timestamp(),'live','{}',(select activated_at from app_private.notification_email_settings),100);
select extensions.is((select count(*)::integer from app.notifications where notification_type='gameweek_finalized'),1,'valid native final event reaches exactly its manager');
select app_private.notification_email_fanout(statement_timestamp(),'live','{}',(select activated_at from app_private.notification_email_settings),100);
select extensions.is((select count(*)::integer from app.notifications where notification_type='gameweek_finalized'),1,'native result fanout is idempotent');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.native_final_claim',api.service_claim_email_deliveries(20,180)::text,true);
select extensions.is((select count(*)::integer from jsonb_array_elements(current_setting('test.native_final_claim')::jsonb)x where x#>>'{payload,state}'='finalized'),1,'real dispatcher claim accepts the native final result');
create function pg_temp.validate_native_final()returns boolean language plpgsql as $$
declare x jsonb;begin
 select value into strict x from jsonb_array_elements(current_setting('test.native_final_claim')::jsonb)where value#>>'{payload,state}'='finalized';
 return api.service_validate_fantasy_email_delivery((x->>'id')::uuid,x->'payload',x#>>'{recipient,email}',x->>'timezone');end $$;
select extensions.ok(pg_temp.validate_native_final(),'send boundary revalidates current native final points');
insert into app_private.fantasy_rating_recovery_plans(gameweek_id,calculation_version,input_digest,owner_approval,previous_state,proposal,results,complete)
values(pg_temp.eid(17),1,repeat('a',64),'Test publication preserving original final score','{}','{}',
jsonb_build_object('playerResults','[]'::jsonb,'teamResults',jsonb_build_array(jsonb_build_object('teamId',pg_temp.eid(301),'lineupId',pg_temp.eid(18),'startingPoints',55,'benchPoints',20,'captainPoints',5,'transferHit',0,'provisionalScore',60))),false);
insert into app_private.fantasy_rating_publications(gameweek_id,plan_id,owner_approval)
select pg_temp.eid(17),id,'Test owner approved provisional visible revision'from app_private.fantasy_rating_recovery_plans where gameweek_id=pg_temp.eid(17);
select extensions.ok((select app_private.fantasy_email_payload(e,pg_temp.eid(201),statement_timestamp())is null from app_private.notification_events e where id=pg_temp.eid(19)),'a visible provisional rating revision blocks an email despite the preserved raw final score');
select extensions.ok(not pg_temp.validate_native_final(),'a provisional correction after claim blocks sending the old final score');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select extensions.throws_ok($$select api.service_validate_fantasy_email_delivery(pg_temp.eid(999),'{}','manager@example.test','Africa/Casablanca')$$,'42501',null,'a browser cannot invoke the service send authorization');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select extensions.throws_ok($$select api.service_validate_fantasy_email_delivery(pg_temp.eid(999),'{}','manager@example.test','Africa/Casablanca')$$,'PT403','notification_access_denied','the service guard also rejects a forged browser claim under an owner connection');
select extensions.ok(not has_table_privilege('service_role','app_private.fantasy_email_openings','select'),'the private opening ledger is not exposed to the service Data API');
select * from extensions.finish();
rollback;
