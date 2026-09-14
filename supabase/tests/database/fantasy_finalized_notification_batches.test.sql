begin;

select extensions.no_plan();

select extensions.ok(
  has_function_privilege('service_role',
    'api.service_enqueue_gameweek_finalized_notifications(uuid,bigint,uuid,integer)', 'execute'),
  'trusted lifecycle worker can enqueue finalization events'
);
select extensions.ok(
  not has_function_privilege('anon',
    'api.service_enqueue_gameweek_finalized_notifications(uuid,bigint,uuid,integer)', 'execute')
  and not has_function_privilege('authenticated',
    'api.service_enqueue_gameweek_finalized_notifications(uuid,bigint,uuid,integer)', 'execute'),
  'browser roles cannot enqueue finalization events'
);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7)$$,
  'PT403', 'forbidden', 'service request claim is checked even with function access'
);

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('e9100000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('e9110000-0000-4000-8000-000000000001', 'finalized-notify-test',
  'Finalized Notifications', 'FNT', 'league', 'e9100000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status)
values ('e9120000-0000-4000-8000-000000000001', 'e9110000-0000-4000-8000-000000000001',
  '2020/21', '2020-08-01', '2021-06-30', 'completed');
insert into app.fantasy_competitions (id, football_competition_id, slug, name)
values ('e9130000-0000-4000-8000-000000000001', 'e9110000-0000-4000-8000-000000000001',
  'finalized-notify-test', 'Finalized Notifications');
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('e9140000-0000-4000-8000-000000000001', 'e9130000-0000-4000-8000-000000000001',
  'e9120000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2020/21', 'completed', '2020-08-01', '2021-06-30');
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, sequence_number, name, deadline_at, starts_at, ends_at,
  status, scoring_input_version
) values ('e9150000-0000-4000-8000-000000000001', 'e9140000-0000-4000-8000-000000000001',
  1, 'Gameweek 1', '2020-08-01T16:30:00Z', '2020-08-01T18:00:00Z', '2020-08-08T18:00:00Z',
  'provisional', 7);
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('e9190000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'finalized-notify-club-' || i, 'Notification Club ' || i, 'NC' || i, 'N' || lpad(i::text, 2, '0'),
  'e9100000-0000-4000-8000-000000000001'
from generate_series(1, 2) i;
insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id, kickoff_at,
  status, home_score, away_score, provider_updated_at, source_sequence, source_version, finalized_at
) values ('e91a0000-0000-4000-8000-000000000001', 'e9110000-0000-4000-8000-000000000001',
  'e9120000-0000-4000-8000-000000000001', 'e9190000-0000-4000-8000-000000000001',
  'e9190000-0000-4000-8000-000000000002', '2020-08-01T18:00:00Z',
  'finished', 1, 0, '2020-08-01T20:00:00Z', 1, 'notification-source-v1', '2020-08-01T20:00:00Z');
insert into app.fantasy_fixture_assignments (
  fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, frozen_at, source_version
) values ('e9140000-0000-4000-8000-000000000001', 'e91a0000-0000-4000-8000-000000000001',
  'e9150000-0000-4000-8000-000000000001', 'e9150000-0000-4000-8000-000000000001',
  '2020-08-01T18:00:00Z', '2020-08-01T18:00:00Z', '2020-08-01T16:30:00Z', 1);
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select ('e9160000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'finalized-notify-' || i || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'finalized_notify_' || i,
    'preferred_language', case when i = 2 then 'ar' else 'fr' end),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 3) i;
insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
)
select ('e9170000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('e9160000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'e9140000-0000-4000-8000-000000000001', 'e9150000-0000-4000-8000-000000000001',
  'Notification Team ' || i, 10, 90, 1
from generate_series(1, 3) i;
insert into app.fantasy_lineups (
  id, fantasy_team_id, gameweek_id, team_version, locked_at, finalized_at
)
select ('e9180000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('e9170000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'e9150000-0000-4000-8000-000000000001', 1, '2020-08-01T16:30:00Z', '2020-08-08T19:00:00Z'
from generate_series(1, 3) i;
insert into app.fantasy_team_gameweek_results (
  fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points, transfer_hit,
  provisional_score, final_score, state, calculation_version, finalized_at
)
select ('e9170000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'e9150000-0000-4000-8000-000000000001', 10 + i, 0, 0, 0,
  10 + i, 10 + i, 'final', 7, '2020-08-08T19:00:00Z'
from generate_series(1, 3) i;

-- This focused boundary fixture supplies the trusted scorer's seal directly;
-- scoring-worker tests cover the football facts and computation that create it.
insert into app_private.fantasy_scoring_snapshots (
  gameweek_id, calculation_version, input_digest, payload, players_persisted, sealed_at
)
select 'e9150000-0000-4000-8000-000000000001', 7,
  encode(extensions.digest(document::text, 'sha256'), 'hex'), document, true, statement_timestamp()
from (select app_private.fantasy_scoring_input_document(
  'e9150000-0000-4000-8000-000000000001') as document) input;
update app.user_preferences set push_notifications_enabled = true, email_notifications_enabled = true
where user_id = 'e9160000-0000-4000-8000-000000000001';
update app.user_preferences set notifications_enabled = false, in_app_notifications_enabled = false
where user_id = 'e9160000-0000-4000-8000-000000000002';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(null, 7)$$,
  'PT400', 'validation_failed', 'null gameweek is rejected'
);
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', null)$$,
  'PT400', 'validation_failed', 'null calculation version is rejected'
);
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7, null, 1001)$$,
  'PT400', 'validation_failed', 'oversized batch is rejected'
);
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000099', 7)$$,
  'PT404', 'fantasy_gameweek_not_found', 'unknown gameweek is rejected'
);
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7)$$,
  'PT409', 'gameweek_not_finalizable', 'final team rows do not permit pre-finalization emission'
);
reset role;
update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = '2020-08-08T20:00:00Z'
where id = 'e9150000-0000-4000-8000-000000000001';

set local role service_role;
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 8)$$,
  'PT409', 'gameweek_not_finalizable', 'finalized gameweek requires its exact calculation version'
);
reset role;
update app_private.fantasy_scoring_snapshots set sealed_at = null
where gameweek_id = 'e9150000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7)$$,
  'PT409', 'gameweek_not_finalizable', 'an unsealed scoring snapshot cannot emit final events'
);
reset role;
update app_private.fantasy_scoring_snapshots set sealed_at = statement_timestamp()
where gameweek_id = 'e9150000-0000-4000-8000-000000000001';
insert into app_private.fantasy_scoring_snapshots (
  gameweek_id, calculation_version, input_digest, payload
)
select gameweek_id, 8, input_digest, payload from app_private.fantasy_scoring_snapshots
where gameweek_id = 'e9150000-0000-4000-8000-000000000001' and calculation_version = 7;
set local role service_role;
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7)$$,
  'PT409', 'stale_update', 'a newer calculation snapshot prevents emission of an older version'
);
reset role;
delete from app_private.fantasy_scoring_snapshots
where gameweek_id = 'e9150000-0000-4000-8000-000000000001' and calculation_version = 8;
update app.fantasy_team_gameweek_results set calculation_version = 6
where fantasy_team_id = 'e9170000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7, 'e9170000-0000-4000-8000-000000000002')$$,
  'PT409', 'gameweek_not_finalizable', 'resume cursor cannot hide a stale result in an earlier team'
);
reset role;
update app.fantasy_team_gameweek_results set calculation_version = 7
where fantasy_team_id = 'e9170000-0000-4000-8000-000000000001';
select extensions.is((select count(*)::integer from app_private.notification_events
  where source_entity_id = 'e9150000-0000-4000-8000-000000000001'), 0,
  'all failed preconditions left the event queue unchanged');

set local role service_role;
select extensions.is(
  api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7, null, 2),
  '{"scanned":2,"enqueued":2,"skipped":0,"nextCursor":"e9170000-0000-4000-8000-000000000002","hasMore":true}'::jsonb,
  'first bounded page emits two events and advances to the last scanned team'
);
reset role;
update app.fixtures set source_sequence = 2, source_version = 'notification-source-v2',
  provider_updated_at = statement_timestamp()
where id = 'e91a0000-0000-4000-8000-000000000001';
select extensions.ok((select input_digest <> encode(extensions.digest(
  app_private.fantasy_scoring_input_document(gameweek_id)::text, 'sha256'), 'hex')
  from app_private.fantasy_scoring_snapshots
  where gameweek_id = 'e9150000-0000-4000-8000-000000000001' and calculation_version = 7),
  'a later provider revision changes live scoring input after finalization');
set local role service_role;
select extensions.is(
  api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7, null, 2),
  '{"scanned":2,"enqueued":0,"skipped":2,"nextCursor":"e9170000-0000-4000-8000-000000000002","hasMore":true}'::jsonb,
  'provider updates do not prevent replaying immutable final event identities'
);
select extensions.is(
  api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7, 'e9170000-0000-4000-8000-000000000002', 2),
  '{"scanned":1,"enqueued":1,"skipped":0,"nextCursor":"e9170000-0000-4000-8000-000000000003","hasMore":false}'::jsonb,
  'resume after a provider update emits remaining original final points and reports completion'
);
select extensions.is(
  api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7, 'e9170000-0000-4000-8000-000000000003', 2),
  '{"scanned":0,"enqueued":0,"skipped":0,"nextCursor":null,"hasMore":false}'::jsonb,
  'an exhausted cursor returns an empty terminal page'
);
reset role;
select extensions.is((select count(*)::integer from app_private.notification_events
  where source_entity_id = 'e9150000-0000-4000-8000-000000000001'), 3,
  'every finalized team has exactly one durable event');
select extensions.ok((select bool_and(
    event_type = 'gameweek_finalized' and source_domain = 'fantasy' and schema_version = 1
    and correlation_id = 'e9150000-0000-4000-8000-000000000001'
    and occurred_at = '2020-08-08T20:00:00Z'::timestamptz
    and id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$'
    and safe_payload = jsonb_build_object('gameweek', 1,
      'points', 10 + right(target_user_id::text, 1)::integer)
  ) from app_private.notification_events
  where source_entity_id = 'e9150000-0000-4000-8000-000000000001'),
  'events retain valid deterministic UUIDs and the existing safe template payload');
select extensions.is((select count(*)::integer from app.notifications notification
  join app_private.notification_events event on event.id = notification.event_id
  where event.source_entity_id = 'e9150000-0000-4000-8000-000000000001'), 0,
  'enqueueing does not create user notifications');
select extensions.is((select count(*)::integer from app.notification_deliveries delivery
  join app.notifications notification on notification.id = delivery.notification_id
  join app_private.notification_events event on event.id = notification.event_id
  where event.source_entity_id = 'e9150000-0000-4000-8000-000000000001'), 0,
  'enqueueing does not queue in-app, push, or email delivery even when external channels are enabled');
select set_config('test.finalized_disabled_event', (select id::text
  from app_private.notification_events where target_user_id = 'e9160000-0000-4000-8000-000000000002'
  and source_entity_id = 'e9150000-0000-4000-8000-000000000001'), true);
set local role service_role;
select extensions.ok(api.service_create_user_notification(
  current_setting('test.finalized_disabled_event')::uuid,
  'e9160000-0000-4000-8000-000000000002', '{"gameweek":1,"points":12}') is null,
  'the existing delivery gate still suppresses notifications for an opted-out user');
reset role;

-- Force a trusted-boundary conflict after an earlier candidate would be inserted.
delete from app_private.notification_events
where target_user_id = 'e9160000-0000-4000-8000-000000000001'
  and source_entity_id = 'e9150000-0000-4000-8000-000000000001';
update app_private.notification_events set safe_payload = '{"gameweek":1,"points":999}'
where target_user_id = 'e9160000-0000-4000-8000-000000000003'
  and source_entity_id = 'e9150000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.throws_ok(
  $$select api.service_enqueue_gameweek_finalized_notifications(
    'e9150000-0000-4000-8000-000000000001', 7, null, 3)$$,
  'PT409', 'fantasy_notification_conflict', 'a dedupe key with different facts fails closed'
);
reset role;
select extensions.is((select count(*)::integer from app_private.notification_events
  where source_entity_id = 'e9150000-0000-4000-8000-000000000001'), 2,
  'a conflict rolls back every insertion from the failed batch');

select * from extensions.finish();
rollback;
