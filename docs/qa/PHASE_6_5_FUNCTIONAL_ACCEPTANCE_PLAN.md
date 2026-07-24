# Phase 6.5 Functional Acceptance Plan

## 0. Scope, baseline, and evidence rules

Phase 6.5 proves the current BotolaGO product flows against **BotolaGO Staging
V2** (`srdrflfrfpwixsllveid`). It does not certify capacity, activate providers,
enable schedules, change Fantasy Ruleset v1.0, or modify Production V2 or the
Legacy project.

The tested source baseline is `main` commit
`6ee4a83f1c9908def645216e853a60275440e208`. Every acceptance run receives a
unique ID in the form `p65-<UTC timestamp>-<random suffix>`. Synthetic emails,
user metadata, profile display names, league names, idempotency keys, and
fixture attribution carry that run ID.

Evidence must distinguish:

- automated from manually observed results;
- repository/database contract coverage from browser coverage;
- fixture-provider results from live external delivery;
- current product behavior from routes or controls that do not exist;
- an exercised PASS from a documented external dependency;
- a direct current inventory from inherited evidence.

The entry guards passed with two explicit evidence qualifications:

- `main` has no separate push-triggered Backend quality run. Its Phase 6 parent
  and the workflow-cleanup PR both passed the required application and database
  jobs before merge.
- AWS is not directly queryable from this local runtime. The last independently
  recorded Phase 6 inventory is EC2/security groups/key pairs `0/0/0`, and no
  capacity, diagnostic, soak, or load workflow has run since. This boundary will
  not be represented as a fresh AWS API observation.

The connected Supabase project is explicitly named `BotolaGO Staging V2`, is
`ACTIVE_HEALTHY`, and is in `eu-west-3`. Its database settings
(`max_connections=120`, `shared_buffers=1GB`, `effective_cache_size=3GB`) match
the approved Medium tier. The deterministic Phase 6 Auth/Fantasy inventory is
zero. Capacity gameweek `fa640000-0000-4000-8000-000000000002` is at the
documented baseline: `finalized/final`, `lock_version=1`,
`scoring_input_version=2`, `corrected_at=null`, and
`finalized_at=2026-07-20T18:32:57.486369Z`.

## 1. Complete route inventory

| Route | Audience | Primary domain | Acceptance focus |
|---|---|---|---|
| `/` | Anonymous, guest, authenticated | Home | Entry state, modules, authoritative data, navigation |
| `/auth/login` | Anonymous | Auth | Password login, OAuth availability, errors |
| `/auth/register` | Anonymous | Auth | Registration, validation, duplicate submission |
| `/auth/verify` | Pending verification | Auth | OTP lifecycle and resend |
| `/auth/callback` | Auth callback | Auth | OAuth/recovery callback and safe redirect |
| `/auth/forgot-password` | Anonymous | Auth | Enumeration-safe reset request |
| `/auth/update-password` | Recovery/authenticated | Auth | Token validity and password update |
| `/auth/profile-setup` | Authenticated | Identity | Onboarding, username, language, avatar, preferences |
| `/profile` | All states | Identity | Profile display/edit, preferences, sign-out |
| `/matches` | Public | Football | Date navigation, grouping, statuses, empty/error states |
| `/matches/$matchId` | Public | Football | Header, timeline, lineups, statistics, standings context |
| `/news` | Public | News | Feed, lead, filters, search/pagination where exposed |
| `/news/$articleId` | Public/authenticated | News | Detail, media, related, save state |
| `/fantasy` | Layout | Fantasy | Shared navigation and route framing |
| `/fantasy/` | Public/authenticated | Fantasy hub | First-time/team CTA, summary, alerts, leagues |
| `/fantasy/create` | First-time Fantasy user | Fantasy | Draft, validation, atomic team creation |
| `/fantasy/team` | Fantasy owner | Fantasy | Squad/lineup, captaincy, drafts, conflicts |
| `/fantasy/transfers` | Fantasy owner | Fantasy | Preview/confirm, budget, hits, idempotency |
| `/fantasy/points` | Fantasy owner | Fantasy | Provisional/final points, history, chips |
| `/fantasy/leagues` | Fantasy owner | Fantasy | List/create/join and errors |
| `/fantasy/leagues/$leagueId` | Permitted league user | Fantasy | Visibility, standings, leave/archive |
| `/fantasy/players` | Public/authenticated | Fantasy catalog | Filters, ordering, pagination bounds |
| `/fantasy/players/$playerId` | Public/authenticated | Fantasy catalog | Player summary and invalid ID |
| `/fantasy/fixtures` | Public/authenticated | Fantasy | Approved difficulty availability/empty state |
| `/fantasy/top-players` | Public/authenticated | Fantasy | Calculated top players, no fabricated metrics |
| `/fantasy/rules` | Public | Fantasy reference | Ruleset v1.0 presentation |
| `/.lovable/oauth/consent` | Authenticated integration user | OAuth/MCP | Consent guard and redirect integrity |
| `/.well-known/oauth-protected-resource` | Machine-readable public | OAuth/MCP | Metadata contract |
| `/mcp` | MCP client | MCP | Transport and authentication contract |
| `/.mcp/list-tools` | MCP client | MCP | Tool enumeration authorization |
| `/.mcp/invoke-tool/$tool` | MCP client | MCP | Tool input validation and authority |

There are currently no standalone team, player, competition, saved-content, or
notification-inbox routes. Their current backend contracts are tested at
repository/API level, and their absence is not converted into invented UI.

## 2. Critical user-journey inventory

### Tier A — launch-critical

1. Register → verify → profile setup → authenticated Home.
2. Login → session refresh → authenticated navigation → local/global logout.
3. Forgot password → approved staging token lifecycle → password update.
4. Profile edit → language/preference persistence → refresh round trip.
5. Public Home → matches → match detail.
6. Public Home/news → article detail → related article.
7. Authenticated article save → saved API read → unsave.
8. First-time Fantasy user → draft → valid team creation → Team route.
9. Fantasy owner → modify lineup/captaincy → save → refresh.
10. Fantasy owner → preview transfer → confirm → authoritative refresh/history.
11. Fantasy owner → chip activation and duplicate/deadline rejection.
12. Deterministic scoring → provisional result → finalization → history.
13. League owner creates; second user joins; privacy, standings, leave/archive.
14. Two-user ownership and RLS denial across Identity, News, Notifications, and
    Fantasy.

### Tier B — important secondary

- Arabic/RTL completion of every Tier A flow that exposes UI.
- Follow/unfollow team and competition repository round trips.
- Notification list/unread/read-all/dismiss/preferences/deep-link contracts.
- Football status/read-model matrix and invalid/missing resources.
- News filters/search/pagination/localization and unpublished denial.
- Draft survival through offline, timeout, 401, 409, 429, and 503 scenarios.
- Mobile overflow, focus, touch-target, safe-area, and reduced-motion checks.

### Tier C — external/configuration dependent

- Real SMTP delivery.
- Google and Apple OAuth.
- Live Football/News providers.
- Live push/email notification delivery.

Tier C is reported honestly and cannot be promoted to PASS through fixture
adapters.

## 3. Anonymous versus authenticated matrix

| Capability | Anonymous/guest | Authenticated owner | Other authenticated user |
|---|---|---|---|
| Public football/news reads | Allow | Allow | Allow |
| Draft/local preview state | Guest-only temporary state | Draft-only | Isolated draft-only |
| Profile/preferences | Deny | Own only | Must not read/mutate owner |
| Follows/saved articles | Prompt/deny | Own only | Must not read/mutate owner |
| Notification inbox/preferences | Deny | Own only | Must not read/mutate owner |
| Fantasy catalog/rules | Safe public contract | Allow | Allow |
| Fantasy team/history | Deny/private empty | Own only | Deny |
| Fantasy mutations | Deny | Transactional RPC only | Deny |
| Private league | Deny unless public contract | Member/owner rules | Deny unless member |
| Football/editorial writes | Deny | Deny | Deny |
| Points/finalization/rank writes | Deny | Deny | Deny |
| Trusted workers | Not browser-accessible | Not browser-accessible | Not browser-accessible |

## 4. French versus Arabic matrix

Every Tier A browser flow runs once in French/LTR and once in Arabic/RTL.
Repository contract suites exercise localized DTOs even where no standalone
route exists.

| Surface | French | Arabic | Additional assertion |
|---|---|---|---|
| Auth/profile/onboarding | Required | Required | No mixed residual copy |
| Home/navigation | Required | Required | Logical order and direction |
| Matches/detail | Required | Required | Dates, scores, statuses |
| News/detail/search | Required | Required | Edition linkage and sanitized body |
| Fantasy create/team/transfers | Required | Required | Numbers, forms, drawers |
| Points/history/leagues | Required | Required | Tables and rank direction |
| Errors/empty/loading states | Required | Required | Localized actionable messages |
| Notification template/deep link | Required | Required | Correct locale and bidi isolation |

## 5. LTR versus RTL matrix

For each critical page the suite asserts:

- root `dir` and language attributes;
- logical padding/margin and directional icons;
- form field order and readable validation association;
- table/card order, navigation direction, and back actions;
- no horizontal overflow at the document and critical-container level;
- Arabic typography remains readable at 200% zoom;
- focus order follows visual/logical order;
- bidi-safe numbers, scores, dates, usernames, and invite codes;
- language switching invalidates localized queries without leaving stale copy.

## 6. Mobile viewport matrix

| Profile | Size | Coverage |
|---|---:|---|
| Compact mobile | 320×700 | Every Tier A route; overflow and touch targets |
| Small mobile | 375×812 | Every Tier A route |
| Standard mobile | 390×844 | Every Tier A route |
| Large mobile | 430×932 | Every Tier A route |
| Tablet | 768×1024 | Navigation, forms, tables, drawers |
| Desktop | 1440×900 | Navigation, major flows, focus and responsive bounds |

Touch controls that perform critical actions must expose at least a 44×44 px
interactive box. The matrix also runs a reduced-motion project and checks
safe-area behavior where CSS environment insets are supported.

## 7. Backend-authority verification matrix

| Surface | Required authority | Current selector/call path to verify |
|---|---|---|
| Auth/session | Supabase Auth | `services/auth*`, `AuthProvider` |
| Profiles/onboarding/follows | `api` schema RPC/views | Identity repositories |
| Home football | Football V2 repository | `footballService` |
| Home news | News V2 repository | `newsService` |
| Home Fantasy summary | Fantasy V2 repository | Reject `botolaService`/local canonical data |
| Matches/detail | Football V2 repository | `SupabaseFootballRepository` |
| News/detail/saved | News V2 repository | `SupabaseNewsRepository` |
| Notifications | Notifications V2 repository | Supabase repositories |
| Fantasy catalog/read models | Fantasy V2 repository | `SupabaseFantasyRepository` |
| Fantasy owned mutations | Transactional `api` RPCs | Owned repository/mutation controller |
| Drafts | Local, scoped by user/team/version | Draft stores only |
| Provider/worker operations | Trusted server context | Never browser bundle |

Known audit targets include the generic `botolaService` mock still imported by
Home, Profile, and several Fantasy routes, and Auth mode selection when
production configuration is absent. These are hypotheses until deterministic
acceptance tests reproduce an authority violation.

## 8. Network and error-state matrix

For login, onboarding, save article, create team, lineup save, transfer
confirmation, chip activation, and league join/create:

| Condition | Expected behavior |
|---|---|
| Offline before action | Localized actionable error; no request; draft retained |
| Offline after action/before response | Ambiguous outcome handled idempotently; draft retained until reconciliation |
| Timeout | Loading terminates; safe retry; no duplicate effect |
| 401/session expiry | Session recovery or login prompt; no local authority fallback |
| 403 | Localized access denial; no raw backend details |
| 409/version conflict | Conflict UI with Reload Latest/Keep Working; draft retained |
| 429 | Localized rate-limit state; bounded retry guidance |
| 500/503 | Localized unavailable state; optimistic state rolled back |
| Partial DTO | Safe partial/empty state or typed contract failure |
| Provider unavailable | No fabricated public data and no mock fallback |

The harness records sanitized console errors, unhandled rejections, failed
requests, status codes, and route transitions. It never records request
authorization headers, cookies, tokens, passwords, or raw session storage.

## 9. Cross-user and RLS matrix

Two separately authenticated users plus an anonymous client exercise:

- profile read/update isolation;
- preferences and follows isolation;
- saved-article ownership;
- notification list/read/dismiss/preferences isolation;
- Fantasy team, squad, lineup, transfers, chip uses, results, and history
  isolation;
- private-league membership and owner-only mutations;
- public league visibility;
- anonymous/authenticated writes denied on Football and News;
- browser writes denied on notification deliveries, Fantasy points,
  finalization, rankings, rules, and reference data;
- direct access denied for `app` and `app_private`;
- only explicitly granted `api` views/RPCs are callable;
- missing production configuration fails closed;
- client build contains no service-role/secret credential.

Existing pgTAP/RLS suites are extended only when a matrix cell lacks a
permanent assertion.

## 10. Staging test-data design

Run-scoped fixtures:

- `anonymous`: isolated browser context with no storage.
- `user-a`: normal verified user, complete profile, saved/followed content.
- `user-b`: normal verified user used for ownership/RLS denial.
- `first-fantasy`: verified/onboarded user with no Fantasy team.
- `fantasy-owner`: verified/onboarded user with valid team and lineup.
- `league-member`: verified/onboarded user with valid team.

All emails use `p65-<run-id>-<role>@staging.botolago.invalid`; display names
start with `Phase 6.5 <run-id>`; user metadata includes a non-authoritative
synthetic marker; team and league names embed the run ID. Canonical football,
news, notification, and Fantasy fixtures use reviewed deterministic UUIDs or
run-attribution records in staging-only namespaces. Existing reference/catalog
rows are reused read-only.

Test credentials and sessions live only in an owner-readable runtime directory
outside the repository. Browser storage state and screenshots are sanitized
before artifact retention.

## 11. Cleanup strategy

Cleanup is registered before fixture creation and runs on success, failure,
cancellation, and timeout.

1. Stop browsers/workers and revoke every temporary session.
2. Delete run-scoped league memberships/leagues.
3. Delete run-scoped notification, saved/follow, Fantasy, profile/preference,
   and account-security rows in bounded FK-aware batches.
4. Delete synthetic Auth users through the approved admin path in bounded
   batches.
5. Restore deterministic fixture/gameweek rows to their recorded before-image.
6. Remove any temporary API/Metrics key.
7. Delete runtime credentials, storage state, session caches, and raw artifacts.
8. Verify exact zero one resource/table at a time using the run ID and
   deterministic UUID predicates.
9. Reconfirm capacity gameweek baseline and inherited AWS `0/0/0` evidence; a
   fresh AWS inventory requires an approved read-only OIDC path.

Cleanup failure makes the acceptance verdict fail even when tests pass.

## 12. Browser-test strategy

No browser/E2E framework currently exists. Add the smallest Playwright setup
needed for acceptance:

- Chromium projects for the required viewport/language matrix;
- authenticated storage state created at runtime and never committed;
- staging-backed build with all V2 modes explicitly set to `supabase`;
- `webServer` only for the local app process; data remains Staging V2;
- page/request instrumentation with secret/header/body scrubbing;
- screenshot, trace, and sanitized console/network evidence on failure;
- helpers for overflow, touch target, focus-visible, `dir`, reduced motion,
  navigation, and no-unhandled-rejection assertions;
- route/domain specs rather than one unmaintainable end-to-end script;
- deterministic network fault injection for client recovery behavior.

The suite will not use a mock-only preview to claim staging acceptance. Fixture
provider contracts remain valid for external-provider tests explicitly labeled
as fixtures.

## 13. Database and integration-test strategy

- Replay all migrations from zero in local Supabase.
- Run all pgTAP domain and RLS suites.
- Add missing cross-user, anonymous, RPC idempotency, deadline, conflict,
  finalization, and authority cases.
- Exercise Staging V2 through publishable/authenticated clients for public and
  owner paths; use trusted admin setup only for synthetic fixtures/cleanup.
- Invoke deterministic Fantasy workers explicitly; production schedules remain
  disabled.
- Assert generated TypeScript types match a clean local database.
- Run repository contract tests against deterministic DTOs and staging smoke
  contracts.
- Validate `api` exposure and direct `app`/`app_private` denial.
- Keep live provider tests optional and non-gating unless credentials and
  activation are separately approved.

## 14. Defect-severity definitions

- **P0 — Production blocker:** corruption/loss, auth or RLS bypass, cross-user
  exposure, account takeover, corrupt Fantasy state, unusable critical route,
  or production local/mock authority fallback.
- **P1 — Major:** critical journey unreliable, failed mutation loses work,
  critical French/Arabic/RTL breakage, duplicate effect, unsafe session
  recovery, or raw server error exposed.
- **P2 — Significant:** important secondary flow/error state/navigation/control
  failure, persistent console error, blocking mobile overflow, or inconsistent
  saved/follow/read state.
- **P3 — Minor/cosmetic:** non-blocking copy, spacing, or optional polish.

Every defect is reproduced before a change, fixed at its smallest root cause,
and receives a permanent focused regression test before domain/full-suite
verification.

## 15. Exit criteria

The final verdict may be `FUNCTIONALLY ACCEPTED`,
`FUNCTIONALLY ACCEPTED WITH DOCUMENTED EXTERNAL DEPENDENCIES`, or
`NOT FUNCTIONALLY ACCEPTED`.

Acceptance requires:

- P0/P1/P2 functional open counts are all zero;
- every Tier A flow has a passing automated test;
- French, Arabic, RTL, and the required viewport matrix pass;
- no blocking overflow, unexpected console error, unhandled rejection, or
  happy-path API error remains;
- authority, cross-user/RLS, idempotency, conflict, deadline, draft recovery,
  and Fantasy finalization round trips pass;
- no production mock/local canonical fallback remains;
- exact-zero staging cleanup and gameweek restoration pass;
- migration replay, pgTAP/RLS, DB lint, generated-type drift, backend Python
  tests, Bun tests, typecheck, lint, build, formatting, secret scan, browser
  suite, and GitHub CI pass.

The report will not claim capacity certification or live delivery that was not
exercised.

## 16. Risks and untestable external dependencies

- Real SMTP, Google OAuth, Apple OAuth, live Football/News providers, and live
  push/email delivery may be unconfigured. Their internal token/adapter
  contracts are testable; external delivery remains an activation prerequisite.
- The frozen route tree lacks standalone notification, team, competition,
  non-Fantasy player, and saved-content pages. Backend contracts can be
  accepted, but nonexistent UI is not silently treated as tested.
- The generic mock service is still imported by production-facing routes.
  Acceptance must determine whether those calls are presentation fixtures or
  unauthorized canonical fallback.
- Single-language canonical team/player names may limit genuine Arabic content
  even when the RTL UI is correct. The report separates localization-contract
  support from data completeness.
- Browser acceptance needs protected staging credentials without exposing
  them. If no approved runtime injection path is available, staging browser
  execution is blocked rather than downgraded to mock-only evidence.
- A fresh AWS zero-inventory assertion requires protected OIDC execution. The
  inherited exact-zero evidence is sufficient for entry only while no AWS
  provisioning workflow or manual load-test action occurs.
