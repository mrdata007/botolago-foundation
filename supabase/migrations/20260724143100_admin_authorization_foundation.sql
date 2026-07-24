-- BotolaGO Production V2
-- Phase 7A: Admin authorization and security foundation.
--
-- Supabase Auth remains the credential, verified-email, MFA, and session
-- authority. Administrative authorization is canonical database state under
-- app_private and is reachable only through explicitly granted api RPCs.

create type app_private.staff_principal_status as enum (
  'active',
  'suspended',
  'revoked'
);
create type app_private.staff_assignment_status as enum (
  'active',
  'expired',
  'revoked'
);
create type app_private.admin_approval_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired'
);
create type app_private.admin_approval_execution_status as enum (
  'not_started',
  'executing',
  'executed',
  'execution_failed'
);
create type app_private.admin_audit_outcome as enum (
  'succeeded',
  'denied',
  'failed'
);
create type app_private.staff_session_revocation_status as enum (
  'pending',
  'processing',
  'completed',
  'failed'
);

create table app_private.staff_principals (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  status app_private.staff_principal_status not null default 'active',
  mfa_required boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  suspended_at timestamptz,
  suspended_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  suspension_reason text,
  revoked_at timestamptz,
  revoked_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  revocation_reason text,
  constraint staff_principals_auth_user_key unique (auth_user_id),
  constraint staff_principals_suspension_check check (
    (
      status = 'suspended'
      and suspended_at is not null
      and suspension_reason is not null
      and suspension_reason = btrim(suspension_reason)
      and char_length(suspension_reason) between 8 and 500
      and revoked_at is null
    )
    or (
      status <> 'suspended'
      and suspended_at is null
      and suspended_by_principal_id is null
      and suspension_reason is null
    )
  ),
  constraint staff_principals_revocation_check check (
    (
      status = 'revoked'
      and revoked_at is not null
      and revocation_reason is not null
      and revocation_reason = btrim(revocation_reason)
      and char_length(revocation_reason) between 8 and 500
      and suspended_at is null
    )
    or (
      status <> 'revoked'
      and revoked_at is null
      and revoked_by_principal_id is null
      and revocation_reason is null
    )
  )
);
create index staff_principals_suspended_by_idx
  on app_private.staff_principals (suspended_by_principal_id)
  where suspended_by_principal_id is not null;
create index staff_principals_revoked_by_idx
  on app_private.staff_principals (revoked_by_principal_id)
  where revoked_by_principal_id is not null;

create table app_private.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_roles_name_key unique (name),
  constraint admin_roles_name_check check (name ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint admin_roles_description_check check (
    description = btrim(description) and char_length(description) between 8 and 500
  )
);

create table app_private.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  description text not null,
  active boolean not null default true,
  requires_mfa boolean not null default true,
  requires_recent_auth boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_permissions_name_key unique (name),
  constraint admin_permissions_name_check check (
    name ~ '^[a-z][a-z0-9_]{1,31}[.][a-z][a-z0-9_]{1,63}$'
  ),
  constraint admin_permissions_domain_check check (domain ~ '^[a-z][a-z0-9_]{2,31}$'),
  constraint admin_permissions_description_check check (
    description = btrim(description) and char_length(description) between 8 and 500
  )
);
create index admin_permissions_domain_name_idx
  on app_private.admin_permissions (domain, name);

create table app_private.admin_role_permissions (
  role_id uuid not null references app_private.admin_roles(id) on delete restrict,
  permission_id uuid not null references app_private.admin_permissions(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_role_permissions_pkey primary key (role_id, permission_id)
);
create index admin_role_permissions_permission_idx
  on app_private.admin_role_permissions (permission_id, role_id);

create table app_private.staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_principal_id uuid not null
    references app_private.staff_principals(id) on delete restrict,
  role_id uuid not null references app_private.admin_roles(id) on delete restrict,
  status app_private.staff_assignment_status not null default 'active',
  granted_by_principal_id uuid
    references app_private.staff_principals(id) on delete restrict,
  grant_reason text not null,
  grant_reference text,
  starts_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  renewed_from_assignment_id uuid
    references app_private.staff_role_assignments(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_principal_id uuid
    references app_private.staff_principals(id) on delete restrict,
  revocation_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint staff_role_assignments_reason_check check (
    grant_reason = btrim(grant_reason) and char_length(grant_reason) between 8 and 500
  ),
  constraint staff_role_assignments_reference_check check (
    grant_reference is null
    or (
      grant_reference = btrim(grant_reference)
      and char_length(grant_reference) between 3 and 200
      and grant_reference !~* '(token|password|secret|credential|api[_-]?key)'
    )
  ),
  constraint staff_role_assignments_time_check check (
    expires_at is null or expires_at > starts_at
  ),
  constraint staff_role_assignments_revocation_check check (
    (
      status = 'revoked'
      and revoked_at is not null
      and revoked_by_principal_id is not null
      and revocation_reason is not null
      and revocation_reason = btrim(revocation_reason)
      and char_length(revocation_reason) between 8 and 500
    )
    or (
      status <> 'revoked'
      and revoked_at is null
      and revoked_by_principal_id is null
      and revocation_reason is null
    )
  )
);
create unique index staff_role_assignments_one_active_role_idx
  on app_private.staff_role_assignments (staff_principal_id, role_id)
  where status = 'active';
create index staff_role_assignments_active_lookup_idx
  on app_private.staff_role_assignments (
    staff_principal_id, status, expires_at, role_id
  );
create index staff_role_assignments_role_history_idx
  on app_private.staff_role_assignments (role_id, created_at desc, id);
create index staff_role_assignments_grantor_idx
  on app_private.staff_role_assignments (granted_by_principal_id, created_at desc)
  where granted_by_principal_id is not null;
create index staff_role_assignments_revoker_idx
  on app_private.staff_role_assignments (revoked_by_principal_id, revoked_at desc)
  where revoked_by_principal_id is not null;
create index staff_role_assignments_renewed_from_idx
  on app_private.staff_role_assignments (renewed_from_assignment_id)
  where renewed_from_assignment_id is not null;

create table app_private.admin_approval_requests (
  id uuid primary key default gen_random_uuid(),
  requester_principal_id uuid not null
    references app_private.staff_principals(id) on delete restrict,
  required_permission_id uuid not null
    references app_private.admin_permissions(id) on delete restrict,
  target_domain text not null,
  target_entity_id uuid,
  operation_type text not null,
  payload_fingerprint text not null,
  safe_payload_reference jsonb not null,
  reason text not null,
  status app_private.admin_approval_status not null default 'pending',
  requested_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  decided_by_principal_id uuid
    references app_private.staff_principals(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text,
  execution_status app_private.admin_approval_execution_status not null default 'not_started',
  executed_by_principal_id uuid
    references app_private.staff_principals(id) on delete restrict,
  executed_at timestamptz,
  execution_result jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_approval_requests_domain_check check (
    target_domain ~ '^[a-z][a-z0-9_]{2,31}$'
  ),
  constraint admin_approval_requests_operation_check check (
    operation_type ~ '^[a-z][a-z0-9_]{1,31}[.][a-z][a-z0-9_]{2,63}$'
  ),
  constraint admin_approval_requests_fingerprint_check check (
    payload_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint admin_approval_requests_payload_check check (
    jsonb_typeof(safe_payload_reference) = 'object'
    and pg_column_size(safe_payload_reference) <= 4096
  ),
  constraint admin_approval_requests_reason_check check (
    reason = btrim(reason) and char_length(reason) between 8 and 500
  ),
  constraint admin_approval_requests_expiry_check check (
    expires_at > requested_at and expires_at <= requested_at + interval '24 hours'
  ),
  constraint admin_approval_requests_decision_check check (
    (
      status = 'pending'
      and decided_by_principal_id is null
      and decided_at is null
      and decision_reason is null
    )
    or (
      status in ('approved', 'rejected')
      and decided_by_principal_id is not null
      and decided_at is not null
      and decision_reason is not null
      and decision_reason = btrim(decision_reason)
      and char_length(decision_reason) between 8 and 500
    )
    or (
      status in ('cancelled', 'expired')
      and decided_at is not null
      and decision_reason is not null
      and decision_reason = btrim(decision_reason)
      and char_length(decision_reason) between 8 and 500
    )
  ),
  constraint admin_approval_requests_executor_check check (
    requester_principal_id is distinct from decided_by_principal_id
  ),
  constraint admin_approval_requests_execution_check check (
    (
      execution_status = 'not_started'
      and executed_by_principal_id is null
      and executed_at is null
      and execution_result is null
    )
    or (
      execution_status in ('executing', 'executed', 'execution_failed')
      and status = 'approved'
      and executed_by_principal_id is not null
    )
  )
);
create index admin_approval_requests_pending_idx
  on app_private.admin_approval_requests (status, expires_at, requested_at, id)
  where status = 'pending';
create index admin_approval_requests_target_idx
  on app_private.admin_approval_requests (
    target_domain, target_entity_id, requested_at desc, id
  );
create index admin_approval_requests_requester_idx
  on app_private.admin_approval_requests (
    requester_principal_id, requested_at desc, id
  );
create index admin_approval_requests_decider_idx
  on app_private.admin_approval_requests (
    decided_by_principal_id, decided_at desc, id
  ) where decided_by_principal_id is not null;
create index admin_approval_requests_executor_idx
  on app_private.admin_approval_requests (
    executed_by_principal_id, executed_at desc, id
  ) where executed_by_principal_id is not null;
create index admin_approval_requests_permission_idx
  on app_private.admin_approval_requests (required_permission_id, requested_at desc, id);

create table app_private.admin_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  actor_principal_id uuid not null
    references app_private.staff_principals(id) on delete restrict,
  operation_type text not null,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  response_payload jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '7 days'),
  constraint admin_idempotency_keys_actor_operation_key unique (
    actor_principal_id, operation_type, idempotency_key
  ),
  constraint admin_idempotency_keys_operation_check check (
    operation_type ~ '^[a-z][a-z0-9_]{1,31}[.][a-z][a-z0-9_]{2,63}$'
  ),
  constraint admin_idempotency_keys_fingerprint_check check (
    request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint admin_idempotency_keys_response_check check (
    response_payload is null
    or (
      jsonb_typeof(response_payload) = 'object'
      and pg_column_size(response_payload) <= 8192
    )
  ),
  constraint admin_idempotency_keys_expiry_check check (expires_at > created_at)
);
create index admin_idempotency_keys_expiry_idx
  on app_private.admin_idempotency_keys (expires_at, id);

create table app_private.staff_session_revocation_requests (
  id uuid primary key default gen_random_uuid(),
  staff_principal_id uuid not null
    references app_private.staff_principals(id) on delete restrict,
  requested_by_principal_id uuid
    references app_private.staff_principals(id) on delete restrict,
  reason text not null,
  status app_private.staff_session_revocation_status not null default 'pending',
  requested_at timestamptz not null default statement_timestamp(),
  claimed_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint staff_session_revocation_requests_reason_check check (
    reason = btrim(reason) and char_length(reason) between 8 and 500
  ),
  constraint staff_session_revocation_requests_attempt_check check (attempt_count >= 0),
  constraint staff_session_revocation_requests_error_check check (
    last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint staff_session_revocation_requests_lifecycle_check check (
    (status = 'pending' and claimed_at is null and completed_at is null)
    or (status in ('processing', 'failed') and claimed_at is not null and completed_at is null)
    or (status = 'completed' and claimed_at is not null and completed_at is not null)
  )
);
create index staff_session_revocation_requests_claim_idx
  on app_private.staff_session_revocation_requests (
    status, requested_at, id
  ) where status in ('pending', 'failed');
create index staff_session_revocation_requests_principal_idx
  on app_private.staff_session_revocation_requests (
    staff_principal_id, requested_at desc, id
  );
create index staff_session_revocation_requests_requester_idx
  on app_private.staff_session_revocation_requests (
    requested_by_principal_id, requested_at desc, id
  ) where requested_by_principal_id is not null;

create table app_private.admin_audit_events (
  id bigint generated always as identity primary key,
  actor_principal_id uuid,
  actor_auth_user_id uuid,
  effective_roles text[] not null default '{}',
  effective_permissions text[] not null default '{}',
  action text not null,
  target_domain text not null,
  target_entity_id uuid,
  reason text not null,
  request_id uuid not null,
  correlation_id uuid not null,
  approval_id uuid,
  safe_before jsonb,
  safe_after jsonb,
  environment text not null,
  outcome app_private.admin_audit_outcome not null,
  error_code text,
  synthetic_test boolean not null default false,
  occurred_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_audit_events_action_check check (
    action ~ '^[a-z][a-z0-9_]{1,31}[.][a-z][a-z0-9_]{2,63}$'
  ),
  constraint admin_audit_events_domain_check check (
    target_domain ~ '^[a-z][a-z0-9_]{2,31}$'
  ),
  constraint admin_audit_events_reason_check check (
    reason = btrim(reason) and char_length(reason) between 8 and 500
  ),
  constraint admin_audit_events_environment_check check (
    environment in ('local', 'test', 'staging', 'production', 'unknown')
  ),
  constraint admin_audit_events_error_check check (
    (outcome = 'succeeded' and error_code is null)
    or (
      outcome <> 'succeeded'
      and error_code is not null
      and error_code ~ '^[a-z][a-z0-9_]{2,79}$'
    )
  ),
  constraint admin_audit_events_summaries_check check (
    (safe_before is null or (jsonb_typeof(safe_before) = 'object' and pg_column_size(safe_before) <= 4096))
    and (safe_after is null or (jsonb_typeof(safe_after) = 'object' and pg_column_size(safe_after) <= 4096))
  )
);
create index admin_audit_events_actor_idx
  on app_private.admin_audit_events (
    actor_principal_id, occurred_at desc, id desc
  );
create index admin_audit_events_target_idx
  on app_private.admin_audit_events (
    target_domain, target_entity_id, occurred_at desc, id desc
  );
create index admin_audit_events_action_idx
  on app_private.admin_audit_events (action, occurred_at desc, id desc);
create index admin_audit_events_approval_idx
  on app_private.admin_audit_events (approval_id, occurred_at desc, id desc)
  where approval_id is not null;
create index admin_audit_events_synthetic_retention_idx
  on app_private.admin_audit_events (occurred_at, id)
  where synthetic_test;

alter table app_private.staff_principals enable row level security;
alter table app_private.staff_principals force row level security;
alter table app_private.admin_roles enable row level security;
alter table app_private.admin_roles force row level security;
alter table app_private.admin_permissions enable row level security;
alter table app_private.admin_permissions force row level security;
alter table app_private.admin_role_permissions enable row level security;
alter table app_private.admin_role_permissions force row level security;
alter table app_private.staff_role_assignments enable row level security;
alter table app_private.staff_role_assignments force row level security;
alter table app_private.admin_approval_requests enable row level security;
alter table app_private.admin_approval_requests force row level security;
alter table app_private.admin_idempotency_keys enable row level security;
alter table app_private.admin_idempotency_keys force row level security;
alter table app_private.staff_session_revocation_requests enable row level security;
alter table app_private.staff_session_revocation_requests force row level security;
alter table app_private.admin_audit_events enable row level security;
alter table app_private.admin_audit_events force row level security;

create trigger staff_principals_set_updated_at
before update on app_private.staff_principals
for each row execute function app_private.set_updated_at();
create trigger admin_roles_set_updated_at
before update on app_private.admin_roles
for each row execute function app_private.set_updated_at();
create trigger admin_permissions_set_updated_at
before update on app_private.admin_permissions
for each row execute function app_private.set_updated_at();
create trigger admin_role_permissions_set_updated_at
before update on app_private.admin_role_permissions
for each row execute function app_private.set_updated_at();
create trigger staff_role_assignments_set_updated_at
before update on app_private.staff_role_assignments
for each row execute function app_private.set_updated_at();
create trigger admin_approval_requests_set_updated_at
before update on app_private.admin_approval_requests
for each row execute function app_private.set_updated_at();
create trigger admin_idempotency_keys_set_updated_at
before update on app_private.admin_idempotency_keys
for each row execute function app_private.set_updated_at();
create trigger staff_session_revocation_requests_set_updated_at
before update on app_private.staff_session_revocation_requests
for each row execute function app_private.set_updated_at();

insert into app_private.admin_roles (name, description)
values
  ('editor', 'Creates and reviews editorial drafts without publishing authority.'),
  ('publisher', 'Reviews and publishes editorial content without staff-management authority.'),
  ('content_admin', 'Manages the full editorial taxonomy, placement, review, and publishing surface.'),
  ('football_operator', 'Operates provider mappings, ingestion, and reviewed Football corrections.'),
  ('fantasy_operator', 'Operates Fantasy seasons, gameweeks, points corrections, and rankings.'),
  ('notification_operator', 'Inspects and operates notification templates, delivery, and dead letters.'),
  ('support_agent', 'Reads bounded user support context and revokes user sessions.'),
  ('moderator', 'Performs bounded user moderation and account-deletion processing.'),
  ('security_admin', 'Reads privileged audit and manages or revokes staff access.'),
  ('platform_admin', 'Holds every explicit platform permission without bypassing security controls.');

insert into app_private.admin_permissions (
  name, domain, description, requires_recent_auth
)
values
  ('editorial.read', 'editorial', 'Reads protected editorial operations data.', false),
  ('editorial.write', 'editorial', 'Creates and updates editorial draft content.', false),
  ('editorial.review', 'editorial', 'Reviews editorial content and revisions.', false),
  ('editorial.publish', 'editorial', 'Publishes or archives reviewed editorial content.', true),
  ('editorial.manage_taxonomy', 'editorial', 'Manages controlled editorial taxonomy records.', true),
  ('editorial.manage_placements', 'editorial', 'Manages featured and placement configuration.', true),
  ('football.read_operations', 'football', 'Reads Football ingestion and operations state.', false),
  ('football.manage_mappings', 'football', 'Manages canonical provider identity mappings.', true),
  ('football.correct', 'football', 'Corrects finalized canonical Football records.', true),
  ('football.manage_ingestion', 'football', 'Controls Football ingestion operations.', true),
  ('fantasy.read_operations', 'fantasy', 'Reads Fantasy operations and processing state.', false),
  ('fantasy.configure_season', 'fantasy', 'Configures or activates Fantasy seasons.', true),
  ('fantasy.manage_gameweeks', 'fantasy', 'Controls Fantasy gameweek lifecycle operations.', true),
  ('fantasy.correct_points', 'fantasy', 'Corrects finalized Fantasy scoring results.', true),
  ('fantasy.manage_rankings', 'fantasy', 'Recalculates or corrects Fantasy rankings.', true),
  ('notifications.read_operations', 'notifications', 'Reads notification delivery operations.', false),
  ('notifications.manage_templates', 'notifications', 'Manages notification templates.', true),
  ('notifications.inspect_delivery', 'notifications', 'Inspects bounded notification delivery details.', false),
  ('notifications.replay_dead_letters', 'notifications', 'Replays reviewed dead-letter deliveries.', true),
  ('notifications.test_delivery', 'notifications', 'Sends controlled provider test deliveries.', true),
  ('users.read_support', 'users', 'Reads bounded user support context.', false),
  ('users.revoke_sessions', 'users', 'Revokes user Auth sessions through a trusted server.', true),
  ('users.moderate', 'users', 'Applies reviewed user moderation actions.', true),
  ('users.process_deletion', 'users', 'Processes permanent account-deletion requests.', true),
  ('security.read_audit', 'security', 'Reads bounded privileged audit events.', false),
  ('security.manage_staff', 'security', 'Assigns, renews, suspends, or restores staff access.', true),
  ('security.revoke_staff', 'security', 'Revokes staff roles and emergency staff access.', true),
  ('jobs.read', 'jobs', 'Reads background-job operations state.', false),
  ('jobs.run', 'jobs', 'Runs an approved background job.', true),
  ('jobs.pause', 'jobs', 'Pauses an approved background job.', true),
  ('jobs.resume', 'jobs', 'Resumes an approved background job.', true),
  ('jobs.replay', 'jobs', 'Replays an approved background job scope.', true),
  ('releases.read', 'releases', 'Reads release and migration promotion state.', false),
  ('releases.promote', 'releases', 'Promotes a reviewed release or migration set.', true);

with role_permissions(role_name, permission_name) as (
  values
    ('editor', 'editorial.read'),
    ('editor', 'editorial.write'),
    ('editor', 'editorial.review'),
    ('publisher', 'editorial.read'),
    ('publisher', 'editorial.review'),
    ('publisher', 'editorial.publish'),
    ('content_admin', 'editorial.read'),
    ('content_admin', 'editorial.write'),
    ('content_admin', 'editorial.review'),
    ('content_admin', 'editorial.publish'),
    ('content_admin', 'editorial.manage_taxonomy'),
    ('content_admin', 'editorial.manage_placements'),
    ('football_operator', 'football.read_operations'),
    ('football_operator', 'football.manage_mappings'),
    ('football_operator', 'football.correct'),
    ('football_operator', 'football.manage_ingestion'),
    ('fantasy_operator', 'fantasy.read_operations'),
    ('fantasy_operator', 'fantasy.configure_season'),
    ('fantasy_operator', 'fantasy.manage_gameweeks'),
    ('fantasy_operator', 'fantasy.correct_points'),
    ('fantasy_operator', 'fantasy.manage_rankings'),
    ('notification_operator', 'notifications.read_operations'),
    ('notification_operator', 'notifications.manage_templates'),
    ('notification_operator', 'notifications.inspect_delivery'),
    ('notification_operator', 'notifications.replay_dead_letters'),
    ('notification_operator', 'notifications.test_delivery'),
    ('support_agent', 'users.read_support'),
    ('support_agent', 'users.revoke_sessions'),
    ('moderator', 'users.read_support'),
    ('moderator', 'users.revoke_sessions'),
    ('moderator', 'users.moderate'),
    ('moderator', 'users.process_deletion'),
    ('security_admin', 'security.read_audit'),
    ('security_admin', 'security.manage_staff'),
    ('security_admin', 'security.revoke_staff'),
    ('security_admin', 'users.revoke_sessions'),
    ('platform_admin', 'editorial.read'),
    ('platform_admin', 'editorial.write'),
    ('platform_admin', 'editorial.review'),
    ('platform_admin', 'editorial.publish'),
    ('platform_admin', 'editorial.manage_taxonomy'),
    ('platform_admin', 'editorial.manage_placements'),
    ('platform_admin', 'football.read_operations'),
    ('platform_admin', 'football.manage_mappings'),
    ('platform_admin', 'football.correct'),
    ('platform_admin', 'football.manage_ingestion'),
    ('platform_admin', 'fantasy.read_operations'),
    ('platform_admin', 'fantasy.configure_season'),
    ('platform_admin', 'fantasy.manage_gameweeks'),
    ('platform_admin', 'fantasy.correct_points'),
    ('platform_admin', 'fantasy.manage_rankings'),
    ('platform_admin', 'notifications.read_operations'),
    ('platform_admin', 'notifications.manage_templates'),
    ('platform_admin', 'notifications.inspect_delivery'),
    ('platform_admin', 'notifications.replay_dead_letters'),
    ('platform_admin', 'notifications.test_delivery'),
    ('platform_admin', 'users.read_support'),
    ('platform_admin', 'users.revoke_sessions'),
    ('platform_admin', 'users.moderate'),
    ('platform_admin', 'users.process_deletion'),
    ('platform_admin', 'security.read_audit'),
    ('platform_admin', 'security.manage_staff'),
    ('platform_admin', 'security.revoke_staff'),
    ('platform_admin', 'jobs.read'),
    ('platform_admin', 'jobs.run'),
    ('platform_admin', 'jobs.pause'),
    ('platform_admin', 'jobs.resume'),
    ('platform_admin', 'jobs.replay'),
    ('platform_admin', 'releases.read'),
    ('platform_admin', 'releases.promote')
)
insert into app_private.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permissions mapping
join app_private.admin_roles role on role.name = mapping.role_name
join app_private.admin_permissions permission on permission.name = mapping.permission_name;

create or replace function app_private.prevent_admin_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'audit_access_denied';
end;
$$;

create trigger admin_audit_events_append_only
before update or delete on app_private.admin_audit_events
for each row execute function app_private.prevent_admin_audit_mutation();

create or replace function app_private.admin_environment()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case nullif(current_setting('app.environment', true), '')
    when 'local' then 'local'
    when 'test' then 'test'
    when 'staging' then 'staging'
    when 'production' then 'production'
    else 'unknown'
  end;
$$;

create or replace function app_private.admin_payload_fingerprint(payload jsonb)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select encode(extensions.digest(payload::text, 'sha256'), 'hex');
$$;

create or replace function app_private.admin_current_session_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  session_id_text text := auth.jwt() ->> 'session_id';
begin
  if session_id_text is null
    or session_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    raise exception using errcode = 'PT401', message = 'staff_access_denied';
  end if;
  return session_id_text::uuid;
end;
$$;

create or replace function app_private.admin_effective_roles(
  p_principal_id uuid,
  p_at timestamptz default statement_timestamp()
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(role.name order by role.name), '{}'::text[])
  from app_private.staff_role_assignments assignment
  join app_private.admin_roles role on role.id = assignment.role_id
  where assignment.staff_principal_id = p_principal_id
    and assignment.status = 'active'
    and assignment.starts_at <= p_at
    and (assignment.expires_at is null or assignment.expires_at > p_at)
    and role.active;
$$;

create or replace function app_private.admin_effective_permissions(
  p_principal_id uuid,
  p_at timestamptz default statement_timestamp()
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct permission.name order by permission.name), '{}'::text[])
  from app_private.staff_role_assignments assignment
  join app_private.admin_roles role on role.id = assignment.role_id
  join app_private.admin_role_permissions mapping on mapping.role_id = role.id
  join app_private.admin_permissions permission on permission.id = mapping.permission_id
  where assignment.staff_principal_id = p_principal_id
    and assignment.status = 'active'
    and assignment.starts_at <= p_at
    and (assignment.expires_at is null or assignment.expires_at > p_at)
    and role.active
    and permission.active;
$$;

create or replace function app_private.admin_has_permission(
  p_principal_id uuid,
  p_permission_name text,
  p_at timestamptz default statement_timestamp()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_private.staff_role_assignments assignment
    join app_private.admin_roles role on role.id = assignment.role_id
    join app_private.admin_role_permissions mapping on mapping.role_id = role.id
    join app_private.admin_permissions permission on permission.id = mapping.permission_id
    where assignment.staff_principal_id = p_principal_id
      and assignment.status = 'active'
      and assignment.starts_at <= p_at
      and (assignment.expires_at is null or assignment.expires_at > p_at)
      and role.active
      and permission.active
      and permission.name = p_permission_name
  );
$$;

create or replace function app_private.admin_assert_principal(
  p_require_mfa boolean default true,
  p_require_recent_auth boolean default false
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  principal app_private.staff_principals%rowtype;
  session_id uuid;
  session_created_at timestamptz;
  has_verified_factor boolean;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'staff_access_denied';
  end if;

  select *
  into principal
  from app_private.staff_principals
  where auth_user_id = current_user_id;

  if not found then
    raise exception using errcode = 'PT403', message = 'staff_access_denied';
  end if;
  if principal.status = 'suspended' then
    raise exception using errcode = 'PT403', message = 'staff_suspended';
  end if;
  if principal.status = 'revoked' then
    raise exception using errcode = 'PT403', message = 'staff_revoked';
  end if;

  if not exists (
    select 1 from auth.users
    where id = current_user_id and email_confirmed_at is not null
  ) then
    raise exception using errcode = 'PT403', message = 'staff_access_denied';
  end if;

  session_id := app_private.admin_current_session_id();
  select session.created_at
  into session_created_at
  from auth.sessions session
  where session.id = session_id and session.user_id = current_user_id;
  if not found then
    raise exception using errcode = 'PT401', message = 'staff_access_denied';
  end if;

  if p_require_mfa or principal.mfa_required then
    select exists (
      select 1
      from auth.mfa_factors factor
      where factor.user_id = current_user_id and factor.status::text = 'verified'
    )
    into has_verified_factor;

    if not has_verified_factor then
      raise exception using errcode = 'PT403', message = 'mfa_required';
    end if;
    if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
      raise exception using errcode = 'PT403', message = 'mfa_assurance_insufficient';
    end if;
  end if;

  if p_require_recent_auth
    and session_created_at < statement_timestamp() - interval '15 minutes'
  then
    raise exception using errcode = 'PT403', message = 'recent_auth_required';
  end if;

  return principal.id;
end;
$$;

create or replace function app_private.admin_assert_permission(
  p_permission_name text,
  p_require_recent_auth boolean default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  permission app_private.admin_permissions%rowtype;
  principal_id uuid;
begin
  select *
  into permission
  from app_private.admin_permissions
  where name = p_permission_name and active;
  if not found then
    raise exception using errcode = 'PT403', message = 'permission_missing';
  end if;

  principal_id := app_private.admin_assert_principal(
    permission.requires_mfa,
    coalesce(p_require_recent_auth, permission.requires_recent_auth)
  );

  if not app_private.admin_has_permission(principal_id, p_permission_name) then
    if exists (
      select 1
      from app_private.staff_role_assignments assignment
      join app_private.admin_role_permissions mapping on mapping.role_id = assignment.role_id
      where assignment.staff_principal_id = principal_id
        and mapping.permission_id = permission.id
        and (
          assignment.status = 'expired'
          or (
            assignment.status = 'active'
            and assignment.expires_at is not null
            and assignment.expires_at <= statement_timestamp()
          )
        )
    ) then
      raise exception using errcode = 'PT403', message = 'staff_role_expired';
    end if;
    raise exception using errcode = 'PT403', message = 'permission_missing';
  end if;

  return principal_id;
end;
$$;

create or replace function app_private.write_admin_audit(
  p_actor_principal_id uuid,
  p_action text,
  p_target_domain text,
  p_target_entity_id uuid,
  p_reason text,
  p_request_id uuid,
  p_correlation_id uuid,
  p_approval_id uuid default null,
  p_safe_before jsonb default null,
  p_safe_after jsonb default null,
  p_outcome app_private.admin_audit_outcome default 'succeeded',
  p_error_code text default null,
  p_synthetic_test boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_id bigint;
  actor_user_id uuid;
begin
  if p_actor_principal_id is not null then
    select auth_user_id into actor_user_id
    from app_private.staff_principals
    where id = p_actor_principal_id;
  end if;

  insert into app_private.admin_audit_events (
    actor_principal_id,
    actor_auth_user_id,
    effective_roles,
    effective_permissions,
    action,
    target_domain,
    target_entity_id,
    reason,
    request_id,
    correlation_id,
    approval_id,
    safe_before,
    safe_after,
    environment,
    outcome,
    error_code,
    synthetic_test
  )
  values (
    p_actor_principal_id,
    actor_user_id,
    case
      when p_actor_principal_id is null then '{}'::text[]
      else app_private.admin_effective_roles(p_actor_principal_id)
    end,
    case
      when p_actor_principal_id is null then '{}'::text[]
      else app_private.admin_effective_permissions(p_actor_principal_id)
    end,
    p_action,
    p_target_domain,
    p_target_entity_id,
    p_reason,
    p_request_id,
    p_correlation_id,
    p_approval_id,
    p_safe_before,
    p_safe_after,
    app_private.admin_environment(),
    p_outcome,
    p_error_code,
    p_synthetic_test
  )
  returning id into audit_id;

  return audit_id;
end;
$$;

create or replace function app_private.admin_begin_idempotent_operation(
  p_actor_principal_id uuid,
  p_operation_type text,
  p_idempotency_key uuid,
  p_request_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fingerprint text := app_private.admin_payload_fingerprint(p_request_payload);
  existing app_private.admin_idempotency_keys%rowtype;
begin
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'idempotency_conflict';
  end if;

  insert into app_private.admin_idempotency_keys (
    actor_principal_id, operation_type, idempotency_key, request_fingerprint
  )
  values (
    p_actor_principal_id, p_operation_type, p_idempotency_key, fingerprint
  )
  on conflict (actor_principal_id, operation_type, idempotency_key) do nothing;

  select *
  into existing
  from app_private.admin_idempotency_keys
  where actor_principal_id = p_actor_principal_id
    and operation_type = p_operation_type
    and idempotency_key = p_idempotency_key
  for update;

  if existing.request_fingerprint <> fingerprint then
    raise exception using errcode = 'PT409', message = 'idempotency_conflict';
  end if;

  return existing.response_payload;
end;
$$;

create or replace function app_private.admin_complete_idempotent_operation(
  p_actor_principal_id uuid,
  p_operation_type text,
  p_idempotency_key uuid,
  p_response_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app_private.admin_idempotency_keys
  set response_payload = p_response_payload
  where actor_principal_id = p_actor_principal_id
    and operation_type = p_operation_type
    and idempotency_key = p_idempotency_key;

  if not found then
    raise exception using errcode = 'PT409', message = 'idempotency_conflict';
  end if;
  return p_response_payload;
end;
$$;

create or replace function app_private.queue_staff_session_revocation(
  p_staff_principal_id uuid,
  p_requested_by_principal_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  insert into app_private.staff_session_revocation_requests (
    staff_principal_id, requested_by_principal_id, reason
  )
  values (p_staff_principal_id, p_requested_by_principal_id, p_reason)
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function api.get_my_staff_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  principal app_private.staff_principals%rowtype;
  session_id uuid;
  has_verified_factor boolean;
  email_verified boolean;
  current_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  roles jsonb;
  permissions jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'staff_access_denied';
  end if;

  select *
  into principal
  from app_private.staff_principals
  where auth_user_id = current_user_id;
  if not found then
    raise exception using errcode = 'PT403', message = 'staff_access_denied';
  end if;

  session_id := app_private.admin_current_session_id();
  if not exists (
    select 1 from auth.sessions
    where id = session_id and user_id = current_user_id
  ) then
    raise exception using errcode = 'PT401', message = 'staff_access_denied';
  end if;

  select user_record.email_confirmed_at is not null
  into email_verified
  from auth.users user_record
  where user_record.id = current_user_id;

  select exists (
    select 1 from auth.mfa_factors factor
    where factor.user_id = current_user_id and factor.status::text = 'verified'
  )
  into has_verified_factor;

  if principal.status = 'active' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', role.name,
          'expiresAt', assignment.expires_at
        )
        order by role.name
      ),
      '[]'::jsonb
    )
    into roles
    from app_private.staff_role_assignments assignment
    join app_private.admin_roles role on role.id = assignment.role_id
    where assignment.staff_principal_id = principal.id
      and assignment.status = 'active'
      and assignment.starts_at <= statement_timestamp()
      and (
        assignment.expires_at is null
        or assignment.expires_at > statement_timestamp()
      )
      and role.active;

    select coalesce(jsonb_agg(permission_name order by permission_name), '[]'::jsonb)
    into permissions
    from unnest(app_private.admin_effective_permissions(principal.id)) permission_name;
  else
    roles := '[]'::jsonb;
    permissions := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'staffPrincipalId', principal.id,
    'status', principal.status,
    'roles', roles,
    'permissions', permissions,
    'emailVerified', coalesce(email_verified, false),
    'mfaRequired', principal.mfa_required,
    'mfaEnrolled', has_verified_factor,
    'currentAal', current_aal,
    'recentAuthRequired', true,
    'recentAuthWindowSeconds', 900,
    'accessAllowed',
      principal.status = 'active'
      and coalesce(email_verified, false)
      and has_verified_factor
      and current_aal = 'aal2',
    'suspended', principal.status = 'suspended',
    'revoked', principal.status = 'revoked'
  );
end;
$$;

create or replace function api.admin_bootstrap_first_platform_admin(
  p_auth_user_id uuid,
  p_reason text default 'Initial platform administrator bootstrap',
  p_synthetic_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_record auth.users%rowtype;
  platform_role_id uuid;
  principal_id uuid;
  assignment_id uuid;
  request_id uuid := gen_random_uuid();
  correlation_id uuid := gen_random_uuid();
  existing_platform_principal_id uuid;
begin
  if p_auth_user_id is null then
    raise exception using errcode = 'PT400', message = 'staff_principal_not_found';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  select *
  into user_record
  from auth.users
  where id = p_auth_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_principal_not_found';
  end if;
  if user_record.email_confirmed_at is null then
    raise exception using errcode = 'PT403', message = 'staff_access_denied';
  end if;
  if not exists (
    select 1
    from auth.mfa_factors factor
    where factor.user_id = p_auth_user_id and factor.status::text = 'verified'
  ) then
    raise exception using errcode = 'PT403', message = 'mfa_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('admin-bootstrap', 0));

  select role.id into platform_role_id
  from app_private.admin_roles role
  where role.name = 'platform_admin' and role.active;
  if not found then
    raise exception using errcode = 'PT500', message = 'staff_role_invalid';
  end if;

  select assignment.staff_principal_id
  into existing_platform_principal_id
  from app_private.staff_role_assignments assignment
  where assignment.role_id = platform_role_id
    and assignment.status = 'active'
    and (
      assignment.expires_at is null
      or assignment.expires_at > statement_timestamp()
    )
  order by assignment.created_at, assignment.id
  limit 1;

  if existing_platform_principal_id is not null then
    if exists (
      select 1 from app_private.staff_principals principal
      where principal.id = existing_platform_principal_id
        and principal.auth_user_id = p_auth_user_id
        and principal.status = 'active'
    ) then
      select assignment.id
      into assignment_id
      from app_private.staff_role_assignments assignment
      where assignment.staff_principal_id = existing_platform_principal_id
        and assignment.role_id = platform_role_id
        and assignment.status = 'active'
      order by assignment.created_at, assignment.id
      limit 1;
      return jsonb_build_object(
        'staffPrincipalId', existing_platform_principal_id,
        'assignmentId', assignment_id,
        'role', 'platform_admin',
        'created', false
      );
    end if;
    raise exception using errcode = 'PT409', message = 'staff_role_conflict';
  end if;

  insert into app_private.staff_principals (auth_user_id)
  values (p_auth_user_id)
  on conflict (auth_user_id) do update
  set updated_at = app_private.staff_principals.updated_at
  returning id into principal_id;

  if exists (
    select 1 from app_private.staff_principals principal
    where principal.id = principal_id and principal.status <> 'active'
  ) then
    raise exception using errcode = 'PT403', message = 'staff_revoked';
  end if;

  insert into app_private.staff_role_assignments (
    staff_principal_id,
    role_id,
    grant_reason,
    grant_reference
  )
  values (
    principal_id,
    platform_role_id,
    p_reason,
    'bootstrap:first-platform-admin'
  )
  returning id into assignment_id;

  perform app_private.write_admin_audit(
    null,
    'security.bootstrap_platform_admin',
    'security',
    principal_id,
    p_reason,
    request_id,
    correlation_id,
    null,
    null,
    jsonb_build_object(
      'staffPrincipalId', principal_id,
      'assignmentId', assignment_id,
      'role', 'platform_admin',
      'bootstrap', true
    ),
    'succeeded',
    null,
    p_synthetic_test
  );

  return jsonb_build_object(
    'staffPrincipalId', principal_id,
    'assignmentId', assignment_id,
    'role', 'platform_admin',
    'created', true
  );
end;
$$;

create or replace function api.admin_request_approval(
  p_required_permission text,
  p_target_domain text,
  p_target_entity_id uuid,
  p_operation_type text,
  p_safe_payload_reference jsonb,
  p_reason text,
  p_expires_at timestamptz,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_principal_id uuid;
  required_permission_id uuid;
  approval_id uuid;
  correlation_id uuid := gen_random_uuid();
  request_payload jsonb;
  prior_response jsonb;
  result jsonb;
  target_user_id uuid;
  actor_user_id uuid;
  assignment_expires_at timestamptz;
  canonical_payload jsonb;
begin
  actor_principal_id := app_private.admin_assert_permission(
    p_required_permission, true
  );

  if p_operation_type <> 'staff.assign_platform_admin'
    or p_required_permission <> 'security.manage_staff'
    or p_target_domain <> 'security'
  then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;
  if p_safe_payload_reference is null
    or jsonb_typeof(p_safe_payload_reference) <> 'object'
    or pg_column_size(p_safe_payload_reference) > 4096
    or p_safe_payload_reference ->> 'role' <> 'platform_admin'
    or coalesce(p_safe_payload_reference ->> 'targetAuthUserId', '')
      !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;
  target_user_id := (p_safe_payload_reference ->> 'targetAuthUserId')::uuid;
  if p_target_entity_id is distinct from target_user_id then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;
  begin
    assignment_expires_at :=
      nullif(p_safe_payload_reference ->> 'expiresAt', '')::timestamptz;
  exception
    when invalid_datetime_format then
      raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end;
  if assignment_expires_at is not null
    and assignment_expires_at <= statement_timestamp()
  then
    raise exception using errcode = 'PT400', message = 'staff_role_expired';
  end if;
  canonical_payload := jsonb_build_object(
    'targetAuthUserId', target_user_id,
    'role', 'platform_admin',
    'expiresAt', assignment_expires_at
  );
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;
  if p_expires_at is null
    or p_expires_at <= statement_timestamp()
    or p_expires_at > statement_timestamp() + interval '24 hours'
  then
    raise exception using errcode = 'PT400', message = 'approval_expired';
  end if;

  select auth_user_id into actor_user_id
  from app_private.staff_principals
  where id = actor_principal_id;
  if actor_user_id = target_user_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;

  select id into required_permission_id
  from app_private.admin_permissions
  where name = p_required_permission and active;
  if not found then
    raise exception using errcode = 'PT403', message = 'permission_missing';
  end if;

  request_payload := jsonb_build_object(
    'requiredPermission', p_required_permission,
    'targetDomain', p_target_domain,
    'targetEntityId', p_target_entity_id,
    'operationType', p_operation_type,
    'safePayloadReference', canonical_payload,
    'reason', p_reason,
    'expiresAt', p_expires_at
  );
  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'approval.request',
    p_idempotency_key,
    request_payload
  );
  if prior_response is not null then
    return prior_response;
  end if;

  insert into app_private.admin_approval_requests (
    requester_principal_id,
    required_permission_id,
    target_domain,
    target_entity_id,
    operation_type,
    payload_fingerprint,
    safe_payload_reference,
    reason,
    expires_at,
    correlation_id
  )
  values (
    actor_principal_id,
    required_permission_id,
    p_target_domain,
    p_target_entity_id,
    p_operation_type,
    app_private.admin_payload_fingerprint(canonical_payload),
    canonical_payload,
    p_reason,
    p_expires_at,
    correlation_id
  )
  returning id into approval_id;

  perform app_private.write_admin_audit(
    actor_principal_id,
    'approval.request',
    p_target_domain,
    p_target_entity_id,
    p_reason,
    p_idempotency_key,
    correlation_id,
    approval_id,
    null,
    jsonb_build_object(
      'status', 'pending',
      'operationType', p_operation_type,
      'payloadFingerprint', app_private.admin_payload_fingerprint(canonical_payload),
      'expiresAt', p_expires_at
    )
  );

  result := jsonb_build_object(
    'approvalId', approval_id,
    'status', 'pending',
    'operationType', p_operation_type,
    'payloadFingerprint', app_private.admin_payload_fingerprint(canonical_payload),
    'expiresAt', p_expires_at,
    'correlationId', correlation_id
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'approval.request', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_approve_request(
  p_approval_id uuid,
  p_payload_fingerprint text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval app_private.admin_approval_requests%rowtype;
  permission_name text;
  actor_principal_id uuid;
  request_payload jsonb;
  prior_response jsonb;
  result jsonb;
begin
  if p_approval_id is null then
    raise exception using errcode = 'PT404', message = 'approval_not_found';
  end if;

  select request.*
  into approval
  from app_private.admin_approval_requests request
  where request.id = p_approval_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'approval_not_found';
  end if;
  select permission.name into permission_name
  from app_private.admin_permissions permission
  where permission.id = approval.required_permission_id;

  actor_principal_id := app_private.admin_assert_permission(permission_name, true);
  if actor_principal_id = approval.requester_principal_id then
    raise exception using errcode = 'PT403', message = 'self_approval_forbidden';
  end if;
  if approval.payload_fingerprint <> p_payload_fingerprint then
    raise exception using errcode = 'PT409', message = 'approval_payload_mismatch';
  end if;
  if approval.expires_at <= statement_timestamp() then
    update app_private.admin_approval_requests
    set
      status = 'expired',
      decided_at = statement_timestamp(),
      decision_reason = 'Approval expired before a second operator approved it.'
    where id = approval.id and status = 'pending';
    raise exception using errcode = 'PT410', message = 'approval_expired';
  end if;

  request_payload := jsonb_build_object(
    'approvalId', p_approval_id,
    'payloadFingerprint', p_payload_fingerprint,
    'reason', p_reason
  );
  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id, 'approval.approve', p_idempotency_key, request_payload
  );
  if prior_response is not null then
    return prior_response;
  end if;

  if approval.status = 'approved' then
    result := jsonb_build_object(
      'approvalId', approval.id,
      'status', approval.status,
      'decidedAt', approval.decided_at
    );
    return app_private.admin_complete_idempotent_operation(
      actor_principal_id, 'approval.approve', p_idempotency_key, result
    );
  end if;
  if approval.status <> 'pending' then
    raise exception using errcode = 'PT409', message = 'approval_expired';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;

  update app_private.admin_approval_requests
  set
    status = 'approved',
    decided_by_principal_id = actor_principal_id,
    decided_at = statement_timestamp(),
    decision_reason = p_reason
  where id = approval.id;

  perform app_private.write_admin_audit(
    actor_principal_id,
    'approval.approve',
    approval.target_domain,
    approval.target_entity_id,
    p_reason,
    p_idempotency_key,
    approval.correlation_id,
    approval.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved')
  );

  result := jsonb_build_object(
    'approvalId', approval.id,
    'status', 'approved',
    'decidedAt', statement_timestamp()
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'approval.approve', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_reject_request(
  p_approval_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval app_private.admin_approval_requests%rowtype;
  permission_name text;
  actor_principal_id uuid;
  prior_response jsonb;
  result jsonb;
begin
  select request.*
  into approval
  from app_private.admin_approval_requests request
  where request.id = p_approval_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'approval_not_found';
  end if;
  select permission.name into permission_name
  from app_private.admin_permissions permission
  where permission.id = approval.required_permission_id;
  actor_principal_id := app_private.admin_assert_permission(permission_name, true);
  if actor_principal_id = approval.requester_principal_id then
    raise exception using errcode = 'PT403', message = 'self_approval_forbidden';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'approval.reject',
    p_idempotency_key,
    jsonb_build_object('approvalId', p_approval_id, 'reason', p_reason)
  );
  if prior_response is not null then
    return prior_response;
  end if;
  if approval.status <> 'pending' then
    raise exception using errcode = 'PT409', message = 'approval_expired';
  end if;

  update app_private.admin_approval_requests
  set
    status = 'rejected',
    decided_by_principal_id = actor_principal_id,
    decided_at = statement_timestamp(),
    decision_reason = p_reason
  where id = approval.id;

  perform app_private.write_admin_audit(
    actor_principal_id,
    'approval.reject',
    approval.target_domain,
    approval.target_entity_id,
    p_reason,
    p_idempotency_key,
    approval.correlation_id,
    approval.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'rejected')
  );
  result := jsonb_build_object(
    'approvalId', approval.id,
    'status', 'rejected',
    'decidedAt', statement_timestamp()
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'approval.reject', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_cancel_request(
  p_approval_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval app_private.admin_approval_requests%rowtype;
  actor_principal_id uuid;
  prior_response jsonb;
  result jsonb;
begin
  actor_principal_id := app_private.admin_assert_principal(true, true);
  select *
  into approval
  from app_private.admin_approval_requests
  where id = p_approval_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'approval_not_found';
  end if;
  if approval.requester_principal_id <> actor_principal_id then
    raise exception using errcode = 'PT403', message = 'staff_access_denied';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'approval.cancel',
    p_idempotency_key,
    jsonb_build_object('approvalId', p_approval_id, 'reason', p_reason)
  );
  if prior_response is not null then
    return prior_response;
  end if;
  if approval.status <> 'pending' then
    raise exception using errcode = 'PT409', message = 'approval_expired';
  end if;

  update app_private.admin_approval_requests
  set
    status = 'cancelled',
    decided_at = statement_timestamp(),
    decision_reason = p_reason
  where id = approval.id;

  perform app_private.write_admin_audit(
    actor_principal_id,
    'approval.cancel',
    approval.target_domain,
    approval.target_entity_id,
    p_reason,
    p_idempotency_key,
    approval.correlation_id,
    approval.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'cancelled')
  );
  result := jsonb_build_object(
    'approvalId', approval.id,
    'status', 'cancelled',
    'decidedAt', statement_timestamp()
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'approval.cancel', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_get_approval(p_approval_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval app_private.admin_approval_requests%rowtype;
  permission_name text;
  actor_principal_id uuid;
begin
  select request.*
  into approval
  from app_private.admin_approval_requests request
  where request.id = p_approval_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'approval_not_found';
  end if;
  select permission.name into permission_name
  from app_private.admin_permissions permission
  where permission.id = approval.required_permission_id;
  actor_principal_id := app_private.admin_assert_principal(true, false);
  if actor_principal_id <> approval.requester_principal_id
    and not app_private.admin_has_permission(actor_principal_id, permission_name)
  then
    raise exception using errcode = 'PT403', message = 'staff_access_denied';
  end if;

  return jsonb_build_object(
    'approvalId', approval.id,
    'status',
      case
        when approval.status = 'pending' and approval.expires_at <= statement_timestamp()
          then 'expired'
        else approval.status::text
      end,
    'operationType', approval.operation_type,
    'targetDomain', approval.target_domain,
    'targetEntityId', approval.target_entity_id,
    'payloadFingerprint', approval.payload_fingerprint,
    'reason', approval.reason,
    'requestedAt', approval.requested_at,
    'expiresAt', approval.expires_at,
    'decidedAt', approval.decided_at,
    'executionStatus', approval.execution_status,
    'executedAt', approval.executed_at,
    'correlationId', approval.correlation_id
  );
end;
$$;

create or replace function api.admin_assign_role(
  p_target_auth_user_id uuid,
  p_role_name text,
  p_expires_at timestamptz,
  p_reason text,
  p_reference text,
  p_idempotency_key uuid,
  p_approval_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_principal_id uuid;
  actor_auth_user_id uuid;
  target_principal app_private.staff_principals%rowtype;
  target_user auth.users%rowtype;
  role_record app_private.admin_roles%rowtype;
  assignment_id uuid;
  revocation_request_id uuid;
  request_payload jsonb;
  prior_response jsonb;
  result jsonb;
  approval app_private.admin_approval_requests%rowtype;
  expected_approval_payload jsonb;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff', true
  );
  select auth_user_id into actor_auth_user_id
  from app_private.staff_principals where id = actor_principal_id;

  if p_target_auth_user_id is null then
    raise exception using errcode = 'PT404', message = 'staff_principal_not_found';
  end if;
  if actor_auth_user_id = p_target_auth_user_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_role_name is null or p_role_name !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;
  if p_expires_at is not null and p_expires_at <= statement_timestamp() then
    raise exception using errcode = 'PT400', message = 'staff_role_expired';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  select * into target_user
  from auth.users
  where id = p_target_auth_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_principal_not_found';
  end if;
  if target_user.email_confirmed_at is null then
    raise exception using errcode = 'PT403', message = 'staff_access_denied';
  end if;
  if not exists (
    select 1 from auth.mfa_factors factor
    where factor.user_id = p_target_auth_user_id and factor.status::text = 'verified'
  ) then
    raise exception using errcode = 'PT403', message = 'mfa_required';
  end if;

  select * into role_record
  from app_private.admin_roles
  where name = p_role_name and active;
  if not found then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  expected_approval_payload := jsonb_build_object(
    'targetAuthUserId', p_target_auth_user_id,
    'role', p_role_name,
    'expiresAt', p_expires_at
  );
  if p_role_name = 'platform_admin' then
    if p_approval_id is null then
      raise exception using errcode = 'PT403', message = 'approval_required';
    end if;
    select * into approval
    from app_private.admin_approval_requests
    where id = p_approval_id
    for update;
    if not found then
      raise exception using errcode = 'PT404', message = 'approval_not_found';
    end if;
    if approval.status <> 'approved'
      or approval.expires_at <= statement_timestamp()
      or approval.operation_type <> 'staff.assign_platform_admin'
      or approval.target_domain <> 'security'
      or approval.target_entity_id is distinct from p_target_auth_user_id
      or approval.payload_fingerprint
        <> app_private.admin_payload_fingerprint(expected_approval_payload)
    then
      raise exception using errcode = 'PT409', message = 'approval_payload_mismatch';
    end if;
    if approval.execution_status = 'executed' then
      raise exception using errcode = 'PT409', message = 'operation_already_executed';
    end if;
  end if;

  request_payload := jsonb_build_object(
    'targetAuthUserId', p_target_auth_user_id,
    'role', p_role_name,
    'expiresAt', p_expires_at,
    'reason', p_reason,
    'reference', p_reference,
    'approvalId', p_approval_id
  );
  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.assign_role',
    p_idempotency_key,
    request_payload
  );
  if prior_response is not null then
    return prior_response;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('staff:' || p_target_auth_user_id::text, 0)
  );

  insert into app_private.staff_principals (auth_user_id)
  values (p_target_auth_user_id)
  on conflict (auth_user_id) do update
  set updated_at = app_private.staff_principals.updated_at
  returning * into target_principal;

  if target_principal.status = 'suspended' then
    raise exception using errcode = 'PT403', message = 'staff_suspended';
  end if;
  if target_principal.status = 'revoked' then
    raise exception using errcode = 'PT403', message = 'staff_revoked';
  end if;

  update app_private.staff_role_assignments
  set status = 'expired'
  where staff_principal_id = target_principal.id
    and role_id = role_record.id
    and status = 'active'
    and expires_at is not null
    and expires_at <= statement_timestamp();

  if exists (
    select 1
    from app_private.staff_role_assignments assignment
    where assignment.staff_principal_id = target_principal.id
      and assignment.role_id = role_record.id
      and assignment.status = 'active'
  ) then
    raise exception using errcode = 'PT409', message = 'staff_role_conflict';
  end if;

  insert into app_private.staff_role_assignments (
    staff_principal_id,
    role_id,
    granted_by_principal_id,
    grant_reason,
    grant_reference,
    expires_at
  )
  values (
    target_principal.id,
    role_record.id,
    actor_principal_id,
    p_reason,
    p_reference,
    p_expires_at
  )
  returning id into assignment_id;

  revocation_request_id := app_private.queue_staff_session_revocation(
    target_principal.id,
    actor_principal_id,
    'Staff role assignment changed the privileged session scope.'
  );

  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.assign_role',
    'security',
    target_principal.id,
    p_reason,
    p_idempotency_key,
    correlation_id,
    p_approval_id,
    null,
    jsonb_build_object(
      'assignmentId', assignment_id,
      'role', p_role_name,
      'expiresAt', p_expires_at,
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', target_principal.id,
    'assignmentId', assignment_id,
    'role', p_role_name,
    'status', 'active',
    'expiresAt', p_expires_at,
    'sessionRevocationRequestId', revocation_request_id
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'staff.assign_role', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_revoke_role(
  p_assignment_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_principal_id uuid;
  assignment app_private.staff_role_assignments%rowtype;
  role_name text;
  revocation_request_id uuid;
  prior_response jsonb;
  result jsonb;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.revoke_staff', true
  );
  select * into assignment
  from app_private.staff_role_assignments
  where id = p_assignment_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_assignment_not_found';
  end if;
  if assignment.staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;
  select name into role_name from app_private.admin_roles where id = assignment.role_id;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.revoke_role',
    p_idempotency_key,
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'reason', p_reason
    )
  );
  if prior_response is not null then
    return prior_response;
  end if;

  if assignment.status = 'revoked' then
    result := jsonb_build_object(
      'staffPrincipalId', assignment.staff_principal_id,
      'assignmentId', assignment.id,
      'role', role_name,
      'status', 'revoked',
      'revokedAt', assignment.revoked_at
    );
    return app_private.admin_complete_idempotent_operation(
      actor_principal_id, 'staff.revoke_role', p_idempotency_key, result
    );
  end if;

  update app_private.staff_role_assignments
  set
    status = 'revoked',
    revoked_at = statement_timestamp(),
    revoked_by_principal_id = actor_principal_id,
    revocation_reason = p_reason
  where id = assignment.id;

  revocation_request_id := app_private.queue_staff_session_revocation(
    assignment.staff_principal_id,
    actor_principal_id,
    'Staff role revocation requires privileged session invalidation.'
  );
  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.revoke_role',
    'security',
    assignment.staff_principal_id,
    p_reason,
    p_idempotency_key,
    correlation_id,
    null,
    jsonb_build_object(
      'assignmentId', assignment.id,
      'role', role_name,
      'status', assignment.status
    ),
    jsonb_build_object(
      'assignmentId', assignment.id,
      'role', role_name,
      'status', 'revoked',
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', assignment.staff_principal_id,
    'assignmentId', assignment.id,
    'role', role_name,
    'status', 'revoked',
    'revokedAt', statement_timestamp(),
    'sessionRevocationRequestId', revocation_request_id
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'staff.revoke_role', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_renew_role(
  p_assignment_id uuid,
  p_expires_at timestamptz,
  p_reason text,
  p_reference text,
  p_idempotency_key uuid,
  p_approval_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_principal_id uuid;
  assignment app_private.staff_role_assignments%rowtype;
  role_record app_private.admin_roles%rowtype;
  target_auth_user_id uuid;
  new_assignment_id uuid;
  revocation_request_id uuid;
  prior_response jsonb;
  result jsonb;
  approval app_private.admin_approval_requests%rowtype;
  expected_approval_payload jsonb;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff', true
  );
  select * into assignment
  from app_private.staff_role_assignments
  where id = p_assignment_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_assignment_not_found';
  end if;
  if assignment.staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_expires_at is null or p_expires_at <= statement_timestamp() then
    raise exception using errcode = 'PT400', message = 'staff_role_expired';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  select * into role_record
  from app_private.admin_roles where id = assignment.role_id;
  select auth_user_id into target_auth_user_id
  from app_private.staff_principals where id = assignment.staff_principal_id;

  expected_approval_payload := jsonb_build_object(
    'targetAuthUserId', target_auth_user_id,
    'role', role_record.name,
    'expiresAt', p_expires_at
  );
  if role_record.name = 'platform_admin' then
    if p_approval_id is null then
      raise exception using errcode = 'PT403', message = 'approval_required';
    end if;
    select * into approval
    from app_private.admin_approval_requests
    where id = p_approval_id
    for update;
    if not found then
      raise exception using errcode = 'PT404', message = 'approval_not_found';
    end if;
    if approval.status <> 'approved'
      or approval.expires_at <= statement_timestamp()
      or approval.operation_type <> 'staff.assign_platform_admin'
      or approval.target_entity_id is distinct from target_auth_user_id
      or approval.payload_fingerprint
        <> app_private.admin_payload_fingerprint(expected_approval_payload)
    then
      raise exception using errcode = 'PT409', message = 'approval_payload_mismatch';
    end if;
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.renew_role',
    p_idempotency_key,
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'expiresAt', p_expires_at,
      'reason', p_reason,
      'reference', p_reference,
      'approvalId', p_approval_id
    )
  );
  if prior_response is not null then
    return prior_response;
  end if;

  if exists (
    select 1
    from app_private.staff_role_assignments current_assignment
    where current_assignment.staff_principal_id = assignment.staff_principal_id
      and current_assignment.role_id = assignment.role_id
      and current_assignment.status = 'active'
      and current_assignment.id <> assignment.id
  ) then
    raise exception using errcode = 'PT409', message = 'staff_role_conflict';
  end if;

  if assignment.status = 'active' then
    update app_private.staff_role_assignments
    set
      status = 'revoked',
      revoked_at = statement_timestamp(),
      revoked_by_principal_id = actor_principal_id,
      revocation_reason = 'Superseded by an explicitly renewed assignment.'
    where id = assignment.id;
  end if;

  insert into app_private.staff_role_assignments (
    staff_principal_id,
    role_id,
    granted_by_principal_id,
    grant_reason,
    grant_reference,
    expires_at,
    renewed_from_assignment_id
  )
  values (
    assignment.staff_principal_id,
    assignment.role_id,
    actor_principal_id,
    p_reason,
    p_reference,
    p_expires_at,
    assignment.id
  )
  returning id into new_assignment_id;

  revocation_request_id := app_private.queue_staff_session_revocation(
    assignment.staff_principal_id,
    actor_principal_id,
    'Staff role renewal requires privileged session invalidation.'
  );
  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.renew_role',
    'security',
    assignment.staff_principal_id,
    p_reason,
    p_idempotency_key,
    correlation_id,
    p_approval_id,
    jsonb_build_object(
      'assignmentId', assignment.id,
      'role', role_record.name,
      'status', assignment.status,
      'expiresAt', assignment.expires_at
    ),
    jsonb_build_object(
      'assignmentId', new_assignment_id,
      'role', role_record.name,
      'status', 'active',
      'expiresAt', p_expires_at,
      'renewedFromAssignmentId', assignment.id,
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', assignment.staff_principal_id,
    'assignmentId', new_assignment_id,
    'role', role_record.name,
    'status', 'active',
    'expiresAt', p_expires_at,
    'renewedFromAssignmentId', assignment.id,
    'sessionRevocationRequestId', revocation_request_id
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'staff.renew_role', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_suspend_staff(
  p_staff_principal_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_principal_id uuid;
  target app_private.staff_principals%rowtype;
  prior_response jsonb;
  revocation_request_id uuid;
  result jsonb;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.revoke_staff', true
  );
  if p_staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  select * into target
  from app_private.staff_principals
  where id = p_staff_principal_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_principal_not_found';
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.suspend',
    p_idempotency_key,
    jsonb_build_object(
      'staffPrincipalId', p_staff_principal_id,
      'reason', p_reason
    )
  );
  if prior_response is not null then
    return prior_response;
  end if;
  if target.status = 'revoked' then
    raise exception using errcode = 'PT403', message = 'staff_revoked';
  end if;

  if target.status = 'active' then
    update app_private.staff_principals
    set
      status = 'suspended',
      suspended_at = statement_timestamp(),
      suspended_by_principal_id = actor_principal_id,
      suspension_reason = p_reason
    where id = target.id;
  end if;

  revocation_request_id := app_private.queue_staff_session_revocation(
    target.id,
    actor_principal_id,
    'Staff suspension requires privileged session invalidation.'
  );
  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.suspend_staff',
    'security',
    target.id,
    p_reason,
    p_idempotency_key,
    correlation_id,
    null,
    jsonb_build_object('status', target.status),
    jsonb_build_object(
      'status', 'suspended',
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', target.id,
    'status', 'suspended',
    'sessionRevocationRequestId', revocation_request_id
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'staff.suspend', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_restore_staff(
  p_staff_principal_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_principal_id uuid;
  target app_private.staff_principals%rowtype;
  prior_response jsonb;
  revocation_request_id uuid;
  result jsonb;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff', true
  );
  if p_staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  select * into target
  from app_private.staff_principals
  where id = p_staff_principal_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_principal_not_found';
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.restore',
    p_idempotency_key,
    jsonb_build_object(
      'staffPrincipalId', p_staff_principal_id,
      'reason', p_reason
    )
  );
  if prior_response is not null then
    return prior_response;
  end if;
  if target.status = 'revoked' then
    raise exception using errcode = 'PT403', message = 'staff_revoked';
  end if;
  if target.status <> 'suspended' then
    raise exception using errcode = 'PT409', message = 'staff_role_conflict';
  end if;

  update app_private.staff_principals
  set
    status = 'active',
    suspended_at = null,
    suspended_by_principal_id = null,
    suspension_reason = null
  where id = target.id;

  revocation_request_id := app_private.queue_staff_session_revocation(
    target.id,
    actor_principal_id,
    'Staff restoration requires a fresh privileged Auth session.'
  );
  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.restore_staff',
    'security',
    target.id,
    p_reason,
    p_idempotency_key,
    correlation_id,
    null,
    jsonb_build_object('status', target.status),
    jsonb_build_object(
      'status', 'active',
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', target.id,
    'status', 'active',
    'sessionRevocationRequestId', revocation_request_id
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'staff.restore', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_emergency_revoke_staff(
  p_staff_principal_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_principal_id uuid;
  target app_private.staff_principals%rowtype;
  prior_response jsonb;
  revocation_request_id uuid;
  result jsonb;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.revoke_staff', true
  );
  if p_staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  select * into target
  from app_private.staff_principals
  where id = p_staff_principal_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_principal_not_found';
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.emergency_revoke',
    p_idempotency_key,
    jsonb_build_object(
      'staffPrincipalId', p_staff_principal_id,
      'reason', p_reason
    )
  );
  if prior_response is not null then
    return prior_response;
  end if;

  if target.status <> 'revoked' then
    update app_private.staff_principals
    set
      status = 'revoked',
      suspended_at = null,
      suspended_by_principal_id = null,
      suspension_reason = null,
      revoked_at = statement_timestamp(),
      revoked_by_principal_id = actor_principal_id,
      revocation_reason = p_reason
    where id = target.id;

    update app_private.staff_role_assignments
    set
      status = 'revoked',
      revoked_at = statement_timestamp(),
      revoked_by_principal_id = actor_principal_id,
      revocation_reason = p_reason
    where staff_principal_id = target.id and status = 'active';
  end if;

  revocation_request_id := app_private.queue_staff_session_revocation(
    target.id,
    actor_principal_id,
    'Emergency staff revocation requires immediate Auth session invalidation.'
  );
  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.emergency_revoke_staff',
    'security',
    target.id,
    p_reason,
    p_idempotency_key,
    correlation_id,
    null,
    jsonb_build_object('status', target.status),
    jsonb_build_object(
      'status', 'revoked',
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', target.id,
    'status', 'revoked',
    'sessionRevocationRequestId', revocation_request_id
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'staff.emergency_revoke', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_list_active_assignments(
  p_staff_principal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.admin_assert_permission('security.manage_staff', false);
  if not exists (
    select 1 from app_private.staff_principals
    where id = p_staff_principal_id
  ) then
    raise exception using errcode = 'PT404', message = 'staff_principal_not_found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'assignmentId', assignment.id,
        'role', role.name,
        'status', assignment.status,
        'startsAt', assignment.starts_at,
        'expiresAt', assignment.expires_at,
        'grantedAt', assignment.created_at,
        'grantReason', assignment.grant_reason,
        'grantReference', assignment.grant_reference
      )
      order by role.name, assignment.created_at, assignment.id
    ),
    '[]'::jsonb
  )
  into result
  from app_private.staff_role_assignments assignment
  join app_private.admin_roles role on role.id = assignment.role_id
  where assignment.staff_principal_id = p_staff_principal_id
    and assignment.status = 'active'
    and assignment.starts_at <= statement_timestamp()
    and (
      assignment.expires_at is null
      or assignment.expires_at > statement_timestamp()
    );
  return result;
end;
$$;

create or replace function api.admin_list_assignment_history(
  p_staff_principal_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.admin_assert_permission('security.manage_staff', false);
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  with page as (
    select assignment.*, role.name as role_name
    from app_private.staff_role_assignments assignment
    join app_private.admin_roles role on role.id = assignment.role_id
    where assignment.staff_principal_id = p_staff_principal_id
      and (
        p_before_created_at is null
        or (assignment.created_at, assignment.id)
          < (p_before_created_at, p_before_id)
      )
    order by assignment.created_at desc, assignment.id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'assignmentId', page.id,
          'role', page.role_name,
          'status',
            case
              when page.status = 'active'
                and page.expires_at is not null
                and page.expires_at <= statement_timestamp()
                then 'expired'
              else page.status::text
            end,
          'startsAt', page.starts_at,
          'expiresAt', page.expires_at,
          'grantedAt', page.created_at,
          'grantReason', page.grant_reason,
          'grantReference', page.grant_reference,
          'revokedAt', page.revoked_at,
          'revocationReason', page.revocation_reason,
          'renewedFromAssignmentId', page.renewed_from_assignment_id
        )
        order by page.created_at desc, page.id desc
      ),
      '[]'::jsonb
    ),
    'nextCursor',
    case
      when count(*) = p_limit then (
        select jsonb_build_object('createdAt', tail.created_at, 'id', tail.id)
        from page tail order by tail.created_at, tail.id limit 1
      )
      else null
    end
  )
  into result
  from page;
  return result;
end;
$$;

create or replace function api.admin_execute_approved_platform_admin(
  p_approval_id uuid,
  p_payload_fingerprint text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval app_private.admin_approval_requests%rowtype;
  actor_principal_id uuid;
  prior_response jsonb;
  assignment_result jsonb;
  result jsonb;
  target_auth_user_id uuid;
  assignment_expires_at timestamptz;
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff', true
  );
  select *
  into approval
  from app_private.admin_approval_requests
  where id = p_approval_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'approval_not_found';
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'approval.execute',
    p_idempotency_key,
    jsonb_build_object(
      'approvalId', p_approval_id,
      'payloadFingerprint', p_payload_fingerprint,
      'reason', p_reason
    )
  );
  if prior_response is not null then
    return prior_response;
  end if;

  if approval.status <> 'approved' then
    raise exception using errcode = 'PT403', message = 'approval_required';
  end if;
  if approval.expires_at <= statement_timestamp() then
    raise exception using errcode = 'PT410', message = 'approval_expired';
  end if;
  if approval.execution_status = 'executed' then
    raise exception using errcode = 'PT409', message = 'operation_already_executed';
  end if;
  if approval.execution_status <> 'not_started' then
    raise exception using errcode = 'PT409', message = 'staff_role_conflict';
  end if;
  if approval.operation_type <> 'staff.assign_platform_admin'
    or approval.payload_fingerprint <> p_payload_fingerprint
  then
    raise exception using errcode = 'PT409', message = 'approval_payload_mismatch';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;

  target_auth_user_id :=
    (approval.safe_payload_reference ->> 'targetAuthUserId')::uuid;
  assignment_expires_at :=
    nullif(approval.safe_payload_reference ->> 'expiresAt', '')::timestamptz;

  update app_private.admin_approval_requests
  set
    execution_status = 'executing',
    executed_by_principal_id = actor_principal_id
  where id = approval.id;

  assignment_result := api.admin_assign_role(
    target_auth_user_id,
    'platform_admin',
    assignment_expires_at,
    approval.reason,
    'approval:' || approval.id::text,
    p_idempotency_key,
    approval.id
  );

  update app_private.admin_approval_requests
  set
    execution_status = 'executed',
    executed_at = statement_timestamp(),
    execution_result = jsonb_build_object(
      'assignmentId', assignment_result ->> 'assignmentId',
      'staffPrincipalId', assignment_result ->> 'staffPrincipalId'
    )
  where id = approval.id;

  perform app_private.write_admin_audit(
    actor_principal_id,
    'approval.execute',
    approval.target_domain,
    approval.target_entity_id,
    p_reason,
    p_idempotency_key,
    approval.correlation_id,
    approval.id,
    jsonb_build_object('executionStatus', 'not_started'),
    jsonb_build_object(
      'executionStatus', 'executed',
      'assignmentId', assignment_result ->> 'assignmentId'
    )
  );

  result := jsonb_build_object(
    'approvalId', approval.id,
    'status', approval.status,
    'executionStatus', 'executed',
    'executedAt', statement_timestamp(),
    'result', assignment_result
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id, 'approval.execute', p_idempotency_key, result
  );
end;
$$;

create or replace function api.admin_list_audit_events(
  p_before_occurred_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.admin_assert_permission('security.read_audit', false);
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'audit_access_denied';
  end if;
  if (p_before_occurred_at is null) <> (p_before_id is null) then
    raise exception using errcode = 'PT400', message = 'audit_access_denied';
  end if;

  with page as (
    select event.*
    from app_private.admin_audit_events event
    where p_before_occurred_at is null
      or (event.occurred_at, event.id) < (p_before_occurred_at, p_before_id)
    order by event.occurred_at desc, event.id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', page.id,
          'actorPrincipalId', page.actor_principal_id,
          'effectiveRoles', page.effective_roles,
          'effectivePermissions', page.effective_permissions,
          'action', page.action,
          'targetDomain', page.target_domain,
          'targetEntityId', page.target_entity_id,
          'reason', page.reason,
          'requestId', page.request_id,
          'correlationId', page.correlation_id,
          'approvalId', page.approval_id,
          'safeBefore', page.safe_before,
          'safeAfter', page.safe_after,
          'environment', page.environment,
          'outcome', page.outcome,
          'errorCode', page.error_code,
          'occurredAt', page.occurred_at
        )
        order by page.occurred_at desc, page.id desc
      ),
      '[]'::jsonb
    ),
    'nextCursor',
    case
      when count(*) = p_limit then (
        select jsonb_build_object('occurredAt', tail.occurred_at, 'id', tail.id)
        from page tail order by tail.occurred_at, tail.id limit 1
      )
      else null
    end
  )
  into result
  from page;
  return result;
end;
$$;

create or replace function api.admin_expire_approvals(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
  approval record;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;

  for approval in
    select request.*
    from app_private.admin_approval_requests request
    where request.status = 'pending'
      and request.expires_at <= statement_timestamp()
    order by request.expires_at, request.id
    for update skip locked
    limit p_limit
  loop
    update app_private.admin_approval_requests
    set
      status = 'expired',
      decided_at = statement_timestamp(),
      decision_reason = 'Approval expired before a second operator approved it.'
    where id = approval.id;

    perform app_private.write_admin_audit(
      null,
      'approval.expire',
      approval.target_domain,
      approval.target_entity_id,
      'Approval expired before a second operator approved it.',
      gen_random_uuid(),
      approval.correlation_id,
      approval.id,
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('status', 'expired')
    );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

create or replace function api.admin_claim_session_revocations(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  with claims as (
    select request.id
    from app_private.staff_session_revocation_requests request
    where request.status in ('pending', 'failed')
    order by request.requested_at, request.id
    for update skip locked
    limit p_limit
  ),
  updated as (
    update app_private.staff_session_revocation_requests request
    set
      status = 'processing',
      claimed_at = statement_timestamp(),
      attempt_count = request.attempt_count + 1,
      last_error_code = null
    from claims
    where request.id = claims.id
    returning request.*
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', updated.id,
        'staffPrincipalId', updated.staff_principal_id,
        'authUserId', principal.auth_user_id,
        'reason', updated.reason,
        'attemptCount', updated.attempt_count
      )
      order by updated.requested_at, updated.id
    ),
    '[]'::jsonb
  )
  into result
  from updated
  join app_private.staff_principals principal
    on principal.id = updated.staff_principal_id;
  return result;
end;
$$;

create or replace function api.admin_complete_session_revocation(
  p_request_id uuid,
  p_succeeded boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_succeeded is null
    or (
      not p_succeeded
      and (
        p_error_code is null
        or p_error_code !~ '^[a-z][a-z0-9_]{2,79}$'
      )
    )
    or (p_succeeded and p_error_code is not null)
  then
    raise exception using errcode = 'PT400', message = 'staff_role_invalid';
  end if;

  update app_private.staff_session_revocation_requests
  set
    status = case
      when p_succeeded then 'completed'::app_private.staff_session_revocation_status
      else 'failed'::app_private.staff_session_revocation_status
    end,
    completed_at = case when p_succeeded then statement_timestamp() else null end,
    last_error_code = p_error_code
  where id = p_request_id and status = 'processing';
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_assignment_not_found';
  end if;
end;
$$;

comment on table app_private.staff_principals is
  'Server-owned staff identities keyed to immutable Supabase Auth user UUIDs.';
comment on table app_private.admin_roles is
  'Server-controlled role templates. No role hierarchy or wildcard permissions.';
comment on table app_private.admin_permissions is
  'Server-controlled granular administrative permission scopes.';
comment on table app_private.staff_role_assignments is
  'Append-preserving assignment history. Revocation never deletes a historical grant.';
comment on table app_private.admin_approval_requests is
  'Typed dual-control requests. Phase 7A executes only staff.assign_platform_admin.';
comment on table app_private.admin_audit_events is
  'Append-only privileged security evidence. Retain production events for seven years; synthetic staging evidence may be purged after 30 days by a reviewed trusted job.';
comment on table app_private.staff_session_revocation_requests is
  'Trusted Auth Admin API outbox. Canonical privilege revocation is immediate before session processing completes.';

revoke all on table
  app_private.staff_principals,
  app_private.admin_roles,
  app_private.admin_permissions,
  app_private.admin_role_permissions,
  app_private.staff_role_assignments,
  app_private.admin_approval_requests,
  app_private.admin_idempotency_keys,
  app_private.staff_session_revocation_requests,
  app_private.admin_audit_events
from public, anon, authenticated, service_role;

revoke all on sequence app_private.admin_audit_events_id_seq
from public, anon, authenticated, service_role;

revoke all on function
  app_private.prevent_admin_audit_mutation(),
  app_private.admin_environment(),
  app_private.admin_payload_fingerprint(jsonb),
  app_private.admin_current_session_id(),
  app_private.admin_effective_roles(uuid, timestamptz),
  app_private.admin_effective_permissions(uuid, timestamptz),
  app_private.admin_has_permission(uuid, text, timestamptz),
  app_private.admin_assert_principal(boolean, boolean),
  app_private.admin_assert_permission(text, boolean),
  app_private.write_admin_audit(
    uuid, text, text, uuid, text, uuid, uuid, uuid, jsonb, jsonb,
    app_private.admin_audit_outcome, text, boolean
  ),
  app_private.admin_begin_idempotent_operation(uuid, text, uuid, jsonb),
  app_private.admin_complete_idempotent_operation(uuid, text, uuid, jsonb),
  app_private.queue_staff_session_revocation(uuid, uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  app_private.prevent_admin_audit_mutation(),
  app_private.admin_environment(),
  app_private.admin_payload_fingerprint(jsonb),
  app_private.admin_current_session_id(),
  app_private.admin_effective_roles(uuid, timestamptz),
  app_private.admin_effective_permissions(uuid, timestamptz),
  app_private.admin_has_permission(uuid, text, timestamptz),
  app_private.admin_assert_principal(boolean, boolean),
  app_private.admin_assert_permission(text, boolean),
  app_private.write_admin_audit(
    uuid, text, text, uuid, text, uuid, uuid, uuid, jsonb, jsonb,
    app_private.admin_audit_outcome, text, boolean
  ),
  app_private.admin_begin_idempotent_operation(uuid, text, uuid, jsonb),
  app_private.admin_complete_idempotent_operation(uuid, text, uuid, jsonb),
  app_private.queue_staff_session_revocation(uuid, uuid, text)
to postgres;

revoke all on function
  api.get_my_staff_context(),
  api.admin_bootstrap_first_platform_admin(uuid, text, boolean),
  api.admin_request_approval(text, text, uuid, text, jsonb, text, timestamptz, uuid),
  api.admin_approve_request(uuid, text, text, uuid),
  api.admin_reject_request(uuid, text, uuid),
  api.admin_cancel_request(uuid, text, uuid),
  api.admin_get_approval(uuid),
  api.admin_assign_role(uuid, text, timestamptz, text, text, uuid, uuid),
  api.admin_revoke_role(uuid, text, uuid),
  api.admin_renew_role(uuid, timestamptz, text, text, uuid, uuid),
  api.admin_suspend_staff(uuid, text, uuid),
  api.admin_restore_staff(uuid, text, uuid),
  api.admin_emergency_revoke_staff(uuid, text, uuid),
  api.admin_list_active_assignments(uuid),
  api.admin_list_assignment_history(uuid, timestamptz, uuid, integer),
  api.admin_execute_approved_platform_admin(uuid, text, text, uuid),
  api.admin_list_audit_events(timestamptz, bigint, integer),
  api.admin_expire_approvals(integer),
  api.admin_claim_session_revocations(integer),
  api.admin_complete_session_revocation(uuid, boolean, text)
from public, anon, authenticated, service_role;

grant execute on function
  api.get_my_staff_context(),
  api.admin_request_approval(text, text, uuid, text, jsonb, text, timestamptz, uuid),
  api.admin_approve_request(uuid, text, text, uuid),
  api.admin_reject_request(uuid, text, uuid),
  api.admin_cancel_request(uuid, text, uuid),
  api.admin_get_approval(uuid),
  api.admin_assign_role(uuid, text, timestamptz, text, text, uuid, uuid),
  api.admin_revoke_role(uuid, text, uuid),
  api.admin_renew_role(uuid, timestamptz, text, text, uuid, uuid),
  api.admin_suspend_staff(uuid, text, uuid),
  api.admin_restore_staff(uuid, text, uuid),
  api.admin_emergency_revoke_staff(uuid, text, uuid),
  api.admin_list_active_assignments(uuid),
  api.admin_list_assignment_history(uuid, timestamptz, uuid, integer),
  api.admin_execute_approved_platform_admin(uuid, text, text, uuid),
  api.admin_list_audit_events(timestamptz, bigint, integer)
to authenticated;

grant execute on function
  api.admin_bootstrap_first_platform_admin(uuid, text, boolean),
  api.admin_expire_approvals(integer),
  api.admin_claim_session_revocations(integer),
  api.admin_complete_session_revocation(uuid, boolean, text)
to service_role;
