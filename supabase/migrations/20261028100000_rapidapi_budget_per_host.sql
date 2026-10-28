-- BotolaGO Production V2
-- RapidAPI budget per provider host.
--
-- Why. From 2026-10-28 the live football data can come from a second RapidAPI
-- provider, SportAPI (host sportapi7.p.rapidapi.com, 15,000 calls from 27 Oct to
-- 27 Nov), chosen by the Edge Function secret RAPIDAPI_HOST. The budget guard
-- (20261026143000) and the provider quota floor (20261027100000) count ONE pool:
-- the Sofascore plan, 10,000 calls from the 10th, already at its limit. Switching
-- the host without separating the counts would make the guard see ~10,000 calls
-- on a plan that has used none, and block SportAPI at once.
--
-- What changes (nothing is dropped; every old function keeps its signature and,
-- for the Sofascore host, its answer):
--   1. app_private.rapidapi_call_counts and app_private.rapidapi_provider_quota
--      get a `host` column (existing rows are the Sofascore host) and the host
--      joins their primary keys.
--   2. app_private.rapidapi_host_budgets: the limits of every host other than
--      Sofascore (whose row stays app_private.rapidapi_budget_settings, as it is):
--      quota, soft and hard limit, the reset day, the offset. SportAPI is seeded:
--      15,000 / soft 13,500 / hard 14,700, window starting on the 27th.
--      app_private.rapidapi_host_budget_configure changes it.
--   3. app_private.rapidapi_host_settings(host), rapidapi_window_start_for(host),
--      rapidapi_calls_for_host(host): the window, the count (counted calls since
--      the window start + the offset, never below the provider's own figure) and
--      the limits of one host. An unknown host has no settings.
--   4. app_private.rapidapi_active_host(): the host of the most recent call
--      recorded (the Sofascore host when there is none). The readers that have no
--      host argument follow it: app_private.rapidapi_calls_this_month() (so the
--      rapidapi_budget health check and the staged-statistics stop),
--      app_private.rapidapi_live_interval_seconds() (so the cron cadence),
--      api.admin_rapidapi_calls_this_month() and the health check's thresholds
--      (80% and 95% of the host's quota: 8,000 / 9,500 of 10,000 as before).
--   5. api.service_rapidapi_host_budget(host), api.service_record_rapidapi_host_calls
--      and api.service_record_rapidapi_host_quota: what the Edge Function calls
--      for a host other than Sofascore. For the Sofascore host it keeps calling
--      api.service_rapidapi_budget(), service_record_rapidapi_calls and
--      service_record_rapidapi_quota, which now answer for that host only.
--      An unknown host reads as a budget of zero: nothing is sent.
--
--   6. incidents_interval_minutes (default 15, 1-120) on both settings tables:
--      how often a match in play gets one incidents read in addition to the
--      score-change and period reads, so a card or substitution between goals shows
--      within about that time (the Edge Function stops those reads above the soft
--      limit). Read through the two budget functions as `incidentsIntervalMinutes`;
--      changed with app_private.rapidapi_incidents_interval_configure.
--   7. api.service_football_details_schedule() also lists `statsPartial`: finished
--      fixtures 90 minutes to 3 hours after the whistle whose stored team statistics
--      are missing or partial (fewer than 14 figures; a full reply stores 18) and
--      for which nothing was stored since the 90 minute mark. The Edge Function
--      reads their statistics once.
--
-- Apply before setting RAPIDAPI_HOST to the SportAPI host. Until the function
-- runs with that host nothing changes: every row is the Sofascore host.

do $guard$
begin
  if to_regprocedure('app_private.rapidapi_calls_this_month()') is null
    or to_regprocedure('app_private.rapidapi_window_start(timestamptz)') is null
    or to_regprocedure('app_private.rapidapi_live_interval_seconds()') is null
    or to_regprocedure('app_private.rapidapi_budget_health()') is null
    or to_regprocedure('api.admin_rapidapi_calls_this_month()') is null
    or to_regprocedure('api.service_rapidapi_budget()') is null
    or to_regprocedure('api.service_record_rapidapi_calls(text, jsonb)') is null
    or to_regprocedure('api.service_record_rapidapi_quota(integer, integer, timestamptz)') is null
    or to_regprocedure('api.service_football_details_schedule()') is null
    or not exists (select 1 from app_private.rapidapi_budget_settings where id) then
    raise exception 'rapidapi_host_budget_unexpected_baseline';
  end if;
end
$guard$;

-- 1. A host on the counters ------------------------------------------------------

alter table app_private.rapidapi_call_counts
  add column host text not null default 'sofascore.p.rapidapi.com';
alter table app_private.rapidapi_call_counts
  add constraint rapidapi_call_counts_host_check check (host ~ '^[a-z0-9][a-z0-9.-]{0,79}$');
alter table app_private.rapidapi_call_counts drop constraint rapidapi_call_counts_pkey;
alter table app_private.rapidapi_call_counts
  add constraint rapidapi_call_counts_pkey primary key (day, host, job, endpoint, status_code);
comment on column app_private.rapidapi_call_counts.host is
  'The RapidAPI host the requests were sent to. Rows written before 20261028100000 are the Sofascore host.';

alter table app_private.rapidapi_provider_quota
  add column host text not null default 'sofascore.p.rapidapi.com';
alter table app_private.rapidapi_provider_quota
  add constraint rapidapi_provider_quota_host_check check (host ~ '^[a-z0-9][a-z0-9.-]{0,79}$');
alter table app_private.rapidapi_provider_quota drop constraint rapidapi_provider_quota_pkey;
alter table app_private.rapidapi_provider_quota
  add constraint rapidapi_provider_quota_pkey primary key (host, window_start);
comment on column app_private.rapidapi_provider_quota.host is
  'The RapidAPI host the provider reported this quota for. One row per host and quota window.';

alter table app_private.rapidapi_budget_settings
  add column incidents_interval_minutes integer not null default 15
  check (incidents_interval_minutes between 1 and 120);
comment on column app_private.rapidapi_budget_settings.incidents_interval_minutes is
  'Minutes between the periodic incidents reads of a match in play (cards and substitutions between goals); the Edge Function skips them above the soft limit.';

-- 2. The limits of the other hosts ------------------------------------------------

create table app_private.rapidapi_host_budgets (
  host text primary key check (host ~ '^[a-z0-9][a-z0-9.-]{0,79}$' and host <> 'sofascore.p.rapidapi.com'),
  -- What the plan allows in one window; the provider's x-ratelimit-requests-limit.
  quota_limit integer not null check (quota_limit between 1 and 10000000),
  soft_limit integer not null check (soft_limit between 0 and 10000000),
  hard_limit integer not null check (hard_limit between 0 and 10000000),
  -- 1-31; a month with fewer days resets on its last day.
  reset_day_of_month integer not null check (reset_day_of_month between 1 and 31),
  -- Calls the provider counted that app_private.rapidapi_call_counts did not.
  used_offset integer not null default 0 check (used_offset >= 0),
  -- Minutes between the periodic incidents reads of a match in play.
  incidents_interval_minutes integer not null default 15
    check (incidents_interval_minutes between 1 and 120),
  updated_at timestamptz not null default statement_timestamp(),
  constraint rapidapi_host_budgets_order check (soft_limit <= hard_limit and hard_limit <= quota_limit)
);
comment on table app_private.rapidapi_host_budgets is
  'The RapidAPI budget guard of every host other than sofascore.p.rapidapi.com (whose settings stay in app_private.rapidapi_budget_settings): quota, soft limit (above it only the live feed and incidents are sent), hard limit (nothing is sent), the day of the month the plan resets (UTC) and a manual offset. Written only by app_private.rapidapi_host_budget_configure.';
alter table app_private.rapidapi_host_budgets enable row level security;
alter table app_private.rapidapi_host_budgets force row level security;
revoke all on app_private.rapidapi_host_budgets from public, anon, authenticated, service_role;

-- SportAPI: 15,000 calls from 27 Oct to 27 Nov.
insert into app_private.rapidapi_host_budgets
  (host, quota_limit, soft_limit, hard_limit, reset_day_of_month, used_offset)
values ('sportapi7.p.rapidapi.com', 15000, 13500, 14700, 27, 0);

-- Owner-run: null leaves a value as it is.
--   select app_private.rapidapi_host_budget_configure('sportapi7.p.rapidapi.com', p_used_offset => 25);
create function app_private.rapidapi_host_budget_configure(
  p_host text,
  p_quota_limit integer default null,
  p_soft_limit integer default null,
  p_hard_limit integer default null,
  p_reset_day integer default null,
  p_used_offset integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h app_private.rapidapi_host_budgets%rowtype;
begin
  if p_host = 'sofascore.p.rapidapi.com' then
    raise exception using errcode = '22023',
      message = 'use app_private.rapidapi_budget_configure for the Sofascore host';
  end if;
  update app_private.rapidapi_host_budgets
  set quota_limit = coalesce(p_quota_limit, quota_limit),
      soft_limit = coalesce(p_soft_limit, soft_limit),
      hard_limit = coalesce(p_hard_limit, hard_limit),
      reset_day_of_month = coalesce(p_reset_day, reset_day_of_month),
      used_offset = coalesce(p_used_offset, used_offset),
      updated_at = statement_timestamp()
  where host = p_host
  returning * into h;
  if not found then
    raise exception using errcode = '22023', message = 'unknown_rapidapi_host';
  end if;
  return jsonb_build_object('host', h.host, 'quotaLimit', h.quota_limit, 'softLimit', h.soft_limit,
    'hardLimit', h.hard_limit, 'resetDayOfMonth', h.reset_day_of_month, 'usedOffset', h.used_offset,
    'windowStart', app_private.rapidapi_window_start_for(h.host),
    'used', app_private.rapidapi_calls_for_host(h.host));
end;
$$;
revoke all on function app_private.rapidapi_host_budget_configure(text, integer, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;

-- Owner-run, any host: how often a match in play gets a periodic incidents read.
--   select app_private.rapidapi_incidents_interval_configure('sportapi7.p.rapidapi.com', 10);
create function app_private.rapidapi_incidents_interval_configure(p_host text, p_minutes integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_host = 'sofascore.p.rapidapi.com' then
    update app_private.rapidapi_budget_settings
    set incidents_interval_minutes = p_minutes, updated_at = statement_timestamp() where id;
  else
    update app_private.rapidapi_host_budgets
    set incidents_interval_minutes = p_minutes, updated_at = statement_timestamp()
    where host = p_host;
    if not found then
      raise exception using errcode = '22023', message = 'unknown_rapidapi_host';
    end if;
  end if;
  return p_minutes;
end;
$$;
revoke all on function app_private.rapidapi_incidents_interval_configure(text, integer)
  from public, anon, authenticated, service_role;

-- 3. The limits, the window and the count of one host ------------------------------

-- The Sofascore host reads app_private.rapidapi_budget_settings (a plan of 10,000);
-- any other host reads app_private.rapidapi_host_budgets. No row for an unknown host.
create function app_private.rapidapi_host_settings(p_host text)
returns table (
  quota_limit integer,
  soft_limit integer,
  hard_limit integer,
  reset_day integer,
  used_offset integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select 10000, b.soft_limit, b.hard_limit, b.reset_day_of_month, b.used_offset
  from app_private.rapidapi_budget_settings b
  where b.id and p_host = 'sofascore.p.rapidapi.com'
  union all
  select h.quota_limit, h.soft_limit, h.hard_limit, h.reset_day_of_month, h.used_offset
  from app_private.rapidapi_host_budgets h
  where h.host = p_host and p_host <> 'sofascore.p.rapidapi.com';
$$;
revoke all on function app_private.rapidapi_host_settings(text)
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_host_settings(text) is
  'Quota, soft and hard limit, reset day and manual offset of one RapidAPI host; no row for an unknown host.';

-- The most recent reset day on or before p_at (UTC) for that host's plan.
create function app_private.rapidapi_window_start_for(
  p_host text,
  p_at timestamptz default statement_timestamp()
)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reset integer;
  v_day date := (p_at at time zone 'utc')::date;
  v_month date := date_trunc('month', v_day::timestamp)::date;
  v_start date;
  v_previous date;
begin
  select s.reset_day into v_reset from app_private.rapidapi_host_settings(p_host) s;
  v_reset := coalesce(v_reset, 1);
  v_start := v_month + (least(v_reset,
    extract(day from (v_month + interval '1 month' - interval '1 day'))::integer) - 1);
  if v_day >= v_start then
    return v_start;
  end if;
  v_previous := (v_month - interval '1 month')::date;
  return v_previous + (least(v_reset,
    extract(day from (v_previous + interval '1 month' - interval '1 day'))::integer) - 1);
end;
$$;
revoke all on function app_private.rapidapi_window_start_for(text, timestamptz)
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_window_start_for(text, timestamptz) is
  'First day (UTC) of the quota window of one RapidAPI host containing p_at: that host''s most recent reset day, clamped to the last day of a short month.';

-- Calls in the host's current window: the counted calls since the window start
-- plus the manual offset, or, when higher, what the provider itself last reported
-- for that host and window (quota_limit - remaining).
create function app_private.rapidapi_calls_for_host(p_host text)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start date := app_private.rapidapi_window_start_for(p_host);
  v_counted bigint;
  v_offset integer;
  v_floor bigint;
begin
  select s.used_offset into v_offset from app_private.rapidapi_host_settings(p_host) s;
  select coalesce(sum(c.calls), 0)::bigint into v_counted
  from app_private.rapidapi_call_counts c
  where c.host = p_host and c.day >= v_start;
  select (q.quota_limit - q.remaining)::bigint into v_floor
  from app_private.rapidapi_provider_quota q
  where q.host = p_host
    and q.window_start = v_start
    and q.observed_at >= v_start::timestamp at time zone 'utc';
  return greatest(v_counted + coalesce(v_offset, 0), coalesce(v_floor, 0));
end;
$$;
revoke all on function app_private.rapidapi_calls_for_host(text)
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_calls_for_host(text) is
  'RapidAPI requests used in one host''s current quota window: our own count (since that host''s most recent reset day, UTC, plus the manual offset) or, when higher, what the provider itself last reported (quota_limit - remaining in app_private.rapidapi_provider_quota).';

-- 4. The active host and the readers that follow it ----------------------------------

-- The host of the most recent request recorded today or yesterday (UTC); the
-- Sofascore host when none was.
create function app_private.rapidapi_active_host()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.host
    from app_private.rapidapi_call_counts c
    where c.day >= (statement_timestamp() at time zone 'utc')::date - 1
    order by c.updated_at desc, c.host
    limit 1
  ), 'sofascore.p.rapidapi.com');
$$;
revoke all on function app_private.rapidapi_active_host()
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_active_host() is
  'The RapidAPI host the Edge Functions are using: the host of the most recent request recorded today or yesterday (UTC), else sofascore.p.rapidapi.com.';

create or replace function app_private.rapidapi_calls_this_month()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.rapidapi_calls_for_host(app_private.rapidapi_active_host());
$$;
revoke all on function app_private.rapidapi_calls_this_month()
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_calls_this_month() is
  'RapidAPI requests used in the current quota window of the active host (app_private.rapidapi_active_host): that host''s counted calls plus its offset, never below the provider''s own figure. Read by the rapidapi_budget health check and the staged-statistics stop.';

create or replace function app_private.rapidapi_live_interval_seconds()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when app_private.rapidapi_calls_this_month() >= coalesce((
      select s.soft_limit from app_private.rapidapi_host_settings(app_private.rapidapi_active_host()) s
    ), b.soft_limit)
      then greatest(b.live_interval_seconds, 180) else b.live_interval_seconds end
  from app_private.rapidapi_budget_settings b where b.id;
$$;
revoke all on function app_private.rapidapi_live_interval_seconds()
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_live_interval_seconds() is
  'Seconds between live football polls while a match is in play: live_interval_seconds, and at least 180 once the active host''s counted RapidAPI calls reached its soft limit.';

create or replace function app_private.rapidapi_budget_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host text := app_private.rapidapi_active_host();
  v_limit integer;
  v_calls bigint;
  v_status text;
begin
  select s.quota_limit into v_limit from app_private.rapidapi_host_settings(v_host) s;
  v_limit := coalesce(v_limit, 10000);
  v_calls := app_private.rapidapi_calls_for_host(v_host);
  v_status := case when v_calls >= v_limit * 95 / 100 then 'fail'
                   when v_calls >= v_limit * 80 / 100 then 'warn' else 'ok' end;
  return jsonb_build_object(
    'name', 'rapidapi_budget',
    'status', v_status,
    'detail', v_calls || ' of ' || v_limit || ' RapidAPI calls used this month (warns at '
      || (v_limit * 80 / 100) || ', fails at ' || (v_limit * 95 / 100) || ')'
      || case when v_host <> 'sofascore.p.rapidapi.com' then ' on ' || v_host else '' end);
end;
$$;
revoke all on function app_private.rapidapi_budget_health()
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_budget_health() is
  'The rapidapi_budget health check for the active host: warn at 80% of its quota in the current window (8000 of 10000 for Sofascore), fail at 95% (9500). Counts only. No grant.';

create or replace function api.admin_rapidapi_calls_this_month()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host text := app_private.rapidapi_active_host();
  v_start date := app_private.rapidapi_window_start_for(v_host);
  b app_private.rapidapi_budget_settings%rowtype;
  h record;
  v_limit integer;
begin
  perform app_private.admin_assert_permission('football.read_operations');
  select * into b from app_private.rapidapi_budget_settings where id;
  select * into h from app_private.rapidapi_host_settings(v_host);
  v_limit := coalesce(h.quota_limit, 10000);
  return jsonb_build_object(
    'host', v_host,
    'month', to_char(v_start, 'YYYY-MM'),
    'windowStart', v_start,
    'windowEnd', app_private.rapidapi_window_start_for(v_host, ((v_start + 31)::timestamp at time zone 'utc')),
    'monthlyLimit', v_limit,
    'warnAt', v_limit * 80 / 100,
    'failAt', v_limit * 95 / 100,
    'softLimit', coalesce(h.soft_limit, b.soft_limit),
    'hardLimit', coalesce(h.hard_limit, b.hard_limit),
    'usedOffset', coalesce(h.used_offset, b.used_offset),
    'liveIntervalSeconds', b.live_interval_seconds,
    'effectiveLiveIntervalSeconds', app_private.rapidapi_live_interval_seconds(),
    'seasonQuietHours', b.season_quiet_hours,
    'seasonMatchHours', b.season_match_hours,
    'total', app_private.rapidapi_calls_for_host(v_host),
    'hosts', (
      select jsonb_agg(jsonb_build_object('host', x.host, 'used', app_private.rapidapi_calls_for_host(x.host),
        'quotaLimit', x.quota_limit) order by x.host)
      from (
        select 'sofascore.p.rapidapi.com'::text as host, 10000 as quota_limit
        union all
        select t.host, t.quota_limit from app_private.rapidapi_host_budgets t
      ) x
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('job', r.job, 'endpoint', r.endpoint, 'calls', r.calls)
        order by r.job, r.endpoint)
      from (
        select c.job, c.endpoint, sum(c.calls)::bigint as calls
        from app_private.rapidapi_call_counts c
        where c.day >= v_start and c.host = v_host
        group by c.job, c.endpoint
      ) r
    ), '[]'::jsonb));
end;
$$;
revoke all on function api.admin_rapidapi_calls_this_month()
  from public, anon, authenticated, service_role;
grant execute on function api.admin_rapidapi_calls_this_month() to authenticated;
comment on function api.admin_rapidapi_calls_this_month() is
  'Staff (football.read_operations), read only: RapidAPI requests counted in the current quota window of the active host, in total and by job and endpoint, with the budget guard''s limits and the use of every host.';

-- 5. What the Edge Function reads and writes -------------------------------------------

-- The Sofascore host's answer is what it was; the live interval follows the active host.
create or replace function api.service_rapidapi_budget()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s app_private.rapidapi_budget_settings%rowtype;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  select * into s from app_private.rapidapi_budget_settings where id;
  return jsonb_build_object('used', app_private.rapidapi_calls_for_host('sofascore.p.rapidapi.com'),
    'softLimit', s.soft_limit, 'hardLimit', s.hard_limit,
    'liveIntervalSeconds', app_private.rapidapi_live_interval_seconds(),
    'windowStart', app_private.rapidapi_window_start(),
    'incidentsIntervalMinutes', s.incidents_interval_minutes);
end;
$$;
revoke all on function api.service_rapidapi_budget() from public, anon, authenticated;
grant execute on function api.service_rapidapi_budget() to service_role;
comment on function api.service_rapidapi_budget() is
  'Service role: calls counted in the Sofascore host''s current RapidAPI quota window (plus the manual offset), the soft and the hard limit, the effective live poll interval and the window start. For any other host see api.service_rapidapi_host_budget.';

-- The budget of one host. An unknown host reads as zero limits: nothing is sent.
create function api.service_rapidapi_host_budget(p_host text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host text := lower(btrim(coalesce(p_host, '')));
  s record;
  b app_private.rapidapi_budget_settings%rowtype;
  v_used bigint;
  v_incidents integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  select * into b from app_private.rapidapi_budget_settings where id;
  select * into s from app_private.rapidapi_host_settings(v_host);
  if s.soft_limit is null then
    return jsonb_build_object('used', 0, 'softLimit', 0, 'hardLimit', 0,
      'liveIntervalSeconds', greatest(b.live_interval_seconds, 180),
      'windowStart', app_private.rapidapi_window_start_for(v_host), 'host', v_host,
      'incidentsIntervalMinutes', 15);
  end if;
  v_used := app_private.rapidapi_calls_for_host(v_host);
  select case when v_host = 'sofascore.p.rapidapi.com' then b.incidents_interval_minutes
    else (select t.incidents_interval_minutes from app_private.rapidapi_host_budgets t where t.host = v_host) end
    into v_incidents;
  return jsonb_build_object('used', v_used, 'softLimit', s.soft_limit, 'hardLimit', s.hard_limit,
    'liveIntervalSeconds', case when v_used >= s.soft_limit
      then greatest(b.live_interval_seconds, 180) else b.live_interval_seconds end,
    'windowStart', app_private.rapidapi_window_start_for(v_host), 'host', v_host,
    'incidentsIntervalMinutes', coalesce(v_incidents, 15));
end;
$$;
revoke all on function api.service_rapidapi_host_budget(text) from public, anon, authenticated;
grant execute on function api.service_rapidapi_host_budget(text) to service_role;
comment on function api.service_rapidapi_host_budget(text) is
  'Service role: calls counted in one RapidAPI host''s current quota window (plus its offset, never below the provider''s own figure), its soft and hard limit, the effective live poll interval and the window start. An unknown host has zero limits.';

-- One call per refresh, as api.service_record_rapidapi_calls, for one host.
create function api.service_record_rapidapi_host_calls(p_host text, p_job text, p_calls jsonb)
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
  if p_host is null
    or not exists (select 1 from app_private.rapidapi_host_settings(p_host)) then
    raise exception using errcode = '22023', message = 'unknown_rapidapi_host';
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
    insert into app_private.rapidapi_call_counts as c (day, host, job, endpoint, status_code, calls)
    values (v_day, p_host, p_job, v_item ->> 'endpoint', (v_item ->> 'status')::smallint,
      (v_item ->> 'calls')::integer)
    on conflict (day, host, job, endpoint, status_code) do update
      set calls = c.calls + excluded.calls, updated_at = statement_timestamp();
    v_total := v_total + (v_item ->> 'calls')::integer;
  end loop;
  return v_total;
end;
$$;
revoke all on function api.service_record_rapidapi_host_calls(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function api.service_record_rapidapi_host_calls(text, text, jsonb) to service_role;
comment on function api.service_record_rapidapi_host_calls(text, text, jsonb) is
  'Service role: adds RapidAPI request counts (endpoint path without query, HTTP status, calls) for one job and one known host to today''s (UTC) counters. Returns the number of calls added.';

-- The Sofascore host's write is the same function with that host.
create or replace function api.service_record_rapidapi_calls(p_job text, p_calls jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return api.service_record_rapidapi_host_calls('sofascore.p.rapidapi.com', p_job, p_calls);
end;
$$;
revoke all on function api.service_record_rapidapi_calls(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function api.service_record_rapidapi_calls(text, jsonb) to service_role;
comment on function api.service_record_rapidapi_calls(text, jsonb) is
  'Service role: adds RapidAPI request counts (endpoint path without query, HTTP status, calls) for one job on the Sofascore host to today''s (UTC) counters. Returns the number of calls added.';

-- The provider's own quota figure for one host.
create function api.service_record_rapidapi_host_quota(
  p_host text,
  p_remaining integer,
  p_limit integer,
  p_observed_at timestamptz default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_at timestamptz;
  v_window date;
  v_kept integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_remaining is null or p_limit is null or p_remaining < 0 or p_limit <= 0
     or p_remaining > p_limit then
    raise exception using errcode = '22023', message = 'invalid_quota_observation';
  end if;
  if p_host is null
    or not exists (select 1 from app_private.rapidapi_host_settings(p_host)) then
    raise exception using errcode = '22023', message = 'unknown_rapidapi_host';
  end if;
  v_window := app_private.rapidapi_window_start_for(p_host);
  -- Never later than now, whatever the caller's clock says.
  v_at := least(coalesce(p_observed_at, v_now), v_now);
  -- From before the current window: it describes the old plan period.
  if v_at < v_window::timestamp at time zone 'utc' then
    return false;
  end if;
  insert into app_private.rapidapi_provider_quota as q (host, window_start, observed_at, remaining, quota_limit)
  values (p_host, v_window, v_at, p_remaining, p_limit)
  on conflict (host, window_start) do update
    set observed_at = excluded.observed_at,
        remaining = excluded.remaining,
        quota_limit = excluded.quota_limit
    where excluded.observed_at > q.observed_at
       or (excluded.observed_at = q.observed_at and excluded.remaining < q.remaining);
  get diagnostics v_kept = row_count;
  return v_kept > 0;
end;
$$;
revoke all on function api.service_record_rapidapi_host_quota(text, integer, integer, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function api.service_record_rapidapi_host_quota(text, integer, integer, timestamptz) to service_role;
comment on function api.service_record_rapidapi_host_quota(text, integer, integer, timestamptz) is
  'Service role: stores the quota one known host''s provider reported (remaining of limit) for that host''s current window. Kept only if not older than the stored observation and not from before the window start; returns whether it was kept.';

create or replace function api.service_record_rapidapi_quota(
  p_remaining integer,
  p_limit integer,
  p_observed_at timestamptz default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return api.service_record_rapidapi_host_quota('sofascore.p.rapidapi.com', p_remaining, p_limit, p_observed_at);
end;
$$;
revoke all on function api.service_record_rapidapi_quota(integer, integer, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function api.service_record_rapidapi_quota(integer, integer, timestamptz) to service_role;
comment on function api.service_record_rapidapi_quota(integer, integer, timestamptz) is
  'Service role: stores the quota the Sofascore host''s provider reported (remaining of limit) for its current window. Kept only if not older than the stored observation and not from before the window start; returns whether it was kept.';

-- The post-match schedule, with the late-statistics list (item 7 of the header).
create or replace function api.service_football_details_schedule()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return jsonb_build_object(
    'followUps', (
      select coalesce(jsonb_agg(x.external_id order by x.external_id), '[]'::jsonb)
      from (
        select m.external_id,
          (select max(mark.step) from (values (interval '30 minutes'), (interval '90 minutes')) as mark(step)
            where f.finalized_at + mark.step <= v_now) as due_mark,
          sync.last_stored_at, f.finalized_at
        from app.fixtures f
        join app_private.football_provider_mappings m on m.provider_name = 'sofascore'
          and m.entity_type = 'fixture' and m.active and m.internal_entity_id = f.id
        left join app_private.football_match_details_syncs sync on sync.fixture_id = f.id
        where f.status = 'finished' and f.finalized_at is not null
          and f.finalized_at > v_now - interval '3 hours'
      ) x
      where x.due_mark is not null
        and (x.last_stored_at is null or x.last_stored_at < x.finalized_at + x.due_mark)
    ),
    'statsPartial', (
      select coalesce(jsonb_agg(m.external_id order by m.external_id), '[]'::jsonb)
      from app.fixtures f
      join app_private.football_provider_mappings m on m.provider_name = 'sofascore'
        and m.entity_type = 'fixture' and m.active and m.internal_entity_id = f.id
      left join app_private.football_match_details_syncs sync on sync.fixture_id = f.id
      where f.status = 'finished' and f.finalized_at is not null
        and f.finalized_at <= v_now - interval '90 minutes'
        and f.finalized_at > v_now - interval '3 hours'
        and (sync.last_stored_at is null or sync.last_stored_at < f.finalized_at + interval '90 minutes')
        and (select count(*) from app.fixture_team_statistics st where st.fixture_id = f.id) < 14
    ),
    'lastStored', (
      select coalesce(jsonb_object_agg(m.external_id, sync.last_stored_at), '{}'::jsonb)
      from app.fixtures f
      join app_private.football_provider_mappings m on m.provider_name = 'sofascore'
        and m.entity_type = 'fixture' and m.active and m.internal_entity_id = f.id
      join app_private.football_match_details_syncs sync on sync.fixture_id = f.id
      where f.status in ('live_first_half', 'half_time', 'live_second_half', 'extra_time', 'penalties')
         or (f.status = 'finished' and f.finalized_at > v_now - interval '3 hours')
    ));
end;
$$;
revoke all on function api.service_football_details_schedule() from public, anon, authenticated;
grant execute on function api.service_football_details_schedule() to service_role;
comment on function api.service_football_details_schedule() is
  'Service role: SofaScore event ids of finished fixtures due their +30 min / +90 min details retry, those 90 minutes to 3 hours after the whistle whose stored team statistics are missing or partial (statsPartial), and when details were last stored for fixtures in play or finished within 3 hours. Read by the live refresh.';

notify pgrst, 'reload schema';
