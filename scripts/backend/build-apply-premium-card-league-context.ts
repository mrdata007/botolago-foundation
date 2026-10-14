/**
 * Builds scripts/backend/apply-20261014150000-premium-card-league-context.sql: the guarded
 * script the owner pastes in the Supabase SQL editor to install the BotolaGO+ league context
 * read (migration 20261014150000), first on staging (srdrflfrfpwixsllveid), then on production
 * (tkewgajrljbwgwedqsxn), AFTER the premium card reads
 * (apply-20261013100400-premium-card-reads.sql).
 *
 *   bun scripts/backend/build-apply-premium-card-league-context.ts          # rewrite the script
 *   bun scripts/backend/build-apply-premium-card-league-context.ts --check  # exit 1 if it drifted
 *
 * The script carries the migration file byte for byte, once, with its sha256;
 * apply-premium-card-league-context-script.test.ts fails when the committed script differs from
 * what this file builds from the file in supabase/migrations. Rerun this after the migration file
 * changes (only while it is unapplied everywhere: CLAUDE.md, "Migrations").
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const SCRIPT_PATH = "scripts/backend/apply-20261014150000-premium-card-league-context.sql";

export const MIGRATIONS = [
  { version: "20261014150000", name: "premium_card_league_context" },
] as const;

/** What this builds on: the membership foundation, the Manager Card reads and the premium card reads. */
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

export function build(): string {
  const file = { ...MIGRATIONS[0], text: migrationText(MIGRATIONS[0].version, MIGRATIONS[0].name) };
  if (file.text.includes(`$bg_${file.version}_file$`)) {
    throw new Error(`${file.version}: the file contains its own quoting tag`);
  }
  const needed = PREREQUISITES.map((v) => `'${v}'`).join(", ");

  return `-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply the BotolaGO+ league context read, migration ${file.version}
-- (docs/plans/BOTOLAGO_PLUS_PLAN.md sections 2a and 2b): the figures behind the
-- member analytics screens that set a member (and a rival) against their private
-- league: api.get_card_league_context.
--
-- It adds ONE api function and TWO helper functions in app_private (no grant). It
-- adds NO table, no column, no job and no row, and it REPLACES NOTHING: the career
-- and duel reads (api.get_my_card_career, api.get_card_duel) and every other
-- function stay exactly as they are -- the script checks that. The read is display
-- only, members only, and writes nothing.
--
-- IT SHIPS OFF. While app_private.premium_settings.mode is 'off' (or the Manager
-- Card reads are off) the read answers {"available": false}. The privacy switch
-- for the card history (app.card_history_visibility) is unchanged: the rival's
-- week-by-week figures are shown only when they switched it on.
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
--     the database.
--   * Nothing needs pausing: the script only creates functions and replaces none,
--     and the read it adds writes nothing. It is not a new writer.
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every
--      guard and every check runs on the real code path inside one transaction,
--      and the script ends with a deliberate error whose message carries the
--      state it computed ("REHEARSAL PASSED -- nothing was saved: {...}"). That
--      error is the expected, good outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regprocedure('api.get_card_league_context(uuid,text,uuid)') is null as rolled_back;
--      It must say true.
--   4. In the line \`select set_config('bg.league_context_mode', 'rehearsal', true);\`
--      near the top, change 'rehearsal' to 'apply' and press Run again. The
--      result row says "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects exist, or where the
--     migrations it builds on (the Manager Card reads, the BotolaGO+ foundation
--     20261013100000 to 20261013100300 and the premium card reads 20261013100400)
--     are not recorded;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the three functions' grants,
--     security definer with an empty search_path, STABLE; the read answering
--     "off" while BotolaGO+ is off; the definitions of the career and duel reads
--     and of the privacy switch unchanged; no table, no job and no row added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.league_context_mode', 'rehearsal', true);

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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '${file.version}') then
    raise exception 'stop: ${file.version} is already recorded as applied';
  end if;
  foreach needed in array array[${needed}] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet: %', missing;
  end if;
  foreach needed in array array[
    'app.profiles', 'app.fantasy_teams', 'app.fantasy_leagues', 'app.fantasy_league_memberships',
    'app.fantasy_team_gameweek_results', 'app.manager_card_gameweeks', 'app.manager_card_seasons',
    'app.card_history_visibility', 'app_private.premium_settings', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.manager_card_active_rules()', 'app_private.manager_card_fantasy_season()',
    'app_private.manager_card_season_label(uuid)', 'app_private.card_reads_mode()',
    'app_private.card_resolve_season(text)', 'app_private.card_week_rows(uuid,uuid)',
    'app_private.card_captain_rows(uuid,uuid)', 'app_private.card_transfer_rows(uuid,uuid)',
    'api.get_my_card_career(text)', 'api.get_card_duel(uuid,text)',
    'api.set_card_history_visibility(boolean)', 'api.get_my_card_history_visibility()'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname = 'get_card_league_context')
      or (n.nspname = 'app_private' and p.proname in ('card_league_members', 'card_league_context'))) then
    raise exception 'stop: one of the league context functions already exists';
  end if;
  -- This adds no job, no table and replaces nothing: remember what is there, compare afterwards.
  perform set_config('bg.league_context_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.league_context_tables', (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text, true);
  perform set_config('bg.league_context_defs', (select string_agg(
      p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (
      'api.get_my_card_career(text)'::regprocedure, 'api.get_card_duel(uuid,text)'::regprocedure,
      'api.set_card_history_visibility(boolean)'::regprocedure,
      'api.get_my_card_history_visibility()'::regprocedure,
      'app_private.card_week_rows(uuid,uuid)'::regprocedure,
      'app_private.card_captain_rows(uuid,uuid)'::regprocedure,
      'app_private.card_transfer_rows(uuid,uuid)'::regprocedure)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '${file.version}',
  '${file.name}',
  array[$bg_${file.version}_file$${file.text}$bg_${file.version}_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_${file.version} text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '${file.version}'
  );
begin
  if encode(sha256(convert_to(part_${file.version}, 'UTF8')), 'hex')
    is distinct from '${sha256(file.text)}' then
    raise exception 'stop: ${file.version} is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_${file.version};
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own) and keep what was
-- computed in a session setting, so the result row can show it after the rollback
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  who text;
  sig text := 'api.get_card_league_context(uuid,text,uuid)';
  rec record;
  premium_mode text;
  answer jsonb;
  state jsonb;
begin
  -- The api function: who may run it, how it runs, that it cannot write.
  if to_regprocedure(sig) is null then
    problems := problems || (sig || ' is missing');
  else
    foreach who in array array['authenticated', 'service_role'] loop
      if not has_function_privilege(who, to_regprocedure(sig), 'execute') then
        problems := problems || (who || ' cannot run ' || sig);
      end if;
    end loop;
    foreach who in array array['anon', 'public'] loop
      if has_function_privilege(who, to_regprocedure(sig), 'execute') then
        problems := problems || (who || ' can run ' || sig);
      end if;
    end loop;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = 's'
      from pg_proc p where p.oid = to_regprocedure(sig)) then
      problems := problems || (sig || ' is not STABLE security definer with an empty search_path');
    end if;
  end if;

  -- Helpers: no API role, stable, empty search_path.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid, p.provolatile, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname in ('card_league_members', 'card_league_context')
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
    if rec.provolatile <> 's' or not (rec.proconfig @> array['search_path=""']) then
      problems := problems || (rec.signature || ' is not STABLE with an empty search_path');
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private' and p.proname in ('card_league_members', 'card_league_context')) <> 2 then
    problems := problems || 'the two helpers are not both there'::text;
  end if;

  -- Replaces nothing: the career, duel, switch and the three card helpers are as they were.
  if (select string_agg(
        p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
      from pg_proc p where p.oid in (
        'api.get_my_card_career(text)'::regprocedure, 'api.get_card_duel(uuid,text)'::regprocedure,
        'api.set_card_history_visibility(boolean)'::regprocedure,
        'api.get_my_card_history_visibility()'::regprocedure,
        'app_private.card_week_rows(uuid,uuid)'::regprocedure,
        'app_private.card_captain_rows(uuid,uuid)'::regprocedure,
        'app_private.card_transfer_rows(uuid,uuid)'::regprocedure))
    is distinct from current_setting('bg.league_context_defs', true) then
    problems := problems || 'an existing premium card read changed -- this script replaces none'::text;
  end if;

  -- Off means off (checked only while BotolaGO+ is off; if it is already on the
  -- read cannot be called here without a signed-in user).
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    answer := api.get_card_league_context();
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the read does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
  end if;

  -- No job and no table was added, and the history row is there.
  if (select count(*) from cron.job)::text is distinct from current_setting('bg.league_context_jobs', true) then
    problems := problems || 'the number of scheduled jobs changed -- this script adds none'::text;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text
    is distinct from current_setting('bg.league_context_tables', true) then
    problems := problems || 'the number of tables changed -- this script adds none'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version = '${file.version}') <> 1 then
    problems := problems || 'the history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'apiFunctions', 1,
    'helpers', 2,
    'readWhileOff', case when premium_mode = 'off' then answer end,
    'historyRows', 1
  );
  perform set_config('bg.league_context_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.league_context_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.league_context_state', true);
  end if;
  raise notice 'premium card league context: applying: %', current_setting('bg.league_context_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${file.version}')
    then 'Applied. The league context read is in place and OFF while BotolaGO+ is off. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
`;
}

if (import.meta.main) {
  const target = join(root, SCRIPT_PATH);
  const built = build();
  if (process.argv.includes("--check")) {
    const current = readFileSync(target, "utf8");
    if (current !== built) {
      console.error(`${SCRIPT_PATH} differs from what this builder produces; rerun it.`);
      process.exit(1);
    }
    console.log(`${SCRIPT_PATH} is up to date.`);
  } else {
    writeFileSync(target, built);
    console.log(`Wrote ${SCRIPT_PATH}.`);
  }
}
