-- Pilot cap (20261016170000_pilot_cap.sql).
--
-- The cap ships OFF. This suite proves, in this order:
--   1. Shape: the switch is one row, OFF, max 1,000, counting rule 'teams'; no API role can read it,
--      change it or call the count; the guard lives in api.create_fantasy_team and nowhere else;
--      the function keeps its grants.
--   2. Cap OFF changes nothing: even with a tiny max_managers stored, every new team is created and
--      the advisory lock the cap takes is never held.
--   3. The count: active teams of the season, minus accounts hidden from the rankings; a suspended
--      team does not count.
--   4. Cap ON at N-1 / N / N+1: with 2 counted of a cap of 3 a new team is created (the 3rd); at 3 the
--      next is refused with PT409 fantasy_pilot_full and nothing is written; raising the cap to 4
--      lets the next one in; at 4 the next is refused again.
--   5. Existing managers are unaffected at a full cap: an idempotent replay returns the cached team,
--      a second team is still fantasy_team_already_exists (not fantasy_pilot_full), and a hidden
--      account is not refused and does not use a place.
--   6. Switching off lets the next team in even though the count has reached the number.
--      (Account erasure deletes the team row, so a place frees itself: the count is read from the
--      teams table each time, there is no counter to drift. Not exercised here: erasure has its
--      own suite, account_deletion_automatic.test.sql.)
--   7. Concurrency (the part one session cannot run): see the note before section 4. This file proves
--      the lock is taken, on the right key, only while the cap is on; the two-session race itself is
--      the manual script in docs/production/PILOT_CAP_OWNER_RUNBOOK.md ("Proving the race").
--
-- Accounts (all created the way Supabase Auth creates them):
--   A B C D   created while the cap is off. C is later hidden from the rankings, D's team suspended.
--   E         the third counted manager (the N-1 case)
--   F         refused at the cap, then let in after the cap is raised
--   G         refused at the raised cap, then let in after the cap is switched off
--   H         hidden before it has a team; creates at a full cap
--   S         the staff principal that owns the hiding rows
begin;
select extensions.no_plan();

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('c1c10000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Claims as PostgREST sets them from the Supabase Auth JWT (no second factor enrolled here).
create function pg_temp.act(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true)
$$;
-- Does this transaction hold the pilot cap's advisory lock for the season? pg_locks shows a
-- bigint advisory key as classid (high 32 bits), objid (low 32 bits), objsubid 1.
create function pg_temp.holds_pilot_lock(p_season uuid) returns boolean language sql as $$
  select exists (
    select 1 from pg_locks l
    where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted and l.objsubid = 1
      and l.classid::bigint = ((pg_catalog.hashtextextended('fantasy:pilot-cap:' || p_season::text, 0) >> 32) & 4294967295)
      and l.objid::bigint = (pg_catalog.hashtextextended('fantasy:pilot-cap:' || p_season::text, 0) & 4294967295)
  )
$$;

-- ---------------------------------------------------------------------------
-- Fixture: a six-club league with an open GW1 a day ahead.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2), 'pilot-cap-test', 'Pilot Cap Test', 'PCT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), 'Pilot season', current_date - 1, current_date + 120,
  'active', true);
insert into app.rounds (id, season_id, round_number, name)
values (pg_temp.id(4), pg_temp.id(3), 1, 'Round 1');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id(100 + i), 'pilot-cap-club-' || i, 'Pilot Club ' || i, 'PC' || i, 'P' || i,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 6) i;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id(200 + i), 'pilot-cap-player-' || i, 'Pilot Player ' || i, 'PP ' || i,
  case when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 then 'defender'::app.football_position
    when i <= 12 or i >= 16 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 18) i;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(5), pg_temp.id(2), 'pilot-cap-test', 'Pilot Cap Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id,
  ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.id(6), pg_temp.id(5), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
  'Pilot season', 'registration_open', current_date - 1, current_date + 120);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id,
  football_team_id, position_id, price)
select pg_temp.id(300 + i), pg_temp.id(6), pg_temp.id(200 + i),
  pg_temp.id(100 + ((i - 1) % 6) + 1),
  (select id from app.fantasy_positions where code = case
    when i <= 2 then 'GK' when i <= 7 then 'DEF' when i <= 12 or i >= 16 then 'MID' else 'FWD' end),
  6
from generate_series(1, 18) i;

insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id,
  away_team_id, kickoff_at, status, provider_updated_at, source_sequence)
select pg_temp.id(400 + f), pg_temp.id(2), pg_temp.id(3), pg_temp.id(4),
  pg_temp.id(100 + f * 2 - 1), pg_temp.id(100 + f * 2),
  date_trunc('hour', now()) + interval '17 minutes' + interval '1 day' + (f - 1) * interval '2 hours',
  'not_started', now(), 1
from generate_series(1, 3) f;

select api.service_sync_fantasy_calendar(pg_temp.id(6));
update app.fantasy_gameweeks set status = 'open'
where fantasy_season_id = pg_temp.id(6) and sequence_number = 1;
select set_config('test.gw1', (select id::text from app.fantasy_gameweeks
  where fantasy_season_id = pg_temp.id(6) and sequence_number = 1), true);

-- A legal 15: players 1..15 (2 GK, 5 DEF, 5 MID, 3 FWD, at most three per club), 4-4-2,
-- captain player 8, vice player 13.
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
    where fantasy_season_id = pg_temp.id(6) order by id limit 15) player
), true);

-- Accounts A..H (ids 21..28) and the staff account S (29).
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(20 + n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'pilot-cap-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'pilot_cap_' || n), statement_timestamp(), statement_timestamp()
from generate_series(1, 9) n;
-- 21 A, 22 B, 23 C, 24 D, 25 E, 26 F, 27 G, 28 H, 29 S

-- ---------------------------------------------------------------------------
-- 1. Shape
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (select enabled::text || '/' || max_managers::text || '/' || counting_rule
   from app_private.pilot_settings),
  'false/1000/teams', 'the switch ships OFF, at 1,000 managers, counting teams');
select extensions.is((select count(*)::integer from app_private.pilot_settings), 1,
  'and it is one row');
select extensions.throws_ok(
  $$insert into app_private.pilot_settings (id) values (false)$$,
  '23514', null, 'a second row is refused (singleton)');
select extensions.throws_ok(
  $$update app_private.pilot_settings set max_managers = 0$$,
  '23514', null, 'a cap below 1 is refused by the table');
select extensions.throws_ok(
  $$update app_private.pilot_settings set counting_rule = 'accounts'$$,
  '23514', null, 'and so is a counting rule other than teams (accounts would be a new migration)');
select extensions.ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'app_private' and c.relname = 'pilot_settings'),
  'row security is enabled and forced');
select extensions.ok(
  not has_table_privilege('anon', 'app_private.pilot_settings', 'select')
  and not has_table_privilege('authenticated', 'app_private.pilot_settings', 'select')
  and not has_table_privilege('service_role', 'app_private.pilot_settings', 'select')
  and not has_table_privilege('authenticated', 'app_private.pilot_settings', 'update')
  and not has_table_privilege('service_role', 'app_private.pilot_settings', 'update'),
  'no API role can read or change the switch');
select extensions.ok(not exists (
  select 1
  from unnest(array['app_private.pilot_configure(boolean,integer)',
    'app_private.pilot_manager_count(uuid)']) as f(signature)
  cross join unnest(array['public', 'anon', 'authenticated', 'service_role']) as r(role)
  where has_function_privilege(r.role, f.signature, 'execute')
), 'no API role can call the switch or the count');
select extensions.ok(
  has_function_privilege('postgres', 'app_private.pilot_configure(boolean,integer)', 'execute')
  and has_function_privilege('postgres', 'app_private.pilot_manager_count(uuid)', 'execute'),
  'the owner (postgres) can');
select extensions.ok(
  (select p.prosecdef and p.proconfig = array['search_path=""']
   from pg_proc p where p.oid = 'app_private.pilot_configure(boolean,integer)'::regprocedure),
  'the switch is security definer with an empty search path');
select extensions.ok(
  has_function_privilege('authenticated',
    'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute')
  and not has_function_privilege('anon',
    'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute')
  and not has_function_privilege('public',
    'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute'),
  'api.create_fantasy_team keeps its grants (signed-in users, not anon)');
select extensions.is(
  (select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and p.prosrc ~ 'pilot_(settings|manager_count)'),
  array['api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)'],
  'create_fantasy_team is the only API function that reads the cap: lineups, transfers, chips and reads are untouched');

-- The owner's switch: validation, and null leaves a setting as it is.
select extensions.throws_ok(
  $$select app_private.pilot_configure(null, 0)$$, 'PT400', 'validation_failed',
  'a cap below 1 is refused by the switch');
select extensions.is(
  app_private.pilot_configure(null, null),
  '{"enabled": false, "maxManagers": 1000, "countingRule": "teams"}'::jsonb,
  'null and null change nothing and report the settings');

-- ---------------------------------------------------------------------------
-- 2. Cap OFF changes nothing, even with a tiny number stored
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.pilot_configure(null, 1),
  '{"enabled": false, "maxManagers": 1, "countingRule": "teams"}'::jsonb,
  'a number alone does not switch the cap on');

select pg_temp.act(pg_temp.id(21));
set local role authenticated;
select set_config('test.team_a', api.create_fantasy_team(pg_temp.id(6), current_setting('test.gw1')::uuid,
  'Pilot Alpha', current_setting('test.selection')::jsonb, pg_temp.id(501)) ->> 'id', true);
select pg_temp.act(pg_temp.id(22));
select extensions.lives_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Bravo', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(502)),
  'cap off, 1 stored, 1 manager already counted: the second team is created');
select pg_temp.act(pg_temp.id(23));
select extensions.lives_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Charlie', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(503)),
  'and the third');
select pg_temp.act(pg_temp.id(24));
select extensions.lives_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Delta', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(504)),
  'and the fourth');
reset role;
select extensions.ok(not pg_temp.holds_pilot_lock(pg_temp.id(6)),
  'while the cap is off the season lock is never taken');
select extensions.is((select count(*)::integer from app.fantasy_teams where fantasy_season_id = pg_temp.id(6)),
  4, 'four teams exist');

-- ---------------------------------------------------------------------------
-- 3. The count
-- ---------------------------------------------------------------------------
select extensions.is(app_private.pilot_manager_count(pg_temp.id(6)), 4,
  'four active teams count');
-- C is a QA account the owner hid from the rankings; D's team is suspended.
insert into app_private.staff_principals (id, auth_user_id) values (pg_temp.id(31), pg_temp.id(29));
insert into app_private.public_ranking_exclusions (user_id, reason, created_by_principal_id)
values (pg_temp.id(23), 'QA account hidden for the pilot cap test', pg_temp.id(31)),
  (pg_temp.id(28), 'QA account hidden for the pilot cap test', pg_temp.id(31));
update app.fantasy_teams set status = 'suspended' where user_id = pg_temp.id(24);
select extensions.is(app_private.pilot_manager_count(pg_temp.id(6)), 2,
  'a hidden account''s team and a suspended team do not count: A and B are the 2');
select extensions.is(app_private.pilot_manager_count(pg_temp.id(5)), 0,
  'another season (here, none) counts its own teams only');

-- ---------------------------------------------------------------------------
-- 4. Cap ON: N-1, N, N+1
-- ---------------------------------------------------------------------------
-- Concurrency note. A session cannot race itself, so this file cannot run two creations at the same
-- moment. What it proves is the mechanism that makes the race safe: the create takes the season's
-- advisory lock before it counts (checked below through pg_locks), and the count is a fresh READ
-- COMMITTED statement taken after the lock. The lock is held to commit, so a second creator waits
-- on it, then counts the first one's committed team. The race is run for real in the runbook.
select extensions.is(
  app_private.pilot_configure(true, 3),
  '{"enabled": true, "maxManagers": 3, "countingRule": "teams"}'::jsonb,
  'the owner switches the cap on at 3 (2 counted)');

select pg_temp.act(pg_temp.id(25));
set local role authenticated;
select set_config('test.team_e', api.create_fantasy_team(pg_temp.id(6), current_setting('test.gw1')::uuid,
  'Pilot Echo', current_setting('test.selection')::jsonb, pg_temp.id(505)) ->> 'id', true);
reset role;
select extensions.ok(current_setting('test.team_e') <> '',
  'N-1: with 2 of 3 counted the next team is created (it takes the last place)');
select extensions.ok(pg_temp.holds_pilot_lock(pg_temp.id(6)),
  'and it took the season''s pilot lock, on the right key, before counting');
select extensions.is(app_private.pilot_manager_count(pg_temp.id(6)), 3, 'N: 3 of 3 counted');

select pg_temp.act(pg_temp.id(26));
set local role authenticated;
select extensions.throws_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Foxtrot', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(506)),
  'PT409', 'fantasy_pilot_full',
  'N: at 3 of 3 the next new team is refused with fantasy_pilot_full');
reset role;
select extensions.is(
  (select count(*)::integer from app.fantasy_teams where user_id = pg_temp.id(26)), 0,
  'the refused manager has no team');
select extensions.is(
  (select count(*)::integer from app_private.fantasy_idempotency_keys where user_id = pg_temp.id(26))
  + (select count(*)::integer from app_private.fantasy_mutation_audit where user_id = pg_temp.id(26)), 0,
  'and nothing was recorded for the refused attempt (no cached answer, no accepted mutation)');
select extensions.is(
  (select count(*)::integer from app.fantasy_squad_memberships m
   join app.fantasy_teams t on t.id = m.fantasy_team_id where t.user_id = pg_temp.id(26)), 0,
  'and no squad');

-- The refusal is stable: asking again does not get in.
select pg_temp.act(pg_temp.id(26));
set local role authenticated;
select extensions.throws_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Foxtrot', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(507)),
  'PT409', 'fantasy_pilot_full', 'asking again with a new key is refused the same way');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Existing managers, hidden accounts
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.id(21));
set local role authenticated;
select extensions.is(
  api.create_fantasy_team(pg_temp.id(6), current_setting('test.gw1')::uuid,
    'Pilot Alpha', current_setting('test.selection')::jsonb, pg_temp.id(501)) ->> 'id',
  current_setting('test.team_a'),
  'at a full cap an idempotent replay still returns the cached team');
select extensions.throws_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Alpha Two', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(508)),
  'PT409', 'fantasy_team_already_exists',
  'and a second team for a manager who has one is still fantasy_team_already_exists, not fantasy_pilot_full');
select extensions.is(
  jsonb_array_length(api.get_my_fantasy_team(pg_temp.id(6)) -> 'squad'), 15,
  'and an existing manager still reads their squad');
reset role;

-- H is hidden from the rankings: it neither uses a place nor is refused by the cap.
select pg_temp.act(pg_temp.id(28));
set local role authenticated;
select extensions.lives_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Hotel', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(509)),
  'a hidden test account can create a team at a full cap');
reset role;
select extensions.is(app_private.pilot_manager_count(pg_temp.id(6)), 3,
  'and still counts for nothing: 3 of 3');

-- ---------------------------------------------------------------------------
-- N+1: raise the cap
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.pilot_configure(null, 4),
  '{"enabled": true, "maxManagers": 4, "countingRule": "teams"}'::jsonb,
  'the owner raises the cap to 4 and leaves the switch on');
select pg_temp.act(pg_temp.id(26));
set local role authenticated;
select extensions.lives_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Foxtrot', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(506)),
  'with the cap raised to 4 the manager who was refused gets in (3 of 4)');
reset role;
select extensions.is(app_private.pilot_manager_count(pg_temp.id(6)), 4, '4 of 4 counted');
select pg_temp.act(pg_temp.id(27));
set local role authenticated;
select extensions.throws_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Golf', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(510)),
  'PT409', 'fantasy_pilot_full', 'at 4 of 4 the next new team is refused again');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Switching off lets the next team in
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.pilot_configure(false),
  '{"enabled": false, "maxManagers": 4, "countingRule": "teams"}'::jsonb,
  'the owner switches the cap off (the number is kept)');
select pg_temp.act(pg_temp.id(27));
set local role authenticated;
select extensions.lives_ok(
  format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Pilot Golf', %L::jsonb, %L::uuid)$$,
    pg_temp.id(6), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id(510)),
  'with the cap off the same manager is created although the count has reached the number');
reset role;
select extensions.is(app_private.pilot_manager_count(pg_temp.id(6)), 5,
  '5 managers counted, 4 stored: the stored number only bites while the switch is on');

select * from extensions.finish();
rollback;
