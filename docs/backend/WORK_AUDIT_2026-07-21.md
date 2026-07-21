# BotolaGO Repository Work Audit — 2026-07-21

Auditor: Claude Code (independent repository review)
Scope: full history of `mrdata007/botolago-foundation` on `main` at
`d6dc7e8` plus all open/closed pull requests and pending branches.
Method: git history and PR review, file-level inspection of migrations,
workflows, IAM policy, and backend source, plus local re-execution of the
repository's own quality gates (results in section 6).

## 1. Executive summary

The project has moved through two clearly distinct eras:

1. **Frontend era (2026-07-17 → 07-19):** 293 Lovable
   (`gpt-engineer-app[bot]`) commits building the BotolaGO React frontend
   (TanStack Start, React 19, Tailwind 4, shadcn/ui), ending in a cleanup
   commit. Commit messages ("Changes") carry no history value; the app
   itself is the artifact.
2. **Backend era (2026-07-19 → 07-21):** 18 deliberate commits executing a
   phased greenfield backend plan (Phases 0–5 merged, Phase 6 pending)
   against a fresh Supabase project, with legacy migrations quarantined as
   archive-only.

Overall assessment: **the merged work (Phases 0–5) is of genuinely high
quality** — additive replayable migrations, forced RLS, an `api`-schema-only
client contract, pgTAP/RLS suites, generated-type drift checks, secret
scanning, and thorough per-phase documentation. **The current bottleneck is
Phase 6 (Fantasy):** a 73-file, +15,774-line draft PR (#6) blocked behind a
self-imposed AWS load-test gate that has consumed five follow-up PRs
(#7–#11) and three failed run attempts without yet producing a measured
result. The gate's engineering is careful, but its cost/benefit is now the
main schedule risk.

## 2. Delivery timeline

| Date          | Milestone                                                       | PR  | State          |
| ------------- | --------------------------------------------------------------- | --- | -------------- |
| 07-17 → 07-19 | Lovable frontend build-out (293 bot commits)                    | —   | done           |
| 07-19         | Phase 0/1: greenfield foundation, CI, schema conventions        | #1  | merged 07-20   |
| 07-20         | Phase 2: identity domain (profiles, preferences, follows, RLS)  | #2  | merged         |
| 07-20         | Phase 3: football catalog + match ingestion domain              | #3  | merged         |
| 07-20         | Phase 4: news/editorial domain (FTS, sanitizer, taxonomy)       | #4  | merged         |
| 07-20         | Phase 5: notifications domain (fan-out, templates, quiet hours) | #5  | merged         |
| 07-20         | Phase 6: fantasy domain (rules v1, scoring, leagues)            | #6  | **open draft** |
| 07-21         | Phase 6 capacity-gate workflow bootstrap                        | #7  | merged         |
| 07-21         | Fix workflow `runner.temp` parse rejection                      | #8  | merged         |
| 07-21         | Fix IAM implicit deny on `ec2:CreateSecurityGroup`              | #9  | merged         |
| 07-21         | Session-provisioning diagnostics (stacked on #6)                | #10 | **open draft** |
| 07-21         | Executable five-user session rehearsal workflow                 | #11 | merged         |

## 3. What is on `main` (merged, Phases 0–5)

### Schema and database

- 17 migrations, all additive and replayable from zero
  (`bun scripts/backend/validate-migrations.mjs` re-run in this audit: pass).
- Three-schema architecture consistently applied: canonical `app` (not
  exposed), client-facing `api` (views + RPCs only), privileged
  `app_private`. Browser roles receive no direct table grants; writes go
  through owner-derived RPCs.
- 11 pgTAP test files covering schema shape, privileges, and a two-user RLS
  denial harness for every domain.
- Legacy Supabase migrations are archived under
  `docs/backend/archive/legacy-supabase/` and never replayed — a correct and
  clearly documented decision.

### Application layer

- Domain code under `src/backend/{identity,football,news,notifications}`
  with contracts, typed errors, mock repositories, fixture provider
  adapters, and resilience wrappers; 22 test files in `src/backend`, 48
  across `src/`.
- The frontend still defaults to mock data modes
  (`VITE_AUTH_MODE=mock`, `VITE_{FOOTBALL,NEWS,NOTIFICATIONS}_DATA_MODE=mock`)
  and production modes fail closed. Production V2 remains empty; only
  Staging V2 (`srdrflfrfpwixsllveid`) has schema applied. This matches the
  master plan's staging-first posture.

### CI and tooling

- `backend-quality.yml` runs migration validation, secret scan, typecheck,
  tests, lint, build, plus a full local-Supabase job (replay, pgTAP, lint,
  type-drift) on every backend-touching PR.
- Dedicated scripts for type generation/drift, migration validation, and
  high-confidence secret scanning (re-run in this audit: pass).

### Documentation

Exceptional for a project of this age: a master plan, per-phase plans,
per-phase delivery reports, and four operational runbooks. PR bodies double
as delivery reports with explicit non-actions and rollback sections.

## 4. What is pending

### PR #6 — Phase 6 Fantasy domain (draft)

- 73 files, +15,774 / −216: 11 migrations, 17 fantasy backend modules, 11
  route updates, ~4,700 lines of Python load-test harness, 5 docs.
- Self-reported quality on branch head `f4bfb3d`: 316 tests pass, typecheck,
  build, lint, 28-migration validation, GitHub CI green (not independently
  re-run in this audit; the branch was not checked out).
- Deliberately kept draft until the staging capacity gate passes.

### PR #10 — Phase 6 diagnostics (draft, stacked on #6)

Adds sanitized runner diagnostics and a five-user rehearsal mode. Its
workflow-bootstrap component was extracted and merged separately as PR #11,
so #10 partially overlaps merged work and needs a rebase/trim before review.

## 5. The Phase 6 capacity-gate saga (main finding)

The team decided PR #6 may only leave draft after a 2,500-user staging load
test executed from five EC2 runners in `eu-west-3`, authenticated via GitHub
OIDC into a tightly scoped AWS role, with owner approval through a protected
`staging-load-test` environment.

Run/fix history so far:

1. Local-credential attempt: one runner died before the synchronized start;
   stderr was discarded — no diagnosis possible.
2. Hardened rehearsal: AWS STS rejected credentials (`InvalidClientTokenId`)
   — nothing provisioned.
3. Workflow bootstrap (#7) was rejected by GitHub's parser
   (`runner.temp` in job-level `env`) — fixed in #8.
4. Protected run 6: IAM implicit deny on `ec2:CreateSecurityGroup` — policy
   split shipped in #9 (correct root-cause analysis of tag-on-create
   condition evaluation against the VPC resource).
5. Latest protected run: SSH to a provisioned runner failed; cleanup passed;
   gate still not passed. #10/#11 add diagnostics and a five-user rehearsal
   to finally capture the failure.

Positives: the security engineering here is well above typical — OIDC-only
(no long-lived keys), SHA-pinned actions, least-privilege IAM conditioned on
region/tags/instance-type, sub-$50 cost guard, runner self-termination,
independent `always()` exact-zero cleanup, and evidence sanitization with
credential-pattern scanning.

Concerns: five meta-PRs and three failed attempts have not yet produced one
measured datapoint, while a 15,774-line domain PR ages against `main`. The
gate infrastructure (~760 lines of YAML on `main` + ~4,700 lines of Python
on the branch) now rivals the domain it is meant to validate, and each new
failure occurs one layer deeper (parser → STS → IAM → SSH), which is the
classic signature of an over-distributed test topology.

## 6. Independent verification (this audit, `main` @ `d6dc7e8`)

| Gate                                           | Command                                           | Result                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Migration validation                           | `bun scripts/backend/validate-migrations.mjs`     | PASS — 17 migrations                                                                                       |
| Secret scan                                    | `bun scripts/backend/check-committed-secrets.mjs` | PASS — no high-confidence secrets                                                                          |
| Typecheck                                      | `bun run typecheck`                               | PASS                                                                                                       |
| Application tests                              | `bun test`                                        | PASS — 288 tests / 704 expectations / 48 files (matches PR #5 claim exactly)                               |
| Lint                                           | `bun run lint`                                    | PASS — 0 errors, 11 warnings (all pre-existing `react-refresh/only-export-components`)                     |
| Formatting                                     | `bun run format:check`                            | FAIL (not CI-enforced) — 12 pre-existing unformatted files                                                 |
| Database suite (pgTAP/RLS, replay, type drift) | `supabase start` stack                            | NOT RUN — no Docker/Supabase stack in this audit environment; last green in GitHub CI per PR #5/#6 records |

## 7. Findings

Ranked by severity; none is release-blocking for the merged code.

1. **[Medium] Workflow-input script injection surface.** Both Phase 6
   workflows interpolate `${{ inputs.confirmation }}` and
   `${{ inputs.expected_commit }}` directly into bash `run:` blocks
   (`phase6-capacity-gate.yml:57-58,93`,
   `phase6-session-provisioning-rehearsal.yml:95-96,146`). The regex check
   validates the value only _after_ raw interpolation into the script text.
   Exploitation requires dispatch rights plus protected-environment
   approval, so practical risk is low, but the fix is one-line: pass inputs
   via `env:` and reference `"$EXPECTED_COMMIT"` — the pattern the same
   workflows already use for their `github-script` steps.
2. **[Medium] Phase 6 gate is the schedule's critical path.** See section 5.
   The gate has consumed 5 PRs / 3 failed runs / 0 measurements while PR #6
   ages. Recommendation in section 8.
3. **[Low] Process gates are self-attested.** PRs #7–#9 and #11 were opened
   and merged by the same account within minutes (e.g. #7: 4 minutes),
   despite PR bodies stating "Do not merge automatically" / "must not be
   updated until this PR is reviewed." With a single maintainer this is
   understandable, but the documentation implies an independent review step
   that does not exist; the audit trail should not overstate it.
4. **[Low] Workflow duplication and hardcoded coupling on `main`.**
   `phase6-capacity-gate.yml` and `phase6-session-provisioning-rehearsal.yml`
   share most of their logic; both hardcode PR **#6** by number, the
   `backend/fantasy-domain` branch name, and (in the capacity gate) ancestry
   SHA `f6340e0e…`. Both become dead weight the day PR #6 merges and will
   silently mis-target anything else. Plan their removal in the Phase 6
   merge commit.
5. **[Low] Masking intent inconsistency.** The workflows set
   `mask-aws-account-id: true`, but the account ID (`455155948410`) and
   staging VPC ID are committed in `infra/aws/phase6-load-test-policy.json`.
   Account IDs are not secrets, but the two decisions contradict each other;
   pick one posture (committing them is fine — then drop the masking
   theater).
6. **[Info] PR #10 is partially superseded** by merged PR #11 and needs a
   rebase/trim before it can be reviewed.
7. **[Info] Repo-wide formatting debt:** 12 pre-existing files on `main`
   fail `prettier --check` (re-verified in this audit; PR #6 reported 13 on
   its branch); the check is not enforced in CI, so the number can only
   grow.
8. **[Info] Lockfile depends on Lovable's private registry cache.**
   `bun.lock` pins 95 tarball URLs to
   `europe-west{1,4}-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`
   instead of `registry.npmjs.org`. GitHub CI can reach that cache today,
   but any environment that cannot (as this audit's sandbox could not)
   fails `bun install` until the URLs are rewritten. If Lovable's cache is
   ever retired or made private, installs break everywhere. Consider
   re-resolving the lockfile against the public registry.
9. **[Info] Frontend/product state:** all data modes remain mock by default;
   Production V2 is still empty; no provider, cron, or deployment is active.
   This is by design and correctly documented, but it means **no user-facing
   functionality is yet backed by the new backend in production.**

## 8. Recommendations

1. **Decide the Phase 6 gate's budget now.** Two sound options:
   - _Simplify the topology:_ run the rehearsal (and even a reduced-scale
     gate) directly from the GitHub runner without EC2/SSH indirection —
     Supabase staging does not care where load originates, and every failure
     so far has been in the EC2/SSH/credential layer, not the workload.
     Keep the 2,500-user distributed run as a post-merge staging exercise.
   - _Or de-couple merge from measurement:_ Phase 6 is additive, RLS-forced,
     schedule-disabled, and fail-closed — the same posture under which
     Phases 2–5 merged. Merge behind those guards and let capacity evidence
     gate _activation_, not code landing.
2. **Fix the workflow-input interpolation** (finding 1) in both Phase 6
   workflows — trivial and worth doing before the next protected dispatch.
3. **Rebase/trim PR #10** against the merged #11 so the diagnostics land at
   the next rehearsal.
4. **Schedule workflow cleanup:** the Phase 6 merge PR should delete or
   generalize both hardcoded Phase 6 workflows.
5. **Add `prettier --check` to CI** (or format the 13 stragglers once) so
   formatting debt stops accruing.
6. **Plan the first production activation review** (providers, SMTP/OAuth
   config, CSP, retention automation, alerts) — every runbook lists these as
   open gates, and they are now the longest lead-time items between the
   merged backend and a served user.

## 9. Verdict

Phases 0–5 are a disciplined, well-documented, security-conscious backend
foundation that this audit's independent re-runs corroborate. The project's
one real risk is procedural, not technical: a maximal pre-merge load-testing
gate on Phase 6 whose infrastructure keeps failing before the test itself
can run. Reduce that gate's blast radius (or move it post-merge), land
Phase 6, and shift attention to the production-activation checklist.
