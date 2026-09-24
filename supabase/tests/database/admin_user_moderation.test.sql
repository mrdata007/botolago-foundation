-- Admin user directory, bans and the analytics overview
-- (20260924160000_admin_user_moderation_and_analytics.sql).
--
-- Accounts:
--   P  platform admin (MFA, aal2, fresh session)
--   S  support agent: users.read_support only
--   R  a revoked former staff member -- an ordinary account again
--   U1 karim_10   the account that gets banned, then lifted
--   U2 karim10x   a near-miss for the literal-underscore search; asks for deletion
--   U3 lina_77    banned until lifted
--   U4 omar_90    an expired ban only
begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at
)
values
  ('e8a00000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'owner-p@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"owner_p"}', timestamptz '2090-01-01T10:00:00Z', statement_timestamp(), null),
  ('e8a00000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'support-s@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"support_s"}', timestamptz '2090-01-02T10:00:00Z', statement_timestamp(), null),
  ('e8a00000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'former-r@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"former_r"}', timestamptz '2090-01-03T10:00:00Z', statement_timestamp(), null),
  ('e8a00000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'karim@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"karim_10","display_name":"Karim Benali"}',
    timestamptz '2090-01-04T10:00:00Z', statement_timestamp(), statement_timestamp()),
  ('e8a00000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'karim.x@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"karim10x"}', timestamptz '2090-01-05T10:00:00Z', statement_timestamp(), null),
  ('e8a00000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'lina@example.test', null, 'hash',
    '{}', '{"username":"lina_77"}', timestamptz '2090-01-06T10:00:00Z', statement_timestamp(), null),
  ('e8a00000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'omar@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"omar_90"}', timestamptz '2090-01-07T10:00:00Z', statement_timestamp(), null);

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values
  ('e8a10000-0000-4000-8000-000000000001', 'e8a00000-0000-4000-8000-000000000001',
    'Owner TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()),
  ('e8a10000-0000-4000-8000-000000000002', 'e8a00000-0000-4000-8000-000000000002',
    'Support TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp());
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('e8a20000-0000-4000-8000-000000000001', 'e8a00000-0000-4000-8000-000000000001',
    statement_timestamp(), statement_timestamp(), 'aal2'),
  ('e8a20000-0000-4000-8000-000000000002', 'e8a00000-0000-4000-8000-000000000002',
    statement_timestamp(), statement_timestamp(), 'aal2');

insert into app_private.staff_principals (id, auth_user_id)
values
  ('e8a30000-0000-4000-8000-000000000001', 'e8a00000-0000-4000-8000-000000000001'),
  ('e8a30000-0000-4000-8000-000000000002', 'e8a00000-0000-4000-8000-000000000002');
insert into app_private.staff_principals (
  id, auth_user_id, status, revoked_at, revoked_by_principal_id, revocation_reason
) values (
  'e8a30000-0000-4000-8000-000000000003', 'e8a00000-0000-4000-8000-000000000003',
  'revoked', statement_timestamp(), 'e8a30000-0000-4000-8000-000000000001',
  'Left the company in the fixture.'
);
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select fixture.principal_id, role.id, 'Moderation pgTAP fixture assignment.'
from (values
  ('e8a30000-0000-4000-8000-000000000001'::uuid, 'platform_admin'),
  ('e8a30000-0000-4000-8000-000000000002'::uuid, 'support_agent')
) as fixture(principal_id, role_name)
join app_private.admin_roles role on role.name = fixture.role_name;

-- A Fantasy season to write teams into.
insert into app.countries (id, iso_alpha2, iso_alpha3) values
  ('e8b00000-0000-4000-8000-000000000001', 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('e8b10000-0000-4000-8000-000000000001', 'moderation-test', 'Moderation Test', 'MOD',
  'league', (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e8b20000-0000-4000-8000-000000000001', 'e8b10000-0000-4000-8000-000000000001',
  '2090/91', '2090-08-01', '2091-06-30', 'active', false);
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('e8b30000-0000-4000-8000-000000000001', 'e8b10000-0000-4000-8000-000000000001',
  'moderation-test', 'Moderation Test', true);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('e8b40000-0000-4000-8000-000000000001', 'e8b30000-0000-4000-8000-000000000001',
  'e8b20000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2090/91', 'active', '2090-08-01', '2091-06-30');

-- U4's only ban ended yesterday.
insert into app_private.user_bans (user_id, banned_by_principal_id, reason, starts_at, ends_at)
values ('e8a00000-0000-4000-8000-000000000014', 'e8a30000-0000-4000-8000-000000000001',
  'Expired fixture ban for spam.', statement_timestamp() - interval '8 days',
  statement_timestamp() - interval '1 day');

-- U2 asked for deletion.
insert into app.account_deletion_requests (user_id)
values ('e8a00000-0000-4000-8000-000000000012');

select set_config('test.total_users', (select count(*)::text from auth.users), true);

-- ---------------------------------------------------------------------------
-- Permission catalog
-- ---------------------------------------------------------------------------

select extensions.ok(
  exists (
    select 1 from app_private.admin_role_permissions mapping
    join app_private.admin_roles role on role.id = mapping.role_id
    join app_private.admin_permissions permission on permission.id = mapping.permission_id
    where role.name = 'platform_admin' and permission.name = 'analytics.read'
      and permission.requires_mfa and not permission.requires_recent_auth
  ),
  'analytics.read exists, needs MFA but not recent auth, and platform_admin holds it'
);
select extensions.is(
  (select count(*)::integer from app_private.admin_role_permissions mapping
   join app_private.admin_permissions permission on permission.id = mapping.permission_id
   where permission.name = 'analytics.read'),
  1, 'no role other than platform_admin holds analytics.read'
);
select extensions.ok(
  (select requires_recent_auth from app_private.admin_permissions where name = 'users.moderate'),
  'users.moderate still requires recent authentication'
);

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select api.admin_list_users()$$, '42501', null,
  'an anonymous caller cannot reach the user directory'
);
select extensions.throws_ok(
  $$select api.get_my_account_standing()$$, '42501', null,
  'an anonymous caller has no account standing to ask about'
);
select extensions.throws_ok(
  $$select api.admin_get_analytics_overview()$$, '42501', null,
  'an anonymous caller cannot read analytics'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select api.admin_list_users()$$, 'PT403', 'staff_access_denied',
  'a signed-in account that is not staff is refused'
);
select extensions.throws_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000011',
    'Not staff at all trying.', 24, gen_random_uuid())$$,
  'PT403', 'staff_access_denied', 'a non-staff account cannot ban anyone'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"e8a20000-0000-4000-8000-000000000001"}',
  true);
select extensions.throws_ok(
  $$select api.admin_list_users()$$, 'PT403', 'mfa_assurance_insufficient',
  'the directory needs an aal2 session'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","session_id":"e8a20000-0000-4000-8000-000000000002"}',
  true);
select extensions.lives_ok(
  $$select api.admin_list_users()$$, 'a support agent reads the directory'
);
select extensions.lives_ok(
  $$select api.admin_get_user('e8a00000-0000-4000-8000-000000000011')$$,
  'a support agent reads one account'
);
select extensions.throws_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000011',
    'Support cannot moderate.', 24, gen_random_uuid())$$,
  'PT403', 'permission_missing', 'a support agent cannot ban'
);
select extensions.throws_ok(
  $$select api.admin_get_analytics_overview()$$, 'PT403', 'permission_missing',
  'a support agent cannot read analytics'
);
reset role;

-- ---------------------------------------------------------------------------
-- The directory
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e8a20000-0000-4000-8000-000000000001"}',
  true);

select extensions.is(
  api.admin_list_users('karim') -> 'items' -> 0 ->> 'username', 'karim10x',
  'newest accounts come first'
);
select extensions.is(
  (select array_agg(item ->> 'username' order by position)
   from jsonb_array_elements(api.admin_list_users('karim') -> 'items') with ordinality as page(item, position)),
  array['karim10x', 'karim_10'], 'a name fragment matches every account that contains it'
);
select extensions.is(
  (select array_agg(item ->> 'username')
   from jsonb_array_elements(api.admin_list_users('karim_') -> 'items') item),
  array['karim_10'], 'an underscore typed by the operator is matched literally, not as a wildcard'
);
select extensions.is(
  (select array_agg(item ->> 'username')
   from jsonb_array_elements(api.admin_list_users('Benali') -> 'items') item),
  array['karim_10'], 'the display name is searched too, ignoring case'
);
select extensions.is(
  (select array_agg(item ->> 'username')
   from jsonb_array_elements(api.admin_list_users('KARIM@example.test') -> 'items') item),
  array['karim_10'], 'an exact email finds its account, ignoring case'
);
select extensions.is(
  jsonb_array_length(api.admin_list_users('karim@example') -> 'items'), 0,
  'a partial email finds nothing: emails are matched exactly'
);
select extensions.is(
  (select array_agg(item ->> 'username')
   from jsonb_array_elements(api.admin_list_users('e8a00000-0000-4000-8000-000000000013') -> 'items') item),
  array['lina_77'], 'a user id finds its account'
);

select extensions.is(
  api.admin_get_user('e8a00000-0000-4000-8000-000000000011') ->> 'maskedEmail', 'k***@e***.test',
  'the email is masked'
);
select extensions.is(
  position('karim@example.test' in api.admin_list_users('karim')::text), 0,
  'no full email leaves the directory'
);
select extensions.is(
  api.admin_get_user('e8a00000-0000-4000-8000-000000000011') ->> 'displayName', 'Karim Benali',
  'the display name is returned'
);
select extensions.is(
  (api.admin_get_user('e8a00000-0000-4000-8000-000000000013') ->> 'emailVerified')::boolean, false,
  'an unconfirmed email is reported'
);
select extensions.is(
  (api.admin_get_user('e8a00000-0000-4000-8000-000000000002') ->> 'isStaff')::boolean, true,
  'a current staff account is flagged'
);
select extensions.is(
  (api.admin_get_user('e8a00000-0000-4000-8000-000000000003') ->> 'isStaff')::boolean, false,
  'a revoked former staff account is an ordinary account again'
);
select extensions.is(
  (api.admin_get_user('e8a00000-0000-4000-8000-000000000012') ->> 'deletionRequested')::boolean, true,
  'a pending deletion request is reported'
);
select extensions.throws_ok(
  $$select api.admin_get_user('e8a0ffff-0000-4000-8000-000000000099')$$,
  'PT404', 'user_not_found', 'an unknown account is not found'
);

-- Keyset pagination: two pages of two do not overlap and keep the order.
select set_config('test.page_one', api.admin_list_users(null, null, 2)::text, true);
select extensions.is(
  jsonb_array_length(current_setting('test.page_one')::jsonb -> 'items'), 2,
  'a page holds the requested number of accounts'
);
select extensions.isnt(
  current_setting('test.page_one')::jsonb -> 'nextCursor', 'null'::jsonb,
  'a full page carries a cursor to the next one'
);
select set_config('test.page_two', api.admin_list_users(
  null, null, 2,
  (current_setting('test.page_one')::jsonb -> 'nextCursor' ->> 'createdAt')::timestamptz,
  (current_setting('test.page_one')::jsonb -> 'nextCursor' ->> 'id')::uuid
)::text, true);
select extensions.is(
  (select count(*)::integer
   from jsonb_array_elements(current_setting('test.page_one')::jsonb -> 'items') first_page(item)
   join jsonb_array_elements(current_setting('test.page_two')::jsonb -> 'items') second_page(item)
     on first_page.item ->> 'userId' = second_page.item ->> 'userId'),
  0, 'the second page does not repeat the first'
);
select extensions.ok(
  (current_setting('test.page_one')::jsonb -> 'items' -> 1 ->> 'createdAt')::timestamptz
    >= (current_setting('test.page_two')::jsonb -> 'items' -> 0 ->> 'createdAt')::timestamptz,
  'the second page continues the newest-first order'
);
select extensions.is(
  api.admin_list_users('omar_90') -> 'nextCursor', 'null'::jsonb,
  'a last page carries no cursor'
);
select extensions.throws_ok(
  $$select api.admin_list_users(null, 'everyone')$$, 'PT400', 'validation_failed',
  'an unknown status filter is refused'
);
select extensions.throws_ok(
  $$select api.admin_list_users(null, null, 10, statement_timestamp(), null)$$,
  'PT400', 'validation_failed', 'half a cursor is refused'
);
select extensions.is(
  (select array_agg(item ->> 'username')
   from jsonb_array_elements(api.admin_list_users(null, 'deletion_requested') -> 'items') item),
  array['karim10x'], 'the deletion filter lists pending deletion requests'
);

-- ---------------------------------------------------------------------------
-- Bans
-- ---------------------------------------------------------------------------

select extensions.throws_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000011', 'short', 24, gen_random_uuid())$$,
  'PT400', 'moderation_reason_invalid', 'a ban needs a reason of at least 8 characters'
);
select extensions.throws_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000011',
    'Zero hours is not a ban.', 0, gen_random_uuid())$$,
  'PT400', 'ban_duration_invalid', 'a ban lasts at least an hour'
);
select extensions.throws_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000011',
    'Longer than ten years.', 87601, gen_random_uuid())$$,
  'PT400', 'ban_duration_invalid', 'a timed ban lasts at most ten years'
);
select extensions.throws_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000001',
    'Banning my own account.', 24, gen_random_uuid())$$,
  'PT409', 'self_moderation_forbidden', 'nobody can ban themselves'
);
select extensions.throws_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000002',
    'Banning a current staff member.', 24, gen_random_uuid())$$,
  'PT409', 'staff_account_protected', 'current staff cannot be banned from the directory'
);
select extensions.throws_ok(
  $$select api.admin_ban_user('e8a0ffff-0000-4000-8000-000000000099',
    'Nobody by that id exists.', 24, gen_random_uuid())$$,
  'PT404', 'user_not_found', 'an unknown account cannot be banned'
);

select set_config('test.ban_key', gen_random_uuid()::text, true);
select set_config('test.banned', api.admin_ban_user(
  'e8a00000-0000-4000-8000-000000000011', 'Abusive team names reported twice.', 168,
  current_setting('test.ban_key')::uuid
)::text, true);
select extensions.isnt(
  current_setting('test.banned')::jsonb -> 'activeBan', 'null'::jsonb,
  'the ban is active at once'
);
select extensions.is(
  (current_setting('test.banned')::jsonb -> 'activeBan' ->> 'endsAt')::timestamptz
    - (current_setting('test.banned')::jsonb -> 'activeBan' ->> 'startsAt')::timestamptz,
  interval '168 hours',
  'a 168-hour ban ends seven days after it was placed'
);
select extensions.is(
  api.admin_ban_user(
    'e8a00000-0000-4000-8000-000000000011', 'Abusive team names reported twice.', 168,
    current_setting('test.ban_key')::uuid
  ),
  current_setting('test.banned')::jsonb,
  'replaying the same request returns the first answer'
);
select extensions.throws_ok(
  format(
    $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000011',
      'A different reason entirely.', 168, %L)$$,
    current_setting('test.ban_key')
  ),
  'PT409', 'idempotency_conflict', 'the same key cannot carry a different request'
);
select extensions.throws_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000011',
    'Second ban on top of the first.', 24, gen_random_uuid())$$,
  'PT409', 'user_already_banned', 'an account holds one active ban at a time'
);
select extensions.lives_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000003',
    'Former staff, now spamming.', null, gen_random_uuid())$$,
  'a revoked former staff account can be banned like any other'
);
select extensions.lives_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000014',
    'Back to spamming after the first ban.', 24, gen_random_uuid())$$,
  'an expired ban does not block a new one'
);
select set_config('test.banned_forever', api.admin_ban_user(
  'e8a00000-0000-4000-8000-000000000013', 'Impersonating a club official.', null, gen_random_uuid()
)::text, true);
select extensions.is(
  current_setting('test.banned_forever')::jsonb -> 'activeBan' -> 'endsAt', 'null'::jsonb,
  'a ban without a duration lasts until lifted'
);

select extensions.is(
  jsonb_array_length(api.admin_get_user('e8a00000-0000-4000-8000-000000000011') -> 'bans'), 1,
  'the replayed request placed one ban, not two'
);
select extensions.is(
  api.admin_get_user('e8a00000-0000-4000-8000-000000000011') -> 'bans' -> 0 ->> 'bannedByMaskedEmail',
  'o***@e***.test', 'the history names who banned, masked'
);
select extensions.is(
  (select array_agg(item ->> 'username' order by item ->> 'username')
   from jsonb_array_elements(api.admin_list_users(null, 'banned') -> 'items') item),
  array['former_r', 'karim_10', 'lina_77', 'omar_90'], 'the banned filter lists active bans only'
);
select extensions.ok(
  not exists (
    select 1 from jsonb_array_elements(api.admin_list_users(null, 'active') -> 'items') item
    where item ->> 'userId' = 'e8a00000-0000-4000-8000-000000000011'
  ),
  'a banned account is not listed as active'
);
reset role;

select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'users.ban_user'
     and target_entity_id = 'e8a00000-0000-4000-8000-000000000011'
     and outcome = 'succeeded'
     and reason = 'Abusive team names reported twice.'),
  1, 'the ban is audited once, with its reason'
);

-- Recent authentication is required to ban, not to read.
update auth.sessions set created_at = statement_timestamp() - interval '1 hour'
where id = 'e8a20000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e8a20000-0000-4000-8000-000000000001"}',
  true);
select extensions.throws_ok(
  $$select api.admin_ban_user('e8a00000-0000-4000-8000-000000000012',
    'Stale session trying to ban.', 24, gen_random_uuid())$$,
  'PT403', 'recent_auth_required', 'banning needs a recent sign-in'
);
select extensions.lives_ok(
  $$select api.admin_list_users()$$, 'reading the directory does not'
);
reset role;
update auth.sessions set created_at = statement_timestamp()
where id = 'e8a20000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- What a ban does to the banned account
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}', true);
select extensions.is(
  (api.get_my_account_standing() ->> 'banned')::boolean, true,
  'the banned account learns it is banned'
);
select extensions.ok(
  (api.get_my_account_standing() ->> 'bannedUntil')::timestamptz > statement_timestamp(),
  'and until when'
);
select extensions.is(
  (select array_agg(key order by key) from jsonb_object_keys(api.get_my_account_standing()) key),
  array['banned', 'bannedUntil'], 'and nothing else: the staff reason stays internal'
);
select extensions.throws_ok(
  $$select api.admin_list_users()$$, 'PT403', 'staff_access_denied',
  'a banned account has no admin access'
);
select extensions.lives_ok(
  $$select api.request_account_deletion()$$,
  'a banned account can still ask for its account to be deleted'
);
reset role;

-- The data layer refuses the banned actor, whatever route the write takes.
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select extensions.throws_ok(
  $$update app.profiles set display_name = 'Nouveau Nom' where id = 'e8a00000-0000-4000-8000-000000000011'$$,
  'PT403', 'account_banned', 'a banned account cannot change its profile'
);
select extensions.throws_ok(
  $$insert into app.fantasy_teams (user_id, fantasy_season_id, name, bank, team_value, free_transfers)
    values ('e8a00000-0000-4000-8000-000000000011', 'e8b40000-0000-4000-8000-000000000001',
      'Banned Eleven', 0, 100, 1)$$,
  'PT403', 'account_banned', 'a banned account cannot create a Fantasy team'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.lives_ok(
  $$insert into app.fantasy_teams (id, user_id, fantasy_season_id, name, bank, team_value, free_transfers)
    values ('e8b50000-0000-4000-8000-000000000011', 'e8a00000-0000-4000-8000-000000000011',
      'e8b40000-0000-4000-8000-000000000001', 'Service Eleven', 0, 100, 1)$$,
  'work with no actor (the trusted lifecycle) is never refused'
);
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select extensions.throws_ok(
  $$update app.fantasy_teams set name = 'Renamed Eleven' where id = 'e8b50000-0000-4000-8000-000000000011'$$,
  'PT403', 'account_banned', 'a banned account cannot rename its team'
);
select extensions.throws_ok(
  $$insert into app.fantasy_leagues (fantasy_season_id, owner_user_id, name, visibility)
    values ('e8b40000-0000-4000-8000-000000000001', 'e8a00000-0000-4000-8000-000000000011',
      'Banned League', 'public')$$,
  'PT403', 'account_banned', 'a banned account cannot create a league'
);

-- Another manager is not affected, even when the row they touch is the banned
-- account's: enforcement keys on who acts, not whose row it is.
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000012","role":"authenticated"}', true);
select extensions.lives_ok(
  $$update app.profiles set display_name = 'Karim X' where id = 'e8a00000-0000-4000-8000-000000000012'$$,
  'an account in good standing changes its profile'
);
select extensions.lives_ok(
  $$insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility)
    values ('e8b60000-0000-4000-8000-000000000001', 'e8b40000-0000-4000-8000-000000000001',
      'e8a00000-0000-4000-8000-000000000011', 'Shared League', 'public')$$,
  'an account in good standing may write a row that belongs to the banned account'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- An expired ban no longer counts.
select extensions.is(
  app_private.user_is_banned('e8a00000-0000-4000-8000-000000000011'), true,
  'the helper sees the active ban'
);
update app_private.user_bans
set starts_at = statement_timestamp() - interval '10 days',
  ends_at = statement_timestamp() - interval '1 second'
where user_id = 'e8a00000-0000-4000-8000-000000000014' and lifted_at is null;
select extensions.is(
  app_private.user_is_banned('e8a00000-0000-4000-8000-000000000014'), false,
  'a ban whose end has passed is over'
);

-- ---------------------------------------------------------------------------
-- Lifting a ban
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e8a20000-0000-4000-8000-000000000001"}',
  true);
select extensions.throws_ok(
  $$select api.admin_unban_user('e8a00000-0000-4000-8000-000000000012',
    'Nothing to lift here.', gen_random_uuid())$$,
  'PT409', 'user_not_banned', 'an account without an active ban cannot be lifted'
);
select extensions.throws_ok(
  $$select api.admin_unban_user('e8a00000-0000-4000-8000-000000000011', 'short', gen_random_uuid())$$,
  'PT400', 'moderation_reason_invalid', 'lifting needs a reason too'
);
select set_config('test.lifted', api.admin_unban_user(
  'e8a00000-0000-4000-8000-000000000011', 'Appeal accepted after review.', gen_random_uuid()
)::text, true);
select extensions.is(
  current_setting('test.lifted')::jsonb -> 'activeBan', 'null'::jsonb,
  'the lifted account has no active ban'
);
select extensions.is(
  api.admin_get_user('e8a00000-0000-4000-8000-000000000011') -> 'bans' -> 0 ->> 'liftReason',
  'Appeal accepted after review.', 'the history keeps the ban and why it was lifted'
);
select extensions.throws_ok(
  $$select api.admin_unban_user('e8a00000-0000-4000-8000-000000000011',
    'Lifting a second time.', gen_random_uuid())$$,
  'PT409', 'user_not_banned', 'a lifted ban cannot be lifted again'
);
reset role;

select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'users.unban_user'
     and target_entity_id = 'e8a00000-0000-4000-8000-000000000011'
     and outcome = 'succeeded'),
  1, 'lifting is audited'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}', true);
select extensions.is(
  api.get_my_account_standing(), '{"banned": false, "bannedUntil": null}'::jsonb,
  'the lifted account is in good standing again'
);
reset role;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select extensions.lives_ok(
  $$update app.profiles set display_name = 'Karim B' where id = 'e8a00000-0000-4000-8000-000000000011'$$,
  'and can change its profile again'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e8a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e8a20000-0000-4000-8000-000000000001"}',
  true);
select set_config('test.analytics', api.admin_get_analytics_overview()::text, true);
reset role;

select extensions.is(
  (current_setting('test.analytics')::jsonb -> 'users' ->> 'total')::integer,
  current_setting('test.total_users')::integer, 'the total counts every account'
);
select extensions.is(
  (current_setting('test.analytics')::jsonb -> 'users' ->> 'banned')::integer,
  (select count(distinct user_id)::integer from app_private.user_bans
   where lifted_at is null and starts_at <= statement_timestamp()
     and (ends_at is null or ends_at > statement_timestamp())),
  'the banned count is the number of accounts under an active ban'
);
select extensions.is(
  (current_setting('test.analytics')::jsonb -> 'users' ->> 'banned')::integer, 2,
  'two accounts are banned in the fixture (former staff and lina_77)'
);
select extensions.is(
  jsonb_array_length(current_setting('test.analytics')::jsonb -> 'signupsByDay'), 30,
  'the sign-up series covers thirty days'
);
select extensions.is(
  current_setting('test.analytics')::jsonb -> 'signupsByDay' -> 29 ->> 'date',
  to_char((statement_timestamp() at time zone 'Africa/Casablanca')::date, 'YYYY-MM-DD'),
  'the series ends today, in Morocco'
);
select extensions.is(
  (select sum((day ->> 'count')::integer)::integer
   from jsonb_array_elements(current_setting('test.analytics')::jsonb -> 'signupsByDay') day),
  (select count(*)::integer from auth.users
   where created_at >= ((((statement_timestamp() at time zone 'Africa/Casablanca')::date) - 29)::timestamp
       at time zone 'Africa/Casablanca')
     and created_at < ((((statement_timestamp() at time zone 'Africa/Casablanca')::date) + 1)::timestamp
       at time zone 'Africa/Casablanca')),
  'the series adds up to the accounts created in its window'
);
select extensions.is(
  (current_setting('test.analytics')::jsonb -> 'users' ->> 'deletionRequested')::integer,
  (select count(*)::integer from app.account_deletion_requests where status in ('requested', 'processing')),
  'pending deletion requests are counted'
);
select extensions.is(
  (current_setting('test.analytics')::jsonb -> 'fantasy' ->> 'teams')::integer,
  (select count(*)::integer from app.fantasy_teams where status = 'active'),
  'active Fantasy teams are counted'
);
select extensions.is(
  position('@' in current_setting('test.analytics')), 0,
  'analytics carry no email, masked or not'
);

select * from extensions.finish();

rollback;
