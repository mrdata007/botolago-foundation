-- RapidAPI call counter and monthly budget.
--
-- The SofaScore plan allows 10,000 requests a month. Live polling every 60 s
-- spends them faster than the old 2-minute tick did, so every request the Edge
-- Function sends through supabase/functions/_shared/rapidapi-client.ts is now
-- counted here, per UTC day, job, endpoint and HTTP status.
--
--   app_private.rapidapi_call_counts     one row per (day, job, endpoint, status);
--                                        `calls` is how many requests, retries
--                                        included (status 0 = no answer: a
--                                        network error or timeout).
--   api.service_record_rapidapi_calls    the Edge Function's write (service role),
--                                        fire-and-forget: a failure is logged and
--                                        never fails or delays a refresh.
--   app_private.rapidapi_calls_this_month()   the current UTC calendar month's total.
--   app_private.rapidapi_budget_health() / ops_health_checks()
--                                        the `rapidapi_budget` check: warn at
--                                        8,000 calls in the month, fail (which
--                                        pages the owner through ops-alert-tick)
--                                        at 9,500.
--   api.admin_rapidapi_calls_this_month()     staff read (football.read_operations):
--                                        calls this month by job and endpoint.
--
-- Endpoints are stored as the request path without its query string
-- ("matches/get-incidents", never "?matchId=..."), so no id, key or provider
-- payload is kept.
--
-- ops_health_checks() is wrapped, not edited (the newest wrapper before this was
-- 20261010120300's). scripts/ops/watchdog.ts REQUIRED_DATABASE_CHECKS does not
-- list `rapidapi_budget` until production has this migration.
--
-- Deploy order: this migration, then the Edge Function. Without the migration
-- the Edge Function logs `rapidapi_count_failed` and carries on.

create table app_private.rapidapi_call_counts (
  day date not null,
  job text not null,
  endpoint text not null,
  status_code smallint not null,
  calls integer not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  constraint rapidapi_call_counts_pkey primary key (day, job, endpoint, status_code),
  constraint rapidapi_call_counts_job_check check (job ~ '^[a-z][a-z0-9_]{0,39}$'),
  constraint rapidapi_call_counts_endpoint_check check (endpoint ~ '^[a-z0-9][a-z0-9/_.-]{0,119}$'),
  constraint rapidapi_call_counts_status_check check (status_code between 0 and 599),
  constraint rapidapi_call_counts_calls_check check (calls >= 0)
);
comment on table app_private.rapidapi_call_counts is
  'RapidAPI requests sent by the Edge Functions, per UTC day, job, endpoint (path without query) and HTTP status (0 = no answer). Written only by api.service_record_rapidapi_calls; read by the rapidapi_budget health check and api.admin_rapidapi_calls_this_month.';
alter table app_private.rapidapi_call_counts enable row level security;
alter table app_private.rapidapi_call_counts force row level security;
revoke all on app_private.rapidapi_call_counts from public, anon, authenticated, service_role;

-- One call per refresh: `p_calls` is an array of {endpoint, status, calls}.
create or replace function api.service_record_rapidapi_calls(p_job text, p_calls jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_total integer := 0;
  v_day date := (statement_timestamp() at time zone 'utc')::date;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_job is null or p_job !~ '^[a-z][a-z0-9_]{0,39}$'
    or p_calls is null or jsonb_typeof(p_calls) <> 'array' or jsonb_array_length(p_calls) > 100 then
    raise exception using errcode = '22023', message = 'invalid_rapidapi_calls';
  end if;
  for v_item in select item from jsonb_array_elements(p_calls) item loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'calls') is distinct from 'number'
      or jsonb_typeof(v_item -> 'status') is distinct from 'number'
      or coalesce(v_item ->> 'endpoint', '') !~ '^[a-z0-9][a-z0-9/_.-]{0,119}$'
      or (v_item ->> 'calls') !~ '^[0-9]{1,4}$'
      or (v_item ->> 'status') !~ '^[0-9]{1,3}$'
      or (v_item ->> 'status')::integer > 599
      or (v_item ->> 'calls')::integer < 1 then
      raise exception using errcode = '22023', message = 'invalid_rapidapi_calls';
    end if;
    insert into app_private.rapidapi_call_counts as c (day, job, endpoint, status_code, calls)
    values (v_day, p_job, v_item ->> 'endpoint', (v_item ->> 'status')::smallint,
      (v_item ->> 'calls')::integer)
    on conflict (day, job, endpoint, status_code) do update
      set calls = c.calls + excluded.calls, updated_at = statement_timestamp();
    v_total := v_total + (v_item ->> 'calls')::integer;
  end loop;
  return v_total;
end;
$$;
revoke all on function api.service_record_rapidapi_calls(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function api.service_record_rapidapi_calls(text, jsonb) to service_role;
comment on function api.service_record_rapidapi_calls(text, jsonb) is
  'Service role: adds RapidAPI request counts (endpoint path without query, HTTP status, calls) for one job to today''s (UTC) counters. Returns the number of calls added.';

create or replace function app_private.rapidapi_calls_this_month()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.calls), 0)::bigint
  from app_private.rapidapi_call_counts c
  where c.day >= date_trunc('month', statement_timestamp() at time zone 'utc')::date
    and c.day < (date_trunc('month', statement_timestamp() at time zone 'utc') + interval '1 month')::date;
$$;
revoke all on function app_private.rapidapi_calls_this_month()
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_calls_this_month() is
  'RapidAPI requests counted in the current UTC calendar month, all jobs and endpoints.';

create or replace function app_private.rapidapi_budget_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_calls bigint := app_private.rapidapi_calls_this_month();
  v_status text;
begin
  v_status := case when v_calls >= 9500 then 'fail' when v_calls >= 8000 then 'warn' else 'ok' end;
  return jsonb_build_object(
    'name', 'rapidapi_budget',
    'status', v_status,
    'detail', v_calls || ' of 10000 RapidAPI calls used this month (warns at 8000, fails at 9500)');
end;
$$;
revoke all on function app_private.rapidapi_budget_health()
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_budget_health() is
  'The rapidapi_budget health check: warn at 8000 counted RapidAPI calls in the current UTC month, fail at 9500. Counts only. No grant.';

alter function app_private.ops_health_checks() rename to ops_health_checks_before_rapidapi_budget;

create function app_private.ops_health_checks()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb := app_private.ops_health_checks_before_rapidapi_budget();
  checks jsonb := coalesce(result -> 'checks', '[]'::jsonb) || app_private.rapidapi_budget_health();
begin
  return result || jsonb_build_object(
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks);
end;
$$;

revoke all on function
  app_private.ops_health_checks(),
  app_private.ops_health_checks_before_rapidapi_budget()
from public, anon, authenticated, service_role;
grant execute on function
  app_private.ops_health_checks(),
  app_private.ops_health_checks_before_rapidapi_budget()
to postgres;

-- Staff read: this month's calls by job and endpoint.
create or replace function api.admin_rapidapi_calls_this_month()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', statement_timestamp() at time zone 'utc')::date;
begin
  perform app_private.admin_assert_permission('football.read_operations');
  return jsonb_build_object(
    'month', to_char(v_month_start, 'YYYY-MM'),
    'monthlyLimit', 10000,
    'warnAt', 8000,
    'failAt', 9500,
    'total', app_private.rapidapi_calls_this_month(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('job', r.job, 'endpoint', r.endpoint, 'calls', r.calls)
        order by r.job, r.endpoint)
      from (
        select c.job, c.endpoint, sum(c.calls)::bigint as calls
        from app_private.rapidapi_call_counts c
        where c.day >= v_month_start and c.day < (v_month_start + interval '1 month')::date
        group by c.job, c.endpoint
      ) r
    ), '[]'::jsonb));
end;
$$;
revoke all on function api.admin_rapidapi_calls_this_month()
  from public, anon, authenticated, service_role;
grant execute on function api.admin_rapidapi_calls_this_month() to authenticated;
comment on function api.admin_rapidapi_calls_this_month() is
  'Staff (football.read_operations), read only: RapidAPI requests counted this UTC month, in total and by job and endpoint.';
