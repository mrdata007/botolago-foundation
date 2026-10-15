-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261015120200_client_error_intake_budget
-- (audit finding SEC-06, 2026-10-14; docs/operations/ALERTS.md, "Browser errors"):
--   the browser error intake keeps its budget of 300 NEW kinds of error per
--   hour exactly, however many callers arrive together, and says what it
--   refused.
--   Before, api.report_client_errors counted the hour's kinds once and then
--   inserted a new kind whenever that stale count was under 300, so callers
--   that counted before either inserted could together store more than 300
--   (measured locally: 670 under 40 clients), and what was refused was refused
--   silently. After: admitting a new kind is serialised per hour by a
--   transaction advisory lock taken before any row is locked, the count is
--   taken inside it, and refused new kinds are counted per hour in a new
--   table (counters only: no report, user, address or text).
--   It does exactly two things: REPLACES one function, api.report_client_errors
--   (same name, arguments, return value, and same privileges: anon and
--   authenticated may call it, PUBLIC may not), and CREATES one table,
--   app_private.client_error_intake (row level security on and forced, no
--   privileges for anyone but the owner; empty). It changes no existing row,
--   not app_private.client_error_counts, and not app_private.ops_health_checks():
--   the `browser_errors` check still warns at most and never fails, so browser
--   reports cannot page as a backend outage.
--
-- WHEN
--   After 20260924200200 (ops health and alerts: the table and helpers it
--   builds on, recorded on production long ago). It does not depend on the
--   sofascore rating release, nor on the other two Phase A/B scripts
--   (apply-20261014180100-fantasy-worker-health-backlog.sql,
--   apply-20261015120300-fantasy-points-player-identity.sql); apply the three
--   in the order of their timestamps and the release first. Any time of day;
--   it needs well under a second.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing, and nothing could stop the real writers anyway.
--   No pg_cron job and no Edge Function writes app_private.client_error_counts
--   or the new table. client_error_counts is only READ, through
--   app_private.ops_health_checks() (the `browser_errors` check, redefined by
--   the news sitemap, ops health coverage and season refresh migrations, which
--   carry it forward):
--   ops-alert-tick calls it, and the watchdog reads it through
--   api.service_ops_health(). The only writer is the public endpoint, called by
--   ordinary visitors' browsers, which no pause stops: replacing the function
--   is safe under that traffic (a call already running finishes on the old
--   text, the next one runs the new). The script proves the claim before it
--   writes: it stops if any other function or cron job in this database
--   inserts into, updates or deletes from either table. Still make sure that
--   no other schema change (another apply script, a migration, a deploy) is
--   running right now: a rehearsal that ends in rollback takes locks too.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address
--      contains tkewgajrljbwgwedqsxn; the database holds no project name this
--      script could check, so look at the address) -> SQL Editor -> New query.
--      Optional read-only pre-checks: docs/production/PHASE_A_B_MIGRATIONS_OWNER_RUNBOOK.md.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice (history row, or the table already there), before
--     20260924200200 is recorded, on a database missing a column, helper
--     function or role the new function uses, where api.report_client_errors is
--     not the version this update replaces (md5 of its source, attributes,
--     privileges: anon and authenticated may call it, PUBLIC may not), and
--     where any other function or cron job writes either table;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1] (the form the migration promoter and the other
--     apply scripts use), and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without writing anything: the new source is the one in
--     the file; who may call the function is exactly as before; the new table
--     exists, empty, with row level security on and forced and no privilege for
--     PUBLIC, anon, authenticated or service_role; ops_health_checks() and
--     service_ops_health() are byte for byte what they were; the cron job list
--     is where it was; the history row is there. It does NOT call the endpoint
--     (that would write a report): the behaviour under concurrency is covered
--     by the CI database test supabase/tests/database/client_error_intake_budget.test.sql.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  absent text;
  writers text;
  fn record;
  anon_ok boolean;
  auth_ok boolean;
  public_ok boolean;
  -- md5 of the source of the OLD api.report_client_errors (20260924200200, the
  -- text between its $$ marks). The tests recompute it from the repository file.
  old_report_md5 constant text := 'bb281eafb252da7770f92b7f72d83c97';
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261015120200') then
    raise exception 'stop: migration 20261015120200 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260924200200') then
    raise exception 'stop: migration 20260924200200 (ops health and alerts) is not applied yet';
  end if;
  if to_regclass('app_private.client_error_intake') is not null then
    raise exception 'stop: app_private.client_error_intake already exists';
  end if;
  select string_agg(r.rolname, ', ') into absent
  from (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
  where not exists (select 1 from pg_catalog.pg_roles x where x.rolname = r.rolname);
  if absent is not null then
    raise exception 'stop: the database is missing roles: %', absent;
  end if;

  -- The table the function counts into, with the columns and types it uses.
  select string_agg(v.col, ', ' order by v.col) into absent
  from (values
    ('bucket_hour', 'timestamp with time zone'), ('kind', 'text'), ('area', 'text'), ('code', 'text'),
    ('route', 'text'), ('release', 'text'), ('sample', 'jsonb'), ('reports', 'integer'),
    ('first_at', 'timestamp with time zone'), ('last_at', 'timestamp with time zone')
  ) v(col, typ)
  where not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('app_private.client_error_counts') and a.attname = v.col
      and a.attnum > 0 and not a.attisdropped and format_type(a.atttypid, a.atttypmod) = v.typ);
  if to_regclass('app_private.client_error_counts') is null then
    raise exception 'stop: app_private.client_error_counts does not exist';
  end if;
  if absent is not null then
    raise exception 'stop: app_private.client_error_counts is missing columns (or has other types): %', absent;
  end if;

  select string_agg(v.sig, ', ' order by v.sig) into absent
  from (values
    ('api.report_client_errors(jsonb)'), ('app_private.client_error_route(text)'),
    ('app_private.client_error_sample(jsonb)'), ('app_private.ops_health_checks()'),
    ('api.service_ops_health()')
  ) v(sig)
  where to_regprocedure(v.sig) is null;
  if absent is not null then
    raise exception 'stop: the database is missing functions this update needs: %', absent;
  end if;

  -- The endpoint must be exactly what 20260924200200 installed, callable by
  -- anon and authenticated, not by PUBLIC.
  select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.prorettype::regtype::text as rettype,
         l.lanname, p.proacl, p.proowner
    into fn
  from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
  where p.oid = 'api.report_client_errors(jsonb)'::regprocedure;
  if md5(fn.prosrc) <> old_report_md5 then
    raise exception 'stop: api.report_client_errors(jsonb) is not the version this update replaces (20260924200200)';
  end if;
  if not fn.prosecdef or fn.provolatile <> 'v' or fn.rettype <> 'jsonb' or fn.lanname <> 'plpgsql'
    or fn.proconfig is distinct from array['search_path=""'] then
    raise exception 'stop: api.report_client_errors(jsonb) has attributes other than the reviewed ones (security definer, volatile, plpgsql, jsonb, empty search_path)';
  end if;
  anon_ok := has_function_privilege('anon', 'api.report_client_errors(jsonb)', 'execute');
  auth_ok := has_function_privilege('authenticated', 'api.report_client_errors(jsonb)', 'execute');
  select exists (select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a
                 where a.grantee = 0) into public_ok;
  if not anon_ok or not auth_ok or public_ok then
    raise exception 'stop: api.report_client_errors(jsonb) is not callable by exactly anon and authenticated (anon %, authenticated %, PUBLIC %)',
      anon_ok, auth_ok, public_ok;
  end if;

  -- No other writer of either table: the claim "nothing needs pausing".
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into writers
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.oid <> 'api.report_client_errors(jsonb)'::regprocedure
    and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+app_private\.client_error_(counts|intake)\y';
  if writers is not null then
    raise exception 'stop: other functions write the error tables (they may need pausing, and the claim of this script is wrong): %', writers;
  end if;
  select string_agg(j.jobname, ', ' order by j.jobname) into writers
  from cron.job j where j.command ~* 'client_error';
  if writers is not null then
    raise exception 'stop: cron jobs mention the error tables (check what they do and pause them): %', writers;
  end if;

  -- Baseline, to compare after: what must not move.
  perform set_config('bg.report_privs_before',
    anon_ok::text || '/' || auth_ok::text || '/'
    || has_function_privilege('service_role', 'api.report_client_errors(jsonb)', 'execute')::text, true);
  perform set_config('bg.ops_health_before',
    md5(pg_catalog.pg_get_functiondef('app_private.ops_health_checks()'::regprocedure)) || '/'
    || md5(pg_catalog.pg_get_functiondef('api.service_ops_health()'::regprocedure)), true);
  perform set_config('bg.cron_jobs_before',
    (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
     from cron.job j), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261015120200, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015120200',
  'client_error_intake_budget',
  array[$bg_20261015120200_file$-- Audit SEC-06 (2026-10-14): the browser error intake keeps its hourly budget
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
$bg_20261015120200_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261015120200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015120200'
  );
begin
  if encode(sha256(convert_to(part_20261015120200, 'UTF8')), 'hex')
    is distinct from '878f67ac313d6c5b048ab379ec325860634586317381b9353e9fde8838a81cfe' then
    raise exception 'stop: 20261015120200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261015120200;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn record;
  tbl record;
  absent text;
  leaked boolean;
  public_ok boolean;
  rows_in_table bigint;
  new_report_md5 constant text := 'f0a2be65778843fc5de00e996b56cd8c';
begin
  -- The endpoint: the new source, the same attributes, the same callers.
  select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.prorettype::regtype::text as rettype,
         l.lanname, p.proacl, p.proowner, obj_description(p.oid, 'pg_proc') as comment
    into fn
  from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
  where p.oid = 'api.report_client_errors(jsonb)'::regprocedure;
  if md5(fn.prosrc) <> new_report_md5 then
    problems := problems || 'api.report_client_errors is not the new source'::text;
  end if;
  if not fn.prosecdef or fn.provolatile <> 'v' or fn.rettype <> 'jsonb' or fn.lanname <> 'plpgsql'
    or fn.proconfig is distinct from array['search_path=""'] then
    problems := problems || 'api.report_client_errors changed its attributes'::text;
  end if;
  select exists (select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a
                 where a.grantee = 0) into public_ok;
  if public_ok
    or (has_function_privilege('anon', 'api.report_client_errors(jsonb)', 'execute')::text || '/'
        || has_function_privilege('authenticated', 'api.report_client_errors(jsonb)', 'execute')::text || '/'
        || has_function_privilege('service_role', 'api.report_client_errors(jsonb)', 'execute')::text)
       is distinct from current_setting('bg.report_privs_before', true) then
    problems := problems || 'who may call api.report_client_errors changed'::text;
  end if;
  if fn.comment is null or position('app_private.client_error_intake' in fn.comment) = 0 then
    problems := problems || 'the function comment was not updated'::text;
  end if;

  -- The new table: shape, row level security, no privileges, empty.
  select c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl, c.relowner,
         obj_description(c.oid, 'pg_class') as comment
    into tbl
  from pg_catalog.pg_class c where c.oid = to_regclass('app_private.client_error_intake');
  if tbl.relkind is distinct from 'r' then
    problems := problems || 'app_private.client_error_intake is missing'::text;
  else
    if not tbl.relrowsecurity or not tbl.relforcerowsecurity then
      problems := problems || 'row level security is not on and forced on the new table'::text;
    end if;
    select exists (
      select 1 from aclexplode(coalesce(tbl.relacl, acldefault('r', tbl.relowner))) a
      where a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles
        where rolname in ('anon', 'authenticated', 'service_role'))) into leaked;
    if leaked then
      problems := problems || 'the new table is accessible to PUBLIC, anon, authenticated or service_role'::text;
    end if;
    select string_agg(v.col, ', ' order by v.col) into absent
    from (values ('bucket_hour', 'timestamp with time zone'), ('shard', 'smallint'),
                 ('dropped_new_kinds', 'integer'), ('updated_at', 'timestamp with time zone')) v(col, typ)
    where not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('app_private.client_error_intake') and a.attname = v.col
        and a.attnum > 0 and not a.attisdropped and format_type(a.atttypid, a.atttypmod) = v.typ);
    if absent is not null then
      problems := problems || ('the new table lacks columns: ' || absent);
    end if;
    if not exists (select 1 from pg_catalog.pg_constraint
                   where conrelid = to_regclass('app_private.client_error_intake') and contype = 'p'
                     and conkey = (select array_agg(a.attnum order by a.attnum) from pg_catalog.pg_attribute a
                                   where a.attrelid = to_regclass('app_private.client_error_intake')
                                     and a.attname in ('bucket_hour', 'shard')))
      or (select count(*) from pg_catalog.pg_constraint
          where conrelid = to_regclass('app_private.client_error_intake') and contype = 'c'
            and conname in ('client_error_intake_shard_check', 'client_error_intake_new_check')) <> 2 then
      problems := problems || 'the new table lacks its primary key or its two checks'::text;
    end if;
    if tbl.comment is null then
      problems := problems || 'the new table has no comment'::text;
    end if;
    execute 'select count(*) from app_private.client_error_intake' into rows_in_table;
    if rows_in_table <> 0 then
      problems := problems || 'the new table is not empty'::text;
    end if;
  end if;

  -- Nothing else moved.
  if (md5(pg_catalog.pg_get_functiondef('app_private.ops_health_checks()'::regprocedure)) || '/'
      || md5(pg_catalog.pg_get_functiondef('api.service_ops_health()'::regprocedure)))
    is distinct from current_setting('bg.ops_health_before', true) then
    problems := problems || 'ops_health_checks() or service_ops_health() changed'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.cron_jobs_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261015120200') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261015120200')
    then 'Applied. api.report_client_errors now admits new kinds under an hourly lock and counts the refused ones in app_private.client_error_intake (empty until the first hour that refuses a kind).'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
