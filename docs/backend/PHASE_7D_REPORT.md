# Phase 7D Report

Phase: Owner Admin activation readiness, second-operator dual control,
emergency rehearsal, and Admin Console handoff

Branch: `backend/admin-activation-operations`

Base: `c5a26b8d31e324cc89d5114205817a4a683a3be3`

Staging: BotolaGO Staging V2 (`srdrflfrfpwixsllveid`)

Production V2 and Legacy: untouched

## Outcome

Phase 7D makes the reviewed Phase 7A–7C security system operable without
activating a real owner. It adds a read-only owner readiness contract,
hardened runtime-only bootstrap proof, bounded manual worker commands, frozen
Admin Console contracts, operator runbooks, and a Lovable visual handoff.

It does not add domain mutations, a browser service credential, a production
worker schedule, a real owner email, a default password, consumer navigation,
or an arbitrary-user global sign-out claim.

## Owner readiness and bootstrap

`bun run admin:owner-readiness` verifies:

- exact runtime owner email match;
- verified email and MFA factor;
- current token identity and AAL2;
- explicit environment/project-ref pair;
- server-only credential;
- no conflicting principal or platform administrator;
- read-only database eligibility.

Safe output contains a masked email, booleans, counts, and stable codes only.
The reviewed bootstrap CLI now reruns the same evidence immediately before the
existing service-only bootstrap RPC. Synthetic bootstrap is forbidden in
production.

The separately authorized production commands are documented in
`OWNER_ADMIN_ACTIVATION_RUNBOOK.md`; they were not executed.

## Second operator and dual control

The minimum second operator is `security_admin` with only
`security.read_audit`, `security.manage_staff`, `security.revoke_staff`, and
`users.revoke_sessions`. A separate identity, password, MFA factor, AAL2
session, and recent authentication are mandatory.

Post-bootstrap `platform_admin` assignment remains request → independent
approval → immutable-fingerprint verification → exact-once execution.
Self-approval, self-escalation, payload mutation, expiry, duplicate execution,
direct grant, and last-admin removal remain denied.

## Database changes

Migration `20260724225105_admin_activation_operations.sql` adds:

- `api.admin_get_owner_bootstrap_readiness(uuid)`;
- `api.admin_get_revocation_worker_runtime_status()`.

Both functions are stable, read-only, security-definer contracts with empty
search paths. Execution is revoked from public/anon/authenticated and granted
only to `service_role`. No table, policy, browser grant, worker schedule, or
domain mutation was added.

## Manual worker operations

The server-only entry point supports:

```text
bun run admin:revocation-worker --once
bun run admin:revocation-worker --status
bun run admin:revocation-worker --replay="<request-id>"
```

It enforces exact environment/ref guards, bounded batch/lease values,
production confirmation, one-record replay confirmation, credential-free
reasons, sanitized output, and the existing lease/retry/idempotency semantics.
The previous command remains a compatibility wrapper for one bounded run.

## Admin Console contract

The frozen contract covers access, home, staff, exact eligibility,
assignments/history, platform requests, approvals, audit, security/revocation,
worker health, emergency confirmation, MFA/recent-auth, denied/revoked,
unavailable, loading, empty, success, and error states.

The functional shell gained stable contract-driven navigation, semantic route
boundaries, assignment history, revocation status lookup, FR/AR/RTL copy, and
browser hooks. Server loaders/RPCs remain authoritative; no consumer-nav entry
or broad visual redesign was added.

## Staging rehearsal

Preflight:

- project `srdrflfrfpwixsllveid`: `ACTIVE_HEALTHY`;
- Auth users/sessions/MFA: `0/0/0`;
- principals/assignments/approvals: `0/0/0`;
- revocation requests/worker runs: `0/0`;
- one retained Phase 7A audit row: synthetic and within 30 days;
- no cron catalog/schedule.

Four transactionally isolated suites passed on Staging V2:

1. authorization/owner/operator/dual-control/emergency lifecycle;
2. control-plane/manual worker lease, stale recovery, completion, and audit;
3. Phase 7C identity/role/emergency safeguards;
4. Phase 7D owner readiness and trusted runtime status.

Together they covered owner bootstrap/idempotency/audit, a narrow
`security_admin`, independent request/approval/execution, self-approval and
payload-mutation denial, duplicate execution denial, stale recent auth,
missing MFA/AAL1, last-admin protection, immediate canonical denial,
provider-bounded outbox completion, and correlated audit evidence.

All synthetic fixtures rolled back. Post-rehearsal exact counts remain:

- Auth users/sessions/MFA: `0/0/0`;
- principals/assignments/approvals: `0/0/0`;
- revocation requests/worker runs: `0/0`;
- retained synthetic audit rows: `1` (the pre-existing Phase 7A event).

The new RPC grants were independently verified:

- service role execute: yes;
- authenticated execute: no.

## Validation

- migration validation: pass, 35 migrations;
- clean local replay: pass;
- pgTAP/RLS: pass, 432 tests across 22 files;
- database lint: pass, zero schema errors;
- generated types: synchronized;
- application/unit tests: pass, 385 tests across 73 files;
- focused Phase 7D TypeScript tests: pass;
- backend Python tests: pass, 69 tests;
- Python compilation: pass;
- typecheck: pass;
- production build: pass;
- lint: pass with zero errors and 11 pre-existing Fast Refresh warnings;
- secret scan: pass;
- targeted formatting: pass;
- Staging V2 synthetic rehearsal: pass;
- staging cleanup/exact-zero active Admin state: pass;
- security/performance advisors: no Phase 7D object finding; existing project
  notices remain informational.

## Provider limitation

Supabase's supported Admin API used here does not provide arbitrary-user
global sign-out by UUID. BotolaGO therefore guarantees immediate canonical
Admin denial, queues the supported provider action, and reports the provider
outcome honestly. Existing consumer sessions may remain but cannot authorize
an Admin RPC after principal/assignment revocation.

## Rollback

Rollback is forward-only:

1. keep real owner activation and schedules disabled;
2. stop using the new trusted commands;
3. revoke/drop the two read-only RPCs in a reviewed forward migration if
   necessary;
4. restore the previous CLI wrapper while retaining all authorization and
   audit state;
5. preserve append-only security evidence.

No schema/data destruction, legacy reconciliation, or production mutation is
required.

## Next recommendation

After Phase 7D review, separately authorize real owner readiness/bootstrap and
second-operator establishment on the exact Production V2 project. Only after
that operational activation is proven should a new phase begin for Editorial
CMS backend mutations. That phase must reuse the frozen Admin authority,
dual-control, audit, idempotency, and recent-auth contracts and must not
broaden security roles implicitly.
