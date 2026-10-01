# Provider fixtures (Sofascore and Flashscore)

Test data for the Fantasy player-performance adapters in
[`docs/backend/FANTASY_SOFASCORE_FLASHSCORE_PLAN.md`](../../../docs/backend/FANTASY_SOFASCORE_FLASHSCORE_PLAN.md).
Phase 0 produced them from real responses on 2026-10-01.

**These are trimmed copies, not provider payloads.** The repository is public and the
responses are third-party data, so each file keeps only the fields the adapters will read
(the keep-lists in `scripts/backend/provider-fixtures.ts`). Nothing else was written. The
guard test `scripts/backend/provider-fixtures-committed.test.ts` fails if a committed file
holds a field outside its keep-list or is large enough to be a full payload.

## What is here

`matches.json` lists the ten matches (provider IDs and labels only).

| Source | Files per match | Matches |
|---|---|---|
| Sofascore (`sofascore/<matchId>.*.json`) | `detail`, `lineups`, `incidents`, `statistics` | all 10 |
| Flashscore (`flashscore/<eventId>.*.json`) | `data`, `summary`, `lineups`, `statistics` | the 7 from 2026/27 round 1 |

Flashscore has no files for the three 2025/26 matches: its results list covers one season
stage at a time and the earlier season's stage ID is not exposed by the endpoints verified
in Phase 0, so those event IDs could not be found.

## What was kept

- **Sofascore lineups:** per player `id`, `name`, `shortName`, `position`, `jerseyNumber`,
  `teamId`, `shirtNumber`, `substitute`, and these statistics only: `minutesPlayed`,
  `goals`, `goalAssist`, `ownGoals`, `saves`, `rating` (display only, never points),
  `totalShots`, `onTargetScoringAttempt`, `penaltyMiss`, and `totalPass` (its presence marks
  a full-coverage match).
- **Sofascore incidents:** type, class, minute, side, reason, score, and `id`/`name`/`shortName`
  of the player, assister and substitution players.
- **Sofascore statistics:** only the lines `shotsOnGoal`, `totalShotsOnGoal`,
  `goalkeeperSaves`, `yellowCards`, `redCards`.
- **Sofascore detail:** match id, kickoff, status, round, season, tournament, both teams
  and the score by half.
- **Flashscore:** the incident summary (all incident fields), lineups without ratings or
  internal row ids, team statistics lines, and event/tournament identifiers with the score.

## Facts the fixtures show (for the reconciler tests)

- Sofascore coverage is per match, not per league: 7 of 10 are full (ratings, saves,
  `totalPass`), 3 are limited (Touarga–FUS, DHJ–CODM, WAC–Temara). On a limited match
  `goalAssist` is 0 for everyone even when goals had assisters: zero means unknown.
- Flashscore `summary` names the assister (`ASSISTANCE`) and marks penalties
  (`PENALTY_KICK` awarded, then `PENALTY_SCORED` or `PENALTY_MISSED`). Sofascore labelled the
  FUS penalty in Touarga–FUS as `regular`.
- Flashscore incident types seen: `GOAL`, `ASSISTANCE`, `PENALTY_KICK`, `PENALTY_SCORED`,
  `PENALTY_MISSED`, `YELLOW_CARD`, `SUBSTITUTION_IN`, `SUBSTITUTION_OUT`, `NOT_ON_PITCH`.
  No red card or own goal occurs in the Flashscore matches, so those labels are unknown.
- Sofascore incident type/class seen: `goal` (`regular`, `penalty`), `card` (`yellow`,
  `yellowRed`, `red`), `substitution`, `period`, `inGamePenalty` (`missed`). No own goal
  occurs in any of the ten matches.
- The two providers spell some players differently ("M. Elhtemy" and "Lahtimi M."), so a
  cross-provider match cannot rely on the name alone.
- Sofascore lineup `goals` can undercount against its incidents (WAC–Temara: 3 against 4).
- Flashscore `statistics` has "Shots on target" for every one of the 7 matches.

## Regenerating

Run the manual workflow "Provider probe" with the `fixtures` input set to
`tests/fixtures/providers/matches.json` (optionally `only` with plan keys). It uses the
`staging-load-test` environment's secret, writes the trimmed files to a 3-day artifact and
prints counts and the names of dropped fields, never values. Review the artifact, then
copy the files here.
