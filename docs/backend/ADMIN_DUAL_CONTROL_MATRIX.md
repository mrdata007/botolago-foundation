# Admin Dual-Control Matrix

Authority: server-owned staff roles, permissions, AAL2, recent-authentication
window, immutable approval fingerprint, and append-only audit evidence.

`security_admin` is the minimum second-operator role. It contains only:

- `security.read_audit`;
- `security.manage_staff`;
- `security.revoke_staff`;
- `users.revoke_sessions`.

It grants no Editorial, Football, Fantasy, Notifications, support, analytics,
or unrestricted `platform_admin` mutation.

## Human prerequisites

Each participant must use a distinct verified Auth identity, password, MFA
factor, and session. Both requester and approver must be AAL2 and recently
authenticated at their transition. Shared accounts, factors, passwords,
sessions, owner impersonation, and self-approval are prohibited.

## Authority matrix

| Operation                                                             | Requester                                      | Approver                                                                          | Execution                        | Approval                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| First owner bootstrap                                                 | Separately authorized trusted owner            | Not applicable to the one-time exception                                          | Trusted server command           | No; only while zero effective platform admins exist      |
| Create staff principal                                                | `platform_admin` or permitted `security_admin` | None                                                                              | Requester                        | No                                                       |
| Assign ordinary catalog role                                          | `platform_admin` or permitted `security_admin` | None                                                                              | Requester                        | No                                                       |
| Assign `security_admin`                                               | Effective `platform_admin`                     | None                                                                              | Requester                        | No; recent auth and explicit reason required             |
| Owner requests `platform_admin` for another eligible user             | Effective `platform_admin`                     | Different effective `security_admin` or `platform_admin` with required permission | Authorized caller after approval | Yes                                                      |
| Security operator requests `platform_admin` for another eligible user | Effective `security_admin`                     | Different effective `platform_admin`                                              | Authorized caller after approval | Yes                                                      |
| Approve/reject request                                                | Different qualified human                      | Not applicable                                                                    | Approver                         | Existing pending, unexpired, fingerprint-matched request |
| Execute approved `platform_admin`                                     | Qualified `security.manage_staff` operator     | Prior independent approval required                                               | Qualified operator               | Yes; exactly once                                        |
| Revoke ordinary role                                                  | `security.revoke_staff`                        | None                                                                              | Requester                        | No                                                       |
| Suspend staff                                                         | `security.revoke_staff`                        | None                                                                              | Requester                        | No                                                       |
| Emergency-revoke staff                                                | `security.revoke_staff`                        | None                                                                              | Requester                        | No; two-person incident practice recommended             |
| Restore suspended staff                                               | `security.manage_staff`                        | None                                                                              | Requester                        | No; never restores expired grants                        |
| Read audit evidence                                                   | `security.read_audit`                          | None                                                                              | Reader                           | No                                                       |
| Worker status                                                         | Trusted server operator                        | None                                                                              | Server command                   | No browser execution                                     |
| Dead-letter replay                                                    | Trusted server operator with approved reason   | Human review outside the command                                                  | Server command                   | Exact one-record confirmation                            |
| Revoke/suspend last effective `platform_admin`                        | Nobody through normal contracts                | Nobody                                                                            | Denied                           | Database safeguard always wins                           |

## Mandatory denials

- Requester cannot approve their own request.
- Target cannot be requester/approver when self-escalation would result.
- Payload or fingerprint mutation invalidates approval.
- Expired, rejected, cancelled, or executed requests cannot execute.
- A second execution with a different idempotency key returns
  `operation_already_executed`.
- `security_admin` cannot directly assign `platform_admin`.
- Missing MFA, AAL1, stale recent auth, inactive principal, revoked
  assignment, or missing permission denies the transition.
- Browser roles cannot invoke bootstrap, worker claim/complete/fail/replay, or
  trusted readiness.

## Operating sequences

### Owner request, operator approval

1. Owner resolves an exact eligible target and creates the immutable request.
2. Second operator independently verifies target, reason, expiry, and
   fingerprint.
3. Second operator approves from a fresh AAL2/recent session.
4. A qualified operator executes the unchanged request.
5. Both assignment and approval execution events are verified.

### Operator request, owner approval

The same sequence applies with identities reversed. The owner must not merely
rubber-stamp: they independently verify target eligibility and immutable
fingerprint.

## Recovery and audit

Every mutation uses a unique idempotency key and a credential-free reason.
Request, decision, execution, assignment, emergency mutation, outbox request,
and worker result retain correlation evidence. Approval does not guarantee
execution: authority, target eligibility, MFA, recent auth, expiry, and payload
are rechecked at execution time.
