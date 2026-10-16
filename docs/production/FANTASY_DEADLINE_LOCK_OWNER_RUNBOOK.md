# A change that passed the deadline check cannot land after the lock: owner runbook

> **Status, 2026-10-16: prepared, not applied anywhere.** Branch `work/sec01-deadline-race`. Nothing
> was run against Staging or Production. This is the second SEC-01 gap that
> `FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md` listed as unproven: it is now **proven real** (below) and
> this is the fix.

Target: BotolaGO Production V2, project `tkewgajrljbwgwedqsxn`, Supabase SQL editor.
Migration: `supabase/migrations/20261016180000_fantasy_deadline_mutation_lock.sql`.
Script: `scripts/backend/apply-20261016180000-fantasy-deadline-lock.sql`
(built by `scripts/backend/build-apply-20261016180000-fantasy-deadline-lock.ts`).
Database test: `supabase/tests/database/fantasy_deadline_mutation_lock.test.sql`.

## Why (audit finding SEC-01, second gap)

Every manager write checks the deadline against the moment the call **started**
(`statement_timestamp()`) and reads the gameweek with no lock:
`app_private.fantasy_assert_mutable_gameweek` (lineup save, transfer preview and confirmation, chip
activation and cancellation) and, for a new squad, `app_private.fantasy_enrolment_gameweek`
(`api.create_fantasy_team`). At the deadline the lock step (`api.service_advance_fantasy_lifecycle`,
from the `fantasy-lifecycle-tick` pg_cron job or the worker) takes the gameweek row `FOR UPDATE`, locks
every lineup it can see, and moves the gameweek to `locked` once none is left. Nothing made a call
that started before the deadline finish before that.

Reproduced on PostgreSQL 16 with all 248 migrations and the real functions, two sessions (the manager's
call made to wait on a lock the function itself waits for, the lock step run after the deadline):

| Path                                           | Result before the fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_fantasy_team` (new squad)              | **Real.** Call started 20:05:54.31, deadline 20:05:57, lock step committed 20:05:58.85 (`locked`, 600 lineups), squad committed 20:06:01.82. Result: gameweek `locked`, the new squad's lineup **unlocked** (its `created_at` reads 20:05:54.31, before the deadline). The lock step never revisits a `locked` gameweek; the manager is refused from then on; `service_get_fantasy_scoring_snapshot` refuses the gameweek on **every** pass with **`fantasy_lineup_not_locked`**: it cannot be scored or finalized. Same with the pg_cron tick itself as the locker. |
| `activate_fantasy_chip`, `cancel_fantasy_chip` | **Real.** The chip row committed about 3 s after the gameweek was `locked`. It is scored (the snapshot reads chip uses when it is taken); no guard sees it. The request did start before the deadline.                                                                                                                                                                                                                                                                                                                                                               |
| `save_fantasy_lineup` (existing lineup)        | Not real: refused with `fantasy_gameweek_locked` at its write, which re-reads the lineup row under its row lock (`locked_at is null`).                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `confirm_fantasy_transfers`                    | Not real: its check runs after its team-row lock, and its lineup `FOR UPDATE ... locked_at is null` re-reads the lineup.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**How big the window is.** For a new squad, from the call's start to its first insert (whose foreign
key takes `KEY SHARE` on the gameweek and does wait for a lock step already holding it). Measured inside
the real function, 4 vCPU: about **1 ms** idle (p50 1.06 ms, p99 2.05 ms); with 200 squads created at
once, warm connections, p50 34 ms, p95 242 ms, p99 500 ms (first call of a new connection: p50 728 ms).
Chips: 0.6 ms idle, p95 160 ms at 200 at once. For it to happen, the call must start before the deadline
and still be short of that insert when the lock step takes the row (pg_cron starts the tick at the
minute, the deadline is at :00 or :30, and the tick runs the calendar sync first). In 18 runs with
natural timing (30 to 200 squads submitted in the last 10 to 150 ms before the deadline, the lock step
2 ms after it) it **did not** happen: the lock step waits for the squads already past their insert, and
in those runs none was still before it. So it is rare, needs load or a slow call at the exact deadline,
and its consequence (a gameweek that cannot be scored) is severe.

## What it does

1. **`app_private.fantasy_assert_mutable_gameweek(uuid)`**: the same unlocked check first (a call
   after the deadline is refused there, taking no lock), then `FOR KEY SHARE` on the gameweek row and
   the same check again on what the lock returns. It becomes `VOLATILE` (a row lock is not allowed in a
   `STABLE` function). In a **read-only** transaction it takes no lock: PostgREST runs the `STABLE`
   `api.preview_fantasy_transfers` read-only, `FOR KEY SHARE` is an error there (checked), and such a
   transaction cannot write anyway.
2. **`api.create_fantasy_team`**: after its two advisory locks (where its foreign keys already took
   `KEY SHARE` on the gameweek), `FOR KEY SHARE` on the gameweek it joins, then
   `fantasy_enrolment_gameweek` again; a different answer is `fantasy_gameweek_locked`, as at the top.
   Otherwise byte for byte the definition of `20260926003100` (the script test checks this).

`FOR UPDATE` (the lock step) conflicts with `FOR KEY SHARE`. So a manager's call either holds the row
first (the lock step waits for its commit, then sees its lineup and locks it) or waits for the lock step
and is refused. Same refusals, same codes, same deadline (still the moment the call started); nothing
accepted before is refused now unless the lock step committed while it ran. No other function, table,
trigger, grant, setting, Fantasy rule or deadline changes; the lock step and the scoring snapshot are
untouched. `CREATE OR REPLACE` keeps both owners and grants (the script checks).

After the fix, the same interleavings: the squad that waited is refused (`fantasy_gameweek_locked`);
a squad, a lineup save or a chip already holding the row makes the lock step wait about 3 s and is then
locked with it (601 lineups locked, none left open; the saved lineup is the one locked).

### Lock order and deadlocks

- `save_fantasy_lineup`, `activate_fantasy_chip`, `cancel_fantasy_chip`: the new lock first, then the
  team row, then the lineup. `create_fantasy_team`: its advisory locks, then the new lock, then its
  inserts (the order its foreign keys already had). `confirm_fantasy_transfers`: the team row, then the
  new lock (in the preview), then the lineup, the order its transfer-batch insert already had.
- Every function that locks a gameweek row `FOR UPDATE` takes it first (after the calendar advisory
  lock at most). On the open gameweek, only the lock step then waits for a row a manager might hold
  (the lineups), and a manager takes a lineup only after the gameweek row. The functions that lock team
  rows after a gameweek row (`service_prepare_next_fantasy_gameweek`, `fantasy_open_missed_gameweek`,
  `service_roll_fantasy_free_transfers`) work on a `scheduled` or `finalized` gameweek, which the
  unlocked check refuses before any lock, or return early without touching teams.
- `KEY SHARE` does not conflict with `KEY SHARE` or with the lifecycle's plain status updates. A manager
  waits only while a `FOR UPDATE` holder runs on the open gameweek (the lock step, the calendar sync).
  The lock step waits only for calls already holding the row; a call after the deadline never takes it,
  so a stream of late calls cannot hold the lock step off.
- Measured: 200 connections (120 saving, 40 transferring, 20 chips, 20 new squads) across the deadline
  with the lock step or the pg_cron tick at the deadline: **no deadlock**, no lineup left unlocked, every
  call after the deadline refused with `fantasy_gameweek_locked`, lock step 450 to 700 ms (it was 440
  to 660 ms before the fix in the same runs).

### Latency (4 vCPU throwaway PostgreSQL 16, pgbench, `api.save_fantasy_lineup`)

| Load                                  | Before (3 runs)                             | After (3 runs)                              |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| 1 manager                             | p50 3.6 ms, p95 9.7 ms, 216 tps             | p50 3.9 ms, p95 9.6 ms, 202 tps             |
| 200 at once (the declared peak), 20 s | tps 469 / 461 / 470, p50 355 / 350 / 354 ms | tps 420 / 500 / 473, p50 387 / 336 / 356 ms |

The 200-at-once runs are CPU-bound on this machine (4 vCPU) and the difference is within run-to-run
noise; one manager pays about 0.3 ms for the second read and the lock.

### Left as it is

Between two lock-step pages (only when one call does not lock every lineup: the worker's pages; the
pg_cron tick runs up to 20 pages of 500 in one transaction) the gameweek is still `open`, and a call that
started before the deadline can still change a chip of a team whose lineup the first page already
locked. It is scored consistently and the request started before the deadline; lineup saves and
transfers are refused there by their lineup check.

## What to pause (AGENTS.md, "One writer at a time, per database")

The script replaces two function definitions; it takes no table lock and writes no Fantasy row. The
scheduled writer that runs around them is the Fantasy lifecycle, so the script **refuses to run**
unless it is paused and no pass holds the worker lease:

```sql
select lifecycle_tick_enabled from app_private.fantasy_automation_settings;  -- write it down
select app_private.fantasy_automation_configure(false);
select holder, expires_at, released_at from app_private.fantasy_worker_lease;  -- wait: released_at set or expires_at past
```

It also refuses while an open gameweek's deadline is less than 30 minutes away. Not needed: managers'
own calls (ordinary traffic; each call runs the old or the new definition whole), and the live
refresh, e-mail, push, account-deletion, Manager Card, Trophées, Rivaux, Pépites, news and prediction
jobs (none calls these functions).

**After the commit, restore only if it was on:** `select app_private.fantasy_automation_configure(true);`

## Before you start (read-only, any time)

```sql
select id, sequence_number, status, deadline_at from app.fantasy_gameweeks where status = 'open';
select version from supabase_migrations.schema_migrations
 where version in ('20260720141854', '20260924200000', '20260926003100', '20261016180000');
-- three rows expected, not 20261016180000
select provolatile from pg_proc where oid = 'app_private.fantasy_assert_mutable_gameweek(uuid)'::regprocedure;
-- 's' before
```

## Run it

1. Supabase dashboard, project "BotolaGO Production V2" (the address contains
   `tkewgajrljbwgwedqsxn`), SQL Editor, New query. Pause the Fantasy lifecycle tick.
2. Paste the whole script and press Run. As shipped it ends in `rollback;`: a **rehearsal**. The
   result row says "Rehearsal passed".
3. Change the line `rollback;` to `commit;` and press Run again. The result row says "Applied".
4. Restore the tick if it was on.

The script refuses to run twice; refuses unless `20260720141854`, `20260924200000` and `20260926003100`
are recorded; refuses while the tick is on, the worker holds its lease, or a deadline is under 30
minutes away; refuses unless the two functions it replaces and the seven it relies on (the lineup save,
the transfer preview and confirmation, the chip activation and cancellation, the enrolment gameweek and
the lock step) are **byte for byte** the repository's latest definitions (md5 of their source). After
running the migration it checks the two new definitions (text, `VOLATILE`, security definer, empty search
path), that their owner and grants did not change, that no other function of `api` or `app_private`
changed, and that the cron job list did not move. A refusal means the database is not in the state that
was reviewed: send the message; do not edit a check.

### Post-checks (read-only)

```sql
select p.oid::regprocedure, p.provolatile, p.proacl
  from pg_proc p
 where p.oid in ('app_private.fantasy_assert_mutable_gameweek(uuid)'::regprocedure,
                 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)'::regprocedure);
-- both 'v'; the grants as before (create_fantasy_team: authenticated and service_role)
select version, name from supabase_migrations.schema_migrations where version = '20261016180000';
```

At the next deadline: the gameweek goes to `locked` as usual and
`select count(*) from app.fantasy_lineups where gameweek_id = '<id>' and locked_at is null;` is 0.

## Rolling back

Forward-only: never edit the migration. To take it back, ship a **new** migration (and a guarded script
like this one) that restores the two definitions: `app_private.fantasy_assert_mutable_gameweek` as in
`20260720141854_fantasy_api_security.sql` (with `stable`) and `api.create_fantasy_team` as in
`20260926003100_ordinary_account_mfa_step_up.sql`. Rolling back restores the defect.

## What was and was not run

Run in this session, on a throwaway local PostgreSQL 16.15 (unix socket only, deleted afterwards), with
all 248 migrations applied in order and local stand-ins for the Supabase roles, `auth`, `storage`,
`cron`, `net` and `vault`:

- the reproduction above (two sessions, the real functions, the lock step called directly and through
  `app_private.fantasy_lifecycle_tick()`), before and after the fix, and the consequence
  (`fantasy_lineup_not_locked` from `service_get_fantasy_scoring_snapshot`, the gameweek forced to
  `provisional` in the throwaway database only to reach that check);
- the window measurement inside the real functions, the natural-timing runs, the latency and the
  mixed load at the deadline (numbers above);
- the preview in a read-only and a read-write transaction;
- the apply script on copies: rehearsal, commit, a second run, and refusals (tick on, worker lease held,
  a deadline 10 minutes away, a pinned function changed, the replaced function already changed);
- `supabase/tests/database/fantasy_deadline_mutation_lock.test.sql` with `pg_prove`: 27 of 27 pass
  with the migration, and its shape checks fail without it; the whole pgTAP suite was run with and
  without the migration: the same ten files fail in this harness either way (limits of the stand-ins:
  storage grants, the Realtime publication, the vault and pg_net stand-ins, ops alert timing), none of
  them about Fantasy deadlines; every other Fantasy file passes;
- `bun run backend:migrations:check`, the script test, `bun test scripts/backend`, typecheck, ESLint and
  Prettier.

**Not run:** anything on Staging or Production; the Supabase stack and CI's `database-quality` job (the
authority for database tests); a load test on production hardware (the latency numbers are from a
4 vCPU container).
