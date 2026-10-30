-- Stored shown rankings: correctness scenarios. Runs on a small seeded DB (300 teams) with the batch applied.
-- Oracle: computed straight from the tables, independent of the Builder's refresh function.
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.oracle_mismatch() returns text language plpgsql as $$
declare mism int; shown int; expected int; held uuid[];
begin
  -- expected: for every season/league board row stored in app.fantasy_rankings (gw null), the team's published sum and rank.
  with unpub as (select gameweek_id from app_private.fantasy_unpublished_gameweeks),
  board as (select r.* from app.fantasy_rankings r where r.gameweek_id is null),
  res as (
    select t.fantasy_team_id,
      sum(coalesce(t.final_score, t.provisional_score))::int as pts,
      coalesce(sum(t.transfer_hit),0)::int as hits
    from app.fantasy_team_gameweek_results t
    where t.gameweek_id not in (select gameweek_id from unpub) group by 1),
  conf as (select fantasy_team_id, sum(transfers_count)::int c from app.fantasy_transfer_batches where status='confirmed' group by 1),
  lat as (select distinct on (t.fantasy_team_id) t.fantasy_team_id, t.final_score s
          from app.fantasy_team_gameweek_results t join app.fantasy_gameweeks g on g.id=t.gameweek_id
          where t.state='final' and t.gameweek_id not in (select gameweek_id from unpub)
          order by t.fantasy_team_id, g.sequence_number desc, t.id desc),
  exp as (
    select b.id, b.fantasy_season_id, b.league_id, b.fantasy_team_id, coalesce(res.pts,0) pts,
      row_number() over (partition by b.fantasy_season_id, b.league_id
        order by coalesce(res.pts,0) desc, coalesce(res.hits,0) asc, coalesce(conf.c,0) asc, lat.s desc nulls last, tm.created_at asc, b.fantasy_team_id asc) rk
    from board b join app.fantasy_teams tm on tm.id=b.fantasy_team_id
    left join res on res.fantasy_team_id=b.fantasy_team_id left join conf on conf.fantasy_team_id=b.fantasy_team_id
    left join lat on lat.fantasy_team_id=b.fantasy_team_id)
  select count(*) filter (where s.ranking_id is null or s.rank<>e.rk or s.total_points<>e.pts), count(*) into mism, expected
  from exp e left join app_private.fantasy_shown_rankings s on s.ranking_id=e.id;
  select count(*) into shown from app_private.fantasy_shown_rankings;
  return format('expected=%s shown=%s mismatches=%s any_held=%s', expected, shown, mism, app_private.fantasy_any_held());
end $$;
create or replace function pg_temp.ranks_equal_reader() returns text language plpgsql as $$
declare r text;
begin
  -- reader vs table for the season board first page (visible rows of the held reader)
  select format('overall page first rank=%s total=%s', (api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, null, null, 3)->'items'->0->>'rank'),
                 (api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, null, null, 3)->'items'->0->>'totalPoints')) into r;
  return r;
end $$;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
\echo == S0 baseline (no gate)
select pg_temp.oracle_mismatch();

-- J6 and J7 results written BEFORE the gate (as the old process did), boards rewritten including them.
set session_replication_role = replica;
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points, transfer_hit, provisional_score, state, calculation_version)
select t.id, g.id, 30,0,0, case when (substr(t.name,6)::int + g.sequence_number) % 7 = 0 then 4 else 0 end, 30 + ((substr(t.name,6)::int*g.sequence_number*7) % 9), 'provisional', 1
from app.fantasy_teams t cross join app.fantasy_gameweeks g where g.sequence_number in (6,7);
set session_replication_role = origin;
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, null, 2);
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, ('da' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 2) from generate_series(1,20) k;

\echo == S1 boards written before the gate, then gate switched on (J6 held; J7 held too: two journées held at once)
insert into app_private.fantasy_api_rating_seasons (season_id, from_gameweek, owner_approval) values ('d6300000-0000-4000-8000-000000000001', 6, 'perf scratch');
\echo -- right after the rating-season row (no refresh trigger on that table):
select pg_temp.oracle_mismatch();
insert into app_private.fantasy_publication_settings (season_id, first_gameweek) values ('d6300000-0000-4000-8000-000000000001', 6);
\echo -- after publication settings written (trigger refresh):
select pg_temp.oracle_mismatch();

\echo == S2 the writer runs again while held (season + leagues)
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, null, 3);
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, ('da' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 3) from generate_series(1,20) k;
select pg_temp.oracle_mismatch();

\echo == S3 a correction to Journée 2 while held (final_score changed for 40 teams), writer re-run
update app.fantasy_team_gameweek_results set final_score = final_score + 5, provisional_score = provisional_score + 5
 where gameweek_id = 'd6400002-0000-4000-8000-000000000001' and fantasy_team_id in (select id from app.fantasy_teams order by name limit 40);
\echo -- before the writer re-runs (results changed, boards not):
select pg_temp.oracle_mismatch();
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, null, 4);
\echo -- after the season board only (league boards still old):
select pg_temp.oracle_mismatch();
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, ('da' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 4) from generate_series(1,20) k;
select pg_temp.oracle_mismatch();

\echo == S4 a new team joins a league while held, writer re-run for that league and the season
insert into auth.users (id, instance_id, aud, role, email) values ('d8ffff00-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new@example.test');
set session_replication_role = replica;
insert into app.profiles (id, display_name, username) values ('d8ffff00-0000-4000-8000-000000000001', 'New', 'newbie');
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers, status)
values ('d9ffff00-0000-4000-8000-000000000001', 'd8ffff00-0000-4000-8000-000000000001', 'd6300000-0000-4000-8000-000000000001', 'd6400006-0000-4000-8000-000000000001', 'Team 9999', 0, 100, 1, 'active');
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role, status)
values ('da000001-0000-4000-8000-000000000001', 'd9ffff00-0000-4000-8000-000000000001', 'd8ffff00-0000-4000-8000-000000000001', 'member', 'active');
set session_replication_role = origin;
select pg_temp.oracle_mismatch();
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, null, 5);
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, 'da000001-0000-4000-8000-000000000001', 5);
select pg_temp.oracle_mismatch();
\echo -- new team shown rows (expect season + league 1):
select count(*) from app_private.fantasy_shown_rankings where fantasy_team_id='d9ffff00-0000-4000-8000-000000000001';

\echo == S5 a team leaves league 1 while held (membership left), league writer re-run
update app.fantasy_league_memberships set status = 'left' where fantasy_team_id = 'd9000015-0000-4000-8000-000000000001' and league_id = 'da000002-0000-4000-8000-000000000001';
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, 'da000002-0000-4000-8000-000000000001', 6);
select pg_temp.oracle_mismatch();
\echo -- is the leaver still shown in league 2 (stored and shown)?
select (select count(*) from app.fantasy_rankings where league_id='da000002-0000-4000-8000-000000000001' and gameweek_id is null and fantasy_team_id='d9000015-0000-4000-8000-000000000001') as stored_row,
       (select count(*) from app_private.fantasy_shown_rankings where league_id='da000002-0000-4000-8000-000000000001' and fantasy_team_id='d9000015-0000-4000-8000-000000000001') as shown_row;

\echo == S6 release J6 only (J7 still held): table still used, correct?
insert into app_private.fantasy_publication_state(gameweek_id, released_at, last_outcome) values ('d6400006-0000-4000-8000-000000000001', now(), 'released');
\echo -- released but no overall ranking for J6 yet (J6 still unpublished):
select pg_temp.oracle_mismatch();
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', 'd6400006-0000-4000-8000-000000000001', null, 7);
\echo -- J6 gw overall ranking written => J6 published, J7 still held:
select pg_temp.oracle_mismatch();
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, null, 7);
select pg_temp.oracle_mismatch();

\echo == S7 release J7 too: table must be cleared or unused
insert into app_private.fantasy_publication_state(gameweek_id, released_at, last_outcome) values ('d6400007-0000-4000-8000-000000000001', now(), 'released');
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', 'd6400007-0000-4000-8000-000000000001', null, 8);
select 'any_held=' || app_private.fantasy_any_held() || ' shown_rows=' || (select count(*) from app_private.fantasy_shown_rankings);

\echo == S8 stale rows left behind? Then a third journée goes held before any ranking write
select 'shown rows now ' || count(*) from app_private.fantasy_shown_rankings;
