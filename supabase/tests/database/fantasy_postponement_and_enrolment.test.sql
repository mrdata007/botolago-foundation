-- Regression suite for 20260924190000_fantasy_postponement_and_enrolment.
--
-- Reproduces the 2026-09-24 GW1 failure path (a postponed first fixture with a
-- placeholder kickoff anchoring and then freezing the deadline, the lock
-- refusing, and new managers having no gameweek to join) and pins the rule
-- that replaced it. Every clock value is relative to the transaction start,
-- and every kickoff sits at hh:17 so none is mistaken for a 00:00 placeholder.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- A six-club league: three fixtures per round, three rounds.
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('e0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('e1000000-0000-4000-8000-000000000001', 'postponement-test', 'Postponement Test',
  'PPT', 'league', 'e0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
  'Postponement season', current_date - 1, current_date + 120, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
select ('e3000000-0000-4000-8000-00000000000' || r)::uuid,
  'e2000000-0000-4000-8000-000000000001', r, 'Round ' || r
from generate_series(1, 3) r;
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('e4' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'postponement-club-' || i, 'Postponement Club ' || i, 'PC' || i, 'P' || i,
  'e0000000-0000-4000-8000-000000000001'
from generate_series(1, 6) i;

-- Three players per club; ids sort in player-number order.
insert into app.players (id, slug, full_name, display_name, position)
select ('e5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'postponement-player-' || i, 'Postponement Player ' || i, 'PP ' || i,
  case when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 then 'defender'::app.football_position
    when i <= 12 or i >= 16 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 18) i;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('e6000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
  'postponement-test', 'Postponement Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id,
  ruleset_id, name, status, starts_at, ends_at)
values ('e6300000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Postponement season', 'registration_open', current_date - 1, current_date + 120);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id,
  football_team_id, position_id, price)
select ('e7' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'e6300000-0000-4000-8000-000000000001',
  ('e5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('e4' || lpad((((i - 1) % 6) + 1)::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  (select id from app.fantasy_positions where code = case
    when i <= 2 then 'GK' when i <= 7 then 'DEF' when i <= 12 or i >= 16 then 'MID' else 'FWD' end),
  6
from generate_series(1, 18) i;

-- Round 1 (GW1): F1 +1d, F2 +1d2h, F3 +1d4h. Round 2 (GW2): G1 +8d,
-- G2 postponed on a 00:00 placeholder, G3 +8d4h. Round 3: every fixture
-- postponed. Pairings 1v2, 3v4, 5v6 in every round.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id,
  away_team_id, kickoff_at, status, provider_updated_at, source_sequence)
select ('e9000000-0000-4000-8000-0000000000' || r || f)::uuid,
  'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
  ('e3000000-0000-4000-8000-00000000000' || r)::uuid,
  ('e4' || lpad((f * 2 - 1)::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('e4' || lpad((f * 2)::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  case
    when r = 2 and f = 2 then (date_trunc('day', (now() + interval '8 days') at time zone 'UTC') at time zone 'UTC')
    else date_trunc('hour', now()) + interval '17 minutes'
      + case r when 1 then interval '1 day' when 2 then interval '8 days' else interval '15 days' end
      + (f - 1) * interval '2 hours'
  end,
  case when (r = 2 and f = 2) or r = 3 then 'postponed'::app.fixture_status
    else 'not_started'::app.fixture_status end,
  now(), 1
from generate_series(1, 3) r cross join generate_series(1, 3) f;

create temporary table postponement_clock on commit drop as
select
  date_trunc('hour', now()) + interval '17 minutes' + interval '1 day' as f1,
  date_trunc('hour', now()) + interval '17 minutes' + interval '1 day 2 hours' as f2,
  date_trunc('hour', now()) + interval '17 minutes' + interval '1 day 4 hours' as f3,
  date_trunc('hour', now()) + interval '17 minutes' + interval '8 days' as g1;
grant select on postponement_clock to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('e8000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'postponement-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'postponement_' || n), statement_timestamp(), statement_timestamp()
from generate_series(1, 3) n;

-- A legal 15: players 1..15 (2 GK, 5 DEF, 5 MID, 3 FWD, at most three per
-- club), 4-4-2, captain player 8, vice player 13.
select set_config('test.selection', (
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id', player.id,
    'slot', case when n in (1,3,4,5,6,8,9,10,11,13,14) then 'starter' else 'bench' end,
    'slot_order', case n
      when 1 then 1 when 3 then 2 when 4 then 3 when 5 then 4 when 6 then 5
      when 8 then 6 when 9 then 7 when 10 then 8 when 11 then 9 when 13 then 10 when 14 then 11
      when 2 then 1 when 7 then 2 when 12 then 3 when 15 then 4 end,
    'captain', n = 8, 'vice_captain', n = 13
  ) order by n)::text
  from (select id, row_number() over (order by id) as n from app.fantasy_players
    where fantasy_season_id = 'e6300000-0000-4000-8000-000000000001' order by id limit 15) player
), true);

-- ---------------------------------------------------------------------------
-- Privileges of the new helpers.
-- ---------------------------------------------------------------------------
select extensions.ok(not has_function_privilege('authenticated',
  'app_private.fantasy_enrolment_gameweek(uuid)', 'execute'),
  'users cannot call the enrolment helper directly');
select extensions.ok(not has_function_privilege('service_role',
  'app_private.fantasy_defer_postponed_assignments(uuid)', 'execute'),
  'the deferral helper is reachable only through the reviewed service operations');

-- ---------------------------------------------------------------------------
-- Staging: a postponed placeholder fixture no longer blocks the next round.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.sync', api.service_sync_fantasy_calendar(
  'e6300000-0000-4000-8000-000000000001')::text, true);
select extensions.is((select count(*)::integer from app.fantasy_gameweeks
  where fantasy_season_id = 'e6300000-0000-4000-8000-000000000001'), 2,
  'next gameweek creation: rounds 1 and 2 are staged, the fully postponed round 3 is not');
select extensions.ok(
  (select round -> 'notes' @> '["all_fixtures_postponed"]'::jsonb
   from jsonb_array_elements(current_setting('test.sync')::jsonb -> 'rounds') round
   where (round ->> 'round')::integer = 3),
  'a gameweek with no valid fixtures is never staged, and says why');
select set_config('test.gw1', (select id::text from app.fantasy_gameweeks
  where fantasy_season_id = 'e6300000-0000-4000-8000-000000000001' and sequence_number = 1), true);
select set_config('test.gw2', (select id::text from app.fantasy_gameweeks
  where fantasy_season_id = 'e6300000-0000-4000-8000-000000000001' and sequence_number = 2), true);
select extensions.is(
  (select deadline_at from app.fantasy_gameweeks where id = current_setting('test.gw2')::uuid),
  (select g1 - interval '90 minutes' from postponement_clock),
  'next gameweek deadline comes from its first playable kickoff, not the postponed placeholder');
select extensions.is((select count(*)::integer from app.fantasy_fixture_assignments
  where gameweek_id = current_setting('test.gw2')::uuid and superseded_at is null and counts_points), 2,
  'the postponed fixture of the next round is not assigned');
select extensions.is(
  (select deadline_at from app.fantasy_gameweeks where id = current_setting('test.gw1')::uuid),
  (select f1 - interval '90 minutes' from postponement_clock),
  'GW1 deadline is 90 minutes before its first kickoff');

-- Registration opens GW1.
update app.fantasy_gameweeks set status = 'open' where id = current_setting('test.gw1')::uuid;

-- ---------------------------------------------------------------------------
-- Open gameweek, deadline ahead: postponements and reschedules.
-- ---------------------------------------------------------------------------
update app.fixtures set status = 'postponed' where id = 'e9000000-0000-4000-8000-000000000012';
select api.service_sync_fantasy_calendar('e6300000-0000-4000-8000-000000000001');
select extensions.is(
  (select resolution || '/' || assignment_status || '/' || counts_points::text
   from app.fantasy_fixture_assignments
   where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is not null
   order by created_at desc limit 1),
  'provider_postponed/deferred/false',
  'middle fixture postponed: its assignment is deferred with an auditable resolution');
select extensions.is(
  (select deadline_at from app.fantasy_gameweeks where id = current_setting('test.gw1')::uuid),
  (select f1 - interval '90 minutes' from postponement_clock),
  'middle fixture postponed: the deadline does not move');

update app.fixtures set status = 'not_started', kickoff_at = (select f2 + interval '1 hour' from postponement_clock)
where id = 'e9000000-0000-4000-8000-000000000012';
select api.service_sync_fantasy_calendar('e6300000-0000-4000-8000-000000000001');
select extensions.is((select count(*)::integer from app.fantasy_fixture_assignments
  where fixture_id = 'e9000000-0000-4000-8000-000000000012' and superseded_at is null and counts_points), 1,
  'a postponed fixture rescheduled inside its open gameweek counts again');

update app.fixtures set kickoff_at = (select f1 + interval '1 hour' from postponement_clock)
where id = 'e9000000-0000-4000-8000-000000000011';
select api.service_sync_fantasy_calendar('e6300000-0000-4000-8000-000000000001');
select extensions.is(
  (select deadline_at from app.fantasy_gameweeks where id = current_setting('test.gw1')::uuid),
  (select f1 + interval '1 hour' - interval '90 minutes' from postponement_clock),
  'kickoff rescheduled: the deadline follows the confirmed new first kickoff');
select extensions.is(
  (select assigned_kickoff_at from app.fantasy_fixture_assignments
   where fixture_id = 'e9000000-0000-4000-8000-000000000011' and superseded_at is null),
  (select f1 + interval '1 hour' from postponement_clock),
  'kickoff rescheduled: the assignment is realigned');

-- The production failure: the first fixture is postponed and the provider
-- drops its kickoff back to a 00:00 placeholder.
update app.fixtures set status = 'postponed',
  kickoff_at = (date_trunc('day', (now() + interval '1 day') at time zone 'UTC') at time zone 'UTC')
where id = 'e9000000-0000-4000-8000-000000000011';
select set_config('test.sync', api.service_sync_fantasy_calendar(
  'e6300000-0000-4000-8000-000000000001')::text, true);
select extensions.is(
  (select deadline_at from app.fantasy_gameweeks where id = current_setting('test.gw1')::uuid),
  (select f2 + interval '1 hour' - interval '90 minutes' from postponement_clock),
  'first fixture postponed: the deadline moves to 90 minutes before the first playable kickoff');
select extensions.ok(
  (select not (round -> 'notes' @> '["deadline_unconfirmed"]'::jsonb)
   from jsonb_array_elements(current_setting('test.sync')::jsonb -> 'rounds') round
   where (round ->> 'round')::integer = 1),
  'a postponed fixture''s placeholder kickoff no longer freezes the deadline');
select extensions.is(
  (current_setting('test.sync')::jsonb ->> 'assignmentsDeferred')::integer, 1,
  'the sync reports the deferral');

-- ---------------------------------------------------------------------------
-- Squad submitted before the deadline.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is(
  (api.fantasy_hub('fr') -> 'enrolmentGameweek' ->> 'id'), current_setting('test.gw1'),
  'before the deadline the hub offers the open gameweek');
select set_config('test.team1', api.create_fantasy_team(
  'e6300000-0000-4000-8000-000000000001', current_setting('test.gw1')::uuid, 'Before Deadline',
  current_setting('test.selection')::jsonb, 'ea000000-0000-4000-8000-000000000001') ->> 'id', true);
select extensions.ok(current_setting('test.team1') <> '', 'squad submitted before the deadline is accepted');
select set_config('request.jwt.claims',
  '{"sub":"e8000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok(
  format($$select api.create_fantasy_team('e6300000-0000-4000-8000-000000000001', %L::uuid,
    'Too Early', %L::jsonb, 'ea000000-0000-4000-8000-000000000009')$$,
    current_setting('test.gw2'), current_setting('test.selection')),
  'PT409', 'fantasy_gameweek_locked',
  'a new team cannot skip ahead of an open gameweek');
reset role;
select extensions.is(
  (select current_gameweek_id::text from app.fantasy_teams where id = current_setting('test.team1')::uuid),
  current_setting('test.gw1'), 'the early team plays from GW1');

-- ---------------------------------------------------------------------------
-- The deadline passes.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update app.fantasy_gameweeks set deadline_at = now() - interval '5 minutes'
where id = current_setting('test.gw1')::uuid;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.throws_ok(
  format($$select api.create_fantasy_team('e6300000-0000-4000-8000-000000000001', %L::uuid,
    'After Deadline', %L::jsonb, 'ea000000-0000-4000-8000-000000000002')$$,
    current_setting('test.gw1'), current_setting('test.selection')),
  'PT409', 'fantasy_gameweek_locked',
  'squad attempted after the deadline cannot enter the closed gameweek');
select extensions.is(api.fantasy_hub('fr') -> 'gameweek' ->> 'id', current_setting('test.gw1'),
  'the hub still reports the closed gameweek as current');
select extensions.is(api.fantasy_hub('fr') -> 'enrolmentGameweek' ->> 'id', current_setting('test.gw2'),
  'and offers the next gameweek to a new manager');
select extensions.is(
  (api.fantasy_hub('fr') -> 'enrolmentGameweek' ->> 'deadlineAt')::timestamptz,
  (select g1 - interval '90 minutes' from postponement_clock),
  'with the next gameweek''s real deadline');
select set_config('test.team2', api.create_fantasy_team(
  'e6300000-0000-4000-8000-000000000001', current_setting('test.gw2')::uuid, 'After Deadline',
  current_setting('test.selection')::jsonb, 'ea000000-0000-4000-8000-000000000002') ->> 'id', true);
select extensions.is(
  jsonb_array_length(api.get_my_fantasy_team('e6300000-0000-4000-8000-000000000001') -> 'squad'), 15,
  'the late manager''s squad is persisted and reads back after reload');
reset role;
select extensions.is(
  (select current_gameweek_id::text from app.fantasy_teams where id = current_setting('test.team2')::uuid),
  current_setting('test.gw2'), 'a squad submitted after the deadline joins the next gameweek');
select extensions.is((select count(*)::integer from app.fantasy_lineups
  where fantasy_team_id = current_setting('test.team2')::uuid
    and gameweek_id = current_setting('test.gw2')::uuid and locked_at is null), 1,
  'the late team holds an editable lineup for the next gameweek');

-- ---------------------------------------------------------------------------
-- Lock at the deadline with a fixture postponed since the last sync.
-- ---------------------------------------------------------------------------
update app.fixtures set status = 'postponed' where id = 'e9000000-0000-4000-8000-000000000013';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.advance', api.service_advance_fantasy_lifecycle(
  current_setting('test.gw1')::uuid,
  (select lock_version from app.fantasy_gameweeks where id = current_setting('test.gw1')::uuid),
  500)::text, true);
select extensions.is(current_setting('test.advance')::jsonb ->> 'status', 'locked',
  'a postponed fixture no longer blocks the lock at the deadline');
select extensions.is((current_setting('test.advance')::jsonb ->> 'deferredAssignments')::integer, 1,
  'the lock defers the newly postponed fixture and reports it');
select extensions.is((select count(*)::integer from app.fantasy_lineups
  where gameweek_id = current_setting('test.gw1')::uuid and locked_at is null), 0,
  'every GW1 lineup is locked');
select extensions.is((select count(*)::integer from app.fantasy_lineups
  where fantasy_team_id = current_setting('test.team2')::uuid and locked_at is null), 1,
  'the next-gameweek team is untouched by the GW1 lock');
select extensions.is((select count(*)::integer from app.fantasy_fixture_assignments
  where gameweek_id = current_setting('test.gw1')::uuid and superseded_at is null and counts_points), 1,
  'GW1 is decided by the one fixture still playable');

-- Already-started gameweek: a fixture that comes back is never re-added.
update app.fixtures set status = 'not_started',
  kickoff_at = (select f3 + interval '1 day' from postponement_clock)
where id = 'e9000000-0000-4000-8000-000000000011';
select set_config('test.sync', api.service_sync_fantasy_calendar(
  'e6300000-0000-4000-8000-000000000001')::text, true);
select extensions.ok(
  (select round -> 'notes' @> '["gameweek_locked"]'::jsonb
   from jsonb_array_elements(current_setting('test.sync')::jsonb -> 'rounds') round
   where (round ->> 'round')::integer = 1),
  'already-started gameweek: the sync leaves it alone');
select extensions.is((select count(*)::integer from app.fantasy_fixture_assignments
  where fixture_id = 'e9000000-0000-4000-8000-000000000011' and superseded_at is null), 0,
  'a fixture deferred from a locked gameweek does not return to it');

-- ---------------------------------------------------------------------------
-- A gameweek left with no valid fixture.
-- ---------------------------------------------------------------------------
update app.fixtures set status = 'postponed'
where id in ('e9000000-0000-4000-8000-000000000021', 'e9000000-0000-4000-8000-000000000023');
select set_config('test.sync', api.service_sync_fantasy_calendar(
  'e6300000-0000-4000-8000-000000000001')::text, true);
select extensions.is((select count(*)::integer from app.fantasy_fixture_assignments
  where gameweek_id = current_setting('test.gw2')::uuid and superseded_at is null and counts_points), 0,
  'every postponed fixture of the next gameweek is deferred');
select extensions.ok(
  (select round -> 'notes' @> '["no_playable_fixtures"]'::jsonb
   from jsonb_array_elements(current_setting('test.sync')::jsonb -> 'rounds') round
   where (round ->> 'round')::integer = 2),
  'the sync says the gameweek has nothing left to play');
select extensions.is(
  (select deadline_at from app.fantasy_gameweeks where id = current_setting('test.gw2')::uuid),
  (select g1 - interval '90 minutes' from postponement_clock),
  'with no playable fixture the deadline is left as it was, not invented');
select extensions.ok(
  (select (entry ->> 'noPlayableFixtures')::boolean
   from jsonb_array_elements(api.service_fantasy_deadline_watch(
     'e6300000-0000-4000-8000-000000000001', 720, 24) -> 'gameweeks') entry
   where entry ->> 'gameweekId' = current_setting('test.gw2')),
  'the deadline watch flags a gameweek with no playable fixture');
update app.fixtures set status = 'not_started'
where id in ('e9000000-0000-4000-8000-000000000021', 'e9000000-0000-4000-8000-000000000023');
select api.service_sync_fantasy_calendar('e6300000-0000-4000-8000-000000000001');
select extensions.is((select count(*)::integer from app.fantasy_fixture_assignments
  where gameweek_id = current_setting('test.gw2')::uuid and superseded_at is null and counts_points), 2,
  'fixtures published again count again');

-- ---------------------------------------------------------------------------
-- The next gameweek opens even though one of its fixtures is postponed.
-- ---------------------------------------------------------------------------
update app.fantasy_lineups set finalized_at = statement_timestamp()
where gameweek_id = current_setting('test.gw1')::uuid;
update app.fantasy_gameweeks set status = 'finalized', scoring_input_version = 1,
  points_state = 'final', finalized_at = statement_timestamp()
where id = current_setting('test.gw1')::uuid;
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
values (current_setting('test.gw1')::uuid, 1, 2,
  array(select id from app.fantasy_players where fantasy_season_id = 'e6300000-0000-4000-8000-000000000001' order by id),
  statement_timestamp(), statement_timestamp());
select extensions.is(api.service_prepare_next_fantasy_gameweek(
  current_setting('test.gw1')::uuid, current_setting('test.gw2')::uuid, 1, 100) ->> 'status', 'open',
  'next gameweek opens with its postponed fixture left out');
select extensions.is(
  (select current_gameweek_id::text from app.fantasy_teams where id = current_setting('test.team1')::uuid),
  current_setting('test.gw2'), 'the GW1 team is carried into GW2');
select extensions.is((select count(*)::integer from app.fantasy_lineups
  where gameweek_id = current_setting('test.gw2')::uuid and locked_at is null), 2,
  'both teams hold an editable GW2 lineup');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is(api.fantasy_hub('fr') -> 'enrolmentGameweek' ->> 'id', current_setting('test.gw2'),
  'once open, the next gameweek is where a new manager enrols');
reset role;

select * from extensions.finish();
rollback;
