-- The functions that used the database's own Africa/Casablanca data now follow the application's
-- Morocco clock (20261016090100 .. 20261016090400). Only the functions whose answer does not depend
-- on a table are called here; the planner, the fan-outs, the Pépites tick and the analytics read
-- are exercised by their own suites (notification_email_delivery, push_fanout,
-- push_remaining_alerts, pepites_editions, admin_user_moderation), which now build their
-- instants with app_private.morocco_instant instead of the server's own zone.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Quiet hours (20261016090200): 22:00 to 07:00 in Africa/Casablanca
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.defer_for_quiet_hours(timestamptz '2026-10-15 22:30+00', 'Africa/Casablanca', true,
    time '22:00', time '07:00', false),
  timestamptz '2026-10-16 07:00+00',
  'a push at 22:30 Moroccan time waits for 07:00 the next morning (06:00Z would be an hour early)');
select extensions.is(
  app_private.defer_for_quiet_hours(timestamptz '2026-10-15 21:30+00', 'Africa/Casablanca', true,
    time '22:00', time '07:00', false),
  timestamptz '2026-10-15 21:30+00',
  'a push at 21:30 Moroccan time is outside the window and goes at once');
select extensions.is(
  app_private.defer_for_quiet_hours(timestamptz '2026-10-16 03:00+00', 'Africa/Casablanca', true,
    time '22:00', time '07:00', false),
  timestamptz '2026-10-16 07:00+00',
  'a push at 03:00 waits for 07:00 the same morning');
select extensions.is(
  app_private.defer_for_quiet_hours(timestamptz '2026-10-15 21:30+00', 'Europe/Paris', true,
    time '22:00', time '07:00', false),
  timestamptz '2026-10-16 05:00+00',
  'another zone is the database''s own answer (Paris is UTC+2 in October)');
select extensions.is(
  app_private.defer_for_quiet_hours(timestamptz '2026-09-19 22:30+00', 'Africa/Casablanca', true,
    time '22:00', time '07:00', false),
  timestamptz '2026-09-20 07:00+00',
  'before the change Morocco was UTC+1: 22:30Z was 23:30 local, inside the window; it ends at 07:00 on the 20th, which is already UTC+0');
select extensions.is(
  app_private.defer_for_quiet_hours(timestamptz '2026-10-15 22:30+00', 'Africa/Casablanca', false,
    time '22:00', time '07:00', false),
  timestamptz '2026-10-15 22:30+00',
  'quiet hours off: no wait');

-- ---------------------------------------------------------------------------
-- Pépites: Monday + local time -> instant (20261016090300)
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.pepites_local_at(date '2026-10-19', time '20:00'),
  timestamptz '2026-10-19 20:00+00',
  'the weekly Top 10 at 20:00 Moroccan time is 20:00Z (19:00Z would publish an hour early)');
select extensions.is(
  app_private.pepites_local_at(date '2026-10-19', time '12:00'),
  timestamptz '2026-10-19 12:00+00',
  'the staff draft at 12:00 Moroccan time is 12:00Z');
select extensions.is(
  app_private.pepites_local_at(date '2026-09-14', time '20:00'),
  timestamptz '2026-09-14 19:00+00',
  'before the change Morocco was UTC+1: 20:00 local was 19:00Z');

-- ---------------------------------------------------------------------------
-- The text of every replaced function: the helpers, and no raw Moroccan zone left
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select position('app_private.zone_local(' in prosrc) > 0
     and position('at time zone audience.timezone' in prosrc) = 0
   from pg_proc where oid = 'app_private.notification_push_fanout(timestamptz, text, uuid[], timestamptz, text, timestamptz, integer)'::regprocedure),
  'the push fan-out prints the deadline through app_private.zone_local');
select extensions.ok(
  (select position('app_private.zone_local(' in prosrc) > 0
     and position('at time zone audience.timezone' in prosrc) = 0
   from pg_proc where oid = 'app_private.notification_email_fanout(timestamptz, text, uuid[], timestamptz, integer)'::regprocedure),
  'the in-app and e-mail fan-out prints the deadline through app_private.zone_local');
select extensions.ok(
  (select position('app_private.morocco_local(' in prosrc) > 0
     and position('local_zone' in prosrc) = 0 and position('Casablanca' in prosrc) = 0
   from pg_proc where oid = 'app_private.notification_email_plan(timestamptz)'::regprocedure),
  'the e-mail planner reads Morocco''s clock through app_private.morocco_local');
select extensions.ok(
  (select position('app_private.zone_local(' in prosrc) > 0 and position('app_private.zone_instant(' in prosrc) > 0
     and position('at time zone' in prosrc) = 0
   from pg_proc where oid = 'app_private.defer_for_quiet_hours(timestamptz, text, boolean, time, time, boolean)'::regprocedure),
  'quiet hours go through the zone helpers');
select extensions.ok(
  not exists (
    select 1 from pg_proc
    where oid in (
      'app_private.pepites_local_at(date, time)'::regprocedure,
      'app_private.pepites_create_draft(uuid, date, uuid)'::regprocedure,
      'app_private.pepites_tick_draft(uuid, timestamptz)'::regprocedure,
      'app_private.pepites_tick_daily(uuid, timestamptz)'::regprocedure,
      'app_private.pepites_tick(timestamptz)'::regprocedure)
      and position('Casablanca' in prosrc) > 0),
  'no Pépites time-of-day function names the Moroccan zone any more');
select extensions.ok(
  not exists (
    select 1 from pg_proc
    where oid in (
      'api.football_season_catalog(text, integer)'::regprocedure,
      'api.admin_get_analytics_overview()'::regprocedure)
      and (position('Casablanca' in prosrc) > 0 or position('at time zone' in prosrc) > 0)),
  'the season catalog and the analytics read use the helpers, not the zone name');

-- ---------------------------------------------------------------------------
-- Nothing else in the application schemas asks the database for the Moroccan zone
-- (functions replaced above are the live ones; a new one must call the helpers)
-- ---------------------------------------------------------------------------
select extensions.is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'app_private', 'api')
     and p.prosrc ~* 'at time zone\s+''?africa/casablanca|local_zone'
     and p.proname not in ('pepites_source_players', 'pepites_compute_v1')
     and p.oid::regprocedure::text not like 'app_private.morocco\_%'
     and p.oid::regprocedure::text not like 'app_private.zone\_%'),
  '',
  'no function (apart from the sealed Pépites scoring, left alone on purpose) reads the Moroccan zone from the server''s own data');

select * from extensions.finish();
rollback;
