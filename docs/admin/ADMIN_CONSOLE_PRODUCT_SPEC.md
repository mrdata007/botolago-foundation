# BotolaGO Admin Console Product Specification

Status: frozen Phase 7D security-console contract

Authority: server-side Supabase Auth, canonical staff state, RLS, and protected
`api` RPCs

Languages: French and Arabic with full RTL

Consumer-navigation entry: prohibited in Phase 7D

This specification covers only Admin identity, staff security, approvals,
audit, revocation, and worker health. It does not authorize Editorial,
Football, Fantasy, Notifications, support, analytics, or provider controls.

## Global interaction contract

Every route:

- loads canonical staff context on the server;
- renders no privileged data before authorization succeeds;
- fails closed on unavailable or malformed backend state;
- repeats permission, MFA, recent-auth, target, and approval checks in every
  server mutation;
- never treats hidden navigation or a disabled button as authorization;
- never calls `auth`, `app`, or `app_private` tables directly;
- never receives or stores a service credential.

Shared states:

| State                | French                                | Arabic                       | Behavior                                                    |
| -------------------- | ------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Loading              | Chargement sécurisé…                  | جارٍ التحميل الآمن…          | Busy semantics, stable skeleton, no stale sensitive content |
| Empty                | Aucun élément                         | لا توجد عناصر                | Explain scope and safe next action; never invent data       |
| Permission denied    | Autorisation insuffisante             | الصلاحية غير كافية           | No object existence leak                                    |
| MFA required         | Authentification multifacteur requise | المصادقة المتعددة مطلوبة     | Link to ordinary Auth MFA flow                              |
| Recent auth required | Réauthentification requise            | إعادة المصادقة مطلوبة        | Discard mutation; reauthenticate; require resubmission      |
| Suspended/revoked    | Accès Admin suspendu ou révoqué       | الوصول الإداري معلّق أو ملغى | Immediate denial; consumer account may remain usable        |
| Backend unavailable  | Service Admin indisponible            | خدمة الإدارة غير متاحة       | Fail closed; retry read only                                |
| Validation error     | Vérifiez les champs indiqués          | تحقّق من الحقول المحددة      | Stable field/code mapping; no raw database message          |
| Success              | Opération confirmée                   | تم تأكيد العملية             | Show safe IDs/status and audit correlation                  |

All destructive or high-risk dialogs require explicit target summary, reason,
impact, irreversible/reversible wording, fresh server validation, and a final
action button distinct from cancel.

## Screen map

The machine-readable counterpart is
`src/backend/admin/admin-console-contracts.ts`.

| Screen / test ID                                  | Route                       | Permission                    | API operations                                                   | Security                             |
| ------------------------------------------------- | --------------------------- | ----------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| Access gate / `admin-access-gate`                 | `/admin`                    | authenticated staff candidate | `get_my_staff_context`                                           | verified MFA/AAL2                    |
| Home / `admin-home`                               | `/admin`                    | any current Admin permission  | `get_my_staff_context`                                           | canonical context                    |
| Staff list / `admin-staff-list`                   | `/admin/staff`              | `security.manage_staff`       | `admin_list_staff_assignments`                                   | AAL2                                 |
| Eligibility / `admin-user-eligibility`            | `/admin/staff`              | `security.manage_staff`       | `admin_resolve_staff_user_exact`, `admin_create_staff_principal` | recent auth                          |
| Role assignment / `admin-role-assignment`         | `/admin/staff`              | `security.manage_staff`       | `admin_assign_role`                                              | recent auth; platform admin excluded |
| Platform request / `admin-platform-request`       | `/admin/staff`              | `security.manage_staff`       | `admin_request_approval`                                         | recent auth; dual control            |
| Staff detail / `admin-staff-detail`               | `/admin/staff/$principalId` | `security.manage_staff`       | `admin_get_staff_principal`                                      | AAL2                                 |
| Assignments / `admin-assignments`                 | same                        | `security.manage_staff`       | `admin_list_active_assignments`                                  | AAL2                                 |
| History / `admin-assignment-history`              | same                        | `security.manage_staff`       | `admin_list_assignment_history`                                  | AAL2, keyset pagination              |
| Emergency revoke / `admin-emergency-revocation`   | same                        | `security.revoke_staff`       | `admin_emergency_revoke_staff`                                   | recent auth; destructive             |
| Approval queue / `admin-approvals-queue`          | `/admin/approvals`          | `security.manage_staff`       | `admin_list_approval_queue`                                      | AAL2, keyset pagination              |
| Approval detail / `admin-approval-detail`         | same                        | `security.manage_staff`       | get/approve/reject/cancel/execute approval RPCs                  | recent auth; dual control            |
| Audit / `admin-audit-log`                         | `/admin/audit`              | `security.read_audit`         | `admin_list_audit_events_v2`                                     | bounded time + keyset                |
| Security / `admin-security-status`                | `/admin/security`           | `security.revoke_staff`       | `admin_get_revocation_worker_health`                             | read only                            |
| Revocation / `admin-revocation-status`            | same                        | `security.revoke_staff`       | `admin_get_session_revocation_status`                            | provider-bounded wording             |
| Worker / `admin-worker-health`                    | same                        | `security.revoke_staff`       | `admin_get_revocation_worker_health`                             | no browser worker execution          |
| MFA state / `admin-mfa-required`                  | `/admin`                    | none yet                      | `get_my_staff_context`                                           | reauthenticate                       |
| Recent auth / `admin-recent-auth-required`        | `/admin`                    | current staff                 | `get_my_staff_context`                                           | resubmit, never replay payload       |
| Suspended/revoked / `admin-access-revoked`        | `/admin`                    | denied                        | `get_my_staff_context`                                           | no protected children                |
| Backend unavailable / `admin-backend-unavailable` | `/admin`                    | none                          | `get_my_staff_context`                                           | fail closed                          |
| Permission denied / `admin-permission-denied`     | any protected route         | missing permission            | route read contract                                              | no object leak                       |

## Screen details

### Access gate and home

- Input: current Auth session.
- Output: `AdminContextDto` containing safe identity summary, principal status,
  roles, permissions, AAL/recent-auth state.
- Loading: full-shell skeleton.
- Empty/error: no privileged cards.
- Home success: safe identity and role/permission summary only.
- Disabled: no Admin nav item unless its permission is present.
- FR: “Espace d’administration sécurisé”.
- AR: “مساحة الإدارة الآمنة”.

### Staff list and exact eligibility

- Inputs: keyset cursor for list; exact normalized email for lookup.
- Outputs: bounded `StaffAssignmentDto` summaries; eligibility result with
  masked email, verified-email/MFA booleans, principal and assignment summary.
- Empty: “Aucun membre du personnel” / “لا يوجد أعضاء في الطاقم”.
- Lookup not found/ambiguous uses the same safe non-directory treatment.
- Success may offer principal creation but must say it grants no role.
- Role selector includes only server-returned assignable roles.
- `platform_admin` opens a request, never a direct grant.

### Staff detail, assignments, and history

- Input: immutable principal UUID plus keyset cursor.
- Output: safe principal state and bounded assignment DTOs.
- Empty: no active assignments or no historical page.
- Actions are rendered only from server permission/capability state.
- History is immutable and visually separated from active grants.
- Dates are localized but retain exact UTC values for accessible detail.

### Platform-admin request and approval detail

- Input: exact target, canonical role/expiry payload, reason, approval expiry,
  UUID idempotency key; later, approval UUID and immutable fingerprint.
- Output: `ApprovalSummaryDto`/detail with requester, approver, state, expiry,
  fingerprint, decision/execution state, and safe target summary.
- Queue empty: “Aucune demande en attente” / “لا توجد طلبات معلّقة”.
- Disabled: self-approval, expired request, changed fingerprint, wrong target,
  insufficient permission, stale auth.
- Confirmation must show requester and approver are different humans.
- Success must distinguish approved from executed.

### Audit log

- Inputs: bounded UTC time range, action/resource filters, keyset cursor.
- Output: safe `AuditEventDto`, never raw payload or credentials.
- Empty: no events in selected window.
- Audit hierarchy: action and result first, time/actor/target second,
  correlation and safe metadata third.
- Synthetic evidence is visibly labeled.

### Security, revocation, and worker health

- Inputs: optional exact principal ID for revocation status.
- Outputs: aggregate queue status, bounded last-ten worker runs, correlated
  provider result.
- Worker empty: no recent runs is neutral, not “healthy schedule”.
- Browser has no run/replay control in Phase 7D.
- Required wording:
  - “Accès Admin révoqué” / “تم إلغاء الوصول الإداري”;
  - “Action de session demandée lorsque prise en charge” /
    “تم طلب إجراء الجلسة حيثما كان مدعوماً”.
- Never display “all sessions terminated” for arbitrary users.

### Emergency revocation dialog

- Show masked target, roles to revoke, last-admin warning, consumer-session
  limitation, safe reason field, and destructive confirmation.
- Disable until reason validation, AAL2, recent auth, permission, and target
  state all pass.
- Success shows canonical denial first and queued provider status second.
- Stable errors include `last_platform_admin_required`,
  `self_escalation_forbidden`, `recent_auth_required`, and
  `mfa_assurance_insufficient`.

## DTO rules

DTOs are the existing Zod-validated contracts under `src/backend/admin`.
Nullability, pagination, stable error codes, timestamps, statuses, and
permission names must not be altered visually. Components may derive display
labels but may not create role/permission authority.

Synthetic example:

```json
{
  "principalId": "71000000-0000-4000-8000-000000000001",
  "status": "active",
  "maskedEmail": "o***@e***.test",
  "roles": [{ "name": "security_admin", "expiresAt": null }],
  "permissions": [
    "security.read_audit",
    "security.manage_staff",
    "security.revoke_staff",
    "users.revoke_sessions"
  ]
}
```

## Localization and RTL

- French and Arabic copy are mandatory for every label, state, error,
  confirmation, and empty view.
- Set `dir="rtl"` at the protected shell for Arabic.
- Logical layout uses inline-start/end, not hardcoded left/right.
- Icons with directional meaning mirror; security/status icons do not.
- UUIDs, timestamps, fingerprints, and technical codes remain LTR inside
  isolated spans.
- Truncation never hides status, destructive impact, or target identity.

## Responsive behavior

- Mobile: one column, sticky safe action footer inside dialogs, cards instead
  of clipped tables, 44px minimum targets.
- Tablet: two-column summary/action areas where reading order remains clear.
- Desktop: bounded content width; list/detail split may be used but route URLs
  remain canonical.
- No horizontal viewport overflow in either direction.

## Accessibility

- One logical `h1`, ordered headings, landmarks, and labeled navigation.
- All dialogs use focus trap, named title/description, initial non-destructive
  focus, Escape/cancel, and post-close focus restoration.
- Errors associate with inputs; status updates use appropriate live regions.
- Color is never the sole status signal; contrast meets WCAG AA.
- Tables have captions/headers or become semantically equivalent lists.
- Loading never creates keyboard focus traps.
- Test IDs remain stable and are not accessible names.

## Sensitive data

Mask emails and never expose passwords, tokens, MFA secrets/challenges,
session IDs, service keys, provider payloads, raw Auth metadata, private audit
payloads, or full IP/user-agent data. Copy-to-clipboard is disabled for any
security value not explicitly part of a safe DTO.
