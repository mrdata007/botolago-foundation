-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260925180100_ordinary_account_mfa_step_up: an ordinary
-- account that turned MFA on must hold an aal2 session to change anything it
-- owns (audit 2026-09-25 A03 / DB-07). Refusal: SQLSTATE PT403, message
-- 'mfa_required'.
--
-- WHEN
--   Any time after the pull request that adds this file is merged, and not at
--   minute 12 of an hour (the Fantasy season orchestrator). It adds two
--   functions and 24 statement triggers, and replaces three functions:
--   api.request_account_deletion, api.cancel_account_deletion and
--   api.unsubscribe_notification_email. No job needs pausing.
--
--   Adding a trigger holds writes to its table until the transaction ends,
--   so the script takes all 24 tables together first. The site keeps reading
--   while it runs. A Fantasy, Pronostics or notification tick that writes
--   during its second or so waits for it. If a write is already under way,
--   the script stops within 5 seconds and saves nothing: run it again a
--   minute later.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, on a database missing a table it guards, where
--     the step-up already exists, or where a function it replaces is not the
--     version production held on 2026-09-25 (md5 read there);
--   * takes the 24 tables it adds triggers to (see WHEN);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without writing anything: both functions exist and
--     no API role can call them; all 24 triggers exist, fire per statement
--     and are enabled; the replaced functions carry the step-up and keep
--     their grants; an account with no factor passes; and, where an account
--     has a verified factor, its aal1 session is refused both by the helper
--     and by a table trigger (an UPDATE that matches no row), while aal2
--     passes. That account's id stays inside the script and is not printed.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  object_name text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260925180100') then
    raise exception 'stop: migration 20260925180100 is already recorded as applied';
  end if;
  if to_regprocedure('app_private.assert_mfa_step_up()') is not null
    or to_regprocedure('app_private.refuse_unverified_mfa_actor()') is not null
    or exists (select 1 from pg_catalog.pg_trigger t
      where t.tgname like '%\_refuse\_unverified\_mfa\_actor' and not t.tgisinternal) then
    raise exception 'stop: the MFA step-up already exists, but the migration is not recorded -- find out why before going on';
  end if;

  foreach object_name in array array[
    'app.profiles', 'app.user_preferences', 'app.followed_teams', 'app.followed_competitions',
    'app.account_deletion_requests', 'app.saved_articles', 'app.notifications',
    'app.notification_subscriptions', 'app.device_registrations', 'app_private.push_destinations',
    'app.fantasy_teams', 'app.fantasy_squad_memberships', 'app.fantasy_lineups',
    'app.fantasy_lineup_players', 'app.fantasy_transfer_batches', 'app.fantasy_transfers',
    'app.fantasy_chip_uses', 'app.fantasy_free_hit_snapshots', 'app.fantasy_free_hit_snapshot_players',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.predictions',
    'app.prediction_league_members', 'app_private.prediction_guest_claims',
    'app_private.notification_email_unsubscribe_tokens', 'app.notification_deliveries',
    'auth.mfa_factors', 'auth.mfa_factors_user_id_idx'
  ] loop
    if to_regclass(object_name) is null then
      missing := missing || object_name;
    end if;
  end loop;
  if to_regprocedure('app_private.assert_security_rate_limit(uuid,app_private.security_audit_event,integer,interval)') is null
    or to_regprocedure('app_private.write_notification_audit(text,uuid,uuid,uuid,uuid,jsonb)') is null then
    missing := missing || 'app_private.assert_security_rate_limit / write_notification_audit'::text;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'stop: the database is missing what this update builds on: %', missing;
  end if;

  -- The three functions it replaces, as production held them on 2026-09-25.
  if md5(pg_get_functiondef('api.request_account_deletion()'::regprocedure))
    <> '1a1f5fedb7256c03c28305d0cd0ce76a' then
    raise exception 'stop: api.request_account_deletion is not the version this update replaces (20260720075453)';
  end if;
  if md5(pg_get_functiondef('api.cancel_account_deletion()'::regprocedure))
    <> 'b118e6b4b14e793b18532b2abdbc71be' then
    raise exception 'stop: api.cancel_account_deletion is not the version this update replaces (20260720075453)';
  end if;
  if md5(pg_get_functiondef('api.unsubscribe_notification_email(text)'::regprocedure))
    <> '9c655d051942d266429196779a06b160' then
    raise exception 'stop: api.unsubscribe_notification_email is not the version this update replaces (20260924140100)';
  end if;
end
$preflight$;

-- Every table that gets a trigger, together and in one order, before any
-- change. Reads go on; a write already under way makes this stop within
-- lock_timeout (5 s), and a write that starts now waits until the end.
lock table
  app.profiles, app.user_preferences, app.followed_teams, app.followed_competitions,
  app.account_deletion_requests, app.saved_articles, app.notifications,
  app.notification_subscriptions, app.device_registrations, app_private.push_destinations,
  app.fantasy_teams, app.fantasy_squad_memberships, app.fantasy_lineups,
  app.fantasy_lineup_players, app.fantasy_transfer_batches, app.fantasy_transfers,
  app.fantasy_chip_uses, app.fantasy_free_hit_snapshots, app.fantasy_free_hit_snapshot_players,
  app.fantasy_leagues, app.fantasy_league_memberships, app.predictions,
  app.prediction_league_members, app_private.prediction_guest_claims
  in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- Migration 20260925180100, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925180100',
  'ordinary_account_mfa_step_up',
  array[$bg_20260925180100_file$-- BotolaGO Production V2
-- An ordinary account that turned MFA on must complete it before it changes
-- anything (audit 2026-09-25 A03 / DB-07, P2).
--
-- Background. Supabase Auth issues an aal1 session once the password is right
-- and raises it to aal2 only after the enrolled factor is verified. The web
-- app shows the MFA challenge as a page, and nothing on the server asked for
-- aal2 afterwards: api.request_account_deletion() (20260720075453) checks
-- auth.uid() and a rate limit, api.create_fantasy_team() (20260924200000)
-- writes under auth.uid() alone, and so does every other ordinary account
-- RPC. Someone holding only the password of an account that had turned MFA on
-- could leave the challenge page and act as the account. Staff were never
-- exposed: app_private.admin_assert_principal() and has_editorial_role()
-- (20260919150000) already require a verified factor and aal2. This migration
-- does not touch them.
--
-- The rule, which is the contract the web app codes against: an actor
-- (auth.uid() is not null) with at least one VERIFIED factor in
-- auth.mfa_factors, whose JWT aal is not 'aal2', is refused with
--
--   SQLSTATE PT403, message 'mfa_required'   (PostgREST: HTTP 403)
--
-- Everyone else passes: accounts with no factor or only an unverified
-- (abandoned) enrolment, aal2 sessions, and work with no actor at all -- the
-- service role, pg_cron, and Supabase Auth's own connection, which runs the
-- signup trigger (handle_new_auth_user -> ensure_identity) with no JWT. A
-- brand-new account cannot have a factor yet in any case. The admin RPCs also
-- use 'mfa_required', but for a staff principal with no factor at all; an
-- enrolled staff member at aal1 gets 'mfa_assurance_insufficient' from them.
-- So from an ordinary write, 'mfa_required' always means "complete the
-- challenge".
--
-- How:
--   1. app_private.assert_mfa_step_up() states the rule once. No actor and
--      aal2 return before any lookup. Only an aal1 actor costs one probe of
--      auth.mfa_factors by user_id (mfa_factors_user_id_idx, present locally
--      and on production).
--   2. app_private.refuse_unverified_mfa_actor() runs it from BEFORE INSERT
--      OR UPDATE OR DELETE triggers on every table an ordinary api.* function
--      writes for the caller's own account. The rule then holds whichever RPC
--      does the write, including RPCs written later. The triggers fire FOR
--      EACH STATEMENT, not per row like refuse_banned_actor(). This rule
--      depends only on who acts, never on the row. A row trigger would cost
--      the service's bulk writes about 7 us a row (1.1 s per 150,000 rows,
--      measured locally), only to learn each time that there is no actor.
--      A statement that matches no row is refused too; it is still the
--      actor's write.
--   3. api.request_account_deletion() and api.cancel_account_deletion() call
--      the helper first, before the rate limit answers and before
--      request_account_deletion hands back an existing request without a
--      write the table trigger would see. So they refuse the same way every
--      time, before any side effect.
--   4. api.unsubscribe_notification_email() is authorised by the emailed
--      token, not by the session. The token may name another account than
--      the one signed in, and the function only ever turns e-mail off. It
--      works signed out, so it must not be harder signed in. It marks its one
--      app.user_preferences write with a transaction-local setting, which the
--      trigger honours for that table only, and clears the setting right
--      after the write.
--
-- Guarded tables (their writers in parentheses):
--   identity       app.profiles, app.user_preferences (complete_onboarding,
--                  update_my_preferences, update_my_notification_preferences),
--                  app.followed_teams, app.followed_competitions
--                  (follow_* / unfollow_*), app.account_deletion_requests
--   news           app.saved_articles (save_article, unsave_article)
--   notifications  app.notifications (mark_*_read, dismiss_my_notification),
--                  app.notification_subscriptions
--                  (set_my_notification_subscription), app.device_registrations
--                  and app_private.push_destinations
--                  (register/unregister/disable_my_notification_device)
--   Fantasy        teams, squad memberships, lineups, lineup players, transfer
--                  batches, transfers, chip uses, free-hit snapshots and their
--                  players, leagues, league memberships (create_fantasy_team,
--                  save_fantasy_lineup, confirm_fantasy_transfers,
--                  activate/cancel_fantasy_chip, create/join/leave/archive
--                  league, create_prediction_league,
--                  reset_prediction_league_invite_code)
--   Pronostics     app.predictions, app.prediction_league_members,
--                  app_private.prediction_guest_claims (save_predictions,
--                  claim_guest_predictions, join/leave_prediction_league)
--
-- Not guarded, and why:
--   - app_private.security_audit_log. It holds sign-out's intent
--     (record_session_revocation) and the rate-limit counts. Sign-out must
--     work mid-login: someone who abandons the challenge must still be able
--     to sign out.
--   - app_private.fantasy_idempotency_keys and fantasy_mutation_audit:
--     bookkeeping written in the same transaction as a guarded table, so it
--     rolls back with the refusal.
--   - app.notification_deliveries and
--     app_private.notification_email_unsubscribe_tokens: service tables. The
--     unsubscribe link writes them under the token's authority (point 4).
--   - app_private.client_error_counts: anonymous telemetry
--     (report_client_errors).
--   - Staff and editorial tables. Their own checks are stricter and stay as
--     they are.
--   - auth.* and storage.objects belong to Supabase. The private avatars
--     bucket stays governed by its owner-only RLS policies.
-- Reads are not refused here. No api surface exports e-mail or identity
-- data. Keeping pages behind the challenge is the web app's job.
--
-- Deploy order: none. No api signature or JSON shape changes. Web code already
-- deployed shows an unrecognised PT403 as its generic "could not be
-- completed" error, and the write does not happen. The web change that sends
-- 'mfa_required' to the challenge can ship before or after this.

-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------

create function app_private.assert_mfa_step_up()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- No actor: the service role, pg_cron, Supabase Auth's signup trigger.
  -- aal2: the enrolled factor was verified in this session.
  if actor is null or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2' then
    return;
  end if;

  -- An unverified factor is an enrolment the person never finished. It
  -- protects nothing yet, so it asks for nothing.
  if exists (
    select 1
    from auth.mfa_factors factor
    where factor.user_id = actor and factor.status::text = 'verified'
  ) then
    raise exception using errcode = 'PT403', message = 'mfa_required';
  end if;
end;
$$;
revoke all on function app_private.assert_mfa_step_up()
  from public, anon, authenticated, service_role;
comment on function app_private.assert_mfa_step_up() is
  'Refuses (PT403 mfa_required) an actor who has a verified MFA factor but whose '
  'session is not aal2. No actor (service, cron, signup), aal2, and accounts '
  'without a verified factor pass. Audit 2026-09-25 A03 / DB-07.';

create function app_private.refuse_unverified_mfa_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The one write the step-up does not govern: the e-mail unsubscribe link
  -- turning e-mail off under the token's authority
  -- (api.unsubscribe_notification_email). Honoured for app.user_preferences
  -- only, so the mark cannot waive a write to any other table.
  if tg_table_schema = 'app' and tg_table_name = 'user_preferences'
    and current_setting('app.mfa_step_up_waiver', true) = 'email_unsubscribe_token'
  then
    return null;
  end if;

  perform app_private.assert_mfa_step_up();
  return null;
end;
$$;
revoke all on function app_private.refuse_unverified_mfa_actor()
  from public, anon, authenticated, service_role;
comment on function app_private.refuse_unverified_mfa_actor() is
  'Statement trigger on every table ordinary api.* functions write for the '
  'caller''s own account: runs app_private.assert_mfa_step_up(). '
  'app.user_preferences honours app.mfa_step_up_waiver = email_unsubscribe_token, '
  'set only by api.unsubscribe_notification_email around its one write.';

-- ---------------------------------------------------------------------------
-- The tables
-- ---------------------------------------------------------------------------

-- Identity
create trigger profiles_refuse_unverified_mfa_actor
before insert or update or delete on app.profiles
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger user_preferences_refuse_unverified_mfa_actor
before insert or update or delete on app.user_preferences
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger followed_teams_refuse_unverified_mfa_actor
before insert or update or delete on app.followed_teams
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger followed_competitions_refuse_unverified_mfa_actor
before insert or update or delete on app.followed_competitions
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger account_deletion_requests_refuse_unverified_mfa_actor
before insert or update or delete on app.account_deletion_requests
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- News
create trigger saved_articles_refuse_unverified_mfa_actor
before insert or update or delete on app.saved_articles
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- Notifications
create trigger notifications_refuse_unverified_mfa_actor
before insert or update or delete on app.notifications
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger notification_subscriptions_refuse_unverified_mfa_actor
before insert or update or delete on app.notification_subscriptions
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger device_registrations_refuse_unverified_mfa_actor
before insert or update or delete on app.device_registrations
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger push_destinations_refuse_unverified_mfa_actor
before insert or update or delete on app_private.push_destinations
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- Fantasy
create trigger fantasy_teams_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_teams
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_squad_memberships_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_squad_memberships
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_lineups_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_lineups
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_lineup_players_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_lineup_players
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_transfer_batches_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_transfer_batches
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_transfers_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_transfers
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_chip_uses_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_chip_uses
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_free_hit_snapshots_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_free_hit_snapshots
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_free_hit_snapshot_players_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_free_hit_snapshot_players
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_leagues_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_leagues
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_league_memberships_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_league_memberships
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- Pronostics
create trigger predictions_refuse_unverified_mfa_actor
before insert or update or delete on app.predictions
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger prediction_league_members_refuse_unverified_mfa_actor
before insert or update or delete on app.prediction_league_members
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger prediction_guest_claims_refuse_unverified_mfa_actor
before insert or update or delete on app_private.prediction_guest_claims
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- ---------------------------------------------------------------------------
-- Account deletion: refused up front
-- ---------------------------------------------------------------------------

-- Bodies as in 20260720075453 (the md5 of both matched production on
-- 2026-09-25), plus the step-up before anything else is decided.
create or replace function api.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;

  -- Before the rate limit, which would otherwise answer rate_limited, and
  -- before an existing request is handed back with no write for the table
  -- trigger to see.
  perform app_private.assert_mfa_step_up();

  perform app_private.assert_security_rate_limit(
    current_user_id,
    'account_deletion_requested',
    3,
    interval '24 hours'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':account-deletion', 0)
  );

  select id into request_id
  from app.account_deletion_requests
  where user_id = current_user_id and status in ('requested', 'processing')
  order by requested_at desc
  limit 1;

  if request_id is not null then
    return request_id;
  end if;

  insert into app.account_deletion_requests (user_id)
  values (current_user_id)
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function api.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;

  perform app_private.assert_mfa_step_up();

  update app.account_deletion_requests
  set status = 'cancelled'
  where user_id = current_user_id and status = 'requested';

  return true;
end;
$$;

revoke all on function api.request_account_deletion()
  from public, anon, authenticated, service_role;
revoke all on function api.cancel_account_deletion()
  from public, anon, authenticated, service_role;
grant execute on function api.request_account_deletion(), api.cancel_account_deletion()
  to authenticated;

comment on function api.request_account_deletion() is
  'Files (or returns) the caller''s pending account deletion request. An account '
  'with a verified MFA factor needs an aal2 session: PT403 mfa_required otherwise.';
comment on function api.cancel_account_deletion() is
  'Cancels the caller''s requested account deletion. An account with a verified '
  'MFA factor needs an aal2 session: PT403 mfa_required otherwise.';

-- ---------------------------------------------------------------------------
-- The e-mail unsubscribe link: the token authorises it, not the session
-- ---------------------------------------------------------------------------

-- Body as in 20260924140100 (md5 matched production on 2026-09-25). The only
-- change is the mark around the app.user_preferences update. The page opened
-- from an e-mail calls this with whatever session the browser holds, which
-- may be an enrolled account at aal1, or not the token's account at all.
create or replace function api.unsubscribe_notification_email(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target app_private.notification_email_unsubscribe_tokens%rowtype;
  currently_enabled boolean;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into target
  from app_private.notification_email_unsubscribe_tokens token
  where token.token_hash = extensions.digest(p_token, 'sha256')
    and token.expires_at > statement_timestamp();
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select preference.email_notifications_enabled into currently_enabled
  from app.user_preferences preference
  where preference.user_id = target.user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  update app_private.notification_email_unsubscribe_tokens
  set used_at = coalesce(used_at, statement_timestamp())
  where token_hash = target.token_hash;

  if not currently_enabled then
    return jsonb_build_object('status', 'already_unsubscribed');
  end if;

  -- The token, not the session, authorises this one write, and it only turns
  -- e-mail off. The mark exempts it from the MFA step-up
  -- (app_private.refuse_unverified_mfa_actor) and is cleared straight after.
  perform pg_catalog.set_config('app.mfa_step_up_waiver', 'email_unsubscribe_token', true);
  update app.user_preferences set email_notifications_enabled = false
  where user_id = target.user_id;
  perform pg_catalog.set_config('app.mfa_step_up_waiver', '', true);

  update app.notification_deliveries delivery set
    status = 'cancelled', stable_error_code = 'email_unsubscribed', next_retry_at = null,
    claimed_at = null, claim_expires_at = null
  from app.notifications notification
  where delivery.notification_id = notification.id
    and notification.user_id = target.user_id
    and delivery.channel = 'email'
    and (delivery.status in ('pending', 'retry_scheduled')
      or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()));
  perform app_private.write_notification_audit(
    'notification_email_unsubscribed', target.user_id,
    p_metadata := jsonb_build_object('source', 'email_link')
  );
  return jsonb_build_object('status', 'unsubscribed');
end;
$$;

revoke all on function api.unsubscribe_notification_email(text)
  from public, anon, authenticated, service_role;
-- As in 20260924140100: the page opened from an email calls it signed out
-- (anon) or signed in (authenticated); the one-click endpoint mail providers
-- POST to (Edge Function notification-email-unsubscribe) calls it with the
-- service role.
grant execute on function api.unsubscribe_notification_email(text)
  to anon, authenticated, service_role;
$bg_20260925180100_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260925180100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925180100'
  );
begin
  if encode(sha256(convert_to(part_20260925180100, 'UTF8')), 'hex')
    is distinct from 'a228ee97e1dfc01255d92a0d74cec27329a2581b2beea8433ffdd8997be82f6e' then
    raise exception 'stop: 20260925180100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260925180100;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  api_role text;
  signature text;
  enrolled uuid;
  refused_by_helper boolean;
  refused_by_table boolean;
begin
  foreach signature in array array[
    'app_private.assert_mfa_step_up()', 'app_private.refuse_unverified_mfa_actor()'
  ] loop
    if to_regprocedure(signature) is null then
      problems := problems || ('missing ' || signature);
    else
      foreach api_role in array array['anon', 'authenticated', 'service_role'] loop
        if has_function_privilege(api_role, signature, 'execute') then
          problems := problems || (api_role || ' can run ' || signature);
        end if;
      end loop;
    end if;
  end loop;

  -- tgtype 30 = BEFORE | INSERT | DELETE | UPDATE, per statement.
  if (
    select count(*) from pg_catalog.pg_trigger t
    where t.tgfoid = to_regprocedure('app_private.refuse_unverified_mfa_actor()')
      and t.tgtype = 30 and t.tgenabled = 'O'
  ) <> 24 or (
    select count(*) from pg_catalog.pg_trigger t
    where t.tgname like '%\_refuse\_unverified\_mfa\_actor' and not t.tgisinternal
  ) <> 24 then
    problems := problems || 'expected 24 enabled per-statement step-up triggers'::text;
  end if;

  if pg_get_functiondef('api.request_account_deletion()'::regprocedure) not like '%app_private.assert_mfa_step_up()%'
    or pg_get_functiondef('api.cancel_account_deletion()'::regprocedure) not like '%app_private.assert_mfa_step_up()%'
    or pg_get_functiondef('api.unsubscribe_notification_email(text)'::regprocedure)
      not like '%app.mfa_step_up_waiver%' then
    problems := problems || 'a replaced function is not the new version'::text;
  end if;
  if not has_function_privilege('authenticated', 'api.request_account_deletion()', 'execute')
    or not has_function_privilege('authenticated', 'api.cancel_account_deletion()', 'execute')
    or has_function_privilege('anon', 'api.request_account_deletion()', 'execute')
    or has_function_privilege('anon', 'api.cancel_account_deletion()', 'execute')
    or not has_function_privilege('anon', 'api.unsubscribe_notification_email(text)', 'execute')
    or not has_function_privilege('authenticated', 'api.unsubscribe_notification_email(text)', 'execute')
    or not has_function_privilege('service_role', 'api.unsubscribe_notification_email(text)', 'execute') then
    problems := problems || 'the replaced functions lost or gained a grant'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925180100') then
    problems := problems || 'history row missing'::text;
  end if;

  -- Behaviour, without writing anything. An account with no factor passes.
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin
    perform app_private.assert_mfa_step_up();
  exception when others then
    problems := problems || ('an account with no factor was refused: ' || sqlerrm);
  end;

  -- An enrolled account at aal1 is refused, by the helper and by a table
  -- trigger. The UPDATE matches no row, so even a miss writes nothing.
  select factor.user_id into enrolled
  from auth.mfa_factors factor
  where factor.status::text = 'verified'
  limit 1;
  if enrolled is null then
    raise notice 'no account has a verified factor yet: the refusal was not exercised here (pgTAP covers it)';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', enrolled, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    refused_by_helper := false;
    begin
      perform app_private.assert_mfa_step_up();
    exception when sqlstate 'PT403' then
      refused_by_helper := sqlerrm = 'mfa_required';
    end;
    refused_by_table := false;
    begin
      update app.profiles set display_name = display_name where false;
    exception when sqlstate 'PT403' then
      refused_by_table := sqlerrm = 'mfa_required';
    end;
    if not refused_by_helper or not refused_by_table then
      problems := problems || 'an enrolled account at aal1 was not refused with mfa_required'::text;
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', enrolled, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    begin
      perform app_private.assert_mfa_step_up();
      update app.profiles set display_name = display_name where false;
    exception when others then
      problems := problems || ('an enrolled account at aal2 was refused: ' || sqlerrm);
    end;
  end if;
  perform set_config('request.jwt.claims', '', true);

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260925180100')
    then 'Applied. Accounts that turned MFA on now need the code before any change.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
