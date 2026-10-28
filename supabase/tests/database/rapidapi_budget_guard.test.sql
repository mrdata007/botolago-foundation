-- Regression suite for 20261026143000_rapidapi_budget_guard_and_poll_schedule:
-- the settings row and its configure function, the quota window that starts on
-- the reset day, the offset, the Edge client's budget read, the stretched live
-- interval, the details schedule and the quieter season refresh.
begin;
select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- 1 settings and privileges
select extensions.is((select count(*)::int from app_private.rapidapi_budget_settings), 1, '1.1 one settings row');
select extensions.is(
  (select to_jsonb(s) - 'updated_at' - 'id' from app_private.rapidapi_budget_settings s),
  '{"soft_limit":8500,"hard_limit":9700,"reset_day_of_month":10,"used_offset":0,"live_interval_seconds":120,"season_quiet_hours":3,"season_match_hours":1,"incidents_interval_minutes":15}'::jsonb,
  '1.2 defaults: 8,500 soft, 9,700 hard, reset on the 10th, no offset, 120 s live poll, hourly season refresh near a match, 3 h on a quiet day');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.rapidapi_budget_settings'::regclass), '1.3 the table forces RLS');
select extensions.ok(not has_table_privilege('service_role', 'app_private.rapidapi_budget_settings', 'select')
  and not has_function_privilege('service_role',
    'app_private.rapidapi_budget_configure(integer,integer,integer,integer,integer,integer,integer)', 'execute')
  and not has_function_privilege('service_role', 'app_private.rapidapi_window_start(timestamptz)', 'execute'),
  '1.4 no API role reads the settings, changes them or computes the window');
select extensions.ok(has_function_privilege('service_role', 'api.service_rapidapi_budget()', 'execute')
  and not has_function_privilege('authenticated', 'api.service_rapidapi_budget()', 'execute')
  and not has_function_privilege('anon', 'api.service_rapidapi_budget()', 'execute')
  and has_function_privilege('service_role', 'api.service_football_details_schedule()', 'execute')
  and not has_function_privilege('authenticated', 'api.service_football_details_schedule()', 'execute'),
  '1.5 only the service role reads the budget and the details schedule');

-- 2 the quota window
select extensions.is(app_private.rapidapi_window_start('2026-10-26 12:00+00'), '2026-10-10'::date,
  '2.1 the window opened on the most recent 10th');
select extensions.is(app_private.rapidapi_window_start('2026-11-09 23:59+00'), '2026-10-10'::date,
  '2.2 the day before the reset is still the old window');
select extensions.is(app_private.rapidapi_window_start('2026-11-10 00:00+00'), '2026-11-10'::date,
  '2.3 the reset day opens the next one');
select extensions.is(app_private.rapidapi_window_start('2027-01-05 08:00+00'), '2026-12-10'::date,
  '2.4 across the new year');
select app_private.rapidapi_budget_configure(p_reset_day => 31);
select extensions.is(app_private.rapidapi_window_start('2027-03-01 08:00+00'), '2027-02-28'::date,
  '2.5 a reset on the 31st falls on the last day of a short month');
select extensions.is(app_private.rapidapi_window_start('2026-05-15 08:00+00'), '2026-04-30'::date,
  '2.6 and on the 30th in April');
select extensions.is(app_private.rapidapi_window_start('2026-05-31 08:00+00'), '2026-05-31'::date,
  '2.7 and on the 31st when there is one');
select extensions.throws_ok($$select app_private.rapidapi_budget_configure(p_reset_day => 32)$$,
  '23514', null, '2.8 a reset day above 31 is refused');
select app_private.rapidapi_budget_configure(p_reset_day => 10);

-- 3 the count: since the window start, plus the offset
insert into app_private.rapidapi_call_counts (day, job, endpoint, status_code, calls) values
  (app_private.rapidapi_window_start() - 1, 'fixtures', 'matches/get-incidents', 200, 5000),
  (app_private.rapidapi_window_start(), 'fixtures', 'matches/get-incidents', 200, 7),
  ((statement_timestamp() at time zone 'utc')::date, 'fixtures', 'matches/get-lineups', 200, 3);
select extensions.is(app_private.rapidapi_calls_this_month(), 10::bigint,
  '3.1 only the window is counted');
select app_private.rapidapi_budget_configure(p_used_offset => 470);
select extensions.is(app_private.rapidapi_calls_this_month(), 480::bigint,
  '3.2 the offset for calls the table never saw is added');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.service_rapidapi_budget()$$, 'PT403', 'forbidden',
  '3.3 a caller that is not the service role is refused');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_rapidapi_budget(),
  jsonb_build_object('used', 480, 'softLimit', 8500, 'hardLimit', 9700, 'liveIntervalSeconds', 120,
    'windowStart', app_private.rapidapi_window_start(), 'incidentsIntervalMinutes', 15),
  '3.4 the Edge client reads the count, the limits, the live interval, the window start and the incidents interval');
select app_private.rapidapi_budget_configure(null, 9000, null, null);
select extensions.throws_ok($$select app_private.rapidapi_budget_configure(9500, null, null, null)$$,
  '23514', null, '3.5 a soft limit above the hard limit is refused');
select app_private.rapidapi_budget_configure(8500, 9700, null, 0);

-- 4 the live interval
select extensions.is(app_private.rapidapi_live_interval_seconds(), 120, '4.1 the setting while under the soft limit');
select app_private.rapidapi_budget_configure(p_used_offset => 8500);
select extensions.is(app_private.rapidapi_live_interval_seconds(), 180, '4.2 at least 180 s past the soft limit');
select app_private.rapidapi_budget_configure(p_used_offset => 0, p_live_interval => 60);
select extensions.is(app_private.rapidapi_live_interval_seconds(), 60, '4.3 60 s is allowed');
select extensions.throws_ok($$select app_private.rapidapi_budget_configure(p_live_interval => 30)$$,
  '23514', null, '4.4 faster than 60 s is refused');
select extensions.throws_ok($$select app_private.rapidapi_budget_configure(p_live_interval => 301)$$,
  '23514', null, '4.5 and so is slower than 300 s');
select extensions.ok(
  (select prosrc !~ 'fantasy_api_rating_candidates' and prosrc ~ 'rapidapi_live_interval_seconds'
   from pg_proc where oid = 'app_private.football_live_refresh_tick()'::regprocedure),
  '4.6 the live tick follows the interval and no longer looks at rating candidates');

-- 5 the staff read carries the window and the limits
select extensions.ok(
  (select has_function_privilege('authenticated', 'api.admin_rapidapi_calls_this_month()', 'execute')
     and not has_function_privilege('anon', 'api.admin_rapidapi_calls_this_month()', 'execute')),
  '5.1 the staff read is still for signed-in callers');

-- 6 the rating poll job
select extensions.is(
  (select schedule || ' ' || command from cron.job where jobname = 'fantasy-rating-polls'),
  '*/5 * * * * select app_private.fantasy_rating_polls_tick();',
  '6.1 pg_cron checks every 5 minutes whether a rating poll is due');
select extensions.ok(not has_function_privilege('service_role', 'app_private.fantasy_rating_polls_tick()', 'execute'),
  '6.2 only the database runs it');
update app_private.notification_email_settings set football_live_refresh_enabled = false;
select extensions.is(app_private.fantasy_rating_polls_tick(), 'disabled', '6.3 off with the live refresh switch');

-- 7 the season refresh: a quiet day is every season_quiet_hours, or the 03:00 pass only
select extensions.ok(
  (select prosrc ~ 'season_quiet_hours' and prosrc ~ 'match_near'
   from pg_proc where oid = 'app_private.football_season_refresh_tick()'::regprocedure),
  '7.1 the season tick looks for a fixture within a day and reads the quiet-hours setting');

select * from extensions.finish();
rollback;
