-- BG-0011 / BG-0032 / BG-0048 — Fantasy catalog restage maintenance.
--
-- WHAT THIS IS
--   A single administrative maintenance transaction that:
--     1. Re-asserts the exact expected state (3 named QA/E2E teams, exact
--        dependent counts, exact owners, no other team for the season).
--     2. Aborts safely if app_private.fantasy_job_runs holds ANY row on
--        either FK path for the target fantasy season/gameweeks (BG-0048;
--        deliberately narrow — no cleanup, no migration, just a safe abort).
--     3. Deletes, in strict FK-safe order, ONLY the 3 named teams and their
--        named dependents (never a broad "every team in this season" delete).
--     4. Calls api.service_rollback_fantasy_catalog with the activation run's
--        STORED digest (read fresh from app_private.fantasy_catalog_activation_runs,
--        never hardcoded/recomputed elsewhere) — which, as of migration
--        20260918170000_fantasy_catalog_rollback_cleanup.sql, already cleans
--        up app.fantasy_leagues / app.fantasy_league_memberships /
--        app.fantasy_rankings itself. This script therefore does NOT delete
--        app.fantasy_leagues: that blocker (BG-0011 finding #2) is already
--        fixed in the reviewed rollback RPC, confirmed by reading its
--        pg_get_functiondef and by supabase/tests/database/
--        fantasy_catalog_rollback_cleanup.test.sql, which already exercises
--        it end-to-end.
--     5. Immediately re-previews and re-stages the SAME football season, in
--        the SAME transaction, with a fresh idempotency key.
--     6. Does NOT call api.service_open_fantasy_registration — that stays a
--        separate, independently verified step per the runbook and the
--        owner's explicit instruction.
--
-- WHY NO NEW RPC
--   Read api.service_rollback_fantasy_catalog's definition (migration
--   20260803210943_fantasy_catalog_activation.sql, re-created by
--   20260918170000_fantasy_catalog_rollback_cleanup.sql) and the RLS/grants
--   in the same files: every trusted Fantasy write path is `security
--   definer`, gated on app_private.is_service_request() (service_role JWT
--   claim), and every app_private.* table has ALL privileges revoked from
--   service_role while every app.* table carries FORCE ROW LEVEL SECURITY.
--   The raw per-row deletes this maintenance needs (an exact, allow-listed
--   set of team ids and their named dependents) are therefore reachable
--   only from an owner/BYPASSRLS session — service_role has no path to them
--   even through PostgREST. This is exactly the model
--   supabase/migrations/20260803210943_fantasy_catalog_activation.sql and
--   the owner-approved brief (docs/engineering/tasks/BG-0011/
--   engineering-brief-option-a.yaml, step A7) already use for this kind of
--   maintenance, and the repository defines no rule anywhere (CI guard,
--   CLAUDE.md/AGENTS.md, migration convention) that would require a new
--   api.* RPC or a public/anon-callable endpoint for an internal,
--   operator-run, one-off maintenance transaction. No such rule was found
--   this task deliberately does NOT add one, per the owner's explicit
--   instruction to use "the existing administrative execution approach ...
--   NOT a new RPC, NOT a new general-purpose deletion feature, NOT a public
--   endpoint".
--
-- HOW THIS IS PARAMETERIZED
--   The destructive/restaging logic lives in a SESSION-LOCAL temporary
--   function, `pg_temp.fantasy_catalog_restage_maintenance(...)`. A pg_temp
--   function:
--     * is never written to the schema catalog beyond the calling session
--       (it disappears when the session ends) — it is not a new persistent
--       RPC, migration object, or grantable interface;
--     * needs no GRANT/REVOKE bookkeeping, because only the session that
--       created it can see or call it;
--     * still gives the script explicit, named, typed arguments, so the
--       SAME function body can be pointed at a local rehearsal season (see
--       supabase/tests/database/fantasy_catalog_restage_maintenance.test.sql)
--       and, later, at production's real identifiers, without discovering
--       or hardcoding anything the caller does not pass in.
--   It must run in a BYPASSRLS/owner session (e.g. `psql` connected as the
--   `postgres` role, or any role with `rolbypassrls`), exactly like step A7
--   of the engineering brief. It performs no schema change and touches no
--   existing migration.
--
-- CONCURRENCY PROTECTION — what was proven, not assumed
--   api.service_stage_fantasy_catalog and api.service_rollback_fantasy_catalog
--   each take `pg_advisory_xact_lock(hashtextextended('fantasy:catalog:' ||
--   football_season_id, 0))`. That lock namespace is keyed by the FOOTBALL
--   season id and is held only by those two RPCs (and now, deliberately,
--   by this maintenance function, which takes the identical lock as its
--   very first action). api.create_fantasy_team, by contrast, takes a
--   DIFFERENT advisory lock, keyed by (current_user_id, FANTASY season id):
--   `hashtextextended(current_user_id || ':fantasy:create:' || p_season_id, 0)`.
--   The two lock namespaces never intersect, and create_fantasy_team's
--   season-status read (`select * from app.fantasy_seasons where id =
--   p_season_id and status in ('registration_open','active')`) is a plain,
--   non-locking SELECT that never blocks on anyone's advisory lock or
--   uncommitted row lock, by Postgres MVCC semantics.
--
--   CONSEQUENCE, PROVEN by a live two-session test against a local instance
--   (see the concurrency section of the task report/PR description): taking
--   the 'fantasy:catalog:' advisory lock (or a FOR UPDATE on the
--   app.fantasy_seasons row) does NOT block, and cannot block, a concurrent
--   api.create_fantasy_team call for the same fantasy season — it has no
--   participation in that lock namespace and never will unless
--   create_fantasy_team itself is changed (out of scope: that would be an
--   edit to an existing, reviewed migration). The concurrent create
--   SUCCEEDS immediately and commits independently.
--
--   WHY THIS IS STILL SAFE: this script's destructive DELETEs are scoped to
--   an EXACT, explicit list of 3 team ids (never `where fantasy_season_id =
--   ...`), so a 4th team created concurrently is structurally never touched
--   or silently absorbed by this script's deletes. The final safety net is
--   api.service_rollback_fantasy_catalog's own PT409 fantasy_catalog_in_use
--   guard, taken under the SAME 'fantasy:catalog:' advisory lock, re-checked
--   freshly at the moment this transaction calls it (a snapshot taken well
--   after this transaction's own pre-check, and after the concurrent
--   create_fantasy_team's commit): if that 4th team exists at that instant,
--   the rollback call raises PT409 and this whole transaction — the 3-team
--   cleanup included — rolls back atomically, leaving all state exactly as
--   it was before this script ran. Nothing is partially applied and nothing
--   is silently deleted out from under a new registrant. This is a
--   detect-and-abort design, not a blocking design: the task's own framing
--   ("succeeds and creates a state your abort-checks would then have to
--   catch on a retry") is the accurate description of what actually
--   happens, and this script's abort check is exactly that catch, made
--   atomic by running steps 3-5 in one transaction.
--
-- IDEMPOTENCY / RETRY DISCIPLINE (read this before ever retrying)
--   Per the owner's instruction, do not manufacture a new idempotency key
--   after an uncertain/timed-out run just because the client-side call
--   timed out. After ANY uncertain execution (connection dropped, operator
--   killed the client, ambiguous error), before retrying, inspect:
--     1. app_private.fantasy_catalog_activation_runs where id =
--        :old_activation_id — is rolled_back_at now set? A transaction that
--        committed will have stamped it; one that did not commit will not.
--     2. app.fantasy_teams where fantasy_season_id = :old_fantasy_season_id
--        — do the 3 named teams still exist? If the transaction committed,
--        they do not; if it rolled back (including a mid-flight abort), all
--        3 are still present, byte-for-byte, because the whole operation is
--        one transaction.
--     3. app_private.fantasy_catalog_activation_runs where id =
--        :new_idempotency_key (the restage key you intended to use) — does
--        a row already exist? If it does AND rolled_back_at on the OLD run
--        is set, the restage already committed: do NOT retry, verify with
--        A9-style read queries instead (distinct prices per position,
--        player count) and move on to the separately-verified registration
--        step.
--     4. app.fantasy_seasons where football_season_id = :football_season_id
--        — does a NEW fantasy season now exist? Combined with (1)-(3), this
--        tells you unambiguously whether the whole transaction committed.
--   Because every one of steps 3-5 runs inside ONE transaction, there is no
--   state where "some but not all" of the destructive cleanup, rollback and
--   restage happened — the four checks above will always agree. If (1)-(4)
--   all say "nothing changed", it is safe to retry with the SAME
--   idempotency key (the stage/rollback RPCs are themselves idempotent on
--   their key). If (1)-(4) say "it committed", do NOT retry at all — the
--   operation is done. Never generate a fresh idempotency key just because
--   the client timed out without checking (1)-(4) first: a fresh key against
--   an already-committed run would attempt to stage a second, conflicting
--   catalog and fail loudly with fantasy_catalog_already_staged, which is a
--   symptom of skipping this checklist, not a bug in the RPC.
--
-- USAGE
--   Run under an owner/BYPASSRLS psql session, e.g.:
--     psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/backend/fantasy-catalog-restage-maintenance.sql
--   Then, in the SAME session, call the function with the real arguments,
--   e.g. for production (after independently re-verifying every count and
--   recomputing nothing by hand — the script reads the stored digest and
--   the fresh preview digest itself):
--     select * from pg_temp.fantasy_catalog_restage_maintenance(
--       p_fantasy_season_id      => '9918cf95-9ed5-4d7b-99ca-eb9bfc29a258',
--       p_football_season_id     => 'd03223b0-8f4a-4309-93e1-2a708d7c3584',
--       p_activation_run_id      => 'c0de2026-0917-4a11-8f00-000000000001',
--       p_allowed_team_ids       => array[
--         'ccd4d5c4-2cd2-4b0d-82f4-7f22f0d435b9',
--         '84f211c8-5a09-40e1-9318-c4035d5520a9',
--         'cc4bf92b-30a1-4d65-bb05-4ac49ecb91f9'
--       ]::uuid[],
--       p_allowed_owner_ids      => array[
--         'e2e00000-0000-4000-8000-00000000f001',
--         'e2e00000-0000-4000-8000-00000000f002',
--         'e2e00000-0000-4000-8000-00000000f003'
--       ]::uuid[],
--       p_expected_squad_memberships    => 53,
--       p_expected_transfer_batches     => 8,
--       p_expected_transfers            => 8,
--       p_expected_lineups              => 3,
--       p_expected_lineup_players       => 45,
--       p_expected_league_memberships   => 4,
--       p_expected_mutation_audit_rows  => 16,
--       p_expected_leagues              => 4,
--       p_ruleset_code                  => 'botolago-fantasy-v1.1',
--       p_expected_team_count           => 16,
--       p_expected_round_count          => 1,
--       p_expected_fixture_count        => 8,
--       p_minimum_player_count          => 240,
--       p_maximum_player_count          => 800,
--       p_new_idempotency_key           => '<a fresh, unused uuid>'
--     );
--   Nothing is committed until the calling session issues COMMIT. Review the
--   RAISE NOTICE output and the returned row before committing.

create or replace function pg_temp.fantasy_catalog_restage_maintenance(
  p_fantasy_season_id uuid,
  p_football_season_id uuid,
  p_activation_run_id uuid,
  p_allowed_team_ids uuid[],
  p_allowed_owner_ids uuid[],
  p_expected_squad_memberships integer,
  p_expected_transfer_batches integer,
  p_expected_transfers integer,
  p_expected_lineups integer,
  p_expected_lineup_players integer,
  p_expected_league_memberships integer,
  p_expected_mutation_audit_rows integer,
  p_expected_leagues integer,
  p_ruleset_code text,
  p_expected_team_count integer,
  p_expected_round_count integer,
  p_expected_fixture_count integer,
  p_minimum_player_count integer,
  p_maximum_player_count integer,
  p_new_idempotency_key uuid
)
returns table (
  stored_digest text,
  removed_squad_memberships integer,
  removed_transfer_batches integer,
  removed_transfers integer,
  removed_lineups integer,
  removed_lineup_players integer,
  removed_league_memberships integer,
  removed_mutation_audit_rows integer,
  removed_teams integer,
  rollback_result jsonb,
  preview_result jsonb,
  stage_result jsonb
)
language plpgsql
as $$
declare
  v_stored_digest text;
  v_activation app_private.fantasy_catalog_activation_runs%rowtype;
  v_team_count integer;
  v_bad_owner_count integer;
  v_other_team_count integer;
  v_squad_memberships integer;
  v_transfer_batches integer;
  v_transfers integer;
  v_lineups integer;
  v_lineup_players integer;
  v_league_memberships integer;
  v_mutation_audit_rows integer;
  v_leagues integer;
  v_job_runs_by_season integer;
  v_job_runs_by_gameweek integer;
  v_rollback jsonb;
  v_preview jsonb;
  v_stage jsonb;
begin
  if p_fantasy_season_id is null or p_football_season_id is null
    or p_activation_run_id is null or p_new_idempotency_key is null
    or p_allowed_team_ids is null or cardinality(p_allowed_team_ids) <> 3
    or p_allowed_owner_ids is null or cardinality(p_allowed_owner_ids) <> 3
  then
    raise exception using errcode = 'PT400',
      message = 'fantasy_restage_maintenance_invalid_arguments';
  end if;

  -- Must run under an owner/BYPASSRLS session: the raw table access below
  -- needs it regardless (app_private.* has all grants revoked from
  -- service_role and app.* carries FORCE ROW LEVEL SECURITY), so a
  -- non-superuser/non-BYPASSRLS caller fails loudly on the very first
  -- statement rather than silently doing nothing under RLS.
  if not (select rolbypassrls from pg_roles where rolname = current_user) then
    raise exception using errcode = 'PT403',
      message = 'fantasy_restage_maintenance_requires_bypassrls_session';
  end if;

  raise notice 'fantasy-catalog-restage-maintenance: starting for fantasy season %, football season %',
    p_fantasy_season_id, p_football_season_id;

  -- Take the SAME advisory lock api.service_stage_fantasy_catalog and
  -- api.service_rollback_fantasy_catalog take, on the football season id,
  -- for the whole remainder of this transaction. This serializes us against
  -- any OTHER call to those two RPCs (they cannot run concurrently with
  -- this maintenance transaction), but — as documented at the top of this
  -- file, and proven live against a local instance — it does NOT and
  -- CANNOT block api.create_fantasy_team, whose lock lives in a disjoint
  -- namespace. The safety net for that specific race is the fresh
  -- fantasy_catalog_in_use recheck inside service_rollback_fantasy_catalog
  -- itself, below, combined with this script's exact-id-scoped deletes.
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:catalog:' || p_football_season_id::text, 0
  ));

  -- ---------------------------------------------------------------------
  -- Step 1: BG-0048, kept deliberately narrow. Abort safely, with no
  -- changes made, if any app_private.fantasy_job_runs row exists on either
  -- FK path (season-scoped or gameweek-scoped) for the season being rolled
  -- back. No cleanup is performed here and none is added; this is
  -- intentionally out of scope for this maintenance operation.
  -- ---------------------------------------------------------------------
  select count(*) into v_job_runs_by_season
  from app_private.fantasy_job_runs run
  where run.fantasy_season_id = p_fantasy_season_id;
  if v_job_runs_by_season > 0 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_job_runs_present_season_scoped',
      detail = format('%s row(s) in app_private.fantasy_job_runs reference fantasy_season_id %s',
        v_job_runs_by_season, p_fantasy_season_id);
  end if;

  select count(*) into v_job_runs_by_gameweek
  from app_private.fantasy_job_runs run
  join app.fantasy_gameweeks gameweek on gameweek.id = run.gameweek_id
  where gameweek.fantasy_season_id = p_fantasy_season_id;
  if v_job_runs_by_gameweek > 0 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_job_runs_present_gameweek_scoped',
      detail = format('%s row(s) in app_private.fantasy_job_runs reference a gameweek of fantasy_season_id %s',
        v_job_runs_by_gameweek, p_fantasy_season_id);
  end if;
  raise notice 'fantasy-catalog-restage-maintenance: fantasy_job_runs clear on both FK paths (season=0, gameweek=0)';

  -- ---------------------------------------------------------------------
  -- Step 2: re-assert the exact expected state before touching anything.
  -- Abort loudly (no partial work) on ANY mismatch: wrong team count,
  -- an extra/unexpected team, a team owned by someone other than the 3
  -- named owners, or any dependent count that differs from what was
  -- verified immediately before this script was written/run.
  -- ---------------------------------------------------------------------
  select count(*) into v_team_count
  from app.fantasy_teams team
  where team.fantasy_season_id = p_fantasy_season_id;
  if v_team_count <> 3 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unexpected_team_count',
      detail = format('expected exactly 3 fantasy_teams for season %s, found %s',
        p_fantasy_season_id, v_team_count);
  end if;

  select count(*) into v_other_team_count
  from app.fantasy_teams team
  where team.fantasy_season_id = p_fantasy_season_id
    and team.id <> all (p_allowed_team_ids);
  if v_other_team_count > 0 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unallowlisted_team_present',
      detail = format('%s team(s) for season %s are not in the allow-listed 3 ids',
        v_other_team_count, p_fantasy_season_id);
  end if;

  select count(*) into v_bad_owner_count
  from app.fantasy_teams team
  where team.fantasy_season_id = p_fantasy_season_id
    and (team.id <> all (p_allowed_team_ids)
      or team.user_id <> all (p_allowed_owner_ids));
  if v_bad_owner_count > 0 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unexpected_owner',
      detail = 'a team id/owner pair for this season does not match the allow-listed set';
  end if;

  -- Every allow-listed id must actually exist (guards against a caller
  -- passing a stale or wrong id list that would otherwise "pass" simply
  -- because nothing unexpected was found).
  if (select count(*) from app.fantasy_teams team
      where team.id = any (p_allowed_team_ids)
        and team.fantasy_season_id = p_fantasy_season_id) <> 3 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_allowlisted_team_missing';
  end if;

  -- Count each dependent table directly, scoped to the 3 allow-listed team
  -- ids (never a broad fantasy_season_id predicate for these).
  select count(*) into v_squad_memberships
  from app.fantasy_squad_memberships squad
  where squad.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_transfer_batches
  from app.fantasy_transfer_batches batch
  where batch.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_transfers
  from app.fantasy_transfers transfer
  join app.fantasy_transfer_batches batch on batch.id = transfer.transfer_batch_id
  where batch.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_lineups
  from app.fantasy_lineups lineup
  where lineup.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_lineup_players
  from app.fantasy_lineup_players lineup_player
  join app.fantasy_lineups lineup on lineup.id = lineup_player.lineup_id
  where lineup.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_league_memberships
  from app.fantasy_league_memberships membership
  where membership.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_mutation_audit_rows
  from app_private.fantasy_mutation_audit audit
  where audit.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_leagues
  from app.fantasy_leagues league
  where league.fantasy_season_id = p_fantasy_season_id;

  if v_squad_memberships <> p_expected_squad_memberships
    or v_transfer_batches <> p_expected_transfer_batches
    or v_transfers <> p_expected_transfers
    or v_lineups <> p_expected_lineups
    or v_lineup_players <> p_expected_lineup_players
    or v_league_memberships <> p_expected_league_memberships
    or v_mutation_audit_rows <> p_expected_mutation_audit_rows
    or v_leagues <> p_expected_leagues
  then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unexpected_dependent_counts',
      detail = format(
        'squad_memberships=%s(expected %s) transfer_batches=%s(expected %s) transfers=%s(expected %s) '
        'lineups=%s(expected %s) lineup_players=%s(expected %s) league_memberships=%s(expected %s) '
        'mutation_audit=%s(expected %s) leagues=%s(expected %s)',
        v_squad_memberships, p_expected_squad_memberships,
        v_transfer_batches, p_expected_transfer_batches,
        v_transfers, p_expected_transfers,
        v_lineups, p_expected_lineups,
        v_lineup_players, p_expected_lineup_players,
        v_league_memberships, p_expected_league_memberships,
        v_mutation_audit_rows, p_expected_mutation_audit_rows,
        v_leagues, p_expected_leagues
      );
  end if;

  -- Zero-row tables the brief expects to remain empty; abort if not.
  if exists (select 1 from app.fantasy_chip_uses c where c.fantasy_team_id = any (p_allowed_team_ids))
    or exists (select 1 from app.fantasy_free_hit_snapshots s where s.fantasy_team_id = any (p_allowed_team_ids))
    or exists (select 1 from app.fantasy_rankings r where r.fantasy_team_id = any (p_allowed_team_ids))
    or exists (select 1 from app.fantasy_team_gameweek_results g where g.fantasy_team_id = any (p_allowed_team_ids))
  then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unexpected_rows_in_expected_empty_tables';
  end if;

  raise notice 'fantasy-catalog-restage-maintenance: pre-check passed — 3 allow-listed teams, % squad memberships, % transfer batches, % transfers, % lineups, % lineup players, % league memberships, % mutation audit rows, % leagues',
    v_squad_memberships, v_transfer_batches, v_transfers, v_lineups, v_lineup_players,
    v_league_memberships, v_mutation_audit_rows, v_leagues;

  -- ---------------------------------------------------------------------
  -- Step 3: FK-safe delete, scoped ONLY to the 3 allow-listed team ids.
  -- Order: transfers -> transfer_batches -> lineup_players -> lineups ->
  -- squad_memberships -> league_memberships -> mutation_audit -> teams.
  -- app.fantasy_leagues is deliberately NOT deleted here: it is cleaned up
  -- by api.service_rollback_fantasy_catalog itself (fixed by migration
  -- 20260918170000_fantasy_catalog_rollback_cleanup.sql), called in step 4
  -- below, in this same transaction.
  -- ---------------------------------------------------------------------
  delete from app.fantasy_transfers transfer
  using app.fantasy_transfer_batches batch
  where transfer.transfer_batch_id = batch.id
    and batch.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_transfers = row_count;

  delete from app.fantasy_transfer_batches batch
  where batch.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_transfer_batches = row_count;

  delete from app.fantasy_lineup_players lineup_player
  using app.fantasy_lineups lineup
  where lineup_player.lineup_id = lineup.id
    and lineup.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_lineup_players = row_count;

  delete from app.fantasy_lineups lineup
  where lineup.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_lineups = row_count;

  delete from app.fantasy_squad_memberships squad
  where squad.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_squad_memberships = row_count;

  delete from app.fantasy_league_memberships membership
  where membership.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_league_memberships = row_count;

  delete from app_private.fantasy_mutation_audit audit
  where audit.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_mutation_audit_rows = row_count;

  delete from app.fantasy_teams team
  where team.id = any (p_allowed_team_ids);
  get diagnostics v_team_count = row_count;
  if v_team_count <> 3 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_team_delete_count_mismatch',
      detail = format('expected to delete exactly 3 teams, deleted %s', v_team_count);
  end if;

  raise notice 'fantasy-catalog-restage-maintenance: deleted % transfers, % transfer_batches, % lineup_players, % lineups, % squad_memberships, % league_memberships, % mutation_audit rows, 3 teams',
    v_transfers, v_transfer_batches, v_lineup_players, v_lineups, v_squad_memberships,
    v_league_memberships, v_mutation_audit_rows;

  -- ---------------------------------------------------------------------
  -- Step 4: rollback, same transaction, using the STORED digest (never a
  -- digest recomputed anywhere else in this script).
  -- ---------------------------------------------------------------------
  select * into v_activation from app_private.fantasy_catalog_activation_runs
  where id = p_activation_run_id;
  if not found then
    raise exception using errcode = 'PT404',
      message = 'fantasy_restage_maintenance_activation_run_not_found';
  end if;
  v_stored_digest := v_activation.source_digest;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_rollback := api.service_rollback_fantasy_catalog(p_activation_run_id, v_stored_digest);
  raise notice 'fantasy-catalog-restage-maintenance: rollback result: %', v_rollback;

  -- ---------------------------------------------------------------------
  -- Step 5: preview and stage the SAME football season fresh, same
  -- transaction, fresh idempotency key. A staging failure (including the
  -- non-degeneracy guard, PT409 stale_update, or an unmet blocker) raises
  -- and rolls back this ENTIRE transaction, so the step-3 cleanup and the
  -- step-4 rollback are undone too — old squads and catalog untouched.
  -- ---------------------------------------------------------------------
  v_preview := api.preview_fantasy_catalog_activation(
    p_football_season_id, p_ruleset_code, p_expected_team_count,
    p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count
  );
  raise notice 'fantasy-catalog-restage-maintenance: preview result: %', v_preview;

  v_stage := api.service_stage_fantasy_catalog(
    p_football_season_id, p_ruleset_code,
    v_preview ->> 'sourceDigest', p_new_idempotency_key,
    p_expected_team_count, p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count
  );
  raise notice 'fantasy-catalog-restage-maintenance: stage result: activationId=%, fantasySeasonId=%, playerCount=%, sourceDigest=%',
    v_stage ->> 'activationId', v_stage ->> 'fantasySeasonId',
    v_stage ->> 'playerCount', v_stage ->> 'sourceDigest';

  perform set_config('request.jwt.claim.role', null, true);
  perform set_config('request.jwt.claims', null, true);

  return query select
    v_stored_digest,
    v_squad_memberships, v_transfer_batches, v_transfers, v_lineups, v_lineup_players,
    v_league_memberships, v_mutation_audit_rows, 3,
    v_rollback, v_preview, v_stage;
end;
$$;

comment on function pg_temp.fantasy_catalog_restage_maintenance is
  'Session-local (pg_temp) maintenance transaction body for BG-0011/BG-0032/BG-0048. '
  'Not a persistent RPC: it exists only for the calling session and disappears when the '
  'session ends. Call it under an owner/BYPASSRLS psql session and COMMIT only after '
  'reviewing its RAISE NOTICE output and returned row.';
