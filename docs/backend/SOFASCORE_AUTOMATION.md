# Unattended SofaScore ingestion

This supersedes the manual collector as the normal-operation deliverable in
PR #522. The command in `SOFASCORE_READONLY_COLLECTION.md` remains a diagnostic.
Production activation, deployment, migrations and merging require separate
approval. The new setting ships **disabled**, and the migration creates no new
active schedule.

## Normal operation

1. The existing `football-season-refresh` cron wakes every ten minutes. Its
   existing hourly season discovery reads the SofaScore calendar, validates the
   tournament and approved fixture/team/round mappings, and updates the season's
   fixtures. The active approved season mapping supplies the season ID when the
   new collector owns observations; no event is manually selected.
2. Between those hourly discovery passes, the same tick dispatches
   `{"job":"ratings_collection"}` to the existing `football-live-refresh`
   handler if eligible finished fixtures are due. Its existing Vault scheduler
   token and pg_net dispatcher are reused. It honors the football refresh switch,
   and hourly discovery keeps priority.
3. SQL discovers finished/finalized fixtures from the **current**, competition-937
   mapped season, assigned to an adaptive-scoring gameweek that is not sealed.
   Approved fixture, season and match-side team IDs are required. It never
   invents mappings for an unknown fixture or player.
4. The bounded worker reads detail, lineups, incidents and team statistics: four
   requests per fixture, at most two fixtures/eight requests per pass. Detail
   must agree with the approved event, competition 937, season, sides, final
   status and stored score. Lineups require explicit substitute flags, eleven
   starters per side, unique positive player IDs and valid minutes/counts/ratings.
5. Player identities come exclusively from `service_sofascore_fantasy_context`
   and its existing approved primary/alias mappings. There is no name/shirt
   matching, mapping creation or new unmapped-player exclusion. An unapproved
   participant holds the observation. The shared builder retains participation,
   incident, coverage and numeric safeguards; unknown statistics stay unknown.
6. The existing `service_record_sofascore_fantasy_observation` rechecks every
   identity inside the fenced transaction. The existing staged-statistics state
   and player-performance sync consume the same replies, with no extra provider
   requests. Coverage regression cannot overwrite a full observation. A Pépites
   performance-sync failure does not roll back a valid Fantasy observation.
7. The existing `fantasy-worker-tick` and `fantasy-lifecycle-worker` consume the
   changed scoring-input version. Actual-rating requirements, captain/chip
   behavior, publication/finalization rules and sealed history stay unchanged.
   A player who appeared without a rating remains pending. `FINAL_LIMITED` or
   reaching a retry deadline does not create a rating or authorize strict-rating
   scoring.

Enabling the durable collector disables the older automatic-observation,
catch-up and staged-pull loops inside football refresh; fixture discovery,
scores and match-page details continue. An ownership-state read error does not
silently re-enable the old auto-mapper. Catalog/shadow jobs keep their existing
behavior. Deploy and switch ownership while workers are paused according to
`AGENTS.md`; a database that lacks the new migration retains the old behavior.

## Exact cadence and request budget

- **Discovery:** existing hourly calendar refresh, checked by the existing
  ten-minute cron; full season pagination retains its existing daily bounded
  pass. Collection does not add another season-list poll.
- **First pull:** next available ten-minute tick after the approved fixture is
  finished/finalized, after any hourly discovery dispatch finishes.
- **Missing data:** select the next future kickoff offset from **6h, 24h, 72h,
  144h, 216h, 288h, 360h, 432h, 500h**, with five-minute scheduling slack. There
  is no burst of catch-up calls for offsets already in the past. At most ten
  claimed attempts per fixture, including crashed/failed attempts.
- **Final correction pull:** when all ratings are available under the staged
  policy, preserve its three-day final-pull time; if ratings are still absent,
  use the earlier next missing-data offset or staged pull. A staged `FINAL`
  does not suppress a missing-rating retry. Existing stage settlement is still
  evaluated by the tick. A non-staged gameweek can stop once all ratings exist.
- **Deadline:** no provider pull at or beyond the existing
  `sofascore_fantasy_hold_window()` (currently 21 days from kickoff), or after
  the gameweek seals. Existing staged timeout settlement still runs afterward.
  Unavailable ratings remain pending even after the request window closes.
- **Request bounds:** no immediate retries in this worker; durable scheduled
  retries own the retry budget. Header and body reads each have an eight-second
  timeout. A pass stops starting requests after 45 seconds. Provider access
  denial persists a 24-hour cooldown; rate limiting waits at least one hour and
  honors a longer `Retry-After`; other provider-unavailable failures cool down
  for ten minutes. Quota refusal stops the pass.
- **Collection budget:** **1,600 reserved attempts per UTC calendar month**.
  Ten pulls × four requests × forty fixtures = 1,600, covering a five-round
  month. Four rounds/32 fixtures cost at most 1,280. Every outbound attempt
  reserves a slot transactionally **before** the request. A crash between
  reservation and sending conservatively consumes a slot rather than allowing
  an undercount.
- **Shared usage guard:** collection stops at 9,000 counted/reserved requests
  across all Edge jobs, below the 10,000-request subscription measured in the
  live audit. Other jobs retain their existing guards. The
  persisted provider quota floor is 1,000. Calendar-budget accounting and the
  provider's own header snapshot are separate guards; quota snapshots are not
  inferred by subtracting unrelated concurrent jobs' headers. A changed
  subscription must be reviewed before activation.

The collector's 1,600 is an additional **hard allocation**, not a claim that all
other jobs have a hard 7,400 cap. Their existing roughly 5,500/month estimate
plus this worst-case allocation is roughly 7,100. The collector's shared-usage stop at 9,000 and the
provider's quota floor protect the remaining capacity. Diagnostics and jobs
outside the Edge counter still consume subscription quota, so the provider
header guard remains necessary.

## Duplicate and overlap protection

The collection setting has one four-minute lease. Each claim also takes the
**existing Fantasy worker lease**, so a scorer or orchestrator and collector
cannot write concurrently. The commit locks/rechecks both lease rows before
calling the recorder, fencing a stale worker after lease takeover. A timed-out
or crashed worker leaves durable attempt state and a conservative reservation;
a successor traces its abandoned ingestion run after lease expiry.

A unique fixture queue, per-fixture attempt limits and future retry dates prevent
repeated tick fetches. A semantic digest includes parsed evidence, approved
fixture/event/team bindings, final score and the approved player-mapping snapshot.
Only an accepted observation can update the cached digest. Unchanged evidence skips observation insertion, while the
existing recorder provides its own digest/version guards. A genuine change bumps
the scoring-input version and reaches the existing worker. Replayed data cannot
create duplicate point events or another calculation version. The existing
worker may still check an unchanged live gameweek; that does not imply a new
scoring version.

## Operations and diagnostics

Use the existing `football_ingestion_runs` records (`provider_name=sofascore`,
`job_type=player_ratings`, `target_scope.job=ratings_collection`). Checkpoints
include per-fixture validation outcomes, missing-rating IDs, requests,
reservations, quota and pending/error states. `rapidapi_call_counts` receives
endpoint/status totals through the existing counter. No response body or
credential is logged.

The new `sofascore_collection` entry is appended to the existing
`ops_health_checks`/alert surface. Its detail includes last attempt, **last
successful collection time**, pending fixtures, last safe error, cooldown,
monthly reservation usage and last quota. Missing ratings/held work warn; an
unserviced overdue queue fails after the health grace. When disabled the check
is ok. The private queue retains bounded retries and failures after the fetch
window ends; it never marks unrated data complete merely because time passed.

Manual diagnostic endpoint, using an already bound scheduler token (never paste
it into chat or put it in a URL):

```sh
curl --fail-with-body --request POST \
  "$SUPABASE_FUNCTIONS_BASE_URL/football-live-refresh" \
  --header "x-botolago-scheduler-token: $BOTOLAGO_SCHEDULER_TOKEN" \
  --header 'content-type: application/json' \
  --data '{"job":"ratings_collection","dryRun":true}'
```

Dry-run reads only the plan: no lease, provider request, observation, queue,
scoring or quota write, and no RapidAPI key is required. Omit `dryRun` for a
bounded diagnostic pass; it still requires the enabled policy and the same
leases/budgets. Normal operation never uses this manual endpoint.

## Non-production verification

`backend-quality.yml` runs `scripts/backend/sofascore-automation-e2e.ts` on its
isolated local Supabase database after pgTAP. It uses actual PostgreSQL,
pg_cron/pg_net, the scheduler-token guard, the football handler, approved-ID
review/recording functions, staged state and the Fantasy handler/scorer.
**Provider replies are synthetic**, not fresh authenticated SofaScore evidence.
The prior fresh authenticated audit remains separately labeled.

The harness creates a synthetic world in an empty loopback-only database, obtains
its test-owned Vault token only in process, enables the existing two cron jobs
at five-second test intervals, and waits for their HTTP callbacks. It verifies:
hourly calendar discovery changes an approved scheduled fixture to finished →
first unrated observation → scoring pending/no result → simulated next due time
with actual synthetic ratings → a second observation → the existing scoring
worker persists 84 points → another unchanged scheduled pull adds no observation
or scoring version. The collector runs before the first scorer tick so that the
strict-rating check measures known appearances, rather than the existing empty
incremental placeholder before any observation. It also checks rejected-evidence
recovery, an expired lease while a scorer is busy, actual cron run records and
operational monitoring. Only test time is accelerated; production cadence/deadlines are not
changed. The harness stops its local schedules afterward and exports a sanitized
JSON report artifact.

Run in a freshly reset, exclusively owned local Supabase test database:

```sh
bun run typecheck:sofascore-collection
bun test supabase/functions/_shared/sofascore-collection.test.ts
# Requires the repository's standard local Supabase database on port 55322.
bun scripts/backend/sofascore-automation-e2e.ts
# Focused isolated CI diagnosis; normal PR checks still run both full suites.
gh workflow run backend-quality.yml --repo mrdata007/botolago-foundation \
  --ref feat/sofascore-readonly-collection -f collection_only=true
```

Do not run the integration harness against a shared local database. It refuses
remote hosts, non-test ports, and a database that already has fixtures. The CI
job owns its runner/database; no production/staging project credentials are
available to this test.

Local execution prerequisite encountered on 19 October: the disposable
`botolago-ratings-e2e` bootstrap failed while extracting
`ghcr.io/supabase/postgres:17.6.1.143` with **no space left on device**. No local
migration or scheduled-path success is claimed from that attempt. CI evidence
must be read separately and recorded on the draft PR; synthetic unit tests and
the historical/live diagnostic audit are not substitutes for a passing scheduled
integration run.

## Review and activation prerequisites (not performed)

1. Review the migration and automation code and a passing isolated scheduled E2E
   report. Confirm the subscription and monthly allocation.
2. Pause/check existing writers through the repository's approved release path.
   Apply the new migration and deploy matching `football-live-refresh` code.
3. Verify the approved current competition/season/fixture/team/player mappings,
   football refresh switch, existing Vault/Edge scheduler token binding, function
   URL, adaptive/rating/staged policies and existing Fantasy worker activation.
4. Only with production approval, the database owner calls
   `app_private.sofascore_collection_configure(true)`. No cron creation or manual
   per-match selection is needed. The existing schedules do the rest.
5. Verify run history, queue, quota and last-success monitoring, then resume the
   paused jobs. Stop by disabling that setting; follow AGENTS.md before any
   database operation. An in-flight transaction retains its lease protection.
