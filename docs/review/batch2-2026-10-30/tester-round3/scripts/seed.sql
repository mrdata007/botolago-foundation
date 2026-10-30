-- Tester seed: :teams teams, 20 leagues, Journées 1-5 finalized, Journées 6-7 present but empty.
-- Scores come from a small range so many teams tie; every 7th team took hits; every 5th has transfer batches.
-- Rankings are written by the real writer (service_recalculate_fantasy_rankings).
begin;
set local session_replication_role = replica;
set local search_path = public, extensions;

insert into app.countries (id, iso_alpha2, iso_alpha3) values ('d0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('d1000000-0000-4000-8000-000000000001', 'perf', 'Perf', 'PF', 'league', 'd0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', '2089/90', '2089-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
select ('d3' || lpad(g::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'd2000000-0000-4000-8000-000000000001', g, 'Gameweek ' || g, 'active'
from generate_series(1, 7) g;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('d6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'perf', 'Perf', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values ('d6300000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000100', '2089/90', 'active', '2089-08-01', '2090-06-30');
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status, finalized_at, points_state, closed_at, closed_calculation_version)
select('d64' || lpad(g::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid, 'd6300000-0000-4000-8000-000000000001',
  ('d3' || lpad(g::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  g, 'Gameweek ' || g, ('2089-09-' || lpad((g*3)::text,2,'0') || 'T11:00:00Z')::timestamptz, ('2089-09-' || lpad((g*3)::text,2,'0') || 'T12:00:00Z')::timestamptz,
  ('2089-09-' || lpad((g*3+2)::text,2,'0') || 'T12:00:00Z')::timestamptz,
  case when g <= 5 then 'finalized' else 'provisional' end::app.fantasy_gameweek_status,
  case when g <= 5 then ('2089-09-' || lpad((g*3+2)::text,2,'0') || 'T20:00:00Z')::timestamptz end,
  case when g <= 5 then 'final' else 'provisional' end::app.fantasy_points_state,
  ('2089-09-' || lpad((g*3)::text,2,'0') || 'T11:00:00Z')::timestamptz, 1
from generate_series(1, 7) g;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'perf' || i || '@example.test', now(), now()
from generate_series(1, :teams + 20) i;
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers, status, created_at)
select ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'd6300000-0000-4000-8000-000000000001', 'd6400006-0000-4000-8000-000000000001', 'Team ' || i, 0, 100, 1, 'active',
  '2089-09-01'::timestamptz + ((i % 50) || ' seconds')::interval
from generate_series(1, :teams) i;
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility, member_count, active)
select ('da' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'd6300000-0000-4000-8000-000000000001',
  ('d8' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'League ' || k, 'public', :teams / 20, true
from generate_series(1, 20) k;
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role, status)
select ('da' || lpad(to_hex(1 + (i % 20)), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'member', 'active'
from generate_series(1, :teams) i;

-- Journées 1-5, final.
insert into app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points, transfer_hit, provisional_score, final_score, state, calculation_version, finalized_at)
select ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('d64' || lpad(g::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid,
  30, 0, 0, case when (i + g) % 7 = 0 then 4 else 0 end,
  30 + ((i * g * 7) % 9), 30 + ((i * g * 7) % 9) - case when (i + g) % 7 = 0 then 4 else 0 end, 'final', 1,
  ('2089-09-' || lpad((g*3+2)::text,2,'0') || 'T20:00:00Z')::timestamptz
from generate_series(1, :teams) i cross join generate_series(1, 5) g;
-- Transfer batches for every 5th team.
insert into app.fantasy_transfer_batches (fantasy_team_id, gameweek_id, idempotency_key, base_team_version, resulting_team_version, transfers_count, free_transfers_before, free_transfers_used, point_hit, bank_before, bank_after)
select ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'd6400002-0000-4000-8000-000000000001', gen_random_uuid(), 1, 2, 1 + (i % 3), 1, 1, 0, 0, 0
from generate_series(1, :teams) i where i % 5 = 0;
commit;

-- Rankings through the real writer, as the worker does.
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, null, 1);
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, ('da' || lpad(to_hex(k), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 1)
from generate_series(1, 20) k;
select api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', ('d64' || lpad(g::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid, null, 1)
from generate_series(1, 5) g;

-- Two hidden managers.
insert into app_private.public_ranking_exclusions (user_id, reason, created_by_principal_id)
select ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'perf scratch', gen_random_uuid() from generate_series(1, 3) i;
vacuum analyze;
