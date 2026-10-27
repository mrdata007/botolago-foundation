-- BotolaGO Production V2
-- RapidAPI budget guard: the provider's own figure is the floor of our count.
--
-- Why. On 2026-10-26 the guard believed 9,036 calls were used in the window
-- that opened on 10 Oct, while RapidAPI itself answered quotaRemaining 0 of
-- 10,000. About 964 calls were never counted (a caller that does not count, or
-- an offset set too low), so the soft (9,600) and hard (9,950) limits never
-- fired and the provider cut the plan off.
--
-- What changes:
--   1. app_private.rapidapi_provider_quota: the latest quota the provider
--      itself reported (x-ratelimit-requests-remaining / -limit), one row per
--      quota window.
--   2. api.service_record_rapidapi_quota(p_remaining, p_limit, p_observed_at):
--      the Edge Function's write (service role). It keeps an observation only
--      if it is not older than the stored one and not from before the current
--      window start.
--   3. app_private.rapidapi_calls_this_month() returns
--      greatest(counted + offset, limit - remaining) when the current window
--      has an observation, and the old value otherwise. Every reader (the Edge
--      budget read, the rapidapi_budget health check, the staged-stats stop,
--      api.admin_rapidapi_calls_this_month) gets the floor with no change.
--
-- Apply before deploying the football-live-refresh Edge Function. Until the
-- function runs, the table is empty and the count is exactly what it was.

create table app_private.rapidapi_provider_quota (
  window_start date primary key,
  observed_at timestamptz not null,
  remaining integer not null check (remaining >= 0),
  quota_limit integer not null check (quota_limit > 0),
  constraint rapidapi_provider_quota_within_limit check (remaining <= quota_limit)
);
comment on table app_private.rapidapi_provider_quota is
  'The latest RapidAPI quota the provider itself reported, per quota window (the window_start of app_private.rapidapi_window_start()). Written only by api.service_record_rapidapi_quota; read by app_private.rapidapi_calls_this_month, which never lets the count fall below quota_limit - remaining.';
alter table app_private.rapidapi_provider_quota enable row level security;
alter table app_private.rapidapi_provider_quota force row level security;
revoke all on table app_private.rapidapi_provider_quota from public, anon, authenticated, service_role;

-- One call per run: the smallest `remaining` seen in the run, with its limit and
-- the time it was seen. Returns true when the observation was kept.
create function api.service_record_rapidapi_quota(
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
  v_window date := app_private.rapidapi_window_start();
  v_kept integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_remaining is null or p_limit is null or p_remaining < 0 or p_limit <= 0
     or p_remaining > p_limit then
    raise exception using errcode = '22023', message = 'invalid_quota_observation';
  end if;
  -- Never later than now, whatever the caller's clock says.
  v_at := least(coalesce(p_observed_at, v_now), v_now);
  -- From before the current window: it describes the old plan period.
  if v_at < v_window::timestamp at time zone 'utc' then
    return false;
  end if;
  insert into app_private.rapidapi_provider_quota as q (window_start, observed_at, remaining, quota_limit)
  values (v_window, v_at, p_remaining, p_limit)
  on conflict (window_start) do update
    set observed_at = excluded.observed_at,
        remaining = excluded.remaining,
        quota_limit = excluded.quota_limit
    where excluded.observed_at > q.observed_at
       or (excluded.observed_at = q.observed_at and excluded.remaining < q.remaining);
  get diagnostics v_kept = row_count;
  return v_kept > 0;
end;
$$;
revoke all on function api.service_record_rapidapi_quota(integer, integer, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function api.service_record_rapidapi_quota(integer, integer, timestamptz) to service_role;
comment on function api.service_record_rapidapi_quota(integer, integer, timestamptz) is
  'Service role: stores the quota the provider reported (remaining of limit) for the current RapidAPI window. Kept only if not older than the stored observation and not from before the window start; returns whether it was kept.';

create or replace function app_private.rapidapi_calls_this_month()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    counted.total,
    coalesce((
      select (q.quota_limit - q.remaining)::bigint
      from app_private.rapidapi_provider_quota q
      where q.window_start = app_private.rapidapi_window_start()
        and q.observed_at >= app_private.rapidapi_window_start()::timestamp at time zone 'utc'
    ), 0)
  )
  from (
    select coalesce(sum(c.calls), 0)::bigint
      + coalesce((select b.used_offset from app_private.rapidapi_budget_settings b where b.id), 0)
      as total
    from app_private.rapidapi_call_counts c
    where c.day >= app_private.rapidapi_window_start()
  ) counted;
$$;
revoke all on function app_private.rapidapi_calls_this_month()
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_calls_this_month() is
  'RapidAPI requests used in the current quota window: our own count (since the most recent reset day, UTC, plus the manual offset) or, when higher, what the provider itself last reported (quota_limit - remaining in app_private.rapidapi_provider_quota).';
