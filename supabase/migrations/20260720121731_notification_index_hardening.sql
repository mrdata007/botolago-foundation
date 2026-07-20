-- BotolaGO V2 — Phase 5: indexes and trusted operational summaries.

create index notification_templates_lookup_idx
  on app.notification_templates (template_key, channel, language, active, version desc);

create index notifications_user_feed_idx
  on app.notifications (user_id, created_at desc, id desc)
  include (category, notification_type, priority, language, read_at, available_at, expires_at)
  where archived_at is null;

create index notifications_user_unread_idx
  on app.notifications (user_id, category, created_at desc, id desc)
  where read_at is null and dismissed_at is null and archived_at is null;

create index notifications_event_idx on app.notifications (event_id, user_id);
create index notifications_template_idx on app.notifications (template_id, created_at desc);

create index notification_deliveries_claim_idx
  on app.notification_deliveries (coalesce(next_retry_at, created_at), id)
  include (channel, provider_key, attempt_count)
  where status in ('pending', 'retry_scheduled', 'claimed');
create index notification_deliveries_notification_idx
  on app.notification_deliveries (notification_id, status, channel, id);
create index notification_deliveries_device_idx
  on app.notification_deliveries (device_registration_id, status, id)
  where device_registration_id is not null;

create index device_registrations_user_seen_idx
  on app.device_registrations (user_id, last_seen_at desc, id);
create index device_registrations_active_user_idx
  on app.device_registrations (user_id, push_provider, id)
  where enabled and invalidated_at is null;

create index notification_subscriptions_fixture_audience_idx
  on app.notification_subscriptions (fixture_id, user_id) where enabled and fixture_id is not null;
create index notification_subscriptions_team_audience_idx
  on app.notification_subscriptions (team_id, user_id) where enabled and team_id is not null;
create index notification_subscriptions_competition_audience_idx
  on app.notification_subscriptions (competition_id, user_id) where enabled and competition_id is not null;
create index notification_subscriptions_topic_audience_idx
  on app.notification_subscriptions (news_topic_id, user_id) where enabled and news_topic_id is not null;

create index notification_events_pending_idx
  on app_private.notification_events (status, received_at, id)
  where status in ('pending', 'processing', 'partially_failed', 'failed');
create index notification_events_target_user_idx
  on app_private.notification_events (target_user_id, occurred_at desc, id)
  where target_user_id is not null;
create index notification_events_source_idx
  on app_private.notification_events (source_domain, source_entity_id, occurred_at desc, id);

create index notification_fanout_claim_idx
  on app_private.notification_fanout_runs (coalesce(claim_expires_at, created_at), id)
  where status in ('pending', 'processing', 'partially_failed', 'failed');

create index notification_schedules_due_idx
  on app_private.notification_schedules (coalesce(next_retry_at, due_at), id)
  where status in ('scheduled', 'retry_scheduled', 'claimed');
create index notification_schedules_target_user_idx
  on app_private.notification_schedules (target_user_id, due_at, id)
  where target_user_id is not null;
create index notification_schedules_event_idx
  on app_private.notification_schedules (event_id, id) where event_id is not null;

create index notification_delivery_attempts_delivery_idx
  on app_private.notification_delivery_attempts (delivery_id, attempt_number desc, id);
create index notification_delivery_attempts_outcome_idx
  on app_private.notification_delivery_attempts (outcome, attempted_at desc, id);
create index notification_dead_letters_status_idx
  on app_private.notification_dead_letters (resolution_status, failed_at, id);

create index notification_operational_audit_event_idx
  on app_private.notification_operational_audit (event_type, occurred_at desc, id);
create index notification_operational_audit_actor_idx
  on app_private.notification_operational_audit (actor_user_id, occurred_at desc, id)
  where actor_user_id is not null;
create index notification_operational_audit_notification_idx
  on app_private.notification_operational_audit (notification_id, occurred_at desc, id)
  where notification_id is not null;
create index notification_operational_audit_delivery_idx
  on app_private.notification_operational_audit (delivery_id, occurred_at desc, id)
  where delivery_id is not null;
create index notification_operational_audit_device_idx
  on app_private.notification_operational_audit (device_registration_id, occurred_at desc, id)
  where device_registration_id is not null;

create or replace function api.service_notification_metrics(
  p_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare since_at timestamptz := coalesce(p_since, statement_timestamp() - interval '24 hours');
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if since_at < statement_timestamp() - interval '90 days' or since_at > statement_timestamp() then
    raise exception using errcode = 'PT400', message = 'invalid_notification_metrics_range';
  end if;
  return jsonb_build_object(
    'since', since_at,
    'eventsReceived', (select count(*) from app_private.notification_events where received_at >= since_at),
    'eventsPending', (select count(*) from app_private.notification_events where status in ('pending', 'processing')),
    'notificationsCreated', (select count(*) from app.notifications where created_at >= since_at),
    'deliveriesQueued', (select count(*) from app.notification_deliveries where created_at >= since_at and channel <> 'in_app'),
    'deliveriesSent', (select count(*) from app.notification_deliveries where sent_at >= since_at),
    'deliveriesDelivered', (select count(*) from app.notification_deliveries where delivered_at >= since_at),
    'deliveriesRetrying', (select count(*) from app.notification_deliveries where status = 'retry_scheduled'),
    'deadLetters', (select count(*) from app_private.notification_dead_letters where failed_at >= since_at),
    'invalidDevices', (select count(*) from app.device_registrations where invalidated_at >= since_at),
    'scheduleLagSeconds', coalesce((select greatest(0, extract(epoch from statement_timestamp() - min(due_at)))::bigint
      from app_private.notification_schedules where status in ('scheduled', 'retry_scheduled') and due_at <= statement_timestamp()), 0)
  );
end;
$$;

revoke all on function api.service_notification_metrics(timestamptz)
from public, anon, authenticated, service_role;
grant execute on function api.service_notification_metrics(timestamptz) to service_role;
