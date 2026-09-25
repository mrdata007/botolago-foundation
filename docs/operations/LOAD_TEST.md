# Fantasy load test

A rehearsal of the busiest minute BotolaGO will have: the last minute before
a Fantasy deadline. 2,500 fake managers, each with their own account and team,
save lineups, make transfers and play chips all at once, and we measure
whether the database keeps up without losing or corrupting anything.

It runs on **BotolaGO Staging V2** (`srdrflfrfpwixsllveid`), never on
production. Real users are never touched.

## Why it matters

The only finished measurement (July, on a smaller server) started failing at
about 65 actions a second. The test asks for 600 a second for 10 seconds, then
250 a second. Production's own limit has never been measured.
`docs/backend/FANTASY_CAPACITY_REPORT.md` has the full history.

## What it does

| Part         | Detail                                                                                                                                                                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who          | 2,500 temporary accounts, created for the run and deleted after it                                                                                                                                                                                                                                        |
| From where   | 5 temporary computers rented from Amazon (AWS, Paris region), one per 500 accounts, so the traffic comes from 5 different addresses                                                                                                                                                                       |
| What they do | 60% save a lineup, 30% make a transfer (check, then confirm), 5% play Bench Boost, 5% just open their team                                                                                                                                                                                                |
| How hard     | 600 actions a second for 10 seconds, 250 a second for 50 seconds, then 250 a second for 10 more minutes                                                                                                                                                                                                   |
| Pass means   | 95 in 100 reads answered within 0.5 s and saves within 1.5 s (99 in 100 saves within 3 s); fewer than 1 in 200 requests failing unexpectedly; database CPU and connections below 80%; no deadlock; and no broken data: no double transfer, no lost update, no negative bank, every squad still 15 players |
| After        | every fake account, team and computer is removed and counted back to zero                                                                                                                                                                                                                                 |

It needs the **same database code as production** and the **same compute size
as production**, or the answer says nothing about production. The steps below
get staging there first.

## What it costs

- **Amazon**: 5 small computers for at most 105 minutes; they switch
  themselves off after that. The script refuses to start if its worst-case
  estimate could exceed $50.
- **Supabase**: staging on production's size while the test runs. Supabase
  bills compute by the hour; the resize screen shows the price. Shrink it back
  afterwards.

## Steps for the owner

Everything is in GitHub → **Actions**. Each button asks for a confirmation
word so it cannot be pressed by accident. Only one of these runs at a time;
a second one waits for the first.

### 1. Bring staging's database up to date (about 10 minutes)

On 2026-09-25 staging was 45 database updates behind production.

1. **Actions → Staging database update → Run workflow**, action **plan** →
   **Run workflow**. Read only. The run page lists the updates staging lacks.
   If it fails straight away, the Supabase key stored in GitHub has expired
   (see "If something fails" below).
2. Same button, action **rehearse**, confirmation `UPDATE_STAGING_DATABASE`.
   It runs the updates and then undoes them, so nothing changes. If one of
   them would fail, the run page names it.
3. Same button, action **apply**, confirmation `UPDATE_STAGING_DATABASE`.
   The updates go in one at a time. If one fails, it is undone, the ones
   before it stay, and the run stops and names it.

### 2. Make staging the same size as production (2 minutes, you only)

Supabase dashboard → **BotolaGO Production V2** → Settings → **Compute and
Disk**: note the size (on 2026-09-25 the database settings pointed to
**Large**). Then **BotolaGO Staging V2** → Settings → Compute and Disk → pick
the same size → confirm. Staging restarts for a minute or two.

### 3. Load the fake Fantasy data (a few minutes)

**Staging database update**, action **seed**, confirmation
`UPDATE_STAGING_DATABASE`. It creates the fake season and 50,000 fake teams the
test plays against. Running it again does nothing.

### 4. Rehearse the load test (about 20 minutes, cents)

**Actions → Fantasy load test → Run workflow**: scope **rehearsal**,
staging_compute = the size from step 2, confirmation `RUN_FANTASY_LOAD_TEST`.

It first checks that no other job is writing to staging and that staging is
ready (updates, fake data, size), and stops before renting anything if not.
Then it rents the 5 computers, signs in 125 fake accounts, sends no traffic,
and cleans up. A green run proves the Amazon
connection, the keys and the cleanup all work.

### 5. Run the real load test (up to 2 hours, a few dollars)

Same button, scope **full**. It repeats the rehearsal, then runs the
2,500-account test and the 10-minute soak, and cleans up.

### 6. Read the result

The run page shows the verdict (**PASS** or **FAIL/BLOCKED**) and the
numbers: how long reads and saves took (p95 = 95 in 100 answered within that
time), how many requests failed, the database's peak CPU, and the data checks.
The full evidence is attached to the run as a download for 30 days.

### 7. Shrink staging back

Supabase → BotolaGO Staging V2 → Settings → Compute and Disk → back to its
previous size (Micro on 2026-09-25).

## If something fails

| Where                                                    | What it means                                                                                                                                                  | What to do                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging database update fails at once                    | the `SUPABASE_ACCESS_TOKEN` stored in GitHub (Settings → Environments → `staging-load-test`) no longer works                                                   | create a new access token in Supabase (Account → Access Tokens) and replace the secret                                                       |
| rehearse or apply names an update                        | that update does not fit staging's current state                                                                                                               | send the run link to the developer; nothing else changed                                                                                     |
| A run stops at "No other staging writer is running"      | another job is writing to staging right now (the run page names it); two writers at once is how data gets damaged (`AGENTS.md`)                                | wait for that job to finish, then run again                                                                                                  |
| Load test stops at "Verify staging is ready"             | an update is missing, the fake data is not loaded, the Fantasy tick is switched on on staging, or staging is not (or cannot be shown to be) the size you typed | the run page says which; redo that step                                                                                                      |
| Load test stops at "Configure delegated AWS credentials" | the Amazon connection from July (variable `AWS_LOAD_TEST_ROLE_ARN`, and the matching role in AWS) is gone or changed                                           | nothing was rented; the developer needs the AWS account to recreate the role                                                                 |
| A run was cancelled halfway                              | fake accounts or computers may be left over                                                                                                                    | **Actions → Phase 6 staging cleanup**, confirmation `RUN_PHASE6_STAGING_CLEANUP`; the computers also switch themselves off after 105 minutes |

## What this test does not cover

- **Match-day browsing**: thousands of people reading scores and news at
  once. That is a different load (reads, cached pages) and has its own risks.
- **The website itself** (Lovable hosting) and sign-up bursts through Supabase
  Auth.
- **Production's limit directly**: staging on production's size is the
  closest safe stand-in. Load-testing production itself would slow the site
  down for real users.

## For developers

- `scripts/backend/staging-database-update.py` (plan, rehearse, apply, seed,
  check). It refuses any project other than Staging V2 by reference and name.
  Staging counts a migration as recorded by its **name**, because its history
  was partly recorded under apply-time versions; it also holds a few
  staging-only news-engine migrations the repository never kept, which the
  plan lists and leaves alone. `DEFERRED` holds the migrations production has
  deliberately not applied yet (today `20260925090500`); remove an entry once
  production applies it. A rehearsal stops after the first migration that
  adds an enum value, because Postgres cannot use a new enum value in the
  transaction that added it; apply checks the rest one at a time. To rehearse
  the script itself, point `BOTOLAGO_STAGING_DATABASE_URL` at a local
  database (`supabase db reset --local --version 20260921120000` reproduces
  staging's level).
- Apply installs production's pg_cron jobs on staging (news publication,
  Fantasy tick, email, alerts, Pronostics scoring, live refresh) with their
  switches as the migrations leave them: off. From then on staging has
  scheduled jobs like production, and the checks in `AGENTS.md` before a
  write apply to it too.
- `.github/workflows/fantasy-load-test.yml` is the PR #6 capacity gate
  (`phase6-capacity-gate.yml`, retired in #26) running from `main`, with the
  staging readiness check added and the verdict written to the run page
  instead of PR #6. The harness (`fantasy-capacity-orchestrator.py`,
  `fantasy-load-test.py`) is unchanged.
- Checked on 2026-09-25 against a local database with every repository
  migration: 125 temporary users, every load operation answered 200 (75
  lineup saves, 50 transfer previews, 50 confirmations, 25 chips, 25 reads),
  integrity checks all zero, cleanup back to zero. From a local copy at
  staging's level, apply brought all 427 API functions in line with
  production's (421 identical; the 6 others differ only in comment lines, as
  `docs/backend/MIGRATION_DRIFT.md` records).
