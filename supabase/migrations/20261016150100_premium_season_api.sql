-- BotolaGO+ « Saison », part 2: the API.
--
-- Over the tables of 20261016150000:
--
--   api.get_premium_payment_details()          signed in; where to pay (not while off)
--   api.get_my_premium_pay_code()              signed in; the caller's personal payment code
--   api.admin_get_premium_payment_details()    staff, premium.read
--   api.admin_set_premium_payment_details(...) staff, premium.grant + recent authentication
--   api.admin_find_premium_member_by_code(...) staff, premium.read, audited
--   api.admin_activate_premium_season(...)     staff, premium.grant + recent authentication
--
-- and three functions of 20261013100200 replaced, same signature, same grants:
--
--   api.premium_status()            the price list now carries validUntil (the season end);
--                                   plus_monthly and plus_yearly are inactive, so only
--                                   plus_season is listed and savingMinor is null
--   api.get_my_premium()            a live grant reports its own product (plus_season) and
--                                   its end as currentPeriodEnd
--   api.admin_get_premium_member()  each grant also carries productCode, paymentMethod,
--                                   paymentReference and amountMinor
--
-- OFF IS AN ANSWER, as for the rest of BotolaGO+: while premium_settings.mode is 'off', the two
-- member reads answer {"available": false}, checked before the step-up and before the caller is
-- read. Signed-in reads run, in order: the off answer, app_private.assert_mfa_step_up(), the
-- caller (PT401). Granted to authenticated, never to anon.
--
-- A SAISON IS A GRANT. api.admin_activate_premium_season writes one app_private.premium_grants
-- row from now to the end of the current Fantasy season, with the product, how it was paid, the
-- receipt reference and the amount. The membership check (app_private.has_premium) already
-- counts a live grant, so nothing else changes, and nothing is sold twice: an account whose
-- grant already lasts to the season end is refused (PT409 season_already_active).
--
-- THE RIB IS NOT IN THE AUDIT LOG. The audit of a change to the payment details names the fields
-- that changed, never their values, and the idempotency record keeps only {"saved": true}.

-- ---------------------------------------------------------------------------
-- api.premium_status: validUntil on each price
-- ---------------------------------------------------------------------------
create or replace function api.premium_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when s.mode = 'on' then jsonb_build_object(
      'enabled', true,
      'checkoutEnabled', s.checkout_enabled,
      'prices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'code', p.code,
          'periodMonths', p.period_months,
          'renews', p.renews,
          'priceMinor', p.price_minor,
          'currency', p.currency,
          'validUntil', case when p.period_months is null then app_private.premium_season_end() end
        ) order by p.sort_order, p.code)
        from app_private.premium_products p where p.active), '[]'::jsonb),
      'savingMinor', (
        select m.price_minor * 12 - y.price_minor
        from app_private.premium_products m
        join app_private.premium_products y on y.code = 'plus_yearly' and y.active
          and y.currency = m.currency
        where m.code = 'plus_monthly' and m.active and m.price_minor * 12 > y.price_minor),
      'editions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'code', e.code,
          'premium', e.premium,
          'finish', e.finish,
          'labels', jsonb_build_object('fr', e.label_fr, 'ar', e.label_ar)
        ) order by e.sort_order, e.code)
        from app.card_editions e
        where e.status = 'active'
          and (e.starts_at is null or e.starts_at <= statement_timestamp())
          and (e.ends_at is null or e.ends_at > statement_timestamp())), '[]'::jsonb)
    ) end
    from app_private.premium_settings s where s.id
  ), jsonb_build_object(
    'enabled', false, 'checkoutEnabled', false, 'prices', '[]'::jsonb,
    'savingMinor', null, 'editions', '[]'::jsonb));
$$;
revoke all on function api.premium_status() from public, anon, authenticated, service_role;
grant execute on function api.premium_status() to anon, authenticated, service_role;
comment on function api.premium_status() is
  'Public BotolaGO+ facts for the paywall: {enabled, checkoutEnabled, prices, savingMinor, editions}. enabled is true only when mode is on; otherwise nothing is disclosed (empty lists). prices lists the active products as {code, periodMonths, renews, priceMinor, currency, validUntil}: the Saison is plus_season, periodMonths null, renews false, validUntil the end of the current Fantasy season (null when there is none). Prices are tax included, in minor units (centimes). Never raises.';

-- ---------------------------------------------------------------------------
-- api.get_my_premium: a live grant reports its own product and end
-- ---------------------------------------------------------------------------
create or replace function api.get_my_premium()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  ent app.premium_entitlements%rowtype;
  prod app_private.premium_products%rowtype;
  grant_end timestamptz;
  grant_product text;
  v_state text;
  v_member boolean;
  chosen text;
begin
  select s.mode into mode from app_private.premium_settings s where s.id;
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  v_member := app_private.has_premium(actor);
  -- In preview only members (a grant or a valid entitlement: the owner, staff) see anything.
  if mode = 'preview' and not v_member then
    return jsonb_build_object('available', false);
  end if;

  select * into ent from app.premium_entitlements e where e.user_id = actor;
  if found then
    select * into prod from app_private.premium_products p where p.code = ent.product_code;
    v_state := app_private.premium_effective_state(
      ent.state, ent.source, ent.current_period_end, ent.grace_until);
  else
    v_state := 'none';
  end if;
  -- The live grant that lasts longest: its end and the product it was given for (null for a
  -- complimentary access given before the Saison).
  select g.ends_at, g.product_code into grant_end, grant_product
  from app_private.premium_grants g
  where g.user_id = actor and g.revoked_at is null
    and g.starts_at <= statement_timestamp() and g.ends_at > statement_timestamp()
  order by g.ends_at desc, g.created_at desc
  limit 1;
  select c.edition_code into chosen from app.card_edition_choices c where c.user_id = actor;

  return jsonb_build_object(
    'available', true,
    'isMember', v_member,
    'state', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then v_state else 'active' end,
    'productCode', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then ent.product_code else grant_product end,
    'source', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then ent.source else 'grant' end,
    'currentPeriodEnd', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then ent.current_period_end else grant_end end,
    'cancelAtPeriodEnd', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then v_state = 'cancelling' or ent.cancel_requested_at is not null
        or coalesce(not prod.renews, false)
      else true end,
    'graceUntil', case when v_state = 'grace' then ent.grace_until end,
    'chosenEdition', coalesce(chosen, 'standard'),
    'edition', app_private.card_edition_effective(actor, actor),
    'editions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', e.code,
        'premium', e.premium,
        'finish', e.finish,
        'labels', jsonb_build_object('fr', e.label_fr, 'ar', e.label_ar),
        'selectable', not e.premium or v_member
      ) order by e.sort_order, e.code)
      from app.card_editions e
      where e.status = 'active'
        and (e.starts_at is null or e.starts_at <= statement_timestamp())
        and (e.ends_at is null or e.ends_at > statement_timestamp())), '[]'::jsonb)
  );
end;
$$;
revoke all on function api.get_my_premium() from public, anon, authenticated, service_role;
grant execute on function api.get_my_premium() to authenticated, service_role;
comment on function api.get_my_premium() is
  'The caller''s BotolaGO+ membership: {available, isMember, state, productCode, source, currentPeriodEnd, cancelAtPeriodEnd, graceUntil, chosenEdition, edition, editions}. state is the effective state (none, active, cancelling, grace, on_hold, expired, refunded, revoked); an access given by staff (a Saison, product plus_season, or a complimentary access, product null) reads as active with source grant and currentPeriodEnd the grant''s end. {available:false} while off (and in preview for anyone who is not a member). Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.get_premium_payment_details: where the buyer pays
-- ---------------------------------------------------------------------------
create function api.get_premium_payment_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  details app_private.premium_payment_details%rowtype;
  prod app_private.premium_products%rowtype;
begin
  select s.mode into mode from app_private.premium_settings s where s.id;
  if mode is null or mode = 'off' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  select * into details from app_private.premium_payment_details d where d.id;
  if details.whatsapp_number is null then
    return jsonb_build_object('available', false);
  end if;
  select * into prod from app_private.premium_products p where p.code = 'plus_season';
  return jsonb_build_object(
    'available', true,
    'whatsapp', details.whatsapp_number,
    'bankHolder', details.bank_holder,
    'bankName', details.bank_name,
    'rib', details.rib,
    'cashplusName', details.cashplus_name,
    'noteFr', details.note_fr,
    'noteAr', details.note_ar,
    'amountMinor', coalesce(prod.price_minor, 20000),
    'currency', coalesce(prod.currency, 'MAD')
  );
end;
$$;
revoke all on function api.get_premium_payment_details() from public, anon, authenticated, service_role;
grant execute on function api.get_premium_payment_details() to authenticated;
comment on function api.get_premium_payment_details() is
  'Where to pay a Saison, for a signed-in account: {available, whatsapp, bankHolder, bankName, rib, cashplusName, noteFr, noteAr, amountMinor, currency}, with null for a detail the owner has not typed. {available:false} (and nothing else) while BotolaGO+ is off, or when no WhatsApp number is set. Step-up.';

-- ---------------------------------------------------------------------------
-- api.get_my_premium_pay_code: the caller's personal code
-- ---------------------------------------------------------------------------
create function api.get_my_premium_pay_code()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mode text;
  actor uuid;
  v_code text;
  attempt integer;
begin
  select s.mode into mode from app_private.premium_settings s where s.id;
  if mode is null or mode = 'off' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not exists (select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null) then
    raise exception using errcode = 'PT404', message = 'premium_account_not_found';
  end if;

  select c.code into v_code from app_private.premium_pay_codes c where c.user_id = actor;
  if v_code is null then
    -- A collision with another account's code (about one in a billion) just draws again; a
    -- concurrent first request of the same account keeps the first code.
    for attempt in 1..10 loop
      insert into app_private.premium_pay_codes (user_id, code)
      values (actor, app_private.premium_pay_code_new())
      on conflict do nothing;
      select c.code into v_code from app_private.premium_pay_codes c where c.user_id = actor;
      exit when v_code is not null;
    end loop;
    if v_code is null then
      raise exception using errcode = 'PT503', message = 'premium_pay_code_unavailable';
    end if;
  end if;
  return jsonb_build_object('available', true, 'code', v_code);
end;
$$;
revoke all on function api.get_my_premium_pay_code() from public, anon, authenticated, service_role;
grant execute on function api.get_my_premium_pay_code() to authenticated;
comment on function api.get_my_premium_pay_code() is
  'The caller''s personal payment code {available, code}, "BG-" and six characters, made on the first request and the same afterwards. {available:false} while BotolaGO+ is off. Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- Staff: the payment details (read, write)
-- ---------------------------------------------------------------------------
create function app_private.premium_payment_details_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bankHolder', d.bank_holder,
    'bankName', d.bank_name,
    'rib', d.rib,
    'cashplusName', d.cashplus_name,
    'whatsapp', d.whatsapp_number,
    'noteFr', d.note_fr,
    'noteAr', d.note_ar,
    'updatedAt', d.updated_at,
    'updatedByPrincipalId', d.updated_by_principal_id
  )
  from app_private.premium_payment_details d where d.id;
$$;
revoke all on function app_private.premium_payment_details_json() from public, anon, authenticated, service_role;
comment on function app_private.premium_payment_details_json() is
  'The payment details row as the staff screen reads it. No grant.';

create function api.admin_get_premium_payment_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_assert_permission('premium.read', false);
  return app_private.premium_payment_details_json();
end;
$$;

create function api.admin_set_premium_payment_details(
  p_details jsonb,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  allowed constant text[] := array['bankHolder', 'bankName', 'rib', 'cashplusName', 'whatsapp', 'noteFr', 'noteAr'];
  k text;
  v jsonb;
  clean jsonb := '{}'::jsonb;
  txt text;
  old_row app_private.premium_payment_details%rowtype;
  changed text[] := '{}';
begin
  actor := app_private.admin_assert_permission('premium.grant', true);
  if p_details is null or p_idempotency_key is null or jsonb_typeof(p_details) <> 'object' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;

  -- Only the seven known keys, each a string or null; blank means "not set". The WhatsApp
  -- number is typed the way people write it (spaces, dots, dashes, brackets) and stored as a
  -- plus sign and digits. Whatever is not sent is cleared: the form always sends everything.
  for k in select jsonb_object_keys(p_details) loop
    if not (k = any (allowed)) then
      raise exception using errcode = 'PT400', message = 'premium_payment_details_invalid';
    end if;
  end loop;
  foreach k in array allowed loop
    v := p_details -> k;
    if v is null or jsonb_typeof(v) = 'null' then
      txt := null;
    elsif jsonb_typeof(v) <> 'string' then
      raise exception using errcode = 'PT400', message = 'premium_payment_details_invalid';
    else
      txt := btrim(v #>> '{}');
      if k = 'whatsapp' and txt is not null then
        txt := regexp_replace(txt, '[ .()-]', '', 'g');
      end if;
      if txt = '' then
        txt := null;
      end if;
    end if;
    if txt is not null and (
      (k in ('bankHolder', 'bankName', 'cashplusName') and char_length(txt) > 120)
      or (k = 'rib' and txt !~ '^[A-Za-z0-9][A-Za-z0-9 .-]{8,38}[A-Za-z0-9]$')
      or (k = 'whatsapp' and txt !~ '^\+?[0-9]{8,16}$')
      or (k in ('noteFr', 'noteAr') and char_length(txt) > 300)
    ) then
      raise exception using errcode = 'PT400', message = 'premium_payment_details_invalid';
    end if;
    clean := clean || jsonb_build_object(k, txt);
  end loop;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'premium.set_payment_details', p_idempotency_key,
    jsonb_build_object('details', clean, 'reason', p_reason)
  );
  if prior is not null then
    -- The record keeps only {"saved": true} (no RIB in it): answer with the row as it is.
    return app_private.premium_payment_details_json();
  end if;

  select * into old_row from app_private.premium_payment_details d where d.id for update;
  if old_row.bank_holder is distinct from clean ->> 'bankHolder' then changed := changed || 'bankHolder'::text; end if;
  if old_row.bank_name is distinct from clean ->> 'bankName' then changed := changed || 'bankName'::text; end if;
  if old_row.rib is distinct from clean ->> 'rib' then changed := changed || 'rib'::text; end if;
  if old_row.cashplus_name is distinct from clean ->> 'cashplusName' then changed := changed || 'cashplusName'::text; end if;
  if old_row.whatsapp_number is distinct from clean ->> 'whatsapp' then changed := changed || 'whatsapp'::text; end if;
  if old_row.note_fr is distinct from clean ->> 'noteFr' then changed := changed || 'noteFr'::text; end if;
  if old_row.note_ar is distinct from clean ->> 'noteAr' then changed := changed || 'noteAr'::text; end if;

  update app_private.premium_payment_details set
    bank_holder = clean ->> 'bankHolder',
    bank_name = clean ->> 'bankName',
    rib = clean ->> 'rib',
    cashplus_name = clean ->> 'cashplusName',
    whatsapp_number = clean ->> 'whatsapp',
    note_fr = clean ->> 'noteFr',
    note_ar = clean ->> 'noteAr',
    updated_at = statement_timestamp(),
    updated_by_principal_id = actor
  where id;

  -- Names of the fields that changed, never their values.
  perform app_private.write_admin_audit(
    actor, 'premium.set_payment_details', 'premium', null, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    null,
    jsonb_build_object('changed', to_jsonb(changed))
  );

  perform app_private.admin_complete_idempotent_operation(
    actor, 'premium.set_payment_details', p_idempotency_key, jsonb_build_object('saved', true)
  );
  return app_private.premium_payment_details_json();
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: the member read now carries the payment record of each grant
-- ---------------------------------------------------------------------------
create or replace function api.admin_get_premium_member(
  p_user_id uuid,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  ent app.premium_entitlements%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('premium.read', false);
  if p_user_id is null or p_request_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;
  if not exists (select 1 from app.profiles profile where profile.id = p_user_id) then
    raise exception using errcode = 'PT404', message = 'premium_account_not_found';
  end if;
  select * into ent from app.premium_entitlements e where e.user_id = p_user_id;

  result := jsonb_build_object(
    'userId', p_user_id,
    'isMember', app_private.has_premium(p_user_id),
    'entitlement', case when ent.user_id is null then null else jsonb_build_object(
      'state', ent.state,
      'effectiveState', app_private.premium_effective_state(
        ent.state, ent.source, ent.current_period_end, ent.grace_until),
      'productCode', ent.product_code,
      'source', ent.source,
      'currentPeriodStart', ent.current_period_start,
      'currentPeriodEnd', ent.current_period_end,
      'graceUntil', ent.grace_until,
      'cancelRequestedAt', ent.cancel_requested_at,
      'lastEventAt', ent.last_event_at) end,
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'grantId', g.id, 'startsAt', g.starts_at, 'endsAt', g.ends_at, 'reason', g.reason,
        'revokedAt', g.revoked_at, 'productCode', g.product_code,
        'paymentMethod', g.payment_method, 'paymentReference', g.payment_reference,
        'amountMinor', g.amount_minor) order by g.created_at desc, g.id)
      from app_private.premium_grants g where g.user_id = p_user_id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventId', b.id, 'providerEventId', b.provider_event_id, 'provider', b.provider,
        'source', b.source, 'eventType', b.event_type, 'productCode', b.product_code,
        'occurredAt', b.occurred_at, 'outcome', b.outcome, 'stateBefore', b.state_before,
        'stateAfter', b.state_after, 'amountMinor', b.amount_minor, 'currency', b.currency
      ) order by b.occurred_at desc, b.id desc)
      from (
        select * from app_private.billing_events e2
        where e2.user_id = p_user_id order by e2.occurred_at desc, e2.id desc limit 20
      ) b), '[]'::jsonb)
  );

  perform app_private.write_admin_audit(
    actor, 'premium.view_member', 'premium', p_user_id, p_reason, p_request_id,
    gen_random_uuid(), null, null,
    jsonb_build_object('effectiveState', result #>> '{entitlement,effectiveState}')
  );
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: find a member by the payment code written in the transfer
-- ---------------------------------------------------------------------------
create function api.admin_find_premium_member_by_code(
  p_code text,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_user uuid;
begin
  perform app_private.admin_assert_permission('premium.read', false);
  if p_code is null or p_request_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- Typed by hand from a receipt: any case, spaces around it, the dash optional.
  v_code := upper(regexp_replace(btrim(p_code), '[ ]', '', 'g'));
  if v_code ~ '^BG[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    v_code := 'BG-' || substr(v_code, 3);
  end if;
  if v_code !~ '^BG-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception using errcode = 'PT400', message = 'premium_code_invalid';
  end if;
  select c.user_id into v_user from app_private.premium_pay_codes c where c.code = v_code;
  if v_user is null then
    raise exception using errcode = 'PT404', message = 'premium_code_not_found';
  end if;
  -- The same answer, with the same checks and the same audit entry, as reading the account.
  return api.admin_get_premium_member(v_user, p_reason, p_request_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: activate a Saison once the payment is checked
-- ---------------------------------------------------------------------------
create function api.admin_activate_premium_season(
  p_user_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  v_ref text;
  v_season uuid;
  v_end timestamptz;
  prod app_private.premium_products%rowtype;
  new_grant app_private.premium_grants%rowtype;
  v_amount integer;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('premium.grant', true);
  if p_user_id is null or p_payment_method is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_payment_method not in ('bank_transfer', 'cashplus', 'wafacash', 'free') then
    raise exception using errcode = 'PT400', message = 'premium_payment_method_invalid';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;
  -- The receipt reference: required for a paid method, optional for an offered Saison.
  v_ref := nullif(btrim(coalesce(p_payment_reference, '')), '');
  if v_ref is null and p_payment_method <> 'free' then
    raise exception using errcode = 'PT400', message = 'premium_payment_reference_required';
  end if;
  if v_ref is not null and (char_length(v_ref) > 80 or v_ref ~ '[[:cntrl:]]') then
    raise exception using errcode = 'PT400', message = 'premium_payment_reference_invalid';
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = p_user_id and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'premium_account_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'premium.activate_season', p_idempotency_key,
    jsonb_build_object('userId', p_user_id, 'method', p_payment_method, 'reference', v_ref,
      'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  -- One activation per account at a time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':premium', 0));

  v_season := app_private.fantasy_prize_current_season();
  if v_season is null then
    raise exception using errcode = 'PT409', message = 'premium_season_unavailable';
  end if;
  select season.ends_at into v_end from app.fantasy_seasons season where season.id = v_season;
  if v_end <= statement_timestamp() + interval '1 minute' then
    raise exception using errcode = 'PT409', message = 'premium_season_ended';
  end if;
  -- A sanity check, not a rule: a season end further than this is a data mistake.
  if v_end > statement_timestamp() + interval '400 days' then
    raise exception using errcode = 'PT400', message = 'premium_grant_period_invalid';
  end if;
  select * into prod from app_private.premium_products pr where pr.code = 'plus_season' and pr.active;
  if not found then
    raise exception using errcode = 'PT409', message = 'premium_product_unavailable';
  end if;
  if exists (
    select 1 from app_private.premium_grants g
    where g.user_id = p_user_id and g.revoked_at is null and g.ends_at >= v_end
  ) then
    raise exception using errcode = 'PT409', message = 'season_already_active';
  end if;

  v_amount := case when p_payment_method = 'free' then 0 else prod.price_minor end;
  insert into app_private.premium_grants (
    user_id, ends_at, reason, granted_by_principal_id,
    product_code, payment_method, payment_reference, amount_minor, currency)
  values (
    p_user_id, v_end, p_reason, actor,
    prod.code, p_payment_method, v_ref, v_amount, prod.currency)
  returning * into new_grant;

  perform app_private.write_admin_audit(
    actor, 'premium.activate_season', 'premium', p_user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    null,
    jsonb_build_object('grantId', new_grant.id, 'endsAt', new_grant.ends_at,
      'paymentMethod', new_grant.payment_method, 'paymentReference', new_grant.payment_reference,
      'amountMinor', new_grant.amount_minor)
  );

  result := jsonb_build_object(
    'grantId', new_grant.id, 'userId', p_user_id,
    'startsAt', new_grant.starts_at, 'endsAt', new_grant.ends_at,
    'productCode', new_grant.product_code, 'paymentMethod', new_grant.payment_method,
    'paymentReference', new_grant.payment_reference, 'amountMinor', new_grant.amount_minor,
    'currency', new_grant.currency);
  return app_private.admin_complete_idempotent_operation(
    actor, 'premium.activate_season', p_idempotency_key, result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and comments
-- ---------------------------------------------------------------------------
revoke all on function
  api.admin_get_premium_payment_details(),
  api.admin_set_premium_payment_details(jsonb, text, uuid),
  api.admin_get_premium_member(uuid, text, uuid),
  api.admin_find_premium_member_by_code(text, text, uuid),
  api.admin_activate_premium_season(uuid, text, text, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function
  api.admin_get_premium_payment_details(),
  api.admin_set_premium_payment_details(jsonb, text, uuid),
  api.admin_get_premium_member(uuid, text, uuid),
  api.admin_find_premium_member_by_code(text, text, uuid),
  api.admin_activate_premium_season(uuid, text, text, text, uuid)
to authenticated;
comment on function api.admin_get_premium_payment_details() is
  'Staff (premium.read): the payment details as typed by the owner {bankHolder, bankName, rib, cashplusName, whatsapp, noteFr, noteAr, updatedAt, updatedByPrincipalId}, null for a detail not set.';
comment on function api.admin_set_premium_payment_details(jsonb, text, uuid) is
  'Staff (premium.grant, recent authentication): saves the payment details (the seven keys of the read, all replaced; blank clears a detail; the WhatsApp number is stored as + and digits, 8 to 16), idempotent by key. The audit entry names the fields that changed, never their values. Answers the saved row.';
comment on function api.admin_get_premium_member(uuid, text, uuid) is
  'Staff (premium.read): one member''s entitlement, grants (with productCode, paymentMethod, paymentReference, amountMinor) and last 20 events (no payloads), with a reason; the read is written to the admin audit log.';
comment on function api.admin_find_premium_member_by_code(text, text, uuid) is
  'Staff (premium.read): the same answer as api.admin_get_premium_member for the account whose personal payment code (BG-XXXXXX, any case, dash optional) is given; PT400 premium_code_invalid, PT404 premium_code_not_found. Audited as that read.';
comment on function api.admin_activate_premium_season(uuid, text, text, text, uuid) is
  'Staff (premium.grant, recent authentication): activates the Saison for an account once its payment is checked: a grant from now to the end of the current Fantasy season, product plus_season, payment method (bank_transfer, cashplus, wafacash or free), receipt reference (required unless free), amount (the price, 0 when free). Refused with PT409 season_already_active when a live grant already lasts to the season end, premium_season_unavailable / premium_season_ended without a running season. Idempotent by key, audited as premium.activate_season.';

notify pgrst, 'reload schema';
