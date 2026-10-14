-- BotolaGO+ league context (20261014150000): api.get_card_league_context and its
-- two app_private helpers.
--
-- Covered: grants, volatility and search_path; "off is an answer" and the sign-in
-- order (argument check, off, step-up, caller); members against non-members and
-- preview; the values on a seeded league, every one worked out by hand in the
-- comments (league average and best score per journée, the caller's rank and
-- movement, season totals, captain points per journée and per season, net transfer
-- gain, today's ratings and the per-journée rating history with the caller's rank);
-- the minimum group of three; which league is used (named, default, tie, a left
-- membership, another season, none); the league-mates-only refusals; the rival and
-- the privacy switch both ways (hidden by default, shown only by their own switch,
-- a non-member friend); that the reads write nothing; and a league of 20 managers
-- over 11 journées for correctness and time.
--
-- THE FIXTURE is the Manager Card fixture of manager_card.test.sql through the
-- premium_card_reads.test.sql set-up (read their headers for the points, lineups,
-- transfers and the card figures), ticked once (GW1, GW2, GW3, GW5 evaluated).
--   A  member, the viewer. B member. C, F not members. G member. X no team. Y a
--   verified factor. D deleted-pending.
-- LEAGUES  L1 private S1 (A, B, C, F)  L2 private S1 (B, G)  L3 public S1 (A, G)
--          L4 private S0 (A, F)  L5 private S1 (A, B, C, F, G), added here
-- S2 and a league of 20 (managers 1 to 20, the caller is 7) are added at the end.
begin;
select extensions.plan(55);

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
-- Shape
-- ---------------------------------------------------------------------------
select extensions.ok(
  has_function_privilege('authenticated', 'api.get_card_league_context(uuid,text,uuid)', 'execute')
  and has_function_privilege('service_role', 'api.get_card_league_context(uuid,text,uuid)', 'execute')
  and not has_function_privilege('anon', 'api.get_card_league_context(uuid,text,uuid)', 'execute')
  and not has_function_privilege('public', 'api.get_card_league_context(uuid,text,uuid)', 'execute'),
  'api.get_card_league_context is for authenticated and service_role, not anon or PUBLIC');
select extensions.ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = 's'
   from pg_proc p where p.oid = 'api.get_card_league_context(uuid,text,uuid)'::regprocedure),
  'it is security definer with an empty search_path, and STABLE (it cannot write)');
select extensions.ok(
  (select count(*) = 2 and bool_and(p.provolatile = 's' and p.proconfig @> array['search_path=""'])
   from pg_proc p where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('card_league_members', 'card_league_context')),
  'its two helpers are STABLE with an empty search_path');
select extensions.is(
  (select count(*)::integer from pg_proc p
   cross join unnest(array['anon', 'authenticated', 'service_role', 'public']) r
   where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('card_league_members', 'card_league_context')
     and has_function_privilege(r, p.oid, 'execute')),
  0, 'and no API role can run either helper');
select extensions.is(
  (select count(*)::integer from pg_proc p where p.pronamespace = 'api'::regnamespace and p.proname = 'get_card_league_context'),
  1, 'there is exactly one signature (no overload for a client to hit by mistake)');

-- ---------------------------------------------------------------------------
-- Off is an answer; the sign-in order
-- ---------------------------------------------------------------------------
select extensions.is(
  jsonb_build_array(pg_temp.ctx(pg_temp.usr('A')), pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701)),
    pg_temp.ctx(pg_temp.usr('A'), null, null, pg_temp.tm('B'))),
  '[{"available": false}, {"available": false}, {"available": false}]'::jsonb,
  'BotolaGO+ off: {"available": false}, whatever is asked');
select extensions.is(
  (select string_agg(coalesce(pg_temp.ctx(pg_temp.usr('A'), null, p) ->> '__error', 'none'), ',' order by n)
   from (values (1, 'nonsense'), (2, '2089'), (3, '2089-90')) v(n, p)),
  'PT400 validation_failed,PT400 validation_failed,PT400 validation_failed',
  'a malformed season is PT400 even while off');
select app_private.premium_configure('on', false, null);
select extensions.is(pg_temp.ctx(pg_temp.usr('A')), '{"available": false}'::jsonb,
  'BotolaGO+ on but the Manager Card reads off: {"available": false}');
select app_private.manager_card_configure(null, true);
select extensions.is(
  pg_temp.run(null, null, 'api.get_card_league_context(null, null, null)', 'anon') ->> '__error' like '42501%',
  true, 'anon is refused (42501)');
select extensions.is(pg_temp.run(null, null, 'api.get_card_league_context(null, null, null)') ->> '__error',
  'PT401 authentication_required', 'a signed-in role without a user is PT401');
select extensions.is(pg_temp.ctx(pg_temp.usr('Y')) ->> '__error', 'PT403 mfa_required',
  'a verified factor at aal1 gets PT403 mfa_required');
select extensions.is(pg_temp.ctx(pg_temp.usr('Y'), null, null, null, 'aal2'), '{"available": true, "locked": true}'::jsonb,
  'and at aal2 a non-member is locked');

-- ---------------------------------------------------------------------------
-- Members and non-members; preview
-- ---------------------------------------------------------------------------
select extensions.is(
  (select jsonb_agg(pg_temp.ctx(pg_temp.usr(t), pg_temp.id(701)) order by t) from unnest(array['C', 'F', 'X']) t)
  || jsonb_build_array(pg_temp.ctx(pg_temp.usr('C'), null, null, pg_temp.tm('A')),
    pg_temp.ctx(pg_temp.usr('X'), gen_random_uuid(), null, gen_random_uuid())),
  '[{"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}]'::jsonb,
  'a non-member is locked and nothing else comes with it, in L1 or not, with a rival or not, before anything else is looked at');
select app_private.premium_configure('preview', false, null);
select extensions.is(pg_temp.ctx(pg_temp.usr('C'), pg_temp.id(701)), '{"available": false}'::jsonb,
  'preview: a non-member sees nothing, not even the lock');
select extensions.is(pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701)) ->> 'locked', 'false',
  'preview: a member reads the league context');
select app_private.premium_configure('on', false, null);

-- ---------------------------------------------------------------------------
-- The league L1 (A, B, C, F), stage A: GW1, GW2, GW3 and GW5 evaluated
--   scores   GW1 A60 B60 C50 | GW2 A55 B50 C45 | GW3 A60 B70 C30 F40 | GW5 A80 B40 C35 F75
--   totals   GW1 60/60/50 | GW2 115/110/95 | GW3 A175 B180 C125 F40 | GW5 A255 B220 C160 F115
--   captain  (the effective captain's final points) GW1 A12 B12 C8 | GW2 A10 C10 (B's captain and
--            vice both played no minutes) | GW3 A7 B5 C-1 F7 | GW5 A9 B-2 C0 F5
--   ratings  today A 84/85/55/99 (OVR 81), B 1/86/-/75 (OVR 54), C 83/58/-/25 (OVR 55), F forming
-- ---------------------------------------------------------------------------
select set_config('test.l1', pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701))::text, true);
select extensions.is(pg_temp.keys(current_setting('test.l1')::jsonb),
  'available,captain,league,locked,me,minGroup,ratings,rival,season,totals,transfers,weeks',
  'the answer has exactly these twelve keys');
select extensions.is(
  jsonb_build_object('league', current_setting('test.l1')::jsonb -> 'league', 'season', current_setting('test.l1')::jsonb -> 'season',
    'minGroup', current_setting('test.l1')::jsonb -> 'minGroup', 'rival', current_setting('test.l1')::jsonb -> 'rival'),
  jsonb_build_object('league', jsonb_build_object('id', pg_temp.id(701), 'name', 'Test league 1', 'members', 4, 'ranked', 4),
    'season', jsonb_build_object('id', pg_temp.id(5), 'label', '2089/90'), 'minGroup', 3, 'rival', null),
  'the league (four managers, members and non-members alike), the season, the minimum group of three, no rival');
select extensions.is(
  jsonb_build_object(
    'seq', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].gameweekSeq'),
    'scored', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].scored'),
    'ranked', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].ranked'),
    'average', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].leagueAverage'),
    'best', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].leagueBest')),
  '{"seq": [1, 2, 3, 5], "scored": [3, 3, 4, 4], "ranked": [3, 3, 4, 4],
    "average": [56.67, 50, 50, 57.5], "best": [60, 55, 70, 80]}'::jsonb,
  'per journée: the evaluable weeks only (GW4 cancelled, GW6 not final), the league average (170/3, 150/3, 200/4, 230/4) and best score');
select extensions.is(
  jsonb_build_object(
    'score', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].me.score'),
    'rank', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].me.rank'),
    'previous', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].me.previousRank'),
    'movement', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].me.movement')),
  '{"score": [60, 55, 60, 80], "rank": [1, 1, 2, 1], "previous": [null, 1, 1, 2], "movement": [null, 0, -1, 1]}'::jsonb,
  'A''s rank after each journée on the cumulative score (tied with B on 60 is rank 1; B passes in GW3; A back on top) and the movement');
select extensions.is(
  jsonb_build_object('totals', current_setting('test.l1')::jsonb -> 'totals',
    'meTotal', current_setting('test.l1')::jsonb #> '{me,total}', 'meRank', current_setting('test.l1')::jsonb #> '{me,rank}'),
  '{"totals": {"ranked": 4, "leagueAverage": 187.5, "leaderTotal": 255}, "meTotal": 255, "meRank": 1}'::jsonb,
  'season: league average total (750/4), the leader''s total, A''s total and rank');
select extensions.is(
  jsonb_build_object(
    'average', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].captain.leagueAverage'),
    'contributors', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].captain.contributors'),
    'me', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[*].captain.me'),
    'season', current_setting('test.l1')::jsonb -> 'captain',
    'meSeason', current_setting('test.l1')::jsonb #> '{me,captain}'),
  '{"average": [10.67, null, 4.5, 3], "contributors": [3, 2, 4, 4], "me": [12, 10, 7, 9],
    "season": {"contributors": 4, "leagueAverage": 20.5}, "meSeason": {"points": 38, "weeks": 4}}'::jsonb,
  'captain points: per journée (GW1 12+12+8, GW2 only two captains played so no average, GW3 7+5-1+7, GW5 9-2+0+5), season totals 38, 15, 17, 12 average 20.5');
select extensions.is(
  jsonb_build_object('transfers', current_setting('test.l1')::jsonb -> 'transfers',
    'me', current_setting('test.l1')::jsonb #> '{me,transfers}'),
  '{"transfers": {"contributors": 1, "leagueAverage": null, "leagueAverageAll": 0.5},
    "me": {"net": 2, "gross": 6, "hitsPaid": 4, "transfers": 4, "counted": 2}}'::jsonb,
  'transfers: only A transferred (+2 net, 6 before the hits, 2 of 4 counted): one manager is no average, the average over all four is 0.5');
select extensions.is(
  (current_setting('test.l1')::jsonb #>> '{me,transfers,net}')::numeric,
  (pg_temp.career(pg_temp.usr('A')) #>> '{transfers,seasonGain}')::numeric,
  'and A''s net is exactly the career''s seasonGain');
select extensions.is(
  current_setting('test.l1')::jsonb -> 'ratings',
  '{"cap": {"rated": 3, "average": 56}, "sel": {"rated": 3, "average": 76.33}, "trf": {"rated": 1, "average": 55},
    "con": {"rated": 3, "average": 66.33}, "ovr": {"rated": 3, "average": 63.33}}'::jsonb,
  'today''s ratings: the league average and how many are rated (A 84/85/55/99, B 1/86/-/75, C 83/58/-/25; F is still forming)');
select extensions.is(
  current_setting('test.l1')::jsonb #> '{me,ratings}',
  '{"cap": {"value": 84, "rank": 1}, "sel": {"value": 85, "rank": 2}, "trf": {"value": 55, "rank": 1},
    "con": {"value": 99, "rank": 1}, "ovr": {"value": 81, "rank": 1}}'::jsonb,
  'and A''s value and rank in each (SEL: B 86 is above A 85)');
-- History: the league average and rank per journée.
select extensions.is(
  jsonb_build_object(
    'gw1', pg_temp.jp(current_setting('test.l1')::jsonb, '$.weeks[0].ratings.*.rated'),
    'gw5Average', jsonb_build_object('cap', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,cap,average}',
      'sel', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,sel,average}',
      'con', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,con,average}',
      'ovr', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,ovr,average}',
      'trf', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,trf,average}'),
    'gw5Me', jsonb_build_object('cap', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,cap,me}',
      'capRank', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,cap,rank}',
      'selRank', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,sel,rank}',
      'conRank', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,con,rank}',
      'ovrRank', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,ovr,rank}',
      'trfRank', current_setting('test.l1')::jsonb #> '{weeks,3,ratings,trf,rank}')),
  '{"gw1": [0, 0, 0, 0, 0],
    "gw5Average": {"cap": 56, "sel": 76.33, "con": 66.33, "ovr": 63.33, "trf": null},
    "gw5Me": {"cap": 84, "capRank": 1, "selRank": 2, "conRank": 1, "ovrRank": 1, "trfRank": null}}'::jsonb,
  'rating history: nothing before the minimum of three counted weeks; at GW5 it is today''s average and A''s ranks; TRF (one rated manager) has no average and no rank');
select extensions.is(
  (select string_agg(s.k || ':' || coalesce(avg_.a::text, '-'), ',' order by s.k collate "C")
   from (values ('cap'), ('con'), ('ovr'), ('sel'), ('trf')) s(k)
   left join lateral (
     select case when count(v.val) >= 3 then round(avg(v.val), 2) end as a
     from (select case s.k when 'cap' then x.cap when 'sel' then x.sel when 'trf' then x.trf when 'con' then x.con else x.ovr end as val
           from app.manager_card_gameweeks x
           join app.fantasy_gameweeks gw on gw.id = x.gameweek_id and gw.sequence_number = 3
           where x.user_id in (pg_temp.usr('A'), pg_temp.usr('B'), pg_temp.usr('C'), pg_temp.usr('F'))
             and x.gameweeks_counted >= 3) v) avg_ on true),
  (select string_agg(r.key || ':' || coalesce(r.value ->> 'average', '-'), ',' order by r.key collate "C")
   from jsonb_each(current_setting('test.l1')::jsonb #> '{weeks,2,ratings}') r),
  'GW3''s rating averages are exactly those of the card''s own history rows (counted weeks >= 3, three or more managers)');
select extensions.is(
  jsonb_build_object('gw2captain', current_setting('test.l1')::jsonb #> '{weeks,1,captain,leagueAverage}',
    'gw2contributors', current_setting('test.l1')::jsonb #> '{weeks,1,captain,contributors}'),
  '{"gw2captain": null, "gw2contributors": 2}'::jsonb,
  'fewer than three captains: no average (the minimum group), the count is still shown');

-- ---------------------------------------------------------------------------
-- Which league
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.ctx(pg_temp.usr('A')) #>> '{league,id}', pg_temp.id(705)::text,
  'no league given: A''s league with the most members (L5, five, over L1, four)');
select extensions.is(
  jsonb_build_object(
    'average', pg_temp.jp(pg_temp.ctx(pg_temp.usr('A')), '$.weeks[*].leagueAverage'),
    'best', pg_temp.jp(pg_temp.ctx(pg_temp.usr('A')), '$.weeks[*].leagueBest'),
    'rank', pg_temp.jp(pg_temp.ctx(pg_temp.usr('A')), '$.weeks[*].me.rank'),
    'totals', pg_temp.ctx(pg_temp.usr('A')) -> 'totals'),
  '{"average": [52.5, 46.25, 52, 54], "best": [60, 55, 70, 80], "rank": [1, 1, 2, 1],
    "totals": {"ranked": 5, "leagueAverage": 185, "leaderTotal": 255}}'::jsonb,
  'and it is computed over L5 (G adds 40, 35, 60, 40: 210/4, 185/4, 260/5, 270/5; total 925/5)');
select extensions.is(
  pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701)) #>> '{league,id}', pg_temp.id(701)::text,
  'a league named explicitly is that league, whatever the default');
select extensions.is(
  pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), '2089/90') = current_setting('test.l1')::jsonb
  and pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), pg_temp.id(5)::text) = current_setting('test.l1')::jsonb
  and pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), upper(pg_temp.id(5)::text)) = current_setting('test.l1')::jsonb,
  true, 'a season given with it, by label or id in either case, changes nothing');
update app.fantasy_leagues set member_count = 5 where id = pg_temp.id(701);
select extensions.is(pg_temp.ctx(pg_temp.usr('A')) #>> '{league,id}', pg_temp.id(701)::text,
  'two leagues of the same size: the lower id (L1 before L5), the leagues list''s own order');
update app.fantasy_leagues set member_count = 4 where id = pg_temp.id(701);
select extensions.is(
  (select string_agg(coalesce(x ->> '__error', 'no error'), ',' order by n) from (values
    (1, pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(702))),
    (2, pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(703))),
    (3, pg_temp.ctx(pg_temp.usr('A'), gen_random_uuid())),
    (4, pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), '2088/89')),
    (5, pg_temp.ctx(pg_temp.usr('G'), pg_temp.id(701)))) v(n, x)),
  'PT404 card_league_not_found,PT404 card_league_not_found,PT404 card_league_not_found,PT404 card_league_not_found,PT404 card_league_not_found',
  'a league of league mates only: L2 (A is not in it), L3 (public), an unknown id, another season''s label, and a league the caller is not in are all the same PT404');
update app.fantasy_league_memberships set status = 'left', left_at = statement_timestamp()
where league_id = pg_temp.id(701) and user_id = pg_temp.usr('A');
select extensions.is(
  jsonb_build_array(pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701)) ->> '__error', pg_temp.ctx(pg_temp.usr('A')) #>> '{league,id}'),
  jsonb_build_array('PT404 card_league_not_found', pg_temp.id(705)::text),
  'a left membership is no membership: L1 is refused to A, the default moves on to L5');
update app.fantasy_league_memberships set status = 'active', left_at = null
where league_id = pg_temp.id(701) and user_id = pg_temp.usr('A');
select extensions.is(
  jsonb_build_array(pg_temp.ctx(pg_temp.usr('A'), null, '2088/89') #>> '{league,id}',
    pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(704)) #>> '{league,id}',
    pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(704)) -> 'weeks',
    pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(704)) -> 'totals'),
  jsonb_build_array(pg_temp.id(704)::text, pg_temp.id(704)::text, '[]'::jsonb,
    '{"ranked": 0, "leagueAverage": null, "leaderTotal": null}'::jsonb),
  'the other season''s league (L4) by season or by id; a season with no evaluable week is an empty list, not an error');
select extensions.is(pg_temp.ctx(pg_temp.usr('G'), null, '2088/89'),
  jsonb_build_object('available', true, 'locked', false,
    'season', jsonb_build_object('id', pg_temp.id(9), 'label', '2088/89'), 'league', null),
  'a member with no private league that season gets league null: an empty state, not an error');
select extensions.is(
  pg_temp.ctx(pg_temp.usr('G'), null, '2088/89', '00000000-0000-4000-8000-00000000beef'::uuid) ->> '__error',
  'PT404 card_duel_not_found',
  'with no league that season, any rival asked for is PT404 card_duel_not_found, not the empty state');
select extensions.is(
  jsonb_build_array(pg_temp.ctx(pg_temp.usr('A'), null, '2077/78') ->> '__error', pg_temp.ctx(pg_temp.usr('G')) #>> '{league,id}'),
  jsonb_build_array('PT404 card_season_not_found', pg_temp.id(705)::text),
  'an unknown season is PT404 card_season_not_found; G''s default is L5');

-- ---------------------------------------------------------------------------
-- The rival, and the privacy switch
-- ---------------------------------------------------------------------------
select set_config('test.hidden', pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('B'))::text, true);
select extensions.is(
  jsonb_build_object('rival', current_setting('test.hidden')::jsonb -> 'rival'),
  jsonb_build_object('rival', jsonb_build_object('teamId', pg_temp.tm('B'), 'historyVisible', false,
    'total', 220, 'rank', 2, 'captain', null, 'transfers', null,
    'ratings', '{"cap": {"value": 1, "rank": 3}, "sel": {"value": 86, "rank": 1}, "trf": {"value": null, "rank": null},
      "con": {"value": 75, "rank": 2}, "ovr": {"value": 54, "rank": 3}}'::jsonb)),
  'B hides their history (the default): only their total (220) and rank, and today''s ratings with their ranks; no captain, no transfers');
select extensions.is(pg_temp.jp(current_setting('test.hidden')::jsonb, '$.weeks[*].rival'), '[null, null, null, null]'::jsonb,
  'and no week carries anything of theirs');
select extensions.is(
  jsonb_build_array(pg_temp.vis_set(pg_temp.usr('B'), true), pg_temp.vis_get(pg_temp.usr('B'))),
  '[{"available": true, "visible": true}, {"available": true, "visible": true}]'::jsonb, 'B switches their history on');
select set_config('test.shown', pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('B'))::text, true);
select extensions.is(
  jsonb_build_object(
    'visible', current_setting('test.shown')::jsonb #> '{rival,historyVisible}',
    'score', pg_temp.jp(current_setting('test.shown')::jsonb, '$.weeks[*].rival.score'),
    'rank', pg_temp.jp(current_setting('test.shown')::jsonb, '$.weeks[*].rival.rank'),
    'movement', pg_temp.jp(current_setting('test.shown')::jsonb, '$.weeks[*].rival.movement'),
    'captain', pg_temp.jp(current_setting('test.shown')::jsonb, '$.weeks[*].rival.captain'),
    'captainSeason', current_setting('test.shown')::jsonb #> '{rival,captain}',
    'transfers', current_setting('test.shown')::jsonb #> '{rival,transfers}'),
  '{"visible": true, "score": [60, 50, 70, 40], "rank": [1, 2, 1, 2], "movement": [null, -1, 1, -1],
    "captain": [12, null, 5, -2], "captainSeason": {"points": 15, "weeks": 3},
    "transfers": {"net": 0, "gross": 0, "hitsPaid": 0, "transfers": 0, "counted": 0}}'::jsonb,
  'shown: B''s weekly scores, ranks (tied 1 in GW1; A leads GW2 and GW5, B GW3), movement, captain points (GW2 none played) and transfers (none)');
select extensions.is(
  jsonb_build_array(
    current_setting('test.shown')::jsonb #> '{weeks,3,rival,ratings,cap}',
    current_setting('test.shown')::jsonb #> '{weeks,3,rival,ratings,sel}',
    current_setting('test.shown')::jsonb #> '{weeks,0,rival,ratings,cap}'),
  '[{"value": 1, "rank": 3}, {"value": 86, "rank": 1}, {"value": null, "rank": null}]'::jsonb,
  'and B''s rating history: CAP 1 and SEL 86 at GW5 with their ranks, nothing before the minimum');
select extensions.is(pg_temp.strip(current_setting('test.hidden')::jsonb), pg_temp.strip(current_setting('test.shown')::jsonb),
  'the hidden and the shown answers differ only by the rival''s history: the league, the caller''s figures and the rival''s total, rank and ratings do not move');
select extensions.is(
  jsonb_build_array(pg_temp.vis_set(pg_temp.usr('B'), false) ->> 'visible',
    pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('B')) = current_setting('test.hidden')::jsonb),
  '["false", true]'::jsonb, 'B switches it off again: the answer is the hidden one again, byte for byte');
select extensions.is(
  jsonb_build_array(
    pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('C')) #> '{rival,historyVisible}',
    pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('C')) #> '{rival,captain}',
    (pg_temp.vis_set(pg_temp.usr('C'), true) ->> 'visible'),
    pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('C')) #> '{rival,captain}',
    pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('C')) #> '{rival,total}'),
  '[false, null, "true", {"points": 17, "weeks": 4}, 160]'::jsonb,
  'C is not a member and hides by default; their own switch alone shows them (captain 8+10-1+0 = 17), total 160: paying unlocks the viewer''s screen, never the friend''s data');
select pg_temp.vis_set(pg_temp.usr('C'), false);
select extensions.is(
  (select string_agg(coalesce(x ->> '__error', 'no error'), ',' order by n) from (values
    (1, pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('G'))),
    (2, pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, gen_random_uuid())),
    (3, pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('A'))),
    (4, pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('D'))),
    (5, pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.id(450)))) v(n, x)),
  'PT404 card_duel_not_found,PT404 card_duel_not_found,PT404 card_duel_not_found,PT404 card_duel_not_found,PT404 card_duel_not_found',
  'a rival who is not a league mate in this league (G is in L5 only), an unknown team, oneself, a deleted-pending manager and a team of another season are all the same PT404 card_duel_not_found');
select extensions.is(
  jsonb_build_array(pg_temp.ctx(pg_temp.usr('A'), null, null, pg_temp.tm('G')) #>> '{league,id}',
    pg_temp.ctx(pg_temp.usr('A'), null, null, pg_temp.tm('G')) #>> '{rival,historyVisible}',
    pg_temp.ctx(pg_temp.usr('A'), null, null, pg_temp.tm('G')) #>> '{rival,total}'),
  jsonb_build_array(pg_temp.id(705)::text, 'false', '175'),
  'but against the default league (L5) G is a league mate: hidden, with their total (40+35+60+40 = 175)');

-- ---------------------------------------------------------------------------
-- Nothing is written
-- ---------------------------------------------------------------------------
select set_config('test.state', pg_temp.card_state() || pg_temp.fantasy_state(), true);
select set_config('test.visrows', (select count(*)::text from app.card_history_visibility), true);
select pg_temp.ctx(pg_temp.usr('A'));
select pg_temp.ctx(pg_temp.usr('A'), pg_temp.id(701), null, pg_temp.tm('B'));
select pg_temp.ctx(pg_temp.usr('B'), pg_temp.id(705), null, pg_temp.tm('A'));
select pg_temp.ctx(pg_temp.usr('G'), null, '2088/89');
select pg_temp.ctx(pg_temp.usr('C'));
select extensions.is(
  jsonb_build_array(pg_temp.card_state() || pg_temp.fantasy_state() = current_setting('test.state'),
    (select count(*)::text from app.card_history_visibility) = current_setting('test.visrows')),
  '[true, true]'::jsonb,
  'the reads leave every card, Fantasy and privacy-switch row exactly as they were');

-- ---------------------------------------------------------------------------
-- Performance sanity: a league of 20 managers over 11 evaluable journées (S2)
--   team i scores 40 + i in every journée; player p scores p; team i captains starter
--   ((i - 1) mod 11) + 1; each team makes one transfer in GW1 (out 12, in 13 + (i mod 3));
--   the card's history rows say cap 30+i, sel 40+i, trf 20+i, con 35+i, ovr 45+i from GW1 on.
--   The caller is team 7.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(80), pg_temp.id(2), '2087/88', '2087-08-01', '2088-06-30', 'completed', false);
insert into app.rounds (id, season_id, round_number, name, status)
select pg_temp.id(8100 + n), pg_temp.id(80), n, 'Round ' || n, 'completed' from generate_series(1, 11) n;
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status,
  starts_at, ends_at)
values (pg_temp.id(81), pg_temp.id(4), pg_temp.id(80), 'f6100000-0000-4000-8000-000000000100',
  '2087/88', 'completed', '2087-08-01', '2088-06-30');
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
select pg_temp.id(8200 + n), pg_temp.id(81), pg_temp.id(8100 + n), n, 'Perf gameweek ' || n,
  d, d + interval '2 hours', d + interval '2 days 2 hours', 'finalized',
  d + interval '3 days 2 hours', 'final', 1
from generate_series(1, 11) n
cross join lateral (select timestamptz '2087-09-01 10:00:00+00' + (n - 1) * interval '7 days' as d) dl;
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version,
  price_source_version, price_player_ids, prices_completed_at, completed_at)
select pg_temp.id(8200 + n), 1, 1, '{}', statement_timestamp(), statement_timestamp() from generate_series(1, 11) n;
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select pg_temp.id(8300 + p), pg_temp.id(81), pg_temp.id(2000 + p), pg_temp.id(6),
  (select id from app.fantasy_positions where code = 'MID'), 6
from generate_series(1, 15) p;
insert into app.fantasy_player_gameweek_points (fantasy_player_id, gameweek_id, provisional_points,
  final_points, minutes_played, calculation_version, football_input_version, finalized_at)
select pg_temp.id(8300 + p), pg_temp.id(8200 + g), p, p, 90, 1, 0, statement_timestamp()
from generate_series(1, 15) p cross join generate_series(1, 11) g;

select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(8400 + i), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'perf-' || i || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'perf_' || i, 'display_name', 'Perf ' || i), statement_timestamp(), statement_timestamp()
from generate_series(1, 20) i;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value, free_transfers, status, created_at)
select pg_temp.id(8500 + i), pg_temp.id(8400 + i), pg_temp.id(81), 'Perf team ' || i, 0, 100, 1, 'active',
  timestamptz '2087-08-01 00:00:00+00'
from generate_series(1, 20) i;
insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
select pg_temp.id(100000 + i * 100 + g), pg_temp.id(8500 + i), pg_temp.id(8200 + g), 1, timestamptz '2087-08-01 00:00:00+00'
from generate_series(1, 20) i cross join generate_series(1, 11) g;
insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, snapshot_price)
select pg_temp.id(100000 + i * 100 + g), pg_temp.id(8300 + p),
  (case when p <= 11 then 'starter' else 'bench' end)::app.fantasy_lineup_slot,
  case when p <= 11 then p else p - 11 end, p = ((i - 1) % 11) + 1, false, 6
from generate_series(1, 20) i cross join generate_series(1, 11) g cross join generate_series(1, 15) p;
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points,
  bench_points, captain_points, transfer_hit, provisional_score, final_score, state,
  calculation_version, finalized_at)
select pg_temp.id(8500 + i), pg_temp.id(8200 + g), 0, 0, 0, 0, 40 + i, 40 + i, 'final', 1, statement_timestamp()
from generate_series(1, 20) i cross join generate_series(1, 11) g;
insert into app.fantasy_transfer_batches (id, fantasy_team_id, gameweek_id, idempotency_key,
  base_team_version, resulting_team_version, transfers_count, free_transfers_before,
  free_transfers_used, point_hit, bank_before, bank_after, chip_type, status)
select pg_temp.id(200000 + i), pg_temp.id(8500 + i), pg_temp.id(8201), pg_temp.id(210000 + i), 1, 2,
  1, 1, 1, 0, 0, 0, null, 'confirmed'
from generate_series(1, 20) i;
insert into app.fantasy_transfers (transfer_batch_id, sequence_number, player_out_id, player_in_id, sale_price, purchase_price)
select pg_temp.id(200000 + i), 1, pg_temp.id(8312), pg_temp.id(8300 + 13 + (i % 3)), 6, 6
from generate_series(1, 20) i;
insert into app.manager_cards (user_id) select pg_temp.id(8400 + i) from generate_series(1, 20) i
on conflict (user_id) do nothing;
insert into app.manager_card_gameweeks (user_id, fantasy_season_id, gameweek_id, ovr, cap, sel, trf, con,
  gameweeks_counted, provisional, rules_version)
select pg_temp.id(8400 + i), pg_temp.id(81), pg_temp.id(8200 + g), 45 + i, 30 + i, 40 + i, 20 + i, 35 + i, g, true, 1
from generate_series(1, 20) i cross join generate_series(1, 11) g;
insert into app.manager_card_seasons (user_id, fantasy_season_id, fantasy_team_id, ovr, cap, sel, trf, con,
  gameweeks_counted, provisional, rules_version, through_gameweek_id)
select pg_temp.id(8400 + i), pg_temp.id(81), pg_temp.id(8500 + i), 45 + i, 30 + i, 40 + i, 20 + i, 35 + i,
  11, true, 1, pg_temp.id(8211)
from generate_series(1, 20) i;
insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
  current_period_end, last_event_at)
values (pg_temp.id(8407), 'active', 'plus_monthly', 'web', statement_timestamp() - interval '10 days',
  statement_timestamp() + interval '20 days', statement_timestamp() - interval '10 days');
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility,
  invite_code_digest, invite_code_hint, member_count)
values (pg_temp.id(799), pg_temp.id(81), pg_temp.id(8401), 'Perf league', 'private',
  encode(extensions.digest('perf-league', 'sha256'), 'hex'), 'PERF', 20);
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id)
select pg_temp.id(799), pg_temp.id(8500 + i), pg_temp.id(8400 + i) from generate_series(1, 20) i;
select set_config('request.jwt.claims', '', true);

select set_config('test.t0', clock_timestamp()::text, true);
select set_config('test.perf', pg_temp.ctx(pg_temp.id(8407), pg_temp.id(799))::text, true);
select set_config('test.t1', clock_timestamp()::text, true);
select extensions.ok(
  current_setting('test.perf')::jsonb ->> '__error' is null
  and current_setting('test.t1')::timestamptz - current_setting('test.t0')::timestamptz < interval '5 seconds',
  'performance: a league of 20 managers over 11 journées answers in under 5 seconds');
select extensions.is(
  jsonb_build_object('league', (current_setting('test.perf')::jsonb -> 'league') - 'id' - 'name',
    'weeks', jsonb_array_length(current_setting('test.perf')::jsonb -> 'weeks'),
    'average', pg_temp.jp(current_setting('test.perf')::jsonb, '$.weeks[*].leagueAverage'),
    'best', pg_temp.jp(current_setting('test.perf')::jsonb, '$.weeks[*].leagueBest'),
    'rank', pg_temp.jp(current_setting('test.perf')::jsonb, '$.weeks[*].me.rank'),
    'totals', current_setting('test.perf')::jsonb -> 'totals',
    'me', jsonb_build_object('total', current_setting('test.perf')::jsonb #> '{me,total}', 'rank', current_setting('test.perf')::jsonb #> '{me,rank}')),
  jsonb_build_object('league', '{"members": 20, "ranked": 20}'::jsonb, 'weeks', 11,
    'average', (select jsonb_agg(50.5) from generate_series(1, 11)),
    'best', (select jsonb_agg(60) from generate_series(1, 11)),
    'rank', (select jsonb_agg(14) from generate_series(1, 11)),
    'totals', '{"ranked": 20, "leagueAverage": 555.5, "leaderTotal": 660}'::jsonb,
    'me', '{"total": 517, "rank": 14}'::jsonb),
  'scores on 20 x 11: average 50.5 (40 + 10.5), best 60, team 7 (47) is 14th in every journée and on the season (517; average 555.5; leader 660)');
select extensions.is(
  jsonb_build_object(
    'captainAverage', (select jsonb_agg(5.55) from generate_series(1, 11)),
    'captainMe', (select jsonb_agg(7) from generate_series(1, 11)),
    'captainSeason', current_setting('test.perf')::jsonb -> 'captain',
    'transfers', current_setting('test.perf')::jsonb -> 'transfers',
    'meTransfers', current_setting('test.perf')::jsonb #> '{me,transfers}'),
  jsonb_build_object(
    'captainAverage', pg_temp.jp(current_setting('test.perf')::jsonb, '$.weeks[*].captain.leagueAverage'),
    'captainMe', pg_temp.jp(current_setting('test.perf')::jsonb, '$.weeks[*].captain.me'),
    'captainSeason', '{"contributors": 20, "leagueAverage": 61.05}'::jsonb,
    'transfers', '{"contributors": 20, "leagueAverage": 6.15, "leagueAverageAll": 6.15}'::jsonb,
    'meTransfers', '{"net": 6, "gross": 6, "hitsPaid": 0, "transfers": 1, "counted": 1}'::jsonb),
  'captain points (111/20 = 5.55 a journée, 61.05 a season; team 7 captains player 7) and transfers (3, 6 or 9 net: 123/20 = 6.15; team 7 +6)');
select extensions.is(
  jsonb_build_object(
    'ratings', current_setting('test.perf')::jsonb -> 'ratings',
    'me', current_setting('test.perf')::jsonb #> '{me,ratings}',
    'gw2', pg_temp.jp(current_setting('test.perf')::jsonb, '$.weeks[1].ratings.*.rated'),
    'gw3Cap', current_setting('test.perf')::jsonb #> '{weeks,2,ratings,cap}',
    'gw11Ovr', current_setting('test.perf')::jsonb #> '{weeks,10,ratings,ovr}'),
  '{"ratings": {"cap": {"rated": 20, "average": 40.5}, "sel": {"rated": 20, "average": 50.5}, "trf": {"rated": 20, "average": 30.5},
      "con": {"rated": 20, "average": 45.5}, "ovr": {"rated": 20, "average": 55.5}},
    "me": {"cap": {"value": 37, "rank": 14}, "sel": {"value": 47, "rank": 14}, "trf": {"value": 27, "rank": 14},
      "con": {"value": 42, "rank": 14}, "ovr": {"value": 52, "rank": 14}},
    "gw2": [0, 0, 0, 0, 0],
    "gw3Cap": {"rated": 20, "average": 40.5, "me": 37, "rank": 14},
    "gw11Ovr": {"rated": 20, "average": 55.5, "me": 52, "rank": 14}}'::jsonb,
  'ratings on 20 x 11: today''s averages and ranks, nothing in GW1-2 (under the minimum), and the history from GW3 on');

select * from extensions.finish();
rollback;
