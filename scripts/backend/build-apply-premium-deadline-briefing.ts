/**
 * Builds scripts/backend/apply-20261015140000-premium-deadline-briefing.sql: the guarded script
 * the owner pastes in the Supabase SQL editor to install the BotolaGO+ deadline briefing reads
 * (migration 20261015140000), first on staging (srdrflfrfpwixsllveid), then on production
 * (tkewgajrljbwgwedqsxn).
 *
 *   bun scripts/backend/build-apply-premium-deadline-briefing.ts          # rewrite the script
 *   bun scripts/backend/build-apply-premium-deadline-briefing.ts --check  # exit 1 if it drifted
 *
 * The script carries the migration file byte for byte, once, with its sha256;
 * apply-premium-deadline-briefing-script.test.ts fails when the committed script differs from what
 * this file builds from the file in supabase/migrations. Rerun this after the migration file
 * changes (only while it is unapplied everywhere: CLAUDE.md, "Migrations").
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const SCRIPT_PATH = "scripts/backend/apply-20261015140000-premium-deadline-briefing.sql";

export const MIGRATIONS = [
  { version: "20261015140000", name: "premium_deadline_briefing" },
] as const;

/**
 * What this builds on: the football match details (the provider's absences), the BotolaGO+
 * foundation and the premium card reads (the mode and the membership check), and the Fantasy
 * rating points (the rule that decides whether a 5 can be a missing rating).
 */
export const PREREQUISITES = [
  "20260925141500",
  "20261013100000",
  "20261013100100",
  "20261013100200",
  "20261013100300",
  "20261013100400",
  "20261014090000",
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
-- Apply the BotolaGO+ deadline briefing reads, migration ${file.version}
-- (docs/product/botolago-plus-deadline-briefing-brief.md): the two member reads behind the
-- « Briefing avant la deadline » screen: api.get_my_deadline_briefing and
-- api.get_my_briefing_alternatives.
--
-- It adds TWO api functions and TWO helper functions in app_private (no grant). It adds NO
-- table, no column, no job and no row, and it REPLACES NOTHING: every function it reads
-- (Fantasy team, difficulty, history, the BotolaGO+ membership checks) stays exactly as it is --
-- the script checks that. Both reads are STABLE, members only, and write nothing.
--
-- IT SHIPS OFF. While app_private.premium_settings.mode is 'off' both reads answer
-- {"available": false}. Nothing is stored about a reader's visits: « Depuis votre visite » lives
-- on the reader's device.
--
-- WHEN
--   After the premium card reads are applied on this database
--   (scripts/backend/apply-20261013100400-premium-card-reads.sql) and the Fantasy rating points
--   (20261014090000), after the pull request that adds this file is merged and its
--   database-quality job passed. Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run in progress, no
--     other query running, no other agent or workflow working on the database.
--   * Nothing needs pausing: the script only creates functions and replaces none, and the reads
--     it adds write nothing. It is not a new writer, and it adds no scheduled job.
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every guard and every
--      check runs on the real code path inside one transaction, and the script ends with a
--      deliberate error whose message carries the state it computed
--      ("REHEARSAL PASSED -- nothing was saved: {...}"). That error is the expected, good
--      outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regprocedure('api.get_my_deadline_briefing(uuid)') is null as rolled_back;
--      It must say true.
--   4. In the line \`select set_config('bg.deadline_briefing_mode', 'rehearsal', true);\` near the
--      top, change 'rehearsal' to 'apply' and press Run again. The result row says "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do
--   not edit a check to make it pass: a check firing means the database is not in the state
--   this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects exist, or where the migrations it builds
--     on are not recorded;
--   * records the migration file in supabase_migrations.schema_migrations, whole as
--     statements[1], and runs it from that record once its sha256 matches the repository file;
--   * checks the result without saving anything: the grants of the two reads (authenticated and
--     service_role only), security definer with an empty search_path, STABLE; the helpers with
--     no grant; both reads answering "off" while BotolaGO+ is off; the definitions of the
--     functions they read unchanged; no table, no job and no row added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.deadline_briefing_mode', 'rehearsal', true);

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
    'app.fantasy_teams', 'app.fantasy_gameweeks', 'app.fantasy_players', 'app.fantasy_positions',
    'app.fantasy_squad_memberships', 'app.fantasy_lineups', 'app.fantasy_lineup_players',
    'app.fantasy_player_gameweek_points', 'app.fantasy_fixture_assignments', 'app.fantasy_rankings',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.fantasy_rulesets',
    'app.fixture_absences', 'app.player_availability', 'app.players', 'app.teams',
    'app_private.premium_settings', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.card_premium_mode()', 'app_private.fantasy_rating_scoring_enabled(uuid)',
    'api.fantasy_fixture_difficulty(uuid,integer,integer)', 'api.get_my_fantasy_team(uuid)',
    'api.fantasy_player_gameweek_history(uuid)', 'api.fantasy_player_pool(uuid,text,uuid,numeric,text,numeric,uuid,integer)'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in ('get_my_deadline_briefing', 'get_my_briefing_alternatives'))
      or (n.nspname = 'app_private' and p.proname in ('briefing_membership', 'briefing_form'))) then
    raise exception 'stop: one of the deadline briefing functions already exists';
  end if;
  -- This adds no job, no table and replaces nothing: remember what is there, compare afterwards.
  perform set_config('bg.deadline_briefing_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.deadline_briefing_tables', (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text, true);
  perform set_config('bg.deadline_briefing_defs', (select string_agg(
      p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (
      'app_private.has_premium(uuid,timestamptz)'::regprocedure,
      'app_private.card_premium_mode()'::regprocedure,
      'app_private.fantasy_rating_scoring_enabled(uuid)'::regprocedure,
      'api.fantasy_fixture_difficulty(uuid,integer,integer)'::regprocedure,
      'api.get_my_fantasy_team(uuid)'::regprocedure,
      'api.fantasy_player_gameweek_history(uuid)'::regprocedure)), true);
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
  sig text;
  rec record;
  premium_mode text;
  answer jsonb;
  answer_alt jsonb;
  state jsonb;
begin
  -- The two api functions: who may run them, how they run, that they cannot write.
  foreach sig in array array['api.get_my_deadline_briefing(uuid)', 'api.get_my_briefing_alternatives(uuid,integer)'] loop
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
  end loop;

  -- Helpers: no API role, stable, empty search_path.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid, p.provolatile, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname in ('briefing_membership', 'briefing_form')
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
      where n.nspname = 'app_private' and p.proname in ('briefing_membership', 'briefing_form')) <> 2 then
    problems := problems || 'the two helpers are not both there'::text;
  end if;

  -- Replaces nothing: what the reads build on is as it was.
  if (select string_agg(
        p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
      from pg_proc p where p.oid in (
        'app_private.has_premium(uuid,timestamptz)'::regprocedure,
        'app_private.card_premium_mode()'::regprocedure,
        'app_private.fantasy_rating_scoring_enabled(uuid)'::regprocedure,
        'api.fantasy_fixture_difficulty(uuid,integer,integer)'::regprocedure,
        'api.get_my_fantasy_team(uuid)'::regprocedure,
        'api.fantasy_player_gameweek_history(uuid)'::regprocedure))
    is distinct from current_setting('bg.deadline_briefing_defs', true) then
    problems := problems || 'an existing function changed -- this script replaces none'::text;
  end if;

  -- Off means off (checked only while BotolaGO+ is off; if it is already on the reads cannot be
  -- called here without a signed-in user).
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    answer := api.get_my_deadline_briefing();
    answer_alt := api.get_my_briefing_alternatives('00000000-0000-0000-0000-000000000000'::uuid);
    if answer is distinct from '{"available": false}'::jsonb
      or answer_alt is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the reads do not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing') || ' / ' || coalesce(answer_alt::text, 'nothing'));
    end if;
  end if;

  -- No job and no table was added, and the history row is there.
  if (select count(*) from cron.job)::text is distinct from current_setting('bg.deadline_briefing_jobs', true) then
    problems := problems || 'the number of scheduled jobs changed -- this script adds none'::text;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text
    is distinct from current_setting('bg.deadline_briefing_tables', true) then
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
    'apiFunctions', 2,
    'helpers', 2,
    'readsWhileOff', case when premium_mode = 'off' then jsonb_build_array(answer, answer_alt) end,
    'historyRows', 1
  );
  perform set_config('bg.deadline_briefing_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.deadline_briefing_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.deadline_briefing_state', true);
  end if;
  raise notice 'premium deadline briefing: applying: %', current_setting('bg.deadline_briefing_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${file.version}')
    then 'Applied. The deadline briefing reads are in place and OFF while BotolaGO+ is off. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
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
