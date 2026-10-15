-- Morocco's clock inside the database.
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
