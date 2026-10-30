-- window: released, results written, no ranking written yet
insert into app_private.fantasy_api_rating_seasons (season_id, from_gameweek, owner_approval) values ('d6300000-0000-4000-8000-000000000001', 6, 'perf scratch');
select app_private.fantasy_any_held() as held_before_results;
insert into app_private.fantasy_publication_state(gameweek_id, released_at, last_outcome) values ('d6400006-0000-4000-8000-000000000001', now(), 'released');
select app_private.fantasy_any_held() as held_released_no_results;
set session_replication_role = replica;
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points, transfer_hit, provisional_score, state, calculation_version)
select ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'd6400006-0000-4000-8000-000000000001', 30,0,0,0, 30 + ((i*6*7) % 9), 'provisional', 1 from generate_series(1,5000) i;
set session_replication_role = origin;
select app_private.fantasy_any_held() as held_released_with_results_no_ranking;
select count(*) as shown_rows from app_private.fantasy_shown_rankings;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d8000010-0000-4000-8000-000000000001","aal":"aal2"}', false);
set role authenticated;
select s->>'total' as total, jsonb_array_length(s->'items') as items, s->'items'->0->>'rank' as first_rank, s->'myRank' as my_rank from api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, null, null, 50) s;
select s->>'total' as lg_total, jsonb_array_length(s->'items') as lg_items from api.fantasy_league_standings('da000005-0000-4000-8000-000000000001', null, null, null, 50) s;
select api.fantasy_hub('fr')::text like '%rank%' as hub_has_rank, left(api.fantasy_hub('fr')::text, 400) as hub;
reset role;
-- worker now writes the gameweek overall ranking (service role)
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', 'd6400006-0000-4000-8000-000000000001', null, 1) as gw_rows;
select app_private.fantasy_any_held() as held_after_gw_overall_ranking, (select count(*) from app_private.fantasy_shown_rankings) as shown_rows_after;
