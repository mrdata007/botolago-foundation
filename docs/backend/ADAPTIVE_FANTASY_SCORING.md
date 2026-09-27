# Adaptive Fantasy Scoring v2.0

## Contracts

The forward migration publishes v2.0 without editing v1.0/v1.1 or changing any
season assignment automatically. A service-only effective gameweek assignment
applies to the unfinalized gameweek and subsequent gameweeks. Existing captain,
chip, transfer, formation and substitution arithmetic is retained.

Every fixture has one mode. At the first worker pass at/after final whistle +12h,
the latest validated observation at/before the cutoff determines full versus
simple. An overdue rollout fixture uses its first audit observation after the
assignment. Missing detailed statistics selects simple even if core facts remain
pending. Subsequent observations never change the selected mode.

Simple excludes assists, goalkeeper saves, penalty saves and penalty misses for
all players. Excluded categories are absent from the ledger/point breakdown, not
certified zero. Bonus and player-of-match remain disabled. All other point values
and the existing 60-minute defensive eligibility rules remain unchanged.

## Certification and corrections

`service_record_fantasy_observation` stores immutable, server-timestamped payloads
and source digests. Every statistic carries a state, source, observation time and
evidence references. The SportsMonks adapter inspects original detail rows before
legacy omission-to-zero normalization. There is no assumed sparse-zero contract.

Core certification requires reconciled goals/own goals, canonical identities,
dated memberships, complete discipline and participation. Up to four unidentified
starters are permitted; omitted players never prove nonparticipation. Explicit
`verifiedNonParticipants` are required before an omitted fantasy player can be
used for substitutions or captain promotion. Unknown lineup participation blocks
that lineup's result and gameweek finalization, but certified player categories
can be persisted provisionally.

`prepareAdaptiveCorrection` validates an operator-supplied document. It can derive
participation from a complete verified timeline, using regulation-minute offsets
only and at least one minute for a confirmed appearance. Same-minute goal/change
ambiguity is rejected. Derived participation cannot qualify for full mode. The
service RPC additionally validates identities, membership, starter counts, score
reconciliation and the previous observation digest. Corrections need a reviewer,
reason and evidence references. Replays are idempotent; stale corrections fail.

The service observation input refuses changes after sealing/finalization. Published
corrections still require the existing reviewed 72-hour correction process and a
new calculation version/audit record; this endpoint does not reopen published
weeks or change a locked mode. Retain all observations, seals and ledger history.

No Sofascore scraper or API-Football credential is required.

## Rollout gates

1. Merge a reviewed PR after Backend quality, generated types, pgTAP and UI gates.
2. Check active agents/workflows and cron writers under AGENTS.md. Only one writer
   may operate on a database. Pause football refresh and Fantasy automation before
   applying an approved migration batch. Record and restore their prior settings.
3. Apply the additive migration to staging first. Exercise full, simple, unknown
   participation, cutoff/retry and mixed double-gameweek paths using fixture
   snapshots, then validate the FR/AR points/rules/history surfaces.
4. Promote the exact reviewed migration through the production migration path or
   an owner-run guarded script; deploy the matching worker/UI contracts.
5. Take `service_adaptive_scoring_audit(gameweek)` and review its activation digest.
   Assign the scope with `service_activate_adaptive_scoring(season, fromGameweek,
expectedDigest, true)` (paused). Never reuse a stale activation digest.
6. Run the first ingestion/audit for **every** finished counted fixture, including
   19874707 and 19874708. Keep the first audit snapshots as the overdue selection
   snapshots. Repair identities/events only with referenced reviewed evidence.
7. Run the read-only comparison using `compareAdaptiveFixtures`. Review missing
   facts and per-player deltas. A null delta means it cannot be certified; it is
   not zero. Check lineup/captain/chip effects before enabling scoring.
8. Unpause only after staging verification and production comparison. The worker
   recalculates the entire unfinalized gameweek under the effective assignment.
   Every counted fixture must meet its locked mode before finalization.
9. If rollback is needed, call `service_pause_adaptive_scoring(season,true)` and
   pause worker dispatch. Do not restore old scoring over published results.

Production writes require the repository's reviewed path; this migration file
alone does not authorize bypassing that path. No production write was made while
preparing this change.

## Operations

`fantasy_fixture_coverage` uses the selected mode's readiness. A certified simple
fixture is successful. Unresolved core facts still fail coverage. Health output
adds `adaptiveScoring` counts and fallback reasons independently of provider
outage reporting. The public points and history contracts expose per-fixture mode,
pending state, cutoff and excluded categories. Double gameweeks keep separate
fixture entries.
