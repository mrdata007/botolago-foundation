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

insert into app.team_memberships(player_id,team_id,season_id,valid_from)
select pg_temp.scoring_id(1000+i),pg_temp.scoring_id(101+(i-1)/11),pg_temp.scoring_id(3),'2026-08-01' from generate_series(1,66)i;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
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

create function pg_temp.adaptive_payload(fixture_number integer default 1) returns jsonb language sql as $$
 select jsonb_build_object('homeScore',0,'awayScore',0,'anonymousStarters',0,'anonymousByTeam','{}'::jsonb,
 'reason','Reviewed official match sheet','reviewer','test-reviewer','expectedDigest',null,'references',jsonb_build_array('official:match-sheet:1'),'participationComplete',true,'disciplineComplete',true,
 'players',(select jsonb_agg(jsonb_build_object('playerId',pg_temp.scoring_id(1000+i),'teamId',pg_temp.scoring_id(101+(i-1)/11),
 'started',true,'stats',jsonb_build_object('minutes',90,'goals',0,'cleanSheet',true,'goalsConceded',0,'yellowCards',0,
 'redCards',0,'secondYellowDismissals',0,'ownGoals',0,'assists',0,'saves',0,'penaltiesSaved',0,'penaltiesMissed',0),
 'evidence',(select jsonb_object_agg(field,jsonb_build_object('state','verified','source','official-match-sheet',
 'observedAt',statement_timestamp(),'references',jsonb_build_array('official:match-sheet:1'))) from unnest(array['minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals','assists','saves','penaltiesSaved','penaltiesMissed']) field))) from generate_series(1+(fixture_number-1)*22,fixture_number*22)i));
$$;

select extensions.ok(not has_function_privilege('authenticated','api.service_activate_adaptive_estimates(uuid,integer,text,boolean)','execute'),'estimate activation is service-only');
select api.service_activate_adaptive_estimates(pg_temp.scoring_id(5),1,api.service_adaptive_scoring_audit(pg_temp.scoring_id(6))->>'activationDigest');
select extensions.is(api.fantasy_rules(pg_temp.scoring_id(5))#>>'{adaptiveScoring,estimatesFinalForRankings}','true','public rules disclose final ranking estimates');
create function pg_temp.estimated_payload(n integer default 1) returns jsonb language sql as $$
 select jsonb_set(pg_temp.adaptive_payload(n),'{players,0,evidence,minutes}',jsonb_build_object('state','estimated','source','reviewed-best-available','reason','Use reported substitution minute','observedAt','2026-08-11T00:00:00Z','references',jsonb_build_array('report:match:1')))
 || '{"estimateAcceptance":{"policy":"best-available-v1","finalForRankings":true,"assumptions":["Use reported substitution minute"]}}'::jsonb;
$$;
select extensions.ok(not app_private.fantasy_field_certified(pg_temp.estimated_payload()->'players'->0,'minutes'),'estimated value is never certified');
select extensions.ok(app_private.fantasy_field_scorable(pg_temp.estimated_payload()->'players'->0,'minutes'),'reviewed core estimate is scorable');
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3001),pg_temp.estimated_payload()-'estimateAcceptance','reviewed-correction')$$,'PT400','adaptive_estimate_acceptance_required','explicit final-ranking acceptance required');
update app_private.fantasy_adaptive_policy set ruleset_id='f6200000-0000-4000-8000-000000000200';
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3001),pg_temp.estimated_payload(),'reviewed-correction')$$,'PT409','adaptive_estimates_policy_required','v2.0 never silently accepts estimates');
update app_private.fantasy_adaptive_policy set ruleset_id='f6200000-0000-4000-8000-000000000201';
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3001),jsonb_set(pg_temp.estimated_payload(),'{players,0,playerId}',to_jsonb(pg_temp.scoring_id(9999)::text)),'reviewed-correction')$$,'PT409','adaptive_player_membership_missing','estimates cannot invent identities');
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3001),pg_temp.estimated_payload()||jsonb_build_object('estimatedNonParticipants',jsonb_build_array(pg_temp.scoring_id(1001))),'reviewed-correction')$$,'PT400','adaptive_conflicting_participation','estimated absence cannot overlap an appearance');
select extensions.is(api.service_record_fantasy_observation(pg_temp.scoring_id(3001),pg_temp.estimated_payload(),'reviewed-correction')->>'simpleReady','true','accepted estimates allow simple readiness');
select extensions.is(api.service_record_fantasy_observation(pg_temp.scoring_id(3001),pg_temp.estimated_payload(),'reviewed-correction')->>'fullReady','false','accepted estimates cannot certify full');
select extensions.is((select count(*)::integer from app_private.fantasy_fixture_observations where fixture_id=pg_temp.scoring_id(3001)),1,'estimate replay is idempotent');
select api.service_record_fantasy_observation(pg_temp.scoring_id(3002),pg_temp.adaptive_payload(2),'reviewed-correction');
select api.service_record_fantasy_observation(pg_temp.scoring_id(3003),pg_temp.estimated_payload(3),'reviewed-correction');
select api.service_select_fantasy_scoring_modes(pg_temp.scoring_id(6));
select extensions.is((select mode from app_private.fantasy_fixture_scoring_modes where fixture_id=pg_temp.scoring_id(3001)),'simple','estimated fixture locks simple');
select extensions.is(app_private.fantasy_player_fixture_modes(pg_temp.scoring_id(6),pg_temp.scoring_id(2001))#>>'{0,estimated}','true','history labels estimated fixture');
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3002),pg_temp.estimated_payload(2),'reviewed-correction')$$,'PT409','adaptive_estimates_simple_only','full lock cannot downgrade to estimates');
create function pg_temp.adaptive_results(doc jsonb) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('fantasyPlayerId',p->'fantasyPlayerId','fixtureId',p->'fixtureId',
 'events',(select coalesce(jsonb_agg(jsonb_build_object('category',category,'points',case
 when category='appearance' then 2 when category='clean_sheet' then case p->>'position' when 'GK' then 4 when 'DEF' then 4 when 'MID' then 1 else 0 end else 0 end,
 'sourceKey','fixture-stats:'||(p->>'fixtureId')||':'||(p->>'playerId')||':'||category) order by category),'[]')
 from (values ('appearance',array['minutes']),('goal',array['goals']),('assist',array['assists']),
 ('clean_sheet',array['minutes','cleanSheet','goalsConceded']),('goals_conceded',array['minutes','goalsConceded']),
 ('saves',array['saves']),('penalty_save',array['penaltiesSaved']),('penalty_miss',array['penaltiesMissed']),
 ('yellow_card',array['yellowCards']),('red_card',array['redCards']),('second_yellow_dismissal',array['secondYellowDismissals']),('own_goal',array['ownGoals'])) c(category,fields)
 where not(coalesce(p->>'scoringMode','pending')='simple' and category in ('assist','saves','penalty_save','penalty_miss'))
 and not exists(select 1 from unnest(fields) field where not app_private.fantasy_field_scorable(p,field)))))
 from jsonb_array_elements(doc->'playerFixtures') p;
$$;

select set_config('test.scoring_teams',(select jsonb_build_array(jsonb_build_object('teamId',pg_temp.scoring_id(9),'lineupId',pg_temp.scoring_id(10),'startingPoints',46,'benchPoints',17,'captainPoints',3,'transferHit',0,'provisionalScore',49,'effectiveCaptainId',pg_temp.scoring_id(2017),'substitutions','[]'::jsonb,'players',jsonb_agg(jsonb_build_object('fantasyPlayerId',fantasy_player_id,'multiplier',case when slot='bench' then 0 when captain then 2 else 1 end))))::text
 from app.fantasy_lineup_players where lineup_id=pg_temp.scoring_id(10)),true);
do $$declare snap jsonb; begin
 snap:=api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),(select scoring_input_version from app.fantasy_gameweeks where id=pg_temp.scoring_id(6)));
 perform set_config('test.snapshot',snap::text,true);
 perform api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),(snap->>'calculationVersion')::bigint,snap->>'inputDigest',pg_temp.adaptive_results(snap),current_setting('test.scoring_teams')::jsonb);
 perform set_config('test.events',(select count(*)::text from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),true);
 perform api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),(snap->>'calculationVersion')::bigint,snap->>'inputDigest',pg_temp.adaptive_results(snap),current_setting('test.scoring_teams')::jsonb);
end $$;
select extensions.is((select count(*)::text from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),current_setting('test.events'),'estimated scoring retry never duplicates ledger');
select extensions.is(api.service_begin_fantasy_finalization(pg_temp.scoring_id(6),(current_setting('test.snapshot')::jsonb->>'calculationVersion')::bigint,current_setting('test.snapshot')::jsonb->>'inputDigest')->>'sealed','true','mixed full and estimated simple results pass finalization');
select api.service_finalize_fantasy_team_results(pg_temp.scoring_id(6),(current_setting('test.snapshot')::jsonb->>'calculationVersion')::bigint,null,100);
select api.service_roll_fantasy_free_transfers(pg_temp.scoring_id(6),100);
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),pg_temp.scoring_id(6),null,(current_setting('test.snapshot')::jsonb->>'calculationVersion')::bigint);
select api.service_recalculate_fantasy_rankings(pg_temp.scoring_id(5),null,null,(current_setting('test.snapshot')::jsonb->>'calculationVersion')::bigint);
select extensions.is(api.service_complete_fantasy_gameweek(pg_temp.scoring_id(6),(current_setting('test.snapshot')::jsonb->>'calculationVersion')::bigint)->>'finalized','true','normal rankings pipeline finalizes accepted estimates');
select extensions.is((select final_points from app.fantasy_player_gameweek_points where fantasy_player_id=pg_temp.scoring_id(2001) and gameweek_id=pg_temp.scoring_id(6)),6,'estimated appearance points are published final');
select extensions.is((select final_score from app.fantasy_team_gameweek_results where gameweek_id=pg_temp.scoring_id(6) and fantasy_team_id=pg_temp.scoring_id(9)),49,'mixed estimated fixtures count toward final team score');
select extensions.is((select count(*)::integer from app.fantasy_rankings where fantasy_team_id=pg_temp.scoring_id(9) and rank=1),2,'estimated results count in gameweek and season rankings');
select * from extensions.finish();
rollback;
