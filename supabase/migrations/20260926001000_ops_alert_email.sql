-- Production alerts by email, to the owner's own inbox.
--
-- On 2026-09-25 both existing channels fired and neither reached the owner:
-- the watchdog opened ops-alert issue #218 mentioning @mrdata007, and a TEST
-- message through the Vault webhook got Slack's "ok", yet the owner saw
-- neither. Email through the site's own sender (Resend, the botolago.com
-- domain) is the channel the owner reads.
--
--   * app_private.ops_alert_state gains email_to: the one address alerts are
--     emailed to. Set by the owner only (app_private.ops_alert_configure_email).
--   * app_private.ops_alert_tick() decides when to send exactly as before and
--     now sends through every configured channel: the webhook, the email, or
--     both. The email goes through the Edge Function `ops-alert-email`, woken
--     with the scheduler token like notification-email-dispatch, at the
--     functions URL already stored in app_private.notification_email_settings.
--     The request carries the subject and text only; the function reads the
--     address from api.service_ops_alert_email_target(), so the function can
--     never be made to mail anyone else.
--   * Email counts as a channel only when the address, the functions URL and
--     the scheduler token all exist (app_private.ops_alert_email_ready); a
--     tick that queues nothing returns 'send_failed' and records nothing, so
--     the next tick tries again.
--   * app_private.ops_alert_test() sends one TEST message through every
--     configured channel, so delivery is proven without breaking production.
--     It leaves the alert state (last status, signature, times) untouched.
--
-- Owner, once:
--   select app_private.ops_alert_configure_email('<address>');
--   select app_private.ops_alert_configure(true);
--   select app_private.ops_alert_test();

alter table app_private.ops_alert_state
  add column email_to text,
  add column last_email_request_id bigint,
  add constraint ops_alert_state_email_check check (
    email_to is null or (
      char_length(email_to) <= 254
      and email_to ~ '^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$'
    )
  );

-- The webhook URL, when one is stored and usable.
create or replace function app_private.ops_alert_webhook()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'botolago_ops_alert_webhook' and decrypted_secret ~ '^https://[^\s]+$'
  order by created_at desc limit 1;
$$;
revoke all on function app_private.ops_alert_webhook() from public, anon, authenticated, service_role;

-- Email can only go out when an address, the functions URL and the scheduler
-- token are all there: app_private.invoke_scheduled_function queues nothing
-- otherwise.
create or replace function app_private.ops_alert_email_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app_private.ops_alert_state s where s.id and s.email_to is not null)
    and exists (select 1 from app_private.notification_email_settings n
                where n.id and n.functions_base_url is not null)
    and app_private.scheduler_token() is not null;
$$;
revoke all on function app_private.ops_alert_email_ready() from public, anon, authenticated, service_role;

-- Switching alerts on now needs at least one channel, not the webhook alone.
create or replace function app_private.ops_alert_configure(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare state app_private.ops_alert_state%rowtype;
begin
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'ops_alert_setting_required';
  end if;
  select * into state from app_private.ops_alert_state where id;
  if p_enabled and app_private.ops_alert_webhook() is null and not app_private.ops_alert_email_ready() then
    raise exception using errcode = '22023', message = 'ops_alert_channel_missing',
      hint = 'select app_private.ops_alert_configure_email(''<address>''); or store a webhook as botolago_ops_alert_webhook in Vault';
  end if;
  update app_private.ops_alert_state set enabled = p_enabled, updated_at = statement_timestamp()
  where id returning * into state;
  return jsonb_build_object('enabled', state.enabled, 'repeatAfter', state.repeat_after,
    'webhook', app_private.ops_alert_webhook() is not null, 'email', app_private.ops_alert_email_ready());
end;
$$;
revoke all on function app_private.ops_alert_configure(boolean) from public, anon, authenticated, service_role;

-- The owner's address for alert emails; null stops emailing.
create or replace function app_private.ops_alert_configure_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text := nullif(btrim(p_email), '');
  state app_private.ops_alert_state%rowtype;
begin
  if address is not null and (
    char_length(address) > 254
    or address !~ '^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$'
  ) then
    raise exception using errcode = '22023', message = 'ops_alert_email_invalid';
  end if;
  if address is not null and (
    not exists (select 1 from app_private.notification_email_settings n
                where n.id and n.functions_base_url is not null)
    or app_private.scheduler_token() is null
  ) then
    raise exception using errcode = '22023', message = 'ops_alert_email_unreachable',
      hint = 'the functions URL (app_private.notification_email_configure) and the Vault scheduler token botolago_scheduler_token must exist first';
  end if;
  update app_private.ops_alert_state set email_to = address, updated_at = statement_timestamp()
  where id returning * into state;
  return jsonb_build_object('enabled', state.enabled, 'email', app_private.ops_alert_email_ready());
end;
$$;
revoke all on function app_private.ops_alert_configure_email(text) from public, anon, authenticated, service_role;

-- What the Edge Function `ops-alert-email` mails to: the configured address
-- or null. Service role only.
create or replace function api.service_ops_alert_email_target()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return (select email_to from app_private.ops_alert_state where id);
end;
$$;
revoke all on function api.service_ops_alert_email_target() from public, anon, authenticated;
grant execute on function api.service_ops_alert_email_target() to service_role;
comment on function api.service_ops_alert_email_target() is
  'The address production alerts are emailed to (app_private.ops_alert_state.email_to), or null. Read by the Edge Function ops-alert-email; service role only.';

-- One message through every configured channel. Returns the pg_net request
-- ids (null for a channel that is not configured).
create or replace function app_private.ops_alert_send(p_subject text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook text := app_private.ops_alert_webhook();
  email_to text := (select s.email_to from app_private.ops_alert_state s where s.id);
  functions_base_url text := (select n.functions_base_url from app_private.notification_email_settings n where n.id);
  webhook_request bigint;
  email_request bigint;
begin
  if webhook is not null then
    webhook_request := net.http_post(
      url := webhook,
      body := jsonb_build_object('text', p_text, 'content', p_text, 'message', p_text),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );
  end if;
  if email_to is not null and app_private.ops_alert_email_ready() then
    email_request := app_private.invoke_scheduled_function(
      functions_base_url, 'ops-alert-email',
      jsonb_build_object('subject', left(p_subject, 200), 'text', left(p_text, 4000))
    );
  end if;
  return jsonb_build_object('webhookRequestId', webhook_request, 'emailRequestId', email_request);
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
  health jsonb;
  status text;
  signature text;
  message text;
  subject text;
  sent jsonb;
  recovered boolean;
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
  recovered := status <> 'fail' and state.last_status = 'fail';

  -- Send on a new or changed failure, on a failure still open after
  -- repeat_after, and once on recovery. Warnings alone never page.
  if (status = 'fail' and (state.last_status is distinct from 'fail'
        or signature is distinct from state.last_signature
        or state.last_sent_at is null or state.last_sent_at < statement_timestamp() - state.repeat_after))
    or recovered then
    message := app_private.ops_alert_message(health, recovered);
    subject := '[BotolaGO] Production '
      || case when recovered then 'RECOVERED' else 'FAIL: ' || coalesce(signature, 'unknown') end;
    sent := app_private.ops_alert_send(subject, message);
    -- Nothing queued means nothing sent: leave the state as it was, so the
    -- next tick tries again instead of going quiet for repeat_after.
    if sent ->> 'webhookRequestId' is null and sent ->> 'emailRequestId' is null then
      return 'send_failed';
    end if;
    update app_private.ops_alert_state
    set last_status = status, last_signature = signature, last_sent_at = statement_timestamp(),
        last_request_id = coalesce((sent ->> 'webhookRequestId')::bigint, last_request_id),
        last_email_request_id = coalesce((sent ->> 'emailRequestId')::bigint, last_email_request_id),
        updated_at = statement_timestamp()
    where id;
    return case when recovered then 'sent_recovery' else 'sent' end;
  end if;

  update app_private.ops_alert_state
  set last_status = status, last_signature = coalesce(signature, last_signature),
      updated_at = statement_timestamp()
  where id;
  return 'quiet';
end;
$$;
revoke all on function app_private.ops_alert_tick() from public, anon, authenticated, service_role;
comment on function app_private.ops_alert_tick() is
  'pg_cron entry point (every 5 minutes): when production health turns to fail, while it stays failing (every repeat_after), and once on recovery, sends one short message to every configured channel: the Vault webhook botolago_ops_alert_webhook and the email address in app_private.ops_alert_state.email_to (Edge Function ops-alert-email). Switched by app_private.ops_alert_configure.';

-- The owner's delivery test: one TEST message through every configured
-- channel, whether or not alerts are switched on. The alert state is not
-- touched, so the next real incident is still announced.
create or replace function app_private.ops_alert_test()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stamp text := to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI');
  sent jsonb;
begin
  if app_private.ops_alert_webhook() is null and not app_private.ops_alert_email_ready() then
    raise exception using errcode = '22023', message = 'ops_alert_channel_missing';
  end if;
  sent := app_private.ops_alert_send(
    '[BotolaGO] Production alert TEST',
    '[BotolaGO production] TEST at ' || stamp || ' UTC' || E'\n'
      || 'A delivery test of the production alerts. No action needed: when something breaks, a message like this one arrives here.'
      || E'\nWhere to look: GitHub issues labelled ops-alert; runbook docs/operations/ALERTS.md'
  );
  if sent ->> 'webhookRequestId' is null and sent ->> 'emailRequestId' is null then
    raise exception using errcode = 'P0001', message = 'ops_alert_test_not_queued';
  end if;
  return sent || jsonb_build_object('sentAt', statement_timestamp());
end;
$$;
revoke all on function app_private.ops_alert_test() from public, anon, authenticated, service_role;
