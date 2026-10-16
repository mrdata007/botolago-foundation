-- A manager's change that passed the deadline check cannot commit after the gameweek is locked
-- (20261016180000, audit finding SEC-01, second gap).
--
-- The race needs two sessions and committed rows, and a session never waits for its own row locks, so
-- it is not in this file: it was reproduced, and the fix proven, with two sessions on a throwaway
-- PostgreSQL 16 (docs/production/FANTASY_DEADLINE_LOCK_OWNER_RUNBOOK.md, "What was and was not run").
-- This file pins, in one session, what that proof rests on:
--   1 the shape: the mutability check is VOLATILE, reads without a lock first, takes no lock in a
--     read-only transaction, then locks the gameweek row FOR KEY SHARE and checks again;
--     create_fantasy_team locks the season row, then the gameweek it joins, after its advisory locks,
--     and asks again which gameweek a squad joins; grants are unchanged;
--   2 before the deadline every manager write is accepted as before; once a team's lineup is locked
--     (between two lock-step pages, the gameweek still open) its chip can no longer change;
--   3 in a read-only transaction (how PostgREST runs the STABLE transfer preview) the preview still
--     answers: FOR KEY SHARE would be an error there;
--   4 after the deadline every write is refused with fantasy_gameweek_locked as before; the lock step
--     locks every lineup; a new squad joins the next gameweek and not the locked one.
begin;
select extensions.no_plan();

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- ---------------------------------------------------------------------------
-- World: six clubs, eighteen players, two rounds, a Fantasy season (as fantasy_postponement_and_enrolment).
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('a0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('a0', 2), 'deadline-lock-test', 'Deadline Lock Test', 'DLT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('a0', 3), pg_temp.id('a0', 2), 'Deadline lock season', current_date - 1, current_date + 120,
  'active', true);
insert into app.rounds (id, season_id, round_number, name)
select pg_temp.id('a3', r), pg_temp.id('a0', 3), r, 'Round ' || r from generate_series(1, 2) r;
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('a4', i), 'deadline-lock-club-' || i, 'Deadline Lock Club ' || i, 'DL' || i, 'D' || i,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 6) i;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id('a5', i), 'deadline-lock-player-' || i, 'Deadline Lock Player ' || i, 'DLP ' || i,
  case when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 then 'defender'::app.football_position
    when i <= 12 or i >= 16 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 18) i;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id('a6', 1), pg_temp.id('a0', 2), 'deadline-lock-test', 'Deadline Lock Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status,
  starts_at, ends_at)
values (pg_temp.id('a6', 3), pg_temp.id('a6', 1), pg_temp.id('a0', 3), 'f6100000-0000-4000-8000-000000000100',
  'Deadline lock season', 'registration_open', current_date - 1, current_date + 120);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select pg_temp.id('a7', i), pg_temp.id('a6', 3), pg_temp.id('a5', i), pg_temp.id('a4', ((i - 1) % 6) + 1),
  (select id from app.fantasy_positions where code = case
    when i <= 2 then 'GK' when i <= 7 then 'DEF' when i <= 12 or i >= 16 then 'MID' else 'FWD' end),
  6
from generate_series(1, 18) i;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at,
  status, provider_updated_at, source_sequence)
select pg_temp.id('a9', r * 10 + f), pg_temp.id('a0', 2), pg_temp.id('a0', 3), pg_temp.id('a3', r),
  pg_temp.id('a4', f * 2 - 1), pg_temp.id('a4', f * 2),
  date_trunc('hour', now()) + interval '17 minutes'
    + case r when 1 then interval '1 day' else interval '8 days' end + (f - 1) * interval '2 hours',
  'not_started', now(), 1
from generate_series(1, 2) r cross join generate_series(1, 3) f;
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id('a8', n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'deadline-lock-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'deadline_lock_' || n), statement_timestamp(), statement_timestamp()
from generate_series(1, 3) n;

-- A legal 15 (players 1..15, at most three per club), 4-4-2, vice-captain 13, captain as given.
create function pg_temp.selection(p_captain integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('fantasy_player_id', player.id,
    'slot', case when n in (1,3,4,5,6,8,9,10,11,13,14) then 'starter' else 'bench' end,
    'slot_order', case n when 1 then 1 when 3 then 2 when 4 then 3 when 5 then 4 when 6 then 5
      when 8 then 6 when 9 then 7 when 10 then 8 when 11 then 9 when 13 then 10 when 14 then 11
      when 2 then 1 when 7 then 2 when 12 then 3 when 15 then 4 end,
    'captain', n = p_captain, 'vice_captain', n = 13) order by n)
  from (select id, row_number() over (order by id) as n from app.fantasy_players
    where fantasy_season_id = pg_temp.id('a6', 3) order by id limit 15) player $$;
select set_config('test.selection', pg_temp.selection(8)::text, true);
select set_config('test.selection_b', pg_temp.selection(9)::text, true);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_sync_fantasy_calendar(pg_temp.id('a6', 3));
select set_config('test.gw1', (select id::text from app.fantasy_gameweeks
  where fantasy_season_id = pg_temp.id('a6', 3) and sequence_number = 1), true);
select set_config('test.gw2', (select id::text from app.fantasy_gameweeks
  where fantasy_season_id = pg_temp.id('a6', 3) and sequence_number = 2), true);
update app.fantasy_gameweeks set status = 'open' where id = current_setting('test.gw1')::uuid;
select extensions.ok(
  (select deadline_at > now() from app.fantasy_gameweeks where id = current_setting('test.gw1')::uuid),
  'world: gameweek 1 is open and its deadline is ahead');


-- ---------------------------------------------------------------------------
-- 1. Shape
-- ---------------------------------------------------------------------------
select extensions.is(
  (select provolatile::text from pg_proc where oid = 'app_private.fantasy_assert_mutable_gameweek(uuid)'::regprocedure),
  'v', 'the mutability check is VOLATILE (a row lock is not allowed in a STABLE function)');
select extensions.ok(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc
   where oid = 'app_private.fantasy_assert_mutable_gameweek(uuid)'::regprocedure),
  'the mutability check stays security definer with an empty search path');
select extensions.ok(
  not has_function_privilege('anon', 'app_private.fantasy_assert_mutable_gameweek(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.fantasy_assert_mutable_gameweek(uuid)', 'execute')
  and not has_function_privilege('service_role', 'app_private.fantasy_assert_mutable_gameweek(uuid)', 'execute'),
  'no API role can call the mutability check directly');
select extensions.ok(
  (select prosrc ~ 'where id = p_gameweek_id;.*statement_timestamp\(\) >= target\.deadline_at.*transaction_read_only.*where id = p_gameweek_id for key share;.*statement_timestamp\(\) >= target\.deadline_at'
   from pg_proc where oid = 'app_private.fantasy_assert_mutable_gameweek(uuid)'::regprocedure),
  'the check refuses a late call before taking any lock, skips the lock in a read-only transaction, then locks FOR KEY SHARE and checks again');
select extensions.ok(
  (select prosrc ~ 'fantasy:squads:[^;]*;\s*\n(\s*--[^\n]*\n)*\s*perform 1 from app\.fantasy_seasons where id = season\.id for key share;\s*\n\s*perform 1 from app\.fantasy_gameweeks where id = gameweek\.id for key share;\s*\n\s*gameweek := app_private\.fantasy_enrolment_gameweek\(season\.id\);\s*\n\s*if gameweek\.id is null or gameweek\.id <> requested\.id then'
   from pg_proc where oid = 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)'::regprocedure),
  'create_fantasy_team locks the season, then the gameweek it joins, after its advisory locks, and asks again which gameweek a squad joins');
select extensions.ok(
  has_function_privilege('authenticated', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute')
  and has_function_privilege('service_role', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute')
  and not has_function_privilege('anon', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute'),
  'create_fantasy_team keeps its grants');

-- ---------------------------------------------------------------------------
-- 2. Before the deadline: every manager write is accepted as before
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || pg_temp.id('a8', 1) || '","role":"authenticated"}', true);
select set_config('test.team1', api.create_fantasy_team(pg_temp.id('a6', 3), current_setting('test.gw1')::uuid,
  'Lock Test One', current_setting('test.selection')::jsonb, pg_temp.id('aa', 1)) ->> 'id', true);
select extensions.is(api.create_fantasy_team(pg_temp.id('a6', 3), current_setting('test.gw1')::uuid,
  'Lock Test One', current_setting('test.selection')::jsonb, pg_temp.id('aa', 1)) ->> 'id', current_setting('test.team1'),
  'the same squad submitted again with its key gets the same answer (idempotent, as before)');
select set_config('test.saved', (api.save_fantasy_lineup(current_setting('test.team1')::uuid,
  current_setting('test.gw1')::uuid, current_setting('test.selection_b')::jsonb, 1, pg_temp.id('ab', 1)) ->> 'version'), true);
select set_config('test.chip', (api.activate_fantasy_chip(current_setting('test.team1')::uuid,
  current_setting('test.gw1')::uuid, 'bench_boost', 2, pg_temp.id('ac', 1)) ->> 'chipType'), true);
select set_config('test.transfer', (api.confirm_fantasy_transfers(current_setting('test.team1')::uuid,
  current_setting('test.gw1')::uuid, jsonb_build_array(jsonb_build_object(
    'player_out_id', pg_temp.id('a7', 12), 'player_in_id', pg_temp.id('a7', 16))), 3, pg_temp.id('ad', 1))
  -> 'preview' ->> 'transferCount'), true);
reset role;
select extensions.ok(current_setting('test.team1') <> '', 'a squad submitted before the deadline is accepted');
select extensions.is(
  (select count(*)::integer from app.fantasy_lineups
   where fantasy_team_id = current_setting('test.team1')::uuid and gameweek_id = current_setting('test.gw1')::uuid
     and locked_at is null), 1, 'with an editable lineup for gameweek 1');
select extensions.is(current_setting('test.saved'), '2', 'a lineup save before the deadline is accepted');
select extensions.is(
  (select fp.football_player_id from app.fantasy_lineup_players lp
   join app.fantasy_lineups l on l.id = lp.lineup_id join app.fantasy_players fp on fp.id = lp.fantasy_player_id
   where l.fantasy_team_id = current_setting('test.team1')::uuid and l.gameweek_id = current_setting('test.gw1')::uuid
     and lp.captain), pg_temp.id('a5', 9), 'and the lineup is the new one');
select extensions.is(current_setting('test.chip'), 'bench_boost', 'a chip activated before the deadline is accepted');
select extensions.is(current_setting('test.transfer'), '1', 'a transfer confirmed before the deadline is accepted');

-- ---------------------------------------------------------------------------
-- 2b. Between two lock-step pages: the gameweek is still open, but this team's lineup is locked
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || pg_temp.id('a8', 3) || '","role":"authenticated"}', true);
select set_config('test.team3', api.create_fantasy_team(pg_temp.id('a6', 3), current_setting('test.gw1')::uuid,
  'Lock Test Paged', current_setting('test.selection')::jsonb, pg_temp.id('aa', 5)) ->> 'id', true);
reset role;
-- What the first page of the lock step leaves behind: this lineup locked, the gameweek still open.
update app.fantasy_lineups set locked_at = statement_timestamp()
where fantasy_team_id = current_setting('test.team3')::uuid and gameweek_id = current_setting('test.gw1')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || pg_temp.id('a8', 3) || '","role":"authenticated"}', true);
select extensions.throws_ok(format($$select api.save_fantasy_lineup(%L::uuid, %L::uuid, %L::jsonb, 1, %L::uuid)$$,
  current_setting('test.team3'), current_setting('test.gw1'), current_setting('test.selection_b'), pg_temp.id('ab', 3)),
  'PT409', 'fantasy_gameweek_locked', 'a lineup save is refused there, as it already was (its lineup check)');
select extensions.throws_ok(format($$select api.activate_fantasy_chip(%L::uuid, %L::uuid, 'bench_boost', 1, %L::uuid)$$,
  current_setting('test.team3'), current_setting('test.gw1'), pg_temp.id('ac', 3)),
  'PT409', 'fantasy_gameweek_locked',
  'and now a chip cannot be activated once the team''s lineup is locked, though the gameweek is still open');
select extensions.throws_ok(format($$select api.cancel_fantasy_chip(%L::uuid, %L::uuid, 1)$$,
  current_setting('test.team3'), current_setting('test.gw1')),
  'PT409', 'fantasy_gameweek_locked',
  'nor cancelled (it is refused before the chip is even looked up)');
reset role;
select extensions.is((select count(*)::integer from app.fantasy_chip_uses
  where fantasy_team_id = current_setting('test.team3')::uuid), 0, 'and no chip was written for that team');

-- ---------------------------------------------------------------------------
-- 3. A read-only transaction: the STABLE preview still answers
-- ---------------------------------------------------------------------------
-- The probe switches the transaction to read-only inside a block that ends in an exception, so the
-- switch is undone with it, and carries what it saw out in the message.
create function pg_temp.read_only_preview() returns text language plpgsql as $$
begin
  begin
    perform set_config('transaction_read_only', 'on', true);
    raise exception using errcode = 'P0001', message = coalesce(api.preview_fantasy_transfers(
      current_setting('test.team1')::uuid, current_setting('test.gw1')::uuid, jsonb_build_array(jsonb_build_object(
        'player_out_id', pg_temp.id('a7', 16), 'player_in_id', pg_temp.id('a7', 12))), 4) ->> 'transferCount', 'null')
      || ' in a read-only transaction: ' || current_setting('transaction_read_only');
  exception when sqlstate 'P0001' then
    return sqlerrm;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"' || pg_temp.id('a8', 1) || '","role":"authenticated"}', true);
select extensions.is(pg_temp.read_only_preview(), '1 in a read-only transaction: on',
  'the transfer preview answers in a read-only transaction (it takes no lock there)');
select extensions.is(current_setting('transaction_read_only'), 'off', 'setup: the test transaction is read-write again');

-- ---------------------------------------------------------------------------
-- 4. After the deadline: refused as before; the lock step locks every lineup
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update app.fantasy_gameweeks set deadline_at = now() - interval '1 minute'
where id = current_setting('test.gw1')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || pg_temp.id('a8', 1) || '","role":"authenticated"}', true);
select extensions.throws_ok(format($$select api.save_fantasy_lineup(%L::uuid, %L::uuid, %L::jsonb, 4, %L::uuid)$$,
  current_setting('test.team1'), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id('ab', 2)),
  'PT409', 'fantasy_gameweek_locked', 'a lineup save after the deadline is refused');
select extensions.throws_ok(format($$select api.activate_fantasy_chip(%L::uuid, %L::uuid, 'triple_captain', 4, %L::uuid)$$,
  current_setting('test.team1'), current_setting('test.gw1'), pg_temp.id('ac', 2)),
  'PT409', 'fantasy_gameweek_locked', 'a chip activation after the deadline is refused');
select extensions.throws_ok(format($$select api.cancel_fantasy_chip(%L::uuid, %L::uuid, 4)$$,
  current_setting('test.team1'), current_setting('test.gw1')),
  'PT409', 'fantasy_gameweek_locked', 'a chip cancellation after the deadline is refused');
select extensions.throws_ok(format($$select api.preview_fantasy_transfers(%L::uuid, %L::uuid, %L::jsonb, 4)$$,
  current_setting('test.team1'), current_setting('test.gw1'), jsonb_build_array(jsonb_build_object(
    'player_out_id', pg_temp.id('a7', 16), 'player_in_id', pg_temp.id('a7', 12)))::text),
  'PT409', 'fantasy_gameweek_locked', 'a transfer preview after the deadline is refused');
select extensions.throws_ok(format($$select api.confirm_fantasy_transfers(%L::uuid, %L::uuid, %L::jsonb, 4, %L::uuid)$$,
  current_setting('test.team1'), current_setting('test.gw1'), jsonb_build_array(jsonb_build_object(
    'player_out_id', pg_temp.id('a7', 16), 'player_in_id', pg_temp.id('a7', 12)))::text, pg_temp.id('ad', 2)),
  'PT409', 'fantasy_gameweek_locked', 'a transfer after the deadline is refused');
select set_config('request.jwt.claims', '{"sub":"' || pg_temp.id('a8', 2) || '","role":"authenticated"}', true);
select extensions.throws_ok(format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Lock Test Late', %L::jsonb, %L::uuid)$$,
  pg_temp.id('a6', 3), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id('aa', 2)),
  'PT409', 'fantasy_gameweek_locked', 'a squad for the closed gameweek after its deadline is refused');
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_advance_fantasy_lifecycle(current_setting('test.gw1')::uuid,
  (select lock_version from app.fantasy_gameweeks where id = current_setting('test.gw1')::uuid), 500) ->> 'status',
  'locked', 'the lock step at the deadline is unchanged: it locks the gameweek');
select extensions.is((select count(*)::integer from app.fantasy_lineups
  where gameweek_id = current_setting('test.gw1')::uuid and locked_at is null), 0, 'with every lineup of it');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || pg_temp.id('a8', 2) || '","role":"authenticated"}', true);
select extensions.throws_ok(format($$select api.create_fantasy_team(%L::uuid, %L::uuid, 'Lock Test Skip', %L::jsonb, %L::uuid)$$,
  pg_temp.id('a6', 3), current_setting('test.gw1'), current_setting('test.selection'), pg_temp.id('aa', 3)),
  'PT409', 'fantasy_gameweek_locked', 'the locked gameweek is not offered to a new squad');
select set_config('test.team2', api.create_fantasy_team(pg_temp.id('a6', 3), current_setting('test.gw2')::uuid,
  'Lock Test Next', current_setting('test.selection')::jsonb, pg_temp.id('aa', 4)) ->> 'id', true);
reset role;
select extensions.is(
  (select current_gameweek_id::text from app.fantasy_teams where id = current_setting('test.team2')::uuid),
  current_setting('test.gw2'), 'a squad submitted after the deadline joins the next gameweek, as before');
select extensions.is((select count(*)::integer from app.fantasy_lineups
  where fantasy_team_id = current_setting('test.team2')::uuid and locked_at is null), 1,
  'with an editable lineup there');

select * from extensions.finish();
rollback;
