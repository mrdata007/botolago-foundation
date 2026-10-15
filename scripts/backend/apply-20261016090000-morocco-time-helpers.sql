-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261016090000_morocco_time_helpers
-- (Morocco's clock in the database; docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md):
-- Morocco's clock inside the database: ten small helper functions in app_private
-- (app_private.morocco_local and its siblings). They apply the application's rule: Morocco is
-- UTC+0 from 2026-09-20T01:00:00Z, and before that the database's own Africa/Casablanca data
-- are asked, on which every tz release agrees. The rule is confirmed by the owner (2026-10-15).
--
-- THE RULE. Morocco is UTC+0 all year from 2026-09-20T01:00:00Z (decree n° 2.26.530; IANA tz 2026c),
-- confirmed by the owner on 2026-10-15. The application already follows it
-- (src/lib/morocco-time.ts); this database still carries older time-zone data (UTC+1), so a
-- time the database turns into Moroccan clock time is an hour off from what the person sees.
--
-- WHEN
--   First of the five Morocco-time scripts; the other four need it (they refuse without it).
--   Any time of day; it takes well under a second. Nothing else has to be applied before it.
--   Why: both databases carry time-zone data older than IANA tz 2026c, so
--   `timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca'` answers 13:00 there while
--   the application shows 12:00. This script changes NO existing behaviour: it only adds functions.
--   The four scripts after it replace the functions that use the old zone, one family each.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing: the script adds ten functions to app_private and records itself in
--   supabase_migrations.schema_migrations. It writes no table that a cron job, a workflow or the
--   application writes, and nothing calls the new functions yet. Still make sure no other schema
--   change (another apply script, a migration, a deploy) is running right now: a rehearsal that
--   ends in rollback takes locks too. The script compares the cron job list before and after and
--   stops if it moved.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query. Read-only pre-checks and post-checks:
--      docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run again. The result
--      row should say "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--
-- WHAT IT DOES
--   * refuses to run twice, and where any of the ten functions already exists;
--   * records the migration file in supabase_migrations.schema_migrations, whole as statements[1],
--     and runs it from that record once its sha256 matches the repository file;
--   * checks the result without writing anything: each function's source is the one in the file,
--     security invoker, empty search_path, not volatile, callable by nobody but the owner; the
--     helpers answer the application's rule for the instants of the parity table (2026-10-15
--     12:00Z reads 12:00; the last second of UTC+1 reads 01:59:59; the first of UTC+0 reads 01:00:00;
--     Ramadan 2026 reads UTC+0; a winter day reads UTC+1; Ramadan 2027 reads UTC+0); the cron job
--     list is where it was; the history row is there.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  fn record;
  def record;
  held text[];
  absent text;
  present text;
  baseline text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090000') then
    raise exception 'stop: migration 20261016090000 is already recorded as applied';
  end if;

  -- None of the ten helpers exists yet (the migration creates them).
  select string_agg(h.sig, ', ' order by h.sig) into present
  from (values
    ('app_private.morocco_permanent_utc_from()'),
    ('app_private.morocco_time_zone_label()'),
    ('app_private.morocco_zone_name(timestamp with time zone)'),
    ('app_private.morocco_local(timestamp with time zone)'),
    ('app_private.morocco_local_date(timestamp with time zone)'),
    ('app_private.morocco_instant(timestamp without time zone)'),
    ('app_private.morocco_day_start(date)'),
    ('app_private.morocco_day_end(date)'),
    ('app_private.zone_local(timestamp with time zone,text)'),
    ('app_private.zone_instant(timestamp without time zone,text)')
  ) h(sig)
  where to_regprocedure(h.sig) is not null;
  if present is not null then
    raise exception 'stop: these helper functions already exist: %', present;
  end if;


  -- Baseline: the cron job list.
  select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), '')) into baseline
  from cron.job j;
  perform set_config('bg.morocco_cron_before', baseline, true);

end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261016090000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016090000',
  'morocco_time_helpers',
  array[$bg_20261016090000_file$-- Morocco's clock inside the database.
--
-- WHY. From 2026-09-20T01:00:00Z Morocco keeps UTC+0 all year (decree
-- n° 2.26.530; IANA tz 2026c; confirmed by the owner on 2026-10-15). Before
-- that it kept UTC+1 and dropped to UTC+0 for Ramadan. The application owns
-- that rule (src/lib/morocco-time.ts, supabase/functions/_shared/morocco-time.ts).
-- The databases do not: Production V2 and Staging V2 (PostgreSQL 17.6) carry
-- older time-zone data in which 'Africa/Casablanca' is still UTC+1 after the
-- change, so `timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca'`
-- answers 13:00 there while the app shows 12:00. Every database function that
-- turned an instant into "Moroccan clock time" with that zone name was an hour
-- off from what the person sees: the Fantasy deadline printed in a
-- notification, the hour an e-mail goes out, the day a kick-off belongs to, the
-- hour the weekly Pépites edition appears.
--
-- WHAT THIS ADDS. A small set of helpers in app_private that apply the app's
-- rule and read the database's own `Africa/Casablanca` data only for instants
-- BEFORE the change, where every tz release agrees (the data differ only on or
-- after it). Nothing here reads a server setting, so the answer does not depend
-- on which Postgres image or tz release the project runs; once Supabase ships
-- tz 2026c the helpers give the same answers as before.
--
--   app_private.morocco_permanent_utc_from()  the instant of the change
--   app_private.morocco_time_zone_label()     'Africa/Casablanca', for labels only
--   app_private.morocco_zone_name(ts)         'UTC' on or after the change, else the legacy zone
--   app_private.morocco_local(ts)             Morocco wall clock at an instant (timestamp)
--   app_private.morocco_local_date(ts)        Morocco calendar day of an instant (date)
--   app_private.morocco_instant(local)        the instant at which Morocco's clock reads `local`
--   app_private.morocco_day_start(day)        start of a Moroccan day (inclusive)
--   app_private.morocco_day_end(day)          end of a Moroccan day (exclusive)
--   app_private.zone_local(ts, zone)          like `ts at time zone zone`, Morocco's rule for Casablanca
--   app_private.zone_instant(local, zone)     like `local at time zone zone`, Morocco's rule for Casablanca
--
-- `morocco_instant` follows src/lib/morocco-time.ts moroccoWallToInstant: the
-- wall time 01:00 to 02:00 on 2026-09-20 happened twice (the clock went back
-- from UTC+1 to UTC+0 at 01:00Z); the later reading, the one that is UTC, is
-- returned. The day of the change is 25 hours long.
--
-- A new migration must not write the literal zone name itself: it calls these.
-- src/lib/morocco-time-sql.test.ts fails when a migration newer than this one
-- does, and when this constant differs from the TypeScript constant.
--
-- Not changed here: any existing function. Each family of callers is replaced
-- by its own migration, 20261016090100 onward, so each can be reviewed and
-- applied on its own. All helpers are owner-only like the rest of app_private
-- (the security definer functions that call them run as the owner).

create or replace function app_private.morocco_permanent_utc_from()
returns timestamptz
language sql
immutable
security invoker
set search_path = ''
as $$
  select timestamptz '2026-09-20 01:00:00+00';
$$;

create or replace function app_private.morocco_time_zone_label()
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select 'Africa/Casablanca'::text;
$$;

create or replace function app_private.morocco_zone_name(p_at timestamptz)
returns text
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select case
    when p_at >= app_private.morocco_permanent_utc_from() then 'UTC'
    else 'Africa/Casablanca'
  end;
$$;

create or replace function app_private.morocco_local(p_at timestamptz)
returns timestamp
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select p_at at time zone app_private.morocco_zone_name(p_at);
$$;

create or replace function app_private.morocco_local_date(p_at timestamptz)
returns date
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select (app_private.morocco_local(p_at))::date;
$$;

create or replace function app_private.morocco_instant(p_local timestamp)
returns timestamptz
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select case
    when (p_local at time zone 'UTC') >= app_private.morocco_permanent_utc_from()
      then p_local at time zone 'UTC'
    else p_local at time zone 'Africa/Casablanca'
  end;
$$;

create or replace function app_private.morocco_day_start(p_day date)
returns timestamptz
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select app_private.morocco_instant(p_day::timestamp);
$$;

create or replace function app_private.morocco_day_end(p_day date)
returns timestamptz
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select app_private.morocco_instant((p_day + 1)::timestamp);
$$;

create or replace function app_private.zone_local(p_at timestamptz, p_zone text)
returns timestamp
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select case
    when lower(p_zone) = 'africa/casablanca' then app_private.morocco_local(p_at)
    else p_at at time zone p_zone
  end;
$$;

create or replace function app_private.zone_instant(p_local timestamp, p_zone text)
returns timestamptz
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select case
    when lower(p_zone) = 'africa/casablanca' then app_private.morocco_instant(p_local)
    else p_local at time zone p_zone
  end;
$$;

comment on function app_private.morocco_permanent_utc_from() is
  'The instant from which Morocco keeps UTC+0 all year (2026-09-20 01:00 UTC). Mirrors MOROCCO_PERMANENT_UTC_FROM_MS in src/lib/morocco-time.ts; a test fails if they differ.';
comment on function app_private.morocco_time_zone_label() is
  'The IANA name of Morocco''s clock, for labels in output only. Never use it to convert an instant: use morocco_local and its siblings.';
comment on function app_private.morocco_zone_name(timestamptz) is
  'UTC for instants on or after the permanent UTC+0 change, Africa/Casablanca (where every tz release agrees) before it.';
comment on function app_private.morocco_local(timestamptz) is
  'Morocco''s wall clock at an instant, by the app''s rule, whatever time-zone data the server carries. Replaces `ts at time zone ''Africa/Casablanca''`.';
comment on function app_private.morocco_local_date(timestamptz) is
  'The Moroccan calendar day of an instant.';
comment on function app_private.morocco_instant(timestamp) is
  'The instant at which Morocco''s clock reads the given wall time (the later reading where a wall time happened twice). Replaces `local at time zone ''Africa/Casablanca''`.';
comment on function app_private.morocco_day_start(date) is
  'The first instant of a Moroccan day.';
comment on function app_private.morocco_day_end(date) is
  'The instant a Moroccan day ends (the start of the next one; exclusive).';
comment on function app_private.zone_local(timestamptz, text) is
  '`ts at time zone zone`, except that Africa/Casablanca follows the app''s rule. For a person''s own notification time zone, which defaults to Africa/Casablanca.';
comment on function app_private.zone_instant(timestamp, text) is
  '`local at time zone zone`, except that Africa/Casablanca follows the app''s rule.';

revoke all on function
  app_private.morocco_permanent_utc_from(),
  app_private.morocco_time_zone_label(),
  app_private.morocco_zone_name(timestamptz),
  app_private.morocco_local(timestamptz),
  app_private.morocco_local_date(timestamptz),
  app_private.morocco_instant(timestamp),
  app_private.morocco_day_start(date),
  app_private.morocco_day_end(date),
  app_private.zone_local(timestamptz, text),
  app_private.zone_instant(timestamp, text)
from public, anon, authenticated, service_role;
grant execute on function
  app_private.morocco_permanent_utc_from(),
  app_private.morocco_time_zone_label(),
  app_private.morocco_zone_name(timestamptz),
  app_private.morocco_local(timestamptz),
  app_private.morocco_local_date(timestamptz),
  app_private.morocco_instant(timestamp),
  app_private.morocco_day_start(date),
  app_private.morocco_day_end(date),
  app_private.zone_local(timestamptz, text),
  app_private.zone_instant(timestamp, text)
to postgres;
$bg_20261016090000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261016090000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016090000'
  );
begin
  if encode(sha256(convert_to(part_20261016090000, 'UTF8')), 'hex')
    is distinct from '9f31aece14d05623b382ef935bfbf1b80d8ad37ec25a5c7795fa8d0aed673728' then
    raise exception 'stop: 20261016090000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016090000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn record;
  def record;
  needle text;
  leaked boolean;
  baseline text;
begin
  -- The ten helpers are the migration's: source, security invoker, empty search_path, never volatile,
  -- callable by the owner only, commented.
  for fn in
    select * from (values
      ('app_private.morocco_permanent_utc_from()', '0121c9157d7d1ff8b631505346c93e8d', 'i'),
      ('app_private.morocco_time_zone_label()', '56f77cbfc332de897228af318427ec73', 'i'),
      ('app_private.morocco_zone_name(timestamp with time zone)', '46d83167cae2e309865addebb8149388', 's'),
      ('app_private.morocco_local(timestamp with time zone)', '2a14d329a546ae4d825a47ae59c184db', 's'),
      ('app_private.morocco_local_date(timestamp with time zone)', 'f506550098a22ea140b464a920c4b53f', 's'),
      ('app_private.morocco_instant(timestamp without time zone)', 'd4876d382d725001a00ec4a5764ea259', 's'),
      ('app_private.morocco_day_start(date)', '01999ac07dbfb139ee662e802ff1d128', 's'),
      ('app_private.morocco_day_end(date)', '6dca44b43ff8863b21ee8bf0052b117b', 's'),
      ('app_private.zone_local(timestamp with time zone,text)', 'd05aeb2e6d7ecccdddc80b0d474f7a2b', 's'),
      ('app_private.zone_instant(timestamp without time zone,text)', '5aff74a376f56524ed8576282086bf1e', 's')
    ) v(sig, md5_src, vol)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.proacl, p.proowner, obj_description(p.oid, 'pg_proc') as comment into def
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      problems := problems || (fn.sig || ' is missing')::text;
      continue;
    end if;
    if md5(def.prosrc) <> fn.md5_src then
      problems := problems || (fn.sig || ' is not the new source')::text;
    end if;
    if def.prosecdef or def.provolatile <> fn.vol or def.proconfig is distinct from array['search_path=""'] then
      problems := problems || (fn.sig || ' has the wrong attributes')::text;
    end if;
    if def.comment is null then
      problems := problems || (fn.sig || ' has no comment')::text;
    end if;
    select exists (
      select 1 from aclexplode(coalesce(def.proacl, acldefault('f', def.proowner))) a
      where a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role')))) into leaked;
    if leaked then
      problems := problems || (fn.sig || ' is executable by PUBLIC, anon, authenticated or service_role')::text;
    end if;
  end loop;


  if app_private.morocco_local(timestamptz '2026-10-15 12:00+00') is distinct from timestamp '2026-10-15 12:00:00'
    or app_private.morocco_local(timestamptz '2026-09-20 00:59:59+00') is distinct from timestamp '2026-09-20 01:59:59'
    or app_private.morocco_local(timestamptz '2026-09-20 01:00:00+00') is distinct from timestamp '2026-09-20 01:00:00'
    or app_private.morocco_local(timestamptz '2026-03-10 12:00+00') is distinct from timestamp '2026-03-10 12:00:00'
    or app_private.morocco_local(timestamptz '2026-01-15 12:00+00') is distinct from timestamp '2026-01-15 13:00:00'
    or app_private.morocco_local(timestamptz '2027-02-10 12:00+00') is distinct from timestamp '2027-02-10 12:00:00' then
    raise exception 'stop: the Morocco clock helpers do not give the application''s answers';
  end if;
  if app_private.morocco_instant(timestamp '2026-10-15 12:00') is distinct from timestamptz '2026-10-15 12:00+00'
    or app_private.morocco_instant(timestamp '2026-09-20 00:30') is distinct from timestamptz '2026-09-19 23:30+00'
    or app_private.morocco_day_start(date '2026-09-20') is distinct from timestamptz '2026-09-19 23:00+00'
    or app_private.morocco_day_end(date '2026-09-20') is distinct from timestamptz '2026-09-21 00:00+00'
    or app_private.morocco_local_date(timestamptz '2026-10-15 23:30+00') is distinct from date '2026-10-15' then
    raise exception 'stop: the Morocco day helpers do not give the application''s answers';
  end if;
  if app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca') is distinct from timestamp '2026-10-12 18:30:00'
    or app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Europe/Paris') is distinct from timestamp '2026-10-12 20:30:00'
    or app_private.zone_instant(timestamp '2026-10-12 20:00', 'Europe/Paris') is distinct from timestamptz '2026-10-12 18:00+00' then
    raise exception 'stop: the zone helpers do not give the expected answers';
  end if;


  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j) is distinct from current_setting('bg.morocco_cron_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090000') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'after: the helpers answer the application''s rule check out';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090000')
    then 'Applied. Migration 20261016090000 is recorded; morocco time helpers is in place. Run the post-checks in docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md.'
  else 'Rehearsal passed. Nothing was saved.'
      || ' The database still says, for 12:00 UTC on 2026-10-15, Africa/Casablanca = '
      || (timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca')::text
      || ' (the application says 12:00; the helpers will say 12:00 whichever this reads).'
      || ' Change rollback; to commit; and run again.'
end as result;
