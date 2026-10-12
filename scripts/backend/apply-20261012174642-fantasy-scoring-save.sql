-- OWNER-RUN ONLY: BotolaGO Production V2 (tkewgajrljbwgwedqsxn).
-- Draft until the PR's database-quality gate passes and the owner reviews it.
-- Confirm the target project in SQL Editor. This file never scores or finalizes.
-- Check no GitHub production workflow or other operator is writing, then pause
-- and drain ALL writers per AGENTS.md (including dispatched Edge workers).
-- Do not force the old maintenance script if its recorded baseline has changed.
-- Record the independent verification query's output BEFORE running this file.
-- REHEARSE -> independent rollback check -> change ONLY final rollback to commit
-- -> run once -> independent readback -> restore the exact previous switches/jobs.
-- This script embeds the migration byte-for-byte and checks its SHA256.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select app_private.hold_scheduled_jobs();
do $preflight$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='20261012174642') then
    raise exception 'stop: scoring-save migration already recorded';
  end if;
  if md5((select prosrc from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
      is distinct from '4a38b43093a540caf127f4348311a772' then
    raise exception 'stop: scoring persistence is not the reviewed production baseline';
  end if;
  if exists(select 1 from cron.job where active)
    or exists(select 1 from cron.job_run_details where status not in ('succeeded','failed'))
    or exists(select 1 from net.http_request_queue)
    or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
    or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled)
    or exists(select 1 from app_private.manager_card_settings where compute_enabled)
    or exists(select 1 from app_private.pepites_settings where mode<>'off')
    or exists(select 1 from app_private.prediction_settings where scoring_enabled)
    or exists(select 1 from app_private.account_deletion_settings where enabled)
    or exists(select 1 from app_private.ai_home_story_settings where enabled)
    or exists(select 1 from app_private.ai_content_settings where enabled)
    or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
    or exists(select 1 from pg_stat_activity where pid<>pg_backend_pid()
      and backend_type='client backend' and state in ('active','idle in transaction','idle in transaction (aborted)'))
  then raise exception 'stop: production writers are not paused and drained'; end if;
end $preflight$;

create temporary table scoring_save_before on commit drop as select jsonb_build_object(
  'gameweeks',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from app.fantasy_gameweeks t),
  'events',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from app.fantasy_player_point_events t),
  'points',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by fantasy_player_id,gameweek_id),''))) from app.fantasy_player_gameweek_points t),
  'teams',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by fantasy_team_id,gameweek_id),''))) from app.fantasy_team_gameweek_results t),
  'snapshots',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by gameweek_id,calculation_version),''))) from app_private.fantasy_scoring_snapshots t),
  'substitutions',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by lineup_id,sequence_number),''))) from app.fantasy_auto_substitutions t)
) as state;
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20261012174642','fantasy_scoring_save_set_based',array[$scoring_save_migration$-- Set-based Fantasy scoring persistence. No scoring rules or input digest change.
-- Production baseline prosrc md5 measured read-only on 2026-10-12.
-- Materialized joins remove repeated whole-array scans; bulk upserts remove
-- per-event statements inside PL/pgSQL. Team validation is unchanged.
do $baseline$
begin
  if md5((select prosrc from pg_proc where oid=
      'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
      is distinct from '4a38b43093a540caf127f4348311a772' then
    raise exception 'stop: scoring persistence is not the reviewed incremental baseline';
  end if;
end $baseline$;

create or replace function api.service_persist_fantasy_scoring_results(
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
    -- Materialize submitted results once; join on original TEXT keys so malformed
    -- scope retains its original PT400 rather than raising an early UUID cast.
    for input_row, result_row in
      with submitted as materialized (
        select value->>'fantasyPlayerId' as player_key,
          value->>'fixtureId' as fixture_key, value as document
        from jsonb_array_elements(p_player_results)
      )
      select i.value, r.document
      from jsonb_array_elements(snapshot.payload->'playerFixtures')
        with ordinality as i(value, ordinal)
      left join submitted r on r.player_key=i.value->>'fantasyPlayerId'
        and r.fixture_key=i.value->>'fixtureId'
      order by i.ordinal
    loop
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
      if result_row is null or jsonb_typeof(result_row->'events') is distinct from 'array'
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
    -- Every submitted event was checked before the first point write.
    with submitted as materialized (
      select value->>'fantasyPlayerId' as player_key,
        value->>'fixtureId' as fixture_key, value as document
      from jsonb_array_elements(p_player_results)
    )
    insert into app.fantasy_player_point_events(
      fantasy_player_id,gameweek_id,fixture_id,category,points,state,
      scoring_version,source_sequence,source_key)
    select (i.value->>'fantasyPlayerId')::uuid,gw.id,
      (i.value->>'fixtureId')::uuid,e.value->>'category',(e.value->>'points')::integer,
      'provisional',(snapshot.payload->>'scoringVersion')::integer,
      (i.value->>'sourceSequence')::bigint,e.value->>'sourceKey'
    from jsonb_array_elements(snapshot.payload->'playerFixtures') i
    join submitted r on r.player_key=i.value->>'fantasyPlayerId'
      and r.fixture_key=i.value->>'fixtureId'
    cross join lateral jsonb_array_elements(r.document->'events') e
    where true
    on conflict(fantasy_player_id,fixture_id,source_key,scoring_version) do update set
      points=excluded.points,state='provisional',
      source_sequence=excluded.source_sequence,superseded_at=null;

    -- Group fixture facts and active events once, including independent official
    -- event keys. Players absent from the ready fixture set still receive zeros.
    with snapshot_players as materialized (
      select value->>'fantasyPlayerId' as player_key
      from jsonb_array_elements(snapshot.payload->'players')
    ), fixture_totals as materialized (
      select f.value->>'fantasyPlayerId' as player_key,
        sum((f.value#>>'{stats,minutes}')::integer) as minutes,
        bool_or((f.value#>>'{stats,minutes}')::integer>0) as played,
        max((f.value->>'sourceSequence')::bigint) as source_sequence
      from jsonb_array_elements(snapshot.payload->'playerFixtures') f
      where exists(select 1 from snapshot_players p
        where p.player_key=f.value->>'fantasyPlayerId')
      group by f.value->>'fantasyPlayerId'
    ), event_totals as materialized (
      select e.fantasy_player_id,sum(e.points) as points
      from app.fantasy_player_point_events e
      where e.gameweek_id=gw.id and e.superseded_at is null
      group by e.fantasy_player_id
    )
    insert into app.fantasy_player_gameweek_points(
      fantasy_player_id,gameweek_id,provisional_points,minutes_played,did_play,
      calculation_version,football_input_version,final_points,finalized_at)
    select p.player_key::uuid,gw.id,coalesce(e.points,0),coalesce(f.minutes,0),
      coalesce(f.played,false),p_calculation_version,coalesce(f.source_sequence,0),null,null
    from snapshot_players p
    left join fixture_totals f on f.player_key=p.player_key
    left join event_totals e on e.fantasy_player_id=p.player_key::uuid
    where true
    on conflict(fantasy_player_id,gameweek_id) do update set
      provisional_points=excluded.provisional_points,
      minutes_played=excluded.minutes_played,did_play=excluded.did_play,
      calculation_version=excluded.calculation_version,
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
revoke all on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) to service_role;
$scoring_save_migration$]);
do $apply$
declare migration text := (select statements[1] from supabase_migrations.schema_migrations where version='20261012174642');
begin
  if encode(sha256(convert_to(migration,'UTF8')),'hex') is distinct from '441e2a05f9bfecc2409881787f0b3627814019378e5fb84df88c0d42702d06ef' then
    raise exception 'stop: embedded migration differs from the reviewed file';
  end if;
  execute migration;
end $apply$;
do $postflight$
declare after_state jsonb;
begin
  if md5((select prosrc from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
      is distinct from '2ab3a3d0095400a423691162cfbb07c2' then
    raise exception 'stop: installed scoring function is not the reviewed version';
  end if;
  if not (select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure)
    or has_function_privilege('anon','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute')
    or has_function_privilege('authenticated','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute')
    or not has_function_privilege('service_role','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute')
    or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')
  then raise exception 'stop: scoring function privileges or search path changed'; end if;
  select state into after_state from (select jsonb_build_object(
  'gameweeks',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from app.fantasy_gameweeks t),
  'events',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from app.fantasy_player_point_events t),
  'points',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by fantasy_player_id,gameweek_id),''))) from app.fantasy_player_gameweek_points t),
  'teams',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by fantasy_team_id,gameweek_id),''))) from app.fantasy_team_gameweek_results t),
  'snapshots',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by gameweek_id,calculation_version),''))) from app_private.fantasy_scoring_snapshots t),
  'substitutions',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by lineup_id,sequence_number),''))) from app.fantasy_auto_substitutions t)
) as state) checked;
  if after_state is distinct from (select state from scoring_save_before) then
    raise exception 'stop: scoring data changed during the schema-only install';
  end if;
end $postflight$;
select 'Scoring-save checks passed; data unchanged. Verify transaction outcome independently.' as result;
rollback;
