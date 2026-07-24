-- Phase 7D adds trusted, read-only operational checks. No browser role gains
-- table access and no production schedule is created.

create or replace function api.admin_get_owner_bootstrap_readiness(
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  auth_user auth.users%rowtype;
  principal app_private.staff_principals%rowtype;
  has_verified_mfa boolean := false;
  active_platform_admin_count integer := 0;
  target_has_active_platform_admin boolean := false;
  active_assignment_count integer := 0;
  readiness_code text;
begin
  if p_auth_user_id is null then
    raise exception using errcode = 'PT400', message = 'staff_principal_not_found';
  end if;

  select *
  into auth_user
  from auth.users
  where id = p_auth_user_id;

  if found then
    select exists (
      select 1
      from auth.mfa_factors factor
      where factor.user_id = p_auth_user_id
        and factor.status::text = 'verified'
    )
    into has_verified_mfa;
  end if;

  select *
  into principal
  from app_private.staff_principals staff
  where staff.auth_user_id = p_auth_user_id;

  select count(*)::integer
  into active_platform_admin_count
  from app_private.staff_role_assignments assignment
  join app_private.staff_principals staff
    on staff.id = assignment.staff_principal_id
  join app_private.admin_roles role
    on role.id = assignment.role_id
  where role.name = 'platform_admin'
    and role.active
    and staff.status = 'active'
    and assignment.status = 'active'
    and assignment.starts_at <= statement_timestamp()
    and (
      assignment.expires_at is null
      or assignment.expires_at > statement_timestamp()
    );

  if principal.id is not null then
    select
      count(*) filter (
        where assignment.status = 'active'
          and assignment.starts_at <= statement_timestamp()
          and (
            assignment.expires_at is null
            or assignment.expires_at > statement_timestamp()
          )
      )::integer,
      coalesce(
        bool_or(
          role.name = 'platform_admin'
          and role.active
          and assignment.status = 'active'
          and assignment.starts_at <= statement_timestamp()
          and (
            assignment.expires_at is null
            or assignment.expires_at > statement_timestamp()
          )
        ),
        false
      )
    into active_assignment_count, target_has_active_platform_admin
    from app_private.staff_role_assignments assignment
    join app_private.admin_roles role
      on role.id = assignment.role_id
    where assignment.staff_principal_id = principal.id;
  end if;

  readiness_code := case
    when auth_user.id is null then 'staff_user_not_found'
    when auth_user.email_confirmed_at is null then 'staff_user_not_verified'
    when not has_verified_mfa then 'staff_user_mfa_required'
    when target_has_active_platform_admin then 'already_bootstrapped'
    when active_platform_admin_count > 0 then 'platform_admin_conflict'
    when principal.id is not null and principal.status <> 'active'
      then 'staff_principal_inactive'
    when principal.id is not null and active_assignment_count > 0
      then 'staff_role_conflict'
    else 'eligible'
  end;

  return jsonb_build_object(
    'authUserId', p_auth_user_id,
    'authUserExists', auth_user.id is not null,
    'emailVerified', auth_user.email_confirmed_at is not null,
    'mfaVerified', has_verified_mfa,
    'staffPrincipalExists', principal.id is not null,
    'staffPrincipalStatus', principal.status,
    'activeAssignmentCount', active_assignment_count,
    'targetHasPlatformAdmin', target_has_active_platform_admin,
    'activePlatformAdminCount', active_platform_admin_count,
    'bootstrapEligible', readiness_code = 'eligible',
    'readinessCode', readiness_code
  );
end;
$$;

comment on function api.admin_get_owner_bootstrap_readiness(uuid) is
  'Service-role-only read-only owner bootstrap preflight. Returns no email, token, factor secret, or session payload.';

create or replace function api.admin_get_revocation_worker_runtime_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
  );
$$;

comment on function api.admin_get_revocation_worker_runtime_status() is
  'Service-role-only bounded worker status for trusted manual operations.';

revoke all on function
  api.admin_get_owner_bootstrap_readiness(uuid),
  api.admin_get_revocation_worker_runtime_status()
from public, anon, authenticated, service_role;

grant execute on function
  api.admin_get_owner_bootstrap_readiness(uuid),
  api.admin_get_revocation_worker_runtime_status()
to service_role;
