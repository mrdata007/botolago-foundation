-- BotolaGO Production V2
-- Phase 7C: staff administration, approval execution, and security operations.
--
-- This migration is additive and preserves Phase 7A/7B ledgers. Supabase Auth
-- remains the identity/MFA/session authority. Browser roles retain zero direct
-- access to auth or app_private tables.

create or replace function app_private.admin_mask_email(p_email text)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select case
    when position('@' in p_email) <= 1 then '***'
    else
      left(split_part(p_email, '@', 1), 1)
      || '***@'
      || left(split_part(p_email, '@', 2), 1)
      || '***'
      || case
        when position('.' in split_part(p_email, '@', 2)) > 0
          then substring(
            split_part(p_email, '@', 2)
            from position('.' in split_part(p_email, '@', 2))
          )
        else ''
      end
  end;
$$;

create or replace function app_private.admin_has_verified_mfa(p_auth_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.mfa_factors factor
    where factor.user_id = p_auth_user_id
      and factor.status::text = 'verified'
  );
$$;

create or replace function app_private.admin_is_effective_platform_admin(
  p_staff_principal_id uuid,
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
    from app_private.staff_principals principal
    join app_private.staff_role_assignments assignment
      on assignment.staff_principal_id = principal.id
    join app_private.admin_roles role on role.id = assignment.role_id
    where principal.id = p_staff_principal_id
      and principal.status = 'active'
      and role.name = 'platform_admin'
      and role.active
      and assignment.status = 'active'
      and assignment.starts_at <= p_at
      and (assignment.expires_at is null or assignment.expires_at > p_at)
  );
$$;

create or replace function app_private.admin_assert_not_last_platform_admin(
  p_target_principal_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_platform_admin_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('botolago:admin:last-platform-admin', 0)
  );

  if not app_private.admin_is_effective_platform_admin(p_target_principal_id) then
    return;
  end if;

  select count(distinct principal.id)::integer
  into active_platform_admin_count
  from app_private.staff_principals principal
  join app_private.staff_role_assignments assignment
    on assignment.staff_principal_id = principal.id
  join app_private.admin_roles role on role.id = assignment.role_id
  where principal.status = 'active'
    and role.name = 'platform_admin'
    and role.active
    and assignment.status = 'active'
    and assignment.starts_at <= statement_timestamp()
    and (
      assignment.expires_at is null
      or assignment.expires_at > statement_timestamp()
    );

  if active_platform_admin_count <= 1 then
    raise exception using
      errcode = 'PT409',
      message = 'last_platform_admin_required';
  end if;
end;
$$;

create or replace function app_private.admin_assert_direct_role_assignable(
  p_actor_principal_id uuid,
  p_role_name text
)
returns app_private.admin_roles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  role_record app_private.admin_roles%rowtype;
begin
  select *
  into role_record
  from app_private.admin_roles
  where name = p_role_name and active;

  if not found
    or p_role_name not in (
      'editor',
      'publisher',
      'content_admin',
      'football_operator',
      'fantasy_operator',
      'notification_operator',
      'support_agent',
      'moderator',
      'security_admin'
    )
  then
    if p_role_name = 'platform_admin' then
      raise exception using errcode = 'PT403', message = 'approval_required';
    end if;
    raise exception using errcode = 'PT400', message = 'role_not_assignable';
  end if;

  if p_role_name = 'security_admin'
    and not app_private.admin_is_effective_platform_admin(p_actor_principal_id)
  then
    raise exception using errcode = 'PT403', message = 'role_not_assignable';
  end if;

  return role_record;
end;
$$;

-- Keep at most one outstanding invalidation request per principal. Canonical
-- Admin access denial does not wait for this outbox.
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
  perform pg_advisory_xact_lock(
    hashtextextended(
      'botolago:admin:session-revocation:' || p_staff_principal_id::text,
      0
    )
  );

  select request.id
  into request_id
  from app_private.staff_session_revocation_requests request
  where request.staff_principal_id = p_staff_principal_id
    and request.status in ('pending', 'processing', 'failed')
  order by request.requested_at, request.id
  limit 1;

  if request_id is not null then
    return request_id;
  end if;

  insert into app_private.staff_session_revocation_requests (
    staff_principal_id,
    requested_by_principal_id,
    reason
  )
  values (
    p_staff_principal_id,
    p_requested_by_principal_id,
    p_reason
  )
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function api.admin_resolve_staff_user_exact(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_principal_id uuid;
  normalized_email text;
  matching_count integer;
  target_user auth.users%rowtype;
  principal app_private.staff_principals%rowtype;
  assignments jsonb;
  request_id uuid := gen_random_uuid();
  correlation_id uuid := gen_random_uuid();
  result jsonb;
  outcome_code text;
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff',
    true
  );

  normalized_email := lower(btrim(coalesce(p_email, '')));
  if normalized_email = ''
    or char_length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    raise exception using errcode = 'PT400', message = 'staff_user_not_found';
  end if;

  select count(*)::integer
  into matching_count
  from auth.users user_record
  where lower(user_record.email) = normalized_email;

  if matching_count = 0 then
    outcome_code := 'staff_user_not_found';
    result := jsonb_build_object(
      'found', false,
      'errorCode', outcome_code
    );
  elsif matching_count > 1 then
    outcome_code := 'staff_user_ambiguous';
    result := jsonb_build_object(
      'found', false,
      'errorCode', outcome_code
    );
  else
    select *
    into target_user
    from auth.users user_record
    where lower(user_record.email) = normalized_email;

    select *
    into principal
    from app_private.staff_principals staff
    where staff.auth_user_id = target_user.id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'assignmentId', assignment.id,
          'role', role.name,
          'status',
            case
              when assignment.status = 'active'
                and assignment.expires_at is not null
                and assignment.expires_at <= statement_timestamp()
                then 'expired'
              else assignment.status::text
            end,
          'startsAt', assignment.starts_at,
          'expiresAt', assignment.expires_at
        )
        order by assignment.created_at desc, assignment.id desc
      ),
      '[]'::jsonb
    )
    into assignments
    from (
      select *
      from app_private.staff_role_assignments history
      where history.staff_principal_id = principal.id
      order by history.created_at desc, history.id desc
      limit 50
    ) assignment
    join app_private.admin_roles role on role.id = assignment.role_id;

    result := jsonb_build_object(
      'found', true,
      'authUserId', target_user.id,
      'maskedEmail', app_private.admin_mask_email(target_user.email),
      'emailVerified', target_user.email_confirmed_at is not null,
      'mfaVerified', app_private.admin_has_verified_mfa(target_user.id),
      'staffPrincipal',
        case
          when principal.id is null then null
          else jsonb_build_object(
            'staffPrincipalId', principal.id,
            'status', principal.status,
            'mfaRequired', principal.mfa_required
          )
        end,
      'assignments', assignments
    );
  end if;

  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.resolve_staff_user',
    'security',
    case when matching_count = 1 then target_user.id else null end,
    'Exact staff identity lookup was performed.',
    request_id,
    correlation_id,
    null,
    null,
    jsonb_build_object(
      'found', matching_count = 1,
      'resultCode', outcome_code,
      'matchCount', least(matching_count, 2)
    )
  );

  return result;
end;
$$;

create or replace function api.admin_create_staff_principal(
  p_target_auth_user_id uuid,
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
  actor_auth_user_id uuid;
  target_user auth.users%rowtype;
  principal app_private.staff_principals%rowtype;
  prior_response jsonb;
  result jsonb;
  created boolean := false;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff',
    true
  );

  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'role_not_assignable';
  end if;

  select auth_user_id
  into actor_auth_user_id
  from app_private.staff_principals
  where id = actor_principal_id;

  if actor_auth_user_id = p_target_auth_user_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.create_principal',
    p_idempotency_key,
    jsonb_build_object(
      'targetAuthUserId', p_target_auth_user_id,
      'reason', p_reason
    )
  );
  if prior_response is not null then
    return prior_response;
  end if;

  select *
  into target_user
  from auth.users
  where id = p_target_auth_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_user_not_found';
  end if;
  if target_user.email_confirmed_at is null then
    raise exception using errcode = 'PT403', message = 'staff_user_not_verified';
  end if;
  if not app_private.admin_has_verified_mfa(target_user.id) then
    raise exception using errcode = 'PT403', message = 'staff_user_mfa_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('botolago:admin:principal:' || target_user.id::text, 0)
  );

  select *
  into principal
  from app_private.staff_principals
  where auth_user_id = target_user.id
  for update;

  if not found then
    insert into app_private.staff_principals (auth_user_id)
    values (target_user.id)
    returning * into principal;
    created := true;
  end if;

  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.create_staff_principal',
    'security',
    principal.id,
    p_reason,
    p_idempotency_key,
    correlation_id,
    null,
    null,
    jsonb_build_object(
      'staffPrincipalId', principal.id,
      'status', principal.status,
      'created', created,
      'roleCount', 0
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', principal.id,
    'authUserId', principal.auth_user_id,
    'status', principal.status,
    'mfaRequired', principal.mfa_required,
    'created', created,
    'roleGranted', false
  );

  return app_private.admin_complete_idempotent_operation(
    actor_principal_id,
    'staff.create_principal',
    p_idempotency_key,
    result
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
  target_user auth.users%rowtype;
  target_principal app_private.staff_principals%rowtype;
  role_record app_private.admin_roles%rowtype;
  assignment_id uuid;
  revocation_request_id uuid;
  prior_response jsonb;
  result jsonb;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff',
    true
  );

  select auth_user_id
  into actor_auth_user_id
  from app_private.staff_principals
  where id = actor_principal_id;

  if actor_auth_user_id = p_target_auth_user_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_approval_id is not null or p_role_name = 'platform_admin' then
    raise exception using errcode = 'PT403', message = 'approval_required';
  end if;
  if p_expires_at is not null and p_expires_at <= statement_timestamp() then
    raise exception using errcode = 'PT400', message = 'role_assignment_expired';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
    or (
      p_reference is not null
      and (
        p_reference <> btrim(p_reference)
        or char_length(p_reference) not between 3 and 200
        or p_reference ~* '(token|password|secret|credential|api[_-]?key)'
      )
    )
  then
    raise exception using errcode = 'PT400', message = 'role_not_assignable';
  end if;

  role_record := app_private.admin_assert_direct_role_assignable(
    actor_principal_id,
    p_role_name
  );

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.assign_role',
    p_idempotency_key,
    jsonb_build_object(
      'targetAuthUserId', p_target_auth_user_id,
      'role', p_role_name,
      'expiresAt', p_expires_at,
      'reason', p_reason,
      'reference', p_reference
    )
  );
  if prior_response is not null then
    return prior_response;
  end if;

  select *
  into target_user
  from auth.users
  where id = p_target_auth_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_user_not_found';
  end if;
  if target_user.email_confirmed_at is null then
    raise exception using errcode = 'PT403', message = 'staff_user_not_verified';
  end if;
  if not app_private.admin_has_verified_mfa(target_user.id) then
    raise exception using errcode = 'PT403', message = 'staff_user_mfa_required';
  end if;

  select *
  into target_principal
  from app_private.staff_principals
  where auth_user_id = target_user.id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_principal_not_found';
  end if;
  if target_principal.status = 'suspended' then
    raise exception using errcode = 'PT403', message = 'staff_principal_suspended';
  end if;
  if target_principal.status = 'revoked' then
    raise exception using errcode = 'PT403', message = 'staff_principal_revoked';
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
    raise exception using errcode = 'PT409', message = 'role_assignment_conflict';
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
    null,
    null,
    jsonb_build_object(
      'assignmentId', assignment_id,
      'role', role_record.name,
      'status', 'active',
      'expiresAt', p_expires_at,
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', target_principal.id,
    'assignmentId', assignment_id,
    'role', role_record.name,
    'status', 'active',
    'expiresAt', p_expires_at,
    'sessionRevocationRequestId', revocation_request_id
  );

  return app_private.admin_complete_idempotent_operation(
    actor_principal_id,
    'staff.assign_role',
    p_idempotency_key,
    result
  );
end;
$$;

create or replace function api.admin_shorten_role_expiry(
  p_assignment_id uuid,
  p_expires_at timestamptz,
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
  prior_response jsonb;
  result jsonb;
  revocation_request_id uuid;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff',
    true
  );

  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
    or p_expires_at is null
    or p_expires_at <= statement_timestamp()
  then
    raise exception using errcode = 'PT400', message = 'role_assignment_expired';
  end if;

  select assignment_row.*
  into assignment
  from app_private.staff_role_assignments assignment_row
  where assignment_row.id = p_assignment_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'role_assignment_not_found';
  end if;
  select role.name
  into role_name
  from app_private.admin_roles role
  where role.id = assignment.role_id;
  if assignment.staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if assignment.status = 'revoked' then
    raise exception using errcode = 'PT409', message = 'role_assignment_already_revoked';
  end if;
  if assignment.status <> 'active'
    or (
      assignment.expires_at is not null
      and assignment.expires_at <= statement_timestamp()
    )
  then
    raise exception using errcode = 'PT410', message = 'role_assignment_expired';
  end if;
  if assignment.expires_at is not null and p_expires_at >= assignment.expires_at then
    raise exception using errcode = 'PT409', message = 'role_assignment_conflict';
  end if;
  if role_name = 'platform_admin' then
    perform app_private.admin_assert_not_last_platform_admin(
      assignment.staff_principal_id
    );
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.shorten_role_expiry',
    p_idempotency_key,
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'expiresAt', p_expires_at,
      'reason', p_reason
    )
  );
  if prior_response is not null then
    return prior_response;
  end if;

  update app_private.staff_role_assignments
  set expires_at = p_expires_at
  where id = assignment.id;

  revocation_request_id := app_private.queue_staff_session_revocation(
    assignment.staff_principal_id,
    actor_principal_id,
    'Staff role expiry was shortened; privileged session invalidation was requested.'
  );

  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.shorten_role_expiry',
    'security',
    assignment.staff_principal_id,
    p_reason,
    p_idempotency_key,
    correlation_id,
    null,
    jsonb_build_object(
      'assignmentId', assignment.id,
      'role', role_name,
      'expiresAt', assignment.expires_at
    ),
    jsonb_build_object(
      'assignmentId', assignment.id,
      'role', role_name,
      'expiresAt', p_expires_at,
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', assignment.staff_principal_id,
    'assignmentId', assignment.id,
    'role', role_name,
    'status', 'active',
    'expiresAt', p_expires_at,
    'sessionRevocationRequestId', revocation_request_id
  );

  return app_private.admin_complete_idempotent_operation(
    actor_principal_id,
    'staff.shorten_role_expiry',
    p_idempotency_key,
    result
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
    'security.revoke_staff',
    true
  );

  select assignment_row.*
  into assignment
  from app_private.staff_role_assignments assignment_row
  where assignment_row.id = p_assignment_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'role_assignment_not_found';
  end if;
  select role.name
  into role_name
  from app_private.admin_roles role
  where role.id = assignment.role_id;
  if assignment.staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'role_not_assignable';
  end if;

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
      actor_principal_id,
      'staff.revoke_role',
      p_idempotency_key,
      result
    );
  end if;
  if assignment.status <> 'active'
    or (
      assignment.expires_at is not null
      and assignment.expires_at <= statement_timestamp()
    )
  then
    raise exception using errcode = 'PT410', message = 'role_assignment_expired';
  end if;
  if role_name = 'platform_admin' then
    perform app_private.admin_assert_not_last_platform_admin(
      assignment.staff_principal_id
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
    actor_principal_id,
    'staff.revoke_role',
    p_idempotency_key,
    result
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
  target_principal app_private.staff_principals%rowtype;
  target_user auth.users%rowtype;
  new_assignment_id uuid;
  revocation_request_id uuid;
  prior_response jsonb;
  result jsonb;
  correlation_id uuid := gen_random_uuid();
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff',
    true
  );

  if p_approval_id is not null then
    raise exception using errcode = 'PT403', message = 'approval_required';
  end if;
  if p_expires_at is null or p_expires_at <= statement_timestamp() then
    raise exception using errcode = 'PT400', message = 'role_assignment_expired';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
    or (
      p_reference is not null
      and (
        p_reference <> btrim(p_reference)
        or char_length(p_reference) not between 3 and 200
        or p_reference ~* '(token|password|secret|credential|api[_-]?key)'
      )
    )
  then
    raise exception using errcode = 'PT400', message = 'role_not_assignable';
  end if;

  select *
  into assignment
  from app_private.staff_role_assignments
  where id = p_assignment_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'role_assignment_not_found';
  end if;
  if assignment.staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;

  select *
  into role_record
  from app_private.admin_roles
  where id = assignment.role_id;
  role_record := app_private.admin_assert_direct_role_assignable(
    actor_principal_id,
    role_record.name
  );

  select *
  into target_principal
  from app_private.staff_principals
  where id = assignment.staff_principal_id
  for update;
  if target_principal.status = 'suspended' then
    raise exception using errcode = 'PT403', message = 'staff_principal_suspended';
  end if;
  if target_principal.status = 'revoked' then
    raise exception using errcode = 'PT403', message = 'staff_principal_revoked';
  end if;

  select *
  into target_user
  from auth.users
  where id = target_principal.auth_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_user_not_found';
  end if;
  if target_user.email_confirmed_at is null then
    raise exception using errcode = 'PT403', message = 'staff_user_not_verified';
  end if;
  if not app_private.admin_has_verified_mfa(target_user.id) then
    raise exception using errcode = 'PT403', message = 'staff_user_mfa_required';
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'staff.renew_role',
    p_idempotency_key,
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'expiresAt', p_expires_at,
      'reason', p_reason,
      'reference', p_reference
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
      and (
        current_assignment.expires_at is null
        or current_assignment.expires_at > statement_timestamp()
      )
  ) then
    raise exception using errcode = 'PT409', message = 'role_assignment_conflict';
  end if;

  if assignment.status = 'active'
    and (
      assignment.expires_at is null
      or assignment.expires_at > statement_timestamp()
    )
  then
    update app_private.staff_role_assignments
    set
      status = 'revoked',
      revoked_at = statement_timestamp(),
      revoked_by_principal_id = actor_principal_id,
      revocation_reason = 'Superseded by an explicitly renewed assignment.'
    where id = assignment.id;
  elsif assignment.status = 'active' then
    update app_private.staff_role_assignments
    set status = 'expired'
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
    null,
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
    actor_principal_id,
    'staff.renew_role',
    p_idempotency_key,
    result
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
    'security.revoke_staff',
    true
  );
  if p_staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'role_not_assignable';
  end if;

  select *
  into target
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
    raise exception using errcode = 'PT403', message = 'staff_principal_revoked';
  end if;
  if target.status = 'active' then
    perform app_private.admin_assert_not_last_platform_admin(target.id);
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
    actor_principal_id,
    'staff.suspend',
    p_idempotency_key,
    result
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
  expired_assignment_count integer;
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff',
    true
  );
  if p_staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'role_not_assignable';
  end if;

  select *
  into target
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
    raise exception using errcode = 'PT403', message = 'staff_principal_revoked';
  end if;
  if target.status <> 'suspended' then
    raise exception using errcode = 'PT409', message = 'role_assignment_conflict';
  end if;

  update app_private.staff_role_assignments
  set status = 'expired'
  where staff_principal_id = target.id
    and status = 'active'
    and expires_at is not null
    and expires_at <= statement_timestamp();
  get diagnostics expired_assignment_count = row_count;

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
      'expiredAssignmentCount', expired_assignment_count,
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', target.id,
    'status', 'active',
    'expiredAssignmentCount', expired_assignment_count,
    'sessionRevocationRequestId', revocation_request_id
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id,
    'staff.restore',
    p_idempotency_key,
    result
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
  revoked_assignment_count integer := 0;
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.revoke_staff',
    true
  );
  if p_staff_principal_id = actor_principal_id then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'role_not_assignable';
  end if;

  select *
  into target
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
    perform app_private.admin_assert_not_last_platform_admin(target.id);

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
    where staff_principal_id = target.id
      and status = 'active';
    get diagnostics revoked_assignment_count = row_count;
  end if;

  revocation_request_id := app_private.queue_staff_session_revocation(
    target.id,
    actor_principal_id,
    'Emergency staff revocation requires privileged session invalidation.'
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
      'revokedAssignmentCount', revoked_assignment_count,
      'sessionRevocationRequestId', revocation_request_id
    )
  );

  result := jsonb_build_object(
    'staffPrincipalId', target.id,
    'status', 'revoked',
    'revokedAssignmentCount', revoked_assignment_count,
    'sessionRevocationRequestId', revocation_request_id
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id,
    'staff.emergency_revoke',
    p_idempotency_key,
    result
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
  actor_auth_user_id uuid;
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

  select permission.name
  into permission_name
  from app_private.admin_permissions permission
  where permission.id = approval.required_permission_id;

  actor_principal_id := app_private.admin_assert_permission(
    permission_name,
    true
  );
  select auth_user_id
  into actor_auth_user_id
  from app_private.staff_principals
  where id = actor_principal_id;

  if actor_principal_id = approval.requester_principal_id then
    raise exception using errcode = 'PT403', message = 'self_approval_forbidden';
  end if;
  if approval.operation_type = 'staff.assign_platform_admin'
    and actor_auth_user_id = approval.target_entity_id
  then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if approval.payload_fingerprint <> p_payload_fingerprint
    or approval.payload_fingerprint
      <> app_private.admin_payload_fingerprint(approval.safe_payload_reference)
  then
    raise exception using errcode = 'PT409', message = 'approval_payload_mismatch';
  end if;
  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
  end if;

  prior_response := app_private.admin_begin_idempotent_operation(
    actor_principal_id,
    'approval.approve',
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

  if approval.expires_at <= statement_timestamp() then
    update app_private.admin_approval_requests
    set
      status = 'expired',
      decided_at = statement_timestamp(),
      decision_reason = 'Approval expired before a second operator approved it.'
    where id = approval.id and status = 'pending';
    raise exception using errcode = 'PT410', message = 'approval_expired';
  end if;
  if approval.status = 'approved' then
    result := jsonb_build_object(
      'approvalId', approval.id,
      'status', 'approved',
      'decidedAt', approval.decided_at
    );
    return app_private.admin_complete_idempotent_operation(
      actor_principal_id,
      'approval.approve',
      p_idempotency_key,
      result
    );
  end if;
  if approval.status <> 'pending' then
    raise exception using errcode = 'PT409', message = 'approval_conflict';
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
    jsonb_build_object(
      'status', 'approved',
      'payloadFingerprint', approval.payload_fingerprint
    )
  );

  result := jsonb_build_object(
    'approvalId', approval.id,
    'status', 'approved',
    'decidedAt', statement_timestamp()
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id,
    'approval.approve',
    p_idempotency_key,
    result
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
  target_user auth.users%rowtype;
  target_principal app_private.staff_principals%rowtype;
begin
  select request.*
  into approval
  from app_private.admin_approval_requests request
  where request.id = p_approval_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'approval_not_found';
  end if;

  select permission.name
  into permission_name
  from app_private.admin_permissions permission
  where permission.id = approval.required_permission_id;

  actor_principal_id := app_private.admin_assert_principal(true, false);
  if actor_principal_id <> approval.requester_principal_id
    and not app_private.admin_has_permission(actor_principal_id, permission_name)
  then
    raise exception using errcode = 'PT403', message = 'staff_access_denied';
  end if;

  if approval.operation_type = 'staff.assign_platform_admin'
    and approval.target_entity_id is not null
  then
    select *
    into target_user
    from auth.users
    where id = approval.target_entity_id;

    select *
    into target_principal
    from app_private.staff_principals
    where auth_user_id = approval.target_entity_id;
  end if;

  return jsonb_build_object(
    'approvalId', approval.id,
    'status',
      case
        when approval.status = 'pending'
          and approval.expires_at <= statement_timestamp()
          then 'expired'
        else approval.status::text
      end,
    'operationType', approval.operation_type,
    'targetDomain', approval.target_domain,
    'targetEntityId', approval.target_entity_id,
    'targetSummary',
      case
        when target_user.id is null then null
        else jsonb_build_object(
          'maskedEmail', app_private.admin_mask_email(target_user.email),
          'emailVerified', target_user.email_confirmed_at is not null,
          'mfaVerified', app_private.admin_has_verified_mfa(target_user.id),
          'staffPrincipalId', target_principal.id,
          'principalStatus', target_principal.status
        )
      end,
    'payloadFingerprint', approval.payload_fingerprint,
    'reason', approval.reason,
    'requestedAt', approval.requested_at,
    'expiresAt', approval.expires_at,
    'decidedAt', approval.decided_at,
    'executionStatus', approval.execution_status,
    'executedAt', approval.executed_at,
    'executionResult', approval.execution_result,
    'correlationId', approval.correlation_id
  );
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
  actor_auth_user_id uuid;
  requester app_private.staff_principals%rowtype;
  approver app_private.staff_principals%rowtype;
  target_principal app_private.staff_principals%rowtype;
  target_user auth.users%rowtype;
  platform_role_id uuid;
  target_auth_user_id uuid;
  assignment_expires_at timestamptz;
  assignment_id uuid;
  revocation_request_id uuid;
  prior_response jsonb;
  assignment_result jsonb;
  result jsonb;
begin
  actor_principal_id := app_private.admin_assert_permission(
    'security.manage_staff',
    true
  );
  select auth_user_id
  into actor_auth_user_id
  from app_private.staff_principals
  where id = actor_principal_id;

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

  if p_reason is null
    or p_reason <> btrim(p_reason)
    or char_length(p_reason) not between 8 and 500
  then
    raise exception using errcode = 'PT400', message = 'approval_payload_mismatch';
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
    raise exception using errcode = 'PT409', message = 'approval_conflict';
  end if;
  if approval.operation_type <> 'staff.assign_platform_admin'
    or approval.target_domain <> 'security'
    or approval.payload_fingerprint <> p_payload_fingerprint
    or approval.payload_fingerprint
      <> app_private.admin_payload_fingerprint(approval.safe_payload_reference)
    or approval.safe_payload_reference ->> 'role' <> 'platform_admin'
  then
    raise exception using errcode = 'PT409', message = 'approval_payload_mismatch';
  end if;
  if approval.requester_principal_id = approval.decided_by_principal_id
    or approval.decided_by_principal_id is null
  then
    raise exception using errcode = 'PT409', message = 'self_approval_forbidden';
  end if;

  target_auth_user_id :=
    (approval.safe_payload_reference ->> 'targetAuthUserId')::uuid;
  assignment_expires_at :=
    nullif(approval.safe_payload_reference ->> 'expiresAt', '')::timestamptz;

  if approval.target_entity_id is distinct from target_auth_user_id
    or actor_auth_user_id = target_auth_user_id
  then
    raise exception using errcode = 'PT403', message = 'self_escalation_forbidden';
  end if;
  if assignment_expires_at is not null
    and assignment_expires_at <= statement_timestamp()
  then
    raise exception using errcode = 'PT410', message = 'role_assignment_expired';
  end if;

  select *
  into requester
  from app_private.staff_principals
  where id = approval.requester_principal_id;
  select *
  into approver
  from app_private.staff_principals
  where id = approval.decided_by_principal_id;

  if requester.status <> 'active'
    or approver.status <> 'active'
    or not app_private.admin_has_permission(
      requester.id,
      'security.manage_staff'
    )
    or not app_private.admin_has_permission(
      approver.id,
      'security.manage_staff'
    )
    or not app_private.admin_has_verified_mfa(requester.auth_user_id)
    or not app_private.admin_has_verified_mfa(approver.auth_user_id)
  then
    raise exception using errcode = 'PT403', message = 'approval_conflict';
  end if;

  select *
  into target_user
  from auth.users
  where id = target_auth_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_user_not_found';
  end if;
  if target_user.email_confirmed_at is null then
    raise exception using errcode = 'PT403', message = 'staff_user_not_verified';
  end if;
  if not app_private.admin_has_verified_mfa(target_user.id) then
    raise exception using errcode = 'PT403', message = 'staff_user_mfa_required';
  end if;

  select *
  into target_principal
  from app_private.staff_principals
  where auth_user_id = target_user.id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'staff_principal_not_found';
  end if;
  if target_principal.status = 'suspended' then
    raise exception using errcode = 'PT403', message = 'staff_principal_suspended';
  end if;
  if target_principal.status = 'revoked' then
    raise exception using errcode = 'PT403', message = 'staff_principal_revoked';
  end if;

  select id
  into platform_role_id
  from app_private.admin_roles
  where name = 'platform_admin' and active;
  if platform_role_id is null then
    raise exception using errcode = 'PT400', message = 'role_not_assignable';
  end if;

  update app_private.staff_role_assignments
  set status = 'expired'
  where staff_principal_id = target_principal.id
    and role_id = platform_role_id
    and status = 'active'
    and expires_at is not null
    and expires_at <= statement_timestamp();

  if exists (
    select 1
    from app_private.staff_role_assignments assignment
    where assignment.staff_principal_id = target_principal.id
      and assignment.role_id = platform_role_id
      and assignment.status = 'active'
  ) then
    raise exception using errcode = 'PT409', message = 'role_assignment_conflict';
  end if;

  update app_private.admin_approval_requests
  set
    execution_status = 'executing',
    executed_by_principal_id = actor_principal_id
  where id = approval.id;

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
    platform_role_id,
    actor_principal_id,
    approval.reason,
    'approval:' || approval.id::text,
    assignment_expires_at
  )
  returning id into assignment_id;

  revocation_request_id := app_private.queue_staff_session_revocation(
    target_principal.id,
    actor_principal_id,
    'Platform administrator assignment changed the privileged session scope.'
  );

  assignment_result := jsonb_build_object(
    'staffPrincipalId', target_principal.id,
    'assignmentId', assignment_id,
    'role', 'platform_admin',
    'status', 'active',
    'expiresAt', assignment_expires_at,
    'sessionRevocationRequestId', revocation_request_id
  );

  update app_private.admin_approval_requests
  set
    execution_status = 'executed',
    executed_at = statement_timestamp(),
    execution_result = jsonb_build_object(
      'assignmentId', assignment_id,
      'staffPrincipalId', target_principal.id
    )
  where id = approval.id;

  perform app_private.write_admin_audit(
    actor_principal_id,
    'security.assign_platform_admin',
    'security',
    target_principal.id,
    approval.reason,
    p_idempotency_key,
    approval.correlation_id,
    approval.id,
    null,
    jsonb_build_object(
      'assignmentId', assignment_id,
      'role', 'platform_admin',
      'status', 'active',
      'expiresAt', assignment_expires_at,
      'sessionRevocationRequestId', revocation_request_id
    )
  );

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
      'assignmentId', assignment_id
    )
  );

  result := jsonb_build_object(
    'approvalId', approval.id,
    'status', 'approved',
    'executionStatus', 'executed',
    'executedAt', statement_timestamp(),
    'result', assignment_result
  );
  return app_private.admin_complete_idempotent_operation(
    actor_principal_id,
    'approval.execute',
    p_idempotency_key,
    result
  );
end;
$$;

comment on function api.admin_resolve_staff_user_exact(text) is
  'Exact, masked, audited Auth identity resolution for security.manage_staff.';
comment on function api.admin_create_staff_principal(uuid, text, uuid) is
  'Creates an eligible staff principal without granting any role.';
comment on function api.admin_shorten_role_expiry(uuid, timestamptz, text, uuid) is
  'Shortens one effective assignment using server time and immutable audit evidence.';

revoke all on function api.admin_resolve_staff_user_exact(text)
  from public, anon;
revoke all on function api.admin_create_staff_principal(uuid, text, uuid)
  from public, anon;
revoke all on function api.admin_shorten_role_expiry(
  uuid,
  timestamptz,
  text,
  uuid
) from public, anon;

grant execute on function api.admin_resolve_staff_user_exact(text)
  to authenticated;
grant execute on function api.admin_create_staff_principal(uuid, text, uuid)
  to authenticated;
grant execute on function api.admin_shorten_role_expiry(
  uuid,
  timestamptz,
  text,
  uuid
) to authenticated;
