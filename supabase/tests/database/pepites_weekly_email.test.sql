begin;

select extensions.no_plan();

-- The Pépites weekly email (20260926110000, 20260926110100): explicit opt-in,
-- the event at publication, fan-out and claim eligibility, the topic
-- unsubscribe, retry safety inside the provider's 24-hour window, priorities
-- and the account-email reserve, withdrawal, correction and the report.

create function pg_temp.uid(p_prefix text, p_n integer)
returns uuid language sql immutable as $$
  select (p_prefix || lpad(p_n::text, 12, '0'))::uuid;
$$;
create function pg_temp.user_id(p_n integer) returns uuid language sql immutable as $$
  select pg_temp.uid('d6000000-0000-4000-8000-', p_n);
$$;
-- A signed-in session for user n (no MFA factor: aal1 passes the step-up).
create function pg_temp.as_user(p_n integer) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.user_id(p_n),
    'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.fanout() returns jsonb language sql as $$
  select app_private.notification_email_fanout(statement_timestamp(), settings.mode,
    settings.test_user_ids, settings.activated_at, settings.max_emails_per_run)
  from app_private.notification_email_settings settings;
$$;
create function pg_temp.pepites_email(p_user integer, p_edition uuid)
returns app.notification_deliveries language sql as $$
  select delivery.* from app.notification_deliveries delivery
  join app.notifications notification on notification.id = delivery.notification_id
  where notification.user_id = pg_temp.user_id(p_user) and notification.source_entity_id = p_edition
    and notification.notification_type = 'pepites_weekly' and delivery.channel = 'email';
$$;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to public;

-- ===========================================================================
-- Nobody is subscribed
-- ===========================================================================
select extensions.is(
  (select count(*) from app.user_preferences where pepites_weekly_email),
  0::bigint,
  'every existing account starts with the Pépites email off'
);

-- Users: 1 fr, 2 ar, 3 never opts in, 4 email switched off, 5 address not
-- confirmed, 6 opts out later, 7 leaves by the email link, 8 opts in late,
-- 9 a guest.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
select pg_temp.user_id(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  case when n = 9 then null else 'pepites-' || n || '@example.test' end,
  case when n in (5, 9) then null else statement_timestamp() end, 'hash', '{}',
  jsonb_build_object('username', 'pepites_user_' || n,
    'preferred_language', case when n = 2 then 'ar' else 'fr' end),
  statement_timestamp(), statement_timestamp(), n = 9
from generate_series(1, 9) n;

select extensions.is(
  (select count(*) from app.user_preferences
   where user_id in (select pg_temp.user_id(n) from generate_series(1, 9) n) and not pepites_weekly_email),
  9::bigint,
  'a new account starts with it off too, although product email is on by default'
);

-- ===========================================================================
-- Opt in and out
-- ===========================================================================
set local role authenticated;
select pg_temp.as_user(1);
select extensions.is(
  api.set_my_pepites_weekly_email(true) ->> 'enabled', 'true',
  'a signed-in fan opts in'
);
select extensions.is(
  api.set_my_pepites_weekly_email(true) ->> 'enabled', 'true',
  'opting in again is harmless'
);
select extensions.is(
  api.my_pepites_weekly_email() - 'changedAt',
  '{"enabled": true, "emailReachable": true, "blockers": []}'::jsonb,
  'and can read the setting back, with whether email can reach the account'
);
-- The general preference functions leave it alone.
select api.update_my_notification_preferences(true, true, false, true, true, true, true,
  'Africa/Casablanca', false);
select api.update_my_preferences(true, true, true, 'fr');
select extensions.is(
  api.my_pepites_weekly_email() ->> 'enabled', 'true',
  'saving the other notification settings does not change it'
);
select pg_temp.as_user(3);
select api.update_my_notification_preferences(true, true, false, true, true, true, true,
  'Africa/Casablanca', false);
select extensions.is(
  api.my_pepites_weekly_email() ->> 'enabled', 'false',
  'nor switches it on for someone who never chose it'
);
select pg_temp.as_user(4);
select api.set_my_pepites_weekly_email(true);
select api.update_my_notification_preferences(true, true, false, false, true, true, true,
  'Africa/Casablanca', false);
select extensions.is(
  api.my_pepites_weekly_email() -> 'blockers', '["email_off"]'::jsonb,
  'with email switched off, the page can say why nothing will arrive'
);
select pg_temp.as_user(5);
select api.set_my_pepites_weekly_email(true);
select extensions.is(
  api.my_pepites_weekly_email() -> 'blockers', '["email_unconfirmed"]'::jsonb,
  '... or that the address is not confirmed'
);
select pg_temp.as_user(2);
select api.set_my_pepites_weekly_email(true);
select pg_temp.as_user(6);
select api.set_my_pepites_weekly_email(true);
select pg_temp.as_user(7);
select api.set_my_pepites_weekly_email(true);
select pg_temp.as_user(9);
select extensions.throws_ok(
  $$select api.set_my_pepites_weekly_email(true)$$,
  'PT403', 'notification_access_denied', 'a guest account must sign in properly first'
);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select api.set_my_pepites_weekly_email(true)$$,
  'PT401', 'notification_access_denied', 'signed out, nothing is changed'
);
reset role;
select extensions.is(
  (select count(*) from app_private.notification_operational_audit
   where actor_user_id = pg_temp.user_id(1) and event_type = 'pepites_weekly_email_opt_in'
     and metadata ->> 'source' = 'app'),
  1::bigint,
  'the opt-in is audited once (the repeat changed nothing)'
);
select extensions.ok(
  (select pepites_weekly_email_changed_at is not null from app.user_preferences
   where user_id = pg_temp.user_id(1)),
  'with the time it changed'
);

-- ===========================================================================
-- A hand-built run of 12 ranked players, and editions from it
-- ===========================================================================
insert into app.competitions (id, slug, name, competition_type)
values ('d0000000-0000-4000-8000-000000000001', 'pepites-email-league', 'Pépites Email League', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status)
values ('d0100000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
  '2026/2027', '2026-07-01', '2027-06-30', true, 'active');
insert into app.teams (id, slug, name, short_name)
values ('d0200000-0000-4000-8000-000000000001', 'pepites-email-club', 'Club Pépites', 'CP');
insert into app.team_translations (team_id, language, name, short_name)
values ('d0200000-0000-4000-8000-000000000001', 'ar', 'نادي المواهب', 'المواهب');
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.uid('d0300000-0000-4000-8000-', n), 'pepites-email-player-' || n,
  'Pepite Player ' || n, 'P. Joueur ' || n, 'midfielder'
from generate_series(1, 12) n;
insert into app.pepites_runs (id, season_id, kind, as_of_round_number, methodology_version, revision, input_cutoff_at)
values ('d0400000-0000-4000-8000-000000000001', 'd0100000-0000-4000-8000-000000000001',
  'weekly', 5, 'v1', 1, '2026-10-01T00:00:00Z');
insert into app.pepites_player_scores (run_id, player_id, team_id, position_group, age_years, apps,
  starts, minutes, goals, assists, saves, clean_sheets, rating_avg, rating_n, form_avg, eligible,
  per90, percentiles, components, flags, score_exact, score, rank, rank_in_position)
select 'd0400000-0000-4000-8000-000000000001', pg_temp.uid('d0300000-0000-4000-8000-', n),
  'd0200000-0000-4000-8000-000000000001', 'MID', 20, 5, 5, 450, 1, 1, null, null, 7.0, 5, 7.0, true,
  '{}', '{}', '{}', '{}', 90 - n * 2.25, round(90 - n * 2.25)::smallint, n, n
from generate_series(1, 12) n;
update app.pepites_runs set status = 'succeeded', finished_at = now(), eligible_count = 12,
  ranked_count = 12, input_fingerprint = repeat('0', 64)
where id = 'd0400000-0000-4000-8000-000000000001';
select app_private.pepites_configure('staff', false, 'd0000000-0000-4000-8000-000000000001');

create function pg_temp.publish_week(p_on date) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  v_id := app_private.pepites_create_draft('d0400000-0000-4000-8000-000000000001', p_on, null);
  perform app_private.pepites_schedule(v_id, now(), 'd9000000-0000-4000-8000-000000000001');
  perform app_private.pepites_publish_edition(v_id, 'd9000000-0000-4000-8000-000000000001');
  return v_id;
end;
$$;

-- Product email live for everyone from now.
select app_private.notification_email_configure('live', 'http://kong:8000/functions/v1', null, null,
  null, 100, null, 10);

-- Staff preview: publication emails nobody.
insert into ids select 'staff-edition', pg_temp.publish_week('2026-10-05');
select extensions.is(
  (select count(*) from app_private.notification_events
   where event_type = 'pepites_weekly' and source_entity_id = (select id from ids where name = 'staff-edition')),
  0::bigint,
  'an edition published while Pépites is in staff preview writes no email event'
);

-- Public: one event, keyed by the edition, with its fixed payload.
select app_private.pepites_configure('public', null);
insert into ids select 'edition', pg_temp.publish_week('2026-10-12');
select app_private.pepites_publish_edition((select id from ids where name = 'edition'), null);
select extensions.is(
  (select count(*) from app_private.notification_events
   where event_type = 'pepites_weekly' and source_entity_id = (select id from ids where name = 'edition')
     and deduplication_key = 'pepites-weekly:' || (select id from ids where name = 'edition')),
  1::bigint,
  'a public publication writes one event, keyed pepites-weekly:<edition>, even if published twice'
);
select extensions.ok(
  (select safe_payload ->> 'week' = '16' and safe_payload ->> 'round' = '5'
     and jsonb_array_length(safe_payload -> 'entries') = 10
     and safe_payload #>> '{entries,0,name}' = 'P. Joueur 1'
     and safe_payload #>> '{entries,0,club,name,ar}' = 'نادي المواهب'
     and safe_payload #> '{entries,0,score}' = '88'::jsonb
     and safe_payload #> '{entries,9,rank}' = '10'::jsonb
     and safe_payload ->> 'correctsEditionId' is null
   from app_private.notification_events
   where event_type = 'pepites_weekly' and source_entity_id = (select id from ids where name = 'edition')),
  'its payload carries the week, the round and the ten entries (name, club in both languages, rank, score)'
);

-- ===========================================================================
-- Fan-out
-- ===========================================================================
select pg_temp.fanout();
select extensions.is(
  (select array_agg(n order by n) from generate_series(1, 9) n
   where (pg_temp.pepites_email(n, (select id from ids where name = 'edition'))).id is not null),
  array[1, 2, 6, 7],
  'the email is queued for the opted-in readers email can reach: not the one who never chose it, not email off, not unconfirmed'
);
select extensions.is(
  (select title from app.notifications
   where user_id = pg_temp.user_id(2) and source_entity_id = (select id from ids where name = 'edition')),
  'Pépites: توب 10 للأسبوع 16',
  'the Arabic reader''s in-app copy is in Arabic'
);
select pg_temp.fanout();
select extensions.is(
  (select count(*) from app.notifications
   where notification_type = 'pepites_weekly' and source_entity_id = (select id from ids where name = 'edition')),
  4::bigint,
  'a second fan-out adds nobody twice'
);

-- Opting out cancels what has not gone out.
set local role authenticated;
select pg_temp.as_user(6);
select api.set_my_pepites_weekly_email(false);
reset role;
select extensions.is(
  (select status::text || ':' || stable_error_code from pg_temp.pepites_email(6, (select id from ids where name = 'edition'))),
  'cancelled:pepites_opted_out',
  'opting out cancels the unsent Pépites email'
);
select extensions.ok(
  exists (select 1 from app_private.notification_operational_audit
    where actor_user_id = pg_temp.user_id(6) and event_type = 'pepites_weekly_email_opt_out'
      and metadata ->> 'source' = 'app'),
  'and is audited'
);

-- ===========================================================================
-- Priorities and the account-email reserve
-- ===========================================================================
-- A round preview waiting too (every reader with match alerts on).
select app_private.notification_email_enqueue('round_preview', 'football',
  'd0500000-0000-4000-8000-000000000001', 'round-preview:pepites-email-test',
  '{"round": {"id": "d0500000-0000-4000-8000-000000000001", "number": 6, "name": "Journée 6"}, "fixtures": []}',
  statement_timestamp());
select pg_temp.fanout();
-- One email left today above the reserve of 10.
select app_private.notification_email_configure('live', null, null, null, null, 11, null, 10);
set local role service_role;
select pg_temp.as_service();
create temporary table claim_1 on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_email_deliveries(50, 120));
reset role;
select extensions.is(
  (select array_agg(delivery ->> 'type') from claim_1),
  array['round_preview'],
  'with one email left, an existing type goes before Pépites'
);
set local role service_role;
select pg_temp.as_service();
select extensions.is(api.service_claim_email_deliveries(50, 120), '[]'::jsonb,
  'and Pépites never spends the account-email reserve');
select api.service_record_notification_delivery_attempt((select (delivery ->> 'id')::uuid from claim_1),
  'sent', false, 'resend-rp');
reset role;
select extensions.is(
  (select topic from app_private.notification_email_unsubscribe_tokens
   where delivery_id = (select (delivery ->> 'id')::uuid from claim_1)),
  null::text,
  'the round preview''s unsubscribe token has no topic: it still turns off all email'
);

-- ===========================================================================
-- Claim
-- ===========================================================================
select app_private.notification_email_configure('live', null, null, null, null, 100, null, 10);
set local role service_role;
select pg_temp.as_service();
create temporary table claim_2 on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_email_deliveries(50, 120))
where value ->> 'type' = 'pepites_weekly';
reset role;
select extensions.is(
  (select array_agg(delivery -> 'recipient' ->> 'email' order by delivery -> 'recipient' ->> 'email') from claim_2),
  array['pepites-1@example.test', 'pepites-2@example.test', 'pepites-7@example.test'],
  'the claim hands out the three Pépites emails still wanted'
);
select extensions.ok(
  (select bool_and(delivery ->> 'unsubscribeTopic' = 'pepites_weekly'
     and delivery ->> 'firstAttemptAt' is not null
     and delivery ->> 'bodySha256' is null
     and jsonb_array_length(delivery -> 'payload' -> 'entries') = 10)
   from claim_2),
  'each with the stored payload, its first attempt time, no body yet, and a Pépites unsubscribe topic'
);
select extensions.is(
  (select delivery ->> 'language' from claim_2 where delivery -> 'recipient' ->> 'email' = 'pepites-2@example.test'),
  'ar', 'the Arabic reader is emailed in Arabic'
);
select extensions.is(
  (select count(*) from app_private.notification_email_unsubscribe_tokens token
   join claim_2 on (claim_2.delivery ->> 'id')::uuid = token.delivery_id
   where token.topic = 'pepites_weekly'),
  3::bigint,
  'their unsubscribe tokens are stored with the Pépites topic'
);
insert into ids select 'd1', (delivery ->> 'id')::uuid from claim_2 where delivery -> 'recipient' ->> 'email' = 'pepites-1@example.test';
insert into ids select 'd2', (delivery ->> 'id')::uuid from claim_2 where delivery -> 'recipient' ->> 'email' = 'pepites-2@example.test';
insert into ids select 'd7', (delivery ->> 'id')::uuid from claim_2 where delivery -> 'recipient' ->> 'email' = 'pepites-7@example.test';

-- ===========================================================================
-- Retry safety
-- ===========================================================================
set local role service_role;
select pg_temp.as_service();
select api.service_record_notification_delivery_attempt((select id from ids where name = 'd1'),
  'sent', false, 'resend-1', p_body_sha256 := repeat('a', 64));
-- Reader 2: the provider may have accepted it, the answer was lost.
select api.service_record_notification_delivery_attempt((select id from ids where name = 'd2'),
  'retryable_failure', true, null, 'delivery_timeout', p_body_sha256 := repeat('b', 64));
-- Reader 7: refused outright (rate limit): certainly not sent.
select api.service_record_notification_delivery_attempt((select id from ids where name = 'd7'),
  'retryable_failure', true, null, 'delivery_rate_limited', p_body_sha256 := repeat('c', 64));
select extensions.throws_ok(
  format($$select api.service_record_notification_delivery_attempt(%L, 'sent', false, p_body_sha256 := 'nope')$$,
    (select id from ids where name = 'd7')),
  'PT400', 'invalid_notification_delivery', 'a malformed body hash is refused'
);
reset role;
update app.notification_deliveries set next_retry_at = statement_timestamp() - interval '1 second'
where id in ((select id from ids where name = 'd2'), (select id from ids where name = 'd7'));
set local role service_role;
select pg_temp.as_service();
create temporary table claim_3 on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_email_deliveries(50, 120));
reset role;
select extensions.is(
  (select delivery ->> 'bodySha256' || '/' || (delivery ->> 'firstAttemptAt' = (select delivery ->> 'firstAttemptAt'
     from claim_2 where delivery ->> 'id' = claim_3.delivery ->> 'id'))::text
   from claim_3 where (delivery ->> 'id')::uuid = (select id from ids where name = 'd2')),
  repeat('b', 64) || '/true',
  'an hour later the unsure email is retried with its first body hash and its first attempt time'
);
set local role service_role;
select pg_temp.as_service();
select api.service_record_notification_delivery_attempt((select id from ids where name = 'd2'),
  'retryable_failure', true, null, 'delivery_network_error', p_body_sha256 := repeat('b', 64));
select api.service_record_notification_delivery_attempt((select id from ids where name = 'd7'),
  'retryable_failure', true, null, 'delivery_rate_limited', p_body_sha256 := repeat('c', 64));
reset role;
-- A day after the first attempt: past the provider's window.
update app.notification_deliveries set next_retry_at = statement_timestamp() - interval '1 second',
  first_claimed_at = statement_timestamp() - interval '24 hours'
where id in ((select id from ids where name = 'd2'), (select id from ids where name = 'd7'));
set local role service_role;
select pg_temp.as_service();
create temporary table claim_4 on commit drop as
select value as delivery from jsonb_array_elements(api.service_claim_email_deliveries(50, 120));
reset role;
select extensions.is(
  (select status::text || ':' || stable_error_code from app.notification_deliveries
   where id = (select id from ids where name = 'd2')),
  'cancelled:possibly_sent',
  'after 23 hours an email that may have gone out is not sent again: closed as possibly_sent'
);
select extensions.ok(
  exists (select 1 from claim_4 where (delivery ->> 'id')::uuid = (select id from ids where name = 'd7'))
  and not exists (select 1 from claim_4 where (delivery ->> 'id')::uuid = (select id from ids where name = 'd2')),
  'an email the provider refused outright is still retried: it was never sent'
);
set local role service_role;
select pg_temp.as_service();
-- The dispatcher refuses to send a body that differs from the first one.
select extensions.is(
  api.service_record_notification_delivery_attempt((select id from ids where name = 'd7'),
    'cancelled', false, null, 'delivery_body_changed', p_body_sha256 := repeat('d', 64))::text,
  'cancelled',
  'a retry whose body changed is closed, not dead-lettered and not sent'
);
reset role;

-- ===========================================================================
-- Report
-- ===========================================================================
select extensions.is(
  app_private.pepites_email_report((select id from ids where name = 'edition')) - 'editionId' - 'event',
  '{"total": 4, "queued": 0, "sent": 1, "deferred": 0, "expired": 0, "possiblySent": 1, "failed": 0,
    "cancelled": {"pepites_opted_out": 1, "delivery_body_changed": 1}}'::jsonb,
  'the report counts the edition''s emails: sent, possibly sent, and cancelled by reason'
);

-- ===========================================================================
-- The Pépites unsubscribe link
-- ===========================================================================
-- Reader 1 got the email; their link turns off Pépites only.
select set_config('pepites_test.token', app_private.notification_email_unsubscribe_token(
  (select id from ids where name = 'd1')), true);
set local role anon;
select extensions.is(
  api.unsubscribe_notification_email(current_setting('pepites_test.token')),
  '{"status": "unsubscribed", "topic": "pepites_weekly"}'::jsonb,
  'the link in a Pépites email unsubscribes from Pépites, signed out'
);
select extensions.is(
  api.unsubscribe_notification_email(current_setting('pepites_test.token')),
  '{"status": "already_unsubscribed", "topic": "pepites_weekly"}'::jsonb,
  'using it twice is harmless'
);
reset role;
select extensions.ok(
  (select not pepites_weekly_email and email_notifications_enabled and pepites_weekly_email_changed_at is not null
   from app.user_preferences where user_id = pg_temp.user_id(1)),
  'Pépites is off; every other email stays on'
);
select extensions.ok(
  exists (select 1 from app_private.notification_operational_audit
    where actor_user_id = pg_temp.user_id(1) and event_type = 'pepites_weekly_email_opt_out'
      and metadata ->> 'source' = 'email_link'),
  'the opt-out is audited as coming from the email link'
);
select extensions.is(
  (select count(*) from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   where notification.user_id = pg_temp.user_id(1) and notification.notification_type = 'round_preview'
     and delivery.channel = 'email' and delivery.status <> 'cancelled'),
  1::bigint,
  'and the reader''s other email (the round preview) is not cancelled'
);

-- ===========================================================================
-- Correction: only to readers who have no email for that week
-- ===========================================================================
set local role authenticated;
select pg_temp.as_user(8);
select api.set_my_pepites_weekly_email(true);
select pg_temp.as_user(1);
select api.set_my_pepites_weekly_email(true);
reset role;
insert into ids select 'correction', app_private.pepites_create_correction(
  (select id from ids where name = 'edition'), 'd9000000-0000-4000-8000-000000000001');
select app_private.pepites_schedule((select id from ids where name = 'correction'), now(),
  'd9000000-0000-4000-8000-000000000001');
select app_private.pepites_publish_edition((select id from ids where name = 'correction'),
  'd9000000-0000-4000-8000-000000000001');
select pg_temp.fanout();
select extensions.is(
  (select array_agg(n order by n) from generate_series(1, 9) n
   where (pg_temp.pepites_email(n, (select id from ids where name = 'correction'))).id is not null),
  array[7, 8],
  'the correction goes only to opted-in readers with no email for that week: not 1 (sent) nor 2 (possibly sent); 7 (never sent) and 8 (opted in since) get it'
);

-- ===========================================================================
-- Withdrawal, Pépites switched off, staleness
-- ===========================================================================
insert into ids select 'next', pg_temp.publish_week('2026-10-19');
select pg_temp.fanout();
select extensions.is(
  (select count(*) from app.notifications
   where notification_type = 'pepites_weekly' and source_entity_id = (select id from ids where name = 'next')),
  4::bigint,
  'the next week is queued for the four readers opted in now'
);
select app_private.pepites_withdraw((select id from ids where name = 'next'), 'Erreur de classement confirmée',
  'd9000000-0000-4000-8000-000000000001');
select extensions.is(
  (select array_agg(distinct delivery.status::text || ':' || delivery.stable_error_code)
   from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   where notification.source_entity_id = (select id from ids where name = 'next') and delivery.channel = 'email'),
  array['cancelled:pepites_edition_not_current'],
  'withdrawing the edition cancels its unsent emails'
);
insert into ids select 'unfanned', pg_temp.publish_week('2026-10-26');
select app_private.pepites_withdraw((select id from ids where name = 'unfanned'), 'Erreur de classement confirmée',
  'd9000000-0000-4000-8000-000000000001');
select extensions.is(
  (select status::text || ':' || sanitized_error_code from app_private.notification_events
   where event_type = 'pepites_weekly' and source_entity_id = (select id from ids where name = 'unfanned')),
  'cancelled:pepites_edition_not_current',
  'an edition withdrawn before its fan-out has its event cancelled'
);

insert into ids select 'later', pg_temp.publish_week('2026-11-02');
select pg_temp.fanout();
select app_private.pepites_configure('staff', null);
set local role service_role;
select pg_temp.as_service();
select api.service_claim_email_deliveries(50, 120);
reset role;
select extensions.is(
  (select array_agg(distinct delivery.status::text || ':' || delivery.stable_error_code)
   from app.notification_deliveries delivery
   join app.notifications notification on notification.id = delivery.notification_id
   where notification.source_entity_id = (select id from ids where name = 'later') and delivery.channel = 'email'),
  array['cancelled:pepites_unavailable'],
  'with Pépites no longer public, waiting Pépites email is cancelled at claim, never sent'
);

select extensions.ok(
  (select not app_private.notification_email_event_is_stale(event, event.occurred_at + interval '35 hours')
     and app_private.notification_email_event_is_stale(event, event.occurred_at + interval '37 hours')
   from app_private.notification_events event
   where event.event_type = 'pepites_weekly' and event.source_entity_id = (select id from ids where name = 'edition')),
  'a Pépites email is stale 36 hours after publication'
);

-- ===========================================================================
-- Grants
-- ===========================================================================
select extensions.ok(
  not has_function_privilege('anon', 'api.set_my_pepites_weekly_email(boolean)', 'execute')
  and not has_function_privilege('anon', 'api.my_pepites_weekly_email()', 'execute')
  and has_function_privilege('authenticated', 'api.set_my_pepites_weekly_email(boolean)', 'execute')
  and not has_function_privilege('authenticated',
    'api.service_record_notification_delivery_attempt(uuid, text, boolean, text, text, text, integer, integer, integer, integer, text)', 'execute')
  and has_function_privilege('service_role',
    'api.service_record_notification_delivery_attempt(uuid, text, boolean, text, text, text, integer, integer, integer, integer, text)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.pepites_email_report(uuid)', 'execute'),
  'the preference is for signed-in fans; recording attempts is the service''s; the report is not a client''s'
);

select * from extensions.finish();
rollback;
