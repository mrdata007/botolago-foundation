-- Account deletion, carried out automatically (owner decision 2026-10-06).
--
-- Until now "Supprimer mon compte" filed a row in app.account_deletion_requests
-- and nothing ever acted on it (20260720075453 planned "a privileged, separately
-- reviewed deletion worker" after a 30-day hold). The App Store (guideline
-- 5.1.1(v)) and Google Play require that deleting an account from inside the
-- app actually deletes it, and that any delay is stated and honoured. This is
-- that worker, and the change to what asking does.
--
-- WHAT ASKING DOES NOW (api.request_account_deletion, same name and answer)
--
--   At once, in the same transaction as the request:
--     * the account cannot sign in again: Supabase Auth's own ban
--       (auth.users.banned_until, the column the Auth admin API's ban sets),
--       and every session and refresh token of the account is deleted, so the
--       other devices are signed out at their next refresh;
--     * it disappears from what other people see: the profile is marked
--       deleted (every public board, league table and prize list already
--       hides a deleted profile's name, 20260921180000 onwards), each Fantasy
--       team gets a neutral pseudonym ("Manager 3F9A1C") in place of its name
--       (on the boards and on prize records), and published gameweek recaps
--       are withdrawn;
--     * its phones are forgotten (app.device_registrations), so no push is
--       sent to a closed account; e-mail already skips a deleted profile.
--   The request carries `erase_after` = the request time + 7 days.
--
--   There is no cancelling. The account is signed out and cannot sign in, so
--   the in-app cancel the 20260720075453 design offered could not be reached;
--   api.cancel_account_deletion stays (same signature, same step-up) and now
--   answers `account_deletion_not_cancellable`. The runbook's 30-day hold
--   existed for that cancel; without it a shorter hold is better for the
--   person, so it is 7 days: long enough for the worker to retry through an
--   outage, short enough to state plainly.
--
--   Staff accounts are refused (`account_deletion_staff_account`): their
--   app_private.staff_principals row is kept for the staff audit trail and
--   restricts the Auth user, so they are closed by the owner by hand.
--
-- WHAT THE WORKER ERASES (after erase_after)
--
--   pg_cron `account-deletion-tick` (hourly, minute 23) calls
--   app_private.account_deletion_tick(), which wakes the Edge Function
--   `account-deletion-worker` through pg_net when a request is due, the same
--   way the e-mail and push dispatchers are woken (scheduler token). The
--   function, for each request it claims (api.service_claim_account_deletions):
--     1. removes the avatar files through the Storage API (a SQL delete of
--        storage.objects is refused by Storage, and would orphan the file);
--     2. calls api.service_erase_account, one transaction, which
--          - keeps a PAID prize record (the Terms and the privacy policy keep
--            prize evidence 5 years for accounting) but detaches it: no user,
--            no team, a pseudonym; an unpaid prize is forfeited (Terms: deleting
--            the account loses unclaimed prizes) and its verification notes
--            are cleared;
--          - hands each league the account owns to its longest-standing other
--            member, or deletes it when nobody else is in it (or archives it
--            under a neutral name, ownerless, when a prize record names it);
--          - deletes every Fantasy row of the account (teams, squads, lineups,
--            transfers, chips, results, rankings, recaps, prize skips, the
--            Fantasy request journal and idempotency keys);
--          - removes the account from the testers lists of the e-mail, push
--            and Pronostics switches;
--          - deletes the Auth user, which cascades to the profile and every
--            other per-account table (preferences, follows, notifications,
--            predictions, match votes, saved articles, Pépites follows, the
--            request itself, bans, MFA factors, identities, sessions);
--          - writes one row to app_private.account_deletion_log with dates
--            and counts only: no user id, no address, no name;
--     3. sends a confirmation e-mail (Resend, as the other mail) to the
--        address it was handed at the claim, and records only whether it went.
--
--   Kept after erasure, by design: app_private.security_audit_log rows (an
--   account id and event names, no content; 365 days, now actually pruned by
--   the daily job below), paid prize records as above, the deletion log, and
--   staff-side records that never held the account's data.
--
-- SWITCH: OFF, as every other job here. app_private.account_deletion_settings
-- .enabled is false until the owner runs
-- app_private.account_deletion_configure(true) (docs/backend/
-- ACCOUNT_DELETION_RUNBOOK.md). While it is off, asking still disables the
-- account at once; only the erasure waits, and the ops health check
-- `account_deletion` warns, then fails a day after a request falls due.
--
-- Writes: app.account_deletion_requests (new columns), app.fantasy_prize_winners
-- and app.fantasy_leagues (nullable columns for detached rows), two new
-- app_private tables, two cron jobs. No row of an existing table changes,
-- except a pending deletion request already filed, which is given its date and
-- disabled like a new one.

-- ---------------------------------------------------------------------------
-- The request: when it falls due, and the worker's lease
-- ---------------------------------------------------------------------------
alter table app.account_deletion_requests
  add column erase_after timestamptz,
  add column claimed_at timestamptz,
  add column attempts integer not null default 0,
  add column last_error text,
  add constraint account_deletion_requests_erase_after_check check (
    erase_after is null or erase_after >= requested_at
  ),
  add constraint account_deletion_requests_attempts_check check (attempts between 0 and 100000),
  add constraint account_deletion_requests_last_error_check check (
    last_error is null or last_error ~ '^[a-z0-9_]{1,80}$'
  );

create index account_deletion_requests_due_idx
  on app.account_deletion_requests (erase_after, id)
  where status in ('requested', 'processing');

comment on column app.account_deletion_requests.erase_after is
  'When the account is erased: the request time + 7 days (20261006143700). The account is disabled at the request.';
comment on column app.account_deletion_requests.last_error is
  'Last worker failure, as a short code. Never a message or a value.';

-- ---------------------------------------------------------------------------
-- Detached records: a paid prize kept for accounting, a league nobody owns
-- ---------------------------------------------------------------------------
alter table app.fantasy_prize_winners
  alter column user_id drop not null,
  alter column fantasy_team_id drop not null,
  add column account_erased_at timestamptz,
  add constraint fantasy_prize_winners_erased_check check (
    (account_erased_at is null and user_id is not null and fantasy_team_id is not null)
    or (account_erased_at is not null and user_id is null and fantasy_team_id is null)
  );
comment on column app.fantasy_prize_winners.account_erased_at is
  'Set when the winning account was erased: user and team are gone, the row keeps the prize facts (a paid prize, for accounting) under a pseudonym.';

alter table app.fantasy_leagues
  alter column owner_user_id drop not null,
  add constraint fantasy_leagues_owner_check check (owner_user_id is not null or not active);
comment on column app.fantasy_leagues.owner_user_id is
  'The owner. Null only for an archived league whose owner was erased and that a prize record still names.';

-- ---------------------------------------------------------------------------
-- Switch, heartbeat and the erasure log
-- ---------------------------------------------------------------------------
create table app_private.account_deletion_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  functions_base_url text,
  max_per_run integer not null default 5,
  last_tick_at timestamptz,
  last_outcome text,
  last_due integer,
  updated_at timestamptz not null default statement_timestamp(),
  constraint account_deletion_settings_singleton check (id),
  constraint account_deletion_settings_url_check check (
    functions_base_url is null
    or functions_base_url ~ '^https?://[A-Za-z0-9._:-]+/functions/v1$'
  ),
  constraint account_deletion_settings_batch_check check (max_per_run between 1 and 50),
  constraint account_deletion_settings_outcome_check check (
    last_outcome is null or last_outcome in ('idle', 'invoked', 'not_configured')
  )
);
insert into app_private.account_deletion_settings (id) values (true) on conflict do nothing;
alter table app_private.account_deletion_settings enable row level security;
alter table app_private.account_deletion_settings force row level security;
revoke all on app_private.account_deletion_settings from public, anon, authenticated, service_role;
comment on table app_private.account_deletion_settings is
  'The account-erasure worker''s switch (off by default) and the tick''s last run. Changed only by app_private.account_deletion_configure.';

create table app_private.account_deletion_log (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  requested_at timestamptz not null,
  erase_after timestamptz not null,
  erased_at timestamptz not null default statement_timestamp(),
  attempts integer not null,
  avatar_objects_removed integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  confirmation_email text,
  constraint account_deletion_log_request_key unique (request_id),
  constraint account_deletion_log_summary_check check (
    jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 2048
  ),
  constraint account_deletion_log_email_check check (
    confirmation_email is null
    or confirmation_email in ('sent', 'no_address', 'not_configured', 'failed')
  )
);
alter table app_private.account_deletion_log enable row level security;
alter table app_private.account_deletion_log force row level security;
revoke all on app_private.account_deletion_log from public, anon, authenticated, service_role;
comment on table app_private.account_deletion_log is
  'One row per erased account: dates and counts only. No user id, address or name: the account it describes no longer exists.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.account_deletion_hold()
returns interval
language sql
immutable
set search_path = ''
as $$
  -- The hold the app and /suppression-compte state ("sous 7 jours"). Change
  -- them together, in a reviewed migration.
  select interval '7 days';
$$;

create or replace function app_private.account_deletion_pseudonym()
returns text
language sql
volatile
set search_path = ''
as $$
  -- Fits the Fantasy team name rule; the same in French and Arabic.
  select 'Manager ' || upper(encode(extensions.gen_random_bytes(3), 'hex'));
$$;

-- Everything that happens at the request, idempotent: the worker runs it again
-- before erasing, and this migration runs it for a request filed before it.
create or replace function app_private.account_deletion_disable(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  team record;
  pseudonym text;
begin
  if p_user_id is null then
    return;
  end if;

  update app.profiles
  set deleted_at = coalesce(deleted_at, statement_timestamp())
  where id = p_user_id and deleted_at is null;

  for team in
    select id from app.fantasy_teams
    where user_id = p_user_id and name !~ '^Manager [0-9A-F]{6}$'
    for update
  loop
    pseudonym := app_private.account_deletion_pseudonym();
    update app.fantasy_teams set name = pseudonym where id = team.id;
    update app.fantasy_prize_winners set team_name = pseudonym where fantasy_team_id = team.id;
  end loop;

  update app.fantasy_public_recaps
  set status = 'revoked', revoked_at = statement_timestamp(), alias = null,
    updated_at = statement_timestamp()
  where user_id = p_user_id and status = 'published';

  delete from app.device_registrations where user_id = p_user_id;

  -- Supabase Auth: no new sign-in, no token refresh. The admin API's ban
  -- writes this same column; a century is how it spells "until lifted".
  update auth.users
  set banned_until = statement_timestamp() + interval '100 years'
  where id = p_user_id
    and (banned_until is null or banned_until < statement_timestamp() + interval '50 years');
  delete from auth.sessions where user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Asking (the app's "Supprimer mon compte")
-- ---------------------------------------------------------------------------

-- As in 20260926003100 (step-up first, rate limit, lock, idempotent), plus the
-- staff refusal, the date, and the disabling above.
create or replace function api.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_id uuid;
  saved_sub text;
  saved_claims text;
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

  if exists (
    select 1 from app_private.staff_principals principal
    where principal.auth_user_id = current_user_id
  ) then
    raise exception using errcode = 'PT403', message = 'account_deletion_staff_account';
  end if;

  insert into app.account_deletion_requests (user_id, erase_after)
  values (current_user_id, statement_timestamp() + app_private.account_deletion_hold())
  returning id into request_id;

  -- The request is in, and audited under this session. The rest is done on
  -- the account, not by it: a banned account may still ask for deletion
  -- (20260924160000), and the ban triggers key on the actor. The caller's
  -- claims are put back afterwards, for whatever else shares the transaction.
  saved_sub := current_setting('request.jwt.claim.sub', true);
  saved_claims := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform app_private.account_deletion_disable(current_user_id);
  perform set_config('request.jwt.claim.sub', coalesce(saved_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(saved_claims, ''), true);

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

  -- A request disables the account at once (20261006143700): there is no
  -- session left to cancel from, and nothing is cancelled.
  raise exception using errcode = 'PT409', message = 'account_deletion_not_cancellable';
end;
$$;

-- As in 20260926003100, plus `deletionPending`: a device whose access token
-- has not expired yet (its refresh token is already gone) is signed out by the
-- app the next time it asks, rather than at the token's expiry.
create or replace function api.get_my_account_standing()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  is_banned boolean;
  banned_until timestamptz;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'unauthenticated';
  end if;

  select true, ban.ends_at
  into is_banned, banned_until
  from app_private.user_bans ban
  where ban.user_id = current_user_id
    and ban.lifted_at is null
    and ban.starts_at <= statement_timestamp()
    and (ban.ends_at is null or ban.ends_at > statement_timestamp())
  order by ban.starts_at desc, ban.id desc
  limit 1;

  return jsonb_build_object(
    'banned', coalesce(is_banned, false),
    'bannedUntil', banned_until,
    'deletionPending', exists (
      select 1 from app.account_deletion_requests request
      where request.user_id = current_user_id and request.status in ('requested', 'processing')
    )
  );
end;
$$;

comment on function api.request_account_deletion() is
  'Asks for the caller''s account to be deleted: signs it out everywhere, bans it in Auth, hides it from public boards and forgets its phones at once; the worker erases it 7 days later. Idempotent. Staff accounts are refused. An account with a verified MFA factor needs an aal2 session.';
comment on function api.cancel_account_deletion() is
  'Always refuses (account_deletion_not_cancellable) since 20261006143700: a request disables the account at once. An account with a verified MFA factor at aal1 gets mfa_required first.';

-- ---------------------------------------------------------------------------
-- Erasing
-- ---------------------------------------------------------------------------
create or replace function app_private.account_deletion_erase(
  p_request_id uuid,
  p_avatar_objects_removed integer default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request app.account_deletion_requests%rowtype;
  target uuid;
  team_ids uuid[];
  owned record;
  successor uuid;
  n integer;
  summary jsonb := '{}'::jsonb;
  leagues_transferred integer := 0;
  leagues_archived integer := 0;
  leagues_deleted integer := 0;
begin
  -- One writer at a time (AGENTS.md): the erasure deletes and updates rows the
  -- Fantasy lifecycle tick, Pronostics scoring, the Pépites tick and prize
  -- evaluation also write. Each of those holds its own transaction-scoped
  -- advisory lock while it writes, so take the same locks, without waiting:
  -- if one of them is running, refuse, and the worker releases the request
  -- for the next hourly run. Taking them all up front, in one fixed order,
  -- and never waiting, means the erasure cannot deadlock with them.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fantasy:lifecycle-tick', 0))
    or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:predictions-score', 0))
    or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('pepites_tick', 0))
    or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago.fantasy_prize_evaluation', 0))
  then
    raise exception using errcode = 'PT409', message = 'account_deletion_writer_busy';
  end if;

  select * into request from app.account_deletion_requests where id = p_request_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'account_deletion_not_found';
  end if;
  if request.status <> 'processing' then
    raise exception using errcode = 'PT409', message = 'account_deletion_not_claimed';
  end if;
  if request.erase_after is null or request.erase_after > statement_timestamp() then
    raise exception using errcode = 'PT409', message = 'account_deletion_not_due';
  end if;
  target := request.user_id;

  if exists (select 1 from app_private.staff_principals where auth_user_id = target) then
    raise exception using errcode = 'PT409', message = 'account_deletion_staff_account';
  end if;
  -- Files are removed through the Storage API first (the worker's step 1). A
  -- row left here means they were not, and the account must not go without.
  if exists (
    select 1 from storage.objects
    where bucket_id = 'avatars' and name like target::text || '/%'
  ) then
    raise exception using errcode = 'PT409', message = 'account_deletion_avatar_remaining';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target::text || ':account-deletion', 0)
  );
  perform app_private.account_deletion_disable(target);

  select coalesce(array_agg(team.id), '{}') into team_ids
  from app.fantasy_teams team where team.user_id = target;
  summary := summary || jsonb_build_object('fantasyTeams', cardinality(team_ids));

  -- Prize records. Paid: kept for accounting, detached. Not yet paid: lost
  -- with the account (Terms), so forfeited, and the verification notes go.
  select count(*) into n
  from app.fantasy_prize_winners
  where (user_id = target or fantasy_team_id = any(team_ids)) and status = 'paid';
  summary := summary || jsonb_build_object('paidPrizeRecordsKept', n);
  update app.fantasy_prize_winners winner set
    status = case when winner.status in ('pending', 'verified')
      then 'forfeited'::app.fantasy_prize_winner_status else winner.status end,
    forfeited_at = case when winner.status in ('pending', 'verified')
      then statement_timestamp() else winner.forfeited_at end,
    verification_notes = case when winner.status = 'paid' then winner.verification_notes end,
    user_id = null,
    fantasy_team_id = null,
    team_name = case when winner.team_name ~ '^Manager [0-9A-F]{6}$'
      then winner.team_name else app_private.account_deletion_pseudonym() end,
    account_erased_at = statement_timestamp()
  where winner.user_id = target or winner.fantasy_team_id = any(team_ids);
  get diagnostics n = row_count;
  summary := summary || jsonb_build_object('prizeRecordsDetached', n);
  update app.fantasy_prize_winners set runner_up_team_id = null
  where runner_up_team_id = any(team_ids);
  delete from app.fantasy_prize_skips
  where user_id = target or fantasy_team_id = any(team_ids);
  delete from app.fantasy_public_recaps
  where user_id = target or fantasy_team_id = any(team_ids);

  -- Leagues the account owns (Fantasy and Pronostics leagues are the same rows).
  for owned in
    select league.id from app.fantasy_leagues league
    where league.owner_user_id = target
    order by league.id
    for update
  loop
    successor := null;
    select member.user_id into successor
    from (
      select m.user_id, m.joined_at, case m.role when 'admin' then 0 else 1 end as precedence
      from app.fantasy_league_memberships m
      where m.league_id = owned.id and m.status = 'active' and m.user_id <> target
      union all
      select p.user_id, p.joined_at, 1
      from app.prediction_league_members p
      where p.league_id = owned.id and p.status = 'active' and p.user_id <> target
    ) member
    join app.profiles profile on profile.id = member.user_id and profile.deleted_at is null
    order by member.precedence, member.joined_at, member.user_id
    limit 1;

    if successor is not null then
      update app.fantasy_leagues set owner_user_id = successor where id = owned.id;
      update app.fantasy_league_memberships set role = 'owner'
      where league_id = owned.id and user_id = successor and status = 'active';
      update app.prediction_league_members set role = 'owner'
      where league_id = owned.id and user_id = successor and status = 'active';
      leagues_transferred := leagues_transferred + 1;
    elsif exists (select 1 from app.fantasy_prize_winners where league_id = owned.id)
      or exists (select 1 from app.fantasy_prize_skips where league_id = owned.id) then
      update app.fantasy_leagues
      set owner_user_id = null, active = false, name = 'Ligue archivée'
      where id = owned.id;
      leagues_archived := leagues_archived + 1;
    else
      delete from app.fantasy_rankings where league_id = owned.id;
      delete from app.fantasy_league_memberships where league_id = owned.id;
      delete from app.prediction_league_members where league_id = owned.id;
      delete from app.fantasy_leagues where id = owned.id;
      leagues_deleted := leagues_deleted + 1;
    end if;
  end loop;
  summary := summary || jsonb_build_object(
    'leaguesTransferred', leagues_transferred,
    'leaguesArchived', leagues_archived,
    'leaguesDeleted', leagues_deleted
  );

  -- Memberships in other people's leagues: leaving them counts down.
  update app.fantasy_leagues league
  set member_count = greatest(league.member_count - leaving.n, 0)
  from (
    select m.league_id, count(*)::integer as n
    from app.fantasy_league_memberships m
    where (m.user_id = target or m.fantasy_team_id = any(team_ids)) and m.status = 'active'
    group by m.league_id
  ) leaving
  where league.id = leaving.league_id;
  delete from app.fantasy_league_memberships
  where user_id = target or fantasy_team_id = any(team_ids);

  -- The teams and everything under them, children first.
  delete from app.fantasy_rankings where fantasy_team_id = any(team_ids);
  delete from app_private.fantasy_free_hit_lineup_snapshots
  where snapshot_id in (
      select s.id from app.fantasy_free_hit_snapshots s where s.fantasy_team_id = any(team_ids))
    or source_lineup_id in (
      select l.id from app.fantasy_lineups l where l.fantasy_team_id = any(team_ids));
  delete from app.fantasy_free_hit_snapshot_players
  where snapshot_id in (
    select s.id from app.fantasy_free_hit_snapshots s where s.fantasy_team_id = any(team_ids));
  delete from app.fantasy_free_hit_snapshots where fantasy_team_id = any(team_ids);
  delete from app.fantasy_chip_uses where fantasy_team_id = any(team_ids);
  delete from app.fantasy_auto_substitutions
  where lineup_id in (select l.id from app.fantasy_lineups l where l.fantasy_team_id = any(team_ids));
  delete from app.fantasy_lineup_players
  where lineup_id in (select l.id from app.fantasy_lineups l where l.fantasy_team_id = any(team_ids));
  delete from app.fantasy_lineups where fantasy_team_id = any(team_ids);
  delete from app.fantasy_transfers
  where transfer_batch_id in (
    select b.id from app.fantasy_transfer_batches b where b.fantasy_team_id = any(team_ids));
  delete from app.fantasy_transfer_batches where fantasy_team_id = any(team_ids);
  delete from app.fantasy_squad_memberships where fantasy_team_id = any(team_ids);
  delete from app_private.fantasy_free_transfer_rollovers where fantasy_team_id = any(team_ids);
  delete from app.fantasy_team_gameweek_results where fantasy_team_id = any(team_ids);
  delete from app_private.fantasy_mutation_audit
  where user_id = target or fantasy_team_id = any(team_ids);
  delete from app_private.fantasy_idempotency_keys where user_id = target;
  update app_private.fantasy_corrections set requested_by = null where requested_by = target;
  delete from app.fantasy_teams where id = any(team_ids);

  -- Testers lists name accounts by id.
  update app_private.notification_email_settings
  set test_user_ids = array_remove(test_user_ids, target)
  where target = any(test_user_ids);
  update app_private.notification_push_settings
  set test_user_ids = array_remove(test_user_ids, target)
  where target = any(test_user_ids);
  update app_private.prediction_settings
  set tester_user_ids = array_remove(tester_user_ids, target)
  where target = any(tester_user_ids);

  -- The account itself. Cascades to the profile and every per-account table.
  delete from auth.users where id = target;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception using errcode = 'PT409', message = 'account_deletion_auth_user_missing';
  end if;

  insert into app_private.account_deletion_log (
    request_id, requested_at, erase_after, attempts, avatar_objects_removed, summary
  ) values (
    request.id, request.requested_at, request.erase_after, request.attempts,
    greatest(coalesce(p_avatar_objects_removed, 0), 0), summary
  );

  return jsonb_build_object('requestId', request.id, 'erased', true) || summary;
end;
$$;

-- ---------------------------------------------------------------------------
-- The worker's calls (service role only)
-- ---------------------------------------------------------------------------
create or replace function api.service_claim_account_deletions(
  p_limit integer default 5,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.account_deletion_settings%rowtype;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'account_deletion_access_denied';
  end if;
  if p_limit is null or p_limit not between 1 and 50
    or p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise exception using errcode = 'PT400', message = 'account_deletion_invalid_claim';
  end if;
  select * into settings from app_private.account_deletion_settings where id;
  if not found or not settings.enabled then
    return '[]'::jsonb;
  end if;

  with due as (
    select request.id
    from app.account_deletion_requests request
    where request.erase_after <= statement_timestamp()
      and (
        request.status = 'requested'
        or (request.status = 'processing'
          and request.claimed_at < statement_timestamp() - make_interval(secs => p_lease_seconds))
      )
    order by request.erase_after, request.id
    limit least(p_limit, settings.max_per_run)
    for update skip locked
  ), claimed as (
    update app.account_deletion_requests request
    set status = 'processing', claimed_at = statement_timestamp(),
      attempts = request.attempts + 1
    from due
    where request.id = due.id
    returning request.id, request.user_id, request.requested_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'requestId', claimed.id,
      'userId', claimed.user_id,
      'requestedAt', claimed.requested_at,
      'email', case when auth_user.is_anonymous then null else auth_user.email end,
      'language', coalesce(profile.preferred_language::text, 'fr')
    ) order by claimed.requested_at, claimed.id), '[]'::jsonb)
  into result
  from claimed
  left join auth.users auth_user on auth_user.id = claimed.user_id
  left join app.profiles profile on profile.id = claimed.user_id;

  return result;
end;
$$;

create or replace function api.service_erase_account(
  p_request_id uuid,
  p_avatar_objects_removed integer default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'account_deletion_access_denied';
  end if;
  return app_private.account_deletion_erase(p_request_id, p_avatar_objects_removed);
end;
$$;

create or replace function api.service_release_account_deletion(
  p_request_id uuid,
  p_error text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'account_deletion_access_denied';
  end if;
  update app.account_deletion_requests
  set status = 'requested', claimed_at = null,
    last_error = case when p_error ~ '^[a-z0-9_]{1,80}$' then p_error else 'worker_failed' end
  where id = p_request_id and status = 'processing';
  return found;
end;
$$;

create or replace function api.service_record_account_deletion_email(
  p_request_id uuid,
  p_outcome text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'account_deletion_access_denied';
  end if;
  if p_outcome is null or p_outcome not in ('sent', 'no_address', 'not_configured', 'failed') then
    raise exception using errcode = 'PT400', message = 'account_deletion_invalid_outcome';
  end if;
  update app_private.account_deletion_log
  set confirmation_email = p_outcome
  where request_id = p_request_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- The winners wall says which rows are the reader's own (isMe), so the page's
-- "report this name" action is offered on other people's prizes only. It used
-- to compare team names, which are not unique and change between seasons.
-- Same function as 20260924120000 otherwise; its grants are kept.
-- ---------------------------------------------------------------------------
create or replace function api.fantasy_prize_winners(
  p_limit integer default 20,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  items jsonb;
  last_created timestamptz;
  last_id uuid;
  next_cursor jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50
    or ((p_after_created_at is null) <> (p_after_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  with page as materialized (
    select winner.* from app.fantasy_prize_winners winner
    where winner.status in ('verified', 'paid')
      and winner.tier in ('gameweek', 'monthly', 'season')
      and (p_after_created_at is null
        or (winner.created_at, winner.id) < (p_after_created_at, p_after_id))
    order by winner.created_at desc, winner.id desc
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'tier', page.tier,
      'seasonName', season.name,
      'blockNumber', page.block_number,
      'firstGameweekNumber', page.first_gameweek_number,
      'lastGameweekNumber', page.last_gameweek_number,
      'teamName', page.team_name,
      'maskedUsername', app_private.fantasy_mask_username(profile.username),
      'points', page.points,
      'tieBreak', page.tie_break,
      'prizeName', jsonb_build_object('fr', page.prize_name_fr, 'ar', coalesce(page.prize_name_ar, page.prize_name_fr)),
      'awardedAt', page.created_at,
      -- The reader's own prize, so the page offers no report on it. A boolean,
      -- never the account id; false for visitors and for erased accounts.
      'isMe', coalesce(page.user_id = (select auth.uid()), false)
    ) order by page.created_at desc, page.id desc), '[]'::jsonb),
    (array_agg(page.created_at order by page.created_at asc, page.id asc))[1],
    (array_agg(page.id order by page.created_at asc, page.id asc))[1]
  into items, last_created, last_id
  from page
  join app.fantasy_seasons season on season.id = page.fantasy_season_id
  left join app.profiles profile on profile.id = page.user_id and profile.deleted_at is null;

  if last_id is not null and exists (
    select 1 from app.fantasy_prize_winners winner
    where winner.status in ('verified', 'paid')
      and winner.tier in ('gameweek', 'monthly', 'season')
      and (winner.created_at, winner.id) < (last_created, last_id)
  ) then
    next_cursor := jsonb_build_object('createdAt', last_created, 'id', last_id);
  end if;

  return jsonb_build_object('items', items, 'nextCursor', next_cursor);
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner switch and the hourly tick
-- ---------------------------------------------------------------------------
create or replace function app_private.account_deletion_configure(
  p_enabled boolean,
  p_functions_base_url text default null,
  p_max_per_run integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare result app_private.account_deletion_settings%rowtype;
begin
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'account_deletion_enabled_required';
  end if;
  update app_private.account_deletion_settings set
    enabled = p_enabled,
    functions_base_url = coalesce(p_functions_base_url, functions_base_url),
    max_per_run = coalesce(p_max_per_run, max_per_run),
    updated_at = statement_timestamp()
  where id
  returning * into result;
  return jsonb_build_object(
    'enabled', result.enabled,
    'functionsBaseUrl', result.functions_base_url,
    'maxPerRun', result.max_per_run
  );
end;
$$;

create or replace function app_private.account_deletion_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.account_deletion_settings%rowtype;
  started timestamptz := statement_timestamp();
  due integer;
  outcome text;
  base_url text;
begin
  select * into settings from app_private.account_deletion_settings where id;
  -- Off: no write at all.
  if not found or not settings.enabled then
    return jsonb_build_object('outcome', 'off');
  end if;

  select count(*) into due
  from app.account_deletion_requests request
  where request.erase_after <= started
    and (request.status = 'requested'
      or (request.status = 'processing' and request.claimed_at < started - interval '15 minutes'));

  if due = 0 then
    outcome := 'idle';
  else
    base_url := coalesce(
      settings.functions_base_url,
      (select email.functions_base_url from app_private.notification_email_settings email where email.id)
    );
    if base_url is null or app_private.invoke_scheduled_function(
      base_url, 'account-deletion-worker', '{"job":"erase"}'::jsonb
    ) is null then
      outcome := 'not_configured';
    else
      outcome := 'invoked';
    end if;
  end if;

  update app_private.account_deletion_settings
  set last_tick_at = started, last_outcome = outcome, last_due = due
  where id;
  return jsonb_build_object('outcome', outcome, 'due', due);
end;
$$;

-- ---------------------------------------------------------------------------
-- Health: a stated deadline that is not being met pages the owner
-- ---------------------------------------------------------------------------
alter function app_private.ops_health_checks() rename to ops_health_checks_before_account_deletion;

create function app_private.ops_health_checks()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb := app_private.ops_health_checks_before_account_deletion();
  checks jsonb := coalesce(result -> 'checks', '[]'::jsonb);
  settings app_private.account_deletion_settings%rowtype;
  pending integer;
  overdue integer;
  oldest_due timestamptz;
  failing integer;
  check_status text;
  check_detail text;
begin
  select * into settings from app_private.account_deletion_settings where id;
  select count(*),
    count(*) filter (where request.erase_after < statement_timestamp() - interval '24 hours'),
    min(request.erase_after),
    count(*) filter (where request.last_error is not null)
  into pending, overdue, oldest_due, failing
  from app.account_deletion_requests request
  where request.status in ('requested', 'processing');

  if overdue > 0 then
    check_status := 'fail';
    check_detail := overdue || ' account deletion(s) more than a day past their date (oldest due '
      || to_char(oldest_due at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC)'
      || case when not coalesce(settings.enabled, false) then '; the erasure job is switched off'
        else '' end;
  elsif pending > 0 and not coalesce(settings.enabled, false) then
    check_status := 'warn';
    check_detail := pending || ' account deletion(s) waiting; the erasure job is switched off';
  elsif failing > 0 then
    check_status := 'warn';
    check_detail := failing || ' account deletion(s) failed their last attempt and will be retried';
  elsif coalesce(settings.enabled, false)
    and (settings.last_tick_at is null or settings.last_tick_at < statement_timestamp() - interval '3 hours') then
    check_status := 'warn';
    check_detail := 'erasure job switched on but has not run for 3 hours';
  else
    check_status := 'ok';
    check_detail := case when pending = 0 then 'no account deletion waiting'
      else pending || ' account deletion(s) waiting, none overdue' end;
  end if;

  checks := checks || jsonb_build_object('name', 'account_deletion', 'status', check_status,
    'detail', check_detail);
  return result || jsonb_build_object(
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks);
end;
$$;

-- ---------------------------------------------------------------------------
-- A request filed before this migration is dated and disabled like a new one
-- ---------------------------------------------------------------------------
update app.account_deletion_requests
set erase_after = greatest(requested_at, statement_timestamp()) + app_private.account_deletion_hold()
where status in ('requested', 'processing') and erase_after is null;

do $$
declare pending record;
begin
  for pending in
    select user_id from app.account_deletion_requests where status in ('requested', 'processing')
  loop
    perform app_private.account_deletion_disable(pending.user_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function
  app_private.account_deletion_hold(),
  app_private.account_deletion_pseudonym(),
  app_private.account_deletion_disable(uuid),
  app_private.account_deletion_erase(uuid, integer),
  app_private.account_deletion_configure(boolean, text, integer),
  app_private.account_deletion_tick(),
  app_private.ops_health_checks(),
  app_private.ops_health_checks_before_account_deletion()
from public, anon, authenticated, service_role;
grant execute on function
  app_private.account_deletion_hold(),
  app_private.account_deletion_pseudonym(),
  app_private.account_deletion_disable(uuid),
  app_private.account_deletion_erase(uuid, integer),
  app_private.account_deletion_configure(boolean, text, integer),
  app_private.account_deletion_tick(),
  app_private.ops_health_checks(),
  app_private.ops_health_checks_before_account_deletion()
to postgres;

revoke all on function
  api.service_claim_account_deletions(integer, integer),
  api.service_erase_account(uuid, integer),
  api.service_release_account_deletion(uuid, text),
  api.service_record_account_deletion_email(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function
  api.service_claim_account_deletions(integer, integer),
  api.service_erase_account(uuid, integer),
  api.service_release_account_deletion(uuid, text),
  api.service_record_account_deletion_email(uuid, text)
to service_role;

comment on function app_private.account_deletion_erase(uuid, integer) is
  'Erases a claimed, due account: detaches paid prize records, hands over or removes owned leagues, deletes the Fantasy rows and the Auth user (cascading to every per-account table), logs counts only.';
comment on function api.service_claim_account_deletions(integer, integer) is
  'account-deletion-worker: claims due deletion requests (nothing while the switch is off) and hands back the address to confirm to. Service role only.';
comment on function app_private.account_deletion_tick() is
  'Hourly (account-deletion-tick): wakes account-deletion-worker when a request is due. Returns at once, writing nothing, while the switch is off.';

-- ---------------------------------------------------------------------------
-- Jobs. cron.schedule with a name replaces a job of that name.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'account-deletion-tick',
  '23 * * * *',
  $$select app_private.account_deletion_tick()$$
);

-- Daily, whatever the switch: the tick's own run history after 7 days, and the
-- security audit log after the 365 days its table comment and the identity
-- runbook promise (no job pruned it before).
select cron.schedule(
  'account-deletion-history-prune',
  '37 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'account-deletion-tick')
      and end_time < now() - interval '7 days';
    delete from app_private.security_audit_log
    where occurred_at < now() - interval '365 days';
  $prune$
);
