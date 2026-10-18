/**
 * Builds scripts/backend/apply-20261016170000-pilot-cap.sql, the guarded owner script that puts
 * migration 20261016170000 (the pilot cap, shipped OFF) on BotolaGO Production V2.
 *
 *   bun scripts/backend/build-apply-20261016170000-pilot-cap.ts           write the script
 *   bun scripts/backend/build-apply-20261016170000-pilot-cap.ts --check   fail if it differs
 *
 * Every pin is computed here from the repository files (never typed in): the sha256 of the
 * migration, the md5 of the source (pg_proc.prosrc) of the one function the migration REPLACES as
 * it stands in the repository's latest definition (what production must hold before), and the md5
 * of the three functions it leaves behind. The test recomputes them independently.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");

export const VERSION = "20261016170000";
export const NAME = "pilot_cap";
export const MIGRATION_PATH = `supabase/migrations/${VERSION}_${NAME}.sql`;
export const SCRIPT_PATH = "scripts/backend/apply-20261016170000-pilot-cap.sql";
export const RUNBOOK = "docs/production/PILOT_CAP_OWNER_RUNBOOK.md";

/** What pg_proc.prosrc holds for the function whose `create [or replace] function` starts at `header`. */
export function bodyOf(source: string, header: RegExp): string {
  const match = header.exec(source);
  if (!match) throw new Error(`definition not found: ${header}`);
  const start = source.indexOf("$$", match.index + match[0].length) + 2;
  const end = source.indexOf("$$", start);
  if (start < 2 || end < 0) throw new Error(`no body for ${header}`);
  return source.slice(start, end);
}

export const CREATE_TEAM_SIGNATURE = "api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)";
export const CREATE_TEAM_HEADER = /create or replace function api\.create_fantasy_team\(/;
/** The repository's latest definition of the function the migration replaces. */
export const REPLACED_FROM = "20260926003100_ordinary_account_mfa_step_up.sql";

/** The two functions the migration creates, and the one it replaces. */
export const NEW_FUNCTIONS = [
  {
    signature: "app_private.pilot_configure(boolean,integer)",
    header: /create function app_private\.pilot_configure\(/,
  },
  {
    signature: "app_private.pilot_manager_count(uuid)",
    header: /create function app_private\.pilot_manager_count\(/,
  },
  { signature: CREATE_TEAM_SIGNATURE, header: CREATE_TEAM_HEADER },
] as const;

/** Migrations the update needs recorded: the latest definition of the replaced function, and the hidden-accounts list. */
export const REQUIRED_MIGRATIONS = ["20260926003100", "20261011160000"];

export function replacedPin() {
  return md5(bodyOf(read(`supabase/migrations/${REPLACED_FROM}`), CREATE_TEAM_HEADER));
}

export function newFunctionPins(migration: string) {
  return NEW_FUNCTIONS.map((fn) => ({ ...fn, md5: md5(bodyOf(migration, fn.header)) }));
}

export function build(): string {
  const migration = read(MIGRATION_PATH);
  const tag = `$bg_${VERSION}_file$`;
  if (migration.includes(tag)) throw new Error("the migration contains the dollar-quote tag");
  const before = replacedPin();
  const created = newFunctionPins(migration);
  const createdValues = created.map((fn) => `      ('${fn.signature}', '${fn.md5}')`).join(",\n");
  const requiredList = REQUIRED_MIGRATIONS.map((v) => `'${v}'`).join(", ");
  const sha = sha256(migration);
  const teamPin = created.find((fn) => fn.signature === CREATE_TEAM_SIGNATURE)!.md5;

  return `-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration ${VERSION}_${NAME}
-- (the pilot cap, owner decision 2026-10-16; ${RUNBOOK}):
-- BotolaGO launches as a pilot capped at 1,000 managers. This adds the cap and ships it OFF: applied,
-- nothing changes for anyone until the owner switches it on in a SEPARATE authorised operation.
--   * app_private.pilot_settings: one row, enabled = false, max_managers = 1000, counting_rule 'teams';
--   * app_private.pilot_configure(enabled, max_managers): the owner's switch (postgres only);
--   * app_private.pilot_manager_count(season): the one definition of the count (postgres only);
--   * api.create_fantasy_team REPLACED by a copy of its latest definition (${REPLACED_FROM}) plus one
--     guard. While the cap is off the guard reads the settings row and does nothing else. While on, it
--     takes a per-season advisory lock and refuses a NEW team with PT409 fantasy_pilot_full once the
--     season has max_managers counted managers (active teams, minus accounts hidden from the rankings).
--     An existing manager, an idempotent replay, lineups, transfers and sign-in are not affected.
-- Supabase Auth sign-up is not touched: the cap is on teams, not accounts.
--
-- WHEN
--   Any time of day; the statements need well under a second. It needs 20260926003100 and 20261011160000
--   recorded (the script checks). Ordinary traffic is not interrupted: a create already running
--   finishes on the old definition, the next one uses the new one, and with the cap off they behave
--   the same.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing. The script creates one table (with its one row), two functions, and
--   replaces one function, api.create_fantasy_team, plus its own history row in
--   supabase_migrations.schema_migrations. No pg_cron job and no Edge Function creates a Fantasy team
--   or reads any of these objects (the Fantasy, Pépites, Manager Card, Trophées, Rivaux, e-mail, push,
--   news, prediction, account-deletion and ops jobs listed in AGENTS.md never call the function; the
--   capacity and staging seeds insert teams directly, not through it). The only caller is a manager's
--   own browser. Still make sure no other schema change (another apply script, a migration, a deploy)
--   is running right now: a rehearsal that ends in rollback takes locks too. The script compares every
--   other function in the api and app_private schemas, the grants of api.create_fantasy_team, the
--   number of Fantasy teams and the cron job list before and after and stops if they moved.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line \`rollback;\` near the bottom to \`commit;\` and press Run again. The result
--      row should say "Applied". The cap is still OFF.
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--   Switching the cap on is a different operation and needs its own authorisation:
--   select app_private.pilot_configure(true, 1000);   (${RUNBOOK})
--   To take it back: switch it off with select app_private.pilot_configure(false); (instant, no deploy).
--   Removing the code is a forward migration that restores api.create_fantasy_team from
--   ${REPLACED_FROM} and drops the table and the two functions. Never edit this migration.
--
-- WHAT IT DOES
--   * refuses to run twice (history row, or the table or either function already there), before
--     20260926003100 and 20261011160000 are recorded, and where api.create_fantasy_team is not byte
--     for byte the text the repository's latest migration defines (md5 of its source ${before});
--   * records the migration file in supabase_migrations.schema_migrations, whole as statements[1]
--     (the form the migration promoter and the other apply scripts use), and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: the three functions are the reviewed text with an empty
--     search path (the switch and create_fantasy_team security definer); the two new ones are callable by no API role; create_fantasy_team
--     keeps its owner and its grants (signed-in users and the service, not anon); the settings table is
--     one row, OFF, 1000, 'teams', with row security forced and no API privilege; every other function
--     in api and app_private, the number of Fantasy teams and the cron job list are where they were;
--     the history row is there. It does not insert, update or delete a row of any Fantasy table.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  fn record;
  src text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}') then
    raise exception 'stop: migration ${VERSION} is already recorded as applied';
  end if;
  for fn in select v.version from unnest(array[${requiredList}]) as v(version) loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = fn.version) then
      raise exception 'stop: migration % is not recorded -- apply it first (this update is written against it)', fn.version;
    end if;
  end loop;
  if to_regclass('app.fantasy_teams') is null
    or to_regclass('app.fantasy_seasons') is null
    or to_regclass('app_private.public_ranking_exclusions') is null
    or to_regprocedure('${CREATE_TEAM_SIGNATURE}') is null then
    raise exception 'stop: the database is missing the Fantasy tables or functions this update needs';
  end if;

  -- Not here yet.
  if to_regclass('app_private.pilot_settings') is not null
    or to_regprocedure('app_private.pilot_configure(boolean,integer)') is not null
    or to_regprocedure('app_private.pilot_manager_count(uuid)') is not null then
    raise exception 'stop: the pilot cap already exists -- was this applied by another route?';
  end if;

  -- The function this update replaces is the reviewed one: the repository's latest definition.
  select p.prosrc into src from pg_catalog.pg_proc p where p.oid = to_regprocedure('${CREATE_TEAM_SIGNATURE}');
  if md5(src) <> '${before}' then
    raise exception 'stop: ${CREATE_TEAM_SIGNATURE} is not the reviewed one (md5 %, expected ${before}) -- the live text differs from ${REPLACED_FROM}; read it with pg_get_functiondef and compare before replacing it', md5(src);
  end if;

  -- Baseline, to compare after: what must not move.
  perform set_config('bg.pcap_team_fn_before',
    (select concat_ws('|', coalesce(p.proacl::text, ''), p.proowner::regrole::text, p.prosecdef::text,
        coalesce(p.proconfig::text, ''), p.prorettype::regtype::text, p.provolatile::text)
     from pg_catalog.pg_proc p where p.oid = to_regprocedure('${CREATE_TEAM_SIGNATURE}')), true);
  perform set_config('bg.pcap_functions_before',
    (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text), ''))
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('api', 'app_private')
       and p.proname not in ('create_fantasy_team', 'pilot_configure', 'pilot_manager_count')), true);
  perform set_config('bg.pcap_rows_before',
    (select jsonb_build_array(
       (select count(*) from app.fantasy_teams),
       (select count(*) from app_private.public_ranking_exclusions))::text), true);
  perform set_config('bg.pcap_cron_jobs_before',
    (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
     from cron.job j), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration ${VERSION}, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '${VERSION}',
  '${NAME}',
  array[${tag}${migration}${tag}]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_${VERSION} text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '${VERSION}'
  );
begin
  if encode(sha256(convert_to(part_${VERSION}, 'UTF8')), 'hex')
    is distinct from '${sha}' then
    raise exception 'stop: ${VERSION} is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_${VERSION};
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn record;
  def record;
  settings record;
  api_role text;
begin
  -- The three functions: the reviewed text, security definer, empty search path.
  for fn in
    select * from (values
${createdValues}
    ) v(sig, md5_src)
  loop
    select p.prosrc, p.prosecdef, p.proconfig, p.provolatile into def
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      problems := problems || (fn.sig || ' was not created');
    elsif md5(def.prosrc) <> fn.md5_src then
      problems := problems || (fn.sig || ' is not the reviewed text');
    elsif not def.prosecdef and fn.sig <> 'app_private.pilot_manager_count(uuid)' then
      problems := problems || (fn.sig || ' is not security definer');
    elsif def.proconfig is distinct from array['search_path=""'] then
      problems := problems || (fn.sig || ' does not have an empty search_path');
    end if;
  end loop;

  -- The two new functions are callable by no API role.
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(api_role, 'app_private.pilot_configure(boolean,integer)', 'execute')
      or has_function_privilege(api_role, 'app_private.pilot_manager_count(uuid)', 'execute') then
      problems := problems || ('an API role (' || api_role || ') can call the pilot switch or the count');
    end if;
  end loop;

  -- The replaced function keeps its owner, grants, security mode, search path and result type.
  if (select concat_ws('|', coalesce(p.proacl::text, ''), p.proowner::regrole::text, p.prosecdef::text,
        coalesce(p.proconfig::text, ''), p.prorettype::regtype::text, p.provolatile::text)
      from pg_catalog.pg_proc p where p.oid = to_regprocedure('${CREATE_TEAM_SIGNATURE}'))
    is distinct from current_setting('bg.pcap_team_fn_before', true) then
    problems := problems || '${CREATE_TEAM_SIGNATURE} changed its owner, grants or settings'::text;
  end if;
  if not has_function_privilege('authenticated', '${CREATE_TEAM_SIGNATURE}', 'execute')
    or has_function_privilege('anon', '${CREATE_TEAM_SIGNATURE}', 'execute')
    or has_function_privilege('public', '${CREATE_TEAM_SIGNATURE}', 'execute') then
    problems := problems || 'api.create_fantasy_team is not callable by signed-in users only (not anon)'::text;
  end if;

  -- Shipped OFF: one row, enabled false, 1000, teams; closed to every API role.
  select s.enabled, s.max_managers, s.counting_rule, (select count(*) from app_private.pilot_settings) as row_count
    into settings from app_private.pilot_settings s;
  if settings.enabled is distinct from false or settings.max_managers is distinct from 1000
    or settings.counting_rule is distinct from 'teams' or settings.row_count <> 1 then
    problems := problems || 'the pilot switch is not one row, OFF, 1000, teams'::text;
  end if;
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('app_private.pilot_settings')) then
    problems := problems || 'row security is not enabled and forced on app_private.pilot_settings'::text;
  end if;
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(api_role, 'app_private.pilot_settings', 'select')
      or has_table_privilege(api_role, 'app_private.pilot_settings', 'insert')
      or has_table_privilege(api_role, 'app_private.pilot_settings', 'update')
      or has_table_privilege(api_role, 'app_private.pilot_settings', 'delete') then
      problems := problems || ('an API role (' || api_role || ') has a privilege on app_private.pilot_settings');
    end if;
  end loop;

  -- Nothing else moved.
  if (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text), ''))
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('api', 'app_private')
        and p.proname not in ('create_fantasy_team', 'pilot_configure', 'pilot_manager_count'))
    is distinct from current_setting('bg.pcap_functions_before', true) then
    problems := problems || 'another function in api or app_private changed'::text;
  end if;
  if (select jsonb_build_array(
        (select count(*) from app.fantasy_teams),
        (select count(*) from app_private.public_ranking_exclusions))::text)
    is distinct from current_setting('bg.pcap_rows_before', true) then
    problems := problems || 'the number of Fantasy teams or of hidden accounts changed'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.pcap_cron_jobs_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}')
    then 'Applied. The pilot cap exists and is OFF: nothing changes for anyone yet. To switch it on (a separate authorised operation): select app_private.pilot_configure(true, 1000); to read where the pilot stands: select app_private.pilot_manager_count(id), name from app.fantasy_seasons where status in (''registration_open'', ''active''); to switch it off again: select app_private.pilot_configure(false);'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
`;
}

if (import.meta.main) {
  const next = build();
  const target = join(root, SCRIPT_PATH);
  if (process.argv.includes("--check")) {
    const current = readFileSync(target, "utf8");
    if (current !== next) {
      console.error(`${SCRIPT_PATH} is not what the builder makes; run the builder.`);
      process.exit(1);
    }
    console.log(`${SCRIPT_PATH} is up to date.`);
  } else {
    writeFileSync(target, next);
    console.log(`wrote ${SCRIPT_PATH}`);
  }
}
