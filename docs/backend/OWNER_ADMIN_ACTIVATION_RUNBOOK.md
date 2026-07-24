# Owner Admin Activation Runbook

Status: manual, owner-authorized operation only

Default target: local or BotolaGO Staging V2

Production schedule: disabled

This runbook activates the first BotolaGO `platform_admin` without creating an
account, password, MFA factor, browser secret, or hidden administrator. The
operation is not part of deployment and must never run automatically.

## Safety boundary

Before any command:

1. record the reviewed main commit and migration version;
2. identify the exact Supabase project by URL and project ref;
3. confirm Production V2 is selected only under a separate written
   authorization;
4. use a private terminal with shell-history protection appropriate to the
   operator environment;
5. inject credentials through runtime environment variables, never command
   arguments;
6. keep all screenshots, logs, and screen shares free of credentials;
7. confirm no existing effective `platform_admin`.

The readiness command is read-only. Bootstrap is the only mutation in this
runbook.

## 1. Register a normal account

Register through the ordinary BotolaGO authentication flow. Do not use an
Admin-only registration path and do not create a default password. The account
must be a unique human identity controlled by the owner.

## 2. Verify the email

Complete Supabase Auth email verification and establish a normal authenticated
session. Readiness rejects missing, ambiguous, and unverified users with stable
codes.

## 3. Enroll MFA

Enroll a supported factor through Supabase Auth, complete its challenge, and
verify that the factor status is `verified`. Keep the TOTP secret and recovery
material outside BotolaGO logs and source control.

## 4. Establish AAL2

Reauthenticate and complete the MFA challenge. Export only the resulting
short-lived access token to `OWNER_ADMIN_ACCESS_TOKEN` in the trusted process.
The command verifies the token through Supabase Auth and requires:

- the token user ID to equal the exact owner Auth UUID;
- a verified MFA factor for that UUID;
- current assurance level `aal2`.

Factor presence alone is insufficient.

## 5. Run owner readiness

Set runtime values without committing them:

```sh
export BOTOLAGO_ADMIN_ENVIRONMENT="<local|staging|production>"
export BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF="<exact-project-ref-or-local>"
export SUPABASE_URL="<exact-supabase-url>"
export OWNER_ADMIN_EMAIL="<verified-owner-email>"
```

Inject `SUPABASE_SECRET_KEY` and `OWNER_ADMIN_ACCESS_TOKEN` through the
owner-controlled protected runtime without assigning or echoing their values in
the shell transcript.

For production only, after separate written authorization:

```sh
export BOTOLAGO_ADMIN_PRODUCTION_CONFIRMATION=RUN_BOTOLAGO_OWNER_READINESS_PRODUCTION
```

Run:

```sh
bun run admin:owner-readiness
```

Expected safe output is a single `admin_owner_readiness` record containing the
environment, exact project ref, masked email, stable readiness code, boolean
checks, and active platform-admin count. It must contain no token, factor,
password, secret, session, or full email.

Proceed only when the code is `eligible`. `already_bootstrapped` is an
idempotent verification, not permission to create another administrator.

## 6. Run bootstrap

Production requires a new purpose-specific confirmation:

```sh
export BOTOLAGO_ADMIN_PRODUCTION_CONFIRMATION=RUN_BOTOLAGO_OWNER_BOOTSTRAP_PRODUCTION
```

Then run:

```sh
bun run admin:bootstrap
```

The command reruns every readiness check before invoking the reviewed
service-only bootstrap RPC. Safe output contains only:

- environment and project ref;
- `created`;
- role name;
- staff principal UUID;
- assignment UUID.

The RPC is idempotent for the same eligible owner and creates exactly one
active `platform_admin` assignment plus append-only bootstrap audit evidence.
It does not create Auth users, passwords, factors, or secondary principals.

## 7. Verify canonical staff context

Using a fresh AAL2 owner session, call the normal protected
`api.get_my_staff_context()` contract. Verify:

- principal status is active;
- role list contains exactly the expected `platform_admin`;
- permissions are server-derived;
- session and recent-auth state are accepted;
- no service credential is used in the browser.

## 8. Verify `/admin`

Open `/admin` from a trusted device. Verify the protected shell loads only
after canonical context succeeds. Do not add an Admin entry to consumer
navigation. Test direct navigation, refresh, AAL1, expired recent auth,
forbidden, suspended, revoked, and backend-unavailable states.

## 9. Verify the audit event

Through the protected audit read model, locate the
`security.bootstrap_platform_admin` event and verify:

- actor/target correlation;
- principal and assignment references;
- `syntheticTest = false` for a real activation;
- no email, credential, token, password, factor secret, or raw session.

## 10. Restrict bootstrap credentials

Immediately after verification:

1. unset `OWNER_ADMIN_ACCESS_TOKEN`, `OWNER_ADMIN_EMAIL`, and the production
   confirmation;
2. unset or revoke the temporary server Secret key;
3. close the trusted terminal;
4. verify no `.env`, shell-history, artifact, or clipboard file was created;
5. retain only safe IDs and audit evidence.

The bootstrap RPC remains service-role-only, but its credential must not remain
available to daily browser operation.

## 11. Establish the second operator

As soon as practical, enroll a distinct human with verified email, separate
MFA, AAL2, and recent authentication. Create their staff principal and assign
only `security_admin`. Verify its exact permission catalog before using
dual-control approvals. Do not share the owner account, password, factor, or
device session.

## 12. Emergency revocation

Follow
[`ADMIN_EMERGENCY_REVOCATION_RUNBOOK.md`](./ADMIN_EMERGENCY_REVOCATION_RUNBOOK.md).
Canonical Admin denial is synchronous. Provider session handling is a queued,
bounded follow-up and must never be described as arbitrary-user global
sign-out.

The last effective `platform_admin` cannot be suspended, revoked, or stripped
of its last effective assignment. Establish recovery authority before an
emergency.

## 13. Owner MFA loss

MFA recovery is an Auth recovery procedure, not an authorization bypass:

1. recover the same Auth identity through the owner-controlled Supabase
   process;
2. remove or replace the unavailable factor;
3. verify the replacement factor;
4. create a fresh AAL2 session;
5. pass readiness/context checks again;
6. have the second operator restore staff state if policy permits.

If all platform administrators are unavailable, stop. Phase 7D provides no
online break-glass grant. Use a separately reviewed, two-person incident
procedure with complete audit evidence.

## Exit codes and rollback

- `0`: command completed with a validated safe response.
- `1`: readiness, Auth, RPC, or provider operation failed.
- `2`: worker command syntax or bounded-setting validation failed.

Bootstrap rollback revokes the assignment through the reviewed staff-security
contract after a second effective platform administrator exists. Never delete
audit evidence or reuse bootstrap as an informal recovery mechanism.
