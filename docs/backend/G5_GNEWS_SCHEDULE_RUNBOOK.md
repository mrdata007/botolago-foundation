# Gate 5 scheduled GNews ingestion

## Status

The scheduled ingestion workflow is installed but dormant. It does not run on
`push` or `pull_request`, and merging it does not call GNews or Production V2.

The implementation baseline verified on 2026-08-02 had no repository Actions
variables. The protected `production-admin-activation` environment had neither
`GNEWS_COMMERCIAL_LICENSE_APPROVED` nor `GNEWS_SCHEDULE_ENABLED`. Do not create
either variable until the entry criteria below are satisfied.

The production news source remains a launch **NO-GO** until commercial content
rights are approved and a licensed manual run produces passing evidence.

## Boundary

`.github/workflows/g5-production-gnews-schedule.yml` invokes only the deployed
`news-ingest` Edge Function with the fixed body `{"job":"gnews"}`. The function
is bounded to at most ten French and ten Arabic results, uses the existing
server-side GNews configuration, stores sanitized excerpts and original links,
and authenticates with protected production credentials.

The recurring cadence is every two hours at minute 23. Each run:

- targets only `main` and the exact workflow commit;
- forbids reruns;
- shares the Production V2 mutation concurrency lock;
- times out the HTTP request after 45 seconds;
- requires an exact zero-rejection reconciliation;
- scans the response and manifest for credentials;
- uploads sanitized evidence on success or failure before cleanup; and
- retains the artifact for 30 days.

## Entry criteria

All of the following are required before any activation variable is created:

1. Written GNews commercial approval covers the intended French and Arabic
   queries, excerpt storage, source attribution, production traffic, retention,
   and public display in Morocco and the EU. Record the agreement/reference,
   approver, scope, and expiry or renewal date outside the repository.
2. Legal/privacy review confirms the approved storage and display behavior.
3. `news-ingest` is healthy in Production V2 and its protected trigger secret is
   current.
4. The reviewed workflow commit is on `main` and all required checks are green.
5. An operator is ready to inspect the first run's artifact before enabling the
   recurring schedule.

## Licensed canary, then activation

The two flags are deliberately **repository-level Actions variables**. GitHub
does not expose environment-level configuration variables until the job has
been sent to a runner, so environment-level flags cannot safely control the
job-level schedule condition.

1. Create only `GNEWS_COMMERCIAL_LICENSE_APPROVED=true` after recording the
   approved licensing evidence.
2. Keep `GNEWS_SCHEDULE_ENABLED` absent or set to `false`.
3. Manually dispatch `G5 Production scheduled GNews ingestion` from `main` with
   the exact current main SHA and confirmation `RUN_G5_SCHEDULED_GNEWS`.
4. Do not rerun a failed job. Download its
   `g5-scheduled-gnews-<run-id>` artifact, diagnose the stable failure code, and
   fix forward with a new reviewed commit and a new run.
5. Exit the canary only when the artifact has `verdict: pass`, HTTP 200, both
   languages, at least one fetched row, zero rejected rows, and exact
   inserted/updated/skipped reconciliation.
6. Create `GNEWS_SCHEDULE_ENABLED=true` only after that evidence is approved.
7. Verify the next natural scheduled run passes and record its run URL, artifact
   ID, digest, main SHA, and counters in the Gate 5 evidence record.

## Exit criteria and evidence

This scheduling sub-gate exits only when:

- licensing approval remains current;
- the licensed manual canary and the first natural scheduled run both pass;
- each run has a sanitized artifact and successful credential scan;
- Production V2 contains only attributed excerpts and canonical source links;
- the latest provider run is terminal `succeeded` with zero rejections; and
- alert ownership and the two-hour operating cadence are accepted.

This does not by itself complete Gate 5. Current-season SportsMonks catalog,
round, team, squad, and fixture population is a separate Gate 5 exit criterion.

## Rollback

Set repository variable `GNEWS_SCHEDULE_ENABLED=false` (or delete it) to stop
future cron jobs. Do not rerun or delete failed evidence. If a run is already in
progress, cancel that run and verify its available sanitized evidence. If the
trigger may be compromised, rotate `NEWS_INGESTION_TRIGGER_SECRET` in the
protected environment and Production V2 together before any later canary.

Rollback never deletes ingested stories or rewinds migrations. Corrections and
withdrawals are forward-only editorial operations.
