-- Fixture-ready points and live rankings, independently gated from ruleset selection.
-- Keep calculated multipliers outside the immutable locked-lineup input digest.
alter table app.fantasy_team_gameweek_results add column scoring_details jsonb
 check(scoring_details is null or (jsonb_typeof(scoring_details)='object' and pg_column_size(scoring_details)<=65536));
create table app_private.fantasy_live_scoring_policy (
 season_id uuid primary key references app.fantasy_seasons(id),
 enabled boolean not null default false,
 updated_at timestamptz not null default statement_timestamp()
);
alter table app_private.fantasy_live_scoring_policy enable row level security;
alter table app_private.fantasy_live_scoring_policy force row level security;
revoke all on app_private.fantasy_live_scoring_policy from public,anon,authenticated,service_role;
create function app_private.fantasy_live_scoring_enabled(p_gameweek_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.fantasy_live_scoring_policy p
 join app.fantasy_gameweeks g on g.fantasy_season_id=p.season_id
 where g.id=p_gameweek_id and p.enabled and g.status in ('locked','live','provisional','finalizing'));
$$;
revoke all on function app_private.fantasy_live_scoring_enabled(uuid) from public,anon,authenticated,service_role;

alter function app_private.fantasy_scoring_input_document(uuid) rename to fantasy_scoring_input_document_before_live;
create function app_private.fantasy_scoring_input_document(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; f jsonb; one_fixture jsonb; ready jsonb:='[]'; pending jsonb:='[]';
 eligible_ids jsonb:='[]'; pending_players jsonb; performances jsonb; reason text;
begin
 d:=app_private.fantasy_scoring_input_document_before_live(p_gameweek_id);
 if not app_private.fantasy_live_scoring_enabled(p_gameweek_id) then return d; end if;
 for f in select value from jsonb_array_elements(d->'fixtures')
 where (value#>>'{assignment,counts_points}')::boolean is true loop
   reason:=null;
   one_fixture:=d||jsonb_build_object('fixtures',jsonb_build_array(f),'playerFixtures',
     (select coalesce(jsonb_agg(p),'[]') from jsonb_array_elements(d->'playerFixtures') p
       where p->>'fixtureId'=f->>'fixtureId'));
   if f->>'status' is distinct from 'finished' or f->>'finalizedAt' is null then
     reason:='fixture_not_finished';
   elsif coalesce((d->>'adaptive')::boolean,false) and
     ((f->>'adaptiveReady')::boolean is distinct from true or f->>'scoringMode' is null) then
     reason:='fixture_data_pending';
   else
     begin
       perform app_private.fantasy_validate_scoring_document(one_fixture);
     exception when sqlstate 'PT409' then
       get stacked diagnostics reason=message_text;
       if reason not in ('fantasy_scoring_input_incomplete','fantasy_scoring_coverage_incomplete',
         'fantasy_goal_totals_mismatch','adaptive_scoring_pending') then raise; end if;
     end;
   end if;
   if reason is null then
     ready:=ready||jsonb_build_array(f);
     eligible_ids:=eligible_ids||jsonb_build_array(f->>'fixtureId');
   else pending:=pending||jsonb_build_array(f||jsonb_build_object('pendingReason',reason)); end if;
 end loop;
 select coalesce(jsonb_agg(p),'[]') into performances
 from jsonb_array_elements(d->'playerFixtures') p where eligible_ids ? (p->>'fixtureId');
 -- Unknown participation never triggers a substitution or vice-captain promotion.
 select coalesce(jsonb_agg(distinct p->>'fantasyPlayerId'),'[]') into pending_players
 from jsonb_array_elements(d->'playerFixtures') p
 where not (eligible_ids ? (p->>'fixtureId'))
   or (coalesce((d->>'adaptive')::boolean,false) and (p->>'participationKnown')::boolean is distinct from true)
   or exists(select 1 from jsonb_array_elements(ready) ready_fixture
     where ready_fixture->>'fixtureId'=p->>'fixtureId' and coalesce((ready_fixture#>>'{coverage,anonymous_starter_rows}')::int,0)>0
       and not exists(select 1 from app.player_fixture_performances perf
          where perf.fixture_id=(p->>'fixtureId')::uuid and perf.player_id=(p->>'playerId')::uuid and perf.active));
 return d||jsonb_build_object('incremental',true,'fixtures',ready,'pendingFixtures',pending,
   'pendingPlayerIds',pending_players,'playerFixtures',performances);
end $$;
revoke all on function app_private.fantasy_scoring_input_document(uuid) from public,anon,authenticated,service_role;

alter function app_private.fantasy_validate_scoring_document(jsonb) rename to fantasy_validate_scoring_document_before_live;
create function app_private.fantasy_validate_scoring_document(p_document jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce((p_document->>'incremental')::boolean,false) and jsonb_array_length(p_document->'fixtures')=0 then
   if jsonb_array_length(p_document->'pendingFixtures') not between 1 and 64
     or jsonb_array_length(p_document->'players') not between 1 and 2000
     or jsonb_array_length(p_document->'playerFixtures')<>0 then
     raise exception using errcode='PT409',message='fantasy_scoring_input_incomplete'; end if;
   return;
 end if;
 perform app_private.fantasy_validate_scoring_document_before_live(p_document);
end $$;
revoke all on function app_private.fantasy_validate_scoring_document(jsonb) from public,anon,authenticated,service_role;

alter function api.service_fantasy_lifecycle_state(uuid) rename to service_fantasy_lifecycle_state_before_live;
revoke all on function api.service_fantasy_lifecycle_state_before_live(uuid) from public,anon,authenticated,service_role;
create function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 return api.service_fantasy_lifecycle_state_before_live(p_gameweek_id)||jsonb_build_object(
 'incrementalScoringEnabled',app_private.fantasy_live_scoring_enabled(p_gameweek_id));
end $$;
revoke all on function api.service_fantasy_lifecycle_state(uuid) from public,anon,authenticated;
grant execute on function api.service_fantasy_lifecycle_state(uuid) to service_role;

-- Choose one immutable version per input digest. Retries reuse it; a correction
-- gets a new version. A concurrent ingest is still rejected by the existing CAS.
create function api.service_prepare_fantasy_live_scoring(p_gameweek_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g app.fantasy_gameweeks%rowtype; d jsonb; digest text;
 s app_private.fantasy_scoring_snapshots%rowtype; version bigint;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 select * into g from app.fantasy_gameweeks where id=p_gameweek_id for update;
 if not app_private.fantasy_live_scoring_enabled(g.id) or g.status not in ('live','provisional') then
 raise exception using errcode='PT409',message='gameweek_not_scorable'; end if;
 d:=app_private.fantasy_scoring_input_document(g.id);
 perform app_private.fantasy_validate_scoring_document(d);
 digest:=encode(extensions.digest(d::text,'sha256'),'hex');
 select * into s from app_private.fantasy_scoring_snapshots where gameweek_id=g.id order by calculation_version desc limit 1;
 version:=case when s.input_digest=digest then s.calculation_version
   else greatest(coalesce(s.calculation_version,0)+1,g.scoring_input_version,1) end;
 update app.fantasy_gameweeks set scoring_input_version=version where id=g.id;
 return jsonb_build_object('calculationVersion',version);
end $$;
revoke all on function api.service_prepare_fantasy_live_scoring(uuid) from public,anon,authenticated;
grant execute on function api.service_prepare_fantasy_live_scoring(uuid) to service_role;

-- Change only the live-entry guard in the reviewed snapshot implementation.
do $patch$
declare original text; changed text;
begin
 original:=pg_get_functiondef('api.service_get_fantasy_scoring_snapshot(uuid,bigint,uuid,integer)'::regprocedure);
 changed:=replace(original,'app_private.fantasy_adaptive_enabled(gw.id)',
 '(app_private.fantasy_adaptive_enabled(gw.id) or app_private.fantasy_live_scoring_enabled(gw.id))');
 if changed=original then raise exception 'LIVE_SNAPSHOT_PATCH_MISMATCH'; end if;
 execute changed;
end $patch$;

-- Refuse finalization even when the ready subset has perfectly valid points.
alter function api.service_begin_fantasy_finalization(uuid,bigint,text) rename to service_begin_fantasy_finalization_before_live;
revoke all on function api.service_begin_fantasy_finalization_before_live(uuid,bigint,text) from public,anon,authenticated,service_role;
create function api.service_begin_fantasy_finalization(p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if app_private.fantasy_live_scoring_enabled(p_gameweek_id) then
   d:=app_private.fantasy_scoring_input_document(p_gameweek_id);
   if jsonb_array_length(d->'pendingFixtures')>0 or jsonb_array_length(d->'pendingPlayerIds')>0 then
     raise exception using errcode='PT409',message='fantasy_live_scoring_pending'; end if;
 end if;
 return api.service_begin_fantasy_finalization_before_live(p_gameweek_id,p_calculation_version,p_input_digest);
end $$;
revoke all on function api.service_begin_fantasy_finalization(uuid,bigint,text) from public,anon,authenticated;
grant execute on function api.service_begin_fantasy_finalization(uuid,bigint,text) to service_role;

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
revoke all on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) to service_role;



-- Public point breakdowns use the published snapshot, not raw provider rows.
alter function app_private.fantasy_fixture_mode_details(uuid) rename to fantasy_fixture_mode_details_before_live;
create function app_private.fantasy_fixture_mode_details(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb;
begin
 if app_private.fantasy_adaptive_enabled(p_gameweek_id) then
   return app_private.fantasy_fixture_mode_details_before_live(p_gameweek_id);
 end if;
 select payload into d from app_private.fantasy_scoring_snapshots where gameweek_id=p_gameweek_id
 and players_persisted order by calculation_version desc limit 1;
 if not coalesce((d->>'incremental')::boolean,false) then
   return app_private.fantasy_fixture_mode_details_before_live(p_gameweek_id);
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('fixtureId',f->>'fixtureId',
 'teamIds',jsonb_build_array(f->>'homeTeamId',f->>'awayTeamId'),
 'mode',case when f ? 'pendingReason' then null else 'full' end,
 'pending',f ? 'pendingReason','cutoffAt',null,'reason',f->>'pendingReason','excludedCategories','[]'::jsonb)
 order by f->>'fixtureId'),'[]') from jsonb_array_elements((d->'fixtures')||(d->'pendingFixtures')) f);
end $$;
revoke all on function app_private.fantasy_fixture_mode_details(uuid) from public,anon,authenticated,service_role;

alter function api.get_my_fantasy_points(uuid,uuid) rename to get_my_fantasy_points_before_live;
revoke all on function api.get_my_fantasy_points_before_live(uuid,uuid) from public,anon,authenticated,service_role;
create function api.get_my_fantasy_points(p_team_id uuid,p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; details jsonb;
begin
 -- Existing ownership, authentication and MFA guards remain in the wrapped RPC.
 d:=api.get_my_fantasy_points_before_live(p_team_id,p_gameweek_id);
 select scoring_details into details from app.fantasy_team_gameweek_results
 where fantasy_team_id=p_team_id and gameweek_id=p_gameweek_id;
 if details is not null then
   d:=d||jsonb_build_object('players',(select jsonb_agg(player||jsonb_build_object('multiplier',
     (select r->'multiplier' from jsonb_array_elements(details->'players') r
       where r->>'fantasyPlayerId'=player->>'fantasyPlayerId')) order by ord)
     from jsonb_array_elements(d->'players') with ordinality x(player,ord)));
 end if;
 return d||jsonb_build_object('incrementalScoring',app_private.fantasy_live_scoring_enabled(p_gameweek_id));
end $$;
revoke all on function api.get_my_fantasy_points(uuid,uuid) from public,anon;
grant execute on function api.get_my_fantasy_points(uuid,uuid) to authenticated,service_role;
