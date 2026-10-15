-- BotolaGO+ (membership), the API (20261013100200): api.premium_status,
-- api.get_my_premium and the four staff functions (the overview also by product, 20261013100500).
--
-- Covered: grants and shape; "off is an answer" and the order (off answer, step-up,
-- caller); the public status (the Saison at 200 MAD, no saving, the five editions);
-- preview shows only grant holders; every state of get_my_premium with the exact key set;
-- the staff gate (staff only, second factor, recent authentication), reasons, period
-- limits, idempotency, audit, revoke, the audited member read, counts only in the overview.
--
-- Accounts: M member (monthly), Y member (yearly), N nobody, V verified MFA factor,
-- G complimentary grant, S platform admin (aal2 session), X signed in, not staff.
begin;
select extensions.plan(59);
select set_config('app.environment', 'test', true);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('bc4e0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.keys(j jsonb) returns text language sql as $$
  select coalesce(string_agg(k, ',' order by k collate "C"), '<none>') from jsonb_object_keys(j) k
$$;
-- One expression as a user (aal as given), a visitor (null user) or anon; its jsonb or {"__error": ...}.
create function pg_temp.run(p_user uuid, p_aal text, p_expr text, p_role text default 'authenticated')
returns jsonb language plpgsql as $$
declare result text;
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then jsonb_build_object('role', p_role)::text
      else jsonb_build_object('sub', p_user, 'role', p_role, 'aal', p_aal,
        'session_id', pg_temp.u(500 + (p_user = pg_temp.u(6))::integer))::text end, true);
  begin
    execute format('set local role %I', p_role);
    execute format('select (%s)::text', p_expr) into result;
    reset role;
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    return jsonb_build_object('__error', sqlstate || ' ' || sqlerrm);
  end;
  perform set_config('request.jwt.claims', '', true);
  return result::jsonb;
end $$;
create function pg_temp.mine(p_user uuid) returns jsonb language sql as $$
  select pg_temp.run(p_user, 'aal1', 'api.get_my_premium()')
$$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'premium-api-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'premium_api_' || n, 'display_name', 'Premium API ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 7) n;
-- 1 M, 2 Y, 3 N, 4 V, 5 G, 6 S, 7 X
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.u(900), pg_temp.u(4), 'V TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()),
  (pg_temp.u(901), pg_temp.u(6), 'S TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp());
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  (pg_temp.u(501), pg_temp.u(6), statement_timestamp(), statement_timestamp(), 'aal2'),
  (pg_temp.u(500), pg_temp.u(7), statement_timestamp(), statement_timestamp(), 'aal2');
select extensions.lives_ok(
  format($$select api.admin_bootstrap_first_platform_admin(%L,
    'Bootstrap deterministic membership test platform administrator.', true)$$, pg_temp.u(6)),
  'the fixture bootstraps one platform administrator');

insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
  current_period_end, last_event_at)
values
  (pg_temp.u(1), 'active', 'plus_monthly', 'web', statement_timestamp() - interval '10 days',
    statement_timestamp() + interval '20 days', statement_timestamp() - interval '10 days'),
  (pg_temp.u(2), 'active', 'plus_yearly', 'apple', statement_timestamp() - interval '10 days',
    statement_timestamp() + interval '355 days', statement_timestamp() - interval '10 days');

-- ---------------------------------------------------------------------------
-- Shape and grants
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg(f.sig || ':' || concat_ws(',', p.prosecdef, p.proconfig = array['search_path=""'],
      has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
      has_function_privilege('service_role', p.oid, 'execute')), '|' order by f.n)
   from (values (1, 'api.premium_status()'), (2, 'api.get_my_premium()'), (3, 'api.choose_card_design(text)'),
     (4, 'api.admin_premium_overview()'), (5, 'api.admin_get_premium_member(uuid,text,uuid)'),
     (6, 'api.admin_grant_premium(uuid,timestamptz,text,uuid)'), (7, 'api.admin_revoke_premium(uuid,text,uuid)'),
     (8, 'api.service_apply_billing_event(jsonb)')) f(n, sig)
   join pg_proc p on p.oid = to_regprocedure(f.sig)),
  'api.premium_status():t,t,t,t,t|api.get_my_premium():t,t,f,t,t|api.choose_card_design(text):t,t,f,t,t'
  || '|api.admin_premium_overview():t,t,f,t,f|api.admin_get_premium_member(uuid,text,uuid):t,t,f,t,f'
  || '|api.admin_grant_premium(uuid,timestamptz,text,uuid):t,t,f,t,f|api.admin_revoke_premium(uuid,text,uuid):t,t,f,t,f'
  || '|api.service_apply_billing_event(jsonb):t,t,f,f,t',
  'security definer with an empty search_path; status for everyone, the member reads for signed-in callers and the service role, the staff functions for signed-in callers (the gate inside decides), the writer for the service role alone');

-- ---------------------------------------------------------------------------
-- Off is an answer
-- ---------------------------------------------------------------------------
select extensions.is(api.premium_status(),
  '{"enabled": false, "checkoutEnabled": false, "prices": [], "savingMinor": null, "editions": []}'::jsonb,
  'off: the public status discloses nothing');
select extensions.is(pg_temp.mine(pg_temp.u(1)), '{"available": false}'::jsonb,
  'off: even a paying member gets {available:false}');
select extensions.is(pg_temp.run(pg_temp.u(4), 'aal1', 'api.get_my_premium()'), '{"available": false}'::jsonb,
  'off is answered before the step-up: a verified factor at aal1 is not asked for a challenge');
select extensions.is(pg_temp.run(null, null, 'api.get_my_premium()', 'anon') ->> '__error',
  '42501 permission denied for function get_my_premium', 'anon cannot call it');
select extensions.is(pg_temp.run(null, null, 'api.premium_status()', 'anon') ->> 'enabled', 'false',
  'but anon can read the public status');

-- ---------------------------------------------------------------------------
-- Preview: only grant holders
-- ---------------------------------------------------------------------------
select app_private.premium_configure('preview');
select extensions.is(api.premium_status() ->> 'enabled', 'false',
  'preview: the public status still says disabled');
select extensions.is(pg_temp.mine(pg_temp.u(1)) ->> 'isMember', 'true',
  'preview: a paying member (a staff test-mode purchase) is a member, as in on');
select extensions.is(pg_temp.mine(pg_temp.u(3)), '{"available": false}'::jsonb,
  'preview: someone with neither a grant nor an entitlement sees nothing');
insert into app_private.premium_grants (user_id, ends_at, reason, granted_by_principal_id)
select pg_temp.u(5), statement_timestamp() + interval '30 days', 'Preview for the owner and staff',
  (select id from app_private.staff_principals limit 1);
select extensions.is(
  pg_temp.mine(pg_temp.u(5)) ->> 'available' || ',' || (pg_temp.mine(pg_temp.u(5)) ->> 'isMember'),
  'true,true', 'preview: a grant holder sees the membership and is a member');

-- ---------------------------------------------------------------------------
-- On
-- ---------------------------------------------------------------------------
select app_private.premium_configure('on');
select extensions.is(api.premium_status(),
  jsonb_build_object('enabled', true, 'checkoutEnabled', false,
    'prices', jsonb_build_array(
      jsonb_build_object('code', 'plus_season', 'periodMonths', null, 'renews', false, 'priceMinor', 20000,
        'currency', 'MAD', 'validUntil', app_private.premium_season_end())),
    'savingMinor', null,
    'editions', (select jsonb_agg(jsonb_build_object('code', e.code, 'premium', e.premium, 'finish', e.finish,
        'labels', jsonb_build_object('fr', e.label_fr, 'ar', e.label_ar)) order by e.sort_order) from app.card_editions e)),
  'on: the Saison at 200 MAD (does not renew, no months, valid until the season end), the old monthly and yearly products are not listed, no saving, the five editions; checkout still off');
select app_private.premium_configure(null, true);
select extensions.is(api.premium_status() ->> 'checkoutEnabled', 'true', 'checkout enabled shows in the status');
select app_private.premium_configure(null, false);
select extensions.is(
  pg_temp.run(null, null, 'api.premium_status() -> ''prices'' -> 0 -> ''priceMinor''', 'anon'),
  '20000'::jsonb, 'anon reads the price too');

-- get_my_premium
select extensions.is(pg_temp.run(pg_temp.u(4), 'aal1', 'api.get_my_premium()') ->> '__error',
  'PT403 mfa_required', 'on: a verified factor at aal1 gets PT403 mfa_required');
select extensions.is(pg_temp.run(pg_temp.u(4), 'aal2', 'api.get_my_premium()') ->> 'available', 'true',
  'and at aal2 it answers');
select extensions.is(pg_temp.run(null, null, 'api.get_my_premium()') ->> '__error',
  'PT401 authentication_required', 'a role without a user is PT401');

select extensions.is(pg_temp.keys(pg_temp.mine(pg_temp.u(3))),
  'available,cancelAtPeriodEnd,chosenEdition,currentPeriodEnd,edition,editions,graceUntil,isMember,productCode,source,state',
  'the answer has exactly these eleven keys');
select extensions.is(
  (select concat_ws('/', m ->> 'isMember', m ->> 'state', m ->> 'productCode', m ->> 'source',
      m ->> 'cancelAtPeriodEnd', m ->> 'chosenEdition', m ->> 'edition',
      (select count(*) from jsonb_array_elements(m -> 'editions')),
      (select count(*) from jsonb_array_elements(m -> 'editions') e where (e ->> 'selectable')::boolean))
   from (select pg_temp.mine(pg_temp.u(3)) as m) x),
  'false/none/false/standard/standard/5/1', 'N: not a member, state none, standard edition, only standard selectable');
select extensions.is(
  (select concat_ws('/', m ->> 'isMember', m ->> 'state', m ->> 'productCode', m ->> 'source',
      m ->> 'cancelAtPeriodEnd', (select count(*) from jsonb_array_elements(m -> 'editions') e where (e ->> 'selectable')::boolean))
   from (select pg_temp.mine(pg_temp.u(1)) as m) x),
  'true/active/plus_monthly/web/false/5', 'M: member, active monthly on the web, renews, every edition selectable');
select extensions.is(
  (select (pg_temp.mine(pg_temp.u(1)) ->> 'currentPeriodEnd')::timestamptz
     = (select current_period_end from app.premium_entitlements where user_id = pg_temp.u(1))),
  true, 'with the period end');
select extensions.is(
  (select concat_ws('/', m ->> 'isMember', m ->> 'state', m ->> 'productCode', m ->> 'source', m ->> 'cancelAtPeriodEnd')
   from (select pg_temp.mine(pg_temp.u(2)) as m) x),
  'true/active/plus_yearly/apple/true', 'Y: the yearly product does not renew, so it ends at the period end');
update app.premium_entitlements set state = 'cancelling', cancel_requested_at = statement_timestamp()
where user_id = pg_temp.u(1);
select extensions.is(
  (select concat_ws('/', m ->> 'isMember', m ->> 'state', m ->> 'cancelAtPeriodEnd')
   from (select pg_temp.mine(pg_temp.u(1)) as m) x), 'true/cancelling/true',
  'a cancelling member is still a member and will not renew');
update app.premium_entitlements set state = 'grace', grace_until = statement_timestamp() + interval '5 days',
  cancel_requested_at = null where user_id = pg_temp.u(1);
select extensions.is(
  (select concat_ws('/', m ->> 'isMember', m ->> 'state', ((m ->> 'graceUntil') is not null)::text)
   from (select pg_temp.mine(pg_temp.u(1)) as m) x), 'true/grace/true', 'in grace: a member, with the grace end');
update app.premium_entitlements set current_period_end = statement_timestamp() - interval '1 day',
  state = 'active', grace_until = null where user_id = pg_temp.u(1);
select extensions.is(
  (select concat_ws('/', m ->> 'isMember', m ->> 'state', m ->> 'chosenEdition', m ->> 'edition')
   from (select pg_temp.mine(pg_temp.u(1)) as m) x), 'false/expired/standard/standard',
  'a lapsed period reads as expired with no job to say so');
update app.premium_entitlements set state = 'refunded', current_period_end = statement_timestamp() + interval '10 days'
where user_id = pg_temp.u(1);
select extensions.is(pg_temp.mine(pg_temp.u(1)) ->> 'state' || '/' || (pg_temp.mine(pg_temp.u(1)) ->> 'isMember'),
  'refunded/false', 'refunded: no member features at once');
select extensions.is(
  (select concat_ws('/', m ->> 'isMember', m ->> 'state', m ->> 'productCode', m ->> 'source', m ->> 'cancelAtPeriodEnd')
   from (select pg_temp.mine(pg_temp.u(5)) as m) x),
  'true/active/grant/true', 'G: a complimentary grant reads as an active membership from source grant that ends');

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create function pg_temp.adm(p_aal text, p_expr text, p_user integer default 6) returns jsonb language sql as $$
  select pg_temp.run(pg_temp.u(p_user), p_aal, p_expr)
$$;
select extensions.is(pg_temp.adm('aal2', 'api.admin_premium_overview()', 7) ->> '__error', 'PT403 staff_access_denied',
  'a signed-in account that is not staff cannot read the overview');
select extensions.is(pg_temp.adm('aal2', format('api.admin_grant_premium(%L, now() + interval ''30 days'', ''A manager giving it away.'', gen_random_uuid())', pg_temp.u(3)), 7) ->> '__error',
  'PT403 staff_access_denied', 'nor grant a membership');
select extensions.is(pg_temp.adm('aal1', 'api.admin_premium_overview()') ->> '__error', 'PT403 mfa_assurance_insufficient',
  'the staff surface requires a second factor');
select extensions.is(
  pg_temp.keys(pg_temp.adm('aal2', 'api.admin_premium_overview()')),
  'lastEventAt,liveGrants,membersByProduct,membersByState,products,settings',
  'the overview has counts and settings only');
select extensions.is(
  (select concat_ws('/', o #>> '{settings,mode}', o ->> 'liveGrants', o -> 'membersByState' ->> 'active',
      o -> 'membersByState' ->> 'refunded', jsonb_array_length(o -> 'products'))
   from (select pg_temp.adm('aal2', 'api.admin_premium_overview()') as o) x),
  'on/1/1/1/3', 'counted by effective state: one active, one refunded, one live grant; three products listed');
select extensions.is(jsonb_typeof(pg_temp.adm('aal2', 'api.admin_premium_overview()') -> 'membersByState'), 'object',
  'and no member is listed');
-- 20261013100500: the same effective states, split by product; counts only.
select extensions.is(
  (select o -> 'membersByProduct' from (select pg_temp.adm('aal2', 'api.admin_premium_overview()') as o) x),
  '{"plus_monthly": {"refunded": 1}, "plus_yearly": {"active": 1}}'::jsonb,
  'counted by product and effective state: the monthly member was refunded, the yearly one is active');
select extensions.is(
  (select (select sum((s.value)::int) from jsonb_each_text(o -> 'membersByState') s)
        = (select sum((s.value)::int) from jsonb_each(o -> 'membersByProduct') p, jsonb_each_text(p.value) s)
   from (select pg_temp.adm('aal2', 'api.admin_premium_overview()') as o) x),
  true, 'and the products add up to the states: nobody is counted twice or missed');

select set_config('test.key', gen_random_uuid()::text, true);
select extensions.is(pg_temp.adm('aal2', format('api.admin_grant_premium(%L, now() + interval ''30 days'', ''short'', gen_random_uuid())', pg_temp.u(3))) ->> '__error',
  'PT400 premium_reason_invalid', 'a reason under 8 characters is refused');
select extensions.is(pg_temp.adm('aal2', format('api.admin_grant_premium(%L, now() - interval ''1 day'', ''Already over, by mistake.'', gen_random_uuid())', pg_temp.u(3))) ->> '__error',
  'PT400 premium_grant_period_invalid', 'an end in the past is refused');
select extensions.is(pg_temp.adm('aal2', format('api.admin_grant_premium(%L, now() + interval ''401 days'', ''Far too long a gift.'', gen_random_uuid())', pg_temp.u(3))) ->> '__error',
  'PT400 premium_grant_period_invalid', 'and so is a grant of more than 400 days');
select extensions.is(pg_temp.adm('aal2', format('api.admin_grant_premium(%L, now() + interval ''30 days'', ''No such account.'', gen_random_uuid())', gen_random_uuid())) ->> '__error',
  'PT404 premium_account_not_found', 'an unknown account is reported');
select set_config('test.grant', pg_temp.adm('aal2', format(
  'api.admin_grant_premium(%L, now() + interval ''30 days'', ''Press partner, three months of goodwill.'', %L)',
  pg_temp.u(3), current_setting('test.key')))::text, true);
select extensions.is(pg_temp.keys(current_setting('test.grant')::jsonb), 'endsAt,grantId,startsAt,userId', 'a grant answers its id and dates');
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_grant_premium(%L, now() + interval ''30 days'', ''Press partner, three months of goodwill.'', %L)',
    pg_temp.u(3), current_setting('test.key'))) ->> 'grantId',
  current_setting('test.grant')::jsonb ->> 'grantId', 'repeating the request with the same key answers the first grant');
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_grant_premium(%L, now() + interval ''31 days'', ''Press partner, three months of goodwill.'', %L)',
    pg_temp.u(3), current_setting('test.key'))) ->> '__error',
  'PT409 idempotency_conflict', 'the same key with another request is a conflict');
select extensions.is((select count(*)::integer from app_private.premium_grants where user_id = pg_temp.u(3)), 1,
  'and only one grant exists');
select extensions.is(app_private.has_premium(pg_temp.u(3)), true, 'the account is now a member');
select extensions.is(pg_temp.mine(pg_temp.u(3)) ->> 'isMember', 'true', 'and sees it');
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'premium.grant_member' and target_domain = 'premium' and target_entity_id = pg_temp.u(3)
     and reason = 'Press partner, three months of goodwill.'),
  1, 'the grant and its reason are in the admin audit log, once');

-- The audited read.
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_get_premium_member(%L, ''x'', gen_random_uuid())', pg_temp.u(3))) ->> '__error',
  'PT400 premium_reason_invalid', 'reading a member needs a reason');
select set_config('test.read', pg_temp.adm('aal2', format(
  'api.admin_get_premium_member(%L, ''Support ticket 4521, member asks about access.'', gen_random_uuid())', pg_temp.u(2)))::text, true);
select extensions.is(pg_temp.keys(current_setting('test.read')::jsonb), 'entitlement,events,grants,isMember,userId',
  'a member read has the entitlement, the grants and the events');
select extensions.is(
  (current_setting('test.read')::jsonb #>> '{entitlement,effectiveState}') || '/' || (current_setting('test.read')::jsonb #>> '{entitlement,source}'),
  'active/apple', 'with the effective state');
select extensions.ok(position('payload' in current_setting('test.read')) = 0 and position('example.test' in current_setting('test.read')) = 0,
  'and no payload and no e-mail address');
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'premium.view_member' and target_entity_id = pg_temp.u(2)
     and reason = 'Support ticket 4521, member asks about access.'),
  1, 'the read is in the audit log');
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_get_premium_member(%L, ''Support ticket 4521, nobody home.'', gen_random_uuid())', gen_random_uuid())) ->> '__error',
  'PT404 premium_account_not_found', 'an unknown account is reported');

-- Revoke.
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_revoke_premium(%L, ''short'', gen_random_uuid())', current_setting('test.grant')::jsonb ->> 'grantId')) ->> '__error',
  'PT400 premium_reason_invalid', 'revoking needs a reason');
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_revoke_premium(%L, ''Ended early at their request.'', gen_random_uuid())', gen_random_uuid())) ->> '__error',
  'PT404 premium_grant_not_found', 'an unknown grant is reported');
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_revoke_premium(%L, ''Ended early at their request.'', gen_random_uuid())', current_setting('test.grant')::jsonb ->> 'grantId')) ->> 'revoked',
  'true', 'a grant is revoked');
select extensions.is(app_private.has_premium(pg_temp.u(3)), false, 'and the account is no longer a member');
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_revoke_premium(%L, ''Ended early at their request.'', gen_random_uuid())', current_setting('test.grant')::jsonb ->> 'grantId')) ->> '__error',
  'PT409 premium_grant_already_revoked', 'revoking twice is refused');
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events where action = 'premium.revoke_grant' and target_entity_id = pg_temp.u(3)),
  1, 'the revocation is audited');

-- The permissions.
select extensions.is(
  (select string_agg(permission.name || ':' || permission.requires_recent_auth, ',' order by permission.name)
   from app_private.admin_role_permissions mapping
   join app_private.admin_roles role on role.id = mapping.role_id
   join app_private.admin_permissions permission on permission.id = mapping.permission_id
   where role.name = 'platform_admin' and permission.domain = 'premium'),
  'premium.grant:true,premium.read:false',
  'platform_admin holds premium.read and premium.grant; granting needs recent authentication');

select * from extensions.finish();
rollback;
