-- Regression suite for the browser error reports of
-- 20260924200200_ops_health_and_alerts (api.report_client_errors).
begin;
select extensions.no_plan();

create function pg_temp.report(p_events jsonb) returns jsonb language plpgsql as $$
declare result jsonb;
begin
  set local role anon;
  result := api.report_client_errors(p_events);
  reset role;
  return result;
end;
$$;
create function pg_temp.browser_check() returns jsonb language sql as $$
  select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
  where c ->> 'name' = 'browser_errors'
$$;

-- ---------------------------------------------------------------------------
-- Access: anyone may report; nobody but the owner may read.
-- ---------------------------------------------------------------------------
select extensions.ok(has_function_privilege('anon', 'api.report_client_errors(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'api.report_client_errors(jsonb)', 'execute'),
  'visitors and users can report');
select extensions.ok(not has_table_privilege('anon', 'app_private.client_error_counts', 'select')
  and not has_table_privilege('authenticated', 'app_private.client_error_counts', 'select')
  and not has_table_privilege('service_role', 'app_private.client_error_counts', 'select'),
  'no API role can read the reports');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.client_error_counts'::regclass), 'row security is on and forced');
select extensions.ok(not has_function_privilege('anon', 'app_private.client_error_sample(jsonb)', 'execute')
  and not has_function_privilege('anon', 'app_private.redact_client_text(text)', 'execute'),
  'the helpers are internal');

-- ---------------------------------------------------------------------------
-- Shape.
-- ---------------------------------------------------------------------------
select extensions.throws_ok($$select pg_temp.report('{"kind":"unhandled"}')$$,
  '22023', 'client_errors_invalid', 'a report must come in a list');
select extensions.throws_ok($$select pg_temp.report('[]')$$,
  '22023', 'client_errors_invalid', 'an empty list is refused');
select extensions.throws_ok(
  $$select pg_temp.report((select jsonb_agg(jsonb_build_object('kind', 'unhandled', 'area', 'a', 'code', 'E' || i))
     from generate_series(1, 11) i))$$,
  '22023', 'client_errors_invalid', 'eleven reports in one call are refused');

-- ---------------------------------------------------------------------------
-- What is kept.
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.report(jsonb_build_array(jsonb_build_object(
    'kind', 'unhandled', 'area', 'window.error', 'code', 'TypeError',
    'route', '/news/9b2f0c1e-0000-4000-8000-0000000000f1',
    'release', '8bdfa4074b3eb15511d5b955e64d3fb6cefcdc75',
    'detail', jsonb_build_object(
      'message', 'failed for ali@example.com with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl at https://botolago.com/x?token=abc',
      'name', 'Ali Example',
      'status', 500,
      'repoCode', 'already_exists')))),
  '{"accepted": 1}'::jsonb, 'a well-formed report is accepted');

select extensions.is((select route from app_private.client_error_counts where code = 'TypeError'),
  '/news/:id', 'the identifier in the path is not kept');
-- Exactly what redactText (src/lib/operational-errors.ts) makes of the same
-- text; client-error-sink.test.ts pins the browser side to this string.
select extensions.is((select sample -> 'message' #>> '{}' from app_private.client_error_counts where code = 'TypeError'),
  'failed for [email] with [jwt] at https://botolago.com/x [redacted]', 'the message is redacted again');
select extensions.is((select sample - 'message' from app_private.client_error_counts where code = 'TypeError'),
  '{"status": 500, "repoCode": "already_exists"}'::jsonb,
  'free text other than the message is dropped; codes and numbers stay');
select extensions.is((select count(*)::integer from information_schema.columns
  where table_schema = 'app_private' and table_name = 'client_error_counts'
    and column_name ~ '(user|ip|agent|email|query)'), 0,
  'there is nowhere to store a user, an address or a query string');

-- The same kind of error again is a count, not a row.
select pg_temp.report(jsonb_build_array(jsonb_build_object(
  'kind', 'unhandled', 'area', 'window.error', 'code', 'TypeError',
  'route', '/news/9b2f0c1e-0000-4000-8000-0000000000f2',
  'release', '8bdfa4074b3eb15511d5b955e64d3fb6cefcdc75', 'detail', '{}'::jsonb)));
select extensions.is((select reports from app_private.client_error_counts where code = 'TypeError'), 2,
  'another article with the same error adds to the count');
select extensions.is((select count(*)::integer from app_private.client_error_counts), 1, 'still one row');

-- Malformed reports in a batch are skipped, the rest counted.
select extensions.is(pg_temp.report('[
    {"kind":"unhandled","area":"window.error","code":"RangeError","route":"/matches","release":"unknown"},
    {"kind":"unhandled","area":"window.error","code":"not a code!","route":"/matches"},
    {"kind":"fatal","area":"window.error","code":"Error"},
    {"kind":"handled","area":"fantasy.create_team","code":"fantasy_gameweek_locked","route":"/fantasy/create?next=/x","release":"not-a-sha"},
    "a string"
  ]'::jsonb),
  '{"accepted": 1}'::jsonb, 'bad code, kind, release and non-objects are skipped');

-- A path the browser could not have sent is not stored as given.
select pg_temp.report('[{"kind":"handled","area":"fantasy.create_team","code":"x_code","route":"/fantasy/create?next=/x"}]');
select extensions.is((select route from app_private.client_error_counts where code = 'x_code'),
  '(unknown)', 'a path with a query string is not kept');

-- ---------------------------------------------------------------------------
-- Bounds: 300 new kinds of error per hour, then only known kinds count.
-- ---------------------------------------------------------------------------
insert into app_private.client_error_counts (bucket_hour, kind, area, code, route, release, first_at, last_at)
select date_trunc('hour', statement_timestamp()), 'handled', 'filler', 'F' || i, '/', 'unknown', now(), now()
from generate_series(1, 300 - (select count(*)::integer from app_private.client_error_counts
  where bucket_hour = date_trunc('hour', statement_timestamp()))) i;
select extensions.is(
  pg_temp.report('[{"kind":"unhandled","area":"window.error","code":"BrandNewError","route":"/"}]'),
  '{"accepted": 0}'::jsonb, 'a new kind of error past the hourly limit is dropped');
select extensions.is(
  pg_temp.report('[{"kind":"unhandled","area":"window.error","code":"RangeError","route":"/matches","release":"unknown"}]'),
  '{"accepted": 1}'::jsonb, 'a known one is still counted');
delete from app_private.client_error_counts where area = 'filler';

-- Thirty days are kept: the hour's first report clears older ones.
delete from app_private.client_error_counts;
insert into app_private.client_error_counts (bucket_hour, kind, area, code, route, release, first_at, last_at)
values (date_trunc('hour', statement_timestamp()) - interval '31 days', 'unhandled', 'window.error', 'Old', '/', 'unknown', now(), now()),
       (date_trunc('hour', statement_timestamp()) - interval '29 days', 'unhandled', 'window.error', 'Recent', '/', 'unknown', now(), now());
select pg_temp.report('[{"kind":"unhandled","area":"window.error","code":"TypeError","route":"/"}]');
select extensions.is((select array_agg(code order by code) from app_private.client_error_counts),
  array['Recent', 'TypeError'], 'reports older than 30 days are removed');

-- ---------------------------------------------------------------------------
-- The health check warns, and never fails.
-- ---------------------------------------------------------------------------
delete from app_private.client_error_counts;
select extensions.is(pg_temp.browser_check() ->> 'status', 'ok', 'no reports: ok');
insert into app_private.client_error_counts (bucket_hour, kind, area, code, route, release, reports, first_at, last_at)
values (date_trunc('hour', statement_timestamp()), 'unhandled', 'window.error', 'TypeError', '/fantasy/team', 'unknown', 20, now(), now()),
       (date_trunc('hour', statement_timestamp()) - interval '1 hour', 'unhandled', 'window.error', 'RangeError', '/matches', 'unknown', 4, now(), now()),
       (date_trunc('hour', statement_timestamp()), 'handled', 'fantasy.create_team', 'fantasy_gameweek_locked', '/fantasy/create', 'unknown', 90, now(), now());
select extensions.is(pg_temp.browser_check() ->> 'status', 'ok',
  '24 unhandled errors are under the threshold; handled ones do not count');
-- The most a public caller can ever store: the check still only warns, so
-- reports can never make the alert tick page anyone.
update app_private.client_error_counts set reports = 1000000 where code = 'TypeError';
select extensions.is(pg_temp.browser_check() ->> 'status', 'warn', 'a flood warns, and no more');
select extensions.ok(pg_temp.browser_check() ->> 'detail' like '%most: TypeError on /fantasy/team',
  'and names the worst error and page');

select * from extensions.finish();
rollback;
