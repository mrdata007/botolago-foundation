# A change that passed the deadline check cannot land after the lock: owner runbook

> **Status, 2026-10-16: prepared, not applied anywhere.** Branch `work/sec01-deadline-race`, on top of
> `work/pilot-cap` (`20261016170000` goes first: this migration replaces the `create_fantasy_team` that
> the pilot cap left). Nothing was run against Staging or Production. This is the second SEC-01 gap that
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

Reproduced on PostgreSQL 16 with every migration and the real functions, two sessions (the manager's
call made to wait on a lock the function itself waits for, the lock step run after the deadline):

| Path                                           | Result before the fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_fantasy_team` (new squad)              | **Real.** Call started 20:05:54.31, deadline 20:05:57, lock step committed 20:05:58.85 (`locked`, 600 lineups), squad committed 20:06:01.82. Result: gameweek `locked`, the new squad's lineup **unlocked** (its `created_at` reads 20:05:54.31, before the deadline). The lock step never revisits a `locked` gameweek; the manager is refused from then on; `service_get_fantasy_scoring_snapshot` refuses the gameweek on **every** pass with **`fantasy_lineup_not_locked`**: it cannot be scored or finalized. Same with the pg_cron tick itself as the locker. |
| `activate_fantasy_chip`, `cancel_fantasy_chip` | **Real.** The chip row committed about 3 s after the gameweek was `locked`. It is scored (the snapshot reads chip uses when it is taken); no guard sees it. The request did start before the deadline. Also between two lock-step pages (worker path, gameweek still `open`): a chip committed 3 s after the team's lineup had been locked.                                                                                                                                                                                                                          |
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
2. **`api.create_fantasy_team`**: right after its user lock and its shared player-list lock (where its
   foreign keys already took `KEY SHARE` on the gameweek) and before the pilot-cap lock, `FOR KEY SHARE`
   on the gameweek it joins, then `fantasy_enrolment_gameweek` again; a different answer is
   `fantasy_gameweek_locked`, as at the top. Otherwise byte for byte the definition of
   `20261016170000` (the pilot cap; the script test checks this; md5 of the source before
   `a85ae45f...`, after `a5426f18...`, the same as the review's own merge).
3. **`api.activate_fantasy_chip`, `api.cancel_fantasy_chip`**: right after the team row `FOR UPDATE`,
   refuse with `fantasy_gameweek_locked` when that team's lineup of the gameweek is already locked.
   Between two lock-step pages the gameweek is still `open`, so the check above passes; this keeps a
   chip from changing after its lineup is locked, as a lineup save and a transfer already were by their
   lineup check. Otherwise byte for byte the definitions of `20260926003100`.

`FOR UPDATE` (the lock step) conflicts with `FOR KEY SHARE`. So a manager's call either holds the row
first (the lock step waits for its commit, then sees its lineup and locks it) or waits for the lock step
and is refused. Same refusals, same codes, same deadline (still the moment the call started); nothing
accepted before is refused now unless the lock step committed while it ran. No other function, table,
trigger, grant, setting, Fantasy rule or deadline changes; the lock step and the scoring snapshot are
untouched. `CREATE OR REPLACE` keeps the four functions' owners and grants (the script checks).

After the fix, the same interleavings: the squad that waited is refused (`fantasy_gameweek_locked`);
a squad, a lineup save or a chip already holding the row makes the lock step wait about 3 s and is then
locked with it (601 lineups locked, none left open; the saved lineup is the one locked). A chip that
waited while the first lock-step page locked its team's lineup is refused (`fantasy_gameweek_locked`)
and no chip row is written.

### Lock order and deadlocks

- `save_fantasy_lineup`, `activate_fantasy_chip`, `cancel_fantasy_chip`: the new lock first, then the
  team row, then the lineup. `create_fantasy_team`: its user lock, its shared player-list lock, the new
  lock, then the pilot-cap lock and its inserts (its foreign keys already locked the gameweek after the
  first two). `confirm_fantasy_transfers`: the team row, then the
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

### What it costs

**Saves wait behind the lifecycle tick.** A manager's write now waits while anything holds the open
gameweek row `FOR UPDATE`. That includes the whole `fantasy-lifecycle-tick` (pg_cron, every 5 minutes):
its calendar sync (`api.service_sync_fantasy_calendar`) locks the gameweek rows `FOR UPDATE` and the
tick keeps them until it commits. Before this change a save went through during a tick; now it waits
for the tick's end. Measured with a tick whose transaction stays open 3 s: a save issued 0.5 s in took
**22 ms before and 2,534 ms after** (the review measured 0.08 s and 2.4 s the same way). The local tick
itself takes 25 ms on this small data set; how long it takes on production is what matters, and it was
**not measured** (no read of production here). Every manager write waits like this: saves, transfers,
chips and new squads.

**Throughput at 200 managers saving at once** (pgbench, `api.save_fantasy_lineup`, 20 s, no tick
running, shared 4-core machines, so CPU-bound and noisy):

| Run                             | Before                 | After                  | Change          |
| ------------------------------- | ---------------------- | ---------------------- | --------------- |
| Review (one pair)               | 504 tps, p50 397 ms    | 437 tps, p50 456 ms    | about -13 % tps |
| This session, pair 1            | 552 tps, p50 312 ms    | 546 tps, p50 319 ms    | -1 %            |
| This session, pair 2            | 569 tps, p50 300 ms    | 548 tps, p50 317 ms    | -4 %            |
| This session, before the rebase | 469 / 461 / 470 tps    | 420 / 500 / 473 tps    | -10 % to +7 %   |
| One manager (no contention)     | p50 3.6 ms, p95 9.7 ms | p50 3.9 ms, p95 9.6 ms | +0.3 ms         |

So: up to about 13 % lower throughput at the declared peak, on shared 4-core boxes; the exact cost on
production hardware is not known. One manager pays about 0.3 ms (the second read and the lock). Each
new `KEY SHARE` holder of the same row also rewrites the row's lock information (a MultiXact listing
all current holders), which is part of that cost at high concurrency.

**Before applying, read the tick's real duration** (read-only, any time):

```sql
select j.jobname, count(*) as runs,
       percentile_cont(0.5) within group (order by d.end_time - d.start_time) as p50,
       percentile_cont(0.95) within group (order by d.end_time - d.start_time) as p95,
       max(d.end_time - d.start_time) as longest
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 where j.jobname = 'fantasy-lifecycle-tick' and d.end_time is not null
   and d.start_time > now() - interval '7 days'
 group by j.jobname;
```

That is roughly the longest a manager's save can now wait, once every 5 minutes (plus the lock step at
the deadline). If the p95 is a few hundred milliseconds, the cost is small; if it is seconds, say so
before applying, because managers would feel it. Then **re-measure on Staging V2** after applying there
first: the same query, and a lineup save timed during a tick.

### Left as it is

Nothing between lock-step pages any more for chips (item 3). Lineup saves and transfers were already
refused there by their lineup check. A new squad created between two pages joins with an unlocked
lineup that the next page locks, as before.

## What to pause (AGENTS.md, "One writer at a time, per database")

The script replaces four function definitions; it takes no table lock and writes no Fantasy row. The
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
 where version in ('20260720141854', '20260924200000', '20260926003100', '20261016170000',
                   '20261016180000');
-- four rows expected (the pilot cap 20261016170000 among them), not 20261016180000
select provolatile from pg_proc where oid = 'app_private.fantasy_assert_mutable_gameweek(uuid)'::regprocedure;
-- 's' before
```

Also read the tick's duration ("What it costs") and look for a gameweek already hit ("If a gameweek
is already hit").

## Run it

1. Supabase dashboard, project "BotolaGO Production V2" (the address contains
   `tkewgajrljbwgwedqsxn`), SQL Editor, New query. Pause the Fantasy lifecycle tick.
2. Paste the whole script and press Run. As shipped it ends in `rollback;`: a **rehearsal**. The
   result row says "Rehearsal passed".
3. Change the line `rollback;` to `commit;` and press Run again. The result row says "Applied".
4. Restore the tick if it was on.

The script refuses to run twice; refuses unless `20260720141854`, `20260924200000`, `20260926003100`
and `20261016170000` are recorded; refuses while the tick is on, the worker holds its lease, or a
deadline is under 30 minutes away; refuses unless the four functions it replaces (the check, the squad
creation as the pilot cap left it, the chip activation and cancellation) and the five it relies on (the
lineup save, the transfer preview and confirmation, the enrolment gameweek and the lock step) are **byte
for byte** the repository's latest definitions (md5 of their source). After running the migration it
checks the four new definitions (text, `VOLATILE`, security definer, empty search
path), that their owner and grants did not change, that no other function of `api` or `app_private`
changed, and that the cron job list did not move. A refusal means the database is not in the state that
was reviewed: send the message; do not edit a check.

### Post-checks (read-only)

```sql
select p.oid::regprocedure, p.provolatile, p.proacl
  from pg_proc p
 where p.oid in ('app_private.fantasy_assert_mutable_gameweek(uuid)'::regprocedure,
                 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)'::regprocedure,
                 'api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)'::regprocedure,
                 'api.cancel_fantasy_chip(uuid,uuid,bigint)'::regprocedure);
-- all 'v'; the grants as before
select version, name from supabase_migrations.schema_migrations where version = '20261016180000';
```

At the next deadline: the gameweek goes to `locked` as usual and
`select count(*) from app.fantasy_lineups where gameweek_id = '<id>' and locked_at is null;` is 0.

## If a gameweek is already hit

The lock step never goes back to a `locked` gameweek, so a lineup left unlocked by the race stays so,
and the scoring snapshot refuses the gameweek on every pass (`fantasy_lineup_not_locked`, in the
Fantasy worker runs and logs). Look (read-only, any time, before and after applying):

```sql
select g.id, g.sequence_number, g.status,
       count(*) filter (where l.locked_at is null) as unlocked_lineups
  from app.fantasy_gameweeks g join app.fantasy_lineups l on l.gameweek_id = g.id
 where g.status in ('locked', 'live', 'provisional')
 group by g.id, g.sequence_number, g.status
having count(*) filter (where l.locked_at is null) > 0;
-- and which teams: select l.id, l.fantasy_team_id, l.created_at from app.fantasy_lineups l
--   where l.gameweek_id = '<id>' and l.locked_at is null;
```

No rows: nothing to repair. A row: the late lineup was submitted before the deadline (its call started
before it; its `created_at` shows that moment), so the repair that matches the rules is to **lock it as
it stands**, as the lock step would have done had the call finished a few milliseconds earlier. The
owner decides; the other choice (removing the late team) is a decision about a manager's account, not a
repair. To lock it: pause the Fantasy lifecycle tick (as above), then run, in the SQL editor, this block
with the gameweek id filled in. Run it first ending in `rollback;` (a rehearsal: the notice says what it
would lock), then with `commit;`:

```sql
begin;
do $repair$
declare
  target uuid := '<gameweek id>';
  week app.fantasy_gameweeks%rowtype;
  locked_at_value timestamptz;
  repaired integer;
begin
  select * into week from app.fantasy_gameweeks where id = target for update;
  if week.status not in ('locked', 'live', 'provisional') then
    raise exception 'stop: gameweek % is %, not locked, live or provisional', target, week.status;
  end if;
  -- The moment the lock step locked the others.
  select min(l.locked_at) into locked_at_value from app.fantasy_lineups l
   where l.gameweek_id = target and l.locked_at is not null;
  if locked_at_value is null then
    raise exception 'stop: no lineup of gameweek % is locked; this is not the deadline race', target;
  end if;
  update app.fantasy_lineups set locked_at = locked_at_value
   where gameweek_id = target and locked_at is null and finalized_at is null;
  get diagnostics repaired = row_count;
  if exists (select 1 from app.fantasy_lineups where gameweek_id = target and locked_at is null) then
    raise exception 'stop: a lineup of gameweek % is still unlocked', target;
  end if;
  raise notice 'locked % lineup(s) of gameweek % at %', repaired, target, locked_at_value;
end
$repair$;
rollback;  -- change to commit; after the rehearsal
```

Then restore the tick. The next worker pass takes the snapshot as usual. Checked on the throwaway
database after reproducing the race: the block locked the one late lineup, and the snapshot no longer
refused with `fantasy_lineup_not_locked` (it went on to its next check). Not run on any real database.

## Rolling back

Forward-only: never edit the migration. To take it back, ship a **new** migration (and a guarded script
like this one) that restores the four definitions: `app_private.fantasy_assert_mutable_gameweek` as in
`20260720141854_fantasy_api_security.sql` (with `stable`), `api.create_fantasy_team` as in
`20261016170000_pilot_cap.sql`, and `api.activate_fantasy_chip` and `api.cancel_fantasy_chip` as in
`20260926003100_ordinary_account_mfa_step_up.sql`. Rolling back restores the defect.

## What was and was not run

Run in this session, on a throwaway local PostgreSQL 16.15 (unix socket only, deleted afterwards), with
every migration up to `20261016180000` applied in order (the pilot cap included) and local stand-ins for the Supabase roles, `auth`, `storage`,
`cron`, `net` and `vault`:

- the reproduction above (two sessions, the real functions, the lock step called directly and through
  `app_private.fantasy_lifecycle_tick()`), before and after the fix, again on the merged
  `create_fantasy_team` after the rebase onto the pilot cap, the chip between two lock-step pages
  before and after, and the consequence
  (`fantasy_lineup_not_locked` from `service_get_fantasy_scoring_snapshot`, the gameweek forced to
  `provisional` in the throwaway database only to reach that check);
- the window measurement inside the real functions, the natural-timing runs, the latency, the save
  during an open tick, the mixed load at the deadline (numbers above), and the repair block;
- the preview in a read-only and a read-write transaction;
- the apply script on copies: rehearsal, commit, a second run, and refusals (tick on, worker lease held,
  a deadline 10 minutes away, a pinned function changed, the replaced function already changed);
- `supabase/tests/database/fantasy_deadline_mutation_lock.test.sql` and `pilot_cap.test.sql` with
  `pg_prove`: both pass with the migration; without it the deadline file's shape checks and its
  between-pages chip checks fail (the chip is written); the whole pgTAP suite was run with and
  without the migration: the same ten files fail in this harness either way (limits of the stand-ins:
  storage grants, the Realtime publication, the vault and pg_net stand-ins, ops alert timing), none of
  them about Fantasy deadlines; every other Fantasy file passes;
- `bun run backend:migrations:check`, the script test, `bun test scripts/backend`, typecheck, ESLint and
  Prettier.

**Not run:** anything on Staging or Production; the Supabase stack and CI's `database-quality` job (the
authority for database tests); the tick's duration on production (the owner reads it, "What it
costs"); a load test on production or staging hardware (the numbers are from shared 4-core machines).
