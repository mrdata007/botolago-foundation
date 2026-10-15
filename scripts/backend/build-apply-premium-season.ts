/**
 * Builds scripts/backend/apply-20261016150000-premium-season.sql: the guarded script the owner
 * pastes in the Supabase SQL editor to install BotolaGO+ « Saison » (migrations 20261016150000 and
 * 20261016150100), first on staging (srdrflfrfpwixsllveid), then on production
 * (tkewgajrljbwgwedqsxn).
 *
 *   bun scripts/backend/build-apply-premium-season.ts          # rewrite the script
 *   bun scripts/backend/build-apply-premium-season.ts --check  # exit 1 if it drifted
 *
 * The script carries both migration files byte for byte, once each, with their sha256;
 * apply-premium-season-script.test.ts fails when the committed script differs from what this
 * file builds from the files in supabase/migrations. Rerun this after a migration file changes
 * (only while it is unapplied everywhere: CLAUDE.md, "Migrations").
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const SCRIPT_PATH = "scripts/backend/apply-20261016150000-premium-season.sql";

export const MIGRATIONS = [
  { version: "20261016150000", name: "premium_season_schema" },
  { version: "20261016150100", name: "premium_season_api" },
] as const;

/**
 * What this builds on: the Fantasy prizes (the current season helper), the BotolaGO+ foundation,
 * its API, the account erasure and the admin overview by product (the functions and tables this
 * file changes).
 */
export const PREREQUISITES = [
  "20260924120000",
  "20261013100000",
  "20261013100100",
  "20261013100200",
  "20261013100300",
  "20261013100500",
] as const;

/** The three functions of 20261013100200 that this replaces, same signature. */
export const REPLACED = [
  "api.premium_status()",
  "api.get_my_premium()",
  "api.admin_get_premium_member(uuid,text,uuid)",
] as const;

/** The six new api functions: signed-in callers only. */
export const NEW_API = [
  "api.get_premium_payment_details()",
  "api.get_my_premium_pay_code()",
  "api.admin_get_premium_payment_details()",
  "api.admin_set_premium_payment_details(jsonb,text,uuid)",
  "api.admin_find_premium_member_by_code(text,text,uuid)",
  "api.admin_activate_premium_season(uuid,text,text,text,uuid)",
] as const;

/** The three new helpers: no API role. */
export const NEW_HELPERS = [
  "app_private.premium_season_end()",
  "app_private.premium_pay_code_new()",
  "app_private.premium_payment_details_json()",
] as const;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const migrationText = (version: string, name: string) =>
  readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");
const sqlList = (items: readonly string[]) => items.map((item) => `'${item}'`).join(", ");

export function build(): string {
  const files = MIGRATIONS.map((m) => ({ ...m, text: migrationText(m.version, m.name) }));
  for (const file of files) {
    if (file.text.includes(`$bg_${file.version}_file$`)) {
      throw new Error(`${file.version}: the file contains its own quoting tag`);
    }
  }
  const needed = sqlList(PREREQUISITES);
  const first = files[0];
  const last = files[files.length - 1];

  const records = files
    .map(
      (file) => `insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '${file.version}',
  '${file.name}',
  array[$bg_${file.version}_file$${file.text}$bg_${file.version}_file$]
);`,
    )
    .join("\n\n");

  const runs = files
    .map(
      (file) => `do $apply_${file.version}$
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
$apply_${file.version}$;`,
    )
    .join("\n\n");

  return `-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply BotolaGO+ « Saison », migrations ${first.version} and ${last.version}
-- (docs/product/botolago-plus-season-brief.md): the one season product at 200 MAD, paid by hand
-- (bank transfer, CashPlus, Wafacash) and activated by staff in the admin screen.
--
-- It ADDS two tables (app_private.premium_payment_details, empty, and app_private.premium_pay_codes),
-- five nullable columns on app_private.premium_grants, one product row (plus_season) and SIX api
-- functions with three helpers. It CHANGES two product rows (plus_monthly and plus_yearly become
-- inactive: they are not deleted, rows reference them) and REPLACES three functions with the same
-- signature (api.premium_status, api.get_my_premium, api.admin_get_premium_member). No grant, no
-- entitlement, no billing event and no other row is touched, and no job is added.
--
-- IT SHIPS OFF. While app_private.premium_settings.mode is 'off', the two new member reads answer
-- {"available": false}. The owner types the payment details (bank, recipient, WhatsApp) in the admin
-- screen afterwards: nothing about them is in this script.
--
-- WHEN
--   After the BotolaGO+ foundation, API and account erasure are applied on this database
--   (scripts/backend/apply-20261013100000-premium-foundation.sql and the admin overview), after
--   the pull request that adds this file is merged and its database-quality job passed. Staging
--   first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * This is a database WRITE, the rehearsal included (it takes locks): make sure nothing else is
--     writing to this database: no GitHub Actions run in progress, no other query running, no other
--     agent or workflow working on the database.
--   * No scheduled job reads or writes these tables, so nothing needs pausing. BotolaGO+ billing
--     has no provider connected yet; if one is, pause it first:
--     select app_private.premium_configure(null, null, true); and restore it afterwards.
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every guard and every
--      check runs on the real code path inside one transaction, and the script ends with a
--      deliberate error whose message carries the state it computed
--      ("REHEARSAL PASSED -- nothing was saved: {...}"). That error is the expected, good
--      outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regclass('app_private.premium_pay_codes') is null as rolled_back;
--      It must say true.
--   4. In the line \`select set_config('bg.premium_season_mode', 'rehearsal', true);\` near the top,
--      change 'rehearsal' to 'apply' and press Run again. The result row says "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of its objects exist, or where the migrations it builds on
--     are not recorded, or where plus_monthly / plus_yearly / the grants table are not as expected;
--   * records the two migration files in supabase_migrations.schema_migrations, each whole as
--     statements[1], and runs each from that record once its sha256 matches the repository file;
--   * checks the result without saving anything: no grant, entitlement, billing event or product
--     row lost (same ids, same prices), plus_monthly and plus_yearly still there but inactive,
--     plus_season active at 200 MAD with no months and no renewal, every earlier grant with empty
--     payment columns, the payment details empty, the six functions granted to signed-in callers
--     only (security definer, empty search_path), the helpers with no grant, the three replaced
--     functions changed and still granted as before, both member reads answering "off" while
--     BotolaGO+ is off, the switch unchanged, two tables and no job added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.premium_season_mode', 'rehearsal', true);

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
  foreach needed in array array['${first.version}', '${last.version}'] loop
    if exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      raise exception 'stop: % is already recorded as applied', needed;
    end if;
  end loop;
  foreach needed in array array[${needed}] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet: %', missing;
  end if;
  foreach needed in array array[
    'app_private.premium_settings', 'app_private.premium_products', 'app_private.premium_grants',
    'app_private.billing_events', 'app.premium_entitlements', 'app.fantasy_seasons',
    'app_private.admin_audit_events', 'app_private.admin_idempotency_keys',
    'app_private.staff_principals', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()', 'app_private.has_premium(uuid,timestamptz)',
    'app_private.fantasy_prize_current_season()', 'app_private.admin_assert_permission(text,boolean)',
    'app_private.write_admin_audit(uuid,text,text,uuid,text,uuid,uuid,uuid,jsonb,jsonb,app_private.admin_audit_outcome,text,boolean)',
    'app_private.admin_begin_idempotent_operation(uuid,text,uuid,jsonb)',
    'app_private.admin_complete_idempotent_operation(uuid,text,uuid,jsonb)',
    ${sqlList(REPLACED)}
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if to_regclass('app_private.premium_payment_details') is not null
    or to_regclass('app_private.premium_pay_codes') is not null
    or exists (select 1 from information_schema.columns
      where table_schema = 'app_private' and table_name = 'premium_grants'
        and column_name in ('product_code', 'payment_method', 'payment_reference', 'amount_minor', 'currency'))
    or exists (select 1 from app_private.premium_products where code = 'plus_season') then
    raise exception 'stop: one of the Saison objects already exists';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in ('get_premium_payment_details', 'get_my_premium_pay_code',
        'admin_get_premium_payment_details', 'admin_set_premium_payment_details',
        'admin_find_premium_member_by_code', 'admin_activate_premium_season'))
      or (n.nspname = 'app_private' and p.proname in ('premium_season_end', 'premium_pay_code_new',
        'premium_payment_details_json'))) then
    raise exception 'stop: one of the Saison functions already exists';
  end if;
  -- The two products this makes inactive must be there, active, and as the owner priced them.
  if (select string_agg(code || '/' || period_months || '/' || renews || '/' || price_minor || '/' || active,
        ',' order by code)
      from app_private.premium_products where code in ('plus_monthly', 'plus_yearly'))
    is distinct from 'plus_monthly/1/true/2000/true,plus_yearly/12/false/20000/true' then
    raise exception 'stop: plus_monthly and plus_yearly are not as the foundation made them (active, 20 and 200 MAD)';
  end if;
  -- Remember what is there, compare afterwards.
  perform set_config('bg.premium_season_grants', (select count(*) || ':' || coalesce(md5(string_agg(id::text, ',' order by id)), '')
    from app_private.premium_grants), true);
  perform set_config('bg.premium_season_entitlements', (select count(*) || ':' || coalesce(md5(string_agg(user_id::text || state || product_code, ',' order by user_id)), '')
    from app.premium_entitlements), true);
  perform set_config('bg.premium_season_events', (select count(*) from app_private.billing_events)::text, true);
  perform set_config('bg.premium_season_products', (select count(*) from app_private.premium_products)::text, true);
  perform set_config('bg.premium_season_old_products', (select md5(string_agg(code || period_months || renews || price_minor || currency || sort_order, ',' order by code))
    from app_private.premium_products where code in ('plus_monthly', 'plus_yearly')), true);
  perform set_config('bg.premium_season_mode_before', (select mode || '/' || checkout_enabled || '/' || billing_paused
    from app_private.premium_settings where id), true);
  perform set_config('bg.premium_season_jobs', (select count(*) from cron.job)::text, true);
  perform set_config('bg.premium_season_tables', (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text, true);
  perform set_config('bg.premium_season_defs', (select string_agg(
      p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)), ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (${REPLACED.map((r) => `'${r}'::regprocedure`).join(", ")})), true);
  perform set_config('bg.premium_season_acl', (select string_agg(
      p.oid::regprocedure::text || '=' || has_function_privilege('anon', p.oid, 'execute')::text
        || has_function_privilege('authenticated', p.oid, 'execute')::text
        || has_function_privilege('service_role', p.oid, 'execute')::text, ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in (${REPLACED.map((r) => `'${r}'::regprocedure`).join(", ")})), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migrations, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
${records}

-- ---------------------------------------------------------------------------
-- Run them from the history, each once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
${runs}

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
  pay_answer jsonb;
  code_answer jsonb;
  state jsonb;
begin
  -- Nothing lost: the same grants, entitlements, events and products, and the old products intact.
  if (select count(*) || ':' || coalesce(md5(string_agg(id::text, ',' order by id)), '')
      from app_private.premium_grants) is distinct from current_setting('bg.premium_season_grants', true) then
    problems := problems || 'a grant was lost or added'::text;
  end if;
  if (select count(*) || ':' || coalesce(md5(string_agg(user_id::text || state || product_code, ',' order by user_id)), '')
      from app.premium_entitlements) is distinct from current_setting('bg.premium_season_entitlements', true) then
    problems := problems || 'an entitlement changed'::text;
  end if;
  if (select count(*) from app_private.billing_events)::text is distinct from current_setting('bg.premium_season_events', true) then
    problems := problems || 'a billing event was lost or added'::text;
  end if;
  if (select count(*) from app_private.premium_products) <> current_setting('bg.premium_season_products', true)::integer + 1 then
    problems := problems || 'the product rows are not the old ones plus plus_season'::text;
  end if;
  if (select md5(string_agg(code || period_months || renews || price_minor || currency || sort_order, ',' order by code))
      from app_private.premium_products where code in ('plus_monthly', 'plus_yearly'))
    is distinct from current_setting('bg.premium_season_old_products', true) then
    problems := problems || 'plus_monthly or plus_yearly changed in more than its active flag'::text;
  end if;
  if (select string_agg(code || ':' || active, ',' order by code) from app_private.premium_products)
    is distinct from 'plus_monthly:false,plus_season:true,plus_yearly:false' then
    problems := problems || 'plus_monthly and plus_yearly must be inactive and plus_season active'::text;
  end if;
  if not exists (select 1 from app_private.premium_products
    where code = 'plus_season' and period_months is null and not renews and price_minor = 20000
      and currency = 'MAD' and sort_order = 0) then
    problems := problems || 'plus_season is not 200 MAD with no months and no renewal'::text;
  end if;
  -- Every earlier grant keeps its payment columns empty.
  if exists (select 1 from app_private.premium_grants
    where product_code is not null or payment_method is not null or payment_reference is not null
      or amount_minor is not null) then
    problems := problems || 'an earlier grant carries a payment record'::text;
  end if;
  -- The payment details ship empty: one row, nothing typed.
  if (select count(*) from app_private.premium_payment_details) <> 1
    or exists (select 1 from app_private.premium_payment_details
      where bank_holder is not null or bank_name is not null or rib is not null
        or cashplus_name is not null or whatsapp_number is not null or note_fr is not null
        or note_ar is not null) then
    problems := problems || 'the payment details are not one empty row'::text;
  end if;
  if (select count(*) from app_private.premium_pay_codes) <> 0 then
    problems := problems || 'payment codes exist already'::text;
  end if;
  -- The new tables: row security forced, no right for any API role.
  foreach sig in array array['app_private.premium_payment_details', 'app_private.premium_pay_codes'] loop
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = to_regclass(sig)) then
      problems := problems || (sig || ' does not have forced row security');
    end if;
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_table_privilege(who, to_regclass(sig), 'select,insert,update,delete,truncate,references,trigger') then
        problems := problems || (who || ' has a right on ' || sig);
      end if;
    end loop;
  end loop;

  -- The six new api functions: who may run them, how they run.
  foreach sig in array array[${sqlList(NEW_API)}] loop
    if to_regprocedure(sig) is null then
      problems := problems || (sig || ' is missing');
    else
      if not has_function_privilege('authenticated', to_regprocedure(sig), 'execute') then
        problems := problems || ('authenticated cannot run ' || sig);
      end if;
      foreach who in array array['anon', 'service_role', 'public'] loop
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

  -- The helpers: no API role.
  foreach sig in array array[${sqlList(NEW_HELPERS)}] loop
    if to_regprocedure(sig) is null then
      problems := problems || (sig || ' is missing');
    else
      foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
        if has_function_privilege(who, to_regprocedure(sig), 'execute') then
          problems := problems || (who || ' can run ' || sig);
        end if;
      end loop;
    end if;
  end loop;

  -- The three replaced functions changed, and are granted exactly as before.
  for rec in
    select p.oid::regprocedure::text as signature
    from pg_proc p where p.oid in (${REPLACED.map((r) => `'${r}'::regprocedure`).join(", ")})
  loop
    if position(rec.signature || '=' || md5(pg_get_functiondef(to_regprocedure(rec.signature)))
      in current_setting('bg.premium_season_defs', true)) > 0 then
      problems := problems || (rec.signature || ' was not replaced');
    end if;
  end loop;
  if (select string_agg(
        p.oid::regprocedure::text || '=' || has_function_privilege('anon', p.oid, 'execute')::text
          || has_function_privilege('authenticated', p.oid, 'execute')::text
          || has_function_privilege('service_role', p.oid, 'execute')::text, ';' order by p.oid::regprocedure::text)
      from pg_proc p where p.oid in (${REPLACED.map((r) => `'${r}'::regprocedure`).join(", ")}))
    is distinct from current_setting('bg.premium_season_acl', true) then
    problems := problems || 'who may run a replaced function changed'::text;
  end if;

  -- The switch is untouched, and off means off (checked only while BotolaGO+ is off; a read cannot
  -- be called here without a signed-in user once it is on).
  select s.mode into premium_mode from app_private.premium_settings s where s.id;
  if (select mode || '/' || checkout_enabled || '/' || billing_paused from app_private.premium_settings where id)
    is distinct from current_setting('bg.premium_season_mode_before', true) then
    problems := problems || 'the BotolaGO+ switch changed -- this script does not touch it'::text;
  end if;
  if premium_mode = 'off' then
    pay_answer := api.get_premium_payment_details();
    code_answer := api.get_my_premium_pay_code();
    if pay_answer is distinct from '{"available": false}'::jsonb
      or code_answer is distinct from '{"available": false}'::jsonb then
      problems := problems || ('the reads do not answer off while BotolaGO+ is off: '
        || coalesce(pay_answer::text, 'nothing') || ' / ' || coalesce(code_answer::text, 'nothing'));
    end if;
  end if;

  -- Two tables, no job, and the history rows are there.
  if (select count(*) from cron.job)::text is distinct from current_setting('bg.premium_season_jobs', true) then
    problems := problems || 'the number of scheduled jobs changed -- this script adds none'::text;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))
    <> current_setting('bg.premium_season_tables', true)::integer + 2 then
    problems := problems || 'the number of tables is not the old one plus two'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version in ('${first.version}', '${last.version}')) <> 2 then
    problems := problems || 'a history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'premiumMode', premium_mode,
    'products', (select jsonb_object_agg(code, active) from app_private.premium_products),
    'newApiFunctions', ${NEW_API.length},
    'helpers', ${NEW_HELPERS.length},
    'replacedFunctions', ${REPLACED.length},
    'grantsKept', split_part(current_setting('bg.premium_season_grants', true), ':', 1),
    'readsWhileOff', case when premium_mode = 'off' then jsonb_build_array(pay_answer, code_answer) end,
    'historyRows', 2
  );
  perform set_config('bg.premium_season_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.premium_season_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.premium_season_state', true);
  end if;
  raise notice 'premium season: applying: %', current_setting('bg.premium_season_state', true);
end
$finish$;

commit;

select case
  when (select count(*) from supabase_migrations.schema_migrations where version in ('${first.version}', '${last.version}')) = 2
    then 'Applied. The Saison is in place and OFF while BotolaGO+ is off. Next: the owner types the payment details in the admin screen (docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md, « Saison (paiement manuel) »).'
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
