# Production: missing SportsMonks statistics count as zero, goals conceded follow the final score (2026-09-25)

Migration `20260925120000_current_performance_goals_conceded_check` was applied
to Production V2 (`tkewgajrljbwgwedqsxn`) on 2026-09-25 at 12:17 UTC by Claude
Code. It merged in #209 and was corrected in place by #211 while it was still
unapplied everywhere. The importer half is on `main` since #211 (`8aea20b`).
The owner delegated the decision that morning at 09:00 UTC. Asked whether a
statistic SportsMonks leaves out should count as zero, they answered "you
decide".

The file is now applied and must not be edited. A change is a new migration.

## Why

SportsMonks sends a statistic only when it is not zero. This season's import
required every statistic on every player, so it refused the first finished
match, Amal Tiznit 1–3 Ittihad Tanger (SportsMonks fixture 19874708), with
`current_statistics_incomplete`, and Gameweek 1 could not be scored. See
[APPLIED_2026_09_25_CURRENT_PERFORMANCE_UNNAMED_STARTERS.md](APPLIED_2026_09_25_CURRENT_PERFORMANCE_UNNAMED_STARTERS.md).
A missing statistic now counts as zero, under checks that absence cannot pass.
Goals conceded, which decide clean sheets, are checked against the final
score. The rules are in
[CURRENT_FINISHED_FIXTURE_PERFORMANCES.md](../backend/CURRENT_FINISHED_FIXTURE_PERFORMANCES.md).

## How

[`apply-20260925120000-current-performance-goals-conceded.sql`](../../scripts/backend/apply-20260925120000-current-performance-goals-conceded.sql),
run whole through the Supabase MCP connection. It holds both match-statistics
tables for its whole transaction. It refuses while the Fantasy tick is on, and
while a pg_cron job is running.

| When (UTC) | What                                                                                                                                                                                                                                                                 | Result                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 12:14:08   | Checked first: `20260925120000` not applied; import md5 `9b0c8142…`, as `20260925110000` left it; Fantasy tick on; 9,258 player performance rows (all active), 240 coverage rows; no other database session, no pg_cron job in flight, no workflow running or queued | —                                                                     |
| 12:14:16   | Fantasy tick paused (`fantasy_automation_configure(false)`)                                                                                                                                                                                                          | —                                                                     |
| 12:15:52   | Rehearsal of `main`'s script                                                                                                                                                                                                                                         | "Rehearsal passed", rolled back                                       |
| 12:16:04   | Re-read                                                                                                                                                                                                                                                              | nothing saved: no history row, import md5 unchanged, counts unchanged |
| 12:17:16   | Apply (`commit;`)                                                                                                                                                                                                                                                    | "Applied"; the postflight passed                                      |
| 12:19:03   | Re-read                                                                                                                                                                                                                                                              | see below                                                             |
| 12:19:09   | Fantasy tick back on                                                                                                                                                                                                                                                 | —                                                                     |

**After**, re-read:

- History row `20260925120000 current_performance_goals_conceded_check`; its
  recorded text's sha256 is the repository file's (`08c6d778…`).
- `api.ingest_current_player_fixture_performance` md5
  `26798616b8b574486d5ae4e2c59e6b91` (was `9b0c8142…`). The local rehearsal
  on PostgreSQL 16 gave the same md5.
- Only the service role may call it. `anon` and `authenticated` may not.
- Still 240 coverage rows and 9,258 player performance rows: nothing stored
  changed.

## The first import under the rule

At 12:19:54 there was no pg_cron job in flight, no other database session, and
no workflow running or queued. "Ingest current finished Football performances"
run #2 (`36134333391`) ran at 12:20 UTC on `8aea20b`.

- Its tests passed. SportsMonks' statistics for fixture 19874708 passed every
  importer check. Every starter carries minutes, no substitute without minutes
  carries a goal or a save, and the match has a final score.
- The database refused it with `PLAYER_MEMBERSHIP_NOT_FOUND`. A named player is
  not listed this season at the club they played for.
- Nothing was written. At 12:25 there were still 240 coverage rows and 9,258
  performance rows, none of them for this fixture, and the last performance
  write was on 19 September.

The season orchestrator runs the same import every hour. It records this
refusal as `waiting` and stays green, as run #43 did with the previous one, so
it raises no alert.

## Why: this season's player list is last season's

The 539 players Fantasy offers, and the clubs they are listed at, were
carried over on 17 September. That is step 3 of
[FANTASY_2026_27_BRIDGE_ACTIVATION.md](../backend/FANTASY_2026_27_BRIDGE_ACTIVATION.md).
SportsMonks had no squads yet for the promoted clubs. So 13 clubs kept their
2025/26 SportsMonks squads, MA Tétouan kept its 2024/25 squad, and Amal Tiznit
and Widad Témara got hand-typed public lists. Summer transfers are not in it.

Of the 28 players SportsMonks names in the first match (7 more are unnamed and
are left out by rule):

| In BotolaGO's list                  | Players | Who                                                                                                                                                                                                                                  |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| at the club they played for         | 10      | all Ittihad Tanger                                                                                                                                                                                                                   |
| at another club                     | 7       | for Amal Tiznit: M. El Jourbaoui (listed at CR Khemis Zemamra), J. Assouab (Kawkab Marrakech), M. Goulouss and Y. Anouar (CODM Meknès), Y. Zraa (UTS Rabat); for Ittihad Tanger: B. Abyir (Hassania Agadir), S. Khorsa (Maghreb Fès) |
| known, but with no club this season | 2       | Y. Najjari, S. Ahannach (Ittihad Tanger)                                                                                                                                                                                             |
| not matched                         | 9       | SportsMonks gives them an id that no BotolaGO player carries                                                                                                                                                                         |

The lineup has 16 rows BotolaGO cannot match: these 9 and the 7 that
SportsMonks leaves unnamed. 8 of the 16 are Amal Tiznit players typed into the
list by hand under the same name, but never linked to SportsMonks. The other 8
(2 for Amal Tiznit, 6 for Ittihad Tanger) are not in the list at all.

The import requires every named player to be in the list, at the club they
played for (`PLAYER_MAPPING_NOT_FOUND`, `PLAYER_MEMBERSHIP_NOT_FOUND`). So each
of these 18 players stops it on their own. That guard is right: the list is
wrong, and the import has not failed. Beyond the import:

- Fantasy credits a player only with their listed club's matches
  (`app_private.fantasy_scoring_input_document`). So a player listed at their
  old club would score nothing, even once their statistics are in. None of the
  7 is in a Fantasy squad today. There are 6 Fantasy teams.
- Managers cannot pick the 8 players missing from the list or the 2 without a
  club, because they are not in the Fantasy pool. The hand-typed Amal Tiznit
  and Widad Témara players are in it, but no statistics can reach them until
  they are linked to SportsMonks.
- The regular squad import cannot correct the list. It refuses by design once
  the Fantasy catalog is staged (`fantasy_catalog_already_staged`), so the
  bridge's limitation 3 ("the normal run supersedes these memberships") cannot
  happen on its own. The lineup-names runbook reached the same point for the
  Compos tab
  ([APPLY_2026_09_25_LINEUP_NAMES.md](APPLY_2026_09_25_LINEUP_NAMES.md),
  "Later: the player list itself").

## What this blocks, and by when

- Every Gameweek 1 match is likely to stop the same way. The list has none
  of the summer's transfers, and the first match alone had 18 players it
  could not place. Gameweek 1 cannot be scored until the list is corrected.
- Gameweek 2 opens only once Gameweek 1 is finalized, and only before its own
  deadline, 2 October 14:30 UTC
  (`api.service_prepare_next_fantasy_gameweek`:
  `fantasy_previous_postwork_incomplete`, `fantasy_next_gameweek_not_openable`).
- Correcting the list changes what Fantasy offers, and which matches earn a
  player points. It is the owner's decision. Nothing has been changed.
