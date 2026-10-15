/**
 * Builds scripts/backend/apply-20261015150000-trophies.sql: the guarded script the owner pastes in
 * the Supabase SQL editor to install the BotolaGO+ Trophées backend (migrations 20261015150000 to
 * 20261015150200), first on staging (srdrflfrfpwixsllveid), then on production
 * (tkewgajrljbwgwedqsxn), AFTER the premium card reads and the league context read.
 *
 *   bun scripts/backend/build-apply-trophies.ts          # rewrite the script
 *   bun scripts/backend/build-apply-trophies.ts --check  # exit 1 if it drifted
 *
 * The script carries each migration file byte for byte, once, with its sha256;
 * apply-trophies-script.test.ts fails when the committed script differs from what this file builds
 * from the files in supabase/migrations. Rerun this after a migration file changes (only while it
 * is unapplied everywhere: CLAUDE.md, "Migrations").
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const SCRIPT_PATH = "scripts/backend/apply-20261015150000-trophies.sql";

export const MIGRATIONS = [
  { version: "20261015150000", name: "trophies_schema" },
  { version: "20261015150100", name: "trophies_evaluator" },
  { version: "20261015150200", name: "trophies_reads" },
] as const;

/** What this builds on: the membership foundation, the Manager Card reads, the premium reads. */
export const PREREQUISITES = [
  "20261008123300",
  "20261010120200",
  "20261012200100",
  "20261013100000",
  "20261013100100",
  "20261013100200",
  "20261013100300",
  "20261013100400",
  "20261014150000",
] as const;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const migrationText = (version: string, name: string) =>
  readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");

export function build(): string {
  const files = MIGRATIONS.map((m) => ({ ...m, text: migrationText(m.version, m.name) }));
  for (const file of files) {
    if (file.text.includes(`$bg_${file.version}_file$`)) {
      throw new Error(`${file.version}: the file contains its own quoting tag`);
    }
  }
  const needed = PREREQUISITES.map((v) => `'${v}'`).join(", ");
  const versions = files.map((f) => `'${f.version}'`).join(", ");
  const versionsPlain = files.map((f) => f.version).join(", ");
  const inserts = files
    .map(
      (f) => `insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '${f.version}',
  '${f.name}',
  array[$bg_${f.version}_file$${f.text}$bg_${f.version}_file$]
);`,
    )
    .join("\n\n");
  const parts = files
    .map(
      (f) => `  part_${f.version} text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '${f.version}'
  );`,
    )
    .join("\n");
  const checks = files
    .map(
      (f) => `  if encode(sha256(convert_to(part_${f.version}, 'UTF8')), 'hex')
    is distinct from '${sha256(f.text)}' then
    raise exception 'stop: ${f.version} is not the repository file byte for byte -- was this script cut short or changed?';
  end if;`,
    )
    .join("\n");
  const runs = files.map((f) => `  execute part_${f.version};`).join("\n");

  return `-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply the BotolaGO+ Trophées backend, migrations 20261015150000 to 20261015150200
-- (docs/product/botolago-plus-trophies-brief.md, owner decisions of 2026-10-15): the trophies a
-- manager earns by playing, the card frames, the evaluator and the five reads.
--
-- It adds six tables (app.trophy_catalog, app.trophies_earned, app.card_frames,
-- app.card_frame_choices, app.trophy_visibility, app_private.trophy_settings), twelve trophies and
-- nine frames of configuration, the switch app_private.trophy_configure, the evaluator
-- (app_private.trophies_tick and its helpers), five api functions (get_my_trophies,
-- choose_card_frame, get_trophy_card_frames, set_trophies_visibility, get_league_member_trophies)
-- and TWO SCHEDULED JOBS: trophies-tick (minutes 10
-- and 40 of every hour) and trophies-history-prune (daily 03:31 UTC). It REPLACES NOTHING: no
-- existing function, table or row changes -- the script checks that.
--
-- LEAGUE TROPHIES AT THE END OF THE SEASON ONLY. The league podium and the league champion are
-- granted only once the season is over and its last journée is final and published, from the final
-- standing of a private league of at least three managers; before that the cabinet shows them as in
-- progress. Trophies are shown to the managers who share a private league with you, unless you
-- switch them off (on by default); never to strangers or in public leagues.
--
-- NO BACKFILL. The evaluator works on the CURRENT Fantasy season only and refuses any other, and
-- this script grants nothing: it runs no evaluation at all. The script checks that no trophy exists
-- afterwards and that the evaluator carries its current-season guard.
--
-- IT SHIPS OFF. app_private.trophy_settings.enabled is false, so trophies-tick answers
-- {"status": "off"} and writes nothing; and while BotolaGO+ is off every read answers
-- {"available": false}. Nothing is granted, shown or changed for anyone by this script. Turning
-- the evaluator on is a separate, later step (docs/backend/TROPHIES_OPERATIONS_RUNBOOK.md).
--
-- A TROPHY IS NEVER TAKEN BACK. app.trophies_earned refuses every update and every statement
-- that deletes a row; only the cascade of an erased account, season or catalogue entry removes
-- one. The script checks that the two triggers are there.
--
-- WHEN
--   After the premium card reads and the league context read are applied on this database
--   (apply-20261013100400-premium-card-reads.sql, apply-20261014150000-premium-card-league-context.sql),
--   after the pull request that adds this file is merged and its database-quality job passed.
--   Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run in progress, no
--     other query running, no other agent or workflow working on the database.
--   * Nothing needs pausing: the script creates tables, functions and two cron entries, and
--     replaces nothing. The new jobs do nothing while the switch is off.
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every guard and every
--      check runs on the real code path inside one transaction, and the script ends with a
--      deliberate error whose message carries the state it computed ("REHEARSAL PASSED --
--      nothing was saved: {...}"). That error is the expected, good outcome: it rolls
--      everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regclass('app.trophy_catalog') is null as rolled_back;
--      It must say true.
--   4. In the line \`select set_config('bg.trophies_mode', 'rehearsal', true);\` near the top,
--      change 'rehearsal' to 'apply' and press Run again. The result row says "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects or jobs exist, or where the migrations it
--     builds on are not recorded;
--   * records the three migration files in supabase_migrations.schema_migrations, each whole as
--     statements[1], and runs each from that record once its sha256 matches the repository file;
--   * checks the result without saving anything: row security forced and no client privilege on
--     the six tables; twelve trophies, nine frames; the switch off; the never-taken-back
--     triggers and the step-up trigger on the two tables a signed-in account writes; the five api
--     functions' grants and security settings; the helpers callable by no API role; the evaluator
--     refusing every season but the current one and granting league trophies only from the end of
--     the season; the reads answering "off" while BotolaGO+ is off; the pass answering "off";
--     exactly two jobs added; the definitions of the card reads, the editions and the membership
--     check unchanged; no trophy and no frame choice exist.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.trophies_mode', 'rehearsal', true);

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
  if exists (select 1 from supabase_migrations.schema_migrations where version in (${versions})) then
    raise exception 'stop: one of ${versionsPlain} is already recorded as applied';
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
    'app.profiles', 'app.fantasy_seasons', 'app.fantasy_teams', 'app.fantasy_gameweeks',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.fantasy_team_gameweek_results',
    'app.manager_cards', 'app.manager_card_gameweeks', 'app_private.premium_settings',
    'app_private.manager_card_settings', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.set_updated_at()', 'app_private.refuse_unverified_mfa_actor()',
    'app_private.manager_card_active_rules()', 'app_private.manager_card_fantasy_season()',
    'app_private.manager_card_season_label(uuid)', 'app_private.manager_card_tier_rank(text)',
    'app_private.card_reads_mode()', 'app_private.card_premium_mode()',
    'app_private.card_resolve_season(text)', 'app_private.card_week_rows(uuid,uuid)',
    'app_private.card_transfer_rows(uuid,uuid)', 'app_private.card_evaluable_gameweeks(uuid)',
    'app_private.card_league_members(uuid)', 'api.choose_card_design(text)',
    'api.get_my_manager_card()', 'api.get_manager_cards(uuid[])'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if to_regclass('app.trophy_catalog') is not null or to_regclass('app.trophies_earned') is not null
    or to_regclass('app.card_frames') is not null or to_regclass('app.card_frame_choices') is not null
    or to_regclass('app.trophy_visibility') is not null
    or to_regclass('app_private.trophy_settings') is not null then
    raise exception 'stop: one of the Trophées tables already exists';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in ('get_my_trophies', 'choose_card_frame', 'get_trophy_card_frames',
        'set_trophies_visibility', 'get_league_member_trophies'))
      or (n.nspname = 'app_private' and (p.proname like 'trophy\\_%' or p.proname like 'trophies\\_%'
        or p.proname = 'card_frame_effective'))) then
    raise exception 'stop: one of the Trophées functions already exists';
  end if;
  if exists (select 1 from cron.job where jobname in ('trophies-tick', 'trophies-history-prune')) then
    raise exception 'stop: a Trophées job is already scheduled';
  end if;
  -- This replaces nothing: remember what is there and compare afterwards.
  perform set_config('bg.trophies_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.trophies_stepup', (select count(*) from pg_trigger
    where tgfoid = 'app_private.refuse_unverified_mfa_actor()'::regprocedure)::text, true);
  perform set_config('bg.trophies_defs', (select string_agg(
      p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (
      'api.choose_card_design(text)'::regprocedure, 'api.get_my_manager_card()'::regprocedure,
      'api.get_manager_cards(uuid[])'::regprocedure, 'app_private.has_premium(uuid,timestamptz)'::regprocedure,
      'app_private.card_reads_mode()'::regprocedure, 'app_private.card_week_rows(uuid,uuid)'::regprocedure,
      'app_private.card_transfer_rows(uuid,uuid)'::regprocedure,
      'app_private.card_evaluable_gameweeks(uuid)'::regprocedure,
      'app_private.card_league_members(uuid)'::regprocedure,
      'app_private.manager_card_tick()'::regprocedure)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migrations, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
${inserts}

-- ---------------------------------------------------------------------------
-- Run them from the history, in order, once each is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
${parts}
begin
${checks}

${runs}
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
  rel text;
  sig text;
  rec record;
  premium_mode text;
  answer jsonb;
  pass jsonb;
  state jsonb;
begin
  -- The six tables: row security enabled and forced, no client privilege.
  foreach rel in array array['app.trophy_catalog', 'app.trophies_earned', 'app.card_frames',
    'app.card_frame_choices', 'app.trophy_visibility', 'app_private.trophy_settings'] loop
    if to_regclass(rel) is null then
      problems := problems || (rel || ' is missing');
    else
      if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = to_regclass(rel)) then
        problems := problems || (rel || ' does not force row security');
      end if;
      foreach who in array array['anon', 'authenticated', 'service_role'] loop
        if has_table_privilege(who, to_regclass(rel), 'select,insert,update,delete,references') then
          problems := problems || (who || ' has a privilege on ' || rel);
        end if;
      end loop;
    end if;
  end loop;

  -- Configuration: twelve trophies, nine frames, the switch off, nothing earned or chosen.
  if (select count(*) from app.trophy_catalog where status = 'active') <> 12 then
    problems := problems || 'the catalogue does not have twelve trophies'::text;
  end if;
  if (select count(*) from app.card_frames where status = 'active') <> 9 then
    problems := problems || 'there are not nine frames'::text;
  end if;
  if (select s.enabled from app_private.trophy_settings s where s.id) is distinct from false then
    problems := problems || 'the evaluator is not switched off'::text;
  end if;
  if (select count(*) from app.trophies_earned) <> 0 or (select count(*) from app.card_frame_choices) <> 0
    or (select count(*) from app.trophy_visibility) <> 0 then
    problems := problems || 'a trophy, a frame choice or a visibility row exists -- this script adds none'::text;
  end if;
  if (select c.label_fr from app.trophy_catalog c where c.code = 'league_leader')
    is distinct from 'Champion de votre ligue' then
    problems := problems || 'the league leader trophy is not the champion of the league'::text;
  end if;

  -- The two tables a signed-in account writes carry the statement-level step-up trigger, and
  -- these are the only two step-up triggers this script adds.
  foreach rel in array array['app.card_frame_choices', 'app.trophy_visibility'] loop
    if not exists (select 1 from pg_trigger t
      where t.tgrelid = to_regclass(rel) and t.tgfoid = 'app_private.refuse_unverified_mfa_actor()'::regprocedure
        and t.tgtype = 30 and t.tgenabled = 'O') then
      problems := problems || (rel || ' lacks the step-up trigger');
    end if;
  end loop;
  if (select count(*) from pg_trigger where tgfoid = 'app_private.refuse_unverified_mfa_actor()'::regprocedure)
    is distinct from current_setting('bg.trophies_stepup', true)::bigint + 2 then
    problems := problems || 'the step-up trigger was not added to exactly two tables'::text;
  end if;

  -- CURRENT SEASON ONLY, AND LEAGUE TROPHIES AT THE END OF THE SEASON ONLY: read from the
  -- definitions (nothing is evaluated here, so nothing can be granted).
  if (select p.prosrc !~ 'is distinct from app_private\\.manager_card_fantasy_season\\(\\)'
        or p.prosrc !~ 'trophy_season_end'
      from pg_proc p where p.oid = to_regprocedure('app_private.trophies_evaluate_season(uuid,uuid)')) then
    problems := problems || 'the evaluator does not refuse a past season, or does not wait for the end of the season'::text;
  end if;

  -- A trophy is never taken back: both triggers are on the table.
  if (select count(*) from pg_trigger t
      where t.tgrelid = to_regclass('app.trophies_earned') and not t.tgisinternal
        and t.tgname in ('trophies_earned_keep_update', 'trophies_earned_keep_delete')) <> 2 then
    problems := problems || 'the never-taken-back triggers are not both there'::text;
  end if;

  -- The five api functions: who may run them, how they run.
  foreach sig in array array['api.get_my_trophies(text)', 'api.choose_card_frame(text)',
    'api.get_trophy_card_frames(uuid[])', 'api.set_trophies_visibility(boolean)',
    'api.get_league_member_trophies(uuid)'] loop
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
      if not (select p.prosecdef and p.proconfig @> array['search_path=""']
        from pg_proc p where p.oid = to_regprocedure(sig)) then
        problems := problems || (sig || ' is not security definer with an empty search_path');
      end if;
    end if;
  end loop;
  foreach sig in array array['api.get_my_trophies(text)', 'api.get_trophy_card_frames(uuid[])',
    'api.get_league_member_trophies(uuid)'] loop
    if to_regprocedure(sig) is not null
      and (select p.provolatile from pg_proc p where p.oid = to_regprocedure(sig)) <> 's' then
      problems := problems || (sig || ' is not STABLE');
    end if;
  end loop;

  -- The helpers and the pass: no API role may run them; only postgres runs the pass and the switch.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and (p.proname like 'trophy\\_%' or p.proname like 'trophies\\_%' or p.proname = 'card_frame_effective')
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'
        and (p.proname like 'trophy\\_%' or p.proname like 'trophies\\_%' or p.proname = 'card_frame_effective')) <> 12 then
    problems := problems || 'the twelve app_private functions are not all there'::text;
  end if;

  -- Replaces nothing: the card reads, the editions, the membership check and the card tick are as they were.
  if (select string_agg(
        p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
      from pg_proc p where p.oid in (
        'api.choose_card_design(text)'::regprocedure, 'api.get_my_manager_card()'::regprocedure,
        'api.get_manager_cards(uuid[])'::regprocedure, 'app_private.has_premium(uuid,timestamptz)'::regprocedure,
        'app_private.card_reads_mode()'::regprocedure, 'app_private.card_week_rows(uuid,uuid)'::regprocedure,
        'app_private.card_transfer_rows(uuid,uuid)'::regprocedure,
        'app_private.card_evaluable_gameweeks(uuid)'::regprocedure,
        'app_private.card_league_members(uuid)'::regprocedure,
        'app_private.manager_card_tick()'::regprocedure))
    is distinct from current_setting('bg.trophies_defs', true) then
    problems := problems || 'an existing function changed -- this script replaces none'::text;
  end if;

  -- Off means off (checked only while BotolaGO+ is off; if it is already on the reads cannot be
  -- called here without a signed-in user).
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    answer := api.get_my_trophies();
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the cabinet does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
    answer := api.choose_card_frame('standard');
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the frame choice does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
    answer := api.set_trophies_visibility(true);
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the visibility switch does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
    answer := api.get_league_member_trophies(gen_random_uuid());
    if answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the league mates read does not answer off while BotolaGO+ is off: '
        || coalesce(answer::text, 'nothing'));
    end if;
  end if;

  -- The pass answers off and writes nothing.
  pass := app_private.trophies_tick();
  if pass is distinct from '{"status": "off"}'::jsonb then
    problems := problems || ('the pass does not answer off: ' || coalesce(pass::text, 'nothing'));
  end if;

  -- Exactly the two jobs were added, and the history rows are there.
  if (select count(*) from cron.job)::text is distinct from (current_setting('bg.trophies_jobs', true)::integer + 2)::text then
    problems := problems || 'the number of scheduled jobs did not grow by exactly two'::text;
  end if;
  if (select count(*) from cron.job where jobname in ('trophies-tick', 'trophies-history-prune')) <> 2 then
    problems := problems || 'the two Trophées jobs are not both scheduled'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in (${versions})) <> ${files.length} then
    problems := problems || 'a history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'tables', 6,
    'trophies', (select count(*) from app.trophy_catalog),
    'frames', (select count(*) from app.card_frames),
    'apiFunctions', 5,
    'helpers', 12,
    'currentSeasonOnly', true,
    'leagueTrophiesAtSeasonEnd', true,
    'jobsAdded', 2,
    'passWhileOff', pass,
    'readWhileOff', case when premium_mode = 'off' then answer end,
    'historyRows', ${files.length}
  );
  perform set_config('bg.trophies_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.trophies_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.trophies_state', true);
  end if;
  raise notice 'trophies: applying: %', current_setting('bg.trophies_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${files[0].version}')
    then 'Applied. The Trophées backend is in place and OFF: the evaluator is switched off and every read answers off while BotolaGO+ is off. Next: docs/backend/TROPHIES_OPERATIONS_RUNBOOK.md.'
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
