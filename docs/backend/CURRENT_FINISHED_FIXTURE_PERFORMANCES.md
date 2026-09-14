# Current finished-fixture statistics

This manual path handles SportsMonks league 860, current season 28647 (2026/2027),
and only canonical fixtures already marked finished. It neither opens Fantasy
registration nor starts a worker or schedule. Its first live acceptance requires
an actual finished fixture with complete provider statistics; the preseason
roster audit cannot certify that coverage.

`scripts/backend/current-season-performances.ts` reads at most five fixtures per
invocation, using `AFTER_FIXTURE_EXTERNAL_ID` for a subsequent reviewed batch.
The runner requires an exact reviewed main SHA, first owner workflow dispatch,
`CONFIRMATION=INGEST_CURRENT_FINISHED_PERFORMANCES`, the existing production
project variables, server secret, provider token, and an evidence directory in
`CURRENT_PERFORMANCE_EVIDENCE_DIR`. No scheduled invocation is accepted.

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

Every lineup player must have an existing canonical mapping and a dated current
season team membership. The two fixture participants must reconcile to exactly
11 starters each, with no excluded or duplicate lineup rows. A single fixture
transaction replaces its active facts and writes reconciled coverage with
`scoring_statistics_complete=true`. Existing historical coverage defaults to
false. Missing coverage, unknown players, or incomplete statistics stop the
operation; they cannot certify that an absent player did not participate.

The database computes the source version from the actual normalized payload,
retains old versions as inactive, and rejects stale observations and conflicting
payloads at the same observation time. It locks the fixture `FOR UPDATE`, paired
with the scoring commit's `FOR SHARE` lock and input digest check, so corrections
cannot race a scoring commit. Evidence contains only fixture IDs, counts,
source digests, coverage metadata, and sanitized errors, never full provider
responses or credentials.
