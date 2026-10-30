-- gate on, Journée 6 results written while held (never released), boards rewritten by the writer
insert into app_private.fantasy_api_rating_seasons (season_id, from_gameweek, owner_approval) values ('d6300000-0000-4000-8000-000000000001', 6, 'perf scratch');
set session_replication_role = replica;
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points, transfer_hit, provisional_score, state, calculation_version)
select t.id, 'd6400006-0000-4000-8000-000000000001', 30,0,0, case when t.name like '%7' then 4 else 0 end, 30 + ((substr(t.name,6)::int*6*7) % 9), 'provisional', 1 from app.fantasy_teams t;
set session_replication_role = origin;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
\timing on
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, null, 2);
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, ('da' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 2) from generate_series(1,20) k;
\timing off
vacuum analyze;
