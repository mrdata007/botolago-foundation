# Fantasy Domain Runbook

## Authority

Fantasy V2 is authoritative for rules, eligibility, prices, teams, squads,
lineups, transfers, chips, points, results, leagues, and rankings. Football V2
is read-only input. Browser callers use only explicitly granted `api` RPCs;
workers use service-role RPCs. No worker schedule is enabled by this phase.

## Environment

- local/preview: `VITE_FANTASY_DATA_MODE=mock` with deterministic adapters;
- staging/production UI: `VITE_FANTASY_DATA_MODE=supabase`;
- workers: server-only service key plus the sanitized batch/version/retry values
  in `.env.example`;
- client code must never receive the service-role key.

Production mode fails closed if the Fantasy data mode is omitted. Local
storage is permitted only for drafts keyed by user/team/base version.

## Ruleset and catalog activation

The immutable launch rules are recorded in `FANTASY_RULES_V1.md`; the active
pre-activation template is `botolago-fantasy-v1.1`, which preserves the v1.0
game rules and adds the reviewed fixture-difficulty contract. Before opening
registration, link the template to one reviewed Fantasy season and persist the
explicit short-season Wildcard split when applicable. Never edit a historical
ruleset in place; create a new version and choose an explicit effective date.

The exact two-step source preview, deterministic opening-price model, catalog
stage, registration-open, verification, idempotency, and rollback procedure is
documented in `FANTASY_CATALOG_ACTIVATION_RUNBOOK.md`. Staging a catalog does
not authorize registration or activate any worker schedule.

## Staging capacity validation

The two SQL harnesses refuse to run unless the session is explicitly marked
`staging-v2`. They must never be executed in Production V2 or Legacy.
`scripts/backend/fantasy-capacity-orchestrator.py` implements the bounded
distributed sequence and mandatory cleanup verification; it contains no
credential and accepts protected values only from the GitHub Actions process
environment. AWS credentials are short-lived assumed-role credentials issued
through GitHub OIDC. No AWS access key is configured as a GitHub secret or
written to disk.

The authoritative entry point is the manually dispatched
`.github/workflows/phase6-capacity-gate.yml` workflow. Its fixed GitHub
environment is `staging-load-test`, so protected secrets and OIDC permission
remain behind owner approval. Dispatch requires the exact reviewed PR #6 head
SHA and the explicit `RUN_PHASE6_STAGING_GATE` confirmation. The job checks
that SHA against PR #6 before obtaining credentials, then checks out that exact
commit. It permits one concurrent run, is pinned to `eu-west-3`, times out at
two hours, caps the conservative estimate at $50, and gives every EC2 runner a
105-minute self-termination backstop.

GitHub only accepts `workflow_dispatch` for workflow definitions already
present on the default branch. Therefore this workflow-only operational change
must be reviewed and landed on `main` before it can test PR #6; landing the
workflow does not merge or activate the Fantasy domain. Once present on
`main`, select the current `backend/fantasy-domain` head as the
`expected_commit`. Never dispatch an older or unreviewed SHA.

The protected environment must define:

- secret `SUPABASE_ACCESS_TOKEN`;
- variable `AWS_LOAD_TEST_ROLE_ARN`;
- variables `SUPABASE_STAGING_PROJECT_REF`, `SUPABASE_STAGING_URL`, and
  `SUPABASE_STAGING_PUBLISHABLE_KEY`.

The workflow runs the setup-only rehearsal before the full gate. The combined
command keeps protected values in process memory between two otherwise
isolated runs and starts the full gate only after rehearsal cleanup verifies
exact zero:

```text
python scripts/backend/fantasy-capacity-orchestrator.py --rehearsal-then-full
```

This command is executed by Actions; do not create a local `runtime.env` or
copy protected GitHub values to a developer machine. The independent
`--cleanup-only` invocation runs under `if: always()` and rediscovers resources
by their dedicated Supabase namespace and AWS tags. Non-secret recovery IDs
are stored only under the ephemeral Actions runner directory. Runner session
files, temporary user credentials, the temporary Metrics key, Auth users,
Fantasy records, instances, security groups, key pairs, and recovery state are
removed before exact-zero verification.

The rehearsal uses five runners and 25 users per runner. It executes user,
session, Fantasy team/squad, team-read preparation, cross-runner fingerprint,
75-second synchronization, readiness, and Metrics-startup paths, but schedules
zero measured requests. Every runner must produce an owner-only sanitized
stdout and stderr artifact. The full-gate mode remains fixed at 500 users per
runner and cannot inherit the rehearsal dimensions.

1. Apply reviewed migrations to Staging V2 only.
2. Run `scripts/backend/fantasy-staging-seed.sql` with
   `set botolago.capacity_environment = 'staging-v2'`.
3. Obtain an approved Auth load-test window or distributed provisioner. Enable
   only the 2,500 generated identities and mint 2,500 independent
   `authenticated` sessions gradually, outside the measured window. Do not
   burst `/auth/v1/token` from one IP and do not use `service_role`, shared
   identities, fabricated JWTs, or an ownership bypass.
   The reviewed distributed profile uses five runners with distinct public
   IPv4 egress, 500 users per runner, and at most 0.4 Auth requests/second per
   runner. Verify the delegated AWS caller can launch in `eu-west-3` before
   creating any temporary resource. The assumed-role ARN must match
   `AWS_LOAD_TEST_ROLE_ARN`, and an AWS session token is mandatory.
   Create temporary users at a bounded five admin requests/second. For an
   ambiguous response, resolve the unique email first and only then retry with
   the same password; never create a replacement identity blindly.
4. Each ephemeral runner writes its assigned access tokens to an owner-only
   (mode `0600`) JSON file on its encrypted temporary volume. The complete user
   pool is never stored on the GitHub runner. Each shard file contains exactly
   500 records shaped as
   `{"number": 1, "access_token": "..."}`. User numbers must be contiguous;
   tokens must have unique UUID subjects and session IDs, unique access and
   refresh material, and remain valid throughout the full gate-plus-soak
   sequence. The distributed provisioner returns only SHA-256 fingerprints to
   prove cross-runner uniqueness; raw refresh tokens never leave a runner.
   Provision at least 20 minutes of remaining token lifetime before starting
   the collector.
5. Start `scripts/backend/supabase-metrics-collector.py` with a temporary
   Staging-only Secret API key, the documented 60-second cadence, and a
   900-second window. The collector writes an owner-only NDJSON artifact
   outside the repository. Do not lower the interval without written Supabase
   approval. The 15-minute window includes both runners' unmeasured team
   preparation, the exact gate, the soak, and bounded handoff time.
   Supabase API-key names permit lowercase alphanumerics and underscores, not
   hyphens; use `phase6_fantasy_metrics` when the intended display name is
   `phase6-fantasy-metrics`.
6. Run `scripts/backend/fantasy-load-test.py` with
   `BOTOLAGO_LOAD_PROFILE=merge_gate`: 600 RPS for 10 seconds and 250 RPS for
   the remaining 50 seconds. Session and team preparation is completed before
   the measurement clock begins. By default, results are written owner-only to
   `/tmp/botolago-fantasy-merge_gate-results.json`.
7. Immediately run a telemetry soak with
   `BOTOLAGO_LOAD_PROFILE=telemetry_soak`,
   `BOTOLAGO_LOAD_BURST_SECONDS=0`, and
   `BOTOLAGO_LOAD_DURATION_SECONDS=600`. It uses the same 2,500 independent
   users, 250 RPS, and operation mix for ten minutes. Soak latency does not
   replace or dilute the exact merge-gate result. Its default owner-only result
   path is `/tmp/botolago-fantasy-telemetry_soak-results.json`, so it cannot
   overwrite the merge-gate artifact.
8. Run the workload integrity queries, then revoke all temporary
   sessions/passwords, delete the temporary Secret API key, and remove the
   session cache and any local secret material immediately. Retain only the
   sanitized load-result and metrics artifacts as gate evidence. The evidence
   renderer rejects Supabase secret keys, Management tokens, AWS access-key
   identifiers, authorization headers, private keys, and JWT-shaped material;
   artifacts are not uploaded if this scan fails.
9. Run `scripts/backend/fantasy-staging-finalization.sql` to verify bounded
   resume, Free Hit restoration, rollover, rankings, and stable completion.
10. Capture `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)` for current-team,
    player-pool, results, transfer-preview, and league-standings access paths.

If Auth returns 429 while preparing independent users, stop: do not share
tokens, weaken the user count, or create a bypass RPC. Revoke temporary
passwords/sessions, record the gate as blocked, and request a reviewed Auth
load-test window. A Pro plan does not remove the non-customizable per-IP token
endpoint limit, so plan/tier alone is not evidence that session preparation is
approved.

If AWS returns `PendingVerification` from `RunInstances`, stop before session
provisioning. Restore any temporarily changed synthetic gameweek state, delete
the Metrics API key, security group, and key pair, verify zero active runners
and credential artifacts, and keep PR #6 draft. Wait for the AWS verification
email or open an account-management support case before retrying. Do not reduce
the runner count or reuse an egress IP as a substitute.

If OIDC role assumption or AWS caller verification fails, stop before creating
the Metrics key or any runner. The credential action performs one attempt; do
not add repeated credential retries or fall back to long-lived access keys.
Run local cleanup, retain only the sanitized preflight record, and keep PR #6
draft. Because no AWS session was obtained, external inventory cannot be
asserted; the report must say that provisioning never started rather than
claiming a measured or cleanup pass.

If only another region is temporarily available, record the cross-region path.
A pass is conservative; a latency failure is not sufficient evidence of a
database regression until the unchanged gate is repeated near Staging V2. Any
temporary-user creation failure still stops that attempt before authentication.
After cleanup, verify the global temporary-email prefix has zero users, not
only that the locally tracked IDs are absent.

The load runner rejects a cache that is not absolute, owner-only, exactly
2,500 users, uniquely authenticated, contiguously numbered, and sufficiently
unexpired. For the full gate-plus-soak sequence, provision at least 20 minutes
of remaining token lifetime. It never writes tokens to its result artifact and
clears them from its in-memory state after each run. The metrics collector
authenticates only to the Staging Metrics API, never prints its Secret API key,
and must run across the exact workload and soak for the resource-utilization
gate to count.

Team preparation is unmeasured and uses bounded retries. The rehearsal retains
sanitized owner-only stdout and stderr for all five runners; the measured gate
retains sanitized failure diagnostics. Cleanup must not delete load data in a
single transaction: every load-owned table is deleted in bounded,
independently committed batches so the staging statement timeout cannot roll
back the entire cleanup. Always run the exact-zero global namespace audit even
when the orchestrator reports a cleanup exception.

The representative profile is 50,000 teams, 750,000 active memberships,
50,000 current lineups, one 10,000-member league, and 1,000 additional mixed
public/private leagues. Production workers and schedules remain disabled.

## Gameweek operations

Gameweeks after activation are staged by `api.service_sync_fantasy_calendar`
(service role): it creates a `scheduled` gameweek for every complete provider
round with confirmed kickoffs, keeps assignments of `scheduled`/`open`
gameweeks aligned with fixture kickoffs (new, voided, moved fixtures), and
re-derives `starts_at`/`ends_at`/`deadline_at` from the ruleset rule. It never
touches a locked gameweek, never moves a passed deadline, and treats
`00:00 UTC` kickoffs as unconfirmed placeholders. The scheduled orchestrator
(`FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`) calls it before and after each
worker pass.

The intended manual/staging order is:

1. open the next scheduled gameweek;
2. lock it at database `statement_timestamp() >= deadline_at`;
3. recalculate provisional points from canonical Football inputs;
4. verify all required fixtures are final or explicitly resolved;
5. freeze the Football input/calculation version;
6. calculate player points and user results in bounded batches;
7. apply automatic substitutions, multipliers, chips, and transfer hits;
8. restore Free Hit snapshots exactly once;
9. roll free transfers once;
10. recalculate overall and league rankings;
11. emit target-user Notification events;
12. mark the gameweek finalized.

`app_private.fantasy_job_runs` stores resumable checkpoints, counters, leases,
and sanitized failures. Stale leases can be reclaimed; worker RPC calls and
calculation versions are idempotent. Corrections use a new calculation version
and `app_private.fantasy_corrections`, never an in-place historical rewrite.

## Deadline incident response

If a deadline transition fails, stop mutations by setting the gameweek to
`locked` through trusted operations before retrying downstream jobs. Do not
change the deadline to accommodate late browser requests. Audit accepted and
rejected mutation counts and preserve correlation/idempotency identifiers.

## Free Hit recovery

Snapshots are relational and unique per chip use/team/gameweek. The restoration
worker marks active temporary memberships sold, recreates original membership
rows with original prices, restores bank/free transfers, advances team version,
and writes `restored_at` plus `restoration_version`. A populated `restored_at`
is the retry short circuit. Missing snapshots are a hard
`free_hit_snapshot_missing` incident, not a silent fallback.

## Validation commands

```text
bun run backend:migrations:check
bun run backend:db:reset
bun run backend:db:test
bun run backend:db:lint
bun run backend:types:generate
bun run backend:types:check
bun run backend:secrets:check
bun run typecheck
bun test
bun run lint
bun run build
```

## Rollback

No production migration or worker schedule is activated in Phase 6. To roll
back application behavior, set the reviewed environment back to the previous
domain mode and revert the Phase 6 application commit while keeping migrations
dormant. On disposable staging, recreate from the last approved migration set.
For a populated environment, stop workers and ship a reviewed additive forward
repair; do not drop Fantasy history, replay legacy migrations, or touch legacy.
