# BotolaGO Admin Control Plane Plan

Status: Phase 7B implementation plan
Branch: `backend/admin-control-plane`
Exact base: `1fa9915cbe2d893b0b40232c2fa4519fe0ea2abf`
Target database for reviewed validation only: BotolaGO Staging V2
(`srdrflfrfpwixsllveid`)

## Scope and invariants

Phase 7B operationalizes the Phase 7A authorization foundation. It does not
add Editorial, Football, Fantasy, Notification, provider, or user-moderation
mutations. It does not create a default administrator, add Admin navigation to
the consumer product, enable a worker schedule, or touch Production V2 or the
Legacy project.

The following invariants apply to every control-plane operation:

- Supabase Auth establishes identity; `auth.uid()`, the verified JWT claims,
  and the live `auth.sessions` row establish the current session.
- `app_private.staff_principals`, current role assignments, and role
  permissions are the only Admin authority.
- User metadata, profile fields, route state, and browser-local values never
  grant Admin access.
- Every browser operation goes through a narrow `api` RPC. There are no direct
  browser grants on `app_private`.
- Every security-sensitive RPC rechecks principal status, current
  assignments, MFA assurance, recent authentication, and the live session as
  required. Revocation therefore denies privileged access immediately,
  independent of an asynchronous worker.
- The service credential exists only in trusted server or worker runtime.
- Audit data is append-only, bounded, sanitized, and permission-protected.
- Production adapters fail closed. Test adapters are dependency-injected and
  can never be selected implicitly in production.

## 1. Admin request lifecycle

```text
browser Supabase session
  -> client middleware attaches the bearer access token
  -> TanStack server function validates the token with Supabase Auth
  -> controlled Admin repository invokes an api RPC as that user
  -> RPC validates live session + principal + permissions + MFA/recent auth
  -> database performs one bounded read or transactional mutation
  -> mutation writes append-only audit evidence
  -> stable provider-independent DTO or stable Admin error
```

The `/admin` route is a minimal integration shell. Its server function is the
authorization boundary for rendering. Browser checks are UX only and never
replace the database checks. The server response uses `Cache-Control:
private, no-store`.

Mutations inherited from Phase 7A continue to use idempotency keys and the
existing approval contract. Phase 7B adds read models and worker operations;
it does not broaden mutation authority.

## 2. Current-staff context lifecycle

The current-staff context is loaded only for the authenticated caller and
contains no unrelated staff data. Resolution is:

1. validate the bearer token server-side;
2. require `auth.uid()` and the JWT `session_id`;
3. verify that the session still exists in `auth.sessions`;
4. find the immutable staff principal by Auth user UUID;
5. evaluate principal state;
6. select only current, active, unexpired assignments;
7. aggregate granular permissions from server-controlled role mappings;
8. calculate verified email, verified MFA enrollment, current AAL, and recent
   authentication from server-controlled Auth data and signed claims;
9. include the count/state of pending session-revocation work;
10. return a bounded DTO.

Anonymous callers receive `unauthenticated`. Authenticated non-staff callers
receive `staff_access_denied`. Suspended and revoked principals receive
explicit stable states without roles or permissions. Expired and revoked
assignments never contribute authority.

Recent authentication uses the latest eligible authentication method
timestamp from the signed JWT `amr` claim and a fixed 15-minute server-side
window. The client cannot supply or extend that timestamp.

## 3. Session-revocation worker architecture

Phase 7A makes privileged revocation synchronous: a revoked assignment or
suspended/revoked principal is denied by every sensitive Admin RPC
immediately. Phase 7B processes the durable outbox and proves the asynchronous
security runtime is healthy.

The supported Supabase Auth API currently provides global sign-out when a
user's access JWT is supplied; it does not provide a supported
service-role operation that globally signs out an arbitrary user by UUID.
Outbox rows intentionally store neither access nor refresh tokens. Phase 7B
will not write directly to Supabase-owned Auth tables, mint substitute JWTs,
change user passwords, or soft-delete users to simulate logout.

Accordingly, the worker uses the supported Auth Admin `getUserById` operation
to distinguish a missing user from a live user and completes durable
**privileged-session invalidation** after confirming that canonical Admin
authority is already revoked. Existing consumer Auth sessions may continue
until normal sign-out/expiry, but cannot access any Admin contract. The
current `session_id` check provides strict denial if a session is separately
globally signed out. If Supabase adds a supported user-ID session-revocation
API later, the injected Auth adapter can adopt it without changing the outbox
contract.

Runtime layers:

- a server-only worker entry point reads sanitized environment configuration;
- a service-role repository claims a bounded batch through a private trusted
  RPC;
- an injected Auth Admin adapter classifies `found`, `not_found`, retryable
  transport/service failure, and permanent credential/configuration failure;
- each request is completed or failed in its own database transaction;
- a run ledger records bounded operational counts and sanitized codes;
- no production schedule is enabled in Phase 7B.

Local and deterministic test invocations use an injected fake Auth adapter.
The protected staging invocation uses only Staging V2 secrets and deterministic
synthetic identities. The future scheduler must invoke the same entry point
with a trusted secret, one environment, a bounded batch, and single-run
concurrency.

## 4. Outbox claim and lease strategy

A small additive migration extends the existing outbox rather than redesigning
the authorization schema.

Each request gains:

- immutable correlation ID;
- lease token and worker identifier;
- lease expiry and last-attempt timestamps;
- next-attempt timestamp;
- bounded maximum attempts;
- result code;
- sanitized last-error summary/code;
- dead-letter timestamp;
- processing completion timestamp.

The claim RPC:

- is executable by `service_role` only;
- accepts a worker ID, batch limit, and bounded lease duration;
- uses `FOR UPDATE SKIP LOCKED`;
- claims eligible `pending`/retryable `failed` rows and expired `processing`
  leases;
- assigns a fresh unguessable lease token;
- increments the attempt counter atomically;
- never returns tokens or raw Auth data.

Completion/failure RPCs require the exact request ID and lease token. A stale
worker cannot complete a request reclaimed by another worker. Completed rows
are never reclaimed. One record's failure cannot roll back another record's
completion.

## 5. Retry and dead-letter strategy

Retryable failures include network timeouts, connection failures, Auth 429,
and Auth 5xx. Backoff is bounded exponential delay plus deterministic jitter,
calculated from request ID and attempt count so retries remain testable.

Permanent failures include invalid worker credentials/configuration,
malformed records, project mismatch, and denied Auth Admin access. A request
is dead-lettered when the error is permanent or the maximum attempt count is
reached. Dead letters require an explicit service-role replay RPC with a
reason and create audit evidence.

Idempotent outcomes are:

- `privileged_access_revoked`: the user exists and canonical Admin authority
  is already denied;
- `already_invalidated`: the request was completed previously or no privileged
  authority remains;
- `user_not_found`: the Auth user no longer exists and no further Auth action
  is required.

Completion, retry scheduling, dead-lettering, replay, and stale-lease recovery
write one correlation-linked audit event per accepted state transition.
Repeated completion attempts return a stable already-processed result and
cannot duplicate audit evidence.

## 6. Assignment-review read models

The assignment review API requires `security.manage_staff` and exposes only
safe operational fields:

- principal UUID and principal status;
- assignment UUID, role name, effective status, start/expiry/revocation time;
- grantor principal UUID;
- safe reason and external reference;
- role/permission summaries;
- pending revocation boolean/count.

It does not expose email, Auth metadata, credentials, tokens, or policy
implementation. Safe lookup is by principal UUID only in Phase 7B.

The collection uses `(created_at, id)` descending keyset pagination, a maximum
page size of 100, and filters for role, principal status, and
active/expired/revoked assignment state. Assignment history is append
preserving and uses the same stable ordering.

## 7. Approval-queue read models

The approval queue exposes three server-derived scopes:

- `actionable`: pending requests the current caller may approve, excluding
  their own requests;
- `requested_by_me`: requests created by the caller;
- `all_visible`: requests visible through the caller's required permission.

Filters cover approval status, execution status, target domain, and bounded
time range. Ordering is `(requested_at, id)` descending with keyset
pagination.

Safe DTOs include the immutable payload fingerprint, target domain and
entity UUID, operation type, requester/decider/executor principal UUIDs,
reason, expiry, execution state, and correlation ID. Raw payloads and Auth
metadata are excluded.

Existing Phase 7A approve, reject, cancel, and approved platform-admin
execution RPCs remain the only mutations. They continue to prevent
self-approval, revalidate the fingerprint, recheck permission/MFA/recent auth,
use idempotency, and append audit evidence.

## 8. Audit-inspection read models

Audit inspection requires `security.read_audit`. It is read-only and has no
delete, update, or export contract.

Supported filters:

- bounded time range (24 hours by default, 31 days maximum);
- actor principal;
- action;
- target domain and entity type;
- outcome;
- correlation ID;
- approval ID;
- synthetic/non-synthetic marker.

Results use `(occurred_at, id)` descending keyset pagination with a maximum of
100 items. Safe before/after values pass through a fixed allowlist and size
bound; arbitrary metadata, tokens, credentials, and full Auth records are
never returned. The retained Phase 7A audit remains visibly synthetic.

## 9. Server-side Admin route protection

The existing TanStack Start function middleware attaches the browser's current
Supabase access token, and server middleware verifies signed claims using the
server-side publishable client.

The `/admin` route calls one server function protected by that middleware.
The function invokes the current-staff-context RPC as the authenticated user
and maps only stable Admin errors into route states:

- unauthenticated;
- non-staff forbidden;
- MFA enrollment/challenge required;
- recent authentication required;
- suspended;
- revoked;
- authorized;
- backend unavailable.

The minimal shell renders French and Arabic copy, applies `dir="rtl"` for
Arabic, and shows only safe identity, roles, permission summary, security
state, and read-only section placeholders. It is not linked from consumer
navigation and contains no domain mutation controls.

## 10. Admin repository/service architecture

```text
route shell
  -> admin route-access server function
    -> AdminControlPlaneService
      -> AdminControlPlaneRepository
        -> api schema RPCs

trusted worker entry
  -> SessionRevocationWorker
    -> SessionRevocationRepository (service-role RPCs)
    -> AuthAdminInspector (supported Auth Admin API)
```

Contracts and Zod schemas define provider-independent DTOs for context,
assignments, approvals, audit, catalog, revocation status, and worker health.
All list operations have explicit filters, keyset cursors, page-size caps, and
optional abort signals. Raw PostgREST/Auth errors are mapped to stable Admin
errors. Production never falls back to a mock repository.

`ADMIN_CONTROL_PLANE_API_CONTRACTS.md` records every RPC, permission,
MFA/recent-auth rule, DTO, pagination rule, error, cache policy, and audit
effect.

## 11. Staging validation strategy

Staging validation occurs only after local gates and pull-request CI review.
Only the reviewed additive migration is applied to
`srdrflfrfpwixsllveid`.

One transaction creates deterministic synthetic Auth/session shapes and staff
records for:

- a normal non-staff user;
- low-privilege staff;
- security administrator;
- suspended staff;
- expired-assignment staff;
- dual-control requester and approver.

Database tests validate context, assignment filters, approval queues, audit
filters, worker claim/lease/stale recovery, direct-table denial, cross-scope
denial, MFA/recent-auth state, and immediate denial after role revocation.
Worker integration uses a deterministic injected Auth adapter unless hosted
Auth configuration permits a supported real API invocation without retaining
credentials.

No real owner account is bootstrapped or altered.

## 12. Synthetic-data cleanup strategy

Cleanup is bounded and ordered:

1. revoke/complete synthetic worker leases;
2. remove mutable synthetic approvals and idempotency rows;
3. revoke and remove synthetic assignments/principals;
4. delete synthetic Auth users through Auth Admin;
5. verify Auth sessions and refresh tokens are zero for those users;
6. verify no active synthetic staff authority, approvals, or revocation work;
7. retain mandatory append-only audit rows with `synthetic_test=true`;
8. verify zero temporary Metrics keys, AWS resources, runtime credentials,
   and session artifacts.

The existing synthetic Phase 7A audit remains retained for 30 days. Cleanup
never deletes legitimate staging users or non-synthetic audit evidence.

## 13. Lovable Admin Console handoff

Lovable receives:

- the protected `/admin` integration shell;
- typed repository/service interfaces;
- localized route-state copy and RTL behavior;
- stable read-only DTOs for context, assignments, approvals, audit, catalog,
  revocation status, and worker health;
- stable errors and pagination cursors;
- explicit placeholders for later read-only screens.

The later visual console must call these repositories and must not infer
authority from route state, JWT user metadata, profile fields, or client
storage. Domain controls require separately reviewed phases and permissions.

## 14. Risks and rollback strategy

### Known risks

- Supabase Auth does not currently expose supported service-role global
  sign-out by arbitrary user UUID. Phase 7B therefore guarantees immediate
  privileged-session denial at every Admin RPC and does not claim that a
  consumer Auth session has been destroyed.
- Hosted MFA behavior depends on project Auth configuration; database and
  route-state tests remain deterministic, while hosted validation records any
  unavailable factor flow honestly.
- Security-definer RPCs are high-risk. Every new function uses an empty
  `search_path`, explicit caller/permission checks, explicit grants, bounded
  inputs, and pgTAP/RLS coverage.
- Audit read models can leak data if summaries are not allowlisted. The API
  returns bounded safe summaries only.
- A worker outage cannot restore revoked authority, but may delay outbox
  completion and operational evidence. Worker health and dead-letter counts
  make this visible.

### Rollback

The migration is additive. Runtime rollback removes the `/admin` route,
repositories, and worker invocation while leaving Phase 7A authorization
enforcement intact. Database rollback revokes new RPC execute grants first,
then drops only Phase 7B overloads/functions, worker-ledger objects, indexes,
and additive columns after preserving required audit evidence. Existing Phase
7A tables, assignments, audit rows, and mutation contracts are never deleted.

No production schedule exists to disable. Production V2 and Legacy remain
untouched.

## First real administrator procedure (document only)

Phase 7B does not execute this procedure:

1. register a normal BotolaGO account;
2. verify its email;
3. enroll and verify MFA;
4. confirm the session reaches AAL2;
5. run the trusted bootstrap CLI against the explicitly selected environment;
6. verify current staff context;
7. verify `/admin` access;
8. verify the bootstrap audit event;
9. remove or restrict bootstrap credentials;
10. test and confirm the emergency-revocation procedure.

No owner email or password is stored in code or documentation.
