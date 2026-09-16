# BotolaGO architecture context

## Baseline

This context describes the launch-candidate architecture observed on
2026-08-09. The implementation baseline is draft PR #123,
agent/launch-readiness-milestones at 1d87fb2cb7c38e1fd3576412092bf9ca47e0fb69.
The default branch baseline is main at
ea0e98911c2e4d1ce1e93f716dd7183e31d32276. The draft branch is not production
state.

## Stack

| Layer                   | Technology                                    | Role                                                       |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Runtime/package manager | Bun 1.3.14                                    | Dependency lock, scripts, and unit tests                   |
| Language                | TypeScript 5.8, strict mode                   | Shared typed contracts and implementation                  |
| UI                      | React 19                                      | Consumer and staff interfaces                              |
| Full-stack framework    | TanStack Start and TanStack Router            | SSR, file routes, server functions, and route context      |
| Client data             | TanStack Query                                | Bounded asynchronous state and actor-scoped caches         |
| Build/server            | Vite 8 and Nitro                              | Client, SSR, Cloudflare-target, and Node preview builds    |
| Styling                 | Tailwind CSS 4, shadcn new-york, Radix UI     | Design tokens, utilities, and accessible primitives        |
| Validation              | Zod 4                                         | Validation of external, database, URL, and form boundaries |
| Icons/feedback          | Lucide React and Sonner                       | Direction-safe icons and user feedback                     |
| Auth/data               | Supabase JS 2, Supabase Auth, PostgreSQL 17   | Sessions, canonical V2 data, RLS, RPCs, and storage        |
| Server ingestion        | Supabase Edge Functions, Deno 2               | Provider access and normalized ingestion                   |
| Browser tests           | Playwright                                    | FR/AR, responsive, demo, and staging journeys              |
| Database tests          | pgTAP and Supabase DB lint                    | SQL, grant, RPC, and RLS verification                      |
| Delivery                | GitHub Actions, Vercel previews, Lovable sync | CI, previews, and protected operational gates              |

## System boundaries

- src/routes — TanStack route declarations, route-level orchestration, metadata,
  and route-specific states. Routes do not own canonical data access.
- src/components — reusable presentation and interaction. Domain components
  receive typed data and callbacks.
- src/auth — session coordination and authentication UI state.
- src/i18n — paired French/Arabic dictionaries, language persistence, and
  direction switching.
- src/services — application facades, mode selection, local/cloud orchestration,
  React Query options, and UI-facing mapping.
- src/backend/contracts — shared repository context, validation, pagination, and
  stable cross-domain contracts.
- src/backend/identity, football, news, notifications, fantasy, and admin —
  domain DTOs, errors, repositories, and server-owned rules.
- src/backend/generated — generated canonical V2 database types.
- src/integrations/supabase — generated client/server plumbing and bearer
  attachment. It is infrastructure, not a product-domain API.
- src/mocks and domain mock repositories — deterministic demo and test data.
  They are never a live fallback.
- src/lib/mcp and the MCP transport routes — tool declarations plus
  intentionally source-owned transport endpoints whose demo guards must survive
  tooling and maintenance changes.
- supabase/migrations — append-only canonical schema, grants, RLS, views, and
  transactional API/RPC evolution.
- supabase/functions — JWT-protected ingestion endpoints and shared provider
  adapters.
- supabase/tests/database — database and RLS behavior tests.
- scripts/backend and scripts/qa — migration validation, secret checks,
  activation, probes, canaries, fixtures, acceptance, and cleanup.
- tests/e2e — end-to-end browser contracts.
- .github/workflows — CI and protected operational orchestration.
- docs/backend, docs/production, docs/qa, and docs/admin — detailed plans,
  runbooks, evidence, and operational constraints.

## Request and data flow

### Public read

1. A route requests a typed service operation.
2. The domain service selects the configured data source.
3. In live mode the Supabase repository calls a stable API view or RPC.
4. Zod validates the response before it crosses into UI code.
5. The service maps the DTO to the UI-facing domain model.
6. TanStack Query caches the result with language, data source, and actor scope
   where relevant.

### Authenticated mutation

1. The UI validates local form shape and submits a typed command.
2. The active access token is attached to the server or Supabase request.
3. The API/RPC enforces authentication, ownership, active rules, deadlines,
   idempotency, and version checks.
4. PostgreSQL RLS and explicit grants enforce the data boundary.
5. The repository validates and returns an authoritative snapshot.
6. The client replaces affected cache state; it never declares success before
   the authoritative result.

### Provider ingestion

1. A protected workflow invokes a JWT-verified Edge Function.
2. Server-only credentials call the approved provider.
3. The adapter validates, normalizes, sanitizes, and maps provider identifiers.
4. A service-role-only RPC writes canonical data idempotently.
5. A bounded canary validates freshness and invariants.
6. Schedules or activation flags are changed only in a separate protected step.

## Storage model

| Storage                           | Contents                                                                         | Rules                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Supabase Auth                     | Account credentials, sessions, factors                                           | Never duplicate secrets in product tables                                   |
| PostgreSQL app schema             | Canonical relational product and ownership data                                  | RLS on every table; not directly exposed to clients                         |
| PostgreSQL api schema             | Stable security-invoker views and transactional RPCs                             | Only exposed Data API surface                                               |
| PostgreSQL app_private schema     | Privileged helpers, ledgers, worker and security state                           | No browser access                                                           |
| Supabase Storage                  | Approved media and team/competition assets referenced by opaque IDs/paths        | Upload and read policy must be explicit; no unlicensed copying              |
| Browser local/session storage     | Language, bounded drafts, guest/demo state, and non-authoritative UI preferences | Scope by data source and actor; never live authority                        |
| TanStack Query cache              | Ephemeral read snapshots                                                         | Include source/owner in private keys; invalidate or replace after mutations |
| Server/GitHub environment secrets | Provider, service, and operational credentials                                   | Never use VITE-prefixed secret variables or retain them in evidence         |

## Application modes

### Live

- VITE_APP_MODE must be live.
- Auth, football, news, notifications, and Fantasy modes must all be supabase.
- Missing or mixed configuration fails closed.
- Mock data must never substitute for unavailable live data.

### Demo

- VITE_APP_MODE must be demo.
- All five browser domains must be mock.
- Supabase coordinates must be inert approved placeholders.
- Admin, Supabase auth middleware, OAuth consent, MCP surfaces, provider calls,
  and cloud writes remain blocked.
- The UI is persistently labelled as a simulation and is noindex.

### Development and test

- Deterministic mock adapters are allowed.
- Tests must explicitly select the intended source.
- Local state must remain isolated from live projects and credentials.

## Auth and access model

- Supabase Auth owns production identity and session lifecycle.
- Safe public routes may render for anonymous and guest users.
- Private Fantasy reads and every user mutation require an authenticated actor.
- RepositoryContext carries actorId and requestId across domain boundaries.
- Ownership and authorization are enforced by RPC logic and RLS, never only by
  hidden buttons.
- Auth return paths are sanitized to same-application destinations and never
  replay the original mutation.
- Staff access is resolved server-side and requires the relevant permission.
- Sensitive staff operations can additionally require AAL2/MFA, recent auth,
  dual approval, and auditable revocation.
- The publishable Supabase key may be browser-visible; service-role and provider
  credentials may not.

## Background and operational model

- Browser requests do not run provider ingestion or long-lived release work.
- Edge Functions perform bounded provider operations.
- GitHub workflows control scheduled/manual ingestion, migrations, probes,
  canaries, capacity, and activation.
- Production-mutating gates pin repository, project, branch, exact SHA,
  confirmation, concurrency, and protected environment.
- A technically successful probe is not equivalent to a ready data result.
  Readiness verdicts must evaluate the evidence payload.
- Evidence must be bounded, sanitized, short-lived where sensitive, and safe to
  publish to authorized reviewers.

## Architecture invariants

1. Legacy Supabase is never read, migrated, repaired, or mutated as part of V2
   work.
2. Live mode never silently falls back to mock, local, guest, or stale fixture
   data.
3. The browser never receives a service-role key, provider credential, database
   password, or other privileged secret.
4. UI routes and components never query canonical app or app_private tables
   directly; they use stable repositories and API/RPC contracts.
5. Every external or database response is validated before trusted use.
6. Provider-specific IDs, payloads, errors, and licensing assumptions stay
   behind provider normalization boundaries.
7. User mutations are authoritative, RLS-protected, and idempotent/versioned
   where retries or concurrent edits are possible.
8. Fantasy points, rankings, transfer cost, and rules come from approved
   server-owned calculations or are visibly deterministic demo data.
9. Private caches are scoped by data source and actor and are cleared or replaced
   on account transitions.
10. New tables enable RLS in their creating migration; views use
    security_invoker; grants are explicit; applied migrations are never edited.
11. Generated route, database type, and Supabase integration files are not
    hand-edited. The source-owned MCP transport routes are changed only
    deliberately and must preserve their demo-containment guards.
12. French and Arabic behavior, RTL, keyboard access, visible focus, reduced
    motion, and minimum touch targets are preserved in every user-facing change.
13. Production migration, Supabase API platform configuration, application
    deployment, Identity configuration, Admin bootstrap/activation, data mutation,
    current-season initialization, Fantasy catalog staging, Fantasy registration
    opening, data/content provider activation, notification-delivery activation,
    worker activation, schedule activation, post-launch verification, and rollback
    remain separate protected actions after code review and CI.
14. A demo build can never be promoted or described as the live product.

## Detailed operational authority

Use this file for boundaries and invariants. Use the latest applicable document
under docs/backend, docs/production, docs/qa, or docs/admin for command-level
procedures, then corroborate it with current code, PR checks, and runtime
evidence. Older prose is not proof of current hosted state.
