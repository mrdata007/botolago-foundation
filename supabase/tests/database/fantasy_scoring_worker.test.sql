begin;
select extensions.no_plan();
create function pg_temp.scoring_id(n integer) returns uuid language sql immutable as $$
  select ('ca000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into app.countries(id,iso_alpha2,iso_alpha3) values(pg_temp.scoring_id(1),'MA','MAR');
insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
values(pg_temp.scoring_id(2),'scoring-worker-test','Scoring Worker Test','SWT','league',pg_temp.scoring_id(1));
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
values(pg_temp.scoring_id(4),pg_temp.scoring_id(2),'scoring-worker-test','Scoring Worker Test',true);
insert into app.fantasy_seasons(id,fantasy_competition_id,football_season_id,ruleset_id,name,status,starts_at,ends_at)
values(pg_temp.scoring_id(5),pg_temp.scoring_id(4),pg_temp.scoring_id(3),'f6100000-0000-4000-8000-000000000100','2026/2027','active','2026-08-01','2027-06-30');
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
values(pg_temp.scoring_id(6),pg_temp.scoring_id(5),pg_temp.scoring_id(7),1,'GW1','2026-08-10 10:30Z','2026-08-10 12:00Z','2026-08-12 12:00Z','provisional');
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,home_score,away_score,provider_updated_at,source_sequence,finalized_at)
select pg_temp.scoring_id(3000+i),pg_temp.scoring_id(2),pg_temp.scoring_id(3),pg_temp.scoring_id(7),pg_temp.scoring_id(100+i*2-1),pg_temp.scoring_id(100+i*2),
'2026-08-10 12:00Z','finished',0,0,'2026-08-10 14:00Z',10,'2026-08-10 14:00Z' from generate_series(1,3)i;
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
values(pg_temp.scoring_id(8),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','scoring-worker@example.test',statement_timestamp(),'hash','{}','{"username":"scoring_worker"}',statement_timestamp(),statement_timestamp());
insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,bank,team_value,free_transfers)
values(pg_temp.scoring_id(9),pg_temp.scoring_id(8),pg_temp.scoring_id(5),pg_temp.scoring_id(6),'Scoring Eleven',10,90,1);
insert into app.fantasy_lineups(id,fantasy_team_id,gameweek_id,team_version,locked_at)
values(pg_temp.scoring_id(10),pg_temp.scoring_id(9),pg_temp.scoring_id(6),1,'2026-08-10 10:30Z');
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,snapshot_price)
select pg_temp.scoring_id(10),pg_temp.scoring_id(2000+n),case when ord<=11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
case when ord<=11 then ord else ord-11 end,n=17,n=10,6
from unnest(array[1,2,24,35,46,17,28,39,50,10,32,12,57,61,43]) with ordinality as selected(n,ord);

select extensions.ok(not has_function_privilege('authenticated','api.service_get_fantasy_scoring_snapshot(uuid,bigint,uuid,integer)','execute'),'browser cannot read private scoring inputs');
select extensions.ok(not has_function_privilege('anon','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute'),'anonymous callers cannot persist points');
select extensions.ok(not has_table_privilege('service_role','app_private.fantasy_scoring_snapshots','insert'),'worker cannot bypass snapshot RPC via direct table grants');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select extensions.throws_ok($$select api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),1,null,1)$$,'PT403','forbidden','runtime service-role guard rejects a forged browser call');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.scoring_snapshot',api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),1,null,1)::text,true);
select extensions.is(jsonb_array_length(current_setting('test.scoring_snapshot')::jsonb->'playerFixtures'),66,'coherent snapshot contains all reconciled player/fixture inputs');
select extensions.is(jsonb_array_length(current_setting('test.scoring_snapshot')::jsonb->'teams'),1,'team page contains frozen lineup without profile PII');
select extensions.is(api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),1,null,1)->>'inputDigest',current_setting('test.scoring_snapshot')::jsonb->>'inputDigest','same input version has stable digest');
-- Even a snapshot created earlier cannot award points if a score changes or
-- if it lacked a scorer: the existing-snapshot assertion rechecks totals.
update app.fixtures set home_score=1 where id=pg_temp.scoring_id(3001);
select extensions.throws_ok(
  $$select api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),1,null,1)$$,
  'PT409', 'fantasy_goal_totals_mismatch', 'a previously created snapshot cannot bypass reconciliation'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),
  0, 'a mismatched fixture awarded no points'
);
update app.fixtures set home_score=0 where id=pg_temp.scoring_id(3001);
select extensions.throws_ok($$select api.service_begin_fantasy_finalization(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest')$$,'PT409','fantasy_scoring_results_incomplete','cannot finalize before calculating actual points and teams');
select set_config('test.scoring_players',(select jsonb_agg(jsonb_build_object('fantasyPlayerId',p->>'fantasyPlayerId','fixtureId',p->>'fixtureId','events',(
 select jsonb_agg(jsonb_build_object('category',category,'points',case when category='appearance' then 2 else 0 end,'sourceKey','fixture-stats:'||(p->>'fixtureId')||':'||(p->>'playerId')||':'||category) order by category)
 from unnest(array['appearance','goal','assist','clean_sheet','goals_conceded','saves','penalty_save','penalty_miss','yellow_card','red_card','second_yellow_dismissal','own_goal']) category)))::text
 from jsonb_array_elements(current_setting('test.scoring_snapshot')::jsonb->'playerFixtures')p),true);
select set_config('test.scoring_teams',(select jsonb_build_array(jsonb_build_object('teamId',pg_temp.scoring_id(9),'lineupId',pg_temp.scoring_id(10),'startingPoints',22,'benchPoints',8,'captainPoints',2,'transferHit',0,'provisionalScore',24,'effectiveCaptainId',pg_temp.scoring_id(2017),'substitutions','[]'::jsonb,'players',jsonb_agg(jsonb_build_object('fantasyPlayerId',fantasy_player_id,'multiplier',case when slot='bench' then 0 when captain then 2 else 1 end))))::text
 from app.fantasy_lineup_players where lineup_id=pg_temp.scoring_id(10)),true);
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,fixtureId}',to_jsonb(pg_temp.scoring_id(9999)::text)),current_setting('test.scoring_teams')::jsonb)$$,'PT400','fantasy_player_result_scope_invalid','a foreign fixture cannot enter the scoped scoring batch');
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',current_setting('test.scoring_players')::jsonb,jsonb_set(current_setting('test.scoring_teams')::jsonb,'{0,provisionalScore}','999'))$$,'PT400','fantasy_team_total_invalid','submitted fake total is rejected atomically');
select extensions.is((select count(*)::integer from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),0,'rejected team page rolls back its player-event writes');
select extensions.is(api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',current_setting('test.scoring_players')::jsonb,current_setting('test.scoring_teams')::jsonb)->>'teamsPersisted','1','real point totals and frozen team page persist atomically');
select extensions.is((select provisional_score from app.fantasy_team_gameweek_results where gameweek_id=pg_temp.scoring_id(6)),24,'11 starters plus captain bonus produce correct score');
select extensions.is(api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest','[]',current_setting('test.scoring_teams')::jsonb)->>'playersPersisted','0','later team pages reuse previously verified player calculation');
select extensions.is((select count(*)::integer from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),792,'replayed page does not duplicate complete category snapshots');
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,events,0,points}','99'),current_setting('test.scoring_teams')::jsonb)$$,'PT409','fantasy_scoring_replay_conflict','same calculation cannot be replayed with different player outputs');
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,repeat('b',64),'[]',current_setting('test.scoring_teams')::jsonb)$$,'PT409','fantasy_scoring_snapshot_missing','mismatched input digest cannot write results');

-- A source correction invalidates the old snapshot even with unchanged fixture sequence.
update app.player_fixture_performances set assists=1 where player_id=pg_temp.scoring_id(1017);
select extensions.throws_ok($$select api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),1,null,1)$$,'PT409','fantasy_scoring_input_changed','football correction cannot reuse stale calculation version');
update app.player_fixture_performances set assists=0 where player_id=pg_temp.scoring_id(1017);
update app_private.historical_performance_fixture_coverage set scoring_statistics_complete=false where fixture_id=pg_temp.scoring_id(3001);
select extensions.throws_ok($$select api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),2,null,1)$$,'PT409','fantasy_scoring_coverage_incomplete','legacy or missing-statistics coverage never certifies scoring');
update app_private.historical_performance_fixture_coverage set scoring_statistics_complete=true where fixture_id=pg_temp.scoring_id(3001);
select set_config('test.scoring_snapshot',api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),2,null,1)::text,true);
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,repeat('a',64),'[]','[]')$$,'PT409','fantasy_scoring_snapshot_missing','old worker cannot write after newer snapshot exists');
select extensions.is(api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),2,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',current_setting('test.scoring_players')::jsonb,current_setting('test.scoring_teams')::jsonb)->>'teamsPersisted','1','fresh calculation replaces previous provisional results');
select extensions.is(api.service_begin_fantasy_finalization(pg_temp.scoring_id(6),2,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest')->>'sealed','true','complete calculated results can be sealed');
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),2,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest','[]',current_setting('test.scoring_teams')::jsonb)$$,'PT409','gameweek_not_scorable','sealed finalization prevents scoring rewrites');
-- Reobserving identical facts advances anti-stale watermarks, not scoring inputs.
update app.player_fixture_performances set provider_observed_at='2026-08-10 14:10Z' where football_season_id=pg_temp.scoring_id(3);
update app_private.historical_performance_fixture_coverage set provider_observed_at='2026-08-10 14:10Z' where football_season_id=pg_temp.scoring_id(3);
select extensions.is(api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),2,null,1)->>'inputDigest',current_setting('test.scoring_snapshot')::jsonb->>'inputDigest','identical provider observation preserves sealed semantic input digest');
select extensions.is(api.service_finalize_fantasy_team_results(pg_temp.scoring_id(6),2,null,1)->>'finalized','1','hardened finalizer accepts sealed calculated result');
select extensions.throws_ok($$select api.service_complete_fantasy_gameweek(pg_temp.scoring_id(6),2)$$,'PT409','fantasy_rollover_incomplete','completion waits for transfer rollovers and authoritative rankings');
select api.service_roll_fantasy_free_transfers(pg_temp.scoring_id(6),100);
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),pg_temp.scoring_id(6),null,2);
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),null,null,2);
update app.fantasy_rankings set calculated_at=(select sealed_at - interval '1 second' from app_private.fantasy_scoring_snapshots where gameweek_id=pg_temp.scoring_id(6) and calculation_version=2)
where fantasy_season_id=pg_temp.scoring_id(5) and league_id is null;
select extensions.throws_ok($$select api.service_complete_fantasy_gameweek(pg_temp.scoring_id(6),2)$$,'PT409','fantasy_rankings_incomplete','matching calculation version cannot reuse rankings calculated before the seal');
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),pg_temp.scoring_id(6),null,2);
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),null,null,2);
insert into app.fantasy_leagues(id,fantasy_season_id,owner_user_id,name,visibility,active,member_count)
values(pg_temp.scoring_id(4010),pg_temp.scoring_id(5),pg_temp.scoring_id(8),'Scoring Test League','public',true,1);
insert into app.fantasy_league_memberships(league_id,fantasy_team_id,user_id,role,status)
values(pg_temp.scoring_id(4010),pg_temp.scoring_id(9),pg_temp.scoring_id(8),'owner','active');
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),pg_temp.scoring_id(6),pg_temp.scoring_id(4010),2);
select extensions.throws_ok($$select api.service_complete_fantasy_gameweek(pg_temp.scoring_id(6),2)$$,'PT409','fantasy_rankings_incomplete','active league also requires both gameweek and season rankings');
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),null,pg_temp.scoring_id(4010),2);
select extensions.is(api.service_complete_fantasy_gameweek(pg_temp.scoring_id(6),2)->>'finalized','true','only complete scoring, rollover and ranking pipeline marks gameweek final');
select extensions.is(api.service_complete_fantasy_gameweek(pg_temp.scoring_id(6),2)->>'stableResult','true','completion retry is a no-op');
select extensions.is((select count(*)::integer from app.fantasy_player_gameweek_points where gameweek_id=pg_temp.scoring_id(6) and final_points=2 and finalized_at is not null),66,'finalization publishes final player points for every verified player');
select extensions.is((select count(*)::integer from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6) and state='final' and superseded_at is null),792,'finalization marks active explanatory point events final');
select * from extensions.finish();
rollback;
