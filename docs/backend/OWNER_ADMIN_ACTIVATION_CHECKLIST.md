# Owner Administrator Activation Checklist

Use this checklist only after the Phase 7C migration, CI, and staging evidence
have been reviewed. No owner email, password, token, MFA secret, or recovery
code belongs in source control, shell history, issue text, pull-request text,
logs, screenshots, or shared artifacts.

## Prerequisites

- [ ] Confirm the target is BotolaGO Production V2, not Staging V2 or Legacy.
- [ ] Confirm the reviewed Admin migrations are applied from the approved main
      commit.
- [ ] Confirm no default Admin identity, password, email, or MFA factor exists.
- [ ] Confirm the trusted bootstrap environment contains only short-lived,
      owner-controlled credentials.
- [ ] Confirm the emergency recovery/revocation procedure and second-operator
      plan are understood.

## Activate the first real administrator

1. [ ] Register an ordinary BotolaGO account through Supabase Auth.
2. [ ] Verify the account email.
3. [ ] Enroll a supported MFA factor.
4. [ ] Complete the MFA challenge and verify the session reports AAL2.
5. [ ] From a trusted operator environment, run:

   ```text
   bun run admin:bootstrap --email="<verified-owner-email>"
   ```

6. [ ] Confirm the command returns one `platform_admin` assignment and does not
       create a user, password, session, or MFA factor.
7. [ ] Open `/admin` with a fresh AAL2 session and confirm access succeeds.
8. [ ] Confirm the current staff context contains the expected
       `platform_admin` role and explicit permissions.
9. [ ] Confirm the append-only audit ledger contains
       `security.bootstrap_platform_admin` with the correct environment and
       `synthetic_test = false`.
10. [ ] Remove/restrict the temporary bootstrap credential handoff and verify
        it is absent from local files, CI artifacts, logs, and clipboard
        managers.
11. [ ] Verify the emergency revocation path denies Admin authorization
        synchronously and describes provider session invalidation accurately.

## Establish dual control

- [ ] Resolve a second verified, MFA-enrolled user through exact lookup.
- [ ] Create their staff principal without granting a role.
- [ ] As the platform administrator, grant the second operator
      `security_admin`.
- [ ] Verify the second operator has AAL2 and recent authentication.
- [ ] Exercise one synthetic, non-production approval request and verify
      requester/approver separation.
- [ ] Confirm the last-platform-admin safeguard blocks destructive removal when
      only one effective platform administrator would remain.

## Final evidence

- [ ] No service-role credential is present in browser code or browser storage.
- [ ] `app_private` and Auth tables have no browser grants.
- [ ] No production worker schedule was activated by Phase 7C.
- [ ] The revocation UI says “privileged Admin access revoked; session
      invalidation requested where supported.”
- [ ] Production V2 has no synthetic elevated identity or mutable approval
      state.
