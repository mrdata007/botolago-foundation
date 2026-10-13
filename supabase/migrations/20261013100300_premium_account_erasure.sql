-- BotolaGO+ (membership), part 4: the account erasure learns about memberships.
--
-- app_private.account_deletion_erase (20261006143700, patched by 20261008123100)
-- deletes auth.users, which cascades through app.profiles. For BotolaGO+ that
-- already removes, with the account: the entitlement (app.premium_entitlements),
-- the complimentary grants, the customer ids at billing providers
-- (app_private.billing_customers) and the chosen card edition
-- (app.card_edition_choices). What must NOT simply go is the accounting
-- record: app_private.billing_events keeps its rows (amounts, dates, products,
-- provider event ids) for the legal retention period, pseudonymised
-- (plan 5.8). The retention period is 5 years (owner decision, 2026-10-13); no
-- purge ships and no job is scheduled, so the pseudonymised rows stay until a
-- reviewed purge is added.
--
-- This migration adds three things to the erasure, in the same style as
-- 20261008123100 (the function is patched in place: each exact text is
-- replaced once, and the migration stops if an anchor is not found exactly
-- once or the definition would not change; CREATE OR REPLACE keeps owner and
-- grants):
--
--   1. app_private.premium_erase_user(uuid): pseudonymises the member's billing
--      events (user_id cleared, the raw payload emptied, a stable pseudonym
--      that keeps one erased member's events together, erased_at set).
--   2. A per-member advisory lock, the same key api.service_apply_billing_event
--      takes, so an event for the member cannot land half-way through the
--      erasure.
--   3. A refusal (PT409 account_deletion_subscription_active) while the member
--      still holds a renewing web subscription that is active or in grace:
--      the billing worker must cancel it at the provider first (plan 5.8). The
--      worker releases the request and tries again on its next hourly run.
--      Store subscriptions (Apple, Google) can only be cancelled by the member
--      in the store and are not refused; the terms say so.

create function app_private.premium_erase_user(p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update app_private.billing_events set
    user_id = null,
    subject_pseudonym = 'erased-' || substr(
      encode(sha256(convert_to(p_user::text, 'UTF8')), 'hex'), 1, 16),
    payload = '{}'::jsonb,
    erased_at = statement_timestamp()
  where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function app_private.premium_erase_user(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.premium_erase_user(uuid) to postgres;
comment on function app_private.premium_erase_user(uuid) is
  'Pseudonymises a member''s billing events before the account is erased (accounting records are kept): user_id cleared, payload emptied, a stable pseudonym, erased_at. Returns the number of events. Called by app_private.account_deletion_erase. Executable by postgres only.';

do $erase$
declare
  definition text;
  guard_anchor text;
  guard_text text;
  erase_anchor text;
  erase_text text;
begin
  definition := pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure);

  guard_anchor := '  perform app_private.account_deletion_disable(target);
';
  guard_text := '  -- BotolaGO+: serialise with the billing writer for this member, and do not
  -- erase an account that is still being billed on the web.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target::text || '':premium'', 0)
  );
  if exists (
    select 1
    from app.premium_entitlements entitlement
    join app_private.premium_products product on product.code = entitlement.product_code
    where entitlement.user_id = target
      and entitlement.source = ''web''
      and product.renews
      and entitlement.state in (''active'', ''grace'')
  ) then
    raise exception using errcode = ''PT409'', message = ''account_deletion_subscription_active'';
  end if;
' || guard_anchor;

  erase_anchor := '  -- The account itself. Cascades to the profile and every per-account table.
  delete from auth.users where id = target;
';
  erase_text := '  -- BotolaGO+: the billing events are accounting records, kept pseudonymised.
  perform app_private.premium_erase_user(target);

' || erase_anchor;

  if (length(definition) - length(replace(definition, guard_anchor, ''))) / length(guard_anchor) <> 1
    or (length(definition) - length(replace(definition, erase_anchor, ''))) / length(erase_anchor) <> 1 then
    raise exception 'premium erase: the erasure is not the 20261006143700 version (anchors not found exactly once)';
  end if;
  definition := replace(definition, guard_anchor, guard_text);
  definition := replace(definition, erase_anchor, erase_text);
  execute definition;
end;
$erase$;
