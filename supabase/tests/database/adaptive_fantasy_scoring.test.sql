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
select extensions.ok(not has_function_privilege('anon','api.service_record_fantasy_observation(uuid,jsonb,text)','execute'),'observations are not public');
select extensions.ok(not has_function_privilege('authenticated','api.service_activate_adaptive_scoring(uuid,integer,text,boolean)','execute'),'browser cannot activate policy');
select extensions.ok(not has_table_privilege('service_role','app_private.fantasy_fixture_scoring_modes','update'),'mode cannot be changed directly by service role');
select extensions.is((select version from app.fantasy_rulesets where ruleset_code='botolago-fantasy-v1.0'),1,'v1 remains unchanged');
select extensions.is((select version from app.fantasy_rulesets where ruleset_code='botolago-fantasy-v2.0'),2,'new immutable ruleset published');
select set_config('test.activation',api.service_adaptive_scoring_audit(pg_temp.scoring_id(6))->>'activationDigest',true);
select api.service_activate_adaptive_scoring(pg_temp.scoring_id(5),1,current_setting('test.activation'));
select extensions.ok(app_private.fantasy_adaptive_enabled(pg_temp.scoring_id(6)),'activation applies to blocked gameweek');
select extensions.is((api.fantasy_rules(pg_temp.scoring_id(5))->>'rulesetVersion')::integer,2,'public rules expose new version');
create function pg_temp.adaptive_payload(fixture_number integer default 1) returns jsonb language sql as $$
 select jsonb_build_object('homeScore',0,'awayScore',0,'anonymousStarters',0,'anonymousByTeam','{}'::jsonb,
 'reason','Reviewed official match sheet','reviewer','test-reviewer','expectedDigest',null,'references',jsonb_build_array('official:match-sheet:1'),'participationComplete',true,'disciplineComplete',true,
 'players',(select jsonb_agg(jsonb_build_object('playerId',pg_temp.scoring_id(1000+i),'teamId',pg_temp.scoring_id(101+(i-1)/11),
 'started',true,'stats',jsonb_build_object('minutes',90,'goals',0,'cleanSheet',true,'goalsConceded',0,'yellowCards',0,
 'redCards',0,'secondYellowDismissals',0,'ownGoals',0,'assists',0,'saves',0,'penaltiesSaved',0,'penaltiesMissed',0),
 'evidence',(select jsonb_object_agg(field,jsonb_build_object('state','verified','source','official-match-sheet',
 'observedAt',statement_timestamp(),'references',jsonb_build_array('official:match-sheet:1'))) from unnest(array['minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals','assists','saves','penaltiesSaved','penaltiesMissed']) field))) from generate_series(1+(fixture_number-1)*22,fixture_number*22)i));
$$;
do $$begin perform set_config('test.payload',pg_temp.adaptive_payload()::text,true); end$$;
select extensions.is(api.service_record_fantasy_observation(pg_temp.scoring_id(3001),current_setting('test.payload')::jsonb,'reviewed-correction')->>'fullReady','true','fully certified payload supports current scoring');
select extensions.is(api.service_record_fantasy_observation(pg_temp.scoring_id(3001),current_setting('test.payload')::jsonb,'reviewed-correction')->>'fullReady','true','replay accepted');
select extensions.is((select count(*)::integer from app_private.fantasy_fixture_observations where fixture_id=pg_temp.scoring_id(3001)),1,'replay does not duplicate observations');
select api.service_select_fantasy_scoring_modes(pg_temp.scoring_id(6));
select extensions.is((select mode from app_private.fantasy_fixture_scoring_modes where fixture_id=pg_temp.scoring_id(3001)),'full','overdue rollout fixture selects first deployment snapshot');
select extensions.is(api.service_record_fantasy_observation(pg_temp.scoring_id(3001),jsonb_set(current_setting('test.payload')::jsonb,'{players,0,evidence,saves,state}','"unknown"')||jsonb_build_object('expectedDigest',(select digest from app_private.fantasy_fixture_observations where fixture_id=pg_temp.scoring_id(3001) order by id desc limit 1)),'reviewed-correction')->>'fullReady','false','unknown save is not verified zero');
select api.service_select_fantasy_scoring_modes(pg_temp.scoring_id(6));
select extensions.is((select mode from app_private.fantasy_fixture_scoring_modes where fixture_id=pg_temp.scoring_id(3001)),'full','locked full mode does not downgrade');
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3001),jsonb_set(current_setting('test.payload')::jsonb,'{homeScore}','1'),'reviewed-correction')$$,'PT409','adaptive_final_score_mismatch','score mismatch rejected');
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3001),jsonb_set(current_setting('test.payload')::jsonb,'{players,0,playerId}',to_jsonb(pg_temp.scoring_id(9999)::text)),'reviewed-correction')$$,'PT409','adaptive_player_membership_missing','unknown identity is not invented');
select extensions.is(app_private.fantasy_scoring_input_document(pg_temp.scoring_id(6))->>'scoringVersion','2','worker snapshots effective version');
select extensions.throws_ok($$select api.service_begin_fantasy_finalization(pg_temp.scoring_id(6),1,repeat('a',64))$$,'PT409','adaptive_scoring_pending','incomplete fixtures cannot finalize');

select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3001),current_setting('test.payload')::jsonb||'{"reason":"Conflicting identity correction"}'::jsonb,'reviewed-correction')$$,'PT409','adaptive_correction_review_conflict','stale reviewed corrections cannot replace newer facts');
select extensions.is(api.service_record_fantasy_observation(pg_temp.scoring_id(3002),jsonb_set(pg_temp.adaptive_payload(2),'{players,0,evidence,saves,state}','"unknown"'),'reviewed-correction')->>'simpleReady','true','simple certification excludes detailed statistics');
select api.service_select_fantasy_scoring_modes(pg_temp.scoring_id(6));
select extensions.is((select mode from app_private.fantasy_fixture_scoring_modes where fixture_id=pg_temp.scoring_id(3002)),'simple','missing detail selects simple');
select extensions.is(api.service_record_fantasy_observation(pg_temp.scoring_id(3002),pg_temp.adaptive_payload(2)||jsonb_build_object('expectedDigest',(select digest from app_private.fantasy_fixture_observations where fixture_id=pg_temp.scoring_id(3002) order by id desc limit 1)),'reviewed-correction')->>'fullReady','true','late detail can repair facts');
select api.service_select_fantasy_scoring_modes(pg_temp.scoring_id(6));
select extensions.is((select mode from app_private.fantasy_fixture_scoring_modes where fixture_id=pg_temp.scoring_id(3002)),'simple','late detail never upgrades simple');
select extensions.ok(app_private.fantasy_fixture_ready(pg_temp.scoring_id(6),pg_temp.scoring_id(3002),false),'certified simple succeeds even when legacy full coverage fails');
select extensions.is(jsonb_array_length(app_private.fantasy_player_fixture_modes(pg_temp.scoring_id(6),pg_temp.scoring_id(2023))),1,'history exposes only the player fixture');
select api.service_pause_adaptive_scoring(pg_temp.scoring_id(5),true);
select extensions.throws_ok($$select api.service_select_fantasy_scoring_modes(pg_temp.scoring_id(6))$$,'PT409','adaptive_scoring_paused','rollback pause blocks new selection');
select extensions.is((select mode from app_private.fantasy_fixture_scoring_modes where fixture_id=pg_temp.scoring_id(3002)),'simple','pause preserves recorded mode');
select api.service_pause_adaptive_scoring(pg_temp.scoring_id(5),false);

select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3002),jsonb_set(jsonb_set(pg_temp.adaptive_payload(2),'{players,0,stats,secondYellowDismissals}','1'),'{players,0,stats,yellowCards}','2'),'reviewed-correction')$$,'PT409','adaptive_disciplinary_overlap_review_required','double-counted second yellows require review');
update app.fantasy_players set football_team_id=pg_temp.scoring_id(105) where id=pg_temp.scoring_id(2001);
select extensions.is((select count(*)::integer from jsonb_array_elements(app_private.fantasy_scoring_input_document(pg_temp.scoring_id(6))->'playerFixtures') p where p->>'fantasyPlayerId'=pg_temp.scoring_id(2001)::text),1,'dated membership retains the played fixture without inventing a match at the new club');
select extensions.is((select p#>>'{stats,minutes}' from jsonb_array_elements(app_private.fantasy_scoring_input_document(pg_temp.scoring_id(6))->'playerFixtures') p where p->>'fantasyPlayerId'=pg_temp.scoring_id(2001)::text),'90','transferred player keeps certified participation');
update app.fantasy_players set football_team_id=pg_temp.scoring_id(101) where id=pg_temp.scoring_id(2001);
-- Exercise the actual adaptive persistence contract with known simple facts and
-- unknown rows, then replay the same page: the ledger must not grow.
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
 and not exists(select 1 from unnest(fields) field where not app_private.fantasy_field_certified(p,field)))))
 from jsonb_array_elements(doc->'playerFixtures') p;
$$;
do $$declare snap jsonb; begin
 snap:=api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),(select scoring_input_version from app.fantasy_gameweeks where id=pg_temp.scoring_id(6)));
 perform set_config('test.snapshot',snap::text,true);
 perform api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),(snap->>'calculationVersion')::bigint,snap->>'inputDigest',pg_temp.adaptive_results(snap),'[]');
 perform set_config('test.ledger_count',(select count(*)::text from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),true);
 perform api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),(snap->>'calculationVersion')::bigint,snap->>'inputDigest',pg_temp.adaptive_results(snap),'[]');
end $$;
select extensions.is((select count(*)::text from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),current_setting('test.ledger_count'),'adaptive persistence replay never duplicates points');
select extensions.is((select count(*)::integer from app.fantasy_player_point_events where fixture_id=pg_temp.scoring_id(3002) and category in ('assist','saves','penalty_save','penalty_miss') and superseded_at is null),0,'excluded simple categories have no verified-zero ledger rows');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.scoring_id(3001),current_setting('test.payload')::jsonb,'reviewed-correction')$$,'PT403','forbidden','service boundary enforced at runtime');
select * from extensions.finish();
rollback;
