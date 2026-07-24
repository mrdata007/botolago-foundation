# Admin Control Plane Runbook

Phase 7B provides a protected read-only shell and a trusted
session-revocation worker. It does not enable a production schedule.

## Environment guard

Before any invocation:

1. record the reviewed repository commit;
2. select one explicit environment;
3. verify the Supabase URL/ref pair;
4. verify the key is server-only and has no `VITE_` prefix;
5. confirm Production V2 and Legacy are not selected for tests;
6. confirm no other worker run uses the same worker ID.

Never print the service/Secret key, user JWTs, refresh tokens, passwords, or
MFA secrets.

## Local deterministic invocation

Start and reset local Supabase, then run the pgTAP tests:

```sh
bun run backend:db:start
bun run backend:db:reset
bun run backend:db:test
```

The worker core uses injected fake Auth Admin responses in unit tests:

```sh
bun test src/backend/admin/session-revocation-worker.test.ts
```

For an actual local worker process, set local `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` outside source control:

```sh
BOTOLAGO_ADMIN_WORKER_ID=local-admin-worker \
BOTOLAGO_ADMIN_SYNTHETIC_TEST=true \
bun run admin:session-revocations
```

Safe output contains only run IDs and aggregate counts.

## Protected staging invocation

Use a protected owner-approved runtime with Staging V2 values:

- ref: `srdrflfrfpwixsllveid`;
- secret/role key: environment secret;
- `BOTOLAGO_ADMIN_SYNTHETIC_TEST=true`;
- unique worker ID;
- batch size no larger than 25 for validation;
- no schedule or retrying workflow.

Create only deterministic synthetic users through the supported Auth Admin
API. Establish principals/assignments through the reviewed contracts. Invoke
the worker once, inspect the safe worker-health RPC, then perform bounded
cleanup. Do not alter the owner's real account.

## Operational interpretation

Canonical Admin privilege is removed synchronously by the role/principal
mutation. The outbox is not the authorization boundary. A worker delay cannot
restore revoked access.

The currently supported Supabase Auth Admin API cannot globally sign out an
arbitrary user by UUID. The worker therefore verifies the target through
`auth.admin.getUserById` and completes privileged-session invalidation without
claiming that normal consumer Auth tokens were destroyed. Every sensitive
Admin RPC still validates current principal/assignment state and the JWT
`session_id` against `auth.sessions`.

## Retry and dead-letter response

- Retryable failure: allow the database-calculated bounded backoff.
- Permanent failure: fix credentials/configuration before trusted replay.
- Maximum attempts: inspect `lastErrorCode` through worker health; do not read
  raw private rows from a browser.
- Replay: use `admin_replay_session_revocation_dead_letter` only from the
  trusted service context with a credential-free reason.

Do not replay repeatedly, lower the retry ceiling, or mark a request complete
manually.

## Future scheduling contract

Activation requires a separate review. A future scheduler must:

- use a server-only Secret/service key;
- permit one concurrent invocation per environment;
- use a unique stable worker ID;
- invoke the unchanged `admin:session-revocations` command;
- enforce a short timeout above the lease duration;
- emit only sanitized aggregate logs;
- alert on dead letters, stale leases, and unavailable runs;
- never retry an entire successful batch blindly.

No schedule is enabled in Phase 7B.

## Synthetic cleanup

In bounded order:

1. finish or expire the synthetic worker run;
2. complete or remove mutable synthetic revocation rows;
3. remove synthetic approval and idempotency rows where retention permits;
4. revoke and remove synthetic assignments/principals;
5. delete synthetic Auth users through Auth Admin;
6. verify sessions/refresh tokens are gone for those users;
7. retain append-only audit evidence with `synthetic_test=true`;
8. verify no elevated synthetic access, temporary key, runtime file, or
   credential artifact remains.

Never delete legitimate staging users or non-synthetic audit records.

## Rollback

First disable any future scheduler (none exists in Phase 7B). Revoke the new
RPC grants, then remove runtime code. A reviewed forward database migration
may drop the Phase 7B functions, worker ledger, indexes, columns, and enum
value only after required audit evidence is retained. Phase 7A authorization
remains active throughout.
