# BotolaGO audit — Frontend / code-quality stream

Date: 2026-09-24. Repository: /home/user/botolago-foundation @ d257de7 (branch claude/quirky-faraday-e8xnss, merged with origin/main).
Scope: src/, tests/, scripts/vercel, vite/eslint/tsconfig, package.json. Read-only; only `.audit-tmp/` was written (build log, measurement scripts). The production build wrote to the git-ignored `.output/`.

## 0. Executed checks (what was actually run)

| Check | Command | Result |
|---|---|---|
| Production build | `LEGAL_GATE_ALLOW_PLACEHOLDERS=1 bun run build` (log: `.audit-tmp/build.log`) | **EXIT 0**. Warnings: "Some chunks are larger than 500 kB after minification"; "inlineDynamicImports option is ignored because the codeSplitting option is specified". |
| Typecheck | `bun run typecheck` (tsc --noEmit, strict) | **EXIT 0**, 0 errors |
| Lint (repo sources) | `bunx eslint src vite.config.ts eslint.config.js` | 0 errors, **14 warnings** (all `react-refresh/only-export-components`). Note: `bun run lint` (= `eslint .`) currently reports 27 *errors*, but every one is in `.audit-tmp/*.mjs` written by other audit streams; the eslint `ignores` list (eslint.config.js:10-24) does not exclude that git-excluded folder. Not a repo defect. |
| Unit tests | `bun test src` | **2062 pass, 0 fail**, 12 964 expect() calls, 169 files, 10.8 s |
| Dependency audit | `bun audit` | 41 vulnerabilities (21 high, 17 moderate, 3 low); 1 direct dep affected (sanitize-html) |
| Live PostgREST probes (3 anonymous GETs) | `curl .../rest/v1/fantasy_teams`, `.../clubs`, with/without `Accept-Profile` | `PGRST106 Only the following schemas are exposed: api`; `PGRST205 Could not find the table 'api.fantasy_teams'`, `'api.clubs'` |
| e2e / pgTAP | not run | Playwright suites need injected credentials (see §9); Docker is unavailable so pgTAP was not run. |

---

## 1. Top findings (severity-ordered)

### F1. ~28 kB of mock/demo data and mock services ship in the first-load bundle of the production site
- Severity: **P2** · Confidence: **VERIFIED**
- Location: `src/services/football.ts:47-48`, `src/services/fantasy-owned-repository.ts:22,26`, `src/services/fantasy-runtime.ts:1`, `src/services/use-owned-team.ts:15`, `src/services/auth.ts:9-15`, `src/services/lifecycle-service.ts:18`
- Evidence: the built entry chunk `index-BQJLG-CU.js` statically imports `data-DfaZWybg.js` (8.4 kB = `src/mocks/data.ts`) and inlines `src/mocks/fantasy-data.ts`: `grep -l "Casablanca Derby|Abdelilah Hafidi" .output/public/assets/*.js` → `data-DfaZWybg.js`, `index-BQJLG-CU.js`. A stand-alone `bun build --minify` of `src/services/fantasy-mock.ts` + `src/mocks/data.ts` measures 19.5 kB + 8.5 kB. `auth-BwUfzdiM.js` (22 kB, in the entry closure) carries `LocalMockAuthService` (`src/services/auth-mock.ts`, 411 lines).
- Root cause: mode is decided at build time (`import.meta.env.PROD` + `VITE_*_DATA_MODE`, e.g. `football.ts:31-42`) but both implementations are instantiated eagerly at module scope: `const mockRepository = new MockFootballRepository(); const supabaseRepository = new SupabaseFootballRepository();` (`football.ts:47-48`). `fantasy-owned-repository.ts:22` imports `fantasyService` from `fantasy-mock` at top level for the `LocalFantasyRepository` branch that production never selects.
- Impact: every visitor downloads and parses demo fixtures (fake players, fake clubs, demo credentials in `auth-mock.ts`), and grep-based audits of the bundle show Moroccan club/player names that are not real data. No functional risk (mode selection is fail-closed), but wasted bytes and confusing artefacts.
- Fix: gate the mock branches behind `if (import.meta.env.VITE_*_DATA_MODE === "mock") { const m = await import("@/backend/football/mock-repository"); ... }` (Rolldown will drop the branch when the constant is `"supabase"`), or move mock wiring into a `*.mock.ts` entry selected by the config. Files: the six listed above, plus `src/backend/news/mock-repository.ts`, `src/backend/football/mock-repository.ts`. Complexity: **M**.

### F2. No route-level error boundaries or pending states outside `/admin`; no router defaults; no link preloading
- Severity: **P2** · Confidence: **VERIFIED (code)** / LIKELY (runtime behaviour)
- Location: `src/router.tsx:8-13` (no `defaultPendingComponent`, `defaultErrorComponent`, `defaultPreload`); `src/routes/__root.tsx:262-263` is the only `notFoundComponent`/`errorComponent` for public routes; `pendingComponent` exists only on the 13 `admin.*` routes (`grep -rn pendingComponent src/routes`); `[.]lovable.oauth.consent.tsx:80` is the only other `errorComponent`.
- Evidence: `grep -rn "preload" src` finds no `preload="intent"` on any `Link`. Loader routes `matches.$matchId.tsx:65`, `clubs.$clubId.tsx:70`, `news.$articleId.tsx:56`, `fantasy.players.$playerId.tsx:59` `await ensureQueryData(...)` before rendering.
- Current behaviour: a render error anywhere in a public page unmounts the whole shell (TopBar/BottomNav) and shows the root error page; a client-side navigation from Home to a match/club/article stalls on the previous screen with no progress indication until the Supabase RPC resolves (the loader swallows failures with `catch { return null }` at `matches.$matchId.tsx:75-77`, `clubs.$clubId.tsx:80-82`, `news.$articleId.tsx:67-69`, so failures then re-fetch client-side).
- Fix: set `defaultPendingComponent`/`defaultErrorComponent` in `router.tsx`, add `errorComponent` per section layout (`fantasy.tsx`, `auth.tsx`, `news.tsx`), add `preload="intent"` (or `defaultPreload: "intent"`) and keep `defaultPreloadStaleTime: 0`. Complexity: **S–M**.

### F3. Time-of-day greeting on Home is computed at render from the host clock → SSR/CSR hydration mismatch in predictable daily windows
- Severity: **P2** · Confidence: **LIKELY** (code-verified; not observed live because the window depends on the hour)
- Location: `src/routes/index.tsx:80-86` (`useGreeting`: `new Date().getHours()`), rendered inside the server-rendered tree at `index.tsx:672` (`{greeting} · {capitalizeFirst(dateLine)}`; `HomePage` renders `HomeContent` on the server because `mounted` is false, `index.tsx:93-112`).
- Evidence: the adjacent `dateLine` was already fixed for exactly this class of bug (`index.tsx:222-229`, BG-0100, uses `MATCH_TIME_ZONE`), but the greeting was not. The SSR host (Cloudflare, `server: cloudflare` per brief) runs in UTC; Casablanca is UTC+1 and the diaspora is UTC+1/+2. When the server hour is 11 and the client hour is 12 (or 17 vs 18), the server sends "Bonjour" and the client renders "Bon après-midi".
- Reproduction: open https://botolago.com/ between 12:00–12:59 or 18:00–18:59 Casablanca time (13:00–13:59 / 19:00–19:59 in Paris) with the console open; expect React's "Hydration failed because the server rendered text didn't match the client" (React 19 then throws away the server tree and re-renders on the client).
- Impact: on those windows every Home load pays a full client re-render (LCP/INP regression, brief flash) and logs a console error; automated monitoring that counts console errors will be noisy at those hours.
- Fix: compute the hour with `Intl.DateTimeFormat(…, { timeZone: MATCH_TIME_ZONE, hour: "numeric", hour12: false })` as `dateLine` does, or render the greeting after mount. Complexity: **S**.
- Related (P3, LIKELY): `formatRelativeTime` (`src/lib/format-time.ts:7-16`) is evaluated at render against `Date.now()` in `ArticleCard.tsx:164` and `news.$articleId.tsx:440`; server and client strings differ whenever hydration crosses a minute/hour/day boundary ("il y a 59 minutes" vs "il y a 1 heure"). Sporadic, same mechanism. Fix: `<time>` with a mounted-only relative label, or pass `now` from the loader.

### F4. Signed-in Home load issues the `api.fantasy_hub` RPC at least three times, and pulls the entire player pool to render an alerts list that is always empty
- Severity: **P2** · Confidence: **LIKELY** (call graph verified; network not observed because no test account is available)
- Location: `src/services/fantasy-runtime.ts:177-179` (`hub()` is an un-memoised `cloud.getHub("fr", …)`), called at `:192, :239, :255, :288, :335, :375, :429, :486, :532, :537, :581`; `src/routes/index.tsx:149-177`; `src/services/fantasy-owned-repository.ts:740` (`V2CloudFantasyRepository.loadSnapshot` → `getHub`).
- Evidence: Home declares 9 queries (`index.tsx:149-198`): `summary` → `getSummary()` → `hub()` + `getHistory()` (`:288-290`); `all-players-for-alerts` → `getTrendingPlayers()` → `hub()` + `getTopPlayers()` + `allPlayers()` (`:335-347`, the whole `fantasy_player_pool` + season stats); the owned provider's snapshot query → `getHub` again. `getAlerts()` returns `[]` unconditionally in cloud mode (`:315-323`, "no approved alert projection yet"), so the trending-players fetch feeds a list that cannot render anything.
- Impact: 3× `fantasy_hub` + `fantasy_player_pool` + `fantasy_player_season_stats` + history on every signed-in Home visit, and again on each window focus (`refetchOnWindowFocus` default, `staleTime` 15 s). Wasted Supabase compute and slower Home for the users who matter most.
- Fix: memoise `hub()` per language behind the query cache (`queryClient.fetchQuery(["fantasy","hub",lang])`) or have `getSummary`/`getTrendingPlayers` accept the hub DTO; drop the `all-players-for-alerts` query until alerts exist. Complexity: **S–M**.

### F5. ~4 700 lines of dead code, two coexisting component systems, and ~29 unused runtime dependencies
- Severity: **P2** (maintainability) · Confidence: **VERIFIED**
- Evidence (import-path grep over non-test files):
  - `src/components/ui/`: 26 of 32 shadcn files have zero importers (1 731 lines): tooltip, pagination, progress, textarea, dropdown-menu, tabs, toggle, accordion, checkbox, avatar, form, collapsible, badge, alert-dialog, command, calendar, alert, sheet, popover, input, resizable, switch, card, table, skeleton, separator. Only button, dialog, input-otp, label, select, sonner are used. The real design system is `src/components/ui-kit/primitives.tsx` (2 736 lines, 43 `Ui*` exports incl. its own `UiSheet`, `UiModal`, `UiTabs`, `UiTable`, `UiCheckbox`, `UiTextarea`); `primitives.tsx:2483` documents surfaces that "reached for `@/components/ui/dropdown-menu`".
  - Fantasy leftovers: `components/fantasy/{Pitch,ConflictBar,CloudSyncBanner,FantasyOnboarding,FantasyAccessGate,UnsavedBadge,PlayerShirt,SquadListToggle,FantasyImportPrompt,LeagueTable}.tsx`, `gameweek-presentation.ts`, `fantasy-navigation.ts`; `lib/{budget,fantasy-validation,fixture-gameweeks,stadium-photo}.ts`; `services/{mock,leagues-store,fantasy-cloud-finalize}.ts`; `hooks/use-mobile.tsx`; `common/{PlayerRow,PhotoPageHeader,AccentEyebrow}.tsx`; `matches/LiveIndicator.tsx`; `brand/FantasyBrand.tsx` — ~2 100 lines.
  - Superseded V1 cloud path: `src/services/fantasy-cloud-repo.ts` (623 lines, reads `public.fantasy_teams` / `fantasy_chip_uses` / `save_fantasy_team`, none of which exist on production — probe returned `PGRST106`/`PGRST205`) is kept alive only because `src/services/fantasy-errors.ts:8-9` imports `FantasyCloudError` and `MissingIdMappingError` from it and from `fantasy-id-map.ts`; `CloudFantasyRepository` (`fantasy-owned-repository.ts:397-641`, 245 lines) is unreachable because the factory returns `V2CloudFantasyRepository` (`:874-889`). The launch ledger already records this as BG-0061 (`docs/engineering/LAUNCH_LEDGER.yaml:145-166`, state QUEUED). Tree-shaking does drop the legacy classes from the client bundle (no `fantasy_squad_members`/`save_fantasy_team` strings in `.output/public/assets`), but `loadIdMap`'s `public.clubs/players` reads still ship (`provider_id` present in `index-BQJLG-CU.js`).
  - Unused runtime deps (no importer in src or CSS): recharts, date-fns, embla-carousel-react, vaul, @hookform/resolvers, @radix-ui/react-{aspect-ratio,context-menu,hover-card,menubar,navigation-menu,radio-group,scroll-area,slider,toggle-group}; imported only by dead shadcn files: react-hook-form, react-day-picker, cmdk, react-resizable-panels, @radix-ui/react-{accordion,alert-dialog,avatar,checkbox,collapsible,progress,separator,switch,tabs,toggle,tooltip,popover,dropdown-menu}. None of these reach the bundle (verified: `recharts`/`date-fns`/`embla` strings absent from all chunks), so the cost is install time, audit noise and reviewer confusion, not bytes.
- Root cause: `tsconfig.json` sets `noUnusedLocals: false`, `noUnusedParameters: false` and `eslint.config.js:56` turns `@typescript-eslint/no-unused-vars` off; there is no unused-export/unused-file gate (knip/ts-prune) and no depcheck.
- Fix: delete the dead files (the tests that read them go with them), rehome the two error classes into `fantasy-errors.ts`, remove the deps, add `knip` to CI. Complexity: **M** (the ledger notes the i18n W3/W4 baselines and test counts must be re-baselined at the same time).

### F6. `sanitize-html` is pinned to a version with two open XSS advisories, and the version is part of a server-side MAC contract
- Severity: **P2** · Confidence: **VERIFIED** (advisory) / UNVERIFIED (exploitability under this allowlist)
- Location: `package.json` (`"sanitize-html": "2.17.5"`), `src/backend/news/sanitizer-policy.ts:15` (`NEWS_SANITIZER_VERSION = "sanitize-html@2.17.5"`), `supabase/functions/_shared/news-editorial-sanitizer.ts` (per the policy header).
- Evidence: `bun audit` → `sanitize-html >=1.9.0 <=2.17.6 (direct dependency)`: GHSA-g8qq-57p8-ggw5 (SVG SMIL URI-list scheme-policy bypass, moderate), GHSA-jxwj-j7wr-gfrw (mutation-XSS / allowedTags bypass via `</textarea/>`, moderate). The allowlist (`sanitizer-policy.ts:17-36`) has no `svg`/`textarea`, `disallowedTagsMode: "discard"`, `enforceHtmlBoundary: true`, https-only schemes — which narrows the mXSS surface but the second advisory is a parser desynchronisation, so the pin should still move.
- Impact: article bodies are injected with `dangerouslySetInnerHTML` at `src/routes/news.$articleId.tsx:480` and the CMS preview at `admin.news.$articleEditionId.tsx:1364`; the editorial write path requires a MAC over content sanitised with exactly this version, so a bump must be coordinated across npm + the Deno edge function + the DB verifier.
- Fix: bump to ≥2.17.7 on both sides in one change, update `NEWS_SANITIZER_VERSION`, rerun the sanitizer tests. Complexity: **M**.

### F7. Public loaders and heads are French-only; Arabic readers fetch every SSR'd page twice and see a French flash
- Severity: **P2** (UX/perf) · Confidence: **VERIFIED (code)**
- Location: `src/routes/matches.$matchId.tsx:60-68, 126-131`, `clubs.$clubId.tsx:70-78`, `news.$articleId.tsx:56-66` (loader key `[…, "fr"]`), client queries keyed on `lang` (`matches.$matchId.tsx:129`).
- Evidence: the in-code comment (`matches.$matchId.tsx:60-63`): "French because the server always renders French… an Arabic reader's query is a different key and loads after hydration." `head()` builds titles/descriptions in French only (`:79-108`).
- Impact: for `ar` users the SSR payload is discarded (second RPC after hydration), the page first paints in French, and `<title>`/OG tags are never Arabic. This is a consequence of the language living in localStorage rather than the URL (brief: no `/fr` or `/ar` routes). Fix requires a routing decision (language segment or cookie read on the server); flag to SEO/UX streams. Complexity: **L**.

### F8. First-load JavaScript is 1.19 MB raw / 347 kB gzip before any route renders; two chunks exceed the 500 kB warning
- Severity: **P3** · Confidence: **VERIFIED**
- Evidence (static import closure of the entry, computed from the built chunks): 18 files, 1 186 kB raw, 347 kB gzip. `index-BQJLG-CU.js` 510.5 kB (157 gz: TanStack Router/Query/Start client, sonner, app services, mock data, home route), `primitives-1x24yP0b.js` 319.4 kB (90 gz: react-dom + Radix + 90 lucide icons + the full fr+ar dictionary — "Bienvenue sur" is only in this chunk — + ui-kit), `client-Dg2E3-J-.js` 200.8 kB (51 gz: supabase-js including `RealtimeClient`/phoenix and `StorageClient`, though nothing subscribes to realtime), `schemas-5lu9WtyA.js` 68.7 kB (18 gz: zod 4, pulled into the entry by `src/services/account-standing.ts` and backend contracts), `useStore` 27 kB. Total client JS 2.10 MB raw / 642 kB gzip over 181 chunks; CSS 153 kB raw / 24 kB gzip (one file). Route code is split correctly: 58 route-named chunks; the admin editor's 228 kB `use-unsaved-changes-guard-*.js` (sanitize-html + editor) is loaded only by `admin.news.*` (dynamic import).
- Tree-shaking status: recharts/date-fns absent (unused); lucide tree-shaken (one chunk, 90 icons); single React copy (`node_modules/react` once, 19.2.5).
- Fix: F1 (mock data), lazy-load the Arabic or French half of `dictionaries.ts` (189 kB source, 1 425 keys per language, both shipped to everyone), keep zod out of the entry (validate `account-standing` with a hand-written guard or lazy-import), consider `@supabase/supabase-js` realtime exclusion. Complexity: **M**.

### F9. No request timeouts anywhere in the client data layer except the Fantasy availability probe
- Severity: **P3** · Confidence: **VERIFIED (code)**
- Location: `src/services/use-fantasy-availability.ts:15-25` (`withTimeout`, the only one); `src/backend/prizes/supabase-repository.ts:36-39` (abortSignal support, unused by callers). `grep -rn "AbortSignal|timeout" src/services src/backend/*/supabase-repository.ts` finds nothing else.
- Impact: a hung PostgREST/RPC request (proxy, captive portal, Cloudflare hiccup) leaves `isLoading` true forever; TanStack Query has no built-in timeout, and only the Fantasy screens have a bounded loading phase (`useFantasyScreen.ts:45-49` says so explicitly). Fix: a `fetch` wrapper with `AbortSignal.timeout(15_000)` in `createSupabaseFetch` (`src/integrations/supabase/client.ts:9-30`). Complexity: **S**.

### F10. Test suite is large but shaped around helpers and source-text assertions; no authenticated journey is protected in CI
- Severity: **P2** · Confidence: **VERIFIED**
- Evidence: 169 `src/**/*.test.ts(x)` files (2 062 tests). 41 of them read source files as text (`readFileSync`/`Bun.file`) and assert on it, e.g. `src/routes/index.home-structure.test.ts` ("sections appear in the required order"), `admin-destructive-safety.test.ts` ("no destructive mutation is wired straight to a click handler"), `editorial-body-styling.test.ts` (reads `styles.css`). 11 tests render with `react-dom/server`; 1 uses a DOM library; 10 `.test.tsx` component tests. CI (`.github/workflows/backend-quality.yml:47`) runs only `tests/e2e/anonymous.acceptance.e2e.ts` — 5 routes (`/`, `/news`, `/matches`, `/fantasy/rules`, `/profile`) × 2 languages × 6 viewports asserting `lang`/`dir`, body visibility, overflow and fonts. `fantasy.journey`, `staging.acceptance`, `news-cms.authenticated` skip without injected credentials (`fantasy.journey.e2e.ts:68`, `staging.acceptance.e2e.ts:49`, `news-cms.authenticated.e2e.ts:37`) and are not wired to any workflow. `expectNoHorizontalOverflow` (`tests/e2e/support.ts:88-92`) compares `scrollWidth` to the viewport while `styles.css:803` sets `overflow-x: clip` — the helper's own comment (`:94-107`) admits it is blind; only match cards get a real check.
- See §9 for the journey-by-journey gap list. Complexity to close: **L** (needs seeded staging accounts in CI secrets and a nightly authenticated suite).

---

## 2. Component organisation & routes

- **Routes**: 59 `createFileRoute` files (55 `.tsx` pages + `mcp.ts`, `sitemap[.]xml.ts`, `[.mcp]/*`, `[.well-known]/*` generated by `@lovable.dev/mcp-js`); `src/routeTree.gen.ts` `FileRoutesByFullPath` lists 59 entries; the build emits 58 route-named client chunks, so routes are code-split. Section layouts are trivial pass-throughs (`fantasy.tsx:34-36`, `auth.tsx:3-5`) and carry no error/pending handling (F2). Admin routes are `ssr: false` with `loader: () => loadAdmin*RouteAccess()` and `pendingComponent` (e.g. `admin.tsx:25-30`) — the only section done properly.
- **Shell**: `src/components/shell/*` is small and clean (AppShell 71 lines, TopBar 86, BottomNav 108, PageBackground 157). Root composition: `QueryClientProvider > I18nProvider > ThemeProvider > AuthProvider > FantasyOwnedProvider > LaunchGate` (`__root.tsx:284-302`). Splash and language chooser are settled by inline head scripts before paint (`__root.tsx:239-258`, `components/splash/launch-splash.ts`), and `<html suppressHydrationWarning>` is justified in a comment (`:267-270`).
- **Component families**: `components/ui` (shadcn, 26/32 dead) vs `components/ui-kit` (the live kit, one 2 736-line file); `components/fantasy` (older Fantasy, mostly dead) vs `components/fpl` (live FPL-style screens, 23 files); `components/common` holds shared cards. The duplicated `Pitch.tsx`/`FplPitch.tsx` pair is the visible symptom. Verdict: the *live* organisation is coherent; the *repository* is not, because the previous generation was never removed.
- **Loading strategy**: Home has 17 loading-state references, Fantasy screens go through `FantasyScreenGate` skeletons (`components/fpl/FantasyScreenGate.tsx:68-87`); legal/prizes pages are static. Client-side navigation feedback is missing (F2).

## 3. State management

- **AuthProvider** (`src/auth/AuthProvider.tsx`): SSR-safe seeding (`:37-53`, documents hydration error #418 it fixed), ban re-check on visibility with throttle and cleanup (`:85-114`), memoised context (`:133-145`). One-liner risk: `requireAuth` opens a prompt held in the same context value, so opening the dialog re-renders every `useAuth` consumer (P4).
- **FantasyOwnedProvider** (`src/services/fantasy-owned-provider.tsx`): keyed by `(source, owner)` so a user switch cannot leak cache (`:108-109`, `:185-192`); mutation status carries a monotonic sequence (`:141-163`); `isFetching` is part of the context value (`:202, :220`), so every background refetch re-renders every consumer twice (P4); `reload` depends on the whole `query` result (`:176-179`) rather than `query.refetch` (P4). The snapshot query runs for guests too (`LocalFantasyRepository`/`GuestFantasyRepository` are cheap) — fine.
- **I18nProvider** (`src/i18n/provider.tsx`): server and first client render are always `fr` (`:39-51`), language applied after mount, `t()` falls back to the key (`:78`). `localStorage` key `botolago.language` (`:13`). Sound; the cost is F7.
- **ThemeProvider** (`src/theme/provider.tsx:85-103`): media-query listener with cleanup; gated by `DARK_MODE_ENABLED`.
- **Query client** (`src/services/query-client.ts`): only `staleTime: 15_000`; TanStack defaults otherwise (3 retries with backoff on every error including 4xx, `refetchOnWindowFocus: true`). Per-query overrides are consistent (fantasy screens `retry: 1`, `staleTime` 60 s–5 min; `clubs.$clubId.tsx:154` skips retries on not-found). **Polling**: `use-live-matches.ts:20` polls `getLiveMatches` every 60 s on Home and Matches even when nothing is live (`lib/match-refresh.ts:59-69`, deliberate); the match page polls every 30 s while live and every 60 s ±15 min around kick-off (`:25-39`). All callers set `refetchIntervalInBackground: false`. Cost note for the backend stream: every open Home tab = 1 RPC/min.
- **localStorage** (`src/lib/storage.ts`, prefix `botolago.`): every read/write is SSR-guarded and try/caught. Stores: language, theme, splash/welcome flags, guest flag (`auth-supabase.ts:40-58`), Fantasy local prototype state (`fantasy-state.ts:21`, default `currentGameweek: 14` hard-coded), transfer/team drafts keyed `uid::teamId::baseVersion::kind` (`fantasy-drafts-store.ts:36-39`; removed on success, purged on sign-out via `fantasy-signout-cleanup.ts`; entries never expire otherwise — P4), saved articles only in mock mode (`saved-articles.ts:7-9`). **Tokens**: supabase-js default (`sb-<ref>-auth-token` in localStorage, `client.ts:53-62` explains why no custom storage) — standard for SPA Supabase; sign-out purges `botolago.auth.*` (`auth-supabase.ts:414-419`).
- **Hydration**: 32 `typeof window/document` guards; the three known hazards are F3 and the two `formatRelativeTime` sites. `matches.index.tsx:81` uses `startOfMatchDay` (Casablanca-zoned, `lib/match-kickoff.ts:149`) — consistent.
- **Race conditions**: `fantasy-mutation-controller.ts:62-99` sequences status writes; its `saved→idle` timer (`:84-87, 101-108`) is never cancelled but is seq-guarded, so harmless. `replaceSnapshot` followed by `invalidateOwned()` (`:76-78`) refetches the snapshot it just installed (one extra RPC per mutation, P4). `auth.callback.tsx:27-114` scrubs the URL before any await, uses a `cancelled` flag, and routes recovery to `/auth/update-password` — correct. `fantasy-id-map.ts:190-215` keeps a module-level `cached`/`inflight` singleton for the (dead) V1 path.
- **Memory leaks**: none found — every `setInterval`/`addEventListener` inspected has a matching cleanup (`fpl/deadline.ts:86-87`, `matches/GoalMoment.tsx:88-93`, `hooks/use-hide-on-scroll.ts:36-40`, `services/use-owned-team.ts:55-60`, `auth.verify.tsx:39-43`, `theme/provider.tsx:101-102`, `lib/saved-articles.ts:44-51`).
- **Duplicated requests**: `["football","clubs",lang]` is declared at 7 sites with `staleTime` ranging 15 s (default) to 5 min (`useFantasyScreen.ts:70`) — same key so requests dedupe, but the shortest staleTime wins on refetch. F4 covers the real duplication (`hub()`).

## 4. Data-fetching layer (`src/services`, `src/backend`)

- **Mode selection**: each service has a pure `selectXDataMode(configured, production)` that **throws in production unless the mode is `supabase`** (`football.ts:31-42`, `auth.ts:21-33`, `news.ts:46`, `notifications.ts:56`, `prizes.ts:33`, `fantasy-runtime.ts:34-35`). `production-authority.test.ts` covers it. Missing env: `integrations/supabase/client.ts:39-47` throws on first property access through a lazy `Proxy` (`:71-76`) — the app falls to the root error page, with a clear console message. Good fail-closed behaviour.
- **Error swallowing**: no `catch → []` found in services. Deliberate `null` returns: `account-standing.ts:32,48,64` (ban check fails open, documented in `AuthProvider.tsx:82-84`: "the database refuses a banned account's writes on its own"); `profiles-repo.ts:27,56` (avatar helpers); `auth-supabase.ts:134,406,408` (`.catch(() => null/undefined)` on avatar URL, revocation record, sign-out). Route loaders swallow to `null` (F2). `getAlerts` returns `[]` honestly (`fantasy-runtime.ts:315-323`).
- **Retry**: TanStack defaults + per-query overrides; `auth-supabase.ts:177-184` retries profile creation 3× after sign-up. No jitter/backoff of our own — acceptable.
- **Timeouts**: F9.
- **Pagination**: cursor-based and typed in `backend/news/supabase-repository.ts:96-124` and `backend/football/supabase-repository.ts:70-88` (`SEASON_FIXTURE_PAGE_SIZE = 100` with a documented cap); admin list pagination has behavioural tests (`routes/admin.news.pagination.test.ts`).
- **Two Supabase clients, two generated type files**: `integrations/supabase/client.ts` is typed with the legacy `./types` (`src/integrations/supabase/types.ts`, 1 283 lines, public schema, prettier disabled, no drift gate) and `v2-client.ts:10` re-casts it `as unknown as SupabaseClient<Database>` to the real generated contract (`src/backend/generated/database.types.ts`, 7 443 lines, gated by `backend:types:check`). Because the legacy file typechecks, dead public-schema code "reads as live" (ledger BG-0061 root cause). Client-side code that still reads `public.*` tables with the default client: `fantasy-owned-repository.ts:417,459` (dead class), `fantasy-id-map.ts:200-201`, `fantasy-gameweek-resolver.ts:84`, `fantasy-cloud-repo.ts` (dead). The live V2 path (`backend/fantasy/supabase-repository.ts:48-211`) is 100 % `getFantasyApi().rpc(...)` against the `api` schema, which matches what production exposes.

## 5. Validation & TypeScript safety

- `tsconfig.json`: `strict: true`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`; **but** `noUnusedLocals/Parameters: false` and eslint `no-unused-vars: off` (`eslint.config.js:56`) → nothing flags dead code (F5). Tests are excluded from `tsc` (`exclude: src/**/*.test.ts`), so test files are typechecked only by Bun at run time.
- Escape hatches in non-test, non-generated code: `as any` **0** in hand-written files (59 hits are all in `routeTree.gen.ts`, 1 in the test shim); `: any`/`<any>` 2; `as unknown as` 31 (mostly the v2-client cast, RPC arg shaping in `fantasy-cloud-repo.ts`, and test-shaped adapters); non-null `!` 9 (`lib/mcp/tools/*.ts:16-28` `process.env.SUPABASE_URL!` on server routes, `[.]lovable.oauth.consent.tsx:69`, `fantasy.transfers.tsx:392-394` `owned.snapshot!.currentGameweekId!` guarded one line earlier); `eslint-disable` 9 (4× `react-hooks/exhaustive-deps` in `admin.news.$articleEditionId.tsx:340`, `admin.users.tsx:126`, `admin.news.tsx:401`, `fpl/useFantasyScreen.ts:117` — the last one on a memo with 20+ dependencies). Type casts `as Foo` ≈ 152, concentrated in DTO mappers.
- **zod at boundaries**: 22 `src/backend/**` modules parse RPC/DTO payloads with zod 4 (`backend/fantasy/contracts.ts` 656 lines, etc.); on the client only `services/account-standing.ts` and the MCP tools. `validateSearch` exists on every route with search params (`auth.*`, `clubs.$clubId.tsx:53`, `matches.*:32/36`, `unsubscribe.tsx:32`, `fantasy.players.tsx:42`).
- **i18n completeness gate**: `scripts/qa/i18n-gate.ts` + `src/i18n/i18n-gate.test.ts` fail on any error and on any drift from committed warning baselines (W1–W4); suppressions are a typed allowlist (`i18n-allowlist.ts:18-41`, `satisfies Partial<Record<TranslationKey,string>>` so a deleted key breaks typecheck). `dictionaries.ts` has 1 425 keys in `fr` and 1 425 in `ar`; a JSX grep for accented French text outside dictionaries in non-admin routes/components found **0** hard-coded strings. This is the strongest quality gate in the codebase.

## 6. Build & bundle (measured)

| Item | Value |
|---|---|
| Build | succeeds (`.output/` nitro, cloudflare preset; `.output/public/assets` 181 JS files) |
| Total client JS | 2 196 509 B raw (2.10 MB) / 657 790 B gzip (642 kB) |
| CSS | `styles-C_navA4_.css` 153 kB raw / 24 kB gzip |
| Entry static closure (needed before any route paints) | 18 files, 1 186 kB raw / **347 kB gzip** |
| Largest chunks (raw / gzip) | index 510.5 / 157.0 kB; primitives 319.4 / 90.0; use-unsaved-changes-guard 227.8 / 90.7 (admin only); client (supabase-js) 200.8 / 51.2; schemas (zod) 68.7 / 18.2; matches.$matchId 46.7 / 12.4; LegalRoutePage 38.9 / 12.7; useStore (react) 26.9 / 9.5 |
| Largest images in assets | topic-fans.webp 152.6 kB, fantasy-hero.webp 100.8 kB, topic-stadium.webp 98.8 kB, welcome-wide.webp 97.3 kB, welcome.webp 96.4 kB (all webp; fine) |
| recharts / date-fns | not in any chunk (unused deps) |
| lucide-react | 90 distinct icons imported, one chunk → tree-shaken |
| React copies | one (`react@19.2.5`, `react-dom@19.2.5`) |
| Mock data in prod | yes (F1) |
| MCP SDK in client | no (`modelcontextprotocol` absent from client chunks) |
| Google Fonts | 3 families / 12 weights via `fonts.googleapis.com` link (`__root.tsx:225-233`) — third-party render-blocking CSS; perf stream to weigh self-hosting |

## 7. Dependency health

- Versions installed: react 19.2.5, react-dom 19.2.5, vite 8.0.16 (rolldown 1.1.0), **nitro 3.0.260603-beta** (pinned beta, required by `@lovable.dev/vite-tanstack-config@2.23.1`), @tanstack/react-router 1.170.16 / react-start 1.168.26 / router-plugin 1.168.18 (three minor versions apart — keep them in lockstep), @tanstack/react-query 5.101.1, typescript 5.9.3, @supabase/supabase-js 2.110.7, zod 4.4.3, sanitize-html 2.17.5 (F6), @lovable.dev/mcp-js 0.23.0 (latest 3.0.2, a major behind; it also drags `@modelcontextprotocol/sdk → ajv → fast-uri` with 6 high SSRF/host-confusion advisories — server-side only, hand to the security stream).
- `bun audit`: 41 vulnerabilities (21 high / 17 moderate / 3 low). High ones are transitive dev/toolchain (`fast-uri`, `browserslist`, `postcss`, `@babel/core`) except `fast-uri` via mcp-js which is a runtime server dependency.
- Supply-chain guard: `bunfig.toml` `minimumReleaseAge = 86400` with a documented exclusion list — good.
- Unused / dead-only dependencies: ~29 of 61 runtime deps (F5). `react-dom`, `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `@tanstack/router-plugin`, `vite-tsconfig-paths` show 0 importers but are consumed by the Lovable config / CSS `@import` — not unused.

## 8. Fragile / complex hotspots

Ten largest files under `src/` (lines):

| # | File | Lines | Why it is fragile |
|---|---|---|---|
| 1 | `src/backend/generated/database.types.ts` | 7 443 | generated; fine, drift-gated |
| 2 | `src/i18n/dictionaries.ts` | 3 135 | both languages in one 189 kB object shipped to every visitor; edits touch a hot file with 2 850 keys |
| 3 | `src/components/ui-kit/primitives.tsx` | 2 736 | the entire design system in one file (43 exports); every kit change re-bundles/ re-reviews everything; contract test is 796 lines of source-text assertions |
| 4 | `src/routeTree.gen.ts` | 1 386 | generated |
| 5 | `src/routes/admin.news.$articleEditionId.tsx` | 1 375 | **one component**, `AdminNewsEditRoute` `:251-1375` (1 125 lines, 19 hooks, ~211 branches, exhaustive-deps disabled at `:340`) |
| 6 | `src/integrations/supabase/types.ts` | 1 283 | stale generated public-schema types that still typecheck (BG-0061) |
| 7 | `src/routes/admin.prizes.tsx` | 1 103 | `WinnersPanel` 415 lines |
| 8 | `src/services/fantasy-owned-repository.ts` | 914 | four repository classes incl. the dead `CloudFantasyRepository`; `parseLifecycle` ↔ `DEFAULT_STATE` duplicated from `fantasy-state.ts` |
| 9 | `src/routes/profile.tsx` | 898 | mixes auth states, follows, notifications, avatar upload |
| 10 | `src/routes/fantasy.index.tsx` | 858 | hub page with 3 queries + prize welcome dialog |

Most complex functions (measured by lines / branch tokens / hooks): `TransfersBody` `fantasy.transfers.tsx:68-737` (670 lines, 158 branches, 12 `useState`, draft persistence via effects `:108-127`); `PickTeamBody` `fantasy.team.tsx:100-616` (517); `ArticlePage` `news.$articleId.tsx:128` (452); `AddPlayerScreen` `fpl/AddPlayerScreen.tsx:81` (448, 77 branches); `PlayersPage` `fantasy.players.tsx:109` (425, 17 hooks); `ProfileSetupPage` `auth.profile-setup.tsx:51` (424); `PointsBody` `fantasy.points.tsx:66` (410, 95 branches); `CreateTeamBody` `fantasy.create.tsx:93` (408, 14 hooks); `HomeContent` `index.tsx:140` (397, 21 hooks, 9 queries); `buildAuthUser` `auth-supabase.ts:127` (305 lines, 87 branches — every auth state transition passes through it); `useFantasyScreen` memo (`useFantasyScreen.ts:89-135`, 20+ deps with lint suppressed). Why fragile: these are page-sized closures where state, effects, mutations and JSX interleave; a change to one branch cannot be unit-tested in isolation (which is why the route tests grep the source instead — F10).

## 9. Frontend security assumptions

- **Secrets**: none in client code. The only key is the publishable one (`.env.production`). `client.server.ts:36-37` reads `SUPABASE_SERVICE_ROLE_KEY` in a `.server.ts` module; `lib/mcp/tools/*.ts` read `process.env` in server routes. Verified the MCP SDK and service-role code are absent from `.output/public/assets`.
- **HTML injection**: two `dangerouslySetInnerHTML` sites, both fed by content sanitised with the shared policy (`backend/news/sanitizer-policy.ts:37-77`: 18 tags, https-only, `enforceHtmlBoundary`, link rewriting, `loading="lazy"` on images) plus a read-side attribution pass (`services/news.ts:211-251`). The DB requires a MAC proving sanitisation. Open item: F6.
- **Redirect handling**: `sanitizeAuthCallbackNext` (`lib/auth-callback.ts:28-47`) rejects control chars, backslashes, protocol-relative and off-origin results by resolving against a sentinel origin — and has tests. All `next` consumers go through `validateSearch` (`auth.login.tsx:38-40`, `auth.mfa-challenge.tsx:20-22`, `auth.register.tsx:40-43`, `auth.profile-setup.tsx:35-42`) before `window.location.href = next` (`auth.login.tsx:96`, `mfa-challenge.tsx:90`). `[.]lovable.oauth.consent.tsx:74,143` follow a `redirect_url` returned by Supabase's OAuth-server API (server-sourced; acceptable).
- **Inline scripts**: `THEME_INIT_SCRIPT`/`SPLASH_INIT_SCRIPT` are inline `<script>` children (`__root.tsx:255-258`). When the security stream introduces a CSP (currently absent per brief), these need nonces or hashes; note the dependency.
- **Error telemetry**: `lib/lovable-error-reporting.ts` only forwards to `window.__lovableEvents`/`__lovableReportRuntimeError`, which exist inside the Lovable editor preview — production has **no** client error reporting sink (P3, LIKELY). `server.ts` wraps h3's swallowed 500s into a branded error page and logs the captured stack.

## 10. Test coverage vs critical journeys

Inventory: 169 unit/component test files (services 34, lib 23, backend ~45, routes 9, components ~45, i18n 2, theme 1, auth 1); 9 Playwright specs; CI runs typecheck, lint, `bun test`, build, and only the anonymous e2e (`backend-quality.yml:37-47`).

| Journey | Unit/component | e2e in CI | Verdict |
|---|---|---|---|
| Home `/` | `index.home-structure.test.ts` (source-text), `matches-home.option-a.test.ts` (renderToString of cards), `MatchCard` tests | anonymous smoke (visibility/overflow only) | structure only; data path, greeting, Fantasy card **unprotected** |
| Matches list + date strip | `DateStrip.test.tsx`, `match-days`, `match-kickoff` helpers | smoke | helpers well covered; route logic (season clamp `matches.index.tsx:80-92`) untested |
| Match detail `/matches/$id` | `match-page.option-a.test.tsx` (render), `match-live.test.ts`, `match-refresh.test.ts` | **none** | loader/head/polling integration **unprotected** |
| Standings | `StandingsTable.test.tsx`, `league-table.test.ts` | **none** | route + season switch **unprotected** |
| Club page | `club-page.option-a.test.tsx`, `club-season`, `follows.test.ts` | **none** | follow button mutation **unprotected** |
| News list/article | `news.test.ts` (610 lines, service), `article-meta`, `ArticleCard.semantics`, `editorial-body-styling` (CSS text) | `/news` smoke; article only via `news-cms.authenticated` (needs creds, not in CI) | public article page rendering + sanitised body **unprotected in CI** |
| Auth: login/register/verify/callback/MFA/profile-setup | `auth-callback.test.ts`, `auth.test.ts` (mock service), `auth-supabase.storage.test.ts`, `auth-provider-hydration.test.ts` | **none** (staging suite needs secrets) | the whole real Supabase flow **unprotected in CI** |
| Fantasy create → save → transfers → points → leagues | 34 service tests with mocked clients (`fantasy-owned-repository.test.ts` mocks `from`/`rpc`), `fantasy-engine`, `team-validation`, `transfers-service`, `points-service` | `fantasy.journey.e2e.ts` exists but skips without `E2E_FANTASY_EMAIL` and is not in any workflow | engine logic strong; **RPC contract and UI flows unprotected in CI** |
| Profile edit / avatar / security | none for `profile.tsx`, `profile.security.tsx` | `/profile` smoke (anonymous card only) | **unprotected** |
| Prizes, unsubscribe, legal | `prizes.test.ts`, `UnsubscribeView.test.tsx`, legal placeholder tests | `legal-brackets.e2e.ts` (not in CI) | partial |

Exact journeys with **no automated protection at all**: signed-in Home; match detail route; standings route; club follow; authenticated Fantasy create/save/transfer/points/leagues against real RPCs; every auth screen end-to-end; profile edit; MFA challenge.

## 11. Technical debt register

| ID | Item | Evidence | Size |
|---|---|---|---|
| D1 | Remove dead shadcn `components/ui/*` (26 files) and the ~29 unused deps; add `knip`/depcheck to CI | §5, F5 | M |
| D2 | Delete V1 Fantasy cloud path (`fantasy-cloud-repo.ts`, `CloudFantasyRepository`, `fantasy-payloads`/`rpc-args` V1 builders, `fantasy-id-map` public reads, `fantasy-gameweek-resolver`), rehome the two error classes, regenerate/remove `integrations/supabase/types.ts` | F5, ledger BG-0061 | M |
| D3 | Lazy-load mock repositories/services behind build-time mode constants | F1 | M |
| D4 | Router defaults: pending/error components, `preload="intent"`, per-section `errorComponent` | F2 | S–M |
| D5 | Zone the Home greeting; make relative times hydration-safe | F3 | S |
| D6 | Memoise `hub()` through the query cache; drop `all-players-for-alerts` until alerts exist | F4 | S–M |
| D7 | Request timeout in `createSupabaseFetch` | F9 | S |
| D8 | Coordinated `sanitize-html` bump (npm + edge function + MAC version) | F6 | M |
| D9 | Split `dictionaries.ts` per language and lazy-load the inactive one; move zod out of the entry closure | F8 | M |
| D10 | Break up the five 400–1 100-line route components (`admin.news.$articleEditionId`, `fantasy.transfers`, `fantasy.team`, `fantasy.points`, `fantasy.create`) into hooks + presentational parts; remove the 4 `exhaustive-deps` suppressions | §8 | L |
| D11 | Turn `noUnusedLocals`/`no-unused-vars` back on (with `_` prefix allowance) | §5 | S (plus fallout) |
| D12 | Nightly authenticated Playwright job with seeded staging accounts (`fantasy.journey`, `staging.acceptance`, `news-cms`) and a real overflow assertion | F10 | L |
| D13 | Client error reporting sink for production (Sentry-like or Supabase log RPC) | §9 | M |
| D14 | Language in the URL (or cookie read on the server) so SSR/head/loader follow the reader's language | F7 | XL |
| D15 | Align the TanStack trio versions; plan the `nitro` beta exit and `@lovable.dev/mcp-js` major upgrade | §7 | S / M |
| D16 | Add `.audit-tmp` (and similar scratch dirs) to eslint/prettier ignores so `eslint .` cannot be polluted | §0 | S |

The repository already carries a serious debt register: `docs/engineering/LAUNCH_LEDGER.yaml` (4 174 lines, BG-numbered items with root cause/verification). D2 = BG-0061 there. This report's items D1, D3–D9, D12–D13 are not in the ledger as far as grep shows.

## 12. Maintainability verdict

**Maintainable core, heavy sediment.** The live path is well built: strict TypeScript that typechecks clean, zero hand-written `any`, zod at the backend boundary, fail-closed data-mode selection, careful SSR/hydration discipline that is explained in comments where it matters, cleaned-up effects, a genuinely enforced i18n gate, and a documented decision ledger. Around that core sit a previous generation of components, a superseded Fantasy data layer, a stale generated schema, ~29 unused packages and route components of 400–1 100 lines — all invisible to the toolchain because unused-code checks are switched off and route tests assert on source text. The measurable consequences today are a 347 kB-gzip first-load closure that includes demo data, a Home page that hits the same RPC three times per signed-in load, a daily hydration mismatch window, and no navigation feedback outside `/admin`. None of these is a production-breaking defect (the one candidate — client code reading `public.fantasy_teams`, which production does not expose — turned out to be the unreachable V1 class), but they are exactly the conditions under which the next change breaks something the tests do not see.

### Scorecard suggestion (0–100)

| Area | Score | Basis |
|---|---|---|
| Frontend engineering | **68** | +: SSR + hydration discipline, code-split routes, fail-closed modes, polling/refresh policy in one place. −: no route error/pending boundaries or preloading (F2), mock data and both dictionaries in the entry (F1/F8), duplicate `hub()` calls (F4), greeting hydration bug (F3), no timeouts (F9), no prod error sink. |
| Code quality | **60** | +: zero console.log, consistent service pattern, decisions documented, prettier/eslint enforced. −: ~4 700 dead lines, two component systems, 400–1 125-line components, 29 unused deps, unused-code checks disabled, lint suppressions on the most complex hooks. |
| TypeScript safety | **78** | +: strict, clean typecheck, 0 hand-written `as any`, generated types with drift gate, zod at 22 backend boundaries, typed i18n keys and allowlist. −: stale legacy `Database` type still in force for the default client (`v2-client.ts:10` cast), 31 `as unknown as`, tests excluded from `tsc`. |
| Automated testing (frontend) | **52** | +: 2 062 passing tests in 11 s, strong helper/engine coverage, i18n and legal gates, admin safety tests. −: 41 test files assert on source text, only 5 anonymous routes covered by CI e2e, every authenticated journey (auth, Fantasy, profile, CMS) unprotected in CI, overflow assertion structurally blind. |

Artefacts: `.audit-tmp/build.log`, `.audit-tmp/typecheck.log`, `.audit-tmp/lint.log`, `.audit-tmp/bun-test.log`, `.audit-tmp/fnsize.mjs` (function-size scan), `.audit-tmp/mockmeasure/` (mock bundle measurement), `.output/` (build output, git-ignored, untouched tracked files).
