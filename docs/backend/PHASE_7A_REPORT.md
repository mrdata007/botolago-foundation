# Phase 7A — Admin Authorization and Security Foundation

## Verdict

Phase 7A is complete and ready for review. The implementation is limited to
the trusted Admin authorization foundation. It does not add an Admin UI,
editorial operations, football corrections, Fantasy corrections,
notification operations, support tooling, or production activation.

## Architecture

- Supabase Auth UUIDs are the sole staff identity authority.
- Canonical staff authorization is private, relational, and server-owned.
- All browser-facing operations are permission-checking RPCs in `api`.
- Canonical tables live in `app_private`, have forced RLS, and have no browser
  table grants or permissive policies.
- Roles contain explicit permission mappings. There is no implicit role
  inheritance and no authorization from email domains, profile fields, user
  metadata, local storage, or client-supplied timestamps.

The complete design and threat boundaries are in
`docs/backend/ADMIN_AUTHORIZATION_PLAN.md`.

## Schema and migration

Migration:

- `20260724143100_admin_authorization_foundation.sql`

Created private tables:

- `staff_principals`
- `admin_roles`
- `admin_permissions`
- `admin_role_permissions`
- `staff_role_assignments`
- `admin_approval_requests`
- `admin_idempotency_keys`
- `staff_session_revocation_requests`
- `admin_audit_events`

The migration is additive and replayable from zero. Every new table enables
and forces RLS. Every foreign-key access path is index-covered. Direct grants
to `anon`, `authenticated`, and `service_role` are absent; trusted roles
receive only specific RPC execute grants.

## Role and permission matrix

Ten server-controlled roles are seeded:

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

Thirty-four granular permissions cover Editorial, Football, Fantasy,
Notifications, Users, Security, Operations, and Releases. `platform_admin`
has all 34 explicit mappings; it has no wildcard and does not bypass
dual-control requirements.

## Bootstrap

The trusted command is:

```sh
bun run admin:bootstrap --email="<verified-user-email>"
```

It requires `SUPABASE_URL` plus a server-only `SUPABASE_SECRET_KEY`, rejects a
publishable key, finds exactly one verified Auth user, requires a verified MFA
factor, resolves the immutable Auth UUID, creates the first
`platform_admin` assignment exactly once, and writes a bootstrap audit event.
It never creates or prints a password and has no committed administrator
email.

Operational procedure and rollback are documented in
`docs/backend/ADMIN_BOOTSTRAP_RUNBOOK.md`.

## MFA and recent authentication

- Verified MFA enrollment is required for every staff principal.
- Interactive Admin mutations require JWT assurance level `aal2`.
- Sensitive operations require the referenced Supabase Auth session to have
  been created within the previous 15 minutes.
- Server time and `auth.sessions.created_at` are authoritative.
- JWT refresh does not extend recent-auth state.
- Reauthentication creates a fresh Supabase Auth session and cannot add roles
  or permissions.

Hosted MFA enrollment and recovery settings remain an explicit operator
configuration; repository code does not claim to configure the Supabase
Dashboard.

## Approval model

Phase 7A implements a generic typed lifecycle:

- request
- approve
- reject
- expire
- cancel
- execute once
- inspect status

The only executable high-risk operation in this phase is
`staff.assign_platform_admin`. Requesters cannot approve their own requests.
Payload fingerprints are immutable and canonicalized. Approval does not
bypass operation-level permission, MFA, recent-auth, or environment checks.
Execution is transactional and idempotent.

## Audit and session revocation

Privileged operations write append-only audit events with safe summaries,
effective authorization context, correlation IDs, approval IDs, environment,
outcome, and stable error codes. Update and delete are rejected by trigger,
including trusted direct attempts.

Role changes, suspension, restoration, and emergency revocation immediately
remove canonical authorization and enqueue a trusted Auth-session revocation
request. A bounded service-only claim/complete contract supports a future
Auth Admin worker. Consumer sessions cannot access that outbox.

Production retention is seven years. Synthetic staging audit evidence is
retained for 30 days and carries `synthetic_test = true`.

## API and errors

The full RPC permission/MFA/recent-auth/approval/idempotency matrix is in
`docs/backend/ADMIN_AUTH_API_CONTRACTS.md`.

Typed DTOs and a fail-closed repository live in `src/backend/admin`. Raw
PostgreSQL, Supabase, Auth, and policy errors are mapped to stable Admin error
codes and are never surfaced directly.

## Local validation

| Gate                             | Result                                    |
| -------------------------------- | ----------------------------------------- |
| Clean migration replay from zero | PASS                                      |
| Migration validation             | PASS — 31 migrations                      |
| Complete pgTAP/RLS suite         | PASS — 345 tests in 16 files              |
| Targeted Admin pgTAP/RLS         | PASS — 78 tests                           |
| Application tests                | PASS — 339 tests in 63 files              |
| Backend Python tests             | PASS — 69 tests                           |
| Admin TypeScript contract tests  | PASS — 9 tests                            |
| Generated-type drift             | PASS                                      |
| Typecheck                        | PASS                                      |
| Production build                 | PASS                                      |
| Lint                             | PASS — 0 errors, 11 pre-existing warnings |
| Secret scan                      | PASS                                      |
| Targeted formatting              | PASS                                      |
| Database product-schema lint     | PASS                                      |

The local database linter still reports findings inside Supabase's bundled
pgTAP extension functions. No finding belongs to a BotolaGO product schema or
Phase 7A function.

## GitHub review

Draft PR head `e90c488` passed:

- `application-quality` in 1 minute 2 seconds
- `database-quality` in 3 minutes 16 seconds

The staging-functional workflow correctly skipped because it is scoped to its
dedicated Phase 6.5 QA branch.

## Staging validation

Target:

- project: `BotolaGO Staging V2`
- ref: `srdrflfrfpwixsllveid`
- region: `eu-west-3`
- state: `ACTIVE_HEALTHY`

Applied hosted migration:

- version `20260724145324`
- name `admin_authorization_foundation`

The committed Admin test contracts ran transactionally on staging:

- Admin domain: PASS — 58 tests
- RLS and grants: PASS — 20 tests

Those journeys validate bootstrap, non-staff denial, active and missing
permissions, role expiry, revocation, suspension, renewal, recent-auth,
MFA assurance, metadata/profile escalation denial, approval request/decision/
execution, payload immutability, cross-user denial, direct-table denial,
session-revocation worker boundaries, idempotency, and append-only audit
enforcement.

A separate deterministic staging bootstrap journey then proved:

- first call: `created = true`
- repeat call: `created = false`
- same staff principal and assignment were returned
- exactly one synthetic bootstrap audit event was created

No owner or production account was used.

## Cleanup evidence

The deterministic staging user, MFA factor, profile, preferences, principal,
and assignment were removed in one bounded cleanup transaction. No synthetic
session or refresh token survived.

Final hosted inventory:

| Resource                            | Count |
| ----------------------------------- | ----: |
| Auth users                          |     0 |
| Auth identities                     |     0 |
| Auth sessions                       |     0 |
| Auth refresh tokens                 |     0 |
| Profiles                            |     0 |
| Preferences                         |     0 |
| Staff principals                    |     0 |
| Staff assignments                   |     0 |
| Approval requests                   |     0 |
| Admin idempotency rows              |     0 |
| Session-revocation requests         |     0 |
| Synthetic bootstrap audits retained |     1 |
| Seeded roles                        |    10 |
| Seeded permissions                  |    34 |

The retained audit is append-only, contains no credentials, is marked
synthetic, and is covered by the documented 30-day synthetic retention.

Fantasy gameweeks remain at their recorded finalized baselines. Read-only AWS
verification found zero Phase 6 EC2 instances, security groups, and key pairs.
GitHub reported zero running workflows. No runtime credential handoff or
secret-bearing artifact was created.

## Advisor review

Supabase Security Advisor reports no ERROR or WARN findings. Its Phase 7A
entries are informational `rls_enabled_no_policy` notices: the absence of
policies is intentional because the private tables are deny-by-default,
forced-RLS, and reachable only through explicit security-definer contracts.
See the [Supabase linter explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Performance Advisor reports only informational unused-index notices on the
new empty tables. The indexes cover explicit foreign keys and documented
query paths and must not be removed before representative Admin usage exists.

## Unresolved external configuration

- Staff MFA enrollment, factor recovery, and account-verification procedures
  must be configured and exercised operationally.
- A dedicated server-only Supabase Secret key must be provisioned for trusted
  bootstrap/worker environments.
- The session-revocation outbox needs its reviewed trusted worker before any
  Admin Console is activated.
- Production audit archival and deletion jobs must implement the documented
  retention windows.
- Production V2 and Legacy were not selected, modified, or migrated.

## Rollback

No existing domain table was changed. Before Admin activation, a reviewed
forward migration can revoke Phase 7A API execute grants and drop only the new
functions, private tables, and enum types in reverse dependency order. Audit
retention/export must be handled before any destructive rollback. Reverting
the repository commit alone does not roll back the hosted migration.

## Exact Phase 7B recommendation

After this foundation is reviewed and merged, build a thin server-rendered
Admin Console shell using only the protected Phase 7A contracts:

1. staff-context and fail-closed route entry;
2. active/history assignment review;
3. dual-control request and decision queues;
4. read-only privileged audit inspection;
5. trusted session-revocation worker activation.

Do not add editorial, Football, Fantasy, notification, support, job, or
release mutations until each domain operation has its own typed authorization,
recent-auth, approval, audit, and rollback contract.
