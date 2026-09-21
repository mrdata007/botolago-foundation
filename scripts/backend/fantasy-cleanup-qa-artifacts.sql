-- BG-0023 — Archive the duplicate QA launch leagues, and (only on request)
-- run the account-deletion path for the three synthetic e2e accounts.
--
-- WHAT THIS IS
--   A single administrative maintenance transaction with TWO INDEPENDENT
--   halves, which the owner decides on separately:
--
--     HALF 1 (always runs)  Archive the duplicate "QA Launch Ligue" leagues by
--                           calling the product's OWN api.archive_fantasy_league
--                           RPC, which sets app.fantasy_leagues.active = false
--                           and writes an app_private.fantasy_mutation_audit
--                           row. This is REVERSIBLE: nothing is deleted, and
--                           flipping `active` back restores the league with its
--                           membership intact.
--
--     HALF 2 (off by default)  For the three `e2e.*@botolago.com` accounts, run
--                           the account-deletion path. This is IRREVERSIBLE.
--                           It does nothing at all unless the caller passes
--                           p_include_accounts => true.
--
-- WHY THE DEFAULT IS OFF
--   Running this file UNCHANGED archives two leagues and deletes NOTHING. The
--   account half requires editing the call at the bottom to pass
--   `p_include_accounts => true`, which is the `--include-accounts` flag this
--   file was asked for. An irreversible operation must not be reachable by
--   opening a file and pressing run.
--
-- WHAT "THE EXISTING ACCOUNT-DELETION PATH" IS — read this before using HALF 2
--   The repository has exactly one account-deletion path, and it is in two
--   pieces:
--
--     (a) api.request_account_deletion() — supabase/migrations/
--         20260720075453_identity_domain.sql. This is what the product calls
--         (src/backend/identity/supabase-repositories.ts `requestDeletion`).
--         It inserts an app.account_deletion_requests row and, through the
--         account_deletion_requests_audit_change trigger, writes a
--         'account_deletion_requested' row to app_private.security_audit_log.
--         It is a REQUEST. It erases nothing, and it is cancellable through
--         api.cancel_account_deletion().
--
--     (b) The erasure itself is the platform cascade the identity schema was
--         designed around: app.profiles.id references auth.users(id)
--         ON DELETE CASCADE, and every user-owned table cascades from
--         app.profiles. `delete from auth.users where id = ...` is therefore
--         the erasure, and it is the same delete Supabase's own Auth admin
--         API performs.
--
--   There is NO implemented worker that turns an (a) request into a (b)
--   erasure. This script does not write one. It calls (a) and then performs
--   (b), in that order, so that the audit trail the product would have written
--   exists before the rows disappear.
--
--   Six tables reference app.profiles with ON DELETE RESTRICT
--   (app.fantasy_teams, app.fantasy_leagues, app.fantasy_league_memberships,
--   app_private.fantasy_mutation_audit, app_private.fantasy_idempotency_keys,
--   app_private.fantasy_corrections). Any one of them makes the erasure fail
--   with a raw foreign-key violation. This script checks all six FIRST and
--   refuses with a message that names the account and the counts, rather than
--   letting Postgres throw something opaque halfway through.
--
--   AS OF THE 2026-09-21 PRODUCTION REHEARSAL all three accounts are blocked:
--   each holds unexpired app_private.fantasy_idempotency_keys rows, and
--   e2e.fantasy.recovery additionally owns a fantasy team. HALF 2 will refuse
--   today. That is the correct outcome and is documented in
--   docs/engineering/tasks/BG-0023/human-actions-section.md.
--
-- GUARDS — the point of this file
--   Every guard RAISES, which rolls the whole transaction back, and every
--   message names exactly what tripped it:
--
--     unexpected_qa_league_count    the number of ACTIVE leagues named exactly
--                                   p_league_name is not p_expected_league_count.
--                                   Names every matching league.
--     qa_league_membership_drift    a matching league does not have exactly one
--                                   active member. Somebody joined a league this
--                                   script was told was a private QA duplicate.
--     qa_league_owner_unresolved    a matching league's owner has no active
--                                   owner-role membership with a fantasy team,
--                                   so api.archive_fantasy_league cannot be
--                                   called on its behalf.
--     archive_count_mismatch        post-condition: the number of leagues left
--                                   active under that name is not zero.
--     unexpected_account_count      the number of auth.users matching
--                                   p_account_email_pattern is not
--                                   p_expected_account_count. Names every match.
--     account_blocked_by_reference  an account still owns rows in a table that
--                                   RESTRICTs. Names the account and every
--                                   blocking count.
--     account_delete_count_mismatch post-condition: the delete did not remove
--                                   exactly p_expected_account_count rows.
--
-- IDEMPOTENCY
--   HALF 1: the league set only ever contains rows that are still `active`.
--   After a committed run there are none, so a second run finds zero, prints
--   `already_applied` and writes nothing. To keep that honest the count guard
--   accepts zero as well as the expected count — anything in between is drift
--   and still refuses.
--
--   HALF 2: the account set only ever contains rows that still exist. After a
--   committed run there are none, so a second run finds zero, prints
--   `already_applied` and writes nothing.
--
-- HOW TO RUN
--   Owner / BYPASSRLS session (Supabase SQL editor as the database owner, or
--   psql as `postgres`).
--   1. Run the whole file. It archives the leagues and deletes nothing.
--   2. Read the RAISE NOTICE output and the review SELECTs at the bottom.
--   3. Only then uncomment and run `commit;`.
--   To additionally run the account half, change `p_include_accounts => false`
--   to `true` in the call at the bottom and repeat from step 1.
--   Anything else ends the session with an implicit ROLLBACK, which is the safe
--   outcome.
--
-- PARAMETERIZATION
--   The body lives in a SESSION-LOCAL temporary function,
--   `pg_temp.bg0023_cleanup_qa_artifacts(...)`, the same idiom as
--   scripts/backend/football-deactivate-non-current-teams.sql and
--   scripts/backend/fantasy-catalog-restage-maintenance.sql. It performs no
--   schema change and touches no existing migration.

begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- The maintenance body. Kept byte-for-byte in sync with the copy in
-- supabase/tests/database/fantasy_cleanup_qa_artifacts.test.sql — `supabase
-- test db` runs from supabase/tests/database, so a \i of a path under
-- scripts/backend is not reachable from there.
-- ---------------------------------------------------------------------------
create function pg_temp.bg0023_cleanup_qa_artifacts(
  p_expected_league_count integer,
  p_expected_account_count integer,
  p_include_accounts boolean default false,
  p_league_name text default 'QA Launch Ligue',
  p_account_email_pattern text default 'e2e.%@botolago.com'
)
returns table (
  phase text,
  entity_id uuid,
  entity_label text,
  action_taken text
)
language plpgsql
as $$
declare
  v_leagues integer;
  v_accounts integer;
  v_offenders text;
  v_league record;
  v_account record;
  v_team_id uuid;
  v_remaining_active integer;
  v_deleted integer;
  v_caller_claims text;
begin
  v_caller_claims := coalesce(current_setting('request.jwt.claims', true), '');

  -- =====================================================================
  -- HALF 1 — ARCHIVE THE DUPLICATE QA LEAGUES. Always runs. Reversible.
  -- =====================================================================

  -- (a re-call in the same session/transaction — the pgTAP suite does this —
  -- must not trip over the previous call's temp table)
  if to_regclass('pg_temp.bg0023_leagues') is not null then
    drop table bg0023_leagues;
  end if;
  create temporary table bg0023_leagues on commit drop as
  select league.id, league.name, league.owner_user_id, league.member_count
  from app.fantasy_leagues league
  where league.active
    and league.name = p_league_name;

  select count(*) into v_leagues from bg0023_leagues;

  -- Lock the matching leagues so a concurrent join cannot change member_count
  -- between the guards below and the archive calls.
  perform 1 from app.fantasy_leagues league
  where league.id in (select candidate.id from bg0023_leagues candidate)
  for update;

  if v_leagues = 0 then
    raise notice 'bg0023: already_applied (leagues) — no ACTIVE league is named %; nothing archived', p_league_name;
  else
    -- Guard: the league count must be exactly what was reviewed.
    if v_leagues <> p_expected_league_count then
      select string_agg(format('%s (%s, %s member(s))', candidate.name, candidate.id, candidate.member_count), ', ' order by candidate.id)
      into v_offenders from bg0023_leagues candidate;
      raise exception 'bg0023 refused: unexpected_qa_league_count — expected % ACTIVE league(s) named %, found %: %. Production drifted; re-run the review query and get the new list approved instead of loosening this guard.',
        p_expected_league_count, p_league_name, v_leagues, v_offenders;
    end if;

    -- Guard: each duplicate must still be the single-member private QA league
    -- it was reviewed as. A real member means it is no longer disposable.
    select string_agg(format('%s (%s): %s active member(s)', candidate.name, candidate.id, membership.count), ', ' order by candidate.id)
    into v_offenders
    from bg0023_leagues candidate
    join lateral (
      select count(*) as count
      from app.fantasy_league_memberships membership
      where membership.league_id = candidate.id
        and membership.status = 'active'
    ) membership on membership.count <> 1;

    if v_offenders is not null then
      raise exception 'bg0023 refused: qa_league_membership_drift — %. Each duplicate was reviewed as a one-member private QA league; a different membership count means somebody joined it and it is no longer safe to archive unasked.', v_offenders;
    end if;

    -- Archive each league through the product's OWN RPC, impersonating its
    -- owner. api.archive_fantasy_league is SECURITY DEFINER and reads
    -- auth.uid(), so request.jwt.claims is set per league and restored after.
    for v_league in select * from bg0023_leagues order by id loop
      select membership.fantasy_team_id into v_team_id
      from app.fantasy_league_memberships membership
      where membership.league_id = v_league.id
        and membership.user_id = v_league.owner_user_id
        and membership.role = 'owner'
        and membership.status = 'active'
      limit 1;

      if v_team_id is null then
        raise exception 'bg0023 refused: qa_league_owner_unresolved — league % (%) has no active owner-role membership for owner %, so api.archive_fantasy_league cannot be called on its behalf.',
          v_league.name, v_league.id, v_league.owner_user_id;
      end if;

      perform set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_league.owner_user_id, 'role', 'authenticated')::text,
        true
      );

      perform api.archive_fantasy_league(v_league.id, v_team_id);

      perform set_config('request.jwt.claims', v_caller_claims, true);

      raise notice 'bg0023: archived league % (%) via api.archive_fantasy_league, owner team %', v_league.name, v_league.id, v_team_id;
    end loop;

    -- Post-condition: nothing under that name may still be active.
    select count(*) into v_remaining_active
    from app.fantasy_leagues league
    where league.active and league.name = p_league_name;

    if v_remaining_active <> 0 then
      raise exception 'bg0023 refused: archive_count_mismatch — % league(s) named % are still active after archiving %', v_remaining_active, p_league_name, v_leagues;
    end if;

    raise notice 'bg0023: archived % league(s) named %', v_leagues, p_league_name;

    return query
    select 'league'::text, candidate.id, candidate.name, 'archived'::text
    from bg0023_leagues candidate order by candidate.id;
  end if;

  -- =====================================================================
  -- HALF 2 — THE ACCOUNT-DELETION PATH. Off unless explicitly requested.
  -- IRREVERSIBLE.
  -- =====================================================================
  if not p_include_accounts then
    raise notice 'bg0023: account half SKIPPED — p_include_accounts is false, so no account-deletion path ran and no account was touched. This is the default.';
    return;
  end if;

  raise warning 'bg0023: account half ENABLED — the account-deletion path is about to run for accounts matching %. This is IRREVERSIBLE once committed.', p_account_email_pattern;

  if to_regclass('pg_temp.bg0023_accounts') is not null then
    drop table bg0023_accounts;
  end if;
  -- auth.users.email is varchar(255); cast to text so the temp table matches
  -- this function's declared `entity_label text` return column.
  create temporary table bg0023_accounts on commit drop as
  select account.id, account.email::text as email
  from auth.users account
  where account.email like p_account_email_pattern;

  select count(*) into v_accounts from bg0023_accounts;

  perform 1 from auth.users account
  where account.id in (select candidate.id from bg0023_accounts candidate)
  for update;

  if v_accounts = 0 then
    raise notice 'bg0023: already_applied (accounts) — no auth.users row matches %; nothing deleted', p_account_email_pattern;
    return;
  end if;

  -- Guard: the account count must be exactly what was reviewed. This is the
  -- guard that stops a widened pattern from erasing real users.
  if v_accounts <> p_expected_account_count then
    select string_agg(format('%s (%s)', candidate.email, candidate.id), ', ' order by candidate.email)
    into v_offenders from bg0023_accounts candidate;
    raise exception 'bg0023 refused: unexpected_account_count — expected % account(s) matching %, found %: %. Refusing to delete a set that was not reviewed.',
      p_expected_account_count, p_account_email_pattern, v_accounts, v_offenders;
  end if;

  -- Guard: every table that RESTRICTs on app.profiles. Checked before any
  -- write, so the operator gets a named refusal instead of a raw FK violation.
  select string_agg(
    format('%s (%s): fantasy_teams=%s, fantasy_leagues=%s, league_memberships=%s, mutation_audit=%s, idempotency_keys=%s, corrections=%s',
      candidate.email, candidate.id,
      blocking.teams, blocking.leagues, blocking.memberships,
      blocking.audit, blocking.keys, blocking.corrections),
    E'\n  - ' order by candidate.email)
  into v_offenders
  from bg0023_accounts candidate
  join lateral (
    select
      (select count(*) from app.fantasy_teams x where x.user_id = candidate.id) as teams,
      (select count(*) from app.fantasy_leagues x where x.owner_user_id = candidate.id) as leagues,
      (select count(*) from app.fantasy_league_memberships x where x.user_id = candidate.id) as memberships,
      (select count(*) from app_private.fantasy_mutation_audit x where x.user_id = candidate.id) as audit,
      (select count(*) from app_private.fantasy_idempotency_keys x where x.user_id = candidate.id) as keys,
      (select count(*) from app_private.fantasy_corrections x where x.requested_by = candidate.id) as corrections
  ) blocking on (blocking.teams + blocking.leagues + blocking.memberships
                 + blocking.audit + blocking.keys + blocking.corrections) > 0;

  if v_offenders is not null then
    raise exception E'bg0023 refused: account_blocked_by_reference — these accounts still own rows in tables that reference app.profiles ON DELETE RESTRICT:\n  - %\nThe erasure would fail with a raw foreign-key violation. Tear those rows down first (scripts/backend/fantasy-catalog-restage-maintenance.sql is the existing path for the fantasy half) or leave the accounts in place — archiving the leagues does not depend on this.', v_offenders;
  end if;

  -- (a) The product's own request path, per account. Files the
  --     app.account_deletion_requests row and the security-audit entry that a
  --     user-initiated deletion would have produced.
  for v_account in select * from bg0023_accounts order by email loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', v_account.id, 'role', 'authenticated')::text,
      true
    );

    perform api.request_account_deletion();

    perform set_config('request.jwt.claims', v_caller_claims, true);

    raise notice 'bg0023: filed api.request_account_deletion() for % (%)', v_account.email, v_account.id;
  end loop;

  -- (b) The erasure. app.profiles.id references auth.users(id) ON DELETE
  --     CASCADE, so this one statement removes the profile and everything that
  --     cascades from it. Scoped to the exact ids, never to the pattern.
  delete from auth.users account
  where account.id in (select candidate.id from bg0023_accounts candidate);
  get diagnostics v_deleted = row_count;

  if v_deleted <> p_expected_account_count then
    raise exception 'bg0023 refused: account_delete_count_mismatch — expected % deleted account(s), got %', p_expected_account_count, v_deleted;
  end if;

  raise notice 'bg0023: deleted % account(s) matching %', v_deleted, p_account_email_pattern;

  return query
  select 'account'::text, candidate.id, candidate.email, 'deleted'::text
  from bg0023_accounts candidate order by candidate.email;
end;
$$;

comment on function pg_temp.bg0023_cleanup_qa_artifacts is
  'Session-local (pg_temp) maintenance body for BG-0023. Not a persistent RPC: it exists '
  'only for the calling session and disappears when the session ends. HALF 1 (archive the '
  'duplicate QA leagues) always runs and is reversible; HALF 2 (the account-deletion path) '
  'runs only when p_include_accounts is explicitly true and is IRREVERSIBLE. Call it under '
  'an owner/BYPASSRLS session and COMMIT only after reviewing its RAISE NOTICE output.';

-- ---------------------------------------------------------------------------
-- Run it. Parameters reviewed against production on 2026-09-21:
--   2 ACTIVE leagues named 'QA Launch Ligue', one active member each, both
--   owned by qa.launch.20260920@botolago.com (team 455f8d6e-...);
--   3 auth.users matching 'e2e.%@botolago.com' out of 19 total.
--
-- p_include_accounts is FALSE. Running this file unchanged archives the two
-- leagues and deletes nothing. Change it to true ONLY after reading the
-- "Decision 2" section of docs/engineering/tasks/BG-0023/human-actions-section.md.
-- ---------------------------------------------------------------------------
select * from pg_temp.bg0023_cleanup_qa_artifacts(
  p_expected_league_count  => 2,
  p_expected_account_count => 3,
  p_include_accounts       => false
);

-- ---------------------------------------------------------------------------
-- Review, then COMMIT (or ROLLBACK).
--
-- (a) Every league, so the operator can see that exactly the two duplicates
--     went inactive and the unrelated 'Ligue QA Test' is untouched.
-- ---------------------------------------------------------------------------
select
  league.id,
  league.name,
  league.visibility,
  league.active,
  league.member_count,
  account.email as owner_email,
  league.created_at,
  league.updated_at
from app.fantasy_leagues league
left join auth.users account on account.id = league.owner_user_id
order by league.active desc, league.name, league.created_at;

-- ---------------------------------------------------------------------------
-- (b) The population counts. Expect 19 auth.users / 7 fantasy teams unchanged
--     after a leagues-only run, and 16 / 6 after a committed account run.
-- ---------------------------------------------------------------------------
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from auth.users where email like 'e2e.%@botolago.com') as e2e_accounts,
  (select count(*) from app.profiles) as profiles,
  (select count(*) from app.fantasy_teams) as fantasy_teams,
  (select count(*) from app.fantasy_leagues where active) as active_leagues,
  (select count(*) from app.fantasy_leagues where not active) as archived_leagues;

-- ---------------------------------------------------------------------------
-- (c) The audit trail HALF 1 wrote — one 'archive_league' row per league.
-- ---------------------------------------------------------------------------
select
  audit.id,
  audit.user_id,
  audit.fantasy_team_id,
  audit.operation,
  audit.accepted,
  audit.safe_metadata,
  audit.occurred_at
from app_private.fantasy_mutation_audit audit
where audit.operation = 'archive_league'
order by audit.occurred_at desc, audit.id desc
limit 10;

-- commit;
