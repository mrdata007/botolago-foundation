-- A phone's push address moves to whoever presents it (20261005140000).
--
-- Before, registering an address already held by another registration was refused
-- (`device_token_conflict`), which left a phone without alerts for good after a
-- sign-out made offline, or a reinstall. Now the registration moves: the one that
-- held the address is switched off and loses it, its history stays, and the move is
-- audited without the address.
begin;
select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select ('ea000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'takeover-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'takeover_' || n, 'preferred_language', 'fr'),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 3) n;

create function pg_temp.as_user(p_n integer) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'ea000000-0000-4000-8000-00000000000' || p_n, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.register(p_device text, p_token text) returns jsonb language sql as $$
  select api.register_my_notification_device(p_device, 'ios', 'apns', p_token, 'fr', 'Africa/Casablanca', '1.0.0')
$$;

-- who holds an address now: "user/device/enabled", or nothing
create function pg_temp.holder(p_token text) returns text language sql stable as $$
  select string_agg(right(registration.user_id::text, 1) || '/' || registration.device_id || '/' || registration.enabled::text, ',')
  from app_private.push_destinations destination
  join app.device_registrations registration on registration.id = destination.device_registration_id
  where destination.destination_digest = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
$$;
create function pg_temp.state(p_user integer, p_device text) returns text language sql stable as $$
  select registration.enabled::text || '/' || (registration.invalidated_at is not null)::text || '/'
    || exists (select 1 from app_private.push_destinations d where d.device_registration_id = registration.id)::text
  from app.device_registrations registration
  where registration.user_id = ('ea000000-0000-4000-8000-00000000000' || p_user)::uuid and registration.device_id = p_device
$$;

-- ---------------------------------------------------------------------------
-- Another account on the same phone
-- ---------------------------------------------------------------------------
select pg_temp.as_user(1);
select pg_temp.register('phone-install-a1', 'ab' || repeat('01', 31));
reset role;
select extensions.is(
  pg_temp.holder('ab' || repeat('01', 31)), '1/phone-install-a1/true',
  'the first account holds the address'
);

select pg_temp.as_user(2);
select extensions.is(
  pg_temp.register('phone-install-b1', 'ab' || repeat('01', 31)) ->> 'enabled', 'true',
  'a second account presenting the same address is registered, not refused'
);
reset role;
select extensions.is(
  pg_temp.holder('ab' || repeat('01', 31)), '2/phone-install-b1/true',
  'the address now belongs to the second account, and only to it'
);
select extensions.is(
  pg_temp.state(1, 'phone-install-a1'), 'false/true/false',
  'the first account''s registration is switched off and has lost the address, but is kept'
);

-- ---------------------------------------------------------------------------
-- The same account after a reinstall (a new install id, the same address)
-- ---------------------------------------------------------------------------
select pg_temp.as_user(2);
select pg_temp.register('phone-install-b2', 'ab' || repeat('01', 31));
reset role;
select extensions.is(
  pg_temp.holder('ab' || repeat('01', 31)), '2/phone-install-b2/true',
  'a reinstall (same account, new install id) takes the address from its own earlier install'
);
select extensions.is(
  pg_temp.state(2, 'phone-install-b1'), 'false/true/false',
  'and the earlier install is switched off'
);

-- The first account signs back in on that phone.
select pg_temp.as_user(1);
select pg_temp.register('phone-install-a1', 'ab' || repeat('01', 31));
reset role;
select extensions.is(
  pg_temp.holder('ab' || repeat('01', 31)) || ' ' || pg_temp.state(2, 'phone-install-b2'),
  '1/phone-install-a1/true false/true/false',
  'it can move back, and the account that held it is switched off in turn'
);

-- ---------------------------------------------------------------------------
-- What does not change
-- ---------------------------------------------------------------------------
-- The same install with the same address again: nothing moves.
select pg_temp.as_user(1);
select pg_temp.register('phone-install-a1', 'ab' || repeat('01', 31));
reset role;
select extensions.is(
  (select count(*)::integer from app_private.notification_operational_audit
   where event_type = 'notification_device_taken_over'),
  3,
  'registering an address one already holds is not a takeover: three moves so far'
);

-- The same install with a new address: the old address is released, not left behind.
select pg_temp.as_user(1);
select pg_temp.register('phone-install-a1', 'ab' || repeat('02', 31));
reset role;
select extensions.is(
  coalesce(pg_temp.holder('ab' || repeat('01', 31)), 'nobody') || ' ' || pg_temp.holder('ab' || repeat('02', 31)),
  'nobody 1/phone-install-a1/true',
  'a phone that gets a new address gives the old one up'
);

-- A different phone keeps its own address.
select pg_temp.as_user(3);
select pg_temp.register('phone-install-c1', 'ab' || repeat('03', 31));
reset role;
select extensions.is(
  pg_temp.holder('ab' || repeat('03', 31)) || ' ' || pg_temp.holder('ab' || repeat('02', 31)),
  '3/phone-install-c1/true 1/phone-install-a1/true',
  'other phones are untouched'
);

-- Sign-in, validity and the rate limit still apply.
select pg_temp.as_user(1);
select extensions.throws_ok(
  $$select pg_temp.register('bad id with spaces', 'ab' || repeat('04', 31))$$,
  'PT400', 'invalid_device', 'a malformed install id is still refused'
);
reset role;
set local role anon;
select extensions.throws_ok(
  $$select api.register_my_notification_device('phone-install-x1', 'ios', 'apns', 'ab0000000000000000000000000000000000000000000000000000000000ffff', 'fr', 'Africa/Casablanca', '1.0.0')$$,
  '42501', 'permission denied for function register_my_notification_device',
  'a signed-out visitor still cannot register a phone'
);
reset role;

-- ---------------------------------------------------------------------------
-- The record of a move
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg((metadata ->> 'sameAccount') || '', ',' order by occurred_at, id)
   from app_private.notification_operational_audit where event_type = 'notification_device_taken_over'),
  'false,true,false',
  'each move is audited, saying whether it stayed within one account'
);
select extensions.ok(
  not exists (
    select 1 from app_private.notification_operational_audit
    where event_type = 'notification_device_taken_over'
      and (metadata::text like '%0101%' or actor_user_id is null or device_registration_id is null)
  ),
  'with who moved it and which registration lost it, and never the address'
);

-- ---------------------------------------------------------------------------
-- What a switched-off registration costs the old holder: nothing is sent to it
-- ---------------------------------------------------------------------------
insert into app_private.notification_events (
  id, event_type, source_domain, target_user_id, occurred_at, schema_version,
  deduplication_key, correlation_id, safe_payload
) values (
  'ea100000-0000-4000-8000-000000000001', 'goal', 'football', 'ea000000-0000-4000-8000-000000000002',
  statement_timestamp(), 1, 'takeover-test-event', 'ea100000-0000-4000-8000-000000000002', '{}'
);
insert into app.notifications (
  id, user_id, event_id, template_id, notification_type, category, language, title, body, source_domain, available_at
)
select 'ea200000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000002',
  'ea100000-0000-4000-8000-000000000001', template.id, 'goal', template.category, 'fr', 'But', 'Un but', 'football',
  statement_timestamp()
from app.notification_templates template
where template.notification_type = 'goal' and template.language = 'fr' and template.channel = 'in_app' and template.active
limit 1;
-- a push for the second account's older install (now switched off and without an address)
insert into app.notification_deliveries (id, notification_id, channel, device_registration_id, provider_key)
select 'ea300000-0000-4000-8000-000000000001', 'ea200000-0000-4000-8000-000000000001', 'push', registration.id, 'apns'
from app.device_registrations registration
where registration.user_id = 'ea000000-0000-4000-8000-000000000002' and registration.device_id = 'phone-install-b2';
select app_private.notification_push_configure('live');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  jsonb_array_length(api.service_claim_push_deliveries(50, 120)), 0,
  'the sender never claims a push for a registration that lost its address'
);
reset role;
select extensions.is(
  (select status::text || '/' || coalesce(stable_error_code, '') from app.notification_deliveries
   where id = 'ea300000-0000-4000-8000-000000000001'),
  'cancelled/push_no_longer_eligible',
  'it is cancelled as no longer eligible, so it can never reach the new holder'
);

select * from extensions.finish();
rollback;
