# Phase 6.5 Bug Burn-Down

This ledger records only deterministic defects found during Phase 6.5. An
item is marked fixed only after its focused regression test and the relevant
domain suite pass.

## P65-001 — Production data modes accepted mock authority

- **Severity:** P0
- **Route/domain:** Application-wide authority selection (Auth, Football,
  News, Fantasy)
- **Environment:** Production build configuration
- **Reproduction:** Set any production data-mode variable to `mock`, or omit
  the Auth mode and Supabase configuration, then initialize its service.
- **Expected:** Production rejects the configuration before serving data or
  accepting an authentication operation.
- **Actual:** The selector accepted the mock adapter. Auth also silently
  selected mock when its mode and Supabase configuration were absent.
- **Evidence:** Deterministic selector tests reproduced each accepted
  configuration before the correction.
- **Root cause:** Selector validation checked whether a mode name was known,
  but did not enforce the production authority requirement.
- **Files changed:** `src/services/auth.ts`,
  `src/services/football.ts`, `src/services/news.ts`,
  `src/services/fantasy-v2.ts`, production-facing route service imports, and
  their selector/authority tests.
- **Regression test:** Production-mode cases now require `supabase`; explicit
  `mock` and missing Auth cloud configuration throw stable configuration
  errors.
- **Status:** Fixed; focused selector suite passes (23 tests).

## P65-002 — Anonymous Supabase users received a local Fantasy team

- **Severity:** P0
- **Route/domain:** Home and Fantasy owned-data provider
- **Environment:** Supabase mode while signed out
- **Reproduction:** Initialize `FantasyOwnedProvider` with Supabase Auth mode
  and no authenticated user.
- **Expected:** An honest anonymous/no-team state; every mutation is denied.
- **Actual:** Source selection returned `local`, loading the mock team from
  browser storage.
- **Evidence:** The prior selector contract explicitly asserted `local` for
  anonymous Supabase mode.
- **Root cause:** Owned-data source selection conflated preview/mock mode with
  an unauthenticated cloud visitor.
- **Files changed:** `src/services/fantasy-owned-repository.ts`,
  `src/services/fantasy-owned-provider.tsx`,
  `src/services/fantasy-data-source.ts`, `src/services/use-owned-team.ts`, and
  selector tests.
- **Regression test:** Anonymous Supabase mode selects a read-only `guest`
  repository; its snapshot has no team and every mutation throws
  `unauthenticated`.
- **Status:** Fixed; focused owned-Fantasy suite passes.

## P65-003 — First-time Fantasy autocomplete required an existing team

- **Severity:** P1
- **Route/domain:** `/fantasy/create`
- **Environment:** Authenticated Supabase user with no Fantasy team
- **Reproduction:** Enter Create Team and invoke autocomplete.
- **Expected:** A deterministic, valid proposal from the authoritative player
  pool.
- **Actual:** The route called `getTeam()`, which throws
  `fantasy_team_not_found` for precisely this user state.
- **Evidence:** Deterministic call-path inspection and the cloud repository
  contract.
- **Root cause:** The preview template shortcut was retained during the cloud
  cutover.
- **Files changed:** `src/services/fantasy-create-service.ts`,
  `src/routes/fantasy.create.tsx`, and service tests.
- **Regression test:** Reversed player input produces the identical valid
  proposal; an insufficient pool fails without persistence.
- **Status:** Fixed; focused create-team suite passes.

## P65-004 — Team follow controls were route-local and non-persistent

- **Severity:** P2
- **Route/domain:** `/news`, Home followed content
- **Environment:** Authenticated user
- **Reproduction:** Follow a club in News, refresh, or visit Home.
- **Expected:** Idempotent ownership-safe follow persisted by the Identity
  backend.
- **Actual:** The button toggled component state; Home independently rendered
  mock followed clubs.
- **Evidence:** The route contained `useState<Record<string, boolean>>` and no
  repository mutation.
- **Root cause:** The Phase 2 repository existed but was not connected to the
  frozen UI.
- **Files changed:** `src/services/follows.ts`, `src/routes/news.tsx`,
  `src/routes/index.tsx`, and service tests.
- **Regression test:** Follow/unfollow calls the canonical repository and
  followed IDs are read from the ownership-safe view.
- **Status:** Fixed; focused follow-service tests pass.

## P65-005 — Full logo generated a persistent browser 404

- **Severity:** P2
- **Route/domain:** Shared shell/brand
- **Environment:** Any deployment not served through Lovable's private asset
  proxy
- **Reproduction:** Load each critical route and inspect the console/network.
- **Expected:** No unexpected console error or missing critical brand media.
- **Actual:** Every route requested a Lovable-only editor asset proxy URL and
  received HTTP 404.
- **Evidence:** Playwright captured five repeat 404s in the first critical
  route pass.
- **Root cause:** The full logo referenced metadata for an editor-owned asset,
  not a repository-owned deployable file.
- **Files changed:** `src/components/brand/Logo.tsx`.
- **Regression test:** The 12-case French/Arabic viewport matrix fails on any
  console error or HTTP 4xx/5xx and passes after the deployable logo fallback.
- **Status:** Fixed; 12/12 anonymous browser matrix cases pass.

## P65-006 — News Home returned an undefined query result

- **Severity:** P2
- **Route/domain:** Home and `/news`
- **Environment:** Supabase News mode with no published lead story
- **Reproduction:** Load Home or News against a canonical edition whose Home
  modules have no lead article.
- **Expected:** The repository returns the explicit empty value `null`.
- **Actual:** The service returned `undefined`, which violates the React Query
  data contract and emitted a persistent console error.
- **Evidence:** Protected staging browser diagnostics reproduced the query
  error.
- **Root cause:** An optional array lookup was forwarded without normalizing
  the empty result.
- **Files changed:** `src/services/news.ts`.
- **Regression test:** The staging browser rejects all unexpected console
  errors, while News contract tests preserve explicit nullable DTOs.
- **Status:** Fixed; focused tests and staging query contract pass.

## P65-007 — PostgreSQL UUIDs were rejected by frontend DTO validation

- **Severity:** P1
- **Route/domain:** Football and Fantasy repository contracts
- **Environment:** Staging V2 canonical catalog
- **Reproduction:** Load the seeded Football team catalog or Fantasy player
  pool containing canonical PostgreSQL UUID text generated from deterministic
  digests.
- **Expected:** Any canonical PostgreSQL UUID text is accepted.
- **Actual:** Zod's RFC-version-aware UUID validator rejected identifiers whose
  version/variant bits PostgreSQL does not constrain, leaving the player pool
  unavailable and blocking team creation.
- **Evidence:** Bounded staging RPC probes returned 72 valid players and valid
  teams; the same payload failed only at DTO parsing.
- **Root cause:** The frontend contract was narrower than the database `uuid`
  type.
- **Files changed:** `src/backend/contracts/validation.ts`, Football and
  Fantasy contracts/repositories, and their tests.
- **Regression test:** Shared validator tests accept canonical 8-4-4-4-12
  PostgreSQL UUIDs, reject malformed identifiers, and parse the staging DTO
  shape.
- **Status:** Fixed; contract tests, typecheck, and protected staging player
  loading pass.

## P65-008 — Mobile navigation covered the Create Team save action

- **Severity:** P1
- **Route/domain:** `/fantasy/create`
- **Environment:** Mobile viewport
- **Reproduction:** Autocomplete a valid team and press the fixed bottom save
  action.
- **Expected:** The save action is visible, enabled, and receives the tap.
- **Actual:** The global fixed BottomNav shared the same bottom position and
  z-index; its Profile link intercepted the save action.
- **Evidence:** Protected Playwright actionability diagnostics identified the
  intercepting Profile link.
- **Root cause:** Two independent fixed navigation/action layers occupied the
  same safe-area slot.
- **Files changed:** `src/routes/fantasy.create.tsx`.
- **Regression test:** The staging first-time journey clicks the real action,
  reaches `/fantasy/team`, reloads, and verifies the authoritative team.
- **Status:** Fixed; action sits above BottomNav with safe-area spacing.

## P65-009 — Import preview crossed the local/cloud authority boundary

- **Severity:** P2
- **Route/domain:** Fantasy layout import prompt
- **Environment:** Authenticated Supabase user with no Fantasy team and an
  eligible local draft
- **Reproduction:** Enter Fantasy for the first time in Supabase mode.
- **Expected:** Eligibility previews the local adapter without a cloud team
  read; selecting Start New leaves cloud state untouched.
- **Actual:** The prompt called the cloud runtime for its local preview,
  emitting `fantasy_team_not_found` for the valid first-time state.
- **Evidence:** Protected staging console diagnostics reproduced the exact
  stable error while the authoritative create flow otherwise succeeded.
- **Root cause:** A runtime service selected by production mode was used where
  the feature explicitly required the local draft adapter.
- **Files changed:** `src/components/fantasy/FantasyImportPrompt.tsx`.
- **Regression test:** The protected first-time staging journey explicitly
  selects Start New, creates the cloud team, reloads it, and fails on any
  console error.
- **Status:** Fixed; local preview uses `LocalFantasyRepository` and the local
  player catalog only.

## P65-010 — Acceptance cleanup deleted Auth before restricted Fantasy rows

- **Severity:** P2 (test infrastructure; no production path)
- **Route/domain:** Protected Phase 6.5 staging fixtures
- **Environment:** Failed or successful run after creating a Fantasy team
- **Reproduction:** Run cleanup after the first synthetic user saves a team.
- **Expected:** FK-aware bounded cleanup reaches exact zero and restores the
  gameweek.
- **Actual:** Auth deletion cascaded toward `app.profiles` before the
  restricted `app.fantasy_teams.user_id` child was removed.
- **Evidence:** Staging returned FK constraint
  `fantasy_teams_user_id_fkey`; independent inventory found exactly one
  deterministic leftover user/team.
- **Root cause:** Cleanup assumed every profile-owned relation cascaded.
- **Files changed:** `scripts/qa/phase65-staging-fixtures.mjs`.
- **Regression test:** Protected cleanup now removes the run-scoped Fantasy
  subtree in FK order, then deletes Auth users, restores all gameweek fields,
  and enforces exact-zero inventory.
- **Status:** Fixed; the latest protected cleanup passes and independent
  deterministic inventory is zero.

## Open defects

None. P0 = 0, P1 = 0, and functional P2 = 0 after repeat verification.
