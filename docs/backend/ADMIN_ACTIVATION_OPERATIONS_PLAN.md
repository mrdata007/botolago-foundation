# Admin Activation Operations Plan

Status: Phase 7D implementation authority

Base commit: `c5a26b8d31e324cc89d5114205817a4a683a3be3`

Staging target: BotolaGO Staging V2 (`srdrflfrfpwixsllveid`)

Production V2 and Legacy: excluded until a separately authorized owner
activation

Phase 7D proves that the Phase 7A–7C Admin security contracts can be operated
by real people. It adds trusted readiness and worker-operation tooling, freezes
the Admin Console integration contracts, and rehearses the complete security
lifecycle with deterministic Staging V2 identities.

It does not activate a real owner, create a default credential, start a worker
schedule, implement Editorial CMS or domain corrections, expose service
credentials, add consumer navigation, or replace the server-owned
authorization model.

## 1. Real owner account prerequisites

The owner first creates an ordinary BotolaGO Auth account through the normal
product flow. Before bootstrap, the account must have:

- exactly one normalized Auth email match;
- a verified email;
- at least one verified MFA factor;
- a current Supabase Auth access token at AAL2;
- no conflicting staff principal;
- no conflicting active `platform_admin` assignment.

The owner email and access token are runtime-only inputs. They never appear in
source, command output, logs, screenshots, CI artifacts, or shared documents.
The readiness command masks the email and returns only boolean checks and
stable codes.

## 2. Owner bootstrap lifecycle

Bootstrap remains the reviewed one-time `admin_bootstrap_first_platform_admin`
contract:

1. run read-only owner readiness;
2. independently verify the exact Auth user, verified email, verified MFA, and
   current AAL2 session;
3. require an explicit target environment and project-ref match;
4. invoke the trusted bootstrap RPC with the immutable Auth UUID;
5. create exactly one principal and one `platform_admin` assignment;
6. write one append-only bootstrap audit event;
7. return stable IDs without returning credentials;
8. repeat safely as an idempotent verification;
9. remove the credential handoff immediately.

No browser path invokes bootstrap. No user, password, MFA factor, or hidden
administrator is created by the command.

## 3. Bootstrap credential lifecycle

Trusted commands use a dedicated server-only Supabase Secret key or the
existing server-only worker key. Keys are injected into an owner-controlled
process, never passed as command-line arguments, and never printed.

The owner access token is supplied through `OWNER_ADMIN_ACCESS_TOKEN` only for
the command invocation. It proves the current user identity and AAL2 session;
it is not stored, echoed, serialized, or included in errors.

Runtime guard variables identify:

- `BOTOLAGO_ADMIN_ENVIRONMENT`;
- `BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF`;
- the derived project ref from `SUPABASE_URL`.

Production is fail-closed unless the command receives the exact, separately
documented production confirmation. Staging and local commands reject a URL
whose project ref does not match the explicit expected ref.

After bootstrap, the operator clears the environment, closes the trusted
terminal, verifies that shell history contains no secret assignment, and
restricts or deletes the temporary key according to the owner runbook.

## 4. Second-operator establishment

The minimum second operator is a distinct human with `security_admin`, not a
second unrestricted `platform_admin`.

The second operator must have:

- a separate Auth UUID and verified email;
- separate credentials and MFA factor;
- an AAL2 session with recent authentication;
- a staff principal created by the owner;
- one explicit `security_admin` assignment;
- no implicit domain mutation permissions.

The server role catalog remains authoritative. The second operator can manage
approved standard staff roles, inspect eligible staff-security approvals,
approve or reject high-risk staff requests where the permission matrix allows,
inspect security audit evidence, and participate in recovery. They cannot
directly assign `platform_admin`, approve their own request, bypass the last
administrator safeguard, or mutate Editorial, Football, Fantasy,
Notifications, or support domains.

## 5. Dual-control operating model

Post-bootstrap `platform_admin` assignment always requires:

1. one qualified requester;
2. an immutable canonical payload and fingerprint;
3. a different qualified approver;
4. verified MFA, AAL2, and recent authentication at each sensitive transition;
5. request expiry and execution-time eligibility checks;
6. exactly-once execution with correlated audit evidence.

Either the owner may request and the second operator approve, or the second
operator may request and the owner approve when both current permissions allow
the transition. Self-approval is always denied. Direct grant paths remain
closed.

The complete operating matrix is frozen in
`docs/backend/ADMIN_DUAL_CONTROL_MATRIX.md`.

## 6. MFA enrollment and recovery

Supabase Auth owns MFA enrollment, challenge, verification, and factor
recovery. BotolaGO treats only factors with `status = verified` as eligible.
AAL2 is taken from a verified current Supabase session, never inferred from
client state or factor presence alone.

Every human administrator should enroll two independently controlled factors
where the hosted configuration permits it. Recovery removes or replaces a
factor through Supabase Auth; it does not alter staff roles. A recovered user
must establish a fresh AAL2 session and pass recent-auth checks before any
sensitive Admin mutation.

No TOTP secret, challenge code, recovery material, or factor payload may be
logged by BotolaGO tooling.

## 7. Recent-authentication operating procedure

Sensitive database operations use the server-owned 15-minute window based on
the current `auth.sessions.created_at`. Token refresh cannot extend it.

When `recent_auth_required` is returned:

1. discard the attempted mutation result;
2. reauthenticate through Supabase Auth;
3. complete MFA and obtain AAL2;
4. reload the canonical Admin context;
5. re-enter or re-submit the operation;
6. allow the server to revalidate the current target, payload, permission, and
   approval state.

Phase 7D deliberately does not retain and automatically replay a privileged
browser payload after reauthentication.

## 8. Emergency revocation procedure

Emergency revocation is a canonical database authorization operation:

1. a qualified operator confirms the exact target and reason;
2. the server locks the target and applies the last-platform-admin safeguard;
3. the principal becomes revoked and active assignments are revoked;
4. all later Admin checks fail immediately;
5. one deduplicated session-revocation request is queued;
6. the mutation, outbox, worker, and audit records share correlation evidence;
7. a trusted worker processes only the supported provider action.

The consumer Auth session may continue to exist. It cannot authorize an Admin
operation because every Admin RPC revalidates current principal and assignment
state plus the session ID.

The exact drill is documented in
`docs/backend/ADMIN_EMERGENCY_REVOCATION_RUNBOOK.md`.

## 9. Manual revocation-worker procedure

Phase 7D exposes one server-only operator entry point:

```text
bun run admin:revocation-worker --once
bun run admin:revocation-worker --status
bun run admin:revocation-worker --replay="<request-id>"
```

- `--once` runs the existing bounded worker with the existing lease and retry
  contracts.
- `--status` calls a new service-only, read-only bounded status RPC.
- `--replay` calls the existing service-only replay RPC for exactly one dead
  letter, with a credential-free runtime reason and explicit replay
  confirmation.

Staging is the default allowed hosted environment. Production requires a
separately authorized exact confirmation. The command never accepts a key,
token, or password in its argument list.

## 10. Dead-letter inspection and replay procedure

Status reports only aggregate queue counts and the last ten safe worker runs.
It contains no user email, token, session payload, worker lease token, or raw
provider error.

Before replay, the operator:

1. inspects the stable error code;
2. fixes the documented configuration or provider cause;
3. records an approved credential-free reason;
4. verifies that the request remains a dead letter;
5. supplies the exact request UUID and replay confirmation;
6. invokes one replay;
7. runs one bounded worker invocation;
8. verifies the correlated audit result.

Repeated or bulk replay is not supported by the command.

## 11. Admin-access recovery procedure

Loss of a factor does not authorize a role bypass. Recovery paths are:

- restore Auth access through the owner-controlled Supabase recovery process;
- enroll and verify a replacement factor;
- create a fresh AAL2 session;
- verify current canonical staff state;
- have the other qualified operator restore a suspended principal or request a
  reviewed assignment according to the permission matrix.

If every platform administrator is unavailable, Phase 7D provides no online
break-glass bypass. Recovery requires a separately authorized trusted database
procedure and incident evidence. The one-time bootstrap must not be reused as
an informal recovery tool.

## 12. Last-platform-admin safeguard

Revoking an assignment, suspending a principal, or emergency-revoking a
principal must not remove the last effective `platform_admin`. The database
owns this invariant and checks it inside the mutation transaction.

UI warnings and operator runbooks explain the condition, but they are not the
security boundary. There is no Phase 7D flag, force option, or hidden RPC that
bypasses the safeguard.

## 13. Break-glass limitations

Phase 7D has no browser-accessible break-glass feature. A real incident may
require a separately authorized, time-bounded direct operator procedure. Such
a procedure must:

- identify the exact project and incident;
- require two humans where possible;
- retain database and platform audit evidence;
- avoid creating a shared account or default password;
- restore the standard role/approval model immediately;
- be reviewed after the incident.

This phase does not implement or activate that procedure.

## 14. Admin Console route and permission map

The frozen security console uses:

| Route                       | Primary permission          | Scope                           |
| --------------------------- | --------------------------- | ------------------------------- |
| `/admin`                    | any active Admin permission | access gate and safe home       |
| `/admin/staff`              | `security.manage_staff`     | exact lookup and staff creation |
| `/admin/staff/$principalId` | `security.manage_staff`     | assignment and access state     |
| `/admin/approvals`          | `security.manage_staff`     | staff-security dual control     |
| `/admin/audit`              | `security.read_audit`       | read-only audit evidence        |
| `/admin/security`           | `security.revoke_staff`     | queue and worker health         |

The browser never performs authorization by route visibility alone. Each
loader and every mutation independently checks the required server permission.
State-only screens for MFA, recent auth, suspension, revocation, permission
denial, and backend failure are part of the same protected shell.

## 15. Lovable implementation handoff

Lovable may implement only visual composition and interaction against the
frozen routes, DTOs, repository contracts, test IDs, and state models.

Lovable must not:

- create roles or permissions;
- query `auth`, `app`, or `app_private` tables;
- call service-only worker or bootstrap operations;
- retain credentials or privileged pending payloads;
- weaken AAL2 or recent-auth behavior;
- imply provider global sign-out;
- add domain operations;
- link Admin from consumer navigation without a later product decision.

The authoritative handoff is
`docs/admin/LOVABLE_ADMIN_CONSOLE_HANDOFF.md`.

## 16. Staging rehearsal strategy

Staging V2 uses deterministic synthetic owner, second-operator, ordinary-user,
and suspended-user UUIDs. The rehearsal:

1. verifies exact-zero mutable Admin/Auth inventory;
2. creates synthetic Auth users, verified factors, and AAL2 sessions;
3. runs readiness and bootstrap contracts;
4. establishes `security_admin`;
5. executes independent dual control exactly once;
6. proves self-approval, payload mutation, missing MFA, and stale recent auth
   fail closed;
7. emergency-revokes a privileged synthetic user;
8. proves synchronous denial while the consumer session still exists;
9. invokes the worker manually and validates provider-bounded status;
10. verifies audit/outbox correlation;
11. removes mutable synthetic data in bounded order;
12. retains only required audit evidence marked synthetic;
13. verifies exact-zero elevated access.

The real owner account is never used.

## 17. Production activation boundaries

Phase 7D does not select or modify Production V2. A production owner activation
requires a separate instruction that identifies the exact project and
authorizes the manual operation.

Production activation must independently confirm:

- reviewed main commit and migration state;
- hosted MFA policy and owner factor recovery;
- exact project ref;
- owner readiness;
- a second-operator plan;
- no synthetic or conflicting platform administrator;
- credential creation, use, and destruction;
- audit and emergency-revocation verification.

No production worker schedule is enabled by this branch.

## 18. Risks and rollback

Primary risks:

- The owner access token is sensitive. It is runtime-only, masked by process
  discipline, never logged, and immediately cleared.
- Supabase has no supported arbitrary-user global sign-out. Canonical Admin
  denial remains synchronous and provider wording remains bounded.
- A lone owner cannot exercise dual control. A distinct `security_admin` must
  be established promptly after bootstrap.
- A service-only dead-letter replay can be misused by anyone holding the
  secret key. It remains one-record-at-a-time, reasoned, environment-guarded,
  unscheduled, and audited.
- Hosted Auth MFA recovery remains an operator process outside the database.
- The final visual console can accidentally imply authority it does not have.
  The product spec and handoff freeze server ownership and exact states.

Rollback is forward-only:

1. stop using the Phase 7D trusted commands;
2. revoke the two new service-only read RPC grants in a reviewed migration;
3. restore the previous bootstrap CLI if necessary without changing the
   database bootstrap contract;
4. retain all authorization, approval, outbox, and audit evidence;
5. keep production schedules disabled;
6. leave Phase 7A–7C canonical authorization active.

No destructive rollback, real-owner mutation, production deployment, or
legacy reconciliation is required.
