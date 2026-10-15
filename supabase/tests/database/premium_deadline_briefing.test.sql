-- BotolaGO+ deadline briefing (20261015140000): api.get_my_deadline_briefing,
-- api.get_my_briefing_alternatives and their two app_private helpers.
--
-- Covered: grants, volatility and search_path; "off is an answer" and the sign-in order; members
-- against non-members and preview; the squad, the last three journees (published points with
-- their date, pending, and a rating-less 5 never returned as a number once the rating rule is on),
-- the provider's absence with its source date and the count of listed absences, the next
-- opponent with the difficulty estimate (absent when there is none), the transfer rules, the
-- league rank; the alternatives (same position, within sale price plus bank, not in the squad,
-- not over the club limit, by price); and that neither read writes anything.
--
-- THE FIXTURE (all numbers worked out in the comments):
--   season S (ruleset v1: 3 per club, hit 4, captain x2); gameweeks G8, G9 finalized, G10
--   scheduled (not published), G11 open (the briefing's gameweek).
--   clubs K1, K2, K3. Karim (A, member) owns MID1 (K1, 7.0), MID2 (K1, 6.0), MID3 (K1, 5.0),
--   FWD1 (K2, 9.0); bank 0.8, one free transfer. B is not a member. C is a member without a team.
--   MID4 (K1, 7.8), MID5 (K3, 7.4), MID6 (K3, 7.0), MID7 (K3, 8.9) and GK1 are not in the squad.
begin;
select extensions.plan(30);

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


select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('bc0f0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.fp(n integer) returns uuid language sql immutable as $$ select pg_temp.u(1000 + n) $$;
create function pg_temp.gw(n integer) returns uuid language sql immutable as $$ select pg_temp.u(20 + n) $$;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.u(1), 'MA', 'MAR') on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.u(2), 'briefing-test', 'Briefing Test', 'BT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.u(3), pg_temp.u(2), '2091/92', '2091-08-01', '2092-06-30', 'active', true);
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.u(4), pg_temp.u(2), 'briefing-test', 'Briefing Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.u(5), pg_temp.u(4), pg_temp.u(3), 'f6100000-0000-4000-8000-000000000100', '2091/92', 'active', '2091-08-01', '2092-06-30');
-- One football round per gameweek: a season's gameweeks each name a distinct round.
insert into app.rounds (id, season_id, round_number, name, status)
select pg_temp.u(30 + n), pg_temp.u(3), n, 'Round ' || n, 'completed' from generate_series(8, 11) n;
insert into app.fantasy_gameweeks (id, fantasy_season_id, sequence_number, name, deadline_at, starts_at, ends_at,
  status, finalized_at, points_state, scoring_input_version, football_round_id)
values
  (pg_temp.gw(8), pg_temp.u(5), 8, 'G8', '2091-09-30 10:00+00', '2091-09-30 12:00+00', '2091-10-02 12:00+00', 'finalized', '2091-10-05 12:00+00', 'final', 1, pg_temp.u(38)),
  (pg_temp.gw(9), pg_temp.u(5), 9, 'G9', '2091-10-07 10:00+00', '2091-10-07 12:00+00', '2091-10-09 12:00+00', 'finalized', '2091-10-12 12:00+00', 'final', 1, pg_temp.u(39)),
  (pg_temp.gw(10), pg_temp.u(5), 10, 'G10', '2091-10-14 10:00+00', '2091-10-14 12:00+00', '2091-10-16 12:00+00', 'scheduled', null, 'provisional', 1, pg_temp.u(40)),
  (pg_temp.gw(11), pg_temp.u(5), 11, 'G11', '2091-10-21 10:00+00', '2091-10-21 12:00+00', '2091-10-23 12:00+00', 'open', null, 'provisional', 1, pg_temp.u(41));

insert into app.teams (id, slug, name, short_name, code, country_id, primary_color, secondary_color)
select pg_temp.u(10 + n), 'briefing-club-' || n, 'Club ' || n, 'K' || n, 'KK' || n,
  (select id from app.countries where iso_alpha2 = 'MA'), '#112233', '#445566' from generate_series(1, 3) n;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.u(2000 + p.n), 'briefing-player-' || p.n, 'Player ' || p.name, p.name,
  p.pos::app.football_position
from (values (1,'MID1','midfielder'),(2,'MID2','midfielder'),(3,'MID3','midfielder'),(4,'FWD1','forward'),
  (5,'MID4','midfielder'),(6,'MID5','midfielder'),(7,'MID6','midfielder'),(8,'MID7','midfielder'),(9,'GK1','goalkeeper')) p(n, name, pos);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select pg_temp.fp(p.n), pg_temp.u(5), pg_temp.u(2000 + p.n), pg_temp.u(10 + p.club),
  (select id from app.fantasy_positions where code = p.code), p.price
from (values (1,'MID',1,7.0),(2,'MID',1,6.0),(3,'MID',1,5.0),(4,'FWD',2,9.0),
  (5,'MID',1,7.8),(6,'MID',3,7.4),(7,'MID',3,7.0),(8,'MID',3,8.9),(9,'GK',3,4.5)) p(n, code, club, price);

select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.u(300 + u.n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, statement_timestamp(), 'hash', '{}', u.meta::jsonb, statement_timestamp(), statement_timestamp()
from (values
  (1, 'br-a@example.test', '{"username":"karim_br","display_name":"Karim B."}'),
  (2, 'br-b@example.test', '{"username":"sami_br","display_name":"Sami Test"}'),
  (3, 'br-c@example.test', '{"username":"yassine_br","display_name":"Yassine Test"}')) u(n, email, meta);
insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start, current_period_end, last_event_at)
select pg_temp.u(300 + n), 'active', 'plus_monthly', 'web', statement_timestamp() - interval '10 days',
  statement_timestamp() + interval '20 days', statement_timestamp() - interval '10 days'
from unnest(array[1, 3]) n;

insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers, status)
values (pg_temp.u(400), pg_temp.u(301), pg_temp.u(5), pg_temp.gw(11), 'KACM Team', 0.8, 27.0, 1, 'active'),
  (pg_temp.u(401), pg_temp.u(302), pg_temp.u(5), pg_temp.gw(11), 'Sami Team', 0, 27.0, 1, 'active');
insert into app.fantasy_squad_memberships (fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id)
select pg_temp.u(400), pg_temp.fp(p.n), p.price, p.price, pg_temp.gw(8)
from (values (1, 7.0), (2, 6.0), (3, 5.0), (4, 9.0)) p(n, price);
insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
values (pg_temp.u(500), pg_temp.u(400), pg_temp.gw(11), 1, null);
insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, snapshot_price)
values (pg_temp.u(500), pg_temp.fp(4), 'starter', 1, true, false, 9.0),
  (pg_temp.u(500), pg_temp.fp(1), 'starter', 2, false, true, 7.0),
  (pg_temp.u(500), pg_temp.fp(2), 'bench', 1, false, false, 6.0);

-- Published points (gameweek, player, final or null, provisional, minutes). The finalized-at date
-- is the row's own.
--   MID1: G8 7 (90 min)  G9 5 (60 min)  G10 provisional only (not published)
--   MID2: G8 no row (finalized gameweek: did not play = 0, 0 min)  G9 8  G10 final 6 (published early)
--   FWD1: G8 9  G9 0 (0 min)  G10 none
insert into app.fantasy_player_gameweek_points (fantasy_player_id, gameweek_id, provisional_points, final_points,
  minutes_played, did_play, calculation_version, football_input_version, finalized_at)
values
  (pg_temp.fp(1), pg_temp.gw(8), 7, 7, 90, true, 1, 0, '2091-10-05 12:00+00'),
  (pg_temp.fp(1), pg_temp.gw(9), 5, 5, 60, true, 1, 0, '2091-10-12 12:00+00'),
  (pg_temp.fp(1), pg_temp.gw(10), 4, null, 30, true, 1, 0, null),
  (pg_temp.fp(2), pg_temp.gw(9), 8, 8, 90, true, 1, 0, '2091-10-12 12:00+00'),
  (pg_temp.fp(2), pg_temp.gw(10), 6, 6, 90, true, 1, 0, '2091-10-15 12:00+00'),
  (pg_temp.fp(4), pg_temp.gw(8), 9, 9, 90, true, 1, 0, '2091-10-05 12:00+00'),
  (pg_temp.fp(4), pg_temp.gw(9), 0, 0, 0, false, 1, 0, '2091-10-12 12:00+00');

-- Alternatives' points: MID5 G8 6 only.
insert into app.fantasy_player_gameweek_points (fantasy_player_id, gameweek_id, provisional_points, final_points,
  minutes_played, did_play, calculation_version, football_input_version, finalized_at)
values (pg_temp.fp(5), pg_temp.gw(8), 6, 6, 90, true, 1, 0, '2091-10-05 12:00+00');

-- A league of Karim and Sami: Sami is ahead, Karim 2nd of 2 (his older ranking row, 1st, is not the current one).
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility, invite_code_digest, invite_code_hint, member_count)
values (pg_temp.u(700), pg_temp.u(5), pg_temp.u(301), 'Les Lions du Derb', 'private',
  encode(extensions.digest('briefing-league', 'sha256'), 'hex'), 'ABCD', 2);
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id)
values (pg_temp.u(700), pg_temp.u(400), pg_temp.u(301)), (pg_temp.u(700), pg_temp.u(401), pg_temp.u(302));
-- One ranking per gameweek and team: the older pair is after G8, the current one after G9.
insert into app.fantasy_rankings (fantasy_season_id, gameweek_id, league_id, fantasy_team_id, rank, total_points, calculation_version, calculated_at)
values (pg_temp.u(5), pg_temp.gw(8), pg_temp.u(700), pg_temp.u(400), 1, 50, 1, '2091-10-05 13:00+00'),
  (pg_temp.u(5), pg_temp.gw(8), pg_temp.u(700), pg_temp.u(401), 2, 45, 1, '2091-10-05 13:00+00'),
  (pg_temp.u(5), pg_temp.gw(9), pg_temp.u(700), pg_temp.u(400), 2, 60, 1, '2091-10-12 13:00+00'),
  (pg_temp.u(5), pg_temp.gw(9), pg_temp.u(700), pg_temp.u(401), 1, 66, 1, '2091-10-12 13:00+00');

create function pg_temp.brief(p_user uuid, p_aal text default 'aal1') returns jsonb language sql as $$
  select pg_temp.run(p_user, p_aal, 'api.get_my_deadline_briefing()') $$;
create function pg_temp.alts(p_user uuid, p_player uuid, p_limit integer default 6) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', format('api.get_my_briefing_alternatives(%L, %s)', p_player, p_limit)) $$;
create function pg_temp.state() returns text language sql as $$
  select md5(concat_ws('#',
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_teams t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_squad_memberships t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_lineup_players t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_player_gameweek_points t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_rankings t),
    (select coalesce(string_agg(t::text, '|' order by t::text), '-') from app.fantasy_gameweeks t),
    (select count(*)::text from cron.job))) $$;
create function pg_temp.player(j jsonb, p_name text) returns jsonb language sql as $$
  select x from jsonb_array_elements(j -> 'squad') x where x ->> 'name' = p_name $$;

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select extensions.ok(
  has_function_privilege('authenticated', 'api.get_my_deadline_briefing(uuid)', 'execute')
  and has_function_privilege('service_role', 'api.get_my_deadline_briefing(uuid)', 'execute')
  and not has_function_privilege('anon', 'api.get_my_deadline_briefing(uuid)', 'execute')
  and not has_function_privilege('public', 'api.get_my_deadline_briefing(uuid)', 'execute')
  and has_function_privilege('authenticated', 'api.get_my_briefing_alternatives(uuid,integer)', 'execute')
  and not has_function_privilege('anon', 'api.get_my_briefing_alternatives(uuid,integer)', 'execute')
  and not has_function_privilege('public', 'api.get_my_briefing_alternatives(uuid,integer)', 'execute'),
  'both reads are for authenticated and service_role, not anon or PUBLIC');
select extensions.ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = 's')
   from pg_proc p where p.oid in ('api.get_my_deadline_briefing(uuid)'::regprocedure,
     'api.get_my_briefing_alternatives(uuid,integer)'::regprocedure)),
  'both are security definer with an empty search_path, and STABLE (they cannot write)');
select extensions.is(
  (select count(*)::integer from pg_proc p
   cross join unnest(array['anon', 'authenticated', 'service_role', 'public']) r
   where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('briefing_membership', 'briefing_form')
     and has_function_privilege(r, p.oid, 'execute')),
  0, 'no API role can run either helper');
select extensions.ok(
  (select count(*) = 2 and bool_and(p.provolatile = 's' and p.proconfig @> array['search_path=""'])
   from pg_proc p where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('briefing_membership', 'briefing_form')),
  'the helpers are STABLE with an empty search_path');
select extensions.is(
  (select count(*)::integer from pg_proc p where p.pronamespace = 'api'::regnamespace
   and p.proname in ('get_my_deadline_briefing', 'get_my_briefing_alternatives')),
  2, 'one signature each');

-- ---------------------------------------------------------------------------
-- Off is an answer; the sign-in order
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.brief(pg_temp.u(301)), '{"available": false}'::jsonb, 'BotolaGO+ off: {"available": false}');
select extensions.is(pg_temp.alts(pg_temp.u(301), pg_temp.fp(1)), '{"available": false}'::jsonb, 'and so is the alternatives read');
select app_private.premium_configure('on', false, null);
select extensions.is(pg_temp.run(null, null, 'api.get_my_deadline_briefing()', 'anon') ->> '__error' like '42501%', true,
  'anon is refused (42501)');
select extensions.is(pg_temp.run(null, null, 'api.get_my_deadline_briefing()') ->> '__error',
  'PT401 authentication_required', 'a signed-in role without a user is PT401');

-- ---------------------------------------------------------------------------
-- Members and non-members; preview
-- ---------------------------------------------------------------------------
select extensions.is(jsonb_build_array(pg_temp.brief(pg_temp.u(302)), pg_temp.alts(pg_temp.u(302), pg_temp.fp(1))),
  '[{"available": true, "locked": true}, {"available": true, "locked": true}]'::jsonb,
  'on: a non-member is locked and nothing else comes with it');
select app_private.premium_configure('preview', false, null);
select extensions.is(pg_temp.brief(pg_temp.u(302)), '{"available": false}'::jsonb, 'preview: a non-member sees nothing, not even the lock');
select extensions.is(pg_temp.brief(pg_temp.u(301)) ->> 'locked', 'false', 'preview: a member reads the briefing');
select app_private.premium_configure('on', false, null);
select extensions.is(pg_temp.brief(pg_temp.u(303)), '{"available": true, "locked": false, "gameweek": null}'::jsonb,
  'a member without a team gets an empty state, not an error');

-- ---------------------------------------------------------------------------
-- The briefing of Karim
-- ---------------------------------------------------------------------------
select set_config('test.before', pg_temp.state(), true);
select set_config('test.b', pg_temp.brief(pg_temp.u(301))::text, true);
select extensions.is(
  (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(current_setting('test.b')::jsonb) k),
  'absenceFeed,available,gameweek,league,locked,published,squad,team',
  'the answer has exactly these eight keys');
select extensions.is(
  jsonb_build_object('gameweek', (current_setting('test.b')::jsonb -> 'gameweek') - 'id', 'team', (current_setting('test.b')::jsonb -> 'team') - 'id'),
  '{"gameweek": {"name": "G11", "sequence": 11, "deadlineAt": "2091-10-21T10:00:00+00:00"},
    "team": {"name": "KACM Team", "bank": 0.80, "teamValue": 27.00, "freeTransfers": 1, "transferHitCost": 4,
             "maxPerClub": 3, "captainMultiplier": 2}}'::jsonb,
  'the open gameweek and its deadline, and the team: bank 0.8, one free transfer, a hit of 4, three per club, captain x2');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('s', x ->> 'sequence', 'state', x ->> 'state') order by (x ->> 'sequence')::int)
   from jsonb_array_elements(current_setting('test.b')::jsonb -> 'published') x),
  '[{"s": "8", "state": "published"}, {"s": "9", "state": "published"}, {"s": "10", "state": "partial"}]'::jsonb,
  'the three journees before: G8 and G9 published, G10 partial (one player has final points, the gameweek is not final)');
select extensions.is(
  (select jsonb_agg(x ->> 'name' order by x ->> 'position', x ->> 'name') from jsonb_array_elements(current_setting('test.b')::jsonb -> 'squad') x),
  '["FWD1", "MID1", "MID2", "MID3"]'::jsonb, 'the squad is the four owned players');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('n', x ->> 'name', 'role', x ->> 'role', 'c', x -> 'captain', 'v', x -> 'viceCaptain') order by x ->> 'name')
   from jsonb_array_elements(current_setting('test.b')::jsonb -> 'squad') x),
  '[{"n": "FWD1", "role": "starter", "c": true, "v": false}, {"n": "MID1", "role": "starter", "c": false, "v": true},
    {"n": "MID2", "role": "bench", "c": false, "v": false}, {"n": "MID3", "role": null, "c": false, "v": false}]'::jsonb,
  'roles and armbands from the lineup of the open gameweek; a player not in it has no role');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('s', f ->> 'gameweekSequence', 'state', f ->> 'state', 'pts', f -> 'points', 'min', f -> 'minutes') order by (f ->> 'gameweekSequence')::int)
   from jsonb_array_elements(pg_temp.player(current_setting('test.b')::jsonb, 'MID1') -> 'form') f),
  '[{"s": "8", "state": "published", "pts": 7, "min": 90}, {"s": "9", "state": "published", "pts": 5, "min": 60},
    {"s": "10", "state": "pending", "pts": null, "min": null}]'::jsonb,
  'MID1: 7 and 5 published (the rating rule is off, so 5 is a total), G10 pending with no number and no minutes');
select extensions.is(
  (select jsonb_agg(jsonb_build_object('s', f ->> 'gameweekSequence', 'state', f ->> 'state', 'pts', f -> 'points', 'min', f -> 'minutes', 'at', f ->> 'publishedAt') order by (f ->> 'gameweekSequence')::int)
   from jsonb_array_elements(pg_temp.player(current_setting('test.b')::jsonb, 'MID2') -> 'form') f),
  '[{"s": "8", "state": "published", "pts": 0, "min": 0, "at": "2091-10-05T12:00:00+00:00"},
    {"s": "9", "state": "published", "pts": 8, "min": 90, "at": "2091-10-12T12:00:00+00:00"},
    {"s": "10", "state": "published", "pts": 6, "min": 90, "at": "2091-10-15T12:00:00+00:00"}]'::jsonb,
  'MID2: no row in a finalized gameweek reads as did not play (0, stamped with the gameweek), then 8 and 6 with the player''s own date');
select extensions.is(
  (select jsonb_agg(f ->> 'state' order by (f ->> 'gameweekSequence')::int)
   from jsonb_array_elements(pg_temp.player(current_setting('test.b')::jsonb, 'MID3') -> 'form') f),
  '["published", "published", "pending"]'::jsonb, 'MID3: no rows at all: 0 and 0 in the finalized gameweeks, G10 pending');
select extensions.is(
  jsonb_build_object('absence', pg_temp.player(current_setting('test.b')::jsonb, 'MID1') -> 'absence',
    'feed', current_setting('test.b')::jsonb -> 'absenceFeed', 'next', pg_temp.player(current_setting('test.b')::jsonb, 'MID1') -> 'nextFixture'),
  '{"absence": null, "feed": {"listed": 0}, "next": null}'::jsonb,
  'no absence row: no absence for anyone and the feed says zero listed (no list available, not nobody absent); no difficulty estimate, no next opponent');
select extensions.is(
  (select league ->> 'name' || ' ' || (league ->> 'rank') || '/' || (league ->> 'size') || ' ahead ' || (league -> 'ahead')::text
   from (select current_setting('test.b')::jsonb -> 'league' as league) l),
  'Les Lions du Derb 2/2 ahead ["Sami Team"]',
  'the league standing is the latest ranking row of each team: Karim 2nd of 2 behind Sami Team');
select extensions.is(pg_temp.state(), current_setting('test.before'), 'the read changed no Fantasy table and no job');

-- The provider lists MID1 as injured for a G11 fixture.
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at, status, period,
  provider_updated_at, source_sequence)
values (pg_temp.u(600), pg_temp.u(2), pg_temp.u(3), pg_temp.u(11), pg_temp.u(12), '2091-10-22 18:00+00', 'scheduled', 'pre_match',
  statement_timestamp(), 1);
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, source_version)
values (pg_temp.u(5), pg_temp.u(600), pg_temp.gw(11), pg_temp.gw(11), '2091-10-22 18:00+00', '2091-10-22 18:00+00', 1);
insert into app.fixture_absences (fixture_id, team_id, player_id, player_name, category, expected_return_on, games_missed,
  provider_key, provider_updated_at)
values (pg_temp.u(600), pg_temp.u(11), pg_temp.u(2001), 'MID1', 'injury', '2091-11-30', 3, 'test-absence-1', '2091-10-19 09:00+00');
select extensions.is(
  jsonb_build_object('absence', pg_temp.player(pg_temp.brief(pg_temp.u(301)), 'MID1') -> 'absence',
    'other', pg_temp.player(pg_temp.brief(pg_temp.u(301)), 'MID2') -> 'absence',
    'feed', pg_temp.brief(pg_temp.u(301)) -> 'absenceFeed'),
  '{"absence": {"asOf": "2091-10-19T09:00:00+00:00", "source": "provider", "category": "injury", "gamesMissed": 3, "expectedReturnOn": "2091-11-30"},
    "other": null, "feed": {"listed": 1}}'::jsonb,
  'a provider absence appears for that player only, with its source and date, and the feed counts one listed');

-- ---------------------------------------------------------------------------
-- A 5 under the rating rule is never a number
-- ---------------------------------------------------------------------------
create or replace function app_private.fantasy_rating_scoring_enabled(p_gameweek_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select true $$;
select extensions.is(
  (select jsonb_agg(jsonb_build_object('s', f ->> 'gameweekSequence', 'state', f ->> 'state', 'pts', f -> 'points') order by (f ->> 'gameweekSequence')::int)
   from jsonb_array_elements(pg_temp.player(pg_temp.brief(pg_temp.u(301)), 'MID1') -> 'form') f),
  '[{"s": "8", "state": "published", "pts": 7}, {"s": "9", "state": "no_rating", "pts": null}, {"s": "10", "state": "pending", "pts": null}]'::jsonb,
  'rating rule on: MID1''s 5 after an appearance is no_rating with no number; 7 stays a number; pending stays pending');

-- ---------------------------------------------------------------------------
-- Alternatives for MID1 (sale 7.0 + bank 0.8 = 7.8): MID4 7.8 (club K1: 3 already, over the limit once MID1 leaves? no:
-- K1 holds MID1, MID2, MID3; without MID1 two remain, so MID4 makes three: allowed), MID5 7.4 and MID6 7.0 (K3), not MID7 (8.9).
-- ---------------------------------------------------------------------------
select set_config('test.a', pg_temp.alts(pg_temp.u(301), pg_temp.fp(1))::text, true);
select extensions.is(
  (select jsonb_agg(x ->> 'name' order by ord) from jsonb_array_elements(current_setting('test.a')::jsonb -> 'items') with ordinality i(x, ord)),
  '["MID4", "MID5", "MID6"]'::jsonb,
  'alternatives: same position, price at most 7.8, not owned, by price descending; MID7 (8.9) and the forward and goalkeeper are out');
select extensions.is(
  jsonb_build_object('budget', current_setting('test.a')::jsonb -> 'budget', 'max', current_setting('test.a')::jsonb -> 'maxPerClub',
    'after', (select jsonb_agg(x -> 'clubInSquadAfter' order by ord) from jsonb_array_elements(current_setting('test.a')::jsonb -> 'items') with ordinality i(x, ord))),
  '{"budget": {"salePrice": 7.00, "bank": 0.80, "max": 7.80}, "max": 3, "after": [3, 1, 1]}'::jsonb,
  'the budget is sale price plus bank, and the club count after the swap is shown');
select extensions.is(
  jsonb_build_object('limit1', jsonb_array_length(pg_temp.alts(pg_temp.u(301), pg_temp.fp(1), 1) -> 'items'),
    'bad', pg_temp.alts(pg_temp.u(301), pg_temp.fp(1), 0) ->> '__error',
    'notMine', pg_temp.alts(pg_temp.u(301), pg_temp.fp(6)) ->> '__error'),
  '{"limit1": 1, "bad": "PT400 validation_failed", "notMine": "PT404 fantasy_player_not_found"}'::jsonb,
  'the limit is honoured, a bad limit is PT400, and a player not in the squad is PT404');
select extensions.is(pg_temp.state(), current_setting('test.before'), 'the reads still changed nothing');

select * from extensions.finish();
rollback;
