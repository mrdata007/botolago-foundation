# Launch blockers: an owner plan

Written 2026-10-16 from `main` at `8779e75`. This is a plan only. No database,
host, workflow, setting or job was touched to write it, and nothing in it has
been run. Every "first step" below is a step for someone to take later.

**Updated later the same day (2026-10-16)** with what the owner decided in
conversation (the capacity answers in section 3) and with what has been done
since (section 5, "Done today"). Everything marked "Owner answer" or
"owner-reported" is the owner's word in conversation, 2026-10-16, and has not
been checked against a system. Nothing was run to write the update either.

**What to do with this page.** Read section 1 (two minutes). Section 3 is now
answered; what is left for the owner is the short list at its end (production's
server size, the cap, the Arabic reader, the phone tester). Then follow
section 6 in order. Sections 2, 4 and 5 are the detail behind those.

Source key. Every claim cites `file:line`; the files are shortened like this.
The line numbers cite the files as they stand on the branch `work/arabic-sheet`
(the tree of commit `d8ff2529`, plus the fix commit after it, which moves no
cited line), not as they stood on `main` at `8779e75`: `AGENTS.md` and the
Phase D report both changed after that commit.

| Short | File                                                    |
| ----- | ------------------------------------------------------- |
| PD    | `docs/audits/2026-10-15-audit-remediation-phase-d.md`   |
| PC    | `docs/audits/2026-10-15-audit-remediation-phase-c.md`   |
| PB    | `docs/audits/2026-10-15-audit-remediation-phase-b.md`   |
| PA    | `docs/audits/2026-10-14-audit-remediation-phase-a.md`   |
| CAP   | `docs/production/CAPACITY_AND_RELEASE_EVIDENCE_PLAN.md` |
| REM   | `docs/engineering/REMINDER_DELIVERY_EVIDENCE.md`        |
| WORK  | `docs/backend/FANTASY_WORKER_SCHEDULE.md`               |
| LOAD  | `docs/operations/LOAD_TEST.md`                          |
| CAPR  | `docs/backend/FANTASY_CAPACITY_REPORT.md`               |
| ORCH  | `scripts/backend/fantasy-season-orchestrator.ts`        |
| ABR   | `docs/production/PHASE_A_B_MIGRATIONS_OWNER_RUNBOOK.md` |
| LED   | `docs/engineering/LAUNCH_LEDGER.yaml`                   |
| AG    | `AGENTS.md`                                             |
| CL    | `CLAUDE.md`                                             |
| PROD  | `PRODUCT.md`                                            |
| CURVA | `docs/engineering/CURVA_COMPREHENSION_TEST.md`          |

Effort figures marked "(est.)" are my estimates, not numbers from the
repository. Figures without that mark are quoted from the cited line.

Words used once:

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
  top-priority (P0) defect (PD:3-5, PD:206-208).
- **Closed since Phase C** (so not on the list below): the database statement
  limit check (the owner ran it: 60 s service role, 8 s authenticator, so the
  lease extension is safe); the CI `database-quality` job passed on pull
  request 495; the three Phase A/B migrations are already on production
  (PD:210-216). The Morocco clock fix was applied on both databases on
  2026-10-15 (PD:100-109).
- **Five items still block launch** (PD:218-228). Section 2 lists them. The
  capacity answers (Q1 to Q8) are now given by the owner (section 3), which
  unblocks the first step of A8 but proves nothing yet: the capacity test has
  not been run.
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

| ID                       | What it means, in one sentence                                                                                                                                                                                                 | Why it blocks launch                                                                                                                                                                                                                                                              | Who must act                                                                                                                 | What is needed                                                                                                                                                                                                                     | Effort                                                                                                                                               | Exact first step                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A8** (SEC-02, FANT-11) | Nobody has shown that the game holds up under a real crowd, that the live app, database and background jobs all run the same version, or that a failed scoring run recovers on its own (PD:220-221, CAP:24-31).                | The audit stays NO-GO until it is shown (PD:206-208). The last real test, in July, failed at about 65 actions a second (CAP:25-26). One scoring run cannot finish ranking past about 700 leagues (WORK:262); the owner's declared 100 leagues is well below that (section 3, Q5). | Owner decides and clicks. Claude agents prepare and read results. A developer deploys to staging (CAP:107-108, CAP:194-200). | Answers to Q1 to Q8 (**given**, section 3); a staging copy at the same size as production (size still unread); one named writer (**Claude**) and a time window; the 13 steps of CAP:141-254; a filled evidence file (CAP:253-254). | Owner: 30 to 60 min to answer, then one full day as the window. Agents: 1 to 2 days of preparation (est.). The full test alone: up to 2 h (CAP:212). | Done: the owner answered Q1 to Q8 on 2026-10-16 (section 3). Next: the owner reads production's server size from the Supabase dashboard and gives it to the developer (Q7), and a developer confirms how a 1,000-manager cap is enforced (Q6). |
| **SEC-01**               | Scoring is protected from running twice at once, but three side jobs (the calendar update, the player-statistics import, the prize check) are not, and nobody has checked that overlap is harmless (PD:222-224, WORK:196-205). | Two jobs could change the same rows at the same moment; the audit asks for this to be checked against the database code, or fixed, or covered by a stated pilot limit (PA:124-125).                                                                                               | Claude agents (reading and, if chosen, code). Owner chooses the option.                                                      | A written verdict from reading the live database functions, then one of: put the whole orchestrator under the lease (code), or accept a documented pilot limit (PA:124-125, WORK:204-205).                                         | Review: half a day (est.). Code fix and tests: 1 to 2 days (est.). Pilot-limit wording: 1 hour (est.).                                               | Owner looks at one GitHub setting: is the variable `FANTASY_AUTOMATION_ENABLED` set to `true`? The hourly job runs on its schedule only then (`.github/workflows/fantasy-season-orchestrator.yml:91`). Tell me yes or no.                      |
| **STATE**                | Several screens were only ever seen with sample data, never with a real account, real data, a phone, French and Arabic (PD:225-226, PD:126-138).                                                                               | The states that mock mode cannot show (errors, retries, empty and long lists, failed loads) are exactly what a first real user meets (PA:65-68, PB:86-92, PC:85-93).                                                                                                              | Real people and devices, with agents preparing. Owner names a tester.                                                        | A checklist run on real phones (iPhone and Android), with a real signed-in test account, in French and Arabic, plus a screen-reader pass (VoiceOver, TalkBack, NVDA) (PC:81-82).                                                   | Half a day to one day (est.).                                                                                                                        | Agents write the checklist (section 4). Owner names one tester and says which phones they have.                                                                                                                                                |
| **ARABIC**               | No native Arabic speaker has read the new Arabic wording from Phases A, B and D (PD:227, PD:124).                                                                                                                              | Wrong Arabic in promises (unsubscribe scope, notification language, brand names) is a trust problem for an Arabic-first audience, and one such text is stored in the database where it cannot be quietly changed (PD:87-97).                                                      | Native Arabic reader (the owner or someone the owner trusts). Agents prepare the sheet and apply edits.                      | A review sheet listing each string, where it appears, its French meaning and the risk, built from PD:176-194 and PC:157-181; the reader answers "fine" or "change to".                                                             | 2 to 4 hours of reading (est.), then 1 to 2 hours for agents to apply changes (est.).                                                                | Agents produce the sheet. Owner says who reads it.                                                                                                                                                                                             |
| **PRO-04**               | We have never proved that a reminder (match kick-off, Fantasy deadline, round recap) arrives once, at the right Morocco time, and only on the channels the person allows (PD:228, REM:7-16).                                   | Until it is proved, reminders can only be described as a saved setting, never as a promise (REM:18-19).                                                                                                                                                                           | Owner authorises each staging write. Real inbox and phone. Agents prepare.                                                   | Test accounts on staging, a real mailbox, mail sending set up (REM:74-76), test mode switched on and restored afterwards (REM:78-105). Push cannot be tested yet: no phone build (REM:34-35, REM:144-146).                         | 2 to 3 hours of hands-on work spread over 1 to 2 days, because of waiting for real kick-offs and deadlines (REM:109-124) (est.).                     | Owner (or an agent given a read-only connection) runs the read-only checks of REM:54-72 on staging and sends the results. Reads only.                                                                                                          |

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

| #   | Plain question                                                                                     | Owner answer (2026-10-16, in conversation)                                                                                                                                                                                                                                                                                    | Why / what changes                                                                                                                                                                                                                                                                                                                                                                                                                                               | Kind                                  |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Q1  | How many people will play Fantasy at launch, and at the end of the season?                         | **Owner answer: about 500 managers at launch, about 1,000 by the end of the season** (the owner's own figures).                                                                                                                                                                                                               | Replaces the earlier recommended 2,500. The existing test is built for 2,500 users (LOAD:22, CAP:50), which is larger than these numbers, but the full gate has never been run to a pass (CAPR:53; see the first note above), so nothing is yet proved. The audit allows a smaller, clearly stated limit (CAP:56-58).                                                                                                                                            | Business                              |
| Q2  | On the busiest match, how many people have the app or site open in the 10 minutes around kick-off? | **Owner answer: low 50, likely 150, high 300** (5%, 15%, 30% of 1,000). The owner said "accept all" to the assumed figures, scaled to the 500 and 1,000 above.                                                                                                                                                                | Replaces the earlier 500 / 1,000 / 1,500. Still a forecast, not a measurement; the repository holds no real figure (CAP:56). The browsing test does not exist yet (CAP:234-242), so for now it is a declaration and an accepted risk (CAP:363).                                                                                                                                                                                                                  | Business (a forecast)                 |
| Q3  | In the last 10 minutes before a team lock, how many managers save a team or make a transfer?       | **Owner answer: low 30, likely 100, high 200** (3%, 10%, 20% of 1,000).                                                                                                                                                                                                                                                       | Replaces "test all of Q1". The existing test is built to make 2,500 accounts act around the deadline (LOAD:22-27), more than 10 times the "high" case, so the earlier concern that the test would need extending for "high" no longer applies to its size. It has not been run to a pass (CAPR:53); whether the game holds is for the staging test to show.                                                                                                      | Business (a forecast)                 |
| Q4  | In the busiest hour, how many new accounts are created (launch day, a press mention)?              | **Owner answer: up to 250 new accounts in the busiest hour** (half the launch crowd arriving at once; the owner calls this a cautious assumption).                                                                                                                                                                            | Replaces the earlier 500. Still recorded as an **untested** risk: no tool tests sign-up bursts and they need Supabase's approval (CAP:234-240). The alternative is to have a developer build the test first (step 10, option a).                                                                                                                                                                                                                                 | Business                              |
| Q5  | How many leagues will exist by season end, and how big is the biggest?                             | **Owner answer: about 100 leagues; the biggest could hold everyone, 1,000 members.**                                                                                                                                                                                                                                          | Replaces the earlier 500 leagues and 2,500 members. Ranking cost grows with leagues. For 5,000 teams and 500 leagues one scoring run needs about 1,319 steps, inside its allowance of 1,500; past about 700 leagues it does not (WORK:231-264). The declared 100 is far below 700, so the 700-league limit is not expected to bite; to be confirmed by the staging test. A 1,000-member league is below the 10,000-member league the load data builds (CAPR:86). | Both                                  |
| Q6  | Full public launch, or a pilot with a cap? If a pilot, what number?                                | **Owner answer: a pilot capped at 1,000 managers.**                                                                                                                                                                                                                                                                           | Replaces the earlier 2,500. The audit allows a pilot with a stated cap (CAP:57-58, CAP:70). **How a cap is enforced is still not documented** (CAP:70): a developer must confirm it, and an agent should read the code and report this first (section 4).                                                                                                                                                                                                        | Business                              |
| Q7  | What size of server is production on, and how much are you willing to spend on the test?           | **Owner answer: "we start with lowest, I have no big budget."** Test staging at the **same size as production**; **no extra spending.** The production size itself is **still unread**: the owner can read it from the Supabase dashboard (Settings, Compute and Disk).                                                       | Replaces the earlier plan (up to $50 of Amazon per run, a bigger server, retry at XL). The documents disagree on the size: Large on 2026-09-25 (LOAD:66-67), against XL or 2XL to certify with no size passed (CAP:91-94, CAPR:49-50). **If production is below Medium** (the tier measured in July, about 65 actions a second, CAPR:10-17), the report must say so plainly and must not claim a pass.                                                           | Technical (size) and Business (money) |
| Q8  | Who is the one person allowed to change the staging database during the test, and when?            | **Owner answer: the named staging writer is Claude (the assistant).** Codex stays out unless Claude explicitly hands over a written window, and then Claude stays out for that window. The owner decided this in conversation, 2026-10-16. The window itself (a full day, about 8 hours) is not yet fixed; no date was given. | Two efforts once ran on staging for 88 minutes without knowing about each other and the result had to be thrown away (AG:36-43, CAP:124-127). The guard does not see the nightly test, scheduled jobs or someone in the SQL editor, so a human rule is needed (CAP:134-140). The nightly 03:00 UTC test is still to be switched off for the window (CAP:171-175).                                                                                                | Business (who and when)               |

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
  server.
- **Who writes.** Claude is the one staging writer. The "one writer at a time"
  rule (AG:23-26) now has a name: Codex does not write to staging unless Claude
  hands over a written window.

### Still open from section 3

- **Production's server size** is unread (Q7). Nothing in the test can start
  until it is known, because staging must match it.
- **How a 1,000-manager cap is enforced** is undocumented (Q6, CAP:70). Until a
  developer confirms it, "pilot capped at 1,000" is a stated intention, not a
  mechanism.
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

**Staging window (one writer, Claude):** steps 2 to 9, 11 and 13 of CAP:169-254 are all
staging writes: pausing switches, resizing, the staging database update, Edge
Function deploys, loading the 50,000-team fake data, the load test, the
signed-in test, and the failure drills. A read-only browsing burst writes
nothing but loads the same server, so it must not overlap another step
(CAP:143).

**Production write:** none in the plan. Reading production for the version
table (website header, migration list) is a read (CAP:260-266). The statement
limit read of step 1 is already done (PD:25, CAP:151-160), so skip it.

**Gap I found in the plan (unclear, please confirm).** CAP step 4 brings staging
up to date with the "Staging database update" workflow (CAP:188-192). But the
repository also has a separate staging-only script for the SofaScore rating
release, `scripts/backend/apply-20261014-sofascore-rating-release-staging.sql`,
whose header says staging never received that release (lines 6-13), and the Phase
A/B runbook says staging lacks it (ABR:3-8). The capacity plan does not mention
it, and nothing records whether it has since been applied on staging. So step 4
may stop partway. First action for the developer: read staging's migration list
(a read) and compare with the 20 migrations `20261013110000` to `20261014090100`
named in that script's header.

### SEC-01 outside the lease

**Now (no database write):**

- Read the live text of the three functions: `api.service_sync_fantasy_calendar`,
  `api.service_evaluate_fantasy_prizes`, and the player-statistics import path
  (ORCH:505-526; skipped when the data source is SofaScore,
  ORCH:233, ORCH:500-505). Reading the live text with `pg_get_functiondef` is a
  read (AG:50-51). It matters because the calendar function was rewritten after
  the fact by a patch (`supabase/migrations/20261013160200_staged_stats_progression.sql:441`),
  so the migration file alone is not the live text. If no database
  connection is available, the owner pastes the output, or an agent rebuilds the
  function on a throwaway local PostgreSQL.
- Leads from a first look, not a verdict: the calendar sync takes a lock per
  season (`supabase/migrations/20260924200000_fantasy_postponement_and_enrolment.sql:186`)
  and locks gameweek rows (same file, lines 223-225); the prize check takes one
  global lock (`supabase/migrations/20260924120000_fantasy_prizes.sql:889`).
  These suggest the overlap may be safe, but the doc says it is unverified
  (WORK:199-203) and I have not checked the live text.
- Write a local test on a throwaway PostgreSQL that runs two calendar syncs and
  a prize check at once and asserts no duplicate gameweek, assignment or prize.
  CI's `database-quality` is the authority for database tests (CL:62-66).
- If the verdict is "not safe": hold the lease across the whole orchestrator
  (WORK:204-205), with fake-client tests in the style of
  `scripts/backend/fantasy-script-ambiguous-write.test.ts` (WORK:337-342).
- If the verdict is "safe" or you prefer to wait: write the pilot-limit wording
  (PA:124-125).

**Staging window:** an optional concurrency drill on staging, inside the A8
window.

**Production write:** none. A code fix reaches production only by merging to
`main`, which needs your approval (AG:419-423).

**Unclear:** whether the overlap can happen today at all. The hourly GitHub job
runs only if `FANTASY_AUTOMATION_ENABLED` is `true` (workflow line 91), and the
database-scheduled worker ships off (AG:295). Neither current
setting is recorded in the repository.

### STATE (real-state checks)

**Now:** build one checklist from the four "not verified" lists: PA:65-68
(transfer preview panel, Pronostics loading, failed and guest-import notices,
the guest squad storage warning, match "section failed" cards, league "calculated
at" wording); PB:86-92 (error and retry panels, saved-articles page states,
board paging, card renderer failure, real hidden or deleted accounts, sign-in
error codes, a failed script chunk on a device); PC:81-93 (real news carousel,
a real Arabic article with emphasis and a quotation, the real points page with
substitutions, real 200% operating-system text); PD:126-138 (WhatsApp and iOS
share sheet, an account with more than 2,000 saved articles, a real mail client,
push). Each line gets: route, language, what to do, what the screen should say.

**Staging window:** any check that signs in and saves something is a staging
write. The website has no staging copy that was found (CAP:281-282), so it is
unclear where these run. Options: a local copy of the site pointed at staging
(agents can do this inside the window, after step 9), or a test account on the
live site (a production write, not recommended; CL:33-40).

**Real people:** phones, the screen readers, WebKit (iPhone) and the share
sheets (PD:126-132). An account with more than 2,000 saves needs fake data
loaded on staging first.

### ARABIC

**Now (no database at all):** build the sheet from PD:176-194 and PC:157-181
(ranked by risk). Columns: key, Arabic text, French meaning, screen, risk,
"fine" or "change to". The owner has read the Phase C wording (PD:24), but PD:227
still lists Phases A to D, so ask the owner to confirm Phase C is done rather
than assume it. Fixes are dictionary edits in code.

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
edit of this one.

### PRO-04 (reminder delivery)

**Now:** read the code claims in REM:21-50 against the code and flag any
difference; prepare the results sheet (REM:148-163) with the account ids left
blank; list the dashboard checks that must be true before any test (mail
function deployed, two secrets set, mail domain verified; REM:74-76).

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

Updated 2026-10-16 after the owner's answers. Steps marked "done" are kept so
the numbering still matches earlier messages.

1. **Done: Q1 to Q8 answered** (section 3). Still to say: who reads Arabic, who
   tests on phones (and which phones), and the date of the staging window.
2. **Owner, ten minutes, in parallel.** Three quick looks, to settle section 7:
   production's server size in the Supabase dashboard (Q7; the test cannot be
   sized without it, and if it is below Medium the report says so and does not
   claim a pass); the GitHub variable `FANTASY_AUTOMATION_ENABLED` (yes or no);
   and whether the GitHub environment `fantasy-e2e` exists (it is needed for the
   signed-in test, step 9; LED:3409-3414, CAP:229-232).
3. **A developer, small:** confirm how a cap of 1,000 managers is enforced (Q6,
   CAP:70). Agents can read the code first and report.
4. **Claude agents, now, files only (no database):** the SEC-01 verdict, the
   Arabic review sheet, the real-state checklist, the reminder results sheet, the
   evidence-file skeleton (filled with the answers of section 3) and the Drill
   sheets. These lanes touch only files, so they can run together (AG:63-66).
5. **Native Arabic reader**, as soon as the sheet exists. Then agents apply the
   edits. The bell-text migration is already applied (section 4), so a change to
   that string would be a new migration.
6. **If SEC-01 is "not safe":** agents build the fix and tests; owner approves
   the merge (AG:419-423). Do this **before** the staging window so that the
   window tests the final code.
7. **Staging window for A8** (one writer: Claude; one day), in the order of
   CAP:141-254, adding the rating-release staging script check before step 4.
   Staging at the same size as production, no extra spending. Before it starts,
   list what is running, including the Rivals and Trophées ticks if they are on
   (AG:57-361).
8. **Real-state checks** inside or just after that window, after step 9 of the
   capacity plan.
9. **Separate window for reminder delivery** (PRO-04). Never the same day as 7
   for a different writer; Claude stays the one writer unless it hands over a
   written window (Q8).
10. **Fix what the tests found,** repeat only the failed step, and fill the
    evidence file. Confirm `Backend quality` is green on the release commit
    (CAP:246-248).
11. **Owner reads the evidence file and decides go or no-go.** This plan does not
    make that decision.

**Watch items on the calendar:** Monday 2026-10-19 at 12:00Z, the first draft
gate (round 3 answered `too_few_ranked` on 2026-10-12, so an empty result may be
the data and not a fault); and the first real call of the account-deletion
worker, when a deletion first falls due (requests wait 7 days).

## 7. Unclear status: please settle with a yes or a no

| Item                                                                      | What the documents say                                                                                                                                                                                                                                                                                                                                                                                                    | Why it is unclear                                                                                                                                                          | How to settle it                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The launch ledger's open items                                            | The ledger was last updated 2026-09-21 (LED:4). It still lists these as not done: credential rotation and sign-in settings, BG-0021 (LED:4241-4248); publishing merged `main`, BG-0022 (LED:4249-4254); the sign-up mail items BG-0106, BG-0107, BG-0108 (LED:1089, 1109, 1129); the global ranking BG-0073 (LED:486); the fixture list BG-0087 and BG-0088 (LED:911, 940); and the hourly job switch BG-0004 (LED:2781). | The Phase D report never mentions them and nothing says they were closed. Many are probably done, but no record says so.                                                   | An agent reads each in the ledger and checks the repository and (reads only) the live state; the owner confirms the ones only the dashboard shows. |
| Terms of Service and Privacy Policy, BG-0067                              | Ledger: they do not exist, waiting for the owner's text (LED:316-335).                                                                                                                                                                                                                                                                                                                                                    | The files `src/routes/terms.tsx` and `src/routes/privacy.tsx` now exist, so the ledger is probably stale. Whether the text is final and in both languages is not recorded. | Owner reads both pages in French and Arabic and says "final" or "draft".                                                                           |
| Fantasy rating points (points from the SofaScore rating, from gameweek 5) | Built and **off**; nothing changes until the owner commits `scripts/backend/activate-fantasy-rating-points.sql` before the gameweek 5 deadline (`docs/backend/FANTASY_RATING_POINTS.md:3-4`, 132-134).                                                                                                                                                                                                                    | The document is dated 2026-10-13/14 and the audit reports do not say whether it has been switched on. Time-sensitive.                                                      | Owner or agent reads `app_private.fantasy_rating_policy` (a read) and the next gameweek's deadline.                                                |
| Is the SofaScore rating release on staging?                               | Staging lacked it as of the Phase A/B runbook (ABR:3-8); a staging-only script was committed 2026-10-15.                                                                                                                                                                                                                                                                                                                  | No record of it being run on staging. It decides whether capacity step 4 works.                                                                                            | Developer compares staging's migration list with the script header (see the gap note under A8).                                                    |
| Is the hourly GitHub orchestrator on, and is the database worker on?      | The GitHub job runs on its schedule only if the variable is `true` (workflow line 91); the Edge worker "ships off" (AG:295).                                                                                                                                                                                                                                                                                              | Neither setting is recorded in the repository. It decides whether the SEC-01 overlap can happen today.                                                                     | Owner reads the GitHub variable; a read of `app_private.fantasy_worker_configure`'s settings gives the other.                                      |
| Whether the `fantasy-e2e` GitHub environment exists                       | Needed for the signed-in test: "6 passed, 0 skipped" (CAP:229-232, LED:3406, LED:3409-3414).                                                                                                                                                                                                                                                                                                                              | Ledger says the owner had not created it as of 2026-09-21.                                                                                                                 | Owner looks under GitHub, Settings, Environments.                                                                                                  |
| Production's server size (Q7)                                             | Owner has not read it. LOAD:66-67 says Large on 2026-09-25; CAP:91-94 and CAPR:49-50 say XL or 2XL to certify. The owner said "we start with lowest" (2026-10-16, in conversation).                                                                                                                                                                                                                                       | Unread. It sets the size of the staging copy and whether the report can claim a pass (below Medium it cannot).                                                             | Owner reads Supabase dashboard, Settings, Compute and Disk, and tells the developer.                                                               |
| How a 1,000-manager cap is enforced (Q6)                                  | Owner answer: pilot capped at 1,000. CAP:70 says how a cap is enforced is not documented.                                                                                                                                                                                                                                                                                                                                 | Nobody has confirmed a mechanism exists.                                                                                                                                   | A developer confirms; an agent can read the code first.                                                                                            |
| Whether the Amazon load-test cost counts as "extra spending"              | The script refuses to start above $50 a run (LOAD:35-37). The owner said no extra spending (Q7).                                                                                                                                                                                                                                                                                                                          | The owner's answer was not tied to the test's own cost.                                                                                                                    | Ask the owner before the run.                                                                                                                      |
| Are the Rivals and Trophées switches on in production?                    | Owner: meant to be on (2026-10-16, in conversation). Both ship off (AG:321, AG:340).                                                                                                                                                                                                                                                                                                                                      | The current switch state was not read.                                                                                                                                     | A read of `app_private.rivals_settings` and `app_private.trophy_settings`; listing what is running before any write.                               |
| Curva card comprehension, and the crest and image licence                 | Owner-reported only (section 5). The comprehension protocol is `docs/engineering/CURVA_COMPREHENSION_TEST.md` (CURVA:29-31). The licence is "free if not commercial".                                                                                                                                                                                                                                                     | No numbers, languages or questions for the first; no written source or terms for the second.                                                                               | Owner supplies the details and keeps the licence terms in writing; run the protocol for a measured result.                                         |

Places where the documents disagree (listed so nobody is surprised):

- PD:168 says "Morocco time zone data in the database is unchecked", but PD:100-116
  says the fix was applied and checked on both databases. Treat PD:100-116 as
  current; PD:168 looks like a leftover.
- PD:24 says the owner read the Phase C wording; PD:227 still lists Phases A to D
  as unread.
- WORK:160 headlines the orchestrator rule as "closed in code", while WORK:196-205
  says the part outside the lease is "still open". Only the timeout part is
  closed.
- The size of production's server: LOAD:66-67 against CAP:91-94 and CAPR:49-50
  (see Q7).
- Phase B (PB:121) and Phase C (PC:155) say the Phase A/B migrations are "applied
  nowhere"; PD:73-79 and ABR:3-8 say they were found already applied on
  production on 2026-10-15. Treat the later documents as current.
- The bell-text migration `20261016100000`: PD:87-97 and the status block of
  `docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md` said "written, not
  applied" (2026-10-15). It is applied on Production V2 (the owner ran the
  guarded script on 2026-10-16; an independent read-only check passed; pull
  request 504 merged). Both documents now say so. **Resolved.** It is not
  applied on Staging V2.
