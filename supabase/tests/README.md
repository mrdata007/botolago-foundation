# Database tests

`database/foundation.test.sql` verifies schema isolation, privileges, extension
setup, and timestamp-trigger behavior.

`database/rls_harness.test.sql` creates a transaction-scoped probe table and
proves the test harness can enforce owner-only select/insert/update/delete
behavior for two JWT identities. The probe rolls back and is not a product
table.

Run with:

```sh
bun run backend:db:test
```

Future feature migrations must add deterministic pgTAP tests for constraints,
functions, grants, RLS allow paths, RLS denial across users, and anonymous
access.
