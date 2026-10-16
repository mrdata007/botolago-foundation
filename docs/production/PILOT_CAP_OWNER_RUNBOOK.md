# The pilot cap (1,000 managers): owner runbook

> **Status, 2026-10-16: in the repository, NOT applied.** Nothing in this page has been run on
> Production V2 (`tkewgajrljbwgwedqsxn`) or on Staging V2. The migration is written, the guarded
> owner script is built, the tests are written; the database test (pgTAP) has not been run here and
> is for CI (`database-quality`) to prove. Nothing is switched on, and nothing is applied, until the
> owner authorises each operation separately (two of them, below).

Target: BotolaGO Production V2, project `tkewgajrljbwgwedqsxn`, Supabase SQL editor.
Migration: `supabase/migrations/20261016170000_pilot_cap.sql`.
Script: `scripts/backend/apply-20261016170000-pilot-cap.sql`
(built by `scripts/backend/build-apply-20261016170000-pilot-cap.ts`).
Database test: `supabase/tests/database/pilot_cap.test.sql`.
Front end: `src/backend/fantasy/errors.ts`, `src/services/fantasy-errors.ts`,
`src/services/fantasy-create-service.ts`, the `fantasy.create.error.pilot_full` message in both
dictionaries, tested in `src/services/fantasy-pilot-full.test.ts`.

## What it does, in plain words

BotolaGO launches as a **pilot capped at 1,000 managers** (owner decision, 2026-10-16). Until now
nothing enforced that number (`docs/production/2026-10-16-capacity-test-run-sheet.md`, section 2,
Q6). This adds a switch and a limit, and ships them **off**.

- **Off (the shipped state):** nothing changes for anyone. The create-a-team function reads one
  settings row and does nothing else.
- **On:** when a manager who has no team yet presses "create my team" and the season already has
  the maximum number of managers, the server refuses with `PT409 fantasy_pilot_full`. No team, no
  squad and no idempotency record is written.
- **Never affected:** a manager who already has a team (lineups, transfers, chips, leagues, reading
  their team, signing in); a repeat of a create that already succeeded (same idempotency key: the
  stored answer comes back); the sign-up of an account.

## What is counted (the exact rule)

A **manager** is a Fantasy team **of the season being joined** whose status is `active`
(the same "active" the rankings, the lifecycle and the admin overview use), **except** teams of
accounts on `app_private.public_ranking_exclusions` (the test and QA accounts the owner hid from the
rankings on 2026-10-11, `docs/backend/PUBLIC_RANKING_EXCLUSIONS.md`).

The rule is `app_private.pilot_manager_count(season_id)`, one function that the guard and you both
use. A new team is refused when that number is **at or above** `max_managers`: with a cap of 1,000,
the 1,000th team is created and the 1,001st is refused.

| Case                                              | Counts?                                                        |
| ------------------------------------------------- | -------------------------------------------------------------- |
| An ordinary manager with an active team           | yes                                                            |
| A hidden test or QA account                       | no, and it is **not refused** by the cap either                |
| A suspended or archived team                      | no (a reinstated team can push the number a few above the cap) |
| An account that was erased                        | no: its team is deleted, so its place is free again            |
| An account with no team (reader, Pronostics only) | no                                                             |
| A team of another Fantasy season                  | no (the cap is per season)                                     |

Why hidden accounts neither count nor are refused: they are not pilot participants, they would
otherwise use up places meant for real managers, and the owner needs them to keep testing a full
pilot. To keep a real person out of the count you must not hide them; to let a real person in when
the pilot is full, raise the number (below).

### Sign-up is untouched

Supabase Auth sign-up is **not** changed. Anyone can still create an account, read News and use
Pronostics. The cap is on **teams**, not accounts. A person who signs up after the cap is reached
sees the Fantasy create screen as usual; the refusal comes when they save their team. (Capping
accounts would need an Auth "before user created" hook configured in the Supabase dashboard, which
is not in the repository; that is the run sheet's option B and is not built.)

## What a manager sees

The create screen keeps the manager's squad (the draft is kept) and shows this message in the page
alert and as a toast, instead of the generic "your team could not be saved":

| Language | Message                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| French   | Les inscriptions de la phase pilote sont complètes pour le moment. Votre équipe n’a pas été créée : réessayez plus tard. |
| Arabic   | اكتمل عدد المشاركين في المرحلة التجريبية حاليًا. لم يتم إنشاء فريقك، يرجى المحاولة لاحقًا.                               |

**Owner to confirm Arabic.** The Arabic is short and formal, but no native reader has read it.

Known limit: the manager learns this when they press save, after building a squad. There is no
earlier "the pilot is full" screen. If you want one, it needs a read-only flag exposed to the app
(a follow-up; not built, to keep this change small). The mock backend (`src/services/fantasy-mock.ts`)
has no cap and no create-team errors, so mock mode simply ignores it.

## How it is made safe

- **Off means no effect.** The guard is one `select` of the singleton settings row and an `if`; the
  lock and the count are only reached when `enabled` is true. The rest of the function is the
  repository's latest definition (`20260926003100`), byte for byte; the script test proves that
  taking out the two added fragments gives the old text back.
- **Concurrency.** While the cap is on, a creator takes a **transaction-level advisory lock for the
  season** (`pg_advisory_xact_lock(hashtextextended('fantasy:pilot-cap:' || season id, 0))`) before
  it counts, and holds it until its transaction ends. Two people pressing save for the last place at
  the same moment therefore run one after the other, and the second counts after the first has
  committed (the function runs at READ COMMITTED, so the count is a fresh snapshot taken after the
  lock is granted). Exactly one gets the place; the other receives `fantasy_pilot_full`.
  A counter row was rejected: it would have to be kept in step with erasure, hidden accounts and
  suspensions, and could drift; the count is always the truth. The lock is the lighter choice: it is
  not taken while the cap is off, and while on it serialises one short transaction per new manager
  (about 1,000 in the pilot). It is taken last, after the function's existing locks, and no other code
  takes it, so it cannot deadlock.
- **Existing managers keep working.** Only `api.create_fantasy_team` changed. The pgTAP test checks
  that no other API function refers to the cap.
- **Closed to every API role.** The settings table has row security forced and no grant; the switch
  and the count are executable by `postgres` only (like `rivals_configure` and `trophy_configure`,
  whose conventions it follows; those switches keep no audit row, so neither does this one: the
  table's `updated_at` and the SQL editor history are the record).

## Applying it: two operations, each authorised on its own

Reading and checking first (AGENTS.md, "One writer at a time, per database"): this script creates one
table, two functions and replaces one function. **Nothing needs pausing**, because no scheduled job
and no Edge Function creates a Fantasy team or reads any of these objects; the only caller is a
manager's browser. (Its header spells this out.) Make sure no other schema change, apply script or
deploy is running at the same time: a rehearsal takes locks too.

### Operation 1: put the code in the database, cap OFF

1. Open `scripts/backend/apply-20261016170000-pilot-cap.sql`, paste the whole file into the
   Supabase SQL editor of **Production V2** (check the address contains `tkewgajrljbwgwedqsxn`), press
   Run. It is a **rehearsal**: it applies, checks and rolls back. The result row says
   "Rehearsal passed."
2. Change the line `rollback;` to `commit;` and run again. The result row says "Applied. The pilot
   cap exists and is OFF".

The script stops, saving nothing, if the live `api.create_fantasy_team` is not byte for byte the text
in `20260926003100` (it is pinned by md5), if any of the objects already exist, if the migrations it
depends on are not recorded, or if after the change any other function, the grants of the function,
the number of teams or the cron job list moved. Do not edit a check to make it pass.

### Operation 2: switch it on

Only when the owner decides, as a **separate** authorisation. First look (read-only):

```sql
select * from app_private.pilot_settings;
select s.id, s.name, s.status, app_private.pilot_manager_count(s.id) as managers
from app.fantasy_seasons s where s.status in ('registration_open', 'active');
-- Teams that are not counted, for reference:
select status, count(*) from app.fantasy_teams group by status;
select count(*) as hidden_accounts from app_private.public_ranking_exclusions;
```

Hide your own test and QA accounts first (`docs/backend/PUBLIC_RANKING_EXCLUSIONS.md`) if they
should not take places. Then:

```sql
select app_private.pilot_configure(true, 1000);
```

The result shows `{"enabled": true, "maxManagers": 1000, "countingRule": "teams"}`. It takes effect
for the next create; one already running finishes on what it read.

## Running the pilot

| You want to                                  | Run                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| See where the pilot stands                   | the `pilot_manager_count` query above                                                                                                |
| See the switch                               | `select * from app_private.pilot_settings;`                                                                                          |
| Raise the number (leave the switch as it is) | `select app_private.pilot_configure(null, 1500);`                                                                                    |
| Switch the cap on at 1,000                   | `select app_private.pilot_configure(true, 1000);`                                                                                    |
| Switch the cap off (instant, no deploy)      | `select app_private.pilot_configure(false);`                                                                                         |
| Lower the number                             | `select app_private.pilot_configure(null, 800);` (existing managers are kept; only new ones are refused until the count is below it) |
| Let one specific person in at a full pilot   | raise the number by one, wait for their team, lower it again; do not hide a real person                                              |

`null` leaves a setting as it is. A number below 1 is refused (`validation_failed`). Switching off
and on again keeps the number.

## Proving the race (staging only, by hand)

One database session cannot race itself, so the pgTAP file proves the mechanism (the lock is taken,
on the right key, only while the cap is on) and this proves the race. **Never on production.** On a
staging database with at least two test accounts that have no team and a cap set to the current count
plus one (`select app_private.pilot_configure(true, <count + 1>);`):

1. Session 1 (SQL editor, as the owner): `begin;`, then act as account A and create its team
   (`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated","aal":"aal1"}', true); select api.create_fantasy_team(<season>, <gameweek>, 'Race A', <selection>, <key A>);`).
   Do **not** commit.
2. Session 2: the same for account B (`Race B`, another key). It **waits** (the season lock).
3. Session 1: `commit;`. Session 2 now returns `PT409 fantasy_pilot_full`.
4. Afterwards `select app_private.pilot_manager_count(<season>)` equals the cap, not the cap plus one.

What was measured while writing this change: the guard text taken from the migration, run against a
stand-in PostgreSQL 16 (not Supabase, with a stub teams table, no authentication), with eight sessions
creating at once, four managers counted and a cap of five: with the lock, exactly one was created and
seven refused, in 10 of 10 repeats; with the lock removed (the control), all eight were created;
with the cap off, all eight were created. That shows the mechanism; it is not the CI result, and it is
not a test of the real function.

## Rolling back

Switching the cap **off** is the rollback for behaviour: `select app_private.pilot_configure(false);`.
Removing the code is a forward migration (never edit `20261016170000`) that restores
`api.create_fantasy_team` from `20260926003100_ordinary_account_mfa_step_up.sql` and drops
`app_private.pilot_manager_count`, `app_private.pilot_configure` and `app_private.pilot_settings`.

## Timing against the capacity test

`api.create_fantasy_team` is not in the load mix of the capacity test, the capacity and staging seeds
insert teams directly (the cap does not see them), and with the cap off the guard is one row read. The
migration can therefore be on staging for the window without moving the numbers; to test the code
that will ship, apply it to staging (cap off) before the window.

## What the tests prove, and what is still open

- `scripts/backend/apply-20261016170000-pilot-cap-script.test.ts` (run with `bun test`): the script is
  what the builder makes; it carries the migration byte for byte; the replaced function is pinned to
  the repository's latest definition and the new one is that text plus the guard and nothing else;
  the table ships off; no API role can call the switch or the count; nothing is paused and why.
- `src/services/fantasy-pilot-full.test.ts`: the new error code reaches the create screen as a French
  and an Arabic message.
- `supabase/tests/database/pilot_cap.test.sql` (pgTAP, for CI `database-quality`): cap off changes
  nothing even with a small number stored; counting (hidden and suspended teams excluded); cap on at
  N-1, N and N+1; a refusal writes nothing; a replay and "already has a team" are not turned into
  "pilot full"; a hidden account is not refused; switching off lets the next team in; the lock is
  taken on the right key only while the cap is on. **Not yet run by anyone** (no Docker in the
  authoring environment); it must pass in CI before the script is run on production.
- Still open: the two-session race on the real function (above), the native Arabic read, and an
  earlier "the pilot is full" screen.
