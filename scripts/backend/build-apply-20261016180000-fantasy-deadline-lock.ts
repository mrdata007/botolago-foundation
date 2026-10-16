/**
 * Builds scripts/backend/apply-20261016180000-fantasy-deadline-lock.sql, the guarded owner script that
 * puts migration 20261016180000 (a manager's change that passed the deadline check cannot commit after
 * the gameweek is locked; audit finding SEC-01, second gap) on BotolaGO Production V2.
 *
 *   bun scripts/backend/build-apply-20261016180000-fantasy-deadline-lock.ts           write the script
 *   bun scripts/backend/build-apply-20261016180000-fantasy-deadline-lock.ts --check   fail if it differs
 *
 * Every pin is computed here from the repository files (never typed in): the sha256 of the migration,
 * the md5 of the source (pg_proc.prosrc) of the two functions it replaces as they stand before (their
 * latest definitions) and after (the migration's), and of the seven functions it relies on and does not
 * change. The test recomputes them independently.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");

export const VERSION = "20261016180000";
export const NAME = "fantasy_deadline_mutation_lock";
export const MIGRATION_PATH = `supabase/migrations/${VERSION}_${NAME}.sql`;
export const SCRIPT_PATH = "scripts/backend/apply-20261016180000-fantasy-deadline-lock.sql";
export const RUNBOOK = "docs/production/FANTASY_DEADLINE_LOCK_OWNER_RUNBOOK.md";

/** What pg_proc.prosrc holds for the function whose `create [or replace] function` starts at `header`. */
export function bodyOf(source: string, header: RegExp): string {
  const match = header.exec(source);
  if (!match) throw new Error(`definition not found: ${header}`);
  const start = source.indexOf("$$", match.index + match[0].length) + 2;
  const end = source.indexOf("$$", start);
  if (start < 2 || end < 0) throw new Error(`no body for ${header}`);
  return source.slice(start, end);
}

export interface Pin {
  signature: string;
  label: string;
  file: string;
  header: RegExp;
}

/** The two functions the migration replaces: where their current (latest) definition is. */
export const REPLACED: (Pin & { newHeader: RegExp })[] = [
  {
    signature: "app_private.fantasy_assert_mutable_gameweek(uuid)",
    label: "the manager mutability check (deadline and open status)",
    file: "20260720141854_fantasy_api_security.sql",
    header: /create or replace function app_private\.fantasy_assert_mutable_gameweek\(/,
    newHeader: /create or replace function app_private\.fantasy_assert_mutable_gameweek\(/,
  },
  {
    signature: "api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)",
    label: "the creation of a squad",
    file: "20260926003100_ordinary_account_mfa_step_up.sql",
    header: /create or replace function api\.create_fantasy_team\(/,
    newHeader: /create or replace function api\.create_fantasy_team\(/,
  },
];

/** Existing functions the update relies on and does not change: reviewed, byte for byte. */
export const PINS: Pin[] = [
  {
    signature: "api.save_fantasy_lineup(uuid,uuid,jsonb,bigint,uuid)",
    label: "the lineup save (calls the check first)",
    file: "20260926003100_ordinary_account_mfa_step_up.sql",
    header: /create or replace function api\.save_fantasy_lineup\(/,
  },
  {
    signature: "api.preview_fantasy_transfers(uuid,uuid,jsonb,bigint,app.fantasy_chip_type)",
    label: "the transfer preview (calls the check)",
    file: "20260926003100_ordinary_account_mfa_step_up.sql",
    header: /create or replace function api\.preview_fantasy_transfers\(/,
  },
  {
    signature: "api.confirm_fantasy_transfers(uuid,uuid,jsonb,bigint,uuid,app.fantasy_chip_type)",
    label: "the transfer confirmation (calls the preview)",
    file: "20260926003100_ordinary_account_mfa_step_up.sql",
    header: /create or replace function api\.confirm_fantasy_transfers\(/,
  },
  {
    signature: "api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)",
    label: "the chip activation (calls the check first)",
    file: "20260926003100_ordinary_account_mfa_step_up.sql",
    header: /create or replace function api\.activate_fantasy_chip\(/,
  },
  {
    signature: "api.cancel_fantasy_chip(uuid,uuid,bigint)",
    label: "the chip cancellation (calls the check first)",
    file: "20260926003100_ordinary_account_mfa_step_up.sql",
    header: /create or replace function api\.cancel_fantasy_chip\(/,
  },
  {
    signature: "app_private.fantasy_enrolment_gameweek(uuid)",
    label: "the gameweek a new squad joins",
    file: "20260924200000_fantasy_postponement_and_enrolment.sql",
    header: /create or replace function app_private\.fantasy_enrolment_gameweek\(/,
  },
  {
    signature: "api.service_advance_fantasy_lifecycle(uuid,bigint,integer)",
    label: "the lock step (gameweek row FOR UPDATE, then the lineups)",
    file: "20260924200000_fantasy_postponement_and_enrolment.sql",
    header: /create or replace function api\.service_advance_fantasy_lifecycle\(/,
  },
];

/** Migrations the update needs recorded (the ones that define what it replaces or pins). */
export const REQUIRED_MIGRATIONS = ["20260720141854", "20260924200000", "20260926003100"];

export function pinsFromRepository() {
  return PINS.map((pin) => ({
    ...pin,
    md5: md5(bodyOf(read(`supabase/migrations/${pin.file}`), pin.header)),
  }));
}

export function replacedPins(migration: string) {
  return REPLACED.map((fn) => ({
    ...fn,
    before: md5(bodyOf(read(`supabase/migrations/${fn.file}`), fn.header)),
    after: md5(bodyOf(migration, fn.newHeader)),
  }));
}

const q = (text: string) => text.replaceAll("'", "''");

export function build(): string {
  const migration = read(MIGRATION_PATH);
  const tag = `$bg_${VERSION}_file$`;
  if (migration.includes(tag)) throw new Error("the migration contains the dollar-quote tag");
  const pins = pinsFromRepository();
  const replaced = replacedPins(migration);
  const pinValues = pins
    .map(
      (pin) =>
        `      ('${pin.signature}', '${pin.md5}', '${q(pin.label)} (${pin.file.split("_")[0]})')`,
    )
    .join(",\n");
  const beforeValues = replaced
    .map(
      (fn) =>
        `      ('${fn.signature}', '${fn.before}', '${q(fn.label)} (${fn.file.split("_")[0]})')`,
    )
    .join(",\n");
  const afterValues = replaced.map((fn) => `      ('${fn.signature}', '${fn.after}')`).join(",\n");
  const replacedList = REPLACED.map((fn) => `'${fn.signature}'`).join(", ");
  const requiredList = REQUIRED_MIGRATIONS.map((v) => `'${v}'`).join(", ");
  const sha = sha256(migration);

  return `-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration ${VERSION}_${NAME}
-- (audit finding SEC-01, second gap, 2026-10-16; ${RUNBOOK}):
-- A manager's change that passed the deadline check can no longer commit after the gameweek is locked.
-- Why: every manager write checks the deadline against the moment the call started and read the
-- gameweek without a lock, so a call that started just before the deadline could commit after the lock
-- step had locked the lineups and moved the gameweek to 'locked'. Reproduced with two sessions on the
-- real functions: a squad created that way keeps an UNLOCKED lineup in a locked gameweek, which the lock
-- step never revisits and the scoring snapshot refuses on every pass (fantasy_lineup_not_locked), so the
-- gameweek cannot be scored; a chip activated that way is applied after the lock.
-- What: app_private.fantasy_assert_mutable_gameweek (used by the lineup save, the transfers and the
-- chips) and api.create_fantasy_team now take FOR KEY SHARE on the gameweek row and check again; the lock
-- step's FOR UPDATE on that row waits for them, and a call that waited for the lock step is refused with
-- the usual fantasy_gameweek_locked. A call after the deadline is refused before any lock, as before. In a
-- read-only transaction (the transfer preview) no lock is taken. Same refusals, same codes, same deadline.
-- It replaces those two functions (same signatures, owners and grants) and writes no data. It changes no
-- table, trigger, setting, job, privilege, other function, Fantasy rule or deadline.
--
-- WHEN
--   Any time of day EXCEPT around a deadline: the script refuses while an open gameweek's deadline is
--   less than 30 minutes ahead (look first, read-only:
--     select id, sequence_number, deadline_at from app.fantasy_gameweeks where status = 'open';).
--   It needs ${REQUIRED_MIGRATIONS.join(", ")} recorded (the script checks). The statements need well
--   under a second.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   It replaces two function definitions; it takes no table lock and writes no Fantasy row. The only
--   scheduled writer that runs the code around them is the Fantasy lifecycle (the lock step at the
--   deadline), so the script STOPS, before writing anything, unless it is paused:
--   * the Fantasy lifecycle tick and, with it, the Fantasy worker tick (fantasy-lifecycle-tick,
--     fantasy-worker-tick). First look at
--     select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
--     then pause: select app_private.fantasy_automation_configure(false);
--     Pausing does not stop a pass already started: it keeps its lease for at most about eight minutes,
--     so wait until select holder, expires_at, released_at from app_private.fantasy_worker_lease;
--     shows released_at set or expires_at in the past (the script checks this too).
--   Not needed, and why: managers' own saves, transfers, chips and new squads are ordinary traffic and
--   keep working throughout (each call runs the old or the new definition whole; the swap is atomic at
--   commit). The live refresh, the e-mail, push, account-deletion, Manager Card, Trophées, Rivaux,
--   Pépites, news and prediction jobs do not call these two functions. Still make sure no other schema
--   change (another apply script, a migration, a deploy) is running right now.
--   Restore AFTER the commit, and only if it was on: select app_private.fantasy_automation_configure(true);
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query. Pause the Fantasy lifecycle tick first.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line \`rollback;\` near the bottom to \`commit;\` and press Run again. The result
--      row should say "Applied". Then restore the tick (above).
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--   To take it back: ship a forward migration that restores the two definitions it replaces
--   (${RUNBOOK}, "Rolling back"). Never edit this migration.
--
-- WHAT IT DOES
--   * refuses to run twice (history row, or the new definitions already there), before the migrations
--     above are recorded, while the Fantasy lifecycle tick is on or the Fantasy worker holds its lease,
--     less than 30 minutes before an open gameweek's deadline, where either function it replaces is
--     not byte for byte the repository's latest definition (md5 of its source), and where any of the
--     seven functions it relies on is not: the lineup save, the transfer preview and confirmation, the
--     chip activation and cancellation, the enrolment gameweek and the lock step;
--   * records the migration file in supabase_migrations.schema_migrations, whole as statements[1]
--     (the form the migration promoter and the other apply scripts use), and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: the two functions are the reviewed new text, security
--     definer with an empty search path, VOLATILE, with the owner and grants they had; the seven functions
--     and every other function of the api and app_private schemas are as they were; the cron job list did
--     not move; the history row is there.
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
  if to_regclass('app.fantasy_gameweeks') is null
    or to_regclass('app_private.fantasy_automation_settings') is null then
    raise exception 'stop: the database is missing the Fantasy tables this update needs';
  end if;

  -- The Fantasy lifecycle is paused (AGENTS.md) and no pass holds the worker lease.
  if exists (select 1 from app_private.fantasy_automation_settings s where s.lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first: select app_private.fantasy_automation_configure(false); (see the header)';
  end if;
  if to_regclass('app_private.fantasy_worker_lease') is not null
    and exists (select 1 from app_private.fantasy_worker_lease l
                where l.released_at is null and l.expires_at > statement_timestamp()) then
    raise exception 'stop: the Fantasy worker holds its lease -- wait until released_at is set or expires_at has passed (see the header)';
  end if;
  -- Not around a deadline.
  if exists (select 1 from app.fantasy_gameweeks g
             where g.status = 'open' and g.deadline_at > statement_timestamp()
               and g.deadline_at < statement_timestamp() + interval '30 minutes') then
    raise exception 'stop: an open gameweek''s deadline is less than 30 minutes away -- run this after it has been locked';
  end if;

  -- The two functions it replaces are the repository's latest definitions (not yet replaced).
  for fn in
    select * from (values
${beforeValues}
    ) v(sig, md5_src, label)
  loop
    select p.prosrc into src from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if src is null then
      raise exception 'stop: % does not exist (%)', fn.sig, fn.label;
    end if;
    if md5(src) <> fn.md5_src then
      raise exception 'stop: % is not the reviewed one this update replaces (md5 %, expected %) -- % -- was it changed, or is the deadline lock already there?', fn.sig, md5(src), fn.md5_src, fn.label;
    end if;
  end loop;

  -- The functions this update relies on and does not change are the reviewed ones.
  for fn in
    select * from (values
${pinValues}
    ) v(sig, md5_src, label)
  loop
    select p.prosrc into src from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if src is null then
      raise exception 'stop: % does not exist (%)', fn.sig, fn.label;
    end if;
    if md5(src) <> fn.md5_src then
      raise exception 'stop: % is not the reviewed one (md5 %, expected %) -- %', fn.sig, md5(src), fn.md5_src, fn.label;
    end if;
  end loop;

  -- Baseline, to compare after: what must not move.
  perform set_config('bg.fdl_other_functions_before',
    (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.provolatile::text
                                    || ':' || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text), ''))
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('api', 'app_private')
       and p.oid not in (select to_regprocedure(v.sig) from unnest(array[${replacedList}]) v(sig))), true);
  perform set_config('bg.fdl_replaced_acl_before',
    (select string_agg(p.oid::regprocedure::text || ':' || pg_catalog.pg_get_userbyid(p.proowner) || ':'
                       || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text)
     from pg_catalog.pg_proc p
     where p.oid in (select to_regprocedure(v.sig) from unnest(array[${replacedList}]) v(sig))), true);
  perform set_config('bg.fdl_cron_jobs_before',
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
begin
  -- The two functions: the reviewed new text, security definer, empty search path, VOLATILE.
  for fn in
    select * from (values
${afterValues}
    ) v(sig, md5_src)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, l.lanname
      into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      problems := problems || (fn.sig || ' is missing');
    elsif md5(def.prosrc) <> fn.md5_src or not def.prosecdef or def.provolatile <> 'v'
      or def.lanname <> 'plpgsql' or def.proconfig is distinct from array['search_path=""'] then
      problems := problems || (fn.sig || ' is not the reviewed text, or is not a VOLATILE security definer function with an empty search_path');
    end if;
  end loop;

  -- Same owner and grants as before (create or replace keeps them).
  if (select string_agg(p.oid::regprocedure::text || ':' || pg_catalog.pg_get_userbyid(p.proowner) || ':'
                        || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text)
      from pg_catalog.pg_proc p
      where p.oid in (select to_regprocedure(v.sig) from unnest(array[${replacedList}]) v(sig)))
    is distinct from current_setting('bg.fdl_replaced_acl_before', true) then
    problems := problems || 'the owner or the grants of a replaced function changed'::text;
  end if;
  if has_function_privilege('anon', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'app_private.fantasy_assert_mutable_gameweek(uuid)', 'execute')
    or has_function_privilege('service_role', 'app_private.fantasy_assert_mutable_gameweek(uuid)', 'execute') then
    problems := problems || 'an API role can call what it must not'::text;
  end if;

  -- Nothing else moved.
  if (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.provolatile::text
                                     || ':' || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text), ''))
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('api', 'app_private')
        and p.oid not in (select to_regprocedure(v.sig) from unnest(array[${replacedList}]) v(sig)))
    is distinct from current_setting('bg.fdl_other_functions_before', true) then
    problems := problems || 'another function of the api or app_private schema changed'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.fdl_cron_jobs_before', true) then
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
    then 'Applied. A lineup save, a transfer, a chip or a new squad that passed the deadline check now holds the gameweek row until it commits, so it cannot land after the lock. Restore the tick if it was on: select app_private.fantasy_automation_configure(true);'
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
