-- BotolaGO+ premium card reads (20261013100400): api.get_my_card_career,
-- api.get_card_duel, api.set_card_history_visibility and
-- api.get_my_card_history_visibility.
--
-- Covered: grants and shape of the table, the helpers and the four api functions;
-- "off is an answer" for every switch (BotolaGO+ off, the Manager Card reads off) and
-- the sign-in order (argument check, off, step-up, caller); members against
-- non-members and preview; the career read with exact key sets and values on the
-- Manager Card fixture, agreeing with the card (the mean captain share equals
-- cap_raw and the mean transfer gain equals trf_raw, also after the season's last
-- gameweek is finalized); best and worst weeks; the duel: league mates only (the
-- same PT404 for everything else, however it fails), a public league or a left or
-- inactive membership is not a mate, the opponent's privacy switch both ways
-- (default hidden, a non-member's switch, switching back), no history in the
-- hidden answer, season switching; and that none of the reads writes a Fantasy
-- or card table.
--
-- THE FIXTURE is the Manager Card fixture of manager_card.test.sql (read its header
-- for the points, lineups, transfers and the expected card figures), ticked once
-- (GW1, GW2, GW3, GW5 evaluated; GW6 still scheduled), then GW6 is finalized.
--   A  member, the viewer. Transfers: X1 ready, X2 and X3 wait for GW6.
--   B  member. League mate of A. No transfers; a mismatching captain in GW3.
--   C  not a member. League mate of A, history hidden (the default).
--   F  not a member. League mate of A in both seasons (a team in S0 too).
--   G  member. Wildcard batch; in a private league with B and C, not with A,
--      and in a public league with A.
--   X  not a member, no team. Y not a member, with a verified factor.
--   D  deleted-pending profile.
-- LEAGUES  L1 private S1 (A, B, C, F)  L2 private S1 (B, G)  L3 public S1 (A, G)
--          L4 private S0 (A, F)
begin;
select extensions.plan(83);

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
-- Shape: the table, the helpers, the four functions
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = 'app.card_history_visibility'::regclass)
  and not exists (select 1 from pg_policies where schemaname = 'app' and tablename = 'card_history_visibility'),
  'app.card_history_visibility has row security enabled and forced, and no policy');
select extensions.is(
  (select count(*)::integer from unnest(array['anon', 'authenticated', 'service_role']) r
   where has_table_privilege(r, 'app.card_history_visibility', 'select,insert,update,delete,truncate,references,trigger')
     or has_any_column_privilege(r, 'app.card_history_visibility', 'select,insert,update,references')),
  0, 'anon, authenticated and service_role hold no right on it, column rights included');
select extensions.is(
  (select count(*)::integer from pg_class c
   cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
   where c.oid = 'app.card_history_visibility'::regclass and x.grantee = 0),
  0, 'and PUBLIC holds none');
select extensions.ok(
  exists (select 1 from pg_trigger where tgrelid = 'app.card_history_visibility'::regclass
    and tgfoid = 'app_private.refuse_unverified_mfa_actor()'::regprocedure and tgtype = 30 and tgenabled = 'O'),
  'it carries the statement-level step-up trigger');
select extensions.ok(
  (select bool_and(has_function_privilege('authenticated', f, 'execute')
      and has_function_privilege('service_role', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('public', f, 'execute'))
   from unnest(array['api.get_my_card_career(text)', 'api.get_card_duel(uuid,text)',
     'api.set_card_history_visibility(boolean)', 'api.get_my_card_history_visibility()']) f),
  'the four functions are for authenticated and service_role, not anon or PUBLIC');
select extensions.ok(
  (select count(*) = 4 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p where p.pronamespace = 'api'::regnamespace
     and p.proname in ('get_my_card_career', 'get_card_duel', 'set_card_history_visibility', 'get_my_card_history_visibility')),
  'all four are security definer with an empty search_path');
select extensions.is(
  (select count(*)::integer from pg_proc p
   cross join unnest(array['anon', 'authenticated', 'service_role', 'public']) r
   where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('card_premium_mode', 'card_reads_mode', 'card_resolve_season', 'card_evaluable_gameweeks',
       'card_week_rows', 'card_week_top_half', 'card_captain_rows', 'card_transfer_rows', 'card_duel_shared_seasons')
     and has_function_privilege(r, p.oid, 'execute')),
  0, 'none of the nine helpers can be run by any API role');

-- ---------------------------------------------------------------------------
-- Off is an answer
-- ---------------------------------------------------------------------------
select set_config('test.state', pg_temp.card_state() || pg_temp.fantasy_state(), true);
select extensions.is(
  jsonb_build_array(pg_temp.career(pg_temp.usr('A')), pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B')),
    pg_temp.vis_get(pg_temp.usr('A'))),
  '[{"available": false}, {"available": false}, {"available": false}]'::jsonb,
  'BotolaGO+ off: the three reads answer {"available": false}');
select extensions.is(pg_temp.vis_set(pg_temp.usr('A'), true), '{"available": false}'::jsonb,
  'and the switch writes nothing');
select extensions.is((select count(*)::integer from app.card_history_visibility), 0, 'no row was written');
select extensions.is(pg_temp.career(pg_temp.usr('Y')), '{"available": false}'::jsonb,
  'off is answered before the step-up: a verified factor at aal1 is not asked for a challenge');
select extensions.is(
  (select string_agg(coalesce(pg_temp.career(null, p) ->> '__error', 'none'), ',' order by n)
   from (values (1, 'nonsense'), (2, '2089'), (3, '2089-90')) v(n, p))
  || '#' || (pg_temp.duel(pg_temp.usr('A'), null) ->> '__error')
  || '#' || (pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B'), 'x/y') ->> '__error')
  || '#' || (pg_temp.vis_set(pg_temp.usr('A'), null) ->> '__error'),
  'PT400 validation_failed,PT400 validation_failed,PT400 validation_failed#PT400 validation_failed#PT400 validation_failed#PT400 validation_failed',
  'a malformed season, a missing team and a missing value are PT400 even while off');

select app_private.premium_configure('on', false, null);
select extensions.is(
  jsonb_build_array(pg_temp.career(pg_temp.usr('A')), pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B'))),
  '[{"available": false}, {"available": false}]'::jsonb,
  'BotolaGO+ on but the Manager Card reads off: the two premium reads still answer {"available": false}');
select extensions.is(pg_temp.vis_get(pg_temp.usr('C')), '{"available": true, "visible": false}'::jsonb,
  'the privacy switch needs only BotolaGO+, not the card reads');
select app_private.manager_card_configure(null, true);

-- ---------------------------------------------------------------------------
-- The sign-in order, with BotolaGO+ and the card on
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg(left(pg_temp.run(null, null, e, 'anon') ->> '__error', 5), ',' order by n)
   from (values (1, 'api.get_my_card_career(null)'), (2, 'api.get_card_duel(null, null)'),
     (3, 'api.set_card_history_visibility(true)'), (4, 'api.get_my_card_history_visibility()')) v(n, e)),
  '42501,42501,42501,42501', 'anon is refused (42501) by all four');
select extensions.is(
  (select string_agg(pg_temp.run(null, null, e) ->> '__error', ',' order by n)
   from (values (1, 'api.get_my_card_career(null)'), (2, format('api.get_card_duel(%L, null)', pg_temp.tm('B'))),
     (3, 'api.set_card_history_visibility(true)'), (4, 'api.get_my_card_history_visibility()')) v(n, e)),
  'PT401 authentication_required,PT401 authentication_required,PT401 authentication_required,PT401 authentication_required',
  'a signed-in role without a user is PT401 on all four');
select extensions.is(
  (select string_agg(x ->> '__error', ',' order by n) from (values
    (1, pg_temp.career(pg_temp.usr('Y'))), (2, pg_temp.duel(pg_temp.usr('Y'), pg_temp.tm('B'))),
    (3, pg_temp.vis_set(pg_temp.usr('Y'), true)), (4, pg_temp.vis_get(pg_temp.usr('Y')))) v(n, x)),
  'PT403 mfa_required,PT403 mfa_required,PT403 mfa_required,PT403 mfa_required',
  'a verified factor at aal1 gets PT403 mfa_required from all four');
select extensions.is(pg_temp.career(pg_temp.usr('Y'), null, 'aal2'), '{"available": true, "locked": true}'::jsonb,
  'and at aal2 a non-member is locked');

-- ---------------------------------------------------------------------------
-- Members and non-members; preview
-- ---------------------------------------------------------------------------
select extensions.is(
  (select jsonb_agg(pg_temp.career(pg_temp.usr(t)) order by t) from unnest(array['C', 'F', 'X']) t),
  '[{"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}]'::jsonb,
  'on: a non-member gets {available:true, locked:true} and nothing else, whether or not they have a team');
select extensions.is(
  (select jsonb_agg(pg_temp.duel(pg_temp.usr(t), pg_temp.tm('A')) order by t) from unnest(array['C', 'F', 'X']) t)
  || jsonb_build_array(pg_temp.duel(pg_temp.usr('X'), gen_random_uuid())),
  '[{"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}, {"available": true, "locked": true}]'::jsonb,
  'a non-member is locked out of the duel before anything about the other team is looked at');
select app_private.premium_configure('preview', false, null);
select extensions.is(
  jsonb_build_array(pg_temp.career(pg_temp.usr('C')), pg_temp.duel(pg_temp.usr('C'), pg_temp.tm('A')),
    pg_temp.vis_get(pg_temp.usr('C')), pg_temp.vis_set(pg_temp.usr('C'), true)),
  '[{"available": false}, {"available": false}, {"available": false}, {"available": false}]'::jsonb,
  'preview: a non-member sees nothing, not even the lock, and cannot touch the switch');
select extensions.is(pg_temp.career(pg_temp.usr('A')) ->> 'locked', 'false', 'preview: a member reads their career');
select extensions.is((select count(*)::integer from app.card_history_visibility), 0, 'and nothing was written in preview');
select app_private.premium_configure('on', false, null);

-- ---------------------------------------------------------------------------
-- The career of A (stage A: GW1, GW2, GW3, GW5 evaluated, GW6 scheduled)
-- ---------------------------------------------------------------------------
select set_config('test.a', pg_temp.career(pg_temp.usr('A'))::text, true);
select extensions.is(pg_temp.keys(current_setting('test.a')::jsonb),
  'available,bestWeeks,captain,hero,locked,season,seasons,transfers,weeks,worstWeeks',
  'the career has exactly these ten keys');
select extensions.is(current_setting('test.a')::jsonb -> 'season',
  jsonb_build_object('id', pg_temp.id(5), 'label', '2089/90'), 'for the current season by default');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('seq', w ->> 'gameweekSeq', 'score', w -> 'score', 'ovr', w -> 'ovr',
      'tier', w -> 'tier', 'prov', w -> 'provisional', 'counted', w -> 'gameweeksCounted') order by (w ->> 'gameweekSeq')::integer)
   from jsonb_array_elements(current_setting('test.a')::jsonb -> 'weeks') w),
  '[{"seq":"1","score":60,"ovr":null,"tier":null,"prov":false,"counted":1},
    {"seq":"2","score":55,"ovr":null,"tier":null,"prov":false,"counted":2},
    {"seq":"3","score":60,"ovr":80,"tier":"champion","prov":true,"counted":3},
    {"seq":"5","score":80,"ovr":81,"tier":"champion","prov":true,"counted":4}]'::jsonb,
  'one entry per evaluable gameweek (GW4 is cancelled, GW6 not final): score, OVR and tier from GW3 on, none under the minimum');
select extensions.is(
  jsonb_build_object('keys', pg_temp.keys(current_setting('test.a')::jsonb -> 'weeks' -> 3),
    'stats', current_setting('test.a')::jsonb -> 'weeks' -> 3 -> 'stats',
    'raw', current_setting('test.a')::jsonb -> 'weeks' -> 3 -> 'raw',
    'rawKeys', pg_temp.keys(current_setting('test.a')::jsonb -> 'weeks' -> 3 -> 'raw')),
  jsonb_build_object(
    'keys', 'captain,chip,gameweekName,gameweekSeq,gameweeksCounted,ovr,provisional,raw,score,stats,tier,transferHit',
    'stats', '{"cap": 84, "sel": 85, "trf": 55, "con": 99}'::jsonb,
    'raw', '{"cap": 0.837037, "sel": 0.847013, "trf": 1.0, "con": 1.0}'::jsonb,
    'rawKeys', 'cap,con,sel,trf'),
  'a week carries the four stats and their raw values as of that week (GW5: 84, 85, 55, 99), and these keys');
select extensions.is(
  (current_setting('test.a')::jsonb -> 'weeks' -> 3 ->> 'chip') || '/' || (current_setting('test.a')::jsonb -> 'weeks' -> 0 ->> 'transferHit'),
  'triple_captain/4', 'the chip played and the points hit paid are shown');
select extensions.is(current_setting('test.a')::jsonb -> 'hero',
  '{"firstOvr": 80, "firstGameweekSeq": 3, "lastOvr": 81, "lastGameweekSeq": 5, "tier": "champion", "provisional": true}'::jsonb,
  'the hero line: OVR 80 at the first rated gameweek, 81 now');
select extensions.is(
  (select jsonb_agg(w -> 'gameweekSeq' order by o) from jsonb_array_elements(current_setting('test.a')::jsonb -> 'bestWeeks') with ordinality x(w, o))
  || (select jsonb_agg(w -> 'gameweekSeq' order by o) from jsonb_array_elements(current_setting('test.a')::jsonb -> 'worstWeeks') with ordinality x(w, o)),
  '[5, 1, 3, 2]'::jsonb,
  'best weeks GW5 (80), GW1 and GW3 (60 each, the earlier first); the worst of the rest: GW2 (55)');
select extensions.is(
  pg_temp.keys(current_setting('test.a')::jsonb -> 'bestWeeks' -> 0) || '/'
    || pg_temp.keys(current_setting('test.a')::jsonb -> 'bestWeeks' -> 0 -> 'captain') || '/'
    || (current_setting('test.a')::jsonb -> 'bestWeeks' -> 0 ->> 'topHalf'),
  'captain,gameweekSeq,score,topHalf/name,points,usedVice/true', 'a best week: score, the captain, and whether it was in the top half');
select extensions.is(
  jsonb_build_object('keys', pg_temp.keys(current_setting('test.a')::jsonb -> 'weeks' -> 1 -> 'captain'),
    'week2', current_setting('test.a')::jsonb -> 'weeks' -> 1 -> 'captain',
    'week1', current_setting('test.a')::jsonb -> 'weeks' -> 0 -> 'captain'),
  jsonb_build_object('keys', 'bestStarterPoints,hit,name,points,share,usedVice',
    'week2', '{"name": "MCP 8", "points": 10, "usedVice": true, "share": 0.833333, "hit": false, "bestStarterPoints": 12}'::jsonb,
    'week1', '{"name": "MCP 13", "points": 12, "usedVice": false, "share": null, "hit": null, "bestStarterPoints": 12}'::jsonb),
  'the captain of GW2 was the vice (the captain played no minutes) at 10 of a best 12; GW1 is before the captain start date, so no share');
select extensions.is(current_setting('test.a')::jsonb -> 'captain',
  '{"weeksCounted": 3, "hits": 0, "averageShare": 0.837037}'::jsonb,
  'captain hit rate: 0 hits in 3 counted weeks, mean share .837037');
select extensions.is(
  (select s.cap_raw from app.manager_card_seasons s where s.user_id = pg_temp.usr('A') and s.fantasy_season_id = pg_temp.id(5)),
  (current_setting('test.a')::jsonb -> 'captain' ->> 'averageShare')::numeric,
  'and that mean share is exactly the card''s cap_raw');
select extensions.is(
  jsonb_build_object('keys', pg_temp.keys(current_setting('test.a')::jsonb -> 'transfers'),
    'itemKeys', pg_temp.keys(current_setting('test.a')::jsonb -> 'transfers' -> 'items' -> 0),
    'seasonGain', current_setting('test.a')::jsonb -> 'transfers' -> 'seasonGain',
    'averageGain', current_setting('test.a')::jsonb -> 'transfers' -> 'averageGain',
    'hitsPaid', current_setting('test.a')::jsonb -> 'transfers' -> 'hitsPaid',
    'byGameweek', current_setting('test.a')::jsonb -> 'transfers' -> 'byGameweek'),
  jsonb_build_object('keys', 'averageGain,best,byGameweek,hitsPaid,items,seasonGain,worst',
    'itemKeys', 'gain,gameweekSeq,hit,playerIn,playerOut,state',
    'seasonGain', 2, 'averageGain', 1, 'hitsPaid', 4,
    'byGameweek', '[{"gameweekSeq": 1, "gain": 2, "transfers": 2}]'::jsonb),
  'transfers: the two ready ones sum to +2 (mean 1), 4 points of hits paid, grouped by the gameweek they were made');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('gw', i ->> 'gameweekSeq', 'out', i ->> 'playerOut', 'in', i ->> 'playerIn',
      'gain', i -> 'gain', 'state', i ->> 'state', 'hit', i -> 'hit') order by o)
   from jsonb_array_elements(current_setting('test.a')::jsonb -> 'transfers' -> 'items') with ordinality x(i, o)),
  '[{"gw":"1","out":"MCP 7","in":"MCP 16","gain":-1,"state":"counted","hit":2},
    {"gw":"1","out":"MCP 12","in":"MCP 17","gain":3,"state":"counted","hit":2},
    {"gw":"3","out":"MCP 14","in":"MCP 18","gain":null,"state":"pending","hit":0},
    {"gw":"5","out":"MCP 11","in":"MCP 12","gain":null,"state":"pending","hit":8}]'::jsonb,
  'X1 (-1 and +3, hit 2 each), X2 and X3 are pending until their window is played');
select extensions.is(
  jsonb_build_array(current_setting('test.a')::jsonb -> 'transfers' -> 'best', current_setting('test.a')::jsonb -> 'transfers' -> 'worst'),
  '[{"gameweekSeq": 1, "playerOut": "MCP 12", "playerIn": "MCP 17", "hit": 2, "gain": 3, "state": "counted"},
    {"gameweekSeq": 1, "playerOut": "MCP 7", "playerIn": "MCP 16", "hit": 2, "gain": -1, "state": "counted"}]'::jsonb,
  'the best and the worst transfer by name');
select extensions.is(
  (select round(avg((i ->> 'gain')::numeric), 6)
   from jsonb_array_elements(current_setting('test.a')::jsonb -> 'transfers' -> 'items') i),
  (select s.trf_raw from app.manager_card_seasons s where s.user_id = pg_temp.usr('A') and s.fantasy_season_id = pg_temp.id(5)),
  'the mean of the ready gains is exactly the card''s trf_raw');
select extensions.is(
  current_setting('test.a')::jsonb -> 'seasons',
  jsonb_build_array(jsonb_build_object('seasonId', pg_temp.id(5), 'label', '2089/90', 'ovr', 81, 'tier', 'champion',
    'provisional', true, 'bestTier', 'champion', 'gameweeksCounted', 4,
    'stats', '{"cap": 84, "sel": 85, "trf": 55, "con": 99}'::jsonb, 'closedAt', null)),
  'season against season: the final figures of every season the manager has a card for');

-- B: a week outside the top half, a captain who scored below the floor, no transfers
select set_config('test.b', pg_temp.career(pg_temp.usr('B'))::text, true);
select extensions.is(
  jsonb_build_object(
    'scores', (select jsonb_agg(w -> 'score' order by o) from jsonb_array_elements(current_setting('test.b')::jsonb -> 'weeks') with ordinality x(w, o)),
    'best', (select jsonb_agg(w -> 'gameweekSeq' order by o) from jsonb_array_elements(current_setting('test.b')::jsonb -> 'bestWeeks') with ordinality x(w, o)),
    'worst', current_setting('test.b')::jsonb -> 'worstWeeks',
    'captain', current_setting('test.b')::jsonb -> 'captain',
    'transfers', current_setting('test.b')::jsonb -> 'transfers'),
  '{"scores": [60, 50, 70, 40], "best": [3, 1, 2],
    "worst": [{"gameweekSeq": 5, "score": 40, "topHalf": false, "captain": {"name": "MCP 9", "points": -2, "usedVice": false}}],
    "captain": {"weeksCounted": 1, "hits": 0, "averageShare": 0.0},
    "transfers": {"items": [], "byGameweek": [], "seasonGain": null, "averageGain": null, "hitsPaid": 0, "best": null, "worst": null}}'::jsonb,
  'B: GW5 (40) is the worst week and below the top half; the captain on -2 floors at 0; no transfers; GW3 (a mismatching captain) is not counted');

-- G: a captain who was the best starter once; a Wildcard batch
select set_config('test.g', pg_temp.career(pg_temp.usr('G'))::text, true);
select extensions.is(
  jsonb_build_array(current_setting('test.g')::jsonb -> 'captain',
    current_setting('test.g')::jsonb -> 'transfers' -> 'averageGain',
    (select jsonb_agg(i -> 'gain' order by o) from jsonb_array_elements(current_setting('test.g')::jsonb -> 'transfers' -> 'items') with ordinality x(i, o))),
  '[{"weeksCounted": 3, "hits": 1, "averageShare": 0.611111}, 0, [-4, 4]]'::jsonb,
  'G: the captain was the best starter in 1 of 3 counted weeks; the Wildcard batch is counted (+4 and -4, mean 0)');
select extensions.is(
  jsonb_build_array(
    (select s.cap_raw from app.manager_card_seasons s where s.user_id = pg_temp.usr('G') and s.fantasy_season_id = pg_temp.id(5)),
    (select s.trf_raw from app.manager_card_seasons s where s.user_id = pg_temp.usr('G') and s.fantasy_season_id = pg_temp.id(5))),
  jsonb_build_array((current_setting('test.g')::jsonb -> 'captain' ->> 'averageShare')::numeric,
    (current_setting('test.g')::jsonb -> 'transfers' ->> 'averageGain')::numeric),
  'and both agree with G''s cap_raw and trf_raw');

-- Seasons
select extensions.is(
  jsonb_build_array(
    pg_temp.career(pg_temp.usr('A'), '2089/90') = current_setting('test.a')::jsonb,
    pg_temp.career(pg_temp.usr('A'), pg_temp.id(5)::text) = current_setting('test.a')::jsonb,
    pg_temp.career(pg_temp.usr('A'), upper(pg_temp.id(5)::text)) = current_setting('test.a')::jsonb),
  '[true, true, true]'::jsonb,
  'a season by label or by id (in either case) gives the same answer');
select extensions.is(
  (select jsonb_build_array(r -> 'season' ->> 'label', r -> 'weeks', r -> 'hero', r -> 'captain', r -> 'transfers' -> 'items')
   from (select pg_temp.career(pg_temp.usr('A'), '2088/89') r) x),
  '["2088/89", [], null, {"weeksCounted": 0, "hits": 0, "averageShare": null}, []]'::jsonb,
  'an earlier season with no evaluated week is empty, not an error');
select extensions.is(
  pg_temp.career(pg_temp.usr('A'), '2077/78') ->> '__error', 'PT404 card_season_not_found', 'an unknown season is PT404');
select extensions.is(
  (select pg_temp.career(pg_temp.usr('B'), '2077/78') ->> '__error'), 'PT404 card_season_not_found', 'for any member');

-- ---------------------------------------------------------------------------
-- The duel
-- ---------------------------------------------------------------------------
-- A against B: B has not switched the history on (the default).
select set_config('test.hidden', pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B'))::text, true);
select extensions.is(pg_temp.keys(current_setting('test.hidden')::jsonb),
  'available,locked,me,opponent,season,seasons,summary,weeks', 'the duel has exactly these eight keys');
select extensions.is(
  jsonb_build_array(current_setting('test.hidden')::jsonb -> 'weeks', current_setting('test.hidden')::jsonb -> 'summary',
    current_setting('test.hidden')::jsonb -> 'opponent' -> 'historyVisible',
    pg_temp.keys(current_setting('test.hidden')::jsonb -> 'opponent'),
    pg_temp.keys(current_setting('test.hidden')::jsonb -> 'me')),
  '[[], null, false, "card,historyVisible,teamId", "card,teamId"]'::jsonb,
  'hidden by default: no week and no summary, only today''s card values');
select extensions.is(
  jsonb_build_object('keys', pg_temp.keys(current_setting('test.hidden')::jsonb -> 'opponent' -> 'card'),
    'ovr', current_setting('test.hidden')::jsonb -> 'opponent' -> 'card' -> 'ovr',
    'tier', current_setting('test.hidden')::jsonb -> 'opponent' -> 'card' -> 'tier',
    'edition', current_setting('test.hidden')::jsonb -> 'opponent' -> 'card' -> 'edition',
    'team', current_setting('test.hidden')::jsonb -> 'opponent' -> 'teamId'),
  jsonb_build_object(
    'keys', 'club,edition,firstRatedGameweekSeq,founderCohort,gameweeksCounted,minRated,name,ovr,provisional,ratingState,seasonLabel,serial,stats,teamId,tier',
    'ovr', 54, 'tier', 'stade', 'edition', 'standard', 'team', pg_temp.tm('B')),
  'today''s values are the batch card read''s: its fourteen keys plus the edition');
select extensions.is(
  jsonb_build_object('season', current_setting('test.hidden')::jsonb -> 'season',
    'seasons', current_setting('test.hidden')::jsonb -> 'seasons',
    'me', current_setting('test.hidden')::jsonb -> 'me' -> 'card' -> 'ovr'),
  jsonb_build_object('season', jsonb_build_object('id', pg_temp.id(5), 'label', '2089/90'),
    'seasons', jsonb_build_array(jsonb_build_object('seasonId', pg_temp.id(5), 'label', '2089/90')),
    'me', 81),
  'the season compared, the seasons the two share (one), and the viewer''s own card');

-- B switches it on.
select extensions.is(pg_temp.vis_get(pg_temp.usr('B')), '{"available": true, "visible": false}'::jsonb,
  'the switch reads off before it is ever set');
select extensions.is(pg_temp.vis_set(pg_temp.usr('B'), true), '{"available": true, "visible": true}'::jsonb,
  'B switches it on');
select extensions.is(pg_temp.vis_get(pg_temp.usr('B')), '{"available": true, "visible": true}'::jsonb, 'and it reads on');
select set_config('test.visible', pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B'))::text, true);
select extensions.is(
  jsonb_build_array(pg_temp.keys((current_setting('test.visible')::jsonb -> 'weeks') -> 0),
    pg_temp.keys((current_setting('test.visible')::jsonb -> 'weeks') -> 0 -> 'me'),
    pg_temp.keys(current_setting('test.visible')::jsonb -> 'summary'),
    current_setting('test.visible')::jsonb -> 'opponent' -> 'historyVisible'),
  '["gameweekName,gameweekSeq,me,opponent,winner", "ovr,provisional,score,stats,tier", "biggestLoss,biggestWin,meWins,opponentBestCaptain,opponentWins,played,ties", true]'::jsonb,
  'visible: the week-by-week comparison and the summary appear, with these keys');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('gw', w -> 'gameweekSeq', 'winner', w -> 'winner', 'me', w -> 'me' -> 'score', 'them', w -> 'opponent' -> 'score') order by o)
   from jsonb_array_elements(current_setting('test.visible')::jsonb -> 'weeks') with ordinality x(w, o)),
  '[{"gw":1,"winner":"tie","me":60,"them":60},{"gw":2,"winner":"me","me":55,"them":50},
    {"gw":3,"winner":"opponent","me":60,"them":70},{"gw":5,"winner":"me","me":80,"them":40}]'::jsonb,
  'journée by journée: only gameweeks both played, who scored more');
select extensions.is(
  jsonb_build_array(current_setting('test.visible')::jsonb -> 'weeks' -> 3 -> 'me', current_setting('test.visible')::jsonb -> 'weeks' -> 3 -> 'opponent',
    current_setting('test.visible')::jsonb -> 'weeks' -> 2 -> 'opponent'),
  '[{"score": 80, "ovr": 81, "tier": "champion", "provisional": true, "stats": {"cap": 84, "sel": 85, "trf": 55, "con": 99}},
    {"score": 40, "ovr": 54, "tier": "stade", "provisional": true, "stats": {"cap": 1, "sel": 86, "trf": null, "con": 75}},
    {"score": 70, "ovr": null, "tier": null, "provisional": false, "stats": {"cap": null, "sel": 88, "trf": null, "con": 99}}]'::jsonb,
  'stat by stat as of each week, both cards; under the minimum a stat is null');
select extensions.is(current_setting('test.visible')::jsonb -> 'summary',
  '{"played": 4, "meWins": 2, "opponentWins": 1, "ties": 1,
    "biggestWin": {"gameweekSeq": 5, "margin": 40}, "biggestLoss": {"gameweekSeq": 3, "margin": 10},
    "opponentBestCaptain": {"gameweekSeq": 1, "name": "MCP 13", "points": 12}}'::jsonb,
  'the summary: 2 wins, 1 loss, 1 tie; the biggest win and loss; their best captain pick');
-- Switching it back hides it again, exactly as before.
select extensions.is(pg_temp.vis_set(pg_temp.usr('B'), false), '{"available": true, "visible": false}'::jsonb, 'B switches it off');
select extensions.is(pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B')), current_setting('test.hidden')::jsonb,
  'and the answer is again exactly the hidden one');
select extensions.is((select count(*)::integer from app.card_history_visibility), 1, 'one row, updated in place');

-- C is not a member: paying unlocks the viewer's screen, not the friend's data.
select extensions.is(pg_temp.vis_set(pg_temp.usr('C'), true), '{"available": true, "visible": true}'::jsonb,
  'a non-member may switch their own history on');
select extensions.is(
  (select jsonb_build_array(r -> 'opponent' -> 'historyVisible', jsonb_array_length(r -> 'weeks'), r -> 'summary' -> 'meWins',
      r -> 'summary' -> 'biggestWin')
   from (select pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('C')) r) x),
  '[true, 4, 4, {"gameweekSeq": 5, "margin": 45}]'::jsonb,
  'and a member sees it: the friend need not be a member (C 50, 45, 30, 35 against A 60, 55, 60, 80)');
select pg_temp.vis_set(pg_temp.usr('C'), false);
select extensions.is(jsonb_array_length(pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('C')) -> 'weeks'), 0, 'switched off again: no weeks');
-- The other direction: A has not switched hers on either.
select extensions.is(
  (select jsonb_build_array(r -> 'opponent' -> 'historyVisible', r -> 'weeks', r -> 'opponent' -> 'card' -> 'ovr')
   from (select pg_temp.duel(pg_temp.usr('B'), pg_temp.tm('A')) r) x),
  '[false, [], 81]'::jsonb, 'B looking at A sees only A''s today values: A''s switch is off too');
select pg_temp.vis_set(pg_temp.usr('A'), true);
select extensions.is(
  (select jsonb_array_length(pg_temp.duel(pg_temp.usr('B'), pg_temp.tm('A')) -> 'weeks')),
  4, 'until A switches it on');
select pg_temp.vis_set(pg_temp.usr('A'), false);

-- Who may be compared: one answer for everything else
select extensions.is(
  (select string_agg(coalesce(x ->> '__error', 'no error'), '|' order by n) from (values
    (1, pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('G'))),
    (2, pg_temp.duel(pg_temp.usr('A'), gen_random_uuid())),
    (3, pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('A'))),
    (4, pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('D'))),
    (5, pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B'), '2088/89')),
    (6, pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B'), '2077/78')),
    (7, pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('E'))),
    (8, pg_temp.duel(pg_temp.usr('G'), pg_temp.tm('A')))) v(n, x)),
  (select string_agg('PT404 card_duel_not_found', '|') from generate_series(1, 8)),
  'a manager A shares only a public league with, an unknown team, oneself, a deleted profile, a season they do not share, an unknown season, a manager in no league, and the same seen from G: all the same PT404, no hint why');
select extensions.is(pg_temp.duel(pg_temp.usr('G'), pg_temp.tm('B')) ->> 'locked', 'false',
  'G, who shares the private league L2 with B, can compare (a member)');
-- A left or removed membership, an inactive league
update app.fantasy_league_memberships set status = 'left', left_at = statement_timestamp()
where league_id = pg_temp.id(701) and user_id = pg_temp.usr('B');
select extensions.is(pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B')) ->> '__error', 'PT404 card_duel_not_found',
  'a mate who left the league is no longer a mate');
update app.fantasy_league_memberships set status = 'active', left_at = null
where league_id = pg_temp.id(701) and user_id = pg_temp.usr('B');
update app.fantasy_leagues set active = false where id = pg_temp.id(701);
select extensions.is(pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B')) ->> '__error', 'PT404 card_duel_not_found',
  'nor in an inactive league');
update app.fantasy_leagues set active = true where id = pg_temp.id(701);
select extensions.is(pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B')) ->> 'locked', 'false', 'the league back on, the duel works again');

-- Seasons
select extensions.is(
  (select jsonb_build_array(r -> 'season' ->> 'label', (select jsonb_agg(s ->> 'label') from jsonb_array_elements(r -> 'seasons') s))
   from (select pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('F')) r) x),
  '["2089/90", ["2089/90", "2088/89"]]'::jsonb,
  'A and F share two seasons: the one of the team asked about, and the earlier one to switch to');
select extensions.is(
  (select jsonb_build_array(r -> 'season' ->> 'label', r -> 'weeks', r -> 'me' ->> 'teamId', r -> 'opponent' ->> 'teamId')
   from (select pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('F'), '2088/89') r) x),
  jsonb_build_array('2088/89', '[]'::jsonb, pg_temp.id(451)::text, pg_temp.id(450)::text),
  'by label, the earlier season compares their teams of that season');
select extensions.is(
  pg_temp.duel(pg_temp.usr('A'), pg_temp.id(450)) -> 'season' ->> 'label', '2088/89',
  'asking with F''s team of the earlier season defaults to that season');
select extensions.is(
  pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('F'), pg_temp.id(9)::text) -> 'season' ->> 'label', '2088/89', 'and by season id');
-- A lapsed member is locked again
update app.premium_entitlements set current_period_end = statement_timestamp() - interval '1 day'
where user_id = pg_temp.usr('A');
select extensions.is(
  jsonb_build_array(pg_temp.career(pg_temp.usr('A')), pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B'))),
  '[{"available": true, "locked": true}, {"available": true, "locked": true}]'::jsonb,
  'when the membership lapses both reads lock again, and show nothing');
update app.premium_entitlements set current_period_end = statement_timestamp() + interval '20 days'
where user_id = pg_temp.usr('A');
-- The switch: the other answers
select extensions.is(
  (select string_agg(coalesce(x ->> '__error', 'no error'), '|' order by n) from (values
    (1, pg_temp.run(pg_temp.usr('D'), 'aal1', 'api.set_card_history_visibility(true)')),
    (2, pg_temp.run(pg_temp.usr('X'), 'aal1', 'api.set_card_history_visibility(null)'))) v(n, x)),
  'PT404 profile_not_found|PT400 validation_failed',
  'a profile marked for deletion cannot set it, and a missing value is refused');
select extensions.is(
  (select jsonb_build_array(count(*), bool_and(visible_to_league_mates is not null))
   from app.card_history_visibility where user_id in (pg_temp.usr('D'), pg_temp.usr('X'))),
  '[0, null]'::jsonb, 'and nothing was written for them');

-- ---------------------------------------------------------------------------
-- Stage B: GW6 is finalized, the last gameweek of the season. Every transfer
-- is ready now, and the reads still agree with the card.
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

update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = statement_timestamp() where id = pg_temp.gw(6);
select set_config('test.tick', app_private.manager_card_tick()::text, true);
select extensions.is((current_setting('test.tick')::jsonb) ->> 'outcome', 'evaluated', 'the card evaluates GW6');
select set_config('test.a6', pg_temp.career(pg_temp.usr('A'))::text, true);
select extensions.is(
  jsonb_build_array(
    (select jsonb_agg(i -> 'gain' order by o) from jsonb_array_elements(current_setting('test.a6')::jsonb -> 'transfers' -> 'items') with ordinality x(i, o)),
    (select jsonb_agg(distinct i ->> 'state') from jsonb_array_elements(current_setting('test.a6')::jsonb -> 'transfers' -> 'items') i),
    current_setting('test.a6')::jsonb -> 'transfers' -> 'seasonGain',
    current_setting('test.a6')::jsonb -> 'transfers' -> 'averageGain',
    current_setting('test.a6')::jsonb -> 'transfers' -> 'byGameweek',
    current_setting('test.a6')::jsonb -> 'transfers' -> 'best' ->> 'playerIn',
    current_setting('test.a6')::jsonb -> 'transfers' -> 'worst' ->> 'playerIn',
    jsonb_array_length(current_setting('test.a6')::jsonb -> 'weeks')),
  '[[-1, 3, 5, 1], ["counted"], 8, 2, [{"gameweekSeq": 1, "gain": 2, "transfers": 2}, {"gameweekSeq": 3, "gain": 5, "transfers": 1}, {"gameweekSeq": 5, "gain": 1, "transfers": 1}],
    "MCP 18", "MCP 16", 5]'::jsonb,
  'after GW6 all four transfers count (-1, +3, +5, +1; X3 ends with two weeks), and there are five weeks');
select extensions.is(
  (select jsonb_agg(jsonb_build_array(
      (select s.cap_raw from app.manager_card_seasons s where s.user_id = pg_temp.usr(t) and s.fantasy_season_id = pg_temp.id(5)),
      (pg_temp.career(pg_temp.usr(t)) -> 'captain' ->> 'averageShare')::numeric,
      (select s.trf_raw from app.manager_card_seasons s where s.user_id = pg_temp.usr(t) and s.fantasy_season_id = pg_temp.id(5)),
      (pg_temp.career(pg_temp.usr(t)) -> 'transfers' ->> 'averageGain')::numeric) order by t)
   from unnest(array['A', 'B', 'G']) t),
  '[[0.877778, 0.877778, 2.000000, 2.0],
    [0.083333, 0.083333, null, null],
    [0.583333, 0.583333, 0.000000, 0.0]]'::jsonb,
  'after the last gameweek the mean captain share equals cap_raw and the mean transfer gain equals trf_raw for A, B and G (B has no transfer: both null)');
select extensions.is(
  jsonb_build_array(current_setting('test.a6')::jsonb -> 'hero' -> 'lastOvr', current_setting('test.a6')::jsonb -> 'hero' -> 'provisional',
    current_setting('test.a6')::jsonb -> 'weeks' -> 4 -> 'ovr'),
  '[82, false, 82]'::jsonb, 'five counted weeks clear the provisional mark (OVR 82)');

-- None of it wrote a Fantasy or a card table.
select set_config('test.state', pg_temp.card_state() || pg_temp.fantasy_state(), true);
select pg_temp.career(pg_temp.usr('A')), pg_temp.career(pg_temp.usr('G'), '2088/89'),
  pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('B')), pg_temp.duel(pg_temp.usr('A'), pg_temp.tm('C')),
  pg_temp.vis_get(pg_temp.usr('A')), pg_temp.vis_set(pg_temp.usr('A'), true), pg_temp.vis_set(pg_temp.usr('A'), false);
select extensions.ok(pg_temp.card_state() || pg_temp.fantasy_state() = current_setting('test.state'),
  'the reads and the switch left every card table, the ledger, the job log and every Fantasy table exactly as they were');

select * from extensions.finish();
rollback;
