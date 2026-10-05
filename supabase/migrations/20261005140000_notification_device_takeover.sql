-- A phone's push address moves to whoever presents it.
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
