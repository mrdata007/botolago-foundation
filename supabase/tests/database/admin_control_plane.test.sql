begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '81000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'control-admin@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'control-security@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    '81000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'control-target@example.test', 'hash',
    statement_timestamp(), '{}', '{}', statement_timestamp(), statement_timestamp()
  ),
  (
    '81000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'control-ordinary@example.test', 'hash',
    statement_timestamp(), '{"role":"platform_admin"}', '{"is_admin":true}',
    statement_timestamp(), statement_timestamp()
  );

insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status, created_at, updated_at
)
values
  (
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'Control TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    'Control TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    '82000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000003',
    'Control TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  );

insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  (
    '83000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    statement_timestamp(), statement_timestamp(), 'aal2'
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    statement_timestamp(), statement_timestamp(), 'aal2'
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000003',
    statement_timestamp() - interval '20 minutes',
    statement_timestamp(), 'aal2'
  ),
  (
    '83000000-0000-4000-8000-000000000004',
    '81000000-0000-4000-8000-000000000004',
    statement_timestamp(), statement_timestamp(), 'aal2'
  );

select extensions.lives_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    '81000000-0000-4000-8000-000000000001',
    'Bootstrap deterministic Phase 7B control-plane administrator.',
    true
  )$$,
  'Phase 7B can reuse the reviewed Phase 7A bootstrap'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2","session_id":"83000000-0000-4000-8000-000000000004","app_metadata":{"role":"platform_admin"},"user_metadata":{"is_admin":true}}',
  true
);
select extensions.throws_ok(
  $$select api.get_my_staff_context()$$,
  'PT403',
  'staff_access_denied',
  'ordinary metadata cannot create a current staff context'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"83000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.is(
  api.get_my_staff_context() ->> 'cachePolicy',
  'private, no-store',
  'current context is explicitly non-cacheable'
);
select extensions.is(
  (api.get_my_staff_context() ->> 'recentAuthSufficient')::boolean,
  true,
  'a recent server-side session satisfies the recent-auth window'
);
select extensions.ok(
  api.get_my_staff_context() -> 'permissions' ? 'security.manage_staff',
  'current context aggregates only canonical role permissions'
);
select extensions.is(
  jsonb_array_length(api.admin_list_role_catalog()),
  10,
  'the safe role catalog exposes all server-controlled active roles'
);
select extensions.lives_ok(
  $$select api.admin_assign_role(
    '81000000-0000-4000-8000-000000000002',
    'security_admin',
    null,
    'Grant security review access for deterministic Phase 7B tests.',
    'phase7b:security-reviewer',
    '84000000-0000-4000-8000-000000000001'
  )$$,
  'a reviewed security assignment can be created'
);
select extensions.is(
  jsonb_array_length(
    api.admin_list_staff_assignments(
      'security_admin', 'active', 'active', null, null, 10
    ) -> 'items'
  ),
  1,
  'assignment review supports role and status filters'
);

select extensions.lives_ok(
  $$select api.admin_request_approval(
    'security.manage_staff',
    'security',
    '81000000-0000-4000-8000-000000000003',
    'staff.assign_platform_admin',
    jsonb_build_object(
      'targetAuthUserId', '81000000-0000-4000-8000-000000000003',
      'role', 'platform_admin',
      'expiresAt', null
    ),
    'Request deterministic dual-control review for a platform assignment.',
    statement_timestamp() + interval '10 minutes',
    '84000000-0000-4000-8000-000000000002'
  )$$,
  'the Phase 7A approval operation feeds the Phase 7B queue'
);
select extensions.is(
  jsonb_array_length(
    api.admin_list_approval_queue(
      'requested_by_me', 'pending', null, 'security', null, null, 10
    ) -> 'items'
  ),
  1,
  'requesters can inspect their own bounded approval queue'
);
select extensions.ok(
  (api.admin_list_audit_events_v2(
    statement_timestamp() - interval '1 hour',
    statement_timestamp() + interval '1 minute',
    null, null, 'security', null, null, null, null, true,
    null, null, 100
  ) -> 'items') @> '[{"syntheticTest":true}]'::jsonb,
  'audit inspection preserves the synthetic marker'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"83000000-0000-4000-8000-000000000002"}',
  true
);
select extensions.is(
  jsonb_array_length(
    api.admin_list_approval_queue(
      'actionable', 'pending', null, 'security', null, null, 10
    ) -> 'items'
  ),
  1,
  'a second authorized operator sees the actionable approval'
);

reset role;
insert into app_private.staff_session_revocation_requests (
  staff_principal_id,
  requested_by_principal_id,
  reason
)
select
  target.id,
  actor.id,
  'Invalidate deterministic privileged sessions after a staff change.'
from app_private.staff_principals target
cross join app_private.staff_principals actor
where target.auth_user_id = '81000000-0000-4000-8000-000000000002'
  and actor.auth_user_id = '81000000-0000-4000-8000-000000000001';

set local role service_role;
create temporary table phase7b_worker_one as
select api.admin_start_session_revocation_worker(
  'phase7b.worker-one', true
) as payload;
create temporary table phase7b_worker_two as
select api.admin_start_session_revocation_worker(
  'phase7b.worker-two', true
) as payload;
create temporary table phase7b_claims as
select value as item
from phase7b_worker_one,
lateral jsonb_array_elements(
  api.admin_claim_session_revocations_v2(
    (payload ->> 'runId')::uuid,
    'phase7b.worker-one',
    50,
    60
  )
);
select extensions.ok(
  (select count(*) from phase7b_claims) >= 1,
  'the trusted worker claims a bounded outbox batch'
);
select extensions.is(
  jsonb_array_length(
    api.admin_claim_session_revocations_v2(
      (select (payload ->> 'runId')::uuid from phase7b_worker_two),
      'phase7b.worker-two',
      50,
      60
    )
  ),
  0,
  'concurrent workers cannot claim the same leased records'
);

reset role;
update app_private.staff_session_revocation_requests
set lease_expires_at = statement_timestamp() - interval '1 second'
where id = (
  select (item ->> 'requestId')::uuid
  from phase7b_claims
  order by (item ->> 'requestId')::uuid
  limit 1
);

set local role service_role;
create temporary table phase7b_recovered as
select value as item
from phase7b_worker_two,
lateral jsonb_array_elements(
  api.admin_claim_session_revocations_v2(
    (payload ->> 'runId')::uuid,
    'phase7b.worker-two',
    1,
    60
  )
);
select extensions.is(
  (select (item ->> 'recoveredStaleLease')::boolean from phase7b_recovered limit 1),
  true,
  'an abandoned lease can be recovered safely'
);
select extensions.lives_ok(
  $$
    select api.admin_complete_session_revocation_v2(
      (item ->> 'requestId')::uuid,
      (item ->> 'leaseToken')::uuid,
      'privileged_access_revoked'
    )
    from phase7b_recovered
  $$,
  'the current lease holder can complete revocation processing'
);
select extensions.lives_ok(
  $$
    select api.admin_complete_session_revocation_v2(
      (item ->> 'requestId')::uuid,
      (item ->> 'leaseToken')::uuid,
      'privileged_access_revoked'
    )
    from phase7b_recovered
  $$,
  'repeated completion is idempotent'
);

reset role;
select extensions.is(
  (
    select count(*)::integer
    from app_private.admin_audit_events audit
    join phase7b_recovered recovered
      on audit.request_id = (recovered.item ->> 'requestId')::uuid
    where audit.action = 'security.complete_session_revocation'
  ),
  1,
  'idempotent completion writes exactly one correlation-linked audit event'
);

select extensions.finish();
rollback;
