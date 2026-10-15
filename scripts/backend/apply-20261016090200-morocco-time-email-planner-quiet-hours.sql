-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261016090200_morocco_time_email_planner_quiet_hours
-- (Morocco's clock in the database; docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md):
-- The e-mail planner and quiet hours follow Morocco's clock. It replaces TWO functions, each
-- with only the zone expressions changed: app_private.notification_email_plan (match day, the
-- 10:00 preview, the 08:00 results floor, the round preview) and
-- app_private.defer_for_quiet_hours (a reader's quiet hours and the instant they end).
-- Before: every send came an hour early and a 23:00-24:00 UTC kick-off went into the next day's
-- e-mail. After: they follow the clock on the wall.
--
-- THE RULE. Morocco is UTC+0 all year from 2026-09-20T01:00:00Z (decree n° 2.26.530; IANA tz 2026c),
-- confirmed by the owner on 2026-10-15. The application already follows it
-- (src/lib/morocco-time.ts); this database still carries older time-zone data (UTC+1), so a
-- time the database turns into Moroccan clock time is an hour off from what the person sees.
--
-- WHEN
--   After 20261016090000 (the helpers) is committed. Before e-mail is switched on for readers
--   (it is off today, and nobody has quiet hours on). Any time of day; well under a second.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing: the script only replaces the definition of two functions (pg_proc) and
--   records itself in supabase_migrations.schema_migrations. It writes no notification, event,
--   delivery or setting table. The jobs that CALL the functions see the new text on their next
--   call:
--   * notification-push-tick (every minute): notification_push_tick -> notification_push_plan /
--     notification_push_fanout, and notification_email_plan while e-mail is not the one planning;
--   * notification-email-tick (every 5 minutes): notification_email_tick -> notification_email_plan,
--     notification_email_fanout.
--   * manager-card-tick (every 15 minutes) and, where applied, rivals-tick: both call
--     defer_for_quiet_hours when they write a notification.
--   A call already running finishes on the old text. Still make sure no other schema change is
--   running right now. The script compares the e-mail and push switches and the cron job list
--   before and after and stops if they moved.
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
--   * refuses to run twice, before the helpers are recorded and working, and where either
--     function is not byte for byte the text the repository's latest migration defines
--     (md5 of its source), changed attributes (security definer / invoker, volatility, empty
--     search_path), or is callable by anyone but the owner;
--   * records the migration file in supabase_migrations.schema_migrations and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: each source is the new one with no raw
--     zone expression left; attributes, privileges and comments are unchanged;
--     defer_for_quiet_hours answers 22:30Z -> 07:00Z and 21:30Z -> 21:30Z for a 22:00-07:00 window
--     in Africa/Casablanca; the switches and the cron job list are where they were. It never
--     calls the planner (it writes events), so it plans and sends nothing.
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090200') then
    raise exception 'stop: migration 20261016090200 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090000') then
    raise exception 'stop: 20261016090000 (the Morocco clock helpers) is not recorded -- apply scripts/backend/apply-20261016090000-morocco-time-helpers.sql (committed) first';
  end if;
  -- The helpers are the reviewed ones and answer the application's rule.
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
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig into def
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      raise exception 'stop: helper % does not exist -- apply the helpers first', fn.sig;
    end if;
    if md5(def.prosrc) <> fn.md5_src or def.prosecdef or def.provolatile <> fn.vol
      or def.proconfig is distinct from array['search_path=""'] then
      raise exception 'stop: helper % is not the reviewed one', fn.sig;
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
  -- Each function this update replaces is exactly what the repository's latest migration defines.
  for fn in
    select * from (values
      ('app_private.notification_email_plan(timestamp with time zone)', 'c261d9f075f060540e092803e50a2e2d', 'b686fb3d2000279349c4d1afbb9f7edf', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.defer_for_quiet_hours(timestamp with time zone,text,boolean,time without time zone,time without time zone,boolean)', 'e98342fc4a2214dcc00ab817effadcd5', '691fac43285139e7a650a92bb60adcb5', false, 's', 'plpgsql', true, '{}'::text[])
    ) v(sig, old_md5, new_md5, secdef, vol, lang, search_path_empty, holders)
  loop
    select p.oid, p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.proacl, p.proowner, l.lanname into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      raise exception 'stop: % does not exist on this database', fn.sig;
    end if;
    if md5(def.prosrc) = fn.new_md5 then
      raise exception 'stop: % already has the new text -- was this applied by another route?', fn.sig;
    end if;
    if md5(def.prosrc) <> fn.old_md5 then
      raise exception 'stop: % is not the version this update replaces (md5 %, expected %)', fn.sig, md5(def.prosrc), fn.old_md5;
    end if;
    if def.prosecdef <> fn.secdef or def.provolatile <> fn.vol or def.lanname <> fn.lang
      or (def.proconfig is not distinct from array['search_path=""']) <> fn.search_path_empty then
      raise exception 'stop: % has attributes other than the reviewed ones (security, volatility, language, search_path)', fn.sig;
    end if;
    select coalesce(array_agg(distinct r.name order by r.name), '{}') into held
    from (
      select case when a.grantee = 0 then 'public' else (select rolname from pg_catalog.pg_roles where oid = a.grantee) end as name
      from aclexplode(coalesce(def.proacl, acldefault('f', def.proowner))) a
      where a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role')))
    ) r;
    if held is distinct from fn.holders then
      raise exception 'stop: % is executable by % -- expected %', fn.sig, held, fn.holders;
    end if;
  end loop;

  -- What the new text calls must exist (other than the helpers, checked above).
  select string_agg(v.name, ', ' order by v.name) into absent
  from (values
    ('app_private.assert_valid_timezone'),
    ('app_private.fantasy_kickoff_confirmed'),
    ('app_private.notification_email_enqueue'),
    ('app_private.notification_email_fixture_json')
  ) v(name)
  where not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname || '.' || p.proname = v.name);
  if absent is not null then
    raise exception 'stop: the database is missing functions this update calls: %', absent;
  end if;

  -- Baseline: the cron job list, the privileges and comments of the functions, the switches.
  select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), '')) into baseline
  from cron.job j;
  perform set_config('bg.morocco_cron_before', baseline, true);
  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, '-') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '-'), ',' order by p.oid::regprocedure::text), '')) into baseline
  from pg_catalog.pg_proc p
  where p.oid in (to_regprocedure('app_private.notification_email_plan(timestamp with time zone)'), to_regprocedure('app_private.defer_for_quiet_hours(timestamp with time zone,text,boolean,time without time zone,time without time zone,boolean)'));
  perform set_config('bg.morocco_acl_comment_before', baseline, true);
  baseline := (select coalesce((select md5(jsonb_build_array(s.mode, s.test_user_ids, s.functions_base_url, s.football_live_refresh_enabled)::text) from app_private.notification_email_settings s limit 1), ''));
  perform set_config('bg.morocco_watched_0_before', baseline, true);
  baseline := (select coalesce((select md5(jsonb_build_array(s.mode, s.test_user_ids, s.functions_base_url)::text) from app_private.notification_push_settings s limit 1), ''));
  perform set_config('bg.morocco_watched_1_before', baseline, true);
  -- Who is affected: readers with quiet hours on (counts only).
  raise notice 'readers with quiet hours on: %',
    (select count(*) from app.user_preferences where quiet_hours_enabled);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261016090200, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016090200',
  'morocco_time_email_planner_quiet_hours',
  array[$bg_20261016090200_file$-- The e-mail planner and quiet hours follow Morocco's clock.
--
-- WHAT WAS WRONG. Two functions turned an instant into Morocco's wall clock with
-- the databases' own `Africa/Casablanca` data, which still say UTC+1 after
-- 2026-09-20 (the app's rule is UTC+0 from 2026-09-20T01:00:00Z, 20261016090000).
--   * app_private.notification_email_plan: "match day" is the Moroccan day, the
--     match-day preview goes out at 10:00 (never before 07:00, or two hours before
--     the first kick-off when that is earlier), the results e-mail not before
--     08:00 and not after noon the next day, the round preview at 10:00 three days
--     before a round. Every one of those times came an hour early, and a kick-off
--     between 23:00 and 24:00 UTC was put in the NEXT day's e-mail.
--   * app_private.defer_for_quiet_hours: a reader's quiet hours (and the instant
--     they end) were an hour off for every reader whose zone is Africa/Casablanca,
--     which is every account's default.
-- E-mail is off and nobody has quiet hours on today; this is fixed before that
-- changes.
--
-- WHAT THIS CHANGES. Two functions, each the latest definition with only the
-- zone expressions replaced by the helpers of 20261016090000:
--   * notification_email_plan (20260924140100): the `local_zone constant
--     'Africa/Casablanca'` and its seven uses become app_private.morocco_local and
--     app_private.morocco_local_date.
--   * defer_for_quiet_hours (20260720121727): `at time zone target_timezone`
--     becomes app_private.zone_local / app_private.zone_instant, which are
--     PostgreSQL's own answer for any zone except Africa/Casablanca.
-- Signatures, volatility, security attributes, search_path and privileges are
-- unchanged. Kick-off windows (10 to 65 minutes, 24 hours) are instants and were
-- never affected.
--
-- Depends on 20261016090000 (the helpers).

do $$
begin
  if to_regprocedure('app_private.morocco_local(timestamp with time zone)') is null
    or to_regprocedure('app_private.zone_local(timestamp with time zone, text)') is null then
    raise exception 'morocco_time_helpers_missing: apply 20261016090000 first';
  end if;
end $$;

create or replace function app_private.notification_email_plan(p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  local_now timestamp := app_private.morocco_local(p_now);
  today date := app_private.morocco_local_date(p_now);
  planned jsonb := '[]'::jsonb;
  first_kickoff timestamptz;
  due_local timestamp;
  fixture_payload jsonb;
  match_day date;
  finished_count integer;
  pending_count integer;
  candidate record;
begin
  -- 1. matchday_preview: today's matches, at 10:00 (or 2 h before the first
  --    kick-off if earlier, but never before 07:00), while one is still ahead.
  select min(fixture.kickoff_at)
  into first_kickoff
  from app.fixtures fixture
  join app.seasons season on season.id = fixture.season_id and season.is_current
  where app_private.morocco_local_date(fixture.kickoff_at) = today
    and fixture.status in ('scheduled', 'not_started', 'delayed')
    and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at);
  if first_kickoff is not null and first_kickoff > p_now + interval '15 minutes' then
    due_local := greatest(
      today + time '07:00',
      least(today + time '10:00', app_private.morocco_local(first_kickoff) - interval '2 hours')
    );
    if local_now >= due_local then
      select coalesce(jsonb_agg(app_private.notification_email_fixture_json(fixture.id)
        order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
      into fixture_payload
      from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where app_private.morocco_local_date(fixture.kickoff_at) = today
        and fixture.status in ('scheduled', 'not_started', 'delayed')
        and (fixture.kickoff_at > p_now or not app_private.fantasy_kickoff_confirmed(fixture.kickoff_at));
      if app_private.notification_email_enqueue(
        'matchday_preview', 'football', null, 'email:matchday_preview:' || today::text,
        jsonb_build_object('date', today::text, 'fixtures', fixture_payload), p_now
      ) then
        planned := planned || jsonb_build_object('type', 'matchday_preview', 'date', today);
      end if;
    end if;
  end if;

  -- 2. matchday_results: yesterday's and today's, once every match of the day
  --    that was due to be played has a result. A suspended match may still
  --    resume, so it holds the email back for four hours after its kick-off;
  --    after that it is listed as interrupted. Not between 00:00 and 08:00,
  --    and not after noon the next day.
  foreach match_day in array array[today - 1, today] loop
    select
      count(*) filter (where fixture.status = 'finished'),
      count(*) filter (where (fixture.status in (
          'scheduled', 'not_started', 'delayed', 'live_first_half', 'half_time',
          'live_second_half', 'extra_time', 'penalties')
          or (fixture.status = 'suspended' and fixture.kickoff_at > p_now - interval '4 hours'))
        and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at))
    into finished_count, pending_count
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where app_private.morocco_local_date(fixture.kickoff_at) = match_day;

    continue when finished_count = 0 or pending_count > 0;
    continue when local_now >= (match_day + 1) + time '12:00';
    continue when local_now::time < time '08:00';

    select coalesce(jsonb_agg(app_private.notification_email_fixture_json(fixture.id)
      order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
    into fixture_payload
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where app_private.morocco_local_date(fixture.kickoff_at) = match_day
      and (fixture.status in ('finished', 'postponed', 'cancelled', 'abandoned', 'suspended'));
    if app_private.notification_email_enqueue(
      'matchday_results', 'football', null, 'email:matchday_results:' || match_day::text,
      jsonb_build_object('date', match_day::text, 'fixtures', fixture_payload), p_now
    ) then
      planned := planned || jsonb_build_object('type', 'matchday_results', 'date', match_day);
    end if;
  end loop;

  -- 3. round_preview: 10:00 three days before a round's first match, for a
  --    round none of whose matches has been played yet.
  for candidate in
    select fixture.round_id, min(fixture.kickoff_at) as first_kickoff
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where fixture.round_id is not null
      and fixture.status in ('scheduled', 'not_started', 'delayed')
      and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
    group by fixture.round_id
    having min(fixture.kickoff_at) > p_now + interval '12 hours'
      and min(fixture.kickoff_at) <= p_now + interval '4 days'
  loop
    continue when exists (
      select 1 from app.fixtures played
      where played.round_id = candidate.round_id
        and played.status in ('finished', 'live_first_half', 'half_time', 'live_second_half',
          'extra_time', 'penalties')
    );
    continue when local_now < (app_private.morocco_local_date(candidate.first_kickoff) - 3) + time '10:00';
    select coalesce(jsonb_agg(app_private.notification_email_fixture_json(fixture.id)
      order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
    into fixture_payload
    from app.fixtures fixture
    where fixture.round_id = candidate.round_id
      and fixture.status in ('scheduled', 'not_started', 'delayed');
    if app_private.notification_email_enqueue(
      'round_preview', 'football', candidate.round_id,
      'email:round_preview:' || candidate.round_id::text,
      (
        select jsonb_build_object(
          'round', jsonb_build_object('id', round.id, 'number', round.round_number, 'name', round.name),
          'fixtures', fixture_payload
        )
        from app.rounds round where round.id = candidate.round_id
      ),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'round_preview', 'roundId', candidate.round_id);
    end if;
  end loop;

  -- 4. match_starting: an hour before kick-off, only for matches some user
  --    cares about (favourite club, followed team or subscription).
  for candidate in
    select fixture.id, fixture.kickoff_at
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where fixture.status in ('scheduled', 'not_started')
      and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
      and fixture.kickoff_at > p_now + interval '10 minutes'
      and fixture.kickoff_at <= p_now + interval '65 minutes'
      and (
        exists (select 1 from app.user_preferences preference
          where preference.favorite_team_id in (fixture.home_team_id, fixture.away_team_id))
        or exists (select 1 from app.followed_teams followed
          where followed.team_id in (fixture.home_team_id, fixture.away_team_id))
        or exists (select 1 from app.notification_subscriptions subscription
          where subscription.enabled
            and (subscription.fixture_id = fixture.id
              or subscription.team_id in (fixture.home_team_id, fixture.away_team_id)))
      )
  loop
    if app_private.notification_email_enqueue(
      'match_starting', 'football', candidate.id, 'email:match_starting:' || candidate.id::text,
      jsonb_build_object(
        'fixture', app_private.notification_email_fixture_json(candidate.id),
        'minutes', least(60, greatest(5,
          (round(extract(epoch from (candidate.kickoff_at - p_now)) / 300) * 5)::integer))
      ),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'match_starting', 'fixtureId', candidate.id);
    end if;
  end loop;

  -- 5. deadline_24h: 24 h before an open or scheduled gameweek's deadline,
  --    only when that deadline was not derived from a placeholder kick-off.
  for candidate in
    select gameweek.id, gameweek.sequence_number, gameweek.name, gameweek.deadline_at
    from app.fantasy_gameweeks gameweek
    join app.fantasy_seasons season on season.id = gameweek.fantasy_season_id
    where season.status in ('registration_open', 'active')
      and gameweek.status in ('scheduled', 'open')
      and gameweek.deadline_at > p_now + interval '1 hour'
      and gameweek.deadline_at <= p_now + interval '24 hours'
  loop
    select min(assignment.assigned_kickoff_at)
    into first_kickoff
    from app.fantasy_fixture_assignments assignment
    where assignment.gameweek_id = candidate.id
      and assignment.superseded_at is null
      and assignment.counts_points;
    continue when first_kickoff is null or not app_private.fantasy_kickoff_confirmed(first_kickoff);
    if app_private.notification_email_enqueue(
      'deadline_24h', 'fantasy', candidate.id, 'email:deadline_24h:' || candidate.id::text,
      jsonb_build_object(
        'gameweek', jsonb_build_object(
          'id', candidate.id, 'sequence', candidate.sequence_number, 'name', candidate.name),
        'deadlineAt', candidate.deadline_at
      ),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'deadline_24h', 'gameweekId', candidate.id);
    end if;
  end loop;

  -- gameweek_finalized events are written by the Fantasy lifecycle
  -- (api.service_enqueue_gameweek_finalized_notifications); nothing to plan.
  return jsonb_build_object('planned', planned);
end;
$$;

create or replace function app_private.defer_for_quiet_hours(
  candidate_at timestamptz,
  target_timezone text,
  quiet_enabled boolean,
  quiet_start time,
  quiet_end time,
  bypass_quiet boolean default false
)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  local_candidate timestamp;
  local_time time;
  local_end timestamp;
begin
  perform app_private.assert_valid_timezone(target_timezone);
  if bypass_quiet or not quiet_enabled then
    return candidate_at;
  end if;
  if quiet_start is null or quiet_end is null or quiet_start = quiet_end then
    raise exception using errcode = '22023', message = 'quiet_hours_invalid';
  end if;

  local_candidate := app_private.zone_local(candidate_at, target_timezone);
  local_time := local_candidate::time;

  if quiet_start < quiet_end then
    if local_time < quiet_start or local_time >= quiet_end then
      return candidate_at;
    end if;
    local_end := local_candidate::date + quiet_end;
  else
    if local_time >= quiet_end and local_time < quiet_start then
      return candidate_at;
    end if;
    local_end := case
      when local_time >= quiet_start then local_candidate::date + interval '1 day' + quiet_end
      else local_candidate::date + quiet_end
    end;
  end if;

  return app_private.zone_instant(local_end, target_timezone);
end;
$$;

revoke all on function
  app_private.notification_email_plan(timestamptz),
  app_private.defer_for_quiet_hours(timestamptz, text, boolean, time, time, boolean)
from public, anon, authenticated, service_role;
grant execute on function
  app_private.notification_email_plan(timestamptz),
  app_private.defer_for_quiet_hours(timestamptz, text, boolean, time, time, boolean)
to postgres;
$bg_20261016090200_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261016090200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016090200'
  );
begin
  if encode(sha256(convert_to(part_20261016090200, 'UTF8')), 'hex')
    is distinct from '99211357854216067fca5d81e0ad40e33334631d5667fee1b181cdb56cde2809' then
    raise exception 'stop: 20261016090200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016090200;
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

  -- Each function is the migration's, with the attributes, privileges and comment it had.
  for fn in
    select * from (values
      ('app_private.notification_email_plan(timestamp with time zone)', 'c261d9f075f060540e092803e50a2e2d', 'b686fb3d2000279349c4d1afbb9f7edf', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.defer_for_quiet_hours(timestamp with time zone,text,boolean,time without time zone,time without time zone,boolean)', 'e98342fc4a2214dcc00ab817effadcd5', '691fac43285139e7a650a92bb60adcb5', false, 's', 'plpgsql', true, '{}'::text[])
    ) v(sig, old_md5, new_md5, secdef, vol, lang, search_path_empty, holders)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, l.lanname into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if md5(def.prosrc) is distinct from fn.new_md5 then
      problems := problems || (fn.sig || ' is not the new source')::text;
    end if;
    if def.prosecdef <> fn.secdef or def.provolatile <> fn.vol or def.lanname <> fn.lang
      or (def.proconfig is not distinct from array['search_path=""']) <> fn.search_path_empty then
      problems := problems || (fn.sig || ' changed its attributes')::text;
    end if;
  end loop;
  for fn in
    select v.sig, v.required, v.forbidden from (values
      ('app_private.notification_email_plan(timestamp with time zone)', '["app_private.morocco_local(","app_private.morocco_local_date("]'::jsonb, '["local_zone","Africa/Casablanca","at time zone"]'::jsonb),
      ('app_private.defer_for_quiet_hours(timestamp with time zone,text,boolean,time without time zone,time without time zone,boolean)', '["app_private.zone_local(","app_private.zone_instant("]'::jsonb, '["at time zone"]'::jsonb)
    ) v(sig, required, forbidden)
  loop
    select p.prosrc into def from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    for needle in select jsonb_array_elements_text(fn.required) loop
      if position(needle in def.prosrc) = 0 then
        problems := problems || (fn.sig || ' no longer contains ' || needle)::text;
      end if;
    end loop;
    for needle in select jsonb_array_elements_text(fn.forbidden) loop
      if position(needle in def.prosrc) > 0 then
        problems := problems || (fn.sig || ' still contains ' || needle)::text;
      end if;
    end loop;
  end loop;
  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, '-') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '-'), ',' order by p.oid::regprocedure::text), '')) into baseline
  from pg_catalog.pg_proc p
  where p.oid in (to_regprocedure('app_private.notification_email_plan(timestamp with time zone)'), to_regprocedure('app_private.defer_for_quiet_hours(timestamp with time zone,text,boolean,time without time zone,time without time zone,boolean)'));
  if baseline is distinct from current_setting('bg.morocco_acl_comment_before', true) then
    problems := problems || 'the privileges or the comments of a replaced function moved'::text;
  end if;

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
  if app_private.defer_for_quiet_hours(timestamptz '2026-10-15 22:30+00', 'Africa/Casablanca', true, time '22:00', time '07:00', false)
       is distinct from timestamptz '2026-10-16 07:00+00'
    or app_private.defer_for_quiet_hours(timestamptz '2026-10-15 21:30+00', 'Africa/Casablanca', true, time '22:00', time '07:00', false)
       is distinct from timestamptz '2026-10-15 21:30+00'
    or app_private.defer_for_quiet_hours(timestamptz '2026-10-15 21:30+00', 'Europe/Paris', true, time '22:00', time '07:00', false)
       is distinct from timestamptz '2026-10-16 05:00+00' then
    raise exception 'stop: quiet hours do not follow Morocco''s clock';
  end if;

  if (select coalesce((select md5(jsonb_build_array(s.mode, s.test_user_ids, s.functions_base_url, s.football_live_refresh_enabled)::text) from app_private.notification_email_settings s limit 1), '')) is distinct from current_setting('bg.morocco_watched_0_before', true) then
    problems := problems || 'notification_email_settings moved'::text;
  end if;
  if (select coalesce((select md5(jsonb_build_array(s.mode, s.test_user_ids, s.functions_base_url)::text) from app_private.notification_push_settings s limit 1), '')) is distinct from current_setting('bg.morocco_watched_1_before', true) then
    problems := problems || 'notification_push_settings moved'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j) is distinct from current_setting('bg.morocco_cron_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090200') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'after: the planner and quiet hours check out';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090200')
    then 'Applied. Migration 20261016090200 is recorded; morocco time email planner quiet hours is in place. Run the post-checks in docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md.'
  else 'Rehearsal passed. Nothing was saved.'
      || ' A 22:00-07:00 quiet window in Africa/Casablanca, asked at 22:30Z on 2026-10-15, ends at '
      || app_private.defer_for_quiet_hours(timestamptz '2026-10-15 22:30+00', 'Africa/Casablanca', true, time '22:00', time '07:00', false)::text
      || ' by the function as it stands now; the right answer is 2026-10-16 07:00:00+00 (helper: '
      || app_private.zone_instant(timestamp '2026-10-16 07:00', 'Africa/Casablanca')::text || ').'
      || ' Change rollback; to commit; and run again.'
end as result;
