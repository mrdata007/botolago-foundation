# Database tests

`database/foundation.test.sql` verifies schema isolation, privileges, extension
setup, and timestamp-trigger behavior.

`database/rls_harness.test.sql` creates a transaction-scoped probe table and
proves the test harness can enforce owner-only select/insert/update/delete
behavior for two JWT identities. The probe rolls back and is not a product
table.

`database/identity_domain.test.sql` verifies profile creation and retry safety,
username normalization/validation/conflicts, atomic onboarding, idempotent
follow operations, account-deletion requests, audit creation, and the private
avatar bucket contract.

`database/identity_rls.test.sql` proves cross-user and anonymous denial for
profiles, preferences, follows, deletion requests, audit data, and avatar
object paths using two deterministic JWT identities.

Run with:

```sh
bun run backend:db:test
```

Future feature migrations must add deterministic pgTAP tests for constraints,
functions, grants, RLS allow paths, RLS denial across users, and anonymous
access.
