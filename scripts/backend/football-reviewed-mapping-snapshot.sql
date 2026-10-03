-- READ-ONLY. One consistent read of the active player mappings, for the
-- reconciler's reviewed-identity input (src/backend/fantasy/reviewed-identities.ts).
--
-- One statement means one snapshot: every row comes from the same moment. It
-- writes nothing and returns ids and versions only (no names, no personal data).
-- Save the result as JSON and pass it to scripts/backend/replay-provider-fixtures.ts
-- (--mappings), which builds the snapshot and its digest.
--
-- Row columns -> MappingRowInput: id -> mappingId, provider_name -> provider,
-- external_id -> externalId, internal_entity_id -> appPlayerId,
-- manually_corrected -> reviewed, source_version -> version, updated_at -> updatedAt.
select
  id,
  provider_name,
  external_id,
  internal_entity_id,
  source_version,
  active,
  manually_corrected,
  updated_at
from app_private.football_provider_mappings
where entity_type::text = 'player'
  and provider_name in ('sofascore', 'flashscore')
order by provider_name, external_id;
