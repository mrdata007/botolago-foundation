# Greenfield migration conventions

## Active chain

Only SQL files matching `YYYYMMDDHHMMSS_snake_case.sql` under
`supabase/migrations` are active. The archived legacy files under
`docs/backend/archive/legacy-supabase` are not a migration source.

Always create files with the CLI:

```sh
supabase migration new feature_or_invariant_name
```

## Required contents for a feature table

- UUID primary key with an explicit default where the database creates the row
- lowercase snake_case names
- `created_at timestamptz` and `updated_at timestamptz` where appropriate
- explicit `not null`, unique, check, and foreign-key constraints
- indexes for foreign keys, ownership/RLS predicates, filters, and pagination
- RLS enabled in the same migration
- operation-specific policies and explicit grants
- `app_private.set_updated_at()` trigger when an `updated_at` column exists
- comments for non-obvious invariants or privileged functions
- corresponding pgTAP/RLS tests

API views must specify `security_invoker = true`. Functions default to
`security invoker` with an empty `search_path`. A `security definer` function
requires an explicit caller-identity check, must live in `app_private`, and must
have direct execution revoked from roles that do not need it.

## Change safety

- Prefer additive changes.
- Use expand/migrate/verify/contract for breaking changes.
- Add large constraints as `not valid`, validate separately, then enforce when
  lock impact matters.
- Keep backfills bounded, idempotent, observable, and separate from long-locking
  DDL.
- Do not remove a compatibility object in the same release that introduces its
  replacement.
- Roll back data-bearing changes with a reviewed forward repair migration and a
  compatible application release.

## Verification order

```sh
bun run backend:migrations:check
bun run backend:db:reset
bun run backend:db:test
bun run backend:db:lint
bun run backend:types:generate
bun run backend:types:check
```
