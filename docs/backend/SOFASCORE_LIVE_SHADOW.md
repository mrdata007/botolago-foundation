# SofaScore live shadow compare

Read-only comparison of what SofaScore says live about Botola matches with what
Production V2 shows (still fed by SportsMonks). Nothing is written to any
database or storage. Part of [SOFASCORE_FULL_MIGRATION_PLAN.md](SOFASCORE_FULL_MIGRATION_PLAN.md).

## What it does

Per poll:

1. **SofaScore, request 1:** `tournaments/get-live-events?sport=football`
   (every football match in play), filtered to Botola (`uniqueTournament` 937).
2. **SofaScore, request 2 (only when needed):** `tournaments/get-last-matches`
   page 0 for 937 / season 102220, sent only when a mapped Botola fixture that
   production shows as live, or that kicked off in the last 3 hours and is
   unfinished, is missing from the live list (a match that just ended drops off
   the live list). `--no-fallback` disables it. So at most **2 requests per
   poll**.
3. **Production, one SELECT** through the Supabase Management API
   (`--read-production`, ref must be `tkewgajrljbwgwedqsxn`, single `SELECT`
   enforced by `assertReadOnly`): active `sofascore` rows of
   `app_private.football_provider_mappings` (entity type, external id, internal
   id) and, for the mapped fixtures, `app.fixtures` status, period, scores,
   `provider_updated_at`, `source_sequence`, `finalized_at`.
4. `buildFixtureIngestPlan` (the shadow plan from `sofascore-fixtures.ts`) runs
   over the SofaScore events using the lookup built by
   `supabase/functions/_shared/sofascore-mapping-lookup.ts`.

The output is one row per Botola event: SofaScore status and code, score,
production status, period and score, and **would change**:

- `yes`: the real ingest would change status, period or score;
- `no`: production already agrees;
- `blocked_stale`: it differs, but production's `provider_updated_at` (then
  `source_sequence`) is newer than SofaScore's `changeTimestamp`, so the
  freshness guard would refuse the write (a SportsMonks update can be newer
  than the SofaScore change that is being compared);
- `not_mapped`: no complete mapping, listed under _Unmapped_.

Below the table: mapped production fixtures that neither response returned,
unmapped events, unknown statuses (for example code 20 "Started", left out by
design), rejected events (finished without a score) and mapping conflicts.
The request count and RapidAPI quota are printed at the top.

## Dispatch (owner only)

Workflow **SofaScore live shadow compare (production, read only)**, from `main`,
as the owner, no reruns, `expected_commit` = the exact reviewed main commit.
Environment `production-admin-activation` (needs `RAPIDAPI_KEY`,
`SUPABASE_ACCESS_TOKEN` and the variable `SUPABASE_PRODUCTION_PROJECT_REF`).

| Input              | Meaning                                  |
| ------------------ | ---------------------------------------- |
| `repeat`           | polls in this run, 1 to 12 (default 1)   |
| `interval_minutes` | sleep between polls, 2 to 10 (default 5) |

The job sleeps between polls (timeout 150 minutes), so one dispatch can follow a
whole match: for kickoff 19:00 UTC, dispatch about 18:55 with `repeat` 12 and
`interval_minutes` 10 (about 110 minutes, 12 to 24 requests), or `repeat` 12 /
`interval_minutes` 5 for the first hour. Each poll appends its table to the job
summary. A failed poll does not stop the next one, but the run ends red.

Quota: the plan is 500 requests a month. The client refuses to send once fewer
than 100 remain, and the quota left is shown in every poll.

## Concurrency

The workflow uses its own group `sofascore-live-shadow-compare` with
`cancel-in-progress: false`. It does not take `botolago-production-v2-mutation`
because it never writes, so it neither blocks nor is blocked by production
writes; under AGENTS.md "One writer at a time" a read needs no lock.

## Running locally (read only)

```
RAPIDAPI_KEY=… SUPABASE_ACCESS_TOKEN=… SUPABASE_PRODUCTION_PROJECT_REF=tkewgajrljbwgwedqsxn \
  bun scripts/backend/sofascore-live-shadow-compare.ts --read-production [--markdown out.md] [--json out.json] [--no-fallback]
```

Code: `scripts/backend/sofascore-live-shadow-compare.ts` (tests beside it),
`supabase/functions/_shared/sofascore-mapping-lookup.ts`.
