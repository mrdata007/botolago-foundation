# Production go-live pack — 19 October 2026

**Decision: NO-GO pending the evidence below. No production operation is authorised by this pack.**
Owner constraint: **$0 extra spending**. No AWS instances, compute resize or disk expansion was started.
The owner explicitly handed this staging task to Codex, superseding the older Claude-only window.

## Execution brief and evidence standard

> Bring Staging V2 to the repository through plan → rolled-back rehearsal → apply.
> Establish one operator-owned writer window, preserve existing accounts and results,
> and distinguish migration history from executable function parity. Run the existing
> launch-sized workload only within the $0 constraint. Measure real scoring, worker
> failure/recovery and reminder delivery with independently checkable outcomes.
> Preserve failed attempts and precise version/compute information. Prepare production
> operations for review, retaining separate authorisation for each production step.

Primary evidence is the actual GitHub job output, live PostgreSQL catalogs/counts,
Edge inventory/secret-name metadata and the published release header. A written
runbook, a seeded total or a green planning action does not prove acceptance.

## Version and environment manifest

| Component            | Observed version / state                                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 517 integration   | Merged as `b545e386e3a43f70e514de365ddad8cafb795f72`; tested tree `3679dfd386d12bc327238e65040556e3d2a3b3de`                                                                                                                  |
| Staging operations   | [PR 526](https://github.com/mrdata007/botolago-foundation/pull/526) merged as `6139dddd91763f8fbed5565f262f06c5b1295594`; both quality jobs passed on `16a0f015` (run 39238225691). Original scoring run pinned to `cb31e56d` |
| Staging database     | `srdrflfrfpwixsllveid`, PostgreSQL 17.6, Micro (`max_connections=60`); 274 history rows after the rating-publication and fixture-guard rehearsals/applications; plan 39231620643 reports zero pending migrations              |
| Staging Edge runtime | All 15 repository functions refreshed by run 39230680918, source `9bdaf4ca30dd1f3ca281685c27ddb1647a4c2e0a`; scheduler and Resend credentials present                                                                         |
| Production database  | `tkewgajrljbwgwedqsxn`; read-only inspection only in this task. Re-read its private history, definitions and flags before each proposed production operation; historical snapshots are not current authority                  |
| Production website   | Public recheck at 2026-10-19 09:52 UTC: HTTP 200, release header and HTML meta both `19cfafb24171f300a5b85ebd2f5d66d4dfbc4eb2`. This operator did not publish it                                                              |
| Compute parity       | Both projects report 60 maximum connections / Micro; neither was resized                                                                                                                                                      |

Main and the website advanced through another release during this staging window.
The tested source is pinned above; rerun the plan and compare backend files against
the final selected release SHA before production. Do not present a mixed manifest
as proof that all four deployment components run one commit.
At the earlier snapshot the unknown release identifier required a hosting fix:
set `VITE_RELEASE_SHA` to the selected source SHA before the authorised publish,
then verify both its response header and HTML meta value. At 09:52 UTC a public
HTTP recheck returned release `19cfafb24171f300a5b85ebd2f5d66d4dfbc4eb2`; this
operator did not publish it. Its HTML meta value matches the header. The checkout's `src`, `public` and
`supabase/functions` trees are byte-identical to that release. The migration and
operational components retain the separately pinned versions in this manifest. The source's git
fallback cannot identify a build made without a Git checkout. This pack does
not authorise changing production hosting configuration or publishing.

## Staging catch-up: completed

| Operation                    | Evidence / outcome                                                                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial plan                 | [39171136417](https://github.com/mrdata007/botolago-foundation/actions/runs/39171136417): 45 pending migrations                                                                                                                         |
| Complete first rehearsal     | [39171357114](https://github.com/mrdata007/botolago-foundation/actions/runs/39171357114): all 45 applied in the rehearsal transaction; rollback verified by unchanged history and absent pilot table                                    |
| First apply                  | [39171527035](https://github.com/mrdata007/botolago-foundation/actions/runs/39171527035): all 45 committed; users 50,008 and teams 50,005 unchanged; pilot OFF at 1,000                                                                 |
| Stale deferral corrected     | Direct production history showed `20260925090500_fantasy_league_page_skip_empty.sql` already applied. Removed its obsolete planner exclusion; no applied migration edited                                                               |
| Additional rehearsal / apply | [39172016378](https://github.com/mrdata007/botolago-foundation/actions/runs/39172016378) / [39172184216](https://github.com/mrdata007/botolago-foundation/actions/runs/39172184216): that one missing migration rehearsed, then applied |
| Final plan                   | [39172283038](https://github.com/mrdata007/botolago-foundation/actions/runs/39172283038): `pending: []`, `deferred: {}`, 272 records; 13 staging-only historical names preserved                                                        |
| Edge deployment              | [39173000678](https://github.com/mrdata007/botolago-foundation/actions/runs/39173000678): 15 active functions, authentication modes recorded, staging base URL configured with email/live refresh OFF                                   |

The first runtime attempts failed during the private Vault read. The fix uses the
owner connection for that SELECT: the Management API's read-only role cannot
decrypt Vault. No secret value was emitted into logs or committed files.

### Additional main catch-up and input guard

Main gained rating-publication migration `20261018215311`. Plan 39229440723,
rollback rehearsal 39229895200 and apply 39230031406 passed. The full team,
result and gameweek fingerprints remained unchanged; no rating publication was
created. PR 529 then merged as `5f8f1957e40bf9ece47d9f36e6bed1d21383bb16` after
combined-head CI passed 185 database files / 6,879 assertions and four lock races
with zero new deadlocks, plus the application job.

Its guard migration `20261019073221` passed plan 39231087005, rollback rehearsal
39231203682 and apply 39231376873. A further real-staging rollback test passed
31 assertions: refused corrections preserve the complete input digest and sealed
snapshot, metadata remains writable, and imports retry after finalization. All
three triggers are enabled. Existing fingerprints were unchanged and the test
world was absent after rollback. Migration history is now 274 rows. All 27 cron
flags and Rivals were restored; tick/worker/email/push remain OFF and no lease is
held. No production migration was run by this operator.

Runtime refresh 39230292042 stopped before the first function deployed; its
cause is unverified. The subsequent instrumented run 39230680918 refreshed all
15 functions successfully and verified the Resend key by name only. A clearly
labelled staging alert returned HTTP 200 / sent and the owner confirmed inbox
receipt. Its temporary recipient was removed and alerts remain OFF. This proves
the staging sender/key delivery path, not reminder windows or worker alarms.

### Executable parity, beyond migration names

Compared 928 production `api` / `app_private` functions against staging: none
missing. Initially 12 bodies differed: four expected pilot/deadline changes,
six comment/format differences, and two substantive historical differences.

- Staging's inherited incremental-document validator rejects malformed or
  absent arrays more strictly than production. Preserve this fail-closed check;
  it is a known environment difference, not full function equivalence.
- Staging's reconciled-observation recorder lacked the repository's concurrent
  link recheck and rollback of links on a no-op replay. The unchanged source in
  migration `20261003180000` has body MD5 `c2906a3ca3643c73d30f0b7d15dfde4a`,
  exactly matching production. A staging-only guarded restoration was rehearsed and applied from
  `scripts/backend/staging-reconciled-drift-repair.sql`; completion evidence is
  recorded below. Never replay the entire historical migration or weaken a pin.

## Acceptance ledger

| Gate                    | Current disposition                                                                                                                                            | What objectively closes it                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch-sized load       | FAIL in measured runs 39216960815 and 39222141596; no launch-sized capacity pass                                                                               | 1,000 independent sessions on five origins; 175 RPS for 10 s, then 65 for 50 s; 600 s at 65; existing latency/error/metrics/integrity/cleanup criteria all met                                                         |
| 5,000-team scoring      | PASS for the scoped operator-run drill; [validation 39174387599](https://github.com/mrdata007/botolago-foundation/actions/runs/39174387599)                    | 5,000 final rows × 96 = 480,000; both overall rank scopes complete; 5,000 single rollover records and next lineups; zero duplicate results                                                                             |
| Worker stall / recovery | PASS for settled failure/recovery; [39174524941](https://github.com/mrdata007/botolago-foundation/actions/runs/39174524941)                                    | Real held row caused a recorded 8.555 s database failure; lease exclusion held; the next invocation after release returned ok without score repair. This is narrower than the ambiguous-write drill                    |
| Ambiguous 30 s write    | NOT PROVEN by an 8 s settled database failure                                                                                                                  | A genuine unconfirmed write at the 30 s client boundary; lease retained/extended, no later write overlaps, expiry/recovery observed. Do not raise the database timeout just to manufacture it                          |
| Silent-worker alarms    | Real-clock drill 39234050429 PASS for detection, accepted failure/recovery emails and restoration; owner inbox confirmation pending                            | Real pending work; `not_configured`; warn at 30 min, fail at 90 min, received alert and recovery message; no backdated timestamps                                                                                      |
| Two-account reminders   | Key/sender delivery smoke PASS; two-account timing/preferences/deduplication still NOT RUN; sending restored OFF                                               | Follow `docs/engineering/REMINDER_DELIVERY_EVIDENCE.md`: allowlist both accounts, genuine scheduling windows/finalization, one event/notification/delivery, received email and matching points/time, opt-out negatives |
| Morocco time            | Helper checks PASS                                                                                                                                             | Observed `2026-10-15 12:00 UTC` → `12:00`; deadline helper → `12/10 18:30`. Received email/UI agreement still awaits reminder test                                                                                     |
| Real iPhone / push      | Owner reports iPhone 17 Pro / iOS 27 and Mac; local HTTPS French/Arabic login rendering passed, actual device session pending. Vercel previews return HTTP 402 | Owner's actual device session, French/Arabic evidence and real delivery where supported                                                                                                                                |
| Arabic skim             | Owner review outstanding                                                                                                                                       | Complete the remaining agreed wording review; no approval inferred here                                                                                                                                                |
| Production health       | Historical watchdog failed `fantasy_fixture_coverage`; subsequent production reads are retained privately                                                      | Recheck the current named failure, identify affected fixtures and resolve or record an explicit release decision; this PR does not fix provider data                                                                   |

The existing audited runner orchestration rents five AWS machines and estimates
$18.75 with a $50 guard. It cannot be dispatched under a $0 authorisation.
The public repository now has a five-runner route on standard GitHub-hosted
runners. Run 39216960815 established 1,000 independently authenticated users,
five distinct public origins, synchronized traffic and 15 successful metrics
scrapes spanning the measured workload. It sent 5,000 gate requests and 39,000
soak requests. No AWS resources or paid infrastructure were started.

The gate **failed**: read p95 11,253 ms, mutation p95 11,152 ms, mutation p99
14,449 ms, and 34 timeouts (0.68%). Independent staging gateway logs show the
same slowdown. The soak also failed with 5,616 `invalid_transfer` rejections:
the harness reset transfer ownership between profiles despite the canonical
lineup retaining the acquired player. Commit `7729f9ba` restores that state
from the lineup and adds a regression check. Because those rejected writes
reduced successful work, the soak's faster latencies cannot establish capacity.
The rerun preserved the traffic profile, thresholds and database configuration.

Run 39222141596 also **failed**. Its 5,000-request gate had 3,903 unexpected
errors (78.06%), including 3,893 timeouts; measured p95 reached the client's
roughly 16-second timeout boundary. One shard could not prepare for the soak;
four completed 31,200 requests, which cannot establish the five-origin 65 RPS
soak. The collector rejected three failed scrapes, and the final verdict lacked
its required metrics summary. Preserve these control failures alongside the raw
measurements instead of substituting an incomplete aggregate.

The host rebooted at approximately 08:44:58 UTC during that run. PostgreSQL's
actual startup time is 08:45:12 UTC. Advancing CPU counters reached 97.161%;
available memory fell to about 124 MiB, with substantial swap activity before
the restart. Responses included Cloudflare 520, 521 and 525 errors. The restart's
cause is unverified; a zero OOM counter before the gap does not prove an OOM or
exclude a later one. No operator resize or restart was requested. Cleanup still
removed all 1,000 users and their state, restored the saved fingerprints and
schedules, and passed independent final counts.

Raw exporter reanalysis handles duplicate cached CPU counters and measures the
Data API's PostgREST pool instead of the unused PgBouncer admin pool. CPU peaked
at 38.178% across advancing intervals; database connections peaked at 26/60.
The conservative PostgREST occupancy bound reached 105%, but cached and
independently collected series limit precise attribution. Burst SQL samples
show idle-in-transaction connections without lock waits; increased swap activity
also warrants investigation. A larger connection pool is not yet justified.
All temporary users/state were removed; independent counts and saved fingerprints
confirmed baseline restoration, all 27 cron jobs and Rivals ON, with no lease.

Existing launch-sized pass criteria, unchanged: read p95 ≤500 ms; save/transfer
p95 ≤1,500 ms and p99 ≤3,000 ms; unexpected errors <0.5%; lock timeouts <0.1%;
CPU, database connections and pool utilisation <80%; complete metrics; zero
deadlocks/conflicts, data-integrity violations and leftover temporary accounts.
A launch-sized pass would still not pass the locked 2,500-user full gate.

### Scoring method and limits

The old 50,000-team seed was already consumed: GW2 was finalized but retained
precomputed provisional results. Its counts-only `seedLoaded` flag did not
establish readiness. It was neither reopened nor overwritten.

Created a separate `f9500000-...` season using 5,000 existing synthetic load
identities, 66 players, six clubs, three completed fixtures and 500 leagues
(largest 1,000 members). Every squad has 2 GK / 5 DEF / 5 MID / 3 FWD, no more
than three from one club; its locked XI is 1 / 4 / 4 / 2. All 66 provider
participants have a rating of 7.5, independently worth 8 points. Therefore:
`11 × 8 + captain bonus 8 = 96`, bench `4 × 8 = 32`, aggregate `480,000`.
No team result existed before the worker started.

The production TypeScript lifecycle calculates scores through real staging
PostgREST RPCs under its real lease. The operator-run job has a longer wall-clock
budget than Edge; this can prove scoring/finalization on Micro, not Edge's CPU
limit or completion in a 100-second Edge pass. Global prize catch-up is explicitly
refused by this scoped operator adapter to preserve existing QA seasons; prize
selection is not certified by the scoring run. Inputs are synthetic and uniform;
this is scale/consistency evidence, not provider-fetch reliability or a test of
every scoring rule.

The first scoring attempt rejected an unsupported lease-holder prefix before
changing results. The corrected holder is `manual:staging-rating-drill-5000`.
All attempts remain linked in GitHub; setup failures are not capacity failures.

### Real Edge 5,000-team result: failed progress, safe fallback

Run [39227372118](https://github.com/mrdata007/botolago-foundation/actions/runs/39227372118)
used a fresh `f951` fixture and unchanged deployed Edge limits. The first pass
scored 1,500 teams in 104 seconds; the second returned at the same 1,500 teams.
Both returned `partial / fantasy_worker_time_limit`; zero teams finalized and
zero rankings were published. The lifecycle starts its team cursor at null for
each invocation. This is a reproducible limit of the Edge path: recurring invocations repeat the
first page range instead of finishing the remaining teams. The existing worker
runbook explicitly acknowledges this cursor gap and assigns large rounds to the
GitHub fallback (5,000 RPCs / 40 minutes) after the last ok pass ages past
30 minutes. Our scoped operator run fits those allowances, but it does not prove
the actual scheduled fallback is dispatched and takes ownership in time.

The two requests returned HTTP 200, but that is not lifecycle success. Runtime
shutdown logs report `EarlyDrop`, with CPU-time values 235 and 182 and about
17.4 MB memory, rather than a CPU-limit kill. The operator fallback then used
1,315 production-core calls over 716.507 seconds, independently proving all
5,000 final scores of 96 (480,000 total), 61,900 ranking rows, 5,000 single
rollovers, 5,000 next lineups and completed postwork/progression. The workflow
correctly remains failed because the Edge passes did not progress.

Retirement archived all 5,000 new teams and completed their synthetic season.
The workflow verified the older team/result/gameweek fingerprints unchanged.
Independent postflight found 50,008 Auth users, 60,005 retained teams, 27 active
cron jobs, Rivals ON, all other application writers OFF and no held lease.
No existing fixture was reopened and no production write was performed.

## Recorded measurements and restoration by run

Machine-readable observations: [staging-results.json](evidence/2026-10-19-staging-results.json).

- The first complete lifecycle ran in **696.347 seconds** with **1,315 lifecycle calls**:
  50 snapshot pages, 50 persistence pages, 50 finalization pages, 1,002 ranking
  calls and 50 successor-preparation pages. It finalized and opened the successor.
  Its job then failed because my independent check read the unused nullable
  result-row rank column. The canonical ranking table is `app.fantasy_rankings`;
  the corrected check passed in run 39174387599. The repeat lifecycle returned
  `already_advanced` with one lifecycle call, demonstrating idempotency.
- Independent SQL: all 5,000 final scores are 96 (sum 480,000); all bench totals
  are 32; 5,000 gameweek overall ranks and 5,000 season overall ranks; 500 league
  scopes; 5,000 rollover records; 5,000 successor lineups; zero duplicate results.
  The 61,900 ranking rows cover 1,002 gameweek/season scopes; each scope has
  unique consecutive ranks from 1 to its member count and the correct points.
  All 5,000 teams have two free transfers, exactly one progression opened, and
  all 66 player totals are eight points.
- Real Edge probes: unauthenticated request 401; switch OFF returned `disabled`
  with no run row; another holder returned `lease_held`; clearing the URL
  returned `not_configured`. A real 45-second held gameweek-row lock caused
  `fantasy_worker_rpc_failed` after **8,555 ms** in the recorded pass, with no
  gameweek started; after release, a real pass recorded `ok` in **1,326 ms**.
  No timeout or clock was modified. This did not exercise the ambiguous 30-second
  branch, the 30/90-minute alarms, or recovery of 5,000 teams inside Edge.
- The Edge catch-up evaluated four existing staging gameweeks as
  `no_active_prize`; it awarded no prize. A deliberately failed/blocked prize
  and a missing lease function were covered by the 52 handler unit tests,
  not injected into this real staging run.
- The reconciliation repair's rollback left MD5 `58724fcba25353a2139619a85d8b93d0`
  intact. Its subsequent commit produced `c2906a3ca3643c73d30f0b7d15dfde4a`,
  matching the repository and production. All other function definitions,
  owners/grants and the checked table/history counts stayed unchanged.
- At 2026-10-18 23:03 UTC, all 25 original cron IDs, schedules and active flags
  matched the saved baseline. Both new jobs are active with their writer switches
  OFF. Rivals is restored ON; the Fantasy tick/worker, email, push and alerts are
  OFF; test allowlists empty; no lease held. The newly configured staging base
  URL intentionally persists.
- Historical first-drill postflight (18 October): users **50,008**. Total teams were **55,005**, comprising the original
  50,005 plus the 5,000 explicitly new archived drill teams. The drill season is
  completed and its competition/catalog entries inactive, preserving evidence
  while removing it from active default discovery. The retirement itself passed
  a rolled-back rehearsal before commit. Existing QA-team and result-row MD5s
  below still match. Notifications and deliveries were both **0** at that historical postflight. Later drill state must be read separately.

Local validation: 39 staging operational tests and 52 worker-handler tests passed;
typecheck passed. The first lint/CI application attempt found formatting errors in
the new drill script; these were corrected and the changed script's lint passed.
Final CI status is recorded in PR 526; do not substitute these focused checks for
the full CI result.

Before writes: no other staging writer workflow, active client transaction,
generating story job or worker lease. All 25 original cron jobs were paused;
the two newly installed jobs were paused too. Rivals was the only enabled
application writer and was temporarily disabled. The original settings and job
IDs/schedules were saved privately before the first write.

Pre-drill fingerprints: non-load team rows `9e17d5ca2dd396487a7c5a15161de11d`;
all existing result rows `fb327cfdc3d8bbb2c619e5fbe45b8bd7`. Both match after the
drill, excluding only the explicitly new fixture. No account/password was changed.

## Real-clock worker alarm: automated path passed

Run [39234050429](https://github.com/mrdata007/botolago-foundation/actions/runs/39234050429)
used source `526646da` and fresh isolated f953 work. Its genuine clock began at
09:59:14.705052 UTC. Warning was observed after 30.753 minutes; failure after
90.070 minutes. Warning did not page. The failure email returned HTTP 200 / sent
at 11:29:23; a real Edge worker finalized both teams at 96 points / 32 bench
points in 7,879 ms and 19 calls, with eight rankings, two rollovers and two next
lineups. Worker health returned to OK and the recovery email returned HTTP 200 / sent
at 11:29:42. Owner inbox confirmation for these two emails is still pending.

Restoration passed at 11:30:17. Independent database reads at 11:35–11:36
confirmed all 27 cron jobs active, Rivals ON, tick/worker/email/push/alerts OFF,
no held lease or other busy client, no generating story job, and the f953 season
completed. Users remain 50,008; total teams are now 60,009 including the two
retired f952 setup teams and two archived f953 teams. The old team, result and
gameweek fingerprints match the pre-run baseline exactly. This test establishes
alarm behavior for two teams; the separate 5,000-team Edge capacity result
remains failed.

## Phone and remaining reminder preparation

[PR 530](https://github.com/mrdata007/botolago-foundation/pull/530) adds the isolated
123-team P1–P6 phone world and a public-key-only HTTPS Mac launcher. CI run
39240130664 passed both jobs on `7953193c`, including 6,879 database assertions,
four lock races and actual saved-list pagination: 60 / 2 pages and 2,001 / 41,
unique ids, terminating cursors and verified rollback. The normal ancestry merge
`537236e0` has the identical Git tree. The final concurrency fix passed both quality jobs in run 39243707232 on `b47a164e`; PR 530 merged as `5773167cc51cdccc5e71b92720a9e965818b3d33`.
No hosted fixture application or owner-phone result is claimed yet.

The anonymous local HTTPS login check passed French LTR and Arabic RTL at
393 px without overflow or page errors in Chromium 149. Browser traffic outside
the local server was blocked (none attempted); strict curl certificate validation
also passed. This does not certify authenticated journeys or Safari/iOS. The
owner reports an iPhone 17 Pro on iOS 27. Its Mac server runs the pinned checkout
`537236e0`, and the owner confirmed Safari opens the login page without a
certificate warning. No authenticated device check is claimed.

GET-only Auth preflight 39238225342 found no custom SMTP, a localhost site URL,
zero redirect allowlist entries, email confirmations required and Google/Apple
providers disabled. No settings were changed. The successful Resend Edge smoke
cannot establish Auth signup/reset. The exact local HTTPS callback and verified
Auth SMTP sender still need configuring securely before those cases.

[PR 531](https://github.com/mrdata007/botolago-foundation/pull/531) prepares a
separate, protected f970 reminder/response-loss rehearsal; hosted results remain
pending. It waits for real 24-hour/match windows and natural lease expiry, verifies
both an email-off account and a later unsubscribe negative, and saves an
owner-only recovery context before pausing schedules. The GitHub integration
refused an environment-secret write (403); after the alarm writer restored staging,
the two verified owner identifiers were saved privately in staging Vault. No
account credential or email was included in a workflow input or public artifact. No extra API key,
public personal-data artifact or paid infrastructure is required.

## Production execution order — only after the gates permit it

1. Select and pin the release SHA. Review merged PR 526 and its final CI, review merged fixture guard PR 529 and its staged functional evidence, and
   complete the staging ledger. Check the current production watchdog and version manifest.
2. Recheck one-writer ownership, active workflows, cron and leases immediately
   before each production operation. Read and save the current settings rather
   than copying staging's OFF state to production.
3. For a still-pending pilot migration, with explicit go use the reviewed
   `scripts/backend/apply-20261016170000-pilot-cap.sql`: rehearsal ending in
   rollback, inspect its checks, then authorised commit. The cap must remain OFF.
   Follow `PILOT_CAP_OWNER_RUNBOOK.md`; never edit an MD5 precondition to pass.
4. For a still-pending deadline migration, with separate explicit go pause the Fantasy
   lifecycle, wait for lease release/expiry and keep at least 30 minutes clear
   of an open deadline. Rehearse then apply
   `scripts/backend/apply-20261016180000-fantasy-deadline-lock.sql`
   according to `FANTASY_DEADLINE_LOCK_OWNER_RUNBOOK.md`. Verify volatility,
   grants, history and unlocked-lineup detection; restore the prior tick flag.
5. Check any still-pending fixture-input guard and rating-publication migrations separately against actual production history. Follow `FIXTURE_INPUT_GUARD_OWNER_RUNBOOK.md` and inspect the reviewed `scripts/backend/apply-rating-publication.sql` through the release migration workflow. Each production operation needs its own go, rollback rehearsal, verified baseline and reviewed apply. Never replay an already applied operation.
6. Compare deployed Edge sources against the selected source. Deploy only approved functions that need updating,
   with reviewed JWT modes and securely configured same-project secrets. Staging
   deployment is not permission to deploy production. Verify logs and inventory.
7. If the owner chooses pilot-cap activation, with a separate go inspect active managers and QA exclusions,
   then `select app_private.pilot_configure(true,1000);`. This caps active teams
   per season, excluding hidden QA accounts; Auth sign-up remains available.
   A team cap does not prove the request-rate capacity gate or waive its failure.
8. If the selected application source needs publishing, the owner publishes the selected version in Lovable. Verify the live release
   header, French/Arabic signed-in flows and the relevant production read-only
   checks. A merge alone does not deploy the website or database.

Before proposing any production mutation, verify whether it has already been
applied by another authorised operator; inspect its recorded history, actual
function definitions and current flags rather than replaying it.

If a guarded operation refuses, stop that operation and investigate its actual
precondition. Keep sending features OFF if delivery evidence is missing. A schema
rollback requires a new reviewed forward migration; do not edit applied history.
For a bad website publish, use Lovable's prior version and verify its header.
For an unhealthy worker, record state and use its documented switch; do not start
another writer while an ambiguous write or unexpired lease remains.

This pack prepares decisions and reviewable operations. It does not silently
accept launch risk, approve production changes or certify the remaining gates.
