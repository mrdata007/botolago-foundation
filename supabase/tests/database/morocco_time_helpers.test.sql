-- Morocco's clock in the database (20261016090000_morocco_time_helpers).
--
-- The rule: on or after 2026-09-20 01:00:00Z Morocco is UTC+0; before it, the
-- database's own Africa/Casablanca data apply (UTC+1, UTC+0 in Ramadan), on
-- which every tz release agrees. The expectations are the app's rule written
-- down (tests/timezone-parity/expected.json), so they hold on a server with old
-- time-zone data (Production V2 and Staging V2 today) and on one with tz 2026c.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- What this server's own data say (information only, never asserted: it is
-- the thing that differs between servers).
-- ---------------------------------------------------------------------------
select extensions.diag(
  'server Africa/Casablanca at 2026-10-15 12:00Z reads '
  || (timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca')::text
  || '; the helper reads ' || app_private.morocco_local(timestamptz '2026-10-15 12:00+00')::text);

-- ---------------------------------------------------------------------------
-- Shape: owner only, stable, empty search_path, null in, null out.
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from pg_proc
   where pronamespace = 'app_private'::regnamespace
     and proname in ('morocco_permanent_utc_from', 'morocco_time_zone_label', 'morocco_zone_name',
       'morocco_local', 'morocco_local_date', 'morocco_instant', 'morocco_day_start',
       'morocco_day_end', 'zone_local', 'zone_instant')),
  10,
  'the ten helpers exist');
select extensions.ok(
  not exists (select 1 from pg_proc p
    where p.pronamespace = 'app_private'::regnamespace
      and p.proname in ('morocco_permanent_utc_from', 'morocco_time_zone_label', 'morocco_zone_name',
        'morocco_local', 'morocco_local_date', 'morocco_instant', 'morocco_day_start',
        'morocco_day_end', 'zone_local', 'zone_instant')
      and (p.prosecdef or p.proconfig is distinct from array['search_path=""']
        or p.provolatile not in ('i', 's')
        or has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('service_role', p.oid, 'execute'))),
  'every helper is security invoker, has an empty search_path, is never volatile, and is not callable by anon, authenticated or service_role');
select extensions.ok(
  app_private.morocco_local(null) is null and app_private.morocco_instant(null) is null
    and app_private.zone_local(null, 'UTC') is null and app_private.morocco_local_date(null) is null,
  'a missing value gives a missing answer');

-- ---------------------------------------------------------------------------
-- The constant
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.morocco_permanent_utc_from(),
  timestamptz '2026-09-20 01:00:00+00',
  'Morocco is UTC+0 from 2026-09-20 01:00 UTC');

-- ---------------------------------------------------------------------------
-- Instants either side of the change
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.morocco_local(timestamptz '2026-10-15 12:00+00'),
  timestamp '2026-10-15 12:00:00',
  '2026-10-15 12:00Z is 12:00 in Morocco (an old-data server says 13:00 for the raw zone)');
select extensions.is(
  app_private.morocco_local(timestamptz '2026-09-20 00:59:59+00'),
  timestamp '2026-09-20 01:59:59',
  'the last second of UTC+1 is 01:59:59');
select extensions.is(
  app_private.morocco_local(timestamptz '2026-09-20 01:00:00+00'),
  timestamp '2026-09-20 01:00:00',
  'the first second of UTC+0 is 01:00:00: the clock went back by one hour');
select extensions.is(
  app_private.morocco_local(timestamptz '2026-09-19 12:00+00'),
  timestamp '2026-09-19 13:00:00',
  'the day before the change is still UTC+1');
select extensions.is(
  app_private.morocco_local(timestamptz '2026-03-10 12:00+00'),
  timestamp '2026-03-10 12:00:00',
  'Ramadan 2026 (before the change) is UTC+0 by the legacy data');
select extensions.is(
  app_private.morocco_local(timestamptz '2026-03-25 12:00+00'),
  timestamp '2026-03-25 13:00:00',
  'after Ramadan 2026 it is UTC+1 again');
select extensions.is(
  app_private.morocco_local(timestamptz '2026-01-15 12:00+00'),
  timestamp '2026-01-15 13:00:00',
  'January 2026 is UTC+1');
select extensions.is(
  app_private.morocco_local(timestamptz '2027-02-10 12:00+00'),
  timestamp '2027-02-10 12:00:00',
  'Ramadan 2027 is no different from any other day: UTC+0');
select extensions.is(
  app_private.morocco_local(timestamptz '2030-06-01 12:00+00'),
  timestamp '2030-06-01 12:00:00',
  'summer 2030 has no daylight saving: UTC+0');
select extensions.is(
  app_private.morocco_zone_name(timestamptz '2026-09-20 00:59:59+00'),
  'Africa/Casablanca',
  'before the change the legacy zone is asked');
select extensions.is(
  app_private.morocco_zone_name(timestamptz '2026-09-20 01:00:00+00'),
  'UTC',
  'from the change the answer is UTC');
select extensions.is(
  app_private.morocco_local_date(timestamptz '2026-10-15 23:30+00'),
  date '2026-10-15',
  'a kick-off at 23:30Z is still that Moroccan day (an old-data server puts it on the next day)');
select extensions.is(
  app_private.morocco_local_date(timestamptz '2026-10-15 00:00+00'),
  date '2026-10-15',
  'midnight UTC is the start of the Moroccan day');
select extensions.is(
  app_private.morocco_time_zone_label(),
  'Africa/Casablanca',
  'the label for output is the IANA name');

-- ---------------------------------------------------------------------------
-- From a wall clock back to an instant
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.morocco_instant(timestamp '2026-10-15 12:00'),
  timestamptz '2026-10-15 12:00+00',
  '12:00 in Morocco on 2026-10-15 is 12:00Z');
select extensions.is(
  app_private.morocco_instant(timestamp '2026-09-19 12:00'),
  timestamptz '2026-09-19 11:00+00',
  'before the change 12:00 is 11:00Z');
select extensions.is(
  app_private.morocco_instant(timestamp '2026-09-20 00:30'),
  timestamptz '2026-09-19 23:30+00',
  '00:30 on the day of the change is still UTC+1');
select extensions.is(
  app_private.morocco_instant(timestamp '2026-09-20 01:30'),
  timestamptz '2026-09-20 01:30+00',
  '01:30 happened twice that night; the later one (UTC) is returned, as in the TypeScript rule');
select extensions.is(
  app_private.morocco_day_start(date '2026-09-20'),
  timestamptz '2026-09-19 23:00+00',
  'the day of the change starts at 23:00Z');
select extensions.is(
  app_private.morocco_day_end(date '2026-09-20'),
  timestamptz '2026-09-21 00:00+00',
  'and ends at 00:00Z, so it is 25 hours long');
select extensions.is(
  app_private.morocco_day_end(date '2026-09-20') - app_private.morocco_day_start(date '2026-09-20'),
  interval '25 hours',
  'the day of the change lasts 25 hours');
select extensions.is(
  app_private.morocco_day_end(date '2026-10-15') - app_private.morocco_day_start(date '2026-10-15'),
  interval '24 hours',
  'an ordinary day after the change lasts 24 hours');
select extensions.is(
  app_private.morocco_day_start(date '2026-10-15'),
  timestamptz '2026-10-15 00:00+00',
  'a day after the change starts at midnight UTC');
select extensions.is(
  app_private.morocco_day_start(date '2026-03-10'),
  timestamptz '2026-03-10 00:00+00',
  'a Ramadan 2026 day starts at midnight UTC');
select extensions.is(
  app_private.morocco_day_start(date '2026-01-15'),
  timestamptz '2026-01-14 23:00+00',
  'a winter 2026 day starts at 23:00Z the evening before');
select extensions.is(
  app_private.morocco_day_end(date '2026-02-15') - app_private.morocco_day_start(date '2026-02-15'),
  interval '25 hours',
  'the day the clock goes back for Ramadan 2026 (legacy data) lasts 25 hours');

-- ---------------------------------------------------------------------------
-- A person's own zone: Casablanca follows the rule, any other zone is left alone
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca'),
  timestamp '2026-10-12 18:30:00',
  'a Fantasy deadline of 18:30Z reads 18:30 for a reader whose zone is Africa/Casablanca');
select extensions.is(
  to_char(app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca'), 'DD/MM HH24:MI'),
  '12/10 18:30',
  'the text printed in the notification is 12/10 18:30, not 12/10 19:30');
select extensions.is(
  app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'africa/casablanca'),
  timestamp '2026-10-12 18:30:00',
  'the zone name is matched the way PostgreSQL matches it: without regard to case');
select extensions.is(
  app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Europe/Paris'),
  timestamp '2026-10-12 20:30:00',
  'another zone is the database''s own answer (Paris is UTC+2 in October)');
select extensions.is(
  app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'UTC'),
  timestamp '2026-10-12 18:30:00',
  'UTC is UTC');
select extensions.is(
  app_private.zone_instant(timestamp '2026-10-12 20:00', 'Africa/Casablanca'),
  timestamptz '2026-10-12 20:00+00',
  'a wall time in the Casablanca zone is an instant by the rule');
select extensions.is(
  app_private.zone_instant(timestamp '2026-10-12 20:00', 'Europe/Paris'),
  timestamptz '2026-10-12 18:00+00',
  'a wall time in another zone is the database''s own answer');
select extensions.throws_ok(
  $$select app_private.zone_local(now(), 'Mars/Olympus_Mons')$$,
  '22023',
  null,
  'an unknown zone is still refused by PostgreSQL');

-- ---------------------------------------------------------------------------
-- The rule written down for the application: every instant of the parity table
-- ---------------------------------------------------------------------------
-- BEGIN GENERATED FROM tests/timezone-parity/expected.json
create temporary table rule_rows (
  instant timestamptz, zone_hour integer, day_key date,
  day_start timestamptz, day_end timestamptz, admin_local timestamp, admin_back timestamptz
) on commit drop;
insert into rule_rows values
  (timestamptz '2026-01-15 12:00:00+00', 13, '2026-01-15'::date, timestamptz '2026-01-14 23:00:00+00', timestamptz '2026-01-15 23:00:00+00', timestamp '2026-01-15 13:00', timestamptz '2026-01-15 12:00:00+00'),
  (timestamptz '2026-02-14 23:30:00+00', 0, '2026-02-15'::date, timestamptz '2026-02-14 23:00:00+00', timestamptz '2026-02-16 00:00:00+00', timestamp '2026-02-15 00:30', timestamptz '2026-02-14 23:30:00+00'),
  (timestamptz '2026-02-15 00:30:00+00', 1, '2026-02-15'::date, timestamptz '2026-02-14 23:00:00+00', timestamptz '2026-02-16 00:00:00+00', timestamp '2026-02-15 01:30', timestamptz '2026-02-15 00:30:00+00'),
  (timestamptz '2026-03-21 23:30:00+00', 23, '2026-03-21'::date, timestamptz '2026-03-21 00:00:00+00', timestamptz '2026-03-22 00:00:00+00', timestamp '2026-03-21 23:30', timestamptz '2026-03-21 23:30:00+00'),
  (timestamptz '2026-03-22 00:30:00+00', 0, '2026-03-22'::date, timestamptz '2026-03-22 00:00:00+00', timestamptz '2026-03-22 23:00:00+00', timestamp '2026-03-22 00:30', timestamptz '2026-03-22 00:30:00+00'),
  (timestamptz '2026-09-12 22:59:00+00', 23, '2026-09-12'::date, timestamptz '2026-09-11 23:00:00+00', timestamptz '2026-09-12 23:00:00+00', timestamp '2026-09-12 23:59', timestamptz '2026-09-12 22:59:00+00'),
  (timestamptz '2026-09-12 23:00:00+00', 0, '2026-09-13'::date, timestamptz '2026-09-12 23:00:00+00', timestamptz '2026-09-13 23:00:00+00', timestamp '2026-09-13 00:00', timestamptz '2026-09-12 23:00:00+00'),
  (timestamptz '2026-09-19 12:00:00+00', 13, '2026-09-19'::date, timestamptz '2026-09-18 23:00:00+00', timestamptz '2026-09-19 23:00:00+00', timestamp '2026-09-19 13:00', timestamptz '2026-09-19 12:00:00+00'),
  (timestamptz '2026-09-20 00:59:00+00', 1, '2026-09-20'::date, timestamptz '2026-09-19 23:00:00+00', timestamptz '2026-09-21 00:00:00+00', timestamp '2026-09-20 01:59', timestamptz '2026-09-20 01:59:00+00'),
  (timestamptz '2026-09-20 01:00:00+00', 1, '2026-09-20'::date, timestamptz '2026-09-19 23:00:00+00', timestamptz '2026-09-21 00:00:00+00', timestamp '2026-09-20 01:00', timestamptz '2026-09-20 01:00:00+00'),
  (timestamptz '2026-09-20 01:30:00+00', 1, '2026-09-20'::date, timestamptz '2026-09-19 23:00:00+00', timestamptz '2026-09-21 00:00:00+00', timestamp '2026-09-20 01:30', timestamptz '2026-09-20 01:30:00+00'),
  (timestamptz '2026-09-25 23:30:00+00', 23, '2026-09-25'::date, timestamptz '2026-09-25 00:00:00+00', timestamptz '2026-09-26 00:00:00+00', timestamp '2026-09-25 23:30', timestamptz '2026-09-25 23:30:00+00'),
  (timestamptz '2026-09-26 00:30:00+00', 0, '2026-09-26'::date, timestamptz '2026-09-26 00:00:00+00', timestamptz '2026-09-27 00:00:00+00', timestamp '2026-09-26 00:30', timestamptz '2026-09-26 00:30:00+00'),
  (timestamptz '2026-10-02 16:00:00+00', 16, '2026-10-02'::date, timestamptz '2026-10-02 00:00:00+00', timestamptz '2026-10-03 00:00:00+00', timestamp '2026-10-02 16:00', timestamptz '2026-10-02 16:00:00+00'),
  (timestamptz '2026-10-02 23:59:00+00', 23, '2026-10-02'::date, timestamptz '2026-10-02 00:00:00+00', timestamptz '2026-10-03 00:00:00+00', timestamp '2026-10-02 23:59', timestamptz '2026-10-02 23:59:00+00'),
  (timestamptz '2026-10-03 00:00:00+00', 0, '2026-10-03'::date, timestamptz '2026-10-03 00:00:00+00', timestamptz '2026-10-04 00:00:00+00', timestamp '2026-10-03 00:00', timestamptz '2026-10-03 00:00:00+00'),
  (timestamptz '2026-12-31 23:30:00+00', 23, '2026-12-31'::date, timestamptz '2026-12-31 00:00:00+00', timestamptz '2027-01-01 00:00:00+00', timestamp '2026-12-31 23:30', timestamptz '2026-12-31 23:30:00+00'),
  (timestamptz '2027-02-10 12:00:00+00', 12, '2027-02-10'::date, timestamptz '2027-02-10 00:00:00+00', timestamptz '2027-02-11 00:00:00+00', timestamp '2027-02-10 12:00', timestamptz '2027-02-10 12:00:00+00'),
  (timestamptz '2027-03-15 20:00:00+00', 20, '2027-03-15'::date, timestamptz '2027-03-15 00:00:00+00', timestamptz '2027-03-16 00:00:00+00', timestamp '2027-03-15 20:00', timestamptz '2027-03-15 20:00:00+00'),
  (timestamptz '2027-07-01 19:00:00+00', 19, '2027-07-01'::date, timestamptz '2027-07-01 00:00:00+00', timestamptz '2027-07-02 00:00:00+00', timestamp '2027-07-01 19:00', timestamptz '2027-07-01 19:00:00+00'),
  (timestamptz '2028-01-15 12:00:00+00', 12, '2028-01-15'::date, timestamptz '2028-01-15 00:00:00+00', timestamptz '2028-01-16 00:00:00+00', timestamp '2028-01-15 12:00', timestamptz '2028-01-15 12:00:00+00'),
  (timestamptz '2030-06-01 12:00:00+00', 12, '2030-06-01'::date, timestamptz '2030-06-01 00:00:00+00', timestamptz '2030-06-02 00:00:00+00', timestamp '2030-06-01 12:00', timestamptz '2030-06-01 12:00:00+00');
-- END GENERATED

select extensions.is(
  (select count(*)::integer from rule_rows),
  22,
  'the parity table has its 22 instants');
select extensions.is(
  (select count(*)::integer from rule_rows
   where extract(hour from app_private.morocco_local(instant))::integer <> zone_hour),
  0,
  'the Moroccan hour of every instant is the one the application prints');
select extensions.is(
  (select count(*)::integer from rule_rows
   where app_private.morocco_local_date(instant) <> day_key),
  0,
  'the Moroccan day of every instant is the one the application prints');
select extensions.is(
  (select count(*)::integer from rule_rows
   where app_private.morocco_day_start(day_key) <> day_start),
  0,
  'the start of every Moroccan day is the one the application computes');
select extensions.is(
  (select count(*)::integer from rule_rows
   where app_private.morocco_day_end(day_key) <> day_end),
  0,
  'the end of every Moroccan day is the one the application computes');
select extensions.is(
  (select count(*)::integer from rule_rows
   where date_trunc('minute', app_private.morocco_local(instant)) <> admin_local),
  0,
  'the wall clock of every instant is what the admin screen shows');
select extensions.is(
  (select count(*)::integer from rule_rows
   where app_private.morocco_instant(admin_local) <> admin_back),
  0,
  'and turning that wall clock back gives the instant the admin screen sends');

select * from extensions.finish();
rollback;
