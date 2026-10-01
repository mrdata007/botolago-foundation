# GW1 scoring impact preview (1 Oct 2026, read-only)

**Verdict: SAFE_FOR_PARTIAL_SCORING_APPROVAL**, with one execution precondition
(the `FANTASY_MANUAL_WORKER_ENABLED` variable, which this session cannot read).
Nothing was written to production. The manual worker was not run.

The manual worker is **gameweek-scoped**, not fixture-scoped. One run re-scores every
fixture that is currently ready in GW1 (705 and 708), not only 705.

## How this was produced

- Production state read through read-only transactions (`begin read only` ... `rollback`).
- The worker's scoring input was rebuilt from the same database function the worker's
  snapshot call uses (`app_private.fantasy_scoring_input_document`, a STABLE function).
  The snapshot call itself (`api.service_get_fantasy_scoring_snapshot`) was **not**
  called: it inserts a snapshot row when none exists for the version.
- That input (211 players, 167 player-fixture rows, 6 lineups) was copied to the local
  machine and checked against database checksums (players `679f3d61...`,
  fixture rows `4ee57032...`, lineups `02441be1...`: all equal).
- The repository's own `calculateSnapshotResults` (the code in
  `scripts/backend/fantasy-lifecycle-runner.ts`) was run on it in memory. The
  database's persist-time checks (effective captain, multipliers, team totals,
  substitutions) were re-derived independently: 0 mismatches.
- The worker's tests (`fantasy-lifecycle-runner`, `scoring`, `substitutions`: 48 tests)
  were run locally and passed. This is not a replacement for CI.
- Not executed: the database's persist and ranking functions themselves. Their write set
  below comes from reading their source, not from running them.

## 1. Boundary (checked 10:5x UTC)

Orchestrator `disabled_manually`; no production run queued or running (the only running
job was a CI check on draft PR 257); tick and live refresh `false`; no active writer or
unfinished cron run; main `a4ca3abd...` and the worker code identical to the reviewed
`03d34c3e`. Performance 9466, coverage 242, events 852, gameweek points 606, snapshots 18:
all content hashes equal to the post-canary state.

## 2. Exact worker inputs

| Item | Value |
| --- | --- |
| GW1 id | `7fcb28c5-9b69-4591-bcda-437c6c961c5c` |
| Status / points state | `provisional` / `provisional` |
| Lock version | 4 |
| Scoring input version | 18 |
| `adaptiveScoringEnabled` | false (adaptive policy has 0 rows) |
| `incrementalScoringEnabled` | true (live-scoring policy enabled for the season) |
| Latest snapshot | v18, digest `956563d0...`, unsealed |
| Current input digest | `4520505c83be9656a58ec0b2e22f8e10a39dad48d81fe45c75a4d284f89fdb30` (differs: 705 arrived) |
| **Calculation version the worker will use** | **19** (`service_prepare_fantasy_live_scoring`: digest differs from v18, so `greatest(18 + 1, 18, 1)`; the workflow input only seeds it and is overwritten) |
| Current persisted | 852 events (all 708), 606 gameweek-point rows, 6 provisional team results, 16 ranking rows, 0 auto-substitutions |
| `FANTASY_MANUAL_WORKER_ENABLED` | **not readable here.** Four 27 Sep runs of the same workflow succeeded, so it was `true` then. If false now, the job fails at its first guard before touching the database. |

## 3. The scoring snapshot (what the worker would consume)

| GW1 fixture | State | Class |
| --- | --- | --- |
| 19874705 | finished 0-0, 40 performance rows, coverage accepted | certified, included, not yet scored |
| 19874708 | finished 1-3, 35 performance rows, coverage accepted | certified, included, already scored (provisional) |
| 19874706, 707, 709, 710, 711 | finished, no performance or coverage | pending: `fantasy_scoring_coverage_incomplete` |
| 19874704 | postponed, assignment superseded, does not count | deferred, excluded |

- Player-fixture rows scored: 167 (96 for 705, 71 for 708). The 56 extra 705 rows are
  Fantasy players of the two clubs with no performance record: all-zero statistics.
- Fantasy players in the document: 623; held in GW1 lineups: 55 distinct; held in
  pending fixtures (`pendingPlayerIds`): 40; pending fixtures: 5.
- Fantasy teams: 7 active; 6 have a locked GW1 lineup (one has none).
- Snapshot sealed: no (v19 would be created unsealed).
- Scoring mode: not adaptive; every included fixture uses the fixed v1.1 ruleset; no
  Simple Mode involved. Goal reconciliation returns `[]` (clean).
- Participation known for every held player: **no**. 40 of 55 held players are in
  pending fixtures.

## 4. Predicted result (local, in memory)

**Existing 708 points:** all 71 player-fixtures produce exactly the stored 12 category
values (0 differences). The 852 events would be updated in place: same ids, same
points, same source sequence, same `provisional` state. They are not replaced or
versioned. They are **not byte-identical**: the persist step first marks them superseded
and then restores them in one transaction, and a trigger stamps `updated_at` on every
update.

**705 points (total 94):** appearance 54, clean sheet 42, saves 1, yellow cards -3;
no goals, assists, penalties, own goals or reds.

| Position | Rows | Players with minutes | Points |
| --- | --- | --- | --- |
| GK | 10 | 2 | 13 |
| DEF | 28 | 9 | 38 |
| MID | 41 | 14 | 32 |
| FWD | 17 | 7 | 11 |

- 32 players appeared (22 starters + 10 who came on), 8 unused with 0 minutes, 56
  club players with no record. **Zero-minute players with any points: 0**; with
  appearance points: 0.
- Clean sheets: 22 players had a clean-sheet flag with 60+ minutes: GK 2 (4 each), DEF 6
  (4 each), MID 10 (1 each), FWD 4 (0 points). Players under 60 minutes get no clean
  sheet (the three defenders who played 17, 17 and 4 minutes get appearance points only).
- Goalkeepers: the two starting keepers had 1 save (0 points, since 1 per 3 saves; total
  6) and 5 saves (+1; total 7). The 5-save keeper is the new player 37947231. No penalty
  saves.
- Yellow cards: three players (-1 each).
- The 17 new players: all 17 have a snapshot row equal to their imported 705 performance
  row; 12 score points (39 in total), 5 unused score 0. **No rating or confidence field
  appears in the scoring input or in any function the worker calls** (the only rating
  columns are `fantasy_initial_price_evidence` and the unscored `provider_rating`). The
  catalog opening rating 6 / confidence 0 has no effect on match scoring.

**Gameweek points rows:** 606 existing rows are rewritten (calculation version 18 to
19). Values change for 20 existing players (0 to 1..6, 55 points) and 17 new rows are
inserted (39 points). Sum of player points 70 to 164 (+94).

**Teams (provisional score, current to predicted):**

| Team | Chip | Score | Effective captain | Notes |
| --- | --- | --- | --- | --- |
| 327d3570 | bench boost | 0 to **1** | none | one starter (DEF, 17 min) scores 1 |
| 3f0bbcec | none | 0 to 0 | none | |
| 84e5a704 | bench boost | 0 to 0 | none | |
| 88c70be9 | none | 0 to 0 | none | |
| d3be8b12 | none | -4 to -4 | none | transfer hit 4 |
| f8e8a444 | bench boost | 1 to 1 | none | bench point from 708 |
| a5fb2af2 | none | no GW1 lineup | | gets no result row |

All six teams hold players from pending fixtures (11 to 14 of 15), so the worker applies
**no automatic substitutions** and does not promote any vice-captain. No captain has
recorded minutes in 705 or 708, so the captain bonus is 0 for all six teams. Bench boost
counts the bench for the three teams that used it.

**Rankings (round and overall):** `327d3570` moves 5th to 2nd; `84e5a704` 2nd to 3rd;
`3f0bbcec` 3rd to 4th; `a5fb2af2` 4th to 5th. Unchanged: `f8e8a444` 1st (level on 1 point
with `327d3570`, and wins the tie-break), `88c70be9` 6th, `d3be8b12` 7th; the one league ranking is
unchanged. All 16 ranking rows are rewritten at version 19, with the previous rank set to
the old rank.

## 5. Where one run stops

Trace of `runFantasyLifecycle` on current state: state `provisional`; adaptive off so no
mode selection; no lifecycle advance (status is not open, locked or live);
`service_prepare_fantasy_live_scoring` returns 19; snapshot v19 is created (unsealed);
`pendingFixtures` has 5 entries, so `incrementalPending = true`; results are persisted;
`publishRankings`; return **`outcome = points_published`, `reason = remaining_fixtures_pending`,
`processedTeams = 6`**.

The finalization calls (`service_begin_fantasy_finalization`,
`service_finalize_fantasy_team_results`, `service_restore_free_hit`,
`service_roll_fantasy_free_transfers`, `service_complete_fantasy_gameweek`) sit after the
pending check and are unreachable while any fixture is pending. The price batch,
finalized notifications, postwork, prize evaluation and `service_prepare_next_fantasy_gameweek`
are reachable only from the `finalized` branch or after finalization. A second guard in the
database also refuses finalization while anything is pending
(`fantasy_live_scoring_pending`). No other path was found that finalizes GW1, opens GW2,
rolls transfers, moves prices or sends finalized notifications. Pending clears only if
706, 707, 709, 710 and 711 are each certified, which needs ingestion the worker does not do.

## 6. Write set

**Expected:**
- `app.fantasy_gameweeks` GW1: `scoring_input_version` 18 to 19 (and `updated_at`).
- `app_private.fantasy_scoring_snapshots`: 18 to 19 rows (v19, unsealed, players persisted).
- `app.fantasy_player_point_events`: 852 to 2004 (852 updated in place, +1152 for 705).
- `app.fantasy_player_gameweek_points`: 606 to 623 (606 rewritten, +17).
- `app.fantasy_team_gameweek_results`: 6 rows rewritten (state stays `provisional`).
- `app.fantasy_auto_substitutions`: delete and re-insert of 0 rows (no change).
- `app.fantasy_rankings`: 16 rows rewritten.

**Not expected** (checked in the function source and triggers): final results, `final_*`
points, sealed snapshots, prices and price history, free-transfer rollover, the next
gameweek, notifications, the Fantasy catalog, player performances, fixtures, coverage,
deadlines or gameweek status. The only triggers on these tables set `updated_at`; the
gameweek deadline triggers act only when the deadline changes; none of the tables is in a
realtime publication.

## 7. Inputs for a real run

| Input | Value |
| --- | --- |
| Workflow | `.github/workflows/fantasy-manual-worker.yml`, ref `main` |
| `expected_commit` | the full main SHA at dispatch (now `a4ca3abdef9e5f9d5b3e44ba0df09dcf3e27a111`); re-read first |
| `gameweek_id` | `7fcb28c5-9b69-4591-bcda-437c6c961c5c` |
| `calculation_version` | `19` |
| `confirmation` | `RUN_FANTASY_MANUAL_WORKER` |

## 8. Stop conditions for a real run

- Any outcome other than `points_published` / `remaining_fixtures_pending` with
  `processedTeams = 6`, or any refusal code: stop, inspect, no retry.
- Main moved and the change touches the worker, scoring or lifecycle code.
- Orchestrator not `disabled_manually`; tick or live refresh not `false`; a queued or
  running production mutation.
- The scoring input changed since this preview (a fixture newly certified or any lineup
  or catalog change): the digest check refuses with `fantasy_scoring_input_changed`.
- After the run, anything other than: events 2004, gameweek points 623, snapshots 19,
  6 team results, 16 rankings, GW1 `provisional`, no sealed snapshot, no `final_*` values,
  GW2 `scheduled` with deadline unchanged, tick and live refresh `false`.

If a failure happens after the snapshot is created, a retry with version 19 is safe: the
version, snapshot and persist step are idempotent. It still needs its own approval.

## 9. What this does not decide

The run makes provisional GW1 points and the new rankings visible to users (one team
moves from 5th to 2nd on one point). It says nothing about GW2 transfers: that window
was not checked, and nothing here opens it.
