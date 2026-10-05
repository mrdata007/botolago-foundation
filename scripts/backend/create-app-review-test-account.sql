-- Creates ONE ordinary test account for Apple's App Review on production
-- (BotolaGO Production V2, tkewgajrljbwgwedqsxn).
--
-- No second factor: the account is created with no row in auth.mfa_factors, and
-- the app only asks for a code when an account has a verified factor
-- (docs/backend/IDENTITY_AUTH_RUNBOOK.md, "MFA step-up for ordinary accounts").
-- It is an ordinary fan account: no staff role, no admin access.
--
-- THE OWNER RUNS THIS, in the Supabase SQL editor (CLAUDE.md, production writes).
-- Before running:
--   1. Replace PASTE_A_STRONG_PASSWORD_HERE below with a password you choose
--      (12+ characters). Never commit the real password.
--   2. Run it once with dry_run = true. It does everything, then stops with a
--      deliberate error that shows what it would have created; nothing is kept.
--   3. Change dry_run to false and run it again to create the account.
--   4. Put the e-mail and password in App Store Connect > App Review
--      Information > Sign-in required.
--
-- Safe to re-run: if the account already exists it stops and changes nothing.

do $$
declare
  dry_run constant boolean := true;                                   -- <- set false to create for real
  account_email constant text := 'apple-review@botolago.com';
  account_password constant text := 'PASTE_A_STRONG_PASSWORD_HERE';
  new_id uuid := gen_random_uuid();
  report text;
begin
  if account_password = 'PASTE_A_STRONG_PASSWORD_HERE' or char_length(account_password) < 12 then
    raise exception 'app_review_account_needs_a_real_password';
  end if;

  if current_setting('server_version_num')::int < 150000 then
    raise exception 'app_review_account_unexpected_database';
  end if;

  if exists (select 1 from auth.users where lower(email) = lower(account_email)) then
    raise exception 'app_review_account_already_exists';
  end if;

  -- The new-account trigger creates app.profiles and app.user_preferences.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    created_at, updated_at
  ) values (
    new_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    account_email, extensions.crypt(account_password, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Apple Review","preferred_language":"fr"}'::jsonb,
    '', '', '', '',
    now(), now()
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, created_at, updated_at, id
  ) values (
    new_id::text, new_id,
    jsonb_build_object('sub', new_id::text, 'email', account_email, 'email_verified', true),
    'email', now(), now(), gen_random_uuid()
  );

  -- Checks that run in the real path and the dry run alike.
  if exists (select 1 from auth.mfa_factors where user_id = new_id) then
    raise exception 'app_review_account_unexpected_second_factor';
  end if;
  if not exists (select 1 from app.profiles where id = new_id) then
    raise exception 'app_review_account_profile_not_created';
  end if;

  report := format('account %s | email %s | factors %s | profile %s',
    new_id, account_email,
    (select count(*) from auth.mfa_factors where user_id = new_id),
    (select count(*) from app.profiles where id = new_id));

  if dry_run then
    raise exception 'DRY RUN, nothing kept: %', report;
  end if;

  raise notice 'CREATED: %', report;
end;
$$;
