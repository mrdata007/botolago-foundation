-- BotolaGO+ (membership), tables and switches (20261013100000 .. 20261013100100).
--
-- Covered: every table exists with row security enabled AND forced and no
-- policy; no right on any table for anon, authenticated, service_role or
-- PUBLIC (not even a column right); every foreign key has an index; the switch
-- ships off (mode off, checkout off, billing not paused) and only postgres can
-- change it; checkout cannot be on while mode is off; the two products carry
-- the owner's prices (20 MAD a month, 200 MAD a year, the yearly one does not
-- renew); the editions catalogue is standard (free, the tier's metal) plus
-- holo, electric, pixel and chrome (paid); a provider event id can be stored
-- once; the helpers are not callable by any API role.
begin;
select extensions.plan(32);

-- The eight tables.
create function pg_temp.tables() returns text[] language sql immutable as $$
  select array['app.card_edition_choices', 'app.card_editions', 'app.premium_entitlements',
    'app_private.billing_customers', 'app_private.billing_events', 'app_private.premium_grants',
    'app_private.premium_products', 'app_private.premium_settings']
$$;

select extensions.is(
  (select array_agg(n.nspname || '.' || c.relname order by n.nspname || '.' || c.relname collate "C")
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname || '.' || c.relname = any (pg_temp.tables()) and c.relkind = 'r'),
  (select array_agg(t order by t collate "C") from unnest(pg_temp.tables()) t),
  'the eight BotolaGO+ tables exist');
select extensions.is(
  (select array_agg(n.nspname || '.' || c.relname order by n.nspname || '.' || c.relname collate "C")
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname || '.' || c.relname = any (pg_temp.tables())
     and c.relrowsecurity and c.relforcerowsecurity),
  (select array_agg(t order by t collate "C") from unnest(pg_temp.tables()) t),
  'every one has row level security enabled and forced');
select extensions.is(
  (select count(*)::integer from pg_policies
   where schemaname || '.' || tablename = any (pg_temp.tables())),
  0, 'and no policy: only definer functions read or write them');
select extensions.is(
  (select count(*)::integer
   from unnest(pg_temp.tables()) t
   cross join unnest(array['anon', 'authenticated', 'service_role']) r
   where has_table_privilege(r, t, 'select,insert,update,delete,truncate,references,trigger')
     or has_any_column_privilege(r, t, 'select,insert,update,references')),
  0, 'anon, authenticated and service_role hold no right on any of them, column rights included');
select extensions.is(
  (select count(*)::integer
   from unnest(pg_temp.tables()) t
   join pg_class c on c.oid = t::regclass
   cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
   where x.grantee = 0),
  0, 'and PUBLIC holds none');

-- Foreign keys are indexed.
select extensions.is(
  (select coalesce(string_agg(c.conrelid::regclass::text || '.' || c.conname, ', '), '')
   from pg_constraint c
   where c.contype = 'f' and c.conrelid::regclass::text = any (pg_temp.tables())
     and not exists (
       select 1 from pg_index i
       where i.indrelid = c.conrelid
         and (i.indkey::text = array_to_string(c.conkey, ' ')
           or i.indkey::text like array_to_string(c.conkey, ' ') || ' %'))),
  '', 'every foreign key of the eight tables has an index that starts with its columns');

-- The switch ships off.
select extensions.is(
  (select count(*)::integer || ':' || bool_and(mode = 'off' and not checkout_enabled and not billing_paused)::text
   from app_private.premium_settings),
  '1:true', 'the switch is one row: mode off, checkout off, billing not paused');
select extensions.is(
  app_private.has_premium('00000000-0000-4000-8000-000000000001'::uuid), false,
  'and nobody is a member');
select extensions.is(api.premium_status() ->> 'enabled', 'false', 'the public status says disabled');

-- Only postgres can change the switch.
select extensions.is(
  (select string_agg(r || ':' || has_function_privilege(r, 'app_private.premium_configure(text,boolean,boolean)', 'execute')::text, ',' order by r)
   from unnest(array['anon', 'authenticated', 'postgres', 'service_role']) r),
  'anon:false,authenticated:false,postgres:true,service_role:false',
  'app_private.premium_configure is executable by postgres alone');
select extensions.throws_ok(
  $$update app_private.premium_settings set checkout_enabled = true where id$$,
  '23514', 'new row for relation "premium_settings" violates check constraint "premium_settings_checkout_check"',
  'checkout cannot be enabled while the mode is off');
select extensions.throws_ok(
  $$update app_private.premium_settings set mode = 'maybe' where id$$,
  '23514', 'new row for relation "premium_settings" violates check constraint "premium_settings_mode_check"',
  'the mode is off, preview or on');
select extensions.throws_ok(
  $$insert into app_private.premium_settings (id, mode) values (false, 'off')$$,
  '23514', 'new row for relation "premium_settings" violates check constraint "premium_settings_singleton"',
  'the switch is a singleton');
select extensions.is(
  app_private.premium_configure('on', true), '{"mode": "on", "checkoutEnabled": true, "billingPaused": false}'::jsonb,
  'premium_configure(on, true) turns the membership and checkout on');
select extensions.is(
  app_private.premium_configure(null, null, true), '{"mode": "on", "checkoutEnabled": true, "billingPaused": true}'::jsonb,
  'a null leaves a switch as it is; the third argument pauses billing');
select extensions.is(
  app_private.premium_configure('off', null, false), '{"mode": "off", "checkoutEnabled": false, "billingPaused": false}'::jsonb,
  'switching the mode off also switches checkout off');
select extensions.throws_ok(
  $$select app_private.premium_configure('off', true)$$, 'PT400', 'premium_checkout_requires_mode',
  'checkout cannot be requested while off');
select extensions.throws_ok(
  $$select app_private.premium_configure('sometimes')$$, 'PT400', 'premium_mode_invalid',
  'an unknown mode is refused');
select extensions.is(
  (select mode || ':' || checkout_enabled from app_private.premium_settings),
  'off:false', 'and the refused calls changed nothing');

-- The owner's prices.
select extensions.is(
  (select string_agg(code || '/' || period_months || '/' || renews || '/' || price_minor || '/' || currency || '/' || active,
     ',' order by sort_order) from app_private.premium_products),
  'plus_monthly/1/true/2000/MAD/true,plus_yearly/12/false/20000/MAD/true',
  '20 MAD a month (renews) and 200 MAD a year (12 months, does not renew), centimes, tax included');
select extensions.throws_ok(
  $$insert into app_private.premium_products (code, period_months, renews, price_minor) values ('plus_season', 10, false, 19900)$$,
  '23514', 'new row for relation "premium_products" violates check constraint "premium_products_period_check"',
  'a product lasts 1 or 12 months');

-- The editions.
select extensions.is(
  (select string_agg(code || '/' || premium || '/' || finish || '/' || status, ',' order by sort_order)
   from app.card_editions),
  'standard/false/tier_metal/active,holo/true/holo/active,electric/true/electric/active,pixel/true/pixel/active,chrome/true/chrome/active',
  'the catalogue is standard (free, the tier''s metal) plus holo, electric, pixel and chrome (paid)');
select extensions.throws_ok(
  $$update app.card_editions set premium = true where code = 'standard'$$,
  '23514', 'new row for relation "card_editions" violates check constraint "card_editions_standard_check"',
  'the standard edition can never become paid');
select extensions.throws_ok(
  $$insert into app.card_editions (code, premium, finish, label_fr, label_ar) values ('free_pixel', false, 'pixel', 'Pixels libres', 'بكسل')$$,
  '23514', 'new row for relation "card_editions" violates check constraint "card_editions_paid_check"',
  'and only standard is free');
select extensions.ok(
  (select bool_and(label_fr <> '' and label_ar <> '') from app.card_editions),
  'every edition has a French and an Arabic label');

-- A provider event id is stored once.
insert into app_private.billing_events (provider_event_id, provider, source, event_type, occurred_at,
  signature_verified, outcome)
values ('test:one', 'cmi', 'web', 'purchase', statement_timestamp(), true, 'ignored_user');
select extensions.throws_ok(
  $$insert into app_private.billing_events (provider_event_id, provider, source, event_type, occurred_at,
    signature_verified, outcome) values ('test:one', 'payzone', 'web', 'renewal', statement_timestamp(), true, 'applied')$$,
  '23505', 'duplicate key value violates unique constraint "billing_events_provider_event_key"',
  'a second event with the same provider_event_id is refused by the table itself');
select extensions.throws_ok(
  $$insert into app_private.billing_events (provider_event_id, provider, source, event_type, occurred_at,
    signature_verified, outcome) values ('test:two', 'cmi', 'sms', 'purchase', statement_timestamp(), true, 'applied')$$,
  '23514', 'new row for relation "billing_events" violates check constraint "billing_events_source_check"',
  'the source is web, apple, google or grant');

-- Entitlement rules at the table.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('bc1e0000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'premium-schema@example.test', statement_timestamp(), 'hash', '{}',
  '{"username":"premium_schema","display_name":"Premium Schema"}', statement_timestamp(), statement_timestamp());
select extensions.throws_ok(
  $$insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
    current_period_end, last_event_at) values ('bc1e0000-0000-4000-8000-000000000001', 'none', 'plus_monthly',
    'web', now(), now() + interval '1 month', now())$$,
  '23514', 'new row for relation "premium_entitlements" violates check constraint "premium_entitlements_state_check"',
  '"none" is the absence of a row, never a stored state');
select extensions.throws_ok(
  $$insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
    current_period_end, last_event_at) values ('bc1e0000-0000-4000-8000-000000000001', 'grace', 'plus_monthly',
    'web', now(), now() + interval '1 month', now())$$,
  '23514', 'new row for relation "premium_entitlements" violates check constraint "premium_entitlements_grace_check"',
  'a grace state carries its end date');
select extensions.throws_ok(
  $$insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
    current_period_end, last_event_at) values ('bc1e0000-0000-4000-8000-000000000001', 'active', 'plus_monthly',
    'web', now(), now() - interval '1 day', now())$$,
  '23514', 'new row for relation "premium_entitlements" violates check constraint "premium_entitlements_period_check"',
  'a period ends after it starts');

-- Retention is a decision, pinned: billing records are kept 5 years and nothing purges them.
select extensions.ok(
  obj_description('app_private.billing_events'::regclass, 'pg_class') like '%kept 5 years%'
  and not exists (select 1 from cron.job where jobname like '%billing%' or jobname like '%premium%'),
  'billing events are documented as kept 5 years (owner decision 2026-10-13) and no job purges them');

-- The helpers belong to no API role.
select extensions.is(
  (select count(*)::integer from pg_proc p
   cross join unnest(array['anon', 'authenticated', 'service_role']) r
   where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('has_premium', 'premium_next_state', 'premium_effective_state',
       'card_edition_effective', 'premium_erase_user', 'premium_configure')
     and has_function_privilege(r, p.oid, 'execute')),
  0, 'no API role can run the membership helpers');

select * from extensions.finish();
rollback;
