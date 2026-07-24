# Phase 7C — Staff Administration, Approval Execution and Security Operations

## Verdict

Phase 7C is complete and ready for review. It operationalizes staff security
administration on top of the merged Phase 7A authorization foundation and
Phase 7B control-plane runtime. It does not add Editorial CMS mutations,
Football or Fantasy corrections, notification campaigns, support-account
operations, provider activation, production schedules, or the final polished
Admin Console.

## Base and delivery

- Base commit: `5358a2ffcb731358e4aad102f4ca233809c4fa3c`
- Branch: `backend/admin-security-operations`
- Draft PR: [#30](https://github.com/mrdata007/botolago-foundation/pull/30)
- Staging target: `BotolaGO Staging V2`
  (`srdrflfrfpwixsllveid`, `eu-west-3`)
- Production V2 and Legacy: untouched

The implementation and the retained published history are additive. No
existing migration was rewritten.

## Architecture summary

Supabase Auth UUIDs remain the only staff identity authority. Canonical staff
authorization remains relational and private under `app_private`. Browser
code receives bounded DTOs through controlled `api` RPCs and cannot read or
write Auth or Admin tables directly.

Every sensitive mutation rechecks:

1. the current Supabase Auth session;
2. verified email and verified MFA enrollment;
3. JWT assurance level `aal2`;
4. server-measured recent authentication;
5. the caller's explicit permission;
6. target eligibility and safety invariants;
7. an idempotency key or immutable approval fingerprint where applicable.

Canonical authorization is checked on every Admin operation. Revocation and
suspension therefore deny privileged Admin access synchronously, independent
of later Auth-session invalidation work.

The complete design is in
`docs/backend/ADMIN_SECURITY_OPERATIONS_PLAN.md`; operation-level contracts
are in `docs/backend/ADMIN_SECURITY_OPERATIONS_API_CONTRACTS.md`.

## Identity resolution and principal creation

`api.admin_resolve_staff_user_exact` performs one normalized,
case-insensitive exact-email lookup. It has no list, prefix, substring, or
fuzzy-search mode. The result is bounded to a masked email, canonical Auth
UUID, verification/MFA eligibility, principal state, and safe assignment
summaries. It never returns credentials, tokens, sessions, password data, or
private Auth metadata.

`api.admin_create_staff_principal` requires
`security.manage_staff`, AAL2, recent authentication, verified email, and a
verified MFA factor. Creation is idempotent and grants no role implicitly.

## Staff mutation model

Standard roles are selected only from the server-owned catalog. Eligible
security administrators may assign, renew, shorten, and revoke approved
standard roles. `security_admin` can be assigned only by a current
`platform_admin`. Arbitrary role names and client-supplied permission sets are
rejected.

Assignments retain grantor, reason, reference, server timestamps, expiry, and
renewal ancestry. Revocation is immediate and idempotent. Revoked and expired
history is never silently reactivated.

Staff suspension blocks every Admin authorization path while preserving
history. Restoration returns only the principal state to active; it does not
restore expired or revoked assignments. Emergency revocation atomically
revokes effective assignments and queues invalidation work. The last effective
platform administrator cannot be removed through normal online operations.

## Platform-admin dual control

The one-time trusted bootstrap remains the only direct first-platform-admin
exception. Every later `platform_admin` grant uses:

1. an immutable request from a qualified requester;
2. a canonical payload fingerprint;
3. review by a different qualified approver;
4. transition-level MFA, recent-auth, permission, expiry, and eligibility
   checks;
5. execution-time fingerprint and assignment-conflict checks;
6. row locking and retained execution state for exactly-once behavior;
7. correlated append-only audit evidence.

Self-approval, direct assignment, payload mutation, expired approval, duplicate
execution, and changed target eligibility fail with stable errors.

## Session invalidation and worker behavior

Access-changing mutations enqueue deduplicated
`staff_session_revocation_requests`. The trusted Phase 7B worker claims bounded
batches, leases work, recovers stale leases, retries bounded failures, and
dead-letters exhausted work. Browser roles cannot claim or complete work.

The product language remains exact:

- privileged Admin access is revoked synchronously;
- session invalidation is requested where supported.

Supabase does not provide a supported arbitrary-user global sign-out operation.
The worker never reports that all sessions were terminated without evidence
and stores no tokens.

## Functional Admin routes

Phase 7C adds protected, narrow verification surfaces:

- `/admin/staff`
- `/admin/staff/$principalId`
- `/admin/approvals`
- `/admin/audit`
- `/admin/security`

They use route-specific permission checks, current-staff context, safe
reauthentication states, stable errors, loading/empty states, French and
Arabic copy, RTL-safe layout, keyboard navigation, visible focus, accessible
labels, and mobile-sized controls. They are not linked from consumer
navigation and do not redesign consumer UI.

The browser does not retain passwords, MFA challenges, access tokens, or
pending privileged payloads. When recent authentication expires, the
administrator reauthenticates through Supabase Auth and re-submits the
operation so the server revalidates it.

## Migration, RLS, and grants

Committed migration:

- `20260724185438_admin_security_operations.sql`

Hosted Staging V2 migration:

- version `20260724220603`
- name `admin_security_operations`

The migration extends the existing private Admin schema and controlled API
surface; it creates no public browser-write path. Every Admin product table is
forced-RLS. Independent hosted inspection confirmed that `anon` and
`authenticated` have no `SELECT`, `INSERT`, `UPDATE`, or `DELETE` privilege on:

- `staff_principals`
- `staff_role_assignments`
- `admin_approval_requests`
- `admin_idempotency_keys`
- `staff_session_revocation_requests`
- `admin_audit_events`
- `admin_worker_runs`

Trusted operations receive only explicit function execution grants. The
service role is not present in browser code or client configuration.

## Local and CI validation

| Gate                             | Result                                                 |
| -------------------------------- | ------------------------------------------------------ |
| Migration validation             | PASS — 34 migrations                                   |
| Clean migration replay from zero | PASS                                                   |
| Complete pgTAP/RLS suite         | PASS — 408 assertions in 20 files                      |
| Hosted Admin pgTAP/RLS           | PASS — 141 assertions                                  |
| Database product-schema lint     | PASS — no errors                                       |
| Generated-type drift             | PASS                                                   |
| Application tests                | PASS — 364 tests in 69 files                           |
| Targeted Admin tests             | PASS — 31 tests                                        |
| Backend Python tests             | PASS — 69 tests                                        |
| Typecheck                        | PASS                                                   |
| Production build                 | PASS                                                   |
| Lint                             | PASS — 0 errors, 11 pre-existing Fast Refresh warnings |
| Secret scan                      | PASS                                                   |
| Targeted formatting              | PASS                                                   |

GitHub checks on head `12899af5467d3f61259274e342a8163154e54369`:

- `application-quality`: PASS
- `database-quality`: PASS
- `staging-functional`: skipped as expected by its unrelated path filter

The second commit scopes one Phase 7A audit-count assertion to its
deterministic target. It changes no production schema, authorization logic, or
runtime behavior and prevents the intentionally retained synthetic bootstrap
audit from contaminating later hosted test runs.

## Staging validation

The project was independently verified as:

- name: `BotolaGO Staging V2`
- ref: `srdrflfrfpwixsllveid`
- region: `eu-west-3`
- status: `ACTIVE_HEALTHY`
- PostgreSQL: `17.6.1.147`

The reviewed migration was applied only to that project. Deterministic
transactional fixtures covered:

- normal non-staff user;
- editor;
- security administrator;
- platform-admin requester;
- independent platform-admin approver;
- suspended principal;
- expired-assignment principal.

Hosted database journeys validated exact identity resolution, eligible and
ineligible principal creation, standard-role assignment/expiry/renewal/
revocation, platform-admin dual control, self-approval denial, fingerprint
immutability, exactly-once execution, last-admin protection, suspension,
restoration, emergency revocation, MFA and recent-auth denial, synchronous
authorization denial after revocation, outbox deduplication, bounded worker
claim/completion, stale-lease recovery, approval and audit reads, cross-role
denial, direct-table denial, and service-only worker operations.

Functional route contracts, French/Arabic behavior, RTL, authorization states,
and accessibility behavior passed deterministic application tests and the
production build. No hosted UI deployment or production schedule activation
was part of this phase.

## Cleanup evidence

Hosted test fixtures ran inside explicit transactions and rolled back. A
separate post-validation inventory confirmed:

| Resource                            | Count |
| ----------------------------------- | ----: |
| Auth users                          |     0 |
| Auth sessions                       |     0 |
| Auth MFA factors                    |     0 |
| Staff principals                    |     0 |
| Staff role assignments              |     0 |
| Approval requests                   |     0 |
| Admin idempotency rows              |     0 |
| Session-revocation requests         |     0 |
| Admin worker runs                   |     0 |
| Non-synthetic Admin audit events    |     0 |
| Retained synthetic bootstrap audits |     1 |
| Admin production schedules          |     0 |

The retained Phase 7A audit event is append-only, contains no credential, is
marked `synthetic_test = true`, and remains covered by the documented 30-day
staging retention policy. Phase 7C created no Metrics key, AWS resource,
credential handoff, session cache, or secret-bearing artifact.

## Advisor review

Supabase Security Advisor reports no ERROR or WARN finding. Its Admin findings
are informational `rls_enabled_no_policy` notices. The absence of permissive
policies is intentional: these private tables use forced RLS, have no browser
table privileges, and are reachable only through controlled security-definer
contracts. See the
[Supabase linter explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Performance Advisor reports informational unused-index notices on the empty
Admin tables. The indexes cover foreign keys and documented operational read
paths and should not be removed before representative Admin usage exists. See
the
[unused-index advisory](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Hosted limitations and remaining risks

- Arbitrary-user global Supabase sign-out is unsupported. Admin privilege
  denial is synchronous; Auth-session work remains accurately provider-bounded.
- Staff MFA enrollment, recovery, and owner reauthentication procedures remain
  hosted operational configuration.
- No production worker schedule is activated.
- The first real owner account has not been bootstrapped. Activation requires
  the separately reviewed
  `docs/backend/OWNER_ADMIN_ACTIVATION_CHECKLIST.md`.
- Dual control requires a second qualified operator before future
  platform-admin grants can execute.
- The narrow routes are functional security surfaces, not the final visual
  Admin Console.

## Rollback

Rollback is forward-only and evidence-preserving:

1. stop using the Phase 7C routes and mutation RPCs;
2. revoke their execute grants in a reviewed forward migration;
3. restore Phase 7B function definitions from source where an overridden
   contract must be removed;
4. retain assignments, approvals, audit events, and revocation evidence;
5. keep all worker schedules disabled.

No destructive down migration, legacy reconciliation, production database
change, or audit deletion is required.

## Phase 7D recommendation

After Phase 7C is reviewed and merged, Phase 7D should be a separately scoped
Admin activation and console-productization phase:

1. execute the owner activation checklist under explicit Production V2
   authorization;
2. establish and test the second-operator dual-control path;
3. exercise emergency revocation and the manual trusted worker runbook;
4. add the final polished Admin Console navigation and interaction layer on
   top of these frozen security contracts;
5. keep Editorial, Football, Fantasy, Notification, and support mutations out
   until their own domain-specific approval and audit designs are reviewed.

Do not activate production schedules or begin domain correction operations as
part of Phase 7D planning without separate authority.
