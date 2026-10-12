# SofaScore-only Fantasy scoring

Status: code only, nothing applied or run on production. The manual runner described below is
now the backfill and override tool; the normal path is automatic (see
"Automatic path"). Owner decisions of 2026-10-11:

- **M6**: SportsMonks is unpaid. Fantasy player points come from SofaScore
  alone. No second provider, no cross-check, no pairing. Flashscore is not
  used anywhere in this path (code, migration, workflows).
- **M8**: minutes, started, goals, own goals, cards, clean sheet and goals
  conceded always count. Assists, saves, penalties saved and penalties missed
  are scored from SofaScore **when available**: on a full-coverage match (the
  player statistics carry `totalPass`) they count and the fixture can reach
  FULL mode. On a limited-coverage match they are UNKNOWN, never written as
  zero, and the fixture scores in SIMPLE mode. An assist may also come from an
  incident's `assist1` where present. One named switch,
  `SOFASCORE_DETAIL_FIELDS_ENABLED` in `src/backend/fantasy/sofascore-fantasy.ts`,
  is ON.

The Fantasy ruleset, the scoring worker, the recorder and the gameweek
lifecycle are unchanged.

## Landing path: A (adaptive observations)

Chosen: **A, a SofaScore-only wrapper in front of the existing adaptive
recorder.** B (a SofaScore variant of the legacy current-performance ingest) is
rejected.

Evidence:

- `api.ingest_current_player_fixture_performance`
  (`20261004120000_current_fixture_left_out_players.sql:158`) is hard-coded to
  provider `sportsmonks`, season `28647`, and its coverage source version must
  match `^sportsmonks-current-fixture:` (`:65`, `:94`). It writes
  `assists` and `saves` into the player performance row (`:442-450`) and
  requires them in its field loops (`:253-258`). A SofaScore variant would write
  those columns as plain numbers with no per-field "unknown", so a limited
  match could not leave them unknown, and it would need a new ruleset or new
  scoring changes to leave them out. That cannot be done "without changing the
  ruleset", so B is out.
- Path A already has the per-field model M8 needs. The recorder
  (`api.service_record_fantasy_observation`, `20260927094823` / `20261003180000`)
  takes per-field evidence in state `verified` or `unknown`, computes
  `full_ready` and `simple_ready`, and the scoring worker scores each category
  only if its fields are certified. Simple mode drops `assist`, `saves`,
  `penalty_save`, `penalty_miss` in the worker
  (`20260927094823_adaptive_fantasy_scoring.sql:350`;
  `adaptive-scoring.ts:26,133`). An unknown field is simply absent, never zero.
- Fewest production steps: one new function, one migration, no change to the
  recorder, the ruleset or existing data.

### What is new

| File                                                                                                          | What                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261011120000_sofascore_fantasy_observations.sql`                                       | `api.service_record_sofascore_fantasy_observation(fixture, request, dry_run)`, service role only                                                           |
| `supabase/functions/_shared/sofascore-fantasy.ts` (re-exported by `src/backend/fantasy/sofascore-fantasy.ts`) | pure builder: one SofaScore match + reviewed SofaScore mappings -> request, blockers, mapping worklist; one copy, used by the Edge Function and the runner |
| `supabase/functions/_shared/sofascore-fantasy-auto.ts`                                                        | the automatic step in the Edge Function                                                                                                                    |
| `supabase/migrations/20261011140000_sofascore_fantasy_auto_state.sql`                                         | attempts table and three service-role functions (state, note, due); no scoring                                                                             |
| `scripts/backend/sofascore-fantasy-simple-lib.ts`                                                             | selection, report, plan hash, SQL text (pure)                                                                                                              |
| `scripts/backend/sofascore-fantasy-simple-ingest.ts`                                                          | runner: `report` (read only), `rehearse`, `apply`                                                                                                          |
| `.github/workflows/sofascore-fantasy-simple-{read,rehearsal,apply}.yml`                                       | owner-pinned production workflows                                                                                                                          |
| `supabase/tests/database/sofascore_fantasy_observations.test.sql`                                             | pgTAP                                                                                                                                                      |

The migration depends on `20261003180000_reconciled_provider_observations.sql`
(the recorder's `provider-reconciled` source and flag, and
`app_private.football_provider_fixture_links`) and refuses to apply without it.
Observations are stored under that existing source label; the evidence says
`sofascore` and the request carries only `sofascoreEventId`.

### What the database function checks

Beyond everything the recorder already checks (finished and finalized fixture,
adaptive policy enabled for the gameweek, gameweek not finalizing, score equals
the fixture's, 11 starters a side, team membership, no reviewed correction
overridden, retries dedupe by digest):

- the fixture is the one an **active SofaScore fixture mapping** names for that
  event id;
- every player's SofaScore id is an active, **reviewed** SofaScore player
  mapping to exactly the app player the row names;
- evidence is `sofascore` and `verified` or `unknown` only: estimates and any
  other source are refused;
- on a `limited` request `saves`, `penaltiesSaved` and `penaltiesMissed` can
  never be a fact or carry a value (an assist can, only when an incident names
  the assister). So a limited match can never reach full mode;
- one SofaScore match per fixture and one fixture per match;
- the squad members of the two teams who are not in the rows are derived by the
  database as verified non-participants (the caller cannot supply them). The
  builder sends a row for everyone SofaScore says appeared, and refuses the
  match otherwise, so absence from the rows means absence from the pitch.

### How the builder reads SofaScore

- **Identity**: reviewed SofaScore mappings only. An appearing player (starter
  or substitution incident `playerIn`) with no mapping **holds the whole match
  back** (`unmapped_players`) and goes on the worklist (SofaScore id, side, shirt
  number, started, position; never a name). An unmapped bench player who never
  came on is ignored.
- **Unknown substitutes** (migration `20261011190000`): the one exception to the
  rule above. A player the app has no record of cannot be in a Fantasy team and
  cannot earn points, yet used to hold the match for everyone. A **substitute**
  (never a starter: the recorder needs eleven starters a side) who has no goal,
  own goal, penalty missed, assist (named by an incident or counted in the lineup
  statistics) and no card, and who appears in no incident except his own
  substitution, is left out of the rows and listed in the request
  (`squadCompleteExceptExcluded: true`, `excludedUnmappedPlayers`: SofaScore id,
  side, shirt, position, reason `no_candidate`; no name). The list is kept in the
  stored observation and its digest. The database accepts it only after
  confirming, for each player: no mapping exists for his id; the auto-mapping
  queue holds him open as `no_candidate` for that club; and no still-unmapped
  squad member of that club could be him (same shirt number, or no shirt number
  on file and a compatible position), because squad members missing from the rows
  are recorded as not having played. Otherwise it refuses with
  `sofascore_unmapped_exclusion_refused` and the match stays held (retried like
  any hold). The players he replaced keep exact minutes (their exit comes from
  the substitution incident and is still checked against SofaScore's minutes),
  and goals conceded and the clean sheet come from the incidents, so they do not
  depend on who is in the rows. An unknown scorer, assister, carded player or
  starter still holds the match.

  Since migration `20261013150000` the auto-mapping decides by side, shirt number
  and position, never by name, and links only after the same pairing is seen in
  two matches. So a player the app does know, but whom the matcher has seen once,
  is queued as `awaiting_second_match` (not `no_candidate`) and **holds** the
  match, starter or substitute, until a second match links him or staff confirm
  the pre-filled candidate. `no_candidate` (nobody in the squad wears that number)
  is still the only reason that lets a substitute with nothing at stake be left
  out; a player with no shirt number (`no_shirt`) is never left out. When a link
  is made, the club's held matches are tried again on the next tick.

- **Goals** come from incidents, never lineup statistics (they undercount). Each
  side's goal incidents must equal the final score.
- **Minutes, clean sheet, goals conceded**: from substitution and dismissal
  incidents (`deriveParticipation`), checked against `minutesPlayed` with the
  documented tolerance (SofaScore may run up to 6 over and 2 under). A player
  who does not fit holds the match back (`minutes_mismatch`,
  `timeline_unresolved`).
- **Held for review, never guessed**: an unknown score-relevant incident label
  (an own goal has never been seen), a lineup `ownGoals` no incident explains, a
  second yellow card (whether the first yellow is also listed is unestablished,
  and the recorder refuses an overlap), an incident naming a player not in the
  lineup.
- **Detail fields (M8)**, full coverage: assists when the lineup statistic and
  the incidents agree (else unknown); penalties missed when the incidents and
  the lineup statistic agree; a goalkeeper's saves from SofaScore's count when
  saves + goals conceded equals shots on target faced (else unknown);
  penalties saved are 0 only when no penalty was missed against his team (else
  unknown, because a miss may have been a save). Limited coverage: unknown, but
  an assister named by an incident gets that count.

The plan hash ignores observation timestamps, so it is stable between a report,
a rehearsal and the apply, and changes if SofaScore's data, the mappings or the
selection change.

## Automatic path (Edge Function `football-live-refresh`)

After every finished match the points no longer wait for the owner. The Edge
Function already fetches the match's SofaScore incidents, lineups and
statistics (3 requests, for the match page). It now builds the Fantasy request
from those same replies and records it with
`api.service_record_sofascore_fantasy_observation`. Nothing extra is requested
from SofaScore for a match whose details were fetched. Code:
`supabase/functions/_shared/sofascore-fantasy-auto.ts`, called from
`sofascore-match-details.ts` (live tick, backfill) and `sofascore-live-refresh.ts`.

### What happens, per finished match

1. The scores are written, then the match details, as before. Fantasy runs
   last and can never hold back either: it does not throw, and a failure is one
   log line.
2. It reads the fixture's state from the database
   (`api.service_sofascore_fantasy_context`): finished and finalized, the
   gameweek, whether adaptive scoring is on for it, whether an observation
   already exists, the stored attempt, and the reviewed SofaScore mappings of the
   players in the lineup.
3. If an appearing player has no reviewed mapping, it offers the unmapped
   players to `api.service_sofascore_auto_map_players(fixture, players)`
   (migration `20261011130000`, `SOFASCORE_PLAYER_MATCHING.md`) and reads the
   mappings again. If that function is not installed
   (error `PGRST202` / `42883`) it carries on without it. The short name is sent
   as null: the parsed lineup does not keep it.
4. It runs the same builder as the manual runner. Ready: the observation is
   recorded (`dry_run => false`). Blocked: the match is held, with the reason.
5. Every match ends in one log line, `football_live_refresh_fantasy`, with an
   outcome: `recorded`, `held:<blocker>`, `skipped:<reason>` or `error:<code>`
   (blockers are the builder's codes, for example `unmapped_players`, plus the
   database's refusals, for example `held:sofascore_identity_not_reviewed`). The
   tick's answer carries a `fantasy` summary.

### Switches

| Switch                                                   | Effect                                                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_private.football_data_source()` is `sofascore`      | Records for real.                                                                                                                                                             |
| `shadow`                                                 | Dry run only: the database function is called with `dry_run => true`, the result is logged, nothing is written, the auto-mapping is not called, nothing is stored or retried. |
| `sportsmonks`                                            | Nothing happens (this path does not run).                                                                                                                                     |
| `SOFASCORE_FANTASY_ENABLED=false` (Edge secret)          | Whole Fantasy step off, without a deploy.                                                                                                                                     |
| `SOFASCORE_FANTASY_RETRIES_PER_TICK` (default 6, max 20) | Held matches retried per tick from stored replies (0 = none). No SofaScore request.                                                                                           |
| `SOFASCORE_FANTASY_CATCHUP_PER_TICK` (default 1, max 4)  | Finished matches never attempted that a tick may fetch itself (3 requests each; 0 = none).                                                                                    |
| `SOFASCORE_FANTASY_CATCHUP_HOURS` (default 72)           | How far back "never attempted" looks.                                                                                                                                         |
| `SOFASCORE_FANTASY_MAX_ATTEMPTS` (default 24)            | Attempts per held match before it is given up.                                                                                                                                |
| `SOFASCORE_FANTASY_FETCH_ATTEMPTS` (default 4)           | Attempts for a match that has no stored replies (a fetch each time).                                                                                                          |

It also needs adaptive scoring active for the gameweek
(`app_private.fantasy_adaptive_policy`); without it the match is held as
`held:adaptive_policy_not_enabled` and tried again once the owner activates it.

### Retries, and why they do not cost requests

Stored match details cannot rebuild an observation: they keep no per-player
minutes played, assists, saves or full/limited coverage marker, which the
builder needs. So a held match keeps its trimmed parsed replies (lineups with
statistics, incidents, whole-match statistic lines) in
`app_private.sofascore_fantasy_attempts` (migration `20261011140000`). A later
tick re-reads them, reads the mappings again and builds again: no SofaScore
request.

- Wait between tries: 15 minutes (first 3 tries), 1 hour (to the 12th), then 6
  hours. Default limit 24 tries, about 3.5 days. Then the match is given up and
  needs the manual runner.
- Only a match held for `unmapped_players`, or for a database condition that can
  change (policy not enabled, identity not reviewed, score mismatch, membership
  missing), is kept for retries. A data problem the same replies cannot fix (an
  unknown incident, goals that do not add up, a second yellow, minutes that do
  not fit) is given up at once; the 2-hour refresh window after the final
  whistle fetches fresh replies and can reopen it.
- A gameweek that is finalizing or sealed ends the attempts.
- A finished match that was never attempted (the migration or the function was
  late, a tick failed) is fetched by the catch-up, at most
  `SOFASCORE_FANTASY_CATCHUP_PER_TICK` per tick, and given up after
  `SOFASCORE_FANTASY_FETCH_ATTEMPTS` failed tries.
- Once an observation exists for a fixture (by any route) the automatic path
  leaves it alone. A later correction is the manual runner's job
  (`--include-observed`).

### Request cost

Normal round: 0 extra requests (the details fetch is the same one). Worst case a
tick adds `SOFASCORE_FANTASY_CATCHUP_PER_TICK x 3` (default 3), and only while a
finished, finalized, unobserved match from the last 72 hours has no stored
replies. For scale: a Botola round of 8 matches fetched once each is 24
requests; the budget is 10,000 a month
(docs/backend/SOFASCORE_FULL_MIGRATION_PLAN.md, section 4). The post-final
details refresh of the live tick (2 hours, up to 4 matches per tick) is the
existing one and is the larger consumer; Fantasy rides on it.

### After the observation: who scores and finalizes

The observation is only a fact. Points and finalization are done by the Fantasy
lifecycle worker (`scripts/backend/fantasy-lifecycle-runner.ts`), which selects
the scoring mode, scores each fixture from the observations, persists the
results and rankings and finalizes the gameweek. Today that worker runs from the
GitHub Action `fantasy-season-orchestrator.yml` (hourly, minute 12) or
`fantasy-manual-worker.yml`. The database tick `fantasy-lifecycle-tick` (every 5
minutes) only locks, goes live and moves to provisional. Switches that must be
on in production:

- `app_private.fantasy_adaptive_policy`: a row for the season with
  `from_gameweek` at or below the gameweek (`api.service_activate_adaptive_scoring`
  after `api.service_adaptive_scoring_audit`). Without it nothing is recorded.
- `app_private.fantasy_automation_settings.lifecycle_tick_enabled`
  (`select app_private.fantasy_automation_configure(true)`), for the 5-minute tick.
- The GitHub repository variable `FANTASY_AUTOMATION_ENABLED=true` for the
  scheduled orchestrator run.
- `app_private.football_data_source()` is `sofascore`, and
  `football_live_refresh_enabled` in `app_private.notification_email_settings`
  (the live tick that runs this code).
- Edge secret `RAPIDAPI_KEY`; migrations `20261011120000` and `20261011140000`
  applied (without the second, the automatic path stands down with
  `skipped:state_function_missing` and records nothing; `20261011130000`, the
  automatic player matching, is optional: without it unmapped players hold their
  match back until they are reviewed by hand); the Edge Function
  `football-live-refresh` deployed.

The orchestrator workflow no longer needs SportsMonks while the data source is
`sofascore`: it skips the SportsMonks refresh and performance ingestion and does
not need `SPORTSMONKS_API_TOKEN` (`SOFASCORE_ORCHESTRATOR.md`). The owner's
step-by-step for all these switches is
`docs/production/SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md`.

## What the owner must run, in order (manual backfill and override)

Use this for rounds played before the automatic path, for a match the automatic
path gave up on, and to correct an observed fixture.

Nothing below has been run. Production writes are owner-run only.

1. **Check the prerequisite migration**:
   `select version from supabase_migrations.schema_migrations where version in ('20261003180000','20260927094823');`
   If `20261003180000` is missing, apply it first through its guarded script
   `scripts/backend/apply-20261003180000-reconciled-provider-observations.sql`.
2. **Apply `20261011120000`** through the reviewed migration path
   (`docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`). It adds one
   function and changes no data.
3. **Check adaptive scoring is activated for the gameweek**
   (`app_private.fantasy_adaptive_policy` has a row for the season with
   `from_gameweek <= 3`; if not, activate with
   `api.service_activate_adaptive_scoring` after `api.service_adaptive_scoring_audit`).
   The write refuses with `adaptive_policy_not_enabled` otherwise, and once the
   gameweek is `finalizing` the mode is locked. The report below shows each
   fixture's state.
4. **Run the read-only report** (workflow `SofaScore Fantasy simple ingestion
(production, read only report)`, round 3). It lists fixtures ready (and in
   which mode), fixtures held back with reasons, the number of players that would
   be scored, and the **unmapped-player worklist**. It does not call the database
   function.
5. **Review the unmapped players** through the reviewed mapping flow until the
   fixtures you want are ready. Each unmapped appearing player holds a fixture
   back. Re-run the report.
6. **Pause the writers** (AGENTS.md "One writer at a time"): the email/results
   and season refresh with `app_private.notification_email_configure('off', null, null, false)`,
   the Fantasy tick with `app_private.fantasy_automation_configure(false)`, and
   the other jobs listed there that touch fixtures or Fantasy tables. The
   workflows refuse unless the live refresh, email mode and lifecycle tick are
   off, and no other run is active.
7. **Rehearse** (workflow `...rehearsal`, confirmation
   `REHEARSE_SOFASCORE_FANTASY_PRODUCTION`, round 3). One DO block calls the
   function for every ready fixture and ends in a deliberate raise carrying the
   result out; it then re-reads and proves the rollback held. It prints the plan
   sha256.
8. **Apply** (workflow `...apply`, confirmation
   `APPLY_SOFASCORE_FANTASY_PRODUCTION`, the approved `plan_sha256`). It
   re-fetches, refuses if the plan hash changed, writes once, never retries, and
   verifies from a fresh read.
9. **Restore the writers** you paused. The Fantasy tick then turns the
   observations into points as it does for every source.

A write run takes at most 12 fixtures and needs a round.

## Risks

- Fixtures with unmapped appearing players are held back entirely until mapped;
  with ~191 reviewed player mappings many fixtures will be blocked at first.
  The worklist is the review queue.
- Fixtures with an own goal or a second yellow are held for review: no incident
  label for an own goal has been observed, so it is not guessed.
- Penalty saves are unknown whenever a penalty was missed against a team, so
  such fixtures score in simple mode.
- Observation source label is `provider-reconciled` (the recorder's existing
  provider source); the evidence, request and links identify SofaScore.
- The pgTAP test was written but could not be run here (no Docker daemon); CI's
  `database-quality` job is the authority.
- SofaScore is a single source: nothing cross-checks it. The internal checks
  (goals add up to the score, minutes vs substitutions, saves + conceded vs shots
  on target, lineup vs incident assists) are the only guards.
