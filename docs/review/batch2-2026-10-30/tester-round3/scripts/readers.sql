-- prints: label | md5 of the output | number of rows. Run identically on two databases and diff.
\set QUIET on
\pset format unaligned
\pset tuples_only on
begin;
create temp table out(label text, h text, n int);
create temp table anchors as select (select fantasy_team_id from app.fantasy_rankings where gameweek_id is null and league_id is null and rank=50) as a50,
 (select fantasy_team_id from app.fantasy_rankings where gameweek_id is null and league_id is null and rank=4000) as a4000,
 (select fantasy_team_id from app.fantasy_rankings where gameweek_id='d6400005-0000-4000-8000-000000000001' and league_id is null and rank=50) as g5a50,
 (select fantasy_team_id from app.fantasy_rankings where gameweek_id is null and league_id='da000005-0000-4000-8000-000000000001' and rank=50) as l5a50;
grant all on anchors to authenticated;
grant all on out to authenticated;
create function pg_temp.rec(label text, sql text) returns void language plpgsql as $$
declare r text; n int;
begin
  begin
    execute 'select md5(coalesce(jsonb_agg(to_jsonb(x))::text, '''')), count(*) from (' || sql || ') x' into r, n;
  exception when others then r := 'ERR ' || sqlerrm; n := -1;
  end;
  insert into out values (label, r, n);
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d8000010-0000-4000-8000-000000000001","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.rec('overall p1', $$select * from api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, null, null, 50)$$);
select pg_temp.rec('overall 1 row', $$select * from api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, null, null, 1)$$);
select pg_temp.rec('overall p2', $$select * from api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, 50, (select a50 from anchors), 50)$$);
select pg_temp.rec('overall deep', $$select * from api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, 4000, (select a4000 from anchors), 50)$$);
select pg_temp.rec('overall gw3', $$select * from api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', 'd6400003-0000-4000-8000-000000000001', null, null, 50)$$);
select pg_temp.rec('overall gw5 p2', $$select * from api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', 'd6400005-0000-4000-8000-000000000001', 50, (select g5a50 from anchors), 50)$$);
select pg_temp.rec('league ' || k, format($f$select * from api.fantasy_league_standings('da%s-0000-4000-8000-000000000001', null, null, null, 50)$f$, lpad(to_hex(k), 6, '0'))) from generate_series(1, 20) k;
select pg_temp.rec('league 5 1row', $$select * from api.fantasy_league_standings('da000005-0000-4000-8000-000000000001', null, null, null, 1)$$);
select pg_temp.rec('league 5 p2', $$select * from api.fantasy_league_standings('da000005-0000-4000-8000-000000000001', null, 50, (select l5a50 from anchors), 50)$$);
select pg_temp.rec('league 5 gw2', $$select * from api.fantasy_league_standings('da000005-0000-4000-8000-000000000001', 'd6400002-0000-4000-8000-000000000001', null, null, 50)$$);
select pg_temp.rec('hub fr', $$select api.fantasy_hub('fr') as h$$);
select pg_temp.rec('hub ar', $$select api.fantasy_hub('ar') as h$$);
select pg_temp.rec('leagues', $$select * from api.fantasy_leagues('d6300000-0000-4000-8000-000000000001', null, 20)$$);
select pg_temp.rec('rivals', $$select api.get_my_rivals('d6300000-0000-4000-8000-000000000001') as h$$);
select pg_temp.rec('briefing', $$select api.get_my_deadline_briefing('d6300000-0000-4000-8000-000000000001') as h$$);
select pg_temp.rec('points gw3', $$select api.get_my_fantasy_points('d9000010-0000-4000-8000-000000000001', 'd6400003-0000-4000-8000-000000000001') as h$$);
select pg_temp.rec('points gw6', $$select api.get_my_fantasy_points('d9000010-0000-4000-8000-000000000001', 'd6400006-0000-4000-8000-000000000001') as h$$);
select pg_temp.rec('gameweeks', $$select * from api.fantasy_gameweeks('d6300000-0000-4000-8000-000000000001', null, 40)$$);
select pg_temp.rec('summary gw' || g, format($f$select api.fantasy_gameweek_summary('d64%s-0000-4000-8000-000000000001') as h$f$, lpad(g::text, 5, '0'))) from generate_series(1, 6) g;
reset role;
select pg_temp.rec('hidden_ahead r' || r, format($f$select app_private.fantasy_hidden_ahead('d6300000-0000-4000-8000-000000000001', null, null, %s::bigint, false) as h$f$, r)) from unnest(array[1,2,3,10,100,2500,5000]) r;
select pg_temp.rec('hidden_ahead gw3 r' || r, format($f$select app_private.fantasy_hidden_ahead('d6300000-0000-4000-8000-000000000001', 'd6400003-0000-4000-8000-000000000001', null, %s::bigint, false) as h$f$, r)) from unnest(array[2,100,4000]) r;
reset role;
select label || ' | ' || h || ' | ' || n from out order by label;
rollback;
