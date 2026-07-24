begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'platform-one@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"platform_one"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'security-two@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"security_two"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'platform-target@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"platform_target"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'old-session@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"old_session"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'missing-mfa@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"missing_mfa","is_admin":true}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000006',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'aal-one@example.test', 'hash',
    statement_timestamp(), '{"role":"platform_admin"}', '{"username":"aal_one"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000007',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'expired-role@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"expired_role"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000008',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'ordinary@example.test', 'hash',
    statement_timestamp(), '{"role":"platform_admin"}',
    '{"username":"ordinary_user","is_admin":true}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '71000000-0000-4000-8000-000000000009',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'unverified@example.test', 'hash',
    null, '{}', '{"username":"unverified_user"}',
    statement_timestamp(), statement_timestamp()
  );

insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status, created_at, updated_at
)
values
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000003',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000004',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    '72000000-0000-4000-8000-000000000006',
    '71000000-0000-4000-8000-000000000006',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    '72000000-0000-4000-8000-000000000007',
    '71000000-0000-4000-8000-000000000007',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  );

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    statement_timestamp(), statement_timestamp(), 'aal2'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    statement_timestamp(), statement_timestamp(), 'aal2'
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000003',
    statement_timestamp(), statement_timestamp(), 'aal2'
  ),
  (
    '73000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000004',
    statement_timestamp() - interval '20 minutes',
    statement_timestamp() - interval '20 minutes',
    'aal2'
  ),
  (
    '73000000-0000-4000-8000-000000000005',
    '71000000-0000-4000-8000-000000000005',
    statement_timestamp(), statement_timestamp(), 'aal1'
  ),
  (
    '73000000-0000-4000-8000-000000000006',
    '71000000-0000-4000-8000-000000000006',
    statement_timestamp(), statement_timestamp(), 'aal1'
  ),
  (
    '73000000-0000-4000-8000-000000000007',
    '71000000-0000-4000-8000-000000000007',
    statement_timestamp(), statement_timestamp(), 'aal2'
  ),
  (
    '73000000-0000-4000-8000-000000000008',
    '71000000-0000-4000-8000-000000000008',
    statement_timestamp(), statement_timestamp(), 'aal2'
  );

select extensions.throws_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    '71000000-0000-4000-8000-000000000099'
  )$$,
  'PT404',
  'staff_principal_not_found',
  'bootstrap rejects a missing Auth user'
);
select extensions.throws_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    '71000000-0000-4000-8000-000000000009'
  )$$,
  'PT403',
  'staff_access_denied',
  'bootstrap rejects an unverified Auth user'
);
select extensions.lives_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    '71000000-0000-4000-8000-000000000001',
    'Initial deterministic platform administrator bootstrap',
    true
  )$$,
  'a verified MFA-capable user can be bootstrapped'
);
select extensions.lives_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    '71000000-0000-4000-8000-000000000001',
    'Initial deterministic platform administrator bootstrap',
    true
  )$$,
  'repeated bootstrap for the same user is idempotent'
);
select extensions.is(
  (
    select count(*)::integer
    from app_private.staff_role_assignments assignment
    join app_private.admin_roles role on role.id = assignment.role_id
    where role.name = 'platform_admin' and assignment.status = 'active'
  ),
  1,
  'idempotent bootstrap creates one platform-admin assignment'
);
select extensions.is(
  (
    select encrypted_password
    from auth.users
    where id = '71000000-0000-4000-8000-000000000001'
  ),
  'hash',
  'bootstrap never creates or changes a default password'
);
select extensions.is(
  (
    select count(*)::integer
    from app_private.admin_audit_events
    where action = 'security.bootstrap_platform_admin'
  ),
  1,
  'bootstrap creates one append-only audit event'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000008","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000008","user_metadata":{"is_admin":true},"app_metadata":{"role":"platform_admin"}}',
  true
);
select extensions.throws_ok(
  $$select api.get_my_staff_context()$$,
  'PT403',
  'staff_access_denied',
  'Auth metadata and profile fields cannot create staff authorization'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.is(
  (api.get_my_staff_context() ->> 'accessAllowed')::boolean,
  true,
  'active confirmed AAL2 staff receive a safe context'
);
select extensions.ok(
  api.get_my_staff_context() -> 'permissions' ? 'security.manage_staff',
  'platform admin receives the explicit staff-management permission'
);
select extensions.lives_ok(
  $$select api.admin_assign_role(
    '71000000-0000-4000-8000-000000000002',
    'security_admin',
    null,
    'Grant security administration for dual-control testing.',
    'phase7a:test-security-two',
    '74000000-0000-4000-8000-000000000001'
  )$$,
  'staff role assignment succeeds transactionally'
);
select extensions.lives_ok(
  $$select api.admin_assign_role(
    '71000000-0000-4000-8000-000000000002',
    'security_admin',
    null,
    'Grant security administration for dual-control testing.',
    'phase7a:test-security-two',
    '74000000-0000-4000-8000-000000000001'
  )$$,
  'repeating the same assignment request is idempotent'
);
select extensions.throws_ok(
  $$select api.admin_assign_role(
    '71000000-0000-4000-8000-000000000002',
    'security_admin',
    null,
    'A different request must not duplicate the active assignment.',
    'phase7a:test-security-two',
    '74000000-0000-4000-8000-000000000002'
  )$$,
  'PT409',
  'staff_role_conflict',
  'a second active copy of the same role is rejected'
);
select extensions.throws_ok(
  $$select api.admin_assign_role(
    '71000000-0000-4000-8000-000000000001',
    'security_admin',
    null,
    'Self assignment must never expand the actor permission scope.',
    'phase7a:self-escalation',
    '74000000-0000-4000-8000-000000000003'
  )$$,
  'PT403',
  'self_escalation_forbidden',
  'self-assignment is denied'
);
reset role;
select extensions.is(
  (
    select count(*)::integer
    from app_private.staff_session_revocation_requests
    where staff_principal_id = (
      select id from app_private.staff_principals
      where auth_user_id = '71000000-0000-4000-8000-000000000002'
    )
  ),
  1,
  'role assignment queues one privileged session-revocation request'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_request_approval(
    'security.manage_staff',
    'security',
    '71000000-0000-4000-8000-000000000003',
    'staff.assign_platform_admin',
    jsonb_build_object(
      'targetAuthUserId', '71000000-0000-4000-8000-000000000003',
      'role', 'platform_admin',
      'expiresAt', null
    ),
    'Grant a second platform administrator through dual control.',
    statement_timestamp() + interval '10 minutes',
    '74000000-0000-4000-8000-000000000004'
  )$$,
  'platform-admin approval request succeeds'
);

reset role;
select set_config(
  'test.phase7a_approval_id',
  (
    select id::text
    from app_private.admin_approval_requests
    where operation_type = 'staff.assign_platform_admin'
    order by requested_at desc, id desc
    limit 1
  ),
  true
);
select set_config(
  'test.phase7a_approval_fingerprint',
  (
    select payload_fingerprint
    from app_private.admin_approval_requests
    where id = current_setting('test.phase7a_approval_id')::uuid
  ),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_approve_request(
    current_setting('test.phase7a_approval_id')::uuid,
    current_setting('test.phase7a_approval_fingerprint'),
    'The requester cannot approve their own privileged request.',
    '74000000-0000-4000-8000-000000000005'
  )$$,
  'PT403',
  'self_approval_forbidden',
  'the requester cannot approve their own request'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000002"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_approve_request(
    current_setting('test.phase7a_approval_id')::uuid,
    repeat('0', 64),
    'Reject any approval whose immutable payload fingerprint changed.',
    '74000000-0000-4000-8000-000000000006'
  )$$,
  'PT409',
  'approval_payload_mismatch',
  'approval payload mutation is rejected'
);
select extensions.lives_ok(
  $$select api.admin_approve_request(
    current_setting('test.phase7a_approval_id')::uuid,
    current_setting('test.phase7a_approval_fingerprint'),
    'The independent security administrator approves this exact payload.',
    '74000000-0000-4000-8000-000000000007'
  )$$,
  'a different authorized staff principal can approve'
);
select extensions.lives_ok(
  $$select api.admin_execute_approved_platform_admin(
    current_setting('test.phase7a_approval_id')::uuid,
    current_setting('test.phase7a_approval_fingerprint'),
    'Execute the exact approved platform administrator assignment once.',
    '74000000-0000-4000-8000-000000000008'
  )$$,
  'approved platform-admin operation executes once'
);
select extensions.lives_ok(
  $$select api.admin_execute_approved_platform_admin(
    current_setting('test.phase7a_approval_id')::uuid,
    current_setting('test.phase7a_approval_fingerprint'),
    'Execute the exact approved platform administrator assignment once.',
    '74000000-0000-4000-8000-000000000008'
  )$$,
  'same-key execution retry returns its stored result'
);
select extensions.throws_ok(
  $$select api.admin_execute_approved_platform_admin(
    current_setting('test.phase7a_approval_id')::uuid,
    current_setting('test.phase7a_approval_fingerprint'),
    'A second execution with a different key must never duplicate the grant.',
    '74000000-0000-4000-8000-000000000009'
  )$$,
  'PT409',
  'operation_already_executed',
  'duplicate approval execution is impossible'
);

reset role;
select extensions.is(
  (
    select count(*)::integer
    from app_private.staff_role_assignments assignment
    join app_private.admin_roles role on role.id = assignment.role_id
    join app_private.staff_principals principal
      on principal.id = assignment.staff_principal_id
    where principal.auth_user_id = '71000000-0000-4000-8000-000000000003'
      and role.name = 'platform_admin'
      and assignment.status = 'active'
  ),
  1,
  'approved execution creates exactly one target assignment'
);
select extensions.ok(
  (
    select count(*) >= 4
    from app_private.admin_audit_events
    where action in (
      'approval.request', 'approval.approve', 'approval.execute', 'security.assign_role'
    )
  ),
  'approval and execution produce append-only audit evidence'
);
select set_config(
  'test.platform_target_principal_id',
  (
    select id::text from app_private.staff_principals
    where auth_user_id = '71000000-0000-4000-8000-000000000003'
  ),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_request_approval(
    'security.manage_staff',
    'security',
    '71000000-0000-4000-8000-000000000004',
    'staff.assign_platform_admin',
    jsonb_build_object(
      'targetAuthUserId', '71000000-0000-4000-8000-000000000004',
      'role', 'platform_admin',
      'expiresAt', null
    ),
    'Request a deterministic approval that an independent operator rejects.',
    statement_timestamp() + interval '10 minutes',
    '74000000-0000-4000-8000-000000000013'
  )$$,
  'a second typed approval request can be created'
);
reset role;
select set_config(
  'test.phase7a_reject_approval_id',
  (
    select id::text from app_private.admin_approval_requests
    where target_entity_id = '71000000-0000-4000-8000-000000000004'
    order by requested_at desc, id desc limit 1
  ),
  true
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000002"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_reject_request(
    current_setting('test.phase7a_reject_approval_id')::uuid,
    'The independent operator rejects this deterministic privilege request.',
    '74000000-0000-4000-8000-000000000014'
  )$$,
  'an independent authorized staff member can reject an approval'
);
reset role;
select extensions.is(
  (
    select status::text from app_private.admin_approval_requests
    where id = current_setting('test.phase7a_reject_approval_id')::uuid
  ),
  'rejected',
  'rejection is persisted without changing the requested payload'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_request_approval(
    'security.manage_staff',
    'security',
    '71000000-0000-4000-8000-000000000005',
    'staff.assign_platform_admin',
    jsonb_build_object(
      'targetAuthUserId', '71000000-0000-4000-8000-000000000005',
      'role', 'platform_admin',
      'expiresAt', null
    ),
    'Request a deterministic approval that the original requester cancels.',
    statement_timestamp() + interval '10 minutes',
    '74000000-0000-4000-8000-000000000015'
  )$$,
  'a cancellable typed approval request can be created'
);
reset role;
select set_config(
  'test.phase7a_cancel_approval_id',
  (
    select id::text from app_private.admin_approval_requests
    where target_entity_id = '71000000-0000-4000-8000-000000000005'
    order by requested_at desc, id desc limit 1
  ),
  true
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_cancel_request(
    current_setting('test.phase7a_cancel_approval_id')::uuid,
    'The original requester cancels this request before approval.',
    '74000000-0000-4000-8000-000000000016'
  )$$,
  'the requester can cancel a pending approval safely'
);
reset role;
select extensions.is(
  (
    select status::text from app_private.admin_approval_requests
    where id = current_setting('test.phase7a_cancel_approval_id')::uuid
  ),
  'cancelled',
  'cancelled approval cannot proceed to execution'
);

insert into app_private.admin_approval_requests (
  requester_principal_id,
  required_permission_id,
  target_domain,
  target_entity_id,
  operation_type,
  payload_fingerprint,
  safe_payload_reference,
  reason,
  requested_at,
  expires_at
)
select
  principal.id,
  permission.id,
  'security',
  '71000000-0000-4000-8000-000000000007',
  'staff.assign_platform_admin',
  app_private.admin_payload_fingerprint(
    jsonb_build_object(
      'targetAuthUserId', '71000000-0000-4000-8000-000000000007',
      'role', 'platform_admin',
      'expiresAt', null
    )
  ),
  jsonb_build_object(
    'targetAuthUserId', '71000000-0000-4000-8000-000000000007',
    'role', 'platform_admin',
    'expiresAt', null
  ),
  'Deterministic approval inserted expired for the bounded worker test.',
  statement_timestamp() - interval '2 hours',
  statement_timestamp() - interval '1 hour'
from app_private.staff_principals principal
cross join app_private.admin_permissions permission
where principal.auth_user_id = '71000000-0000-4000-8000-000000000001'
  and permission.name = 'security.manage_staff';
set local role service_role;
select extensions.is(
  api.admin_expire_approvals(10),
  1,
  'the trusted bounded worker expires one pending stale approval'
);
reset role;
select extensions.is(
  (
    select count(*)::integer from app_private.admin_approval_requests
    where target_entity_id = '71000000-0000-4000-8000-000000000007'
      and status = 'expired'
  ),
  1,
  'expired approval state is persisted and cannot authorize execution'
);

select set_config(
  'test.security_two_assignment_id',
  (
    select assignment.id::text
    from app_private.staff_role_assignments assignment
    join app_private.staff_principals principal
      on principal.id = assignment.staff_principal_id
    join app_private.admin_roles role on role.id = assignment.role_id
    where principal.auth_user_id = '71000000-0000-4000-8000-000000000002'
      and role.name = 'security_admin'
      and assignment.status = 'active'
  ),
  true
);
select set_config(
  'test.security_two_principal_id',
  (
    select id::text from app_private.staff_principals
    where auth_user_id = '71000000-0000-4000-8000-000000000002'
  ),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_revoke_role(
    current_setting('test.security_two_assignment_id')::uuid,
    'Revoke the deterministic security assignment while retaining history.',
    '74000000-0000-4000-8000-000000000017'
  )$$,
  'role revocation succeeds transactionally'
);

reset role;
select extensions.is(
  (
    select status::text from app_private.staff_role_assignments
    where id = current_setting('test.security_two_assignment_id')::uuid
  ),
  'revoked',
  'revoked assignment remains in the historical ledger'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000002"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_list_active_assignments(
    current_setting('test.platform_one_principal_id', true)::uuid
  )$$,
  'PT403',
  'permission_missing',
  'revoked assignment stops authorizing immediately'
);

reset role;
select set_config(
  'test.platform_one_principal_id',
  (
    select id::text from app_private.staff_principals
    where auth_user_id = '71000000-0000-4000-8000-000000000001'
  ),
  true
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_renew_role(
    current_setting('test.security_two_assignment_id')::uuid,
    statement_timestamp() + interval '1 day',
    'Renew the deterministic security assignment as a new historical row.',
    'phase7a:renew-security-two',
    '74000000-0000-4000-8000-000000000018'
  )$$,
  'role renewal creates a new assignment'
);

reset role;
select extensions.is(
  (
    select count(*)::integer
    from app_private.staff_role_assignments assignment
    where assignment.staff_principal_id =
      current_setting('test.security_two_principal_id')::uuid
  ),
  2,
  'renewal retains the revoked row and creates one new row'
);
select extensions.is(
  (
    select count(*)::integer
    from app_private.staff_role_assignments assignment
    where assignment.renewed_from_assignment_id =
      current_setting('test.security_two_assignment_id')::uuid
      and assignment.status = 'active'
  ),
  1,
  'renewed assignment links to its historical predecessor'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000002"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_list_active_assignments(
    current_setting('test.platform_one_principal_id')::uuid
  )$$,
  'renewed assignment restores only its documented permission set'
);

reset role;
insert into app_private.staff_principals (auth_user_id)
values
  ('71000000-0000-4000-8000-000000000004'),
  ('71000000-0000-4000-8000-000000000005'),
  ('71000000-0000-4000-8000-000000000006'),
  ('71000000-0000-4000-8000-000000000007');
insert into app_private.staff_role_assignments (
  staff_principal_id, role_id, grant_reason, starts_at, expires_at
)
select principal.id, role.id, 'Deterministic security boundary test assignment.',
  case
    when principal.auth_user_id = '71000000-0000-4000-8000-000000000007'
      then statement_timestamp() - interval '2 minutes'
    else statement_timestamp()
  end,
  case
    when principal.auth_user_id = '71000000-0000-4000-8000-000000000007'
      then statement_timestamp() - interval '1 minute'
    else null
  end
from app_private.staff_principals principal
cross join app_private.admin_roles role
where principal.auth_user_id in (
  '71000000-0000-4000-8000-000000000004',
  '71000000-0000-4000-8000-000000000005',
  '71000000-0000-4000-8000-000000000006',
  '71000000-0000-4000-8000-000000000007'
)
and role.name = 'security_admin';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000004"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_list_active_assignments(
    (select id from app_private.staff_principals
      where auth_user_id = '71000000-0000-4000-8000-000000000001')
  )$$,
  '42501',
  null,
  'private argument subqueries remain inaccessible to browser roles'
);
select extensions.throws_ok(
  $$select api.admin_assign_role(
    '71000000-0000-4000-8000-000000000003',
    'editor',
    null,
    'Old sessions must reauthenticate before changing staff access.',
    'phase7a:old-session',
    '74000000-0000-4000-8000-000000000010'
  )$$,
  'PT403',
  'recent_auth_required',
  'expired recent-auth state is denied'
);

reset role;
select set_config(
  'test.old_session_permissions',
  app_private.admin_effective_permissions(
    (
      select id from app_private.staff_principals
      where auth_user_id = '71000000-0000-4000-8000-000000000004'
    )
  )::text,
  true
);
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values (
  '73000000-0000-4000-8000-000000000041',
  '71000000-0000-4000-8000-000000000004',
  statement_timestamp(), statement_timestamp(), 'aal2'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000041"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_assign_role(
    '71000000-0000-4000-8000-000000000004',
    'editor',
    null,
    'Fresh authentication passes before the separate self-escalation guard.',
    'phase7a:fresh-session',
    '74000000-0000-4000-8000-000000000019'
  )$$,
  'PT403',
  'self_escalation_forbidden',
  'fresh Supabase authentication satisfies the recent-auth contract'
);
reset role;
select extensions.is(
  app_private.admin_effective_permissions(
    (
      select id from app_private.staff_principals
      where auth_user_id = '71000000-0000-4000-8000-000000000004'
    )
  )::text,
  current_setting('test.old_session_permissions'),
  'reauthentication does not add any role or permission'
);

select set_config(
  'test.platform_one_principal_id',
  (
    select id::text from app_private.staff_principals
    where auth_user_id = '71000000-0000-4000-8000-000000000001'
  ),
  true
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1","session_id":"73000000-0000-4000-8000-000000000005"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_list_active_assignments(
    current_setting('test.platform_one_principal_id')::uuid
  )$$,
  'PT403',
  'mfa_required',
  'missing MFA enrollment is denied'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal1","session_id":"73000000-0000-4000-8000-000000000006"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_list_active_assignments(
    current_setting('test.platform_one_principal_id')::uuid
  )$$,
  'PT403',
  'mfa_assurance_insufficient',
  'verified MFA without AAL2 is denied'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000007"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_list_active_assignments(
    current_setting('test.platform_one_principal_id')::uuid
  )$$,
  'PT403',
  'staff_role_expired',
  'expired role assignment is denied'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_suspend_staff(
    current_setting('test.platform_target_principal_id')::uuid,
    'Suspend the synthetic target while validating immediate access denial.',
    '74000000-0000-4000-8000-000000000011'
  )$$,
  'staff suspension succeeds'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000003"}',
  true
);
select extensions.is(
  api.get_my_staff_context() ->> 'status',
  'suspended',
  'safe context explicitly reports suspended state'
);
select extensions.throws_ok(
  $$select api.admin_list_audit_events(null, null, 10)$$,
  'PT403',
  'staff_suspended',
  'suspended staff lose privileged access immediately'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.lives_ok(
  $$select api.admin_restore_staff(
    current_setting('test.platform_target_principal_id')::uuid,
    'Restore the synthetic target after the suspension boundary test.',
    '74000000-0000-4000-8000-000000000012'
  )$$,
  'staff restoration succeeds through the protected operation'
);

select extensions.lives_ok(
  $$select api.admin_emergency_revoke_staff(
    current_setting('test.platform_target_principal_id')::uuid,
    'Emergency revoke the synthetic target and invalidate all privileged sessions.',
    '74000000-0000-4000-8000-000000000020'
  )$$,
  'emergency revocation succeeds through a separate trusted operation'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2","session_id":"73000000-0000-4000-8000-000000000003"}',
  true
);
select extensions.is(
  api.get_my_staff_context() ->> 'status',
  'revoked',
  'safe context explicitly reports revoked state'
);
select extensions.throws_ok(
  $$select api.admin_list_audit_events(null, null, 10)$$,
  'PT403',
  'staff_revoked',
  'revoked staff cannot use privileged operations'
);

reset role;
select set_config(
  'test.phase7a_revocation_request_id',
  (
    select id::text
    from app_private.staff_session_revocation_requests
    where status = 'pending'
    order by requested_at, id
    limit 1
  ),
  true
);
set local role service_role;
select extensions.ok(
  jsonb_array_length(api.admin_claim_session_revocations(100)) > 0,
  'trusted worker claims bounded session-revocation requests'
);
select extensions.lives_ok(
  $$select api.admin_complete_session_revocation(
    current_setting('test.phase7a_revocation_request_id')::uuid,
    true,
    null
  )$$,
  'trusted worker completes a claimed Auth session revocation'
);
reset role;
select extensions.is(
  (
    select status::text
    from app_private.staff_session_revocation_requests
    where id = current_setting('test.phase7a_revocation_request_id')::uuid
  ),
  'completed',
  'session-revocation completion is independently persisted'
);

select extensions.throws_ok(
  $$update app_private.admin_audit_events set reason = 'Tampered audit event'$$,
  '42501',
  'audit_access_denied',
  'privileged audit events cannot be updated'
);
select extensions.throws_ok(
  $$delete from app_private.admin_audit_events$$,
  '42501',
  'audit_access_denied',
  'privileged audit events cannot be deleted'
);

select * from extensions.finish();
rollback;
