begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7d-owner@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7d-other@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    'b1000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7d-unverified@example.test', 'hash',
    null, '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    'b1000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7d-no-mfa@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  );

insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status, created_at, updated_at
)
values
  (
    'b2000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'Phase 7D owner TOTP', 'totp', 'verified',
    statement_timestamp(), statement_timestamp()
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'Phase 7D other TOTP', 'totp', 'verified',
    statement_timestamp(), statement_timestamp()
  ),
  (
    'b2000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000003',
    'Phase 7D unverified TOTP', 'totp', 'verified',
    statement_timestamp(), statement_timestamp()
  );

set local role service_role;

select extensions.is(
  api.admin_get_owner_bootstrap_readiness(
    'b1000000-0000-4000-8000-000000000001'
  ) ->> 'readinessCode',
  'eligible',
  'one verified MFA owner is eligible before the first bootstrap'
);
select extensions.is(
  (
    api.admin_get_owner_bootstrap_readiness(
      'b1000000-0000-4000-8000-000000000001'
    ) ->> 'bootstrapEligible'
  )::boolean,
  true,
  'owner readiness exposes one explicit safe eligibility boolean'
);
select extensions.is(
  api.admin_get_owner_bootstrap_readiness(
    'b1000000-0000-4000-8000-000000000099'
  ) ->> 'readinessCode',
  'staff_user_not_found',
  'a missing Auth user fails readiness with a stable code'
);
select extensions.is(
  api.admin_get_owner_bootstrap_readiness(
    'b1000000-0000-4000-8000-000000000003'
  ) ->> 'readinessCode',
  'staff_user_not_verified',
  'an unverified Auth user cannot pass owner readiness'
);
select extensions.is(
  api.admin_get_owner_bootstrap_readiness(
    'b1000000-0000-4000-8000-000000000004'
  ) ->> 'readinessCode',
  'staff_user_mfa_required',
  'an Auth user without verified MFA cannot pass owner readiness'
);
select extensions.ok(
  not (
    api.admin_get_owner_bootstrap_readiness(
      'b1000000-0000-4000-8000-000000000001'
    ) ?| array[
      'email',
      'accessToken',
      'refreshToken',
      'password',
      'secret',
      'session'
    ]
  )
  and api.admin_get_owner_bootstrap_readiness(
    'b1000000-0000-4000-8000-000000000001'
  )::text !~* '[^[:space:]@]+@[^[:space:]@]+',
  'the readiness response contains no address, token, password, secret, or session payload'
);

reset role;
create temporary table phase7d_before_readiness as
select
  (select count(*) from app_private.staff_principals) as principals,
  (select count(*) from app_private.staff_role_assignments) as assignments,
  (select count(*) from app_private.admin_audit_events) as audits;

set local role service_role;
select api.admin_get_owner_bootstrap_readiness(
  'b1000000-0000-4000-8000-000000000001'
);
reset role;

select extensions.is(
  (
    select jsonb_build_array(
      (select count(*) from app_private.staff_principals),
      (select count(*) from app_private.staff_role_assignments),
      (select count(*) from app_private.admin_audit_events)
    )
  ),
  (
    select jsonb_build_array(principals, assignments, audits)
    from phase7d_before_readiness
  ),
  'owner readiness is read-only across principals, assignments, and audit evidence'
);

set local role service_role;
select extensions.lives_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    'b1000000-0000-4000-8000-000000000001',
    'Bootstrap deterministic Phase 7D owner.',
    true
  )$$,
  'the reviewed bootstrap contract remains the only first-owner mutation'
);
select extensions.is(
  api.admin_get_owner_bootstrap_readiness(
    'b1000000-0000-4000-8000-000000000001'
  ) ->> 'readinessCode',
  'already_bootstrapped',
  'the same owner is reported as already bootstrapped without mutation'
);
select extensions.is(
  api.admin_get_owner_bootstrap_readiness(
    'b1000000-0000-4000-8000-000000000002'
  ) ->> 'readinessCode',
  'platform_admin_conflict',
  'a different eligible user cannot use first-owner bootstrap after activation'
);
select extensions.is(
  (
    api.admin_get_owner_bootstrap_readiness(
      'b1000000-0000-4000-8000-000000000001'
    ) ->> 'activePlatformAdminCount'
  )::integer,
  1,
  'readiness reports the exact active platform-admin count'
);

select extensions.is(
  api.admin_get_revocation_worker_runtime_status() -> 'queue',
  '{"pending":0,"processing":0,"retrying":0,"deadLetter":0}'::jsonb,
  'trusted worker status returns bounded empty queue counts'
);
select extensions.is(
  api.admin_get_revocation_worker_runtime_status() -> 'runs',
  '[]'::jsonb,
  'trusted worker status returns a bounded empty run list'
);

select extensions.finish();
rollback;
