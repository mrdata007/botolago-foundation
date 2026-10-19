# SofaScore unattended pipeline verification — 19 October 2026

The collector and scorer have been demonstrated together in an isolated
database. Upstream replies in that integration test are **synthetic**. Fresh
authenticated SofaScore access is a separate, successful read-only capture;
neither result claims that this branch is deployed or enabled in production.

## Evidence categories

| Evidence                                                                                                           | What was measured                                                                                                                                                                | Limits                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Fresh authenticated capture](2026-10-18-sofascore-live-collection.md)                                             | Current season 102220, both historical controls and a discovered complete recent round; 307 actual ratings, 42 requests, quota snapshot 7,957/10,000 at 2026-10-18T20:17:51.699Z | Read-only diagnostic; six unavailable/uncertain ratings; no deployed-worker or scoring claim                                                                                                                        |
| [Scheduled integration run 39235753739](https://github.com/mrdata007/botolago-foundation/actions/runs/39235753739) | Actual PostgreSQL, pg_cron/pg_net, scheduler authentication, real handlers, reviewed-ID recording, staged state, scorer, leases and monitoring                                   | Synthetic provider; scheduled fixture became finished through the existing hourly discovery path; full database-quality gate passed, including pgTAP; application browser suites still running at this audit update |
| Historical fixtures and HTTP/RPC unit tests                                                                        | Parser regressions, limited coverage, access failures, retries and validation                                                                                                    | Replays/mocks; never live retrieval evidence                                                                                                                                                                        |

## Scheduled collection and scoring proof

At code `290afcd9399f712aee45500fc0389a6941edbe3c`, the scheduled integration
step passed from `2026-10-19T10:17:47.322Z` to `10:18:23.305Z`:

- Empty database baseline: zero fixtures, 27 schedules inspected, zero running
  scheduled writers. The harness paused unrelated schedules and owned this
  disposable database exclusively.
- Provider-free authenticated dry run: no queue rows, requests or reservations.
- The existing hourly scheduler fetched both calendar endpoints, discovered the finished state of an approved scheduled fixture and ingested it before player collection. No event was manually selected.
- Automatic due-fixture selection and four synthetic endpoint requests created
  an approved-ID observation with 22 missing ratings. The existing scheduled
  scorer returned `fantasy_ratings_pending` and wrote no team result for that input.
- Simulated next due time, followed by actual cron dispatch, collected synthetic
  ratings of 7.2. The existing worker persisted **84 provisional points** with
  calculation version **6**, using existing rounding, captain and substitution rules.
- Another unchanged scheduled pull retained exactly **two accepted observations**;
  an actual subsequent scorer pass retained the same calculation version.
- A rejected recorder request did not replace the accepted digest or missing-rating count. An abandoned
  run recovered while a competing scorer held the shared lease, then collection
  resumed through cron after that lease was released.
- **18 synthetic provider requests**: two discovery requests and 16 collection requests. Every collection request was reserved before sending. Seven season/collection scheduler ticks, five scorer ticks and eight handler runs executed.
- Monitoring retained last success `2026-10-19T10:18:23.183091+00:00`, reservations
  16/1,600 and no last error. Its `warn` state/pending fixture reflects the preserved
  three-day staged final pull. The reported 5,000 remaining quota is **synthetic**.

The [durable JSON report](2026-10-19-sofascore-automation.summary.json) preserves
these measurements. This full database-quality job also passed SQL lint and the generated
schema-type check. An earlier collection/scoring proof passed before the calendar
extension, but its job failed afterward on generated type drift. CI's authoritative
artifact supplied the five new RPC definitions, which were imported exactly.

The test advances retry due times and uses five-second local cron intervals.
It does not claim to have waited six hours or three days. Production cadence,
scoring deadlines and rules are unchanged. The scorer starts after the first
appearance observation in this test: its existing empty incremental placeholder
before any appearance evidence is a separate state from an observed missing rating.

## Validation and remaining prerequisites

The final full local Bun run passed **10,681 tests**, with **23 skipped** and zero
failures across 780 files. One earlier run hit an existing real-time timeout-test
race; that unchanged 52-test file passed alone and the full rerun passed. The
updated collector/handler tests passed 29/29, and workflow/release regressions
passed 96/96. Repository and strict collector/E2E typechecks, changed-code lint,
migration filename checks and tracked-secret scans passed.

The full database-quality job in run 39235753739 passed **6,704 pgTAP checks
across 182 files**, the scheduled integration, the other database integration
checks, SQL lint and generated database type verification. The application job
passed unit tests, lint, typecheck and builds; its browser suites were still
running at this audit update. Focused diagnostic runs explicitly skip application
and pgTAP suites. Setup failures were not counted as successful automation evidence.

Local Docker bootstrap failed twice while extracting the Supabase Postgres image
with `no space left on device`; both attempts were stopped before a database was
created. The passing database evidence comes from GitHub's disposable runner,
not those local attempts. No shared staging or production database was written.

Normal operation requires no manual event selection, script invocation or file
import after an approved deployment and one-time activation. The new collection
setting ships disabled. Production rollout still requires separate approval,
matching migration/function deployment, current approved mappings, working
scheduler bindings and quota review. Unknown identities and unavailable upstream
ratings remain explicit holds. No production activation, deployment, merge or
scoring-rule change was performed.

See [the exact cadence, quotas, run commands and activation prerequisites](../backend/SOFASCORE_AUTOMATION.md).
