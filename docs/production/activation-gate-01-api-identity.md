# Production activation Gate 1: API exposure and Identity/Profile

Status: **NOT EXECUTED**.

PR #38 is an activation package, not evidence that activation occurred. The
workflow must not be dispatched until this package has passed validation and
every protected-environment prerequisite below has been verified.

Gate 1 changes only the BotolaGO Production V2 PostgREST exposed-schema
configuration. It does not apply migrations, create users, bootstrap an owner,
assign staff roles, activate a worker or schedule, enable an Edge Function, or
send capacity traffic.

## Immutable target and temporary single-operator control

| Guard                 | Required value                        |
| --------------------- | ------------------------------------- |
| Repository            | `mrdata007/botolago-foundation`       |
| Actor                 | `mrdata007`                           |
| Event                 | manual `workflow_dispatch` only       |
| Run attempt           | exactly `1`; reruns are forbidden     |
| Git ref               | `refs/heads/main`                     |
| Approved commit       | exact current `main` SHA              |
| Confirmation          | `RUN_PHASE7F_PRODUCTION_API_IDENTITY` |
| Project               | BotolaGO Production V2                |
| Project ref           | `tkewgajrljbwgwedqsxn`                |
| Region                | `eu-west-3`                           |
| Environment           | `production-v2`                       |
| GitHub environment    | `production-admin-activation`         |
| Forbidden staging ref | `srdrflfrfpwixsllveid`                |
| Forbidden legacy ref  | `kxpaudvntwxpahyjtxbk`                |

The owner explicitly accepted a temporary single-operator activation model for
Gate 1. Independent PR and per-run approval are deferred and must be
reassessed before later privileged activation. The workflow therefore accepts
only a first-attempt manual dispatch by the fixed repository owner from the
exact current `main` commit. The confirmation string is an operator
anti-mistake control.

`main` remains protected by a required pull-request workflow, the
`application-quality` and `database-quality` checks, administrator
enforcement, conversation resolution, and disabled force-push and deletion.
The required approval count is temporarily zero to avoid a single-maintainer
deadlock.

GitHub Actions reruns are forbidden. Every failed attempt requires a new
`workflow_dispatch` run with run attempt `1`. No GitHub governance token,
reviewer ID, approval issue, nonce, or issue comment is used by Gate 1.

Phase 7E-B migration promotion and Phase 7F activation use the shared
`botolago-production-v2-mutation` concurrency group with cancellation disabled.

The activation job condition itself uses `always()` so that a normal GitHub
workflow cancellation can still reach journal inspection and independently
verified recovery. The single-operator context check and activation step do
not use `always()` and therefore stop on cancellation or prior failure.
Recovery remains unreachable unless the owner context check succeeded and an
activation state journal exists; cancellation before journal creation cannot
expose a Supabase recovery credential.

## Exposed schemas versus database privileges

The intended hosted configuration is:

```text
db_schema=api
db_extra_search_path=extensions
```

`app` and `app_private` are absent from `db_schema`. This is distinct from
database grants. The canonical Identity migration intentionally grants
`authenticated` schema usage on `app` and SELECT on exactly:

- `app.profiles`;
- `app.user_preferences`;
- `app.followed_teams`;
- `app.followed_competitions`;
- `app.account_deletion_requests`.

Those grants are required by reviewed `security_invoker` API views and remain
protected by forced RLS. They are not revoked by Gate 1. `anon` has no `app`
usage, browser roles have no canonical INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/
REFERENCES grants, and neither browser role has `app_private` usage.

The repository-derived manifest at
`scripts/backend/phase7f-api-surface-manifest.json` is generated from a clean
replay of all 35 migrations. Its companion SQL compares Production V2 before
mutation. The comparison includes:

- every `api` relation/view, owner, view options, and exact grants;
- every `api` routine signature, return type, volatility, security mode,
  owner, `search_path`, and exact EXECUTE grantees;
- every canonical RLS/forced-RLS state and policy expression hash;
- browser schema, relation, sequence, and routine privileges;
- Admin bootstrap, staff context, role, approval, revocation, session, and
  audit contracts.

Unexpected views, routines, grants, policies, permissive policy drift, PUBLIC
execute, or an unsafe SECURITY DEFINER search path fail before exposure.
The controller reports only the manifest hash and counts; it never repairs
drift.

## Measured runtime preflight

The controller measures rather than assumes:

- exact 35-migration checksum parity;
- project identity, ownership, region, and `ACTIVE_HEALTHY`;
- latest completed daily backup;
- WAL-G enabled;
- PITR as `ENABLED` or `DISABLED_ACCEPTED`;
- zero Edge Functions and zero cron jobs;
- football and news ingestion run state;
- notification fan-out and schedule state;
- Fantasy job state;
- Admin revocation worker, schedule, and pending-request state;
- platform-admin and staff-principal counts;
- successful owner-bootstrap audit count;
- pending privileged approvals;
- active/queued conflicting production workflows;
- complete profile/preference backfill and the Identity trigger;
- 112/112 canonical tables with RLS enabled and forced.

An unavailable WAL-G, worker, schedule, bootstrap-audit, conflict, or manifest
source is `UNVERIFIED` and blocks mutation. PITR may remain disabled when the
daily backup and WAL-G checks pass; the report labels that state honestly.

## Approved smoke identities

Automatic user selection is forbidden. The protected environment must define
`BOTOLAGO_PRODUCTION_SMOKE_USER_UUID`; it has no default and is not a workflow
input. Only its SHA-256 fingerprint appears in evidence.

Before mutation, the controller proves that this exact Auth UUID:

- exists and has verified email;
- is not banned, disabled, or deleted;
- links to exactly one application profile;
- has no staff principal, Admin role, or pending privileged approval;
- has a verified MFA factor;
- is the owner-selected existing Gate 1 actor.

The complete runtime matrix also requires a current AAL2 non-staff session in
the protected secret `BOTOLAGO_AAL2_NON_STAFF_ACCESS_TOKEN`. The token subject
must equal the configured UUID, its JWT assurance claim must be `aal2`, and its
session must be active. Missing or mismatched proof fails before mutation. No
administrator is created and owner bootstrap is never executed.

## Authorization smoke matrix

All requests are sequential, explicitly timed out, and subject to the
controller request cap. Evidence contains case IDs, actor classes, request
categories, exact expected/actual status and stable error codes, and row
counts—not raw bodies.

| Actor            | Boundary                                                                   |
| ---------------- | -------------------------------------------------------------------------- |
| Anonymous        | `api.my_profile` and profile mutation are rejected (`401` / `42501`)       |
| Anonymous        | `app` and `app_private` are unexposed (`406` / `PGRST106`)                 |
| Anonymous        | staff context, role assignment, approval, and bootstrap are denied         |
| Malformed bearer | rejected (`401` / `PGRST301`) with no fallback                             |
| Ordinary AAL1    | exactly own profile; unrelated profile is empty; mutation denied           |
| Ordinary AAL1    | staff, role, approval, and bootstrap contracts denied                      |
| AAL2 non-staff   | MFA alone does not grant staff, role, approval, or bootstrap access        |
| GraphQL          | removed schema returns the exact no-function contract (`404` / `PGRST202`) |

No direct canonical PATCH probe exists. Canonical write denial is proven by the
manifest and API-view denial.

## Temporary session safety

The Auth link and access/refresh material exist only in memory and are never
printed or persisted. The access JWT's `session_id` claim is retained in memory
for exact verification. Local-scope logout is followed by a bounded
`auth.sessions` absence check.

If local logout fails, supported Auth global logout is attempted for the
dedicated approved smoke actor. If session creation has an ambiguous transport
result, the controller mints a cleanup-only session for that same dedicated
actor, globally revokes its sessions, and verifies the session inventory is
zero. The user and MFA factors are never deleted or changed. Any unverified
residual session produces `SESSION_CLEANUP_FAILED`; PASS is impossible.

## Durable mutation and rollback

Before PATCH, the controller atomically writes an owner-only (`0600`) journal
containing only non-secret target, commit, run, timestamp, exact prior
PostgREST values, mutation flags, rollback flags, session-cleanup state, and
verdict.

Verdicts are:

- `NOT_EXECUTED`;
- `FAILED_BEFORE_MUTATION`;
- `MUTATION_IN_PROGRESS`;
- `ACTIVATED_PENDING_TESTS`;
- `PASS`;
- `FAILED_ROLLED_BACK`;
- `ROLLBACK_FAILED`;
- `ACTIVATION_STATE_AMBIGUOUS`;
- `SESSION_CLEANUP_FAILED`;
- `EVIDENCE_FAILURE`.

SIGINT and SIGTERM raise a controlled failure. More importantly, an independent
`if: always()` workflow step runs `--recover-from-state`, reads the effective
configuration, and restores the exact captured values. It does not depend on
the primary process reaching a `finally` block.

After a missing, timed-out, or unparseable PATCH response the controller does
not repeat the mutation. It performs a read-only GET and classifies the state
as unchanged, intended activation applied, unexpected, or unverified. Recovery
is idempotent. Rollback is independently verified; rejection, timeout, or
non-convergence is `ROLLBACK_FAILED`, never generic failure.

## Evidence

Evidence files and their directory are owner-only. A dedicated scanner reads
files silently and emits only sanitized filename, stable rule ID, count, and
PASS/FAIL. It never prints matching content. Missing evidence, a scanner
failure, or artifact upload failure fails the gate and records
`EVIDENCE_FAILURE` where the state journal remains available. A successful
controller remains `ACTIVATED_PENDING_TESTS` until scanning and upload succeed;
an evidence failure invokes the same independently verified rollback before
the evidence verdict is finalized.

Production credentials are scoped only to the activation or independent
recovery steps. Checkout, Python setup, static validation, the owner-context
check, scanning, and artifact upload do not receive Supabase secrets.
Third-party actions remain pinned to immutable commits.

## Dispatch and prohibited actions

After PR validation, protected-main configuration, smoke-user verification, and
fresh AAL2 session configuration, the owner may dispatch from the exact merged
`main` commit with:

```text
expected_commit=<exact approved main SHA>
confirmation=RUN_PHASE7F_PRODUCTION_API_IDENTITY
```

Until then, do not dispatch. Gate 1 does not authorize migrations, owner
bootstrap, staff assignment, worker/schedule activation, ingestion,
notifications, Fantasy processing, load traffic, or any Staging/Legacy action.
Even a successful future run means only controlled API exposure and
Identity/Profile validation—not full Production V2 activation.

Gate 2 remains blocked until this Gate 1 workflow executes and returns PASS.
