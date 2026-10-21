# GW1 manual worker dispatch (1 Oct 2026)

**Outcome: BLOCKED_MANUAL_WORKER_DISABLED.** The worker did not run. Nothing was written
to production.

## What was dispatched

| Item | Value |
| --- | --- |
| Workflow | `fantasy-manual-worker.yml` (`Run one reviewed Fantasy gameweek worker`), ref `main` |
| Run | 36854624396, attempt 1, 11:19:16 UTC, conclusion failure (9 seconds) |
| Commit | `a4ca3abdef9e5f9d5b3e44ba0df09dcf3e27a111` (full main SHA, re-read just before dispatch) |
| Inputs | `confirmation = RUN_FANTASY_MANUAL_WORKER`, `gameweek_id = 7fcb28c5-9b69-4591-bcda-437c6c961c5c`, `calculation_version = 19` |

## Pre-flight (all matched the preview)

Orchestrator `disabled_manually`; tick and live refresh `false`; no production run
queued, waiting or running (only a CI check on draft PR 257); GW1 `provisional`, scoring
input version 18, 18 snapshots, none sealed; ready fixtures 705 and 708; pending 706, 707,
709, 710, 711; scoring input digest `4520505c...fdb30` identical to the preview; scoring
and finalization function definitions unchanged; main unchanged since the canary.

## Why it stopped

The first step (`Guard explicit manual activation and immutable commit`) failed. The step
log prints its environment, and it shows `FANTASY_MANUAL_WORKER_ENABLED:` **empty**. The
guard's first test is `test "$FANTASY_MANUAL_WORKER_ENABLED" = "true"`, so it exits
before anything else. Every later step (checkout, tests, the worker) was skipped. The
other inputs (commit, confirmation, attempt number, project reference and URL) are the
values the guard requires. The variable was not changed, the guard was not bypassed, and
the worker and its writes were not reproduced any other way.

## Verification that nothing changed

Compared with a baseline taken immediately before dispatch, count and content hash are
identical for: point events (852), gameweek points (606), team results (6), rankings (16),
scoring snapshots (18), gameweeks, auto-substitutions, Fantasy players, price history,
lineups, squad memberships, player performances (9466), coverage (242), idempotency keys,
mutation audit, lifecycle transitions, automation settings, notifications and
notification events. GW1 `provisional` at version 18; GW2 `scheduled`, deadline
2026-10-02 14:30 UTC; tick and live refresh `false`; orchestrator `disabled_manually`; no
unfinished cron run.

## To unblock

The repository variable `FANTASY_MANUAL_WORKER_ENABLED` must be `true` in the repository
or the `production-admin-activation` environment. This session has no tool to read or set
it, and the approval did not cover changing it. A new dispatch needs its own approval
(the guard also requires attempt 1, so it must be a new dispatch, not a re-run).
