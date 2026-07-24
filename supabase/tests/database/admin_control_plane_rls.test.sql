begin;

select extensions.no_plan();

select extensions.ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'app_private.admin_worker_runs'::regclass
  ),
  'the worker run ledger enables and forces RLS'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'app_private'
      and tablename = 'admin_worker_runs'
  ),
  0,
  'the worker run ledger has no permissive direct policies'
);
select extensions.is(
  has_table_privilege(
    'authenticated',
    'app_private.admin_worker_runs',
    'SELECT'
  ),
  false,
  'browser users cannot inspect the private worker ledger directly'
);
select extensions.is(
  has_table_privilege(
    'service_role',
    'app_private.staff_session_revocation_requests',
    'UPDATE'
  ),
  false,
  'the service role cannot update outbox rows directly'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'api.admin_claim_session_revocations_v2(uuid,text,integer,integer)',
    'EXECUTE'
  ),
  false,
  'browser users cannot claim session-revocation work'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'api.admin_claim_session_revocations_v2(uuid,text,integer,integer)',
    'EXECUTE'
  ),
  true,
  'only the trusted service role can claim leased work'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'api.admin_claim_session_revocations(integer)',
    'EXECUTE'
  ),
  false,
  'the obsolete non-leased claim contract is disabled'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'api.admin_list_staff_assignments(text,text,text,timestamptz,uuid,integer)',
    'EXECUTE'
  ),
  true,
  'authenticated staff reach assignment reviews only through the controlled RPC'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'api.admin_list_staff_assignments(text,text,text,timestamptz,uuid,integer)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot execute Admin read contracts'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'api.admin_list_audit_events_v2(timestamptz,timestamptz,uuid,text,text,text,text,uuid,uuid,boolean,timestamptz,bigint,integer)',
    'EXECUTE'
  ),
  true,
  'audit inspection is exposed only as a permission-checking RPC'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'api.admin_replay_session_revocation_dead_letter(uuid,text)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot replay dead-letter work'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"92000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.throws_ok(
  $$select api.admin_list_staff_assignments(
    null, null, null, null, null, 10
  )$$,
  'PT403',
  'staff_access_denied',
  'ordinary authenticated users are denied by server-side permission checks'
);
select extensions.throws_ok(
  $$select api.admin_list_audit_events_v2(
    null, null, null, null, null, null, null, null, null, null,
    null, null, 10
  )$$,
  'PT403',
  'staff_access_denied',
  'ordinary authenticated users cannot inspect audit evidence'
);

select extensions.finish();
rollback;
