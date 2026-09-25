# G7 historical player performance backfill — runbook

Workflow: `.github/workflows/g7-production-historical-performance-backfill.yml`
Runner: `scripts/backend/g7-historical-performance-backfill-runner.ts`
Ticket: `docs/production/g7-historical-performance-backfill-trigger.json`

This runbook covers the runner's capture/restore design introduced by BG-0033, why it exists, and
the operator procedures for every mode (default run, `--capture-only`, `--restore`,
`--restore-only`, `G7_DRY_RUN`).

## Why "restore" means "prove, then write, then re-prove"

The Supabase Management API's secrets endpoint (`GET /v1/projects/{ref}/secrets`, which the
`supabase` CLI's `secrets list` prints as a `NAME | DIGEST` table) never returns the plaintext of a
secret — only a digest. That means the runner can never "read the old value and write it back". It
can only:

1. **Capture** the digest of every managed secret's current value, before any mutation.
2. **Prove** that a reviewed, supplied restore value hashes to that same digest
   (`sha256hex(suppliedValue) == capturedFingerprint`, or an exact match for the unlikely case the
   API ever starts returning plaintext).
3. **Write** the proven values back (or `secrets unset` the ones that were absent).
4. **Re-verify** by listing again and confirming every managed name matches the captured
   expectation (present names' digests match; absent names are absent).

If step 2 fails for any managed name, the runner refuses to run at all
(`production_config_restore_unprovable`) — it never mutates production without already knowing how
to put it back. If step 4 fails after a run, `restoration.verified` is `false` and the run's
verdict is `fail` even if the backfill batches themselves all passed.

## The 15 managed secrets

`SPORTSMONKS_API_TOKEN`, `FOOTBALL_INGESTION_TRIGGER_SECRET`, `FOOTBALL_PROVIDER`,
`FOOTBALL_PROVIDER_BASE_URL`, `FOOTBALL_SPORTSMONKS_LEAGUE_ID`, `FOOTBALL_SPORTSMONKS_SEASON_ID`,
`FOOTBALL_SPORTSMONKS_TEAM_IDS`, `FOOTBALL_SPORTSMONKS_COUNTRY_CODE`,
`FOOTBALL_SPORTSMONKS_COMPETITION_TYPE`, `FOOTBALL_SPORTSMONKS_SEASON_START`,
`FOOTBALL_SPORTSMONKS_SEASON_END`, `FOOTBALL_SPORTSMONKS_FIXTURE_FROM`,
`FOOTBALL_SPORTSMONKS_FIXTURE_TO`, `FOOTBALL_PROVIDER_TIMEOUT_MS`,
`FOOTBALL_PROVIDER_MAX_RETRIES`.

`FOOTBALL_INGESTION_TRIGGER_SECRET` is special-cased: if it is absent before the run, it is unset
again afterward (it is a one-time value the runner itself generates for the run). If it is
*present* before the run, its value is unrecoverable unless the `G7_CURRENT_TRIGGER_SECRET`
GitHub Environment secret (on `production-admin-activation`) matches its captured fingerprint —
otherwise the runner refuses to run at all. This is a repository/environment secret, not a
workflow_dispatch input, so a real trigger-secret plaintext value never has to be pasted into the
manual dispatch form. If `FOOTBALL_INGESTION_TRIGGER_SECRET` is not actually set in production
(the common case), leave the environment secret unset; an unset environment secret resolves to an
empty string, which the runner already treats as "not supplied". Always dispatch `--capture-only`
first to learn whether it is currently set, and if it ever is, have a human with repo-admin access
add/update `G7_CURRENT_TRIGGER_SECRET` in the `production-admin-activation` Environment before
dispatching a restore.

## Modes

- **Default** (`bun scripts/backend/g7-historical-performance-backfill-runner.ts`): capture → prove
  the restore plan → mutate the requested season(s) → restore → verify. Verdict is `fail` unless
  `restoration.verified === true`, regardless of whether the backfill batches passed.
- **`--capture-only`**: captures the 15 secrets' presence/fingerprints and writes them to evidence
  (`g7-historical-performance-backfill-capture.json`, presence booleans and `sha256(fingerprint)`
  only — never the fingerprint itself) and to the runtime dir (`pre-run-config.json`, 0600, deleted
  by cleanup). Mutates nothing. **This is always the first live action to take** — it answers
  whether the trigger secret is set and lets you sanity-check the reviewed current-runtime inputs
  before a real dispatch.
- **`--restore`**: reads `pre-run-config.json` from the runtime dir (the capture from *this same
  job*) and the same reviewed current-runtime inputs, then restores and verifies. It is a no-op if
  `runtime/restore-verified` already exists (the in-process restore already succeeded). This is the
  workflow's own `if: always()` post-step — see "Why not just `finally`" below.
- **`--restore-only`** (workflow input `restore_only: true`): the double-failure recovery path — a
  **fresh dispatch** with no existing runtime state. It captures the *current* live configuration,
  proves the reviewed current-runtime inputs against those fresh fingerprints, writes them back, and
  verifies. Use this when both the mutation step **and** the `always()` restore post-step were
  killed (see "Recovery" below).
- **`G7_DRY_RUN=1`**: captures and builds/proves the restore plan (so a mismatched fingerprint still
  fails closed) but issues no `secrets set`/`unset` and no HTTP POST. Evidence carries `dryRun: true`.

## Why not just `finally`

Reproduced locally (Bun 1.3.11, workflow pins 1.3.14): a script inside `try { … } finally { … }`,
sent `SIGINT`, exits without running `finally`; sent `SIGTERM`, same. In the workflow's shape
(`bash -c 'bun runner.ts > raw.log 2>&1'`), signals delivered to the bash wrapper did not even reach
the `bun` child. GitHub's own cancellation sequence is SIGINT → (7.5s) → SIGTERM → (2.5s) →
SIGKILL, and SIGKILL cannot be intercepted by any code. This is why restoration cannot live only
inside the runner's own `try/finally`: the workflow has a **separate** step,
`Restore production function configuration`, with `if: always() && steps.capture.outcome ==
'success'`, placed immediately after the mutation step and before evidence/cleanup. GitHub gives a
cancelled job roughly 5 minutes for its `always()` steps before it force-terminates everything — the
restore step is three CLI calls (`set`, `unset`, `list`), which comfortably fits.

## Run-window rule — the serialization gap

The `botolago-production-v2-mutation` concurrency group serializes every GitHub-Actions-triggered
mutation against G7, **but it only serializes GitHub jobs**. It does **not** serialize:

- A manual edit of function secrets from the Supabase dashboard.
- A `supabase secrets set/unset` run from a laptop with a personal access token.

**Do not perform either of those against `football-ingest`'s secrets while a G7 run (or any other
workflow in the concurrency group) is in flight.** A manual edit landing between G7's capture and
its restore step will be silently overwritten by the restore step's fingerprint-proven values, and
G7's own capture will not see it. Treat the run window as exclusive by convention, not by tooling.

Also keep for the run window: `FANTASY_AUTOMATION_ENABLED` unset (BG-0004), and do not manually
dispatch any other workflow in the concurrency group. Scheduled runs of
`fantasy-season-orchestrator` and `football-current-season-recovery` are also in the group and will
simply queue behind G7 — they do not touch function secrets, so they are safe to leave enabled.

## `skip_deploy`

`skip_deploy: true` is only legitimate when the *live* `football-ingest` function's `version` and
`ezbr_sha256` already equal the reviewed commit's expected values (workflow inputs
`expected_function_version` / `expected_function_ezbr_sha256`, checked live against
`GET /v1/projects/{ref}/functions`). It defaults to `false` and the workflow refuses to skip the
identity check — the "Check football-ingest identity before skipping deploy" step must pass before
migrations run when `skip_deploy` is requested.

## Recovery: the restore post-step was also killed

1. Do not re-run the same workflow run (`GITHUB_RUN_ATTEMPT` must stay `1`; the guard forbids it).
2. Dispatch a **new** run with `restore_only: true` and the same reviewed `current_season_id` /
   `current_season_start` / `current_season_end` / `current_fixture_from` / `current_fixture_to` /
   `current_team_ids` inputs. If `FOOTBALL_INGESTION_TRIGGER_SECRET` is currently set in
   production, confirm the `G7_CURRENT_TRIGGER_SECRET` Environment secret is already set on
   `production-admin-activation` before dispatching (there is no per-dispatch input for it).
3. This dispatch captures the live configuration fresh, proves the same reviewed inputs against it,
   writes them back, and verifies — the finalize step reports
   `G7_PRODUCTION_HISTORICAL_PERFORMANCE_RESTORE_ONLY_PASS` on success.
4. Follow up with a `--capture-only` dispatch to confirm the fingerprints are now stable and that
   `FOOTBALL_INGESTION_TRIGGER_SECRET` is absent (unless intentionally restored).

## Fixture coverage rule (BG-0011 option B) — a relaxation, stated plainly

The 22-provider-starter invariant did **not** change: SportsMonks always reports exactly 22 raw
starter rows (`type_id` 11) per finished fixture — this is universal (measured 240/240). What
changed is how many of those 22 may lack a `player_id` ("anonymous") before the fixture is usable:

- **Before BG-0011**: all 22 starters had to be identified (`player_id` present). Measured against
  real production data, 64/240 season-26027 fixtures failed this and were never ingested at all.
- **After BG-0011 (current rule)**: up to **4** of the 22 raw starters may be anonymous. Identified
  starters = 22 − anonymous. Only identified rows are ever persisted; anonymous rows are never
  assigned to any player, never treated as another player's stats, and never recorded as an
  "observed zero" appearance/minutes for anyone. Measured coverage: **238/240** season-26027
  fixtures are usable under this rule. The other **2, fixtures 19596474 (7 anonymous of 22
  starters) and 19596475 (8 anonymous of 22), are quarantined entirely** — none of their rows, not
  even the identified ones, feed pricing — because they exceed the 4-anonymous cap. This is a
  genuine data limitation in the provider's payload for those two fixtures, not a mapping defect.

**Update, 2026-09-25 (owner decision):** the current season follows the same rule since
`20260925110000_current_performance_unnamed_starters.sql`. Its first finished match (fixture
19874708) had 3 unnamed starters and 4 other unnamed rows, and could not be imported, so Gameweek 1
could not be scored. Up to 4 unnamed starters are now accepted there too; a match with more waits.
The paragraph below describes the rule as it was first scoped, to last season only.

This is a deliberate, scoped **relaxation** of the old rule, not "the same invariant read more
carefully." It applies **only** to this historical (completed-season) ingestion path —
`api.ingest_historical_player_fixture_performance` / `api.quarantine_historical_player_fixture_performance`,
`sportsmonks-fixture:`-prefixed `source_version`s. **Correction (second owner pass)**:
`app.player_fixture_performances` and `app_private.historical_performance_fixture_coverage` are
**not** exclusive to this path — they are SHARED, at the table level, with the live current-season
Fantasy scoring/ingestion path (`api.ingest_current_player_fixture_performance` in
`20260914200726_current_finished_fixture_performances.sql`, `sportsmonks-current-fixture:`-prefixed
`source_version`s; that data also feeds `app_private.fantasy_scoring_input_document` /
`app_private.fantasy_assert_scoring_snapshot`, called from the live gameweek-finalization path in
`20260914200730_fantasy_verified_finalization.sql` — this is not dead code). What actually keeps
the relaxation away from live scoring is: (1) both historical RPCs requiring
`season.status = 'completed' and not is_current` before touching any row; (2) a hard DB-level
CHECK constraint tying `anonymous_starter_rows > 0` to the `'sportsmonks-fixture:'` prefix, so a
current-season row can never carry a nonzero anonymous-starter count even by accident; (3) the new
columns' defaults exactly matching what the unmodified current-season RPC already produces. See
`docs/engineering/tasks/BG-0011/engineering-brief-option-b-identity-completeness.yaml` for the full
enforcement-point list and `supabase/migrations/20260919120000_historical_anonymous_starter_tolerance.sql`
for the schema/RPC changes.

**What this means for the runner's evidence**: `fixturesProcessed` (should still reach 240) is
fixtures *attempted*, not fixtures whose data feeds pricing. Each season result now separately
reports `acceptedFixtures` (usable) and `quarantinedFixtures` (over the anonymous-starter cap,
contributed zero rows). Never read `fixturesProcessed` alone as "240 fully ingested fixtures" — a
season can legitimately finish with `acceptedFixtures: 238, quarantinedFixtures: 2` and still be a
clean, verdict-`pass` run.

**The exact reporting language to use**: "240 historical fixtures enumerated; 2 named fixtures
(19596474, 19596475) quarantined; 238 candidates for acceptance, subject to all remaining
validation" (`lineup_rows_out_of_range`, `valid_player_rows_out_of_range`,
`incomplete_rows_limit_exceeded`, `team_count_mismatch`, `invalid_detail_rows_present`). Never
round this up to "240 ingested", and never imply the 238 are already fully validated/accepted —
every one of them is still subject to every other existing check.

**Quarantine is traceable and all-or-nothing, single-table design**: quarantine is a
`coverage_outcome` (`'accepted'` or `'quarantined'`) on the SAME
`app_private.historical_performance_fixture_coverage` row a fixture has always had — not a
separate table. A quarantined row carries an explicit `quarantine_reason`
(`'anonymous_starter_rows_exceeded'`), never an implicit "excluded because it failed a query
filter", and `coverage_outcome` is derived from `anonymous_starter_rows > 4` by a hard CHECK
constraint, never an independently settable flag. A quarantined fixture's identified rows are
never persisted either — not row-by-row, the whole fixture is excluded (`starter_rows = 0` and
`performance_rows = 0`, also enforced by that CHECK constraint). Nothing is ever `DELETE`d from
`app.fixtures`, `app.players`, `app_private.football_provider_mappings`, or (for that matter)
`app_private.historical_performance_fixture_coverage` itself; the quarantined fixture's own
record, its provider mapping, and any player who appeared in it remain fully retrievable, and a
fixture that moves between accepted and quarantined (e.g. a corrected payload) UPSERTs the same
row rather than deleting and recreating it elsewhere.

**Production status of the two named outliers (checked read-only by the Chief, 2026-09-19)**:
fixture 19596474 → internal fixture_id `8f9c8cd8-29d7-4d22-afd2-8cfb3573fe9e`; fixture 19596475 →
`d30eb1d6-d257-49f4-a9ee-02c2ee9cc2b6`. Neither has any row in
`app_private.historical_performance_fixture_coverage` or `app.player_fixture_performances` today.
**Affected derived outputs: NONE** — neither fixture has ever contributed to a persisted rating or
price, so no recalculation of anything already persisted is needed once this rule ships.

## What proves restoration in the evidence

- `restoration.verified: true` — the authoritative signal; the finalize step also fails the run
  outright if the restore step's own outcome was not `success`.
- `restoration.perName[]` — per managed secret: `expectedPresent`, `observedPresent`,
  `fingerprintMatched`.
- `runtime/restore-verified` — a marker file (deleted by cleanup) that makes `--restore` idempotent.
- `currentSeasonCrossCheck` — three best-effort, non-blocking booleans recorded for review:
  `catalogIsCurrent` (the app's `api.football_season_catalog` first row is marked current),
  `catalogLabelMatchesProvider` (that label matches the provider's season name), and
  `providerIsCurrentAndLeagueMatches` (the provider agrees the season id is current and in league
  860). These are diagnostic, not gating — the gate is the fingerprint proof.
