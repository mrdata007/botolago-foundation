-- Schema fingerprint: one row per database object this repository owns, with
-- an md5 of its definition. READ-ONLY (catalogue reads only).
--
-- Two databases built from the same migrations give the same rows, whatever
-- the version numbers their migration history records. Run it on production
-- and on a local `supabase db reset` at the same migration, and compare:
-- scripts/backend/schema-fingerprint-compare.ts does, and
-- docs/backend/MIGRATION_DRIFT.md says how.
--
-- Scope: the schemas the migrations create (app, app_private, api), their
-- grants, row security, policies, triggers, and the pg_cron jobs. Objects
-- that belong to an extension are left out: they follow the platform's
-- extension version, not this repository.
with owned_schema as (
  select oid, nspname from pg_namespace where nspname in ('app', 'app_private', 'api')
),
extension_member as (
  select objid from pg_depend where deptype = 'e'
),
sorted_acl as (
  -- aclitem arrays keep grant order; compare them as sets.
  select c.oid, (select string_agg(item::text, ',' order by item::text collate "C") from unnest(c.relacl) item) as acl
  from pg_class c
),
objects(kind, identity, definition) as (
  -- Functions and procedures: the full CREATE text (body, volatility,
  -- SECURITY DEFINER, search_path, ...) and the grants.
  select 'function', s.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    pg_get_functiondef(p.oid)
      || ' acl=' || coalesce((select string_agg(item::text, ',' order by item::text collate "C") from unnest(p.proacl) item), '')
  from pg_proc p
  join owned_schema s on s.oid = p.pronamespace
  where p.prokind in ('f', 'p') and p.oid not in (select objid from extension_member)

  union all
  -- Tables, views and sequences: kind, row security, options, grants.
  select 'relation', s.nspname || '.' || c.relname,
    c.relkind::text || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity
      || ' options=' || coalesce(array_to_string(c.reloptions, ','), '')
      || ' acl=' || coalesce(a.acl, '')
  from pg_class c
  join owned_schema s on s.oid = c.relnamespace
  join sorted_acl a on a.oid = c.oid
  where c.relkind in ('r', 'p', 'v', 'm', 'S') and c.oid not in (select objid from extension_member)

  union all
  -- Columns, by name (a column added in another order is not a difference).
  select 'column', s.nspname || '.' || c.relname || '.' || att.attname,
    format_type(att.atttypid, att.atttypmod) || ' notnull=' || att.attnotnull
      || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
      || ' identity=' || att.attidentity::text || ' generated=' || att.attgenerated::text
  from pg_attribute att
  join pg_class c on c.oid = att.attrelid
  join owned_schema s on s.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = att.attrelid and d.adnum = att.attnum
  where c.relkind in ('r', 'p', 'v', 'm') and att.attnum > 0 and not att.attisdropped
    and c.oid not in (select objid from extension_member)

  union all
  select 'view', s.nspname || '.' || c.relname, pg_get_viewdef(c.oid)
  from pg_class c
  join owned_schema s on s.oid = c.relnamespace
  where c.relkind in ('v', 'm')

  union all
  select 'constraint', s.nspname || '.' || c.relname || '.' || con.conname, pg_get_constraintdef(con.oid)
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join owned_schema s on s.oid = c.relnamespace

  union all
  select 'index', s.nspname || '.' || i.relname, pg_get_indexdef(i.oid)
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join owned_schema s on s.oid = i.relnamespace

  union all
  select 'policy', s.nspname || '.' || c.relname || '.' || pol.polname,
    pol.polcmd::text || ' permissive=' || pol.polpermissive
      || ' roles=' || (select string_agg(r::regrole::text, ',' order by r::regrole::text collate "C") from unnest(pol.polroles) r)
      || ' using=' || coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
      || ' check=' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join owned_schema s on s.oid = c.relnamespace

  union all
  select 'trigger', s.nspname || '.' || c.relname || '.' || t.tgname,
    pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join owned_schema s on s.oid = c.relnamespace
  where not t.tgisinternal

  union all
  -- Enums (their labels in order) and domains (base type and checks).
  select 'type', s.nspname || '.' || t.typname,
    t.typtype::text
      || coalesce(' labels=' || (
        select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid
      ), '')
      || coalesce(' base=' || format_type(nullif(t.typbasetype, 0), t.typtypmod), '')
      || ' notnull=' || t.typnotnull || ' default=' || coalesce(t.typdefault, '')
      || coalesce(' checks=' || (
        select string_agg(pg_get_constraintdef(con.oid), ',' order by con.conname collate "C")
        from pg_constraint con where con.contypid = t.oid
      ), '')
  from pg_type t
  join owned_schema s on s.oid = t.typnamespace
  where t.typtype in ('e', 'd')

  union all
  select 'schema', s.nspname,
    coalesce((select string_agg(item::text, ',' order by item::text collate "C") from unnest(n.nspacl) item), '')
  from owned_schema s
  join pg_namespace n on n.oid = s.oid

  union all
  -- pg_cron jobs by name: when they run and what they run.
  select 'cron', j.jobname, j.schedule || ' active=' || j.active || ' ' || j.command
  from cron.job j
)
select kind, identity, md5(definition) as md5
from objects
order by kind collate "C", identity collate "C";
