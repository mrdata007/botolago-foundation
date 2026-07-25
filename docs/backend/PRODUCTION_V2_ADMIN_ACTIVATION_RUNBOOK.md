# Production V2 Admin activation runbook

Status: **blocked pending read-only production verification**
Phase: 7E-A plan only
Repository base: `496f7d8b4bd277c979b3afe436d22da4cfc834fc`

This runbook defines the reversible Phase 7E-B sequence. It does not authorize
migrations, owner bootstrap, staff assignment, worker execution, schedules, or
Editorial CMS mutations.

## Roles and approvals

- **Owner:** approves the maintenance window, production target, backup
  evidence, migration batches and one-time owner bootstrap.
- **Migration operator:** uses the protected deployment identity and records
  checksums/results. This identity must not be shared with browser code.
- **Independent second operator:** a different person with a separate account,
  password, MFA factor and recovery material. Initial intended role:
  `security_admin`.
- **Incident owner:** named before the window and responsible for stop/restore
  decisions.
- **Reviewer:** confirms exact repository SHA and migration manifest.

The owner must record real names and contacts in the private incident system,
not in this repository.

## Gate 0 — secure target and account inputs

The protected runtime must inject, without echoing:

- `SUPABASE_PRODUCTION_PROJECT_REF`;
- the approved Production V2 URL;
- one server-only Supabase secret;
- the Management API credential for read-only platform verification;
- `OWNER_ADMIN_EMAIL` and the owner's short-lived AAL2 access token;
- `SECOND_OPERATOR_EMAIL` and, for its readiness check, that operator's
  short-lived AAL2 proof.

The runtime must derive the URL project ref, compare it to
`SUPABASE_PRODUCTION_PROJECT_REF`, require the project name
`BotolaGO Production V2`, and reject:

- Staging V2 `srdrflfrfpwixsllveid`;
- Legacy `kxpaudvntwxpahyjtxbk`;
- any organization other than the approved BotolaGO organization;
- any ambiguous or unhealthy project.

Never put an email, access token, password, MFA secret, recovery code, secret
key or database password in a command argument, shell history, artifact or PR.

## Gate 1 — backup and recovery

Before a maintenance window, an owner and reviewer must verify:

1. project health is `ACTIVE_HEALTHY`;
2. the latest successful physical/daily backup timestamp and retention;
3. whether PITR is actually enabled and its earliest/latest restore points;
4. database and Storage coverage limitations;
5. who has permission to invoke restore;
6. a recovery destination and expected downtime;
7. a tested restore or documented restore rehearsal date;
8. incident contacts and the stop authority.

Do not claim PITR merely because the plan supports it. Record `enabled`,
retention, and latest restorable point from the Dashboard or approved
Management API evidence. Supabase database restore does not restore deleted
Storage objects, so media backup/restore is a separate checkpoint.

If no acceptable backup exists, PITR state is unknown, or no authorized restore
owner is present, stop. Do not promote migrations.

## Gate 2 — migration review

1. Pin the exact reviewed main commit.
2. Generate and sign off the SHA-256 manifest for all migration files.
3. Compare hosted migration history and schema to a clean local replay.
4. Stop on an unexpected version, missing predecessor, checksum mismatch,
   schema/RPC/policy/grant/Storage drift, or unknown extension.
5. Measure populated-table/index locks on a production-like copy.
6. Approve the seven batches documented in
   `PRODUCTION_V2_MIGRATION_PREFLIGHT.md`.

The reviewed order is:

1. Foundation.
2. Identity.
3. Football.
4. News/Storage.
5. Notifications.
6. Fantasy.
7. Admin 7A–7D.

## Gate 3 — maintenance window

At the approved UTC start:

1. announce the window and incident owner;
2. freeze production releases and privileged writes;
3. confirm database health, connection headroom and backup evidence again;
4. confirm all workers/providers/schedules remain disabled;
5. capture migration, schema, policy and grant baselines;
6. start a timestamped, secret-free operator log.

### Stop conditions

Stop immediately on:

- target/ref/name/organization mismatch;
- health degradation, restart or failover;
- backup/PITR uncertainty;
- migration or schema drift;
- unexpected lock queue or blocked application traffic;
- statement timeout or migration error;
- RLS/grant/advisor regression;
- browser access to a private schema or service RPC;
- failed Auth, Admin route, or fail-closed smoke test;
- any secret appearing in output.

Do not retry a failed migration blindly and never reset Production V2.

## Gate 4 — promotion and smoke tests

For each approved batch:

1. apply only the reviewed migration files in timestamp order;
2. record start/end, migration version and sanitized result;
3. verify migration history/checksum;
4. run bounded database health and lock checks;
5. verify every new product table has forced RLS where designed;
6. verify grants and routine execution against the reviewed manifest;
7. run anonymous, authenticated-owner, cross-user-denial and service-only
   contract tests appropriate to the batch;
8. run Supabase security/performance advisors;
9. confirm application routes remain fail-closed;
10. obtain explicit reviewer approval before the next batch.

Specific batch smoke tests:

- **Foundation/Identity:** signup trigger, profile ownership, preferences,
  saved/follow ownership and cross-user denial.
- **Football:** bounded public reads, canonical-table browser write denial,
  provider/service writes disabled.
- **News:** published-only public reads, draft secrecy, saved ownership,
  sanitized content and Storage policy.
- **Notifications:** preference ownership, private destinations, browser worker
  denial; no provider or schedule invocation.
- **Fantasy:** reference reads, owner isolation, deadline/version enforcement,
  browser point/ranking write denial; no worker invocation.
- **Admin:** non-staff denial, MFA/AAL2, recent auth, private-schema denial,
  service-only readiness, self-approval denial and last-admin safeguard.

## Forward repair

Database rollback is forward-only unless the verified platform restore is
explicitly authorized:

1. stop after the failing batch;
2. disable or revoke the affected public/API surface;
3. keep workers and schedules disabled;
4. preserve audit and migration evidence;
5. write and review one corrective migration;
6. validate it from zero and against a production-like copy;
7. promote only with the same target/backup/reviewer guards.

A repository revert does not revert a hosted schema. A platform restore is an
incident action with downtime and potential data loss, not the default
rollback.

## Owner readiness and bootstrap

The owner must first:

1. register through the normal Production V2 signup flow;
2. verify the email;
3. enroll a personal MFA factor;
4. authenticate and obtain a short-lived AAL2 session;
5. supply the email and access token only through the protected runtime.

With migrations and smoke tests complete, run the existing read-only command:

```sh
bun run admin:owner-readiness
```

The protected runtime must set:

- `BOTOLAGO_ADMIN_ENVIRONMENT=production`;
- `BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF` to the independently approved ref;
- `BOTOLAGO_ADMIN_PRODUCTION_CONFIRMATION` to
  `RUN_BOTOLAGO_OWNER_READINESS_PRODUCTION`;
- Production V2 URL and server-only key;
- runtime-only owner email and AAL2 token.

Review the sanitized readiness result. It must prove one verified Auth user,
verified MFA, matching AAL2 identity, no conflicting principal/assignment and
bootstrap eligibility.

Only after a separate explicit owner approval, change the exact confirmation
to `RUN_BOTOLAGO_OWNER_BOOTSTRAP_PRODUCTION` and run:

```sh
bun run admin:bootstrap
```

Never use `--synthetic-test` in production.

Immediately verify:

- exactly one active `platform_admin` assignment;
- exactly one intended owner principal;
- bootstrap audit event and correlation;
- owner `/admin` access at AAL2;
- non-staff and AAL1 denial;
- no hidden/default account or password.

Then remove the short-lived owner token and restrict/remove the temporary
bootstrap credential path.

## Second operator

The second operator must independently:

1. register normally;
2. verify a separate email;
3. enroll a separate MFA factor;
4. authenticate at AAL2;
5. pass the same read-only identity/MFA/conflict checks.

From the protected Admin Console:

1. resolve the exact user;
2. create one staff principal;
3. assign only `security_admin` using the standard-role operation;
4. verify the narrow permission set;
5. verify the operator is not `platform_admin`;
6. verify owner-request/operator-approval and
   operator-request/owner-approval paths;
7. verify self-approval, payload mutation and duplicate execution are denied.

If no independent operator is ready, owner bootstrap may be considered
separately, but all high-risk dual-control mutations must remain disabled.

## Admin access verification

Verify these routes without enabling consumer navigation:

- `/admin`;
- `/admin/staff`;
- `/admin/staff/$principalId`;
- `/admin/approvals`;
- `/admin/audit`;
- `/admin/security`.

For each route verify server-side permission checks, non-staff denial,
MFA/AAL2, recent-auth behavior, French, Arabic, RTL, safe errors, no private
table access, no browser secret and provider-bounded revocation language.

## Emergency privilege revocation

Do not rehearse against the real owner. Use previously approved staging
evidence or a safe non-owner production rehearsal only under separate
authorization.

The canonical role/principal revocation must deny Admin authority immediately,
before provider session work. Queue the supported provider action and report
separately:

- Admin privilege revoked;
- provider action complete/retrying/dead-lettered;
- arbitrary-user global sign-out unsupported.

The last active platform administrator safeguard remains mandatory.

## Worker boundaries

Keep session-revocation, Editorial, Football/provider, notification delivery
and Fantasy workers unscheduled. Manual Admin worker commands remain
server-only and require the exact production confirmation. Do not enable a
worker as part of owner bootstrap.

## Final activation checklist

- [ ] Secure Production V2 target guard passed.
- [ ] Project healthy; compute, disk and connection state recorded.
- [ ] Backup/PITR and restore ownership verified.
- [ ] Migration/checksum/schema/RLS/grant/Storage diff clean.
- [ ] Seven migration batches promoted and smoke-tested.
- [ ] Owner readiness passed at AAL2.
- [ ] One owner bootstrap explicitly authorized and verified.
- [ ] Independent second operator ready and assigned only `security_admin`.
- [ ] Dual control and self-approval denial verified.
- [ ] Admin routes verified.
- [ ] Temporary credentials removed/restricted.
- [ ] All schedules remain disabled.
- [ ] Final evidence recorded without secrets.

Only then may Phase 7E-B be declared complete. Editorial CMS activation
requires a new reviewed phase.
