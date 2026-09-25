# Migration history in production: checked and reconciled

Audit 2026-09-24, P1-7: "23 versions renumbered, 12 with different SQL; the
repository cannot prove which SQL production runs." Checked on 2026-09-24
with read-only queries against Production V2 (`tkewgajrljbwgwedqsxn`) and a
local database built from this repository at the same migration
(`20260924190100`, production's latest).

## Result

**Production runs the repository's SQL.** The drift is in how the history
was recorded, not in the database.

| Question                                                                          | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does every recorded migration correspond to a repository file with the same code? | **Yes, all 92.** With the 23 renumberings mapped, the fingerprint of the whole history is `f708d801b13d046117a3c99a4e979962` on both sides.                                                                                                                                                                                                                                                                                                                                                                                    |
| The 12 "different SQL" migrations?                                                | Same code. 11 differ only in comments, blank lines and indentation; `fantasy_prizes` also has the apply wrapper's two `set local` timeouts recorded before it.                                                                                                                                                                                                                                                                                                                                                                 |
| Does production's schema equal the repository's?                                  | **Yes.** 3,900 objects compared (functions with their grants, tables, columns, constraints, indexes, row-security policies, triggers, types, views, schema grants, pg_cron jobs). All equal except six function bodies, and those differ only in comment lines: `fantasy_gameweek_summary`, `fantasy_league_standings`, `fantasy_leagues`, `fantasy_overall_standings`, `fantasy_player_season_stats`, `get_my_fantasy_points` (the tool that applied them dropped their comments). Their code lines and grants are identical. |
| Anything recorded in production that the repository does not have?                | No.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### The history, row by row

| Recorded                                   | Count | What it means                                                                                                                                     |
| ------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same version, same code                    | 62    | as expected                                                                                                                                       |
| Same version, stored split into statements | 7     | the 2026-08-01/02 migrations, applied with the Supabase CLI, which records statements separately; same code once statement splitting is set aside |
| Different version, same code               | 23    | renumbered at apply time; listed in `scripts/backend/production-migration-aliases.json`                                                           |
| Not yet recorded                           | 7     | the 2026-09-24 launch fixes (`20260924200000`-`200600`), applied by `scripts/backend/apply-20260924-launch-fixes.sql`                             |

## What was decided, and why

Forward-only, and nothing in production changes:

- **Production's history stays as it is.** It is the true record of what
  ran, and when. Re-recording 23 rows under the repository's versions would
  rewrite that record for no change in behaviour, and a mistake there would
  make every later history check wrong.
- **No repository migration is renamed.** Staging, CI and every local
  database recorded them under the repository's versions.
- **The renumberings are written down**, machine-readable, in
  `scripts/backend/production-migration-aliases.json`: repository file,
  production version, and what differs in the recorded text. A history
  check reads it (below), and a test keeps it honest (each entry names a
  real migration file; no production version collides with a repository
  version).
- **No corrective migration is needed**: there is no schema difference to
  correct. (Restoring the six functions' comments would be cosmetic; not
  worth a production write.)

## How to check again

Both checks only read. They need a database connection that can read the
catalogue and `supabase_migrations` (the SQL editor works: paste the file,
export the result as TSV).

```bash
# 1. The history: every recorded migration is a repository file with the same code.
psql "$PRODUCTION_DB_URL" -At -F $'\t' -f scripts/backend/sql/migration-ledger.sql > ledger.tsv
bun scripts/backend/migration-ledger-compare.ts ledger.tsv
#   matched / split / aliased / pending are fine; unknown or different exits 1.

# 2. The schema: production against a local build at the same migration.
#    (Move the not-yet-applied migrations aside first, as
#    scripts/backend/rehearsals/production-gw1-mirror-2026-09-24.sql explains.)
supabase db reset --local
psql "$LOCAL_DB_URL" -At -F $'\t' -f scripts/backend/sql/schema-fingerprint.sql > local.tsv
psql "$PRODUCTION_DB_URL" -At -F $'\t' -f scripts/backend/sql/schema-fingerprint.sql > production.tsv
bun scripts/backend/schema-fingerprint-compare.ts local.tsv production.tsv
```

Expect the six comment-only function differences above until one of those
functions is next replaced by a migration.

## What is left

1. **Make one path apply migrations.** The promoter
   (`scripts/backend/phase7e-production-migration-promoter.py`) compares
   production's history with the repository's version by version, so it has
   refused since the renumbering. Teaching it to read
   `production-migration-aliases.json` and to accept the `dense` match for
   the seven CLI-split rows would let it be the only way migrations reach
   production again. It writes to production, so it deserves its own
   reviewed change and a rehearsal. Until then, migrations go through
   guarded, owner-run apply scripts like `apply-20260924-launch-fixes.sql`,
   which refuse to run unless production's latest migration and the
   functions they replace are exactly what they were reviewed against.
2. **Never apply through a tool that picks its own version or strips
   comments.** The 23 renumbered rows and the six comment-less functions
   came from one; its record is still correct code, but under versions no
   file has.
3. **Unique timestamps across open branches.** `supabase/migrations` must
   not repeat a version (`bun run backend:migrations:check`). On
   2026-09-24, branch `claude/sleepy-bell-x1erlv` adds
   `20260924120000_fantasy_league_invite_code_reset.sql`, the version
   `main` already uses for `fantasy_prizes`; it needs a new number before it
   merges.
