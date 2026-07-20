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
penalties, cards, own goals, and bonus. Automatic substitutions enforce
goalkeeper separation, bench order, formation, vice-captain promotion, and
Bench Boost behavior. The documented 12-stage finalization plan is resumable,
versioned, and short-circuits finalized gameweeks.

## Leagues and rankings

Public/private leagues use cryptographically random invite material stored only
as SHA-256 digest plus a four-character display hint. Membership is unique by
team and user. Private reads require membership. Rankings use deterministic
ordering: applicable points descending, transfer hits ascending, internal team
UUID ascending. Missing ranks remain null rather than fabricated.

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

- clean V2 migration replay from zero: pass;
- pgTAP/RLS: 13 files, 240 assertions: pass;
- focused Fantasy/Notification unit tests: pass;
- generated database types: synchronized after Phase 6 migrations;
- typecheck: pass;
- build: pass;
- lint: pass with 11 pre-existing Fast Refresh warnings and no errors;
- migration policy validation: pass;
- committed-secret scan: pass.

All seven Phase 6 migrations were also applied to **BotolaGO Staging V2**.
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

## Risks

- Official Botola Fantasy scoring, price, sale-price, tie-break, chip-period,
  cancellation, and postponed/abandoned fixture rules require product approval
  before activating a real season.
- Representative deadline concurrency and large-league load tests still need a
  staging dataset; local deterministic correctness is not a substitute.
- Phase 6 is stacked on the unmerged Phase 5 draft and must be rebased after
  Phase 5 merges.
- No production workers, cron, schema, data, or environment were modified.

## Rollback

Stop manual workers, keep all schedules disabled, revert the application mode
and repository wiring, and leave additive schema dormant. Disposable staging
may replay the last approved migration set. Populated environments require an
additive forward fix. Legacy and production remain untouched.

## Phase 7 recommendation

Proceed only after this PR and official Fantasy rules receive review. Phase 7
should be **Operations, Admin Authorization, and Production Readiness**:
introduce scoped staff roles, correction/season-control APIs, operational
dashboards/contracts, load and disaster-recovery exercises, explicit staging-
to-production migration promotion, and reviewed worker scheduling. Do not add
payments or analytics product features to that phase.
