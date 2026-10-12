-- Manager Card: calm early scores and a fairer Selection
-- (migration 20261012170000, rules v2).
--
-- What this proves, on a small fixture of its own (manager_card.test.sql keeps
-- proving the whole calculation under rules without the new keys, which is
-- the "v1 unchanged" evidence at scale):
--   * rules WITHOUT the new keys (v1) give the plain figures;
--   * the same rules with every new key spelled out at its neutral value
--     (shrinkage 0, sel_numerator starting_points) give exactly the same rows;
--   * rules WITH them (v2) pull each stat toward 50 by its sample count
--     (two perfect weeks, k = 4: 50 + 49 x 2 / 6 = 66.33 -> 66), count the
--     transfers (not the batches) for TRF, average OVR over the pulled stats,
--     keep the card provisional until 5 weeks, use the points of the eleven
--     picked as starters for SEL instead of the automatic substitutions'
--     result, and read the wider SEL scale;
--   * malformed new keys are refused as manager_card_rules_invalid;
--   * the function is still security definer with an empty search_path and no
--     grant to anon, authenticated or service_role.
--
-- FIXTURE. One Fantasy season, two finalized gameweeks (GW1, GW2), three
-- managers A, B, C, all with the same fifteen: GK 1 2; DEF 3 4 5 6 7; MID 8 9
-- 10 11 12; FWD 13 14 15. Points (final_points), the same in both gameweeks
-- except player 7: GW1 0 and 0 minutes, GW2 1.
--   player  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15   (16 DEF, 17 MID: 3, 2
--   points  6  2  6  5  4  2  *  8  7  5  3  1  9  4  2    and not in a lineup)
-- The best legal eleven (1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD) is worth 59 in both
-- weeks: 1 3 4 5 6 8 9 10 11 13 14 = 6 + 17 + 23 + 13.
--   A  picks exactly that eleven, captain 13 (9 = the best starter): 59/59.
--   B  GW1 picks 7 instead of 6; 7 plays 0 minutes, so the automatic
--      substitution brings 6 on and the result's starting_points is 59 (as the
--      scoring engine stores it), while the eleven B PICKED scored
--      57 = 59 - 2. GW2 picks A's eleven. Captain 13.
--   C  A's eleven, captain 8 (8/9 = .888889).
-- Final scores A 80, B 70, C 60 in both weeks: with three teams A and B are in
-- the top half (above x 2 < 3), C is not: CON raw 1, 1, 0.
-- A made one confirmed transfer batch in GW1 with TWO transfers, 7 -> 16 and
-- 12 -> 17, over the window GW1-GW2: 16 scored 3+3, 7 scored 0+1 -> +5; 17
-- scored 2+2, 12 scored 1+1 -> +2. TRF raw 3.5 from n = 2 transfers.
--
-- RULES (minimum 2 weeks, window 3, tiers 50/65/80/90)
--   v1  scales cap [[0,1],[1,99]], sel [[0.5,1],[1,99]], trf [[-10,1],[0,50],
--       [10,99]], con [[0,1],[1,99]]; provisional_below 2; no new key.
--   v3  v1 plus shrinkage {0,0,0,0} and sel_numerator starting_points.
--   v2  v1 with provisional_below 5, sel [[0.5,1],[0.8,50],[1,99]],
--       shrinkage {cap 4, sel 4, con 4, trf 4}, sel_numerator picked_starters.
--
-- EXPECTED, as of GW2 (each shrunk = round(50 + (scaled - 50) x n / (n + 4)))
--   v1  A cap 99 sel 99 trf 67 (50 + 49 x .35 = 67.15) con 99 -> OVR 91
--       B cap 99 sel 99 (59/59 after the substitution) con 99 -> OVR 99 (3 of 4)
--       C cap 88 (1 + 98 x .888889) sel 99 con 1 -> OVR 63
--   v2  A cap 66 sel 66 con 66, trf 50 + 17 x 2 / 6 = 55.67 -> 56
--         -> OVR (66+66+56+66)/4 = 63.5 -> 64
--       B cap 66, sel: (57/59 + 1) / 2 = .983051 -> 50 + 49 x .183051 / .2
--         = 94.85 -> 95 -> 50 + 45 x 2 / 6 = 65, con 66 -> OVR 197/3 -> 66
--       C cap 88 -> 50 + 38 x 2 / 6 = 62.67 -> 63, sel 66, con 1 ->
--         50 - 49 x 2 / 6 = 33.67 -> 34 -> OVR 163/3 = 54.33 -> 54
begin;
select extensions.plan(14);

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('bc0f0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.idx(t text) returns integer language sql immutable as $$
  select array_position(array['A','B','C'], t)
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
-- undone either way.
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
values (pg_temp.id(2), 'manager-card-calm-test', 'Manager Card Calm Test', 'MCC', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), '2091/92', '2091-08-01', '2092-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
select pg_temp.id(30 + n), pg_temp.id(3), n, 'Round ' || n, 'completed' from generate_series(1, 2) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(4), pg_temp.id(2), 'manager-card-calm-test', 'Manager Card Calm Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values (pg_temp.id(5), pg_temp.id(4), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
  '2091/92', 'active', '2091-08-01', '2092-06-30');

insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
select pg_temp.gw(n), pg_temp.id(5), pg_temp.id(30 + n), n, 'Gameweek ' || n,
  d, d + interval '2 hours', d + interval '2 days 2 hours', 'finalized',
  d + interval '3 days 2 hours', 'final', 1
from generate_series(1, 2) n
cross join lateral (select timestamptz '2091-09-01 10:00:00+00' + (n - 1) * interval '7 days' as d) dl;
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
select pg_temp.gw(n), 1, 1, '{}', statement_timestamp(), statement_timestamp()
from generate_series(1, 2) n;

insert into app.teams (id, slug, name, short_name, code, country_id, primary_color, secondary_color)
values (pg_temp.id(6), 'manager-card-calm-club', 'MC Calm Club', 'MCC', 'MCZ',
  (select id from app.countries where iso_alpha2 = 'MA'), '#112233', '#445566');

-- Players 1-17: 1-2 GK, 3-7 DEF, 8-12 MID, 13-15 FWD, 16 DEF, 17 MID.
create temp table calm_players (n integer, code text);
insert into calm_players values (1,'GK'),(2,'GK'),(3,'DEF'),(4,'DEF'),(5,'DEF'),(6,'DEF'),(7,'DEF'),
  (8,'MID'),(9,'MID'),(10,'MID'),(11,'MID'),(12,'MID'),(13,'FWD'),(14,'FWD'),(15,'FWD'),(16,'DEF'),(17,'MID');
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id(2000 + p.n), 'manager-card-calm-player-' || p.n, 'MC Calm Player ' || p.n, 'MCCP ' || p.n,
  case p.code when 'GK' then 'goalkeeper' when 'DEF' then 'defender' when 'MID' then 'midfielder'
    else 'forward' end::app.football_position
from calm_players p;
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price)
select pg_temp.fp(p.n), pg_temp.id(5), pg_temp.id(2000 + p.n), pg_temp.id(6),
  (select id from app.fantasy_positions where code = p.code), 6
from calm_players p;

select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.usr(u.t), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, statement_timestamp(), 'hash', '{}',
  u.meta::jsonb, statement_timestamp(), statement_timestamp()
from (values
  ('A', 'mcc-a@example.test', '{"username":"amina_mcc","display_name":"Amina Calm"}'),
  ('B', 'mcc-b@example.test', '{"username":"brahim_mcc","display_name":"Brahim Calm"}'),
  ('C', 'mcc-c@example.test', '{"username":"chaimae_mcc","display_name":"Chaimae Calm"}')
) as u(t, email, meta);

insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
select pg_temp.tm(t), pg_temp.usr(t), pg_temp.id(5), 'Team ' || t, 0, 100, 1, 'active',
  timestamptz '2091-08-01 00:00:00+00'
from unnest(array['A', 'B', 'C']) t;

-- Player points (gameweek, player, final_points, minutes_played).
insert into app.fantasy_player_gameweek_points (fantasy_player_id, gameweek_id, provisional_points,
  final_points, minutes_played, calculation_version, football_input_version, finalized_at)
select pg_temp.fp(v.p), pg_temp.gw(g.n), case g.n when 1 then v.g1 else v.g2 end,
  case g.n when 1 then v.g1 else v.g2 end,
  case when v.p = 7 and g.n = 1 then 0 else 90 end, 1, 0, statement_timestamp()
from (values (1,6,6),(2,2,2),(3,6,6),(4,5,5),(5,4,4),(6,2,2),(7,0,1),(8,8,8),(9,7,7),(10,5,5),
  (11,3,3),(12,1,1),(13,9,9),(14,4,4),(15,2,2),(16,3,3),(17,2,2)) as v(p, g1, g2)
cross join generate_series(1, 2) as g(n);

-- A lineup of fifteen: team letter, gameweek, starters, bench, captain, vice.
create function pg_temp.mk_lineup(p_team text, p_gw integer, p_starters integer[], p_bench integer[],
  p_captain integer, p_vice integer) returns void language sql as $$
  with lineup as (
    insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
    values (pg_temp.id(5000 + pg_temp.idx(p_team) * 10 + p_gw), pg_temp.tm(p_team), pg_temp.gw(p_gw),
      1, timestamptz '2091-08-01 00:00:00+00')
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
select pg_temp.mk_lineup('A', 1, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 13, 8);
select pg_temp.mk_lineup('A', 2, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 13, 8);
-- B, GW1: picks 7 (0 minutes) instead of 6, who is on the bench.
select pg_temp.mk_lineup('B', 1, '{1,3,4,5,7,8,9,10,11,13,14}', '{2,6,12,15}', 13, 8);
select pg_temp.mk_lineup('B', 2, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 13, 8);
select pg_temp.mk_lineup('C', 1, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 8, 9);
select pg_temp.mk_lineup('C', 2, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 8, 9);

-- Results: starting_points is what the scoring engine stores, the automatic
-- substitution included (B, GW1: 57 picked + 2 = 59).
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
  bench_points, captain_points, transfer_hit, chip_type, provisional_score, final_score, state,
  calculation_version, finalized_at, scoring_details)
select pg_temp.tm(t), pg_temp.gw(n), 59, 0, 0, 0, null::app.fantasy_chip_type, f, f, 'final', 1, statement_timestamp(), null::jsonb
from (values ('A', 80), ('B', 70), ('C', 60)) as s(t, f)
cross join generate_series(1, 2) n;

-- A's batch: two transfers (7 -> 16, 12 -> 17) in GW1.
with batch as (
  insert into app.fantasy_transfer_batches (id, fantasy_team_id, gameweek_id, idempotency_key,
    base_team_version, resulting_team_version, transfers_count, free_transfers_before,
    free_transfers_used, point_hit, bank_before, bank_after, chip_type, status)
  values (pg_temp.id(601), pg_temp.tm('A'), pg_temp.gw(1), pg_temp.id(651), 1, 2, 2, 1, 1, 0, 0, 0,
    null, 'confirmed')
  returning id
)
insert into app.fantasy_transfers (transfer_batch_id, sequence_number, player_out_id, player_in_id,
  sale_price, purchase_price)
select batch.id, k, pg_temp.fp(o), pg_temp.fp(i), 6, 6
from batch, (values (1, 7, 16), (2, 12, 17)) as t(k, o, i);
select set_config('request.jwt.claims', '', true);

-- Rules (inserted by this test only: the migrations ship none).
insert into app_private.manager_card_rules (version, config, active) values
  (1, '{"minimum_gameweeks":2,"provisional_below":2,"trf_window_gameweeks":3,"batch_size":2000,"scales":{"cap":[[0,1],[1,99]],"sel":[[0.5,1],[1,99]],"trf":[[-10,1],[0,50],[10,99]],"con":[[0,1],[1,99]]},"tiers":{"stade":50,"pro":65,"champion":80,"legend":90}}', false),
  (2, '{"minimum_gameweeks":2,"provisional_below":5,"trf_window_gameweeks":3,"batch_size":2000,"scales":{"cap":[[0,1],[1,99]],"sel":[[0.5,1],[0.8,50],[1,99]],"trf":[[-10,1],[0,50],[10,99]],"con":[[0,1],[1,99]]},"tiers":{"stade":50,"pro":65,"champion":80,"legend":90},"shrinkage":{"cap":4,"sel":4,"con":4,"trf":4},"sel_numerator":"picked_starters"}', false),
  (3, '{"minimum_gameweeks":2,"provisional_below":2,"trf_window_gameweeks":3,"batch_size":2000,"scales":{"cap":[[0,1],[1,99]],"sel":[[0.5,1],[1,99]],"trf":[[-10,1],[0,50],[10,99]],"con":[[0,1],[1,99]]},"tiers":{"stade":50,"pro":65,"champion":80,"legend":90},"shrinkage":{"cap":0,"sel":0,"con":0,"trf":0},"sel_numerator":"starting_points"}', false);

create temp table exp_v1 (team, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional) as values
  ('A',91,'legend',99,99,67,99,1.000000,1.000000,3.500000,1.000000,2,false),
  ('B',99,'legend',99,99,null,99,1.000000,1.000000,null::numeric,1.000000,2,false),
  ('C',63,'stade',88,99,null,1,0.888889,1.000000,null::numeric,0.000000,2,false);
create temp table exp_v2 (team, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional) as values
  ('A',64,'stade',66,66,56,66,1.000000,1.000000,3.500000,1.000000,2,true),
  ('B',66,'pro',66,65,null,66,1.000000,0.983051,null::numeric,1.000000,2,true),
  ('C',54,'stade',63,66,null,34,0.888889,1.000000,null::numeric,0.000000,2,true);

-- One evaluation pass of both gameweeks under a rules version, kept as a
-- snapshot of the GW2 history rows (the history table keeps only the latest).
create temp table snap (version integer, team text, ovr smallint, tier text, cap smallint, sel smallint,
  trf smallint, con smallint, cap_raw numeric, sel_raw numeric, trf_raw numeric, con_raw numeric,
  counted integer, provisional boolean);
create function pg_temp.pass(p_version integer) returns void language plpgsql as $$
begin
  perform app_private.manager_card_evaluate_gameweek(pg_temp.gw(1), p_version);
  perform app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), p_version);
  insert into snap
  select p_version, t.t, h.ovr, h.tier, h.cap, h.sel, h.trf, h.con, h.cap_raw, h.sel_raw, h.trf_raw,
    h.con_raw, h.gameweeks_counted, h.provisional
  from unnest(array['A', 'B', 'C']) t(t)
  join app.manager_card_gameweeks h on h.user_id = pg_temp.usr(t.t) and h.gameweek_id = pg_temp.gw(2)
  where h.rules_version = p_version;
end;
$$;
select pg_temp.pass(1);
select pg_temp.pass(3);
select pg_temp.pass(2);

-- ---------------------------------------------------------------------------
-- Rules v1: no new key, the plain figures
-- ---------------------------------------------------------------------------
select extensions.is_empty($q$
  select e.team from exp_v1 e
  left join snap s on s.version = 1 and s.team = e.team
  where s.team is null
    or (s.ovr, s.tier, s.cap, s.sel, s.trf, s.con, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw, s.counted, s.provisional)
      is distinct from
       (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw, e.counted, e.provisional)
$q$, 'rules without the new keys give the plain figures (no pull toward 50, the substituted starting_points for SEL, provisional_below 2)');
select extensions.is_empty($q$
  select a.team from snap a left join snap b on b.version = 3 and b.team = a.team
  where a.version = 1
    and (a.ovr, a.tier, a.cap, a.sel, a.trf, a.con, a.cap_raw, a.sel_raw, a.trf_raw, a.con_raw, a.counted, a.provisional)
      is distinct from
       (b.ovr, b.tier, b.cap, b.sel, b.trf, b.con, b.cap_raw, b.sel_raw, b.trf_raw, b.con_raw, b.counted, b.provisional)
$q$, 'the same rules with every new key at its neutral value (shrinkage 0, sel_numerator starting_points) give identical rows: a missing key means no change');
select extensions.is(
  (select s.sel_raw::text || '/' || s.sel::text from snap s where s.version = 1 and s.team = 'B'),
  '1.000000/99',
  'v1: B''s GW1 counts the substituted 59/59, so the bench player brought on by the automatic substitution is credited');

-- ---------------------------------------------------------------------------
-- Rules v2
-- ---------------------------------------------------------------------------
select extensions.is_empty($q$
  select e.team from exp_v2 e
  left join snap s on s.version = 2 and s.team = e.team
  where s.team is null
    or (s.ovr, s.tier, s.cap, s.sel, s.trf, s.con, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw, s.counted, s.provisional)
      is distinct from
       (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw, e.counted, e.provisional)
$q$, 'rules v2 give the hand-computed figures (shrunk stats, OVR over them, tier, provisional)');
select extensions.is(
  (select s.cap_raw::text || '/' || s.cap::text || '/' || s.con::text from snap s where s.version = 2 and s.team = 'A'),
  '1.000000/66/66',
  'two perfect weeks with k = 4 are 50 + 49 x 2 / 6 = 66.33, which is 66, not 99');
select extensions.is(
  (select s.cap::text from snap s where s.version = 2 and s.team = 'C'),
  '63', 'a stat below the top is pulled the same way (CAP .888889 = 88, then 50 + 38 x 2 / 6 = 62.67 = 63)');
select extensions.is(
  (select s.con::text from snap s where s.version = 2 and s.team = 'C'),
  '34', 'and one below 50 is pulled up toward it (CON 1: 50 - 49 x 2 / 6 = 33.67 = 34)');
select extensions.is(
  (select s.trf_raw::text || '/' || s.trf::text from snap s where s.version = 2 and s.team = 'A'),
  '3.500000/56',
  'TRF counts the transfers, not the batches: one batch of two transfers is n = 2 (n = 1 would give 53)');
select extensions.is(
  (select string_agg(s.team || ':' || s.ovr::text, ',' order by s.team) from snap s where s.version = 2),
  'A:64,B:66,C:54',
  'OVR keeps its rule over the shrunk stats: A averages four (63.5 rounds to 64), B and C three');
select extensions.is(
  (select s.sel_raw::text || '/' || s.sel::text from snap s where s.version = 2 and s.team = 'B'),
  '0.983051/65',
  'v2 SEL counts the eleven B picked (57/59 in GW1), not the automatic substitution''s 59/59: .983051 reads 95 on the wide scale, then 65 after the pull');
select extensions.is(
  (select string_agg(a.provisional::text, ',' order by a.team) from snap a where a.version = 1)
    || '/' || (select string_agg(a.provisional::text, ',' order by a.team) from snap a where a.version = 2),
  'false,false,false/true,true,true',
  'two weeks are not provisional under provisional_below 2 and are under 5');

-- The wider SEL scale of v2 (0.5 -> 1, 0.8 -> 50, 1 -> 99), and malformed keys.
select extensions.is(
  (select string_agg(app_private.manager_card_scale(r, (config -> 'scales' -> 'sel'))::text, '/' order by r)
   from app_private.manager_card_rules, unnest(array[0.4, 0.5, 0.8, 0.9, 1]) r where version = 2),
  '1/1/50/75/99', 'rules v2 SEL scale: 0.4 and 0.5 read 1, 0.8 is average (50), 0.9 is 75, 1.0 is perfect (99)');
select extensions.is(
  pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 8, config || '{"sel_numerator": "bogus"}' from app_private.manager_card_rules where version = 1;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 8)$q$)
  || ',' || pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 8, config || '{"shrinkage": {"cap": -1, "sel": 4, "con": 4, "trf": 4}}' from app_private.manager_card_rules where version = 1;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 8)$q$)
  || ',' || pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 8, config || '{"shrinkage": {"cap": 4}}' from app_private.manager_card_rules where version = 1;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 8)$q$)
  || ',' || pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 8, config || '{"shrinkage": 4}' from app_private.manager_card_rules where version = 1;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 8)$q$),
  'PT400 manager_card_rules_invalid,PT400 manager_card_rules_invalid,PT400 manager_card_rules_invalid,PT400 manager_card_rules_invalid',
  'an unknown sel_numerator, a negative k, a shrinkage missing a stat and one that is not an object are all manager_card_rules_invalid');

-- The function keeps its owner, definer rights, empty search_path and grants.
select extensions.ok(
  exists (
    select 1 from pg_proc p
    where p.oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure
      and p.prosecdef and p.proowner = 'postgres'::regrole
      and p.proconfig @> array['search_path=""']
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('service_role', p.oid, 'execute')
      and has_function_privilege('postgres', p.oid, 'execute')
  ),
  'manager_card_evaluate_gameweek is still security definer with search_path empty, owned by postgres, executable by postgres alone');

select * from extensions.finish();
rollback;
