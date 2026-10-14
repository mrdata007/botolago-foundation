-- Production install of migration 20261013180000_fast_fantasy_points_save on tkewgajrljbwgwedqsxn
-- (docs/production/SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md, "Follow-up: faster points save").
-- It replaces ONE function, api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb),
-- with a set-based body that does the same thing without the quadratic scans that ran into the
-- statement timeout on 2026-10-12. It writes no data when applied.
-- 1. Merge the reviewed PR; its database-quality job must have passed (it runs
--    supabase/tests/database/fantasy_persist_scoring_equivalence.test.sql and the existing Fantasy
--    scoring tests).
-- 2. Pause and drain every writer with sofascore-held-maintenance-pause.sql. The function is
--    called by the lifecycle runner (fantasy-lifecycle-tick and its scoring pass): make sure no
--    scoring call is in flight, and that no gameweek is mid-calculation you care about losing the
--    attempt of (a call that was running keeps the old body to its end).
-- 3. Run this script as it is (it ends in rollback): every guard and the whole migration run,
--    then nothing stays. Read the last result rows. Confirm independently that the history row
--    is absent again and that the function's md5 is still the old one:
--      select md5(prosrc) from pg_proc where oid = 'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure;
--      -- must be 4a38b43093a540caf127f4348311a772
-- 4. Change only the final rollback to commit, run it once, read it back independently (the same
--    query must now return 811cddd28d80c5b21a2e044cbc30b2c1), and restore the writers with
--    sofascore-held-maintenance-resume.sql right away.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select app_private.hold_scheduled_jobs();
do $preflight$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='20261013180000')
    or (select count(*) from supabase_migrations.schema_migrations where version = '20260927140000') <> 1 then
    raise exception 'stop: fast points save migration already present, or a prerequisite migration is missing';
  end if;
  -- The function it replaces is exactly the reviewed version (body of 20260927140000).
  if to_regprocedure('api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)') is null
    or md5((select prosrc from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
       is distinct from '4a38b43093a540caf127f4348311a772' then
    raise exception 'stop: the function this replaces is not the reviewed version';
  end if;
  if exists(select 1 from cron.job where active)
    or exists(select 1 from cron.job_run_details where status not in ('succeeded','failed'))
    or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
    or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists(select 1 from app_private.manager_card_settings where compute_enabled)
    or exists(select 1 from app_private.pepites_settings where mode<>'off')
    or exists(select 1 from net.http_request_queue)
    or exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and backend_type='client backend' and state='active')
  then raise exception 'stop: production writers are not paused and drained'; end if;
end $preflight$;
-- Nothing this migration does touches data: record what the function writes to, to prove it.
create temporary table points_save_before on commit drop as
  select (select count(*) from app.fantasy_player_point_events) as events,
         (select coalesce(sum(points),0) from app.fantasy_player_point_events) as event_points,
         (select count(*) from app.fantasy_player_gameweek_points) as player_points,
         (select coalesce(sum(provisional_points),0) from app.fantasy_player_gameweek_points) as player_provisional,
         (select count(*) from app.fantasy_team_gameweek_results) as team_results,
         (select count(*) from app.fantasy_auto_substitutions) as auto_substitutions,
         (select count(*) from app_private.fantasy_scoring_snapshots) as snapshots;
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20261013180000','fast_fantasy_points_save',array[$migration$-- Saving a gameweek's player points no longer slows down with the square of the match count
-- (docs/production/SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md, "Follow-up: faster points save").
--
-- WHY. On 2026-10-12 at 13:49 UTC api.service_persist_fantasy_scoring_results was cancelled by
-- the statement timeout (SQLSTATE 57014, through PostgREST) while it inserted gameweek 3's
-- point events. The player part of the function was quadratic: for every element of the
-- snapshot's playerFixtures it scanned the whole p_player_results array
-- (`select value from jsonb_array_elements(p_player_results) where ...`), twice (the
-- validation loop and the insert loop); it inserted the point events one row at a time; and it
-- summed each player's points and minutes with correlated subqueries that re-read the whole
-- playerFixtures array for every player, so the work grew with the square of the match count
-- (on a scratch database 440 player-fixtures took 2.0 s and 2,200 took 50 s). The team part
-- also re-read snapshot.payload (a large jsonb record field) on every reference inside its loop.
--
-- WHAT. The same function, with the same signature, grants, security definer, search path,
-- guards, error codes and messages, in the same observable order, and the same writes:
--   1. Validation of the player results is ONE statement. It hash-joins the snapshot's
--      playerFixtures to the submitted results on (fantasyPlayerId, fixtureId), computes each
--      row's allowed categories (the adaptive per-category field rules, fantasy_field_scorable
--      and fantasy_field_certified, are still the ones deciding) and each event's verdict, and
--      reports the FIRST failing snapshot row in snapshot order with the code the old loop
--      would have raised: fantasy_player_result_scope_invalid, fantasy_point_event_invalid, or
--      validation_failed for a points value that is an integer in text but outside the integer
--      range (the old cast raised it at that event).
--      A snapshot row whose stats.minutes is not a number (a state the snapshot builder never
--      produces) fails the whole call with validation_failed, whichever player it belongs to:
--      the old per-player subqueries did the same when run, because the planner tested the
--      cast before the player match.
--   2. The point events are one INSERT ... SELECT ... ON CONFLICT. When two snapshot rows or
--      events share a conflict key, the LAST one wins, as the row-by-row inserts did.
--   3. Each player's points, minutes, sequence and did_play come from two grouped sets joined
--      to the snapshot's players, not from a subquery per player.
--   4. The team results are still handled one team at a time (at most 100 a call, each team a
--      few indexed lookups and tiny jsonb arrays; the checks are order-dependent and their
--      error codes are the contract, so they stay as they were). Three things change: the
--      snapshot's ruleset, position rules and pending players are read once instead of from
--      snapshot.payload on every use; the player-results digest is computed once; and the
--      substitution check reads the lineup's fifteen rows once instead of joining two scans of the
--      whole lineup table to every player's points (a plan that took 40 to 110 ms per
--      substitution where the planner had no statistics for the gameweek).
-- No loop over the snapshot or the results is left; the only loop is over the teams.
--
-- Not changed: any Fantasy rule, the points an event is worth (the worker computes them and
-- this function only validates range and key), the lifecycle, the runner, the statement
-- timeout. The service_role timeout stopgap can be reconsidered once this is deployed.
--
-- PROOF. supabase/tests/database/fantasy_persist_scoring_equivalence.test.sql keeps the
-- previous body (20260927140000) under a throwaway name and compares it with this one, step by
-- step, on identical rows: every row written, and every result or error, over a 440-player-
-- fixture gameweek with 120 teams (chips, hits, auto-substitutions, captains), a second
-- calculation that supersedes and revives events, replays, and an error matrix of 142 cases.
-- After it, 440 player-fixtures take 0.55 s and 2,200 take 2.5 s on the same scratch database.
do $$
begin
  if to_regprocedure('api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)') is null then
    raise exception 'fast_points_save_prerequisite_missing: apply migration 20260927140000 first';
  end if;
  -- Replace only the reviewed body. Anything else means the function was changed after
  -- 20260927140000 and this migration has to be reviewed against it first.
  if md5((select prosrc from pg_proc where oid = 'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
    is distinct from '4a38b43093a540caf127f4348311a772' then
    raise exception 'fast_points_save_unexpected_previous_body: api.service_persist_fantasy_scoring_results is not the version of migration 20260927140000';
  end if;
end $$;

create or replace function api.service_persist_fantasy_scoring_results(
  p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text,
  p_player_results jsonb,p_team_results jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare gw app.fantasy_gameweeks%rowtype; snapshot app_private.fantasy_scoring_snapshots%rowtype;
  team_result jsonb; substitution jsonb;
  player_count integer:=0; team_count integer:=0; lineup app.fantasy_lineups%rowtype;
  chip app.fantasy_chip_type; actual_hit integer; starting_points integer; bench_points integer;
  captain_points integer; actual_score integer; effective_captain uuid; captain_multiplier numeric;
  -- snapshot.payload is large. Read each part once: a reference to the record field inside a
  -- loop or a per-row subquery makes the executor fetch and copy the whole document again.
  v_player_fixtures jsonb; v_players jsonb; v_pending jsonb; v_rules jsonb; v_ruleset jsonb;
  v_adaptive boolean:=false; v_bad integer; v_digest text; v_scoring_version text;
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
  v_player_fixtures:=snapshot.payload->'playerFixtures';
  v_players:=snapshot.payload->'players';
  v_pending:=coalesce(snapshot.payload->'pendingPlayerIds','[]'::jsonb);
  v_rules:=snapshot.payload->'positionRules';
  v_ruleset:=snapshot.payload->'ruleset';
  v_scoring_version:=snapshot.payload->>'scoringVersion';

  if jsonb_array_length(p_player_results)=0 and jsonb_array_length(v_player_fixtures)>0 then
    if not snapshot.players_persisted then raise exception using errcode='PT409',message='fantasy_player_results_missing'; end if;
  else
    v_digest:=encode(extensions.digest(p_player_results::text,'sha256'),'hex');
    if snapshot.players_persisted and snapshot.player_results_digest is distinct from v_digest then
      raise exception using errcode='PT409',message='fantasy_scoring_replay_conflict'; end if;
    if jsonb_array_length(p_player_results)<>jsonb_array_length(v_player_fixtures)
      or (select count(distinct (v->>'fantasyPlayerId',v->>'fixtureId')) from jsonb_array_elements(p_player_results) v)<>jsonb_array_length(p_player_results) then
      raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;
    if jsonb_array_length(v_player_fixtures)>0 then
      v_adaptive:=coalesce((snapshot.payload->>'adaptive')::boolean,false); end if;
    -- Validation, all snapshot rows at once. Row by row the old loop looked up the row's result,
    -- checked its event list against the row's allowed categories, then checked each event in
    -- order; the first failure in snapshot order raised. Here every row and event gets its
    -- verdict in one pass and the failure with the smallest snapshot position is raised:
    --   1 = fantasy_player_result_scope_invalid   (no result, events not an array, wrong number
    --       of events or of distinct categories)
    --   2 = fantasy_point_event_invalid
    --   3 = validation_failed                     (points are an integer in text, outside the
    --       integer range: the old ::integer cast raised it, and only after every earlier
    --       condition of that event had passed)
    with pf as materialized (
      select t.ord, t.value as j, t.value->>'fantasyPlayerId' as pid, t.value->>'fixtureId' as fid
      from jsonb_array_elements(v_player_fixtures) with ordinality t(value,ord)
    ), res as (
      select r.value as j, r.value->>'fantasyPlayerId' as pid, r.value->>'fixtureId' as fid
      from jsonb_array_elements(p_player_results) r
    ), allowed as materialized (
      select pf.ord, c.category
      from pf cross join (values ('appearance',array['minutes']),('goal',array['goals']),('assist',array['assists']),
          ('clean_sheet',array['minutes','cleanSheet','goalsConceded']),('goals_conceded',array['minutes','goalsConceded']),
          ('saves',array['saves']),('penalty_save',array['penaltiesSaved']),('penalty_miss',array['penaltiesMissed']),
          ('yellow_card',array['yellowCards']),('red_card',array['redCards']),
          ('second_yellow_dismissal',array['secondYellowDismissals']),('own_goal',array['ownGoals'])) c(category,fields)
      where not v_adaptive
        or (not (coalesce(pf.j->>'scoringMode','pending')='simple' and c.category in ('assist','saves','penalty_save','penalty_miss'))
          and not exists(select 1 from unnest(c.fields) field
            where not case when pf.j->>'scoringMode'='simple' then app_private.fantasy_field_scorable(pf.j,field)
                           else app_private.fantasy_field_certified(pf.j,field) end))
    ), counts as (
      select a.ord, count(*)::integer as n from allowed a group by a.ord
    ), rowinfo as (
      select pf.ord, pf.fid, pf.j->>'playerId' as player_id, rs.j as rv, coalesce(counts.n,0) as n,
        case when jsonb_typeof(rs.j->'events')='array' then rs.j->'events' else '[]'::jsonb end as evs
      from pf left join res rs on rs.pid=pf.pid and rs.fid=pf.fid left join counts on counts.ord=pf.ord
    ), events as (
      select ri.ord, e.ordinality as eord, e.value as v,
        ('fixture-stats:'||ri.fid||':'||ri.player_id||':'||(e.value->>'category')) as expected_key
      from rowinfo ri cross join lateral jsonb_array_elements(ri.evs) with ordinality e(value,ordinality)
    ), verdicts as (
      select ev.ord, ev.eord,
        case
          when ev.v->>'category' is null or a.category is null
            or ev.v->>'sourceKey' is distinct from ev.expected_key
            or jsonb_typeof(ev.v->'points') is distinct from 'number'
            or (ev.v->>'points')!~'^-?[0-9]+$' then 2
          else case
            when length(ltrim(ev.v->>'points','-0'))>10 then 3
            else case
              when (ev.v->>'points')::bigint not between -2147483648 and 2147483647 then 3
              when (ev.v->>'points')::integer not between -100 and 100 then 2
              else 0 end
            end
          end as code
      from events ev left join allowed a on a.ord=ev.ord and a.category=ev.v->>'category'
    ), first_event as (
      select distinct on (vd.ord) vd.ord, vd.code from verdicts vd where vd.code>0 order by vd.ord, vd.eord
    )
    select z.code into v_bad from (
      select ri.ord,
        case when ri.rv is null or jsonb_typeof(ri.rv->'events') is distinct from 'array'
               or jsonb_array_length(ri.evs)<>ri.n
               or (select count(distinct x.value->>'category') from jsonb_array_elements(ri.evs) x)<>ri.n then 1
             else fe.code end as code
      from rowinfo ri left join first_event fe on fe.ord=ri.ord
    ) z where z.code is not null order by z.ord limit 1;
    if v_bad=1 then raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;
    if v_bad=2 then raise exception using errcode='PT400',message='fantasy_point_event_invalid'; end if;
    if v_bad=3 then raise exception using errcode='PT400',message='validation_failed'; end if;
    -- Only aggregate snapshot categories are replaced. Independent official
    -- event keys remain outside this worker's namespace.
    update app.fantasy_player_point_events set superseded_at=statement_timestamp()
      where gameweek_id=gw.id and source_key like 'fixture-stats:%' and superseded_at is null;
    -- One statement. A snapshot row or event repeating a conflict key is applied after the
    -- earlier one, so the last occurrence wins, as it did when the rows went in one by one.
    insert into app.fantasy_player_point_events(fantasy_player_id,gameweek_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key)
    select distinct on (x.fantasy_player_id,x.fixture_id,x.source_key)
      x.fantasy_player_id,gw.id,x.fixture_id,x.category,x.points,'provisional',x.scoring_version,x.source_sequence,x.source_key
    from (
      select (pf.value->>'fantasyPlayerId')::uuid as fantasy_player_id,(pf.value->>'fixtureId')::uuid as fixture_id,
        ev.value->>'category' as category,(ev.value->>'points')::integer as points,
        v_scoring_version::integer as scoring_version,(pf.value->>'sourceSequence')::bigint as source_sequence,
        ev.value->>'sourceKey' as source_key,pf.ord,ev.ordinality as eord
      from jsonb_array_elements(v_player_fixtures) with ordinality pf(value,ord)
      join (select r.value as j,r.value->>'fantasyPlayerId' as pid,r.value->>'fixtureId' as fid
            from jsonb_array_elements(p_player_results) r) rs
        on rs.pid=pf.value->>'fantasyPlayerId' and rs.fid=pf.value->>'fixtureId'
      cross join lateral jsonb_array_elements(rs.j->'events') with ordinality ev(value,ordinality)
    ) x
    order by x.fantasy_player_id,x.fixture_id,x.source_key,x.scoring_version,x.ord desc,x.eord desc
    on conflict(fantasy_player_id,fixture_id,source_key,scoring_version) do update set
      points=excluded.points,state='provisional',source_sequence=excluded.source_sequence,superseded_at=null;
    -- Minutes and sequence numbers of every snapshot row, grouped once instead of once per
    -- player. (A row whose minutes are not a number fails the whole call, as it did when the
    -- per-player subqueries ran, whichever player the row belongs to.)
    insert into app.fantasy_player_gameweek_points(fantasy_player_id,gameweek_id,provisional_points,minutes_played,did_play,calculation_version,football_input_version,final_points,finalized_at)
    select (player.value->>'fantasyPlayerId')::uuid,gw.id,
      coalesce(points.total,0),
      coalesce(fixtures.minutes,0),
      coalesce(fixtures.played,false),
      p_calculation_version,coalesce(fixtures.last_sequence,0),null,null
    from jsonb_array_elements(v_players) player
    left join (select e.fantasy_player_id,sum(e.points) as total from app.fantasy_player_point_events e
      where e.gameweek_id=gw.id and e.superseded_at is null group by e.fantasy_player_id) points
      on points.fantasy_player_id=(player.value->>'fantasyPlayerId')::uuid
    left join (select f.value->>'fantasyPlayerId' as pid,
        sum((f.value#>>'{stats,minutes}')::integer) as minutes,
        bool_or((f.value#>>'{stats,minutes}')::integer>0) as played,
        max((f.value->>'sourceSequence')::bigint) as last_sequence
      from jsonb_array_elements(v_player_fixtures) f
      group by f.value->>'fantasyPlayerId') fixtures
      on fixtures.pid=player.value->>'fantasyPlayerId'
    on conflict(fantasy_player_id,gameweek_id) do update set provisional_points=excluded.provisional_points,
      minutes_played=excluded.minutes_played,did_play=excluded.did_play,calculation_version=excluded.calculation_version,
      football_input_version=excluded.football_input_version,final_points=null,finalized_at=null;
    get diagnostics player_count=row_count;
    update app_private.fantasy_scoring_snapshots set players_persisted=true,player_results_digest=v_digest where gameweek_id=gw.id and calculation_version=p_calculation_version;
  end if;

  if (select count(distinct v->>'teamId') from jsonb_array_elements(p_team_results) v)<>jsonb_array_length(p_team_results) then
    raise exception using errcode='PT400',message='fantasy_team_result_scope_invalid'; end if;
  for team_result in select value from jsonb_array_elements(p_team_results) loop
    select * into lineup from app.fantasy_lineups l where l.id=(team_result->>'lineupId')::uuid
      and l.fantasy_team_id=(team_result->>'teamId')::uuid and l.gameweek_id=gw.id and l.locked_at is not null for update;
    if not found or jsonb_typeof(team_result->'players') is distinct from 'array'
      or jsonb_typeof(team_result->'substitutions') is distinct from 'array'
      or jsonb_array_length(team_result->'players')<>(v_ruleset->>'squad_size')::integer
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
       and v_pending ? lp.fantasy_player_id::text) then
      select lp.fantasy_player_id into effective_captain from app.fantasy_lineup_players lp
      join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id
      where lp.lineup_id=lineup.id and lp.captain and pp.did_play;
      if jsonb_array_length(team_result->'substitutions')<>0 then
        raise exception using errcode='PT409',message='fantasy_participation_pending'; end if;
    end if;
    if team_result->>'effectiveCaptainId' is distinct from effective_captain::text then
      raise exception using errcode='PT400',message='fantasy_captain_result_invalid'; end if;
    captain_multiplier:=case when chip='triple_captain' then (v_ruleset->>'triple_captain_multiplier')::numeric else (v_ruleset->>'captain_multiplier')::numeric end;
    if (chip='bench_boost' and jsonb_array_length(team_result->'substitutions')<>0)
      or (select count(distinct v->>'playerOutId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions')
      or (select count(distinct v->>'playerInId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions') then
      raise exception using errcode='PT400',message='fantasy_substitution_invalid'; end if;
    for substitution in select value from jsonb_array_elements(team_result->'substitutions') loop
      -- The lineup's fifteen rows are read once and both sides come from them. Written as two
      -- scans of the whole lineup-players table joined to the points of every player in the
      -- gameweek, the planner could pick a plan that read every player's row for each substitution.
      if not exists(with members as materialized (select lp.fantasy_player_id,lp.lineup_id,lp.slot from app.fantasy_lineup_players lp where lp.lineup_id=lineup.id)
        select 1 from members outgoing
        join app.fantasy_player_gameweek_points po on po.fantasy_player_id=outgoing.fantasy_player_id and po.gameweek_id=gw.id
        join app.fantasy_players fo on fo.id=outgoing.fantasy_player_id join app.fantasy_positions opo on opo.id=fo.position_id
        cross join members incoming
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
      select 1 from jsonb_array_elements(v_rules) rule
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
$migration$]);
do $apply$
declare source text;
begin
  select statements[1] into source from supabase_migrations.schema_migrations where version='20261013180000';
  if encode(sha256(convert_to(source,'UTF8')),'hex')
    is distinct from '73b2a7e9e2cb97edb094b532b4e3acb623d87bc6f75c933693fc49a0184e47b4'
  then raise exception 'stop: migration differs from reviewed repository bytes'; end if;
  execute source;
end $apply$;
do $verify$
begin
  if md5((select prosrc from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
       is distinct from '811cddd28d80c5b21a2e044cbc30b2c1'
  then raise exception 'stop: the function body differs from the reviewed migration'; end if;
  if has_function_privilege('anon','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute')
    or has_function_privilege('authenticated','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute')
    or not has_function_privilege('service_role','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute')
    or not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure)
  then raise exception 'stop: permissions differ from the reviewed migration'; end if;
  -- Nothing was written.
  if (select (count(*), coalesce(sum(points),0)) from app.fantasy_player_point_events)
       is distinct from (select (events, event_points) from points_save_before)
    or (select (count(*), coalesce(sum(provisional_points),0)) from app.fantasy_player_gameweek_points)
       is distinct from (select (player_points, player_provisional) from points_save_before)
    or (select count(*) from app.fantasy_team_gameweek_results) <> (select team_results from points_save_before)
    or (select count(*) from app.fantasy_auto_substitutions) <> (select auto_substitutions from points_save_before)
    or (select count(*) from app_private.fantasy_scoring_snapshots) <> (select snapshots from points_save_before)
  then raise exception 'stop: data changed in a way the migration does not do'; end if;
end $verify$;
-- The new body is in place (inside this transaction only, until the rollback is changed to commit).
select md5(prosrc) as function_md5_now, '811cddd28d80c5b21a2e044cbc30b2c1' as reviewed_new_md5,
       (select count(*) from app.fantasy_player_point_events) as point_events_unchanged
  from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure;
rollback;
