-- Regression suite for 20260924190300_timezone_validation_without_catalogue_scan.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Access: the snapshot and the validator are internal.
-- ---------------------------------------------------------------------------
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.timezone_names'::regclass), 'the timezone snapshot forces RLS');
select extensions.ok(not has_table_privilege('anon', 'app_private.timezone_names', 'select')
  and not has_table_privilege('authenticated', 'app_private.timezone_names', 'select')
  and not has_table_privilege('service_role', 'app_private.timezone_names', 'select'),
  'no API role reads the snapshot');
select extensions.ok(not has_function_privilege('anon', 'app_private.is_valid_timezone(text)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.is_valid_timezone(text)', 'execute')
  and not has_function_privilege('service_role', 'app_private.is_valid_timezone(text)', 'execute'),
  'no API role calls the validator directly');

-- ---------------------------------------------------------------------------
-- Same answers as the catalogue scan it replaces.
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from pg_catalog.pg_timezone_names
   where not app_private.is_valid_timezone(name)),
  0, 'every name the catalogue lists is accepted');
select extensions.ok(
  app_private.is_valid_timezone('Africa/Casablanca') and app_private.is_valid_timezone('UTC')
  and app_private.is_valid_timezone('Europe/Paris')
  and app_private.is_valid_timezone('America/Argentina/Buenos_Aires')
  and app_private.is_valid_timezone('Etc/GMT+1') and app_private.is_valid_timezone('EST5EDT'),
  'the zones visitors send are accepted');
select extensions.is(
  (select coalesce(array_agg(candidate order by candidate), '{}')
   from unnest(array[
     'Foo/Bar', 'Mars/Olympus_Mons', 'UTC+3', 'PST', 'ABC5', '', 'x; drop table y',
     'EST5EDT,M3.2.0/2,M11.1.0', 'Africa/Casablanca/Extra/Deep/Deeper', repeat('A', 65)
   ]) candidate
   where app_private.is_valid_timezone(candidate)),
  '{}'::text[],
  'names the catalogue never listed are refused: unknown zones, POSIX offsets, bare abbreviations, junk');
select extensions.ok(not app_private.is_valid_timezone(null), 'a missing zone is refused');

-- ---------------------------------------------------------------------------
-- The two callers keep their contracts.
-- ---------------------------------------------------------------------------
set local role anon;
select extensions.ok(
  api.football_matches_by_date(current_date, 'fr', 'Africa/Casablanca') ? 'items',
  'visitors get the matches page for their zone');
select extensions.throws_ok(
  $$select api.football_matches_by_date(current_date, 'fr', 'Mars/Olympus_Mons')$$,
  '22023', 'INVALID_TIMEZONE', 'an unknown zone is refused as before');
select extensions.throws_ok(
  $$select api.football_matches_by_date(current_date, 'fr', 'UTC+3')$$,
  '22023', 'INVALID_TIMEZONE', 'and so is a POSIX offset');
reset role;

select extensions.lives_ok($$select app_private.assert_valid_timezone('Europe/Paris')$$,
  'notification quiet hours accept a real zone');
select extensions.throws_ok($$select app_private.assert_valid_timezone('UTC+3')$$,
  '22023', 'quiet_hours_invalid', 'and refuse an offset, as before');

select extensions.is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('api', 'app', 'app_private') and p.prokind = 'f'
     and pg_get_functiondef(p.oid) ilike '%pg_timezone_names%'),
  0, 'no function scans pg_timezone_names on each call any more');

-- ---------------------------------------------------------------------------
-- A zone added by a later tzdata update (simulated by removing it from the
-- snapshot) is still accepted when it is an Area/Location name Postgres
-- resolves; a bare name only ever comes from the snapshot.
-- ---------------------------------------------------------------------------
delete from app_private.timezone_names where name in ('Africa/Casablanca', 'UTC');
select extensions.ok(app_private.is_valid_timezone('Africa/Casablanca'),
  'an Area/Location zone missing from the snapshot is accepted when Postgres resolves it');
select extensions.ok(not app_private.is_valid_timezone('Africa/Atlantis'),
  'one Postgres cannot resolve is refused');
select extensions.ok(not app_private.is_valid_timezone('UTC'),
  'a bare name missing from the snapshot is refused');

select * from extensions.finish();
rollback;
