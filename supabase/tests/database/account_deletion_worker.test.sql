begin;

select extensions.no_plan();

select extensions.ok(
  app_private.account_deletion_cascade_contract_ready(),
  'the complete profile/Fantasy deletion graph has the expected CASCADE or SET NULL actions'
);
select extensions.ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'app'
      and table_name = 'account_deletion_requests'
      and column_name = 'execute_after'
      and is_nullable = 'NO'
  ),
  'deletion requests carry an explicit non-null due time'
);
select extensions.ok(
  has_function_privilege('service_role', 'api.account_deletion_worker_claim(uuid,integer)', 'EXECUTE'),
  'only the trusted service role receives the claim contract'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'api.account_deletion_worker_claim(uuid,integer)', 'EXECUTE'),
  'authenticated browser users cannot claim deletion work'
);
select extensions.ok(
  not has_table_privilege(
    'service_role', 'app_private.account_deletion_jobs', 'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service role cannot bypass the controlled job RPCs'
);

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'ad000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'delete-one@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"delete_one"}', statement_timestamp(), statement_timestamp()
  ),
  (
    'ad000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'delete-two@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"delete_two"}', statement_timestamp(), statement_timestamp()
  ),
  (
    'ad000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'delete-staff@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"delete_staff"}', statement_timestamp(), statement_timestamp()
  );

insert into app.account_deletion_requests (
  id, user_id, status, requested_at, execute_after
) values
  (
    'ad100000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000001',
    'requested', statement_timestamp() - interval '10 days', statement_timestamp() - interval '3 days'
  ),
  (
    'ad100000-0000-4000-8000-000000000002',
    'ad000000-0000-4000-8000-000000000002',
    'requested', statement_timestamp() - interval '9 days', statement_timestamp() - interval '2 days'
  ),
  (
    'ad100000-0000-4000-8000-000000000003',
    'ad000000-0000-4000-8000-000000000003',
    'requested', statement_timestamp() - interval '8 days', statement_timestamp() - interval '1 day'
  );

insert into app_private.staff_principals (auth_user_id)
values ('ad000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select extensions.throws_ok(
  $$select api.account_deletion_worker_preview(25)$$,
  '42501',
  null,
  'a signed-in user cannot inspect the privileged deletion queue'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.account_deletion_worker_preview(25) ->> 'due',
  '3',
  'dry-run sees only due requests'
);
select extensions.is(
  api.account_deletion_worker_preview(25) ->> 'ready',
  '2',
  'dry-run separates ordinary due accounts'
);
select extensions.is(
  api.account_deletion_worker_preview(25) ->> 'blocked',
  '1',
  'dry-run identifies staff accounts without claiming them'
);
select extensions.is(
  api.account_deletion_worker_preview(25) ->> 'reconcile',
  '0',
  'dry-run reports the bounded stale-job reconciliation count'
);

reset role;
select extensions.is(
  (select count(*)::integer from app_private.account_deletion_jobs),
  0,
  'dry-run performs no ledger or request mutation'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config(
  'test.deletion_claim_one',
  api.account_deletion_worker_claim('ad200000-0000-4000-8000-000000000001', 120)::text,
  true
);
select extensions.is(
  current_setting('test.deletion_claim_one')::jsonb ->> 'action',
  'delete',
  'the oldest due ordinary request is atomically claimed'
);
select extensions.throws_ok(
  format(
    'select api.account_deletion_worker_finalize(%L::uuid, %L::uuid)',
    current_setting('test.deletion_claim_one')::jsonb ->> 'requestId',
    current_setting('test.deletion_claim_one')::jsonb ->> 'claimToken'
  ),
  '55000',
  'AUTH_USER_STILL_EXISTS',
  'finalize fails closed while Auth still contains the user'
);
select extensions.is(
  api.account_deletion_worker_fail(
    (current_setting('test.deletion_claim_one')::jsonb ->> 'requestId')::uuid,
    (current_setting('test.deletion_claim_one')::jsonb ->> 'claimToken')::uuid,
    'auth_delete_failed'
  ) ->> 'completed',
  'false',
  'a provider failure returns the request to the retryable state'
);

reset role;
select extensions.is(
  (select status::text from app.account_deletion_requests
   where id = 'ad100000-0000-4000-8000-000000000001'),
  'requested',
  'failed Auth deletion never strands the user request in processing'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config(
  'test.deletion_claim_retry',
  api.account_deletion_worker_claim('ad200000-0000-4000-8000-000000000002', 120)::text,
  true
);

reset role;
delete from auth.users where id = 'ad000000-0000-4000-8000-000000000001';
select extensions.is(
  (select count(*)::integer from app.profiles
   where id = 'ad000000-0000-4000-8000-000000000001'),
  0,
  'hard Auth deletion cascades the application profile'
);
select extensions.is(
  (select count(*)::integer from app.account_deletion_requests
   where id = 'ad100000-0000-4000-8000-000000000001'),
  0,
  'hard Auth deletion cascades the transient user request'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(
  api.account_deletion_worker_finalize(
    (current_setting('test.deletion_claim_retry')::jsonb ->> 'requestId')::uuid,
    (current_setting('test.deletion_claim_retry')::jsonb ->> 'claimToken')::uuid
  ),
  'finalize succeeds only after Auth absence and cascade verification'
);
select extensions.ok(
  api.account_deletion_worker_finalize(
    (current_setting('test.deletion_claim_retry')::jsonb ->> 'requestId')::uuid,
    (current_setting('test.deletion_claim_retry')::jsonb ->> 'claimToken')::uuid
  ),
  'repeating finalize with the same claim is idempotent'
);

reset role;
select extensions.is(
  (select status from app_private.account_deletion_jobs
   where request_id = 'ad100000-0000-4000-8000-000000000001'),
  'completed',
  'the private ledger survives the profile/request cascade'
);
select extensions.ok(
  exists (
    select 1 from app_private.account_deletion_job_events
    where request_id = 'ad100000-0000-4000-8000-000000000001'
      and event_type = 'completed'
  ),
  'successful deletion appends sanitized durable audit evidence'
);
select extensions.ok(
  exists (
    select 1 from app_private.security_audit_log
    where user_id = 'ad000000-0000-4000-8000-000000000001'
      and event_type = 'account_deletion_requested'
  ),
  'the existing 365-day security audit also survives account deletion'
);

-- Exercise the lost-Auth-response reconciliation path.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config(
  'test.deletion_claim_two',
  api.account_deletion_worker_claim('ad200000-0000-4000-8000-000000000003', 120)::text,
  true
);
reset role;
delete from auth.users where id = 'ad000000-0000-4000-8000-000000000002';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.account_deletion_worker_fail(
    (current_setting('test.deletion_claim_two')::jsonb ->> 'requestId')::uuid,
    (current_setting('test.deletion_claim_two')::jsonb ->> 'claimToken')::uuid,
    'auth_delete_failed'
  ) ->> 'completed',
  'true',
  'a lost provider response reconciles only after database-verified Auth absence'
);

-- Staff/admin identities are never auto-deleted.
select set_config(
  'test.deletion_staff_claim',
  api.account_deletion_worker_claim('ad200000-0000-4000-8000-000000000004', 120)::text,
  true
);
select extensions.is(
  current_setting('test.deletion_staff_claim')::jsonb ->> 'action',
  'blocked',
  'a due staff account is rejected for manual offboarding'
);
select extensions.throws_ok(
  $$select api.account_deletion_worker_requeue_after_staff_review(
    'ad100000-0000-4000-8000-000000000003'
  )$$,
  '55000',
  'STAFF_OFFBOARDING_INCOMPLETE',
  'staff request cannot be requeued while a principal still exists'
);

reset role;
delete from app_private.staff_principals
where auth_user_id = 'ad000000-0000-4000-8000-000000000003';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(
  api.account_deletion_worker_requeue_after_staff_review(
    'ad100000-0000-4000-8000-000000000003'
  ),
  'reviewed staff offboarding can explicitly return the request to the queue'
);

reset role;
select extensions.is(
  (select status::text from app.account_deletion_requests
   where id = 'ad100000-0000-4000-8000-000000000003'),
  'requested',
  'staff requeue is explicit and auditable'
);

select * from extensions.finish();
rollback;
