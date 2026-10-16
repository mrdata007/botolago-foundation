# A finalizing gameweek's scoring inputs cannot change: owner runbook

> **Status, 2026-10-16:** written, **not run on any shared or production database**. The
> migration, the guarded script and the database test are in the repository only. See "What was
> and was not run" at the end. Do not run the script until the pull request is reviewed and merged.

Target: BotolaGO Production V2, project `tkewgajrljbwgwedqsxn`, Supabase SQL editor.
Migration: `supabase/migrations/20261016110000_fantasy_finalizing_scoring_inputs_guard.sql`.
Script: `scripts/backend/apply-20261016110000-fantasy-finalizing-guard.sql`
(built by `scripts/backend/build-apply-20261016110000-fantasy-finalizing-guard.ts`).
Database test: `supabase/tests/database/fantasy_finalizing_scoring_inputs_guard.test.sql`.

## Why (audit finding SEC-01, 2026-10-16)

When a gameweek is `finalizing`, its scoring snapshot is sealed. Every later pass of
`service_finalize_fantasy_team_results` and `service_complete_fantasy_gameweek` recomputes the
scoring input document and `fantasy_assert_scoring_snapshot` compares its sha256 with the sealed
one: a difference raises `fantasy_scoring_input_changed`, and a new snapshot is refused while the
gameweek is `finalizing` (`fantasy_scoring_snapshot_missing`). So one change to what the document
lists leaves the gameweek unable to complete.

Nothing stopped such a change. The one that happens on its own: the SofaScore matcher
(`api.service_sofascore_auto_map_players`, called by `football-live-refresh` every minute, with no
lease) creates a player the catalog did not have, with his club membership and his Fantasy pool
entry. The pool entry is one more row in the document's `players` list. The two existing price
guards (`fantasy_guard_unfinished_price_catalog`, `fantasy_guard_unfinished_close_price_catalog`)
only refuse between price pages of a finalized or closed gameweek, never while it is `finalizing`.

## What it does

While **any gameweek of a Fantasy season has status `finalizing`**, three row triggers refuse, with
errcode `PT409` and message **`fantasy_scoring_inputs_frozen`**:

| Table                  | Refused                                                                                                                                                           | Why that and nothing else                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.fantasy_players`  | insert, delete, and a change of `fantasy_season_id`, `football_player_id`, `football_team_id` or `position_id` (and `id`)                                         | The document lists every row of the season: id, player, club, position code. Price, status, eligible, active, selected count and price version are not read: they stay writable. |
| `app.team_memberships` | insert, delete, and a change of `player_id`, `team_id`, `season_id`, `valid_from` or `valid_to`, **for a player in that Fantasy season's pool** (old and new row) | Adaptive documents read the membership of the match's season, club and dates. Shirt number, squad role, active flag, and any player outside the pool stay writable.              |
| `app.fantasy_lineups`  | delete of a lineup of the finalizing gameweek                                                                                                                     | `lineupCount` and the lineups digest are in the document. Only account erasure deletes lineups.                                                                                  |

It adds three functions (`app_private.fantasy_guard_finalizing_player_catalog`,
`..._squad_membership`, `..._lineups`) and three triggers
(`fantasy_players_guard_finalizing_inputs`, `team_memberships_guard_finalizing_inputs`,
`fantasy_lineups_guard_finalizing_inputs`). It writes no data and replaces no function. Fantasy
scoring rules, lifecycle states and every existing guard are unchanged: the new trigger names
sort **after** the existing pool triggers, so each existing guard still answers first where it
applies (a position change during `finalizing` still gets `fantasy_gameweek_locked`).

### The lock: no writer can commit after the seal

Each trigger first takes `FOR KEY SHARE` on the season's **current gameweek row** (status `open`,
`locked`, `live`, `provisional` or `finalizing`, in id order) and only then reads the status those
locks return. That is normally one row per season, but not always: since `20261013160000` the
index `fantasy_gameweeks_one_current_idx` only counts rows with `closed_at` null, so while staged
stats are on, a closed `provisional` gameweek and its open successor can both be non-terminal, and
the closed one can still go on to `finalizing`. The guard's `WHERE` has no `closed_at` filter, so
it locks and checks both rows.
`api.service_begin_fantasy_finalization`, the only function that moves a gameweek to `finalizing`,
locks that row `FOR UPDATE`, recomputes the scoring input document and moves the status in one
transaction, and `FOR UPDATE` conflicts with `FOR KEY SHARE`. So, for any two overlapping
transactions, either the writer holds the lock first (the finalization waits for its commit, then
recomputes the document with the writer's row in it: the seal is right, or is refused cleanly with
`fantasy_scoring_input_changed` while the gameweek is still `provisional`) or the finalization
holds it first (the writer waits, then reads `finalizing` and is refused). Readers, other
`KEY SHARE` holders and a plain `UPDATE` of the gameweek row (the lifecycle's status and counter
updates) are not blocked; only a `FOR UPDATE` waits, and only for the writer's transaction. The
membership trigger takes the lock only for a player who is in a pool (one lookup otherwise).

Lock order: a writer takes its table lock (at statement start), then this row. The lifecycle takes
the calendar advisory lock, then gameweek rows, then assignments and fixtures. The price batches
(`service_run_fantasy_price_batch`, `service_run_fantasy_close_price_batch`) take their table lock
on `app.fantasy_players` **before** the gameweek row, so a writer queues behind a batch before it
holds the row, and a batch queues behind a writer that already holds it.

Two deadlock cycles remain. PostgreSQL's detector ends each one (after `deadlock_timeout`, one
second by default) and each clears itself:

1. A long catalog write that holds pool-row locks (the player-list update, which already requires
   the lifecycle tick paused) against a lifecycle step that holds the gameweek row and updates the
   same rows. The matcher holds the player and retries; the worker retries. Account erasure can
   meet the lifecycle the same way on lineup rows; its worker retries hourly.
2. The matcher against the observation recorders. The matcher takes `KEY SHARE` on `app.fixtures`
   early (the queue insert and the match log foreign keys), then, when it creates a player,
   `KEY SHARE` on the gameweek through this guard. `api.service_record_fantasy_observation` (the
   SofaScore, reconciled and SportsMonks observation paths) and
   `api.service_select_fantasy_scoring_modes` lock the gameweek `FOR UPDATE` and then the fixture
   `FOR UPDATE`: the opposite order. It needs two overlapping calls for the **same fixture** (the
   live refresh has no lease). It was reproduced locally. The victim is either the matcher's
   creation (the player is held and retried on the next call) or the recorder (it marks the
   fixture for retry and uses one retry attempt). Seen in the logs as `deadlock detected` on one
   of those calls, once; a repeating one on the same fixture is worth a look.

A lifecycle step that takes gameweek rows in an order other than id (re-running
`service_prepare_next_fantasy_gameweek` while the next gameweek is already open locks the previous
one, then the next) can in theory meet a guard that takes them by id in the same way; it is the
same kind of cycle and is resolved the same way.

### What happens to the things that were writing

- **The SofaScore matcher** is not changed and does not fail. It creates each player inside a
  `BEGIN ... EXCEPTION WHEN OTHERS` block: the refusal undoes that one player (player,
  membership, pool entry), counts one in `createFailed`, leaves him on the staff list as
  `no_candidate`, and the rest of the batch and of the live refresh go on (a player with one
  candidate is still linked in the same call). The match stays held; the next live refresh or
  held-fixture retry calls the matcher again and creates him once the gameweek is no longer
  `finalizing`. Nothing to do by hand.
- **`api.admin_sofascore_create_player`** (staff, "create this player") gets the refusal as an
  error. Repeat it after the gameweek is finalized.
- **`api.service_apply_current_player_list`** keeps its own earlier refusal
  (`fantasy_gameweek_finalizing`); SportsMonks squad and player-list writes through the tables are
  refused by the triggers.
- **Account erasure** (`account-deletion-tick`, hourly at minute 23): the refusal rolls back the
  whole erasure (one transaction). `account-deletion-worker` already releases a request whose
  erasure was refused (`service_release_account_deletion`) and the next hourly pass tries again.
  The worker passes on only messages that start with `account_deletion_` (its `ERROR_CODE`
  pattern), so the request's `last_error` reads `database_unavailable`, not
  `fantasy_scoring_inputs_frozen`: a due request with that `last_error` during a finalization is
  this refusal. The account was already disabled at the
  request; only the erasure waits, for the length of a finalization (minutes).
- **The daily current-season recovery** (`.github/workflows/football-current-season-recovery.yml`,
  cron `43 7 * * *`, when `FOOTBALL_CURRENT_SCHEDULE_ENABLED` is `true`; `AGENTS.md` lists it with
  the scheduled writers) calls the database through the same tables. If it writes a pool row or
  a membership of a pooled player while a gameweek is `finalizing`, that call is refused with
  `fantasy_scoring_inputs_frozen` and the run fails; each call is one transaction, so nothing
  partial is left. If a run fails inside the window, nothing is urgent: wait until the gameweek is
  finalized and re-run the workflow (`workflow_dispatch`, mode `refresh`, with the reviewed commit
  and `RUN_CURRENT_SEASON_RECOVERY`); the next daily run would do the same. Around the apply
  script: avoid 07:43 UTC. A run that overlaps the script's short trigger lock waits, the script
  gives up after its 5 second lock timeout and fails safe, and is simply run again.
- **The weekly SofaScore catalog** (`service_sofascore_catalog_apply`) changes names, the
  `app.players` position and shirt numbers. None of those is in the document; it is not blocked.

## What to pause (AGENTS.md, "One writer at a time, per database")

The script changes the guards on tables the Fantasy lifecycle, the live refresh and account erasure
write. Creating a trigger takes a short lock that waits for those writers (the script stops after 5
seconds instead of queueing). So the script **refuses to run** unless these three are paused, and
refuses while the Fantasy worker holds its lease:

1. **The Fantasy lifecycle tick** (and with it the Fantasy worker tick: they score, lock, finalize
   and write prices and lineups). Look first, then pause:

   ```sql
   select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
   select app_private.fantasy_automation_configure(false);
   ```

   Pausing does not stop a pass already started; it keeps its lease for at most about eight
   minutes. Wait until this shows `released_at` set or `expires_at` in the past:

   ```sql
   select holder, expires_at, released_at from app_private.fantasy_worker_lease;
   ```

2. **`football-live-refresh`** (every minute; its matcher creates players and memberships). Look
   first (write down the answer: it is what you restore), then pause:

   ```sql
   select mode, test_user_ids, football_live_refresh_enabled from app_private.notification_email_settings;
   select app_private.notification_email_configure('off', null, null, false);
   ```

   This also stands down the e-mail and results jobs and the season refresh while it is off.

3. **The account-deletion tick** (hourly at minute 23): its erasure deletes lineups, which the new
   lineup trigger guards. Look first, then pause:

   ```sql
   select enabled from app_private.account_deletion_settings;
   select app_private.account_deletion_configure(false);
   ```

   A request that falls due meanwhile simply waits; asking to delete still closes the account at
   once.

**Pépites and the Manager Card: not required, and why.** `AGENTS.md` lists them for "a write that
touches ... team memberships" (Pépites) and "... lineups" (Manager Card). This script writes no row
of any of these tables: it adds triggers and function definitions. Both jobs only **read** the
guarded tables (they write their own tables), and creating a trigger takes a lock that does not
block a reader, so they cannot collide with it. If you prefer the strict reading anyway, with the
commands copied from `AGENTS.md`:

```sql
select mode from app_private.pepites_settings;          -- write it down
select app_private.pepites_configure('off', null);      -- restore: the mode it showed
select app_private.manager_card_configure(false, null);
select app_private.manager_card_configure(true, null);  -- afterwards, only if compute was on
```

Also not needed: managers' own lineup edits (ordinary traffic, a moment's lock), the Trophées and
Rivaux ticks (they read these tables), and the news and prediction jobs (other tables).

**After the commit, restore only what was on:**

```sql
select app_private.fantasy_automation_configure(true);
select app_private.account_deletion_configure(true);
select app_private.notification_email_configure('<mode it showed>', null, <test_user_ids it showed, or null>, <football_live_refresh_enabled it showed>);
```

While paused nothing is scored or finalized and no match is recorded. A few minutes is harmless.

## Before you start (read-only, any time)

```sql
-- A gameweek finalizing right now is protected from the moment the script commits; a change made
-- before that is not undone. Expect no rows, or note them.
select g.id, g.sequence_number, g.status from app.fantasy_gameweeks g where g.status = 'finalizing';

-- Nothing of the guard exists yet (no rows).
select tgname from pg_trigger where tgname like '%guard_finalizing_inputs';
select version from supabase_migrations.schema_migrations where version = '20261016110000';

-- The migrations the script is written against are recorded (four rows).
select version from supabase_migrations.schema_migrations
 where version in ('20260927094823', '20261009091728', '20261013160200', '20261014170000');
```

## Run it

Same way as the other guarded scripts (`docs/production/PHASE_A_B_MIGRATIONS_OWNER_RUNBOOK.md`):

1. Supabase dashboard, project "BotolaGO Production V2" (the address contains
   `tkewgajrljbwgwedqsxn`), SQL Editor, New query. Pause the three writers above.
2. Paste the whole script and press Run. As shipped it ends in `rollback;`: a **rehearsal**. The
   result row says "Rehearsal passed".
3. Change the line `rollback;` to `commit;` and press Run again. The result row says "Applied".
4. Restore what you paused.

The script refuses to run twice; refuses unless `20260927094823`, `20261009091728`,
`20261013160200` and `20261014170000` are recorded; refuses while the lifecycle tick, the live
refresh or the account-deletion tick is on or the worker holds its lease; refuses unless the six functions it relies on are
**byte for byte** the repository's latest definitions (md5 of their source): the two
price-processing guards, the pool rule trigger, the snapshot check, the catalog-player creation
and the SofaScore matcher; and refuses if the scoring input document functions no longer read the
pool, the memberships and the lineups, or read another player table the guard does not cover. A
refusal means the database is not in the state that was reviewed: send the message; do not edit a
check.

### Post-checks (read-only)

```sql
-- Three rows, all enabled ('O').
select c.relname, t.tgname, t.tgenabled
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where t.tgname like '%guard_finalizing_inputs' order by 1, 2;

-- Three functions, security definer, no API role may call them.
select p.proname, p.prosecdef, has_function_privilege('service_role', p.oid, 'execute') as service_can_call
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'app_private' and p.proname like 'fantasy\_guard\_finalizing\_%' order by 1;

select version, name from supabase_migrations.schema_migrations where version = '20261016110000';
```

While a gameweek is `finalizing`, a held player shows on the staff list with reason
`no_candidate` (`api.admin_sofascore_player_match_queue()`) and no new `app.fantasy_players` row
appears; once it is finalized the next live refresh creates him.

## Rolling back

Forward-only: never edit the migration. To take the guard away, ship a **new** migration (and a
guarded script like this one, with the same pauses) containing:

```sql
drop trigger fantasy_lineups_guard_finalizing_inputs on app.fantasy_lineups;
drop trigger team_memberships_guard_finalizing_inputs on app.team_memberships;
drop trigger fantasy_players_guard_finalizing_inputs on app.fantasy_players;
drop function app_private.fantasy_guard_finalizing_lineups();
drop function app_private.fantasy_guard_finalizing_squad_membership();
drop function app_private.fantasy_guard_finalizing_player_catalog();
```

Nothing else depends on them. Rolling back restores the defect.

## Not covered, and why

- **Known gap, follow-up: a score correction on an already finished fixture.** A SofaScore score
  or status correction written through `api.ingest_football_fixture`
  (`20260922200000_fixture_finalization_preserved.sql`, the `update app.fixtures` branch) can
  still change a fixture row that is part of the sealed document (`fixtures[]`: status, scores,
  `finalizedAt`, `sourceSequence`, `sourceVersion`), so it could strand a `finalizing` gameweek in
  the same way. It is **not guarded here**: fixtures are written by the football ingestion, not
  by the catalog writers this change is about, and a score change after the seal is a different
  decision (refuse, hold, or reopen the gameweek) that belongs to the owner and the fixture
  rules; this change does not touch fixture handling. **How to detect a stuck gameweek:** a
  gameweek in `finalizing` for much longer than a finalization pass, and
  `service_finalize_fantasy_team_results` / `service_complete_fantasy_gameweek` failing on
  **every** pass with `fantasy_scoring_input_changed` (see `app_private.fantasy_worker_runs`, the
  Fantasy worker ops health check and the worker logs). **What the owner does:** do not edit the
  sealed rows; find what changed (compare the sealed `payload` in
  `app_private.fantasy_scoring_snapshots` with
  `app_private.fantasy_scoring_input_document(<gameweek id>)`), then decide with the rules owner:
  put the fixture back by a reviewed correction, or reopen the gameweek by the documented
  correction path to re-seal. Do not weaken a guard.
- **Other inputs of the document** (assignments, performance rows, observations, scoring rules)
  have their own controls and are not part of this change.
- **The matcher's log label** does not show `createFailed`
  (`mapped=..,queued=..,conflicts=..`). Optional follow-up in
  `supabase/functions/_shared/sofascore-fantasy-auto.ts` if you want a held player visible in the
  live-refresh log.

## What was and was not run

Run in this session, on a throwaway local PostgreSQL 16 (unix socket only, deleted afterwards)
with stub copies of the affected tables:

- the migration and every guard rule (refusals, pass-throughs, the existing position guard
  answering first), including the matcher's `BEGIN ... EXCEPTION WHEN OTHERS` shape;
- the lock, with two sessions: a writer first makes the finalization's `FOR UPDATE` wait about 2 s
  and the finalizer then sees the writer's row; a finalizer first makes the writer wait about 2 s
  and then refuse; readers, a second writer and a plain `UPDATE` of the gameweek are not blocked;
  a price-batch-ordered session and a writer queue behind each other in either order with no
  deadlock; a pool player's membership writer makes the finalization wait;
- the apply script with the real function bodies from the repository (rehearsal, commit, a
  second run, and refusals, including the account-deletion switch);
- the membership trigger on 50,000 inserted rows, nothing finalizing: players outside every pool
  0.29 s without the guard, 0.99 s with it (about 14 microseconds a row; an earlier version without
  the early lookup cost about 126); players in a pool (the lock path) 0.24 s and 1.40 s; 50,000
  pool inserts 0.92 s and 1.48 s. A bulk load of memberships is not slowed noticeably.

`bun run backend:migrations:check`, `bun run typecheck`, the script test and
`bun test scripts/backend` (see the pull request for the results).

**Not run:** the pgTAP file (`supabase/tests/database/fantasy_finalizing_scoring_inputs_guard.test.sql`):
Docker and the Supabase stack are not available here, so it has never executed in this
environment; CI's `database-quality` job is the authority. It exercises the real matcher, the real
scoring input document and the real triggers on the repository's schema. Nothing was run against
Staging or Production.
