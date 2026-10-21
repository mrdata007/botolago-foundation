-- Scoring proof: read-only verification (docs/backend/SCORING_PROOF_STAGING.md).
-- Writes nothing (the claims are transaction-local; every statement is a select).
-- Every expected number below was worked out by hand from the published v2.0 rules
-- (appearance 2 at 60+ min; goal GK 10 / DEF 6 / MID 5 / FWD 4; clean sheet GK/DEF 4,
-- MID 1; -1 per 2 conceded for GK/DEF; 1 per 3 saves; assist 3; yellow -1;
-- captain x2, triple captain x3), not read from the code under test.

create temporary table proof_check (name text primary key, expected jsonb, actual jsonb) on commit drop;
create function pg_temp.fp(n integer) returns uuid language sql immutable as
  $$ select ('fb5c0000-0000-4000-8000-ae' || lpad(n::text, 10, '0'))::uuid $$;
create function pg_temp.team(t integer) returns uuid language sql immutable as
  $$ select ('fb5c0000-0000-4000-8000-b' || lpad(t::text, 11, '0'))::uuid $$;
create function pg_temp.user_id(t integer) returns uuid language sql immutable as
  $$ select ('fb5c0000-0000-4000-8000-a' || lpad(t::text, 11, '0'))::uuid $$;

-- 1. The gameweek is final.
insert into proof_check select 'gameweek', '{"status":"finalized","pointsState":"final"}',
  jsonb_build_object('status', status, 'pointsState', points_state)
from app.fantasy_gameweeks where id = 'fb5c0000-0000-4000-8000-c00000000007';

-- 2. Player points (final), one per kind of event.
insert into proof_check select 'player_points',
  '{"p6 MID goal (match 1, reconciled)":7,"p10 FWD goal":6,"p22 FWD goal, team conceded 2":6,"p12 GK conceded 2":1,"p23 GK clean sheet, 4 saves":7,"p24 DEF clean sheet":6,"p28 MID clean sheet":3,"p50 MID assist + clean sheet":6,"p54 FWD goal":6,"p57 DEF yellow":1,"p67 did not play":0}',
  jsonb_build_object(
    'p6 MID goal (match 1, reconciled)', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(6)),
    'p10 FWD goal', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(10)),
    'p22 FWD goal, team conceded 2', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(22)),
    'p12 GK conceded 2', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(12)),
    'p23 GK clean sheet, 4 saves', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(23)),
    'p24 DEF clean sheet', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(24)),
    'p28 MID clean sheet', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(28)),
    'p50 MID assist + clean sheet', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(50)),
    'p54 FWD goal', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(54)),
    'p57 DEF yellow', (select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(57)),
    'p67 did not play', coalesce((select final_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.fp(67)), 0));

-- 3. Team results: A plain captain, B vice-captain + one substitution, C triple captain, D bench boost.
insert into proof_check select 'team_results',
  '{"A":{"starting":57,"bench":11,"captain":7,"chip":null,"final":64},"B":{"starting":38,"bench":6,"captain":3,"chip":null,"final":41},"C":{"starting":57,"bench":11,"captain":12,"chip":"triple_captain","final":69},"D":{"starting":57,"bench":11,"captain":7,"chip":"bench_boost","final":75}}',
  (select jsonb_object_agg(chr(64 + t), jsonb_build_object('starting', r.starting_points, 'bench', r.bench_points,
     'captain', r.captain_points, 'chip', r.chip_type, 'final', r.final_score))
   from generate_series(1, 4) t join app.fantasy_team_gameweek_results r on r.fantasy_team_id = pg_temp.team(t));
insert into proof_check select 'B_vice_captain_and_substitution',
  jsonb_build_object('effectiveCaptain', pg_temp.fp(51), 'out', pg_temp.fp(67), 'in', pg_temp.fp(17), 'reason', 'outfield_did_not_play'),
  (select jsonb_build_object('effectiveCaptain', scoring_details ->> 'effectiveCaptainId',
     'out', scoring_details #>> '{substitutions,0,playerOutId}', 'in', scoring_details #>> '{substitutions,0,playerInId}',
     'reason', scoring_details #>> '{substitutions,0,reason}')
   from app.fantasy_team_gameweek_results where fantasy_team_id = pg_temp.team(2));

-- 4. Standings: overall and league, gameweek and season.
insert into proof_check select 'standings',
  '{"overall_gameweek":["D:75","C:69","A:64","B:41"],"overall_season":["D:75","C:69","A:64","B:41"],"league_gameweek":["D:75","C:69","A:64","B:41"],"league_season":["D:75","C:69","A:64","B:41"]}',
  jsonb_build_object(
    'overall_gameweek', (select jsonb_agg(right(t.name, 1) || ':' || r.total_points order by r.rank) from app.fantasy_rankings r join app.fantasy_teams t on t.id = r.fantasy_team_id
      where t.id::text like 'fb5c0000-%' and r.league_id is null and r.gameweek_id is not null),
    'overall_season', (select jsonb_agg(right(t.name, 1) || ':' || r.total_points order by r.rank) from app.fantasy_rankings r join app.fantasy_teams t on t.id = r.fantasy_team_id
      where t.id::text like 'fb5c0000-%' and r.league_id is null and r.gameweek_id is null),
    'league_gameweek', (select jsonb_agg(right(t.name, 1) || ':' || r.total_points order by r.rank) from app.fantasy_rankings r join app.fantasy_teams t on t.id = r.fantasy_team_id
      where r.league_id = 'fb5c0000-0000-4000-8000-be0000000001' and r.gameweek_id is not null),
    'league_season', (select jsonb_agg(right(t.name, 1) || ':' || r.total_points order by r.rank) from app.fantasy_rankings r join app.fantasy_teams t on t.id = r.fantasy_team_id
      where r.league_id = 'fb5c0000-0000-4000-8000-be0000000001' and r.gameweek_id is null));

-- 5. What each manager sees (the app's own read functions, as that manager, role authenticated).
create function pg_temp.as_manager(t integer) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.user_id(t), 'role', 'authenticated', 'aal', 'aal1')::text, true)
$$;
create function pg_temp.points_page(t integer) returns jsonb language plpgsql security invoker as $$
declare page jsonb;
begin
  perform pg_temp.as_manager(t);
  set local role authenticated;
  page := api.get_my_fantasy_points(pg_temp.team(t), 'fb5c0000-0000-4000-8000-c00000000007');
  reset role;
  return page;
end $$;
insert into proof_check select 'manager_pages',
  '{"A":{"final":64,"captainMultiplier":2},"B":{"final":41,"captainMultiplier":0,"viceMultiplier":2,"subs":1},"C":{"final":69,"captainMultiplier":3},"D":{"final":75,"captainMultiplier":2,"benchCounted":4}}',
  jsonb_build_object(
    'A', (select jsonb_build_object('final', pg -> 'result' -> 'finalScore',
            'captainMultiplier', (select (p ->> 'multiplier')::numeric from jsonb_array_elements(pg -> 'players') p where (p ->> 'captain')::boolean))
          from (select pg_temp.points_page(1) pg) x),
    'B', (select jsonb_build_object('final', pg -> 'result' -> 'finalScore',
            'captainMultiplier', (select (p ->> 'multiplier')::numeric from jsonb_array_elements(pg -> 'players') p where (p ->> 'captain')::boolean),
            'viceMultiplier', (select (p ->> 'multiplier')::numeric from jsonb_array_elements(pg -> 'players') p where (p ->> 'viceCaptain')::boolean),
            'subs', jsonb_array_length(coalesce(pg -> 'autoSubstitutions', '[]')))
          from (select pg_temp.points_page(2) pg) x),
    'C', (select jsonb_build_object('final', pg -> 'result' -> 'finalScore',
            'captainMultiplier', (select (p ->> 'multiplier')::numeric from jsonb_array_elements(pg -> 'players') p where (p ->> 'captain')::boolean))
          from (select pg_temp.points_page(3) pg) x),
    'D', (select jsonb_build_object('final', pg -> 'result' -> 'finalScore',
            'captainMultiplier', (select (p ->> 'multiplier')::numeric from jsonb_array_elements(pg -> 'players') p where (p ->> 'captain')::boolean),
            'benchCounted', (select count(*) from jsonb_array_elements(pg -> 'players') p where p ->> 'slot' = 'bench' and (p ->> 'multiplier')::numeric > 0))
          from (select pg_temp.points_page(4) pg) x));

-- 6. A manager cannot read another manager's points.
create function pg_temp.foreign_read() returns text language plpgsql as $$
begin
  perform pg_temp.as_manager(2);
  set local role authenticated;
  perform api.get_my_fantasy_points(pg_temp.team(1), 'fb5c0000-0000-4000-8000-c00000000007');
  reset role;
  return 'readable';
exception when others then
  reset role;
  return sqlerrm;
end $$;
insert into proof_check select 'manager_isolation', '"fantasy_team_not_found"', to_jsonb(pg_temp.foreign_read());

-- 7. The league table a manager opens, and the gameweek summary anyone can open.
create function pg_temp.league_page() returns jsonb language plpgsql as $$
declare page jsonb;
begin
  perform pg_temp.as_manager(2);
  set local role authenticated;
  page := api.fantasy_league_standings('fb5c0000-0000-4000-8000-be0000000001', null, null, null, 20);
  reset role;
  return page;
end $$;
insert into proof_check select 'league_page_season', '["D:75","C:69","A:64","B:41"]',
  (select jsonb_agg(right(r ->> 'teamName', 1) || ':' || (r ->> 'totalPoints') order by (r ->> 'rank')::int)
   from jsonb_array_elements(pg_temp.league_page() -> 'items') r);

-- 8. Inputs: match 1 came through the reconciled ingestion, linked to one match per provider.
insert into proof_check select 'inputs',
  '{"observations":3,"reconciled":1,"corrections":2,"links":2}',
  jsonb_build_object(
    'observations', (select count(*) from app_private.fantasy_fixture_observations where fixture_id::text like 'fb5c0000-%'),
    'reconciled', (select count(*) from app_private.fantasy_fixture_observations where fixture_id::text like 'fb5c0000-%' and source = 'provider-reconciled'),
    'corrections', (select count(*) from app_private.fantasy_fixture_observations where fixture_id::text like 'fb5c0000-%' and source = 'reviewed-correction'),
    'links', (select count(*) from app_private.football_provider_fixture_links where fixture_id::text like 'fb5c0000-%'));

select jsonb_build_object(
  'verdict', case when bool_and(expected = actual) then 'pass' else 'fail' end,
  'failed', coalesce(jsonb_object_agg(name, jsonb_build_object('expected', expected, 'actual', actual)) filter (where expected is distinct from actual), '{}'),
  'checks', count(*)) as scoring_proof_verdict
from proof_check;
