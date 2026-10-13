-- BotolaGO+ (membership), the state machine and the membership check
-- (20261013100000): app_private.premium_next_state, app_private.premium_effective_state
-- and app_private.has_premium as truth tables.
--
-- The expectations below are written by hand from plan 5.2 (docs/plans/BOTOLAGO_PLUS_PLAN.md):
-- a '-' is an event that does not apply in that state (it is stored and ignored).
-- Columns: none, active, cancelling, grace, on_hold, expired, refunded, revoked.
begin;
select extensions.plan(24);

create function pg_temp.row(p_event text) returns text language sql as $$
  select string_agg(coalesce(app_private.premium_next_state(s.state, p_event), '-'), ',' order by s.o)
  from unnest(array['none', 'active', 'cancelling', 'grace', 'on_hold', 'expired', 'refunded', 'revoked'])
    with ordinality as s(state, o)
$$;

select extensions.is(pg_temp.row('purchase'),
  'active,active,active,active,active,active,active,active',
  'purchase: a new purchase starts a membership from every state');
select extensions.is(pg_temp.row('renewal'),
  'active,active,active,active,active,active,-,-',
  'renewal: back to active, except after a refund or a revocation');
select extensions.is(pg_temp.row('cancel'),
  '-,cancelling,cancelling,grace,expired,-,-,-',
  'cancel: active becomes cancelling, grace stays grace, on hold ends, the rest ignore it');
select extensions.is(pg_temp.row('uncancel'),
  '-,-,active,-,-,-,-,-',
  'uncancel: only cancelling goes back to active');
select extensions.is(pg_temp.row('payment_failed'),
  '-,grace,-,grace,-,-,-,-',
  'payment_failed: active enters grace; a cancelling membership does not renew so a failed payment is moot');
select extensions.is(pg_temp.row('hold'),
  '-,on_hold,-,on_hold,on_hold,-,-,-',
  'hold: active or grace go on hold');
select extensions.is(pg_temp.row('expire'),
  '-,expired,expired,expired,expired,expired,-,-',
  'expire: a running or lapsing membership ends; none, refunded and revoked are left alone');
select extensions.is(pg_temp.row('refund'),
  '-,refunded,refunded,refunded,refunded,refunded,-,-',
  'refund: immediate, from any state that held a membership');
select extensions.is(pg_temp.row('revoke'),
  '-,revoked,revoked,revoked,revoked,revoked,-,-',
  'revoke (chargeback, store revocation): immediate, from any state that held a membership');
select extensions.is(app_private.premium_next_state('active', 'upgrade'), null,
  'an unknown event type never applies');
select extensions.is(app_private.premium_next_state(null, 'purchase'), 'active',
  'a missing state is not a crash for a purchase');

-- The effective state: the stored state with its dates applied at 2090-06-15 12:00 UTC.
create function pg_temp.eff(p_state text, p_source text, p_end text, p_grace text) returns text language sql as $$
  select app_private.premium_effective_state(p_state, p_source, p_end::timestamptz, p_grace::timestamptz,
    timestamptz '2090-06-15 12:00+00')
$$;
select extensions.is(
  concat_ws(',',
    pg_temp.eff('active', 'web', '2090-06-20', null),
    pg_temp.eff('active', 'web', '2090-06-10', null),
    pg_temp.eff('active', 'web', '2090-06-15 12:00', null),
    pg_temp.eff('cancelling', 'web', '2090-06-20', null),
    pg_temp.eff('cancelling', 'google', '2090-06-10', null)),
  'active,expired,expired,cancelling,expired',
  'a paid period that has ended counts as expired, to the second, whether or not an event arrived');
select extensions.is(
  concat_ws(',',
    pg_temp.eff('grace', 'web', '2090-06-10', '2090-06-17'),
    pg_temp.eff('grace', 'web', '2090-06-10', '2090-06-14'),
    pg_temp.eff('grace', 'apple', '2090-06-10', '2090-06-14'),
    pg_temp.eff('grace', 'google', '2090-06-10', '2090-06-17')),
  'grace,expired,on_hold,grace',
  'a grace that has ended is expired on the web and on hold in a store');
select extensions.is(
  concat_ws(',',
    pg_temp.eff('on_hold', 'apple', '2090-06-10', null),
    pg_temp.eff('expired', 'web', '2090-07-10', null),
    pg_temp.eff('refunded', 'web', '2090-07-10', null),
    pg_temp.eff('revoked', 'google', '2090-07-10', null),
    pg_temp.eff(null, null, null, null)),
  'on_hold,expired,refunded,revoked,none',
  'the final states ignore dates, and no row is none');

-- has_premium. One member whose row is replaced for every case; the time is fixed.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bc2e0000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'premium-sm@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"premium_sm","display_name":"Premium SM"}', statement_timestamp(), statement_timestamp()),
  ('bc2e0000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'premium-staff@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"premium_staff","display_name":"Premium Staff"}', statement_timestamp(), statement_timestamp());
insert into app_private.staff_principals (id, auth_user_id)
values ('bc2e0000-0000-4000-8000-0000000000a1', 'bc2e0000-0000-4000-8000-000000000002');

create function pg_temp.has(p_mode text, p_state text, p_source text, p_end text, p_grace text)
returns text language plpgsql as $$
begin
  perform app_private.premium_configure(p_mode);
  delete from app.premium_entitlements where user_id = 'bc2e0000-0000-4000-8000-000000000001';
  if p_state is not null then
    insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
      current_period_end, grace_until, last_event_at)
    values ('bc2e0000-0000-4000-8000-000000000001', p_state, 'plus_monthly', p_source,
      timestamptz '2090-05-01 00:00+00', p_end::timestamptz, p_grace::timestamptz, timestamptz '2090-05-01 00:00+00');
  end if;
  return case when app_private.has_premium('bc2e0000-0000-4000-8000-000000000001',
    timestamptz '2090-06-15 12:00+00') then 't' else 'f' end;
end $$;

-- The twelve entitlement cases, in this order.
create function pg_temp.entitlement_row(p_mode text) returns text language sql as $$
  select string_agg(pg_temp.has(p_mode, c.state, c.source, c."end", c.grace), '' order by c.o)
  from (values
    (1, null, null, null, null),
    (2, 'active', 'web', '2090-06-20', null),
    (3, 'active', 'web', '2090-06-10', null),
    (4, 'cancelling', 'web', '2090-06-20', null),
    (5, 'cancelling', 'web', '2090-06-10', null),
    (6, 'grace', 'web', '2090-06-10', '2090-06-17'),
    (7, 'grace', 'web', '2090-06-10', '2090-06-14'),
    (8, 'grace', 'apple', '2090-06-10', '2090-06-14'),
    (9, 'on_hold', 'apple', '2090-06-10', null),
    (10, 'expired', 'web', '2090-06-10', null),
    (11, 'refunded', 'web', '2090-06-30', null),
    (12, 'revoked', 'google', '2090-06-30', null)
  ) as c(o, state, source, "end", grace)
$$;
select extensions.is(pg_temp.entitlement_row('off'), 'ffffffffffff',
  'mode off: nobody is a member, whatever they hold');
select extensions.is(pg_temp.entitlement_row('preview'), 'ffffffffffff',
  'mode preview: an entitlement does not count (only a grant does)');
select extensions.is(pg_temp.entitlement_row('on'), 'ftftftffffff',
  'mode on: none f, active valid t, active lapsed f, cancelling valid t, cancelling lapsed f, grace valid t, then f for an ended grace (web and store), on hold, expired, refunded and revoked');

-- Grants (no entitlement): live, not started yet, ended, revoked.
create function pg_temp.grant_row(p_mode text) returns text language plpgsql as $$
declare r text := '';
  k record;
begin
  perform app_private.premium_configure(p_mode);
  delete from app.premium_entitlements where user_id = 'bc2e0000-0000-4000-8000-000000000001';
  for k in select * from (values
      (1, '2090-06-01', '2090-06-30', false), (2, '2090-06-20', '2090-06-30', false),
      (3, '2090-05-01', '2090-06-10', false), (4, '2090-06-01', '2090-06-30', true)
    ) as g(o, s, e, revoked) order by o loop
    delete from app_private.premium_grants where user_id = 'bc2e0000-0000-4000-8000-000000000001';
    insert into app_private.premium_grants (user_id, starts_at, ends_at, reason, granted_by_principal_id,
      revoked_at, revoked_by_principal_id, revoke_reason)
    values ('bc2e0000-0000-4000-8000-000000000001', k.s::timestamptz, k.e::timestamptz,
      'Complimentary for the test', 'bc2e0000-0000-4000-8000-0000000000a1',
      case when k.revoked then timestamptz '2090-06-05 00:00+00' end,
      case when k.revoked then 'bc2e0000-0000-4000-8000-0000000000a1'::uuid end,
      case when k.revoked then 'Revoked for the test' end);
    r := r || case when app_private.has_premium('bc2e0000-0000-4000-8000-000000000001',
      timestamptz '2090-06-15 12:00+00') then 't' else 'f' end;
  end loop;
  delete from app_private.premium_grants where user_id = 'bc2e0000-0000-4000-8000-000000000001';
  return r;
end $$;
select extensions.is(pg_temp.grant_row('off'), 'ffff', 'mode off: not even a live grant makes a member');
select extensions.is(pg_temp.grant_row('preview'), 'tfff',
  'mode preview: a live grant counts; one not started, one ended and one revoked do not');
select extensions.is(pg_temp.grant_row('on'), 'tfff', 'mode on: the same for grants');

-- A grant and an entitlement are independent.
create function pg_temp.both(p_mode text, p_state text, p_end text) returns text language plpgsql as $$
begin
  perform pg_temp.has(p_mode, p_state, 'web', p_end, null);
  insert into app_private.premium_grants (user_id, starts_at, ends_at, reason, granted_by_principal_id)
  values ('bc2e0000-0000-4000-8000-000000000001', timestamptz '2090-06-01 00:00+00',
    timestamptz '2090-06-30 00:00+00', 'Complimentary for the test', 'bc2e0000-0000-4000-8000-0000000000a1');
  return case when app_private.has_premium('bc2e0000-0000-4000-8000-000000000001',
    timestamptz '2090-06-15 12:00+00') then 't' else 'f' end;
end $$;
select extensions.is(
  pg_temp.both('on', 'expired', '2090-06-10'), 't', 'on: a lapsed paid membership plus a live grant is a member');
select extensions.is(
  (select pg_temp.both('preview', 'refunded', '2090-06-30')), 't',
  'preview: a live grant makes a member whatever the entitlement says');
delete from app_private.premium_grants;
select app_private.premium_configure('off');

-- Another person is not a member because of this one.
select extensions.is(
  app_private.has_premium('bc2e0000-0000-4000-8000-000000000002', timestamptz '2090-06-15 12:00+00'), false,
  'a person with no entitlement and no grant is never a member');
select extensions.is(app_private.has_premium(null), false, 'and a null user is not a member');

select * from extensions.finish();
rollback;
