-- BotolaGO+ (membership), part 1: the tables, the switch, the membership check.
--
-- BotolaGO+ is an optional paid membership. Decisions by the owner,
-- 2026-10-12/13 (docs/plans/BOTOLAGO_PLUS_PLAN.md sections 1.2, 2c, 5):
--
--   * 20 MAD a month (product plus_monthly, renews, cancel any time, access to
--     the end of the paid month) or 200 MAD a year (product plus_yearly, 12
--     months from the purchase, does NOT renew by itself). Prices are what the
--     member pays, tax included (TTC).
--   * Members get cosmetic card editions, sans publicité, and detail about
--     their own past. Membership never changes a score, a rating, a tier or a
--     rank (see 20261013100100: the edition is drawn on top of the card).
--   * RevenueCat will later feed the app stores (source apple / google); the
--     web payment provider is not chosen yet. The event model below is
--     provider-agnostic: every provider event is stored once, keyed by a unique
--     provider_event_id, before it moves anything.
--
-- SHIPS OFF. app_private.premium_settings has one row, mode 'off', checkout
-- disabled, billing not paused. While mode is 'off', app_private.has_premium
-- answers false for everyone and every read answers {available:false}. This
-- migration adds tables, two products (configuration, not user data), the
-- switch and the membership check. No existing table, function or row changes
-- here; the card reads, the API and the account erasure follow in
-- 20261013100100 .. 20261013100300.
--
-- WHO WRITES WHAT
--   premium_settings        app_private.premium_configure (postgres only)
--   premium_products        the owner's script (prices, provider product ids)
--   billing_customers       the billing webhook worker (later lane)
--   billing_events          api.service_apply_billing_event (insert only; the
--                           outcome of the event is written once, with it)
--   premium_entitlements    api.service_apply_billing_event only
--   premium_grants          the admin grant / revoke functions (20261013100200)
--
-- Every table: row security enabled and forced, all rights revoked from
-- public, anon, authenticated and service_role, no policy, an index on every
-- foreign-key column. Reads go through api functions.
--
-- DELETION. Entitlements, grants and customer ids hang off app.profiles by
-- cascade. billing_events are accounting records: their user_id is set null
-- when the profile goes and 20261013100300 pseudonymises them first.

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
create table app_private.premium_settings (
  id boolean primary key default true,
  mode text not null default 'off',
  checkout_enabled boolean not null default false,
  billing_paused boolean not null default false,
  updated_at timestamptz not null default statement_timestamp(),
  constraint premium_settings_singleton check (id),
  constraint premium_settings_mode_check check (mode in ('off', 'preview', 'on')),
  constraint premium_settings_checkout_check check (not checkout_enabled or mode <> 'off')
);
insert into app_private.premium_settings (id) values (true);
alter table app_private.premium_settings enable row level security;
alter table app_private.premium_settings force row level security;
revoke all on app_private.premium_settings from public, anon, authenticated, service_role;
comment on table app_private.premium_settings is
  'The BotolaGO+ switches, one row, off by default. mode: off (nobody is a member, every read answers unavailable), preview (only holders of a live grant, for the owner and staff) or on. checkout_enabled lets the web checkout start (never while mode is off). billing_paused makes api.service_apply_billing_event refuse (retryable) so a database write can run with no billing writer. Changed only by app_private.premium_configure.';

create function app_private.premium_configure(
  p_mode text default null,
  p_checkout boolean default null,
  p_billing_paused boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_row app_private.premium_settings%rowtype;
  new_mode text;
  new_checkout boolean;
  result app_private.premium_settings%rowtype;
begin
  if p_mode is not null and p_mode not in ('off', 'preview', 'on') then
    raise exception using errcode = 'PT400', message = 'premium_mode_invalid';
  end if;
  select * into current_row from app_private.premium_settings where id for update;
  new_mode := coalesce(p_mode, current_row.mode);
  -- Switching off also switches checkout off: nothing may be sold while off.
  new_checkout := case when new_mode = 'off' then false
    else coalesce(p_checkout, current_row.checkout_enabled) end;
  if p_checkout is true and new_mode = 'off' then
    raise exception using errcode = 'PT400', message = 'premium_checkout_requires_mode';
  end if;
  -- A null leaves that switch as it is.
  update app_private.premium_settings set
    mode = new_mode,
    checkout_enabled = new_checkout,
    billing_paused = coalesce(p_billing_paused, billing_paused),
    updated_at = statement_timestamp()
  where id
  returning * into result;
  return jsonb_build_object(
    'mode', result.mode,
    'checkoutEnabled', result.checkout_enabled,
    'billingPaused', result.billing_paused
  );
end;
$$;
revoke all on function app_private.premium_configure(text, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function app_private.premium_configure(text, boolean, boolean) to postgres;
comment on function app_private.premium_configure(text, boolean, boolean) is
  'Owner-run switch for BotolaGO+: (mode, checkout, billing paused); null leaves a switch as it is. Mode off forces checkout off. Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- Products: what can be bought. Configuration, changed by the owner's script.
-- ---------------------------------------------------------------------------
create table app_private.premium_products (
  code text primary key,
  period_months smallint not null,
  renews boolean not null,
  price_minor integer not null,
  currency text not null default 'MAD',
  provider_product_ids jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint premium_products_code_check check (code ~ '^[a-z][a-z0-9_]{2,31}$'),
  constraint premium_products_period_check check (period_months in (1, 12)),
  constraint premium_products_price_check check (price_minor > 0),
  constraint premium_products_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint premium_products_ids_check check (jsonb_typeof(provider_product_ids) = 'object')
);
create trigger premium_products_set_updated_at
before update on app_private.premium_products
for each row execute function app_private.set_updated_at();
alter table app_private.premium_products enable row level security;
alter table app_private.premium_products force row level security;
revoke all on app_private.premium_products from public, anon, authenticated, service_role;
comment on table app_private.premium_products is
  'BotolaGO+ products. price_minor is the amount the member pays in the currency''s minor unit (centimes), tax included. renews is false for the yearly product (12 months from purchase, no automatic renewal). provider_product_ids maps a provider or store to its product id (set when the stores and the payment provider exist).';

insert into app_private.premium_products (code, period_months, renews, price_minor, currency, sort_order)
values
  ('plus_monthly', 1, true, 2000, 'MAD', 1),
  ('plus_yearly', 12, false, 20000, 'MAD', 2);

-- ---------------------------------------------------------------------------
-- Customers: who a provider knows our member as
-- ---------------------------------------------------------------------------
create table app_private.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  provider text not null,
  provider_customer_ref text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint billing_customers_provider_check check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint billing_customers_ref_check check (char_length(provider_customer_ref) between 1 and 200),
  constraint billing_customers_ref_key unique (provider, provider_customer_ref)
);
create index billing_customers_user_idx on app_private.billing_customers (user_id);
alter table app_private.billing_customers enable row level security;
alter table app_private.billing_customers force row level security;
revoke all on app_private.billing_customers from public, anon, authenticated, service_role;
comment on table app_private.billing_customers is
  'A member''s identity at a billing provider or store (customer id, original transaction id, purchase token). Deleted with the account.';

-- ---------------------------------------------------------------------------
-- Entitlements: the one row per member that says what they hold
-- ---------------------------------------------------------------------------
create table app.premium_entitlements (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  state text not null,
  product_code text not null references app_private.premium_products(code) on delete restrict,
  source text not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  grace_until timestamptz,
  cancel_requested_at timestamptz,
  last_event_at timestamptz not null,
  last_provider_event_id text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint premium_entitlements_state_check check (
    state in ('active', 'cancelling', 'grace', 'on_hold', 'expired', 'refunded', 'revoked')
  ),
  constraint premium_entitlements_source_check check (source in ('web', 'apple', 'google', 'grant')),
  constraint premium_entitlements_period_check check (current_period_end > current_period_start),
  constraint premium_entitlements_grace_check check (state <> 'grace' or grace_until is not null)
);
create index premium_entitlements_product_idx on app.premium_entitlements (product_code);
create index premium_entitlements_state_end_idx on app.premium_entitlements (state, current_period_end);
create trigger premium_entitlements_set_updated_at
before update on app.premium_entitlements
for each row execute function app_private.set_updated_at();
alter table app.premium_entitlements enable row level security;
alter table app.premium_entitlements force row level security;
revoke all on app.premium_entitlements from public, anon, authenticated, service_role;
comment on table app.premium_entitlements is
  'What a member holds: one row per member who ever bought, written only by api.service_apply_billing_event. "none" is the absence of a row. The stored state moves with provider events; app_private.premium_effective_state also applies the dates, so a lapsed period never needs a job to stop counting. Row security forced, no policy: read through api functions. Cascades from the profile.';

-- ---------------------------------------------------------------------------
-- Provider events: every event, once (idempotency), with what became of it
-- ---------------------------------------------------------------------------
create table app_private.billing_events (
  id bigint generated always as identity primary key,
  provider_event_id text not null,
  provider text not null,
  source text not null,
  event_type text not null,
  user_id uuid references app.profiles(id) on delete set null,
  subject_pseudonym text,
  product_code text references app_private.premium_products(code) on delete restrict,
  occurred_at timestamptz not null,
  period_start timestamptz,
  period_end timestamptz,
  grace_until timestamptz,
  amount_minor integer,
  currency text,
  signature_verified boolean not null,
  outcome text not null,
  state_before text,
  state_after text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default statement_timestamp(),
  erased_at timestamptz,
  constraint billing_events_provider_event_key unique (provider_event_id),
  constraint billing_events_provider_event_id_check check (char_length(provider_event_id) between 1 and 200),
  constraint billing_events_provider_check check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint billing_events_source_check check (source in ('web', 'apple', 'google', 'grant')),
  constraint billing_events_type_check check (
    event_type in ('purchase', 'renewal', 'cancel', 'uncancel', 'payment_failed', 'hold',
      'expire', 'refund', 'revoke')
  ),
  constraint billing_events_outcome_check check (
    outcome in ('applied', 'ignored_state', 'ignored_stale', 'ignored_user', 'ignored_product',
      'rejected_signature')
  ),
  constraint billing_events_amount_check check (amount_minor is null or amount_minor >= 0),
  constraint billing_events_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint billing_events_payload_check check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384
  )
);
create index billing_events_user_idx on app_private.billing_events (user_id, occurred_at desc)
  where user_id is not null;
create index billing_events_product_idx on app_private.billing_events (product_code)
  where product_code is not null;
create index billing_events_received_idx on app_private.billing_events (received_at);
alter table app_private.billing_events enable row level security;
alter table app_private.billing_events force row level security;
revoke all on app_private.billing_events from public, anon, authenticated, service_role;
comment on table app_private.billing_events is
  'Every billing provider event, stored once (provider_event_id is unique: a replay is a no-op) with the outcome it had. Accounting record: when the account is erased user_id is set null, the payload is emptied and subject_pseudonym keeps the events of one erased member together (20261013100300). Written only by api.service_apply_billing_event.';

-- ---------------------------------------------------------------------------
-- Grants: complimentary memberships given by staff
-- ---------------------------------------------------------------------------
create table app_private.premium_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  starts_at timestamptz not null default statement_timestamp(),
  ends_at timestamptz not null,
  reason text not null,
  granted_by_principal_id uuid not null
    references app_private.staff_principals(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  revoked_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  revoke_reason text,
  constraint premium_grants_period_check check (ends_at > starts_at),
  constraint premium_grants_reason_check check (
    reason = btrim(reason) and char_length(reason) between 8 and 500
  ),
  constraint premium_grants_revoke_check check (
    (revoked_at is null) = (revoked_by_principal_id is null)
    and (revoked_at is null) = (revoke_reason is null)
    and (revoke_reason is null or (revoke_reason = btrim(revoke_reason)
      and char_length(revoke_reason) between 8 and 500))
  )
);
create index premium_grants_user_idx on app_private.premium_grants (user_id, ends_at desc);
create index premium_grants_granted_by_idx on app_private.premium_grants (granted_by_principal_id);
create index premium_grants_revoked_by_idx on app_private.premium_grants (revoked_by_principal_id)
  where revoked_by_principal_id is not null;
alter table app_private.premium_grants enable row level security;
alter table app_private.premium_grants force row level security;
revoke all on app_private.premium_grants from public, anon, authenticated, service_role;
comment on table app_private.premium_grants is
  'Complimentary BotolaGO+ memberships (press, partners, support goodwill, the owner''s preview). A grant is live from starts_at to ends_at unless revoked. Written only by api.admin_grant_premium / api.admin_revoke_premium, each audited. Deleted with the account.';

-- ---------------------------------------------------------------------------
-- The state machine, as data (5.2). One function, so the truth table is tested.
--
--   next state for (stored state, event type), or null when the event does not
--   apply in that state (it is still stored, with outcome ignored_state).
--   'none' stands for "no entitlement row".
-- ---------------------------------------------------------------------------
create function app_private.premium_next_state(p_state text, p_event_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_event_type
    -- A new purchase starts (or restarts) a membership from any state.
    when 'purchase' then 'active'
    -- A successful renewal: from any state a paid period can follow, except
    -- after a refund or a revocation (only a new purchase restarts those).
    when 'renewal' then case when p_state in ('refunded', 'revoked') then null else 'active' end
    -- Cancelled by the member: no renewal. In grace the member keeps access
    -- until the grace ends, so the state stays grace; on hold it ends.
    when 'cancel' then case p_state
      when 'active' then 'cancelling'
      when 'cancelling' then 'cancelling'
      when 'grace' then 'grace'
      when 'on_hold' then 'expired'
      end
    when 'uncancel' then case p_state when 'cancelling' then 'active' end
    -- The renewal payment failed and the provider is retrying.
    when 'payment_failed' then case p_state when 'active' then 'grace' when 'grace' then 'grace' end
    -- The store put the account on hold (grace over, still unpaid).
    when 'hold' then case p_state when 'active' then 'on_hold' when 'grace' then 'on_hold'
      when 'on_hold' then 'on_hold' end
    when 'expire' then case when p_state in ('active', 'cancelling', 'grace', 'on_hold', 'expired')
      then 'expired' end
    -- No member features from the moment of a refund or revocation.
    when 'refund' then case when p_state in ('active', 'cancelling', 'grace', 'on_hold', 'expired')
      then 'refunded' end
    when 'revoke' then case when p_state in ('active', 'cancelling', 'grace', 'on_hold', 'expired')
      then 'revoked' end
  end;
$$;
revoke all on function app_private.premium_next_state(text, text)
  from public, anon, authenticated, service_role;
comment on function app_private.premium_next_state(text, text) is
  'The BotolaGO+ subscription state machine (plan 5.2): next stored state for a stored state (or none) and an event type, or null when the event does not apply. No grant.';

-- The state a member is in right now: the stored state with its dates applied.
-- A paid period that has ended counts as expired, and a grace that has ended
-- counts as on_hold for a store subscription and expired for the web, whether
-- or not the provider''s event has arrived yet.
create function app_private.premium_effective_state(
  p_state text,
  p_source text,
  p_period_end timestamptz,
  p_grace_until timestamptz,
  p_at timestamptz default null
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_state is null then 'none'
    when p_state in ('active', 'cancelling') then
      case when p_period_end > coalesce(p_at, statement_timestamp()) then p_state else 'expired' end
    when p_state = 'grace' then
      case when p_grace_until > coalesce(p_at, statement_timestamp()) then 'grace'
        when p_source in ('apple', 'google') then 'on_hold'
        else 'expired' end
    else p_state
  end;
$$;
revoke all on function app_private.premium_effective_state(text, text, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
comment on function app_private.premium_effective_state(text, text, timestamptz, timestamptz, timestamptz) is
  'The effective BotolaGO+ state: the stored state with its dates applied at p_at (default now). none when there is no row. No grant.';

-- ---------------------------------------------------------------------------
-- has_premium: the ONE check every premium feature calls
--
--   mode off      nobody
--   mode preview  only a live grant (the owner and staff)
--   mode on       a live grant, or an entitlement whose effective state is
--                 active, cancelling or grace
--
-- p_at is for tests and reports; null means now.
-- ---------------------------------------------------------------------------
create function app_private.has_premium(p_user uuid, p_at timestamptz default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case coalesce((select s.mode from app_private.premium_settings s where s.id), 'off')
    when 'off' then false
    else
      exists (
        select 1 from app_private.premium_grants g
        where g.user_id = p_user and g.revoked_at is null
          and g.starts_at <= coalesce(p_at, statement_timestamp())
          and g.ends_at > coalesce(p_at, statement_timestamp()))
      or (
        (select s.mode from app_private.premium_settings s where s.id) = 'on'
        and exists (
          select 1 from app.premium_entitlements e
          where e.user_id = p_user
            and app_private.premium_effective_state(
              e.state, e.source, e.current_period_end, e.grace_until, p_at
            ) in ('active', 'cancelling', 'grace')))
  end;
$$;
revoke all on function app_private.has_premium(uuid, timestamptz)
  from public, anon, authenticated, service_role;
comment on function app_private.has_premium(uuid, timestamptz) is
  'Is this person a BotolaGO+ member right now? The one check every premium read calls. False for everyone while mode is off; in preview only a live grant counts; on, a live grant or an entitlement that is active, cancelling or in grace. No grant.';
