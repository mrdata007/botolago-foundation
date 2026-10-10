# Maghreb Fes - Zemamra: the remaining identity gaps, as one worklist

Read-only analysis. Nothing here proposes, approves or maps anything; production was only read (a catalogue read on 2026-10-03, ids and flags only, saved in `tests/fixtures/identity/mas-zemamra-catalog-reads-2026-10-03.json`). No provider request was made for this analysis (28 of 32 were used earlier; 4 remain). Rebuild it with `bun scripts/backend/resolve-mas-zemamra-identities.ts` and `bun scripts/backend/mas-zemamra-canary-plan.ts`.

## How each identity was assessed

For each Sofascore player who appeared and has no reviewed mapping, the provider's exact birth date was compared, inside the database, with the **whole catalogue** (not only the club he was observed at), and with the app's memberships, mappings and Fantasy flags. Never used: a name, a shirt number on its own, a guessed birth date, an invented position. "Not found by this matcher" is never "does not exist", and a missing review-workflow record is never a missing canonical player.

An identity link is only a link. **A mapping would not move a player's Fantasy club, position, price, locked-lineup association or historical scoring**; where the catalogue and the provider disagree about the club, that is a membership question that needs dated evidence, never a silent change.

## The 22 identities

| Sofascore id | Side / position | Appeared as    | Scoring-relevant   | Class                                | Code                                   | Differs from catalogue by | Fantasy      | What would settle it                                                                                 |
| ------------ | --------------- | -------------- | ------------------ | ------------------------------------ | -------------------------------------- | ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| 1096751      | home M          | starter        | yes: assister      | EXISTING_CANONICAL_PLAYER_IDENTIFIED | `EXACT_DOB_CLUB_POSITION_DIFFERS`      | position                  | catalogue    | nothing: identity established                                                                        |
| 1140961      | home M          | substituted in | no                 | EXISTING_CANONICAL_PLAYER_IDENTIFIED | `EXACT_DOB_CLUB_POSITION_DIFFERS`      | position                  | locked squad | nothing: identity established                                                                        |
| 1525325      | away M          | starter        | no                 | EXISTING_CANONICAL_PLAYER_IDENTIFIED | `EXACT_DOB_CLUB_POSITION_DIFFERS`      | position                  | catalogue    | nothing: identity established                                                                        |
| 1919299      | home M          | substituted in | yes: scorer        | EXISTING_CANONICAL_PLAYER_IDENTIFIED | `EXACT_DOB_CLUB_POSITION_DIFFERS`      | position                  | catalogue    | nothing: identity established                                                                        |
| 544156       | home M          | starter        | no                 | EXISTING_CANONICAL_PLAYER_IDENTIFIED | `EXACT_DOB_CLUB_POSITION_DIFFERS`      | position                  | catalogue    | nothing: identity established                                                                        |
| 1182110      | home D          | substituted in | no                 | EXISTING_CANONICAL_PLAYER_IDENTIFIED | `EXACT_DOB_CLUB_SHIRT_DIFFERS`         | shirt                     | catalogue    | nothing: identity established                                                                        |
| 919340       | away D          | starter        | no                 | EXISTING_CANONICAL_PLAYER_IDENTIFIED | `EXACT_DOB_CLUB_SHIRT_DIFFERS`         | shirt                     | catalogue    | nothing: identity established                                                                        |
| 2161842      | home M          | substituted in | no                 | MEMBERSHIP_CORRECTION_NEEDED         | `CATALOGUE_HAS_NO_ACTIVE_MEMBERSHIP`   | -                         | -            | dated evidence of his club membership on the match date                                              |
| 1213241      | away M          | substituted in | no                 | MEMBERSHIP_CORRECTION_NEEDED         | `CATALOGUE_PLACES_HIM_AT_ANOTHER_CLUB` | -                         | locked squad | dated evidence of his club on the match date                                                         |
| 1866448      | away D          | starter        | no                 | CANDIDATE_RECORD_MISSING             | `NO_REVIEW_WORKFLOW_RECORD`            | -                         | -            | a candidate record for this id (a collector write, not authorised)                                   |
| 919753       | away G          | starter        | goalkeeper         | CANDIDATE_RECORD_MISSING             | `NO_REVIEW_WORKFLOW_RECORD`            | -                         | -            | a candidate record for this id (a collector write, not authorised)                                   |
| 1525293      | away D          | starter        | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `APP_DOB_MISSING_FOR_POSSIBLE_TARGETS` | -                         | -            | a catalogue birth date for the 6 unmapped club players who have none (position cannot rule them out) |
| 1528418      | away M          | substituted in | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `APP_DOB_MISSING_FOR_POSSIBLE_TARGETS` | -                         | -            | a catalogue birth date for the 6 unmapped club players who have none (position cannot rule them out) |
| 1894253      | away F          | starter        | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `APP_DOB_MISSING_FOR_POSSIBLE_TARGETS` | -                         | -            | a catalogue birth date for the 6 unmapped club players who have none (position cannot rule them out) |
| 1919276      | away M          | starter        | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `APP_DOB_MISSING_FOR_POSSIBLE_TARGETS` | -                         | -            | a catalogue birth date for the 6 unmapped club players who have none (position cannot rule them out) |
| 1939981      | away F          | starter        | yes: scorer/carded | MAPPING_EVIDENCE_INSUFFICIENT        | `APP_DOB_MISSING_FOR_POSSIBLE_TARGETS` | -                         | -            | a catalogue birth date for the 6 unmapped club players who have none (position cannot rule them out) |
| 2150417      | home M          | starter        | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `APP_DOB_MISSING_FOR_POSSIBLE_TARGETS` | -                         | -            | a catalogue birth date for the 6 unmapped club players who have none (position cannot rule them out) |
| 2776292      | away M          | starter        | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `APP_DOB_MISSING_FOR_POSSIBLE_TARGETS` | -                         | -            | a catalogue birth date for the 6 unmapped club players who have none (position cannot rule them out) |
| 2790119      | away M          | substituted in | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `APP_DOB_MISSING_FOR_POSSIBLE_TARGETS` | -                         | -            | a catalogue birth date for the 6 unmapped club players who have none (position cannot rule them out) |
| 1004523      | home D          | starter        | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `PROVIDER_DOB_UNUSABLE`                | -                         | -            | a usable provider birth date                                                                         |
| 2790099      | away M          | substituted in | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `PROVIDER_DOB_UNUSABLE`                | -                         | -            | a usable provider birth date                                                                         |
| 2776291      | away M          | starter        | no                 | MAPPING_EVIDENCE_INSUFFICIENT        | `TARGET_ALREADY_REPRESENTED`           | -                         | -            | a structured signal that separates two ids, or confirms they are one person                          |

Counts: 7 identified, 2 membership questions, 2 missing candidate records, 11 insufficient (8 where club players have no catalogue birth date, 2 where the provider's own date is unusable, 1 where the date already belongs to another Sofascore id).

### In plain words

- **The 7 that contradict the catalogue (5 position, 2 shirt).** Exact birth date, same club, one possible player, an active SportsMonks identity on him. What differs is metadata (position or shirt), not the person and not the club. Identity confidence is high; the differences are named, and nothing corrects the catalogue. The 5 position cases would be parked by the existing workflow for a position note and an explicit acknowledgement (that is the owner's decision, not a manifest edit). One of the 7 (`1140961`) is in a locked Fantasy squad; linking him moves nothing in it.
- **The 2 membership questions.** `2161842`: the catalogue has no active membership for the man whose birth date matches. `1213241`: the catalogue has him at another club, and he is in a locked Fantasy squad. Neither is changed here. Each needs dated evidence of which club he played for on the match date.
- **The 2 missing records.** `919753` (the away goalkeeper) and `1866448` have no review-workflow record at all, so their dates cannot be compared inside the database. That is a missing workflow record. Creating one is a collector write that has not been authorised.
- **The 11 insufficient.** Eight have no exact birth date match anywhere, and 6 unmapped players of their club have a missing or placeholder catalogue birth date (position cannot rule them out, since it is metadata the sources disagree about), so a person among them cannot be proven or excluded. Two have no usable provider birth date. One (`2776291`) shares a birth date with a player who already has a different Sofascore id: either two ids for one person or two people with one date. No duplicate was created for any of them.

## Where the match stands: A, B, C, kept apart

- **A** = the reviewed mappings that exist today (production).
- **B** = A plus the **executable** Flashscore rows (HYPOTHETICAL: not proposed, approved or mapped). 7 of the 42 are in this match.
- **C** = B plus the 7 catalogue-identified Sofascore identities (HYPOTHETICAL).

|                  | Sofascore players unresolved (of 31) | of those, scoring-relevant | Flashscore players unresolved (of 31) | Identities resolved | Ingestion ready |
| ---------------- | ------------------------------------ | -------------------------- | ------------------------------------- | ------------------- | --------------- |
| A (today)        | 22                                   | 3                          | 31                                    | no                  | no              |
| B (hypothetical) | 22                                   | 3                          | 24                                    | no                  | no              |
| C (hypothetical) | 15                                   | 1 (+ the goalkeeper)       | 24                                    | no                  | no              |

Two more Flashscore ids of this match get evidence only after those Sofascore mappings exist; that is a later batch and is not in the 42.

Reported separately, because they are different findings:

- **Canonical identity completeness:** not complete in A, B or C. After C, 15 Sofascore identities and 24 Flashscore identities are unresolved.
- **Match-date membership issues:** 2 (`2161842`, `1213241`; the second in a locked squad). Unresolved, not changed.
- **Event reconciliation:** reconciled in all three, as the replay measures it.
- **Participation evidence:** established in all three.
- **Scoring-field readiness:** ready in all three.

**The match must not be called complete.** Even in C the away goalkeeper (`919753`, no workflow record) and a scorer who was also carded (`1939981`, the catalogue birth date of his possible targets is missing) are unresolved, and 13 other Sofascore identities are still unresolved. Full resolution is impossible with the operations now authorised; the specific evidence missing is in the last column of the table.

## Proposed operations for a complete staging canary (a plan, not a request)

Dependencies are in brackets. None of these is 22 separate approvals.

1. **Run the Flashscore batch** (42 rows, PR "Bulk mapping: extend the controlled batch tool to Flashscore evidence rows"). [needs that tool merged; owner runs propose, approve, execute]. Effect here: 7 Flashscore ids of this match.
2. **Link the 7 identified Sofascore players.** Two (shirt difference) go through the normal proposal; five need an explicit position note and acknowledgement. [needs a decision on the five position notes; independent of 1]. Effect: Sofascore 22 -> 15; two more Flashscore ids get evidence (a second, small Flashscore batch, after 2).
3. **Create candidate records for `919753` and `1866448`** (a collector run over their squads), then re-run this resolution. [owner authorisation of the write; may need one of the 4 remaining provider requests]. Effect: both can be compared by birth date.
4. **Settle the catalogue birth dates** of the club players who lack one (Fes: 6 missing; Zemamra: 5 missing and 1 placeholder), from a stated source, through the existing attribute resolver. [owner authorisation of a player-attribute correction batch; the source must be named]. Effect: the 8 "insufficient" identities become findable by exact birth date, and re-run through 2.
5. **Dated evidence for the 2 membership questions.** [owner supplies or authorises dated evidence; no membership is assumed]. Effect: 2 become identified or are confirmed as other players.
6. **Decide `2776291`** (two ids or two people). [structured evidence that separates them].
7. **The two placeholder provider dates** (`1004523`, `2790099`): one Sofascore lineup request for this match may carry usable dates (not asserted). [one of the 4 remaining requests, only if wanted].
8. **Staging canary:** replay this match in staging with the reviewed mappings as they then stand, ingest, and compare with the replay. [1 to 7 as far as they go; no scoring in production].

### One consolidated decision for the owner

(a) run the Flashscore batch as prepared (42 rows) or change it; (b) the 11 held-back Flashscore rows: leave out, or decide each; (c) the five position notes for step 2; (d) authorise step 3 (candidate records) and name whether to spend a provider request; (e) authorise step 4 with a named source for the 12 birth dates, or say no; (f) supply dated club evidence for step 5.
