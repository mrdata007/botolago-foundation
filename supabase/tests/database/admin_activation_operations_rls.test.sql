begin;

select extensions.no_plan();

select extensions.is(
  has_function_privilege(
    'service_role',
    'api.admin_get_owner_bootstrap_readiness(uuid)',
    'EXECUTE'
  ),
  true,
  'only the trusted service role can execute owner readiness'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'api.admin_get_owner_bootstrap_readiness(uuid)',
    'EXECUTE'
  ),
  false,
  'browser users cannot execute owner readiness'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'api.admin_get_owner_bootstrap_readiness(uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot execute owner readiness'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'api.admin_get_revocation_worker_runtime_status()',
    'EXECUTE'
  ),
  true,
  'the trusted service role can inspect bounded worker status'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'api.admin_get_revocation_worker_runtime_status()',
    'EXECUTE'
  ),
  false,
  'browser users cannot execute the trusted worker-status contract'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'api.admin_get_revocation_worker_runtime_status()',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot execute the trusted worker-status contract'
);
select extensions.is(
  has_table_privilege(
    'service_role',
    'app_private.staff_principals',
    'SELECT'
  ),
  false,
  'the service role still has no direct principal-table grant'
);
select extensions.is(
  has_table_privilege(
    'service_role',
    'app_private.admin_worker_runs',
    'SELECT'
  ),
  false,
  'the service role still has no direct worker-ledger grant'
);
select extensions.ok(
  pg_get_functiondef(
    'api.admin_get_owner_bootstrap_readiness(uuid)'::regprocedure
  ) !~* '(insert[[:space:]]+into|update[[:space:]]+|delete[[:space:]]+from)',
  'the owner-readiness database contract contains no mutation statement'
);

set local role authenticated;
select extensions.throws_ok(
  $$select api.admin_get_owner_bootstrap_readiness(
    'b1000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'authenticated users are denied before the readiness body can run'
);
select extensions.throws_ok(
  $$select api.admin_get_revocation_worker_runtime_status()$$,
  '42501',
  null,
  'authenticated users cannot inspect the trusted worker runtime'
);

select extensions.finish();
rollback;
