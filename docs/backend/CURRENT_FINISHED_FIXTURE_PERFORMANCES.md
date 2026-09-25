# Current finished-fixture statistics

This manual path handles SportsMonks league 860, current season 28647 (2026/2027),
and only canonical fixtures already marked finished. It neither opens Fantasy
registration nor starts a worker or schedule. Its first live acceptance requires
an actual finished fixture with complete provider statistics; the preseason
roster audit cannot certify that coverage. The scheduled season orchestrator
runs the same code for every pass (`FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`).

`scripts/backend/current-season-performances.ts` reads at most five fixtures per
invocation, using `AFTER_FIXTURE_EXTERNAL_ID` for a subsequent reviewed batch,
or exactly one with `ONLY_FIXTURE_EXTERNAL_ID` (the workflow input
`only_fixture_external_id`, the canary below).
The runner requires an exact reviewed main SHA, first owner workflow dispatch,
the existing production project variables, server secret, provider token, an
evidence directory in `CURRENT_PERFORMANCE_EVIDENCE_DIR`, and one of two typed
confirmations. `DIAGNOSE_CURRENT_FINISHED_PERFORMANCES` is read-only: it lists
the finished fixtures, reads and validates every provider payload exactly as
ingestion would, and never calls the ingestion RPC.
`INGEST_CURRENT_FINISHED_PERFORMANCES` publishes. No scheduled invocation is
accepted by the manual runner.

The provider request is `GET /v3/football/fixtures/{id}` with
`include=lineups.details;state;participants;scores` and the following
detail-type filter:

| ID  | Normalized statistic                             | When SportsMonks leaves it out                       |
| --- | ------------------------------------------------ | ---------------------------------------------------- |
| 52  | Goals                                            | Zero                                                 |
| 57  | Saves                                            | Zero; an explicit null stays null                    |
| 79  | Assists                                          | Zero                                                 |
| 83  | Direct red cards                                 | Zero                                                 |
| 84  | Yellow cards                                     | Zero                                                 |
| 85  | Second-yellow dismissals                         | Zero                                                 |
| 88  | Goals conceded while the player was on the pitch | Zero, then bounded by the final score (below)        |
| 112 | Penalties missed                                 | Zero                                                 |
| 113 | Penalties saved                                  | Zero; an explicit null stays null                    |
| 118 | Provider rating                                  | Null; optional, unused by Fantasy v1 scoring         |
| 119 | Official minutes                                 | Zero for a substitute; a starter without it stops it |
| 324 | Own goals                                        | Zero                                                 |

IDs and meanings are documented in the [statistics definitions](https://docs.sportmonks.com/v3/definitions/types/statistics)
and [player statistic definitions](https://docs.sportmonks.com/v3/definitions/types/statistics/player-statistics).
The [fixture statistics tutorial](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/fixture-statistics)
documents `lineups.details`; the [fixture entities](https://docs.sportmonks.com/v3/endpoints-and-entities/entities/fixture)
document lineup/detail identities.

Every mode sends this one request: a page, the one-fixture canary, the
read-only diagnostic and every orchestrator pass. Without `scores` the payload
carries no final score, and every fixture stops at
`current_final_score_missing` with `field: data.scores` and `valueType:
missing`. A unit test checks the request each mode builds.

SportsMonks sends a statistic only when it is not zero. The season's first
finished match (fixture 19874708) carried goals only on its 3 scorers and
minutes only on the players who came on. So, by owner decision on 2026-09-25,
an absent statistic counts as zero, as last season's import always has. An
explicit null is never zero: a common statistic sent as null stops the fixture.
Absence cannot hide two things, and the importer checks both:

- Every starter must carry minutes played; one without them means the
  statistics are not in yet (`current_starter_minutes_missing`). Minutes sent
  as 0 count as none, here and below.
- A substitute without minutes never came on, so they cannot carry a goal, an
  assist, an own goal, a missed penalty, a save or a saved penalty
  (`current_statistics_inconsistent`).
  Goals conceded are exempt: a substitute who comes on late can carry them
  without minutes, as 23 did last season.

Goals conceded decide clean sheets, and SportsMonks' own figure is not reliable.
Last season, 40 of the 327 goalkeepers who played a whole match for a side that
conceded carried fewer goals conceded than the score says, and 3 matches had
players carrying more. So the final score decides:

- A starter with 90 minutes (where SportsMonks stops counting) was on from
  kick-off to at least the 90th minute, and conceded exactly what the side
  did.
- Anyone else keeps SportsMonks' figure, capped at the side's. Only
  SportsMonks knows when they were on the pitch. That includes a substitute
  who reached 90 minutes after an early goal; 16 did last season.
- One case counts against the player: a starter substituted in stoppage time
  just before a stoppage-time goal is credited that goal. Minutes cannot tell
  that exit apart. Last season at most 11 of the 2,243 such starters on sides
  that conceded looked like it, against 53 who carried no goals conceded at
  all (37 of them goalkeepers). Substitution events would settle it exactly.
- A fixture without exactly one CURRENT score per side stops with
  `current_final_score_missing`.

The database (migration 20260925120000) checks the same against its own final
score. A mismatch is refused with `CURRENT_GOALS_CONCEDED_MISMATCH`: one of the
two scores is not final yet, so the fixture waits for the next run. Coverage
reports `absentStatisticsCountedAsZero` and `goalsConcededFromFinalScore`. Its
`detailRows` must be at least one per player who appeared, each of whom
carries minutes. It no longer needs one per player, since a substitute who
never came on may carry none.

Type 194 describes a team clean-sheet aggregate and is not used as an individual
Fantasy flag. Clean-sheet eligibility is derived from official minutes of at
least 60 and goals conceded, as above, of zero. The coverage record and
source-version digest include that derivation's provenance. Missing
goalkeeper-only statistics count as zero; an explicit null stays null for known
outfield players, and unknown canonical positions and goalkeepers with a null
fail coverage. The scorer must also require these values for a frozen Fantasy
goalkeeper position and restrict goalkeeper awards to goalkeepers.

Every named lineup player must have an existing canonical mapping and a dated
current season team membership. The two fixture participants must reconcile to
exactly 11 starters each. The only exception is that up to 4 unnamed starters
are left out (BG-0011 option B, owner decision 2026-09-25; below): each
participant's named starters plus its unnamed ones make 11. Duplicate lineup
rows are refused, and no row other than an unnamed one is left out. A single
fixture transaction replaces its active facts and writes reconciled coverage
with `scoring_statistics_complete=true`. Existing historical coverage defaults
to false. Unknown players, more than 4 unnamed starters, a starter without
minutes, or a missing final score stop that fixture; the other fixtures of the
page are still certified (next section).

The database computes the source version from the actual normalized payload,
retains old versions as inactive, and rejects stale observations and conflicting
payloads at the same observation time. It locks the fixture `FOR UPDATE`, paired
with the scoring commit's `FOR SHARE` lock and input digest check, so corrections
cannot race a scoring commit. Evidence contains only fixture IDs, counts,
source digests, coverage metadata, and sanitized errors, never full provider
responses or credentials.

## One fixture at a time (since 2026-09-25)

What went wrong: fixture 19874708 (Amal Tiznit 1–3 Ittihad Tanger, finished
24 September) had no statistics the next morning. Every scheduled pass
recorded `performances: {batches: 0, error: "invalid_provider_id"}`: one id,
somewhere in a payload of several hundred, failed validation, and the error
said neither which one nor why. The page was validated as a whole before any
write, so a single malformed fixture would also have held back every other
fixture in its page.

The page is now certified fixture by fixture. That is safe because the write
path already was: `api.ingest_current_player_fixture_performance` is one
PL/pgSQL call per fixture, so its deactivate/insert/coverage writes commit or
roll back together; it computes the source version from the normalized facts,
so the same facts again change nothing but the observation watermark; it
refuses an older observation (`STALE_UPDATE`) and a different payload at the
same observation time (`SOURCE_OBSERVATION_CONFLICT`); it checks goals
conceded against the final score it holds for that one fixture
(`CURRENT_GOALS_CONCEDED_MISMATCH`, migration 20260925120000); and it locks the
fixture against a concurrent scoring commit. Nothing links two fixtures'
writes. Every provider payload of the page is still read and validated before
the first write. The page listing itself (`football_current_performance_fixture_batch`)
remains a contract: a malformed page, or a cursor that does not match it,
stops the batch before any provider request.

A provider outage is not a fixture problem: `provider_access_denied`,
`provider_network_failure`, `provider_retry_after_too_long`, and
`provider_http_429` / `provider_http_5xx`, which the probe throws once its own
three attempts at a 429 or 5xx are spent. After the first, the rest of the
page is reported with the same code and `attempted: false` instead of being
fetched again, and the orchestrator hands the outage to its later pages, which
are listed (so their fixtures are reported) but not fetched. Any other status,
such as a `provider_http_404` for one fixture, is that fixture's problem.

### Which provider ids may be empty

Only one. SportsMonks lists players it has no record of with no `player_id`
on the lineup row (and on that row's details). BG-0011 measured this in 64 of
240 fixtures of season 26027 (`G7_HISTORICAL_PERFORMANCE_BACKFILL_RUNBOOK.md`);
fixture 19874708 has 3 unnamed starters and 4 other unnamed rows.

Owner decision 2026-09-25 (migration `20260925110000`, applied to production
that day, `docs/production/APPLIED_2026_09_25_CURRENT_PERFORMANCE_UNNAMED_STARTERS.md`):
this season follows last season's rule, BG-0011 option B. Up to 4 of the 22
starters may be unnamed. Unnamed rows are left out, credited to no one and
never counted as zero; every named player is scored as usual. More than 4
and the fixture waits with `current_lineup_unidentified_starters_exceeded`.

Either way every unnamed row is reported, never silently dropped: on an
accepted fixture as `unnamedRows[]` next to it in `fixtures[]` (evidence only;
it is not part of the coverage the database digests), on a refused one in the
diagnostic's `rows[]` with `unidentifiedStarters` and `unidentifiedOthers`.
Each row gives its field path (`data.lineups[14].player_id`), `null` or
`missing`, starter or substitute, the club, and the official minutes when the
provider sent them.

Every other id this path reads (fixture, season, league, state, participants,
lineup row, team, the details' fixture/lineup/player/team/type) is always
present in a real payload. An empty or malformed one fails
`invalid_provider_id` with its field path and value type; a present but
malformed lineup `player_id` (a string, say) is that, not an unnamed player.
This include set (`lineups.details;state;participants;scores`) returns no
coach rows, so no coach id is read. The score rows are read for their
description, side and goals only; one that is not an object fails
`invalid_provider_object` at its path (`data.scores[3].score`).

### Reading a failure

Each fixture that was not certified appears once in `incomplete[]` of
`current-season-performances.json` (manual runs) and in
`performances.incomplete[]` of `fantasy-season-orchestrator.json` (scheduled
runs):

| Field               | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixtureExternalId` | SportsMonks fixture id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `kickoffAt`         | From the database listing, the only time it gives: no final whistle, and no word on whether the fixture is already certified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `stage`             | `provider` (the request), `validation` (the payload), `database` (the ingestion RPC).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `code`              | Stable code, e.g. `invalid_provider_id`, `invalid_provider_object`, `lineup_identity_mismatch`, `detail_identity_mismatch`, `duplicate_provider_detail`, `invalid_provider_detail`, `current_final_score_missing`, `current_starter_minutes_missing`, `current_statistics_inconsistent`, `current_lineup_unidentified_starters_exceeded`, `current_starters_incomplete`, `current_statistics_incomplete`, `historical_fixture_coverage_incomplete`, `current_performance_rpc_failed`.                                                                                                          |
| `diagnostic`        | `field` (for example `data.lineups[12].player_id`, or `data.lineups[5].details[12]` with `typeId` for a duplicate) and `valueType` (`null`, `missing`, `array`, `string`, `numeric_string`, `fractional_number`, `non_positive_number`, `unsafe_integer`, ...); or `reason`, the database's own code (`PLAYER_MAPPING_NOT_FOUND`, `PLAYER_MEMBERSHIP_NOT_FOUND`, `CURRENT_GOALS_CONCEDED_MISMATCH`, `CURRENT_PERFORMANCE_INCOMPLETE`, ...), with `sqlState`; or counts (`starterRows`, `substituteRowsWithoutMinutes`); or the unnamed rows; or the shared normalizer's counts and `failures`. |
| `attempted`         | `false` only when a provider outage earlier in the pass meant it was not fetched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

The value itself never appears: a type and a path are enough to repair a
contract, and the value could be anything the provider sent. Free-form
database messages are dropped; only upper-case codes defined in our
migrations are kept.

The orchestrator adds `hoursSinceFinalWhistle`, counted from kickoff + 2 h
(`finalWhistleSource: kickoff_plus_estimate`, or `unknown` without a
kickoff), and `overdue`. A fixture past `FANTASY_COVERAGE_ESCALATE_HOURS`
(default 6; a value other than a whole number from 1 to 168 is reported in
`invalidSettings` and 6 is used) escalates the pass: exit 1, and the
`ops-alert` issue opens with category `performance_coverage_overdue`. A
fixture whose age cannot be computed counts as overdue. The issue closes on
the next green run. The watchdog's `season_orchestrator` row fails on that
red run too, and its `fantasy_points` row fails on its own once the gameweek
is past its window without points (`FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`).

A provider outage never escalates on its own. The listing names every finished
fixture whose gameweek is not final, certified or not, and does not say which
are certified; no read-only API does per fixture. A fixture the outage kept
the pass from reading carries `waitingOn: "provider_outage"`, is never
`overdue`, and leaves the pass `waiting`; `performances.providerOutage` names
the code. The database's `fantasy_fixture_coverage` check, which reads real
coverage, warns for a counted match still without certified statistics 6 h
after its final whistle and fails (pages) at 12 h, outage or not, wherever
migration 20260926003400 is applied (until then, the watchdog's `fantasy_points` row pages later, once
the gameweek is past its window without points). A fixture that was read and
not certified still ages and escalates, even one certified by an earlier pass
(a provider correction the database refuses, for instance): the listing cannot
tell the two apart.

When the listing itself fails (a database error, or a malformed page at
`batch.items[2]`), the pass waits: `performances.error` names the code and
`performances.diagnostic` the field path and value type. One failed read is
not an incident; if the listing keeps failing, the database's coverage check
and the watchdog's `fantasy_points` page once statistics or points go
missing.

The manual run exits 1 unless every listed fixture was certified (or, in
diagnose mode, would be): `pass` and `no_finished_fixtures` are the only green
verdicts.

## Recovery procedure (owner)

Follow [AGENTS.md](../../AGENTS.md#one-writer-at-a-time-per-database) before
step 3: one writer per database. The manual workflow shares the production
mutation concurrency group with the orchestrator, so GitHub runs them one at a
time; pg_cron jobs and other lanes are not covered by that and must be checked.

1. **Read-only provider diagnostic.** Dispatch _Ingest current finished
   Football performances_ on the reviewed main commit with
   `DIAGNOSE_CURRENT_FINISHED_PERFORMANCES` (empty cursor for the first page).
   It writes nothing. The evidence lists each fixture that validates, with its
   lineup as provider ids (`fixtures[].lineup`: player, team, starter), and
   each one that does not, with its reason (table above). The latest
   orchestrator artifact carries the same `incomplete[]` with ages.
2. **Repair, by reason.** Never by editing facts, and never by inventing an
   identity.
   - `invalid_provider_id` / `invalid_provider_object` at a path: the payload
     broke the contract there. Compare with the SportsMonks fixture entity
     documentation (linked above). If the provider now sends a different type
     for a real id, that is a reviewed code change; an empty id other than a
     lineup `player_id` is a provider defect to report to SportsMonks.
   - `current_lineup_unidentified_starters_exceeded`: more than 4 starters
     have no identity at SportsMonks. Ask SportsMonks to complete the lineup
     and rerun step 1 until at most 4 starters are unnamed. Going beyond the
     owner's limit of 4 is a new owner decision and a database change (the
     ingestion RPC and the scoring check both enforce it), never a manual
     edit. `current_starters_incomplete` names the club whose named and
     unnamed starters do not make 11.
   - `PLAYER_MAPPING_NOT_FOUND` / `PLAYER_MEMBERSHIP_NOT_FOUND` (`reason`,
     database stage): a named player is not in this season's list at the club
     they played for. On 2026-09-25 that is the list itself: it is last
     season's, and the first match alone had 18 players it could not place
     ([APPLIED_2026_09_25_CURRENT_PERFORMANCE_ABSENT_AS_ZERO.md](../production/APPLIED_2026_09_25_CURRENT_PERFORMANCE_ABSENT_AS_ZERO.md)).
     The regular squad import cannot correct it once the Fantasy catalog is
     staged (`fantasy_catalog_already_staged`), and correcting it changes what
     Fantasy offers, so it is the owner's decision. Find the rows read-only
     (ids from step 1); never add a mapping or membership by hand:

     ```sql
     with lineup(external_player_id, external_team_id) as (
       values ('<player id>', '<team id>')  -- one row per lineup entry from step 1
     )
     select l.external_player_id,
       pm.internal_entity_id is not null as player_mapped,
       exists (select 1 from app.team_memberships tm
         join app_private.football_provider_mappings tmap
           on tmap.provider_name = 'sportsmonks' and tmap.entity_type = 'team'
           and tmap.external_id = l.external_team_id and tmap.active
           and tmap.internal_entity_id = tm.team_id
         where tm.player_id = pm.internal_entity_id
           and tm.season_id in (select id from app.seasons where is_current)
           and tm.valid_from <= current_date
           and (tm.valid_to is null or tm.valid_to >= current_date)) as member
     from lineup l
     left join app_private.football_provider_mappings pm
       on pm.provider_name = 'sportsmonks' and pm.entity_type = 'player'
       and pm.external_id = l.external_player_id and pm.active
     order by 2, 3, 1;
     ```

     (Membership is checked on the fixture's date by the RPC; replace
     `current_date` with it when the squad changed since.)

   - `current_starter_minutes_missing`: a starter carries no minutes played,
     so SportsMonks' statistics for the match are not in yet. Rerun step 1
     later; there is nothing to repair. An absent statistic otherwise counts
     as zero (owner decision 2026-09-25, above).
   - `current_statistics_inconsistent`: a substitute without minutes carries
     a goal, an assist, an own goal, a missed penalty, a save or a saved
     penalty. SportsMonks' statistics are wrong, not zero: the fixture waits
     for SportsMonks to correct them (rerun step 1). Never type statistics in.
   - `current_final_score_missing`: not exactly one CURRENT score per side.
     `field: data.scores` with `valueType: missing` means the payload has no
     `scores` at all, which is what a request without `scores` in its include
     gets: check the include above first. Otherwise SportsMonks' payload
     lacks the score; the fixture waits, and a lasting gap is SportsMonks' to
     fix.
   - `CURRENT_GOALS_CONCEDED_MISMATCH` (`reason`, database stage):
     SportsMonks' final score and the one BotolaGO holds disagree, so one of
     them is not final yet. The fixture waits and the next run tries again.
   - `current_statistics_incomplete` at `data.lineups[i].details`: that row's
     statistics were neither a list nor absent (`valueType` says what they
     were), a broken contract as for `invalid_provider_object`.

3. **Serialized canary.** When step 1 shows the fixture validating and step 2
   left no mapping gap, dispatch the same workflow with
   `INGEST_CURRENT_FINISHED_PERFORMANCES`, an empty cursor and
   `only_fixture_external_id` set to that fixture. Only that fixture is
   fetched and written; the rest of its page is not touched, and a fixture
   that is not listed (not finished, not current, or its gameweek already
   final) is refused with `canary_fixture_not_listed` before any fetch.
   Without `only_fixture_external_id` the canary is the whole page: every
   fixture in it that validates is published. Confirm the fixture is in
   `fixtures[]` with `players` and a `sportsmonks-current-fixture:`
   `sourceVersion` (and its `unnamedRows`, if any), and not in `incomplete[]`.
4. **Reconcile** (read-only):

   ```sql
   select f.id, c.scoring_statistics_complete, c.performance_rows, c.source_version,
     (select count(*) from app.player_fixture_performances p
       where p.fixture_id = f.id and p.active) as active_rows
   from app_private.football_provider_mappings m
   join app.fixtures f on f.id = m.internal_entity_id
   left join app_private.historical_performance_fixture_coverage c on c.fixture_id = f.id
   where m.provider_name = 'sportsmonks' and m.entity_type = 'fixture'
     and m.external_id = '<fixture id>';
   ```

   `active_rows` must equal `performance_rows` and the evidence's `players`,
   and `source_version` must equal the evidence. Points follow only when the
   whole gameweek is final: the orchestrator then moves it to `provisional`,
   seals `app_private.fantasy_scoring_snapshots` and writes
   `app.fantasy_player_gameweek_points` and
   `app.fantasy_team_gameweek_results`. A fixture with statistics and a
   gameweek still `live` is expected until its last match is final.

5. **Score it.** Once the canary is green, dispatch _Fantasy season
   orchestrator_ on `main` (type `RUN_FANTASY_ORCHESTRATOR`): only its worker
   scores and finalizes a gameweek, and GitHub has started the hourly
   schedule up to 6.3 h late. It shares the canary's concurrency group, so it
   waits for it. Otherwise the database's `fantasy_scoring` check warns an
   hour after the certification and pages 8 h after it
   ([FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md](FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md)).
6. **Idempotent rerun.** Dispatch step 3 again, or let the next orchestrator
   pass run. The fixture must come back with the same `sourceVersion` and the
   query in step 4 must return the same row counts: identical facts only
   advance the observation watermark.
