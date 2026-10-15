/**
 * Builds the two guarded scripts the owner pastes in the Supabase SQL editor to install BotolaGO+
 * Rivaux (pinned rivals, the head-to-head read, the optional lead-change notification), first on
 * staging (srdrflfrfpwixsllveid), then on production (tkewgajrljbwgwedqsxn), AFTER the premium card
 * reads (apply-20261013100400-premium-card-reads.sql):
 *
 *   scripts/backend/apply-20261015130000-rivals-notification-type.sql   one enum value, alone
 *   scripts/backend/apply-20261015130100-rivals.sql                     tables, functions, text, tick, jobs
 *
 * Run the first, let it commit, then the second (a new enum value cannot be used in the transaction
 * that adds it).
 *
 *   bun scripts/backend/build-apply-premium-rivals.ts          # rewrite both scripts
 *   bun scripts/backend/build-apply-premium-rivals.ts --check  # exit 1 if either drifted
 *
 * Each script carries its migration files byte for byte, once, with their sha256;
 * apply-premium-rivals-script.test.ts fails when a committed script differs from what this file
 * builds from supabase/migrations. Rerun this after a migration file changes (only while it is
 * unapplied everywhere: CLAUDE.md, "Migrations").
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");

export const TYPE_SCRIPT_PATH = "scripts/backend/apply-20261015130000-rivals-notification-type.sql";
export const MAIN_SCRIPT_PATH = "scripts/backend/apply-20261015130100-rivals.sql";

export const TYPE_MIGRATIONS = [
  { version: "20261015130000", name: "rivals_notification_type" },
] as const;
export const MAIN_MIGRATIONS = [
  { version: "20261015130100", name: "rivals" },
  { version: "20261015130200", name: "rivals_tick" },
] as const;

/** What both scripts build on: the membership foundation and the premium card reads. */
export const PREREQUISITES = [
  "20261008123300",
  "20261010120200",
  "20261012200100",
  "20261013100000",
  "20261013100100",
  "20261013100200",
  "20261013100300",
  "20261013100400",
] as const;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const migrationText = (version: string, name: string) =>
  readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");

function files(list: readonly { version: string; name: string }[]) {
  return list.map((m) => {
    const text = migrationText(m.version, m.name);
    if (text.includes(`$bg_${m.version}_file$`)) {
      throw new Error(`${m.version}: the file contains its own quoting tag`);
    }
    return { ...m, text };
  });
}

const prereqList = PREREQUISITES.map((v) => `'${v}'`).join(", ");

/** The history inserts and the byte-for-byte runs, one pair per migration, in order. */
function carry(list: ReturnType<typeof files>): string {
  const inserts = list
    .map(
      (f) => `insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '${f.version}',
  '${f.name}',
  array[$bg_${f.version}_file$${f.text}$bg_${f.version}_file$]
);
`,
    )
    .join("\n");
  const declares = list
    .map(
      (f) => `  part_${f.version} text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '${f.version}'
  );`,
    )
    .join("\n");
  const runs = list
    .map(
      (f) => `  if encode(sha256(convert_to(part_${f.version}, 'UTF8')), 'hex')
    is distinct from '${sha256(f.text)}' then
    raise exception 'stop: ${f.version} is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_${f.version};
`,
    )
    .join("\n");
  return `-- ---------------------------------------------------------------------------
-- The migration file(s), exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
${inserts}
-- ---------------------------------------------------------------------------
-- Run them from the history, once each is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
${declares}
begin
${runs}end
$apply$;
`;
}

const RUN_BLOCK = (mode: string, probe: string) => `-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every
--      guard and every check runs on the real code path inside one transaction,
--      and the script ends with a deliberate error whose message carries the
--      state it computed ("REHEARSAL PASSED -- nothing was saved: {...}"). That
--      error is the expected, good outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        ${probe}
--      It must say true.
--   4. In the line \`select set_config('${mode}', 'rehearsal', true);\`
--      near the top, change 'rehearsal' to 'apply' and press Run again. The
--      result row says "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.`;

const FINISH = (
  mode: string,
  state: string,
  label: string,
  applied: string,
  version: string,
) => `-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('${mode}', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('${state}', true);
  end if;
  raise notice '${label}: applying: %', current_setting('${state}', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${version}')
    then '${applied}'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
`;

export function buildType(): string {
  const list = files(TYPE_MIGRATIONS);
  const v = list[0]!.version;
  return `-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Rivaux, step 1 of 2: migration ${v}, ONE new value, rival_lead_change, in the
-- notification types (app.notification_type). It is the type of "your rival now
-- leads you / you now lead your rival". It is added on its own because a new enum
-- value cannot be used in the transaction that adds it: step 2
-- (apply-20261015130100-rivals.sql) uses it, and is run AFTER this one has saved.
--
-- It changes one enum and nothing reads the new value yet, so nothing a reader can
-- see changes and no writer has to be paused for it. It adds no table, no function,
-- no job and no row.
--
-- WHEN
--   After the premium card reads are applied on this database
--   (scripts/backend/apply-20261013100400-premium-card-reads.sql), after the pull
--   request that adds this file is merged and its database-quality job passed.
--   Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run
--     in progress, no other query running, no other agent or workflow working on
--     the database. Altering an enum takes a short lock on the type.
--
${RUN_BLOCK("bg.rivals_type_mode", "select not exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype and e.enumlabel = 'rival_lead_change') as rolled_back;")}
--
-- WHAT IT DOES
--   * refuses to run twice, or where the notification types are missing;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the value is in the list exactly
--     once, last, and every earlier value is still there in the same order.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.rivals_type_mode', 'rehearsal', true);

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '${v}') then
    raise exception 'stop: ${v} is already recorded as applied';
  end if;
  if to_regtype('app.notification_type') is null then
    raise exception 'stop: the notification types (app.notification_type) are missing';
  end if;
  if exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype
      and e.enumlabel = 'rival_lead_change') then
    raise exception 'stop: app.notification_type already has the value rival_lead_change';
  end if;
  perform set_config('bg.rivals_type_labels', (select string_agg(e.enumlabel::text, ',' order by e.enumsortorder)
    from pg_enum e where e.enumtypid = 'app.notification_type'::regtype), true);
  perform set_config('bg.rivals_type_tables', (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text, true);
end
$preflight$;

${carry(list)}
-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  labels text;
begin
  select string_agg(e.enumlabel::text, ',' order by e.enumsortorder) into labels
  from pg_enum e where e.enumtypid = 'app.notification_type'::regtype;
  if labels is distinct from current_setting('bg.rivals_type_labels', true) || ',rival_lead_change' then
    problems := problems || 'the type list is not the earlier list plus rival_lead_change, last'::text;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text
    is distinct from current_setting('bg.rivals_type_tables', true) then
    problems := problems || 'the number of tables changed -- this script adds none'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version = '${v}') <> 1 then
    problems := problems || 'the history row is missing'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  perform set_config('bg.rivals_type_state', jsonb_build_object('value', 'rival_lead_change',
    'valuesBefore', cardinality(string_to_array(current_setting('bg.rivals_type_labels', true), ',')),
    'valuesAfter', cardinality(string_to_array(labels, ',')))::text, true);
end
$postflight$;

${FINISH("bg.rivals_type_mode", "bg.rivals_type_state", "rivals notification type", "Applied. rival_lead_change is a notification type. Next: apply-20261015130100-rivals.sql.", v)}`;
}

const API_FUNCTIONS = [
  ["get_my_rivals", "text", "s"],
  ["get_rival_candidates", "text", "s"],
  ["pin_rival", "uuid,text", "v"],
  ["unpin_rival", "uuid,text", "v"],
  ["set_rivals_notify", "boolean", "v"],
] as const;
const HELPERS = [
  "rivals_configure",
  "rivals_leader",
  "rivals_shared_league",
  "rivals_pair",
  "rivals_card",
  "rivals_gate",
  "rivals_season",
  "rivals_tick",
] as const;
const NEW_TABLES = [
  "app.pinned_rivals",
  "app.rival_preferences",
  "app_private.rivals_settings",
  "app_private.rival_lead_notices",
] as const;
/** Existing functions this must leave exactly as they are. */
const UNTOUCHED = [
  "api.get_my_card_career(text)",
  "api.get_card_duel(uuid,text)",
  "api.get_card_league_context(uuid,text,uuid)",
  "api.set_card_history_visibility(boolean)",
  "api.get_my_card_history_visibility()",
  "app_private.card_week_rows(uuid,uuid)",
  "app_private.card_captain_rows(uuid,uuid)",
  "app_private.card_transfer_rows(uuid,uuid)",
  "app_private.card_evaluable_gameweeks(uuid)",
  "app_private.has_premium(uuid,timestamptz)",
  "app_private.render_notification_template(text,text[],jsonb)",
  "app_private.defer_for_quiet_hours(timestamptz,text,boolean,time without time zone,time without time zone,boolean)",
] as const;
const untouchedSql = UNTOUCHED.map((s) => `'${s}'::regprocedure`).join(",\n      ");

export function buildMain(): string {
  const list = files(MAIN_MIGRATIONS);
  const v = list[0]!.version;
  const last = list[list.length - 1]!.version;
  const apiRows = API_FUNCTIONS.map(([n, a, vol]) => `    ('${n}', '${a}', '${vol}')`).join(",\n");
  return `-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Rivaux, step 2 of 2: migrations ${v} and ${last}
-- (docs/product/botolago-plus-rivals-brief.md). A BotolaGO+ member pins up to three
-- friends from their private leagues and reads a head-to-head after each published
-- journée; an optional notification (in-app and push) tells them when a published result
-- changes who leads.
--
-- IT ADDS
--   * four tables, row security forced and no grant: app.pinned_rivals,
--     app.rival_preferences, app_private.rivals_settings (one row, the tick's
--     switch, OFF) and app_private.rival_lead_notices;
--   * five api functions (get_my_rivals, get_rival_candidates, pin_rival,
--     unpin_rival, set_rivals_notify) for authenticated only, and eight
--     helpers in app_private with no API grant (the switch and the tick for
--     postgres only);
--   * eight notification texts (French and Arabic) of the type added by step 1;
--   * TWO pg_cron jobs: rivals-tick (minutes 7, 22, 37 and 52; does nothing while
--     app_private.rivals_settings.enabled is false) and rivals-history-prune (daily
--     03:59 UTC; deletes only this tick's cron.job_run_details older than 7 days and
--     its own notice records older than 365 days).
-- IT REPLACES NOTHING: the card reads, the duel, the privacy switch, the notification
-- rendering and the quiet-hours helper stay exactly as they are -- the script checks it.
--
-- IT SHIPS OFF. Every api function answers {"available": false} while BotolaGO+ or the
-- Manager Card reads are off, and the tick creates nothing until the owner runs
-- select app_private.rivals_configure(true). A friend's captain and transfers are
-- shown only when that friend switched their card history on (unchanged, default off).
--
-- WHEN
--   After step 1 (apply-20261015130000-rivals-notification-type.sql) has SAVED, after
--   the premium card reads are applied here, after the pull request that adds this
--   file is merged and its database-quality job passed. Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * This script is a writer: it creates tables, functions, rows and two scheduled
--     jobs. Make sure nothing else is writing to this database: no GitHub Actions
--     run in progress, no other query running, no other agent or workflow working
--     on the database. Nothing needs pausing: it touches no existing table or job (it replaces two
--     immutable push rules, notification_push_topic and notification_push_ttl).
--   * Production: write down that you ran it, which database, and the counts the
--     result row shows (the rehearsal prints them).
--
${RUN_BLOCK("bg.rivals_mode", "select to_regclass('app.pinned_rivals') is null as rolled_back;")}
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects exist, or where the
--     migrations it builds on (the premium foundation and card reads) or step 1
--     are not recorded;
--   * records both migration files in supabase_migrations.schema_migrations, each
--     whole as statements[1], and runs them from that record, in order, once each
--     sha256 matches the repository file;
--   * checks the result without saving anything: grants, security definer with an
--     empty search_path, volatility; row security forced on the four tables; the
--     switch off; eight texts; the two jobs; the tick answering "off"; the read
--     answering "off" while BotolaGO+ is off; the push rules knowing the new type
--     and the other existing functions unchanged;
--     exactly four tables and two jobs added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.rivals_mode', 'rehearsal', true);

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  needed text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in (${list.map((f) => `'${f.version}'`).join(", ")})) then
    raise exception 'stop: one of these migrations is already recorded as applied';
  end if;
  foreach needed in array array[${prereqList}, '${TYPE_MIGRATIONS[0].version}'] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet (step 1 included): %', missing;
  end if;
  if not exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype
      and e.enumlabel = 'rival_lead_change') then
    raise exception 'stop: app.notification_type has no rival_lead_change value -- step 1 has not saved';
  end if;
  foreach needed in array array[
    'app.profiles', 'app.fantasy_teams', 'app.fantasy_seasons', 'app.fantasy_gameweeks',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.fantasy_team_gameweek_results',
    'app.card_history_visibility', 'app.notifications', 'app.notification_deliveries',
    'app.notification_templates', 'app.user_preferences', 'app_private.notification_events',
    'app_private.premium_settings', 'app_private.fantasy_gameweek_postwork', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()', 'app_private.refuse_unverified_mfa_actor()',
    'app_private.set_updated_at()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.manager_card_fantasy_season()', 'app_private.manager_card_season_label(uuid)',
    'app_private.card_reads_mode()', 'app_private.card_resolve_season(text)',
    'app_private.card_evaluable_gameweeks(uuid)', 'app_private.card_captain_rows(uuid,uuid)',
    'app_private.card_transfer_rows(uuid,uuid)',
    'app_private.render_notification_template(text,text[],jsonb)'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in ('get_my_rivals', 'get_rival_candidates', 'pin_rival', 'unpin_rival', 'set_rivals_notify'))
      or (n.nspname = 'app_private' and p.proname like 'rivals\\_%')) then
    raise exception 'stop: one of the Rivaux functions already exists';
  end if;
  if to_regclass('app.pinned_rivals') is not null or to_regclass('app.rival_preferences') is not null
    or to_regclass('app_private.rivals_settings') is not null or to_regclass('app_private.rival_lead_notices') is not null then
    raise exception 'stop: one of the Rivaux tables already exists';
  end if;
  if exists (select 1 from cron.job where jobname in ('rivals-tick', 'rivals-history-prune')) then
    raise exception 'stop: a Rivaux scheduled job already exists';
  end if;
  -- The push rules this replaces must be the ones of 20261012200100 (the rating change known, the
  -- new type not yet).
  if app_private.notification_push_topic('manager_card_ovr_change') is distinct from 'fantasy'
    or app_private.notification_push_ttl('manager_card_ovr_change') is distinct from interval '12 hours'
    or app_private.notification_push_topic('rival_lead_change') is not null then
    raise exception 'stop: the push rules are not the ones this script replaces (20261012200100 missing, or already replaced)';
  end if;
  -- Remember what is there, compare afterwards.
  perform set_config('bg.rivals_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.rivals_tables', (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text, true);
  perform set_config('bg.rivals_defs', (select string_agg(
      p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (
      ${untouchedSql})), true);
end
$preflight$;

${carry(list)}
-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own) and keep what was
-- computed in a session setting, so the result row can show it after the rollback
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  who text;
  rec record;
  premium_mode text;
  answer jsonb;
  tick jsonb;
  state jsonb;
begin
  -- The api functions: who may run them, how, volatility, one signature each.
  for rec in
    select * from (values
${apiRows}
    ) as f(name, args, vol)
  loop
    if to_regprocedure('api.' || rec.name || '(' || rec.args || ')') is null then
      problems := problems || ('api.' || rec.name || ' is missing');
      continue;
    end if;
    if not has_function_privilege('authenticated', to_regprocedure('api.' || rec.name || '(' || rec.args || ')'), 'execute') then
      problems := problems || ('authenticated cannot run api.' || rec.name);
    end if;
    foreach who in array array['anon', 'service_role', 'public'] loop
      if has_function_privilege(who, to_regprocedure('api.' || rec.name || '(' || rec.args || ')'), 'execute') then
        problems := problems || (who || ' can run api.' || rec.name);
      end if;
    end loop;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = rec.vol::"char"
      from pg_proc p where p.oid = to_regprocedure('api.' || rec.name || '(' || rec.args || ')')) then
      problems := problems || ('api.' || rec.name || ' is not security definer, volatility ' || rec.vol || ', empty search_path');
    end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'api' and p.proname = rec.name) <> 1 then
      problems := problems || ('api.' || rec.name || ' has more than one signature');
    end if;
  end loop;

  -- The helpers: no API role at all, empty search_path.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname in (${HELPERS.map((h) => `'${h}'`).join(", ")})
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
    if not (rec.proconfig @> array['search_path=""']) then
      problems := problems || (rec.signature || ' has no empty search_path');
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private' and p.proname in (${HELPERS.map((h) => `'${h}'`).join(", ")})) <> ${HELPERS.length} then
    problems := problems || 'the ${HELPERS.length} helpers are not all there'::text;
  end if;

  -- The four tables: row security forced, no grant to any API role; the switch is one row, off.
  for rec in
    select unnest(array[${NEW_TABLES.map((t) => `'${t}'`).join(", ")}]) as name
  loop
    if to_regclass(rec.name) is null then
      problems := problems || (rec.name || ' is missing');
    else
      if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = to_regclass(rec.name)) then
        problems := problems || (rec.name || ' does not force row security');
      end if;
      foreach who in array array['anon', 'authenticated', 'service_role'] loop
        if has_table_privilege(who, to_regclass(rec.name), 'select,insert,update,delete,truncate,references,trigger') then
          problems := problems || (who || ' has a grant on ' || rec.name);
        end if;
      end loop;
    end if;
  end loop;
  if (select count(*) from app_private.rivals_settings) <> 1
    or (select s.enabled from app_private.rivals_settings s where s.id) is distinct from false then
    problems := problems || 'the tick''s switch is not one row, off'::text;
  end if;

  -- The text: four wordings in two languages.
  if (select count(*) from app.notification_templates t
      where t.notification_type = 'rival_lead_change' and t.active and t.channel = 'in_app'
        and t.language in ('fr', 'ar')) <> 8 then
    problems := problems || 'the eight notification texts are not all there'::text;
  end if;

  -- The jobs: both there, active, the tick at its minutes.
  if (select count(*) from cron.job j where j.jobname = 'rivals-tick' and j.active
        and j.schedule = '7,22,37,52 * * * *') <> 1 then
    problems := problems || 'rivals-tick is not scheduled at 7,22,37,52 and active'::text;
  end if;
  if (select count(*) from cron.job j where j.jobname = 'rivals-history-prune' and j.active
        and j.schedule = '59 3 * * *') <> 1 then
    problems := problems || 'rivals-history-prune is not scheduled at 03:59 and active'::text;
  end if;
  if (select count(*) from cron.job)::text is distinct from (current_setting('bg.rivals_jobs', true)::integer + 2)::text then
    problems := problems || 'the number of scheduled jobs did not grow by exactly two'::text;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text
    is distinct from (current_setting('bg.rivals_tables', true)::integer + ${NEW_TABLES.length})::text then
    problems := problems || 'the number of tables did not grow by exactly ${NEW_TABLES.length}'::text;
  end if;

  -- Replaces only the two push rules, and they still answer as before for every other type.
  if app_private.notification_push_topic('rival_lead_change') is distinct from 'fantasy'
    or app_private.notification_push_ttl('rival_lead_change') is distinct from interval '12 hours'
    or app_private.notification_push_topic('manager_card_ovr_change') is distinct from 'fantasy'
    or app_private.notification_push_topic('goal') is distinct from 'match'
    or app_private.notification_push_topic('deadline_24h') is distinct from 'fantasy'
    or app_private.notification_push_topic('breaking_news') is not null
    or app_private.notification_push_ttl('goal') is distinct from interval '10 minutes'
    or app_private.notification_push_ttl('manager_card_ovr_change') is distinct from interval '12 hours'
    or app_private.notification_push_ttl('breaking_news') is distinct from interval '1 hour' then
    problems := problems || 'the push rules do not answer as expected'::text;
  end if;

  -- No other existing function changed.
  if (select string_agg(
        p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
      from pg_proc p where p.oid in (
      ${untouchedSql}))
    is distinct from current_setting('bg.rivals_defs', true) then
    problems := problems || 'an existing function changed -- this script replaces none'::text;
  end if;

  -- Off means off.
  tick := app_private.rivals_tick();
  if tick is distinct from '{"outcome": "off"}'::jsonb then
    problems := problems || ('the tick does not answer off: ' || coalesce(tick::text, 'nothing'));
  end if;
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    answer := api.get_my_rivals();
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the read does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in (${list.map((f) => `'${f.version}'`).join(", ")})) <> ${list.length} then
    problems := problems || 'a history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'apiFunctions', ${API_FUNCTIONS.length},
    'helpers', ${HELPERS.length},
    'tablesAdded', ${NEW_TABLES.length},
    'jobsAdded', 2,
    'templates', 8,
    'tick', tick,
    'readWhileOff', case when premium_mode = 'off' then answer end,
    'historyRows', ${list.length}
  );
  perform set_config('bg.rivals_state', state::text, true);
end
$postflight$;

${FINISH("bg.rivals_mode", "bg.rivals_state", "rivals", "Applied. Rivaux is in place and OFF: the reads answer off while BotolaGO+ is off, and the tick does nothing until app_private.rivals_configure(true). Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.", last)}`;
}

if (import.meta.main) {
  const targets = [
    [TYPE_SCRIPT_PATH, buildType()],
    [MAIN_SCRIPT_PATH, buildMain()],
  ] as const;
  if (process.argv.includes("--check")) {
    let drift = false;
    for (const [path, built] of targets) {
      if (readFileSync(join(root, path), "utf8") !== built) {
        console.error(`${path} differs from what this builder produces; rerun it.`);
        drift = true;
      } else console.log(`${path} is up to date.`);
    }
    if (drift) process.exit(1);
  } else {
    for (const [path, built] of targets) {
      writeFileSync(join(root, path), built);
      console.log(`Wrote ${path}.`);
    }
  }
}
