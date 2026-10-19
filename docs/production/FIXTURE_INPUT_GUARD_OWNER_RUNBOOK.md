# Finalizing fixture and performance input guard

Candidate migration `20261019073221_fantasy_finalizing_fixture_performance_guard`.
Not applied to staging or production. This addresses the remaining fixture and
performance-import gap described in
[FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md](FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md).

An ordinary correction of a score, fixture state or active performance must not
invalidate a gameweek's sealed scoring input while it is `finalizing`. The new
table triggers refuse that write with `PT409 fantasy_scoring_inputs_frozen`.
The ingest can retry after finalization; existing reviewed correction procedures
still govern changes to official points. This migration never reopens a gameweek,
changes a score, rewrites a snapshot or bypasses an existing guard.

## Covered writes

- `app.fixtures`: changes to identity, competition/season, clubs, kickoff,
  status, scores, finalization and source sequence/version; deletion.
- `app.player_fixture_performances`: insertion, deletion or changes involving
  an active row. Inactive-only rows do not enter the scoring document.
- `app_private.historical_performance_fixture_coverage`: insertion, deletion,
  or changes to coverage facts.

The guard looks at both the old and new fixture for moved performance/coverage
rows. It includes current assignments whose `counts_points` is false, because
legacy scoring documents include those fixtures too. Unassigned fixtures and
unrelated gameweeks keep working. No-op writes and the observation timestamps
explicitly excluded by the scoring document remain writable.

These are table triggers, so every existing importer and direct owner statement
uses the same protection. Catalog, membership and lineup guards from
`20261016110000` remain unchanged. This is not a claim that all possible manual
edits to every scoring configuration table are covered.

## Lock ordering

Finalization locks its gameweek, then the fixtures (`fantasy_assert_scoring_snapshot`
uses `FOR SHARE`). A fixture row trigger already has its fixture row locked.
Waiting for the gameweek there could make the two sessions wait for each other.

The helper therefore takes `FOR KEY SHARE NOWAIT` on assigned, nonterminal
gameweeks in UUID order. If ingestion gets that lock first, finalization waits
until the import commits and seals the resulting facts. If finalization owns the
row first, ingestion refuses promptly and rolls back; it can retry later. A busy
exclusive gameweek operation can also cause this transient refusal. No timeout
or isolation setting is changed. PostgreSQL's
[row-lock compatibility rules](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS)
and the actual two-session checks below are the basis for this choice.

## Verification contract

The pgTAP test uses real tables and triggers. It compares the complete scoring
input document's SHA-256 before and after rejected corrections and permitted
metadata writes, verifies unchanged stored facts, and checks the ordinary retry
path and inaccessible helper privileges.

`python3 scripts/backend/check-fixture-input-locking.py` accepts no database URL
or credentials. It addresses only the local Supabase Docker container and creates
then removes its synthetic world. Four controlled races cover fixtures and
performances, in both acquisition orders:

1. Import first: the finalizer is observed blocked, then reads the committed
   correction after the writer releases its transaction.
2. Finalizer first: the importer must return the freeze error within two seconds,
   the finalizer must still acquire its fixture share lock, and the input remains
   unchanged.

The PostgreSQL deadlock counter must not increase. CI runs this after pgTAP on
its disposable stack. Current results will be recorded after execution; no local
or hosted pass is implied by this runbook.

## Staging and production sequence

1. Complete the current staging load window and verify exact cleanup.
2. Review the candidate, require green database/application CI and clear review
   threads. Confirm the migration is absent in both hosted histories before any
   edit or application.
3. On staging, follow plan → rollback rehearsal → verify rollback → apply.
   Preserve the existing one-writer baseline and switches. Exercise the freeze
   errors and retry behavior with an isolated synthetic fixture, then restore it.
4. Prepare the production operation through
   [the migration release runbook](../backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md).
   Production application needs the owner's separate approval for this operation.
   A rehearsal still counts as a database writer. Do not execute it alongside
   ingestion, the worker or another production operation.
5. Re-read history and enabled trigger/function definitions. Observe an actual
   subsequent finalization and ingestion retries; a successful apply alone does
   not prove production behavior.

If a guard fires, determine whether the gameweek is finalizing or an exclusive
operation briefly owns its row. Wait for the legitimate writer, inspect a stuck
finalization through the existing snapshot evidence, and retry. Do not turn off
or remove the guard to make an import pass. Removal, if ever approved, is a new
forward migration, never an edit of an applied migration.
