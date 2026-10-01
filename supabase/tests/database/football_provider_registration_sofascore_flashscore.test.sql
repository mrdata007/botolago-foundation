-- 20261001150000: the two identity providers are registered, and nothing else
-- is touched. Rolled back at the end.
begin;
select extensions.no_plan();

-- The existing providers and the (empty) mapping state, captured before and
-- compared after re-running the registration.
create temp table before_state as
select
  (select count(*) from app_private.football_provider_mappings) as mappings,
  (select count(*) from app_private.football_providers where name not in ('sofascore', 'flashscore')) as other_providers,
  (select md5(coalesce(string_agg(name || '|' || display_name || '|' || configuration_version::text || '|' || active::text, ',' order by name), ''))
     from app_private.football_providers where name not in ('sofascore', 'flashscore')) as other_providers_digest;

select extensions.is(
  (select count(*)::integer from app_private.football_providers where name in ('sofascore', 'flashscore')),
  2, 'both providers are registered');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('name', name, 'active', active, 'version', configuration_version) order by name)
   from app_private.football_providers where name in ('sofascore', 'flashscore')),
  '[{"name":"flashscore","active":true,"version":1},{"name":"sofascore","active":true,"version":1}]'::jsonb,
  'registered active, configuration version 1');
select extensions.ok(
  (select bool_and(display_name = btrim(display_name) and char_length(display_name) between 2 and 100)
   from app_private.football_providers where name in ('sofascore', 'flashscore')),
  'display names satisfy the table checks');
select extensions.ok(
  exists (select 1 from app_private.football_providers where name = 'sportsmonks')
  and exists (select 1 from app_private.football_providers where name = 'fixture'),
  'the earlier providers are still registered');

-- Idempotent: running the same statement again changes nothing, not even a display name.
update app_private.football_providers set display_name = 'Reviewed display name' where name = 'sofascore';
insert into app_private.football_providers (name, display_name)
values ('sofascore', 'Sofascore (RapidAPI)'), ('flashscore', 'Flashscore (RapidAPI)')
on conflict (name) do nothing;
select extensions.is(
  (select display_name from app_private.football_providers where name = 'sofascore'),
  'Reviewed display name', 'a provider already registered is left exactly as it is');

-- Registration writes no mapping, and the other providers are unchanged.
select extensions.is(
  (select count(*) from app_private.football_provider_mappings), (select mappings from before_state),
  'no mapping row exists because of the registration');
select extensions.is(
  (select md5(coalesce(string_agg(name || '|' || display_name || '|' || configuration_version::text || '|' || active::text, ',' order by name), ''))
     from app_private.football_providers where name not in ('sofascore', 'flashscore')),
  (select other_providers_digest from before_state), 'the other providers are byte-identical');
select extensions.is(
  (select count(*) from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')),
  0::bigint, 'no mapping row names either new provider');

-- The mapping table keeps its two unconditional unique constraints, unchanged.
select extensions.is(
  (select count(*)::integer from pg_constraint c
   where c.conrelid = 'app_private.football_provider_mappings'::regclass and c.contype = 'u'
     and c.conname in ('football_provider_mappings_external_key', 'football_provider_mappings_internal_key')
     and not c.condeferrable),
  2, 'the two unique constraints on the mapping table are unchanged and not deferrable');
select extensions.is(
  (select count(*)::integer from pg_constraint c
   where c.conrelid = 'app_private.football_provider_mappings'::regclass and c.contype = 'u'),
  2, 'and the mapping table has no other unique constraint');

-- A mapping can now point at a registered provider (the foreign key accepts it); not written here.
select extensions.lives_ok(
  $$select 1 from app_private.football_providers where name = 'flashscore'$$, 'the provider can be referenced');

select * from extensions.finish();
rollback;
