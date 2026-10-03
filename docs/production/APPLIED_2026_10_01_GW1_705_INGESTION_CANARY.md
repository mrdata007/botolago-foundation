# GW1 fixture 19874705: one-fixture ingestion canary (1 Oct 2026)

**Outcome: INGESTED_AND_VERIFIED.** One production ingestion, one fixture, nothing
else changed. No retry was needed or made.

## What ran

| Item | Value |
| --- | --- |
| Workflow | `Ingest current finished Football performances` (`football-current-finished-performances.yml`) |
| Run | 36851579776, attempt 1, started 2026-10-01 10:50:02 UTC, conclusion success |
| Commit | `a4ca3abdef9e5f9d5b3e44ba0df09dcf3e27a111` (main) |
| Inputs | `confirmation = INGEST_CURRENT_FINISHED_PERFORMANCES`, `only_fixture_external_id = 19874705`, no cursor |
| Evidence artifact | `current-finished-performances-36851579776`, sha256 `38b692c1211698a2d662e01d7890c1fef775ebf7a49d06a4bb30e21146537fee` (30-day retention) |

Main had moved from the reviewed `0b01db46` to `a4ca3abd` before dispatch. The only
change was PR 255 (news club crests: three news source files and one news
migration, already applied in production). The importer, the workflow, the
evidence helper and every ingestion or scoring function were untouched, so the
run used the reviewed implementation.

## Boundary before dispatch (checked 10:49 to 10:50 UTC)

- `Fantasy season orchestrator`: `disabled_manually`; no run queued, waiting or
  running; no unfinished cron run; no active ingestion or lifecycle query.
- `lifecycle_tick_enabled = false`, `football_live_refresh_enabled = false`.
- Fixture 705 finished 0-0, no performance rows, no coverage row.
- Adaptive policy empty (legacy ingest path); committed identity repair intact.

## Importer verdict (from the sanitized artifact)

Verdict `pass`; 1 fixture listed and processed; 40 players; lineup rows seen 40,
valid 40, excluded 0; starters 22 (all identified, none anonymous); 2 teams;
detail rows 66, invalid 0; `scoringStatisticsComplete = true`; 403 absent
statistics counted as zero (the reviewed sparse-data convention); goals conceded
from final score 0.

## Database result (read back after the run)

| Check | Before | After |
| --- | --- | --- |
| `player_fixture_performances` | 9426 | **9466** (+40) |
| `historical_performance_fixture_coverage` | 241 | **242** (+1) |
| Rows for fixture 705 | 0 | 40 active, 40 distinct players, 2 teams |
| Starters | 0 | 22 (11 per side) |
| Played / not played | n/a | 32 appeared, 8 not appeared (0 minutes) |

- Coverage row: `coverage_outcome = accepted`, `reconciled = true`,
  `scoring_statistics_complete = true`, lineup rows 40, valid 40, performance rows
  40, starters 22, quarantine reason none, source version
  `sportsmonks-current-fixture:8b4161e39e24bed51e17856ee7e75ad852ecf76a60ca6a0635d8af02a258a4ba`,
  provider observed 2026-10-01 10:50:20.928 UTC.
- All 40 rows carry the same source version and observation time; one active row
  per player; no null minutes, goals conceded, saves or penalties saved.
- Goals 0, own goals 0, goals conceded 0 for every row, against the 0-0 final
  score; 22 clean sheets (the two starting elevens).
- Positions: 4 goalkeepers, 11 defenders, 18 midfielders, 7 forwards.
- Lineup shape unchanged from the plan (40 lineup records, 22 starters).
  Eight lineup players are stored as did-not-play with 0 minutes; no new
  did-not-play rule was added.

## Goalkeepers

| Provider id | Started | Minutes | Saves | Penalties saved | Goals conceded |
| --- | --- | --- | --- | --- | --- |
| 37550261 | yes | 90 | 1 | 0 | 0 |
| 37947231 (new) | yes | 90 | 5 | 0 | 0 |
| 37317114 | no | 0 | 0 | 0 | 0 |
| 37901711 (new) | no | 0 | 0 | 0 | 0 |

The artifact reports `goalkeeperStatistics = explicit_value_or_null_canonical_position_checked_in_database`.
The database accepted all four keepers, so none has a null save or
penalties-saved figure, and no outfield player has any. Saves of 1 and 5 can only
be explicit provider values. The zero figures (all four penalties saved, and both
unused keepers' saves) are stored as 0; the sanitized evidence does not say
whether each zero was an explicit provider 0 or an omitted figure counted as zero
under the sparse-data convention. Nothing was invented and no explicit null was
replaced by a zero (a null would have been refused).

## Nothing else changed (hash comparison against the pre-run baseline)

Identical before and after: performance rows of every other fixture (9426, hash
`45c67588...`), coverage of every other fixture (241, `159346e4...`), players
(993), provider mappings (1541), team memberships (1868), Fantasy players (623),
price history (623), initial price evidence (623), player-list observations (8)
and applied updates (3), fixtures (496), gameweeks (2: GW1 `provisional`
deadline 2026-09-24 13:30 UTC; GW2 `scheduled` deadline 2026-10-02 14:30 UTC),
Fantasy teams (7), squad memberships (109), lineups (7), lineup players (105),
scoring snapshots (18, including the accepted 708 snapshot), point events (852),
gameweek points (606), rankings (16), team gameweek results (6), automation
settings, adaptive policy (0 rows), and the cron job list (14).

After the run: tick and live refresh `false`; orchestrator `disabled_manually`;
no unfinished cron run; no active writer.

## What this did not do

No scoring, rescoring, finalization, orchestrator run, tick or live-refresh
activation, or other fixture. GW1 points for 705 do not exist yet. The GW2
transfer window was **not** checked; this ingestion and the earlier catalog
additions do not by themselves open it, and nobody should be told GW2 transfers
are available without checking the actual window state.

## Remaining blocker

Fixture 705 now has performance and coverage rows, but it is not scored. The
orchestrator stays disabled and the database tick stays off until a separate
approval covers scoring.
