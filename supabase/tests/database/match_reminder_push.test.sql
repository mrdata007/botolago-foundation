-- Phone alerts (web push) for the "match starting" moment.
--
-- Calls the fan-out functions directly with an explicit clock so no scheduled
-- job, mode switch or outside service is involved.
begin;
select extensions.no_plan();

insert into app.countries(id, iso_alpha2, iso_alpha3)
values ('f0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions(id, slug, name, short_name, competition_type, country_id)
values ('f0100000-0000-4000-8000-000000000001', 'push-test-league', 'Push Test League',
  'PTL', 'league', 'f0000000-0000-4000-8000-000000000001');
insert into app.seasons(id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f0200000-0000-4000-8000-000000000001', 'f0100000-0000-4000-8000-000000000001',
  'Push season', current_date - 60, current_date + 200, 'active', true);
insert into app.rounds(id, season_id, round_number, name)
values ('f0300000-0000-4000-8000-000000000001', 'f0200000-0000-4000-8000-000000000001', 1, 'Round 1');
insert into app.teams(id, slug, name, short_name, code, country_id)
select ('f0400000-0000-4000-8000-00000000000' || n)::uuid, 'push-club-' || n,
  'Push Club ' || n, 'PC' || n, 'PC' || n, 'f0000000-0000-4000-8000-000000000001'
from generate_series(1, 3) n;
insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, provider_updated_at, source_sequence)
values ('f0500000-0000-4000-8000-000000000001', 'f0100000-0000-4000-8000-000000000001',
  'f0200000-0000-4000-8000-000000000001', 'f0300000-0000-4000-8000-000000000001',
  'f0400000-0000-4000-8000-000000000001', 'f0400000-0000-4000-8000-000000000002',
  statement_timestamp() + interval '1 hour', 'not_started',
  statement_timestamp() - interval '1 day', 1);

-- a: e-mail on, phone on, device      b: e-mail off, phone on, device
-- c: phone off, device                d: phone on, no device
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select ('f0600000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'push-' || n || '@example.test',
  statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'push_user_' || n, 'preferred_language', 'fr'),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 4) n;

update app.user_preferences set favorite_team_id = 'f0400000-0000-4000-8000-000000000001'
where user_id::text like 'f0600000-%';
update app.user_preferences set push_notifications_enabled = true
where user_id in ('f0600000-0000-4000-8000-000000000001', 'f0600000-0000-4000-8000-000000000002',
  'f0600000-0000-4000-8000-000000000004');
update app.user_preferences set email_notifications_enabled = false
where user_id = 'f0600000-0000-4000-8000-000000000002';

insert into app.device_registrations(user_id, device_id, platform, push_provider, locale)
select ('f0600000-0000-4000-8000-00000000000' || n)::uuid, 'push-test-device-' || n,
  'web', 'web_push', 'fr'
from generate_series(1, 3) n;

insert into app_private.notification_events(
  id, event_type, source_domain, source_entity_id, occurred_at, schema_version,
  deduplication_key, correlation_id, safe_payload
) values (
  'f0700000-0000-4000-8000-000000000001', 'match_starting', 'football',
  'f0500000-0000-4000-8000-000000000001', statement_timestamp(), 1,
  'push-test:match_starting:1', gen_random_uuid(),
  jsonb_build_object('minutes', '60', 'fixture', jsonb_build_object(
    'kickoffAt', statement_timestamp() + interval '1 hour',
    'home', jsonb_build_object('name', jsonb_build_object('fr', 'Club Un', 'ar', 'نادي 1')),
    'away', jsonb_build_object('name', jsonb_build_object('fr', 'Club Deux', 'ar', 'نادي 2'))))
);

create function pg_temp.push_fanout() returns jsonb language sql as $$
  select app_private.notification_push_fanout(
    statement_timestamp(), 'live', null, statement_timestamp() - interval '1 day')
$$;
create function pg_temp.push_users() returns text[] language sql as $$
  select coalesce(array_agg(notification.user_id::text order by notification.user_id), '{}')
  from app.notification_deliveries delivery
  join app.notifications notification on notification.id = delivery.notification_id
  where delivery.channel = 'push' and notification.event_id = 'f0700000-0000-4000-8000-000000000001'
$$;

select extensions.is(
  (select array_agg(user_id::text order by user_id)
   from app_private.notification_push_match_audience(
     'f0700000-0000-4000-8000-000000000001', 'f0400000-0000-4000-8000-000000000001',
     'f0400000-0000-4000-8000-000000000002', 'f0500000-0000-4000-8000-000000000001',
     statement_timestamp(), 'live', null)),
  array['f0600000-0000-4000-8000-000000000001', 'f0600000-0000-4000-8000-000000000002'],
  'only fans with phone alerts on and a phone registered are in the audience'
);

-- First pass: the e-mail user waits for the e-mail job's inbox message; the
-- phone-only user gets one made here, plus the alert.
select pg_temp.push_fanout();
select extensions.is(
  pg_temp.push_users(),
  array['f0600000-0000-4000-8000-000000000002'],
  'a phone-only user is queued at once; the e-mail user waits for the inbox message'
);
select extensions.is(
  (select count(*)::integer from app.notifications
   where event_id = 'f0700000-0000-4000-8000-000000000001'),
  1,
  'only the phone-only user has an inbox message so far'
);

-- The e-mail job makes the e-mail user's message; the next pass attaches the alert to it.
select app_private.notification_email_fanout(
  statement_timestamp(), 'live', null, statement_timestamp() - interval '1 day', 100);
select pg_temp.push_fanout();
select extensions.is(
  pg_temp.push_users(),
  array['f0600000-0000-4000-8000-000000000001', 'f0600000-0000-4000-8000-000000000002'],
  'the e-mail user then gets the alert too'
);
select extensions.is(
  (select count(*)::integer from app.notifications
   where event_id = 'f0700000-0000-4000-8000-000000000001'),
  2,
  'nobody has two inbox messages for the same match'
);
select pg_temp.push_fanout();
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   where delivery.channel = 'push' and notification.event_id = 'f0700000-0000-4000-8000-000000000001'),
  2,
  'running it again queues nothing new'
);

-- Claiming: service role only, phone alerts only.
set local role anon;
select extensions.throws_ok(
  $$select api.service_claim_push_deliveries(10, 120)$$,
  '42501', null,
  'a browser cannot claim phone alerts'
);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table push_claim on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_push_deliveries(50, 120));
reset role;
select extensions.is(
  (select count(*)::integer from push_claim where delivery ->> 'channel' = 'push'
     and delivery ->> 'providerKey' = 'web_push'),
  2,
  'the dispatcher claims both phone alerts, and nothing else'
);

-- After kick-off nothing more is queued.
update app_private.notification_events set safe_payload = jsonb_set(
  safe_payload, '{fixture,kickoffAt}', to_jsonb(statement_timestamp() - interval '1 minute'))
where id = 'f0700000-0000-4000-8000-000000000001';
select extensions.is(
  (pg_temp.push_fanout() ->> 'queued')::integer, 0,
  'no phone alert is queued once the match has started'
);

select * from extensions.finish();
rollback;
