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

Every lineup player must have an existing canonical mapping and a dated current
season team membership. The two fixture participants must reconcile to exactly
11 starters each. The only exception is that up to 4 unnamed starters are left
out (BG-0011 option B, owner decision 2026-09-25). Duplicate lineup rows are
refused. A single fixture transaction replaces its active facts and writes
reconciled coverage with `scoring_statistics_complete=true`. Existing historical
coverage defaults to false. Unknown players, a starter without minutes, or a
missing final score stop the operation.

The database computes the source version from the actual normalized payload,
retains old versions as inactive, and rejects stale observations and conflicting
payloads at the same observation time. It locks the fixture `FOR UPDATE`, paired
with the scoring commit's `FOR SHARE` lock and input digest check, so corrections
cannot race a scoring commit. Evidence contains only fixture IDs, counts,
source digests, coverage metadata, and sanitized errors, never full provider
responses or credentials.
