-- BotolaGO+ (membership), part 3: the API.
--
-- Over the tables of 20261013100000 and 20261013100100:
--
--   api.premium_status()                      anon too; never raises
--   api.get_my_premium()                      the caller's membership
--   api.service_apply_billing_event(p_event)  service_role only; the one writer
--   api.admin_premium_overview()              counts by state (staff)
--   api.admin_get_premium_member(...)         one member, audited (staff)
--   api.admin_grant_premium(...)              a complimentary membership (staff)
--   api.admin_revoke_premium(...)             end one early (staff)
--
-- OFF IS AN ANSWER, not an error: while premium_settings.mode is 'off' the two
-- reads answer {"available": false} (premium_status: enabled false), checked
-- before the step-up and before the caller is read. Signed-in reads run, in
-- order: the off answer, app_private.assert_mfa_step_up(), the caller (PT401).
-- Granted to authenticated and service_role, never to anon, except
-- premium_status (public prices, nothing about anyone).
--
-- THE ONE WRITER. Only a provider's VERIFIED event changes a membership, and
-- only through api.service_apply_billing_event. A browser cannot write any of
-- these tables. The function:
--   1. refuses a caller that is not the service role (PT403);
--   2. refuses, retryable (PT503 premium_billing_paused), while
--      premium_settings.billing_paused is on, writing nothing, so a database
--      change can run with no billing writer (providers retry);
--   3. serialises per member (advisory lock) and answers a replayed
--      provider_event_id with the first outcome, writing nothing;
--   4. stores the event once with its outcome, then moves the state machine
--      (app_private.premium_next_state) when the event applies.
--
-- THE EVENT (all keys camelCase; the worker maps each provider to this):
--   providerEventId  text, 1..200, UNIQUE across providers (prefix it with the
--                    provider: 'revenuecat:...')
--   provider         text, e.g. cmi, payzone, revenuecat
--   source           web | apple | google | grant
--   eventType        purchase | renewal | cancel | uncancel | payment_failed |
--                    hold | expire | refund | revoke
--   userId           uuid of the member
--   productCode      plus_monthly | plus_yearly (required for purchase, renewal)
--   occurredAt       when it happened at the provider (not in the future by
--                    more than a day); an event older than the member's last
--                    applied one is stored and ignored (ignored_stale)
--   periodStart, periodEnd, graceUntil   optional, as the provider says them;
--                    a missing period is the product's period from the start
--   amountMinor, currency   optional, for the accounting record
--   signatureVerified  boolean, true only if the worker verified the provider's
--                    signature; false is stored and ignored (rejected_signature)
--   payload          object, up to 16 KB, the raw provider payload
-- It answers {eventId, duplicate, outcome, stateBefore, stateAfter}. Outcomes:
--   applied, ignored_state (not valid in that state), ignored_stale,
--   ignored_user (no such or closing account), ignored_product,
--   rejected_signature.

-- ---------------------------------------------------------------------------
-- api.premium_status: what the public paywall may know
-- ---------------------------------------------------------------------------
create function api.premium_status()
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
          'currency', p.currency
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
  'Public BotolaGO+ facts for the paywall: {enabled, checkoutEnabled, prices, savingMinor, editions}. enabled is true only when mode is on; otherwise nothing is disclosed (empty lists). Prices are tax included, in minor units (centimes). Never raises.';

-- ---------------------------------------------------------------------------
-- api.get_my_premium
-- ---------------------------------------------------------------------------
create function api.get_my_premium()
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
  -- In preview only holders of a grant (the owner, staff) see anything.
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
  select max(g.ends_at) into grant_end
  from app_private.premium_grants g
  where g.user_id = actor and g.revoked_at is null
    and g.starts_at <= statement_timestamp() and g.ends_at > statement_timestamp();
  select c.edition_code into chosen from app.card_edition_choices c where c.user_id = actor;

  return jsonb_build_object(
    'available', true,
    'isMember', v_member,
    'state', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then v_state else 'active' end,
    'productCode', case when v_state in ('active', 'cancelling', 'grace') or grant_end is null
      then ent.product_code end,
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
  'The caller''s BotolaGO+ membership: {available, isMember, state, productCode, source, currentPeriodEnd, cancelAtPeriodEnd, graceUntil, chosenEdition, edition, editions}. state is the effective state (none, active, cancelling, grace, on_hold, expired, refunded, revoked); a complimentary grant reads as active with source grant. {available:false} while off (and in preview for anyone without a grant). Signed-in, step-up.';

-- ---------------------------------------------------------------------------
-- api.service_apply_billing_event
-- ---------------------------------------------------------------------------
create function api.service_apply_billing_event(p_event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.premium_settings%rowtype;
  v_event_id text;
  v_provider text;
  v_source text;
  v_type text;
  v_user uuid;
  v_product text;
  v_occurred timestamptz;
  v_pstart timestamptz;
  v_pend timestamptz;
  v_grace timestamptz;
  v_amount integer;
  v_currency text;
  v_verified boolean;
  v_payload jsonb;
  dup app_private.billing_events%rowtype;
  profile_found boolean;
  profile_open boolean;
  ent app.premium_entitlements%rowtype;
  have_ent boolean;
  prod app_private.premium_products%rowtype;
  v_old text;
  v_new text;
  v_outcome text;
  v_prod_code text;
  v_start timestamptz;
  v_end timestamptz;
  v_grace_until timestamptz;
  v_cancel timestamptz;
  v_source_after text;
  v_prod_after text;
  v_id bigint;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'premium_access_denied';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  -- Read the event; a malformed value is a client error, not a 500.
  begin
    v_event_id := p_event ->> 'providerEventId';
    v_provider := p_event ->> 'provider';
    v_source := p_event ->> 'source';
    v_type := p_event ->> 'eventType';
    v_user := (p_event ->> 'userId')::uuid;
    v_product := p_event ->> 'productCode';
    v_occurred := (p_event ->> 'occurredAt')::timestamptz;
    v_pstart := (p_event ->> 'periodStart')::timestamptz;
    v_pend := (p_event ->> 'periodEnd')::timestamptz;
    v_grace := (p_event ->> 'graceUntil')::timestamptz;
    v_amount := (p_event ->> 'amountMinor')::integer;
    v_currency := p_event ->> 'currency';
    v_payload := coalesce(p_event -> 'payload', '{}'::jsonb);
  exception
    when sqlstate '22007' or sqlstate '22008' or sqlstate '22P02' or sqlstate '22003' then
      raise exception using errcode = 'PT400', message = 'validation_failed';
  end;
  if jsonb_typeof(p_event -> 'signatureVerified') is distinct from 'boolean' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  v_verified := (p_event ->> 'signatureVerified')::boolean;
  if v_event_id is null or v_event_id <> btrim(v_event_id) or char_length(v_event_id) not between 1 and 200
    or v_provider is null or v_provider !~ '^[a-z][a-z0-9_]{1,31}$'
    or v_source is null or v_source not in ('web', 'apple', 'google', 'grant')
    or v_type is null or v_type not in ('purchase', 'renewal', 'cancel', 'uncancel',
      'payment_failed', 'hold', 'expire', 'refund', 'revoke')
    or v_user is null
    or v_occurred is null or v_occurred > statement_timestamp() + interval '1 day'
    or (v_pstart is not null and v_pend is not null and v_pend <= v_pstart)
    or (v_amount is not null and v_amount < 0)
    or (v_currency is not null and v_currency !~ '^[A-Z]{3}$')
    or (v_product is not null and v_product !~ '^[a-z][a-z0-9_]{2,31}$')
    or (v_type in ('purchase', 'renewal') and v_product is null)
    or jsonb_typeof(v_payload) <> 'object' or octet_length(v_payload::text) > 16384
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into settings from app_private.premium_settings s where s.id;
  if settings.billing_paused then
    raise exception using errcode = 'PT503', message = 'premium_billing_paused';
  end if;

  -- One event at a time per member; a replay answers the first outcome.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':premium', 0));
  select * into dup from app_private.billing_events b where b.provider_event_id = v_event_id;
  if found then
    return jsonb_build_object('eventId', dup.id, 'duplicate', true, 'outcome', dup.outcome,
      'stateBefore', dup.state_before, 'stateAfter', dup.state_after);
  end if;

  select true, p.deleted_at is null into profile_found, profile_open
  from app.profiles p where p.id = v_user;
  profile_found := coalesce(profile_found, false);
  profile_open := coalesce(profile_open, false);

  select * into ent from app.premium_entitlements e where e.user_id = v_user for update;
  have_ent := found;
  v_old := case when have_ent then ent.state else 'none' end;
  v_new := v_old;
  v_prod_code := coalesce(v_product, ent.product_code);
  if v_prod_code is not null then
    select * into prod from app_private.premium_products pr where pr.code = v_prod_code;
  end if;

  if not v_verified then
    v_outcome := 'rejected_signature';
  elsif not profile_found or not profile_open then
    v_outcome := 'ignored_user';
  elsif v_type in ('purchase', 'renewal') and (
      prod.code is null or (v_type = 'purchase' and not prod.active)) then
    v_outcome := 'ignored_product';
  elsif have_ent and v_occurred < ent.last_event_at then
    v_outcome := 'ignored_stale';
  elsif have_ent and v_type not in ('purchase', 'renewal') and v_source <> ent.source then
    -- A store event does not end a web membership, nor the other way round.
    v_outcome := 'ignored_state';
  else
    v_new := app_private.premium_next_state(v_old, v_type);
    if v_new is null then
      v_new := v_old;
      v_outcome := 'ignored_state';
    else
      v_outcome := 'applied';
    end if;
  end if;

  -- The event is stored once, with its outcome, before anything moves.
  insert into app_private.billing_events (
    provider_event_id, provider, source, event_type, user_id, product_code, occurred_at,
    period_start, period_end, grace_until, amount_minor, currency, signature_verified,
    outcome, state_before, state_after, payload
  ) values (
    v_event_id, v_provider, v_source, v_type,
    case when profile_found then v_user end,
    prod.code, v_occurred, v_pstart, v_pend, v_grace, v_amount, v_currency, v_verified,
    v_outcome, v_old, v_new, v_payload
  )
  on conflict (provider_event_id) do nothing
  returning id into v_id;
  if v_id is null then
    select * into dup from app_private.billing_events b where b.provider_event_id = v_event_id;
    return jsonb_build_object('eventId', dup.id, 'duplicate', true, 'outcome', dup.outcome,
      'stateBefore', dup.state_before, 'stateAfter', dup.state_after);
  end if;

  if v_outcome = 'applied' then
    v_start := ent.current_period_start;
    v_end := ent.current_period_end;
    v_grace_until := ent.grace_until;
    v_cancel := ent.cancel_requested_at;
    v_source_after := ent.source;
    v_prod_after := ent.product_code;
    if v_type in ('purchase', 'renewal') then
      v_prod_after := prod.code;
      v_start := coalesce(v_pstart, v_occurred);
      v_end := coalesce(v_pend, v_start + make_interval(months => prod.period_months::integer));
      -- Buying again while still a member never shortens what was paid for.
      if v_type = 'purchase' and have_ent and v_old in ('active', 'cancelling', 'grace') then
        v_end := greatest(v_end, ent.current_period_end);
      end if;
      v_grace_until := null;
      v_cancel := null;
      v_source_after := v_source;
    elsif v_type = 'cancel' then
      v_cancel := v_occurred;
    elsif v_type = 'uncancel' then
      v_cancel := null;
    elsif v_type = 'payment_failed' then
      -- Retries inside one grace do not extend it; the provider's own date wins.
      v_grace_until := coalesce(v_grace,
        case when v_old = 'grace' then ent.grace_until end,
        greatest(ent.current_period_end, v_occurred) + interval '7 days');
    end if;
    if v_end <= v_start then
      raise exception using errcode = 'PT400', message = 'validation_failed';
    end if;

    insert into app.premium_entitlements (
      user_id, state, product_code, source, current_period_start, current_period_end,
      grace_until, cancel_requested_at, last_event_at, last_provider_event_id
    ) values (
      v_user, v_new, v_prod_after, v_source_after, v_start, v_end,
      v_grace_until, v_cancel, v_occurred, v_event_id
    )
    on conflict (user_id) do update set
      state = excluded.state,
      product_code = excluded.product_code,
      source = excluded.source,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      grace_until = excluded.grace_until,
      cancel_requested_at = excluded.cancel_requested_at,
      last_event_at = excluded.last_event_at,
      last_provider_event_id = excluded.last_provider_event_id;
  end if;

  return jsonb_build_object('eventId', v_id, 'duplicate', false, 'outcome', v_outcome,
    'stateBefore', v_old, 'stateAfter', v_new);
end;
$$;
revoke all on function api.service_apply_billing_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function api.service_apply_billing_event(jsonb) to service_role;
comment on function api.service_apply_billing_event(jsonb) is
  'The one writer of BotolaGO+ memberships. Service role only. Stores a verified provider event once (providerEventId unique: a replay answers the first outcome and writes nothing) and moves the entitlement through the state machine (app_private.premium_next_state). Refuses retryably (PT503 premium_billing_paused) while billing is paused. Never trusts a client.';

-- ---------------------------------------------------------------------------
-- Staff: permissions
-- ---------------------------------------------------------------------------
insert into app_private.admin_permissions (name, domain, description, requires_recent_auth)
values
  ('premium.read', 'premium',
    'Reads the BotolaGO+ overview (counts by state) and, with a reason, one member''s membership.',
    false),
  ('premium.grant', 'premium',
    'Gives a complimentary BotolaGO+ membership to an account, and ends one early.',
    true)
on conflict (name) do nothing;

insert into app_private.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from app_private.admin_roles role
join app_private.admin_permissions permission on permission.name in ('premium.read', 'premium.grant')
where role.name = 'platform_admin'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Staff: overview (counts only, no member list)
-- ---------------------------------------------------------------------------
create function api.admin_premium_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_assert_permission('premium.read', false);
  return jsonb_build_object(
    'settings', (
      select jsonb_build_object('mode', s.mode, 'checkoutEnabled', s.checkout_enabled,
        'billingPaused', s.billing_paused)
      from app_private.premium_settings s where s.id),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('code', p.code, 'periodMonths', p.period_months,
        'renews', p.renews, 'priceMinor', p.price_minor, 'currency', p.currency,
        'active', p.active) order by p.sort_order, p.code)
      from app_private.premium_products p), '[]'::jsonb),
    'membersByState', coalesce((
      select jsonb_object_agg(counted.state, counted.n)
      from (
        select app_private.premium_effective_state(
            e.state, e.source, e.current_period_end, e.grace_until) as state,
          count(*) as n
        from app.premium_entitlements e
        group by 1
      ) counted), '{}'::jsonb),
    'liveGrants', (
      select count(distinct g.user_id) from app_private.premium_grants g
      where g.revoked_at is null and g.starts_at <= statement_timestamp()
        and g.ends_at > statement_timestamp()),
    'lastEventAt', (select max(b.received_at) from app_private.billing_events b)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: one member (audited read)
-- ---------------------------------------------------------------------------
create function api.admin_get_premium_member(
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
        'revokedAt', g.revoked_at) order by g.created_at desc, g.id)
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
-- Staff: grant and revoke a complimentary membership
-- ---------------------------------------------------------------------------
create function api.admin_grant_premium(
  p_user_id uuid,
  p_ends_at timestamptz,
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
  new_grant app_private.premium_grants%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('premium.grant', true);
  if p_user_id is null or p_ends_at is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;
  if p_ends_at <= statement_timestamp() + interval '1 minute'
    or p_ends_at > statement_timestamp() + interval '400 days' then
    raise exception using errcode = 'PT400', message = 'premium_grant_period_invalid';
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = p_user_id and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'premium_account_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'premium.grant_member', p_idempotency_key,
    jsonb_build_object('userId', p_user_id, 'endsAt', p_ends_at, 'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  insert into app_private.premium_grants (user_id, ends_at, reason, granted_by_principal_id)
  values (p_user_id, p_ends_at, p_reason, actor)
  returning * into new_grant;

  perform app_private.write_admin_audit(
    actor, 'premium.grant_member', 'premium', p_user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    null,
    jsonb_build_object('grantId', new_grant.id, 'endsAt', new_grant.ends_at)
  );

  result := jsonb_build_object('grantId', new_grant.id, 'userId', p_user_id,
    'startsAt', new_grant.starts_at, 'endsAt', new_grant.ends_at);
  return app_private.admin_complete_idempotent_operation(
    actor, 'premium.grant_member', p_idempotency_key, result
  );
end;
$$;

create function api.admin_revoke_premium(
  p_grant_id uuid,
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
  target app_private.premium_grants%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('premium.grant', true);
  if p_grant_id is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'premium_reason_invalid';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'premium.revoke_grant', p_idempotency_key,
    jsonb_build_object('grantId', p_grant_id, 'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  select * into target from app_private.premium_grants g where g.id = p_grant_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'premium_grant_not_found';
  end if;
  if target.revoked_at is not null then
    raise exception using errcode = 'PT409', message = 'premium_grant_already_revoked';
  end if;

  update app_private.premium_grants set
    revoked_at = statement_timestamp(),
    revoked_by_principal_id = actor,
    revoke_reason = p_reason
  where id = p_grant_id;

  perform app_private.write_admin_audit(
    actor, 'premium.revoke_grant', 'premium', target.user_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('grantId', target.id, 'endsAt', target.ends_at),
    jsonb_build_object('grantId', target.id, 'revoked', true)
  );

  result := jsonb_build_object('grantId', target.id, 'userId', target.user_id, 'revoked', true);
  return app_private.admin_complete_idempotent_operation(
    actor, 'premium.revoke_grant', p_idempotency_key, result
  );
end;
$$;

revoke all on function
  api.admin_premium_overview(),
  api.admin_get_premium_member(uuid, text, uuid),
  api.admin_grant_premium(uuid, timestamptz, text, uuid),
  api.admin_revoke_premium(uuid, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function
  api.admin_premium_overview(),
  api.admin_get_premium_member(uuid, text, uuid),
  api.admin_grant_premium(uuid, timestamptz, text, uuid),
  api.admin_revoke_premium(uuid, text, uuid)
to authenticated;
comment on function api.admin_premium_overview() is
  'Staff (premium.read): BotolaGO+ settings, products, members by effective state (counts only) and live grants.';
comment on function api.admin_get_premium_member(uuid, text, uuid) is
  'Staff (premium.read): one member''s entitlement, grants and last 20 events (no payloads), with a reason; the read is written to the admin audit log.';
comment on function api.admin_grant_premium(uuid, timestamptz, text, uuid) is
  'Staff (premium.grant, recent authentication): gives an account a complimentary membership until p_ends_at (at most 400 days), idempotent by key, audited.';
comment on function api.admin_revoke_premium(uuid, text, uuid) is
  'Staff (premium.grant, recent authentication): ends a complimentary membership now, idempotent by key, audited.';

notify pgrst, 'reload schema';
