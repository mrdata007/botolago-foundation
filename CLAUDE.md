# CLAUDE.md

Repository instructions for Claude Code. `AGENTS.md` sits beside this file and
also applies — in particular its rule against rewriting published git history,
because this repository syncs to Lovable and a force-push destroys the owner's
project history.

## One writer at a time, per database

**Never run two agents or workflows that write to the same database at the same
time. Before any database write, check that nothing else is writing.**

This is not a style preference. Concurrent writers to one database produce
failures that are expensive in a way ordinary bugs are not: the damage lands in
production data rather than in code, a rollback does not exist for what the
other writer already committed, and the symptom usually surfaces somewhere far
from the cause — a migration that half-applied, a guard that tripped on a row
another lane had just changed, an "idempotent" script that was idempotent only
against the state it expected.

### What counts as a write

Any `insert`, `update`, `delete`, `alter`, `create`, `drop`, `grant`, `revoke`,
a migration promotion, an RPC that mutates, a seed or backfill script, a
workflow or GitHub Action that touches the database, and `supabase db reset` or
`db push` against anything shared. Reads are free — `select`, `execute_sql`
inspection, `pg_get_functiondef`, `EXPLAIN` — and most verification should be
built out of them.

### Before writing

1. **List what is running.** Check for in-flight agents, subagents, workflows
   and scheduled jobs. An agent you launched twenty minutes ago and forgot is
   the usual culprit.
2. **Read what they touch.** A lane's brief says which files it owns; a lane
   confined to `src/` cannot write to the database, and a lane owning
   `supabase/migrations/` or `scripts/backend/` can. Frontend lanes are safe to
   run alongside a write; backend lanes are not.
3. **Check the scheduled jobs too.** Cron-triggered workflows write without
   anyone starting them. In this repository that means the fantasy season
   orchestrator and the football recovery run on their own schedules, and the
   news ingestion schedules are stood down but still dispatchable by hand.
4. **Serialise, do not overlap.** If something else is writing, wait for it.
   Splitting a write into "small enough to be safe" is not a mitigation.

### When you are the writer

Say so plainly in your report — which database, what changed, and what you
checked before starting. Take a baseline read immediately before the write and
compare immediately after, so "nothing else changed underneath me" is a
measurement rather than an assumption. Production writes additionally follow
the rules below.

## Production database writes

Production is `tkewgajrljbwgwedqsxn` (BotolaGO Production V2). Touch it only
through the reviewed migration path
(`docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`) or a guarded SQL
script the owner runs. Do not execute a production write on your own
initiative; when the owner authorises one, the authorisation covers that
operation and not the next one.

Dry-run first. A `DO` block is a single transaction, so running the real code
path and ending it with a deliberate `raise` that carries the computed state out
in its message exercises every guard and rolls the whole thing back — then
re-read to confirm the rollback held before executing for real.

Never loosen a guard to make a script run. A guard firing means the world is not
in the state the script assumes, and the answer is to find out why.

## Migrations

Forward-only: never edit a migration that has been applied anywhere. A migration
that is still pending in an unmerged branch is a different case — fixing it in
place is correct and better than stacking a patch on top, but confirm it is
unapplied first by checking `supabase_migrations.schema_migrations` rather than
assuming.

Migration timestamps must be unique; `bun run backend:migrations:check` rejects
duplicates. Two lanes picking the same timestamp has already happened here, so
assign distinct slots when several are in flight.

## Evidence

Do not claim a test passed that you did not execute. If Docker is unavailable
and pgTAP could not run, say so and describe what you did instead. CI's
`database-quality` job is the authority for database tests.

Measure rather than assert: `scrollWidth === clientWidth` misses overflow when
`html, body { overflow-x: clip }` is set, contrast must be read from rasterised
sRGB because `oklch` does not parse naively, and a Playwright run against
another worktree's dev server on a shared port measures the wrong tree
entirely — all three have produced false results in this project.
