# Held matches: evidence checked on 12 October 2026

## Zemamra–Hassania, SofaScore 17256968

The saved `sofascore_fantasy_attempts.match_data` contains normalized lineups,
incidents and statistics, not raw replies. It contains no `injuryTime` entry;
the current parser discards harmless side-less announcements. A fresh read-only
[provider probe, run 38228134975](https://github.com/mrdata007/botolago-foundation/actions/runs/38228134975)
read `matches/get-incidents?matchId=17256968` at 09:10 UTC. All 22 raw incidents
were printed with only `incidentType,time,length`: there were no `injuryTime`
incidents and no lengths. The period marker at 45 is not an added-time announcement.

There is no evidence of an announced length of seven or more. This is missing
evidence, not evidence of zero. Per the owner's condition, leave the fixture held.
No change to `MAX_STOPPAGE_MINUTES`, the −2 lower limit, parser, cached data,
retry schedule or scoring; no Edge deployment is warranted by this evidence.

## Four supported existing identities

DOB is checked against the linked SofaScore player profile and the existing app
record. Fixture-specific club and shirt come from the saved lineup joined to the
fixture's home/away team and the unresolved queue. Profile shirt numbers are not
substituted for match-day numbers: the current public profiles show different
numbers for some players. Existing memberships and positions stay unchanged.

| SofaScore identity | Existing app identity | DOB | Fixture club / shirt | Evidence |
| --- | --- | --- | --- | --- |
| 1004247 Jawad Rhabra | b0bcf4a0-6712-447e-87bb-51143bd25084, Jawad Ghabra | 1994-11-09 | 17256979, Kawkab / 19 | [SofaScore](https://www.sofascore.com/es/football/player/jawad-rhabra/1004247), [Mountakhab: current Kawkab and DOB](https://mountakhab.net/ar/player/j-ghabra-156754/), [365Scores alias and current club](https://www.365scores.com/fr/football/player/jawad-rhabra-90356) |
| 1186787 Youness Najari | c8a1103a-6dc3-4b63-b93c-f6981c100f8a, Younes Najjari | 1996-02-06 | 17256979, Tanger / 7 | [SofaScore DOB](https://www.sofascore.com/football/player/youness-najari/1186787), [current Tanger profile](https://www.sofascore.com/ar/football/player/youness-najari/1186787), [match sheet](https://globalsportsarchive.com/en/soccer/match/2026-10-10/kawkab-ac-vs-ir-tanger/4550614) |
| 1140815 Salah Moussadak | 4f6fb6ca-95d7-4688-998d-8b4c2bfb0487, Sallah Moussaddaq Kerboub | 1998-03-23 | 17256972, Wydad / 13 | [SofaScore DOB and Wydad](https://www.sofascore.com/football/player/salah-moussadak/1140815), [Transfermarkt alias and DOB](https://www.transfermarkt.us/sallah-moussaddaq/profil/spieler/920972) |
| 880101 Hamza El Wasti | d9241d51-b97c-484a-ad99-1818a798d353, Hamza Elowasti | 1995-01-01 | 17256972, CODM / 22 | [SofaScore DOB and CODM](https://www.sofascore.com/football/player/hamza-el-wasti/880101), [FotMob](https://www.fotmob.com/players/760308) |

The guarded `scripts/backend/resolve-sofascore-evidenced-players.sql` implements
only these four links, with the same staff-resolution mapping/log proof as
`api.admin_resolve_sofascore_player_match`. It refuses changed names, DOBs,
memberships, queue entries, saved lineup identities or existing mappings. It
requires paused/drained writers and ships ending in rollback. Apply only after
review/merge, rehearse and independently verify rollback, then commit and verify.

## Identities deliberately not matched

- **2637442 Haitam Hamani**: [SofaScore](https://www.sofascore.com/football/player/haitam-hamani/2637442)
  and [Foot Mercato](https://www.footmercato.net/joueur/haitam-hamani/) agree on
  2007-07-12; Foot Mercato confirms Wydad, forward, shirt 7. The app candidate
  `9cd7e054-a64e-4b36-87ac-78d259cb4a8d` is **Salaheddine El Hamani**, DOB
  1997-06-29. It is not the same person. Global catalog inspection found no
  Haitam Hamani or player with the 2007 DOB. A separate catalog addition is
  needed, but current active Wydad shirt 7 belongs to Hakim Ziyech
  (`7cd6ee5a-a4b5-4283-b587-d86dd5f93eb7`, membership
  `9b1a77ba-a358-4969-b945-5ba28cf8edaa`). Do not clear that claim without review
  or select the wrong partial-name candidate. This script creates no player.
- **880105 Aymane El Hassouni**: [SofaScore](https://www.sofascore.com/football/player/aymane-el-hassouni/880105)
  reports 1995-02-20. The app candidate `1bff95d4-e1f6-401b-8c40-b56c6b91a183`
  and [FotMob](https://www.fotmob.com/players/898053) report 1995-02-22.
  Wydad and the saved match shirt 10 support the candidate, but the DOB conflict
  is unresolved. No DOB correction or link is made.

WAC–CODM also still has no provider minutes for mapped substitute Ayoub Lakhlifi
(1526456). Identity corrections alone do not remove that refusal. No unknown
minutes are changed to zero and no participation guard is weakened.
