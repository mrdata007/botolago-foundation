# Manager Card operations runbook

BG-0158. Migrations `20261008123000` to `20261008123400`. The design and the
owner's decisions are in `MANAGER_CARD_DOMAIN_PLAN.md`; this file is what the
owner and on-call do with it. The card is each manager's football identity,
built from their Fantasy play: an overall rating (OVR), a tier, four stats
(CAP, SEL, TRF, CON), a permanent number (`BOT #004821`) and an optional
FOUNDER mark.

## The one rule: the card is display only

OVR, tier, stats, number and founder mark are shown to signed-in users and
nothing else. **No prize, ranking, league or Fantasy rule may read card data.**
The card reads Fantasy tables and never writes one. A database test asserts
that no function outside the card's own reads `app.manager_card*`. If a change
asks a prize or a league to look at a card, stop: it is not allowed.

## What ships, and that it ships off

Applying the migrations (through the guarded script, see "Production order")
creates tables, functions and two scheduled jobs. It switches nothing on and
inserts no rules:

- both switches are `false` (`app_private.manager_card_settings`, one row);
- there is no rules row (`app_private.manager_card_rules` is empty);
- the four read functions refuse with `manager_card_off`;
- `manager-card-tick` runs every 15 minutes and answers `{"outcome":"off"}`
  without writing anything, the job log included;
- the account erasure now also waits for the card's lock (see "Account
  deletion").

## The two switches

One row in `app_private.manager_card_settings`, changed only by
`app_private.manager_card_configure(p_compute, p_read)`, which only the
`postgres` role can run. **`null` leaves that switch as it is.**

| Switch    | What it lets happen                                                                              |
| --------- | ------------------------------------------------------------------------------------------------ |
| `compute` | The tick may calculate and write cards. It still needs an active rules row.                      |
| `read`    | The four `api.get_*manager_card*` functions answer signed-in users instead of `manager_card_off` |

```sql
select app_private.manager_card_configure(true, null);   -- compute on, read untouched
select app_private.manager_card_configure(null, true);   -- read on, compute untouched
select app_private.manager_card_configure(false, null);  -- compute off, read untouched
select app_private.manager_card_configure(false, false); -- both off
```

Each call answers `{"computeEnabled": ..., "readEnabled": ...}`. Switch compute
on first and let the first evaluation finish and be checked; switch read on only
after that, so nobody sees an empty card.

## Rules v1

Nothing is calculated until an **active** row exists in
`app_private.manager_card_rules`. A row is `(version, config jsonb, active)`.
At most one row is active (a partial unique index enforces it).

### Calibration comes first, and it needs real numbers

The four scales and the tier cut-offs must come from real 2026/27 results, then
be frozen. **Never invent them, and never copy the placeholder numbers in tests
or in the plan.** Calibration needs an **owner-granted, aggregate-only read of
production**: the owner says in writing that it may be done, and it returns
only counts and percentiles, never a row that names a user or a team. What to
ask for:

- the number of teams and the spread of finished weeks per team;
- for each of the four raw figures (CAP, SEL, TRF, CON), the percentiles
  (1, 5, 10, 25, 50, 75, 90, 95, 99) over teams with at least the minimum weeks;
- the same for OVR once the scales are drafted, to place the tier cut-offs
  (aim: LEGEND top 1%, CHAMPION next 4%, PRO next 15%, STADE next 30%, HOMA the
  rest);
- how many teams have no transfer at all (their TRF is a dash, not 0).

Keep the output with the task evidence. The authorisation covers that read and
not the next one.

### The `config` shape

```json
{
  "minimum_gameweeks": 3,
  "provisional_below": 5,
  "trf_window_gameweeks": 3,
  "cap_ignore_deadlines_before": "<date PR #376 ships, ISO 8601 with Z>",
  "scales": {
    "cap": [
      [0, 1],
      [1, 99]
    ],
    "sel": [
      [0, 1],
      [1, 99]
    ],
    "trf": [
      [-10, 1],
      [10, 99]
    ],
    "con": [
      [0, 1],
      [1, 99]
    ]
  },
  "tiers": { "stade": 50, "pro": 65, "champion": 78, "legend": 88 },
  "batch_size": 500
}
```

The numbers above are **shape only**. Replace every one from calibration.

| Key                           | What it means                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimum_gameweeks`           | Finished weeks a team needs before it has a card. Under it, OVR, tier and stats are all empty. The read functions also use it to choose which season's card to show (last season's, with its label, until the new season reaches it).                   |
| `provisional_below`           | From the minimum up to this many weeks, the card is marked provisional.                                                                                                                                                                                 |
| `trf_window_gameweeks`        | How many gameweeks after a transfer are used to judge it (the new player's points minus the sold player's). At least 1.                                                                                                                                 |
| `cap_ignore_deadlines_before` | CAP skips weeks whose deadline is before this moment. Set it to when PR #376 reached production: before it, a manager who never picked a captain got the goalkeeper by default. See below. Optional in the code, but the owner decided to set it (D12). |
| `scales`                      | For each stat, points `[raw, score]` sorted by raw. The raw figure is mapped by straight lines between points, clamped outside the first and last point, rounded and kept between 1 and 99. At least two points each. CAP, SEL and CON raw run 0 to 1.  |
| `tiers`                       | The lowest OVR of each tier. Below `stade` is HOMA. Keep them rising: stade < pro < champion < legend.                                                                                                                                                  |
| `batch_size`                  | Once one tick has evaluated this many teams, it starts no further gameweek. A gameweek is never split, so the first one in a tick always runs whole.                                                                                                    |

A rules row with a missing or mistyped key does not break production: the tick
catches the error, writes an `error` row to the job log and carries on. But
check the JSON before you insert it.

### Inserting it

A rules row is **immutable once inserted** (a trigger refuses to change
`config` or `version`), and every evaluation is filed under the rules version
it used. So a change of formula is **a new version, never an edit**. The first
row:

```sql
insert into app_private.manager_card_rules (version, config, active)
values (1, '{ ...the calibrated config... }'::jsonb, true);
```

Later, to replace it (one transaction; the old version must go inactive first):

```sql
begin;
update app_private.manager_card_rules set active = false where active;
insert into app_private.manager_card_rules (version, config, active)
values (2, '{ ... }'::jsonb, true);
commit;
```

A new active version has no evaluations, so the next tick re-evaluates **every**
finished gameweek from the start, in order, a few per tick (see "Load"). Cards
move to the new figures as it catches up. Do not switch versions in the middle
of a gameweek's scoring.

### `cap_ignore_deadlines_before` and PR #376

PR #376 fixes the default captain. Until it is on production, weeks have a
captain nobody chose for managers who did nothing, which makes CAP noisy. Set
`cap_ignore_deadlines_before` in version 1 to **the date and time PR #376
shipped to production** (the Lovable publish, not the merge). If #376 has not
shipped when rules v1 is ready, wait or ship v1 without it and plan a v2; do not
guess a date.

## The founder grant

FOUNDER marks the early 2026/27 managers. It is granted **once, by the owner,
after the cut-off**, never later and never automatically. It marks Fantasy teams
of the season created **before the cut-off** that have **at least one finished
week**, for accounts that are not deleted, not staff (`app_private.staff_principals`)
and not `@botolago.com`. A card that already has a founder mark is left alone,
so running it twice cannot change anyone.

The call is `app_private.manager_card_grant_founder(p_fantasy_season_id uuid,
p_cutoff timestamptz, p_cohort smallint, p_excluded_user_ids uuid[])`. It
answers how many cards it marked and gives each one its permanent number as it
goes.

- the **cut-off** is the owner's date; a team created at or after it does not
  qualify;
- the **cohort** is a whole number from 1 (1 for the first cohort);
- the **exclusion array** is the owner's list of extra accounts to leave out
  (test accounts, friends of the house); pass `'{}'::uuid[]` for none. Staff and
  `@botolago.com` accounts are excluded anyway.

Rehearse it first. A `DO` block is one transaction, so ending it with a
deliberate `raise` shows the count and rolls everything back:

```sql
do $$
declare n integer;
begin
  n := app_private.manager_card_grant_founder(
    '<fantasy season id>'::uuid, '<cut-off, e.g. 2026-10-15T00:00:00Z>'::timestamptz,
    1::smallint, '{}'::uuid[]);
  raise exception 'dry run: would grant % founders', n;
end $$;
```

Check that the number is plausible against the count of qualifying teams, check
`select count(*) from app.manager_cards;` is still what it was, then run it for
real by calling `select app_private.manager_card_grant_founder(...)` with the
same arguments. It refuses (`manager_card_busy`) while the tick holds the card
lock; wait for the tick to finish. Run it **once**. It is the owner's call: an
agent does not run it on its own initiative, and the authorisation covers this
run and not the next.

## Pausing and restoring

Before a write that touches Fantasy results, lineups, player points,
gameweeks, teams, transfers, profiles or the card tables (AGENTS.md, "Before
writing"), pause compute and leave the read switch alone:

```sql
select app_private.manager_card_configure(false, null);
-- ...the write...
select app_private.manager_card_configure(true, null);  -- only if it was on before
```

Read what it was first (`select compute_enabled, read_enabled from
app_private.manager_card_settings;`) and restore exactly that. Pausing compute
does not hide cards: they stay as they were until compute is back on.

The daily prune `manager-card-history-prune` runs whatever the switch says. It
deletes this tick's `cron.job_run_details` rows older than 7 days and
`app_private.manager_card_job_log` rows older than 180 days, and never touches a
card table. Pause it by name for a write that touches those two tables, then
set it back to `true`:

```sql
select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-history-prune'), active := false);
select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-history-prune'), active := true);
```

To stop the tick itself without the switch (rarely needed; the switch is the
normal way): `select cron.alter_job((select jobid from cron.job where jobname =
'manager-card-tick'), active := false);`, and `true` to restore.

## What the tick answers and the job log says

Three answers write nothing and leave no job-log row, so a quiet table is
normal:

| Answer                   | Meaning                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `{"outcome":"busy"}`     | Another run (or the founder grant, or an account erasure) holds the card lock. The next tick tries again. |
| `{"outcome":"off"}`      | Compute is switched off.                                                                                  |
| `{"outcome":"no_rules"}` | Compute is on but no rules row is active.                                                                 |
| `{"outcome":"idle"}`     | Compute is on, rules are active, and nothing is left to evaluate. Also writes no row.                     |

When the tick did work it writes one row to `app_private.manager_card_job_log`.
Its `outcome` is:

| Outcome        | Meaning                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evaluated`    | All stale gameweeks were calculated. Good.                                                                                                                                                                                                                                                                                                               |
| `more_pending` | It stopped at `batch_size` teams with gameweeks still waiting. Normal while catching up; the next tick continues. If it stays that way for many hours after the last gameweek finished, see "Load".                                                                                                                                                      |
| `skipped`      | A gameweek could not be evaluated yet: its scoring version moved during the run (`version_changed`), or it is not evaluable after all. Nothing was written for it; it is retried. Persistent skips mean a correction is in progress or postwork is stuck.                                                                                                |
| `error`        | A gameweek raised an error. The rest of that season is held back (never evaluated out of order) and other seasons continue. `detail.lastState` carries the SQLSTATE; `manager_card_rules_invalid` is a bad rules row. A statement timeout does not reach the job log: it fails the whole pg_cron run, which shows as `failed` in `cron.job_run_details`. |

`detail` is counts only, never a user id: `rulesVersion`, `gameweeks`, `teams`,
`cardsWritten`, `historyWritten`, `capMismatches` (weeks CAP skipped because the
captain on record disagreed with the scoring details; never guessed), `failed`,
`skipped`, `morePending`.

## Health checks

Read-only; run any of them at any time. They return aggregate figures and no
user ids.

```sql
-- The switches and the active rules.
select s.compute_enabled, s.read_enabled, s.updated_at,
  (select version from app_private.manager_card_rules where active) as active_rules
from app_private.manager_card_settings s;

-- The two jobs, their schedule and whether they are active.
select jobname, schedule, active from cron.job
where jobname in ('manager-card-tick', 'manager-card-history-prune');

-- Recent ticks as pg_cron saw them (failures and run time).
select status, start_time, end_time - start_time as took, left(return_message, 120) as message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'manager-card-tick')
order by start_time desc limit 10;

-- What the tick did.
select started_at, finished_at - started_at as took, outcome, detail
from app_private.manager_card_job_log order by id desc limit 20;

-- Gameweeks that are evaluable but not evaluated under the active rules.
select gw.sequence_number, gw.id as gameweek_id, gw.scoring_input_version
from app.fantasy_gameweeks gw
join app_private.fantasy_gameweek_postwork work
  on work.gameweek_id = gw.id and work.calculation_version = gw.scoring_input_version
  and work.completed_at is not null
where gw.status in ('finalized', 'corrected') and gw.points_state = 'final'
  and not exists (
    select 1 from app_private.manager_card_evaluations ev
    where ev.gameweek_id = gw.id and ev.scoring_input_version = gw.scoring_input_version
      and ev.rules_version = (select version from app_private.manager_card_rules where active))
order by gw.sequence_number;

-- How many cards, by tier, and how many are provisional (the shape to compare to the calibration).
select tier, provisional, count(*) from app.manager_card_seasons group by 1, 2 order by 1, 2;

-- Numbers: how many are assigned, how many retired. No user id in the second.
select count(serial) as assigned, count(*) filter (where founder_cohort is not null) as founders
from app.manager_cards;
select count(*) as retired from app_private.manager_card_retired_serials;
```

Signs of trouble: a tick `error` in the job log; `cron.job_run_details` showing
`failed`; the "evaluable but not evaluated" query returning rows for hours while
compute is on; the tier shares far from the aim (the scales were calibrated on
other data: a new rules version, not an edit).

## Load

The calculation re-reads every finished gameweek of the season for every team,
every time, rather than adding up (so a second run changes nothing). That makes
one evaluation **O(teams x gameweeks so far)**. Measured locally: about 5.5 s for
4,003 teams at 4 gameweeks. Extrapolated: roughly 10 minutes for 50,000 teams
by gameweek 38. The tick's statement timeout is 10 minutes
(`set local statement_timeout = '10min'`), so late in a large season one
gameweek's evaluation could hit it, and then the pg_cron run shows `failed`
(a statement timeout, SQLSTATE `57014`) in `cron.job_run_details`, with no
job-log row. **Watch the `took` column of the job log and of
`cron.job_run_details` as the season grows**; act when a single run passes
about 5 minutes: lower `batch_size` (new rules version), or ask for the
calculation to be split by team range (a code change, not a setting).

Also expect a heavy catch-up when a new rules version is activated or a
correction rewrites an early gameweek: the evaluations are redone from that
week on. Do it outside match days. While it runs, it holds the card lock for
the length of each tick, which the account erasure and the founder grant wait
for (they retry; nothing is lost).

## Account deletion

Deleting an account (`docs/backend/ACCOUNT_DELETION_RUNBOOK.md`) removes the
card:

- the card rows (`app.manager_cards`, `app.manager_card_seasons`,
  `app.manager_card_gameweeks`) **cascade** from the profile, so no code has to
  remember to delete them;
- the card's **number is retired**: an AFTER DELETE trigger copies the serial,
  and nothing else, to `app_private.manager_card_retired_serials` (no user id,
  no link to the person). It is never issued again;
- the FOUNDER mark goes with the account;
- an account that is waiting to be erased (its profile has `deleted_at`) shows
  **no card** and is skipped by the tick;
- the erasure takes the card's lock (`botolago:manager-card`) without waiting,
  like the Fantasy, Pronostics, Pépites and prize locks. If the tick is mid-run
  it refuses with `account_deletion_writer_busy`, the worker releases the
  request, and the next hourly run erases it. So an erasure **waits for the card
  tick, and the tick never races an erasure**. A long catch-up (see "Load") can
  delay erasures by up to one tick at a time, not more.

## Production order

Do these in this order. Each step is the owner's, or done only with the owner's
authorisation, one step at a time (CLAUDE.md, "Production database writes").

1. **Already on production** as of 2026-10-08: `20261005130000` (public
   recaps) and `20261006143700` (automatic account deletion). The apply script
   refuses without them.
2. **This feature's apply script**,
   `scripts/backend/apply-20261008123000-manager-card.sql`, after the pull
   request is merged. Pause the Fantasy lifecycle tick first
   (`select app_private.fantasy_automation_configure(false);`) and switch it back
   on afterwards. Run it as a rehearsal ("Rehearsal passed"), then with
   `commit;` ("Applied"). It checks both switches are off, there is no rules
   row, the grants, the erase lock, both jobs, and that the tick answers `off`.
3. **Calibration and rules v1.** Owner-granted aggregate-only read, calibrate,
   set `cap_ignore_deadlines_before` to the day PR #376 shipped, insert version
   1 (see "Rules v1").
4. **The founder grant,** once, by the owner, after the cut-off, rehearsed
   first (see "The founder grant").
5. **Switches on.** Compute first (`manager_card_configure(true, null)`), wait for
   the tick, check the health queries and a few cards by hand, then read
   (`manager_card_configure(null, true)`). The Manager Card screens are a
   separate piece of work and ship after the backend is on.

To turn it all back off at any point: `select
app_private.manager_card_configure(false, false);`. Nothing is lost; cards stay
in place and the read functions refuse again.
