# Phase 6.5 Functional Acceptance Report

## Verdict

**FUNCTIONALLY ACCEPTED WITH DOCUMENTED EXTERNAL DEPENDENCIES**

This verdict applies to the current repository product surface and the
greenfield V2 contracts. It does not mean “bug-free”, does not certify
capacity, and does not activate any provider, worker, schedule, or production
deployment.

- Tested runtime source: `5a6134f` on
  `qa/phase6-functional-acceptance`.
- Protected environment: BotolaGO Staging V2,
  `srdrflfrfpwixsllveid`.
- Production V2 and Legacy: not selected or modified.
- Open P0 defects: **0**.
- Open P1 defects: **0**.
- Open functional P2 defects: **0**.

The final documentation commit changes no runtime behavior. GitHub
`application-quality`, `database-quality`, and protected
`staging-functional` results on the final PR head are the release records.

## Scope and route inventory

The audited route inventory is maintained in
`PHASE_6_5_FUNCTIONAL_ACCEPTANCE_PLAN.md`. It contains Home, the complete
current Auth/Profile surface, Matches and match detail, News and article
detail, every current Fantasy route, and the OAuth/MCP machine endpoints.

There are no standalone team, player, competition, notification-inbox, or
saved-content routes in the current frontend. Their implemented backend
contracts are covered at repository and database level; this report does not
invent missing UI or claim that a non-existent route was browser-tested.

## Evidence model

Acceptance is deliberately layered:

| Layer                     | Evidence                                                                                                                                                          | Result                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Protected staging browser | Real Supabase Auth/API mode, two isolated users, first-time Fantasy creation, cloud refresh, Arabic follow persistence, cross-user isolation, invalid credentials | PASS                       |
| Anonymous browser matrix  | French and Arabic across 320×700, 375×812, 390×844, 430×932, 768×1024, and 1440×900                                                                               | 12/12 PASS                 |
| Application contracts     | Auth, repositories, errors, drafts, conflict handling, Football, News, Notifications, Fantasy rules/scoring/finalization/leagues                                  | 330/330 PASS               |
| Database contracts        | Clean replay, pgTAP/RLS, database lint, generated-type drift                                                                                                      | PASS in `database-quality` |
| Build gates               | Typecheck, lint, production build, migration validation, committed-secret scan                                                                                    | PASS                       |

The protected browser test rejects unexpected console errors, unhandled page
errors, failed requests, and happy-path HTTP 4xx/5xx responses. Failure
screenshots and sanitized diagnostics are retained for seven days. Passwords,
JWTs, refresh tokens, publishable keys, Secret keys, and Management API tokens
are never uploaded.

## Flow matrix

| Domain                  | Automated coverage                                                                                                                                                                  | Outcome |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Auth and account        | Login, invalid credentials, registration/verification model, refresh/expiry, logout, password lifecycle, username normalization/reserved names, profile lifecycle, deletion request | PASS    |
| Home                    | Anonymous/authenticated module contracts, authoritative selectors, current Football/News/Fantasy empty/team states                                                                  | PASS    |
| Football                | Status normalization, public DTOs, match/detail repository contracts, provider isolation, ingestion resilience, browser-safe reads/write denial                                     | PASS    |
| News                    | Feed/home/detail DTOs, localization, sanitization, save ownership, provider isolation, ingestion dedupe/resilience                                                                  | PASS    |
| Notifications           | Templates in French/Arabic, quiet hours, event validation, list/preferences contracts, provider/worker idempotency and isolation                                                    | PASS    |
| Fantasy create          | First-time user, local-draft choice, autocomplete, quotas/budget/captaincy, enabled save, atomic cloud creation, route transition, authoritative refresh                            | PASS    |
| Fantasy team/transfers  | Draft retention, concurrency errors, lineup/rule validation, transfer budget/hits/Wildcard/Free Hit contracts                                                                       | PASS    |
| Fantasy points/chips    | Scoring categories, multipliers, substitutions, provisional/final semantics, idempotent finalization and Free Hit restoration                                                       | PASS    |
| Fantasy leagues/ranking | Create/join/leave/ownership contracts and deterministic ranking tie-breaks                                                                                                          | PASS    |
| Ownership/RLS           | Anonymous denial, cross-user denial, server-only writes, no direct `app`/`app_private` browser authority                                                                            | PASS    |

The staging browser flow exercises the highest-risk integration seam rather
than duplicating all deterministic database assertions through a browser:
Supabase password Auth, profile onboarding skip, first-time Fantasy
cloud-authoritative creation, refresh round trip, Arabic/RTL persistence, and
second-user isolation.

## Language, direction, and viewport matrix

| Language | Direction |  320 |  375 |  390 |  430 | Tablet | Desktop |
| -------- | --------- | ---: | ---: | ---: | ---: | -----: | ------: |
| French   | LTR       | PASS | PASS | PASS | PASS |   PASS |    PASS |
| Arabic   | RTL       | PASS | PASS | PASS | PASS |   PASS |    PASS |

The matrix asserts the root language/direction, critical content,
navigation, no horizontal overflow, and absence of console/network failures.
The authenticated Arabic staging journey additionally proves a persisted
follow after reload and confirms that it cannot see the first user’s Fantasy
team.

## Authority and security

- Production selectors fail closed unless Auth, Football, News,
  Notifications, and Fantasy explicitly select `supabase`.
- Anonymous Supabase users receive an honest read-only Fantasy guest state,
  never a local canonical team.
- Canonical Football/News/Fantasy DTOs accept PostgreSQL UUID text without
  importing provider IDs or requiring RFC version bits that PostgreSQL does
  not enforce.
- Browser mutations use controlled `api` RPCs/repositories. Route components
  do not gain service-role credentials or direct canonical-table authority.
- RLS is enabled and forced on product tables covered by the database suite.
- Raw Supabase/PostgreSQL/provider failures are mapped to stable errors.
- Secret scanning passes and protected staging values are masked before
  setup.

## Network and error behavior

Deterministic application/database tests cover offline/network failures,
session expiry, permission denial, version conflict, deadlines, validation,
idempotent retries, stale update rejection, provider rate limiting/outage,
partial ingestion, and finalization resume. Critical mutation controllers
retain drafts on failure and clear only the matching draft after confirmed
server success.

The staging invalid-credential journey verifies a localized message, a
terminating loading state, and an enabled retry control. Happy-path staging
journeys produce no unexpected HTTP errors or raw backend messages.

## Bugs found and fixed

The detailed reproduction and regression ledger is
`PHASE_6_5_BUG_BURN_DOWN.md`.

| Severity      | Found | Fixed | Open |
| ------------- | ----: | ----: | ---: |
| P0            |     2 |     2 |    0 |
| P1            |     3 |     3 |    0 |
| Functional P2 |     5 |     5 |    0 |

Principal corrections were production fail-closed authority, anonymous
Fantasy isolation, first-time autocomplete/import behavior, persistent team
follows, deployable brand media, News nullability, PostgreSQL UUID contracts,
and mobile create-team action placement.

## Staging fixtures and exact-zero cleanup

Each protected run creates a unique `p65-<timestamp>-<suffix>` namespace, two
verified Auth users, and one temporary staging Secret API key. It records the
Fantasy gameweek before-image before temporarily opening it.

Cleanup:

1. removes only the run’s Fantasy child rows in FK order;
2. deletes the two Auth users through the approved admin path;
3. relies on reviewed ownership cascades for profiles, preferences, and
   follows;
4. deletes the temporary API key;
5. restores every recorded gameweek field;
6. performs a bounded exact-zero inventory.

Final observed deterministic totals are zero for Phase 6.5 Auth users,
profiles, preferences/follows, Fantasy teams, squads, and lineups. The
capacity gameweek is restored to:

- status `finalized`;
- points state `final`;
- deadline `2090-01-01T10:30:00Z`;
- finalized at `2026-07-20T18:32:57.486369Z`;
- lock version `1`;
- scoring input version `2`;
- corrected at `null`.

Phase 6.5 provisions no EC2 instance, security group, key pair, Metrics key,
capacity runner, or load generator.

## Quality results

| Gate                                    | Result                                                             |
| --------------------------------------- | ------------------------------------------------------------------ |
| Frozen Bun install                      | PASS                                                               |
| Bun tests                               | PASS — 330 tests / 794 assertions / 60 files                       |
| Typecheck                               | PASS                                                               |
| Lint                                    | PASS — no errors; existing non-blocking fast-refresh warnings only |
| Production build                        | PASS                                                               |
| Migration manifest validation           | PASS                                                               |
| Committed-secret scan                   | PASS                                                               |
| Clean migration replay                  | PASS                                                               |
| pgTAP/RLS                               | PASS                                                               |
| Database lint                           | PASS                                                               |
| Generated-type drift                    | PASS                                                               |
| Protected staging browser               | PASS                                                               |
| Anonymous FR/AR viewport browser matrix | PASS — 12/12                                                       |

## External dependencies not exercised

The following are activation prerequisites, not disguised test passes:

- real SMTP delivery and deliverability;
- Google and Apple OAuth provider configuration;
- live Football provider ingestion;
- live News provider ingestion;
- live push/email notification delivery;
- production worker/cron activation;
- production compute selection and the deferred Phase 6 capacity
  certification on that tier.

Deterministic provider adapters and backend token/template contracts pass, but
they do not prove third-party delivery.

## Remaining P3 items

No product-functional P3 item is currently recorded. CI reports the upstream
GitHub Actions Node 20 deprecation warning and the application lint suite
retains pre-existing fast-refresh warnings; neither changes runtime behavior.

## Launch readiness and Phase 7 recommendation

The current product surface is functionally accepted for progression with the
external prerequisites above explicitly retained. Phase 7 may begin only as a
separate reviewed branch and should implement the Admin/CMS backend and
authorized editorial operations without activating production providers,
workers, schedules, or deployment by implication.

Capacity remains an activation/scaling workstream and must not be inferred
from this functional verdict.
