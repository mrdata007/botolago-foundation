# Phase 6 Fantasy Capacity Report

## Scope and environment

Validation ran on **BotolaGO Staging V2**
(`srdrflfrfpwixsllveid`, Pro plan, `eu-west-3`) through 2026-07-21. Production V2
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

### 2026-07-21 same-region rerun

AWS account verification permitted the requested same-region path. The rerun
used five `eu-west-3` runners and verified five distinct public egress IPs. It
created exactly 2,500 deterministic temporary users with 2,500 unique Auth
user IDs and seeded 2,500 valid isolated Fantasy teams. The published harness
did not persist an ambiguous-response counter for this attempt, so the exact
reconciliation count is unavailable; the hardened follow-up records admin
requests, ambiguous responses, exact-email reconciliations, and safe retries.

All five provisioners returned 500 authenticated subjects and the coordinator
accepted exactly 2,500 sessions with at least 20 minutes remaining. The
published harness proved unique subjects per shard but did not aggregate JWT
session IDs or refresh-token uniqueness across shards. The follow-up harness
now verifies 2,500 unique assigned subjects, JWT session IDs, access-token
fingerprints, and refresh-token fingerprints without returning raw session
material.

The measured workload did **not** start. During unmeasured team preparation,
one runner exited before the synchronized start and the coordinator returned a
`CalledProcessError`; runner stderr had not been retained. Therefore achieved
RPS, latency percentiles, expected/unexpected workload errors, integrity
results, and CPU/pool/lock/timeout thresholds are all **not measured**, not
failed. This is a setup failure and cannot be treated as capacity evidence.

Two concrete harness defects were verified and corrected after the stopped
attempt:

- unmeasured setup reads now have bounded retries, a 75-second synchronization
  lead, and sanitized per-runner stderr evidence;
- cleanup now removes high-volume memberships, teams, and users in bounded,
  independently committed batches.

Remote logout succeeded for all runner caches. The original monolithic
database cleanup exceeded staging's statement timeout and rolled back, leaving
2,500 users, 2,500 teams, and 37,500 squad memberships. Recovery then removed
the exact temporary namespace in bounded batches. Final verification returned
users/sessions/refresh tokens/profiles/teams/memberships = `0/0/0/0/0/0`.
The Metrics key, active runners, security group, EC2 key pair, key material,
and runtime credential handoff also each returned zero. Production V2 and
Legacy were not selected or modified.

The load runner now fails closed unless the cache has exactly 2,500 unique
`authenticated` UUID subjects, contiguous user numbers, enough remaining token
validity for the workload plus a five-minute safety window, and owner-only file
permissions. The complete gate-plus-soak sequence is provisioned with at least
20 minutes of remaining token lifetime. Authentication and team preparation
remain outside the measured clock; no credential is included in results. The
merge gate and telemetry soak use distinct owner-only result artifacts.

### 2026-07-21 hardened setup-only rehearsal

The requested final validation was started from hardened harness base commit
`f6340e0eed667f730ceddc1f4dd5d89dc9085003`. The harness gained an explicit
setup-only mode for five 25-user shards, sanitized stdout/stderr retention for
every runner, coordinator readiness records, zero-request enforcement, and
independently committed bounded deletion for every load-owned table. The full
gate remains hard-locked to 2,500 users and the approved 600/250 RPS profile.

The rehearsal stopped at its first read-only AWS preflight. `GetCallerIdentity`
returned `InvalidClientTokenId`, so the supplied AWS access-key, secret-key,
and optional session-token combination was not valid. No runner was launched,
no Supabase Metrics key or temporary user was created, no session or Fantasy
state was prepared, the Metrics collector did not start, and measured requests
were exactly zero. Consequently there are zero runner-ready records rather
than five, and the full workload and soak were correctly not attempted.

The coordinator had no tracked database users and reported users/sessions/
active refresh tokens as `0/0/0`. No cloud-state file, runtime credential
handoff, EC2 key material, session cache, or raw credential remains locally.
The two retained failure artifacts are mode `0600` and a targeted scan found
no raw Supabase key, AWS access-key ID, bearer token, or JWT. External cleanup
enumeration could not authenticate with the invalid AWS credentials, so this
attempt is a **setup failure**, not a successful exact-zero rehearsal or a
capacity result. The execution order proves that no mutation method was
reached before the STS failure.

Post-failure repository validation passed 316 application tests, TypeScript
typecheck, production build, migration-file validation, and the tracked-file
secret scan. ESLint completed with zero errors and the existing 11 Fast
Refresh warnings. A fresh local Docker migration replay was started but no
Supabase container became available and the silent reset was bounded and
stopped; pgTAP/RLS, database lint, and generated-type drift were therefore not
rerun locally for this attempt. GitHub Backend quality run #38 subsequently
passed both `application-quality` and `database-quality`, including clean
replay, pgTAP/RLS, database lint, and generated-type drift.

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
  per-interval query telemetry remain unmeasured because the same-region rerun
  stopped during unmeasured team preparation. The temporary Staging Secret API
  key and distributed AWS runners were successfully created and deleted;
  credential, same-region runner, user, and session provisioning are no longer
  the immediate blockers. The telemetry gate is **not passed by inference**.

Staging PostgREST initially exposed only `public, graphql_public`, contrary to
the checked-in `schemas = ["api"]` configuration. Staging was aligned to
`pgrst.db_schemas=api` and reloaded; this operational configuration must be
verified during every environment promotion.

## Delegated execution workflow

The replacement capacity path is implemented as the protected, manual
`Phase 6 delegated capacity gate` GitHub Actions workflow. It uses GitHub OIDC
to assume the staging load-test role, requires an STS assumed-role session,
and has no long-lived AWS secret inputs. The Supabase Management token is read
only from the protected `staging-load-test` environment; each temporary
`sb_secret` Metrics key remains in process memory and is deleted by both normal
and independent recovery cleanup.

The workflow binds execution to the exact reviewed PR #6 head, runs the
five-runner 25-user-per-runner rehearsal first, and proceeds to the unchanged
2,500-user gate and soak only after the rehearsal and its exact-zero cleanup
pass. A separate `if: always()` invocation rediscovers namespaced test users,
Fantasy records, Metrics keys, and tagged AWS resources after interruption.
Only evidence that passes the credential-pattern scan is uploaded or written
to PR #6. A passing run marks PR #6 ready for review; any failure keeps or
returns it to draft. The workflow cannot merge the PR or enable a worker.

This workflow has not yet produced measured evidence. GitHub requires a manual
workflow definition to exist on the default branch before dispatch, so the
workflow-only bootstrap must be reviewed and landed on `main` first. The
capacity verdict remains blocked until that protected run passes; none of the
thresholds above are inferred from this implementation change.

## Verdict

Database correctness, finalization, rankings, read plans, and both standings
latency gates pass. The exact 2,500-user workload and concurrent resource gate
remain open. The hardened setup-only rehearsal stopped at AWS identity
validation with `InvalidClientTokenId`, before runners or any measured traffic.
PR #6 must remain draft. No capacity threshold is passed by inference. A
reviewed protected OIDC run in `eu-west-3` is required before the PR can become
merge-ready. GitHub quality gates pass at the latest reported head, but they do
not substitute for the failed external rehearsal.
