-- Operations health and failure alerts.
--
-- Until now the only escalation channel was a red GitHub run that nobody
-- watched: on 2026-09-24 two failed season-orchestrator runs, a gameweek left
-- open six hours past its deadline and live scores switched off during a
-- match day all went unnoticed.
--
-- This migration adds:
--   * api.service_ops_health() -- one read-only answer to "is production
--     healthy?", check by check (ok / warn / fail) with a one-line reason.
--     Read by the GitHub ops watchdog (.github/workflows/ops-watchdog.yml),
--     which opens and closes a GitHub issue; callable by service_role only.
--   * app_private.ops_alert_tick() -- every five minutes from pg_cron: when
--     health turns to `fail` (or keeps failing for an hour, or recovers) it
--     posts one short message to a webhook the owner configures (Discord,
--     Slack, or any endpoint taking JSON). SHIPS SWITCHED OFF, and stays off
--     until the owner stores the webhook URL in Vault and enables it:
--       select vault.create_secret('<webhook url>', 'botolago_ops_alert_webhook');
--       select app_private.ops_alert_configure(true);
--   * api.report_client_errors(events) -- where the browser reports what
--     broke (src/lib/client-error-sink.ts). Stored as counts per hour, error
--     code, page and release; no user, no IP, no query string, identifiers
--     in paths replaced by :id, messages redacted again here. Bounded: 10
--     reports per call, 300 new kinds of error per hour, 30 days kept.
--     Read by the `browser_errors` health check, which warns but never
--     pages (anyone can call a public endpoint, so it must not be able to
--     wake the owner).
--
-- Messages carry the environment, the failing checks and their reasons, the
-- time and where to look -- never a credential, a user or a payload.

create table app_private.ops_alert_state (
  id boolean primary key default true,
  enabled boolean not null default false,
  repeat_after interval not null default interval '1 hour',
  last_status text,
  last_signature text,
  last_sent_at timestamptz,
  last_request_id bigint,
  updated_at timestamptz not null default statement_timestamp(),
  constraint ops_alert_state_singleton check (id),
  constraint ops_alert_state_repeat_check check (repeat_after >= interval '10 minutes'),
  constraint ops_alert_state_status_check check (last_status is null or last_status in ('ok', 'warn', 'fail'))
);
insert into app_private.ops_alert_state (id) values (true);
alter table app_private.ops_alert_state enable row level security;
alter table app_private.ops_alert_state force row level security;
revoke all on app_private.ops_alert_state from public, anon, authenticated, service_role;

-- Browser error reports, counted per hour and kind of error.
create table app_private.client_error_counts (
  bucket_hour timestamptz not null,
  kind text not null,
  area text not null,
  code text not null,
  route text not null,
  release text not null,
  sample jsonb not null default '{}'::jsonb,
  reports integer not null default 1,
  first_at timestamptz not null,
  last_at timestamptz not null,
  primary key (bucket_hour, kind, area, code, route, release),
  constraint client_error_counts_kind_check check (kind in ('handled', 'unhandled')),
  constraint client_error_counts_area_check check (area ~ '^[A-Za-z][A-Za-z0-9_.:-]{0,79}$'),
  constraint client_error_counts_code_check check (code ~ '^[A-Za-z][A-Za-z0-9_.:-]{0,79}$'),
  constraint client_error_counts_route_check check (char_length(route) <= 200),
  constraint client_error_counts_release_check check (release ~ '^([0-9a-f]{7,40}|unknown)$'),
  constraint client_error_counts_reports_check check (reports between 1 and 1000000)
);
alter table app_private.client_error_counts enable row level security;
alter table app_private.client_error_counts force row level security;
revoke all on app_private.client_error_counts from public, anon, authenticated, service_role;

-- The same redaction the browser applies (src/lib/operational-errors.ts),
-- again, because the endpoint is public: e-mail addresses, tokens, UUIDs,
-- long opaque strings and URL query strings go; 200 characters at most.
create or replace function app_private.redact_client_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      coalesce(p_text, ''),
      '[[:alnum:]._+-]+@[[:alnum:]-]+(\.[[:alnum:]-]+)+', '[email]', 'g'),
      '\yeyJ[[:alnum:]_-]+\.[[:alnum:]_-]+\.[[:alnum:]_-]+', '[jwt]', 'g'),
      '\y(bearer|token|apikey|key|secret|password)\y[[:space:]]*[:=]?[[:space:]]*[^[:space:]]+', '\1 [redacted]', 'gi'),
      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '[uuid]', 'g'),
      '[A-Za-z0-9+/_-]{32,}={0,2}', '[redacted]', 'g'),
      '(https?://[^[:space:]?#]+)[?#][^[:space:]]*', '\1', 'g'),
    200);
$$;
revoke all on function app_private.redact_client_text(text) from public, anon, authenticated, service_role;

-- A page path without its identifiers, so /news/<id> is one kind of page and
-- no identifier is kept.
create or replace function app_private.client_error_route(p_route text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_route is null or p_route !~ '^/[^[:space:]?#]{0,199}$' then '(unknown)'
    else regexp_replace(regexp_replace(p_route,
      '/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?=/|$)', '/:id', 'g'),
      '/[0-9]+(?=/|$)', '/:id', 'g')
  end;
$$;
revoke all on function app_private.client_error_route(text) from public, anon, authenticated, service_role;

-- What is kept of a report's detail: the redacted message, other codes, and
-- numbers or yes/no values. Six entries at most.
create or replace function app_private.client_error_sample(p_detail jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(kept.key, kept.value), '{}'::jsonb)
  from (
    select candidate.key, candidate.value
    from (
      select entry.key,
        case
          when entry.key = 'message' and jsonb_typeof(entry.value) = 'string'
            then to_jsonb(app_private.redact_client_text(entry.value #>> '{}'))
          when jsonb_typeof(entry.value) in ('number', 'boolean') then entry.value
          when entry.key ~* 'code$' and jsonb_typeof(entry.value) = 'string'
            and (entry.value #>> '{}') ~ '^[A-Za-z][A-Za-z0-9_.:-]{0,79}$' then entry.value
        end as value
      from jsonb_each(case when jsonb_typeof(p_detail) = 'object' then p_detail else '{}'::jsonb end) entry
      where entry.key ~ '^[A-Za-z][A-Za-z0-9_]{0,39}$'
    ) candidate
    where candidate.value is not null
    order by candidate.key
    limit 6
  ) kept;
$$;
revoke all on function app_private.client_error_sample(jsonb) from public, anon, authenticated, service_role;

-- The checks, as a plain function so both the API and the alert tick use one
-- definition. Every threshold is written next to its check.
create or replace function app_private.ops_health_checks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checks jsonb := '[]'::jsonb;
  now_at timestamptz := statement_timestamp();
  tick app_private.fantasy_lifecycle_heartbeat%rowtype;
  tick_enabled boolean;
  overdue record;
  watch jsonb;
  escalations integer;
  failed_jobs text;
  news_beat timestamptz;
  email app_private.notification_email_settings%rowtype;
  email_beat timestamptz;
  dead_letters integer;
  in_play integer;
  upcoming integer;
  last_fixture_run timestamptz;
  last_fixture_ok timestamptz;
  failed_fixture_runs integer;
  failed_news_runs integer;
  browser_errors integer;
  top_browser_error text;
  caller_claims text := current_setting('request.jwt.claims', true);
begin
  -- Fantasy: the database tick that locks gameweeks on time.
  select lifecycle_tick_enabled into tick_enabled from app_private.fantasy_automation_settings where id;
  select * into tick from app_private.fantasy_lifecycle_heartbeat where id;
  checks := checks || jsonb_build_object('name', 'fantasy_lifecycle_tick', 'status',
    case
      when not coalesce(tick_enabled, false) then 'warn'
      when tick.last_run_at is null or tick.last_run_at < now_at - interval '15 minutes' then 'fail'
      when tick.consecutive_failures >= 3 then 'fail'
      when tick.consecutive_failures >= 1 then 'warn'
      else 'ok' end,
    'detail',
    case
      when not coalesce(tick_enabled, false) then 'switched off: gameweeks lock only when the GitHub orchestrator runs'
      when tick.last_run_at is null or tick.last_run_at < now_at - interval '15 minutes' then 'no tick for over 15 minutes'
      when tick.consecutive_failures >= 1 then tick.consecutive_failures || ' failed tick(s): ' || coalesce(tick.last_error, 'unknown')
      else 'last tick ' || to_char(tick.last_run_at at time zone 'UTC', 'HH24:MI') || ' UTC' end);

  -- Fantasy: an open gameweek long past its deadline was the 2026-09-24 signal.
  select g.sequence_number, round(extract(epoch from now_at - g.deadline_at) / 60) as minutes
  into overdue
  from app.fantasy_gameweeks g join app.fantasy_seasons s on s.id = g.fantasy_season_id
  where s.status in ('registration_open', 'active') and g.status = 'open'
    and g.deadline_at < now_at - interval '30 minutes'
  order by g.deadline_at limit 1;
  checks := checks || jsonb_build_object('name', 'fantasy_gameweek_lock', 'status',
    case when overdue.sequence_number is null then 'ok' else 'fail' end, 'detail',
    case when overdue.sequence_number is null then 'no open gameweek past its deadline'
      else 'GW' || overdue.sequence_number || ' deadline passed ' || overdue.minutes || ' min ago, still open' end);

  -- Fantasy: the deadline watch (placeholder kickoffs, no playable fixture).
  if exists (select 1 from app.fantasy_seasons where status in ('planned', 'registration_open', 'active')) then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    begin
      watch := api.service_fantasy_deadline_watch(null, 72, 24);
      select count(*) into escalations
      from jsonb_array_elements(watch -> 'gameweeks') entry where entry ->> 'severity' = 'escalate';
      checks := checks || jsonb_build_object('name', 'fantasy_deadline_watch', 'status',
        case when escalations > 0 then 'fail' else 'ok' end, 'detail',
        case when escalations > 0 then escalations || ' gameweek(s) within 24 h of a deadline that is not authoritative'
          else 'no deadline at risk' end);
    exception when others then
      checks := checks || jsonb_build_object('name', 'fantasy_deadline_watch', 'status', 'warn',
        'detail', 'watch unavailable: ' || left(sqlerrm, 120));
    end;
    perform set_config('request.jwt.claims', coalesce(caller_claims, ''), true);
  end if;

  -- Scheduled database jobs: any failure in the last hour.
  select string_agg(j.jobname || ' x' || f.failures, ', ' order by j.jobname) into failed_jobs
  from (select jobid, count(*) as failures from cron.job_run_details
        where status = 'failed' and start_time > now_at - interval '1 hour' group by jobid) f
  join cron.job j on j.jobid = f.jobid;
  checks := checks || jsonb_build_object('name', 'cron_jobs', 'status',
    case when failed_jobs is null then 'ok' else 'fail' end, 'detail',
    coalesce('failed in the last hour: ' || failed_jobs, 'no failed run in the last hour'));

  -- News: the every-minute publication job keeps a heartbeat.
  select last_run_at into news_beat from app_private.news_schedule_heartbeat where id;
  checks := checks || jsonb_build_object('name', 'news_publication', 'status',
    case when news_beat is null or news_beat < now_at - interval '10 minutes' then 'fail' else 'ok' end,
    'detail', case when news_beat is null then 'never ran'
      else 'last run ' || to_char(news_beat at time zone 'UTC', 'HH24:MI') || ' UTC' end);

  -- News: the licensed import (runs from GitHub) failing within a day.
  select count(*) into failed_news_runs from app_private.news_ingestion_runs
  where status::text = 'failed' and started_at > now_at - interval '24 hours';
  checks := checks || jsonb_build_object('name', 'news_import', 'status',
    case when failed_news_runs > 0 then 'warn' else 'ok' end, 'detail',
    case when failed_news_runs > 0 then failed_news_runs || ' failed import run(s) in 24 h' else 'no failed import in 24 h' end);

  -- Live scores: switched off near a match, or stale during one. The live
  -- refresh calls every 2 minutes during a match and every 5 before it
  -- (20260924200500), so 10 minutes without a fixture run is a stall.
  select * into email from app_private.notification_email_settings where id;
  select count(*) filter (where f.kickoff_at between now_at - interval '3 hours' and now_at
      and f.status not in ('finished', 'postponed', 'cancelled', 'abandoned')),
    count(*) filter (where f.kickoff_at between now_at and now_at + interval '6 hours'
      and f.status in ('scheduled', 'not_started'))
  into in_play, upcoming
  from app.fixtures f join app.seasons s on s.id = f.season_id and s.is_current;
  select max(started_at), max(started_at) filter (where status::text = 'succeeded'),
    count(*) filter (where status::text <> 'succeeded' and started_at > now_at - interval '6 hours')
  into last_fixture_run, last_fixture_ok, failed_fixture_runs
  from app_private.football_ingestion_runs where job_type = 'fixtures';
  checks := checks || jsonb_build_object('name', 'live_scores', 'status',
    case
      when not coalesce(email.football_live_refresh_enabled, false) or email.functions_base_url is null then
        case when in_play + upcoming > 0 then 'warn' else 'ok' end
      when in_play > 0 and (last_fixture_run is null or last_fixture_run < now_at - interval '10 minutes') then 'fail'
      else 'ok' end,
    'detail',
    case
      when not coalesce(email.football_live_refresh_enabled, false) or email.functions_base_url is null then
        'live refresh switched off' || case when in_play + upcoming > 0
          then ' with ' || (in_play + upcoming) || ' match(es) in play or kicking off within 6 h' else '' end
      when in_play > 0 and (last_fixture_run is null or last_fixture_run < now_at - interval '10 minutes') then
        in_play || ' match(es) in play, no fixture refresh for over 10 min'
      else 'live refresh on' end);

  -- Provider refresh (orchestrator or live refresh): recent failures, staleness.
  checks := checks || jsonb_build_object('name', 'provider_refresh', 'status',
    case
      when failed_fixture_runs >= 3 then 'fail'
      when last_fixture_ok is null or last_fixture_ok < now_at - interval '12 hours' then 'warn'
      else 'ok' end,
    'detail',
    case
      when failed_fixture_runs >= 3 then failed_fixture_runs || ' failed fixture refreshes in 6 h'
      when last_fixture_ok is null then 'no successful fixture refresh recorded'
      when last_fixture_ok < now_at - interval '12 hours' then 'last successful fixture refresh '
        || round(extract(epoch from now_at - last_fixture_ok) / 3600) || ' h ago'
      else 'last successful fixture refresh ' || to_char(last_fixture_ok at time zone 'UTC', 'HH24:MI') || ' UTC' end);

  -- Email delivery, when it is on.
  select last_run_at into email_beat from app_private.notification_email_heartbeat where id;
  select count(*) into dead_letters from app_private.notification_dead_letters where resolved_at is null;
  checks := checks || jsonb_build_object('name', 'email_delivery', 'status',
    case
      when email.mode = 'off' then 'ok'
      when email_beat is null or email_beat < now_at - interval '15 minutes' then 'fail'
      when dead_letters > 0 then 'warn'
      else 'ok' end,
    'detail',
    case
      when email.mode = 'off' then 'switched off'
      when email_beat is null or email_beat < now_at - interval '15 minutes' then 'no email tick for over 15 minutes'
      when dead_letters > 0 then dead_letters || ' undelivered email(s) waiting'
      else 'mode ' || email.mode end);

  -- Browser errors nothing caught, this hour and the last. A warning at most:
  -- the reports come from a public endpoint and must not be able to page.
  select coalesce(sum(t.reports), 0)::integer,
    (array_agg(t.code || ' on ' || t.route order by t.reports desc, t.code, t.route))[1]
  into browser_errors, top_browser_error
  from (
    select c.code, c.route, sum(c.reports) as reports
    from app_private.client_error_counts c
    where c.kind = 'unhandled' and c.bucket_hour >= date_trunc('hour', now_at) - interval '1 hour'
    group by c.code, c.route
  ) t;
  checks := checks || jsonb_build_object('name', 'browser_errors', 'status',
    case when browser_errors >= 25 then 'warn' else 'ok' end, 'detail',
    case when browser_errors = 0 then 'no unhandled browser error reported since '
        || to_char((date_trunc('hour', now_at) - interval '1 hour') at time zone 'UTC', 'HH24:MI') || ' UTC'
      else browser_errors || ' unhandled browser error(s) since '
        || to_char((date_trunc('hour', now_at) - interval '1 hour') at time zone 'UTC', 'HH24:MI')
        || ' UTC; most: ' || top_browser_error end);

  return jsonb_build_object(
    'environment', 'production',
    'generatedAt', now_at,
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks);
end;
$$;
revoke all on function app_private.ops_health_checks() from public, anon, authenticated, service_role;

create or replace function api.service_ops_health()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return app_private.ops_health_checks();
end;
$$;
revoke all on function api.service_ops_health() from public, anon, authenticated;
grant execute on function api.service_ops_health() to service_role;
comment on function api.service_ops_health() is
  'Read-only production health: ok/warn/fail per check (Fantasy tick and locks, deadline watch, cron jobs, news publication and import, live scores, provider refresh, email delivery, browser errors) with a one-line reason. No user data.';

-- The browser's error reports. Public (anon and signed-in callers alike, and
-- the browser sends no user token with them), so everything is re-checked:
-- malformed reports are skipped, known kinds of error are counted, and at
-- most 300 new kinds are stored per hour.
create or replace function api.report_client_errors(p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event jsonb;
  now_at timestamptz := statement_timestamp();
  this_hour timestamptz := date_trunc('hour', statement_timestamp());
  kinds_this_hour integer;
  accepted integer := 0;
  report_kind text;
  report_area text;
  report_code text;
  report_route text;
  report_release text;
  code_pattern constant text := '^[A-Za-z][A-Za-z0-9_.:-]{0,79}$';
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'client_errors_invalid';
  end if;
  select count(*) into kinds_this_hour
  from app_private.client_error_counts where bucket_hour = this_hour;

  for event in select value from jsonb_array_elements(p_events) loop
    continue when jsonb_typeof(event) <> 'object';
    report_kind := event ->> 'kind';
    report_area := event ->> 'area';
    report_code := event ->> 'code';
    report_release := coalesce(event ->> 'release', 'unknown');
    continue when report_kind is null or report_kind not in ('handled', 'unhandled')
      or report_area is null or report_area !~ code_pattern
      or report_code is null or report_code !~ code_pattern
      or report_release !~ '^([0-9a-f]{7,40}|unknown)$';
    report_route := app_private.client_error_route(event ->> 'route');

    update app_private.client_error_counts c
    set reports = least(c.reports + 1, 1000000), last_at = now_at
    where c.bucket_hour = this_hour and c.kind = report_kind and c.area = report_area
      and c.code = report_code and c.route = report_route and c.release = report_release;
    if found then
      accepted := accepted + 1;
      continue;
    end if;
    continue when kinds_this_hour >= 300;

    insert into app_private.client_error_counts
      (bucket_hour, kind, area, code, route, release, sample, first_at, last_at)
    values (this_hour, report_kind, report_area, report_code, report_route, report_release,
      app_private.client_error_sample(event -> 'detail'), now_at, now_at)
    on conflict (bucket_hour, kind, area, code, route, release)
    do update set reports = least(app_private.client_error_counts.reports + 1, 1000000),
      last_at = excluded.last_at;
    kinds_this_hour := kinds_this_hour + 1;
    accepted := accepted + 1;
    -- The hour's first report also clears what is older than 30 days.
    if kinds_this_hour = 1 then
      delete from app_private.client_error_counts where bucket_hour < this_hour - interval '30 days';
    end if;
  end loop;

  return jsonb_build_object('accepted', accepted);
end;
$$;
revoke all on function api.report_client_errors(jsonb) from public;
grant execute on function api.report_client_errors(jsonb) to anon, authenticated;
comment on function api.report_client_errors(jsonb) is
  'Browser error reports (src/lib/client-error-sink.ts): 1-10 per call, counted per hour, kind, area, code, page (identifiers replaced by :id) and release. No user, IP or query string is stored; messages are redacted. Returns {accepted}.';

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
  if p_enabled and not exists (
    select 1 from vault.decrypted_secrets where name = 'botolago_ops_alert_webhook'
  ) then
    raise exception using errcode = '22023', message = 'ops_alert_webhook_missing',
      hint = 'select vault.create_secret(''<webhook url>'', ''botolago_ops_alert_webhook'');';
  end if;
  update app_private.ops_alert_state set enabled = p_enabled, updated_at = statement_timestamp()
  where id returning * into state;
  return jsonb_build_object('enabled', state.enabled, 'repeatAfter', state.repeat_after);
end;
$$;
revoke all on function app_private.ops_alert_configure(boolean) from public, anon, authenticated, service_role;

-- The message: environment, status, time, the failing (then warning) checks
-- with their reasons, and where to look. Bounded length.
create or replace function app_private.ops_alert_message(p_health jsonb, p_recovered boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    '[BotolaGO production] '
    || case when p_recovered then 'RECOVERED' else upper(p_health ->> 'status') end
    || ' at ' || to_char((p_health ->> 'generatedAt')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'
    || coalesce(E'\n' || (
      select string_agg('- ' || (c ->> 'name') || ' [' || (c ->> 'status') || ']: ' || (c ->> 'detail'), E'\n'
        order by case c ->> 'status' when 'fail' then 0 else 1 end, c ->> 'name')
      from jsonb_array_elements(p_health -> 'checks') c
      where c ->> 'status' <> 'ok'), '')
    || E'\nWhere to look: GitHub issues labelled ops-alert; runbook docs/operations/ALERTS.md',
    1800);
$$;
revoke all on function app_private.ops_alert_message(jsonb, boolean) from public, anon, authenticated, service_role;

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
  webhook text;
  message text;
  request_id bigint;
  recovered boolean;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('ops:alert-tick', 0)) then
    return 'busy';
  end if;
  select * into state from app_private.ops_alert_state where id for update;
  if not state.enabled then return 'disabled'; end if;
  select decrypted_secret into webhook from vault.decrypted_secrets
  where name = 'botolago_ops_alert_webhook' order by created_at desc limit 1;
  if webhook is null or webhook !~ '^https://[^\s]+$' then return 'not_configured'; end if;

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
    request_id := net.http_post(
      url := webhook,
      body := jsonb_build_object('text', message, 'content', message, 'message', message),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );
    update app_private.ops_alert_state
    set last_status = status, last_signature = signature, last_sent_at = statement_timestamp(),
        last_request_id = request_id, updated_at = statement_timestamp()
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
  'pg_cron entry point (every 5 minutes): posts one short message to the Vault webhook botolago_ops_alert_webhook when production health turns to fail, while it stays failing (every repeat_after), and once on recovery. Switched by app_private.ops_alert_configure.';

select cron.schedule(
  'ops-alert-tick',
  '*/5 * * * *',
  $job$select app_private.ops_alert_tick();$job$
);
