# Phase 7E-A — Production V2 Admin activation preflight

Date: 2026-07-25
Exact main commit inspected:
`496f7d8b4bd277c979b3afe436d22da4cfc834fc`

## Verdict

# NOT READY

The repository is ready for a controlled production diff, but this execution
environment did not satisfy the mandatory production target or human-account
guards. No Production V2 project-specific request was made and no production
state was modified.

This verdict is deliberately not `READY WITH HUMAN ACCOUNT PREREQUISITES`
because backup/PITR, migration/schema drift, hosted security configuration and
the exact environment-supplied project ref remain unverified.

## Scope and target guard

Protected runtime input status:

| Input                                | Status  |
| ------------------------------------ | ------- |
| `SUPABASE_PRODUCTION_PROJECT_REF`    | MISSING |
| Production server-only Supabase key  | MISSING |
| Production Management API credential | MISSING |
| `OWNER_ADMIN_EMAIL`                  | MISSING |
| Owner short-lived AAL2 proof         | MISSING |
| `SECOND_OPERATOR_EMAIL`              | MISSING |
| Second-operator AAL2 proof           | MISSING |

The connected BotolaGO project catalog contains one candidate:

| Field        | Discovery result        |
| ------------ | ----------------------- |
| Name         | BotolaGO Production V2  |
| Ref          | `tkewgajrljbwgwedqsxn`  |
| Organization | BotolaGO                |
| Region       | `eu-west-3`             |
| Health       | `ACTIVE_HEALTHY`        |
| Database     | PostgreSQL `17.6.1.147` |
| Compute tier | UNVERIFIED              |

This discovery does not replace the required independently injected
`SUPABASE_PRODUCTION_PROJECT_REF`. Staging V2
`srdrflfrfpwixsllveid` and Legacy `kxpaudvntwxpahyjtxbk` were not queried or
modified.

## Repository and CI preflight

- PR #31 was squash-merged into main at the exact inspected commit.
- Its `application-quality` and `database-quality` checks passed.
- The repository does not configure `backend-quality` to run on pushes to
  `main`, so the merge commit itself has no separate check run.
- This preflight independently reran the required local gates.
- Working tree was clean before documentation.
- No application, migration, RLS, function or schedule code was changed.

Results:

| Gate                        | Result                                    |
| --------------------------- | ----------------------------------------- |
| Migration validation        | PASS — 35 migrations                      |
| Clean zero-to-latest replay | PASS                                      |
| pgTAP/RLS                   | PASS — 432 tests, 22 files                |
| Database lint               | PASS — zero schema errors                 |
| Generated-type drift        | PASS                                      |
| Application tests           | PASS — 385 tests, 73 files                |
| Backend Python tests        | PASS — 69 tests                           |
| Python compilation          | PASS                                      |
| Focused Admin tests         | PASS — 18 tests                           |
| Typecheck                   | PASS                                      |
| Lint                        | PASS — 0 errors, 11 pre-existing warnings |
| Production build            | PASS                                      |
| Secret scan                 | PASS                                      |

## Platform health and recovery

Only catalog-level discovery is available. The following required
Production V2 facts are **UNVERIFIED** because the hard target guard blocked
target-specific inspection:

- compute tier and disk utilization/status;
- database connection/pool configuration;
- latest successful backup and retention;
- PITR enabled state and restore window;
- restore ownership and rehearsal evidence;
- exposed schemas;
- Auth configuration;
- Storage buckets and policies;
- Edge Functions;
- Realtime publications;
- cron/schedules;
- hosted migration history and schema drift.

Production promotion is blocked until these facts are retrieved read-only
through the protected environment. Backup availability must be evidenced, not
inferred from plan defaults.

## Migration and schema result

Repository status is healthy, but hosted comparison is blocked:

- migrations present: UNVERIFIED;
- pending migrations: UNVERIFIED;
- unexpected/missing/checksum mismatch: UNVERIFIED;
- schema/function/RPC/RLS/grant/Storage drift: UNVERIFIED.

All 35 migrations are conservatively treated as candidate-pending until the
secure comparison. The reviewed plan splits promotion into Foundation,
Identity, Football, News/Storage, Notifications, Fantasy and Admin batches.
Details and per-migration lock/backfill/security/repair checks are in
`PRODUCTION_V2_MIGRATION_PREFLIGHT.md`.

## Owner readiness

**NOT EXECUTED.** Runtime owner email, server credential and matching AAL2
access token were absent. The command was not run with invented or default
identity data.

Required manual sequence:

1. Register normally in Production V2.
2. Verify the email.
3. Enroll a personal MFA factor.
4. Authenticate at AAL2.
5. Inject the owner email and short-lived access token through the protected
   runtime.
6. Rerun the read-only owner readiness preflight.

No owner account was created and bootstrap was not executed.

## Second-operator readiness

**NOT EXECUTED.** No runtime second-operator identity or AAL2 proof was
provided.

The operator must be a separate trusted person with a separate account,
password, MFA factor and recovery material. The intended initial role is only
`security_admin`. Until this person is ready, dual-control operations are not
operational and high-risk production Admin mutations must remain disabled.

## Admin Console readiness

Repository contracts are production-compatible:

- routes exist for `/admin`, `/admin/staff`,
  `/admin/staff/$principalId`, `/admin/approvals`, `/admin/audit` and
  `/admin/security`;
- access is resolved through server-owned route functions;
- non-staff, MFA/AAL2, recent-auth, suspended and revoked states fail closed;
- destructive actions map to server mutations;
- French, Arabic and RTL contracts are present;
- test IDs are unique;
- no Admin entry was added to consumer navigation;
- browser code contains no service-role credential or direct private-table
  contract;
- provider revocation language does not claim arbitrary-user global sign-out.

Focused Admin tests passed. Hosted route smoke tests remain blocked until the
migration diff and controlled promotion are approved.

## Worker and schedule state

Repository inspection found no `cron.schedule` call and no automatic production
worker schedule. Admin, Editorial, Football/provider, notification and Fantasy
workers remain implementation/manual-operation surfaces only.

Manual Phase 6 diagnostic/cleanup GitHub workflows still target the protected
staging environment; they are not production schedules. No workflow was
dispatched in Phase 7E-A.

Hosted Production V2 cron, Edge Function schedule and provider state remain
UNVERIFIED because the hard target guard blocked the production inspection.

## Security findings

Repository checks confirm:

- no committed owner or second-operator email;
- no default Admin password;
- no client service credential;
- no browser direct `app_private` access;
- no standard-role path to `platform_admin`;
- self-approval and last-platform-admin safeguards are tested;
- MFA/AAL2 and recent-auth contracts are tested;
- audit contracts are append-only;
- canonical Admin denial precedes provider session work;
- arbitrary-user global sign-out limitation is documented honestly;
- secret scan passes.

No claim is made about hosted Production V2 grants or configuration until the
secure diff runs.

## Exact Phase 7E-B plan

1. Configure a protected production environment with the exact project ref,
   URL, Management API credential and server-only key.
2. Rerun Phase 7E-A read-only target, health, backup/PITR, migration, schema,
   RLS, grant, Storage, Auth, Edge Function, Realtime and schedule inspection.
3. Resolve every drift item and require a `READY` or
   `READY WITH HUMAN ACCOUNT PREREQUISITES` verdict.
4. Verify backup/PITR, restore owner, incident contacts and maintenance window.
5. Promote the seven reviewed migration batches, stopping for smoke tests and
   health review after each.
6. Rerun owner readiness with the real owner at AAL2.
7. Obtain explicit authorization and execute the one-time owner bootstrap.
8. Verify exactly one owner `platform_admin` assignment, audit event and
   protected `/admin` access.
9. Establish the independent operator and assign only `security_admin`.
10. Verify narrow permissions, self-approval denial and the dual-control queue.
11. Retain staging emergency-revocation evidence or separately authorize a
    safe non-owner rehearsal; never revoke the real owner as a drill.
12. Remove/restrict bootstrap credentials and keep every production worker
    schedule disabled.
13. Record secret-free evidence and stop before Editorial CMS activation.

## Rollback and next action

There is nothing to roll back from Phase 7E-A: no cloud mutation, migration,
account creation, role assignment, worker invocation or schedule change
occurred.

The next action is **not Phase 7E-B execution**. It is a repeat of this
read-only preflight from an owner-approved protected production environment
containing the missing target and account inputs. Only a clean repeat may
authorize the controlled activation window.
