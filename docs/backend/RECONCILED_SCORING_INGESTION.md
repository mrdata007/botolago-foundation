# Reconciled scoring ingestion

Status: **built and tested.** Migration `20261003180000` goes on production with the guarded
script [`apply-20261003180000-reconciled-provider-observations.sql`](../../scripts/backend/apply-20261003180000-reconciled-provider-observations.sql)
(owner decision 2026-10-04). Nothing here scores, finalizes or publishes points.

## What it does

It takes one finished match from Sofascore and Flashscore, plus the reviewed player
mappings, and records it as an input for the Fantasy scoring worker.

```
provider payloads ─┐
reviewed mappings ─┼─> reconciler + replay verdict ─> request ─> database ─> observation ─> scoring worker
fixture binding ───┘        (TypeScript, pure)                (one RPC)     (one row per set of facts)
```

- **TypeScript** (`src/backend/fantasy/reconciled-ingestion.ts`):
  - `prepareReconciledObservation` runs the reconciler and the replay verdict. It builds a
    request only when the match is **ingestion-ready**. That means every player who
    appeared is a reviewed identity on both providers, the events agree, participation is
    established, nobody is held back, and both providers give the same final score.
    Otherwise it returns the reasons (`blockers`), each with a stable code.
  - `ingestReconciledFixtures` runs a list of matches.
- **Database** (`api.service_record_reconciled_fantasy_observation(fixture, request, dry_run)`,
  service role only):
  - It checks again that every row's Sofascore and Flashscore ids are **active, reviewed
    mappings to that same player**. It recomputes this from the mapping rows; it does not
    trust the client.
  - It links the app fixture to the two provider matches. After the first time, a fixture
    cannot be fed from another match, and a match cannot feed another fixture.
  - It records the observation through the same recorder as SportsMonks and reviewed
    corrections. That recorder checks the final score, 11 + 11 starters, team membership
    and consistent statistics. The new source name is `provider-reconciled`, and the
    recorder accepts it only through this function.
  - A reviewed correction still wins: once one exists for the fixture, provider facts are
    not stored.

## Dry run

- **`local`** (CLI default): no database. It builds every request and lists what blocks each
  match.
- **`dry-run`**: the database runs every guard (identities, links, the recorder's checks) and
  answers with the digest and readiness it would store. Then it undoes all of it inside the
  same call: no observation, no link, and no change to the scoring input version.

## Retries cannot duplicate points

- An observation is stored once per (fixture, digest of its facts). The same facts sent
  again, even read again later, return the row already there with `created: false`.
- This module never writes points. The scoring worker turns observations into points, and
  its own writes are keyed by its input digest.
- So a lost answer is retried safely. The runner retries only failures that say nothing
  about the request (network, timeout, busy database), at most 3 times with back-off. After
  that the match is reported as `uncertain` ("running again is safe"), never as failed or
  done.

## Error reporting

Each match gets one outcome:

| Outcome                        | What it means                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blocked`                      | Not sent. Each blocker has a code and a plain reason.                                                                                                                                                                |
| `dry-run-ok`                   | Dry run passed every guard.                                                                                                                                                                                          |
| `recorded`                     | Stored.                                                                                                                                                                                                              |
| `already-recorded`             | These facts were already stored.                                                                                                                                                                                     |
| `reviewed-correction-in-force` | A reviewed correction exists; the provider facts were not stored.                                                                                                                                                    |
| `refused`                      | The database refused. Its own code is passed on (e.g. `reconciled_identity_not_reviewed`, with the provider id), plus `adaptive_final_score_mismatch`, `reconciled_fixture_link_conflict`, and so on. Never retried. |
| `uncertain`                    | Still failing after the retries. Running again is safe.                                                                                                                                                              |
| `not-attempted`                | Not tried, because an earlier refusal would repeat for every match (no permission, migration missing).                                                                                                               |

- **Warnings:**
  - "a newer observation exists": another source wrote later. The latest observation is the
    one scored, so pause SportsMonks performance ingestion on staging while testing (plan,
    Phase 4).
  - "not scorable yet" (`simpleReady` false).
- **Raw database messages are never passed on.**

## Running it (staging only)

```
bun scripts/backend/reconciled-scoring-ingestion.ts --plan plan.json \
  --mappings rows.json --captured-at <ISO> [--mode local|dry-run|record] [--out report.json]
```

- **`plan.json`:** the provider match pair and its app fixture and teams, reviewed by a
  person.
- **`rows.json`:** the output of `football-reviewed-mapping-snapshot.sql`, read from the same
  database the run writes to.
- **Provider data:** the committed historical payloads only. The script makes no provider
  call.
- **Database modes:** need `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, and **refuse the
  production project**.
- **`record`:** also needs `RECONCILED_INGESTION_CONFIRMATION=RECORD_RECONCILED_OBSERVATIONS_ON_STAGING`.
- **Exit codes:** 0 ok, 2 blocked or a correction in force, 3 uncertain, 4 refused.
- **Before a record run, staging needs:**
  - this migration;
  - adaptive scoring active for the gameweek;
  - the fixture finished with its final score;
  - the reviewed mappings.

## Evidence

- **pgTAP** `supabase/tests/database/reconciled_provider_observations.test.sql`, 46 checks:
  - privileges;
  - a dry run keeps nothing;
  - record then retry stores once;
  - identities must be reviewed on both providers and point at the row's player;
  - links;
  - estimates refused;
  - the recorder's own guards;
  - a reviewed correction wins.

  Run locally on Postgres 16 built from this repository's migrations, with the existing
  adaptive-scoring tests (100/100). **CI's `database-quality` job is the authority.**

- **Negative controls (local):** each of these changes makes the suite fail:
  - removing the identity check;
  - letting a dry run keep its write;
  - removing the link check.
- **Contract check (local, not in CI):** a request built by the TypeScript code from a
  synthetic ingestion-ready match passed every database guard as full-ready, was recorded,
  and a retry stored nothing.
- **bun:** `reconciled-ingestion.test.ts` and `reconciled-scoring-ingestion.test.ts`, 31
  tests:
  - building, blocking and digest stability;
  - dry run, record then re-run, a lost answer after the write, retry limits and back-off,
    refusals never retried, stop on a refusal that would repeat;
  - error classification;
  - the CLI guard (production refused, typed confirmation).
- **MAS–Zemamra, local mode** (committed payloads, the 191-row Sofascore snapshot of
  2026-10-03): **blocked on identity only**. Events reconciled, participation established
  and scoring fields ready are all true. The blocker is 22 Sofascore and 31 Flashscore
  appearances without a reviewed mapping in that snapshot. Finishing those identities is
  the next step.
