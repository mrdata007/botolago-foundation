# Fantasy lifecycle worker on a schedule we control

Migrations `20261013170000_fantasy_worker_schedule` and `20261013170100_ops_health_fantasy_worker`.
Edge Function `fantasy-lifecycle-worker`. Status: written and unit tested, **not applied or deployed anywhere**;
it ships switched off.

## Problem (measured 2026-10-12)

Scoring, scoring-mode selection, finalization, close and lock on provisional points, and the opening of the next
gameweek's postwork ran only in the GitHub Action `.github/workflows/fantasy-season-orchestrator.yml` (cron
`12 * * * *`), through `runFantasyLifecycle` in `scripts/backend/fantasy-lifecycle-runner.ts`. GitHub started 5 of
the 24 hourly runs in a day, 4 to 11 hours apart. Points lagged for hours and a gameweek deadline was missed. The
database tick `fantasy-lifecycle-tick` (pg_cron, every 5 minutes) only locks, goes live and moves a gameweek to
provisional; it does not score or finalize.

## Decision

Run the same worker on a clock we control: an Edge Function woken by pg_cron through pg_net, every 10 minutes while a
gameweek has work, with the GitHub workflow kept as a fallback. Not a rewrite in SQL (the scoring arithmetic, the
adaptive evidence rules and the substitutions are TypeScript with their own tests, and a second implementation would
drift), and not a second GitHub schedule (the problem is GitHub's scheduler).

```
pg_cron  fantasy-worker-tick  (*/10)
   |  both switches on, functions_base_url set, work pending, no lease held, interval elapsed
   v  pg_net POST + x-botolago-scheduler-token
Edge Function fantasy-lifecycle-worker      (verify_jwt = false, scheduler token checked in-process)
   |  acquire lease  ->  sync calendar  ->  runFantasyLifecycle per gameweek  ->  prizes  ->  release lease
   v  service-role RPCs only (api.service_*), one log row per pass
database
```

The Edge Function never calls a provider. With `api.football_data_source()` at `sofascore` the orchestrator's
SportsMonks steps were already skipped, and the lifecycle itself is database-only. What stays GitHub-only is the
read-only reporting (coverage, deadline watch, points-late escalation and the red-run alert); the database health
checks `fantasy_points`, `fantasy_scoring`, `fantasy_progression` and the new `fantasy_worker` watch the same things.

## What runs where (code)

One TypeScript worker, three callers.

| File                                                       | What                                                                                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/functions/_shared/fantasy-lifecycle-worker.ts`   | `runFantasyLifecycle` and its schemas (moved unchanged), the work list (`calendarSyncSchema`, `selectWorkerTargets`), the lease helpers, `runFantasyWorkerPass`. |
| `supabase/functions/_shared/fantasy-scoring-core.ts`       | `scorePlayerFixture` (moved from `src/backend/fantasy/scoring.ts`, which re-exports it).                                                                         |
| `supabase/functions/_shared/fantasy-substitutions-core.ts` | Automatic substitutions (moved from `src/backend/fantasy/substitutions.ts`, re-exported).                                                                        |
| `supabase/functions/_shared/fantasy-adaptive-scoring.ts`   | `scoreCertifiedPlayerFixture`, `chooseFixtureMode` (moved from `src/backend/fantasy/adaptive-scoring.ts`, re-exported).                                          |
| `supabase/functions/_shared/fantasy-lifecycle-handler.ts`  | The HTTP handler: method, size, scheduler token, one bounded pass, one log row.                                                                                  |
| `supabase/functions/fantasy-lifecycle-worker/index.ts`     | `Deno.serve` with the service-role client. Its `deno.json` maps `zod` to `npm:zod@4.4.3`, the version `package.json` resolves.                                   |
| `scripts/backend/fantasy-lifecycle-runner.ts`              | Re-exports the worker; keeps the manual command line (now under the lease).                                                                                      |
| `scripts/backend/fantasy-season-orchestrator.ts`           | Re-exports the work list; takes the lease around its lifecycle step (below).                                                                                     |

The pure code moved under `supabase/functions/_shared` because that directory is what an Edge deploy bundles; `src/`
and `scripts/` are not. It is the pattern the repository already uses (`sofascore-fantasy.ts`,
`fantasy-adaptive-core.ts`). Deno compatibility: every import in the moved files is a relative `./name.ts` path or
`zod`; a test (`fantasy-lifecycle-handler.test.ts`) fails if a file under that list imports anything else.

## The gate

`app_private.fantasy_worker_tick()` calls the function only when all of these hold; each other case answers a word
that is stored in `app_private.fantasy_worker_dispatch.last_outcome`:

| Answer           | When                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `disabled`       | `lifecycle_tick_enabled` (the existing Fantasy switch) **and** the new `lifecycle_worker_enabled` are not both on.                |
| `not_configured` | `app_private.notification_email_settings.functions_base_url` is null, or the scheduler token is missing.                          |
| `idle`           | No gameweek has work (`app_private.fantasy_worker_work_pending()`). Nothing is called.                                            |
| `busy`           | A lease is held and unexpired (a pass is running, from the function or from GitHub). The function is not woken to be turned away. |
| `waiting`        | The last call was less than the interval (default 10 minutes, minus 2 minutes of slack) ago.                                      |
| `invoked`        | The function was called.                                                                                                          |

`fantasy_worker_work_pending()` is `selectWorkerTargets` in SQL: a locked, live, provisional or finalizing gameweek; an
open one past its deadline; a finalized one whose successor is staged but not opened, or that closed early and still
owes its postwork. The function itself recomputes the list from the calendar sync, so the SQL may be coarser (an open
gameweek past a placeholder deadline wakes it; it then does nothing, because `selectWorkerTargets` skips it).

Defence in depth: `api.service_fantasy_worker_lease_acquire` refuses an `edge:` holder while the worker is off, so a
stray call to the public function URL (it needs the scheduler token anyway) does nothing and writes nothing.

## One writer at a time: the lease

`app_private.fantasy_worker_lease` is one row: holder, secret token, expiry, released-at. Three callers take it through
`api.service_fantasy_worker_lease_acquire(holder, ttl)` with `edge:<id>`, `github:<run>` or `manual:<run>`:

- The row is locked `for update`; if an unexpired, unreleased token exists the answer is `held` and names the holder.
  Otherwise a new token is issued. A holder that dies frees the lease when it expires (420 s).
- The holder extends it every quarter of its length while it works (`leasedGateway`), and stops with
  `fantasy_worker_lease_lost` if the extension says the lease is gone. The Edge pass also stops starting RPCs after
  its time budget (100 s by default), well inside the 420 s, so a stalled instance cannot outlive its lease by more
  than one 30 s RPC.
- `release` frees it at the end of a pass.

How the callers use it:

- **Edge function** (`fantasy-lifecycle-worker`): takes the lease, else logs `lease_held` and returns.
- **GitHub orchestrator, scheduled run**: first asks `api.service_fantasy_worker_status`. If the database job is on,
  has a working URL and has had an ok pass in the last 30 minutes (or has nothing to do), it **does not run the
  lifecycle** and reports `lifecycle.owner = database_worker`; it still runs the calendar sync, the coverage and points
  checks, the prize catch-up and the deadline watch, so the red-run alert keeps working. Otherwise it takes the lease
  itself (`lifecycle.owner = github`) or, if another holder has it, waits (`lease_held`, verdict `waiting`).
- **GitHub orchestrator, manual dispatch**: never defers (the owner asked), but still takes the lease.
- **Manual worker workflow**: takes the lease, or exits with `fantasy_worker_lease_held`.
- A database without the lease functions (this migration not applied) answers `PGRST202`: the scripts then run
  unmanaged exactly as before.

Why the schedule is kept rather than removed: the GitHub schedule is the fallback. If the database job is off,
misconfigured, cannot reach the function, or keeps stopping on its budget, its last ok pass ages past 30 minutes,
`databaseWorkerActive` turns false, and the next scheduled GitHub run does the work itself. Removing the schedule would
leave nothing behind the new path. Making it a no-op only while the database job is healthy removes the double
writer without removing the net. The coexisting `fantasy-lifecycle-tick` (lock, go live, provisional) stays as it is:
its row locks and `lock_version` make it safe next to the worker, which already re-reads on `stale_update`.

The lease keeps two whole passes from interleaving. It is not a fence: the individual RPCs are unchanged and keep their
own row locks, advisory locks and `lock_version`.

## Bounded pass, resumable next tick

`runFantasyWorkerPass` (wall-clock budget 100 s of the Edge function's 150 s limit; at most 4 gameweeks; at most 1500
RPCs per gameweek):

1. acquire the lease; 2. `service_sync_fantasy_calendar`; 3. `selectWorkerTargets`; 4. `runFantasyLifecycle` for each
   target in sequence order; 5. the prize catch-up; 6. release. Every durable step is a transactional, idempotent RPC, so
   stopping between any two of them is safe and the next tick resumes from database state. A budget or RPC-allowance stop is
   logged `partial` with the code (`fantasy_worker_time_limit`, `fantasy_worker_batch_limit`), not `failed`. A failure in one
   gameweek is `failed` for the pass and does not stop the others.

### RPC cost of one gameweek (measured from the code)

`scripts/backend/fantasy-lifecycle-runner.test.ts` runs the real worker against a paged fake and asserts the count.
For a provisional gameweek that scores, finalizes and opens its successor, with batch size 100, `T` fantasy teams, `L`
leagues and `P` priced players:

```
RPCs = 9 + 6 * ceil(T/100) + ceil(L/100) + 2 * L + ceil(P/100)
```

| Teams | Leagues | Players | RPCs |
| ----: | ------: | ------: | ---: |
|   300 |      20 |     450 |   73 |
|  1000 |     100 |     450 |  275 |
|  5000 |     500 |     450 | 1319 |
| 20000 |    2000 |     450 | 5234 |

Leagues dominate: every league is ranked with two RPCs, and the ranking pass restarts from the first league on every
pass. A gameweek that is only waiting (provisional, closed, awaiting final statistics) costs about 3 RPCs for the
worker plus the calendar sync, the prize check, the lease and the log row: about 8. A live gameweek is re-scored on
every pass (snapshot and persist pages: `2 * ceil(T/100)`, plus rankings). That is 6 times the hourly load of the old
schedule at the default interval; `fantasy_worker_configure(true, 30)` sets 30 minutes if the season is large.

CPU measured for one 100-team snapshot (400 players, two fixtures each, 649 KB of JSON) under Bun: validation 44 ms,
scoring 16 ms. About 60 ms CPU per scoring page, so a 5000-team live pass spends about 3 s of CPU on scoring alone
(a more typical single-fixture snapshot is about half that). Supabase documents a per-request CPU limit for Edge
Functions of 2 s on top of the 150 s wall-clock one. **This has not been measured on the project's Edge runtime.** If
the platform enforces it, large seasons will stop `partial` on the allowance or be killed, and the fallback below takes
over; lower `FANTASY_WORKER_MAX_CALLS` or raise the interval. Resumability has one honest gap: scoring pages and the
ranking pass restart from the beginning on each pass (the cursors are not stored), so a gameweek whose scoring or
rankings alone exceed one pass's allowance would never finish in the Edge function. At 500 leagues the rankings need
about 1000 RPCs, inside the 1500 allowance; past about 700 leagues they do not. Making the ranking pass resumable needs
a stored cursor in the database and is a separate change. Until then the GitHub run (5000 RPCs, 40 minutes) finishes
such a gameweek once the database job's last ok pass is 30 minutes old.

### Expected runs per day

The tick runs 144 times a day and only calls the function while a gameweek has work: from its deadline (locked, live,
provisional, finalizing) until it is finalized and its successor is open, which in a match week and while a closed
gameweek waits for final statistics (up to 21 days) is most of the time. So up to **144 Edge invocations a day**, at
about 8 RPCs when nothing changed and hundreds while a gameweek is live. Idle days (no work) cost 144 indexed reads
and no invocation.

## Observability

- `app_private.fantasy_worker_runs`: one row per Edge pass: `outcome` (`ok`, `partial`, `failed`, `lease_held`),
  gameweek id and sequence, `worker_code` (the worker's outcome or error code), `calls`, `duration_ms`, `detail` (per
  gameweek). Written by `api.service_fantasy_worker_record_run`, which also deletes rows older than 30 days. Codes and
  holders are validated; nothing from a payload, token or credential reaches a row. The function also logs one JSON line
  per pass to the Edge logs.
- Health check `fantasy_worker` (`app_private.fantasy_worker_health`, appended by a wrapper like the earlier ones):
  `ok` while the worker is off (the GitHub schedule owns the lifecycle then), while no gameweek is live, provisional or
  finalizing, or while an `ok` pass is under 30 minutes old; `warn` at 30 minutes and `fail` at 90 while a gameweek is
  live, provisional (closed or not) or finalizing. The clock starts at the latest of the last ok pass, the instant the
  worker was switched on, and the instant the work appeared. With an interval over 15 minutes the limits are twice and
  four times the interval. A `partial`, `failed` or `lease_held` pass is not an ok pass; the detail names the last one.
  See `docs/operations/ALERTS.md`.
- `api.service_fantasy_worker_status` for the orchestrator: `enabled`, `databaseWorkerActive`, `workPending`,
  `lastOkAt`, `leaseHeld`.

## Switching it on (owner)

Nothing here is applied or deployed. In this order, through the reviewed paths
(`docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`; this is a production write, authorised operation by operation):

1. Merge, then apply `20261013170000` and `20261013170100` (new migrations only). The worker is off; the new health
   check reads `ok` while it is off.
2. Deploy the Edge Function `fantasy-lifecycle-worker` (verify_jwt off, as in `supabase/config.toml`). Its secret
   `BOTOLAGO_SCHEDULER_TOKEN` is the one the other scheduled functions use; `functions_base_url` in
   `app_private.notification_email_settings` is already set for them. Optional secrets: `FANTASY_WORKER_BUDGET_MS`
   (10 000 to 120 000, default 100 000), `FANTASY_WORKER_MAX_GAMEWEEKS` (1 to 8, default 4),
   `FANTASY_WORKER_MAX_CALLS` (50 to 5000, default 1500).
3. Check no other writer is running (`AGENTS.md`), then
   `select app_private.fantasy_automation_configure(true);` if it is not already on, and
   `select app_private.fantasy_worker_configure(true);`.
4. Watch the first passes: `select * from app_private.fantasy_worker_runs order by finished_at desc limit 10;`, the
   Edge logs, and the `fantasy_worker` check. Expect `lease_held` rows to be rare.
5. Leave the GitHub schedule alone. Once the database job has an ok pass inside 30 minutes, a scheduled GitHub run
   reports `lifecycle.owner = database_worker` and stands aside.

To stop: `select app_private.fantasy_worker_configure(false);` (worker only) or
`select app_private.fantasy_automation_configure(false);` (also the Fantasy tick; the pause command before a write).
A pass already running keeps its lease for up to about eight minutes. To remove it entirely, unschedule
`fantasy-worker-tick` (`select cron.unschedule('fantasy-worker-tick');`) and delete the function.

## Tests

- `supabase/functions/_shared/fantasy-lifecycle-handler.test.ts`: scheduler token and method checks; one bounded pass in
  the exact RPC order with one log row; off (no row); lease held by GitHub (turned away, other lease untouched); a
  failed pass logged and the lease freed; error text reduced to a safe code; time budget, RPC allowance and
  `maxGameweeks`; the lease semantics (one holder, expiry, the Edge holder refused while off, a holder whose lease was
  taken stops, extension every quarter, deadline); the Deno import rules.
- `scripts/backend/fantasy-season-orchestrator.test.ts` ("one writer at a time"): lease taken and freed; another holder
  holds it; defers to a healthy database job (still watches); takes over when it is off or behind; manual dispatch
  never defers; runs unmanaged on a database without the functions.
- `scripts/backend/fantasy-lifecycle-runner.test.ts` ("RPC cost"): the formula above, exactly, at four sizes.
- `supabase/tests/database/fantasy_worker_schedule.test.sql` (pgTAP): privileges and RLS, the tick (off, one switch
  only, no URL, idle, invoked with the right URL/body/token, waiting, busy, interval, expired lease), what counts as
  work (fourteen cases), the lease, the status, the log and its pruning, and the health thresholds (30/90 minutes, the longer
  interval, partial not counting, switched off, no live gameweek). `ops_health_fantasy_coverage_and_scoring.test.sql`
  lists `fantasy_worker` last.

pgTAP and the migrations were **not** run against the real Supabase stack (no Docker here); CI's `database-quality`
job is the authority. They were run against a throwaway PostgreSQL 16 with stand-ins for what Supabase provides (see
the lane report): the two migrations apply, and all 97 assertions of the pgTAP file pass through a small shim of
`extensions.is/ok/alike/throws_ok`. That proves the SQL and the logic, not the interaction with the real schema.

## Risks

- Edge CPU limit and non-resumable ranking (above): large seasons may need the GitHub fallback.
- A live gameweek is re-scored every pass; 6 times the old hourly load at the default interval.
- The lease is expiry-based, not a fence: a holder frozen for more than 420 s could overlap a successor; the RPC-level
  locks still apply.
- A pass in flight survives a pause until its lease ends (about eight minutes).
- The Edge function is a second deploy target: it must be deployed from the same commit as the migration.
