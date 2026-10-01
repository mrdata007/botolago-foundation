# Sofascore RapidAPI Coverage Test — 2026-10-01

Read-only diagnostic of the **Api Dojo — Sofascore API (RapidAPI), BASIC plan** for BotolaGO rich Fantasy scoring.
No code, Supabase, env vars, scoring or integrations were changed. The API key was never printed or stored in this repo.
Raw API payloads are intentionally **not** committed (public repo; third-party data). This file holds the report plus summarised evidence.

## Subscription

| Item | Value |
|---|---|
| API | Api Dojo — Sofascore (`sofascore.p.rapidapi.com`) |
| RapidAPI app | `default-application_8302838` (team "Botola Go-Default") |
| Plan | BASIC |
| Authentication | Succeeds — all requests HTTP 200 |
| Rate limit (from response headers) | `x-ratelimit-requests-limit: 500` per month, reset ≈ 31 days. 39 calls used in this test → 461 remaining |

## Match tested

| Item | Value |
|---|---|
| Competition | Botola Pro (uniqueTournament 937) |
| Season | Botola Pro D1 26/27 (seasonId 102220) |
| Round | 1 |
| Match | Union Touarga Sport (118834) 2–1 Fath Union Sport / FUS Rabat (55027) |
| Kickoff | 2026-09-26 16:00 UTC |
| Final score | 2–1 (HT 2–0) |
| Sofascore event ID | **16958239** |
| Resolved via | `teams/get-last-matches?teamId=118834&pageIndex=0` |

`matches/detail` reports `uniqueTournament.hasEventPlayerStatistics: false` and `seasonCoverageInfo.editorCoverageLevel: 1` for Botola.

## Endpoints tested

| Endpoint | HTTP | BASIC access | Useful data | Level |
|---|---|---|---|---|
| `search` | 200 | Yes | Team/player IDs | — |
| `teams/get-last-matches` | 200 | Yes | Match list | Match |
| `tournaments/get-last-matches` (tournamentId, seasonId) | 200 | Yes | Round list | Match |
| `matches/detail` | 200 | Yes | Event meta, score by period, coverage flags | Match |
| `matches/get-lineups` | 200 | Yes | Starters/subs, positions, per-player `statistics` — **only 5 fields on target match** | Player |
| `matches/get-incidents` | 200 | Yes | Goals, cards, subs with minutes | Match/player |
| `matches/get-statistics` | 200 | Yes | **Yellow/red cards only** on target match | Team |
| `matches/get-player-statistics` (matchId, playerId) | 200 | Yes | Same 5 fields as lineups; unused sub → `{"error":{"code":404}}` | Player |
| `matches/get-best-players` | 200 | Yes | `404 Not Found` (no data) | — |
| `matches/get-best-players-summary` | 200 | Yes | `404 Not Found` | — |
| `matches/get-player-rating-breakdown` | 200 | Yes | `404 Not Found` | — |
| `matches/get-shotmap` | 200 | Yes | `404 Not Found` | — |
| `matches/get-graph` | 200 | Yes | `404 Not Found` | — |

**Plan-restriction control:** the same endpoints on Premier League Man City 5–3 Sunderland (event 16363867) returned 72 player-stat fields, ratings, best players, rating breakdown and 7 team-stat groups on BASIC. **No endpoint was found that is "EXISTS BUT NOT AVAILABLE ON BASIC".** The 404s are missing upstream data, not plan blocks.

## Player samples (target match)

| Role | Player (id) | Starter | Min | Goals | Assists | Shots | Rating | Other |
|---|---|---|---|---|---|---|---|---|
| Attacker | S. Lotfi (2162075) | Yes | 90 | 1 | 0 | 0 ⚠️ scored with 0 shots | — | — |
| Midfielder | A. Chakir (1919280) | Yes | 90 | 0 | 0 | 0 | — | — |
| Defender | Y. Kajai (1525328) | Yes | 90 | 0 | 0 | 0 | — | — |
| Goalkeeper | R. Asmama (1401595) | Yes | 90 | 0 | 0 | 0 | — | no `saves` |
| Goalkeeper (away) | A. Lakred (919749) | Yes | 90 | 0 | 0 | 0 | — | no `saves` |
| Sub who entered | A. Chaynane (2786670) | No (in 60') | 30 | 0 | 0 | 0 | — | — |
| Unused sub | M. Dahak (1605928) | No | — | — | — | — | — | no `statistics`; player-statistics → 404 |

Target-match `statistics` keys (all players): `goals, goalAssist, ownGoals, minutesPlayed, totalShots, statisticsType`.

## Fantasy Coverage Matrix

Status = target match. Last column = behaviour on full-coverage Botola matches.

| Required Fantasy Input | API Field / Source | Status | Example | Reliability (full-coverage matches) |
|---|---|---|---|---|
| Starter | lineups `substitute: false` | PRESENT | 11 per side | Reliable |
| Minutes | lineups `minutesPlayed` | PRESENT | Nanah 60, Chaynane 30 | Consistent with sub minutes; capped at 90 (no stoppage) |
| Goals | lineups `goals` + incident `goal` | PRESENT | Ajerrar 12', Lotfi 27', Elhtemy 70' | Sources agree |
| Assists | `goalAssist` / incident `assist1` | UNRELIABLE | 3 goals, 0 assists anywhere | Present and agree in full-coverage matches |
| Yellow card | incidents only (no player-stat field) | PRESENT | Regragui 21' | Team stat 2 vs incidents 3 for home → use incidents |
| Red card | incidents only | PRESENT (none) | — | Same source |
| Saves | `saves` | ABSENT | — | Present; sums to team `goalkeeperSaves` |
| Goals conceded | incidents + sub minutes | DERIVABLE | Asmama 1, Lakred 2 | Reliable |
| Clean sheet | derived (conceded + minutes) | DERIVABLE | none this match | No explicit field |
| Shots | `totalShots` | UNRELIABLE | 0 for all scorers | Present; sums to team total |
| Shots on target | `onTargetScoringAttempt` | ABSENT | — | Present; sums to team `shotsOnGoal` |
| Passes | `totalPass` | ABSENT | — | Present; sums to team `passes` |
| Accurate passes | `accuratePass` | ABSENT | — | Present; sums to team `accuratePasses` |
| Key passes | `keyPass` | ABSENT | — | Present |
| Tackles | `totalTackle`, `wonTackle` | ABSENT | — | Present; sums to team |
| Interceptions | `interceptionWon` | ABSENT | — | Present; sums to team |
| Clearances | `totalClearance` | ABSENT | — | Present; sums to team |
| Duels | `duelWon` + `duelLost` | ABSENT | — | Present |
| Duels won | `duelWon` (also `aerialWon`, `wonContest`) | ABSENT | — | Present |
| Fouls committed | `fouls` | ABSENT | — | Present; sums to team |
| Fouls suffered | `wasFouled` | ABSENT | — | Present |
| Player rating | `rating`, `ratingVersions.{original,alternative}` | ABSENT | — | Present, float 5.8–8.5 |

Other fields seen on full-coverage Botola matches: `bigChanceMissed, bigChanceCreated, possessionLostCtrl, dispossessed, totalCross, accurateCross, totalLongBalls, accurateLongBalls, errorLeadToAShot, penaltyWon, penaltyConceded, goodHighClaim, crossNotClaimed, totalKeeperSweeper, accurateKeeperSweeper, savedShotsFromInsideTheBox, keeperSaveValue, expectedGoals, expectedAssists, totalOffside, touches, totalContest, wonContest, aerialWon, aerialLost`.
Never seen on any Botola match: punches, penalty saves, through balls (player level), second-yellow field, per-player ground duels, `errorLeadToAGoal`.

## Cross-checks

- ✅ Goals: lineups vs incidents agree on all 4 deep-checked Botola matches.
- ✅ Minutes vs substitutions agree (e.g. Nanah off 60' → 60; Chaynane on 60' → 30; Mellouk on 83' → 7).
- ✅ Full-coverage matches (MAS 2–1 Zemamra, Tiznit 1–3 Tanger): player sums equal team totals exactly for shots (15–6, 10–11), shots on target (4–1, 3–6), passes (622–245, 524–330), accurate passes, tackles, interceptions, clearances, fouls, saves.
- ✅ GK: saves + goals conceded = opponent shots on target (e.g. Jourbaoui 3 saves + 3 conceded = Tanger 6 on target).
- ✅ Assists in full-coverage matches agree with incident `assist1` (Najari 2, Maali 1, Adila 1, Titus 1).
- ⚠️ Target match cards: team stat home yellow = 2, incidents show 3 (Regragui 21', Rhailouf 73', Chaynane 90+4').
- ⚠️ Limited-coverage matches fill `totalShots` and `goalAssist` with 0 even for scorers (DHJ 2–6 CODM: 8 goals, 0 assists). Zero ≠ "did not happen".
- ⚠️ Lineup `teamId` is the player's registered club, not always the match team (Lotfi 241802, Moutaraji 36268, Farhane 170588). Use home/away side.
- Public sofascore.com page not used; internal API cross-checks were sufficient.

## Additional Botola matches

| Match | Event ID | Full stats? | Stat fields | Rated / played |
|---|---|---|---|---|
| R1 Union Touarga 2–1 FUS (target) | 16958239 | ❌ | 6 | 0 / 30 |
| R1 DHJ 2–6 CODM | 16958236 | ❌ | 6 | 0 / 32 |
| R1 WAC 1–3 WS Temara | 17132472 | ❌ | 6 | 0 / 30 |
| R1 Amal Tiznit 1–3 Ittihad Tanger | 16958238 | ✅ | 59 | 29 / 30 |
| R1 MAS 2–1 Renaissance Zemamra | 17132481 | ✅ | 61 | 29 / 31 |
| R1 Moghreb Tetouan 0–0 RS Berkane | 17132482 | ✅ | 59 | 28 / 31 |
| R1 KACM 2–3 HUSA | 17132480 | ✅ | 63 | 30 / 32 |
| 25/26 R30 Wydad 1–2 Touarga | 16438990 | ✅ | 53 | 32 / 32 |
| 25/26 R29 Touarga 1–0 Ittihad Tanger | 16408824 | ✅ | 51 | 29 / 31 |
| 25/26 R26 HUSA 1–0 Touarga | 16354496 | ✅ | 51 | 31 / 31 |

Coverage is **not systematic**: 7 of 10 sampled matches full, 3 limited, no predictable pattern.

## Verdicts

**Core Fantasy — PARTIAL.** Appearance, starts, minutes, goals, cards (incidents), goals conceded and clean sheets work on every match. Assists and GK saves are missing on ~30% of matches and indistinguishable from real zeros.

**Rich Fantasy — PARTIAL.** Full-coverage data is accurate (player sums = team totals). ~30% of matches have no rich stats; scoring them would silently give every player 0.

**Player Ratings — PARTIAL.** Float, final, present for subs ≥ ~10 min; very short cameos (≤7 min) sometimes unrated; unused subs never rated; entire match unrated on limited coverage. Fallback ratings still required.

## Missing or unreliable fields

Assists and saves (limited matches); all rich stats and ratings (limited matches); `totalShots` filler zeros; team-level card count; lineup `teamId`; punches, penalty saves, through balls (never seen); stoppage time (minutes capped at 90); no explicit clean-sheet field.

## BASIC plan restrictions

- No data restrictions found (Premier League control returned full data on BASIC).
- Volume: 500 requests/month. A full Botola round (8 matches × lineups + incidents) ≈ 16 calls → ~64/month for 4 rounds. Fits for a scheduled ingestion job; does not fit per-user live calls.

## Integration decision

**COVERAGE TEST INCONCLUSIVE — DO NOT INTEGRATE YET**

Full coverage exists and is accurate, but only for ~70% of Botola matches, and the target match is limited. Unresolved: whether Sofascore backfills limited matches later (target match still limited 5 days after full time).

Next steps:
1. Re-check events 16958239, 16958236, 17132472 around 2026-10-08 (3 calls) to test for backfill.
2. If no backfill: design two-tier scoring — core points for every match; rich/rating points only when the match has full coverage (detect via presence of `rating` / `totalPass` in lineups).
