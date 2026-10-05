-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261005100000_push_delivery_claim: the database half of the push dispatcher.
-- It adds a push switch that ships OFF, the function the dispatcher claims
-- push deliveries with (api.service_claim_push_deliveries), the one it hands
-- them back with (api.service_release_push_deliveries), and the owner-only
-- function that turns push on (app_private.notification_push_configure).
--
-- WHEN
--   After the pull request that adds this file is merged. Any quiet moment; not
--   at minute 12 of an hour (the Fantasy season orchestrator). It creates one
--   small table, one index on app.notification_deliveries (a few seconds on a
--   table this size; the script gives up after 5 s rather than queue behind
--   anything) and some functions. Nothing a reader can see changes: push stays
--   OFF, nothing creates push deliveries yet, and no scheduled job is added.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now
--      (AGENTS.md, "Before writing": no GitHub Actions run in progress, no
--      pg_cron job mid-run, no other query running).
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where any of the objects it creates already
--     exists, or where the pieces it builds on are missing (the notification
--     API and email delivery migrations: the deliveries, devices and push
--     destinations tables, app_private.is_service_request and the email
--     staleness check it reuses);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the push switch is one row and
--     is OFF, the dispatcher (service role) can claim and release and nothing
--     else can, only the owner can turn push on, and a claim while push is off
--     hands out nothing and changes nothing.
--   Turning push on is a separate, later step
--   (select app_private.notification_push_configure('testers', ...)).
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  needed text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261005100000') then
    raise exception 'stop: migration 20261005100000 is already recorded as applied';
  end if;
  foreach needed in array array[
    'app.notification_deliveries', 'app.notifications', 'app.device_registrations',
    'app.user_preferences', 'app.profiles', 'app_private.push_destinations',
    'app_private.notification_events'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the notification tables this builds on are missing: %', missing;
  end if;
  if to_regprocedure('app_private.is_service_request()') is null then
    raise exception 'stop: app_private.is_service_request is missing';
  end if;
  if to_regprocedure('app_private.notification_email_event_is_stale(app_private.notification_events,timestamptz)') is null then
    raise exception 'stop: app_private.notification_email_event_is_stale is missing (email delivery is not applied)';
  end if;
  if to_regprocedure('api.service_record_notification_delivery_attempt(uuid,text,boolean,text,text,text,integer,integer,integer,integer,text)') is null then
    raise exception 'stop: api.service_record_notification_delivery_attempt is missing or has another signature';
  end if;
  if to_regprocedure('api.service_invalidate_notification_device(uuid,text)') is null then
    raise exception 'stop: api.service_invalidate_notification_device is missing';
  end if;
  if to_regclass('app_private.notification_push_settings') is not null then
    raise exception 'stop: app_private.notification_push_settings already exists';
  end if;
  if to_regclass('app.notification_deliveries_push_claim_idx') is not null then
    raise exception 'stop: notification_deliveries_push_claim_idx already exists';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
      ('api', 'service_claim_push_deliveries'), ('api', 'service_release_push_deliveries'),
      ('app_private', 'notification_push_topic'), ('app_private', 'notification_push_ttl'),
      ('app_private', 'notification_push_rank'), ('app_private', 'notification_push_configure'))) then
    raise exception 'stop: one of the push dispatcher functions already exists';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261005100000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261005100000',
  'push_delivery_claim',
  array[$bg_20261005100000_file$-- Push alerts, sending side, step 1: what the push dispatcher may claim.
--
-- The dispatcher (Edge Function notification-push-dispatch) is the push twin
-- of the email one. This migration gives it the database half it needs and
-- changes nothing a user can see:
--
--   * app_private.notification_push_settings: one row, OFF by default. Nothing
--     is claimed, and nothing is sent, until the owner switches it on with
--     app_private.notification_push_configure ('testers' for a few accounts,
--     'live' for everyone).
--   * api.service_claim_push_deliveries: hands the dispatcher a small batch of
--     push deliveries. The database has already decided who may receive what:
--     a delivery whose reader switched push or the topic off, whose device is
--     gone, whose type may never be pushed, or whose moment has passed is
--     CANCELLED, never sent late. A goal alert that is ten minutes old is
--     worse than none.
--   * api.service_release_push_deliveries: hands claimed deliveries back
--     without spending an attempt, for when the provider refused everything
--     (no credentials, a rejected key) rather than one device.
--
-- Recording the outcome and turning off a rejected device token already exist
-- (api.service_record_notification_delivery_attempt,
-- api.service_invalidate_notification_device) and are reused as they are.
--
-- Nothing here creates push deliveries: that is the fan-out, a later step.
-- The generic worker's claim (api.service_claim_notification_deliveries) is
-- left alone and must still not run in production; this claim is the one the
-- push dispatcher uses, and it only ever touches push deliveries of the two
-- real providers (fcm for Android, apns for iPhone), never the dormant
-- 'fixture' provider.

-- ---------------------------------------------------------------------------
-- Settings: one row, off by default
-- ---------------------------------------------------------------------------
create table app_private.notification_push_settings (
  id boolean primary key default true,
  mode text not null default 'off',
  test_user_ids uuid[] not null default '{}',
  activated_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_push_settings_singleton check (id),
  constraint notification_push_settings_mode_check check (mode in ('off', 'testers', 'live')),
  constraint notification_push_settings_test_users_check check (cardinality(test_user_ids) <= 20)
);
insert into app_private.notification_push_settings (id) values (true) on conflict do nothing;

alter table app_private.notification_push_settings enable row level security;
alter table app_private.notification_push_settings force row level security;
revoke all on app_private.notification_push_settings
  from public, anon, authenticated, service_role;

-- Finds pending push work quickly without scanning in-app and email rows.
create index notification_deliveries_push_claim_idx
  on app.notification_deliveries (coalesce(next_retry_at, created_at), id)
  where channel = 'push' and status in ('pending', 'retry_scheduled', 'claimed');

-- ---------------------------------------------------------------------------
-- What may be pushed, and for how long it stays worth sending
-- ---------------------------------------------------------------------------

-- The switch a type answers to: 'match' is the reader's match alerts,
-- 'fantasy' their Fantasy deadline reminders. NULL means the type is never
-- pushed, whatever created a delivery for it: account and security messages,
-- news and everything else stay in the app and in email. A type is added here
-- by a later migration, on purpose.
create or replace function app_private.notification_push_topic(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'match_starting' then 'match'
    when 'goal' then 'match'
    when 'full_time' then 'match'
    when 'followed_team_result' then 'match'
    when 'deadline_24h' then 'fantasy'
    when 'deadline_1h' then 'fantasy'
    else null
  end;
$$;

-- How long after it became available a push is still worth sending. Types
-- that name their own moment (the kick-off alert, the 24-hour deadline) are
-- judged by that moment instead, as the email dispatcher judges them; this is
-- their ceiling, and the lifetime the provider is told to hold the message.
create or replace function app_private.notification_push_ttl(p_type text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'goal' then interval '10 minutes'
    when 'match_starting' then interval '20 minutes'
    when 'full_time' then interval '30 minutes'
    when 'followed_team_result' then interval '30 minutes'
    when 'deadline_1h' then interval '30 minutes'
    when 'deadline_24h' then interval '2 hours'
    else interval '1 hour'
  end;
$$;

-- The order a short batch is filled in: retries first, then what is most
-- time-critical.
create or replace function app_private.notification_push_rank(p_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'goal' then 1
    when 'match_starting' then 2
    when 'deadline_1h' then 3
    when 'full_time' then 4
    when 'followed_team_result' then 5
    when 'deadline_24h' then 6
    else 7
  end;
$$;

-- ---------------------------------------------------------------------------
-- Owner switch (postgres only, like the email one)
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_push_configure(
  p_mode text,
  p_test_user_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_mode not in ('off', 'testers', 'live') then
    raise exception using errcode = '22023', message = 'invalid_push_mode';
  end if;
  if p_mode = 'testers' and coalesce(cardinality(p_test_user_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'push_testers_need_users';
  end if;
  update app_private.notification_push_settings set
    mode = p_mode,
    test_user_ids = coalesce(p_test_user_ids, '{}'),
    activated_at = case
      when p_mode <> 'off' then coalesce(activated_at, statement_timestamp())
      else activated_at
    end,
    updated_at = statement_timestamp()
  where id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatcher API (service role only)
-- ---------------------------------------------------------------------------
create or replace function api.service_claim_push_deliveries(
  p_limit integer default 50,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_push_settings%rowtype;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_limit not between 1 and 200 or p_lease_seconds not between 30 and 600 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;
  select * into settings from app_private.notification_push_settings where id;
  if settings.mode = 'off' then
    return '[]'::jsonb;
  end if;

  -- Waiting pushes that are no longer wanted or no longer timely are
  -- cancelled, never sent: the reader switched push (or the topic) off, the
  -- account is gone, the device was turned off or lost its token, the type is
  -- one that is never pushed, or the moment has passed. That includes a push a
  -- pass claimed and then abandoned (its lease expired unrecorded).
  with checked as (
    select
      delivery.id,
      (
        notification.expires_at is not null and notification.expires_at <= statement_timestamp()
        or case
          when notification.notification_type::text in ('match_starting', 'deadline_24h')
            then app_private.notification_email_event_is_stale(event, statement_timestamp())
          else notification.available_at
            + app_private.notification_push_ttl(notification.notification_type::text)
            <= statement_timestamp()
        end
      ) as expired,
      (
        topic.name is not null
        and profile.id is not null and profile.deleted_at is null
        and preference.user_id is not null
        and preference.notifications_enabled and preference.push_notifications_enabled
        and (
          (topic.name = 'match' and preference.match_alerts)
          or (topic.name = 'fantasy' and preference.fantasy_deadline_reminders)
        )
        and device.id is not null and device.enabled and device.invalidated_at is null
        and device.user_id = notification.user_id
        and destination.device_registration_id is not null
        and (destination.expires_at is null or destination.expires_at > statement_timestamp())
      ) as wanted
    from app.notification_deliveries delivery
    join app.notifications notification on notification.id = delivery.notification_id
    join app_private.notification_events event on event.id = notification.event_id
    left join app.profiles profile on profile.id = notification.user_id
    left join app.user_preferences preference on preference.user_id = notification.user_id
    left join app.device_registrations device on device.id = delivery.device_registration_id
    left join app_private.push_destinations destination
      on destination.device_registration_id = delivery.device_registration_id
    cross join lateral (
      select app_private.notification_push_topic(notification.notification_type::text) as name
    ) topic
    where delivery.channel = 'push' and delivery.provider_key in ('fcm', 'apns')
      and (delivery.status in ('pending', 'retry_scheduled')
        or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()))
  )
  update app.notification_deliveries delivery set
    status = 'cancelled',
    stable_error_code = case
      when not checked.wanted then 'push_no_longer_eligible'
      else 'push_expired'
    end,
    next_retry_at = null,
    claimed_at = null,
    claim_expires_at = null
  from checked
  where delivery.id = checked.id and (checked.expired or not checked.wanted);

  with claimable as (
    select delivery.id
    from app.notification_deliveries delivery
    join app.notifications notification on notification.id = delivery.notification_id
    where delivery.channel = 'push' and delivery.provider_key in ('fcm', 'apns')
      and ((delivery.status in ('pending', 'retry_scheduled')
          and coalesce(delivery.next_retry_at, delivery.created_at) <= statement_timestamp())
        or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()))
      -- Quiet hours are applied when the delivery is made, by moving this.
      and notification.available_at <= statement_timestamp()
      and (settings.mode = 'live' or notification.user_id = any(settings.test_user_ids))
      and exists (
        select 1
        from app.device_registrations device
        join app_private.push_destinations destination
          on destination.device_registration_id = device.id
        where device.id = delivery.device_registration_id
          and device.enabled and device.invalidated_at is null
      )
    order by
      -- A push already attempted goes first, so one whose outcome was unknown
      -- is settled before new ones are started.
      delivery.attempt_count > 0 desc,
      app_private.notification_push_rank(notification.notification_type::text),
      notification.available_at,
      delivery.id
    for update of delivery skip locked
    limit p_limit
  ),
  claimed as (
    update app.notification_deliveries delivery set
      status = 'claimed',
      claimed_at = statement_timestamp(),
      claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
      attempt_count = delivery.attempt_count + 1
    from claimable
    where delivery.id = claimable.id
    returning delivery.id, delivery.notification_id, delivery.device_registration_id,
      delivery.provider_key, delivery.attempt_count
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', claimed.id,
      'notificationId', claimed.notification_id,
      'attemptNumber', claimed.attempt_count,
      'providerKey', claimed.provider_key,
      'platform', device.platform,
      'deviceRegistrationId', claimed.device_registration_id,
      'type', notification.notification_type,
      'language', notification.language,
      'title', notification.title,
      'body', notification.body,
      'deepLink', jsonb_build_object(
        'target', notification.deep_link_target,
        'entityId', notification.deep_link_entity_id
      ),
      -- How long the provider may hold the message for an offline phone: what
      -- is left of its life, so a late alert is dropped by the network rather
      -- than delivered.
      'expiresInSeconds', greatest(1, least(86400, extract(epoch from (
        coalesce(
          notification.expires_at,
          notification.available_at
            + app_private.notification_push_ttl(notification.notification_type::text)
        ) - statement_timestamp()
      ))::integer)),
      'destination', destination.destination_value
    ) order by notification.available_at, claimed.id), '[]'::jsonb)
  into result
  from claimed
  join app.notifications notification on notification.id = claimed.notification_id
  join app.device_registrations device on device.id = claimed.device_registration_id
  join app_private.push_destinations destination
    on destination.device_registration_id = claimed.device_registration_id;
  return result;
end;
$$;

create or replace function api.service_release_push_deliveries(
  p_delivery_ids uuid[],
  p_retry_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare released integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_delivery_ids is null or cardinality(p_delivery_ids) > 200
    or p_retry_at is null or p_retry_at > statement_timestamp() + interval '1 day'
  then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;
  update app.notification_deliveries delivery set
    status = 'retry_scheduled',
    attempt_count = greatest(delivery.attempt_count - 1, 0),
    next_retry_at = greatest(p_retry_at, statement_timestamp()),
    claimed_at = null,
    claim_expires_at = null
  where delivery.id = any(p_delivery_ids)
    and delivery.channel = 'push' and delivery.provider_key in ('fcm', 'apns')
    and delivery.status = 'claimed';
  get diagnostics released = row_count;
  return released;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function
  app_private.notification_push_topic(text),
  app_private.notification_push_ttl(text),
  app_private.notification_push_rank(text),
  app_private.notification_push_configure(text, uuid[])
from public, anon, authenticated, service_role;
grant execute on function
  app_private.notification_push_topic(text),
  app_private.notification_push_ttl(text),
  app_private.notification_push_rank(text),
  app_private.notification_push_configure(text, uuid[])
to postgres;

revoke all on function
  api.service_claim_push_deliveries(integer, integer),
  api.service_release_push_deliveries(uuid[], timestamptz)
from public, anon, authenticated, service_role;
grant execute on function
  api.service_claim_push_deliveries(integer, integer),
  api.service_release_push_deliveries(uuid[], timestamptz)
to service_role;

comment on table app_private.notification_push_settings is
  'The push dispatcher''s one switch: off (default), testers (a few accounts) or live. Changed only by app_private.notification_push_configure.';
comment on function api.service_claim_push_deliveries(integer, integer) is
  'Claims a batch of push deliveries for the push dispatcher; cancels those no longer wanted or timely first. Service role only.';
$bg_20261005100000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261005100000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261005100000'
  );
begin
  if encode(sha256(convert_to(part_20261005100000, 'UTF8')), 'hex')
    is distinct from '4cf2447b5efdcacd2a820ac8b62c4ab64f18a266ab8180b5c717154067c086d5' then
    raise exception 'stop: 20261005100000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261005100000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (writes nothing)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  claim constant regprocedure := 'api.service_claim_push_deliveries(integer,integer)'::regprocedure;
  release constant regprocedure := 'api.service_release_push_deliveries(uuid[],timestamptz)'::regprocedure;
  configure constant regprocedure := 'app_private.notification_push_configure(text,uuid[])'::regprocedure;
  claimed jsonb;
  waiting_before integer;
  waiting_after integer;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'api' and p.proname in ('service_claim_push_deliveries', 'service_release_push_deliveries')) <> 2 then
    problems := problems || 'there is not exactly one claim and one release function'::text;
  end if;
  if not has_function_privilege('service_role', claim, 'execute')
    or not has_function_privilege('service_role', release, 'execute') then
    problems := problems || 'the dispatcher (service role) cannot claim or release'::text;
  end if;
  if has_function_privilege('anon', claim, 'execute') or has_function_privilege('authenticated', claim, 'execute')
    or has_function_privilege('public', claim, 'execute')
    or has_function_privilege('anon', release, 'execute') or has_function_privilege('authenticated', release, 'execute')
    or has_function_privilege('public', release, 'execute') then
    problems := problems || 'something other than the dispatcher can claim or release'::text;
  end if;
  if has_function_privilege('service_role', configure, 'execute')
    or has_function_privilege('anon', configure, 'execute')
    or has_function_privilege('authenticated', configure, 'execute')
    or has_function_privilege('public', configure, 'execute')
    or has_table_privilege('service_role', 'app_private.notification_push_settings', 'select')
    or has_table_privilege('authenticated', 'app_private.notification_push_settings', 'select') then
    problems := problems || 'push can be switched on by something other than the owner'::text;
  end if;
  if (select count(*) from app_private.notification_push_settings) <> 1
    or (select mode from app_private.notification_push_settings) <> 'off' then
    problems := problems || 'the push switch is not one row, off'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261005100000') then
    problems := problems || 'history row missing'::text;
  end if;

  -- While push is off a claim hands out nothing and changes nothing.
  select count(*) into waiting_before from app.notification_deliveries
    where channel = 'push' and status in ('pending', 'retry_scheduled', 'claimed', 'cancelled');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  claimed := api.service_claim_push_deliveries(50, 120);
  select count(*) into waiting_after from app.notification_deliveries
    where channel = 'push' and status in ('pending', 'retry_scheduled', 'claimed', 'cancelled');
  if claimed is distinct from '[]'::jsonb then
    problems := problems || ('a claim while push is off handed out ' || claimed::text);
  end if;
  if waiting_after is distinct from waiting_before then
    problems := problems || 'a claim while push is off changed deliveries'::text;
  end if;

  -- Anyone else is refused.
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform api.service_claim_push_deliveries(50, 120);
    problems := problems || 'a claim without the service role was accepted'::text;
  exception when sqlstate 'PT403' then null;
  end;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'push dispatcher: switch off, dispatcher-only claim and release, owner-only switch, a claim while off changes nothing';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261005100000')
    then 'Applied. The push dispatcher can claim deliveries; push is still OFF.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
