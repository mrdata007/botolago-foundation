begin;
select extensions.no_plan();
create function pg_temp.scoring_id(n integer) returns uuid language sql immutable as $$
  select ('cc000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into app.countries(id,iso_alpha2,iso_alpha3) values(pg_temp.scoring_id(1),'MA','MAR');
insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
values(pg_temp.scoring_id(2),'set-based-save-test','Scoring Worker Test','SWT','league',pg_temp.scoring_id(1));
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
values(pg_temp.scoring_id(4),pg_temp.scoring_id(2),'set-based-save-test','Scoring Worker Test',true);
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


-- A second fixture for the same 22 players catches player-only join bugs and
-- validates grouped minutes / maximum source sequence across a double gameweek.
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,home_score,away_score,provider_updated_at,source_sequence,finalized_at)
values(pg_temp.scoring_id(3004),pg_temp.scoring_id(2),pg_temp.scoring_id(3),pg_temp.scoring_id(7),pg_temp.scoring_id(101),pg_temp.scoring_id(102),'2026-08-11 12:00Z','finished',0,0,'2026-08-11 14:00Z',20,'2026-08-11 14:00Z');
insert into app.fantasy_fixture_assignments(fantasy_season_id,fixture_id,gameweek_id,original_gameweek_id,original_kickoff_at,assigned_kickoff_at,frozen_at,source_version)
values(pg_temp.scoring_id(5),pg_temp.scoring_id(3004),pg_temp.scoring_id(6),pg_temp.scoring_id(6),'2026-08-11 12:00Z','2026-08-11 12:00Z','2026-08-10 10:30Z',1);
insert into app.player_fixture_performances(football_season_id,fixture_id,player_id,team_id,position,source_provider,source_version,started,appeared,minutes,goals,assists,clean_sheets,goals_conceded,saves,penalties_saved,penalties_missed,yellow_cards,red_cards,second_yellow_dismissals,own_goals,provider_observed_at)
select football_season_id,pg_temp.scoring_id(3004),player_id,team_id,position,source_provider,source_version,started,appeared,
case when player_id=pg_temp.scoring_id(1001) then 30 else minutes end,goals,assists,clean_sheets,goals_conceded,saves,penalties_saved,penalties_missed,yellow_cards,red_cards,second_yellow_dismissals,own_goals,'2026-08-11 14:00Z'
from app.player_fixture_performances where fixture_id=pg_temp.scoring_id(3001);
insert into app_private.historical_performance_fixture_coverage(fixture_id,football_season_id,source_provider,source_version,lineup_rows_seen,valid_player_rows,excluded_incomplete_rows,starter_rows,team_count,detail_rows,invalid_detail_rows,performance_rows,reconciled,provider_observed_at,scoring_statistics_complete)
values(pg_temp.scoring_id(3004),pg_temp.scoring_id(3),'sportsmonks','sportsmonks-current-fixture:'||repeat('a',64),22,22,0,22,2,264,0,22,true,'2026-08-11 14:00Z',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.scoring_snapshot',api.service_get_fantasy_scoring_snapshot(pg_temp.scoring_id(6),1,null,100)::text,true);
select set_config('test.scoring_players',(select jsonb_agg(jsonb_build_object(
 'fantasyPlayerId',p->>'fantasyPlayerId','fixtureId',p->>'fixtureId','events',(
 select jsonb_agg(jsonb_build_object('category',category,'points',case when category='appearance' then 2 else 0 end,
 'sourceKey','fixture-stats:'||(p->>'fixtureId')||':'||(p->>'playerId')||':'||category) order by category)
 from unnest(array['appearance','goal','assist','clean_sheet','goals_conceded','saves','penalty_save','penalty_miss','yellow_card','red_card','second_yellow_dismissal','own_goal']) category)) order by p->>'fixtureId',p->>'fantasyPlayerId')::text
 from jsonb_array_elements(current_setting('test.scoring_snapshot')::jsonb->'playerFixtures') p),true);
select set_config('test.scoring_teams',(select jsonb_build_array(jsonb_build_object(
 'teamId',pg_temp.scoring_id(9),'lineupId',pg_temp.scoring_id(10),'startingPoints',30,'benchPoints',10,
 'captainPoints',4,'transferHit',0,'provisionalScore',34,'effectiveCaptainId',pg_temp.scoring_id(2017),
 'substitutions','[]'::jsonb,'players',jsonb_agg(jsonb_build_object('fantasyPlayerId',fantasy_player_id,
 'multiplier',case when slot='bench' then 0 when captain then 2 else 1 end))))::text
 from app.fantasy_lineup_players where lineup_id=pg_temp.scoring_id(10)),true);

-- Independent official keys survive and still count. This player is not in
-- the selected lineup, so the submitted team total above does not change.
insert into app.fantasy_player_point_events(fantasy_player_id,gameweek_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key)
values(pg_temp.scoring_id(2066),pg_temp.scoring_id(6),pg_temp.scoring_id(3003),'goal',7,'provisional',1,10,'official:parity');

-- Test-only, transaction-local reference: exact reviewed pre-optimization body.
create function pg_temp.persist_before(
  p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text,
  p_player_results jsonb,p_team_results jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare gw app.fantasy_gameweeks%rowtype; snapshot app_private.fantasy_scoring_snapshots%rowtype;
  input_row jsonb; result_row jsonb; event_row jsonb; team_result jsonb; substitution jsonb;
  player_count integer:=0; team_count integer:=0; lineup app.fantasy_lineups%rowtype;
  chip app.fantasy_chip_type; actual_hit integer; starting_points integer; bench_points integer;
  captain_points integer; actual_score integer; effective_captain uuid; captain_multiplier numeric;
  categories text[]:=array['appearance','goal','assist','clean_sheet','goals_conceded','saves','penalty_save','penalty_miss','yellow_card','red_card','second_yellow_dismissal','own_goal'];
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_gameweek_id is null or p_calculation_version is null or p_calculation_version<1
    or p_input_digest is null or p_input_digest!~'^[0-9a-f]{64}$'
    or jsonb_typeof(p_player_results) is distinct from 'array'
    or jsonb_typeof(p_team_results) is distinct from 'array'
    or jsonb_array_length(p_player_results)>10000 or jsonb_array_length(p_team_results)>100
    or pg_column_size(p_player_results)>16777216 or pg_column_size(p_team_results)>1048576 then
    raise exception using errcode='PT400',message='validation_failed'; end if;
  select * into gw from app.fantasy_gameweeks where id=p_gameweek_id for update;
  if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  if gw.status<>'provisional' and not (gw.status='live' and (app_private.fantasy_adaptive_enabled(gw.id) or app_private.fantasy_live_scoring_enabled(gw.id))) then raise exception using errcode='PT409',message='gameweek_not_scorable'; end if;
  snapshot:=app_private.fantasy_assert_scoring_snapshot(gw.id,p_calculation_version,p_input_digest);
  if snapshot.sealed_at is not null then raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;

  if jsonb_array_length(p_player_results)=0 and jsonb_array_length(snapshot.payload->'playerFixtures')>0 then
    if not snapshot.players_persisted then raise exception using errcode='PT409',message='fantasy_player_results_missing'; end if;
  else
    if snapshot.players_persisted and snapshot.player_results_digest is distinct from encode(extensions.digest(p_player_results::text,'sha256'),'hex') then
      raise exception using errcode='PT409',message='fantasy_scoring_replay_conflict'; end if;
    if jsonb_array_length(p_player_results)<>jsonb_array_length(snapshot.payload->'playerFixtures')
      or (select count(distinct (v->>'fantasyPlayerId',v->>'fixtureId')) from jsonb_array_elements(p_player_results) v)<>jsonb_array_length(p_player_results) then
      raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;
    for input_row in select value from jsonb_array_elements(snapshot.payload->'playerFixtures') loop
      if coalesce((snapshot.payload->>'adaptive')::boolean,false) then
        select coalesce(array_agg(category order by category),array[]::text[]) into categories
        from (values ('appearance',array['minutes']),('goal',array['goals']),('assist',array['assists']),
          ('clean_sheet',array['minutes','cleanSheet','goalsConceded']),('goals_conceded',array['minutes','goalsConceded']),
          ('saves',array['saves']),('penalty_save',array['penaltiesSaved']),('penalty_miss',array['penaltiesMissed']),
          ('yellow_card',array['yellowCards']),('red_card',array['redCards']),
          ('second_yellow_dismissal',array['secondYellowDismissals']),('own_goal',array['ownGoals'])) c(category,fields)
        where not (coalesce(input_row->>'scoringMode','pending')='simple' and category in ('assist','saves','penalty_save','penalty_miss'))
          and not exists(select 1 from unnest(fields) field where not case when input_row->>'scoringMode'='simple' then app_private.fantasy_field_scorable(input_row,field) else app_private.fantasy_field_certified(input_row,field) end);
      end if;
      select value into result_row from jsonb_array_elements(p_player_results)
      where value->>'fantasyPlayerId'=input_row->>'fantasyPlayerId' and value->>'fixtureId'=input_row->>'fixtureId';
      if not found or jsonb_typeof(result_row->'events') is distinct from 'array'
        or jsonb_array_length(result_row->'events')<>cardinality(categories)
        or (select count(distinct v->>'category') from jsonb_array_elements(result_row->'events') v)<>cardinality(categories) then
        raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;
      for event_row in select value from jsonb_array_elements(result_row->'events') loop
        if event_row->>'category' is null or not (event_row->>'category'=any(categories))
          or event_row->>'sourceKey' is distinct from ('fixture-stats:'||(input_row->>'fixtureId')||':'||(input_row->>'playerId')||':'||(event_row->>'category'))
          or jsonb_typeof(event_row->'points') is distinct from 'number'
          or (event_row->>'points')!~'^-?[0-9]+$' or (event_row->>'points')::integer not between -100 and 100 then
          raise exception using errcode='PT400',message='fantasy_point_event_invalid'; end if;
      end loop;
    end loop;
    -- Only aggregate snapshot categories are replaced. Independent official
    -- event keys remain outside this worker's namespace.
    update app.fantasy_player_point_events set superseded_at=statement_timestamp()
      where gameweek_id=gw.id and source_key like 'fixture-stats:%' and superseded_at is null;
    for input_row in select value from jsonb_array_elements(snapshot.payload->'playerFixtures') loop
      select value into result_row from jsonb_array_elements(p_player_results)
      where value->>'fantasyPlayerId'=input_row->>'fantasyPlayerId' and value->>'fixtureId'=input_row->>'fixtureId';
      for event_row in select value from jsonb_array_elements(result_row->'events') loop
        insert into app.fantasy_player_point_events(fantasy_player_id,gameweek_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key)
        values((input_row->>'fantasyPlayerId')::uuid,gw.id,(input_row->>'fixtureId')::uuid,event_row->>'category',(event_row->>'points')::integer,
          'provisional',(snapshot.payload->>'scoringVersion')::integer,(input_row->>'sourceSequence')::bigint,event_row->>'sourceKey')
        on conflict(fantasy_player_id,fixture_id,source_key,scoring_version) do update set
          points=excluded.points,state='provisional',source_sequence=excluded.source_sequence,superseded_at=null;
      end loop;
    end loop;
    insert into app.fantasy_player_gameweek_points(fantasy_player_id,gameweek_id,provisional_points,minutes_played,did_play,calculation_version,football_input_version,final_points,finalized_at)
    select (player->>'fantasyPlayerId')::uuid,gw.id,
      coalesce((select sum(e.points) from app.fantasy_player_point_events e where e.gameweek_id=gw.id and e.fantasy_player_id=(player->>'fantasyPlayerId')::uuid and e.superseded_at is null),0),
      coalesce((select sum((f#>>'{stats,minutes}')::integer) from jsonb_array_elements(snapshot.payload->'playerFixtures') f where f->>'fantasyPlayerId'=player->>'fantasyPlayerId'),0),
      exists(select 1 from jsonb_array_elements(snapshot.payload->'playerFixtures') f where f->>'fantasyPlayerId'=player->>'fantasyPlayerId' and (f#>>'{stats,minutes}')::integer>0),
      p_calculation_version,coalesce((select max((f->>'sourceSequence')::bigint) from jsonb_array_elements(snapshot.payload->'playerFixtures') f where f->>'fantasyPlayerId'=player->>'fantasyPlayerId'),0),null,null
    from jsonb_array_elements(snapshot.payload->'players') player
    on conflict(fantasy_player_id,gameweek_id) do update set provisional_points=excluded.provisional_points,
      minutes_played=excluded.minutes_played,did_play=excluded.did_play,calculation_version=excluded.calculation_version,
      football_input_version=excluded.football_input_version,final_points=null,finalized_at=null;
    get diagnostics player_count=row_count;
    update app_private.fantasy_scoring_snapshots set players_persisted=true,player_results_digest=encode(extensions.digest(p_player_results::text,'sha256'),'hex') where gameweek_id=gw.id and calculation_version=p_calculation_version;
  end if;

  if (select count(distinct v->>'teamId') from jsonb_array_elements(p_team_results) v)<>jsonb_array_length(p_team_results) then
    raise exception using errcode='PT400',message='fantasy_team_result_scope_invalid'; end if;
  for team_result in select value from jsonb_array_elements(p_team_results) loop
    select * into lineup from app.fantasy_lineups l where l.id=(team_result->>'lineupId')::uuid
      and l.fantasy_team_id=(team_result->>'teamId')::uuid and l.gameweek_id=gw.id and l.locked_at is not null for update;
    if not found or jsonb_typeof(team_result->'players') is distinct from 'array'
      or jsonb_typeof(team_result->'substitutions') is distinct from 'array'
      or jsonb_array_length(team_result->'players')<>(snapshot.payload#>>'{ruleset,squad_size}')::integer
      or jsonb_array_length(team_result->'substitutions')>4
      or (select count(distinct v->>'fantasyPlayerId') from jsonb_array_elements(team_result->'players') v)<>jsonb_array_length(team_result->'players')
      or exists(select 1 from app.fantasy_lineup_players lp where lp.lineup_id=lineup.id and not exists(select 1 from jsonb_array_elements(team_result->'players') v where v->>'fantasyPlayerId'=lp.fantasy_player_id::text)) then
      raise exception using errcode='PT400',message='fantasy_team_result_scope_invalid'; end if;
    if exists(select 1 from app.fantasy_lineup_players lp left join app.fantasy_player_gameweek_points pp on pp.gameweek_id=gw.id and pp.fantasy_player_id=lp.fantasy_player_id
      where lp.lineup_id=lineup.id and pp.calculation_version is distinct from p_calculation_version) then
      raise exception using errcode='PT409',message='fantasy_player_results_missing'; end if;
    select c.chip_type into chip from app.fantasy_chip_uses c where c.fantasy_team_id=lineup.fantasy_team_id and c.gameweek_id=gw.id and c.cancelled_at is null;
    select coalesce(sum(b.point_hit),0) into actual_hit from app.fantasy_transfer_batches b where b.fantasy_team_id=lineup.fantasy_team_id and b.gameweek_id=gw.id and b.status='confirmed';
    select lp.fantasy_player_id into effective_captain from app.fantasy_lineup_players lp join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id
      where lp.lineup_id=lineup.id and (lp.captain or lp.vice_captain) and pp.did_play order by lp.captain desc limit 1;
    if exists(select 1 from app.fantasy_lineup_players lp where lp.lineup_id=lineup.id
       and coalesce(snapshot.payload->'pendingPlayerIds','[]'::jsonb) ? lp.fantasy_player_id::text) then
      select lp.fantasy_player_id into effective_captain from app.fantasy_lineup_players lp
      join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id
      where lp.lineup_id=lineup.id and lp.captain and pp.did_play;
      if jsonb_array_length(team_result->'substitutions')<>0 then
        raise exception using errcode='PT409',message='fantasy_participation_pending'; end if;
    end if;
    if team_result->>'effectiveCaptainId' is distinct from effective_captain::text then
      raise exception using errcode='PT400',message='fantasy_captain_result_invalid'; end if;
    captain_multiplier:=case when chip='triple_captain' then (snapshot.payload#>>'{ruleset,triple_captain_multiplier}')::numeric else (snapshot.payload#>>'{ruleset,captain_multiplier}')::numeric end;
    if (chip='bench_boost' and jsonb_array_length(team_result->'substitutions')<>0)
      or (select count(distinct v->>'playerOutId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions')
      or (select count(distinct v->>'playerInId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions') then
      raise exception using errcode='PT400',message='fantasy_substitution_invalid'; end if;
    for substitution in select value from jsonb_array_elements(team_result->'substitutions') loop
      if not exists(select 1 from app.fantasy_lineup_players outgoing
        join app.fantasy_player_gameweek_points po on po.fantasy_player_id=outgoing.fantasy_player_id and po.gameweek_id=gw.id
        join app.fantasy_players fo on fo.id=outgoing.fantasy_player_id join app.fantasy_positions opo on opo.id=fo.position_id
        cross join app.fantasy_lineup_players incoming
        join app.fantasy_player_gameweek_points pi on pi.fantasy_player_id=incoming.fantasy_player_id and pi.gameweek_id=gw.id
        join app.fantasy_players fi on fi.id=incoming.fantasy_player_id join app.fantasy_positions ip on ip.id=fi.position_id
        where outgoing.lineup_id=lineup.id and incoming.lineup_id=lineup.id
          and outgoing.fantasy_player_id::text=substitution->>'playerOutId' and incoming.fantasy_player_id::text=substitution->>'playerInId'
          and outgoing.slot='starter' and incoming.slot='bench' and not po.did_play and pi.did_play
          and ((opo.code='GK')=(ip.code='GK'))
          and substitution->>'reason'=case when opo.code='GK' then 'goalkeeper_did_not_play' else 'outfield_did_not_play' end) then
        raise exception using errcode='PT400',message='fantasy_substitution_invalid'; end if;
    end loop;
    if chip is distinct from 'bench_boost' and exists(
      select 1 from jsonb_array_elements(snapshot.payload->'positionRules') rule
      cross join lateral (select count(*) as n from app.fantasy_lineup_players lp
        join app.fantasy_players fp on fp.id=lp.fantasy_player_id
        join app.fantasy_positions pos on pos.id=fp.position_id
        where lp.lineup_id=lineup.id and pos.code=rule->>'code' and (
          (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
          or exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text))) formation
      where formation.n<(rule->>'starting_minimum')::integer or formation.n>(rule->>'starting_maximum')::integer) then
      raise exception using errcode='PT400',message='fantasy_substitution_formation_invalid'; end if;
    -- Every multiplier is derived from frozen membership, substitution and the
    -- authoritative effective captain. Submitted totals are checked, not trusted.
    if exists(select 1 from jsonb_array_elements(team_result->'players') v
      left join app.fantasy_lineup_players lp on lp.lineup_id=lineup.id and lp.fantasy_player_id::text=v->>'fantasyPlayerId'
      where lp.fantasy_player_id is null or jsonb_typeof(v->'multiplier') is distinct from 'number'
        or (v->>'multiplier')::numeric is distinct from case
          when chip='bench_boost' or (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
            or exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text)
          then case when lp.fantasy_player_id=effective_captain then captain_multiplier else 1 end else 0 end) then
      raise exception using errcode='PT400',message='fantasy_multiplier_invalid'; end if;
    select coalesce(sum(pp.provisional_points) filter(where
      (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
      or exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text)),0),
      coalesce(sum(pp.provisional_points) filter(where lp.slot='bench' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text)),0),
      coalesce(sum(pp.provisional_points*(captain_multiplier-1)) filter(where lp.fantasy_player_id=effective_captain),0)
      into starting_points,bench_points,captain_points
      from app.fantasy_lineup_players lp join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id where lp.lineup_id=lineup.id;
    actual_score:=starting_points+case when chip='bench_boost' then bench_points else 0 end+captain_points-actual_hit;
    if (team_result->>'startingPoints')::integer is distinct from starting_points
      or (team_result->>'benchPoints')::integer is distinct from bench_points
      or (team_result->>'captainPoints')::integer is distinct from captain_points
      or (team_result->>'transferHit')::integer is distinct from actual_hit
      or (team_result->>'provisionalScore')::integer is distinct from actual_score then
      raise exception using errcode='PT400',message='fantasy_team_total_invalid'; end if;
    delete from app.fantasy_auto_substitutions where lineup_id=lineup.id;
    insert into app.fantasy_auto_substitutions(lineup_id,player_out_id,player_in_id,sequence_number,reason,calculation_version)
      select lineup.id,(s->>'playerOutId')::uuid,(s->>'playerInId')::uuid,ordinality::integer,s->>'reason',p_calculation_version
      from jsonb_array_elements(team_result->'substitutions') with ordinality as substitutions(s,ordinality);
    insert into app.fantasy_team_gameweek_results(fantasy_team_id,gameweek_id,starting_points,bench_points,captain_points,transfer_hit,chip_type,provisional_score,calculation_version,scoring_details)
      values(lineup.fantasy_team_id,gw.id,starting_points,bench_points,captain_points,actual_hit,chip,actual_score,p_calculation_version,team_result)
      on conflict(fantasy_team_id,gameweek_id) do update set starting_points=excluded.starting_points,bench_points=excluded.bench_points,
        captain_points=excluded.captain_points,transfer_hit=excluded.transfer_hit,chip_type=excluded.chip_type,
        provisional_score=excluded.provisional_score,calculation_version=excluded.calculation_version,scoring_details=excluded.scoring_details
      where app.fantasy_team_gameweek_results.state='provisional';
    if not found then raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;
    team_count:=team_count+1;
  end loop;
  return jsonb_build_object('playersPersisted',player_count,'teamsPersisted',team_count,'inputDigest',snapshot.input_digest,'calculationVersion',p_calculation_version);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='PT400',message='validation_failed';
end;
$$;

-- Each probe rolls back its writes in a subtransaction, so old and new see
-- identical initial state. Return values survive the deliberate rollback.
create function pg_temp.save_outcome(use_before boolean, player_results jsonb, team_results jsonb)
returns jsonb language plpgsql as $probe$
declare result jsonb; observed_state jsonb; code text; reason text;
begin
  begin
    if use_before then
      result:=pg_temp.persist_before(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',player_results,team_results);
    else
      result:=api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',player_results,team_results);
    end if;
    observed_state:=jsonb_build_object('result',result,
      'events',(select jsonb_agg(jsonb_build_array(fantasy_player_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key,superseded_at is not null) order by fantasy_player_id,fixture_id,source_key)
        from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),
      'points',(select jsonb_agg(jsonb_build_array(fantasy_player_id,provisional_points,minutes_played,did_play,calculation_version,football_input_version,final_points,finalized_at) order by fantasy_player_id)
        from app.fantasy_player_gameweek_points where gameweek_id=pg_temp.scoring_id(6)),
      'teams',(select jsonb_agg(to_jsonb(t)-'id'-'created_at'-'updated_at' order by fantasy_team_id)
        from app.fantasy_team_gameweek_results t where gameweek_id=pg_temp.scoring_id(6)),
      'substitutions',(select jsonb_agg(to_jsonb(s)-'id'-'created_at' order by sequence_number)
        from app.fantasy_auto_substitutions s where lineup_id=pg_temp.scoring_id(10)),
      'snapshot',(select jsonb_build_array(players_persisted,player_results_digest)
        from app_private.fantasy_scoring_snapshots where gameweek_id=pg_temp.scoring_id(6) and calculation_version=1));
    raise exception using errcode='PT999',message='probe_rollback';
  exception
    when sqlstate 'PT999' then null;
    when others then
      get stacked diagnostics code=returned_sqlstate,reason=message_text;
      observed_state:=jsonb_build_object('error',code,'reason',reason);
  end;
  return observed_state;
end $probe$;

select extensions.is(pg_temp.save_outcome(false,current_setting('test.scoring_players')::jsonb,current_setting('test.scoring_teams')::jsonb),
 pg_temp.save_outcome(true,current_setting('test.scoring_players')::jsonb,current_setting('test.scoring_teams')::jsonb),
 'new save exactly matches old events, aggregates, team decision and snapshot state');
select extensions.is(pg_temp.save_outcome(false,(select jsonb_agg(v order by ord desc) from jsonb_array_elements(current_setting('test.scoring_players')::jsonb) with ordinality x(v,ord)),current_setting('test.scoring_teams')::jsonb),
 pg_temp.save_outcome(true,(select jsonb_agg(v order by ord desc) from jsonb_array_elements(current_setting('test.scoring_players')::jsonb) with ordinality x(v,ord)),current_setting('test.scoring_teams')::jsonb),
 'result order does not change matching, including two fixtures for one player');
select extensions.is(pg_temp.save_outcome(false,jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,fixtureId}',to_jsonb(pg_temp.scoring_id(9999)::text)),'[]'),
 pg_temp.save_outcome(true,jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,fixtureId}',to_jsonb(pg_temp.scoring_id(9999)::text)),'[]'),
 'foreign fixture preserves the exact scope error');
select extensions.is(pg_temp.save_outcome(false,jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,events,0,sourceKey}','"wrong"'),'[]'),
 pg_temp.save_outcome(true,jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,events,0,sourceKey}','"wrong"'),'[]'),
 'bad source key preserves the exact event error');
select extensions.is(pg_temp.save_outcome(false,jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,events,0,points}','101'),'[]'),
 pg_temp.save_outcome(true,jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,events,0,points}','101'),'[]'),
 'out-of-range points preserve the exact event error');
select extensions.is(pg_temp.save_outcome(false,jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,events,0,points}','1.5'),'[]'),
 pg_temp.save_outcome(true,jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,events,0,points}','1.5'),'[]'),
 'fractional points preserve the exact event error');
select extensions.is(pg_temp.save_outcome(false,'[]','[]'),pg_temp.save_outcome(true,'[]','[]'),
 'missing initial player results preserve the exact replay guard');
select extensions.is(pg_temp.save_outcome(false,current_setting('test.scoring_players')::jsonb,
 jsonb_set(current_setting('test.scoring_teams')::jsonb,'{0,provisionalScore}','999')),
 pg_temp.save_outcome(true,current_setting('test.scoring_players')::jsonb,
 jsonb_set(current_setting('test.scoring_teams')::jsonb,'{0,provisionalScore}','999')),
 'invalid team totals still roll back all point writes with the same error');

select extensions.lives_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',current_setting('test.scoring_players')::jsonb,current_setting('test.scoring_teams')::jsonb)$$,
 'new bulk save succeeds under the actual snapshot and team guards');
select extensions.is((select minutes_played from app.fantasy_player_gameweek_points where fantasy_player_id=pg_temp.scoring_id(2001) and gameweek_id=pg_temp.scoring_id(6)),120,'minutes summed across two fixtures');
select extensions.is((select football_input_version from app.fantasy_player_gameweek_points where fantasy_player_id=pg_temp.scoring_id(2001) and gameweek_id=pg_temp.scoring_id(6)),20::bigint,'maximum source sequence retained');
select extensions.is((select provisional_points from app.fantasy_player_gameweek_points where fantasy_player_id=pg_temp.scoring_id(2066) and gameweek_id=pg_temp.scoring_id(6)),9,'official points remain in the aggregate');
select extensions.is((select superseded_at is null from app.fantasy_player_point_events where source_key='official:parity'),true,'official event is not superseded');
select extensions.lives_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',current_setting('test.scoring_players')::jsonb,current_setting('test.scoring_teams')::jsonb)$$,'identical retry succeeds');
select extensions.is((select count(*)::integer from app.fantasy_player_point_events where gameweek_id=pg_temp.scoring_id(6)),1057,'retry cannot duplicate point events');
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest',jsonb_set(current_setting('test.scoring_players')::jsonb,'{0,events,0,points}','1'),'[]')$$,
 'PT409','fantasy_scoring_replay_conflict','changed retry preserves its conflict guard');
select extensions.lives_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest','[]',current_setting('test.scoring_teams')::jsonb)$$,'later team page can reuse already persisted player results');
select extensions.ok(not has_function_privilege('anon','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute'),'anonymous execute remains revoked');
select extensions.ok(not has_function_privilege('authenticated','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute'),'browser execute remains revoked');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select extensions.throws_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.scoring_id(6),1,current_setting('test.scoring_snapshot')::jsonb->>'inputDigest','[]','[]')$$,'PT403','forbidden','runtime service-role guard is unchanged');
select * from extensions.finish();
rollback;
