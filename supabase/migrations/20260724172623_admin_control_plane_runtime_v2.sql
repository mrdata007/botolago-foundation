-- BotolaGO Production V2
-- Phase 7B: Admin control plane and session-security runtime.
--
-- This migration is additive. Canonical privilege revocation remains
-- synchronous in Phase 7A authorization checks. The worker below adds durable,
-- leased processing and operational evidence without writing Supabase-owned
-- Auth tables.

alter table app_private.staff_session_revocation_requests
  add column correlation_id uuid not null default gen_random_uuid(),
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column worker_id text,
  add column worker_run_id uuid,
  add column next_attempt_at timestamptz not null default statement_timestamp(),
  add column last_attempt_at timestamptz,
  add column max_attempts smallint not null default 5,
  add column result_code text,
  add column last_error_summary text,
  add column dead_lettered_at timestamptz;

update app_private.staff_session_revocation_requests
set result_code = 'legacy_completed'
where status = 'completed' and result_code is null;

alter table app_private.staff_session_revocation_requests
  drop constraint staff_session_revocation_requests_lifecycle_check,
  add constraint staff_session_revocation_requests_correlation_key
    unique (correlation_id),
  add constraint staff_session_revocation_requests_worker_check check (
    worker_id is null
    or (
      worker_id = btrim(worker_id)
      and worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'
    )
  ),
  add constraint staff_session_revocation_requests_attempt_limit_check check (
    max_attempts between 1 and 10 and attempt_count between 0 and max_attempts
  ),
  add constraint staff_session_revocation_requests_result_check check (
    result_code is null or result_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  add constraint staff_session_revocation_requests_error_summary_check check (
    last_error_summary is null
    or (
      last_error_summary = btrim(last_error_summary)
      and char_length(last_error_summary) between 3 and 256
      and last_error_summary !~* '(password|access.?token|refresh.?token|secret|credential|api.?key|authorization)'
    )
  ),
  add constraint staff_session_revocation_requests_lease_check check (
    (
      status = 'processing'
      and lease_token is not null
      and lease_expires_at is not null
      and worker_id is not null
      and worker_run_id is not null
      and claimed_at is not null
      and last_attempt_at is not null
      and completed_at is null
      and dead_lettered_at is null
    )
    or (
      status <> 'processing'
      and lease_token is null
      and lease_expires_at is null
    )
  ),
  add constraint staff_session_revocation_requests_lifecycle_check check (
    (
      status = 'pending'
      and completed_at is null
      and dead_lettered_at is null
      and result_code is null
    )
    or (
      status = 'processing'
      and completed_at is null
      and dead_lettered_at is null
      and result_code is null
    )
    or (
      status = 'failed'
      and claimed_at is not null
      and completed_at is null
      and dead_lettered_at is null
      and result_code is null
      and last_error_code is not null
    )
    or (
      status = 'completed'
      and claimed_at is not null
      and completed_at is not null
      and dead_lettered_at is null
      and result_code is not null
      and last_error_code is null
    )
    or (
      status = 'dead_letter'
      and claimed_at is not null
      and completed_at is null
      and dead_lettered_at is not null
      and result_code is null
      and last_error_code is not null
    )
  );

drop index app_private.staff_session_revocation_requests_claim_idx;
create index staff_session_revocation_requests_claim_v2_idx
  on app_private.staff_session_revocation_requests (
    status, next_attempt_at, lease_expires_at, requested_at, id
  )
  where status in ('pending', 'processing', 'failed');
create index staff_session_revocation_requests_dead_letter_idx
  on app_private.staff_session_revocation_requests (
    dead_lettered_at desc, id
  )
  where status = 'dead_letter';

create type app_private.admin_worker_run_status as enum (
  'running',
  'succeeded',
  'partial_failure',
  'failed'
);

create table app_private.admin_worker_runs (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null default gen_random_uuid(),
  worker_name text not null,
  worker_id text not null,
  status app_private.admin_worker_run_status not null default 'running',
  started_at timestamptz not null default statement_timestamp(),
  heartbeat_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  claimed_count integer not null default 0,
  completed_count integer not null default 0,
  retry_count integer not null default 0,
  dead_letter_count integer not null default 0,
  last_error_code text,
  synthetic_test boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_worker_runs_correlation_key unique (correlation_id),
  constraint admin_worker_runs_name_check check (
    worker_name = 'staff_session_revocation'
  ),
  constraint admin_worker_runs_worker_check check (
    worker_id = btrim(worker_id)
    and worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'
  ),
  constraint admin_worker_runs_count_check check (
    claimed_count >= 0
    and completed_count >= 0
    and retry_count >= 0
    and dead_letter_count >= 0
  ),
  constraint admin_worker_runs_error_check check (
    last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint admin_worker_runs_lifecycle_check check (
    (status = 'running' and completed_at is null)
    or (status <> 'running' and completed_at is not null)
  )
);
create unique index admin_worker_runs_one_active_worker_idx
  on app_private.admin_worker_runs (worker_name, worker_id)
  where status = 'running';
create index admin_worker_runs_health_idx
  on app_private.admin_worker_runs (started_at desc, id desc);

alter table app_private.admin_worker_runs enable row level security;
alter table app_private.admin_worker_runs force row level security;

create trigger admin_worker_runs_set_updated_at
before update on app_private.admin_worker_runs
for each row execute function app_private.set_updated_at();

alter table app_private.staff_session_revocation_requests
  add constraint staff_session_revocation_requests_worker_run_fkey
  foreign key (worker_run_id)
  references app_private.admin_worker_runs(id)
  on delete restrict;
create index staff_session_revocation_requests_worker_run_idx
  on app_private.staff_session_revocation_requests (worker_run_id, id)
  where worker_run_id is not null;

alter table app_private.admin_audit_events
  add column target_entity_type text
    generated always as (split_part(action, '.', 1)) stored;
create index admin_audit_events_inspection_idx
  on app_private.admin_audit_events (
    target_domain, target_entity_type, outcome, occurred_at desc, id desc
  );
create index admin_audit_events_correlation_idx
  on app_private.admin_audit_events (correlation_id, occurred_at desc, id desc);

create or replace function app_private.admin_safe_audit_summary(p_value jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_value is null then null
    else coalesce(
      (
        select jsonb_object_agg(entry.key, entry.value order by entry.key)
        from jsonb_each(p_value) entry
        where entry.key = any(array[
          'assignmentId',
          'executionStatus',
          'expiresAt',
          'nextAttemptAt',
          'pendingRevocationCount',
          'permissions',
          'principalStatus',
          'requestStatus',
          'resultCode',
          'role',
          'roles',
          'staffPrincipalId',
          'status'
        ])
      ),
      '{}'::jsonb
    )
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
  session_created_at timestamptz;
  has_verified_factor boolean;
  email_verified boolean;
  current_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  roles jsonb;
  permissions jsonb;
  pending_revocation_count integer;
  recent_auth_sufficient boolean;
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
  select session.created_at
  into session_created_at
  from auth.sessions session
  where session.id = session_id and session.user_id = current_user_id;
  if not found then
    raise exception using errcode = 'PT401', message = 'staff_access_denied';
  end if;

  select user_record.email_confirmed_at is not null
  into email_verified
  from auth.users user_record
  where user_record.id = current_user_id;

  select exists (
    select 1
    from auth.mfa_factors factor
    where factor.user_id = current_user_id and factor.status::text = 'verified'
  )
  into has_verified_factor;

  recent_auth_sufficient :=
    session_created_at >= statement_timestamp() - interval '15 minutes';

  select count(*)::integer
  into pending_revocation_count
  from app_private.staff_session_revocation_requests request
  where request.staff_principal_id = principal.id
    and request.status in ('pending', 'processing', 'failed');

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
    'isStaff', true,
    'staffPrincipalId', principal.id,
    'status', principal.status,
    'roles', roles,
    'permissions', permissions,
    'emailVerified', coalesce(email_verified, false),
    'mfaRequired', principal.mfa_required,
    'mfaEnrolled', has_verified_factor,
    'currentAal', current_aal,
    'recentAuthRequired', true,
    'recentAuthSufficient', recent_auth_sufficient,
    'recentAuthWindowSeconds', 900,
    'pendingSessionRevocation', pending_revocation_count > 0,
    'pendingSessionRevocationCount', pending_revocation_count,
    'accessAllowed',
      principal.status = 'active'
      and coalesce(email_verified, false)
      and has_verified_factor
      and current_aal = 'aal2',
    'suspended', principal.status = 'suspended',
    'revoked', principal.status = 'revoked',
    'cachePolicy', 'private, no-store'
  );
end;
$$;

create or replace function api.admin_list_staff_assignments(
  p_role_name text default null,
  p_principal_status text default null,
  p_assignment_status text default null,
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
  if p_limit is null or p_limit not between 1 and 100
    or (p_before_created_at is null) <> (p_before_id is null)
    or (
      p_principal_status is not null
      and p_principal_status not in ('active', 'suspended', 'revoked')
    )
    or (
      p_assignment_status is not null
      and p_assignment_status not in ('active', 'expired', 'revoked')
    )
    or (
      p_role_name is not null
      and p_role_name !~ '^[a-z][a-z0-9_]{2,63}$'
    )
  then
    raise exception using errcode = 'PT400', message = 'assignment_conflict';
  end if;

  with candidate as (
    select
      assignment.*,
      principal.status as principal_status,
      role.name as role_name,
      case
        when assignment.status = 'active'
          and assignment.expires_at is not null
          and assignment.expires_at <= statement_timestamp()
          then 'expired'
        else assignment.status::text
      end as effective_status,
      coalesce(
        (
          select jsonb_agg(permission.name order by permission.name)
          from app_private.admin_role_permissions mapping
          join app_private.admin_permissions permission
            on permission.id = mapping.permission_id
          where mapping.role_id = role.id and permission.active
        ),
        '[]'::jsonb
      ) as permission_summary,
      (
        select count(*)::integer
        from app_private.staff_session_revocation_requests request
        where request.staff_principal_id = principal.id
          and request.status in ('pending', 'processing', 'failed')
      ) as pending_revocation_count
    from app_private.staff_role_assignments assignment
    join app_private.staff_principals principal
      on principal.id = assignment.staff_principal_id
    join app_private.admin_roles role on role.id = assignment.role_id
    where (p_role_name is null or role.name = p_role_name)
      and (
        p_principal_status is null
        or principal.status::text = p_principal_status
      )
      and (
        p_before_created_at is null
        or (assignment.created_at, assignment.id)
          < (p_before_created_at, p_before_id)
      )
  ),
  page as (
    select *
    from candidate
    where p_assignment_status is null
      or effective_status = p_assignment_status
    order by created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'staffPrincipalId', page.staff_principal_id,
          'principalStatus', page.principal_status,
          'assignmentId', page.id,
          'role', page.role_name,
          'status', page.effective_status,
          'startsAt', page.starts_at,
          'expiresAt', page.expires_at,
          'grantedAt', page.created_at,
          'grantedByPrincipalId', page.granted_by_principal_id,
          'grantReason', page.grant_reason,
          'grantReference', page.grant_reference,
          'revokedAt', page.revoked_at,
          'revocationReason', page.revocation_reason,
          'permissions', page.permission_summary,
          'pendingSessionRevocation', page.pending_revocation_count > 0,
          'pendingSessionRevocationCount', page.pending_revocation_count
        )
        order by page.created_at desc, page.id desc
      ),
      '[]'::jsonb
    ),
    'nextCursor',
    case
      when count(*) = p_limit then (
        select jsonb_build_object('createdAt', tail.created_at, 'id', tail.id)
        from page tail
        order by tail.created_at, tail.id
        limit 1
      )
      else null
    end
  )
  into result
  from page;
  return result;
end;
$$;

create or replace function api.admin_get_staff_principal(p_staff_principal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  principal app_private.staff_principals%rowtype;
  roles jsonb;
  permissions jsonb;
  pending_count integer;
begin
  perform app_private.admin_assert_permission('security.manage_staff', false);
  select *
  into principal
  from app_private.staff_principals
  where id = p_staff_principal_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'assignment_not_found';
  end if;

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
    and (assignment.expires_at is null or assignment.expires_at > statement_timestamp());

  select case
    when principal.status = 'active' then to_jsonb(
      app_private.admin_effective_permissions(principal.id)
    )
    else '[]'::jsonb
  end
  into permissions;

  select count(*)::integer
  into pending_count
  from app_private.staff_session_revocation_requests request
  where request.staff_principal_id = principal.id
    and request.status in ('pending', 'processing', 'failed');

  return jsonb_build_object(
    'staffPrincipalId', principal.id,
    'status', principal.status,
    'roles', roles,
    'permissions', permissions,
    'mfaRequired', principal.mfa_required,
    'createdAt', principal.created_at,
    'updatedAt', principal.updated_at,
    'suspendedAt', principal.suspended_at,
    'revokedAt', principal.revoked_at,
    'pendingSessionRevocation', pending_count > 0,
    'pendingSessionRevocationCount', pending_count
  );
end;
$$;

create or replace function api.admin_list_approval_queue(
  p_scope text default 'actionable',
  p_status text default null,
  p_execution_status text default null,
  p_target_domain text default null,
  p_before_requested_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_principal_id uuid;
  result jsonb;
begin
  if p_scope = 'requested_by_me' then
    actor_principal_id := app_private.admin_assert_principal(true, false);
  elsif p_scope in ('actionable', 'all_visible') then
    actor_principal_id :=
      app_private.admin_assert_permission('security.manage_staff', false);
  else
    raise exception using errcode = 'PT400', message = 'approval_conflict';
  end if;

  if p_limit is null or p_limit not between 1 and 100
    or (p_before_requested_at is null) <> (p_before_id is null)
    or (
      p_status is not null
      and p_status not in ('pending', 'approved', 'rejected', 'cancelled', 'expired')
    )
    or (
      p_execution_status is not null
      and p_execution_status not in (
        'not_started', 'executing', 'executed', 'execution_failed'
      )
    )
    or (
      p_target_domain is not null
      and p_target_domain !~ '^[a-z][a-z0-9_]{2,31}$'
    )
  then
    raise exception using errcode = 'PT400', message = 'approval_conflict';
  end if;

  with page as (
    select
      request.*,
      permission.name as required_permission,
      case
        when request.status = 'pending'
          and request.expires_at <= statement_timestamp()
          then 'expired'
        else request.status::text
      end as effective_status
    from app_private.admin_approval_requests request
    join app_private.admin_permissions permission
      on permission.id = request.required_permission_id
    where (
        (
          p_scope = 'requested_by_me'
          and request.requester_principal_id = actor_principal_id
        )
        or (
          p_scope = 'actionable'
          and request.status = 'pending'
          and request.expires_at > statement_timestamp()
          and request.requester_principal_id <> actor_principal_id
          and app_private.admin_has_permission(
            actor_principal_id, permission.name
          )
        )
        or p_scope = 'all_visible'
      )
      and (p_target_domain is null or request.target_domain = p_target_domain)
      and (
        p_execution_status is null
        or request.execution_status::text = p_execution_status
      )
      and (
        p_before_requested_at is null
        or (request.requested_at, request.id)
          < (p_before_requested_at, p_before_id)
      )
      and (
        p_status is null
        or (
          case
            when request.status = 'pending'
              and request.expires_at <= statement_timestamp()
              then 'expired'
            else request.status::text
          end
        ) = p_status
      )
    order by request.requested_at desc, request.id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'approvalId', page.id,
          'status', page.effective_status,
          'operationType', page.operation_type,
          'targetDomain', page.target_domain,
          'targetEntityType', split_part(page.operation_type, '.', 1),
          'targetEntityId', page.target_entity_id,
          'payloadFingerprint', page.payload_fingerprint,
          'requiredPermission', page.required_permission,
          'requesterPrincipalId', page.requester_principal_id,
          'decidedByPrincipalId', page.decided_by_principal_id,
          'executedByPrincipalId', page.executed_by_principal_id,
          'reason', page.reason,
          'requestedAt', page.requested_at,
          'expiresAt', page.expires_at,
          'decidedAt', page.decided_at,
          'executionStatus', page.execution_status,
          'executedAt', page.executed_at,
          'correlationId', page.correlation_id
        )
        order by page.requested_at desc, page.id desc
      ),
      '[]'::jsonb
    ),
    'nextCursor',
    case
      when count(*) = p_limit then (
        select jsonb_build_object('requestedAt', tail.requested_at, 'id', tail.id)
        from page tail
        order by tail.requested_at, tail.id
        limit 1
      )
      else null
    end
  )
  into result
  from page;
  return result;
end;
$$;

create or replace function api.admin_list_audit_events_v2(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor_principal_id uuid default null,
  p_action text default null,
  p_target_domain text default null,
  p_target_entity_type text default null,
  p_outcome text default null,
  p_correlation_id uuid default null,
  p_approval_id uuid default null,
  p_synthetic_test boolean default null,
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
  window_end timestamptz := coalesce(p_to, statement_timestamp());
  window_start timestamptz := coalesce(p_from, window_end - interval '24 hours');
  result jsonb;
begin
  perform app_private.admin_assert_permission('security.read_audit', false);
  if p_limit is null or p_limit not between 1 and 100
    or (p_before_occurred_at is null) <> (p_before_id is null)
    or window_start >= window_end
    or window_end - window_start > interval '31 days'
    or (p_action is not null and p_action !~ '^[a-z][a-z0-9_]{1,31}[.][a-z][a-z0-9_]{2,63}$')
    or (p_target_domain is not null and p_target_domain !~ '^[a-z][a-z0-9_]{2,31}$')
    or (p_target_entity_type is not null and p_target_entity_type !~ '^[a-z][a-z0-9_]{1,31}$')
    or (p_outcome is not null and p_outcome not in ('succeeded', 'denied', 'failed'))
  then
    raise exception using errcode = 'PT400', message = 'audit_access_denied';
  end if;

  with page as (
    select event.*
    from app_private.admin_audit_events event
    where event.occurred_at >= window_start
      and event.occurred_at < window_end
      and (p_actor_principal_id is null or event.actor_principal_id = p_actor_principal_id)
      and (p_action is null or event.action = p_action)
      and (p_target_domain is null or event.target_domain = p_target_domain)
      and (p_target_entity_type is null or event.target_entity_type = p_target_entity_type)
      and (p_outcome is null or event.outcome::text = p_outcome)
      and (p_correlation_id is null or event.correlation_id = p_correlation_id)
      and (p_approval_id is null or event.approval_id = p_approval_id)
      and (p_synthetic_test is null or event.synthetic_test = p_synthetic_test)
      and (
        p_before_occurred_at is null
        or (event.occurred_at, event.id)
          < (p_before_occurred_at, p_before_id)
      )
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
          'targetEntityType', page.target_entity_type,
          'targetEntityId', page.target_entity_id,
          'reason', page.reason,
          'requestId', page.request_id,
          'correlationId', page.correlation_id,
          'approvalId', page.approval_id,
          'safeBefore', app_private.admin_safe_audit_summary(page.safe_before),
          'safeAfter', app_private.admin_safe_audit_summary(page.safe_after),
          'environment', page.environment,
          'outcome', page.outcome,
          'errorCode', page.error_code,
          'syntheticTest', page.synthetic_test,
          'occurredAt', page.occurred_at
        )
        order by page.occurred_at desc, page.id desc
      ),
      '[]'::jsonb
    ),
    'window', jsonb_build_object('from', window_start, 'to', window_end),
    'nextCursor',
    case
      when count(*) = p_limit then (
        select jsonb_build_object('occurredAt', tail.occurred_at, 'id', tail.id)
        from page tail
        order by tail.occurred_at, tail.id
        limit 1
      )
      else null
    end
  )
  into result
  from page;
  return result;
end;
$$;

create or replace function api.admin_list_role_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.admin_assert_principal(true, false);
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', role.name,
        'displayLabelKey', 'admin.roles.' || role.name || '.label',
        'descriptionKey', 'admin.roles.' || role.name || '.description',
        'permissions', coalesce(
          (
            select jsonb_agg(permission.name order by permission.name)
            from app_private.admin_role_permissions mapping
            join app_private.admin_permissions permission
              on permission.id = mapping.permission_id
            where mapping.role_id = role.id and permission.active
          ),
          '[]'::jsonb
        ),
        'highPrivilege', role.name in ('security_admin', 'platform_admin'),
        'requiresDualControl', role.name = 'platform_admin',
        'requiresRecentAuth', exists (
          select 1
          from app_private.admin_role_permissions mapping
          join app_private.admin_permissions permission
            on permission.id = mapping.permission_id
          where mapping.role_id = role.id
            and permission.active
            and permission.requires_recent_auth
        ),
        'requiresMfaAal2', exists (
          select 1
          from app_private.admin_role_permissions mapping
          join app_private.admin_permissions permission
            on permission.id = mapping.permission_id
          where mapping.role_id = role.id
            and permission.active
            and permission.requires_mfa
        )
      )
      order by role.name
    ),
    '[]'::jsonb
  )
  into result
  from app_private.admin_roles role
  where role.active;
  return result;
end;
$$;

create or replace function api.admin_get_session_revocation_status(
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
    select 1 from app_private.staff_principals where id = p_staff_principal_id
  ) then
    raise exception using errcode = 'PT404', message = 'assignment_not_found';
  end if;

  select jsonb_build_object(
    'staffPrincipalId', p_staff_principal_id,
    'pendingCount', count(*) filter (
      where request.status in ('pending', 'processing', 'failed')
    ),
    'deadLetterCount', count(*) filter (where request.status = 'dead_letter'),
    'latest',
      (
        select jsonb_build_object(
          'requestId', latest.id,
          'status', latest.status,
          'attemptCount', latest.attempt_count,
          'maxAttempts', latest.max_attempts,
          'resultCode', latest.result_code,
          'lastErrorCode', latest.last_error_code,
          'requestedAt', latest.requested_at,
          'nextAttemptAt', latest.next_attempt_at,
          'completedAt', latest.completed_at,
          'correlationId', latest.correlation_id
        )
        from app_private.staff_session_revocation_requests latest
        where latest.staff_principal_id = p_staff_principal_id
        order by latest.requested_at desc, latest.id desc
        limit 1
      )
  )
  into result
  from app_private.staff_session_revocation_requests request
  where request.staff_principal_id = p_staff_principal_id;
  return result;
end;
$$;

create or replace function api.admin_get_revocation_worker_health()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.admin_assert_permission('security.read_audit', false);
  select jsonb_build_object(
    'queue',
      (
        select jsonb_build_object(
          'pending', count(*) filter (where status = 'pending'),
          'processing', count(*) filter (where status = 'processing'),
          'retrying', count(*) filter (where status = 'failed'),
          'deadLetter', count(*) filter (where status = 'dead_letter')
        )
        from app_private.staff_session_revocation_requests
      ),
    'runs',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'runId', run.id,
              'status', run.status,
              'startedAt', run.started_at,
              'heartbeatAt', run.heartbeat_at,
              'completedAt', run.completed_at,
              'claimedCount', run.claimed_count,
              'completedCount', run.completed_count,
              'retryCount', run.retry_count,
              'deadLetterCount', run.dead_letter_count,
              'lastErrorCode', run.last_error_code,
              'syntheticTest', run.synthetic_test
            )
            order by run.started_at desc, run.id desc
          )
          from (
            select *
            from app_private.admin_worker_runs
            order by started_at desc, id desc
            limit 10
          ) run
        ),
        '[]'::jsonb
      )
  )
  into result;
  return result;
end;
$$;

create or replace function api.admin_start_session_revocation_worker(
  p_worker_id text,
  p_synthetic_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run app_private.admin_worker_runs%rowtype;
begin
  if p_worker_id is null
    or p_worker_id <> btrim(p_worker_id)
    or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'
  then
    raise exception using errcode = 'PT400', message = 'worker_unavailable';
  end if;

  insert into app_private.admin_worker_runs (
    worker_name, worker_id, synthetic_test
  )
  values ('staff_session_revocation', p_worker_id, coalesce(p_synthetic_test, false))
  on conflict (worker_name, worker_id) where status = 'running'
  do update set heartbeat_at = statement_timestamp()
  returning * into run;

  return jsonb_build_object(
    'runId', run.id,
    'correlationId', run.correlation_id,
    'status', run.status,
    'startedAt', run.started_at
  );
end;
$$;

create or replace function api.admin_claim_session_revocations_v2(
  p_worker_run_id uuid,
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  item jsonb;
  stale app_private.staff_session_revocation_requests%rowtype;
begin
  if p_limit is null or p_limit not between 1 and 50
    or p_lease_seconds is null or p_lease_seconds not between 30 and 600
    or p_worker_id is null
    or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'
    or not exists (
      select 1
      from app_private.admin_worker_runs run
      where run.id = p_worker_run_id
        and run.worker_id = p_worker_id
        and run.status = 'running'
    )
  then
    raise exception using errcode = 'PT403', message = 'worker_unavailable';
  end if;

  for stale in
    select request.*
    from app_private.staff_session_revocation_requests request
    where request.status = 'processing'
      and request.lease_expires_at <= statement_timestamp()
      and request.attempt_count >= request.max_attempts
    order by request.lease_expires_at, request.id
    for update skip locked
    limit p_limit
  loop
    update app_private.staff_session_revocation_requests
    set
      status = 'dead_letter',
      lease_token = null,
      lease_expires_at = null,
      dead_lettered_at = statement_timestamp(),
      last_error_code = 'revocation_attempts_exhausted',
      last_error_summary = 'Worker lease expired after the maximum attempt count.'
    where id = stale.id;

    perform app_private.write_admin_audit(
      null,
      'security.dead_letter_session_revocation',
      'security',
      stale.staff_principal_id,
      'Session revocation exhausted its bounded worker attempts.',
      stale.id,
      stale.correlation_id,
      null,
      jsonb_build_object('status', 'processing'),
      jsonb_build_object('status', 'dead_letter'),
      'failed',
      'revocation_attempts_exhausted'
    );
  end loop;

  with claims as (
    select
      request.id,
      request.status = 'processing' as recovered_stale_lease
    from app_private.staff_session_revocation_requests request
    where (
        (
          request.status in ('pending', 'failed')
          and request.next_attempt_at <= statement_timestamp()
        )
        or (
          request.status = 'processing'
          and request.lease_expires_at <= statement_timestamp()
        )
      )
      and request.attempt_count < request.max_attempts
    order by request.requested_at, request.id
    for update skip locked
    limit p_limit
  ),
  updated as (
    update app_private.staff_session_revocation_requests request
    set
      status = 'processing',
      claimed_at = coalesce(request.claimed_at, statement_timestamp()),
      last_attempt_at = statement_timestamp(),
      attempt_count = request.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at =
        statement_timestamp() + make_interval(secs => p_lease_seconds),
      worker_id = p_worker_id,
      worker_run_id = p_worker_run_id,
      last_error_code = null,
      last_error_summary = null
    from claims
    where request.id = claims.id
    returning request.*, claims.recovered_stale_lease
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', updated.id,
        'staffPrincipalId', updated.staff_principal_id,
        'authUserId', principal.auth_user_id,
        'reason', updated.reason,
        'attemptCount', updated.attempt_count,
        'maxAttempts', updated.max_attempts,
        'leaseToken', updated.lease_token,
        'leaseExpiresAt', updated.lease_expires_at,
        'correlationId', updated.correlation_id,
        'recoveredStaleLease', updated.recovered_stale_lease,
        'activeAuthSessionCount', (
          select count(*)::integer
          from auth.sessions session
          where session.user_id = principal.auth_user_id
        )
      )
      order by updated.requested_at, updated.id
    ),
    '[]'::jsonb
  )
  into result
  from updated
  join app_private.staff_principals principal
    on principal.id = updated.staff_principal_id;

  update app_private.admin_worker_runs
  set
    claimed_count = claimed_count + jsonb_array_length(result),
    heartbeat_at = statement_timestamp()
  where id = p_worker_run_id and status = 'running';

  for item in select * from jsonb_array_elements(result)
  loop
    perform app_private.write_admin_audit(
      null,
      'security.claim_session_revocation',
      'security',
      (item ->> 'staffPrincipalId')::uuid,
      'Trusted worker claimed a session revocation request.',
      (item ->> 'requestId')::uuid,
      (item ->> 'correlationId')::uuid,
      null,
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('status', 'processing')
    );
  end loop;

  return result;
end;
$$;

create or replace function api.admin_complete_session_revocation_v2(
  p_request_id uuid,
  p_lease_token uuid,
  p_result_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request app_private.staff_session_revocation_requests%rowtype;
begin
  if p_result_code not in (
    'privileged_access_revoked',
    'already_invalidated',
    'user_not_found'
  ) then
    raise exception using errcode = 'PT400', message = 'revocation_permanent_failure';
  end if;

  select *
  into request
  from app_private.staff_session_revocation_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'revocation_request_not_found';
  end if;
  if request.status = 'completed' then
    return jsonb_build_object(
      'requestId', request.id,
      'status', request.status,
      'resultCode', request.result_code,
      'alreadyProcessed', true
    );
  end if;
  if request.status <> 'processing'
    or request.lease_token is distinct from p_lease_token
    or request.lease_expires_at <= statement_timestamp()
  then
    raise exception using errcode = 'PT409', message = 'revocation_already_processed';
  end if;

  update app_private.staff_session_revocation_requests
  set
    status = 'completed',
    completed_at = statement_timestamp(),
    result_code = p_result_code,
    lease_token = null,
    lease_expires_at = null,
    last_error_code = null,
    last_error_summary = null
  where id = request.id;

  update app_private.admin_worker_runs
  set
    completed_count = completed_count + 1,
    heartbeat_at = statement_timestamp()
  where id = request.worker_run_id and status = 'running';

  perform app_private.write_admin_audit(
    null,
    'security.complete_session_revocation',
    'security',
    request.staff_principal_id,
    'Trusted worker completed privileged-session invalidation.',
    request.id,
    request.correlation_id,
    null,
    jsonb_build_object('status', 'processing'),
    jsonb_build_object('status', 'completed', 'resultCode', p_result_code)
  );

  return jsonb_build_object(
    'requestId', request.id,
    'status', 'completed',
    'resultCode', p_result_code,
    'alreadyProcessed', false
  );
end;
$$;

create or replace function api.admin_fail_session_revocation(
  p_request_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_summary text,
  p_retryable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request app_private.staff_session_revocation_requests%rowtype;
  next_status app_private.staff_session_revocation_status;
  retry_at timestamptz;
  backoff_seconds integer;
begin
  if p_error_code is null
    or p_error_code !~ '^[a-z][a-z0-9_]{2,79}$'
    or p_error_summary is null
    or p_error_summary <> btrim(p_error_summary)
    or char_length(p_error_summary) not between 3 and 256
    or p_error_summary ~* '(password|access.?token|refresh.?token|secret|credential|api.?key|authorization)'
    or p_retryable is null
  then
    raise exception using errcode = 'PT400', message = 'revocation_permanent_failure';
  end if;

  select *
  into request
  from app_private.staff_session_revocation_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'revocation_request_not_found';
  end if;
  if request.status <> 'processing'
    or request.lease_token is distinct from p_lease_token
    or request.lease_expires_at <= statement_timestamp()
  then
    raise exception using errcode = 'PT409', message = 'revocation_already_processed';
  end if;

  if p_retryable and request.attempt_count < request.max_attempts then
    next_status := 'failed';
    backoff_seconds := least(
      900,
      (5 * power(2, request.attempt_count - 1))::integer
        + mod(abs(hashtext(request.id::text || ':' || request.attempt_count::text)), 11)
    );
    retry_at := statement_timestamp() + make_interval(secs => backoff_seconds);
  else
    next_status := 'dead_letter';
    retry_at := request.next_attempt_at;
  end if;

  update app_private.staff_session_revocation_requests
  set
    status = next_status,
    lease_token = null,
    lease_expires_at = null,
    next_attempt_at = retry_at,
    last_error_code = p_error_code,
    last_error_summary = p_error_summary,
    dead_lettered_at = case
      when next_status = 'dead_letter' then statement_timestamp()
      else null
    end
  where id = request.id;

  update app_private.admin_worker_runs
  set
    retry_count = retry_count + case when next_status = 'failed' then 1 else 0 end,
    dead_letter_count =
      dead_letter_count + case when next_status = 'dead_letter' then 1 else 0 end,
    heartbeat_at = statement_timestamp(),
    last_error_code = p_error_code
  where id = request.worker_run_id and status = 'running';

  perform app_private.write_admin_audit(
    null,
    case
      when next_status = 'failed' then 'security.retry_session_revocation'
      else 'security.dead_letter_session_revocation'
    end,
    'security',
    request.staff_principal_id,
    case
      when next_status = 'failed'
        then 'Trusted worker scheduled a bounded session-revocation retry.'
      else 'Trusted worker dead-lettered a session revocation request.'
    end,
    request.id,
    request.correlation_id,
    null,
    jsonb_build_object('status', 'processing'),
    jsonb_build_object(
      'status', next_status,
      'nextAttemptAt', case when next_status = 'failed' then retry_at else null end
    ),
    'failed',
    p_error_code
  );

  return jsonb_build_object(
    'requestId', request.id,
    'status', next_status,
    'nextAttemptAt', case when next_status = 'failed' then retry_at else null end,
    'attemptCount', request.attempt_count,
    'maxAttempts', request.max_attempts
  );
end;
$$;

create or replace function api.admin_replay_session_revocation_dead_letter(
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request app_private.staff_session_revocation_requests%rowtype;
begin
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
    or p_reason ~* '(password|access.?token|refresh.?token|secret|credential|api.?key|authorization)'
  then
    raise exception using errcode = 'PT400', message = 'revocation_permanent_failure';
  end if;

  select *
  into request
  from app_private.staff_session_revocation_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'revocation_request_not_found';
  end if;
  if request.status <> 'dead_letter' then
    raise exception using errcode = 'PT409', message = 'revocation_already_processed';
  end if;

  update app_private.staff_session_revocation_requests
  set
    status = 'pending',
    attempt_count = 0,
    claimed_at = null,
    worker_id = null,
    worker_run_id = null,
    next_attempt_at = statement_timestamp(),
    last_attempt_at = null,
    last_error_code = null,
    last_error_summary = null,
    dead_lettered_at = null
  where id = request.id;

  perform app_private.write_admin_audit(
    null,
    'security.replay_session_revocation',
    'security',
    request.staff_principal_id,
    p_reason,
    request.id,
    request.correlation_id,
    null,
    jsonb_build_object('status', 'dead_letter'),
    jsonb_build_object('status', 'pending')
  );

  return jsonb_build_object(
    'requestId', request.id,
    'status', 'pending',
    'correlationId', request.correlation_id
  );
end;
$$;

create or replace function api.admin_finish_session_revocation_worker(
  p_worker_run_id uuid,
  p_status text,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run app_private.admin_worker_runs%rowtype;
begin
  if p_status not in ('succeeded', 'partial_failure', 'failed')
    or (
      p_status = 'succeeded' and p_error_code is not null
    )
    or (
      p_status <> 'succeeded'
      and (
        p_error_code is null
        or p_error_code !~ '^[a-z][a-z0-9_]{2,79}$'
      )
    )
  then
    raise exception using errcode = 'PT400', message = 'worker_unavailable';
  end if;

  update app_private.admin_worker_runs
  set
    status = p_status::app_private.admin_worker_run_status,
    completed_at = statement_timestamp(),
    heartbeat_at = statement_timestamp(),
    last_error_code = p_error_code
  where id = p_worker_run_id and status = 'running'
  returning * into run;
  if not found then
    raise exception using errcode = 'PT409', message = 'worker_unavailable';
  end if;

  return jsonb_build_object(
    'runId', run.id,
    'status', run.status,
    'completedAt', run.completed_at,
    'claimedCount', run.claimed_count,
    'completedCount', run.completed_count,
    'retryCount', run.retry_count,
    'deadLetterCount', run.dead_letter_count
  );
end;
$$;

comment on table app_private.admin_worker_runs is
  'Private bounded runtime ledger for the trusted staff-session revocation worker.';
comment on column app_private.staff_session_revocation_requests.lease_token is
  'Opaque worker lease token. Never contains an Auth access or refresh token.';
comment on function api.admin_claim_session_revocations_v2(uuid, text, integer, integer) is
  'Service-role-only bounded lease claim with stale-lease recovery.';
comment on function api.admin_complete_session_revocation_v2(uuid, uuid, text) is
  'Service-role-only idempotent completion for privileged-session invalidation.';

revoke all on table app_private.admin_worker_runs
from public, anon, authenticated, service_role;
revoke all on type app_private.admin_worker_run_status
from public, anon, authenticated, service_role;

revoke all on function
  app_private.admin_safe_audit_summary(jsonb),
  api.admin_list_staff_assignments(text, text, text, timestamptz, uuid, integer),
  api.admin_get_staff_principal(uuid),
  api.admin_list_approval_queue(text, text, text, text, timestamptz, uuid, integer),
  api.admin_list_audit_events_v2(
    timestamptz, timestamptz, uuid, text, text, text, text, uuid, uuid,
    boolean, timestamptz, bigint, integer
  ),
  api.admin_list_role_catalog(),
  api.admin_get_session_revocation_status(uuid),
  api.admin_get_revocation_worker_health(),
  api.admin_start_session_revocation_worker(text, boolean),
  api.admin_claim_session_revocations_v2(uuid, text, integer, integer),
  api.admin_complete_session_revocation_v2(uuid, uuid, text),
  api.admin_fail_session_revocation(uuid, uuid, text, text, boolean),
  api.admin_replay_session_revocation_dead_letter(uuid, text),
  api.admin_finish_session_revocation_worker(uuid, text, text)
from public, anon, authenticated, service_role;

-- The Phase 7A non-leased worker functions remain present for migration
-- compatibility but are no longer executable by the service role.
revoke execute on function
  api.admin_claim_session_revocations(integer),
  api.admin_complete_session_revocation(uuid, boolean, text)
from service_role;

grant execute on function
  api.get_my_staff_context(),
  api.admin_list_staff_assignments(text, text, text, timestamptz, uuid, integer),
  api.admin_get_staff_principal(uuid),
  api.admin_list_approval_queue(text, text, text, text, timestamptz, uuid, integer),
  api.admin_list_audit_events_v2(
    timestamptz, timestamptz, uuid, text, text, text, text, uuid, uuid,
    boolean, timestamptz, bigint, integer
  ),
  api.admin_list_role_catalog(),
  api.admin_get_session_revocation_status(uuid),
  api.admin_get_revocation_worker_health()
to authenticated;

grant execute on function
  api.admin_start_session_revocation_worker(text, boolean),
  api.admin_claim_session_revocations_v2(uuid, text, integer, integer),
  api.admin_complete_session_revocation_v2(uuid, uuid, text),
  api.admin_fail_session_revocation(uuid, uuid, text, text, boolean),
  api.admin_replay_session_revocation_dead_letter(uuid, text),
  api.admin_finish_session_revocation_worker(uuid, text, text)
to service_role;
