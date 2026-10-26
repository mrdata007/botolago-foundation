-- Regression suite for 20261013110000_rapidapi_call_budget:
-- the counter table and its write function, the monthly total, the
-- `rapidapi_budget` health check (warn 8000, fail 9500) and the staff read.
begin;
select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- 1 privileges
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.rapidapi_call_counts'::regclass), '1.1 the counter table forces RLS');
select extensions.ok(not has_table_privilege('service_role', 'app_private.rapidapi_call_counts', 'select')
  and not has_table_privilege('authenticated', 'app_private.rapidapi_call_counts', 'select'),
  '1.2 no API role reads the table directly');
select extensions.ok(not has_function_privilege('anon', 'api.service_record_rapidapi_calls(text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_record_rapidapi_calls(text, jsonb)', 'execute')
  and has_function_privilege('service_role', 'api.service_record_rapidapi_calls(text, jsonb)', 'execute'),
  '1.3 only the service role records calls');
select extensions.ok(not has_function_privilege('anon', 'api.admin_rapidapi_calls_this_month()', 'execute')
  and has_function_privilege('authenticated', 'api.admin_rapidapi_calls_this_month()', 'execute'),
  '1.4 the staff read is for signed-in callers, and checks the permission itself');
select extensions.ok(not has_function_privilege('service_role', 'app_private.rapidapi_budget_health()', 'execute')
  and not has_function_privilege('service_role', 'app_private.rapidapi_calls_this_month()', 'execute'),
  '1.5 the health helpers are not callable by an API role');

-- 2 writing
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.service_record_rapidapi_calls('fixtures', '[]'::jsonb)$$,
  'PT403', 'forbidden', '2.1 a non-service caller is refused');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.is(api.service_record_rapidapi_calls('fixtures', jsonb_build_array(
    jsonb_build_object('endpoint', 'tournaments/get-live-events', 'status', 200, 'calls', 3),
    jsonb_build_object('endpoint', 'matches/get-incidents', 'status', 200, 'calls', 2),
    jsonb_build_object('endpoint', 'matches/get-incidents', 'status', 0, 'calls', 1))),
  6, '2.2 returns the number of calls added');
select extensions.is(api.service_record_rapidapi_calls('fixtures', jsonb_build_array(
    jsonb_build_object('endpoint', 'matches/get-incidents', 'status', 200, 'calls', 4))),
  4, '2.3 a second write for the same key adds to it');
select extensions.is((select calls from app_private.rapidapi_call_counts
  where job = 'fixtures' and endpoint = 'matches/get-incidents' and status_code = 200
    and day = (statement_timestamp() at time zone 'utc')::date), 6, '2.4 the counter for today now holds 2 + 4');
select extensions.is((select count(*)::int from app_private.rapidapi_call_counts), 3,
  '2.5 one row per day, job, endpoint and status');
select extensions.throws_ok($$select api.service_record_rapidapi_calls('Fixtures', '[]'::jsonb)$$,
  '22023', 'invalid_rapidapi_calls', '2.6 a job name that is not a plain identifier is refused');
select extensions.throws_ok($$select api.service_record_rapidapi_calls('fixtures',
  '[{"endpoint":"matches/get-incidents?matchId=1","status":200,"calls":1}]'::jsonb)$$,
  '22023', 'invalid_rapidapi_calls', '2.7 an endpoint with a query string is refused');
select extensions.throws_ok($$select api.service_record_rapidapi_calls('fixtures',
  '[{"endpoint":"a/b","status":700,"calls":1}]'::jsonb)$$,
  '22023', 'invalid_rapidapi_calls', '2.8 a status above 599 is refused');
select extensions.throws_ok($$select api.service_record_rapidapi_calls('fixtures',
  '[{"endpoint":"a/b","status":200,"calls":0}]'::jsonb)$$,
  '22023', 'invalid_rapidapi_calls', '2.9 zero calls is refused');
select extensions.throws_ok($$select api.service_record_rapidapi_calls('fixtures', '{}'::jsonb)$$,
  '22023', 'invalid_rapidapi_calls', '2.10 a payload that is not an array is refused');

-- 3 the total counts the current quota window only (since the most recent reset day)
select extensions.is(app_private.rapidapi_calls_this_month(), 10::bigint, '3.1 this month so far');
insert into app_private.rapidapi_call_counts (day, job, endpoint, status_code, calls)
values (app_private.rapidapi_window_start() - 1, 'fixtures',
  'matches/get-incidents', 200, 5000);
select extensions.is(app_private.rapidapi_calls_this_month(), 10::bigint,
  '3.2 calls before the window are not counted');

-- 4 the health check
create function pg_temp.status_with(p_total integer) returns text language plpgsql as $$
begin
  delete from app_private.rapidapi_call_counts
  where day >= app_private.rapidapi_window_start();
  insert into app_private.rapidapi_call_counts (day, job, endpoint, status_code, calls)
  values ((statement_timestamp() at time zone 'utc')::date, 'fixtures', 'a/b', 200, p_total);
  return app_private.rapidapi_budget_health() ->> 'status';
end;
$$;
select extensions.is(pg_temp.status_with(1), 'ok', '4.1 a few calls are ok');
select extensions.is(pg_temp.status_with(7999), 'ok', '4.2 7999 is still ok');
select extensions.is(pg_temp.status_with(8000), 'warn', '4.3 8000 warns');
select extensions.is(pg_temp.status_with(9499), 'warn', '4.4 9499 still warns');
select extensions.is(pg_temp.status_with(9500), 'fail', '4.5 9500 fails');
select extensions.is(app_private.rapidapi_budget_health() ->> 'name', 'rapidapi_budget', '4.6 the check name');
select extensions.alike(app_private.rapidapi_budget_health() ->> 'detail', '9500 of 10000%',
  '4.7 the detail states the count only');
select extensions.is(
  (select c ->> 'status' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' = 'rapidapi_budget'),
  'fail', '4.8 ops_health_checks carries the check');
select extensions.ok((app_private.ops_health_checks() ->> 'status') = 'fail',
  '4.9 and a failing budget fails the whole report');
select extensions.is(pg_temp.status_with(10), 'ok', '4.10 back to ok');
select extensions.ok(
  (select count(*) = 1 from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' = 'rapidapi_budget'), '4.11 the check appears once');

-- 5 the staff read refuses a caller who is not staff
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
create function pg_temp.refused() returns boolean language plpgsql as $$
begin
  perform api.admin_rapidapi_calls_this_month();
  return false;
exception when others then
  return true;
end;
$$;
select extensions.ok(pg_temp.refused(), '5.1 a caller without the permission is refused');

select * from extensions.finish();
rollback;
