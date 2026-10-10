-- Manager Card (BG-0158): the seed of scripts/backend/manager-card-contract-e2e.test.ts.
--
-- The hand-seeded fixture of supabase/tests/database/manager_card_api.test.sql
-- (read its header for who M, N, P, Q, R, S, V and W are), as plain SQL, then the
-- rules row switched on and the read switch turned on. Keep the fixture in step
-- with that file. The test runs it inside one transaction it always rolls back.
-- Needs a database with no active Manager Card rules and no Fantasy season later
-- than 2089 (a freshly reset local stack).

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

-- Rules v1 on, reads on.
update app_private.manager_card_rules set active = true where version = 1;
select app_private.manager_card_configure(null, true);
