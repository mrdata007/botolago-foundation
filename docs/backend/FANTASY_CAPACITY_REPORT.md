# Phase 6 Fantasy Capacity Report

## Scope and environment

Validation ran on **BotolaGO Staging V2**
(`srdrflfrfpwixsllveid`, Pro plan, `eu-west-3`) on 2026-07-20. Production V2
and Legacy were not queried or modified. No Fantasy cron extension, schedule,
or production worker was enabled.

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
429 while preparing 2,500 independent password sessions from one source IP,
before the measured 600 RPS/250 RPS workload began. [Supabase documents the
`/auth/v1/token` bucket](https://supabase.com/docs/guides/auth/rate-limits) as
IP-limited and non-customizable. Shared identities,
fabricated JWTs, `service_role`, and a staging authentication backdoor were
rejected as invalid test substitutions.

Temporary passwords and all generated sessions/refresh tokens were revoked
immediately. Verification returned zero enabled load passwords and zero
remaining sessions.

The staging project contains 50,000 synthetic Auth identities but now has zero
enabled load passwords, zero load sessions, and zero non-revoked load refresh
tokens. This remains an external staging-capacity gate:

- obtain a reviewed Auth load-test window or a distributed, approved session
  provisioner; the current runner must not burst Auth from one IP;
- mint 2,500 legitimate, unique, sufficiently unexpired sessions before the
  measurement window and write them to an owner-only cache outside the repo;
- create a temporary Staging Secret API key for the Metrics API;
- run the unchanged 2,500-user/60-second/600-to-250 RPS profile while collecting
  documented 60-second Metrics API samples;
- immediately run a separate ten-minute, 250 RPS telemetry soak with the same
  2,500 users and operation mix; soak results supplement but never replace the
  exact 60-second latency gate;
- revoke sessions/passwords, delete the Secret API key, and remove local
  credential artifacts immediately.

The load runner now fails closed unless the cache has exactly 2,500 unique
`authenticated` UUID subjects, contiguous user numbers, enough remaining token
validity for the workload plus a five-minute safety window, and owner-only file
permissions. The complete gate-plus-soak sequence is provisioned with at least
20 minutes of remaining token lifetime. Authentication and team preparation
remain outside the measured clock; no credential is included in results. The
merge gate and telemetry soak use distinct owner-only result artifacts.

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

Representative `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)` evidence:

| Path                                 |    Execution | Access path                                         |
| ------------------------------------ | -----------: | --------------------------------------------------- |
| Current team                         |     0.085 ms | `fantasy_teams_user_season_key`                     |
| Current 15-player squad              |     0.462 ms | `fantasy_squad_memberships_active_team_idx`         |
| Player pool, 51 rows                 |     0.280 ms | sequential scan of the 72-row deterministic catalog |
| Team gameweek result                 |     0.084 ms | `fantasy_team_gameweek_results_history_idx`         |
| Transfer-preview ownership path      |     0.869 ms | team PK + active-membership index                   |
| 10k league, old first-page RPC       | 1,053.044 ms | 41,526 buffers; joined/sorted all 10k teams         |
| 10k league, optimized first-page RPC |    16.573 ms | 1,668 buffers including function compilation        |
| 10k league, optimized later-page RPC |    13.256 ms | 1,692 buffers including function compilation        |
| Explicit optimized first-page body   |     4.605 ms | 404 buffers; 100-row index-only page before join    |
| Explicit optimized later-page body   |     4.753 ms | 404 buffers; composite keyset index condition       |

The additive hardening migrations removed all five Fantasy v1 unindexed-foreign
key advisor findings and added covering overall/gameweek standings indexes.
`20260720191839_fantasy_standings_rpc_pagination.sql` then split overall versus
gameweek access paths, materialized the bounded ranking page, and joined team
names only after `LIMIT`. It preserves the existing DTO, privacy check, keyset
cursor, grants, and 100-row maximum.

## HTTP standings benchmark

The public RPC benchmark uses 200 measured requests per page at concurrency 25
after a separate 200-request warm-up. Three independent post-migration runs
returned 1,200 of 1,200 HTTP 200 responses.

| Run | First-page p95 | Later-page p95 | First gate | Later gate |
| --: | -------------: | -------------: | :--------- | :--------- |
|   1 |      254.29 ms |      204.12 ms | pass       | pass       |
|   2 |      195.78 ms |      210.82 ms | pass       | pass       |
|   3 |      224.24 ms |      198.73 ms | pass       | pass       |

The original first-page RPC took 1,053.044 ms inside PostgreSQL before network
or PostgREST overhead, matching the 1,266.48 ms HTTP p95. The optimized RPC is
13–17 ms at the database boundary and 196–254 ms HTTP p95. This demonstrates
that the former bottleneck was join/sort order inside the RPC, not an OFFSET,
count query, RLS user-rank join, or network-only delay. The first-page target of
750 ms is now passed with substantial margin.

## Database health and advisors

- latest non-workload baseline: 15 connections, 1 active, 0 waiting locks;
- longest open transaction in that baseline: 0 seconds;
- deadlocks: 0; database conflicts: 0; cache-hit ratio: 99.884%;
- unindexed foreign keys after hardening: 0;
- security advisor: deny-by-default RLS-without-policy informational findings,
  plus leaked-password protection disabled for Staging Auth;
- performance advisor: fresh-dataset unused-index informational findings;
- Metrics API CPU, memory, IO, Supavisor pool/client utilization, lock timeout,
  and per-interval query telemetry cannot be collected without a Staging
  [Secret API key](https://supabase.com/docs/guides/telemetry/metrics). No such
  credential is available in the repository or
  connected management surface, so the workload telemetry gate is **not passed
  by inference**. `scripts/backend/supabase-metrics-collector.py` is ready to
  capture 60-second Prometheus samples across the exact run and the separate
  ten-minute soak once a temporary key is approved.

Staging PostgREST initially exposed only `public, graphql_public`, contrary to
the checked-in `schemas = ["api"]` configuration. Staging was aligned to
`pgrst.db_schemas=api` and reloaded; this operational configuration must be
verified during every environment promotion.

## Verdict

Database correctness, finalization, rankings, read plans, and both standings
latency gates pass. The 2,500-user authenticated workload and concurrent
Metrics API/Supavisor resource-observation gate remain externally blocked. PR
#6 must remain draft; it is not merge-ready until those two gates pass against
the unchanged workload profile and their cleanup checks return zero.
