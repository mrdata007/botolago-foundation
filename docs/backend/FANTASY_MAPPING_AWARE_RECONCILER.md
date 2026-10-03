# Fantasy: connecting reviewed player mappings to the provider reconciler

Status: implemented on branch `claude/mapping-aware-reconciler`, **not merged, not activated**.
No production write was made, and none is needed to review this. Replaces nothing: the plan in
`FANTASY_SOFASCORE_FLASHSCORE_PLAN.md` and the design in
`FANTASY_PROVIDER_PLAYER_MAPPING_DESIGN.md` (its step D) and
`FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md` stand, and this is step D.

## What was added

| Piece                      | File                                                                                               | Does                                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed-identity snapshot | `src/backend/fantasy/reviewed-identities.ts`                                                       | Pure. Turns mapping rows into a read-only `(provider, external player id) -> app player id` snapshot, keeping each row's id and version, with a digest. Inactive and unreviewed rows are left out and counted. Two contradicting usable rows make it refuse to build. |
| Mapping-aware pairing      | `provider-matching.ts`, `provider-reconciler.ts`                                                   | `ReconcileInput.reviewedIdentities` (optional). Same pure function: no write, no network, no clock.                                                                                                                                                                   |
| Reader                     | `scripts/backend/football-reviewed-mapping-snapshot.sql`                                           | One read-only statement (one consistent snapshot) that returns ids and versions. A separate reader supplies the rows; the reconciler never reads a database.                                                                                                          |
| Replay                     | `provider-replay.ts`, `provider-replay-fixtures.ts`, `scripts/backend/replay-provider-fixtures.ts` | Runs a finished match before and after, and reports identity, events and scoring readiness apart.                                                                                                                                                                     |
| Bridge suggestions         | `provider-identity-bridge.ts`                                                                      | In memory only. Suggests Flashscore -> app player from already-reviewed Sofascore identities.                                                                                                                                                                         |

## What the reviewed identity does

- Two entries mapped to the **same** app player are paired whatever their shirt numbers.
- Entries mapped to **different** app players are never paired by shirt, goal or any weaker
  signal. `linkIdentityByGoal` stays off and is also refused for such a pair.
- One mapped entry and one unmapped entry is **not** a reviewed identity. The old strict pairing
  stays for compatibility and the player is labelled `partially_reviewed` with no app player.
  Legacy pairs with no mapping are labelled `unreviewed_legacy`.
- An inactive or unreviewed mapping is not used.
- One app player appears at most once per fixture: a duplicate, or the same app player on
  opposite sides, sends the fixture to review. Nothing is scored.
- A reviewed pair is recorded with its own basis, `reviewed_mapping`, not as a shirt-only pairing.
- A reviewed pair keeps a position conflict (Flashscore says goalkeeper, Sofascore says outfield):
  the player stays paired, but saves and penalties saved are unknown and he is held back.
- IDENTITY_RESOLVED is false if any appeared player could not be paired, or any mapping conflict,
  side conflict or duplicate exists, even when every id is mapped.
- A mapping says who a player is. It does not say his club that day, his position, whether he
  took part, or that an event is right: those still come from the match evidence, unchanged.
- No canonical player and no mapping is created as a side effect.
- Every evidence reference states the snapshot digest and the mapping row ids it used, and the
  result carries `mappingSnapshot { digest, capturedAt, entries }`.
- With no input the reconciler behaves exactly as before (all existing tests are unchanged).

Scoring rules were not touched: goals, own goals, assists, cards, participation, saves (never
derived from shots on target), clean sheets, goals conceded, ratings (display only).

## Replay of the seven finished round-1 matches (committed Phase 0 payloads)

Historical payloads captured 2026-10-01: this validates those payloads only, not a fresh
provider check. Snapshot: 191 active reviewed Sofascore player mappings, digest
`e9dfc4059f8252a8a5faf014982004c97bc0c690724c6a633df2cac28fbc7874`, read from production on
2026-10-03 (the replay script requires `--captured-at` for raw query output so the snapshot is never stamped with the payload time; committed as `tests/fixtures/identity/reviewed-player-mappings-2026-10-03.json`,
ids only).

| Match               | Sofascore appeared / reviewed | Flashscore appeared / reviewed | Before              | After | Held back | IDENTITY | EVENTS | SCORING |
| ------------------- | ----------------------------- | ------------------------------ | ------------------- | ----- | --------- | -------- | ------ | ------- |
| Touarga 2-1 FUS     | 30 / 12                       | 29 / 0                         | incomplete (simple) | same  | 1         | no       | yes    | no      |
| DHJ 2-6 CODM        | 32 / 12                       | 32 / 0                         | review              | same  | n/a       | no       | **no** | no      |
| WAC 1-3 Temara      | 31 / 8                        | 32 / 0                         | review              | same  | n/a       | no       | **no** | no      |
| Tiznit 1-3 Tanger   | 28 / 9                        | 31 / 0                         | incomplete (full)   | same  | 3         | no       | yes    | no      |
| MAS 2-1 Zemamra     | 31 / 9                        | 31 / 0                         | full                | same  | 0         | no       | yes    | yes     |
| Tetouan 0-0 Berkane | 31 / 18                       | 31 / 0                         | incomplete (full)   | same  | 2         | no       | yes    | no      |
| KACM 2-3 HUSA       | 32 / 14                       | 32 / 0                         | simple              | same  | 0         | no       | yes    | yes     |

The readiness result does not move. The reconciler pairs a Sofascore entry with a Flashscore
entry, and **no Flashscore id is mapped**, so a Sofascore mapping has no partner to pair with. The
mapping changes only the label: 82 of the 215 Sofascore players who appeared are now
`partially_reviewed`, instead of `unreviewed_legacy`. IDENTITY_RESOLVED is false for all seven.
EVENTS_RECONCILED and SCORING_READY are separate answers, and MAS-Zemamra and KACM-HUSA are
scoring-ready while their identities are still unreviewed shirt pairings.

### Exact blockers

Identity (what a mapping can fix):

- **Flashscore: 0 of 218 appeared players have a reviewed mapping.** This is the main gap.
- **Sofascore: 133 appeared players have no reviewed mapping.** 122 are unmapped candidates that
  were outside the 189-row batch; 11 are not candidates at all.
- DHJ-CODM: the five COD Meknes scorers (goals at 10, 13, 26, 35, 46, 80) are all unmapped on
  Sofascore, and one of them (shirt 6 at Sofascore, 21 at Flashscore) is the disagreement that
  sends the match to review.
- WAC-Temara: the home scorer at minute 81 is the shirt-number disagreement (35 vs 15).
- Of the 55 players currently in anyone's Fantasy squad, only 10 have a reviewed Sofascore mapping.

Evidence (what a mapping cannot fix):

- Touarga-FUS, Tiznit-Tanger and Tetouan-Berkane hold back 1, 3 and 2 players because their
  minutes, clean sheet and goals conceded are unknown: the providers' substitution entries or
  times do not agree (`timeline_disagrees` once, `substitution_mismatch` five times). Tiznit's
  Sofascore home lineup also lists only 10 starters. A reviewed mapping cannot settle these; the
  replay cannot say how much of the cause is identity.
- KACM-HUSA is scoring-ready but one keeper's penalties saved is unknown (a penalty was missed
  against his team and no incident says whether he saved it).
- Three of the Sofascore matches have limited coverage, where assists and saves are unknown by
  contract. Saves stay unknown and are never derived from shots on target.
- Goalkeepers have no goal, card or substitution event in most matches, so no event can bridge
  them (see below). Their saves, clean sheets and goals conceded depend on identity.

## Flashscore bridge suggestions (in memory, not proposals)

Built from already-reviewed Sofascore identities. Names are never read. A suggestion needs at
least one aligned event (goal scored or assisted, card, substitution: same side, same kind,
minutes within tolerance, no competing entry) **and** either an agreeing unique shirt number or
two different aligned events, with no contradiction, no position conflict and no second claim on
the same app player. Shirt, club and position alone is not a bridge; one event alone is not a
bridge; no pairing is used as proof of itself.

Over the seven matches (218 Flashscore players appeared):

|                                                                                          | Count                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Defensible suggestions                                                                   | **33** (8 scorers, 2 assisters, 12 carded, 26 substituted; 3 are in a Fantasy squad) |
| Unresolved                                                                               | **185**                                                                              |
| of which: shirt number only, no event                                                    | 126 (including every goalkeeper)                                                     |
| of which: evidence supports a pairing, but the Sofascore partner has no reviewed mapping | 53 (including 21 scorers and assisters)                                              |
| of which: no candidate at all                                                            | 6                                                                                    |
| Same Flashscore id suggested twice or for two app players                                | 0                                                                                    |

What-if (hypothetical Flashscore mappings made from the 33; these are NOT mappings): WAC-Temara
would leave review and become `incomplete` with 13 players held back. DHJ-CODM would stay in
review, because five of its scorers have no reviewed Sofascore mapping.

Confidence limits, stated on every suggestion: one finished match, both providers can be wrong in
the same way, it shows who the player is and nothing about club, position or participation, and a
person must review it before it is anything.

## Smallest next step toward staging ingestion

1. Owner-reviewed Flashscore mappings for the bridge suggestions (33 now), through the existing
   propose, approve, execute path. This is the only change that moves readiness.
2. Sofascore mappings for the scorers, assisters and goalkeepers still unmapped in these matches
   (starting with the five COD Meknes scorers), so more bridges exist.
3. A goalkeeper bridge needs evidence other than events (for example a second independent squad
   read). None is committed; do not guess one.
4. Only then replay again, and only then a staging ingestion rehearsal.

Not done and not authorised here: any new proposal, approval or mapping; candidate refresh;
production ingestion or scoring; GW1 finalisation; automation. Production was only read.
