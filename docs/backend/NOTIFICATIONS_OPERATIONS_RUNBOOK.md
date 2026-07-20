# Phase 5 Notifications Operations Runbook

## Safety status

Phase 5 is infrastructure-only until a separate production approval.

| Capability               | Local/test                 | V2 staging                     | Production V2 |
| ------------------------ | -------------------------- | ------------------------------ | ------------- |
| Canonical schema and API | enabled                    | schema validated               | not deployed  |
| In-app repository        | mock or local Supabase     | manual validation only         | not enabled   |
| Push provider            | deterministic fixture      | disabled                       | disabled      |
| Product email provider   | deterministic fixture      | disabled                       | disabled      |
| Fan-out worker           | direct deterministic tests | manual trusted invocation only | disabled      |
| Schedule worker          | direct deterministic tests | manual trusted invocation only | disabled      |
| Cron                     | absent                     | absent                         | unchanged     |
| Realtime publication     | absent                     | absent                         | unchanged     |

The legacy project is archive-only. Never point these commands or migrations
at it. Production V2 must not receive Phase 5 migrations, secrets, functions,
or schedules until the draft PR and a deployment change are approved.

## Architecture at a glance

1. A trusted producer submits a versioned, validated event envelope.
2. PostgreSQL deduplicates the event and grants a bounded fan-out lease.
3. The worker resumes from the last committed user UUID and resolves audience
   in keyset batches.
4. Server-side preferences, subscriptions, language, and quiet hours decide
   eligibility and availability.
5. One rendered in-app notification is stored per event/user.
6. Each enabled device/channel receives its own idempotent delivery row.
7. Delivery workers claim bounded batches, call a provider adapter, and record
   immutable attempts.
8. Retryable failures are delayed with bounded backoff. Permanent/exhausted
   failures enter a trusted-only dead letter.

The database owns state and claims. Worker processes are replaceable
orchestrators and do not retain durable progress in memory.

## Local setup and verification

Use sanitized local values from `.env.example`. Obtain local Supabase keys
from `supabase status`; never paste staging or production secrets into tracked
files.

```bash
pnpm install --frozen-lockfile
pnpm run backend:db:start
pnpm run backend:db:reset
pnpm run backend:db:test
pnpm run backend:db:lint
pnpm run backend:types:check
pnpm run backend:migrations:check
pnpm run backend:secrets:check
pnpm run typecheck
pnpm run test
pnpm run lint
pnpm run build
```

Local and preview environments may use
`VITE_NOTIFICATIONS_DATA_MODE=mock`. A production build accepts only
`VITE_NOTIFICATIONS_DATA_MODE=supabase`; mock or missing configuration fails
closed.

## Environment boundaries

Browser-safe:

- `VITE_NOTIFICATIONS_DATA_MODE`
- `VITE_APP_URL`
- V2 Supabase URL and publishable key

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFICATION_PUSH_PROVIDER` and its credential
- `NOTIFICATION_EMAIL_PROVIDER` and its credential
- provider webhook secret
- deep-link base
- worker concurrency and batch sizes
- provider timeout/retry settings
- retention settings

Never prefix provider credentials, webhook secrets, or service-role keys with
`VITE_`. Never return them from an RPC, log them, or include them in an event
payload.

## Provider activation checklist

Push or product email remains disabled until all items are approved:

1. Provider and data-processing terms selected.
2. Credential owner, rotation, and incident contacts assigned.
3. Staging adapter implemented against the provider contract.
4. Verified-email, unsubscribe, bounce/complaint, and invalid-token behavior
   tested.
5. Webhook signature and replay verification reviewed.
6. Provider quota, timeout, concurrency, and circuit-breaker limits measured.
7. French and Arabic channel templates approved.
8. Load and failure injection tests pass at representative volume.
9. Production secret placement and rollback change reviewed.

Supabase Auth continues to own verification and reset email. Product
notification email must not impersonate or replace Auth email flows.

## Manual worker procedure

Phase 5 does not ship a public endpoint or automatic schedule. A trusted
server process may instantiate `SupabaseNotificationWorkerGateway` with
server-only credentials and call the small fan-out or dispatch worker.

- Use event fan-out batches of 1–500; default 250.
- Use delivery/schedule claim batches of 1–250; default 100.
- Leases are 30–600 seconds; default 120.
- Do not run unrestricted parallel workers. Start with concurrency 2.
- A worker crash is safe: the lease expires and the saved user UUID resumes.
- A duplicate producer event resolves to the original event through the unique
  deduplication key.

The fixture adapter is a test tool. It must never be presented as real push or
email delivery.

## Failure handling

Retryable failures include timeouts, 429 responses, temporary network errors,
and provider 5xx responses. The delivery moves to `retry_scheduled` with
bounded exponential backoff and a maximum attempt budget.

Permanent failures include invalid/unregistered devices, invalid email,
unsupported payloads, permissions, and template failures. Invalid device
destinations are disabled. Terminal delivery failures create a private dead
letter.

Dead letters:

- are never browser-readable;
- never contain raw destinations or credentials;
- can be replayed only through the trusted RPC;
- preserve one delivery identity, so replay is idempotent;
- must be audited and reviewed before bulk replay.

If provider failure rates or schedule lag rise sharply, stop worker invocation.
Do not increase concurrency during a provider outage.

## Metrics and alert thresholds

The trusted `api.service_notification_metrics()` RPC provides bounded queue
and delivery counters. It is not granted to browser roles.

Monitor:

- pending and duplicate events;
- fan-out audience, duration, rejected users, and checkpoint age;
- due schedule count and oldest due time;
- queued/retrying delivery count and oldest retry;
- sent/failed/dead-letter counts;
- provider latency and remaining quota;
- invalidated devices;
- email bounce/complaint events after a provider exists.

Initial alerts before production activation:

- any dead letter for mandatory security delivery;
- oldest fan-out or schedule lease beyond twice the configured lease;
- retry queue growth across three consecutive samples;
- provider error rate above 5% over five minutes;
- provider quota below the approved safety reserve;
- any raw token, credential, or authorization header detected in logs.

## Privacy and retention

Targets:

- in-app notifications: 180 days, or 30 days after archive;
- delivery attempts: 90 days;
- completed event payloads/fan-out runs: 30 days;
- invalidated destinations: remove within 7 days;
- dead letters: 90 days unless an incident hold applies;
- operational/security audit: 365 days;
- referenced templates and minimum aggregate delivery facts: retain while
  required for audit integrity.

No retention deletion job is activated in Phase 5. A reviewed maintenance job
must later implement the policy in bounded batches. Account deletion cascades
user-owned notifications, subscriptions, registrations, and destinations;
security records must retain only policy-required, minimized identifiers.

## Rollback

Before production deployment:

1. Stop manual staging workers.
2. Keep provider and cron configuration disabled.
3. Set non-production clients back to explicit mock mode if needed.
4. Revert application code.
5. Prefer a forward repair for migrated staging data; do not hand-edit schema.
6. A disposable staging environment may be recreated from the last approved
   migration set after exporting any required test evidence.

There is no production or legacy rollback for Phase 5 because neither project
is modified.

## Production promotion gate

Promotion requires a separate reviewed change containing:

- exact migration list and V2 production project identity;
- backup/recovery confirmation;
- provider decision and secrets plan;
- representative-volume query plans;
- worker/cron cadence and concurrency;
- alerting and on-call ownership;
- retention automation;
- staged canary and explicit rollback;
- confirmation that legacy remains untouched.
