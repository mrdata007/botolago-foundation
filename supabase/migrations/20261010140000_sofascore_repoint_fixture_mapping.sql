-- SofaScore gives a replayed (postponed) match a NEW event id. The mapping table is
-- unique on (provider, entity type, external id) and on (provider, entity type,
-- internal entity id), and api.resolve_football_mapping only inserts or confirms
-- (it raises MAPPING_COLLISION rather than move a mapping), so a fixture's SofaScore
-- mapping could not follow the match to its replacement event.
--
-- This adds one deliberately narrow service-role function that moves an existing
-- SofaScore FIXTURE mapping from its old event id to the replacement event id, in
-- place (same mapping row), and records the move in app_private.admin_audit_events
-- (the audit trail the football mapping review flow already uses, written through
-- app_private.write_admin_audit with no staff actor because the caller is a trusted
-- job). It does not touch api.resolve_football_mapping, any other provider, or any
-- other entity type. It creates no table and no grant on a table.

create or replace function api.repoint_football_fixture_mapping(
  p_provider_name text,
  p_internal_fixture_id uuid,
  p_old_external_id text,
  p_new_external_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mapping app_private.football_provider_mappings%rowtype;
  v_taken_by uuid;
  v_first text;
  v_second text;
  v_audit bigint;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_provider_name is distinct from 'sofascore' then
    raise exception using errcode = '22023', message = 'REPOINT_PROVIDER_NOT_ALLOWED';
  end if;
  if p_internal_fixture_id is null
    or p_old_external_id is null or p_old_external_id <> btrim(p_old_external_id)
    or char_length(p_old_external_id) not between 1 and 200
    or p_new_external_id is null or p_new_external_id <> btrim(p_new_external_id)
    or char_length(p_new_external_id) not between 1 and 200
    or p_old_external_id = p_new_external_id then
    raise exception using errcode = '22023', message = 'REPOINT_INVALID_ARGUMENT';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 10 and 500 then
    raise exception using errcode = '22023', message = 'REPOINT_REASON_REQUIRED';
  end if;

  -- Same lock keys as api.resolve_football_mapping, taken in a fixed order so two
  -- concurrent calls (or a call racing the ingestion) cannot deadlock.
  v_first := least(p_old_external_id, p_new_external_id);
  v_second := greatest(p_old_external_id, p_new_external_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sofascore:fixture:' || v_first, 0));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sofascore:fixture:' || v_second, 0));

  select mapping.* into v_mapping
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = 'sofascore'
    and mapping.entity_type = 'fixture'
    and mapping.internal_entity_id = p_internal_fixture_id
  for update;

  if not found or not v_mapping.active then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  -- Idempotent: already moved, nothing to do and nothing recorded.
  if v_mapping.external_id = p_new_external_id then
    return jsonb_build_object(
      'status', 'unchanged', 'mappingId', v_mapping.id,
      'fixtureId', p_internal_fixture_id, 'externalId', p_new_external_id);
  end if;

  if v_mapping.external_id <> p_old_external_id then
    raise exception using errcode = 'P0001', message = 'MAPPING_OLD_ID_MISMATCH';
  end if;

  select mapping.internal_entity_id into v_taken_by
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = 'sofascore'
    and mapping.entity_type = 'fixture'
    and mapping.external_id = p_new_external_id;
  if found then
    raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
  end if;

  begin
    update app_private.football_provider_mappings
    set external_id = p_new_external_id,
        last_seen_at = greatest(last_seen_at, statement_timestamp()),
        source_version = left('repoint-from-' || p_old_external_id, 160)
    where id = v_mapping.id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
  end;

  v_audit := app_private.write_admin_audit(
    null, 'football.repoint_fixture_mapping', 'football', p_internal_fixture_id,
    p_reason, gen_random_uuid(), gen_random_uuid(), null,
    jsonb_build_object('provider', 'sofascore', 'entityType', 'fixture',
      'mappingId', v_mapping.id, 'externalId', p_old_external_id),
    jsonb_build_object('provider', 'sofascore', 'entityType', 'fixture',
      'mappingId', v_mapping.id, 'externalId', p_new_external_id));

  return jsonb_build_object(
    'status', 'repointed', 'mappingId', v_mapping.id,
    'fixtureId', p_internal_fixture_id, 'oldExternalId', p_old_external_id,
    'externalId', p_new_external_id, 'auditId', v_audit);
end;
$$;

revoke all on function api.repoint_football_fixture_mapping(text, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function api.repoint_football_fixture_mapping(text, uuid, text, text, text)
  to service_role;

comment on function api.repoint_football_fixture_mapping(text, uuid, text, text, text) is
  'Service role: moves the active SofaScore fixture mapping of one internal fixture from its old event id to the replacement event id (a replayed postponed match), in place, and audits it. SofaScore and fixtures only; refuses if the new id is already mapped; idempotent.';
