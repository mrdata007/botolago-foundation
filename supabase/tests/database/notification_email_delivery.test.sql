-- Email notifications: planning, fan-out, claiming and unsubscribing.
--
-- Local-time rules ("10:00 on match day") are exercised with a fixed day in
-- the past and an explicit clock (p_now); everything that is compared with
-- the real clock (claiming, the one-hour kick-off alert, the Fantasy
-- deadline) is built relative to statement_timestamp().
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Catalog: one current season, two rounds, four clubs
-- ---------------------------------------------------------------------------
insert into app.countries(id, iso_alpha2, iso_alpha3)
values ('e0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions(id, slug, name, short_name, competition_type, country_id)
values ('e0100000-0000-4000-8000-000000000001', 'email-test-league', 'Email Test League',
  'ETL', 'league', 'e0000000-0000-4000-8000-000000000001');
insert into app.seasons(id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e0200000-0000-4000-8000-000000000001', 'e0100000-0000-4000-8000-000000000001',
  'Email season', current_date - 60, current_date + 200, 'active', true);
insert into app.rounds(id, season_id, round_number, name) values
  ('e0300000-0000-4000-8000-000000000001', 'e0200000-0000-4000-8000-000000000001', 1, 'Round 1'),
  ('e0300000-0000-4000-8000-000000000002', 'e0200000-0000-4000-8000-000000000001', 2, 'Round 2'),
  ('e0300000-0000-4000-8000-000000000003', 'e0200000-0000-4000-8000-000000000001', 3, 'Round 3');
insert into app.teams(id, slug, name, short_name, code, country_id)
select ('e0400000-0000-4000-8000-00000000000' || n)::uuid, 'email-club-' || n,
  'Email Club ' || n, 'EC' || n, 'EC' || n, 'e0000000-0000-4000-8000-000000000001'
from generate_series(1, 6) n;
insert into app.team_translations(team_id, language, name, short_name)
values ('e0400000-0000-4000-8000-000000000001', 'ar', 'نادي البريد', 'البريد');

-- The day under test: ten days ago, Morocco time.
create temporary table email_clock on commit drop as
select (current_date - 10) as day;

create function pg_temp.local_at(p_day_offset integer, p_time time) returns timestamptz
language sql stable as $$
  select ((select day from email_clock) + p_day_offset + p_time) at time zone 'Africa/Casablanca'
$$;

create function pg_temp.add_fixture(
  p_id uuid, p_round uuid, p_home integer, p_away integer, p_kickoff timestamptz,
  p_status app.fixture_status default 'not_started'
) returns void language sql as $$
  insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id,
    kickoff_at, status, provider_updated_at, source_sequence)
  values (p_id, 'e0100000-0000-4000-8000-000000000001', 'e0200000-0000-4000-8000-000000000001',
    p_round, ('e0400000-0000-4000-8000-00000000000' || p_home)::uuid,
    ('e0400000-0000-4000-8000-00000000000' || p_away)::uuid, p_kickoff, p_status,
    statement_timestamp() - interval '1 day', 1)
$$;

create function pg_temp.finish(p_id uuid, p_home integer, p_away integer) returns void
language sql as $$
  update app.fixtures set status = 'finished', period = 'post_match',
    home_score = p_home, away_score = p_away,
    provider_updated_at = provider_updated_at + interval '1 hour',
    source_sequence = source_sequence + 10
  where id = p_id
$$;

-- Match day: 18:00 and 20:00, one match whose time is not known yet (the
-- provider's 00:00 UTC placeholder) and one postponed match.
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000001',
  'e0300000-0000-4000-8000-000000000001', 1, 2, pg_temp.local_at(0, '20:00'));
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000002',
  'e0300000-0000-4000-8000-000000000001', 3, 4, pg_temp.local_at(0, '18:00'));
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000003',
  'e0300000-0000-4000-8000-000000000001', 5, 6,
  ((select day from email_clock)::timestamp) at time zone 'UTC');
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000004',
  'e0300000-0000-4000-8000-000000000001', 2, 3, pg_temp.local_at(0, '16:00'), 'postponed');
-- A match interrupted at 21:00 (it may resume, so it holds the results back
-- for a while).
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000005',
  'e0300000-0000-4000-8000-000000000001', 4, 6, pg_temp.local_at(0, '21:00'), 'suspended');
-- Round 2, five days later.
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000011',
  'e0300000-0000-4000-8000-000000000002', 2, 1, pg_temp.local_at(5, '18:00'));
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000012',
  'e0300000-0000-4000-8000-000000000002', 4, 3, pg_temp.local_at(6, '20:00'));

-- ---------------------------------------------------------------------------
-- Users
--   one: French, favourite club 1          two: Arabic
--   three: email not confirmed             four: match alerts off
--   five: Fantasy reminders off
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select ('e0600000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'email-' || n || '@example.test',
  case when n = 3 then null else statement_timestamp() end, 'hash', '{}',
  jsonb_build_object('username', 'email_user_' || n,
    'preferred_language', case when n = 2 then 'ar' else 'fr' end),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 5) n;

select extensions.is(
  (select count(*)::integer from app.user_preferences
   where user_id::text like 'e0600000-%' and email_notifications_enabled),
  5,
  'email notifications are on by default for new accounts'
);

update app.user_preferences set favorite_team_id = 'e0400000-0000-4000-8000-000000000001'
where user_id in ('e0600000-0000-4000-8000-000000000001', 'e0600000-0000-4000-8000-000000000005');
update app.user_preferences set match_alerts = false
where user_id = 'e0600000-0000-4000-8000-000000000004';
update app.user_preferences set fantasy_deadline_reminders = false
where user_id = 'e0600000-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- Off by default
-- ---------------------------------------------------------------------------
select extensions.is(
  (select mode from app_private.notification_email_settings), 'off',
  'email sending ships switched off'
);
select extensions.is(
  app_private.notification_email_tick() ->> 'outcome', 'off',
  'the tick does nothing while email is off'
);
select extensions.is(
  (select count(*)::integer from cron.job
   where jobname in ('notification-email-tick', 'football-live-refresh') and active),
  2,
  'both scheduled jobs exist'
);
select extensions.throws_ok(
  $$select app_private.notification_email_configure('everyone')$$,
  '22023', 'notification_email_mode_invalid',
  'an unknown mode is refused'
);

select app_private.notification_email_configure('live', 'http://kong:8000/functions/v1');
select extensions.ok(
  (select activated_at is not null from app_private.notification_email_settings),
  'switching on records the activation time'
);

create function pg_temp.events(p_type text) returns integer language sql as $$
  select count(*)::integer from app_private.notification_events
  where event_type::text = p_type and received_at >= (select activated_at from app_private.notification_email_settings)
$$;

create function pg_temp.fanout(p_now timestamptz) returns jsonb language sql as $$
  select app_private.notification_email_fanout(p_now, settings.mode, settings.test_user_ids,
    settings.activated_at, settings.max_emails_per_run)
  from app_private.notification_email_settings settings
$$;

create function pg_temp.email_recipients(p_type text) returns text[] language sql as $$
  select coalesce(array_agg(notification.user_id::text order by notification.user_id), '{}')
  from app.notifications notification
  join app.notification_deliveries delivery
    on delivery.notification_id = notification.id and delivery.channel = 'email'
  where notification.notification_type::text = p_type
$$;

-- ---------------------------------------------------------------------------
-- Before the matches
-- ---------------------------------------------------------------------------
select app_private.notification_email_plan(pg_temp.local_at(0, '09:00'));
select extensions.is(pg_temp.events('matchday_preview'), 0,
  'no match-day email before 10:00');

select app_private.notification_email_plan(pg_temp.local_at(0, '10:05'));
select extensions.is(pg_temp.events('matchday_preview'), 1,
  'the match-day email is planned at 10:00 on match day');
select extensions.is(
  (select jsonb_array_length(safe_payload -> 'fixtures') from app_private.notification_events
   where event_type = 'matchday_preview'),
  3,
  'it lists the day''s matches, including the unconfirmed one, and leaves out the postponed one'
);
select extensions.is(
  (select safe_payload -> 'fixtures' -> 0 ->> 'timeConfirmed' from app_private.notification_events
   where event_type = 'matchday_preview'),
  'false',
  'the placeholder kick-off is flagged as not confirmed'
);
select extensions.is(
  (select safe_payload -> 'fixtures' -> 2 -> 'home' -> 'name' ->> 'ar' from app_private.notification_events
   where event_type = 'matchday_preview'),
  'نادي البريد',
  'club names travel in Arabic when a translation exists'
);
select extensions.is(
  (select safe_payload -> 'fixtures' -> 2 -> 'home' -> 'name' ->> 'fr' from app_private.notification_events
   where event_type = 'matchday_preview'),
  'Email Club 1',
  'and fall back to the catalog name otherwise'
);

select app_private.notification_email_plan(pg_temp.local_at(0, '10:10'));
select extensions.is(pg_temp.events('matchday_preview'), 1,
  'planning again the same day never creates a second match-day email');

select pg_temp.fanout(pg_temp.local_at(0, '10:10'));
select extensions.is(
  pg_temp.email_recipients('matchday_preview'),
  array['e0600000-0000-4000-8000-000000000001', 'e0600000-0000-4000-8000-000000000002',
    'e0600000-0000-4000-8000-000000000005'],
  'confirmed users with match alerts on get it; unconfirmed email and match alerts off do not'
);
select extensions.is(
  (select title from app.notifications where notification_type = 'matchday_preview'
   and user_id = 'e0600000-0000-4000-8000-000000000002'),
  'مباريات اليوم',
  'the carrying notification is rendered in the user''s language'
);
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   where notification.notification_type = 'matchday_preview'
     and delivery.channel = 'email' and delivery.provider_key = 'resend' and delivery.status = 'pending'),
  3,
  'each recipient has exactly one pending Resend email'
);
select extensions.is(
  (select status::text from app_private.notification_events where event_type = 'matchday_preview'),
  'completed',
  'the fan-out closes the event'
);

select pg_temp.fanout(pg_temp.local_at(0, '10:15'));
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   where notification.notification_type = 'matchday_preview' and delivery.channel = 'email'),
  3,
  'fanning out again adds nothing'
);

-- ---------------------------------------------------------------------------
-- After the matches
-- ---------------------------------------------------------------------------
select pg_temp.finish('e0500000-0000-4000-8000-000000000002', 2, 1);
select app_private.notification_email_plan(pg_temp.local_at(0, '20:30'));
select extensions.is(pg_temp.events('matchday_results'), 0,
  'no results email while a match of the day is still to be played');

select pg_temp.finish('e0500000-0000-4000-8000-000000000001', 0, 0);
select app_private.notification_email_plan(pg_temp.local_at(0, '23:00'));
select extensions.is(pg_temp.events('matchday_results'), 0,
  'a match suspended two hours ago may still resume, so the results wait');
select app_private.notification_email_plan(pg_temp.local_at(1, '02:00'));
select extensions.is(pg_temp.events('matchday_results'), 0,
  'a results email that becomes ready after midnight waits for the morning');

select app_private.notification_email_plan(pg_temp.local_at(1, '08:30'));
select extensions.is(pg_temp.events('matchday_results'), 1,
  'the results email is planned once every match of the day has a result');
select extensions.is(
  (select jsonb_agg(fixture ->> 'status' order by fixture ->> 'status')
   from app_private.notification_events event,
     jsonb_array_elements(event.safe_payload -> 'fixtures') fixture
   where event.event_type = 'matchday_results'),
  '["finished", "finished", "postponed", "suspended"]'::jsonb,
  'it lists both results, the postponed and the interrupted match, not the match that never got a time'
);

-- Test mode: only the listed account is emailed.
select app_private.notification_email_configure('test', null,
  array['e0600000-0000-4000-8000-000000000002']::uuid[]);
select pg_temp.fanout(pg_temp.local_at(1, '08:30'));
select extensions.is(
  pg_temp.email_recipients('matchday_results'),
  array['e0600000-0000-4000-8000-000000000002'],
  'test mode emails only the test accounts'
);
select app_private.notification_email_configure('live');

-- A results email that was never sent in time is dropped, not sent late.
select app_private.notification_email_plan(pg_temp.local_at(1, '12:30'));
select extensions.is(pg_temp.events('matchday_results'), 1,
  'nothing new is planned for a day whose window has closed');

-- ---------------------------------------------------------------------------
-- Round preview
-- ---------------------------------------------------------------------------
select app_private.notification_email_plan(pg_temp.local_at(2, '09:00'));
select extensions.is(pg_temp.events('round_preview'), 0,
  'the round preview waits for 10:00 three days before the round');
select app_private.notification_email_plan(pg_temp.local_at(2, '10:30'));
select extensions.is(pg_temp.events('round_preview'), 1,
  'the round preview is planned three days before the round''s first match');
select extensions.is(
  (select safe_payload -> 'round' ->> 'number' from app_private.notification_events
   where event_type = 'round_preview'),
  '2',
  'it names the round'
);
select pg_temp.fanout(pg_temp.local_at(2, '10:30'));
select extensions.is(
  (select title from app.notifications where notification_type = 'round_preview'
   and user_id = 'e0600000-0000-4000-8000-000000000001'),
  'Journée 2 : le programme',
  'the round number reaches the rendered notification'
);

-- ---------------------------------------------------------------------------
-- An hour before your club plays (real clock)
-- ---------------------------------------------------------------------------
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000021',
  'e0300000-0000-4000-8000-000000000003', 1, 4, statement_timestamp() + interval '50 minutes 7 seconds');
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000022',
  'e0300000-0000-4000-8000-000000000003', 5, 6, statement_timestamp() + interval '50 minutes 7 seconds');
select app_private.notification_email_plan(statement_timestamp());
select extensions.is(
  (select count(*)::integer from app_private.notification_events
   where event_type = 'match_starting' and source_entity_id = 'e0500000-0000-4000-8000-000000000021'),
  1,
  'a kick-off alert is planned for a match someone''s favourite club plays'
);
select extensions.is(
  (select count(*)::integer from app_private.notification_events
   where event_type = 'match_starting' and source_entity_id = 'e0500000-0000-4000-8000-000000000022'),
  0,
  'and not for a match nobody follows'
);
select extensions.is(
  (select (safe_payload ->> 'minutes')::integer from app_private.notification_events
   where event_type = 'match_starting'),
  50,
  'the alert says how long is left'
);

-- ---------------------------------------------------------------------------
-- Fantasy deadline (real clock)
-- ---------------------------------------------------------------------------
insert into app.fantasy_competitions(id, football_competition_id, slug, name, active)
values ('e0700000-0000-4000-8000-000000000001', 'e0100000-0000-4000-8000-000000000001',
  'email-test', 'Email Test', true);
insert into app.fantasy_seasons(id, fantasy_competition_id, football_season_id,
  ruleset_id, name, status, starts_at, ends_at)
values ('e0800000-0000-4000-8000-000000000001', 'e0700000-0000-4000-8000-000000000001',
  'e0200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Email Fantasy season', 'active', current_date - 60, current_date + 200);
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000031',
  'e0300000-0000-4000-8000-000000000003', 2, 3,
  date_trunc('minute', statement_timestamp()) + interval '21 hours 31 minutes');
insert into app.fantasy_gameweeks(id, fantasy_season_id, football_round_id,
  sequence_number, name, deadline_at, starts_at, ends_at, status)
values ('e0900000-0000-4000-8000-000000000001', 'e0800000-0000-4000-8000-000000000001',
  'e0300000-0000-4000-8000-000000000003', 7, '7',
  date_trunc('minute', statement_timestamp()) + interval '20 hours 1 minute',
  date_trunc('minute', statement_timestamp()) + interval '21 hours 31 minutes',
  date_trunc('minute', statement_timestamp()) + interval '3 days', 'open');
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version)
values ('e0800000-0000-4000-8000-000000000001', 'e0500000-0000-4000-8000-000000000031',
  'e0900000-0000-4000-8000-000000000001', 'e0900000-0000-4000-8000-000000000001',
  date_trunc('minute', statement_timestamp()) + interval '21 hours 31 minutes',
  date_trunc('minute', statement_timestamp()) + interval '21 hours 31 minutes', 1);

select app_private.notification_email_plan(statement_timestamp());
select extensions.is(
  (select count(*)::integer from app_private.notification_events
   where event_type = 'deadline_24h' and source_entity_id = 'e0900000-0000-4000-8000-000000000001'),
  1,
  'the Fantasy deadline reminder is planned 24 hours before the deadline'
);

select pg_temp.fanout(statement_timestamp());
select extensions.is(
  pg_temp.email_recipients('match_starting'),
  array['e0600000-0000-4000-8000-000000000001', 'e0600000-0000-4000-8000-000000000005'],
  'only fans of the club get the kick-off alert'
);
select extensions.is(
  pg_temp.email_recipients('deadline_24h'),
  array['e0600000-0000-4000-8000-000000000001', 'e0600000-0000-4000-8000-000000000002',
    'e0600000-0000-4000-8000-000000000004'],
  'the deadline reminder follows the Fantasy reminders switch, not match alerts'
);

-- ---------------------------------------------------------------------------
-- Claiming (service role)
-- ---------------------------------------------------------------------------
set local role anon;
select extensions.throws_ok(
  $$select api.service_claim_email_deliveries(10, 120)$$,
  '42501', null,
  'a browser cannot claim email deliveries'
);
reset role;

-- One fan drops the club after the alert was queued: it must not go out.
update app.user_preferences set favorite_team_id = null
where user_id = 'e0600000-0000-4000-8000-000000000005';

-- Free plan: 100 a day with 10 kept back for account emails. Squeeze the
-- day's allowance to three to see what goes first.
select app_private.notification_email_configure('live', null, null, null, null, 13, null, 10);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table email_claim on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_email_deliveries(50, 120));
reset role;
select extensions.is(
  (select jsonb_object_agg(type, total) from (
     select delivery ->> 'type' as type, count(*) as total from email_claim group by 1) counts),
  '{"deadline_24h": 2, "match_starting": 1}'::jsonb,
  'with only three emails left today, the kick-off alert and deadline reminders go first'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_claim_email_deliveries(50, 120),
  '[]'::jsonb,
  'and nothing more is handed out once the day''s allowance is spent'
);
reset role;
select extensions.is(
  (app_private.notification_email_quota(statement_timestamp()) ->> 'inFlight')::integer,
  3,
  'mail being sent counts against the allowance'
);
select extensions.is(
  (select delivery.status::text || ':' || delivery.stable_error_code
   from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   where notification.user_id = 'e0600000-0000-4000-8000-000000000005'
     and notification.notification_type = 'match_starting' and delivery.channel = 'email'),
  'cancelled:email_no_longer_eligible',
  'a kick-off alert for a club the reader no longer follows is cancelled, not sent'
);

select app_private.notification_email_configure('live', null, null, null, null, 100, null, 10);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into email_claim
select value from jsonb_array_elements(api.service_claim_email_deliveries(50, 120));
reset role;

-- The real clock also made today a match day (the two matches an hour from
-- now), so today's match-day email is due as well.
select extensions.is(
  (select jsonb_object_agg(type, total) from (
     select delivery ->> 'type' as type, count(*) as total from email_claim group by 1) counts),
  '{"deadline_24h": 3, "match_starting": 1, "matchday_preview": 3}'::jsonb,
  'only timely mail is claimed: today''s match-day email, the kick-off alert and the deadline reminders'
);
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.occurred_at < statement_timestamp() - interval '1 day'
     and delivery.channel = 'email' and delivery.status = 'cancelled'
     and delivery.stable_error_code = 'email_no_longer_eligible'),
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.occurred_at < statement_timestamp() - interval '1 day'
     and delivery.channel = 'email'),
  'mail for moments that have passed is cancelled instead of being sent late'
);
select extensions.ok(
  (select bool_and(
     delivery ->> 'unsubscribeToken' ~ '^[A-Za-z0-9_-]{32}$'
     and delivery -> 'recipient' ->> 'email' like 'email-%@example.test'
     and delivery ->> 'timezone' = 'Africa/Casablanca')
   from email_claim),
  'each claimed email carries its address, timezone and an unsubscribe token'
);
select extensions.is(
  (select delivery -> 'payload' -> 'fixture' -> 'home' ->> 'id' from email_claim
   where delivery ->> 'type' = 'match_starting'),
  'e0400000-0000-4000-8000-000000000001',
  'the kick-off alert carries the match'
);
select extensions.is(
  (select delivery ->> 'language' from email_claim
   where delivery ->> 'type' = 'deadline_24h'
     and delivery -> 'recipient' ->> 'email' = 'email-2@example.test'),
  'ar',
  'the Arabic reader is emailed in Arabic'
);
select extensions.is(
  (select count(*)::integer from app_private.notification_email_unsubscribe_tokens),
  7,
  'only the token hash is stored, one per claimed email'
);

select extensions.is(
  app_private.notification_email_unsubscribe_token(
    ((select delivery ->> 'id' from email_claim where delivery ->> 'type' = 'match_starting'))::uuid),
  (select delivery ->> 'unsubscribeToken' from email_claim where delivery ->> 'type' = 'match_starting'),
  'a retried email carries the same unsubscribe link, so it is byte-for-byte the same email'
);

-- The dispatcher reports back through the existing attempt recorder.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_record_notification_delivery_attempt(
    ((select delivery ->> 'id' from email_claim where delivery ->> 'type' = 'match_starting'))::uuid,
    'sent', false, 'resend-message-1')::text,
  'sent',
  'a sent email is recorded as sent'
);
select extensions.is(
  api.service_claim_email_deliveries(50, 120),
  '[]'::jsonb,
  'claimed mail is not handed out twice'
);
reset role;
select extensions.is(
  (app_private.notification_email_quota(statement_timestamp()) ->> 'sentToday')::integer,
  1,
  'what the provider accepted counts towards today'
);
select extensions.is(
  (app_private.notification_email_quota(statement_timestamp()) ->> 'dailyRemaining')::integer,
  100 - 10 - 1 - 6,
  'today''s allowance is the limit, less the reserve, what was sent and what is being sent'
);

-- ---------------------------------------------------------------------------
-- Unsubscribe
-- ---------------------------------------------------------------------------
select set_config('email_test.unsubscribe_token', (
  select delivery ->> 'unsubscribeToken' from email_claim
  where delivery ->> 'type' = 'deadline_24h' and delivery -> 'recipient' ->> 'email' = 'email-4@example.test'
), true);

set local role anon;
select extensions.is(
  api.unsubscribe_notification_email(current_setting('email_test.unsubscribe_token')) ->> 'status',
  'unsubscribed',
  'the link in the email switches email off without signing in'
);
select extensions.is(
  api.unsubscribe_notification_email(current_setting('email_test.unsubscribe_token')) ->> 'status',
  'already_unsubscribed',
  'using it twice is harmless'
);
select extensions.is(
  api.unsubscribe_notification_email('not-a-token') ->> 'status',
  'invalid',
  'a malformed token is refused'
);
select extensions.is(
  api.unsubscribe_notification_email(repeat('A', 32)) ->> 'status',
  'invalid',
  'an unknown token is refused'
);
reset role;

select extensions.is(
  (select email_notifications_enabled from app.user_preferences
   where user_id = 'e0600000-0000-4000-8000-000000000004'),
  false,
  'the account''s email preference is now off'
);
select extensions.ok(
  exists (select 1 from app_private.notification_operational_audit
    where event_type = 'notification_email_unsubscribed'
      and actor_user_id = 'e0600000-0000-4000-8000-000000000004'),
  'the unsubscribe is audited'
);

-- An account that switched email off in its settings is not mailed even if
-- mail was already queued for it.
update app.notification_deliveries delivery set status = 'retry_scheduled', next_retry_at = statement_timestamp() - interval '1 minute',
  claimed_at = null, claim_expires_at = null
from app.notifications notification
where notification.id = delivery.notification_id
  and notification.user_id = 'e0600000-0000-4000-8000-000000000002'
  and notification.notification_type = 'deadline_24h' and delivery.channel = 'email';
update app.user_preferences set email_notifications_enabled = false
where user_id = 'e0600000-0000-4000-8000-000000000002';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_claim_email_deliveries(50, 120),
  '[]'::jsonb,
  'queued mail for an account that switched email off is not claimed'
);
reset role;
select extensions.is(
  (select delivery.status::text from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   where notification.user_id = 'e0600000-0000-4000-8000-000000000002'
     and notification.notification_type = 'deadline_24h' and delivery.channel = 'email'),
  'cancelled',
  'it is cancelled instead'
);

-- ---------------------------------------------------------------------------
-- Scheduler plumbing
-- ---------------------------------------------------------------------------
select extensions.ok(
  app_private.scheduler_token() ~ '^[0-9a-f]{64}$',
  'the scheduler token is generated inside the database'
);
select set_config('email_test.scheduler_token', app_private.scheduler_token(), true);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_verify_scheduler_token(current_setting('email_test.scheduler_token')),
  true,
  'the Edge Functions can check the token pg_cron sends'
);
select extensions.is(
  api.service_verify_scheduler_token(repeat('0', 64)),
  false,
  'a wrong scheduler token is refused'
);
reset role;

select extensions.is(
  app_private.football_live_refresh_tick(),
  'disabled',
  'the results refresh is off until switched on'
);
select app_private.notification_email_configure('live', null, null, true);
select extensions.is(
  app_private.football_live_refresh_tick(),
  'idle',
  'with no match on, the results refresh does not call the provider'
);
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000042',
  'e0300000-0000-4000-8000-000000000003', 1, 5, statement_timestamp() - interval '5 hours 7 seconds',
  'live_second_half');
select extensions.is(
  app_private.football_live_refresh_tick(),
  'invoked',
  'a match still being played five hours after its kick-off keeps being refreshed'
);
update app.fixtures set status = 'finished', period = 'post_match', home_score = 1, away_score = 0,
  provider_updated_at = provider_updated_at + interval '1 hour', source_sequence = source_sequence + 10
where id = 'e0500000-0000-4000-8000-000000000042';
select extensions.is(
  app_private.football_live_refresh_tick(),
  'idle',
  'and stops once it is finished'
);
select pg_temp.add_fixture('e0500000-0000-4000-8000-000000000041',
  'e0300000-0000-4000-8000-000000000003', 3, 6, statement_timestamp() - interval '29 minutes 53 seconds');
select extensions.is(
  app_private.football_live_refresh_tick(),
  'invoked',
  'while a match is on, the results refresh calls the Edge Function'
);
select extensions.ok(
  (app_private.notification_email_tick() ->> 'outcome') in ('succeeded', 'idle'),
  'a live tick runs end to end'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (select api.service_notification_email_health() ->> 'mode'),
  'live',
  'the health check reports the switch position'
);
select extensions.ok(
  (select (api.service_notification_email_health() ->> 'tickJobActive')::boolean),
  'and sees the scheduled job'
);
reset role;

-- ---------------------------------------------------------------------------
-- Monthly limit and provider pause
-- ---------------------------------------------------------------------------
update app.notification_deliveries delivery set status = 'retry_scheduled',
  next_retry_at = statement_timestamp() - interval '1 minute', claimed_at = null, claim_expires_at = null
from app.notifications notification
where notification.id = delivery.notification_id
  and notification.user_id = 'e0600000-0000-4000-8000-000000000001'
  and notification.notification_type = 'deadline_24h' and delivery.channel = 'email';

select app_private.notification_email_configure('live', null, null, null, null, null, 1, null);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_claim_email_deliveries(50, 120),
  '[]'::jsonb,
  'nothing is handed out once the month''s allowance is spent'
);
reset role;
select extensions.is(
  (select delivery.status::text from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   where notification.user_id = 'e0600000-0000-4000-8000-000000000001'
     and notification.notification_type = 'deadline_24h' and delivery.channel = 'email'),
  'retry_scheduled',
  'the waiting email keeps waiting rather than failing'
);
select extensions.is(
  app_private.notification_email_tick() ->> 'dispatch',
  'quota_reached',
  'the tick does not wake the sender while the allowance is spent'
);
select app_private.notification_email_configure('live', null, null, null, null, null, 3000, null);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok(
  $$select api.service_pause_email_provider('bored', statement_timestamp() + interval '1 hour')$$,
  'PT400', 'invalid_email_provider_pause',
  'a pause needs a known reason'
);
select extensions.throws_ok(
  $$select api.service_pause_email_provider('daily_quota_exceeded', statement_timestamp() + interval '40 days')$$,
  'PT400', 'invalid_email_provider_pause',
  'and a bounded length'
);
select extensions.is(
  api.service_pause_email_provider('daily_quota_exceeded', statement_timestamp() + interval '1 hour')
    ->> 'pauseReason',
  'daily_quota_exceeded',
  'the sender can pause sending when the provider says the quota is spent'
);
select extensions.is(
  api.service_claim_email_deliveries(50, 120),
  '[]'::jsonb,
  'nothing is handed out while paused'
);
select extensions.is(
  api.service_pause_email_provider('provider_auth_failed', statement_timestamp() + interval '30 minutes')
    ->> 'pauseReason',
  'daily_quota_exceeded',
  'a shorter pause never cuts a longer one short'
);
reset role;
select extensions.is(
  app_private.notification_email_tick() ->> 'dispatch',
  'paused',
  'the tick does not wake the sender while paused'
);
update app_private.notification_email_settings set provider_paused_until = null, provider_pause_reason = null;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  jsonb_array_length(api.service_claim_email_deliveries(50, 120)),
  1,
  'after the pause the waiting email goes out'
);
reset role;

-- ---------------------------------------------------------------------------
-- Handing back, uncertain sends and abandoned claims
-- ---------------------------------------------------------------------------
select set_config('email_test.u1_deadline', (
  select delivery.id::text from app.notification_deliveries delivery
  join app.notifications notification on notification.id = delivery.notification_id
  where notification.user_id = 'e0600000-0000-4000-8000-000000000001'
    and notification.notification_type = 'deadline_24h' and delivery.channel = 'email'), true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_release_email_deliveries(
    array[current_setting('email_test.u1_deadline')::uuid], statement_timestamp() + interval '1 hour'),
  1,
  'mail claimed while the provider refuses everything can be handed back'
);
reset role;
select extensions.is(
  (select status::text || ':' || attempt_count from app.notification_deliveries
   where id = current_setting('email_test.u1_deadline')::uuid),
  'retry_scheduled:1',
  'handing back does not spend an attempt'
);

-- A send that timed out may have reached the provider: it counts.
update app.notification_deliveries set next_retry_at = statement_timestamp() - interval '1 minute'
where id = current_setting('email_test.u1_deadline')::uuid;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_claim_email_deliveries(50, 120);
select api.service_record_notification_delivery_attempt(
  current_setting('email_test.u1_deadline')::uuid, 'retryable_failure', true, null, 'delivery_timeout');
reset role;
select extensions.is(
  (app_private.notification_email_quota(statement_timestamp()) ->> 'uncertainToday')::integer,
  1,
  'a send whose outcome is unknown counts against the allowance until it is confirmed'
);

-- A pass that claimed mail and died leaves it claimed; once the lease is over
-- it is re-checked like waiting mail, so an unsubscribe still stops it.
update app.notification_deliveries set status = 'claimed',
  claimed_at = statement_timestamp() - interval '10 minutes',
  claim_expires_at = statement_timestamp() - interval '5 minutes', next_retry_at = null
where id = current_setting('email_test.u1_deadline')::uuid;
update app.user_preferences set email_notifications_enabled = false
where user_id = 'e0600000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_claim_email_deliveries(50, 120),
  '[]'::jsonb,
  'an abandoned claim for someone who has since switched email off is not handed out again'
);
reset role;
select extensions.is(
  (select status::text || ':' || stable_error_code from app.notification_deliveries
   where id = current_setting('email_test.u1_deadline')::uuid),
  'cancelled:email_no_longer_eligible',
  'it is cancelled instead'
);

set local role authenticated;
select extensions.throws_ok(
  $$select api.service_pause_email_provider('daily_quota_exceeded', statement_timestamp() + interval '1 hour')$$,
  '42501', null,
  'a browser cannot pause sending'
);
reset role;

select extensions.ok(
  not has_function_privilege('anon', 'api.service_claim_email_deliveries(integer, integer)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_claim_email_deliveries(integer, integer)', 'execute')
  and has_function_privilege('anon', 'api.unsubscribe_notification_email(text)', 'execute')
  and not has_function_privilege('service_role', 'app_private.notification_email_tick()', 'execute'),
  'only the unsubscribe function is reachable from a browser'
);

select * from extensions.finish();
rollback;
