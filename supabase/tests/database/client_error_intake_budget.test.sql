-- Browser error intake budget (20261015120200, audit SEC-06): the 300-kinds-
-- per-hour limit is exact, and what the intake refuses is counted.
--
-- CI's database-quality job is the authority. Two sessions cannot be opened
-- inside one pgTAP transaction, so true parallel callers are not exercised
-- here: the test pins what makes them safe (the advisory lock is taken before
-- a new kind is admitted, the count is exact at the limit, refused kinds are
-- counted in shards with an asynchronous commit). The concurrent behaviour
-- (exactly 300 kinds under 40 parallel clients, no deadlock) was measured with
-- pgbench on a throwaway local Postgres 16, not here.
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
create function pg_temp.new_kinds(p_prefix text, p_count integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('kind', 'unhandled', 'area', 'window.error',
    'code', p_prefix || i, 'route', '/', 'release', 'unknown'))
  from generate_series(1, p_count) i
$$;
create function pg_temp.hour_kinds() returns integer language sql as $$
  select count(*)::integer from app_private.client_error_counts
  where bucket_hour = date_trunc('hour', statement_timestamp())
$$;
create function pg_temp.sqlstate_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlstate;
end;
$$;
create function pg_temp.dropped() returns integer language sql as $$
  select coalesce(sum(dropped_new_kinds), 0)::integer from app_private.client_error_intake
  where bucket_hour = date_trunc('hour', statement_timestamp())
$$;

-- Keep clear of an hour boundary: the function and these checks each read the
-- clock for themselves, and a test that straddles :00 would measure two hours.
select pg_sleep(case when date_trunc('hour', clock_timestamp()) + interval '1 hour'
  - clock_timestamp() < interval '30 seconds' then 31 else 0 end);

delete from app_private.client_error_counts;
delete from app_private.client_error_intake;

-- ---------------------------------------------------------------------------
-- Access: the counters are internal; the endpoint stays public.
-- ---------------------------------------------------------------------------
select extensions.ok(not has_table_privilege('anon', 'app_private.client_error_intake', 'select')
  and not has_table_privilege('authenticated', 'app_private.client_error_intake', 'select')
  and not has_table_privilege('service_role', 'app_private.client_error_intake', 'select')
  and not has_table_privilege('anon', 'app_private.client_error_intake', 'insert'),
  'no API role can read or write the intake counters');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.client_error_intake'::regclass), 'row security is on and forced');
select extensions.ok(has_function_privilege('anon', 'api.report_client_errors(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'api.report_client_errors(jsonb)', 'execute')
  and not has_function_privilege('public', 'api.report_client_errors(jsonb)', 'execute'),
  'visitors and users can still report, and nobody else gains the right');
select extensions.is((select count(*)::integer from information_schema.columns
  where table_schema = 'app_private' and table_name = 'client_error_intake'
    and column_name ~ '(user|ip|agent|email|query|route|message|sample|code)'), 0,
  'the counters hold no user, address, page or text');
select extensions.is(pg_temp.sqlstate_of(
  $$insert into app_private.client_error_intake (bucket_hour, shard) values (now(), 32)$$),
  '23514', 'a counter shard is 0 to 31');

-- ---------------------------------------------------------------------------
-- A new kind is admitted under the hour's advisory lock.
-- ---------------------------------------------------------------------------
select extensions.is((select count(*)::integer from pg_locks
  where locktype = 'advisory' and pid = pg_backend_pid()), 0, 'no advisory lock before the first report');
select extensions.is(pg_temp.report(pg_temp.new_kinds('Lock', 1)), '{"accepted": 1}'::jsonb,
  'a new kind is accepted');
select extensions.is((select count(*)::integer from pg_locks
  where locktype = 'advisory' and pid = pg_backend_pid() and granted), 1,
  'admitting it took the hour''s advisory lock');
select extensions.is(pg_temp.report(pg_temp.new_kinds('Lock', 1)), '{"accepted": 1}'::jsonb,
  'the same kind again is counted');
select extensions.is((select reports from app_private.client_error_counts where code = 'Lock1'), 2,
  'as a count, not a second row');
select extensions.is((select count(*)::integer from pg_locks
  where locktype = 'advisory' and pid = pg_backend_pid() and granted), 1,
  'and the lock is not taken twice');

-- ---------------------------------------------------------------------------
-- The limit is exact: 299 stored, ten new kinds in one call, one fits.
-- ---------------------------------------------------------------------------
delete from app_private.client_error_counts;
insert into app_private.client_error_counts (bucket_hour, kind, area, code, route, release, first_at, last_at)
select date_trunc('hour', statement_timestamp()), 'handled', 'filler', 'F' || i, '/', 'unknown', now(), now()
from generate_series(1, 299) i;
select extensions.is(pg_temp.report(pg_temp.new_kinds('Burst', 10)), '{"accepted": 1}'::jsonb,
  'ten new kinds with room for one: one is accepted');
select extensions.is(pg_temp.hour_kinds(), 300, 'the hour holds exactly 300 kinds');
select extensions.is(pg_temp.dropped(), 9, 'the nine refused kinds are counted');
select extensions.is(current_setting('synchronous_commit'), 'off',
  'the refusal counter is written with an asynchronous commit');

-- At the limit: refused and counted, known kinds still counted.
select extensions.is(pg_temp.report(pg_temp.new_kinds('Later', 3)), '{"accepted": 0}'::jsonb,
  'a full hour accepts no new kind');
select extensions.is(pg_temp.hour_kinds(), 300, 'and stays at 300');
select extensions.is(pg_temp.dropped(), 12, 'the refusals keep adding up');
select extensions.is(
  pg_temp.report(jsonb_build_array(jsonb_build_object('kind', 'unhandled', 'area', 'window.error',
    'code', (select code from app_private.client_error_counts where code like 'Burst%'),
    'route', '/', 'release', 'unknown'))),
  '{"accepted": 1}'::jsonb, 'a kind already stored is still counted when the hour is full');
select extensions.is(pg_temp.dropped(), 12, 'which refuses nothing');
select extensions.ok((select max(shard) <= 31 and min(shard) >= 0 from app_private.client_error_intake),
  'the counter sits in one of 32 shards');

-- ---------------------------------------------------------------------------
-- Malformed reports are skipped and not stored (and not counted: the browser
-- sink never sends one).
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.report('[
    {"kind":"unhandled","area":"window.error","code":"not a code!","route":"/"},
    {"kind":"fatal","area":"window.error","code":"Error"},
    "a string"
  ]'::jsonb), '{"accepted": 0}'::jsonb, 'three malformed reports are skipped');
select extensions.is(pg_temp.hour_kinds(), 300, 'without being stored');
select extensions.is(pg_temp.dropped(), 12, 'and without touching the refusal counters');

-- An invalid list raises before anything is written.
select extensions.throws_ok($$select pg_temp.report('{"kind":"unhandled"}')$$,
  '22023', 'client_errors_invalid', 'a report must still come in a list');

-- ---------------------------------------------------------------------------
-- The counters are kept thirty days: a shard's first refusal clears older rows.
-- ---------------------------------------------------------------------------
delete from app_private.client_error_intake;
insert into app_private.client_error_intake (bucket_hour, shard, dropped_new_kinds)
values (date_trunc('hour', statement_timestamp()) - interval '31 days', 0, 5),
       (date_trunc('hour', statement_timestamp()) - interval '29 days', 0, 6);
select pg_temp.report(pg_temp.new_kinds('Pruning', 1));
select extensions.is((select array_agg(dropped_new_kinds order by dropped_new_kinds) from app_private.client_error_intake),
  array[1, 6], 'counters older than 30 days are removed, the recent one kept');

-- ---------------------------------------------------------------------------
-- A flood of browser reports still only warns: it cannot pass for an outage.
-- ---------------------------------------------------------------------------
update app_private.client_error_counts set kind = 'unhandled', reports = 1000000 where code = 'F1';
select extensions.is(
  (select c ->> 'status' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
   where c ->> 'name' = 'browser_errors'), 'warn', 'a flood of browser errors warns');

select * from extensions.finish();
rollback;
