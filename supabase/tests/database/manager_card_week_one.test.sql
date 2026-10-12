-- Manager Card "week one": every stat and OVR from a manager's first finished
-- gameweek, the rating-change moments and their notification
-- (migrations 20261012200000 and 20261012200100, rules v3).
--
-- What this proves, on a small fixture of its own:
--   * rules v1 and v2 (no new key) give exactly the figures they gave before
--     this body (the hand-computed rows of manager_card_calm_scores.test.sql),
--     and v1 with the new keys spelled out at their defaults gives v1's rows;
--   * ovr_min_stats 1 gives an OVR from one stat and from two; without the key
--     the rule stays three of four;
--   * empty_stat_neutral fills a stat with no sample with 50 (raw stays null),
--     so a manager with exactly one finished gameweek, the captain the builder
--     gave him and no transfer gets all four stats and an OVR (rules v3);
--   * without cap_ignore_deadlines_before (v3) a week's captain counts; with
--     it (v2's cut-off) that week's CAP has no sample;
--   * rating changes: up and down recorded against the previous evaluated OVR
--     under the same rules, none for a first OVR, none while history rows are
--     still under another rules version (a switch of version never reads as a
--     change), and the card serves only the latest one until it is
--     acknowledged, on any device;
--   * the notification: off by default; once on, one per reader and gameweek,
--     French or Arabic text, in-app plus push to a working phone, none for a
--     reader with Fantasy reminders off, none for an older gameweek, none
--     twice;
--   * the new table, functions and grants are closed to the API roles.
--
-- FIXTURE. As manager_card_calm_scores.test.sql (one season, GW1 and GW2,
-- managers A, B, C with the same fifteen, A's two transfers in GW1), then:
--   GW2 gains three managers who joined late (one finished gameweek each),
--   final scores D 50, E 40, F 30 (A 80, B 70, C 60: A, B, C are the top half
--   of six):
--     D  A's eleven, captain 1 (the goalkeeper the builder used to give: 6
--        points, the best starter 9 -> CAP .666667), no transfer;
--     E  A's eleven, no captain, Bench Boost: no CAP, no SEL, no TRF, CON only;
--     F  A's eleven, no captain: SEL and CON only.
--   Then GW3 (points as GW2): A (captain 14: 4 of 9) scores 10 and B (captain
--   13) 90.
--
-- RULES (all tiers 50/65/80/90, window 3, scales as v1 except v2's SEL)
--   1  v1 (calm test)       2  v2 (calm test)
--   3  v1 + ovr_min_stats 3 + empty_stat_neutral false (the defaults)
--   4  v2 + minimum 1 + ovr_min_stats 1
--   5  v2 + minimum 1
--   6  v2 + minimum 1 + ovr_min_stats 1 + empty_stat_neutral true  (= rules v3)
--   7  6 + cap_ignore_deadlines_before 2092-01-01 (every week before it)
--   8  6 again under a new version number
--
-- EXPECTED at GW2, k = 4: shrunk = round(50 + (scaled - 50) x n / (n + 4))
--   D  CAP .666667 -> 66 -> n 1: 53; SEL 59/59 -> 99 -> 60; CON 0 -> 1 -> 40
--        v4/v5: OVR 153 / 3 = 51; v6: TRF 50 -> 203 / 4 = 50.75 -> 51;
--        v7: CAP no sample -> 50, OVR 200 / 4 = 50
--   E  v4: CON 40 alone -> OVR 40; v5: null; v6: 50 50 50 40 -> 47.5 -> 48
--   F  v4: SEL 60, CON 40 -> 50; v5: null; v6: 50 60 50 40 -> 50
--   A under v6: GW1 60 60 (TRF 50) 60 -> 57.5 -> 58; GW2 66 66 56 66 -> 64
--   B under v6: GW2 66 65 50 66 -> 61.75 -> 62
-- EXPECTED at GW3 under v6
--   A  CAP (1 + 1 + .444444) / 3 = .814815 -> 81 -> 63; SEL 99 -> 71;
--      CON (1, 1, 0) -> 66 -> 57; TRF (+7, +3) / 2 = 5 -> 74.5 -> 75 -> 58
--      -> OVR 249 / 4 = 62.25 -> 62: DOWN from 64, -2
--   B  CAP 1 -> 71; SEL (.966102 + 1 + 1) / 3 = .988701 -> 96 -> 70; CON 1 -> 71;
--      TRF 50 -> OVR 65.5 -> 66: UP from 62, +4
begin;
select extensions.plan(40);

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('bc2a0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
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

-- One expression as a signed-in user at aal1: its jsonb, or {"__error": ...}.
create function pg_temp.run(p_user uuid, p_expr text) returns jsonb language plpgsql as $$
declare result text;
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin
    set local role authenticated;
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

-- ---------------------------------------------------------------------------
-- Fixture (as manager_card_calm_scores.test.sql)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2), 'manager-card-week-one-test', 'Manager Card Week One Test', 'MCW', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), '2091/92', '2091-08-01', '2092-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
select pg_temp.id(30 + n), pg_temp.id(3), n, 'Round ' || n, 'completed' from generate_series(1, 3) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(4), pg_temp.id(2), 'manager-card-week-one-test', 'Manager Card Week One Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values (pg_temp.id(5), pg_temp.id(4), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
  '2091/92', 'active', '2091-08-01', '2092-06-30');

create function pg_temp.mk_gw(n integer) returns void language sql as $$
  insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
    deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
  select pg_temp.gw(n), pg_temp.id(5), pg_temp.id(30 + n), n, 'Gameweek ' || n,
    d, d + interval '2 hours', d + interval '2 days 2 hours', 'finalized',
    d + interval '3 days 2 hours', 'final', 1
  from (select timestamptz '2091-09-01 10:00:00+00' + (n - 1) * interval '7 days' as d) dl;
  insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
    price_source_version, price_player_ids, prices_completed_at, completed_at)
  values (pg_temp.gw(n), 1, 1, '{}', statement_timestamp(), statement_timestamp());
$$;
select pg_temp.mk_gw(1);
select pg_temp.mk_gw(2);

insert into app.teams (id, slug, name, short_name, code, country_id, primary_color, secondary_color)
values (pg_temp.id(6), 'manager-card-week-one-club', 'MC Week One Club', 'MCW', 'MCW',
  (select id from app.countries where iso_alpha2 = 'MA'), '#112233', '#445566');

create temp table w1_players (n integer, code text);
insert into w1_players values (1,'GK'),(2,'GK'),(3,'DEF'),(4,'DEF'),(5,'DEF'),(6,'DEF'),(7,'DEF'),
  (8,'MID'),(9,'MID'),(10,'MID'),(11,'MID'),(12,'MID'),(13,'FWD'),(14,'FWD'),(15,'FWD'),(16,'DEF'),(17,'MID');
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id(2000 + p.n), 'manager-card-week-one-player-' || p.n, 'MC W1 Player ' || p.n, 'MCW ' || p.n,
  case p.code when 'GK' then 'goalkeeper' when 'DEF' then 'defender' when 'MID' then 'midfielder'
    else 'forward' end::app.football_position
from w1_players p;
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price)
select pg_temp.fp(p.n), pg_temp.id(5), pg_temp.id(2000 + p.n), pg_temp.id(6),
  (select id from app.fantasy_positions where code = p.code), 6
from w1_players p;

select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.usr(u.t), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'mcw-' || lower(u.t) || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'mcw_' || lower(u.t), 'display_name', 'Week One ' || u.t),
  statement_timestamp(), statement_timestamp()
from unnest(array['A', 'B', 'C', 'D', 'E', 'F']) as u(t);

insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
select pg_temp.tm(t), pg_temp.usr(t), pg_temp.id(5), 'Team ' || t, 0, 100, 1, 'active',
  timestamptz '2091-08-01 00:00:00+00'
from unnest(array['A', 'B', 'C', 'D', 'E', 'F']) t;

create function pg_temp.mk_points(p_gw integer) returns void language sql as $$
  insert into app.fantasy_player_gameweek_points (fantasy_player_id, gameweek_id, provisional_points,
    final_points, minutes_played, calculation_version, football_input_version, finalized_at)
  select pg_temp.fp(v.p), pg_temp.gw(p_gw), case p_gw when 1 then v.g1 else v.g2 end,
    case p_gw when 1 then v.g1 else v.g2 end,
    case when v.p = 7 and p_gw = 1 then 0 else 90 end, 1, 0, statement_timestamp()
  from (values (1,6,6),(2,2,2),(3,6,6),(4,5,5),(5,4,4),(6,2,2),(7,0,1),(8,8,8),(9,7,7),(10,5,5),
    (11,3,3),(12,1,1),(13,9,9),(14,4,4),(15,2,2),(16,3,3),(17,2,2)) as v(p, g1, g2)
$$;
select pg_temp.mk_points(1);
select pg_temp.mk_points(2);

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
    s.player is not distinct from p_captain, s.player is not distinct from p_vice, 6
  from lineup
  cross join lateral (
    select player, 'starter', ord from unnest(p_starters) with ordinality as a(player, ord)
    union all
    select player, 'bench', ord from unnest(p_bench) with ordinality as b(player, ord)
  ) as s(player, slot, ord)
$$;
create function pg_temp.mk_result(p_team text, p_gw integer, p_final integer, p_chip text default null)
returns void language sql as $$
  insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
    bench_points, captain_points, transfer_hit, chip_type, provisional_score, final_score, state,
    calculation_version, finalized_at, scoring_details)
  values (pg_temp.tm(p_team), pg_temp.gw(p_gw), 59, 0, 0, 0, p_chip::app.fantasy_chip_type,
    p_final, p_final, 'final', 1, statement_timestamp(), null::jsonb)
$$;
select pg_temp.mk_lineup('A', 1, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 13, 8);
select pg_temp.mk_lineup('A', 2, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 13, 8);
select pg_temp.mk_lineup('B', 1, '{1,3,4,5,7,8,9,10,11,13,14}', '{2,6,12,15}', 13, 8);
select pg_temp.mk_lineup('B', 2, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 13, 8);
select pg_temp.mk_lineup('C', 1, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 8, 9);
select pg_temp.mk_lineup('C', 2, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 8, 9);
select pg_temp.mk_result(r.t, g, r.f) from (values ('A', 80), ('B', 70), ('C', 60)) r(t, f)
cross join generate_series(1, 2) g;

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

-- Rules.
create temp table w1_rules (version integer, config jsonb);
insert into w1_rules values
  (1, '{"minimum_gameweeks":2,"provisional_below":2,"trf_window_gameweeks":3,"batch_size":2000,"scales":{"cap":[[0,1],[1,99]],"sel":[[0.5,1],[1,99]],"trf":[[-10,1],[0,50],[10,99]],"con":[[0,1],[1,99]]},"tiers":{"stade":50,"pro":65,"champion":80,"legend":90}}'),
  (2, '{"minimum_gameweeks":2,"provisional_below":5,"trf_window_gameweeks":3,"batch_size":2000,"scales":{"cap":[[0,1],[1,99]],"sel":[[0.5,1],[0.8,50],[1,99]],"trf":[[-10,1],[0,50],[10,99]],"con":[[0,1],[1,99]]},"tiers":{"stade":50,"pro":65,"champion":80,"legend":90},"shrinkage":{"cap":4,"sel":4,"con":4,"trf":4},"sel_numerator":"picked_starters"}');
insert into w1_rules select 3, config || '{"ovr_min_stats":3,"empty_stat_neutral":false}' from w1_rules where version = 1;
insert into w1_rules select 4, config || '{"minimum_gameweeks":1,"ovr_min_stats":1}' from w1_rules where version = 2;
insert into w1_rules select 5, config || '{"minimum_gameweeks":1}' from w1_rules where version = 2;
insert into w1_rules select 6, config || '{"minimum_gameweeks":1,"ovr_min_stats":1,"empty_stat_neutral":true}' from w1_rules where version = 2;
insert into w1_rules select 7, config || '{"cap_ignore_deadlines_before":"2092-01-01T00:00:00Z"}' from w1_rules where version = 6;
insert into w1_rules select 8, config from w1_rules where version = 6;
insert into app_private.manager_card_rules (version, config, active)
select version, config, false from w1_rules;

-- One pass of gameweeks 1..p_through under a rules version, snapshotting the
-- history rows of p_through.
create temp table snap (version integer, gw integer, team text, ovr smallint, tier text, cap smallint,
  sel smallint, trf smallint, con smallint, cap_raw numeric, sel_raw numeric, trf_raw numeric,
  con_raw numeric, counted integer, provisional boolean);
create function pg_temp.pass(p_version integer, p_through integer) returns void language plpgsql as $$
declare g integer;
begin
  for g in 1 .. p_through loop
    perform app_private.manager_card_evaluate_gameweek(pg_temp.gw(g), p_version);
    insert into snap
    select p_version, g, t.t, h.ovr, h.tier, h.cap, h.sel, h.trf, h.con, h.cap_raw, h.sel_raw, h.trf_raw,
      h.con_raw, h.gameweeks_counted, h.provisional
    from unnest(array['A', 'B', 'C', 'D', 'E', 'F']) t(t)
    join app.manager_card_gameweeks h on h.user_id = pg_temp.usr(t.t) and h.gameweek_id = pg_temp.gw(g)
    where h.rules_version = p_version;
  end loop;
end;
$$;
create function pg_temp.row_of(p_version integer, p_gw integer, p_team text) returns text language sql as $$
  select concat_ws(' ', s.cap, s.sel, s.trf, s.con, '->', s.ovr, s.tier)
  from snap s where s.version = p_version and s.gw = p_gw and s.team = p_team
$$;

-- ---------------------------------------------------------------------------
-- 1. Rules v1 and v2 give the figures they gave before this body
-- ---------------------------------------------------------------------------
select pg_temp.pass(1, 2);
select pg_temp.pass(3, 2);
select pg_temp.pass(2, 2);

create temp table exp_v1 (team, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional) as values
  ('A',91,'legend',99,99,67,99,1.000000,1.000000,3.500000,1.000000,2,false),
  ('B',99,'legend',99,99,null,99,1.000000,1.000000,null::numeric,1.000000,2,false),
  ('C',63,'stade',88,99,null,1,0.888889,1.000000,null::numeric,0.000000,2,false);
create temp table exp_v2 (team, ovr, tier, cap, sel, trf, con, cap_raw, sel_raw, trf_raw, con_raw, counted, provisional) as values
  ('A',64,'stade',66,66,56,66,1.000000,1.000000,3.500000,1.000000,2,true),
  ('B',66,'pro',66,65,null,66,1.000000,0.983051,null::numeric,1.000000,2,true),
  ('C',54,'stade',63,66,null,34,0.888889,1.000000,null::numeric,0.000000,2,true);

select extensions.is_empty($q$
  select e.team from exp_v1 e
  left join snap s on s.version = 1 and s.gw = 2 and s.team = e.team
  where s.team is null
    or (s.ovr, s.tier, s.cap, s.sel, s.trf, s.con, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw, s.counted, s.provisional)
      is distinct from
       (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw, e.counted, e.provisional)
$q$, 'rules v1 (no new key) give the same GW2 rows as before this body: TRF stays null without a transfer, OVR needs three stats');
select extensions.is_empty($q$
  select e.team from exp_v2 e
  left join snap s on s.version = 2 and s.gw = 2 and s.team = e.team
  where s.team is null
    or (s.ovr, s.tier, s.cap, s.sel, s.trf, s.con, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw, s.counted, s.provisional)
      is distinct from
       (e.ovr, e.tier, e.cap, e.sel, e.trf, e.con, e.cap_raw, e.sel_raw, e.trf_raw, e.con_raw, e.counted, e.provisional)
$q$, 'rules v2 (no new key) give the same GW2 rows as before this body');
select extensions.is_empty($q$
  select a.team, a.gw from snap a left join snap b on b.version = 3 and b.gw = a.gw and b.team = a.team
  where a.version = 1
    and (a.ovr, a.tier, a.cap, a.sel, a.trf, a.con, a.cap_raw, a.sel_raw, a.trf_raw, a.con_raw, a.counted, a.provisional)
      is distinct from
       (b.ovr, b.tier, b.cap, b.sel, b.trf, b.con, b.cap_raw, b.sel_raw, b.trf_raw, b.con_raw, b.counted, b.provisional)
$q$, 'v1 with ovr_min_stats 3 and empty_stat_neutral false spelled out gives v1''s rows in both gameweeks: the defaults are the old behaviour');
select extensions.is(
  (select count(*)::integer from snap where version in (1, 2, 3) and gw = 1
     and (ovr is not null or cap is not null or sel is not null or trf is not null or con is not null)),
  0, 'and under a minimum of two weeks the GW1 rows carry no figure (the gate is unchanged)');

-- ---------------------------------------------------------------------------
-- 2. Week one: three managers with exactly one finished gameweek (GW2)
-- ---------------------------------------------------------------------------
select pg_temp.mk_lineup('D', 2, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 1, 3);
select pg_temp.mk_lineup('E', 2, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', null, null);
select pg_temp.mk_lineup('F', 2, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', null, null);
select pg_temp.mk_result('D', 2, 50);
select pg_temp.mk_result('E', 2, 40, 'bench_boost');
select pg_temp.mk_result('F', 2, 30);
-- v6 last: GW3 below builds on its history rows.
select pg_temp.pass(4, 2);
select pg_temp.pass(5, 2);
select pg_temp.pass(7, 2);
select pg_temp.pass(6, 2);

select extensions.is(
  (select string_agg(s.team || ':' || coalesce(s.ovr::text, 'null'), ',' order by s.team)
   from snap s where s.version = 4 and s.gw = 2 and s.team in ('D', 'E', 'F')),
  'D:51,E:40,F:50',
  'ovr_min_stats 1: an OVR from three stats (D), from one (E: CON 40 alone) and from two (F: SEL 60, CON 40)');
select extensions.is(
  (select string_agg(s.team || ':' || coalesce(s.ovr::text, 'null'), ',' order by s.team)
   from snap s where s.version = 5 and s.gw = 2 and s.team in ('D', 'E', 'F')),
  'D:51,E:null,F:null',
  'without the key OVR still needs three of the four stats');
select extensions.is(
  pg_temp.row_of(4, 2, 'E') || ' | ' || pg_temp.row_of(4, 2, 'F'),
  '40 -> 40 homa | 60 40 -> 50 stade',
  'without empty_stat_neutral the missing stats stay empty (E: no captain, Bench Boost, no transfer)');
select extensions.is(
  (select concat_ws(' ', s.cap, s.sel, s.trf, s.con, '->', s.ovr, s.tier, s.counted, s.provisional::text,
     s.cap_raw, coalesce(s.trf_raw::text, 'null'))
   from snap s where s.version = 6 and s.gw = 2 and s.team = 'D'),
  '53 60 50 40 -> 51 stade 1 true 0.666667 null',
  'rules v3: D, one finished gameweek, the default goalkeeper captain and no transfer, has all four stats and an OVR (CAP 53 from his week, TRF the neutral 50 with no raw figure), provisional');
select extensions.is(
  pg_temp.row_of(6, 2, 'E') || ' | ' || pg_temp.row_of(6, 2, 'F'),
  '50 50 50 40 -> 48 homa | 50 60 50 40 -> 50 stade',
  'rules v3: a stat with no sample reads 50 (E''s CAP, SEL, TRF; F''s CAP, TRF), so every card has four stats and OVR averages all four');
select extensions.ok(
  not exists (select 1 from snap s where s.version = 6
    and (s.cap is null or s.sel is null or s.trf is null or s.con is null or s.ovr is null)),
  'rules v3: no history row of any manager in either gameweek has an empty stat or OVR');
select extensions.is(
  (select concat_ws(' ', s.cap, s.sel, s.trf, s.con, '->', s.ovr, coalesce(s.trf_raw::text, 'null'))
   from snap s where s.version = 6 and s.gw = 1 and s.team = 'A'),
  '60 60 50 60 -> 58 null',
  'rules v3 at GW1: A''s first week already has its four stats (TRF 50 while his transfers'' window is open) and an OVR');
select extensions.is(
  (select concat_ws(' ', s.cap, coalesce(s.cap_raw::text, 'null'), s.ovr) from snap s where s.version = 7 and s.gw = 2 and s.team = 'D'),
  '50 null 50',
  'with v2''s CAP cut-off after the week (v7), that week''s captain is not counted: no CAP sample, the neutral 50; v3 has no cut-off and counts it (53)');

-- Rating changes so far: none. First OVRs are not changes, and v6 found the
-- GW2 rows still under v7 (another rules version).
select extensions.is(
  (select count(*)::integer from app.manager_card_ovr_changes c
   where c.fantasy_season_id = pg_temp.id(5)),
  0, 'no rating change yet: a first OVR is not a change, and a recalculation under a new rules version records none');

-- ---------------------------------------------------------------------------
-- 3. GW3: one up, one down
-- ---------------------------------------------------------------------------
select pg_temp.mk_gw(3);
select pg_temp.mk_points(3);
select pg_temp.mk_lineup('A', 3, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 14, 8);
select pg_temp.mk_lineup('B', 3, '{1,3,4,5,6,8,9,10,11,13,14}', '{2,7,12,15}', 13, 8);
select pg_temp.mk_result('A', 3, 10);
select pg_temp.mk_result('B', 3, 90);
update app.profiles set preferred_language = 'ar' where id = pg_temp.usr('B');
select app_private.manager_card_evaluate_gameweek(pg_temp.gw(3), 6) ->> 'outcome';

select extensions.is(
  (select string_agg(t.t || ':' || h.ovr, ',' order by t.t)
   from unnest(array['A', 'B']) t(t)
   join app.manager_card_gameweeks h on h.user_id = pg_temp.usr(t.t) and h.gameweek_id = pg_temp.gw(3)),
  'A:62,B:66', 'GW3 under v3: A 62, B 66 (the hand-computed figures)');
select extensions.is(
  (select string_agg(concat_ws(':', t.t, c.from_ovr, c.to_ovr, c.from_tier, c.to_tier, c.rules_version), ',' order by t.t)
   from unnest(array['A', 'B']) t(t)
   join app.manager_card_ovr_changes c on c.user_id = pg_temp.usr(t.t) and c.gameweek_id = pg_temp.gw(3)),
  'A:64:62:stade:stade:6,B:62:66:stade:pro:6',
  'the changes are recorded against the previous evaluated OVR under the same rules: A down 64 -> 62, B up 62 -> 66');
select extensions.is(
  (select count(*)::integer from app.manager_card_ovr_changes c
   where c.user_id in (pg_temp.usr('C'), pg_temp.usr('D'), pg_temp.usr('E'), pg_temp.usr('F'))),
  0, 'managers without a GW3 result have no change');

-- The notification is off by default.
select extensions.is(
  (select notify_ovr_changes from app_private.manager_card_settings),
  false, 'the notification switch ships off');
select extensions.is(
  (select count(*)::integer from app_private.notification_events where event_type = 'manager_card_ovr_change')
    + (select count(*)::integer from app.notifications where notification_type = 'manager_card_ovr_change')
    + (select count(*)::integer from app.manager_card_ovr_changes where notified_at is not null),
  0, 'while it is off nothing is created and no change is marked');

-- ---------------------------------------------------------------------------
-- 4. The notification, switched on
-- ---------------------------------------------------------------------------
select app_private.manager_card_notify_configure(true);
update app.user_preferences set fantasy_deadline_reminders = false where user_id = pg_temp.usr('A');
update app.user_preferences set push_notifications_enabled = true where user_id = pg_temp.usr('B');
insert into app.device_registrations (id, user_id, device_id, platform, push_provider, locale)
values (pg_temp.id(701), pg_temp.usr('B'), 'device-week-one-b', 'android', 'fcm', 'ar');
insert into app_private.push_destinations (device_registration_id, destination_digest, destination_value)
values (pg_temp.id(701), extensions.digest('week-one-token-b', 'sha256'), 'week-one-token-b-000000-0000000000');

-- The same week evaluated again (a re-run under the same rules), switch on.
select app_private.manager_card_evaluate_gameweek(pg_temp.gw(3), 6) ->> 'outcome';

select extensions.is(
  (select concat_ws(' | ', n.language, n.title, n.body, n.category, n.deep_link_target, n.source_domain)
   from app.notifications n where n.user_id = pg_temp.usr('B') and n.notification_type = 'manager_card_ovr_change'),
  'ar | تقييمك في كورفا يرتفع إلى 66 (+4) 📈 | الجولة 3: افتح بطاقتك في كورفا لترى ما الذي تغيّر. | fantasy | none | fantasy',
  'B (Arabic) is told his rating went up, in Arabic');
select extensions.is(
  (select string_agg(d.channel || ':' || d.status || ':' || d.provider_key, ',' order by d.channel)
   from app.notification_deliveries d join app.notifications n on n.id = d.notification_id
   where n.user_id = pg_temp.usr('B') and n.notification_type = 'manager_card_ovr_change'),
  'in_app:delivered:database,push:pending:fcm',
  'in the app, and as a push waiting for the push claim on his working phone');
select extensions.is(
  (select concat_ws(' ', e.deduplication_key, e.status, (e.source_entity_id = pg_temp.gw(3))::text, e.safe_payload::text)
   from app_private.notification_events e where e.target_user_id = pg_temp.usr('B') and e.event_type = 'manager_card_ovr_change'),
  'manager_card:ovr_change:' || pg_temp.usr('B') || ':' || pg_temp.gw(3)
    || ' completed true {"delta": 4, "toOvr": 66, "fromOvr": 62, "gameweek": 3}',
  'one event per reader and gameweek, de-duplicated by its key, already completed (nothing else fans it out)');
select extensions.is(
  (select count(*)::integer from app.notifications n where n.user_id = pg_temp.usr('A') and n.notification_type = 'manager_card_ovr_change')
    || ':' || (select (c.notified_at is not null)::text from app.manager_card_ovr_changes c
      where c.user_id = pg_temp.usr('A') and c.gameweek_id = pg_temp.gw(3)),
  '0:true', 'A turned Fantasy reminders off: no notification, and his change is marked as considered');

update app.user_preferences set fantasy_deadline_reminders = true where user_id = pg_temp.usr('A');
select app_private.manager_card_evaluate_gameweek(pg_temp.gw(3), 6) ->> 'outcome';
select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 6) ->> 'outcome';
select extensions.is(
  (select count(*)::integer from app_private.notification_events where event_type = 'manager_card_ovr_change')
    || ':' || (select count(*)::integer from app.notifications where notification_type = 'manager_card_ovr_change')
    || ':' || (select count(*)::integer from app.notification_deliveries d join app.notifications n on n.id = d.notification_id
      where n.notification_type = 'manager_card_ovr_change'),
  '1:1:2',
  'evaluating GW3 again tells nobody twice (nor A, who turned reminders back on after his week was considered), and an older gameweek (GW2) is never told');
select extensions.is(
  (select concat_ws(':', c.from_ovr, c.to_ovr, (c.notified_at is null)::text) from app.manager_card_ovr_changes c
   where c.user_id = pg_temp.usr('A') and c.gameweek_id = pg_temp.gw(2)),
  '58:62:true',
  'GW2 re-evaluated under v3, now that GW1 and GW2 are both v3 rows, records A''s GW2 change silently (58 -> 62: with GW3 finished, GW2 alone no longer judges his transfers'' window, so TRF is the neutral 50)');

-- ---------------------------------------------------------------------------
-- 5. The card serves the latest change once
-- ---------------------------------------------------------------------------
update app_private.manager_card_rules set active = true where version = 6;
select app_private.manager_card_configure(null, true);

select extensions.is(
  pg_temp.run(pg_temp.usr('A'), 'api.get_my_manager_card()') -> 'card' -> 'ovrChanges',
  jsonb_build_array(jsonb_build_object('kind', 'ovr_changed', 'key', 'ovr_down:' || pg_temp.gw(3),
    'direction', 'down', 'gameweekSeq', 3, 'fromOvr', 64, 'toOvr', 62, 'delta', -2,
    'fromTier', 'stade', 'toTier', 'stade',
    'occurredAt', (pg_temp.run(pg_temp.usr('A'), 'api.get_my_manager_card()') -> 'card' -> 'ovrChanges' -> 0 -> 'occurredAt'))),
  'A''s card lists the latest change only (GW3, down 64 -> 62), not GW2''s');
select extensions.is(
  (pg_temp.run(pg_temp.usr('A'), 'api.get_my_manager_card()') -> 'card' ->> 'ovr')
    || ':' || (pg_temp.run(pg_temp.usr('A'), 'api.get_my_manager_card()') -> 'card' -> 'moments' @> '[{"kind": "ovr_changed"}]'),
  '62:false', 'the card''s OVR is the change''s new value, and the existing moments list is unchanged (no new kind in it)');
select extensions.is(
  pg_temp.run(pg_temp.usr('A'), format('api.ack_manager_card_moments(array[%L, %L])',
    'ovr_down:' || pg_temp.gw(3), 'ovr_up:' || pg_temp.gw(3))),
  jsonb_build_object('acknowledged', jsonb_build_array('ovr_down:' || pg_temp.gw(3)),
    'ignored', jsonb_build_array('ovr_up:' || pg_temp.gw(3))),
  'A acknowledges his change; a well-formed key that is not his change is ignored');
select extensions.is(
  pg_temp.run(pg_temp.usr('A'), 'api.get_my_manager_card()') -> 'card' -> 'ovrChanges',
  '[]'::jsonb, 'and it is never served again (on any device: the acknowledgement is on the server)');
select extensions.is(
  pg_temp.run(pg_temp.usr('B'), 'api.get_my_manager_card()') -> 'card' -> 'ovrChanges' -> 0 ->> 'key',
  'ovr_up:' || pg_temp.gw(3), 'B''s card serves his GW3 rise');
select extensions.is(
  pg_temp.run(pg_temp.usr('D'), 'api.get_my_manager_card()') -> 'card' -> 'ovrChanges',
  '[]'::jsonb, 'D (one week, first OVR) has none: his first rating is the existing first_rating moment');
select extensions.is(
  left(pg_temp.run(pg_temp.usr('A'), 'api.ack_manager_card_moments(array[''ovr_up:not-a-uuid''])') ->> '__error', 31)
    || ',' || left(pg_temp.run(pg_temp.usr('A'), 'api.ack_manager_card_moments(array[''ovr_sideways:' || pg_temp.gw(3) || '''])') ->> '__error', 31),
  'PT400 validation_failed,PT400 validation_failed',
  'a malformed change key is refused like any malformed key');
select extensions.is(
  pg_temp.outcome(format('insert into app.manager_card_moment_acks (user_id, moment_key) values (%L, %L)',
    pg_temp.usr('C'), 'ovr_up:' || pg_temp.gw(3)))
    || ',' || left(pg_temp.outcome(format('insert into app.manager_card_moment_acks (user_id, moment_key) values (%L, %L)',
    pg_temp.usr('C'), 'ovr_flat:' || pg_temp.gw(3))), 5),
  'ok,23514', 'the acknowledgements table takes the two new key shapes and still refuses others');

-- ---------------------------------------------------------------------------
-- 6. A new rules version recalculates without a single change or notification
-- ---------------------------------------------------------------------------
select set_config('test.events', (select count(*)::text from app_private.notification_events
  where event_type = 'manager_card_ovr_change'), true);
select pg_temp.pass(8, 3);
select extensions.is(
  (select count(*)::integer from app.manager_card_ovr_changes c where c.fantasy_season_id = pg_temp.id(5))
    || ':' || (select count(*)::text from app_private.notification_events where event_type = 'manager_card_ovr_change'),
  '0:' || current_setting('test.events'),
  'recalculating every week under a new rules version (same figures) leaves no change and no new notification: no spam on a switch of version');
select extensions.is(
  (select string_agg(s.team || ':' || s.ovr, ',' order by s.team) from snap s where s.version = 8 and s.gw = 3),
  'A:62,B:66', 'while the figures are the same as under v3');

-- ---------------------------------------------------------------------------
-- 7. Malformed keys, and the shape of what was added
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 90, config || '{"ovr_min_stats": 0}' from app_private.manager_card_rules where version = 2;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 90)$q$)
  || ',' || pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 90, config || '{"ovr_min_stats": 5}' from app_private.manager_card_rules where version = 2;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 90)$q$)
  || ',' || pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 90, config || '{"ovr_min_stats": "2"}' from app_private.manager_card_rules where version = 2;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 90)$q$)
  || ',' || pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 90, config || '{"ovr_min_stats": 1.5}' from app_private.manager_card_rules where version = 2;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 90)$q$)
  || ',' || pg_temp.outcome($q$
    insert into app_private.manager_card_rules (version, config)
    select 90, config || '{"empty_stat_neutral": "yes"}' from app_private.manager_card_rules where version = 2;
    select app_private.manager_card_evaluate_gameweek(pg_temp.gw(2), 90)$q$),
  (select string_agg('PT400 manager_card_rules_invalid', ',') from generate_series(1, 5)),
  'ovr_min_stats 0, 5, "2" or 1.5 and an empty_stat_neutral that is not a boolean are manager_card_rules_invalid');
select extensions.is(
  (select concat_ws(',', c.relrowsecurity, c.relforcerowsecurity,
      (select count(*) from pg_policies p where p.schemaname = 'app' and p.tablename = 'manager_card_ovr_changes'),
      has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger'),
      has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate,references,trigger'),
      has_table_privilege('service_role', c.oid, 'select,insert,update,delete,truncate,references,trigger'),
      exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f'
        and k.confrelid = 'app.profiles'::regclass and k.confdeltype = 'c'))
   from pg_class c where c.oid = 'app.manager_card_ovr_changes'::regclass),
  't,t,0,f,f,f,t',
  'the changes table: row security enabled and forced, no policy, no right for any API role, cascading from the profile');
select extensions.ok(
  not exists (
    select 1 from pg_proc p
    cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    where p.oid in ('app_private.manager_card_notify_configure(boolean)'::regprocedure,
        'app_private.manager_card_notify_ovr_changes(uuid)'::regprocedure,
        'app_private.manager_card_ovr_moments(uuid)'::regprocedure,
        'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure)
      and has_function_privilege(r.role, p.oid, 'execute'))
  and exists (
    select 1 from pg_proc p
    where p.oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure
      and p.prosecdef and p.proowner = 'postgres'::regrole and p.proconfig @> array['search_path=""']),
  'the new functions and the calculation are closed to the API roles; the calculation is still security definer with an empty search_path');
select extensions.is(
  (select string_agg(r.role || ':' || has_function_privilege(r.role, f.sig, 'execute'), ',' order by f.sig, r.role)
   from unnest(array['api.get_my_manager_card()', 'api.ack_manager_card_moments(text[])']) f(sig)
   cross join unnest(array['anon', 'authenticated', 'service_role']) r(role)),
  'anon:false,authenticated:true,service_role:true,anon:false,authenticated:true,service_role:true',
  'the two replaced api functions keep their grants (signed-in and service role, never anon)');
select extensions.is(
  (select string_agg(t.language || ':' || t.template_key, ',' order by t.template_key, t.language::text)
   from app.notification_templates t where t.notification_type = 'manager_card_ovr_change' and t.active and t.channel = 'in_app'),
  'ar:manager_card_ovr_down,fr:manager_card_ovr_down,ar:manager_card_ovr_up,fr:manager_card_ovr_up',
  'four active templates: up and down, French and Arabic');
select extensions.is(
  app_private.notification_push_topic('manager_card_ovr_change') || '/' || app_private.notification_push_ttl('manager_card_ovr_change')::text
    || '/' || app_private.notification_push_topic('deadline_1h') || '/' || coalesce(app_private.notification_push_topic('breaking_news'), 'null'),
  'fantasy/12:00:00/fantasy/null',
  'the push rules know the type (Fantasy reminders, 12 hours) and the others are unchanged');

select * from extensions.finish();
rollback;
