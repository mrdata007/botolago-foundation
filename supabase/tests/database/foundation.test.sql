begin;

select extensions.plan(20);

select extensions.ok(
  exists (select 1 from pg_extension where extname = 'pgcrypto'),
  'pgcrypto is installed'
);
select extensions.ok(
  exists (select 1 from pg_extension where extname = 'pgtap'),
  'pgTAP is installed'
);
select extensions.ok(
  exists (select 1 from pg_namespace where nspname = 'app'),
  'app schema exists'
);
select extensions.ok(
  exists (select 1 from pg_namespace where nspname = 'api'),
  'api schema exists'
);
select extensions.ok(
  exists (select 1 from pg_namespace where nspname = 'app_private'),
  'app_private schema exists'
);

select extensions.ok(has_schema_privilege('anon', 'api', 'usage'), 'anon can resolve api');
select extensions.ok(
  has_schema_privilege('authenticated', 'api', 'usage'),
  'authenticated can resolve api'
);
select extensions.ok(
  not has_schema_privilege('anon', 'app', 'usage'),
  'anon cannot resolve app'
);
select extensions.ok(
  not has_schema_privilege('authenticated', 'app', 'usage'),
  'authenticated cannot resolve app'
);
select extensions.ok(
  not has_schema_privilege('anon', 'app_private', 'usage'),
  'anon cannot resolve app_private'
);
select extensions.ok(
  not has_schema_privilege('authenticated', 'app_private', 'usage'),
  'authenticated cannot resolve app_private'
);

select extensions.ok(
  to_regprocedure('app_private.set_updated_at()') is not null,
  'updated_at trigger function exists'
);
select extensions.ok(
  not (select prosecdef from pg_proc where oid = 'app_private.set_updated_at()'::regprocedure),
  'updated_at trigger function is SECURITY INVOKER'
);
select extensions.ok(
  exists (
    select 1
    from pg_proc as procedure
    cross join lateral unnest(coalesce(procedure.proconfig, array[]::text[])) as setting
    where procedure.oid = 'app_private.set_updated_at()'::regprocedure
      and setting in ('search_path=', 'search_path=""')
  ),
  'updated_at trigger function has an empty search_path'
);
select extensions.ok(
  not has_function_privilege('anon', 'app_private.set_updated_at()', 'execute'),
  'anon cannot execute private trigger function'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'app_private.set_updated_at()', 'execute'),
  'authenticated cannot execute private trigger function'
);
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.set_updated_at()', 'execute'),
  'service_role cannot execute private trigger function directly'
);
select extensions.ok(
  not exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'app'
      and relation.relkind in ('r', 'p')
  ),
  'Phase 1 creates no product tables'
);

create temporary table updated_at_probe (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default '-infinity'::timestamptz
);
create trigger updated_at_probe_set_updated_at
before update on updated_at_probe
for each row execute function app_private.set_updated_at();
insert into updated_at_probe default values;

select extensions.ok(
  (select updated_at = '-infinity'::timestamptz from updated_at_probe),
  'updated_at is not changed during insert'
);
update updated_at_probe set id = id;
select extensions.ok(
  (select updated_at > '-infinity'::timestamptz from updated_at_probe),
  'updated_at is set by database time during update'
);

select * from extensions.finish();
rollback;
