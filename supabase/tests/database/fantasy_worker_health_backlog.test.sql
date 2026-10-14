-- Regression suite for 20261014180100: the `fantasy_worker` health check watches the
-- same backlog the scheduler wakes the worker for (audit finding ASTRA-02).
--
--   1 every state in the scheduler's backlog is held against a worker with no ok pass
--   2 the states that are not backlog stay quiet (open before its deadline, an unconfirmed
--     deadline, successor opened, postwork done, a season that has not started)
--   3 a recent ok pass keeps each backlog state ok, and the thresholds are unchanged
--   4 the check and `fantasy_worker_work_pending()` agree, case by case
--
-- NOT RUN in the authoring session (no Docker): CI's database-quality job is the
-- authority. The fixtures follow fantasy_worker_schedule.test.sql; the unconfirmed-deadline
-- case adds two teams, one fixture and one assignment, which that file does not need.
begin;
select extensions.no_plan();

create function pg_temp.health() returns jsonb language sql as $$
  select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
  where c ->> 'name' = 'fantasy_worker'
$$;

-- A season with one gameweek whose status the cases change.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('c9000000-0000-4000-8000-000000000001', 'MA', 'MAR') on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('c9100000-0000-4000-8000-000000000001', 'worker-health-test', 'Worker Health Test', 'WHT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('c9200000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001',
  'Worker health season', current_date - 1, current_date + 100, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
select ('c9300000-0000-4000-8000-00000000000' || n)::uuid, 'c9200000-0000-4000-8000-000000000001', n, 'Round ' || n
from generate_series(1, 2) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('c9600000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001',
  'worker-health-test', 'Worker Health Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('c9630000-0000-4000-8000-000000000001', 'c9600000-0000-4000-8000-000000000001',
  'c9200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Worker health season', 'active', current_date - 1, current_date + 100);
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('c9' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'worker-health-club-' || i, 'Worker Health Club ' || i, 'WH' || i, 'W' || i,
  'c9000000-0000-4000-8000-000000000001'
from generate_series(1, 2) i;

-- GW1 in the status `p_status` with its deadline `p_deadline` from now; GW2 (the successor) is
-- present when `p_successor`; `p_closed` marks it closed early (its postwork is then owed).
create function pg_temp.gameweek(p_status text, p_deadline interval default interval '-1 hour',
  p_successor boolean default false, p_closed boolean default false) returns void language plpgsql as $$
begin
  delete from app.fantasy_fixture_assignments where fantasy_season_id = 'c9630000-0000-4000-8000-000000000001';
  delete from app_private.fantasy_gameweek_progressions where previous_gameweek_id = 'c9700000-0000-4000-8000-000000000001';
  delete from app_private.fantasy_gameweek_postwork where gameweek_id = 'c9700000-0000-4000-8000-000000000001';
  delete from app.fantasy_gameweeks where fantasy_season_id = 'c9630000-0000-4000-8000-000000000001';
  insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
    deadline_at, starts_at, ends_at, status, points_state, finalized_at, closed_at, closed_calculation_version,
    scoring_input_version)
  values ('c9700000-0000-4000-8000-000000000001', 'c9630000-0000-4000-8000-000000000001',
    'c9300000-0000-4000-8000-000000000001', 1, 'Round 1', statement_timestamp() + p_deadline,
    statement_timestamp() + p_deadline, statement_timestamp() + p_deadline + interval '3 days', p_status::app.fantasy_gameweek_status,
    (case when p_status = 'finalized' then 'final' else 'provisional' end)::app.fantasy_points_state,
    case when p_status = 'finalized' then statement_timestamp() else null end,
    case when p_closed then statement_timestamp() else null end, case when p_closed then 1 end, 1);
  if p_successor then
    insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
      deadline_at, starts_at, ends_at, status, points_state, scoring_input_version)
    values ('c9700000-0000-4000-8000-000000000002', 'c9630000-0000-4000-8000-000000000001',
      'c9300000-0000-4000-8000-000000000002', 2, 'Round 2', statement_timestamp() + interval '5 days',
      statement_timestamp() + interval '5 days', statement_timestamp() + interval '8 days', 'scheduled',
      'provisional', 0);
  end if;
end $$;

-- One counting fixture in GW1, kicking off at `p_kickoff` (a 00:00 UTC kickoff is a placeholder).
create function pg_temp.counting_fixture(p_kickoff timestamptz) returns void language plpgsql as $$
begin
  insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
    kickoff_at, status, provider_updated_at, source_sequence)
  values ('c9800000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001',
    'c9200000-0000-4000-8000-000000000001', 'c9300000-0000-4000-8000-000000000001',
    'c9000001-0000-4000-8000-000000000001', 'c9000002-0000-4000-8000-000000000001',
    p_kickoff, 'not_started'::app.fixture_status, statement_timestamp(), 1)
  on conflict (id) do update set kickoff_at = excluded.kickoff_at;
  insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id,
    original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version)
  values ('c9630000-0000-4000-8000-000000000001', 'c9800000-0000-4000-8000-000000000001',
    'c9700000-0000-4000-8000-000000000001', 'c9700000-0000-4000-8000-000000000001',
    p_kickoff, p_kickoff, 1);
end $$;

-- The worker is on, has never had an ok pass, and the work has been waiting 40 minutes.
select app_private.fantasy_automation_configure(true);
select app_private.fantasy_worker_configure(true, 10);
delete from app_private.fantasy_worker_runs;
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '40 minutes',
    pending_since = statement_timestamp() - interval '40 minutes';

-- 1 the scheduler's backlog is held against a worker with no ok pass ----------------
select pg_temp.gameweek('locked');
select extensions.is(pg_temp.health() ->> 'status', 'warn', '1.1 locked, 40 minutes without an ok pass: warn');
select extensions.alike(pg_temp.health() ->> 'detail', 'no ok pass for 40 min while GW1 is locked%', '1.2 naming the gameweek and its state');
select extensions.is(app_private.fantasy_worker_work_pending(), true, '1.3 the scheduler agrees');

select pg_temp.gameweek('open', interval '-1 hour');
select extensions.is(pg_temp.health() ->> 'status', 'warn', '1.4 open past a confirmed deadline: warn');
select extensions.alike(pg_temp.health() ->> 'detail', '%while GW1 is open past its deadline%', '1.5 and it says why');
select extensions.is(app_private.fantasy_worker_work_pending(), true, '1.6 the scheduler agrees');

select pg_temp.gameweek('open', interval '-1 hour');
select pg_temp.counting_fixture(date_trunc('hour', statement_timestamp()) + interval '17 minutes');
select extensions.is(pg_temp.health() ->> 'status', 'warn', '1.7 open past a deadline whose fixtures all have real kickoffs: warn');

select pg_temp.gameweek('finalized', interval '-5 days', true);
select extensions.is(pg_temp.health() ->> 'status', 'warn', '1.8 finalized, successor staged but not opened: warn');
select extensions.alike(pg_temp.health() ->> 'detail', '%while GW1 is finalized with work still owed%', '1.9 and it says why');
select extensions.is(app_private.fantasy_worker_work_pending(), true, '1.10 the scheduler agrees');

select pg_temp.gameweek('finalized', interval '-5 days', false, true);
select extensions.is(pg_temp.health() ->> 'status', 'warn', '1.11 finalized, closed early, postwork owed: warn');
select extensions.is(app_private.fantasy_worker_work_pending(), true, '1.12 the scheduler agrees');

-- The three states the check always covered still do.
select pg_temp.gameweek('live');
select extensions.is(pg_temp.health() ->> 'status', 'warn', '1.13 live: warn');
select pg_temp.gameweek('provisional');
select extensions.is(pg_temp.health() ->> 'status', 'warn', '1.14 provisional: warn');
select pg_temp.gameweek('finalizing');
select extensions.is(pg_temp.health() ->> 'status', 'warn', '1.15 finalizing: warn');

-- 2 what is not backlog stays quiet ---------------------------------------------------
select pg_temp.gameweek('open', interval '2 hours');
select extensions.is(pg_temp.health() ->> 'status', 'ok', '2.1 open before its deadline: ok');
select extensions.alike(pg_temp.health() ->> 'detail', 'no gameweek has work for the worker', '2.2 and it says so');
select extensions.is(app_private.fantasy_worker_work_pending(), false, '2.3 the scheduler agrees');

-- The worker leaves an open round alone while its deadline is unconfirmed
-- (selectWorkerTargets: deadline_unconfirmed), so the check does not hold that against it.
select pg_temp.gameweek('open', interval '-1 hour');
select pg_temp.counting_fixture(date_trunc('day', statement_timestamp() at time zone 'UTC') at time zone 'UTC');
select extensions.is(pg_temp.health() ->> 'status', 'ok', '2.4 open past a deadline built on a placeholder kickoff: ok');
select extensions.is(app_private.fantasy_worker_work_pending(), true,
  '2.5 (the scheduler still wakes the worker for it; the worker then skips the round)');

select pg_temp.gameweek('scheduled', interval '3 days');
select extensions.is(pg_temp.health() ->> 'status', 'ok', '2.6 scheduled: ok');

select pg_temp.gameweek('finalized', interval '-5 days');
select extensions.is(pg_temp.health() ->> 'status', 'ok', '2.7 finalized with no successor: ok');

select pg_temp.gameweek('finalized', interval '-5 days', true);
insert into app_private.fantasy_gameweek_progressions (previous_gameweek_id, next_gameweek_id, calculation_version, opened_at)
values ('c9700000-0000-4000-8000-000000000001', 'c9700000-0000-4000-8000-000000000002', 1, statement_timestamp());
select extensions.is(pg_temp.health() ->> 'status', 'ok', '2.8 successor opened: ok');

select pg_temp.gameweek('finalized', interval '-5 days', false, true);
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version, price_source_version,
  price_player_ids, prices_completed_at, completed_at)
values ('c9700000-0000-4000-8000-000000000001', 1, 1, '{}', statement_timestamp(), statement_timestamp());
select extensions.is(pg_temp.health() ->> 'status', 'ok', '2.9 postwork done: ok');

update app.fantasy_seasons set status = 'planned' where id = 'c9630000-0000-4000-8000-000000000001';
select pg_temp.gameweek('locked');
select extensions.is(pg_temp.health() ->> 'status', 'ok', '2.10 a season that has not started: ok');
update app.fantasy_seasons set status = 'active' where id = 'c9630000-0000-4000-8000-000000000001';

-- 3 an ok pass keeps the backlog states ok; the thresholds did not move --------------
insert into app_private.fantasy_worker_runs (started_at, finished_at, holder, outcome)
values (statement_timestamp() - interval '8 minutes', statement_timestamp() - interval '8 minutes', 'edge:ok', 'ok');
select pg_temp.gameweek('locked');
select extensions.is(pg_temp.health() ->> 'status', 'ok', '3.1 locked with an ok pass 8 minutes ago: ok');
select pg_temp.gameweek('open', interval '-1 hour');
select extensions.is(pg_temp.health() ->> 'status', 'ok', '3.2 open past its deadline with an ok pass 8 minutes ago: ok');
select pg_temp.gameweek('finalized', interval '-5 days', true);
select extensions.is(pg_temp.health() ->> 'status', 'ok', '3.3 finalized with work owed and an ok pass 8 minutes ago: ok');

delete from app_private.fantasy_worker_runs;
select pg_temp.gameweek('locked');
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '29 minutes', pending_since = statement_timestamp() - interval '29 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'ok', '3.4 locked, 29 minutes: ok');
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '91 minutes', pending_since = statement_timestamp() - interval '91 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'fail', '3.5 locked, 91 minutes: fail');

-- A switched-off worker is still ok whatever the backlog (the GitHub schedule owns it then).
select app_private.fantasy_worker_configure(false);
select extensions.is(pg_temp.health() ->> 'status', 'ok', '3.6 switched off: ok');
select extensions.alike(pg_temp.health() ->> 'detail', '%GitHub orchestrator%', '3.7 and it says who schedules the lifecycle');

select * from extensions.finish();
rollback;
