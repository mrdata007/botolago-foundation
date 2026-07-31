begin;

select extensions.no_plan();

select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'competition', '860',
    '{
      "externalId":"860",
      "name":"Botola Pro",
      "shortName":"BPL",
      "type":"league",
      "countryCode":"MA",
      "freshness":{
        "updatedAt":"2026-07-31T12:00:00Z",
        "sourceSequence":1,
        "sourceVersion":"sportsmonks:860:v1",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'inserted',
  'competition ingestion creates a canonical identity'
);

select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28647',
    '{
      "externalId":"28647",
      "competitionExternalId":"860",
      "label":"2026/2027",
      "startsOn":"2026-09-12",
      "endsOn":"2027-07-05",
      "current":true,
      "freshness":{
        "updatedAt":"2026-07-31T12:01:00Z",
        "sourceSequence":2,
        "sourceVersion":"sportsmonks:28647:v1",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'inserted',
  'season ingestion resolves its competition mapping'
);

select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'round', '90001',
    '{
      "externalId":"90001",
      "seasonExternalId":"28647",
      "number":1,
      "name":"Round 1",
      "freshness":{
        "updatedAt":"2026-07-31T12:02:00Z",
        "sourceSequence":3,
        "sourceVersion":"sportsmonks:90001:v1",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'inserted',
  'round ingestion resolves its season mapping'
);

select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'team', '1001',
    '{
      "externalId":"1001",
      "name":"Raja Club Athletic",
      "shortName":"Raja CA",
      "code":"RCA",
      "countryCode":"MA",
      "freshness":{
        "updatedAt":"2026-07-31T12:03:00Z",
        "sourceSequence":4,
        "sourceVersion":"sportsmonks:1001:v1",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'inserted',
  'team ingestion creates a provider-independent team'
);

select extensions.is(
  (select count(*)::integer from app_private.football_provider_mappings
   where provider_name = 'sportsmonks' and entity_type in ('competition', 'season', 'round', 'team')),
  4,
  'each external catalog identity has exactly one private mapping'
);
select extensions.is(
  (select count(*)::integer from app.competitions where name = 'Botola Pro'),
  1,
  'one canonical competition exists'
);
select extensions.is(
  (select count(*)::integer from app.seasons where label = '2026/2027' and is_current),
  1,
  'provider current-season designation is persisted'
);
select extensions.is(
  (select iso_alpha3 from app.countries where iso_alpha2 = 'MA'),
  'MAR',
  'the reviewed Morocco reference identity is created on first use'
);

select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'team', '1001',
    '{
      "externalId":"1001",
      "name":"Raja Club Athletic",
      "shortName":"Raja CA",
      "code":"RCA",
      "countryCode":"MA",
      "freshness":{
        "updatedAt":"2026-07-31T12:03:00Z",
        "sourceSequence":4,
        "sourceVersion":"sportsmonks:1001:v1",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'skipped',
  'the same provider version is skipped idempotently'
);
select extensions.is(
  (select count(*)::integer from app.teams where name = 'Raja Club Athletic'),
  1,
  'idempotent delivery does not duplicate the canonical team'
);

select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'team', '1001',
    '{
      "externalId":"1001",
      "name":"Raja Club Athletic Updated",
      "shortName":"Raja CA",
      "code":"RCA",
      "countryCode":"MA",
      "freshness":{
        "updatedAt":"2026-07-31T13:03:00Z",
        "sourceSequence":5,
        "sourceVersion":"sportsmonks:1001:v2",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'updated',
  'a newer provider version updates the mapped team'
);
select extensions.is(
  (select name from app.teams where code = 'RCA'),
  'Raja Club Athletic Updated',
  'the canonical team reflects the newer normalized data'
);

select extensions.throws_ok(
  $$select api.ingest_football_catalog_entity(
    'sportsmonks', 'team', '1001',
    '{
      "externalId":"1001",
      "name":"Stale Raja",
      "shortName":"Raja CA",
      "code":"RCA",
      "countryCode":"MA",
      "freshness":{
        "updatedAt":"2026-07-31T12:03:00Z",
        "sourceSequence":4,
        "sourceVersion":"sportsmonks:1001:v1",
        "provisional":false
      }
    }'::jsonb
  )$$,
  'P0001',
  'STALE_UPDATE',
  'an older catalog payload cannot overwrite newer canonical data'
);

select extensions.throws_ok(
  $$select api.ingest_football_catalog_entity(
    'sportsmonks', 'round', 'missing-season-round',
    '{
      "externalId":"missing-season-round",
      "seasonExternalId":"missing",
      "number":2,
      "name":"Round 2",
      "freshness":{
        "updatedAt":"2026-07-31T14:00:00Z",
        "sourceSequence":6,
        "sourceVersion":"sportsmonks:missing:v1",
        "provisional":false
      }
    }'::jsonb
  )$$,
  'P0002',
  'MAPPING_NOT_FOUND',
  'catalog dependencies must be mapped before child ingestion'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select api.ingest_football_catalog_entity(
    'sportsmonks', 'team', 'forbidden', '{}'::jsonb
  )$$,
  '42501',
  null,
  'anonymous clients cannot execute catalog ingestion'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select extensions.throws_ok(
  $$select api.ingest_football_catalog_entity(
    'sportsmonks', 'team', 'forbidden', '{}'::jsonb
  )$$,
  '42501',
  null,
  'authenticated browser clients cannot execute catalog ingestion'
);
reset role;

select * from extensions.finish();
rollback;
