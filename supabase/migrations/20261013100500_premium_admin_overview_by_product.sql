-- BotolaGO+ (membership), part 6: members by product on the admin overview.
--
-- The /admin/plus screen shows, beside the members by state, how many members each product has
-- (docs/plans/BOTOLAGO_PLUS_PLAN.md section 5.9). api.admin_premium_overview() (20261013100200)
-- answers the counts by state and the product list with its prices, but not the counts by product.
-- This replaces that one function, signature unchanged, with the same body plus one key:
--
--   membersByProduct   { "<product code>": { "<effective state>": n, ... }, ... }
--
-- COUNTS ONLY, like the rest of the answer: no account, no id, nothing about any member. The states
-- are the same effective states as membersByState (the stored state with its dates applied), so a
-- product's counts add up to the total of membersByState. A product nobody holds, and a state nobody
-- is in, are absent rather than zero.
--
-- NOTHING ELSE CHANGES. Same security definer with an empty search_path, same gate
-- (premium.read, MFA through admin_assert_permission), same grants (authenticated only), same
-- comment style. No table, no other function, no job, no row. A database this migration has not
-- reached answers the older shape and the screen shows the by-product counts as unavailable.

create or replace function api.admin_premium_overview()
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
    'membersByProduct', coalesce((
      select jsonb_object_agg(by_product.product_code, by_product.states)
      from (
        select counted.product_code,
          jsonb_object_agg(counted.state, counted.n order by counted.state) as states
        from (
          select e.product_code,
            app_private.premium_effective_state(
              e.state, e.source, e.current_period_end, e.grace_until) as state,
            count(*) as n
          from app.premium_entitlements e
          group by 1, 2
        ) counted
        group by counted.product_code
      ) by_product), '{}'::jsonb),
    'liveGrants', (
      select count(distinct g.user_id) from app_private.premium_grants g
      where g.revoked_at is null and g.starts_at <= statement_timestamp()
        and g.ends_at > statement_timestamp()),
    'lastEventAt', (select max(b.received_at) from app_private.billing_events b)
  );
end;
$$;

-- create or replace keeps the grants; stated again so this file reads on its own.
revoke all on function api.admin_premium_overview() from public, anon, authenticated, service_role;
grant execute on function api.admin_premium_overview() to authenticated;
comment on function api.admin_premium_overview() is
  'Staff (premium.read): BotolaGO+ settings, products, members by effective state and by product (counts only, no member listed) and live grants.';

notify pgrst, 'reload schema';
