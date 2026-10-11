-- SofaScore-only Fantasy observations (docs/backend/SOFASCORE_FANTASY_SIMPLE.md).
--
-- Owner decisions of 2026-10-11 (M6, M8): Fantasy player points come from
-- SofaScore alone. Minutes, started, goals, own goals, cards, clean sheet and
-- goals conceded always count. Assists, saves, penalties saved and penalties
-- missed count only on a FULL-coverage SofaScore match; on a limited-coverage
-- match they are unknown (never zero) and the fixture scores in simple mode.
--
-- Nothing here scores, finalizes or changes a published point. The new
-- service-only function api.service_record_sofascore_fantasy_observation checks
-- every identity against the reviewed SofaScore player mappings and the
-- fixture against its reviewed SofaScore fixture mapping, links the fixture to
-- its SofaScore match, and hands the facts to the same recorder as every other
-- source (api.service_record_fantasy_observation), under the recorder's
-- existing source label 'provider-reconciled'. The recorder, the scoring worker
-- and the ruleset are unchanged: this migration adds one function.
--
-- Prerequisite: migration 20261003180000 (the 'provider-reconciled' source, the
-- recorder's guard for it, and app_private.football_provider_fixture_links).
do $$
begin
  if to_regprocedure('api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)') is null
    or to_regclass('app_private.football_provider_fixture_links') is null then
    raise exception 'sofascore_fantasy_prerequisite_missing: apply migration 20261003180000 first';
  end if;
end $$;

create function api.service_record_sofascore_fantasy_observation(
  p_fixture_id uuid, p_request jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  payload jsonb := p_request->'payload';
  f app.fixtures%rowtype;
  player jsonb; v_external text; v_mapping uuid; v_state jsonb; v_event text;
  link_fixture uuid; before_count bigint; result jsonb; latest bigint;
  v_rows jsonb; v_absent jsonb; v_coverage text := p_request->>'coverage';
  e record;
begin
  if not app_private.is_service_request() then
    raise exception using errcode='PT403', message='forbidden'; end if;
  if p_fixture_id is null or p_dry_run is null or jsonb_typeof(p_request) is distinct from 'object'
    or jsonb_typeof(payload) is distinct from 'object'
    or jsonb_typeof(payload->'players') is distinct from 'array'
    or coalesce(p_request->>'sofascoreEventId', '') !~ '^[0-9]{1,20}$'
    or coalesce(p_request->>'mappingSnapshotDigest', '') !~ '^[0-9a-f]{64}$'
    or v_coverage is null or v_coverage not in ('full', 'limited')
    or coalesce((payload->>'squadComplete')::boolean, false) is not true then
    raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;
  -- A provider match carries facts, never an opinion: estimates, corrections and
  -- caller-supplied non-participants stay out. The non-participants are computed below.
  if app_private.fantasy_observation_estimated(payload) or payload ? 'expectedDigest'
    or payload ? 'reviewer' or payload ? 'estimateAcceptance' or payload ? 'verifiedNonParticipants'
    or payload ? 'estimatedNonParticipants' or coalesce((payload->>'anonymousStarters')::integer, 0) <> 0 then
    raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;
  v_event := p_request->>'sofascoreEventId';

  -- Evidence is SofaScore's, as a fact or as unknown, and nothing else. On a
  -- limited-coverage match the player-statistics fields cannot be known: saves,
  -- penalties saved and penalties missed are never facts there, and an assist is
  -- one only when an incident names the assister.
  for e in select value as player_row from jsonb_array_elements(payload->'players') loop
    if jsonb_typeof(e.player_row->'evidence') is distinct from 'object'
      or exists(select 1 from jsonb_each(e.player_row->'evidence') ev
                where ev.value->>'source' is distinct from 'sofascore'
                   or ev.value->>'state' not in ('verified', 'unknown')) then
      raise exception using errcode='PT400', message='sofascore_evidence_invalid'; end if;
    if v_coverage = 'limited' and exists(
        select 1 from jsonb_each(e.player_row->'evidence') ev
         where ev.key in ('saves', 'penaltiesSaved', 'penaltiesMissed') and ev.value->>'state' = 'verified') then
      raise exception using errcode='PT400', message='sofascore_limited_coverage_fields'; end if;
    if v_coverage = 'limited' and (e.player_row->'stats' ?| array['saves', 'penaltiesSaved', 'penaltiesMissed']) then
      raise exception using errcode='PT400', message='sofascore_limited_coverage_fields'; end if;
  end loop;

  select * into f from app.fixtures where id = p_fixture_id;
  if not found then raise exception using errcode='PT404', message='sofascore_fixture_not_found'; end if;

  -- The fixture is the one a reviewed mapping says this SofaScore match is.
  if not exists(select 1 from app_private.football_provider_mappings m
                 where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
                   and m.external_id = v_event and m.internal_entity_id = f.id and m.active) then
    raise exception using errcode='PT409', message='sofascore_fixture_mapping_missing'; end if;

  -- Every player is a reviewed SofaScore identity pointing at the player the row names.
  for player in select value from jsonb_array_elements(payload->'players') loop
    v_external := player#>>'{identity,sofascoreId}';
    if v_external is null or char_length(v_external) not between 1 and 200 then
      raise exception using errcode='PT400', message='sofascore_identity_missing'; end if;
    select m.id into v_mapping from app_private.football_provider_mappings m
     where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.external_id = v_external;
    v_state := case when v_mapping is null then null
                  else app_private.football_mapping_supporting_state(v_mapping) end;
    if v_state is null or (v_state->>'active')::boolean is not true or (v_state->>'reviewed')::boolean is not true
      or lower(v_state->>'appPlayerId') is distinct from lower(player->>'playerId') then
      raise exception using errcode='PT409', message='sofascore_identity_not_reviewed',
        detail = 'sofascore:' || v_external; end if;
  end loop;

  -- Squad members of either team who are not in the rows did not take part: the
  -- builder sent a row for everyone SofaScore says appeared, and refuses the match
  -- when an appearing player has no reviewed mapping.
  v_rows := payload->'players';
  select coalesce(jsonb_agg(distinct m.player_id::text), '[]'::jsonb) into v_absent
    from app.team_memberships m
   where m.season_id = f.season_id and m.team_id in (f.home_team_id, f.away_team_id)
     and m.valid_from <= f.kickoff_at::date and (m.valid_to is null or m.valid_to >= f.kickoff_at::date)
     and not exists(select 1 from jsonb_array_elements(v_rows) r where r->>'playerId' = m.player_id::text);
  payload := (payload - 'squadComplete') || jsonb_build_object('verifiedNonParticipants', v_absent);

  begin
    select fixture_id into link_fixture from app_private.football_provider_fixture_links
     where provider_name = 'sofascore' and external_fixture_id = v_event;
    if link_fixture is not null and link_fixture <> f.id then
      raise exception using errcode='PT409', message='sofascore_fixture_link_conflict'; end if;
    if exists(select 1 from app_private.football_provider_fixture_links
               where provider_name = 'sofascore' and fixture_id = f.id and external_fixture_id <> v_event) then
      raise exception using errcode='PT409', message='sofascore_fixture_link_conflict'; end if;
    insert into app_private.football_provider_fixture_links(provider_name, external_fixture_id, fixture_id)
    values ('sofascore', v_event, f.id) on conflict do nothing;
    if not exists(select 1 from app_private.football_provider_fixture_links
                   where provider_name = 'sofascore' and external_fixture_id = v_event and fixture_id = f.id) then
      raise exception using errcode='PT409', message='sofascore_fixture_link_conflict'; end if;

    select count(*) into before_count from app_private.fantasy_fixture_observations where fixture_id = f.id;
    perform set_config('botolago.reconciled_ingestion', 'on', true);
    result := api.service_record_fantasy_observation(f.id,
      payload || jsonb_build_object('sourceRefs', jsonb_build_object(
        'sofascoreEventId', v_event,
        'mappingSnapshotDigest', p_request->>'mappingSnapshotDigest',
        'coverage', v_coverage)),
      'provider-reconciled');
    perform set_config('botolago.reconciled_ingestion', '', true);
    select id into latest from app_private.fantasy_fixture_observations
     where fixture_id = f.id order by observed_at desc, id desc limit 1;
    result := result || jsonb_build_object(
      'created', (select count(*) from app_private.fantasy_fixture_observations where fixture_id = f.id) > before_count,
      'latest', latest = (result->>'observationId')::bigint,
      'dryRun', p_dry_run,
      'coverage', v_coverage,
      'nonParticipants', jsonb_array_length(v_absent));
    if p_dry_run or not (result->>'created')::boolean then
      raise exception using errcode='P0001', message='sofascore_dry_run_rollback';
    end if;
  exception when raise_exception then
    perform set_config('botolago.reconciled_ingestion', '', true);
    if sqlerrm = 'sofascore_dry_run_rollback' then return result; end if;
    raise;
  end;
  return result;
end $$;
revoke all on function api.service_record_sofascore_fantasy_observation(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function api.service_record_sofascore_fantasy_observation(uuid, jsonb, boolean) to service_role;
