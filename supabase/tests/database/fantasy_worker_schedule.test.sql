-- Regression suite for 20261013170000 (the Fantasy lifecycle worker's switch, lease,
-- run log, status and tick) and 20261013170100 (the `fantasy_worker` health check, whose
-- predicate 20261014180100 widens to the scheduler's backlog).
-- docs/backend/FANTASY_WORKER_SCHEDULE.md
--
--   1 shape and privileges
--   2 the tick: off, on, idle, busy, paced (nothing is sent: pg_net only queues the call)
--   3 what counts as work
--   4 the lease: one holder at a time, expiry, the Edge holder refused while off
--   5 the status the GitHub orchestrator reads
--   6 the run log
--   7 the health check's thresholds
-- NOT RUN against the real Supabase stack in the authoring session (no Docker): CI's
-- database-quality job is the authority.
begin;
select extensions.no_plan();

create function pg_temp.queued() returns integer language sql as $$
  select count(*)::integer from net.http_request_queue
  where url = 'https://functions.example.invalid/functions/v1/fantasy-lifecycle-worker'
$$;
create function pg_temp.health() returns jsonb language sql as $$
  select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
  where c ->> 'name' = 'fantasy_worker'
$$;

-- 1 shape and privileges ---------------------------------------------------
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.fantasy_worker_configure(boolean,integer)', 'execute')
  and not has_function_privilege('service_role', 'app_private.fantasy_worker_tick()', 'execute')
  and not has_function_privilege('authenticated', 'app_private.fantasy_worker_tick()', 'execute')
  and not has_function_privilege('anon', 'app_private.fantasy_worker_work_pending()', 'execute'),
  '1.1 only the database owner switches and ticks the worker');
select extensions.ok(
  has_function_privilege('service_role', 'api.service_fantasy_worker_lease_acquire(text,integer)', 'execute')
  and has_function_privilege('service_role', 'api.service_fantasy_worker_lease_extend(uuid,integer)', 'execute')
  and has_function_privilege('service_role', 'api.service_fantasy_worker_lease_release(uuid)', 'execute')
  and has_function_privilege('service_role', 'api.service_fantasy_worker_status()', 'execute')
  and has_function_privilege('service_role', 'api.service_fantasy_worker_record_run(jsonb)', 'execute'),
  '1.2 the service role calls the five service functions');
select extensions.ok(
  not has_function_privilege('authenticated', 'api.service_fantasy_worker_lease_acquire(text,integer)', 'execute')
  and not has_function_privilege('anon', 'api.service_fantasy_worker_status()', 'execute')
  and not has_function_privilege('authenticated', 'api.service_fantasy_worker_record_run(jsonb)', 'execute'),
  '1.3 visitors and signed-in users do not');
select extensions.ok(
  not has_table_privilege('service_role', 'app_private.fantasy_worker_lease', 'select')
  and not has_table_privilege('authenticated', 'app_private.fantasy_worker_runs', 'select')
  and (select relrowsecurity and relforcerowsecurity from pg_class
       where oid = 'app_private.fantasy_worker_lease'::regclass)
  and (select relrowsecurity and relforcerowsecurity from pg_class
       where oid = 'app_private.fantasy_worker_runs'::regclass)
  and (select relrowsecurity and relforcerowsecurity from pg_class
       where oid = 'app_private.fantasy_worker_dispatch'::regclass),
  '1.4 the lease token, the log and the bookkeeping are readable by nobody through the API');
select extensions.is(
  (select schedule || ' ' || command from cron.job where jobname = 'fantasy-worker-tick'),
  '*/10 * * * * select app_private.fantasy_worker_tick();',
  '1.5 pg_cron runs the tick every 10 minutes');
select extensions.is(
  (select lifecycle_worker_enabled from app_private.fantasy_automation_settings), false,
  '1.6 the worker ships switched off');

-- A season with one gameweek whose status the tests change.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('c9000000-0000-4000-8000-000000000001', 'MA', 'MAR') on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('c9100000-0000-4000-8000-000000000001', 'worker-test', 'Worker Test', 'WKT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('c9200000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001',
  'Worker season', current_date - 1, current_date + 100, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
select ('c9300000-0000-4000-8000-00000000000' || n)::uuid, 'c9200000-0000-4000-8000-000000000001', n, 'Round ' || n
from generate_series(1, 2) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('c9600000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001',
  'worker-test', 'Worker Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('c9630000-0000-4000-8000-000000000001', 'c9600000-0000-4000-8000-000000000001',
  'c9200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Worker season', 'active', current_date - 1, current_date + 100);

-- GW1 in the status `p_status` with its deadline `p_deadline` from now; GW2 (the successor) is
-- present when `p_successor`.
create function pg_temp.gameweek(p_status text, p_deadline interval default interval '-1 hour',
  p_successor boolean default false, p_closed boolean default false) returns void language plpgsql as $$
begin
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

-- 2 the tick ---------------------------------------------------------------
update app_private.notification_email_settings
set functions_base_url = null;
select extensions.is(app_private.fantasy_worker_tick(), 'disabled', '2.1 switched off: does nothing');
select extensions.is((select last_outcome from app_private.fantasy_worker_dispatch), 'disabled', '2.2 and says so');

select app_private.fantasy_automation_configure(true);
select extensions.is(app_private.fantasy_worker_tick(), 'disabled',
  '2.3 the Fantasy tick switch alone is not enough: the worker has its own');
select app_private.fantasy_worker_configure(true);
select app_private.fantasy_automation_configure(false);
select extensions.is(app_private.fantasy_worker_tick(), 'disabled', '2.4 nor is the worker switch alone, with the Fantasy tick paused');
select extensions.is(app_private.fantasy_worker_enabled(), false,
  '2.5 pausing with fantasy_automation_configure(false) pauses the worker too (AGENTS.md)');
select app_private.fantasy_automation_configure(true);
select extensions.is(app_private.fantasy_worker_enabled(), true, '2.6 and restoring it restores the worker');

select extensions.is(app_private.fantasy_worker_tick(), 'not_configured',
  '2.7 on, without functions_base_url: not configured, nothing called');
update app_private.notification_email_settings
set functions_base_url = 'https://functions.example.invalid/functions/v1';
select extensions.is(app_private.fantasy_worker_tick(), 'idle', '2.8 on, but no gameweek has work: idle');
select extensions.is(pg_temp.queued(), 0, '2.9 and nothing is called');

select pg_temp.gameweek('live');
select extensions.is(app_private.fantasy_worker_tick(), 'invoked', '2.10 a live gameweek: it calls at once');
select extensions.is(pg_temp.queued(), 1, '2.11 the Edge Function fantasy-lifecycle-worker, once');
select extensions.is(
  (select convert_from(body, 'utf8')::jsonb ->> 'job' from net.http_request_queue
   where url = 'https://functions.example.invalid/functions/v1/fantasy-lifecycle-worker'),
  'lifecycle', '2.12 for the lifecycle job');
select extensions.is(
  (select headers ->> 'x-botolago-scheduler-token' from net.http_request_queue
   where url = 'https://functions.example.invalid/functions/v1/fantasy-lifecycle-worker'),
  app_private.scheduler_token(), '2.13 with the scheduler token');
select extensions.ok((select pending_since > statement_timestamp() - interval '1 minute'
  from app_private.fantasy_worker_dispatch), '2.14 staleness counts from when the work appeared');
select extensions.ok((select counting_from > statement_timestamp() - interval '1 minute'
  from app_private.fantasy_worker_dispatch), '2.15 and from when it was switched on');

select extensions.is(app_private.fantasy_worker_tick(), 'waiting', '2.16 not again within the 10 minutes');
update app_private.fantasy_worker_dispatch set last_invoked_at = statement_timestamp() - interval '7 minutes';
select extensions.is(app_private.fantasy_worker_tick(), 'waiting', '2.17 nor at 7 minutes');
-- A longer interval is honoured, and refused outside 10 to 120.
select app_private.fantasy_worker_configure(true, 30);
update app_private.fantasy_worker_dispatch set last_invoked_at = statement_timestamp() - interval '27 minutes';
select extensions.is(app_private.fantasy_worker_tick(), 'waiting', '2.17b with a 30 minute interval, 27 minutes is too soon');
update app_private.fantasy_worker_dispatch set last_invoked_at = statement_timestamp() - interval '29 minutes';
select extensions.is(app_private.fantasy_worker_tick(), 'invoked', '2.17c and 29 minutes is not');
select extensions.is(pg_temp.queued(), 2, '2.17d the second call');
select extensions.throws_ok($$select app_private.fantasy_worker_configure(true, 5)$$, '22023',
  'fantasy_worker_setting_required', '2.17e an interval under 10 minutes is refused');
select app_private.fantasy_worker_configure(true, 10);
update app_private.fantasy_worker_dispatch set last_invoked_at = statement_timestamp() - interval '9 minutes';

-- A pass holds the lease: the function is not woken just to be turned away.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_fantasy_worker_lease_acquire('github:42', 420);
select extensions.is(app_private.fantasy_worker_tick(), 'busy', '2.18 a lease is held: busy');
select extensions.is(pg_temp.queued(), 2, '2.19 and the function is not called');
update app_private.fantasy_worker_lease set expires_at = statement_timestamp() - interval '1 second';
select extensions.is(app_private.fantasy_worker_tick(), 'invoked', '2.20 an expired lease does not block the tick');
select extensions.is(pg_temp.queued(), 3, '2.21 the third call');

select pg_temp.gameweek('scheduled', interval '3 days');
select extensions.is(app_private.fantasy_worker_tick(), 'idle', '2.22 work gone: idle again');
select extensions.is((select pending_since from app_private.fantasy_worker_dispatch), null,
  '2.23 and the next piece of work counts from its own start');

-- 3 what counts as work (mirrors the orchestrator's selectWorkerTargets) ----
select pg_temp.gameweek('open', interval '-1 hour');
select extensions.is(app_private.fantasy_worker_work_pending(), true, '3.1 open past its deadline');
select pg_temp.gameweek('open', interval '2 hours');
select extensions.is(app_private.fantasy_worker_work_pending(), false, '3.2 open before its deadline: no');
select pg_temp.gameweek('scheduled', interval '2 days');
select extensions.is(app_private.fantasy_worker_work_pending(), false, '3.3 scheduled: no');
select pg_temp.gameweek('locked');
select extensions.is(app_private.fantasy_worker_work_pending(), true, '3.4 locked: yes');
select pg_temp.gameweek('live');
select extensions.is(app_private.fantasy_worker_work_pending(), true, '3.4b live: yes');
select pg_temp.gameweek('provisional');
select extensions.is(app_private.fantasy_worker_work_pending(), true, '3.4c provisional: yes');
select pg_temp.gameweek('finalizing');
select extensions.is(app_private.fantasy_worker_work_pending(), true, '3.4d finalizing: yes');
select pg_temp.gameweek('finalized', interval '-5 days');
select extensions.is(app_private.fantasy_worker_work_pending(), false, '3.5 finalized with no successor: no');
select pg_temp.gameweek('finalized', interval '-5 days', true);
select extensions.is(app_private.fantasy_worker_work_pending(), true, '3.6 finalized, successor staged but not opened: yes');
insert into app_private.fantasy_gameweek_progressions (previous_gameweek_id, next_gameweek_id, calculation_version, opened_at)
values ('c9700000-0000-4000-8000-000000000001', 'c9700000-0000-4000-8000-000000000002', 1, statement_timestamp());
select extensions.is(app_private.fantasy_worker_work_pending(), false, '3.7 successor opened: no');
select pg_temp.gameweek('finalized', interval '-5 days', false, true);
select extensions.is(app_private.fantasy_worker_work_pending(), true, '3.8 closed early, postwork still owed: yes');
insert into app_private.fantasy_gameweek_postwork (gameweek_id, calculation_version, price_source_version,
  price_player_ids, prices_completed_at, completed_at)
values ('c9700000-0000-4000-8000-000000000001', 1, 1, '{}', statement_timestamp(), statement_timestamp());
select extensions.is(app_private.fantasy_worker_work_pending(), false, '3.9 postwork done: no');
update app.fantasy_seasons set status = 'planned' where id = 'c9630000-0000-4000-8000-000000000001';
select pg_temp.gameweek('live');
select extensions.is(app_private.fantasy_worker_work_pending(), false, '3.10 a season that has not started: no');
update app.fantasy_seasons set status = 'active' where id = 'c9630000-0000-4000-8000-000000000001';

-- 4 the lease ----------------------------------------------------------------
update app_private.fantasy_worker_lease set token = null, released_at = null, expires_at = null, holder = null;
select app_private.fantasy_worker_configure(false);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_fantasy_worker_lease_acquire('edge:abc', 420) ->> 'reason', 'disabled',
  '4.1 the Edge holder is refused while the worker is off');
select extensions.is((api.service_fantasy_worker_lease_acquire('manual:7', 420) ->> 'acquired')::boolean, true,
  '4.2 the owner''s own runs are never refused');
select extensions.is(api.service_fantasy_worker_lease_acquire('github:8', 420) ->> 'reason', 'held',
  '4.3 a second holder is turned away');
select extensions.is(api.service_fantasy_worker_lease_acquire('github:8', 420) ->> 'holder', 'manual:7',
  '4.4 and told who holds it');
select extensions.ok(api.service_fantasy_worker_lease_acquire('github:8', 420) -> 'token' is null,
  '4.5 without the token');
update app_private.fantasy_worker_lease set expires_at = statement_timestamp() - interval '1 second';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temp table lease_two as select api.service_fantasy_worker_lease_acquire('github:8', 60) as lease;
select extensions.is((select (lease ->> 'acquired')::boolean from lease_two), true,
  '4.6 an expired lease is taken over (a dead holder frees it)');
select extensions.is(
  (api.service_fantasy_worker_lease_extend('00000000-0000-4000-8000-000000000999', 60) ->> 'extended')::boolean,
  false, '4.7 a stranger cannot extend it');
select extensions.is(
  (api.service_fantasy_worker_lease_extend((select (lease ->> 'token')::uuid from lease_two), 600) ->> 'extended')::boolean,
  true, '4.8 the holder can');
select extensions.ok(
  (select expires_at > statement_timestamp() + interval '9 minutes' from app_private.fantasy_worker_lease),
  '4.9 and the expiry moves out');
select extensions.is(
  (api.service_fantasy_worker_lease_release('00000000-0000-4000-8000-000000000999') ->> 'released')::boolean,
  false, '4.10 a stranger cannot release it');
select extensions.is(
  (api.service_fantasy_worker_lease_release((select (lease ->> 'token')::uuid from lease_two)) ->> 'released')::boolean,
  true, '4.11 the holder can');
select extensions.is(
  (api.service_fantasy_worker_lease_extend((select (lease ->> 'token')::uuid from lease_two), 60) ->> 'extended')::boolean,
  false, '4.12 a released lease cannot be extended');
select extensions.is((api.service_fantasy_worker_lease_acquire('github:9', 60) ->> 'acquired')::boolean, true,
  '4.13 and is free for the next holder');
select extensions.throws_ok($$select api.service_fantasy_worker_lease_acquire('somebody', 60)$$, '22023',
  'fantasy_worker_lease_invalid', '4.14 a holder must be edge:, github: or manual:');
select extensions.throws_ok($$select api.service_fantasy_worker_lease_acquire('edge:x', 5)$$, '22023',
  'fantasy_worker_lease_invalid', '4.15 and the lease lasts 30 to 900 seconds');
update app_private.fantasy_worker_lease set token = null, released_at = null, expires_at = null, holder = null;
select app_private.fantasy_worker_configure(true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is((api.service_fantasy_worker_lease_acquire('edge:abc', 420) ->> 'acquired')::boolean, true,
  '4.16 switched on, the Edge holder gets the lease');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.service_fantasy_worker_lease_acquire('edge:abc', 60)$$, 'PT403', 'forbidden',
  '4.17 a signed-in user cannot call the lease functions');
select extensions.throws_ok($$select api.service_fantasy_worker_status()$$, 'PT403', 'forbidden',
  '4.18 nor read the status');
select extensions.throws_ok($$select api.service_fantasy_worker_record_run('{}'::jsonb)$$, 'PT403', 'forbidden',
  '4.19 nor write the log');

-- 5 the status the orchestrator reads ------------------------------------------
update app_private.fantasy_worker_lease set token = null, released_at = null, expires_at = null, holder = null;
delete from app_private.fantasy_worker_runs;
select pg_temp.gameweek('live');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_fantasy_worker_status() -> 'enabled', 'true'::jsonb, '5.1 on');
select extensions.is(api.service_fantasy_worker_status() -> 'workPending', 'true'::jsonb, '5.2 with work');
select extensions.is(api.service_fantasy_worker_status() -> 'databaseWorkerActive', 'false'::jsonb,
  '5.3 but not "keeping up" until an ok pass: the orchestrator does the work itself');
insert into app_private.fantasy_worker_runs (started_at, finished_at, holder, outcome)
values (statement_timestamp() - interval '40 minutes', statement_timestamp() - interval '40 minutes', 'edge:a', 'ok'),
  (statement_timestamp() - interval '2 minutes', statement_timestamp() - interval '2 minutes', 'edge:b', 'partial');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_fantasy_worker_status() -> 'databaseWorkerActive', 'false'::jsonb,
  '5.4 an ok pass 40 minutes ago, and a partial one since, is not keeping up');
insert into app_private.fantasy_worker_runs (started_at, finished_at, holder, outcome)
values (statement_timestamp() - interval '12 minutes', statement_timestamp() - interval '12 minutes', 'edge:c', 'ok');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_fantasy_worker_status() -> 'databaseWorkerActive', 'true'::jsonb,
  '5.5 an ok pass 12 minutes ago: it is, and the scheduled orchestrator stands aside');
update app_private.notification_email_settings set functions_base_url = null;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_fantasy_worker_status() -> 'databaseWorkerActive', 'false'::jsonb,
  '5.6 not without a functions URL to be woken by');
update app_private.notification_email_settings set functions_base_url = 'https://functions.example.invalid/functions/v1';
select pg_temp.gameweek('scheduled', interval '3 days');
delete from app_private.fantasy_worker_runs;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_fantasy_worker_status() -> 'databaseWorkerActive', 'true'::jsonb,
  '5.7 with nothing to do it is trivially keeping up');

-- 6 the run log ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(api.service_fantasy_worker_record_run(jsonb_build_object(
  'holder', 'edge:0a1b2c', 'outcome', 'ok', 'startedAt', statement_timestamp() - interval '3 seconds',
  'durationMs', 2500, 'gameweekId', 'c9700000-0000-4000-8000-000000000001', 'gameweekSequence', 1,
  'workerCode', 'football_not_final', 'calls', 7, 'detail', jsonb_build_object('gameweeks', jsonb_build_array()))) > 0,
  '6.1 a pass is logged');
select extensions.is(
  (select row(outcome, gameweek_sequence, worker_code, calls, duration_ms)::text from app_private.fantasy_worker_runs),
  '(ok,1,football_not_final,7,2500)', '6.2 with outcome, gameweek, worker code, calls and duration');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_fantasy_worker_record_run(jsonb_build_object('holder', 'edge:z', 'outcome', 'failed',
  'workerCode', 'Not A Code; drop table', 'gameweekId', 'not-a-uuid', 'calls', -5, 'durationMs', 'x',
  'detail', jsonb_build_object('blob', repeat('x', 20000))));
select extensions.is(
  (select row(worker_code, gameweek_id, calls, duration_ms, detail)::text from app_private.fantasy_worker_runs where holder = 'edge:z'),
  '(,,0,0,"{""truncated"": true}")', '6.3 junk is stored as nothing, and an oversized detail is cut');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok($$select api.service_fantasy_worker_record_run('{"holder":"edge:a","outcome":"great"}'::jsonb)$$,
  '22023', 'fantasy_worker_run_invalid', '6.4 an unknown outcome is refused');
select extensions.throws_ok($$select api.service_fantasy_worker_record_run('{"outcome":"ok"}'::jsonb)$$,
  '22023', 'fantasy_worker_run_invalid', '6.5 and so is a row without a holder');
update app_private.fantasy_worker_runs set finished_at = statement_timestamp() - interval '31 days' where holder = 'edge:z';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_fantasy_worker_record_run('{"holder":"edge:y","outcome":"lease_held"}'::jsonb);
select extensions.is((select count(*)::integer from app_private.fantasy_worker_runs where holder = 'edge:z'), 0,
  '6.6 rows older than 30 days are deleted by the next write');

-- 7 the health check -------------------------------------------------------------
select extensions.is((select c ->> 'name' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks')
  with ordinality t(c, o) order by o desc offset 1 limit 1), 'fantasy_worker', '7.1 retained immediately before the new collection health check');
delete from app_private.fantasy_worker_runs;
select app_private.fantasy_worker_configure(false);
select pg_temp.gameweek('live');
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '5 hours', pending_since = statement_timestamp() - interval '5 hours';
select extensions.is(pg_temp.health() ->> 'status', 'ok', '7.2 switched off: ok, whatever the age');
select extensions.alike(pg_temp.health() ->> 'detail', '%GitHub orchestrator%', '7.3 and it says who schedules the lifecycle');
select app_private.fantasy_worker_configure(true);
select extensions.is(pg_temp.health() ->> 'status', 'fail', '7.4 on, a live gameweek, no ok pass for 5 hours: fail');
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '29 minutes', pending_since = statement_timestamp() - interval '29 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'ok', '7.5 29 minutes: ok');
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '31 minutes', pending_since = statement_timestamp() - interval '31 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'warn', '7.6 31 minutes: warn');
select extensions.alike(pg_temp.health() ->> 'detail', 'no ok pass for 31 min while GW1 is live%', '7.7 naming the gameweek');
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '89 minutes', pending_since = statement_timestamp() - interval '89 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'warn', '7.8 89 minutes: still warn');
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '91 minutes', pending_since = statement_timestamp() - interval '91 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'fail', '7.9 91 minutes: fail');
insert into app_private.fantasy_worker_runs (started_at, finished_at, holder, outcome, worker_code)
values (statement_timestamp() - interval '1 minute', statement_timestamp() - interval '1 minute', 'edge:p', 'partial', 'fantasy_worker_time_limit');
select extensions.is(pg_temp.health() ->> 'status', 'fail', '7.10 a partial pass is not an ok pass');
select extensions.alike(pg_temp.health() ->> 'detail', '%partial (fantasy_worker_time_limit)%', '7.11 but the detail names it');
insert into app_private.fantasy_worker_runs (started_at, finished_at, holder, outcome)
values (statement_timestamp() - interval '8 minutes', statement_timestamp() - interval '8 minutes', 'edge:q', 'ok');
select extensions.is(pg_temp.health() ->> 'status', 'ok', '7.12 an ok pass 8 minutes ago: ok');
-- A longer pass interval stretches the limits (twice and four times the interval).
delete from app_private.fantasy_worker_runs;
select app_private.fantasy_worker_configure(true, 60);
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '95 minutes', pending_since = statement_timestamp() - interval '95 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'ok', '7.12b 60 minute interval, 95 minutes: still ok');
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '125 minutes', pending_since = statement_timestamp() - interval '125 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'warn', '7.12c 125 minutes: warn');
update app_private.fantasy_worker_dispatch
set counting_from = statement_timestamp() - interval '241 minutes', pending_since = statement_timestamp() - interval '241 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'fail', '7.12d 241 minutes: fail');
select app_private.fantasy_worker_configure(true, 10);
delete from app_private.fantasy_worker_runs;
select pg_temp.gameweek('provisional');
update app_private.fantasy_worker_dispatch set pending_since = statement_timestamp() - interval '40 minutes',
  counting_from = statement_timestamp() - interval '40 minutes';
select extensions.is(pg_temp.health() ->> 'status', 'warn', '7.13 provisional (closed or not) counts too');
-- 20261014180100: the check watches the scheduler's whole backlog, so a locked round
-- with no ok pass is held against the worker too (it was invisible before). The
-- other backlog states are in fantasy_worker_health_backlog.test.sql.
select pg_temp.gameweek('locked');
select extensions.is(pg_temp.health() ->> 'status', 'warn', '7.14 locked is work for the worker: 40 minutes without an ok pass warns');
select pg_temp.gameweek('finalized', interval '-5 days');
select extensions.is(pg_temp.health() ->> 'status', 'ok', '7.15 nothing to do: ok');
select extensions.alike(pg_temp.health() ->> 'detail', 'no gameweek has work for the worker', '7.16 and it says so');

select * from extensions.finish();
rollback;
