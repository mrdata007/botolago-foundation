-- BotolaGO+ (membership), card editions (20261013100100): api.choose_card_design and
-- app_private.card_edition_effective.
--
-- Covered: only a member can choose a paid edition (PT403 premium_required); standard is
-- always allowed (a lapsed member can go back to it); off is an answer, before the
-- step-up; the sign-in order; unknown, retired and out-of-window editions are PT404; one
-- row per member; a lapsed membership shows standard everywhere and the choice is
-- remembered for a renewal; the edition is public once the mode is on and, in preview,
-- visible to its owner only; the table cannot be written by a client; and the list of
-- functions that name the membership or edition tables is exactly the expected one, so a
-- ranking, a league or the card calculation can never depend on membership.
--
-- Accounts: 1 M member (monthly), 2 N nobody, 3 V verified MFA factor and a membership,
-- 4 L lapsed member, 5 G grant holder, 6 C closing account, 7 W another reader.
begin;
select extensions.plan(47);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('bc5e0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.run(p_user uuid, p_aal text, p_expr text, p_role text default 'authenticated')
returns jsonb language plpgsql as $$
declare result text;
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then jsonb_build_object('role', p_role)::text
      else jsonb_build_object('sub', p_user, 'role', p_role, 'aal', p_aal)::text end, true);
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
create function pg_temp.choose(p_user uuid, p_code text, p_aal text default 'aal1') returns jsonb language sql as $$
  select pg_temp.run(p_user, p_aal, format('api.choose_card_design(%L)', p_code))
$$;
create function pg_temp.choice(p_user integer) returns text language sql as $$
  select coalesce((select edition_code from app.card_edition_choices where user_id = pg_temp.u(p_user)), 'none')
$$;
create function pg_temp.shown(p_user integer, p_viewer integer default null) returns text language sql as $$
  select app_private.card_edition_effective(pg_temp.u(p_user), case when p_viewer is null then null else pg_temp.u(p_viewer) end)
$$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'editions-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'editions_' || n, 'display_name', 'Editions ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 7) n;
update app.profiles set deleted_at = statement_timestamp() where id = pg_temp.u(6);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.u(900), pg_temp.u(3), 'V TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp());
insert into app.premium_entitlements (user_id, state, product_code, source, current_period_start,
  current_period_end, last_event_at)
select pg_temp.u(n), 'active', 'plus_monthly', 'web', statement_timestamp() - interval '10 days',
  case when n = 4 then statement_timestamp() - interval '1 day' else statement_timestamp() + interval '20 days' end,
  statement_timestamp() - interval '10 days'
from unnest(array[1, 3, 4]) n;
insert into app_private.staff_principals (id, auth_user_id) values (pg_temp.u(800), pg_temp.u(7));
insert into app_private.premium_grants (user_id, ends_at, reason, granted_by_principal_id)
values (pg_temp.u(5), statement_timestamp() + interval '30 days', 'Preview for the owner and staff', pg_temp.u(800));

-- ---------------------------------------------------------------------------
-- Off is an answer
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.choose(pg_temp.u(1), 'holo'), '{"available": false}'::jsonb,
  'off: choosing answers {available:false} and writes nothing');
select extensions.is(pg_temp.choice(1), 'none', 'nothing was written');
select extensions.is(pg_temp.choose(pg_temp.u(3), 'holo'), '{"available": false}'::jsonb,
  'off is answered before the step-up');
select extensions.is(pg_temp.choose(pg_temp.u(1), 'Holo!') ->> '__error', 'PT400 validation_failed',
  'a malformed code is PT400 even while off');
select extensions.is(pg_temp.run(null, null, 'api.choose_card_design(''holo'')', 'anon') ->> '__error',
  '42501 permission denied for function choose_card_design', 'anon cannot call it');

-- ---------------------------------------------------------------------------
-- On
-- ---------------------------------------------------------------------------
select app_private.premium_configure('on');
select extensions.is(pg_temp.run(null, null, 'api.choose_card_design(''holo'')') ->> '__error',
  'PT401 authentication_required', 'a role without a user is PT401');
select extensions.is(pg_temp.choose(pg_temp.u(3), 'holo') ->> '__error', 'PT403 mfa_required',
  'a verified factor at aal1 gets mfa_required');
select extensions.is(pg_temp.choose(pg_temp.u(3), 'holo', 'aal2') ->> 'chosenEdition', 'holo',
  'and at aal2 a member chooses');
select extensions.is(pg_temp.choose(pg_temp.u(6), 'standard') ->> '__error', 'PT404 profile_not_found',
  'a closing account cannot choose');
select extensions.is(pg_temp.choose(pg_temp.u(2), 'holo') ->> '__error', 'PT403 premium_required',
  'N, who is not a member, cannot choose a paid edition');
select extensions.is(pg_temp.choose(pg_temp.u(2), 'chrome') ->> '__error', 'PT403 premium_required', 'not chrome either');
select extensions.is(pg_temp.choice(2), 'none', 'and nothing was written');
select extensions.is(pg_temp.choose(pg_temp.u(2), 'standard'),
  '{"available": true, "chosenEdition": "standard", "edition": "standard"}'::jsonb,
  'but anybody may choose the standard edition');
select extensions.is(pg_temp.choose(pg_temp.u(2), 'neon') ->> '__error', 'PT404 card_edition_not_found',
  'an edition that does not exist is PT404');

-- A member.
select extensions.is(pg_temp.choose(pg_temp.u(1), 'holo'),
  '{"available": true, "chosenEdition": "holo", "edition": "holo"}'::jsonb, 'M chooses holo');
select extensions.is(pg_temp.choose(pg_temp.u(1), 'electric') ->> 'edition', 'electric', 'and changes to electric');
select extensions.is(
  (select count(*)::integer from app.card_edition_choices where user_id = pg_temp.u(1)), 1, 'still one row');
select extensions.is(
  (select string_agg(code, ',' order by sort_order) from (
     select e.code, e.sort_order from app.card_editions e where e.premium) x),
  'holo,electric,pixel,chrome', 'there are four paid editions');
select extensions.is(
  (select string_agg(pg_temp.choose(pg_temp.u(1), e.code) ->> 'edition', ',' order by e.sort_order)
   from app.card_editions e where e.premium),
  'holo,electric,pixel,chrome', 'and a member can wear every one of them');
select extensions.is(pg_temp.run(pg_temp.u(1), 'aal1', 'api.get_my_premium()') ->> 'chosenEdition', 'chrome',
  'get_my_premium reports the choice');

-- Catalogue limits.
update app.card_editions set status = 'retired' where code = 'pixel';
select extensions.is(pg_temp.choose(pg_temp.u(1), 'pixel') ->> '__error', 'PT404 card_edition_not_found',
  'a retired edition cannot be chosen');
update app.card_editions set status = 'active', ends_at = statement_timestamp() - interval '1 day',
  starts_at = statement_timestamp() - interval '30 days' where code = 'pixel';
select extensions.is(pg_temp.choose(pg_temp.u(1), 'pixel') ->> '__error', 'PT404 card_edition_not_found',
  'nor one whose window has ended');
update app.card_editions set starts_at = statement_timestamp() + interval '1 day',
  ends_at = statement_timestamp() + interval '30 days' where code = 'pixel';
select extensions.is(pg_temp.choose(pg_temp.u(1), 'pixel') ->> '__error', 'PT404 card_edition_not_found',
  'nor one that has not started');
update app.card_editions set starts_at = null, ends_at = null where code = 'pixel';
select extensions.is(
  (select jsonb_array_length(pg_temp.run(pg_temp.u(1), 'aal1', 'api.get_my_premium()') -> 'editions')), 5,
  'five editions are offered when all are live');
update app.card_editions set status = 'retired' where code = 'pixel';
select extensions.is(
  (select jsonb_array_length(pg_temp.run(pg_temp.u(1), 'aal1', 'api.get_my_premium()') -> 'editions')), 4,
  'and a retired one is no longer offered');
select pg_temp.choose(pg_temp.u(1), 'chrome');
select extensions.is(pg_temp.shown(1), 'chrome', 'the chosen edition is shown');
update app.card_editions set status = 'retired' where code = 'chrome';
select extensions.is(pg_temp.shown(1), 'standard', 'an edition retired after it was chosen shows standard (no error)');
update app.card_editions set status = 'active' where code in ('chrome', 'pixel');

-- ---------------------------------------------------------------------------
-- Lapsing and renewing
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.shown(4), 'standard', 'L, whose period has ended, shows standard');
insert into app.card_edition_choices (user_id, edition_code) values (pg_temp.u(4), 'electric');
select extensions.is(pg_temp.shown(4) || '/' || pg_temp.choice(4), 'standard/electric',
  'a lapsed member''s card shows standard while the choice is remembered');
select extensions.is(pg_temp.choose(pg_temp.u(4), 'holo') ->> '__error', 'PT403 premium_required',
  'a lapsed member cannot pick a paid edition');
select extensions.is(pg_temp.choose(pg_temp.u(4), 'standard') ->> 'chosenEdition', 'standard',
  'but can go back to standard');
select extensions.is(pg_temp.run(pg_temp.u(4), 'aal1', 'api.get_my_premium()') ->> 'state', 'expired', 'their state is expired');
update app.card_edition_choices set edition_code = 'electric' where user_id = pg_temp.u(4);
update app.premium_entitlements set current_period_end = statement_timestamp() + interval '30 days'
where user_id = pg_temp.u(4);
select extensions.is(pg_temp.shown(4), 'electric', 'when membership is renewed, the remembered edition comes back');

-- ---------------------------------------------------------------------------
-- Who sees an edition
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.shown(1, 7), 'chrome', 'on: every signed-in reader sees a member''s edition (it is public)');
select extensions.is(pg_temp.shown(1), 'chrome', 'on: and the member');
select app_private.premium_configure('preview');
select pg_temp.choose(pg_temp.u(5), 'holo');
select extensions.is(pg_temp.choice(5), 'holo', 'preview: a grant holder can choose');
select extensions.is(pg_temp.shown(5, 5) || '/' || pg_temp.shown(5, 7) || '/' || pg_temp.shown(5), 'holo/standard/standard',
  'preview: only the owner of the card sees the edition; other readers see standard');
select extensions.is(pg_temp.shown(1, 1) || '/' || pg_temp.shown(1, 7), 'chrome/standard',
  'preview: a paying member counts as in on, but only they see their edition');
select extensions.is(pg_temp.choose(pg_temp.u(1), 'holo') ->> 'edition', 'holo',
  'and can choose a paid edition');
select extensions.is(pg_temp.choose(pg_temp.u(2), 'holo') ->> '__error', 'PT403 premium_required',
  'while someone with neither grant nor entitlement cannot');
select app_private.premium_configure('off');
select extensions.is(pg_temp.shown(1, 7) || '/' || pg_temp.shown(5, 5), 'standard/standard', 'off: every card is standard');
select extensions.is(pg_temp.choice(1) || '/' || pg_temp.choice(5), 'holo/holo', 'while the choices are kept');
select app_private.premium_configure('on');
select extensions.is(pg_temp.shown(1, 7), 'holo', 'and come back when the mode is on');

-- ---------------------------------------------------------------------------
-- The table is not writable by a client; the edition never feeds a computation
-- ---------------------------------------------------------------------------
select extensions.ok(
  not has_any_column_privilege('authenticated', 'app.card_edition_choices', 'select,insert,update,references')
  and not has_any_column_privilege('anon', 'app.card_edition_choices', 'select,insert,update,references')
  and not has_any_column_privilege('service_role', 'app.card_edition_choices', 'select,insert,update,references'),
  'no client role can read or write app.card_edition_choices: the only way in is api.choose_card_design');
select extensions.is(pg_temp.choice(2), 'standard', 'N still has only the standard choice made earlier');
select extensions.is(
  (select string_agg(n.nspname || '.' || p.proname, ',' order by n.nspname || '.' || p.proname collate "C")
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('api', 'app', 'app_private')
     and p.prosrc ~* 'premium_entitlements|premium_grants|premium_settings|premium_products|billing_events|billing_customers|card_edition|has_premium'),
  'api.admin_get_premium_member,api.admin_grant_premium,api.admin_premium_overview,api.admin_revoke_premium,'
  || 'api.choose_card_design,api.get_card_duel,api.get_card_league_context,api.get_manager_cards,api.get_my_card_career,'
  || 'api.get_my_card_history_visibility,api.get_my_manager_card,api.get_my_premium,api.get_round_recap,'
  || 'api.premium_status,api.service_apply_billing_event,api.set_card_history_visibility,'
  || 'app_private.account_deletion_erase,app_private.card_edition_effective,app_private.card_premium_mode,'
  || 'app_private.has_premium,app_private.premium_configure,app_private.premium_erase_user',
  'the only functions that name the membership or edition tables: the membership API, the two card reads (display), the premium career and duel reads with their privacy switch (20261013100400, read-only over data the card already computed), the league context read (20261014150000, the same), the round recap read (20261015120000, the same) and the account erasure; no ranking, league, Fantasy, Pronostics or Manager Card calculation function does');
select extensions.is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('api', 'app', 'app_private')
     and p.prosrc ~* 'premium_entitlements|premium_grants|premium_settings|billing_events|card_edition|has_premium'
     and (p.proname ~ '(tick|compute|rank|standing|league|score|points|evaluate|finalize)')
     -- the one display read named after the league it reads (20261014150000): it computes
     -- nothing and writes nothing, and the list above names it
     and p.proname <> 'get_card_league_context'),
  0, 'in particular none whose name is a tick, a computation, a ranking, a standing, a league, a score or a finalization (apart from the league context read, which only displays)');

select * from extensions.finish();
rollback;
