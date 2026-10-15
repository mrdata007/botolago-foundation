-- Audit SEC-06 (2026-10-14): the browser error intake keeps its hourly budget
-- of 300 kinds of error under concurrency, and says what it dropped.
--
-- The defect (20260924200200_ops_health_and_alerts, api.report_client_errors):
-- the hour's kinds were counted once, before the loop, and a new kind was
-- inserted whenever that stale count was under 300. Two calls that counted
-- before either inserted both passed, so concurrent callers could store more
-- than 300 kinds in an hour; and what was refused was refused silently, so
-- nobody could tell a quiet hour from a flooded one.
--
-- What changes (one function replaced, one small table added; the endpoint,
-- its arguments, its return value and who may call it stay as they are):
--   * Admitting a NEW kind of error is serialised per hour by a transaction
--     advisory lock. The count is taken again under the lock, so the 300 limit
--     is exact however many callers arrive together. Counting a kind already
--     stored takes no lock (an UPDATE of one row), and a call that finds the
--     hour already full is refused before it asks for the lock, so a flood
--     past the limit does not queue up behind it. The lock is held for the
--     length of one short statement batch and released at commit.
--   * What is refused is counted per hour in app_private.client_error_intake:
--     new kinds refused because the hour was full, and reports refused as
--     malformed. Counters only: no report, user, address or text is kept.
--     Read it in the SQL editor (docs/operations/ALERTS.md, "Browser errors").
--     A call whose list is itself invalid raises before anything is written
--     and cannot be counted.
--
-- Fabricated browser reports cannot pass for a backend outage: the
-- browser_errors check already caps at 'warn' (never 'fail'), warnings never
-- page, and scripts/ops/watchdog.ts now holds that line on its side too.
-- Nothing here changes ops_health_checks().
--
-- Writers (AGENTS.md, "One writer at a time"): no pg_cron job writes either
-- table. ops-alert-tick and the watchdog only read client_error_counts. The
-- writers are ordinary visitors calling the public endpoint, which no pause
-- stops. Apply it like any other migration, with no other database writer
-- running; no job needs pausing for it, and none is paused here.
--
-- Forward-only. Nothing applies this file in this change.

create table app_private.client_error_intake (
  bucket_hour timestamptz primary key,
  dropped_new_kinds integer not null default 0,
  dropped_malformed integer not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  constraint client_error_intake_new_check check (dropped_new_kinds between 0 and 1000000),
  constraint client_error_intake_malformed_check check (dropped_malformed between 0 and 1000000)
);
alter table app_private.client_error_intake enable row level security;
alter table app_private.client_error_intake force row level security;
revoke all on app_private.client_error_intake from public, anon, authenticated, service_role;
comment on table app_private.client_error_intake is
  'Per hour: browser error reports the intake refused (new kinds past the 300-per-hour budget; malformed reports). Counters only. Written by api.report_client_errors; read in the SQL editor.';

create or replace function api.report_client_errors(p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event jsonb;
  now_at timestamptz := statement_timestamp();
  this_hour timestamptz := date_trunc('hour', statement_timestamp());
  kinds_this_hour integer;
  accepted integer := 0;
  refused_new integer := 0;
  refused_malformed integer := 0;
  holds_lock boolean := false;
  first_of_hour boolean;
  report_kind text;
  report_area text;
  report_code text;
  report_route text;
  report_release text;
  code_pattern constant text := '^[A-Za-z][A-Za-z0-9_.:-]{0,79}$';
  hourly_kinds constant integer := 300;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'client_errors_invalid';
  end if;

  for event in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(event) <> 'object' then
      refused_malformed := refused_malformed + 1;
      continue;
    end if;
    report_kind := event ->> 'kind';
    report_area := event ->> 'area';
    report_code := event ->> 'code';
    report_release := coalesce(event ->> 'release', 'unknown');
    if report_kind is null or report_kind not in ('handled', 'unhandled')
      or report_area is null or report_area !~ code_pattern
      or report_code is null or report_code !~ code_pattern
      or report_release !~ '^([0-9a-f]{7,40}|unknown)$' then
      refused_malformed := refused_malformed + 1;
      continue;
    end if;
    report_route := app_private.client_error_route(event ->> 'route');

    update app_private.client_error_counts c
    set reports = least(c.reports + 1, 1000000), last_at = now_at
    where c.bucket_hour = this_hour and c.kind = report_kind and c.area = report_area
      and c.code = report_code and c.route = report_route and c.release = report_release;
    if found then
      accepted := accepted + 1;
      continue;
    end if;

    -- A new kind of error. A full hour is refused without waiting for the
    -- lock; otherwise the admission below is serialised for the hour.
    if not holds_lock then
      select count(*) into kinds_this_hour
      from app_private.client_error_counts where bucket_hour = this_hour;
      if kinds_this_hour >= hourly_kinds then
        refused_new := refused_new + 1;
        continue;
      end if;
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'client-errors:admit:' || pg_catalog.extract(epoch from this_hour)::bigint::text, 0));
      holds_lock := true;
      -- Whoever held the lock before may have stored this very kind.
      update app_private.client_error_counts c
      set reports = least(c.reports + 1, 1000000), last_at = now_at
      where c.bucket_hour = this_hour and c.kind = report_kind and c.area = report_area
        and c.code = report_code and c.route = report_route and c.release = report_release;
      if found then
        accepted := accepted + 1;
        continue;
      end if;
    end if;

    -- Under the lock, so the count is exact: nobody else can add a kind
    -- between this count and the insert below.
    select count(*) into kinds_this_hour
    from app_private.client_error_counts where bucket_hour = this_hour;
    if kinds_this_hour >= hourly_kinds then
      refused_new := refused_new + 1;
      continue;
    end if;

    insert into app_private.client_error_counts
      (bucket_hour, kind, area, code, route, release, sample, first_at, last_at)
    values (this_hour, report_kind, report_area, report_code, report_route, report_release,
      app_private.client_error_sample(event -> 'detail'), now_at, now_at)
    on conflict (bucket_hour, kind, area, code, route, release)
    do update set reports = least(app_private.client_error_counts.reports + 1, 1000000),
      last_at = excluded.last_at;
    accepted := accepted + 1;
    -- The hour's first report also clears what is older than 30 days.
    if kinds_this_hour = 0 then
      delete from app_private.client_error_counts where bucket_hour < this_hour - interval '30 days';
    end if;
  end loop;

  -- What was refused is counted once per call, not once per report.
  if refused_new > 0 or refused_malformed > 0 then
    insert into app_private.client_error_intake as i
      (bucket_hour, dropped_new_kinds, dropped_malformed, updated_at)
    values (this_hour, least(refused_new, 1000000), least(refused_malformed, 1000000), now_at)
    on conflict (bucket_hour)
    do update set
      dropped_new_kinds = least(i.dropped_new_kinds + excluded.dropped_new_kinds, 1000000),
      dropped_malformed = least(i.dropped_malformed + excluded.dropped_malformed, 1000000),
      updated_at = excluded.updated_at
    returning (xmax = 0) into first_of_hour;
    if first_of_hour then
      delete from app_private.client_error_intake where bucket_hour < this_hour - interval '30 days';
    end if;
  end if;

  return jsonb_build_object('accepted', accepted);
end;
$$;
revoke all on function api.report_client_errors(jsonb) from public;
grant execute on function api.report_client_errors(jsonb) to anon, authenticated;
comment on function api.report_client_errors(jsonb) is
  'Browser error reports (src/lib/client-error-sink.ts): 1-10 per call, counted per hour, kind, area, code, page (identifiers replaced by :id) and release. At most 300 new kinds per hour, exact under concurrency (an advisory lock per hour admits a new kind); what is refused is counted in app_private.client_error_intake. No user, IP or query string is stored; messages are redacted. Returns {accepted}.';
