-- Regression suite for 20261028100000_rapidapi_budget_per_host: the RapidAPI
-- budget is counted per provider host (Sofascore and SportAPI), each with its
-- own limits, reset day, counts and provider quota floor.
begin;
select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- 1 structure, seed and privileges
select extensions.ok(
  exists (select 1 from information_schema.columns where table_schema = 'app_private'
    and table_name = 'rapidapi_call_counts' and column_name = 'host')
  and exists (select 1 from information_schema.columns where table_schema = 'app_private'
    and table_name = 'rapidapi_provider_quota' and column_name = 'host'),
  '1.1 both counters carry a host');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.rapidapi_host_budgets'::regclass), '1.2 the host budgets table forces RLS');
select extensions.ok(not has_table_privilege('service_role', 'app_private.rapidapi_host_budgets', 'select')
  and not has_table_privilege('authenticated', 'app_private.rapidapi_host_budgets', 'select')
  and not has_function_privilege('service_role',
    'app_private.rapidapi_host_budget_configure(text,integer,integer,integer,integer,integer)', 'execute')
  and not has_function_privilege('service_role', 'app_private.rapidapi_calls_for_host(text)', 'execute')
  and not has_function_privilege('service_role', 'app_private.rapidapi_active_host()', 'execute'),
  '1.3 no API role reads or changes the host budgets or calls the helpers');
select extensions.ok(
  has_function_privilege('service_role', 'api.service_rapidapi_host_budget(text)', 'execute')
  and has_function_privilege('service_role', 'api.service_record_rapidapi_host_calls(text,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'api.service_record_rapidapi_host_quota(text,integer,integer,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_rapidapi_host_budget(text)', 'execute')
  and not has_function_privilege('anon', 'api.service_record_rapidapi_host_calls(text,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_record_rapidapi_host_quota(text,integer,integer,timestamptz)', 'execute'),
  '1.4 only the service role reads a host budget and records its calls and quota');
select extensions.is(
  (select to_jsonb(h) - 'updated_at' from app_private.rapidapi_host_budgets h),
  '{"host":"sportapi7.p.rapidapi.com","quota_limit":15000,"soft_limit":13500,"hard_limit":14700,"reset_day_of_month":27,"used_offset":0,"incidents_interval_minutes":15}'::jsonb,
  '1.5 SportAPI is seeded: 15,000 calls, soft 13,500, hard 14,700, window starting on the 27th');
select extensions.is(
  (select to_jsonb(s) - 'updated_at' - 'id' from app_private.rapidapi_budget_settings s),
  '{"soft_limit":8500,"hard_limit":9700,"reset_day_of_month":10,"used_offset":0,"live_interval_seconds":120,"season_quiet_hours":3,"season_match_hours":1,"incidents_interval_minutes":15}'::jsonb,
  '1.6 the Sofascore settings row is as it was');
select extensions.throws_ok(
  $$insert into app_private.rapidapi_host_budgets (host, quota_limit, soft_limit, hard_limit, reset_day_of_month)
    values ('sofascore.p.rapidapi.com', 10000, 8500, 9700, 10)$$,
  '23514', null, '1.7 the Sofascore host cannot get a second settings row');

-- 2 the window of each host
select extensions.is(app_private.rapidapi_window_start_for('sportapi7.p.rapidapi.com', '2026-10-28 12:00+00'),
  '2026-10-27'::date, '2.1 the SportAPI window opened on 27 Oct');
select extensions.is(app_private.rapidapi_window_start_for('sportapi7.p.rapidapi.com', '2026-11-26 23:59+00'),
  '2026-10-27'::date, '2.2 the day before the reset is still that window');
select extensions.is(app_private.rapidapi_window_start_for('sportapi7.p.rapidapi.com', '2026-11-27 00:00+00'),
  '2026-11-27'::date, '2.3 the 27th opens the next one');
select extensions.is(app_private.rapidapi_window_start_for('sportapi7.p.rapidapi.com', '2027-01-05 08:00+00'),
  '2026-12-27'::date, '2.4 across the new year');
select extensions.is(app_private.rapidapi_window_start_for('sofascore.p.rapidapi.com', '2026-10-28 12:00+00'),
  '2026-10-10'::date, '2.5 the Sofascore window still starts on the 10th');
select extensions.is(app_private.rapidapi_window_start_for('sofascore.p.rapidapi.com', '2026-11-15 12:00+00'),
  app_private.rapidapi_window_start('2026-11-15 12:00+00'),
  '2.6 and equals the old function for that host');

-- 3 separate counts
select app_private.rapidapi_budget_configure(p_used_offset => 472);
insert into app_private.rapidapi_call_counts (day, job, endpoint, status_code, calls) values
  (app_private.rapidapi_window_start(), 'fixtures', 'matches/get-incidents', 200, 8564);
select extensions.is(app_private.rapidapi_active_host(), 'sofascore.p.rapidapi.com',
  '3.1 with only Sofascore rows the active host is Sofascore');
select extensions.is(app_private.rapidapi_calls_for_host('sofascore.p.rapidapi.com'), 9036::bigint,
  '3.2 the Sofascore pool: 8,564 counted + 472 offset');
select extensions.is(app_private.rapidapi_calls_for_host('sportapi7.p.rapidapi.com'), 0::bigint,
  '3.3 the SportAPI pool starts at zero');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.service_rapidapi_host_budget('sportapi7.p.rapidapi.com')$$,
  'PT403', 'forbidden', '3.4 a caller that is not the service role cannot read a host budget');
select extensions.throws_ok($$select api.service_record_rapidapi_host_calls('sportapi7.p.rapidapi.com', 'fixtures', '[]'::jsonb)$$,
  'PT403', 'forbidden', '3.5 nor record calls');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_record_rapidapi_host_calls('sportapi7.p.rapidapi.com', 'fixtures', jsonb_build_array(
    jsonb_build_object('endpoint', 'tournaments/get-live-events', 'status', 200, 'calls', 3),
    jsonb_build_object('endpoint', 'matches/get-incidents', 'status', 200, 'calls', 2))),
  5, '3.6 SportAPI calls are recorded');
select extensions.is(app_private.rapidapi_calls_for_host('sportapi7.p.rapidapi.com'), 5::bigint,
  '3.7 and counted in its pool');
select extensions.is(app_private.rapidapi_calls_for_host('sofascore.p.rapidapi.com'), 9036::bigint,
  '3.8 the Sofascore pool did not move');
select extensions.is(app_private.rapidapi_active_host(), 'sportapi7.p.rapidapi.com',
  '3.9 the host of the most recent call is the active one');
select extensions.is(app_private.rapidapi_calls_this_month(), 5::bigint,
  '3.10 the readers without a host follow it');
select extensions.is(
  api.service_rapidapi_host_budget('sportapi7.p.rapidapi.com'),
  jsonb_build_object('used', 5, 'softLimit', 13500, 'hardLimit', 14700,
    'liveIntervalSeconds', 120, 'windowStart', app_private.rapidapi_window_start_for('sportapi7.p.rapidapi.com'),
    'host', 'sportapi7.p.rapidapi.com', 'incidentsIntervalMinutes', 15),
  '3.11 the Edge client reads the SportAPI count, its limits and its window start');
select extensions.is((api.service_rapidapi_budget() ->> 'used')::int, 9036,
  '3.12 the Sofascore read is unchanged');
select extensions.is(api.service_rapidapi_host_budget('SportAPI7.p.rapidapi.com ') ->> 'softLimit', '13500',
  '3.13 the host is read case-insensitively and trimmed');
select extensions.is(app_private.rapidapi_live_interval_seconds(), 120,
  '3.14 the cron cadence is the setting while SportAPI is far from its soft limit');
-- the old 2-argument write still counts for Sofascore, and flips the active host back
select extensions.is(api.service_record_rapidapi_calls('fixtures', jsonb_build_array(
    jsonb_build_object('endpoint', 'matches/get-incidents', 'status', 429, 'calls', 1))),
  1, '3.15 the Sofascore write still works');
select extensions.is(app_private.rapidapi_active_host(), 'sofascore.p.rapidapi.com',
  '3.16 and makes Sofascore the active host again');
select extensions.is(app_private.rapidapi_calls_for_host('sofascore.p.rapidapi.com'), 9037::bigint,
  '3.17 in the Sofascore pool only');
select extensions.is(app_private.rapidapi_calls_for_host('sportapi7.p.rapidapi.com'), 5::bigint,
  '3.18 SportAPI keeps its 5');

-- 4 an unknown host
select extensions.is(api.service_rapidapi_host_budget('other.example'),
  jsonb_build_object('used', 0, 'softLimit', 0, 'hardLimit', 0, 'liveIntervalSeconds', 180,
    'windowStart', app_private.rapidapi_window_start_for('other.example'), 'host', 'other.example',
    'incidentsIntervalMinutes', 15),
  '4.1 an unknown host has zero limits: nothing is sent');
select extensions.throws_ok($$select api.service_record_rapidapi_host_calls('other.example', 'fixtures', '[]'::jsonb)$$,
  '22023', 'unknown_rapidapi_host', '4.2 calls cannot be recorded for it');
select extensions.throws_ok($$select api.service_record_rapidapi_host_quota('other.example', 5, 10)$$,
  '22023', 'unknown_rapidapi_host', '4.3 nor a quota observation');
select extensions.throws_ok($$select api.service_record_rapidapi_host_calls('sportapi7.p.rapidapi.com', 'Fixtures', '[]'::jsonb)$$,
  '22023', 'invalid_rapidapi_calls', '4.4 a job name that is not a plain identifier is refused');

-- 5 the provider's figure is the floor of its own host only
select extensions.is(
  api.service_record_rapidapi_host_quota('sportapi7.p.rapidapi.com', 100, 15000, now()), true,
  '5.1 a SportAPI observation is kept');
select extensions.is(app_private.rapidapi_calls_for_host('sportapi7.p.rapidapi.com'), 14900::bigint,
  '5.2 remaining 100 of 15,000 lifts 5 to 14,900');
select extensions.is(app_private.rapidapi_calls_for_host('sofascore.p.rapidapi.com'), 9037::bigint,
  '5.3 the Sofascore count is not touched');
select extensions.is(
  api.service_rapidapi_host_budget('sportapi7.p.rapidapi.com') ->> 'used', '14900',
  '5.4 the Edge client reads the floor, so SportAPI''s hard limit (14,700) fires');
select extensions.is(
  api.service_rapidapi_host_budget('sportapi7.p.rapidapi.com') ->> 'liveIntervalSeconds', '180',
  '5.5 and the live poll stretches to 180 s');
select extensions.is(api.service_record_rapidapi_quota(3000, 10000, now()), true,
  '5.6 the old Sofascore observation function records for Sofascore');
select extensions.is(app_private.rapidapi_calls_for_host('sofascore.p.rapidapi.com'), 9037::bigint,
  '5.7 limit - remaining (7,000) is below the Sofascore count: its count stands');
select extensions.is(
  (select count(*)::int from app_private.rapidapi_provider_quota where host = 'sofascore.p.rapidapi.com'), 1,
  '5.8 one observation row per host');
select extensions.is(
  api.service_record_rapidapi_host_quota('sportapi7.p.rapidapi.com', 900, 15000, now() - interval '1 second'), false,
  '5.9 an older observation does not replace the stored one');
select extensions.is(
  api.service_record_rapidapi_host_quota('sportapi7.p.rapidapi.com', 5, 15000,
    (app_private.rapidapi_window_start_for('sportapi7.p.rapidapi.com') - 1)::timestamp at time zone 'utc'),
  false, '5.10 an observation from before the window is not kept');
update app_private.rapidapi_provider_quota set window_start = window_start - 31
  where host = 'sportapi7.p.rapidapi.com';
select extensions.is(app_private.rapidapi_calls_for_host('sportapi7.p.rapidapi.com'), 5::bigint,
  '5.11 an observation filed under another window is not used');

-- 6 the health check follows the active host
create function pg_temp.status_for(p_host text, p_total integer) returns text language plpgsql as $$
begin
  delete from app_private.rapidapi_call_counts where host = p_host
    and day >= app_private.rapidapi_window_start_for(p_host);
  insert into app_private.rapidapi_call_counts (day, host, job, endpoint, status_code, calls)
  values ((statement_timestamp() at time zone 'utc')::date, p_host, 'fixtures', 'a/b', 200, p_total);
  return app_private.rapidapi_budget_health() ->> 'status';
end;
$$;
select app_private.rapidapi_budget_configure(p_used_offset => 0);
select extensions.is(pg_temp.status_for('sportapi7.p.rapidapi.com', 11999), 'ok', '6.1 SportAPI 11,999 of 15,000 is ok');
select extensions.is(pg_temp.status_for('sportapi7.p.rapidapi.com', 12000), 'warn', '6.2 12,000 (80%) warns');
select extensions.is(pg_temp.status_for('sportapi7.p.rapidapi.com', 14249), 'warn', '6.3 14,249 still warns');
select extensions.is(pg_temp.status_for('sportapi7.p.rapidapi.com', 14250), 'fail', '6.4 14,250 (95%) fails');
select extensions.alike(app_private.rapidapi_budget_health() ->> 'detail',
  '14250 of 15000 RapidAPI calls used this month (warns at 12000, fails at 14250) on sportapi7.p.rapidapi.com',
  '6.5 the detail names the host and its limits');
select extensions.is(pg_temp.status_for('sofascore.p.rapidapi.com', 9500), 'fail', '6.6 Sofascore keeps 8,000 / 9,500');
select extensions.alike(app_private.rapidapi_budget_health() ->> 'detail', '9500 of 10000%',
  '6.7 and its detail');
select extensions.is(
  (select c ->> 'status' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' = 'rapidapi_budget'),
  'fail', '6.8 ops_health_checks carries the check');

-- 7 the owner's configure function
select extensions.throws_ok($$select app_private.rapidapi_host_budget_configure('sofascore.p.rapidapi.com', p_used_offset => 1)$$,
  '22023', null, '7.1 the Sofascore host is configured with its own function');
select extensions.throws_ok($$select app_private.rapidapi_host_budget_configure('other.example', p_used_offset => 1)$$,
  '22023', 'unknown_rapidapi_host', '7.2 an unknown host is refused');
select extensions.throws_ok($$select app_private.rapidapi_host_budget_configure('sportapi7.p.rapidapi.com', p_soft_limit => 15500)$$,
  '23514', null, '7.3 a soft limit above the hard limit is refused');
select extensions.throws_ok($$select app_private.rapidapi_host_budget_configure('sportapi7.p.rapidapi.com', p_hard_limit => 15001)$$,
  '23514', null, '7.4 a hard limit above the quota is refused');
select extensions.is(
  (app_private.rapidapi_host_budget_configure('sportapi7.p.rapidapi.com', p_used_offset => 25)) ->> 'usedOffset',
  '25', '7.5 an offset can be set');
select extensions.is(
  (select used_offset from app_private.rapidapi_host_budgets where host = 'sportapi7.p.rapidapi.com'),
  25, '7.6 and is stored');

-- 8 the periodic incidents interval, per host
select extensions.is(app_private.rapidapi_incidents_interval_configure('sportapi7.p.rapidapi.com', 10), 10,
  '8.1 the interval of a host can be set');
select extensions.is(api.service_rapidapi_host_budget('sportapi7.p.rapidapi.com') ->> 'incidentsIntervalMinutes', '10',
  '8.2 and the Edge client reads it');
select extensions.is(api.service_rapidapi_budget() ->> 'incidentsIntervalMinutes', '15',
  '8.3 the Sofascore read has its own, 15 by default');
select extensions.is(app_private.rapidapi_incidents_interval_configure('sofascore.p.rapidapi.com', 20), 20,
  '8.4 the Sofascore interval is set on its settings row');
select extensions.is(api.service_rapidapi_budget() ->> 'incidentsIntervalMinutes', '20', '8.5 and read');
select extensions.throws_ok($$select app_private.rapidapi_incidents_interval_configure('sportapi7.p.rapidapi.com', 0)$$,
  '23514', null, '8.6 zero minutes is refused');
select extensions.throws_ok($$select app_private.rapidapi_incidents_interval_configure('other.example', 10)$$,
  '22023', 'unknown_rapidapi_host', '8.7 an unknown host is refused');

select * from extensions.finish();
rollback;
