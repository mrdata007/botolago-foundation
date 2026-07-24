begin;

select extensions.no_plan();

select extensions.is(
  has_function_privilege(
    'authenticated',
    'api.admin_resolve_staff_user_exact(text)',
    'EXECUTE'
  ),
  true,
  'authenticated staff reach exact identity resolution only through its RPC'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'api.admin_resolve_staff_user_exact(text)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot resolve staff identities'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'api.admin_create_staff_principal(uuid,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated staff reach principal creation only through its RPC'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'api.admin_create_staff_principal(uuid,text,uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot create staff principals'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'api.admin_shorten_role_expiry(uuid,timestamptz,text,uuid)',
    'EXECUTE'
  ),
  true,
  'expiry shortening is exposed only as a permission-checking RPC'
);
select extensions.is(
  has_table_privilege(
    'authenticated',
    'app_private.staff_principals',
    'SELECT'
  ),
  false,
  'browser users retain zero direct principal access'
);
select extensions.is(
  has_table_privilege(
    'authenticated',
    'app_private.staff_role_assignments',
    'INSERT'
  ),
  false,
  'browser users cannot directly grant roles'
);
select extensions.is(
  has_table_privilege(
    'authenticated',
    'app_private.admin_approval_requests',
    'UPDATE'
  ),
  false,
  'browser users cannot directly approve or execute requests'
);
select extensions.is(
  has_table_privilege(
    'authenticated',
    'app_private.admin_audit_events',
    'INSERT'
  ),
  false,
  'browser users cannot forge privileged audit evidence'
);
select extensions.is(
  has_table_privilege(
    'authenticated',
    'app_private.staff_session_revocation_requests',
    'UPDATE'
  ),
  false,
  'browser users cannot claim or complete session invalidation work'
);

select * from extensions.finish();
rollback;
