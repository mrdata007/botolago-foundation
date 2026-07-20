# Greenfield backend local development

The local Supabase stack is disposable and independent from every hosted
BotolaGO project. Do not link this folder or run `supabase db push` during the
foundation phase.

## Prerequisites

- Docker Desktop (or another Docker-compatible daemon)
- Bun 1.3.14
- Git

The Supabase CLI is pinned as a Bun dev dependency in `package.json`.

## First setup

```sh
bun install --frozen-lockfile
cp .env.example .env.local
bun run backend:local:start
supabase status
```

Copy only the local URL and local keys printed by `supabase status` into
`.env.local`. Keep `VITE_AUTH_MODE=mock` until the Phase 2 compatibility adapter
is complete.

## Database workflow

Create a migration:

```sh
supabase migration new descriptive_snake_case_name
```

Validate and replay all migrations:

```sh
bun run backend:migrations:check
bun run backend:db:reset
bun run backend:db:test
bun run backend:db:lint
```

For migration/pgTAP work that does not require Auth, REST, Storage, or Studio,
start the smaller database-only stack used by CI:

```sh
bun run backend:db:start
```

Generate and verify TypeScript database types:

```sh
bun run backend:types:generate
bun run backend:types:check
```

Run application gates:

```sh
bun run typecheck
bun run test
bun run lint
bun run build
bun run backend:secrets:check
```

Stop the local stack without retaining a database backup:

```sh
bun run backend:db:stop
```

## Safe operating rules

- Active migrations live only in `supabase/migrations`.
- Never move files from `docs/backend/archive/legacy-supabase` into the active
  chain.
- Never use production data or credentials in local/test fixtures.
- Never use a service-role key in `VITE_*` variables or browser code.
- Never hand-edit `src/backend/generated/database.types.ts`.
- A cloud failure must be visible; do not make local state an implicit fallback.
