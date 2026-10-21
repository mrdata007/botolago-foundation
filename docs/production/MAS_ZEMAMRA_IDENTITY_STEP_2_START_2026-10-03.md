# Maghreb Fes - Zemamra identities: step 2, first batch ready (2026-10-03)

**Read-only. Nothing was proposed, approved or mapped.** Production (`tkewgajrljbwgwedqsxn`) was read
with `select` queries at about 21:37 UTC. This page restarts the evidence work of PR #319
(`docs/backend/FANTASY_MAS_ZEMAMRA_EVIDENCE_PLAN.md`) against production as it stands now, and
prepares the first write, which the owner runs.

## Where the match stands now

The reviewed mappings now in production: 233.

- **191 Sofascore mappings:** unchanged since the morning.
- **42 Flashscore mappings:** the whole v2 manifest.
  - All 42 match the manifest: same Flashscore id, same player, active, reviewed.
  - Each executed proposal carries the manifest's fingerprint. That includes the 9 rows that
    were finished after the first pass.
  - None of the 11 held rows was touched.
- **Proposals:** 233, all executed.
- **Mappings in total:** 1774.

Snapshot digest: `c9671de1563e9fbf5fa7df82e1b4a05f5e3072dc77b042dc5892e8f3a6f6eccc`. Other mapping
rows changed since the batch: 27 SportsMonks rows, only their `last_seen_at`, by the ordinary
SportsMonks catalogue sync. No Sofascore row changed.

MAS–Zemamra replay (committed historical payloads, today's mappings):

| Stage                     | Result                                                        |
| ------------------------- | ------------------------------------------------------------- |
| Identities resolved       | **no**: 22 Sofascore and 24 Flashscore appearances unresolved |
| Events reconciled         | yes                                                           |
| Participation established | yes                                                           |
| Scoring fields ready      | yes                                                           |
| Ingestion ready           | no (identity only)                                            |

The scoring ingestion built in step 1 refuses this match for the same reason, and only that
reason.

## The first write: link the 7 identified Sofascore players

Re-checked now, in production, for all 7:

- The candidate is `unmapped` at evidence revision 2.
- It has no proposal and no mapping.
- The target player has no Sofascore or Flashscore mapping.
- The database's own signals give birth date **match** and club **match**.
- What differs is position (5) or shirt (2), exactly as in #319.

| Sofascore id | Candidate                              | App player                             | Differs  | Note needed |
| ------------ | -------------------------------------- | -------------------------------------- | -------- | ----------- |
| 544156       | `3feaa436-2e95-499d-920d-104131cfd948` | `cdda738e-7b3b-4de7-922c-3cff32f55f8e` | position | yes         |
| 1096751      | `27712c2d-2d25-4328-9e3d-e8604bad13ed` | `18a56065-bd3c-42a4-a36e-314123f145d1` | position | yes (flag)  |
| 1140961      | `68ef9731-fdea-46c3-8151-b7c574c2ab0d` | `9be4bcf8-4e0d-4e76-a630-3c120e1c903d` | position | yes         |
| 1525325      | `c1c46fee-66ca-4e96-9330-2cee0d0d9135` | `50a8ea2c-9559-46d5-8cf3-0da879aabb0b` | position | yes         |
| 1919299      | `f67b699b-ae64-4a95-962f-d4efabb7c3c8` | `508e12ad-306c-45e2-b71d-45c0ba6f0f2b` | position | yes         |
| 919340       | `c11c03aa-ec5e-43ed-8b45-0c484831628f` | `924c59cd-afdb-4c05-a49a-58a985b79d70` | shirt    | no          |
| 1182110      | `4b3c18ed-c1e8-4af6-b681-a75221309eaa` | `8711cce0-3af4-49a9-9035-fabe7dd528bc` | shirt    | no          |

- **The flag on `1096751`.** SportsMonks changed its own birth date for this player after match
  day. Sofascore and the catalogue still agree; the earlier SportsMonks value agreed too. The
  owner should see this before writing the note.
- **What a link changes.** A link writes only the mapping workflow. It moves no Fantasy club,
  position, price, locked lineup or past points. `1140961` is in 3 squads and 2 locked GW1
  lineups; nothing in them changes.

**Notes (exact text, from #319):**

- **Position cases** (`544156`, `1140961`, `1525325`, `1919299`): `Provider lists this player as a
midfielder; the catalogue lists a forward. This link maps the identity only. It changes no
canonical or Fantasy position, club, price or locked lineup. The difference is acknowledged,
not resolved.`
- **`1096751`:** the same note, then: `The second provider (SportsMonks) changed its own birth date
for this player between its 27 September and 1 October observations; the later value matches
neither the catalogue nor Sofascore. Two of three sources still agree.`
- **Shirt cases** (`919340`, `1182110`), reason only: `The provider's match-day shirt differs from
the catalogue's squad shirt; the position agrees. This link maps the identity only and changes
nothing in the catalogue or in Fantasy.`

**How the owner runs it.** Use the ordinary review queue on `/admin/football/player-mappings`, one
proposal per player: Sofascore candidate → this app player, basis `manual`.

- **The 5 position cases** stop at "position disagreement". Each needs the note above and the
  acknowledgement before approval.
- **Then** approve and execute each one.
- **Before anything is written,** the owner decides on the 5 position notes and has seen the
  `1096751` flag.

**Expected after the 7 (replay, hypothetical):**

- Sofascore unresolved goes from 22 to 15. Scoring-relevant unresolved goes from 3 to 1, plus the
  goalkeeper.
- Flashscore stays at 24.
- Events, participation and scoring fields are still ready. Identity is not complete, so the
  match is not ingestion-ready yet.

## What stays open after the 7 (from #319, unchanged)

Each item needs its own owner decision:

1. **Record 4 SportsMonks birth dates.** The players are `378fc432`, `6cd0cc61`, `60958299` and
   `e961626d`, via the existing attribute path. Then re-run. `2150417` and `1525293` are expected
   to become linkable.
2. **Candidate records for `919753` (the away goalkeeper) and `1866448`.** This takes 2 of the 4
   remaining Sofascore requests and one recorder call.
3. **Membership calls** for `2161842`, `1528418` and `1939981`: link only, or also add a match-day
   membership.
4. **`1213241`:** dated evidence of who he is (two SportsMonks ids, one birth date).
5. **`2776292`:** whether the app should import the SportsMonks-registered player.
6. **Flashscore:** the 24 unresolved Flashscore appearances need their own evidence-based batch
   once the Sofascore side grows. #319 expects two more after the 7 links.

Six Sofascore identities have no evidence in hand at all: `2776291`, `1894253`, `1919276`,
`2790119`, `1004523` and `2790099`.

**The match cannot be called complete with what exists today.**
