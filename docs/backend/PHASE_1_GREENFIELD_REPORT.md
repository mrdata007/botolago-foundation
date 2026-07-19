# Phase 1 Greenfield Foundation Report

Date: 2026-07-19
Branch: `backend/greenfield-foundation`
Status: complete; draft PR open for review
Draft PR: https://github.com/mrdata007/botolago-foundation/pull/1

## Architecture summary

BotolaGO Production V2 uses three application-owned PostgreSQL schemas:

- `app`: canonical relational data, not exposed through PostgREST;
- `api`: the only exposed Data API schema, populated later by explicitly
  granted `security_invoker` views and transactional RPCs;
- `app_private`: non-exposed trigger, policy, and security helpers.

Supabase Auth remains the future identity authority. Phase 1 creates no product
tables, Auth triggers, policies, buckets, Edge Functions, jobs, or provider
integrations. The frozen frontend remains in mock mode until Phase 2 adds a
compatible identity/user-data slice.

The complete product model, authority boundaries, database diagram, RLS model,
API strategy, compatibility matrix, and roadmap are in
`docs/backend/GREENFIELD_MASTER_PLAN.md`.

## Hosted project state

- Created `BotolaGO Production V2` in the BotolaGO organization.
- Project ref: `tkewgajrljbwgwedqsxn`.
- Region: `eu-west-3`.
- The hosted project is healthy and empty.
- No migration, SQL, function, bucket, Auth configuration, or application key
  from this branch was applied to the hosted project.
- The legacy hosted project was not modified; no schema, configuration, or data
  write was applied to it.
- The prior repository configuration/migrations are labeled and quarantined at
  `docs/backend/archive/legacy-supabase`.

## Files changed

### Architecture and operations

- `docs/backend/GREENFIELD_MASTER_PLAN.md`
- `docs/backend/LOCAL_DEVELOPMENT.md`
- `docs/backend/ENVIRONMENTS.md`
- `docs/backend/MIGRATIONS.md`
- `docs/backend/PHASE_1_GREENFIELD_REPORT.md`
- `docs/backend/archive/legacy-supabase/README.md`
- archived legacy Supabase config and six legacy migrations

### Supabase foundation

- `supabase/config.toml`
- `supabase/migrations/20260719215811_greenfield_foundation.sql`
- `supabase/seed.sql`
- `supabase/tests/database/foundation.test.sql`
- `supabase/tests/database/rls_harness.test.sql`
- `supabase/tests/README.md`

### TypeScript/backend conventions

- `src/backend/contracts/repository.ts`
- `src/backend/errors.ts`
- `src/backend/errors.test.ts`
- `src/backend/logging.ts`
- `src/backend/logging.test.ts`
- `src/backend/generated/database.types.ts`
- deprecation banner on `src/integrations/supabase/types.ts`

The legacy generated type file remains temporarily because existing frozen
frontend adapters import it. It is not a V2 design input.

### Tooling and CI

- `.github/workflows/backend-quality.yml`
- `.env.example`
- `.gitignore`
- `package.json` and `bun.lock`
- `eslint.config.js`
- `scripts/backend/validate-migrations.mjs`
- `scripts/backend/generate-database-types.mjs`
- `scripts/backend/check-generated-types.mjs`
- `scripts/backend/check-committed-secrets.mjs`

The previously tracked `.env` is removed from Git while the developer's local
file is preserved and ignored.

## Migration created

`20260719215811_greenfield_foundation.sql`:

- creates `app`, `api`, and `app_private`;
- installs `pgcrypto` and pgTAP explicitly;
- removes accidental `PUBLIC` object-creation access;
- grants only schema resolution for the future `api` surface;
- revokes default table, sequence, function, and type privileges from
  application roles in every V2 schema;
- creates a `SECURITY INVOKER`, empty-`search_path`
  `app_private.set_updated_at()` trigger function;
- revokes direct execution of the private trigger function from `PUBLIC`,
  `anon`, `authenticated`, and `service_role`.

No tables or user data are created.

## Database conventions

- UUID canonical primary keys; provider IDs are mapping attributes only.
- lowercase snake_case identifiers and deterministic constraint/index/policy
  naming.
- `timestamptz` for instants and database-owned timestamps.
- explicit keys, checks, uniqueness, foreign keys, and indexed access paths.
- translation tables rather than localized JSON blobs.
- enums for genuinely closed lifecycles; reference tables for extensible values.
- additive expand/migrate/verify/contract migrations.
- keyset pagination for growing collections.

## RLS baseline

- No canonical table is exposed in Phase 1.
- `supabase/config.toml` exposes only `api` to PostgREST.
- Application roles have no default object privileges.
- Future product tables must enable RLS in their creating migration; the static
  validator fails table migrations that omit it.
- The transaction-scoped RLS probe proves owner-only select/insert/update/delete
  behavior, cross-user denial, and anonymous denial with two fixed JWT users.
- Future API views must declare `security_invoker=true`.

## Testing infrastructure

- Bun unit tests for typed error/public-error behavior and recursive structured
  log redaction.
- pgTAP schema, privilege, extension, and trigger assertions.
- two-user RLS harness.
- clean migration replay via local Supabase reset.
- Supabase database lint.
- generated-type drift detection.
- migration filename/security/RLS static validation.
- committed-secret scan.
- full frontend typecheck, test, lint, and production build gates.

## Generated-type workflow

`bun run backend:types:generate` discovers the running local database URL from
the CLI and generates `public`, `app`, and `api` types. Including the empty
`public` schema keeps Supabase's generic helper types valid; it does not expose
`public` through PostgREST.

`bun run backend:types:check` regenerates in memory and fails when the committed
file differs.

## CI changes

The new workflow has no hosted-project credentials and no deployment step.

1. Application job: frozen Bun install, migration validation, secret scan,
   typecheck, tests, lint, and build.
2. Database job: database-only local Supabase stack, reset/replay, pgTAP/RLS,
   database lint, and generated-type drift.

The database-only stack excludes services not required by Phase 1, reducing CI
startup time and failure surface. The full local stack was also started
successfully after moving V2 to isolated `5532x` ports and disabling optional
local analytics.

## Environment setup

- Local/test use disposable Supabase CLI databases.
- Staging requires a separate project before Phase 2 integration testing.
- Production is the new empty V2 project and remains unlinked in this branch.
- The old hosted project remains archive/reference only.
- Only sanitized placeholders are committed.
- Service-role, database, provider, and deployment credentials stay in
  server/CI secret stores.

## Commands executed and results

| Gate                                               | Result                                             |
| -------------------------------------------------- | -------------------------------------------------- |
| `supabase migration new greenfield_foundation`     | pass                                               |
| full local `supabase start` on isolated ports      | pass                                               |
| `supabase db reset --local`                        | pass                                               |
| migration static validator                         | pass, 1 migration                                  |
| `supabase test db --local supabase/tests/database` | pass, 2 files / 30 assertions                      |
| `supabase db lint --local ...`                     | pass, no schema errors                             |
| generated types                                    | generated successfully                             |
| generated type drift                               | pass                                               |
| `bun run typecheck`                                | pass                                               |
| `bun run test`                                     | pass, 218 tests / 548 expectations                 |
| `bun run build`                                    | pass                                               |
| `bun run lint`                                     | pass, 0 errors / 11 existing Fast Refresh warnings |
| backend unit tests                                 | pass, 6 tests                                      |
| committed-secret scan                              | pass after `.env` is untracked                     |

Build output includes existing informational warnings about
`vite-tsconfig-paths`, plugin timing, and Nitro's ignored
`inlineDynamicImports`; none failed the build.

## Unresolved risks

1. The remote legacy project's dashboard display name has not been changed by
   repository code; the available Supabase connector exposes no rename action.
   Its repository artifacts are clearly labeled `Legacy — Do Not Deploy`.
2. The V2 hosted project is intentionally empty. Local success is not evidence
   of a production migration until the reviewed chain is promoted through a
   separate staging project.
3. The current frontend still contains legacy direct Supabase calls, generated
   types, MCP table assumptions, duplicate fantasy cloud adapters, and local
   authoritative state. Connecting it to V2 before the owning phase would fail.
4. The static migration validator is a guardrail, not a SQL parser or substitute
   for review and pgTAP/RLS tests.
5. Database backup/PITR, rate limits, Storage policies, Auth redirects, provider
   secrets, and operational alerts belong to later owning phases and remain
   launch blockers.

## Rollback

- This branch has not changed the hosted V2 schema, so rejecting/reverting the
  PR has no cloud data impact.
- Local databases are disposable and rebuilt by `supabase db reset`.
- If the foundation were applied remotely before approval, halt promotion while
  V2 is empty and recreate the empty project or apply a reviewed forward cleanup.
- Never replay the archived legacy migrations.
- After feature data exists, retain additive compatibility and use a forward
  repair migration rather than dropping foundation schemas.

## Exact Phase 2 recommendation

After this draft PR is reviewed and merged:

1. Create a separate staging Supabase project and apply this foundation there.
2. Confirm Auth URLs, email delivery strategy, password/session policy, and
   publishable/server key separation for local/staging/production.
3. Implement Supabase Auth flows without changing the frozen UI.
4. Add canonical `profiles`, `user_preferences`, account-security/audit, and
   idempotent profile creation with UUID linkage to `auth.users`.
5. Add server-enforced username normalization/uniqueness and atomic onboarding.
6. Add owner-safe saved/follow relation tables only for current product fields,
   with strict grants, RLS, indexes, RPCs, and two-user tests.
7. Add avatar Storage policy and account deletion/session revocation services.
8. Replace legacy profile/auth adapters with V2 repository contracts, keep mock
   adapters for tests/previews, and fail closed in production.
9. Generate V2 types, run full local/staging contract tests, and cut over only
   the identity/user-data slice.

Stop there. Football ingestion, editorial ingestion, notifications, admin CMS,
and fantasy authority remain out of Phase 2.
