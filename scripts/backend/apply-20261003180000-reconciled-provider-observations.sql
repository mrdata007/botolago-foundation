-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261003180000_reconciled_provider_observations (roadmap step 1): reconciled
-- Sofascore + Flashscore matches become one more input of adaptive scoring,
-- recorded through api.service_record_reconciled_fantasy_observation (service
-- role only). It adds the source 'provider-reconciled', the table
-- app_private.football_provider_fixture_links and the wrapper, and replaces
-- api.service_record_fantasy_observation with the same function accepting that
-- source only inside the wrapper. Nothing is scored or published by it.
-- Owner decision 2026-10-04: "apply the step 1 migration to production".
--
-- HOW TO RUN
--   Check nothing else is writing (AGENTS.md): no Fantasy worker run, the
--   Fantasy tick off. Then run the WHOLE file. As shipped it is a REHEARSAL
--   (rolled back; "Rehearsal passed"). Change `rollback;` near the bottom to
--   `commit;` and run again ("Applied"). A failed check stops it with nothing
--   saved; do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, while the Fantasy tick is on, while a pg_cron job
--     is mid-run, where the table or the wrapper already exist, or where the
--     observation recorder is not production's version (md5 of its definition,
--     equal to a local database built from main without this migration);
--   * records the migration file whole in supabase_migrations.schema_migrations
--     and runs it from that record once its sha256 matches the repository file;
--   * checks the result: both functions are exactly the reviewed versions (md5,
--     measured on a local database built from the migrations), the source check
--     accepts 'provider-reconciled', the new table forces row level security
--     and no API role can read it, and only the service role can call the
--     recorder and the wrapper.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $hold$
begin
  lock table app_private.fantasy_fixture_observations in access exclusive mode;
exception when lock_not_available then
  raise exception 'stop: a scoring observation is being written right now -- nothing was saved; run this again when that has finished';
end
$hold$;

do $preflight$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261003180000') then
    raise exception 'stop: migration 20261003180000 is already recorded as applied';
  end if;
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false);';
  end if;
  -- Any run not finished blocks: a recent one, and an older one whose
  -- backend is still alive (a record left behind by a crash does not).
  if exists (select 1 from cron.job_run_details run
    where run.status not in ('succeeded', 'failed')
      and (run.start_time > statement_timestamp() - interval '15 minutes'
        or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
  if to_regclass('app_private.football_provider_fixture_links') is not null
    or to_regprocedure('api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)') is not null then
    raise exception 'stop: the provider fixture links table or the reconciled wrapper already exists';
  end if;
  if md5(pg_get_functiondef('api.service_record_fantasy_observation(uuid,jsonb,text)'::regprocedure))
      <> '0e4852a0a3c35bc3332ebd891d2cdf8e' then
    raise exception 'stop: the observation recorder is not the version this migration replaces';
  end if;
end
$preflight$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261003180000',
  'reconciled_provider_observations',
  array[$bg_20261003180000_file$-- Reconciled provider observations: the bridge from the Sofascore + Flashscore
-- reconciler to adaptive Fantasy scoring (docs/backend/RECONCILED_SCORING_INGESTION.md).
--
-- Nothing here scores, finalizes or changes a published point. A reconciled
-- observation is one more input row for the scoring worker, recorded through the
-- same validation as every other observation, and only through the service-only
-- wrapper below, which first checks that every player is a reviewed identity.
--
-- Retries cannot duplicate points: an observation is stored once per
-- (fixture, payload digest), and points are computed from observations by the
-- scoring worker, whose persistence is keyed by its input digest.

alter table app_private.fantasy_fixture_observations
  drop constraint fantasy_fixture_observations_source_check;
alter table app_private.fantasy_fixture_observations
  add constraint fantasy_fixture_observations_source_check
  check (source in ('sportsmonks', 'reviewed-correction', 'provider-reconciled'));

-- Which provider match an app fixture was ingested from. Written by the first
-- successful reconciled ingestion; afterwards the same app fixture can never be
-- fed from another provider match, nor a provider match into another fixture.
create table app_private.football_provider_fixture_links (
  provider_name text not null check (provider_name in ('sofascore', 'flashscore')),
  external_fixture_id text not null check (external_fixture_id = btrim(external_fixture_id)
    and char_length(external_fixture_id) between 1 and 64),
  fixture_id uuid not null references app.fixtures(id),
  linked_at timestamptz not null default statement_timestamp(),
  primary key (provider_name, external_fixture_id),
  unique (provider_name, fixture_id)
);
alter table app_private.football_provider_fixture_links enable row level security;
alter table app_private.football_provider_fixture_links force row level security;
revoke all on app_private.football_provider_fixture_links from public, anon, authenticated, service_role;

-- Same function as 20260927120659, with one change: the source
-- 'provider-reconciled' is accepted, but only inside
-- api.service_record_reconciled_fantasy_observation (it sets a
-- transaction-local flag), and, like 'sportsmonks', it never overrides a
-- reviewed correction.
create or replace function api.service_record_fantasy_observation(p_fixture_id uuid,p_payload jsonb,p_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f app.fixtures%rowtype; r jsonb; field text; rows jsonb:=p_payload->'players';
 core boolean:=true; full_stats boolean:=true; row_core boolean; position text; d text; existing bigint;
 home_goals integer; away_goals integer; anon_count integer; team uuid; n integer;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if p_source is null or p_source not in ('sportsmonks','reviewed-correction','provider-reconciled')
 or (p_source='provider-reconciled' and coalesce(current_setting('botolago.reconciled_ingestion',true),'')<>'on')
 or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>2097152
 or jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 18 and 100
 or jsonb_typeof(p_payload->'references') is distinct from 'array' or jsonb_array_length(p_payload->'references')=0 then
 raise exception using errcode='PT400',message='adaptive_payload_invalid'; end if;
 perform g.id from app.fantasy_gameweeks g join app.fantasy_fixture_assignments a on a.gameweek_id=g.id
 where a.fixture_id=p_fixture_id and a.superseded_at is null order by g.id for update of g;
 select * into f from app.fixtures where id=p_fixture_id for update;
 if not found or f.status<>'finished' or f.finalized_at is null then
 raise exception using errcode='PT409',message='adaptive_fixture_not_finished'; end if;
 if not exists(select 1 from app.fantasy_fixture_assignments a where a.fixture_id=f.id and a.superseded_at is null
 and app_private.fantasy_adaptive_enabled(a.gameweek_id)) then
 raise exception using errcode='PT409',message='adaptive_policy_not_enabled'; end if;
 if exists(select 1 from app.fantasy_fixture_assignments a join app.fantasy_gameweeks g on g.id=a.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and g.status in ('finalizing','finalized','corrected')) then
 raise exception using errcode='PT409',message='adaptive_reviewed_correction_required'; end if;
 if exists(select 1 from app_private.fantasy_scoring_snapshots s join app.fantasy_fixture_assignments a on a.gameweek_id=s.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and s.sealed_at is not null) then
 raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;

 if app_private.fantasy_observation_estimated(p_payload) then
 if p_source<>'reviewed-correction' or p_payload#>>'{estimateAcceptance,policy}' is distinct from 'best-available-v1'
 or p_payload#>'{estimateAcceptance,finalForRankings}' is distinct from 'true'::jsonb
 or jsonb_typeof(p_payload#>'{estimateAcceptance,assumptions}') is distinct from 'array'
 or jsonb_array_length(p_payload#>'{estimateAcceptance,assumptions}')=0
 or exists(select 1 from jsonb_array_elements(p_payload#>'{estimateAcceptance,assumptions}') a where jsonb_typeof(a)<>'string' or length(btrim(a#>>'{}'))<3)
 then raise exception using errcode='PT400',message='adaptive_estimate_acceptance_required'; end if;
 if exists(select 1 from app.fantasy_fixture_assignments a join app.fantasy_gameweeks g on g.id=a.gameweek_id
 left join app_private.fantasy_adaptive_policy policy on policy.season_id=g.fantasy_season_id
 where a.fixture_id=f.id and a.superseded_at is null and a.counts_points
 and (policy.ruleset_id is distinct from 'f6200000-0000-4000-8000-000000000201'::uuid or g.sequence_number<policy.from_gameweek)) then
 raise exception using errcode='PT409',message='adaptive_estimates_policy_required'; end if;
 if exists(select 1 from app_private.fantasy_fixture_scoring_modes where fixture_id=f.id and mode='full') then
 raise exception using errcode='PT409',message='adaptive_estimates_simple_only'; end if;
 if exists(select 1 from jsonb_array_elements(rows) player,lateral jsonb_each(coalesce(player->'evidence','{}')) e
 where e.value->>'state'='estimated' and not app_private.fantasy_field_scorable(player,e.key)) then
 raise exception using errcode='PT400',message='adaptive_estimate_evidence_invalid'; end if;
 end if;
 if jsonb_typeof(coalesce(p_payload->'estimatedNonParticipants','[]')) is distinct from 'array'
 or jsonb_typeof(coalesce(p_payload->'verifiedNonParticipants','[]')) is distinct from 'array' then
 raise exception using errcode='PT400',message='adaptive_payload_invalid'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'estimatedNonParticipants','[]')||coalesce(p_payload->'verifiedNonParticipants','[]')) absent
 where jsonb_typeof(absent)<>'string' or exists(select 1 from jsonb_array_elements(rows) player where player->>'playerId'=absent#>>'{}')
 or not exists(select 1 from app.team_memberships membership where membership.player_id=(absent#>>'{}')::uuid
 and membership.team_id in(f.home_team_id,f.away_team_id) and membership.season_id=f.season_id
 and membership.valid_from<=f.kickoff_at::date and (membership.valid_to is null or membership.valid_to>=f.kickoff_at::date)))
 or (select count(*)<>count(distinct absent) from jsonb_array_elements(coalesce(p_payload->'estimatedNonParticipants','[]')||coalesce(p_payload->'verifiedNonParticipants','[]')) absent) then
 raise exception using errcode='PT400',message='adaptive_conflicting_participation'; end if;
 if p_source in ('sportsmonks','provider-reconciled') then
 select id into existing from app_private.fantasy_fixture_observations where fixture_id=f.id and source='reviewed-correction' order by observed_at desc,id desc limit 1;
 if existing is not null then return (select jsonb_build_object('observationId',id,'digest',digest,'fullReady',full_ready,'simpleReady',simple_ready,'reviewedOverride',true) from app_private.fantasy_fixture_observations where id=existing); end if;
 end if;
 if (p_payload->>'homeScore')::integer is distinct from f.home_score or
 (p_payload->>'awayScore')::integer is distinct from f.away_score then
 raise exception using errcode='PT409',message='adaptive_final_score_mismatch'; end if;
 anon_count:=coalesce((p_payload->>'anonymousStarters')::integer,0);
 if anon_count not between 0 and 4 or (select count(distinct v->>'playerId') from jsonb_array_elements(rows) v)<>jsonb_array_length(rows) then
 raise exception using errcode='PT400',message='adaptive_lineup_invalid'; end if;
 foreach team in array array[f.home_team_id,f.away_team_id] loop
 select count(*) into n from jsonb_array_elements(rows) v where (v->>'teamId')::uuid=team and (v->>'started')::boolean;
 if n+coalesce((p_payload#>>array['anonymousByTeam',team::text])::integer,0)<>11 then
 raise exception using errcode='PT400',message='adaptive_starters_incomplete'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(rows) v where (v->>'started')::boolean)+anon_count<>22 then
 raise exception using errcode='PT400',message='adaptive_starters_incomplete'; end if;
 for r in select value from jsonb_array_elements(rows) loop
 if not exists(select 1 from app.team_memberships m where m.player_id=(r->>'playerId')::uuid
 and m.team_id=(r->>'teamId')::uuid and m.season_id=f.season_id and m.team_id in(f.home_team_id,f.away_team_id)
 and m.valid_from<=f.kickoff_at::date and (m.valid_to is null or m.valid_to>=f.kickoff_at::date)) then
 raise exception using errcode='PT409',message='adaptive_player_membership_missing'; end if;
 select p.position::text into position from app.players p where p.id=(r->>'playerId')::uuid;
 row_core:=true;
 foreach field in array array['minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals'] loop
 row_core:=row_core and app_private.fantasy_field_scorable(r,field);
 end loop;
 if row_core and ((r#>>'{stats,minutes}')::integer>90 or
 (r#>>'{stats,cleanSheet}')::boolean is distinct from ((r#>>'{stats,minutes}')::integer>=60 and (r#>>'{stats,goalsConceded}')::integer=0)
 or ((r->>'started')::boolean and (r#>>'{stats,minutes}')::integer=0)
 or (r#>>'{stats,goalsConceded}')::integer>case when (r->>'teamId')::uuid=f.home_team_id then f.away_score else f.home_score end) then
 raise exception using errcode='PT400',message='adaptive_statistics_inconsistent'; end if;
 if row_core and (r#>>'{stats,minutes}')::integer=0 and ((r#>>'{stats,goals}')::integer>0 or (r#>>'{stats,ownGoals}')::integer>0) then
 raise exception using errcode='PT400',message='adaptive_statistics_inconsistent'; end if;
 if coalesce((r#>>'{stats,secondYellowDismissals}')::integer,0)>0
 and (coalesce((r#>>'{stats,yellowCards}')::integer,0)>0 or coalesce((r#>>'{stats,redCards}')::integer,0)>0) then
 raise exception using errcode='PT409',message='adaptive_disciplinary_overlap_review_required'; end if;
 core:=core and row_core;
 full_stats:=full_stats and row_core and not exists(select 1 from unnest(array['minutes','goals','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals']) required_field where r#>>array['evidence',required_field,'state'] is distinct from 'verified');
 foreach field in array array['assists','penaltiesMissed','saves','penaltiesSaved'] loop
 if position='goalkeeper' or exists(select 1 from app.fantasy_players fp join app.fantasy_positions pos on pos.id=fp.position_id where fp.football_player_id=(r->>'playerId')::uuid and pos.code='GK') or field not in('saves','penaltiesSaved') then
 full_stats:=full_stats and app_private.fantasy_field_certified(r,field) and r#>>array['evidence',field,'state']='verified';
 end if;
 end loop;
 end loop;
 core:=core and coalesce((p_payload->>'disciplineComplete')::boolean,false)
 and coalesce((p_payload->>'participationComplete')::boolean,false);
 -- Unidentified rows cannot certify nonappearance for an unmatched fantasy player.
 if exists(select 1 from app.fantasy_players fp join app.fantasy_lineup_players lp on lp.fantasy_player_id=fp.id
 join app.fantasy_lineups l on l.id=lp.lineup_id join app.fantasy_fixture_assignments a on a.gameweek_id=l.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and fp.football_team_id in(f.home_team_id,f.away_team_id)
 and not exists(select 1 from jsonb_array_elements(rows) entry where entry->>'playerId'=fp.football_player_id::text)
 and not coalesce((coalesce(p_payload->'verifiedNonParticipants','[]')||coalesce(p_payload->'estimatedNonParticipants','[]')) ? fp.football_player_id::text,false)) then core:=false; end if;
 select coalesce(sum(case when (entry->>'teamId')::uuid=f.home_team_id then (entry#>>'{stats,goals}')::integer else (entry#>>'{stats,ownGoals}')::integer end),0),
 coalesce(sum(case when (entry->>'teamId')::uuid=f.away_team_id then (entry#>>'{stats,goals}')::integer else (entry#>>'{stats,ownGoals}')::integer end),0)
 into home_goals,away_goals from jsonb_array_elements(rows) entry;
 core:=core and home_goals=f.home_score and away_goals=f.away_score;
 full_stats:=coalesce(full_stats and core and not app_private.fantasy_observation_estimated(p_payload),false); core:=coalesce(core,false);
 d:=encode(extensions.digest((p_payload||jsonb_build_object('players',(select jsonb_agg(entry||jsonb_build_object('evidence',(select coalesce(jsonb_object_agg(key,value-'observedAt'),'{}') from jsonb_each(entry->'evidence'))) order by entry->>'playerId') from jsonb_array_elements(rows) entry)))::text,'sha256'),'hex');
 select id into existing from app_private.fantasy_fixture_observations where fixture_id=f.id and digest=d;
 if existing is null then
 if p_source='reviewed-correction' and ((p_payload->>'expectedDigest') is distinct from
 (select digest from app_private.fantasy_fixture_observations where fixture_id=f.id order by observed_at desc,id desc limit 1)
 or length(coalesce(p_payload->>'reason','')) not between 8 and 500
 or length(coalesce(p_payload->>'reviewer','')) not between 3 and 200) then
 raise exception using errcode='PT409',message='adaptive_correction_review_conflict'; end if;
 insert into app_private.fantasy_fixture_observations(fixture_id,source,digest,payload,full_ready,simple_ready)
 values(f.id,p_source,d,p_payload,full_stats,core) returning id into existing;
 end if;
 return jsonb_build_object('observationId',existing,'digest',d,'fullReady',full_stats,'simpleReady',core);
exception when invalid_text_representation or numeric_value_out_of_range then
 raise exception using errcode='PT400',message='adaptive_payload_invalid';
end $$;

create function api.service_record_reconciled_fantasy_observation(
  p_fixture_id uuid, p_request jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  payload jsonb := p_request->'payload';
  f app.fixtures%rowtype;
  player jsonb; v_provider text; v_external text; v_mapping uuid; v_state jsonb;
  link_fixture uuid; before_count bigint; result jsonb; latest bigint;
begin
  if not app_private.is_service_request() then
    raise exception using errcode='PT403', message='forbidden'; end if;
  if p_fixture_id is null or p_dry_run is null or jsonb_typeof(p_request) is distinct from 'object'
    or jsonb_typeof(payload) is distinct from 'object'
    or jsonb_typeof(payload->'players') is distinct from 'array'
    or coalesce(p_request->>'sofascoreEventId', '') !~ '^[0-9]{1,20}$'
    or coalesce(p_request->>'flashscoreEventId', '') !~ '^[A-Za-z0-9]{1,32}$'
    or coalesce(p_request->>'mappingSnapshotDigest', '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='PT400', message='reconciled_request_invalid'; end if;
  -- A provider match carries facts, never an opinion: estimates stay a reviewed correction.
  if app_private.fantasy_observation_estimated(payload) or payload ? 'expectedDigest'
    or payload ? 'reviewer' or payload ? 'estimateAcceptance' then
    raise exception using errcode='PT400', message='reconciled_request_invalid'; end if;

  select * into f from app.fixtures where id = p_fixture_id;
  if not found then raise exception using errcode='PT404', message='reconciled_fixture_not_found'; end if;

  -- Every player is a reviewed identity on both providers, and both mappings
  -- point at the player the row names. The reconciler said so; this checks it.
  for player in select value from jsonb_array_elements(payload->'players') loop
    if jsonb_typeof(player->'identity') is distinct from 'object' then
      raise exception using errcode='PT400', message='reconciled_identity_missing'; end if;
    foreach v_provider in array array['sofascore', 'flashscore'] loop
      v_external := player#>>array['identity', v_provider || 'Id'];
      if v_external is null or char_length(v_external) not between 1 and 200 then
        raise exception using errcode='PT400', message='reconciled_identity_missing'; end if;
      select m.id into v_mapping from app_private.football_provider_mappings m
       where m.provider_name = v_provider and m.entity_type = 'player' and m.external_id = v_external;
      v_state := case when v_mapping is null then null
                    else app_private.football_mapping_supporting_state(v_mapping) end;
      if v_state is null or (v_state->>'active')::boolean is not true or (v_state->>'reviewed')::boolean is not true
        or lower(v_state->>'appPlayerId') is distinct from lower(player->>'playerId') then
        raise exception using errcode='PT409', message='reconciled_identity_not_reviewed',
          detail = v_provider || ':' || v_external; end if;
    end loop;
  end loop;

  begin
    -- Links: one provider match per app fixture, one app fixture per provider match.
    foreach v_provider in array array['sofascore', 'flashscore'] loop
      v_external := p_request->>(v_provider || 'EventId');
      select fixture_id into link_fixture from app_private.football_provider_fixture_links
       where provider_name = v_provider and external_fixture_id = v_external;
      if link_fixture is not null and link_fixture <> f.id then
        raise exception using errcode='PT409', message='reconciled_fixture_link_conflict'; end if;
      if exists(select 1 from app_private.football_provider_fixture_links
                 where provider_name = v_provider and fixture_id = f.id and external_fixture_id <> v_external) then
        raise exception using errcode='PT409', message='reconciled_fixture_link_conflict'; end if;
      insert into app_private.football_provider_fixture_links(provider_name, external_fixture_id, fixture_id)
      values (v_provider, v_external, f.id) on conflict do nothing;
      -- A concurrent call may have linked first (the insert waited for it and
      -- was skipped): what is stored now must be exactly this pair.
      if not exists(select 1 from app_private.football_provider_fixture_links
                     where provider_name = v_provider and external_fixture_id = v_external and fixture_id = f.id)
        or exists(select 1 from app_private.football_provider_fixture_links
                   where provider_name = v_provider and fixture_id = f.id and external_fixture_id <> v_external) then
        raise exception using errcode='PT409', message='reconciled_fixture_link_conflict'; end if;
    end loop;

    select count(*) into before_count from app_private.fantasy_fixture_observations where fixture_id = f.id;
    perform set_config('botolago.reconciled_ingestion', 'on', true);
    result := api.service_record_fantasy_observation(f.id,
      payload || jsonb_build_object('sourceRefs', jsonb_build_object(
        'sofascoreEventId', p_request->>'sofascoreEventId',
        'flashscoreEventId', p_request->>'flashscoreEventId',
        'mappingSnapshotDigest', p_request->>'mappingSnapshotDigest')),
      'provider-reconciled');
    perform set_config('botolago.reconciled_ingestion', '', true);
    select id into latest from app_private.fantasy_fixture_observations
     where fixture_id = f.id order by observed_at desc, id desc limit 1;
    result := result || jsonb_build_object(
      'created', (select count(*) from app_private.fantasy_fixture_observations where fixture_id = f.id) > before_count,
      'latest', latest = (result->>'observationId')::bigint,
      'dryRun', p_dry_run);
    if p_dry_run or not (result->>'created')::boolean then
      -- Every guard above and inside the recorder ran; now undo all of it. With
      -- nothing new recorded (the same facts again, or a reviewed correction
      -- wins) the links are undone too: they stand only with an observation.
      raise exception using errcode='P0001', message='reconciled_dry_run_rollback';
    end if;
  exception when raise_exception then
    perform set_config('botolago.reconciled_ingestion', '', true);
    if sqlerrm = 'reconciled_dry_run_rollback' then return result; end if;
    raise;
  end;
  return result;
end $$;
revoke all on function api.service_record_reconciled_fantasy_observation(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function api.service_record_reconciled_fantasy_observation(uuid, jsonb, boolean) to service_role;
$bg_20261003180000_file$]
);

do $apply$
declare
  part_20261003180000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261003180000'
  );
begin
  if encode(sha256(convert_to(part_20261003180000, 'UTF8')), 'hex')
    is distinct from 'd00dec4654a21f59f8b86e96ebbab3b81885ed0307b881c205769f5f0b25e7c3' then
    raise exception 'stop: 20261003180000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261003180000;
end
$apply$;

do $postflight$
declare
  problems text[] := '{}';
  recorder constant regprocedure := 'api.service_record_fantasy_observation(uuid,jsonb,text)'::regprocedure;
  wrapper regprocedure := to_regprocedure('api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)');
  fn regprocedure;
begin
  if md5(pg_get_functiondef(recorder)) <> 'd5c60fc1a8b42f23e91c0db5e321a26d' then
    problems := problems || 'the observation recorder is not the reviewed new version'::text;
  end if;
  if wrapper is null or md5(pg_get_functiondef(wrapper)) <> '06104038065b147d0573bbc68f23cfe0' then
    problems := problems || 'the reconciled wrapper is missing or not the reviewed version'::text;
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'fantasy_fixture_observations_source_check')
      not like '%provider-reconciled%' then
    problems := problems || 'the observation source check does not accept provider-reconciled'::text;
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid = 'app_private.football_provider_fixture_links'::regclass)
    or has_table_privilege('anon', 'app_private.football_provider_fixture_links', 'select')
    or has_table_privilege('authenticated', 'app_private.football_provider_fixture_links', 'select')
    or has_table_privilege('service_role', 'app_private.football_provider_fixture_links', 'select') then
    problems := problems || 'the provider fixture links table is readable by an API role or lacks forced RLS'::text;
  end if;
  foreach fn in array array_remove(array[recorder, wrapper], null) loop
    if has_function_privilege('anon', fn, 'execute')
      or has_function_privilege('authenticated', fn, 'execute')
      or not has_function_privilege('service_role', fn, 'execute') then
      problems := problems || ('callable by the wrong roles: ' || fn::text);
    end if;
  end loop;
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261003180000')
    then 'Applied. Reconciled observations can be recorded (nothing scored).'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
