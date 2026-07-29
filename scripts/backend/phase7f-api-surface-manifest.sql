select jsonb_build_object(
  'manifestVersion', 1,
  'schemas', coalesce((
    select jsonb_agg(to_jsonb(schema_row) order by schema_row.schema_name)
    from (
      select
        namespace.nspname as schema_name,
        pg_get_userbyid(namespace.nspowner) as owner,
        jsonb_build_object(
          'anonUsage', has_schema_privilege('anon', namespace.oid, 'USAGE'),
          'authenticatedUsage', has_schema_privilege('authenticated', namespace.oid, 'USAGE'),
          'serviceRoleUsage', has_schema_privilege('service_role', namespace.oid, 'USAGE')
        ) as role_privileges
      from pg_namespace namespace
      where namespace.nspname in ('api', 'app', 'app_private')
    ) schema_row
  ), '[]'::jsonb),
  'apiRelations', coalesce((
    select jsonb_agg(to_jsonb(relation_row) order by relation_row.name)
    from (
      select
        relation.relname as name,
        relation.relkind::text as kind,
        pg_get_userbyid(relation.relowner) as owner,
        relation.relrowsecurity as row_security,
        relation.relforcerowsecurity as force_row_security,
        coalesce(to_jsonb(relation.reloptions), '[]'::jsonb) as options,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'grantee', coalesce(grantee.rolname, 'PUBLIC'),
              'privilege', privilege.privilege_type,
              'grantable', privilege.is_grantable
            )
            order by coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type
          )
          from aclexplode(
            coalesce(relation.relacl, acldefault('r', relation.relowner))
          ) privilege
          left join pg_roles grantee on grantee.oid = privilege.grantee
        ), '[]'::jsonb) as grants
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'api'
        and relation.relkind in ('r', 'p', 'v', 'm', 'f')
    ) relation_row
  ), '[]'::jsonb),
  'apiRoutines', coalesce((
    select jsonb_agg(to_jsonb(routine_row)
      order by routine_row.name, routine_row.identity_arguments)
    from (
      select
        routine.proname as name,
        pg_get_function_identity_arguments(routine.oid) as identity_arguments,
        pg_get_function_result(routine.oid) as result_type,
        routine.prokind::text as kind,
        routine.provolatile::text as volatility,
        routine.prosecdef as security_definer,
        pg_get_userbyid(routine.proowner) as owner,
        coalesce(to_jsonb(routine.proconfig), '[]'::jsonb) as configuration,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'grantee', coalesce(grantee.rolname, 'PUBLIC'),
              'privilege', privilege.privilege_type,
              'grantable', privilege.is_grantable
            )
            order by coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type
          )
          from aclexplode(
            coalesce(routine.proacl, acldefault('f', routine.proowner))
          ) privilege
          left join pg_roles grantee on grantee.oid = privilege.grantee
        ), '[]'::jsonb) as grants
      from pg_proc routine
      join pg_namespace namespace on namespace.oid = routine.pronamespace
      where namespace.nspname = 'api'
    ) routine_row
  ), '[]'::jsonb),
  'canonicalPolicies', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'schema', policy.schemaname,
        'table', policy.tablename,
        'name', policy.policyname,
        'permissive', policy.permissive,
        'roles', to_jsonb(policy.roles),
        'command', policy.cmd,
        'usingHash', encode(extensions.digest(coalesce(policy.qual, ''), 'sha256'), 'hex'),
        'checkHash', encode(extensions.digest(coalesce(policy.with_check, ''), 'sha256'), 'hex')
      )
      order by policy.schemaname, policy.tablename, policy.policyname
    )
    from pg_policies policy
    where policy.schemaname in ('app', 'app_private')
  ), '[]'::jsonb),
  'canonicalTables', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'schema', namespace.nspname,
        'name', relation.relname,
        'rowSecurity', relation.relrowsecurity,
        'forceRowSecurity', relation.relforcerowsecurity
      )
      order by namespace.nspname, relation.relname
    )
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('app', 'app_private')
      and relation.relkind in ('r', 'p')
  ), '[]'::jsonb),
  'browserRelationPrivileges', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'schema', namespace.nspname,
        'relation', relation.relname,
        'grantee', grantee.rolname,
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      )
      order by namespace.nspname, relation.relname, grantee.rolname,
        privilege.privilege_type
    )
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) privilege
    join pg_roles grantee on grantee.oid = privilege.grantee
    where namespace.nspname in ('app', 'app_private')
      and relation.relkind in ('r', 'p', 'v', 'm', 'S')
      and grantee.rolname in ('anon', 'authenticated')
  ), '[]'::jsonb),
  'browserSequencePrivileges', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'schema', namespace.nspname,
        'sequence', relation.relname,
        'grantee', grantee.rolname,
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      )
      order by namespace.nspname, relation.relname, grantee.rolname,
        privilege.privilege_type
    )
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('S', relation.relowner))
    ) privilege
    join pg_roles grantee on grantee.oid = privilege.grantee
    where namespace.nspname in ('api', 'app', 'app_private')
      and relation.relkind = 'S'
      and grantee.rolname in ('anon', 'authenticated')
  ), '[]'::jsonb)
) as manifest;
