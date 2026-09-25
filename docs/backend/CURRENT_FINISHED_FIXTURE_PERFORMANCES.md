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
`include=lineups.details;state;participants` and the following detail-type filter:

| ID  | Normalized statistic                             | Missing representation                               |
| --- | ------------------------------------------------ | ---------------------------------------------------- |
| 52  | Goals                                            | Reject incomplete coverage                           |
| 57  | Saves                                            | Null; SQL requires a value for canonical goalkeepers |
| 79  | Assists                                          | Reject incomplete coverage                           |
| 83  | Direct red cards                                 | Reject incomplete coverage                           |
| 84  | Yellow cards                                     | Reject incomplete coverage                           |
| 85  | Second-yellow dismissals                         | Reject incomplete coverage                           |
| 88  | Goals conceded while the player was on the pitch | Reject incomplete coverage                           |
| 112 | Penalties missed                                 | Reject incomplete coverage                           |
| 113 | Penalties saved                                  | Null; SQL requires a value for canonical goalkeepers |
| 118 | Provider rating                                  | Optional, unused by Fantasy v1 scoring               |
| 119 | Official minutes                                 | Reject incomplete coverage                           |
| 324 | Own goals                                        | Reject incomplete coverage                           |

IDs and meanings are documented in the [statistics definitions](https://docs.sportmonks.com/v3/definitions/types/statistics)
and [player statistic definitions](https://docs.sportmonks.com/v3/definitions/types/statistics/player-statistics).
The [fixture statistics tutorial](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/fixture-statistics)
documents `lineups.details`; the [fixture entities](https://docs.sportmonks.com/v3/endpoints-and-entities/entities/fixture)
document lineup/detail identities. The [API FAQ](https://docs.sportmonks.com/v3/api-faq)
does not guarantee that an omitted statistic means zero. Explicit numeric zero is
accepted; missing or null common statistics cannot become zero-valued facts.

Type 194 describes a team clean-sheet aggregate and is not used as an individual
Fantasy flag. Clean-sheet eligibility is derived from explicit official minutes
of at least 60 and explicit on-pitch goals conceded of zero. The coverage record
and source-version digest include that derivation's provenance. Missing
goalkeeper-only statistics remain null for known outfield players; unknown
canonical positions and goalkeepers without those values fail coverage. The
scorer must also require these values for a frozen Fantasy goalkeeper position
and restrict goalkeeper awards to goalkeepers.

Every named lineup player must have an existing canonical mapping and a dated
current season team membership. Each participant's named starters plus its
unnamed ones (below) must make exactly 11, with no duplicate lineup rows and
no excluded row other than an unnamed one. A single fixture transaction
replaces its active facts and writes reconciled coverage with
`scoring_statistics_complete=true`. Existing historical coverage defaults to
false. Unmapped players, more than 4 unnamed starters or incomplete statistics
stop that fixture: they cannot certify that an absent player did not
participate. Other fixtures in the same page are still certified (next
section).

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
same observation time (`SOURCE_OBSERVATION_CONFLICT`); and it locks the
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
are listed (so their fixtures are aged) but not fetched. Any other status,
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
This include set returns no coach rows (`lineups.details;state;participants`),
so no coach id is read.

### Reading a failure

Each fixture that was not certified appears once in `incomplete[]` of
`current-season-performances.json` (manual runs) and in
`performances.incomplete[]` of `fantasy-season-orchestrator.json` (scheduled
runs):

| Field               | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixtureExternalId` | SportsMonks fixture id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `kickoffAt`         | From the database listing; `finalizedAt` too once the listing provides it.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `stage`             | `provider` (the request), `validation` (the payload), `database` (the ingestion RPC).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `code`              | Stable code, e.g. `invalid_provider_id`, `invalid_provider_object`, `lineup_identity_mismatch`, `detail_identity_mismatch`, `duplicate_provider_detail`, `current_lineup_unidentified_starters_exceeded`, `current_starters_incomplete`, `current_statistics_incomplete`, `historical_fixture_coverage_incomplete`, `current_performance_rpc_failed`.                                                                                                                                                 |
| `diagnostic`        | `field` (for example `data.lineups[12].player_id`, or `data.lineups[5].details[12]` with `typeId` for a duplicate) and `valueType` (`null`, `missing`, `array`, `string`, `numeric_string`, `fractional_number`, `non_positive_number`, `unsafe_integer`, ...); or `databaseCode` (`PLAYER_MAPPING_NOT_FOUND`, `PLAYER_MEMBERSHIP_NOT_FOUND`, `CURRENT_PERFORMANCE_INCOMPLETE`, ...) with `sqlState`; or `missingDetailTypes`; or the unnamed rows; or the shared normalizer's counts and `failures`. |
| `attempted`         | `false` only when a provider outage earlier in the pass meant it was not fetched.                                                                                                                                                                                                                                                                                                                                                                                                                     |

The value itself never appears: a type and a path are enough to repair a
contract, and the value could be anything the provider sent. Free-form
database messages are dropped; only upper-case codes defined in our
migrations are kept.

The orchestrator adds `hoursSinceFinalWhistle` (from `finalizedAt`, otherwise
kickoff + 2 h, `finalWhistleSource` says which) and `overdue`. A fixture past
`FANTASY_COVERAGE_ESCALATE_HOURS` (default 6) escalates the pass: exit 1, the
`ops-alert` issue opens with category `performance_coverage_overdue`, and it
stays open until the fixture is certified. A fixture whose age cannot be
computed counts as overdue. The watchdog's `season_orchestrator` row fails on
that red run too, and its `fantasy_points` row fails on its own once the
gameweek is past its window without points
(`FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`).

When the listing itself fails (a malformed page, `batch.items[2]`), the pass
fails and `performances.diagnostic` carries the field path and value type.

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
   - `PLAYER_MAPPING_NOT_FOUND` / `PLAYER_MEMBERSHIP_NOT_FOUND`: find the rows
     (read-only, ids from step 1), then add the mapping or membership through
     the reviewed squad path (`current-season-recovery.ts`, roster audit), not
     by hand:

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

   - `current_statistics_incomplete` with `missingDetailTypes`: named
     players lack required statistics. On fixture 19874708 this is not a
     delay: SportsMonks sends a statistic only when it is not zero, and
     last season's accepted fixtures agree (about 2 of the 13 requested per
     player). How a missing statistic should count is an owner decision
     recorded in
     `docs/production/APPLIED_2026_09_25_CURRENT_PERFORMANCE_UNNAMED_STARTERS.md`;
     until it is made and implemented, this fixture cannot be certified and
     rerunning will not change that. A `field` of `data.lineups[i].details`
     means that row had no details array at all.

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

5. **Idempotent rerun.** Dispatch step 3 again, or let the next orchestrator
   pass run. The fixture must come back with the same `sourceVersion` and the
   query in step 4 must return the same row counts: identical facts only
   advance the observation watermark.
