-- ============================================================================
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
--   4. In the line `select set_config('bg.premium_mode', 'rehearsal', true);`
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
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('20261013100000', '20261013100100', '20261013100200', '20261013100300')) then
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
      and (p.proname like '%premium%' or p.proname like 'card\_edition%' or p.proname = 'choose_card_design'
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
    E'  perform app_private.account_deletion_disable(target);\n',
    E'  -- The account itself. Cascades to the profile and every per-account table.\n  delete from auth.users where id = target;\n'
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
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261013100000',
  'premium_schema',
  array[$bg_20261013100000_file$-- BotolaGO+ (membership), part 1: the tables, the switch, the membership check.
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
-- RETENTION. Billing records are kept 5 years (owner decision, 2026-10-13); see
-- docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md. No purge ships: nothing deletes
-- billing_events, and no job is scheduled.
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
  'The BotolaGO+ switches, one row, off by default. mode: off (nobody is a member, every read answers unavailable), preview (the owner and staff: membership counts as in on, but nothing is public) or on. checkout_enabled lets the web checkout start (never while mode is off). billing_paused makes api.service_apply_billing_event refuse (retryable) so a database write can run with no billing writer. Changed only by app_private.premium_configure.';

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
  'Every billing provider event, stored once (provider_event_id is unique: a replay is a no-op) with the outcome it had. Accounting record, kept 5 years (owner decision 2026-10-13; no purge ships). When the account is erased user_id is set null, the payload is emptied and subject_pseudonym keeps the events of one erased member together (20261013100300). Written only by api.service_apply_billing_event.';

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
--   mode preview  the same truth table as on (a live grant, or a valid entitlement,
--                 e.g. a staff test-mode purchase); owner decision 2026-10-13. What
--                 differs from on is only what is shown publicly (20261013100100).
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
        (select s.mode from app_private.premium_settings s where s.id) in ('preview', 'on')
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
  'Is this person a BotolaGO+ member right now? The one check every premium read calls. False for everyone while mode is off; in preview and on, a live grant or an entitlement that is active, cancelling or in grace (same truth table). No grant.';
$bg_20261013100000_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261013100100',
  'card_editions',
  array[$bg_20261013100100_file$-- BotolaGO+ (membership), part 2: the card editions and the card reads.
--
-- An EDITION is how a manager's Curva card is drawn: standard (free, the metal
-- of the earned tier) or one of the four paid editions, Holo, Électrique,
-- Pixels and Chrome. Owner decisions, 2026-10-13: a member's chosen edition is
-- PUBLIC wherever their card is drawn (the rankings, the leagues, their
-- profile, the share picture); the ranking order is points only and never
-- depends on membership; when membership ends the card goes back to standard
-- everywhere, and the choice is remembered for a renewal.
--
-- COSMETIC ONLY. The edition is a layer chosen at draw time. Nothing here is
-- read by the Manager Card calculation (app_private.manager_card_tick and its
-- helpers), a ranking, a league or any Fantasy rule, and nothing here changes
-- what those compute: the only change to an existing function is ONE added
-- key, `edition`, on the two card reads below. A pgTAP test lists every
-- function that names the membership or edition tables.
--
-- WHAT CHANGES
--   app.card_editions         catalogue: standard + holo, electric, pixel, chrome
--   app.card_edition_choices  one row per member who chose (written only by
--                             api.choose_card_design)
--   api.choose_card_design    members only; standard is always allowed
--   api.get_my_manager_card   the 20261012200100 answer plus card.edition
--   api.get_manager_cards     the 20261010120200 answer plus card.edition on
--                             every card
--
-- WHICH EDITION A CARD SHOWS (app_private.card_edition_effective)
--   the chosen edition when it is in the catalogue and live (status active,
--   inside starts_at / ends_at) AND, for a paid edition, the member holds
--   BotolaGO+ right now (app_private.has_premium); otherwise 'standard'. While
--   BotolaGO+ is in preview, a paid edition is shown only to its owner (the
--   viewer is the card's own manager); once mode is on, to every signed-in
--   reader. While off, every card says 'standard'.

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------
create table app.card_editions (
  code text primary key,
  premium boolean not null,
  finish text not null,
  status text not null default 'active',
  starts_at timestamptz,
  ends_at timestamptz,
  label_fr text not null,
  label_ar text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint card_editions_code_check check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint card_editions_finish_check check (finish in ('tier_metal', 'holo', 'electric', 'pixel', 'chrome')),
  constraint card_editions_status_check check (status in ('active', 'retired')),
  constraint card_editions_window_check check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint card_editions_labels_check check (
    char_length(btrim(label_fr)) between 1 and 40 and char_length(btrim(label_ar)) between 1 and 40
  ),
  -- The free edition is always free and always the tier's own metal.
  constraint card_editions_standard_check check (
    code <> 'standard' or (not premium and finish = 'tier_metal' and status = 'active'
      and starts_at is null and ends_at is null)
  ),
  constraint card_editions_paid_check check (premium or code = 'standard')
);
create trigger card_editions_set_updated_at
before update on app.card_editions
for each row execute function app_private.set_updated_at();
alter table app.card_editions enable row level security;
alter table app.card_editions force row level security;
revoke all on app.card_editions from public, anon, authenticated, service_role;
comment on table app.card_editions is
  'The Curva card editions. standard is free and uses the earned tier''s metal; every other edition is a paid BotolaGO+ edition. Labels in French and Arabic. Changed by the owner''s script; read through api functions (premium_status, get_my_premium). Row security forced, no policy.';

insert into app.card_editions (code, premium, finish, label_fr, label_ar, sort_order)
values
  ('standard', false, 'tier_metal', 'Standard', 'عادية', 0),
  ('holo', true, 'holo', 'Holo', 'هولو', 1),
  ('electric', true, 'electric', 'Électrique', 'كهربائية', 2),
  ('pixel', true, 'pixel', 'Pixels', 'بكسل', 3),
  ('chrome', true, 'chrome', 'Chrome', 'كروم', 4);

-- ---------------------------------------------------------------------------
-- The choices
-- ---------------------------------------------------------------------------
create table app.card_edition_choices (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  edition_code text not null references app.card_editions(code) on delete restrict,
  chosen_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
create index card_edition_choices_edition_idx on app.card_edition_choices (edition_code);
create trigger card_edition_choices_set_updated_at
before update on app.card_edition_choices
for each row execute function app_private.set_updated_at();
create trigger card_edition_choices_refuse_unverified_mfa_actor
before insert or update or delete on app.card_edition_choices
for each statement execute function app_private.refuse_unverified_mfa_actor();
alter table app.card_edition_choices enable row level security;
alter table app.card_edition_choices force row level security;
revoke all on app.card_edition_choices from public, anon, authenticated, service_role;
comment on table app.card_edition_choices is
  'The edition a manager chose for their card (display only). Written only by api.choose_card_design, which checks membership. Kept when membership lapses (the card shows standard until it is renewed). Row security forced, no policy. Cascades from the profile.';

-- ---------------------------------------------------------------------------
-- Which edition a card shows
-- ---------------------------------------------------------------------------
create function app_private.card_edition_effective(p_user uuid, p_viewer uuid default null)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select e.code
    from app.card_edition_choices c
    join app.card_editions e on e.code = c.edition_code
    where c.user_id = p_user
      and e.status = 'active'
      and (e.starts_at is null or e.starts_at <= statement_timestamp())
      and (e.ends_at is null or e.ends_at > statement_timestamp())
      and (
        not e.premium
        or (
          app_private.has_premium(p_user)
          and (
            (select s.mode from app_private.premium_settings s where s.id) = 'on'
            or p_user is not distinct from p_viewer)))
  ), 'standard');
$$;
revoke all on function app_private.card_edition_effective(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_edition_effective(uuid, uuid) is
  'The edition code a manager''s card shows to a viewer: the chosen edition when live in the catalogue and, for a paid edition, the manager is a member now (in preview, only to the manager); else standard. Cosmetic: nothing computes from it. No grant.';

-- ---------------------------------------------------------------------------
-- api.choose_card_design
-- ---------------------------------------------------------------------------
create function api.choose_card_design(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  edition app.card_editions%rowtype;
  mode text;
begin
  if p_code is null or p_code !~ '^[a-z][a-z0-9_]{1,31}$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select s.mode into mode from app_private.premium_settings s where s.id;
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;

  select * into edition from app.card_editions e
  where e.code = p_code and e.status = 'active'
    and (e.starts_at is null or e.starts_at <= statement_timestamp())
    and (e.ends_at is null or e.ends_at > statement_timestamp());
  if not found then
    raise exception using errcode = 'PT404', message = 'card_edition_not_found';
  end if;
  -- The free edition is always allowed, so a lapsed member can go back to it;
  -- a paid edition needs BotolaGO+ now (in preview: a live grant or a valid entitlement).
  if edition.premium and not app_private.has_premium(actor) then
    raise exception using errcode = 'PT403', message = 'premium_required';
  end if;

  insert into app.card_edition_choices (user_id, edition_code)
  values (actor, edition.code)
  on conflict (user_id) do update set
    edition_code = excluded.edition_code,
    chosen_at = statement_timestamp();

  return jsonb_build_object(
    'available', true,
    'chosenEdition', edition.code,
    'edition', app_private.card_edition_effective(actor, actor)
  );
end;
$$;
revoke all on function api.choose_card_design(text) from public, anon, authenticated, service_role;
grant execute on function api.choose_card_design(text) to authenticated, service_role;
comment on function api.choose_card_design(text) is
  'Chooses the caller''s card edition: {available, chosenEdition, edition}. standard is always allowed; a paid edition needs BotolaGO+ (PT403 premium_required). {available:false} while BotolaGO+ is off. Signed-in, step-up. Cosmetic only.';

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card: the body of 20261012200100 plus card.edition
-- ---------------------------------------------------------------------------
create or replace function api.get_my_manager_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  card jsonb;
begin
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  card := app_private.manager_card_my_card(actor);
  -- Additive: the pending rating change (zero or one), which the card animates
  -- once and then acknowledges.
  if card is not null then
    card := card || jsonb_build_object('ovrChanges', coalesce((
      select jsonb_agg(m.moment order by m.occurred_at, m.moment_key)
      from app_private.manager_card_ovr_moments(actor) m
      where m.pending), '[]'::jsonb));
    -- Additive (BotolaGO+): the edition the card is drawn in. Cosmetic.
    card := card || jsonb_build_object('edition', app_private.card_edition_effective(actor, actor));
  end if;
  return jsonb_build_object('available', true, 'card', card);
end;
$$;
comment on function api.get_my_manager_card() is
  'The caller''s Manager Card for the current Fantasy season: {available:true, card} (card null without a team this season), or {available:false} while off. card.ovrChanges lists the pending rating change (zero or one); card.edition is the edition code the card is drawn in (standard unless the caller is a member who chose another). Signed-in, step-up. Display only.';

-- ---------------------------------------------------------------------------
-- api.get_manager_cards: the body of 20261010120200 plus card.edition
-- ---------------------------------------------------------------------------
create or replace function api.get_manager_cards(p_team_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  result jsonb;
begin
  if p_team_ids is null or cardinality(p_team_ids) > 1000
    or (select count(distinct asked.id) from unnest(p_team_ids) as asked(id)) > 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  -- The order each team was first asked for; unknown teams and hidden
  -- profiles are left out. Each card gains its edition (BotolaGO+, cosmetic).
  select coalesce(jsonb_agg(
      found.card || jsonb_build_object('edition', found.edition) order by found.position
    ), '[]'::jsonb)
  into result
  from (
    select asked.position, built.card,
      app_private.card_edition_effective(team.user_id, actor) as edition
    from (
      select t.id, min(t.position) as position
      from unnest(p_team_ids) with ordinality as t(id, position)
      where t.id is not null
      group by t.id
    ) asked
    join app_private.manager_card_member_card(p_team_ids) built on built.team_id = asked.id
    join app.fantasy_teams team on team.id = built.team_id
  ) found;
  return jsonb_build_object('available', true, 'cards', result);
end;
$$;
comment on function api.get_manager_cards(uuid[]) is
  'Up to 100 managers'' cards by Fantasy team, in the order asked: {available, cards}; each card has the keys of memberCardSchema plus edition (the edition it is drawn in: public, standard unless the manager is a member who chose another). Unknown teams and hidden profiles are left out. Signed-in, step-up. Display only.';

notify pgrst, 'reload schema';
$bg_20261013100100_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261013100200',
  'premium_api',
  array[$bg_20261013100200_file$-- BotolaGO+ (membership), part 3: the API.
--
-- Over the tables of 20261013100000 and 20261013100100:
--
--   api.premium_status()                      anon too; never raises
--   api.get_my_premium()                      the caller's membership
--   api.service_apply_billing_event(p_event)  service_role only; the one writer
--   api.admin_premium_overview()              counts by state (staff)
--   api.admin_get_premium_member(...)         one member, audited (staff)
--   api.admin_grant_premium(...)              a complimentary membership (staff)
--   api.admin_revoke_premium(...)             end one early (staff)
--
-- OFF IS AN ANSWER, not an error: while premium_settings.mode is 'off' the two
-- reads answer {"available": false} (premium_status: enabled false), checked
-- before the step-up and before the caller is read. Signed-in reads run, in
-- order: the off answer, app_private.assert_mfa_step_up(), the caller (PT401).
-- Granted to authenticated and service_role, never to anon, except
-- premium_status (public prices, nothing about anyone).
--
-- THE ONE WRITER. Only a provider's VERIFIED event changes a membership, and
-- only through api.service_apply_billing_event. A browser cannot write any of
-- these tables. The function:
--   1. refuses a caller that is not the service role (PT403);
--   2. refuses, retryable (PT503 premium_billing_paused), while
--      premium_settings.billing_paused is on, writing nothing, so a database
--      change can run with no billing writer (providers retry);
--   3. serialises per member (advisory lock) and answers a replayed
--      provider_event_id with the first outcome, writing nothing;
--   4. stores the event once with its outcome, then moves the state machine
--      (app_private.premium_next_state) when the event applies.
--
-- THE EVENT (all keys camelCase; the worker maps each provider to this):
--   providerEventId  text, 1..200, UNIQUE across providers (prefix it with the
--                    provider: 'revenuecat:...')
--   provider         text, e.g. cmi, payzone, revenuecat
--   source           web | apple | google | grant
--   eventType        purchase | renewal | cancel | uncancel | payment_failed |
--                    hold | expire | refund | revoke
--   userId           uuid of the member
--   productCode      plus_monthly | plus_yearly (required for purchase, renewal)
--   occurredAt       when it happened at the provider (not in the future by
--                    more than a day); an event older than the member's last
--                    applied one is stored and ignored (ignored_stale)
--   periodStart, periodEnd, graceUntil   optional, as the provider says them;
--                    a missing period is the product's period from the start
--   amountMinor, currency   optional, for the accounting record
--   signatureVerified  boolean, true only if the worker verified the provider's
--                    signature; false is stored and ignored (rejected_signature)
--   payload          object, up to 16 KB, the raw provider payload
-- It answers {eventId, duplicate, outcome, stateBefore, stateAfter}. Outcomes:
--   applied, ignored_state (not valid in that state), ignored_stale,
--   ignored_user (no such or closing account), ignored_product,
--   rejected_signature.

-- ---------------------------------------------------------------------------
-- api.premium_status: what the public paywall may know
-- ---------------------------------------------------------------------------
create function api.premium_status()
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
          'currency', p.currency
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
  'Public BotolaGO+ facts for the paywall: {enabled, checkoutEnabled, prices, savingMinor, editions}. enabled is true only when mode is on; otherwise nothing is disclosed (empty lists). Prices are tax included, in minor units (centimes). Never raises.';

-- ---------------------------------------------------------------------------
-- api.get_my_premium
-- ---------------------------------------------------------------------------
create function api.get_my_premium()
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
  select max(g.ends_at) into grant_end
  from app_private.premium_grants g
  where g.user_id = actor and g.revoked_at is null
    and g.starts_at <= statement_timestamp() and g.ends_at > statement_timestamp();
  select c.edition_code into chosen from app.card_edition_choices c where c.user_id = actor;

  return jsonb_build_object(
    'available', true,
    'isMember', v_member,
    'state', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then v_state else 'active' end,
    'productCode', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then ent.product_code end,
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
  'The caller''s BotolaGO+ membership: {available, isMember, state, productCode, source, currentPeriodEnd, cancelAtPeriodEnd, graceUntil, chosenEdition, edition, editions}. state is the effective state (none, active, cancelling, grace, on_hold, expired, refunded, revoked); a complimentary grant reads as active with source grant. {available:false} while off (and in preview for anyone who is not a member). Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.service_apply_billing_event
-- ---------------------------------------------------------------------------
create function api.service_apply_billing_event(p_event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.premium_settings%rowtype;
  v_event_id text;
  v_provider text;
  v_source text;
  v_type text;
  v_user uuid;
  v_product text;
  v_occurred timestamptz;
  v_pstart timestamptz;
  v_pend timestamptz;
  v_grace timestamptz;
  v_amount integer;
  v_currency text;
  v_verified boolean;
  v_payload jsonb;
  dup app_private.billing_events%rowtype;
  profile_found boolean;
  profile_open boolean;
  ent app.premium_entitlements%rowtype;
  have_ent boolean;
  prod app_private.premium_products%rowtype;
  v_old text;
  v_new text;
  v_outcome text;
  v_prod_code text;
  v_start timestamptz;
  v_end timestamptz;
  v_grace_until timestamptz;
  v_cancel timestamptz;
  v_source_after text;
  v_prod_after text;
  v_id bigint;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'premium_access_denied';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  -- Read the event; a malformed value is a client error, not a 500.
  begin
    v_event_id := p_event ->> 'providerEventId';
    v_provider := p_event ->> 'provider';
    v_source := p_event ->> 'source';
    v_type := p_event ->> 'eventType';
    v_user := (p_event ->> 'userId')::uuid;
    v_product := p_event ->> 'productCode';
    v_occurred := (p_event ->> 'occurredAt')::timestamptz;
    v_pstart := (p_event ->> 'periodStart')::timestamptz;
    v_pend := (p_event ->> 'periodEnd')::timestamptz;
    v_grace := (p_event ->> 'graceUntil')::timestamptz;
    v_amount := (p_event ->> 'amountMinor')::integer;
    v_currency := p_event ->> 'currency';
    v_payload := coalesce(p_event -> 'payload', '{}'::jsonb);
  exception
    when sqlstate '22007' or sqlstate '22008' or sqlstate '22P02' or sqlstate '22003' then
      raise exception using errcode = 'PT400', message = 'validation_failed';
  end;
  if jsonb_typeof(p_event -> 'signatureVerified') is distinct from 'boolean' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  v_verified := (p_event ->> 'signatureVerified')::boolean;
  if v_event_id is null or v_event_id <> btrim(v_event_id) or char_length(v_event_id) not between 1 and 200
    or v_provider is null or v_provider !~ '^[a-z][a-z0-9_]{1,31}$'
    or v_source is null or v_source not in ('web', 'apple', 'google', 'grant')
    or v_type is null or v_type not in ('purchase', 'renewal', 'cancel', 'uncancel',
      'payment_failed', 'hold', 'expire', 'refund', 'revoke')
    or v_user is null
    or v_occurred is null or v_occurred > statement_timestamp() + interval '1 day'
    or (v_pstart is not null and v_pend is not null and v_pend <= v_pstart)
    or (v_amount is not null and v_amount < 0)
    or (v_currency is not null and v_currency !~ '^[A-Z]{3}$')
    or (v_product is not null and v_product !~ '^[a-z][a-z0-9_]{2,31}$')
    or (v_type in ('purchase', 'renewal') and v_product is null)
    or jsonb_typeof(v_payload) <> 'object' or octet_length(v_payload::text) > 16384
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into settings from app_private.premium_settings s where s.id;
  if settings.billing_paused then
    raise exception using errcode = 'PT503', message = 'premium_billing_paused';
  end if;

  -- One event at a time per member; a replay answers the first outcome.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':premium', 0));
  select * into dup from app_private.billing_events b where b.provider_event_id = v_event_id;
  if found then
    return jsonb_build_object('eventId', dup.id, 'duplicate', true, 'outcome', dup.outcome,
      'stateBefore', dup.state_before, 'stateAfter', dup.state_after);
  end if;

  select true, p.deleted_at is null into profile_found, profile_open
  from app.profiles p where p.id = v_user;
  profile_found := coalesce(profile_found, false);
  profile_open := coalesce(profile_open, false);

  select * into ent from app.premium_entitlements e where e.user_id = v_user for update;
  have_ent := found;
  v_old := case when have_ent then ent.state else 'none' end;
  v_new := v_old;
  v_prod_code := coalesce(v_product, ent.product_code);
  if v_prod_code is not null then
    select * into prod from app_private.premium_products pr where pr.code = v_prod_code;
  end if;

  if not v_verified then
    v_outcome := 'rejected_signature';
  elsif not profile_found or not profile_open then
    v_outcome := 'ignored_user';
  elsif v_type in ('purchase', 'renewal') and (
      prod.code is null or (v_type = 'purchase' and not prod.active)) then
    v_outcome := 'ignored_product';
  elsif have_ent and v_occurred < ent.last_event_at then
    v_outcome := 'ignored_stale';
  elsif have_ent and v_type not in ('purchase', 'renewal') and v_source <> ent.source then
    -- A store event does not end a web membership, nor the other way round.
    v_outcome := 'ignored_state';
  else
    v_new := app_private.premium_next_state(v_old, v_type);
    if v_new is null then
      v_new := v_old;
      v_outcome := 'ignored_state';
    else
      v_outcome := 'applied';
    end if;
  end if;

  -- The event is stored once, with its outcome, before anything moves.
  insert into app_private.billing_events (
    provider_event_id, provider, source, event_type, user_id, product_code, occurred_at,
    period_start, period_end, grace_until, amount_minor, currency, signature_verified,
    outcome, state_before, state_after, payload
  ) values (
    v_event_id, v_provider, v_source, v_type,
    case when profile_found then v_user end,
    prod.code, v_occurred, v_pstart, v_pend, v_grace, v_amount, v_currency, v_verified,
    v_outcome, v_old, v_new, v_payload
  )
  on conflict (provider_event_id) do nothing
  returning id into v_id;
  if v_id is null then
    select * into dup from app_private.billing_events b where b.provider_event_id = v_event_id;
    return jsonb_build_object('eventId', dup.id, 'duplicate', true, 'outcome', dup.outcome,
      'stateBefore', dup.state_before, 'stateAfter', dup.state_after);
  end if;

  if v_outcome = 'applied' then
    v_start := ent.current_period_start;
    v_end := ent.current_period_end;
    v_grace_until := ent.grace_until;
    v_cancel := ent.cancel_requested_at;
    v_source_after := ent.source;
    v_prod_after := ent.product_code;
    if v_type in ('purchase', 'renewal') then
      v_prod_after := prod.code;
      v_start := coalesce(v_pstart, v_occurred);
      v_end := coalesce(v_pend, v_start + make_interval(months => prod.period_months::integer));
      -- Buying again while still a member never shortens what was paid for.
      if v_type = 'purchase' and have_ent and v_old in ('active', 'cancelling', 'grace') then
        v_end := greatest(v_end, ent.current_period_end);
      end if;
      v_grace_until := null;
      v_cancel := null;
      v_source_after := v_source;
    elsif v_type = 'cancel' then
      v_cancel := v_occurred;
    elsif v_type = 'uncancel' then
      v_cancel := null;
    elsif v_type = 'payment_failed' then
      -- Retries inside one grace do not extend it; the provider's own date wins.
      v_grace_until := coalesce(v_grace,
        case when v_old = 'grace' then ent.grace_until end,
        greatest(ent.current_period_end, v_occurred) + interval '7 days');
    end if;
    if v_end <= v_start then
      raise exception using errcode = 'PT400', message = 'validation_failed';
    end if;

    insert into app.premium_entitlements (
      user_id, state, product_code, source, current_period_start, current_period_end,
      grace_until, cancel_requested_at, last_event_at, last_provider_event_id
    ) values (
      v_user, v_new, v_prod_after, v_source_after, v_start, v_end,
      v_grace_until, v_cancel, v_occurred, v_event_id
    )
    on conflict (user_id) do update set
      state = excluded.state,
      product_code = excluded.product_code,
      source = excluded.source,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      grace_until = excluded.grace_until,
      cancel_requested_at = excluded.cancel_requested_at,
      last_event_at = excluded.last_event_at,
      last_provider_event_id = excluded.last_provider_event_id;
  end if;

  return jsonb_build_object('eventId', v_id, 'duplicate', false, 'outcome', v_outcome,
    'stateBefore', v_old, 'stateAfter', v_new);
end;
$$;
revoke all on function api.service_apply_billing_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function api.service_apply_billing_event(jsonb) to service_role;
comment on function api.service_apply_billing_event(jsonb) is
  'The one writer of BotolaGO+ memberships. Service role only. Stores a verified provider event once (providerEventId unique: a replay answers the first outcome and writes nothing) and moves the entitlement through the state machine (app_private.premium_next_state). Refuses retryably (PT503 premium_billing_paused) while billing is paused. Never trusts a client.';

-- ---------------------------------------------------------------------------
-- Staff: permissions
-- ---------------------------------------------------------------------------
insert into app_private.admin_permissions (name, domain, description, requires_recent_auth)
values
  ('premium.read', 'premium',
    'Reads the BotolaGO+ overview (counts by state) and, with a reason, one member''s membership.',
    false),
  ('premium.grant', 'premium',
    'Gives a complimentary BotolaGO+ membership to an account, and ends one early.',
    true)
on conflict (name) do nothing;

insert into app_private.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from app_private.admin_roles role
join app_private.admin_permissions permission on permission.name in ('premium.read', 'premium.grant')
where role.name = 'platform_admin'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Staff: overview (counts only, no member list)
-- ---------------------------------------------------------------------------
create function api.admin_premium_overview()
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
    'liveGrants', (
      select count(distinct g.user_id) from app_private.premium_grants g
      where g.revoked_at is null and g.starts_at <= statement_timestamp()
        and g.ends_at > statement_timestamp()),
    'lastEventAt', (select max(b.received_at) from app_private.billing_events b)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: one member (audited read)
-- ---------------------------------------------------------------------------
create function api.admin_get_premium_member(
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
        'revokedAt', g.revoked_at) order by g.created_at desc, g.id)
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
-- Staff: grant and revoke a complimentary membership
-- ---------------------------------------------------------------------------
create function api.admin_grant_premium(
  p_user_id uuid,
  p_ends_at timestamptz,
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
  new_grant app_private.premium_grants%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('premium.grant', true);
  if p_user_id is null or p_ends_at is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;
  if p_ends_at <= statement_timestamp() + interval '1 minute'
    or p_ends_at > statement_timestamp() + interval '400 days' then
    raise exception using errcode = 'PT400', message = 'premium_grant_period_invalid';
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = p_user_id and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'premium_account_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'premium.grant_member', p_idempotency_key,
    jsonb_build_object('userId', p_user_id, 'endsAt', p_ends_at, 'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  insert into app_private.premium_grants (user_id, ends_at, reason, granted_by_principal_id)
  values (p_user_id, p_ends_at, p_reason, actor)
  returning * into new_grant;

  perform app_private.write_admin_audit(
    actor, 'premium.grant_member', 'premium', p_user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    null,
    jsonb_build_object('grantId', new_grant.id, 'endsAt', new_grant.ends_at)
  );

  result := jsonb_build_object('grantId', new_grant.id, 'userId', p_user_id,
    'startsAt', new_grant.starts_at, 'endsAt', new_grant.ends_at);
  return app_private.admin_complete_idempotent_operation(
    actor, 'premium.grant_member', p_idempotency_key, result
  );
end;
$$;

create function api.admin_revoke_premium(
  p_grant_id uuid,
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
  target app_private.premium_grants%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('premium.grant', true);
  if p_grant_id is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'premium.revoke_grant', p_idempotency_key,
    jsonb_build_object('grantId', p_grant_id, 'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  select * into target from app_private.premium_grants g where g.id = p_grant_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'premium_grant_not_found';
  end if;
  if target.revoked_at is not null then
    raise exception using errcode = 'PT409', message = 'premium_grant_already_revoked';
  end if;

  update app_private.premium_grants set
    revoked_at = statement_timestamp(),
    revoked_by_principal_id = actor,
    revoke_reason = p_reason
  where id = p_grant_id;

  perform app_private.write_admin_audit(
    actor, 'premium.revoke_grant', 'premium', target.user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('grantId', target.id, 'endsAt', target.ends_at),
    jsonb_build_object('grantId', target.id, 'revoked', true)
  );

  result := jsonb_build_object('grantId', target.id, 'userId', target.user_id, 'revoked', true);
  return app_private.admin_complete_idempotent_operation(
    actor, 'premium.revoke_grant', p_idempotency_key, result
  );
end;
$$;

revoke all on function
  api.admin_premium_overview(),
  api.admin_get_premium_member(uuid, text, uuid),
  api.admin_grant_premium(uuid, timestamptz, text, uuid),
  api.admin_revoke_premium(uuid, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function
  api.admin_premium_overview(),
  api.admin_get_premium_member(uuid, text, uuid),
  api.admin_grant_premium(uuid, timestamptz, text, uuid),
  api.admin_revoke_premium(uuid, text, uuid)
to authenticated;
comment on function api.admin_premium_overview() is
  'Staff (premium.read): BotolaGO+ settings, products, members by effective state (counts only) and live grants.';
comment on function api.admin_get_premium_member(uuid, text, uuid) is
  'Staff (premium.read): one member''s entitlement, grants and last 20 events (no payloads), with a reason; the read is written to the admin audit log.';
comment on function api.admin_grant_premium(uuid, timestamptz, text, uuid) is
  'Staff (premium.grant, recent authentication): gives an account a complimentary membership until p_ends_at (at most 400 days), idempotent by key, audited.';
comment on function api.admin_revoke_premium(uuid, text, uuid) is
  'Staff (premium.grant, recent authentication): ends a complimentary membership now, idempotent by key, audited.';

notify pgrst, 'reload schema';
$bg_20261013100200_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261013100300',
  'premium_account_erasure',
  array[$bg_20261013100300_file$-- BotolaGO+ (membership), part 4: the account erasure learns about memberships.
--
-- app_private.account_deletion_erase (20261006143700, patched by 20261008123100)
-- deletes auth.users, which cascades through app.profiles. For BotolaGO+ that
-- already removes, with the account: the entitlement (app.premium_entitlements),
-- the complimentary grants, the customer ids at billing providers
-- (app_private.billing_customers) and the chosen card edition
-- (app.card_edition_choices). What must NOT simply go is the accounting
-- record: app_private.billing_events keeps its rows (amounts, dates, products,
-- provider event ids) for the legal retention period, pseudonymised
-- (plan 5.8). The retention period is 5 years (owner decision, 2026-10-13); no
-- purge ships and no job is scheduled, so the pseudonymised rows stay until a
-- reviewed purge is added.
--
-- This migration adds three things to the erasure, in the same style as
-- 20261008123100 (the function is patched in place: each exact text is
-- replaced once, and the migration stops if an anchor is not found exactly
-- once or the definition would not change; CREATE OR REPLACE keeps owner and
-- grants):
--
--   1. app_private.premium_erase_user(uuid): pseudonymises the member's billing
--      events (user_id cleared, the raw payload emptied, a stable pseudonym
--      that keeps one erased member's events together, erased_at set).
--   2. A per-member advisory lock, the same key api.service_apply_billing_event
--      takes, so an event for the member cannot land half-way through the
--      erasure.
--   3. A refusal (PT409 account_deletion_subscription_active) while the member
--      still holds a renewing web subscription that is active or in grace:
--      the billing worker must cancel it at the provider first (plan 5.8). The
--      worker releases the request and tries again on its next hourly run.
--      Store subscriptions (Apple, Google) can only be cancelled by the member
--      in the store and are not refused; the terms say so.

create function app_private.premium_erase_user(p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update app_private.billing_events set
    user_id = null,
    subject_pseudonym = 'erased-' || substr(
      encode(sha256(convert_to(p_user::text, 'UTF8')), 'hex'), 1, 16),
    payload = '{}'::jsonb,
    erased_at = statement_timestamp()
  where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function app_private.premium_erase_user(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.premium_erase_user(uuid) to postgres;
comment on function app_private.premium_erase_user(uuid) is
  'Pseudonymises a member''s billing events before the account is erased (accounting records are kept): user_id cleared, payload emptied, a stable pseudonym, erased_at. Returns the number of events. Called by app_private.account_deletion_erase. Executable by postgres only.';

do $erase$
declare
  definition text;
  guard_anchor text;
  guard_text text;
  erase_anchor text;
  erase_text text;
begin
  definition := pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure);

  guard_anchor := '  perform app_private.account_deletion_disable(target);
';
  guard_text := '  -- BotolaGO+: serialise with the billing writer for this member, and do not
  -- erase an account that is still being billed on the web.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target::text || '':premium'', 0)
  );
  if exists (
    select 1
    from app.premium_entitlements entitlement
    join app_private.premium_products product on product.code = entitlement.product_code
    where entitlement.user_id = target
      and entitlement.source = ''web''
      and product.renews
      and entitlement.state in (''active'', ''grace'')
  ) then
    raise exception using errcode = ''PT409'', message = ''account_deletion_subscription_active'';
  end if;
' || guard_anchor;

  erase_anchor := '  -- The account itself. Cascades to the profile and every per-account table.
  delete from auth.users where id = target;
';
  erase_text := '  -- BotolaGO+: the billing events are accounting records, kept pseudonymised.
  perform app_private.premium_erase_user(target);

' || erase_anchor;

  if (length(definition) - length(replace(definition, guard_anchor, ''))) / length(guard_anchor) <> 1
    or (length(definition) - length(replace(definition, erase_anchor, ''))) / length(erase_anchor) <> 1 then
    raise exception 'premium erase: the erasure is not the 20261006143700 version (anchors not found exactly once)';
  end if;
  definition := replace(definition, guard_anchor, guard_text);
  definition := replace(definition, erase_anchor, erase_text);
  execute definition;
end;
$erase$;
$bg_20261013100300_file$]
);

-- ---------------------------------------------------------------------------
-- Run them, in order, from the history, once each is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261013100000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261013100000'
  );
  part_20261013100100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261013100100'
  );
  part_20261013100200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261013100200'
  );
  part_20261013100300 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261013100300'
  );
begin
  if encode(sha256(convert_to(part_20261013100000, 'UTF8')), 'hex')
    is distinct from '155b5c0375254adf39f4ed32dd637edb89b2c347c959a9c0b9e86cefb6e20da2' then
    raise exception 'stop: 20261013100000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261013100100, 'UTF8')), 'hex')
    is distinct from '711c497627a591b3ad833a433dded2472504a27c793e543d4503d4ff9f0348a2' then
    raise exception 'stop: 20261013100100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261013100200, 'UTF8')), 'hex')
    is distinct from '03d877f5b99b8d3ae9b79a323e59b5bef2cb78b13f4f613ac5f7bee0e9faee05' then
    raise exception 'stop: 20261013100200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261013100300, 'UTF8')), 'hex')
    is distinct from '5adcb80864de61772e5aaf39ffbec1c75955fdbe65c5b473988e35ae50606a38' then
    raise exception 'stop: 20261013100300 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261013100000;
  execute part_20261013100100;
  execute part_20261013100200;
  execute part_20261013100300;
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
  if (select count(*) from supabase_migrations.schema_migrations where version in ('20261013100000', '20261013100100', '20261013100200', '20261013100300')) <> 4 then
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
    'historyRows', 4
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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261013100000')
    then 'Applied. BotolaGO+ is in place and OFF: mode off, checkout disabled, no member rows. Next: docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
