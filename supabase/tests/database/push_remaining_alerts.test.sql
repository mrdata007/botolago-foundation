-- Push alerts, the remaining moments: the 1-hour Fantasy deadline, the final
-- score, goals, and the correction when a told goal is ruled out.
--
-- app_private.notification_push_plan writes the moments only push uses;
-- app_private.notification_push_fanout turns them into one push per phone;
-- the tick runs both. Everything is built relative to the clock.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Privileges, text and rules
-- ---------------------------------------------------------------------------
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.notification_push_plan(timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.notification_push_plan(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'app_private.notification_push_plan(timestamptz)', 'execute')
  and not has_function_privilege('service_role',
    'app_private.notification_push_event_is_stale(app_private.notification_events,timestamptz)', 'execute')
  and not has_function_privilege('service_role',
    'app_private.notification_push_goal_alert_reached(text,uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'app_private.notification_push_fixture_followed(uuid)', 'execute'),
  'only the database owner can run the planner and its helpers'
);
select extensions.is(
  (select string_agg(template_key || '/' || language || '/v' || version, ' ' order by template_key, language::text)
   from app.notification_templates
   where template_key in ('goal', 'goal_cancelled', 'deadline_1h') and channel = 'in_app' and active),
  'deadline_1h/ar/v1 deadline_1h/fr/v1 goal/ar/v2 goal/fr/v2 goal_cancelled/ar/v1 goal_cancelled/fr/v1',
  'goals, their correction and the 1-hour deadline each have active French and Arabic text, and goals are on their second edition'
);
select extensions.is(
  (select count(*)::integer from app.notification_templates
   where template_key = 'goal' and channel = 'in_app' and version = 1 and not active and retired_at is not null),
  2,
  'the first edition of the goal text is retired, not deleted'
);
select extensions.is(
  app_private.notification_push_topic('goal_cancelled') || '/'
    || app_private.notification_push_ttl('goal_cancelled')::text || '/'
    || app_private.notification_push_rank('goal_cancelled')::text,
  'match/00:10:00/1',
  'a correction is a match alert, lives ten minutes and goes first'
);
select extensions.is(
  app_private.notification_push_topic('breaking_news') is null
    and app_private.notification_push_topic('password_changed') is null,
  true,
  'news and account messages are still never pushed'
);

-- ---------------------------------------------------------------------------
-- Catalog: a current season, four clubs
-- ---------------------------------------------------------------------------
insert into app.countries(id, iso_alpha2, iso_alpha3)
values ('e9000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions(id, slug, name, short_name, competition_type, country_id)
values ('e9100000-0000-4000-8000-000000000001', 'push-remaining-league', 'Push Remaining League',
  'PRL', 'league', 'e9000000-0000-4000-8000-000000000001');
insert into app.seasons(id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e9200000-0000-4000-8000-000000000001', 'e9100000-0000-4000-8000-000000000001',
  'Push remaining season', current_date - 60, current_date + 200, 'active', true);
insert into app.rounds(id, season_id, round_number, name)
values ('e9300000-0000-4000-8000-000000000001', 'e9200000-0000-4000-8000-000000000001', 1, 'Round 1'),
  ('e9300000-0000-4000-8000-000000000002', 'e9200000-0000-4000-8000-000000000001', 2, 'Round 2'),
  ('e9300000-0000-4000-8000-000000000003', 'e9200000-0000-4000-8000-000000000001', 3, 'Round 3');
insert into app.teams(id, slug, name, short_name, code, country_id)
select ('e9400000-0000-4000-8000-00000000000' || n)::uuid, 'remaining-club-' || n,
  'Push Club ' || n, 'RC' || n, 'RC' || n, 'e9000000-0000-4000-8000-000000000001'
from generate_series(1, 4) n;

create function pg_temp.fixture(
  p_n integer, p_home integer, p_away integer, p_kickoff timestamptz, p_status text,
  p_minute integer, p_home_score integer, p_away_score integer,
  p_updated timestamptz default statement_timestamp()
) returns void language sql as $$
  insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id,
    kickoff_at, status, period, minute, home_score, away_score,
    provider_updated_at, source_sequence, updated_at)
  values (('e9500000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid,
    'e9100000-0000-4000-8000-000000000001', 'e9200000-0000-4000-8000-000000000001',
    'e9300000-0000-4000-8000-000000000001',
    ('e9400000-0000-4000-8000-' || lpad(p_home::text, 12, '0'))::uuid,
    ('e9400000-0000-4000-8000-' || lpad(p_away::text, 12, '0'))::uuid,
    p_kickoff, p_status::app.fixture_status,
    (case p_status when 'finished' then 'post_match' when 'live_second_half' then 'second_half'
      when 'penalties' then 'penalties' else 'pre_match' end)::app.fixture_period,
    p_minute, p_home_score, p_away_score,
    statement_timestamp() - interval '1 day', 1, p_updated)
$$;

-- 1: club 1 v club 2, live, minute 62, 1-0.       2: club 1 v club 3, finished 2-1 moments ago.
-- 3: club 1 v club 3, finished, last changed 2 hours ago.   4: finished, kicked off 8 hours ago.
-- 5: club 1 v club 2, live minute 80, 1-0 (a backfilled goal from minute 20).
-- 6: club 3 v club 4, live, nobody follows either.   7: club 1 v club 2, in the shoot-out, 1-1.
select pg_temp.fixture(1, 1, 2, statement_timestamp() - interval '60 minutes', 'live_second_half', 62, 1, 0);
select pg_temp.fixture(2, 1, 3, statement_timestamp() - interval '2 hours', 'finished', null, 2, 1);
select pg_temp.fixture(3, 1, 3, statement_timestamp() - interval '2 hours', 'finished', null, 2, 1,
  statement_timestamp() - interval '2 hours');
select pg_temp.fixture(4, 1, 3, statement_timestamp() - interval '8 hours', 'finished', null, 0, 0);
select pg_temp.fixture(5, 1, 2, statement_timestamp() - interval '90 minutes', 'live_second_half', 80, 1, 0);
select pg_temp.fixture(6, 3, 4, statement_timestamp() - interval '60 minutes', 'live_second_half', 62, 1, 0);
select pg_temp.fixture(7, 1, 2, statement_timestamp() - interval '2 hours', 'penalties', 120, 1, 1);
-- 12: club 3 v club 4, finished moments ago, nobody follows.
-- 13: club 1 v club 2, finished, kicked off five hours ago, last changed then.
select pg_temp.fixture(12, 3, 4, statement_timestamp() - interval '2 hours', 'finished', null, 1, 0);
select pg_temp.fixture(13, 1, 2, statement_timestamp() - interval '5 hours', 'finished', null, 1, 0,
  statement_timestamp() - interval '5 hours');

create function pg_temp.goal(
  p_fixture integer, p_key text, p_team integer, p_minute integer,
  p_type text default 'goal', p_period text default 'second_half',
  p_created timestamptz default statement_timestamp()
) returns void language sql as $$
  insert into app.match_events(fixture_id, team_id, event_type, minute, added_time, sequence_number,
    period, idempotency_key, provider_event_key, provider_updated_at, source_sequence, created_at)
  values (('e9500000-0000-4000-8000-' || lpad(p_fixture::text, 12, '0'))::uuid,
    ('e9400000-0000-4000-8000-' || lpad(p_team::text, 12, '0'))::uuid,
    p_type::app.match_event_type, p_minute, 0, p_minute, p_period::app.fixture_period,
    'test:event:' || p_key, p_key, statement_timestamp(), 1, p_created)
$$;
-- the moment's deduplication key for a goal
create function pg_temp.gkey(p_fixture integer, p_key text) returns text language sql immutable as $$
  select 'push:goal:e9500000-0000-4000-8000-' || lpad(p_fixture::text, 12, '0') || ':' || md5('test:event:' || p_key)
$$;
create function pg_temp.ckey(p_fixture integer, p_key text) returns text language sql immutable as $$
  select 'push:goal_cancelled:e9500000-0000-4000-8000-' || lpad(p_fixture::text, 12, '0') || ':' || md5('test:event:' || p_key)
$$;
create function pg_temp.events(p_like text) returns integer language sql stable as $$
  select count(*)::integer from app_private.notification_events where deduplication_key like p_like
$$;

-- ---------------------------------------------------------------------------
-- Readers (each with the phones noted)
--   1  fan of club 1, two phones               2  fan, push OFF, a phone
--   3  fan, match alerts off, a phone          4  follows club 2, a phone
--   5  no club, a phone                        6  fan, no phone
--   7  fan, phone switched off                 8  fan, quiet hours now, a phone
--   9  fan, a phone, Fantasy reminders off     10 fan, a phone
--   11 no club, subscribed to match 1, a phone
-- ---------------------------------------------------------------------------
create function pg_temp.id(p_kind integer, p_n integer) returns uuid language sql immutable as $$
  select ('e9' || lpad(p_kind::text, 2, '0') || '0000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
create function pg_temp.uid(p_n integer) returns uuid language sql immutable as $$
  select pg_temp.id(10, p_n)
$$;

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select pg_temp.uid(n), '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'remaining-' || n || '@example.test',
  statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'remaining_user_' || n, 'preferred_language', 'fr'),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 11) n;

update app.user_preferences set push_notifications_enabled = true
where user_id in (select pg_temp.uid(n) from generate_series(1, 11) n where n <> 2);
update app.user_preferences set favorite_team_id = 'e9400000-0000-4000-8000-000000000001'
where user_id in (select pg_temp.uid(n) from generate_series(1, 11) n where n in (1, 2, 3, 6, 7, 8, 9, 10));
update app.user_preferences set match_alerts = false where user_id = pg_temp.uid(3);
update app.user_preferences set fantasy_deadline_reminders = false where user_id = pg_temp.uid(9);
insert into app.followed_teams(user_id, team_id)
values (pg_temp.uid(4), 'e9400000-0000-4000-8000-000000000002');
insert into app.notification_subscriptions(user_id, kind, fixture_id)
values (pg_temp.uid(11), 'match', 'e9500000-0000-4000-8000-000000000001');
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
    pg_temp.id(2, p_n), pg_temp.uid(p_user), 'device-' || p_n || '-remaining',
    p_platform::app.notification_device_platform, p_provider::app.notification_push_provider,
    'fr', p_enabled, case when p_enabled then null else statement_timestamp() end
  );
  insert into app_private.push_destinations (device_registration_id, destination_digest, destination_value)
  values (pg_temp.id(2, p_n), extensions.digest('remaining-token-' || p_n, 'sha256'),
    'remaining-token-' || lpad(p_n::text, 6, '0') || '-0000000000')
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
select pg_temp.device(11, 2, 'android', 'fcm');
select pg_temp.device(12, 11, 'android', 'fcm');

create function pg_temp.pushes(p_event_key text, p_user integer) returns integer
language sql stable as $$
  select count(*)::integer
  from app.notification_deliveries delivery
  join app.notifications notification on notification.id = delivery.notification_id
  join app_private.notification_events event on event.id = notification.event_id
  where event.deduplication_key = p_event_key and notification.user_id = pg_temp.uid(p_user)
    and delivery.channel = 'push'
$$;
create function pg_temp.audience(p_event_key text) returns text language sql stable as $$
  select string_agg(n::text || ':' || pg_temp.pushes(p_event_key, n), ' ' order by n)
  from generate_series(1, 11) n
$$;
create function pg_temp.inbox(p_event_key text) returns text language sql stable as $$
  select string_agg(n::text || ':' || (
    select count(*) from app.notifications notification
    join app_private.notification_events event on event.id = notification.event_id
    where event.deduplication_key = p_event_key and notification.user_id = pg_temp.uid(n)), ' ' order by n)
  from generate_series(1, 11) n
$$;
create function pg_temp.notification(p_event_key text, p_user integer) returns app.notifications
language sql stable as $$
  select notification.*
  from app.notifications notification
  join app_private.notification_events event on event.id = notification.event_id
  where event.deduplication_key = p_event_key and notification.user_id = pg_temp.uid(p_user)
$$;

-- Push is switched on for one tester before anything is planned: a moment
-- planned before the switch was first turned on is never pushed.
select app_private.notification_push_configure('testers', array[pg_temp.uid(1)]);
select app_private.notification_push_set_functions_url('https://abcdefghijkl.supabase.co/functions/v1');

-- ---------------------------------------------------------------------------
-- Planning: goals
-- ---------------------------------------------------------------------------
select pg_temp.goal(1, 'g1', 1, 61);
-- a goal the scoreboard has not caught up with yet (sheet lists two, board says 1)
select pg_temp.goal(1, 'g2', 2, 62);
-- minute-20 goal, ingested now into a match at minute 80: a backfill
select pg_temp.goal(5, 'b1', 1, 20);
-- nobody follows club 3 or club 4
select pg_temp.goal(6, 'n1', 3, 61);
-- shoot-out kicks are not goals
select pg_temp.goal(7, 'p1', 1, 120, 'penalty_goal', 'penalties');
-- a goal stored long ago (the sheet adds it late): not told
select pg_temp.goal(2, 'old1', 1, 30, 'goal', 'first_half', statement_timestamp() - interval '20 minutes');
-- a fresh goal in a match that kicked off five hours ago
select pg_temp.goal(13, 'k1', 1, 30, 'goal', 'first_half');

select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  pg_temp.events(pg_temp.gkey(1, 'g1')), 1,
  'a goal the sheet lists and the scoreboard counts is planned'
);
select extensions.is(
  (select safe_payload -> 'fixture' ->> 'homeScore' || '-' || (safe_payload -> 'fixture' ->> 'awayScore')
          || ' ' || (safe_payload -> 'goal' -> 'team' -> 'name' ->> 'fr')
   from app_private.notification_events where deduplication_key = pg_temp.gkey(1, 'g1')),
  '1-0 Push Club 1',
  'with the scoreboard and the scoring club'
);
select extensions.is(
  pg_temp.events(pg_temp.gkey(1, 'g2')), 0,
  'a goal on the sheet that the scoreboard does not yet count waits'
);
select extensions.is(
  pg_temp.events('push:goal:e9500000-0000-4000-8000-00000000000' || '5:%')
    + pg_temp.events('push:goal:e9500000-0000-4000-8000-00000000000' || '6:%')
    + pg_temp.events('push:goal:e9500000-0000-4000-8000-00000000000' || '7:%')
    + pg_temp.events('push:goal:e9500000-0000-4000-8000-00000000000' || '2:%')
    + pg_temp.events('push:goal:e9500000-0000-4000-8000-0000000000' || '13:%'),
  0,
  'a backfilled goal, a match nobody follows, a shoot-out kick, a goal stored long ago and a goal in a match from five hours ago are not planned'
);

update app.fixtures set home_score = 1, away_score = 1 where id = 'e9500000-0000-4000-8000-000000000001';
select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  (select safe_payload -> 'fixture' ->> 'homeScore' || '-' || (safe_payload -> 'fixture' ->> 'awayScore')
          || ' ' || (safe_payload -> 'goal' -> 'team' -> 'name' ->> 'fr')
   from app_private.notification_events where deduplication_key = pg_temp.gkey(1, 'g2')),
  '1-1 Push Club 2',
  'once the scoreboard counts it, the goal is planned, with the score then'
);
select extensions.is(
  pg_temp.events(pg_temp.gkey(1, 'g1')) + pg_temp.events(pg_temp.gkey(1, 'g2')), 2,
  'and the first is not planned again'
);

-- A provider that drops and re-adds an event does not cause a second alert.
delete from app.match_events where fixture_id = 'e9500000-0000-4000-8000-000000000001' and provider_event_key = 'g1';
select pg_temp.goal(1, 'g1', 1, 61);
select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  (select count(*)::integer from app_private.notification_events
   where event_type = 'goal' and source_entity_id = 'e9500000-0000-4000-8000-000000000001'),
  2,
  'a goal whose row was deleted and added again is still one alert'
);

-- ---------------------------------------------------------------------------
-- Planning: the final score
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from app_private.notification_events
   where deduplication_key = 'push:full_time:e9500000-0000-4000-8000-000000000002'),
  1,
  'a match of a followed club that has just finished is planned'
);
select extensions.is(
  (select safe_payload -> 'fixture' ->> 'homeScore' || '-' || (safe_payload -> 'fixture' ->> 'awayScore')
   from app_private.notification_events
   where deduplication_key = 'push:full_time:e9500000-0000-4000-8000-000000000002'),
  '2-1',
  'with its final score'
);
select extensions.is(
  (select count(*)::integer from app_private.notification_events
   where deduplication_key in ('push:full_time:e9500000-0000-4000-8000-000000000003',
     'push:full_time:e9500000-0000-4000-8000-000000000004',
     'push:full_time:e9500000-0000-4000-8000-000000000012')),
  0,
  'a result last changed two hours ago, one from eight hours ago and one nobody follows are not'
);

-- ---------------------------------------------------------------------------
-- Planning: the 1-hour Fantasy deadline
-- ---------------------------------------------------------------------------
insert into app.fantasy_competitions(id, football_competition_id, slug, name, active)
values ('e9700000-0000-4000-8000-000000000001', 'e9100000-0000-4000-8000-000000000001',
  'push-remaining', 'Push Remaining', true);
insert into app.fantasy_seasons(id, fantasy_competition_id, football_season_id,
  ruleset_id, name, status, starts_at, ends_at)
values ('e9800000-0000-4000-8000-000000000001', 'e9700000-0000-4000-8000-000000000001',
  'e9200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Push remaining Fantasy season', 'active', current_date - 60, current_date + 200);
select pg_temp.fixture(8, 1, 2, date_trunc('minute', statement_timestamp()) + interval '2 hours 31 minutes',
  'not_started', null, null, null);
select pg_temp.fixture(9, 1, 2, date_trunc('minute', statement_timestamp()) + interval '5 hours 31 minutes',
  'not_started', null, null, null);
-- 14 starts at midnight UTC two days on: the provider's "time not known yet" placeholder.
select pg_temp.fixture(14, 1, 2, date_trunc('day', now() at time zone 'utc' + interval '2 days') at time zone 'utc',
  'not_started', null, null, null);
-- gameweek 5: deadline in 55 minutes. gameweek 6: in 3 hours. gameweek 7: in 57
-- minutes, but its first match has no confirmed time.
insert into app.fantasy_gameweeks(id, fantasy_season_id, football_round_id,
  sequence_number, name, deadline_at, starts_at, ends_at, status)
values
  ('e9900000-0000-4000-8000-000000000001', 'e9800000-0000-4000-8000-000000000001',
   'e9300000-0000-4000-8000-000000000001', 5, '5',
   date_trunc('minute', statement_timestamp()) + interval '55 minutes',
   date_trunc('minute', statement_timestamp()) + interval '2 hours 31 minutes',
   date_trunc('minute', statement_timestamp()) + interval '3 days', 'open'),
  ('e9900000-0000-4000-8000-000000000002', 'e9800000-0000-4000-8000-000000000001',
   'e9300000-0000-4000-8000-000000000002', 6, '6',
   date_trunc('minute', statement_timestamp()) + interval '3 hours',
   date_trunc('minute', statement_timestamp()) + interval '5 hours 31 minutes',
   date_trunc('minute', statement_timestamp()) + interval '4 days', 'scheduled'),
  ('e9900000-0000-4000-8000-000000000003', 'e9800000-0000-4000-8000-000000000001',
   'e9300000-0000-4000-8000-000000000003', 7, '7',
   date_trunc('minute', statement_timestamp()) + interval '57 minutes',
   date_trunc('day', now() at time zone 'utc' + interval '2 days') at time zone 'utc',
   date_trunc('minute', statement_timestamp()) + interval '6 days', 'scheduled');
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version)
select 'e9800000-0000-4000-8000-000000000001', fixture.id, gameweek.id, gameweek.id,
  fixture.kickoff_at, fixture.kickoff_at, 1
from (values
  ('e9500000-0000-4000-8000-000000000008'::uuid, 'e9900000-0000-4000-8000-000000000001'::uuid),
  ('e9500000-0000-4000-8000-000000000009'::uuid, 'e9900000-0000-4000-8000-000000000002'::uuid),
  ('e9500000-0000-4000-8000-000000000014'::uuid, 'e9900000-0000-4000-8000-000000000003'::uuid)
) as pairing(fixture_id, gameweek_id)
join app.fixtures fixture on fixture.id = pairing.fixture_id
join app.fantasy_gameweeks gameweek on gameweek.id = pairing.gameweek_id;

select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  (select string_agg(deduplication_key, ',' order by deduplication_key)
   from app_private.notification_events where event_type = 'deadline_1h'),
  'push:deadline_1h:e9900000-0000-4000-8000-000000000001',
  'a gameweek whose deadline is an hour away is planned; one three hours away, and one whose first match has no confirmed time, are not'
);

-- ---------------------------------------------------------------------------
-- Staleness
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg(label || '=' || stale::text, ' ' order by label)
   from (
     select 'goal_10' as label, app_private.notification_push_event_is_stale(event, statement_timestamp() + interval '9 minutes') as stale
     from app_private.notification_events event where event.deduplication_key = pg_temp.gkey(1, 'g1')
     union all
     select 'goal_11', app_private.notification_push_event_is_stale(event, statement_timestamp() + interval '11 minutes')
     from app_private.notification_events event where event.deduplication_key = pg_temp.gkey(1, 'g1')
     union all
     select 'full_time_29', app_private.notification_push_event_is_stale(event, statement_timestamp() + interval '29 minutes')
     from app_private.notification_events event where event.deduplication_key like 'push:full_time:%0002'
     union all
     select 'full_time_31', app_private.notification_push_event_is_stale(event, statement_timestamp() + interval '31 minutes')
     from app_private.notification_events event where event.deduplication_key like 'push:full_time:%0002'
     union all
     select 'deadline_1h_early', app_private.notification_push_event_is_stale(event, statement_timestamp() + interval '29 minutes')
     from app_private.notification_events event where event.event_type = 'deadline_1h'
     union all
     select 'deadline_1h_late', app_private.notification_push_event_is_stale(event, statement_timestamp() + interval '51 minutes')
     from app_private.notification_events event where event.event_type = 'deadline_1h'
   ) checks),
  'deadline_1h_early=false deadline_1h_late=true full_time_29=false full_time_31=true goal_10=false goal_11=true',
  'a goal is stale after ten minutes, a result after thirty, a 1-hour deadline after thirty or within five minutes of the deadline'
);

-- ---------------------------------------------------------------------------
-- The tick plans push's own moments, and only while push is on
-- ---------------------------------------------------------------------------
select app_private.notification_push_configure('off');
select pg_temp.fixture(10, 1, 3, statement_timestamp() - interval '2 hours', 'finished', null, 3, 0);
select extensions.is(app_private.notification_push_tick() ->> 'outcome', 'off', 'switched off, the tick does nothing');
select extensions.is(
  pg_temp.events('push:full_time:e9500000-0000-4000-8000-00000000000%'), 1,
  'and plans nothing'
);

select app_private.notification_push_configure('testers', array[pg_temp.uid(1)]);
create temporary table tick_testers on commit drop as
select app_private.notification_push_tick() as result;
select extensions.is(
  (select result -> 'errors' from tick_testers), '[]'::jsonb,
  'the tick runs the planner and the fan-out without error'
);
select extensions.ok(
  (select result -> 'pushPlan' is not null from tick_testers),
  'and reports what push planned'
);
select extensions.is(
  pg_temp.events('push:full_time:e9500000-0000-4000-8000-0000000000%'), 2,
  'with push on, the tick plans the result that has just finished'
);

-- ---------------------------------------------------------------------------
-- Fan-out: testers first, then everyone
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.audience(pg_temp.gkey(1, 'g1')),
  '1:2 2:0 3:0 4:0 5:0 6:0 7:0 8:0 9:0 10:0 11:0',
  'in testers mode only the tester is queued for the goal, one push per phone'
);
select extensions.is(
  (select status::text from app_private.notification_events where deduplication_key = pg_temp.gkey(1, 'g1')),
  'pending',
  'and the goal stays open, so it still reaches everyone if push goes live in time'
);

select app_private.notification_push_configure('live');
select app_private.notification_push_tick();
select extensions.is(
  pg_temp.audience(pg_temp.gkey(1, 'g1')),
  '1:2 2:0 3:0 4:1 5:0 6:0 7:0 8:1 9:1 10:1 11:1',
  'live: a fan, a follower of the visiting club and a subscriber with a phone are queued, per phone; push off, match alerts off, no interest, no phone and a switched-off phone are not'
);
select extensions.is(
  (select status::text from app_private.notification_events where deduplication_key = pg_temp.gkey(1, 'g1')),
  'completed',
  'a goal that has been through every reader is finished'
);
select extensions.is(
  (select jsonb_build_array(title, body, deep_link_target::text, deep_link_entity_id)
   from pg_temp.notification(pg_temp.gkey(1, 'g1'), 4)),
  jsonb_build_array('But !', 'Push Club 1 marque : Push Club 1 1–0 Push Club 2.', 'match_detail',
    'e9500000-0000-4000-8000-000000000001'),
  'the goal names the scorer''s club and the score, and opens the match'
);
select extensions.is(
  (select count(*)::integer from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = pg_temp.gkey(1, 'g1')
     and delivery.channel = 'in_app' and delivery.status = 'delivered'),
  6,
  'each reader''s inbox has the goal once'
);
select extensions.ok(
  (select delivery.next_retry_at > statement_timestamp() + interval '100 minutes'
   from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = pg_temp.gkey(1, 'g1')
     and notification.user_id = pg_temp.uid(8) and delivery.channel = 'push'),
  'a reader in quiet hours is queued for when they end'
);
select extensions.is(
  pg_temp.audience(pg_temp.gkey(1, 'g2')),
  '1:2 2:0 3:0 4:1 5:0 6:0 7:0 8:1 9:1 10:1 11:1',
  'the second goal reaches the same readers'
);

select extensions.is(
  pg_temp.audience('push:full_time:e9500000-0000-4000-8000-000000000002'),
  '1:2 2:0 3:0 4:0 5:0 6:0 7:0 8:1 9:1 10:1 11:0',
  'the final score reaches fans of a club in the match: not the follower of club 2 or the subscriber of match 1, who are not in this match'
);
select extensions.is(
  (select jsonb_build_array(title, body, deep_link_target::text, deep_link_entity_id)
   from pg_temp.notification('push:full_time:e9500000-0000-4000-8000-000000000002', 1)),
  jsonb_build_array('Match terminé', 'Push Club 1 2–1 Push Club 3.', 'match_detail',
    'e9500000-0000-4000-8000-000000000002'),
  'it says who played, the score, and opens the match'
);

select extensions.is(
  pg_temp.audience('push:deadline_1h:e9900000-0000-4000-8000-000000000001'),
  '1:2 2:0 3:1 4:1 5:1 6:0 7:0 8:1 9:0 10:1 11:1',
  'the 1-hour deadline follows Fantasy reminders, not match alerts or clubs: reader 3 and reader 5 get it, reader 9 (reminders off) does not'
);
select extensions.ok(
  (select body ~ '^Journée 5 : dernière chance de valider votre équipe avant [0-9]{2}:[0-9]{2}\.$'
     and title = 'Date limite Fantasy dans 1 h' and deep_link_target = 'fantasy_transfers'
   from pg_temp.notification('push:deadline_1h:e9900000-0000-4000-8000-000000000001', 5)),
  'its text names the gameweek and the time, and it opens the transfers page'
);

select extensions.is(
  (select jsonb_agg(distinct language) from app.notifications
   where notification_type in ('goal', 'full_time', 'deadline_1h')),
  '["fr"]'::jsonb,
  'rendered in the reader''s language'
);

-- Running it all again finds nobody; a phone added later is found, on the same notification.
select app_private.notification_push_tick();
select extensions.is(
  pg_temp.audience(pg_temp.gkey(1, 'g1')),
  '1:2 2:0 3:0 4:1 5:0 6:0 7:0 8:1 9:1 10:1 11:1',
  'running the tick again queues nothing new'
);

-- ---------------------------------------------------------------------------
-- Ruling a goal out. The sender has sent the goal to what is due now.
-- ---------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table sent_now on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_push_deliveries(200, 120));
select api.service_record_notification_delivery_attempt(
  (delivery ->> 'id')::uuid, 'sent', false, 'projects/test/messages/' || (delivery ->> 'id'),
  null, null, 100, null, 5, null
) from sent_now;
reset role;
select extensions.is(
  (select count(*)::integer from sent_now where delivery ->> 'type' = 'goal'),
  12,
  'the sender took the goal pushes that are due: not reader 8''s, held for quiet hours'
);

-- A phone registered after the goal was told.
select pg_temp.device(13, 1, 'android', 'fcm');

-- The provider drops the first goal from the sheet, but the scoreboard still
-- counts two goals: a gap in the sheet, not a ruling. Nothing is said.
delete from app.match_events where fixture_id = 'e9500000-0000-4000-8000-000000000001' and provider_event_key = 'g1';
select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  pg_temp.events(pg_temp.ckey(1, 'g1')), 0,
  'a goal missing from the sheet while the scoreboard still counts it is not announced as cancelled'
);

-- The scoreboard now agrees.
update app.fixtures set home_score = 0, away_score = 1 where id = 'e9500000-0000-4000-8000-000000000001';
select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  pg_temp.events(pg_temp.ckey(1, 'g1')), 1,
  'once the scoreboard agrees, the cancellation is planned'
);
select extensions.is(
  pg_temp.events('push:goal_cancelled:%'), 1,
  'and only that goal''s (the second is still on the sheet)'
);
select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  pg_temp.events('push:goal_cancelled:%'), 1,
  'planning again plans nothing new'
);

select app_private.notification_push_tick();
select extensions.is(
  pg_temp.audience(pg_temp.ckey(1, 'g1')),
  '1:2 2:0 3:0 4:1 5:0 6:0 7:0 8:0 9:1 10:1 11:1',
  'the correction goes to the phones that were told the goal: not the phone added since, and not reader 8, whose alert had not been sent'
);
select extensions.is(
  pg_temp.inbox(pg_temp.ckey(1, 'g1')),
  '1:1 2:0 3:0 4:1 5:0 6:0 7:0 8:0 9:1 10:1 11:1',
  'and only they find it in their inbox'
);
select app_private.notification_push_tick();
select extensions.is(
  (select (result -> 'fanout' ->> 'users')::integer from (select app_private.notification_push_tick() as result) ticked),
  0,
  'a phone added after a goal alert does not make the correction look unfinished'
);
select extensions.is(
  (select jsonb_build_array(title, body, deep_link_target::text, deep_link_entity_id)
   from pg_temp.notification(pg_temp.ckey(1, 'g1'), 4)),
  jsonb_build_array('But annulé', 'Le but de Push Club 1 dans Push Club 1 – Push Club 2 a été refusé.',
    'match_detail', 'e9500000-0000-4000-8000-000000000001'),
  'it says whose goal, in which match, and opens the match'
);
select extensions.is(
  (select string_agg(delivery.status::text || '/' || coalesce(delivery.stable_error_code, ''), ',')
   from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = pg_temp.gkey(1, 'g1')
     and notification.user_id = pg_temp.uid(8) and delivery.channel = 'push'),
  'cancelled/push_goal_cancelled',
  'a goal alert that had not been sent is withdrawn, so that reader never hears of the goal or its correction'
);
select extensions.is(
  (select status::text from app_private.notification_events where deduplication_key = pg_temp.ckey(1, 'g1')),
  'completed',
  'and the correction is finished once every reader has it'
);

-- The goal comes back (reinstated): it is on the match page, but not told again.
select pg_temp.goal(1, 'g1', 1, 61);
update app.fixtures set home_score = 1, away_score = 1 where id = 'e9500000-0000-4000-8000-000000000001';
select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  (select count(*)::integer from app_private.notification_events
   where event_type = 'goal' and source_entity_id = 'e9500000-0000-4000-8000-000000000001'),
  2,
  'a goal that returns after being cancelled is not told a second time'
);

-- ---------------------------------------------------------------------------
-- Two told goals ruled out one after the other; and a goal not yet sent
-- ---------------------------------------------------------------------------
select pg_temp.fixture(15, 1, 2, statement_timestamp() - interval '60 minutes', 'live_second_half', 45, 2, 0);
select pg_temp.fixture(16, 1, 2, statement_timestamp() - interval '60 minutes', 'live_second_half', 45, 1, 0);
select pg_temp.goal(15, 't1', 1, 40);
select pg_temp.goal(15, 't2', 1, 44);
select app_private.notification_push_tick();
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table sent_two on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_push_deliveries(200, 120));
select api.service_record_notification_delivery_attempt(
  (delivery ->> 'id')::uuid, 'sent', false, 'projects/test/messages/' || (delivery ->> 'id'),
  null, null, 100, null, 5, null
) from sent_two;
reset role;
-- a goal in another match, planned and queued but not yet taken by the sender
select pg_temp.goal(16, 'u1', 1, 44);
select app_private.notification_push_tick();
select extensions.is(
  (select string_agg(distinct delivery.status::text, ',')
   from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = pg_temp.gkey(16, 'u1') and delivery.channel = 'push'),
  'pending',
  'the new goal is queued and waiting for the sender'
);

delete from app.match_events where fixture_id in (
  'e9500000-0000-4000-8000-000000000015', 'e9500000-0000-4000-8000-000000000016');
update app.fixtures set home_score = 0, away_score = 0
where id in ('e9500000-0000-4000-8000-000000000015', 'e9500000-0000-4000-8000-000000000016');
select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  pg_temp.events('push:goal_cancelled:e9500000-0000-4000-8000-000000000015:%'), 1,
  'two told goals ruled out together: one correction per tick'
);
select app_private.notification_push_plan(statement_timestamp());
select extensions.is(
  pg_temp.events('push:goal_cancelled:e9500000-0000-4000-8000-000000000015:%'), 2,
  'and the next tick corrects the other, which the first did not hide'
);
select extensions.is(
  pg_temp.events('push:goal_cancelled:e9500000-0000-4000-8000-000000000016:%'), 0,
  'a goal that was never sent needs no correction'
);
select extensions.is(
  (select string_agg(distinct delivery.status::text || '/' || coalesce(delivery.stable_error_code, ''), ',')
   from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   join app_private.notification_events event on event.id = notification.event_id
   where event.deduplication_key = pg_temp.gkey(16, 'u1') and delivery.channel = 'push'),
  'cancelled/push_goal_cancelled',
  'its waiting alerts are withdrawn instead'
);

-- ---------------------------------------------------------------------------
-- A moment that is stale is closed, not pushed late
-- ---------------------------------------------------------------------------
select pg_temp.goal(1, 'late', 1, 63);
update app.fixtures set home_score = 2, away_score = 1 where id = 'e9500000-0000-4000-8000-000000000001';
select app_private.notification_push_plan(statement_timestamp());
update app_private.notification_push_settings set activated_at = statement_timestamp() - interval '1 hour';
update app_private.notification_events set
  occurred_at = statement_timestamp() - interval '20 minutes',
  received_at = statement_timestamp() - interval '20 minutes'
where deduplication_key = pg_temp.gkey(1, 'late');
select app_private.notification_push_tick();
select extensions.is(
  (select status::text || '/' || coalesce(sanitized_error_code, '') from app_private.notification_events
   where deduplication_key = pg_temp.gkey(1, 'late')),
  'cancelled/push_window_passed',
  'a goal still unqueued twenty minutes on is closed'
);
select extensions.is(
  pg_temp.audience(pg_temp.gkey(1, 'late')),
  '1:0 2:0 3:0 4:0 5:0 6:0 7:0 8:0 9:0 10:0 11:0',
  'and nobody is pushed it'
);

-- ---------------------------------------------------------------------------
-- What the sender claims first: a goal and its correction outrank a result
-- ---------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table cleared on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_push_deliveries(200, 120));
select api.service_record_notification_delivery_attempt(
  (delivery ->> 'id')::uuid, 'sent', false, 'projects/test/messages/' || (delivery ->> 'id'),
  null, null, 100, null, 5, null
) from cleared;
reset role;
select pg_temp.fixture(11, 1, 3, statement_timestamp() - interval '2 hours', 'finished', null, 1, 1);
select pg_temp.goal(1, 'last', 2, 64);
update app.fixtures set home_score = 2, away_score = 2 where id = 'e9500000-0000-4000-8000-000000000001';
select app_private.notification_push_tick();
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (select value ->> 'type' from jsonb_array_elements(api.service_claim_push_deliveries(1, 120))),
  'goal',
  'the sender takes the new goal before the results that were waiting'
);
reset role;

-- No duplicate notification for anyone.
select extensions.is(
  (select count(*)::integer from (
     select notification.user_id, notification.event_id from app.notifications notification
     group by 1, 2 having count(*) > 1) duplicated),
  0,
  'nobody has the same moment twice'
);

select * from extensions.finish();
rollback;
