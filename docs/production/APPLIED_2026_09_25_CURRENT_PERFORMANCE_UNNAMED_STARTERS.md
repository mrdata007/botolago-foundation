# Production: this season's match statistics follow last season's unnamed-starter rule (2026-09-25)

Migration `20260925110000_current_performance_unnamed_starters` (PR #206) was
applied to Production V2 (`tkewgajrljbwgwedqsxn`) on 2026-09-25 at about 08:41
UTC, by Claude Code, on the owner's decision that morning ("use last season's
rule").

The file is now applied and must not be edited. A change is a new migration.

## Why

The first finished match of the season, Amal Tiznit 1–3 Ittihad Tanger
(SportsMonks fixture 19874708, 24 September), has 3 starters and 4 other lineup
rows that SportsMonks has not identified (no `player_id`). This season's import
accepted none, so the match's player statistics could not be imported and
Gameweek 1 could never be scored. The cause was found by orchestrator run #42
(the diagnostics added in #205): `current_lineup_unidentified_players`,
3 starters and 4 others.

Last season's import already accepts up to 4 unnamed starters (BG-0011
option B). Since this migration, this season does too: unnamed rows are left
out and credited to no one, every named player is kept, and a match with more
than 4 unnamed starters still waits.

## How

[`apply-20260925110000-current-performance-unnamed-starters.sql`](../../scripts/backend/apply-20260925110000-current-performance-unnamed-starters.sql),
run whole. It holds the two match-statistics tables for its whole transaction
(review on #206: the season orchestrator runs on GitHub's schedule, which the
clock cannot keep apart from the SQL editor) and refuses while the Fantasy tick
is on.

| When (UTC) | What                                                                                                                                             | Result                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 08:33      | Checked first: no workflow touching production running (only #206's CI, on its own local database), no other database session                    | —                                                                                                                                   |
| 08:34:00   | Fantasy tick paused (`fantasy_automation_configure(false)`)                                                                                      | —                                                                                                                                   |
| ~08:35     | Rehearsal of the merged script's final text (before merge)                                                                                       | passed and rolled back: all 240 stored coverage rows satisfy the new rules; the scoring check took 3 unnamed starters and refused 5 |
| ~08:35     | Re-read                                                                                                                                          | no history row; both functions and both rules still the old versions; no lock left                                                  |
| 08:35:47   | Fantasy tick back on                                                                                                                             | —                                                                                                                                   |
| 08:40      | #206 merged; checked again: no workflow running or queued, no other database session. Baseline: 240 coverage rows, 9,258 player performance rows | —                                                                                                                                   |
| 08:40:24   | Fantasy tick paused                                                                                                                              | —                                                                                                                                   |
| ~08:41     | Apply (`commit;`)                                                                                                                                | "Applied"; the postflight passed                                                                                                    |
| 08:42:06   | Re-read                                                                                                                                          | see below                                                                                                                           |
| 08:42:09   | Fantasy tick back on                                                                                                                             | —                                                                                                                                   |

**After**, re-read:

- History row `20260925110000 current_performance_unnamed_starters`; its
  recorded text's sha256 is the repository file's (`5db2eb08…`).
- `api.ingest_current_player_fixture_performance` md5 `9b0c8142476872f853e06ce730fa68f8`
  (was `6b182b4d…`); `app_private.fantasy_validate_scoring_document` md5
  `72e4c37911bac985d08267e430569e4e` (was `6fe413ab…`).
- `historical_performance_coverage_counts_check` md5 `f6255a0a74e4b95d5a216a0a5271b905`
  (was `54f6b72a…`); `current_performance_coverage_complete_check` md5
  `fe04459bb2eb9cdb9e3414f8ce151913` (was `cc407f26…`).
- Still 240 coverage rows and 9,258 player performance rows: nothing stored
  changed. Only the service role may call the import; no lock left.

## The first import under the rule

The unnamed players no longer stop the import. The next check does.

- **Season orchestrator run #43** (08:42 UTC, on `6a39ded`) was green and still
  imported nothing: `performances.error` is now `current_statistics_incomplete`
  for fixture 19874708, where run #42 had `current_lineup_unidentified_players`.
- **"Ingest current finished Football performances" run #1** (08:43 UTC, on
  the same commit; its first run ever) failed the same way. Its evidence keeps
  the full diagnostic, so it shows which statistics are missing, and for how
  many of the 28 named players:

  | Statistic (SportsMonks type)  | Rows without it |
  | ----------------------------- | --------------- |
  | goals (52)                    | 25              |
  | assists (79)                  | 26              |
  | red cards (83)                | 28              |
  | yellow cards (84)             | 25              |
  | second-yellow dismissals (85) | 28              |
  | goals conceded (88)           | 9               |
  | penalties missed (112)        | 28              |
  | minutes played (119)          | 5               |
  | own goals (324)               | 28              |

Nothing was written by either run: both stop before the first write.

SportsMonks sends a statistic only when it is not zero. Only the 3 scorers
carry goals, and only the substitutes who came on carry minutes. Last season's
238 accepted fixtures agree: 19,649 statistic rows for 9,258 players, about 2
per player out of the 13 requested. This season's import requires every one
of 9 statistics on every named player ("missing never becomes zero"), so it
refuses every real match. It had never run on one before today. How a missing
statistic should count is the owner's decision; until it is made, Gameweek 1
cannot be scored. Scoring is not due until its last match, on 27 September.
