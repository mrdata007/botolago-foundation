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

-- A reviewed observation of fixture n (players 1-22 or 23-44, all starting, 90 minutes), each
-- player carrying `rating` from p_ratings (by player number; absent means 6.6, JSON null means
-- no rating). Fixture 2 records player 45 as a verified non-participant.
create function pg_temp.payload(n integer, p_ratings jsonb default '{}', p_expected text default null) returns jsonb language sql as $$
 select jsonb_build_object('homeScore',0,'awayScore',0,'anonymousStarters',0,'anonymousByTeam','{}'::jsonb,
 'reason','Reviewed official match sheet','reviewer','test-reviewer','expectedDigest',p_expected,
 'references',jsonb_build_array('official:match-sheet:'||n),'participationComplete',true,'disciplineComplete',true,
 'verifiedNonParticipants',case when n=2 then jsonb_build_array(pg_temp.rid(1045)) else '[]'::jsonb end,
 'players',(select jsonb_agg(jsonb_build_object('playerId',pg_temp.rid(1000+i),'teamId',pg_temp.rid(101+(i-1)/11),
 'started',true,'stats',jsonb_build_object('minutes',90,'goals',0,'cleanSheet',true,'goalsConceded',0,'yellowCards',0,
 'redCards',0,'secondYellowDismissals',0,'ownGoals',0,'assists',0,'saves',0,'penaltiesSaved',0,'penaltiesMissed',0),
 'evidence',(select jsonb_object_agg(field,jsonb_build_object('state','verified','source','official-match-sheet',
 'observedAt',statement_timestamp(),'references',jsonb_build_array('official:match-sheet:'||n))) from unnest(array['minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals','assists','saves','penaltiesSaved','penaltiesMissed']) field))
 ||case when n=2 then jsonb_build_object('rating',case when p_ratings ? i::text then p_ratings->(i::text) else '6.6'::jsonb end) else '{}'::jsonb end
 order by i) from generate_series(1+(n-1)*22,n*22) i));
$$;
-- The v1/v2 results the adaptive scorer would send (as adaptive_reviewed_estimates.test.sql).
create function pg_temp.category_results(doc jsonb) returns jsonb language sql as $$
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
-- The rating results the worker sends: one `rating` event for an appearance, none otherwise.
create function pg_temp.rating_results(doc jsonb) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('fantasyPlayerId',p->'fantasyPlayerId','fixtureId',p->'fixtureId',
 'events',case when (p#>>'{stats,minutes}')::integer>0 then jsonb_build_array(jsonb_build_object('category','rating',
   'points',case when jsonb_typeof(p->'rating')='number' then floor((p->>'rating')::numeric+0.5)::integer else 5 end,
   'sourceKey','fixture-stats:'||(p->>'fixtureId')||':'||(p->>'playerId')||':rating')) else '[]'::jsonb end))
 from jsonb_array_elements(doc->'playerFixtures') p;
$$;

-- ---------------------------------------------------------------------------
-- Off by default, owner-only, adaptive scoring under it.
-- ---------------------------------------------------------------------------
select extensions.is((select count(*)::integer from app_private.fantasy_rating_policy),0,'no season has the rating rule after the migration');
select extensions.is((select ruleset_code||'/'||version||'.'||minor_version||'/'||active from app.fantasy_rulesets where id='f6200000-0000-4000-8000-000000000300'),
  'botolago-fantasy-v3.0/3.0/false','ruleset v3.0 is seeded, inactive');
select extensions.is((select count(*)::integer from app.fantasy_scoring_rules where ruleset_id='f6200000-0000-4000-8000-000000000300'),0,'ruleset v3.0 has no category scoring rows');
select extensions.is((select count(*)::integer from app.fantasy_position_rules where ruleset_id='f6200000-0000-4000-8000-000000000300'),4,'ruleset v3.0 keeps the four position rules (formations)');
select extensions.ok(not has_function_privilege('service_role','app_private.fantasy_rating_points_configure(uuid,boolean,integer)','execute')
  and not has_function_privilege('authenticated','app_private.fantasy_rating_points_configure(uuid,boolean,integer)','execute'),
  'only the owner (postgres) can switch the rule');
select extensions.throws_ok($$select app_private.fantasy_rating_points_configure(pg_temp.rid(5),true,5)$$,'PT409','fantasy_rating_prerequisites_missing',
  'the rule needs adaptive scoring for the season');
select api.service_activate_adaptive_estimates(pg_temp.rid(5),4,api.service_adaptive_scoring_audit(pg_temp.rid(24))->>'activationDigest');
select extensions.ok(not app_private.fantasy_rating_scoring_enabled(pg_temp.rid(25)),'GW5 is not under the rule while it is off');
select extensions.ok(api.fantasy_rules(pg_temp.rid(5))->'ratingScoring' is null,'the rules say nothing about the rating while it is off');

-- Observations: a rating outside 0..10 or with more than two decimals is refused.
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.rid(3002),pg_temp.payload(2,'{"24":7.555}'),'reviewed-correction')$$,
  'PT400','fantasy_observation_rating_invalid','a rating with three decimals is refused');
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.rid(3002),pg_temp.payload(2,'{"24":10.5}'),'reviewed-correction')$$,
  'PT400','fantasy_observation_rating_invalid','a rating above 10 is refused');
select extensions.throws_ok($$select api.service_record_fantasy_observation(pg_temp.rid(3002),pg_temp.payload(2,'{"24":"7.5"}'),'reviewed-correction')$$,
  'PT400','fantasy_observation_rating_invalid','a rating that is not a number is refused');
select api.service_record_fantasy_observation(pg_temp.rid(3001),pg_temp.payload(1),'reviewed-correction');
select api.service_record_fantasy_observation(pg_temp.rid(3002),pg_temp.payload(2,
  '{"23":7.5,"24":7.49,"25":null,"26":6.5,"27":6.0,"28":8.26,"29":7.0,"30":9.5,"31":6.8,"32":7.2,"33":5.55,"34":6.1,"35":6.3,"43":7.7}'),
  'reviewed-correction');
select extensions.is((select count(*)::integer from app_private.fantasy_fixture_observations where fixture_id=pg_temp.rid(3002)),1,
  'an observation with valid ratings (and a null one) is recorded');

-- ---------------------------------------------------------------------------
-- Switching on: refused once GW5 is locked; the document of GW4 never moves.
-- ---------------------------------------------------------------------------
update app.fantasy_gameweeks set status='locked' where id=pg_temp.rid(25);
select extensions.throws_ok($$select app_private.fantasy_rating_points_configure(pg_temp.rid(5),true,5)$$,'PT409','fantasy_rating_gameweek_started',
  'the rule cannot start at a locked gameweek');
update app.fantasy_gameweeks set status='scheduled' where id=pg_temp.rid(25);
update app.fantasy_gameweeks set status='live' where id=pg_temp.rid(26);
select extensions.throws_ok($$select app_private.fantasy_rating_points_configure(pg_temp.rid(5),true,5)$$,'PT409','fantasy_rating_gameweek_started',
  'nor while a later gameweek has started');
update app.fantasy_gameweeks set status='scheduled' where id=pg_temp.rid(26);
update app.fantasy_gameweeks set status='open' where id=pg_temp.rid(25);
select extensions.throws_ok($$select app_private.fantasy_rating_points_configure(pg_temp.rid(5),true,9)$$,'PT404','fantasy_gameweek_not_found',
  'the first gameweek must exist');
select set_config('test.gw4_before',app_private.fantasy_scoring_input_document(pg_temp.rid(24))::text,true);
select extensions.is(app_private.fantasy_scoring_input_document(pg_temp.rid(25))->>'scoringVersion','2','GW5 is a v2 gameweek before the switch');
select extensions.is(app_private.fantasy_rating_points_configure(pg_temp.rid(5),true,5)->>'changed','true','the rule switches on from GW5 while GW5 is open');
select extensions.is(app_private.fantasy_rating_points_configure(pg_temp.rid(5),true,5)->>'changed','false','switching on again is a no-op');
select extensions.throws_ok($$select app_private.fantasy_rating_points_configure(pg_temp.rid(5),true,6)$$,'PT409','fantasy_rating_policy_immutable',
  'the first gameweek cannot be moved while on');
select extensions.is(app_private.fantasy_scoring_input_document(pg_temp.rid(24))::text,current_setting('test.gw4_before'),
  'the document of GW4 is byte for byte the one it was');
select extensions.ok(not app_private.fantasy_rating_scoring_enabled(pg_temp.rid(24)) and app_private.fantasy_rating_scoring_enabled(pg_temp.rid(25))
  and app_private.fantasy_rating_scoring_enabled(pg_temp.rid(26)),'the rule covers GW5 and later, not GW4');
select extensions.is(api.fantasy_rules(pg_temp.rid(5))->'ratingScoring','{"fromGameweek": 5, "noRatingPoints": null, "waitForRating": true}'::jsonb,'the rules say from which gameweek');

-- ---------------------------------------------------------------------------
-- GW5 scored under the rule.
-- ---------------------------------------------------------------------------
insert into app.fantasy_lineups(id,fantasy_team_id,gameweek_id,team_version,locked_at)
values(pg_temp.rid(30),pg_temp.rid(9),pg_temp.rid(25),1,'2026-08-17 10:30Z');
-- Starters: GK 23, DEF 24-27, MID 28-30, FWD 32, 33 and 45 (who does not play). Bench: GK 34,
-- then 31 (MID), 35 (DEF), 43 (FWD). Captain 28, vice-captain 29.
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,snapshot_price)
select pg_temp.rid(30),pg_temp.rid(2000+n),case when ord<=11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
  case when ord<=11 then ord else ord-11 end,n=28,n=29,6
from unnest(array[23,24,25,26,27,28,29,30,32,33,45,34,31,35,43]) with ordinality as selected(n,ord);
update app.fantasy_gameweeks set status='provisional' where id=pg_temp.rid(25);
select api.service_select_fantasy_scoring_modes(pg_temp.rid(25));
select set_config('test.doc5',app_private.fantasy_scoring_input_document(pg_temp.rid(25))::text,true);
select extensions.is(current_setting('test.doc5')::jsonb->>'scoringVersion','3','the GW5 document is scoring version 3');
select extensions.is(current_setting('test.doc5')::jsonb#>>'{ruleset,id}','f6200000-0000-4000-8000-000000000300','the GW5 document carries ruleset v3.0');
select extensions.is(current_setting('test.doc5')::jsonb#>>'{ruleset,version}','3','ruleset version 3');
select extensions.is((select p->'rating' from jsonb_array_elements(current_setting('test.doc5')::jsonb->'playerFixtures') p where p->>'playerId'=pg_temp.rid(1024)::text),
  '7.49'::jsonb,'a player carries his SofaScore rating');
select extensions.is((select p->'rating' from jsonb_array_elements(current_setting('test.doc5')::jsonb->'playerFixtures') p where p->>'playerId'=pg_temp.rid(1025)::text),
  'null'::jsonb,'a player SofaScore did not rate carries null');
select extensions.is((select (p#>>'{stats,minutes}')||'/'||(p->'rating')::text from jsonb_array_elements(current_setting('test.doc5')::jsonb->'playerFixtures') p
  where p->>'playerId'=pg_temp.rid(1045)::text),'0/null','a player who did not appear has 0 minutes and no rating');

select set_config('test.teams5',(select jsonb_build_array(jsonb_build_object('teamId',pg_temp.rid(9),'lineupId',pg_temp.rid(30),
  'startingPoints',78,'benchPoints',20,'captainPoints',8,'transferHit',0,'provisionalScore',86,'effectiveCaptainId',pg_temp.rid(2028),
  'substitutions',jsonb_build_array(jsonb_build_object('playerOutId',pg_temp.rid(2045),'playerInId',pg_temp.rid(2031),'reason','outfield_did_not_play')),
  'players',jsonb_agg(jsonb_build_object('fantasyPlayerId',lp.fantasy_player_id,'multiplier',
    case when lp.fantasy_player_id=pg_temp.rid(2045) then 0 when lp.fantasy_player_id=pg_temp.rid(2031) then 1
         when lp.slot='bench' then 0 when lp.captain then 2 else 1 end))))::text
  from app.fantasy_lineup_players lp where lp.lineup_id=pg_temp.rid(30)),true);
do $$declare snap jsonb; begin
 snap:=api.service_get_fantasy_scoring_snapshot(pg_temp.rid(25),(select greatest(scoring_input_version,1) from app.fantasy_gameweeks where id=pg_temp.rid(25)));
 perform set_config('test.snap5',snap::text,true);
end $$;
select extensions.is(current_setting('test.snap5')::jsonb->>'scoringVersion','3','the GW5 snapshot is scoring version 3');
create function pg_temp.persist5(p_results jsonb, p_teams jsonb default '[]') returns jsonb language sql as $$
 select api.service_persist_fantasy_scoring_results(pg_temp.rid(25),(current_setting('test.snap5')::jsonb->>'calculationVersion')::bigint,
   current_setting('test.snap5')::jsonb->>'inputDigest',p_results,p_teams);
$$;
-- The old worker supplies five points for a null rating. The database must
-- reject that entire write, including team totals, before any points persist.
select extensions.throws_ok($$select pg_temp.persist5(pg_temp.rating_results(current_setting('test.snap5')::jsonb),
  current_setting('test.teams5')::jsonb)$$,'PT409','fantasy_ratings_pending',
  'an unrated appearance waits even when an older worker supplies five points');
select extensions.is((select count(*)::integer from app.fantasy_player_point_events where gameweek_id=pg_temp.rid(25)),0,
  'pending ratings wrote no player events');
select extensions.is((select count(*)::integer from app.fantasy_team_gameweek_results where gameweek_id=pg_temp.rid(25)),0,
  'pending ratings wrote no team results or substitutions');
-- The provider subsequently supplies a genuine rating of 5 for player 25.
select api.service_record_fantasy_observation(pg_temp.rid(3002),pg_temp.payload(2,
  '{"23":7.5,"24":7.49,"25":5,"26":6.5,"27":6.0,"28":8.26,"29":7.0,"30":9.5,"31":6.8,"32":7.2,"33":5.55,"34":6.1,"35":6.3,"43":7.7}',
  (select digest from app_private.fantasy_fixture_observations where fixture_id=pg_temp.rid(3002) order by observed_at desc,id desc limit 1)),
  'reviewed-correction');
do $$declare snap jsonb; begin
 snap:=api.service_get_fantasy_scoring_snapshot(pg_temp.rid(25),(select greatest(scoring_input_version,1) from app.fantasy_gameweeks where id=pg_temp.rid(25)));
 perform set_config('test.snap5',snap::text,true);
end $$;
-- Refusals first (each rolls back on its own).
select extensions.throws_ok($$select pg_temp.persist5(pg_temp.category_results(current_setting('test.snap5')::jsonb))$$,
  'PT400','fantasy_player_result_scope_invalid','category events are refused in a rating gameweek');
select extensions.throws_ok($$select pg_temp.persist5((select jsonb_agg(case when r->>'fantasyPlayerId'=pg_temp.rid(2024)::text
    then jsonb_set(r,'{events,0,points}','8') else r end) from jsonb_array_elements(pg_temp.rating_results(current_setting('test.snap5')::jsonb)) r))$$,
  'PT400','fantasy_point_event_invalid','7.49 is 7 points, not 8: the save recomputes the rounding');
select extensions.throws_ok($$select pg_temp.persist5((select jsonb_agg(case when r->>'fantasyPlayerId'=pg_temp.rid(2025)::text
    then jsonb_set(r,'{events,0,points}','0') else r end) from jsonb_array_elements(pg_temp.rating_results(current_setting('test.snap5')::jsonb)) r))$$,
  'PT400','fantasy_point_event_invalid','an actual rating of 5 is five points, not zero');
select extensions.throws_ok($$select pg_temp.persist5((select jsonb_agg(case when r->>'fantasyPlayerId'=pg_temp.rid(2045)::text
    then jsonb_set(r,'{events}',jsonb_build_array(jsonb_build_object('category','rating','points',5,'sourceKey','fixture-stats:'||(r->>'fixtureId')||':'||pg_temp.rid(1045)||':rating')))
    else r end) from jsonb_array_elements(pg_temp.rating_results(current_setting('test.snap5')::jsonb)) r))$$,
  'PT400','fantasy_player_result_scope_invalid','a player who did not appear gets no event');
select extensions.throws_ok($$select pg_temp.persist5((select jsonb_agg(case when r->>'fantasyPlayerId'=pg_temp.rid(2023)::text
    then jsonb_set(r,'{events,0,sourceKey}','"fixture-stats:x:y:rating"') else r end) from jsonb_array_elements(pg_temp.rating_results(current_setting('test.snap5')::jsonb)) r))$$,
  'PT400','fantasy_point_event_invalid','the rating event keeps the fixture-stats source key');
select extensions.is(pg_temp.persist5(pg_temp.rating_results(current_setting('test.snap5')::jsonb),current_setting('test.teams5')::jsonb)->>'teamsPersisted','1',
  'the rating results and the team total are saved');
select extensions.is((select string_agg(fp.football_player_id::text||'='||pp.provisional_points,',' order by fp.football_player_id)
  from app.fantasy_player_gameweek_points pp join app.fantasy_players fp on fp.id=pp.fantasy_player_id
  where pp.gameweek_id=pg_temp.rid(25) and fp.football_player_id in (pg_temp.rid(1023),pg_temp.rid(1024),pg_temp.rid(1025),pg_temp.rid(1026),pg_temp.rid(1028),pg_temp.rid(1030),pg_temp.rid(1033),pg_temp.rid(1045))),
  pg_temp.rid(1023)||'=8,'||pg_temp.rid(1024)||'=7,'||pg_temp.rid(1025)||'=5,'||pg_temp.rid(1026)||'=7,'||pg_temp.rid(1028)||'=8,'||pg_temp.rid(1030)||'=10,'||pg_temp.rid(1033)||'=6,'||pg_temp.rid(1045)||'=0',
  '7.5 -> 8, 7.49 -> 7, actual rating 5 -> 5, 6.5 -> 7, 8.26 -> 8, 9.5 -> 10, 5.55 -> 6, did not play -> 0');
select extensions.is((select string_agg(distinct category||'@'||scoring_version,',') from app.fantasy_player_point_events
  where gameweek_id=pg_temp.rid(25) and superseded_at is null),'rating@3','GW5 writes only rating events, scoring version 3');
select extensions.is((select provisional_score from app.fantasy_team_gameweek_results where gameweek_id=pg_temp.rid(25) and fantasy_team_id=pg_temp.rid(9)),86,
  'team total: captain doubled, the absent starter replaced from the bench');
select extensions.is((select player_out_id||'>'||player_in_id from app.fantasy_auto_substitutions where lineup_id=pg_temp.rid(30)),
  pg_temp.rid(2045)||'>'||pg_temp.rid(2031),'the automatic substitution is recorded as before');

-- A corrected rating is a new observation, so a new document digest (a rescore).
select set_config('test.digest5',encode(extensions.digest(app_private.fantasy_scoring_input_document(pg_temp.rid(25))::text,'sha256'),'hex'),true);
select api.service_record_fantasy_observation(pg_temp.rid(3002),pg_temp.payload(2,
  '{"23":7.5,"24":7.6,"25":5,"26":6.5,"27":6.0,"28":8.26,"29":7.0,"30":9.5,"31":6.8,"32":7.2,"33":5.55,"34":6.1,"35":6.3,"43":7.7}',
  (select digest from app_private.fantasy_fixture_observations where fixture_id=pg_temp.rid(3002) order by observed_at desc,id desc limit 1)),
  'reviewed-correction');
select extensions.is((select count(*)::integer from app_private.fantasy_fixture_observations where fixture_id=pg_temp.rid(3002)),3,
  'a rating-only correction records a new observation');
select extensions.isnt(encode(extensions.digest(app_private.fantasy_scoring_input_document(pg_temp.rid(25))::text,'sha256'),'hex'),current_setting('test.digest5'),
  'and changes the document digest, so the next pass rescores');
select extensions.is((select p->'rating' from jsonb_array_elements(app_private.fantasy_scoring_input_document(pg_temp.rid(25))->'playerFixtures') p
  where p->>'playerId'=pg_temp.rid(1024)::text),'7.6'::jsonb,'the document carries the corrected rating');

-- ---------------------------------------------------------------------------
-- The v2 gameweek (GW4) still refuses `rating`.
-- ---------------------------------------------------------------------------
select api.service_select_fantasy_scoring_modes(pg_temp.rid(24));
do $$declare snap jsonb; begin
 snap:=api.service_get_fantasy_scoring_snapshot(pg_temp.rid(24),(select greatest(scoring_input_version,1) from app.fantasy_gameweeks where id=pg_temp.rid(24)));
 perform set_config('test.snap4',snap::text,true);
end $$;
select extensions.is(current_setting('test.snap4')::jsonb->>'scoringVersion','2','the GW4 snapshot is scoring version 2');
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.rid(24),(current_setting('test.snap4')::jsonb->>'calculationVersion')::bigint,
  current_setting('test.snap4')::jsonb->>'inputDigest',pg_temp.rating_results(current_setting('test.snap4')::jsonb),'[]')$$,
  'PT400','fantasy_player_result_scope_invalid','rating results are refused for a v2 snapshot');
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.rid(24),(current_setting('test.snap4')::jsonb->>'calculationVersion')::bigint,
  current_setting('test.snap4')::jsonb->>'inputDigest',(select jsonb_agg(jsonb_set(jsonb_set(r,'{events,0,category}','"rating"'),'{events,0,sourceKey}',
    to_jsonb(replace(r#>>'{events,0,sourceKey}',':'||(r#>>'{events,0,category}'),':rating'))))
    from jsonb_array_elements(pg_temp.category_results(current_setting('test.snap4')::jsonb)) r),'[]')$$,
  'PT400','fantasy_point_event_invalid','a rating event in place of a v2 category is refused');
select extensions.is(api.service_persist_fantasy_scoring_results(pg_temp.rid(24),(current_setting('test.snap4')::jsonb->>'calculationVersion')::bigint,
  current_setting('test.snap4')::jsonb->>'inputDigest',pg_temp.category_results(current_setting('test.snap4')::jsonb),'[]')->>'playersPersisted','45',
  'the v2 category results of GW4 are still saved as before');

-- ---------------------------------------------------------------------------
-- Switching off: the emergency way back before GW5 finalizes, never after.
-- ---------------------------------------------------------------------------
update app.fantasy_gameweeks set status='finalizing' where id=pg_temp.rid(25);
select extensions.throws_ok($$select app_private.fantasy_rating_points_configure(pg_temp.rid(5),false,5)$$,'PT409','fantasy_rating_finalized_history_protected',
  'the rule cannot be switched off once a gameweek under it is finalizing');
update app.fantasy_gameweeks set status='provisional' where id=pg_temp.rid(25);
select extensions.is(app_private.fantasy_rating_points_configure(pg_temp.rid(5),false,5)->>'enabled','false','the rule switches off before GW5 finalizes');
select extensions.is(app_private.fantasy_scoring_input_document(pg_temp.rid(25))->>'scoringVersion','2','GW5 is a v2 gameweek again');
select extensions.throws_ok($$select app_private.fantasy_rating_points_configure(pg_temp.rid(5),true,5)$$,'PT409','fantasy_rating_gameweek_started',
  'and it cannot be switched back on for a gameweek already played');
select * from extensions.finish();
rollback;
