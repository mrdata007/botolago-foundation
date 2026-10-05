-- Push alerts, sending side: what the push dispatcher may claim.
--
-- api.service_claim_push_deliveries hands the dispatcher a batch of push
-- deliveries, after cancelling the ones that are no longer wanted or no
-- longer timely. Everything is built relative to statement_timestamp().
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select extensions.ok(
  has_function_privilege('service_role', 'api.service_claim_push_deliveries(integer,integer)', 'execute')
  and has_function_privilege('service_role', 'api.service_release_push_deliveries(uuid[],timestamptz)', 'execute'),
  'the push dispatcher (service role) can claim and release'
);
select extensions.ok(
  not has_function_privilege('anon', 'api.service_claim_push_deliveries(integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_claim_push_deliveries(integer,integer)', 'execute')
  and not has_function_privilege('anon', 'api.service_release_push_deliveries(uuid[],timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_release_push_deliveries(uuid[],timestamptz)', 'execute'),
  'browser roles can neither claim nor release push deliveries'
);
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.notification_push_configure(text,uuid[])', 'execute')
  and not has_table_privilege('service_role', 'app_private.notification_push_settings', 'select'),
  'only the owner can switch push on: not the dispatcher, not through the table'
);

-- ---------------------------------------------------------------------------
-- Six readers, each with a device
--   1  everything on             2  push off (the default)
--   3  match alerts off          4  Fantasy reminders off
--   5  device switched off       6  everything on, outside the testers
-- ---------------------------------------------------------------------------
create function pg_temp.id(p_kind integer, p_n integer) returns uuid language sql immutable as $$
  select ('e7' || lpad(p_kind::text, 2, '0') || '0000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
create function pg_temp.uid(p_n integer) returns uuid language sql immutable as $$
  select pg_temp.id(1, p_n)
$$;

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select pg_temp.uid(n), '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'push-' || n || '@example.test',
  statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'push_user_' || n, 'preferred_language', 'fr'),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 6) n;

select extensions.is(
  (select count(*)::integer from app.user_preferences
   where user_id::text like 'e701%' and not push_notifications_enabled),
  6,
  'push is off by default for every new account'
);

update app.user_preferences set push_notifications_enabled = true
where user_id in (select pg_temp.uid(n) from generate_series(1, 6) n where n <> 2);
update app.user_preferences set match_alerts = false where user_id = pg_temp.uid(3);
update app.user_preferences set fantasy_deadline_reminders = false where user_id = pg_temp.uid(4);

create function pg_temp.device(
  p_n integer, p_user integer, p_platform text, p_provider text, p_enabled boolean default true
) returns void language sql as $$
  insert into app.device_registrations (
    id, user_id, device_id, platform, push_provider, locale, enabled, invalidated_at
  ) values (
    pg_temp.id(2, p_n), pg_temp.uid(p_user), 'device-' || p_n || '-test',
    p_platform::app.notification_device_platform, p_provider::app.notification_push_provider,
    'fr', p_enabled, case when p_enabled then null else statement_timestamp() end
  );
  insert into app_private.push_destinations (device_registration_id, destination_digest, destination_value)
  values (pg_temp.id(2, p_n), extensions.digest('token-' || p_n, 'sha256'),
    'push-token-' || lpad(p_n::text, 6, '0') || '-0000000000')
$$;
select pg_temp.device(1, 1, 'android', 'fcm');
select pg_temp.device(2, 1, 'ios', 'apns');
select pg_temp.device(3, 2, 'android', 'fcm');
select pg_temp.device(4, 3, 'android', 'fcm');
select pg_temp.device(5, 4, 'ios', 'apns');
select pg_temp.device(6, 5, 'android', 'fcm', false);
select pg_temp.device(7, 6, 'android', 'fcm');

create function pg_temp.notify(
  p_n integer, p_user integer, p_type text,
  p_available timestamptz default statement_timestamp(),
  p_payload jsonb default '{}'::jsonb
) returns void language plpgsql as $$
declare
  template record;
  domain app.notification_source_domain := case
    when p_type = 'password_changed' then 'identity'
    when p_type like 'deadline%' then 'fantasy'
    else 'football' end;
begin
  select id, category into template from app.notification_templates
  where notification_type = p_type::app.notification_type and language = 'fr'
    and channel = 'in_app' and active
  limit 1;
  insert into app_private.notification_events (
    id, event_type, source_domain, target_user_id, occurred_at, schema_version,
    deduplication_key, correlation_id, safe_payload
  ) values (
    pg_temp.id(3, p_n), p_type::app.notification_type, domain, pg_temp.uid(p_user),
    least(p_available, statement_timestamp()), 1, 'push-claim-test-' || p_n,
    pg_temp.id(4, p_n), p_payload
  );
  insert into app.notifications (
    id, user_id, event_id, template_id, notification_type, category, language,
    title, body, source_domain, available_at
  ) values (
    pg_temp.id(5, p_n), pg_temp.uid(p_user), pg_temp.id(3, p_n), template.id,
    p_type::app.notification_type, template.category, 'fr',
    'Titre ' || p_n, 'Texte ' || p_n, domain, p_available
  );
end $$;

create function pg_temp.push(
  p_delivery integer, p_notification integer, p_device integer, p_provider text
) returns void language sql as $$
  insert into app.notification_deliveries (id, notification_id, channel, device_registration_id, provider_key)
  values (pg_temp.id(6, p_delivery), pg_temp.id(5, p_notification), 'push',
    pg_temp.id(2, p_device), p_provider)
$$;

create function pg_temp.status(p_delivery integer) returns text language sql stable as $$
  select status::text from app.notification_deliveries where id = pg_temp.id(6, p_delivery)
$$;
create function pg_temp.code(p_delivery integer) returns text language sql stable as $$
  select stable_error_code from app.notification_deliveries where id = pg_temp.id(6, p_delivery)
$$;

-- N1  reader 1, a goal: to both of their phones (deliveries 1 and 2)
select pg_temp.notify(1, 1, 'goal');
select pg_temp.push(1, 1, 1, 'fcm');
select pg_temp.push(2, 1, 2, 'apns');
-- N2  reader 1, the 24-hour deadline, five hours away (3)
select pg_temp.notify(2, 1, 'deadline_24h', statement_timestamp(),
  jsonb_build_object('deadlineAt', statement_timestamp() + interval '5 hours'));
select pg_temp.push(3, 2, 1, 'fcm');
-- N3  reader 2 turned push off (4)
select pg_temp.notify(3, 2, 'goal');
select pg_temp.push(4, 3, 3, 'fcm');
-- N4/N5  reader 3 turned match alerts off: the goal (5) goes, the deadline (6) stays wanted
select pg_temp.notify(4, 3, 'goal');
select pg_temp.push(5, 4, 4, 'fcm');
select pg_temp.notify(5, 3, 'deadline_24h', statement_timestamp(),
  jsonb_build_object('deadlineAt', statement_timestamp() + interval '5 hours'));
select pg_temp.push(6, 5, 4, 'fcm');
-- N6/N7  reader 4 turned Fantasy reminders off: the deadline (7) goes, the goal (8) stays wanted
select pg_temp.notify(6, 4, 'deadline_24h', statement_timestamp(),
  jsonb_build_object('deadlineAt', statement_timestamp() + interval '5 hours'));
select pg_temp.push(7, 6, 5, 'apns');
select pg_temp.notify(7, 4, 'goal');
select pg_temp.push(8, 7, 5, 'apns');
-- N8  reader 5's device was switched off (9)
select pg_temp.notify(8, 5, 'goal');
select pg_temp.push(9, 8, 6, 'fcm');
-- N9  a type that is never pushed, to a reader who wants push (10)
select pg_temp.notify(9, 1, 'password_changed');
select pg_temp.push(10, 9, 1, 'fcm');
-- N10  a goal eleven minutes old: its moment has passed (11)
select pg_temp.notify(10, 1, 'goal', statement_timestamp() - interval '11 minutes');
select pg_temp.push(11, 10, 1, 'fcm');
-- N11  a goal held back until later, as quiet hours do (12)
select pg_temp.notify(11, 1, 'goal', statement_timestamp() + interval '1 hour');
select pg_temp.push(12, 11, 1, 'fcm');
-- N12/N13  the kick-off alert: kick-off a minute ago (13), in half an hour (14)
select pg_temp.notify(12, 1, 'match_starting', statement_timestamp(),
  jsonb_build_object('fixture', jsonb_build_object('kickoffAt', statement_timestamp() - interval '1 minute')));
select pg_temp.push(13, 12, 1, 'fcm');
select pg_temp.notify(13, 1, 'match_starting', statement_timestamp(),
  jsonb_build_object('fixture', jsonb_build_object('kickoffAt', statement_timestamp() + interval '30 minutes')));
select pg_temp.push(14, 13, 1, 'fcm');
-- N14  reader 6, who is outside the testers (15)
select pg_temp.notify(14, 6, 'goal');
select pg_temp.push(15, 14, 7, 'fcm');
-- N15  the dormant 'fixture' provider, and an email for N1: neither is the push dispatcher's
select pg_temp.notify(15, 1, 'goal');
select pg_temp.push(16, 15, 1, 'fixture');
insert into app.notification_deliveries (id, notification_id, channel, provider_key)
values (pg_temp.id(6, 17), pg_temp.id(5, 1), 'email', 'resend');

-- ---------------------------------------------------------------------------
-- Off: nothing is claimed or cancelled
-- ---------------------------------------------------------------------------
select extensions.is(
  (select mode from app_private.notification_push_settings), 'off',
  'push ships switched off'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_claim_push_deliveries(50, 120), '[]'::jsonb, 'switched off, nothing is claimed');
reset role;
select extensions.is(
  (select count(*)::integer from app.notification_deliveries
   where id::text like 'e706%' and status = 'pending' and attempt_count = 0),
  17,
  'and nothing is cancelled or touched either: all seventeen deliveries are as they were'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.service_claim_push_deliveries(50, 120)$$, 'PT403', 'notification_access_denied',
  'the service claim is checked even with access to the function'
);
select extensions.throws_ok(
  $$select api.service_release_push_deliveries(array[]::uuid[], statement_timestamp())$$,
  'PT403', 'notification_access_denied', 'and so is the release'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok(
  $$select api.service_claim_push_deliveries(0, 120)$$, 'PT400', 'invalid_notification_delivery',
  'a batch of zero is refused'
);
select extensions.throws_ok(
  $$select api.service_claim_push_deliveries(50, 10)$$, 'PT400', 'invalid_notification_delivery',
  'a lease under thirty seconds is refused'
);

-- ---------------------------------------------------------------------------
-- Owner switch
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  $$select app_private.notification_push_configure('sometimes')$$, '22023', 'invalid_push_mode',
  'an unknown mode is refused'
);
select extensions.throws_ok(
  $$select app_private.notification_push_configure('testers')$$, '22023', 'push_testers_need_users',
  'testers mode needs testers'
);

-- ---------------------------------------------------------------------------
-- Testers: readers 1, 3 and 4 only
-- ---------------------------------------------------------------------------
select app_private.notification_push_configure(
  'testers', array[pg_temp.uid(1), pg_temp.uid(3), pg_temp.uid(4)]
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table first_claim on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_push_deliveries(50, 120));
reset role;

select extensions.is(
  (select jsonb_agg(delivery ->> 'id' order by delivery ->> 'id') from first_claim),
  (select jsonb_agg(pg_temp.id(6, n)::text order by pg_temp.id(6, n)::text)
   from unnest(array[1, 2, 3, 6, 8, 14]) n),
  'in testers mode, only the testers'' wanted, timely pushes are claimed'
);
select extensions.is(
  (select string_agg(pg_temp.status(n), ',' order by n) from unnest(array[1, 2, 3, 6, 8, 14]) n),
  'claimed,claimed,claimed,claimed,claimed,claimed',
  'and they are marked claimed'
);
select extensions.is(
  (select string_agg(pg_temp.code(n), ',' order by n) from unnest(array[4, 5, 7, 9, 10]) n),
  'push_no_longer_eligible,push_no_longer_eligible,push_no_longer_eligible,push_no_longer_eligible,push_no_longer_eligible',
  'push off, match alerts off, Fantasy reminders off, a switched-off device and a type never pushed are cancelled'
);
select extensions.is(
  (select string_agg(pg_temp.status(n), ',' order by n) from unnest(array[4, 5, 7, 9, 10, 11, 13]) n),
  'cancelled,cancelled,cancelled,cancelled,cancelled,cancelled,cancelled',
  'cancelled, not left waiting'
);
select extensions.is(
  (select string_agg(pg_temp.code(n), ',' order by n) from unnest(array[11, 13]) n),
  'push_expired,push_expired',
  'a goal eleven minutes old and a kick-off alert after kick-off are cancelled as expired'
);
select extensions.is(
  (select string_agg(pg_temp.status(n), ',' order by n) from unnest(array[12, 15, 16, 17]) n),
  'pending,pending,pending,pending',
  'a push held for later, one for a reader outside the testers, the dormant provider and the email are left alone'
);
select extensions.is(
  (select attempt_count from app.notification_deliveries where id = pg_temp.id(6, 15)),
  0,
  'and nothing was attempted for them'
);

select extensions.is(
  (select delivery - 'id' - 'notificationId' - 'deviceRegistrationId' - 'expiresInSeconds'
   from first_claim where delivery ->> 'id' = pg_temp.id(6, 1)::text),
  jsonb_build_object(
    'attemptNumber', 1, 'providerKey', 'fcm', 'platform', 'android', 'type', 'goal',
    'language', 'fr', 'title', 'Titre 1', 'body', 'Texte 1',
    'deepLink', jsonb_build_object('target', 'none', 'entityId', null),
    'destination', 'push-token-000001-0000000000'
  ),
  'a claimed push carries what the sender needs, including the device token'
);
select extensions.is(
  (select delivery ->> 'providerKey' || '/' || (delivery ->> 'platform')
   from first_claim where delivery ->> 'id' = pg_temp.id(6, 2)::text),
  'apns/ios',
  'the second phone of the same reader is its own delivery, for Apple'
);
select extensions.ok(
  (select bool_and((delivery ->> 'expiresInSeconds')::integer between 1 and 600
     and delivery ->> 'notificationId' is not null and delivery ->> 'deviceRegistrationId' is not null)
   from first_claim where delivery ->> 'id' = pg_temp.id(6, 1)::text),
  'a goal is told to expire within ten minutes, so a phone that is offline never shows it late'
);
select extensions.ok(
  (select (delivery ->> 'expiresInSeconds')::integer between 1 and 1200
   from first_claim where delivery ->> 'id' = pg_temp.id(6, 14)::text),
  'and the kick-off alert within twenty'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_claim_push_deliveries(50, 120), '[]'::jsonb,
  'claimed pushes are not handed out again while their lease holds'
);
reset role;

-- ---------------------------------------------------------------------------
-- Live: everyone, and a lease that ran out
-- ---------------------------------------------------------------------------
select app_private.notification_push_configure('live');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (select jsonb_agg(value ->> 'id') from jsonb_array_elements(api.service_claim_push_deliveries(50, 120))),
  jsonb_build_array(pg_temp.id(6, 15)::text),
  'live: the reader who was outside the testers is now claimed, and only them'
);
reset role;

update app.notification_deliveries
set claimed_at = statement_timestamp() - interval '300 seconds',
    claim_expires_at = statement_timestamp() - interval '1 second'
where id = pg_temp.id(6, 1);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (select jsonb_agg(value - 'id' - 'notificationId' - 'deviceRegistrationId' - 'expiresInSeconds' - 'deepLink'
     - 'body' - 'title' - 'language' - 'destination' - 'type' - 'platform')
   from jsonb_array_elements(api.service_claim_push_deliveries(50, 120))
   where value ->> 'id' = pg_temp.id(6, 1)::text),
  jsonb_build_array(jsonb_build_object('attemptNumber', 2, 'providerKey', 'fcm')),
  'a push whose lease ran out unrecorded is claimed again, as its second attempt'
);
reset role;

-- ---------------------------------------------------------------------------
-- Order: retries first, then the most time-critical
-- ---------------------------------------------------------------------------
select pg_temp.notify(16, 1, 'deadline_24h', statement_timestamp() - interval '1 minute',
  jsonb_build_object('deadlineAt', statement_timestamp() + interval '5 hours'));
select pg_temp.push(18, 16, 1, 'fcm');
select pg_temp.notify(17, 1, 'goal', statement_timestamp());
select pg_temp.push(19, 17, 1, 'fcm');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (select value ->> 'id' from jsonb_array_elements(api.service_claim_push_deliveries(1, 120))),
  pg_temp.id(6, 19)::text,
  'with room for one, a goal goes before an older deadline reminder'
);
select extensions.is(
  (select value ->> 'id' from jsonb_array_elements(api.service_claim_push_deliveries(1, 120))),
  pg_temp.id(6, 18)::text,
  'and the reminder is next'
);
reset role;

-- ---------------------------------------------------------------------------
-- Recording and releasing
-- ---------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_record_notification_delivery_attempt(
    pg_temp.id(6, 19), 'sent', false, 'projects/test/messages/1', null, null, 120, null, 5, null
  )::text,
  'sent',
  'the existing recorder settles a claimed push as sent'
);
select extensions.is(
  api.service_release_push_deliveries(
    array[pg_temp.id(6, 18), pg_temp.id(6, 17), pg_temp.id(6, 16)], statement_timestamp()
  ),
  1,
  'releasing hands back only claimed pushes: not an email, not the dormant provider'
);
reset role;
select extensions.is(
  (select status::text || '/' || attempt_count from app.notification_deliveries where id = pg_temp.id(6, 18)),
  'retry_scheduled/0',
  'a released push waits for its retry without having spent an attempt'
);
select extensions.is(
  (select status::text from app.notification_deliveries where id = pg_temp.id(6, 16)),
  'pending',
  'and the dormant provider''s delivery is untouched'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok(
  $$select api.service_release_push_deliveries(null, statement_timestamp())$$,
  'PT400', 'invalid_notification_delivery', 'a release with nothing named is refused'
);
select extensions.throws_ok(
  $$select api.service_release_push_deliveries(array[]::uuid[], statement_timestamp() + interval '3 days')$$,
  'PT400', 'invalid_notification_delivery', 'and so is one that holds pushes back for days'
);

-- ---------------------------------------------------------------------------
-- A rejected device token: what waits for that device is cancelled
-- ---------------------------------------------------------------------------
select extensions.is(
  api.service_invalidate_notification_device(pg_temp.id(2, 1), 'push_token_rejected'),
  true,
  'the existing function turns a rejected device off'
);
select extensions.is(
  (select count(*)::integer from jsonb_array_elements(api.service_claim_push_deliveries(50, 120))
   where value ->> 'deviceRegistrationId' = pg_temp.id(2, 1)::text),
  0,
  'nothing more is claimed for it'
);
reset role;
select extensions.is(
  (select status::text || '/' || stable_error_code from app.notification_deliveries where id = pg_temp.id(6, 12)),
  'cancelled/push_no_longer_eligible',
  'and what was waiting for it, even a push held for later, is cancelled'
);

select * from extensions.finish();
rollback;
