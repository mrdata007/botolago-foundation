# Admin Bootstrap Runbook

## Purpose

This runbook creates the first BotolaGO V2 `platform_admin`. It does not create
an Auth user, password, session, or MFA factor. It must run once from a trusted
developer/server environment and must never run in a browser.

## Prerequisites

1. Confirm the target project and environment. Never use Production V2 or
   Legacy during Phase 7A staging validation.
2. Register the intended staff user through the normal Supabase Auth flow.
3. Verify the user's email.
4. Enroll a TOTP factor and complete its verification. A separately stored
   backup factor is strongly recommended.
5. In the Supabase dashboard, open **Authentication → Multi-Factor
   Authentication** and confirm TOTP challenge and verification are enabled.
6. Create a dedicated server-only Secret API key for the operation. Do not use
   a publishable key, do not give it a `VITE_` prefix, and do not place it in
   shell history, source control, issue text, or logs.
7. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the secure runtime.

## Execution

From the reviewed repository commit:

```sh
bun run admin:bootstrap --email="<verified-user-email>"
```

For synthetic staging validation only:

```sh
bun run admin:bootstrap --email="<synthetic-verified-user-email>" --synthetic-test
```

The command performs a bounded Auth Admin lookup, requires exactly one
confirmed user and one verified MFA factor, then calls the service-only
bootstrap RPC with the immutable Auth UUID. It never prints either server
credential. The safe output contains only principal/assignment UUIDs and
whether the same bootstrap already existed.

## Verification

1. Sign in through normal Supabase Auth.
2. Complete the MFA challenge so the JWT carries `aal2`.
3. Use a session created within the last 15 minutes.
4. Call `api.get_my_staff_context()`.
5. Confirm:
   - `status = active`;
   - role includes `platform_admin`;
   - explicit permissions are present;
   - `emailVerified`, `mfaEnrolled`, and `accessAllowed` are true.
6. Confirm an append-only `security.bootstrap_platform_admin` audit event
   exists through the authorized audit API.

The command is idempotent for the same already-bootstrapped user. It refuses a
different user after the first live platform administrator exists.

## Normal staff provisioning after bootstrap

Never use the bootstrap command for subsequent staff. Use the protected staff
assignment RPCs. `platform_admin` assignment requires a second qualified
operator, an unexpired payload-matched approval, MFA, and recent
authentication.

## Rollback and staging cleanup

For a synthetic staging bootstrap:

1. emergency-revoke the synthetic principal;
2. process its session-revocation request through the Auth Admin API;
3. verify all Admin RPCs deny the synthetic identity;
4. remove mutable synthetic approvals, idempotency rows, revocation requests,
   assignments, and principal records in bounded trusted cleanup;
5. delete the synthetic Auth user through the Auth Admin API;
6. retain the append-only audit event with `synthetic_test=true`, or purge it
   only under the documented staging test-retention policy after 30 days;
7. delete the temporary Secret API key and clear runtime environment state.

Never drop or rewrite audit history to roll back a real administrator.

## Emergency revocation

Use `api.admin_emergency_revoke_staff` from a different active principal with
`security.revoke_staff`. This immediately removes canonical authorization,
revokes every live assignment, queues Auth session invalidation, and writes an
audit event. Complete the queued revocation synchronously through the Auth
Admin API. A revoked principal cannot be restored; create a new reviewed
assignment after credential and MFA recovery.

If no qualified administrator remains, use a separately reviewed trusted
recovery procedure. Do not edit JWT metadata, profiles, or Auth user metadata
to grant access.

## Secret handling

- Prefer one Secret API key per trusted backend component.
- Keep it only in an encrypted secret store or process environment.
- Never pass it as a URL/query argument.
- Never print, hash-prefix beyond six characters, upload, or commit it.
- Remove the runtime value after use and delete temporary keys.
- Access-token, refresh-token, JWT, password, and MFA secrets never belong in
  audit metadata.
