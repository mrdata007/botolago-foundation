# Scale and cost report

2026-09-26. The question: what does BotolaGO need to serve a Fantasy deadline
rush and match-day browsing, and what does it cost each month? The answer
tries to make the app cheaper to run before recommending bigger machines.
Production V2 and Legacy were not changed; the only production access was one
read-only query of its settings.

Every number is marked as one of:

- **measured**: a run whose evidence is named;
- **projected**: computed from measured numbers, with the calculation shown.

A projection is not a pass. Only an approved staging run turns it into one.

## 1. What failed, and why

**Measured: staging full gate on Large compute, run 36233241466.**

- The run failed: 87% of the deadline-minute requests and 99% of the 10-minute
  soak requests got no answer within the 16-second client timeout.
- Integrity passed and there were 0 deadlocks.
- Postgres was not the limit.
  - Its queries took milliseconds.
  - Its connections sat idle: the observer saw 1 to 7 active out of 54.
  - `pg_stat_statements` puts all the test's queries at about 170 s of CPU. The
    2-core machine had about 1,700 s of CPU during the window, so the queries
    used about 10% of it.
- The machine's CPU was at 90% "user" while up to 10,238 requests waited inside
  PostgREST (the API layer on the same machine) with 49 of its 50 database
  connections free.
- It answered about 83 requests a second, which is about 23 ms of machine CPU
  per request.

**Measured: the JWT cache on staging is the default, 1,000 entries.**

- The run's own PostgREST metrics show it: requests − hits − evictions stays
  at 1,000 for the whole test.
- The authenticator role carries no `pgrst.jwt_cache_max_entries` override.
- With 2,500 active managers, 64% of requests missed the cache.

**Measured locally: what a cache miss costs.** The local stack runs the same
PostgREST 14 image (v14.14; staging runs 14.5), with ES256 signing keys like
staging and production, 2,500 signed-in users, and the gate's operation mix.
CPU was read from each container's cgroup, and PostgREST's own
`Server-Timing` header reported the token-check time.

| Setting                         | Throughput (4 cores) | PostgREST CPU/op | Postgres CPU/op | p50 / p95          |
| ------------------------------- | -------------------- | ---------------- | --------------- | ------------------ |
| JWT cache 1,000 (today), 2 runs | 157-160 ops/s        | 13.8-14.2 ms     | 3.4-4.1 ms      | 196 / 307-358 ms   |
| JWT cache 5,000, 2 runs         | 499-544 ops/s        | 2.1-2.3 ms       | 3.1-3.3 ms      | 47-52 / 139-151 ms |
| JWT cache off                   | 128 ops/s            | 16.0 ms          | 3.6 ms          | 219 / 471 ms       |

- Verifying one ES256 token takes about **14 ms**. The same check with an
  HS256 (shared-secret) token takes 0.1 ms.
- A request sent with only the publishable key (anonymous) costs about 1 ms
  in PostgREST, because its one token is always cached.
- **The limit is token verification in the API layer, on cache misses.** It is
  not the database, locks, or the connection pool.

Two notes on the cache runs:

- In the 5,000 rows every token was already cached, because the 2,500
  set-up reads come first. In real use each token misses once per refresh
  (hourly), which is negligible.
- Two further runs at "5,000" and "off" that went through the database-side
  setting are left out of the table. PostgREST ignored that setting (see
  below), so they measured the default.

**Why this cannot be fixed from our side today.**

- Setting `pgrst.jwt_cache_max_entries` on the authenticator role has no
  effect in PostgREST 14. This was measured locally: the cache stays at 1,000
  after a restart.
- It is an upstream bug, fixed on 2026-09-23
  ([PostgREST #5269](https://github.com/PostgREST/postgrest/pull/5269), with a
  v16 backport [#5278](https://github.com/PostgREST/postgrest/pull/5278)).
- Only the start-up setting `PGRST_JWT_CACHE_MAX_ENTRIES` works, and on hosted
  Supabase that belongs to Supabase. See proposal P1.

## 2. What the web app was adding

From a code audit of `src/`, now fixed on branch
`claude/app-readiness-scale-5fsu3l` and not yet deployed:

| Action                | Requests before                                   | After                                   |
| --------------------- | ------------------------------------------------- | --------------------------------------- |
| Save lineup           | 4 (3 of them full `fantasy_hub` reads)            | 1                                       |
| Transfer confirm      | 4, plus 2 per preview                             | 1, previews debounced and never re-sent |
| Chip                  | 4                                                 | 2                                       |
| Return to the tab     | every stale query + profile read + avatar signing | 0                                       |
| `fantasy_hub` polling | every 60 s per tab                                | every 5 min, shared                     |
| Player page           | the whole pool (up to 21 requests)                | read once, shared, 5 min                |

- Real users sent about 4 requests per Fantasy action, while the load test
  models 1. The test therefore understated today's app by about 4 times.
- The database still decides MFA, ownership, idempotency, version and
  deadline. The same arguments are sent.
- An idempotency key is now kept for one intent, so a save that timed out
  after it committed replays instead of conflicting.
- Tests: `bun run typecheck` passes; `bun test src` shows 2,962 pass and 0
  fail.

## 3. Match-day browsing

Shared data (news, fixtures, scores, catalogue, rankings) is read from the
browser straight from Supabase, `POST`, and with the person's token once they
are signed in. None of it can be cached today. A live match page re-reads 7
RPCs every 30 s per viewer. The design that moves this to cached public
endpoints is `docs/backend/PUBLIC_CACHED_ENDPOINTS.md`. The new browsing
workload (`scripts/backend/browsing-load-test.py`, workflow scope
`browsing`) measures it without touching the deadline gate.

**Measured locally.** The setup:

- the same stack;
- the Fantasy seed plus `browsing-staging-seed.sql`, which loads 240 fixtures
  (8 in play), 2,000 stories in French and Arabic, and match events,
  statistics and lineups;
- 300 anonymous visitors for 120 s after a 60 s ramp;
- CPU per container from cgroups, and database time per RPC from
  `pg_stat_statements`.

| Run                              | Requests/s | Postgres CPU/request | PostgREST CPU/request | Read p50 / p95 / p99 | Page view p95 | Errors |
| -------------------------------- | ---------- | -------------------- | --------------------- | -------------------- | ------------- | ------ |
| Before (today's functions)       | 78.4       | 21.9 ms              | 0.8 ms                | 9.5 / 98.6 / 570 ms  | 753 ms        | 0      |
| After the club-filters fix below | 78.5       | 12.0 ms              | 0.8 ms                | 8.3 / 46.6 / 247 ms  | 451 ms        | 0      |

One visitor makes about **0.26 requests a second** today, because of the
30-second live polling and the multi-request pages.

Browsing is database-heavy, unlike the deadline rush. Where the database time
went, before and after the fix:

| RPC                                        | Before           | After             |
| ------------------------------------------ | ---------------- | ----------------- |
| `news_team_filters`                        | 657 ms/call, 45% | 6-11 ms/call, <1% |
| `fantasy_player_season_stats`              | 286 ms/call, 22% | 253 ms/call, 40%  |
| `football_competition_fixtures` (100 rows) | 118 ms, 11%      | 101 ms, 18%       |
| `news_feed`                                | 34 ms, 8%        | 28 ms, 13%        |
| everything else                            | 3-40 ms per call | same              |

**Fixed on this branch:**

- `news_team_filters` checked every story in the language to decide whether
  a club has one (a hash join). It now stops at each club's first public
  story. The answer is the same, pinned by a new pgTAP test.
- The change is migration `20260926130000_news_team_filters_first_public.sql`.
  It is not yet applied anywhere.

**Also fixed on this branch (owner accepted a 5-minute delay, 2026-09-26):**

- `fantasy_player_season_stats` counted ownership ("selected by") over every
  active squad slot, 750,000 rows with 50,000 teams, on every call.
- Migration `20260926140000_fantasy_ownership_snapshot.sql` recounts it every
  5 minutes into a snapshot, which the read uses while it is at most 10
  minutes old. Otherwise it counts live as before, so the answer is never
  wrong, only slower.
- Measured locally with 50,000 teams: 233-238 ms a call becomes 2-5 ms, and
  the answer is identical. The recount takes about 0.3 s every 5 minutes.
- Pinned by 10 new pgTAP checks. It is not yet applied anywhere.

**Projected on Supabase**, using the same 1.55 factor. An anonymous browsing
request costs about 13.3 ms locally after the fix, so about 21 ms on the
hosted machine.

- **2,000 simultaneous visitors, today's direct calls:** about 520
  requests/s × 21 ms ≈ 10.7 vCPU, which needs **4XL** to stay under 80%.
- **With the ownership snapshot:** about 13 ms per request, 6.9 vCPU. 2XL
  would run at about 86%, so still **4XL**.
- **With the public cached endpoints** (section 6, P3): what reaches the
  machine depends on how much distinct content there is per freshness window,
  not on how many people are watching.
  - 8 live matches in 2 languages, the feeds, the table and the catalogue
    make a few hundred cache keys refreshed every 20 s to 10 min.
  - That is a few requests a second at most, and browsing stops deciding the
    size.

These use synthetic content. Real staging content (larger archive, real
clubs) is the next measurement (P4).

## 4. Sizing

The deadline gate is unchanged:

- 600 actions a second for 10 s, then 250 a second;
- CPU and pool below 80%;
- read p95 at most 0.5 s, mutation p95 at most 1.5 s.

CPU is judged per 60-second scrape, so the first minute averages about 308
actions a second.

**Projection method.** Staging measured 23 ms of machine CPU per request at a
64% miss rate. The local stack at the same miss rate is about 15 ms. The
factor between them, about 1.55, covers the other services on the machine and
the different CPU, and it is applied to the local warm-cache cost:
5.9 ms × 1.55 ≈ **9 ms per action** when tokens are cached. Supabase compute
sizes: Large 2 vCPU, XL 4, 2XL 8, 4XL 16 (dedicated).

| Configuration                                               | Needed for 308/s at < 80% | Burst of 600/s  | Smallest size, **projected**                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today: 1,000-entry cache, ES256 (23 ms per action)          | 8.8 vCPU                  | needs 13.8 vCPU | **4XL**. 2XL would run at about 88%                                                                                                                          |
| Cache at least the number of active users (9 ms per action) | 3.5 vCPU                  | needs 5.4 vCPU  | **2XL** (8 vCPU, about 35% CPU). XL (4 vCPU) meets the CPU limit at about 70%, but queues during the 10-second burst and may miss the burst's latency limits |
| Large, any setting                                          | -                         | -               | fails: **measured**, run 36233241466                                                                                                                         |

- **Headroom:** no hosted run has passed yet, so there is no measured headroom
  on Supabase.
- **Locally, warm cache:** the API, database and gateway together used
  5.5 ms of CPU per action. At 540 actions a second that is about 3 of the 4
  cores (the load generator used the rest). The gate's 308 a second would
  need about 1.7 cores.
- **Browsing:** with the public endpoints in place, most of it no longer
  reaches the database machine, and sizing is decided by the deadline gate.
  Without them, 2,000 simultaneous visitors alone need about 4XL (section 3),
  on top of any deadline rush. That is why P3 comes before a bigger machine.

## 5. Monthly cost

Supabase list prices on 2026-09-26: Pro plan $25 a month per organisation
with a $10 compute credit; Micro ~$10, Small ~$15, Medium ~$60, Large ~$110,
XL ~$210, 2XL ~$410, 4XL ~$960; disk above 8 GB $0.125 per GB; egress above
250 GB $0.09 per GB; above 100,000 monthly active users $0.00325 each.
Legacy (`kxpaudvntwxpahyjtxbk`) is paused and costs no compute.

| Setup                                            | Pro | Production | Staging (Micro) | Credit | Supabase per month |
| ------------------------------------------------ | --- | ---------- | --------------- | ------ | ------------------ |
| Now (production Micro)                           | $25 | $10        | $10             | −$10   | **$35**            |
| Launch, today's configuration (4XL, projected)   | $25 | $960       | $10             | −$10   | **$985**           |
| Launch, JWT cache raised (2XL, projected)        | $25 | $410       | $10             | −$10   | **$435**           |
| Launch, JWT cache raised, if XL passes the burst | $25 | $210       | $10             | −$10   | **$235**           |

Not in this table:

- **Disk.** Production's database is 228 MB, well inside 8 GB. Staging's disk
  grew to about 12 GB on 2026-09-26, about $0.50 a month, and to 20 GB for
  testing, $1.50.
- **Egress.** It stays inside 250 GB while shared data is cached at the site's
  edge.
- **Load-test runs.** Staging at the tested size for about 2 hours (XL
  $0.58, 2XL $1.12) plus 5 × t3.small for at most 105 minutes (about $0.25).
  So about **$1 to $2 per run**.
- **Services outside Supabase**, whose plans are not in the repository and
  which the owner should fill in: Lovable hosting, SportsMonks, GNews, the
  domain, and Cloudflare if used beyond the free plan. Resend is on its free
  plan ($0).

## 6. Proposals (each needs the owner's approval)

Nothing below has been done.

**P1. Ask Supabase to raise the production and staging JWT cache** (no cost).

- Ask for `PGRST_JWT_CACHE_MAX_ENTRIES` of at least 10,000 on both projects,
  or an upgrade to a PostgREST release with the database-setting fix.
- This is what moves the projection from 4XL to 2XL or XL.
- It is a production configuration change made by Supabase.

**P2. Deploy the web app changes on this branch** (no cost; a production
release).

- The first effect is about 4 times fewer requests per Fantasy action from
  real users.

**P3. Build the public cached endpoints** (no new paid service).

- The design is `PUBLIC_CACHED_ENDPOINTS.md`.
- If Lovable's hosting does not cache Worker responses, one production
  change is needed: a Cloudflare cache rule on `botolago.com/api/public/*`.

**P4. Staging runs to measure instead of project** (about $1 to $2 each).

1. After P1, resize staging to **XL** and run the unchanged gate.
2. If it misses the burst limits, resize to **2XL** and run it again.
3. Then run the browsing workload at the same size, after loading
   `browsing-staging-seed.sql`.
4. Resize staging back to Micro.

**P5. Only if P1 is refused: HS256 tokens** (a security trade-off, a
production Auth change).

- Moving production back to a shared-secret JWT makes the token check about
  100 times cheaper even without the cache.
- Supabase recommends asymmetric keys, so this is a last resort.

**P7. A 5-minute ownership snapshot for `fantasy_player_season_stats`:**
approved on 2026-09-26 and built (migration 20260926140000, production script
`scripts/backend/apply-20260926140000-fantasy-ownership-snapshot.sql`). The
owner runs it outside the hour before a Fantasy deadline.

**P6. Production compute before launch.**

- Production is on **Micro** today: shared CPU and 60 connections. It must
  move up before a real deadline rush.
- The size comes from P4, not from these projections.
