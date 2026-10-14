/**
 * Builds scripts/backend/apply-20261013100500-premium-admin-overview.sql: the guarded script the
 * owner pastes in the Supabase SQL editor to replace api.admin_premium_overview() with the version
 * that also counts members by product (migration 20261013100500), first on staging
 * (srdrflfrfpwixsllveid), then on production (tkewgajrljbwgwedqsxn), AFTER the membership
 * foundation (apply-20261013100000-premium-foundation.sql).
 *
 *   bun scripts/backend/build-apply-premium-admin-overview.ts          # rewrite the script
 *   bun scripts/backend/build-apply-premium-admin-overview.ts --check  # exit 1 if it drifted
 *
 * The script carries the migration file byte for byte, once, with its sha256;
 * apply-premium-admin-overview-script.test.ts fails when the committed script differs from what
 * this file builds. Rerun this after the migration file changes (only while it is unapplied
 * everywhere: CLAUDE.md, "Migrations").
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const SCRIPT_PATH = "scripts/backend/apply-20261013100500-premium-admin-overview.sql";
export const MIGRATIONS = [
  { version: "20261013100500", name: "premium_admin_overview_by_product" },
] as const;
/** What this builds on: the foundation, whose api.admin_premium_overview() it replaces. */
export const PREREQUISITES = ["20261013100000", "20261013100100", "20261013100200"] as const;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export function build(): string {
  const { version, name } = MIGRATIONS[0];
  const text = readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");
  if (text.includes(`$bg_${version}_file$`)) {
    throw new Error(`${version}: the file contains its own quoting tag`);
  }
  const needed = PREREQUISITES.map((v) => `'${v}'`).join(", ");

  return `-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply migration ${version}: the BotolaGO+ admin overview also counts members by product
-- (docs/plans/BOTOLAGO_PLUS_PLAN.md section 5.9, the /admin/plus screen).
--
-- It REPLACES ONE FUNCTION, api.admin_premium_overview(), same signature, same gate and grants,
-- with the same answer plus one key (membersByProduct: counts only). No table, no other
-- function, no row, no job. It is read-only for every caller and writes nothing when it runs.
--
-- WHEN
--   After the membership foundation is applied on this database
--   (scripts/backend/apply-20261013100000-premium-foundation.sql), after the pull request that
--   adds this file is merged and its database-quality job passed. Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run in progress, no
--     other query running, no other agent or workflow working on the database.
--   * Nothing needs pausing: no table or job is touched, and a function is replaced in one
--     transaction (a caller mid-call keeps the old body).
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every guard and check
--      runs on the real code path inside one transaction and the script ends with a deliberate
--      error whose message carries the state it computed ("REHEARSAL PASSED -- nothing was
--      saved: {...}"). That error is the expected, good outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select pg_get_functiondef('api.admin_premium_overview()'::regprocedure)
--          like '%membersByProduct%' as applied;
--      It must say false.
--   4. In the line \`select set_config('bg.premium_overview_mode', 'rehearsal', true);\` near the
--      top, change 'rehearsal' to 'apply' and press Run again. The result row says "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where the foundation (20261013100000 to 20261013100200) is not
--     recorded, or where api.admin_premium_overview() is missing or already has the new key;
--   * records the migration file in supabase_migrations.schema_migrations, whole as
--     statements[1], and runs it from that record once its sha256 matches the repository file;
--   * checks the result without saving anything: the function has the key, is security definer
--     with an empty search_path, only signed-in callers (not anon, not public) may run it, no
--     function was added to the api schema, and the number of scheduled jobs is unchanged.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.premium_overview_mode', 'rehearsal', true);

do $preflight$
declare
  missing text[] := '{}';
  needed text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '${version}') then
    raise exception 'stop: ${version} is already recorded as applied';
  end if;
  foreach needed in array array[${needed}] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet: %', missing;
  end if;
  if to_regprocedure('api.admin_premium_overview()') is null then
    raise exception 'stop: api.admin_premium_overview() is missing';
  end if;
  if pg_get_functiondef('api.admin_premium_overview()'::regprocedure) like '%membersByProduct%' then
    raise exception 'stop: api.admin_premium_overview() already counts members by product';
  end if;
  perform set_config('bg.premium_overview_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.premium_overview_api', (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api')::text, true);
end
$preflight$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '${version}',
  '${name}',
  array[$bg_${version}_file$${text}$bg_${version}_file$]
);

do $apply$
declare
  part_${version} text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '${version}'
  );
begin
  if encode(sha256(convert_to(part_${version}, 'UTF8')), 'hex')
    is distinct from '${sha256(text)}' then
    raise exception 'stop: ${version} is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_${version};
end
$apply$;

do $postflight$
declare
  problems text[] := '{}';
  who text;
  sig regprocedure := 'api.admin_premium_overview()'::regprocedure;
  state jsonb;
begin
  if pg_get_functiondef(sig) not like '%membersByProduct%' then
    problems := problems || 'the function does not count members by product'::text;
  end if;
  if not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = sig) then
    problems := problems || 'the function is not security definer with an empty search_path'::text;
  end if;
  if not has_function_privilege('authenticated', sig, 'execute') then
    problems := problems || 'authenticated cannot run the function'::text;
  end if;
  foreach who in array array['anon', 'service_role', 'public'] loop
    if has_function_privilege(who, sig, 'execute') then
      problems := problems || (who || ' can run the function');
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'api')::text is distinct from current_setting('bg.premium_overview_api', true) then
    problems := problems || 'the number of api functions changed -- this script adds none'::text;
  end if;
  if (select count(*) from cron.job)::text is distinct from current_setting('bg.premium_overview_jobs', true) then
    problems := problems || 'the number of scheduled jobs changed -- this script adds none'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version = '${version}') <> 1 then
    problems := problems || 'the history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'function', sig::text,
    'countsByProduct', true,
    'apiFunctions', current_setting('bg.premium_overview_api', true)::int,
    'historyRows', 1
  );
  perform set_config('bg.premium_overview_state', state::text, true);
end
$postflight$;

do $finish$
begin
  if current_setting('bg.premium_overview_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.premium_overview_state', true);
  end if;
  raise notice 'premium admin overview: applying: %', current_setting('bg.premium_overview_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${version}')
    then 'Applied. The BotolaGO+ admin overview now counts members by product. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
`;
}

if (import.meta.main) {
  const target = join(root, SCRIPT_PATH);
  const built = build();
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== built) {
      console.error(`${SCRIPT_PATH} differs from what this builder produces; rerun it.`);
      process.exit(1);
    }
    console.log(`${SCRIPT_PATH} is up to date.`);
  } else {
    writeFileSync(target, built);
    console.log(`Wrote ${SCRIPT_PATH}.`);
  }
}
