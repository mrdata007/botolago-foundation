-- Push alerts, sending side, step 2: creating the alerts, and waking the sender.
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
