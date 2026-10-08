# 500-concurrent-user capacity test — resources and cost

Owner-run on **Staging V2** (`srdrflfrfpwixsllveid`), never on production.
Nothing here has been run.

## The kit that exists

| Part                                                                                                                                                                             | Where                                                                                                                                                 | Status                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fantasy deadline test: 2,500 temporary accounts on 5 AWS `t3.small` machines (eu-west-3); 600 actions/s for 10 s, then 250/s for 50 s, then a 10-minute soak; exact-zero cleanup | `.github/workflows/fantasy-load-test.yml`, `scripts/backend/fantasy-capacity-orchestrator.py`, `fantasy-load-test.py`, `docs/operations/LOAD_TEST.md` | On `main`. **Never completed a measurement.** July's finished run (smaller server) began failing at ~65 actions/s; later 2,500-user runs failed during setup. |
| Match-day browsing test: Home, live match re-read every 30 s, news, fixtures, table and Fantasy rankings; 30 % signed in; visitor count configurable (default 2,000)             | `scripts/backend/browsing-load-test.py` and seed, **PR #240 only**                                                                                    | **Not merged** (open since 2026-09-26).                                                                                                                       |
| Staging preparation (plan / rehearse / apply / seed / seed-browsing / check)                                                                                                     | `staging-database-update.yml`, `scripts/backend/staging-database-update.py`                                                                           | On `main` (seed-browsing comes with #240). Staging was 45 migrations behind on 2026-09-25.                                                                    |
| One-writer guard                                                                                                                                                                 | `scripts/backend/staging-writer-guard.py`, workflow concurrency group `phase6-staging-load-test`                                                      | On `main`                                                                                                                                                     |

**How the kit maps onto "500 concurrent users":**

- The deadline test is fixed at 2,500 accounts. That is 5× the target and a harder case. Passing it covers 500 for Fantasy saves.
- The browsing test with `browsing_visitors = 500` is the direct match for "500 people reading public pages, match data, rankings, and signed-in reads at once".

A representative 500-user verdict needs **both** runs at the compute size
production will launch on.

## Thresholds (fixed before running)

From `LOAD_TEST.md`, plus the browsing read targets in the handoff (§11).

| Metric                                                             | Pass                                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Reads (pages, match data, rankings, Fantasy team, signed-in reads) | p95 ≤ 0.5 s, p99 ≤ 1.5 s                                                                                                             |
| Saves (lineup, transfer, chip)                                     | p95 ≤ 1.5 s, p99 ≤ 3 s                                                                                                               |
| Unexpected errors                                                  | < 0.5 % of requests; no timeouts over 10 s                                                                                           |
| Throughput                                                         | Deadline: sustains 250 actions/s for 10 min after the 600/s burst. Browsing: 500 visitors' closed loop with no rising latency trend. |
| Database                                                           | CPU < 80 %, connections < 80 % of the size's limit (Small 90, Medium 120, Large 160), no deadlocks, no lock waits over 1 s           |
| Connection pooling                                                 | Pooler clients under the size's limit (Small 400, Medium 600, Large 800); no "too many connections"                                  |
| Integrity                                                          | No double transfer, no lost update, no negative bank, every squad 15 players                                                         |

## Which size to test

- Production reads as **Micro** today: 60 connections, shared CPU, 1 GB.
- PITR needs at least **Small**, so Small is the cheapest size production can launch on.
- Plan: test **Small** first. If it fails a threshold, test **Medium**, then **Large**, and launch production on the first size that passes. Decide the PITR compute change at the same time, so production restarts once.

## Cost estimate (one size, both runs)

Supabase prices from the compute docs (2026-10-08). AWS from the kit's own
guard.

| Item                              | Detail                                                                                                                                                                                            | Cost                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Staging compute while testing     | about 4 h (resize, seeds, rehearsal, deadline run, browsing run, cleanup)                                                                                                                         | Small $0.0206/h ≈ **$0.10**; Medium $0.0822/h ≈ **$0.35**; Large $0.1517/h ≈ **$0.65** |
| Staging disk to 20 GB             | +12 GB × $0.125/GB-month; **cannot be shrunk afterwards**                                                                                                                                         | ≈ **$1.50 / month, permanent**                                                         |
| AWS runners                       | 5 × `t3.small` × ≤ 105 min (self-terminating) plus volumes and traffic. The kit refuses to start if its deliberately pessimistic estimate (5 × $1/h × 1.75 h + $10 = $18.75) exceeds the $50 cap. | Realistically **under $2**; the guard allows ≤ $18.75                                  |
| Staging back to its previous size | Same day                                                                                                                                                                                          | —                                                                                      |

**Per size tested: about $2–3 one-off, plus $1.50 a month for the disk.**
Testing all three sizes stays under $10 one-off. This assumes Staging V2 is in
a Pro organisation, as the capacity report records; its compute is billed per
hour on top of the plan.

## Steps in order

All in GitHub → Actions. Every one is a staging write, so run them one at a
time (the concurrency group enforces it).

1. **Free.** Staging database update → `plan` (read-only), then `rehearse` and `apply` (confirmation `UPDATE_STAGING_DATABASE`). This brings staging level with production's migrations.
2. **Paid, owner.** Staging V2 → Compute and Disk → the size under test; disk ≥ 20 GB.
3. **Free.** `seed` (50,000 fake teams), plus `seed-browsing` once #240 is merged or its branch is used.
4. **About $0.** Fantasy load test → scope `rehearsal`, `staging_compute` = the size.
5. **Paid.** Fantasy load test → scope `full`.
6. **Paid.** Browsing → `browsing_visitors = 500` (needs #240).
7. Read the verdicts and attach them to `.readiness-audit/`.
8. **Owner.** Staging back to its previous size (it was Micro on 2026-09-25).

**Prerequisites the owner must check first:**

- GitHub environment `staging-load-test` has a working `SUPABASE_ACCESS_TOKEN`.
- `AWS_LOAD_TEST_ROLE_ARN` and its AWS role still exist (`LOAD_TEST.md` → If something fails).
- Decide whether to merge #240 (it also carries unrelated performance changes) or to run the browsing scope from its branch.

**Not covered by either run:**

- The website host (Lovable) itself.
- Supabase Auth sign-up bursts.
- Edge Function cold starts under load.

The load stays on staging. Production is never load-tested.
