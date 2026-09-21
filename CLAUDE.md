# CLAUDE.md

Repository instructions for Claude Code. **[`AGENTS.md`](AGENTS.md) sits beside
this file and also applies in full** — it holds the rules that bind every
coding agent, not just this one. Read it first. In particular:

- **[One writer at a time, per database](AGENTS.md#one-writer-at-a-time-per-database)**
  — never run two agents or workflows that write to the same database at once.
- **Never rewrite published git history**, because this repository syncs to
  Lovable and a force-push destroys the owner's project history.

What follows here is the Claude-specific remainder.

## One writer at a time, per database

**This rule lives in [`AGENTS.md`](AGENTS.md#one-writer-at-a-time-per-database).**
Read it there. It is not repeated here, because two copies of a normative rule
drift apart and the reader cannot tell which one is current.

In short: never run two agents or workflows that write to the same database at
the same time, and check what is already running before any write. `AGENTS.md`
has what counts as a write, what to check first, and what happened here when
that was not done.

It is in `AGENTS.md` rather than this file so it binds every coding agent that
works in this repository, not only Claude Code.

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
