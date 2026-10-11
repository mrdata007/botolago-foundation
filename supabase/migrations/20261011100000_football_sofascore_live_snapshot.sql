-- Read helper for the SofaScore path of the football-live-refresh Edge Function.
--
-- The Edge Function needs, in one call, (a) every active SofaScore provider
-- mapping, to turn SofaScore ids into internal ids, and (b) the current state of
-- the fixtures mapped to SofaScore, to write only what changed and to know which
-- mapped fixtures are in play. PostgREST exposes the `api` schema only, and
-- api.resolve_football_mapping resolves one id per call (and writes
-- last_seen_at), so no existing api function returns this. This one is a pure
-- read: service role only, security definer, search_path '', no write, no table.
--
-- Same shape as the SELECT in scripts/backend/sofascore-live-shadow-compare.ts.

create or replace function api.football_sofascore_live_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return jsonb_build_object(
    'mappings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'provider_name', m.provider_name,
        'entity_type', m.entity_type::text,
        'external_id', m.external_id,
        'internal_entity_id', m.internal_entity_id,
        'active', m.active) order by m.entity_type::text, m.external_id), '[]'::jsonb)
      from app_private.football_provider_mappings m
      where m.provider_name = 'sofascore' and m.active
    ),
    'fixtures', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id,
        'externalId', m.external_id,
        'kickoffAt', f.kickoff_at,
        'status', f.status::text,
        'period', f.period::text,
        'homeScore', f.home_score,
        'awayScore', f.away_score,
        'providerUpdatedAt', f.provider_updated_at,
        'sourceSequence', f.source_sequence,
        'finalizedAt', f.finalized_at) order by f.kickoff_at, f.id), '[]'::jsonb)
      from app_private.football_provider_mappings m
      join app.fixtures f on f.id = m.internal_entity_id
      where m.provider_name = 'sofascore' and m.entity_type = 'fixture' and m.active
    )
  );
end;
$$;

revoke all on function api.football_sofascore_live_snapshot()
  from public, anon, authenticated, service_role;
grant execute on function api.football_sofascore_live_snapshot() to service_role;

comment on function api.football_sofascore_live_snapshot() is
  'Service role, read only: the active SofaScore provider mappings and the current state of the fixtures mapped to SofaScore, for the football-live-refresh Edge Function.';
