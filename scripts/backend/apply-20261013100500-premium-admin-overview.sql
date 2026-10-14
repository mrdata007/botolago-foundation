-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply migration 20261013100500: the BotolaGO+ admin overview also counts members by product
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
--   4. In the line `select set_config('bg.premium_overview_mode', 'rehearsal', true);` near the
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261013100500') then
    raise exception 'stop: 20261013100500 is already recorded as applied';
  end if;
  foreach needed in array array['20261013100000', '20261013100100', '20261013100200'] loop
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
  '20261013100500',
  'premium_admin_overview_by_product',
  array[$bg_20261013100500_file$-- BotolaGO+ (membership), part 6: members by product on the admin overview.
--
-- The /admin/plus screen shows, beside the members by state, how many members each product has
-- (docs/plans/BOTOLAGO_PLUS_PLAN.md section 5.9). api.admin_premium_overview() (20261013100200)
-- answers the counts by state and the product list with its prices, but not the counts by product.
-- This replaces that one function, signature unchanged, with the same body plus one key:
--
--   membersByProduct   { "<product code>": { "<effective state>": n, ... }, ... }
--
-- COUNTS ONLY, like the rest of the answer: no account, no id, nothing about any member. The states
-- are the same effective states as membersByState (the stored state with its dates applied), so a
-- product's counts add up to the total of membersByState. A product nobody holds, and a state nobody
-- is in, are absent rather than zero.
--
-- NOTHING ELSE CHANGES. Same security definer with an empty search_path, same gate
-- (premium.read, MFA through admin_assert_permission), same grants (authenticated only), same
-- comment style. No table, no other function, no job, no row. A database this migration has not
-- reached answers the older shape and the screen shows the by-product counts as unavailable.

create or replace function api.admin_premium_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_assert_permission('premium.read', false);
  return jsonb_build_object(
    'settings', (
      select jsonb_build_object('mode', s.mode, 'checkoutEnabled', s.checkout_enabled,
        'billingPaused', s.billing_paused)
      from app_private.premium_settings s where s.id),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('code', p.code, 'periodMonths', p.period_months,
        'renews', p.renews, 'priceMinor', p.price_minor, 'currency', p.currency,
        'active', p.active) order by p.sort_order, p.code)
      from app_private.premium_products p), '[]'::jsonb),
    'membersByState', coalesce((
      select jsonb_object_agg(counted.state, counted.n)
      from (
        select app_private.premium_effective_state(
            e.state, e.source, e.current_period_end, e.grace_until) as state,
          count(*) as n
        from app.premium_entitlements e
        group by 1
      ) counted), '{}'::jsonb),
    'membersByProduct', coalesce((
      select jsonb_object_agg(by_product.product_code, by_product.states)
      from (
        select counted.product_code,
          jsonb_object_agg(counted.state, counted.n order by counted.state) as states
        from (
          select e.product_code,
            app_private.premium_effective_state(
              e.state, e.source, e.current_period_end, e.grace_until) as state,
            count(*) as n
          from app.premium_entitlements e
          group by 1, 2
        ) counted
        group by counted.product_code
      ) by_product), '{}'::jsonb),
    'liveGrants', (
      select count(distinct g.user_id) from app_private.premium_grants g
      where g.revoked_at is null and g.starts_at <= statement_timestamp()
        and g.ends_at > statement_timestamp()),
    'lastEventAt', (select max(b.received_at) from app_private.billing_events b)
  );
end;
$$;

-- create or replace keeps the grants; stated again so this file reads on its own.
revoke all on function api.admin_premium_overview() from public, anon, authenticated, service_role;
grant execute on function api.admin_premium_overview() to authenticated;
comment on function api.admin_premium_overview() is
  'Staff (premium.read): BotolaGO+ settings, products, members by effective state and by product (counts only, no member listed) and live grants.';

notify pgrst, 'reload schema';
$bg_20261013100500_file$]
);

do $apply$
declare
  part_20261013100500 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261013100500'
  );
begin
  if encode(sha256(convert_to(part_20261013100500, 'UTF8')), 'hex')
    is distinct from '282545c0b39aa889dc9e6f2d9f18fe4ce103ffdaf71c630cf844404a1eec3180' then
    raise exception 'stop: 20261013100500 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261013100500;
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
  if (select count(*) from supabase_migrations.schema_migrations where version = '20261013100500') <> 1 then
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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261013100500')
    then 'Applied. The BotolaGO+ admin overview now counts members by product. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
