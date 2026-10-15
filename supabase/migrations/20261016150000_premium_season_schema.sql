-- BotolaGO+ « Saison », part 1: the product, the payment details, the payment codes and the
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
