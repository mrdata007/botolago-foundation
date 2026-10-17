# Player-identity population probe: all 16 Botola clubs (1 Oct 2026)

**Read-only evidence.** No migration, no provider registration, no table, no screen, no
mapping write, no change to Fantasy, GW1 recovery, the orchestrator, the lifecycle tick or live
refresh. The BotolaGO database was read with `select` statements only. Provider data was read
through the existing manual "Provider probe" workflow, which prints only field names, types and
counts. **No player names, dates of birth or raw payloads appear here**, and provider player ids
were not printed.

Supports the approved design `FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md`
(merged in #275): provider ids as keys, everything else as reviewer signals.

## 1. Methodology

1. **Clubs.** The 16 current-season clubs come from `app.team_memberships` for the current
   season (2026/2027). Provider team ids: 14 clubs from the committed Phase 0 round-1 fixtures,
   and the two clubs whose round-1 match was not in them (FAR Rabat, Raja Casablanca) from
   Sofascore `tournaments/get-last-matches` and Flashscore `v1/search/multi-search` plus
   `v1/teams/data` (each candidate checked by its club name, never by a player name).
2. **Squads.** One response per club per provider: Sofascore `teams/get-squad` and Flashscore
   `v1/teams/squad`. No match, lineup or player-detail call was made league-wide.
3. **Counting.** Field presence comes from the probe's per-field counts. Within-squad
   duplicates come from its distinct-value counts, run with value listing switched off
   (`enum_max=1`), so a date or id could not be printed. Position values and the club id each
   player is registered to were listed (club ids and G/D/M/F are not personal).
4. **App catalog.** Aggregates only, by club, for active current-season memberships
   (`active`, `valid_from <= today`, `valid_to` null or later), at the time of the probe.
5. **No cross-provider matching** by name or by anything else was attempted.

## 2. Provider requests and quota

| Provider   | Requests sent                                                                                                                                                        | Of which failed | Quota remaining after |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------- |
| Sofascore  | 33: 1 tournament match list, 16 squads for the counts, 16 squads for position values and registered-team ids                                                         | 0               | 368 of 500            |
| Flashscore | 29: 7 searches, 4 team-name checks, 1 standings call (HTTP 422, wrong parameters), 17 squad calls (16 clubs, plus the second entry for FAR Rabat which returned 404) | 2               | 416 of 500            |

No endpoint already shown to be a 404 was called again.

## 3. Club matrix

Squad sizes: Sofascore `players` list; Flashscore items **excluding coach entries** (the
squad lists include them). Percentages are of that squad. "Flashscore position" is the presence
of the per-player `PLAYER_TYPE_ID` field (values in section 7), whose meaning has not been
checked against another source. "≤" marks a Flashscore shirt percentage that is an upper
bound: the field is a number or null in that club and the nulls were not counted.

| Club              | Sofascore squad | Flashscore squad | Difference | Sofascore DOB % | BotolaGO DOB % | Sofascore position % | Flashscore position field % | Sofascore shirt % | Flashscore shirt % | Anomaly                                                                                                                                  |
| ----------------- | --------------- | ---------------- | ---------- | --------------- | -------------- | -------------------- | --------------------------- | ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Amal Tiznit       | 35              | 26               | 9          | 94.3            | 33.3           | 100.0                | 100.0                       | 34.3              | 100.0              | 4 Sofascore players registered to another team; app DOB 33.3%; Sofascore shirt 34.3%                                                     |
| CODM Meknès       | 38              | 27               | 11         | 84.2            | 89.2           | 89.5                 | 100.0                       | 78.9              | 100.0              | squad sizes differ by 11; Sofascore position 89.5%                                                                                       |
| CR Khemis Zemamra | 36              | 28               | 8          | 83.3            | 87.5           | 88.9                 | 100.0                       | 69.4              | ≤100.0             | Sofascore position 88.9%                                                                                                                 |
| Difaâ El Jadida   | 37              | 27               | 10         | 89.2            | 78.4           | 94.6                 | 100.0                       | 75.7              | 100.0              | squad sizes differ by 10                                                                                                                 |
| FAR Rabat         | 26              | 28               | 2          | 100.0           | 86.5           | 100.0                | 100.0                       | 100.0             | 100.0              | two Flashscore team entries share the name; one has no squad                                                                             |
| FUS Rabat         | 32              | 35               | 3          | 78.1            | 77.4           | 84.4                 | 100.0                       | 75.0              | ≤100.0             | Sofascore DOB 78.1%; Sofascore position 84.4%                                                                                            |
| Hassania Agadir   | 39              | 31               | 8          | 89.7            | 88.9           | 94.9                 | 100.0                       | 87.2              | 100.0              | none                                                                                                                                     |
| Ittihad Tanger    | 32              | 30               | 2          | 87.5            | 76.2           | 100.0                | 100.0                       | 81.2              | 100.0              | none                                                                                                                                     |
| Kawkab Marrakech  | 37              | 33               | 4          | 94.6            | 81.0           | 100.0                | 100.0                       | 73.0              | 100.0              | 4 Sofascore players registered to another team                                                                                           |
| Maghreb Fès       | 31              | 30               | 1          | 96.8            | 83.8           | 100.0                | 100.0                       | 87.1              | ≤100.0             | none                                                                                                                                     |
| Moghreb Tétouan   | 43              | 27               | 16         | 88.4            | 61.7           | 95.3                 | 100.0                       | 67.4              | ≤100.0             | squad sizes differ by 16; app DOB 61.7%                                                                                                  |
| RSB Berkane       | 30              | 27               | 3          | 96.7            | 86.1           | 100.0                | 100.0                       | 90.0              | 100.0              | none                                                                                                                                     |
| Raja Casablanca   | 28              | 29               | 1          | 100.0           | 91.2           | 100.0                | 100.0                       | 100.0             | ≤100.0             | none                                                                                                                                     |
| UTS Rabat         | 41              | 35               | 6          | 78.0            | 90.0           | 90.2                 | 100.0                       | 78.0              | 100.0              | 5 Sofascore players registered to another team; Sofascore DOB 78.0%                                                                      |
| Widad Témara      | 26              | 16               | 10         | 96.2            | 91.7           | 96.2                 | 100.0                       | 26.9              | ≤100.0             | Flashscore squad implausibly small (16); squad sizes differ by 10; 8 Sofascore players registered to another team; Sofascore shirt 26.9% |
| Wydad Casablanca  | 29              | 36               | 7          | 100.0           | 94.2           | 100.0                | 100.0                       | 96.6              | ≤100.0             | none                                                                                                                                     |
| **League**        | **540**         | **465**          | **101**    | **90.4**        | **81.3**       | **95.6**             | **100.0**                   | **75.9**          | **≤100.0**         |                                                                                                                                          |

Counts behind the league row: Sofascore DOB 488 of 540; Sofascore position 516
of 540; Sofascore shirt 410 of 540; BotolaGO DOB 505 of 621.

## 4. Sofascore detail (per club, count and percent)

All of `player.id`, `player.team.id`, `player.name` and `player.shortName` are present on 100%
of every squad. `dateOfBirthTimestamp` and `dateOfBirth` are present on the same number of
players in every club, always as a number and a string with no null. "Registered elsewhere" is
the number of squad members whose own `team.id` is not the requested club.

| Club              | Squad | DOB        | Position G/D/M/F | Shirt      | Height     | Nationality | Registered elsewhere | Shared DOB values |
| ----------------- | ----- | ---------- | ---------------- | ---------- | ---------- | ----------- | -------------------- | ----------------- |
| Amal Tiznit       | 35    | 33 (94.3)  | 35 (100.0)       | 12 (34.3)  | 20 (57.1)  | 35 (100.0)  | 4                    | 0                 |
| CODM Meknès       | 38    | 32 (84.2)  | 34 (89.5)        | 30 (78.9)  | 24 (63.2)  | 36 (94.7)   | 3                    | 1                 |
| CR Khemis Zemamra | 36    | 30 (83.3)  | 32 (88.9)        | 25 (69.4)  | 21 (58.3)  | 30 (83.3)   | 1                    | 0                 |
| Difaâ El Jadida   | 37    | 33 (89.2)  | 35 (94.6)        | 28 (75.7)  | 24 (64.9)  | 36 (97.3)   | 3                    | 2                 |
| FAR Rabat         | 26    | 26 (100.0) | 26 (100.0)       | 26 (100.0) | 24 (92.3)  | 26 (100.0)  | 0                    | 0                 |
| FUS Rabat         | 32    | 25 (78.1)  | 27 (84.4)        | 24 (75.0)  | 22 (68.8)  | 26 (81.2)   | 2                    | 0                 |
| Hassania Agadir   | 39    | 35 (89.7)  | 37 (94.9)        | 34 (87.2)  | 30 (76.9)  | 38 (97.4)   | 2                    | 0                 |
| Ittihad Tanger    | 32    | 28 (87.5)  | 32 (100.0)       | 26 (81.2)  | 23 (71.9)  | 32 (100.0)  | 0                    | 1                 |
| Kawkab Marrakech  | 37    | 35 (94.6)  | 37 (100.0)       | 27 (73.0)  | 26 (70.3)  | 36 (97.3)   | 4                    | 0                 |
| Maghreb Fès       | 31    | 30 (96.8)  | 31 (100.0)       | 27 (87.1)  | 25 (80.6)  | 31 (100.0)  | 0                    | 0                 |
| Moghreb Tétouan   | 43    | 38 (88.4)  | 41 (95.3)        | 29 (67.4)  | 29 (67.4)  | 39 (90.7)   | 1                    | 2                 |
| RSB Berkane       | 30    | 29 (96.7)  | 30 (100.0)       | 27 (90.0)  | 25 (83.3)  | 30 (100.0)  | 0                    | 0                 |
| Raja Casablanca   | 28    | 28 (100.0) | 28 (100.0)       | 28 (100.0) | 27 (96.4)  | 28 (100.0)  | 0                    | 0                 |
| UTS Rabat         | 41    | 32 (78.0)  | 37 (90.2)        | 32 (78.0)  | 25 (61.0)  | 35 (85.4)   | 5                    | 0                 |
| Widad Témara      | 26    | 25 (96.2)  | 25 (96.2)        | 7 (26.9)   | 6 (23.1)   | 26 (100.0)  | 8                    | 0                 |
| Wydad Casablanca  | 29    | 29 (100.0) | 29 (100.0)       | 28 (96.6)  | 29 (100.0) | 29 (100.0)  | 1                    | 0                 |

**DOB plausibility, what could and could not be measured.** The probe cannot print or compare
dates, so the future-date, age under 15, age over 50 and unparseable-date counts could **not**
be computed on the provider side. What was measured: every DOB value is a number (with the
string form present on the same players), none is null, and **6 birth dates are shared by two
players inside the same club across the whole league** (CODM Meknès 1, Difaâ El Jadida 2,
Ittihad Tanger 1, Moghreb Tétouan 2), about what chance gives for squads of this size, so no
placeholder pattern shows up in the duplicates.

Flags by Sofascore DOB coverage (evidence for review, not acceptance criteria):

- below 90%: CODM Meknès 84.2, CR Khemis Zemamra 83.3, Difaâ El Jadida 89.2, FUS Rabat 78.1,
  Hassania Agadir 89.7, Ittihad Tanger 87.5, Moghreb Tétouan 88.4, UTS Rabat 78.0 (8 clubs);
- below 75%: none; below 50%: none.

## 5. Flashscore detail

Per item: `PLAYER_ID`, `PLAYER_NAME`, `PLAYER_TYPE_ID` and `PLAYER_FLAG_ID` are present on 100%.
`PLAYER_JERSEY_NUMBER` is a number everywhere in 9 clubs, and a number or null in 7. **No other
field exists on a squad item** (no date of birth, no height, no team id, no per-player position
other than `PLAYER_TYPE_ID`). Groups per squad: always the same labels as the type values.

| Club              | Items | Coach entries | Players | Position field present | Jersey type / keys present | Within-squad duplicate ids |
| ----------------- | ----- | ------------- | ------- | ---------------------- | -------------------------- | -------------------------- | --- |
| Amal Tiznit       | 27    | 1             | 26      | 26 (100.0)             | number / 26                | 0                          |
| CODM Meknès       | 28    | 1             | 27      | 27 (100.0)             | number / 27                | 0                          |
| CR Khemis Zemamra | 30    | 2             | 28      | 28 (100.0)             | number                     | null / 28                  | 0   |
| Difaâ El Jadida   | 28    | 1             | 27      | 27 (100.0)             | number / 27                | 0                          |
| FAR Rabat         | 29    | 1             | 28      | 28 (100.0)             | number / 28                | 0                          |
| FUS Rabat         | 36    | 1             | 35      | 35 (100.0)             | number                     | null / 35                  | 0   |
| Hassania Agadir   | 33    | 2             | 31      | 31 (100.0)             | number / 31                | 0                          |
| Ittihad Tanger    | 32    | 2             | 30      | 30 (100.0)             | number / 30                | 0                          |
| Kawkab Marrakech  | 34    | 1             | 33      | 33 (100.0)             | number / 33                | 0                          |
| Maghreb Fès       | 31    | 1             | 30      | 30 (100.0)             | number                     | null / 30                  | 0   |
| Moghreb Tétouan   | 29    | 2             | 27      | 27 (100.0)             | number                     | null / 27                  | 0   |
| RSB Berkane       | 28    | 1             | 27      | 27 (100.0)             | number / 27                | 0                          |
| Raja Casablanca   | 30    | 1             | 29      | 29 (100.0)             | number                     | null / 29                  | 0   |
| UTS Rabat         | 36    | 1             | 35      | 35 (100.0)             | number / 35                | 0                          |
| Widad Témara      | 16    | 0             | 16      | 16 (100.0)             | number                     | null / 16                  | 0   |
| Wydad Casablanca  | 41    | 5             | 36      | 36 (100.0)             | number                     | null / 36                  | 0   |

`PLAYER_TYPE_ID` values seen: `GOALKEEPER`, `DEFENDER`, `MIDFIELDER`, `FORWARD` and `COACH` (23
coach entries league-wide, 0 to 5 per club). Flashscore **DOB and height are absent from the
squad endpoint** (confirmed in all 16 squads); a per-player call would be needed
(`v1/players/data`) and was not made.

## 6. BotolaGO app catalog (production, read-only)

| Measure                                                         | Value                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Canonical players (all)                                         | 993, all active                                                                                              |
| Current-season memberships (active)                             | 621 for 621 distinct players                                                                                 |
| Players with more than one current-season membership            | 0                                                                                                            |
| Fantasy catalog players, current season                         | 623 (621 active)                                                                                             |
| Current players with a date of birth                            | 505 of 621 (81.3%)                                                                                           |
| Current players with a position                                 | 621 of 621 (100.0%, but `position` is a required column, so presence says nothing about whether it is right) |
| Current players with a detailed position / height / nationality | 0 / 0 / 0                                                                                                    |
| Current memberships with a shirt number                         | 436 of 621 (70.2%)                                                                                           |
| App DOB values on 1 January                                     | 23 of 505 (4.6%); a uniform spread would give about 1 or 2                                                   |
| App DOB in the future, under 15, over 50                        | 0, 0, 0                                                                                                      |
| Provider mappings, `sportsmonks`                                | player 958 (all active), team 21, fixture 496, round 62, season 3, competition 1                             |
| Provider mappings, `sofascore` / `flashscore`                   | none; neither is registered in `football_providers` (only `sportsmonks` and `fixture` are)                   |

Per club (current squad, DOB, position, shirt, 1 January DOBs, shared DOB values):

| Club              | Squad | DOB | DOB % | Position | Position % | Shirt | Shirt % | DOB on 1 Jan | Shared DOB values |
| ----------------- | ----- | --- | ----- | -------- | ---------- | ----- | ------- | ------------ | ----------------- |
| Amal Tiznit       | 27    | 9   | 33.3  | 27       | 100.0      | 22    | 81.5    | 0            | 0                 |
| CODM Meknès       | 37    | 33  | 89.2  | 37       | 100.0      | 27    | 73.0    | 5            | 1                 |
| CR Khemis Zemamra | 40    | 35  | 87.5  | 40       | 100.0      | 28    | 70.0    | 1            | 1                 |
| Difaâ El Jadida   | 37    | 29  | 78.4  | 37       | 100.0      | 29    | 78.4    | 1            | 2                 |
| FAR Rabat         | 37    | 32  | 86.5  | 37       | 100.0      | 29    | 78.4    | 2            | 0                 |
| FUS Rabat         | 31    | 24  | 77.4  | 31       | 100.0      | 26    | 83.9    | 0            | 0                 |
| Hassania Agadir   | 45    | 40  | 88.9  | 45       | 100.0      | 34    | 75.6    | 3            | 0                 |
| Ittihad Tanger    | 42    | 32  | 76.2  | 42       | 100.0      | 39    | 92.9    | 1            | 0                 |
| Kawkab Marrakech  | 42    | 34  | 81.0  | 42       | 100.0      | 31    | 73.8    | 1            | 0                 |
| Maghreb Fès       | 37    | 31  | 83.8  | 37       | 100.0      | 25    | 67.6    | 0            | 0                 |
| Moghreb Tétouan   | 60    | 37  | 61.7  | 60       | 100.0      | 37    | 61.7    | 2            | 0                 |
| RSB Berkane       | 36    | 31  | 86.1  | 36       | 100.0      | 25    | 69.4    | 0            | 0                 |
| Raja Casablanca   | 34    | 31  | 91.2  | 34       | 100.0      | 23    | 67.6    | 0            | 0                 |
| UTS Rabat         | 40    | 36  | 90.0  | 40       | 100.0      | 38    | 95.0    | 2            | 0                 |
| Widad Témara      | 24    | 22  | 91.7  | 24       | 100.0      | 0     | 0.0     | 1            | 1                 |
| Wydad Casablanca  | 52    | 49  | 94.2  | 52       | 100.0      | 23    | 44.2    | 4            | 0                 |

The app squads (621 in total) are larger than the provider squads (540 and 465), most clearly
Moghreb Tétouan (60 against 43 and 27), Wydad Casablanca (52 against 29 and 36) and Hassania
Agadir (45 against 39 and 31).

## 7. Answers to the DOB questions (counts only)

**A. Is Sofascore DOB populated well enough league-wide to be a meaningful reviewer signal?**
Yes. 488 of 540 (90.4%), with every club between 78.0% and 100.0%.

**B. Is BotolaGO DOB populated well enough to compare against Sofascore for most players?**
Mostly. 505 of 621 (81.3%). If the two gaps were independent, roughly 73% of players would have
a date on both sides (an estimate, not a measurement: no players were matched). It is not
uniform: **Amal Tiznit 33.3% and Moghreb Tétouan 61.7%** are well below the rest (every other
club is 76% to 94%).

**C. Clubs where DOB should be ignored or heavily discounted.** Amal Tiznit (app side 33.3%) and
Moghreb Tétouan (app side 61.7%). On the provider side no club is below 78%.

**D. Placeholder or implausibility.** App side: **23 of 505 dates (4.6%) fall on 1 January**,
roughly 17 times what a uniform spread gives, concentrated in CODM Meknès (5), Wydad
Casablanca (4) and Hassania Agadir (3). This looks like a year-only fallback in the earlier
import and **should be treated as low-trust**. Nothing in the app is in the future or outside
age 15 to 50. Provider side: the duplicate pattern is unremarkable, but the equivalent 1 January
and age-range checks could not be run without printing dates, so **they remain unmeasured**.

DOB stays a ranking and reviewer signal only, as approved. It is not an automatic key.

## 8. Position signal

- **Sofascore:** G, D, M or F on **516 of 540 (95.6%)**, and no other value anywhere. By club,
  100% in 8 clubs; below 100% in FUS Rabat (84.4), CR Khemis Zemamra (88.9), CODM Meknès (89.5),
  UTS Rabat (90.2), Difaâ El Jadida (94.6), Hassania Agadir (94.9), Moghreb Tétouan (95.3),
  Widad Témara (96.2). The 24 players without one are missing the key, not null.
- **Flashscore:** the squad group labels (Goalkeepers, Defenders, Midfielders, Forwards, Coach)
  repeat exactly what the per-item `PLAYER_TYPE_ID` says, so the labels are **display and
  context only**. `PLAYER_TYPE_ID` itself is present on 465 of 465 players and its values read
  as positions, but **its agreement with another source has not been measured** (that needs
  matched pairs, which this probe was forbidden to make), and an earlier source in this project
  grouped sparse records wrongly. It is a candidate reviewer signal, not yet an established
  position.
- Position stays a ranking signal and never a hard filter.

## 9. Provider-id stability and collisions

- **Within a squad:** no duplicate id in any of the 16 Sofascore squads (540 of 540 distinct per
  club) or any of the 16 Flashscore squads (488 of 488 distinct per club).
- **Across clubs in the same snapshot: not tested.** Ids were deliberately not printed, so a
  collision between two clubs cannot be seen here. A relevant observation: **34 of 540
  Sofascore squad members (6.3%) are registered to a different team** than the club whose squad
  lists them (up to 8 of 26 at Widad Témara, 5 of 41 at UTS Rabat), so the same Sofascore
  player id can plausibly appear in two squads.
- **Across seasons: no evidence either way.** This is a single snapshot and says nothing about
  stability over time.
- Result: **no within-squad duplicate observed**; cross-club collision not testable here.

## 10. Squad-shape anomalies

- Flashscore **Widad Témara has only 16 players** against 26 on Sofascore (implausibly small).
- Largest squad-size gaps: Moghreb Tétouan 16, CODM Meknès 11, Difaâ El Jadida 10, Widad Témara
  10, Amal Tiznit 9, CR Khemis Zemamra 8, Hassania Agadir 8, Wydad Casablanca 7.
- Flashscore squads **include coaches** (23 league-wide); a collector must exclude them.
- Flashscore has **two team entries named FAR Rabat**; one returns a squad, the other returns 404. Team resolution needs care.
- Widad Témara has very little Sofascore shirt and height data (shirt 26.9%, height 23.1%).
- Sofascore squads also carry `foreignPlayers` (98 across the 16) and `nationalPlayers` (16)
  lists; whether they overlap `players` was not established, and `players` alone was counted.

## 11. Field classification (from what was measured)

**SAFE MACHINE INPUT** (as keys and context for candidate collection, never as an approval):

- Sofascore `player.id`: 540 of 540, number, distinct within every squad.
- Flashscore `PLAYER_ID`: 488 of 488, string, distinct within every squad.
- Which club a squad request was made for (the team id used in the request), provided the
  Flashscore squad of each club is checked for completeness and for the second FAR Rabat entry.
- Starter or bench from lineup data, as the reconciler already uses it (not re-measured here).

**REVIEWER / RANKING SIGNAL ONLY:**

- Sofascore DOB (90.4%), strong when it equals a trustworthy app date; the app's DOB is weaker
  (81.3%, 1 January pattern, two sparse clubs).
- Sofascore shirt (75.9%; 26.9% at Widad Témara) and Flashscore shirt (a number or null; upper
  bound 100%): signals only, as shirt numbers already differ between providers.
- Sofascore position (95.6%, G/D/M/F) and Flashscore `PLAYER_TYPE_ID` (100%, semantics
  unverified).
- Sofascore height (70.4%) and nationality (95.0%), corroboration only.
- Sofascore `player.team.id` (registered team): useful to flag players listed in another club's
  squad.
- Names: for human reading only.

**DO NOT USE:**

- Flashscore DOB and height: absent from squads, and only available per player.
- Flashscore squad group labels as a position (redundant with `PLAYER_TYPE_ID`, which is itself
  unverified).
- Flashscore squad membership as the club's full squad for any club where its size is
  implausible (Widad Témara).
- Any claim of id stability across seasons or clubs (not tested).
- The app's `position` as evidence (required column, so always present), and any app DOB on
  1 January.
- App detailed position, height and nationality: empty for all 621 current players.

## 12. Limitations

- Shape and counts only. Values were never read, so DOB plausibility and 1 January patterns on
  the provider side, position agreement and id equality across providers were not measured.
- One snapshot, 1 October 2026, one response per club per provider.
- Cross-club id collisions were not testable without printing ids.
- App squad numbers use today's membership dates; provider squads are whatever each provider
  listed that day.
- The overlap of players with a date on both sides is an independence estimate, not a count.
- Provider-side checks that need the raw responses (the future-date, age and unparseable-date
  counts, the 1 January count, cross-club id collisions) are exactly what the planned
  read-only squad collector can compute, because it holds the responses in memory instead of
  printing them.

## 13. Next gate

**PROVIDER_IDENTITY_DATA_NEEDS_REVIEW.**

What the owner should look at before the next step is approved:

1. The provider-side DOB plausibility counts you asked for could not be produced with the
   available tooling. Either accept that the collector measures them (it holds the data), or
   say that they are needed first.
2. The app catalog's 1 January dates (23 of 505) and the two sparse clubs (Amal Tiznit,
   Moghreb Tétouan): decide whether these dates are discounted in ranking.
3. The collector must handle: coach entries, the second FAR Rabat entry, players registered to
   another team (6.3%), the 16-player Widad Témara squad, and cross-club id checks.

None of these blocks the next step by itself, and the approved design is unchanged (provider
ids as keys; DOB, shirt, position, height and nationality as signals). When the owner confirms
the points above, the next step is: **register `sofascore` and `flashscore` in
`football_providers` and build the read-only squad candidate collector.** It is not started.
