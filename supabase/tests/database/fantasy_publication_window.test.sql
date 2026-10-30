-- The moments between "a journée is held" and "its standings are published".
--
-- The standings readers (20261030100000) serve a held season from a stored
-- table (app_private.fantasy_shown_rankings). A journée becomes held when its
-- first result row is written, or when the rule is switched on over results
-- that already exist: neither writes app.fantasy_rankings, so the table must be
-- built by those writes themselves. Before the fix the table stayed empty from
-- the first results batch until the journée's overall ranking was written, and
-- during that time the overall standings fell back to the wrong board and the
-- league standings returned no item at all.
--
-- What each check asserts: at no step does a reader show an empty or a wrong
-- standing. "Wrong" is measured against an oracle worked out straight from the
-- result rows of the published journées (1 to 5), not from the stored table.
begin;
select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3) values ('c0000000-0000-4000-8000-000000000001', 'XW', 'XWW');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('c1000000-0000-4000-8000-000000000001', 'window-test', 'Window Test', 'WT', 'league', 'c0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '2089/90', '2089-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
select ('c3' || lpad(g::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'c2000000-0000-4000-8000-000000000001', g, 'Gameweek ' || g, 'active'
from generate_series(1, 7) g;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('c6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'window-test', 'Window Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values ('c6300000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000100', '2089/90', 'active', '2089-08-01', '2090-06-30');
-- Journées 1 to 5 finalized, 6 and 7 provisional (so 6 and 7 are the gated ones).
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at,
  status, finalized_at, points_state, closed_at, closed_calculation_version)
select ('c64' || lpad(g::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid, 'c6300000-0000-4000-8000-000000000001',
  ('c3' || lpad(g::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid, g, 'Gameweek ' || g,
  ('2089-09-' || lpad((g * 3)::text, 2, '0') || 'T11:00:00Z')::timestamptz,
  ('2089-09-' || lpad((g * 3)::text, 2, '0') || 'T12:00:00Z')::timestamptz,
  ('2089-09-' || lpad((g * 3 + 2)::text, 2, '0') || 'T12:00:00Z')::timestamptz,
  case when g <= 5 then 'finalized' else 'provisional' end::app.fantasy_gameweek_status,
  case when g <= 5 then ('2089-09-' || lpad((g * 3 + 2)::text, 2, '0') || 'T20:00:00Z')::timestamptz end,
  case when g <= 5 then 'final' else 'provisional' end::app.fantasy_points_state,
  ('2089-09-' || lpad((g * 3)::text, 2, '0') || 'T11:00:00Z')::timestamptz, 1
from generate_series(1, 7) g;

-- Twelve teams in two leagues. Scores come from a small range so that many teams tie.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select ('c8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'window' || i || '@example.test', now(), now()
from generate_series(1, 12) i;
insert into app.profiles (id, display_name, username)
select u.id, 'Manager ' || substr(u.email, 7, 4), 'w' || substr(u.id::text, 1, 8) from auth.users u
where u.email like 'window%@example.test' on conflict do nothing;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers, status, created_at)
select ('c9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('c8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'c6300000-0000-4000-8000-000000000001', 'c6400006-0000-4000-8000-000000000001', 'Team ' || i, 0, 100, 1, 'active',
  '2089-09-01'::timestamptz + (i || ' seconds')::interval
from generate_series(1, 12) i;
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility, member_count, active)
select ('ca' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'c6300000-0000-4000-8000-000000000001',
  ('c8' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'League ' || k, 'public', 6, true
from generate_series(1, 2) k;
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role, status)
select ('ca' || lpad(to_hex(1 + (i % 2)), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('c9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('c8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'member', 'active'
from generate_series(1, 12) i;
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points,
  transfer_hit, provisional_score, final_score, state, calculation_version, finalized_at)
select ('c9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('c64' || lpad(g::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid, 30, 0, 0, 0,
  30 + ((i * g * 7) % 9), 30 + ((i * g * 7) % 9), 'final', 1,
  ('2089-09-' || lpad((g * 3 + 2)::text, 2, '0') || 'T20:00:00Z')::timestamptz
from generate_series(1, 12) i cross join generate_series(1, 5) g;

-- Rankings through the real writer, as the worker writes them.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_recalculate_fantasy_rankings('c6300000-0000-4000-8000-000000000001', null, null, 1);
select api.service_recalculate_fantasy_rankings('c6300000-0000-4000-8000-000000000001', null,
  ('ca' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 1) from generate_series(1, 2) k;

-- The reader as a signed-in manager who passed the second factor.
create function pg_temp.as_manager() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"c8000001-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true) $$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true) $$;
create function pg_temp.overall() returns jsonb language sql as $$
  select api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001', null, null, null, 50) $$;
create function pg_temp.league(k integer) returns jsonb language sql as $$
  select api.fantasy_league_standings(('ca' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, null, null, null, 50) $$;
-- (rank:total) pairs of a page, in the order the page lists them.
create function pg_temp.pairs(page jsonb) returns text language sql immutable as $$
  select coalesce(string_agg((i->>'rank') || ':' || (i->>'totalPoints'), ' ' order by ord), '')
  from jsonb_array_elements(page->'items') with ordinality t(i, ord) $$;
-- The oracle: totals of the published journées (1 to 5), straight from the
-- result rows, and the ranks the ranking writer gives them (no team here has
-- a transfer hit or a confirmed transfer, so the tie-break is the latest
-- finalized score, then creation date, then id).
create function pg_temp.oracle(league integer default null) returns text language sql stable as $$
  select coalesce(string_agg(r.rk || ':' || r.pts, ' ' order by r.rk), '') from (
    select row_number() over (order by sum(coalesce(t.final_score, t.provisional_score)) desc,
        max(t.final_score) filter (where g.sequence_number = 5) desc nulls last,
        tm.created_at asc, tm.id asc) as rk,
      sum(coalesce(t.final_score, t.provisional_score))::integer as pts
    from app.fantasy_team_gameweek_results t
    join app.fantasy_teams tm on tm.id = t.fantasy_team_id
    join app.fantasy_gameweeks g on g.id = t.gameweek_id and g.sequence_number <= 5
    where league is null or exists (select 1 from app.fantasy_league_memberships m
      where m.fantasy_team_id = tm.id and m.league_id = ('ca' || lpad(to_hex(league), 6, '0') || '-0000-4000-8000-000000000001')::uuid)
    group by tm.id, tm.created_at) r $$;

select pg_temp.as_manager();
select set_config('test.before_overall', pg_temp.overall()::text, true);
select set_config('test.before_league', pg_temp.league(1)::text, true);

select extensions.is(pg_temp.pairs(pg_temp.overall()), pg_temp.oracle(),
  'baseline, no gate: the overall standings are the journées 1 to 5 totals');
select extensions.is(jsonb_array_length(pg_temp.league(1)->'items'), 6, 'baseline: league 1 lists its six teams');

-- ===========================================================================
-- A. The normal release. The rule is on, nothing is held yet (no result row
--    for journée 6). Then the worker's first results batch is written, and the
--    overall ranking of the journée does not exist yet.
-- ===========================================================================
select pg_temp.as_service();
insert into app_private.fantasy_api_rating_seasons (season_id, from_gameweek, owner_approval)
values ('c6300000-0000-4000-8000-000000000001', 6, 'window test');
select extensions.is(app_private.fantasy_any_held(), false, 'A: the rule is on but no result exists for journée 6: nothing is held');
select extensions.is((select count(*)::integer from app_private.fantasy_shown_rankings), 0, 'A: and the stored table is empty, as it should be');
select pg_temp.as_manager();
select extensions.is(pg_temp.overall()::text, current_setting('test.before_overall'), 'A: the overall standings are untouched');

select pg_temp.as_service();
-- First batch: half of the teams. A second batch follows.
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points,
  transfer_hit, provisional_score, state, calculation_version)
select ('c9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'c6400006-0000-4000-8000-000000000001',
  30, 0, 0, 0, 40 + (i % 5), 'provisional', 1
from generate_series(1, 6) i;
select extensions.is(app_private.fantasy_any_held(), true, 'A: journée 6 now has results and is unpublished: held');
select extensions.is((select count(*)::integer from app_private.fantasy_shown_rankings), 24,
  'A: the first results batch built the stored table in the same transaction (12 season rows and 12 league rows)');
select pg_temp.as_manager();
select extensions.is(pg_temp.pairs(pg_temp.overall()), pg_temp.oracle(),
  'A: after the first batch, no ranking written yet: the overall standings are still the journées 1 to 5 totals, in order');
select extensions.is(jsonb_array_length(pg_temp.overall()->'items'), 12, 'A: and they list all twelve teams');
select extensions.is(pg_temp.league(1)::text, current_setting('test.before_league'), 'A: league 1 shows the same standings as before the batch');
select extensions.is(jsonb_array_length(pg_temp.league(2)->'items'), 6, 'A: league 2 is not empty');
select extensions.is(pg_temp.pairs(pg_temp.league(2)), pg_temp.oracle(2), 'A: and league 2 is the journées 1 to 5 totals of its members');

select pg_temp.as_service();
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points,
  transfer_hit, provisional_score, state, calculation_version)
select ('c9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'c6400006-0000-4000-8000-000000000001',
  30, 0, 0, 0, 40 + (i % 5), 'provisional', 1
from generate_series(7, 12) i;
select pg_temp.as_manager();
select extensions.is(pg_temp.pairs(pg_temp.overall()), pg_temp.oracle(), 'A: after the last batch the overall standings are still right');
select extensions.is(pg_temp.league(1)::text, current_setting('test.before_league'), 'A: and league 1 is unchanged');

-- The worker writes the boards while the journée is released but not published.
select pg_temp.as_service();
select api.service_recalculate_fantasy_rankings('c6300000-0000-4000-8000-000000000001', null, null, 2);
select api.service_recalculate_fantasy_rankings('c6300000-0000-4000-8000-000000000001', null,
  ('ca' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 2) from generate_series(1, 2) k;
select pg_temp.as_manager();
select extensions.is(pg_temp.pairs(pg_temp.overall()), pg_temp.oracle(), 'A: boards written while held still show the journées 1 to 5 totals');
select extensions.is(jsonb_array_length(pg_temp.league(1)->'items'), 6, 'A: and the league is not empty');

-- ===========================================================================
-- B. The rule is switched off, the boards are written with the journée in
--    (the old process), then the rule is switched on over results that exist.
-- ===========================================================================
select pg_temp.as_service();
delete from app_private.fantasy_api_rating_seasons where season_id = 'c6300000-0000-4000-8000-000000000001';
select extensions.is(app_private.fantasy_any_held(), false, 'B: the rule is off: nothing is held');
select extensions.is((select count(*)::integer from app_private.fantasy_shown_rankings), 0, 'B: and the stored table is cleared');
select api.service_recalculate_fantasy_rankings('c6300000-0000-4000-8000-000000000001', null, null, 3);
select api.service_recalculate_fantasy_rankings('c6300000-0000-4000-8000-000000000001', null,
  ('ca' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 3) from generate_series(1, 2) k;
select pg_temp.as_manager();
select extensions.isnt(pg_temp.pairs(pg_temp.overall()), pg_temp.oracle(),
  'B: with the rule off the boards include journée 6 (so the next check is not trivially true)');

select pg_temp.as_service();
insert into app_private.fantasy_api_rating_seasons (season_id, from_gameweek, owner_approval)
values ('c6300000-0000-4000-8000-000000000001', 6, 'window test');
select extensions.is((select count(*)::integer from app_private.fantasy_shown_rankings), 24,
  'B: switching the rule on over existing results built the stored table at once');
select pg_temp.as_manager();
select extensions.is(pg_temp.pairs(pg_temp.overall()), pg_temp.oracle(),
  'B: and the overall standings immediately leave journée 6 out');
select extensions.is(jsonb_array_length(pg_temp.overall()->'items'), 12, 'B: all twelve teams are listed');
select extensions.is(pg_temp.pairs(pg_temp.league(1)), pg_temp.oracle(1), 'B: league 1 is right');
select extensions.is(pg_temp.pairs(pg_temp.league(2)), pg_temp.oracle(2), 'B: league 2 is right');

-- ===========================================================================
-- C. The last result rows of the held journée are removed (nothing is held,
--    the table is cleared), then a single result row of the next journée
--    (7) is written: it is held from that row on, and the table is built.
-- ===========================================================================
select pg_temp.as_service();
delete from app.fantasy_team_gameweek_results where gameweek_id = 'c6400006-0000-4000-8000-000000000001';
select extensions.is(app_private.fantasy_any_held(), false, 'C: no result row left for journée 6: nothing is held');
select extensions.is((select count(*)::integer from app_private.fantasy_shown_rankings), 0, 'C: and the stored table is cleared');
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points,
  transfer_hit, provisional_score, state, calculation_version)
values ('c9000001-0000-4000-8000-000000000001', 'c6400007-0000-4000-8000-000000000001', 30, 0, 0, 0, 45, 'provisional', 1);
select extensions.is((select count(*)::integer from app_private.fantasy_shown_rankings), 24,
  'C: a single result row of another held journée (7) builds it again');
select pg_temp.as_manager();
select extensions.is(jsonb_array_length(pg_temp.overall()->'items'), 12, 'C: the overall standings list all twelve teams');
select extensions.is(jsonb_array_length(pg_temp.league(2)->'items'), 6, 'C: and league 2 is not empty');

select * from extensions.finish();
rollback;
