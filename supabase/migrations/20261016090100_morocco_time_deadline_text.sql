-- The Fantasy deadline printed in a notification follows Morocco's clock.
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
