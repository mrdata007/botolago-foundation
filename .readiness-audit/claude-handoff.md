# BotolaGO production readiness — Claude handoff

Date: 2026-10-08. Branch: `claude/readiness-p1-remediation`, based on `main`
at `3f9c57f`. Draft pull request: see the end of this file.

Result words are strict: **PASS** means verified by evidence named here,
**FAIL** means tested and shown not to comply, **UNVERIFIED** means the
evidence does not exist or is not enough.

## 1. Current repository state

- `main` is at `3f9c57f` (merge of #378, 2026-10-07). The working tree was
  clean at the start.
- The Phase 3 baseline commit **`ccf5feb` does not exist in the GitHub
  repository**. After a full unshallow fetch of all 356 remote branches,
  `git cat-file -t ccf5feb` fails, and no branch contains it.
- **`.readiness-audit/` did not exist on any branch.** None of
  `report.md`, `coverage.md`, `phase3-baseline.md` or `phase4-remediation.md`
  were ever pushed. This file is the first file in that folder.
- No open or closed pull request carries the Codex readiness work. A search
  of all 170+ pull requests found none about the scheduler, PITR or staff
  authorization findings.

So the Phase 2/3/4 reports and any Codex Phase 4 fixes could not be read. They
probably exist only in Codex's local working copy. **Every finding below was
re-verified from today's code**, not taken from the reports.

## 2. Codex work discovered

| What                                          | Where                                                                | State               |
| --------------------------------------------- | -------------------------------------------------------------------- | ------------------- |
| Phase 2/3/4 reports, baseline `ccf5feb`       | not on GitHub                                                        | not available       |
| Earlier Codex readiness work                  | #217 `codex/production-readiness-20260925` (launch re-check, merged) | merged before today |
| Other open Codex PRs (#252, #245, #116, #101) | unrelated features                                                   | untouched           |

The handoff's own summary (Phase 3 numbers, five P1 findings) was used as the
statement of work. No Codex fix for P1-01 to P1-03 existed to preserve or
build on.

## 3. The five P1 findings

| Finding                         | Baseline (Phase 3) | Evidence on `main` today                                                                                                                                                                                                                                  | Status after this branch               | Next action                                                         |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| P1-01 Scheduler authentication  | open               | **Confirmed.** 6 public (`verify_jwt = false`) functions call the service-role RPC `api.service_verify_scheduler_token` (SECURITY DEFINER, reads Vault, plain `=` compare) for any well-formed token, before refusing it. 2 tests asserted that call.     | **Fixed on branch**, not in production | Owner sets `BOTOLAGO_SCHEDULER_TOKEN`, then deploys the 6 functions |
| P1-02 Staff authorization order | open               | **Confirmed** in 2 functions. `news-editorial-write` parses and sanitizes the JSON and reads the service-role HMAC secret before any role check. `player-photo-upload` buffers ~30 MB of multipart first. `news-media-upload` was already correct.        | **Fixed on branch**, not in production | Deploy the 2 functions after review                                 |
| P1-03 PITR preflight            | open               | **Confirmed** in 3 places. The promoter records `bool(pitr_enabled)` and promotes, 7F labels it `DISABLED_ACCEPTED`, and the 7E-A workflow prints PASS unconditionally. Ledger: a production promotion passed with `pitrEnabled false` (run 35375519576). | **Fixed on branch**                    | Owner enables PITR, or migration promotion stays blocked            |
| P1-04 RPO ≤ 5 min               | UNVERIFIED         | No PITR enabled (last evidence 2026-09-18), no restore rehearsal anywhere in the repo                                                                                                                                                                     | **UNVERIFIED**                         | Section 10                                                          |
| P1-05 RTO ≤ 1 h                 | UNVERIFIED         | No restore has ever been timed                                                                                                                                                                                                                            | **UNVERIFIED**                         | Section 10                                                          |

No P1 was added or downgraded.

## 4. Fixes already present

None of P1-01 to P1-03 had a fix on any branch. The pieces that were already
right and were reused:

- `news-media-upload` already authorized before reading the body (its
  `get_my_staff_context` pre-flight). The same rule now protects the two
  other staff functions.
- The ingestion functions (`football-ingest`, `news-ingest`,
  `news-ingest-elbotola`) already checked their key in constant time before
  any database call. They were not changed.
- The 7F gate already failed closed on WAL-G; PITR now follows the same
  pattern.

## 5. Fixes completed by Claude

| Commit     | Fix                                                                                                                                                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0f2378de` | **P1-01.** `supabase/functions/_shared/scheduler-token.ts` compares the header with the Edge Function secret `BOTOLAGO_SCHEDULER_TOKEN` in constant time, before any client call. Missing or malformed secret → `503 scheduler_token_not_configured` (fails closed). Used by all 6 scheduled functions. No SQL change. |
| `017a2e3c` | **P1-02.** `supabase/functions/_shared/staff-preflight.ts`: the caller's own `api.get_my_staff_context` must report `accessAllowed` plus the permission the database will demand, before the body is read. Refusals return the same 403 body as before. The database checks still run unchanged.                       |
| `ccb189aa` | **P1-03.** The promoter, the 7F gate and the 7E-A workflow need `pitr_enabled` to be exactly `true`. `false` fails as disabled; missing, null, non-boolean or a malformed response fails as unverified. The promoter also records the earliest and latest restore points. Docs aligned.                                |
| `d7ec532d` | **Lint scope.** ESLint now follows `.gitignore` (`@eslint/compat` `includeIgnoreFile`), and `.cache/` is ignored. Section 8.                                                                                                                                                                                           |

Not changed: Manager Card, XP/OVR, CAP/SEL/TRF/CON, Fantasy scoring,
achievements, any route, any API contract, any migration.

### Behaviour changes the owner must know about

1. **Scheduler secret must exist before deploy.** Set `BOTOLAGO_SCHEDULER_TOKEN`
   (Edge Functions → Secrets) to the Vault value first. A function deployed
   without it answers 503 to its job. Nothing is lost: work is only claimed
   after the token is accepted. Steps are in
   `docs/backend/EMAIL_NOTIFICATIONS.md` → "Scheduler token". When rotating,
   change both copies together.
2. **Migration promotion is blocked until PITR is on.** Once merged, the
   promoter refuses every batch while production reports PITR off. That is
   the invariant asked for, and it costs money (PITR is a paid Supabase
   add-on). If the owner decides otherwise, that is a policy reversal to make
   explicitly, not a guard to loosen.

## 6. Tests added

| Test                                                                     | What it proves                                                                                                                                                                                                             | Fails on `main`?               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `_shared/scheduler-token.test.ts` (50 cases)                             | Each of the 6 handlers, with a trap client that records **any** property access, is refused (no/empty/malformed/upper-case/wrong/too-long token → 401; no or bad secret → 503) with the client untouched. Plus unit tests. | **18 fail** (6 handlers × 3)   |
| `news-editorial-write.test.ts` "authorize before reading the body" (5)   | Non-staff, wrong permission, no aal2, unreadable context → 403; `request.bodyUsed` false; sanitizer not run; service secret not read; no write RPC. An editor still gets 201.                                              | **4 fail**                     |
| `player-photo-upload.test.ts` refusals (3)                               | Same, with `bodyUsed` false and no upload                                                                                                                                                                                  | **3 fail**                     |
| Promoter `test_recovery_readiness_refuses_disabled_or_unverifiable_pitr` | disabled, missing, null, string, number, wrong shape, no completed backup → refused; `true` passes and reports restore points                                                                                              | **8 subcases fail/error**      |
| 7F `RecoveryReadinessTests` (2)                                          | disabled, missing, null, string, wrong shape, no WAL-G → refused; `true` → `ENABLED`                                                                                                                                       | **5 subcases fail/error**      |
| 7E-A workflow gate                                                       | jq run on true / false / {} / null / "true" / [] / null-body: only `true` → ENABLED                                                                                                                                        | n/a (main printed PASS always) |

"Fails on main" was measured by copying the new tests into a worktree of
`origin/main` and running them there.

Existing tests changed: the scheduler tests that asserted the verify RPC
**was** called now assert **no** database call. The promoter stubs now report
PITR on. Test fakes gained the scheduler secret and a default staff context.

## 7. Regression results

Run on this branch with the repository's pinned Bun 1.3.14, in the order CI
runs them (logs kept in the session scratchpad). Python ran under 3.13 with
CI's pinned requirements (CI uses 3.12). The browser suites used this
sandbox's Chromium build 1194; CI installs 1228.

| Suite                                        | Phase 3                           | `main` today (measured here) | This branch                               | Result         |
| -------------------------------------------- | --------------------------------- | ---------------------------- | ----------------------------------------- | -------------- |
| Config integrity, migrations, secrets checks | —                                 | —                            | pass                                      | PASS           |
| `bun install --frozen-lockfile`              | —                                 | —                            | pass (Bun 1.3.14)                         | PASS           |
| TypeScript typecheck                         | PASS                              | —                            | pass                                      | PASS           |
| Bun tests                                    | 5,993 pass, 17 skip               | 6,183 pass, 17 skip, 0 fail  | **6,241 pass, 17 skip, 0 fail** (+58 new) | PASS           |
| Backend tests (`src/backend`)                | 997 pass                          | 997 pass                     | 997 pass, 0 fail                          | PASS           |
| Python operations tests                      | 222 pass                          | —                            | **225 pass** (+3 new)                     | PASS           |
| Application lint                             | 0 errors, 31 warnings             | 0 errors, 31 warnings        | 0 errors, 31 warnings                     | PASS           |
| CI lint (`bun run lint`)                     | 2,168 errors (local working copy) | 0 errors                     | 0 errors; see section 8                   | PASS           |
| Production build                             | PASS, warnings                    | —                            | pass                                      | PASS           |
| Time-zone parity                             | —                                 | —                            | pass                                      | PASS           |
| Browser checks (dev server)                  | 105 pass, 1 skip                  | BROWSER_MAIN                 | BROWSER_BRANCH                            | BROWSER_RESULT |
| Pépites browser                              | 26 pass                           | —                            | PEPITES_BRANCH                            | PEPITES_RESULT |
| Built-bundle smoke                           | 3 pass                            | —                            | SMOKE_BRANCH                              | SMOKE_RESULT   |
| Database / pgTAP                             | UNVERIFIED                        | PASS in CI (section 9)       | not runnable here; PR CI                  | PASS (`main`)  |
| 500 concurrent users                         | UNVERIFIED                        | —                            | not run                                   | UNVERIFIED     |

The skips are tests that need an external database or service and skip
themselves when it is absent (they are not counted as passes). One of them,
`scripts/backend/football-live-refresh-e2e.test.ts`, was updated for the new
scheduler secret (`b6286edb`) and could not be run here.

## 8. CI/lint result

**Cause.** `eslint .` never read `.gitignore`, so anything a tool leaves in the
working copy is linted as owned source: `playwright-report/`, `test-results/`,
the generated `/android` and `/ios` projects (they embed the built bundle),
and a Chromium download under `.cache/`. CI lints a fresh checkout _before_
installing Chromium, which goes to the runner's home, so **CI lint was never
red**. Recent `main` runs passed lint. The 2,168 errors came from a local
working copy. "Godaudits" could not be identified from the repository; if it
is a folder a tool creates, add it to `.gitignore` and it is covered.

| Measurement                                                                                                                  | Before (main config)               | After                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| Working copy with one bundled JS and one `.ts` in each of `playwright-report`, `test-results`, `android`, `.cache`           | 1,382 files, **2,832 errors**      | 1,374 files, **0 errors** (exactly those 8 files dropped) |
| Clean tree                                                                                                                   | 1,374 files, 0 errors, 31 warnings | **same 1,374 files**, 0 errors, 31 warnings               |
| New uncommitted `src/` file importing `server-only` with `any`, plus a `supabase/functions` file with `any` and no semicolon | —                                  | 4 errors, `bun run lint` exits **1**                      |

No owned folder was excluded: the linted file list is byte-identical on a
clean tree. `@eslint/compat@2.1.1` was added with the pinned Bun 1.3.14. The
lockfile gains only that package and `@eslint/core@1.2.1` (a first try with
Bun 1.4.2 also bumped esbuild and was thrown away). `bun install
--frozen-lockfile` passes.

## 9. Database / pgTAP evidence

- **This environment:** Docker is unavailable, so pgTAP was **not run here**.
- **CI on `main`'s exact tree:** Backend quality run
  [37596944962](https://github.com/mrdata007/botolago-foundation/actions/runs/37596944962),
  job `database-quality`, commit `9f89c6c` (tree identical to `main`
  `3f9c57f`): `supabase db reset` OK; `backend:db:test` **Files=129,
  Tests=4342, Result: PASS**; Pépites concurrency and weekly e-mail end to end
  9/9; `db lint` passes (warnings only); generated types current.
- **This branch** changes no SQL or migration. Its own `database-quality` run
  on the draft PR is the authority for the branch.

Status: **PASS for `main`** (CI evidence). For the branch: **PASS once the
draft PR's `database-quality` job is green**.

## 10. Recovery RPO/RTO evidence

What exists:

- 2026-09-18: organization upgraded Free → Pro; 7 completed daily backups
  visible; Management API reported **`pitrEnabled false`**
  (`docs/engineering/LAUNCH_LEDGER.yaml`, run 35375519576). Later promotions
  only re-confirm "Pro plan, 7 completed backups". PITR is never shown on.
- No restore drill, rehearsal or timed restore exists anywhere in the
  repository. The runbook item "tested restore or documented restore
  rehearsal date" (`PRODUCTION_V2_ADMIN_ACTIVATION_RUNBOOK.md`) was never
  completed.

Configuration vs. demonstrated recovery: daily backups are **configured**,
which gives an RPO of up to ~24 h. That does not meet ≤ 5 min. PITR would
configure ~2 min WAL granularity, but **configuration is not demonstration**.

- **P1-04 RPO ≤ 5 min: UNVERIFIED.** Missing: PITR enabled (Management API
  `pitr_enabled: true`, with `physical_backup_data` restore points), plus one
  restore to a known timestamp showing data loss ≤ 5 min.
- **P1-05 RTO ≤ 1 h: UNVERIFIED.** Missing: one timed restore, from start
  until the app reads correct data, ≤ 60 min.

Safe rehearsal (needs owner authorisation, dashboard access and cost; **never
restore into production**):

1. Enable PITR on BotolaGO Production V2 (Settings → Add-ons; it may need a
   larger compute size).
2. Write a marker row in a non-business table, note its UTC time T.
3. Supabase → Database → Backups → Point in time → **Restore to a new
   project** at T + 1 min. Start a stopwatch.
4. On the new project, read the marker and a row count on each core table
   (fixtures, fantasy teams, rankings). Point a local build at it and load
   Home, a match and a Fantasy team.
5. RPO = T(restore point) − T(newest data present). RTO = time from step 3
   to step 4 passing. Record both, with screenshots, in this folder.
6. Delete the restored project.

Do not use an in-place restore of production for this.

## 11. Capacity evidence

**UNVERIFIED (500 concurrent users).** Nothing was load-tested from this
session. Production must not be load-tested, staging writes need the
one-writer check and owner authorization, and a local synthetic test would
not represent the real servers.

Existing evidence: `docs/backend/FANTASY_CAPACITY_REPORT.md`. The only
finished measurement (July, smaller staging compute) began failing at about
65 actions/s. Later 2,500-user runs failed during setup, so nothing was
measured. A complete owner-run harness exists in `docs/operations/LOAD_TEST.md`
(staging at production's size, 5 AWS runners, cleanup).

Acceptance thresholds, fixed before any run (taken from the harness, plus the
browsing side it does not cover):

| Metric                                                                    | Pass                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Concurrent users                                                          | 500 signed-in plus anonymous mix, 10 min steady plus a burst         |
| Reads (public pages, match data, rankings, Fantasy team, signed-in reads) | p95 ≤ 0.5 s, p99 ≤ 1.5 s                                             |
| Saves (lineup, transfer)                                                  | p95 ≤ 1.5 s, p99 ≤ 3 s                                               |
| Unexpected errors                                                         | < 0.5 % of requests; 0 timeouts > 10 s                               |
| Database                                                                  | CPU < 80 %, connections < 80 % of pool, no deadlock                  |
| Data integrity                                                            | no double transfer, no lost update, no negative bank, every squad 15 |

Gaps to cover: match-day browsing (public pages, live scores, news, rankings)
is not in the Fantasy harness. Extend it with a read mix, or add a k6 read
scenario against staging behind the same one-writer guard.

## 12. Remaining launch blockers

1. **P1-04 / P1-05 UNVERIFIED.** PITR is off and no restore has ever been timed.
2. **Capacity UNVERIFIED** at 500 concurrent users.
3. **Branch fixes are not in production.** P1-01 and P1-02 need review,
   merge and Edge Function deploys (P1-01 after the secret is set).
4. PITR off **blocks migration promotion** once this branch merges (by design).

## 13. Exact next actions

1. Review the draft PR; check its CI (`application-quality`,
   `database-quality`) is green.
2. Owner: decide on and enable PITR (add-on cost), then run the restore
   rehearsal in section 10 and record RPO/RTO.
3. Owner: copy the Vault scheduler token into the Edge Function secret
   `BOTOLAGO_SCHEDULER_TOKEN`.
4. After merge: deploy `account-deletion-worker`, `ai-content-generate`,
   `football-live-refresh`, `notification-email-dispatch`,
   `notification-push-dispatch`, `ops-alert-email`, `news-editorial-write`,
   `player-photo-upload`. Then check `select app_private.ops_alert_test();`
   and the next ticks' `net._http_response` (200, not 401/503), and do one
   editor save and one photo upload as staff.
5. Owner: run the load test per `docs/operations/LOAD_TEST.md` with the
   thresholds above, plus a browsing read mix.
6. Push Codex's local `.readiness-audit/` reports and `ccf5feb` if they still
   exist, so the history is complete.

## Verdict

**FIX THEN SHIP.** The three confirmed code findings are fixed and tested on
the branch, but not deployed. Recovery (RPO/RTO) and capacity remain
UNVERIFIED, and PITR is off. That is not enough evidence for SHIP, and
nothing found justifies BLOCK.
