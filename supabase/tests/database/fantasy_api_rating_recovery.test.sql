-- The rating rule (docs/backend/FANTASY_RATING_POINTS.md, migrations 20261014090000 and
-- 20261014090100): off by default; switched on from a gameweek only while that gameweek is
-- scheduled or open; the documents of earlier gameweeks unchanged byte for byte; a rating
-- gameweek's document carries ruleset v3.0, scoring version 3 and each player's SofaScore
-- rating; the save accepts exactly one `rating` event per appearing player, worth the rating
-- rounded half up (pending without a rating), and refuses `rating` for a v2 snapshot.
begin;
select extensions.no_plan();
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


insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
values('sofascore','fixture','9001',pg_temp.rid(3001),'test',now()),('sofascore','fixture','9002',pg_temp.rid(3002),'test',now());
create function pg_temp.native_players(p_missing boolean default false) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('externalId',i::text,'side',case when i<=11 then 'home' else 'away' end,
 'starter',true,'minutes',90,'rating',case when p_missing and i=1 then null else 7.5 end,'appeared',true,'uncertain',false) order by i)
 from generate_series(1,22) i;
$$;
select extensions.is(api.service_record_fantasy_api_ratings(pg_temp.rid(3001),'9001',pg_temp.native_players(),statement_timestamp())->>'ready','true',
 'API ratings do not require any canonical player identity');
select extensions.is((select count(*)::int from app_private.fantasy_api_rating_points where fixture_id=pg_temp.rid(3001)),22,'all API participants get ledger entries');
select extensions.ok(not exists(select 1 from app_private.fantasy_api_rating_points where fixture_id=pg_temp.rid(3001) and points<>8),'real rating 7.5 rounds to 8');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name='sofascore' and entity_type='player'),0,'no player link was created');
select extensions.is(api.service_record_fantasy_api_ratings(pg_temp.rid(3001),'9001',pg_temp.native_players(),statement_timestamp())->>'ready','true','identical actual data can be recaptured');
select extensions.is((select count(*)::int from app_private.fantasy_api_rating_sources where fixture_id=pg_temp.rid(3001)),1,'unchanged ratings reuse an immutable source');
select extensions.is(api.service_record_fantasy_api_ratings(pg_temp.rid(3001),'9001',pg_temp.native_players(true),statement_timestamp())->>'ready','false','an unrated starter keeps the fixture pending');
select extensions.is((select points from app_private.fantasy_api_rating_points where fixture_id=pg_temp.rid(3001) and api_player_id='1'),null::integer,'an unrated API participant gets NULL, never five or zero');
select extensions.throws_ok($$select api.service_record_fantasy_api_ratings(pg_temp.rid(3001),'9002',pg_temp.native_players(),statement_timestamp())$$,'PT409','fantasy_api_event_mismatch','a different fixture API ID is refused');
select extensions.throws_ok($$select api.service_record_fantasy_api_ratings(pg_temp.rid(3001),'9001',jsonb_set(pg_temp.native_players(),'{0,rating}','11'),statement_timestamp())$$,'PT400','fantasy_api_rating_payload_invalid','invalid ratings are rejected');
select extensions.throws_ok($$select api.service_record_fantasy_api_ratings(pg_temp.rid(3001),'9001',pg_temp.native_players()-0,statement_timestamp())$$,'PT400','fantasy_api_rating_payload_invalid','incomplete starters cannot certify participation');
select extensions.is(api.service_record_fantasy_api_ratings(pg_temp.rid(3001),'9001',pg_temp.native_players(),statement_timestamp())->>'ready','true','actual ratings resume readiness');
select extensions.is((select count(*)::int from app_private.fantasy_api_rating_sources where fixture_id=pg_temp.rid(3001)),3,'a return to previous actual facts still creates a new version');
select extensions.is((select points from app_private.fantasy_api_rating_points where fixture_id=pg_temp.rid(3001) and api_player_id='1'),8,'latest real provider version wins');
select extensions.ok(app_private.fantasy_actual_ratings_pending('{"scoringVersion":3,"ruleset":{"version":3},"ratingScoring":true,"playerFixtures":[{"apiAppeared":true,"stats":{},"rating":null}]}'),'API appearance evidence cannot become a DNP when minutes are absent');
select extensions.ok(not has_function_privilege('service_role','app_private.fantasy_activate_api_ratings(uuid,text,text)','execute'),'a service worker cannot activate a new scoring policy');
select extensions.ok(not has_function_privilege('authenticated','api.service_record_fantasy_api_ratings(uuid,text,jsonb,timestamptz)','execute'),'clients cannot submit ratings');
select extensions.is((app_private.fantasy_api_rating_preview(pg_temp.rid(24))->>'apiNativeRatings'),'true','owner preview builds native input without enabling a policy');
select extensions.is((select count(*)::int from app_private.fantasy_api_rating_seasons),0,'a preview changes no active scoring policy');
select extensions.is(app_private.fantasy_scoring_input_document(pg_temp.rid(24))->>'apiNativeRatings',null::text,'ordinary documents are unchanged while the native policy is off');

select extensions.ok((select prosrc like '%app_private.manager_card_settings%' and prosrc !~ 'app\.manager_cards|app\.manager_card_seasons|app\.manager_card_gameweeks'
 from pg_proc where oid='app_private.fantasy_activate_api_ratings(uuid,text,text)'::regprocedure),'maintenance only reads the card writer switch, never card scores');
select extensions.ok((select prosrc like '%app_private.trophy_settings%' and prosrc !~ 'app\.trophies_earned|app\.trophy_catalog|app\.card_frames'
 from pg_proc where oid='app_private.fantasy_activate_api_ratings(uuid,text,text)'::regprocedure),'maintenance only reads the trophy writer switch, never trophy awards');

-- Exercise the real staged-plan -> cutover -> guarded persistence path.
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
select 'sofascore','player',(i-22)::text,pg_temp.rid(1000+i),'test',now() from generate_series(23,44) i;
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
values('sofascore','player','99',pg_temp.rid(1045),'test',now());
-- This API ID is already known, but legacy catalog club/membership data are stale.
insert into app.players(id,slug,full_name,display_name,position) values(pg_temp.rid(1046),'native-only-46','Native Player','Native','midfielder');
insert into app.fantasy_players(id,fantasy_season_id,football_player_id,football_team_id,position_id,price)
select pg_temp.rid(2046),pg_temp.rid(5),pg_temp.rid(1046),pg_temp.rid(101),id,6 from app.fantasy_positions where code='MID';
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
values('sofascore','player','500',pg_temp.rid(1046),'test',now());
select api.service_record_fantasy_api_ratings(pg_temp.rid(3002),'9002',jsonb_set(pg_temp.native_players(),'{21,externalId}','"500"'),statement_timestamp());
insert into app_private.fantasy_adaptive_policy(season_id,from_gameweek,ruleset_id)
values(pg_temp.rid(5),4,'f6200000-0000-4000-8000-000000000200');
insert into app_private.fantasy_live_scoring_policy(season_id,enabled) values(pg_temp.rid(5),true);
insert into app.fantasy_lineups(id,fantasy_team_id,gameweek_id,team_version,locked_at)
values(pg_temp.rid(30),pg_temp.rid(9),pg_temp.rid(25),1,'2026-08-17 10:30Z');
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,snapshot_price)
select pg_temp.rid(30),pg_temp.rid(2000+n),case when ord<=11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
 case when ord<=11 then ord else ord-11 end,n=28,n=29,6
from unnest(array[23,24,25,26,27,28,29,30,31,32,33,34,35,39,43]) with ordinality as selected(n,ord);
update app.fantasy_gameweeks set status='provisional' where id=pg_temp.rid(25);
-- A past sealed calculation stays immutable during the new unfinished-week cutover.
update app.fantasy_gameweeks set status='finalized',points_state='final',finalized_at=statement_timestamp() where id=pg_temp.rid(24);
insert into app_private.fantasy_scoring_snapshots(gameweek_id,calculation_version,input_digest,payload,players_persisted,sealed_at)
select pg_temp.rid(24),1,encode(extensions.digest(d::text,'sha256'),'hex'),d,true,statement_timestamp()
from (select app_private.fantasy_scoring_input_document(pg_temp.rid(24)) as d) x;
select set_config('test.past_seal', (select md5(to_jsonb(s)::text) from app_private.fantasy_scoring_snapshots s where gameweek_id=pg_temp.rid(24)),true);
select set_config('test.native_preview',app_private.fantasy_api_rating_preview(pg_temp.rid(25))::text,true);
select extensions.ok(exists(select 1 from jsonb_array_elements(current_setting('test.native_preview')::jsonb->'playerFixtures') p
 where p->>'fantasyPlayerId'=pg_temp.rid(2046)::text and p->>'providerPlayerId'='500' and p->>'apiAppeared'='true'),
 'actual API participation is scored even when legacy club/membership data disagree');

select set_config('test.native_results',(select jsonb_build_object('playerResults',
 (select jsonb_agg(jsonb_build_object('fantasyPlayerId',p->'fantasyPlayerId','fixtureId',p->'fixtureId','events',
 case when p->>'apiAppeared'='true' then jsonb_build_array(jsonb_build_object('category','rating','points',8,
 'sourceKey','fixture-stats:'||(p->>'fixtureId')||':'||(p->>'playerId')||':rating')) else '[]'::jsonb end))
 from jsonb_array_elements(current_setting('test.native_preview')::jsonb->'playerFixtures') p),
 'teamResults',(select jsonb_build_array(jsonb_build_object('teamId',pg_temp.rid(9),'lineupId',pg_temp.rid(30),
 'startingPoints',88,'benchPoints',32,'captainPoints',8,'transferHit',0,'provisionalScore',96,'effectiveCaptainId',pg_temp.rid(2028),
 'substitutions','[]'::jsonb,'players',jsonb_agg(jsonb_build_object('fantasyPlayerId',lp.fantasy_player_id,
 'multiplier',case when lp.captain then 2 when lp.slot='starter' then 1 else 0 end))))
 from app.fantasy_lineup_players lp where lp.lineup_id=pg_temp.rid(30)))::text),true);
select extensions.is(app_private.fantasy_stage_api_rating_recovery(pg_temp.rid(25),
 current_setting('test.native_preview')::jsonb->>'inputDigest',current_setting('test.native_results')::jsonb,
 'Owner approved actual API ratings only')->>'published','false','staging does not publish a score');
select extensions.is((select count(*)::int from app.fantasy_team_gameweek_results where gameweek_id=pg_temp.rid(25)),0,'staged calculations leave public results untouched');
select app_private.fantasy_automation_configure(false);
select app_private.notification_email_configure('off',null,null,false);
select app_private.account_deletion_configure(false);
select app_private.manager_card_configure(false,null);
select app_private.rivals_configure(false);
select app_private.trophy_configure(false);
select extensions.throws_ok($$select app_private.fantasy_activate_api_ratings(pg_temp.rid(25),repeat('0',64),'Owner approved actual API ratings only')$$,
 'P0001','rating_cutover_inputs_changed_or_no_ratings','a changed input digest cannot activate scoring');
select extensions.is(app_private.fantasy_activate_api_ratings(pg_temp.rid(25),
 current_setting('test.native_preview')::jsonb->>'inputDigest','Owner approved actual API ratings only')->>'finalized','false',
 'owner cutover publishes provisional results without finalizing');
select extensions.is((select provisional_score from app.fantasy_team_gameweek_results where gameweek_id=pg_temp.rid(25)),96,'SQL independently verifies the rating-only team total');
select extensions.is((select md5(to_jsonb(s)::text) from app_private.fantasy_scoring_snapshots s where gameweek_id=pg_temp.rid(24)),current_setting('test.past_seal'),'past sealed calculation remains byte-for-byte unchanged');
select extensions.is((select status::text from app.fantasy_gameweeks where id=pg_temp.rid(24)),'finalized','the past gameweek remains finalized');
select extensions.is(api.service_fantasy_lifecycle_state(pg_temp.rid(25))->>'adaptiveScoringEnabled','false','the native worker does not run category-mode selection');

select extensions.is((select final_score from app.fantasy_team_gameweek_results where gameweek_id=pg_temp.rid(25)),null::integer,'the cutover does not create a final score');
select extensions.is((select status::text from app.fantasy_gameweeks where id=pg_temp.rid(25)),'provisional','gameweek status is preserved');
select extensions.is((select count(*)::int from app.fantasy_player_point_events where gameweek_id=pg_temp.rid(25) and category<>'rating' and superseded_at is null),0,'no goals, assists, cards or minute events enter the rating ledger');
select extensions.is(api.service_fantasy_api_rating_context(pg_temp.rid(3001))->>'enabled','true','the season-wide native path also prevents old-match identity linking');

-- A later provider reply with one missing rating must still expose the other
-- real ratings provisionally, without allowing sealing or a false GK swap.
select api.service_record_fantasy_api_ratings(pg_temp.rid(3002),'9002',pg_temp.native_players(true),statement_timestamp());
select set_config('test.partial_preview',app_private.fantasy_api_rating_preview(pg_temp.rid(25))::text,true);
select extensions.is(jsonb_array_length(current_setting('test.partial_preview')::jsonb->'fixtures'),1,'rated participants from an incomplete fixture remain scorable');
select extensions.is(jsonb_array_length(current_setting('test.partial_preview')::jsonb->'pendingFixtures'),1,'the incomplete fixture remains explicitly pending');
select extensions.ok(not exists(select 1 from jsonb_array_elements(current_setting('test.partial_preview')::jsonb->'playerFixtures') p
 where p->>'fantasyPlayerId'=pg_temp.rid(2023)::text),'the unrated participant is absent from scored rows, never turned into zero/five points');
select extensions.ok(current_setting('test.partial_preview')::jsonb->'pendingPlayerIds' ? pg_temp.rid(2023)::text,'the unrated GK remains pending, so automatic substitution cannot replace him');
select set_config('test.partial_version',api.service_prepare_fantasy_live_scoring(pg_temp.rid(25))->>'calculationVersion',true);
select api.service_get_fantasy_scoring_snapshot(pg_temp.rid(25),current_setting('test.partial_version')::bigint,null,100);
select extensions.throws_ok($$select api.service_begin_fantasy_finalization(pg_temp.rid(25),current_setting('test.partial_version')::bigint,
 current_setting('test.partial_preview')::jsonb->>'inputDigest')$$,'PT409',null,'missing actual ratings prevent sealing even though other ratings can score');

update app_private.fantasy_api_rating_polls set last_fetched_at=statement_timestamp()-interval '3 hours',last_attempt_at=statement_timestamp()-interval '1 hour' where fixture_id=pg_temp.rid(3002);
select extensions.is(jsonb_array_length(api.service_fantasy_api_ratings_due(1)),1,'a stale native fixture gets one bounded poll claim');
select extensions.is(jsonb_array_length(api.service_fantasy_api_ratings_due(1)),0,'even a failed provider request cannot be retried again within fifteen minutes');
select * from extensions.finish();
rollback;
