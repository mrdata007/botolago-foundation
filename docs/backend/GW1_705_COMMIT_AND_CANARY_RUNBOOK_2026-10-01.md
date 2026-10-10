# GW1 fixture 19874705: commit-only boundary, commit sequence, ingestion canary

Stage reached: **OBSERVED and REHEARSED. COMMITTED is blocked** at the commit-only
boundary (below). Nothing was written to production in this step.

## 1. The boundary: what is missing

The repair must become visible without anything ingesting or scoring because of it.
Read-only inspection of every writer (1 Oct 2026, 10:13 to 10:15 UTC):

| Writer                                                                                                                      | State                                                                                                                                                                                     | Can it ingest or score after the repair?                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database Fantasy tick (`fantasy-lifecycle-tick`)                                                                            | `lifecycle_tick_enabled = false` since 26 Sep 22:24 UTC; cron job itself active but gated                                                                                                 | No (gated)                                                                                                                                                                                       |
| Database live refresh (`football-live-refresh`, `football-season-refresh`)                                                  | `football_live_refresh_enabled = false`; both ticks return "disabled"                                                                                                                     | No (gated)                                                                                                                                                                                       |
| Other cron jobs (news, notifications, predictions scoring, Pépites, ops alerts)                                             | active, unrelated to Fantasy statistics                                                                                                                                                   | No Fantasy ingestion or scoring                                                                                                                                                                  |
| Triggers on `players`, `team_memberships`, `fantasy_players`, `fantasy_player_price_history`, `player_fixture_performances` | validation, attribute guard, `updated_at` only                                                                                                                                            | No                                                                                                                                                                                               |
| `football-current-season-recovery.yml` (daily 07:43 UTC)                                                                    | schedule runs only if `FOOTBALL_CURRENT_SCHEDULE_ENABLED == 'true'`; squads refuse once the catalog is staged                                                                             | Not a statistics ingester                                                                                                                                                                        |
| Other scheduled workflows (gate2e, GNews, El Botola, e2e)                                                                   | read-only, disabled or stood down; `ops-watchdog` is read-only monitoring                                                                                                                 | No                                                                                                                                                                                               |
| **`Fantasy season orchestrator` (schedule `12 * * * *`)**                                                                   | **workflow `active`; it is running**: scheduled run #71 executed at 07:10 UTC today (conclusion failure, as expected while 705 cannot import). So `FANTASY_AUTOMATION_ENABLED` is `true`. | **Yes.** Its pass runs finished-fixture ingestion and the lifecycle worker. The database tick being off does not gate it. After the repair, its next hourly run would ingest 705 and then score. |

**The missing control.** Pausing the orchestrator needs one of these, and this
session has neither:

1. GitHub "Disable workflow" on `Fantasy season orchestrator`, or
2. setting the repository variable `FANTASY_AUTOMATION_ENABLED` to `false`
   (the workflow's own documented switch for scheduled runs; a manual dispatch still works).

The session's GitHub tools can list, read, dispatch, re-run and cancel runs; none can
disable a workflow or write a repository variable. The environment holds a
`GITHUB_TOKEN`, which was **not** used: the session limits GitHub access to its tools,
and calling the REST API directly would go around that limit. Cancelling a scheduled
run does not stop the next one.

**How to supply it (about a minute).** Prefer option 1: it is verifiable at once,
because `get_workflow` then reports `state: disabled_manually`. Option 2 can only be
confirmed by the next scheduled run showing `skipped` (up to an hour). Record the prior
state: workflow `active`, created 2026-09-18, schedule hourly at :12, variable `true`.
Either control leaves `ops-watchdog` and every other workflow untouched.

## 2. The commit sequence, ready to run once the boundary exists

All within one window: the recorder accepts an observation under 30 minutes old (the
script checks 29), the apply accepts one under 24 hours.

Pinned scripts (checked 1 Oct 10:xx UTC, unchanged since the rehearsal):

| Script                                               | git blob      | sha256                                                             |
| ---------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `record-scoped-player-list-observation.sql`          | `6c8ed81c`    | `3ea2abcd5af7db832abdccec51b88632de6ed1b30520fdf8005f0cb71e26cf6a` |
| `apply-current-player-list.sql`                      | `7f89b633`    | `cdd11a5c0368385a8b1a6b278d26260b4c946d24c8ee2d63d9ae319eb79e175a` |
| `verify-gw1-705-repair.sql` (read only, this change) | (this commit) | n/a                                                                |

Relevant database CI: `database-quality` passed on `1163fe7c`, `9a0858a9` and
`03b4e45b` (repair suite 21 of 21 on the first). Main is now `0b01db46`; its only
change since the reviewed `03d34c3e` is two documentation files.

1. **Boundary.** Confirm the orchestrator is paused (`state: disabled_manually`), no run
   active or queued, no running cron job, no active query, tick and live refresh still
   `false`. Run `verify-gw1-705-repair.sql` for the pre-state.
2. **A. Fresh Observe**, fixture `19874705` only, `expected_commit` = current main.
3. **Baseline** (`verify-gw1-705-repair.sql`) after the observation is recorded: the
   observation is the one expected write.
4. **B. Scoped record**: the pinned recorder with the 17 ids, `scope_ack_fantasy_additions = true`,
   `scope_ack_held_moves` empty, **`scope_dry_run = 'false'`**. It writes one scoped
   observation row and returns its id and plan digest. **C.** Compare: digest must equal
   `3ccf6fea0f3369adf6c258298e356ccc3324200c49e26a1827b195801f2b40fe` and the plan
   must be the 17 rows of the reviewed table (15 `add`, 2 `join` mapped, 17 Fantasy `add`,
   0 moves). Stop on any difference.
5. **D. Apply rehearsal**: `apply-current-player-list.sql` as shipped (it ends in
   `rollback;`) with the scoped observation id and that digest. Verify the result row says
   "Not applied" with the 17-change summary, then re-run the verification and compare all
   hashes to the baseline.
6. **E. Apply, commit mode**: the same script with the single line `rollback;` changed to
   `commit;` (the documented step 5). Its comments and result text tell the operator to
   switch the Fantasy tick back on: **do not**. Neither `service_apply_current_player_list`
   nor the script writes the automation settings (the function only reads them).
7. **Verify** with `verify-gw1-705-repair.sql`: one new applied-update record for the scoped
   observation; the 17 targets mapped once, each with one club record 2026-09-24 to
   2027-06-30 and one Fantasy entry with the approved position and price; the two existing
   canonical players unchanged and not duplicated; `identity_40` shows 40 OK; every
   "must not change" hash equal to the baseline; `players` +15, `provider_mappings` +15,
   `team_memberships` +17, `fantasy_players` +17, `price_history` +17,
   `initial_price_evidence` +17, `observations` +1 (scoped), `updates` +1; tick and live
   refresh `false`; the orchestrator still paused. A catalog increase 606 to 623 is expected
   only if the baseline is still 606.

Stop conditions: any difference in digest or plan rows, a refusal, a held move, a
club-limit violation, an unexpected writer, a rehearsal that persists anything, or any
post-commit check failing. Do not repeat Observe or the apply automatically.

**Recovery, if a post-commit check fails.** There is no automatic undo and none is
scripted. Stop; capture the exact rows with the verification script; the supported path is
a reviewed forward correction under its own approval (the apply's own retire path, for
a hand-typed duplicate, sets `active = false` / `eligible = false` on the Fantasy row
rather than deleting it). Do not delete or re-apply blindly.

## 3. The one-fixture ingestion canary (next approval, not executed)

- **Workflow:** `Ingest current finished Football performances`
  (`football-current-finished-performances.yml`), on `main`, `expected_commit` = main's SHA
  at dispatch, `confirmation = INGEST_CURRENT_FINISHED_PERFORMANCES`,
  `only_fixture_external_id = 19874705`, no cursor. Code: the importer reviewed in PR #256
  (merge `03d34c3e`); main's later commits are documentation.
- **Preconditions:** the repair committed and verified; the orchestrator still paused; tick
  and live refresh `false`; no run active or queued.
- **Expected:** verdict ok, 1 fixture processed, 40 players, 22 starters; the database
  returns `reconciled` and `scoringStatisticsComplete`; `app.player_fixture_performances`
  +40 active rows for the fixture (9426 to 9466) and one coverage row
  (`historical_performance_fixture_coverage` 241 to 242), source version
  `sportsmonks-current-fixture:<sha256>`.
- **Not exercised by the identity rehearsal, exercised only here:** each goalkeeper must
  carry explicit saves and penalties-saved (the two new keepers 37901711 and 37947231
  included; an absent figure counts as zero, an explicit null is refused with
  `CURRENT_POSITION_STATISTICS_INCOMPLETE`); the canonical-position check; 22 starters and
  two clubs; goals conceded against the final score held in the database; the
  stale-observation watermark.
- **Atomic:** one transaction per fixture. A refusal leaves no performance and no coverage
  row, so the canary cannot half-ingest.
- **Downstream side effects:** the two tables above only; no trigger scores or enqueues
  anything. The fixture then counts as covered for the health checks and `ops-watchdog`.
  Points for 705 are produced later by the lifecycle worker or the orchestrator, both
  paused. GW1 still needs the other fixtures before it can finalize.
- **Stop:** any refusal code, any row count other than +40 and +1, any unexpected writer.
  No automatic retry; report the specific code.
- **Recovery:** ingestion is idempotent by source version and supersedes by deactivating
  earlier rows (`active = false`), never by deleting; a wrong ingest is corrected by a
  reviewed re-ingest under its own approval.
