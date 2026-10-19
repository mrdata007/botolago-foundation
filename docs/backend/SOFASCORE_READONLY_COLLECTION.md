# Read-only SofaScore player ratings collection

Use `scripts/backend/sofascore-collect.ts` to retrieve API-native player evidence
without a database connection. It does not resolve BotolaGO players, ingest,
score, finalize, deploy, or change provider/scoring switches. The existing
production Edge ingestion remains a separate deployed path; this command does
not prove its deployment configuration. See [live evidence](../audits/2026-10-18-sofascore-live-collection.md).

## Run locally

Requires Bun 1.3.14, installed dependencies, and `RAPIDAPI_KEY` already bound in
the process environment. Never put the key in a command argument or URL. No
Supabase credential is needed.

```sh
bun install --frozen-lockfile --ignore-scripts
bun scripts/backend/sofascore-collect.ts --help
bun scripts/backend/sofascore-collect.ts \
  --out-dir /tmp/botola-evidence --event-ids 17132481,16958239 \
  --recent-round --fresh --max-pages 3 --max-age-days 30 \
  --max-requests 64 --min-remaining 100 --player-statistics 1 --incidents
```

The two explicit IDs are controls from earlier audits, **not recent fixtures**.
`--recent-round` discovers a complete recent round from the API. Omit that flag
for explicit-event collection only; omit `--event-ids` for discovery only.
Discovery reads `tournaments/get-seasons?tournamentId=937` and uses the first
season in SofaScore's current-first list, or validates `--season-id` against
that list. It then reads bounded `tournaments/get-last-matches` pages. An
8-match round with 16 distinct teams, all finished and within the age window,
is required. A page limit, postponed/live fixture, malformed event or missing
match cannot silently certify a partial round. The eight-match criterion is
specific to the current 16-club Botola format and must be reviewed if it changes.

## Run with the existing GitHub secret

The inspected `provider-probe.yml` runs in `staging-load-test`, has `contents:
read`, and has no database credentials or database operations. Its existing
`fixtures` input accepts the reserved `sofascore-ratings` mode; `only` then means
explicit event IDs. Other probe modes are disabled for that run. Dispatch the
reviewed feature commit's branch (the main workflow already exists):

```sh
gh workflow run provider-probe.yml --repo mrdata007/botolago-foundation \
  --ref feat/sofascore-readonly-collection \
  -f provider=sofascore -f fixtures=sofascore-ratings \
  -f only=17132481,16958239
gh run list --repo mrdata007/botolago-foundation --workflow provider-probe.yml --limit 1
# Replace RUN_ID with that run's numeric ID.
gh run download RUN_ID --repo mrdata007/botolago-foundation \
  --name sofascore-collection-RUN_ID --dir /tmp/botola-evidence
```

This mode always uses fresh requests, recent-round discovery, a 64-attempt
budget, a 100-request reserve, one diagnostic player-statistics request and one
incidents request per collected match. Environment approval may be required by
GitHub. A nonzero collector exit remains a nonzero workflow conclusion; its
normalized artifact still uploads, with three-day retention. Inspect `exitCode`
and section errors before interpreting a red run as access failure.

## Evidence and safeguards

- `report.json`: per-match participants, rated players, missing-rating IDs,
  coverage, statistic names, endpoint observation times, section errors,
  requests consumed and provider quota. Discovery requests are counted separately.
- `players.csv`: event ID, **match-side team ID**, player ID, appearance evidence,
  minutes, rating/state, numeric statistics, available/unreliable fields, source,
  observation time, transport and evidence kind. Null/missing cells are unknown;
  an unused substitute has `not_applicable` rating state.
- The `cache/` directory holds successful raw responses with original fetch
  timestamps. Output must be outside the repository, including resolved symlinks.
  New directories/files use private modes. Cache TTL defaults to one hour (maximum
  one day); `--fresh` bypasses it and never falls back after a live failure. Only
  `report.json` and `players.csv` are uploaded, **never the cache**.
- `freshAuthenticatedPull` requires successful requested sections, live transport
  for every observation and authenticated evidence kind. It can be true while
  ratings are unavailable: retrieval success and upstream coverage differ. Fresh
  means a new authenticated request, not certification of SofaScore update latency
  or intermediary cache freshness.
  `mock` and `historical_replay` tests are explicitly labeled and cannot establish
  live retrieval. A cache hit retains the original observation time and cannot
  set the fresh flag.
- Events must match the requested ID, unique tournament **937**, a finished
  status/code and two distinct team IDs. Every lineup needs 11 starters per side,
  valid unique player IDs, explicit substitute flags and valid numeric ranges.
  Numeric count fields have integer checks; metric fields can be fractional.
- Shared `parseSofascoreLineups` and `auditLineups` retain the current coverage
  and appearance rules. Every appearing or uncertain unrated player remains
  pending, including short cameos. No rating or missing statistic becomes zero.
  Limited-coverage `goalAssist`, `totalShots` and `saves` are null with an explicit
  unreliable-field list. Lineup `teamId` is the registered club and is ignored.
- `--player-statistics` is an optional bounded endpoint diagnostic, not a promise
  to repair absent upstream ratings. Its output has separate provenance; it never
  overwrites lineup ratings or marks the match complete. Incidents are a separately
  checked availability/count diagnostic; this command does not reconcile goals.
- The server-side RapidAPI client now includes body consumption in the 15-second
  timeout, sanitizes errors, forbids redirects, retries at most twice, honors
  seconds/date `Retry-After`, and checks budget/quota before every attempt. A
  provider wait over five seconds stops rather than retrying early. Authentication
  and access denial stop later requests; transient failures open a circuit after
  the configured failure threshold. Remaining quota is a last-response snapshot,
  not an accounting total for other concurrently active ingestion jobs.
- The older database-backed ratings audit retains its scope but now exposes
  sanitized transport reasons, request counts, quota and observation times. Its
  existing main/owner/production-environment guards remain intact. No database
  writer or scoring/mapping guard was changed.

Exit codes: **0** complete coverage/ratings; **2** usage, missing credential or
local setup/output failure; **3** fetch/validation/optional-section failure;
**4** successful collection with incomplete statistics or ratings. Coverage
failure does not mean the API is blocked. JSON always carries the distinction
when output can be written.

## Verify without live calls

```sh
bun test src/backend/football/provider scripts/backend/sofascore-collect.test.ts \
  scripts/backend/sofascore-ratings-audit.test.ts \
  src/backend/fantasy/sofascore-fantasy.test.ts \
  supabase/functions/_shared/sofascore-coverage.test.ts \
  supabase/functions/_shared/fantasy-rating-scoring.test.ts \
  supabase/functions/_shared/sofascore-staged-stats.test.ts
bun run typecheck
bun run typecheck:sofascore-collection
bun run backend:secrets:check
```

These are synthetic HTTP failure tests and explicitly historical fixture replays,
not authenticated live evidence. They cover quota/budget exhaustion, access
circuit breaking, seconds/date Retry-After, network/cancellation/body timeouts,
upstream 404 inside HTTP 200, malformed payloads/IDs/ranges, misleading zeros,
cache timestamps, discovery bounds and the existing scoring/mapping safeguards.
