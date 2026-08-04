# Release activation migration promotion

## Purpose

This runbook promotes the exact post-Gate-4 additive database changes required
before the current Football/News/Fantasy release activation can continue. It
does not populate a Fantasy catalog, activate a publisher, deploy a function,
or enable a worker or schedule.

The protected read-only Production V2 preflight run `30888666932` established
the baseline on 2026-08-04:

- target `tkewgajrljbwgwedqsxn`, `BotolaGO Production V2`, `eu-west-3`;
- project status `ACTIVE_HEALTHY` with seven completed daily backups;
- 44 canonical migration-history rows through
  `20260802090000_football_season_browser`;
- only `football-ingest` and `news-ingest` deployed, both active with JWT
  verification;
- zero database cron jobs;
- only the `api` schema exposed through PostgREST.

## Exact batch

The `release_activation` batch contains only:

1. `20260803173344_fantasy_preactivation_hardening.sql`;
2. `20260803210943_fantasy_catalog_activation.sql`;
3. `20260803212218_elbotola_metadata_ingestion.sql`.

The promoter verifies the complete 47-file repository chain and every recorded
remote statement checksum before writing. Any additional repository migration,
missing or unexpected remote history row, checksum change, target mismatch,
unhealthy project, absent backup, active database schedule, unexpected Edge
Function, or disabled JWT verification stops before the first migration.

Each migration is applied and history-recorded in its own transaction with
bounded lock and statement timeouts. After every transaction the full remote
history is re-read and revalidated.

## Dispatch

Run `Phase 7E-B Production V2 migration promotion` manually from `main` with:

- `expected_commit`: the exact reviewed current `main` SHA;
- `migration_batch`: `release_activation`;
- `confirmation`: `RUN_PHASE7E_B_PRODUCTION_RELEASE_ACTIVATION`.

Do not rerun a failed workflow attempt. Diagnose its sanitized artifact, fix
forward through a new reviewed commit, and use a fresh manual dispatch.

## Required postflight

The batch passes only when:

- migration history contains exactly 47 canonical rows;
- the six service-controlled catalog/ElBotola routines exist;
- `PUBLIC`, `anon`, and `authenticated` have no execute grant on those service
  routines;
- the ElBotola publisher remains inactive and `review_required`;
- catalog, registration, and initial-price evidence ledgers remain empty;
- the two reviewed Edge Functions remain active with JWT verification;
- database cron count remains zero; and
- Auth and Management API health checks still pass.

After a pass, stop. ElBotola publisher activation, current-season Football
ingestion, Fantasy catalog staging/opening, workers, schedules, and NewsData.io
remain separate reviewed operations.
