-- BotolaGO V2 — Phase 5: bounded owner APIs and trusted worker operations.

create or replace function app_private.write_notification_audit(
  p_event_type text,
  p_actor_user_id uuid default null,
  p_notification_id uuid default null,
  p_delivery_id uuid default null,
  p_device_registration_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_type !~ '^[a-z][a-z0-9_]{2,79}$'
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 8192
  then
    raise exception using errcode = '22023', message = 'invalid_notification_audit';
  end if;
  insert into app_private.notification_operational_audit (
    event_type, actor_user_id, notification_id, delivery_id,
    device_registration_id, metadata
  ) values (
    p_event_type, p_actor_user_id, p_notification_id, p_delivery_id,
    p_device_registration_id, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function app_private.assert_notification_user_rate_limit(
  p_user_id uuid,
  p_event_type text,
  p_maximum_events integer,
  p_period interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if p_user_id is null or p_maximum_events < 1 or p_period <= interval '0 seconds' then
    raise exception using errcode = '22023', message = 'invalid_rate_limit';
  end if;
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':notifications:' || p_event_type, 0)
  );
  select count(*)::integer into recent_count
  from app_private.notification_operational_audit
  where actor_user_id = p_user_id
    and event_type = p_event_type
    and occurred_at >= statement_timestamp() - p_period;
  if recent_count >= p_maximum_events then
    raise exception using errcode = 'PT429', message = 'notification_rate_limited';
  end if;
end;
$$;

create or replace function api.get_my_notification_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  select jsonb_build_object(
    'notificationsEnabled', pref.notifications_enabled,
    'channels', jsonb_build_object(
      'inApp', pref.in_app_notifications_enabled,
      'push', pref.push_notifications_enabled,
      'email', pref.email_notifications_enabled
    ),
    'categories', jsonb_build_object(
      'matchAlerts', pref.match_alerts,
      'breakingNews', pref.breaking_news,
      'fantasyDeadlines', pref.fantasy_deadline_reminders
    ),
    'timezone', pref.notification_timezone,
    'quietHours', jsonb_build_object(
      'enabled', pref.quiet_hours_enabled,
      'start', case when pref.quiet_hours_start is null then null else to_char(pref.quiet_hours_start, 'HH24:MI') end,
      'end', case when pref.quiet_hours_end is null then null else to_char(pref.quiet_hours_end, 'HH24:MI') end
    ),
    'digestMode', pref.notification_digest_mode,
    'fantasyDeadlineOffsetMinutes', pref.fantasy_deadline_offset_minutes,
    'language', profile.preferred_language,
    'updatedAt', pref.updated_at
  ) into result
  from app.user_preferences pref
  join app.profiles profile on profile.id = pref.user_id
  where pref.user_id = current_user_id and profile.deleted_at is null;
  if result is null then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  return result;
end;
$$;

create or replace function api.update_my_notification_preferences(
  p_notifications_enabled boolean,
  p_in_app_enabled boolean,
  p_push_enabled boolean,
  p_email_enabled boolean,
  p_match_alerts boolean,
  p_breaking_news boolean,
  p_fantasy_deadlines boolean,
  p_timezone text,
  p_quiet_hours_enabled boolean,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null,
  p_digest_mode app.notification_digest_mode default 'immediate',
  p_fantasy_deadline_offset_minutes integer default 1440
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_notifications_enabled is null or p_in_app_enabled is null or p_push_enabled is null
    or p_email_enabled is null or p_match_alerts is null or p_breaking_news is null
    or p_fantasy_deadlines is null or p_quiet_hours_enabled is null
    or p_digest_mode is null
  then
    raise exception using errcode = 'PT400', message = 'invalid_notification_preference';
  end if;
  perform app_private.assert_valid_timezone(p_timezone);
  if (p_quiet_hours_enabled and (p_quiet_hours_start is null or p_quiet_hours_end is null
      or p_quiet_hours_start = p_quiet_hours_end))
    or (not p_quiet_hours_enabled and (p_quiet_hours_start is not null or p_quiet_hours_end is not null))
    or p_fantasy_deadline_offset_minutes not between 15 and 10080
  then
    raise exception using errcode = 'PT400', message = 'quiet_hours_invalid';
  end if;
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notification_preferences_updated', 30, interval '5 minutes'
  );
  update app.user_preferences set
    notifications_enabled = p_notifications_enabled,
    in_app_notifications_enabled = p_in_app_enabled,
    push_notifications_enabled = p_push_enabled,
    email_notifications_enabled = p_email_enabled,
    match_alerts = p_match_alerts,
    breaking_news = p_breaking_news,
    fantasy_deadline_reminders = p_fantasy_deadlines,
    notification_timezone = p_timezone,
    quiet_hours_enabled = p_quiet_hours_enabled,
    quiet_hours_start = p_quiet_hours_start,
    quiet_hours_end = p_quiet_hours_end,
    notification_digest_mode = p_digest_mode,
    fantasy_deadline_offset_minutes = p_fantasy_deadline_offset_minutes
  where user_id = current_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  perform app_private.write_notification_audit(
    'notification_preferences_updated', current_user_id, p_metadata := jsonb_build_object(
      'pushEnabled', p_push_enabled,
      'emailEnabled', p_email_enabled,
      'quietHoursEnabled', p_quiet_hours_enabled
    )
  );
  return api.get_my_notification_preferences();
end;
$$;

create or replace function api.list_my_notifications(
  p_category app.notification_category default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  items jsonb;
  next_cursor jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_limit not between 1 and 50 or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception using errcode = 'PT400', message = 'invalid_notification_preference';
  end if;

  with candidates as (
    select notification.*,
      row_number() over (order by notification.created_at desc, notification.id desc) as row_number
    from app.notifications notification
    where notification.user_id = current_user_id
      and notification.archived_at is null
      and notification.available_at <= statement_timestamp()
      and (notification.expires_at is null or notification.expires_at > statement_timestamp())
      and (p_category is null or notification.category = p_category)
      and (p_before_created_at is null or (notification.created_at, notification.id) < (p_before_created_at, p_before_id))
    order by notification.created_at desc, notification.id desc
    limit p_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'type', notification_type,
      'category', category,
      'priority', priority,
      'language', language,
      'direction', case when language = 'ar' then 'rtl' else 'ltr' end,
      'title', title,
      'body', body,
      'deepLink', jsonb_build_object('target', deep_link_target, 'entityId', deep_link_entity_id),
      'availableAt', available_at,
      'expiresAt', expires_at,
      'readAt', read_at,
      'dismissedAt', dismissed_at,
      'createdAt', created_at
    ) order by created_at desc, id desc) filter (where row_number <= p_limit), '[]'::jsonb),
    case when max(row_number) > p_limit then (
      select jsonb_build_object('createdAt', c.created_at, 'id', c.id)
      from candidates c where c.row_number = p_limit
    ) else null end
  into items, next_cursor
  from candidates;
  return jsonb_build_object('items', items, 'nextCursor', next_cursor);
end;
$$;

create or replace function api.my_notification_unread_count(
  p_category app.notification_category default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); result bigint;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  select count(*) into result from app.notifications notification
  where notification.user_id = current_user_id
    and notification.read_at is null and notification.dismissed_at is null
    and notification.archived_at is null
    and notification.available_at <= statement_timestamp()
    and (notification.expires_at is null or notification.expires_at > statement_timestamp())
    and (p_category is null or notification.category = p_category);
  return result;
end;
$$;

create or replace function api.mark_my_notification_read(
  p_notification_id uuid,
  p_read boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notification_read_state_changed', 120, interval '5 minutes'
  );
  update app.notifications set read_at = case when p_read then statement_timestamp() else null end
  where id = p_notification_id and user_id = current_user_id and archived_at is null;
  if not found then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  perform app_private.write_notification_audit(
    'notification_read_state_changed', current_user_id, p_notification_id
  );
  return true;
end;
$$;

create or replace function api.mark_all_my_notifications_read(
  p_category app.notification_category default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); affected integer;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notifications_marked_all_read', 20, interval '5 minutes'
  );
  update app.notifications set read_at = statement_timestamp()
  where user_id = current_user_id and read_at is null and archived_at is null
    and available_at <= statement_timestamp()
    and (p_category is null or category = p_category);
  get diagnostics affected = row_count;
  perform app_private.write_notification_audit(
    'notifications_marked_all_read', current_user_id,
    p_metadata := jsonb_build_object('count', affected)
  );
  return affected;
end;
$$;

create or replace function api.dismiss_my_notification(
  p_notification_id uuid,
  p_archive boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  update app.notifications set
    dismissed_at = coalesce(dismissed_at, statement_timestamp()),
    archived_at = case when p_archive then coalesce(archived_at, statement_timestamp()) else archived_at end
  where id = p_notification_id and user_id = current_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  perform app_private.write_notification_audit(
    'notification_dismissed', current_user_id, p_notification_id,
    p_metadata := jsonb_build_object('archived', p_archive)
  );
  return true;
end;
$$;

create or replace function api.register_my_notification_device(
  p_device_id text,
  p_platform app.notification_device_platform,
  p_push_provider app.notification_push_provider,
  p_destination text,
  p_locale app.language_code,
  p_timezone text,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_id uuid;
  token_digest bytea;
  conflicting_user uuid;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_device_id !~ '^[A-Za-z0-9._:-]{8,128}$' or char_length(p_destination) not between 16 and 4096 then
    raise exception using errcode = 'PT400', message = 'invalid_device';
  end if;
  perform app_private.assert_valid_timezone(p_timezone);
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notification_device_registered', 10, interval '10 minutes'
  );
  token_digest := extensions.digest(convert_to(p_destination, 'UTF8'), 'sha256');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(encode(token_digest, 'hex'), 0));
  select registration.user_id into conflicting_user
  from app_private.push_destinations destination
  join app.device_registrations registration on registration.id = destination.device_registration_id
  where destination.destination_digest = token_digest
    and not (registration.user_id = current_user_id and registration.device_id = p_device_id);
  if conflicting_user is not null then
    raise exception using errcode = 'PT409', message = 'device_token_conflict';
  end if;

  insert into app.device_registrations (
    user_id, device_id, platform, push_provider, app_version, locale,
    timezone, enabled, last_seen_at, invalidated_at
  ) values (
    current_user_id, p_device_id, p_platform, p_push_provider, p_app_version,
    p_locale, p_timezone, true, statement_timestamp(), null
  ) on conflict (user_id, device_id) do update set
    platform = excluded.platform,
    push_provider = excluded.push_provider,
    app_version = excluded.app_version,
    locale = excluded.locale,
    timezone = excluded.timezone,
    enabled = true,
    last_seen_at = statement_timestamp(),
    invalidated_at = null
  returning id into target_id;

  insert into app_private.push_destinations (
    device_registration_id, destination_digest, destination_value, rotated_at
  ) values (target_id, token_digest, p_destination, statement_timestamp())
  on conflict (device_registration_id) do update set
    destination_digest = excluded.destination_digest,
    destination_value = excluded.destination_value,
    rotated_at = statement_timestamp(),
    expires_at = null;

  perform app_private.write_notification_audit(
    'notification_device_registered', current_user_id,
    p_device_registration_id := target_id,
    p_metadata := jsonb_build_object('platform', p_platform, 'provider', p_push_provider)
  );
  return jsonb_build_object(
    'id', target_id, 'deviceId', p_device_id, 'platform', p_platform,
    'pushProvider', p_push_provider, 'appVersion', p_app_version,
    'locale', p_locale, 'timezone', p_timezone, 'enabled', true
  );
exception when unique_violation then
  raise exception using errcode = 'PT409', message = 'device_token_conflict';
end;
$$;

create or replace function api.list_my_notification_devices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); result jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'deviceId', device_id, 'platform', platform,
    'pushProvider', push_provider, 'appVersion', app_version,
    'locale', locale, 'timezone', timezone, 'enabled', enabled,
    'lastSeenAt', last_seen_at, 'invalidatedAt', invalidated_at,
    'createdAt', created_at
  ) order by last_seen_at desc, id), '[]'::jsonb)
  into result from app.device_registrations where user_id = current_user_id;
  return result;
end;
$$;

create or replace function api.disable_my_notification_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  update app.device_registrations set enabled = false, invalidated_at = statement_timestamp()
  where id = p_device_id and user_id = current_user_id;
  if not found then raise exception using errcode = 'PT404', message = 'invalid_device'; end if;
  perform app_private.write_notification_audit(
    'notification_device_disabled', current_user_id,
    p_device_registration_id := p_device_id
  );
  return true;
end;
$$;

create or replace function api.unregister_my_notification_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  delete from app.device_registrations where id = p_device_id and user_id = current_user_id;
  if not found then raise exception using errcode = 'PT404', message = 'invalid_device'; end if;
  perform app_private.write_notification_audit(
    'notification_device_unregistered', current_user_id,
    p_metadata := jsonb_build_object('deviceRegistrationId', p_device_id)
  );
  return true;
end;
$$;

create or replace function api.set_my_notification_subscription(
  p_kind app.notification_subscription_kind,
  p_target_id uuid,
  p_enabled boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_target_id is null or p_enabled is null then
    raise exception using errcode = 'PT400', message = 'invalid_notification_preference';
  end if;
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notification_subscription_changed', 60, interval '5 minutes'
  );
  insert into app.notification_subscriptions (
    user_id, kind, fixture_id, team_id, competition_id, news_topic_id, enabled
  ) values (
    current_user_id, p_kind,
    case when p_kind = 'match' then p_target_id end,
    case when p_kind = 'team' then p_target_id end,
    case when p_kind = 'competition' then p_target_id end,
    case when p_kind = 'news_topic' then p_target_id end,
    p_enabled
  )
  on conflict do nothing;
  if not found then
    update app.notification_subscriptions set enabled = p_enabled
    where user_id = current_user_id
      and ((p_kind = 'match' and fixture_id = p_target_id)
        or (p_kind = 'team' and team_id = p_target_id)
        or (p_kind = 'competition' and competition_id = p_target_id)
        or (p_kind = 'news_topic' and news_topic_id = p_target_id));
  end if;
  perform app_private.write_notification_audit(
    'notification_subscription_changed', current_user_id,
    p_metadata := jsonb_build_object('kind', p_kind, 'targetId', p_target_id, 'enabled', p_enabled)
  );
  return true;
end;
$$;

create or replace function api.service_ingest_notification_event(
  p_event_id uuid,
  p_event_type app.notification_type,
  p_source_domain app.notification_source_domain,
  p_source_entity_id uuid,
  p_target_user_id uuid,
  p_occurred_at timestamptz,
  p_schema_version integer,
  p_deduplication_key text,
  p_correlation_id uuid,
  p_safe_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare resolved_id uuid;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_schema_version <> 1 then
    raise exception using errcode = 'PT400', message = 'event_schema_unsupported';
  end if;
  if p_event_id is null or p_correlation_id is null or p_occurred_at is null
    or char_length(p_deduplication_key) not between 8 and 200
    or jsonb_typeof(coalesce(p_safe_payload, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_safe_payload, '{}'::jsonb)) > 16384
  then
    raise exception using errcode = 'PT400', message = 'invalid_notification_event';
  end if;
  if (p_source_domain = 'identity' and p_target_user_id is null)
    or (p_source_domain = 'fantasy')
  then
    raise exception using errcode = 'PT400', message = 'event_schema_unsupported';
  end if;
  insert into app_private.notification_events (
    id, event_type, source_domain, source_entity_id, target_user_id,
    occurred_at, schema_version, deduplication_key, correlation_id, safe_payload
  ) values (
    p_event_id, p_event_type, p_source_domain, p_source_entity_id, p_target_user_id,
    p_occurred_at, p_schema_version, p_deduplication_key, p_correlation_id,
    coalesce(p_safe_payload, '{}'::jsonb)
  ) on conflict (deduplication_key) do nothing
  returning id into resolved_id;
  if resolved_id is null then
    select id into resolved_id from app_private.notification_events
    where deduplication_key = p_deduplication_key;
  end if;
  return resolved_id;
end;
$$;

create or replace function api.service_claim_notification_event(
  p_event_id uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target app_private.notification_events%rowtype; run_id uuid;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_lease_seconds not between 30 and 600 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_event';
  end if;
  select * into target from app_private.notification_events
  where id = p_event_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'notification_not_found'; end if;
  if target.status = 'completed' then
    return jsonb_build_object('claimed', false, 'completed', true);
  end if;
  insert into app_private.notification_fanout_runs (
    event_id, status, claimed_at, claim_expires_at, started_at
  ) values (
    p_event_id, 'processing', statement_timestamp(),
    statement_timestamp() + make_interval(secs => p_lease_seconds), statement_timestamp()
  ) on conflict (event_id) do update set
    status = 'processing',
    claimed_at = statement_timestamp(),
    claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
    started_at = coalesce(app_private.notification_fanout_runs.started_at, statement_timestamp())
  where app_private.notification_fanout_runs.claim_expires_at is null
    or app_private.notification_fanout_runs.claim_expires_at < statement_timestamp()
    or app_private.notification_fanout_runs.status in ('pending', 'partially_failed', 'failed')
  returning id into run_id;
  if run_id is null then return jsonb_build_object('claimed', false, 'completed', false); end if;
  update app_private.notification_events set
    status = 'processing', processing_started_at = coalesce(processing_started_at, statement_timestamp())
  where id = p_event_id;
  return jsonb_build_object(
    'claimed', true, 'runId', run_id, 'eventId', target.id,
    'type', target.event_type, 'sourceDomain', target.source_domain,
    'sourceEntityId', target.source_entity_id, 'targetUserId', target.target_user_id,
    'occurredAt', target.occurred_at, 'schemaVersion', target.schema_version,
    'correlationId', target.correlation_id, 'payload', target.safe_payload
  );
end;
$$;

create or replace function api.service_list_notification_audience(
  p_event_id uuid,
  p_after_user_id uuid default null,
  p_limit integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target app_private.notification_events%rowtype; result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_limit not between 1 and 500 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_event';
  end if;
  select * into target from app_private.notification_events where id = p_event_id;
  if not found then raise exception using errcode = 'PT404', message = 'notification_not_found'; end if;

  with audience as (
    select profile.id as user_id, profile.preferred_language,
      preference.notification_timezone, preference.quiet_hours_enabled,
      preference.quiet_hours_start, preference.quiet_hours_end
    from app.profiles profile
    join app.user_preferences preference on preference.user_id = profile.id
    where profile.deleted_at is null
      and (p_after_user_id is null or profile.id > p_after_user_id)
      and (
        profile.id = target.target_user_id
        or (target.source_domain = 'news' and target.event_type = 'breaking_news'
          and preference.notifications_enabled and preference.breaking_news)
        or (target.source_domain = 'football' and preference.notifications_enabled and preference.match_alerts
          and exists (
            select 1 from app.fixtures fixture
            where fixture.id = target.source_entity_id
              and (exists (select 1 from app.followed_teams followed
                    where followed.user_id = profile.id and followed.team_id in (fixture.home_team_id, fixture.away_team_id))
                or exists (select 1 from app.followed_competitions followed
                    where followed.user_id = profile.id and followed.competition_id = fixture.competition_id)
                or exists (select 1 from app.notification_subscriptions subscription
                    where subscription.user_id = profile.id and subscription.enabled
                      and (subscription.fixture_id = fixture.id
                        or subscription.team_id in (fixture.home_team_id, fixture.away_team_id)
                        or subscription.competition_id = fixture.competition_id)))
          ))
        or (target.source_domain = 'news' and target.event_type in ('followed_team_article', 'followed_competition_article')
          and preference.notifications_enabled and preference.breaking_news
          and exists (
            select 1
            from app.article_editions edition
            where edition.id = target.source_entity_id
              and ((target.event_type = 'followed_team_article' and exists (
                    select 1 from app.story_teams relation
                    join app.followed_teams followed on followed.team_id = relation.team_id
                    where relation.story_id = edition.story_id and followed.user_id = profile.id))
                or (target.event_type = 'followed_competition_article' and exists (
                    select 1 from app.story_competitions relation
                    join app.followed_competitions followed on followed.competition_id = relation.competition_id
                    where relation.story_id = edition.story_id and followed.user_id = profile.id)))
          ))
      )
    order by profile.id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', user_id, 'language', preferred_language,
    'timezone', notification_timezone,
    'quietHours', jsonb_build_object(
      'enabled', quiet_hours_enabled,
      'start', case when quiet_hours_start is null then null else to_char(quiet_hours_start, 'HH24:MI') end,
      'end', case when quiet_hours_end is null then null else to_char(quiet_hours_end, 'HH24:MI') end
    )
  ) order by user_id), '[]'::jsonb) into result from audience;
  return result;
end;
$$;

create or replace function api.service_create_user_notification(
  p_event_id uuid,
  p_user_id uuid,
  p_variables jsonb,
  p_priority app.notification_priority default 'normal',
  p_deep_link_target app.notification_deep_link_target default 'none',
  p_deep_link_entity_id uuid default null,
  p_expires_at timestamptz default null,
  p_push_provider_key text default 'fixture',
  p_email_provider_key text default 'fixture'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target app_private.notification_events%rowtype;
  preference app.user_preferences%rowtype;
  target_language app.language_code;
  template app.notification_templates%rowtype;
  notification_id uuid;
  rendered_title text;
  rendered_body text;
  available_at timestamptz;
  mandatory boolean;
  category_enabled boolean;
  device record;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  select * into target from app_private.notification_events where id = p_event_id;
  if not found then raise exception using errcode = 'PT404', message = 'notification_not_found'; end if;
  select * into preference from app.user_preferences where user_id = p_user_id;
  if not found then raise exception using errcode = 'PT404', message = 'notification_not_found'; end if;
  select preferred_language into target_language from app.profiles
  where id = p_user_id and deleted_at is null;
  if not found then raise exception using errcode = 'PT404', message = 'notification_not_found'; end if;
  select * into template from app.notification_templates
  where template_key = target.event_type::text and channel = 'in_app'
    and notification_templates.language = target_language and active
  order by version desc limit 1;
  if not found then raise exception using errcode = 'PT404', message = 'template_not_found'; end if;
  mandatory := template.is_mandatory;
  category_enabled := case target.event_type
    when 'breaking_news' then preference.breaking_news
    when 'followed_team_article' then preference.breaking_news
    when 'followed_competition_article' then preference.breaking_news
    when 'deadline_24h' then preference.fantasy_deadline_reminders
    when 'deadline_1h' then preference.fantasy_deadline_reminders
    else case when template.category = 'football' then preference.match_alerts else true end
  end;
  if not mandatory and (not preference.notifications_enabled
    or not preference.in_app_notifications_enabled or not category_enabled) then
    return null;
  end if;
  if (p_deep_link_target in ('match_detail', 'article')) <> (p_deep_link_entity_id is not null) then
    raise exception using errcode = 'PT400', message = 'invalid_deep_link';
  end if;
  if p_deep_link_target = 'match_detail'
    and not exists (select 1 from app.fixtures where id = p_deep_link_entity_id) then
    raise exception using errcode = 'PT404', message = 'invalid_deep_link';
  end if;
  if p_deep_link_target = 'article'
    and not exists (select 1 from app.article_editions where id = p_deep_link_entity_id) then
    raise exception using errcode = 'PT404', message = 'invalid_deep_link';
  end if;
  rendered_title := app_private.render_notification_template(
    template.title_template, template.required_variables, coalesce(p_variables, '{}'::jsonb)
  );
  rendered_body := app_private.render_notification_template(
    template.body_template, template.required_variables, coalesce(p_variables, '{}'::jsonb)
  );
  if char_length(rendered_title) > template.max_title_length
    or char_length(rendered_body) > template.max_body_length then
    raise exception using errcode = 'PT400', message = 'template_length_exceeded';
  end if;
  available_at := app_private.defer_for_quiet_hours(
    statement_timestamp(), preference.notification_timezone,
    preference.quiet_hours_enabled, preference.quiet_hours_start,
    preference.quiet_hours_end, template.bypass_quiet_hours
  );
  insert into app.notifications (
    user_id, event_id, template_id, notification_type, category, priority,
    language, title, body, deep_link_target, deep_link_entity_id,
    source_domain, source_entity_id, available_at, expires_at
  ) values (
    p_user_id, p_event_id, template.id, target.event_type, template.category,
    p_priority, target_language, rendered_title, rendered_body, p_deep_link_target,
    p_deep_link_entity_id, target.source_domain, target.source_entity_id,
    available_at, p_expires_at
  ) on conflict (event_id, user_id) do nothing returning id into notification_id;
  if notification_id is null then
    select id into notification_id from app.notifications
    where event_id = p_event_id and user_id = p_user_id;
    return notification_id;
  end if;

  insert into app.notification_deliveries (
    notification_id, channel, provider_key, status, attempt_count, sent_at, delivered_at
  ) values (
    notification_id, 'in_app', 'database', 'delivered', 1,
    statement_timestamp(), statement_timestamp()
  );

  if preference.notifications_enabled and category_enabled
    and preference.push_notifications_enabled then
    for device in select id from app.device_registrations
      where user_id = p_user_id and enabled and invalidated_at is null
    loop
      insert into app.notification_deliveries (
        notification_id, channel, device_registration_id, provider_key, status
      ) values (notification_id, 'push', device.id, p_push_provider_key, 'pending')
      on conflict do nothing;
    end loop;
  end if;
  if preference.notifications_enabled and category_enabled
    and preference.email_notifications_enabled
    and exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null)
  then
    insert into app.notification_deliveries (
      notification_id, channel, provider_key, status
    ) values (notification_id, 'email', p_email_provider_key, 'pending')
    on conflict do nothing;
  end if;
  return notification_id;
end;
$$;

create or replace function api.service_checkpoint_notification_fanout(
  p_event_id uuid,
  p_checkpoint_user_id uuid,
  p_audience_count integer,
  p_notifications_created integer,
  p_deliveries_queued integer,
  p_skipped_count integer,
  p_rejected_count integer,
  p_complete boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if least(p_audience_count, p_notifications_created, p_deliveries_queued,
    p_skipped_count, p_rejected_count) < 0 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_event';
  end if;
  update app_private.notification_fanout_runs set
    checkpoint_user_id = p_checkpoint_user_id,
    audience_count = audience_count + p_audience_count,
    notifications_created = notifications_created + p_notifications_created,
    deliveries_queued = deliveries_queued + p_deliveries_queued,
    skipped_count = skipped_count + p_skipped_count,
    rejected_count = rejected_count + p_rejected_count,
    status = case
      when p_complete then 'completed'::app_private.notification_fanout_status
      else 'processing'::app_private.notification_fanout_status
    end,
    completed_at = case when p_complete then statement_timestamp() else null end,
    claimed_at = case when p_complete then null else claimed_at end,
    claim_expires_at = case when p_complete then null else statement_timestamp() + interval '2 minutes' end
  where event_id = p_event_id;
  if not found then raise exception using errcode = 'PT404', message = 'notification_not_found'; end if;
  if p_complete then
    update app_private.notification_events set status = 'completed', completed_at = statement_timestamp()
    where id = p_event_id;
  end if;
  return true;
end;
$$;

create or replace function api.service_upsert_notification_schedule(
  p_idempotency_key text,
  p_notification_type app.notification_type,
  p_source_domain app.notification_source_domain,
  p_source_entity_id uuid,
  p_target_user_id uuid,
  p_due_at timestamptz,
  p_timezone_basis text,
  p_safe_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target_id uuid;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  perform app_private.assert_valid_timezone(p_timezone_basis);
  if p_due_at is null or char_length(p_idempotency_key) not between 8 and 200
    or jsonb_typeof(coalesce(p_safe_payload, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = 'PT400', message = 'schedule_conflict';
  end if;
  insert into app_private.notification_schedules (
    notification_type, source_domain, source_entity_id, target_user_id,
    due_at, timezone_basis, idempotency_key, safe_payload
  ) values (
    p_notification_type, p_source_domain, p_source_entity_id, p_target_user_id,
    p_due_at, p_timezone_basis, p_idempotency_key, coalesce(p_safe_payload, '{}'::jsonb)
  ) on conflict (idempotency_key) do update set
    due_at = excluded.due_at,
    timezone_basis = excluded.timezone_basis,
    safe_payload = excluded.safe_payload,
    status = 'scheduled',
    cancelled_at = null,
    completed_at = null,
    claimed_at = null,
    claim_expires_at = null
  where app_private.notification_schedules.status not in ('claimed', 'completed')
  returning id into target_id;
  if target_id is null then raise exception using errcode = 'PT409', message = 'schedule_conflict'; end if;
  return target_id;
end;
$$;

create or replace function api.service_claim_notification_schedules(
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
    raise exception using errcode = 'PT400', message = 'schedule_conflict';
  end if;
  with claimable as (
    select id from app_private.notification_schedules
    where ((status in ('scheduled', 'retry_scheduled') and coalesce(next_retry_at, due_at) <= statement_timestamp())
      or (status = 'claimed' and claim_expires_at < statement_timestamp()))
    order by coalesce(next_retry_at, due_at), id
    for update skip locked limit p_limit
  ), claimed as (
    update app_private.notification_schedules schedule set
      status = 'claimed', claimed_at = statement_timestamp(),
      claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1
    from claimable where schedule.id = claimable.id
    returning schedule.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'type', notification_type, 'sourceDomain', source_domain,
    'sourceEntityId', source_entity_id, 'targetUserId', target_user_id,
    'dueAt', due_at, 'timezoneBasis', timezone_basis,
    'idempotencyKey', idempotency_key, 'payload', safe_payload,
    'attemptCount', attempt_count
  ) order by due_at, id), '[]'::jsonb) into result from claimed;
  return result;
end;
$$;

create or replace function api.service_cancel_notification_schedule(p_schedule_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  update app_private.notification_schedules set
    status = 'cancelled', cancelled_at = statement_timestamp(),
    claimed_at = null, claim_expires_at = null
  where id = p_schedule_id and status not in ('completed', 'cancelled');
  return found;
end;
$$;

create or replace function api.service_claim_notification_deliveries(
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
  with claimable as (
    select delivery.id from app.notification_deliveries delivery
    where ((delivery.status in ('pending', 'retry_scheduled')
        and coalesce(delivery.next_retry_at, delivery.created_at) <= statement_timestamp())
      or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()))
      and delivery.channel <> 'in_app'
    order by coalesce(delivery.next_retry_at, delivery.created_at), delivery.id
    for update skip locked limit p_limit
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
    'destination', case
      when claimed.channel = 'push' then destination.destination_value
      when claimed.channel = 'email' then auth_user.email
      else null end
  ) order by claimed.created_at, claimed.id), '[]'::jsonb)
  into result
  from claimed
  join app.notifications notification on notification.id = claimed.notification_id
  left join app_private.push_destinations destination
    on destination.device_registration_id = claimed.device_registration_id
  left join auth.users auth_user on auth_user.id = notification.user_id;
  return result;
end;
$$;

create or replace function api.service_invalidate_notification_device(
  p_device_registration_id uuid,
  p_reason_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_reason_code !~ '^[a-z][a-z0-9_]{2,79}$' then
    raise exception using errcode = 'PT400', message = 'invalid_device';
  end if;
  update app.device_registrations set enabled = false, invalidated_at = statement_timestamp()
  where id = p_device_registration_id and enabled;
  if found then
    perform app_private.write_notification_audit(
      'notification_device_invalidated',
      p_device_registration_id := p_device_registration_id,
      p_metadata := jsonb_build_object('reasonCode', p_reason_code)
    );
  end if;
  return found;
end;
$$;

create or replace function api.service_record_notification_delivery_attempt(
  p_delivery_id uuid,
  p_outcome text,
  p_retryable boolean,
  p_provider_message_id text default null,
  p_stable_error_code text default null,
  p_sanitized_summary text default null,
  p_provider_latency_ms integer default null,
  p_rate_limit_remaining integer default null,
  p_max_attempts integer default 5,
  p_retry_after_seconds integer default null
)
returns app.notification_delivery_status
language plpgsql
security definer
set search_path = ''
as $$
declare target app.notification_deliveries%rowtype; next_status app.notification_delivery_status; retry_at timestamptz;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_max_attempts not between 1 and 20 or p_sanitized_summary is not null and char_length(p_sanitized_summary) > 500 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;
  if p_outcome not in ('sent', 'delivered', 'retryable_failure', 'permanent_failure', 'cancelled') then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;
  select * into target from app.notification_deliveries where id = p_delivery_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'notification_not_found'; end if;
  if target.status <> 'claimed' then raise exception using errcode = 'PT409', message = 'notification_duplicate'; end if;
  if p_outcome in ('sent', 'delivered') then
    next_status := case
      when p_outcome = 'delivered' then 'delivered'::app.notification_delivery_status
      else 'sent'::app.notification_delivery_status
    end;
  elsif p_retryable and target.attempt_count < p_max_attempts then
    next_status := 'retry_scheduled';
    retry_at := statement_timestamp() + make_interval(secs => coalesce(
      p_retry_after_seconds, least(3600, 15 * (2 ^ greatest(target.attempt_count - 1, 0))::integer)
    ));
  else
    next_status := 'dead_lettered';
  end if;
  insert into app_private.notification_delivery_attempts (
    delivery_id, attempt_number, provider_key, outcome, retryable,
    provider_message_id, stable_error_code, sanitized_summary,
    provider_latency_ms, rate_limit_remaining
  ) values (
    target.id, target.attempt_count, target.provider_key,
    p_outcome::app_private.notification_attempt_outcome, p_retryable,
    p_provider_message_id, p_stable_error_code, p_sanitized_summary,
    p_provider_latency_ms, p_rate_limit_remaining
  );
  update app.notification_deliveries set
    status = next_status,
    next_retry_at = retry_at,
    claimed_at = null,
    claim_expires_at = null,
    provider_message_id = p_provider_message_id,
    stable_error_code = p_stable_error_code,
    sanitized_failure_summary = p_sanitized_summary,
    sent_at = case when next_status in ('sent', 'delivered') then statement_timestamp() else sent_at end,
    delivered_at = case when next_status = 'delivered' then statement_timestamp() else delivered_at end,
    failed_at = case when next_status = 'dead_lettered' then statement_timestamp() else failed_at end
  where id = target.id;
  if next_status = 'dead_lettered' then
    insert into app_private.notification_dead_letters (
      delivery_id, provider_key, final_error_code, sanitized_summary, attempt_count, failed_at
    ) values (
      target.id, target.provider_key, coalesce(p_stable_error_code, 'delivery_permanently_failed'),
      p_sanitized_summary, target.attempt_count, statement_timestamp()
    ) on conflict (delivery_id) do nothing;
  end if;
  return next_status;
end;
$$;

create or replace function api.service_request_notification_dead_letter_replay(
  p_dead_letter_id uuid,
  p_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare target app_private.notification_dead_letters%rowtype;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if char_length(p_idempotency_key) not between 8 and 200 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;
  select * into target from app_private.notification_dead_letters where id = p_dead_letter_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'notification_not_found'; end if;
  if target.resolution_status <> 'unresolved' then
    return target.replay_idempotency_key = p_idempotency_key;
  end if;
  update app_private.notification_dead_letters set
    resolution_status = 'replay_requested', replay_idempotency_key = p_idempotency_key,
    replay_requested_at = statement_timestamp()
  where id = target.id;
  update app.notification_deliveries set
    status = 'retry_scheduled', next_retry_at = statement_timestamp(),
    stable_error_code = null, sanitized_failure_summary = null
  where id = target.delivery_id;
  perform app_private.write_notification_audit(
    'notification_dead_letter_replay_requested', p_delivery_id := target.delivery_id,
    p_metadata := jsonb_build_object('deadLetterId', target.id)
  );
  return true;
end;
$$;

-- Transactional bridge for existing authoritative Identity security decisions.
create or replace function app_private.emit_identity_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare mapped_type app.notification_type;
begin
  mapped_type := case new.event_type
    when 'password_changed' then 'password_changed'::app.notification_type
    when 'account_deletion_requested' then 'account_deletion_requested'::app.notification_type
    when 'account_deletion_cancelled' then 'account_deletion_cancelled'::app.notification_type
    when 'username_changed' then 'sensitive_profile_change'::app.notification_type
    else null
  end;
  if mapped_type is not null then
    insert into app_private.notification_events (
      id, event_type, source_domain, target_user_id, occurred_at,
      schema_version, deduplication_key, correlation_id, safe_payload
    ) values (
      gen_random_uuid(), mapped_type, 'identity', new.user_id, new.occurred_at,
      1, 'identity-security-audit:' || new.id::text, gen_random_uuid(), '{}'::jsonb
    ) on conflict (deduplication_key) do nothing;
  end if;
  return new;
end;
$$;

create trigger security_audit_emit_notification_event
after insert on app_private.security_audit_log
for each row execute function app_private.emit_identity_notification_event();

revoke all on function
  app_private.write_notification_audit(text, uuid, uuid, uuid, uuid, jsonb),
  app_private.assert_notification_user_rate_limit(uuid, text, integer, interval),
  app_private.emit_identity_notification_event()
from public, anon, authenticated, service_role;
grant execute on function
  app_private.write_notification_audit(text, uuid, uuid, uuid, uuid, jsonb),
  app_private.assert_notification_user_rate_limit(uuid, text, integer, interval),
  app_private.emit_identity_notification_event()
to postgres;

revoke all on function
  api.get_my_notification_preferences(),
  api.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean, time, time, app.notification_digest_mode, integer),
  api.list_my_notifications(app.notification_category, timestamptz, uuid, integer),
  api.my_notification_unread_count(app.notification_category),
  api.mark_my_notification_read(uuid, boolean),
  api.mark_all_my_notifications_read(app.notification_category),
  api.dismiss_my_notification(uuid, boolean),
  api.register_my_notification_device(text, app.notification_device_platform, app.notification_push_provider, text, app.language_code, text, text),
  api.list_my_notification_devices(),
  api.disable_my_notification_device(uuid),
  api.unregister_my_notification_device(uuid),
  api.set_my_notification_subscription(app.notification_subscription_kind, uuid, boolean),
  api.service_ingest_notification_event(uuid, app.notification_type, app.notification_source_domain, uuid, uuid, timestamptz, integer, text, uuid, jsonb),
  api.service_claim_notification_event(uuid, integer),
  api.service_list_notification_audience(uuid, uuid, integer),
  api.service_create_user_notification(uuid, uuid, jsonb, app.notification_priority, app.notification_deep_link_target, uuid, timestamptz, text, text),
  api.service_checkpoint_notification_fanout(uuid, uuid, integer, integer, integer, integer, integer, boolean),
  api.service_upsert_notification_schedule(text, app.notification_type, app.notification_source_domain, uuid, uuid, timestamptz, text, jsonb),
  api.service_claim_notification_schedules(integer, integer),
  api.service_cancel_notification_schedule(uuid),
  api.service_claim_notification_deliveries(integer, integer),
  api.service_invalidate_notification_device(uuid, text),
  api.service_record_notification_delivery_attempt(uuid, text, boolean, text, text, text, integer, integer, integer, integer),
  api.service_request_notification_dead_letter_replay(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  api.get_my_notification_preferences(),
  api.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean, time, time, app.notification_digest_mode, integer),
  api.list_my_notifications(app.notification_category, timestamptz, uuid, integer),
  api.my_notification_unread_count(app.notification_category),
  api.mark_my_notification_read(uuid, boolean),
  api.mark_all_my_notifications_read(app.notification_category),
  api.dismiss_my_notification(uuid, boolean),
  api.register_my_notification_device(text, app.notification_device_platform, app.notification_push_provider, text, app.language_code, text, text),
  api.list_my_notification_devices(),
  api.disable_my_notification_device(uuid),
  api.unregister_my_notification_device(uuid),
  api.set_my_notification_subscription(app.notification_subscription_kind, uuid, boolean)
to authenticated;

grant execute on function
  api.service_ingest_notification_event(uuid, app.notification_type, app.notification_source_domain, uuid, uuid, timestamptz, integer, text, uuid, jsonb),
  api.service_claim_notification_event(uuid, integer),
  api.service_list_notification_audience(uuid, uuid, integer),
  api.service_create_user_notification(uuid, uuid, jsonb, app.notification_priority, app.notification_deep_link_target, uuid, timestamptz, text, text),
  api.service_checkpoint_notification_fanout(uuid, uuid, integer, integer, integer, integer, integer, boolean),
  api.service_upsert_notification_schedule(text, app.notification_type, app.notification_source_domain, uuid, uuid, timestamptz, text, jsonb),
  api.service_claim_notification_schedules(integer, integer),
  api.service_cancel_notification_schedule(uuid),
  api.service_claim_notification_deliveries(integer, integer),
  api.service_invalidate_notification_device(uuid, text),
  api.service_record_notification_delivery_attempt(uuid, text, boolean, text, text, text, integer, integer, integer, integer),
  api.service_request_notification_dead_letter_replay(uuid, text)
to service_role;
