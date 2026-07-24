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
- **Actual:** Every route requested a Lovable-only `/__l5e/assets-v1/...` URL
  and received HTTP 404.
- **Evidence:** Playwright captured five repeat 404s in the first critical
  route pass.
- **Root cause:** The full logo referenced metadata for an editor-owned asset,
  not a repository-owned deployable file.
- **Files changed:** `src/components/brand/Logo.tsx`.
- **Regression test:** The 12-case French/Arabic viewport matrix fails on any
  console error or HTTP 4xx/5xx and passes after the deployable logo fallback.
- **Status:** Fixed; 12/12 anonymous browser matrix cases pass.

## Open defects

None recorded yet. Further findings will be added only after deterministic
reproduction.
