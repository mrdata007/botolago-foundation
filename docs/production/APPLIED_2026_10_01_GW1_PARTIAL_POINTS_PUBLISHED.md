# GW1 provisional points published (1 Oct 2026)

**Outcome: PARTIAL_POINTS_PUBLISHED_AND_VERIFIED.** One manual-worker run published the
currently available GW1 points. GW1 is still `provisional`; five fixtures are pending.

## What ran

| Item | Value |
| --- | --- |
| Workflow | `fantasy-manual-worker.yml`, ref `main` |
| Run | 36856544606, attempt 1, started 11:37:37 UTC, success. An earlier run (36854624396) failed at its guard because the enable variable was empty; it is closed evidence and was not re-run. |
| Commit | `5f2d0c3495b42c3cf62dc434d6df6c3d510cc0de` (full main SHA, re-read just before dispatch) |
| Inputs | `confirmation = RUN_FANTASY_MANUAL_WORKER`, `gameweek_id = 7fcb28c5-9b69-4591-bcda-437c6c961c5c`, `calculation_version = 19` |
| Guard | `FANTASY_MANUAL_WORKER_ENABLED: true` in the guard step's environment; guard step passed |
| Worker output | `{"outcome":"points_published","calculationVersion":19,"processedTeams":6,"reason":"remaining_fixtures_pending","calls":9}` |

Main had moved since the preview (provider-probe script and workflow, a CI change, a test
file). The worker, scoring, substitutions, its workflow and all migrations were untouched,
and the fingerprint of the 21 relevant database functions was identical, so no new audit
was needed.

## Pre-flight (immediately before dispatch)

Orchestrator `disabled_manually`; tick and live refresh `false`; no production mutation
queued, waiting or running (a read-only provider probe ran on another branch with its own
concurrency group and no production database); GW1 `provisional`, scoring input version
18; ready fixtures 705 and 708; pending 706, 707, 709, 710, 711; scoring input digest
`4520505c...fdb30` identical to the preview; events 852, gameweek points 606, team results
6, rankings 16, snapshots 18.

## Result (read from the database, not the workflow)

| Item | Before | After |
| --- | --- | --- |
| GW1 `scoring_input_version` | 18 | 19 |
| Scoring snapshots | 18 | 19 (v19, digest `4520505c...`, unsealed, players persisted) |
| Point events | 852 | 2004 (705: 1152 new; 708: 852) |
| Gameweek point rows | 606 | 623 |
| Team results | 6 | 6 (all `provisional`, calculation version 19, no final score or rank) |
| Rankings | 16 | 16 (all calculation version 19) |

- **705:** 96 player-fixtures, 94 points (appearance 54, clean sheet 42, saves 1, yellow
  cards -3). Stored events match the local preview exactly (content hash `98a577d3...`).
  No zero-minute player has any points. No rating or confidence field is read by any
  function the worker calls.
- **708:** 71 player-fixtures, 70 points. Stored events are string-identical to the
  pre-run values (hash `87c3d2e7...`). The 852 rows were updated in place (same rows,
  created before the run, `updated_at` now set); metadata churn only.
- **Gameweek points:** hash equals the preview (`c298af2d...`); 20 existing players change,
  17 new rows inserted; total 70 to 164; no `final_points`.
- **Teams:** `327d3570` 0 to 1; the other five unchanged; no automatic substitutions, no
  effective captain, bench boost counted for the three teams that used it.
- **Rankings (round and overall):** `327d3570` 5th to 2nd; `84e5a704` 2nd to 3rd;
  `3f0bbcec` 3rd to 4th; `a5fb2af2` 4th to 5th; `f8e8a444` 1st, `88c70be9` 6th,
  `d3be8b12` 7th unchanged. The league ranking is unchanged. Previous rank is the old rank.

## Protected state

About 70 tables were compared by content hash before and after. Apart from the six
scoring tables that were expected to change (snapshots, point events, gameweek points,
team results, rankings, and the GW1 row) and the heartbeat noted below, all are identical,
including the Fantasy catalog, price history, initial price evidence, free-transfer rollovers, chips,
squads, lineups (including GW2), transfers, fixtures, fixture assignments, player
mappings, memberships, player performances, coverage, notifications, notification events,
postwork, progressions, lifecycle transitions, mutation audit, idempotency keys,
automation and adaptive policy. The only other change is `fantasy_lifecycle_heartbeat`,
written by the database's own 5-minute cron tick at 11:35:00 (outcome `disabled`), which
ran before this worker started.

GW1: `provisional`, lock version 4, not finalized, `scoring_input_version` 19 (only that
column and `updated_at` changed). GW2: `scheduled`, deadline 2026-10-02 14:30 UTC,
unchanged. No finalization, price, transfer-rollover, finalized-notification or
next-gameweek write occurred.

After the run: orchestrator `disabled_manually`; tick `false`; live refresh `false`; no
unfinished cron run.

## Next blocker to GW1 completion

Fixtures 706, 707, 709, 710 and 711 have no certified statistics. Until each is certified
the worker keeps stopping at `points_published` / `remaining_fixtures_pending`, and GW1
cannot finalize. Each needs its own recovery under its own approval. GW2 transfers were
not checked and are not opened by this run.
