-- Set-based Fantasy scoring persistence.
--
-- Same inputs, validations, error codes, rows and return value as the
-- incremental definition in 20260927140000; only the way the work is done
-- changes. The previous body rescanned the submitted results with
-- jsonb_array_elements once per snapshot row, re-read the whole snapshot
-- payload (a large, possibly TOASTed jsonb) inside every row and every team,
-- ran one INSERT per point event, and ran three correlated subqueries over the
-- snapshot per player. That is quadratic in the number of player-fixture rows.
--
-- What is deliberately NOT changed here (see FANTASY_PENDING_ITEMS.md):
--   * supersede-then-upsert of the whole 'fixture-stats:%' namespace, so the
--     "only changed fixtures" optimisation is a possible follow-up, not part of
--     this change;
--   * the replay digest check, sealed and state checks and row locks;
--   * the per-team validation loop (at most 100 teams per call);
--   * app_private.fantasy_field_certified / fantasy_field_scorable, which are
--     called exactly as before and now once per (row, field).
--
-- Guard: refuse to replace anything but the reviewed incremental definition.
-- prosrc md5 4a38b43093a540caf127f4348311a772 was measured read-only against
-- production on 2026-10-12 and equals the value a from-scratch apply of the
-- migration chain produces, so CI and local databases pass it too.
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
  team_result jsonb; substitution jsonb;
  player_count integer:=0; team_count integer:=0; lineup app.fantasy_lineups%rowtype;
  chip app.fantasy_chip_type; actual_hit integer; starting_points integer; bench_points integer;
  captain_points integer; actual_score integer; effective_captain uuid; captain_multiplier numeric;
  all_categories constant text[]:=array['appearance','goal','assist','clean_sheet','goals_conceded','saves','penalty_save','penalty_miss','yellow_card','red_card','second_yellow_dismissal','own_goal'];
  -- Snapshot fragments are read once. Every `snapshot.payload->...` re-detoasts
  -- the whole payload, which was the hidden per-row and per-team cost.
  snapshot_player_fixtures jsonb; snapshot_players jsonb; snapshot_position_rules jsonb;
  snapshot_pending_players jsonb; snapshot_squad_size text; snapshot_captain_multiplier text;
  snapshot_triple_multiplier text; snapshot_scoring_version text; snapshot_adaptive boolean:=false;
  results_digest text; player_error text;
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

  snapshot_player_fixtures:=snapshot.payload->'playerFixtures';
  snapshot_players:=snapshot.payload->'players';
  snapshot_position_rules:=snapshot.payload->'positionRules';
  snapshot_pending_players:=coalesce(snapshot.payload->'pendingPlayerIds','[]'::jsonb);
  snapshot_squad_size:=snapshot.payload#>>'{ruleset,squad_size}';
  snapshot_captain_multiplier:=snapshot.payload#>>'{ruleset,captain_multiplier}';
  snapshot_triple_multiplier:=snapshot.payload#>>'{ruleset,triple_captain_multiplier}';
  snapshot_scoring_version:=snapshot.payload->>'scoringVersion';

  if jsonb_array_length(p_player_results)=0 and jsonb_array_length(snapshot_player_fixtures)>0 then
    if not snapshot.players_persisted then raise exception using errcode='PT409',message='fantasy_player_results_missing'; end if;
  else
    results_digest:=encode(extensions.digest(p_player_results::text,'sha256'),'hex');
    if snapshot.players_persisted and snapshot.player_results_digest is distinct from results_digest then
      raise exception using errcode='PT409',message='fantasy_scoring_replay_conflict'; end if;
    if jsonb_array_length(p_player_results)<>jsonb_array_length(snapshot_player_fixtures)
      or (select count(distinct (v->>'fantasyPlayerId',v->>'fixtureId')) from jsonb_array_elements(p_player_results) v)<>jsonb_array_length(p_player_results) then
      raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;

    -- Validate every snapshot row and every submitted event in one pass, before
    -- the first point write. The first failure in snapshot order wins, with a
    -- row's scope check ahead of its events and events in array order, exactly
    -- as the old row-by-row loop reported them. Rows are joined on the original
    -- TEXT keys so a malformed scope keeps its PT400 instead of an early UUID
    -- cast error.
    if jsonb_array_length(snapshot_player_fixtures)>0 then
      snapshot_adaptive:=coalesce((snapshot.payload->>'adaptive')::boolean,false);
    end if;
    with submitted as materialized (
      select s.value->>'fantasyPlayerId' as player_key,s.value->>'fixtureId' as fixture_key,s.value as document
      from jsonb_array_elements(p_player_results) s
    ), matched as materialized (
      select i.ordinality as ord,i.value as input_row,r.document,
        -- Categories this row must carry. Each field is checked once per row
        -- (not once per category that mentions it); a category is expected
        -- when none of its fields failed. The helper functions swallow their
        -- own errors, so evaluating a field the old short-circuit skipped
        -- cannot raise.
        case when snapshot_adaptive then (
          select coalesce(array_agg(c.category order by c.category),array[]::text[])
          from (values ('appearance',array['minutes']),('goal',array['goals']),('assist',array['assists']),
            ('clean_sheet',array['minutes','cleanSheet','goalsConceded']),('goals_conceded',array['minutes','goalsConceded']),
            ('saves',array['saves']),('penalty_save',array['penaltiesSaved']),('penalty_miss',array['penaltiesMissed']),
            ('yellow_card',array['yellowCards']),('red_card',array['redCards']),
            ('second_yellow_dismissal',array['secondYellowDismissals']),('own_goal',array['ownGoals'])) c(category,fields)
          cross join lateral (
            select coalesce(array_agg(f.field),array[]::text[]) as failed
            from unnest(array['minutes','goals','assists','cleanSheet','goalsConceded','saves','penaltiesSaved','penaltiesMissed','yellowCards','redCards','secondYellowDismissals','ownGoals']) f(field)
            where not case when i.value->>'scoringMode'='simple'
              then app_private.fantasy_field_scorable(i.value,f.field)
              else app_private.fantasy_field_certified(i.value,f.field) end
          ) bad
          where not (coalesce(i.value->>'scoringMode','pending')='simple' and c.category in ('assist','saves','penalty_save','penalty_miss'))
            and not (c.fields && bad.failed)
        ) else all_categories end as categories
      from jsonb_array_elements(snapshot_player_fixtures) with ordinality as i(value,ordinality)
      left join submitted r on r.player_key=i.value->>'fantasyPlayerId' and r.fixture_key=i.value->>'fixtureId'
    ), scope_checked as materialized (
      select m.*,
        case when m.document is null or jsonb_typeof(m.document->'events') is distinct from 'array' then true
          when jsonb_array_length(m.document->'events')<>cardinality(m.categories) then true
          else (select count(distinct v->>'category') from jsonb_array_elements(m.document->'events') v)<>cardinality(m.categories)
        end as scope_invalid
      from matched m
    ), event_checked as (
      select s.ord,e.ordinality as event_ord,
        case when e.value->>'category' is null or not (e.value->>'category'=any(s.categories))
            or e.value->>'sourceKey' is distinct from ('fixture-stats:'||(s.input_row->>'fixtureId')||':'||(s.input_row->>'playerId')||':'||(e.value->>'category'))
            or jsonb_typeof(e.value->'points') is distinct from 'number'
            or (e.value->>'points')!~'^-?[0-9]+$' then 'fantasy_point_event_invalid'
          -- Integer points: an int4 overflow was a cast error (validation_failed)
          -- in the old loop; anything else out of range was an invalid event.
          when (e.value->>'points')::numeric not between -2147483648 and 2147483647 then 'validation_failed'
          when (e.value->>'points')::numeric not between -100 and 100 then 'fantasy_point_event_invalid'
        end as message
      from scope_checked s
      cross join lateral jsonb_array_elements(case when s.scope_invalid then '[]'::jsonb else s.document->'events' end)
        with ordinality as e(value,ordinality)
    )
    select q.message into player_error from (
      select ord,0 as phase,0::bigint as event_ord,'fantasy_player_result_scope_invalid' as message
        from scope_checked where scope_invalid
      union all
      select ord,1,event_ord,message from event_checked where message is not null
    ) q order by q.ord,q.phase,q.event_ord limit 1;
    if player_error is not null then
      raise exception using errcode='PT400',message=player_error; end if;

    -- Only aggregate snapshot categories are replaced. Independent official
    -- event keys remain outside this worker's namespace.
    update app.fantasy_player_point_events set superseded_at=statement_timestamp()
      where gameweek_id=gw.id and source_key like 'fixture-stats:%' and superseded_at is null;
    -- One statement for every event. A (player, fixture) pair repeated in the
    -- snapshot would have been upserted twice, last one winning; keep the last
    -- so ON CONFLICT never meets the same key twice in one statement.
    with submitted as materialized (
      select s.value->>'fantasyPlayerId' as player_key,s.value->>'fixtureId' as fixture_key,s.value as document
      from jsonb_array_elements(p_player_results) s
    ), snapshot_rows as (
      select distinct on (i.value->>'fantasyPlayerId',i.value->>'fixtureId') i.value as input_row
      from jsonb_array_elements(snapshot_player_fixtures) with ordinality as i(value,ordinality)
      order by i.value->>'fantasyPlayerId',i.value->>'fixtureId',i.ordinality desc
    )
    insert into app.fantasy_player_point_events(
      fantasy_player_id,gameweek_id,fixture_id,category,points,state,
      scoring_version,source_sequence,source_key)
    select (i.input_row->>'fantasyPlayerId')::uuid,gw.id,(i.input_row->>'fixtureId')::uuid,
      e.value->>'category',(e.value->>'points')::integer,'provisional',
      snapshot_scoring_version::integer,(i.input_row->>'sourceSequence')::bigint,e.value->>'sourceKey'
    from snapshot_rows i
    join submitted r on r.player_key=i.input_row->>'fantasyPlayerId' and r.fixture_key=i.input_row->>'fixtureId'
    cross join lateral jsonb_array_elements(r.document->'events') e
    where true
    on conflict(fantasy_player_id,fixture_id,source_key,scoring_version) do update set
      points=excluded.points,state='provisional',
      source_sequence=excluded.source_sequence,superseded_at=null;

    -- Fixture facts and active events are grouped once each, including
    -- independent official event keys. Players absent from the fixture set
    -- still receive zeros.
    with players as materialized (
      select value->>'fantasyPlayerId' as player_key from jsonb_array_elements(snapshot_players)
    ), fixture_totals as materialized (
      select f.value->>'fantasyPlayerId' as player_key,
        sum((f.value#>>'{stats,minutes}')::integer) as minutes,
        bool_or((f.value#>>'{stats,minutes}')::integer>0) as played,
        max((f.value->>'sourceSequence')::bigint) as source_sequence
      from jsonb_array_elements(snapshot_player_fixtures) f
      where f.value->>'fantasyPlayerId' in (select player_key from players)
      group by f.value->>'fantasyPlayerId'
    ), event_totals as materialized (
      select e.fantasy_player_id,sum(e.points) as points
      from app.fantasy_player_point_events e
      where e.gameweek_id=gw.id and e.superseded_at is null
      group by e.fantasy_player_id
    )
    insert into app.fantasy_player_gameweek_points(fantasy_player_id,gameweek_id,provisional_points,minutes_played,did_play,calculation_version,football_input_version,final_points,finalized_at)
    select p.player_key::uuid,gw.id,coalesce(e.points,0),coalesce(f.minutes,0),coalesce(f.played,false),
      p_calculation_version,coalesce(f.source_sequence,0),null,null
    from players p
    left join fixture_totals f on f.player_key=p.player_key
    left join event_totals e on e.fantasy_player_id=p.player_key::uuid
    where true
    on conflict(fantasy_player_id,gameweek_id) do update set provisional_points=excluded.provisional_points,
      minutes_played=excluded.minutes_played,did_play=excluded.did_play,calculation_version=excluded.calculation_version,
      football_input_version=excluded.football_input_version,final_points=null,finalized_at=null;
    get diagnostics player_count=row_count;
    update app_private.fantasy_scoring_snapshots set players_persisted=true,player_results_digest=results_digest where gameweek_id=gw.id and calculation_version=p_calculation_version;
  end if;

  if (select count(distinct v->>'teamId') from jsonb_array_elements(p_team_results) v)<>jsonb_array_length(p_team_results) then
    raise exception using errcode='PT400',message='fantasy_team_result_scope_invalid'; end if;
  for team_result in select value from jsonb_array_elements(p_team_results) loop
    select * into lineup from app.fantasy_lineups l where l.id=(team_result->>'lineupId')::uuid
      and l.fantasy_team_id=(team_result->>'teamId')::uuid and l.gameweek_id=gw.id and l.locked_at is not null for update;
    if not found or jsonb_typeof(team_result->'players') is distinct from 'array'
      or jsonb_typeof(team_result->'substitutions') is distinct from 'array'
      or jsonb_array_length(team_result->'players')<>snapshot_squad_size::integer
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
       and snapshot_pending_players ? lp.fantasy_player_id::text) then
      select lp.fantasy_player_id into effective_captain from app.fantasy_lineup_players lp
      join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id
      where lp.lineup_id=lineup.id and lp.captain and pp.did_play;
      if jsonb_array_length(team_result->'substitutions')<>0 then
        raise exception using errcode='PT409',message='fantasy_participation_pending'; end if;
    end if;
    if team_result->>'effectiveCaptainId' is distinct from effective_captain::text then
      raise exception using errcode='PT400',message='fantasy_captain_result_invalid'; end if;
    captain_multiplier:=case when chip='triple_captain' then snapshot_triple_multiplier::numeric else snapshot_captain_multiplier::numeric end;
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
      select 1 from jsonb_array_elements(snapshot_position_rules) rule
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
