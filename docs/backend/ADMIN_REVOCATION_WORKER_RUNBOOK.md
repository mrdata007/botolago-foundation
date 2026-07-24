# Admin Revocation Worker Runbook

Status: manual, server-only, unscheduled

The worker processes provider-bounded follow-up after canonical Admin access
has already been denied. It is not the authorization boundary and it never
claims arbitrary-user global Supabase sign-out.

## Runtime guard

Set in a trusted process:

```sh
export BOTOLAGO_ADMIN_ENVIRONMENT="<local|staging|production>"
export BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF="<exact-ref-or-local>"
export SUPABASE_URL="<exact-url>"
export SUPABASE_SERVICE_ROLE_KEY="<server-only-runtime-key>"
export BOTOLAGO_ADMIN_WORKER_ID="<unique-safe-worker-id>"
export BOTOLAGO_ADMIN_REVOCATION_BATCH_SIZE=25
export BOTOLAGO_ADMIN_REVOCATION_MAX_BATCHES=4
export BOTOLAGO_ADMIN_REVOCATION_LEASE_SECONDS=120
```

Bounds are enforced: batch `1..50`, batches `1..20`, lease `30..600`
seconds. Production additionally requires:

```sh
export BOTOLAGO_ADMIN_PRODUCTION_CONFIRMATION=RUN_BOTOLAGO_ADMIN_REVOCATION_WORKER_PRODUCTION
```

No production schedule is enabled.

## Status

```sh
bun run admin:revocation-worker --status
```

The read-only result contains aggregate pending/processing/retrying/dead-letter
counts and at most ten safe worker runs. It contains no email, Auth payload,
session/token, lease token, key, or raw provider error.

## One bounded run

```sh
bun run admin:revocation-worker --once
```

The command respects leases, bounded batches, retry limits, idempotent
completion, stale-lease recovery, and the current `synthetic_test` setting.
Run only once per approved operator action; do not wrap it in an unreviewed
retry loop.

## One dead-letter replay

After a human reviews the stable error and resolves its cause:

```sh
export BOTOLAGO_ADMIN_REPLAY_CONFIRMATION=REPLAY_ONE_ADMIN_REVOCATION
export BOTOLAGO_ADMIN_REPLAY_REASON="<credential-free-reviewed-reason>"
bun run admin:revocation-worker --replay="<request-uuid>"
```

Replay accepts exactly one UUID. It does not process the item; run one
separately authorized `--once` afterward. Bulk and repeated replay are
unsupported.

## Exit codes

- `0`: validated status, replay, or bounded worker completion.
- `1`: runtime, RPC, provider, or response-validation failure.
- `2`: invalid command syntax or bounded-setting input.

Retryable failures remain queued with database-calculated backoff. Permanent
or exhausted failures become dead letters. Never edit private queue rows or
mark work completed manually.

## Safe output and evidence

Retain only command event, environment/project ref, run/request/correlation
IDs, aggregate counts, stable status/error codes, and timestamps. Redact or
discard any token, key, password, email, factor material, lease token, or raw
provider response.

Verify:

1. canonical staff access is already denied;
2. queue/run state is coherent;
3. correlated audit evidence exists;
4. provider result uses bounded wording;
5. no duplicate completion or audit effect exists.

## Cleanup

For synthetic staging work, complete/remove mutable worker fixtures in bounded
order, delete synthetic Auth users/factors through Auth Admin, and verify zero
active synthetic elevated access. Preserve mandatory append-only audit
evidence marked synthetic. Clear all runtime variables and credential
handoffs.
