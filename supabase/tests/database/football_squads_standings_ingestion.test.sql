begin;

select extensions.no_plan();

select api.ingest_football_catalog_entity(
  'sportsmonks', 'competition', '860',
  '{
    "name":"Botola Pro",
    "shortName":"BPL",
    "type":"league",
    "countryCode":"MA",
    "freshness":{
      "updatedAt":"2026-07-31T12:00:00Z",
      "sourceSequence":1,
      "sourceVersion":"sportsmonks:860:v1"
    }
  }'::jsonb
);
select api.ingest_football_catalog_entity(
  'sportsmonks', 'season', '26027',
  '{
    "competitionExternalId":"860",
    "label":"2025/2026",
    "startsOn":"2025-09-12",
    "endsOn":"2026-07-05",
    "current":false,
    "freshness":{
      "updatedAt":"2026-07-31T12:01:00Z",
      "sourceSequence":2,
      "sourceVersion":"sportsmonks:26027:v1"
    }
  }'::jsonb
);
select api.ingest_football_catalog_entity(
  'sportsmonks', 'team', '1001',
  '{
    "name":"Raja Club Athletic",
    "shortName":"Raja CA",
    "code":"RCA",
    "countryCode":"MA",
    "freshness":{
      "updatedAt":"2026-07-31T12:02:00Z",
      "sourceSequence":3,
      "sourceVersion":"sportsmonks:1001:v1"
    }
  }'::jsonb
);
select api.ingest_football_catalog_entity(
  'sportsmonks', 'team', '1002',
  '{
    "name":"Wydad Athletic Club",
    "shortName":"Wydad AC",
    "code":"WAC",
    "countryCode":"MA",
    "freshness":{
      "updatedAt":"2026-07-31T12:03:00Z",
      "sourceSequence":4,
      "sourceVersion":"sportsmonks:1002:v1"
    }
  }'::jsonb
);

select extensions.is(
  api.ingest_football_squad(
    'sportsmonks', '26027', '1001',
    '[
      {
        "externalPlayerId":"9001",
        "fullName":"First Goalkeeper",
        "displayName":"F. Goalkeeper",
        "firstName":"First",
        "lastName":"Goalkeeper",
        "dateOfBirth":"1998-01-02",
        "position":"goalkeeper",
        "preferredFoot":"unknown",
        "shirtNumber":1,
        "freshness":{
          "updatedAt":"2026-07-31T12:10:00Z",
          "sourceSequence":10,
          "sourceVersion":"sportsmonks:9001:v1"
        }
      },
      {
        "externalPlayerId":"9002",
        "fullName":"Second Defender",
        "displayName":"S. Defender",
        "firstName":"Second",
        "lastName":"Defender",
        "dateOfBirth":null,
        "position":"defender",
        "preferredFoot":"unknown",
        "shirtNumber":5,
        "freshness":{
          "updatedAt":"2026-07-31T12:10:00Z",
          "sourceSequence":10,
          "sourceVersion":"sportsmonks:9002:v1"
        }
      }
    ]'::jsonb,
    '2026-07-31T12:10:00Z',
    10
  ) ->> 'membershipsInserted',
  '2',
  'a historical squad batch persists completed-season memberships'
);

select extensions.is(
  api.ingest_football_squad(
    'sportsmonks', '26027', '1002',
    '[
      {
        "externalPlayerId":"9002",
        "fullName":"Second Defender",
        "displayName":"S. Defender",
        "firstName":"Second",
        "lastName":"Defender",
        "dateOfBirth":null,
        "position":"defender",
        "preferredFoot":"unknown",
        "shirtNumber":15,
        "freshness":{
          "updatedAt":"2026-07-31T12:10:00Z",
          "sourceSequence":10,
          "sourceVersion":"sportsmonks:9002:v1"
        }
      }
    ]'::jsonb,
    '2026-07-31T12:10:00Z',
    10
  ) ->> 'membershipsInserted',
  '1',
  'a transferred player can appear in two inactive historical snapshots'
);

select extensions.is(
  (select count(*)::integer from app.players),
  2,
  'provider player identities are canonical and deduplicated'
);
select extensions.is(
  (select count(*)::integer from app_private.football_provider_mappings
   where provider_name = 'sportsmonks' and entity_type = 'player'),
  2,
  'each player has one private provider mapping'
);
select extensions.is(
  (select count(*)::integer from app.team_memberships where not active),
  3,
  'historical memberships are not treated as current active contracts'
);

select extensions.is(
  api.ingest_football_standings(
    'sportsmonks', '26027',
    '[
      {
        "teamExternalId":"1001",
        "rank":1,
        "played":30,
        "won":20,
        "drawn":5,
        "lost":5,
        "goalsFor":50,
        "goalsAgainst":20,
        "points":65,
        "form":"WWDLW"
      },
      {
        "teamExternalId":"1002",
        "rank":2,
        "played":30,
        "won":18,
        "drawn":6,
        "lost":6,
        "goalsFor":44,
        "goalsAgainst":24,
        "points":60,
        "form":"WDWLW"
      }
    ]'::jsonb,
    '2026-07-31T12:20:00Z',
    20
  ) ->> 'inserted',
  '2',
  'the mapped historical standings snapshot is persisted'
);

select extensions.is(
  (select count(*)::integer from app.standings where table_type = 'overall'),
  2,
  'one canonical overall standing exists per mapped team'
);

select set_config(
  'test.team_id',
  (select internal_entity_id::text from app_private.football_provider_mappings
   where provider_name = 'sportsmonks' and entity_type = 'team' and external_id = '1001'),
  true
);
select set_config(
  'test.season_id',
  (select internal_entity_id::text from app_private.football_provider_mappings
   where provider_name = 'sportsmonks' and entity_type = 'season' and external_id = '26027'),
  true
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  jsonb_array_length(api.football_team_squad(
    current_setting('test.team_id')::uuid,
    current_setting('test.season_id')::uuid,
    'fr'
  )),
  2,
  'anonymous reads can retrieve a requested historical squad'
);
select extensions.is(
  jsonb_array_length(api.football_team_squad(
    current_setting('test.team_id')::uuid,
    null,
    'fr'
  )),
  0,
  'the default squad read remains restricted to current active memberships'
);
select extensions.is(
  jsonb_array_length(api.football_standings(
    current_setting('test.season_id')::uuid,
    '',
    'overall',
    'fr'
  )),
  2,
  'anonymous reads can retrieve the historical overall table'
);
select extensions.throws_ok(
  $$select api.ingest_football_squad(
    'sportsmonks', '26027', '1001', '[]'::jsonb,
    statement_timestamp(), 1
  )$$,
  '42501',
  null,
  'anonymous clients cannot execute squad ingestion'
);
select extensions.throws_ok(
  $$select api.ingest_football_standings(
    'sportsmonks', '26027', '[]'::jsonb,
    statement_timestamp(), 1
  )$$,
  '42501',
  null,
  'anonymous clients cannot execute standings ingestion'
);
reset role;

select * from extensions.finish();
rollback;
