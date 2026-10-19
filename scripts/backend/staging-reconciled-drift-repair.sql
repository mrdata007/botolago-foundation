-- STAGING ONLY: restore a drifted function to its existing repository definition.
-- Source: 20261003180000_reconciled_provider_observations.sql (unchanged).
-- Verified source-body MD5 c2906a3ca3643c73d30f0b7d15dfde4a also matches Production V2.
-- No new behavior or migration-history change. Default is a rolled-back rehearsal.
begin;
set local lock_timeout='10s';
do $$ begin
 if current_setting('botolago.release_drill',true) is distinct from 'srdrflfrfpwixsllveid'
 or exists(select 1 from cron.job where active)
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now())
 or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled)
 or exists(select 1 from app_private.ai_home_story_jobs where status='generating') then
 raise exception 'staging_repair_writers_or_target_guard'; end if;
 if md5((select prosrc from pg_proc where oid='api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)'::regprocedure))
 is distinct from '58724fcba25353a2139619a85d8b93d0' then raise exception 'staging_repair_unexpected_source'; end if;
end $$;
create temporary table repair_before on commit drop as
select p.oid,md5(pg_get_functiondef(p.oid)) definition,p.proacl,p.proowner
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('api','app_private') and p.prokind='f';
create temporary table repair_counts on commit drop as
select (select count(*) from app.fantasy_teams) teams,(select count(*) from auth.users) users,
(select count(*) from app.fantasy_team_gameweek_results) results,
(select count(*) from supabase_migrations.schema_migrations) history;
create or replace function api.service_record_reconciled_fantasy_observation(
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
do $$ begin
 if md5((select prosrc from pg_proc where oid='api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)'::regprocedure))
 is distinct from 'c2906a3ca3643c73d30f0b7d15dfde4a' then raise exception 'staging_repair_wrong_result'; end if;
 if exists(select 1 from repair_before b join pg_proc p on p.oid=b.oid where
 p.proacl is distinct from b.proacl or p.proowner is distinct from b.proowner
 or (p.oid<>'api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)'::regprocedure and md5(pg_get_functiondef(p.oid))<>b.definition)) then
 raise exception 'staging_repair_unrelated_function_or_grant_changed'; end if;
 if exists(select 1 from repair_counts where
 teams<>(select count(*) from app.fantasy_teams) or users<>(select count(*) from auth.users)
 or results<>(select count(*) from app.fantasy_team_gameweek_results)
 or history<>(select count(*) from supabase_migrations.schema_migrations)) then
 raise exception 'staging_repair_data_changed'; end if;
end $$;
select 'staging_reconciled_function_restored_to_repository' as result;
rollback;
