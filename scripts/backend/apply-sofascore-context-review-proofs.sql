-- Owner-authorized production recovery on tkewgajrljbwgwedqsxn.
-- Merge the tested forward migration first. Pause and drain all writers with
-- sofascore-held-maintenance-pause.sql. Rehearse, independently verify rollback,
-- change only the final rollback to commit, and independently read back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select app_private.hold_scheduled_jobs();
do $preflight$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='20261011191737')
    or (select count(*) from supabase_migrations.schema_migrations
      where version in ('20261011130000','20261011140000')) <> 2 then
    raise exception 'stop: context review migration prerequisite or history changed';
  end if;
  if md5(pg_get_functiondef('api.service_sofascore_fantasy_context(uuid,text[])'::regprocedure))
    is distinct from 'bfbdcc58895a89fc2c5b8d069bbee728' then
    raise exception 'stop: context is not the independently measured original definition';
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
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20261011191737','sofascore_fantasy_context_review_proofs',array[$migration$-- The observation writer accepts only mappings whose current identity has a
-- matching review proof. Read that same proof for the automatic builder;
-- manually_corrected alone excludes valid automatic matches.
do $$
begin
  if to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is null
    or to_regprocedure('api.service_sofascore_fantasy_context(uuid,text[])') is null then
    raise exception 'sofascore_fantasy_context_review_prerequisite_missing';
  end if;
end $$;

create or replace function api.service_sofascore_fantasy_context(
  p_fixture_id uuid, p_player_ids text[] default '{}'::text[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f app.fixtures%rowtype;
  gw app.fantasy_gameweeks%rowtype;
  a app_private.sofascore_fantasy_attempts%rowtype;
  v_event text;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_fixture_id is null or p_player_ids is null or cardinality(p_player_ids) > 120 then
    raise exception using errcode = 'PT400', message = 'sofascore_fantasy_context_invalid'; end if;
  select * into f from app.fixtures where id = p_fixture_id;
  if not found then return jsonb_build_object('found', false); end if;
  select m.external_id into v_event from app_private.football_provider_mappings m
   where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
     and m.internal_entity_id = f.id and m.active limit 1;
  select g.* into gw from app.fantasy_fixture_assignments x
    join app.fantasy_gameweeks g on g.id = x.gameweek_id
   where x.fixture_id = f.id and x.superseded_at is null limit 1;
  select * into a from app_private.sofascore_fantasy_attempts where fixture_id = f.id;
  return jsonb_build_object(
    'found', true,
    'sofascoreEventId', v_event,
    'status', f.status::text,
    'finalized', f.finalized_at is not null,
    'homeScore', f.home_score, 'awayScore', f.away_score,
    'homeTeamId', f.home_team_id, 'awayTeamId', f.away_team_id,
    'gameweekStatus', gw.status::text,
    'adaptiveEnabled', gw.id is not null and app_private.fantasy_adaptive_enabled(gw.id),
    'observations', (select count(*) from app_private.fantasy_fixture_observations o where o.fixture_id = f.id),
    'attempt', case when a.fixture_id is null then null else jsonb_build_object(
      'status', a.status, 'attempts', a.attempts, 'nextRetryAt', a.next_retry_at,
      'lastOutcome', a.last_outcome, 'dataDigest', a.data_digest,
      'matchData', a.match_data) end,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'externalId', m.external_id, 'appPlayerId', m.internal_entity_id,
        'active', m.active, 'reviewed', coalesce((app_private.football_mapping_supporting_state(m.id) ->> 'reviewed')::boolean, false), 'version', m.source_version,
        'updatedAt', m.updated_at) order by m.external_id), '[]'::jsonb)
      from app_private.football_provider_mappings m
      where m.provider_name = 'sofascore' and m.entity_type = 'player'
        and m.external_id = any(p_player_ids)));
end $$;
revoke all on function api.service_sofascore_fantasy_context(uuid, text[]) from public, anon, authenticated;
grant execute on function api.service_sofascore_fantasy_context(uuid, text[]) to service_role;

$migration$]);
do $apply$
declare source text;
begin
  select statements[1] into source from supabase_migrations.schema_migrations where version='20261011191737';
  if encode(sha256(convert_to(source,'UTF8')),'hex')
    is distinct from 'bd6e5a19061740e5eb40343a90a05cde17e9bc5c6269d0326ae193da285c120b'
  then raise exception 'stop: migration differs from reviewed repository bytes'; end if;
  execute source;
end $apply$;
do $verify$
begin
  if md5((select prosrc from pg_proc where oid='api.service_sofascore_fantasy_context(uuid,text[])'::regprocedure))
    is distinct from '66386e3d8b4a09fb068da9a014c9acf0'
    or has_function_privilege('anon','api.service_sofascore_fantasy_context(uuid,text[])','execute')
    or has_function_privilege('authenticated','api.service_sofascore_fantasy_context(uuid,text[])','execute')
    or not has_function_privilege('service_role','api.service_sofascore_fantasy_context(uuid,text[])','execute')
  then raise exception 'stop: context body or service-only permissions differ'; end if;
end $verify$;
select version,md5(pg_get_functiondef('api.service_sofascore_fantasy_context(uuid,text[])'::regprocedure)) as context_definition_md5
from supabase_migrations.schema_migrations where version='20261011191737';
rollback;
