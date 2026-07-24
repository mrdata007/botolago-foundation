# Admin Control Plane API Contracts

Phase: 7B
Authority: Supabase Auth identity plus canonical `app_private` staff state
Transport: controlled `api` RPCs and TanStack server functions
Default cache policy: `private, no-store`

No contract in this document grants authority from user metadata, profiles,
route state, client storage, email domains, or client clocks.

## Current staff context

### `api.get_my_staff_context()`

Caller: `authenticated`
Permission: current active staff principal
MFA: context reports enrollment/AAL; the Admin shell requires AAL2
Recent auth: context reports a server-derived 15-minute result
Audit: read only; no event

Response:

```ts
{
  isStaff: true
  staffPrincipalId: UUID
  status: "active" | "suspended" | "revoked"
  roles: Array<{ name: AdminRole; expiresAt: Timestamp | null }>
  permissions: AdminPermission[]
  emailVerified: boolean
  mfaRequired: boolean
  mfaEnrolled: boolean
  currentAal: "aal1" | "aal2"
  recentAuthRequired: true
  recentAuthSufficient: boolean
  recentAuthWindowSeconds: 900
  pendingSessionRevocation: boolean
  pendingSessionRevocationCount: number
  accessAllowed: boolean
  suspended: boolean
  revoked: boolean
  cachePolicy: "private, no-store"
}
```

Anonymous callers cannot execute the RPC. Normal authenticated non-staff
callers receive `staff_access_denied`. The DTO contains no unrelated staff
record, Auth metadata, or profile authority.

## Protected Admin shell

### `loadAdminRouteAccess`

Transport: TanStack server function, `POST`
Authentication: bearer token attached by the existing global client
middleware and verified server-side with Supabase Auth
Cache: not cacheable
Database: invokes `get_my_staff_context` as the verified user

Stable route states:

- `unauthenticated`
- `forbidden`
- `mfa_required`
- `recent_auth_required`
- `suspended`
- `revoked`
- `backend_unavailable`
- `authorized`

The authorized response contains a masked version of the caller's own email,
their Auth UUID, and the bounded staff-context DTO. It never contains an
access token, refresh token, Auth provider metadata, or service credential.

## Assignment review

### `api.admin_list_staff_assignments(...)`

Permission: `security.manage_staff`
MFA: AAL2
Recent auth: not required for read
Page size: 1–100, default 50
Order/cursor: `(created_at, id)` descending

Filters:

- role name;
- principal status (`active`, `suspended`, `revoked`);
- effective assignment status (`active`, `expired`, `revoked`).

Items contain principal/assignment UUIDs, safe status, role, time bounds,
grantor principal UUID, bounded reason/reference, role permission summary,
and pending-revocation state. Full emails and Auth metadata are omitted.

### `api.admin_get_staff_principal(uuid)`

Permission: `security.manage_staff`
MFA: AAL2
Recent auth: not required for read

Returns a single safe principal summary or `assignment_not_found`. Lookup is
by immutable principal UUID only.

The Phase 7A assignment history and mutation contracts remain unchanged:

- `admin_list_assignment_history`
- `admin_assign_role`
- `admin_revoke_role`
- `admin_renew_role`
- `admin_suspend_staff`
- `admin_restore_staff`
- `admin_emergency_revoke_staff`

Mutations retain their Phase 7A permission, MFA, recent-auth, approval,
idempotency, and audit requirements.

## Approval queue

### `api.admin_list_approval_queue(...)`

Scopes:

- `requested_by_me`: active staff may read their own requests;
- `actionable`: requires `security.manage_staff`, omits self-requested items,
  and includes only requests whose required permission the caller still has;
- `all_visible`: requires `security.manage_staff`.

Filters:

- approval status;
- execution status;
- target domain.

Page size: 1–100, default 50
Order/cursor: `(requested_at, id)` descending

DTO fields include request UUID, effective status, operation type, safe
target identifiers, SHA-256 payload fingerprint, required permission,
requester/decider/executor principal UUIDs, bounded reason, expiry,
execution state, and correlation UUID. The payload and Auth metadata are not
returned.

Existing Phase 7A operations:

- `admin_approve_request`
- `admin_reject_request`
- `admin_cancel_request`
- `admin_execute_approved_platform_admin`

They recheck the immutable fingerprint, permission, AAL2, recent
authentication where required, non-self approval, and idempotency. Every
accepted transition appends audit evidence. Duplicate execution returns
`operation_already_executed` or the original idempotent response.

## Audit inspection

### `api.admin_list_audit_events_v2(...)`

Permission: `security.read_audit`
MFA: AAL2
Recent auth: not required for bounded read
Default window: previous 24 hours
Maximum window: 31 days
Page size: 1–100, default 50
Order/cursor: `(occurred_at, id)` descending

Filters:

- from/to timestamp;
- actor principal UUID;
- action;
- target domain;
- target entity type;
- outcome;
- correlation UUID;
- approval UUID;
- synthetic marker.

Only allowlisted safe before/after summary keys are returned. The API has no
update, delete, raw metadata, unbounded list, or export operation. The Phase
7A retained staging event remains distinguishable through
`syntheticTest=true`.

## Role and permission catalog

### `api.admin_list_role_catalog()`

Caller: active staff with verified MFA/AAL2
Mutation: none

Returns role name, localization label/description keys, assigned permission
names, high-privilege flag, dual-control flag, recent-auth flag, and MFA/AAL2
flag. Role and permission definitions remain server-controlled.

## Revocation status and worker health

### `api.admin_get_session_revocation_status(uuid)`

Permission: `security.manage_staff`
Returns bounded queue counts and the latest sanitized request state for one
staff principal.

### `api.admin_get_revocation_worker_health()`

Permission: `security.read_audit`
Returns queue counts and at most ten sanitized run summaries. Worker IDs,
error bodies, credentials, tokens, and raw provider responses are omitted.

## Trusted worker contracts

These functions are executable by `service_role` only:

| RPC                                           | Purpose                                             |
| --------------------------------------------- | --------------------------------------------------- |
| `admin_start_session_revocation_worker`       | Start or heartbeat one bounded worker run           |
| `admin_claim_session_revocations_v2`          | Claim a leased batch using `FOR UPDATE SKIP LOCKED` |
| `admin_complete_session_revocation_v2`        | Idempotently complete the current lease             |
| `admin_fail_session_revocation`               | Schedule retry or terminal dead letter              |
| `admin_replay_session_revocation_dead_letter` | Explicit trusted replay                             |
| `admin_finish_session_revocation_worker`      | Close the private run ledger                        |

The old non-leased Phase 7A claim/complete functions remain for migration
compatibility but have no service-role execute grant.

Batch size is capped at 50, lease duration at 30–600 seconds, attempts at
1–10, and one invocation at 20 batches. Lease tokens are database worker
coordination identifiers; they are not Auth tokens.

Retryable classes are network failure, timeout, Auth 429, and Auth 5xx.
Permanent classes are denied/misconfigured Auth Admin access and malformed
outbox records. Backoff is bounded exponential delay with deterministic
jitter. Dead letters require explicit replay.

Supported Supabase Auth Admin currently has no global sign-out-by-user-UUID
operation. The worker uses `auth.admin.getUserById` to classify missing users
and records completion of the already-enforced privileged-access revocation.
It does not write Auth tables, store user JWTs, change passwords, or delete
users. Consumer Auth sessions may remain, but every Admin RPC denies revoked
authority synchronously.

## Stable errors

- `admin_context_unavailable`
- `unauthenticated`
- `staff_access_denied`
- `staff_suspended`
- `staff_revoked`
- `permission_missing`
- `mfa_required`
- `mfa_assurance_insufficient`
- `recent_auth_required`
- `assignment_not_found`
- `assignment_conflict`
- `approval_not_found`
- `approval_expired`
- `approval_conflict`
- `approval_payload_mismatch`
- `self_approval_forbidden`
- `operation_already_executed`
- `audit_access_denied`
- `revocation_request_not_found`
- `revocation_already_processed`
- `revocation_temporary_failure`
- `revocation_permanent_failure`
- `worker_unavailable`

Raw Supabase, PostgreSQL, Auth, and worker errors never cross repository or
route boundaries.
