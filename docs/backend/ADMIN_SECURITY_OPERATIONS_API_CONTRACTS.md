# Admin Security Operations API Contracts

Authority: Supabase Auth plus canonical `app_private` staff state

Exposure: controlled `api` RPCs only

Browser tables: none
Worker: service-role only; no production schedule

All authenticated operations require an existing current Auth session, verified
email, verified MFA factor, and AAL2. “Recent” means the server-owned session
timestamp is within 900 seconds. Reasons are trimmed 8–500 character strings.
Mutation idempotency keys are UUIDs. DTOs never contain credentials, sessions,
tokens, unmasked email addresses, or private Auth metadata.

## Identity resolution

### `api.admin_resolve_staff_user_exact(text)`

- Permission: `security.manage_staff`
- AAL/recent auth: AAL2 / required
- Dual control: no
- Input: `{ email: exactEmail }`
- Output: `{ found, authUserId, maskedEmail, emailVerified, mfaVerified,
staffPrincipal, assignments }`
- Errors: `staff_user_not_found`, `staff_user_ambiguous`,
  `recent_auth_required`, `mfa_assurance_insufficient`, `permission_missing`
- Idempotency: read-only
- Audit: `security.resolve_staff_user`, including not-found and ambiguous
  outcomes
- Outbox: none
- Pagination: latest 50 assignments embedded; no user-directory pagination
- Route: `/admin/staff`

Only equality against one normalized email is supported. There is no list,
prefix, substring, or fuzzy Auth-user contract.

## Principal creation

### `api.admin_create_staff_principal(uuid, text, uuid)`

- Permission: `security.manage_staff`
- AAL/recent auth: AAL2 / required
- Dual control: no
- Input: target Auth UUID, reason, idempotency key
- Output: `{ staffPrincipalId, authUserId, status, mfaRequired, created,
roleGranted: false }`
- Errors: `staff_user_not_found`, `staff_user_not_verified`,
  `staff_user_mfa_required`, `self_escalation_forbidden`,
  `idempotency_conflict`
- Idempotency: repeated identical operation returns the retained result;
  existing principal returns `created: false`
- Audit: `security.create_staff_principal`
- Outbox: none
- Pagination: none
- Route: `/admin/staff`

Creating a principal never grants a role.

## Standard assignment lifecycle

### `api.admin_assign_role(...)`

- Permission: `security.manage_staff`
- AAL/recent auth: AAL2 / required
- Dual control: no for standard roles
- Input: target Auth UUID, server-catalog role, optional expiry, reason,
  optional reference, idempotency key; approval ID must be absent
- Output: `StaffAssignmentDto`
- Errors: `role_not_assignable`, `approval_required`,
  `staff_principal_not_found`, `staff_principal_suspended`,
  `staff_principal_revoked`, `staff_user_not_verified`,
  `staff_user_mfa_required`, `role_assignment_conflict`,
  `self_escalation_forbidden`
- Idempotency: retained response for identical retry
- Audit: `security.assign_role`
- Outbox: queued/deduplicated
- Pagination: none
- Route: `/admin/staff`

Directly assignable roles are `editor`, `publisher`, `content_admin`,
`football_operator`, `fantasy_operator`, `notification_operator`,
`support_agent`, and `moderator`. `security_admin` additionally requires the
actor to hold effective `platform_admin`. `platform_admin` always returns
`approval_required`.

### `api.admin_renew_role(...)`

- Permission: `security.manage_staff`
- AAL/recent auth: AAL2 / required
- Dual control: standard roles only; `platform_admin` is rejected
- Input/output: prior assignment UUID, new future expiry, reason, optional
  reference, idempotency key / replacement `StaffAssignmentDto`
- Errors: assignment and principal errors above
- Idempotency: retained response
- Audit: `security.renew_role`
- Outbox: queued/deduplicated
- Pagination: none
- Route: `/admin/staff/$principalId`

Renewal creates a replacement row and preserves renewal ancestry.

### `api.admin_shorten_role_expiry(uuid, timestamptz, text, uuid)`

- Permission: `security.manage_staff`
- AAL/recent auth: AAL2 / required
- Dual control: no; last-platform-admin safeguard applies
- Input: assignment UUID, earlier future expiry, reason, idempotency key
- Output: updated `StaffAssignmentDto`
- Errors: `role_assignment_not_found`, `role_assignment_expired`,
  `role_assignment_already_revoked`, `role_assignment_conflict`,
  `last_platform_admin_required`
- Idempotency: retained response
- Audit: `security.shorten_role_expiry`
- Outbox: queued/deduplicated
- Route: `/admin/staff/$principalId`

### `api.admin_revoke_role(uuid, text, uuid)`

- Permission: `security.revoke_staff`
- AAL/recent auth: AAL2 / required
- Dual control: no; last-platform-admin safeguard applies
- Output: revoked `StaffAssignmentDto`
- Errors: `role_assignment_not_found`, `role_assignment_expired`,
  `last_platform_admin_required`, `self_escalation_forbidden`
- Idempotency: an already revoked assignment returns its retained state for an
  identical retry
- Audit: `security.revoke_role`
- Outbox: queued/deduplicated
- Route: `/admin/staff/$principalId`

## Principal state

### `api.admin_suspend_staff(uuid, text, uuid)`

- Permission: `security.revoke_staff`
- AAL/recent auth: AAL2 / required
- Output: principal state plus `sessionRevocationRequestId`
- Errors: `staff_principal_not_found`, `staff_principal_revoked`,
  `self_escalation_forbidden`, `last_platform_admin_required`
- Audit: `security.suspend_staff`
- Outbox: queued/deduplicated
- Route: `/admin/staff/$principalId`

Suspension denies Admin access synchronously and retains assignments.

### `api.admin_restore_staff(uuid, text, uuid)`

- Permission: `security.manage_staff`
- AAL/recent auth: AAL2 / required
- Output: active principal state, expired-assignment count, outbox ID
- Errors: `staff_principal_not_found`, `staff_principal_revoked`,
  `role_assignment_conflict`
- Audit: `security.restore_staff`
- Outbox: queued/deduplicated
- Route: `/admin/staff/$principalId`

Restoration expires elapsed assignments before changing the principal state. It
never revives revoked or expired grants.

### `api.admin_emergency_revoke_staff(uuid, text, uuid)`

- Permission: `security.revoke_staff`
- AAL/recent auth: AAL2 / required
- Output: revoked principal state, revoked-assignment count, outbox ID
- Errors: `staff_principal_not_found`, `self_escalation_forbidden`,
  `last_platform_admin_required`
- Audit: `security.emergency_revoke_staff`
- Outbox: queued/deduplicated
- Route: `/admin/staff/$principalId`

The principal and every active assignment are denied in the same transaction.

## Platform-administrator approval

### `api.admin_request_approval(...)`

- Permission: `security.manage_staff`
- AAL/recent auth: AAL2 / required
- Dual control: required
- Supported operation: only `staff.assign_platform_admin`
- Input: target Auth UUID, canonical `{ targetAuthUserId, role:
"platform_admin", expiresAt }`, reason, approval expiry (maximum 24 hours),
  idempotency key
- Output: `ApprovalSummaryDto`
- Errors: `approval_payload_mismatch`, `approval_expired`,
  `self_escalation_forbidden`
- Audit: `approval.request`
- Outbox: none
- Route: `/admin/staff`

### `api.admin_get_approval(uuid)`

- Caller: requester or current holder of the request's required permission
- AAL/recent auth: AAL2 / not required for inspection
- Output: decision/execution state plus safe masked target summary
- Errors: `approval_not_found`, `staff_access_denied`
- Audit: transitions are audited; inspection is bounded and contains no private
  payload
- Route: `/admin/approvals`

### `api.admin_approve_request(...)`

- Permission: request's `security.manage_staff`
- AAL/recent auth: AAL2 / required
- Dual control: approver differs from requester and target
- Input: approval UUID, immutable fingerprint, reason, idempotency key
- Output: `ApprovalSummaryDto`
- Errors: `approval_not_found`, `approval_expired`, `approval_conflict`,
  `approval_payload_mismatch`, `self_approval_forbidden`,
  `self_escalation_forbidden`
- Audit: `approval.approve`
- Route: `/admin/approvals`

`admin_reject_request` has the same permission/authentication contract and
writes `approval.reject`. `admin_cancel_request` is restricted to the requester
while pending and writes `approval.cancel`.

### `api.admin_execute_approved_platform_admin(...)`

- Permission: `security.manage_staff`
- AAL/recent auth: AAL2 / required
- Dual control: mandatory
- Input: approval UUID, fingerprint, reason, idempotency key
- Output: executed approval plus `StaffAssignmentDto`
- Errors: all target eligibility, approval, assignment, actor authority, and
  idempotency errors
- Idempotency: same key returns the retained result; a different execution
  after success returns `operation_already_executed`
- Audit: `security.assign_platform_admin` and `approval.execute`
- Outbox: queued/deduplicated
- Route: `/admin/approvals`

Execution rechecks requester and approver authority, target verified email and
MFA, current caller AAL/recent auth, fingerprint, expiry, principal state, and
assignment conflicts. No other authenticated RPC can create
`platform_admin`.

## Read models and pagination

The Phase 7B contracts remain authoritative:

- `admin_list_staff_assignments`: keyset by `(createdAt, id)`, maximum 100;
- `admin_list_assignment_history`: keyset by `(createdAt, id)`, maximum 100;
- `admin_list_approval_queue`: keyset by `(requestedAt, id)`, maximum 100;
- `admin_list_audit_events_v2`: bounded time window plus keyset, maximum 100;
- `admin_get_session_revocation_status`: safe principal-scoped status;
- `admin_get_revocation_worker_health`: safe queue and last-ten-run health.

## Reauthentication contract

An expired server window returns `recent_auth_required`. The Admin shell sends
the operator through ordinary Supabase Auth and MFA, then requires them to
re-submit the operation. No privileged payload, password, nonce, or token is
retained for automatic replay.

## Revocation wording

Canonical result: **privileged Admin access revoked**.
Outbox result: **session invalidation requested where supported**.

The API and UI never claim arbitrary-user global Supabase session termination.
