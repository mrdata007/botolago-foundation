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

The approved 2,500-user workload still did **not** run. A distributed harness
was added for five temporary AWS runners, 500 users per runner, distinct public
IPv4 egress, gradual authentication at most 0.4 requests/second per runner,
and synchronized workload shards. It preserves the exact global 60/30/5/5
traffic mix and 600-to-250 RPS schedule.

The 2026-07-20 external run passed Staging V2 and synthetic-data preflight. It
created a temporary Supabase Secret API key in process memory and temporarily
reopened only the known synthetic capacity gameweek. Supabase API-key names do
not permit hyphens, so the requested `phase6-fantasy-metrics` name used the
platform-compliant `phase6_fantasy_metrics` equivalent.

AWS first rejected `RunInstances` in `eu-west-3` with `PendingVerification`.
An explicitly authorized retry in the account's available `us-east-1` region
successfully provisioned five healthy runners with five distinct public egress
IPs. This cross-region runner placement is temporary; a passing latency result
would be conservative, while a latency failure would require a same-region
rerun before attributing it to the backend.

The retry stopped before authentication and measurement because 2 of 2,500
temporary Auth-admin user-creation requests returned client-observed failures.
The latest Auth log window contained no HTTP failures, so no server status can
be asserted for those two requests. The remaining 2,498 tracked users were
removed, and a global prefix-based database audit confirmed zero residual
temporary users, sessions, or active refresh tokens. Under the gate's fail
rule, the harness did not retry the run or start the measured workload.

The fail-closed cleanup restored the synthetic gameweek and verified:

- temporary test users, sessions, and active refresh tokens: 0 / 0 / 0;
- temporary Supabase Metrics API keys: 0;
- active Phase 6 runners, security groups, and EC2 key pairs: 0 / 0 / 0;
- local EC2 key material and runtime credential handoff files: 0 / 0;
- cleanup errors: 0.

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
- Metrics API CPU, memory, IO, pool/client utilization, lock timeout, and
  per-interval query telemetry remain unmeasured because temporary user
  creation stopped the run before session provisioning. The temporary Staging
  Secret API key and distributed AWS runners were successfully created and
  deleted; credential and runner availability are no longer the immediate
  blockers. The telemetry gate is **not passed by inference**.

Staging PostgREST initially exposed only `public, graphql_public`, contrary to
the checked-in `schemas = ["api"]` configuration. Staging was aligned to
`pgrst.db_schemas=api` and reloaded; this operational configuration must be
verified during every environment promotion.

## Verdict

Database correctness, finalization, rankings, read plans, and both standings
latency gates pass. The 2,500-user authenticated workload and concurrent
resource-observation gate remain open after the temporary Auth-user creation
failure. PR #6 must remain draft. The setup path now uses a lower five-request-
per-second admin rate plus lookup-before-retry for ambiguous create responses.
Run the unchanged gate in a new reviewed attempt; cleanup must again return zero
before the PR can become merge-ready. A same-region latency run remains the
target before final capacity sign-off.
