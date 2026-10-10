# GW1 fixture 19874711: identity change table and stop (1 Oct 2026)

**Result: BLOCKED_ON_711_IDENTITY.** One player in the lineup has no position anywhere in
the provider data, so the existing rules cannot place him. The pre-rehearsal risk check
therefore stopped the work **before** the rehearsal, as instructed. No rehearsal, record,
apply or ingestion was run. The only production write was the one authorized Observe row.

## Boundary (checked 11:4x to 11:53 UTC)

Orchestrator `disabled_manually`; tick and live refresh `false`; no production run queued
or running (only a CI check on a draft PR); GW1 `provisional`, scoring input version 19;
705 and 708 ready; 706, 707, 709, 710, 711 pending; main `5f2d0c34...`; 711 has no
performance or coverage rows; no unfinished cron job.

## Provider shape today (read-only diagnose, run 36857665428)

Verdict `pass`, `writesAttempted: false`. Lineup: **39 players, identical** (same provider
ids, same clubs, same starter flags) to the earlier one; 22 starters, **11 per side**; 93
detail rows, 0 invalid; scoring statistics complete; goalkeeper statistics
`explicit_value_or_null_canonical_position_checked_in_database`; 365 absent statistics
counted as zero; goals conceded 4 from the timeline, 0 from the final score; no missing
statistic rows. So the remaining non-identity validation passes on the current payload
(the importer's goal reconciliation and 11-a-side checks are part of that verdict).

## Fresh Observe

Run 36857830997 (`football-current-player-list.yml`, main `5f2d0c34...`, fixture
19874711 only). Observation `1940fd19-f07d-4eac-88c9-dc552317422c`, observed 11:50:22
UTC (recording needs one under 30 minutes: until about 12:19 UTC), 16 clubs, 1 lineup of
39 players. Observations 8 to 9; nothing else changed (21 tables compared by content hash).

## Unresolved set: 12 players (8 unmapped, 4 mapped without a 2026/27 club record)

Clubs: CR Khemis Zemamra (provider team 227263) and Maghreb Fès (16858). Identified by
provider id only. Positions are the provider's; where the lineup and the club squad
disagree both are shown.

| Provider id | Name | Club (kickoff) | Provider position | Class | Planned change | Fantasy action | Price |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 37574426 | Oussama Dahr | Khemis Zemamra | midfielder (lineup and squad) | A new identity | create player, mapping, club record | add | MID 7.20 |
| 37759312 | Amine El Moutaouakil | Khemis Zemamra | midfielder (lineup) | A new identity | create player, mapping, club record | add | MID 7.20 |
| 38227310 | Mouad Mouzalim | Khemis Zemamra | midfielder | A new identity | create player, mapping, club record | add | MID 7.20 |
| 38227313 | Mouad Rahni | Khemis Zemamra | forward | A new identity | create player, mapping, club record | add | FWD 7.20 |
| 38227314 | Issam Jaafra | Khemis Zemamra | forward | A new identity | create player, mapping, club record | add | FWD 7.20 |
| 38227320 | Youssef Hafidi | Maghreb Fès | forward | A new identity | create player, mapping, club record | add | FWD 7.20 |
| 38227321 | Achraf Eddahbi | Khemis Zemamra | midfielder (lineup) | A new identity | create player, mapping, club record | add | MID 7.20 |
| 37758313 | Aiman El Aatga | Khemis Zemamra | defender (lineup) | B existing player, no 2026/27 club | add club record (mapping exists) | add | DEF 5.00 |
| 37780256 | Jawad Essaghir | Khemis Zemamra | lineup forward, squad midfielder; canonical forward | B | add club record | add | FWD 7.20 |
| 37947940 | Mounir El Gouj | Maghreb Fès | midfielder | B | add club record | add | MID 8.10 (rating 6.7, confidence 1.0, from 24 stored performances) |
| 37701584 | Youssef Dalouzi | Khemis Zemamra | lineup forward, squad midfielder; canonical midfielder | **C and D** existing player moving club | move club record Maghreb Fès to Khemis Zemamra | **move**, price unchanged 7.20 | |
| **38227322** | Soufane Abderrahmane | Khemis Zemamra (substitute, shirt 21) | **none: position null in the lineup, in no club squad** | unmapped, no canonical player, no date of birth | **none: the plan skips him (`skip_no_position`)** | none | |

Plan counts for the 11 placeable players: 7 additions of a player (A), 3 club records for
existing players (B), 1 move (C and D). 10 Fantasy additions, 1 Fantasy move. Matching is by
provider id and club, never by name (El Aatga's provider display name differs from the
canonical one; he matched by his existing provider mapping).

### The one club move (C and D): provider 37701584

- Old: Maghreb Fès, 2026/27 record 2026-09-24 to 2027-06-30 (active). New: Khemis Zemamra.
- Evidence for the new club at kickoff: the provider's 27 Sept lineup places him in team
  227263, and the provider's club squad in the 1 Oct observation lists him at 227263
  (shirt 9).
- What the apply does (read in `20260925200000_...sql`, steps 2, 4, 5): **deletes** his other
  2026/27 club records (kept in the apply's result), inserts a full-season record at the new
  club, and sets his Fantasy player's club to the new club. Squads keep the player; price
  stays 7.20.
- History: his 2024/25 and 2025/26 club records are untouched; his 20 stored performance
  rows are all 2025/26 at Maghreb Fès; he has **0** rows in 2026/27 fixtures and **0** point
  events, so no stored fixture or scoring is affected.
- **Held? No.** From production now: 0 squad memberships ever, 0 lineup rows (locked or
  not), 0 transfers, 0 point events. No GW1 lineup player changes fixture association.
- Position: Fantasy MID stays (a move does not change position); the provider's lineup says
  forward, its squad says midfielder.

## Risk check before rehearsal

| Condition | Result |
| --- | --- |
| Any held Fantasy player would move | no (Dalouzi unheld, reconfirmed) |
| Any locked GW1 lineup player changes fixture association | no (none of the 12 is in a lineup) |
| Any player lacks a resolvable position | **yes: 38227322** |
| Any identity ambiguous | no (all by provider id) |
| Plan extends beyond the 711 unresolved set | no (the full observation plan has 119 changes; only these 11 are in scope) |
| Club-limit violations | 0 in the full plan (the scoped plan was not computed) |

The full-observation plan also lists five other players as `skip_ambiguous_club`: none is in
fixture 711's lineup.

## Why this is the same class as 707

Provider player 38227322 has no position in the lineup, appears in no club squad, and has no
canonical record. The importer needs a canonical player with a mapping and a club record, so
711 would keep failing with `PLAYER_MAPPING_NOT_FOUND` until he is resolved. The existing
plan cannot invent a position, and none was guessed. This is the same decision the 707 case
(provider 37541460) needs. He is a substitute (not a starter) and no Fantasy player or
Fantasy team is involved.

## Not produced because of the stop

The scoped plan digest, the rehearsal result and the rollback proof. The scoped digest
needs the scoped observation, which is created inside the rehearsal.

## Smallest next decision

The verified position of provider player 38227322 from an official source (and, if known,
his date of birth), or an owner decision on how a lineup player with no resolvable identity
is treated for 707 and 711 together. With a position, the existing mechanism still skips him
(it cannot place a player the provider gives no position), so a reviewed variant is needed
before the one rehearsal; the 11 other placements are ready and unchanged. The Observe
stays valid for recording until about 12:19 UTC; after that a fresh Observe is needed.
