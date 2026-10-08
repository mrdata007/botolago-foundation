# Release preparation and infrastructure readiness — PR #379

Date: 2026-10-08. Nothing was merged, deployed, or changed in production or
staging. The production facts below come from read-only queries (metadata,
`SHOW` settings, cron job list, switch states; no secret values read).

Companion documents:

- [release-runbook.md](release-runbook.md): configuration, deploy order, smoke tests, monitoring, rollback.
- [pitr-activation-checklist.md](pitr-activation-checklist.md)
- [restore-rehearsal.md](restore-rehearsal.md)
- [capacity-test-plan.md](capacity-test-plan.md)
- [claude-handoff.md](claude-handoff.md): the P1 fixes and their evidence.

## 1. PR head and checks

| Commit                   | `application-quality`         | `database-quality`                | `Vercel` (commit status)           |
| ------------------------ | ----------------------------- | --------------------------------- | ---------------------------------- |
| `4df558a1`               | success                       | success (pgTAP 129 files / 4,342) | —                                  |
| `cf35c295` (report only) | **success** (run 37734093096) | **success**                       | **failure: "Account is blocked."** |

- `staging-functional` is skipped on PRs by design.
- The commit that carries this document gets its own CI run; the PR page shows its state.
- GitHub reports the PR as `mergeable_state: blocked`. It is a draft, and the repository's branch protection (not readable with this session's access) may also require a review or the Vercel status.
- **Owner check:** GitHub → Settings → Branches → `main`. If `Vercel` is a _required_ check, the PR cannot merge until Vercel is unblocked or removed from the list.

## 2. `BOTOLAGO_SCHEDULER_TOKEN` — dependency audit

Full diagram and commands: runbook § "Scheduler token".

| Question                                    | Finding                                                                                                                                                                                                                                                                      | Evidence                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Who sends the token?                        | One function: `app_private.invoke_scheduled_function` reads Vault `botolago_scheduler_token` and sends it as `x-botolago-scheduler-token`                                                                                                                                    | migration 20260924140100 (lines 1067–1092); every caller listed |
| Which functions are woken?                  | Exactly the six patched ones. No script, workflow or frontend sends the header.                                                                                                                                                                                              | the callers in 9 migrations                                     |
| How does each function get the secret?      | `index.ts` passes `Deno.env.toObject()` as `environment` to the handler, which checks `environment.BOTOLAGO_SCHEDULER_TOKEN`                                                                                                                                                 | all six `index.ts` files                                        |
| Does the Vault token exist in production?   | Yes, one row (value not read)                                                                                                                                                                                                                                                | read-only query 05:55 UTC                                       |
| Are all six deployed?                       | Yes, `ACTIVE`, `verify_jwt = false`                                                                                                                                                                                                                                          | Edge Function list                                              |
| Which are woken today?                      | `football-live-refresh` every minute (live refresh on); push every minute (`testers` mode); account deletion hourly when due (enabled); ops-alert when an alert fires (on). Email is `off`. `ai-content-generate` has no production cron job (its migration is not applied). | switch states and `cron.job`                                    |
| What if a function ships before the secret? | It answers `503 scheduler_token_not_configured` to every wake. Live scores stop refreshing within a minute. Nothing is claimed or lost.                                                                                                                                      | `scheduler-token.ts`; tests                                     |
| Safe order                                  | Secret → check digest → merge → deploy `football-live-refresh` first → 401 probe and 200s on `net._http_response` → the rest → publish                                                                                                                                       | runbook steps 1–4                                               |
| Rollback                                    | Fix the secret (no redeploy), or redeploy from `3f9c57f` (temporarily restores the old exposure)                                                                                                                                                                             | runbook R1, R2                                                  |

## 3. Vercel "Account is blocked"

| Evidence                                                                                                                                                                | What it shows                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vercel.json` runs `scripts/vercel/ignore-build.mjs`, which **skips every draft-PR and work-branch build** (added 2026-09-21 after the team's deployment quota ran out) | Vercel only hosts previews; the website is Lovable (`DEPLOYMENT.md`). For draft #379 a healthy account would report "Canceled by Ignored Build Step", never build. |
| 2026-10-07 05:27 (`a78a43b2`, author _Claude_), 06:00 (`13acce32`, _Claude_), 07:45 (`7254ddcc`, author _ali sarhane_): all "Canceled by Ignored Build Step", success   | On 7 October, commits by the same author identity as #379 were **accepted** by Vercel.                                                                             |
| 2026-10-08 05:46 (`cf35c295`, _Claude_): "Account is blocked.", linking to Vercel's article on account pauses                                                           | The refusal happens **before** the ignore step runs, at account level.                                                                                             |

**Classification:**

| Cause                              | Verdict                                                                                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code failure                       | **Ruled out.** The commit is a Markdown file, the build is never reached, and the repository's own checks are green.                                                                                                                |
| Author permissions                 | **Unlikely.** The same author identity passed on 7 October. The usual wording for an author block is about the commit author lacking access, not the account.                                                                       |
| Account, billing or fair-use pause | **Most likely**, starting between 2026-10-07 07:45 and 2026-10-08 05:46 UTC. Vercel's article lists spend-management pauses, plan usage limits, policy (including commercial use on Hobby), unpaid billing, and platform incidents. |

Only the Vercel dashboard can confirm which (team **botola-go**: Settings →
Billing / Usage, and the owner's inbox for a Vercel e-mail). Git authorship
was **not** changed, and must not be changed to get round this.

**Effect on release:** none on production (Lovable hosts the site). Only a
problem if `Vercel` is a required check. In that case:

- either restore the account,
- or, as a deliberate repository decision, stop Vercel posting statuses: remove its GitHub integration, or set `"git": { "deploymentEnabled": false }` in `vercel.json` if previews are no longer wanted. **Not done here.**

## 4–6. PITR, restore rehearsal, capacity

- **PITR** ([checklist](pitr-activation-checklist.md)): production is on **Micro** compute today, and PITR needs **Small** or larger. Minimum added cost is about **$105 a month**: PITR with a 7-day window (~$100, outside the Spend Cap) plus Small compute (+~$5). One short restart. Verification uses the read-only API, the dashboard, and the 7E-A preflight going PASS. Rollback: disable the add-on (the recovery window is lost), then downsize compute.
- **Restore rehearsal** ([plan](restore-rehearsal.md)): **Restore to a New Project** at a point in time T. Never an in-place restore.
  - A restored copy starts its cron jobs at once and would wake **production's** functions. Control: pause four production switches for about 5 minutes around T (saved and restored exactly), then quarantine the copy first thing.
  - Costs a few dollars. Pass marks were fixed in advance: RPO ≤ 5 min (3 samples plus a data fingerprint), database RTO ≤ 45 min, service RTO ≤ 60 min.
- **Capacity** ([plan](capacity-test-plan.md)): the deadline kit (2,500 accounts) is on `main`. The browsing kit that maps to "500 people reading" is only in **open PR #240**. Test on staging at **Small**, then Medium or Large only if needed: about **$2–3 one-off per size tested, plus $1.50 a month** for the 20 GB staging disk, which cannot shrink afterwards.

## 7. Correction to the earlier handoff

The handoff and the PR said that once merged, "the migration promoter refuses
every batch until PITR is enabled". That is true of the promoter and the
7E-A/7F gates. But production migrations have gone through **guarded SQL
scripts** (`scripts/backend/apply-*.sql`) run in the SQL editor since late
September, and those neither check PITR nor get blocked.

So merging does **not** block the current migration path. It also means that
path has **no automatic PITR check**: a recorded gap (runbook § "Residual
gap"), mitigated by a manual checklist line until a read-only preflight is
added to it.

## 8. Readiness levels

| Level                        | State                                                                                                                                                    | What decides it                                                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code readiness**           | **READY on branch.** P1-01, P1-02 and P1-03 fixed and tested; CI green (application and database); 38 failing-on-`main` regression cases; review pending | Review and merge of #379                                                                                                                                                           |
| **Infrastructure readiness** | **NOT READY**                                                                                                                                            | Secret set and verified; 8 functions deployed and smoke-tested; PITR on (Small compute or larger); Vercel resolved, or confirmed not required                                      |
| **Broad-launch readiness**   | **NOT READY**                                                                                                                                            | Infrastructure ready **plus** P1-04/P1-05 measured PASS in the rehearsal **plus** a 500-user PASS (deadline and browsing) at the launch compute size, with production on that size |

Verdict: **FIX THEN SHIP**, unchanged.

## 9. Owner actions, in dependency order

✅ means no paid infrastructure change; 💳 means paid.

| #   | Action                                                                                                                          | Needs                           | Cost                                                     | Doc        |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------- | ---------- |
| 1   | Review PR #379                                                                                                                  | —                               | ✅ free                                                  | PR         |
| 2   | Vercel dashboard: find why the account is blocked; check whether `Vercel` is a required check on `main`                         | —                               | ✅ free to look. A plan upgrade to clear it would be 💳. | §3         |
| 3   | Set the Edge Function secret `BOTOLAGO_SCHEDULER_TOKEN` from Vault, and check its digest                                        | —                               | ✅ free                                                  | runbook 1  |
| 4   | Merge #379                                                                                                                      | 1 (and 2 if Vercel is required) | ✅ free                                                  | runbook 2  |
| 5   | Deploy the 8 Edge Functions in the given order, with the 401 probe and 200 check after each scheduled one, and the staff checks | 3, 4                            | ✅ free                                                  | runbook 3  |
| 6   | Publish the website in Lovable                                                                                                  | 4                               | ✅ free                                                  | runbook 4  |
| 7   | 24 h monitoring                                                                                                                 | 5                               | ✅ free                                                  | runbook 5  |
| 8   | Staging catch-up (`plan`, `rehearse`, `apply`) and the AWS role check                                                           | —                               | ✅ free (staging writes)                                 | capacity 1 |
| 9   | Capacity test at **Small** (deadline + browsing at 500); decide on #240 first                                                   | 8                               | 💳 ~$2–3 plus $1.50/month disk                           | capacity   |
| 10  | Pick production's launch compute: the first size that passed 9, Small at minimum                                                | 9                               | 💳 Small +~$5/month (more if Medium or Large)            | PITR B.1   |
| 11  | Enable PITR (7 days) and verify it, including the 7E-A preflight PASS                                                           | 4, 10                           | 💳 ~$100/month                                           | PITR B–C   |
| 12  | Restore rehearsal: measure RPO and RTO; delete the copy                                                                         | 11                              | 💳 a few dollars                                         | rehearsal  |
| 13  | Record the results; update P1-04, P1-05 and capacity to PASS or FAIL; re-assess the verdict                                     | 9, 12                           | ✅ free                                                  | handoff    |

- **Free, possible today:** 1–8 and 13. Steps 3–7 complete code and deployment readiness for the three fixed findings.
- **Paid:** 9–12. Do 9 before 10 so production resizes and restarts only once.
