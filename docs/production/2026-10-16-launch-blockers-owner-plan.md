# Launch blockers: an owner plan

Written 2026-10-16 from `main` at `8779e75`. This is a plan only. No database,
host, workflow, setting or job was touched to write it, and nothing in it has
been run. Every "first step" below is a step for someone to take later.

**What to do with this page.** Read section 1 (two minutes). Answer section 3
(eight questions; "accept all" is a valid answer). Then follow section 6 in
order. Sections 2, 4 and 5 are the detail behind those.

Source key. Every claim cites `file:line`; the files are shortened like this:

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
  top-priority (P0) defect (PD:3-5, PD:199-203).
- **Closed since Phase C** (so not on the list below): the database statement
  limit check (the owner ran it: 60 s service role, 8 s authenticator, so the
  lease extension is safe); the CI `database-quality` job passed on pull
  request 495; the three Phase A/B migrations are already on production
  (PD:205-211). The Morocco clock fix was applied on both databases on
  2026-10-15 (PD:100-109).
- **Five items still block launch** (PD:213-223). Section 2 lists them.
- Related but not on the audit's blocker list: owner actions that are open
  (section 5) and older ledger items whose status nobody has recorded
  (section 7).

## 2. The open launch blockers

The audit gives an ID to three of the five (A8 with SEC-02 and FANT-11; SEC-01;
and PRO-04, named at PD:35). The other two have no audit ID; I call them
"STATE" and "ARABIC" here so they can be referred to.

| ID                       | What it means, in one sentence                                                                                                                                                                                                 | Why it blocks launch                                                                                                                                                                                                         | Who must act                                                                                                                 | What is needed                                                                                                                                                                                             | Effort                                                                                                                                               | Exact first step                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A8** (SEC-02, FANT-11) | Nobody has shown that the game holds up under a real crowd, that the live app, database and background jobs all run the same version, or that a failed scoring run recovers on its own (PD:215-216, CAP:24-31).                | The audit stays NO-GO until it is shown (PD:199-203). The last real test, in July, failed at about 65 actions a second (CAP:25-26). One scoring run cannot finish ranking past about 700 leagues (WORK:262).                 | Owner decides and clicks. Claude agents prepare and read results. A developer deploys to staging (CAP:107-108, CAP:194-200). | Answers to Q1 to Q8 (section 3); a staging copy at production size; one named writer and a time window; the 13 steps of CAP:141-254; a filled evidence file (CAP:253-254).                                 | Owner: 30 to 60 min to answer, then one full day as the window. Agents: 1 to 2 days of preparation (est.). The full test alone: up to 2 h (CAP:212). | Owner replies to section 3 ("accept all" or changes). Nothing else starts before that (CAP:145-147).                                                                                                                      |
| **SEC-01**               | Scoring is protected from running twice at once, but three side jobs (the calendar update, the player-statistics import, the prize check) are not, and nobody has checked that overlap is harmless (PD:217-219, WORK:196-205). | Two jobs could change the same rows at the same moment; the audit asks for this to be checked against the database code, or fixed, or covered by a stated pilot limit (PA:124-125).                                          | Claude agents (reading and, if chosen, code). Owner chooses the option.                                                      | A written verdict from reading the live database functions, then one of: put the whole orchestrator under the lease (code), or accept a documented pilot limit (PA:124-125, WORK:204-205).                 | Review: half a day (est.). Code fix and tests: 1 to 2 days (est.). Pilot-limit wording: 1 hour (est.).                                               | Owner looks at one GitHub setting: is the variable `FANTASY_AUTOMATION_ENABLED` set to `true`? The hourly job runs on its schedule only then (`.github/workflows/fantasy-season-orchestrator.yml:91`). Tell me yes or no. |
| **STATE**                | Several screens were only ever seen with sample data, never with a real account, real data, a phone, French and Arabic (PD:220-221, PD:126-138).                                                                               | The states that mock mode cannot show (errors, retries, empty and long lists, failed loads) are exactly what a first real user meets (PA:65-68, PB:86-92, PC:85-93).                                                         | Real people and devices, with agents preparing. Owner names a tester.                                                        | A checklist run on real phones (iPhone and Android), with a real signed-in test account, in French and Arabic, plus a screen-reader pass (VoiceOver, TalkBack, NVDA) (PC:81-82).                           | Half a day to one day (est.).                                                                                                                        | Agents write the checklist (section 4). Owner names one tester and says which phones they have.                                                                                                                           |
| **ARABIC**               | No native Arabic speaker has read the new Arabic wording from Phases A, B and D (PD:222, PD:124).                                                                                                                              | Wrong Arabic in promises (unsubscribe scope, notification language, brand names) is a trust problem for an Arabic-first audience, and one such text is stored in the database where it cannot be quietly changed (PD:87-97). | Native Arabic reader (the owner or someone the owner trusts). Agents prepare the sheet and apply edits.                      | A review sheet listing each string, where it appears, its French meaning and the risk, built from PD:169-190 and PC:157-181; the reader answers "fine" or "change to".                                     | 2 to 4 hours of reading (est.), then 1 to 2 hours for agents to apply changes (est.).                                                                | Agents produce the sheet. Owner says who reads it.                                                                                                                                                                        |
| **PRO-04**               | We have never proved that a reminder (match kick-off, Fantasy deadline, round recap) arrives once, at the right Morocco time, and only on the channels the person allows (PD:223, REM:7-16).                                   | Until it is proved, reminders can only be described as a saved setting, never as a promise (REM:18-19).                                                                                                                      | Owner authorises each staging write. Real inbox and phone. Agents prepare.                                                   | Test accounts on staging, a real mailbox, mail sending set up (REM:74-76), test mode switched on and restored afterwards (REM:78-105). Push cannot be tested yet: no phone build (REM:34-35, REM:144-146). | 2 to 3 hours of hands-on work spread over 1 to 2 days, because of waiting for real kick-offs and deadlines (REM:109-124) (est.).                     | Owner (or an agent given a read-only connection) runs the read-only checks of REM:54-72 on staging and sends the results. Reads only.                                                                                     |

## 3. The capacity questions Q1 to Q8, in plain language

These are the eight questions of CAP:61-72, reworded. For each there is a
recommended answer. **To accept everything, reply "accept all Q1 to Q8".** To
change some, reply with the numbers and your values.

Three things to know before you answer:

- The existing test is built for **2,500 managers** deciding at once: 2,500
  temporary accounts, 600 actions a second for 10 seconds, 250 a second for 50
  seconds, then 250 a second for 10 minutes (LOAD:22-27, CAP:50). That is a
  test shape, not a forecast, and the audit accepts a smaller, clearly stated
  pilot limit (CAP:56-58).
- That test covers deadline saves only. It does **not** cover people browsing
  scores and news on match day, the website host, or bursts of sign-ups
  (LOAD:126-131, CAP:234-238). So Q2 and Q4 can be declared but not yet tested.
- Answers marked **Business** are your decision (a forecast, a promise, a
  budget). Answers marked **Technical** are a fact someone reads off a screen.

| #   | Plain question                                                                                     | Recommended answer                                                                                                                                                                                                                                                                                    | Why                                                                                                                                                                                                                                                                                                                | Kind                                  |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Q1  | How many people will play Fantasy at launch, and at the end of the season?                         | **Up to 2,500 at launch and at season end**, as a stated pilot cap. Raise it later only after a bigger test passes.                                                                                                                                                                                   | 2,500 is exactly what the existing test proves (LOAD:22, CAP:50). The audit allows a smaller, clearly stated limit (CAP:56-58). A larger number needs a new, larger test (CAP:74-76). If you have real figures (waiting list, pre-registrations), use them instead.                                                | Business                              |
| Q2  | On the busiest match, how many people have the app or site open in the 10 minutes around kick-off? | **Low 500, likely 1,000, high 1,500** (20%, 40%, 60% of Q1). This is my assumption; the repository holds no real figure (CAP:56).                                                                                                                                                                     | The number is needed for the browsing test (CAP:234-242), which does not exist yet, so for now it is a declaration and an accepted risk (CAP:363). Replace it with real data if you have it.                                                                                                                       | Business (a forecast)                 |
| Q3  | In the last 10 minutes before a team lock, how many managers save a team or make a transfer?       | **Low 25%, likely 50%, high 100% of Q1; test the "high" case.** At Q1 = 2,500 that means all 2,500.                                                                                                                                                                                                   | The existing test already makes all 2,500 accounts act around the deadline (LOAD:22-27), so no new code is needed (CAP:74-76). Testing the worst case is the only honest declaration.                                                                                                                              | Business (a forecast)                 |
| Q4  | In the busiest hour, how many new accounts are created (launch day, a press mention)?              | **Up to 500 in the busiest hour** (20% of Q1), recorded as an **untested** risk for the pilot. Do not run a big promotion in the opening hour.                                                                                                                                                        | No tool tests sign-up bursts and they need Supabase's approval (CAP:234-240). With a 2,500 cap, 500 an hour is a planning figure, my assumption. The alternative is to have a developer build the test first (step 10, option a).                                                                                  | Business                              |
| Q5  | How many leagues will exist by season end, and how big is the biggest?                             | **Up to 500 leagues; the biggest may be everyone (up to 2,500).**                                                                                                                                                                                                                                     | Ranking cost grows with leagues. For 5,000 teams and 500 leagues one scoring run needs about 1,319 steps, inside its allowance of 1,500; past about 700 leagues it does not, and only the slower GitHub run finishes (WORK:231-264). Whether the app can enforce a league cap is not documented.                   | Both                                  |
| Q6  | Full public launch, or a pilot with a cap? If a pilot, what number?                                | **A pilot, capped at the Q1 number (2,500)**, until a larger test passes.                                                                                                                                                                                                                             | The audit allows a pilot with a tested cap (CAP:57-58, CAP:70). It is the only option that can be proven with what exists. **How a cap is enforced is not documented** (CAP:70); an agent should read the code and report this first (section 4).                                                                  | Business                              |
| Q7  | What size of server is production on, and how much are you willing to spend on the test?           | Read the size from the Supabase dashboard (Settings, Compute and Disk) and give it to me. Test staging at that same size. **Budget: up to $50 of Amazon per run, plus one day of the production-size server.** If it fails at that size, retry at XL and plan to move production to XL before launch. | The documents disagree: one says production pointed to Large on 2026-09-25 (LOAD:66-67), another says the size to certify is XL or 2XL and that no size has passed (CAP:91-94, CAPR:49-50). The Amazon script refuses to start above $50 (LOAD:35-37); the Supabase price shows on the resize screen (LOAD:38-39). | Technical (size) and Business (money) |
| Q8  | Who is the one person allowed to change the staging database during the test, and when?            | **You name one person (you, if no one else) and one full day (about 8 hours; est. from the step timings in CAP:212 and CAP:343).** No other Claude backend work runs that day, and the nightly 03:00 UTC test is switched off for the window (CAP:171-175).                                           | Two efforts once ran on staging for 88 minutes without knowing about each other and the result had to be thrown away (AG:36-43, CAP:124-127). The guard does not see the nightly test, scheduled jobs or someone in the SQL editor, so a human rule is needed (CAP:134-140).                                       | Business (who and when)               |

Also decide (CAP:113-116): **never copy real user data from production into
staging.** I recommend yes; staging uses fake data only.

## 4. What agents can do without a production write, per blocker

Legend. **Now** means: files, read-only checks or a throwaway local database,
touching no shared database. **Staging window** means a write to staging, so it
needs the one named writer (Q8) and the checks of AG:57-70. **Production write**
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
- Re-run the existing cost test locally at the declared size to confirm the
  step-count formula (WORK:231-247; test `scripts/backend/fantasy-lifecycle-runner.test.ts`).
- Write the break and restore commands of Drill A and Drill B as a paste-ready
  sheet with a box for each original value (CAP:312-345). They are written, not
  run.
- If you choose step 10 option (a), build the match-day browsing burst test as
  code and dry-run it locally (CAP:236-242). Needs your choice (a) or (b).
- Only if Q5 is above about 700 leagues: write the change that stores the
  ranking cursor so ranking resumes (WORK:262-264) as files plus tests on a
  throwaway local PostgreSQL, the way Phase D rehearsed its scripts
  (PD:65-68). With the recommended Q5 (500 leagues) I would **not** build it
  now.
- Read, on GitHub, whether `Backend quality` is green on the release commit
  (CAP:246-248).

**Staging window (one writer):** steps 2 to 9, 11 and 13 of CAP:169-254 are all
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
  read (AG:50). It matters because the calendar function was rewritten after
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
`main`, which needs your approval (AG:357-362).

**Unclear:** whether the overlap can happen today at all. The hourly GitHub job
runs only if `FANTASY_AUTOMATION_ENABLED` is `true` (workflow line 91), and the
database-scheduled worker ships off (AG:233). Neither current
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

**Now (no database at all):** build the sheet from PD:169-190 and PC:157-181
(ranked by risk). Columns: key, Arabic text, French meaning, screen, risk,
"fine" or "change to". The owner has read the Phase C wording (PD:21), but PD:222
still lists Phases A to D, so ask the owner to confirm Phase C is done rather
than assume it. Fixes are dictionary edits in code.

**One exception that touches the database:** the weekly Top 10 notification
title is stored in the database and its Arabic is «المواهب: توب 10 للأسبوع {{week}}»
(PD:90-92). Notifications already sent keep their old word, and only lists
published after the script is committed get the new text (PD:95-97). Get the
Arabic approved **before** the owner commits that script
(`scripts/backend/apply-20261016100000-prospects-weekly-notification-text.sql`,
PD:92-95). The script itself is a production write the owner runs.

### PRO-04 (reminder delivery)

**Now:** read the code claims in REM:21-50 against the code and flag any
difference; prepare the results sheet (REM:148-163) with the account ids left
blank; list the dashboard checks that must be true before any test (mail
function deployed, two secrets set, mail domain verified; REM:74-76).

**Staging window:** all of REM:78-146. Turning test mode on is a write to a
shared database (REM:80-81). Record each current value first and restore it
after (REM:84-92, REM:103-105). The reminder tests and the capacity tests both
write to staging, so they must be in **separate windows**, not the same one
(AG:298-300). I recommend the capacity window first, then this.

**Real people:** a real mailbox, and for push a real phone with a build, which
does not exist yet (REM:34-35, REM:144-146). The free mail plan sends at most 90
notification emails a day (REM:177-178). Do not claim production delivery from
a staging result (REM:174-175).

**Production write:** none. Never used (REM:18).

## 5. Other open owner actions (not on the audit's blocker list)

These are in PD:71-124. They do not block the audit verdict, but several are
time-sensitive.

| Item                                                                                                                                                          | State                                          | Who   | Cite                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----- | ------------------------ |
| Deploy the account-deletion worker (its e-mail dates used the server's time zone) and **watch the first Monday draft gate, 2026-10-19 at 12:00Z**             | Open; the Monday gate is three days from today | Owner | PD:111-116               |
| Deploy the e-mail functions so e-mails say Prospects / المواهب                                                                                                | Open; e-mails keep the old name until then     | Owner | PD:84-86                 |
| Run the guarded script for the weekly bell text (after the Arabic is approved, see ARABIC above)                                                              | Written, applied nowhere                       | Owner | PD:87-97                 |
| Refresh the demo page `public/demo/app.html`                                                                                                                  | Open                                           | Agent | PD:98-99                 |
| Run the measurement queries (query 0 first) and keep the first results as a dated baseline                                                                    | Open                                           | Owner | PD:117-118               |
| Confirm the crest licence for the Curva card or revert it to initials discs: the code draws club crests, while PRODUCT.md says use in share images is unknown | Open, a business decision                      | Owner | PD:121-123, PROD:254-258 |

## 6. Order of work

1. **Owner, 30 to 60 minutes.** Answer Q1 to Q8 ("accept all" is fine). Say who
   reads Arabic, who tests on phones, and who is the named writer.
2. **Owner, ten minutes, in parallel.** Three quick looks, to settle section 7:
   the GitHub variable `FANTASY_AUTOMATION_ENABLED` (yes or no); whether the
   GitHub environment `fantasy-e2e` exists (it is needed for the signed-in test,
   step 9; LED:3409-3414, CAP:229-232); and production's server size in the
   Supabase dashboard (Q7).
3. **Claude agents, now, files only (no database):** the SEC-01 verdict, the
   Arabic review sheet, the real-state checklist, the reminder results sheet, the
   evidence-file skeleton and the Drill sheets. These lanes touch only files, so
   they can run together (AG:63-66).
4. **Native Arabic reader**, as soon as the sheet exists. Then agents apply the
   edits, then the owner commits the bell-text script.
5. **If SEC-01 is "not safe":** agents build the fix and tests; owner approves
   the merge (AG:357-362). Do this **before** the staging window so that the
   window tests the final code.
6. **Staging window for A8** (one writer, one day), in the order of CAP:141-254,
   adding the rating-release staging script check before step 4.
7. **Real-state checks** inside or just after that window, after step 9.
8. **Separate window for reminder delivery** (PRO-04). Never the same day as 6
   for a different writer.
9. **Fix what the tests found,** repeat only the failed step, and fill the
   evidence file. Confirm `Backend quality` is green on the release commit
   (CAP:246-248).
10. **Owner reads the evidence file and decides go or no-go.** This plan does not
    make that decision.

## 7. Unclear status: please settle with a yes or a no

| Item                                                                      | What the documents say                                                                                                                                                                                                                                                                                                                                                                                                    | Why it is unclear                                                                                                                                                          | How to settle it                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The launch ledger's open items                                            | The ledger was last updated 2026-09-21 (LED:4). It still lists these as not done: credential rotation and sign-in settings, BG-0021 (LED:4241-4248); publishing merged `main`, BG-0022 (LED:4249-4254); the sign-up mail items BG-0106, BG-0107, BG-0108 (LED:1089, 1109, 1129); the global ranking BG-0073 (LED:486); the fixture list BG-0087 and BG-0088 (LED:911, 940); and the hourly job switch BG-0004 (LED:2781). | The Phase D report never mentions them and nothing says they were closed. Many are probably done, but no record says so.                                                   | An agent reads each in the ledger and checks the repository and (reads only) the live state; the owner confirms the ones only the dashboard shows. |
| Terms of Service and Privacy Policy, BG-0067                              | Ledger: they do not exist, waiting for the owner's text (LED:316-335).                                                                                                                                                                                                                                                                                                                                                    | The files `src/routes/terms.tsx` and `src/routes/privacy.tsx` now exist, so the ledger is probably stale. Whether the text is final and in both languages is not recorded. | Owner reads both pages in French and Arabic and says "final" or "draft".                                                                           |
| Fantasy rating points (points from the SofaScore rating, from gameweek 5) | Built and **off**; nothing changes until the owner commits `scripts/backend/activate-fantasy-rating-points.sql` before the gameweek 5 deadline (`docs/backend/FANTASY_RATING_POINTS.md:3-4`, 132-134).                                                                                                                                                                                                                    | The document is dated 2026-10-13/14 and the audit reports do not say whether it has been switched on. Time-sensitive.                                                      | Owner or agent reads `app_private.fantasy_rating_policy` (a read) and the next gameweek's deadline.                                                |
| Is the SofaScore rating release on staging?                               | Staging lacked it as of the Phase A/B runbook (ABR:3-8); a staging-only script was committed 2026-10-15.                                                                                                                                                                                                                                                                                                                  | No record of it being run on staging. It decides whether capacity step 4 works.                                                                                            | Developer compares staging's migration list with the script header (see the gap note under A8).                                                    |
| Is the hourly GitHub orchestrator on, and is the database worker on?      | The GitHub job runs on its schedule only if the variable is `true` (workflow line 91); the Edge worker "ships off" (AG:233).                                                                                                                                                                                                                                                                                              | Neither setting is recorded in the repository. It decides whether the SEC-01 overlap can happen today.                                                                     | Owner reads the GitHub variable; a read of `app_private.fantasy_worker_configure`'s settings gives the other.                                      |
| Whether the `fantasy-e2e` GitHub environment exists                       | Needed for the signed-in test: "6 passed, 0 skipped" (CAP:229-232, LED:3406, LED:3409-3414).                                                                                                                                                                                                                                                                                                                              | Ledger says the owner had not created it as of 2026-09-21.                                                                                                                 | Owner looks under GitHub, Settings, Environments.                                                                                                  |

Places where the documents disagree (listed so nobody is surprised):

- PD:163 says "Morocco time zone data in the database is unchecked", but PD:100-116
  says the fix was applied and checked on both databases. Treat PD:100-116 as
  current; PD:163 looks like a leftover.
- PD:21 says the owner read the Phase C wording; PD:222 still lists Phases A to D
  as unread.
- WORK:160 headlines the orchestrator rule as "closed in code", while WORK:196-205
  says the part outside the lease is "still open". Only the timeout part is
  closed.
- The size of production's server: LOAD:66-67 against CAP:91-94 and CAPR:49-50
  (see Q7).
- Phase B (PB:121) and Phase C (PC:155) say the Phase A/B migrations are "applied
  nowhere"; PD:73-79 and ABR:3-8 say they were found already applied on
  production on 2026-10-15. Treat the later documents as current.
