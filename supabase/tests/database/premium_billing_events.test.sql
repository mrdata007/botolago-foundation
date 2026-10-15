-- BotolaGO+ (membership), the billing event writer (20261013100200):
-- api.service_apply_billing_event.
--
-- Covered: service role only; the event is validated (PT400) and nothing is stored when
-- it is not; an event is stored once and a replay answers the first outcome without
-- writing; the state machine through the real function (purchase, renewal, cancel, uncancel,
-- payment failure and grace, hold, expiry, refund, revocation); the yearly product is
-- 12 months and does not renew; buying again never shortens what was paid for; stale
-- events, a store event on a web membership, an unsigned event, an unknown product, an
-- unknown or closing account are stored with their outcome and move nothing; billing can be
-- paused (retryable PT503); the writer works whatever the mode, and the mode decides who is
-- a member.
--
-- Accounts: A walks the whole machine, B receives only ignored events, C buys the yearly
-- product, D is closing (deleted_at set), E has a promotional grant event.
-- Times are fixed in 2026-06 .. 2027-06, all in the past or near it.
begin;
select extensions.plan(65);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('bc3e0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.t(p_days integer) returns text language sql immutable as $$
  select ((timestamptz '2026-06-01 09:00+00') + p_days * interval '1 day')::text
$$;
create function pg_temp.ev(p_id text, p_type text, p_user integer, p_day integer,
  p_extra jsonb default '{}'::jsonb, p_source text default 'web')
returns jsonb language sql as $$
  select jsonb_build_object('providerEventId', p_id, 'provider', 'cmi', 'source', p_source,
    'eventType', p_type, 'userId', pg_temp.u(p_user), 'occurredAt', pg_temp.t(p_day),
    'signatureVerified', true) || p_extra
$$;
-- Applies an event as the service role (the way the billing worker calls it).
create function pg_temp.apply(p_event jsonb) returns jsonb language plpgsql as $$
declare result jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    result := api.service_apply_billing_event(p_event);
  exception when others then
    result := jsonb_build_object('__error', sqlstate || ' ' || sqlerrm);
  end;
  perform set_config('request.jwt.claims', '', true);
  return result;
end $$;
create function pg_temp.out(p_event jsonb) returns text language sql as $$
  select concat_ws('/', r ->> 'outcome', r ->> 'stateBefore', r ->> 'stateAfter', r ->> 'duplicate', r ->> '__error')
  from (select pg_temp.apply(p_event) as r) x
$$;
-- The entitlement as text: state/product/source/period end/grace end/cancel requested.
create function pg_temp.ent(p_user integer) returns text language sql as $$
  select coalesce((select concat_ws('/', state, product_code, source, current_period_end::text,
      coalesce(grace_until::text, '-'), coalesce(cancel_requested_at::text, '-'))
    from app.premium_entitlements where user_id = pg_temp.u(p_user)), 'none')
$$;
create function pg_temp.events(p_user integer) returns integer language sql as $$
  select count(*)::integer from app_private.billing_events where user_id = pg_temp.u(p_user)
$$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'billing-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'billing_' || n, 'display_name', 'Billing ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 5) n;
update app.profiles set deleted_at = statement_timestamp() where id = pg_temp.u(4);
-- 20261016150000 made the monthly and yearly products inactive (only the Saison is sold). This test
-- exercises the state machine through them, so it makes them sellable again, inside its transaction.
update app_private.premium_products set active = true where code in ('plus_monthly', 'plus_yearly');

-- ---------------------------------------------------------------------------
-- Who may call it, and bad input
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg(r || ':' || has_function_privilege(r, 'api.service_apply_billing_event(jsonb)', 'execute')::text, ',' order by r)
   from unnest(array['anon', 'authenticated', 'service_role']) r),
  'anon:false,authenticated:false,service_role:true',
  'only the service role can execute the writer');
select extensions.is(
  (select concat_ws(',', p.prosecdef, p.proconfig = array['search_path=""'])
   from pg_proc p where p.oid = 'api.service_apply_billing_event(jsonb)'::regprocedure),
  't,t', 'it is security definer with an empty search_path');
select extensions.throws_ok(
  format($$select api.service_apply_billing_event(%L::jsonb)$$, pg_temp.ev('x:1', 'purchase', 1, 0, '{"productCode":"plus_monthly"}')::text),
  'PT403', 'premium_access_denied', 'a caller that is not the service role is refused, whatever its database role');

select app_private.premium_configure('on');

select extensions.is(
  (select count(*)::integer
   from (values
     (pg_temp.ev('', 'purchase', 1, 0, '{"productCode":"plus_monthly"}')),
     (pg_temp.ev('x:2', 'upgrade', 1, 0)),
     (pg_temp.ev('x:3', 'purchase', 1, 0)),
     (pg_temp.ev('x:4', 'purchase', 1, 0, '{"productCode":"Plus"}')),
     (pg_temp.ev('x:5', 'purchase', 1, 0, '{"productCode":"plus_monthly","occurredAt":"not a date"}')),
     (pg_temp.ev('x:6', 'purchase', 1, 0, '{"productCode":"plus_monthly","occurredAt":"2999-01-01T00:00:00Z"}')),
     (pg_temp.ev('x:7', 'purchase', 1, 0, '{"productCode":"plus_monthly","signatureVerified":"yes"}')),
     (pg_temp.ev('x:8', 'purchase', 1, 0, '{"productCode":"plus_monthly","payload":[1]}')),
     (pg_temp.ev('x:9', 'purchase', 1, 0, format('{"productCode":"plus_monthly","periodStart":"%s","periodEnd":"%s"}', pg_temp.t(5), pg_temp.t(1))::jsonb)),
     (pg_temp.ev('x:10', 'purchase', 1, 0, '{"productCode":"plus_monthly","userId":"nobody"}')),
     (pg_temp.ev('x:11', 'purchase', 1, 0, '{"productCode":"plus_monthly","source":"sms"}')),
     (pg_temp.ev('x:12', 'purchase', 1, 0, '{"productCode":"plus_monthly","provider":"CMI"}')),
     (pg_temp.ev('x:13', 'purchase', 1, 0, '{"productCode":"plus_monthly","currency":"mad"}')),
     (pg_temp.ev('x:14', 'purchase', 1, 0, '{"productCode":"plus_monthly","amountMinor":-5}')),
     (pg_temp.ev('x:15', 'purchase', 1, 0, '{"productCode":"plus_monthly","providerEventId":" padded "}')))
   as v(e)
   where pg_temp.out(e) is distinct from 'PT400 validation_failed'),
  0, 'fifteen malformed events are each refused with PT400 validation_failed');
select extensions.is(
  pg_temp.out('[]'::jsonb) || '|' || pg_temp.out('null'::jsonb) || '|' || coalesce((select pg_temp.out(null::jsonb)), 'null'),
  'PT400 validation_failed|PT400 validation_failed|PT400 validation_failed',
  'a non-object is refused too');
select extensions.is(
  (select count(*)::integer from app_private.billing_events where provider_event_id like 'x:%'), 0,
  'and a refused event is not stored');

-- ---------------------------------------------------------------------------
-- A walks the whole machine
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.out(pg_temp.ev('a:1', 'purchase', 1, 0, '{"productCode":"plus_monthly","amountMinor":2000,"currency":"MAD","payload":{"orderId":"o-1"}}')),
  'applied/none/active/false', 'A buys the monthly product: applied, none to active');
select extensions.is(pg_temp.ent(1),
  'active/plus_monthly/web/' || ((timestamptz '2026-06-01 09:00+00') + interval '1 month')::text || '/-/-',
  'the month runs from the purchase (no period given: the product''s)');
select extensions.is(
  (select concat_ws('/', amount_minor, currency, payload ->> 'orderId', signature_verified, outcome, user_id = pg_temp.u(1))
   from app_private.billing_events where provider_event_id = 'a:1'),
  '2000/MAD/o-1/t/applied/t', 'the event is stored with its amount, currency, payload and outcome');

-- Replay.
select extensions.is(
  pg_temp.out(pg_temp.ev('a:1', 'purchase', 1, 0, '{"productCode":"plus_monthly"}')),
  'applied/none/active/true', 'a replay answers the first outcome and says duplicate');
select extensions.is(
  pg_temp.out(pg_temp.ev('a:1', 'refund', 1, 40)),
  'applied/none/active/true', 'even a replayed id carrying a different event answers the first outcome');
select extensions.is(
  (select count(*)::integer from app_private.billing_events where provider_event_id = 'a:1'), 1,
  'and stores nothing more');
select extensions.is(pg_temp.ent(1),
  'active/plus_monthly/web/' || ((timestamptz '2026-06-01 09:00+00') + interval '1 month')::text || '/-/-',
  'the replays moved nothing');
select extensions.is(
  (select (pg_temp.apply(pg_temp.ev('a:1', 'purchase', 1, 0, '{"productCode":"plus_monthly"}')) ->> 'eventId')::bigint
    = (select id from app_private.billing_events where provider_event_id = 'a:1')),
  true, 'and hands back the id of the stored event');

select extensions.is(
  pg_temp.out(pg_temp.ev('a:2', 'renewal', 1, 30, format('{"productCode":"plus_monthly","periodStart":"%s","periodEnd":"%s"}', pg_temp.t(30), pg_temp.t(60))::jsonb)),
  'applied/active/active/false', 'a renewal with the provider''s own period is applied');
select extensions.is(pg_temp.ent(1), 'active/plus_monthly/web/' || pg_temp.t(60)::timestamptz::text || '/-/-',
  'and the period is the provider''s');

select extensions.is(pg_temp.out(pg_temp.ev('a:3', 'cancel', 1, 35)), 'applied/active/cancelling/false',
  'A cancels: cancelling');
select extensions.is(pg_temp.ent(1), 'cancelling/plus_monthly/web/' || pg_temp.t(60)::timestamptz::text || '/-/' || pg_temp.t(35)::timestamptz::text,
  'the period is kept and the cancellation is dated');
select extensions.is(
  concat_ws(',',
    app_private.has_premium(pg_temp.u(1), pg_temp.t(50)::timestamptz),
    app_private.has_premium(pg_temp.u(1), pg_temp.t(61)::timestamptz)),
  't,f', 'a cancelling member keeps access to the end of the paid period, then not');
select extensions.is(pg_temp.out(pg_temp.ev('a:4', 'cancel', 1, 36)), 'applied/cancelling/cancelling/false',
  'cancelling twice is harmless');
select extensions.is(pg_temp.out(pg_temp.ev('a:5', 'uncancel', 1, 37)), 'applied/cancelling/active/false',
  'A changes their mind: active again');
select extensions.is(pg_temp.ent(1), 'active/plus_monthly/web/' || pg_temp.t(60)::timestamptz::text || '/-/-',
  'and the cancellation is cleared');

-- Payment failure and grace.
select extensions.is(pg_temp.out(pg_temp.ev('a:6', 'payment_failed', 1, 61)), 'applied/active/grace/false',
  'the renewal payment fails: grace');
select extensions.is(pg_temp.ent(1),
  'grace/plus_monthly/web/' || pg_temp.t(60)::timestamptz::text || '/' || (pg_temp.t(61)::timestamptz + interval '7 days')::text || '/-',
  'with 7 days of grace from the failure when the provider gives no date');
select extensions.is(
  concat_ws(',',
    app_private.has_premium(pg_temp.u(1), pg_temp.t(65)::timestamptz),
    app_private.has_premium(pg_temp.u(1), pg_temp.t(69)::timestamptz)),
  't,f', 'a member in grace keeps access until the grace ends');
select extensions.is(pg_temp.out(pg_temp.ev('a:7', 'payment_failed', 1, 64)), 'applied/grace/grace/false',
  'a second failed retry stays in grace');
select extensions.is(
  (select grace_until = pg_temp.t(61)::timestamptz + interval '7 days' from app.premium_entitlements where user_id = pg_temp.u(1)),
  true, 'and does not extend it');
select extensions.is(
  pg_temp.out(pg_temp.ev('a:8', 'renewal', 1, 66, format('{"productCode":"plus_monthly","periodStart":"%s","periodEnd":"%s"}', pg_temp.t(66), pg_temp.t(96))::jsonb)),
  'applied/grace/active/false', 'the retry succeeds: active, grace cleared');
select extensions.is(pg_temp.ent(1), 'active/plus_monthly/web/' || pg_temp.t(96)::timestamptz::text || '/-/-', 'with the new period');

-- Hold, expiry, refund.
select extensions.is(pg_temp.out(pg_temp.ev('a:9', 'hold', 1, 100, '{}', 'web')), 'applied/active/on_hold/false',
  'hold: no member features');
select extensions.is(app_private.has_premium(pg_temp.u(1), pg_temp.t(100)::timestamptz), false, 'a member on hold is not a member');
select extensions.is(pg_temp.out(pg_temp.ev('a:10', 'expire', 1, 101)), 'applied/on_hold/expired/false', 'expire: expired');
select extensions.is(pg_temp.out(pg_temp.ev('a:11', 'cancel', 1, 102)), 'ignored_state/expired/expired/false',
  'cancelling an expired membership does nothing (stored, ignored_state)');
select extensions.is(pg_temp.out(pg_temp.ev('a:12', 'refund', 1, 103)), 'applied/expired/refunded/false', 'refund: refunded');
select extensions.is(pg_temp.out(pg_temp.ev('a:13', 'renewal', 1, 104, '{"productCode":"plus_monthly"}')),
  'ignored_state/refunded/refunded/false', 'a renewal after a refund is ignored');
select extensions.is(pg_temp.out(pg_temp.ev('a:14', 'purchase', 1, 110, '{"productCode":"plus_monthly"}')),
  'applied/refunded/active/false', 'a new purchase after a refund starts again');
select extensions.is(pg_temp.out(pg_temp.ev('a:15', 'revoke', 1, 111)), 'applied/active/revoked/false', 'revoke (chargeback): revoked');
select extensions.is(app_private.has_premium(pg_temp.u(1), pg_temp.t(111)::timestamptz), false,
  'refunded and revoked members are not members, immediately');

-- Order and source.
select extensions.is(pg_temp.out(pg_temp.ev('a:16', 'purchase', 1, 120, '{"productCode":"plus_monthly"}')),
  'applied/revoked/active/false', 'back to active (day 120)');
select extensions.is(pg_temp.out(pg_temp.ev('a:17', 'expire', 1, 90)), 'ignored_stale/active/active/false',
  'an event older than the last applied one is stored and ignored (stale)');
select extensions.is(pg_temp.out(pg_temp.ev('a:18', 'expire', 1, 125, '{}', 'apple')), 'ignored_state/active/active/false',
  'a store event does not end a web membership');
select extensions.is(
  (select string_agg(outcome, ',' order by id) from app_private.billing_events where provider_event_id in ('a:17', 'a:18')),
  'ignored_stale,ignored_state', 'both are stored with their outcome');
select extensions.is(pg_temp.events(1), 18, 'A has all eighteen distinct events stored (replays added none)');
select extensions.is(
  (select count(*)::integer from app_private.billing_events where user_id = pg_temp.u(1) and outcome = 'applied'), 14,
  'fourteen of them applied');

-- Buying again never shortens what was paid for.
select extensions.is(pg_temp.out(pg_temp.ev('c:1', 'purchase', 3, 0, '{"productCode":"plus_yearly"}')),
  'applied/none/active/false', 'C buys the yearly product');
select extensions.is(pg_temp.ent(3),
  'active/plus_yearly/web/' || ((timestamptz '2026-06-01 09:00+00') + interval '12 months')::text || '/-/-',
  'it lasts 12 months from the purchase');
select extensions.is(
  concat_ws(',', app_private.has_premium(pg_temp.u(3), pg_temp.t(364)::timestamptz), app_private.has_premium(pg_temp.u(3), pg_temp.t(366)::timestamptz)),
  't,f', 'and does not renew: the member is out the day after (no event needed)');
select extensions.is(pg_temp.out(pg_temp.ev('c:2', 'purchase', 3, 10, '{"productCode":"plus_monthly"}')),
  'applied/active/active/false', 'C buys a month while the year is running');
select extensions.is(pg_temp.ent(3),
  'active/plus_monthly/web/' || ((timestamptz '2026-06-01 09:00+00') + interval '12 months')::text || '/-/-',
  'the paid year is kept (the later end wins)');

-- ---------------------------------------------------------------------------
-- Ignored on purpose, and stored
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.out(pg_temp.ev('b:1', 'purchase', 2, 0, '{"productCode":"plus_monthly","signatureVerified":false}')),
  'rejected_signature/none/none/false', 'an unverified signature is stored and moves nothing');
select extensions.is(pg_temp.out(pg_temp.ev('b:2', 'purchase', 2, 0, '{"productCode":"plus_ghost"}')),
  'ignored_product/none/none/false', 'an unknown product is ignored');
select extensions.is(pg_temp.out(pg_temp.ev('b:3', 'renewal', 2, 0, '{"productCode":"plus_monthly"}')),
  'applied/none/active/false', 'a renewal that arrives before its purchase still opens the membership');
delete from app.premium_entitlements where user_id = pg_temp.u(2);
update app_private.premium_products set active = false where code = 'plus_monthly';
select extensions.is(pg_temp.out(pg_temp.ev('b:4', 'purchase', 2, 1, '{"productCode":"plus_monthly"}')),
  'ignored_product/none/none/false', 'a retired product cannot be bought');
update app_private.premium_products set active = true where code = 'plus_monthly';
select extensions.is(pg_temp.out(pg_temp.ev('d:1', 'purchase', 4, 0, '{"productCode":"plus_monthly"}')),
  'ignored_user/none/none/false', 'an account that is closing gets nothing');
select extensions.is(
  pg_temp.out(pg_temp.ev('z:1', 'purchase', 9, 0, '{"productCode":"plus_monthly"}')),
  'ignored_user/none/none/false', 'nor does an account that does not exist');
select extensions.is(
  (select concat_ws('/', user_id is null, outcome) from app_private.billing_events where provider_event_id = 'z:1'),
  't/ignored_user', 'the unknown account''s event is stored with no user');
select extensions.is(pg_temp.ent(2) || '|' || pg_temp.ent(4) || '|' || pg_temp.ent(9), 'none|none|none', 'and none of them has an entitlement');

-- A promotional grant event from a store service.
select extensions.is(
  pg_temp.out(pg_temp.ev('e:1', 'purchase', 5, 0, '{"productCode":"plus_monthly","provider":"revenuecat"}', 'grant')),
  'applied/none/active/false', 'a promotional event from a store service (source grant) is applied');
select extensions.is(
  (select source from app.premium_entitlements where user_id = pg_temp.u(5)), 'grant', 'and the entitlement says so');

-- ---------------------------------------------------------------------------
-- Paused, off, and the mode
-- ---------------------------------------------------------------------------
select app_private.premium_configure(null, null, true);
select extensions.is(pg_temp.out(pg_temp.ev('p:1', 'purchase', 2, 1, '{"productCode":"plus_monthly"}')),
  'PT503 premium_billing_paused', 'while billing is paused the writer refuses, retryably (503)');
select extensions.is((select count(*)::integer from app_private.billing_events where provider_event_id = 'p:1'), 0,
  'and stores nothing, so the provider''s retry is a first delivery');
select app_private.premium_configure(null, null, false);
select extensions.is(pg_temp.out(pg_temp.ev('p:1', 'purchase', 2, 1, '{"productCode":"plus_monthly"}')),
  'applied/none/active/false', 'resumed, the same event is applied');

select app_private.premium_configure('off');
select extensions.is(pg_temp.out(pg_temp.ev('o:1', 'renewal', 2, 30, '{"productCode":"plus_monthly"}')),
  'applied/active/active/false', 'billing facts are recorded whatever the mode, even off');
select extensions.is(app_private.has_premium(pg_temp.u(2), pg_temp.t(31)::timestamptz), false,
  'but while off nobody is a member');
select app_private.premium_configure('on');
select extensions.is(app_private.has_premium(pg_temp.u(2), pg_temp.t(31)::timestamptz), true,
  'and the same record counts as soon as the mode is on');

select * from extensions.finish();
rollback;
