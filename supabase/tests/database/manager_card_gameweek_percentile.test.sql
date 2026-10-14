-- Manager Card: each week ranked among managers (migration 20261014150000,
-- rules key "normalize": "gameweek_percentile", rules v4).
--
-- What this proves, on a small fixture of its own:
--   * without the key (rules v3) and with "none" spelled out, the figures are
--     the same, and they are the hand-computed v3 figures;
--   * the weekly mid-rank percentile: ties share their mid-rank (two captains
--     who are the best starter both get .875 of five), a skipped CAP week (no
--     captain) is left out of the cohort, a cohort of one is .5, Bench Boost
--     weeks stay out of SEL, and every week's cohort averages exactly .5;
--   * TRF is ranked among the transfers made for the same gameweek (a lone
--     transfer of another gameweek is .5);
--   * the CON tie rule: a tie group across the middle counts .5 each (v3: 1);
--   * scale invariance, the point of the key: multiplying every point by 3
--     (players, team totals, hits) leaves every v4 history row unchanged, and
--     so does adding 5 to every player's points (12 x 5 to every team total),
--     while v3 moves under both;
--   * switching from v3 to v4 recalculates silently (no rating change row);
--   * a normalize that is not "none" or "gameweek_percentile" is
--     manager_card_rules_invalid; grants and definer settings are unchanged.
--
-- FIXTURE. One season, gameweeks 1 to 3 (the season's last), six managers A-F
-- with the same fifteen (players 1-15), so the best legal eleven is the same
-- for all (59 points, 4-4-2 of S0 below) and every eleven starts player 13 (9
-- points, the best starter). Player points are the same every week (minutes
-- 90): 1:6 2:2 3:6 4:5 5:4 6:2 7:1 8:8 9:7 10:5 11:3 12:1 13:9 14:4 15:2
-- 16:3 17:2. Elevens (bench = the other four of 1-15):
--   S0 {1,3,4,5,6,8,9,10,11,13,14} 59    S1 S0 with 7 for 6       58
--   S2 S0 with 12 for 11            57    S3 S0 with 15 for 14     57
--   S4 S0 with 7 for 6, 12 for 11   56
--        GW1 eleven/captain/score   GW2                    GW3
--   A    S0  13 (9)  80             S3  9 (7)   55          S0  13  50
--   B    S0  13 (9)  70             S0  13 (9)  75          S0  -   60
--   C    S1   8 (8)  60             S0  1 (6)   65          S0  -   70
--   D    S2   1 (6)  60             S1  13 (9)  45          S0  -   80
--   E    S3  14 (4)  50             S2  8 (8)   35          S0  -   90
--   F    S4   -      40             S0  14 (4)  85 BB       S0  -   100
-- Transfers: A in GW1 (7 -> 16, 12 -> 17, hit 4), B in GW1 (15 -> 16, hit 4),
-- C in GW2 (6 -> 17). Gains over the window to GW3: A +4 and +1, B -1; C 0.
--
-- WEEKLY PERCENTILES, (below + (level - 1) / 2) / (n - 1):
--   CAP GW1 (F skipped, n 5)  E 0  D .25  C .5  A .875  B .875
--   CAP GW2 (n 6)             F 0  C .2  A .4  E .6  B .9  D .9
--   CAP GW3 (A alone)         A .5
--   SEL GW1 (n 6)             F 0  D .3  E .3  C .6  A .9  B .9
--   SEL GW2 (F BB, n 5)       A .125  E .125  D .5  B .875  C .875
--   SEL GW3 (all 59)          .5 each
--   TRF GW1 batch (n 3)       A +4 -> 1, A +1 -> .5, B -1 -> 0; GW2: C .5
--   CON GW1 80 70 60 60 50 40 A 1  B 1  C .5  D .5 (v3: 1, 1)  E 0  F 0
-- EXPECTED under v4 (scales cap/sel/trf [[0,1],[.5,50],[1,99]], con
-- [[0,1],[1,99]], k = 4, tiers as v3), by an independent reference
-- calculation:
--   GW1  A 57 58 50 60 -> 56   C 50 52 50 50 -> 51   F 50 40 50 40 -> 45
--   GW3  A 54 50 58 43 -> 51 stade   B 63 61 40 57 -> 55 stade
--        C 45 57 50 50 -> 51 stade   D 52 47 50 50 -> 50 stade
--        E 43 42 50 43 -> 45 homa    F 40 42 50 57 -> 47 homa
--   v3 at GW3: A 68 70 54 43 -> 59 ... F 49 64 50 57 -> 55.
begin;
select extensions.plan(18);

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('bc2b0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.idx(t text) returns integer language sql immutable as $$
  select array_position(array['A','B','C','D','E','F'], t)
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

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2), 'manager-card-percentile-test', 'Manager Card Percentile Test', 'MCP', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), '2093/94', '2093-08-01', '2094-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
select pg_temp.id(30 + n), pg_temp.id(3), n, 'Round ' || n, 'completed' from generate_series(1, 3) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(4), pg_temp.id(2), 'manager-card-percentile-test', 'Manager Card Percentile Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values (pg_temp.id(5), pg_temp.id(4), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
  '2093/94', 'active', '2093-08-01', '2094-06-30');

insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
select pg_temp.gw(n), pg_temp.id(5), pg_temp.id(30 + n), n, 'Gameweek ' || n,
  d, d + interval '2 hours', d + interval '2 days 2 hours', 'finalized',
  d + interval '3 days 2 hours', 'final', 1
from generate_series(1, 3) n
cross join lateral (select timestamptz '2093-09-01 10:00:00+00' + (n - 1) * interval '7 days' as d) dl;
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
select pg_temp.gw(n), 1, 1, '{}', statement_timestamp(), statement_timestamp() from generate_series(1, 3) n;

insert into app.teams (id, slug, name, short_name, code, country_id, primary_color, secondary_color)
values (pg_temp.id(6), 'manager-card-percentile-club', 'MC Percentile Club', 'MCP', 'MCP',
  (select id from app.countries where iso_alpha2 = 'MA'), '#112233', '#445566');

create temp table pc_players (n integer, code text, base integer);
insert into pc_players values (1,'GK',6),(2,'GK',2),(3,'DEF',6),(4,'DEF',5),(5,'DEF',4),(6,'DEF',2),
  (7,'DEF',1),(8,'MID',8),(9,'MID',7),(10,'MID',5),(11,'MID',3),(12,'MID',1),(13,'FWD',9),
  (14,'FWD',4),(15,'FWD',2),(16,'DEF',3),(17,'MID',2);
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id(2000 + p.n), 'manager-card-percentile-player-' || p.n, 'MC Pct Player ' || p.n, 'MCP ' || p.n,
  case p.code when 'GK' then 'goalkeeper' when 'DEF' then 'defender' when 'MID' then 'midfielder'
    else 'forward' end::app.football_position
from pc_players p;
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price)
select pg_temp.fp(p.n), pg_temp.id(5), pg_temp.id(2000 + p.n), pg_temp.id(6),
  (select id from app.fantasy_positions where code = p.code), 6
from pc_players p;
insert into app.fantasy_player_gameweek_points (fantasy_player_id, gameweek_id, provisional_points,
  final_points, minutes_played, calculation_version, football_input_version, finalized_at)
select pg_temp.fp(p.n), pg_temp.gw(g), p.base, p.base, 90, 1, 0, statement_timestamp()
from pc_players p cross join generate_series(1, 3) g;

select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.usr(u.t), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'mcp-' || lower(u.t) || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'mcp_' || lower(u.t), 'display_name', 'Percentile ' || u.t),
  statement_timestamp(), statement_timestamp()
from unnest(array['A', 'B', 'C', 'D', 'E', 'F']) as u(t);
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
select pg_temp.tm(t), pg_temp.usr(t), pg_temp.id(5), 'Team ' || t, 0, 100, 1, 'active',
  timestamptz '2093-08-01 00:00:00+00'
from unnest(array['A', 'B', 'C', 'D', 'E', 'F']) t;

create function pg_temp.eleven(s integer) returns integer[] language sql immutable as $$
  select case s
    when 0 then '{1,3,4,5,6,8,9,10,11,13,14}'::integer[]
    when 1 then '{1,3,4,5,7,8,9,10,11,13,14}'::integer[]
    when 2 then '{1,3,4,5,6,8,9,10,12,13,14}'::integer[]
    when 3 then '{1,3,4,5,6,8,9,10,11,13,15}'::integer[]
    else '{1,3,4,5,7,8,9,10,12,13,14}'::integer[] end
$$;
create temp table pc_weeks (team text, gw integer, eleven integer, captain integer, score integer, chip text);
insert into pc_weeks values
  ('A',1,0,13,80,null),('B',1,0,13,70,null),('C',1,1,8,60,null),('D',1,2,1,60,null),('E',1,3,14,50,null),('F',1,4,null,40,null),
  ('A',2,3,9,55,null),('B',2,0,13,75,null),('C',2,0,1,65,null),('D',2,1,13,45,null),('E',2,2,8,35,null),('F',2,0,14,85,'bench_boost'),
  ('A',3,0,13,50,null),('B',3,0,null,60,null),('C',3,0,null,70,null),('D',3,0,null,80,null),('E',3,0,null,90,null),('F',3,0,null,100,null);

insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
select pg_temp.id(5000 + pg_temp.idx(w.team) * 10 + w.gw), pg_temp.tm(w.team), pg_temp.gw(w.gw), 1,
  timestamptz '2093-08-01 00:00:00+00'
from pc_weeks w;
insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain,
  vice_captain, snapshot_price)
select pg_temp.id(5000 + pg_temp.idx(w.team) * 10 + w.gw), pg_temp.fp(p.n),
  (case when p.n = any (pg_temp.eleven(w.eleven)) then 'starter' else 'bench' end)::app.fantasy_lineup_slot,
  row_number() over (partition by w.team, w.gw, p.n = any (pg_temp.eleven(w.eleven)) order by p.n),
  p.n is not distinct from w.captain, false, 6
from pc_weeks w cross join generate_series(1, 15) p(n);
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
  bench_points, captain_points, transfer_hit, chip_type, provisional_score, final_score, state,
  calculation_version, finalized_at, scoring_details)
select pg_temp.tm(w.team), pg_temp.gw(w.gw), 59, 0, 0, 0, w.chip::app.fantasy_chip_type,
  w.score, w.score, 'final', 1, statement_timestamp(), null::jsonb
from pc_weeks w;

insert into app.fantasy_transfer_batches (id, fantasy_team_id, gameweek_id, idempotency_key,
  base_team_version, resulting_team_version, transfers_count, free_transfers_before,
  free_transfers_used, point_hit, bank_before, bank_after, chip_type, status)
values
  (pg_temp.id(601), pg_temp.tm('A'), pg_temp.gw(1), pg_temp.id(651), 1, 2, 2, 1, 1, 4, 0, 0, null, 'confirmed'),
  (pg_temp.id(602), pg_temp.tm('B'), pg_temp.gw(1), pg_temp.id(652), 1, 2, 1, 0, 0, 4, 0, 0, null, 'confirmed'),
  (pg_temp.id(603), pg_temp.tm('C'), pg_temp.gw(2), pg_temp.id(653), 1, 2, 1, 1, 1, 0, 0, 0, null, 'confirmed');
insert into app.fantasy_transfers (transfer_batch_id, sequence_number, player_out_id, player_in_id,
  sale_price, purchase_price)
values
  (pg_temp.id(601), 1, pg_temp.fp(7), pg_temp.fp(16), 6, 6),
  (pg_temp.id(601), 2, pg_temp.fp(12), pg_temp.fp(17), 6, 6),
  (pg_temp.id(602), 1, pg_temp.fp(15), pg_temp.fp(16), 6, 6),
  (pg_temp.id(603), 1, pg_temp.fp(6), pg_temp.fp(17), 6, 6);

-- Every point times k plus c: players k x base + c, team totals k x score +
-- 12c (eleven starters and the captain's second count), hits k x 4.
create function pg_temp.reshape(k integer, c integer) returns void language sql as $$
  update app.fantasy_player_gameweek_points pts
  set final_points = k * p.base + c, provisional_points = k * p.base + c
  from pc_players p
  where pts.fantasy_player_id = pg_temp.fp(p.n) and pts.gameweek_id in (pg_temp.gw(1), pg_temp.gw(2), pg_temp.gw(3));
  update app.fantasy_team_gameweek_results r
  set final_score = k * w.score + 12 * c, provisional_score = k * w.score + 12 * c
  from pc_weeks w
  where r.fantasy_team_id = pg_temp.tm(w.team) and r.gameweek_id = pg_temp.gw(w.gw);
  update app.fantasy_transfer_batches set point_hit = k * 4
  where id in (pg_temp.id(601), pg_temp.id(602));
$$;

-- Rules: 41 = the production v3 JSON, 42 = v3 with "normalize":"none",
-- 43 = v4 (v3 + normalize + the three scales), 44 = v4 again.
create temp table pc_rules (version integer, config jsonb);
insert into pc_rules values
  (41, '{"minimum_gameweeks":1,"provisional_below":5,"trf_window_gameweeks":3,"batch_size":2000,"scales":{"cap":[[0,1],[1,99]],"sel":[[0.5,1],[0.8,50],[1,99]],"trf":[[-10,1],[0,50],[10,99]],"con":[[0,1],[1,99]]},"tiers":{"stade":50,"pro":65,"champion":80,"legend":90},"shrinkage":{"cap":4,"sel":4,"con":4,"trf":4},"sel_numerator":"picked_starters","ovr_min_stats":1,"empty_stat_neutral":true}');
insert into pc_rules select 42, config || '{"normalize":"none"}' from pc_rules where version = 41;
insert into pc_rules select 43, config || '{"normalize":"gameweek_percentile","scales":{"cap":[[0,1],[0.5,50],[1,99]],"sel":[[0,1],[0.5,50],[1,99]],"trf":[[0,1],[0.5,50],[1,99]],"con":[[0,1],[1,99]]}}' from pc_rules where version = 41;
insert into pc_rules select 44, config from pc_rules where version = 43;
insert into app_private.manager_card_rules (version, config, active)
select version, config, false from pc_rules;

create temp table snap (label text, version integer, gw integer, team text, ovr smallint, tier text,
  cap smallint, sel smallint, trf smallint, con smallint, cap_raw numeric, sel_raw numeric,
  trf_raw numeric, con_raw numeric, counted integer, provisional boolean);
create function pg_temp.pass(p_label text, p_version integer) returns void language plpgsql as $$
declare g integer;
begin
  for g in 1 .. 3 loop
    perform app_private.manager_card_evaluate_gameweek(pg_temp.gw(g), p_version);
    insert into snap
    select p_label, p_version, g, t.t, h.ovr, h.tier, h.cap, h.sel, h.trf, h.con, h.cap_raw, h.sel_raw,
      h.trf_raw, h.con_raw, h.gameweeks_counted, h.provisional
    from unnest(array['A', 'B', 'C', 'D', 'E', 'F']) t(t)
    join app.manager_card_gameweeks h on h.user_id = pg_temp.usr(t.t) and h.gameweek_id = pg_temp.gw(g)
    where h.rules_version = p_version;
  end loop;
end;
$$;
create function pg_temp.rows_of(p_label text, p_gw integer) returns text language sql as $$
  select string_agg(s.team || ' ' || concat_ws(' ', s.cap, s.sel, s.trf, s.con, '->', s.ovr, s.tier), ' | ' order by s.team)
  from snap s where s.label = p_label and s.gw = p_gw
$$;
create function pg_temp.raws_of(p_label text, p_gw integer, p_stat text) returns text language sql as $$
  select string_agg(s.team || ':' || coalesce(case p_stat when 'cap' then s.cap_raw when 'sel' then s.sel_raw
      when 'trf' then s.trf_raw else s.con_raw end::text, 'null'), ' ' order by s.team)
  from snap s where s.label = p_label and s.gw = p_gw
$$;
-- Rows of two passes that differ (any figure, raw or tier), over all three gameweeks.
create function pg_temp.diff(p_a text, p_b text) returns integer language sql as $$
  select count(*)::integer from (
    (select gw, team, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional
     from snap where label = p_a
     except
     select gw, team, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional
     from snap where label = p_b)
    union all
    (select gw, team, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional
     from snap where label = p_b
     except
     select gw, team, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional
     from snap where label = p_a)
  ) d
$$;

-- ---------------------------------------------------------------------------
-- 1. Without the key nothing changes
-- ---------------------------------------------------------------------------
select pg_temp.pass('v3', 41);
select pg_temp.pass('v3none', 42);

select extensions.is(pg_temp.diff('v3', 'v3none'), 0,
  'normalize "none" spelled out gives exactly the rows of the same rules without the key, in every gameweek');
select extensions.is(
  pg_temp.rows_of('v3', 3),
  'A 68 70 54 43 -> 59 stade | B 66 71 49 57 -> 61 stade | C 59 71 50 57 -> 59 stade | D 61 69 50 57 -> 59 stade | E 55 68 50 43 -> 54 stade | F 49 64 50 57 -> 55 stade',
  'rules v3 (no key) at GW3: the hand-computed v3 figures (raw ratios on the v3 scales, top half with ties counted as top)');
select extensions.is(
  pg_temp.raws_of('v3', 1, 'con'),
  'A:1.000000 B:1.000000 C:1.000000 D:1.000000 E:0.000000 F:0.000000',
  'v3 CON at GW1: C and D, tied across the middle (60, 60 of 80 70 60 60 50 40), both count as top half');

-- ---------------------------------------------------------------------------
-- 2. Rules v4: the weekly percentiles
-- ---------------------------------------------------------------------------
select pg_temp.pass('v4', 43);

select extensions.is(
  (select count(*)::integer from app.manager_card_ovr_changes c where c.rules_version = 43),
  0, 'switching from v3 to v4 recalculates silently: no rating change recorded under v4');
select extensions.is(
  pg_temp.raws_of('v4', 1, 'cap'),
  'A:0.875000 B:0.875000 C:0.500000 D:0.250000 E:0.000000 F:null',
  'CAP GW1: mid-rank among the five teams with a captain (A and B tie as best starter at .875); F, without a captain, is skipped and not in the cohort');
select extensions.is(
  pg_temp.raws_of('v4', 1, 'sel'),
  'A:0.900000 B:0.900000 C:0.600000 D:0.300000 E:0.300000 F:0.000000',
  'SEL GW1: mid-rank of the picked eleven among six (59 59 58 57 57 56)');
select extensions.is(
  pg_temp.raws_of('v4', 1, 'con'),
  'A:1.000000 B:1.000000 C:0.500000 D:0.500000 E:0.000000 F:0.000000',
  'CON tie rule: the tie group across the middle (C, D at 60) counts .5 each; wholly above 1, wholly below 0');
select extensions.is(
  (select round(avg(cap_raw), 6)::text || ' ' || round(avg(sel_raw), 6)::text || ' ' || round(avg(con_raw), 6)::text
   from snap where label = 'v4' and gw = 1),
  '0.500000 0.500000 0.500000',
  'the week''s cohort averages exactly .5 for CAP, SEL and CON (the middle manager is 50)');
select extensions.is(
  pg_temp.raws_of('v4', 3, 'cap') || ' / ' || pg_temp.raws_of('v4', 3, 'sel'),
  'A:0.591667 B:0.887500 C:0.350000 D:0.575000 E:0.300000 F:0.000000 / A:0.508333 B:0.758333 C:0.658333 D:0.433333 E:0.308333 F:0.250000',
  'GW3 averages: A''s lone GW3 captain is .5 (a cohort of one); F''s Bench Boost week stays out of SEL; GW3''s equal elevens are .5 each');
select extensions.is(
  pg_temp.raws_of('v4', 3, 'trf'),
  'A:0.750000 B:0.000000 C:0.500000 D:null E:null F:null',
  'TRF ranked among the transfers made for the same gameweek: GW1 A +4 -> 1, A +1 -> .5, B -1 -> 0; C''s lone GW2 transfer .5');
select extensions.is(
  pg_temp.rows_of('v4', 1),
  'A 57 58 50 60 -> 56 stade | B 57 58 50 60 -> 56 stade | C 50 52 50 50 -> 51 stade | D 45 46 50 50 -> 48 homa | E 40 46 50 40 -> 44 homa | F 50 40 50 40 -> 45 homa',
  'v4 at GW1: the scales put the median at 50, shrinkage k = 4 as before');
select extensions.is(
  pg_temp.rows_of('v4', 3),
  'A 54 50 58 43 -> 51 stade | B 63 61 40 57 -> 55 stade | C 45 57 50 50 -> 51 stade | D 52 47 50 50 -> 50 stade | E 43 42 50 43 -> 45 homa | F 40 42 50 57 -> 47 homa',
  'v4 at GW3: the hand-computed figures (D and E, no transfer, TRF the neutral 50)');

-- ---------------------------------------------------------------------------
-- 3. Scale invariance
-- ---------------------------------------------------------------------------
select pg_temp.reshape(3, 0);
select pg_temp.pass('v4x3', 43);
select pg_temp.pass('v3x3', 41);
select pg_temp.reshape(1, 5);
select pg_temp.pass('v4p5', 43);
select pg_temp.pass('v3p5', 41);
select pg_temp.reshape(1, 0);
select pg_temp.pass('v4back', 44);

select extensions.is(pg_temp.diff('v4', 'v4x3'), 0,
  'v4: every point times 3 (players, team totals, hits) leaves every history row of every gameweek unchanged');
select extensions.is(pg_temp.diff('v4', 'v4p5'), 0,
  'v4: 5 more points for every player (and 60 for every team) leaves every history row unchanged');
select extensions.is(
  (select pg_temp.diff('v3', 'v3x3') > 0 and pg_temp.diff('v3', 'v3p5') > 0)::text
    || ' ' || (select string_agg(s.team || ':' || s.trf_raw, ' ' order by s.team) from snap s
      where s.label = 'v3x3' and s.gw = 3 and s.team in ('A', 'B'))
    || ' ' || (select string_agg(s.team || ':' || s.cap_raw, ' ' order by s.team) from snap s
      where s.label = 'v3p5' and s.gw = 3 and s.team in ('E', 'F')),
  'true A:7.500000 B:-3.000000 E:0.785714 F:0.642857',
  'while v3 moves under both: TRF gains triple, and CAP ratios climb when every point rises (E .667 -> .786, F .444 -> .643)');
select extensions.is(pg_temp.diff('v4', 'v4back'), 0,
  'and back at the original points, a second v4 row reproduces the first: the calculation is deterministic');

-- ---------------------------------------------------------------------------
-- 4. Malformed key, grants
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 90, config || '{"normalize": "percentile"}' from app_private.manager_card_rules where version = 41;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(1), 90)$q$)
  || ',' || pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 90, config || '{"normalize": true}' from app_private.manager_card_rules where version = 41;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(1), 90)$q$)
  || ',' || pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 90, config || '{"normalize": null}' from app_private.manager_card_rules where version = 41;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(1), 90)$q$),
  'PT400 manager_card_rules_invalid,PT400 manager_card_rules_invalid,PT400 manager_card_rules_invalid',
  'a normalize other than "none" or "gameweek_percentile" (an unknown word, a boolean, null) is manager_card_rules_invalid');
select extensions.ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    where has_function_privilege(r.role, 'app_private.manager_card_evaluate_gameweek(uuid,integer)', 'execute'))
  and exists (
    select 1 from pg_proc p
    where p.oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure
      and p.prosecdef and p.proowner = 'postgres'::regrole and p.proconfig @> array['search_path=""']),
  'the calculation stays closed to the API roles, security definer, owned by postgres, empty search_path');

select * from extensions.finish();
rollback;
