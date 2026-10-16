# Capacity test run sheet (audit item A8)

Written 2026-10-16 against `origin/main` at `9e7056ad`. This is a plan and a set of
blank forms. **Every command, workflow and check in it is NOT RUN.** No database,
host, workflow, setting or job was touched to write it, and nothing here says the
game has passed anything. What did run: the Python unit tests of the capacity scripts
(local, no network) and the repository's typecheck and lint, to check the launch-sized
code in section 1. Nothing ran against Amazon, Supabase or GitHub Actions, and no load
test of any size has run.

**What this page is for.** The capacity plan (CAP) has 13 steps. This page turns
them into a run order that one named writer, Claude (the owner's answer to Q8),
can follow without improvising, plus the form that records the result. When the
owner gives the production server size and the staging window, the only things
still missing are the owner's dashboard actions (section 5) and the window itself.

**Read in this order.** Section 1 (the decision on the test, two minutes), section 2
(the 1,000-manager cap: nothing enforces it today), section 5 (what the owner does),
then sections 3, 4 and 6 are for the person running the window.

Source key. Short names used below; line numbers are for the tree at `9e7056ad`.

| Short | File                                                                  |
| ----- | --------------------------------------------------------------------- |
| OWNER | `docs/production/2026-10-16-launch-blockers-owner-plan.md`            |
| CAP   | `docs/production/CAPACITY_AND_RELEASE_EVIDENCE_PLAN.md`               |
| LOAD  | `docs/operations/LOAD_TEST.md`                                        |
| CAPR  | `docs/backend/FANTASY_CAPACITY_REPORT.md`                             |
| WORK  | `docs/backend/FANTASY_WORKER_SCHEDULE.md`                             |
| FDR   | `docs/backend/FANTASY_DOMAIN_RUNBOOK.md`                              |
| AG    | `AGENTS.md`                                                           |
| CL    | `CLAUDE.md`                                                           |
| LT    | `scripts/backend/fantasy-load-test.py`                                |
| GATE  | `scripts/backend/fantasy-capacity-orchestrator.py`                    |
| SDU   | `scripts/backend/staging-database-update.py`                          |
| GUARD | `scripts/backend/staging-writer-guard.py`                             |
| MIG   | `supabase/migrations/20260926003100_ordinary_account_mfa_step_up.sql` |

Words used once: **staging** is BotolaGO Staging V2 (`srdrflfrfpwixsllveid`), the
practice copy. **Production** is BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`) and
is never written to by anything on this page. A **writer** is anything that changes a
database: a script, a workflow, a person in the SQL editor, a scheduled job (AG:23-26).
**RPS** is requests per second. **est.** marks my own estimate, not a figure from the
repository.

## 1. Decision: two profiles; the full gate stays, a launch-sized run is added beside it

### The decision

Owner, 2026-10-16: "do it how standard people launching an app do". The usual practice is
to size the test to the expected peak times a safety factor of 5 to 10, not to a far larger
number, and to keep a separate stretch run for information. The plan is therefore:

1. **Launch-sized run (new, separate mode `launch_sized`).** 1,000 users on five machines,
   175 RPS for 10 s, 65 RPS for 50 s, then a 10-minute soak at 65 RPS. About 10 times the
   declared deadline traffic. It is the run that informs the launch decision.
2. **The full gate is NOT replaced; its numbers are NOT edited.** The 2,500-user, 600/250 profile is
   still locked in code (section "How the lock works" below) and is still what the
   repository calls "the gate" (CAPR:62-63, CAPR:187). The audit's A8 item asks for "a
   current gate and soak on the declared traffic" (`docs/audits/2026-10-14-audit-remediation-phase-a.md:118-119`);
   this page does not close A8 on a launch-sized pass. Accepting launch-sized evidence as
   the A8 evidence is a deviation the owner records by name.
3. **Stretch run: informational only, not built yet** (numbers below). It never passes or
   fails anything.
4. The setup rehearsal (25 users a machine, no traffic) is unchanged and runs first in both.

Code status: the launch-sized mode is in the repository on its own branch, unit-tested, and
**never run end to end** (no staging window, no Amazon machines). Every number below is NOT
RUN.

### Where the numbers come from (arithmetic; est. = my assumption, to be challenged)

| Step                           | Arithmetic                                                                                                                                    | Result          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Requests per action            | mix 60/30/5/5 (LOAD:24), a transfer is 2 requests: (60 + 30 x 2 + 5 + 5) / 100                                                                | 1.3 (est.)      |
| Saves in the last 10 minutes   | 200 managers (Q3 high) x 3 actions (est.) x 1.3                                                                                               | 780 requests    |
| Average rate                   | 780 / 600 s                                                                                                                                   | 1.3 RPS         |
| Peak minute                    | half arrive in the last minute (est.): 390 / 60 s                                                                                             | 6.5 RPS         |
| Last 10 seconds                | the profile's own burst ratio 600 / 250 = 2.4 (est.): 6.5 x 2.4                                                                               | 15.6 RPS        |
| Safety factor 10               | sustained 6.5 x 10 = 65 (13 a machine); burst 15.6 x 10 = 156, rounded up to 175 (35 a machine), the first valid value (see below)            | 65 and 175 RPS  |
| Users                          | the season-end cap, all active (Q1, Q6): 1,000 = 5 x the 200 high-case savers; 10 x would be 2,000, more than the cap                         | 1,000 (5 x 200) |
| Browsing, not made by the tool | 300 people (Q2 high) x 2 live refreshes every 30 s (`src/lib/match-refresh.ts:36-41`; 2 per viewer est.) = 20; plus opens 300 x 5 / 600 = 2.5 | 22.5 RPS (est.) |
| Declared all-in peak           | 6.5 + 22.5                                                                                                                                    | about 29 RPS    |

Assumptions to challenge:

- The earlier text of this section used 1.4 requests per action (850 requests, 1.5 RPS
  average). The 1.3 above comes straight from the mix and replaces it. The code mix is per
  request (60/15/15/5/5, `pick_operation` in `fantasy-load-test.py`), which gives 1.18; I used the larger.
- 3 actions per manager, half of them in the last minute, and 2 live refreshes per viewer
  are my guesses, not measurements. Change one and the profile scales in proportion.
- The deadline and the biggest kick-off are taken as the same moment (conservative).
- Q4's 250 new accounts an hour is a sign-up load. It is not in these figures.
- Staging holds 50,000 fake teams, launch holds up to 1,000: conservative for the database.
- Why 175 and not 160. Whole numbers a machine are not enough: the orchestrator checks that
  the mix is exactly 60/15/15/5/5, so each machine's 60 s request count (10 x burst + 50 x 13
  a machine) must be a whole number of 100-request cycles. That needs burst a machine = 5
  modulo 10. 160 (32 a machine) gives 970 requests and fails the check; 175 (35) gives 1,000.

| Profile                 | Full gate (locked)                          | Launch-sized (new)                                       | Stretch (not built)        |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------- | -------------------------- |
| Mode / profile names    | `full_gate`: `merge_gate`, `telemetry_soak` | `launch_sized`: `launch_sized_gate`, `launch_sized_soak` | none yet                   |
| Users                   | 2,500 (5 x 500)                             | 1,000 (5 x 200)                                          | 1,000                      |
| Burst, then sustained   | 600 RPS 10 s, 250 RPS 50 s                  | 175 RPS 10 s, 65 RPS 50 s                                | 350 RPS 10 s, 150 RPS 50 s |
| Soak                    | 250 RPS, 10 min                             | 65 RPS, 10 min                                           | 150 RPS, 10 min            |
| Requests (gate + soak)  | 18,500 + 150,000                            | 5,000 + 39,000                                           | 11,000 + 90,000            |
| Against peak minute 6.5 | 38 x                                        | 10 x                                                     | 23 x                       |
| Against all-in 29       | 8.6 x                                       | 2.2 x                                                    | 5.2 x                      |
| Evidence label          | mode `full_gate`                            | mode `launch_sized`, "NOT the full 2,500-user gate"      | would need its own label   |

Read the last two rows plainly. On the saves alone the launch-sized run is 10 times the
declared peak. But the July bottleneck was CPU in the layer in front of the database, not
the queries (CAPR:21-27), and it is shared by every request. If browsing reaches the same
server, total request volume at the launch-sized rate is only 2.2 times the all-in peak,
and a 5 times margin on it would be 145 RPS (the stretch run is that, 150). By the same
arithmetic the existing gate (250) is 8.6 times the all-in peak, close to the usual 10.
Nobody has measured how much cheaper a browsing request is than a save. That is why the
browsing test (step 10, not built) is still needed beside either profile.

### The full gate on a Medium server: a FAIL is expected (unchanged by this plan)

- The last real measurement, on Medium, topped out near 65 RPS (CAPR:10-17). The gate asks
  for 250 sustained, 3.8 times that. The report says to certify on XL or 2XL; no size has
  passed (CAPR:47-56).
- The owner's Q7 answer is "we start with lowest" and no big budget (OWNER:129). At or below
  Medium the expected result of the full gate is a FAIL. If production is Large (LOAD:65-67
  said so on 2026-09-25), nobody has measured that size. OWNER:129 says what to do: say so
  plainly, claim no pass, do not buy a bigger server to get one.
- The declared crowd is far smaller than the gate: 6.5 RPS in the peak minute against 250
  (38 times), 200 savers against 2,500 accounts, a 1,000-member league against 10,000. The
  gate tests a much larger sustained load, not the shape of the declared rush.
- A full-gate FAIL is not a reason to edit the profile; it measures where the system broke.
  **Never edit the locked profile, and never call a launch-sized result "the gate".** After a
  full-gate FAIL the owner chooses: a bigger server (outside the budget), the launch-sized
  result as launch evidence with the A8 deviation recorded by name, or a lower cap.

### How the lock works, and what was added

- `fantasy-load-test.py`: each runner refuses `merge_gate` and `telemetry_soak` unless users
  are 2,500, sustained 250 and burst 600 (`!= 2500 ... may not be weakened`, LT:239-243 at
  `9e7056ad`). That branch is untouched. The launch-sized profiles got their own branch above it with
  their own fixed numbers, so `merge_gate` with launch numbers, or `launch_sized_*` with gate
  numbers, exits with an error.
- `fantasy-capacity-orchestrator.py`: a mode can only run its own profile pair
  (`measured_profile_names`), and the two gate profiles keep their commands byte for byte.
- `fantasy-session-provisioner.py` demands exactly 500 users a machine in `full_gate` mode and
  exactly 200 in `launch_sized`. The report script (`fantasy-capacity-report.py`) and the
  workflow scope `launch-sized` print a different heading, never the plain word PASS, and
  `fullGatePassed` stays false.
- One CI test pinned the whole orchestrator file by SHA-256. It was re-pinned on purpose
  (comment in `test_fantasy_capacity_orchestrator_diagnostic.py`); a reviewer must accept that.
- Tests: `scripts/backend/tests/test_fantasy_launch_sized_profile.py` (merge gate still
  refuses every weakening, commands unchanged, labels, the two cannot stand in for each other).

### PASS criteria (reused, none invented)

The launch-sized run is judged by the same code as the full gate: one shared branch in
`CapacityGate.run` and one `aggregate_profile` (GATE:1547-1551 and 2447-2457 at `9e7056ad`).
Every one must hold, for the 60 s part and for the soak: read p95 at most 500 ms; save and
transfer p95 at most 1,500 ms and p99 at most 3,000 ms; unexpected-error rate under 0.5%;
lock-timeout rate under 0.1%; integrity checks all zero; metrics complete; connection use,
server CPU and pool use each under 80%; zero deadlocks and conflicts; cleanup back to zero.

### What a launch-sized PASS does and does not prove

- Proves: at 1,000 accounts, deadline-style saves and transfers at 10 times the declared
  rate stay inside the gate's own latency, error, CPU and integrity limits, on staging at
  the stated compute size, on that date and commit.
- Does not prove: the full gate (2,500 accounts, 250 RPS).
- Does not prove: a margin on total traffic above 2.2 times, if browsing shares the server.
- Does not prove: browsing, sign-up bursts, real phones, the website host, or A8's other
  parts (version manifest, failure drills).
- It is weaker evidence than the full gate: about a quarter of the sustained rate and 40% of
  the users (65 RPS against 250). A pass can come on a server that would fail the full gate.
  Say "launch-sized", never "the gate".
- On Medium, expect a close call: the soak rate (65) equals the rate where July topped out
  (about 65). A FAIL there is plausible and is itself the answer to "is Medium enough".

### How to read the verdict in advance

- **PASS (launch-sized):** every criterion above met, cleanup zero. May be said: "the
  deadline-save load passed at 1,000 users and 65 RPS (10 times the declared peak)". Not "the gate".
- **FAIL:** setup fine, some criterion missed. Quote the achieved rate and what broke. If it
  broke above 6.5 RPS say "launch-sized failed; the declared crowd is not shown to be unsafe,
  but not proven". Next: the owner picks a bigger server, a lower cap, or accepts the risk.
- **BLOCKED** (user creation, Auth 429, Amazon refusal, runner exit, metrics gap): nothing was
  measured; not a fail (CAPR:148-153; FDR:156-168). Fix the cause, repeat the failed step.
- **Stretch:** run only after a launch-sized PASS; informational, no verdict. It needs a small
  code addition first (one more named mode, its label and an "informational" verdict).
- **Cost (est.):** the same five machines and the same worst case ($18.75, cap $50,
  GATE:85-96). The staging resize and disk (LOAD:71-75) cost the same as for the full gate.
- **Time (est.):** fewer users to create and sign in (200 a machine, not 500), so well under
  the 2 hours of the full run. The measured part is the same 11 minutes.
- **Run it:** Actions, Fantasy load test, scope `launch-sized` (rehearsal first, then the run).
  It is step 8L and is recorded in form 4.IL; the full gate is step 8 and form 4.I. The run
  page and the artifact name carry the scope: `fantasy-load-test-launch-sized-<run id>-<attempt>`.

## 2. Q6: how a 1,000-manager pilot cap could be enforced

### Finding, in plain words

**Nothing enforces a cap on managers or accounts today.** "Pilot capped at 1,000"
(OWNER:128) is a stated intention, not a mechanism. CAP:70 already says how a cap is
enforced "is not documented"; reading the code confirms there is none. I looked in the
sign-up flow, the Auth settings in the repository, database triggers, the database
functions that create a manager, and the Edge Functions.

### What exists today, with the places

1. **Sign-up goes from the browser straight to Supabase Auth.** The app calls
   `this.auth.signUp(...)` (`src/services/auth-supabase.ts:429`). No BotolaGO server code
   sits between the browser and Auth, and no Edge Function handles sign-up (the 15
   folders in `supabase/functions` contain none).
2. **The one trigger on new accounts only creates rows.** `botolago_v2_auth_user_created`
   (after insert on `auth.users`) runs `app_private.handle_new_auth_user`, which calls
   `ensure_identity` to make a profile and preferences (`supabase/migrations/20260720075453_identity_domain.sql:450-468`).
   It counts nothing and refuses nothing.
3. **Auth settings in the repository are the local template, not production.**
   `supabase/config.toml:176` has `enable_signup = true`, and the "before user created"
   hook is a **commented-out example** (`supabase/config.toml:278-281`). Production's real Auth
   settings live in the Supabase dashboard. The only record of them is a 2026-09-18 check
   that "sign-ups [are] enabled, e-mail confirmation required"
   (`docs/qa/FANTASY_LAUNCH_HARDENING_2026_09_18.md:178`). I cannot see whether a hook is
   set in the dashboard today.
4. **Creating a manager (a Fantasy team) has no count check.** `api.create_fantasy_team`
   (MIG:2275-2375) refuses only: a verified-MFA account not at step-up (MIG:2299), a
   season that is not `registration_open` or `active` (`fantasy_season_closed`, MIG:2306), a
   gameweek that is not the one a new team may join (`fantasy_gameweek_locked`, MIG:2315),
   and an account that already has a team (`fantasy_team_already_exists`, MIG:2335). No
   `count(*)`, no limit table.
5. **Triggers on `app.fantasy_teams`** refuse banned accounts
   (`supabase/migrations/20260924160000_admin_user_moderation_and_analytics.sql:240`) and
   unverified-MFA actors (MIG:311). Neither counts.
6. **Levers that exist but are not a cap:**
   - Setting the season to anything other than `registration_open` or `active` closes the
     game for everyone, new and old (MIG:2306). All-or-nothing.
   - Between deadlines no new team can join (`registration_closed` in
     `src/services/fantasy-availability.ts:7,59-66`). That is a timing rule, not a count.
   - A moderation ban stops one account (item 5).
   - The dashboard setting "allow new users to sign up" stops all new accounts, readers
     included. Not in the repository; I did not read it.
7. **An accidental throttle, status unknown.** On 2026-09-21 production sent Auth mail
   through Supabase's built-in service and a password reset returned 429 after two
   sign-up mails, so sign-ups were capped "at a handful per hour"
   (`docs/production/HUMAN_ACTIONS_2026_09_21.md:509-518`, ledger item BG-0108,
   `docs/engineering/LAUNCH_LEDGER.yaml:1130`). The ledger was last updated 2026-09-21
   (OWNER:432), so I do not know whether custom mail was set up since. It matters to Q4
   (250 new accounts an hour) more than to the cap, but if still true it limits
   sign-ups by accident and would also hit the staging window if staging used the same
   service (the test accounts use `.invalid` addresses and are created pre-confirmed,
   GATE:626-641, so they should send nothing).

### What would have to be built (not built; do NOT implement as part of this page)

First the owner must say what "1,000 managers" counts. My reading: **Fantasy teams in
the current season** (a manager is someone with a team). Readers and Pronostics-only
accounts would then still be able to sign up. If the owner means all accounts, see
option B.

**Option A (smallest, recommended): refuse the 1,001st team.**

1. A new migration adds one settings table, `app_private.pilot_settings`, one row,
   `max_fantasy_teams integer null` (null means no cap), and a service-only function
   `app_private.pilot_configure(p_max integer)` in the same style as the other switches
   (AG:67-359). It ships with the cap **off**.
2. The same migration re-declares `api.create_fantasy_team` with one more guard, placed
   after the "already has a team" check and before the insert (so an idempotent replay
   and existing managers are unaffected): take a transaction advisory lock for the
   season, count that season's teams, and if the count has reached the cap raise
   `PT409 fantasy_pilot_full`. The lock makes two simultaneous creations unable to both
   take the last place.
3. Front end: add `fantasy_pilot_full` to the error list
   (`src/backend/fantasy/errors.ts:3-8`), French and Arabic wording, and a "pilot full"
   state on the create page (the existing `registration_closed` state in
   `src/services/fantasy-availability.ts` and `FantasyUnavailableState.tsx` is the
   model). The Arabic needs the native reader again (OWNER:91, ARABIC).
4. Tests: a pgTAP file (cap null changes nothing; at the cap the next creation is
   refused; a replay with the same idempotency key still returns the cached team; two
   sessions racing for the last place) and a TypeScript test for the new error. CI's
   `database-quality` job is the authority (CL:62-66).
5. Applied to production through the reviewed guarded-script path, **one authorised
   operation for the migration and a second for setting the cap to 1,000** (CL:33-48).
6. Effort (est.): about one day of agent work plus review, plus the Arabic read.

Points to settle first: which teams count (staff, QA and test accounts are teams too;
`app_private.public_ranking_exclusions`, from migration `20261011160000`, is an existing
list of hidden test and QA accounts that a count could skip); what the full message
says; whether there is a waiting list (not included here); and the risk that
re-declaring `create_fantasy_team` copies a 100-line function, so the live text must be
read with `pg_get_functiondef` and diffed first (the same hazard OWNER:243-247 names for
the calendar function).

**Timing against the capacity test.** `create_fantasy_team` is not in the load mix
(LOAD:24), and a count over about 1,000 rows is cheap, so it is unlikely to move the
numbers. But the window should test the code that will ship (OWNER:404-406). Build and
merge it **before** the window, or accept in writing that it arrives after and add a
note to the evidence file.

**Option B: refuse the 1,001st account.** A Supabase Auth "before user created" hook
(a database function, switched on in the dashboard; the hook point exists in the
repository's config template, `supabase/config.toml:279`) that counts accounts and
refuses above the number. It counts readers too, a bug in it blocks **every** sign-up,
and I have not verified its availability on the project's plan or how the error reaches
the sign-up form. Not recommended unless the owner means accounts.

**Option C (no code, only a watch): count and flip a switch by hand.** Read the team
count weekly (or add it as a health check that warns at 900 and fails at 1,000) and, when
it nears the cap, turn sign-ups off in the dashboard or close the season. With 250 new
accounts possible in an hour (Q4) this can overshoot by that much before anyone acts, so
it is a stopgap, not an enforcement.

## 3. Run order for the single named writer

**The writer is Claude** (OWNER:130). Codex stays out unless Claude hands over a written
window and then Claude stays out. Everything below is one window; nothing overlaps.
Plan for 8 to 11 hours (est.: the failure drills alone wait about 100 minutes each, CAP:343;
step 8L adds about an hour, est.).
If the drills would run past the agreed end, close the window after step 9 (restore
everything, step 13) and open a second window for step 11. Never leave a half-done state
overnight.

**No production write appears anywhere on this page.** Production is only read: the
statement limit (the owner did it, OWNER:61-63), the website header, the migration list
and the Edge Function list. Every command that names a project names
`srdrflfrfpwixsllveid`. If `tkewgajrljbwgwedqsxn` appears in a command Claude is about to
run, stop.

Words for who does what: **Owner** clicks in Supabase, GitHub or AWS or decides.
**Claude** reads, runs and records. **Owner or Claude** means Claude does it if its
session can (see section 7, items 1 to 3), otherwise the owner does it from the exact
instructions given here.

### 3.1 Checks used by several steps

**CHECK-A, before every step that writes.** All of these; one failure is a stop.

1. In GitHub Actions, no run that is `in_progress` **or `queued`** for any of the staging
   writers: `fantasy-load-test.yml`, `staging-database-update.yml`,
   `phase6-staging-cleanup.yml`, `phase6-session-diagnostic-reproduction.yml`,
   `staging-mapping-supporting-dependency-rehearsal.yml`, `sofascore-id-bridge-staging.yml`,
   `phase65-functional-acceptance.yml`, `fantasy-authenticated-e2e.yml` (the list in
   GUARD:30-44). The guard itself looks only at `in_progress`, so queued runs are checked
   by hand.
2. Staging has no other active session (R1 below shows only Claude's own, plus Supabase's
   system sessions).
3. Every scheduled job on staging is as recorded in the writer ledger (R2 against the
   baseline). A job that is active and not in the ledger is a stop.
4. The owner has said, in this conversation, that Codex and anyone with SQL editor access
   are stopped. I cannot measure this; I ask.
5. The Fantasy lease is free (R3).
6. `git rev-parse origin/main` still equals the release commit recorded in step 0.

**Reads for staging** (all read-only; run in the Supabase SQL editor of
`srdrflfrfpwixsllveid`, or through a connection that names that project).

```sql
-- R1: who is connected and doing something
select pid, usename, application_name, state, left(query, 80) as query
from pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle'
order by backend_start;

-- R2: every scheduled job and whether it is on (AG:72-73)
select jobname, schedule, active from cron.job order by jobname;

-- R3: the Fantasy lease (AG:300)
select holder, expires_at, released_at from app_private.fantasy_worker_lease;

-- R5: seed profile (SDU:80-93), leftovers, and teams that are not load teams (the seed refuses these)
select
  (select count(*) from app.fantasy_teams)::integer as teams,
  (select count(*) from app.fantasy_squad_memberships where sold_at is null)::integer as active_squad_memberships,
  (select count(*) from app.fantasy_lineups where gameweek_id = 'fa640000-0000-4000-8000-000000000002')::integer as current_lineups,
  (select count(*) from app.fantasy_lineup_players)::integer as lineup_players,
  (select count(*) from app.fantasy_league_memberships where league_id = 'fa900000-0000-4000-8000-000000000001')::integer as large_league_members,
  (select count(*) from app.fantasy_leagues where name like 'Mixed Capacity League %')::integer as additional_leagues,
  (select count(*) from app.fantasy_team_gameweek_results where state = 'final')::integer as final_results,
  (select count(*) from app.fantasy_team_gameweek_results where state = 'provisional')::integer as provisional_results,
  (select count(*) from auth.users where email like 'fantasy-gate-%@staging.botolago.invalid')::integer as leftover_gate_users,
  (select count(*) from app.fantasy_teams team join auth.users account on account.id = team.user_id
     where account.email not like 'fantasy-load-%@staging.botolago.invalid')::integer as non_load_teams;

-- R6: statement limits and the API schema setting (WORK:155; CAPR:294-297)
select rolname, rolconfig from pg_roles where rolname in ('service_role','authenticator');

-- R7: size cross-check (SDU:291-298): 60 Micro, 90 Small, 120 Medium, 160 Large, 240 XL, 380 2XL
select current_setting('max_connections')::integer as max_connections;

-- R8: the worker's own record (WORK:309)
select * from app_private.fantasy_worker_runs order by finished_at desc limit 10;
```

Expected before the seed: `leftover_gate_users` 0 (the gate refuses to start otherwise,
GATE:474-479) and `non_load_teams` 0 (the seed refuses otherwise,
`scripts/backend/fantasy-staging-seed.sql:15-22`). R5 and R3 may fail with "relation does
not exist" before the migrations are applied (step 4); write "not on staging yet".

**Settings reads (R4), to save every old value.** One per writer; used in 3.2.

```sql
select * from app_private.notification_email_settings;
select * from app_private.fantasy_automation_settings;
select * from app_private.prediction_settings;
select * from app_private.pepites_settings;
select enabled, competition_id, max_articles_per_day from app_private.ai_content_settings;
select mode, test_user_ids from app_private.notification_push_settings;
select * from app_private.account_deletion_settings;
select * from app_private.manager_card_settings;
select * from app_private.ai_home_story_settings;
select * from app_private.rivals_settings;
select * from app_private.trophy_settings;
select enabled from app_private.ops_alert_state;
```

Record the **values** (mode, on or off, caps, intervals). Do not paste tester user ids
or URLs into the evidence file. A table that does not exist means that migration is not
on staging; write that down, and re-run after step 4.

**Rule for restoring: restore only what was on.** If a writer was off before the window,
pausing it is a no-op and nothing is restored. If it was on, the restore uses the
recorded value, not a guess.

### 3.2 Scheduled writers: pause and restore commands

The commands are copied from AG:67-359, unchanged, except that a command AG wraps over
two lines is joined on one. Where AG gives no literal restore line, the restore is marked
"derived" with its source. "This window" says what the plan does with each.

The window writes the Fantasy tables, fixtures and competitions (the seed), `auth.users`,
profiles, teams, squads, lineups, leagues, gameweek results, and (in the drills) rankings
and notifications. So **pause every writer that is on, except those marked "leave"**
(CAP:176-181 names the same set).

**W1. Email and results jobs, football live refresh, season refresh, weekly catalog**
(`notification-email-tick`, `football-live-refresh`, `football-season-refresh`,
`football-catalog-weekly`). Pausing it does not stop the push tick (W9, AG:179-181).

- Read: `select * from app_private.notification_email_settings;`
- Pause: `select app_private.notification_email_configure('off', null, null, false);`
- Restore (derived, `supabase/migrations/20260924140100_notification_email_delivery.sql:262-270`):
  `select app_private.notification_email_configure('<saved mode>', null, <saved test user ids or null>, <saved football_live_refresh_enabled>);`
- This window: **pause if on.** Expected already `off` on staging (the migrations leave it off, LOAD:151-155).

**W2. Fantasy tick (`fantasy-lifecycle-tick`) and the Fantasy worker (`fantasy-worker-tick`)**

- Read: `select * from app_private.fantasy_automation_settings;` and R3.
- Pause: `select app_private.fantasy_automation_configure(false);`
- Also, to stop only the worker: `select app_private.fantasy_worker_configure(false);`
- Restore: `select app_private.fantasy_automation_configure(true);` only if it was on;
  `select app_private.fantasy_worker_configure(true, <saved interval minutes>);` only if the worker was on.
- Wait for a running pass: AG:298-301 says to wait until the lease row shows `released_at` set or `expires_at` in the past (about eight minutes at most).
- This window: **pause if on, until step 11.** The seed and the readiness check both refuse
  while the tick is on (SDU:477-489, 634). Step 11 turns it on deliberately.

**W3. News publication** (`news-publish-due-editions`, no switch) and its prune
(`news-publish-due-editions-history-prune`, `notification-email-history-prune`)

- Pause: `select cron.alter_job((select jobid from cron.job where jobname = 'news-publish-due-editions'), active := false);`
- Pause the prunes:
  `select cron.alter_job((select jobid from cron.job where jobname = 'news-publish-due-editions-history-prune'), active := false);`
  `select cron.alter_job((select jobid from cron.job where jobname = 'notification-email-history-prune'), active := false);`
- Restore (derived, AG:92-94,101): the same commands with `active := true`.
- This window: **leave.** The window does not write the News tables or `cron.job_run_details`
  (AG:88-103 only asks for a pause when it does). If it is ever paused, resume it promptly:
  the health check `news_publication` fails after ten minutes without a heartbeat (AG:93-95).

**W4. Ops alerts** (`ops-alert-tick`)

- Read: `select enabled from app_private.ops_alert_state;`
- Pause: `select app_private.ops_alert_configure(false);`
- Restore: `select app_private.ops_alert_configure(true);` only if it was on.
- This window: **leave** (AG:108-112 says pause only for a write to its tables). It
  matters in step 11: it is the alarm. If it is on and points at a real destination, a
  saturated server during step 8 can send real messages; that is why owner action O9
  asks for a test destination.

**W5. Pronostics scoring** (`predictions-score-tick`) and `predictions-history-prune`

- Read: `select * from app_private.prediction_settings;`
- Pause: `select app_private.predictions_configure((select mode from app_private.prediction_settings), false);`
- Restore (AG:119-120, "pass `true` afterwards"): `select app_private.predictions_configure((select mode from app_private.prediction_settings), true);` only if scoring was on.
- Prune, only if its tables are written:
  `select cron.alter_job((select jobid from cron.job where jobname = 'predictions-history-prune'), active := false);` (restore: `active := true`).
- This window: **pause scoring if on** (CAP:180); **leave** the prune.

**W6. News sitemap** (`news-sitemap-refresh`, `news-sitemap-refresh-history-prune`)

- Pause: `select cron.alter_job((select jobid from cron.job where jobname = 'news-sitemap-refresh'), active := false);`
  `select cron.alter_job((select jobid from cron.job where jobname = 'news-sitemap-refresh-history-prune'), active := false);`
- Restore: same with `active := true`.
- This window: **leave** (AG:134-135: a write to the News tables does not need it paused).

**W7. Pépites** (`pepites-tick`) and `pepites-history-prune`; the photo job is manual

- Read: `select * from app_private.pepites_settings;`
- Pause: `select app_private.pepites_configure('off', null);`
- Restore: `select app_private.pepites_configure('<saved mode>', null);` only if the mode was not `off`.
- Prune, only if its tables are written: `select cron.alter_job((select jobid from cron.job where jobname = 'pepites-history-prune'), active := false);`
- The photo job (`scripts/backend/pepites-photo-job.ts`) is a write when someone runs it: **do not run it.**
- This window: **pause if on** (the seed touches fixtures, players and team memberships, AG:149-151); **leave** the prune.

**W8. AI articles** (`ai-content-generate`)

- Read: `select enabled, competition_id, max_articles_per_day from app_private.ai_content_settings;`
- Pause: `select app_private.ai_content_configure(false);`
- Restore: `select app_private.ai_content_configure(true);` only if it was on (the competition and cap are kept).
- This window: **pause if on.** It emails the owner about each article it publishes (AG:164-168).

**W9. Push notifications** (`notification-push-tick`)

- Read first (pausing clears the tester list): `select mode, test_user_ids from app_private.notification_push_settings;`
- Pause: `select app_private.notification_push_configure('off');`
- Restore: `select app_private.notification_push_configure('<mode>', array['<user id>'::uuid]);` for `testers`, or `select app_private.notification_push_configure('live');`
- Pausing does not stop a dispatch already woken: wait for it (AG:196-198).
- This window: **pause if on** (it writes notifications and deliveries, which the drills also write).

**W10. Account deletion** (`account-deletion-tick`) and `account-deletion-history-prune`

- Read: `select * from app_private.account_deletion_settings;`
- Pause: `select app_private.account_deletion_configure(false);`
- Restore: `select app_private.account_deletion_configure(true);` only if it was on.
- Prune, only if its tables are written: `select cron.alter_job((select jobid from cron.job where jobname = 'account-deletion-history-prune'), active := false);`
- This window: **pause if on** (it erases accounts and their Fantasy rows, AG:200-203); **leave** the prune.

**W11. Manager Card** (`manager-card-tick`) and `manager-card-history-prune`

- Read: `select * from app_private.manager_card_settings;`
- Pause: `select app_private.manager_card_configure(false, null);`
- Restore: `select app_private.manager_card_configure(true, null);` only if compute was on.
- The read switch for `app.manager_card_moment_acks` stays as it is (`manager_card_configure(null, false)` would hide Gradins, AG:244-249); the window does not write that table.
- Prune, only if its tables are written: `select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-history-prune'), active := false);`
- This window: **pause compute if on** (AG:229-231); **leave** the prune.

**W12. AI home stories** (`ai-home-stories`)

- Read, and record the enabled flag and the daily cap: `select * from app_private.ai_home_story_settings;`
- Pause: `select app_private.ai_home_stories_configure(false);`
- Restore: `select app_private.ai_home_stories_configure(previous_enabled, previous_cap);` with the recorded values, only after the window.
- Pausing does not stop a worker already dispatched: inspect jobs with `status = 'generating'` and the Edge logs, and wait (AG:258-265).
- This window: **pause if on.**

**W13. Rivals** (`rivals-tick`) and `rivals-history-prune`

- Read: `select * from app_private.rivals_settings;`
- Pause: `select app_private.rivals_configure(false);`
- Restore: `select app_private.rivals_configure(true);` only if it was on.
- Prune, only if its tables are written: `select cron.alter_job((select jobid from cron.job where jobname = 'rivals-history-prune'), active := false);`
- This window: **pause if on** (it reads the Fantasy results the window changes, AG:323-325); **leave** the prune. The owner meant Rivals and Trophées to be on in production (OWNER:356-361); this is about staging only.

**W14. Trophées** (`trophies-tick`) and `trophies-history-prune`

- Read: `select * from app_private.trophy_settings;`
- Pause: `select app_private.trophy_configure(false);`
- Restore: `select app_private.trophy_configure(true);` only if it was on.
- A pass already running holds a lock for up to ten minutes: check `select last_run_at, last_result from app_private.trophy_settings;` and wait (AG:348-351).
- Prune, only if its tables are written: `select cron.alter_job((select jobid from cron.job where jobname = 'trophies-history-prune'), active := false);`
- This window: **pause if on**; **leave** the prune.

**W15. GitHub-side schedules.** Only one targets staging: the nightly `Fantasy
authenticated E2E` (03:00 UTC), which runs only while the repository variable
`FANTASY_E2E_ENABLED` is `true` (`fantasy-authenticated-e2e.yml:32-33,49`). It is on a
different queue from the load test, so both could start together (CAP:134-137). Owner
action O5 turns it off and back. The hourly Fantasy orchestrator, the watchdog and the
football recovery do not name staging in their files, and the orchestrator is fixed to
production (CAP:301-303). I have not read each of those files line by line.

**W16. Members and the app.** Signed-in members writing their own rows (Manager Card
acks, card frames, Rivals pins) is ordinary traffic (AG:242-247, 357-359). Staging has no
real members.

### 3.3 The steps

Each step: **who**, **do**, **read before**, **read after**, **stop if**, **record**
(the section of the evidence form in part 4). Every write step begins with CHECK-A.

**Step 0. Declare, pin and confirm access.** (Owner, then Claude)

- Owner: gives O1 (production's size), O2 (spending), O3 (window), O4 (freeze), and
  signs the declaration in section 4.A by saying "agreed" in the conversation.
- Claude, reads only:
  - `git rev-parse origin/main`; write it down as the **release commit**. Nothing may be
    merged to `main`, and no production migration or deploy may happen, until step 13.
  - Confirm what Claude can do from its session (section 7, items 1 to 3); anything it
    cannot becomes an owner action in the window.
  - Write the claim message (below) but do not post it yet.
- Read before / after: none beyond the above.
- Stop if: production's size is still unread; the owner has not answered O2; `main` is
  not the commit the owner expects.
- Record: 4.A, 4.B.
- Claim message, to post at step 2: "STAGING (srdrflfrfpwixsllveid) IS CLAUDE'S FROM
  `<HH:MM>` TO `<HH:MM>` ON `<date>`. Codex and everyone else: do not run workflows,
  scripts or SQL against it until Claude says the window is closed."

**Step 1. Read-only baseline.** (Claude)

- Do: GitHub **Actions, Staging database update**, action `plan` (read only, no
  confirmation). It reports migrations staging lacks, whether the seed is loaded,
  the compute size and free disk (SDU:511-528). Then R1, R2, R3, R4, R5, R6 and R7 on
  staging.
- Production, reads only (Claude's read access, or the owner pastes): the manifest items
  of CAP:260-266 for the "Production" column of 4.C; production's statement limit is
  already read (OWNER:61-63), so write "owner read 2026-10-16: service role 60 s,
  authenticator 8 s (OWNER:62)" and do not repeat it.
- Pass: a saved baseline. The statement limit is understood: if staging's service role
  `statement_timeout` is above about 390 s, the lease extension must be raised before
  the drills (WORK:153-158); stop and ask.
- Record: 4.C (before), 4.D, 4.E (old values).

**Step 2. Claim the window and pause.** (Owner for O5; Claude for the rest)

- Owner: turn the nightly E2E off (O5) and say so.
- Claude: CHECK-A. Post the claim message. For each writer W1 to W14 that is **on**:
  record the old value, run the pause command from 3.2, then read it back. Leave the
  ones marked "leave".
- Read after: R2 and R4 again. Pass: every writer marked "pause if on" is off, written
  down with its old value; R3 shows a free lease.
- Stop if: a job appears that is not in the baseline; a writer will not pause; the lease
  is held (wait; do not force).
- Record: 4.B, 4.E.

**Step 3. Resize staging.** (Owner, O12)

- Owner: same size as production, disk 20 GB or more, in one change (Supabase allows four
  disk changes a day; a disk never shrinks). Staging restarts for a minute or two.
- Claude: wait for the owner's "done", then **Staging database update, `plan`** again.
- Read after: `compute` equals production's size (SDU:331-339 accepts `Micro`, `Small`,
  `Medium`, `Large`, `XL`, `2XL` and compares them to the size read from Supabase, else
  from `max_connections`) and `freeDiskGb` is at least 5 (the seed's floor,
  SDU:99). R1 shows staging reachable.
- Stop if: `compute` is `unknown` or differs; the disk is under 5 GB free; Supabase says
  "Disk modification limit reached" (wait for its timer).
- Record: 4.C (Compute size row), 4.F.

**Step 4. Bring staging up to date.** (Claude; owner clicks if Claude cannot dispatch)

- Do, in this order, each finished before the next: **Actions, Staging database update**,
  `plan`; then `rehearse` with confirmation `UPDATE_STAGING_DATABASE`; then `apply` with
  the same confirmation. `apply` runs each migration in its own transaction and stops at
  the first failure (LOAD:52-61).
- Read before: the `plan` output (pending list, `deferred`, `stagingOnly`).
  `20260925090500_fantasy_league_page_skip_empty.sql` is deferred because production has
  not applied it (SDU:68-72); staging must match production, so leave it.
- Read after: `plan` again shows `pending: []`. Then **re-take the inventory**: `apply`
  installs production's pg_cron jobs on staging, switches off (LOAD:151-155), and the
  jobs of later migrations did not exist at step 2. Run R2 and R4 again, add the new
  jobs to the ledger, and pause any that are on.
- Stop if: `rehearse` or `apply` names a migration. **Do not improvise.** In particular,
  if the named migration is one of the 20 from `20261013110000` to `20261014090100`:
  staging never got the SofaScore rating release, and a separate staging-only script
  exists, `scripts/backend/apply-20261014-sofascore-rating-release-staging.sql`,
  rehearsal-first, pasted in the SQL editor (OWNER:224-233). Using it is a separate
  write the owner must approve; ask.
- Also stop if the access token has expired (the run fails at once): the owner makes a
  new token (LOAD:117).
- Record: 4.F, 4.E (new jobs).

**Step 5. Deploy the Edge Functions to staging.** (Claude if its session has the
Supabase command line and a staging-capable login; otherwise a developer)

- Precondition: the working tree is clean and `git rev-parse HEAD` equals the release
  commit.
- Do (standard Supabase command, NOT RUN), once for each of the 15 folders in
  `supabase/functions`: `supabase functions deploy <name> --project-ref srdrflfrfpwixsllveid`
  with `<name>` in: `account-deletion-worker`, `ai-content-generate`,
  `fantasy-lifecycle-worker`, `football-ingest`, `football-live-refresh`,
  `home-story-generate`, `news-editorial-write`, `news-ingest`, `news-ingest-elbotola`,
  `news-media-upload`, `notification-email-dispatch`, `notification-email-unsubscribe`,
  `notification-push-dispatch`, `ops-alert-email`, `player-photo-upload`.
- Read before and after: `supabase functions list --project-ref srdrflfrfpwixsllveid`.
  Edge Functions show a version number and date, not a commit (CAP:275-278), so the
  honest proof is: all 15 deployed from the release commit in one session, dates
  written down, listed afterwards.
- The failure drills need `fantasy-lifecycle-worker` with its scheduler secret
  (`BOTOLAGO_SCHEDULER_TOKEN`) and `functions_base_url` set on staging (WORK:301-303).
  The repository does not say how staging was set up for this (CAP:197-200). Check with
  a read that does not print the value:
  `select functions_base_url is not null as has_url from app_private.notification_email_settings;`
  and ask the owner whether the secret is set. Never print either.
- Stop if: any command shows `tkewgajrljbwgwedqsxn`; a deploy fails; the list shows a
  function not redeployed.
- Record: 4.C (Edge Functions row), 4.F.

**Step 6. Load the fake data.** (Claude)

- Read before: R5. `non_load_teams` must be 0 and `leftover_gate_users` 0 unless
  `plan` already shows `seedLoaded: true` (then the seed does nothing,
  SDU:592-598). R4 shows the Fantasy tick off. The disk has at least 5 GB free.
- Do: **Staging database update**, action `seed`, confirmation `UPDATE_STAGING_DATABASE`.
  It refuses if the tick is on or the disk is short, and runs up to three attempts
  (SDU:592-620).
- Read after: R5. Every figure equals or exceeds the seed profile (50,000 teams,
  750,000 squad rows, 50,000 lineups, 750,000 lineup players, a 10,000-member league,
  1,000 other leagues, 50,000 final and 50,000 provisional results; CAPR:76-88). `plan`
  shows `freeDiskGb`; write it down.
- Stop if: `fantasy_capacity_seed_refuses_non_load_teams` (a real team is on staging,
  perhaps from an earlier E2E night: ask the owner, do not delete it yourself); the disk
  fills (LOAD:121-122).
- Record: 4.G.

**Step 7. Rehearsal.** (Claude dispatches; owner clicks if Claude cannot)

- Do: **Actions, Fantasy load test**, scope `rehearsal`, `staging_compute` = production's
  size exactly as typed in 4.A, confirmation `RUN_FANTASY_LOAD_TEST`. It first runs the
  writer guard, then `check` (nothing pending, seed loaded, tick off, size matches), then
  rents the machines (workflow lines 99-129).
- Read before: `plan` is clean; CHECK-A.
- Read after: the run page. Pass (GATE:2412-2420): all runners ready, no measured traffic,
  the metrics collector started, and cleanup counted back to zero. R5: `leftover_gate_users` is 0.
- Stop if: "staging is not ready" (the page says which); the Amazon role is gone or
  `PendingVerification` (FDR:163-176: stop, do not retry blindly, do not shrink the
  runner count); a run is cancelled halfway (run **Actions, Phase 6 staging cleanup**,
  confirmation `RUN_PHASE6_STAGING_CLEANUP`).
- Record: 4.H.

**Step 8. The full test (the full gate).** (Claude dispatches; Claude only watches while it runs)

- Do: same workflow, scope `full`. Up to 2 hours. While it runs Claude makes **no other
  write, no other dispatch and no resize**; it may read R1, R2 and the run status.
- Only a `full`-scope run belongs in this step and in form 4.I. A `launch-sized` run is
  step 8L and form 4.IL; never copy one into the other.
- Read after: the verdict on the run page, then the evidence artifact
  `fantasy-load-test-full-<run id>-<attempt>`, kept only **30 days**: copy the numbers into
  4.I the same day. Then R5, R2, R3. If the artifact name says anything but `full`, stop:
  it is not this step's evidence.
- Pass requires every one of these, from `fantasy-capacity-orchestrator.py` (GATE:1547-1551,
  2447-2457), for the gate and the soak: read p95 at most 0.5 s; save and transfer p95 at
  most 1.5 s and p99 at most 3 s; unexpected-error rate under 0.5% (1 in 200); lock-timeout
  rate under 0.1%; integrity all zero (the nine checks listed in 4.I); metrics complete
  (no scrape errors); database connection use under 80%; server CPU under 80%; pool use
  under 80%; zero deadlocks; zero conflicts; cleanup back to zero. Any miss is a fail.
- Stop if: another writer appears (**the run is then not evidence**, AG:370-372: stop,
  let both finish, repeat); a runner exits; Auth returns 429 while preparing users
  (BLOCKED, FDR:156-161); the disk fills.
- Record: 4.I, 4.J.

**Step 8L. The launch-sized run (NOT the full gate).** (Claude dispatches; Claude only
watches while it runs)

- When: the owner's choice, after step 7 and before steps 9 to 13. It may run before step 8,
  after it, or instead of it, but **never overlapping**: one run and its cleanup finish,
  counted back to zero, before the other starts. Suggested: 8L first (shorter); then step 8
  only if the owner still wants the full gate. If step 8 is skipped, A8 stays open against
  the full gate (section 1) and the owner records the deviation in 4.N.
- Preconditions: those of step 8 (steps 1 to 6 done, CHECK-A, the writer guard), and the
  launch-sized code merged to `main` with the owner's approval (the scope does not exist on
  `main` before that; section 7 item 11).
- Do: **Actions, Fantasy load test**, scope `launch-sized`, `staging_compute` as typed in 4.A,
  confirmation `RUN_FANTASY_LOAD_TEST`. It runs the rehearsal, then 1,000 users at 175 RPS
  for 10 s, 65 RPS for 50 s and a 10-minute soak at 65 RPS. While it runs Claude makes no
  other write, dispatch or resize.
- Read after: the run page. Its heading must say "LAUNCH-SIZED run, staging: NOT the full
  capacity gate" and the verdict "LAUNCH-SIZED PASS (not the full gate)" or "FAIL/BLOCKED".
  Then the artifact `fantasy-load-test-launch-sized-<run id>-<attempt>` (30 days): copy the
  numbers into **4.IL** the same day, never into 4.I. Then R5, R2, R3.
- Pass: the same list as step 8, for the 60 s part and the soak (one shared code path, so
  nothing here is a different threshold).
- On FAIL: record in 4.IL the highest sustained rate reached, the first criterion to break and
  where. Do not rerun to chase a pass without changing something and writing why. Do not edit
  either profile. A launch-sized FAIL means the full gate, which asks for 3.8 times the rate,
  is expected to fail too at that server size: skip it unless the size changed. The owner
  chooses per section 1: a bigger server, a lower cap, or accept the risk. Say "launch-sized
  failed", never "the gate failed".
- Stop if: as step 8 (another writer appears and the run is then not evidence; a runner
  exits; Auth 429 while preparing is BLOCKED, not a fail; the disk fills).
- Record: 4.IL, 4.J.

**Step 9. Signed-in journeys.** (Claude dispatches, **after** step 8 and step 8L, whichever
ran, and their cleanup)

- Do: **Actions, Fantasy authenticated E2E**, `target` = `staging`, confirmation
  `RUN_FANTASY_E2E`. **Never `production`** (the same dispatch offers it). It saves a
  squad, a captain and a transfer and creates a league as the synthetic manager.
- Note: it creates a real (non-load) team on staging, so a later `seed` would refuse
  (see step 6). Do it after the seed, and do not plan another seed after it.
- Pass: 6 tests passed, 0 skipped (CAP:232; `docs/engineering/LAUNCH_LEDGER.yaml:3406`).
  The run fails rather than skip when the credentials are missing (workflow header).
- Stop if: the `fantasy-e2e` environment or the synthetic account is missing (owner
  action O7).
- Record: 4.K.

**Step 10. Browsing and sign-up bursts.** (Owner decides; not run in this window)

- There is no tool for them (LOAD:126-131, CAP:234-242). Record the owner's choice:
  (a) a developer builds a read-only burst test sized to Q2 (50 / 150 / 300) and Q4 (250
  an hour) against the staging API; or (b) it stays an open risk. Sign-up bursts need
  Supabase's approval (FDR:156-161). Never aim a burst at the live site or at Lovable
  hosting without their permission.
- Record: 4.L.

**Step 11. Failure drills.** (Claude directs; see the notes on who holds a lock)

Rules are CAP:295-355. The break-and-restore sheet for Drill A and Drill B is a separate
document (OWNER:198-199, not in this change); this step lists only what the run order
needs. These are the only steps that switch the Fantasy worker on.

- Preconditions: steps 1 to 6 done; **no load test running; and steps 8 and 8L are
  finished for good.** The drills finalize the synthetic gameweek and roll teams over, which
  uses up the seed's state; do not plan another step 8 or 8L after step 11 without asking a
  developer how to reset it. A staging gameweek with work for the worker must exist; how to prepare
  one is not documented (CAP:306-309), so the developer confirms. The test alert
  destination is set (O9), or the alarm cannot be seen.
- Deliberate switch changes, each written in the ledger with its old value:
  `select app_private.fantasy_automation_configure(true);` then
  `select app_private.fantasy_worker_configure(true);`. All other writers stay paused.
  Restore both to their step-1 values at the end.
- **Drill A (a write stalls).** Break: a SQL session holds a lock on a row the scoring
  write needs, for longer than 30 seconds. The row has to be chosen by reading the first
  write function the pass calls with `pg_get_functiondef`; write the chosen statement in
  4.M before running. **The lock cannot be held by stateless tool calls**: it needs a
  live SQL editor tab or `psql` session. That session is part of the named writer's
  window, directed statement by statement by Claude and logged in 4.B; it is not a second
  writer, and nobody else is to touch staging. Expect (CAP:314-319): the pass fails with
  `fantasy_worker_rpc_timeout` and `ambiguous`; the lease is pushed to 420 seconds and is
  not released until the database answers; no second gameweek starts; the tick answers
  `busy`; a row appears in `app_private.fantasy_worker_runs` (R8). The `fantasy_worker`
  health check warns after 30 minutes and fails after 90, so seeing the alarm means
  holding the lock that long. Recover: end the held transaction, wait for the lease to
  lapse (about 7 minutes, R3), check the gameweek before any re-run, let the next tick
  finish. Pass: failure recorded, no overlap, recovery without manual repair, then the
  integrity queries in `scripts/backend/fantasy-staging-finalization.sql` show no
  duplicate result or rollover.
- **Drill B (the worker goes silent).** Break: save `functions_base_url` (read it, record
  that it existed, do not paste it) and clear it, with work pending. Expect `warn` at 30
  minutes, `fail` at 90, one webhook and email message; plan about 100 minutes. Recover:
  restore the value, wait for one `ok` pass, expect a "recovered" message. The changing
  statements are direct updates to `app_private.notification_email_settings`; write them
  and their reverse in 4.M before running.
- **Scale (FANT-11).** Two passes against the 50,000-team seed with a small call allowance
  (the Edge secret `FANTASY_WORKER_MAX_CALLS`, 50 to 5000, WORK:305). Record whether the
  second pass reaches further than the first (WORK:260-264, CAP:351-355). Restore the
  secret afterwards.
- Also check in both drills: a prize problem shows as `prizeAttention` in the run record
  (ASTRA-03); a missing lease function makes the pass refuse (ASTRA-04) (CAP:347-349).
- Not rehearsed here: the GitHub orchestrator and the hand-over to it are fixed to
  production (CAP:301-304).
- Record: 4.M.

**Step 12. Code checks.** (Claude, reads and a repository check)

- In GitHub, `Backend quality` is green on the exact release commit, including
  `database-quality` (CAP:246-248). A read of the checks, not a run.
- `bun run backend:migrations:check` in the repository (CAP:266). It does not touch a
  database.
- Record: 4.F.

**Step 13. Finish.** (Claude, then owner)

1. CHECK-A once more. Wait for the lease to be free and any pass to end (R3; R8).
2. Restore every writer from 3.2 **in reverse order** of pausing, only those that were
   on, using the recorded values; read each back. Restore the drills' changes first
   (`functions_base_url`, the call allowance secret, the two Fantasy switches).
3. R2 and R4 against the baseline: identical except what the ledger explains.
4. Owner: set `FANTASY_E2E_ENABLED` back to its old value (O5); shrink staging, or keep
   it for a second window (O14). The disk can grow but never shrink.
5. Re-take the manifest (4.C, "after"). Production and staging must still show the same
   release commit as step 0.
6. Fill 4.N (the verdict section stays blank for the owner). Save the form as
   `docs/production/CAPACITY_EVIDENCE_<date>.md` on a branch and open a draft pull
   request; do not merge it (AG:419-423).
7. Report as the writer (AG:365-368): which database, what changed, what was checked
   before and after, anything that overlapped another writer.
8. Post: "Window closed. Staging is free."

**Stop at once, in any step,** if: another writer appears; a run names a migration it
cannot apply; the disk is low; staging's size is unknown or differs; the release
commit moved; a command names the production reference; a number is unclear. Wait; do not
retry blindly (CAP:405-406).

## 4. Evidence form (blank; copy into `docs/production/CAPACITY_EVIDENCE_<date>.md`)

Everything in this section is a blank form. **A cell left empty or marked NOT RUN means
nothing was measured.** Do not fill a cell from memory; copy it from the run page, the
artifact or a read.

### 4.A Declaration (Step 0)

Pre-filled from the owner's answers of 2026-10-16 in conversation (OWNER:121-130). These
are forecasts and decisions, not measurements. The owner signs by saying "agreed".

| Q   | Question                                   | Answer                                                                                                                                      | Date       |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q1  | Managers at launch / season end            | about 500 / about 1,000                                                                                                                     | 2026-10-16 |
| Q2  | People at kickoff (low / likely / high)    | 50 / 150 / 300                                                                                                                              | 2026-10-16 |
| Q3  | Saves in last 10 min (low / likely / high) | 30 / 100 / 200                                                                                                                              | 2026-10-16 |
| Q4  | New accounts in the busiest hour           | up to 250                                                                                                                                   | 2026-10-16 |
| Q5  | Leagues, biggest league                    | about 100; biggest 1,000 members                                                                                                            | 2026-10-16 |
| Q6  | Full launch or pilot cap N                 | Pilot capped at 1,000 managers. Mechanism: **none exists today** (run sheet section 2). What counts as a manager: **\_\_**                  | 2026-10-16 |
| Q7  | Production compute size, budget            | Size: **\_\_** (read from the dashboard by the owner on **\_\_**). Budget: "we start with lowest", no big budget; staging at the same size. |            |
| Q8  | Named writer, window                       | Claude. Codex stays out unless Claude hands over a written window. Window: **\_\_** to **\_\_** on **\_\_** (UTC).                          |            |

Owner agreed on: **\_\_** Cost accepted (O2): yes / no Release commit: **\_\_**

### 4.B Window log

| Item                                                                 | Value |
| -------------------------------------------------------------------- | ----- |
| Window claimed at (UTC)                                              |       |
| Window closed at (UTC)                                               |       |
| Owner confirmed Codex and others stopped at                          |       |
| `FANTASY_E2E_ENABLED` old value / set to / restored to               |       |
| Anyone else touched staging during the window (name, time) or "none" |       |
| Directed SQL sessions used (drill lock holder): who, from, to        |       |

### 4.C Version manifest (CAP:284-293), taken twice

| Item                                 | Production (before) | Staging (before) | Same? | Production (after) | Staging (after) | Same? |
| ------------------------------------ | ------------------- | ---------------- | ----- | ------------------ | --------------- | ----- |
| Release commit                       |                     |                  |       |                    |                 |       |
| `x-botolago-release`                 |                     | n/a              |       |                    | n/a             |       |
| Last migration applied               |                     |                  |       |                    |                 |       |
| Migrations pending (count)           |                     |                  |       |                    |                 |       |
| Edge Functions (15) deploy dates     |                     |                  |       |                    |                 |       |
| Compute size                         |                     |                  |       |                    |                 |       |
| API schema setting (`authenticator`) |                     |                  |       |                    |                 |       |

How each cell is read (all reads, NOT RUN): release commit `git rev-parse origin/main`;
website `curl -sI https://botolago.com/ | grep -i x-botolago-release`; migrations
`psql "$DB_URL" -At -F $'\t' -f scripts/backend/sql/migration-ledger.sql > ledger.tsv` then
`bun scripts/backend/migration-ledger-compare.ts ledger.tsv`, or
`select version, name from supabase_migrations.schema_migrations order by version;`; Edge
Functions `supabase functions list --project-ref <ref>`; repository self-check
`bun run backend:migrations:check` (CAP:260-266). The website has no staging copy found, so the
staging test proves the back end, not the Lovable publish (CAP:281-282).

### 4.D Baseline reads (Step 1)

| Read                                                | Production                                           | Staging |
| --------------------------------------------------- | ---------------------------------------------------- | ------- |
| `statement_timeout` for `service_role`              | owner read 2026-10-16: 60 s (OWNER:62); not repeated |         |
| `statement_timeout` for `authenticator`             | owner read 2026-10-16: 8 s (OWNER:62); not repeated  |         |
| `pgrst.db_schemas` for `authenticator`              |                                                      |         |
| `max_connections`                                   |                                                      |         |
| Migrations pending, deferred, staging-only (`plan`) | n/a                                                  |         |
| Free disk GB (`plan`)                               | n/a                                                  |         |
| Seed loaded (`plan`)                                | n/a                                                  |         |
| Active sessions other than Claude (R1)              | n/a                                                  |         |
| Fantasy lease (R3)                                  | n/a                                                  |         |

### 4.E Writer ledger (3.2)

One row per scheduled job or switch found on staging. Restore only what was on.

| Writer (job / switch)                           | Old value (before window) | Paused at | Pause confirmed by read | Restored at | Restore confirmed by read |
| ----------------------------------------------- | ------------------------- | --------- | ----------------------- | ----------- | ------------------------- |
| W1 email, live refresh, season refresh, catalog |                           |           |                         |             |                           |
| W2 Fantasy tick                                 |                           |           |                         |             |                           |
| W2 Fantasy worker (interval)                    |                           |           |                         |             |                           |
| W3 news publication (and its prunes)            | leave                     |           |                         |             |                           |
| W4 ops alerts                                   | leave                     |           |                         |             |                           |
| W5 Pronostics scoring                           |                           |           |                         |             |                           |
| W6 news sitemap (and prune)                     | leave                     |           |                         |             |                           |
| W7 Pépites                                      |                           |           |                         |             |                           |
| W8 AI articles                                  |                           |           |                         |             |                           |
| W9 push notifications                           |                           |           |                         |             |                           |
| W10 account deletion                            |                           |           |                         |             |                           |
| W11 Manager Card compute                        |                           |           |                         |             |                           |
| W12 AI home stories (flag, daily cap)           |                           |           |                         |             |                           |
| W13 Rivals                                      |                           |           |                         |             |                           |
| W14 Trophées                                    |                           |           |                         |             |                           |
| W15 nightly E2E variable                        |                           |           |                         |             |                           |
| New jobs found after step 4                     |                           |           |                         |             |                           |

### 4.F Step ledger (CAP:388-403)

Every row starts as NOT RUN. Replace it only with a run link or a pasted read.

| Step | What                                                                  | Status  | Link or read | Started (UTC) | Ended (UTC) | Notes |
| ---- | --------------------------------------------------------------------- | ------- | ------------ | ------------- | ----------- | ----- |
| 0    | Traffic declared and signed by the owner                              | NOT RUN |              |               |             |       |
| 1    | Baseline: reads, switches saved, manifest taken                       | NOT RUN |              |               |             |       |
| 2    | Window claimed, E2E off, switches paused                              | NOT RUN |              |               |             |       |
| 3    | Staging resized to production size, disk 20 GB+                       | NOT RUN |              |               |             |       |
| 4    | Staging database update: plan, rehearse, apply                        | NOT RUN |              |               |             |       |
| 5    | Edge Functions deployed from the same commit                          | NOT RUN |              |               |             |       |
| 6    | Seed loaded                                                           | NOT RUN |              |               |             |       |
| 7    | Load test rehearsal                                                   | NOT RUN |              |               |             |       |
| 8    | Full test and soak (the full gate)                                    | NOT RUN |              |               |             |       |
| 8L   | Launch-sized run (NOT the full gate; owner's choice)                  | NOT RUN |              |               |             |       |
| 9    | Signed-in E2E: 6 passed, 0 skipped                                    | NOT RUN |              |               |             |       |
| 10   | Browsing and sign-up burst: built or accepted open                    | NOT RUN |              |               |             |       |
| 11   | Drills A and B, scale measure                                         | NOT RUN |              |               |             |       |
| 12   | `Backend quality` green on the release commit                         | NOT RUN |              |               |             |       |
| 13   | Switches restored, staging resized, manifest repeated, evidence filed | NOT RUN |              |               |             |       |

### 4.G Staging readiness and seed (Steps 3, 6)

| Item                                                 | Value |
| ---------------------------------------------------- | ----- |
| Compute reported by `plan` / typed in the run        |       |
| Free disk GB before seed / after seed                |       |
| Teams / active squad rows / lineups / lineup players |       |
| Large league members / other leagues                 |       |
| Final results / provisional results                  |       |
| `non_load_teams` / `leftover_gate_users` before      |       |

### 4.H Rehearsal (Step 7)

| Item                                                          | Result  |
| ------------------------------------------------------------- | ------- |
| Run link                                                      | NOT RUN |
| All runners ready                                             |         |
| No measured traffic (zero requests)                           |         |
| Metrics collector started                                     |         |
| Cleanup: users / sessions / refresh tokens                    |         |
| Cleanup: metrics keys / runners / security groups / key pairs |         |

### 4.I Full test (Step 8): `full`-scope runs only

Only a run with scope `full` and an artifact named `fantasy-load-test-full-...` goes here. A
launch-sized run goes in 4.IL. Run link: NOT RUN. Date, commit, staging size: **\_\_**.
Evidence artifact saved to: **\_\_**.

| Criterion (limit)                        | Gate (60 s) | Soak (10 min) | Met? |
| ---------------------------------------- | ----------- | ------------- | ---- |
| Requests sent / achieved rate (RPS)      |             |               | n/a  |
| Read p95 (at most 500 ms)                |             |               |      |
| Save and transfer p95 (at most 1,500 ms) |             |               |      |
| Save and transfer p99 (at most 3,000 ms) |             |               |      |
| Unexpected-error rate (under 0.005)      |             |               |      |
| Lock-timeout rate (under 0.001)          |             |               |      |

| Whole-run criterion (limit)          | Measured | Met? |
| ------------------------------------ | -------- | ---- |
| Metrics complete (scrape errors = 0) |          |      |
| Database connection use (under 80%)  |          |      |
| Server CPU, maximum (under 80%)      |          |      |
| Pool use (under 80%)                 |          |      |
| Deadlocks (delta = 0)                |          |      |
| Conflicts (delta = 0)                |          |      |
| Cleanup counted back to zero         |          |      |

| Integrity check (must be 0) | Count |
| --------------------------- | ----- |
| duplicate_transfers         |       |
| partial_transfers           |       |
| duplicate_chips             |       |
| corrupted_balances          |       |
| corrupted_free_transfers    |       |
| corrupt_transfer_balances   |       |
| lost_updates                |       |
| deadline_bypasses           |       |
| invalid_active_squads       |       |

Verdict printed by the run: **\_\_** (PASS / FAIL / BLOCKED). If FAIL: highest sustained
rate reached **\_\_** RPS; first criterion to break **\_\_**; where it broke **\_\_**.
If BLOCKED: stage and cause **\_\_** (this is not a fail).

### 4.IL Launch-sized run (Step 8L): NOT the full gate

Label to keep with every number below: **LAUNCH-SIZED (1,000 users, 65 RPS sustained), NOT
the full 2,500-user gate.** Only a run with scope `launch-sized` and an artifact named
`fantasy-load-test-launch-sized-...` goes here. Run link: NOT RUN. Date, commit, staging
size: **\_\_**. Evidence artifact saved to: **\_\_**. The run page heading says
"LAUNCH-SIZED run": yes / no.

| Criterion (limit, the same as 4.I)       | Gate (60 s) | Soak (10 min) | Met? |
| ---------------------------------------- | ----------- | ------------- | ---- |
| Requests sent (5,000 / 39,000) / RPS     |             |               | n/a  |
| Read p95 (at most 500 ms)                |             |               |      |
| Save and transfer p95 (at most 1,500 ms) |             |               |      |
| Save and transfer p99 (at most 3,000 ms) |             |               |      |
| Unexpected-error rate (under 0.005)      |             |               |      |
| Lock-timeout rate (under 0.001)          |             |               |      |

| Whole-run criterion (limit)                                                              | Measured | Met? |
| ---------------------------------------------------------------------------------------- | -------- | ---- |
| Metrics complete; connection, CPU and pool use each under 80%; deadlocks and conflicts 0 |          |      |
| Integrity: the nine checks in 4.I all 0                                                  |          |      |
| Cleanup counted back to zero                                                             |          |      |

Verdict printed by the run: **\_\_** ("LAUNCH-SIZED PASS (not the full gate)" / FAIL / BLOCKED).
If FAIL: highest sustained rate reached **\_\_** RPS; first criterion to break **\_\_**; where **\_\_**.
This form does not close A8 and is not "the gate".

### 4.J Cost record

| Item                                              | Value |
| ------------------------------------------------- | ----- |
| Staging compute price shown at the resize screen  |       |
| Disk size set and price shown                     |       |
| Hours staging stayed above its old size           |       |
| Amazon cost for the day, if the owner can read it |       |

### 4.K Signed-in journeys (Step 9)

| Item                            | Result  |
| ------------------------------- | ------- |
| Run link                        | NOT RUN |
| Tests passed / skipped / failed |         |

### 4.L Browsing and sign-up bursts (Step 10)

| Item                                                                | Result  |
| ------------------------------------------------------------------- | ------- |
| Owner decision: (a) build a burst test / (b) accept as an open risk |         |
| If (a): limits agreed, run link                                     | NOT RUN |

### 4.M Failure drills and scale (Step 11)

| Drill                     | Break statement and its reverse, written before | Expected (CAP)                                                          | Observed | Alarm seen (time, channel) | Recovery, minutes | Integrity after |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- | -------- | -------------------------- | ----------------- | --------------- |
| A. A write stalls         |                                                 | `fantasy_worker_rpc_timeout`, `ambiguous`, lease 420 s, `busy`, run row |          |                            |                   | NOT RUN         |
| B. The worker goes silent |                                                 | no good pass; warn at 30 min, fail at 90                                |          |                            |                   | NOT RUN         |

| Scale measure (FANT-11)                     | Pass 1  | Pass 2 |
| ------------------------------------------- | ------- | ------ |
| Call allowance (`FANTASY_WORKER_MAX_CALLS`) |         |        |
| How far the ranking reached                 |         |        |
| Second pass reached further than the first? | NOT RUN |        |

Also: `prizeAttention` shown in the run record (ASTRA-03): **\_\_**. Lease-function-missing
refusal (ASTRA-04): **\_\_**.

### 4.N Close (Step 13)

| Item                                                         | Value |
| ------------------------------------------------------------ | ----- |
| Every writer restored, confirmed by read                     |       |
| Staging size now                                             |       |
| Manifest "after" matches "before" except as explained        |       |
| Evidence file path and pull request                          |       |
| Full gate (4.I) run: yes / no. Launch-sized (4.IL): yes / no |       |
| If the full gate did not run: owner's A8 deviation, by name  |       |

What this evidence does not prove (CAP:357-371): real phones; the real traffic mix; match-day
browsing and the website host until step 10 is built; real match scoring; the Edge CPU limit;
the GitHub fallback; data providers failing; production itself.

**Verdict (owner only):** **\_\_** Date: **\_\_**

## 5. Owner-only actions

Plain words, no screenshots. Menu names in Supabase and GitHub change; the words in
bold are what to look for. Tell Claude the answer in the conversation.

Before the window:

1. **O1. Read production's server size.** Supabase dashboard, project **BotolaGO
   Production V2**, **Settings**, **Compute and Disk**. Tell Claude the exact name:
   Micro, Small, Medium, Large, XL or 2XL. (The documents disagree: Large on 2026-09-25,
   LOAD:65-67, against XL or 2XL to certify, CAPR:47-51; only the dashboard is right.)
   Optional cross-check: in the production SQL editor run
   `select current_setting('max_connections');` and compare (60 Micro, 90 Small, 120
   Medium, 160 Large, 240 XL, 380 2XL). This is a read.
2. **O2. Say yes or no on the spending.** The Amazon machines for the test are a few
   dollars at most and the script refuses to start above $50 (LOAD:35-37). Staging at
   production's size, and a disk of 20 GB, have a price the dashboard shows when you pick
   them. Say whether this is within "no big budget" (OWNER:159-161).
3. **O3. Pick the window.** A date, a start and an end, 8 to 11 hours, on a day you can
   answer messages. It should come **after** any code you want tested is merged (a SEC-01
   fix, a pilot cap), so the window tests what will ship (OWNER:404-406).
4. **O4. Freeze.** Merge nothing to `main` and apply nothing to production from the
   start of the window to its close. A merge changes what the workflows run and sets
   other GitHub Actions running (AG:419-423). Tell Codex and everyone with SQL editor
   access to stay out of staging for the window (Q8).
5. **O5. Turn the nightly signed-in test off.** GitHub, the repository, **Settings**,
   **Secrets and variables**, **Actions**, **Variables**: `FANTASY_E2E_ENABLED`. Write
   down its value, then set it to anything but `true` (for example `false`). Set it back
   at the end.
6. **O6. Check the GitHub set-up.** In the environment **staging-load-test**: the secret
   `SUPABASE_ACCESS_TOKEN` works (if the run fails at once, make a new one in Supabase,
   **Account**, **Access Tokens**, and replace it, LOAD:117), the secret
   `SUPABASE_STAGING_PUBLISHABLE_KEY` exists, the variables `SUPABASE_STAGING_PROJECT_REF`
   and `SUPABASE_STAGING_URL` exist, and the repository variable `AWS_LOAD_TEST_ROLE_ARN`
   exists. You can see names but not secret values: tell Claude which names are there.
   Ask whoever owns the Amazon account to confirm the role still exists and that machines
   can be started in the Paris region (in July Amazon refused a first launch,
   CAPR:107-112).
7. **O7. Check the signed-in test set-up.** The GitHub environment **fantasy-e2e**
   exists with `E2E_FANTASY_EMAIL` and `E2E_FANTASY_PASSWORD`, and that test manager
   account exists on staging. The ledger said you had not created the environment as of
   2026-09-21 (OWNER:437).
8. **O8. Confirm mail sending is off on staging.** In the **BotolaGO Staging V2**
   dashboard, **Authentication**, the e-mail/SMTP settings: no custom SMTP, or one that
   points to a throwaway inbox; and under **Edge Functions**, **Secrets**: no live key
   for the mail sender. Claude separately reads that the in-database mail switch is
   `off`. The test accounts use `.invalid` addresses and are created already confirmed,
   so nothing should be sent anyway.
9. **O9. Optional: a test alarm destination.** For the failure drills to show the
   alarm, store a **test** webhook (not the real one) in staging's Vault under the name
   `botolago_ops_alert_webhook` (`docs/operations/ALERTS.md:437-471`). Without it the
   drills can show only the database record, not the alarm.
10. **O10. Decide two things.** Step 10: (a) a developer builds a simple browsing and
    sign-up burst test, or (b) it stays an open risk (CAP:236-242). And confirm the
    rule "never copy real user data from production into staging" (OWNER:164-165).
11. **O11. Decide the pilot cap.** What "1,000 managers" counts (Fantasy teams or all
    accounts) and whether to build option A, B or C of section 2.

In the window:

12. **O12. Resize staging** when Claude asks (step 3). **BotolaGO Staging V2**, **Settings**,
    **Compute and Disk**: the same size as production, and **Disk size** at least 20 GB,
    in a single change (four disk changes a day at most, and a disk never shrinks).
    Staging restarts for a minute or two. Write down the price it shows.
13. **O13. Stand by.** Be reachable for a "stop" message, and click any dispatch Claude cannot.

After the window:

14. **O14. Close.** Set `FANTASY_E2E_ENABLED` back to its old value. Shrink staging back
    to its old size (LOAD:108-111), or keep it for a second window; the disk stays.
15. **O15. Read the evidence form and decide go or no-go.** This page and Claude do not
    decide.

## 6. What could invalidate the result

Any one of these means the numbers cannot be quoted as capacity evidence. Say so in the
form (4.N) rather than quoting them.

Environment is not production's:

1. Staging is not the same size as production, was not read back after the resize, or was
   resized during a run. (A result on a smaller server "proves nothing about production",
   LOAD:29-31.)
2. A migration is pending on staging, or staging carries one production lacks. The
   deferred `20260925090500` is the known deliberate difference (SDU:68-72). The API
   schema setting differs (`pgrst.db_schemas` must be `api`, CAPR:294-297).
3. The Edge Functions were not all deployed from the release commit, or the commit moved
   (a merge to `main`, a production deploy) during the window.
4. The seed is not exactly the expected shape, a non-load team exists, or temporary
   accounts from an earlier run are left over (the gate refuses, GATE:474-479).
5. The disk filled, the database stopped, or Supabase changed the disk during a run
   (LOAD:71-75).

Someone else wrote:

6. Any other writer during a measured step: a scheduled job that was on or came on
   after `apply`, the nightly E2E, a workflow in the queue, Codex, a person in the SQL
   editor, an Edge worker already woken. The 2026-09-21 race threw a result away for
   exactly this (AG:36-43). Re-measure after both stopped (AG:370-372).
7. Production was written during the window (a migration, a deploy), so "before" and
   "after" manifests differ.

The test itself:

8. The run was BLOCKED, not measured: Auth 429, a user-creation failure, an Amazon
   refusal, a runner that exited, a metrics gap. Report it as blocked (CAPR:148-153).
9. Machines placed in another region than staging (the July retry used `us-east-1`):
   a pass is conservative, a latency fail needs a same-region rerun (FDR:178-181).
10. The load generator itself was the limit (its own CPU or connector pool), or a run
    was cancelled halfway and left accounts or machines behind.
11. Burstable small and medium servers can be flattered by a short run (CAPR:10-13
    says burstable compute). Read the 10-minute soak, not only the 60-second gate.
12. The evidence was lost: the artifact is kept 30 days; copy the numbers into 4.I (or 4.IL)
    the same day.
13. A second step 8 or 8L after the drills, on a seed the drills finalized (step 11).
14. A launch-sized result filed as the full gate. The scope is in the run name and the
    artifact name, and 4.I and 4.IL are separate forms; check the name before copying.

What the test never measures (so a pass cannot cover it): match-day browsing and the
website host; sign-up bursts (Q4) and Supabase's own Auth limits and built-in-mail
throttle (section 2, item 7); real phones on Moroccan networks (the machines are in
Paris); the real traffic mix (News, Pronostics, notifications are not loaded); real
match scoring; the Edge CPU limit; the GitHub fallback; data providers failing
(CAP:357-371).

## 7. Unclear, to confirm before the window

1. Whether Claude's session can **run SQL on staging** (a Supabase connection that names
   `srdrflfrfpwixsllveid`) or the owner must paste statements and results.
2. Whether Claude may **dispatch GitHub workflows and read run artifacts** (the evidence
   zip). If not, the owner clicks with the inputs given here and sends the files.
3. Whether the session has the **Supabase command line and a staging-capable login** for
   step 5 (CAP:197-200). The repository documents no workflow for it.
4. How **staging was set up for the Fantasy worker** (scheduler secret, `functions_base_url`)
   and how to prepare a **gameweek with work** for the drills (CAP:306-309).
5. Which **row to lock** in Drill A, and who holds the open SQL session.
6. Whether the **synthetic E2E manager** and an open season exist on staging (O7).
7. Whether the **staging-only SofaScore rating script** is needed in step 4
   (OWNER:224-233).
8. What counts as a **manager** for the cap (section 2) and whether BG-0108 (built-in
   mail throttle) is closed.
9. Whether the Amazon cost is within the owner's spending (O2).
10. The Q3 request-rate arithmetic in section 1 is mine. If the owner has a better
    estimate of how many requests a manager makes near a deadline, replace it.
11. Whether the launch-sized code (a branch, not yet reviewed or merged) is merged before the
    window. Until then the `launch-sized` scope does not exist on `main` and step 8L cannot
    be dispatched.
