-- BotolaGO V2 — Phase 5: trusted fan-out, scheduling, delivery, and audit state.

create type app_private.notification_fanout_status as enum (
  'pending', 'processing', 'completed', 'partially_failed', 'failed', 'cancelled'
);
create type app_private.notification_schedule_status as enum (
  'scheduled', 'claimed', 'completed', 'cancelled', 'retry_scheduled', 'failed'
);
create type app_private.notification_attempt_outcome as enum (
  'sent', 'delivered', 'retryable_failure', 'permanent_failure', 'cancelled'
);
create type app_private.notification_dead_letter_resolution as enum (
  'unresolved', 'replay_requested', 'replayed', 'discarded'
);

create table app_private.notification_fanout_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app_private.notification_events(id) on delete cascade,
  status app_private.notification_fanout_status not null default 'pending',
  checkpoint_user_id uuid,
  audience_count integer not null default 0,
  notifications_created integer not null default 0,
  deliveries_queued integer not null default 0,
  skipped_count integer not null default 0,
  rejected_count integer not null default 0,
  retry_count integer not null default 0,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  stable_error_code text,
  sanitized_error_summary text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_fanout_runs_event_key unique (event_id),
  constraint notification_fanout_runs_counts_check check (
    audience_count >= 0 and notifications_created >= 0 and deliveries_queued >= 0
    and skipped_count >= 0 and rejected_count >= 0 and retry_count between 0 and 20
  ),
  constraint notification_fanout_runs_claim_check check (
    (claimed_at is null and claim_expires_at is null)
    or (claimed_at is not null and claim_expires_at > claimed_at)
  ),
  constraint notification_fanout_runs_completion_check check (
    completed_at is null or started_at is null or completed_at >= started_at
  ),
  constraint notification_fanout_runs_error_check check (
    stable_error_code is null or stable_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint notification_fanout_runs_summary_check check (
    sanitized_error_summary is null or char_length(sanitized_error_summary) <= 500
  )
);

create table app_private.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references app_private.notification_events(id) on delete cascade,
  notification_type app.notification_type not null,
  source_domain app.notification_source_domain not null,
  source_entity_id uuid,
  target_user_id uuid references app.profiles(id) on delete cascade,
  due_at timestamptz not null,
  timezone_basis text not null default 'UTC',
  status app_private.notification_schedule_status not null default 'scheduled',
  idempotency_key text not null,
  safe_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz,
  stable_error_code text,
  sanitized_error_summary text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_schedules_idempotency_key unique (idempotency_key),
  constraint notification_schedules_idempotency_check check (
    char_length(idempotency_key) between 8 and 200 and idempotency_key = btrim(idempotency_key)
  ),
  constraint notification_schedules_timezone_check check (
    timezone_basis = 'UTC' or timezone_basis ~ '^[A-Za-z_+-]+(?:/[A-Za-z0-9_+.-]+)+$'
  ),
  constraint notification_schedules_payload_check check (
    jsonb_typeof(safe_payload) = 'object' and pg_column_size(safe_payload) <= 16384
  ),
  constraint notification_schedules_attempt_check check (attempt_count between 0 and 20),
  constraint notification_schedules_claim_check check (
    (claimed_at is null and claim_expires_at is null)
    or (claimed_at is not null and claim_expires_at > claimed_at)
  ),
  constraint notification_schedules_cancel_check check (
    cancelled_at is null or status = 'cancelled'
  ),
  constraint notification_schedules_error_check check (
    stable_error_code is null or stable_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint notification_schedules_summary_check check (
    sanitized_error_summary is null or char_length(sanitized_error_summary) <= 500
  )
);

create table app_private.push_destinations (
  device_registration_id uuid primary key references app.device_registrations(id) on delete cascade,
  destination_digest bytea not null unique,
  destination_value text not null,
  rotated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint push_destinations_value_check check (
    char_length(destination_value) between 16 and 4096
  ),
  constraint push_destinations_expiry_check check (
    expires_at is null or expires_at > rotated_at
  )
);

comment on table app_private.push_destinations is
  'Private push destinations. Never expose, log, or include in public DTOs; delete within seven days after invalidation.';

create table app_private.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references app.notification_deliveries(id) on delete cascade,
  attempt_number integer not null,
  provider_key text not null,
  outcome app_private.notification_attempt_outcome not null,
  retryable boolean not null,
  provider_message_id text,
  stable_error_code text,
  sanitized_summary text,
  provider_latency_ms integer,
  rate_limit_remaining integer,
  attempted_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint notification_delivery_attempts_number_check check (attempt_number between 1 and 20),
  constraint notification_delivery_attempts_provider_check check (
    provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint notification_delivery_attempts_error_check check (
    stable_error_code is null or stable_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint notification_delivery_attempts_summary_check check (
    sanitized_summary is null or char_length(sanitized_summary) <= 500
  ),
  constraint notification_delivery_attempts_latency_check check (
    provider_latency_ms is null or provider_latency_ms between 0 and 600000
  ),
  constraint notification_delivery_attempts_rate_limit_check check (
    rate_limit_remaining is null or rate_limit_remaining >= 0
  ),
  constraint notification_delivery_attempts_delivery_number_key unique (delivery_id, attempt_number)
);

create table app_private.notification_dead_letters (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references app.notification_deliveries(id) on delete cascade,
  provider_key text not null,
  final_error_code text not null,
  sanitized_summary text,
  attempt_count integer not null,
  failed_at timestamptz not null,
  resolution_status app_private.notification_dead_letter_resolution not null default 'unresolved',
  replay_idempotency_key text,
  replay_requested_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_dead_letters_provider_check check (
    provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint notification_dead_letters_error_check check (
    final_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint notification_dead_letters_summary_check check (
    sanitized_summary is null or char_length(sanitized_summary) <= 500
  ),
  constraint notification_dead_letters_attempt_check check (attempt_count between 1 and 20),
  constraint notification_dead_letters_replay_check check (
    (resolution_status = 'unresolved' and replay_idempotency_key is null and replay_requested_at is null and resolved_at is null)
    or (resolution_status = 'replay_requested' and replay_idempotency_key is not null and replay_requested_at is not null and resolved_at is null)
    or (resolution_status in ('replayed', 'discarded') and resolved_at is not null)
  )
);

create unique index notification_dead_letters_replay_key
  on app_private.notification_dead_letters (replay_idempotency_key)
  where replay_idempotency_key is not null;

create table app_private.notification_operational_audit (
  id bigint generated always as identity primary key,
  event_type text not null,
  actor_user_id uuid,
  notification_id uuid references app.notifications(id) on delete set null,
  delivery_id uuid references app.notification_deliveries(id) on delete set null,
  device_registration_id uuid references app.device_registrations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint notification_operational_audit_type_check check (
    event_type ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint notification_operational_audit_metadata_check check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8192
  )
);

comment on table app_private.notification_operational_audit is
  'Append-only, credential-redacted notification security/operations events. Retain 365 days.';

create or replace function app_private.is_service_request()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

create or replace function app_private.assert_valid_timezone(target_timezone text)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if target_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = target_timezone
  ) then
    raise exception using errcode = '22023', message = 'quiet_hours_invalid';
  end if;
end;
$$;

create or replace function app_private.validate_notification_preference_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform app_private.assert_valid_timezone(new.notification_timezone);
  return new;
end;
$$;

create trigger user_preferences_validate_notification_timezone
before insert or update of notification_timezone on app.user_preferences
for each row execute function app_private.validate_notification_preference_timezone();

create or replace function app_private.validate_device_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform app_private.assert_valid_timezone(new.timezone);
  return new;
end;
$$;

create trigger device_registrations_validate_timezone
before insert or update of timezone on app.device_registrations
for each row execute function app_private.validate_device_timezone();

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

  local_candidate := candidate_at at time zone target_timezone;
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

  return local_end at time zone target_timezone;
end;
$$;

create or replace function app_private.render_notification_template(
  template_text text,
  required_variables text[],
  variables jsonb
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  rendered text := template_text;
  required_key text;
  supplied_key text;
begin
  if jsonb_typeof(variables) <> 'object' then
    raise exception using errcode = '22023', message = 'template_variable_missing';
  end if;
  foreach required_key in array required_variables loop
    if required_key !~ '^[a-z][a-z0-9_]{0,39}$' or not variables ? required_key then
      raise exception using errcode = '22023', message = 'template_variable_missing';
    end if;
  end loop;
  for supplied_key in select jsonb_object_keys(variables) loop
    if not (supplied_key = any(required_variables)) then
      raise exception using errcode = '22023', message = 'template_variable_unknown';
    end if;
    rendered := replace(rendered, '{{' || supplied_key || '}}', variables ->> supplied_key);
  end loop;
  if rendered ~ '{{[a-z][a-z0-9_]*}}' then
    raise exception using errcode = '22023', message = 'template_variable_missing';
  end if;
  return rendered;
end;
$$;

create or replace function app_private.enforce_notification_delivery_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = new.status then return new; end if;
  if not (
    (old.status = 'pending' and new.status in ('claimed', 'cancelled'))
    or (old.status = 'claimed' and new.status in ('sent', 'delivered', 'retry_scheduled', 'failed', 'dead_lettered', 'cancelled'))
    or (old.status = 'retry_scheduled' and new.status in ('claimed', 'cancelled'))
    or (old.status = 'sent' and new.status in ('delivered', 'failed', 'dead_lettered'))
    or (old.status = 'failed' and new.status = 'dead_lettered')
    or (old.status = 'dead_lettered' and new.status = 'retry_scheduled')
  ) then
    raise exception using errcode = '23514', message = 'invalid_notification_delivery_state';
  end if;
  return new;
end;
$$;

create trigger notification_deliveries_validate_transition
before update of status on app.notification_deliveries
for each row execute function app_private.enforce_notification_delivery_transition();

create trigger notification_fanout_runs_set_updated_at
before update on app_private.notification_fanout_runs
for each row execute function app_private.set_updated_at();
create trigger notification_schedules_set_updated_at
before update on app_private.notification_schedules
for each row execute function app_private.set_updated_at();
create trigger push_destinations_set_updated_at
before update on app_private.push_destinations
for each row execute function app_private.set_updated_at();
create trigger notification_dead_letters_set_updated_at
before update on app_private.notification_dead_letters
for each row execute function app_private.set_updated_at();

alter table app_private.notification_fanout_runs enable row level security;
alter table app_private.notification_fanout_runs force row level security;
alter table app_private.notification_schedules enable row level security;
alter table app_private.notification_schedules force row level security;
alter table app_private.push_destinations enable row level security;
alter table app_private.push_destinations force row level security;
alter table app_private.notification_delivery_attempts enable row level security;
alter table app_private.notification_delivery_attempts force row level security;
alter table app_private.notification_dead_letters enable row level security;
alter table app_private.notification_dead_letters force row level security;
alter table app_private.notification_operational_audit enable row level security;
alter table app_private.notification_operational_audit force row level security;

revoke all on table
  app_private.notification_fanout_runs,
  app_private.notification_schedules,
  app_private.push_destinations,
  app_private.notification_delivery_attempts,
  app_private.notification_dead_letters,
  app_private.notification_operational_audit
from public, anon, authenticated, service_role;

revoke all on function
  app_private.is_service_request(),
  app_private.assert_valid_timezone(text),
  app_private.validate_notification_preference_timezone(),
  app_private.validate_device_timezone(),
  app_private.defer_for_quiet_hours(timestamptz, text, boolean, time, time, boolean),
  app_private.render_notification_template(text, text[], jsonb),
  app_private.enforce_notification_delivery_transition()
from public, anon, authenticated, service_role;

grant execute on function
  app_private.is_service_request(),
  app_private.assert_valid_timezone(text),
  app_private.validate_notification_preference_timezone(),
  app_private.validate_device_timezone(),
  app_private.defer_for_quiet_hours(timestamptz, text, boolean, time, time, boolean),
  app_private.render_notification_template(text, text[], jsonb),
  app_private.enforce_notification_delivery_transition()
to postgres;

-- Deterministic bilingual fixture templates. They enable local/staging tests,
-- not production provider delivery.
insert into app.notification_templates (
  template_key, notification_type, category, channel, language, version,
  title_template, body_template, required_variables, max_title_length,
  max_body_length, is_mandatory, bypass_quiet_hours, active, activated_at
)
values
  ('password_changed', 'password_changed', 'security', 'in_app', 'fr', 1,
    'Mot de passe modifié', 'Le mot de passe de votre compte BotolaGO a été modifié.', '{}', 120, 500, true, true, true, statement_timestamp()),
  ('password_changed', 'password_changed', 'security', 'in_app', 'ar', 1,
    'تم تغيير كلمة المرور', 'تم تغيير كلمة مرور حسابك في BotolaGO.', '{}', 120, 500, true, true, true, statement_timestamp()),
  ('account_deletion_requested', 'account_deletion_requested', 'account', 'in_app', 'fr', 1,
    'Suppression du compte demandée', 'Votre demande de suppression de compte a été enregistrée.', '{}', 120, 500, true, true, true, statement_timestamp()),
  ('account_deletion_requested', 'account_deletion_requested', 'account', 'in_app', 'ar', 1,
    'تم طلب حذف الحساب', 'تم تسجيل طلب حذف حسابك.', '{}', 120, 500, true, true, true, statement_timestamp()),
  ('match_starting', 'match_starting', 'football', 'in_app', 'fr', 1,
    'Le match commence bientôt', '{{home_team}} – {{away_team}} commence dans {{minutes}} min.', '{home_team,away_team,minutes}', 120, 500, false, false, true, statement_timestamp()),
  ('match_starting', 'match_starting', 'football', 'in_app', 'ar', 1,
    'المباراة ستبدأ قريبًا', 'تنطلق مباراة {{home_team}} – {{away_team}} بعد {{minutes}} دقيقة.', '{home_team,away_team,minutes}', 120, 500, false, false, true, statement_timestamp()),
  ('goal', 'goal', 'football', 'in_app', 'fr', 1,
    'But !', '{{team}} marque : {{home_score}}–{{away_score}}.', '{team,home_score,away_score}', 120, 500, false, false, true, statement_timestamp()),
  ('goal', 'goal', 'football', 'in_app', 'ar', 1,
    'هدف!', 'سجل {{team}}: {{home_score}}–{{away_score}}.', '{team,home_score,away_score}', 120, 500, false, false, true, statement_timestamp()),
  ('full_time', 'full_time', 'football', 'in_app', 'fr', 1,
    'Match terminé', '{{home_team}} {{home_score}}–{{away_score}} {{away_team}}.', '{home_team,away_team,home_score,away_score}', 120, 500, false, false, true, statement_timestamp()),
  ('full_time', 'full_time', 'football', 'in_app', 'ar', 1,
    'نهاية المباراة', '{{home_team}} {{home_score}}–{{away_score}} {{away_team}}.', '{home_team,away_team,home_score,away_score}', 120, 500, false, false, true, statement_timestamp()),
  ('breaking_news', 'breaking_news', 'news', 'in_app', 'fr', 1,
    'Dernière minute', '{{title}}', '{title}', 120, 500, false, false, true, statement_timestamp()),
  ('breaking_news', 'breaking_news', 'news', 'in_app', 'ar', 1,
    'خبر عاجل', '{{title}}', '{title}', 120, 500, false, false, true, statement_timestamp());
