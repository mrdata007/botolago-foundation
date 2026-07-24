begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '75000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rls-admin@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"rls_admin"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '75000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-8000-000000000000',
    'authenticated', 'authenticated', 'rls-user@example.test', 'hash',
    statement_timestamp(), '{"role":"platform_admin"}',
    '{"username":"rls_user","is_admin":true}',
    statement_timestamp(), statement_timestamp()
  );

insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status, created_at, updated_at
)
values (
  '76000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
);
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values (
  '77000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  statement_timestamp(), statement_timestamp(), 'aal2'
);

set local role service_role;
select extensions.throws_ok(
  $$select * from app_private.staff_principals$$,
  '42501',
  null,
  'service role has no direct staff-table read grant'
);
select extensions.lives_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    '75000000-0000-4000-8000-000000000001',
    'Bootstrap the deterministic RLS administrator for contract tests.',
    true
  )$$,
  'service role may execute only the trusted bootstrap contract'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"75000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"77000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.lives_ok(
  $$select api.get_my_staff_context()$$,
  'authenticated staff may use the controlled current-context RPC'
);
select extensions.throws_ok(
  $$select * from app_private.staff_principals$$,
  '42501',
  null,
  'authenticated staff cannot directly read principals'
);
select extensions.throws_ok(
  $$select * from app_private.admin_roles$$,
  '42501',
  null,
  'authenticated staff cannot directly read role policy rows'
);
select extensions.throws_ok(
  $$select * from app_private.admin_permissions$$,
  '42501',
  null,
  'authenticated staff cannot directly read permission policy rows'
);
select extensions.throws_ok(
  $$select * from app_private.staff_role_assignments$$,
  '42501',
  null,
  'authenticated staff cannot directly read assignments'
);
select extensions.throws_ok(
  $$select * from app_private.admin_approval_requests$$,
  '42501',
  null,
  'authenticated staff cannot directly read approvals'
);
select extensions.throws_ok(
  $$select * from app_private.admin_audit_events$$,
  '42501',
  null,
  'authenticated staff cannot directly read audit evidence'
);
select extensions.throws_ok(
  $$insert into app_private.admin_roles (name, description)
    values ('forged', 'Forged client-controlled administrator role.')$$,
  '42501',
  null,
  'authenticated users cannot directly write role templates'
);
select extensions.throws_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    '75000000-0000-4000-8000-000000000002'
  )$$,
  '42501',
  null,
  'authenticated browser users cannot execute bootstrap'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"75000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"77000000-0000-4000-8000-000000000099","app_metadata":{"role":"platform_admin"},"user_metadata":{"is_admin":true}}',
  true
);
select extensions.throws_ok(
  $$select api.get_my_staff_context()$$,
  'PT403',
  'staff_access_denied',
  'ordinary authenticated user remains denied despite forged metadata'
);
select extensions.throws_ok(
  $$select * from app_private.admin_audit_events$$,
  '42501',
  null,
  'ordinary users cannot read private audit records'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select api.get_my_staff_context()$$,
  '42501',
  null,
  'anonymous users cannot execute the staff context RPC'
);
select extensions.throws_ok(
  $$select * from app_private.staff_principals$$,
  '42501',
  null,
  'anonymous users cannot read staff records'
);

reset role;
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'api.admin_assign_role(uuid,text,timestamptz,text,text,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated role receives only the protected assignment RPC'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'api.admin_bootstrap_first_platform_admin(uuid,text,boolean)',
    'EXECUTE'
  ),
  'authenticated role has no bootstrap privilege'
);
select extensions.ok(
  not has_schema_privilege('authenticated', 'app_private', 'USAGE'),
  'app_private remains outside authenticated schema resolution'
);
select extensions.ok(
  not has_table_privilege(
    'authenticated', 'app_private.staff_principals', 'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated role has no direct principal-table privileges'
);
select extensions.ok(
  not has_table_privilege(
    'service_role', 'app_private.admin_audit_events', 'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service role has no direct audit-table privileges'
);

select * from extensions.finish();
rollback;
