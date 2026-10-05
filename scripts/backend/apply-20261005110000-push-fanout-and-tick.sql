-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261005110000_push_fanout_and_tick: the step that creates push alerts and the
-- one-minute job that wakes the sender. It adds app_private.notification_push_fanout
-- (queues a push per phone for the kick-off reminder and the 24-hour Fantasy
-- deadline), app_private.notification_push_tick, an owner-only function that
-- sets the address the sender is woken at, three small columns on the push
-- switch's table, and the pg_cron job 'notification-push-tick'.
--
-- WHEN
--   After the pull request that adds this file is merged and AFTER
--   20261005100000_push_delivery_claim has been applied. Any quiet moment; not
--   at minute 12 of an hour (the Fantasy season orchestrator). It alters one
--   one-row table and adds functions and a job. Nothing a reader can see
--   changes: the job returns at once while the push switch is OFF, and this
--   script REFUSES to run if the switch is not off.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now
--      (AGENTS.md, "Before writing": no GitHub Actions run in progress, no
--      pg_cron job mid-run, no other query running).
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where the push switch is on, or where any of the
--     objects it creates already exists, or where the pieces it builds on are
--     missing (the push claim of 20261005100000, and the email planner, fan-out
--     staleness check, quiet-hours and template helpers it reuses);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the three functions exist and
--     only the database owner can run them, the push switch is still one row,
--     off, with its new columns, the job is scheduled once every minute, the
--     tick answers "off" and a fan-out asked to run while off does nothing
--     (the tick's own note of its last run is rolled back with the check).
--   Turning push on is a separate, later step
--   (app_private.notification_push_configure) and needs the sender's secrets
--   and the Edge Function deployed first.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  needed text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261005110000') then
    raise exception 'stop: migration 20261005110000 is already recorded as applied';
  end if;
  if to_regclass('app_private.notification_push_settings') is null
    or to_regprocedure('app_private.notification_push_topic(text)') is null
    or to_regprocedure('api.service_claim_push_deliveries(integer,integer)') is null then
    raise exception 'stop: the push claim (20261005100000) is not applied yet';
  end if;
  if (select mode from app_private.notification_push_settings where id) is distinct from 'off' then
    raise exception 'stop: push is switched on; switch it off (app_private.notification_push_configure(''off'')) before applying this';
  end if;
  foreach needed in array array[
    'app_private.notification_email_settings', 'app_private.notification_events',
    'app.notifications', 'app.notification_deliveries', 'app.notification_subscriptions',
    'app.followed_teams', 'app.device_registrations', 'app_private.push_destinations',
    'app.user_preferences', 'app.profiles', 'app.fixtures'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.notification_email_plan(timestamptz)',
    'app_private.notification_email_event_is_stale(app_private.notification_events,timestamptz)',
    'app_private.invoke_scheduled_function(text,text,jsonb)',
    'app_private.defer_for_quiet_hours(timestamptz,text,boolean,time without time zone,time without time zone,boolean)',
    'app_private.render_notification_template(text,text[],jsonb)'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if exists (select 1 from information_schema.columns
    where table_schema = 'app_private' and table_name = 'notification_push_settings'
      and column_name in ('functions_base_url', 'last_tick_at', 'last_outcome')) then
    raise exception 'stop: the push switch already has one of the columns this adds';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname in ('notification_push_fanout', 'notification_push_tick',
        'notification_push_set_functions_url')) then
    raise exception 'stop: one of the push fan-out functions already exists';
  end if;
  if exists (select 1 from cron.job where jobname = 'notification-push-tick') then
    raise exception 'stop: the job notification-push-tick already exists';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261005110000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261005110000',
  'push_fanout_and_tick',
  array[$bg_20261005110000_file$-- Push alerts, sending side, step 2: creating the alerts, and waking the sender.
--
-- Step 1 (20261005100000) gave the push dispatcher what it may claim. This
-- gives it something to claim, for the two moments that already exist for
-- email: the kick-off reminder (`match_starting`) and the 24-hour Fantasy
-- deadline (`deadline_24h`). Like step 1 it changes nothing a reader can see
-- while the push switch is OFF, which is how it ships: the one-minute tick
-- below returns at once.
--
--   * app_private.notification_push_fanout: for each planned moment, queues one
--     push delivery per device of every reader who wants it.
--   * app_private.notification_push_tick (pg_cron, every minute): plans the
--     moments when the email tick will not, fans them out, and wakes the Edge
--     Function only when there is something to send.
--
-- Push rides the same planned moments, notifications and in-app inbox as email,
-- but not its on/off switch, and it must never cost anyone an email or show
-- anyone the same moment twice. So:
--
--   * A moment's notification row is the one the email fan-out creates, when
--     the email fan-out is running for it. Push waits until the email fan-out
--     has finished with the moment (the event is `completed`), then attaches
--     its deliveries to the rows that exist, and creates the row itself only for
--     readers email did not reach (push on, email off). One row per reader per
--     moment, so the inbox shows it once and no email is ever skipped.
--   * When email is switched off nobody else will fan a moment out, so push
--     does not wait, and the tick plans the moments itself (the planner only
--     writes events; it sends nothing).
--
-- Quiet hours move a push's `next_retry_at` to the end of the reader's quiet
-- hours, so it is claimed then if it is still worth sending. The claim cancels
-- it as expired if its moment passes first.
--
-- Reader eligibility mirrors the email fan-out (notifications and the topic
-- switched on, not deleted, banned or anonymous, and for the kick-off alert a
-- favourite, followed or subscribed club), with push in place of email, and
-- requires at least one working device.

-- ---------------------------------------------------------------------------
-- Settings: where to wake the function, and what the last tick did
-- ---------------------------------------------------------------------------
alter table app_private.notification_push_settings
  add column functions_base_url text,
  add column last_tick_at timestamptz,
  add column last_outcome text,
  add constraint notification_push_settings_url_check check (
    functions_base_url is null
    or functions_base_url ~ '^https?://[A-Za-z0-9._:-]+/functions/v1$'
  ),
  add constraint notification_push_settings_outcome_check check (
    last_outcome is null
    or last_outcome in ('off', 'idle', 'succeeded', 'failed', 'busy', 'not_configured')
  );

-- Only needed when the email dispatcher was never configured: the tick uses
-- this address, else the email settings' one (same project, same functions).
create or replace function app_private.notification_push_set_functions_url(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app_private.notification_push_settings set
    functions_base_url = p_url,
    updated_at = statement_timestamp()
  where id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fan-out: planned moments -> notifications (where needed) -> push deliveries
-- ---------------------------------------------------------------------------
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
  target app_private.notification_events%rowtype;
  budget integer := greatest(p_budget, 0);
  batch_limit integer;
  batch_users integer;
  batch_queued integer;
  total_events integer := 0;
  total_users integer := 0;
  total_queued integer := 0;
  home_team uuid;
  away_team uuid;
begin
  if p_mode not in ('testers', 'live') or p_activated_at is null then
    return jsonb_build_object('events', 0, 'users', 0, 'queued', 0);
  end if;

  for target in
    select event.* from app_private.notification_events event
    where event.event_type::text in ('match_starting', 'deadline_24h')
      and event.status in ('pending', 'processing', 'completed')
      -- A moment from before push was switched on is never pushed late.
      and event.received_at >= p_activated_at
      -- After the email fan-out is done with it; or at once when email is not
      -- going to fan it out at all.
      and (
        event.status = 'completed'
        or p_email_mode = 'off'
        or p_email_activated_at is null
        or event.received_at < p_email_activated_at
      )
      and not app_private.notification_email_event_is_stale(event, p_now)
    order by event.received_at, event.id
  loop
    exit when budget <= 0;
    total_events := total_events + 1;

    home_team := null;
    away_team := null;
    if target.event_type = 'match_starting' then
      select fixture.home_team_id, fixture.away_team_id into home_team, away_team
      from app.fixtures fixture where fixture.id = target.source_entity_id;
    end if;

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
          -- The kick-off alert is for fans only.
          and (
            target.event_type::text <> 'match_starting'
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
          -- yet. Re-running finds nobody; a phone registered later is found.
          and exists (
            select 1
            from app.device_registrations device
            join app_private.push_destinations destination
              on destination.device_registration_id = device.id
            where device.user_id = profile.id
              and device.enabled and device.invalidated_at is null
              and device.push_provider::text in ('fcm', 'apns')
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
                ((target.safe_payload ->> 'deadlineAt')::timestamptz) at time zone audience.timezone,
                'DD/MM HH24:MI'))
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
          case target.event_type::text
            when 'match_starting' then 'match_detail'
            when 'deadline_24h' then 'fantasy_transfers'
            else 'none'
          end::app.notification_deep_link_target,
          case when target.event_type = 'match_starting' then target.source_entity_id end,
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
      exit when batch_users < batch_limit or batch_queued = 0;
    end loop;
  end loop;

  return jsonb_build_object('events', total_events, 'users', total_users, 'queued', total_queued);
end;
$$;

-- ---------------------------------------------------------------------------
-- The one-minute tick
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_push_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_push_settings%rowtype;
  email_settings app_private.notification_email_settings%rowtype;
  started timestamptz := clock_timestamp();
  plan_result jsonb := null;
  fanout_result jsonb := null;
  dispatch text := 'not_needed';
  waiting boolean;
  base_url text;
  errors text[] := '{}'::text[];
  outcome text;
  summary jsonb;
begin
  select * into settings from app_private.notification_push_settings where id;

  if settings.mode = 'off' then
    update app_private.notification_push_settings set last_tick_at = started, last_outcome = 'off'
    where id;
    return jsonb_build_object('outcome', 'off');
  end if;

  -- One tick at a time; a tick that overlaps the previous one does nothing.
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:notification-push-tick', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  select * into email_settings from app_private.notification_email_settings where id;

  -- The email tick plans the moments while email is on. With email off nobody
  -- does, so push does: the planner only writes events and sends nothing.
  if email_settings.mode = 'off' then
    begin
      plan_result := app_private.notification_email_plan(started);
    exception when others then
      errors := errors || left(format('plan %s: %s', sqlstate, sqlerrm), 280);
    end;
  end if;

  begin
    fanout_result := app_private.notification_push_fanout(
      started, settings.mode, settings.test_user_ids, settings.activated_at,
      email_settings.mode, email_settings.activated_at, 2000
    );
  exception when others then
    errors := errors || left(format('fanout %s: %s', sqlstate, sqlerrm), 280);
  end;

  -- Wake the sender only when something can be claimed now (the claim also
  -- cancels what is no longer wanted, so those count).
  select exists (
    select 1
    from app.notification_deliveries delivery
    join app.notifications notification on notification.id = delivery.notification_id
    where delivery.channel = 'push' and delivery.provider_key in ('fcm', 'apns')
      and ((delivery.status in ('pending', 'retry_scheduled')
          and coalesce(delivery.next_retry_at, delivery.created_at) <= started)
        or (delivery.status = 'claimed' and delivery.claim_expires_at < started))
      and notification.available_at <= started
      and (settings.mode = 'live' or notification.user_id = any(settings.test_user_ids))
  ) into waiting;

  if waiting then
    base_url := coalesce(settings.functions_base_url, email_settings.functions_base_url);
    if base_url is null or app_private.invoke_scheduled_function(
      base_url, 'notification-push-dispatch', '{"job":"dispatch"}'::jsonb
    ) is null then
      dispatch := 'not_configured';
    else
      dispatch := 'invoked';
    end if;
  end if;

  outcome := case
    when cardinality(errors) > 0 then 'failed'
    when dispatch = 'not_configured' then 'not_configured'
    when dispatch = 'not_needed' and coalesce((fanout_result ->> 'queued')::integer, 0) = 0 then 'idle'
    else 'succeeded'
  end;
  summary := jsonb_build_object(
    'outcome', outcome, 'plan', plan_result, 'fanout', fanout_result,
    'dispatch', dispatch, 'errors', to_jsonb(errors)
  );
  update app_private.notification_push_settings set last_tick_at = started, last_outcome = outcome
  where id;
  return summary;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function
  app_private.notification_push_set_functions_url(text),
  app_private.notification_push_fanout(timestamptz, text, uuid[], timestamptz, text, timestamptz, integer),
  app_private.notification_push_tick()
from public, anon, authenticated, service_role;
grant execute on function
  app_private.notification_push_set_functions_url(text),
  app_private.notification_push_fanout(timestamptz, text, uuid[], timestamptz, text, timestamptz, integer),
  app_private.notification_push_tick()
to postgres;

-- ---------------------------------------------------------------------------
-- The job. cron.schedule with a name replaces a job of that name, so
-- re-applying is harmless. It does nothing while the push switch is off.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'notification-push-tick',
  '* * * * *',
  $$select app_private.notification_push_tick()$$
);

comment on function app_private.notification_push_tick() is
  'Every minute: plans the kick-off and deadline moments when email will not, queues push deliveries for them, and wakes notification-push-dispatch when something can be sent. Returns at once while push is off.';
$bg_20261005110000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261005110000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261005110000'
  );
begin
  if encode(sha256(convert_to(part_20261005110000, 'UTF8')), 'hex')
    is distinct from 'a9918f43089faa8e35620f397fc5cd9b90a824418a4352c62e69603a8a2995b1' then
    raise exception 'stop: 20261005110000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261005110000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn text;
  who text;
  job_count integer;
  ticked jsonb;
  fanned jsonb;
begin
  foreach fn in array array[
    'app_private.notification_push_set_functions_url(text)',
    'app_private.notification_push_fanout(timestamptz,text,uuid[],timestamptz,text,timestamptz,integer)',
    'app_private.notification_push_tick()'
  ] loop
    if to_regprocedure(fn) is null then
      problems := problems || (fn || ' is missing');
      continue;
    end if;
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, to_regprocedure(fn), 'execute') then
        problems := problems || (who || ' can run ' || fn);
      end if;
    end loop;
  end loop;
  if (select count(*) from app_private.notification_push_settings) <> 1
    or (select mode from app_private.notification_push_settings) <> 'off' then
    problems := problems || 'the push switch is not one row, off'::text;
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema = 'app_private' and table_name = 'notification_push_settings'
        and column_name = 'functions_base_url')
    or not exists (select 1 from information_schema.columns
      where table_schema = 'app_private' and table_name = 'notification_push_settings'
        and column_name = 'last_tick_at')
    or not exists (select 1 from information_schema.columns
      where table_schema = 'app_private' and table_name = 'notification_push_settings'
        and column_name = 'last_outcome') then
    problems := problems || 'the push switch lacks its new columns'::text;
  end if;
  select count(*) into job_count from cron.job
    where jobname = 'notification-push-tick' and schedule = '* * * * *'
      and command like '%app_private.notification_push_tick()%';
  if job_count <> 1 then
    problems := problems || 'the notification-push-tick job is not scheduled once a minute'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261005110000') then
    problems := problems || 'history row missing'::text;
  end if;

  -- While push is off the tick does nothing, and a fan-out run anyway does
  -- nothing. The tick notes its run in the switch's row: that note is rolled
  -- back with a deliberate error, so this check leaves nothing behind.
  begin
    ticked := app_private.notification_push_tick();
    raise exception 'rollback_probe';
  exception when others then
    if sqlerrm <> 'rollback_probe' then
      problems := problems || ('the tick failed: ' || sqlerrm);
    end if;
  end;
  if ticked is distinct from '{"outcome": "off"}'::jsonb then
    problems := problems || ('the tick while off answered ' || coalesce(ticked::text, 'nothing'));
  end if;
  fanned := app_private.notification_push_fanout(
    statement_timestamp(), 'off', null, null, 'off', null, 100
  );
  if fanned is distinct from '{"events": 0, "users": 0, "queued": 0}'::jsonb then
    problems := problems || ('a fan-out asked to run while off answered ' || fanned::text);
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'push fan-out: functions owner-only, switch still off, job every minute, the tick and the fan-out do nothing while off';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261005110000')
    then 'Applied. Push alerts can now be queued and the sender woken; push is still OFF.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
