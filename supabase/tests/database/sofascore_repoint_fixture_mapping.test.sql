begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- api.repoint_football_fixture_mapping: moves a SofaScore fixture mapping to the
-- replacement event id of a replayed match.
--   1 privileges   2 happy path   3 idempotent repeat   4 wrong old id / no mapping
--   5 new id already taken   6 provider / entity narrowing   7 argument guards

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'repoint-test', 'Repoint Test', 'RT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', false);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id('c0', 7), pg_temp.id('c0', 3), 1, 'Round 1', 'planned');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'repoint-club-' || i, 'Repoint Club ' || i, 'RP' || i, 'RP' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 3) i;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status)
values (pg_temp.id('f0', 1), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 1),
    pg_temp.id('c1', 2), '2026-10-20 12:00Z', 'scheduled'),
  (pg_temp.id('f0', 2), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 3),
    pg_temp.id('c1', 2), '2026-10-21 12:00Z', 'scheduled');

insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at)
values ('sofascore', 'fixture', '9001', pg_temp.id('f0', 1), 'orig', '2026-10-01 00:00Z'),
  ('sofascore', 'fixture', '9002', pg_temp.id('f0', 2), 'orig', '2026-10-01 00:00Z'),
  ('sportsmonks', 'fixture', 'sm-1', pg_temp.id('f0', 1), 'orig', '2026-10-01 00:00Z'),
  ('sofascore', 'team', 'st-1', pg_temp.id('c1', 1), 'orig', '2026-10-01 00:00Z');

-- 1 privileges
select extensions.ok(not has_function_privilege('anon', 'api.repoint_football_fixture_mapping(text,uuid,text,text,text)', 'execute'), '1.1 not callable by visitors');
select extensions.ok(not has_function_privilege('authenticated', 'api.repoint_football_fixture_mapping(text,uuid,text,text,text)', 'execute'), '1.2 not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.repoint_football_fixture_mapping(text,uuid,text,text,text)', 'execute'), '1.3 callable by the service role');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sofascore', 'f0000000-0000-4000-8000-000000000001', '9001', '9101', 'Match replayed under a new event id.')$$,
  'PT403', 'forbidden', '1.4 a non-service caller is refused even with execute');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 2 happy path
create temporary table first_call as
select api.repoint_football_fixture_mapping('sofascore', pg_temp.id('f0', 1), '9001', '9101', 'Match replayed under a new event id.') as r;
select extensions.is((select r ->> 'status' from first_call), 'repointed', '2.1 reports repointed');
select extensions.is((select external_id from app_private.football_provider_mappings
  where provider_name = 'sofascore' and entity_type = 'fixture' and internal_entity_id = pg_temp.id('f0', 1)), '9101', '2.2 external id moved');
select extensions.is((select count(*)::int from app_private.football_provider_mappings
  where provider_name = 'sofascore' and entity_type = 'fixture' and external_id = '9001'), 0, '2.3 the old id maps nothing');
select extensions.is((select count(*)::int from app_private.football_provider_mappings
  where provider_name = 'sofascore' and entity_type = 'fixture'), 2, '2.4 the row was updated in place, none added');
select extensions.is((select (r ->> 'mappingId')::uuid from first_call), (select id from app_private.football_provider_mappings
  where provider_name = 'sofascore' and entity_type = 'fixture' and external_id = '9101'), '2.5 same mapping row id');
select extensions.ok((select last_seen_at > '2026-10-01 00:00Z' and source_version = 'repoint-from-9001'
  from app_private.football_provider_mappings where external_id = '9101' and provider_name = 'sofascore'), '2.6 last seen and source version updated');
select extensions.is((select count(*)::int from app_private.admin_audit_events
  where action = 'football.repoint_fixture_mapping' and target_entity_id = pg_temp.id('f0', 1)
    and safe_before ->> 'externalId' = '9001' and safe_after ->> 'externalId' = '9101'), 1, '2.7 one audit event with old and new id');
select extensions.is((select external_id from app_private.football_provider_mappings
  where provider_name = 'sportsmonks' and entity_type = 'fixture' and internal_entity_id = pg_temp.id('f0', 1)), 'sm-1', '2.8 the SportsMonks mapping is untouched');

-- 3 idempotent repeat
select extensions.is((api.repoint_football_fixture_mapping('sofascore', pg_temp.id('f0', 1), '9001', '9101', 'Match replayed under a new event id.')) ->> 'status',
  'unchanged', '3.1 repeating is a no-op');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.repoint_fixture_mapping'), 1, '3.2 and records nothing more');

-- 4 wrong old id
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sofascore', 'f0000000-0000-4000-8000-000000000002', '9999', '9102', 'Match replayed under a new event id.')$$,
  'P0001', 'MAPPING_OLD_ID_MISMATCH', '4.1 an old id that is not the current mapping is refused');
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sofascore', 'f0000000-0000-4000-8000-000000000003', '9002', '9102', 'Match replayed under a new event id.')$$,
  'P0002', 'MAPPING_NOT_FOUND', '4.2 a fixture with no mapping is refused');
update app_private.football_provider_mappings set active = false where external_id = '9002' and provider_name = 'sofascore';
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sofascore', 'f0000000-0000-4000-8000-000000000002', '9002', '9102', 'Match replayed under a new event id.')$$,
  'P0002', 'MAPPING_NOT_FOUND', '4.3 an inactive mapping is refused');
update app_private.football_provider_mappings set active = true where external_id = '9002' and provider_name = 'sofascore';

-- 5 new id already taken
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sofascore', 'f0000000-0000-4000-8000-000000000002', '9002', '9101', 'Match replayed under a new event id.')$$,
  'P0001', 'MAPPING_COLLISION', '5.1 a new id already mapped to another fixture is refused');
select extensions.is((select external_id from app_private.football_provider_mappings
  where provider_name = 'sofascore' and entity_type = 'fixture' and internal_entity_id = pg_temp.id('f0', 2)), '9002', '5.2 and nothing moved');

-- 6 narrowing
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sportsmonks', 'f0000000-0000-4000-8000-000000000001', 'sm-1', 'sm-2', 'Match replayed under a new event id.')$$,
  '22023', 'REPOINT_PROVIDER_NOT_ALLOWED', '6.1 another provider is refused');
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sofascore', 'c1000000-0000-4000-8000-000000000001', 'st-1', 'st-2', 'Match replayed under a new event id.')$$,
  'P0002', 'MAPPING_NOT_FOUND', '6.2 a non-fixture target (a team) is refused: only fixture mappings are looked up');
select extensions.is((select external_id from app_private.football_provider_mappings
  where provider_name = 'sofascore' and entity_type = 'team'), 'st-1', '6.3 the team mapping is untouched');

-- 7 argument guards
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sofascore', 'f0000000-0000-4000-8000-000000000002', '9002', '9002', 'Match replayed under a new event id.')$$,
  '22023', 'REPOINT_INVALID_ARGUMENT', '7.1 old and new must differ');
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sofascore', 'f0000000-0000-4000-8000-000000000002', '9002', ' 9102', 'Match replayed under a new event id.')$$,
  '22023', 'REPOINT_INVALID_ARGUMENT', '7.2 an untrimmed id is refused');
select extensions.throws_ok($$select api.repoint_football_fixture_mapping('sofascore', 'f0000000-0000-4000-8000-000000000002', '9002', '9102', 'short')$$,
  '22023', 'REPOINT_REASON_REQUIRED', '7.3 a reason is required');

select * from extensions.finish();
rollback;
