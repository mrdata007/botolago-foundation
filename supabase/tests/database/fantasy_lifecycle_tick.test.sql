-- Regression suite for 20260924200100_fantasy_lifecycle_tick.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Shape and privileges.
-- ---------------------------------------------------------------------------
select extensions.is(
  (select schedule from cron.job where jobname = 'fantasy-lifecycle-tick'), '*/5 * * * *',
  'the tick is scheduled every five minutes');
select extensions.is(
  (select lifecycle_tick_enabled from app_private.fantasy_automation_settings), false,
  'the tick ships switched off');
select extensions.ok(not has_function_privilege('service_role',
  'app_private.fantasy_automation_configure(boolean)', 'execute'),
  'only the database owner can switch the tick');
select extensions.ok(not has_function_privilege('authenticated',
  'app_private.fantasy_lifecycle_tick()', 'execute'),
  'API roles cannot run the tick');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.fantasy_lifecycle_heartbeat'::regclass),
  'the heartbeat forces row security');

select extensions.is(app_private.fantasy_lifecycle_tick(), 'disabled',
  'switched off, the tick does nothing');
select extensions.is((select last_outcome from app_private.fantasy_lifecycle_heartbeat), 'disabled',
  'and still records that it ran');

-- ---------------------------------------------------------------------------
-- A two-club season whose only gameweek is open past its deadline.
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('d0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('d1000000-0000-4000-8000-000000000001', 'tick-test', 'Tick Test', 'TKT', 'league',
  'd0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'Tick season', current_date - 1, current_date + 100, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
values ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 1, 'Round 1');
insert into app.teams (id, slug, name, short_name, code, country_id)
select md5('tick-club-' || n)::uuid, 'tick-club-' || n, 'Tick Club ' || n, 'TC' || n, 'T' || n,
  'd0000000-0000-4000-8000-000000000001'
from generate_series(1, 2) n;
insert into app.players (id, slug, full_name, display_name, position)
select md5('tick-player-' || n)::uuid, 'tick-player-' || n, 'Tick Player ' || n, 'TP ' || n, 'midfielder'
from generate_series(1, 2) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('d6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'tick-test', 'Tick Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('d6300000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Tick season', 'registration_open', current_date - 1, current_date + 100);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price)
select md5('tick-fantasy-player-' || n)::uuid, 'd6300000-0000-4000-8000-000000000001',
  md5('tick-player-' || n)::uuid, md5('tick-club-' || n)::uuid,
  (select id from app.fantasy_positions where code = 'MID'), 5
from generate_series(1, 2) n;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, provider_updated_at, source_sequence)
values ('d9000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
  md5('tick-club-1')::uuid, md5('tick-club-2')::uuid,
  date_trunc('hour', now()) + interval '2 hours 17 minutes', 'not_started', now(), 1);
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status)
values ('d7000000-0000-4000-8000-000000000001', 'd6300000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001', 1, 'Round 1', now() - interval '10 minutes',
  date_trunc('hour', now()) + interval '2 hours 17 minutes',
  date_trunc('hour', now()) + interval '8 hours 17 minutes', 'open');
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version)
values ('d6300000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
  date_trunc('hour', now()) + interval '2 hours 17 minutes',
  date_trunc('hour', now()) + interval '2 hours 17 minutes', 1);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('d8000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tick@example.test', statement_timestamp(), 'hash', '{}',
  '{"username":"tick_manager"}', statement_timestamp(), statement_timestamp());
-- A team with no lineup: the lock must refuse (fantasy_lineup_missing).
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank,
  team_value, free_transfers)
values ('da000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
  'd6300000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
  'Tick Team', 10, 90, 1);

select app_private.fantasy_automation_configure(true);

-- ---------------------------------------------------------------------------
-- A refusal is recorded, counted, and does not stop later ticks.
-- ---------------------------------------------------------------------------
select extensions.is(app_private.fantasy_lifecycle_tick(), 'error',
  'a gameweek that cannot lock makes the tick report an error');
select extensions.is(app_private.fantasy_lifecycle_tick(), 'error', 'and again next time');
select extensions.is((select consecutive_failures from app_private.fantasy_lifecycle_heartbeat), 2,
  'consecutive failures are counted for alerting');
select extensions.ok((select last_error like 'gameweek 1: %fantasy_lineup_missing%'
  from app_private.fantasy_lifecycle_heartbeat),
  'the heartbeat names the gameweek and the refusal');
select extensions.is(
  (select status::text from app.fantasy_gameweeks where id = 'd7000000-0000-4000-8000-000000000001'),
  'open', 'a refused lock leaves the gameweek untouched');

-- ---------------------------------------------------------------------------
-- Once the cause is fixed, the next tick locks on the database clock.
-- ---------------------------------------------------------------------------
insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
values ('da000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 1);
select extensions.is(app_private.fantasy_lifecycle_tick(), 'ok', 'the tick recovers by itself');
select extensions.is(
  (select status::text from app.fantasy_gameweeks where id = 'd7000000-0000-4000-8000-000000000001'),
  'locked', 'an open gameweek past its deadline is locked');
select extensions.is((select count(*)::integer from app.fantasy_lineups
  where gameweek_id = 'd7000000-0000-4000-8000-000000000001' and locked_at is null), 0,
  'its lineups are locked');
select extensions.is((select consecutive_failures from app_private.fantasy_lifecycle_heartbeat), 0,
  'a good tick resets the failure count');
select extensions.is(
  (select last_details -> 'lifecycle' -> 0 ->> 'to' from app_private.fantasy_lifecycle_heartbeat),
  'locked', 'the heartbeat shows the transition it made');

-- Locked, nothing started: the next tick changes nothing.
select extensions.is(app_private.fantasy_lifecycle_tick(), 'ok', 'a quiet tick is ok');
select extensions.is(
  (select last_details -> 'lifecycle' -> 0 ->> 'waitingReason' from app_private.fantasy_lifecycle_heartbeat),
  'football_not_started', 'and waits for real football');

-- The first counting fixture starts: locked -> live.
update app.fixtures set status = 'live_first_half', period = 'first_half'
where id = 'd9000000-0000-4000-8000-000000000001';
select extensions.is(app_private.fantasy_lifecycle_tick(), 'ok', 'the kickoff tick is ok');
select extensions.is(
  (select status::text from app.fantasy_gameweeks where id = 'd7000000-0000-4000-8000-000000000001'),
  'live', 'a started counting fixture turns the gameweek live');

select app_private.fantasy_automation_configure(false);
select extensions.is(app_private.fantasy_lifecycle_tick(), 'disabled', 'the owner can pause it');

select * from extensions.finish();
rollback;
