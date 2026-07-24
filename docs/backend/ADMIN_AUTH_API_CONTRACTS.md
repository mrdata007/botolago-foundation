# Admin Authorization API Contracts

## Boundary rules

All operations use the controlled `api` schema. Browser roles receive no
direct privileges on Phase 7A `app_private` tables. Interactive operations use
an authenticated Supabase Auth session; privileged mutations also require
verified MFA (`aal2`) and a session created within the 15-minute recent-auth
window. Service operations require a server-only Secret API key and explicit
`service_role` function grant.

Every mutation takes an idempotency UUID. Reusing the same key and payload
returns the stored response; reusing it with a different fingerprint returns
`idempotency_conflict`.

## Stable errors

The Admin repository maps only these public codes:

`staff_access_denied`, `staff_principal_not_found`,
`staff_assignment_not_found`, `staff_role_invalid`, `staff_role_expired`,
`staff_role_conflict`, `staff_suspended`, `staff_revoked`,
`permission_missing`, `self_escalation_forbidden`, `recent_auth_required`,
`mfa_required`, `mfa_assurance_insufficient`, `approval_required`,
`approval_not_found`, `approval_expired`, `approval_payload_mismatch`,
`self_approval_forbidden`, `operation_already_executed`,
`audit_access_denied`, and `idempotency_conflict`.

Raw PostgreSQL, PostgREST, Auth, and policy errors never cross the repository
boundary.

## Operations

| RPC                                     | Caller                         | Permission              | MFA                     | Recent auth         | Approval                                 | Audit                                    |
| --------------------------------------- | ------------------------------ | ----------------------- | ----------------------- | ------------------- | ---------------------------------------- | ---------------------------------------- |
| `get_my_staff_context`                  | authenticated staff            | principal lookup        | reported, not gated     | reported, not gated | no                                       | no mutation                              |
| `admin_list_active_assignments`         | authenticated staff            | `security.manage_staff` | AAL2                    | no                  | no                                       | no mutation                              |
| `admin_list_assignment_history`         | authenticated staff            | `security.manage_staff` | AAL2                    | no                  | no                                       | no mutation                              |
| `admin_assign_role`                     | authenticated staff            | `security.manage_staff` | AAL2                    | yes                 | required for `platform_admin`            | `security.assign_role`                   |
| `admin_revoke_role`                     | authenticated staff            | `security.revoke_staff` | AAL2                    | yes                 | no                                       | `security.revoke_role`                   |
| `admin_renew_role`                      | authenticated staff            | `security.manage_staff` | AAL2                    | yes                 | required for `platform_admin`            | `security.renew_role`                    |
| `admin_suspend_staff`                   | authenticated staff            | `security.revoke_staff` | AAL2                    | yes                 | no                                       | `security.suspend_staff`                 |
| `admin_restore_staff`                   | authenticated staff            | `security.manage_staff` | AAL2                    | yes                 | no                                       | `security.restore_staff`                 |
| `admin_emergency_revoke_staff`          | authenticated staff            | `security.revoke_staff` | AAL2                    | yes                 | no                                       | `security.emergency_revoke_staff`        |
| `admin_request_approval`                | authenticated staff            | requested permission    | AAL2                    | yes                 | n/a                                      | `approval.request`                       |
| `admin_approve_request`                 | different authenticated staff  | request permission      | AAL2                    | yes                 | n/a                                      | `approval.approve`                       |
| `admin_reject_request`                  | different authenticated staff  | request permission      | AAL2                    | yes                 | n/a                                      | `approval.reject`                        |
| `admin_cancel_request`                  | original requester             | active principal        | AAL2                    | yes                 | pending only                             | `approval.cancel`                        |
| `admin_get_approval`                    | requester or permission holder | request permission      | AAL2                    | no                  | n/a                                      | no mutation                              |
| `admin_execute_approved_platform_admin` | authenticated staff            | `security.manage_staff` | AAL2                    | yes                 | approved, unexpired, fingerprint matched | `approval.execute` plus assignment audit |
| `admin_list_audit_events`               | authenticated staff            | `security.read_audit`   | AAL2                    | no                  | no                                       | no mutation                              |
| `admin_bootstrap_first_platform_admin`  | service role only              | one-time bootstrap      | verified factor checked | trusted operation   | bootstrap exception                      | `security.bootstrap_platform_admin`      |
| `admin_expire_approvals`                | service role only              | bounded worker          | server                  | server              | n/a                                      | `approval.expire`                        |
| `admin_claim_session_revocations`       | service role only              | Auth Admin worker       | server                  | server              | n/a                                      | outbox only                              |
| `admin_complete_session_revocation`     | service role only              | Auth Admin worker       | server                  | server              | n/a                                      | outbox completion                        |

## DTOs

### Staff context

```ts
interface StaffContextDto {
  staffPrincipalId: string;
  status: "active" | "suspended" | "revoked";
  roles: Array<{ name: AdminRole; expiresAt: string | null }>;
  permissions: AdminPermission[];
  emailVerified: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  currentAal: "aal1" | "aal2";
  recentAuthRequired: true;
  recentAuthWindowSeconds: 900;
  accessAllowed: boolean;
  suspended: boolean;
  revoked: boolean;
}
```

It deliberately omits policy rows, service-role information, tokens,
credentials, audit payloads, and unrelated user data. A non-staff caller gets
`staff_access_denied`.

### Assignment mutation

Input contains the immutable target Auth UUID, server-controlled role name,
optional expiry, bounded reason/reference, idempotency UUID, and optional
approval UUID. Output contains only principal/assignment UUIDs, role, status,
expiry, and the session-revocation request UUID.

Assignment expiry is evaluated against database time. Renewal creates a new
assignment linked to the historical row. Revocation never deletes history.
Callers cannot target their own Auth UUID or principal.

### Platform administrator approval

The only executable Phase 7A operation is
`staff.assign_platform_admin`. Its safe canonical payload is:

```json
{
  "targetAuthUserId": "<uuid>",
  "role": "platform_admin",
  "expiresAt": "<timestamptz-or-null>"
}
```

The database stores the SHA-256 fingerprint of PostgreSQL's canonical `jsonb`
representation. Approval and execution submit that fingerprint. A changed
target, role, or expiry returns `approval_payload_mismatch`. The requester
cannot approve their own request. Execution rechecks all controls and can
succeed once.

### Audit page

The bounded keyset page includes safe action metadata, effective roles/scopes,
target IDs, reason, request/correlation/approval IDs, safe before/after
summaries, environment, outcome, stable error code, and timestamp. It never
contains credentials, tokens, passwords, raw bodies, or provider payloads.

## Session invalidation

Every staff privilege check reads canonical staff state on every call, so
revocation/suspension applies immediately even while an old JWT remains valid.
Sensitive changes also create an Auth Admin outbox request. A trusted server
claims bounded requests, revokes all target sessions through the Supabase Auth
Admin API, then marks completion. Direct SQL writes to `auth.sessions` are not
part of this contract.

## Admin Console integration

The future console imports the typed repository only. It must not call
Supabase from React route components, use secret keys, treat route guards as
authorization, or cache staff permissions as authority. On
`recent_auth_required`, create a fresh Supabase Auth session and complete MFA;
refreshing an existing JWT does not renew the recent-auth window.
