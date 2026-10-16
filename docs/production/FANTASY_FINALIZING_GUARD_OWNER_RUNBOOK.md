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
  erasure was refused (`service_release_account_deletion`, which keeps the message as
  `last_error`) and the next hourly pass tries again. The account was already disabled at the
  request; only the erasure waits, for the length of a finalization (minutes).
- **The weekly SofaScore catalog** (`service_sofascore_catalog_apply`) changes names, the
  `app.players` position and shirt numbers. None of those is in the document; it is not blocked.

## What to pause (AGENTS.md, "One writer at a time, per database")

The script changes the guards on tables the Fantasy lifecycle and the live refresh write.
Creating a trigger takes a short lock that waits for those writers (the script stops after 5
seconds instead of queueing). So the script **refuses to run** unless these two are paused, and
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

Not needed: the account-deletion tick (a few accounts an hour; if the script times out on the
lineups table, run it again), managers' own lineup edits (ordinary traffic, a moment's lock), the
Manager Card, Pépites, Trophées and Rivaux ticks (they read these tables; a new trigger does not
block a reader), and the news and prediction jobs (other tables).

**After the commit, restore only what was on:**

```sql
select app_private.fantasy_automation_configure(true);
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
   `tkewgajrljbwgwedqsxn`), SQL Editor, New query. Pause the two writers above.
2. Paste the whole script and press Run. As shipped it ends in `rollback;`: a **rehearsal**. The
   result row says "Rehearsal passed".
3. Change the line `rollback;` to `commit;` and press Run again. The result row says "Applied".
4. Restore what you paused.

The script refuses to run twice; refuses unless `20260927094823`, `20261009091728`,
`20261013160200` and `20261014170000` are recorded; refuses while the lifecycle tick or the live
refresh is on or the worker holds its lease; refuses unless the six functions it relies on are
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

- **A concurrent writer already past the check when the gameweek turns `finalizing`** (a window of
  one transaction) is not stopped. Closing it needs a lock that
  `api.service_begin_fantasy_finalization` would also have to take, and the lifecycle functions
  are not touched here. That function recomputes and compares the document in the same transaction
  that moves the status, so a change that committed earlier is refused there. Follow-up if wanted:
  have it take `fantasy:catalog:<football season>` shared, the lock catalog writers already take.
- **Other inputs of the document** (fixtures, assignments, performance rows, observations,
  scoring rules) have their own controls and are not part of this change.
- **The matcher's log label** does not show `createFailed`
  (`mapped=..,queued=..,conflicts=..`). Optional follow-up in
  `supabase/functions/_shared/sofascore-fantasy-auto.ts` if you want a held player visible in the
  live-refresh log.

## What was and was not run

Run in this session: the migration and a stub copy of the affected tables on a throwaway local
PostgreSQL 16 (unix socket only, deleted afterwards): every guard rule, the no-op and
non-input writes, the matcher's `BEGIN ... EXCEPTION WHEN OTHERS` shape, and the apply script
itself (rehearsal, commit, a second run, and seven refusals) with the real function bodies from the
repository. `bun run backend:migrations:check`, `bun run typecheck`, the script test and
`bun test scripts/backend` (see the pull request for the results).

**Not run:** the pgTAP file (`supabase/tests/database/fantasy_finalizing_scoring_inputs_guard.test.sql`):
Docker and the Supabase stack are not available here, so it has never executed; CI's
`database-quality` job is the authority. It exercises the real matcher, the real scoring input
document and the real triggers on the repository's schema. Nothing was run against Staging or
Production.
