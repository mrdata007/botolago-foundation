insert into app_private.fantasy_api_rating_seasons (season_id, from_gameweek, owner_approval) values ('d6300000-0000-4000-8000-000000000001', 6, 'perf scratch');
insert into app_private.fantasy_publication_state(gameweek_id, released_at, last_outcome) values ('d6400006-0000-4000-8000-000000000001', now(), 'released');
set session_replication_role = replica;
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points, transfer_hit, provisional_score, state, calculation_version)
select ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'd6400006-0000-4000-8000-000000000001', 30,0,0,0, 30 + ((i*6*7) % 9), 'provisional', 1 from generate_series(1,5000) i;
set session_replication_role = origin;
select app_private.fantasy_any_held() as held_as_owner;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d8000010-0000-4000-8000-000000000001","aal":"aal2"}', false);
set role authenticated;
select s->>'total' as total, jsonb_array_length(s->'items') as items, s->'items'->0 as first from api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, null, null, 50) s;
select s->>'total' as total, jsonb_array_length(s->'items') as items from api.fantasy_overall_standings_held('d6300000-0000-4000-8000-000000000001', null, null, null, 50) s;
