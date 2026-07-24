# Admin Security Operations Plan

Status: Phase 7C implementation authority

Base commit: `5358a2ffcb731358e4aad102f4ca233809c4fa3c`

Target: BotolaGO Staging V2 (`srdrflfrfpwixsllveid`)
Production and Legacy: out of scope

Phase 7C makes the Phase 7A authorization foundation and Phase 7B control
plane operational for staff security administration. Supabase Auth remains the
only identity, credential, email-verification, MFA, and session authority.
Canonical staff authorization remains private to PostgreSQL. The browser uses
only controlled `api` RPCs and never queries `auth`, `app`, or `app_private`
tables.

This phase deliberately excludes Editorial CMS mutations, Football or Fantasy
corrections, notification campaigns, support account operations, provider
activation, production schedules, and the final visual Admin Console.

## 1. Staff-management mutation lifecycle

Every staff mutation follows one server-controlled lifecycle:

1. authenticate the caller through Supabase Auth;
2. resolve the current Auth session from the JWT `session_id`;
3. require a verified email, a verified MFA factor, and AAL2;
4. require the operation's explicit permission;
5. require server-measured recent authentication for sensitive operations;
6. validate a UUID idempotency key, reason, target, role, and timestamps;
7. lock the target record and any safety invariant affected by the mutation;
8. revalidate target eligibility and authorization inside the transaction;
9. perform one canonical mutation;
10. append a privileged audit event;
11. enqueue one deduplicated session-revocation request when access changed;
12. return a bounded provider-independent DTO.

Idempotency is semantic rather than last-write-wins. Reusing a key for the same
operation returns its existing result. Reusing it for a different payload
returns `idempotency_conflict`. Revoked and expired assignment history remains
immutable.

## 2. Staff lookup and identity-resolution strategy

`api.admin_resolve_staff_user_exact` is the only browser-callable identity
resolution operation. It is a `security definer` RPC restricted to
authenticated callers and it rechecks `security.manage_staff`, AAL2, and recent
authentication.

The input is one normalized exact email. The database compares the normalized
email case-insensitively against `auth.users`; no prefix, substring, fuzzy,
directory, or list operation exists. The operation returns:

- `found` and a stable error code when no eligible result exists;
- the canonical Auth UUID only to the authorized caller;
- a masked email rather than the full stored address;
- email-verification and verified-MFA state;
- the existing principal state, if any;
- bounded active and historical assignment summaries.

It never returns passwords, password hashes, tokens, sessions, identities,
provider metadata, recovery data, or private Auth metadata. Every authorized
lookup, including not-found and ambiguous outcomes, appends an audit event. A
structured not-found result is used so the audit write is not rolled back by a
raised exception; the repository maps it to `staff_user_not_found`.

## 3. Role-assignment rules

Principal creation is separate from role assignment. A principal is an
identity record, not an authorization grant.

Directly assignable standard roles are:

- `editor`
- `publisher`
- `content_admin`
- `football_operator`
- `fantasy_operator`
- `notification_operator`
- `support_agent`
- `moderator`

An active `security_admin` may assign these roles. The server-controlled role
catalog is authoritative; clients cannot submit permission sets.

`security_admin` is privileged and may be assigned directly only by an active
`platform_admin`. This prevents a security administrator from cloning their
own authority while avoiding a dual-control deadlock for bootstrapping the
second qualified platform approver.

`platform_admin` is never directly assignable after the one-time trusted
bootstrap. It always uses the approval-execution path described below.

Assignments:

- require an existing active principal;
- reject self-expansion;
- use server time for effectiveness and expiry;
- reject expiry at or before server time;
- preserve grantor, reason, reference, and renewal ancestry;
- never bypass a suspended or revoked principal;
- enqueue privileged-session invalidation after effective-access changes.

Renewal creates a replacement ledger row and expires the old row. Shortening
expiry only moves an active assignment's future expiry earlier. Neither
operation can reactivate a revoked assignment.

## 4. High-privilege dual-control rules

All post-bootstrap `platform_admin` grants require dual control:

1. a qualified requester resolves an eligible target and creates an immutable
   `staff.assign_platform_admin` request;
2. the canonical payload contains only target Auth UUID, role, and optional
   assignment expiry;
3. the database stores a SHA-256 payload fingerprint;
4. a different qualified active principal reviews the same fingerprint;
5. approval is bounded by server time and request expiry;
6. execution rechecks requester authority, approver authority, target
   verification, target MFA, caller recent authentication, expiry,
   fingerprint, target principal state, and assignment conflicts;
7. one row-level lock plus execution state makes execution exactly once;
8. the execution result and full transition audit are retained.

Neither an existing `platform_admin` nor service-shaped browser input bypasses
dual control. The direct assignment RPC rejects `platform_admin` even when an
approval ID is supplied. Only the dedicated execution RPC can create it.

The first-administrator bootstrap remains the one-time exception. It is a
trusted operator command, creates no Auth user or MFA factor, and permanently
refuses normal operation after the first platform administrator exists.

## 5. Revocation and suspension semantics

Revoking one assignment:

- makes it ineffective immediately in canonical authorization;
- retains its immutable history;
- requires `security.revoke_staff`, AAL2, recent authentication, and a reason;
- is idempotent;
- enqueues one session-revocation request;
- writes a privileged audit event.

Suspension changes the principal state to `suspended`, immediately denying
every Admin RPC before any worker runs. Assignment rows are retained.
Restoration only returns the principal to `active`; expired assignments are
marked expired first, and revoked or expired assignments are never revived.

Emergency revocation sets the principal to `revoked`, revokes every currently
active assignment, and enqueues invalidation work atomically. It is fail
closed and independent of a worker for authorization denial.

The last effective `platform_admin` cannot be revoked, suspended, or
emergency-revoked. Operations acquire one transaction advisory lock and count
active, non-suspended, non-revoked platform administrators at server time.
Phase 7C adds no online break-glass bypass. Disaster recovery uses the
separately reviewed trusted bootstrap/recovery procedure and direct operator
authorization.

User-facing language is exact:

- privileged Admin access is revoked synchronously;
- session invalidation is requested where supported.

No operation claims arbitrary-user global Supabase session deletion.

## 6. Privileged-access invalidation semantics

Admin authorization is evaluated from current canonical principal and
assignment rows on every RPC. It does not depend on long-lived role claims in a
JWT, so revocation and suspension take effect synchronously.

Access-changing mutations enqueue a deduplicated
`staff_session_revocation_requests` item. Phase 7B's trusted worker may inspect
the Auth user and perform only supported Auth Admin operations. Since arbitrary
user global sign-out is not a supported Supabase Admin operation, consumer Auth
sessions may remain. Worker status must distinguish:

- queued;
- processing;
- completed supported action;
- retry scheduled;
- dead-lettered;
- provider operation unsupported.

No token or credential is stored in the outbox, audit ledger, logs, or DTOs.

## 7. Approval execution lifecycle

Approval operations are limited to `staff.assign_platform_admin` in Phase 7C.
Requests have `pending`, `approved`, `rejected`, `cancelled`, or `expired`
decision state and `not_started`, `executing`, `executed`, or
`execution_failed` execution state.

Request creation, approval, rejection, cancellation, and execution each:

- recheck the transition's permission, MFA, and recent-auth rule;
- lock the approval row;
- validate current state and expiry;
- preserve the immutable payload and fingerprint;
- append an audit event;
- return a safe target summary.

Only the requester may cancel a pending request. Requester and approver must be
different. Execution is idempotent only for an identical idempotency key and
fingerprint. An already executed request returns its retained result rather
than executing again. Payload mutation returns `approval_payload_mismatch`.

## 8. Recent-auth and MFA revalidation

MFA policy requires:

- a verified MFA factor on the Auth user;
- JWT AAL2;
- a current Auth session owned by the caller.

Sensitive staff mutations require a session created within the server-owned
15-minute window. The client cannot extend or calculate this window. An
expired window returns `recent_auth_required`.

The Admin shell uses Supabase Auth's existing MFA and reauthentication
capabilities. It retains no password, nonce, access token, or refresh token in
application state or logs. Phase 7C does not silently replay a privileged
payload after reauthentication. The administrator re-submits, and the server
revalidates the complete operation.

## 9. Session-revocation outbox integration

Role revocation, assignment replacement, expiry shortening, suspension,
emergency revocation, and security-sensitive grants enqueue bounded,
deduplicated outbox work. The request carries only:

- staff principal and target Auth UUID;
- operation reason and correlation identifiers;
- status, lease, retry, and timing metadata;
- a safe provider result classification.

The service-role-only worker claims bounded batches with
`FOR UPDATE SKIP LOCKED`, recovers stale leases, applies capped retries, and
dead-letters terminal work. Browser roles cannot start, claim, complete, fail,
or replay work. Staging manual invocation uses the protected operator workflow;
no production schedule is activated.

## 10. Functional Admin route design

The protected Admin shell gains:

- `/admin/staff`
- `/admin/staff/$principalId`
- `/admin/approvals`
- `/admin/audit`
- `/admin/security`

Routes are verification surfaces, not the polished Admin Console. Each route
loads the current staff context server-side and declares an explicit
permission. Suspended, revoked, non-staff, insufficient-MFA, and insufficient
recent-auth states fail closed.

The shared layout is mobile-first, keyboard accessible, uses visible focus
styles and minimum 44 px controls, and supports French and Arabic with RTL.
Loading, empty, and stable localized error states are explicit. No Admin link
is added to consumer navigation.

Controls use server functions and the Admin repository. Route components never
query Supabase directly. `/admin/security` exposes safe worker health only and
cannot invoke the service-role worker.

## 11. Audit requirements

Privileged audit is append-only and server-written. Phase 7C records:

- exact identity lookup outcome;
- principal creation;
- role assignment, renewal, expiry shortening, and revocation;
- suspension, restoration, and emergency revocation;
- every approval transition and execution;
- outbox correlation for access-changing operations.

Events include actor, effective roles and permissions, action, target,
required reason, request/correlation/idempotency identifiers, approval
identifier, safe before/after summaries, environment, outcome, and stable error
code. They exclude credentials, tokens, unmasked emails, raw Auth/provider
payloads, and private approval payloads.

Synthetic staging evidence is explicitly marked `synthetic_test` and follows
the documented retention policy.

## 12. Error contracts

The Admin boundary maps database, Auth, PostgREST, and worker failures to stable
codes:

- `staff_user_not_found`
- `staff_user_ambiguous`
- `staff_user_not_verified`
- `staff_user_mfa_required`
- `staff_principal_already_exists`
- `staff_principal_not_found`
- `staff_principal_suspended`
- `staff_principal_revoked`
- `role_assignment_not_found`
- `role_assignment_conflict`
- `role_assignment_expired`
- `role_assignment_already_revoked`
- `role_not_assignable`
- `self_escalation_forbidden`
- `last_platform_admin_required`
- `approval_required`
- `approval_not_found`
- `approval_expired`
- `approval_payload_mismatch`
- `self_approval_forbidden`
- `operation_already_executed`
- `recent_auth_required`
- `mfa_required`
- `mfa_assurance_insufficient`
- `idempotency_conflict`
- `revocation_queued`
- `revocation_provider_unsupported`
- `worker_unavailable`

Raw PostgreSQL, Supabase, Auth, worker, or internal schema details never cross
the repository boundary.

## 13. RLS and grants

All existing Admin tables remain in `app_private`, have RLS enabled and
forced, and have no browser table privileges. Phase 7C needs no public product
table and introduces no direct table grant.

Only named `api` functions are executable by `authenticated`; each function
rechecks authorization server-side. Anonymous execution is revoked. Worker
contracts remain service-role-only. Function `search_path` is empty and all
objects are schema-qualified.

Tests verify:

- anonymous and ordinary-user denial;
- cross-role denial;
- no direct private table select or mutation;
- no browser approval, audit, assignment, or worker writes;
- controlled mutation success;
- mandatory audit evidence.

## 14. Staging validation

After local review and green CI, reviewed migrations are applied only to
BotolaGO Staging V2. Deterministic synthetic identities cover non-staff,
editor, security administrator, platform requester, platform approver,
suspended principal, and expired assignment cases.

Validation covers exact resolution, principal creation, role lifecycle,
dual-control execution, last-admin protection, suspension/restoration,
immediate denial, recent-auth and MFA enforcement, outbox creation, trusted
worker classifications, route access, approval lifecycle, audit visibility,
and direct-table denial.

Production V2 and Legacy are never selected or modified.

## 15. Synthetic cleanup

Cleanup is bounded and ownership-specific:

1. revoke synthetic privileged access;
2. process or remove synthetic mutable outbox work;
3. delete synthetic Auth sessions and users through trusted Admin paths;
4. remove synthetic mutable principals, assignments, approvals, and worker
   runs where retention permits;
5. retain required audit rows with `synthetic_test = true`;
6. verify zero active synthetic principal, assignment, approval, revocation,
   or worker-run state;
7. verify no temporary Metrics key, AWS resource, credential, session cache, or
   artifact remains.

Legitimate staging staff and non-synthetic audit evidence are excluded.

## 16. Lovable handoff

The frontend contract is additive and isolated under `/admin`. Existing
consumer UI and navigation remain frozen. Lovable receives:

- stable TypeScript DTOs and errors;
- repository/service methods;
- protected route loaders and server functions;
- functional French/Arabic route surfaces;
- no service-role or Auth-admin client;
- no direct database queries in components.

The branch remains in a working state and published history is never rewritten.
Phase 7D may polish the Admin Console only after Phase 7C is reviewed.

## 17. Risks and rollback

Primary risks:

- Supabase does not expose a supported arbitrary-user global sign-out Admin
  operation. Canonical Admin denial is synchronous; worker status remains
  truthful about provider limitations.
- Email exact lookup is sensitive. It is permission-gated, recent-auth-gated,
  masked, bounded to one result, and audited.
- Dual control can deadlock if only one platform administrator exists.
  `security_admin` can be created only by that platform administrator, after
  which two qualified principals can approve future platform grants.
- A last-admin safeguard can block ordinary emergency action. Phase 7C
  intentionally has no online bypass; recovery requires a separately
  authorized trusted operator procedure.
- Hosted Auth schema behavior may evolve. No custom Auth objects or browser
  Auth-table access are introduced.

Rollback is additive and contract-safe: stop using the Phase 7C routes and
RPCs, revoke their execute grants in a reviewed forward migration, and restore
the Phase 7B function definitions from source if necessary. Existing immutable
assignments, approvals, audits, and revocation evidence are retained. No
destructive down migration, production schedule activation, or legacy
reconciliation is part of rollback.
