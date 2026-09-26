begin;

select extensions.no_plan();

-- Player attributes with provenance (20260926060000). The five resolved
-- columns of app.players have one writer, the resolver; every value is an
-- observation with a source; manual corrections survive provider imports;
-- existing values seed as legacy without changing anything.

insert into app.countries (id, iso_alpha2, iso_alpha3)
values
  ('a1000000-0000-4000-8000-000000000001', 'MA', 'MAR'),
  ('a1000000-0000-4000-8000-000000000002', 'SN', 'SEN')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Structure and privileges
-- ---------------------------------------------------------------------------
select extensions.has_table('app_private', 'player_attribute_observations', 'observations table exists');
select extensions.has_column('app', 'players', 'height_cm', 'players.height_cm exists');
select extensions.has_column('app', 'players', 'detailed_position', 'players.detailed_position exists');
select extensions.ok(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class
   where oid = 'app_private.player_attribute_observations'::regclass),
  'observations: RLS enabled and forced'
);
select extensions.ok(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class
   where oid = 'app_private.player_attribute_source_priority'::regclass),
  'source priority: RLS enabled and forced'
);
select extensions.ok(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class
   where oid = 'app_private.player_attribute_observation_confirmations'::regclass),
  'confirmations: RLS enabled and forced'
);
select extensions.ok(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) role_name
    cross join unnest(array[
      'app_private.resolve_player_attributes(uuid[])',
      'app_private.record_player_attribute_observation(uuid,text,text,numeric,text,text,text,timestamptz,uuid,text)',
      'app_private.record_provider_player_attributes(uuid,text,text,date,app.preferred_foot,timestamptz)',
      'app_private.seed_legacy_player_attributes()',
      'app_private.player_attribute_observation_freshness(uuid)',
      'app_private.country_exists(uuid)'
    ]) function_signature
    where pg_catalog.has_function_privilege(role_name, function_signature, 'execute')
  ),
  'no client role can execute the attribute functions'
);
select extensions.ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) role_name
    where pg_catalog.has_table_privilege(role_name, 'app_private.player_attribute_observations', 'select')
      or pg_catalog.has_table_privilege(role_name, 'app_private.player_attribute_observations', 'insert')
  ),
  'no client role can read or write observations'
);
select extensions.ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) role_name
    where pg_catalog.has_table_privilege(role_name, 'app_private.player_attribute_observation_confirmations', 'select')
      or pg_catalog.has_table_privilege(role_name, 'app_private.player_attribute_observation_confirmations', 'insert')
  ),
  'no client role can read or write confirmations'
);

-- ---------------------------------------------------------------------------
-- Seeding: existing values become legacy observations and nothing changes
-- ---------------------------------------------------------------------------
-- Stand-in for players that existed before the migration. The flag is set
-- here only to create that "before" state; nothing else in this file sets it.
select pg_catalog.set_config('botolago.player_attribute_writer', 'resolver', true);
insert into app.players (
  id, slug, full_name, display_name, position,
  date_of_birth, nationality_country_id, preferred_foot
) values
  ('a2000000-0000-4000-8000-000000000001', 'seed-player-1', 'Seed Player One', 'S. One',
    'defender', '2003-05-04', 'a1000000-0000-4000-8000-000000000001', 'left'),
  ('a2000000-0000-4000-8000-000000000002', 'seed-player-2', 'Seed Player Two', 'S. Two',
    'forward', '2001-11-30', null, 'unknown'),
  ('a2000000-0000-4000-8000-000000000003', 'seed-player-3', 'Seed Player Three', 'S. Three',
    'midfielder', null, null, 'unknown');
select pg_catalog.set_config('botolago.player_attribute_writer', '', true);

-- Player 2 has a SportsMonks mapping. A mapping does not say where the value
-- came from, so it still seeds as legacy.
select api.resolve_football_mapping(
  'sportsmonks', 'player', '880002', 'a2000000-0000-4000-8000-000000000002',
  'sportsmonks:880002:v1', '2026-09-01T00:00:00Z'
);

create temporary table seed_before on commit drop as
select id, date_of_birth, nationality_country_id, preferred_foot, updated_at
from app.players where slug like 'seed-player-%';

select extensions.is(
  app_private.seed_legacy_player_attributes(),
  4,
  'seeding records every existing value: two dates of birth, one nationality, one foot'
);
select extensions.is(
  (select count(*)::integer from app_private.player_attribute_observations observation
   join seed_before on seed_before.id = observation.player_id
   where observation.source_kind = 'legacy' and observation.provider_name is null
     and observation.note like 'Unverified%'),
  4,
  'seeded values are legacy and marked unverified'
);
select extensions.is(
  (select source_kind from app_private.player_attribute_observations
   where player_id = 'a2000000-0000-4000-8000-000000000002' and attribute = 'date_of_birth'),
  'legacy',
  'a player with a SportsMonks mapping is still seeded as legacy, not as SportsMonks'
);
select extensions.is(
  app_private.resolve_player_attributes(array(select id from seed_before)),
  0,
  'resolving after seeding changes zero players'
);
select extensions.is(
  (select count(*)::integer from app.players player join seed_before using (id)
   where (player.date_of_birth, player.nationality_country_id, player.preferred_foot, player.updated_at)
     is distinct from (seed_before.date_of_birth, seed_before.nationality_country_id,
       seed_before.preferred_foot, seed_before.updated_at)),
  0,
  'no seeded player value or updated_at changed'
);
select extensions.is(
  app_private.seed_legacy_player_attributes(),
  0,
  'seeding again records nothing'
);

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  $$insert into app.players (id, slug, full_name, display_name, position, date_of_birth)
    values ('a2000000-0000-4000-8000-000000000009', 'guard-insert', 'Guard Insert',
      'G. Insert', 'defender', '2002-02-02')$$,
  '55000', 'PLAYER_ATTRIBUTES_RESOLVER_ONLY',
  'an insert that sets a resolved column is rejected'
);
select extensions.throws_ok(
  $$insert into app.players (id, slug, full_name, display_name, position, preferred_foot)
    values ('a2000000-0000-4000-8000-000000000009', 'guard-insert', 'Guard Insert',
      'G. Insert', 'defender', 'right')$$,
  '55000', 'PLAYER_ATTRIBUTES_RESOLVER_ONLY',
  'an insert that sets the foot is rejected'
);
select extensions.lives_ok(
  $$insert into app.players (id, slug, full_name, display_name, position)
    values ('a2000000-0000-4000-8000-000000000004', 'plain-player', 'Plain Player',
      'P. Plain', 'goalkeeper')$$,
  'an insert without resolved columns is allowed'
);
select extensions.throws_ok(
  $$update app.players set date_of_birth = '1999-09-09'
    where id = 'a2000000-0000-4000-8000-000000000001'$$,
  '55000', 'PLAYER_ATTRIBUTES_RESOLVER_ONLY',
  'a direct update of date_of_birth is rejected'
);
select extensions.throws_ok(
  $$update app.players set nationality_country_id = null
    where id = 'a2000000-0000-4000-8000-000000000001'$$,
  '55000', 'PLAYER_ATTRIBUTES_RESOLVER_ONLY',
  'a direct update of nationality is rejected'
);
select extensions.lives_ok(
  $$update app.players set display_name = 'S. One Renamed'
    where id = 'a2000000-0000-4000-8000-000000000001'$$,
  'an update of other columns is allowed'
);

-- ---------------------------------------------------------------------------
-- The flag is restored after the resolver's own write
-- ---------------------------------------------------------------------------
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000004', 'height_cm', null, 188,
  'provider', 'bsd', 'bsd:player:4', '2026-09-20T10:00:00Z'
);
select extensions.is(
  app_private.resolve_player_attributes(array['a2000000-0000-4000-8000-000000000004'::uuid]),
  1,
  'the resolver writes a new height and reports one player changed'
);
select extensions.is(
  coalesce(current_setting('botolago.player_attribute_writer', true), ''),
  '',
  'after resolving, the write flag is back to its previous (empty) value'
);
select extensions.throws_ok(
  $$update app.players set height_cm = 150
    where id = 'a2000000-0000-4000-8000-000000000004'$$,
  '55000', 'PLAYER_ATTRIBUTES_RESOLVER_ONLY',
  'a direct write later in the same transaction is still rejected'
);
select pg_catalog.set_config('botolago.player_attribute_writer', 'something-else', true);
select app_private.resolve_player_attributes(array['a2000000-0000-4000-8000-000000000004'::uuid]);
select extensions.is(
  current_setting('botolago.player_attribute_writer', true),
  'something-else',
  'the resolver restores whatever value the flag had before'
);
select pg_catalog.set_config('botolago.player_attribute_writer', '', true);
select extensions.is(
  (select height_cm::integer from app.players where id = 'a2000000-0000-4000-8000-000000000004'),
  188,
  'height_cm comes from the observation'
);

-- ---------------------------------------------------------------------------
-- Priority: manual beats providers, providers beat legacy
-- ---------------------------------------------------------------------------
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000001', 'date_of_birth', '2003-05-06', null,
  'provider', 'bsd', 'bsd:player:1', '2026-09-21T10:00:00Z'
);
select app_private.resolve_player_attributes(array['a2000000-0000-4000-8000-000000000001'::uuid]);
select extensions.is(
  (select date_of_birth from app.players where id = 'a2000000-0000-4000-8000-000000000001'),
  date '2003-05-06',
  'a provider value replaces a legacy one'
);
select extensions.ok(
  exists (
    select 1 from app_private.player_attribute_conflicts conflict
    where conflict.player_id = 'a2000000-0000-4000-8000-000000000001'
      and conflict.attribute = 'date_of_birth'
      and conflict.observations @> '[{"source": "legacy", "value": "2003-05-04"}]'
      and conflict.observations -> 0 ->> 'source' = 'bsd'
  ),
  'the disagreement shows as a conflict that keeps the legacy value, best source first'
);

select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000004', 'detailed_position', 'rb', null,
  'manual', null, 'data-desk', '2026-09-21T11:00:00Z',
  'a9000000-0000-4000-8000-000000000001', 'Checked against the club sheet'
);
select app_private.resolve_player_attributes(array['a2000000-0000-4000-8000-000000000004'::uuid]);
select extensions.is(
  (select detailed_position::text from app.players where id = 'a2000000-0000-4000-8000-000000000004'),
  'rb',
  'a manual detailed position is written'
);

-- ---------------------------------------------------------------------------
-- Recording rules: deduplicated, newest per source, append-only, validated
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.record_player_attribute_observation(
    'a2000000-0000-4000-8000-000000000004', 'height_cm', null, 188,
    'provider', 'bsd', 'bsd:player:4', '2026-09-22T10:00:00Z'
  ),
  (select id from app_private.player_attribute_observations
   where player_id = 'a2000000-0000-4000-8000-000000000004' and attribute = 'height_cm'
     and superseded_at is null),
  'the same value from the same source adds no row'
);
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000004', 'height_cm', null, 170,
  'provider', 'bsd', 'bsd:player:4', '2026-09-01T10:00:00Z'
);
select extensions.is(
  (select value_numeric::integer from app_private.player_attribute_observations
   where player_id = 'a2000000-0000-4000-8000-000000000004' and attribute = 'height_cm'
     and superseded_at is null),
  188,
  'an older observation never replaces a newer one from the same source'
);
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000004', 'height_cm', null, 189,
  'provider', 'bsd', 'bsd:player:4', '2026-09-23T10:00:00Z'
);
select extensions.is(
  (select count(*)::integer from app_private.player_attribute_observations
   where player_id = 'a2000000-0000-4000-8000-000000000004' and attribute = 'height_cm'),
  2,
  'a newer value from the same source adds a row'
);
select extensions.is(
  (select count(*)::integer from app_private.player_attribute_observations
   where player_id = 'a2000000-0000-4000-8000-000000000004' and attribute = 'height_cm'
     and superseded_at is null),
  1,
  'and supersedes the old one, leaving one current observation per source'
);

select extensions.throws_ok(
  $$update app_private.player_attribute_observations set value_numeric = 200
    where player_id = 'a2000000-0000-4000-8000-000000000004' and attribute = 'height_cm'$$,
  '55000', 'PLAYER_ATTRIBUTE_OBSERVATIONS_APPEND_ONLY',
  'an observation value cannot be updated'
);
select extensions.throws_ok(
  $$delete from app_private.player_attribute_observations
    where player_id = 'a2000000-0000-4000-8000-000000000004'$$,
  '55000', 'PLAYER_ATTRIBUTE_OBSERVATIONS_APPEND_ONLY',
  'observations cannot be deleted'
);
select extensions.throws_ok(
  $$truncate app_private.player_attribute_observations$$,
  '55000', 'PLAYER_ATTRIBUTE_OBSERVATIONS_APPEND_ONLY',
  'observations cannot be truncated'
);
select extensions.throws_ok(
  $$select app_private.record_player_attribute_observation(
    'a2000000-0000-4000-8000-000000000004', 'date_of_birth', '2999-01-01', null,
    'provider', 'bsd', null, now())$$,
  '23514', 'INVALID_ATTRIBUTE_VALUE',
  'a date of birth in the future is rejected'
);
select extensions.throws_ok(
  $$select app_private.record_player_attribute_observation(
    'a2000000-0000-4000-8000-000000000004', 'nationality', 'ZZ', null,
    'provider', 'bsd', null, now())$$,
  '23514', 'INVALID_ATTRIBUTE_VALUE',
  'an unknown country code is rejected'
);
select extensions.throws_ok(
  $$select app_private.record_player_attribute_observation(
    'a2000000-0000-4000-8000-000000000004', 'height_cm', null, 300,
    'provider', 'bsd', null, now())$$,
  '23514', 'INVALID_ATTRIBUTE_VALUE',
  'a height outside 140-215 is rejected'
);
select extensions.throws_ok(
  $$select app_private.record_player_attribute_observation(
    'a2000000-0000-4000-8000-000000000004', 'preferred_foot', 'unknown', null,
    'provider', 'bsd', null, now())$$,
  '23514', 'INVALID_ATTRIBUTE_VALUE',
  '"unknown" is not an observation'
);
select extensions.throws_ok(
  $$select app_private.record_player_attribute_observation(
    'a2000000-0000-4000-8000-000000000004', 'preferred_foot', 'left', null,
    'manual', null, null, now())$$,
  '23514', null,
  'a manual observation needs the person who made it'
);

-- ---------------------------------------------------------------------------
-- The SportsMonks squad import records observations instead of assigning
-- ---------------------------------------------------------------------------
select api.ingest_football_catalog_entity(
  'sportsmonks', 'competition', '860',
  '{"name":"Botola Pro","shortName":"BPL","type":"league","countryCode":"MA",
    "freshness":{"updatedAt":"2026-07-31T12:00:00Z","sourceSequence":1,"sourceVersion":"sportsmonks:860:v1"}}'::jsonb
);
select api.ingest_football_catalog_entity(
  'sportsmonks', 'season', '26027',
  '{"competitionExternalId":"860","label":"2025/2026","startsOn":"2025-09-12","endsOn":"2026-07-05","current":false,
    "freshness":{"updatedAt":"2026-07-31T12:01:00Z","sourceSequence":2,"sourceVersion":"sportsmonks:26027:v1"}}'::jsonb
);
select api.ingest_football_catalog_entity(
  'sportsmonks', 'team', '1001',
  '{"name":"Raja Club Athletic","shortName":"Raja CA","code":"RCA","countryCode":"MA",
    "freshness":{"updatedAt":"2026-07-31T12:02:00Z","sourceSequence":3,"sourceVersion":"sportsmonks:1001:v1"}}'::jsonb
);

create function pg_temp.squad_payload(p_date_of_birth text, p_foot text, p_updated_at text, p_version text)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'externalPlayerId', '9101', 'fullName', 'Young Fullback', 'displayName', 'Y. Fullback',
    'firstName', 'Young', 'lastName', 'Fullback', 'dateOfBirth', p_date_of_birth,
    'position', 'defender', 'preferredFoot', p_foot, 'shirtNumber', 27,
    'freshness', jsonb_build_object('updatedAt', p_updated_at, 'sourceSequence', 10,
      'sourceVersion', 'sportsmonks:9101:' || p_version)
  ));
$$;

select extensions.is(
  api.ingest_football_squad('sportsmonks', '26027', '1001',
    pg_temp.squad_payload('2004-03-27', 'right', '2026-08-01T10:00:00Z', 'v1'),
    '2026-08-01T10:00:00Z', 10) ->> 'playersInserted',
  '1',
  'the squad import still inserts a new player'
);
create temporary table ingested on commit drop as
select mapping.internal_entity_id as player_id
from app_private.football_provider_mappings mapping
where mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'player'
  and mapping.external_id = '9101';

select extensions.is(
  (select date_of_birth from app.players where id = (select player_id from ingested)),
  date '2004-03-27',
  'the imported date of birth reaches the player through the resolver'
);
select extensions.is(
  (select preferred_foot::text from app.players where id = (select player_id from ingested)),
  'right',
  'the imported foot reaches the player through the resolver'
);
select extensions.is(
  (select count(*)::integer from app_private.player_attribute_observations
   where player_id = (select player_id from ingested)
     and source_kind = 'provider' and provider_name = 'sportsmonks' and source_ref = '9101'),
  2,
  'the import recorded two SportsMonks observations, referenced by the external id'
);

-- A person corrects the date of birth.
select app_private.record_player_attribute_observation(
  (select player_id from ingested), 'date_of_birth', '2004-03-28', null,
  'manual', null, 'data-desk', '2026-08-02T09:00:00Z',
  'a9000000-0000-4000-8000-000000000001', 'Birth certificate'
);
select app_private.resolve_player_attributes(array(select player_id from ingested));

-- SportsMonks then sends another, different date.
select extensions.is(
  api.ingest_football_squad('sportsmonks', '26027', '1001',
    pg_temp.squad_payload('2004-03-26', 'right', '2026-08-03T10:00:00Z', 'v2'),
    '2026-08-03T10:00:00Z', 11) ->> 'playersUpdated',
  '1',
  'the squad import still updates a known player'
);
select extensions.is(
  (select date_of_birth from app.players where id = (select player_id from ingested)),
  date '2004-03-28',
  'the manual correction survives the next SportsMonks import'
);
select extensions.ok(
  exists (
    select 1 from app_private.player_attribute_conflicts conflict
    where conflict.player_id = (select player_id from ingested)
      and conflict.attribute = 'date_of_birth'
      and conflict.observations -> 0 ->> 'source' = 'manual'
      and conflict.observations @> '[{"source": "sportsmonks", "value": "2004-03-26"}]'
  ),
  'the SportsMonks disagreement is kept as a conflict for the data desk'
);
select extensions.is(
  (select count(*)::integer from app_private.player_attribute_observations
   where player_id = (select player_id from ingested) and attribute = 'date_of_birth'
     and provider_name = 'sportsmonks' and superseded_at is not null),
  1,
  'the earlier SportsMonks date is kept as superseded history'
);

-- A later payload without a date of birth and with foot unknown.
select api.ingest_football_squad('sportsmonks', '26027', '1001',
  pg_temp.squad_payload(null, 'unknown', '2026-08-04T10:00:00Z', 'v3'),
  '2026-08-04T10:00:00Z', 12);
select extensions.is(
  (select date_of_birth || ' ' || preferred_foot from app.players
   where id = (select player_id from ingested)),
  '2004-03-28 right',
  'a payload with no date of birth and foot unknown erases nothing'
);

select extensions.throws_ok(
  $$select api.ingest_football_squad('sportsmonks', '26027', '1001',
    pg_temp.squad_payload('2999-01-01', 'right', '2026-08-05T10:00:00Z', 'v4'),
    '2026-08-05T10:00:00Z', 13)$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD',
  'an impossible date of birth is still a payload error, as before'
);

-- ---------------------------------------------------------------------------
-- The current player-list update: same helper, no direct assignment
-- ---------------------------------------------------------------------------
select extensions.ok(
  pg_catalog.pg_get_functiondef('api.service_apply_current_player_list(uuid,text)'::regprocedure)
    ~ 'app_private\.record_provider_player_attributes\('
  and pg_catalog.pg_get_functiondef('api.service_apply_current_player_list(uuid,text)'::regprocedure)
    !~ 'date_of_birth',
  'the player-list update records the date of birth through the helper and never assigns it'
);
select extensions.ok(
  pg_catalog.pg_get_functiondef('api.ingest_football_squad(text,text,text,jsonb,timestamptz,bigint)'::regprocedure)
    !~ 'date_of_birth\s*=|preferred_foot\s*=',
  'the squad import assigns neither date_of_birth nor preferred_foot'
);

-- ---------------------------------------------------------------------------
-- Freshness: seeing the same value again moves its freshness forward
-- ---------------------------------------------------------------------------
-- Regression (PR #225 review): the same-value path returned without keeping
-- the newer time, so a stale value observed in between could then win.
insert into app.players (id, slug, full_name, display_name, position)
values ('a2000000-0000-4000-8000-000000000005', 'fresh-player', 'Fresh Player',
  'F. Player', 'defender');
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000005', 'height_cm', null, 188,
  'provider', 'bsd', 'bsd:player:5:a', '2026-09-20T10:00:00Z'
);
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000005', 'height_cm', null, 188,
  'provider', 'bsd', 'bsd:player:5:b', '2026-09-22T10:00:00Z'
);
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000005', 'height_cm', null, 170,
  'provider', 'bsd', 'bsd:player:5:c', '2026-09-21T10:00:00Z'
);
select app_private.resolve_player_attributes(array['a2000000-0000-4000-8000-000000000005'::uuid]);
select extensions.is(
  (select height_cm::integer from app.players where id = 'a2000000-0000-4000-8000-000000000005'),
  188,
  'a value seen again on 22 September is not replaced by one observed on 21 September'
);
select extensions.is(
  (select pg_catalog.string_agg(value_numeric::integer::text, ',')
   from app_private.player_attribute_observations
   where player_id = 'a2000000-0000-4000-8000-000000000005' and attribute = 'height_cm'
     and superseded_at is null),
  '188',
  'the current observation is still the single 188 row'
);
select extensions.is(
  (select pg_catalog.string_agg(confirmation.source_ref || '@' || confirmation.observed_at::date, ',')
   from app_private.player_attribute_observation_confirmations confirmation
   join app_private.player_attribute_observations observation
     on observation.id = confirmation.observation_id
   where observation.player_id = 'a2000000-0000-4000-8000-000000000005'),
  'bsd:player:5:b@2026-09-22',
  'the second sighting is kept as its own evidence, with its reference and time'
);
select extensions.is(
  (select observed_at from app_private.player_attribute_observations
   where player_id = 'a2000000-0000-4000-8000-000000000005' and attribute = 'height_cm'
     and superseded_at is null),
  '2026-09-20T10:00:00Z'::timestamptz,
  'the original observation row is left exactly as recorded'
);
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000005', 'height_cm', null, 188,
  'provider', 'bsd', 'bsd:player:5:d', '2026-09-19T10:00:00Z'
);
select extensions.is(
  (select count(*)::integer
   from app_private.player_attribute_observation_confirmations confirmation
   join app_private.player_attribute_observations observation
     on observation.id = confirmation.observation_id
   where observation.player_id = 'a2000000-0000-4000-8000-000000000005'),
  1,
  'seeing the same value at an older time adds nothing'
);
select extensions.throws_ok(
  $$update app_private.player_attribute_observation_confirmations
    set observed_at = '2030-01-01T00:00:00Z'$$,
  '55000', 'PLAYER_ATTRIBUTE_OBSERVATIONS_APPEND_ONLY',
  'confirmations cannot be updated'
);
select extensions.throws_ok(
  $$delete from app_private.player_attribute_observation_confirmations$$,
  '55000', 'PLAYER_ATTRIBUTE_OBSERVATIONS_APPEND_ONLY',
  'confirmations cannot be deleted'
);
select extensions.throws_ok(
  $$truncate app_private.player_attribute_observation_confirmations$$,
  '55000', 'PLAYER_ATTRIBUTE_OBSERVATIONS_APPEND_ONLY',
  'confirmations cannot be truncated'
);
select extensions.throws_ok(
  $$insert into app_private.player_attribute_observation_confirmations (observation_id, observed_at)
    values ('a9000000-0000-4000-8000-00000000dead', now())$$,
  '23503', 'PLAYER_ATTRIBUTE_OBSERVATION_NOT_FOUND',
  'a confirmation must point at an existing observation'
);

-- Between two sources of equal rank, the one seen most recently wins, counting
-- confirmations.
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000005', 'detailed_position', 'cb', null,
  'provider', 'alpha-feed', 'alpha:5', '2026-09-20T10:00:00Z'
);
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000005', 'detailed_position', 'lb', null,
  'provider', 'beta-feed', 'beta:5', '2026-09-21T10:00:00Z'
);
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000005', 'detailed_position', 'cb', null,
  'provider', 'alpha-feed', 'alpha:5', '2026-09-25T10:00:00Z'
);
select app_private.resolve_player_attributes(array['a2000000-0000-4000-8000-000000000005'::uuid]);
select extensions.is(
  (select detailed_position::text from app.players where id = 'a2000000-0000-4000-8000-000000000005'),
  'cb',
  'among equal-rank sources the latest sighting wins, including a confirmation'
);
select extensions.ok(
  exists (
    select 1 from app_private.player_attribute_conflicts conflict
    where conflict.player_id = 'a2000000-0000-4000-8000-000000000005'
      and conflict.attribute = 'detailed_position'
      and conflict.observations -> 0 ->> 'source' = 'alpha-feed'
  ),
  'the conflicts view orders equal-rank sources by their latest sighting too'
);

-- ---------------------------------------------------------------------------
-- Deleting a country still clears the nationality that referenced it
-- ---------------------------------------------------------------------------
-- Regression (PR #225 review): players.nationality_country_id is
-- ON DELETE SET NULL, and the guard rejected that referential update.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('a1000000-0000-4000-8000-000000000009', 'QZ', 'QZZ');
insert into app.players (id, slug, full_name, display_name, position)
values ('a2000000-0000-4000-8000-000000000006', 'country-player', 'Country Player',
  'C. Player', 'forward');
select app_private.record_player_attribute_observation(
  'a2000000-0000-4000-8000-000000000006', 'nationality', 'QZ', null,
  'provider', 'sportsmonks', 'sportsmonks:player:6', '2026-09-20T10:00:00Z'
);
select app_private.resolve_player_attributes(array['a2000000-0000-4000-8000-000000000006'::uuid]);
select extensions.is(
  (select nationality_country_id from app.players where id = 'a2000000-0000-4000-8000-000000000006'),
  'a1000000-0000-4000-8000-000000000009'::uuid,
  'the player''s nationality references the country'
);
select extensions.is(
  (select count(*)::integer from (
    select 1 from app.country_translations where country_id = 'a1000000-0000-4000-8000-000000000009'
    union all select 1 from app.venues where country_id = 'a1000000-0000-4000-8000-000000000009'
    union all select 1 from app.competitions where country_id = 'a1000000-0000-4000-8000-000000000009'
    union all select 1 from app.teams where country_id = 'a1000000-0000-4000-8000-000000000009'
    union all select 1 from app.story_countries where country_id = 'a1000000-0000-4000-8000-000000000009'
    union all select 1 from app.players where nationality_country_id = 'a1000000-0000-4000-8000-000000000009'
      and id <> 'a2000000-0000-4000-8000-000000000006'
  ) other_references),
  0,
  'nothing else references the country, so the result is the nationality alone'
);
select extensions.lives_ok(
  $$delete from app.countries where id = 'a1000000-0000-4000-8000-000000000009'$$,
  'a country referenced by a player''s nationality can be deleted'
);
select extensions.ok(
  not exists (select 1 from app.countries where id = 'a1000000-0000-4000-8000-000000000009'),
  'the country is gone'
);
select extensions.is(
  (select nationality_country_id from app.players where id = 'a2000000-0000-4000-8000-000000000006'),
  null::uuid,
  'ON DELETE SET NULL still clears the nationality'
);
select extensions.is(
  app_private.resolve_player_attributes(array['a2000000-0000-4000-8000-000000000006'::uuid]),
  0,
  'the cleared column agrees with provenance: resolving changes nothing'
);
select extensions.is(
  (select value_text from app_private.player_attribute_observations
   where player_id = 'a2000000-0000-4000-8000-000000000006' and attribute = 'nationality'
     and superseded_at is null),
  'QZ',
  'the nationality observation is kept as evidence'
);
select extensions.throws_ok(
  $$update app.players set nationality_country_id = null
    where id = 'a2000000-0000-4000-8000-000000000001'$$,
  '55000', 'PLAYER_ATTRIBUTES_RESOLVER_ONLY',
  'clearing a nationality whose country still exists is still rejected'
);
select * from extensions.finish();

rollback;
