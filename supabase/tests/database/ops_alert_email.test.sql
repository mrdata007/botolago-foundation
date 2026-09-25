-- Regression suite for 20260926001000_ops_alert_email: production alerts by
-- email to the owner. Nothing is sent from a test: pg_net only queues the
-- requests, and the rollback at the end discards the queue rows.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Access.
-- ---------------------------------------------------------------------------
select extensions.ok(has_function_privilege('service_role', 'api.service_ops_alert_email_target()', 'execute'),
  'the ops-alert-email function (service_role) can read the address');
select extensions.ok(not has_function_privilege('anon', 'api.service_ops_alert_email_target()', 'execute')
  and not has_function_privilege('authenticated', 'api.service_ops_alert_email_target()', 'execute'),
  'visitors and users cannot');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.service_ops_alert_email_target()$$, 'PT403', 'forbidden',
  'the function refuses a non-service caller on its own');
select set_config('request.jwt.claims', '', true);
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.ops_alert_configure_email(text)', 'execute')
  and not has_function_privilege('service_role', 'app_private.ops_alert_test()', 'execute')
  and not has_function_privilege('service_role', 'app_private.ops_alert_send(text, text)', 'execute'),
  'only the database owner sets the address, sends a test or sends at all');

-- ---------------------------------------------------------------------------
-- The owner's address.
-- ---------------------------------------------------------------------------
select extensions.throws_ok($$select app_private.ops_alert_configure_email('not an address')$$,
  '22023', 'ops_alert_email_invalid', 'a malformed address is refused');
select extensions.throws_ok($$select app_private.ops_alert_configure_email('a@b.c' || E'\n' || 'bcc: x@y.z')$$,
  '22023', 'ops_alert_email_invalid', 'so is one carrying a second line');
select extensions.throws_ok($$select app_private.ops_alert_test()$$, '22023', 'ops_alert_channel_missing',
  'a test needs a channel');
select app_private.ops_alert_configure_email('  owner@example.test ');
select extensions.is((select email_to from app_private.ops_alert_state), 'owner@example.test',
  'a valid address is stored, trimmed');
select extensions.ok((app_private.ops_alert_configure(true) ->> 'email')::boolean,
  'alerts switch on with email alone, no webhook');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_ops_alert_email_target(), 'owner@example.test',
  'the function reads the configured address');
select set_config('request.jwt.claims', '', true);

-- Where the email request goes: the functions URL the email setup stores.
update app_private.notification_email_settings
set functions_base_url = 'https://functions.example.invalid/functions/v1';
select extensions.ok(app_private.scheduler_token() ~ '^[0-9a-f]{64}$', 'the scheduler token exists');

-- ---------------------------------------------------------------------------
-- An incident: a failed scheduled job, every other check pinned healthy.
-- ---------------------------------------------------------------------------
insert into app_private.news_schedule_heartbeat (id, last_run_at, last_outcome)
values (true, now(), 'idle')
on conflict (id) do update set last_run_at = excluded.last_run_at;
delete from cron.job_run_details where status = 'failed';
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status,
  return_message, start_time, end_time)
select jobid, 999998, 1, current_database(), 'postgres', 'select 1', 'failed', 'job startup timeout',
  now() - interval '5 minutes', now() - interval '5 minutes'
from cron.job where jobname = 'news-publish-due-editions';

select extensions.is(app_private.ops_alert_tick(), 'sent', 'a failure is sent by email');
select set_config('test.request', (
  select jsonb_build_object('headers', headers, 'body', convert_from(body, 'utf8')::jsonb)::text
  from net.http_request_queue
  where url = 'https://functions.example.invalid/functions/v1/ops-alert-email'
  order by id desc limit 1), true);
select extensions.ok(current_setting('test.request', true) is not null,
  'to the ops-alert-email function');
select extensions.is(current_setting('test.request')::jsonb #>> '{headers,x-botolago-scheduler-token}',
  app_private.scheduler_token(), 'authenticated with the scheduler token');
select extensions.ok(current_setting('test.request')::jsonb #>> '{body,subject}' like '[BotolaGO] Production FAIL: %cron_jobs%',
  'the subject names the failing checks');
select extensions.ok(current_setting('test.request')::jsonb #>> '{body,text}' like '[BotolaGO production] FAIL at %'
  and current_setting('test.request')::jsonb #>> '{body,text}' like '%cron_jobs [fail]: %news-publish-due-editions x1%',
  'the text is the same message the webhook gets');
select extensions.ok(current_setting('test.request')::jsonb #>> '{body}' not like '%@%',
  'the address never travels in the request');
select extensions.ok((select last_email_request_id is not null from app_private.ops_alert_state),
  'the request is recorded');

select extensions.is(app_private.ops_alert_tick(), 'quiet', 'the same failure is not emailed again at once');
select extensions.is((select count(*)::integer from net.http_request_queue
  where url = 'https://functions.example.invalid/functions/v1/ops-alert-email'), 1,
  'one email for one incident');

-- ---------------------------------------------------------------------------
-- The delivery test leaves the incident state alone.
-- ---------------------------------------------------------------------------
select set_config('test.before', (select row_to_json(s)::text from (
  select last_status, last_signature, last_sent_at from app_private.ops_alert_state) s), true);
select set_config('test.sent', app_private.ops_alert_test()::text, true);
select extensions.ok(current_setting('test.sent')::jsonb ->> 'emailRequestId' is not null
  and current_setting('test.sent')::jsonb ->> 'webhookRequestId' is null,
  'a test goes out by email (no webhook configured)');
select extensions.ok((select convert_from(body, 'utf8')::jsonb ->> 'subject' = '[BotolaGO] Production alert TEST'
  from net.http_request_queue
  where id = (current_setting('test.sent')::jsonb ->> 'emailRequestId')::bigint),
  'marked TEST');
select extensions.is((select row_to_json(s)::text from (
  select last_status, last_signature, last_sent_at from app_private.ops_alert_state) s),
  current_setting('test.before'), 'and the alert state is untouched');

-- Both channels at once.
select vault.create_secret('https://alerts.example.invalid/hook', 'botolago_ops_alert_webhook');
select set_config('test.sent', app_private.ops_alert_test()::text, true);
select extensions.ok(current_setting('test.sent')::jsonb ->> 'emailRequestId' is not null
  and current_setting('test.sent')::jsonb ->> 'webhookRequestId' is not null,
  'with a webhook too, a test goes out through both');

-- Recovery reaches the inbox once.
delete from cron.job_run_details where runid = 999998;
select extensions.is(app_private.ops_alert_tick(), 'sent_recovery', 'recovery is announced');
select extensions.ok((select convert_from(body, 'utf8')::jsonb ->> 'subject' from net.http_request_queue
  where url = 'https://functions.example.invalid/functions/v1/ops-alert-email'
  order by id desc limit 1) = '[BotolaGO] Production RECOVERED',
  'by email as RECOVERED');

-- Without any channel the tick sends nothing.
delete from vault.secrets where name = 'botolago_ops_alert_webhook';
select app_private.ops_alert_configure_email(null);
select extensions.is(app_private.ops_alert_tick(), 'not_configured', 'no channel, nothing sent');

select * from extensions.finish();
rollback;
