-- BG-0023 — scripts/backend/fantasy-cleanup-qa-artifacts.sql
--
-- Exercises the two-halves cleanup transaction end-to-end against a synthetic
-- population shaped like production's: two ACTIVE duplicate leagues sharing one
-- name with one member each, one unrelated active league that must survive, a
-- set of synthetic accounts matching the e2e pattern, and one real account that
-- must never be matched.
--
-- The scenarios that matter most are the NEGATIVE ones: that running the body
-- with its default p_include_accounts deletes nothing, and that an account
-- still holding a RESTRICT-referencing row refuses by name instead of throwing
-- a raw foreign-key violation. Production is in exactly that state today.
--
-- The maintenance body below is kept byte-for-byte in sync with
-- scripts/backend/fantasy-cleanup-qa-artifacts.sql. `supabase test db` runs
-- from supabase/tests/database, so a \i / \ir of a path under scripts/backend
-- is not reachable from here — the same constraint (and the same remedy) as
-- supabase/tests/database/football_deactivate_non_current_teams.test.sql.
begin;

select extensions.no_plan();

-- =====================================================================
-- FIXTURE
-- =====================================================================
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('c3000000-0000-4000-8000-000000000001', 'MA', 'MAR');

insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('c3100000-0000-4000-8000-000000000001', 'bg0023-league', 'BG0023 League', 'B23',
  'league', 'c3000000-0000-4000-8000-000000000001');

insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('c3200000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000001',
  '2089/90', '2089-08-01', '2090-06-30', 'active', true);

insert into app.rounds (id, season_id, round_number, name, status)
values ('c3300000-0000-4000-8000-000000000001', 'c3200000-0000-4000-8000-000000000001',
  1, 'Gameweek 1', 'active');

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('c3600000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000001',
  'bg0023-fantasy', 'BG0023 Fantasy', true);

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('c3630000-0000-4000-8000-000000000001', 'c3600000-0000-4000-8000-000000000001',
  'c3200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2089/90', 'active', '2089-08-01', '2090-06-30');

insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status
) values ('c3640000-0000-4000-8000-000000000001', 'c3630000-0000-4000-8000-000000000001',
  'c3300000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
  '2090-01-01T11:00:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z', 'open');

-- Four accounts: three match the synthetic pattern, one is a real user whose
-- address must never be matched by it.
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('c3800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'e2e.alpha@bg0023.test', statement_timestamp(), 'hash',
    '{}', '{"username":"bg0023_alpha"}', statement_timestamp(), statement_timestamp()),
  ('c3800000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'e2e.beta@bg0023.test', statement_timestamp(), 'hash',
    '{}', '{"username":"bg0023_beta"}', statement_timestamp(), statement_timestamp()),
  ('c3800000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'e2e.gamma@bg0023.test', statement_timestamp(), 'hash',
    '{}', '{"username":"bg0023_gamma"}', statement_timestamp(), statement_timestamp()),
  ('c3800000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'real.person@bg0023.test', statement_timestamp(), 'hash',
    '{}', '{"username":"bg0023_real"}', statement_timestamp(), statement_timestamp());

-- The league owner holds a fantasy team; api.archive_fantasy_league requires
-- an active owner-role membership backed by that team.
insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
) values ('c3900000-0000-4000-8000-000000000001', 'c3800000-0000-4000-8000-000000000009',
  'c3630000-0000-4000-8000-000000000001', 'c3640000-0000-4000-8000-000000000001',
  'BG0023 Owner XI', 10, 100, 1);

-- Two duplicates sharing a name, plus one unrelated league that must survive.
insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility,
  invite_code_digest, invite_code_hint, active, member_count
) values
  ('c3a00000-0000-4000-8000-000000000001', 'c3630000-0000-4000-8000-000000000001',
    'c3800000-0000-4000-8000-000000000009', 'QA Launch Ligue', 'private',
    repeat('1', 64), 'AAA1', true, 1),
  ('c3a00000-0000-4000-8000-000000000002', 'c3630000-0000-4000-8000-000000000001',
    'c3800000-0000-4000-8000-000000000009', 'QA Launch Ligue', 'private',
    repeat('2', 64), 'AAA2', true, 1),
  ('c3a00000-0000-4000-8000-000000000003', 'c3630000-0000-4000-8000-000000000001',
    'c3800000-0000-4000-8000-000000000009', 'Ligue QA Test', 'private',
    repeat('3', 64), 'AAA3', true, 1);

insert into app.fantasy_league_memberships (
  id, league_id, fantasy_team_id, user_id, role, status
) values
  ('c3b00000-0000-4000-8000-000000000001', 'c3a00000-0000-4000-8000-000000000001',
    'c3900000-0000-4000-8000-000000000001', 'c3800000-0000-4000-8000-000000000009', 'owner', 'active'),
  ('c3b00000-0000-4000-8000-000000000002', 'c3a00000-0000-4000-8000-000000000002',
    'c3900000-0000-4000-8000-000000000001', 'c3800000-0000-4000-8000-000000000009', 'owner', 'active'),
  ('c3b00000-0000-4000-8000-000000000003', 'c3a00000-0000-4000-8000-000000000003',
    'c3900000-0000-4000-8000-000000000001', 'c3800000-0000-4000-8000-000000000009', 'owner', 'active');

select extensions.is(
  (select count(*)::integer from app.fantasy_leagues where active),
  3,
  'fixture: three leagues start active — two duplicates and one unrelated'
);

select extensions.is(
  (select count(*)::integer from auth.users where email like 'e2e.%@bg0023.test'),
  3,
  'fixture: exactly three accounts match the synthetic pattern'
);

-- ---------------------------------------------------------------------
-- Maintenance body — SYNCED COPY of scripts/backend/fantasy-cleanup-qa-artifacts.sql
-- ---------------------------------------------------------------------
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

-- =====================================================================
-- 1. DEFAULT RUN — the file as shipped. Archives both duplicates,
--    touches no account at all.
-- =====================================================================
savepoint bg0023_default;

select extensions.is(
  (select count(*)::integer from pg_temp.bg0023_cleanup_qa_artifacts(
    p_expected_league_count  => 2,
    p_expected_account_count => 3,
    p_league_name            => 'QA Launch Ligue',
    p_account_email_pattern  => 'e2e.%@bg0023.test')),
  2,
  'default run: exactly the two duplicate leagues are reported, and nothing else'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_leagues where active),
  1,
  'default run: one league remains active'
);

select extensions.ok(
  (select active from app.fantasy_leagues where id = 'c3a00000-0000-4000-8000-000000000003'),
  'default run: the unrelated "Ligue QA Test" is left alone'
);

select extensions.is(
  (select count(*)::integer from auth.users),
  4,
  'default run: NO account is deleted — p_include_accounts defaults to false'
);

select extensions.is(
  (select count(*)::integer from app.account_deletion_requests),
  0,
  'default run: not even a deletion REQUEST is filed'
);

select extensions.is(
  (select count(*)::integer from app_private.fantasy_mutation_audit
   where operation = 'archive_league' and accepted),
  2,
  'default run: api.archive_fantasy_league wrote one audit row per league'
);

-- 2. IDEMPOTENCE — a second run finds no active league under that name,
--    prints already_applied, writes nothing and raises nothing.
select extensions.is(
  (select count(*)::integer from pg_temp.bg0023_cleanup_qa_artifacts(
    p_expected_league_count  => 2,
    p_expected_account_count => 3,
    p_league_name            => 'QA Launch Ligue',
    p_account_email_pattern  => 'e2e.%@bg0023.test')),
  0,
  'second run: nothing is archived a second time'
);

select extensions.is(
  (select count(*)::integer from app_private.fantasy_mutation_audit
   where operation = 'archive_league'),
  2,
  'second run: no additional audit row is written'
);

rollback to savepoint bg0023_default;

select extensions.is(
  (select count(*)::integer from app.fantasy_leagues where active),
  3,
  'rollback to savepoint restores all three leagues to active'
);

-- =====================================================================
-- 3. LEAGUE-COUNT GUARD — the expected count is wrong, so nothing is
--    archived and the message names every matching league.
-- =====================================================================
savepoint bg0023_count_guard;

select extensions.throws_ok(
  $$select * from pg_temp.bg0023_cleanup_qa_artifacts(
      p_expected_league_count  => 5,
      p_expected_account_count => 3,
      p_league_name            => 'QA Launch Ligue',
      p_account_email_pattern  => 'e2e.%@bg0023.test')$$,
  'bg0023 refused: unexpected_qa_league_count — expected 5 ACTIVE league(s) named QA Launch Ligue, found 2: QA Launch Ligue (c3a00000-0000-4000-8000-000000000001, 1 member(s)), QA Launch Ligue (c3a00000-0000-4000-8000-000000000002, 1 member(s)). Production drifted; re-run the review query and get the new list approved instead of loosening this guard.',
  'league-count guard: the wrong expected count refuses and names every matching league'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_leagues where active),
  3,
  'league-count guard: the refusal rolled everything back'
);

rollback to savepoint bg0023_count_guard;

-- =====================================================================
-- 4. MEMBERSHIP-DRIFT GUARD — somebody joined one of the duplicates, so
--    it is no longer a disposable one-member QA league.
-- =====================================================================
savepoint bg0023_membership_drift;

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
) values ('c3900000-0000-4000-8000-000000000002', 'c3800000-0000-4000-8000-000000000001',
  'c3630000-0000-4000-8000-000000000001', 'c3640000-0000-4000-8000-000000000001',
  'BG0023 Joiner XI', 10, 100, 1);

insert into app.fantasy_league_memberships (
  league_id, fantasy_team_id, user_id, role, status
) values ('c3a00000-0000-4000-8000-000000000002', 'c3900000-0000-4000-8000-000000000002',
  'c3800000-0000-4000-8000-000000000001', 'member', 'active');

select extensions.throws_ok(
  $$select * from pg_temp.bg0023_cleanup_qa_artifacts(
      p_expected_league_count  => 2,
      p_expected_account_count => 3,
      p_league_name            => 'QA Launch Ligue',
      p_account_email_pattern  => 'e2e.%@bg0023.test')$$,
  'bg0023 refused: qa_league_membership_drift — QA Launch Ligue (c3a00000-0000-4000-8000-000000000002): 2 active member(s). Each duplicate was reviewed as a one-member private QA league; a different membership count means somebody joined it and it is no longer safe to archive unasked.',
  'membership-drift guard: a second member refuses and names the league'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_leagues where active),
  3,
  'membership-drift guard: nothing was archived'
);

rollback to savepoint bg0023_membership_drift;

-- =====================================================================
-- 5. RESTRICT GUARD — the account half is enabled, but an account still
--    owns a row in a table that RESTRICTs on app.profiles. This is the
--    state production is in TODAY.
-- =====================================================================
savepoint bg0023_restrict_guard;

insert into app_private.fantasy_idempotency_keys (
  user_id, idempotency_key, operation, request_hash, response_body, expires_at
) values ('c3800000-0000-4000-8000-000000000001',
  'c3c00000-0000-4000-8000-000000000001', 'create_fantasy_team',
  repeat('a', 64), '{}'::jsonb, statement_timestamp() + interval '7 days');

select extensions.throws_ok(
  $$select * from pg_temp.bg0023_cleanup_qa_artifacts(
      p_expected_league_count  => 2,
      p_expected_account_count => 3,
      p_include_accounts       => true,
      p_league_name            => 'QA Launch Ligue',
      p_account_email_pattern  => 'e2e.%@bg0023.test')$$,
  E'bg0023 refused: account_blocked_by_reference — these accounts still own rows in tables that reference app.profiles ON DELETE RESTRICT:\n  - e2e.alpha@bg0023.test (c3800000-0000-4000-8000-000000000001): fantasy_teams=0, fantasy_leagues=0, league_memberships=0, mutation_audit=0, idempotency_keys=1, corrections=0\nThe erasure would fail with a raw foreign-key violation. Tear those rows down first (scripts/backend/fantasy-catalog-restage-maintenance.sql is the existing path for the fantasy half) or leave the accounts in place — archiving the leagues does not depend on this.',
  'RESTRICT guard: a blocking idempotency key refuses by name instead of a raw FK violation'
);

select extensions.is(
  (select count(*)::integer from auth.users),
  4,
  'RESTRICT guard: no account was deleted'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_leagues where active),
  3,
  'RESTRICT guard: the refusal rolled the league archiving back too — the halves share one transaction'
);

rollback to savepoint bg0023_restrict_guard;

-- =====================================================================
-- 6. ACCOUNT-COUNT GUARD — the pattern matches a different number of
--    accounts than was reviewed. This is the guard that stops a widened
--    pattern from erasing real users.
-- =====================================================================
savepoint bg0023_account_count;

select extensions.throws_ok(
  $$select * from pg_temp.bg0023_cleanup_qa_artifacts(
      p_expected_league_count  => 2,
      p_expected_account_count => 3,
      p_include_accounts       => true,
      p_league_name            => 'QA Launch Ligue',
      p_account_email_pattern  => '%@bg0023.test')$$,
  'bg0023 refused: unexpected_account_count — expected 3 account(s) matching %@bg0023.test, found 4: e2e.alpha@bg0023.test (c3800000-0000-4000-8000-000000000001), e2e.beta@bg0023.test (c3800000-0000-4000-8000-000000000002), e2e.gamma@bg0023.test (c3800000-0000-4000-8000-000000000003), real.person@bg0023.test (c3800000-0000-4000-8000-000000000009). Refusing to delete a set that was not reviewed.',
  'account-count guard: a widened pattern that catches a real user refuses and names every match'
);

select extensions.is(
  (select count(*)::integer from auth.users),
  4,
  'account-count guard: the real user is still there'
);

rollback to savepoint bg0023_account_count;

-- =====================================================================
-- 7. ACCOUNT HALF, UNBLOCKED — with nothing holding them, the three
--    synthetic accounts go through the request path and then the cascade.
--    The real user is untouched.
-- =====================================================================
savepoint bg0023_accounts;

select extensions.is(
  (select count(*)::integer from pg_temp.bg0023_cleanup_qa_artifacts(
    p_expected_league_count  => 2,
    p_expected_account_count => 3,
    p_include_accounts       => true,
    p_league_name            => 'QA Launch Ligue',
    p_account_email_pattern  => 'e2e.%@bg0023.test')),
  5,
  'account half: 2 league rows plus 3 account rows are reported'
);

select extensions.is(
  (select count(*)::integer from auth.users),
  1,
  'account half: the three synthetic accounts are gone'
);

select extensions.is(
  (select email from auth.users),
  'real.person@bg0023.test',
  'account half: the surviving account is the real user, not a synthetic one'
);

select extensions.is(
  (select count(*)::integer from app.profiles
   where id in ('c3800000-0000-4000-8000-000000000001',
                'c3800000-0000-4000-8000-000000000002',
                'c3800000-0000-4000-8000-000000000003')),
  0,
  'account half: app.profiles cascaded away with auth.users'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_leagues where active),
  1,
  'account half: the leagues were archived in the same transaction'
);

-- 8. IDEMPOTENCE of the account half.
select extensions.is(
  (select count(*)::integer from pg_temp.bg0023_cleanup_qa_artifacts(
    p_expected_league_count  => 2,
    p_expected_account_count => 3,
    p_include_accounts       => true,
    p_league_name            => 'QA Launch Ligue',
    p_account_email_pattern  => 'e2e.%@bg0023.test')),
  0,
  'second run: neither half finds anything left to do, and neither raises'
);

rollback to savepoint bg0023_accounts;

select extensions.is(
  (select count(*)::integer from auth.users),
  4,
  'rollback to savepoint restores all four accounts'
);

select * from extensions.finish();
rollback;
