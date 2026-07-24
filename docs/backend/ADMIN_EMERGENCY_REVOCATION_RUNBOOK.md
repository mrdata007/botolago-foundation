# Admin Emergency Revocation Runbook

Purpose: immediately deny a compromised or unsafe staff identity while
honestly tracking the bounded provider session action.

## Preconditions

- exact Staging V2 or separately authorized Production V2 target;
- active operator with `security.revoke_staff`, AAL2, and recent auth;
- exact target principal and safe incident reason;
- second human observing where circumstances permit;
- confirmation that the target is not the last effective
  `platform_admin`;
- worker key available only in a trusted terminal;
- no worker schedule is enabled.

Never place an access token, refresh token, password, MFA secret, email, or
provider response body in the reason.

## Canonical emergency action

1. Open the target staff detail through the protected read model.
2. Verify the immutable principal ID, masked identity summary, active
   assignments, and target status.
3. Enter a credential-free reason and confirm the destructive action.
4. Invoke `api.admin_emergency_revoke_staff` with a fresh UUID idempotency key.
5. Record the safe result and correlation ID.

The database transaction:

- locks the target;
- enforces the last-platform-admin and self-escalation safeguards;
- changes the principal to revoked;
- revokes all effective assignments;
- writes the correlated audit event;
- enqueues one deduplicated provider-bounded revocation request.

The successful mutation means **Admin privilege revoked**. It does not mean
all consumer Auth sessions were deleted.

## Immediate denial verification

Using the target's still-valid synthetic consumer session in staging:

1. call `api.get_my_staff_context()` and expect revoked/denied state;
2. call every protected Admin read/mutation used in the drill and expect
   denial;
3. navigate directly to `/admin` and expect the revoked state;
4. confirm no mutation occurred after the emergency timestamp.

Server RPCs are the security boundary. Client route guards are only
presentation.

## Queue and worker verification

Inspect bounded status:

```sh
bun run admin:revocation-worker --status
```

Process one bounded invocation:

```sh
bun run admin:revocation-worker --once
```

Inspect status again and verify the same correlation chain. Safe outcomes are:

- canonical Admin privilege: `revoked`;
- provider action: completed where the supported lookup/action completed;
- arbitrary-user global sign-out: `unsupported`, never claimed;
- retryable failure: queued with bounded backoff;
- permanent/exhausted failure: `dead_letter`.

The worker lease, retry ceiling, and idempotency contract prevent two workers
from applying duplicate transitions.

## Dead-letter handling

Do not replay until the provider/configuration cause is understood and a human
has approved one request. Use:

```sh
export BOTOLAGO_ADMIN_REPLAY_CONFIRMATION=REPLAY_ONE_ADMIN_REVOCATION
export BOTOLAGO_ADMIN_REPLAY_REASON="<credential-free-reviewed-reason>"
bun run admin:revocation-worker --replay="<request-uuid>"
```

Then run one bounded `--once` invocation and verify the correlated result.
Repeated or bulk replay is unsupported.

## Idempotency drill

In Staging V2, repeat the emergency mutation with the same idempotency key and
payload. The retained response must be returned without a second audit/outbox
effect. A conflicting payload/key reuse must fail. Repeat worker processing
must not duplicate completion.

## Last-admin response

If `last_platform_admin_required` is returned, stop. Do not use direct SQL or a
hidden force flag. Establish another reviewed platform administrator or invoke
a separately authorized incident recovery procedure before revoking the last
one.

## Cleanup and evidence

For a synthetic rehearsal:

1. complete/remove mutable synthetic outbox and worker records where policy
   allows;
2. revoke/remove synthetic assignments and principals;
3. delete synthetic Auth users and factors through Auth Admin;
4. verify sessions and refresh tokens are gone for those users;
5. retain required append-only audit rows marked `synthetic_test=true`;
6. verify zero active synthetic elevated access and zero credentials/artifacts.

Required evidence: target/correlation IDs, pre/post canonical state, denial
results, outbox state, worker outcome, idempotency result, audit event names,
and exact cleanup counts. Never retain tokens or full provider payloads.
