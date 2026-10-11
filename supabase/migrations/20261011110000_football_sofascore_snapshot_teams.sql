-- Teams on the SofaScore live snapshot, for the SofaScore match-details path.
--
-- api.football_sofascore_live_snapshot (20261011100000) returns each mapped
-- fixture without its two clubs. Match details must name each club by its
-- SofaScore team id (api.ingest_football_match_details checks that every
-- teamExternalId is one of the fixture's two mapped clubs), and the backfill
-- works from a fixture id alone: without the clubs it would need a fourth
-- provider request per fixture to read them. The snapshot already carries every
-- active SofaScore team mapping, so the internal home and away team ids are all
-- that is missing; the function maps them back to SofaScore ids.
--
-- Same signature and grants; the only change is two more keys per fixture
-- (`homeTeamId`, `awayTeamId`, internal uuids). Existing readers ignore keys
-- they do not know. Pure read, as before.

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
        'finalizedAt', f.finalized_at,
        'homeTeamId', f.home_team_id,
        'awayTeamId', f.away_team_id) order by f.kickoff_at, f.id), '[]'::jsonb)
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
  'Service role, read only: the active SofaScore provider mappings and the current state of the fixtures mapped to SofaScore (with their internal home and away team ids), for the football-live-refresh Edge Function.';
