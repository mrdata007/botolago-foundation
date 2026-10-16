# Launch blockers: an owner plan

Written 2026-10-16 from `main` at `8779e75`. This is a plan only. No database,
host, workflow, setting or job was touched to write it, and nothing in it has
been run. Every "first step" below is a step for someone to take later.

**Updated later the same day (2026-10-16)** with what the owner decided in
conversation (the capacity answers in section 3) and with what has been done
since (section 5, "Done today"). Everything marked "Owner answer" or
"owner-reported" is the owner's word in conversation, 2026-10-16, and has not
been checked against a system. Nothing was run to write the update either.

**Updated a third time the same day (2026-10-16)** with six _owner-independent
findings_. That label means: found by agents reading, without any statement from
the owner, and not an owner decision. They are two read-only reviews of
Production V2 (SEC-01), a read-only comparison of Staging V2 with Production V2
(A8), a reading of the code for the 1,000-manager cap (Q6), a pre-read of the
Arabic wording (ARABIC), a written real-state checklist (STATE) and a list of
what staging lacks for the reminder tests (PRO-04). They are set out in section
2, under the table. **None of them closes a blocker;** each row of the table, and
each finding, says what remains. The facts from the reviews of the databases (the
55 functions, the 41 migrations, the counts of accounts, fixtures and Edge
Functions, the state of gameweek 4) come from those reviews' reports. This edit
did not read or write any database, dashboard or host. Three finished
documents were brought onto this branch by cherry-pick (RUN, CHK and PRE in the
source key). The SEC-01 fix is on another branch (`work/finalizing-guard`, commit
`0e906a24`) and is not on `main` or applied anywhere.

**What to do with this page.** Read section 1 (two minutes). Section 3 is now
answered; what is left for the owner is the short list at its end (production's
server size, the cap, the Arabic reader, the phone tester). Then follow
section 6 in order, and the one list of owner actions at its end. Sections 2, 4
and 5 are the detail behind those.

Source key. Every claim cites `file:line`; the files are shortened like this.
The line numbers cite the files as they stand on `main` at `9e7056ad`. That is
the tree of the branch `work/arabic-sheet` (commit `d8ff2529`) except for one
file: the Phase D report (PD) gained three lines near line 155 when pull
request 507 merged, so every PD citation from line 158 on was moved three lines
down in this edit. (This page's own line numbers cited in RUN and CHK are the
numbers before this edit; those two documents say they cite the tree at
`9e7056ad`.) Files on another branch say so in the table.

| Short | File                                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PD    | `docs/audits/2026-10-15-audit-remediation-phase-d.md`                                                                                           |
| PC    | `docs/audits/2026-10-15-audit-remediation-phase-c.md`                                                                                           |
| PB    | `docs/audits/2026-10-15-audit-remediation-phase-b.md`                                                                                           |
| PA    | `docs/audits/2026-10-14-audit-remediation-phase-a.md`                                                                                           |
| CAP   | `docs/production/CAPACITY_AND_RELEASE_EVIDENCE_PLAN.md`                                                                                         |
| REM   | `docs/engineering/REMINDER_DELIVERY_EVIDENCE.md`                                                                                                |
| WORK  | `docs/backend/FANTASY_WORKER_SCHEDULE.md`                                                                                                       |
| LOAD  | `docs/operations/LOAD_TEST.md`                                                                                                                  |
| CAPR  | `docs/backend/FANTASY_CAPACITY_REPORT.md`                                                                                                       |
| ORCH  | `scripts/backend/fantasy-season-orchestrator.ts`                                                                                                |
| ABR   | `docs/production/PHASE_A_B_MIGRATIONS_OWNER_RUNBOOK.md`                                                                                         |
| LED   | `docs/engineering/LAUNCH_LEDGER.yaml`                                                                                                           |
| AG    | `AGENTS.md`                                                                                                                                     |
| CL    | `CLAUDE.md`                                                                                                                                     |
| PROD  | `PRODUCT.md`                                                                                                                                    |
| CURVA | `docs/engineering/CURVA_COMPREHENSION_TEST.md`                                                                                                  |
| RUN   | `docs/production/2026-10-16-capacity-test-run-sheet.md`                                                                                         |
| CHK   | `docs/production/2026-10-16-real-state-test-checklist.md`                                                                                       |
| PRE   | `docs/review/2026-10-16-arabic-wording-preread.md`                                                                                              |
| REV   | `docs/review/2026-10-16-arabic-wording-review.md`                                                                                               |
| SDU   | `scripts/backend/staging-database-update.py`                                                                                                    |
| FIN   | `docs/production/FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md`, **only on branch `work/finalizing-guard`, commit `0e906a24`**; lines checked there |

Effort figures marked "(est.)" are my estimates, not numbers from the
repository. Figures without that mark are quoted from the cited line.

Words used once:

- **Owner-independent finding, 2026-10-16**: a fact found by agents from
  read-only reads or from the code, with no owner statement behind it. It can
  be wrong if the thing it describes has since changed; read it with its date.
- **Staging**: the practice copy of the database (BotolaGO Staging V2). Production
  is the real one (CAP:80-82).
- **Writer**: anything that changes a database: a script, a workflow, a person
  in the SQL editor, a scheduled job. The rule is one writer at a time, and a
  staging writer counts as much as a production one (AG:23-26, CAP:118-122).
- **Lease**: a single "I am working" marker, so only one scoring run is active
  (CAP:19).
- **Edge Function**: a small program that runs inside Supabase. The scoring
  worker is one (CAP:17-18).

## 1. Where things stand

- The audit verdict is **NO-GO for broad public launch**, with no confirmed
  top-priority (P0) defect (PD:3-5, PD:209-211).
- **Closed since Phase C** (so not on the list below): the database statement
  limit check (the owner ran it: 60 s service role, 8 s authenticator, so the
  lease extension is safe); the CI `database-quality` job passed on pull
  request 495; the three Phase A/B migrations are already on production
  (PD:213-219). The Morocco clock fix was applied on both databases on
  2026-10-15 (PD:100-109).
- **Five items still block launch** (PD:221-231). **None is closed.** Section 2
  lists them, with what is left for each. The capacity answers (Q1 to Q8) are
  now given by the owner (section 3), which unblocks the first step of A8 but
  proves nothing yet: the capacity test has not been run.
- **Owner-independent findings, 2026-10-16** (section 2, under the table), in one
  line each:
  - **SEC-01:** two of the three jobs outside the lease are safe (calendar sync,
    prize check). The third, the player-statistics import path, has a real hole:
    while a gameweek is `finalizing`, a new Fantasy player can appear and the
    gameweek can then never complete. Points are never wrong; the gameweek gets
    stuck. A fix is prepared and under independent review. **It is applied
    nowhere.** Gameweek 4 is live, so it matters before gameweek 4 is sealed.
  - **A8:** Staging V2 is far from ready for the test (41 migrations behind, 1 of
    15 Edge Functions deployed, no deliverable accounts, almost no fixtures).
    The locked load-test profile is expected to FAIL on a Medium server, which
    the owner's "lowest size, no big budget" answers make the likely case.
  - **Q6:** nothing enforces a 1,000-manager cap today. The owner must decide
    what it counts and whether to build it.
  - **ARABIC:** a non-native pre-read of the 697 lines is done. It approves
    nothing; the native reader is still required.
  - **STATE:** the checklist is written. It waits on a named tester.
  - **PRO-04:** staging cannot run the reminder tests yet.
- **Done since this page was first written** (2026-10-16; details in section 5):
  the account-deletion worker is deployed, the Prospects / المواهب bell-text
  migration is applied, and the first daily Pépites sweep after the Morocco
  time fix ran correctly. None of these is on the audit's blocker list.
- Related but not on the audit's blocker list: owner actions that are open
  (section 5) and older ledger items whose status nobody has recorded
  (section 7).

## 2. The open launch blockers

The audit gives an ID to three of the five (A8 with SEC-02 and FANT-11; SEC-01;
and PRO-04, named at PD:35). The other two have no audit ID; I call them
"STATE" and "ARABIC" here so they can be referred to.

| ID                       | What it means, in one sentence                                                                                                                                                                                                                                                                                                                                            | Why it blocks launch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Who must act                                                                                                                 | What is needed                                                                                                                                                                                                                                                                                                                                                                                                                                      | Effort                                                                                                                                                                                                                                             | Exact first step                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A8** (SEC-02, FANT-11) | Nobody has shown that the game holds up under a real crowd, that the live app, database and background jobs all run the same version, or that a failed scoring run recovers on its own (PD:223-224, CAP:24-31).                                                                                                                                                           | The audit stays NO-GO until it is shown (PD:209-211). The last real test, in July, failed at about 65 actions a second (CAP:25-26). One scoring run cannot finish ranking past about 700 leagues (WORK:262); the owner's declared 100 leagues is well below that (section 3, Q5). **Owner-independent finding, 2026-10-16:** the locked profile (2,500 users, 600/250 requests a second) is expected to FAIL on a Medium server (about 65 a second measured in July), and the owner's lowest-size and no-big-budget answers point at that case (finding C; RUN:93-107). | Owner decides and clicks. Claude agents prepare and read results. A developer deploys to staging (CAP:107-108, CAP:194-200). | Answers to Q1 to Q8 (**given**, section 3); production's server size (**still unread**); a staging copy at that size that is actually ready (**it is not**, finding B); one named writer (**Claude**) and a time window; the steps of RUN:544-806 (CAP:141-254); a filled evidence file (form at RUN:807-1035, CAP:253-254).                                                                                                                        | Owner: 30 to 60 min to answer, then one full day as the window. Agents: 1 to 2 days of preparation (est.). The full test alone: up to 2 h (CAP:212). Not estimated: the staging catch-up of finding B, and building the cap if chosen (finding C). | Done: the owner answered Q1 to Q8 on 2026-10-16 (section 3). Next: the owner reads production's server size and the list of production's Edge Functions in the Supabase dashboard (RUN:1044-1050, O1) and answers the spending question (RUN:1051-1054, O2); the owner decides what the 1,000 cap counts and whether to build it (finding C, RUN:1092-1093, O11).                      |
| **SEC-01**               | Scoring is protected from running twice at once, but three side jobs (the calendar update, the player-statistics import, the prize check) are not (PD:225-227, WORK:196-205). **Owner-independent finding, 2026-10-16:** the calendar update and the prize check are safe; the player-statistics import path has a real hole, where a gameweek can get stuck (finding A). | A new Fantasy player created while a gameweek is `finalizing` changes the sealed scoring input, after which every later scoring step refuses and the gameweek can never complete (FIN:13-27). Points are never wrong; the gameweek is stuck. The data of 14 October already shows the mechanism (finding A). The audit asks for the work outside the lease to be checked against the database code, fixed, or covered by a stated pilot limit (PA:124-125); a pilot limit does not cover this hole.                                                                     | Claude agents (independent review of the fix). Owner approves the merge and runs the one production script.                  | Independent review of the prepared fix (under way); the owner's approval to merge (AG:419-423); the owner's separate authorisation to run the guarded production script, one operation (CL:33-48); applied **before gameweek 4 is sealed**; a read-back afterwards. Nothing is applied yet.                                                                                                                                                         | Review: under way. Merge and one production script run (the script's own runbook, FIN:70-114, says what to pause and restore); not estimated here.                                                                                                 | Owner: tell the agents when the review is done and whether to go ahead; nothing is merged or applied without that. Meanwhile, optional: look at the GitHub variable `FANTASY_AUTOMATION_ENABLED` (`.github/workflows/fantasy-season-orchestrator.yml:91`); the hourly orchestrator was seen holding the lease (finding A), so it is probably on, but the variable itself was not read. |
| **STATE**                | Several screens were only ever seen with sample data, never with a real account, real data, a phone, French and Arabic (PD:228-229, PD:126-138).                                                                                                                                                                                                                          | The states that mock mode cannot show (errors, retries, empty and long lists, failed loads) are exactly what a first real user meets (PA:65-68, PB:86-92, PC:85-93).                                                                                                                                                                                                                                                                                                                                                                                                    | Real people and devices, with agents preparing. Owner names a tester.                                                        | A checklist run on real phones (iPhone and Android), with a real signed-in test account, in French and Arabic, plus a screen-reader pass (VoiceOver, TalkBack, NVDA) (PC:81-82). **The checklist is written** (CHK: 69 cases and 10 screen-reader checks); it has not been run. It also needs prepared data on staging (CHK:103-112) and a way to open a copy of the site on the phones (CHK:63-69), and staging is not ready for that (finding B). | Half a day to one day (est.).                                                                                                                                                                                                                      | Owner names one tester, says which two phones they have, and settles the 15 "owner to confirm" points (CHK:46-101, CHK:1447-1455).                                                                                                                                                                                                                                                     |
| **ARABIC**               | No native Arabic speaker has read the new Arabic wording from Phases A, B and D (PD:230, PD:124).                                                                                                                                                                                                                                                                         | Wrong Arabic in promises (unsubscribe scope, notification language, brand names) is a trust problem for an Arabic-first audience, and one such text is stored in the database where it cannot be quietly changed (PD:87-97).                                                                                                                                                                                                                                                                                                                                            | Native Arabic reader (the owner or someone the owner trusts). Agents prepare the sheet and apply edits.                      | A review sheet listing each string, where it appears, its French meaning and the risk (REV, 697 rows, built from PD:179-197 and PC:157-181); the reader answers "fine" or "change to". **A non-native pre-read of the sheet is done** (PRE): 24 rows ERROR-LIKELY, 105 DOUBT, 568 OK. It approves nothing (PRE:5).                                                                                                                                  | 2 to 4 hours of reading (est.), then 1 to 2 hours for agents to apply changes (est.).                                                                                                                                                              | Owner says who reads the sheet. The reader starts with the 24 ERROR-LIKELY rows and the four open questions (PRE:7-31, PRE:242-280).                                                                                                                                                                                                                                                   |
| **PRO-04**               | We have never proved that a reminder (match kick-off, Fantasy deadline, round recap) arrives once, at the right Morocco time, and only on the channels the person allows (PD:231, REM:7-16).                                                                                                                                                                              | Until it is proved, reminders can only be described as a saved setting, never as a promise (REM:18-19).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner authorises each staging write. Real inbox and phone. Agents prepare.                                                   | Test accounts on staging, a real mailbox, mail sending set up (REM:74-76), test mode switched on and restored afterwards (REM:78-105). Push cannot be tested yet: no phone build (REM:34-35, REM:144-146). **Staging cannot run these tests yet:** it has no mail function deployed, no accounts that can receive mail and no future fixture (finding F).                                                                                           | 2 to 3 hours of hands-on work spread over 1 to 2 days, because of waiting for real kick-offs and deadlines (REM:109-124) (est.).                                                                                                                   | Owner (or an agent given a read-only connection) runs the read-only checks of REM:54-72 on staging and sends the results. Reads only.                                                                                                                                                                                                                                                  |

### Owner-independent findings, 2026-10-16

Each finding below is labelled with its date, as the key above explains. Where it
supersedes an older statement on this page, the older statement is changed in
place (sections 3, 4, 6 and 7), not left beside it.

#### A. SEC-01: two of the three jobs are safe, one has a real hole

Two independent read-only reviews of Production V2 compared the live bodies of
55 functions with the repository: all 55 were md5-equal. So for those 55 the
migration file is the live text, which answers the worry in the old section 4
text that a later patch might have changed the calendar function.

- **Calendar sync (`api.service_sync_fantasy_calendar`): SAFE.** It takes a
  per-season advisory lock
  (`supabase/migrations/20260924200000_fantasy_postponement_and_enrolment.sql:186`),
  locks the gameweek row
  (same file, lines 223-225) and checks the scoring snapshot
  (`app_private.fantasy_assert_scoring_snapshot`,
  `supabase/migrations/20260914200719_fantasy_scoring_worker_contracts.sql:127`).
- **Prize check (`api.service_evaluate_fantasy_prizes`): SAFE.** It takes one
  global advisory lock
  (`supabase/migrations/20260924120000_fantasy_prizes.sql:889`), answers
  `already_awarded` for a prize already given (same file, line 638), and unique
  indexes stop a second winner row (same file, lines 144 and 263).
- **Player-statistics import path: a REAL hole**, found by the second review.
  While a gameweek is `finalizing`, its scoring input is sealed with a hash.
  The SofaScore matcher (`api.service_sofascore_auto_map_players`, called by
  `football-live-refresh` every minute, with no lease; FIN:22-25) can create a
  Fantasy player, which adds one entry to the sealed list. Every later scoring
  step then compares the hash, refuses with `fantasy_scoring_input_changed`, and
  the gameweek can never complete (FIN:15-20). **Points are never wrong; the
  gameweek gets stuck.** The data shows it: 4 players were auto-created on 14
  October; gameweek 3's input hash no longer matches its sealed snapshot (736
  against 740); gameweek 1 sat in `finalizing` for 18 min 38 s, a stretch in which
  the live refresh ran about 18 times. The orchestrator's own statistics import is skipped
  when the data source is SofaScore (`scripts/backend/fantasy-season-orchestrator.ts:233`,
  `:500-505`), so the writer here is the live refresh, not the orchestrator.
- **The fix, prepared, not applied.** Branch `work/finalizing-guard`, commit
  `0e906a24`: migration `20261016110000`
  (`supabase/migrations/20261016110000_fantasy_finalizing_scoring_inputs_guard.sql`),
  a guarded owner script
  (`scripts/backend/apply-20261016110000-fantasy-finalizing-guard.sql`) and the
  runbook FIN. While any gameweek of a season is `finalizing`, three triggers
  refuse the writes that change the sealed input (FIN:29-38). The matcher is not
  changed: it holds that one player and retries once the gameweek is no longer
  `finalizing` (FIN:50-56). It is **under independent review and applied
  nowhere**; the runbook says it was not run on any shared or production
  database (FIN:3-5), and the database test was not run (no Docker).
- **State today (read-only, 2026-10-16):** the Edge worker is off and has never
  run; the hourly GitHub orchestrator holds the lease; the football data source
  is `sofascore`; gameweek 4 is live, 4 of its 8 matches finished and the rest
  on 17 and 18 October. So the hole is open now, and the fix has to be applied
  **before gameweek 4 is sealed**, that is before it reaches `finalizing`.
- **A smaller item, unproven.** `app_private.fantasy_assert_mutable_gameweek`
  reads the gameweek with a plain `select` and no row lock
  (`supabase/migrations/20260720141854_fantasy_api_security.sql:25-43`; the read is
  at line 34, the deadline check at line 38). A team save that starts just before
  a deadline might therefore slip in after the lock. This was **not proven end to
  end**.
- **Optional, harmless.** The orchestrator's first calendar sync runs before it
  takes the lease (`scripts/backend/fantasy-season-orchestrator.ts:483-485`,
  lease at `:549`). If the Edge worker were on, this could only produce a red
  run, not a wrong score. The Edge worker is off today.
- **What remains for SEC-01:** the review finishes; the owner approves the merge
  (AG:419-423); the owner authorises the production script as one operation
  (CL:33-48); a read-back confirms the triggers exist and nothing else changed.
  The old options on this page (hold the lease across the whole orchestrator, or
  state a pilot limit, WORK:196-205, PA:124-125) do not address this hole, which
  is in the live refresh and not in the orchestrator. The "no row lock" item
  needs its own decision. **SEC-01 stays open.**

#### B. A8: staging is not ready (read-only comparison of Staging V2 with Production V2)

- **41 repository migrations are missing on staging**, the SofaScore rating
  release among them. The staging-only script for that release holds 20
  migrations, `20261013110000` to `20261014090100`
  (`scripts/backend/apply-20261014-sofascore-rating-release-staging.sql:6-8`).
  The review also names a **Group A of 11 migrations** that this script does not
  contain. No file in the repository uses the name "Group A", and the figures
  given do not say how the 41 split between the script's 20, Group A's 11 and
  the rest, so a developer should list staging's missing migrations (a read)
  against both before step 4 (RUN:607-628).
- **Only 1 of the 15 Edge Functions is deployed on staging.** The repository has
  15 function folders (RUN:186-187). RUN step 5 (RUN:630-655) deploys them.
- **All 50,005 staging accounts use `staging.botolago.invalid`**, so none can
  receive mail. This affects the sign-up and reset cases of the checklist (CHK:70-74)
  and the reminder tests (finding F).
- **Staging has 3 past fixtures and 3 finalized gameweeks:** nothing for the
  worker drills. RUN already asks how to prepare a gameweek with work
  (RUN:1168-1169).
- **Rivals and Trophées are ON on staging and must be paused.** They are now on
  the pause list: RUN W13 and W14 (RUN:515-529) say "pause if on", and for the
  window they are on (section 6, step 7).
- **Compute size and disk are not visible by SQL.** The owner reads them in the
  dashboard (RUN:1044-1050, O1; RUN:1097-1100, O12).
- **Production lists 13 Edge Functions and no `fantasy-lifecycle-worker`.** The
  database worker is off (AG:282-296), and the function it wakes must be
  deployed before the worker is switched on. The owner confirms the list in the
  dashboard.
- **The staging update tool has a stale `DEFERRED` entry** for
  `20260925090500_fantasy_league_page_skip_empty.sql`
  (`scripts/backend/staging-database-update.py:68-72`). The tool's own comment
  says to remove an entry once production applies it (SDU:65-67), and the review
  found the entry stale. RUN step 4 still says the migration is deferred
  because production has not applied it (RUN:613-614). A developer removes the
  entry, or the window expects the migration to stay pending on staging.
- **Group A (11) is not in the staging-only rating release script** (see the
  first item). Running that script alone will not bring staging up to date.
- **The order and the owner's part are written:** the steps of the capacity test
  are in RUN:544-806 (RUN:549 to RUN:784, steps 0 to 13) and the owner-only
  actions O1 to O15 are in RUN:1037-1108. RUN section 7 (RUN:1160-1178) lists what
  is still unknown.
- **What remains for A8:** everything above, then the window itself. No test
  was run and none is claimed.

#### C. Q6 and the locked profile

- **Nothing enforces a 1,000-manager cap today.** Sign-up goes from the browser
  straight to Supabase Auth, the one trigger on new accounts only creates rows,
  `api.create_fantasy_team` has no count check, and the Auth hook that could
  refuse sign-ups is a commented-out example in the repository's template
  (RUN:174-225). "Pilot capped at 1,000" (section 3, Q6) is a stated intention,
  not a mechanism.
- **Smallest design (not built):** a new migration with one settings table and a
  guard in `api.create_fantasy_team` that refuses the 1,001st team, shipped with
  the cap off and applied in two authorised operations (RUN:234-265, option A).
  Options B (refuse the 1,001st account, with an Auth hook) and C (watch and
  switch off by hand) are at RUN:273-284.
- **The owner decides** what "1,000" counts, teams or accounts (RUN:229-232;
  O11, RUN:1092-1093), and whether to build it. It would be merged before the
  window if the window is to test the code that ships (RUN:267-271).
- **The locked load-test profile is expected to FAIL on Medium.** Its 2,500
  users and 600/250 requests a second are locked
  (`scripts/backend/fantasy-load-test.py:239-243`, CAPR:187). The last
  measurement on a Medium server topped out at about 65 a second (CAPR:10-17), and
  the profile asks for 250 sustained. The owner's answers "we start with lowest"
  and "no big budget" (section 3, Q7) therefore **conflict with a PASS**: if
  production is on Medium or smaller, a FAIL is the expected result (RUN:93-103).
  The declared crowd is far smaller than the profile (RUN:68-91, with the request
  rate there being the run sheet's own estimate), so a FAIL would not by itself
  show the declared crowd unsafe; it would show the gate not passed.
- **A smaller profile would be a new reviewed test,** separately named, never an
  edit of the locked one, and never called "the gate" (RUN:105-107, RUN:156-165).
- **What remains for Q6:** the owner's decision on what is counted and whether to
  build; then a migration, tests, an Arabic read of the new message, and two
  authorised production operations. Until then no cap exists.

#### D. ARABIC: the pre-read is done

- `docs/review/2026-10-16-arabic-wording-preread.md` (PRE) rates all 697 rows of
  the review sheet (REV): **24 ERROR-LIKELY, 105 DOUBT, 568 OK** (PRE:7-14).
- **It approves nothing.** It was written by an AI model that reads Arabic but is
  not a native speaker; an OK row still needs the native reader's tick (PRE:5,
  PRE:289-295).
- **Top issues** (PRE:23-31): transfers called تبديل (substitution) in the recap
  where the glossary says انتقال; plural forms that break for numbers the app
  really shows (players, ratings, rounds, frames, league members); a penalty
  called غرامة (a money fine) in the recap where the Fantasy screens say خصم;
  managers called مدراء in the trophies; the brand spelled three ways, and
  "Wildcard" and "Free Hit" printed in Latin letters in the briefing. Also the
  staff confirmation that drops the end date before a paid Season is activated,
  and an error message that drops the bank-account rule.
- **Four open questions have a recommended answer** (PRE:242-280). One touches the
  database: the pre-read recommends «أفضل 10» for Top 10 (PRE:252-259), while the
  weekly bell text applied on Production V2 reads «توب 10» (section 4, ARABIC). If
  the reader agrees, that is a new migration, since migrations are forward-only
  (CL:52-53).
- **What remains for ARABIC:** the native reader, from the ERROR-LIKELY rows
  first; then agents apply the edits. **ARABIC stays open.**

#### E. STATE: the checklist is written

- `docs/production/2026-10-16-real-state-test-checklist.md` (CHK) holds **69
  cases** (A to K) and **10 screen-reader checks** (SR1 to SR10; CHK:1225-1275),
  with the results form (CHK:1276-1406) and what is deliberately not tested
  (CHK:1407-1423). It has 15 "owner to confirm" points (CHK:46-101, CHK:1447-1455).
- It has **not been run.** It waits on a named tester and two phones (CHK:9-13).
  It assumes a copy of the site pointed at staging (CHK:63-69), so it also waits
  on the staging work of finding B, and its sign-up cases are Blocked unless the
  owner creates confirmed test accounts by hand (CHK:70-74).
- **What remains for STATE:** the tester, the phones, the staging copy, the
  prepared data (CHK:103-112, a staging write by the one named writer), the run,
  and the fixes it finds. **STATE stays open.**

#### F. PRO-04: staging cannot run the reminder tests yet

The protocol is `docs/engineering/REMINDER_DELIVERY_EVIDENCE.md` (REM). What
staging lacks today:

- **A deployed mail function** (`notification-email-dispatch`), with its two
  secrets set and a verified mail domain (REM:74-76). Staging has 1 of 15 Edge
  Functions (finding B).
- **Accounts that can receive mail:** every staging account is on
  `staging.botolago.invalid` (finding B), so the protocol needs real mailboxes.
- **A future fixture:** staging has 3 past fixtures only, and the tests wait for
  a real kick-off and a real deadline (REM:109-124).
- Push stays untestable: no phone build and no deployed dispatcher (REM:34-35,
  REM:144-146).
- It must run in its own window, apart from the capacity window (AG:360-361).
- **What remains for PRO-04:** the three needs above, the owner's authorisation of
  each staging write, then the run. **PRO-04 stays open.**

## 3. The capacity questions Q1 to Q8: the owner's answers

These are the eight questions of CAP:61-72, reworded. **The owner answered them
on 2026-10-16, in conversation.** The figures for Q1 are the owner's own. For Q2
to Q5 the owner said "accept all" to the assumed figures, scaled to the owner's
500 and 1,000 manager figures. Where an answer differs from the default this
page first recommended (a 2,500-manager pilot, 500 leagues), the owner's answer
replaces it below.

Three things to know about the answers:

- The existing test is built for **2,500 managers** deciding at once: 2,500
  temporary accounts, 600 actions a second for 10 seconds, 250 a second for 50
  seconds, then 250 a second for 10 minutes (LOAD:22-27, CAP:50). It also loads
  a 10,000-member league (CAPR:86), and the full gate is hard-locked to the
  2,500-user, 600/250 profile (CAPR:187). That is larger than anything the owner
  declared (at most 1,000 managers, 200 of them saving in the last 10 minutes,
  1,000 in the biggest league). The full gate has not been run to a pass
  (CAPR:53), so "larger than declared" means the test is big enough to cover
  the declaration, not that the game passed it.
- That test covers deadline saves only. It does **not** cover people browsing
  scores and news on match day, the website host, or bursts of sign-ups
  (LOAD:126-131, CAP:234-238). So Q2 and Q4 can be declared but not yet tested.
- Answers marked **Business** are the owner's decision (a forecast, a promise,
  a budget). Answers marked **Technical** are a fact someone reads off a
  screen.

| #   | Plain question                                                                                     | Owner answer (2026-10-16, in conversation)                                                                                                                                                                                                                                                                                    | Why / what changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Kind                                  |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Q1  | How many people will play Fantasy at launch, and at the end of the season?                         | **Owner answer: about 500 managers at launch, about 1,000 by the end of the season** (the owner's own figures).                                                                                                                                                                                                               | Replaces the earlier recommended 2,500. The existing test is built for 2,500 users (LOAD:22, CAP:50), which is larger than these numbers, but the full gate has never been run to a pass (CAPR:53; see the first note above), so nothing is yet proved. The audit allows a smaller, clearly stated limit (CAP:56-58).                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Business                              |
| Q2  | On the busiest match, how many people have the app or site open in the 10 minutes around kick-off? | **Owner answer: low 50, likely 150, high 300** (5%, 15%, 30% of 1,000). The owner said "accept all" to the assumed figures, scaled to the 500 and 1,000 above.                                                                                                                                                                | Replaces the earlier 500 / 1,000 / 1,500. Still a forecast, not a measurement; the repository holds no real figure (CAP:56). The browsing test does not exist yet (CAP:234-242), so for now it is a declaration and an accepted risk (CAP:363).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Business (a forecast)                 |
| Q3  | In the last 10 minutes before a team lock, how many managers save a team or make a transfer?       | **Owner answer: low 30, likely 100, high 200** (3%, 10%, 20% of 1,000).                                                                                                                                                                                                                                                       | Replaces "test all of Q1". The existing test is built to make 2,500 accounts act around the deadline (LOAD:22-27), more than 10 times the "high" case, so the earlier concern that the test would need extending for "high" no longer applies to its size. It has not been run to a pass (CAPR:53); whether the game holds is for the staging test to show.                                                                                                                                                                                                                                                                                                                                                                                                                                | Business (a forecast)                 |
| Q4  | In the busiest hour, how many new accounts are created (launch day, a press mention)?              | **Owner answer: up to 250 new accounts in the busiest hour** (half the launch crowd arriving at once; the owner calls this a cautious assumption).                                                                                                                                                                            | Replaces the earlier 500. Still recorded as an **untested** risk: no tool tests sign-up bursts and they need Supabase's approval (CAP:234-240). The alternative is to have a developer build the test first (step 10, option a).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Business                              |
| Q5  | How many leagues will exist by season end, and how big is the biggest?                             | **Owner answer: about 100 leagues; the biggest could hold everyone, 1,000 members.**                                                                                                                                                                                                                                          | Replaces the earlier 500 leagues and 2,500 members. Ranking cost grows with leagues. For 5,000 teams and 500 leagues one scoring run needs about 1,319 steps, inside its allowance of 1,500; past about 700 leagues it does not (WORK:231-264). The declared 100 is far below 700, so the 700-league limit is not expected to bite; to be confirmed by the staging test. A 1,000-member league is below the 10,000-member league the load data builds (CAPR:86).                                                                                                                                                                                                                                                                                                                           | Both                                  |
| Q6  | Full public launch, or a pilot with a cap? If a pilot, what number?                                | **Owner answer: a pilot capped at 1,000 managers.**                                                                                                                                                                                                                                                                           | Replaces the earlier 2,500. The audit allows a pilot with a stated cap (CAP:57-58, CAP:70). **Owner-independent finding, 2026-10-16: nothing enforces a cap today** (RUN:174-225; finding C in section 2). The smallest design is in RUN:234-265. The owner must say what it counts (teams or accounts) and whether to build it.                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Business                              |
| Q7  | What size of server is production on, and how much are you willing to spend on the test?           | **Owner answer: "we start with lowest, I have no big budget."** Test staging at the **same size as production**; **no extra spending.** The production size itself is **still unread**: the owner can read it from the Supabase dashboard (Settings, Compute and Disk).                                                       | Replaces the earlier plan (up to $50 of Amazon per run, a bigger server, retry at XL). The documents disagree on the size: Large on 2026-09-25 (LOAD:66-67), against XL or 2XL to certify with no size passed (CAP:91-94, CAPR:49-50). **If production is below Medium** (the tier measured in July, about 65 actions a second, CAPR:10-17), the report must say so plainly and must not claim a pass. **Owner-independent finding, 2026-10-16:** at Medium or below, the locked profile is expected to FAIL (about 65 requests a second measured in July against 250 asked; RUN:93-103). The owner's "lowest size" and "no big budget" answers therefore conflict with a PASS (finding C). A smaller profile would be a new reviewed test, never an edit of the locked one (RUN:105-107). | Technical (size) and Business (money) |
| Q8  | Who is the one person allowed to change the staging database during the test, and when?            | **Owner answer: the named staging writer is Claude (the assistant).** Codex stays out unless Claude explicitly hands over a written window, and then Claude stays out for that window. The owner decided this in conversation, 2026-10-16. The window itself (a full day, about 8 hours) is not yet fixed; no date was given. | Two efforts once ran on staging for 88 minutes without knowing about each other and the result had to be thrown away (AG:36-43, CAP:124-127). The guard does not see the nightly test, scheduled jobs or someone in the SQL editor, so a human rule is needed (CAP:134-140). The nightly 03:00 UTC test is still to be switched off for the window (CAP:171-175).                                                                                                                                                                                                                                                                                                                                                                                                                          | Business (who and when)               |

### What these answers change

- **The pilot cap falls from 2,500 to 1,000 managers** (launch 500). The league
  figure falls from 500 to about 100. The 700-leagues ranking limit named in
  section 4 (WORK:262) is above the declared 100, so the stored-cursor change
  is not needed for this pilot. This is a reading of the declared figures,
  **to be confirmed by the staging test**, not a result.
- **The earlier worry about extending the test for Q3 "high" is gone.** The
  existing test (2,500 users, 10,000-member league; CAPR:86, CAPR:187) is
  larger than the declared traffic in size, though it has not been run to a
  pass (CAPR:53). What is still not covered is browsing and
  sign-up bursts (Q2, Q4), unchanged.
- **Money.** With no extra spending and staging at the production size, the
  earlier fallback "if it fails, retry at XL" is dropped. A fail at the
  production size is reported as a fail, not worked around by buying a bigger
  server. **Owner-independent finding, 2026-10-16:** on a Medium server or
  smaller, that fail is the expected result of the locked profile (finding C in
  section 2). The owner should know this before the day is spent, and decide
  whether a fail at the lowest size is acceptable, or whether a smaller,
  separately reviewed profile is wanted (RUN:156-165).
- **Who writes.** Claude is the one staging writer. The "one writer at a time"
  rule (AG:23-26) now has a name: Codex does not write to staging unless Claude
  hands over a written window.

### Still open from section 3

- **Production's server size** is unread (Q7). Nothing in the test can start
  until it is known, because staging must match it.
- **The 1,000-manager cap does not exist as a mechanism** (Q6). The reading of
  the code is done: nothing enforces it (RUN:174-225). Left for the owner: what
  it counts (Fantasy teams or all accounts), and whether to build it
  (finding C in section 2; RUN:1092-1093, O11). Until then "pilot capped at
  1,000" is a stated intention.
- **Whether the Amazon load-test cost counts as "extra spending."** The script
  refuses to start above $50 a run (LOAD:35-37); the owner's "no extra
  spending" was not tied to it. Ask before running it.
- The date of the staging window (Q8).

Also decide (CAP:113-116): **never copy real user data from production into
staging.** I recommend yes; staging uses fake data only.

## 4. What agents can do without a production write, per blocker

Legend. **Now** means: files, read-only checks or a throwaway local database,
touching no shared database. **Staging window** means a write to staging, so it
needs the one named writer (Q8: Claude, per the owner's answer) and the checks of AG:57-361. **Production write**
means the owner runs a guarded script (CL:33-48). **Real people** means it
cannot be done by an agent.

None of the five needs a production write to be _proved_. The capacity plan
itself says it touches no production database and uses staging as the stand-in
(CAP:3-5, CAP:371). A fix found along the way (for example a new database
change) would be applied to production later by the owner's guarded script, one
operation at a time (CL:33-48, PD:26).

### A8 (SEC-02, FANT-11)

**Now (no database write):**

- Write the evidence file skeleton `docs/production/CAPACITY_EVIDENCE_<date>.md`
  with your Q1 to Q8 answers and the empty version table (CAP:253-254,
  CAP:284-293).
- Wrap the version checks of CAP:260-266 in one helper that prints the table
  (code only; it uses `scripts/backend/migration-ledger-compare.ts`). Running
  it against a database is a read.
- Propose a small version stamp for Edge Functions, which today show a version
  number and date but no commit (CAP:275-278). It is a code change and counts
  only once released.
- Read the code and report whether a cap on managers or leagues can be
  enforced (CAP:70). This decides whether Q6 "pilot with a cap" is real.
- Re-run the existing cost test locally at the declared size (about 100
  leagues, Q5) to confirm the step-count formula (WORK:231-247; test `scripts/backend/fantasy-lifecycle-runner.test.ts`).
- Write the break and restore commands of Drill A and Drill B as a paste-ready
  sheet with a box for each original value (CAP:312-345). They are written, not
  run.
- If you choose step 10 option (a), build the match-day browsing burst test as
  code and dry-run it locally (CAP:236-242), sized to the declared Q2 (low 50,
  likely 150, high 300). Needs your choice (a) or (b); the owner has not yet
  chosen.
- Only if the number of leagues goes above about 700: write the change that
  stores the ranking cursor so ranking resumes (WORK:262-264) as files plus
  tests on a throwaway local PostgreSQL, the way Phase D rehearsed its scripts
  (PD:65-69). The owner's declared Q5 is about 100 leagues, far below 700, so I
  would **not** build it now; the staging test is what confirms that.
- Read, on GitHub, whether `Backend quality` is green on the release commit
  (CAP:246-248).

**Done since this section was first written (owner-independent finding,
2026-10-16; all of it written, none run).** The run sheet RUN holds: the
decision on the test profile (RUN:43-170), the reading of the code for the cap
(RUN:172-284), the pause and restore commands for every scheduled writer
(RUN:396-543), the steps in order (RUN:544-806), the blank evidence form
(RUN:807-1035), the Drill A and B break-and-restore commands inside step 11
(RUN:728-775) and the owner's actions (RUN:1037-1108). **Not done:** the helper
that prints the version table, the Edge Function version stamp, the browsing
burst test, and everything on staging in finding B.

**Staging window (one writer, Claude):** steps 2 to 9, 11 and 13 of CAP:169-254 are all
staging writes: pausing switches, resizing, the staging database update, Edge
Function deploys, loading the 50,000-team fake data, the load test, the
signed-in test, and the failure drills. A read-only browsing burst writes
nothing but loads the same server, so it must not overlap another step
(CAP:143).

**Production write:** none in the plan. Reading production for the version
table (website header, migration list) is a read (CAP:260-266). The statement
limit read of step 1 is already done (PD:25, CAP:151-160), so skip it.

**Gap I found in the plan, now confirmed (owner-independent finding,
2026-10-16).** CAP step 4 brings staging up to date with the "Staging database
update" workflow (CAP:188-192). But the repository also has a separate
staging-only script for the SofaScore rating release,
`scripts/backend/apply-20261014-sofascore-rating-release-staging.sql`, whose
header says staging never received that release (lines 6-13), and the Phase A/B
runbook says staging lacks it (ABR:3-8). The read-only comparison of the two
databases found staging **41 migrations behind** and 11 more (Group A) outside
that script (finding B in section 2), so step 4 would stop partway if run
alone. RUN step 4 already says to stop and ask if it names one of the 20
(RUN:620-625). Still to do: a developer lists staging's missing migrations (a
read) against the script's 20 and Group A's 11.

### SEC-01 outside the lease

**Status (owner-independent finding, 2026-10-16):** the read of the live
functions is done (finding A in section 2): the calendar sync and the prize
check are safe, the player-statistics import path has a real hole, and a fix is
prepared on `work/finalizing-guard` (commit `0e906a24`), under independent
review and applied nowhere. What follows replaces the older text of this
section, which treated the verdict as still to be written.

**Now (no database write):**

- The two independent reviews compared the live text of 55 functions with the
  repository and found them md5-equal. This settles the old caution that the
  migration file alone might not be the live text of the calendar function
  (`supabase/migrations/20261013160200_staged_stats_progression.sql:441` had
  patched it). It covers the 55 functions compared and no others.
- The "leads from a first look" of this section are now confirmed for the
  calendar sync and the prize check (locks: finding A). The doc that calls the
  overlap unverified (WORK:199-203) has not been updated.
- The hole is in the live refresh and its player matcher, not in the
  orchestrator; the orchestrator's own statistics import is skipped when the
  data source is SofaScore (ORCH:233, ORCH:500-505), which it is today.
- Independent review of the prepared fix: under way. Its own database test
  (`supabase/tests/database/fantasy_finalizing_scoring_inputs_guard.test.sql` on
  the branch) was not run, because there was no Docker; CI's `database-quality`
  is the authority for database tests (CL:62-66).
- Still open and unproven: the missing row lock in
  `fantasy_assert_mutable_gameweek` (finding A). If the owner wants it closed,
  an agent writes the test first on a throwaway local PostgreSQL.
- The older options (hold the lease across the whole orchestrator, WORK:204-205;
  or a pilot-limit wording, PA:124-125) do not address the hole. They remain
  possible for the smaller orchestrator overlap, which was found harmless.

**Staging window:** an optional concurrency drill on staging, inside the A8
window. With the fix applied on staging first, the drill can create a player
while a gameweek is `finalizing` and expect the refusal. Staging has only 3
finalized gameweeks and no gameweek with work (finding B), so this needs a
prepared gameweek.

**Production write:** the fix itself. It reaches production only after the
owner approves the merge (AG:419-423) and authorises the guarded script as one
operation (CL:33-48). It must pause the Fantasy tick and the live refresh while it
runs, and the script refuses to run otherwise (FIN:70-114).

**Unclear, partly answered:** whether the overlap can happen today at all. The
hourly GitHub orchestrator was seen holding the lease, so it is probably on; the
variable `FANTASY_AUTOMATION_ENABLED` itself was not read (workflow line 91).
The Edge worker is off and has never run. Neither matters for the hole, which
is in the live refresh and is open now.

### STATE (real-state checks)

**Done (owner-independent finding, 2026-10-16):** the checklist is written
(CHK; finding E in section 2). It was built from the four "not verified" lists
below. Nothing in it has been run.

The four lists, kept for reference: PA:65-68
(transfer preview panel, Pronostics loading, failed and guest-import notices,
the guest squad storage warning, match "section failed" cards, league "calculated
at" wording); PB:86-92 (error and retry panels, saved-articles page states,
board paging, card renderer failure, real hidden or deleted accounts, sign-in
error codes, a failed script chunk on a device); PC:81-93 (real news carousel,
a real Arabic article with emphasis and a quotation, the real points page with
substitutions, real 200% operating-system text); PD:126-138 (WhatsApp and iOS
share sheet, an account with more than 2,000 saved articles, a real mail client,
push). Each line of the checklist has: route, language, what to do, what the
screen should say.

**Staging window:** any check that signs in and saves something is a staging
write. The website has no staging copy that was found (CAP:281-282), so it is
unclear where these run. Options: a local copy of the site pointed at staging
(agents can do this inside the window, after step 9; the checklist assumes
this, CHK:63-69), or a test account on the live site (a production write, not
recommended; CL:33-40). Staging is not ready for either today (finding B): its
accounts cannot receive mail, so the sign-up and reset cases (A1, A2, A5) are
Blocked unless the owner creates confirmed test accounts by hand (CHK:70-74).
The prepared data P1 to P6 is a staging write by the one named writer
(CHK:103-112).

**Real people:** phones, the screen readers, WebKit (iPhone) and the share
sheets (PD:126-132). An account with more than 2,000 saves needs fake data
loaded on staging first.

### ARABIC

**Done (owner-independent finding, 2026-10-16):** the sheet exists (REV: 697
rows, built from PD:179-197 and PC:157-181, ranked by risk) and a non-native
pre-read of every row is written (PRE; finding D in section 2). The pre-read
approves nothing. The owner has read the Phase C wording (PD:24), but PD:230
still lists Phases A to D, so ask the owner to confirm Phase C is done rather
than assume it. **Still to do:** the native reader, then the edits, which are
dictionary edits in code.

**One exception that touched the database, now done:** the weekly Top 10
notification title is stored in the database and its Arabic is
«المواهب: توب 10 للأسبوع {{week}}» (PD:92-93). This page first said to get the
Arabic approved **before** the owner committed the script
(`scripts/backend/apply-20261016100000-prospects-weekly-notification-text.sql`,
PD:94-95). The owner has since applied migration `20261016100000` on Production
V2 (verified read-only; pull request 504 merged), so that Arabic text is now
live. Notifications already sent keep their old word, and only lists published
from now on get the new text (PD:96-97). **Unclear:** whether the native Arabic
read happened before the apply; nothing records it. If the reader wants a
change, it is a new migration (migrations are forward-only, CL:52-53), not an
edit of this one. **Owner-independent finding, 2026-10-16:** this is now
concrete. The pre-read recommends «أفضل 10» instead of «توب 10» everywhere
(PRE:252-259); if the native reader agrees, the live bell text needs that new
migration.

### PRO-04 (reminder delivery)

**Now:** read the code claims in REM:21-50 against the code and flag any
difference; prepare the results sheet (REM:148-163) with the account ids left
blank; list the dashboard checks that must be true before any test (mail
function deployed, two secrets set, mail domain verified; REM:74-76).

**Owner-independent finding, 2026-10-16: staging cannot run these tests yet.**
It has no mail function deployed (1 of 15 Edge Functions), no account that can
receive mail (all use `staging.botolago.invalid`) and no future fixture (3 past
fixtures only). Finding F in section 2 lists them. The results-sheet template
is already in REM:148-163.

**Staging window:** all of REM:78-146. Turning test mode on is a write to a
shared database (REM:80-81). Record each current value first and restore it
after (REM:84-92, REM:103-105). The reminder tests and the capacity tests both
write to staging, so they must be in **separate windows**, not the same one
(AG:360-361). I recommend the capacity window first, then this.

**Real people:** a real mailbox, and for push a real phone with a build, which
does not exist yet (REM:34-35, REM:144-146). The free mail plan sends at most 90
notification emails a day (REM:177-178). Do not claim production delivery from
a staging result (REM:174-175).

**Production write:** none. Never used (REM:18).

## 5. Other owner actions (not on the audit's blocker list)

These are in PD:71-124. They do not block the audit verdict, but several are
time-sensitive. The "State" column is updated for 2026-10-16.

| Item                                                                                       | State                                                                                                                                                                                                                                                                                                                                                      | Who          | Cite                     |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------ |
| Deploy the account-deletion worker (its e-mail dates used the server's time zone)          | **Done.** Deployed on Production V2 as version 7; the owner said the `BOTOLAGO_SCHEDULER_TOKEN` secret is set; an independent read-only review (2026-10-16) found the live files match the repo except one file with a harmless extra leading newline. The first real call happens when a deletion falls due, and requests wait 7 days, so **watch that**. | Owner (done) | PD:111-116, AG:199-213   |
| **Watch the first Monday draft gate, 2026-10-19 at 12:00Z**                                | Open; three days from today. Data caveat: round 3 answered `too_few_ranked` on 2026-10-12.                                                                                                                                                                                                                                                                 | Owner        | PD:111-116               |
| Watch the first daily Pépites sweep after the Morocco-time fix                             | **Done.** It ran correctly at 00:00:02Z on 2026-10-16 (read-only check).                                                                                                                                                                                                                                                                                   | Owner (done) | PD:111-116               |
| Deploy the e-mail functions so e-mails say Prospects / المواهب                             | Open; e-mails keep the old name until then                                                                                                                                                                                                                                                                                                                 | Owner        | PD:84-86                 |
| Weekly bell text (Prospects / المواهب)                                                     | **Done.** Migration `20261016100000` applied on Production V2 by the owner and verified read-only; pull request 504 merged. See the ARABIC note in section 4 about the Arabic read.                                                                                                                                                                        | Owner (done) | PD:87-97                 |
| Refresh the demo page `public/demo/app.html`                                               | **Partly done.** The text was patched to Prospects / المواهب (commit `c140a604`). A full regeneration is still blocked by 5 type errors in `demo/src`: `demo/src/screens/Create.tsx:345`, `demo/src/screens/Matchday.tsx:212`, `demo/src/screens/Points.tsx:124`, `demo/src/screens/Points.tsx:191`, `demo/src/shared.ts:84`.                              | Agent        | PD:98-99                 |
| Run the measurement queries (query 0 first) and keep the first results as a dated baseline | Open                                                                                                                                                                                                                                                                                                                                                       | Owner        | PD:117-118               |
| Confirm the crest licence for the Curva card or revert it to initials discs                | **Owner-reported, not documented.** The owner states the crests and similar images are free to use as long as use is not commercial (owner, 2026-10-16, in conversation). Cautions and what is still open are in the list below the table.                                                                                                                 | Owner        | PD:121-123, PROD:254-258 |

### Other facts recorded 2026-10-16

- **Rivals and Trophées.** The owner confirmed they are meant to be **on** in
  production (owner, 2026-10-16, in conversation). Both ship off
  (`rivals-tick`, AG:307-334; `trophies-tick`, AG:335-359). **Whether their
  switches are on in production now is not recorded here** and was not read.
  Both tick jobs write to the database, so each counts in the "check what is
  running" step before any staging or production write (AG:57-361).
- **Curva card comprehension.** The owner states users have understood it
  ("I have had users, they comprehend it"; owner, 2026-10-16, in
  conversation). This is **owner-reported, not measured against**
  `docs/engineering/CURVA_COMPREHENSION_TEST.md`, which asks for 5 to 8 French
  and 5 to 8 Arabic supporters in separate sessions (CURVA:29-31). How many
  users, in which language, and what they were asked were not provided. The
  protocol is therefore still not run.
- **Crest and image licence.** Owner-reported: free to use as long as use is
  **not commercial** (owner, 2026-10-16, in conversation). Cautions: the
  product has BotolaGO+ Rivaux and premium-season features, and any ads,
  sponsors or paid tier could make the use commercial. Keep the source and its
  written terms on file. `PRODUCT.md` records only that crests are cleared for
  in-app display and that share images, marketing and store listings are
  unknown (PROD:254-258). VIS-002 to VIS-005 still need product input
  (PC:54, PC:105).
- **Housekeeping commits, done.** The scheduled-jobs list in `AGENTS.md` was
  brought in line with the migrations (commit `49e7456c`). The public News
  caches now clear the outgoing account's saved marks on sign-out (commit
  `db2c6354`).

## 6. Order of work

Updated a third time on 2026-10-16 with the owner-independent findings. Steps
marked "done" are kept so the numbering still matches earlier messages. **No
blocker is closed by any step marked done.**

1. **Done: Q1 to Q8 answered** (section 3). Still to say: who reads Arabic, who
   tests on phones (and which phones), and the date of the staging window.
2. **Owner, ten minutes, in parallel.** The quick looks, to settle section 7:
   production's server size and its list of Edge Functions in the Supabase
   dashboard (Q7; RUN:1044-1050, O1; the test cannot be sized without it, and if
   it is Medium or smaller the report says so and does not claim a pass, which
   is also the expected result of the locked profile: finding C); whether the
   GitHub environment `fantasy-e2e` exists (it is needed for the signed-in test,
   step 9; LED:3409-3414, CAP:229-232; RUN:1075-1078, O7); and, optional, the
   GitHub variable `FANTASY_AUTOMATION_ENABLED`.
3. **SEC-01, time-limited: gameweek 4 is live.** The fix is prepared and under
   independent review (finding A). When the review is done the owner decides: a
   draft pull request, the owner's approval to merge (AG:419-423), then the
   guarded production script as one authorised operation (CL:33-48; FIN:70-114
   says what it pauses). The aim is to apply it **before gameweek 4 is sealed**:
   4 of its 8 matches are finished and the rest are on 17 and 18 October, so
   this is days, not weeks. Nothing is merged or applied until the owner says.
4. **Owner decides the cap** (Q6): what "1,000" counts (teams or accounts) and
   whether to build option A (RUN:234-265; O11, RUN:1092-1093). If built, it is
   merged before the staging window so the window tests the code that ships
   (RUN:267-271). Also decided here: whether the expected FAIL on a Medium server
   is acceptable, or a smaller, separately reviewed profile is wanted
   (finding C).
5. **Claude agents, files only (no database):** most of this is **done**: the
   SEC-01 verdict and fix (finding A), the Arabic review sheet and pre-read
   (finding D), the real-state checklist (finding E), the capacity run sheet with
   its evidence form and Drill sheets (RUN). **Left:** the reminder results sheet
   with account ids filled in, the version-table helper and Edge Function version
   stamp, and, if chosen, the browsing burst test. These lanes touch only files,
   so they can run together (AG:63-66).
6. **Native Arabic reader**, now that the sheet and the pre-read exist. Start from
   the 24 ERROR-LIKELY rows and the four open questions (PRE:7-31, PRE:242-280).
   Then agents apply the edits. The bell-text migration is already applied
   (section 4), so a change to that string, such as «أفضل 10», would be a new
   migration.
7. **Staging readiness (staging writes, one writer: Claude).** The A8 test cannot
   be run until staging has the work of finding B done: its 41 missing migrations
   (the rating release script's 20 and the 11 of Group A), the Edge Functions
   deployed (1 of 15 are), the stale `DEFERRED` entry removed or accounted for,
   and a gameweek with work for the drills. The run sheet puts part of this inside
   the window (RUN:607-672, steps 4 to 6). The size of the gap may justify doing
   it as an earlier window of its own; that is my suggestion, not a decision. The
   owner reads staging's compute size and disk in the dashboard (RUN O12).
8. **Staging window for A8** (one writer: Claude; one day), in the order of
   RUN:544-806 (CAP:141-254, steps 0 to 13), with the owner's part in
   RUN:1037-1108 (O1 to O15). Staging at the same size as production, no extra
   spending. Before it starts, list what is running; **Rivals and Trophées are ON
   on staging and are to be paused** (RUN W13 and W14, RUN:515-529) along with
   every other scheduled writer (RUN:396-543; AG:57-361).
9. **Real-state checks** inside or just after that window, after step 9 of the
   capacity plan, run by the named tester from the checklist (CHK), with
   the prepared data P1 to P6 loaded first.
10. **Separate window for reminder delivery** (PRO-04), after staging has a mail
    function, accounts that can receive mail and a future fixture (finding F).
    Never the same day as 8 for a different writer; Claude stays the one writer
    unless it hands over a written window (Q8).
11. **Fix what the tests found,** repeat only the failed step, and fill the
    evidence file. Confirm `Backend quality` is green on the release commit
    (CAP:246-248).
12. **Owner reads the evidence file and decides go or no-go.** This plan does not
    make that decision.

**Watch items on the calendar:** Monday 2026-10-19 at 12:00Z, the first draft
gate (round 3 answered `too_few_ranked` on 2026-10-12, so an empty result may be
the data and not a fault); the first real call of the account-deletion worker,
when a deletion first falls due (requests wait 7 days); and **the end of
gameweek 4 on 17 and 18 October, which is when the SEC-01 hole can bite** if the
fix is not applied.

### The owner's actions, in one list

Gathered from the sections above. Those marked RUN are the run sheet's own
numbering (RUN:1037-1108). Nothing here is done unless the earlier text says so.

- **SEC-01:** tell the agents when the review is done and whether to merge; then
  authorise the one production script (step 3). Decide whether the unproven "no
  row lock" item needs a test (finding A).
- **Cap:** say what 1,000 counts and whether to build it (step 4; RUN O11).
- **Server size:** read production's compute and disk (RUN O1), and its Edge
  Function list. **Before the database worker is ever switched on, deploy
  `fantasy-lifecycle-worker`**, which production does not list today (AG:282-296;
  finding B). Confirm in the dashboard first.
- **Spending:** say whether the Amazon cost and staging's disk and size are within
  "no big budget" (RUN O2).
- **The window:** pick the date and freeze merges (RUN O3, O4); turn the nightly
  signed-in test off for it (RUN O5); check the GitHub set-up and the signed-in
  test set-up (RUN O6, O7); confirm mail sending is off on staging (RUN O8);
  optionally store a test alarm destination (RUN O9); decide the browsing burst
  test (RUN O10); resize staging when asked (RUN O12); stand by (RUN O13); close
  and decide go or no-go (RUN O14, O15).
- **Staging:** the pause list for the window includes Rivals and Trophées, both
  ON on staging (finding B).
- **Arabic:** name the native reader (step 6) and answer the four open questions
  with them (PRE:242-280).
- **Real-state checks:** name one tester, say which two phones, and settle the 15
  "owner to confirm" points (CHK:46-101, CHK:1447-1455).
- **Reminders:** authorise each staging write for PRO-04 once staging is ready
  (finding F); watch the first real account-deletion call and the first Monday
  draft gate (section 5).

## 7. Unclear status: please settle with a yes or a no

| Item                                                                      | What the documents say                                                                                                                                                                                                                                                                                                                                                                                                    | Why it is unclear                                                                                                                                                                                                 | How to settle it                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The launch ledger's open items                                            | The ledger was last updated 2026-09-21 (LED:4). It still lists these as not done: credential rotation and sign-in settings, BG-0021 (LED:4241-4248); publishing merged `main`, BG-0022 (LED:4249-4254); the sign-up mail items BG-0106, BG-0107, BG-0108 (LED:1089, 1109, 1129); the global ranking BG-0073 (LED:486); the fixture list BG-0087 and BG-0088 (LED:911, 940); and the hourly job switch BG-0004 (LED:2781). | The Phase D report never mentions them and nothing says they were closed. Many are probably done, but no record says so.                                                                                          | An agent reads each in the ledger and checks the repository and (reads only) the live state; the owner confirms the ones only the dashboard shows. |
| Terms of Service and Privacy Policy, BG-0067                              | Ledger: they do not exist, waiting for the owner's text (LED:316-335).                                                                                                                                                                                                                                                                                                                                                    | The files `src/routes/terms.tsx` and `src/routes/privacy.tsx` now exist, so the ledger is probably stale. Whether the text is final and in both languages is not recorded.                                        | Owner reads both pages in French and Arabic and says "final" or "draft".                                                                           |
| Fantasy rating points (points from the SofaScore rating, from gameweek 5) | Built and **off**; nothing changes until the owner commits `scripts/backend/activate-fantasy-rating-points.sql` before the gameweek 5 deadline (`docs/backend/FANTASY_RATING_POINTS.md:3-4`, 132-134).                                                                                                                                                                                                                    | The document is dated 2026-10-13/14 and the audit reports do not say whether it has been switched on. Time-sensitive.                                                                                             | Owner or agent reads `app_private.fantasy_rating_policy` (a read) and the next gameweek's deadline.                                                |
| Is the SofaScore rating release on staging?                               | Staging lacked it as of the Phase A/B runbook (ABR:3-8); a staging-only script was committed 2026-10-15. **Owner-independent finding, 2026-10-16: it is not.** A read-only comparison found staging 41 migrations behind production, the release among them, and 11 more (Group A) that the staging-only script does not contain (finding B).                                                                             | The split of the 41 between the script's 20, Group A's 11 and the rest is not in the figures given, and no repository file defines "Group A". It decides whether capacity step 4 works.                           | Developer compares staging's migration list with the script header (see the gap note under A8).                                                    |
| Is the hourly GitHub orchestrator on, and is the database worker on?      | The GitHub job runs on its schedule only if the variable is `true` (workflow line 91); the Edge worker "ships off" (AG:295). **Owner-independent finding, 2026-10-16:** read-only reviews saw the hourly GitHub orchestrator holding the lease, and the Edge worker off and never run (finding A).                                                                                                                        | The GitHub variable itself was not read, and the Edge Function the database worker would wake is not deployed on production (13 listed, no `fantasy-lifecycle-worker`). The hole in finding A is open either way. | Owner reads the GitHub variable; a read of `app_private.fantasy_worker_configure`'s settings gives the other.                                      |
| Whether the `fantasy-e2e` GitHub environment exists                       | Needed for the signed-in test: "6 passed, 0 skipped" (CAP:229-232, LED:3406, LED:3409-3414).                                                                                                                                                                                                                                                                                                                              | Ledger says the owner had not created it as of 2026-09-21.                                                                                                                                                        | Owner looks under GitHub, Settings, Environments.                                                                                                  |
| Production's server size (Q7)                                             | Owner has not read it. LOAD:66-67 says Large on 2026-09-25; CAP:91-94 and CAPR:49-50 say XL or 2XL to certify. The owner said "we start with lowest" (2026-10-16, in conversation).                                                                                                                                                                                                                                       | Unread. It sets the size of the staging copy and whether the report can claim a pass (below Medium it cannot).                                                                                                    | Owner reads Supabase dashboard, Settings, Compute and Disk, and tells the developer.                                                               |
| Which Edge Functions are deployed on production                           | **Owner-independent finding, 2026-10-16:** production lists 13 Edge Functions, against 15 folders in the repository, and no `fantasy-lifecycle-worker` (AG:282-296).                                                                                                                                                                                                                                                      | It was read from a list, not from the dashboard by the owner. The database worker is off, so nothing fails today; it must be deployed before the worker is switched on.                                           | Owner confirms the list in the Supabase dashboard.                                                                                                 |
| Staging's compute size and disk                                           | **Owner-independent finding, 2026-10-16:** not visible by SQL. LOAD:110 said Micro on 2026-09-25.                                                                                                                                                                                                                                                                                                                         | Unread. It must be resized to production's size for the window (RUN:594-606).                                                                                                                                     | Owner reads the staging dashboard (RUN O12).                                                                                                       |
| Has the review of the SEC-01 fix finished, and may it be merged?          | The fix is on branch `work/finalizing-guard`, commit `0e906a24`, under independent review, applied nowhere (finding A).                                                                                                                                                                                                                                                                                                   | The result of the review is not on this page.                                                                                                                                                                     | Owner is told when it is done, then decides (section 6, step 3).                                                                                   |
| How a 1,000-manager cap is enforced (Q6)                                  | Owner answer: pilot capped at 1,000. CAP:70 says how a cap is enforced is not documented. **Owner-independent finding, 2026-10-16: nothing enforces it** (RUN:174-225).                                                                                                                                                                                                                                                   | Not unclear any more as to the mechanism; unclear as to what the owner wants counted and whether to build it.                                                                                                     | The owner decides teams or accounts and whether to build (finding C; RUN:1092-1093).                                                               |
| Whether the Amazon load-test cost counts as "extra spending"              | The script refuses to start above $50 a run (LOAD:35-37). The owner said no extra spending (Q7).                                                                                                                                                                                                                                                                                                                          | The owner's answer was not tied to the test's own cost.                                                                                                                                                           | Ask the owner before the run.                                                                                                                      |
| Are the Rivals and Trophées switches on in production?                    | Owner: meant to be on (2026-10-16, in conversation). Both ship off (AG:321, AG:340). **Owner-independent finding, 2026-10-16:** both are ON on staging and must be paused for the window (finding B).                                                                                                                                                                                                                     | The current switch state was not read.                                                                                                                                                                            | A read of `app_private.rivals_settings` and `app_private.trophy_settings`; listing what is running before any write.                               |
| Curva card comprehension, and the crest and image licence                 | Owner-reported only (section 5). The comprehension protocol is `docs/engineering/CURVA_COMPREHENSION_TEST.md` (CURVA:29-31). The licence is "free if not commercial".                                                                                                                                                                                                                                                     | No numbers, languages or questions for the first; no written source or terms for the second.                                                                                                                      | Owner supplies the details and keeps the licence terms in writing; run the protocol for a measured result.                                         |

Places where the documents disagree (listed so nobody is surprised):

- PD:171 says "Morocco time zone data in the database is unchecked", but PD:100-116
  says the fix was applied and checked on both databases. Treat PD:100-116 as
  current; PD:171 looks like a leftover.
- PD:24 says the owner read the Phase C wording; PD:230 still lists Phases A to D
  as unread.
- WORK:160 headlines the orchestrator rule as "closed in code", while WORK:196-205
  says the part outside the lease is "still open". Only the timeout part is
  closed.
- The size of production's server: LOAD:66-67 against CAP:91-94 and CAPR:49-50
  (see Q7).
- WORK:196-205 says the overlap of the calendar sync and the prize check with an
  Edge pass is unverified. Two read-only reviews of production on 2026-10-16
  found both safe (finding A). WORK has not been updated. It also does not
  mention the hole in the live refresh's player matcher.
- RUN:613-614 and the `DEFERRED` entry in SDU:68-72 say migration
  `20260925090500` is deferred because production has not applied it. The review
  of 2026-10-16 found the entry stale (finding B).
- Phase B (PB:121) and Phase C (PC:155) say the Phase A/B migrations are "applied
  nowhere"; PD:73-79 and ABR:3-8 say they were found already applied on
  production on 2026-10-15. Treat the later documents as current.
- The bell-text migration `20261016100000`: PD:87-97 and the status block of
  `docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md` said "written, not
  applied" (2026-10-15). It is applied on Production V2 (the owner ran the
  guarded script on 2026-10-16; an independent read-only check passed; pull
  request 504 merged). Both documents now say so. **Resolved.** It is not
  applied on Staging V2.
