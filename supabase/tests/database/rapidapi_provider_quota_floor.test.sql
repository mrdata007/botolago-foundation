-- Regression suite for 20261027100000_rapidapi_provider_quota_floor: the
-- provider's own quota figure is the floor of our RapidAPI count.
begin;
select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- 1 the table and privileges
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.rapidapi_provider_quota'::regclass), '1.1 the table forces RLS');
select extensions.ok(not has_table_privilege('service_role', 'app_private.rapidapi_provider_quota', 'select')
  and not has_table_privilege('authenticated', 'app_private.rapidapi_provider_quota', 'select'),
  '1.2 no API role reads the table directly');
select extensions.ok(
  has_function_privilege('service_role', 'api.service_record_rapidapi_quota(integer,integer,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_record_rapidapi_quota(integer,integer,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'api.service_record_rapidapi_quota(integer,integer,timestamptz)', 'execute'),
  '1.3 only the service role records an observation');
select extensions.is((select count(*)::int from app_private.rapidapi_provider_quota), 0,
  '1.4 empty on arrival: the count starts out unchanged');

-- 2 the old value without an observation
select app_private.rapidapi_budget_configure(p_used_offset => 472);
insert into app_private.rapidapi_call_counts (day, job, endpoint, status_code, calls) values
  (app_private.rapidapi_window_start(), 'fixtures', 'matches/get-incidents', 200, 8564);
select extensions.is(app_private.rapidapi_calls_this_month(), 9036::bigint,
  '2.1 counted + offset while there is no observation');

-- 3 who may record
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.service_record_rapidapi_quota(0, 10000)$$, 'PT403', 'forbidden',
  '3.1 a caller that is not the service role is refused');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok($$select api.service_record_rapidapi_quota(-1, 10000)$$, '22023', 'invalid_quota_observation',
  '3.2 a negative remaining is refused');
select extensions.throws_ok($$select api.service_record_rapidapi_quota(10001, 10000)$$, '22023', 'invalid_quota_observation',
  '3.3 remaining above the limit is refused');
select extensions.throws_ok($$select api.service_record_rapidapi_quota(5, 0)$$, '22023', 'invalid_quota_observation',
  '3.4 a limit of zero is refused');

-- 4 an observation before the window start is ignored
select extensions.is(
  api.service_record_rapidapi_quota(0, 10000, (app_private.rapidapi_window_start() - 1)::timestamp at time zone 'utc'),
  false, '4.1 an observation from before the window is not kept');
select extensions.is((select count(*)::int from app_private.rapidapi_provider_quota), 0, '4.2 nothing stored');

-- 5 the floor: the provider says more than we counted
select extensions.is(api.service_record_rapidapi_quota(0, 10000, now()), true, '5.1 a current observation is kept');
select extensions.is(app_private.rapidapi_calls_this_month(), 10000::bigint,
  '5.2 remaining 0 of 10,000 lifts 9,036 to 10,000');
select extensions.is((api.service_rapidapi_budget() ->> 'used')::int, 10000,
  '5.3 the Edge client reads the floor, so the hard limit fires');

-- 6 only newer observations replace the stored one
select extensions.is(api.service_record_rapidapi_quota(900, 10000, now() - interval '1 second'), false,
  '6.1 an older observation is ignored');
select extensions.is(app_private.rapidapi_calls_this_month(), 10000::bigint, '6.2 the stored one still stands');
select extensions.is(api.service_record_rapidapi_quota(0, 10000, now()), false,
  '6.3 an equal one with no lower remaining is not a change');

-- 7 our count wins when it is higher
delete from app_private.rapidapi_provider_quota;
select api.service_record_rapidapi_quota(3000, 10000, now());
select extensions.is(app_private.rapidapi_calls_this_month(), 9036::bigint,
  '7.1 limit - remaining (7,000) below our count (9,036): our count stands');
select extensions.is(api.service_record_rapidapi_quota(900, 10000, now() + interval '1 hour'), true,
  '7.2 an observation dated in the future is clamped to now and kept');
select extensions.ok((select observed_at <= statement_timestamp() from app_private.rapidapi_provider_quota),
  '7.3 the stored time is never later than now');
select extensions.is(app_private.rapidapi_calls_this_month(), 9100::bigint,
  '7.4 the new floor (10,000 - 900) is above our count again');

-- 8 an observation of a past window does not leak into this one
update app_private.rapidapi_provider_quota set window_start = window_start - 31;
select extensions.is(app_private.rapidapi_calls_this_month(), 9036::bigint,
  '8.1 an observation filed under another window is not used');

select * from extensions.finish();
rollback;
