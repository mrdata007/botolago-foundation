-- BotolaGO — phone alerts (web push) for the "match starting" moment.
--
-- Until now the "match starting" job (an hour before kick-off) made an inbox
-- message and an e-mail, never a phone alert. This adds the phone alert to the
-- same job, for the same people, without a second inbox message:
--
--   * a user who gets the e-mail also gets a phone alert attached to that same
--     inbox message (once the e-mail job has created it);
--   * a user with phone alerts on and e-mail off (or unconfirmed) gets the inbox
--     message made here, plus the phone alert. Where both jobs could make the
--     message, the e-mail job keeps it, so nobody gets two.
--
-- Additive: one new audience read, one new fan-out, one new push-only claim for
-- the dispatcher, and the e-mail tick re-created with one extra guarded block.
-- It sends nothing by itself: the dispatcher workflow (manual) sends, and the
-- phone card stays behind NOTIFICATIONS_PUSH_ENABLED. Quiet hours are honoured,
-- and a phone alert is never queued once the match has kicked off.

-- Who a match-starting phone alert is for.
create or replace function app_private.notification_push_match_audience(
  p_event_id uuid,
  p_home_team uuid,
  p_away_team uuid,
  p_fixture_id uuid,
  p_now timestamptz,
  p_mode text,
  p_test_user_ids uuid[]
)
returns table (
  user_id uuid,
  language app.language_code,
  timezone text,
  quiet_enabled boolean,
  quiet_start time,
  quiet_end time,
  email_eligible boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.preferred_language, preference.notification_timezone,
    preference.quiet_hours_enabled, preference.quiet_hours_start, preference.quiet_hours_end,
    (preference.email_notifications_enabled
      and auth_user.email is not null
      and auth_user.email_confirmed_at is not null)
  from app.profiles profile
  join app.user_preferences preference on preference.user_id = profile.id
  join auth.users auth_user on auth_user.id = profile.id
  where profile.deleted_at is null
    and preference.notifications_enabled
    and preference.push_notifications_enabled
    and preference.match_alerts
    and auth_user.deleted_at is null
    and not coalesce(auth_user.is_anonymous, false)
    and (auth_user.banned_until is null or auth_user.banned_until < p_now)
    and (p_mode = 'live' or profile.id = any(p_test_user_ids))
    and exists (
      select 1 from app.device_registrations device
      where device.user_id = profile.id and device.enabled and device.invalidated_at is null
        and device.push_provider = 'web_push')
    and (
      preference.favorite_team_id in (p_home_team, p_away_team)
      or exists (select 1 from app.followed_teams followed
        where followed.user_id = profile.id and followed.team_id in (p_home_team, p_away_team))
      or exists (select 1 from app.notification_subscriptions subscription
        where subscription.user_id = profile.id and subscription.enabled
          and (subscription.fixture_id = p_fixture_id
            or subscription.team_id in (p_home_team, p_away_team))))
$$;

create or replace function app_private.notification_push_fanout(
  p_now timestamptz,
  p_mode text,
  p_test_user_ids uuid[],
  p_activated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target app_private.notification_events%rowtype;
  home_team uuid;
  away_team uuid;
  kickoff timestamptz;
  made integer;
  queued integer;
  total_made integer := 0;
  total_queued integer := 0;
begin
  if p_mode not in ('test', 'live') or p_activated_at is null then
    return jsonb_build_object('notifications', 0, 'queued', 0);
  end if;

  for target in
    select event.* from app_private.notification_events event
    where event.event_type = 'match_starting'
      and event.status in ('pending', 'processing', 'completed')
      and event.received_at >= p_activated_at
      and event.received_at >= p_now - interval '3 hours'
      and not app_private.notification_email_event_is_stale(event, p_now)
    order by event.received_at, event.id
  loop
    select fixture.home_team_id, fixture.away_team_id into home_team, away_team
    from app.fixtures fixture where fixture.id = target.source_entity_id;
    kickoff := (target.safe_payload -> 'fixture' ->> 'kickoffAt')::timestamptz;
    continue when kickoff is null;

    -- 1. Phone-only users (no e-mail to wait for): make their inbox message.
    with audience as (
      select * from app_private.notification_push_match_audience(
        target.id, home_team, away_team, target.source_entity_id, p_now, p_mode, p_test_user_ids)
      where not email_eligible
    ),
    rendered as (
      select audience.user_id, audience.language, template.id as template_id, template.category,
        template.title_template, template.body_template, template.required_variables,
        jsonb_build_object(
          'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
          'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''),
          'minutes', coalesce(target.safe_payload ->> 'minutes', '60')) as variables
      from audience
      join app.notification_templates template
        on template.template_key = 'match_starting'
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
        'match_detail'::app.notification_deep_link_target,
        target.source_entity_id, target.source_domain, target.source_entity_id, p_now
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
    )
    select count(*) into made from inserted;
    total_made := total_made + made;

    -- 2. The phone alert itself, on whichever inbox message exists for the user
    --    (for e-mail users, once the e-mail job has made it).
    with audience as (
      select * from app_private.notification_push_match_audience(
        target.id, home_team, away_team, target.source_entity_id, p_now, p_mode, p_test_user_ids)
    ),
    planned as (
      select notification.id as notification_id, device.id as device_id,
        app_private.defer_for_quiet_hours(
          p_now, audience.timezone, audience.quiet_enabled, audience.quiet_start,
          audience.quiet_end, coalesce(template.bypass_quiet_hours, false)) as send_at
      from audience
      join app.notifications notification
        on notification.event_id = target.id and notification.user_id = audience.user_id
      join app.device_registrations device
        on device.user_id = audience.user_id and device.enabled
       and device.invalidated_at is null and device.push_provider = 'web_push'
      left join app.notification_templates template
        on template.template_key = 'match_starting' and template.channel = 'in_app'
       and template.language = audience.language and template.active
    ),
    inserted as (
      insert into app.notification_deliveries (
        notification_id, channel, device_registration_id, provider_key, status, next_retry_at
      )
      select planned.notification_id, 'push', planned.device_id, 'web_push', 'pending',
        case when planned.send_at > p_now then planned.send_at end
      from planned
      where planned.send_at < kickoff
      on conflict do nothing
      returning 1
    )
    select count(*) into queued from inserted;
    total_queued := total_queued + queued;
  end loop;

  return jsonb_build_object('notifications', total_made, 'queued', total_queued);
end;
$$;

-- Dispatcher claim for phone alerts only. (The general claim also hands out
-- e-mail, which the phone dispatcher must never touch.) Alerts that waited more
-- than two hours are closed rather than sent late.
create or replace function api.service_claim_push_deliveries(
  p_limit integer default 100,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_limit not between 1 and 250 or p_lease_seconds not between 30 and 600 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;

  update app.notification_deliveries delivery set
    status = 'cancelled', failed_at = statement_timestamp(),
    stable_error_code = 'push_window_passed'
  where delivery.channel = 'push' and delivery.provider_key = 'web_push'
    and delivery.status in ('pending', 'retry_scheduled')
    and delivery.created_at < statement_timestamp() - interval '2 hours';

  with claimable as (
    select delivery.id from app.notification_deliveries delivery
    join app.notifications notification on notification.id = delivery.notification_id
    join app.user_preferences preference on preference.user_id = notification.user_id
    where delivery.channel = 'push' and delivery.provider_key = 'web_push'
      and ((delivery.status in ('pending', 'retry_scheduled')
          and coalesce(delivery.next_retry_at, delivery.created_at) <= statement_timestamp())
        or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()))
      and notification.available_at <= statement_timestamp()
      and (notification.expires_at is null or notification.expires_at > statement_timestamp())
      and preference.notifications_enabled and preference.push_notifications_enabled
    order by coalesce(delivery.next_retry_at, delivery.created_at), delivery.id
    for update of delivery skip locked limit p_limit
  ), claimed as (
    update app.notification_deliveries delivery set
      status = 'claimed', claimed_at = statement_timestamp(),
      claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1
    from claimable where delivery.id = claimable.id
    returning delivery.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', claimed.id, 'notificationId', claimed.notification_id,
    'channel', claimed.channel, 'providerKey', claimed.provider_key,
    'deviceRegistrationId', claimed.device_registration_id,
    'attemptNumber', claimed.attempt_count,
    'title', notification.title, 'body', notification.body,
    'language', notification.language,
    'deepLink', jsonb_build_object('target', notification.deep_link_target, 'entityId', notification.deep_link_entity_id),
    'destination', destination.destination_value
  ) order by claimed.created_at, claimed.id), '[]'::jsonb)
  into result
  from claimed
  join app.notifications notification on notification.id = claimed.notification_id
  left join app_private.push_destinations destination
    on destination.device_registration_id = claimed.device_registration_id;
  return result;
end;
$$;

-- The e-mail tick, as in 20260924140100, plus the phone-alert step.
create or replace function app_private.notification_email_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  run_started timestamptz := clock_timestamp();
  plan_result jsonb := null;
  fanout_result jsonb := null;
  push_result jsonb := null;
  dispatch text := 'not_needed';
  quota jsonb := null;
  errors text[] := '{}'::text[];
  outcome text;
  summary jsonb;
begin
  select * into settings from app_private.notification_email_settings where id;

  if settings.mode = 'off' then
    insert into app_private.notification_email_heartbeat (id, last_run_at, last_outcome, last_summary)
    values (true, run_started, 'off', '{}'::jsonb)
    on conflict (id) do update set last_run_at = excluded.last_run_at,
      last_outcome = excluded.last_outcome, last_summary = excluded.last_summary;
    return jsonb_build_object('outcome', 'off');
  end if;

  -- One tick at a time; a tick that overlaps the previous one does nothing.
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:notification-email-tick', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  begin
    plan_result := app_private.notification_email_plan(run_started);
  exception when others then
    errors := errors || left(format('plan %s: %s', sqlstate, sqlerrm), 280);
  end;

  begin
    fanout_result := app_private.notification_email_fanout(
      run_started, settings.mode, settings.test_user_ids, settings.activated_at,
      settings.max_emails_per_run
    );
  exception when others then
    errors := errors || left(format('fanout %s: %s', sqlstate, sqlerrm), 280);
  end;

  -- Phone alerts for the same moments. Its own block: a failure here never
  -- stops the e-mail work around it.
  begin
    push_result := app_private.notification_push_fanout(
      run_started, settings.mode, settings.test_user_ids, settings.activated_at
    );
  exception when others then
    errors := errors || left(format('push %s: %s', sqlstate, sqlerrm), 280);
  end;

  begin
    quota := app_private.notification_email_quota(run_started);
    if exists (
      select 1 from app.notification_deliveries delivery
      where delivery.channel = 'email' and delivery.provider_key = 'resend'
        and ((delivery.status in ('pending', 'retry_scheduled')
            and coalesce(delivery.next_retry_at, delivery.created_at) <= run_started)
          or (delivery.status = 'claimed' and delivery.claim_expires_at < run_started))
    ) then
      -- Waking the dispatcher would only spend an Edge Function call: mail
      -- waits (and is cancelled if its moment passes) until the quota resets.
      if quota ->> 'pausedUntil' is not null then
        dispatch := 'paused';
      elsif (quota ->> 'dailyRemaining')::integer <= 0 or (quota ->> 'monthlyRemaining')::integer <= 0 then
        dispatch := 'quota_reached';
      else
        dispatch := case
        when app_private.invoke_scheduled_function(
          settings.functions_base_url, 'notification-email-dispatch', '{"job":"dispatch"}'::jsonb
        ) is null then 'not_configured'
        else 'invoked'
        end;
      end if;
    end if;
  exception when others then
    errors := errors || left(format('dispatch %s: %s', sqlstate, sqlerrm), 280);
  end;

  summary := jsonb_build_object(
    'mode', settings.mode,
    'plan', plan_result,
    'fanout', fanout_result,
    'push', push_result,
    'dispatch', dispatch,
    'quota', quota
  );
  outcome := case
    when cardinality(errors) = 4 then 'failed'
    when cardinality(errors) > 0 then 'partial'
    when jsonb_array_length(coalesce(plan_result -> 'planned', '[]'::jsonb)) > 0
      or coalesce((fanout_result ->> 'created')::integer, 0) > 0
      or coalesce((fanout_result ->> 'cancelled')::integer, 0) > 0
      or coalesce((push_result ->> 'queued')::integer, 0) > 0
      or dispatch in ('invoked', 'not_configured') then 'succeeded'
    else 'idle'
  end;

  insert into app_private.notification_email_heartbeat (id, last_run_at, last_outcome, last_summary)
  values (true, run_started, outcome, summary)
  on conflict (id) do update set last_run_at = excluded.last_run_at,
    last_outcome = excluded.last_outcome, last_summary = excluded.last_summary;

  if outcome <> 'idle' then
    insert into app_private.notification_email_runs (started_at, finished_at, outcome, summary, last_error)
    values (
      run_started, clock_timestamp(), outcome, summary,
      case when cardinality(errors) > 0 then left(array_to_string(errors, ' | '), 600) end
    );
  end if;

  return summary || jsonb_build_object('outcome', outcome);
end;
$$;

revoke all on function
  app_private.notification_push_match_audience(uuid, uuid, uuid, uuid, timestamptz, text, uuid[]),
  app_private.notification_push_fanout(timestamptz, text, uuid[], timestamptz),
  api.service_claim_push_deliveries(integer, integer)
from public, anon, authenticated, service_role;

grant execute on function
  app_private.notification_push_match_audience(uuid, uuid, uuid, uuid, timestamptz, text, uuid[]),
  app_private.notification_push_fanout(timestamptz, text, uuid[], timestamptz)
to postgres;

grant execute on function api.service_claim_push_deliveries(integer, integer) to service_role;
