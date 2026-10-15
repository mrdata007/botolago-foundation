# Capacity and release evidence: a plan for the owner

Written 2026-10-15. This is a plan only. Every command in it is **NOT RUN**.
No database, host, workflow or setting was touched to write it. Audit item
A8 (SEC-02 and FANT-11) in `docs/audits/2026-10-14-audit-remediation-phase-a.md`.

Who does what, in this document:

- **Owner**: decides, pays, clicks buttons in Supabase, GitHub and Lovable.
- **Developer**: runs commands, reads results. Can be a hired person.
- **Claude can prepare**: writes text, checklists and commands. Cannot run
  anything on staging or production.

Words used once, here:

- **Migration**: a numbered change to the database.
- **Edge Function**: a small program that runs inside Supabase. The scoring
  worker is one.
- **Lease**: a single "I am working" marker, so only one scoring run is active.
- **Tick**: a scheduled wake-up call run by the database.

## 1. Why this matters

1. The audit says the launch is **not ready** until three things are proven.
2. **Capacity (SEC-02).** Nobody has shown the system holds under the crowd you
   expect. The last real test (July) failed at about 65 actions a second.
3. **Same version (A8).** Nobody can show that the live app, the database and
   the background jobs all come from the same code.
4. **Failed scoring run (FANT-11).** Scoring and ranking work in small
   batches. At scale a run could keep restarting and never reach everyone.
   A failed run has never been rehearsed.
5. The answer must come from a **copy of production** ("staging"), never from
   production itself. Staging writes count as writes (`AGENTS.md`).

## 2. Declared traffic: the numbers you must give

"Declared traffic" means: the crowd you promise the system can carry, written
down before the test. The test passes or fails against that written number.
Without it, any result is just a number.

The phone app is a thin shell around the live website (`PRODUCT.md`,
`docs/mobile/PHONE_APP.md`). Phone users and web users hit the same hosting
and the same Supabase back end, so count both together. Desktop is not a
priority, so no desktop-specific test is planned.

### Numbers the repository already contains

| Number                                                                                     | Where                                                                  | What it is                                                                   |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 2,500 test managers, 600 actions/s for 10 s, 250/s for 50 s, then 250/s for 10 min         | `docs/operations/LOAD_TEST.md`, `fantasy-load-test.yml`                | The existing deadline test. Fixed in the tool. A test shape, not a forecast. |
| Mix: 60% save lineup, 30% transfer, 5% Bench Boost, 5% open team                           | `docs/operations/LOAD_TEST.md`                                         | Test shape.                                                                  |
| 50,000 teams, 750,000 squad rows, a 10,000-member league, 1,000 other leagues              | `docs/backend/FANTASY_CAPACITY_REPORT.md`, `FANTASY_DOMAIN_RUNBOOK.md` | Size of the fake data staging holds.                                         |
| Up to 250,000 registered users, 50,000 people at once on match day                         | `docs/backend/GREENFIELD_MASTER_PLAN.md` section 15                    | An old planning guess "to be validated". Not a target.                       |
| Scoring cost grows with leagues; past about 700 leagues one Edge run cannot finish ranking | `docs/backend/FANTASY_WORKER_SCHEDULE.md`                              | Why the league count matters (FANT-11).                                      |

No document declares real expected traffic. The 2,500 figure is not a promise
(the audit says it "is not mandatory by default" and that a smaller, clearly
stated pilot limit is acceptable). Nothing here is invented: the questions
below are yours to answer.

### Questions for the owner

| #   | Question                                                                                         | A way to estimate                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Q1  | How many Fantasy managers do you expect at launch, and at the end of the season?                 | Waiting list, store pre-registrations, social followers times a cautious sign-up rate.                              |
| Q2  | How many people have the app or site open in the 10 minutes around kickoff of the busiest match? | Ask what share of Q1 watches a big match live. Give a low, likely and high share.                                   |
| Q3  | How many managers save a team or transfer in the last 10 minutes before a gameweek lock?         | Share of Q1. Give low, likely, high. The test should cover "high".                                                  |
| Q4  | How many new accounts in the busiest hour (a launch day, a press mention, a store feature)?      | Marketing plan. Supabase sign-up has its own limits; see step 10.                                                   |
| Q5  | How many private and public leagues, and the biggest league size, by season end?                 | Ranking work grows with leagues (FANT-11).                                                                          |
| Q6  | Full public launch, or a pilot with a stated cap (for example "first N managers")? What is N?    | A pilot with a tested cap is allowed by the audit. How a cap is enforced is not documented; the developer must say. |
| Q7  | What compute size is production on today, and what are you willing to pay for during the test?   | Supabase dashboard, section 3.                                                                                      |
| Q8  | Who is the one named person allowed to write to staging during the test window?                  | See the rule in section 3.                                                                                          |

Write the answers in the table in the checklist (section 8). If Q3 is larger
than what the existing test asks for, the existing test is too small and a
developer must extend it. That is code work and is outside this plan.

## 3. The staging copy

**It exists.** BotolaGO Staging V2 (`srdrflfrfpwixsllveid`) is the copy.
Production is BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`). Nothing new
needs to be created.

**"Same tier"** means the same Supabase compute size (and plan) as production.
Capacity is limited by that size, so a test on a smaller server proves nothing
about production. The July report found the limit was server CPU, not the
database queries, so adding indexes is not the answer.

- Where: Supabase dashboard, each project, **Settings, Compute and Disk**
  (`docs/operations/LOAD_TEST.md` step 2).
- The docs disagree. `LOAD_TEST.md` says production pointed to **Large** on
  2026-09-25. `FANTASY_CAPACITY_REPORT.md` says the size to certify is **XL or
  2XL**, and says no size has passed. **The owner reads the real size from the
  dashboard** and gives it to the developer as Q7.
- Disk on staging: at least 20 GB. On 2026-09-26 the fake data filled the
  disk and staging stopped.

**Who can create or refresh it:**

- Supabase resize: owner (dashboard access).
- Database updates and fake data: developer or owner, through GitHub
  **Actions, Staging database update**. Needs the access token stored in the
  GitHub environment `staging-load-test`.
- Amazon (AWS) machines for the test: need the role in the repository variable
  `AWS_LOAD_TEST_ROLE_ARN`. If it is gone, someone with the AWS account must
  recreate it. In July AWS also refused a first launch ("PendingVerification").
- Edge Functions on staging: a developer, with the Supabase command line and a
  staging-capable login. No workflow for this was found. See step 5.

**What data it holds:** fake data only. The load test creates temporary
accounts and deletes them. The seed (`scripts/backend/fantasy-staging-seed.sql`)
refuses to run if the database holds any Fantasy teams that are not load-test teams. No document permits
copying real personal data from production into staging. **Proposed rule, for
the owner to confirm: never copy production user data into staging.** Staging
also holds some staff and synthetic admin accounts; they are never deleted
(`docs/backend/ADMIN_CONTROL_PLANE_RUNBOOK.md`).

### One coordinated writer

A **writer** is anything that changes a database: a script, a workflow, a
person in the SQL editor, a scheduled job. The rule in `AGENTS.md`: **never
two writers on the same database at once, and check before writing.**

What happened (`AGENTS.md`, 2026-09-21): two efforts ran against staging for
about 88 minutes without knowing about each other. Half the second run's
migrations reported "already exists". The parity result had to be thrown away
and measured again. Nothing was damaged, by luck.

How it is enforced, and where it is not:

- GitHub workflows queue behind each other in one group
  (`phase6-staging-load-test`), and `scripts/backend/staging-writer-guard.py`
  refuses to start while another staging workflow runs.
- **It does not see** the nightly E2E run (variable `FANTASY_E2E_ENABLED`,
  03:00 UTC), scheduled database jobs, an Edge Function, a person in the SQL
  editor, or an assistant lane with backend scope. The E2E workflow uses a
  different queue from the load test, so both could start together.
- So a human rule is added: **one named writer (Q8) posts "staging is mine from
  HH:MM to HH:MM"** and everyone else, assistants included, stays out.

## 4. Run order

Follow the steps in order. Do not run two steps at once.

**Step 0. Declare the traffic.** Owner. Fill section 8 (Q1 to Q8). Decide
full launch or pilot. Nothing else starts before this.

**Step 1. Read-only baseline.** Developer. Check before: nothing. Run (all
NOT RUN, reads only):

- Statement limit (open item in Phase A). In the Supabase SQL editor of
  **production** (a read):

  ```sql
  select rolname, rolconfig from pg_roles
  where rolname in ('service_role','authenticator');
  ```

  If `statement_timeout` is above about 390 seconds, the developer must raise
  the lease extension first (`docs/backend/FANTASY_WORKER_SCHEDULE.md`).

- The version manifest on production and staging (section 5).
- On staging (a read): `select jobname, schedule, active from cron.job;`. Note
  which switches are on and save the output.

Read after: a saved baseline. Pass: every staging switch is off (or is paused
in step 2), and the statement limit is understood.

**Step 2. Claim the window.** Named writer. Check before, all of these:

- GitHub **Actions** shows no run in progress. Look at the staging workflows
  and `Fantasy authenticated E2E`.
- Turn the nightly E2E off for the window (set `FANTASY_E2E_ENABLED` to
  anything but `true`). Note the old value.
- No assistant lane with backend scope is running (`AGENTS.md`, rule 1 to 3).
- Pause what writes on its own, if on, noting each old value first. The
  exact commands are in `AGENTS.md` (NOT RUN). The main ones are
  `app_private.notification_email_configure('off', null, null, false)`,
  `app_private.fantasy_automation_configure(false)` and
  `app_private.fantasy_worker_configure(false)`, plus the Pronostics, Pépites,
  Manager Card, account-deletion and home-stories switches it lists.

Read after: all switches off, written down. Restore them in step 13.

**Step 3. Resize staging.** Owner. Same size as production (Q7), disk 20 GB or
more. Restart takes a minute or two.

**Step 4. Bring staging up to date.** Developer or owner. GitHub **Actions,
Staging database update**, in this order, each one finished first:
`plan` (read only), `rehearse`, then `apply`. For the last two the
confirmation is `UPDATE_STAGING_DATABASE`. Read after: staging lacks no
migration. If a run names a migration, send the link to the developer.

**Step 5. Deploy the Edge Functions to staging.** Developer, from the **same
commit** as step 4. NOT RUN, standard Supabase command:
`supabase functions deploy <name> --project-ref srdrflfrfpwixsllveid`. The
functions are the folders in `supabase/functions` (15 today). The failure drill
needs `fantasy-lifecycle-worker`, its scheduler secret and `functions_base_url`
set on staging. The repository does not document how staging is set up for
this. The developer must confirm and write down what was done.

**Step 6. Load the fake data.** Developer. **Staging database update**, action
`seed`, confirmation `UPDATE_STAGING_DATABASE`. It refuses to run if the
Fantasy tick is on or the disk has under 5 GB free.

**Step 7. Rehearsal (cents).** Developer. **Fantasy load test**, scope
`rehearsal`, `staging_compute` = the real size, confirmation
`RUN_FANTASY_LOAD_TEST`. It stops before renting anything if staging is not
ready. Pass: green run; it signs in 125 test accounts, sends no traffic and
cleans up to zero.

**Step 8. The full test (up to 2 hours, a few dollars).** Developer. Same
workflow, scope `full`. Read after: the verdict on the run page, then download
the evidence file (kept only **30 days**; save it into the evidence file).
Pass, from `scripts/backend/fantasy-load-test.py` and
`fantasy-capacity-orchestrator.py`:

- reads: 95 in 100 within 0.5 s;
- saves and transfers: 95 in 100 within 1.5 s, 99 in 100 within 3 s;
- unexpected failures: fewer than 1 request in 200;
- database CPU, connection use and pool use each below 80%;
- zero deadlocks;
- data checks all zero: no double transfer, no lost update, no negative bank,
  every squad 15 players;
- cleanup counted back to zero.

Any miss is a fail. The July run failed at about 65 actions a second.

**Step 9. Signed-in journeys.** Developer. **Fantasy authenticated E2E**,
target `staging`, confirmation `RUN_FANTASY_E2E`, **after** step 8 is finished.
It saves a squad, makes a transfer and creates a league as a test manager.
Pass: 6 tests passed, 0 skipped (`docs/engineering/LAUNCH_LEDGER.yaml`).

**Step 10. Browsing and sign-up bursts.** Not available today. The existing
test excludes match-day browsing, the website host and sign-up bursts
(`LOAD_TEST.md`, "What this test does not cover"), and the repository has no
tool for them. Owner decides: (a) a developer builds a simple read-only burst
test against the staging API for Q2, or (b) this stays an open risk. Never aim
a burst at the live site or Lovable hosting without their permission. Sign-up
bursts need Supabase's approval (`FANTASY_DOMAIN_RUNBOOK.md`). Pass limits must
be set by owner and developer first. Proposal: use the same read limits as step
8 and a failure rate under 1 in 200.

**Step 11. Failure drill.** Section 6.

**Step 12. Code checks.** Developer. In GitHub, `Backend quality` is green on
the exact release commit, including `database-quality` (database tests, not
run in the audit because Docker was missing).

**Step 13. Finish.** Named writer. Restore every switch from step 2 and
`FANTASY_E2E_ENABLED`. Shrink staging back (Supabase, Compute and Disk; the
disk can grow but never shrink). Take the manifest again (section 5). Save the
evidence (suggested file `docs/production/CAPACITY_EVIDENCE_<date>.md`):
declaration, manifest, run links, numbers. Say "window closed".

## 5. Version manifest

Goal: show that one source commit is what is live in four places.

| Part                  | Read-only check (NOT RUN)                                                                                                                                                                                                                                  | Defined in                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Source                | `git rev-parse origin/main` (the release commit)                                                                                                                                                                                                           | `docs/operations/DEPLOYMENT.md`                                                           |
| Website live          | `curl -sI https://botolago.com/ \| grep -i x-botolago-release` must equal the commit                                                                                                                                                                       | `vite.config.ts`, `src/lib/response-headers.ts`, `scripts/ops/watchdog.ts`                |
| Database migrations   | `psql "$DB_URL" -At -F $'\t' -f scripts/backend/sql/migration-ledger.sql > ledger.tsv`, then `bun scripts/backend/migration-ledger-compare.ts ledger.tsv`. Plain list: `select version, name from supabase_migrations.schema_migrations order by version;` | `scripts/backend/`, `docs/backend/MIGRATION_DRIFT.md`, `supabase/migrations/` (230 files) |
| Edge Functions        | `supabase functions list --project-ref <ref>` shows version number and last update per function                                                                                                                                                            | `supabase/functions/`                                                                     |
| Repository self-check | `bun run backend:migrations:check`                                                                                                                                                                                                                         | `package.json`                                                                            |

Limits to know:

- Staging only: **Staging database update**, action `check` (read only), reports
  migrations behind, the seed, the compute size and whether the Fantasy tick is
  off.
- The website check is the only one that shows a commit. The migration
  compare shows "pending" and "different code", which is the useful signal.
- **Edge Functions show a version number and date, not a commit.** No stamp was
  found in their code. The honest proof is: all deployed from the release
  commit in one session, dates written down, listed afterwards. Adding a stamp
  is a code change to propose later.
- Scheduled database jobs follow the migrations (`select jobname, active from
cron.job;`).
- The website has no staging copy that was found. The staging test proves the
  back end, not the Lovable publish.

Table to fill (one per place, once before and once after the window):

| Item                       | Production | Staging | Same? |
| -------------------------- | ---------- | ------- | ----- |
| Release commit             |            |         |       |
| `x-botolago-release`       |            | n/a     |       |
| Last migration applied     |            |         |       |
| Migrations pending (count) |            |         |       |
| Edge Functions (15) dates  |            |         |       |
| Compute size               |            |         |       |

## 6. Failure drill (staging only)

Goal: see a Fantasy scoring run fail, see the alarm, follow the written
recovery. Rules come from `docs/backend/FANTASY_WORKER_SCHEDULE.md`,
`docs/operations/ALERTS.md` and `docs/backend/FANTASY_MANUAL_WORKER_RUNBOOK.md`.

**Limit:** the GitHub orchestrator, the manual worker workflow and the
watchdog are fixed to production (`tkewgajrljbwgwedqsxn`). On staging only the
database-scheduled Edge worker can be rehearsed. The hand-over to GitHub when
the worker goes quiet is **not** rehearsed by this plan.

Before: steps 1 to 6 done, no load test running, a staging gameweek that has
work for the worker. How to prepare one is not documented; the capacity seed
holds provisional results, which may serve. Developer confirms. Staging needs a
test alert destination in Vault (`ALERTS.md`, webhook section), set by the
owner, or the alarm cannot be seen.

**Drill A. A write stalls.** Models SEC-01 and the Phase A lease behaviour.

- Break: a developer holds a lock on a row the scoring write needs, in an open
  SQL transaction, for longer than 30 seconds (the worker's call limit).
- Expect: the pass fails with `fantasy_worker_rpc_timeout` and `ambiguous`;
  the lease (the single "I am working" marker) is pushed out to 420 seconds
  and is not released until the database answers; no second gameweek starts;
  the tick answers `busy`; a row appears in `app_private.fantasy_worker_runs`.
- Alarm: no GitHub issue on staging (that comes from the production-only
  orchestrator). The health check `fantasy_worker` warns after 30 minutes and
  fails after 90 minutes without a good pass, so keep the lock held that long
  to see it; otherwise Drill B covers the alarm. The webhook and email send on
  `fail`, within about 5 minutes.
- Recover (`ALERTS.md`): end the held transaction. Wait until the lease
  expires (about 7 minutes). Check the gameweek's state before any re-run. The
  next tick should finish by itself. Read the lease (a read):

  ```sql
  select holder, expires_at, released_at from app_private.fantasy_worker_lease;
  ```

- Pass: failure recorded, no overlap, recovery without manual repair, then
  integrity queries in `scripts/backend/fantasy-staging-finalization.sql` show
  no duplicate result or rollover.

**Drill B. The worker goes silent.** Models ASTRA-02 and FANT-11 visibility.

- Break: the developer makes the tick answer `not_configured` (for example by
  clearing `functions_base_url`, after saving its value) while work is pending.
  Switching the worker off does not alarm: the check reads `ok` when off.
- Expect: no good pass; `warn` at 30 minutes; `fail` at 90; one webhook and
  email message. Plan about 100 minutes.
- Recover: restore the value, wait for one `ok` pass, expect a "recovered"
  message.

**Also check in both drills** (roadmap A6/A8): a prize problem shows as
`prizeAttention` in the run record (ASTRA-03); a missing lease function makes
the pass refuse (ASTRA-04).

**Scale (FANT-11):** the drills do not prove progress at scale. The developer
also runs two passes against the 50,000-team seed with a small call allowance
and records whether the second pass reaches further than the first. `FANTASY_WORKER_SCHEDULE.md`
says ranking restarts from the first league each pass; this is the measurement
the audit asks for.

## 7. What this plan does not prove

- **Real phones.** No phone build has run (`PRODUCT.md`). Test machines sit in
  Paris and call the API; they are not Moroccan mobile networks.
- **Real traffic mix.** The test replays deadline saves only. News, Pronostics
  and notifications are not loaded.
- **Match-day browsing and website hosting**, until step 10 is built.
- **Real match scoring.** Seeded scores do not certify live scoring
  (`FANTASY_MANUAL_WORKER_RUNBOOK.md`).
- **Edge limits.** The Edge CPU limit has never been measured on this
  project's runtime (`FANTASY_WORKER_SCHEDULE.md`).
- **The GitHub fallback** and the orchestrator work outside the lease
  (SEC-01 residual, Phase A risk 1): not tested here.
- **Data providers** (SofaScore) failing or slowing during a match.
- **Production itself.** Staging on the same size is the closest safe stand-in.

## 8. One-page checklist

Owner inputs (Step 0):

| Q                                             | Answer | Date |
| --------------------------------------------- | ------ | ---- |
| Q1 managers at launch / season end            |        |      |
| Q2 people at kickoff (low / likely / high)    |        |      |
| Q3 saves in last 10 min (low / likely / high) |        |      |
| Q4 new accounts in busiest hour               |        |      |
| Q5 leagues, biggest league                    |        |      |
| Q6 full launch or pilot cap N                 |        |      |
| Q7 production compute size, budget            |        |      |
| Q8 named writer, window                       |        |      |

Tick as done (all NOT RUN today):

- [ ] 0. Traffic declared and signed by the owner.
- [ ] 1. Baseline: statement limit read, cron switches saved, manifest taken.
- [ ] 2. Window claimed, no run in progress, nightly E2E off, switches paused and noted.
- [ ] 3. Staging resized to production size, disk 20 GB or more.
- [ ] 4. Staging database update: plan, rehearse, apply.
- [ ] 5. Edge Functions deployed to staging from the same commit.
- [ ] 6. Seed loaded.
- [ ] 7. Load test rehearsal green.
- [ ] 8. Full test and soak: every limit in step 8 met; evidence saved.
- [ ] 9. Signed-in E2E: 6 passed, 0 skipped.
- [ ] 10. Browsing and sign-up burst: built and passed, or accepted as open.
- [ ] 11. Drills A and B done; recovery and integrity checked.
- [ ] 12. Backend quality green on the release commit.
- [ ] 13. Switches restored, staging shrunk, manifest repeated and matching, evidence filed.

Stop at once if: another writer appears, a run names a migration it cannot apply,
the disk is low, or any number is unclear. Wait; do not retry blindly.
