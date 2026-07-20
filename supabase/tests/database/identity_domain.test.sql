begin;

select extensions.no_plan();

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'alice@example.test',
  'password-hash-one',
  statement_timestamp(),
  '{}'::jsonb,
  '{"username":"Alice_User","display_name":"Alice Test","preferred_language":"ar"}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
);

select extensions.is(
  (select count(*)::integer from app.profiles where id = '11111111-1111-4111-8111-111111111111'),
  1,
  'auth user trigger creates exactly one profile'
);
select extensions.is(
  (select username from app.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'alice_user',
  'username is normalized before canonical storage'
);
select extensions.is(
  (select normalized_username from app.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'alice_user',
  'generated normalized username matches canonical username'
);
select extensions.is(
  (select preferred_language::text from app.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'ar',
  'validated preferred language is persisted'
);
select extensions.is(
  (select count(*)::integer from app.user_preferences where user_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'auth user trigger creates exactly one preferences row'
);

select extensions.lives_ok(
  $$select app_private.ensure_identity(
    '11111111-1111-4111-8111-111111111111',
    '{"username":"alice_user"}'::jsonb
  )$$,
  'identity creation is idempotent under retry'
);
select extensions.is(
  (select count(*)::integer from app.profiles where id = '11111111-1111-4111-8111-111111111111'),
  1,
  'idempotent identity retry never creates duplicates'
);

select extensions.throws_ok(
  $$insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '22222222-2222-4222-8222-222222222222',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'unicode@example.test', 'hash',
      '{}'::jsonb, '{"username":"أمين"}'::jsonb,
      statement_timestamp(), statement_timestamp()
    )$$,
  'P0001',
  'USERNAME_INVALID',
  'Unicode usernames outside the allowed ASCII contract are rejected'
);
select extensions.throws_ok(
  $$insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '22222222-2222-4222-8222-222222222223',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'space@example.test', 'hash',
      '{}'::jsonb, '{"username":"bad name"}'::jsonb,
      statement_timestamp(), statement_timestamp()
    )$$,
  'P0001',
  'USERNAME_INVALID',
  'internal username whitespace is rejected'
);
select extensions.throws_ok(
  $$insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '22222222-2222-4222-8222-222222222224',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'reserved@example.test', 'hash',
      '{}'::jsonb, '{"username":"Admin"}'::jsonb,
      statement_timestamp(), statement_timestamp()
    )$$,
  'P0001',
  'USERNAME_RESERVED',
  'reserved usernames are rejected server-side'
);
select extensions.throws_ok(
  $$insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '22222222-2222-4222-8222-222222222225',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'duplicate@example.test', 'hash',
      '{}'::jsonb, '{"username":"ALICE_USER"}'::jsonb,
      statement_timestamp(), statement_timestamp()
    )$$,
  'P0001',
  'USERNAME_TAKEN',
  'case-insensitive username conflicts fail atomically'
);

select extensions.is(
  (select normalized_username from api.username_availability('  Free_Name  ')),
  'free_name',
  'availability checks use the canonical trim and case normalization'
);
select extensions.ok(
  (select available from api.username_availability('free_name')),
  'an unused valid username is available'
);
select extensions.is(
  (select reason from api.username_availability('ADMIN')),
  'reserved',
  'availability returns a stable reserved reason'
);
select extensions.is(
  (select reason from api.username_availability('Alice_User')),
  'taken',
  'availability returns a stable conflict reason'
);
select extensions.is(
  (select reason from api.username_availability('bad name')),
  'invalid',
  'availability returns a stable validation reason'
);
select extensions.is(
  (select reason from api.username_availability(null)),
  'invalid',
  'NULL username availability fails closed with a stable validation reason'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',
  true
);

select extensions.throws_ok(
  $$select api.complete_onboarding(
    'Alice Manager', null, null, 'fr'::app.language_code,
    null, null, true, true, true
  )$$,
  'PT400',
  'INVALID_USERNAME',
  'explicit NULL cannot bypass onboarding username validation'
);
select extensions.throws_ok(
  $$select api.update_my_preferences(null, true, true, 'fr'::app.language_code)$$,
  'PT400',
  'INVALID_PREFERENCES',
  'explicit NULL cannot bypass preference validation'
);
select extensions.throws_ok(
  $$select api.follow_team(null)$$,
  'PT400',
  'INVALID_TEAM_ID',
  'explicit NULL cannot create a malformed team follow'
);
select extensions.throws_ok(
  $$select api.follow_competition(null)$$,
  'PT400',
  'INVALID_COMPETITION_ID',
  'explicit NULL cannot create a malformed competition follow'
);
select extensions.throws_ok(
  $$select api.record_session_revocation(null)$$,
  'PT400',
  'INVALID_SESSION_SCOPE',
  'explicit NULL cannot bypass session-revocation validation'
);

select extensions.lives_ok(
  $$select api.complete_onboarding(
    'Alice Manager',
    'Alice_User',
    null,
    'fr'::app.language_code,
    null,
    'war',
    true,
    false,
    true
  )$$,
  'onboarding completes as one transaction'
);
select extensions.ok(
  (select onboarding_completed_at is not null from api.my_profile),
  'onboarding completion timestamp is visible through the owner view'
);
select extensions.is(
  (select favorite_club_id from api.my_profile),
  'war',
  'frozen frontend favorite-team reference remains compatible until Phase 3'
);

select extensions.lives_ok(
  $$select api.follow_team('aaaaaaaa-1111-4111-8111-111111111111')$$,
  'following a canonical team UUID succeeds'
);
select extensions.lives_ok(
  $$select api.follow_team('aaaaaaaa-1111-4111-8111-111111111111')$$,
  'following the same team is idempotent'
);
select extensions.is(
  (select count(*)::integer from api.my_followed_teams),
  1,
  'idempotent follow creates one row'
);
select extensions.lives_ok(
  $$select api.unfollow_team('aaaaaaaa-1111-4111-8111-111111111111')$$,
  'unfollow succeeds'
);
select extensions.lives_ok(
  $$select api.unfollow_team('aaaaaaaa-1111-4111-8111-111111111111')$$,
  'repeated unfollow remains idempotent'
);
select extensions.is(
  (select count(*)::integer from api.my_followed_teams),
  0,
  'unfollow removes the relation'
);

select extensions.lives_ok(
  $$select api.follow_competition('bbbbbbbb-1111-4111-8111-111111111111')$$,
  'following a canonical competition UUID succeeds'
);
select extensions.is(
  (select count(*)::integer from api.my_followed_competitions),
  1,
  'competition follow is persisted once'
);
select extensions.lives_ok(
  $$select api.unfollow_competition('bbbbbbbb-1111-4111-8111-111111111111')$$,
  'competition unfollow succeeds'
);

select extensions.ok(
  api.request_account_deletion() is not null,
  'account deletion request returns an identifier'
);
select extensions.ok(
  api.request_account_deletion() is not null,
  'account deletion request is idempotent'
);
select extensions.is(
  (select count(*)::integer from api.my_account_deletion_requests where status = 'requested'),
  1,
  'only one active account deletion request exists'
);

select extensions.lives_ok(
  $$select api.record_session_revocation('local')$$,
  'session revocation request is accepted for a supported scope'
);
select extensions.throws_ok(
  $$select api.record_session_revocation('invalid')$$,
  'PT400',
  'INVALID_SESSION_SCOPE',
  'unsupported session revocation scope is rejected'
);

reset role;

select extensions.ok(
  exists (
    select 1 from app_private.security_audit_log
    where user_id = '11111111-1111-4111-8111-111111111111'
      and event_type = 'onboarding_completed'
  ),
  'onboarding completion creates a private audit event'
);
select extensions.ok(
  exists (
    select 1 from app_private.security_audit_log
    where user_id = '11111111-1111-4111-8111-111111111111'
      and event_type = 'account_deletion_requested'
  ),
  'account deletion creates a private audit event'
);
select extensions.ok(
  exists (
    select 1 from app_private.security_audit_log
    where user_id = '11111111-1111-4111-8111-111111111111'
      and event_type = 'session_revocation_requested'
      and metadata = '{"scope":"local"}'::jsonb
  ),
  'session revocation audit contains only bounded non-secret metadata'
);

update auth.users
set encrypted_password = 'password-hash-two'
where id = '11111111-1111-4111-8111-111111111111';

select extensions.ok(
  exists (
    select 1 from app_private.security_audit_log
    where user_id = '11111111-1111-4111-8111-111111111111'
      and event_type = 'password_changed'
      and metadata = '{}'::jsonb
  ),
  'password change creates an audit event without password material'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'app_private.security_audit_log', 'insert'),
  'authenticated users cannot forge audit rows'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app_private.security_audit_log', 'update'),
  'authenticated users cannot mutate audit rows'
);
select extensions.ok(
  not has_table_privilege('service_role', 'app_private.security_audit_log', 'delete'),
  'service role has no direct audit deletion privilege'
);

select extensions.is(
  (select public from storage.buckets where id = 'avatars'),
  false,
  'avatar bucket is private'
);
select extensions.is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  5242880::bigint,
  'avatar bucket enforces a five MiB limit'
);
select extensions.ok(
  (select allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
   from storage.buckets where id = 'avatars'),
  'avatar bucket MIME allowlist excludes executable and animated content'
);
select extensions.is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in (
       'avatars_select_own_authenticated',
       'avatars_insert_own_authenticated',
       'avatars_update_own_authenticated',
       'avatars_delete_own_authenticated'
     )),
  4,
  'avatar storage has explicit select, insert, update, and delete policies'
);

select * from extensions.finish();
rollback;
