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
--     advisory lock, and the count is taken inside it, so the 300 limit is
--     exact however many callers arrive together.
--   * The lock is taken FIRST, before any row of a call is locked, and a call
--     updates its series in a fixed order (kind, area, code, route, release).
--     Two calls therefore never wait on each other in a circle: a call that
--     holds the lock and a call that updates a series it also wants cannot
--     deadlock. (Taking the lock after the first row update does deadlock; it
--     was measured.) The lock is skipped when every kind of the call is
--     already stored, or when the hour is already full, so a flood past the
--     limit does not queue behind it. It is held for one short call and
--     released at commit. A kind already stored in the current hour is never
--     deleted before it is 30 days old, which is what makes the read-only
--     look beforehand safe.
--   * What is refused is counted: new kinds refused because the hour already
--     held 300, in app_private.client_error_intake. Counters only: no report,
--     user, address or text is kept. The counter is split into 32 shards per
--     hour (sum them when reading) and written with an asynchronous commit,
--     because anyone can call this endpoint: a flood of refused calls must not
--     queue on one row nor on a disk flush. A counter lost in a crash is
--     acceptable; a stored report is not affected by it. Reports refused as
--     malformed are NOT counted: the real browser sink never sends one (it
--     sanitises codes before sending), so they come from hand-made calls, and
--     recording them would add a write to the cheapest kind of junk. A call
--     whose list is itself invalid raises before anything is written.
--
-- Fabricated browser reports cannot pass for a backend outage: the
-- browser_errors check already caps at 'warn' (never 'fail'), and the alert
-- tick pages on 'fail' only. scripts/ops/watchdog.ts holds the same line on
-- the watchdog's side. Nothing here changes ops_health_checks().
--
-- Writers (AGENTS.md, "One writer at a time"): no pg_cron job writes either
-- table. ops-alert-tick and the watchdog only read client_error_counts. The
-- writers are ordinary visitors calling the public endpoint, which no pause
-- stops. Apply it like any other migration, with no other database writer
-- running; no job needs pausing for it, and none is paused here.
--
-- Forward-only. Nothing applies this file in this change.

create table app_private.client_error_intake (
  bucket_hour timestamptz not null,
  shard smallint not null,
  dropped_new_kinds integer not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (bucket_hour, shard),
  constraint client_error_intake_shard_check check (shard between 0 and 31),
  constraint client_error_intake_new_check check (dropped_new_kinds between 0 and 1000000)
);
alter table app_private.client_error_intake enable row level security;
alter table app_private.client_error_intake force row level security;
revoke all on app_private.client_error_intake from public, anon, authenticated, service_role;
comment on table app_private.client_error_intake is
  'Per hour, in 32 shards (sum them): new kinds of browser error the intake refused because the hour already held 300. Counters only. Written by api.report_client_errors with an asynchronous commit; read in the SQL editor.';

create or replace function api.report_client_errors(p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  batch jsonb;
  now_at timestamptz := statement_timestamp();
  this_hour timestamptz := date_trunc('hour', statement_timestamp());
  kinds_this_hour integer;
  accepted integer := 0;
  refused_new integer := 0;
  holds_lock boolean := false;
  first_row boolean;
  code_pattern constant text := '^[A-Za-z][A-Za-z0-9_.:-]{0,79}$';
  hourly_kinds constant integer := 300;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'client_errors_invalid';
  end if;

  -- The well-formed reports, in series order. Malformed ones are skipped.
  select coalesce(jsonb_agg(v.item order by v.kind, v.area, v.code, v.route, v.release), '[]'::jsonb)
  into batch
  from (
    select e ->> 'kind' as kind, e ->> 'area' as area, e ->> 'code' as code,
      app_private.client_error_route(e ->> 'route') as route,
      coalesce(e ->> 'release', 'unknown') as release,
      jsonb_build_object('kind', e ->> 'kind', 'area', e ->> 'area', 'code', e ->> 'code',
        'route', app_private.client_error_route(e ->> 'route'),
        'release', coalesce(e ->> 'release', 'unknown'), 'detail', e -> 'detail') as item
    from jsonb_array_elements(p_events) e
    where jsonb_typeof(e) = 'object'
      and (e ->> 'kind') in ('handled', 'unhandled')
      and (e ->> 'area') ~ code_pattern
      and (e ->> 'code') ~ code_pattern
      and coalesce(e ->> 'release', 'unknown') ~ '^([0-9a-f]{7,40}|unknown)$'
  ) v;

  -- Lock order: the hour's admission lock, if this call may add a kind, comes
  -- before any row of the call is locked. It is needed only when some kind of
  -- the call is not stored yet and the hour still has room.
  if exists (
    select 1 from jsonb_array_elements(batch) b
    where not exists (
      select 1 from app_private.client_error_counts c
      where c.bucket_hour = this_hour and c.kind = b ->> 'kind' and c.area = b ->> 'area'
        and c.code = b ->> 'code' and c.route = b ->> 'route' and c.release = b ->> 'release')
  ) and (select count(*) from app_private.client_error_counts
         where bucket_hour = this_hour) < hourly_kinds then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'client-errors:admit:' || extract(epoch from this_hour)::bigint::text, 0));
    holds_lock := true;
    -- Exact now: nobody else can add a kind until this call ends.
    select count(*) into kinds_this_hour
    from app_private.client_error_counts where bucket_hour = this_hour;
  end if;

  for r in
    select b.item ->> 'kind' as kind, b.item ->> 'area' as area, b.item ->> 'code' as code,
      b.item ->> 'route' as route, b.item ->> 'release' as release, b.item -> 'detail' as detail
    from jsonb_array_elements(batch) with ordinality as b(item, position)
    order by b.position
  loop
    update app_private.client_error_counts c
    set reports = least(c.reports + 1, 1000000), last_at = now_at
    where c.bucket_hour = this_hour and c.kind = r.kind and c.area = r.area
      and c.code = r.code and c.route = r.route and c.release = r.release;
    if found then
      accepted := accepted + 1;
      continue;
    end if;

    -- A new kind: only under the lock, and only while the hour has room.
    if not holds_lock or kinds_this_hour >= hourly_kinds then
      refused_new := refused_new + 1;
      continue;
    end if;
    insert into app_private.client_error_counts
      (bucket_hour, kind, area, code, route, release, sample, first_at, last_at)
    values (this_hour, r.kind, r.area, r.code, r.route, r.release,
      app_private.client_error_sample(r.detail), now_at, now_at)
    on conflict (bucket_hour, kind, area, code, route, release)
    do update set reports = least(app_private.client_error_counts.reports + 1, 1000000),
      last_at = excluded.last_at;
    accepted := accepted + 1;
    -- The hour's first report also clears what is older than 30 days.
    if kinds_this_hour = 0 then
      delete from app_private.client_error_counts where bucket_hour < this_hour - interval '30 days';
    end if;
    kinds_this_hour := kinds_this_hour + 1;
  end loop;

  -- What was refused is counted once per call, in one of 32 shards, with an
  -- asynchronous commit (see the header).
  if refused_new > 0 then
    set local synchronous_commit = off;
    insert into app_private.client_error_intake as i (bucket_hour, shard, dropped_new_kinds, updated_at)
    values (this_hour, pg_catalog.floor(pg_catalog.random() * 32)::smallint,
      least(refused_new, 1000000), now_at)
    on conflict (bucket_hour, shard)
    do update set
      dropped_new_kinds = least(i.dropped_new_kinds + excluded.dropped_new_kinds, 1000000),
      updated_at = excluded.updated_at
    returning (xmax = 0) into first_row;
    if first_row then
      delete from app_private.client_error_intake where bucket_hour < this_hour - interval '30 days';
    end if;
  end if;

  return jsonb_build_object('accepted', accepted);
end;
$$;
revoke all on function api.report_client_errors(jsonb) from public;
grant execute on function api.report_client_errors(jsonb) to anon, authenticated;
comment on function api.report_client_errors(jsonb) is
  'Browser error reports (src/lib/client-error-sink.ts): 1-10 per call, counted per hour, kind, area, code, page (identifiers replaced by :id) and release. At most 300 new kinds per hour, exact under concurrency (an advisory lock per hour admits a new kind, taken before any row is locked); refused new kinds are counted in app_private.client_error_intake. No user, IP or query string is stored; messages are redacted. Returns {accepted}.';
