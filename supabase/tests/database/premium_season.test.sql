-- BotolaGO+ « Saison » (20261016150000 schema, 20261016150100 API): the one purchase, paid by
-- hand and activated by staff.
--
-- Covered: the new functions' grants; "off is an answer" for the two member reads and the order
-- (off answer, step-up, caller); where to pay (empty until the owner types the details, then
-- the exact key set, the WhatsApp number stored as + and digits); the staff form (staff only,
-- second factor, recent authentication, validation, idempotency, audit without the RIB, no RIB
-- in the idempotency record); the personal payment code (format, stable, one per account,
-- unique); finding a member by code (any case, dash optional, audited as the member read);
-- activating the Saison (validation, the grant to the season end with its payment record,
-- idempotency, audit, a second activation refused, a revoked or shorter grant does not block, a
-- grant that already lasts to the season end does, an offered Saison at 0, the season ended or
-- too far); what the member and the status read afterwards; the table rules on a grant.
--
-- Accounts: 1 A pays by bank transfer, 2 B is offered the Saison, 3 C had a short complimentary
-- grant, 4 V has a verified MFA factor, 5 D has a grant lasting past the season end, 6 S is a
-- platform admin (aal2 session), 7 X is signed in and not staff, 8 E is closing, 9 F is the
-- account of the season-ended cases.
begin;
select extensions.no_plan();
select set_config('app.environment', 'test', true);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('bc6e0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
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
create function pg_temp.adm(p_aal text, p_expr text, p_user integer default 6) returns jsonb language sql as $$
  select pg_temp.run(pg_temp.u(p_user), p_aal, p_expr)
$$;
create function pg_temp.pay(p_user integer) returns jsonb language sql as $$
  select pg_temp.run(pg_temp.u(p_user), 'aal1', 'api.get_premium_payment_details()')
$$;
create function pg_temp.code(p_user integer) returns jsonb language sql as $$
  select pg_temp.run(pg_temp.u(p_user), 'aal1', 'api.get_my_premium_pay_code()')
$$;
create function pg_temp.mine(p_user integer) returns jsonb language sql as $$
  select pg_temp.run(pg_temp.u(p_user), 'aal1', 'api.get_my_premium()')
$$;
create function pg_temp.setd(p_details jsonb, p_reason text, p_key uuid, p_aal text default 'aal2', p_user integer default 6)
returns jsonb language sql as $$
  select pg_temp.adm(p_aal, format('api.admin_set_premium_payment_details(%L::jsonb, %L, %L)',
    p_details::text, p_reason, p_key), p_user)
$$;
create function pg_temp.activate(p_user uuid, p_method text, p_ref text, p_reason text, p_key uuid,
  p_aal text default 'aal2', p_staff integer default 6)
returns jsonb language sql as $$
  select pg_temp.adm(p_aal, format('api.admin_activate_premium_season(%L, %L, %L, %L, %L)',
    p_user, p_method, p_ref, p_reason, p_key), p_staff)
$$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'premium-season-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'premium_season_' || n, 'display_name', 'Premium Season ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 9) n;
update app.profiles set deleted_at = statement_timestamp() where id = pg_temp.u(8);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.u(900), pg_temp.u(4), 'V TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()),
  (pg_temp.u(901), pg_temp.u(6), 'S TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp());
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  (pg_temp.u(501), pg_temp.u(6), statement_timestamp(), statement_timestamp(), 'aal2'),
  (pg_temp.u(500), pg_temp.u(7), statement_timestamp(), statement_timestamp(), 'aal2');
select extensions.lives_ok(
  format($$select api.admin_bootstrap_first_platform_admin(%L,
    'Bootstrap deterministic Saison test platform administrator.', true)$$, pg_temp.u(6)),
  'the fixture bootstraps one platform administrator');

-- A Fantasy season that is the current one: it starts tomorrow, so it is the latest started, and
-- it ends in 200 days.
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.u(910), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.u(911), 'premium-season-test', 'Premium Season Test', 'PST', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.u(912), pg_temp.u(911), 'Premium season test', current_date - 30, current_date + 200,
  'active', true);
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.u(913), pg_temp.u(911), 'premium-season-test', 'Premium Season Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status,
  starts_at, ends_at)
values (pg_temp.u(914), pg_temp.u(913), pg_temp.u(912), 'f6100000-0000-4000-8000-000000000100',
  'Premium season test', 'active', statement_timestamp() + interval '1 day',
  statement_timestamp() + interval '200 days');
select extensions.is(app_private.fantasy_prize_current_season(), pg_temp.u(914),
  'the fixture season is the current Fantasy season');
select extensions.is(app_private.premium_season_end(), (select ends_at from app.fantasy_seasons where id = pg_temp.u(914)),
  'and its end is what a Saison lasts until');

-- ---------------------------------------------------------------------------
-- Shape and grants
-- ---------------------------------------------------------------------------
select extensions.is(
  (select string_agg(f.sig || ':' || concat_ws(',', p.prosecdef, p.proconfig = array['search_path=""'],
      has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
      has_function_privilege('service_role', p.oid, 'execute')), '|' order by f.n)
   from (values (1, 'api.get_premium_payment_details()'), (2, 'api.get_my_premium_pay_code()'),
     (3, 'api.admin_get_premium_payment_details()'), (4, 'api.admin_set_premium_payment_details(jsonb,text,uuid)'),
     (5, 'api.admin_find_premium_member_by_code(text,text,uuid)'),
     (6, 'api.admin_activate_premium_season(uuid,text,text,text,uuid)')) f(n, sig)
   join pg_proc p on p.oid = to_regprocedure(f.sig)),
  'api.get_premium_payment_details():t,t,f,t,f|api.get_my_premium_pay_code():t,t,f,t,f'
  || '|api.admin_get_premium_payment_details():t,t,f,t,f'
  || '|api.admin_set_premium_payment_details(jsonb,text,uuid):t,t,f,t,f'
  || '|api.admin_find_premium_member_by_code(text,text,uuid):t,t,f,t,f'
  || '|api.admin_activate_premium_season(uuid,text,text,text,uuid):t,t,f,t,f',
  'security definer with an empty search_path, for signed-in callers only (the staff gate inside decides), never anon or the service role');
select extensions.is(
  (select count(*)::integer from pg_proc p
   cross join unnest(array['anon', 'authenticated', 'service_role']) r
   where p.pronamespace = 'app_private'::regnamespace
     and p.proname in ('premium_season_end', 'premium_pay_code_new', 'premium_payment_details_json')
     and has_function_privilege(r, p.oid, 'execute')),
  0, 'no API role can run the three new helpers');

-- ---------------------------------------------------------------------------
-- Off is an answer
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.pay(1), '{"available": false}'::jsonb, 'off: where to pay is {available:false}');
select extensions.is(pg_temp.code(1), '{"available": false}'::jsonb, 'off: the payment code is {available:false}');
select extensions.is(pg_temp.run(pg_temp.u(4), 'aal1', 'api.get_premium_payment_details()'), '{"available": false}'::jsonb,
  'off is answered before the step-up: a verified factor at aal1 is not asked for a challenge');
select extensions.is(pg_temp.run(pg_temp.u(4), 'aal1', 'api.get_my_premium_pay_code()'), '{"available": false}'::jsonb,
  'and so is the code');
select extensions.is(pg_temp.run(null, null, 'api.get_premium_payment_details()', 'anon') ->> '__error',
  '42501 permission denied for function get_premium_payment_details', 'anon cannot read where to pay');
select extensions.is(pg_temp.run(null, null, 'api.get_my_premium_pay_code()', 'anon') ->> '__error',
  '42501 permission denied for function get_my_premium_pay_code', 'nor get a code');
select extensions.is(
  (select count(*)::integer from app_private.premium_pay_codes), 0, 'and no code was made while off');

-- ---------------------------------------------------------------------------
-- On, before the owner typed anything
-- ---------------------------------------------------------------------------
select app_private.premium_configure('on');
select extensions.is(
  (select concat_ws('/', bank_holder is null, bank_name is null, rib is null, cashplus_name is null,
      whatsapp_number is null, note_fr is null, note_ar is null, updated_by_principal_id is null)
   from app_private.premium_payment_details),
  't/t/t/t/t/t/t/t', 'the payment details ship empty: nothing typed in a migration');
select extensions.is((select count(*)::integer from app_private.premium_payment_details), 1, 'in one row');
select extensions.throws_ok(
  $$insert into app_private.premium_payment_details (id) values (false)$$,
  '23514', 'new row for relation "premium_payment_details" violates check constraint "premium_payment_details_singleton"',
  'the details are a singleton');
select extensions.is(pg_temp.pay(1), '{"available": false}'::jsonb, 'no WhatsApp number yet: {available:false}');
select extensions.is(pg_temp.run(pg_temp.u(4), 'aal1', 'api.get_premium_payment_details()') ->> '__error',
  'PT403 mfa_required', 'on: a verified factor at aal1 gets PT403 mfa_required');
select extensions.is(pg_temp.run(pg_temp.u(4), 'aal2', 'api.get_premium_payment_details()') ->> 'available', 'false',
  'and at aal2 it answers');
select extensions.is(pg_temp.run(null, null, 'api.get_premium_payment_details()') ->> '__error',
  'PT401 authentication_required', 'a role without a user is PT401');

-- ---------------------------------------------------------------------------
-- The staff form
-- ---------------------------------------------------------------------------
create function pg_temp.details() returns jsonb language sql as $$
  select jsonb_build_object('bankHolder', 'BotolaGO Test SARL', 'bankName', 'Banque Test',
    'rib', '230 780 0001234567890123 45', 'cashplusName', 'Test Recipient',
    'whatsapp', '+212 6 12-34 56 78', 'noteFr', 'Note en francais', 'noteAr', 'ملاحظة بالعربية')
$$;
select extensions.is(pg_temp.adm('aal2', 'api.admin_get_premium_payment_details()', 7) ->> '__error',
  'PT403 staff_access_denied', 'a signed-in account that is not staff cannot read the details');
select extensions.is(pg_temp.adm('aal1', 'api.admin_get_premium_payment_details()') ->> '__error',
  'PT403 mfa_assurance_insufficient', 'the staff read requires a second factor');
select extensions.is(pg_temp.keys(pg_temp.adm('aal2', 'api.admin_get_premium_payment_details()')),
  'bankHolder,bankName,cashplusName,noteAr,noteFr,rib,updatedAt,updatedByPrincipalId,whatsapp',
  'the staff read has the seven details, the date and who saved');
select extensions.is(pg_temp.setd(pg_temp.details(), 'Typing the payment details.', pg_temp.u(700), 'aal2', 7) ->> '__error',
  'PT403 staff_access_denied', 'a signed-in account that is not staff cannot save them');
select extensions.is(pg_temp.setd(pg_temp.details(), 'Typing the payment details.', pg_temp.u(700), 'aal1') ->> '__error',
  'PT403 mfa_assurance_insufficient', 'saving requires a second factor');
select extensions.is(pg_temp.setd(pg_temp.details(), 'short', pg_temp.u(700)) ->> '__error',
  'PT400 premium_reason_invalid', 'a reason under 8 characters is refused');
select extensions.is(pg_temp.setd(pg_temp.details() || '{"whatsapp": "call me"}', 'Typing the payment details.', pg_temp.u(700)) ->> '__error',
  'PT400 premium_payment_details_invalid', 'a WhatsApp number that is not digits is refused');
select extensions.is(pg_temp.setd(pg_temp.details() || '{"whatsapp": "1234567"}', 'Typing the payment details.', pg_temp.u(700)) ->> '__error',
  'PT400 premium_payment_details_invalid', 'one under 8 digits is refused');
select extensions.is(pg_temp.setd(pg_temp.details() || '{"whatsapp": "12345678901234567"}', 'Typing the payment details.', pg_temp.u(700)) ->> '__error',
  'PT400 premium_payment_details_invalid', 'and one over 16 digits');
select extensions.is(pg_temp.setd(pg_temp.details() || '{"rib": "12"}', 'Typing the payment details.', pg_temp.u(700)) ->> '__error',
  'PT400 premium_payment_details_invalid', 'a RIB that is too short is refused');
select extensions.is(pg_temp.setd(pg_temp.details() || '{"iban": "x"}', 'Typing the payment details.', pg_temp.u(700)) ->> '__error',
  'PT400 premium_payment_details_invalid', 'an unknown key is refused');
select extensions.is(pg_temp.setd(pg_temp.details() || '{"bankName": 12}', 'Typing the payment details.', pg_temp.u(700)) ->> '__error',
  'PT400 premium_payment_details_invalid', 'a detail that is not text is refused');
select extensions.is(pg_temp.setd(pg_temp.details() || jsonb_build_object('noteFr', repeat('x', 301)), 'Typing the payment details.', pg_temp.u(700)) ->> '__error',
  'PT400 premium_payment_details_invalid', 'a note over 300 characters is refused');
select extensions.is(pg_temp.adm('aal2', format('api.admin_set_premium_payment_details(%L::jsonb, %L, %L)',
    '[1]', 'Typing the payment details.', pg_temp.u(700))) ->> '__error',
  'PT400 validation_failed', 'details that are not an object are refused');
select extensions.is(
  (select concat_ws('/', whatsapp_number is null, rib is null) from app_private.premium_payment_details),
  't/t', 'and the refused calls saved nothing');

select set_config('test.saved', pg_temp.setd(pg_temp.details(), 'Typing the payment details.', pg_temp.u(701))::text, true);
select extensions.is(pg_temp.keys(current_setting('test.saved')::jsonb),
  'bankHolder,bankName,cashplusName,noteAr,noteFr,rib,updatedAt,updatedByPrincipalId,whatsapp',
  'saving answers the saved row');
select extensions.is(current_setting('test.saved')::jsonb ->> 'whatsapp', '+212612345678',
  'the WhatsApp number is stored as a plus sign and digits');
select extensions.is(current_setting('test.saved')::jsonb ->> 'rib', '230 780 0001234567890123 45', 'the RIB as typed');
select extensions.is(
  (select updated_by_principal_id = (select id from app_private.staff_principals where auth_user_id = pg_temp.u(6))
   from app_private.premium_payment_details),
  true, 'with who saved it');
select extensions.is(
  pg_temp.setd(pg_temp.details(), 'Typing the payment details.', pg_temp.u(701)) ->> 'whatsapp', '+212612345678',
  'repeating the request with the same key answers the row, and saves once');
select extensions.is(
  pg_temp.setd(pg_temp.details() || '{"bankName": "Another bank"}', 'Typing the payment details.', pg_temp.u(701)) ->> '__error',
  'PT409 idempotency_conflict', 'the same key with another request is a conflict');
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events where action = 'premium.set_payment_details'),
  1, 'one audit entry');
select extensions.ok(
  (select safe_after -> 'changed' @> '["bankHolder", "bankName", "rib", "cashplusName", "whatsapp", "noteFr", "noteAr"]'::jsonb
     and safe_after::text !~ '0001234567890123' and safe_after::text !~ '612345678'
     and safe_after::text !~ 'Banque Test'
   from app_private.admin_audit_events where action = 'premium.set_payment_details'),
  'it names the fields that changed and none of their values: no RIB, no number');
select extensions.is(
  (select response_payload from app_private.admin_idempotency_keys
   where operation_type = 'premium.set_payment_details' and idempotency_key = pg_temp.u(701)),
  '{"saved": true}'::jsonb, 'and the idempotency record holds no detail either');
select extensions.is(pg_temp.adm('aal2', 'api.admin_get_premium_payment_details()') ->> 'rib',
  '230 780 0001234567890123 45', 'the staff read shows the RIB');

-- What a buyer sees.
select extensions.is(pg_temp.keys(pg_temp.pay(1)),
  'amountMinor,available,bankHolder,bankName,cashplusName,currency,noteAr,noteFr,rib,whatsapp',
  'a signed-in account reads these ten keys');
select extensions.is(
  (select concat_ws('/', m ->> 'available', m ->> 'whatsapp', m ->> 'bankHolder', m ->> 'bankName', m ->> 'rib',
      m ->> 'cashplusName', m ->> 'noteFr', m ->> 'noteAr', m ->> 'amountMinor', m ->> 'currency')
   from (select pg_temp.pay(1) as m) x),
  'true/+212612345678/BotolaGO Test SARL/Banque Test/230 780 0001234567890123 45/Test Recipient/Note en francais/ملاحظة بالعربية/20000/MAD',
  'with the details, 200 MAD in centimes');
select app_private.premium_configure('preview');
select extensions.is(pg_temp.pay(1) ->> 'available', 'true', 'in preview too');
select app_private.premium_configure('off');
select extensions.is(pg_temp.pay(1), '{"available": false}'::jsonb, 'and off hides them again');
select app_private.premium_configure('on');
-- Blank clears a detail; without a WhatsApp number nothing is offered.
select extensions.is(
  pg_temp.setd(pg_temp.details() || '{"whatsapp": "  ", "noteFr": ""}', 'Taking the number off for now.', pg_temp.u(702)) ->> 'whatsapp',
  null, 'a blank detail is cleared');
select extensions.is(pg_temp.pay(1), '{"available": false}'::jsonb, 'without a WhatsApp number: {available:false}');
select extensions.is(
  pg_temp.setd(pg_temp.details(), 'Putting the number back.', pg_temp.u(703)) ->> 'whatsapp', '+212612345678',
  'it comes back when saved again');
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events where action = 'premium.set_payment_details'),
  3, 'each change is audited');
select extensions.throws_ok(
  $$update app_private.premium_payment_details set whatsapp_number = '06 00' where id$$,
  '23514', 'new row for relation "premium_payment_details" violates check constraint "premium_payment_details_whatsapp_check"',
  'the table refuses a malformed number too');

-- ---------------------------------------------------------------------------
-- The personal payment code
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.run(pg_temp.u(4), 'aal1', 'api.get_my_premium_pay_code()') ->> '__error',
  'PT403 mfa_required', 'on: a verified factor at aal1 gets PT403 mfa_required');
select extensions.is(pg_temp.run(null, null, 'api.get_my_premium_pay_code()') ->> '__error',
  'PT401 authentication_required', 'a role without a user is PT401');
select extensions.is(pg_temp.code(8) ->> '__error', 'PT404 premium_account_not_found', 'a closing account gets none');
select extensions.is(pg_temp.keys(pg_temp.code(1)), 'available,code', 'the answer is {available, code}');
select extensions.ok((pg_temp.code(1) ->> 'code') ~ '^BG-[A-HJ-NP-Z2-9]{6}$',
  'BG- and six characters of an alphabet without 0, O, 1 and I');
select extensions.is(pg_temp.code(1) ->> 'code', pg_temp.code(1) ->> 'code', 'it is the same each time');
select extensions.is(
  (select count(*)::integer from app_private.premium_pay_codes where user_id = pg_temp.u(1)), 1, 'one row per account');
select extensions.ok(pg_temp.code(2) ->> 'code' <> pg_temp.code(1) ->> 'code', 'and another account has another code');
select pg_temp.code(3);
select pg_temp.code(5);
select extensions.is((select count(distinct code)::integer from app_private.premium_pay_codes), 4,
  'four accounts, four different codes');
select extensions.throws_ok(
  format($$insert into app_private.premium_pay_codes (user_id, code) values (%L, %L)$$, pg_temp.u(9), pg_temp.code(1) ->> 'code'),
  '23505', 'duplicate key value violates unique constraint "premium_pay_codes_code_key"',
  'a code belongs to one account');
select extensions.throws_ok(
  format($$insert into app_private.premium_pay_codes (user_id, code) values (%L, 'BG-0OI1AB')$$, pg_temp.u(9)),
  '23514', 'new row for relation "premium_pay_codes" violates check constraint "premium_pay_codes_code_check"',
  'and the table refuses the ambiguous characters');
select extensions.is(
  (select count(*)::integer from (select app_private.premium_pay_code_new() c from generate_series(1, 200)) x
   where c !~ '^BG-[A-HJ-NP-Z2-9]{6}$'), 0, 'two hundred drawn codes all have the format');

-- ---------------------------------------------------------------------------
-- Finding a member by code
-- ---------------------------------------------------------------------------
select set_config('test.code1', pg_temp.code(1) ->> 'code', true);
create function pg_temp.find(p_code text, p_reason text default 'Receipt on WhatsApp, checking the account.',
  p_aal text default 'aal2', p_user integer default 6)
returns jsonb language sql as $$
  select pg_temp.adm(p_aal, format('api.admin_find_premium_member_by_code(%L, %L, gen_random_uuid())', p_code, p_reason), p_user)
$$;
select extensions.is(pg_temp.find(current_setting('test.code1'), p_user => 7) ->> '__error',
  'PT403 staff_access_denied', 'a signed-in account that is not staff cannot look a code up');
select extensions.is(pg_temp.find(current_setting('test.code1'), p_aal => 'aal1') ->> '__error',
  'PT403 mfa_assurance_insufficient', 'the staff surface requires a second factor');
select extensions.is(pg_temp.keys(pg_temp.find(current_setting('test.code1'))),
  'entitlement,events,grants,isMember,userId', 'the answer is the member read');
select extensions.is(pg_temp.find(current_setting('test.code1')) ->> 'userId', pg_temp.u(1)::text, 'for the right account');
select extensions.is(pg_temp.find(lower(current_setting('test.code1'))) ->> 'userId', pg_temp.u(1)::text, 'in lower case too');
select extensions.is(pg_temp.find('  ' || replace(current_setting('test.code1'), '-', '') || ' ') ->> 'userId', pg_temp.u(1)::text,
  'with the dash left out and spaces around it');
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'premium.view_member' and target_entity_id = pg_temp.u(1)
     and reason = 'Receipt on WhatsApp, checking the account.'),
  4, 'each lookup is audited as the member read');
select extensions.is(pg_temp.find('hello') ->> '__error', 'PT400 premium_code_invalid', 'something that is not a code is refused');
select extensions.is(pg_temp.find('BG-00OO11') ->> '__error', 'PT400 premium_code_invalid', 'and so are the ambiguous characters');
select extensions.is(pg_temp.find('BG-ZZZZZZ') ->> '__error', 'PT404 premium_code_not_found', 'a well-formed code nobody holds is not found');
select extensions.is(pg_temp.find(current_setting('test.code1'), 'x') ->> '__error', 'PT400 premium_reason_invalid',
  'a lookup needs a reason');

-- ---------------------------------------------------------------------------
-- Activating the Saison
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.activate(pg_temp.u(1), 'bank_transfer', 'VIR-2026-1042', 'Receipt checked on WhatsApp.', pg_temp.u(710), 'aal2', 7) ->> '__error',
  'PT403 staff_access_denied', 'a signed-in account that is not staff cannot activate');
select extensions.is(pg_temp.activate(pg_temp.u(1), 'bank_transfer', 'VIR-2026-1042', 'Receipt checked on WhatsApp.', pg_temp.u(710), 'aal1') ->> '__error',
  'PT403 mfa_assurance_insufficient', 'activating requires a second factor');
select extensions.is(pg_temp.activate(pg_temp.u(1), 'cash', 'VIR-2026-1042', 'Receipt checked on WhatsApp.', pg_temp.u(710)) ->> '__error',
  'PT400 premium_payment_method_invalid', 'a payment method that is not one of the four is refused');
select extensions.is(pg_temp.activate(pg_temp.u(1), 'bank_transfer', null, 'Receipt checked on WhatsApp.', pg_temp.u(710)) ->> '__error',
  'PT400 premium_payment_reference_required', 'a bank transfer needs its reference');
select extensions.is(pg_temp.activate(pg_temp.u(1), 'cashplus', '   ', 'Receipt checked on WhatsApp.', pg_temp.u(710)) ->> '__error',
  'PT400 premium_payment_reference_required', 'a blank one is no reference');
select extensions.is(pg_temp.activate(pg_temp.u(1), 'wafacash', repeat('9', 81), 'Receipt checked on WhatsApp.', pg_temp.u(710)) ->> '__error',
  'PT400 premium_payment_reference_invalid', 'and one over 80 characters is refused');
select extensions.is(pg_temp.activate(pg_temp.u(1), 'bank_transfer', 'VIR-2026-1042', 'short', pg_temp.u(710)) ->> '__error',
  'PT400 premium_reason_invalid', 'a reason under 8 characters is refused');
select extensions.is(pg_temp.activate(gen_random_uuid(), 'bank_transfer', 'VIR-2026-1042', 'Receipt checked on WhatsApp.', pg_temp.u(710)) ->> '__error',
  'PT404 premium_account_not_found', 'an unknown account is reported');
select extensions.is(pg_temp.activate(pg_temp.u(8), 'bank_transfer', 'VIR-2026-1042', 'Receipt checked on WhatsApp.', pg_temp.u(710)) ->> '__error',
  'PT404 premium_account_not_found', 'and so is a closing one');
select extensions.is((select count(*)::integer from app_private.premium_grants), 0, 'the refused calls granted nothing');

select set_config('test.act', pg_temp.activate(pg_temp.u(1), 'bank_transfer', 'VIR-2026-1042', 'Receipt checked on WhatsApp.', pg_temp.u(711))::text, true);
select extensions.is(pg_temp.keys(current_setting('test.act')::jsonb),
  'amountMinor,currency,endsAt,grantId,paymentMethod,paymentReference,productCode,startsAt,userId',
  'activating answers the grant with its payment record');
select extensions.is(
  concat_ws('/', current_setting('test.act')::jsonb ->> 'productCode', current_setting('test.act')::jsonb ->> 'paymentMethod',
    current_setting('test.act')::jsonb ->> 'paymentReference', current_setting('test.act')::jsonb ->> 'amountMinor',
    current_setting('test.act')::jsonb ->> 'currency'),
  'plus_season/bank_transfer/VIR-2026-1042/20000/MAD', 'the Saison at 200 MAD, how it was paid and the receipt');
select extensions.is((current_setting('test.act')::jsonb ->> 'endsAt')::timestamptz, app_private.premium_season_end(),
  'it lasts until the end of the current Fantasy season');
select extensions.is(
  (select concat_ws('/', g.product_code, g.payment_method, g.payment_reference, g.amount_minor, g.currency, g.reason,
      g.granted_by_principal_id = (select id from app_private.staff_principals where auth_user_id = pg_temp.u(6)))
   from app_private.premium_grants g where g.user_id = pg_temp.u(1)),
  'plus_season/bank_transfer/VIR-2026-1042/20000/MAD/Receipt checked on WhatsApp./t', 'the grant row holds all of it');
select extensions.is(app_private.has_premium(pg_temp.u(1)), true, 'the account is a member');
select extensions.is(
  (select concat_ws('/', m ->> 'isMember', m ->> 'state', m ->> 'productCode', m ->> 'source', m ->> 'cancelAtPeriodEnd')
   from (select pg_temp.mine(1) as m) x),
  'true/active/plus_season/grant/true', 'and sees an active Saison from a grant that does not renew');
select extensions.is((pg_temp.mine(1) ->> 'currentPeriodEnd')::timestamptz, app_private.premium_season_end(),
  'whose period end is the season end');
select extensions.is(pg_temp.keys(pg_temp.mine(1)),
  'available,cancelAtPeriodEnd,chosenEdition,currentPeriodEnd,edition,editions,graceUntil,isMember,productCode,source,state',
  'with the same eleven keys as before');
select extensions.is(
  pg_temp.activate(pg_temp.u(1), 'bank_transfer', 'VIR-2026-1042', 'Receipt checked on WhatsApp.', pg_temp.u(711)) ->> 'grantId',
  current_setting('test.act')::jsonb ->> 'grantId', 'repeating the request with the same key answers the first grant');
select extensions.is(
  pg_temp.activate(pg_temp.u(1), 'bank_transfer', 'VIR-2026-9999', 'Receipt checked on WhatsApp.', pg_temp.u(711)) ->> '__error',
  'PT409 idempotency_conflict', 'the same key with another request is a conflict');
select extensions.is((select count(*)::integer from app_private.premium_grants where user_id = pg_temp.u(1)), 1,
  'and only one grant exists');
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'premium.activate_season' and target_domain = 'premium' and target_entity_id = pg_temp.u(1)
     and reason = 'Receipt checked on WhatsApp.'),
  1, 'the activation, its reason and its receipt are in the admin audit log, once');
select extensions.is(
  pg_temp.activate(pg_temp.u(1), 'cashplus', 'CP-77', 'A second payment arrived by mistake.', pg_temp.u(712)) ->> '__error',
  'PT409 season_already_active', 'an account whose Saison already lasts to the season end is refused');
select extensions.is((select count(*)::integer from app_private.premium_grants where user_id = pg_temp.u(1)), 1,
  'and nothing was written');

-- The member read carries the payment record.
select extensions.is(
  (select concat_ws('/', g ->> 'productCode', g ->> 'paymentMethod', g ->> 'paymentReference', g ->> 'amountMinor')
   from (select pg_temp.adm('aal2', format('api.admin_get_premium_member(%L, ''Support ticket 77, checking the receipt.'', gen_random_uuid())',
     pg_temp.u(1))) #> '{grants,0}' as g) x),
  'plus_season/bank_transfer/VIR-2026-1042/20000', 'staff read the product, method, reference and amount of each grant');

-- A revoked Saison does not block a new one.
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_revoke_premium(%L, ''Payment was reversed by the bank.'', gen_random_uuid())',
    current_setting('test.act')::jsonb ->> 'grantId')) ->> 'revoked', 'true', 'a Saison is revoked');
select extensions.is(app_private.has_premium(pg_temp.u(1)), false, 'and the account is no longer a member');
select extensions.is(
  pg_temp.activate(pg_temp.u(1), 'cashplus', 'CP-77', 'Paid again at the agency.', pg_temp.u(713)) ->> 'paymentMethod',
  'cashplus', 'a revoked Saison does not stop a new activation');
select extensions.is(app_private.has_premium(pg_temp.u(1)), true, 'which makes the account a member again');

-- An offered Saison.
select extensions.is(
  pg_temp.activate(pg_temp.u(2), 'free', null, 'Offered to a press partner.', pg_temp.u(714)) #>> '{paymentMethod}',
  'free', 'a Saison can be offered with no reference');
select extensions.is(
  (select concat_ws('/', g.payment_method, coalesce(g.payment_reference, '-'), g.amount_minor, g.product_code)
   from app_private.premium_grants g where g.user_id = pg_temp.u(2)),
  'free/-/0/plus_season', 'at 0');

-- A shorter complimentary grant does not block; one that already lasts past the season end does.
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_grant_premium(%L, now() + interval ''30 days'', ''Thirty days of goodwill.'', gen_random_uuid())', pg_temp.u(3))) ->> 'userId',
  pg_temp.u(3)::text, 'a complimentary access of 30 days is given');
select extensions.is(pg_temp.mine(3) ->> 'productCode', null, 'it has no product: complimentary, not a Saison');
select extensions.is(
  pg_temp.activate(pg_temp.u(3), 'wafacash', 'WF-5', 'Paid at the agency, receipt seen.', pg_temp.u(715)) ->> 'productCode',
  'plus_season', 'and does not stop the Saison');
select extensions.is(pg_temp.mine(3) ->> 'productCode', 'plus_season', 'which then shows as the access that lasts longest');
select extensions.is(
  pg_temp.adm('aal2', format('api.admin_grant_premium(%L, now() + interval ''300 days'', ''A very long goodwill gift.'', gen_random_uuid())', pg_temp.u(5))) ->> 'userId',
  pg_temp.u(5)::text, 'a complimentary access of 300 days is given');
select extensions.is(
  pg_temp.activate(pg_temp.u(5), 'bank_transfer', 'VIR-1', 'Paid although already covered.', pg_temp.u(716)) ->> '__error',
  'PT409 season_already_active', 'one that already lasts past the season end blocks the Saison');

-- The public status.
select extensions.is(
  (select pg_temp.keys(api.premium_status() -> 'prices' -> 0)),
  'code,currency,periodMonths,priceMinor,renews,validUntil', 'the price carries validUntil');
select extensions.is(
  (select concat_ws('/', p ->> 'code', p -> 'periodMonths', p ->> 'renews', p ->> 'priceMinor', p ->> 'currency',
      ((p ->> 'validUntil')::timestamptz = app_private.premium_season_end())::text)
   from (select api.premium_status() -> 'prices' -> 0 as p) x),
  'plus_season/null/false/20000/MAD/true', 'the Saison: 200 MAD, no months, does not renew, valid until the season end');
select extensions.is(jsonb_array_length(api.premium_status() -> 'prices'), 1, 'it is the only price listed');
select extensions.is(api.premium_status() -> 'savingMinor', 'null'::jsonb, 'with no saving to show');
select extensions.is(
  (select string_agg(code || ':' || active, ',' order by code) from app_private.premium_products),
  'plus_monthly:false,plus_season:true,plus_yearly:false', 'the old products stay, inactive');

-- The table rules on a grant.
select extensions.throws_ok(
  format($$insert into app_private.premium_grants (user_id, ends_at, reason, granted_by_principal_id, product_code, payment_method)
    values (%L, now() + interval '1 day', 'A paid Saison without receipt.', (select id from app_private.staff_principals limit 1), 'plus_season', 'bank_transfer')$$, pg_temp.u(9)),
  '23514', 'new row for relation "premium_grants" violates check constraint "premium_grants_payment_record_check"',
  'a paid method always carries its reference');
select extensions.throws_ok(
  format($$insert into app_private.premium_grants (user_id, ends_at, reason, granted_by_principal_id, payment_method, payment_reference)
    values (%L, now() + interval '1 day', 'A payment without a product.', (select id from app_private.staff_principals limit 1), 'cashplus', 'CP-1')$$, pg_temp.u(9)),
  '23514', 'new row for relation "premium_grants" violates check constraint "premium_grants_payment_record_check"',
  'and a method names its product');
select extensions.throws_ok(
  format($$insert into app_private.premium_grants (user_id, ends_at, reason, granted_by_principal_id, product_code, payment_method, payment_reference)
    values (%L, now() + interval '1 day', 'A payment by a made-up method.', (select id from app_private.staff_principals limit 1), 'plus_season', 'barter', 'X-1')$$, pg_temp.u(9)),
  '23514', 'new row for relation "premium_grants" violates check constraint "premium_grants_payment_method_check"',
  'the method is bank_transfer, cashplus, wafacash or free');
select extensions.throws_ok(
  format($$insert into app_private.premium_grants (user_id, ends_at, reason, granted_by_principal_id, product_code, payment_method, payment_reference, amount_minor)
    values (%L, now() + interval '1 day', 'A negative amount, by mistake.', (select id from app_private.staff_principals limit 1), 'plus_season', 'cashplus', 'CP-1', -1)$$, pg_temp.u(9)),
  '23514', 'new row for relation "premium_grants" violates check constraint "premium_grants_amount_check"',
  'an amount is never negative');
select extensions.is(
  (select count(*)::integer from app_private.premium_grants where product_code is null and payment_method is null),
  2, 'the complimentary accesses given by api.admin_grant_premium keep the payment columns empty');

-- ---------------------------------------------------------------------------
-- The season: ended, or too far away
-- ---------------------------------------------------------------------------
update app.fantasy_seasons set starts_at = statement_timestamp() - interval '10 days',
  ends_at = statement_timestamp() - interval '1 day' where id = pg_temp.u(914);
select extensions.is(
  pg_temp.activate(pg_temp.u(9), 'bank_transfer', 'VIR-2', 'Paid after the season ended.', pg_temp.u(717)) ->> '__error',
  'PT409 premium_season_ended', 'a season that has already ended cannot be activated');
update app.fantasy_seasons set starts_at = statement_timestamp() + interval '1 day',
  ends_at = statement_timestamp() + interval '401 days' where id = pg_temp.u(914);
select extensions.is(
  pg_temp.activate(pg_temp.u(9), 'bank_transfer', 'VIR-3', 'Paid for a season far away.', pg_temp.u(718)) ->> '__error',
  'PT400 premium_grant_period_invalid', 'and a season end more than 400 days away is refused as a data mistake');
update app.fantasy_seasons set ends_at = statement_timestamp() + interval '200 days' where id = pg_temp.u(914);
select extensions.is(
  pg_temp.activate(pg_temp.u(9), 'bank_transfer', 'VIR-4', 'Paid once the dates were right.', pg_temp.u(719)) ->> 'productCode',
  'plus_season', 'with the dates right it works');
select extensions.is(
  (select count(*)::integer from app_private.premium_grants where user_id = pg_temp.u(9)), 1,
  'and the refused calls wrote nothing');

select * from extensions.finish();
rollback;
