-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Apply BotolaGO+ « Saison », migrations 20261016150000 and 20261016150100
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
--   4. In the line `select set_config('bg.premium_season_mode', 'rehearsal', true);` near the top,
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
  foreach needed in array array['20261016150000', '20261016150100'] loop
    if exists (select 1 from supabase_migrations.schema_migrations where version = needed) then
      raise exception 'stop: % is already recorded as applied', needed;
    end if;
  end loop;
  foreach needed in array array['20260924120000', '20261013100000', '20261013100100', '20261013100200', '20261013100300', '20261013100500'] loop
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
    'api.premium_status()', 'api.get_my_premium()', 'api.admin_get_premium_member(uuid,text,uuid)'
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
    from pg_proc p where p.oid in ('api.premium_status()'::regprocedure, 'api.get_my_premium()'::regprocedure, 'api.admin_get_premium_member(uuid,text,uuid)'::regprocedure)), true);
  perform set_config('bg.premium_season_acl', (select string_agg(
      p.oid::regprocedure::text || '=' || has_function_privilege('anon', p.oid, 'execute')::text
        || has_function_privilege('authenticated', p.oid, 'execute')::text
        || has_function_privilege('service_role', p.oid, 'execute')::text, ';' order by p.oid::regprocedure::text)
    from pg_proc p where p.oid in ('api.premium_status()'::regprocedure, 'api.get_my_premium()'::regprocedure, 'api.admin_get_premium_member(uuid,text,uuid)'::regprocedure)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migrations, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016150000',
  'premium_season_schema',
  array[$bg_20261016150000_file$-- BotolaGO+ « Saison », part 1: the product, the payment details, the payment codes and the
-- payment record on a grant.
--
-- Owner decisions, 2026-10-15 (docs/product/botolago-plus-season-brief.md):
--
--   * No subscription. One purchase, "Saison", 200 MAD, the same price whenever it is bought,
--     valid until the END of the current Fantasy season (app.fantasy_seasons.ends_at of
--     app_private.fantasy_prize_current_season()). No renewal, no cancel, no grace.
--   * For now it is paid by hand: a bank transfer or CashPlus / Wafacash. The buyer sends the
--     receipt on WhatsApp and staff activate the Saison in the admin screen
--     (20261016150100: api.admin_activate_premium_season). No card checkout.
--   * The owner types the payment details (bank, recipient, WhatsApp number) in an admin form.
--     They are never in code or in a migration: this file creates the empty row.
--
-- SHIPS OFF. BotolaGO+ stays behind app_private.premium_settings.mode (off by default), so
-- nothing becomes visible to anybody until the owner switches it on. This file:
--
--   * adds the product plus_season (active) and makes plus_monthly and plus_yearly inactive.
--     They are NOT deleted: grants, entitlements and billing events reference them. An
--     inactive product is not sold (api.service_apply_billing_event ignores a purchase of it)
--     and is not listed by api.premium_status; members who hold one keep what they paid for;
--   * lets a product have no number of months (period_months null): the Saison ends at the
--     season end, not after a number of months. A product without months cannot renew;
--   * adds app_private.premium_payment_details (one row, owner-editable) and
--     app_private.premium_pay_codes (one personal payment code per account);
--   * adds the payment record to app_private.premium_grants (all columns nullable, so every
--     existing grant stays valid and unchanged);
--   * adds app_private.premium_season_end(), the end of the current Fantasy season.
--
-- No existing row is removed or rewritten except the two updates to active = false. The api
-- functions follow in 20261016150100.
--
-- Every new table: row security enabled and forced, all rights revoked from public, anon,
-- authenticated and service_role, no policy, an index on every foreign-key column. Reads and
-- writes go through api functions.

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
alter table app_private.premium_products alter column period_months drop not null;
alter table app_private.premium_products drop constraint premium_products_period_check;
alter table app_private.premium_products add constraint premium_products_period_check check (
  coalesce(period_months in (1, 12), not renews)
);
comment on column app_private.premium_products.period_months is
  'Months of access from the purchase (1 or 12). Null for a product that lasts until the end of the Fantasy season (plus_season); such a product never renews.';

insert into app_private.premium_products (code, period_months, renews, price_minor, currency, sort_order)
values ('plus_season', null, false, 20000, 'MAD', 0);

update app_private.premium_products set active = false where code in ('plus_monthly', 'plus_yearly');

comment on table app_private.premium_products is
  'BotolaGO+ products. price_minor is the amount the buyer pays in the currency''s minor unit (centimes), tax included. renews is false for every product sold from 20261016150000: plus_season (200 MAD, until the end of the current Fantasy season, period_months null) is the only active one; plus_monthly and plus_yearly stay (rows reference them) but are inactive. provider_product_ids maps a provider or store to its product id (set when the stores and the payment provider exist).';

-- ---------------------------------------------------------------------------
-- The end of the current Fantasy season: how long a Saison lasts
-- ---------------------------------------------------------------------------
create function app_private.premium_season_end()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select season.ends_at from app.fantasy_seasons season
  where season.id = app_private.fantasy_prize_current_season();
$$;
revoke all on function app_private.premium_season_end() from public, anon, authenticated, service_role;
comment on function app_private.premium_season_end() is
  'When the current Fantasy season ends (app_private.fantasy_prize_current_season), or null when there is none. A Saison is valid until then. No grant.';

-- ---------------------------------------------------------------------------
-- Payment details: what the buyer pays to. One row, typed by the owner in the admin screen.
-- ---------------------------------------------------------------------------
create table app_private.premium_payment_details (
  id boolean primary key default true,
  bank_holder text,
  bank_name text,
  rib text,
  cashplus_name text,
  whatsapp_number text,
  note_fr text,
  note_ar text,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  constraint premium_payment_details_singleton check (id),
  constraint premium_payment_details_texts_check check (
    (bank_holder is null or (bank_holder = btrim(bank_holder) and char_length(bank_holder) between 1 and 120))
    and (bank_name is null or (bank_name = btrim(bank_name) and char_length(bank_name) between 1 and 120))
    and (cashplus_name is null or (cashplus_name = btrim(cashplus_name) and char_length(cashplus_name) between 1 and 120))
    and (rib is null or (rib ~ '^[A-Za-z0-9][A-Za-z0-9 .-]{8,38}[A-Za-z0-9]$'))
    and (note_fr is null or (note_fr = btrim(note_fr) and char_length(note_fr) between 1 and 300))
    and (note_ar is null or (note_ar = btrim(note_ar) and char_length(note_ar) between 1 and 300))
  ),
  constraint premium_payment_details_whatsapp_check check (
    whatsapp_number is null or whatsapp_number ~ '^\+?[0-9]{8,16}$'
  )
);
create index premium_payment_details_updated_by_idx
  on app_private.premium_payment_details (updated_by_principal_id)
  where updated_by_principal_id is not null;
insert into app_private.premium_payment_details (id) values (true);
alter table app_private.premium_payment_details enable row level security;
alter table app_private.premium_payment_details force row level security;
revoke all on app_private.premium_payment_details from public, anon, authenticated, service_role;
comment on table app_private.premium_payment_details is
  'Where a Saison is paid: bank holder, bank, RIB, the CashPlus / Wafacash recipient and the WhatsApp number that receives the receipts. One row, empty at first, typed by the owner (never in code) through api.admin_set_premium_payment_details (premium.grant, audited without the RIB) and read by buyers through api.get_premium_payment_details while BotolaGO+ is not off.';

-- ---------------------------------------------------------------------------
-- Payment codes: a personal code the buyer writes in the transfer, to find them again
-- ---------------------------------------------------------------------------
create table app_private.premium_pay_codes (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint premium_pay_codes_code_key unique (code),
  constraint premium_pay_codes_code_check check (code ~ '^BG-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$')
);
alter table app_private.premium_pay_codes enable row level security;
alter table app_private.premium_pay_codes force row level security;
revoke all on app_private.premium_pay_codes from public, anon, authenticated, service_role;
comment on table app_private.premium_pay_codes is
  'One personal payment code per account, BG- and six characters from an alphabet without 0, O, 1 and I, made on the first request (api.get_my_premium_pay_code). The buyer writes it in the reason of the transfer; staff find the account with it (api.admin_find_premium_member_by_code). Deleted with the account.';

create function app_private.premium_pay_code_new()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  result text := 'BG-';
  i integer;
begin
  -- 32 characters, so a byte modulo 32 is unbiased.
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;
revoke all on function app_private.premium_pay_code_new() from public, anon, authenticated, service_role;
comment on function app_private.premium_pay_code_new() is
  'A new payment code candidate (BG- and six characters of an alphabet without 0, O, 1, I); the caller retries on a collision. No grant.';

-- ---------------------------------------------------------------------------
-- The payment record on a grant (all nullable: every existing grant stays valid)
-- ---------------------------------------------------------------------------
alter table app_private.premium_grants
  add column product_code text references app_private.premium_products(code) on delete restrict,
  add column payment_method text,
  add column payment_reference text,
  add column amount_minor integer,
  add column currency text default 'MAD';
alter table app_private.premium_grants
  add constraint premium_grants_payment_method_check check (
    payment_method is null or payment_method in ('bank_transfer', 'cashplus', 'wafacash', 'free')
  ),
  add constraint premium_grants_payment_reference_check check (
    payment_reference is null or (payment_reference = btrim(payment_reference)
      and char_length(payment_reference) between 1 and 80)
  ),
  add constraint premium_grants_amount_check check (amount_minor is null or amount_minor >= 0),
  add constraint premium_grants_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  -- A paid method always carries its reference, and a method always names its product.
  add constraint premium_grants_payment_record_check check (
    payment_method is null
    or (product_code is not null and (payment_method = 'free' or payment_reference is not null))
  );
create index premium_grants_product_idx on app_private.premium_grants (product_code)
  where product_code is not null;
comment on table app_private.premium_grants is
  'BotolaGO+ access given by staff: a complimentary access (api.admin_grant_premium, no product) or a paid Saison activated by hand (api.admin_activate_premium_season: product plus_season, payment method, receipt reference, amount). A grant is live from starts_at to ends_at unless revoked. Written only by those two functions and api.admin_revoke_premium, each audited. Deleted with the account.';
$bg_20261016150000_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016150100',
  'premium_season_api',
  array[$bg_20261016150100_file$-- BotolaGO+ « Saison », part 2: the API.
--
-- Over the tables of 20261016150000:
--
--   api.get_premium_payment_details()          signed in; where to pay (not while off)
--   api.get_my_premium_pay_code()              signed in; the caller's personal payment code
--   api.admin_get_premium_payment_details()    staff, premium.read
--   api.admin_set_premium_payment_details(...) staff, premium.grant + recent authentication
--   api.admin_find_premium_member_by_code(...) staff, premium.read, audited
--   api.admin_activate_premium_season(...)     staff, premium.grant + recent authentication
--
-- and three functions of 20261013100200 replaced, same signature, same grants:
--
--   api.premium_status()            the price list now carries validUntil (the season end);
--                                   plus_monthly and plus_yearly are inactive, so only
--                                   plus_season is listed and savingMinor is null
--   api.get_my_premium()            a live grant reports its own product (plus_season) and
--                                   its end as currentPeriodEnd
--   api.admin_get_premium_member()  each grant also carries productCode, paymentMethod,
--                                   paymentReference and amountMinor
--
-- OFF IS AN ANSWER, as for the rest of BotolaGO+: while premium_settings.mode is 'off', the two
-- member reads answer {"available": false}, checked before the step-up and before the caller is
-- read. Signed-in reads run, in order: the off answer, app_private.assert_mfa_step_up(), the
-- caller (PT401). Granted to authenticated, never to anon.
--
-- A SAISON IS A GRANT. api.admin_activate_premium_season writes one app_private.premium_grants
-- row from now to the end of the current Fantasy season, with the product, how it was paid, the
-- receipt reference and the amount. The membership check (app_private.has_premium) already
-- counts a live grant, so nothing else changes, and nothing is sold twice: an account whose
-- grant already lasts to the season end is refused (PT409 season_already_active).
--
-- THE RIB IS NOT IN THE AUDIT LOG. The audit of a change to the payment details names the fields
-- that changed, never their values, and the idempotency record keeps only {"saved": true}.

-- ---------------------------------------------------------------------------
-- api.premium_status: validUntil on each price
-- ---------------------------------------------------------------------------
create or replace function api.premium_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when s.mode = 'on' then jsonb_build_object(
      'enabled', true,
      'checkoutEnabled', s.checkout_enabled,
      'prices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'code', p.code,
          'periodMonths', p.period_months,
          'renews', p.renews,
          'priceMinor', p.price_minor,
          'currency', p.currency,
          'validUntil', case when p.period_months is null then app_private.premium_season_end() end
        ) order by p.sort_order, p.code)
        from app_private.premium_products p where p.active), '[]'::jsonb),
      'savingMinor', (
        select m.price_minor * 12 - y.price_minor
        from app_private.premium_products m
        join app_private.premium_products y on y.code = 'plus_yearly' and y.active
          and y.currency = m.currency
        where m.code = 'plus_monthly' and m.active and m.price_minor * 12 > y.price_minor),
      'editions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'code', e.code,
          'premium', e.premium,
          'finish', e.finish,
          'labels', jsonb_build_object('fr', e.label_fr, 'ar', e.label_ar)
        ) order by e.sort_order, e.code)
        from app.card_editions e
        where e.status = 'active'
          and (e.starts_at is null or e.starts_at <= statement_timestamp())
          and (e.ends_at is null or e.ends_at > statement_timestamp())), '[]'::jsonb)
    ) end
    from app_private.premium_settings s where s.id
  ), jsonb_build_object(
    'enabled', false, 'checkoutEnabled', false, 'prices', '[]'::jsonb,
    'savingMinor', null, 'editions', '[]'::jsonb));
$$;
revoke all on function api.premium_status() from public, anon, authenticated, service_role;
grant execute on function api.premium_status() to anon, authenticated, service_role;
comment on function api.premium_status() is
  'Public BotolaGO+ facts for the paywall: {enabled, checkoutEnabled, prices, savingMinor, editions}. enabled is true only when mode is on; otherwise nothing is disclosed (empty lists). prices lists the active products as {code, periodMonths, renews, priceMinor, currency, validUntil}: the Saison is plus_season, periodMonths null, renews false, validUntil the end of the current Fantasy season (null when there is none). Prices are tax included, in minor units (centimes). Never raises.';

-- ---------------------------------------------------------------------------
-- api.get_my_premium: a live grant reports its own product and end
-- ---------------------------------------------------------------------------
create or replace function api.get_my_premium()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  ent app.premium_entitlements%rowtype;
  prod app_private.premium_products%rowtype;
  grant_end timestamptz;
  grant_product text;
  v_state text;
  v_member boolean;
  chosen text;
begin
  select s.mode into mode from app_private.premium_settings s where s.id;
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  v_member := app_private.has_premium(actor);
  -- In preview only members (a grant or a valid entitlement: the owner, staff) see anything.
  if mode = 'preview' and not v_member then
    return jsonb_build_object('available', false);
  end if;

  select * into ent from app.premium_entitlements e where e.user_id = actor;
  if found then
    select * into prod from app_private.premium_products p where p.code = ent.product_code;
    v_state := app_private.premium_effective_state(
      ent.state, ent.source, ent.current_period_end, ent.grace_until);
  else
    v_state := 'none';
  end if;
  -- The live grant that lasts longest: its end and the product it was given for (null for a
  -- complimentary access given before the Saison).
  select g.ends_at, g.product_code into grant_end, grant_product
  from app_private.premium_grants g
  where g.user_id = actor and g.revoked_at is null
    and g.starts_at <= statement_timestamp() and g.ends_at > statement_timestamp()
  order by g.ends_at desc, g.created_at desc
  limit 1;
  select c.edition_code into chosen from app.card_edition_choices c where c.user_id = actor;

  return jsonb_build_object(
    'available', true,
    'isMember', v_member,
    'state', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then v_state else 'active' end,
    'productCode', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then ent.product_code else grant_product end,
    'source', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then ent.source else 'grant' end,
    'currentPeriodEnd', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then ent.current_period_end else grant_end end,
    'cancelAtPeriodEnd', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then v_state = 'cancelling' or ent.cancel_requested_at is not null
        or coalesce(not prod.renews, false)
      else true end,
    'graceUntil', case when v_state = 'grace' then ent.grace_until end,
    'chosenEdition', coalesce(chosen, 'standard'),
    'edition', app_private.card_edition_effective(actor, actor),
    'editions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', e.code,
        'premium', e.premium,
        'finish', e.finish,
        'labels', jsonb_build_object('fr', e.label_fr, 'ar', e.label_ar),
        'selectable', not e.premium or v_member
      ) order by e.sort_order, e.code)
      from app.card_editions e
      where e.status = 'active'
        and (e.starts_at is null or e.starts_at <= statement_timestamp())
        and (e.ends_at is null or e.ends_at > statement_timestamp())), '[]'::jsonb)
  );
end;
$$;
revoke all on function api.get_my_premium() from public, anon, authenticated, service_role;
grant execute on function api.get_my_premium() to authenticated, service_role;
comment on function api.get_my_premium() is
  'The caller''s BotolaGO+ membership: {available, isMember, state, productCode, source, currentPeriodEnd, cancelAtPeriodEnd, graceUntil, chosenEdition, edition, editions}. state is the effective state (none, active, cancelling, grace, on_hold, expired, refunded, revoked); an access given by staff (a Saison, product plus_season, or a complimentary access, product null) reads as active with source grant and currentPeriodEnd the grant''s end. {available:false} while off (and in preview for anyone who is not a member). Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.get_premium_payment_details: where the buyer pays
-- ---------------------------------------------------------------------------
create function api.get_premium_payment_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  details app_private.premium_payment_details%rowtype;
  prod app_private.premium_products%rowtype;
begin
  select s.mode into mode from app_private.premium_settings s where s.id;
  if mode is null or mode = 'off' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  select * into details from app_private.premium_payment_details d where d.id;
  if details.whatsapp_number is null then
    return jsonb_build_object('available', false);
  end if;
  select * into prod from app_private.premium_products p where p.code = 'plus_season';
  return jsonb_build_object(
    'available', true,
    'whatsapp', details.whatsapp_number,
    'bankHolder', details.bank_holder,
    'bankName', details.bank_name,
    'rib', details.rib,
    'cashplusName', details.cashplus_name,
    'noteFr', details.note_fr,
    'noteAr', details.note_ar,
    'amountMinor', coalesce(prod.price_minor, 20000),
    'currency', coalesce(prod.currency, 'MAD')
  );
end;
$$;
revoke all on function api.get_premium_payment_details() from public, anon, authenticated, service_role;
grant execute on function api.get_premium_payment_details() to authenticated;
comment on function api.get_premium_payment_details() is
  'Where to pay a Saison, for a signed-in account: {available, whatsapp, bankHolder, bankName, rib, cashplusName, noteFr, noteAr, amountMinor, currency}, with null for a detail the owner has not typed. {available:false} (and nothing else) while BotolaGO+ is off, or when no WhatsApp number is set. Step-up.';

-- ---------------------------------------------------------------------------
-- api.get_my_premium_pay_code: the caller's personal code
-- ---------------------------------------------------------------------------
create function api.get_my_premium_pay_code()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  v_code text;
  attempt integer;
begin
  select s.mode into mode from app_private.premium_settings s where s.id;
  if mode is null or mode = 'off' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not exists (select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null) then
    raise exception using errcode = 'PT404', message = 'premium_account_not_found';
  end if;

  select c.code into v_code from app_private.premium_pay_codes c where c.user_id = actor;
  if v_code is null then
    -- A collision with another account's code (about one in a billion) just draws again; a
    -- concurrent first request of the same account keeps the first code.
    for attempt in 1..10 loop
      insert into app_private.premium_pay_codes (user_id, code)
      values (actor, app_private.premium_pay_code_new())
      on conflict do nothing;
      select c.code into v_code from app_private.premium_pay_codes c where c.user_id = actor;
      exit when v_code is not null;
    end loop;
    if v_code is null then
      raise exception using errcode = 'PT503', message = 'premium_pay_code_unavailable';
    end if;
  end if;
  return jsonb_build_object('available', true, 'code', v_code);
end;
$$;
revoke all on function api.get_my_premium_pay_code() from public, anon, authenticated, service_role;
grant execute on function api.get_my_premium_pay_code() to authenticated;
comment on function api.get_my_premium_pay_code() is
  'The caller''s personal payment code {available, code}, "BG-" and six characters, made on the first request and the same afterwards. {available:false} while BotolaGO+ is off. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- Staff: the payment details (read, write)
-- ---------------------------------------------------------------------------
create function app_private.premium_payment_details_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bankHolder', d.bank_holder,
    'bankName', d.bank_name,
    'rib', d.rib,
    'cashplusName', d.cashplus_name,
    'whatsapp', d.whatsapp_number,
    'noteFr', d.note_fr,
    'noteAr', d.note_ar,
    'updatedAt', d.updated_at,
    'updatedByPrincipalId', d.updated_by_principal_id
  )
  from app_private.premium_payment_details d where d.id;
$$;
revoke all on function app_private.premium_payment_details_json() from public, anon, authenticated, service_role;
comment on function app_private.premium_payment_details_json() is
  'The payment details row as the staff screen reads it. No grant.';

create function api.admin_get_premium_payment_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_assert_permission('premium.read', false);
  return app_private.premium_payment_details_json();
end;
$$;

create function api.admin_set_premium_payment_details(
  p_details jsonb,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  allowed constant text[] := array['bankHolder', 'bankName', 'rib', 'cashplusName', 'whatsapp', 'noteFr', 'noteAr'];
  k text;
  v jsonb;
  clean jsonb := '{}'::jsonb;
  txt text;
  old_row app_private.premium_payment_details%rowtype;
  changed text[] := '{}';
begin
  actor := app_private.admin_assert_permission('premium.grant', true);
  if p_details is null or p_idempotency_key is null or jsonb_typeof(p_details) <> 'object' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;

  -- Only the seven known keys, each a string or null; blank means "not set". The WhatsApp
  -- number is typed the way people write it (spaces, dots, dashes, brackets) and stored as a
  -- plus sign and digits. Whatever is not sent is cleared: the form always sends everything.
  for k in select jsonb_object_keys(p_details) loop
    if not (k = any (allowed)) then
      raise exception using errcode = 'PT400', message = 'premium_payment_details_invalid';
    end if;
  end loop;
  foreach k in array allowed loop
    v := p_details -> k;
    if v is null or jsonb_typeof(v) = 'null' then
      txt := null;
    elsif jsonb_typeof(v) <> 'string' then
      raise exception using errcode = 'PT400', message = 'premium_payment_details_invalid';
    else
      txt := btrim(v #>> '{}');
      if k = 'whatsapp' and txt is not null then
        txt := regexp_replace(txt, '[ .()-]', '', 'g');
      end if;
      if txt = '' then
        txt := null;
      end if;
    end if;
    if txt is not null and (
      (k in ('bankHolder', 'bankName', 'cashplusName') and char_length(txt) > 120)
      or (k = 'rib' and txt !~ '^[A-Za-z0-9][A-Za-z0-9 .-]{8,38}[A-Za-z0-9]$')
      or (k = 'whatsapp' and txt !~ '^\+?[0-9]{8,16}$')
      or (k in ('noteFr', 'noteAr') and char_length(txt) > 300)
    ) then
      raise exception using errcode = 'PT400', message = 'premium_payment_details_invalid';
    end if;
    clean := clean || jsonb_build_object(k, txt);
  end loop;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'premium.set_payment_details', p_idempotency_key,
    jsonb_build_object('details', clean, 'reason', p_reason)
  );
  if prior is not null then
    -- The record keeps only {"saved": true} (no RIB in it): answer with the row as it is.
    return app_private.premium_payment_details_json();
  end if;

  select * into old_row from app_private.premium_payment_details d where d.id for update;
  if old_row.bank_holder is distinct from clean ->> 'bankHolder' then changed := changed || 'bankHolder'::text; end if;
  if old_row.bank_name is distinct from clean ->> 'bankName' then changed := changed || 'bankName'::text; end if;
  if old_row.rib is distinct from clean ->> 'rib' then changed := changed || 'rib'::text; end if;
  if old_row.cashplus_name is distinct from clean ->> 'cashplusName' then changed := changed || 'cashplusName'::text; end if;
  if old_row.whatsapp_number is distinct from clean ->> 'whatsapp' then changed := changed || 'whatsapp'::text; end if;
  if old_row.note_fr is distinct from clean ->> 'noteFr' then changed := changed || 'noteFr'::text; end if;
  if old_row.note_ar is distinct from clean ->> 'noteAr' then changed := changed || 'noteAr'::text; end if;

  update app_private.premium_payment_details set
    bank_holder = clean ->> 'bankHolder',
    bank_name = clean ->> 'bankName',
    rib = clean ->> 'rib',
    cashplus_name = clean ->> 'cashplusName',
    whatsapp_number = clean ->> 'whatsapp',
    note_fr = clean ->> 'noteFr',
    note_ar = clean ->> 'noteAr',
    updated_at = statement_timestamp(),
    updated_by_principal_id = actor
  where id;

  -- Names of the fields that changed, never their values.
  perform app_private.write_admin_audit(
    actor, 'premium.set_payment_details', 'premium', null, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    null,
    jsonb_build_object('changed', to_jsonb(changed))
  );

  perform app_private.admin_complete_idempotent_operation(
    actor, 'premium.set_payment_details', p_idempotency_key, jsonb_build_object('saved', true)
  );
  return app_private.premium_payment_details_json();
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: the member read now carries the payment record of each grant
-- ---------------------------------------------------------------------------
create or replace function api.admin_get_premium_member(
  p_user_id uuid,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  ent app.premium_entitlements%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('premium.read', false);
  if p_user_id is null or p_request_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;
  if not exists (select 1 from app.profiles profile where profile.id = p_user_id) then
    raise exception using errcode = 'PT404', message = 'premium_account_not_found';
  end if;
  select * into ent from app.premium_entitlements e where e.user_id = p_user_id;

  result := jsonb_build_object(
    'userId', p_user_id,
    'isMember', app_private.has_premium(p_user_id),
    'entitlement', case when ent.user_id is null then null else jsonb_build_object(
      'state', ent.state,
      'effectiveState', app_private.premium_effective_state(
        ent.state, ent.source, ent.current_period_end, ent.grace_until),
      'productCode', ent.product_code,
      'source', ent.source,
      'currentPeriodStart', ent.current_period_start,
      'currentPeriodEnd', ent.current_period_end,
      'graceUntil', ent.grace_until,
      'cancelRequestedAt', ent.cancel_requested_at,
      'lastEventAt', ent.last_event_at) end,
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'grantId', g.id, 'startsAt', g.starts_at, 'endsAt', g.ends_at, 'reason', g.reason,
        'revokedAt', g.revoked_at, 'productCode', g.product_code,
        'paymentMethod', g.payment_method, 'paymentReference', g.payment_reference,
        'amountMinor', g.amount_minor) order by g.created_at desc, g.id)
      from app_private.premium_grants g where g.user_id = p_user_id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventId', b.id, 'providerEventId', b.provider_event_id, 'provider', b.provider,
        'source', b.source, 'eventType', b.event_type, 'productCode', b.product_code,
        'occurredAt', b.occurred_at, 'outcome', b.outcome, 'stateBefore', b.state_before,
        'stateAfter', b.state_after, 'amountMinor', b.amount_minor, 'currency', b.currency
      ) order by b.occurred_at desc, b.id desc)
      from (
        select * from app_private.billing_events e2
        where e2.user_id = p_user_id order by e2.occurred_at desc, e2.id desc limit 20
      ) b), '[]'::jsonb)
  );

  perform app_private.write_admin_audit(
    actor, 'premium.view_member', 'premium', p_user_id, p_reason, p_request_id,
    gen_random_uuid(), null, null,
    jsonb_build_object('effectiveState', result #>> '{entitlement,effectiveState}')
  );
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: find a member by the payment code written in the transfer
-- ---------------------------------------------------------------------------
create function api.admin_find_premium_member_by_code(
  p_code text,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_user uuid;
begin
  perform app_private.admin_assert_permission('premium.read', false);
  if p_code is null or p_request_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- Typed by hand from a receipt: any case, spaces around it, the dash optional.
  v_code := upper(regexp_replace(btrim(p_code), '[ ]', '', 'g'));
  if v_code ~ '^BG[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    v_code := 'BG-' || substr(v_code, 3);
  end if;
  if v_code !~ '^BG-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception using errcode = 'PT400', message = 'premium_code_invalid';
  end if;
  select c.user_id into v_user from app_private.premium_pay_codes c where c.code = v_code;
  if v_user is null then
    raise exception using errcode = 'PT404', message = 'premium_code_not_found';
  end if;
  -- The same answer, with the same checks and the same audit entry, as reading the account.
  return api.admin_get_premium_member(v_user, p_reason, p_request_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: activate a Saison once the payment is checked
-- ---------------------------------------------------------------------------
create function api.admin_activate_premium_season(
  p_user_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  v_ref text;
  v_season uuid;
  v_end timestamptz;
  prod app_private.premium_products%rowtype;
  new_grant app_private.premium_grants%rowtype;
  v_amount integer;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('premium.grant', true);
  if p_user_id is null or p_payment_method is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_payment_method not in ('bank_transfer', 'cashplus', 'wafacash', 'free') then
    raise exception using errcode = 'PT400', message = 'premium_payment_method_invalid';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;
  -- The receipt reference: required for a paid method, optional for an offered Saison.
  v_ref := nullif(btrim(coalesce(p_payment_reference, '')), '');
  if v_ref is null and p_payment_method <> 'free' then
    raise exception using errcode = 'PT400', message = 'premium_payment_reference_required';
  end if;
  if v_ref is not null and (char_length(v_ref) > 80 or v_ref ~ '[[:cntrl:]]') then
    raise exception using errcode = 'PT400', message = 'premium_payment_reference_invalid';
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = p_user_id and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'premium_account_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'premium.activate_season', p_idempotency_key,
    jsonb_build_object('userId', p_user_id, 'method', p_payment_method, 'reference', v_ref,
      'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  -- One activation per account at a time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':premium', 0));

  v_season := app_private.fantasy_prize_current_season();
  if v_season is null then
    raise exception using errcode = 'PT409', message = 'premium_season_unavailable';
  end if;
  select season.ends_at into v_end from app.fantasy_seasons season where season.id = v_season;
  if v_end <= statement_timestamp() + interval '1 minute' then
    raise exception using errcode = 'PT409', message = 'premium_season_ended';
  end if;
  -- A sanity check, not a rule: a season end further than this is a data mistake.
  if v_end > statement_timestamp() + interval '400 days' then
    raise exception using errcode = 'PT400', message = 'premium_grant_period_invalid';
  end if;
  select * into prod from app_private.premium_products pr where pr.code = 'plus_season' and pr.active;
  if not found then
    raise exception using errcode = 'PT409', message = 'premium_product_unavailable';
  end if;
  if exists (
    select 1 from app_private.premium_grants g
    where g.user_id = p_user_id and g.revoked_at is null and g.ends_at >= v_end
  ) then
    raise exception using errcode = 'PT409', message = 'season_already_active';
  end if;

  v_amount := case when p_payment_method = 'free' then 0 else prod.price_minor end;
  insert into app_private.premium_grants (
    user_id, ends_at, reason, granted_by_principal_id,
    product_code, payment_method, payment_reference, amount_minor, currency)
  values (
    p_user_id, v_end, p_reason, actor,
    prod.code, p_payment_method, v_ref, v_amount, prod.currency)
  returning * into new_grant;

  perform app_private.write_admin_audit(
    actor, 'premium.activate_season', 'premium', p_user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    null,
    jsonb_build_object('grantId', new_grant.id, 'endsAt', new_grant.ends_at,
      'paymentMethod', new_grant.payment_method, 'paymentReference', new_grant.payment_reference,
      'amountMinor', new_grant.amount_minor)
  );

  result := jsonb_build_object(
    'grantId', new_grant.id, 'userId', p_user_id,
    'startsAt', new_grant.starts_at, 'endsAt', new_grant.ends_at,
    'productCode', new_grant.product_code, 'paymentMethod', new_grant.payment_method,
    'paymentReference', new_grant.payment_reference, 'amountMinor', new_grant.amount_minor,
    'currency', new_grant.currency);
  return app_private.admin_complete_idempotent_operation(
    actor, 'premium.activate_season', p_idempotency_key, result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and comments
-- ---------------------------------------------------------------------------
revoke all on function
  api.admin_get_premium_payment_details(),
  api.admin_set_premium_payment_details(jsonb, text, uuid),
  api.admin_get_premium_member(uuid, text, uuid),
  api.admin_find_premium_member_by_code(text, text, uuid),
  api.admin_activate_premium_season(uuid, text, text, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function
  api.admin_get_premium_payment_details(),
  api.admin_set_premium_payment_details(jsonb, text, uuid),
  api.admin_get_premium_member(uuid, text, uuid),
  api.admin_find_premium_member_by_code(text, text, uuid),
  api.admin_activate_premium_season(uuid, text, text, text, uuid)
to authenticated;
comment on function api.admin_get_premium_payment_details() is
  'Staff (premium.read): the payment details as typed by the owner {bankHolder, bankName, rib, cashplusName, whatsapp, noteFr, noteAr, updatedAt, updatedByPrincipalId}, null for a detail not set.';
comment on function api.admin_set_premium_payment_details(jsonb, text, uuid) is
  'Staff (premium.grant, recent authentication): saves the payment details (the seven keys of the read, all replaced; blank clears a detail; the WhatsApp number is stored as + and digits, 8 to 16), idempotent by key. The audit entry names the fields that changed, never their values. Answers the saved row.';
comment on function api.admin_get_premium_member(uuid, text, uuid) is
  'Staff (premium.read): one member''s entitlement, grants (with productCode, paymentMethod, paymentReference, amountMinor) and last 20 events (no payloads), with a reason; the read is written to the admin audit log.';
comment on function api.admin_find_premium_member_by_code(text, text, uuid) is
  'Staff (premium.read): the same answer as api.admin_get_premium_member for the account whose personal payment code (BG-XXXXXX, any case, dash optional) is given; PT400 premium_code_invalid, PT404 premium_code_not_found. Audited as that read.';
comment on function api.admin_activate_premium_season(uuid, text, text, text, uuid) is
  'Staff (premium.grant, recent authentication): activates the Saison for an account once its payment is checked: a grant from now to the end of the current Fantasy season, product plus_season, payment method (bank_transfer, cashplus, wafacash or free), receipt reference (required unless free), amount (the price, 0 when free). Refused with PT409 season_already_active when a live grant already lasts to the season end, premium_season_unavailable / premium_season_ended without a running season. Idempotent by key, audited as premium.activate_season.';

notify pgrst, 'reload schema';
$bg_20261016150100_file$]
);

-- ---------------------------------------------------------------------------
-- Run them from the history, each once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply_20261016150000$
declare
  part_20261016150000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016150000'
  );
begin
  if encode(sha256(convert_to(part_20261016150000, 'UTF8')), 'hex')
    is distinct from '401c2990cf0c48ec5ce0378344d21d9c2cdca9f97134f10081ae108bdec9dc4e' then
    raise exception 'stop: 20261016150000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016150000;
end
$apply_20261016150000$;

do $apply_20261016150100$
declare
  part_20261016150100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016150100'
  );
begin
  if encode(sha256(convert_to(part_20261016150100, 'UTF8')), 'hex')
    is distinct from '20f8bca73e6aa65307339969642b22ef806fcead133ae44b35020cc63b85c5bc' then
    raise exception 'stop: 20261016150100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016150100;
end
$apply_20261016150100$;

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
  v_result jsonb;
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
  foreach sig in array array['api.get_premium_payment_details()', 'api.get_my_premium_pay_code()', 'api.admin_get_premium_payment_details()', 'api.admin_set_premium_payment_details(jsonb,text,uuid)', 'api.admin_find_premium_member_by_code(text,text,uuid)', 'api.admin_activate_premium_season(uuid,text,text,text,uuid)'] loop
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
  foreach sig in array array['app_private.premium_season_end()', 'app_private.premium_pay_code_new()', 'app_private.premium_payment_details_json()'] loop
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
    from pg_proc p where p.oid in ('api.premium_status()'::regprocedure, 'api.get_my_premium()'::regprocedure, 'api.admin_get_premium_member(uuid,text,uuid)'::regprocedure)
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
      from pg_proc p where p.oid in ('api.premium_status()'::regprocedure, 'api.get_my_premium()'::regprocedure, 'api.admin_get_premium_member(uuid,text,uuid)'::regprocedure))
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
      where version in ('20261016150000', '20261016150100')) <> 2 then
    problems := problems || 'a history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  v_result := jsonb_build_object(
    'premiumMode', premium_mode,
    'products', (select jsonb_object_agg(code, active) from app_private.premium_products),
    'newApiFunctions', 6,
    'helpers', 3,
    'replacedFunctions', 3,
    'grantsKept', split_part(current_setting('bg.premium_season_grants', true), ':', 1),
    'readsWhileOff', case when premium_mode = 'off' then jsonb_build_array(pay_answer, code_answer) end,
    'historyRows', 2
  );
  perform set_config('bg.premium_season_state', v_result::text, true);
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
  when (select count(*) from supabase_migrations.schema_migrations where version in ('20261016150000', '20261016150100')) = 2
    then 'Applied. The Saison is in place and OFF while BotolaGO+ is off. Next: the owner types the payment details in the admin screen (docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md, « Saison (paiement manuel) »).'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
