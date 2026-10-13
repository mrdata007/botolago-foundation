# BotolaGO launch build plan

## Purpose

This is a retrofit plan for a mature repository, not a plan to rebuild BotolaGO
from zero. It orders the remaining work from the active launch candidate to a
governed live release.

This file contains sequencing and dependency metadata only. Each unit must have
its own approved spec based on docs/specs/\_template.md before implementation.
The unit spec is authoritative for lifecycle, disposition, revision, approval,
owner, durable claim, blockers, and evidence.

## Baseline

- Observed: 2026-08-09
- Main: ea0e98911c2e4d1ce1e93f716dd7183e31d32276
- Active launch candidate: PR #123,
  agent/launch-readiness-milestones at
  1d87fb2cb7c38e1fd3576412092bf9ca47e0fb69
- Live production activation: not part of the baseline

## Ordering principles

1. Context and a canonical integration branch come first.
2. A safe demo may be certified without implying live readiness.
3. Schema/API/security corrections precede live data activation.
4. Current-season provider readiness and a bounded staging synchronization
   precede Fantasy worker and UI launch claims.
5. Correctness precedes capacity; capacity precedes production promotion.
6. The delivery lifecycle and environment evidence are independent.
7. Production migration, Supabase API platform configuration, application
   deployment, Identity configuration, Admin bootstrap/activation, data
   mutation/initialization, Fantasy catalog staging/registration opening,
   data/content provider activation, notification-delivery activation, worker
   activation, schedule activation, post-launch verification, and rollback each
   require separate authorization.

To resume work, walk this order, open the next unit's spec, and proceed only
when that spec is Approved and Active and records a durable central claim. A
missing spec must be created and approved before implementation.

## Unit 00 — Context and spec governance

- Spec: docs/specs/00-context-governance.md
- Outcome: BotolaGO has six project-specific context files, one AGENTS entry
  point, a launch build plan, and a reusable spec template.
- Dependencies: launch-candidate branch and current repository evidence
- Verify:
  - Existing Lovable AGENTS block is byte-identical.
  - All documented paths, commands, SHAs, and run IDs are valid.
  - The files describe BotolaGO rather than the download's generic examples.
  - No application, database, workflow, or production behavior changed.
- Non-goal: declaring the launch candidate ready or merging it to main.

## Unit 01 — Canonical launch-candidate reconciliation

- Spec: create docs/specs/01-launch-candidate-reconciliation.md before approval
- Outcome: reviewers select one canonical launch branch, reconcile PR #123 with
  relevant work in #121/#122, and explicitly close, supersede, or retain each
  divergent PR.
- Dependencies: Unit 00
- Verify:
  - The chosen head contains all approved Atlas, UX, demo, and launch-hardening
    changes.
  - No approved change is lost during reconciliation.
  - Application and database quality pass on the resulting exact SHA.
  - The PR description accurately separates implementation, CI, merge, and
    environment evidence.
- Non-goal: production merge or activation.

## Unit 02 — Isolated mock-preview certification

- Spec: create docs/specs/02-mock-preview-certification.md before approval
- Outcome: one canonical branch-scoped Vercel Preview runs the deterministic
  demo profile and is certified as unable to reach live systems.
- Dependencies: Unit 01, docs/qa/MOCK_DEMO_RELEASE.md, and separate
  external-communications approval before sharing
- Known prerequisite at the observed baseline: canonical project and deployed
  Preview evidence are missing.
- Verify:
  - Exact Preview variables are scoped only to the canonical branch/project.
  - No inherited provider or service secrets exist in the Preview scope.
  - Deployment Git SHA equals the reviewed branch head.
  - Persistent bilingual demo notice, noindex, simulation labels, and fictional
    manager disclosure appear on all relevant routes.
  - Admin, OAuth consent, MCP, Supabase, and provider access remain blocked.
  - The compiled-preview browser matrix passes against the real URL.
- Rollback: remove or disable the branch Preview; never promote it or attach the
  production domain.
- Non-goal: proving live data or production readiness.

## Unit 03 — Private-league RLS forward repair

- Spec: create docs/specs/03-private-league-rls-repair.md before approval
- Outcome: one additive migration corrects the private-league policy without
  weakening membership, ownership, or invite boundaries.
- Dependencies: Unit 01 and database/security approval
- Verify:
  - Focused pgTAP tests cover owner, member, non-member, and second-user access.
  - Existing migrations remain unchanged.
  - Grants are explicit and the forward-repair/rollback strategy is reviewed.
- Non-goal: promoting the migration to a shared environment.

## Unit 04 — Authoritative global rankings and manager identity

- Spec: create docs/specs/04-global-rankings-contract.md before approval
- Outcome: one stable API/RPC contract returns authoritative global rankings and
  the approved manager identity fields with deterministic ordering and privacy.
- Dependencies: Unit 01; Unit 03 additionally if the contracts share the repaired
  league boundary
- Verify:
  - Ranking, tie-break, pagination, identity visibility, and two-user isolation
    have SQL and repository coverage.
  - Live UI fails closed until the authoritative projection exists.
  - Generated V2 type parity passes.
- Non-goal: changing scoring rules or adding social profiles.

## Unit 05 — Invite-code rotation and recovery

- Spec: create docs/specs/05-invite-code-rotation.md before approval
- Outcome: private-league owners can rotate or recover invite access through one
  audited contract without exposing full codes to unauthorized readers.
- Dependencies: Unit 03 and product/security approval
- Verify:
  - Owner/member/non-member permissions, single-active-code behavior, audit
    evidence, redaction, retry safety, and revocation are covered.
  - Existing invite links fail or continue exactly as the approved product rule
    specifies.
- Non-goal: redesigning the entire leagues UI.

## Unit 06 — Staging migration parity

- Spec: create docs/specs/06-staging-migration-parity.md before approval
- Outcome: shared staging matches one reviewed forward-only repository migration
  chain after the release corrections are complete.
- Dependencies: Units 03 through 05, database owner authorization, and protected
  staging credentials
- Known prerequisite at the observed baseline: hosted inventory must be re-read;
  candidate evidence reported 35 of 47 repository migrations.
- Verify:
  - The hosted starting inventory is re-read rather than inferred from prose.
  - Migration, secret, clean-reset, pgTAP/RLS, database-lint, and generated-type
    checks pass before promotion.
  - The protected exact-SHA promotion succeeds once, and post-promotion inventory
    and two-user isolation match the reviewed manifest.
- Non-goal: production migration execution.

## Unit 07 — Current-season SportsMonks readiness

- Spec: create docs/specs/07-sportsmonks-readiness.md before approval
- Outcome: the protected readiness gate proves the current Botola season has
  nonzero rounds, nonzero teams, and an available fixture sample with correct
  identities and freshness.
- Dependencies: Unit 01 or another exact approved readiness-gate SHA, approved
  provider account/terms, and a server-only credential. This read-only provider
  verdict does not depend on staging migration parity.
- Known prerequisite at the observed baseline: the latest observed verdict was
  ready=false with zero rounds, zero teams, and no fixture sample.
- Verify:
  - Technical probe succeeds.
  - Readiness verdict is true, not merely workflow-green.
  - Counts and sample are bounded, current-season, and sanitized.
  - Team/competition/season mapping and crest handling preserve stable V2 IDs.
  - No raw credential or provider payload is retained.
- Non-goal: enabling every ingestion schedule automatically.

## Unit 08 — Bounded current-season staging synchronization

- Spec: create docs/specs/08-current-season-staging-sync.md before approval
- Outcome: one separately authorized, bounded staging synchronization ingests
  the approved current-season data, establishes canonical mappings, and
  initializes the Fantasy catalog, active gameweek, rules, and prices required
  by the launch canary.
- Dependencies: Units 06 and 07 plus separate staging data-mutation authorization
- Verify:
  - A dry-run manifest records bounded counts, provider season identity, mapping
    decisions, and cleanup/forward-repair strategy without raw payloads.
  - The real run uses normalized stable V2 IDs and an idempotent rerun creates no
    duplicates or conflicting gameweek state.
  - Football completeness/freshness and the approved Fantasy catalog, gameweek,
    rules, and price invariants pass.
  - Missing or unknown data stays unavailable rather than being fabricated.
- Non-goals: production ingestion, schedule activation, and unbounded history.

## Unit 09 — Authoritative Football/Fantasy canary

- Spec: create docs/specs/09-football-fantasy-canary.md before approval
- Outcome: football projections and the dependent Fantasy catalog, rules,
  gameweek, owned mutations, points, rankings, and leagues pass one bounded
  cross-domain launch canary.
- Dependencies: Units 04, 05, and 08
- Verify:
  - Public football reads are current and attributable.
  - Fantasy reads and calculations are server-authoritative.
  - First-time creation plus Pick Team, transfer, points, ranking, and league
    paths pass with two-user isolation.
  - Empty and unavailable states remain honest.
  - Evidence records the exact project, branch, and SHA.
- Non-goal: news, notifications, capacity, or schedule activation.

## Unit 10 — News launch contract and canary

- Spec: create docs/specs/10-news-launch-canary.md before approval
- Outcome: the product owner names the approved launch news sources and one
  bounded canary proves freshness, attribution, sanitization, and outbound-link
  behavior for those sources.
- Dependencies: Unit 06 and durable product/legal approval for each selected
  provider
- Known prerequisite at the observed baseline: commercial/provider decision is
  pending.
- Verify:
  - Only commercially approved metadata is stored and rendered.
  - Raw text, images, payloads, and credentials remain excluded unless separately
    licensed.
  - Publisher or worker activation is separately approved and reversible.
- Non-goal: activating every implemented provider.

## Unit 11 — Notifications launch canary

- Spec: create docs/specs/11-notifications-launch-canary.md before approval
- Outcome: authenticated notification preferences, device registration, delivery
  state, and account isolation pass one bounded canary for the approved launch
  channels.
- Dependencies: Unit 06 and an approved notifications launch spec
- Known prerequisite at the observed baseline: launch behavior and staging
  parity are not yet approved.
- Verify:
  - Consent/preferences, actor isolation, retry behavior, revocation, and bounded
    delivery evidence pass.
  - Missing external delivery capability produces an honest unavailable state.
- Non-goal: adding an unapproved notification inbox or channel.

## Unit 12 — Capacity, soak, and recovery

- Spec: create docs/specs/12-capacity-soak-recovery.md before approval
- Outcome: the unchanged five-runner, 2,500-user capacity gate and soak pass in
  the protected staging-load-test environment on the selected
  production-equivalent XL/2XL compute tier without authorization, isolation,
  correctness, or cleanup failures.
- Dependencies: Unit 09, selected compute tier, and approved staging load
  environment.
  News and notifications may proceed independently; final release certification
  still requires their applicable launch units.
- Known prerequisite at the observed baseline: staging live-domain correctness
  and the production-equivalent compute tier remain unproven.
- Verify:
  - Test model and thresholds are approved before execution.
  - Latency, error, resource, lock, and rate-limit results meet the gate.
  - Cross-account isolation remains correct under load.
  - Synthetic users and data are bounded and removed.
  - Recovery and rollback behavior are exercised.
- Non-goal: public launch.

## Unit 13 — Identity delivery and OAuth readiness

- Spec: create docs/specs/13-identity-readiness.md before approval
- Outcome: an approved identity launch matrix names every supported sign-in
  method, and staging proves email verification/recovery plus each enabled OAuth
  round trip, redirect, and account-isolation boundary.
- Dependencies: Units 01 and 06, approved identity provider matrix, and protected
  staging SMTP/OAuth configuration
- Verify:
  - Deliverability, verification, recovery, expiry, replay protection, sanitized
    return paths, and two-user isolation pass with bounded test accounts.
  - Every enabled OAuth provider uses exact approved origins, callbacks, scopes,
    and account-linking behavior; unsupported providers are explicitly disabled.
  - Secrets and message contents remain out of logs and artifacts.
  - Missing delivery/provider capability fails closed with an honest state.
- Non-goal: enabling an identity provider by assumption.

## Unit 14 — Legal and account-lifecycle launch gate

- Spec: create docs/specs/14-legal-account-lifecycle-gate.md before approval
- Outcome: named product and legal owners approve a launch-obligations manifest,
  and every required privacy, support, account-deletion, retention, and identity
  lifecycle journey either passes exact-SHA evidence or blocks release.
- Dependencies: Unit 13 plus durable product/legal decisions for the launch
  jurisdictions and audience
- Verify:
  - The manifest names the applicable policy surfaces, consent, support contact,
    deletion/export behavior, retention/cleanup, owner, and effective versions.
  - Required FR/AR user journeys and backend effects pass with redacted evidence.
  - Any approved exclusion has a named decision, rationale, jurisdiction/scope,
    and blocking effect; silence never means nonblocking.
- Non-goal: providing legal advice or inventing policy terms.

## Unit 15 — Release-candidate certification

- Spec: create docs/specs/15-release-candidate-certification.md before approval
- Outcome: one exact commit is approved as the live release candidate after
  complete application, database, browser, staging, provider, capacity,
  identity, and launch-obligations evidence.
- Dependencies: Units 01 and 03 through 14; Unit 02 remains an independent demo
  track
- Verify:
  - Main is protected and contains only reviewed changes.
  - Required status checks pass on the exact candidate SHA.
  - FR/AR mobile, tablet, and desktop browser journeys pass.
  - Deployment configuration, Supabase identity, migration inventory, workers,
    schedules, domains, identity delivery, and secrets match the approved plan.
  - Rollback is exact, tested, and owned.
  - Known exclusions and non-blocking limitations are explicit and approved.
- Non-goal: any production action before its separate human authorization.

## Unit 16 — Protected main promotion and exact-SHA re-verification

- Spec: create docs/specs/16-main-promotion.md before approval
- Outcome: the certified integration branch is merged into protected main
  without rewriting Lovable-connected history, and required checks plus the
  release manifest are re-established on the resulting exact main SHA.
- Dependencies: Unit 15 plus separate repository-governance and release approval
- Verify:
  - Integration target and main heads are re-fetched immediately before merge.
  - The approved merge strategy preserves published history and loses no
    reviewed commit or migration.
  - Required application, database, and release checks pass on the resulting
    exact main SHA; prior-branch evidence is not inherited blindly.
  - The refreshed release manifest pins that main SHA for later production
    authorization.
- Non-goal: any environment mutation or deployment.

## Unit 17 — Production database promotion

- Spec: create docs/specs/17-production-database-promotion.md before approval
- Outcome: the certified forward-only migration set is promoted from the
  re-verified main SHA to the exact production Supabase project through the
  protected database workflow.
- Dependencies: Unit 16 plus separate named database and release authorization
  for the exact SHA and project
- Verify:
  - Repository, branch, SHA, project identity, migration manifest, confirmation,
    and starting hosted inventory all match.
  - First-attempt and concurrency safeguards hold.
  - Post-promotion inventory, grants, RLS, and bounded two-user isolation pass.
  - Sanitized evidence and a reviewed forward-repair path remain available.
- Non-goals: application deployment, identity configuration, data/delivery
  provider activation, worker activation, schedule activation, and broad live
  user smoke tests.

## Unit 18 — Production Supabase API platform readiness

- Spec: create docs/specs/18-production-supabase-api-readiness.md before approval
- Outcome: the exact production Supabase project exposes only the approved api
  schema through PostgREST, with current platform configuration and a bounded
  read-only Data API canary.
- Dependencies: Unit 17 plus separate database, security, release, and
  infrastructure authorization for the exact project and configuration manifest
- Verify:
  - The starting hosted configuration is re-read rather than inferred from the
    conflicting historical activation documents.
  - Exact project identity, main SHA, PostgREST db_schema/exposed-schema setting,
    grants, schema cache/reload, and rollback values match the approved manifest.
  - Intended anon/auth api views and RPCs pass read-only canaries while app and
    app_private remain unexposed and service-role authority stays server-only.
  - Sanitized evidence records configuration and verdict without credentials.
- Non-goals: migrations, Auth/SMTP/OAuth configuration, application deployment,
  or production data mutation.

## Unit 19 — Production application deployment

- Spec: create docs/specs/19-production-application-deployment.md before approval
- Outcome: the re-verified exact main SHA is deployed to the named production
  project and domain through the protected deployment workflow.
- Dependencies: Units 16 through 18 plus separate named release/infrastructure
  authorization
- Verify:
  - Repository, branch, SHA, Vercel project, domain, configuration, and
    confirmation match.
  - Deployment health and bounded public/authenticated fail-closed smoke checks
    pass without changing identity, workers, schedules, or providers.
  - The prior deployment remains an exact, owned rollback target.
- Non-goals: database mutation, Identity configuration, data/content provider
  activation, notification-delivery activation, worker activation, and schedule
  activation.

## Unit 20 — Production Identity configuration and canary

- Spec: create docs/specs/20-production-identity-configuration.md before approval
- Outcome: only the approved Supabase Auth, SMTP, sender, site-origin, redirect,
  and OAuth provider configuration is activated on the exact production project,
  followed by a bounded identity canary.
- Dependencies: Units 16 through 19 plus separate product, security, release,
  and infrastructure authorization for the exact project and configuration
  manifest, plus separate bounded production-data-mutation authorization for
  controlled canary accounts and external-communications authorization for real
  SMTP/OAuth traffic
- Verify:
  - The sanitized before/after manifest pins Supabase project, application SHA,
    site URL, allowed origins/callbacks, SMTP service/sender, enabled providers,
    scopes, secret owners, and rollback values.
  - Bounded live verification, recovery, and each enabled OAuth round trip pass
    with controlled accounts, sanitized evidence, and cleanup.
  - No unsupported provider or broad callback activates by implication.
- Non-goals: notification delivery and data/content provider activation.

## Unit 21 — Production Admin control-plane readiness and activation

- Spec: create docs/specs/21-production-admin-readiness.md before approval
- Outcome: the production Admin control plane is re-proven on the exact release,
  and only the approved owner bootstrap or staff-role assignments are activated
  through bounded, auditable actions.
- Dependencies: Units 16 through 20 plus separate product, security, database,
  and release authorization, separate bounded production-data-mutation records
  for every bootstrap/role change, and external-communications authorization for
  any invitation
- Verify:
  - Hosted staff/role/permission inventory and bootstrap state are re-read rather
    than inferred from the blocked historical runbook.
  - AAL2/MFA, recent-auth, dual-control, least privilege, audit, revocation, actor
    isolation, and server-side permission resolution pass.
  - Read-only Admin access is proven before any role mutation; every approved
    bootstrap/assignment identifies actor, target, role, exact SHA, project,
    expiry/revocation owner, and sanitized evidence.
  - Unauthorized and revoked actors fail closed, and rollback/revocation works.
- Non-goal: broader editorial/Fantasy CMS expansion or implicit owner creation.

## Unit 22 — Production data and content provider activation

- Spec: create docs/specs/22-production-data-provider-activation.md before approval
- Outcome: only the individually approved football/news data and content provider
  modes and credentials are enabled against the certified deployment and data
  boundary.
- Dependencies: applicable Units 17 and 18 plus separate product,
  legal/commercial, security, release, and infrastructure authorization for each
  provider
- Verify:
  - The manifest names every provider, project, exact SHA, licensed data fields,
    credential owner, rate limit, stop condition, and rollback action.
  - A bounded read-only provider canary proves freshness, attribution,
    normalization, and fail-closed behavior without mutating canonical data or
    activating workers or schedules.
  - No unlisted provider activates by implication.
- Non-goal: Identity, production data mutation, notification-delivery, worker,
  or schedule activation.

## Unit 23 — Production notification-delivery activation

- Spec: create docs/specs/23-production-notification-delivery.md before approval
- Outcome: each approved external push, email, or other notification-delivery
  channel is activated independently against the certified application and
  consent model.
- Dependencies: Units 11 and 16 through 20 plus separate product, security,
  release, legal/commercial, infrastructure, and external-communications
  authorization for each enabled channel, plus separate production-data-mutation
  authorization when the canary persists delivery or device state
- Verify:
  - The manifest names channel, provider, project, exact SHA, sender/app identity,
    consent scope, credential owner, rate limit, retry/revocation behavior,
    stop condition, and rollback.
  - A bounded two-user delivery canary proves consent, isolation, redaction,
    delivery state, cleanup, and fail-closed behavior.
  - No unlisted channel activates by implication.
- Non-goal: changing Identity email delivery or enabling schedules.

## Unit 24 — Bounded production current-season initialization

- Spec: create docs/specs/24-production-season-initialization.md before approval
- Outcome: the separately owner-authorized first current-season production
  mutation for this launch manifest ingests one bounded season into canonical
  Football data while Fantasy registration and schedules remain closed.
- Dependencies: Units 16 through 20 and Unit 22 as applicable plus separate
  product, database, security, release, legal/commercial, and infrastructure
  authorization for the exact project, SHA, approved provider/source manifest,
  and mutation bounds
- Verify:
  - A protected dry run records starting inventory, bounded counts, canonical
    mapping decisions, freshness, and forward-repair/cleanup without raw payloads.
  - The first mutation and one idempotent rerun create no duplicates, orphaned
    mappings, unlicensed fields, or cross-project writes.
  - Football read canaries pass while workers, schedules, and Fantasy
    registration remain inactive.
- Non-goal: Fantasy catalog staging, registration opening, or recurring ingestion.

## Unit 25 — Production Fantasy catalog staging

- Spec: create docs/specs/25-production-fantasy-catalog-staging.md before approval
- Outcome: the approved Fantasy catalog, active gameweek, rules, and prices are
  staged against the initialized current season while registration remains
  closed.
- Dependencies: Unit 24 plus separate product, database, and release
  authorization for the exact catalog manifest and SHA
- Verify:
  - Catalog/player/team/gameweek completeness, price/rule invariants, stable IDs,
    unavailable states, and generated type parity pass.
  - The production catalog-staging operation is idempotent, and the prior closed
    state or forward-repair path is preserved.
  - A read-only catalog canary passes without team creation or schedule activation.
- Non-goal: opening Fantasy registration.

## Unit 26 — Production Fantasy registration opening

- Spec: create docs/specs/26-production-fantasy-registration.md before approval
- Outcome: the separately approved production registration control opens only
  after the exact staged catalog passes its release canary.
- Dependencies: Units 20 and 25 plus separate product, database, security, and
  release authorization for the exact project, SHA, opening window, and rollback,
  plus separate bounded production-data-mutation authorization for the controlled
  two-user canary
- Verify:
  - The control starts closed, exact catalog/gameweek/version preconditions pass,
    and concurrent first attempts cannot double-open or bypass ownership rules.
  - One bounded two-user creation/team/isolation canary passes with controlled
    cleanup and sanitized evidence.
  - The close/rollback trigger is tested and owned.
- Non-goal: worker or schedule activation.

## Unit 27 — Production worker activation

- Spec: create docs/specs/27-production-worker-activation.md before approval
- Outcome: only the individually approved production workers are enabled against
  the certified deployment and approved provider/data boundaries.
- Dependencies: applicable Units 17 through 26 plus separate named
  release/infrastructure authorization for each worker
- Verify:
  - The manifest names every worker, project, exact SHA, input boundary,
    idempotency key, lock, retry policy, owner, stop condition, and rollback.
  - Activation proof is dry-run/read-only unless a distinct production-data-
    mutation authorization record covers the exact bounded write. Worker
    activation never implies mutation authority.
  - No unlisted worker activates by implication.
- Non-goal: schedule activation.

## Unit 28 — Production schedule activation

- Spec: create docs/specs/28-production-schedule-activation.md before approval
- Outcome: only the individually approved production schedules are enabled at
  their reviewed cadences after the owned workers and providers are ready.
- Dependencies: applicable Units 22 through 27 plus separate named release and
  infrastructure authorization for each schedule and separate production-data-
  mutation authorization for every write-capable first run
- Verify:
  - The manifest names every schedule, exact worker, project, exact SHA, cadence,
    concurrency group, first-run window, owner, stop condition, and rollback.
  - First-run evidence proves locks, idempotency, bounded work, rate limits, and
    cleanup within its separately authorized mutation scope.
  - No schedule or cadence activates by implication.
- Non-goal: changing provider scope or worker behavior.

## Unit 29 — Post-launch verification and monitoring

- Spec: create docs/specs/29-post-launch-verification.md before approval
- Outcome: bounded live smoke tests and the approved monitoring window prove the
  explicitly activated surfaces on the exact production release.
- Dependencies: Units 17 through 28 as applicable and separate named release
  authorization for live verification or rollback, plus separate product,
  security, database, bounded production-data-mutation, and
  external-communications authorization for every applicable action in the exact
  smoke manifest
- Verify:
  - Live sign-up, verification, recovery, enabled OAuth, profile, public reads,
    Fantasy creation, team, transfers, points, league isolation, Admin access,
    approved notifications, and required account-lifecycle journeys are tested
    only within the authorized bounded plan.
  - Logs, metrics, alerts, ownership, cleanup, and stop/rollback criteria are
    observed for the approved window.
  - Evidence is sanitized and progress-tracker.md records only the actual
    production state.
- Non-goal: widening launch scope during verification.

## Later product tracks

These require their own plans and do not block the technical launch unless the
product owner changes scope:

- Consumer billing and subscriptions
- Prizes and rewards
- Editorial/football/Fantasy operations CMS
- Notification inbox
- Post-launch legal/support enhancements beyond the approved launch-obligations
  manifest
- Approved transfer history, automatic squad selection, or shareable team cards
- Licensed player imagery
- Native applications
