# Phase 7E-A — Production V2 Admin activation preflight

Date: 2026-07-25
Exact main commit inspected:
`9b697151e3f1e904c67e8cce3a2162cffa7e2f6c`
Protected run:
`https://github.com/mrdata007/botolago-foundation/actions/runs/30151901483`

## Verdict

# READY WITH HUMAN ACCOUNT PREREQUISITES

The protected, read-only preflight proved the Production V2 target, platform
ownership, health, backup availability, empty migration baseline and disabled
schedule state. Production V2 was not modified.

The remaining prerequisites are human and procedural: the owner and an
independent second operator must register normally, verify their email
addresses, enroll separate MFA factors and prove fresh AAL2 sessions. The
one-time owner bootstrap remains a separately authorized Phase 7E-B action
after the seven controlled migration groups have been promoted and verified.

## 1. Production V2 identity

| Field              | Inspected result                                     |
| ------------------ | ---------------------------------------------------- |
| Project name       | `BotolaGO Production V2`                             |
| Project ref        | `tkewgajrljbwgwedqsxn`                               |
| Organization       | `BotolaGO`; authenticated account ownership verified |
| Region             | `eu-west-3`                                          |
| Health             | `ACTIVE_HEALTHY`                                     |
| Target environment | `production-v2`                                      |
| Auth endpoint      | HTTP 200                                             |
| Known staging ref  | `srdrflfrfpwixsllveid`; explicitly rejected          |
| Legacy             | Not queried                                          |

The target guard validated the protected environment before any request. Both
the Management API project response and the guarded Production URL matched the
expected ref. Credential values were masked, kept in workflow runtime only and
removed at job completion.

## 2. Health, compute and PostgreSQL

| Field               | Result                                                       |
| ------------------- | ------------------------------------------------------------ |
| PostgreSQL          | `17.6.1.147`, engine `17`, GA release channel                |
| Compute             | No selected paid compute add-on; paid-plan default **Micro** |
| Disk                | 2 GB `gp3`, 3,000 IOPS, 125 MiB/s configured throughput      |
| PostgREST max rows  | 1,000                                                        |
| API exposed schemas | `public`, `graphql_public` only                              |

The Management API returned no selected compute add-on. Because successful
daily platform backups establish a paid plan and Supabase documents Micro as
the paid-plan default, the effective pre-activation compute is classified as
Micro. Capacity selection remains an activation decision; no resize occurred.

## 3. Backup and PITR

Classification: **daily backup verified, PITR disabled and accepted**.

| Field                         | Result                         |
| ----------------------------- | ------------------------------ |
| Successful retained backups   | 7                              |
| Latest successful backup      | `2026-07-25T01:15:31.475Z`     |
| Oldest returned backup        | `2026-07-19T19:24:13.100Z`     |
| Observed daily retention      | 7 retained restore points      |
| WAL-G/physical backup process | Enabled                        |
| PITR                          | Disabled                       |
| PITR restore window           | Not applicable                 |
| Restore availability          | Daily restore points available |

PITR was not enabled and no billing setting changed. Before the migration
window, the owner must name the incident/restore operator, confirm Dashboard
restore permissions and accept the daily-backup recovery-point objective.
Storage object bytes are not restored by a database backup and require a
separate media recovery decision before Editorial activation.

## 4. Migration, schema, RLS and grant drift

Production V2 is a clean, uninitialized greenfield target:

| Comparison                       | Result                                                   |
| -------------------------------- | -------------------------------------------------------- |
| Repository migrations            | 35                                                       |
| Hosted migration rows            | 0                                                        |
| Present repository migrations    | 0                                                        |
| Pending repository migrations    | 35, in deterministic timestamp order                     |
| Unexpected hosted migration rows | 0                                                        |
| Checksum mismatch                | None possible; no hosted migration row exists            |
| Repository-owned schemas         | `api`, `app`, `app_private` absent, as expected pre-push |
| Repository-owned relations       | 0                                                        |
| Repository-owned routines/RPCs   | 0                                                        |
| Repository-owned RLS policies    | 0                                                        |
| Repository-owned grants          | 0                                                        |
| Storage buckets/policies         | 0 / 0                                                    |
| Schema/RPC/RLS/grant drift       | No unexpected hosted V2 objects; baseline is understood  |
| Exposed-schema drift             | None; only `public`, `graphql_public` are exposed        |

The absence of repository-owned objects is not treated as unexpected drift:
this is the approved empty Production V2 baseline. It means every migration
must be promoted in Phase 7E-B; it does not authorize a single unreviewed
all-at-once push.

## 5. Exposed schemas, Realtime, Edge Functions and schedules

| Surface                    | Read-only result                           |
| -------------------------- | ------------------------------------------ |
| PostgREST exposed schemas  | `public`, `graphql_public`                 |
| `app_private` exposure     | Not exposed; schema not yet created        |
| Realtime publication       | `supabase_realtime`, zero published tables |
| Edge Functions             | 0                                          |
| Storage buckets            | 0                                          |
| `pg_cron` catalog          | Not installed/exposed                      |
| Active cron jobs           | 0                                          |
| Production worker schedule | 0                                          |

No Admin revocation, Football ingestion, News ingestion, notification
delivery, Fantasy scoring/finalization or capacity/load schedule is active.
Repository operational workflows remain manually dispatched and do not
constitute production schedules.

## 6. Migration promotion groups and stop points

| Group | Scope            | Phase 7E-A classification                              |
| ----- | ---------------- | ------------------------------------------------------ |
| 1     | Foundation       | Safe to promote; mandatory smoke-test stop             |
| 2     | Identity         | Safe to promote after Group 1 stop                     |
| 3     | Football         | Safe to promote after Group 2 stop                     |
| 4     | News and Storage | Safe to promote after Group 3 stop                     |
| 5     | Notifications    | Safe with providers/schedules disabled; mandatory stop |
| 6     | Fantasy          | Safe with workers/schedules disabled; mandatory stop   |
| 7     | Admin 7A–7D      | Requires separate stop before any human bootstrap      |

No group is blocked by drift or backup readiness. “Safe to promote” means
eligible for the reviewed Phase 7E-B window only: pin the manifest, apply one
group, verify migration history, health, RLS, grants, API denial and
fail-closed behavior, then obtain reviewer approval before continuing.

## 7. Owner-account prerequisite

Status: **human prerequisite incomplete; not a platform-readiness failure**.

Required sequence:

1. The intended owner registers through normal Production V2 signup.
2. The owner verifies the email through the standard verification flow.
3. The owner enrolls a personal MFA factor and secures recovery material.
4. The owner reauthenticates and proves a fresh AAL2 session.
5. The email and short-lived AAL2 proof are injected only into the protected
   activation runtime.
6. Run the read-only owner-readiness operation.
7. After migrations, smoke tests and separate explicit approval, execute the
   one-time owner bootstrap.

No owner account, principal, assignment or role was created in Phase 7E-A.

## 8. Second-operator prerequisite

Status: **human prerequisite incomplete; not a platform-readiness failure**.

The second operator must be a different trusted person with a separate
account, password, verified email, MFA factor, recovery material and fresh AAL2
session. After owner bootstrap, the owner must create the operator principal
through the reviewed Admin path and assign only `security_admin`. Owner and
operator must verify both directions of dual control; self-approval remains
forbidden.

## 9. Admin Console contract readiness

Repository contracts are ready for controlled activation:

- Admin routes resolve authority server-side and fail closed;
- non-staff, AAL1, stale-auth, suspended and revoked states are denied;
- browser code has no service-role/secret-key contract or direct
  `app_private` access;
- standard role assignment cannot grant `platform_admin`;
- the one-time bootstrap is the only direct initial platform-admin path;
- self-approval, payload mutation and last-platform-admin safeguards are
  enforced;
- audit records are append-only;
- French, Arabic and RTL route contracts remain intact;
- provider revocation does not claim unsupported arbitrary-user global
  sign-out.

Hosted Admin smoke tests remain a Phase 7E-B stop after Group 7 because the
Admin schema is correctly absent before migration promotion.

## 10. Security findings

- No default Admin password or committed owner/operator email exists.
- No browser service-role or server secret credential was found.
- `app_private` is not exposed through PostgREST.
- MFA/AAL2 and recent-auth requirements remain part of the Admin contracts.
- Dual control and self-approval denial remain mandatory.
- No production worker, Edge Function or cron schedule is active.
- Audit authority remains server-owned and append-only.
- Session revocation documentation accurately distinguishes BotolaGO Admin
  denial from provider session revocation and does not promise arbitrary-user
  global sign-out.
- Protected workflow artifacts contain sanitized inventory only; raw
  Management API responses and credentials were destroyed at job completion.

## 11. Exact Phase 7E-B sequence

1. Pin `9b697151e3f1e904c67e8cce3a2162cffa7e2f6c` or a newly reviewed main
   commit and generate the 35-file SHA-256 migration manifest.
2. Name the incident owner, restore operator and reviewer; reconfirm the latest
   daily backup and accept PITR-disabled recovery.
3. Freeze releases and privileged writes; prove the Production V2 guard again.
4. Promote Group 1 (Foundation); verify history, schemas, forced-RLS defaults,
   grants and fail-closed application behavior; stop for review.
5. Promote Group 2 (Identity); verify profile trigger, ownership, cross-user
   denial and Auth flows; stop for review.
6. Promote Group 3 (Football); verify public DTO reads and browser write
   denial; keep ingestion disabled; stop for review.
7. Promote Group 4 (News/Storage); verify published-only reads, draft secrecy,
   ownership and Storage policy; keep ingestion disabled; stop for review.
8. Promote Group 5 (Notifications); verify preference ownership and
   worker-only contracts; keep delivery disabled; stop for review.
9. Promote Group 6 (Fantasy); verify ownership, deadlines, versions and
   worker-only scoring/rank writes; keep workers disabled; stop for review.
10. Promote Group 7 (Admin 7A–7D); verify private-schema denial, MFA/AAL2,
    recent auth, audit, dual control and service-only readiness; stop.
11. Complete the owner signup/email-verification/MFA/AAL2 sequence and run
    owner readiness read-only.
12. Obtain separate explicit authorization for the one-time owner bootstrap;
    verify exactly one intended `platform_admin` and its audit event.
13. Complete the independent operator signup/MFA/AAL2 sequence; assign only
    `security_admin` and verify bidirectional dual control.
14. Remove short-lived bootstrap credentials, retain sanitized evidence and
    keep every worker/provider/schedule disabled.
15. Stop before Editorial CMS activation; that requires a separate reviewed
    phase.

## 12. Mutation and rollback statement

Phase 7E-A performed no migration, account creation, principal creation, role
assignment, bootstrap, worker invocation, schedule change, billing change or
Production V2 write. There is nothing to roll back. The next authorized action
is the controlled Phase 7E-B migration window after the human/operator
prerequisites and recovery ownership are scheduled.
