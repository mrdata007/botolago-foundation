begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'alice-rls@example.test', 'hash',
    '{}'::jsonb, '{"username":"alice_rls"}'::jsonb,
    statement_timestamp(), statement_timestamp()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bob-rls@example.test', 'hash',
    '{}'::jsonb, '{"username":"bob_rls"}'::jsonb,
    statement_timestamp(), statement_timestamp()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select extensions.is(
  (select count(*)::integer from app.profiles),
  1,
  'Alice can read only her canonical profile row'
);
select extensions.is(
  (select username from api.my_profile),
  'alice_rls',
  'Alice owner view returns only Alice profile'
);
select extensions.throws_ok(
  $$update app.profiles set display_name = 'Forged' where id = '22222222-2222-4222-8222-222222222222'$$,
  '42501',
  null,
  'Alice has no direct profile write privilege'
);
select extensions.throws_ok(
  $$insert into app.followed_teams (user_id, team_id)
    values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-2222-4222-8222-222222222222')$$,
  '42501',
  null,
  'Alice cannot forge a Bob-owned follow row'
);

select api.complete_onboarding(
  'Alice RLS',
  'alice_rls',
  null,
  'fr'::app.language_code,
  null,
  null,
  true,
  true,
  true
);
select api.follow_team('aaaaaaaa-1111-4111-8111-111111111111');
select api.request_account_deletion();

select extensions.is(
  (select count(*)::integer from api.my_followed_teams),
  1,
  'Alice can read her own follow through the API view'
);
select extensions.is(
  (select count(*)::integer from api.my_account_deletion_requests),
  1,
  'Alice can read her own deletion request'
);
select extensions.throws_ok(
  $$select * from app_private.security_audit_log$$,
  '42501',
  null,
  'Alice cannot read private audit records'
);

select extensions.lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'avatars',
      '11111111-1111-4111-8111-111111111111/avatar.png',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  'Alice may create only her deterministic avatar object path'
);
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'avatars',
      '22222222-2222-4222-8222-222222222222/avatar.png',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  '42501',
  null,
  'Alice cannot write into Bob avatar path'
);
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'avatars',
      '11111111-1111-4111-8111-111111111111/avatar.svg',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  '42501',
  null,
  'Alice cannot store executable SVG content by extension'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select extensions.is(
  (select count(*)::integer from api.my_followed_teams),
  0,
  'Bob cannot read Alice follow rows'
);
select extensions.is(
  (select count(*)::integer from api.my_account_deletion_requests),
  0,
  'Bob cannot read Alice deletion request'
);
select extensions.is(
  (select display_name from api.my_profile),
  '',
  'Alice onboarding RPC did not change Bob profile'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select extensions.ok(
  (select available from api.username_availability('anonymous_check')),
  'anonymous signup flow may check username availability'
);
select extensions.throws_ok(
  $$select * from api.my_profile$$,
  '42501',
  null,
  'anonymous users cannot read private profile views'
);
select extensions.throws_ok(
  $$select api.follow_team('aaaaaaaa-1111-4111-8111-111111111111')$$,
  '42501',
  null,
  'anonymous users cannot execute owner mutation RPCs'
);

reset role;

select extensions.is(
  (select count(*)::integer from app.followed_teams where user_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'Alice follow remains canonical after cross-user probes'
);
select extensions.is(
  (select count(*)::integer from app.followed_teams where user_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'no forged Bob follow was created'
);

select * from extensions.finish();
rollback;
