begin;

select extensions.no_plan();

-- api.resolve_football_mapping after 20261001161000. That migration adds ONE
-- guard to the generic resolver: it will not CREATE a player mapping for the
-- reviewed providers (sofascore, flashscore), because those are created only
-- through the two-person workflow. Everything else is the existing behaviour.
--   A, B  creation for sofascore / flashscore players is refused
--   C     an existing active reviewed-provider mapping still resolves and
--         still gets its permitted metadata refreshed
--   D     sportsmonks players behave exactly as before
--   E     non-player entities of the reviewed providers behave as before
--   F     collisions and invalid input keep their existing stable errors

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('f1000000-0000-4000-8000-000000000001', 'MA', 'MAR') on conflict do nothing;
insert into app.teams (id, slug, name, short_name) values
  ('f2000000-0000-4000-8000-000000000001', 'resolver-team-one', 'Resolver Team One', 'RT1'),
  ('f2000000-0000-4000-8000-000000000002', 'resolver-team-two', 'Resolver Team Two', 'RT2');
insert into app.players (id, slug, full_name, display_name, position) values
  ('f3000000-0000-4000-8000-000000000001', 'resolver-p1', 'Resolver One', 'Resolver One', 'forward'),
  ('f3000000-0000-4000-8000-000000000002', 'resolver-p2', 'Resolver Two', 'Resolver Two', 'forward'),
  ('f3000000-0000-4000-8000-000000000003', 'resolver-p3', 'Resolver Three', 'Resolver Three', 'forward'),
  ('f3000000-0000-4000-8000-000000000004', 'resolver-p4', 'Resolver Four', 'Resolver Four', 'forward'),
  ('f3000000-0000-4000-8000-000000000005', 'resolver-p5', 'Resolver Five', 'Resolver Five', 'forward');

create function pg_temp.rows_for(p_provider text) returns bigint language sql as
  $$ select count(*) from app_private.football_provider_mappings where provider_name = p_provider $$;

-- ===========================================================================
-- A, B: no uncontrolled creation of a reviewed provider's player mapping
-- ===========================================================================
select extensions.throws_ok(
  $$select api.resolve_football_mapping('sofascore', 'player', 'RG-S-NEW', 'f3000000-0000-4000-8000-000000000001', 'test')$$,
  'P0001', 'MAPPING_REVIEW_REQUIRED', 'A: a new Sofascore player mapping is refused');
select extensions.throws_ok(
  $$select api.resolve_football_mapping('flashscore', 'player', 'RG-F-NEW', 'f3000000-0000-4000-8000-000000000001', 'test')$$,
  'P0001', 'MAPPING_REVIEW_REQUIRED', 'B: a new Flashscore player mapping is refused');
select extensions.is(pg_temp.rows_for('sofascore') + pg_temp.rows_for('flashscore'), 0::bigint,
  'A/B: and nothing was written');
select extensions.throws_ok(
  $$select api.resolve_football_mapping('sofascore', 'player', 'RG-S-NEW', 'f3000000-0000-4000-8000-000000000001', null, now() - interval '1 day')$$,
  'P0001', 'MAPPING_REVIEW_REQUIRED', 'A: whatever the optional arguments, still refused');

-- Called as the service role (the only role that may run it), the answer is the same.
set local role service_role;
select extensions.throws_ok(
  $$select api.resolve_football_mapping('sofascore', 'player', 'RG-S-NEW', 'f3000000-0000-4000-8000-000000000001', 'test')$$,
  'P0001', 'MAPPING_REVIEW_REQUIRED', 'A: refused for the service role too (the ingestion caller)');
reset role;

-- Without an app player there is nothing to create: the old not-found answer stays.
select extensions.throws_ok(
  $$select api.resolve_football_mapping('sofascore', 'player', 'RG-S-NEW')$$,
  'P0002', 'MAPPING_NOT_FOUND', 'A: a lookup of an unmapped Sofascore id still says MAPPING_NOT_FOUND');
select extensions.throws_ok(
  $$select api.resolve_football_mapping('flashscore', 'player', 'RG-F-NEW')$$,
  'P0002', 'MAPPING_NOT_FOUND', 'B: and a Flashscore one');

-- ===========================================================================
-- C: an existing active reviewed-provider mapping still resolves and refreshes
-- ===========================================================================
-- (A lookup stamps last_seen_at with the current time, as it always did; the metadata
-- checks below therefore use a far-future date so the "greatest" rule is visible.)
-- Rows as the reviewed workflow would have made them (written here as the owner).
insert into app_private.football_provider_mappings
  (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active)
values
  ('sofascore', 'player', 'RG-S-OLD', 'f3000000-0000-4000-8000-000000000001', 'old-source', '2026-01-01T00:00:00Z', true),
  ('flashscore', 'player', 'RG-F-OLD', 'f3000000-0000-4000-8000-000000000002', 'old-source', '2026-01-01T00:00:00Z', true),
  ('sofascore', 'player', 'RG-S-INACTIVE', 'f3000000-0000-4000-8000-000000000003', 'old-source', '2026-01-01T00:00:00Z', false);

create temporary table c_before as
select id, provider_name, external_id, internal_entity_id, active, manually_corrected, correction_reason, created_at
from app_private.football_provider_mappings where external_id in ('RG-S-OLD', 'RG-F-OLD');

select extensions.is(api.resolve_football_mapping('sofascore', 'player', 'RG-S-OLD'),
  'f3000000-0000-4000-8000-000000000001'::uuid, 'C: a plain lookup of an existing Sofascore mapping returns its app player');
select extensions.is(api.resolve_football_mapping('flashscore', 'player', 'RG-F-OLD'),
  'f3000000-0000-4000-8000-000000000002'::uuid, 'C: and a Flashscore one');
select extensions.is(api.resolve_football_mapping('sofascore', 'player', 'RG-S-OLD', 'f3000000-0000-4000-8000-000000000001',
  'new-source', '2099-01-01T00:00:00Z'), 'f3000000-0000-4000-8000-000000000001'::uuid,
  'C: resolving with the SAME app player succeeds');
select extensions.is((select source_version || '|' || last_seen_at::text from app_private.football_provider_mappings where external_id = 'RG-S-OLD'),
  'new-source|2099-01-01 00:00:00+00', 'C: and refreshes source_version and last_seen_at');
select api.resolve_football_mapping('sofascore', 'player', 'RG-S-OLD', null, null, '2026-02-01T00:00:00Z');
select extensions.is((select last_seen_at::text from app_private.football_provider_mappings where external_id = 'RG-S-OLD'),
  '2099-01-01 00:00:00+00', 'C: last_seen_at only moves forward (greatest), as before');
select extensions.is((select source_version from app_private.football_provider_mappings where external_id = 'RG-S-OLD'),
  'new-source', 'C: a null source leaves source_version alone, as before');
select api.resolve_football_mapping('flashscore', 'player', 'RG-F-OLD', 'f3000000-0000-4000-8000-000000000002', 'fl-source', '2026-09-02T00:00:00Z');
select extensions.is((select source_version from app_private.football_provider_mappings where external_id = 'RG-F-OLD'), 'fl-source',
  'C: Flashscore metadata refresh works too');
select extensions.is(
  (select count(*)::int from app_private.football_provider_mappings m join c_before b using (id)
   where (m.provider_name, m.external_id, m.internal_entity_id, m.active, m.manually_corrected, m.correction_reason, m.created_at)
     is not distinct from (b.provider_name, b.external_id, b.internal_entity_id, b.active, b.manually_corrected, b.correction_reason, b.created_at)),
  2, 'C: nothing but last_seen_at and source_version changed on either row');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')), 3,
  'C: and no row was added');
select extensions.throws_ok(
  $$select api.resolve_football_mapping('sofascore', 'player', 'RG-S-OLD', 'f3000000-0000-4000-8000-000000000004', 'x')$$,
  'P0001', 'MAPPING_COLLISION', 'C/F: an existing mapping asked to point at another player keeps the MAPPING_COLLISION answer');
select extensions.is((select internal_entity_id from app_private.football_provider_mappings where external_id = 'RG-S-OLD'),
  'f3000000-0000-4000-8000-000000000001'::uuid, 'C/F: and the row is unchanged');
-- An inactive row is not "resolved": the old code fell through to creation, which is now blocked.
select extensions.throws_ok($$select api.resolve_football_mapping('sofascore', 'player', 'RG-S-INACTIVE')$$,
  'P0002', 'MAPPING_NOT_FOUND', 'C: an inactive reviewed row is not found by a lookup, as before');
select extensions.throws_ok(
  $$select api.resolve_football_mapping('sofascore', 'player', 'RG-S-INACTIVE', 'f3000000-0000-4000-8000-000000000003', 'x')$$,
  'P0001', 'MAPPING_REVIEW_REQUIRED', 'C: and cannot be re-created or revived through the resolver (reactivation is a reviewed decision)');
select extensions.is((select active from app_private.football_provider_mappings where external_id = 'RG-S-INACTIVE'), false,
  'C: the inactive row stays inactive');

-- ===========================================================================
-- D: sportsmonks players behave exactly as before
-- ===========================================================================
select extensions.is(api.resolve_football_mapping('sportsmonks', 'player', 'RG-SM-1', 'f3000000-0000-4000-8000-000000000004', 'sm-source', '2026-09-03T00:00:00Z'),
  'f3000000-0000-4000-8000-000000000004'::uuid, 'D: a new SportsMonks player mapping is still created and returns the app player');
select extensions.is((select provider_name || '|' || entity_type::text || '|' || external_id || '|' || internal_entity_id::text || '|' || active::text
    || '|' || source_version || '|' || last_seen_at::text || '|' || manually_corrected::text
  from app_private.football_provider_mappings where external_id = 'RG-SM-1'),
  'sportsmonks|player|RG-SM-1|f3000000-0000-4000-8000-000000000004|true|sm-source|2026-09-03 00:00:00+00|false',
  'D: with exactly the columns it always had (active, not manually corrected)');
select extensions.is(api.resolve_football_mapping('sportsmonks', 'player', 'RG-SM-1'),
  'f3000000-0000-4000-8000-000000000004'::uuid, 'D: and is found again by a lookup');
select extensions.throws_ok(
  $$select api.resolve_football_mapping('sportsmonks', 'player', 'RG-SM-1', 'f3000000-0000-4000-8000-000000000005', 'x')$$,
  'P0001', 'MAPPING_COLLISION', 'D: another app player for the same external id is a MAPPING_COLLISION');
select extensions.throws_ok(
  $$select api.resolve_football_mapping('sportsmonks', 'player', 'RG-SM-OTHER', 'f3000000-0000-4000-8000-000000000004', 'x')$$,
  'P0001', 'MAPPING_COLLISION', 'D: the same app player under another external id is a MAPPING_COLLISION (unique constraint)');
select extensions.throws_ok($$select api.resolve_football_mapping('sportsmonks', 'player', 'RG-SM-NONE')$$,
  'P0002', 'MAPPING_NOT_FOUND', 'D: an unmapped SportsMonks id with no app player is MAPPING_NOT_FOUND');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'sportsmonks' and external_id like 'RG-SM%'), 1,
  'D: exactly the one row was created');

-- ===========================================================================
-- E: non-player entities of the reviewed providers are not blocked
-- ===========================================================================
select extensions.is(api.resolve_football_mapping('sofascore', 'team', 'RG-S-TEAM', 'f2000000-0000-4000-8000-000000000001', 'test'),
  'f2000000-0000-4000-8000-000000000001'::uuid, 'E: a Sofascore TEAM mapping is still created');
select extensions.is(api.resolve_football_mapping('flashscore', 'team', 'RG-F-TEAM', 'f2000000-0000-4000-8000-000000000002', 'test'),
  'f2000000-0000-4000-8000-000000000002'::uuid, 'E: and a Flashscore TEAM mapping');
select extensions.is(api.resolve_football_mapping('sofascore', 'country', 'RG-S-COUNTRY', 'f1000000-0000-4000-8000-000000000001', 'test'),
  'f1000000-0000-4000-8000-000000000001'::uuid, 'E: and another entity type (country)');
select extensions.is(api.resolve_football_mapping('sofascore', 'team', 'RG-S-TEAM'), 'f2000000-0000-4000-8000-000000000001'::uuid,
  'E: a lookup of the created team mapping works');
select extensions.throws_ok(
  $$select api.resolve_football_mapping('sofascore', 'team', 'RG-S-TEAM', 'f2000000-0000-4000-8000-000000000002', 'x')$$,
  'P0001', 'MAPPING_COLLISION', 'E: team collisions keep their answer');
select extensions.is((select count(*)::int from app_private.football_provider_mappings
  where provider_name in ('sofascore', 'flashscore') and entity_type = 'player' and external_id like 'RG-%-NEW'), 0,
  'E: and no player row slipped in with them');

-- ===========================================================================
-- F: invalid input and collisions keep their stable errors
-- ===========================================================================
select extensions.throws_ok($$select api.resolve_football_mapping('sportsmonks', 'planet', 'X', 'f3000000-0000-4000-8000-000000000001')$$,
  '22023', 'INVALID_ENTITY_TYPE', 'F: an unknown entity type is INVALID_ENTITY_TYPE');
select extensions.throws_ok($$select api.resolve_football_mapping('sofascore', 'planet', 'X', 'f3000000-0000-4000-8000-000000000001')$$,
  '22023', 'INVALID_ENTITY_TYPE', 'F: for a reviewed provider too (the guard does not pre-empt validation)');
select extensions.throws_ok($$select api.resolve_football_mapping('sportsmonks', 'player', 'RG-SM-GHOST', '99999999-9999-4999-8999-999999999999', 'x')$$,
  '23503', 'MAPPING_TARGET_NOT_FOUND', 'F: a target that does not exist keeps MAPPING_TARGET_NOT_FOUND');
select extensions.throws_ok($$select api.resolve_football_mapping('sofascore', 'team', 'RG-S-GHOST', '99999999-9999-4999-8999-999999999999', 'x')$$,
  '23503', 'MAPPING_TARGET_NOT_FOUND', 'F: for a reviewed provider''s team too');

-- ===========================================================================
-- Privileges and shape are unchanged
-- ===========================================================================
select extensions.is(
  (select string_agg(r.role, ',' order by r.role)
   from (values ('anon'), ('authenticated'), ('service_role')) r(role)
   where has_function_privilege(r.role, 'api.resolve_football_mapping(text,text,text,uuid,text,timestamptz)', 'execute')),
  'service_role', 'the resolver is still executable by the service role only');
select extensions.is(
  (select count(*)::int from pg_proc where oid = 'api.resolve_football_mapping(text,text,text,uuid,text,timestamptz)'::regprocedure
    and prosecdef and prorettype = 'uuid'::regtype and proconfig @> array['search_path=""']),
  1, 'it is still SECURITY DEFINER, returns uuid and has an empty search_path');
select extensions.is(
  (select pg_get_function_identity_arguments(oid) from pg_proc where oid = 'api.resolve_football_mapping(text,text,text,uuid,text,timestamptz)'::regprocedure),
  'p_provider_name text, p_entity_type text, p_external_id text, p_internal_entity_id uuid, p_source_version text, p_last_seen_at timestamp with time zone',
  'and its arguments are unchanged');

select * from extensions.finish();
rollback;
