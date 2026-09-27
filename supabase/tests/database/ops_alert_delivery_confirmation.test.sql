-- Regression suite for 20260926113000_ops_alert_delivery_confirmation: an
-- alert counts as sent only once its channel answers 2xx, and a channel that
-- did not is sent to again. Nothing is sent from a test: pg_net only queues
-- the requests, the answers below are written by hand into
-- net._http_response as pg_net would, and the rollback discards both.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Access.
-- ---------------------------------------------------------------------------
select extensions.ok(
  not has_function_privilege('service_role', 'app_private.ops_alert_send_to(text, text, text)', 'execute')
  and not has_function_privilege('service_role', 'app_private.ops_alert_delivery(bigint, timestamp with time zone)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.ops_alert_send_to(text, text, text)', 'execute')
  and not has_function_privilege('anon', 'app_private.ops_alert_delivery(bigint, timestamp with time zone)', 'execute'),
  'only the database owner sends or reads deliveries');
select extensions.ok(
  not has_table_privilege('service_role', 'app_private.ops_alert_channels', 'select')
  and not has_table_privilege('authenticated', 'app_private.ops_alert_channels', 'select'),
  'nor can anyone else read the channel state');
select extensions.is((select array_agg(channel order by channel) from app_private.ops_alert_channels),
  array['email', 'webhook'], 'one state per channel');

-- ---------------------------------------------------------------------------
-- What an answer means.
-- ---------------------------------------------------------------------------
create temporary table answers (id bigint, status_code integer, timed_out boolean) on commit drop;
insert into answers values (-101, 204, false), (-102, 200, null), (-103, 404, false),
  (-104, 503, false), (-105, null, true), (-106, null, false);
insert into net._http_response (id, status_code, timed_out, error_msg)
select id, status_code, timed_out, case when status_code is null then 'x' end from answers;
select extensions.is(
  (select array_agg(app_private.ops_alert_delivery(id, statement_timestamp()) order by id desc) from answers),
  array['delivered', 'delivered', 'http_404', 'http_503', 'timed_out', 'unreachable'],
  'a 2xx answer is delivered; any other answer, a timeout or an error is not');
select set_config('test.queued', net.http_post(url := 'https://queued.example.invalid/x')::text, true);
select extensions.is(app_private.ops_alert_delivery(current_setting('test.queued')::bigint,
    statement_timestamp() - interval '1 hour'), 'waiting',
  'a request still in the queue is waiting, however old');
select extensions.is(app_private.ops_alert_delivery(-999, statement_timestamp() - interval '1 minute'), 'waiting',
  'a request off the queue without an answer yet is waiting, for a while');
select extensions.is(app_private.ops_alert_delivery(-999, statement_timestamp() - interval '4 minutes'), 'no_answer',
  'and not delivered once 3 minutes have passed');

-- ---------------------------------------------------------------------------
-- Both channels on, an incident: a failed scheduled job, every other check
-- pinned healthy.
-- ---------------------------------------------------------------------------
update app_private.notification_email_settings
set functions_base_url = 'https://functions.example.invalid/functions/v1';
select app_private.ops_alert_configure_email('owner@example.test');
select vault.create_secret('https://alerts.example.invalid/hook', 'botolago_ops_alert_webhook');
select app_private.ops_alert_configure(true);

insert into app_private.news_schedule_heartbeat (id, last_run_at, last_outcome)
values (true, now(), 'idle')
on conflict (id) do update set last_run_at = excluded.last_run_at;
delete from cron.job_run_details where status = 'failed';
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status,
  return_message, start_time, end_time)
select jobid, 999996, 1, current_database(), 'postgres', 'select 1', 'failed', 'job startup timeout',
  now() - interval '5 minutes', now() - interval '5 minutes'
from cron.job where jobname = 'news-publish-due-editions';

create function pg_temp.sent(p_url text) returns integer language sql as $$
  select count(*)::integer from net.http_request_queue where url = p_url;
$$;
create function pg_temp.last_subject(p_url text) returns text language sql as $$
  select coalesce(convert_from(body, 'utf8')::jsonb ->> 'subject', convert_from(body, 'utf8')::jsonb ->> 'text')
  from net.http_request_queue where url = p_url order by id desc limit 1;
$$;
-- pg_net's answer to the message a channel is waiting on.
create function pg_temp.answer(p_channel text, p_status integer, p_timed_out boolean default false)
returns void language sql as $$
  insert into net._http_response (id, status_code, timed_out, error_msg)
  select pending_request_id, p_status, p_timed_out, case when p_status is null then 'error' end
  from app_private.ops_alert_channels where channel = p_channel;
$$;

select extensions.is(app_private.ops_alert_tick(), 'sent', 'the failure goes out');
select extensions.ok(pg_temp.sent('https://alerts.example.invalid/hook') = 1
  and pg_temp.sent('https://functions.example.invalid/functions/v1/ops-alert-email') = 1,
  'through both channels');
select extensions.ok((select bool_and(pending_request_id is not null and pending_status = 'fail'
    and delivered_status is null) from app_private.ops_alert_channels),
  'each waiting for its answer, nothing confirmed yet');
select extensions.is((select last_sent_at from app_private.ops_alert_state), null,
  'so nothing is recorded as sent');

select extensions.is(app_private.ops_alert_tick(), 'quiet',
  'while the answers are awaited, the same failure is not sent again');

-- The webhook answers 204, the email function 503 (no Resend key).
select pg_temp.answer('webhook', 204);
select pg_temp.answer('email', 503);
select extensions.is(app_private.ops_alert_tick(), 'sent', 'the email that failed is sent again at the next tick');
select extensions.is(pg_temp.sent('https://functions.example.invalid/functions/v1/ops-alert-email'), 2,
  'a second email');
select extensions.alike(pg_temp.last_subject('https://functions.example.invalid/functions/v1/ops-alert-email'),
  '[BotolaGO] Production FAIL: %cron_jobs%', 'with the same failure');
select extensions.is(pg_temp.sent('https://alerts.example.invalid/hook'), 1,
  'the webhook, which answered, is not repeated');
select extensions.is((select row(delivered_status, last_outcome, failures_in_a_row)::text
    from app_private.ops_alert_channels where channel = 'webhook'), '(fail,delivered,0)',
  'the webhook has confirmed the failure');
select extensions.is((select row(delivered_status, last_outcome, failures_in_a_row)::text
    from app_private.ops_alert_channels where channel = 'email'), '(,http_503,1)',
  'the email has not, and says why');
select extensions.ok((select last_sent_at is not null from app_private.ops_alert_state),
  'the confirmed webhook message is recorded as sent');

select pg_temp.answer('email', 200);
select extensions.is(app_private.ops_alert_tick(), 'quiet', 'once the email answers, nothing more is sent');
select extensions.is((select delivered_status from app_private.ops_alert_channels where channel = 'email'), 'fail',
  'and the email has confirmed the failure');

-- ---------------------------------------------------------------------------
-- A recovery that fails is not lost.
-- ---------------------------------------------------------------------------
delete from cron.job_run_details where runid = 999996;
select extensions.is(app_private.ops_alert_tick(), 'sent_recovery', 'recovery goes out');
select pg_temp.answer('webhook', null, true);
select pg_temp.answer('email', 200);
select extensions.is(app_private.ops_alert_tick(), 'sent_recovery',
  'the webhook''s RECOVERED timed out, so it is sent again');
select extensions.alike(pg_temp.last_subject('https://alerts.example.invalid/hook'),
  '[BotolaGO production] RECOVERED%', 'as RECOVERED');
select extensions.is(pg_temp.sent('https://alerts.example.invalid/hook'), 3, 'a third webhook message');
select extensions.is(pg_temp.sent('https://functions.example.invalid/functions/v1/ops-alert-email'), 3,
  'the email''s RECOVERED arrived and is not repeated');
select extensions.is((select row(delivered_status, last_outcome)::text
    from app_private.ops_alert_channels where channel = 'webhook'), '(fail,timed_out)',
  'the webhook still owes the recovery');

select pg_temp.answer('webhook', 204);
select extensions.is(app_private.ops_alert_tick(), 'quiet', 'once it arrives, the alerts go quiet');
select extensions.ok((select bool_and(delivered_status in ('ok', 'warn') and pending_request_id is null)
    from app_private.ops_alert_channels), 'both channels have confirmed the recovery');

-- ---------------------------------------------------------------------------
-- A failure whose message never arrived needs no recovery.
-- ---------------------------------------------------------------------------
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status,
  return_message, start_time, end_time)
select jobid, 999995, 1, current_database(), 'postgres', 'select 1', 'failed', 'job startup timeout',
  now() - interval '1 minute', now() - interval '1 minute'
from cron.job where jobname = 'news-publish-due-editions';
select extensions.is(app_private.ops_alert_tick(), 'sent', 'a new failure goes out');
-- pg_net lost both requests: off the queue, no answer, 4 minutes on.
delete from net.http_request_queue
where id in (select pending_request_id from app_private.ops_alert_channels);
update app_private.ops_alert_channels set pending_queued_at = pending_queued_at - interval '4 minutes';
delete from cron.job_run_details where runid = 999995;
select extensions.is(app_private.ops_alert_tick(), 'quiet',
  'it ended before any channel confirmed it, so no RECOVERED is sent');
select extensions.ok((select bool_and(delivered_status in ('ok', 'warn') and pending_request_id is null
    and last_outcome = 'no_answer') from app_private.ops_alert_channels),
  'both channels still stand at the recovery they confirmed');

-- ---------------------------------------------------------------------------
-- A channel switched off is not sent to, and the other goes on.
-- ---------------------------------------------------------------------------
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status,
  return_message, start_time, end_time)
select jobid, 999994, 1, current_database(), 'postgres', 'select 1', 'failed', 'job startup timeout',
  now() - interval '1 minute', now() - interval '1 minute'
from cron.job where jobname = 'news-publish-due-editions';
select app_private.ops_alert_configure_email(null);
select set_config('test.emails', pg_temp.sent('https://functions.example.invalid/functions/v1/ops-alert-email')::text, true);
select extensions.is(app_private.ops_alert_tick(), 'sent', 'the webhook alone sends the failure');
select extensions.is(pg_temp.sent('https://functions.example.invalid/functions/v1/ops-alert-email'),
  current_setting('test.emails')::integer, 'no email without an address');

select * from extensions.finish();
rollback;
