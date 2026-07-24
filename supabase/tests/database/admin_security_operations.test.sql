begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7c-platform@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7c-security@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7c-target@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7c-unverified@example.test', 'hash',
    null, '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7c-no-mfa@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    'a1000000-0000-4000-8000-000000000006',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7c-ordinary@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  );

insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status, created_at, updated_at
)
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Phase 7C TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    'Phase 7C TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    'a2000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000003',
    'Phase 7C TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    'a2000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000004',
    'Phase 7C TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  );

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  (
    'a3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    statement_timestamp(), statement_timestamp(), 'aal2'
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    statement_timestamp(), statement_timestamp(), 'aal2'
  ),
  (
    'a3000000-0000-4000-8000-000000000006',
    'a1000000-0000-4000-8000-000000000006',
    statement_timestamp(), statement_timestamp(), 'aal2'
  );

select extensions.lives_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    'a1000000-0000-4000-8000-000000000001',
    'Bootstrap deterministic Phase 7C platform administrator.',
    true
  )$$,
  'Phase 7C reuses only the one-time trusted bootstrap exception'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"a3000000-0000-4000-8000-000000000001"}',
  true
);

select extensions.is(
  api.admin_resolve_staff_user_exact('PHASE7C-TARGET@example.test') ->> 'maskedEmail',
  'p***@e***.test',
  'exact identity resolution is case-insensitive and returns only a masked email'
);
select extensions.is(
  api.admin_resolve_staff_user_exact('missing-phase7c@example.test') ->> 'errorCode',
  'staff_user_not_found',
  'missing exact identity returns a stable audited result'
);
select extensions.ok(
  pg_get_functiondef(
    'api.admin_resolve_staff_user_exact(text)'::regprocedure
  ) like '%staff_user_ambiguous%',
  'the exact lookup contract has an explicit ambiguous-result path'
);
select extensions.lives_ok(
  $$select api.admin_create_staff_principal(
    'a1000000-0000-4000-8000-000000000002',
    'Create the independent Phase 7C security administrator principal.',
    'a4000000-0000-4000-8000-000000000001'
  )$$,
  'an eligible verified MFA user can become a principal'
);
select extensions.lives_ok(
  $$select api.admin_create_staff_principal(
    'a1000000-0000-4000-8000-000000000003',
    'Create the Phase 7C standard role target principal.',
    'a4000000-0000-4000-8000-000000000002'
  )$$,
  'principal creation succeeds without assigning a role'
);
select extensions.is(
  jsonb_array_length(
    api.admin_resolve_staff_user_exact(
      'phase7c-target@example.test'
    ) -> 'assignments'
  ),
  0,
  'principal creation grants no implicit role'
);
select extensions.throws_ok(
  $$select api.admin_create_staff_principal(
    'a1000000-0000-4000-8000-000000000004',
    'An unverified user cannot become a staff principal.',
    'a4000000-0000-4000-8000-000000000003'
  )$$,
  'PT403',
  'staff_user_not_verified',
  'principal creation rejects an unverified Auth user'
);
select extensions.throws_ok(
  $$select api.admin_create_staff_principal(
    'a1000000-0000-4000-8000-000000000005',
    'A user without verified MFA cannot become a staff principal.',
    'a4000000-0000-4000-8000-000000000004'
  )$$,
  'PT403',
  'staff_user_mfa_required',
  'principal creation rejects a user without verified MFA'
);
select extensions.lives_ok(
  $$select api.admin_assign_role(
    'a1000000-0000-4000-8000-000000000002',
    'security_admin',
    null,
    'Grant independent Phase 7C security administration authority.',
    'phase7c:security-admin',
    'a4000000-0000-4000-8000-000000000005'
  )$$,
  'only a platform administrator can directly create a security administrator'
);
select extensions.lives_ok(
  $$select api.admin_assign_role(
    'a1000000-0000-4000-8000-000000000003',
    'editor',
    statement_timestamp() + interval '1 day',
    'Grant a bounded standard role through the server catalog.',
    'phase7c:editor',
    'a4000000-0000-4000-8000-000000000006'
  )$$,
  'a catalog-controlled standard role can be assigned'
);
select extensions.throws_ok(
  $$select api.admin_assign_role(
    'a1000000-0000-4000-8000-000000000003',
    'owner',
    null,
    'An arbitrary role name must never become authoritative.',
    'phase7c:invalid-role',
    'a4000000-0000-4000-8000-000000000007'
  )$$,
  'PT400',
  'role_not_assignable',
  'arbitrary roles are rejected'
);
select extensions.throws_ok(
  $$select api.admin_assign_role(
    'a1000000-0000-4000-8000-000000000003',
    'platform_admin',
    null,
    'Direct platform administration must always require dual control.',
    'phase7c:no-direct-platform',
    'a4000000-0000-4000-8000-000000000008'
  )$$,
  'PT403',
  'approval_required',
  'there is no direct platform-admin grant path'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"a3000000-0000-4000-8000-000000000002"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_suspend_staff(
    (
      select id
      from app_private.staff_principals
      where auth_user_id = 'a1000000-0000-4000-8000-000000000001'
    ),
    'The final active platform administrator must remain available.',
    'a4000000-0000-4000-8000-000000000009'
  )$$,
  '42501',
  null,
  'browser arguments cannot directly inspect private principal tables'
);

reset role;
select set_config(
  'test.phase7c_platform_principal',
  (
    select id::text
    from app_private.staff_principals
    where auth_user_id = 'a1000000-0000-4000-8000-000000000001'
  ),
  true
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"a3000000-0000-4000-8000-000000000002"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_suspend_staff(
    current_setting('test.phase7c_platform_principal')::uuid,
    'The final active platform administrator must remain available.',
    'a4000000-0000-4000-8000-000000000010'
  )$$,
  'PT409',
  'last_platform_admin_required',
  'the last active platform administrator cannot be suspended'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2","session_id":"a3000000-0000-4000-8000-000000000006"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_resolve_staff_user_exact(
    'phase7c-target@example.test'
  )$$,
  'PT403',
  'staff_access_denied',
  'ordinary authenticated users cannot enumerate Auth users'
);

reset role;
select extensions.ok(
  (
    select count(*) >= 4
    from app_private.admin_audit_events
    where action in (
      'security.resolve_staff_user',
      'security.create_staff_principal',
      'security.assign_role'
    )
  ),
  'Phase 7C identity and assignment operations append audit evidence'
);
select extensions.is(
  (
    select count(*)::integer
    from app_private.staff_session_revocation_requests request
    join app_private.staff_principals principal
      on principal.id = request.staff_principal_id
    where principal.auth_user_id = 'a1000000-0000-4000-8000-000000000003'
      and request.status in ('pending', 'processing', 'failed')
  ),
  1,
  'outstanding session invalidation work is deduplicated per principal'
);

select * from extensions.finish();
rollback;
