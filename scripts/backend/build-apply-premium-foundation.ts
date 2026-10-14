/**
 * Builds scripts/backend/apply-20261013100000-premium-foundation.sql: the ONE
 * guarded script the owner pastes in the Supabase SQL editor to install the
 * BotolaGO+ backend (migrations 20261013100000 .. 20261013100300), first on
 * staging (srdrflfrfpwixsllveid), then on production (tkewgajrljbwgwedqsxn).
 *
 *   bun scripts/backend/build-apply-premium-foundation.ts          # rewrite the script
 *   bun scripts/backend/build-apply-premium-foundation.ts --check  # exit 1 if it drifted
 *
 * The script carries each migration file byte for byte, once, with its sha256;
 * apply-premium-foundation-script.test.ts fails when the committed script
 * differs from what this file builds from the files in supabase/migrations.
 * Rerun this after a migration file changes (only while it is unapplied
 * everywhere: CLAUDE.md, "Migrations").
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const SCRIPT_PATH = "scripts/backend/apply-20261013100000-premium-foundation.sql";

export const MIGRATIONS = [
  { version: "20261013100000", name: "premium_schema" },
  { version: "20261013100100", name: "card_editions" },
  { version: "20261013100200", name: "premium_api" },
  { version: "20261013100300", name: "premium_account_erasure" },
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
  const versions = files.map((f) => `'${f.version}'`).join(", ");
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
-- Apply the BotolaGO+ membership backend, migrations 20261013100000 to
-- 20261013100300 (docs/plans/BOTOLAGO_PLUS_PLAN.md section 5, owner decisions of
-- 2026-10-12/13): 20 MAD a month or 200 MAD a year (12 months, no automatic
-- renewal), the card editions (standard free; holo, electric, pixel, chrome
-- paid), the billing event model (provider-agnostic, one row per provider
-- event id), the membership check, the staff grant functions, and the account
-- erasure's handling of memberships.
--
-- It adds eight tables (app.premium_entitlements, app.card_editions,
-- app.card_edition_choices, app_private.premium_settings, premium_products,
-- billing_customers, billing_events, premium_grants), the membership check
-- app_private.has_premium, the switch app_private.premium_configure, seven api
-- functions, two staff permissions (premium.read, premium.grant), and it
-- REPLACES three functions: api.get_my_manager_card and api.get_manager_cards
-- (each gains one key, edition; nothing else about them changes) and
-- app_private.account_deletion_erase (two additions: it pseudonymises the
-- member's billing events and refuses while a renewing web subscription is
-- still billed). It schedules no job.
--
-- IT SHIPS OFF AND EMPTY. premium_settings.mode is 'off', checkout is
-- disabled, billing is not paused. While off, nobody is a member, every card
-- says 'standard', get_my_premium answers {"available": false}. No member, no
-- grant, no event exists. Turning anything on is a separate, later step with
-- its own switch (docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md).
--
-- WHEN
--   After the pull request that adds this file is merged and its
--   database-quality job passed. Staging first. Any quiet moment; not at
--   minute 23 of an hour (the account deletion worker).
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run
--     in progress, no other query running, no other agent or workflow working on
--     the database.
--   * Pause automatic account deletion, then switch it back on afterwards if it
--     was on:
--       select app_private.account_deletion_configure(false);
--     The script refuses while it is on or while a request is being processed,
--     because it replaces the function that erases accounts.
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every
--      guard and every check runs on the real code path inside one transaction,
--      and the script ends with a deliberate error whose message carries the
--      state it computed ("REHEARSAL PASSED -- nothing was saved: {...}"). That
--      error is the expected, good outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select to_regclass('app_private.premium_settings') is null as rolled_back;
--      It must say true.
--   4. In the line \`select set_config('bg.premium_mode', 'rehearsal', true);\`
--      near the top, change 'rehearsal' to 'apply' and press Run again. The
--      result row says "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any BotolaGO+ object exists, or where the
--     migrations it builds on (the Manager Card reads of 20261012200100, the
--     account erasure of 20261006143700 and its Manager Card lock) are not
--     recorded, or while account deletion is on;
--   * records each of the four migration files in
--     supabase_migrations.schema_migrations, whole as statements[1], and runs
--     them in order from those records once each one's sha256 matches the
--     repository file;
--   * checks the result without saving anything: mode off, checkout off, two
--     products at 20 and 200 MAD, five editions, no member rows, every table's
--     row security forced and closed to every API role, every function's grants,
--     the erasure and the card reads patched, the status and the member read
--     answering "off", no job added.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.premium_mode', 'rehearsal', true);

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  needed text;
  erase_definition text;
  anchor text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in (${versions})) then
    raise exception 'stop: a BotolaGO+ migration is already recorded as applied';
  end if;
  foreach needed in array array['20260926003100', '20261006143700', '20261008123100', '20261010120200', '20261012200100'] loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: migrations this builds on are not applied yet: %', missing;
  end if;
  foreach needed in array array[
    'app.profiles', 'app.account_deletion_requests', 'app_private.account_deletion_settings',
    'app_private.staff_principals', 'app_private.admin_roles', 'app_private.admin_permissions',
    'app_private.admin_role_permissions', 'app_private.admin_audit_events', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.set_updated_at()', 'app_private.assert_mfa_step_up()',
    'app_private.refuse_unverified_mfa_actor()', 'app_private.is_service_request()',
    'app_private.admin_assert_permission(text,boolean)', 'app_private.write_admin_audit(uuid,text,text,uuid,text,uuid,uuid,uuid,jsonb,jsonb,app_private.admin_audit_outcome,text,boolean)',
    'app_private.admin_begin_idempotent_operation(uuid,text,uuid,jsonb)',
    'app_private.admin_complete_idempotent_operation(uuid,text,uuid,jsonb)',
    'app_private.manager_card_read_ready()', 'app_private.manager_card_my_card(uuid)',
    'app_private.manager_card_member_card(uuid[])', 'app_private.manager_card_ovr_moments(uuid)',
    'api.get_my_manager_card()', 'api.get_manager_cards(uuid[])',
    'app_private.account_deletion_erase(uuid,integer)'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if not exists (select 1 from app_private.admin_roles where name = 'platform_admin') then
    raise exception 'stop: the platform_admin role does not exist';
  end if;
  foreach needed in array array[
    'app.premium_entitlements', 'app.card_editions', 'app.card_edition_choices',
    'app_private.premium_settings', 'app_private.premium_products',
    'app_private.billing_customers', 'app_private.billing_events', 'app_private.premium_grants'
  ] loop
    if to_regclass(needed) is not null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: a BotolaGO+ table already exists: %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app_private', 'api')
      and (p.proname like '%premium%' or p.proname like 'card\\_edition%' or p.proname = 'choose_card_design'
        or p.proname = 'service_apply_billing_event')) then
    raise exception 'stop: a BotolaGO+ function already exists';
  end if;
  if exists (select 1 from app_private.admin_permissions where name in ('premium.read', 'premium.grant')) then
    raise exception 'stop: a premium.* staff permission already exists';
  end if;
  if exists (select 1 from cron.job where jobname like '%premium%' or jobname like '%billing%') then
    raise exception 'stop: a premium or billing job already exists';
  end if;

  -- The erasure must be the reviewed version (patched once, for the Manager Card lock).
  erase_definition := pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure);
  if position('botolago:manager-card' in erase_definition) = 0 then
    raise exception 'stop: the account erasure does not hold the Manager Card lock (20261008123100) -- it is not the version this patches';
  end if;
  foreach anchor in array array[
    E'  perform app_private.account_deletion_disable(target);\\n',
    E'  -- The account itself. Cascades to the profile and every per-account table.\\n  delete from auth.users where id = target;\\n'
  ] loop
    if (length(erase_definition) - length(replace(erase_definition, anchor, ''))) / length(anchor) <> 1 then
      raise exception 'stop: the account erasure is not the version this patches (an anchor is not found exactly once)';
    end if;
  end loop;
  if position('premium' in erase_definition) > 0 then
    raise exception 'stop: the account erasure already mentions premium';
  end if;

  -- AGENTS.md: the erasure is replaced, so account deletion must not be running.
  if exists (select 1 from app_private.account_deletion_settings where enabled) then
    raise exception 'stop: automatic account deletion is on -- pause it first with select app_private.account_deletion_configure(false); and switch it back on afterwards';
  end if;
  if exists (select 1 from app.account_deletion_requests where status = 'processing') then
    raise exception 'stop: an account deletion request is being processed -- wait for the worker to finish';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The four migrations, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
${inserts}

-- ---------------------------------------------------------------------------
-- Run them, in order, from the history, once each is the repository file byte for byte
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
  fn text;
  who text;
  tbl text;
  rec record;
  state jsonb;
  status jsonb;
  mine jsonb;
begin
  -- The switch: one row, off.
  if (select count(*) from app_private.premium_settings) <> 1
    or exists (select 1 from app_private.premium_settings
      where mode is distinct from 'off' or checkout_enabled or billing_paused) then
    problems := problems || 'premium_settings is not one row with mode off, checkout off and billing not paused'::text;
  end if;

  -- The owner's prices and the editions.
  if (select string_agg(code || '/' || period_months || '/' || renews || '/' || price_minor || '/' || currency,
        ',' order by sort_order) from app_private.premium_products)
    is distinct from 'plus_monthly/1/true/2000/MAD,plus_yearly/12/false/20000/MAD' then
    problems := problems || 'the products are not 20 MAD a month (renews) and 200 MAD a year (does not renew)'::text;
  end if;
  if (select string_agg(code || '/' || premium, ',' order by sort_order) from app.card_editions)
    is distinct from 'standard/false,holo/true,electric/true,pixel/true,chrome/true' then
    problems := problems || 'the editions are not standard (free) and holo, electric, pixel, chrome (paid)'::text;
  end if;

  -- Nothing about any member exists.
  if (select count(*) from app.premium_entitlements) <> 0
    or (select count(*) from app_private.billing_events) <> 0
    or (select count(*) from app_private.billing_customers) <> 0
    or (select count(*) from app_private.premium_grants) <> 0
    or (select count(*) from app.card_edition_choices) <> 0 then
    problems := problems || 'a member row exists -- none may ship'::text;
  end if;

  -- Every table: row security forced, no right for any API role.
  foreach tbl in array array[
    'app.premium_entitlements', 'app.card_editions', 'app.card_edition_choices',
    'app_private.premium_settings', 'app_private.premium_products',
    'app_private.billing_customers', 'app_private.billing_events', 'app_private.premium_grants'
  ] loop
    foreach who in array array['anon', 'authenticated', 'service_role'] loop
      if has_any_column_privilege(who, tbl::regclass, 'select,insert,update,references')
        or has_table_privilege(who, tbl::regclass, 'delete,truncate,trigger') then
        problems := problems || (who || ' has a right on ' || tbl);
      end if;
    end loop;
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = tbl::regclass) then
      problems := problems || ('row security is not forced on ' || tbl);
    end if;
  end loop;

  -- The api functions: who may run what.
  for rec in select * from (values
    ('api.premium_status()', 'anon,authenticated,service_role', ''),
    ('api.get_my_premium()', 'authenticated,service_role', 'anon'),
    ('api.choose_card_design(text)', 'authenticated,service_role', 'anon'),
    ('api.get_my_manager_card()', 'authenticated,service_role', 'anon'),
    ('api.get_manager_cards(uuid[])', 'authenticated,service_role', 'anon'),
    ('api.service_apply_billing_event(jsonb)', 'service_role', 'anon,authenticated'),
    ('api.admin_premium_overview()', 'authenticated', 'anon,service_role'),
    ('api.admin_get_premium_member(uuid,text,uuid)', 'authenticated', 'anon,service_role'),
    ('api.admin_grant_premium(uuid,timestamptz,text,uuid)', 'authenticated', 'anon,service_role'),
    ('api.admin_revoke_premium(uuid,text,uuid)', 'authenticated', 'anon,service_role')
  ) as t(signature, may, may_not) loop
    if to_regprocedure(rec.signature) is null then
      problems := problems || (rec.signature || ' is missing');
      continue;
    end if;
    foreach who in array string_to_array(rec.may, ',') loop
      if who <> '' and not has_function_privilege(who, to_regprocedure(rec.signature), 'execute') then
        problems := problems || (who || ' cannot run ' || rec.signature);
      end if;
    end loop;
    foreach who in array string_to_array(rec.may_not || ',public', ',') loop
      if who <> '' and has_function_privilege(who, to_regprocedure(rec.signature), 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
  end loop;

  -- Helpers: no API role. The switch: postgres only.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and (p.proname in ('has_premium', 'premium_next_state', 'premium_effective_state',
        'premium_configure', 'premium_erase_user', 'card_edition_effective'))
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
  end loop;
  if not has_function_privilege('postgres', to_regprocedure('app_private.premium_configure(text,boolean,boolean)'), 'execute') then
    problems := problems || 'postgres cannot run app_private.premium_configure'::text;
  end if;

  -- The step-up trigger on the one table a signed-in client writes through a function.
  if not exists (select 1 from pg_trigger
    where tgrelid = 'app.card_edition_choices'::regclass
      and tgfoid = 'app_private.refuse_unverified_mfa_actor()'::regprocedure and tgenabled = 'O') then
    problems := problems || 'the step-up trigger is missing on app.card_edition_choices'::text;
  end if;

  -- The two permissions, held by platform_admin.
  if (select count(*) from app_private.admin_role_permissions m
      join app_private.admin_roles r on r.id = m.role_id
      join app_private.admin_permissions p on p.id = m.permission_id
      where r.name = 'platform_admin' and p.name in ('premium.read', 'premium.grant')) <> 2 then
    problems := problems || 'platform_admin does not hold premium.read and premium.grant'::text;
  end if;

  -- The patched functions.
  if position('premium_erase_user' in pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure)) = 0
    or position('botolago:manager-card' in pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure)) = 0
    or position('account_deletion_subscription_active' in pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure)) = 0 then
    problems := problems || 'the account erasure is not patched as reviewed'::text;
  end if;
  if position('card_edition_effective' in pg_get_functiondef('api.get_my_manager_card()'::regprocedure)) = 0
    or position('ovrChanges' in pg_get_functiondef('api.get_my_manager_card()'::regprocedure)) = 0
    or position('card_edition_effective' in pg_get_functiondef('api.get_manager_cards(uuid[])'::regprocedure)) = 0
    or position('manager_card_member_card' in pg_get_functiondef('api.get_manager_cards(uuid[])'::regprocedure)) = 0 then
    problems := problems || 'the two card reads are not the reviewed versions with the edition added'::text;
  end if;

  -- Off means off.
  status := api.premium_status();
  if status is distinct from '{"enabled": false, "checkoutEnabled": false, "prices": [], "savingMinor": null, "editions": []}'::jsonb then
    problems := problems || ('the public status while off is ' || coalesce(status::text, 'nothing'));
  end if;
  mine := api.get_my_premium();
  if mine is distinct from '{"available": false}'::jsonb then
    problems := problems || ('the member read while off is ' || coalesce(mine::text, 'nothing'));
  end if;
  if app_private.has_premium(gen_random_uuid()) then
    problems := problems || 'has_premium answered true while off'::text;
  end if;
  if app_private.card_edition_effective(gen_random_uuid(), null) <> 'standard' then
    problems := problems || 'a card edition is not standard while off'::text;
  end if;

  -- No job was added, and the four history rows are there.
  if exists (select 1 from cron.job where jobname like '%premium%' or jobname like '%billing%') then
    problems := problems || 'a premium or billing job was scheduled'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in (${versions})) <> ${files.length} then
    problems := problems || 'a history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  state := jsonb_build_object(
    'mode', (select mode from app_private.premium_settings),
    'checkoutEnabled', (select checkout_enabled from app_private.premium_settings),
    'billingPaused', (select billing_paused from app_private.premium_settings),
    'products', (select jsonb_agg(code || ' ' || price_minor || ' ' || currency order by sort_order) from app_private.premium_products),
    'editions', (select jsonb_agg(code order by sort_order) from app.card_editions),
    'memberRows', 0,
    'status', status,
    'historyRows', ${files.length}
  );
  perform set_config('bg.premium_apply_state', state::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.premium_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.premium_apply_state', true);
  end if;
  raise notice 'premium: applying: %', current_setting('bg.premium_apply_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${files[0].version}')
    then 'Applied. BotolaGO+ is in place and OFF: mode off, checkout disabled, no member rows. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
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
