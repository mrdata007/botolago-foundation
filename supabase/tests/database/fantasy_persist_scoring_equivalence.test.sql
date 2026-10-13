-- Differential proof for 20261013180000_fast_fantasy_points_save: the rewritten
-- api.service_persist_fantasy_scoring_results does exactly what the previous body
-- (20260927140000) did, only faster.
--
-- The previous body is kept below as pg_temp.legacy_persist (a copy of the function text of
-- 20260927140000, renamed; it disappears with the transaction). Both bodies run, step by step,
-- from identical rows, and the test compares every row each one writes
-- (fantasy_player_point_events, fantasy_player_gameweek_points, fantasy_scoring_snapshots,
-- fantasy_auto_substitutions, fantasy_team_gameweek_results; ids and clocks left out) and every
-- result or error (SQLSTATE and message). Each run is rolled back so the next starts from the
-- same rows.
--
-- app_private.fantasy_assert_scoring_snapshot is replaced inside this transaction by a version
-- that only checks the stored row: the real one recomputes the provider document, which a
-- synthetic snapshot cannot match. Everything else is the real code, and the real path is
-- covered by fantasy_scoring_worker, fantasy_incremental_points, adaptive_fantasy_scoring,
-- adaptive_reviewed_estimates and sofascore_staged_stats.
--
-- Worlds: 1 and 2 are full gameweeks (440 player-fixtures, 400 players, 120 lineups with chips,
-- hits, captains, auto-substitutions; world 2 with adaptive per-row category sets). Worlds 3 and
-- 4 are small and carry the edge matrix: malformed results, two failures at once (the earliest
-- snapshot row wins), out-of-range numbers, replays, newer calculations, sealed state, wrong team
-- pages, pending players, and snapshot shapes the builder does not produce.
begin;
select extensions.no_plan();
-- ===== the previous body, renamed =====
create or replace function pg_temp.legacy_persist(
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

-- ===== world generator =====
-- Ids carry the world number in their first group so several generated worlds can share a database.
create function pg_temp.sid(n bigint) returns uuid language sql stable as $$
  select ('c'||coalesce(nullif(current_setting('eq.world',true),''),'1')||'000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.h(a text, m integer) returns integer language sql immutable as $$
  select (abs(hashtext(a)) % m)::integer;
$$;

-- p_nfix fixtures per leg (two legs), 2*p_nfix clubs, p_ppt fantasy players a club,
-- p_nteams locked fantasy lineups with chips, captains and transfer hits.
create function pg_temp.gen_world(p_world integer, p_nfix integer, p_ppt integer, p_nteams integer) returns void language plpgsql as $$
declare nclubs integer:=2*p_nfix; wk integer;
begin
  perform set_config('eq.world',p_world::text,true);
  drop table if exists pg_temp.eq_players, pg_temp.eq_pp, pg_temp.eq_cases, pg_temp.eq_ctx;
  insert into app.countries(id,iso_alpha2,iso_alpha3) values('c0000000-0000-4000-8000-000000000001','MA','MAR') on conflict (id) do nothing;
  insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
  values(pg_temp.sid(2),'equivalence-test-'||p_world,'Equivalence Test '||p_world,'EQ'||p_world,'league','c0000000-0000-4000-8000-000000000001');
  insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
  values(pg_temp.sid(3),pg_temp.sid(2),'2026/2027','2026-08-01','2027-06-30','active',true);
  insert into app.rounds(id,season_id,round_number,name,status)
  values(pg_temp.sid(7),pg_temp.sid(3),1,'Round 1','completed');
  insert into app.teams(id,slug,name,short_name,code,country_id)
  select pg_temp.sid(100000+c),'eq'||p_world||'-club-'||c,'EQ Club '||c,'E'||c,'E'||p_world||c,'c0000000-0000-4000-8000-000000000001' from generate_series(1,nclubs) c;
  create temporary table eq_players(idx integer primary key, club integer, k integer, pos text, fpid uuid, ppid uuid) on commit drop;
  insert into eq_players
  select (c-1)*p_ppt+k, c, k,
    case when (k-1)::numeric/p_ppt<0.12 then 'GK' when (k-1)::numeric/p_ppt<0.44 then 'DEF'
         when (k-1)::numeric/p_ppt<0.76 then 'MID' else 'FWD' end,
    pg_temp.sid(300000+(c-1)*p_ppt+k), pg_temp.sid(200000+(c-1)*p_ppt+k)
  from generate_series(1,nclubs) c, generate_series(1,p_ppt) k;
  insert into app.players(id,slug,full_name,display_name,position)
  select ppid,'eq'||p_world||'-player-'||idx,'EQ Player '||idx,'EP'||idx,
    case pos when 'GK' then 'goalkeeper'::app.football_position when 'DEF' then 'defender'::app.football_position
      when 'MID' then 'midfielder'::app.football_position else 'forward'::app.football_position end
  from eq_players;
  insert into app.fantasy_competitions(id,football_competition_id,slug,name,active)
  values(pg_temp.sid(4),pg_temp.sid(2),'equivalence-test-'||p_world,'Equivalence Test '||p_world,true);
  insert into app.fantasy_seasons(id,fantasy_competition_id,football_season_id,ruleset_id,name,status,starts_at,ends_at)
  values(pg_temp.sid(5),pg_temp.sid(4),pg_temp.sid(3),'f6100000-0000-4000-8000-000000000100','2026/2027','active','2026-08-01','2027-06-30');
  -- First leg: clubs (2i-1, 2i). Second leg: clubs (2i, 2i+1), the last one (2n, 1).
  insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,home_score,away_score,provider_updated_at,source_sequence,finalized_at)
  select pg_temp.sid(400000+i),pg_temp.sid(2),pg_temp.sid(3),pg_temp.sid(7),pg_temp.sid(100000+2*i-1),pg_temp.sid(100000+2*i),
    '2026-08-10 12:00Z','finished',0,0,'2026-08-10 14:00Z',10,'2026-08-10 14:00Z' from generate_series(1,p_nfix) i;
  insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,home_score,away_score,provider_updated_at,source_sequence,finalized_at)
  select pg_temp.sid(400000+p_nfix+i),pg_temp.sid(2),pg_temp.sid(3),pg_temp.sid(7),pg_temp.sid(100000+2*i),
    pg_temp.sid(100000+case when i=p_nfix then 1 else 2*i+1 end),
    '2026-08-11 12:00Z','finished',0,0,'2026-08-11 14:00Z',10,'2026-08-11 14:00Z' from generate_series(1,p_nfix) i;
  insert into app.fantasy_players(id,fantasy_season_id,football_player_id,football_team_id,position_id,price)
  select e.fpid,pg_temp.sid(5),e.ppid,pg_temp.sid(100000+e.club),pos.id,6 from eq_players e join app.fantasy_positions pos on pos.code=e.pos;
  -- Three finished gameweeks before this one, as production has: the planner's statistics come from them.
  insert into app.rounds(id,season_id,round_number,name,status)
  select pg_temp.sid(7000+i),pg_temp.sid(3),1+i,'Round '||(1+i),'completed' from generate_series(1,3) i;
  insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
  select pg_temp.sid(6000+i),pg_temp.sid(5),pg_temp.sid(7000+i),1+i,'GW'||(1+i),
    '2026-08-10 10:30Z'::timestamptz+i*interval '7 days','2026-08-10 12:00Z'::timestamptz+i*interval '7 days','2026-08-12 12:00Z'::timestamptz+i*interval '7 days','scheduled'
  from generate_series(1,3) i;
  for wk in 1..3 loop
    update app.fantasy_gameweeks set status='live' where id=pg_temp.sid(6000+wk);
    update app.fantasy_gameweeks set status='finalized',finalized_at=statement_timestamp(),points_state='final' where id=pg_temp.sid(6000+wk);
  end loop;
  insert into app.fantasy_player_gameweek_points(fantasy_player_id,gameweek_id,provisional_points,final_points,minutes_played,did_play,calculation_version,football_input_version,finalized_at)
  select e.fpid,pg_temp.sid(6000+i),3,3,90,true,1,1,statement_timestamp() from eq_players e, generate_series(1,3) i;
  insert into app.fantasy_player_point_events(fantasy_player_id,gameweek_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key)
  select e.fpid,pg_temp.sid(6000+i),pg_temp.sid(400000+((e.club+1)/2)),c.category,1,'final',1,5,'fixture-stats:prior'||i||':'||e.idx||':'||c.category
  from eq_players e, generate_series(1,3) i, (values ('appearance'),('goal'),('assist'),('clean_sheet')) c(category);
  insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
  values(pg_temp.sid(6),pg_temp.sid(5),pg_temp.sid(7),1,'GW1','2026-08-10 10:30Z','2026-08-10 12:00Z','2026-08-12 12:00Z','provisional');
  insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  select pg_temp.sid(500000+t),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','eq'||p_world||'-'||t||'@example.test',statement_timestamp(),'hash','{}',
    jsonb_build_object('username','eq_user_'||p_world||'_'||t),statement_timestamp(),statement_timestamp() from generate_series(1,p_nteams) t;
  insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,bank,team_value,free_transfers)
  select pg_temp.sid(600000+t),pg_temp.sid(500000+t),pg_temp.sid(5),pg_temp.sid(6),'EQ Team '||t,10,90,1 from generate_series(1,p_nteams) t;
  insert into app.fantasy_lineups(id,fantasy_team_id,gameweek_id,team_version,locked_at)
  select pg_temp.sid(700000+t),pg_temp.sid(600000+t),pg_temp.sid(6),1,'2026-08-10 10:30Z' from generate_series(1,p_nteams) t;
  -- Squads: 2 GK, 5 DEF, 5 MID, 3 FWD; formations rotate; the bench is the rest.
  insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,snapshot_price)
  with form(f,d,m,fw) as (values (0,4,4,2),(1,3,5,2),(2,4,3,3),(3,5,3,2),(4,3,4,3)),
  ranked as (
    select t.t, e.fpid, e.pos, row_number() over (partition by t.t, e.pos order by md5(t.t||':'||e.idx)) rn
    from generate_series(1,p_nteams) t(t) cross join eq_players e),
  squad as (
    select r.*, fo.d, fo.m, fo.fw,
      (r.pos='GK' and r.rn=1) or (r.pos='DEF' and r.rn<=fo.d) or (r.pos='MID' and r.rn<=fo.m) or (r.pos='FWD' and r.rn<=fo.fw) as starter,
      case r.pos when 'GK' then 1 when 'DEF' then 2 when 'MID' then 3 else 4 end as po
    from ranked r join form fo on fo.f=r.t%5
    where (r.pos='GK' and r.rn<=2) or (r.pos='DEF' and r.rn<=5) or (r.pos='MID' and r.rn<=5) or (r.pos='FWD' and r.rn<=3))
  select pg_temp.sid(700000+s.t),s.fpid,
    case when s.starter then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
    row_number() over (partition by s.t, s.starter order by s.po, s.rn)::integer,
    s.starter and s.pos='FWD' and s.rn=1,
    s.starter and s.pos='MID' and s.rn=1, 6
  from squad s;
  insert into app.fantasy_chip_uses(fantasy_team_id,gameweek_id,chip_type,activation_idempotency_key)
  select pg_temp.sid(600000+t),pg_temp.sid(6),
    case when t%7=0 then 'bench_boost'::app.fantasy_chip_type else 'triple_captain'::app.fantasy_chip_type end,
    pg_temp.sid(800000+t)
  from generate_series(1,p_nteams) t where t%7=0 or t%11=0;
  insert into app.fantasy_transfer_batches(fantasy_team_id,gameweek_id,idempotency_key,base_team_version,resulting_team_version,transfers_count,free_transfers_before,free_transfers_used,point_hit,bank_before,bank_after,status)
  select pg_temp.sid(600000+t),pg_temp.sid(6),pg_temp.sid(900000+t),1,2,2,1,1,4,1,1,'confirmed' from generate_series(1,p_nteams) t where t%5=0;
  -- A reversed batch never counts as a hit.
  insert into app.fantasy_transfer_batches(fantasy_team_id,gameweek_id,idempotency_key,base_team_version,resulting_team_version,transfers_count,free_transfers_before,free_transfers_used,point_hit,bank_before,bank_after,status)
  select pg_temp.sid(600000+t),pg_temp.sid(6),pg_temp.sid(950000+t),2,3,3,0,0,12,1,1,'reversed_by_correction' from generate_series(1,p_nteams) t where t%13=0;
  -- Events from other namespaces (official feeds): never superseded by this worker, summed into points.
  insert into app.fantasy_player_point_events(fantasy_player_id,gameweek_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key)
  select e.fpid,pg_temp.sid(6),pg_temp.sid(400000+((e.club+1)/2)),'bonus',2,'provisional',1,5,'official-feed:bonus:'||e.idx
  from eq_players e where e.idx%37=0;
  -- Superseded and stale events from an earlier calculation (version 2 keys, no longer current).
  insert into app.fantasy_player_point_events(fantasy_player_id,gameweek_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key,superseded_at)
  select e.fpid,pg_temp.sid(6),pg_temp.sid(400000+((e.club+1)/2)),'appearance',9,'provisional',2,5,'fixture-stats:old:'||e.idx,'2026-08-10 13:00Z'
  from eq_players e where e.idx%41=0;
  insert into app.fantasy_player_point_events(fantasy_player_id,gameweek_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key)
  select e.fpid,pg_temp.sid(6),pg_temp.sid(400000+((e.club+1)/2)),'appearance',7,'provisional',2,5,'fixture-stats:stale:'||e.idx
  from eq_players e where e.idx%43=0;
end $$;

-- ===== synthetic snapshot payload (same keys as app_private.fantasy_scoring_input_document) =====
create function pg_temp.eq_evidence(p_state text) returns jsonb language sql immutable as $$
  select case p_state
    when 'verified' then '{"state":"verified","source":"official-match-sheet","observedAt":"2026-10-12T14:00:00+00:00","references":["official:match-sheet:1"]}'::jsonb
    when 'estimated' then '{"state":"estimated","source":"reviewed-best-available","observedAt":"2026-10-12T14:00:00+00:00","references":["official:match-sheet:1"],"reason":"Reviewed estimate from the match sheet"}'::jsonb
    else '{"state":"unknown"}'::jsonb end;
$$;

-- p_adaptive: adaptive rows carry scoringMode and per-field evidence; p_variant changes numbers and drops rows.
create function pg_temp.make_payload(p_adaptive boolean, p_variant integer) returns jsonb language plpgsql as $$
declare nfix integer:=(select count(*)/2 from app.fixtures where competition_id=pg_temp.sid(2));
  rows_json jsonb;
begin
  with fx as (
    select e.idx, e.fpid, e.ppid, e.pos, e.club, 1 as leg,
      pg_temp.sid(400000+(e.club+1)/2) as fixture_id, 400000+(e.club+1)/2 as fixno
    from eq_players e
    union all
    select e.idx, e.fpid, e.ppid, e.pos, e.club, 2,
      pg_temp.sid(400000+nfix+case when e.club%2=0 then e.club/2 when e.club=1 then nfix else (e.club-1)/2 end),
      400000+nfix+case when e.club%2=0 then e.club/2 when e.club=1 then nfix else (e.club-1)/2 end
    from eq_players e where e.idx%10=0),
  kept as (
    select * from fx where not (p_variant>=2 and pg_temp.h(idx||'/'||leg||'/drop',20)=0)),
  st as (
    select k.*,
      case when pg_temp.h(idx||'/'||leg||'/min/'||p_variant,100)<8 then 0
           when pg_temp.h(idx||'/'||leg||'/min/'||p_variant,100)<22 then 1+pg_temp.h(idx||'/'||leg||'/min2',89)
           else 90 end as minutes,
      pg_temp.h(idx||'/'||leg||'/st/'||p_variant,1000) as r
    from kept k),
  stats as (
    select s.*,
      case when minutes>0 and r%100<10 then 1+r%2 else 0 end as goals,
      case when minutes>0 and (r/10)%100<12 then 1 else 0 end as assists,
      minutes>=60 and r%3=0 as clean_sheet,
      r%4 as conceded,
      case when pos='GK' then r%6 else 0 end as saves,
      case when pos='GK' and r%50=0 then 1 else 0 end as pen_saved,
      case when r%97=0 then 1 else 0 end as pen_missed,
      case when r%7=0 then 1 else 0 end as yellow,
      case when r%101=0 then 1 else 0 end as red,
      case when r%211=0 then 1 else 0 end as second_yellow,
      case when r%89=0 then 1 else 0 end as own_goals,
      pg_temp.h(idx||'/'||leg||'/mode/'||p_variant,100) as mode_roll
    from st s)
  select coalesce(jsonb_agg(
    jsonb_build_object('stats',jsonb_build_object('bonus',0,'goals',goals,'saves',saves,'assists',assists,'minutes',minutes,
        'ownGoals',own_goals,'redCards',red,'cleanSheet',clean_sheet,'yellowCards',yellow,'goalsConceded',conceded,
        'penaltiesSaved',pen_saved,'penaltiesMissed',pen_missed,'playerOfMatchPoints',0,'secondYellowDismissals',second_yellow),
      'playerId',ppid,'position',pos,'fixtureId',fixture_id,'sourceSequence',10+r%5,'fantasyPlayerId',fpid,'statisticsComplete',true)
    || case when p_adaptive then jsonb_build_object(
        'participationKnown',true,
        'scoringMode',case when mode_roll<70 then 'full' when mode_roll<90 then 'simple' else 'pending' end,
        'evidence',(select jsonb_object_agg(f.field,pg_temp.eq_evidence(
            case
              when mode_roll>=90 then 'unknown'
              when mode_roll>=70 and f.field in ('assists','saves','penaltiesSaved','penaltiesMissed') then case when r%4=0 then 'verified' else 'unknown' end
              when mode_roll>=70 and f.field='goalsConceded' and r%10=0 then 'estimated'
              when mode_roll<70 and r%33=0 and f.field=(array['minutes','goals','assists','saves'])[1+r%4] then 'unknown'
              else 'verified' end))
          from unnest(array['minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals','assists','saves','penaltiesSaved','penaltiesMissed']) f(field)))
       else '{}'::jsonb end
    order by fixno, idx),'[]'::jsonb)
  into rows_json from stats;
  return jsonb_build_object(
    'adaptive',p_adaptive,'scoringVersion',1,
    'ruleset',(select to_jsonb(r) from app.fantasy_rulesets r where r.ruleset_code='botolago-fantasy-v1.0'),
    'positionRules','[{"code":"DEF","goal_points":6,"squad_quota":5,"starting_maximum":5,"starting_minimum":3,"clean_sheet_points":4},
      {"code":"FWD","goal_points":4,"squad_quota":3,"starting_maximum":3,"starting_minimum":1,"clean_sheet_points":0},
      {"code":"GK","goal_points":10,"squad_quota":2,"starting_maximum":1,"starting_minimum":1,"clean_sheet_points":4},
      {"code":"MID","goal_points":5,"squad_quota":5,"starting_maximum":5,"starting_minimum":2,"clean_sheet_points":1}]'::jsonb,
    'pendingFixtures','[]'::jsonb,'pendingPlayerIds','[]'::jsonb,
    'players',(select jsonb_agg(jsonb_build_object('teamId',pg_temp.sid(100000+club),'playerId',ppid,'position',pos,'fantasyPlayerId',fpid) order by idx) from eq_players),
    'playerFixtures',rows_json);
end $$;

-- Player results the way the worker builds them: one event per allowed category, shuffled order.
create function pg_temp.make_results(p_payload jsonb, p_variant integer) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('fantasyPlayerId',p->>'fantasyPlayerId','fixtureId',p->>'fixtureId','events',ev.events)
    order by md5((p->>'fantasyPlayerId')||(p->>'fixtureId')||p_variant)),'[]'::jsonb)
  from jsonb_array_elements(p_payload->'playerFixtures') p
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('category',c.category,
        'points',pg_temp.h((p->>'fantasyPlayerId')||(p->>'fixtureId')||c.category||p_variant,9)-2,
        'sourceKey','fixture-stats:'||(p->>'fixtureId')||':'||(p->>'playerId')||':'||c.category)
      order by case when p_variant%2=0 then c.category else null end, md5(c.category||(p->>'playerId'))),'[]'::jsonb) as events
    from (values ('appearance',array['minutes']),('goal',array['goals']),('assist',array['assists']),
      ('clean_sheet',array['minutes','cleanSheet','goalsConceded']),('goals_conceded',array['minutes','goalsConceded']),
      ('saves',array['saves']),('penalty_save',array['penaltiesSaved']),('penalty_miss',array['penaltiesMissed']),
      ('yellow_card',array['yellowCards']),('red_card',array['redCards']),
      ('second_yellow_dismissal',array['secondYellowDismissals']),('own_goal',array['ownGoals'])) c(category,fields)
    where not coalesce((p_payload->>'adaptive')::boolean,false)
      or (not (coalesce(p->>'scoringMode','pending')='simple' and c.category in ('assist','saves','penalty_save','penalty_miss'))
        and not exists(select 1 from unnest(c.fields) field
          where not case when p->>'scoringMode'='simple' then app_private.fantasy_field_scorable(p,field) else app_private.fantasy_field_certified(p,field) end))
  ) ev;
$$;

-- ===== team pages the way the worker computes them =====
-- Points a player will hold after persisting p_results: the results plus the
-- active events outside this worker's 'fixture-stats:' namespace.
create function pg_temp.make_teams(p_payload jsonb, p_results jsonb, p_from integer, p_to integer) returns jsonb language plpgsql as $$
declare t integer; out jsonb:='[]'::jsonb; lineup uuid; chip text; hit integer;
  rec record; subs jsonb; players jsonb; eff uuid; cm numeric; start_pts integer; bench_pts integer; capt_pts integer;
  out_ids uuid[]; in_ids uuid[]; cand record; ok boolean; cnt integer; rule jsonb; n integer; seq integer; reason text;
begin
  create temporary table if not exists eq_pp(pid uuid primary key, pts integer, did_play boolean) on commit drop;
  truncate eq_pp;
  insert into eq_pp
  select (pl->>'fantasyPlayerId')::uuid,
    coalesce((select sum((ev->>'points')::integer) from jsonb_array_elements(p_results) r, jsonb_array_elements(r->'events') ev where r->>'fantasyPlayerId'=pl->>'fantasyPlayerId'),0)
    + coalesce((select sum(e.points) from app.fantasy_player_point_events e where e.gameweek_id=pg_temp.sid(6) and e.fantasy_player_id=(pl->>'fantasyPlayerId')::uuid and e.superseded_at is null and e.source_key not like 'fixture-stats:%'),0),
    exists(select 1 from jsonb_array_elements(p_payload->'playerFixtures') f where f->>'fantasyPlayerId'=pl->>'fantasyPlayerId' and (f#>>'{stats,minutes}')::integer>0)
  from jsonb_array_elements(p_payload->'players') pl;
  for t in p_from..p_to loop
    lineup:=pg_temp.sid(700000+t);
    select c.chip_type::text into chip from app.fantasy_chip_uses c where c.fantasy_team_id=pg_temp.sid(600000+t) and c.gameweek_id=pg_temp.sid(6) and c.cancelled_at is null;
    select coalesce(sum(b.point_hit),0) into hit from app.fantasy_transfer_batches b where b.fantasy_team_id=pg_temp.sid(600000+t) and b.gameweek_id=pg_temp.sid(6) and b.status='confirmed';
    select lp.fantasy_player_id into eff from app.fantasy_lineup_players lp join eq_pp pp on pp.pid=lp.fantasy_player_id
      where lp.lineup_id=lineup and (lp.captain or lp.vice_captain) and pp.did_play order by lp.captain desc limit 1;
    out_ids:=array[]::uuid[]; in_ids:=array[]::uuid[]; subs:='[]'::jsonb; seq:=0;
    if chip is distinct from 'bench_boost' then
      for rec in select lp.fantasy_player_id as pid, pos.code as code from app.fantasy_lineup_players lp
          join eq_pp pp on pp.pid=lp.fantasy_player_id join app.fantasy_players fp on fp.id=lp.fantasy_player_id
          join app.fantasy_positions pos on pos.id=fp.position_id
          where lp.lineup_id=lineup and lp.slot='starter' and not pp.did_play order by lp.slot_order loop
        exit when seq>=4;
        select lp.fantasy_player_id as pid, pos.code as code into cand from app.fantasy_lineup_players lp
          join eq_pp pp on pp.pid=lp.fantasy_player_id join app.fantasy_players fp on fp.id=lp.fantasy_player_id
          join app.fantasy_positions pos on pos.id=fp.position_id
          where lp.lineup_id=lineup and lp.slot='bench' and pp.did_play and not (lp.fantasy_player_id=any(in_ids))
            and ((pos.code='GK')=(rec.code='GK')) order by lp.slot_order limit 1;
        continue when cand.pid is null;
        ok:=true;
        for rule in select * from jsonb_array_elements(p_payload->'positionRules') loop
          select count(*) into cnt from app.fantasy_lineup_players lp
            join app.fantasy_players fp on fp.id=lp.fantasy_player_id join app.fantasy_positions pos on pos.id=fp.position_id
            where lp.lineup_id=lineup and pos.code=rule->>'code' and (
              (lp.slot='starter' and not (lp.fantasy_player_id=any(out_ids||rec.pid)))
              or lp.fantasy_player_id=any(in_ids||cand.pid));
          if cnt<(rule->>'starting_minimum')::integer or cnt>(rule->>'starting_maximum')::integer then ok:=false; end if;
        end loop;
        if ok then
          seq:=seq+1; out_ids:=out_ids||rec.pid; in_ids:=in_ids||cand.pid;
          subs:=subs||jsonb_build_object('playerOutId',rec.pid,'playerInId',cand.pid,
            'reason',case when rec.code='GK' then 'goalkeeper_did_not_play' else 'outfield_did_not_play' end);
        end if;
      end loop;
    end if;
    cm:=case when chip='triple_captain' then (p_payload#>>'{ruleset,triple_captain_multiplier}')::numeric else (p_payload#>>'{ruleset,captain_multiplier}')::numeric end;
    select coalesce(sum(pp.pts) filter(where (lp.slot='starter' and not lp.fantasy_player_id=any(out_ids)) or lp.fantasy_player_id=any(in_ids)),0),
      coalesce(sum(pp.pts) filter(where lp.slot='bench' and not lp.fantasy_player_id=any(in_ids)),0),
      coalesce(sum(pp.pts*(cm-1)) filter(where lp.fantasy_player_id=eff),0)
      into start_pts,bench_pts,capt_pts
      from app.fantasy_lineup_players lp join eq_pp pp on pp.pid=lp.fantasy_player_id where lp.lineup_id=lineup;
    select jsonb_agg(jsonb_build_object('fantasyPlayerId',lp.fantasy_player_id,'multiplier',
        case when chip='bench_boost' or (lp.slot='starter' and not lp.fantasy_player_id=any(out_ids)) or lp.fantasy_player_id=any(in_ids)
          then case when lp.fantasy_player_id=eff then cm else 1 end else 0 end) order by lp.slot, lp.slot_order)
      into players from app.fantasy_lineup_players lp where lp.lineup_id=lineup;
    out:=out||jsonb_build_object('teamId',pg_temp.sid(600000+t),'lineupId',lineup,
      'startingPoints',start_pts,'benchPoints',bench_pts,'captainPoints',capt_pts,'transferHit',hit,
      'provisionalScore',start_pts+case when chip='bench_boost' then bench_pts else 0 end+capt_pts-hit,
      'effectiveCaptainId',eff,'substitutions',subs,'players',players);
  end loop;
  return out;
end $$;

-- ===== differential harness =====
-- Everything the function writes, without ids and clocks.
create function pg_temp.dump(p_gw uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'events',(select coalesce(jsonb_agg(to_jsonb(e)-'id'-'created_at'-'updated_at'-'superseded_at'
        || jsonb_build_object('superseded',e.superseded_at is not null)
        order by e.fantasy_player_id,e.fixture_id,e.source_key,e.scoring_version),'[]')
      from app.fantasy_player_point_events e where e.gameweek_id=p_gw),
    'points',(select coalesce(jsonb_agg(to_jsonb(p)-'created_at'-'updated_at' order by p.fantasy_player_id),'[]')
      from app.fantasy_player_gameweek_points p where p.gameweek_id=p_gw),
    'snapshots',(select coalesce(jsonb_agg(to_jsonb(s)-'created_at'-'payload' order by s.calculation_version),'[]')
      from app_private.fantasy_scoring_snapshots s where s.gameweek_id=p_gw),
    'subs',(select coalesce(jsonb_agg(to_jsonb(a)-'id'-'created_at' order by a.lineup_id,a.sequence_number),'[]')
      from app.fantasy_auto_substitutions a join app.fantasy_lineups l on l.id=a.lineup_id where l.gameweek_id=p_gw),
    'results',(select coalesce(jsonb_agg(to_jsonb(r)-'id'-'created_at'-'updated_at' order by r.fantasy_team_id),'[]')
      from app.fantasy_team_gameweek_results r where r.gameweek_id=p_gw));
$$;

-- Runs a script of steps with one implementation. Each step that fails is rolled back on its own;
-- the whole script is rolled back at the end, so old and new start from the same rows.
-- Step ops: persist {gw,ver,digest,players,teams} | snapshot {ver,payload} | sql {text} | seal {ver}.
create function pg_temp.run_script(p_which text, p_steps jsonb) returns jsonb language plpgsql as $$
declare step jsonb; res jsonb:='[]'::jsonb; r jsonb; out jsonb;
begin
  begin
    for step in select value from jsonb_array_elements(p_steps) loop
      begin
        if step->>'op'='persist' then
          if p_which='old' then
            r:=pg_temp.legacy_persist((step->>'gw')::uuid,(step->>'ver')::bigint,step->>'digest',step->'players',step->'teams');
          else
            r:=api.service_persist_fantasy_scoring_results((step->>'gw')::uuid,(step->>'ver')::bigint,step->>'digest',step->'players',step->'teams');
          end if;
        elsif step->>'op'='snapshot' then
          insert into app_private.fantasy_scoring_snapshots(gameweek_id,calculation_version,input_digest,payload)
          values(pg_temp.sid(6),(step->>'ver')::bigint,encode(extensions.digest((step->>'ver')||'/snapshot','sha256'),'hex'),step->'payload');
          r:='"snapshot"'::jsonb;
        elsif step->>'op'='sql' then
          execute step->>'text'; r:='"sql"'::jsonb;
        end if;
        res:=res||jsonb_build_object('ok',r,'dump',pg_temp.dump(pg_temp.sid(6)));
      exception when others then
        res:=res||jsonb_build_object('err',sqlstate,'msg',sqlerrm,'dump',pg_temp.dump(pg_temp.sid(6)));
      end;
    end loop;
    out:=res;
    raise exception using errcode='XX999', message='rollback script';
  exception when sqlstate 'XX999' then
    null;
  end;
  return out;
end $$;

create function pg_temp.digest_of(p_ver bigint) returns text language sql as $$
  select encode(extensions.digest(p_ver::text||'/snapshot','sha256'),'hex');
$$;

-- Returns null when old and new agree on every step (result, error and every written row).
create function pg_temp.diff_steps(p_steps jsonb) returns text language plpgsql as $$
declare a jsonb; b jsonb; i integer;
begin
  a:=pg_temp.run_script('old',p_steps);
  b:=pg_temp.run_script('new',p_steps);
  if a is not distinct from b then return null; end if;
  for i in 0..jsonb_array_length(a)-1 loop
    if a->i is distinct from b->i then
      return 'step '||i||': old='||left(coalesce(a->i->>'err','')||' '||coalesce(a->i->>'msg',''),120)||
        ' new='||left(coalesce(b->i->>'err','')||' '||coalesce(b->i->>'msg',''),120)||
        ' dumpsEqual='||((a->i->'dump') is not distinct from (b->i->'dump'))::text;
    end if;
  end loop;
  return 'differs';
end $$;

create function pg_temp.persist_step(p_ver bigint, p_players jsonb, p_teams jsonb) returns jsonb language sql as $$
  select jsonb_build_object('op','persist','gw',pg_temp.sid(6),'ver',p_ver,'digest',pg_temp.digest_of(p_ver),'players',p_players,'teams',p_teams);
$$;

-- The real assertion recomputes the provider document; the differential feeds synthetic snapshots instead.
create or replace function app_private.fantasy_assert_scoring_snapshot(p_gameweek_id uuid, p_calculation_version bigint, p_input_digest text default null)
returns app_private.fantasy_scoring_snapshots language plpgsql security definer set search_path='' as $$
declare s app_private.fantasy_scoring_snapshots%rowtype;
begin
  select * into s from app_private.fantasy_scoring_snapshots where gameweek_id=p_gameweek_id and calculation_version=p_calculation_version for update;
  if not found or (p_input_digest is not null and s.input_digest<>p_input_digest) then
    raise exception using errcode='PT409',message='fantasy_scoring_snapshot_missing'; end if;
  if exists(select 1 from app_private.fantasy_scoring_snapshots x where x.gameweek_id=p_gameweek_id and x.calculation_version>p_calculation_version) then
    raise exception using errcode='PT409',message='stale_update'; end if;
  return s;
end $$;

-- ===== error / edge matrix =====
-- Position in the results array of the result belonging to snapshot row i (0-based).
create function pg_temp.res_idx(p_results jsonb, p_payload jsonb, i integer) returns integer language sql as $$
  select (t.ord-1)::integer from jsonb_array_elements(p_results) with ordinality t(v,ord)
  where t.v->>'fantasyPlayerId'=p_payload#>>array['playerFixtures',i::text,'fantasyPlayerId']
    and t.v->>'fixtureId'=p_payload#>>array['playerFixtures',i::text,'fixtureId'];
$$;
-- Set (or with p_val null remove) path under the result of snapshot row i.
create function pg_temp.mut(p_results jsonb, p_payload jsonb, i integer, p_path text[], p_val jsonb) returns jsonb language sql as $$
  select case when p_val is null then p_results #- (array[pg_temp.res_idx(p_results,p_payload,i)::text]||p_path)
    else jsonb_set(p_results,array[pg_temp.res_idx(p_results,p_payload,i)::text]||p_path,p_val) end;
$$;

-- Runs every case against both implementations; returns the cases that differ.
-- p_p1/p_r1/p_t1: payload, results and team page of calculation 1 (valid); p_p2/p_r2/p_t2: calculation 2.
create function pg_temp.run_matrix(p_p1 jsonb, p_r1 jsonb, p_t1 jsonb, p_p2 jsonb, p_r2 jsonb, p_t2 jsonb, p_t_all jsonb)
returns table(label text, diff text, outcome text) language plpgsql as $$
declare cases jsonb:='[]'::jsonb; c jsonb; d text; snap jsonb; n integer:=jsonb_array_length(p_r1); r jsonb; ev jsonb;
  one_event jsonb; res_a jsonb; res_b jsonb; lbl text;
  snap1 jsonb:=jsonb_build_object('op','snapshot','ver',1,'payload',p_p1);
  snap2 jsonb:=jsonb_build_object('op','snapshot','ver',2,'payload',p_p2);
  p1 jsonb; pf0 jsonb; pending_pid text; lineup_pids text[];
  add_case jsonb;
begin
  -- helper to register a case: label + steps
  create temporary table if not exists eq_cases(label text, steps jsonb) on commit drop;
  truncate eq_cases;

  -- ---- player result mutations (first-error order is by snapshot position) ----
  insert into eq_cases select 'valid page', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'no teams', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'drop last result', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1-(n-1),'[]'));
  insert into eq_cases select 'duplicate result pair', jsonb_build_array(snap1,pg_temp.persist_step(1,jsonb_set(p_r1,array[(n-1)::text],p_r1->0),'[]'));
  insert into eq_cases select 'extra result', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1||jsonb_build_array(p_r1->0),'[]'));
  insert into eq_cases select 'foreign fixture on row 3', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['fixtureId'],to_jsonb(pg_temp.sid(9999)::text)),'[]'));
  insert into eq_cases select 'events is a string', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events'],'"x"'),'[]'));
  insert into eq_cases select 'events is json null', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events'],'null'),'[]'));
  insert into eq_cases select 'events missing', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events'],null),'[]'));
  insert into eq_cases select 'events one short', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events'],
      (p_r1->pg_temp.res_idx(p_r1,p_p1,3)->'events')-0),'[]'));
  insert into eq_cases select 'events one long (duplicate)', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events'],
      (p_r1->pg_temp.res_idx(p_r1,p_p1,3)->'events')||jsonb_build_array((p_r1->pg_temp.res_idx(p_r1,p_p1,3)->'events')->0)),'[]'));
  insert into eq_cases select 'duplicate category same length', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0'],
      (p_r1->pg_temp.res_idx(p_r1,p_p1,3)->'events')->1),'[]'));
  insert into eq_cases select 'category null', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','category'],'null'),'[]'));
  insert into eq_cases select 'category unknown', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','category'],'"bogus"'),'[]'));
  insert into eq_cases select 'sourceKey wrong', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','sourceKey'],'"fixture-stats:x"'),'[]'));
  insert into eq_cases select 'sourceKey missing', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','sourceKey'],null),'[]'));
  insert into eq_cases select 'points string', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','points'],'"5"'),'[]'));
  insert into eq_cases select 'points null', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','points'],'null'),'[]'));
  insert into eq_cases select 'points missing', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','points'],null),'[]'));
  insert into eq_cases select 'points fractional', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','points'],'1.5'),'[]'));
  insert into eq_cases select 'points boolean', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','points'],'true'),'[]'));
  insert into eq_cases select 'event not an object', jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0'],'5'),'[]'));
  insert into eq_cases select 'result not an object', jsonb_build_array(snap1,pg_temp.persist_step(1,jsonb_set(p_r1,array[pg_temp.res_idx(p_r1,p_p1,3)::text],'5'),'[]'));
  insert into eq_cases select 'result json null', jsonb_build_array(snap1,pg_temp.persist_step(1,jsonb_set(p_r1,array[pg_temp.res_idx(p_r1,p_p1,3)::text],'null'),'[]'));
  insert into eq_cases select 'points '||v, jsonb_build_array(snap1,pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,3,array['events','0','points'],v::jsonb),'[]'))
    from unnest(array['100','-100','101','-101','0','-0','2147483647','2147483648','-2147483648','-2147483649','3000000000','99999999999999999999999','-99999999999999999999999','1e2','1E+3','0.0','-1']) v;
  -- two failures: the one earliest in SNAPSHOT order wins, whatever order the results arrive in
  insert into eq_cases select 'rows 10:overflow 4:scope', jsonb_build_array(snap1,pg_temp.persist_step(1,
      pg_temp.mut(pg_temp.mut(p_r1,p_p1,10,array['events','0','points'],'99999999999'),p_p1,4,array['events'],null),'[]'));
  insert into eq_cases select 'rows 4:overflow 10:scope', jsonb_build_array(snap1,pg_temp.persist_step(1,
      pg_temp.mut(pg_temp.mut(p_r1,p_p1,4,array['events','0','points'],'99999999999'),p_p1,10,array['events'],null),'[]'));
  insert into eq_cases select 'rows 4:event 10:overflow', jsonb_build_array(snap1,pg_temp.persist_step(1,
      pg_temp.mut(pg_temp.mut(p_r1,p_p1,4,array['events','0','points'],'500'),p_p1,10,array['events','0','points'],'99999999999'),'[]'));
  insert into eq_cases select 'rows 10:event 4:overflow', jsonb_build_array(snap1,pg_temp.persist_step(1,
      pg_temp.mut(pg_temp.mut(p_r1,p_p1,10,array['events','0','points'],'500'),p_p1,4,array['events','0','points'],'99999999999'),'[]'));
  insert into eq_cases select 'row 4: event0 overflow event1 invalid', jsonb_build_array(snap1,pg_temp.persist_step(1,
      pg_temp.mut(pg_temp.mut(p_r1,p_p1,4,array['events','0','points'],'99999999999'),p_p1,4,array['events','1','points'],'500'),'[]'));
  insert into eq_cases select 'row 4: event0 invalid event1 overflow', jsonb_build_array(snap1,pg_temp.persist_step(1,
      pg_temp.mut(pg_temp.mut(p_r1,p_p1,4,array['events','0','points'],'500'),p_p1,4,array['events','1','points'],'99999999999'),'[]'));
  insert into eq_cases select 'row 4: overflow but sourceKey wrong first', jsonb_build_array(snap1,pg_temp.persist_step(1,
      pg_temp.mut(pg_temp.mut(p_r1,p_p1,4,array['events','0','points'],'99999999999'),p_p1,4,array['events','0','sourceKey'],'"nope"'),'[]'));
  insert into eq_cases select 'many bad rows', jsonb_build_array(snap1,pg_temp.persist_step(1,
      pg_temp.mut(pg_temp.mut(pg_temp.mut(p_r1,p_p1,20,array['events','0','points'],'500'),p_p1,30,array['events'],null),p_p1,8,array['events','1','category'],'null'),'[]'));
  -- ---- snapshot payload shapes ----
  p1:=p_p1;
  insert into eq_cases select 'no player fixtures, no results', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1||'{"playerFixtures":[]}'),pg_temp.persist_step(1,'[]','[]'));
  insert into eq_cases select 'no playerFixtures key', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1-'playerFixtures'),pg_temp.persist_step(1,'[]','[]'));
  insert into eq_cases select 'no playerFixtures key, results given', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1-'playerFixtures'),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'no players key', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1-'players'),pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'no players key, no teams', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1-'players'),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'duplicate players entry', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{players}',(p1->'players')||jsonb_build_array(p1->'players'->0))),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'duplicate snapshot row, one extra result', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{playerFixtures}',(p1->'playerFixtures')||jsonb_build_array(p1->'playerFixtures'->0))),
    pg_temp.persist_step(1,p_r1||jsonb_build_array(jsonb_build_object('fantasyPlayerId',pg_temp.sid(1),'fixtureId',pg_temp.sid(2),'events','[]'::jsonb)),'[]'));
  insert into eq_cases select 'duplicate snapshot row with different points, one extra result', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{playerFixtures}',(p1->'playerFixtures')||jsonb_build_array(jsonb_set(p1->'playerFixtures'->0,'{sourceSequence}','99')))),
    pg_temp.persist_step(1,p_r1||jsonb_build_array(jsonb_build_object('fantasyPlayerId',pg_temp.sid(1),'fixtureId',pg_temp.sid(2),'events','[]'::jsonb)),'[]'));
  insert into eq_cases select 'minutes not a number (player in players)', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{playerFixtures,5,stats,minutes}','"abc"')),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'minutes not a number (player not in players)', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(jsonb_set(p1,'{playerFixtures,5,stats,minutes}','"abc"'),'{players}',
      (select jsonb_agg(x) from jsonb_array_elements(p1->'players') x where x->>'fantasyPlayerId'<>p1#>>'{playerFixtures,5,fantasyPlayerId}'))),
    pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'sourceSequence not a number (player not in players)', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(jsonb_set(p1,'{playerFixtures,5,sourceSequence}','"abc"'),'{players}',
      (select jsonb_agg(x) from jsonb_array_elements(p1->'players') x where x->>'fantasyPlayerId'<>p1#>>'{playerFixtures,5,fantasyPlayerId}'))),
    pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'row of a player not in players (valid values)', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{players}',
      (select jsonb_agg(x) from jsonb_array_elements(p1->'players') x where x->>'fantasyPlayerId'<>p1#>>'{playerFixtures,5,fantasyPlayerId}'))),
    pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'minutes missing', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{playerFixtures,5,stats}',(p1#>'{playerFixtures,5,stats}')-'minutes')),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'minutes over 180', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{playerFixtures,5,stats,minutes}','200')),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'sourceSequence not a number', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{playerFixtures,5,sourceSequence}','"abc"')),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'sourceSequence missing on a row', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{playerFixtures,5}',(p1#>'{playerFixtures,5}')-'sourceSequence')),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'adaptive flag not a boolean', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1||'{"adaptive":"maybe"}'),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'adaptive flag toggled', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1||jsonb_build_object('adaptive',not coalesce((p1->>'adaptive')::boolean,false))),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'scoringVersion missing', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1-'scoringVersion'),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'scoringVersion not a number', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1||'{"scoringVersion":"x"}'),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'scoringVersion 7', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1||'{"scoringVersion":7}'),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'fantasy player id not a uuid in a row', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{playerFixtures,5,fantasyPlayerId}','"zzz"')),
    pg_temp.persist_step(1,jsonb_set(p_r1,array[pg_temp.res_idx(p_r1,p_p1,5)::text,'fantasyPlayerId'],'"zzz"'),'[]'));
  insert into eq_cases select 'fixture unknown (foreign key)', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{playerFixtures,5,fixtureId}',to_jsonb(pg_temp.sid(777)::text))),
    pg_temp.persist_step(1,jsonb_set(p_r1,array[pg_temp.res_idx(p_r1,p_p1,5)::text,'fixtureId'],to_jsonb(pg_temp.sid(777)::text)),'[]'));
  -- ---- replay and versions ----
  insert into eq_cases select 'replay identical', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'replay empty after persist', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),pg_temp.persist_step(1,'[]',p_t1));
  insert into eq_cases select 'replay changed points', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),
      pg_temp.persist_step(1,pg_temp.mut(p_r1,p_p1,2,array['events','0','points'],'3'),p_t1));
  insert into eq_cases select 'empty results before persist', jsonb_build_array(snap1,pg_temp.persist_step(1,'[]',p_t1));
  insert into eq_cases select 'pages then replay', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),pg_temp.persist_step(1,'[]',p_t_all),pg_temp.persist_step(1,p_r1,p_t_all));
  insert into eq_cases select 'second calculation revives and supersedes', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),snap2,pg_temp.persist_step(2,p_r2,p_t2));
  insert into eq_cases select 'second calculation then old version', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),snap2,pg_temp.persist_step(2,p_r2,p_t2),pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'second calculation, results of the first', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),snap2,pg_temp.persist_step(2,p_r1,p_t2));
  insert into eq_cases select 'second calculation, back to first results (revival)', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),snap2,pg_temp.persist_step(2,p_r2,p_t2),
      jsonb_build_object('op','sql','text','delete from app_private.fantasy_scoring_snapshots where calculation_version=2'),
      pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'digest wrong', jsonb_build_array(snap1,jsonb_set(pg_temp.persist_step(1,p_r1,'[]'),'{digest}',to_jsonb(repeat('b',64))));
  insert into eq_cases select 'digest malformed', jsonb_build_array(snap1,jsonb_set(pg_temp.persist_step(1,p_r1,'[]'),'{digest}','"xyz"'));
  insert into eq_cases select 'digest null', jsonb_build_array(snap1,jsonb_set(pg_temp.persist_step(1,p_r1,'[]'),'{digest}','null'));
  insert into eq_cases select 'version 0', jsonb_build_array(snap1,jsonb_set(pg_temp.persist_step(1,p_r1,'[]'),'{ver}','0'));
  insert into eq_cases select 'version unknown', jsonb_build_array(snap1,jsonb_set(pg_temp.persist_step(1,p_r1,'[]'),'{ver}','5'));
  insert into eq_cases select 'gameweek null', jsonb_build_array(snap1,jsonb_set(pg_temp.persist_step(1,p_r1,'[]'),'{gw}','null'));
  insert into eq_cases select 'gameweek unknown', jsonb_build_array(snap1,jsonb_set(pg_temp.persist_step(1,p_r1,'[]'),'{gw}',to_jsonb(pg_temp.sid(31337)::text)));
  insert into eq_cases select 'results not an array', jsonb_build_array(snap1,pg_temp.persist_step(1,'{"a":1}','[]'));
  insert into eq_cases select 'results null', jsonb_build_array(snap1,pg_temp.persist_step(1,'null','[]'));
  insert into eq_cases select 'teams not an array', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,'{"a":1}'));
  insert into eq_cases select 'more than 10000 results', jsonb_build_array(snap1,pg_temp.persist_step(1,(select jsonb_agg(0) from generate_series(1,10001)),'[]'));
  insert into eq_cases select 'more than 100 teams', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,(select jsonb_agg(0) from generate_series(1,101))));
  insert into eq_cases select 'not a service request', jsonb_build_array(snap1,
      jsonb_build_object('op','sql','text','select set_config(''request.jwt.claims'',''{"role":"authenticated"}'',true)'),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'gameweek live, scoring not enabled', jsonb_build_array(snap1,
      jsonb_build_object('op','sql','text','update app.fantasy_gameweeks set status=''live'' where id=pg_temp.sid(6)'),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'gameweek scheduled', jsonb_build_array(snap1,
      jsonb_build_object('op','sql','text','update app.fantasy_gameweeks set status=''scheduled'' where id=pg_temp.sid(6)'),pg_temp.persist_step(1,p_r1,'[]'));
  insert into eq_cases select 'gameweek live, live scoring policy on', jsonb_build_array(snap1,
      jsonb_build_object('op','sql','text','update app.fantasy_gameweeks set status=''live'' where id=pg_temp.sid(6)'),
      jsonb_build_object('op','sql','text','insert into app_private.fantasy_live_scoring_policy(season_id,enabled) values(pg_temp.sid(5),true)'),
      pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'snapshot sealed', jsonb_build_array(snap1,
      jsonb_build_object('op','sql','text','update app_private.fantasy_scoring_snapshots set sealed_at=statement_timestamp()'),pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'sealed after players persisted', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),
      jsonb_build_object('op','sql','text','update app_private.fantasy_scoring_snapshots set sealed_at=statement_timestamp()'),pg_temp.persist_step(1,'[]',p_t1));
  -- ---- team page mutations ----
  insert into eq_cases select 'team total off by one', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,provisionalScore}',to_jsonb((p_t1#>>'{3,provisionalScore}')::integer+1))));
  insert into eq_cases select 'team starting points off', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,startingPoints}',to_jsonb((p_t1#>>'{3,startingPoints}')::integer+1))));
  insert into eq_cases select 'team bench points off', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,benchPoints}',to_jsonb((p_t1#>>'{3,benchPoints}')::integer+1))));
  insert into eq_cases select 'team captain points off', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,captainPoints}',to_jsonb((p_t1#>>'{3,captainPoints}')::integer+1))));
  insert into eq_cases select 'team hit off', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{4,transferHit}',to_jsonb((p_t1#>>'{4,transferHit}')::integer+4))));
  insert into eq_cases select 'team captain wrong', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,effectiveCaptainId}',to_jsonb(pg_temp.sid(5)::text))));
  insert into eq_cases select 'team captain null', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,effectiveCaptainId}','null')));
  insert into eq_cases select 'team multiplier wrong', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,players,0,multiplier}','7')));
  insert into eq_cases select 'team multiplier not a number', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,players,0,multiplier}','"1"')));
  insert into eq_cases select 'team player unknown', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,players,0,fantasyPlayerId}',to_jsonb(pg_temp.sid(1)::text))));
  insert into eq_cases select 'team players short', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,players}',(p_t1#>'{3,players}')-0)));
  insert into eq_cases select 'team players duplicate', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,players,1}',p_t1#>'{3,players,0}')));
  insert into eq_cases select 'team duplicate id', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{4}',p_t1->3)));
  insert into eq_cases select 'team lineup of another team', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,lineupId}',p_t1#>'{4,lineupId}')));
  insert into eq_cases select 'team substitutions not array', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,jsonb_set(p_t1,'{3,substitutions}','{}')));
  insert into eq_cases select 'team lineup not locked', jsonb_build_array(snap1,
      jsonb_build_object('op','sql','text','update app.fantasy_lineups set locked_at=null where id=pg_temp.sid(700003)'),pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'team result already final', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,p_t1),
      jsonb_build_object('op','sql','text','update app.fantasy_team_gameweek_results set state=''final'',final_score=provisional_score,finalized_at=statement_timestamp() where fantasy_team_id=pg_temp.sid(600003)'),
      pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'lineup player has no gameweek points', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',jsonb_set(p1,'{players}',(select jsonb_agg(x) from jsonb_array_elements(p1->'players') x
       where x->>'fantasyPlayerId'<>(select lp.fantasy_player_id::text from app.fantasy_lineup_players lp where lp.lineup_id=pg_temp.sid(700003) limit 1)))),
    pg_temp.persist_step(1,p_r1,p_t1));
  insert into eq_cases select 'pending lineup player, subs present', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1||jsonb_build_object('pendingPlayerIds',
       (select jsonb_build_array(lp.fantasy_player_id::text) from app.fantasy_lineup_players lp where lp.lineup_id=pg_temp.sid(700003) limit 1))),
    pg_temp.persist_step(1,p_r1,p_t_all));
  insert into eq_cases select 'pending lineup player', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1||jsonb_build_object('pendingPlayerIds',
       (select jsonb_agg(lp.fantasy_player_id::text) from app.fantasy_lineup_players lp where lp.lineup_id in (select pg_temp.sid(700000+t) from generate_series(1,40) t)))),
    pg_temp.persist_step(1,p_r1,'[]'),
    pg_temp.persist_step(1,'[]',p_t_all));
  insert into eq_cases select 'pending, then captain-only teams', jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',p1||jsonb_build_object('pendingPlayerIds',
       (select jsonb_agg(lp.fantasy_player_id::text) from app.fantasy_lineup_players lp where lp.captain))),
    pg_temp.persist_step(1,p_r1,'[]'),
    pg_temp.persist_step(1,'[]',p_t_all));
  -- substitutions
  insert into eq_cases
  select 'sub '||m.name||' on team '||t.t, jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,
      jsonb_set(p_t_all,array[(t.t-1)::text,'substitutions','0',m.key],to_jsonb(m.val))))
  from (select (x->>'idx')::integer as t from (select jsonb_build_object('idx',ord) x from jsonb_array_elements(p_t_all) with ordinality a(v,ord)
         where jsonb_array_length(a.v->'substitutions')>0 limit 3) q) t
  cross join (values ('reason wrong','reason','outfield_did_not_play_x'),('out unknown','playerOutId',pg_temp.sid(3)::text),('in unknown','playerInId',pg_temp.sid(3)::text),
    ('reason swapped','reason','goalkeeper_did_not_play')) m(name,key,val);
  insert into eq_cases
  select 'sub duplicated on team '||t.t, jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,
      jsonb_set(p_t_all,array[(t.t-1)::text,'substitutions'],(p_t_all->(t.t-1)->'substitutions')||jsonb_build_array(p_t_all->(t.t-1)->'substitutions'->0))))
  from (select ord::integer as t from jsonb_array_elements(p_t_all) with ordinality a(v,ord) where jsonb_array_length(a.v->'substitutions')>0 limit 2) t;
  insert into eq_cases
  select 'sub dropped on team '||t.t, jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,
      jsonb_set(p_t_all,array[(t.t-1)::text,'substitutions'],'[]')))
  from (select ord::integer as t from jsonb_array_elements(p_t_all) with ordinality a(v,ord) where jsonb_array_length(a.v->'substitutions')>0 limit 3) t;
  insert into eq_cases
  select 'sub forced on bench-boost team '||t.t, jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,
      jsonb_set(p_t_all,array[(t.t-1)::text,'substitutions'],(select x->'substitutions' from jsonb_array_elements(p_t_all) x where jsonb_array_length(x->'substitutions')>0 limit 1))))
  from generate_series(7,14,7) t;
  insert into eq_cases select 'all teams in one call', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,(select jsonb_agg(x) from (select x from jsonb_array_elements(p_t_all) x limit 100) q)));
  insert into eq_cases select 'no results, teams first then results', jsonb_build_array(snap1,pg_temp.persist_step(1,'[]',p_t1),pg_temp.persist_step(1,p_r1,p_t1));
  -- corrupt state: a result whose players belong to another gameweek calc version
  insert into eq_cases select 'gameweek points of an older calculation', jsonb_build_array(snap1,pg_temp.persist_step(1,p_r1,'[]'),
      jsonb_build_object('op','sql','text','update app.fantasy_player_gameweek_points set calculation_version=9'),
      pg_temp.persist_step(1,'[]',p_t1));

  for lbl, c in select e.label, e.steps from eq_cases e order by e.label loop
    res_a:=pg_temp.run_script('old',c);
    res_b:=pg_temp.run_script('new',c);
    label:=lbl;
    diff:=case when res_a is not distinct from res_b then null else 'DIFFERENT' end;
    outcome:=(select coalesce((x->>'err')||' '||(x->>'msg'),'ok') from jsonb_array_elements(res_b) with ordinality t(x,o) order by o desc limit 1);
    return next;
  end loop;
end $$;

-- ===== the checks =====
create function pg_temp.ctx(p_key text) returns jsonb language plpgsql stable as $$
declare r jsonb;
begin
  select j into r from pg_temp.eq_ctx where k=p_key;
  return r;
end $$;
-- The scenario of a real gameweek: first call with every player and the first page of teams,
-- the second page, an identical replay, a replay with different points, a newer calculation,
-- the older calculation arriving late, and a page for the newer calculation.
create function pg_temp.workflow_steps() returns jsonb language sql stable as $$
  select jsonb_build_array(
    jsonb_build_object('op','snapshot','ver',1,'payload',pg_temp.ctx('p1')),
    pg_temp.persist_step(1,pg_temp.ctx('r1'),pg_temp.ctx('t1')),
    pg_temp.persist_step(1,'[]',pg_temp.ctx('t2')),
    pg_temp.persist_step(1,pg_temp.ctx('r1'),pg_temp.ctx('t1')),
    pg_temp.persist_step(1,pg_temp.mut(pg_temp.ctx('r1'),pg_temp.ctx('p1'),3,array['events','0','points'],'4'),pg_temp.ctx('t1')),
    jsonb_build_object('op','snapshot','ver',2,'payload',pg_temp.ctx('p2')),
    pg_temp.persist_step(2,pg_temp.ctx('r2'),pg_temp.ctx('t3')),
    pg_temp.persist_step(1,pg_temp.ctx('r1'),pg_temp.ctx('t1')),
    pg_temp.persist_step(2,'[]',pg_temp.ctx('t3')));
$$;

-- Prepares the calculation inputs of the current world. Calculation 2 changes numbers, drops some
-- player-fixtures and (in the adaptive world) changes the evidence, so it supersedes and revives events.
create function pg_temp.prepare_inputs(p_adaptive boolean, p_nteams integer) returns void language plpgsql as $$
begin
  create temporary table eq_ctx(k text primary key, j jsonb) on commit drop;
  insert into eq_ctx values ('p1', pg_temp.make_payload(p_adaptive,1));
  insert into eq_ctx values ('r1', pg_temp.make_results(pg_temp.ctx('p1'),1));
  insert into eq_ctx values ('t1', pg_temp.make_teams(pg_temp.ctx('p1'),pg_temp.ctx('r1'),1,least(p_nteams,60)));
  insert into eq_ctx values ('t2', pg_temp.make_teams(pg_temp.ctx('p1'),pg_temp.ctx('r1'),least(p_nteams,60)+1,p_nteams));
  insert into eq_ctx values ('tall', pg_temp.make_teams(pg_temp.ctx('p1'),pg_temp.ctx('r1'),1,least(p_nteams,100)));
  insert into eq_ctx values ('p2', pg_temp.make_payload(p_adaptive,2));
  insert into eq_ctx values ('r2', pg_temp.make_results(pg_temp.ctx('p2'),2));
  insert into eq_ctx values ('t3', pg_temp.make_teams(pg_temp.ctx('p2'),pg_temp.ctx('r2'),1,least(p_nteams,60)));
end $$;

select extensions.ok((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
  where p.oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure),
  'the rewritten function is security definer with an empty search path');
select extensions.ok(has_function_privilege('service_role','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute')
  and not has_function_privilege('authenticated','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute')
  and not has_function_privilege('anon','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute'),
  'only the service role can execute it');
select extensions.is((select md5(prosrc) from pg_proc where oid='pg_temp.legacy_persist(uuid,bigint,text,jsonb,jsonb)'::regprocedure),
  '4a38b43093a540caf127f4348311a772',
  'the kept previous body is the body of migration 20260927140000, byte for byte (md5 of its source)');
select extensions.isnt((select md5(prosrc) from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure),
  '4a38b43093a540caf127f4348311a772','the installed function is not the previous body');
select set_config('request.jwt.claims','{"role":"service_role"}',true);

-- World 1: a full gameweek, legacy statistics (twelve categories on every row).
-- 16 clubs, 400 players, 440 player-fixtures (some players play twice), 120 locked lineups with
-- bench boost and triple captain chips, hits, captains, auto-substitutions.
select pg_temp.gen_world(1,8,25,120);
select pg_temp.prepare_inputs(false,120);
analyze;
select extensions.is(jsonb_array_length(pg_temp.ctx('p1')->'playerFixtures'),440,'world 1: 440 player-fixtures');
select extensions.ok((select count(*) from jsonb_array_elements(pg_temp.ctx('tall')) t where jsonb_array_length(t->'substitutions')>0)>=10,
  'world 1: at least ten lineups have auto-substitutions');
select extensions.is(pg_temp.diff_steps(pg_temp.workflow_steps()),null::text,
  'world 1: every step of a gameweek (pages, replays, newer calculation, late old one) writes identical rows and returns identical results, old and new');
select extensions.is((select string_agg(coalesce((x->>'err')||':'||(x->>'msg'),'ok'),',' order by o)
    from jsonb_array_elements(pg_temp.run_script('new',pg_temp.workflow_steps())) with ordinality t(x,o)),
  'ok,ok,ok,ok,PT409:fantasy_scoring_replay_conflict,ok,ok,PT409:stale_update,ok',
  'world 1: the scenario takes the paths intended (replay conflict and stale calculation refused, the rest accepted)');
select extensions.is((pg_temp.run_script('new',pg_temp.workflow_steps())->1->'ok')::jsonb->>'playersPersisted','400','world 1: 400 players persisted in the first call');

-- World 2: the same size with adaptive rows (per-row category sets from the evidence).
select pg_temp.gen_world(2,8,25,120);
select pg_temp.prepare_inputs(true,120);
analyze;
select extensions.ok((select count(*) from jsonb_array_elements(pg_temp.ctx('r1')) r where jsonb_array_length(r->'events') between 1 and 11)>20
  and (select count(*) from jsonb_array_elements(pg_temp.ctx('r1')) r where jsonb_array_length(r->'events')=0)>5
  and (select count(*) from jsonb_array_elements(pg_temp.ctx('r1')) r where jsonb_array_length(r->'events')=12)>100,
  'world 2: adaptive rows have full, partial and empty category sets');
select extensions.is(pg_temp.diff_steps(pg_temp.workflow_steps()),null::text,
  'world 2 (adaptive): every step of a gameweek writes identical rows and returns identical results, old and new');

-- Worlds 3 and 4: small, run through the error and edge matrix (legacy and adaptive).
select pg_temp.gen_world(3,2,16,20);
select pg_temp.prepare_inputs(false,20);
create temporary table eq_matrix_legacy on commit drop as
  select * from pg_temp.run_matrix(pg_temp.ctx('p1'),pg_temp.ctx('r1'),pg_temp.ctx('t1'),pg_temp.ctx('p2'),pg_temp.ctx('r2'),pg_temp.ctx('t3'),pg_temp.ctx('tall'));
select extensions.is((select coalesce(string_agg(label,'; '),'') from eq_matrix_legacy where diff is not null),'',
  'legacy matrix: no case differs between old and new (rows written, results, errors)');
select extensions.ok((select count(*) from eq_matrix_legacy)>=140,'legacy matrix: at least 140 cases');
select extensions.ok((select count(distinct outcome) from eq_matrix_legacy)>=18,'legacy matrix: the cases reach at least 18 different outcomes');
select pg_temp.gen_world(4,2,16,20);
select pg_temp.prepare_inputs(true,20);
create temporary table eq_matrix_adaptive on commit drop as
  select * from pg_temp.run_matrix(pg_temp.ctx('p1'),pg_temp.ctx('r1'),pg_temp.ctx('t1'),pg_temp.ctx('p2'),pg_temp.ctx('r2'),pg_temp.ctx('t3'),pg_temp.ctx('tall'));
select extensions.is((select coalesce(string_agg(label,'; '),'') from eq_matrix_adaptive where diff is not null),'',
  'adaptive matrix: no case differs between old and new (rows written, results, errors)');
select extensions.ok((select count(*) from eq_matrix_adaptive)>=140,'adaptive matrix: at least 140 cases');
select extensions.ok((select count(distinct outcome) from eq_matrix_adaptive)>=18,'adaptive matrix: the cases reach at least 18 different outcomes');
select extensions.ok((select bool_or(outcome like 'PT400 fantasy_player_result_scope_invalid') and bool_or(outcome like 'PT400 fantasy_point_event_invalid')
    and bool_or(outcome like 'PT400 validation_failed') and bool_or(outcome like 'PT409 fantasy_scoring_replay_conflict')
    and bool_or(outcome like 'PT400 fantasy_team_total_invalid') and bool_or(outcome like 'PT400 fantasy_substitution_invalid')
    and bool_or(outcome like 'PT409 fantasy_participation_pending') and bool_or(outcome like 'PT409 fantasy_scoring_sealed')
    and bool_or(outcome = 'ok') from eq_matrix_adaptive),
  'the matrix reaches success and each family of refusals');
select * from extensions.finish();
rollback;

