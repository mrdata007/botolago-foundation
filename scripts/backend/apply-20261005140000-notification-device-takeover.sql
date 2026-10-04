-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261005140000_notification_device_takeover: a phone's push
-- address moves to whoever presents it. It replaces ONE function,
-- api.register_my_notification_device, so that registering an address another
-- registration already holds (another account on the same phone, or the same
-- account after a reinstall) moves it instead of being refused with
-- device_token_conflict. The registration that held it is switched off and loses
-- the address; its history stays; the move is audited without the address.
--
-- WHEN
--   After the pull request that adds this file is merged. Any quiet moment; not
--   at minute 12 of an hour (the Fantasy season orchestrator). It replaces one
--   function (same signature, same grants) and changes no table. Nothing a
--   reader can see changes today: no phone registers an address until the phone
--   app exists. It does not depend on the push switch, which may be in any state.
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
--   * refuses to run twice, or where the function it replaces is not the
--     reviewed one (it must still refuse a held address and still require the
--     second-factor check), or where the helpers it calls are missing;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the function is the new one,
--     signed-in accounts can run it and signed-out visitors cannot, and the
--     helpers are still owner-only.
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
  current_definition text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261005140000') then
    raise exception 'stop: migration 20261005140000 is already recorded as applied';
  end if;
  foreach needed in array array[
    'app.device_registrations', 'app_private.push_destinations',
    'app_private.notification_operational_audit'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()',
    'app_private.assert_valid_timezone(text)',
    'app_private.assert_notification_user_rate_limit(uuid,text,integer,interval)',
    'app_private.write_notification_audit(text,uuid,uuid,uuid,uuid,jsonb)'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if to_regprocedure('api.register_my_notification_device(text,app.notification_device_platform,app.notification_push_provider,text,app.language_code,text,text)') is null then
    raise exception 'stop: api.register_my_notification_device is missing';
  end if;
  current_definition := pg_get_functiondef(
    'api.register_my_notification_device(text,app.notification_device_platform,app.notification_push_provider,text,app.language_code,text,text)'::regprocedure
  );
  if current_definition like '%notification_device_taken_over%' then
    raise exception 'stop: api.register_my_notification_device already moves a held address';
  end if;
  if current_definition not like '%device_token_conflict%'
    or current_definition not like '%assert_mfa_step_up%' then
    raise exception 'stop: api.register_my_notification_device is not the version this replaces (it should refuse a held address and check the second factor) -- review before replacing';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261005140000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261005140000',
  'notification_device_takeover',
  array[$bg_20261005140000_file$-- A phone's push address moves to whoever presents it.
--
-- `api.register_my_notification_device` refused (`device_token_conflict`) when the
-- address a phone gave was already registered to anything but this very account
-- and install. That was meant to stop one account's address being claimed by
-- another, but an address is secret to the phone it was issued to, so whoever can
-- present it is holding that phone. The refusal then only ever hurt:
--
--   * Someone signs out while offline (so the phone could not release its
--     registration) and another account signs in on the same phone: no alerts for
--     the new account, for good, with no way to fix it from the app. An iPhone
--     keeps the same address across sign-ins, so unlike Android it cannot even get
--     a fresh one.
--   * The same account reinstalls the app: a new install id, the same iPhone
--     address, refused.
--
-- Now the registration moves. The registration that held the address is switched
-- off and loses the address, so nothing more is ever sent to it (a push already
-- waiting for it is cancelled by the claim as "no longer eligible"); its delivery
-- history stays. The move is written to the operational audit (who registered it,
-- which registration lost it, and whether it was the same account), never the
-- address itself.
--
-- Everything else is as before, including the sign-in, second-factor and rate
-- limit checks, the lock that makes two registrations of one address queue up,
-- and `device_token_conflict` for the one case left: two requests racing for the
-- same address that the lock did not order.
create or replace function api.register_my_notification_device(
  p_device_id text,
  p_platform app.notification_device_platform,
  p_push_provider app.notification_push_provider,
  p_destination text,
  p_locale app.language_code,
  p_timezone text,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_id uuid;
  token_digest bytea;
  taken record;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_device_id !~ '^[A-Za-z0-9._:-]{8,128}$' or char_length(p_destination) not between 16 and 4096 then
    raise exception using errcode = 'PT400', message = 'invalid_device';
  end if;
  perform app_private.assert_valid_timezone(p_timezone);
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notification_device_registered', 10, interval '10 minutes'
  );
  token_digest := extensions.digest(convert_to(p_destination, 'UTF8'), 'sha256');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(encode(token_digest, 'hex'), 0));

  -- Another registration holds this address (another account on the same phone,
  -- or this account's earlier install): it hands the address over.
  for taken in
    select registration.id, registration.user_id
    from app_private.push_destinations destination
    join app.device_registrations registration on registration.id = destination.device_registration_id
    where destination.destination_digest = token_digest
      and not (registration.user_id = current_user_id and registration.device_id = p_device_id)
    for update of registration
  loop
    delete from app_private.push_destinations where device_registration_id = taken.id;
    update app.device_registrations set
      enabled = false,
      invalidated_at = statement_timestamp()
    where id = taken.id;
    perform app_private.write_notification_audit(
      'notification_device_taken_over', current_user_id,
      p_device_registration_id := taken.id,
      p_metadata := jsonb_build_object('sameAccount', taken.user_id = current_user_id)
    );
  end loop;

  insert into app.device_registrations (
    user_id, device_id, platform, push_provider, app_version, locale,
    timezone, enabled, last_seen_at, invalidated_at
  ) values (
    current_user_id, p_device_id, p_platform, p_push_provider, p_app_version,
    p_locale, p_timezone, true, statement_timestamp(), null
  ) on conflict (user_id, device_id) do update set
    platform = excluded.platform,
    push_provider = excluded.push_provider,
    app_version = excluded.app_version,
    locale = excluded.locale,
    timezone = excluded.timezone,
    enabled = true,
    last_seen_at = statement_timestamp(),
    invalidated_at = null
  returning id into target_id;

  insert into app_private.push_destinations (
    device_registration_id, destination_digest, destination_value, rotated_at
  ) values (target_id, token_digest, p_destination, statement_timestamp())
  on conflict (device_registration_id) do update set
    destination_digest = excluded.destination_digest,
    destination_value = excluded.destination_value,
    rotated_at = statement_timestamp(),
    expires_at = null;

  perform app_private.write_notification_audit(
    'notification_device_registered', current_user_id,
    p_device_registration_id := target_id,
    p_metadata := jsonb_build_object('platform', p_platform, 'provider', p_push_provider)
  );
  return jsonb_build_object(
    'id', target_id, 'deviceId', p_device_id, 'platform', p_platform,
    'pushProvider', p_push_provider, 'appVersion', p_app_version,
    'locale', p_locale, 'timezone', p_timezone, 'enabled', true
  );
exception when unique_violation then
  raise exception using errcode = 'PT409', message = 'device_token_conflict';
end;
$$;
$bg_20261005140000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261005140000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261005140000'
  );
begin
  if encode(sha256(convert_to(part_20261005140000, 'UTF8')), 'hex')
    is distinct from '0ec25a0da1cebfb8040d89c8ce2a2f2902928c83a41c2ffaa18c27197054dc88' then
    raise exception 'stop: 20261005140000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261005140000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  signature constant regprocedure :=
    'api.register_my_notification_device(text,app.notification_device_platform,app.notification_push_provider,text,app.language_code,text,text)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  who text;
begin
  if definition not like '%notification_device_taken_over%' then
    problems := problems || 'the function does not move a held address'::text;
  end if;
  if definition not like '%assert_mfa_step_up%'
    or definition not like '%assert_notification_user_rate_limit%'
    or definition not like '%pg_advisory_xact_lock%' then
    problems := problems || 'the function lost one of its checks (second factor, rate limit, lock)'::text;
  end if;
  if not has_function_privilege('authenticated', signature, 'execute') then
    problems := problems || 'signed-in accounts cannot register a phone'::text;
  end if;
  foreach who in array array['anon', 'public'] loop
    if has_function_privilege(who, signature, 'execute') then
      problems := problems || (who || ' can register a phone');
    end if;
  end loop;
  foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
    if has_function_privilege(who, 'app_private.write_notification_audit(text,uuid,uuid,uuid,uuid,jsonb)'::regprocedure, 'execute') then
      problems := problems || (who || ' can write the audit directly');
    end if;
  end loop;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261005140000') then
    problems := problems || 'history row missing'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'device registration: a held address moves, checks intact, signed-in only';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261005140000')
    then 'Applied. A held push address now moves to whoever presents it.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
