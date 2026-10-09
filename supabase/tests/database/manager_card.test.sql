-- Manager Card (BG-0158): constraints, grants, row security, the switch, the
-- tick, the calculation (CAP, SEL, TRF, CON, OVR, tier), the reads and the acknowledgement,
-- deletion, the permanent number, the erase lock and the prune.
-- Migrations 20261008123000 .. 20261009100200.
--
-- THE FIXTURE. One Fantasy season (S1, football season label "2089/90")
-- with six gameweeks, and an earlier season S0 ("2088/89"):
--   GW1, GW2, GW3, GW5  finalized, final, postwork complete  -> evaluable
--   GW4                 cancelled (a postwork row exists and A has a "final"
--                       result there; neither may count)
--   GW6                 scheduled until "stage B", when it is finalized
-- Deadlines are 2089-09-01 10:00 UTC + 7 days per gameweek number; the rules
-- row (placeholder numbers, inserted by this test only: the migrations ship
-- none) ignores CAP before 2089-09-05, so GW1 never counts for CAP.
--
-- PLACEHOLDER RULES (config of rules v1)
--   minimum_gameweeks 3, provisional_below 5, trf_window_gameweeks 3
--   scales: cap, sel, con  [[0,0],[1,100]]   score = 100 x raw
--           trf            [[-10,0],[10,100]] score = 50 + 5 x raw
--           (rounded half up, kept in 1..99)
--   tiers: stade 50, pro 65, champion 78, legend 88 (below 50 is homa)
--
-- PLAYERS. 1-2 GK, 3-7 DEF, 8-12 MID, 13-15 FWD, 16 DEF, 17 MID, 18 FWD;
-- 19-33 "scrubs" (19-20 GK, 21-25 DEF, 26-30 MID, 31-33 FWD) who score 0 or
-- less. Points (final_points) per gameweek, players 1..18 in order:
--   GW1  2 1 4 2 6 1 0 8 3 2 5 1 12 0 2 3 1 4      (all 90 minutes)
--   GW2  3 0 2 5 12 1 2 10 4 6 7 0 0 0 8 4 5 1     (players 12, 13, 14: 0 minutes)
--   GW3  6 1 1 3 4 2 5 7 9 2 1 3 5 6 0 1 3 8       (player 15: 0 minutes)
--   GW5  4 2 6 1 3 10 2 5 -2 8 4 6 7 1 9 0 5 3
--   GW6  3 5 1 4 2 0 7 6 3 1 2 9 4 5 1 8 3 6
--   scrubs: 0, except GW3: 19, 21, 26, 31 score -1; GW5: 19 and 24 score -1.
-- A "standard" lineup is the 4-3-3: GK 1; DEF 3 4 5 6; MID 8 9 10; FWD 13 14
-- 15; bench 2 7 11 12. Only final_score (CON), starting_points and chip_type
-- (SEL) and scoring_details (CAP) are read by the card, so final_score is set
-- directly to design the rankings; starting_points is the sum of the
-- starters' points.
--
-- MANAGERS (U = user, T = Fantasy team in S1)
--   A  Amina Test, handle amina_mc, favourite club MC Club (French short
--      name only). Transfers; GW2 captain absent (vice promoted); GW5
--      Triple Captain. Alters her XI after transfers.
--   B  Brahim Test, favourite club Deux (French and Arabic names). Never
--      transfers. GW2 Bench Boost with captain and vice both absent; GW3 a
--      scoring_details effectiveCaptainId that disagrees; GW5 captain on -2.
--   C  Chaimae Test, no favourite club. A Free Hit batch and a reversed
--      batch only. GW3 lineup of nothing but scrubs; GW5 scrub starters.
--   D  Dina Test, profile marked deleted (waiting to be erased).
--   E  Elias Test, staff; team suspended (left out of every ranking).
--   F  Fatima Test (fatima@botolago.com); results in GW3 and GW5 only; has a
--      saved card for S0.
--   G  blank display name, no handle, no club; a Wildcard batch.
--   X, Y, Z  accounts with no Fantasy team. Y has a verified MFA factor.
--
-- FINAL SCORES (CON). "n" counts the active teams that week (E is
-- suspended and left out; D is deleted-pending but still an active team and
-- counts). A team is in the top half when fewer than n/2 teams scored strictly
-- more (ties count in the manager's favour): above x 2 < n.
--   GW1  D 70, A 60, B 60, C 50, G 40  (E 99)   n=5: above D0 A1 B1 C3 G4
--        -> top half: D A B           not: C G
--   GW2  A 55, B 50, C 45, D 40, G 35  (E 99)   n=5: above A0 B1 C2 D3 G4
--        -> top half: A B C (C only because D is counted and E is not:
--           with E counted n=6 and C has 3 above; without D, n=4 and C has 2)
--   GW3  B 70, D 65, A 60, G 60, F 40, C 30 (E 99)  n=6: above B0 D1 A2 G2 F4 C5
--        -> top half (above<3): B D A G; G only through the tie with A
--   GW5  D 90, A 80, F 75, B 40, G 40, C 35 (E 99)  n=6: above D0 A1 F2 B3 G3 C5
--        -> top half: D A F            not: B G C
--   GW6  B 80, D 70, A 65, G 65, C 50 (E 99)  n=5: above B0 D1 A2 G2 C4
--        -> top half (above x 2 < 5): B D A G   not: C
--   CON raw = weeks in the top half / weeks counted
--     as of GW3: A 3/3 = 1, B 3/3 = 1, C 1/3 = .333333, G 1/3 = .333333
--     as of GW5: A 4/4 = 1, B 3/4 = .75, C 1/4 = .25, G 1/4 = .25
--     as of GW6: A 5/5 = 1, B 4/5 = .8, C 1/5 = .2, G 2/5 = .4
--
-- CAP (captain's final points / best of the eleven starters; the vice only
-- when the captain played 0 minutes; skipped when both did, when the best is
-- 0 or less, or when scoring_details names another player; floor 0):
--   A  GW1 ignored (before the CAP start date)
--      GW2 captain 13 absent, vice 8 plays: 10 / 12 (player 5) = .833333
--      GW3 captain 8: 7 / 9 (player 9) = .777778
--      GW5 captain 15 under Triple Captain: 9 / 10 (player 6) = .900000
--        as of GW3 (.833333 + .777778) / 2 = .805556 -> 81
--        as of GW5 (.833333 + .777778 + .9) / 3 = .837037 -> 84
--   B  GW2 captain and vice both absent: skipped
--      GW3 scoring_details names player 14, effective captain is 13: skipped
--         (counted in capMismatches)
--      GW5 captain 9 scored -2: -2 / 10 floors at 0
--        as of GW3 nothing -> null; as of GW5 0 -> 1 (score floor)
--   C  GW2 captain 8: 10 / 12 = .833333; GW3 and GW5: every starter scored 0
--      or less -> skipped; as of GW3 and GW5 .833333 -> 83
--   G  GW2 captain 9: 4 / 12 = .333333; GW3 9 / 9 = 1; GW5 captain 8: 5 / 10
--      = .5; as of GW3 (1/3 + 1) / 2 = .666667 -> 67, as of GW5 .611111 -> 61
--
-- SEL (starting_points / points of the best legal eleven the lineup's
-- fifteen could field: 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD; Bench Boost weeks and
-- an optimum of 0 or less are skipped; clamped to 0..1):
--   A  GW1 42/49  GW2 51/66  GW3 47/50  GW5 54/66  (.857143 .772727 .94 .818182)
--      as of GW3 .856623; as of GW5 .847013
--      (GW1: starters 2+4+2+6+1+8+3+2+12+0+2 = 42; best XI 1 3 4 5 8 9 10 11 13
--       15 16 = 2+4+2+6+8+3+2+5+12+2+3 = 49)
--   B  GW1 42/47, GW2 Bench Boost skipped, GW3 45/52, GW5 52/64
--      as of GW3 (.893617 + .865385) / 2 = .879501; as of GW5 .857167
--   C  GW1 42/47, GW2 (Free Hit week, counted) 51/60, GW3 optimum 0 -> skipped,
--      GW5 starters -1 + -1 = -2, best XI 14 -> -2/14 floors at 0
--      as of GW3 (.893617 + .85) / 2 = .871809; as of GW5 (.893617 + .85 + 0) / 3
--      = .581206
--   G  GW1 42/47  GW2 51/66  GW3 45/48  GW5 52/62; as of GW3 .867948, GW5 .860638
--
-- TRF (per transfer: the in-player's points minus the out-player's over the
-- window of 3 non-cancelled gameweeks from the batch's, minus point_hit /
-- transfers_count; Free Hit and reversed batches excluded; a batch counts
-- once its whole window is evaluable or the season's last gameweek is):
--   A  X1 (GW1, hit 4, 7->16 and 12->17), window GW1-3:
--        16 scored 3+4+1 = 8, 7 scored 0+2+5 = 7: 8-7-2 = -1
--        17 scored 1+5+3 = 9, 12 scored 1+0+3 = 4: 9-4-2 = 3
--      X2 (GW3, 14->18), window GW3, GW5, GW6 (GW4 is cancelled and skipped):
--        18 scored 8+3+6 = 17, 14 scored 6+1+5 = 12: +5
--      X3 (GW5, hit 8, 11->12), window GW5, GW6 only (the season ends):
--        12 scored 6+9 = 15, 11 scored 4+2 = 6: 9-8 = +1
--      As of GW3 and GW5 only X1 is ready (X2 and X3 wait for GW6): mean
--      (-1+3)/2 = 1 -> 55. As of GW6 X2 and X3 are ready (GW6 is the last
--      gameweek, so X3 counts with two weeks): (-1+3+5+1)/4 = 2 -> 60.
--   B  no batch: null. C  a Free Hit batch and a reversed one: null.
--   G  W1 Wildcard (GW2, 7->16 and 12->17), window GW2, GW3, GW5, ready only
--      once GW5 is evaluable: 16 scored 4+1+0 = 5, 7 scored 2+5+2 = 9: -4;
--      17 scored 5+3+5 = 13, 12 scored 0+3+6 = 9: +4; mean 0 -> 50. Null as
--      of GW2 and GW3.
--
-- OVR = rounded mean of the stats that exist, null under three. Under the
-- minimum (3 counted weeks) every figure is null; provisional while fewer
-- than 5 weeks are counted.
--   A as of GW3: (81+86+55+99)/4 = 80.25 -> 80 champion
--   A as of GW5: (84+85+55+99)/4 = 80.75 -> 81 champion
--   B as of GW3: cap and trf null, two stats left -> no OVR
--   B as of GW5: cap 1, sel 86, con 75, trf null -> 162/3 = 54 stade
--   (the full expected rows, computed by an independent reference
--   implementation of the domain plan section 3, are in the tables below)
--
-- CORRECTION. GW3 is corrected: player 8 scored 4, not 7, the teams' starting
-- points are re-scored, and the gameweek's scoring_input_version goes to 2.
-- Only A's CAP and the SEL of the teams fielding player 8 change (A: GW3 CAP
-- 4/9 = .444444, as of GW5 (.833333 + .444444 + .9) / 3 = .725926; A's GW3 SEL
-- 44/47 instead of 47/50).
--
-- Expected rows are checked with is_empty on a query that lists any
-- difference, so a failure prints the offending team and gameweek.
begin;
select extensions.plan(161);

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('bc0e0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.idx(t text) returns integer language sql immutable as $$
  select array_position(array['A','B','C','D','E','F','G','H','X','Y','Z'], t)
$$;
create function pg_temp.usr(t text) returns uuid language sql immutable as $$
  select pg_temp.id(300 + pg_temp.idx(t))
$$;
create function pg_temp.tm(t text) returns uuid language sql immutable as $$
  select pg_temp.id(400 + pg_temp.idx(t))
$$;
create function pg_temp.fp(n integer) returns uuid language sql immutable as $$
  select pg_temp.id(1000 + n)
$$;
create function pg_temp.gw(n integer) returns uuid language sql immutable as $$
  select pg_temp.id(20 + n)
$$;

-- A statement's outcome: 'ok', or its SQLSTATE and message. Whatever it did is
-- undone either way (it may be several statements).
create function pg_temp.outcome(p_sql text) returns text language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception using errcode = 'X0001', message = 'undo';
  exception
    when sqlstate 'X0001' then return 'ok';
    when others then return sqlstate || ' ' || sqlerrm;
  end;
end;
$$;

-- Runs one expression as a signed-in user (aal as given), as a visitor
-- (p_user null, role authenticated) or as anon, and returns its jsonb, or
-- {"__error": "SQLSTATE message"}. Claims are reset afterwards.
create function pg_temp.run(p_user uuid, p_aal text, p_expr text, p_role text default 'authenticated')
returns jsonb language plpgsql as $$
declare result text;
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then jsonb_build_object('role', p_role)::text
      else jsonb_build_object('sub', p_user, 'role', p_role, 'aal', p_aal)::text end, true);
  begin
    execute format('set local role %I', p_role);
    execute format('select (%s)::text', p_expr) into result;
    reset role;
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    return jsonb_build_object('__error', sqlstate || ' ' || sqlerrm);
  end;
  perform set_config('request.jwt.claims', '', true);
  return result::jsonb;
end;
$$;

-- Every card row and the ledger and the job log as one fingerprint (with and
-- without the ledger), and every Fantasy table the card reads or could be
-- tempted to write as another.
create function pg_temp.card_rows() returns text language sql as $$
  select md5(concat_ws('#',
    (select coalesce(string_agg(t::text, '|' order by t.user_id), '-') from app.manager_cards t),
    (select coalesce(string_agg(t::text, '|' order by t.user_id, t.fantasy_season_id), '-') from app.manager_card_seasons t),
    (select coalesce(string_agg(t::text, '|' order by t.user_id, t.gameweek_id), '-') from app.manager_card_gameweeks t),
    (select coalesce(string_agg(t::text, '|' order by t.serial), '-') from app_private.manager_card_retired_serials t)))
$$;
create function pg_temp.card_state() returns text language sql as $$
  select md5(concat_ws('#', pg_temp.card_rows(),
    (select coalesce(string_agg(t::text, '|' order by t.gameweek_id, t.rules_version), '-') from app_private.manager_card_evaluations t),
    (select coalesce(string_agg(t::text, '|' order by t.id), '-') from app_private.manager_card_job_log t)))
$$;
create function pg_temp.fantasy_state() returns text language sql as $$
  select md5(concat_ws('#',
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_team_gameweek_results t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_lineups t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_lineup_players t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_player_gameweek_points t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_gameweeks t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_teams t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_transfer_batches t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_transfers t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_players t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_seasons t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_rankings t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app_private.fantasy_gameweek_postwork t)))
$$;
-- One row per tick: did the Fantasy tables stay exactly as they were?
create temp table fantasy_log (label text, unchanged boolean);
create function pg_temp.fantasy_check(p_label text, p_before text) returns void language sql as $$
  insert into fantasy_log values (p_label, pg_temp.fantasy_state() = p_before)
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2), 'manager-card-test', 'Manager Card Test', 'MCT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), '2089/90', '2089-08-01', '2090-06-30', 'active', true),
  (pg_temp.id(8), pg_temp.id(2), '2088/89', '2088-08-01', '2089-06-30', 'completed', false);
insert into app.rounds (id, season_id, round_number, name, status)
select pg_temp.id(30 + n), pg_temp.id(3), n, 'Round ' || n, 'completed' from generate_series(1, 6) n;
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id(11), pg_temp.id(8), 1, 'Round 1', 'completed');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(4), pg_temp.id(2), 'manager-card-test', 'Manager Card Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values (pg_temp.id(5), pg_temp.id(4), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
    '2089/90', 'active', '2089-08-01', '2090-06-30'),
  (pg_temp.id(9), pg_temp.id(4), pg_temp.id(8), 'f6100000-0000-4000-8000-000000000100',
    '2088/89', 'completed', '2088-08-01', '2089-06-30');

-- Gameweeks. S0 has one finalized gameweek and no postwork row (never evaluated).
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
select pg_temp.gw(n), pg_temp.id(5), pg_temp.id(30 + n), n, 'Gameweek ' || n,
  d, d + interval '2 hours', d + interval '2 days 2 hours',
  case when n in (1, 2, 3, 5) then 'finalized' when n = 4 then 'cancelled' else 'scheduled' end::app.fantasy_gameweek_status,
  case when n in (1, 2, 3, 5) then d + interval '3 days 2 hours' end,
  case when n in (1, 2, 3, 5) then 'final' else 'provisional' end::app.fantasy_points_state,
  1
from generate_series(1, 6) n
cross join lateral (select timestamptz '2089-09-01 10:00:00+00' + (n - 1) * interval '7 days' as d) dl;
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
values (pg_temp.id(10), pg_temp.id(9), pg_temp.id(11), 1, 'Old gameweek 1',
  '2088-09-01 10:00+00', '2088-09-01 12:00+00', '2088-09-03 12:00+00', 'finalized',
  '2088-09-04 12:00+00', 'final', 1);
-- Postwork: complete for GW1, 2, 3, 5 and (a trap) for the cancelled GW4.
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
select pg_temp.gw(n), 1, 1, '{}', statement_timestamp(), statement_timestamp()
from unnest(array[1, 2, 3, 4, 5]) n;

-- Two clubs; the first has a French short name only, the second both.
insert into app.teams (id, slug, name, short_name, code, country_id, primary_color, secondary_color)
values (pg_temp.id(6), 'manager-card-club-1', 'MC Club', 'MC', 'MCC',
    (select id from app.countries where iso_alpha2 = 'MA'), '#112233', '#445566'),
  (pg_temp.id(7), 'manager-card-club-2', 'MC Deux', 'MD', 'MCD',
    (select id from app.countries where iso_alpha2 = 'MA'), null, null);
insert into app.team_translations (team_id, language, name, short_name) values
  (pg_temp.id(6), 'fr', 'Club MC', 'Club FR'),
  (pg_temp.id(7), 'fr', 'MC Deux', 'Deux FR'),
  (pg_temp.id(7), 'ar', 'اثنان', 'اثنان');

-- Football and Fantasy players.
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id(2000 + p.n), 'manager-card-player-' || p.n, 'MC Player ' || p.n, 'MCP ' || p.n,
  case p.code when 'GK' then 'goalkeeper' when 'DEF' then 'defender' when 'MID' then 'midfielder'
    else 'forward' end::app.football_position
from (values (1,'GK'),(2,'GK'),(3,'DEF'),(4,'DEF'),(5,'DEF'),(6,'DEF'),(7,'DEF'),(8,'MID'),(9,'MID'),(10,'MID'),(11,'MID'),(12,'MID'),(13,'FWD'),(14,'FWD'),(15,'FWD'),(16,'DEF'),(17,'MID'),(18,'FWD'),(19,'GK'),(20,'GK'),(21,'DEF'),(22,'DEF'),(23,'DEF'),(24,'DEF'),(25,'DEF'),(26,'MID'),(27,'MID'),(28,'MID'),(29,'MID'),(30,'MID'),(31,'FWD'),(32,'FWD'),(33,'FWD')) as p(n, code);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price)
select pg_temp.fp(p.n), pg_temp.id(5), pg_temp.id(2000 + p.n), pg_temp.id(6),
  (select id from app.fantasy_positions where code = p.code), 6
from (values (1,'GK'),(2,'GK'),(3,'DEF'),(4,'DEF'),(5,'DEF'),(6,'DEF'),(7,'DEF'),(8,'MID'),(9,'MID'),(10,'MID'),(11,'MID'),(12,'MID'),(13,'FWD'),(14,'FWD'),(15,'FWD'),(16,'DEF'),(17,'MID'),(18,'FWD'),(19,'GK'),(20,'GK'),(21,'DEF'),(22,'DEF'),(23,'DEF'),(24,'DEF'),(25,'DEF'),(26,'MID'),(27,'MID'),(28,'MID'),(29,'MID'),(30,'MID'),(31,'FWD'),(32,'FWD'),(33,'FWD')) as p(n, code);

-- Accounts, created the way Supabase Auth creates them.
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.usr(u.t), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, statement_timestamp(), 'hash', '{}',
  u.meta::jsonb, statement_timestamp(), statement_timestamp()
from (values
  ('A', 'mc-a@example.test', '{"username":"amina_mc","display_name":"Amina Test"}'),
  ('B', 'mc-b@example.test', '{"username":"brahim_mc","display_name":"Brahim Test"}'),
  ('C', 'mc-c@example.test', '{"username":"chaimae_mc","display_name":"Chaimae Test"}'),
  ('D', 'mc-d@example.test', '{"username":"dina_mc","display_name":"Dina Test"}'),
  ('E', 'mc-e@example.test', '{"username":"elias_mc","display_name":"Elias Test"}'),
  ('F', 'fatima@botolago.com', '{"username":"fatima_mc","display_name":"Fatima Test"}'),
  ('G', 'mc-g@example.test', '{}'),
  ('X', 'mc-x@example.test', '{"username":"xavier_mc","display_name":"Xavier Test"}'),
  ('Y', 'mc-y@example.test', '{"username":"yasmine_mc","display_name":"Yasmine Test"}'),
  ('Z', 'mc-z@example.test', '{"username":"zaid_mc","display_name":"Zaid Test"}')
) as u(t, email, meta);
update app.profiles set deleted_at = statement_timestamp() where id = pg_temp.usr('D');
insert into app_private.staff_principals (auth_user_id) values (pg_temp.usr('E'));
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.id(900), pg_temp.usr('Y'), 'Y TOTP', 'totp', 'verified',
  statement_timestamp(), statement_timestamp());
insert into app.user_preferences (user_id, favorite_team_id) values
  (pg_temp.usr('A'), pg_temp.id(6)), (pg_temp.usr('B'), pg_temp.id(7))
on conflict (user_id) do update set favorite_team_id = excluded.favorite_team_id;

-- Fantasy teams (E is suspended; F also has a team in S0).
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
select pg_temp.tm(t), pg_temp.usr(t), pg_temp.id(5), 'Team ' || t, 0, 100, 1,
  case when t = 'E' then 'suspended' else 'active' end::app.fantasy_team_status,
  timestamptz '2089-08-01 00:00:00+00'
from unnest(array['A', 'B', 'C', 'D', 'E', 'F', 'G']) t;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
values (pg_temp.id(450), pg_temp.usr('F'), pg_temp.id(9), 'Team F old', 0, 100, 1, 'active',
  timestamptz '2088-08-01 00:00:00+00');

-- Player points (gameweek, player, final_points, minutes_played).
insert into app.fantasy_player_gameweek_points (fantasy_player_id, gameweek_id, provisional_points,
  final_points, minutes_played, calculation_version, football_input_version, finalized_at)
select pg_temp.fp(v.p), pg_temp.gw(v.g), v.pts, v.pts, v.mins, 1, 0, statement_timestamp()
from (values
  (1,1,2,90),(1,2,1,90),(1,3,4,90),(1,4,2,90),(1,5,6,90),(1,6,1,90),(1,7,0,90),(1,8,8,90),(1,9,3,90),
  (1,10,2,90),(1,11,5,90),(1,12,1,90),(1,13,12,90),(1,14,0,90),(1,15,2,90),(1,16,3,90),(1,17,1,90),(1,18,4,90),
  (2,1,3,90),(2,2,0,90),(2,3,2,90),(2,4,5,90),(2,5,12,90),(2,6,1,90),(2,7,2,90),(2,8,10,90),(2,9,4,90),
  (2,10,6,90),(2,11,7,90),(2,12,0,0),(2,13,0,0),(2,14,0,0),(2,15,8,90),(2,16,4,90),(2,17,5,90),(2,18,1,90),
  (3,1,6,90),(3,2,1,90),(3,3,1,90),(3,4,3,90),(3,5,4,90),(3,6,2,90),(3,7,5,90),(3,8,7,90),(3,9,9,90),
  (3,10,2,90),(3,11,1,90),(3,12,3,90),(3,13,5,90),(3,14,6,90),(3,15,0,0),(3,16,1,90),(3,17,3,90),(3,18,8,90),
  (5,1,4,90),(5,2,2,90),(5,3,6,90),(5,4,1,90),(5,5,3,90),(5,6,10,90),(5,7,2,90),(5,8,5,90),(5,9,-2,90),
  (5,10,8,90),(5,11,4,90),(5,12,6,90),(5,13,7,90),(5,14,1,90),(5,15,9,90),(5,16,0,90),(5,17,5,90),(5,18,3,90),
  (3,19,-1,90),(3,20,0,90),(3,21,-1,90),(3,22,0,90),(3,23,0,90),(3,24,0,90),(3,25,0,90),(3,26,-1,90),(3,27,0,90),
  (3,28,0,90),(3,29,0,90),(3,30,0,90),(3,31,-1,90),(3,32,0,90),(3,33,0,90),(5,19,-1,90),(5,20,0,90),(5,21,0,90),
  (5,22,0,90),(5,23,0,90),(5,24,-1,90),(5,25,0,90),(5,26,0,90),(5,27,0,90),(5,28,0,90),(5,29,0,90),(5,30,0,90),
  (5,31,0,90),(5,32,0,90),(5,33,0,90)
) as v(g, p, pts, mins);

-- A lineup of fifteen: team letter, gameweek, starters, bench, captain, vice.
create function pg_temp.mk_lineup(p_team text, p_gw integer, p_starters integer[], p_bench integer[],
  p_captain integer, p_vice integer) returns void language sql as $$
  with lineup as (
    insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
    values (pg_temp.id(5000 + pg_temp.idx(p_team) * 10 + p_gw), pg_temp.tm(p_team), pg_temp.gw(p_gw),
      1, timestamptz '2089-08-01 00:00:00+00')
    returning id
  )
  insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain,
    vice_captain, snapshot_price)
  select lineup.id, pg_temp.fp(s.player), s.slot::app.fantasy_lineup_slot, s.ord,
    s.player = p_captain, s.player = p_vice, 6
  from lineup
  cross join lateral (
    select player, 'starter', ord from unnest(p_starters) with ordinality as a(player, ord)
    union all
    select player, 'bench', ord from unnest(p_bench) with ordinality as b(player, ord)
  ) as s(player, slot, ord)
$$;
select pg_temp.mk_lineup('A', 1, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,16,11,17}', 13, 8);
select pg_temp.mk_lineup('A', 2, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,16,11,17}', 13, 8);
select pg_temp.mk_lineup('A', 3, '{1,3,4,5,6,8,9,10,13,18,15}', '{2,16,11,17}', 8, 9);
select pg_temp.mk_lineup('A', 5, '{1,3,4,5,6,8,9,10,13,18,15}', '{2,16,12,17}', 15, 9);
select pg_temp.mk_lineup('B', 1, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 13, 8);
select pg_temp.mk_lineup('B', 2, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 13, 14);
select pg_temp.mk_lineup('B', 3, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 13, 8);
select pg_temp.mk_lineup('B', 5, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 9, 8);
select pg_temp.mk_lineup('C', 1, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 13);
select pg_temp.mk_lineup('C', 2, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('C', 3, '{19,21,22,23,24,26,27,28,31,32,33}', '{20,25,29,30}', 26, 27);
select pg_temp.mk_lineup('C', 5, '{19,21,22,23,24,26,27,28,31,32,33}', '{2,7,11,12}', 26, 27);
select pg_temp.mk_lineup('D', 1, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('D', 2, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('D', 3, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('D', 5, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('E', 1, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('E', 2, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('E', 3, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('E', 5, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('F', 3, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('F', 5, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('G', 1, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 9, 8);
select pg_temp.mk_lineup('G', 2, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,16,11,17}', 9, 8);
select pg_temp.mk_lineup('G', 3, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,16,11,17}', 9, 8);
select pg_temp.mk_lineup('G', 5, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,16,11,17}', 8, 9);

-- Results: team, gameweek, chip, final_score, scoring_details.
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
  bench_points, captain_points, transfer_hit, chip_type, provisional_score, final_score, state,
  calculation_version, finalized_at, scoring_details)
select pg_temp.tm(v.t), pg_temp.gw(v.g),
  (select coalesce(sum(p.final_points), 0)
   from app.fantasy_lineups l
   join app.fantasy_lineup_players lp on lp.lineup_id = l.id and lp.slot = 'starter'
   join app.fantasy_player_gameweek_points p
     on p.fantasy_player_id = lp.fantasy_player_id and p.gameweek_id = l.gameweek_id
   where l.fantasy_team_id = pg_temp.tm(v.t) and l.gameweek_id = pg_temp.gw(v.g)),
  0, 0, 0, v.chip::app.fantasy_chip_type, v.fin, v.fin, 'final', 1, statement_timestamp(), v.det
from (values
  ('A', 1, null, 60, null),
  ('A', 2, null, 55, jsonb_build_object('effectiveCaptainId', pg_temp.fp(8))),
  ('A', 3, null, 60, jsonb_build_object('effectiveCaptainId', pg_temp.fp(8))),
  ('A', 5, 'triple_captain', 80, null),
  ('B', 1, null, 60, null),
  ('B', 2, 'bench_boost', 50, null),
  ('B', 3, null, 70, jsonb_build_object('effectiveCaptainId', pg_temp.fp(14))),
  ('B', 5, null, 40, null),
  ('C', 1, null, 50, null),
  ('C', 2, 'free_hit', 45, null),
  ('C', 3, null, 30, null),
  ('C', 5, null, 35, null),
  ('D', 1, null, 70, null),
  ('D', 2, null, 40, null),
  ('D', 3, null, 65, null),
  ('D', 5, null, 90, null),
  ('E', 1, null, 99, null),
  ('E', 2, null, 99, null),
  ('E', 3, null, 99, null),
  ('E', 5, null, 99, null),
  ('F', 3, null, 40, null),
  ('F', 5, null, 75, null),
  ('G', 1, null, 40, null),
  ('G', 2, 'wildcard', 35, null),
  ('G', 3, null, 60, null),
  ('G', 5, null, 40, jsonb_build_object('effectiveCaptainId', pg_temp.fp(8)))
) as v(t, g, chip, fin, det);
-- A "final" result in the cancelled GW4 (it must not count).
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
  bench_points, captain_points, transfer_hit, provisional_score, final_score, state,
  calculation_version, finalized_at)
values (pg_temp.tm('A'), pg_temp.gw(4), 99, 0, 0, 0, 1000, 1000, 'final', 1, statement_timestamp());

-- Transfer batches: id, team, gameweek, status, chip, hit, [out, in] pairs.
create function pg_temp.mk_batch(p_n integer, p_team text, p_gw integer, p_status text, p_chip text,
  p_hit integer, p_pairs integer[]) returns void language sql as $$
  with batch as (
    insert into app.fantasy_transfer_batches (id, fantasy_team_id, gameweek_id, idempotency_key,
      base_team_version, resulting_team_version, transfers_count, free_transfers_before,
      free_transfers_used, point_hit, bank_before, bank_after, chip_type, status)
    values (pg_temp.id(600 + p_n), pg_temp.tm(p_team), pg_temp.gw(p_gw), pg_temp.id(650 + p_n), 1, 2,
      cardinality(p_pairs) / 2, 1, 1, p_hit, 0, 0, p_chip::app.fantasy_chip_type,
      p_status::app.fantasy_transfer_batch_status)
    returning id
  )
  insert into app.fantasy_transfers (transfer_batch_id, sequence_number, player_out_id, player_in_id,
    sale_price, purchase_price)
  select batch.id, k, pg_temp.fp(p_pairs[2 * k - 1]), pg_temp.fp(p_pairs[2 * k]), 6, 6
  from batch, generate_series(1, cardinality(p_pairs) / 2) k
$$;
select pg_temp.mk_batch(1, 'A', 1, 'confirmed', null, 4, array[7,16,12,17]);  -- X1
select pg_temp.mk_batch(2, 'A', 3, 'confirmed', null, 0, array[14,18]);  -- X2
select pg_temp.mk_batch(3, 'A', 5, 'confirmed', null, 8, array[11,12]);  -- X3
select pg_temp.mk_batch(4, 'C', 2, 'confirmed', 'free_hit', 0, array[3,16]);  -- Y1
select pg_temp.mk_batch(5, 'C', 1, 'reversed_by_correction', null, 4, array[4,16]);  -- Y2
select pg_temp.mk_batch(6, 'G', 2, 'confirmed', 'wildcard', 0, array[7,16,12,17]);  -- W1
select set_config('request.jwt.claims', '', true);

-- Expected figures (team, gameweek, ovr, tier, cap, sel, trf, con, then the
-- four raw figures, weeks counted, provisional). Null where the figure is
-- missing. exp_a: the first tick, rules v1, all four evaluable gameweeks.
-- exp_c: GW3 and GW5 after the correction. exp_b: GW6 ("stage B").
create temp table exp_a (team, gw, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional) as values
  ('A',1,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,1,true),
  ('B',1,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,1,true),
  ('C',1,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,1,true),
  ('G',1,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,1,true),
  ('A',2,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,2,true),
  ('B',2,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,2,true),
  ('C',2,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,2,true),
  ('G',2,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,2,true),
  ('A',3,80,'champion',81,86,55,99,0.805556,0.856623,1.000000,1.000000,3,true),
  ('B',3,null,null::text,null,88,null,99,null::numeric,0.879501,null::numeric,1.000000,3,true),
  ('C',3,68,'pro',83,87,null,33,0.833333,0.871809,null::numeric,0.333333,3,true),
  ('F',3,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,1,true),
  ('G',3,62,'stade',67,87,null,33,0.666667,0.867948,null::numeric,0.333333,3,true),
  ('A',5,81,'champion',84,85,55,99,0.837037,0.847013,1.000000,1.000000,4,true),
  ('B',5,54,'stade',1,86,null,75,0.000000,0.857167,null::numeric,0.750000,4,true),
  ('C',5,55,'stade',83,58,null,25,0.833333,0.581206,null::numeric,0.250000,4,true),
  ('F',5,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,2,true),
  ('G',5,56,'stade',61,86,50,25,0.611111,0.860638,0.000000,0.250000,4,true);
create temp table exp_c (team, gw, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional) as values
  ('A',3,76,'pro',64,86,55,99,0.638889,0.855347,1.000000,1.000000,3,true),
  ('B',3,null,null::text,null,88,null,99,null::numeric,0.875380,null::numeric,1.000000,3,true),
  ('C',3,68,'pro',83,87,null,33,0.833333,0.871809,null::numeric,0.333333,3,true),
  ('F',3,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,1,true),
  ('G',3,62,'stade',67,87,null,33,0.666667,0.866559,null::numeric,0.333333,3,true),
  ('A',5,78,'champion',73,85,55,99,0.725926,0.846056,1.000000,1.000000,4,true),
  ('B',5,54,'stade',1,85,null,75,0.000000,0.854420,null::numeric,0.750000,4,true),
  ('C',5,55,'stade',83,58,null,25,0.833333,0.581206,null::numeric,0.250000,4,true),
  ('F',5,null,null::text,null,null,null,null,null::numeric,null::numeric,null::numeric,null::numeric,2,true),
  ('G',5,56,'stade',61,86,50,25,0.611111,0.859597,0.000000,0.250000,4,true);
create temp table exp_b (team, gw, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional) as values
  ('A',6,80,'champion',79,80,60,99,0.794444,0.798413,2.000000,1.000000,5,false),
  ('B',6,56,'stade',8,80,null,80,0.083333,0.797065,null::numeric,0.800000,5,false),
  ('C',6,49,'homa',67,59,null,20,0.666667,0.592154,null::numeric,0.200000,5,false),
  ('G',6,58,'stade',58,83,50,40,0.583333,0.827212,0.000000,0.400000,5,false);

-- ---------------------------------------------------------------------------
-- Shape: the switch, the rules, row security, grants, schedules, the lock
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::text || ':' || bool_or(compute_enabled)::text || ':' || bool_or(read_enabled)::text
   from app_private.manager_card_settings),
  '1:false:false', 'the switch is one row with both switches off');
select extensions.is((select count(*)::integer from app_private.manager_card_rules), 0,
  'no ruleset ships: rules v1 is inserted after calibration');

create temp table card_tables (t regclass);
insert into card_tables values ('app.manager_cards'), ('app.manager_card_seasons'),
  ('app.manager_card_gameweeks'), ('app_private.manager_card_rules'),
  ('app_private.manager_card_settings'), ('app_private.manager_card_evaluations'),
  ('app_private.manager_card_job_log'), ('app_private.manager_card_retired_serials'),
  ('app.manager_card_moment_acks');

select extensions.is(
  (select count(*)::integer from pg_class c join card_tables ct on ct.t = c.oid
   where c.relrowsecurity and c.relforcerowsecurity),
  9, 'row security is enabled and forced on all nine card tables');
select extensions.ok(
  not exists (select 1 from pg_policy p join card_tables ct on ct.t = p.polrelid),
  'and no card table has a policy');
select extensions.ok(
  not exists (
    select 1 from card_tables ct
    cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'])
      as privilege(name)
    where has_table_privilege(r.role, ct.t, privilege.name)),
  'no API role holds any right on any card table');
select extensions.ok(
  not exists (
    select 1 from pg_class c join card_tables ct on ct.t = c.oid
    cross join lateral aclexplode(c.relacl) a
    where a.grantee <> c.relowner),
  'nothing on a card table is granted to anyone but its owner, PUBLIC included');
select extensions.ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    where has_sequence_privilege(r.role,
      pg_get_serial_sequence('app_private.manager_card_job_log', 'id'), 'usage')
      or has_sequence_privilege(r.role,
        pg_get_serial_sequence('app_private.manager_card_job_log', 'id'), 'select')),
  'nor the job log sequence');

select extensions.is(
  (select string_agg(left(pg_temp.run(case when r.role = 'authenticated' then pg_temp.usr('A') end, 'aal1',
      format('(select count(*) from %s)', ct.t), r.role) ->> '__error', 5), ',' order by r.role, ct.t::text)
   from card_tables ct cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)),
  (select string_agg('42501', ',') from generate_series(1, 27)),
  'anon, a signed-in user and the service role are each refused (permission denied) on every card table');
select extensions.is(
  (select count(*)::integer from pg_proc p
   where p.pronamespace = 'app_private'::regnamespace and p.proname ~ '^manager_card'),
  25, 'twenty-five Manager Card functions live in app_private');
select extensions.ok(
  not exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'app_private'::regnamespace and p.proname ~ '^manager_card'
      and a.grantee <> p.proowner),
  'every one is executable by its owner only, never by PUBLIC or an API role');
select extensions.ok(
  not exists (
    select 1 from pg_proc p
    cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    where p.pronamespace = 'app_private'::regnamespace and p.proname ~ '^manager_card'
      and has_function_privilege(r.role, p.oid, 'execute')),
  'so no API role can run the switch, the tick, the calculation or the founder grant');
select extensions.ok(
  (select bool_and(has_function_privilege('authenticated', f, 'execute')
      and has_function_privilege('service_role', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
   from unnest(array['api.get_my_manager_card()', 'api.get_manager_cards(uuid[])',
     'api.get_my_manager_card_history(uuid,integer,integer)',
     'api.ack_manager_card_moments(text[])']) f),
  'the four signed-in functions are for authenticated and service_role, not anon');
select extensions.ok(
  (select bool_and(has_function_privilege('anon', f, 'execute')
      and has_function_privilege('authenticated', f, 'execute')
      and has_function_privilege('service_role', f, 'execute'))
   from unnest(array['api.manager_card_status()']) f),
  'the status read is for anon, authenticated and service_role');
select extensions.ok(
  not exists (
    select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
    where p.pronamespace = 'api'::regnamespace and p.proname ~ 'manager_card' and a.grantee = 0),
  'and PUBLIC holds no right on them');
select extensions.ok(
  (select count(*) = 5 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p where p.pronamespace = 'api'::regnamespace and p.proname ~ 'manager_card'),
  'exactly five api functions, all security definer with an empty search_path');
select extensions.is(
  (select string_agg(jobname || '@' || schedule, ',' order by jobname) from cron.job
   where jobname like 'manager-card-%'),
  'manager-card-history-prune@47 3 * * *,manager-card-tick@*/15 * * * *',
  'a tick every 15 minutes and a prune at 03:47 are scheduled');
select extensions.ok(
  (select command like '%set local statement_timeout%' and command like '%app_private.manager_card_tick()%'
   from cron.job where jobname = 'manager-card-tick'),
  'the tick sets its own statement timeout');
select extensions.ok(
  (select command ~ 'cron\.job_run_details' and command ~ 'app_private\.manager_card_job_log'
      and command !~ 'app\.manager_card'
   from cron.job where jobname = 'manager-card-history-prune'),
  'the prune names the tick''s run details and the job log, and no app.* card table');

-- One writer at a time: the erasure and every card writer take the same
-- advisory lock, without waiting (a lock held in this session would not
-- block them, so the keys are read from their code).
select extensions.is(
  (select (length(d) - length(replace(d, k, ''))) / length(k)
   from (select pg_catalog.pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure) as d,
     format('pg_try_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0))', 'botolago:manager-card') as k) s),
  1, 'the erasure takes the botolago:manager-card lock exactly once');
select extensions.ok(
  (select bool_and(strpos(pg_catalog.pg_get_functiondef(
      'app_private.account_deletion_erase(uuid,integer)'::regprocedure),
      format('pg_try_advisory_xact_lock(pg_catalog.hashtextextended(%L, 0))', k)) > 0)
   from unnest(array['fantasy:lifecycle-tick', 'botolago:predictions-score', 'pepites_tick',
     'botolago.fantasy_prize_evaluation', 'botolago:manager-card']) as k),
  'and still the four it took before');
select extensions.ok(
  (select bool_and(strpos(p.prosrc, 'pg_try_advisory_xact_lock(pg_catalog.hashtextextended(''botolago:manager-card'', 0))') > 0)
   from pg_proc p
   where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('manager_card_tick', 'manager_card_evaluate_gameweek', 'manager_card_grant_founder')),
  'the tick, the calculation and the founder grant take that same lock');

-- The scale and the tier, on their own.
select extensions.is(
  array[app_private.manager_card_scale(0.5, '[[0,0],[1,100]]'), app_private.manager_card_scale(0, '[[0,0],[1,100]]'),
    app_private.manager_card_scale(1, '[[0,0],[1,100]]'), app_private.manager_card_scale(5, '[[0,0],[1,100]]'),
    app_private.manager_card_scale(-1, '[[0,0],[1,100]]'), app_private.manager_card_scale(-3, '[[-10,0],[10,100]]'),
    app_private.manager_card_scale(1, '[[-10,0],[10,100]]'), app_private.manager_card_scale(0.15, '[[-10,0],[10,100]]')]::integer[],
  array[50, 1, 99, 99, 1, 35, 55, 51],
  'a scale is piecewise linear, rounded, clamped to 1..99 (0.15 on 50 + 5x gives 50.75, 51)');
select extensions.ok(
  app_private.manager_card_scale(null, '[[0,0],[1,100]]') is null
  and pg_temp.outcome('select app_private.manager_card_scale(0.5, ''[[0,0]]'')') = 'PT400 manager_card_rules_invalid',
  'a missing raw figure has no score, and a scale with one point is refused');
select extensions.is(
  array[app_private.manager_card_tier(49, '{"stade":50,"pro":65,"champion":78,"legend":88}'),
    app_private.manager_card_tier(50, '{"stade":50,"pro":65,"champion":78,"legend":88}'),
    app_private.manager_card_tier(64, '{"stade":50,"pro":65,"champion":78,"legend":88}'),
    app_private.manager_card_tier(65, '{"stade":50,"pro":65,"champion":78,"legend":88}'),
    app_private.manager_card_tier(77, '{"stade":50,"pro":65,"champion":78,"legend":88}'),
    app_private.manager_card_tier(78, '{"stade":50,"pro":65,"champion":78,"legend":88}'),
    app_private.manager_card_tier(87, '{"stade":50,"pro":65,"champion":78,"legend":88}'),
    app_private.manager_card_tier(88, '{"stade":50,"pro":65,"champion":78,"legend":88}')],
  array['homa', 'stade', 'stade', 'pro', 'pro', 'champion', 'champion', 'legend'],
  'each tier starts at its cut-off: homa below 50, stade 50, pro 65, champion 78, legend 88');

-- ---------------------------------------------------------------------------
-- Table constraints (each statement is undone)
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg(left(pg_temp.outcome(format(
      'insert into app.manager_cards (user_id, serial) values (%L, %L)', pg_temp.usr('X'), s)), 5), ',' order by s)
   from unnest(array['012345', '12345', '1234567', 'abcdef', '12345a', ' 12345']) s),
  '23514,23514,23514,23514,23514,23514',
  'a serial is six digits and does not start with 0');
select extensions.is(
  (select string_agg(pg_temp.outcome(format(
      'insert into app.manager_cards (user_id, serial) values (%L, %L)', pg_temp.usr('X'), s)), ',' order by s)
   from unnest(array['100000', '999999']) s),
  'ok,ok', 'and 100000 and 999999 are the ends of the range');

-- Statements that insert X's card and then one season or history row.
create function pg_temp.season_sql(p_cols text, p_vals text, p_rules_version integer default 1)
returns text language sql as $$
  select format('insert into app.manager_cards (user_id) values (%L); '
    || 'insert into app.manager_card_seasons (user_id, fantasy_season_id, fantasy_team_id, '
    || 'through_gameweek_id, rules_version, %s) values (%L, %L, %L, %L, %s, %s)',
    pg_temp.usr('X'), p_cols, pg_temp.usr('X'), pg_temp.id(5), pg_temp.tm('G'), pg_temp.gw(1),
    p_rules_version, p_vals)
$$;
create function pg_temp.hist_sql(p_cols text, p_vals text, p_rules_version integer default 1)
returns text language sql as $$
  select format('insert into app.manager_cards (user_id) values (%L); '
    || 'insert into app.manager_card_gameweeks (user_id, fantasy_season_id, gameweek_id, '
    || 'rules_version, %s) values (%L, %L, %L, %s, %s)',
    pg_temp.usr('X'), p_cols, pg_temp.usr('X'), pg_temp.id(5), pg_temp.gw(1), p_rules_version, p_vals)
$$;

select extensions.is(
  (select string_agg(left(pg_temp.outcome(format(
      'insert into app.manager_cards (user_id, founder_cohort, founder_granted_at) values (%L, %s, %s)',
      pg_temp.usr('X'), v.cohort, v.granted)), 5), ',' order by v.n)
   from (values (1, '1', 'null'), (2, 'null', 'now()'), (3, '0', 'now()'), (4, '-1', 'now()'))
     as v(n, cohort, granted)),
  '23514,23514,23514,23514',
  'a founder mark needs a cohort above 0 and a grant date together, or neither');
select extensions.is(
  pg_temp.outcome(format('insert into app.manager_cards (user_id, founder_cohort, founder_granted_at) '
    || 'values (%L, 1, now())', pg_temp.usr('X'))),
  'ok', 'and a cohort with its grant date is accepted');
select extensions.is(
  (select string_agg(left(pg_temp.outcome(pg_temp.season_sql(v.stat, v.val::text)), 5), ',' order by v.stat, v.val)
   from (select stat, val from unnest(array['ovr', 'cap', 'sel', 'trf', 'con']) stat
     cross join unnest(array[0, 100]) val) v),
  (select string_agg('23514', ',') from generate_series(1, 10)),
  'the OVR and each stat of a season row stay within 1..99');
select extensions.is(
  pg_temp.outcome(pg_temp.season_sql('ovr, cap, sel, trf, con, tier', '1, 99, 1, 99, 1, ''homa''')) || ','
    || pg_temp.outcome(pg_temp.season_sql('ovr', 'null')) || ','
    || pg_temp.outcome(pg_temp.season_sql('ovr, cap, sel, trf, con, tier', '99, 99, 99, 99, 99, ''legend''')),
  'ok,ok,ok', 'and 1, 99 and null are all accepted');
select extensions.is(
  (select string_agg(left(pg_temp.outcome(pg_temp.season_sql('tier', quote_literal(t))), 5), ',' order by n)
   from unnest(array['gold', '', 'HOMA']) with ordinality as v(t, n)),
  '23514,23514,23514', 'a tier is one of homa, stade, pro, champion, legend');
select extensions.is(
  (select string_agg(pg_temp.outcome(pg_temp.season_sql('tier', quote_literal(t))), ',' order by n)
   from unnest(array['homa', 'stade', 'pro', 'champion', 'legend']) with ordinality as v(t, n)),
  'ok,ok,ok,ok,ok', 'and the five tiers are accepted');
select extensions.is(
  left(pg_temp.outcome(pg_temp.season_sql('gameweeks_counted', '-1')), 5) || ','
    || left(pg_temp.outcome(pg_temp.season_sql('provisional', 'true', 0)), 5),
  '23514,23514', 'weeks counted cannot be negative and the rules version is above 0');
select extensions.is(
  (select string_agg(left(pg_temp.outcome(pg_temp.hist_sql(v.stat, v.val::text)), 5), ',' order by v.stat, v.val)
   from (select stat, val from unnest(array['ovr', 'cap', 'sel', 'trf', 'con']) stat
     cross join unnest(array[0, 100]) val) v)
  || ',' || left(pg_temp.outcome(pg_temp.hist_sql('tier', '''gold''')), 5)
  || ',' || left(pg_temp.outcome(pg_temp.hist_sql('gameweeks_counted', '-1')), 5)
  || ',' || pg_temp.outcome(pg_temp.hist_sql('ovr, tier', '50, ''stade''')),
  (select string_agg('23514', ',') from generate_series(1, 12)) || ',ok',
  'a history row has the same limits as a season row');
select extensions.is(
  left(pg_temp.outcome('insert into app.manager_card_seasons (user_id, fantasy_season_id, fantasy_team_id, '
    || 'through_gameweek_id, rules_version) values (''' || pg_temp.usr('X') || ''', ''' || pg_temp.id(5)
    || ''', ''' || pg_temp.tm('G') || ''', ''' || pg_temp.gw(1) || ''', 1)'), 5)
  || ',' || left(pg_temp.outcome('insert into app.manager_card_gameweeks (user_id, fantasy_season_id, '
    || 'gameweek_id, rules_version) values (''' || pg_temp.usr('X') || ''', ''' || pg_temp.id(5)
    || ''', ''' || pg_temp.gw(1) || ''', 1)'), 5),
  '23503,23503', 'a season or history row needs its card');
select extensions.is(
  (select string_agg(left(pg_temp.outcome(s), 5), ',' order by n)
   from unnest(array[
     $q$insert into app_private.manager_card_job_log (outcome) values ('Bad Outcome')$q$,
     $q$insert into app_private.manager_card_job_log (outcome, detail) values ('probe', '[]')$q$,
     $q$insert into app_private.manager_card_job_log (outcome, detail) values ('probe', jsonb_build_object('x', repeat('a', 5000)))$q$,
     $q$insert into app_private.manager_card_job_log (outcome, detail) values ('probe', '{"gameweeks": 1}')$q$
   ]) with ordinality as v(s, n)),
  '23514,23514,23514,ok',
  'a job-log outcome is a snake_case word, its detail a small object');
select extensions.is(
  left(pg_temp.outcome('insert into app_private.manager_card_settings (id) values (false)'), 5) || ','
    || left(pg_temp.outcome('insert into app_private.manager_card_settings (id) values (true)'), 5),
  '23514,23505', 'the switch stays a single row');
select extensions.is(
  left(pg_temp.outcome(format('insert into app.manager_cards (user_id, serial) values (%L, ''100000''); '
    || 'insert into app.manager_cards (user_id, serial) values (%L, ''100000'')',
    pg_temp.usr('X'), pg_temp.usr('Y'))), 5),
  '23505', 'two cards cannot share a serial');

-- ---------------------------------------------------------------------------
-- The permanent number
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.outcome(format('insert into app.manager_cards (user_id, serial) values (%L, ''100000''); '
    || 'update app.manager_cards set serial = ''100001'' where user_id = %L',
    pg_temp.usr('X'), pg_temp.usr('X'))),
  'PT409 manager_card_serial_immutable', 'a serial cannot be changed');
select extensions.is(
  pg_temp.outcome(format('insert into app.manager_cards (user_id, serial) values (%L, ''100000''); '
    || 'update app.manager_cards set serial = null where user_id = %L',
    pg_temp.usr('X'), pg_temp.usr('X'))),
  'PT409 manager_card_serial_immutable', 'or cleared');
select extensions.is(
  pg_temp.outcome(format('insert into app.manager_cards (user_id) values (%L); '
    || 'update app.manager_cards set serial = ''100001'' where user_id = %L; '
    || 'update app.manager_cards set serial = ''100001'' where user_id = %L',
    pg_temp.usr('X'), pg_temp.usr('X'), pg_temp.usr('X'))),
  'ok', 'it goes from null to a value once (and writing the same value again is harmless)');
select extensions.is(
  pg_temp.outcome(format('insert into app.manager_cards (user_id) values (%L); '
    || 'update app.manager_cards set serial = ''100001'' where user_id = %L; '
    || 'update app.manager_cards set serial = ''100002'' where user_id = %L',
    pg_temp.usr('X'), pg_temp.usr('X'), pg_temp.usr('X'))),
  'PT409 manager_card_serial_immutable', 'and never again');
select extensions.is(
  pg_temp.outcome(format('insert into app.manager_cards (user_id) values (%L); '
    || 'update app.manager_cards set user_id = %L where user_id = %L',
    pg_temp.usr('X'), pg_temp.usr('Y'), pg_temp.usr('X'))),
  'PT409 manager_card_user_immutable', 'a card cannot move to another user');
select extensions.is(
  pg_temp.outcome(format('insert into app_private.manager_card_retired_serials (serial) values (''424242''); '
    || 'insert into app.manager_cards (user_id, serial) values (%L, ''424242'')', pg_temp.usr('X')))
  || ',' || pg_temp.outcome(format('insert into app.manager_cards (user_id) values (%L); '
    || 'insert into app_private.manager_card_retired_serials (serial) values (''424242''); '
    || 'update app.manager_cards set serial = ''424242'' where user_id = %L',
    pg_temp.usr('X'), pg_temp.usr('X'))),
  'PT409 manager_card_serial_retired,PT409 manager_card_serial_retired',
  'a retired number is never issued again, on insert or update');

-- ---------------------------------------------------------------------------
-- The rules table
-- ---------------------------------------------------------------------------
select extensions.is(
  left(pg_temp.outcome('insert into app_private.manager_card_rules (version, config) values (0, ''{}'')'), 5) || ','
    || left(pg_temp.outcome('insert into app_private.manager_card_rules (version, config) values (1, ''[]'')'), 5),
  '23514,23514', 'a rules version is above 0 and its config an object');
select extensions.is(
  left(pg_temp.outcome('insert into app_private.manager_card_rules (version, config, active) values (1, ''{}'', true); '
    || 'insert into app_private.manager_card_rules (version, config, active) values (2, ''{}'', true)'), 5),
  '23505', 'only one ruleset can be active');
select extensions.is(
  pg_temp.outcome('insert into app_private.manager_card_rules (version, config, active) values (1, ''{}'', true); '
    || 'insert into app_private.manager_card_rules (version, config) values (2, ''{}''); '
    || 'update app_private.manager_card_rules set active = false where version = 1; '
    || 'update app_private.manager_card_rules set active = true where version = 2'),
  'ok', 'a new version becomes active once the old one steps down');
select extensions.is(
  pg_temp.outcome('insert into app_private.manager_card_rules (version, config) values (1, ''{"a": 1}''); '
    || 'update app_private.manager_card_rules set config = ''{"a": 2}'' where version = 1')
  || ',' || pg_temp.outcome('insert into app_private.manager_card_rules (version, config) values (1, ''{"a": 1}''); '
    || 'update app_private.manager_card_rules set version = 9 where version = 1'),
  'PT409 manager_card_rules_immutable,PT409 manager_card_rules_immutable',
  'a version''s config and number never change: a new formula is a new version');

-- ---------------------------------------------------------------------------
-- Visitors, anon, the step-up and the read switch (reads are off here)
-- ---------------------------------------------------------------------------
create temp table read_calls (n integer, expr text);
insert into read_calls values
  (1, 'api.get_my_manager_card()'),
  (2, format('api.get_manager_cards(array[%L]::uuid[])', pg_temp.tm('A'))),
  (3, 'api.get_my_manager_card_history(null, null, 20)'),
  (4, 'api.ack_manager_card_moments(array[''card_created''])');
create function pg_temp.off_answers() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    '{"available": false}'::jsonb, '{"available": false}'::jsonb, '{"available": false}'::jsonb,
    '{"acknowledged": [], "ignored": ["card_created"]}'::jsonb)
$$;
select extensions.is(
  (select jsonb_agg(pg_temp.run(null, null, expr) order by n) from read_calls),
  pg_temp.off_answers(),
  'a visitor with no user is answered "off" while the read switch is off: the switch is checked first');
select extensions.is(
  (select jsonb_agg(pg_temp.run(null, null, expr, 'service_role') order by n) from read_calls),
  pg_temp.off_answers(),
  'and so is the service role: off is an answer, HTTP 200, never an error');
select extensions.is(
  (select string_agg(left(pg_temp.run(null, null, expr, 'anon') ->> '__error', 5), ',' order by n) from read_calls),
  '42501,42501,42501,42501', 'anon is refused by the grants on the four signed-in functions: permission denied');
select extensions.is(
  (select jsonb_agg(pg_temp.run(pg_temp.usr('A'), 'aal1', expr) order by n) from read_calls),
  pg_temp.off_answers(),
  'a signed-in user is answered "off" while the read switch is off');
select extensions.is(
  (select jsonb_agg(pg_temp.run(pg_temp.usr('Y'), 'aal1', expr) order by n) from read_calls),
  pg_temp.off_answers(),
  'a user with a verified factor at aal1 is answered "off" too: the switch comes before the step-up');
select extensions.is(
  (select jsonb_agg(pg_temp.run(pg_temp.usr('Y'), 'aal2', expr) order by n) from read_calls),
  pg_temp.off_answers(),
  'and at aal2 as well');
select extensions.is(
  (select string_agg(pg_temp.run(null, null, 'api.manager_card_status()', r.role)::text, '|' order by r.role)
   from unnest(array['anon', 'authenticated', 'service_role']) as r(role)),
  (select string_agg('{"enabled": false, "minRated": null, "minConfirmed": null}', '|' order by r.role)
   from unnest(array['anon', 'authenticated', 'service_role']) as r(role)),
  'the status read answers off to anon, a visitor and the service role: enabled false, no numbers');

-- ---------------------------------------------------------------------------
-- The tick answers off and no_rules without writing anything
-- ---------------------------------------------------------------------------
select set_config('test.state', pg_temp.card_state(), true);
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('off', current_setting('test.fs'));
select extensions.ok(
  current_setting('test.tick')::jsonb = '{"outcome": "off"}'::jsonb
  and pg_temp.card_state() = current_setting('test.state'),
  'the tick with the switch off answers off and writes nothing, the job log included');

insert into app_private.manager_card_rules (version, config, active) values
  (1, '{"minimum_gameweeks":3,"provisional_below":5,"trf_window_gameweeks":3,"cap_ignore_deadlines_before":"2089-09-05T00:00:00Z","scales":{"cap":[[0,0],[1,100]],"sel":[[0,0],[1,100]],"trf":[[-10,0],[10,100]],"con":[[0,0],[1,100]]},"tiers":{"stade":50,"pro":65,"champion":78,"legend":88},"batch_size":500}',
   false);
select extensions.is(app_private.manager_card_configure(true, null),
  '{"computeEnabled": true, "readEnabled": false}'::jsonb,
  'the switch turns compute on and leaves read as it was');
select set_config('test.state', pg_temp.card_state(), true);
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('no_rules', current_setting('test.fs'));
select extensions.ok(
  current_setting('test.tick')::jsonb = '{"outcome": "no_rules"}'::jsonb
  and pg_temp.card_state() = current_setting('test.state'),
  'with compute on but no active rules the tick answers no_rules and writes nothing');

update app_private.manager_card_rules set active = true where version = 1;
select app_private.manager_card_configure(false, null);
select set_config('test.state', pg_temp.card_state(), true);
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('off with rules', current_setting('test.fs'));
select extensions.ok(
  current_setting('test.tick')::jsonb = '{"outcome": "off"}'::jsonb
  and pg_temp.card_state() = current_setting('test.state'),
  'active rules do not switch compute on: the tick still answers off');
select app_private.manager_card_configure(true, null);

-- ---------------------------------------------------------------------------
-- The first tick: GW1, GW2, GW3, GW5 (GW4 cancelled, GW6 still scheduled)
-- ---------------------------------------------------------------------------
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('first tick', current_setting('test.fs'));
-- teams: GW1 and GW2 rate A, B, C, G (D is deleted-pending, E suspended); GW3 and
-- GW5 add F = 4 + 4 + 5 + 5 = 18; every season and history row is new or
-- changes at each step (18 each); B's mismatching scoring_details shows in
-- the GW3 and the GW5 evaluations (2).
select extensions.is(current_setting('test.tick')::jsonb,
  '{"outcome": "evaluated", "rulesVersion": 1, "gameweeks": 4, "teams": 18, "cardsWritten": 18,
    "historyWritten": 18, "capMismatches": 2, "failed": 0, "skipped": 0, "morePending": false}'::jsonb,
  'the first tick evaluates the four evaluable gameweeks in order');
select extensions.is(
  (select count(*)::text || ':' || min(outcome) || ':' || (min(detail::text)::jsonb = current_setting('test.tick')::jsonb - 'outcome')::text
   from app_private.manager_card_job_log),
  '1:evaluated:true', 'and logs one job-log row with the same counts');
select extensions.is(
  (select string_agg(g.sequence_number || ':' || e.rules_version || ':' || e.scoring_input_version
      || ':' || e.cards_written, ',' order by g.sequence_number)
   from app_private.manager_card_evaluations e join app.fantasy_gameweeks g on g.id = e.gameweek_id),
  '1:1:1:4,2:1:1:4,3:1:1:5,5:1:1:5',
  'the ledger has a row per evaluated gameweek: none for the cancelled GW4 or the scheduled GW6');
select extensions.is(
  (app_private.manager_card_evaluate_gameweek(pg_temp.gw(4), 1) ->> 'outcome') || ','
    || (app_private.manager_card_evaluate_gameweek(pg_temp.gw(6), 1) ->> 'outcome') || ','
    || (app_private.manager_card_evaluate_gameweek(pg_temp.id(10), 1) ->> 'outcome'),
  'not_evaluable,not_evaluable,not_evaluable',
  'a cancelled gameweek (even with a postwork row), a scheduled one and one without postwork are not evaluable');
select extensions.is(
  (select string_agg(u.t, ',' order by u.t) from unnest(array['A', 'B', 'C', 'D', 'E', 'F', 'G']) u(t)
   join app.manager_cards c on c.user_id = pg_temp.usr(u.t)),
  'A,B,C,F,G', 'five managers got a card; the deleted-pending D and the suspended E did not');
select extensions.is((select count(*)::integer from app.manager_cards where user_id = pg_temp.usr('D')), 0,
  'a profile waiting for deletion gets no card from the tick');
select extensions.ok(
  (select count(*) = 5 and bool_and(serial ~ '^[1-9][0-9]{5}$') and count(distinct serial) = 5
   from app.manager_cards),
  'each card has its own six-digit number');
select extensions.is((select count(*)::integer from app.manager_card_gameweeks), 18,
  'the history has a row per rated manager per gameweek: 4 + 4 + 5 + 5');
select extensions.is_empty($q$
  select e.team, e.gw from exp_a e
  left join app.manager_card_gameweeks h
    on h.user_id = pg_temp.usr(e.team) and h.gameweek_id = pg_temp.gw(e.gw)
  where h.user_id is null
    or (h.ovr, h.tier, h.cap, h.sel, h.trf, h.con, h.cap_raw, h.sel_raw, h.trf_raw, h.con_raw,
        h.gameweeks_counted, h.provisional, h.rules_version, h.fantasy_season_id)
      is distinct from
       (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw,
        e.counted, e.provisional, 1, pg_temp.id(5))
$q$, 'every history row is the hand-computed figure (OVR, tier, stats, raw figures, weeks, provisional)');
select extensions.is_empty($q$
  select e.team from exp_a e
  left join app.manager_card_seasons s
    on s.user_id = pg_temp.usr(e.team) and s.fantasy_season_id = pg_temp.id(5)
  where e.gw = 5
    and (s.user_id is null
      or (s.ovr, s.tier, s.cap, s.sel, s.trf, s.con, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw,
          s.gameweeks_counted, s.provisional, s.rules_version, s.through_gameweek_id, s.fantasy_team_id)
        is distinct from
         (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw,
          e.counted, e.provisional, 1, pg_temp.gw(5), pg_temp.tm(e.team)))
$q$, 'each season row is the card as of GW5, for the manager''s own Fantasy team');
select extensions.is((select count(*)::integer from app.manager_card_seasons), 5,
  'one season row per rated manager');

-- Named cases (the values are derived in the header comment).
create function pg_temp.h(p_team text, p_gw integer, p_col text) returns text language sql as $$
  select to_jsonb(h) ->> p_col from app.manager_card_gameweeks h
  where h.user_id = pg_temp.usr(p_team) and h.gameweek_id = pg_temp.gw(p_gw)
$$;
select extensions.is(pg_temp.h('A', 3, 'cap_raw') || '/' || pg_temp.h('A', 3, 'cap'), '0.805556/81',
  'CAP: A''s absent captain is replaced by the vice in GW2 (10/12), GW3 is 7/9: mean .805556');
select extensions.is(pg_temp.h('A', 5, 'cap_raw'), '0.837037',
  'CAP: Triple Captain weeks count like any other (GW5 is 9/10)');
select extensions.is(
  coalesce(pg_temp.h('B', 3, 'cap_raw'), 'null') || '/' || coalesce(pg_temp.h('B', 3, 'cap'), 'null'),
  'null/null', 'CAP: captain and vice both absent (GW2) or a disagreeing scoring_details (GW3) skip the week');
select extensions.is(pg_temp.h('B', 5, 'cap_raw') || '/' || pg_temp.h('B', 5, 'cap'), '0.000000/1',
  'CAP: a captain on -2 counts 0, and a score never goes below 1');
select extensions.is(pg_temp.h('C', 5, 'cap_raw'), '0.833333',
  'CAP: weeks where no starter scored above 0 (GW3, GW5) are skipped');
select extensions.is(pg_temp.h('B', 3, 'sel_raw'), '0.879501',
  'SEL: Bench Boost weeks are skipped (B''s GW1 42/47 and GW3 45/52, not GW2)');
select extensions.is(pg_temp.h('C', 3, 'sel_raw'), '0.871809',
  'SEL: a week whose best eleven scores 0 or less is skipped (C''s GW3), a Free Hit week counts (GW2 51/60)');
select extensions.is(pg_temp.h('C', 5, 'sel_raw'), '0.581206',
  'SEL: negative starting points count as 0 (C''s GW5: -2/14)');
select extensions.is(
  coalesce(pg_temp.h('B', 5, 'trf_raw'), 'null') || '/' || coalesce(pg_temp.h('C', 5, 'trf_raw'), 'null'),
  'null/null', 'TRF: no transfers is null, and so are a Free Hit batch and a reversed one');
select extensions.is(pg_temp.h('A', 3, 'trf_raw') || '/' || pg_temp.h('A', 3, 'trf'), '1.000000/55',
  'TRF: X1 gives (-1 + 3) / 2 = 1, which is 55 on the scale 50 + 5x');
select extensions.is(pg_temp.h('A', 5, 'trf_raw'), '1.000000',
  'TRF: X2 and X3 are not counted before their window is evaluable');
select extensions.is(
  coalesce(pg_temp.h('G', 3, 'trf_raw'), 'null') || '/' || pg_temp.h('G', 5, 'trf_raw'),
  'null/0.000000', 'TRF: a Wildcard batch counts, once GW5 has been evaluated (-4 and +4)');
select extensions.is(pg_temp.h('C', 3, 'con_raw') || '/' || pg_temp.h('G', 3, 'con_raw'), '0.333333/0.333333',
  'CON: C''s GW2 is top half only with D counted and E left out; G''s GW3 only through the tie with A');
select extensions.is(
  coalesce(pg_temp.h('B', 3, 'ovr'), 'null') || '/' || pg_temp.h('B', 5, 'ovr') || '/' || pg_temp.h('A', 3, 'ovr'),
  'null/54/80', 'OVR: two stats are not enough, three average (162/3), four average (80.25)');
select extensions.is(
  coalesce(pg_temp.h('F', 5, 'ovr'), 'null') || '/' || coalesce(pg_temp.h('F', 5, 'cap'), 'null') || '/'
    || coalesce(pg_temp.h('F', 5, 'con'), 'null') || '/' || pg_temp.h('F', 5, 'gameweeks_counted') || '/'
    || pg_temp.h('F', 5, 'provisional'),
  'null/null/null/2/true', 'under the minimum every figure is null and the card is provisional');
select extensions.is(pg_temp.h('A', 5, 'gameweeks_counted') || '/' || pg_temp.h('A', 5, 'provisional'), '4/true',
  'a cancelled gameweek is not counted (A has a final result in GW4), and 4 weeks are provisional');

-- Idempotency.
select set_config('test.state', pg_temp.card_state(), true);
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('second tick', current_setting('test.fs'));
select extensions.ok(
  current_setting('test.tick')::jsonb = '{"outcome": "idle"}'::jsonb
  and pg_temp.card_state() = current_setting('test.state'),
  'a second tick is idle and changes nothing: cards, seasons, history, ledger and job log, timestamps included');
select set_config('test.rows', pg_temp.card_rows(), true);
select set_config('test.reeval', (select jsonb_agg(app_private.manager_card_evaluate_gameweek(pg_temp.gw(n), 1) order by n)::text
  from unnest(array[1, 2, 3, 5]) n), true);
select extensions.ok(
  (select bool_and(e ->> 'outcome' = 'evaluated' and (e ->> 'cardsWritten')::integer = 0
      and (e ->> 'historyWritten')::integer = 0)
   from jsonb_array_elements(current_setting('test.reeval')::jsonb) e)
  and pg_temp.card_rows() = current_setting('test.rows'),
  'evaluating every gameweek again by hand rewrites no card, season or history row');

-- ---------------------------------------------------------------------------
-- The reads (read switch on)
-- ---------------------------------------------------------------------------
-- By hand, as the tick would have written them: F's saved card for last
-- season S0 (30 weeks, OVR 71, pro, 70/72/71/71, one history row), and a card
-- for D, whose profile is waiting to be deleted.
insert into app.manager_card_seasons (user_id, fantasy_season_id, fantasy_team_id, ovr, tier, cap, sel,
  trf, con, cap_raw, sel_raw, trf_raw, con_raw, gameweeks_counted, provisional, rules_version,
  through_gameweek_id)
values (pg_temp.usr('F'), pg_temp.id(9), pg_temp.id(450), 71, 'pro', 70, 72, 71, 71,
  0.7, 0.72, 2.1, 0.71, 30, false, 1, pg_temp.id(10));
insert into app.manager_card_gameweeks (user_id, fantasy_season_id, gameweek_id, ovr, tier, cap, sel,
  trf, con, gameweeks_counted, provisional, rules_version)
values (pg_temp.usr('F'), pg_temp.id(9), pg_temp.id(10), 71, 'pro', 70, 72, 71, 71, 30, false, 1);
insert into app.manager_cards (user_id) values (pg_temp.usr('D'));
select app_private.manager_card_assign_serial(pg_temp.usr('D'));
insert into app.manager_card_seasons (user_id, fantasy_season_id, fantasy_team_id, ovr, tier, cap, sel,
  trf, con, gameweeks_counted, provisional, rules_version, through_gameweek_id)
values (pg_temp.usr('D'), pg_temp.id(5), pg_temp.tm('D'), 60, 'stade', 60, 60, 60, 60, 4, true, 1,
  pg_temp.gw(5));
insert into app.manager_card_gameweeks (user_id, fantasy_season_id, gameweek_id, ovr, tier, cap, sel,
  trf, con, gameweeks_counted, provisional, rules_version)
values (pg_temp.usr('D'), pg_temp.id(5), pg_temp.gw(5), 60, 'stade', 60, 60, 60, 60, 4, true, 1);

select extensions.is(app_private.manager_card_configure(null, true),
  '{"computeEnabled": true, "readEnabled": true}'::jsonb, 'the read switch turns on');

-- With the switch on and a usable rules row the reads need a user and the step-up.
select extensions.is(
  (select string_agg(pg_temp.run(null, null, expr) ->> '__error', ',' order by n) from read_calls),
  (select string_agg('PT401 authentication_required', ',') from generate_series(1, 4)),
  'with the switch on a visitor with no user is refused: authentication_required');
select extensions.is(
  (select string_agg(pg_temp.run(null, null, expr, 'service_role') ->> '__error', ',' order by n) from read_calls),
  (select string_agg('PT401 authentication_required', ',') from generate_series(1, 4)),
  'and so is the service role: the reads need a signed-in user');
select extensions.is(
  (select string_agg(pg_temp.run(pg_temp.usr('Y'), 'aal1', expr) ->> '__error', ',' order by n) from read_calls),
  (select string_agg('PT403 mfa_required', ',') from generate_series(1, 4)),
  'a user with a verified factor at aal1 is stopped by the step-up');
select extensions.is(
  (select string_agg(coalesce(pg_temp.run(pg_temp.usr('Y'), 'aal2', expr) ->> '__error', 'ok'), ',' order by n) from read_calls),
  'ok,ok,ok,ok', 'and at aal2 reaches the answer');
select extensions.is(
  (select string_agg(pg_temp.run(null, null, 'api.manager_card_status()', r.role)::text, '|' order by r.role)
   from unnest(array['anon', 'authenticated', 'service_role']) as r(role)),
  (select string_agg('{"enabled": true, "minRated": 3, "minConfirmed": 5}', '|' order by r.role)
   from unnest(array['anon', 'authenticated', 'service_role']) as r(role)),
  'the status read answers on to everyone with the rules'' minimums');

select set_config('test.serial_a', (select serial from app.manager_cards where user_id = pg_temp.usr('A')), true);
-- The card of a user, or SQL null; the member card of a team, as another manager reads it.
create function pg_temp.card_of(p_user uuid) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', 'api.get_my_manager_card()') -> 'card'
$$;
create function pg_temp.member_of(p_reader uuid, p_team uuid) returns jsonb language sql as $$
  select pg_temp.run(p_reader, 'aal1', format('api.get_manager_cards(array[%L]::uuid[])', p_team)) -> 'cards' -> 0
$$;
create function pg_temp.stat(p_value integer, p_reason text default null) returns jsonb language sql as $$
  select jsonb_build_object('value', p_value, 'nullReason', p_reason)
$$;
create function pg_temp.mine_core(p_user uuid) returns jsonb language sql as $$
  select jsonb_build_object('teamId', c -> 'teamId', 'name', c -> 'name', 'handle', c -> 'handle',
    'serial', c -> 'serial', 'founder', c -> 'founder', 'season', c -> 'season',
    'ratingState', c -> 'ratingState', 'ovr', c -> 'ovr', 'ovrNullReason', c -> 'ovrNullReason',
    'tier', c -> 'tier', 'provisional', c -> 'provisional', 'stats', c -> 'stats',
    'gameweeksCounted', c -> 'gameweeksCounted', 'rulesVersion', c -> 'rulesVersion',
    'club', c -> 'club')
  from (select pg_temp.card_of(p_user) as c) x
$$;
select extensions.is(
  pg_temp.mine_core(pg_temp.usr('A')),
  jsonb_build_object(
    'teamId', pg_temp.tm('A'), 'name', 'Amina Test', 'handle', 'amina_mc',
    'serial', current_setting('test.serial_a'), 'founder', null,
    'season', jsonb_build_object('id', pg_temp.id(5), 'label', '2089/90'),
    'ratingState', 'provisional', 'ovr', 81, 'ovrNullReason', null, 'tier', 'champion',
    'provisional', true,
    'stats', jsonb_build_object('cap', pg_temp.stat(84), 'sel', pg_temp.stat(85),
      'trf', pg_temp.stat(55), 'con', pg_temp.stat(99)),
    'gameweeksCounted', 4, 'rulesVersion', 'v1',
    'club', jsonb_build_object('id', pg_temp.id(6), 'slug', 'manager-card-club-1', 'code', 'MCC',
      'name', jsonb_build_object('fr', 'Club MC', 'ar', 'MC Club'),
      'shortName', jsonb_build_object('fr', 'Club FR', 'ar', 'MC'),
      'city', null, 'primaryColor', '#112233', 'secondaryColor', '#445566')),
  'A reads her card: display name, handle, serial, season, OVR 81, stats as {value, nullReason}, "v1", club with slug and names (Arabic falls back to the Latin name)');
select extensions.is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.card_of(pg_temp.usr('A'))) k),
  array['bestTier', 'calculatedAt', 'club', 'createdAt', 'firstCountedGameweekSeq',
    'firstRatedGameweekSeq', 'founder', 'gameweeksCounted', 'handle', 'minConfirmed', 'minRated',
    'moments', 'name', 'nextTier', 'ovr', 'ovrNullReason', 'previousSeason', 'provisional',
    'ratingGameweeks', 'ratingGameweeksComplete', 'ratingState', 'rulesVersion', 'season',
    'seasonClosed', 'seasons', 'serial', 'stats', 'teamId', 'throughGameweekSeq', 'tier'],
  'a card has exactly those thirty fields');
select extensions.ok(
  position(pg_temp.usr('A')::text in pg_temp.member_of(pg_temp.usr('B'), pg_temp.tm('A'))::text) = 0
  and position('example.test' in pg_temp.member_of(pg_temp.usr('B'), pg_temp.tm('A'))::text) = 0,
  'a member card carries neither a user id nor an e-mail address');
select extensions.is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.member_of(pg_temp.usr('B'), pg_temp.tm('A'))) k),
  array['club', 'firstRatedGameweekSeq', 'founderCohort', 'gameweeksCounted', 'minRated', 'name',
    'ovr', 'provisional', 'ratingState', 'seasonLabel', 'serial', 'stats', 'teamId', 'tier'],
  'and has exactly those fourteen fields (no handle, no moments)');
select extensions.is(
  pg_temp.member_of(pg_temp.usr('B'), pg_temp.tm('A')),
  jsonb_build_object(
    'teamId', pg_temp.tm('A'), 'name', 'Amina Test',
    'club', pg_temp.card_of(pg_temp.usr('A')) -> 'club',
    'serial', current_setting('test.serial_a'), 'founderCohort', null, 'seasonLabel', '2089/90',
    'ratingState', 'provisional', 'ovr', 81, 'tier', 'champion', 'provisional', true,
    'stats', jsonb_build_object('cap', 84, 'sel', 85, 'trf', 55, 'con', 99),
    'gameweeksCounted', 4, 'minRated', 3,
    'firstRatedGameweekSeq', pg_temp.card_of(pg_temp.usr('A')) -> 'firstRatedGameweekSeq'),
  'another signed-in manager reads A''s member card by her Fantasy team: the same figures');
select extensions.is(
  pg_temp.mine_core(pg_temp.usr('B')),
  jsonb_build_object(
    'teamId', pg_temp.tm('B'), 'name', 'Brahim Test', 'handle', 'brahim_mc',
    'serial', (select serial from app.manager_cards where user_id = pg_temp.usr('B')), 'founder', null,
    'season', jsonb_build_object('id', pg_temp.id(5), 'label', '2089/90'),
    'ratingState', 'provisional', 'ovr', 54, 'ovrNullReason', null, 'tier', 'stade',
    'provisional', true,
    'stats', jsonb_build_object('cap', pg_temp.stat(1), 'sel', pg_temp.stat(86),
      'trf', pg_temp.stat(null, 'no_transfers'), 'con', pg_temp.stat(75)),
    'gameweeksCounted', 4, 'rulesVersion', 'v1',
    'club', jsonb_build_object('id', pg_temp.id(7), 'slug', 'manager-card-club-2', 'code', 'MCD',
      'name', jsonb_build_object('fr', 'MC Deux', 'ar', 'اثنان'),
      'shortName', jsonb_build_object('fr', 'Deux FR', 'ar', 'اثنان'),
      'city', null, 'primaryColor', null, 'secondaryColor', null)),
  'B''s card: a missing stat is {null, no_transfers}, the club has both languages and no colours');
select extensions.is(
  pg_temp.mine_core(pg_temp.usr('G')),
  jsonb_build_object(
    'teamId', pg_temp.tm('G'), 'name', 'Team G', 'handle', null,
    'serial', (select serial from app.manager_cards where user_id = pg_temp.usr('G')), 'founder', null,
    'season', jsonb_build_object('id', pg_temp.id(5), 'label', '2089/90'),
    'ratingState', 'provisional', 'ovr', 56, 'ovrNullReason', null, 'tier', 'stade',
    'provisional', true,
    'stats', jsonb_build_object('cap', pg_temp.stat(61), 'sel', pg_temp.stat(86),
      'trf', pg_temp.stat(50), 'con', pg_temp.stat(25)),
    'gameweeksCounted', 4, 'rulesVersion', 'v1', 'club', null),
  'G has no display name (the team name is shown), no handle and no favourite club (club is null)');
select extensions.is(
  pg_temp.mine_core(pg_temp.usr('F')),
  jsonb_build_object(
    'teamId', pg_temp.tm('F'), 'name', 'Fatima Test', 'handle', 'fatima_mc',
    'serial', (select serial from app.manager_cards where user_id = pg_temp.usr('F')), 'founder', null,
    'season', jsonb_build_object('id', pg_temp.id(5), 'label', '2089/90'),
    'ratingState', 'forming', 'ovr', null, 'ovrNullReason', 'pending_minimum', 'tier', null,
    'provisional', false,
    'stats', jsonb_build_object('cap', pg_temp.stat(null, 'pending_minimum'),
      'sel', pg_temp.stat(null, 'pending_minimum'), 'trf', pg_temp.stat(null, 'pending_minimum'),
      'con', pg_temp.stat(null, 'pending_minimum')),
    'gameweeksCounted', 2, 'rulesVersion', 'v1', 'club', null),
  'F, under the minimum this season (2 weeks), is forming: this season, no figures, "pending_minimum" for each');
select extensions.is(
  pg_temp.card_of(pg_temp.usr('F')) -> 'previousSeason',
  jsonb_build_object('label', '2088/89', 'ovr', 71, 'tier', 'pro'),
  'and carries last season''s label and figures as previousSeason (D7, drawn by the client)');
select extensions.is(
  pg_temp.member_of(pg_temp.usr('A'), pg_temp.tm('F')),
  jsonb_build_object(
    'teamId', pg_temp.tm('F'), 'name', 'Fatima Test', 'club', null,
    'serial', (select serial from app.manager_cards where user_id = pg_temp.usr('F')),
    'founderCohort', null, 'seasonLabel', '2089/90', 'ratingState', 'forming', 'ovr', null,
    'tier', null, 'provisional', false,
    'stats', jsonb_build_object('cap', null, 'sel', null, 'trf', null, 'con', null),
    'gameweeksCounted', 2, 'minRated', 3, 'firstRatedGameweekSeq', null),
  'another manager reading F''s team sees this season''s forming card, never another season''s figures');
select extensions.is(
  (select jsonb_agg(e -> 'teamId') from jsonb_array_elements(pg_temp.run(pg_temp.usr('A'), 'aal1',
    format('api.get_manager_cards(array[%L, %L, %L, %L, %L, %L, null]::uuid[])',
      pg_temp.tm('B'), pg_temp.tm('A'), pg_temp.tm('B'), pg_temp.id(9999), pg_temp.tm('C'), pg_temp.tm('D'))) -> 'cards') e),
  jsonb_build_array(pg_temp.tm('B'), pg_temp.tm('A'), pg_temp.tm('C')),
  'the batch read keeps the order first asked, drops duplicates, nulls, unknown teams and the hidden profile D');
select extensions.is(
  jsonb_array_length(pg_temp.run(pg_temp.usr('A'), 'aal1',
    format('api.get_manager_cards(%L::uuid[])', (select array_agg(pg_temp.id(7000 + n)) from generate_series(1, 100) n))) -> 'cards')::text
  || ',' || jsonb_array_length(pg_temp.run(pg_temp.usr('A'), 'aal1',
    format('api.get_manager_cards(%L::uuid[])', (select array_agg(pg_temp.tm('A')) from generate_series(1, 150) n))) -> 'cards')::text
  || ',' || (pg_temp.run(pg_temp.usr('A'), 'aal1', 'api.get_manager_cards(array[]::uuid[])'))::text
  || ',' || (pg_temp.run(pg_temp.usr('A'), 'aal1', 'api.get_manager_cards(array[null]::uuid[])'))::text,
  '0,1,{"cards": [], "available": true},{"cards": [], "available": true}',
  'the batch takes up to 100 distinct teams (150 copies of one are one); an empty or all-null list gives an empty list');
select extensions.is(
  (pg_temp.run(pg_temp.usr('A'), 'aal1',
    format('api.get_manager_cards(%L::uuid[])', (select array_agg(pg_temp.id(7000 + n)) from generate_series(1, 101) n))) ->> '__error')
  || ',' || (pg_temp.run(pg_temp.usr('A'), 'aal1', 'api.get_manager_cards(null)') ->> '__error'),
  'PT400 validation_failed,PT400 validation_failed',
  '101 distinct teams and a null list are refused');
select extensions.is(
  pg_temp.run(pg_temp.usr('A'), 'aal1', format('api.get_manager_cards(array[%L]::uuid[])', pg_temp.id(9999))),
  '{"available": true, "cards": []}'::jsonb, 'an unknown team has no card');
select extensions.is(
  (pg_temp.run(pg_temp.usr('A'), 'aal1', format('api.get_manager_cards(array[%L]::uuid[])', pg_temp.tm('D'))))::text
  || ',' || (pg_temp.run(pg_temp.usr('D'), 'aal1', 'api.get_my_manager_card()'))::text
  || ',' || (pg_temp.run(pg_temp.usr('D'), 'aal1', 'api.get_my_manager_card_history(null, null, 20)'))::text,
  '{"cards": [], "available": true},{"card": null, "available": true},{"items": [], "available": true, "nextBeforeSeq": null}',
  'D, whose profile is waiting to be deleted, has a saved card that no read shows: not by team, not her own, not her history');
create function pg_temp.history(p_user uuid, p_args text) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', format('api.get_my_manager_card_history(%s)', p_args))
$$;
create function pg_temp.history_items(p_user uuid, p_args text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(i - 'calculatedAt' order by o), '[]')
  from jsonb_array_elements(pg_temp.history(p_user, p_args) -> 'items') with ordinality as x(i, o)
$$;
select extensions.is(
  pg_temp.history_items(pg_temp.usr('A'), 'null, null, 2'),
  jsonb_build_array(
    jsonb_build_object('seasonId', pg_temp.id(5), 'seasonLabel', '2089/90', 'gameweekSeq', 5,
      'ovr', 81, 'tier', 'champion', 'provisional', true, 'gameweeksCounted', 4,
      'stats', jsonb_build_object('cap', 84, 'sel', 85, 'trf', 55, 'con', 99)),
    jsonb_build_object('seasonId', pg_temp.id(5), 'seasonLabel', '2089/90', 'gameweekSeq', 3,
      'ovr', 80, 'tier', 'champion', 'provisional', true, 'gameweeksCounted', 3,
      'stats', jsonb_build_object('cap', 81, 'sel', 86, 'trf', 55, 'con', 99))),
  'history comes newest first, two at a time, as nine-field rows');
select extensions.is(
  (pg_temp.history(pg_temp.usr('A'), 'null, null, 2') ->> 'nextBeforeSeq')::integer
  || ',' || (select string_agg(distinct jsonb_typeof(i -> 'calculatedAt'), ',')
    from jsonb_array_elements(pg_temp.history(pg_temp.usr('A'), 'null, null, 2') -> 'items') i)
  || ',' || (pg_temp.history(pg_temp.usr('A'), 'null, null, 2') ->> 'available'),
  '3,string,true', 'with the keyset of the last gameweek, a calculation time on every row, and available true');
select extensions.is(
  pg_temp.history(pg_temp.usr('A'), 'null, 3, 2') -> 'nextBeforeSeq',
  'null'::jsonb, 'the next page is the last one: no further keyset');
select extensions.is(
  pg_temp.history_items(pg_temp.usr('A'), format('%L, 3, 2', pg_temp.id(5))),
  jsonb_build_array(
    jsonb_build_object('seasonId', pg_temp.id(5), 'seasonLabel', '2089/90', 'gameweekSeq', 2,
      'ovr', null, 'tier', null, 'provisional', false, 'gameweeksCounted', 2,
      'stats', jsonb_build_object('cap', null, 'sel', null, 'trf', null, 'con', null)),
    jsonb_build_object('seasonId', pg_temp.id(5), 'seasonLabel', '2089/90', 'gameweekSeq', 1,
      'ovr', null, 'tier', null, 'provisional', false, 'gameweeksCounted', 1,
      'stats', jsonb_build_object('cap', null, 'sel', null, 'trf', null, 'con', null))),
  'the last two weeks are under the minimum, so they carry no figures (an explicit season gives the same pages)');
select extensions.is(
  pg_temp.history_items(pg_temp.usr('F'), format('%L, null, 20', pg_temp.id(9))),
  jsonb_build_array(
    jsonb_build_object('seasonId', pg_temp.id(9), 'seasonLabel', '2088/89', 'gameweekSeq', 1,
      'ovr', 71, 'tier', 'pro', 'provisional', false, 'gameweeksCounted', 30,
      'stats', jsonb_build_object('cap', 70, 'sel', 72, 'trf', 71, 'con', 71))),
  'F''s history for last season (asked by season) shows that season''s one row');
select extensions.is(
  (select string_agg(pg_temp.history(pg_temp.usr('A'), format('null, %s, %s', a, l)) ->> '__error', ',' order by n)
   from (values (1, 'null', '0'), (2, 'null', '51'), (3, 'null', 'null'), (4, '0', '10')) as v(n, a, l)),
  'PT400 validation_failed,PT400 validation_failed,PT400 validation_failed,PT400 validation_failed',
  'a page size of 0, 51 or null, and a keyset below 1, are refused');
select extensions.is(
  pg_temp.run(pg_temp.usr('Y'), 'aal2', 'api.get_my_manager_card()')::text || ','
    || (pg_temp.run(pg_temp.usr('Y'), 'aal2', 'api.get_my_manager_card_history(null, null, 20)')::text),
  '{"card": null, "available": true},{"items": [], "available": true, "nextBeforeSeq": null}',
  'a manager with no team reads card null and an empty history (at aal2, with a verified factor)');

-- ---------------------------------------------------------------------------
-- A correction: GW3's player 8 scored 4, not 7. The gameweek's
-- scoring_input_version goes to 2; nothing happens until its postwork completes.
-- ---------------------------------------------------------------------------
select extensions.is(
  left(pg_temp.outcome('delete from app_private.manager_card_rules where version = 1'), 5), '23503',
  'a ruleset the ledger refers to cannot be deleted');
select set_config('test.hist12', (select md5(string_agg(h::text, '|' order by h.user_id, h.gameweek_id))
  from app.manager_card_gameweeks h where h.gameweek_id in (pg_temp.gw(1), pg_temp.gw(2))), true);
select set_config('test.ledger0', (select jsonb_object_agg(g.sequence_number, e.evaluated_at)
  from app_private.manager_card_evaluations e join app.fantasy_gameweeks g on g.id = e.gameweek_id)::text, true);
update app.fantasy_player_gameweek_points set provisional_points = 4, final_points = 4
where fantasy_player_id = pg_temp.fp(8) and gameweek_id = pg_temp.gw(3);
-- The correction re-scores the teams' starting points for that gameweek too.
update app.fantasy_team_gameweek_results r set starting_points = (
  select coalesce(sum(p.final_points), 0)
  from app.fantasy_lineups l
  join app.fantasy_lineup_players lp on lp.lineup_id = l.id and lp.slot = 'starter'
  join app.fantasy_player_gameweek_points p
    on p.fantasy_player_id = lp.fantasy_player_id and p.gameweek_id = l.gameweek_id
  where l.fantasy_team_id = r.fantasy_team_id and l.gameweek_id = r.gameweek_id)
where r.gameweek_id = pg_temp.gw(3);
update app.fantasy_gameweeks set scoring_input_version = 2 where id = pg_temp.gw(3);
select set_config('test.state', pg_temp.card_state(), true);
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('version bumped, postwork pending', current_setting('test.fs'));
select extensions.ok(
  current_setting('test.tick')::jsonb = '{"outcome": "idle"}'::jsonb
  and pg_temp.card_state() = current_setting('test.state'),
  'a bumped scoring_input_version without completed postwork is not evaluable yet: the tick is idle and writes nothing');

insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
values (pg_temp.gw(3), 2, 1, '{}', statement_timestamp(), statement_timestamp());
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('correction', current_setting('test.fs'));
-- GW3 and GW5 are evaluated again (5 + 5 teams); only A, B and G change
-- (player 8 is in A's CAP and in the best eleven of A, B and G), so 3 season
-- rows (GW5 only: the GW3 evaluation never pulls a season row back) and
-- 3 + 3 history rows are rewritten.
select extensions.is(current_setting('test.tick')::jsonb,
  '{"outcome": "evaluated", "rulesVersion": 1, "gameweeks": 2, "teams": 10, "cardsWritten": 3,
    "historyWritten": 6, "capMismatches": 2, "failed": 0, "skipped": 0, "morePending": false}'::jsonb,
  'once its postwork completes the tick evaluates GW3 again, and GW5 after it, and not GW1 or GW2');
select extensions.is(
  (select string_agg(g.sequence_number || ':' || e.scoring_input_version, ',' order by g.sequence_number)
   from app_private.manager_card_evaluations e join app.fantasy_gameweeks g on g.id = e.gameweek_id),
  '1:1,2:1,3:2,5:1', 'the ledger now holds GW3 at version 2');
select extensions.ok(
  (select bool_and(case when g.sequence_number in (1, 2)
      then e.evaluated_at = (current_setting('test.ledger0')::jsonb ->> g.sequence_number::text)::timestamptz
      else e.evaluated_at > (current_setting('test.ledger0')::jsonb ->> g.sequence_number::text)::timestamptz end)
   from app_private.manager_card_evaluations e join app.fantasy_gameweeks g on g.id = e.gameweek_id),
  'GW3 and GW5 were evaluated again, GW1 and GW2 were not touched');
select extensions.is(
  (select md5(string_agg(h::text, '|' order by h.user_id, h.gameweek_id))
   from app.manager_card_gameweeks h where h.gameweek_id in (pg_temp.gw(1), pg_temp.gw(2))),
  current_setting('test.hist12'), 'the history rows of GW1 and GW2 are byte for byte the same');
select extensions.is(
  (select count(*)::integer from app_private.manager_card_job_log), 2, 'and the correction logged its own row');
select extensions.is_empty($q$
  select e.team, e.gw from (select * from exp_a where gw in (1, 2) union all select * from exp_c) e
  left join app.manager_card_gameweeks h
    on h.user_id = pg_temp.usr(e.team) and h.gameweek_id = pg_temp.gw(e.gw)
  where h.user_id is null
    or (h.ovr, h.tier, h.cap, h.sel, h.trf, h.con, h.cap_raw, h.sel_raw, h.trf_raw, h.con_raw,
        h.gameweeks_counted, h.provisional)
      is distinct from
       (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw,
        e.counted, e.provisional)
$q$, 'the corrected history rows are the hand-computed figures (A''s GW3 CAP is 4/9, A''s OVR falls from 80 to 76)');
select extensions.is_empty($q$
  select e.team from exp_c e
  left join app.manager_card_seasons s
    on s.user_id = pg_temp.usr(e.team) and s.fantasy_season_id = pg_temp.id(5)
  where e.gw = 5
    and (s.user_id is null
      or (s.ovr, s.tier, s.cap, s.sel, s.trf, s.con, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw,
          s.gameweeks_counted, s.provisional, s.through_gameweek_id)
        is distinct from
         (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw,
          e.counted, e.provisional, pg_temp.gw(5)))
$q$, 'the season rows follow: they are the corrected card as of GW5');
select extensions.is(
  pg_temp.run(pg_temp.usr('A'), 'aal1', 'api.get_my_manager_card()') #>> '{card,stats,cap,value}' || '/'
    || (pg_temp.run(pg_temp.usr('A'), 'aal1', 'api.get_my_manager_card()') #>> '{card,ovr}'),
  '73/78', 'and A''s read shows it (CAP 73, OVR 78)');

-- ---------------------------------------------------------------------------
-- Stage B: GW6 is finalized, the last gameweek of the season
-- ---------------------------------------------------------------------------
insert into app.fantasy_player_gameweek_points (fantasy_player_id, gameweek_id, provisional_points,
  final_points, minutes_played, calculation_version, football_input_version, finalized_at)
select pg_temp.fp(v.p), pg_temp.gw(v.g), v.pts, v.pts, v.mins, 1, 0, statement_timestamp()
from (values
  (6,1,3,90),(6,2,5,90),(6,3,1,90),(6,4,4,90),(6,5,2,90),(6,6,0,90),(6,7,7,90),(6,8,6,90),(6,9,3,90),
  (6,10,1,90),(6,11,2,90),(6,12,9,90),(6,13,4,90),(6,14,5,90),(6,15,1,90),(6,16,8,90),(6,17,3,90),(6,18,6,90)
) as v(g, p, pts, mins);
select pg_temp.mk_lineup('A', 6, '{1,3,4,5,6,8,9,10,13,18,15}', '{2,16,12,17}', 8, 10);
select pg_temp.mk_lineup('B', 6, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 10, 8);
select pg_temp.mk_lineup('C', 6, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 9, 8);
select pg_temp.mk_lineup('D', 6, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('E', 6, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,7,11,12}', 8, 9);
select pg_temp.mk_lineup('G', 6, '{1,3,4,5,6,8,9,10,13,14,15}', '{2,16,11,17}', 9, 8);
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
  bench_points, captain_points, transfer_hit, chip_type, provisional_score, final_score, state,
  calculation_version, finalized_at, scoring_details)
select pg_temp.tm(v.t), pg_temp.gw(v.g),
  (select coalesce(sum(p.final_points), 0)
   from app.fantasy_lineups l
   join app.fantasy_lineup_players lp on lp.lineup_id = l.id and lp.slot = 'starter'
   join app.fantasy_player_gameweek_points p
     on p.fantasy_player_id = lp.fantasy_player_id and p.gameweek_id = l.gameweek_id
   where l.fantasy_team_id = pg_temp.tm(v.t) and l.gameweek_id = pg_temp.gw(v.g)),
  0, 0, 0, v.chip::app.fantasy_chip_type, v.fin, v.fin, 'final', 1, statement_timestamp(), v.det
from (values
  ('A', 6, null, 65, null),
  ('B', 6, null, 80, null),
  ('C', 6, null, 50, null),
  ('D', 6, null, 70, null),
  ('E', 6, null, 99, null),
  ('G', 6, null, 65, '{}'::jsonb)
) as v(t, g, chip, fin, det);
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
values (pg_temp.gw(6), 1, 1, '{}', statement_timestamp(), statement_timestamp());

-- Not finalized yet: nothing to do.
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('GW6 not final', current_setting('test.fs'));
select extensions.is(current_setting('test.tick')::jsonb, '{"outcome": "idle"}'::jsonb,
  'GW6 with its postwork done but not yet final is not evaluated');
update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = statement_timestamp() where id = pg_temp.gw(6);

select set_config('test.hist_old', (select md5(string_agg(h::text, '|' order by h.user_id, h.gameweek_id))
  from app.manager_card_gameweeks h), true);
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('stage B', current_setting('test.fs'));
select extensions.is(current_setting('test.tick')::jsonb,
  '{"outcome": "evaluated", "rulesVersion": 1, "gameweeks": 1, "teams": 4, "cardsWritten": 4,
    "historyWritten": 4, "capMismatches": 1, "failed": 0, "skipped": 0, "morePending": false}'::jsonb,
  'the tick evaluates only GW6, for A, B, C and G (F has no GW6 result)');
select extensions.is((select count(*)::integer from app.manager_card_gameweeks), 24,
  'four history rows were added: 18 + 4, and the two saved by hand (D, and F''s old season)');
select extensions.is(
  (select md5(string_agg(h::text, '|' order by h.user_id, h.gameweek_id))
   from app.manager_card_gameweeks h where h.gameweek_id <> pg_temp.gw(6)),
  current_setting('test.hist_old'),
  'every earlier history row (GW1, 2, 3, 5, and the saved ones) is byte for byte the same');
select extensions.is_empty($q$
  select e.team, e.gw from (select * from exp_a where gw in (1, 2) union all select * from exp_c
      union all select * from exp_b) e
  left join app.manager_card_gameweeks h
    on h.user_id = pg_temp.usr(e.team) and h.gameweek_id = pg_temp.gw(e.gw)
  where h.user_id is null
    or (h.ovr, h.tier, h.cap, h.sel, h.trf, h.con, h.cap_raw, h.sel_raw, h.trf_raw, h.con_raw,
        h.gameweeks_counted, h.provisional)
      is distinct from
       (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw,
        e.counted, e.provisional)
$q$, 'the GW6 rows are the hand-computed figures, with A''s two late transfer batches now counted');
select extensions.is_empty($q$
  select e.team from (select * from exp_b union all select * from exp_c where team = 'F' and gw = 5) e
  left join app.manager_card_seasons s
    on s.user_id = pg_temp.usr(e.team) and s.fantasy_season_id = pg_temp.id(5)
  where s.user_id is null
    or (s.ovr, s.tier, s.cap, s.sel, s.trf, s.con, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw,
        s.gameweeks_counted, s.provisional, s.through_gameweek_id)
      is distinct from
       (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw,
        e.counted, e.provisional, pg_temp.gw(e.gw))
$q$, 'the season rows move to GW6 for A, B, C and G; F''s stays at GW5');
select extensions.is(pg_temp.h('A', 6, 'trf_raw') || '/' || pg_temp.h('A', 6, 'trf') || '/' || pg_temp.h('A', 5, 'trf_raw'),
  '2.000000/60/1.000000',
  'TRF at the season''s end: X2 (window GW3, GW5, GW6, the cancelled GW4 skipped) and X3 (GW5, GW6 only) count at GW6: (-1+3+5+1)/4 = 2; GW5 keeps 1');
select extensions.is(pg_temp.h('A', 6, 'gameweeks_counted') || '/' || pg_temp.h('A', 6, 'provisional'), '5/false',
  'five counted weeks (the cancelled GW4 is not one) are no longer provisional');
select extensions.is(
  pg_temp.h('B', 6, 'con_raw') || '/' || pg_temp.h('G', 6, 'con_raw') || '/' || pg_temp.h('C', 6, 'ovr'),
  '0.800000/0.400000/49', 'CON ties again favour the manager (G ties A in GW6); C''s 49 is homa');
select extensions.is((select tier from app.manager_card_gameweeks
  where user_id = pg_temp.usr('C') and gameweek_id = pg_temp.gw(6)), 'homa',
  'a tier below the stade cut-off is homa');
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.state', pg_temp.card_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('after stage B', current_setting('test.fs'));
select extensions.ok(
  current_setting('test.tick')::jsonb = '{"outcome": "idle"}'::jsonb
  and pg_temp.card_state() = current_setting('test.state'),
  'a tick after the season''s last gameweek is idle');

-- ---------------------------------------------------------------------------
-- The founder grant (owner-run, once)
-- ---------------------------------------------------------------------------
select set_config('test.serials', (select string_agg(user_id::text || serial, '|' order by user_id)
  from app.manager_cards), true);
select extensions.is(
  app_private.manager_card_grant_founder(pg_temp.id(5), timestamptz '2089-09-01 00:00:00+00', 1::smallint,
    array[pg_temp.usr('B')]),
  3, 'the grant marks A, C and G: B is excluded by name, D is deleted-pending, E is staff, F is a botolago.com account');
select extensions.is(
  (select string_agg(u.t || ':' || coalesce(c.founder_cohort::text, '-'), ',' order by u.t)
   from unnest(array['A', 'B', 'C', 'D', 'E', 'F', 'G']) u(t)
   join app.manager_cards c on c.user_id = pg_temp.usr(u.t)),
  'A:1,B:-,C:1,D:-,F:-,G:1', 'cohort 1 is on exactly those three, and E got no card');
select extensions.is(
  app_private.manager_card_grant_founder(pg_temp.id(5), timestamptz '2089-09-01 00:00:00+00', 2::smallint,
    array[pg_temp.usr('B')])::text
  || ',' || (select count(*) filter (where founder_cohort = 1)::text || '/' || count(*) filter (where founder_cohort = 2)::text
    from app.manager_cards),
  '0,3/0', 'a second grant marks no one and never overwrites a founder');
select extensions.is(
  (select string_agg(user_id::text || serial, '|' order by user_id) from app.manager_cards),
  current_setting('test.serials'), 'the grant left every number as it was');
select extensions.is(
  pg_temp.run(pg_temp.usr('A'), 'aal1', 'api.get_my_manager_card()') #> '{card,founder,cohort}', '1'::jsonb,
  'the founder mark shows on A''s card');
select extensions.is(
  pg_temp.outcome(format('select app_private.manager_card_grant_founder(null, now(), 1::smallint, null)'))
  || ',' || pg_temp.outcome(format('select app_private.manager_card_grant_founder(%L, now(), 1::smallint, null)', pg_temp.id(9999))),
  'PT400 validation_failed,PT404 fantasy_season_not_found', 'the grant refuses missing arguments and unknown seasons');

-- ---------------------------------------------------------------------------
-- A new ruleset: the tick works through the gameweeks in batches
-- ---------------------------------------------------------------------------
insert into app_private.manager_card_rules (version, config, active)
select 2, config || '{"batch_size": 1}'::jsonb, false from app_private.manager_card_rules where version = 1;
update app_private.manager_card_rules set active = false where version = 1;
update app_private.manager_card_rules set active = true where version = 2;
select set_config('test.fs', pg_temp.fantasy_state(), true);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select pg_temp.fantasy_check('rules v2', current_setting('test.fs'));
select extensions.is(current_setting('test.tick')::jsonb,
  '{"outcome": "more_pending", "rulesVersion": 2, "gameweeks": 1, "teams": 4, "cardsWritten": 0,
    "historyWritten": 4, "capMismatches": 0, "failed": 0, "skipped": 0, "morePending": true}'::jsonb,
  'under rules v2 with batch_size 1 the tick evaluates one gameweek (GW1) and reports more pending');
select extensions.is(
  (select count(*) filter (where rules_version = 2)::text from app.manager_card_gameweeks) || '/'
    || (select count(*) filter (where rules_version = 2)::text from app.manager_card_seasons),
  '4/0', 'its history rows are on v2, and the season rows stay on v1 until the latest gameweek is reached');

-- ---------------------------------------------------------------------------
-- Deletion: the card goes with the profile and its number is retired
-- ---------------------------------------------------------------------------
-- X's number: the first of 555555.. that no card holds (the tick drew its numbers at random).
select set_config('test.x_serial', (select s::text from generate_series(555555, 555700) s
  where s::text not in (select serial from app.manager_cards where serial is not null) limit 1), true);
insert into app.manager_cards (user_id, serial) values (pg_temp.usr('X'), current_setting('test.x_serial'));
insert into app.manager_card_seasons (user_id, fantasy_season_id, fantasy_team_id, ovr, tier,
  gameweeks_counted, provisional, rules_version, through_gameweek_id)
values (pg_temp.usr('X'), pg_temp.id(5), pg_temp.tm('G'), 50, 'stade', 4, true, 1, pg_temp.gw(1));
insert into app.manager_card_gameweeks (user_id, fantasy_season_id, gameweek_id, ovr, tier,
  gameweeks_counted, provisional, rules_version)
values (pg_temp.usr('X'), pg_temp.id(5), pg_temp.gw(1), 50, 'stade', 4, true, 1);
select extensions.is(
  (select count(*)::integer from app.manager_cards where user_id = pg_temp.usr('X'))
  + (select count(*)::integer from app.manager_card_seasons where user_id = pg_temp.usr('X'))
  + (select count(*)::integer from app.manager_card_gameweeks where user_id = pg_temp.usr('X')),
  3, 'X has a card, a season row and a history row');
delete from app.profiles where id = pg_temp.usr('X');
select extensions.is(
  (select count(*)::integer from app.manager_cards where user_id = pg_temp.usr('X'))
  + (select count(*)::integer from app.manager_card_seasons where user_id = pg_temp.usr('X'))
  + (select count(*)::integer from app.manager_card_gameweeks where user_id = pg_temp.usr('X')),
  0, 'deleting the profile removes all three');
select extensions.is((select count(*)::integer from app_private.manager_card_retired_serials where serial = current_setting('test.x_serial')),
  1, 'and retires the number');
select extensions.is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
   where table_schema = 'app_private' and table_name = 'manager_card_retired_serials'),
  array['serial', 'retired_at'], 'the retired list holds a number and a date: no user id');
select extensions.is(
  (select count(*)::integer from app.manager_card_seasons where user_id = pg_temp.usr('G')), 1,
  'another manager''s rows (even on the same Fantasy team) are untouched');
select extensions.is(
  pg_temp.outcome(format('insert into app.manager_cards (user_id, serial) values (%L, %L)', pg_temp.usr('Z'),
    current_setting('test.x_serial'))),
  'PT409 manager_card_serial_retired', 'the number cannot be given to anyone else');
select extensions.ok(
  (select a ~ '^[1-9][0-9]{5}$' and a <> current_setting('test.x_serial') and app_private.manager_card_assign_serial(pg_temp.usr('Z')) = a
   from (select app_private.manager_card_assign_serial(pg_temp.usr('Z')) as a) s),
  'assigning a number gives a new six-digit one, the same one when asked again');

-- Catalogue rollback: Fantasy parents take the card rows with them.
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value, free_transfers)
values (pg_temp.tm('Z'), pg_temp.usr('Z'), pg_temp.id(5), 'Team Z', 0, 100, 1);
insert into app.manager_card_seasons (user_id, fantasy_season_id, fantasy_team_id, gameweeks_counted,
  provisional, rules_version, through_gameweek_id)
values (pg_temp.usr('Z'), pg_temp.id(5), pg_temp.tm('Z'), 0, true, 1, pg_temp.gw(1));
delete from app.fantasy_teams where id = pg_temp.tm('Z');
select extensions.is(
  (select count(*)::text from app.manager_card_seasons where user_id = pg_temp.usr('Z')) || '/'
    || (select count(*)::text from app.manager_cards where user_id = pg_temp.usr('Z')),
  '0/1', 'deleting a Fantasy team removes its season row and keeps the card');
delete from app.fantasy_gameweeks where id = pg_temp.id(10);
select extensions.is(
  (select count(*)::text from app.manager_card_seasons where user_id = pg_temp.usr('F') and fantasy_season_id = pg_temp.id(9))
    || '/' || (select count(*)::text from app.manager_card_gameweeks where user_id = pg_temp.usr('F') and fantasy_season_id = pg_temp.id(9))
    || '/' || (select count(*)::text from app.manager_card_seasons where user_id = pg_temp.usr('F') and fantasy_season_id = pg_temp.id(5)),
  '0/0/1', 'deleting a gameweek removes the season and history rows that refer to it, and no other');

-- ---------------------------------------------------------------------------
-- The prune
-- ---------------------------------------------------------------------------
select set_config('test.cards', pg_temp.card_rows(), true);
select set_config('test.logs', (select count(*)::text from app_private.manager_card_job_log), true);
insert into app_private.manager_card_job_log (started_at, finished_at, outcome) values
  (now() - interval '200 days', now() - interval '200 days', 'probe_old'),
  (now() - interval '10 days', now() - interval '10 days', 'probe_recent');
insert into cron.job_run_details (jobid, runid, status, start_time, end_time)
select j.jobid, v.runid, 'succeeded', now() - (v.days || ' days')::interval, now() - (v.days || ' days')::interval
from (values ('manager-card-tick', 90001, 10), ('manager-card-tick', 90002, 3),
  ('manager-card-history-prune', 90003, 30), ('account-deletion-tick', 90004, 30)) v(job, runid, days)
join cron.job j on j.jobname = v.job;
do $do$ begin
  execute (select command from cron.job where jobname = 'manager-card-history-prune');
end $do$;
select extensions.is(
  (select string_agg(runid::text, ',' order by runid) from cron.job_run_details where runid between 90001 and 90004),
  '90002,90003,90004',
  'the prune deletes the tick''s run details older than 7 days and no one else''s');
select extensions.is(
  (select string_agg(outcome, ',' order by outcome) from app_private.manager_card_job_log where outcome like 'probe%'),
  'probe_recent', 'and job-log rows older than 180 days, not the recent ones');
select extensions.is((select count(*)::text from app_private.manager_card_job_log where outcome not like 'probe%'),
  current_setting('test.logs'), 'the ticks'' own log rows are kept');
select extensions.is(pg_temp.card_rows(), current_setting('test.cards'),
  'the prune left every card, season, history row and retired number alone');

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select count(*) = 11 and bool_and(unchanged) from fantasy_log),
  'across all eleven ticks no Fantasy table (results, lineups, lineup players, points, gameweeks, teams, transfers, players, seasons, rankings, postwork) changed');
select extensions.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname !~ '^(pg_|information_schema)' and p.proname !~ 'manager_card'
      and p.prosrc ~* '(app|app_private)\.manager_card'),
  'no function outside the card''s own reads or writes a card table: no prize, ranking or Fantasy rule reads the card');
select extensions.ok(
  not exists (
    select 1 from pg_constraint c join card_tables ct on ct.t = c.confrelid
    where c.contype = 'f' and c.conrelid not in (select t from card_tables)),
  'and no table outside the card refers to a card table');

select * from extensions.finish();
rollback;
