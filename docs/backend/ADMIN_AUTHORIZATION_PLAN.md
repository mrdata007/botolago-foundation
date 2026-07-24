# BotolaGO Admin Authorization Plan

## Status and scope

This document is the Phase 7A design authority for administrative
authorization. It was completed before the Phase 7A migration was created.
Supabase Auth remains the sole credential, email-verification, MFA, and session
authority. Phase 7A adds authorization and security contracts only; it does not
add an Admin UI, editorial CMS operations, Football/Fantasy correction
operations, Notification operations, or production schedules.

The design is greenfield V2. Legacy roles, migrations, IDs, and metadata are
archive-only and are not authorization inputs.

## 1. Staff identity model

`app_private.staff_principals` is the canonical staff identity registry. Each
row:

- has an internal UUID;
- references one immutable `auth.users.id`;
- has an explicit `active`, `suspended`, or `revoked` lifecycle state;
- records creation, update, suspension, and revocation metadata;
- never stores a password, access token, refresh token, API key, or provider
  credential.

The Auth UUID is the only identity link. Email, profile fields, app/user
metadata, email domains, and client-local state are never authorization
signals. Staff must have a confirmed email and at least one verified MFA factor
before privileged interactive operations are allowed.

## 2. Role model

Roles are server-seeded reference rows in `app_private.admin_roles`:

- `editor`
- `publisher`
- `content_admin`
- `football_operator`
- `fantasy_operator`
- `notification_operator`
- `support_agent`
- `moderator`
- `security_admin`
- `platform_admin`

Role names are immutable in normal operation. A role is a named template only;
all authorization decisions resolve its explicit permission rows. There is no
implicit role hierarchy. In particular, `platform_admin` receives a broad,
explicit permission set but does not bypass MFA, recent-authentication,
dual-control, environment, or idempotency checks.

The pre-existing Phase 4 `editorial_memberships` table remains compatible and
unchanged. It is not authoritative for Phase 7A. A later editorial cutover will
map those memberships to the new role assignments through a reviewed migration
and then deprecate the old check; Phase 7A does not silently merge the two
models.

## 3. Permission-scope model

Permissions are server-seeded rows in `app_private.admin_permissions`.
`app_private.admin_role_permissions` contains every explicit template mapping.
There is no wildcard permission and no implicit inheritance.

| Domain        | Permission scopes                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editorial     | `editorial.read`, `editorial.write`, `editorial.review`, `editorial.publish`, `editorial.manage_taxonomy`, `editorial.manage_placements`                                |
| Football      | `football.read_operations`, `football.manage_mappings`, `football.correct`, `football.manage_ingestion`                                                                 |
| Fantasy       | `fantasy.read_operations`, `fantasy.configure_season`, `fantasy.manage_gameweeks`, `fantasy.correct_points`, `fantasy.manage_rankings`                                  |
| Notifications | `notifications.read_operations`, `notifications.manage_templates`, `notifications.inspect_delivery`, `notifications.replay_dead_letters`, `notifications.test_delivery` |
| Users         | `users.read_support`, `users.revoke_sessions`, `users.moderate`, `users.process_deletion`                                                                               |
| Security      | `security.read_audit`, `security.manage_staff`, `security.revoke_staff`                                                                                                 |
| Jobs          | `jobs.read`, `jobs.run`, `jobs.pause`, `jobs.resume`, `jobs.replay`                                                                                                     |
| Releases      | `releases.read`, `releases.promote`                                                                                                                                     |

Permission checks resolve only active principals and active, unrevoked,
unexpired assignments. The role-permission mapping is read inside trusted
database helpers; browser roles have no direct table privileges.

## 4. Role-assignment lifecycle

`app_private.staff_role_assignments` is an append-preserving assignment ledger.
An assignment records the principal, role, grantor, reason, reference,
optional expiry, grant timestamp, and revocation metadata. Revocation updates
the existing ledger row but never deletes it. Renewal creates a new row linked
to the prior assignment, preserving the complete history.

The state rules are:

1. assignments start active;
2. expiry is evaluated against database time on every permission check;
3. revocation is permanent for that assignment row;
4. renewal creates a new assignment rather than clearing historical fields;
5. the same principal cannot have more than one live assignment for a role;
6. callers cannot assign roles to themselves or expand their own scope;
7. `platform_admin` grants require an unexpired, payload-matched approval after
   initial bootstrap.

Mutations are serialized per target principal with transaction advisory locks,
require an idempotency key, write the audit event in the same transaction, and
queue a session-revocation request for sensitive changes.

## 5. First-administrator bootstrap

`bun run admin:bootstrap --email="<verified-user-email>"` is the only bootstrap
entry point. It is a server-side command using `SUPABASE_URL` and a dedicated
`SUPABASE_SECRET_KEY`; neither may use a `VITE_` prefix. The command:

1. validates and normalizes the email argument;
2. scans Auth users without logging credentials or tokens;
3. requires exactly one matching, email-confirmed user;
4. requires a verified MFA factor;
5. calls a service-role-only bootstrap RPC with the immutable Auth UUID;
6. creates the principal and initial `platform_admin` assignment atomically;
7. records a bootstrap audit event;
8. is idempotent for the already-bootstrapped same user;
9. refuses to run once any different platform administrator exists.

It never creates a user, password, default email, session, or MFA factor. After
bootstrap, all staff changes use protected Admin API operations.

## 6. Recent-authentication model

The selected recent-authentication window is **15 minutes**. This is short
enough to limit unattended-session risk while still allowing a bounded
administrative task.

The server extracts the JWT `session_id`, confirms that it belongs to the
current Auth user in `auth.sessions`, and uses the server-owned session
`created_at` timestamp. Client timestamps and JWT `iat` refresh timestamps are
not trusted. A refreshed access token therefore does not extend recent-auth
state.

When the 15-minute window expires, sensitive operations return
`recent_auth_required`. Reauthentication means a fresh Supabase Auth sign-in
followed by the normal MFA challenge, producing a new session. It does not
write roles or permissions. Phase 7A documents this contract; the visual
reauthentication flow belongs to the future Admin Console.

## 7. MFA requirements

MFA is mandatory immediately for all staff operations:

- the JWT must assert `aal2`;
- the current Auth session must exist;
- the user must have a `verified` factor in `auth.mfa_factors`;
- missing MFA returns `mfa_required`;
- an enrolled factor without AAL2 returns `mfa_assurance_insufficient`;
- disabling all factors causes the next Admin API check to fail closed.

Staging and production operators must keep TOTP challenge and verification
enabled in **Authentication → Multi-Factor Authentication**. Repository code
does not claim to configure this hosted setting. Staff should enroll a primary
and a separately stored backup factor. Emergency recovery requires a platform
owner to revoke the staff principal, invalidate sessions through the Auth Admin
API, restore factor access, and only then restore the principal.

## 8. Approval and dual-control model

`app_private.admin_approval_requests` implements typed, immutable approvals.
Phase 7A supports the `staff.assign_platform_admin` operation and defines the
generic contract for future domain operations.

Each request records:

- requester and required permission;
- target domain/entity and typed operation;
- SHA-256 payload fingerprint;
- a bounded safe payload reference;
- a bounded reason;
- creation and expiry timestamps;
- approver/rejector and decision timestamps;
- execution state/timestamps/result;
- correlation ID.

The lifecycle is `pending → approved|rejected|cancelled|expired`, followed by a
single `executed` or `execution_failed` outcome for approved requests.
Requester and approver must be different active staff principals. Approval
cannot alter the fingerprint. Execution rechecks permission, MFA, recent auth,
target payload, environment, and current operation preconditions. A unique
execution key and row lock prevent duplicate execution. Approval is an
additional control, never a replacement for operation authorization.

## 9. Administrative audit model

`app_private.admin_audit_events` is append-only. Only trusted functions insert;
no API role receives direct `INSERT`, `UPDATE`, or `DELETE`. Each event stores:

- actor principal and Auth user where available;
- effective roles and permissions at the action boundary;
- action, target domain/entity, reason, correlation/request ID, and approval ID;
- bounded safe before/after summaries;
- environment;
- outcome and stable error code;
- server timestamp and a synthetic-test flag.

Database triggers reject updates and deletes even for accidental privileged
SQL. Events contain no passwords, JWTs, access/refresh tokens, provider
credentials, private bodies, or raw request payloads.

Production retention is seven years for security and privileged-change
evidence. Staging synthetic evidence may be retained with
`synthetic_test=true`; a reviewed retention job may purge expired synthetic
events after 30 days. Phase 7A does not activate that job.

## 10. Admin API boundary

The Data API exposes only explicit functions in `api`. Canonical tables remain
in `app_private` and are not directly exposed. Phase 7A operations are:

- current staff context;
- active assignment and assignment-history reads;
- assign, revoke, renew, suspend, and restore;
- request, approve, reject, cancel, and execute an approval;
- bounded privileged-audit reads;
- service-only bootstrap and recent-auth/session-revocation maintenance.

Consumer DTOs and Admin DTOs are distinct. Every authenticated Admin RPC
performs server-side identity, principal, permission, MFA, session,
recent-auth, environment, idempotency, and approval checks as applicable.
React route guards are supplementary only.

## 11. RLS and grant strategy

Every Phase 7A table enables and forces RLS. No table has a permissive browser
policy. `anon` and `authenticated` receive no direct table privileges.
`service_role` also receives no direct table grants; trusted server actions use
explicit service-role-only RPCs. Function execute privileges are revoked from
`PUBLIC` first, then granted only to `authenticated` or `service_role` as
documented.

All security-definer functions use an empty `search_path` and schema-qualified
objects. Internal helpers are executable only by `postgres`. API functions
return stable sanitized errors and never propagate raw PostgreSQL/Auth details.

## 12. Session-revocation strategy

Authorization revocation is immediate because every privileged RPC resolves
the canonical principal and assignments on each call; an old JWT cannot carry
staff authority.

Sensitive changes also enqueue `app_private.staff_session_revocation_requests`.
A trusted server process uses the Supabase Auth Admin API to revoke the
target's sessions, records attempts, and marks completion. Direct SQL deletion
from the Auth schema is intentionally avoided. Until the worker is activated,
the bootstrap/runbook requires the operator to perform the Auth Admin
revocation synchronously and then mark the request complete through the
service-only contract.

## 13. Emergency administrator revocation

For a suspected compromise:

1. use the trusted emergency revoke command/RPC to set the principal `revoked`;
2. verify all Admin RPCs return `staff_revoked`;
3. revoke all Auth sessions through the Admin API;
4. record the revocation request completion and incident reference;
5. rotate any separately exposed credentials;
6. require fresh credentials and verified MFA before a new assignment;
7. never reactivate the old assignment row.

The emergency path can revoke but cannot grant privilege and remains fully
audited.

## 14. Staging-test strategy

Local tests cover schema constraints, bootstrap, permission resolution,
assignment expiry/revocation/renewal, self-escalation denial, MFA/AAL,
recent-session checks, approvals, idempotency, audit append-only behavior, and
RLS/grants.

After local and GitHub CI are green, only BotolaGO Staging V2
(`srdrflfrfpwixsllveid`) receives the reviewed migration. Synthetic confirmed
Auth users with verified synthetic MFA data exercise the same contracts.
Cleanup revokes sessions, deletes synthetic users and mutable staff records,
retains or unmistakably marks append-only audit evidence, and proves no active
synthetic elevated access remains. Production V2 and Legacy are never selected.

## 15. Admin Console integration contract

The future Admin Console will:

- use ordinary Supabase Auth sessions;
- require confirmed email, enrolled MFA, and AAL2;
- call the current-context RPC before rendering protected navigation;
- map stable errors to reauthentication/MFA/access-denied states;
- include an idempotency key and expected payload fingerprint for mutations;
- never query `app` or `app_private` directly;
- never contain a secret/service-role key;
- treat all route guards as presentation only.

The repository layer introduced in Phase 7A is the only frontend-facing
integration boundary. No visual routes are created now.

## 16. Risks and rollback strategy

### Risks

- Hosted MFA settings require explicit dashboard verification in every
  environment.
- Session revocation needs a trusted Auth Admin executor; canonical permission
  revocation is immediate even if that executor is temporarily unavailable.
- The Phase 4 editorial membership system remains temporarily parallel until a
  reviewed CMS cutover.
- Incorrect role templates could overgrant; the explicit seed matrix and
  permanent tests are therefore release artifacts.
- Approval infrastructure is generic, but only
  `staff.assign_platform_admin` is executable in Phase 7A.

### Rollback

The migration is additive. Before production use, rollback means stop calling
Admin RPCs and revert application/repository code; the dormant forced-RLS
tables grant no browser access. After audit/assignment data exists, rollback is
forward-only: revoke active principals and assignments, disable the Admin
entry points, preserve audit evidence, and ship a reviewed corrective
migration. Never drop populated audit or assignment-history tables.
