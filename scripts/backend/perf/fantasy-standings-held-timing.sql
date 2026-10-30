-- Timing of the Fantasy standings readers at realistic size, with and without a
-- held journée (publish-all-at-once, migrations 20261030100000 to 100300).
--
-- RUN ON A SCRATCH DATABASE ONLY. It seeds thousands of rows and is never to be
-- run against production or staging. Reproduce:
--
--   psql -v teams=5000 -v mode=before  -f scripts/backend/perf/fantasy-standings-held-timing.sql   (before the batch: main's migrations only)
--   psql -v teams=5000 -v mode=nothing -f ...    (the batch applied, no journée held)
--   psql -v teams=5000 -v mode=held    -f ...    (the batch applied, Journée 1 held with results already written)
--
-- Each run seeds its own data inside one transaction and rolls back. It prints
-- one line per reader: milliseconds for one page (fantasy_overall_standings and
-- fantasy_league_standings, 50 rows), fantasy_hub, and fantasy_hidden_ahead.
begin;
set local session_replication_role = replica;
set local search_path = public, extensions;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into app.countries (id, iso_alpha2, iso_alpha3) values ('d0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('d1000000-0000-4000-8000-000000000001', 'perf', 'Perf', 'PF', 'league', 'd0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', '2089/90', '2089-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 1, 'Gameweek 1', 'active');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('d6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'perf', 'Perf', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values ('d6300000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000100', '2089/90', 'active', '2089-08-01', '2090-06-30');
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status)
values ('d6400000-0000-4000-8000-000000000001', 'd6300000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
  1, 'Gameweek 1', '2090-01-01T11:00:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z', 'provisional');

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'perf' || i || '@example.test', now(), now()
from generate_series(1, :teams) i;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers, status, created_at)
select ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'd6300000-0000-4000-8000-000000000001', 'd6400000-0000-4000-8000-000000000001', 'Team ' || i, 0, 100, 1, 'active',
  '2089-09-01'::timestamptz + (i || ' seconds')::interval
from generate_series(1, :teams) i;

-- Twenty leagues; league k holds every 20th team.
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility, member_count, active)
select ('da' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'd6300000-0000-4000-8000-000000000001',
  ('d8' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'League ' || k, 'public', :teams / 20, true
from generate_series(1, 20) k;
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role, status)
select ('da' || lpad(to_hex(1 + (i % 20)), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'member', 'active'
from generate_series(1, :teams) i;

-- Journée 1 results and the overall, journée and league rankings (all include Journée 1's points).
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points, transfer_hit, provisional_score, calculation_version)
select ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'd6400000-0000-4000-8000-000000000001',
  50, 0, 0, 0, 40 + (i % 60), 1
from generate_series(1, :teams) i;
insert into app.fantasy_rankings (fantasy_season_id, gameweek_id, league_id, fantasy_team_id, rank, total_points, gameweek_points, transfer_hits, confirmed_transfers, calculation_version, calculated_at, team_created_at)
select 'd6300000-0000-4000-8000-000000000001'::uuid, gw, lg, t.team_id,
  row_number() over (partition by gw, lg order by 40 + (t.i % 60) desc, t.i), 40 + (t.i % 60), 40 + (t.i % 60), 0, 0, 1, now(), t.created
from (select i, ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid as team_id,
        '2089-09-01'::timestamptz + (i || ' seconds')::interval as created from generate_series(1, :teams) i) t
cross join lateral (values (null::uuid, null::uuid), ('d6400000-0000-4000-8000-000000000001'::uuid, null::uuid)) as b(gw, lg)
union all
select 'd6300000-0000-4000-8000-000000000001'::uuid, null::uuid, ('da' || lpad(to_hex(1 + (i % 20)), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  row_number() over (partition by i % 20 order by 40 + (i % 60) desc, i), 40 + (i % 60), 40 + (i % 60), 0, 0, 1, now(), now()
from generate_series(1, :teams) i;

-- Two hidden (excluded) managers, as in production.
insert into app_private.public_ranking_exclusions (user_id, reason, created_by_principal_id)
select ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'perf scratch', gen_random_uuid() from generate_series(1, 3) i;

-- The mode.
select set_config('perf.mode', :'mode', true);
do $mode$
begin
  if current_setting('perf.mode') in ('nothing', 'held') then
    insert into app_private.fantasy_api_rating_seasons (season_id, from_gameweek, owner_approval)
    values ('d6300000-0000-4000-8000-000000000001', 1, 'perf scratch');
    insert into app_private.fantasy_publication_settings (season_id, first_gameweek)
    values ('d6300000-0000-4000-8000-000000000001', case when current_setting('perf.mode') = 'held' then 1 else 1000 end);
    perform app_private.fantasy_refresh_shown_rankings();
  end if;
end
$mode$;
analyze app.fantasy_rankings;
analyze app.fantasy_team_gameweek_results;

create function pg_temp.ms(call text) returns numeric language plpgsql as $$
declare t0 timestamptz; best numeric := 1e12; t numeric;
begin
  for i in 1..3 loop
    t0 := clock_timestamp();
    execute call;
    t := extract(epoch from clock_timestamp() - t0) * 1000;
    best := least(best, t);
  end loop;
  return round(best, 1);
end $$;

select :'mode' as mode, :teams as teams,
  case when :'mode' = 'held' then 'held (Journée 1 unpublished, results written)' else :'mode' end as state;
select 'fantasy_overall_standings (50 rows)' as reader, pg_temp.ms($$select api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, null, null, 50)$$) as ms;
select 'fantasy_league_standings (50 rows)', pg_temp.ms($$select api.fantasy_league_standings('da000001-0000-4000-8000-000000000001', null, null, null, 50)$$);
select 'fantasy_hub', pg_temp.ms($$select api.fantasy_hub('fr')$$);
select 'fantasy_hidden_ahead (one call)', pg_temp.ms($$select app_private.fantasy_hidden_ahead('d6300000-0000-4000-8000-000000000001', null, null, 2500::bigint, false)$$);
rollback;
