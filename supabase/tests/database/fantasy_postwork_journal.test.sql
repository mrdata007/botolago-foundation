begin;

select extensions.no_plan();

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

insert into app.players (id, slug, full_name, display_name, position)
select ('e91b0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'postwork-player-' || i, 'Postwork Player ' || i, 'Player ' || i, 'goalkeeper'
from generate_series(1, 3) i;
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select ('e91c0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'e9140000-0000-4000-8000-000000000001',
  ('e91b0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'e9190000-0000-4000-8000-000000000001',
  (select id from app.fantasy_positions where code = 'GK'), 6
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

update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = '2020-08-08T20:00:00Z'
where id = 'e9150000-0000-4000-8000-000000000001';

select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.fantasy_gameweek_postwork'::regclass),
  'postwork journal enables and forces RLS');
select extensions.ok(not has_table_privilege('service_role',
  'app_private.fantasy_gameweek_postwork', 'insert,update,delete'),
  'service credentials cannot forge completion through direct journal writes');
select extensions.ok(not has_function_privilege('authenticated',
  'api.service_run_fantasy_price_batch(uuid,bigint,uuid,integer)', 'execute')
  and not has_function_privilege('anon', 'api.service_complete_fantasy_postwork(uuid,bigint)', 'execute'),
  'browser roles cannot run prices or certify postwork');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.service_complete_fantasy_postwork('e9150000-0000-4000-8000-000000000001', 7)$$,
  'PT403', 'forbidden', 'completion also checks the trusted service claim');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok(
  $$select api.service_run_fantasy_price_batch('e9150000-0000-4000-8000-000000000001', 8)$$,
  'PT409', 'gameweek_not_finalizable', 'price pass must name the exact finalized calculation');
select extensions.throws_ok(
  $$select api.service_run_fantasy_price_batch('e9150000-0000-4000-8000-000000000001', 7, null, 1001)$$,
  'PT400', 'validation_failed', 'price wrapper rejects oversized batches');
select extensions.throws_ok(
  $$select api.service_run_fantasy_price_batch('e9150000-0000-4000-8000-000000000001', 7,
    'e91c0000-0000-4000-8000-000000000002', 1)$$,
  'PT409', 'fantasy_price_cursor_invalid', 'first price request cannot skip earlier players');
reset role;
select extensions.is((select count(*)::integer from app_private.fantasy_gameweek_postwork
  where gameweek_id = 'e9150000-0000-4000-8000-000000000001'), 0,
  'a skipped first cursor leaves no durable journal');

set local role service_role;
select extensions.throws_ok(
  $$select api.service_complete_fantasy_postwork('e9150000-0000-4000-8000-000000000001', 7)$$,
  'PT409', 'fantasy_prices_incomplete', 'postwork cannot complete without the price journal');
select extensions.is(api.service_run_fantasy_price_batch(
  'e9150000-0000-4000-8000-000000000001', 7, null, 1),
  '{"updatedMemberships":0,"afterPlayerId":"e91c0000-0000-4000-8000-000000000001","hasMore":true,"stableResult":false}'::jsonb,
  'first price page records progress even when no player price changes');
reset role;
select extensions.is((select price_source_version from app_private.fantasy_gameweek_postwork
  where gameweek_id = 'e9150000-0000-4000-8000-000000000001'), 2::bigint,
  'price source version is derived from gameweek sequence, independent of calculation version');
select extensions.ok((select prices_completed_at is null and completed_at is null
  from app_private.fantasy_gameweek_postwork
  where gameweek_id = 'e9150000-0000-4000-8000-000000000001'),
  'a partial price page cannot mark completion');
set local role service_role;
select extensions.throws_ok(
  $$select api.service_run_fantasy_price_batch('e9150000-0000-4000-8000-000000000001', 7,
    'e91c0000-0000-4000-8000-000000000003', 1)$$,
  'PT409', 'fantasy_price_cursor_invalid', 'later requests cannot skip the expected cursor');
select extensions.is(api.service_run_fantasy_price_batch(
  'e9150000-0000-4000-8000-000000000001', 7, 'e91c0000-0000-4000-8000-000000000001', 1),
  '{"updatedMemberships":0,"afterPlayerId":"e91c0000-0000-4000-8000-000000000002","hasMore":true,"stableResult":false}'::jsonb,
  'second page advances by exactly one player');
select extensions.is(api.service_run_fantasy_price_batch(
  'e9150000-0000-4000-8000-000000000001', 7, 'e91c0000-0000-4000-8000-000000000001', 1),
  '{"updatedMemberships":0,"afterPlayerId":"e91c0000-0000-4000-8000-000000000002","hasMore":true,"stableResult":true}'::jsonb,
  'retrying the previous request returns its committed response');
select extensions.is(api.service_run_fantasy_price_batch(
  'e9150000-0000-4000-8000-000000000001', 7, null, 1),
  '{"updatedMemberships":0,"afterPlayerId":"e91c0000-0000-4000-8000-000000000002","hasMore":true,"stableResult":true}'::jsonb,
  'a restarted worker resumes from the durable cursor without re-running old pages');
select extensions.throws_ok(
  $$select api.service_complete_fantasy_postwork('e9150000-0000-4000-8000-000000000001', 7)$$,
  'PT409', 'fantasy_prices_incomplete', 'remaining zero-movement players still prevent completion');
select extensions.is(api.service_run_fantasy_price_batch(
  'e9150000-0000-4000-8000-000000000001', 7, 'e91c0000-0000-4000-8000-000000000002', 1),
  '{"updatedMemberships":0,"afterPlayerId":"e91c0000-0000-4000-8000-000000000003","hasMore":false,"stableResult":false}'::jsonb,
  'last successful price page reports completion');
reset role;
select extensions.ok((select prices_completed_at is not null and completed_at is null
  from app_private.fantasy_gameweek_postwork
  where gameweek_id = 'e9150000-0000-4000-8000-000000000001'),
  'the last successful page stamps price proof but not overall postwork proof');
select extensions.is((select count(*)::integer from app.fantasy_player_price_history
  where gameweek_id = 'e9150000-0000-4000-8000-000000000001'), 0,
  'zero-movement pages complete without inventing price history');
set local role service_role;
select extensions.throws_ok(
  $$select api.service_complete_fantasy_postwork('e9150000-0000-4000-8000-000000000001', 7)$$,
  'PT409', 'fantasy_notifications_incomplete', 'completed prices cannot bypass missing finalized events');
select api.service_enqueue_gameweek_finalized_notifications(
  'e9150000-0000-4000-8000-000000000001', 7, null, 2);
select extensions.throws_ok(
  $$select api.service_complete_fantasy_postwork('e9150000-0000-4000-8000-000000000001', 7)$$,
  'PT409', 'fantasy_notifications_incomplete', 'a partially emitted event page prevents overall completion');
select api.service_enqueue_gameweek_finalized_notifications(
  'e9150000-0000-4000-8000-000000000001', 7, 'e9170000-0000-4000-8000-000000000002', 2);
select extensions.is(api.service_complete_fantasy_postwork(
  'e9150000-0000-4000-8000-000000000001', 7)->>'completed', 'true',
  'all price pages and all matching finalized events certify postwork');
select extensions.is(api.service_complete_fantasy_postwork(
  'e9150000-0000-4000-8000-000000000001', 7)->>'stableResult', 'true',
  'repeating completed postwork returns durable proof');
reset role;
select extensions.ok((select completed_at is not null and completed_at >= prices_completed_at
  from app_private.fantasy_gameweek_postwork
  where gameweek_id = 'e9150000-0000-4000-8000-000000000001' and calculation_version = 7),
  'next-gameweek progression has an exact-version completion timestamp to verify');

select * from extensions.finish();
rollback;
