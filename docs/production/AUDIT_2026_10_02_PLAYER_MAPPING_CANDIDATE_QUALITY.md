# Audit 2 October 2026: how useful the player-mapping review queue will be

Project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`). **Read only.** Production was queried
with `select` statements, calling the same stable functions the reviewer screen calls
(`app_private.football_mapping_candidate_signals` and `..._signal_score`). Nothing was written:
no `record_observations`, no `propose`, no `decide`, no `execute`. Candidates, observations,
proposals, mapping rows, cron, Fantasy and the resolver were read before and after and are
unchanged.

Only counts and states appear here. No name, no provider id, no date of birth.

## 1. The stored population is sound

| Check | Result |
| --- | --- |
| Candidates, one per (provider, provider player id) | 1,004 candidates, 1,004 distinct identities |
| Observations | 1,006, none orphaned; every candidate has at least one |
| Candidates in more than one squad | **2**, both Sofascore |
| Status of every candidate | `unmapped` (1,004) |
| Proposals | 0 |
| Sofascore or Flashscore rows in `football_provider_mappings` | 0 |
| Candidates naming an unregistered provider | 0 |
| Observations with no app team | 0 |

### By provider

| | Candidates | Observations |
| --- | --- | --- |
| Sofascore | 539 | 541 |
| Flashscore | 465 | 465 |

### By evidence the provider carried (observations)

| Signal | Sofascore (541) | Flashscore (465) |
| --- | --- | --- |
| Date of birth `valid` | 489 | **0** |
| Date of birth `missing` | 52 | 0 |
| Date of birth `not_provided` (the endpoint has no such field) | 0 | **465** |
| Valid date that falls on 1 January (counts as no signal) | 38 | 0 |
| Position known | 517 | 465 |
| Shirt number known | 414 | 457 |
| Provider registers the player with another team | 33 (32 candidates) | 0 |
| Squad `INCOMPLETE_PROVIDER_SQUAD` | 0 | 16 |

Position split, Sofascore: D 157, M 219, F 89, G 52, none 24. Flashscore: D 129, M 162, F 122, G 52.

### By club (observations)

| Club | Sofascore | Flashscore | Incomplete squad | Other team registered | Valid DOB | App players |
| --- | --- | --- | --- | --- | --- | --- |
| Amal Tiznit | 35 | 26 | 0 | 4 | 33 | 27 |
| CODM Meknès | 39 | 27 | 0 | 3 | 33 | 37 |
| CR Khemis Zemamra | 36 | 28 | 0 | 1 | 30 | 40 |
| Difaâ El Jadida | 37 | 27 | 0 | 3 | 33 | 37 |
| FAR Rabat | 27 | 28 | 0 | 0 | 27 | 37 |
| FUS Rabat | 32 | 35 | 0 | 1 | 25 | 31 |
| Hassania Agadir | 39 | 31 | 0 | 2 | 35 | 45 |
| Ittihad Tanger | 32 | 30 | 0 | 0 | 28 | 42 |
| Kawkab Marrakech | 37 | 33 | 0 | 4 | 35 | 42 |
| Maghreb Fès | 31 | 30 | 0 | 0 | 30 | 37 |
| Moghreb Tétouan | 43 | 27 | 0 | 1 | 38 | 60 |
| Raja Casablanca | 28 | 29 | 0 | 0 | 28 | 34 |
| RS Berkane | 30 | 27 | 0 | 0 | 29 | 36 |
| UTS Rabat | 41 | 35 | 0 | 5 | 32 | 40 |
| Widad Témara | 26 | **16** | **16** | **8** | 25 | 24 |
| Wydad Casablanca | 28 | 36 | 0 | 1 | 28 | 52 |

"App players" is the number of active players with an active team membership at that club.

## 2. Widad Témara's Flashscore squad is safe

- All 16 Flashscore observations for Widad Témara are marked `INCOMPLETE_PROVIDER_SQUAD`. They
  are the only incomplete observations in the database. Widad's Sofascore squad (26) is
  `COMPLETE`. No candidate mixes complete and incomplete observations.
- **No negative evidence.** The score reads three things only: the date-of-birth signal, the
  shirt signal and the position signal. The flag is carried as information on the option, never
  in the score. Measured against the production function: the same signals score 2 with the
  incomplete flag, 2 without it, and 2 with every flag set.
- **Nobody is lowered for being absent.** Each of the 16 Widad Flashscore candidates is offered
  all 24 of the club's active app players (min 24, max 24). Every option carries the incomplete
  flag, and the scores span −1 to 1 on shirt and position alone, as for any Flashscore squad.
- **No ignore suggestion from absence.** The database has no code path that suggests an ignore.
  `football_mapping_compute` handles `ignore` by reading the candidate's status, existing mapping
  rows and `lineup_or_incident_seen` only; it does not mention squad completeness or
  observations. There are 0 `ignore` proposals. In the application code,
  `absenceEvidence` returns `no_signal` for an incomplete squad.
- The squad was not repaired or topped up.

## 3. Names do not touch ranking

Checked against the functions as deployed (the text of each, from `pg_get_functiondef`):

| Function | Mentions a name column |
| --- | --- |
| `football_mapping_candidate_signals` | no |
| `football_mapping_signal_score` | no |
| `football_mapping_dob_signal` | no |
| `football_mapping_position_letter` | no |
| `football_mapping_row_fingerprint` | no |
| `football_mapping_compute` | no |
| `admin_football_mapping_app_player_options` | **yes, to display it**: it selects the app player's name into its output. Its order is `score desc, id`. |

- The candidate's own display name is held in `football_player_mapping_candidates`. No ranking
  or fingerprint function reads that table's name column.
- The fingerprint covers kind, candidate ids, provider ids, app player id, evidence references,
  signals, candidate revisions, the position note and the reason. Evidence references that carry
  a name key are refused by the function and by a table check (pgTAP cases 11.9 and 11.11).
- Tests that change a name and watch nothing move: `candidate-signals.test.ts` (swapping every
  name leaves order and scores unchanged; a scan of the ranking source for any name read) and
  `review-queue.test.ts` (renaming every app player and candidate leaves each option's score,
  signals and order unchanged across 25 candidates; the queue's own source reads a display name
  on exactly one line, the typed-search filter, which filters and never orders).

## 4. Ranking against the app's own players

For every candidate, every active app player at the club the candidate was observed in was
scored with the production function (39,646 pairs). A two-squad candidate was scored against both
clubs. Nothing was declared a match.

| | Sofascore (539) | Flashscore (465) |
| --- | --- | --- |
| Candidates with at least one same-club app player | 539 | 465 |
| Candidates with zero options | 0 | 0 |
| Plausible options per candidate (score 1 or more): none | 49 | 0 |
| one | 51 | 0 |
| 2 to 3 | 229 | 9 |
| 4 or more | 210 | 456 |
| Best score 6 / 5 / 4 | 115 / 104 / 23 | n/a |
| Best score 3 / 2 / 1 / 0 / −1 | 21 / 55 / 172 / 31 / 18 | 0 / 258 / 207 / 0 / 0 |
| Best option **tied** with another | 191 | **207** |
| Best minus second: 4 or more | 210 | 0 |
| Best minus second: 2 to 3 | 70 | 0 |
| Best minus second: 1 | 68 | 258 |
| Best minus second: 0 (tie) | 191 | 207 |
| Best option's date of birth: match / conflict / no signal | 263 / 21 / 255 | 0 / 0 / 465 |
| Best option's shirt: match / conflict / no signal | 206 / 113 / 220 | 258 / 150 / 57 |
| Best option's position: match / conflict / no signal | 464 / 51 / 24 | 465 / 0 / 0 |
| Registered with another team (flag) | 32 | 0 |
| Incomplete squad (flag) | 0 | 16 |
| Two squads (flag) | 2 | 0 |

Options per candidate: minimum 24, median 37, maximum 74 (the 74 is a two-squad candidate).
Options with no date-of-birth conflict per candidate: minimum 3, median 31, maximum 64.

Across all 39,646 pairs: date of birth matches 264 times and conflicts 13,384 times (a conflict
between two real dates is common for two different people, which is why a conflict costs only 2
points); shirt matches 674; position matches 11,233 and disagrees 27,482.

**What this says about the queue.** Sofascore carries a date of birth, and it is what makes a
candidate rankable: 263 of 539 have an app player at the club with the same date of birth. For
Flashscore, which carries none, the queue is a shirt-and-position list: 207 of 465 are tied at the
top, the rest lead by one point, and the best possible score is 2.

## 5. Preview categories (a way to read the queue, never a decision)

The signals that put a candidate in each category, from independent structured evidence only:

- **D, conflict or needs manual investigation.** The best option has a date-of-birth conflict or a
  position disagreement; or the candidate sits in two squads; or the provider registers the player
  with another team.
- **A, very strong reviewer suggestion.** None of D applies, and: exactly one best option; its
  date of birth matches (valid on both sides, neither on 1 January); no other option matches the
  date of birth; the best option has no shirt or position conflict; the squad is complete.
- **B, plausible but ambiguous.** None of D or A applies, and the best option scores above zero
  (tied, several date-of-birth matches, no comparable date of birth, or an incomplete squad).
- **C, insufficient evidence.** No option carries an agreeing signal.

| | Sofascore | Flashscore | Total |
| --- | --- | --- | --- |
| **A** | 192 | 0 | 192 |
| **B** | 228 | 465 | 693 |
| **C** | 21 | 0 | 21 |
| **D** | 98 | 0 | 98 |

- All 192 in A also match on shirt or position (110 match on both); the rule itself only requires
  that neither conflicts.
- Of the 98 in D: 21 have a best option whose date of birth conflicts, 51 a position
  disagreement, 2 sit in two squads, 32 are registered with another team (a candidate can have
  more than one reason).
- Of the 228 in B (Sofascore): 207 have no comparable date of birth and are ranked on shirt and
  position alone, and 21 match on date of birth but with a shirt difference. 137 of the 228 lead
  with a tie.
- 465 Flashscore candidates are all B: the structured evidence available to them never reaches
  the bar for A.

Moving a candidate between categories needs more evidence, not a new threshold. **No category
creates a proposal or a mapping, and none was used to approve anything.**

## 6. Cross-provider pairing preview

There is no incident or lineup evidence to pair a Sofascore identity with a Flashscore identity:
no table stores Sofascore or Flashscore player ids against lineups, incidents or appearances (the
only provider-id table is `football_provider_mappings`, which holds 0 rows for these two
providers). So the preview uses only the approved structured signals, never a name.

It counts app players that exactly one provider candidate ranks uniquely first
(606 candidates have a unique best option: 348 Sofascore and 258 Flashscore; 398 are tied and
cannot be placed):

| | Count |
| --- | --- |
| App players claimed by a unique best option | 397 |
| **Linked pairs**: one Sofascore and one Flashscore candidate both rank the same app player first | **144** |
| of which the Sofascore side is category A | 81 |
| of which the two providers agree or are silent on position and shirt | 122 |
| of which the two providers **disagree** on position or shirt | **22** |
| One-provider-only: Sofascore only / Flashscore only | 148 / 71 |
| Ambiguous: several candidates claim the same app player (34 app players, 99 candidates) | 34 |

A linked pair is two independent weak-to-strong readings that agree; it is a reading aid, not
evidence that they are the same person, and it was not used to propose anything.

## 7. Anomalies for the owner to look at

1. **Flashscore carries no date of birth, ever** (465 of 465 `not_provided`). Its candidates can be
   ranked only on shirt and position, 207 are tied at the top, and none can reach category A alone.
2. **372 of 993 app players (37%) have no active team membership.** They are in no club's option
   list. 53 Sofascore candidates have a date-of-birth match with an app player at a different club,
   and 17 more match one with no membership at all. The reviewer screen can widen "same club" to
   "all players" for this.
3. **135 of the 450 Sofascore candidates with a usable date of birth match no app player anywhere.**
   Likely players the app catalogue does not have.
4. **App date of birth is thin:** 227 of 993 are missing and 33 fall on 1 January, so a date of
   birth is comparable for 733.
5. **32 Sofascore candidates are registered with another team**, 8 observations of Widad Témara's
   26 (about 30% of its Sofascore squad). They are flagged and read as category D.
6. **21 Sofascore candidates have a best option whose date of birth conflicts** (no same-club
   player does better), and a further 21 have no agreeing signal at all: probably not in the
   app's roster for that club.
7. **22 linked pairs disagree on position or shirt between the two providers.**
8. **Widad Témara:** the app has 24 players for a Sofascore squad of 26 and a Flashscore squad of
   16 (incomplete). It is the club to treat with the most care.
9. **Shirt disagreement is not penalised by the score** (only position is: −1). The best option
   carries a shirt conflict for 113 Sofascore and 150 Flashscore candidates, so the flag matters
   more than the number.
10. **A same-club filter is not enough for the 2 two-squad candidates:** both clubs' players are
    offered (76 options).

## What this does not authorize

Creating a proposal, executing a mapping, scheduling anything, repairing a squad, changing the
ranking weights.
