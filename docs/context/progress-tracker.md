# BotolaGO progress tracker

## How to use this file

This is a dated orientation index, not a substitute for Git, pull requests,
checks, deployments, or protected runtime evidence. Update it after a meaningful
cross-project state change. Keep feature-level details in the corresponding
docs/specs file to reduce conflicts across concurrent branches.

## Observed baseline

- Observed at: 2026-08-09, Africa/Casablanca
- Default branch: main
- Main SHA: ea0e98911c2e4d1ce1e93f716dd7183e31d32276
- Main milestone: PR #120 merged — core Fantasy navigation, gameweek context,
  guest gates, actor-scoped caches, and safe auth return flow
- Current launch candidate: draft PR #123
- Launch branch: agent/launch-readiness-milestones
- Launch-candidate SHA:
  1d87fb2cb7c38e1fd3576412092bf9ca47e0fb69
- Production activation from PR #123: not performed

## Current phase

Launch-candidate hardening and evidence reconciliation. The isolated demo can be
certified independently, but live launch remains blocked by data, migration,
capacity, and release prerequisites.

## Current goal

Adopt the six-file context/spec workflow on top of the active launch candidate,
complete review of PR #123, certify the branch-scoped mock demo, and resolve the
remaining live-launch gates without weakening Production V2 safeguards.

## Delivery status matrix

| Area                                                | Implemented                         | CI verified                       | Merged to main             | Evidence or note                                                                   |
| --------------------------------------------------- | ----------------------------------- | --------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| PR #120 core Fantasy UX                             | Yes                                 | Yes                               | Yes                        | Main merge ea0e989; recorded quality evidence                                      |
| PR #123 launch candidate                            | Yes on draft branch                 | Yes                               | No                         | Backend quality run 31252766070; protected core-creation/isolation run 31253017824 |
| Isolated mock demo                                  | Yes on PR #123                      | Compiled and browser-tested in CI | No                         | docs/qa/MOCK_DEMO_RELEASE.md                                                       |
| Atlas first-time team creation                      | Yes on PR #123                      | Yes                               | No                         | Phase 6.5 run 31253017824                                                          |
| Pick Team, transfers, points, rankings, and leagues | Yes where described on PR #123      | Yes in the reported CI matrix     | No                         | Browser CI and PR evidence; full protected staging coverage remains                |
| Current-season provider readiness                   | Gate exists; PR #123 revises it     | Probe operates                    | Base gate yes; revision no | Latest verdict ready=false; rounds=0, teams=0, fixture sample=false                |
| Current-season staging synchronization              | No                                  | No                                | No                         | Bounded ingestion, canonical mapping, and Fantasy initialization remain            |
| Repository migration chain                          | 47 migrations on main and candidate | Local DB quality passed           | Yes                        | PR #123 changes no migration files and reports staging 35/47                       |
| Production Supabase API platform gate               | No                                  | No                                | No                         | Exposed api schema/platform state is not re-proven for candidate                   |
| Private league/ranking/invite corrections           | No                                  | No                                | No                         | Forward migration and stable API corrections remain                                |
| FR/AR route metadata parity                         | No                                  | No                                | No                         | Root/Fantasy metadata retains hardcoded French-visible baseline debt               |
| Capacity and soak                                   | Gate code exists                    | Verdict not passed                | Yes                        | Harness is on main; five-runner, 2,500-user gate plus soak remains                 |
| Identity delivery and OAuth launch gate             | No                                  | No                                | No                         | Staging SMTP, verification/recovery, and enabled OAuth are not re-proven           |
| Production Admin control-plane gate                 | No                                  | No                                | No                         | Read-only readiness and approved owner/staff bootstrap remain                      |
| Legal and account-lifecycle launch gate             | No                                  | No                                | No                         | Product/legal obligations manifest and required journey evidence remain            |
| Live production launch                              | Release controls exist              | Partial prerequisite evidence     | No candidate merge         | Explicitly blocked                                                                 |

## Preview and staging evidence matrix

| Area                                   | Preview                                     | Staging                         |
| -------------------------------------- | ------------------------------------------- | ------------------------------- |
| PR #120 core Fantasy UX                | Not claimed                                 | Not claimed                     |
| PR #123 launch candidate               | Two Vercel statuses; demo not certified     | Partial core creation/isolation |
| Isolated mock demo                     | Actual Preview not certified                | Not applicable                  |
| Atlas first-time team creation         | Not claimed                                 | Creation/refresh verified       |
| Remaining Fantasy launch journeys      | Browser CI only                             | Not fully verified              |
| Current-season provider readiness      | Not applicable                              | Not applicable                  |
| Current-season staging synchronization | Not applicable                              | Not authorized or run           |
| Repository migration chain             | Not applicable                              | Parity not reached              |
| Capacity and soak                      | Not applicable                              | Not passed                      |
| Identity and account-lifecycle gates   | Not applicable                              | Not fully specified or verified |
| Live production launch                 | Independent demo track; not launch evidence | No final acceptance             |

## Provider evidence matrix

| Surface                       | Technical execution | Readiness verdict                           | Evidence or note                        |
| ----------------------------- | ------------------- | ------------------------------------------- | --------------------------------------- |
| SportsMonks current season    | Passed              | False: zero rounds/teams, no fixture sample | Protected probe run 31300813664         |
| Launch news sources           | Not authorized      | No launch-source verdict                    | Product/legal decision remains          |
| Identity SMTP and OAuth       | Not re-proven       | No staging launch verdict                   | Unit 13 specification/evidence required |
| Notification delivery channel | Not re-proven       | No launch-channel verdict                   | Unit 11 specification/evidence required |

## Production evidence matrix

The isolated mock demo must never participate in any action below. Historical
production documents conflict in places, so the verdict column records only
what is re-proven for the current candidate.

| Protected action                               | Performed by PR #123 | Current candidate verdict or note                             |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| Main promotion and exact-SHA re-verification   | No                   | Candidate is unmerged                                         |
| Production migration                           | No                   | Hosted inventory and parity are not re-proven                 |
| Production Supabase API platform configuration | No                   | Historical state conflicts; not re-proven for candidate       |
| Production application deployment              | No                   | No re-verified main SHA was promoted                          |
| Production Identity configuration              | No                   | Historical state conflicts; not re-proven for candidate       |
| Production Admin bootstrap/activation          | No                   | Blocked pending read-only verification and owner decision     |
| Bounded production data mutation               | No                   | First-mutation authority not granted for candidate            |
| Production current-season initialization       | No                   | Not re-proven for candidate                                   |
| Production Fantasy catalog staging             | No                   | Not re-proven for candidate                                   |
| Production Fantasy registration opening        | No                   | Not re-proven for candidate                                   |
| Production data/content provider activation    | No                   | Historical canaries are not candidate activation proof        |
| Production notification-delivery activation    | No                   | Not re-proven for candidate                                   |
| Production worker activation                   | No                   | Not re-proven for candidate                                   |
| Production schedule activation                 | No                   | Not re-proven for candidate                                   |
| Post-launch verification                       | No                   | Not performed for candidate                                   |
| Rollback action                                | No                   | Plans exist; no candidate production action required rollback |

## Completed with current evidence

- Main includes PR #120 and its focused Fantasy navigation/auth improvements.
- PR #123 contains the Atlas creation journey, authoritative Fantasy hardening,
  isolated demo profile, launch-readiness status, and protected staging verdict.
- PR #123 application quality passed on run 31252766070, including migration and
  secret checks, TypeScript, 592 Bun tests across 113 files, lint, live build,
  demo builds, and compiled-preview browser acceptance as reported by the PR.
- Protected Phase 6.5 staging acceptance passed on run 31253017824, including
  first-time cloud creation, authoritative refresh, follow persistence,
  second-user isolation, and cleanup.
- Both Vercel commit status contexts were Ready for launch-candidate SHA
  1d87fb2. This is deployment status, not mock-preview certification.
- PR #123's production selectors remain designed to fail closed, and its
  implementation performed no production migration, provider/worker/schedule
  activation, deployment, or data mutation. This is not a hosted-production
  runtime verdict.

## In progress

- Six-file context system, build plan, spec template, and AGENTS entry-point
  integration
- Human review and disposition of draft PR #123
- Reconciliation of superseded or divergent PRs #121 and #122
- Decision on whether PR #116 remains a separate NewsData provider track
- Selection of one canonical Vercel project/preview path

## Next up

1. Merge this context change into the launch-candidate branch after review.
2. Re-run docs validation against the resulting launch-candidate SHA.
3. Configure the exact branch-scoped demo Preview environment from
   docs/qa/MOCK_DEMO_RELEASE.md and redeploy the reviewed exact SHA.
4. Verify the actual preview's SHA, demo banner, noindex metadata, simulation
   labels, cloud containment, and the full browser matrix.
5. Reconcile staging migration history with the repository chain through the
   protected forward-only process.
6. Implement and verify the private-league RLS correction, authoritative global
   ranking/manager identity contract, and invite-code rotation/recovery.
7. Obtain a passing current-season SportsMonks readiness verdict with nonzero
   rounds, teams, and a fixture sample.
8. Run the separately authorized bounded staging synchronization and prove
   canonical current-season Football/Fantasy initialization.
9. Run the unchanged five-runner/2,500-user capacity gate and soak on the
   approved Staging V2 load environment configured to the selected
   production-equivalent compute tier.
10. Prove the approved SMTP verification/recovery and enabled OAuth matrix.
11. Obtain the product/legal launch-obligations verdict for privacy, support,
    account deletion, retention, and account lifecycle.
12. Perform final exact-SHA release review, staging acceptance, rollback proof,
    and separately authorized production actions.

## Live launch blockers

- Current-season SportsMonks evidence is not ready.
- Bounded current-season staging ingestion, canonical mapping, and Fantasy
  initialization have not been authorized or proven.
- Staging migration history is behind the launch-candidate repository chain.
- Production Supabase API exposed-schema/platform configuration is not re-proven
  for the candidate.
- Required private-league, global-ranking, manager-identity, and invite-code
  forward corrections are not complete.
- Known root/Fantasy route metadata does not yet have complete FR/AR parity.
- Capacity and soak have not passed in the approved Staging V2 load environment
  on the selected production-equivalent compute tier.
- Staging SMTP deliverability, verification/recovery, and enabled OAuth flows are
  not re-proven for the candidate.
- Production Admin read-only readiness, owner bootstrap, staff roles, and
  revocation controls are not re-proven for the candidate.
- The product/legal launch-obligations manifest and its required privacy,
  support, deletion, retention, and account-lifecycle evidence do not exist.
- Production dataset, worker schedule, and end-to-end launch state have not been
  independently re-proven for the candidate.

## Demo-sharing blockers

- The actual Vercel mock preview has not been certified.
- Two Vercel project contexts create deployment ambiguity.
- These block sharing or describing the demo as certified. They do not replace
  or block the separate live-launch gates above.

## Open questions

| Question                                                                                  | Decision required from        |
| ----------------------------------------------------------------------------------------- | ----------------------------- |
| Is PR #123 the sole canonical launch candidate, superseding #121 and #122?                | Product/repository owner      |
| Which Vercel project is canonical, and should the duplicate build be disabled?            | Deployment owner              |
| What is the approved forward migration sequence and current hosted migration inventory?   | Database/release reviewers    |
| Which news providers have current commercial approval and should be activated at launch?  | Product/legal/release owner   |
| Which player imagery rights exist beyond club crests?                                     | Product/legal owner           |
| Are automatic squad selection, transfer history, and shareable team cards still deferred? | Product owner                 |
| Which production-equivalent Staging V2 compute tier will be used for capacity and soak?   | Infrastructure owner          |
| Which SMTP service and OAuth providers are approved, configured, and supported at launch? | Product/security/infra owner  |
| What is the current production PostgREST exposed-schema config and approved rollback?     | Database/security/infra owner |
| Who may bootstrap production Admin owner/staff roles, and under which dual controls?      | Product/security owner        |
| Which privacy, support, deletion, retention, and account-lifecycle duties block launch?   | Product/legal owner           |
| When will billing, prizes, and broader content operations receive separate specs?         | Product owner                 |

## Architecture decisions

- Production V2 is the only active architecture; Legacy is untouched.
- The api schema is the stable Data API boundary; app and app_private remain
  canonical/internal.
- Live data modes fail closed and never fall back to mocks.
- The isolated demo uses all-mock browser domains, inert coordinates, persistent
  simulation disclosure, and blocked cloud/Admin/MCP behavior.
- User mutations are authoritative, RLS-protected, and versioned/idempotent where
  concurrency or retry requires it.
- Fantasy scoring, rankings, transfers, and rules are server-owned in live mode.
- FR/AR parity, RTL, accessibility, and responsive behavior are release
  requirements.
- Production migration, Supabase API configuration, deployment, Identity/Admin
  activation, data mutation/provider activation, notification delivery, workers,
  schedules, verification, and rollback are separate protected actions.

## Documentation drift watch

- .lovable/plan.md describes global rankings as a future implementation even
  though ranking code and routes exist. It is historical until reconciled.
- Older production documents can report a gate as not executed while newer
  evidence reports later activation. Use the newest corroborated evidence.
- Fantasy capacity documents conflict: the runbook forbids the harness outside
  staging-v2, while the report says certification is deferred on the selected
  production tier. Until infrastructure/release owners resolve that wording,
  use only an isolated Staging V2 load environment configured to a
  production-equivalent tier; never run the harness in Production V2.
- A green provider workflow can mean the probe ran correctly while its readiness
  result remains false.
- A green Vercel status does not prove environment variables, live data, or the
  full end-to-end journey.

## Session resume

Start from the launch-candidate branch, not stale main. Read PR #123 and its
latest checks, confirm the branch head has not moved beyond the baseline above,
then use docs/specs/00-build-plan.md to find the next ordered unit. Open that
unit's spec and proceed only when its authoritative lifecycle is Approved, its
disposition is Active, and a durable central claim has been recorded. If the
head or runtime evidence changed, update this tracker before implementation.
