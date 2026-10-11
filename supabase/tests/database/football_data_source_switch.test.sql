-- Regression suite for 20261011090000_football_data_source_switch.
begin;
select extensions.no_plan();

-- ===========================================================================
-- Default: today's behaviour
-- ===========================================================================
select extensions.is((select count(*) from app_private.football_data_source_settings), 1::bigint,
  'one settings row');
select extensions.is(app_private.football_data_source(), 'sportsmonks',
  'the live data source defaults to SportsMonks');
select extensions.is(api.football_data_source(), 'sportsmonks',
  'and the Edge Function reads the same default');

-- ===========================================================================
-- Privileges
-- ===========================================================================
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.football_data_source_settings'::regclass), 'the table forces RLS');
select extensions.ok(
  not has_table_privilege('service_role', 'app_private.football_data_source_settings', 'select')
  and not has_table_privilege('authenticated', 'app_private.football_data_source_settings', 'select')
  and not has_table_privilege('anon', 'app_private.football_data_source_settings', 'select'),
  'no API role reads the table');
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.football_data_source_configure(text)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.football_data_source_configure(text)', 'execute')
  and not has_function_privilege('anon', 'app_private.football_data_source_configure(text)', 'execute'),
  'no API role can flip the switch');
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.football_data_source()', 'execute'),
  'the private reader is not callable by an API role');
select extensions.ok(
  has_function_privilege('service_role', 'api.football_data_source()', 'execute')
  and not has_function_privilege('authenticated', 'api.football_data_source()', 'execute')
  and not has_function_privilege('anon', 'api.football_data_source()', 'execute'),
  'only the service role reads the source through the API');

-- ===========================================================================
-- Configure validates, flips, and is audited
-- ===========================================================================
select extensions.throws_ok($$select app_private.football_data_source_configure('flashscore')$$,
  '22023', 'football_data_source_invalid', 'an unknown source is refused');
select extensions.throws_ok($$select app_private.football_data_source_configure(null)$$,
  '22023', 'football_data_source_invalid', 'null is refused');
select extensions.is(app_private.football_data_source(), 'sportsmonks',
  'a refused value changes nothing');

select extensions.is(
  (app_private.football_data_source_configure('shadow') ->> 'source'), 'shadow',
  'shadow is accepted');
select extensions.is(api.football_data_source(), 'shadow', 'the Edge Function now reads shadow');
select extensions.is(
  (select metadata ->> 'previousSource' from app_private.notification_operational_audit
   where event_type = 'football_data_source_configured' order by id desc limit 1),
  'sportsmonks', 'the change is audited with the previous source');

select app_private.football_data_source_configure('sofascore');
select extensions.is(app_private.football_data_source(), 'sofascore', 'sofascore is accepted');
select app_private.football_data_source_configure('sportsmonks');
select extensions.is(app_private.football_data_source(), 'sportsmonks', 'and it flips back');
select extensions.is(
  (select count(*) from app_private.notification_operational_audit
   where event_type = 'football_data_source_configured'), 3::bigint,
  'three accepted changes, three audit rows (the refused ones left none)');

select * from extensions.finish();
rollback;
