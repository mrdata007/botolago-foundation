-- BotolaGO+ round recap (20261015120000): api.get_round_recap and its two app_private helpers.
--
-- Covered: grants, volatility and search_path; "off is an answer" and the sign-in order; members
-- against non-members and preview; the values on a seeded league, worked out by hand in the
-- comments (score, parts, rank and movement, league average and best, the captain and the transfer
-- of the journée, the remainder); the minimum group of three; which journée (named, the latest,
-- cancelled, scheduled, unknown) and which league (named, default, not a member of, public, none);
-- a journée still in the ratings window (a player with no published points is pending and has no
-- number); and that the read writes nothing.
--
-- THE FIXTURE is the one of premium_card_league_context.test.sql (read its header): A, B, G are
-- members; L1 private (A, B, C, F), L2 private (B, G), L3 public (A, G), L4 private of the old
-- season, L5 private (A, B, C, F, G, the largest). Journées GW1, 2, 3 and 5 are final, GW4 is
-- cancelled (with a result that must not count), GW6 is scheduled; GW7 is added near the end.
begin;
select extensions.plan(31);

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

-- ---------------------------------------------------------------------------
-- Test helpers
-- ---------------------------------------------------------------------------
create function pg_temp.keys(j jsonb) returns text language sql as $$
  select coalesce(string_agg(k, ',' order by k collate "C"), '<none>') from jsonb_object_keys(j) k
$$;
create function pg_temp.career(p_user uuid, p_season text default null, p_aal text default 'aal1')
returns jsonb language sql as $$
  select pg_temp.run(p_user, p_aal, format('api.get_my_card_career(%L)', p_season))
$$;
create function pg_temp.duel(p_user uuid, p_team uuid, p_season text default null, p_aal text default 'aal1')
returns jsonb language sql as $$
  select pg_temp.run(p_user, p_aal, format('api.get_card_duel(%L, %L)', p_team, p_season))
$$;
create function pg_temp.vis_set(p_user uuid, p_value boolean) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', format('api.set_card_history_visibility(%L)', p_value))
$$;
create function pg_temp.vis_get(p_user uuid) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', 'api.get_my_card_history_visibility()')
$$;
create function pg_temp.mk_league(p_n integer, p_season uuid, p_visibility text, p_owner text,
  p_members text[], p_season_teams uuid[] default null) returns void language plpgsql as $$
begin
  insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility,
    invite_code_digest, invite_code_hint)
  values (pg_temp.id(700 + p_n), p_season, pg_temp.usr(p_owner), 'Test league ' || p_n,
    p_visibility::app.fantasy_league_visibility,
    case when p_visibility = 'private' then encode(extensions.digest('league-' || p_n, 'sha256'), 'hex') end,
    case when p_visibility = 'private' then 'ABCD' end);
  insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id)
  select pg_temp.id(700 + p_n),
    case when p_season_teams is null then pg_temp.tm(m) else p_season_teams[k] end,
    pg_temp.usr(m)
  from unnest(p_members) with ordinality as x(m, k);
end $$;

-- ---------------------------------------------------------------------------
-- Rules v1, the card, the first tick (GW1, GW2, GW3, GW5)
-- ---------------------------------------------------------------------------
insert into app_private.manager_card_rules (version, config, active) values
  (1, '{"minimum_gameweeks":3,"provisional_below":5,"trf_window_gameweeks":3,"cap_ignore_deadlines_before":"2089-09-05T00:00:00Z","scales":{"cap":[[0,0],[1,100]],"sel":[[0,0],[1,100]],"trf":[[-10,0],[10,100]],"con":[[0,0],[1,100]]},"tiers":{"stade":50,"pro":65,"champion":78,"legend":88},"batch_size":500}',
   true);
select app_private.manager_card_configure(true, false);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select extensions.is((current_setting('test.tick')::jsonb) ->> 'outcome', 'evaluated',
  'the fixture: the card is computed for GW1, GW2, GW3 and GW5');

-- Members: A, B, G (monthly, on the web). Leagues. The season-0 teams of A and F.
insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
  current_period_end, last_event_at)
select pg_temp.usr(t), 'active', 'plus_monthly', 'web', statement_timestamp() - interval '10 days',
  statement_timestamp() + interval '20 days', statement_timestamp() - interval '10 days'
from unnest(array['A', 'B', 'G']) t;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
values (pg_temp.id(451), pg_temp.usr('A'), pg_temp.id(9), 'Team A old', 0, 100, 1, 'active',
  timestamptz '2088-08-01 00:00:00+00');
select pg_temp.mk_league(1, pg_temp.id(5), 'private', 'A', array['A', 'B', 'C', 'F']);
select pg_temp.mk_league(2, pg_temp.id(5), 'private', 'B', array['B', 'G']);
select pg_temp.mk_league(3, pg_temp.id(5), 'public', 'A', array['A', 'G']);
select pg_temp.mk_league(4, pg_temp.id(9), 'private', 'F', array['A', 'F'],
  array[pg_temp.id(451), pg_temp.id(450)]);
-- A paid a points hit in GW1 (the fixture's results carry none).
update app.fantasy_team_gameweek_results set transfer_hit = 4
where fantasy_team_id = pg_temp.tm('A') and gameweek_id = pg_temp.gw(1);

-- ---------------------------------------------------------------------------
-- This test's own helpers and leagues
-- ---------------------------------------------------------------------------
create function pg_temp.ctx(p_user uuid, p_league uuid default null, p_season text default null,
  p_rival uuid default null, p_aal text default 'aal1') returns jsonb language sql as $$
  select pg_temp.run(p_user, p_aal, format('api.get_card_league_context(%L, %L, %L)', p_league, p_season, p_rival))
$$;
create function pg_temp.jp(j jsonb, p_path text) returns jsonb language sql as $$
  select jsonb_path_query_array(j, p_path::jsonpath)
$$;
-- An answer without what a rival who hides their history must not bring.
create function pg_temp.strip(j jsonb) returns jsonb language sql as $$
  select (j #- '{rival,captain}' #- '{rival,transfers}' #- '{rival,historyVisible}')
    || jsonb_build_object('weeks', (select jsonb_agg(w - 'rival' order by o)
       from jsonb_array_elements(j -> 'weeks') with ordinality x(w, o)))
$$;

-- L5: a second private league of S1, with A, B, C, F and G. L1 has four members, L5 five.
select pg_temp.mk_league(5, pg_temp.id(5), 'private', 'A', array['A', 'B', 'C', 'F', 'G']);
update app.fantasy_leagues set member_count = 4 where id = pg_temp.id(701);
update app.fantasy_leagues set member_count = 5 where id = pg_temp.id(705);

-- ---------------------------------------------------------------------------
-- This test's helpers
-- ---------------------------------------------------------------------------
create function pg_temp.recap(p_user uuid, p_gw uuid default null, p_league uuid default null,
  p_aal text default 'aal1') returns jsonb language sql as $$
  select pg_temp.run(p_user, p_aal, format('api.get_round_recap(%L, %L)', p_gw, p_league))
$$;
create function pg_temp.at(j jsonb, p_path text) returns jsonb language sql as $$
  select jsonb_path_query_array(j, p_path::jsonpath)
$$;

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select extensions.ok(
  has_function_privilege('authenticated', 'api.get_round_recap(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'api.get_round_recap(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'api.get_round_recap(uuid,uuid)', 'execute')
  and not has_function_privilege('public', 'api.get_round_recap(uuid,uuid)', 'execute'),
  'api.get_round_recap is for authenticated and service_role, not anon or PUBLIC');
select extensions.ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = 's'
   from pg_proc p where p.oid = 'api.get_round_recap(uuid,uuid)'::regprocedure),
  'it is security definer with an empty search_path, and STABLE (it cannot write)');
select extensions.ok(
  (select count(*) = 2 and bool_and(p.provolatile = 's' and p.proconfig @> array['search_path=""'])
   from pg_proc p where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('round_recap_league', 'round_recap_captain')),
  'its two helpers are STABLE with an empty search_path');
select extensions.is(
  (select count(*)::integer from pg_proc p
   cross join unnest(array['anon', 'authenticated', 'service_role', 'public']) r
   where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('round_recap_league', 'round_recap_captain')
     and has_function_privilege(r, p.oid, 'execute')),
  0, 'and no API role can run either helper');
select extensions.is(
  (select count(*)::integer from pg_proc p where p.pronamespace = 'api'::regnamespace and p.proname = 'get_round_recap'),
  1, 'there is exactly one signature (no overload for a client to hit by mistake)');

-- ---------------------------------------------------------------------------
-- Off is an answer; the sign-in order
-- ---------------------------------------------------------------------------
select extensions.is(
  jsonb_build_array(pg_temp.recap(pg_temp.usr('A')), pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(3), pg_temp.id(701))),
  '[{"available": false}, {"available": false}]'::jsonb,
  'BotolaGO+ off: {"available": false}, whatever is asked');
select app_private.premium_configure('on', false, null);
select extensions.is(pg_temp.recap(pg_temp.usr('A')), '{"available": false}'::jsonb,
  'BotolaGO+ on but the Manager Card reads off: {"available": false}');
select app_private.manager_card_configure(null, true);
select extensions.is(
  pg_temp.run(null, null, 'api.get_round_recap(null, null)', 'anon') ->> '__error' like '42501%',
  true, 'anon is refused (42501)');
select extensions.is(pg_temp.run(null, null, 'api.get_round_recap(null, null)') ->> '__error',
  'PT401 authentication_required', 'a signed-in role without a user is PT401');
select extensions.is(pg_temp.recap(pg_temp.usr('Y')) ->> '__error', 'PT403 mfa_required',
  'a verified factor at aal1 gets PT403 mfa_required');
select extensions.is(pg_temp.recap(pg_temp.usr('Y'), null, null, 'aal2'), '{"available": true, "locked": true}'::jsonb,
  'and at aal2 a non-member is locked');
select extensions.is(
  jsonb_build_array(pg_temp.recap(pg_temp.usr('C')), pg_temp.recap(pg_temp.usr('C'), pg_temp.gw(3), pg_temp.id(701)),
    pg_temp.recap(pg_temp.usr('X'), gen_random_uuid(), gen_random_uuid())),
  '[{"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}]'::jsonb,
  'a non-member is locked and nothing else comes with it, whatever journée or league is named');
select app_private.premium_configure('preview', false, null);
select extensions.is(pg_temp.recap(pg_temp.usr('C')), '{"available": false}'::jsonb,
  'preview: a non-member sees nothing, not even the lock');
select extensions.is(pg_temp.recap(pg_temp.usr('A')) ->> 'locked', 'false',
  'preview: a member reads the recap');
select app_private.premium_configure('on', false, null);

-- ---------------------------------------------------------------------------
-- A's GW3 in L1 (A, B, C, F), every figure worked out by hand
--   scores     GW1 A60 B60 C50 | GW2 A55 B50 C45 | GW3 A60 B70 C30 F40 (no GW4: cancelled, no GW5 yet)
--   league     GW3: average 200/4 = 50, best 70, four scores
--   rank       through GW3 A175 B180 C125 F40: B1 A2 C3 F4; through GW2 A115 B110 C95: A1 B2 C3
--              so A is 2nd, was 1st: movement -1
--   A's parts  starters p1 6, p3 1, p4 3, p5 4, p6 2, p8 7, p9 9, p10 2, p13 5, p18 8, p15 0 = 47 (the
--              fixture's result row stores them); captain bonus 0, hit 0, final score 60
--   captain    A: effective p8 (named in the scoring details) 7 + bonus 0 = 7 | B: p14 (named) 6 |
--              C: no details, the captain p26 who played: -1 | F: captain p8, 7. Average 19/4 = 4.75,
--              shown 4.8; A is 7 - 4.8 = +2.2
--   transfer   batch X2 (GW3, no hit): p14 out (6 in GW3), p18 in (8): +2, hit share 0, net +2
--   remainder  (60 - 50) - 2.2 - 2 = 5.8
-- ---------------------------------------------------------------------------
select set_config('test.a3', pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(3), pg_temp.id(701))::text, true);
select extensions.is(
  (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(current_setting('test.a3')::jsonb) k),
  'autoSubstitutions,available,explain,gameweek,gameweeks,league,leagueFigures,locked,me,minGroup,pendingPlayers,players',
  'the answer has exactly these twelve keys');
select extensions.is(
  jsonb_build_object(
    'league', current_setting('test.a3')::jsonb -> 'league',
    'minGroup', current_setting('test.a3')::jsonb -> 'minGroup',
    'gameweek', (current_setting('test.a3')::jsonb -> 'gameweek') - 'id' - 'publishedAt'),
  jsonb_build_object(
    'league', jsonb_build_object('id', pg_temp.id(701), 'name', 'Test league 1', 'members', 4),
    'minGroup', 3,
    'gameweek', '{"seq": 3, "name": "Gameweek 3", "status": "finalized", "settled": true, "corrected": false, "calculationVersion": 1}'::jsonb),
  'the league, the minimum group, and the journée: final, not corrected, calculation version 1');
select extensions.is(
  current_setting('test.a3')::jsonb -> 'me',
  '{"score": 60, "startingPoints": 47, "benchPoints": 0, "captainBonus": 0, "transferHit": 0, "chip": null,
    "rank": 2, "previousRank": 1, "movement": -1}'::jsonb,
  'the caller: 60 points (47 starters), second in L1 after being first, one place down');
select extensions.is(
  current_setting('test.a3')::jsonb -> 'leagueFigures',
  '{"scored": 4, "average": 50.0, "best": 70, "settled": true, "captainAverage": 4.8}'::jsonb,
  'the league: four scores, average 50, best 70, all final, the captains'' average 4.8');
select extensions.is(
  (current_setting('test.a3')::jsonb -> 'explain') - 'transfers',
  jsonb_build_object(
    'vsLeague', 10.0,
    'captain', jsonb_build_object('fantasyPlayerId', pg_temp.fp(8), 'name', 'MCP 8', 'multiplier', 1,
      'usedVice', false, 'pending', false, 'points', 7, 'counted', 7, 'vsLeague', 2.2),
    'transfersNet', 2.0, 'others', 5.8, 'othersIsRemainder', true),
  'the explanation: +10 on the league = captain +2.2 (7 against 4.8), transfers +2, the rest 5.8, named a remainder');
select extensions.is(
  current_setting('test.a3')::jsonb #> '{explain,transfers}',
  jsonb_build_array(jsonb_build_object('playerOut', 'MCP 14', 'playerIn', 'MCP 18', 'outPoints', 6, 'inPoints', 8,
    'hitShare', 0.0, 'pending', false, 'gain', 2, 'net', 2.0)),
  'the transfer of the journée: MCP 14 (6) out, MCP 18 (8) in, +2, no hit');
select extensions.is(
  jsonb_build_object(
    'count', jsonb_array_length(current_setting('test.a3')::jsonb -> 'players'),
    'onPitch', (select count(*)::integer from jsonb_array_elements(current_setting('test.a3')::jsonb -> 'players') e where (e ->> 'onPitch')::boolean),
    'bench', pg_temp.at(current_setting('test.a3')::jsonb, '$.players[*] ? (@.slot == "bench").name'),
    'benchPoints', pg_temp.at(current_setting('test.a3')::jsonb, '$.players[*] ? (@.slot == "bench").points'),
    'captain', pg_temp.at(current_setting('test.a3')::jsonb, '$.players[*] ? (@.captain == true)'),
    'pending', current_setting('test.a3')::jsonb -> 'pendingPlayers',
    'subs', current_setting('test.a3')::jsonb -> 'autoSubstitutions'),
  jsonb_build_object('count', 15, 'onPitch', 11,
    'bench', '["MCP 2", "MCP 16", "MCP 11", "MCP 17"]'::jsonb,
    'benchPoints', '[1, 1, 1, 3]'::jsonb,
    'captain', jsonb_build_array(jsonb_build_object('fantasyPlayerId', pg_temp.fp(8), 'name', 'MCP 8', 'position', 'MID',
      'slot', 'starter', 'order', 6, 'captain', true, 'viceCaptain', false, 'onPitch', true, 'counted', true,
      'pending', false, 'points', 7, 'minutes', 90, 'played', false)),
    'pending', 0, 'subs', '[]'::jsonb),
  'the fifteen: eleven on the pitch, the bench (MCP 2, 16, 11, 17) with its published points, the captain, none pending, no substitution');
select extensions.is(
  pg_temp.at(current_setting('test.a3')::jsonb, '$.gameweeks[*].seq'),
  '[5, 3, 2, 1]'::jsonb,
  'the journées that can be explained, newest first: GW1, 2, 3 and 5 (GW4 is cancelled, GW6 is not played)');

-- ---------------------------------------------------------------------------
-- Which journée, which league
-- ---------------------------------------------------------------------------
select extensions.is(
  jsonb_build_array(pg_temp.recap(pg_temp.usr('A'), null, pg_temp.id(701)) #>> '{gameweek,seq}',
    pg_temp.recap(pg_temp.usr('A')) #>> '{league,id}'),
  jsonb_build_array('5', pg_temp.id(705)::text),
  'without a journée the latest one (GW5); without a league the one with the most members (L5)');
select extensions.is(
  (select string_agg(coalesce(x ->> '__error', 'none'), ',' order by n) from (values
    (1, pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(4))),
    (2, pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(6))),
    (3, pg_temp.recap(pg_temp.usr('A'), gen_random_uuid())),
    (4, pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(3), pg_temp.id(702))),
    (5, pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(3), pg_temp.id(703))),
    (6, pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(3), gen_random_uuid())),
    (7, pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(3), pg_temp.id(704)))) v(n, x)),
  'PT404 round_recap_not_found,PT404 round_recap_not_found,PT404 round_recap_not_found,PT404 card_league_not_found,PT404 card_league_not_found,PT404 card_league_not_found,PT404 card_league_not_found',
  'a cancelled journée, one not played, an unknown id; a league A is not in (L2), a public one (L3), an unknown id and another season''s (L4)');

-- ---------------------------------------------------------------------------
-- The minimum group: L2 is B and G only
--   GW3 scores B70 G60; through GW3 B180 G135, through GW2 B110 G75: B is first both times
-- ---------------------------------------------------------------------------
select set_config('test.b3', pg_temp.recap(pg_temp.usr('B'), pg_temp.gw(3), pg_temp.id(702))::text, true);
select extensions.is(
  jsonb_build_object('me', current_setting('test.b3')::jsonb #> '{me,score}',
    'rank', current_setting('test.b3')::jsonb #> '{me,rank}', 'movement', current_setting('test.b3')::jsonb #> '{me,movement}',
    'figures', current_setting('test.b3')::jsonb -> 'leagueFigures',
    'vs', current_setting('test.b3')::jsonb #> '{explain,vsLeague}',
    'others', current_setting('test.b3')::jsonb #> '{explain,others}',
    'captainVs', current_setting('test.b3')::jsonb #> '{explain,captain,vsLeague}'),
  '{"me": 70, "rank": 1, "movement": 0,
    "figures": {"scored": 2, "average": null, "best": 70, "settled": true, "captainAverage": null},
    "vs": null, "others": null, "captainVs": null}'::jsonb,
  'two managers is under the minimum of three: no average, no captain average, no gap and no remainder; the score, rank and best stay');

-- ---------------------------------------------------------------------------
-- Nothing is written
-- ---------------------------------------------------------------------------
select set_config('test.state', pg_temp.card_state() || pg_temp.fantasy_state(), true);
select pg_temp.recap(pg_temp.usr('A'));
select pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(3), pg_temp.id(701));
select pg_temp.recap(pg_temp.usr('B'), pg_temp.gw(3), pg_temp.id(702));
select pg_temp.recap(pg_temp.usr('G'));
select pg_temp.recap(pg_temp.usr('C'));
select extensions.is(
  pg_temp.card_state() || pg_temp.fantasy_state() = current_setting('test.state'),
  true, 'the reads leave every card and Fantasy row exactly as they were');

-- ---------------------------------------------------------------------------
-- A caller with no private league still gets the recap, with no league figure
-- ---------------------------------------------------------------------------
update app.fantasy_league_memberships set status = 'left', left_at = statement_timestamp()
where user_id = pg_temp.usr('G');
select set_config('test.g', pg_temp.recap(pg_temp.usr('G'))::text, true);
select extensions.is(
  jsonb_build_object('seq', current_setting('test.g')::jsonb #> '{gameweek,seq}', 'league', current_setting('test.g')::jsonb -> 'league',
    'figures', current_setting('test.g')::jsonb -> 'leagueFigures', 'rank', current_setting('test.g')::jsonb #> '{me,rank}',
    'vs', current_setting('test.g')::jsonb #> '{explain,vsLeague}', 'score', current_setting('test.g')::jsonb #> '{me,score}'),
  '{"seq": 5, "league": null, "figures": null, "rank": null, "vs": null, "score": 40}'::jsonb,
  'with no private league: the latest journée and the score, no league, no figure, no rank, no gap');

-- ---------------------------------------------------------------------------
-- A journée still in the ratings window: GW7, provisional, added here
--   A's lineup of GW3 shape; player 9 has no published points yet (provisional 5, no final)
--   results   A 36 (provisional), B 50, C 20 (provisional); F has none
--   league    three scores: average 106/3 = 35.3, best 50, not all final
--   rank      through GW7 (GW4 cancelled does not count) A 291 B 270 C 180 F 115: A first; through
--             GW5 A255 B220 C160 F115: A first: movement 0
--   gap       36 - 35.3 = 0.7; the captain's average needs three captains and only A has a lineup: none,
--             so no captain gap and no remainder
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id(37), pg_temp.id(3), 7, 'Round 7', 'completed');
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state, scoring_input_version)
values (pg_temp.gw(7), pg_temp.id(5), pg_temp.id(37), 7, 'Gameweek 7',
  timestamptz '2089-10-20 10:00:00+00', timestamptz '2089-10-20 12:00:00+00',
  timestamptz '2089-10-22 12:00:00+00', 'provisional', 'provisional', 1);
select pg_temp.mk_lineup('A', 7, '{1,3,4,5,6,8,9,10,13,18,15}', '{2,16,11,17}', 13, 8);
insert into app.fantasy_player_gameweek_points (fantasy_player_id, gameweek_id, provisional_points,
  final_points, minutes_played, calculation_version, football_input_version, finalized_at)
select pg_temp.fp(v.p), pg_temp.gw(7), v.pts, case when v.p = 9 then null else v.pts end, v.mins, 1, 0,
  case when v.p = 9 then null else statement_timestamp() end
from (values (1,5,90),(3,4,90),(4,3,90),(5,2,90),(6,6,90),(8,4,90),(9,5,90),(10,7,90),(13,6,90),
  (18,3,90),(15,1,90),(2,0,0),(16,2,90),(11,1,90),(17,2,90)) as v(p, pts, mins);
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
  bench_points, captain_points, transfer_hit, provisional_score, state, calculation_version)
values (pg_temp.tm('A'), pg_temp.gw(7), 41, 0, 0, 4, 36, 'provisional', 1),
  (pg_temp.tm('B'), pg_temp.gw(7), 50, 0, 0, 0, 50, 'provisional', 1),
  (pg_temp.tm('C'), pg_temp.gw(7), 20, 0, 0, 0, 20, 'provisional', 1);
select set_config('request.jwt.claims', '', true);

select set_config('test.a7', pg_temp.recap(pg_temp.usr('A'), null, pg_temp.id(701))::text, true);
select extensions.is(
  jsonb_build_object(
    'gameweek', (current_setting('test.a7')::jsonb -> 'gameweek') - 'id',
    'me', current_setting('test.a7')::jsonb -> 'me',
    'figures', current_setting('test.a7')::jsonb -> 'leagueFigures'),
  '{"gameweek": {"seq": 7, "name": "Gameweek 7", "status": "provisional", "settled": false, "corrected": false,
      "calculationVersion": 1, "publishedAt": null},
    "me": {"score": 36, "startingPoints": 41, "benchPoints": 0, "captainBonus": 0, "transferHit": 4, "chip": null,
      "rank": 1, "previousRank": 1, "movement": 0},
    "figures": {"scored": 3, "average": 35.3, "best": 50, "settled": false, "captainAverage": null}}'::jsonb,
  'a journée still in the ratings window: the latest by default, not settled, no published stamp, the provisional score counted, the league average of the three scores (35.3), not all final');
select extensions.is(
  jsonb_build_object(
    'pending', current_setting('test.a7')::jsonb -> 'pendingPlayers',
    'p9', pg_temp.at(current_setting('test.a7')::jsonb, '$.players[*] ? (@.name == "MCP 9")'),
    'vs', current_setting('test.a7')::jsonb #> '{explain,vsLeague}',
    'others', current_setting('test.a7')::jsonb #> '{explain,others}',
    'net', current_setting('test.a7')::jsonb #> '{explain,transfersNet}',
    'captain', current_setting('test.a7')::jsonb #> '{explain,captain}'),
  jsonb_build_object('pending', 1,
    'p9', jsonb_build_array(jsonb_build_object('fantasyPlayerId', pg_temp.fp(9), 'name', 'MCP 9', 'position', 'MID',
      'slot', 'starter', 'order', 7, 'captain', false, 'viceCaptain', false, 'onPitch', true, 'counted', true,
      'pending', true, 'points', null, 'minutes', 90, 'played', false)),
    'vs', 0.7, 'others', null, 'net', 0,
    'captain', jsonb_build_object('fantasyPlayerId', pg_temp.fp(13), 'name', 'MCP 13', 'multiplier', 1,
      'usedVice', false, 'pending', false, 'points', 6, 'counted', 6, 'vsLeague', null)),
  'player 9 is pending with no number (never a fallback), one starter is pending, the gap is +0.7, no remainder without a captain average, the captain is MCP 13 (6)');
select extensions.is(
  pg_temp.at(pg_temp.recap(pg_temp.usr('A'), pg_temp.gw(7), pg_temp.id(701)), '$.gameweeks[*].settled'),
  '[false, true, true, true, true]'::jsonb,
  'the journées list says which are settled: GW7 not, GW5, 3, 2 and 1 yes');

select * from extensions.finish();
rollback;
