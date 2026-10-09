-- Manager Card (BG-0158): the Gradins read API and the moment acknowledgements.
-- Migrations 20261009100000 .. 20261009100300.
--
-- What this file proves that manager_card.test.sql does not: the five api
-- functions' shape and grants, "off is an answer", the sign-in order (argument
-- check, off answer, step-up, caller), the exact key set of every object the
-- front end's zod schemas (src/backend/manager-card/contracts.ts) parse, the
-- values of every card state (rated-but-provisional, forming with and without a
-- card row, a new season, insufficient, no team, deleted-pending), the batch
-- read, the history paging, every moment kind, and the acknowledgement.
--
-- THE FIXTURE is hand-seeded (no tick runs). It is shared, as plain SQL, with
-- scripts/backend/manager-card-contract-seed.sql: keep the two in step.
--   Football seasons 2088/2089 (completed) and 2089/2090 (active, label 2089/90);
--   Fantasy seasons FS0 completed and FS1 active. FS1 gameweeks 1-3 finalized,
--   4 cancelled, 5-6 scheduled (deadline 2089-09-01 10:00 UTC + 7 days per
--   gameweek, so only GW1 falls before cap_ignore 2089-09-05); FS0 gameweek 1
--   finalized. Clubs K1 (fr and ar names, colours) and K2 (slug club-ref, no
--   translation, reached through favorite_team_provisional_ref).
--   M  rated but provisional: card with serial and founder cohort 2026; FS1
--      season row counted 3, through GW3, OVR 82 champion, stats 90/80/null/76;
--      FS1 history GW1, GW2 (figures null) and GW3; an FS0 season and history
--      row (counted 30, OVR 55 stade, not provisional); club K1.
--   N  forming: team in FS1, lineup for GW2, no card row, no season row; club K2.
--   P  new season: FS0 season row OVR 71 pro, FS1 team and a season row counted 1.
--   Q  insufficient: counted 3, OVR null, CAP null (GW1 deadline is before
--      cap_ignore), TRF null with a Free Hit batch only, SEL 70 and CON 60.
--   R  deleted-pending, with a card, season and history rows.
--   S  rated (not provisional): a provisional_cleared moment.
--   V  verified MFA factor, team in FS1.   W  signed in, no team.
begin;
select extensions.plan(59);

-- A statement's outcome: 'ok', or its SQLSTATE and message. Whatever it did is undone.
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

-- Runs one expression as a signed-in user (aal as given), as a visitor (p_user null, role
-- authenticated) or as anon, and returns its jsonb, or {"__error": "SQLSTATE message"}.
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

-- p_expr's answer (as run() gives it, as text) with p_setup applied first; the setup is undone.
create function pg_temp.under(p_setup text, p_expr text, p_user uuid default null,
  p_role text default 'authenticated') returns text language plpgsql as $$
begin
  begin
    execute p_setup;
    raise exception using errcode = 'X0001', message = pg_temp.run(p_user, 'aal1', p_expr, p_role)::text;
  exception
    when sqlstate 'X0001' then return sqlerrm;
    when others then return 'setup failed: ' || sqlstate || ' ' || sqlerrm;
  end;
end;
$$;

-- The keys of an object as one sorted string, and the same for a list of expected names.
create function pg_temp.keys(j jsonb) returns text language sql as $$
  select coalesce(string_agg(k, ',' order by k collate "C"), '<none>') from jsonb_object_keys(j) k
$$;
create function pg_temp.want(variadic p text[]) returns text language sql as $$
  select string_agg(k, ',' order by k collate "C") from unnest(p) k
$$;

create function pg_temp.facts(p_sig text) returns text language sql as $$
  select concat_ws(',', p.prosecdef, p.proconfig = array['search_path=""'],
    has_function_privilege('anon', p.oid, 'execute'),
    has_function_privilege('authenticated', p.oid, 'execute'),
    has_function_privilege('service_role', p.oid, 'execute'),
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0))
  from pg_proc p where p.oid = to_regprocedure(p_sig)
$$;

-- M's card (or any user's own), a member card as another user reads it, the pending moments.
create function pg_temp.card_of(p_user uuid) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', 'api.get_my_manager_card()') -> 'card'
$$;
create function pg_temp.member_of(p_reader uuid, p_team uuid) returns jsonb language sql as $$
  select pg_temp.run(p_reader, 'aal1', format('api.get_manager_cards(array[%L]::uuid[])', p_team)) -> 'cards' -> 0
$$;
create function pg_temp.moment_keys(p_user uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(m ->> 'key'), '[]') from jsonb_array_elements(pg_temp.card_of(p_user) -> 'moments') m
$$;
create function pg_temp.moment_of(p_user uuid, p_kind text) returns jsonb language sql as $$
  select m from jsonb_array_elements(pg_temp.card_of(p_user) -> 'moments') m where m ->> 'kind' = p_kind
$$;
create function pg_temp.history(p_user uuid, p_args text) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', format('api.get_my_manager_card_history(%s)', p_args))
$$;
create function pg_temp.hist_seq(p_user uuid, p_args text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(i -> 'gameweekSeq' order by o), '[]')
  from jsonb_array_elements(pg_temp.history(p_user, p_args) -> 'items') with ordinality as x(i, o)
$$;
create function pg_temp.acks(p_user uuid) returns bigint language sql as $$
  select count(*) from app.manager_card_moment_acks where user_id = p_user
$$;
create function pg_temp.ack(p_user uuid, p_keys text, p_aal text default 'aal1') returns jsonb language sql as $$
  select pg_temp.run(p_user, p_aal, format('api.ack_manager_card_moments(%s)', p_keys))
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('bc1e0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.idx(t text) returns integer language sql immutable as $$
  select array_position(array['M','N','P','Q','R','S','V','W'], t)
$$;
create function pg_temp.usr(t text) returns uuid language sql immutable as $$
  select pg_temp.id(300 + pg_temp.idx(t))
$$;
create function pg_temp.tm(t text) returns uuid language sql immutable as $$
  select pg_temp.id(400 + pg_temp.idx(t))
$$;
create function pg_temp.tm0(t text) returns uuid language sql immutable as $$
  select pg_temp.id(450 + pg_temp.idx(t))
$$;
create function pg_temp.gw(n integer) returns uuid language sql immutable as $$
  select pg_temp.id(20 + n)
$$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2), 'manager-card-api-test', 'Manager Card API Test', 'MCA', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
-- Football seasons 2088/2089 (completed) and 2089/2090 (active: the card shows 2089/90).
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3), pg_temp.id(2), '2089/2090', '2089-08-01', '2090-06-30', 'active', true),
  (pg_temp.id(8), pg_temp.id(2), '2088/2089', '2088-08-01', '2089-06-30', 'completed', false);
insert into app.rounds (id, season_id, round_number, name, status)
select pg_temp.id(30 + n), pg_temp.id(3), n, 'Round ' || n, 'completed' from generate_series(1, 6) n;
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id(11), pg_temp.id(8), 1, 'Round 1', 'completed');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(4), pg_temp.id(2), 'manager-card-api-test', 'Manager Card API Test', true);
-- Fantasy seasons FS0 (completed) = id(9) and FS1 (active) = id(5).
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values (pg_temp.id(5), pg_temp.id(4), pg_temp.id(3), 'f6100000-0000-4000-8000-000000000100',
    '2089/90', 'active', '2089-08-01', '2090-06-30'),
  (pg_temp.id(9), pg_temp.id(4), pg_temp.id(8), 'f6100000-0000-4000-8000-000000000100',
    '2088/89', 'completed', '2088-08-01', '2089-06-30');
-- FS1 gameweeks 1-3 finalized, 4 cancelled, 5-6 scheduled; deadline 2089-09-01 10:00 UTC
-- + 7 days per gameweek, so only GW1 falls before cap_ignore (2089-09-05). FS0 has one
-- finalized gameweek.
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
select pg_temp.gw(n), pg_temp.id(5), pg_temp.id(30 + n), n, 'Gameweek ' || n,
  d, d + interval '2 hours', d + interval '2 days 2 hours',
  case when n in (1, 2, 3) then 'finalized' when n = 4 then 'cancelled' else 'scheduled' end::app.fantasy_gameweek_status,
  case when n in (1, 2, 3) then d + interval '3 days 2 hours' end,
  case when n in (1, 2, 3) then 'final' else 'provisional' end::app.fantasy_points_state,
  1
from generate_series(1, 6) n
cross join lateral (select timestamptz '2089-09-01 10:00:00+00' + (n - 1) * interval '7 days' as d) dl;
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state, scoring_input_version)
values (pg_temp.id(10), pg_temp.id(9), pg_temp.id(11), 1, 'Old gameweek 1',
  '2088-09-01 10:00+00', '2088-09-01 12:00+00', '2088-09-03 12:00+00', 'finalized',
  '2088-09-04 12:00+00', 'final', 1);

-- Two clubs: K1 with French and Arabic names and colours; K2 (slug club-ref) with no
-- translation, reached through favorite_team_provisional_ref.
insert into app.teams (id, slug, name, short_name, code, country_id, primary_color, secondary_color)
values (pg_temp.id(6), 'club-one', 'Club One', 'ONE',  'CLO',
    (select id from app.countries where iso_alpha2 = 'MA'), '#112233', '#445566'),
  (pg_temp.id(7), 'club-ref', 'Club Ref', 'REF', 'CRF',
    (select id from app.countries where iso_alpha2 = 'MA'), null, null);
insert into app.team_translations (team_id, language, name, short_name) values
  (pg_temp.id(6), 'fr', 'Club Un', 'UN'),
  (pg_temp.id(6), 'ar', 'النادي الأول', 'الأول');

-- Accounts, created the way Supabase Auth creates them.
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.usr(u.t), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, statement_timestamp(), 'hash', '{}',
  u.meta::jsonb, statement_timestamp(), statement_timestamp()
from (values
  ('M', 'mca-m@example.test', '{"username":"mehdi_mca","display_name":"Mehdi Rated"}'),
  ('N', 'mca-n@example.test', '{"username":"nadia_mca","display_name":"Nadia Forming"}'),
  ('P', 'mca-p@example.test', '{"username":"pierre_mca","display_name":"Pierre NewSeason"}'),
  ('Q', 'mca-q@example.test', '{"username":"qamar_mca","display_name":"Qamar Insufficient"}'),
  ('R', 'mca-r@example.test', '{"username":"rida_mca","display_name":"Rida Deleted"}'),
  ('S', 'mca-s@example.test', '{"username":"salma_mca","display_name":"Salma Rated"}'),
  ('V', 'mca-v@example.test', '{"username":"vlad_mca","display_name":"Vlad Factor"}'),
  ('W', 'mca-w@example.test', '{"username":"wafa_mca","display_name":"Wafa NoTeam"}')
) as u(t, email, meta);
update app.profiles set deleted_at = statement_timestamp() where id = pg_temp.usr('R');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.id(900), pg_temp.usr('V'), 'V TOTP', 'totp', 'verified',
  statement_timestamp(), statement_timestamp());
insert into app.user_preferences (user_id, favorite_team_id, favorite_team_provisional_ref) values
  (pg_temp.usr('M'), pg_temp.id(6), null), (pg_temp.usr('N'), null, 'club-ref')
on conflict (user_id) do update set favorite_team_id = excluded.favorite_team_id,
  favorite_team_provisional_ref = excluded.favorite_team_provisional_ref;

-- Fantasy teams: M N P Q R S V in FS1; M and P also in FS0. W has none.
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
select pg_temp.tm(t), pg_temp.usr(t), pg_temp.id(5), 'Team ' || t, 0, 100, 1, 'active',
  timestamptz '2089-08-01 00:00:00+00'
from unnest(array['M', 'N', 'P', 'Q', 'R', 'S', 'V']) t;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value,
  free_transfers, status, created_at)
select pg_temp.tm0(t), pg_temp.usr(t), pg_temp.id(9), 'Team ' || t || ' old', 0, 100, 1, 'active',
  timestamptz '2088-08-01 00:00:00+00'
from unnest(array['M', 'P']) t;
-- N has a lineup for GW2 (its first rating gameweek is then GW2).
insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
values (pg_temp.id(5002), pg_temp.tm('N'), pg_temp.gw(2), 1, timestamptz '2089-08-01 00:00:00+00');
-- Q: one Free Hit batch and nothing else (TRF is then "excluded weeks only").
insert into app.fantasy_transfer_batches (id, fantasy_team_id, gameweek_id, idempotency_key,
  base_team_version, resulting_team_version, transfers_count, free_transfers_before,
  free_transfers_used, point_hit, bank_before, bank_after, chip_type, status)
values (pg_temp.id(601), pg_temp.tm('Q'), pg_temp.gw(2), pg_temp.id(651), 1, 2, 1, 1, 1, 0, 0, 0,
  'free_hit', 'confirmed');

-- Rules v1, left INACTIVE: the seasons below need the version to exist, and "no active
-- rules row" is what the Manager Card calls no rules.
insert into app_private.manager_card_rules (version, config, active) values
  (1, '{"minimum_gameweeks": 3, "provisional_below": 5, "trf_window_gameweeks": 3, "batch_size": 2000,
        "scales": {"cap": [[0,0],[1,100]], "sel": [[0,0],[1,100]], "trf": [[-10,0],[10,100]], "con": [[0,0],[1,100]]},
        "tiers": {"stade": 50, "pro": 65, "champion": 80, "legend": 90},
        "cap_ignore_deadlines_before": "2089-09-05T00:00:00Z"}', false);

-- Cards. N has none (a forming card with no row); W has no team.
insert into app.manager_cards (user_id, serial, founder_cohort, founder_granted_at, created_at) values
  (pg_temp.usr('M'), '482913', 2026, '2089-08-02 12:00+00', '2089-08-02 00:00+00'),
  (pg_temp.usr('P'), '561078', null, null, '2089-08-03 00:00+00'),
  (pg_temp.usr('Q'), '317264', null, null, '2089-08-04 00:00+00'),
  (pg_temp.usr('R'), '725490', null, null, '2089-08-05 00:00+00'),
  (pg_temp.usr('S'), '934156', null, null, '2089-08-06 00:00+00');

-- Season rows: user, season, team, ovr, tier, cap, sel, trf, con, counted, provisional,
-- through gameweek, calculated at.
insert into app.manager_card_seasons (user_id, fantasy_season_id, fantasy_team_id, ovr, tier, cap,
  sel, trf, con, gameweeks_counted, provisional, rules_version, through_gameweek_id, calculated_at)
values
  -- M: rated, provisional, champion; TRF null, no batch. (90 + 80 + 76) / 3 = 82.
  (pg_temp.usr('M'), pg_temp.id(5), pg_temp.tm('M'), 82, 'champion', 90, 80, null, 76, 3, true, 1,
    pg_temp.gw(3), '2089-09-16 12:00+00'),
  (pg_temp.usr('M'), pg_temp.id(9), pg_temp.tm0('M'), 55, 'stade', 55, 55, 55, 55, 30, false, 1,
    pg_temp.id(10), '2089-06-20 12:00+00'),
  -- P: a new season. FS0 closed at 71 pro, FS1 just one week counted.
  (pg_temp.usr('P'), pg_temp.id(9), pg_temp.tm0('P'), 71, 'pro', 71, 71, 71, 71, 20, false, 1,
    pg_temp.id(10), '2089-06-20 12:00+00'),
  (pg_temp.usr('P'), pg_temp.id(5), pg_temp.tm('P'), null, null, null, null, null, null, 1, true, 1,
    pg_temp.gw(1), '2089-09-02 12:00+00'),
  -- Q: enough weeks, too few stats (CAP null before the captain fix, TRF only a Free Hit).
  (pg_temp.usr('Q'), pg_temp.id(5), pg_temp.tm('Q'), null, null, null, 70, null, 60, 3, true, 1,
    pg_temp.gw(3), '2089-09-16 12:00+00'),
  -- R: deleted-pending, with a card.
  (pg_temp.usr('R'), pg_temp.id(5), pg_temp.tm('R'), 82, 'champion', 82, 82, 82, 82, 3, true, 1,
    pg_temp.gw(3), '2089-09-16 12:00+00'),
  -- S: rated (hand-seeded: not provisional).
  (pg_temp.usr('S'), pg_temp.id(5), pg_temp.tm('S'), 70, 'pro', 70, 72, 65, 73, 3, false, 1,
    pg_temp.gw(3), '2089-09-16 12:00+00');

-- History rows: user, season, gameweek, ovr, tier, cap, sel, trf, con, counted, provisional,
-- calculated at. A row under the minimum (3) carries no figures.
insert into app.manager_card_gameweeks (user_id, fantasy_season_id, gameweek_id, ovr, tier, cap, sel,
  trf, con, gameweeks_counted, provisional, rules_version, calculated_at)
select pg_temp.usr(v.u), v.s, v.g, v.ovr, v.tier, v.cap, v.sel, v.trf, v.con, v.counted, v.prov, 1,
  v.at
from (values
  ('M', pg_temp.id(5), pg_temp.gw(1), null::smallint, null::text, null::smallint, null::smallint, null::smallint, null::smallint, 1, true, timestamptz '2089-09-02 12:00+00'),
  ('M', pg_temp.id(5), pg_temp.gw(2), null, null, null, null, null, null, 2, true, '2089-09-09 12:00+00'),
  ('M', pg_temp.id(5), pg_temp.gw(3), 82, 'champion', 90, 80, null, 76, 3, true, '2089-09-16 12:00+00'),
  ('M', pg_temp.id(9), pg_temp.id(10), 55, 'stade', 55, 55, 55, 55, 30, false, '2089-06-20 12:00+00'),
  ('P', pg_temp.id(5), pg_temp.gw(1), null, null, null, null, null, null, 1, true, '2089-09-02 12:00+00'),
  ('Q', pg_temp.id(5), pg_temp.gw(1), null, null, null, null, null, null, 1, true, '2089-09-02 12:00+00'),
  ('Q', pg_temp.id(5), pg_temp.gw(2), null, null, null, null, null, null, 2, true, '2089-09-09 12:00+00'),
  ('Q', pg_temp.id(5), pg_temp.gw(3), null, null, null, 70, null, 60, 3, true, '2089-09-16 12:00+00'),
  ('R', pg_temp.id(5), pg_temp.gw(1), null, null, null, null, null, null, 1, true, '2089-09-02 12:00+00'),
  ('S', pg_temp.id(5), pg_temp.gw(1), null, null, null, null, null, null, 1, true, '2089-09-02 12:00+00'),
  ('S', pg_temp.id(5), pg_temp.gw(2), null, null, null, null, null, null, 2, true, '2089-09-09 12:00+00'),
  ('S', pg_temp.id(5), pg_temp.gw(3), 70, 'pro', 70, 72, 65, 73, 3, false, '2089-09-16 12:00+00')
) as v(u, s, g, ovr, tier, cap, sel, trf, con, counted, prov, at);
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Shape and grants
-- ---------------------------------------------------------------------------
-- Columns: security definer, search_path "", anon, authenticated, service_role, PUBLIC.
select extensions.is(
  (select string_agg(pg_temp.facts(f.sig), '|' order by f.n) from (values
    (1, 'api.manager_card_status()'), (2, 'api.get_my_manager_card()'),
    (3, 'api.get_manager_cards(uuid[])'), (4, 'api.get_my_manager_card_history(uuid,integer,integer)'),
    (5, 'api.ack_manager_card_moments(text[])')) f(n, sig)),
  't,t,t,t,t,f|t,t,f,t,t,f|t,t,f,t,t,f|t,t,f,t,t,f|t,t,f,t,t,f',
  'the five api functions are security definer with search_path "": status for anon, authenticated and service_role, the other four for authenticated and service_role and not anon, PUBLIC holds nothing');
select extensions.is(
  (select concat_ws(',', to_regprocedure('api.get_manager_card(uuid)') is null,
    to_regprocedure('api.get_my_manager_card_history(integer,integer)') is null,
    to_regprocedure('app_private.manager_card_json(uuid,uuid)') is null,
    to_regprocedure('app_private.manager_card_current_season(uuid)') is null)),
  't,t,t,t', 'the #381 single-card read, the two-argument history and the two old builders are gone');
select extensions.is(
  (select concat_ws(',', c.relrowsecurity, c.relforcerowsecurity,
      (select count(*) from pg_policies p where p.schemaname = 'app' and p.tablename = 'manager_card_moment_acks'),
      has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger'),
      has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate,references,trigger'),
      has_table_privilege('service_role', c.oid, 'select,insert,update,delete,truncate,references,trigger'),
      exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f'
        and k.confrelid = 'app.profiles'::regclass and k.confdeltype = 'c'),
      exists (select 1 from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal
        and t.tgname = 'manager_card_moment_acks_refuse_unverified_mfa_actor' and (t.tgtype & 1) = 0))
   from pg_class c where c.oid = 'app.manager_card_moment_acks'::regclass),
  't,t,0,f,f,f,t,t',
  'the acknowledgements table: row security enabled and forced, no policy, no right for any API role, a cascading foreign key to the profile and the statement trigger');

-- ---------------------------------------------------------------------------
-- Off is an answer (the switch is off and there are no rules)
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg(pg_temp.run(null, null, 'api.manager_card_status()', r.role)::text, '|' order by r.role)
   from unnest(array['anon', 'authenticated', 'service_role']) r(role)),
  (select string_agg('{"enabled": false, "minRated": null, "minConfirmed": null}', '|' order by r.role)
   from unnest(array['anon', 'authenticated', 'service_role']) r(role)),
  'reads off: the status answers disabled with null minimums to anon, authenticated and service_role');
create temp table read_calls (n integer, expr text);
insert into read_calls values
  (1, 'api.get_my_manager_card()'),
  (2, format('api.get_manager_cards(array[%L]::uuid[])', pg_temp.tm('M'))),
  (3, 'api.get_my_manager_card_history(null, null, 20)');
select extensions.is(
  (select string_agg(pg_temp.run(pg_temp.usr('M'), 'aal1', expr)::text, '|' order by n) from read_calls)
  || '#' || (select string_agg(pg_temp.run(pg_temp.usr('V'), 'aal1', expr)::text, '|' order by n) from read_calls),
  (select string_agg('{"available": false}', '|') from generate_series(1, 3))
  || '#' || (select string_agg('{"available": false}', '|') from generate_series(1, 3)),
  'reads off: the three reads answer {"available": false} for M and, because the switch comes before the step-up, for V at aal1');
select extensions.is(
  pg_temp.ack(pg_temp.usr('M'), 'array[''card_created'']')::text || '#' || pg_temp.acks(pg_temp.usr('M')),
  '{"ignored": ["card_created"], "acknowledged": []}#0',
  'reads off: an acknowledgement ignores everything and writes no row');

select app_private.manager_card_configure(null, true);
select extensions.is(
  (select string_agg(pg_temp.run(null, null, 'api.manager_card_status()', r.role)::text, '|' order by r.role)
   from unnest(array['anon', 'authenticated', 'service_role']) r(role))
  || '#' || (select string_agg(pg_temp.run(pg_temp.usr('M'), 'aal1', expr)::text, '|' order by n) from read_calls),
  (select string_agg('{"enabled": false, "minRated": null, "minConfirmed": null}', '|') from generate_series(1, 3))
  || '#' || (select string_agg('{"available": false}', '|') from generate_series(1, 3)),
  'reads on but no active rules row: the status is disabled and the reads answer {"available": false}');
select extensions.is(
  pg_temp.under('insert into app_private.manager_card_rules (version, config, active) values (2, ''{"minimum_gameweeks": 0, "provisional_below": 5, "tiers": {"stade": 50, "pro": 65, "champion": 80, "legend": 90}}'', true)',
    'api.manager_card_status()', null, 'anon')
  || '#' || pg_temp.under('insert into app_private.manager_card_rules (version, config, active) values (2, ''{"minimum_gameweeks": 0, "provisional_below": 5, "tiers": {"stade": 50, "pro": 65, "champion": 80, "legend": 90}}'', true)',
    'api.get_my_manager_card()', pg_temp.usr('M')),
  '{"enabled": false, "minRated": null, "minConfirmed": null}#{"available": false}',
  'reads on but a rules row whose minimum_gameweeks is 0 (not usable): the status is disabled and the read is off');

update app_private.manager_card_rules set active = true where version = 1;
select extensions.is(
  (select string_agg(pg_temp.run(null, null, 'api.manager_card_status()', r.role)::text, '|' order by r.role)
   from unnest(array['anon', 'authenticated', 'service_role']) r(role)),
  (select string_agg('{"enabled": true, "minRated": 3, "minConfirmed": 5}', '|' order by r.role)
   from unnest(array['anon', 'authenticated', 'service_role']) r(role)),
  'reads on with usable rules: the status answers enabled with the rules'' minimums, to anon too');

-- ---------------------------------------------------------------------------
-- Signed-in rules (reads on)
-- ---------------------------------------------------------------------------
create temp table all_calls (n integer, expr text);
insert into all_calls select n, expr from read_calls;
insert into all_calls values (4, 'api.ack_manager_card_moments(array[''tier_changed:legend''])');
select extensions.is(
  (select string_agg(left(pg_temp.run(null, null, expr, 'anon') ->> '__error', 5), ',' order by n) from all_calls),
  '42501,42501,42501,42501', 'anon is refused (42501) by all four signed-in functions');
select extensions.is(
  (select string_agg(pg_temp.run(null, null, expr) ->> '__error', ',' order by n) from all_calls)
  || '#' || (select string_agg(pg_temp.run(null, null, expr, 'service_role') ->> '__error', ',' order by n) from all_calls),
  (select string_agg('PT401 authentication_required', ',') from generate_series(1, 4))
  || '#' || (select string_agg('PT401 authentication_required', ',') from generate_series(1, 4)),
  'reads on: a visitor with no user and the service role get PT401 authentication_required');
select extensions.is(
  (select string_agg(pg_temp.run(pg_temp.usr('V'), 'aal1', expr) ->> '__error', ',' order by n) from all_calls)
  || '#' || (select string_agg(coalesce(pg_temp.run(pg_temp.usr('V'), 'aal2', expr) ->> '__error', 'ok'), ',' order by n) from all_calls),
  (select string_agg('PT403 mfa_required', ',') from generate_series(1, 4)) || '#ok,ok,ok,ok',
  'V (verified factor) at aal1 gets PT403 mfa_required from all four; at aal2 all four answer');

-- ---------------------------------------------------------------------------
-- Key sets, equal to the zod schemas
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.keys(pg_temp.card_of(pg_temp.usr('M'))),
  pg_temp.want('teamId', 'name', 'handle', 'season', 'serial', 'founder', 'club', 'ratingState', 'ovr',
    'ovrNullReason', 'tier', 'bestTier', 'nextTier', 'provisional', 'stats', 'gameweeksCounted',
    'minRated', 'minConfirmed', 'rulesVersion', 'throughGameweekSeq', 'calculatedAt',
    'firstCountedGameweekSeq', 'firstRatedGameweekSeq', 'ratingGameweeks', 'ratingGameweeksComplete',
    'previousSeason', 'seasonClosed', 'seasons', 'createdAt', 'moments'),
  'M''s card has exactly the 30 keys of myCardSchema');
select extensions.is(
  (select concat_ws('|',
    (select string_agg(pg_temp.keys(c -> 'stats' -> s), ',' order by s) from unnest(array['cap', 'con', 'sel', 'trf']) s),
    pg_temp.keys(c -> 'season'), pg_temp.keys(c -> 'founder'), pg_temp.keys(c -> 'nextTier'),
    pg_temp.keys(c -> 'previousSeason'))
   from (select pg_temp.card_of(pg_temp.usr('M')) as c) x),
  concat_ws('|', repeat(pg_temp.want('nullReason', 'value') || ',', 3) || pg_temp.want('nullReason', 'value'),
    pg_temp.want('id', 'label'), pg_temp.want('cohort', 'cutoffDate', 'grantedAt'),
    pg_temp.want('code', 'fromOvr'), pg_temp.want('label', 'ovr', 'tier')),
  'each stat is exactly {nullReason, value}, season {id, label}, founder {cohort, cutoffDate, grantedAt}, nextTier {code, fromOvr}, previousSeason {label, ovr, tier}');
select extensions.is(
  (select concat_ws('|', pg_temp.keys(c -> 'club'), pg_temp.keys(c -> 'club' -> 'name'),
    pg_temp.keys(c -> 'club' -> 'shortName'))
   from (select pg_temp.card_of(pg_temp.usr('M')) as c) x),
  pg_temp.want('id', 'slug', 'code', 'name', 'shortName', 'city', 'primaryColor', 'secondaryColor')
    || '|' || pg_temp.want('ar', 'fr') || '|' || pg_temp.want('ar', 'fr'),
  'the club has exactly the 8 keys of cardClubSchema and name and shortName are exactly {ar, fr}');
select extensions.is(
  (select string_agg(distinct pg_temp.keys(s), '|') from jsonb_array_elements(pg_temp.card_of(pg_temp.usr('M')) -> 'seasons') s),
  pg_temp.want('seasonId', 'label', 'ovr', 'tier', 'bestTier', 'gameweeksCounted', 'closedAt'),
  'each seasons[] element has exactly the 7 keys of seasonSummarySchema');
select extensions.is(
  pg_temp.keys(pg_temp.member_of(pg_temp.usr('W'), pg_temp.tm('M')))
  || '|' || pg_temp.keys(pg_temp.member_of(pg_temp.usr('W'), pg_temp.tm('M')) -> 'stats'),
  pg_temp.want('teamId', 'name', 'club', 'serial', 'founderCohort', 'seasonLabel', 'ratingState', 'ovr',
    'tier', 'provisional', 'stats', 'gameweeksCounted', 'minRated', 'firstRatedGameweekSeq')
    || '|' || pg_temp.want('cap', 'con', 'sel', 'trf'),
  'a member card has exactly the 14 keys of memberCardSchema and its stats exactly {cap, con, sel, trf}');
select extensions.is(
  pg_temp.keys(pg_temp.history(pg_temp.usr('M'), 'null, null, 20') -> 'items' -> 0)
  || '|' || pg_temp.keys(pg_temp.history(pg_temp.usr('M'), 'null, null, 20')),
  pg_temp.want('seasonId', 'seasonLabel', 'gameweekSeq', 'ovr', 'tier', 'provisional', 'gameweeksCounted',
    'stats', 'calculatedAt') || '|' || pg_temp.want('available', 'items', 'nextBeforeSeq'),
  'a history item has exactly the 9 keys of historyRowSchema and the page exactly {available, items, nextBeforeSeq}');
select extensions.is(
  (select concat_ws('|',
    pg_temp.keys(pg_temp.moment_of(pg_temp.usr('M'), 'card_created')),
    pg_temp.keys(pg_temp.moment_of(pg_temp.usr('M'), 'first_rating')),
    pg_temp.keys(pg_temp.moment_of(pg_temp.usr('S'), 'provisional_cleared')),
    pg_temp.keys(pg_temp.moment_of(pg_temp.usr('M'), 'tier_changed')),
    pg_temp.keys(pg_temp.moment_of(pg_temp.usr('M'), 'founder_granted')),
    pg_temp.keys(pg_temp.moment_of(pg_temp.usr('M'), 'season_closed')),
    pg_temp.keys(pg_temp.moment_of(pg_temp.usr('P'), 'season_started')),
    pg_temp.keys(pg_temp.moment_of(pg_temp.usr('P'), 'season_started') -> 'previous'))),
  concat_ws('|',
    pg_temp.want('kind', 'key', 'occurredAt', 'seasonLabel'),
    pg_temp.want('kind', 'key', 'occurredAt', 'gameweekSeq', 'ovr', 'tier', 'provisional', 'gameweeksCounted', 'firstEver'),
    pg_temp.want('kind', 'key', 'occurredAt', 'gameweekSeq', 'ovr', 'gameweeksCounted'),
    pg_temp.want('kind', 'key', 'occurredAt', 'tier', 'previousTier', 'ovr', 'gameweekSeq', 'seasonLabel'),
    pg_temp.want('kind', 'key', 'occurredAt', 'cohort', 'cutoffDate'),
    pg_temp.want('kind', 'key', 'occurredAt', 'seasonLabel', 'ovr', 'tier'),
    pg_temp.want('kind', 'key', 'occurredAt', 'seasonLabel', 'previous'),
    pg_temp.want('label', 'ovr', 'tier')),
  'each of the seven moment kinds has exactly the keys of contracts.ts, and season_started.previous is exactly {label, ovr, tier}');
select extensions.is(
  pg_temp.keys(pg_temp.ack(pg_temp.usr('S'), 'array[''tier_changed:legend'']'))
  || '|' || pg_temp.keys(pg_temp.run(null, null, 'api.manager_card_status()', 'anon')),
  pg_temp.want('acknowledged', 'ignored') || '|' || pg_temp.want('enabled', 'minConfirmed', 'minRated'),
  'the acknowledgement answers exactly {acknowledged, ignored} and the status exactly {enabled, minConfirmed, minRated}');

-- ---------------------------------------------------------------------------
-- Values
-- ---------------------------------------------------------------------------
select extensions.is(
  (select jsonb_build_object('ratingState', c -> 'ratingState', 'ovr', c -> 'ovr', 'tier', c -> 'tier',
    'bestTier', c -> 'bestTier', 'nextTier', c -> 'nextTier', 'rulesVersion', c -> 'rulesVersion',
    'gameweeksCounted', c -> 'gameweeksCounted', 'throughGameweekSeq', c -> 'throughGameweekSeq',
    'firstCountedGameweekSeq', c -> 'firstCountedGameweekSeq', 'firstRatedGameweekSeq', c -> 'firstRatedGameweekSeq',
    'previousSeason', c -> 'previousSeason', 'ratingGameweeks', c -> 'ratingGameweeks',
    'ratingGameweeksComplete', c -> 'ratingGameweeksComplete', 'serial6', (c ->> 'serial') ~ '^[1-9][0-9]{5}$',
    'founderCohort', c #> '{founder,cohort}', 'founderCutoff', c #> '{founder,cutoffDate}',
    'seasonLabel', c #> '{season,label}', 'trf', c #> '{stats,trf}', 'name', c -> 'name', 'handle', c -> 'handle',
    'provisional', c -> 'provisional', 'seasonClosed', c -> 'seasonClosed')
   from (select pg_temp.card_of(pg_temp.usr('M')) as c) x),
  jsonb_build_object('ratingState', 'provisional', 'ovr', 82, 'tier', 'champion', 'bestTier', 'champion',
    'nextTier', jsonb_build_object('code', 'legend', 'fromOvr', 90), 'rulesVersion', 'v1',
    'gameweeksCounted', 3, 'throughGameweekSeq', 3, 'firstCountedGameweekSeq', 1, 'firstRatedGameweekSeq', 3,
    'previousSeason', jsonb_build_object('label', '2088/89', 'ovr', 55, 'tier', 'stade'),
    'ratingGameweeks', null, 'ratingGameweeksComplete', false, 'serial6', true,
    'founderCohort', 2026, 'founderCutoff', null, 'seasonLabel', '2089/90',
    'trf', jsonb_build_object('value', null, 'nullReason', 'no_transfers'),
    'name', 'Mehdi Rated', 'handle', 'mehdi_mca', 'provisional', true, 'seasonClosed', false),
  'M: provisional, OVR 82 champion, best tier champion, next tier legend from 90, v1, 3 weeks counted through GW3, first counted GW1 and first rated GW3, previous season 2088/89 55 stade, no rating gameweeks, a six-digit serial, founder cohort 2026 with no cut-off date, label 2089/90, TRF null for no_transfers');
select extensions.is(
  (select jsonb_build_object('ratingState', c -> 'ratingState', 'serial', c -> 'serial', 'createdAt', c -> 'createdAt',
    'ovr', c -> 'ovr', 'ovrNullReason', c -> 'ovrNullReason', 'tier', c -> 'tier',
    'stats', c -> 'stats', 'gameweeksCounted', c -> 'gameweeksCounted',
    'ratingGameweeks', c -> 'ratingGameweeks', 'ratingGameweeksComplete', c -> 'ratingGameweeksComplete',
    'clubSlug', c #> '{club,slug}', 'clubName', c #> '{club,name}', 'moments', c -> 'moments',
    'seasons', jsonb_array_length(c -> 'seasons'), 'rulesVersion', c -> 'rulesVersion', 'founder', c -> 'founder')
   from (select pg_temp.card_of(pg_temp.usr('N')) as c) x),
  jsonb_build_object('ratingState', 'forming', 'serial', null, 'createdAt', null, 'ovr', null,
    'ovrNullReason', 'pending_minimum', 'tier', null,
    'stats', (select jsonb_object_agg(s, jsonb_build_object('value', null, 'nullReason', 'pending_minimum'))
      from unnest(array['cap', 'sel', 'trf', 'con']) s),
    'gameweeksCounted', 0, 'ratingGameweeks', jsonb_build_array(2, 3, 5), 'ratingGameweeksComplete', true,
    'clubSlug', 'club-ref', 'clubName', jsonb_build_object('fr', 'Club Ref', 'ar', 'Club Ref'),
    'moments', jsonb_build_array(jsonb_build_object('kind', 'card_created', 'key', 'card_created',
      'occurredAt', null, 'seasonLabel', '2089/90')),
    'seasons', 1, 'rulesVersion', null, 'founder', null),
  'N (a team and no card row): forming, no serial or creation date, pending_minimum everywhere, 0 weeks, rating gameweeks 2, 3, 5 (the cancelled GW4 skipped), the club found by its provisional reference, one card_created moment with no date');
select extensions.is(
  (select jsonb_build_object('ratingState', c -> 'ratingState',
    'previousSeason', c -> 'previousSeason', 'seasonLabels', (select jsonb_agg(s -> 'label') from jsonb_array_elements(c -> 'seasons') s),
    'fs0ClosedAtIsEndsAt', ((c -> 'seasons' -> 1 ->> 'closedAt')::timestamptz = (select ends_at from app.fantasy_seasons where id = pg_temp.id(9))),
    'fs1ClosedAt', c -> 'seasons' -> 0 -> 'closedAt')
   from (select pg_temp.card_of(pg_temp.usr('P')) as c) x)
  || jsonb_build_object('momentKeys', pg_temp.moment_keys(pg_temp.usr('P'))),
  jsonb_build_object('ratingState', 'forming',
    'previousSeason', jsonb_build_object('label', '2088/89', 'ovr', 71, 'tier', 'pro'),
    'seasonLabels', jsonb_build_array('2089/90', '2088/89'), 'fs0ClosedAtIsEndsAt', true, 'fs1ClosedAt', null,
    'momentKeys', jsonb_build_array('season_closed:' || pg_temp.id(9), 'season_started:' || pg_temp.id(5), 'card_created')),
  'P (new season): forming, previous season 2088/89 71 pro, seasons newest first with FS0 closed at its end date, and the season_closed and season_started moments pending');
select extensions.is(
  (select jsonb_build_object('ratingState', c -> 'ratingState', 'ovr', c -> 'ovr', 'ovrNullReason', c -> 'ovrNullReason',
    'cap', c #> '{stats,cap}', 'trf', c #> '{stats,trf}', 'sel', c #> '{stats,sel}', 'con', c #> '{stats,con}')
   from (select pg_temp.card_of(pg_temp.usr('Q')) as c) x),
  jsonb_build_object('ratingState', 'insufficient', 'ovr', null, 'ovrNullReason', 'too_few_stats',
    'cap', jsonb_build_object('value', null, 'nullReason', 'pre_captain_fix'),
    'trf', jsonb_build_object('value', null, 'nullReason', 'excluded_weeks_only'),
    'sel', jsonb_build_object('value', 70, 'nullReason', null),
    'con', jsonb_build_object('value', 60, 'nullReason', null)),
  'Q: insufficient, too_few_stats, CAP null for pre_captain_fix, TRF null for excluded_weeks_only (a Free Hit batch only), SEL and CON shown');
select extensions.is(
  (select jsonb_build_object('ratingState', c -> 'ratingState', 'ovr', c -> 'ovr', 'tier', c -> 'tier',
    'provisional', c -> 'provisional', 'momentKeys', pg_temp.moment_keys(pg_temp.usr('S')))
   from (select pg_temp.card_of(pg_temp.usr('S')) as c) x),
  jsonb_build_object('ratingState', 'rated', 'ovr', 70, 'tier', 'pro', 'provisional', false,
    'momentKeys', jsonb_build_array('card_created', 'first_rating:' || pg_temp.id(5), 'provisional_cleared:' || pg_temp.id(5))),
  'S: rated, not provisional, with first_rating and provisional_cleared pending');
select extensions.is(
  pg_temp.run(pg_temp.usr('W'), 'aal1', 'api.get_my_manager_card()')::text || '#'
    || pg_temp.run(pg_temp.usr('R'), 'aal1', 'api.get_my_manager_card()')::text,
  '{"card": null, "available": true}#{"card": null, "available": true}',
  'W (no team) and R (deleted-pending) get {"available": true, "card": null}');

-- Batch read
select extensions.is(
  (select coalesce(jsonb_agg(c -> 'teamId'), '[]') from jsonb_array_elements(
    pg_temp.run(pg_temp.usr('W'), 'aal1', format(
      'api.get_manager_cards(array[%L, %L, %L, null, %L, %L, %L]::uuid[])',
      pg_temp.tm('Q'), pg_temp.tm('M'), pg_temp.tm('Q'), pg_temp.tm('N'), pg_temp.id(9998), pg_temp.tm('R'))) -> 'cards') c)
  || (select jsonb_build_array(pg_temp.member_of(pg_temp.usr('W'), pg_temp.tm('N')) ->> 'ratingState')),
  jsonb_build_array(pg_temp.tm('Q'), pg_temp.tm('M'), pg_temp.tm('N'), 'forming'),
  'the batch read keeps the order of first occurrence, collapses duplicates and null elements, omits an unknown team and R''s team, and shows N (no card row) as a forming member card');
select extensions.is(
  pg_temp.run(pg_temp.usr('W'), 'aal1', 'api.get_manager_cards((select array_agg(gen_random_uuid()) from generate_series(1, 101))::uuid[])') ->> '__error'
  || '#' || (pg_temp.run(pg_temp.usr('W'), 'aal1', 'api.get_manager_cards(null::uuid[])') ->> '__error')
  || '#' || pg_temp.run(pg_temp.usr('W'), 'aal1', 'api.get_manager_cards(array[]::uuid[])')::text
  || '#' || (pg_temp.run(pg_temp.usr('W'), 'aal1', 'api.get_manager_cards((select array_agg(gen_random_uuid()) from generate_series(1, 100))::uuid[])') ->> 'available'),
  'PT400 validation_failed#PT400 validation_failed#{"cards": [], "available": true}#true',
  'the batch read refuses 101 distinct ids and a null array with PT400, answers an empty array with no cards, and takes 100');
select extensions.ok(
  position(pg_temp.usr('M')::text in pg_temp.member_of(pg_temp.usr('W'), pg_temp.tm('M'))::text) = 0
  and position('example.test' in pg_temp.member_of(pg_temp.usr('W'), pg_temp.tm('M'))::text) = 0
  and position('mehdi_mca' in pg_temp.member_of(pg_temp.usr('W'), pg_temp.tm('M'))::text) = 0
  and position('moments' in pg_temp.member_of(pg_temp.usr('W'), pg_temp.tm('M'))::text) = 0
  and position('handle' in pg_temp.member_of(pg_temp.usr('W'), pg_temp.tm('M'))::text) = 0,
  'another manager''s card carries no user id, e-mail, handle or moments');

-- History
select extensions.is(
  pg_temp.hist_seq(pg_temp.usr('M'), 'null, null, 2') || pg_temp.hist_seq(pg_temp.usr('M'), 'null, 2, 2')
  || jsonb_build_array(pg_temp.history(pg_temp.usr('M'), 'null, null, 2') -> 'nextBeforeSeq',
    pg_temp.history(pg_temp.usr('M'), 'null, 2, 2') -> 'nextBeforeSeq'),
  jsonb_build_array(3, 2, 1, 2, null),
  'history for M: (null, null, 2) gives GW3 and GW2 with nextBeforeSeq 2; (null, 2, 2) gives GW1 with nextBeforeSeq null');
select extensions.is(
  (select jsonb_agg(jsonb_build_array(i -> 'ovr', i -> 'tier', i -> 'provisional', i -> 'stats', i -> 'gameweeksCounted') order by o)
   from jsonb_array_elements(pg_temp.history(pg_temp.usr('M'), 'null, null, 20') -> 'items') with ordinality x(i, o)),
  jsonb_build_array(
    jsonb_build_array(82, 'champion', true, jsonb_build_object('cap', 90, 'sel', 80, 'trf', null, 'con', 76), 3),
    jsonb_build_array(null, null, false, jsonb_build_object('cap', null, 'sel', null, 'trf', null, 'con', null), 2),
    jsonb_build_array(null, null, false, jsonb_build_object('cap', null, 'sel', null, 'trf', null, 'con', null), 1)),
  'history rows under the minimum (GW1, GW2) carry no figures and provisional false; GW3 carries them');
select extensions.is(
  (select jsonb_build_array(h -> 'items' -> 0 ->> 'seasonLabel', h -> 'items' -> 0 -> 'ovr', jsonb_array_length(h -> 'items'), h -> 'nextBeforeSeq')
   from (select pg_temp.history(pg_temp.usr('M'), format('%L, null, 20', pg_temp.id(9))) as h) x)
  || pg_temp.history(pg_temp.usr('M'), format('%L, null, 20', pg_temp.id(7777)))
  || pg_temp.history(pg_temp.usr('R'), 'null, null, 20'),
  jsonb_build_array('2088/89', 55, 1, null)
    || '{"items": [], "available": true, "nextBeforeSeq": null}'::jsonb
    || '{"items": [], "available": true, "nextBeforeSeq": null}'::jsonb,
  'history for the earlier season shows its row labelled 2088/89; a season M never played and R (deleted-pending) get an empty page');
select extensions.is(
  (select string_agg(coalesce(pg_temp.run(pg_temp.usr('M'), 'aal1', 'api.get_my_manager_card_history(' || a || ')') ->> '__error', 'ok'), ',' order by n)
   from (values (1, 'null, null, 0'), (2, 'null, null, 51'), (3, 'null, null, null'), (4, 'null, 0, 20'), (5, 'null, null, 50')) v(n, a)),
  'PT400 validation_failed,PT400 validation_failed,PT400 validation_failed,PT400 validation_failed,ok',
  'history refuses a limit of 0, 51 or null and a before-sequence of 0 with PT400, and takes a limit of 50');

-- ---------------------------------------------------------------------------
-- Moments and acknowledgements
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.moment_keys(pg_temp.usr('M')),
  jsonb_build_array('season_closed:' || pg_temp.id(9), 'card_created', 'founder_granted',
    'first_rating:' || pg_temp.id(5), 'tier_changed:champion'),
  'M''s pending moments, in order of date (nulls first) then key: season_closed of FS0, card_created, founder_granted, first_rating and tier_changed:champion; not provisional_cleared, not first_rating of FS0, not season_started');
select extensions.is(
  (select jsonb_build_array(pg_temp.moment_of(pg_temp.usr('M'), 'first_rating') -> 'firstEver',
    pg_temp.moment_of(pg_temp.usr('M'), 'tier_changed') -> 'previousTier',
    pg_temp.moment_of(pg_temp.usr('M'), 'season_closed') -> 'tier')),
  jsonb_build_array(false, 'stade', 'stade'),
  'M''s first_rating is not first ever, tier_changed:champion comes from stade, and season_closed carries the tier it closed at');
select extensions.is(
  pg_temp.ack(pg_temp.usr('M'), format('array[%L, ''tier_changed:legend'', ''card_created'']', 'first_rating:' || pg_temp.id(5)))
  || jsonb_build_object('rows', pg_temp.acks(pg_temp.usr('M'))),
  jsonb_build_object('ignored', jsonb_build_array('tier_changed:legend'),
    'acknowledged', jsonb_build_array('first_rating:' || pg_temp.id(5), 'card_created'), 'rows', 2),
  'acknowledging a derivable pair and a well-formed key that is not derivable records two rows and ignores the other');
select extensions.is(
  pg_temp.ack(pg_temp.usr('M'), format('array[%L, ''tier_changed:legend'', ''card_created'']', 'first_rating:' || pg_temp.id(5)))
  || jsonb_build_object('rows', pg_temp.acks(pg_temp.usr('M'))),
  jsonb_build_object('ignored', jsonb_build_array('tier_changed:legend'),
    'acknowledged', jsonb_build_array('first_rating:' || pg_temp.id(5), 'card_created'), 'rows', 2),
  'the same call again answers the same and still leaves two rows');
select extensions.is(
  pg_temp.moment_keys(pg_temp.usr('M')),
  jsonb_build_array('season_closed:' || pg_temp.id(9), 'founder_granted', 'tier_changed:champion'),
  'after the acknowledgement get_my_manager_card no longer lists those two moments');
select extensions.is(
  (select string_agg(left(coalesce(pg_temp.ack(pg_temp.usr('M'), a) ->> '__error', 'ok'), 31), ',' order by n)
   from (values
     (1, 'array[''tier_changed:homa'']'), (2, 'array[''first_rating:not-a-uuid'']'),
     (3, 'array[''card_created'', null]'), (4, 'array[]::text[]'), (5, 'null::text[]'),
     (6, '(select array_agg(''first_rating:'' || gen_random_uuid()) from generate_series(1, 17))'),
     (7, 'array[repeat(''a'', 81)]')) v(n, a))
  || '#' || pg_temp.acks(pg_temp.usr('M')),
  (select string_agg('PT400 validation_failed', ',') from generate_series(1, 7)) || '#2',
  'a malformed key, a null element, a null or empty array, 17 distinct keys and an 81-character key are PT400 validation_failed and write nothing');
select extensions.is(
  pg_temp.run(pg_temp.usr('M'), 'aal1', 'api.ack_manager_card_moments(array[''founder_granted'', ''card_created'', ''founder_granted''])')::text,
  '{"ignored": [], "acknowledged": ["founder_granted", "card_created"]}',
  'duplicate keys collapse in request order and an already acknowledged key counts as acknowledged');
delete from app.manager_card_moment_acks where user_id = pg_temp.usr('M') and moment_key = 'founder_granted';
select extensions.is(
  pg_temp.ack(pg_temp.usr('R'), format('array[''card_created'', %L]', 'first_rating:' || pg_temp.id(5)))::text
  || '#' || pg_temp.acks(pg_temp.usr('R')),
  jsonb_build_object('ignored', jsonb_build_array('card_created', 'first_rating:' || pg_temp.id(5)), 'acknowledged', jsonb_build_array())::text || '#0',
  'R (deleted-pending) acknowledges nothing: everything is ignored and no row is written');
select app_private.manager_card_configure(null, false);
select extensions.is(
  pg_temp.ack(pg_temp.usr('M'), 'array[''founder_granted'']')::text || '#' || pg_temp.acks(pg_temp.usr('M')),
  '{"ignored": ["founder_granted"], "acknowledged": []}#2',
  'with reads switched off after acknowledging, the acknowledgements stay and a new call ignores everything');
select app_private.manager_card_configure(null, true);
-- The Fantasy teams restrict the profile; account deletion erases them first.
delete from app.fantasy_teams where user_id = pg_temp.usr('M');
delete from auth.users where id = pg_temp.usr('M');
select extensions.is(
  pg_temp.acks(pg_temp.usr('M')), 0::bigint,
  'deleting M''s account removes M''s acknowledgements (cascade through the profile)');

-- ---------------------------------------------------------------------------
-- Health (20261009100300): the manager_card check in ops_health_checks
-- ---------------------------------------------------------------------------
-- The check's status and detail with p_setup applied first; the setup is undone.
create function pg_temp.health(p_setup text default 'select 1') returns text language plpgsql as $$
begin
  begin
    execute p_setup;
    raise exception using errcode = 'X0001',
      message = (app_private.manager_card_health() ->> 'status') || ' ' || (app_private.manager_card_health() ->> 'detail');
  exception
    when sqlstate 'X0001' then return sqlerrm;
    when others then return 'setup failed: ' || sqlstate || ' ' || sqlerrm;
  end;
end;
$$;
-- Postwork finished p_ago ago for the four finalized gameweeks (GW1-3 of FS1, GW1 of FS0).
create function pg_temp.postwork(p_ago interval) returns text language sql as $$
  select format($f$insert into app_private.fantasy_gameweek_postwork
    (gameweek_id, calculation_version, price_source_version, price_player_ids, prices_completed_at, completed_at)
    select id, 1, 1, '{}', statement_timestamp() - %L::interval, statement_timestamp() - %L::interval
    from app.fantasy_gameweeks where status = 'finalized'$f$, p_ago, p_ago)
$$;

select extensions.is(pg_temp.health(),
  'warn reads on, compute off: cards frozen', 'health: reads on with compute off warns that cards are frozen');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(false, false)'),
  'ok switched off', 'health: both switches off is ok');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(true, true)'),
  'ok cards current under rules v1', 'health: compute on with nothing waiting is ok');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(true, true); ' || pg_temp.postwork('1 hour 59 minutes')),
  'ok cards current under rules v1', 'health: gameweeks waiting under 2 hours are still ok');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(true, true); ' || pg_temp.postwork('2 hours 1 minute')),
  'warn 4 finished gameweek(s) waiting for their cards for more than 2 hours', 'health: gameweeks waiting over 2 hours warn');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(true, true); ' || pg_temp.postwork('12 hours 1 minute')),
  'fail 4 finished gameweek(s) waiting for their cards for more than 12 hours', 'health: gameweeks waiting over 12 hours fail');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(false, true); ' || pg_temp.postwork('13 hours')),
  'warn reads on, compute off: cards frozen', 'health: waiting gameweeks do not fail while compute is off');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(true, true); ' || pg_temp.postwork('13 hours')
    || '; insert into app_private.manager_card_evaluations (gameweek_id, rules_version, scoring_input_version)'
    || ' select id, 1, 1 from app.fantasy_gameweeks where status = ''finalized'''),
  'ok cards current under rules v1', 'health: evaluated gameweeks are not waiting');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(true, false); update app_private.manager_card_rules set active = false; '
    || pg_temp.postwork('13 hours')),
  'warn compute on but no usable rules', 'health: compute on without usable rules warns');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(null, true); update app_private.manager_card_rules set active = false'),
  'warn reads on but no usable rules: the section answers off', 'health: reads on without usable rules warns');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(true, true); insert into app_private.manager_card_job_log (outcome) values (''error''), (''error'')'),
  'warn 2 tick error(s) in the last 24 hours', 'health: tick errors in the last day warn');
select extensions.is(
  pg_temp.health('select app_private.manager_card_configure(true, true); insert into app_private.manager_card_job_log (started_at, outcome) values (statement_timestamp() - interval ''25 hours'', ''error'')'),
  'ok cards current under rules v1', 'health: a tick error older than a day is not counted');
select extensions.is(
  (select c ->> 'name' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') with ordinality t(c, o)
   order by o desc limit 1),
  'manager_card', 'ops_health_checks lists manager_card last');
create function pg_temp.overall(p_setup text) returns text language plpgsql as $$
begin
  begin
    execute p_setup;
    raise exception using errcode = 'X0001', message = (app_private.ops_health_checks() ->> 'status') || '/'
      || (select c ->> 'status' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c where c ->> 'name' = 'manager_card');
  exception when sqlstate 'X0001' then return sqlerrm;
  end;
end;
$$;
select extensions.is(
  pg_temp.overall('select app_private.manager_card_configure(true, true); ' || pg_temp.postwork('13 hours')),
  'fail/fail', 'a failing manager_card check makes the overall health fail (it pages)');
select extensions.is(
  (select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute')
      || has_function_privilege('service_role', p.oid, 'execute') || has_function_privilege('anon', p.oid, 'execute'), ',' order by p.proname)
   from pg_proc p where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('manager_card_health', 'ops_health_checks', 'ops_health_checks_before_manager_card')),
  'manager_card_health:falsefalsefalse,ops_health_checks:falsefalsefalse,ops_health_checks_before_manager_card:falsefalsefalse',
  'health functions: no right for anon, authenticated or service_role');

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------
select extensions.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname !~ '^(pg_|information_schema)' and p.proname !~ 'manager_card'
      and p.proname <> 'ops_health_checks'
      and p.prosrc ~* 'manager_card_moment_acks'),
  'no function outside the card''s own (and ops_health_checks) names the acknowledgements table');

select * from extensions.finish();
rollback;
