-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261016090100_morocco_time_deadline_text
-- (Morocco's clock in the database; docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md):
-- The Fantasy deadline printed in a notification follows Morocco's clock. It replaces TWO
-- functions, each with only the zone expression changed: app_private.notification_push_fanout (the
-- push and in-app text of deadline_24h and deadline_1h) and app_private.notification_email_fanout
-- (the in-app / e-mail text of deadline_24h). Before: a deadline of 18:30Z printed '12/10 19:30',
-- an hour LATE. After: '12/10 18:30'.
--
-- THE RULE. Morocco is UTC+0 all year from 2026-09-20T01:00:00Z (decree n° 2.26.530; IANA tz 2026c),
-- confirmed by the owner on 2026-10-15. The application already follows it
-- (src/lib/morocco-time.ts); this database still carries older time-zone data (UTC+1), so a
-- time the database turns into Moroccan clock time is an hour off from what the person sees.
--
-- WHEN
--   After 20261016090000 (the helpers) is committed. Before push or e-mail goes to real readers:
--   no deadline notification has been written since 2026-09-20 (e-mail is off, push is testers
--   only), so nothing wrong is in the inbox yet. Any time of day; well under a second.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing: the script only replaces the definition of two functions (pg_proc) and
--   records itself in supabase_migrations.schema_migrations. It writes no notification, event,
--   delivery or setting table. The jobs that CALL the functions only see the new text on their
--   next call:
--   * notification-push-tick (every minute): notification_push_tick -> notification_push_plan /
--     notification_push_fanout, and notification_email_plan while e-mail is not the one planning;
--   * notification-email-tick (every 5 minutes): notification_email_tick -> notification_email_plan,
--     notification_email_fanout.
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
--     (md5 of its source), is not security definer with an empty search_path, or is callable by
--     anyone but the owner;
--   * records the migration file in supabase_migrations.schema_migrations and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: each source is the new one, has no raw
--     `at time zone audience.timezone` left and calls app_private.zone_local; attributes,
--     privileges and comments are unchanged; the deadline text expression gives '12/10 18:30' for
--     18:30Z on 2026-10-12; the e-mail and push switches and the cron job list are where they were.
--     It never calls either fan-out (they write), so it sends nothing.
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090100') then
    raise exception 'stop: migration 20261016090100 is already recorded as applied';
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
      ('app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)', '6344301a85a05e3bec9a234378f2f2f2', '550d18a328ac8d1234df396cf5dd9b05', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)', 'cc529d2660ac94e292e0635e4f0dcceb', '93eafdf20ad7fde193a4f4745a201342', true, 'v', 'plpgsql', true, '{}'::text[])
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
    ('app_private.defer_for_quiet_hours'),
    ('app_private.notification_email_event_is_stale'),
    ('app_private.notification_push_event_is_stale'),
    ('app_private.notification_push_goal_alert_reached'),
    ('app_private.notification_push_rank'),
    ('app_private.notification_push_topic'),
    ('app_private.pepites_weekly_email_allowed'),
    ('app_private.render_notification_template')
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
  where p.oid in (to_regprocedure('app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)'), to_regprocedure('app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)'));
  perform set_config('bg.morocco_acl_comment_before', baseline, true);
  baseline := (select coalesce((select md5(to_jsonb(s)::text) from app_private.notification_email_settings s limit 1), ''));
  perform set_config('bg.morocco_watched_0_before', baseline, true);
  baseline := (select coalesce((select md5(to_jsonb(s)::text) from app_private.notification_push_settings s limit 1), ''));
  perform set_config('bg.morocco_watched_1_before', baseline, true);
  -- Who would see the new text: accounts by notification zone (counts only).
  raise notice 'accounts with notification zone Africa/Casablanca: %, other zones: %',
    (select count(*) from app.user_preferences where notification_timezone = 'Africa/Casablanca'),
    (select count(*) from app.user_preferences where notification_timezone <> 'Africa/Casablanca');
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261016090100, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016090100',
  'morocco_time_deadline_text',
  array[$bg_20261016090100_file$-- The Fantasy deadline printed in a notification follows Morocco's clock.
--
-- WHAT WAS WRONG. The push and the in-app/e-mail fan-outs write the text of the
-- Fantasy deadline reminders (`deadline_24h`: 'DD/MM HH24:MI'; `deadline_1h`:
-- 'HH24:MI') with `deadlineAt at time zone audience.timezone`. Every account's
-- zone is 'Africa/Casablanca' unless the person changed it, and the databases'
-- own Africa/Casablanca data still say UTC+1 after 2026-09-20 (the app's rule:
-- UTC+0 from 2026-09-20T01:00:00Z, 20261016090000). A deadline of 18:30Z
-- (2026-10-12) was therefore printed '12/10 19:30': an hour LATE, which is the
-- direction that makes a reader miss the deadline. No such notification has been
-- sent since the change (e-mail is off, push is testers-only); this is fixed
-- before either reaches real readers.
--
-- WHAT THIS CHANGES. Two functions, each the latest definition with only the
-- zone expression replaced: `deadlineAt at time zone audience.timezone` becomes
-- `app_private.zone_local(deadlineAt, audience.timezone)`, which gives the app's
-- rule for Africa/Casablanca and PostgreSQL's own answer for any other zone.
--   * app_private.notification_push_fanout   (20261005135000; two places)
--   * app_private.notification_email_fanout  (20260926110100; one place)
-- Signatures, security attributes, search_path and privileges are unchanged;
-- nothing else in either body is touched. Notifications already written keep
-- their text.
--
-- Depends on 20261016090000 (the helpers).
--
-- NOT RUN against any shared database in the authoring session. The text
-- expression was run on a local PostgreSQL 16 whose Africa/Casablanca data are
-- the old ones (see docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md).

do $$
begin
  if to_regprocedure('app_private.zone_local(timestamp with time zone, text)') is null then
    raise exception 'morocco_time_helpers_missing: apply 20261016090000 first';
  end if;
end $$;

create or replace function app_private.notification_push_fanout(
  p_now timestamptz,
  p_mode text,
  p_test_user_ids uuid[],
  p_activated_at timestamptz,
  p_email_mode text,
  p_email_activated_at timestamptz,
  p_budget integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  push_only constant text[] := array['goal', 'goal_cancelled', 'full_time', 'deadline_1h'];
  target app_private.notification_events%rowtype;
  budget integer := greatest(p_budget, 0);
  batch_limit integer;
  batch_users integer;
  batch_queued integer;
  total_events integer := 0;
  total_users integer := 0;
  total_queued integer := 0;
  finished boolean;
  home_team uuid;
  away_team uuid;
  goal_key text;
begin
  if p_mode not in ('testers', 'live') or p_activated_at is null then
    return jsonb_build_object('events', 0, 'users', 0, 'queued', 0);
  end if;

  -- A moment of push's own whose time has passed is closed, never pushed late.
  update app_private.notification_events event set
    status = 'cancelled',
    completed_at = greatest(p_now, event.received_at),
    sanitized_error_code = 'push_window_passed'
  where event.event_type::text = any(push_only)
    and event.status in ('pending', 'processing')
    and event.received_at >= p_activated_at
    and app_private.notification_push_event_is_stale(event, p_now);

  for target in
    select event.* from app_private.notification_events event
    where event.received_at >= p_activated_at
      and (
        (
          event.event_type::text in ('match_starting', 'deadline_24h')
          and event.status in ('pending', 'processing', 'completed')
          -- After the email fan-out is done with it; or at once when email is
          -- not going to fan it out at all.
          and (
            event.status = 'completed'
            or p_email_mode = 'off'
            or p_email_activated_at is null
            or event.received_at < p_email_activated_at
          )
        )
        or (event.event_type::text = any(push_only) and event.status = 'pending')
      )
      and not app_private.notification_push_event_is_stale(event, p_now)
    order by app_private.notification_push_rank(event.event_type::text), event.received_at, event.id
  loop
    exit when budget <= 0;
    total_events := total_events + 1;

    home_team := null;
    away_team := null;
    if target.event_type::text in ('match_starting', 'goal', 'goal_cancelled', 'full_time') then
      select fixture.home_team_id, fixture.away_team_id into home_team, away_team
      from app.fixtures fixture where fixture.id = target.source_entity_id;
    end if;
    -- A correction goes only to the phones that were told the goal.
    goal_key := case when target.event_type = 'goal_cancelled'
      then replace(target.deduplication_key, 'push:goal_cancelled:', 'push:goal:') end;

    finished := false;
    loop
      exit when budget <= 0;
      batch_limit := least(budget, 500);

      with audience as (
        select profile.id as user_id, profile.preferred_language as language,
          preference.notification_timezone as timezone,
          preference.quiet_hours_enabled, preference.quiet_hours_start, preference.quiet_hours_end
        from app.profiles profile
        join app.user_preferences preference on preference.user_id = profile.id
        join auth.users auth_user on auth_user.id = profile.id
        where profile.deleted_at is null
          and preference.notifications_enabled
          and preference.push_notifications_enabled
          and auth_user.deleted_at is null
          and not coalesce(auth_user.is_anonymous, false)
          and (auth_user.banned_until is null or auth_user.banned_until < p_now)
          and (p_mode = 'live' or profile.id = any(p_test_user_ids))
          and case app_private.notification_push_topic(target.event_type::text)
            when 'match' then preference.match_alerts
            when 'fantasy' then preference.fantasy_deadline_reminders
            else false
          end
          -- Match alerts are for fans only.
          and (
            target.event_type::text not in ('match_starting', 'goal', 'full_time')
            or preference.favorite_team_id in (home_team, away_team)
            or exists (select 1 from app.followed_teams followed
              where followed.user_id = profile.id and followed.team_id in (home_team, away_team))
            or exists (select 1 from app.notification_subscriptions subscription
              where subscription.user_id = profile.id and subscription.enabled
                and (subscription.fixture_id = target.source_entity_id
                  or subscription.team_id in (home_team, away_team)))
          )
          and exists (
            select 1 from app.notification_templates template
            where template.template_key = target.event_type::text
              and template.channel = 'in_app'
              and template.language = profile.preferred_language
              and template.active
          )
          -- Someone still to do: a working device with no push for this moment
          -- yet (and, for a correction, one that was told the goal). Re-running
          -- finds nobody; a phone registered later is found.
          and exists (
            select 1
            from app.device_registrations device
            join app_private.push_destinations destination
              on destination.device_registration_id = device.id
            where device.user_id = profile.id
              and device.enabled and device.invalidated_at is null
              and device.push_provider::text in ('fcm', 'apns')
              and (
                goal_key is null
                or app_private.notification_push_goal_alert_reached(goal_key, profile.id, device.id)
              )
              and not exists (
                select 1
                from app.notification_deliveries delivery
                join app.notifications notification on notification.id = delivery.notification_id
                where notification.event_id = target.id
                  and notification.user_id = profile.id
                  and delivery.channel = 'push'
                  and delivery.device_registration_id = device.id
              )
          )
        order by profile.id
        limit batch_limit
      ),
      rendered as (
        select audience.user_id, audience.language, template.id as template_id, template.category,
          template.title_template, template.body_template, template.required_variables,
          case target.event_type::text
            when 'match_starting' then jsonb_build_object(
              'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
              'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''),
              'minutes', coalesce(target.safe_payload ->> 'minutes', '60'))
            when 'deadline_24h' then jsonb_build_object(
              'gameweek', target.safe_payload -> 'gameweek' ->> 'sequence',
              'deadline', to_char(
                app_private.zone_local(((target.safe_payload ->> 'deadlineAt')::timestamptz), audience.timezone),
                'DD/MM HH24:MI'))
            when 'deadline_1h' then jsonb_build_object(
              'gameweek', coalesce(target.safe_payload -> 'gameweek' ->> 'sequence', ''),
              'deadline', to_char(
                app_private.zone_local(((target.safe_payload ->> 'deadlineAt')::timestamptz), audience.timezone),
                'HH24:MI'))
            when 'goal' then jsonb_build_object(
              'team', coalesce(target.safe_payload -> 'goal' -> 'team' -> 'name' ->> audience.language::text, ''),
              'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
              'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''),
              'home_score', coalesce(target.safe_payload -> 'fixture' ->> 'homeScore', ''),
              'away_score', coalesce(target.safe_payload -> 'fixture' ->> 'awayScore', ''))
            when 'goal_cancelled' then jsonb_build_object(
              'team', coalesce(target.safe_payload -> 'goal' -> 'team' -> 'name' ->> audience.language::text, ''),
              'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
              'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''))
            when 'full_time' then jsonb_build_object(
              'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
              'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''),
              'home_score', coalesce(target.safe_payload -> 'fixture' ->> 'homeScore', ''),
              'away_score', coalesce(target.safe_payload -> 'fixture' ->> 'awayScore', ''))
            else '{}'::jsonb
          end as variables
        from audience
        join app.notification_templates template
          on template.template_key = target.event_type::text
         and template.channel = 'in_app'
         and template.language = audience.language
         and template.active
      ),
      -- Only for readers email did not reach: a reader who already has the
      -- moment's notification keeps that one.
      new_notifications as (
        insert into app.notifications (
          user_id, event_id, template_id, notification_type, category, priority, language,
          title, body, deep_link_target, deep_link_entity_id, source_domain, source_entity_id,
          available_at
        )
        select rendered.user_id, target.id, rendered.template_id, target.event_type, rendered.category,
          'normal', rendered.language,
          app_private.render_notification_template(rendered.title_template, rendered.required_variables, rendered.variables),
          app_private.render_notification_template(rendered.body_template, rendered.required_variables, rendered.variables),
          case
            when target.event_type::text in ('match_starting', 'goal', 'goal_cancelled', 'full_time') then 'match_detail'
            when target.event_type::text in ('deadline_24h', 'deadline_1h') then 'fantasy_transfers'
            else 'none'
          end::app.notification_deep_link_target,
          case
            when target.event_type::text in ('match_starting', 'goal', 'goal_cancelled', 'full_time')
              then target.source_entity_id
          end,
          target.source_domain, target.source_entity_id, p_now
        from rendered
        on conflict (event_id, user_id) do nothing
        returning id, user_id
      ),
      new_in_app as (
        insert into app.notification_deliveries (
          notification_id, channel, provider_key, status, attempt_count, sent_at, delivered_at
        )
        select id, 'in_app', 'database', 'delivered', 1, p_now, p_now from new_notifications
        on conflict do nothing
        returning 1
      ),
      -- The row each reader has for this moment: the one just made, or the one
      -- the email fan-out made earlier (not visible to this statement's
      -- inserts, so the two sets never overlap).
      moment as (
        select id as notification_id, user_id from new_notifications
        union all
        select notification.id, notification.user_id
        from app.notifications notification
        where notification.event_id = target.id
          and notification.user_id in (select user_id from audience)
      ),
      queued as (
        insert into app.notification_deliveries (
          notification_id, channel, device_registration_id, provider_key, status, next_retry_at
        )
        select moment.notification_id, 'push', device.id, device.push_provider::text, 'pending',
          case when quiet.until > p_now then quiet.until end
        from moment
        join audience on audience.user_id = moment.user_id
        join app.device_registrations device
          on device.user_id = moment.user_id
         and device.enabled and device.invalidated_at is null
         and device.push_provider::text in ('fcm', 'apns')
        join app_private.push_destinations destination
          on destination.device_registration_id = device.id
        cross join lateral (
          select app_private.defer_for_quiet_hours(
            p_now, audience.timezone, audience.quiet_hours_enabled,
            audience.quiet_hours_start, audience.quiet_hours_end, false
          ) as until
        ) quiet
        where goal_key is null
          or app_private.notification_push_goal_alert_reached(goal_key, moment.user_id, device.id)
        on conflict do nothing
        returning 1
      )
      select (select count(*) from audience), (select count(*) from queued)
      into batch_users, batch_queued;

      budget := budget - batch_users;
      total_users := total_users + batch_users;
      total_queued := total_queued + batch_queued;
      -- Done with this moment when the batch was not full, or when nothing
      -- could be queued (which would only repeat).
      if batch_users < batch_limit or batch_queued = 0 then
        finished := true;
        exit;
      end if;
    end loop;

    -- A moment of push's own that has been through every reader is finished.
    -- While only testers are on it stays open, so it still reaches everyone if
    -- push goes live before its time is up (it is closed when that passes).
    if finished and p_mode = 'live' and target.event_type::text = any(push_only) then
      update app_private.notification_events set
        status = 'completed',
        completed_at = greatest(p_now, received_at)
      where id = target.id and status = 'pending';
    end if;
  end loop;

  return jsonb_build_object('events', total_events, 'users', total_users, 'queued', total_queued);
end;
$$;

create or replace function app_private.notification_email_fanout(
  p_now timestamptz,
  p_mode text,
  p_test_user_ids uuid[],
  p_activated_at timestamptz,
  p_budget integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_types constant app.notification_type[] := array[
    'matchday_preview', 'matchday_results', 'round_preview',
    'match_starting', 'deadline_24h', 'gameweek_finalized', 'pepites_weekly'
  ]::app.notification_type[];
  target app_private.notification_events%rowtype;
  run app_private.notification_fanout_runs%rowtype;
  budget integer := greatest(p_budget, 0);
  batch_limit integer;
  batch_audience integer;
  created_count integer;
  last_user uuid;
  total_created integer := 0;
  cancelled integer := 0;
  completed integer := 0;
  home_team uuid;
  away_team uuid;
  pepites_allowed boolean;
begin
  if p_mode not in ('test', 'live') or p_activated_at is null then
    return jsonb_build_object('created', 0, 'cancelled', 0, 'completed', 0);
  end if;

  -- Moments whose window has passed are closed, never mailed late.
  with stale as (
    update app_private.notification_events event set
      status = 'cancelled',
      completed_at = greatest(p_now, event.received_at),
      sanitized_error_code = 'email_window_passed'
    where event.event_type = any(email_types)
      and event.status in ('pending', 'processing')
      and event.received_at >= p_activated_at
      and app_private.notification_email_event_is_stale(event, p_now)
    returning 1
  )
  select count(*) into cancelled from stale;

  for target in
    select event.* from app_private.notification_events event
    where event.event_type = any(email_types)
      and event.status in ('pending', 'processing')
      and event.received_at >= p_activated_at
    order by event.received_at, event.id
    for update skip locked
  loop
    exit when budget <= 0;

    insert into app_private.notification_fanout_runs (event_id, status, claimed_at, claim_expires_at, started_at)
    values (target.id, 'processing', p_now, p_now + interval '10 minutes', p_now)
    on conflict (event_id) do update set
      status = 'processing',
      claimed_at = p_now,
      claim_expires_at = p_now + interval '10 minutes',
      started_at = coalesce(app_private.notification_fanout_runs.started_at, p_now)
    returning * into run;
    update app_private.notification_events set
      status = 'processing',
      processing_started_at = coalesce(processing_started_at, p_now)
    where id = target.id and status = 'pending';

    home_team := null;
    away_team := null;
    if target.event_type = 'match_starting' then
      select fixture.home_team_id, fixture.away_team_id into home_team, away_team
      from app.fixtures fixture where fixture.id = target.source_entity_id;
    end if;
    -- Pépites: public, and the edition still the week's published one.
    pepites_allowed := target.event_type = 'pepites_weekly'
      and app_private.pepites_weekly_email_allowed(target.source_entity_id);

    batch_limit := least(budget, 500);

    with audience as (
      select profile.id as user_id, profile.preferred_language as language,
        preference.notification_timezone as timezone
      from app.profiles profile
      join app.user_preferences preference on preference.user_id = profile.id
      join auth.users auth_user on auth_user.id = profile.id
      where profile.deleted_at is null
        and (run.checkpoint_user_id is null or profile.id > run.checkpoint_user_id)
        and preference.notifications_enabled
        and preference.email_notifications_enabled
        and auth_user.email is not null
        and auth_user.email_confirmed_at is not null
        and auth_user.deleted_at is null
        and not coalesce(auth_user.is_anonymous, false)
        and (auth_user.banned_until is null or auth_user.banned_until < p_now)
        and (p_mode = 'live' or profile.id = any(p_test_user_ids))
        and case target.event_type::text
          when 'matchday_preview' then preference.match_alerts
          when 'matchday_results' then preference.match_alerts
          when 'round_preview' then preference.match_alerts
          when 'match_starting' then preference.match_alerts and (
            preference.favorite_team_id in (home_team, away_team)
            or exists (select 1 from app.followed_teams followed
              where followed.user_id = profile.id and followed.team_id in (home_team, away_team))
            or exists (select 1 from app.notification_subscriptions subscription
              where subscription.user_id = profile.id and subscription.enabled
                and (subscription.fixture_id = target.source_entity_id
                  or subscription.team_id in (home_team, away_team))))
          when 'deadline_24h' then preference.fantasy_deadline_reminders
          when 'gameweek_finalized' then preference.fantasy_deadline_reminders
            and profile.id = target.target_user_id
            -- A corrected gameweek emits a new event; the recap is sent once.
            and not exists (
              select 1 from app.notifications earlier
              where earlier.user_id = profile.id
                and earlier.notification_type = 'gameweek_finalized'
                and earlier.source_entity_id = target.source_entity_id
                and earlier.event_id <> target.id
            )
          -- Explicit opt-in only. A correction goes only to readers who have
          -- no Pépites email for that week already sent (or possibly sent).
          when 'pepites_weekly' then preference.pepites_weekly_email and pepites_allowed
            and (target.safe_payload ->> 'correctsEditionId' is null or not exists (
              select 1 from app.notifications earlier
              join app_private.notification_events earlier_event on earlier_event.id = earlier.event_id
              join app.notification_deliveries earlier_delivery
                on earlier_delivery.notification_id = earlier.id and earlier_delivery.channel = 'email'
              where earlier.user_id = profile.id
                and earlier.notification_type = 'pepites_weekly'
                and earlier.event_id <> target.id
                and earlier_event.safe_payload ->> 'seasonId' = target.safe_payload ->> 'seasonId'
                and earlier_event.safe_payload ->> 'week' = target.safe_payload ->> 'week'
                and (earlier_delivery.status in ('sent', 'delivered')
                  or (earlier_delivery.status = 'cancelled'
                    and earlier_delivery.stable_error_code = 'possibly_sent'))
            ))
          else false
        end
      order by profile.id
      limit batch_limit
    ),
    rendered as (
      select audience.user_id, audience.language, template.id as template_id, template.category,
        template.title_template, template.body_template, template.required_variables,
        case target.event_type::text
          when 'round_preview' then jsonb_build_object('round', coalesce(
            target.safe_payload -> 'round' ->> 'number', target.safe_payload -> 'round' ->> 'name'))
          when 'match_starting' then jsonb_build_object(
            'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
            'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''),
            'minutes', coalesce(target.safe_payload ->> 'minutes', '60'))
          when 'deadline_24h' then jsonb_build_object(
            'gameweek', target.safe_payload -> 'gameweek' ->> 'sequence',
            'deadline', to_char(
              app_private.zone_local(((target.safe_payload ->> 'deadlineAt')::timestamptz), audience.timezone),
              'DD/MM HH24:MI'))
          when 'gameweek_finalized' then jsonb_build_object(
            'gameweek', target.safe_payload ->> 'gameweek',
            'points', target.safe_payload ->> 'points')
          when 'pepites_weekly' then jsonb_build_object('week', target.safe_payload ->> 'week')
          else '{}'::jsonb
        end as variables
      from audience
      join app.notification_templates template
        on template.template_key = target.event_type::text
       and template.channel = 'in_app'
       and template.language = audience.language
       and template.active
    ),
    inserted as (
      insert into app.notifications (
        user_id, event_id, template_id, notification_type, category, priority, language,
        title, body, deep_link_target, deep_link_entity_id, source_domain, source_entity_id,
        available_at
      )
      select rendered.user_id, target.id, rendered.template_id, target.event_type, rendered.category,
        'normal', rendered.language,
        app_private.render_notification_template(rendered.title_template, rendered.required_variables, rendered.variables),
        app_private.render_notification_template(rendered.body_template, rendered.required_variables, rendered.variables),
        case target.event_type::text
          when 'match_starting' then 'match_detail'
          when 'deadline_24h' then 'fantasy_transfers'
          when 'gameweek_finalized' then 'fantasy_points'
          else 'none'
        end::app.notification_deep_link_target,
        case when target.event_type = 'match_starting' then target.source_entity_id end,
        target.source_domain, target.source_entity_id, p_now
      from rendered
      on conflict (event_id, user_id) do nothing
      returning id
    ),
    in_app as (
      insert into app.notification_deliveries (
        notification_id, channel, provider_key, status, attempt_count, sent_at, delivered_at
      )
      select id, 'in_app', 'database', 'delivered', 1, p_now, p_now from inserted
      on conflict do nothing
      returning 1
    ),
    email as (
      insert into app.notification_deliveries (notification_id, channel, provider_key, status)
      select id, 'email', 'resend', 'pending' from inserted
      on conflict do nothing
      returning 1
    )
    select
      (select count(*) from audience),
      (select count(*) from email),
      (select audience.user_id from audience order by audience.user_id desc limit 1)
    into batch_audience, created_count, last_user;

    budget := budget - greatest(created_count, 0);
    total_created := total_created + created_count;

    if batch_audience < batch_limit then
      update app_private.notification_fanout_runs set
        status = 'completed',
        checkpoint_user_id = coalesce(last_user, checkpoint_user_id),
        audience_count = audience_count + batch_audience,
        notifications_created = notifications_created + created_count,
        deliveries_queued = deliveries_queued + created_count,
        completed_at = p_now,
        claimed_at = null,
        claim_expires_at = null
      where event_id = target.id;
      update app_private.notification_events set
        status = 'completed', completed_at = greatest(p_now, received_at)
      where id = target.id;
      completed := completed + 1;
    else
      update app_private.notification_fanout_runs set
        checkpoint_user_id = last_user,
        audience_count = audience_count + batch_audience,
        notifications_created = notifications_created + created_count,
        deliveries_queued = deliveries_queued + created_count
      where event_id = target.id;
    end if;
  end loop;

  return jsonb_build_object('created', total_created, 'cancelled', cancelled, 'completed', completed);
end;
$$;

revoke all on function
  app_private.notification_push_fanout(timestamptz, text, uuid[], timestamptz, text, timestamptz, integer),
  app_private.notification_email_fanout(timestamptz, text, uuid[], timestamptz, integer)
from public, anon, authenticated, service_role;
grant execute on function
  app_private.notification_push_fanout(timestamptz, text, uuid[], timestamptz, text, timestamptz, integer),
  app_private.notification_email_fanout(timestamptz, text, uuid[], timestamptz, integer)
to postgres;
$bg_20261016090100_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261016090100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016090100'
  );
begin
  if encode(sha256(convert_to(part_20261016090100, 'UTF8')), 'hex')
    is distinct from 'dd9ad2ddbdfce4f6368b297223abe8f8363ea089161b3c9466fd974fc3d0d5b5' then
    raise exception 'stop: 20261016090100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016090100;
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
      ('app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)', '6344301a85a05e3bec9a234378f2f2f2', '550d18a328ac8d1234df396cf5dd9b05', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)', 'cc529d2660ac94e292e0635e4f0dcceb', '93eafdf20ad7fde193a4f4745a201342', true, 'v', 'plpgsql', true, '{}'::text[])
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
      ('app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)', '["app_private.zone_local("]'::jsonb, '["at time zone audience.timezone"]'::jsonb),
      ('app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)', '["app_private.zone_local("]'::jsonb, '["at time zone audience.timezone"]'::jsonb)
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
  where p.oid in (to_regprocedure('app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)'), to_regprocedure('app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)'));
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
  if to_char(app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca'), 'DD/MM HH24:MI') is distinct from '12/10 18:30'
    or to_char(app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca'), 'HH24:MI') is distinct from '18:30' then
    raise exception 'stop: the deadline text is not the one the application shows';
  end if;

  if (select coalesce((select md5(to_jsonb(s)::text) from app_private.notification_email_settings s limit 1), '')) is distinct from current_setting('bg.morocco_watched_0_before', true) then
    problems := problems || 'notification_email_settings moved'::text;
  end if;
  if (select coalesce((select md5(to_jsonb(s)::text) from app_private.notification_push_settings s limit 1), '')) is distinct from current_setting('bg.morocco_watched_1_before', true) then
    problems := problems || 'notification_push_settings moved'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j) is distinct from current_setting('bg.morocco_cron_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090100') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'after: the deadline text check out';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090100')
    then 'Applied. Migration 20261016090100 is recorded; morocco time deadline text is in place. Run the post-checks in docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md.'
  else 'Rehearsal passed. Nothing was saved.'
      || ' For a reader whose zone is Africa/Casablanca a deadline of 18:30Z on 2026-10-12 reads '
      || to_char(app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca'), 'DD/MM HH24:MI')
      || ' by the helper, and '
      || to_char(timestamptz '2026-10-12 18:30+00' at time zone 'Africa/Casablanca', 'DD/MM HH24:MI')
      || ' by the raw zone the functions use until this is committed.'
      || ' Change rollback; to commit; and run again.'
end as result;
