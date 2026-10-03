# Maghreb Fes - Zemamra: the evidence plan

Read-only work. Nothing was proposed, approved, mapped, recorded, ingested or scored, and no provider request was made (4 of the 32 are still unused). Production (`tkewgajrljbwgwedqsxn`) was only read, on 2026-10-03, with `select` queries; at the start and again at the end of the work it held the same 191 active Sofascore mappings, 191 proposals (none open) and 769 attribute observations. The reads are saved as ids and flags in `tests/fixtures/identity/mas-zemamra-evidence-reads-2026-10-03.json`. Rebuild everything here with `bun scripts/backend/mas-zemamra-evidence-plan.ts` (its test is `mas-zemamra-evidence-plan.test.ts`). This page adds to [the first worklist](FANTASY_MAS_ZEMAMRA_IDENTITY_RESOLUTION.md) and leaves it as it was.

No name and no birth date is written in this page, in the script or in the saved reads. A test checks that.

## What was found

1. **A second source for birth dates was already in the database.** SportsMonks (SM) squads and match lineups were stored on 25 September to 1 October, with a birth date per player. SM is tied to our players by active mappings that were reviewed long ago, so an SM date does not depend on the Sofascore match under test. Nobody has to type anything for it.
2. **Of the 12 club players with no usable catalogue date, 4 have an SM date; 8 have no source at all.** The import path writes a date only when it adds a new player, so these 4 were never recorded.
3. **Five of the 22 classes are supported to change** (table below). No class was changed anywhere; this is what the evidence supports.
4. **The seven identified players are as sure as before.** One of them (`1096751`) now has a flag: SM changed its own date for him after match day.
5. **The two missing candidate ids are different from the rest.** Sofascore lists both under another club, which is why a club-squad collector never saw them. The goalkeeper has a medium-confidence canonical target; the defender has only a low one.
6. **`2161842` is settled on the facts** (SM's lineup for this match lists him at Fes). **`1213241` is not**: the evidence points to two SM ids for one date, and nothing yet says they are one person.

## 1. The 22 identities: class now, and what the evidence supports

"Supports" means new independent evidence exists. A class is never moved without it.

| Sofascore id | Class now                     | New independent evidence                                                                                                 | Class the evidence supports    | What remains                                       |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------- |
| 544156       | identified (position differs) | none new                                                                                                                 | same                           | link with note                                     |
| 919340       | identified (shirt differs)    | none new                                                                                                                 | same                           | link                                               |
| 1096751      | identified (position differs) | SM changed its own date after match day; it no longer equals the catalogue or Sofascore (the earlier SM value did)       | same, with a flag              | link with note; owner sees the flag                |
| 1140961      | identified (position differs) | none new                                                                                                                 | same                           | link with note (locked squad; nothing moves)       |
| 1182110      | identified (shirt differs)    | none new                                                                                                                 | same                           | link                                               |
| 1525325      | identified (position differs) | none new                                                                                                                 | same                           | link with note                                     |
| 1919299      | identified (position differs) | none new                                                                                                                 | same                           | link with note                                     |
| 2150417      | insufficient                  | an SM date, via an active mapping, equals Sofascore's; one SM player, one Sofascore id; target active at Fes             | **identified**                 | record the SM date, re-run, then link              |
| 1525293      | insufficient                  | SM's latest date equals Sofascore's; the catalogue date differs (it equals SM's earlier value); target active at Zemamra | **other attribute conflict**   | decide the catalogue date, then link               |
| 1528418      | insufficient                  | as `2150417`, but SM and Sofascore both put him at Zemamra on match day; the catalogue has him at Fes                    | **membership question**        | decision (see 5)                                   |
| 1939981      | insufficient                  | as `2150417`; catalogue has no active membership; he is not in the Fantasy catalogue                                     | **membership question**        | decision (see 5)                                   |
| 2776292      | insufficient                  | SM lists a registered player with this date; the app has nobody with it                                                  | **canonical player not found** | import decision (the app lacks him, not a mapping) |
| 2161842      | membership question           | SM's lineup for this match lists him at Fes; same canonical player                                                       | same (evidence now enough)     | owner decision (see 5)                             |
| 1213241      | membership question           | SM's lineup lists a different SM id with his date at Zemamra, mapped to nobody                                           | same                           | identity: are the two SM ids one person?           |
| 919753       | candidate record missing      | one lineup-slot target, medium confidence                                                                                | same                           | a candidate record (write), then compare dates     |
| 1866448      | candidate record missing      | one lineup-slot target, low confidence; no date exists for it                                                            | same                           | a candidate record and a date for the target       |
| 2776291      | insufficient (date shared)    | SM also has two ids with this date, one old and one new: the same pattern                                                | same                           | something that separates two ids from one person   |
| 1894253      | insufficient                  | none: no SM player has his date                                                                                          | same                           | nothing available                                  |
| 1919276      | insufficient                  | none                                                                                                                     | same                           | nothing available                                  |
| 2790119      | insufficient                  | none                                                                                                                     | same                           | nothing available                                  |
| 1004523      | insufficient (provider date)  | none: his Sofascore date is a 1 January placeholder                                                                      | same                           | a usable provider date                             |
| 2790099      | insufficient (provider date)  | none: his Sofascore date is missing                                                                                      | same                           | a usable provider date                             |

Count now: 11 insufficient, 7 identified, 2 membership, 2 missing record. Count the evidence supports: 8 identified, 4 membership, 1 other attribute conflict, 1 not found, 2 missing record, 6 insufficient.

## 2. The seven identified identities

The proposal item that would be sent for each is the same shape, from the existing workflow (`ProposeItem`, kind `map`). No evidence references are needed.

```json
{
  "kind": "map",
  "sofascoreCandidateId": "<candidate id>",
  "appPlayerId": "<app player id>",
  "basis": "manual"
}
```

I re-read the seven candidates: all `unmapped`, evidence revision 2, no proposal, no mapping.

| Sofascore id | Candidate id                           | App player id                          | Differs from the catalogue by     | Position note and acknowledgement |
| ------------ | -------------------------------------- | -------------------------------------- | --------------------------------- | --------------------------------- |
| 544156       | `3feaa436-2e95-499d-920d-104131cfd948` | `cdda738e-7b3b-4de7-922c-3cff32f55f8e` | position: provider M, catalogue F | **needed**                        |
| 919340       | `c11c03aa-ec5e-43ed-8b45-0c484831628f` | `924c59cd-afdb-4c05-a49a-58a985b79d70` | shirt (position agrees)           | not needed                        |
| 1096751      | `27712c2d-2d25-4328-9e3d-e8604bad13ed` | `18a56065-bd3c-42a4-a36e-314123f145d1` | position: provider M, catalogue F | **needed**                        |
| 1140961      | `68ef9731-fdea-46c3-8151-b7c574c2ab0d` | `9be4bcf8-4e0d-4e76-a630-3c120e1c903d` | position: provider M, catalogue F | **needed**                        |
| 1182110      | `4b3c18ed-c1e8-4af6-b681-a75221309eaa` | `8711cce0-3af4-49a9-9035-fabe7dd528bc` | shirt (position agrees)           | not needed                        |
| 1525325      | `c1c46fee-66ca-4e96-9330-2cee0d0d9135` | `50a8ea2c-9559-46d5-8cf3-0da879aabb0b` | position: provider M, catalogue F | **needed**                        |
| 1919299      | `f67b699b-ae64-4a95-962f-d4efabb7c3c8` | `508e12ad-306c-45e2-b71d-45c0ba6f0f2b` | position: provider M, catalogue F | **needed**                        |

The existing workflow holds the five position proposals until someone records a note and acknowledges the difference. Nothing was recorded.

**The discrepancy notes, exact text (10 to 500 characters each; facts only, no name, no date).** Each is the note the owner would record for that proposal, and nothing here has been recorded.

| Sofascore id                          | Note                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 544156, 1140961, 1525325, 1919299     | `Provider lists this player as a midfielder; the catalogue lists a forward. This link maps the identity only. It changes no canonical or Fantasy position, club, price or locked lineup. The difference is acknowledged, not resolved.`                 |
| 1096751                               | The same note, then: `The second provider (SportsMonks) changed its own birth date for this player between its 27 September and 1 October observations; the later value matches neither the catalogue nor Sofascore. Two of three sources still agree.` |
| 919340, 1182110 (no note is required) | For the reason field only: `The provider's match-day shirt differs from the catalogue's squad shirt; the position agrees. This link maps the identity only and changes nothing in the catalogue or in Fantasy.`                                         |

The five position cases are `544156`, `1096751`, `1140961`, `1525325` and `1919299`: the provider's position (midfielder) differs from the catalogue's (forward). The two shirt-only cases are `919340` and `1182110`.

**What a link leaves alone.** A mapping writes only the workflow tables and the provider mapping row (I read the functions: no `app.*` table is written). So it moves no player's Fantasy club, position, price, locked-lineup association or historical scoring. The state before the link, read now:

| Sofascore id | Fantasy club | Fantasy position | Price | Squads holding him | Locked GW1 lineups holding him |
| ------------ | ------------ | ---------------- | ----- | ------------------ | ------------------------------ |
| 544156       | Fes          | FWD              | 11.00 | 0                  | 0                              |
| 919340       | Zemamra      | MID              | 9.30  | 0                  | 0                              |
| 1096751      | Fes          | FWD              | 7.20  | 0                  | 0                              |
| 1140961      | Fes          | FWD              | 6.60  | **3**              | **2**                          |
| 1182110      | Fes          | DEF              | 5.10  | 0                  | 0                              |
| 1525325      | Zemamra      | FWD              | 7.20  | 0                  | 0                              |
| 1919299      | Fes          | FWD              | 7.20  | 0                  | 0                              |

Gameweek 1 is provisional; its lineups locked at the deadline on 2026-09-24 (6 of 6). All seven have one points row with 0 provisional points, and none has a performance row for this fixture (the app holds no lineup or performance rows for it at all). `1140961` sits in 3 squads and 2 locked lineups: linking him changes none of that. Reading this match later, with the link in place, is a separate step that does write performances.

**Is the identity independent?** Yes, in the way that matters: the Sofascore date was compared with the catalogue date, and the catalogue date was never copied from Sofascore. Its provenance is `legacy` (typed or imported before provenance existed), so it is unverified, but it is not Sofascore's. The SM date for these seven equals the catalogue date, so SM adds no new date check here (it may be where the catalogue date came from). What SM's match lineup adds is structure: for all seven, the same canonical player (through an active mapping) is in the SM lineup of this match, for the same club, with the same match-day shirt as Sofascore's lineup. That is a supporting signal, not proof.

**The one flag.** For `1096751`, SM's date changed between the observation of 27 September and the one of 1 October. The earlier SM value equals the catalogue and Sofascore; the later one equals neither. SM changed 4 players this way in that week (3 away from Sofascore's value, 1 towards it). Two of three sources still agree, so I leave him in the seven, flagged. The owner should see the flag before the position note is written.

## 3. The two missing candidate ids: `919753` and `1866448`

Two separate questions.

**The workflow row.** Neither has a candidate record. The committed lineup payload shows why a club-squad collector missed them: Sofascore lists the goalkeeper under team `241802` and the defender under team `118830`, while the other 16 Zemamra players, and the match itself, use `263373` (an unused substitute is also under `118830`). The collector reads only the 16 registered club squads (`CLUB_PROVIDER_TEAMS`), so these two teams are never asked. This is a missing record. It says nothing about whether a canonical player exists.

**The canonical target.** The committed payloads hold no birth date, so a date comparison is impossible today. What exists is one lineup slot each, the same fixture seen by SM (same club, same position, same match shirt):

| Sofascore id | Slot                             | Target (app player)                    | SM date for the target    | Confidence | Why                                                                                                                                                                                        |
| ------------ | -------------------------------- | -------------------------------------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 919753       | away goalkeeper, shirt 1, 90 min | `31b4f6f8-0b17-4d87-8c27-399ca096699e` | present, equals catalogue | medium     | the only goalkeeper with shirt 1 in SM's lineup (the other, shirt 22, was an unused substitute in Sofascore's); active Zemamra member; 23 SM appearances for Zemamra, January to July 2026 |
| 1866448      | away defender, shirt 14, 90 min  | `83d9f725-077b-4db4-8b49-6fedff80e05c` | none, catalogue none      | low        | the only defender with that shirt; only an old Zemamra membership; no date anywhere to check it against                                                                                    |

Neither is proof; a shirt and a position are not an identity. A date would settle the goalkeeper at once: his Sofascore date either equals the SM and catalogue date of `31b4f6f8` or it does not. The defender cannot be settled by date, because his target has none in SM or in the catalogue; it needs a date from a source other than the provider under test.

**The narrow candidate-recording plan (not done: it is a database write).** Two records, from the existing collector path, and nothing else:

1. Run the existing `collectSquads` with two custom entries (Sofascore teams `241802` and `118830`) and an injected `fetchJson` that sends the Sofascore requests only. That is 2 Sofascore requests (of the 4 left). The collector itself does not change; the call is a small one-off script.
2. Keep, in memory, only the two player ids; drop the rest of both squads.
3. Pass the two records to the existing recorder (`api.football_mapping_record_observations`) with a plain `clubKey` such as `sofascore-team-241802` (the contract only asks for a slug; `appTeamId` may be null).
4. Re-run the resolution. Nothing is proposed or mapped by this.

I could not do the in-memory date comparison myself: this environment holds no provider key, and the probe workflow has no database access.

## 4. The 12 club players with a null or placeholder catalogue date

Fes 6 (null), Zemamra 5 (null) and 1 (1 January placeholder). The date is never written here; the status column says only whether a source exists.

| Player (app id) | Club    | Catalogue   | Independent source          | Proposed value status                     | Provenance                                                         | Confidence | Unlocks (Sofascore ids)                        |
| --------------- | ------- | ----------- | --------------------------- | ----------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------------------------------------------- |
| `027db878`      | Fes     | null        | none                        | none available                            | no SM entry; no other observation                                  | none       | -                                              |
| `31373eab`      | Fes     | null        | SM squad entries            | available:sportsmonks-current-player-list | SM id, active mapping: 4 of 7 entries carry one date, 3 carry none | medium     | none (no Sofascore id has the date)            |
| `378fc432`      | Fes     | null        | SM squad and lineup entries | available:sportsmonks-current-player-list | 5 of 5 entries, one date; in this match's lineup                   | medium     | **2150417**                                    |
| `6cd0cc61`      | Fes     | null        | SM squad and lineup entries | available:sportsmonks-current-player-list | 5 of 5 entries, one date; SM lists him for Zemamra                 | medium     | **1528418** (membership question)              |
| `6e098f0c`      | Fes     | null        | none                        | none available                            | no SM entry                                                        | none       | -                                              |
| `ba5850ab`      | Fes     | null        | none                        | none available                            | no SM entry                                                        | none       | -                                              |
| `469b5717`      | Zemamra | null        | none                        | none available                            | no SM entry                                                        | none       | -                                              |
| `5c9288e3`      | Zemamra | null        | none                        | none available                            | no SM entry                                                        | none       | -                                              |
| `7fadf7f2`      | Zemamra | null        | SM squad and lineup entries | available:sportsmonks-current-player-list | 5 of 5 entries, one date; in this match's lineup                   | medium     | 1008634 (unused substitute, not one of the 22) |
| `d56483a5`      | Zemamra | null        | none                        | none available                            | no SM entry                                                        | none       | -                                              |
| `da57009b`      | Zemamra | null        | none                        | none available                            | no SM entry                                                        | none       | -                                              |
| `e5aebe61`      | Zemamra | placeholder | none                        | none available                            | the placeholder is `legacy`; the Pepites snapshot only copies it   | none       | -                                              |

- **Why medium and not high.** One provider, tied through an established mapping, never copied from Sofascore. The four dates are the same in every stored entry, before and after the 1 October changes. But SM changed four other players' dates in the same week, so a single SM value is not final.
- **Not independent: none among the 12.** For none of the 12 is the only available date a tentatively matched Sofascore player's own. Where a Sofascore date exists for a possible target (`2150417`, `1528418`), it is compared with the SM date, never copied into the catalogue.
- **Other places looked at, and why they give nothing for the other 8.** Player attribute observations (none for 11 of the 12; one `legacy` for the placeholder), the Pepites run snapshots (a copy of the catalogue), historical performance rows (appearances, no dates of birth), the squad-import results table (empty), and the committed Sofascore and Flashscore payloads (no date at all: the keep-lists drop it).
- **Why the 8 have no SM entry.** They are in none of the 8 stored SM squads or lineups. That does not say they left: the catalogue's active rosters are much wider than SM's current squads (Fes 37 against 26, Zemamra 40 against 18), so absence from an SM squad is not evidence of anything.
- **Also found, outside the 12.** (a) `60958299` (the `1939981` target) and `e961626d` (the `1525293` target) have SM dates too; the first has none in the catalogue and no active membership, the second a catalogue date that differs. (b) SM's current Fes and Zemamra squads hold 21 registered players mapped to nobody in the app; 14 have a usable date, and 7 of those share their date with an existing app player (probably a second SM id for the same person). `2776292` is one of the other 7.
- **How an SM date would be recorded.** Through the existing attribute path as an observation with source `sportsmonks` and the stored observation as reference. It outranks `legacy`, so it becomes the catalogue date, with provenance. That is a write and needs the owner (step 2 below). Only the four players a Sofascore id needs are worth it: `378fc432`, `6cd0cc61`, `60958299`, `e961626d`.

## 5. The two membership questions

Two different things are kept apart: **who the person is** (global), and **which club he was at on the match date** (Sofascore fixture `17132481`, round 1 of 2026/27, kickoff 18:00 UTC on 2026-09-27, read from the committed payload; the app fixture has the same kickoff).

**`2161842`** (target `63b9a8cf`, no Fantasy player, in no squad).

- _Who:_ the same canonical person, with good confidence. His date equals the catalogue's, his SM id has an active mapping, and SM has a second, newer id with the same date at Fes (a likely duplicate, not a second person).
- _Club on match day:_ **dated evidence exists.** SM's lineup for this fixture (taken on 1 October) lists him under Fes with shirt 31, the same match shirt as Sofascore's lineup. The catalogue's only membership is another club, closed on 2026-07-05; he has 24 performance rows (22 appearances) for that club in 2025/26 and none after.
- _What it supports:_ he played for Fes on 2026-09-27. It does not say from when. SM added him to Fes's season squad between the 27 September and 1 October observations. I propose no membership rewrite. If the owner wants the catalogue to show him at Fes, the only date the evidence proves is the match day.
- _Locked squads:_ none holds him. A link or a membership change moves no locked squad.

**`1213241`** (catalogue target `88076e6e`, a Berkane player).

- _Who:_ **not settled.** The catalogue has him at Berkane (an active 2026/27 membership created on 17 September and valid from 24 September, like every other 2026/27 membership I read, plus two closed seasons and 5 appearances in 2025/26). SM's lineup for this match lists a Zemamra midfielder with his date, shirt 16 (Sofascore's match shirt is 16 too), under a different SM id that no app player carries. The canonical player's own SM id is in none of the stored squads or lineups, but that proves nothing (see section 4). So one date, two SM ids: one person who changed club and has two SM records, or two people born on one day.
- _Club on match day:_ the evidence says the person with that date played for Zemamra. It cannot say the canonical Berkane player did, until the identity is settled.
- _Locked squads:_ **3 squads hold the canonical player, 2 in a locked GW1 lineup; his Fantasy player is a Berkane MID at 6.90.** A link moves none of it. A membership change would change his Fantasy club and price: that is the owner's decision and needs the evidence below.
- _What is missing:_ dated evidence for the canonical player himself. Any one of these would do: (a) an SM player read for both SM ids, to see whether they are one person (SM, not part of the 32 Sofascore/Flashscore requests); (b) Sofascore's dated transfer history for `1213241` (one of the 4 requests; the endpoint is not verified in this repository, and the probe prints a list for a player, so I did not guess); (c) Berkane's own match-day squad for 2026-09-27.

**Two more of the same kind, found by the SM lineup.** `6cd0cc61` (`1528418`) is active at Fes in the catalogue with a Fantasy player, while SM and Sofascore both list him at Zemamra on match day (the catalogue shows him at Fes through 2025/26: SM appearances to 2026-07-05). `60958299` (`1939981`) has no active membership and no Fantasy player. The same rule applies: link first if the owner wants, no membership change without dates.

## 6. One consolidated change proposal (a plan; nothing is executed)

Before any write: check what else is writing to the same database (`AGENTS.md`), and pause the jobs that touch players and memberships. "Needs owner" means a separate approval for that operation.

| #   | Operation                                                                                                                                                                                       | Depends on                | Write?                         | Needs owner                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------ | --------------------------------- |
| 1   | Read: re-run `resolve-mas-zemamra-identities.ts` and this plan before and after each write below.                                                                                               | -                         | no                             | no                                |
| 2   | Record SM's current date as an attribute observation for `378fc432`, `6cd0cc61`, `60958299`, `e961626d` (the 4 a Sofascore id needs). Source `sportsmonks`, reference = the stored observation. | 1                         | **yes**                        | **yes**                           |
| 3   | Propose, note, approve and execute the 7 identified links (notes for the 5 position cases). Owner sees the `1096751` flag first.                                                                | -                         | **yes**                        | **yes**                           |
| 4   | After 2: re-run. Expected, not claimed: `2150417` and `1525293` become identified and join a second small link batch; `1528418` and `1939981` become membership questions.                      | 2                         | no, then **yes** for the batch | **yes**                           |
| 5   | Candidate records for `919753` and `1866448`: 2 Sofascore requests, then one recorder call with 2 records (section 3). Then re-run and compare the goalkeeper's date.                           | 1                         | **yes**                        | **yes**; also 2 of the 4 requests |
| 6   | Decide membership for `2161842`, `1528418`, `1939981`: link only, or also add a match-day membership. Never a season rewrite.                                                                   | 3, 4                      | **yes** if chosen              | **yes**                           |
| 7   | `1213241`: get one of the three pieces of dated evidence in section 5. Read-only; it may use 1 of the 4 requests.                                                                               | -                         | no                             | **yes** for the request           |
| 8   | `2776292`: decide whether the app should hold the SM-registered player (existing current-player-list plan and apply, Fantasy tick paused), then link.                                           | 1                         | **yes**                        | **yes**                           |
| 9   | Staging canary: replay this match with the reviewed mappings as they then stand; no production scoring.                                                                                         | 3 to 8, as far as they go | staging only                   | **yes**                           |

**What remains after reusing the evidence.** 22 identities: 9 can be linked (7 now, 2 after step 2), 3 more have the identity evidenced and wait for a membership decision (`2161842`, `1528418`, `1939981`), 1 waits for a candidate record (`919753`), 1 is absent from the app (`2776292`), and 8 stay open with nothing in hand: `1213241`, `1866448`, `2776291`, `1894253`, `1919276`, `2790119`, `1004523`, `2790099`. Of the 12 dates, 4 come from SM without anyone supplying them, and 8 have no source in the data we hold. The owner is not asked for 12 dates or 22 decisions: the asks are the three batches above (links, SM dates, two records), three membership calls, and one evidence request for `1213241`.

**The match is still not complete.** Even after every step that has evidence, the defender `1866448` (no date anywhere for his target), `1213241` and 6 more Sofascore ids stay unresolved, and no Flashscore id was touched here.

## What I could not determine

- Whether SM's changed dates (4 players) are corrections or errors. I only know they changed.
- Who `1213241` is, and the canonical target of `1866448`: the evidence in hand cannot say.
- The two missing Sofascore dates: no key here, and the probe has no database access.
- Whether the SM-registered players absent from the app are new people or second ids for people we hold, except where an exact date shared with an app player suggests the second.
