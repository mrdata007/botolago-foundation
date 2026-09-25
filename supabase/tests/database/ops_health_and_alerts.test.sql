-- Regression suite for 20260924200200_ops_health_and_alerts.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Access.
-- ---------------------------------------------------------------------------
select extensions.ok(has_function_privilege('service_role', 'api.service_ops_health()', 'execute'),
  'the watchdog (service_role) can read health');
select extensions.ok(not has_function_privilege('anon', 'api.service_ops_health()', 'execute')
  and not has_function_privilege('authenticated', 'api.service_ops_health()', 'execute'),
  'visitors and users cannot');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.service_ops_health()$$, 'PT403', 'forbidden',
  'the function refuses a non-service caller on its own');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(api.service_ops_health() ? 'checks', 'a service caller gets the checks');
select extensions.is(current_setting('request.jwt.claims'), '{"role":"service_role"}',
  'reading health leaves the caller''s claims as they were');
select extensions.ok(not has_function_privilege('service_role',
  'app_private.ops_alert_configure(boolean)', 'execute'),
  'only the database owner can switch alerts');
select extensions.is((select schedule from cron.job where jobname = 'ops-alert-tick'), '*/5 * * * *',
  'the alert tick runs every five minutes');

-- Every check this suite does not exercise is pinned healthy, so the status
-- below is decided only by the conditions it creates.
insert into app_private.news_schedule_heartbeat (id, last_run_at, last_outcome)
values (true, now(), 'idle')
on conflict (id) do update set last_run_at = excluded.last_run_at;
delete from cron.job_run_details where status = 'failed';
-- The sitemap snapshot (20260926003050): refreshed now, whatever pg_cron has
-- been doing since the database was reset.
do $$ begin perform app_private.news_sitemap_refresh(true); end $$;

-- ---------------------------------------------------------------------------
-- The 2026-09-24 situation: a gameweek open 45 minutes past its deadline.
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('c0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('c1000000-0000-4000-8000-000000000001', 'ops-test', 'Ops Test', 'OPS', 'league',
  'c0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
  'Ops season', current_date - 1, current_date + 100, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
values ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 1, 'Round 1');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('c6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
  'ops-test', 'Ops Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('c6300000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Ops season', 'registration_open', current_date - 1, current_date + 100);
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status)
values ('c7000000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001', 1, 'Round 1', now() - interval '45 minutes',
  now() + interval '1 hour', now() + interval '6 hours', 'open');

select set_config('test.health', api.service_ops_health()::text, true);
select extensions.is(current_setting('test.health')::jsonb ->> 'status', 'fail',
  'an open gameweek 45 minutes past its deadline makes production unhealthy');
select extensions.ok(
  (select c ->> 'detail' like 'GW1 deadline passed 45 min ago%'
   from jsonb_array_elements(current_setting('test.health')::jsonb -> 'checks') c
   where c ->> 'name' = 'fantasy_gameweek_lock'),
  'and says which gameweek and how late');

-- A failed scheduled job in the last hour.
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status,
  return_message, start_time, end_time)
select jobid, 999999, 1, current_database(), 'postgres', 'select 1', 'failed', 'job startup timeout',
  now() - interval '5 minutes', now() - interval '5 minutes'
from cron.job where jobname = 'news-publish-due-editions';
select extensions.ok(
  (select c ->> 'status' = 'fail' and c ->> 'detail' like '%news-publish-due-editions x1%'
   from jsonb_array_elements(api.service_ops_health() -> 'checks') c where c ->> 'name' = 'cron_jobs'),
  'a failed cron run in the last hour is reported by name');

-- ---------------------------------------------------------------------------
-- The webhook path. Nothing is sent from a test: pg_net only queues the
-- request, and the rollback at the end discards the queue row.
-- ---------------------------------------------------------------------------
select extensions.is(app_private.ops_alert_tick(), 'disabled', 'alerts ship switched off');
select extensions.throws_ok($$select app_private.ops_alert_configure(true)$$, '22023',
  'ops_alert_channel_missing', 'they cannot be switched on without a channel (webhook or email)');
select vault.create_secret('https://alerts.example.invalid/hook', 'botolago_ops_alert_webhook');
select app_private.ops_alert_configure(true);

select extensions.is(app_private.ops_alert_tick(), 'sent', 'a failure is sent');
select set_config('test.body', (select convert_from(body, 'utf8') from net.http_request_queue
  where url = 'https://alerts.example.invalid/hook' order by id desc limit 1), true);
select extensions.ok(current_setting('test.body')::jsonb ->> 'text' like '[BotolaGO production] FAIL at %',
  'the message names the environment, the status and the time');
select extensions.ok(current_setting('test.body')::jsonb ->> 'text' like '%fantasy_gameweek_lock [fail]: GW1 deadline passed%',
  'and each failing check with its reason');
select extensions.ok(current_setting('test.body')::jsonb ->> 'content' = current_setting('test.body')::jsonb ->> 'text',
  'Discord (content) and Slack (text) read the same message');
select extensions.ok(current_setting('test.body') not like '%@%' and current_setting('test.body') not ilike '%secret%',
  'no address or secret travels in an alert');

select extensions.is(app_private.ops_alert_tick(), 'quiet', 'the same failure is not repeated at once');
select extensions.is((select count(*)::integer from net.http_request_queue
  where url = 'https://alerts.example.invalid/hook'), 1, 'one message for one incident');

-- The incident is resolved.
update app.fantasy_gameweeks set status = 'locked' where id = 'c7000000-0000-4000-8000-000000000001';
delete from cron.job_run_details where runid = 999999;
select extensions.is(app_private.ops_alert_tick(), 'sent_recovery', 'recovery is announced once');
select extensions.ok((select convert_from(body, 'utf8')::jsonb ->> 'text' from net.http_request_queue
  where url = 'https://alerts.example.invalid/hook' order by id desc limit 1) like '[BotolaGO production] RECOVERED%',
  'as RECOVERED');
select extensions.is(app_private.ops_alert_tick(), 'quiet', 'and then stays quiet');

select * from extensions.finish();
rollback;
