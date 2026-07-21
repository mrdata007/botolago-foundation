# Phase 6 — Fantasy Domain Delivery Report

## Architecture summary

Phase 6 establishes an authoritative relational Fantasy domain under `app`,
private idempotency/audit/worker state under `app_private`, and a DTO/RPC-only
surface under `api`. Internal UUIDs are canonical. Football competition,
season, round, team, player, fixture, event, and statistic UUIDs are referenced
without mutating Football. Rules, points, prices, and rankings remain
Fantasy-owned.

The frontend compatibility boundary is a V2 repository. Production cloud
selection uses the V2 API and rejects browser finalization. The previous cloud
adapter remains marked deprecated only for deterministic legacy contract tests;
factory/hook production paths no longer instantiate it. Draft storage remains
client-side and non-authoritative.

## Schema and migrations

- `20260720141826_fantasy_catalog_rules.sql`: competitions, versioned rules,
  positions/quotas/scoring, seasons, gameweeks, player catalog, price history.
- `20260720141847_fantasy_teams_transfers_chips.sql`: teams, temporal squads,
  historical lineups, transfer ledger, chip uses, Free Hit snapshots,
  idempotency keys, append-only mutation audit.
- `20260720141850_fantasy_scoring_leagues_operations.sql`: explainable point
  events/totals, substitutions/results, leagues/memberships/rankings, job and
  correction ledgers.
- `20260720141854_fantasy_api_security.sql`: validation helpers, read DTOs,
  owner mutations, worker operations, Fantasy Notification activation,
  search index, ownership policies, and explicit grants.
- `20260720144832_fantasy_position_seed.sql`: four stable position reference
  codes only; quotas and scoring remain versioned ruleset data.
- `20260720173500_fantasy_route_read_contracts.sql`: bounded gameweek, league,
  top-player, and owner archive contracts required by the frozen routes.
- `20260720174500_fantasy_index_hardening.sql`: covers every Fantasy foreign-key
  path reported by the staging performance advisor.
- `20260720163222_fantasy_ruleset_v1.sql`: publishes the approved immutable
  v1.0 rules, price/chip/fixture/ranking configuration, and retry-safe workers.
- `20260720183645_fantasy_ruleset_v1_index_hardening.sql`: covers every
  foreign key introduced by the v1.0 migration.
- `20260720184632_fantasy_standings_keyset_hardening.sql`: adds covering
  overall/gameweek league keyset paths.
- `20260720191839_fantasy_standings_rpc_pagination.sql`: keeps overall and
  gameweek predicates indexable, materializes the bounded keyset page before
  joining team display data, and preserves the existing public DTO and grants.

All tables enable and force RLS. Canonical tables have no direct browser
grants. Owner mutations use auth ownership, server time, advisory/row locks,
expected versions, idempotency keys, and stable error codes.

## Team, transfers, and chips

Team creation validates season/gameweek state, team name, 15-player uniqueness,
eligibility, position quotas, formation, captaincy, club limits, and budget in
one transaction. Historical squad memberships and gameweek lineups are
separate. Transfers derive sale/purchase totals, bank, free transfers, and hits
server-side and create an immutable batch/detail ledger. Wildcard and Free Hit
zero hits. Free Hit snapshot capture and restoration are retry-safe. Chip
activation is one-per-type and one-per-gameweek with cancellation bounded by
deadline and transfer usage.

## Scoring and finalization

Scoring produces category-level idempotent records keyed by player, fixture,
source key, and version. A deterministic TypeScript rules engine covers
appearance, positional goals, assists, clean sheets, conceded goals, saves,
penalties, cards, and own goals. Bonus and player-of-the-match are disabled in
v1.0. Automatic substitutions enforce
goalkeeper separation, bench order, formation, vice-captain promotion, and
Bench Boost behavior. The documented 12-stage finalization plan is resumable,
versioned, and short-circuits finalized gameweeks.

## Leagues and rankings

Public/private leagues use cryptographically random invite material stored only
as SHA-256 digest plus a four-character display hint. Membership is unique by
team and user. Private reads require membership. Rankings use deterministic
ordering: total points descending, transfer hits ascending, confirmed
transfers ascending, latest finalized score descending, creation time
ascending, then team UUID. Missing ranks remain null rather than fabricated.

## API/RPC contracts

Read contracts include hub, player pool/search, rules, current team, points,
history, and league standings. Transactional owner contracts include create
team, save lineup, transfer preview/confirm, chip activation/cancellation, and
league create/join/leave. Trusted worker contracts cover run tracking, stale-
protected point upserts, Free Hit restoration, free-transfer rollover, and
ranking recalculation. Production schedules remain disabled.

All Fantasy routes now import a mode-aware compatibility facade. Production
selects V2 Supabase reads and authoritative owner mutations; preview and tests
retain deterministic mocks. Local storage remains limited to drafts and the
explicit mock mode. Fixture-difficulty ratings return an empty cloud read model
until a versioned product rule exists, rather than inventing ratings.

## Tests and validation

- clean V2 migration replay from zero (28 migrations): pass;
- pgTAP/RLS: 14 files, 264 assertions: pass;
- full unit/integration suite: 316 tests, 767 expectations: pass;
- generated database types: synchronized after Phase 6 migrations;
- typecheck: pass;
- build: pass;
- lint: pass with 11 pre-existing Fast Refresh warnings and no errors;
- migration policy validation: pass;
- committed-secret scan: pass.

All eleven Phase 6 migrations were also applied to **BotolaGO Staging V2**.
Staging checks confirmed the four bounded route contracts and their grants,
anonymous archive denial, authenticated owner-RPC reachability, and zero
uncovered Fantasy foreign keys. Production V2 and Legacy were not queried or
modified. Supabase's security advisor reports only informational
deny-by-default tables with no policies, which is intentional because browser
access is RPC-only.

## Performance findings

Indexes cover active player-pool filters, every Fantasy foreign key,
club/position/price lookup, current squads, gameweek lineups/results,
transfer/history order, live job claims, league membership, and ranking
scopes. Player search uses an indexed simple
full-text expression rather than `LIKE`. Growing feeds use bounded limits and
keyset cursors. Ranking and finalization workers are batch-oriented; Redis is
not justified before deadline/load measurements.

The guarded capacity seed reached 50,000 teams, 750,000 active memberships,
50,000 lineups, a 10,000-member league, and 1,000 additional leagues.
Finalization completed in 31.92 seconds, overall ranking in 6.90 seconds, and
the large-league ranking in 1.84 seconds with all idempotency invariants
passing.

The standings bottleneck was fixed without changing its DTO or page size. The
old RPC joined and sorted all 10,000 league teams before `LIMIT`, taking
1,053.044 ms and 41,526 shared-buffer hits inside PostgreSQL. The bounded
keyset-first function takes 13–17 ms at the database boundary. Three public
HTTP runs produced first-page p95 values of 254.29, 195.78, and 224.24 ms and
later-page p95 values of 204.12, 210.82, and 198.73 ms. All 1,200 measured
responses succeeded, so both standings gates now pass.

The distributed 2,500-user gate was attempted on 2026-07-20. AWS initially
rejected `eu-west-3` with `PendingVerification`; an authorized `us-east-1`
retry then produced five healthy runners with five distinct public egress IPs.
The retry stopped before session provisioning because 2 of 2,500 temporary
Auth-admin user-creation requests failed from the client perspective. The exact
workload, soak, and resource telemetry therefore remain unpassed. Cleanup
restored the synthetic capacity gameweek and a global audit verified zero
temporary users, sessions, refresh tokens, Supabase keys, EC2 runners, security
groups, key pairs, key material, or runtime credential files. See
`FANTASY_CAPACITY_REPORT.md`.

The 2026-07-21 rerun used five same-region `eu-west-3` runners with five unique
egress IPs. Exactly 2,500 unique Auth users and 2,500 authenticated session
subjects were provisioned, but one runner exited during unmeasured team
preparation before the shared workload start. No merge-gate or soak request was
measured. The attempt is a setup failure, not a backend capacity result.
Remote session revocation succeeded. The monolithic cleanup then hit the
staging statement timeout and rolled back; bounded recovery deleted 37,500
memberships, 2,500 teams, and 2,500 users. Final exact-zero checks passed for
users, sessions, refresh tokens, profiles, teams, memberships, Metrics keys,
AWS runners/security groups/key pairs, key material, and runtime credentials.
The harness now has bounded setup retries, sanitized runner diagnostics,
cross-runner session-material fingerprint validation, and batched cleanup.

## Risks

- Ruleset v1.0 is approved and encoded, but no production season may be
  activated before PR review.
- `eu-west-3` runner launch is now available, but the same-region attempt
  stopped during unmeasured runner preparation. PR #6 remains draft.
- Metrics API CPU and pool gates must still be captured concurrently with the
  exact workload in a reviewed rerun of the hardened harness.
- Staging Auth leaked-password protection remains an environment warning.
- No production workers, cron, schema, data, or environment were modified.

## Rollback

Stop manual workers, keep all schedules disabled, revert the application mode
and repository wiring, and leave additive schema dormant. Disposable staging
may replay the last approved migration set. Populated environments require an
additive forward fix. Legacy and production remain untouched.

## Phase 7 recommendation

Proceed only after this PR and every remaining Phase 6 capacity gate receives
review. Phase 7
should be **Operations, Admin Authorization, and Production Readiness**:
introduce scoped staff roles, correction/season-control APIs, operational
dashboards/contracts, load and disaster-recovery exercises, explicit staging-
to-production migration promotion, and reviewed worker scheduling. Do not add
payments or analytics product features to that phase.
