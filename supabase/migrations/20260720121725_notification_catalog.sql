-- BotolaGO V2 — Phase 5: canonical notification catalog and user-owned state.
-- Additive only. The legacy project and archived migrations are not referenced.

create type app.notification_category as enum (
  'account', 'security', 'football', 'fantasy', 'news', 'system'
);

create type app.notification_type as enum (
  'email_verified',
  'password_changed',
  'account_deletion_requested',
  'account_deletion_cancelled',
  'new_session_detected',
  'sensitive_profile_change',
  'match_starting',
  'match_started',
  'goal',
  'half_time',
  'full_time',
  'lineup_available',
  'match_postponed',
  'match_cancelled',
  'followed_team_result',
  'deadline_24h',
  'deadline_1h',
  'team_incomplete',
  'transfer_confirmation',
  'chip_activated',
  'gameweek_finalized',
  'league_position_changed',
  'breaking_news',
  'followed_team_article',
  'followed_competition_article',
  'editorial_digest',
  'system_announcement'
);

create type app.notification_priority as enum ('low', 'normal', 'high', 'urgent');
create type app.notification_channel as enum ('in_app', 'push', 'email');
create type app.notification_source_domain as enum (
  'identity', 'football', 'news', 'fantasy', 'system'
);
create type app.notification_delivery_status as enum (
  'pending', 'claimed', 'sent', 'delivered', 'retry_scheduled',
  'failed', 'dead_lettered', 'cancelled'
);
create type app.notification_deep_link_target as enum (
  'none', 'match_detail', 'article', 'fantasy_team', 'fantasy_points',
  'fantasy_transfers', 'profile', 'settings', 'security_action'
);
create type app.notification_device_platform as enum ('web', 'ios', 'android');
create type app.notification_push_provider as enum (
  'fixture', 'web_push', 'fcm', 'apns', 'expo'
);
create type app.notification_digest_mode as enum ('immediate', 'daily', 'weekly');
create type app.notification_subscription_kind as enum (
  'match', 'team', 'competition', 'news_topic'
);
create type app.notification_event_status as enum (
  'pending', 'processing', 'completed', 'partially_failed', 'failed', 'cancelled'
);

-- Phase 2 remains the single source for user preference defaults. New fields
-- are added here rather than introducing a competing notification preference
-- record.
alter table app.user_preferences
  add column notifications_enabled boolean not null default true,
  add column in_app_notifications_enabled boolean not null default true,
  add column push_notifications_enabled boolean not null default false,
  add column email_notifications_enabled boolean not null default false,
  add column notification_timezone text not null default 'Africa/Casablanca',
  add column quiet_hours_enabled boolean not null default false,
  add column quiet_hours_start time,
  add column quiet_hours_end time,
  add column notification_digest_mode app.notification_digest_mode not null default 'immediate',
  add column fantasy_deadline_offset_minutes integer not null default 1440;

alter table app.user_preferences
  add constraint user_preferences_notification_timezone_check check (
    notification_timezone = 'UTC'
    or notification_timezone ~ '^[A-Za-z_+-]+(?:/[A-Za-z0-9_+.-]+)+$'
  ),
  add constraint user_preferences_quiet_hours_check check (
    (quiet_hours_enabled and quiet_hours_start is not null and quiet_hours_end is not null
      and quiet_hours_start <> quiet_hours_end)
    or
    (not quiet_hours_enabled and quiet_hours_start is null and quiet_hours_end is null)
  ),
  add constraint user_preferences_fantasy_deadline_offset_check check (
    fantasy_deadline_offset_minutes between 15 and 10080
  );

comment on column app.user_preferences.notification_timezone is
  'IANA timezone used for quiet hours and localized scheduling. UTC remains the persistence basis.';
comment on column app.user_preferences.push_notifications_enabled is
  'Defaults false until a user opts in and an approved provider is configured.';
comment on column app.user_preferences.email_notifications_enabled is
  'Product notification email preference; Supabase Auth emails remain controlled by Auth.';

create table app.notification_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  notification_type app.notification_type not null,
  category app.notification_category not null,
  channel app.notification_channel not null,
  language app.language_code not null,
  version integer not null,
  title_template text not null,
  body_template text not null,
  required_variables text[] not null default '{}',
  max_title_length integer not null,
  max_body_length integer not null,
  is_mandatory boolean not null default false,
  bypass_quiet_hours boolean not null default false,
  active boolean not null default false,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_templates_key_check check (
    template_key ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint notification_templates_version_check check (version > 0),
  constraint notification_templates_title_check check (
    char_length(btrim(title_template)) between 1 and 240
    and title_template = btrim(title_template)
  ),
  constraint notification_templates_body_check check (
    char_length(btrim(body_template)) between 1 and 4000
    and body_template = btrim(body_template)
  ),
  constraint notification_templates_variable_count_check check (
    cardinality(required_variables) <= 20
  ),
  constraint notification_templates_length_limit_check check (
    max_title_length between 1 and 240 and max_body_length between 1 and 4000
  ),
  constraint notification_templates_activation_check check (
    (active and activated_at is not null and retired_at is null)
    or (not active and (activated_at is null or retired_at is not null))
  ),
  constraint notification_templates_mandatory_check check (
    not is_mandatory or category in ('account', 'security')
  ),
  constraint notification_templates_key unique (template_key, channel, language, version)
);

create unique index notification_templates_one_active_key
  on app.notification_templates (template_key, channel, language)
  where active;

create table app_private.notification_events (
  id uuid primary key,
  event_type app.notification_type not null,
  source_domain app.notification_source_domain not null,
  source_entity_id uuid,
  target_user_id uuid references app.profiles(id) on delete cascade,
  occurred_at timestamptz not null,
  schema_version integer not null,
  deduplication_key text not null,
  correlation_id uuid not null,
  safe_payload jsonb not null default '{}'::jsonb,
  status app.notification_event_status not null default 'pending',
  received_at timestamptz not null default statement_timestamp(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  sanitized_error_code text,
  sanitized_error_summary text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_events_schema_version_check check (schema_version > 0),
  constraint notification_events_deduplication_key_check check (
    char_length(deduplication_key) between 8 and 200
    and deduplication_key = btrim(deduplication_key)
  ),
  constraint notification_events_payload_check check (
    jsonb_typeof(safe_payload) = 'object'
    and pg_column_size(safe_payload) <= 16384
  ),
  constraint notification_events_time_check check (
    occurred_at <= received_at + interval '5 minutes'
  ),
  constraint notification_events_completion_check check (
    completed_at is null or completed_at >= received_at
  ),
  constraint notification_events_error_check check (
    sanitized_error_code is null
    or sanitized_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint notification_events_summary_check check (
    sanitized_error_summary is null or char_length(sanitized_error_summary) <= 500
  ),
  constraint notification_events_deduplication_key unique (deduplication_key)
);

comment on table app_private.notification_events is
  'Trusted, validated domain-event boundary. Retain completed safe payloads for 30 days.';

create table app.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  event_id uuid not null references app_private.notification_events(id) on delete cascade,
  template_id uuid not null references app.notification_templates(id) on delete restrict,
  notification_type app.notification_type not null,
  category app.notification_category not null,
  priority app.notification_priority not null default 'normal',
  language app.language_code not null,
  title text not null,
  body text not null,
  deep_link_target app.notification_deep_link_target not null default 'none',
  deep_link_entity_id uuid,
  source_domain app.notification_source_domain not null,
  source_entity_id uuid,
  available_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notifications_title_check check (
    char_length(btrim(title)) between 1 and 240 and title = btrim(title)
  ),
  constraint notifications_body_check check (
    char_length(btrim(body)) between 1 and 4000 and body = btrim(body)
  ),
  constraint notifications_deep_link_check check (
    (deep_link_target in ('match_detail', 'article') and deep_link_entity_id is not null)
    or (deep_link_target not in ('match_detail', 'article') and deep_link_entity_id is null)
  ),
  constraint notifications_expiry_check check (
    expires_at is null or expires_at > available_at
  ),
  constraint notifications_read_check check (read_at is null or read_at >= created_at),
  constraint notifications_dismissed_check check (
    dismissed_at is null or dismissed_at >= created_at
  ),
  constraint notifications_archived_check check (
    archived_at is null or archived_at >= created_at
  ),
  constraint notifications_event_user_key unique (event_id, user_id)
);

create table app.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references app.notifications(id) on delete cascade,
  channel app.notification_channel not null,
  device_registration_id uuid,
  provider_key text not null,
  status app.notification_delivery_status not null default 'pending',
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  provider_message_id text,
  stable_error_code text,
  sanitized_failure_summary text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_deliveries_provider_key_check check (
    provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint notification_deliveries_attempt_check check (attempt_count between 0 and 20),
  constraint notification_deliveries_claim_check check (
    (claimed_at is null and claim_expires_at is null)
    or (claimed_at is not null and claim_expires_at > claimed_at)
  ),
  constraint notification_deliveries_error_code_check check (
    stable_error_code is null or stable_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint notification_deliveries_failure_summary_check check (
    sanitized_failure_summary is null or char_length(sanitized_failure_summary) <= 500
  ),
  constraint notification_deliveries_destination_check check (
    (channel = 'push' and device_registration_id is not null)
    or (channel <> 'push' and device_registration_id is null)
  ),
  constraint notification_deliveries_notification_channel_key
    unique nulls not distinct (notification_id, channel, device_registration_id)
);

create table app.device_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  device_id text not null,
  platform app.notification_device_platform not null,
  push_provider app.notification_push_provider not null,
  app_version text,
  locale app.language_code not null,
  timezone text not null default 'Africa/Casablanca',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default statement_timestamp(),
  invalidated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint device_registrations_device_id_check check (
    char_length(device_id) between 8 and 128
    and device_id ~ '^[A-Za-z0-9._:-]+$'
  ),
  constraint device_registrations_app_version_check check (
    app_version is null or (char_length(app_version) <= 40 and app_version ~ '^[A-Za-z0-9.+_-]+$')
  ),
  constraint device_registrations_timezone_check check (
    timezone = 'UTC' or timezone ~ '^[A-Za-z_+-]+(?:/[A-Za-z0-9_+.-]+)+$'
  ),
  constraint device_registrations_invalidation_check check (
    (enabled and invalidated_at is null) or (not enabled)
  ),
  constraint device_registrations_user_device_key unique (user_id, device_id)
);

create table app.notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  kind app.notification_subscription_kind not null,
  fixture_id uuid references app.fixtures(id) on delete cascade,
  team_id uuid references app.teams(id) on delete cascade,
  competition_id uuid references app.competitions(id) on delete cascade,
  news_topic_id uuid references app.taxonomies(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_subscriptions_target_check check (
    num_nonnulls(fixture_id, team_id, competition_id, news_topic_id) = 1
    and ((kind = 'match' and fixture_id is not null)
      or (kind = 'team' and team_id is not null)
      or (kind = 'competition' and competition_id is not null)
      or (kind = 'news_topic' and news_topic_id is not null))
  )
);

alter table app.notification_deliveries
  add constraint notification_deliveries_device_registration_fkey
  foreign key (device_registration_id) references app.device_registrations(id) on delete cascade;

create unique index notification_subscriptions_fixture_key
  on app.notification_subscriptions (user_id, fixture_id) where fixture_id is not null;
create unique index notification_subscriptions_team_key
  on app.notification_subscriptions (user_id, team_id) where team_id is not null;
create unique index notification_subscriptions_competition_key
  on app.notification_subscriptions (user_id, competition_id) where competition_id is not null;
create unique index notification_subscriptions_news_topic_key
  on app.notification_subscriptions (user_id, news_topic_id) where news_topic_id is not null;

create trigger notification_templates_set_updated_at
before update on app.notification_templates
for each row execute function app_private.set_updated_at();
create trigger notification_events_set_updated_at
before update on app_private.notification_events
for each row execute function app_private.set_updated_at();
create trigger notifications_set_updated_at
before update on app.notifications
for each row execute function app_private.set_updated_at();
create trigger notification_deliveries_set_updated_at
before update on app.notification_deliveries
for each row execute function app_private.set_updated_at();
create trigger device_registrations_set_updated_at
before update on app.device_registrations
for each row execute function app_private.set_updated_at();
create trigger notification_subscriptions_set_updated_at
before update on app.notification_subscriptions
for each row execute function app_private.set_updated_at();

alter table app.notification_templates enable row level security;
alter table app.notification_templates force row level security;
alter table app.notifications enable row level security;
alter table app.notifications force row level security;
alter table app.notification_deliveries enable row level security;
alter table app.notification_deliveries force row level security;
alter table app.device_registrations enable row level security;
alter table app.device_registrations force row level security;
alter table app.notification_subscriptions enable row level security;
alter table app.notification_subscriptions force row level security;
alter table app_private.notification_events enable row level security;
alter table app_private.notification_events force row level security;

revoke all on table
  app.notification_templates,
  app.notifications,
  app.notification_deliveries,
  app.device_registrations,
  app.notification_subscriptions,
  app_private.notification_events
from public, anon, authenticated, service_role;

revoke all on type
  app.notification_category,
  app.notification_type,
  app.notification_priority,
  app.notification_channel,
  app.notification_source_domain,
  app.notification_delivery_status,
  app.notification_deep_link_target,
  app.notification_device_platform,
  app.notification_push_provider,
  app.notification_digest_mode,
  app.notification_subscription_kind,
  app.notification_event_status
from public, anon, authenticated, service_role;

grant usage on type
  app.notification_category,
  app.notification_type,
  app.notification_priority,
  app.notification_channel,
  app.notification_source_domain,
  app.notification_delivery_status,
  app.notification_deep_link_target,
  app.notification_device_platform,
  app.notification_push_provider,
  app.notification_digest_mode,
  app.notification_subscription_kind,
  app.notification_event_status
to authenticated, service_role;

comment on table app.notifications is
  'Localized rendered user notification. Retain 180 days or 30 days after archive.';
comment on table app.notification_deliveries is
  'Per-channel delivery state. Provider-private attempts and destinations remain in app_private.';
comment on table app.device_registrations is
  'Safe device metadata only. Raw push destinations are isolated in app_private.';
