-- Push alerts, sending side step 2: queuing the alerts and waking the sender.
--
-- app_private.notification_push_fanout turns a planned moment (the kick-off
-- reminder, the 24-hour Fantasy deadline) into one push delivery per device of
-- every reader who wants it; app_private.notification_push_tick plans, fans
-- out and wakes the Edge Function. Everything is built relative to the clock.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Privileges and the job
-- ---------------------------------------------------------------------------
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.notification_push_tick()', 'execute')
  and not has_function_privilege('authenticated', 'app_private.notification_push_tick()', 'execute')
  and not has_function_privilege('anon', 'app_private.notification_push_tick()', 'execute')
  and not has_function_privilege('service_role',
    'app_private.notification_push_fanout(timestamptz,text,uuid[],timestamptz,text,timestamptz,integer)', 'execute')
  and not has_function_privilege('service_role', 'app_private.notification_push_set_functions_url(text)', 'execute'),
  'only the database owner can run the tick, the fan-out or set the function address'
);
select extensions.is(
  (select count(*)::integer from cron.job where jobname = 'notification-push-tick'),
  1,
  'the one-minute job is scheduled'
);

-- ---------------------------------------------------------------------------
-- Catalog: a current season, four clubs, three matches
-- ---------------------------------------------------------------------------
insert into app.countries(id, iso_alpha2, iso_alpha3)
values ('e8000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions(id, slug, name, short_name, competition_type, country_id)
values ('e8100000-0000-4000-8000-000000000001', 'push-fanout-league', 'Push Fanout League',
  'PFL', 'league', 'e8000000-0000-4000-8000-000000000001');
insert into app.seasons(id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e8200000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'Push season', current_date - 60, current_date + 200, 'active', true);
insert into app.rounds(id, season_id, round_number, name)
values ('e8300000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001', 1, 'Round 1');
insert into app.teams(id, slug, name, short_name, code, country_id)
select ('e8400000-0000-4000-8000-00000000000' || n)::uuid, 'push-club-' || n,
  'Push Club ' || n, 'PC' || n, 'PC' || n, 'e8000000-0000-4000-8000-000000000001'
from generate_series(1, 4) n;

create function pg_temp.fixture(p_n integer, p_home integer, p_away integer, p_kickoff timestamptz)
returns void language sql as $$
  insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id,
    kickoff_at, status, provider_updated_at, source_sequence)
  values (('e8500000-0000-4000-8000-00000000000' || p_n)::uuid,
    'e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001',
    'e8300000-0000-4000-8000-000000000001',
    ('e8400000-0000-4000-8000-00000000000' || p_home)::uuid,
    ('e8400000-0000-4000-8000-00000000000' || p_away)::uuid,
    p_kickoff, 'not_started', statement_timestamp() - interval '1 day', 1)
$$;
-- 1: club 1 v club 2 in half an hour.  2: club 1 v club 3, kicked off five
-- minutes ago.  3: club 1 v club 3, three hours away for now (moved to forty
-- minutes when the email scenario starts, so the planner does not take it early).
select pg_temp.fixture(1, 1, 2, statement_timestamp() + interval '30 minutes');
select pg_temp.fixture(2, 1, 3, statement_timestamp() - interval '5 minutes');
select pg_temp.fixture(3, 1, 3, statement_timestamp() + interval '3 hours');

-- ---------------------------------------------------------------------------
-- Readers (each with the devices noted)
--   1  fan of club 1, two phones (Android, iPhone)    2  fan, push OFF
--   3  fan, match alerts off, one phone               4  follows club 2, one phone
--   5  no club, one phone                             6  fan, no phone
--   7  fan, phone switched off                        8  fan, quiet hours now
--   9  fan, one phone (outside the testers)
-- ---------------------------------------------------------------------------
create function pg_temp.id(p_kind integer, p_n integer) returns uuid language sql immutable as $$
  select ('e8' || lpad(p_kind::text, 2, '0') || '0000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
create function pg_temp.uid(p_n integer) returns uuid language sql immutable as $$
  select pg_temp.id(10, p_n)
$$;

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select pg_temp.uid(n), '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'fanout-' || n || '@example.test',
  statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'fanout_user_' || n, 'preferred_language', 'fr'),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 10) n;

update app.user_preferences set push_notifications_enabled = true
where user_id in (select pg_temp.uid(n) from generate_series(1, 10) n where n <> 2);
update app.user_preferences set favorite_team_id = 'e8400000-0000-4000-8000-000000000001'
where user_id in (select pg_temp.uid(n) from generate_series(1, 10) n where n in (1, 2, 3, 6, 7, 8, 9, 10));
update app.user_preferences set match_alerts = false where user_id = pg_temp.uid(3);
insert into app.followed_teams(user_id, team_id)
values (pg_temp.uid(4), 'e8400000-0000-4000-8000-000000000002');
update app.user_preferences set
  quiet_hours_enabled = true,
  quiet_hours_start = ((statement_timestamp() at time zone 'Africa/Casablanca') - interval '1 hour')::time,
  quiet_hours_end = ((statement_timestamp() at time zone 'Africa/Casablanca') + interval '2 hours')::time
where user_id = pg_temp.uid(8);

create function pg_temp.device(
  p_n integer, p_user integer, p_platform text, p_provider text, p_enabled boolean default true
) returns void language sql as $$
  insert into app.device_registrations (
    id, user_id, device_id, platform, push_provider, locale, enabled, invalidated_at
  ) values (
    pg_temp.id(2, p_n), pg_temp.uid(p_user), 'device-' || p_n || '-fanout',
    p_platform::app.notification_device_platform, p_provider::app.notification_push_provider,
    'fr', p_enabled, case when p_enabled then null else statement_timestamp() end
  );
  insert into app_private.push_destinations (device_registration_id, destination_digest, destination_value)
  values (pg_temp.id(2, p_n), extensions.digest('fanout-token-' || p_n, 'sha256'),
    'fanout-token-' || lpad(p_n::text, 6, '0') || '-0000000000')
$$;
select pg_temp.device(1, 1, 'android', 'fcm');
select pg_temp.device(2, 1, 'ios', 'apns');
select pg_temp.device(3, 3, 'android', 'fcm');
select pg_temp.device(4, 4, 'android', 'fcm');
select pg_temp.device(5, 5, 'ios', 'apns');
select pg_temp.device(7, 7, 'android', 'fcm', false);
select pg_temp.device(8, 8, 'android', 'fcm');
select pg_temp.device(9, 9, 'android', 'fcm');
select pg_temp.device(10, 10, 'android', 'fcm');
-- reader 2's phone exists, but their push is off
select pg_temp.device(11, 2, 'android', 'fcm');

create function pg_temp.rejects(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;

create function pg_temp.pushes(p_event_key text, p_user integer) returns integer
language sql stable as $$
  select count(*)::integer
  from app.notification_deliveries delivery
  join app.notifications notification on notification.id = delivery.notification_id
  join app_private.notification_events event on event.id = notification.event_id
  where event.deduplication_key = p_event_key and notification.user_id = pg_temp.uid(p_user)
    and delivery.channel = 'push'
$$;
create function pg_temp.notifications(p_event_key text, p_user integer) returns integer
language sql stable as $$
  select count(*)::integer
  from app.notifications notification
  join app_private.notification_events event on event.id = notification.event_id
  where event.deduplication_key = p_event_key and notification.user_id = pg_temp.uid(p_user)
$$;
create function pg_temp.queued(p_event_key text) returns integer
language sql stable as $$
  select count(*)::integer
  from app.notification_deliveries delivery
  join app.notifications notification on notification.id = delivery.notification_id
  join app_private.notification_events event on event.id = notification.event_id
  where event.deduplication_key = p_event_key and delivery.channel = 'push'
$$;

-- ---------------------------------------------------------------------------
-- Off: the tick returns at once and does nothing
-- ---------------------------------------------------------------------------
select extensions.is(app_private.notification_push_tick() ->> 'outcome', 'off', 'switched off, the tick does nothing');
select extensions.is(
  (select count(*)::integer from app_private.notification_events where deduplication_key like 'email:match_starting:%'),
  0,
  'and plans nothing'
);

-- ---------------------------------------------------------------------------
-- Testers: reader 1 only. Email is off, so push plans the moment itself.
-- ---------------------------------------------------------------------------
select app_private.notification_push_configure('testers', array[pg_temp.uid(1)]);
create temporary table tick_one on commit drop as
select app_private.notification_push_tick() as result;

select extensions.is(
  (select count(*)::integer from app_private.notification_events
   where deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000001'),
  1,
  'with email off, the push tick plans the kick-off reminder itself'
);
select extensions.is(
  (select count(*)::integer from app_private.notification_events
   where deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000002'),
  0,
  'and not for a match that has already kicked off'
);
select extensions.is(
  pg_temp.pushes('email:match_starting:e8500000-0000-4000-8000-000000000001', 1), 2,
  'the tester gets one push per phone'
);
select extensions.is(
  pg_temp.queued('email:match_starting:e8500000-0000-4000-8000-000000000001'), 2,
  'and nobody else does while only testers are on'
);
select extensions.is(
  (select string_agg(delivery.provider_key || '/' || delivery.status::text, ',' order by delivery.provider_key)
   from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000001'
     and delivery.channel = 'push'),
  'apns/pending,fcm/pending',
  'each is for its phone''s provider, waiting to be sent'
);
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000001'
     and notification.user_id = pg_temp.uid(1) and delivery.channel = 'in_app' and delivery.status = 'delivered'),
  1,
  'the reader''s inbox gets the notification once'
);
select extensions.is(
  (select jsonb_build_array(notification.deep_link_target::text, notification.deep_link_entity_id)
   from app.notifications notification
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000001'
     and notification.user_id = pg_temp.uid(1)),
  jsonb_build_array('match_detail', 'e8500000-0000-4000-8000-000000000001'),
  'and it opens the match'
);
select extensions.ok(
  (select char_length(notification.title) > 0 and char_length(notification.body) > 0
   from app.notifications notification
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000001'
     and notification.user_id = pg_temp.uid(1)),
  'with its text rendered from the template'
);

-- No address to wake the function with yet, then one.
select extensions.is(
  (select result ->> 'dispatch' from tick_one), 'not_configured',
  'something is waiting but the tick has no address to wake the sender at'
);
select app_private.notification_push_set_functions_url('https://abcdefghijkl.supabase.co/functions/v1');
select extensions.is(
  app_private.notification_push_tick() ->> 'dispatch', 'invoked',
  'with an address it wakes the sender'
);
select extensions.is(
  (select last_outcome from app_private.notification_push_settings), 'succeeded',
  'and the settings remember how the last tick went'
);
select extensions.is(
  pg_temp.rejects($$select app_private.notification_push_set_functions_url('http://evil.example/anything')$$),
  true,
  'an address that is not a Supabase functions address is refused'
);

-- ---------------------------------------------------------------------------
-- Live: everyone who wants it
-- ---------------------------------------------------------------------------
select app_private.notification_push_configure('live');
select app_private.notification_push_tick();
select extensions.is(
  (select string_agg(n::text || ':' || pg_temp.pushes('email:match_starting:e8500000-0000-4000-8000-000000000001', n), ' ' order by n)
   from generate_series(1, 10) n),
  '1:2 2:0 3:0 4:1 5:0 6:0 7:0 8:1 9:1 10:1',
  'a fan with a phone is queued, per phone; push off, match alerts off, no club, no phone and a switched-off phone are not'
);
select extensions.is(
  (select count(*)::integer from app.notifications notification
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000001'),
  5,
  'and each reader has exactly one notification for the moment'
);
select extensions.is(
  pg_temp.pushes('email:match_starting:e8500000-0000-4000-8000-000000000001', 1), 2,
  'the tester was not queued twice when everyone was switched on'
);
select extensions.ok(
  (select delivery.next_retry_at between statement_timestamp() + interval '110 minutes'
      and statement_timestamp() + interval '130 minutes'
   from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000001'
     and notification.user_id = pg_temp.uid(8) and delivery.channel = 'push'),
  'a reader in quiet hours is queued for when they end, about two hours on'
);
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000001'
     and delivery.channel = 'push' and delivery.next_retry_at is null),
  5,
  'everyone else is queued to go at once'
);

-- Running it again finds nobody; a phone registered later is found, alone.
select app_private.notification_push_tick();
select extensions.is(
  pg_temp.queued('email:match_starting:e8500000-0000-4000-8000-000000000001'), 6,
  'running the tick again queues nothing new'
);
select pg_temp.device(12, 1, 'ios', 'apns');
select app_private.notification_push_tick();
select extensions.is(
  pg_temp.pushes('email:match_starting:e8500000-0000-4000-8000-000000000001', 1)::text || ':'
    || pg_temp.notifications('email:match_starting:e8500000-0000-4000-8000-000000000001', 1)::text,
  '3:1',
  'a phone registered after the moment was planned gets its push, on the same notification'
);

-- ---------------------------------------------------------------------------
-- The 24-hour Fantasy deadline
-- ---------------------------------------------------------------------------
update app.user_preferences set fantasy_deadline_reminders = false where user_id = pg_temp.uid(9);
select app_private.notification_email_enqueue(
  'deadline_24h', 'fantasy', 'e8600000-0000-4000-8000-000000000001',
  'email:deadline_24h:e8600000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'gameweek', jsonb_build_object('id', 'e8600000-0000-4000-8000-000000000001', 'sequence', 3, 'name', '3'),
    'deadlineAt', statement_timestamp() + interval '5 hours'),
  statement_timestamp()
);
select app_private.notification_push_tick();
select extensions.is(
  (select string_agg(n::text || ':' || pg_temp.pushes('email:deadline_24h:e8600000-0000-4000-8000-000000000001', n), ' ' order by n)
   from generate_series(1, 10) n),
  '1:3 2:0 3:1 4:1 5:1 6:0 7:0 8:1 9:0 10:1',
  'the deadline reminder follows Fantasy reminders, not match alerts or clubs: reader 3 and reader 5 get it, reader 9 (reminders off) does not'
);
select extensions.is(
  (select notification.deep_link_target::text from app.notifications notification
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:deadline_24h:e8600000-0000-4000-8000-000000000001'
     and notification.user_id = pg_temp.uid(5)),
  'fantasy_transfers',
  'and it opens the transfers page'
);

-- A moment whose time has passed is not pushed late.
select app_private.notification_email_enqueue(
  'match_starting', 'football', 'e8500000-0000-4000-8000-000000000002',
  'email:match_starting:e8500000-0000-4000-8000-000000000002',
  jsonb_build_object('fixture', app_private.notification_email_fixture_json('e8500000-0000-4000-8000-000000000002'), 'minutes', 5),
  statement_timestamp()
);
select app_private.notification_email_enqueue(
  'deadline_24h', 'fantasy', 'e8600000-0000-4000-8000-000000000002',
  'email:deadline_24h:e8600000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'gameweek', jsonb_build_object('id', 'e8600000-0000-4000-8000-000000000002', 'sequence', 4, 'name', '4'),
    'deadlineAt', statement_timestamp() + interval '10 minutes'),
  statement_timestamp()
);
select app_private.notification_push_tick();
select extensions.is(
  pg_temp.queued('email:match_starting:e8500000-0000-4000-8000-000000000002')
    + pg_temp.queued('email:deadline_24h:e8600000-0000-4000-8000-000000000002'),
  0,
  'a kick-off alert after kick-off, and a deadline reminder minutes before the deadline, are not queued'
);

-- ---------------------------------------------------------------------------
-- What the sender will claim: the ones due now, not the one held for quiet hours
-- ---------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table claimed_now on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_push_deliveries(200, 120));
reset role;
select extensions.is(
  (select count(*)::integer from claimed_now where delivery ->> 'type' = 'match_starting'),
  6,
  'the sender claims the kick-off pushes that are due: not reader 8''s, held until quiet hours end'
);
select extensions.ok(
  not exists (select 1 from claimed_now where delivery ->> 'deviceRegistrationId' = pg_temp.id(2, 8)::text),
  'reader 8''s phone is not among them'
);
select extensions.is(
  (select count(*)::integer from claimed_now where delivery ->> 'type' = 'deadline_24h'),
  7,
  'and the deadline pushes that are due'
);

-- ---------------------------------------------------------------------------
-- Email is on: push goes after email, on the same notification
--   reader 1 wants email and push; reader 2 email only; reader 10 push only
-- ---------------------------------------------------------------------------
update app.user_preferences set email_notifications_enabled = false where user_id = pg_temp.uid(10);
update app.fixtures set kickoff_at = statement_timestamp() + interval '40 minutes'
where id = 'e8500000-0000-4000-8000-000000000003';
select app_private.notification_email_configure('live', 'https://abcdefghijkl.supabase.co/functions/v1');
select app_private.notification_email_enqueue(
  'match_starting', 'football', 'e8500000-0000-4000-8000-000000000003',
  'email:match_starting:e8500000-0000-4000-8000-000000000003',
  jsonb_build_object('fixture', app_private.notification_email_fixture_json('e8500000-0000-4000-8000-000000000003'), 'minutes', 40),
  statement_timestamp()
);

select app_private.notification_push_tick();
select extensions.is(
  pg_temp.queued('email:match_starting:e8500000-0000-4000-8000-000000000003'), 0,
  'while the email fan-out has not finished with a moment, push waits'
);

select app_private.notification_email_fanout(
  clock_timestamp(), 'live', null,
  (select activated_at from app_private.notification_email_settings), 100
);
select extensions.is(
  (select status::text from app_private.notification_events
   where deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000003'),
  'completed',
  'the email fan-out finishes with the moment'
);
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000003'
     and delivery.channel = 'email' and notification.user_id in (pg_temp.uid(1), pg_temp.uid(2))),
  2,
  'and queues the emails for readers 1 and 2'
);
select extensions.is(
  pg_temp.notifications('email:match_starting:e8500000-0000-4000-8000-000000000003', 10), 0,
  'reader 10 has email off, so email made no notification for them'
);

select app_private.notification_push_tick();
select extensions.is(
  pg_temp.notifications('email:match_starting:e8500000-0000-4000-8000-000000000003', 1)::text || ':'
    || pg_temp.pushes('email:match_starting:e8500000-0000-4000-8000-000000000003', 1)::text,
  '1:3',
  'once email is done, push joins the notification email made: one row for reader 1, a push per phone'
);
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000003'
     and notification.user_id = pg_temp.uid(1) and delivery.channel = 'email'),
  1,
  'and reader 1''s email is still there, once'
);
select extensions.is(
  pg_temp.notifications('email:match_starting:e8500000-0000-4000-8000-000000000003', 10)::text || ':'
    || pg_temp.pushes('email:match_starting:e8500000-0000-4000-8000-000000000003', 10)::text,
  '1:1',
  'a reader with push but no email gets their own notification and a push'
);
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = 'email:match_starting:e8500000-0000-4000-8000-000000000003'
     and notification.user_id = pg_temp.uid(10) and delivery.channel = 'email'),
  0,
  'and no email is made for them'
);
select extensions.is(
  pg_temp.pushes('email:match_starting:e8500000-0000-4000-8000-000000000003', 2), 0,
  'a reader with email but push off gets no push'
);
select extensions.is(
  (select count(*)::integer from (
     select notification.user_id, notification.event_id from app.notifications notification
     group by 1, 2 having count(*) > 1) duplicated),
  0,
  'nobody has the same moment twice'
);

-- The tick does not plan while email is on: that is the email tick's job.
select extensions.is(
  (app_private.notification_push_tick() -> 'plan'), 'null'::jsonb,
  'with email on, the push tick leaves planning to the email tick'
);

select * from extensions.finish();
rollback;
