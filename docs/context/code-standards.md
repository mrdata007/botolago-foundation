# BotolaGO code standards

## General

- Make the smallest coherent change that satisfies the current approved spec.
- Keep one module responsible for one concern. Split presentation, orchestration,
  contracts, persistence, and provider integration at their existing boundaries.
- Fix root causes and update the adjacent contract/tests required for consistency.
  Do not layer a silent workaround over an invalid state.
- Preserve working behavior outside the unit's declared boundaries.
- Treat production safety, localization, accessibility, and observability as part
  of the implementation, not follow-up polish.
- Do not claim runtime, staging, or production success without current evidence.

## TypeScript and validation

- Keep TypeScript strict and do not weaken compiler or ESLint settings to make a
  change pass.
- Prefer explicit types and discriminated unions. Avoid any in production code.
- Accept unknown at external boundaries, then validate and narrow it with Zod or
  an equivalent existing contract.
- Use readonly inputs and outputs for repository contracts where mutation is not
  required.
- Use opaque string identifiers at generic boundaries and the existing UUID
  schemas at PostgreSQL boundaries.
- Keep public DTO and error shapes stable. If a contract changes, update every
  adapter, mock, test, generated type check, and consuming service in the same
  unit.
- Never expose provider payloads, SQL implementation details, or privileged
  error messages to UI code.

## Imports and naming

- Use the @/ path alias for src imports except for intentional adjacent relative
  imports.
- Follow the existing domain vocabulary: repository, service, DTO, context,
  route, query, command, preview, confirm, and authoritative snapshot.
- Name booleans as predicates such as isLive, hasTeam, canMutate, or requiresMfa.
- Use stable domain error codes for machine decisions and localized dictionary
  keys for user-facing text.

## React and TanStack

- Keep file routes focused on metadata, search validation, access gates, query
  orchestration, and composition.
- Put reusable behavior in components, hooks, services, or domain modules rather
  than duplicating it across routes.
- Use TanStack Query for asynchronous server state. Query keys for private data
  must include the data source and actor.
- Invalidate or replace the exact affected queries after a mutation. Do not wipe
  unrelated caches.
- Provide intentional loading, retry, unavailable, empty, conflict, and success
  states.
- Keep SSR and the first client render deterministic. Read browser storage and
  browser-only identity after mount when it would otherwise cause hydration
  drift.
- Use a .server.ts boundary or TanStack's supported server-only mechanism for
  server code. Do not add the Next.js server-only package.
- Do not manually edit src/routeTree.gen.ts; change file routes and regenerate.

## Services and repositories

- Routes and components call UI-facing services, not Supabase tables.
- Services select the explicit data mode, map DTOs, and coordinate repositories.
- Repositories own transport, validation, pagination, and database/API details.
- Pass RepositoryContext with actorId, requestId, and AbortSignal where supported.
- Use cursor pagination for growing collections unless an approved contract
  requires another model.
- Bound loops, page counts, result sizes, retries, and timeouts.
- Mock repositories must be deterministic and contract-compatible.
- Production selectors must reject missing, mixed, or mock configuration.

## Authentication and authorization

- Treat UI access gates as presentation only. Enforce ownership and permission at
  the RPC/server boundary and with RLS.
- Attach active bearer credentials only through the approved Supabase/TanStack
  middleware.
- Sanitize redirect and return paths to same-application routes.
- Never replay a protected mutation after authentication; return the user to the
  review point.
- Require idempotency keys for retryable create/confirm operations.
- Require expected versions for concurrent Fantasy mutations.
- Preserve AAL2/MFA, recent-auth, dual-control, and audit requirements on
  sensitive staff actions.

## Data modes and secrets

- Live: require VITE_APP_MODE=live and exact supabase selection for all five
  browser domains.
- Demo: require VITE_APP_MODE=demo, exact mock selection, inert Supabase
  placeholders, persistent simulation disclosure, and noindex metadata.
- Never place service-role, provider, database, signing, or workflow secrets in a
  VITE-prefixed variable.
- Do not print tokens, passwords, raw provider payloads, sensitive URLs, or filled
  form values in logs, screenshots, traces, artifacts, or PR descriptions.
- Keep production migration, Supabase API platform configuration, application
  deployment, Identity configuration, Admin bootstrap/activation, data mutation,
  current-season initialization, Fantasy catalog staging, Fantasy registration
  opening, data/content provider activation, notification-delivery activation,
  worker activation, schedule activation, post-launch verification, and rollback
  actions out of ordinary implementation PRs.

## Supabase and SQL

- Add forward-only, timestamped migrations using the repository filename
  convention.
- Never edit a migration known to be applied in any shared environment.
- Enable RLS in the migration that creates a table.
- Declare security_invoker on views.
- Use explicit grants; GRANT ALL is forbidden.
- Expose stable client contracts through api views and RPCs. Keep canonical
  tables in app and privileged helpers in app_private.
- Use security-definer functions only when required, pin search_path, validate
  the caller, and grant execute narrowly.
- Make ingestion upserts and commands idempotent.
- Use the generation script for src/backend/generated/database.types.ts and
  verify zero drift.
- Treat src/integrations/supabase/types.ts as legacy compatibility, not V2
  authority.

## Provider integrations

- Keep credentials and outbound provider calls in server-only functions.
- Normalize provider IDs, status values, timestamps, names, and errors before
  persistence.
- Store only fields permitted by the approved commercial and licensing model.
- Do not retain raw articles, images, payloads, or personal data without an
  explicit approved requirement.
- Separate a technically healthy probe from the business readiness verdict.
- Fail closed when current-season resources, freshness, or attribution cannot be
  proven.

## Styling and components

- src/styles.css is the canonical Design System V2 source.
- New or modified visual code uses semantic Tailwind/token utilities. Do not add
  new raw hex, RGB, or OKLCH values inside feature components.
- The launch candidate contains known Atlas/Fantasy hardcoded palette debt. Do
  not copy it into new code and do not perform an unrelated global sweep. Migrate
  a touched component only within an approved visual unit with regression
  evidence.
- Prefer existing shadcn/Radix primitives and shared BotolaGO components.
- Compose generated primitives rather than changing their contracts casually.
- Preserve the radius, surface, shadow, motion, and route-mesh conventions from
  ui-context.md.
- Use Lucide stroke icons. Mark decorative icons aria-hidden.
- All interactive controls must have a visible focus state and a minimum 44 by
  44 pixel touch target where they are used as touch actions.
- Respect reduced motion and safe-area insets.

## Localization and content

- Every new or modified user-facing string and metadata value goes through the
  paired French/Arabic dictionaries.
- Add the same key to both language blocks in the same change.
- The launch candidate contains known hardcoded French route/root metadata debt.
  Do not copy it; correct it only in approved localization scope, and resolve it
  before release certification.
- Use useI18n for direction and localized content; do not infer direction from
  browser locale independently.
- Use logical layout properties and direction-safe icon behavior.
- Test both French LTR and Arabic RTL at affected responsive widths.
- Do not present unknown data as zero, unavailable data as an empty fact, or
  simulated activity as live.
- Preserve attribution and simulation labels where required.

## Errors and observability

- Map infrastructure/provider errors to bounded domain errors.
- User messages are localized, actionable, and do not reveal internals.
- Log enough request/domain context to diagnose a failure without logging
  secrets or user-entered sensitive values.
- Preserve root error boundaries and sanitized Lovable error reporting.
- Operational evidence must include exact SHA, environment identity, verdict,
  and bounded counts while excluding credentials and raw protected content.

## Testing

- Co-locate Bun unit tests with pure domain, mapping, selector, and component
  logic.
- Add regression coverage for every fixed defect.
- Use mock repositories for deterministic application tests and pgTAP for SQL,
  grant, and RLS behavior.
- Use Playwright for browser-visible journeys, responsive behavior, FR/AR,
  accessibility, demo containment, and credential-gated staging acceptance.
- A focused test may support iteration, but the unit's risk matrix determines
  the closing checks.

## Required verification commands

### Documentation-only

- bun run format:check when Markdown is covered by the formatter
- Validate internal links, referenced paths, status dates, SHAs, and evidence
- Confirm git diff --check

### Application or UI

- bun run format:check
- bun run typecheck
- bun test with focused tests during iteration, then the required full suite
- bun run lint
- bun run build
- Relevant Playwright projects

### Database, repository, or Edge Function

- All applicable application checks
- bun run backend:migrations:check
- bun run backend:secrets:check
- bun run backend:db:start
- bun run backend:db:reset
- bun run backend:db:test
- bun run backend:db:lint
- bun run backend:types:check
- bun run backend:db:stop

Never run protected staging or production gates merely to make a PR appear
complete. Those gates require their own authorization and evidence.

## File organization and protected artifacts

- src/routes — route files
- src/components — presentation and interaction
- src/services — application orchestration and mode selection
- src/backend — domain contracts and repositories
- src/integrations — generated platform plumbing
- supabase — schema, functions, and database tests
- scripts — validation and controlled operations
- tests/e2e — browser contracts
- docs/context — durable cross-project context
- docs/specs — scoped units and build order

Protected artifacts and boundaries:

- Do not hand-edit src/routeTree.gen.ts.
- Do not hand-edit src/backend/generated/database.types.ts.
- Do not hand-edit generated files with do-not-edit banners under
  src/integrations/supabase.
- src/routes/mcp.ts, src/routes/[.mcp]/**, and
  src/routes/[.well-known]/** are source-owned protected boundaries; edit only
  with explicit MCP/demo-containment scope and tests
- Change bun.lock only through intentional Bun dependency operations.
- Never edit an already-applied migration.
