begin;
select extensions.no_plan();
create function pg_temp.scoring_id(n integer) returns uuid language sql immutable as $$
  select ('cb000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into app.countries(id,iso_alpha2,iso_alpha3) values(pg_temp.scoring_id(1),'MA','MAR');
insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
values(pg_temp.scoring_id(2),'live-worker-test','Scoring Worker Test','SWT','league',pg_temp.scoring_id(1));
insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
values(pg_temp.scoring_id(3),pg_temp.scoring_id(2),'2026/2027','2026-08-01','2027-06-30','active',true);
insert into app.rounds(id,season_id,round_number,name,status)
values(pg_temp.scoring_id(7),pg_temp.scoring_id(3),1,'Round 1','completed');
insert into app.teams(id,slug,name,short_name,code,country_id)
select pg_temp.scoring_id(100+i),'scoring-club-'||i,'Scoring Club '||i,'SC'||i,'SC'||i,pg_temp.scoring_id(1) from generate_series(1,6)i;
insert into app.players(id,slug,full_name,display_name,position)
select pg_temp.scoring_id(1000+i),'scoring-player-'||i,'Scoring Player '||i,'SP'||i,
  case when (i-1)%11=0 then 'goalkeeper'::app.football_position
    when (i-1)%11 between 1 and 4 then 'defender'::app.football_position
    when (i-1)%11 between 5 and 8 then 'midfielder'::app.football_position else 'forward'::app.football_position end
from generate_series(1,66)i;
insert into app.fantasy_competitions(id,football_competition_id,slug,name,active)
values(pg_temp.scoring_id(4),pg_temp.scoring_id(2),'live-worker-test','Scoring Worker Test',true);
insert into app.fantasy_seasons(id,fantasy_competition_id,football_season_id,ruleset_id,name,status,starts_at,ends_at)
values(pg_temp.scoring_id(5),pg_temp.scoring_id(4),pg_temp.scoring_id(3),'f6100000-0000-4000-8000-000000000100','2026/2027','active','2026-08-01','2027-06-30');
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
values(pg_temp.scoring_id(6),pg_temp.scoring_id(5),pg_temp.scoring_id(7),1,'GW1','2026-08-10 10:30Z','2026-08-10 12:00Z','2026-08-12 12:00Z','provisional');
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,home_score,away_score,provider_updated_at,source_sequence,finalized_at)
select pg_temp.scoring_id(3000+i),pg_temp.scoring_id(2),pg_temp.scoring_id(3),pg_temp.scoring_id(7),pg_temp.scoring_id(100+i*2-1),pg_temp.scoring_id(100+i*2),
'2026-08-10 12:00Z',case when i=2 then 'scheduled'::app.fixture_status else 'finished'::app.fixture_status end,0,0,'2026-08-10 14:00Z',10,case when i=2 then null else '2026-08-10 14:00Z'::timestamptz end from generate_series(1,3)i;
insert into app.fantasy_fixture_assignments(fantasy_season_id,fixture_id,gameweek_id,original_gameweek_id,original_kickoff_at,assigned_kickoff_at,frozen_at,source_version)
select pg_temp.scoring_id(5),pg_temp.scoring_id(3000+i),pg_temp.scoring_id(6),pg_temp.scoring_id(6),'2026-08-10 12:00Z','2026-08-10 12:00Z','2026-08-10 10:30Z',1 from generate_series(1,3)i;
insert into app.fantasy_players(id,fantasy_season_id,football_player_id,football_team_id,position_id,price)
select pg_temp.scoring_id(2000+i),pg_temp.scoring_id(5),pg_temp.scoring_id(1000+i),pg_temp.scoring_id(101+(i-1)/11),pos.id,6
from generate_series(1,66)i join app.players p on p.id=pg_temp.scoring_id(1000+i)
join app.fantasy_positions pos on pos.code=case p.position when 'goalkeeper' then 'GK' when 'defender' then 'DEF' when 'midfielder' then 'MID' else 'FWD' end;
insert into app.player_fixture_performances(football_season_id,fixture_id,player_id,team_id,position,source_provider,source_version,started,appeared,minutes,goals,assists,clean_sheets,goals_conceded,saves,penalties_saved,penalties_missed,yellow_cards,red_cards,second_yellow_dismissals,own_goals,provider_observed_at)
select pg_temp.scoring_id(3),pg_temp.scoring_id(3001+(i-1)/22),pg_temp.scoring_id(1000+i),pg_temp.scoring_id(101+(i-1)/11),p.position,'sportsmonks','sportsmonks-current-fixture:'||repeat('a',64),true,true,90,0,0,0,1,0,0,0,0,0,0,0,'2026-08-10 14:00Z'
from generate_series(1,66)i join app.players p on p.id=pg_temp.scoring_id(1000+i);
insert into app_private.historical_performance_fixture_coverage(fixture_id,football_season_id,source_provider,source_version,lineup_rows_seen,valid_player_rows,excluded_incomplete_rows,starter_rows,team_count,detail_rows,invalid_detail_rows,performance_rows,reconciled,provider_observed_at,scoring_statistics_complete)
select pg_temp.scoring_id(3000+i),pg_temp.scoring_id(3),'sportsmonks','sportsmonks-current-fixture:'||repeat('a',64),22,22,0,22,2,264,0,22,true,'2026-08-10 14:00Z',true from generate_series(1,3)i;
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.scoring_id(8),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','live-worker@example.test',statement_timestamp(),'hash','{}','{"username":"live_worker"}',statement_timestamp(),statement_timestamp());
insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,bank,team_value,free_transfers)
values(pg_temp.scoring_id(9),pg_temp.scoring_id(8),pg_temp.scoring_id(5),pg_temp.scoring_id(6),'Scoring Eleven',10,90,1);
insert into app.fantasy_lineups(id,fantasy_team_id,gameweek_id,team_version,locked_at)
values(pg_temp.scoring_id(10),pg_temp.scoring_id(9),pg_temp.scoring_id(6),1,'2026-08-10 10:30Z');
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,snapshot_price)
select pg_temp.scoring_id(10),pg_temp.scoring_id(2000+n),case when ord<=11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
case when ord<=11 then ord else ord-11 end,n=17,n=10,6
from unnest(array[1,2,24,35,46,17,28,39,50,10,32,12,57,61,43]) with ordinality as selected(n,ord);


select set_config('request.jwt.claims','{"role":"service_role"}',true);
update app.fantasy_gameweeks set status='live' where id=pg_temp.scoring_id(6);
insert into app_private.fantasy_live_scoring_policy(season_id,enabled) values(pg_temp.scoring_id(5),true);
update app_private.historical_performance_fixture_coverage set scoring_statistics_complete=false where fixture_id=pg_temp.scoring_id(3003);
select extensions.is(api.service_fantasy_lifecycle_state(pg_temp.scoring_id(6))->>'incrementalScoringEnabled','true','incremental capability is explicit');
select extensions.is(api.service_prepare_fantasy_live_scoring(pg_temp.scoring_id(6))->>'calculationVersion','1','first live snapshot gets version one');
select set_config('test.scoring_snapshot',api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),1,null,100)::text,true);
select extensions.is(jsonb_array_length(current_setting('test.scoring_snapshot')::jsonb->'fixtures'),1,'only ready fixture can award points');
select extensions.is(jsonb_array_length(current_setting('test.scoring_snapshot')::jsonb->'pendingFixtures'),2,'unplayed and missing-data fixtures stay visible');
select extensions.is(jsonb_array_length(current_setting('test.scoring_snapshot')::jsonb->'playerFixtures'),22,'no invented statistics for pending fixtures');
select extensions.is(jsonb_array_length(current_setting('test.scoring_snapshot')::jsonb->'pendingPlayerIds'),44,'pending participation retained independently of zeros');
select extensions.is(api.service_prepare_fantasy_live_scoring(pg_temp.scoring_id(6))->>'calculationVersion','1','identical retry keeps version');
select set_config('test.scoring_players',(select jsonb_agg(jsonb_build_object('fantasyPlayerId',p->>'fantasyPlayerId','fixtureId',p->>'fixtureId','events',(
 select jsonb_agg(jsonb_build_object('category',category,'points',case when category='appearance' then 2 else 0 end,'sourceKey','fixture-stats:'||(p->>'fixtureId')||':'||(p->>'playerId')||':'||category) order by category)
 from unnest(array['appearance','goal','assist','clean_sheet','goals_conceded','saves','penalty_save','penalty_miss','yellow_card','red_card','second_yellow_dismissal','own_goal']) category)))::text
 from jsonb_array_elements(current_setting('test.scoring_snapshot')::jsonb->'playerFixtures')p),true);
select set_config('test.scoring_teams',(select jsonb_build_array(jsonb_build_object('teamId',pg_temp.scoring_id(9),'lineupId',pg_temp.scoring_id(10),'startingPoints',8,'benchPoints',2,'captainPoints',2,'transferHit',0,'provisionalScore',10,'effectiveCaptainId',pg_temp.scoring_id(2017),'substitutions','[]'::jsonb,'players',jsonb_agg(jsonb_build_object('fantasyPlayerId',fantasy_player_id,'multiplier',case when slot='bench' then 0 when captain then 2 else 1 end))))::text
 from app.fantasy_lineup_players where lineup_id=pg_temp.scoring_id(10)),true);

select extensions.is(api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',current_setting('test.scoring_players')::jsonb,current_setting('test.scoring_teams')::jsonb)->>'teamsPersisted','1','ready fixture points reach team while gameweek live');
select extensions.is((select scoring_details->>'effectiveCaptainId' from app.fantasy_team_gameweek_results where fantasy_team_id=pg_temp.scoring_id(9)),pg_temp.scoring_id(2017)::text,'published captain decision is stored outside frozen lineup inputs');
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),pg_temp.scoring_id(6),null,1);
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),null,null,1);
select extensions.is((select total_points from app.fantasy_rankings where fantasy_team_id=pg_temp.scoring_id(9) and league_id is null and gameweek_id is null),10,'live points count in season rankings');
select extensions.is((select gameweek_points from app.fantasy_rankings where fantasy_team_id=pg_temp.scoring_id(9) and league_id is null and gameweek_id=pg_temp.scoring_id(6)),10,'live points count in gameweek rankings');
select extensions.is(api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',current_setting('test.scoring_players')::jsonb,current_setting('test.scoring_teams')::jsonb)->>'teamsPersisted','1','retry succeeds');
select extensions.is((select count(*)::int from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),264,'retry cannot duplicate points');
select extensions.throws_ok($$select api.service_begin_fantasy_finalization(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest')$$,'PT409','fantasy_live_scoring_pending','partial points cannot finalize gameweek');
update app.player_fixture_performances set assists=1 where player_id=pg_temp.scoring_id(1017);
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest','[]','[]')$$,'PT409','fantasy_scoring_input_changed','concurrent correction invalidates old writer');
select extensions.is(api.service_prepare_fantasy_live_scoring(pg_temp.scoring_id(6))->>'calculationVersion','2','correction selects new immutable calculation');
-- Loss of all eligible coverage must retract points, never leave stale awards.
update app_private.historical_performance_fixture_coverage set scoring_statistics_complete=false;
select api.service_prepare_fantasy_live_scoring(pg_temp.scoring_id(6));
select set_config('test.empty_snapshot',api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),2,null,100)::text,true);
select extensions.is(jsonb_array_length(current_setting('test.empty_snapshot')::jsonb->'playerFixtures'),0,'all pending fixtures produce an empty scoring set');
select extensions.lives_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),2,current_setting('test.empty_snapshot')::jsonb->>'inputDigest','[]','[]')$$,'empty scoring set can retract old points');
select extensions.is((select count(*)::int from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6) and superseded_at is null),0,'stale points retracted on lost coverage');

update app_private.historical_performance_fixture_coverage set scoring_statistics_complete=true;
update app.player_fixture_performances set assists=0 where player_id=pg_temp.scoring_id(1017);
update app.fixtures set status='finished',finalized_at='2026-08-10 14:00Z',source_sequence=11,
 provider_updated_at='2026-08-10 14:01Z' where id=pg_temp.scoring_id(3002);
update app.fantasy_gameweeks set status='provisional' where id=pg_temp.scoring_id(6);
select extensions.is(api.service_prepare_fantasy_live_scoring(pg_temp.scoring_id(6))->>'calculationVersion','3','all ready facts advance the calculation');
select set_config('test.scoring_snapshot',api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),3,null,100)::text,true);
select extensions.is(jsonb_array_length(current_setting('test.scoring_snapshot')::jsonb->'pendingFixtures'),0,'complete round has no pending fixtures');
select extensions.is(jsonb_array_length(current_setting('test.scoring_snapshot')::jsonb->'pendingPlayerIds'),0,'complete participation releases captain and bench rules');
select set_config('test.scoring_players',(select jsonb_agg(jsonb_build_object('fantasyPlayerId',p->>'fantasyPlayerId','fixtureId',p->>'fixtureId','events',(
 select jsonb_agg(jsonb_build_object('category',category,'points',case when category='appearance' then 2 else 0 end,'sourceKey','fixture-stats:'||(p->>'fixtureId')||':'||(p->>'playerId')||':'||category) order by category)
 from unnest(array['appearance','goal','assist','clean_sheet','goals_conceded','saves','penalty_save','penalty_miss','yellow_card','red_card','second_yellow_dismissal','own_goal']) category)))::text
 from jsonb_array_elements(current_setting('test.scoring_snapshot')::jsonb->'playerFixtures')p),true);
select set_config('test.scoring_teams',(select jsonb_build_array(jsonb_build_object('teamId',pg_temp.scoring_id(9),'lineupId',pg_temp.scoring_id(10),'startingPoints',22,'benchPoints',8,'captainPoints',2,'transferHit',0,'provisionalScore',24,'effectiveCaptainId',pg_temp.scoring_id(2017),'substitutions','[]'::jsonb,'players',jsonb_agg(jsonb_build_object('fantasyPlayerId',fantasy_player_id,'multiplier',case when slot='bench' then 0 when captain then 2 else 1 end))))::text
 from app.fantasy_lineup_players where lineup_id=pg_temp.scoring_id(10)),true);

select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),3,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',current_setting('test.scoring_players')::jsonb,current_setting('test.scoring_teams')::jsonb);
select extensions.is(api.service_begin_fantasy_finalization(pg_temp.scoring_id(6),3,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest')->>'sealed','true','complete round still enters normal finalization');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select extensions.throws_ok($$select api.service_prepare_fantasy_live_scoring(pg_temp.scoring_id(6))$$,'PT403','forbidden','browser cannot start scoring');
select * from extensions.finish();
rollback;
