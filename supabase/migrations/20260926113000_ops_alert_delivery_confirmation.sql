-- Production alerts count as sent only once their channel has said so.
--
-- Audit 2026-09-26: app_private.ops_alert_tick() recorded an alert as sent the
-- moment pg_net queued it. pg_net sends later, in the background, and the tick
-- never looked at the answer. So a webhook that answered 404, or an email the
-- Edge Function ops-alert-email could not hand to Resend (it answers 502 or
-- 503), still counted as sent: the tick stayed quiet for repeat_after (1 h)
-- while the owner had heard nothing. A RECOVERED message that failed was
-- never sent again at all, because the state already read "ok".
--
--   * app_private.ops_alert_channels holds, for each channel (webhook,
--     email), what that channel has confirmed telling the owner
--     (delivered_*) and the message still waiting for its answer (pending_*).
--   * Every tick first reads the answer to each pending message in
--     net._http_response (app_private.ops_alert_delivery). A 2xx answer
--     confirms it. Any other answer, a timeout, or no answer 3 minutes after
--     it was queued and no longer in the queue fails it. A failed message is
--     forgotten, so the same tick decides again from what the channel last
--     confirmed and sends again: a channel that fails is tried every tick
--     (5 minutes) until it answers, a channel that works is not repeated.
--   * Channels are decided apart. A webhook that works does not stop a
--     failing email from being retried, and a broken webhook does not make
--     the email repeat.
--   * While a message waits for its answer, the tick decides as if it had
--     arrived, exactly as before, so an incident that changes meanwhile is
--     still sent at once.
--   * app_private.ops_alert_state keeps its columns and what the runbook
--     reads from them: last_status and last_signature are the health the
--     tick last saw, last_request_id and last_email_request_id the last
--     message queued on each channel. last_sent_at now moves only when a
--     channel confirms a message, to the time that message was queued.
--   * app_private.ops_alert_send() (the owner's ops_alert_test() uses it)
--     sends through app_private.ops_alert_send_to() per channel, unchanged
--     in what it sends and returns.

create table app_private.ops_alert_channels (
  channel text primary key,
  delivered_status text,
  delivered_signature text,
  delivered_at timestamptz,
  pending_request_id bigint,
  pending_status text,
  pending_signature text,
  pending_queued_at timestamptz,
  last_outcome text,
  last_outcome_at timestamptz,
  failures_in_a_row integer not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  constraint ops_alert_channels_channel_check check (channel in ('webhook', 'email')),
  constraint ops_alert_channels_status_check check (
    (delivered_status is null or delivered_status in ('ok', 'warn', 'fail'))
    and (pending_status is null or pending_status in ('ok', 'warn', 'fail'))
  ),
  constraint ops_alert_channels_pending_check check (
    (pending_request_id is null) = (pending_queued_at is null)
    and (pending_request_id is null) = (pending_status is null)
  ),
  constraint ops_alert_channels_failures_check check (failures_in_a_row >= 0)
);
-- Each channel starts from what the single state last recorded as sent, so
-- an incident open while this runs is neither announced twice nor dropped.
insert into app_private.ops_alert_channels (channel, delivered_status, delivered_signature, delivered_at)
select channel, s.last_status, s.last_signature, s.last_sent_at
from app_private.ops_alert_state s
cross join (values ('webhook'), ('email')) c(channel)
where s.id;
alter table app_private.ops_alert_channels enable row level security;
alter table app_private.ops_alert_channels force row level security;
revoke all on app_private.ops_alert_channels from public, anon, authenticated, service_role;
comment on table app_private.ops_alert_channels is
  'Per alert channel: the last message it confirmed (a 2xx answer in net._http_response) and the one waiting for an answer. Written by app_private.ops_alert_tick only.';

-- What became of one queued message: 'delivered', 'waiting', or why it failed
-- ('http_<code>', 'timed_out', 'unreachable', 'no_answer'). Only a category is
-- returned, never the answer's body or error text (they can repeat the URL).
create or replace function app_private.ops_alert_delivery(p_request_id bigint, p_queued_at timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.id is not null then
      case
        when coalesce(r.timed_out, false) then 'timed_out'
        when r.status_code between 200 and 299 then 'delivered'
        when r.status_code is not null then 'http_' || r.status_code
        else 'unreachable'
      end
    when exists (select 1 from net.http_request_queue q where q.id = p_request_id) then 'waiting'
    -- pg_net takes a request off the queue before it writes the answer; the
    -- email call may take up to its 60 s timeout.
    when p_queued_at > statement_timestamp() - interval '3 minutes' then 'waiting'
    else 'no_answer'
  end
  from (select p_request_id as id) wanted
  left join net._http_response r on r.id = wanted.id;
$$;
revoke all on function app_private.ops_alert_delivery(bigint, timestamptz) from public, anon, authenticated, service_role;

-- One message through one channel. Returns the pg_net request id, or null
-- when that channel is not configured.
create or replace function app_private.ops_alert_send_to(p_channel text, p_subject text, p_text text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook text;
begin
  if p_channel = 'webhook' then
    webhook := app_private.ops_alert_webhook();
    if webhook is null then
      return null;
    end if;
    return net.http_post(
      url := webhook,
      body := jsonb_build_object('text', p_text, 'content', p_text, 'message', p_text),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );
  elsif p_channel = 'email' then
    if not app_private.ops_alert_email_ready() then
      return null;
    end if;
    return app_private.invoke_scheduled_function(
      (select n.functions_base_url from app_private.notification_email_settings n where n.id),
      'ops-alert-email',
      jsonb_build_object('subject', left(p_subject, 200), 'text', left(p_text, 4000))
    );
  end if;
  raise exception using errcode = '22023', message = 'ops_alert_channel_unknown';
end;
$$;
revoke all on function app_private.ops_alert_send_to(text, text, text) from public, anon, authenticated, service_role;

-- One message through every configured channel. Returns the pg_net request
-- ids (null for a channel that is not configured).
create or replace function app_private.ops_alert_send(p_subject text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'webhookRequestId', app_private.ops_alert_send_to('webhook', p_subject, p_text),
    'emailRequestId', app_private.ops_alert_send_to('email', p_subject, p_text)
  );
end;
$$;
revoke all on function app_private.ops_alert_send(text, text) from public, anon, authenticated, service_role;

create or replace function app_private.ops_alert_tick()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  state app_private.ops_alert_state%rowtype;
  target app_private.ops_alert_channels%rowtype;
  health jsonb;
  status text;
  signature text;
  outcome text;
  told_status text;
  told_signature text;
  told_at timestamptz;
  recovered boolean;
  request_id bigint;
  queued jsonb := '{}'::jsonb;
  confirmed_at timestamptz;
  any_recovery boolean := false;
  not_queued boolean := false;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('ops:alert-tick', 0)) then
    return 'busy';
  end if;
  select * into state from app_private.ops_alert_state where id for update;
  if not state.enabled then return 'disabled'; end if;
  if app_private.ops_alert_webhook() is null and not app_private.ops_alert_email_ready() then
    return 'not_configured';
  end if;

  health := app_private.ops_health_checks();
  status := health ->> 'status';
  select string_agg(c ->> 'name', ',' order by c ->> 'name') into signature
  from jsonb_array_elements(health -> 'checks') c where c ->> 'status' = 'fail';

  for target in
    select * from app_private.ops_alert_channels order by channel for update
  loop
    -- What became of the message this channel was waiting on.
    if target.pending_request_id is not null then
      outcome := app_private.ops_alert_delivery(target.pending_request_id, target.pending_queued_at);
      if outcome = 'delivered' then
        update app_private.ops_alert_channels c
        set delivered_status = c.pending_status, delivered_signature = c.pending_signature,
            delivered_at = c.pending_queued_at,
            pending_request_id = null, pending_status = null, pending_signature = null, pending_queued_at = null,
            last_outcome = outcome, last_outcome_at = statement_timestamp(), failures_in_a_row = 0,
            updated_at = statement_timestamp()
        where c.channel = target.channel
        returning * into target;
        confirmed_at := greatest(confirmed_at, target.delivered_at);
      elsif outcome <> 'waiting' then
        -- Not delivered: forget it, so the decision below starts again from
        -- what this channel last confirmed.
        update app_private.ops_alert_channels c
        set pending_request_id = null, pending_status = null, pending_signature = null, pending_queued_at = null,
            last_outcome = outcome, last_outcome_at = statement_timestamp(),
            failures_in_a_row = c.failures_in_a_row + 1, updated_at = statement_timestamp()
        where c.channel = target.channel
        returning * into target;
      end if;
    end if;

    continue when case target.channel
      when 'webhook' then app_private.ops_alert_webhook() is null
      else not app_private.ops_alert_email_ready()
    end;

    -- Decide from the message still on its way, or else from what the
    -- channel confirmed.
    if target.pending_request_id is not null then
      told_status := target.pending_status;
      told_signature := target.pending_signature;
      told_at := target.pending_queued_at;
    else
      told_status := target.delivered_status;
      told_signature := target.delivered_signature;
      told_at := target.delivered_at;
    end if;
    recovered := coalesce(status <> 'fail' and told_status = 'fail', false);

    -- Send on a new or changed failure, on a failure still open after
    -- repeat_after, and once on recovery. Warnings alone never page.
    if (status = 'fail' and (told_status is distinct from 'fail'
          or signature is distinct from told_signature
          or told_at is null or told_at < statement_timestamp() - state.repeat_after))
      or recovered then
      request_id := app_private.ops_alert_send_to(
        target.channel,
        '[BotolaGO] Production '
          || case when recovered then 'RECOVERED' else 'FAIL: ' || coalesce(signature, 'unknown') end,
        app_private.ops_alert_message(health, recovered)
      );
      if request_id is null then
        not_queued := true;
        continue;
      end if;
      update app_private.ops_alert_channels c
      set pending_request_id = request_id, pending_status = status, pending_signature = signature,
          pending_queued_at = statement_timestamp(), updated_at = statement_timestamp()
      where c.channel = target.channel;
      queued := queued || jsonb_build_object(target.channel, request_id);
      any_recovery := any_recovery or recovered;
    end if;
  end loop;

  update app_private.ops_alert_state
  set last_status = status,
      last_signature = case when queued <> '{}'::jsonb then signature else coalesce(signature, last_signature) end,
      last_sent_at = greatest(last_sent_at, confirmed_at),
      last_request_id = coalesce((queued ->> 'webhook')::bigint, last_request_id),
      last_email_request_id = coalesce((queued ->> 'email')::bigint, last_email_request_id),
      updated_at = statement_timestamp()
  where id;

  return case
    when queued <> '{}'::jsonb then case when any_recovery then 'sent_recovery' else 'sent' end
    when not_queued then 'send_failed'
    else 'quiet'
  end;
end;
$$;
revoke all on function app_private.ops_alert_tick() from public, anon, authenticated, service_role;
comment on function app_private.ops_alert_tick() is
  'pg_cron entry point (every 5 minutes): when production health turns to fail, while it stays failing (every repeat_after), and once on recovery, sends one short message to every configured channel: the Vault webhook botolago_ops_alert_webhook and the email address in app_private.ops_alert_state.email_to (Edge Function ops-alert-email). A message counts as sent only once its channel answers 2xx (app_private.ops_alert_channels); a channel that did not is sent to again at the next tick. Switched by app_private.ops_alert_configure.';
