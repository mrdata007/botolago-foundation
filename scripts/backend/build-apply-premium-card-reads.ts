/**
 * Builds scripts/backend/apply-20261013100400-premium-card-reads.sql: the guarded
 * script the owner pastes in the Supabase SQL editor to install the BotolaGO+
 * premium card reads (migration 20261013100400), first on staging
 * (srdrflfrfpwixsllveid), then on production (tkewgajrljbwgwedqsxn), AFTER the
 * membership foundation (apply-20261013100000-premium-foundation.sql).
 *
 *   bun scripts/backend/build-apply-premium-card-reads.ts          # rewrite the script
 *   bun scripts/backend/build-apply-premium-card-reads.ts --check  # exit 1 if it drifted
 *
 * The script carries the migration file byte for byte, once, with its sha256;
 * apply-premium-card-reads-script.test.ts fails when the committed script differs
 * from what this file builds from the file in supabase/migrations. Rerun this
 * after the migration file changes (only while it is unapplied everywhere:
 * CLAUDE.md, "Migrations").
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const SCRIPT_PATH = "scripts/backend/apply-20261013100400-premium-card-reads.sql";

export const MIGRATIONS = [{ version: "20261013100400", name: "premium_card_reads" }] as const;

/** What this builds on: the membership foundation and the Manager Card reads. */
export const PREREQUISITES = [
  "20261008123300",
  "20261010120200",
  "20261012200100",
  "20261013100000",
  "20261013100100",
  "20261013100200",
  "20261013100300",
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
-- Apply the BotolaGO+ premium card reads, migration ${file.version}
-- (docs/plans/BOTOLAGO_PLUS_PLAN.md sections 2a and 2b): « Votre carrière »
-- (api.get_my_card_career), « Face-à-face+ » (api.get_card_duel) and the privacy
-- switch for the card history (api.set_card_history_visibility,
-- api.get_my_card_history_visibility).
--
-- It adds ONE table (app.card_history_visibility, empty, closed to every API
-- role), nine helper functions in app_private (no grant), and four api
-- functions. It REPLACES NOTHING: no existing function, table or row changes,
-- the Manager Card calculation is not touched, and no job is scheduled. All
-- reads are display only and members only.
--
-- IT SHIPS OFF. While app_private.premium_settings.mode is 'off' (or the Manager
-- Card reads are off) the reads answer {"available": false} and the switch
-- function writes nothing. The history of nobody is shown to league mates until
-- they switch it on (default hidden: plan Q6, the CNDP point is open).
--
-- WHEN
--   After the membership foundation is applied on this database
--   (scripts/backend/apply-20261013100000-premium-foundation.sql), after the pull
--   request that adds this file is merged and its database-quality job passed.
--   Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run
--     in progress, no other query running, no other agent or workflow working on
--     the database.
--   * Nothing needs pausing: the script only creates a table and functions and
--     replaces none. (It does not touch the account erasure.)
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every
--      guard and every check runs on the real code path inside one transaction,
--      and the script ends with a deliberate error whose message carries the
--      state it computed ("REHEARSAL PASSED -- nothing was saved: {...}"). That
--      error is the expected, good outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regclass('app.card_history_visibility') is null as rolled_back;
--      It must say true.
--   4. In the line \`select set_config('bg.premium_reads_mode', 'rehearsal', true);\`
--      near the top, change 'rehearsal' to 'apply' and press Run again. The
--      result row says "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects exist, or where the
--     migrations it builds on (the Manager Card reads and the BotolaGO+
--     foundation, 20261013100000 to 20261013100300) are not recorded;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the table's row security
--     forced and closed to every API role, the step-up trigger on it, every
--     function's grants, the reads answering "off" while BotolaGO+ is off, no
--     row in the new table, no job added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.premium_reads_mode', 'rehearsal', true);

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
    'app.profiles', 'app.fantasy_teams', 'app.fantasy_seasons', 'app.fantasy_gameweeks',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.fantasy_team_gameweek_results',
    'app.fantasy_lineups', 'app.fantasy_lineup_players', 'app.fantasy_player_gameweek_points',
    'app.fantasy_transfer_batches', 'app.fantasy_transfers', 'app.fantasy_players', 'app.players',
    'app.seasons', 'app.manager_card_gameweeks', 'app.manager_card_seasons',
    'app_private.manager_card_rules', 'app_private.fantasy_gameweek_postwork',
    'app_private.premium_settings', 'app.premium_entitlements', 'app_private.premium_grants',
    'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.set_updated_at()', 'app_private.assert_mfa_step_up()',
    'app_private.refuse_unverified_mfa_actor()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.card_edition_effective(uuid,uuid)',
    'app_private.manager_card_read_ready()', 'app_private.manager_card_active_rules()',
    'app_private.manager_card_fantasy_season()', 'app_private.manager_card_season_label(uuid)',
    'app_private.manager_card_tier_rank(text)', 'app_private.manager_card_member_card(uuid[])'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if to_regclass('app.card_history_visibility') is not null then
    raise exception 'stop: app.card_history_visibility already exists';
  end if;
  -- This adds no job: remember how many there are, and compare afterwards.
  perform set_config('bg.premium_reads_jobs', (select count(*) from cron.job)::text, true);
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in ('get_my_card_career', 'get_card_duel',
        'set_card_history_visibility', 'get_my_card_history_visibility'))
      or (n.nspname = 'app_private' and p.proname in ('card_premium_mode', 'card_reads_mode',
        'card_resolve_season', 'card_evaluable_gameweeks', 'card_week_rows', 'card_week_top_half',
        'card_captain_rows', 'card_transfer_rows', 'card_duel_shared_seasons'))) then
    raise exception 'stop: one of the premium card read functions already exists';
  end if;
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
  tbl text := 'app.card_history_visibility';
  rec record;
  premium_mode text;
  career jsonb;
  duel jsonb;
  setter jsonb;
  getter jsonb;
  state jsonb;
begin
  -- The table: row security forced, no right for any API role, no policy, empty.
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = tbl::regclass) then
    problems := problems || ('row security is not forced on ' || tbl);
  end if;
  if exists (select 1 from pg_policies where schemaname = 'app' and tablename = 'card_history_visibility') then
    problems := problems || ('a policy exists on ' || tbl);
  end if;
  foreach who in array array['anon', 'authenticated', 'service_role'] loop
    if has_any_column_privilege(who, tbl::regclass, 'select,insert,update,references')
      or has_table_privilege(who, tbl::regclass, 'delete,truncate,trigger') then
      problems := problems || (who || ' has a right on ' || tbl);
    end if;
  end loop;
  if (select count(*) from app.card_history_visibility) <> 0 then
    problems := problems || 'the privacy table is not empty -- nobody shows their history at the start'::text;
  end if;
  if not exists (select 1 from pg_trigger
    where tgrelid = tbl::regclass
      and tgfoid = 'app_private.refuse_unverified_mfa_actor()'::regprocedure and tgenabled = 'O') then
    problems := problems || ('the step-up trigger is missing on ' || tbl);
  end if;

  -- The api functions: who may run what.
  for rec in select * from (values
    ('api.get_my_card_career(text)', 'authenticated,service_role', 'anon'),
    ('api.get_card_duel(uuid,text)', 'authenticated,service_role', 'anon'),
    ('api.set_card_history_visibility(boolean)', 'authenticated,service_role', 'anon'),
    ('api.get_my_card_history_visibility()', 'authenticated,service_role', 'anon')
  ) as t(signature, may, may_not) loop
    if to_regprocedure(rec.signature) is null then
      problems := problems || (rec.signature || ' is missing');
      continue;
    end if;
    foreach who in array string_to_array(rec.may, ',') loop
      if not has_function_privilege(who, to_regprocedure(rec.signature), 'execute') then
        problems := problems || (who || ' cannot run ' || rec.signature);
      end if;
    end loop;
    foreach who in array string_to_array(rec.may_not || ',public', ',') loop
      if has_function_privilege(who, to_regprocedure(rec.signature), 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
      where p.oid = to_regprocedure(rec.signature)) then
      problems := problems || (rec.signature || ' is not security definer with an empty search_path');
    end if;
  end loop;

  -- Helpers: no API role.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname in ('card_premium_mode', 'card_reads_mode', 'card_resolve_season',
        'card_evaluable_gameweeks', 'card_week_rows', 'card_week_top_half', 'card_captain_rows',
        'card_transfer_rows', 'card_duel_shared_seasons')
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_private'
        and p.proname in ('card_premium_mode', 'card_reads_mode', 'card_resolve_season',
        'card_evaluable_gameweeks', 'card_week_rows', 'card_week_top_half', 'card_captain_rows',
        'card_transfer_rows', 'card_duel_shared_seasons')) <> 9 then
    problems := problems || 'the nine helpers are not all there'::text;
  end if;

  -- Off means off (checked only while BotolaGO+ is off; if it is already on the
  -- reads cannot be called here without a signed-in user).
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if premium_mode = 'off' then
    career := api.get_my_card_career();
    duel := api.get_card_duel(gen_random_uuid());
    setter := api.set_card_history_visibility(true);
    getter := api.get_my_card_history_visibility();
    if career is distinct from '{"available": false}'::jsonb
      or duel is distinct from '{"available": false}'::jsonb
      or setter is distinct from '{"available": false}'::jsonb
      or getter is distinct from '{"available": false}'::jsonb then
      problems := problems || ('a read does not answer off while BotolaGO+ is off: '
        || coalesce(career::text, 'nothing') || ' ' || coalesce(duel::text, 'nothing') || ' '
        || coalesce(setter::text, 'nothing') || ' ' || coalesce(getter::text, 'nothing'));
    end if;
    if (select count(*) from app.card_history_visibility) <> 0 then
      problems := problems || 'the off switch function wrote a row'::text;
    end if;
  end if;

  -- No job was added, and the history row is there.
  if (select count(*) from cron.job)::text is distinct from current_setting('bg.premium_reads_jobs', true) then
    problems := problems || 'the number of scheduled jobs changed -- this script adds none'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version = '${file.version}') <> 1 then
    problems := problems || 'the history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'privacyRows', (select count(*) from app.card_history_visibility),
    'apiFunctions', 4,
    'helpers', 9,
    'readsWhileOff', case when premium_mode = 'off' then career end,
    'historyRows', 1
  );
  perform set_config('bg.premium_reads_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.premium_reads_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.premium_reads_state', true);
  end if;
  raise notice 'premium card reads: applying: %', current_setting('bg.premium_reads_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${file.version}')
    then 'Applied. The premium card reads are in place and OFF while BotolaGO+ is off; nobody shows their card history to league mates. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
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
