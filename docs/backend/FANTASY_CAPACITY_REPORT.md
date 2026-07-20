# Phase 6 Fantasy Capacity Report

## Scope and environment

Validation ran on **BotolaGO Staging V2**
(`srdrflfrfpwixsllveid`) on 2026-07-20. Production V2 and Legacy were not
queried or modified. No Fantasy cron extension, schedule, or production worker
was enabled.

The deterministic seed produced:

| Record                   |   Count |
| ------------------------ | ------: |
| Fantasy teams            |  50,000 |
| Active squad memberships | 750,000 |
| Current lineups          |  50,000 |
| Lineup players           | 750,000 |
| Final historical results |  50,000 |
| Provisional results      |  50,000 |
| Large-league members     |  10,000 |
| Additional mixed leagues |   1,000 |

The seed is guarded by `botolago.capacity_environment=staging-v2`, contains no
password, is idempotent, and refuses an environment containing non-load
Fantasy teams.

## Deadline HTTP workload

The approved 2,500-user workload did **not** run. Supabase Auth returned HTTP
429 while preparing 2,500 independent password sessions, before the measured
600 RPS/250 RPS workload began. Shared identities, fabricated JWTs, and a
staging authentication backdoor were rejected as invalid test substitutions.

Temporary passwords and all generated sessions/refresh tokens were revoked
immediately. Verification returned zero enabled load passwords and zero
remaining sessions.

This remains an external staging-capacity gate:

- request a reviewed Auth rate-limit window or a Supabase load-test environment;
- mint 2,500 legitimate sessions before the measurement window;
- rerun `scripts/backend/fantasy-load-test.py` unchanged;
- capture API/DB CPU and connection-pool saturation during the minute.

## Finalization and ranking

The committed partial-run/resume exercise passed:

| Operation                                                      | Staging duration |
| -------------------------------------------------------------- | ---------------: |
| Finalize 50,000 team results, restore Free Hit, roll transfers |    31,919.513 ms |
| Overall ranking, 50,000 teams                                  |     6,903.605 ms |
| League ranking, 10,000 members                                 |     1,840.286 ms |

Invariants:

- 50,000 final gameweek results;
- 100 of 100 Free Hit snapshots restored;
- 50,000 once-only free-transfer rollovers;
- zero duplicate results;
- zero duplicate rollover ledgers;
- zero unrestored Free Hit snapshots;
- repeated gameweek completion returned the stable finalized result.

## Read paths and plans

Representative `EXPLAIN (ANALYZE, BUFFERS)` evidence:

| Path                                  | Execution | Access path                                         |
| ------------------------------------- | --------: | --------------------------------------------------- |
| Current team                          |  0.085 ms | `fantasy_teams_user_season_key`                     |
| Current 15-player squad               |  0.462 ms | `fantasy_squad_memberships_active_team_idx`         |
| Player pool, 51 rows                  |  0.280 ms | sequential scan of the 72-row deterministic catalog |
| Team gameweek result                  |  0.084 ms | `fantasy_team_gameweek_results_history_idx`         |
| Transfer-preview ownership path       |  0.869 ms | team PK + active-membership index                   |
| 10k league, first 100 after hardening |  0.449 ms | index-only scan, zero heap fetches                  |
| 10k league, page after rank 5001      |  3.854 ms | covering league keyset index                        |

The additive hardening migrations removed all five Fantasy v1 unindexed-foreign
key advisor findings and added covering overall/gameweek standings indexes.

## HTTP standings benchmark

The public RPC benchmark uses 200 measured requests per page at concurrency 25
after a separate 200-request warm-up. All 400 measured responses returned 200.

| Page            |       p50 |         p95 |         p99 | Gate                     |
| --------------- | --------: | ----------: | ----------: | ------------------------ |
| First 100       | 647.91 ms | 1,266.48 ms | 1,692.56 ms | **fail** (target 750 ms) |
| After rank 5001 | 404.33 ms |   701.96 ms |   924.82 ms | pass (target 1,000 ms)   |

Direct SQL is sub-millisecond for the first page after hardening, so remaining
latency is at the Staging Data API/pool/network tier under the 25-way sample.
The cold first sample was worse (p95 2,053.80 ms) and remains an explicit
operational risk.

## Database health and advisors

- observed during failed session preparation: 16 of 60 database connections;
- post-run sample: 6 of 60 connections;
- deadlocks: 0;
- database conflicts: 0;
- unindexed foreign keys after hardening: 0;
- security advisor: deny-by-default RLS-without-policy informational findings,
  plus leaked-password protection disabled for Staging Auth;
- performance advisor: fresh-dataset unused-index informational findings;
- database CPU was not available through the connected management surface and
  is therefore **not passed by inference**.

Staging PostgREST initially exposed only `public, graphql_public`, contrary to
the checked-in `schemas = ["api"]` configuration. Staging was aligned to
`pgrst.db_schemas=api` and reloaded; this operational configuration must be
verified during every environment promotion.

## Verdict

Database correctness, finalization, rankings, read plans, and later-page
standings pass. The 2,500-user authenticated workload, first-page HTTP p95, and
CPU observation gates remain incomplete or failed. PR #6 must remain draft.
