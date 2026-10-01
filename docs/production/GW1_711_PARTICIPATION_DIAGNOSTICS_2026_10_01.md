# Lineup participation evidence in the finished-fixture diagnose (1 Oct 2026)

**Scope: read-only evidence in DIAGNOSE mode only. Ingestion is unchanged.** No migration,
no database function, no exclusion rule.

## Why

Fixture 19874711 (711) cannot be ingested because provider player 38227322 has no mapping
and no position. Before anyone designs an exception, one question has to be answered from the
provider's own data: does SportsMonks show him as an unused substitute with no Fantasy-relevant
event? The diagnose printed only ids, club and a started flag, so it could not answer.

## What the diagnose now adds

For every **named** lineup player of each fixture it checks, under `fixtures[].participation`:

| Field                                | Meaning                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `externalPlayerId`, `externalTeamId` | provider ids                                                                                                                                                                                      |
| `role`                               | `starter` (type 11), `substitute` (type 12) or `unknown`                                                                                                                                          |
| `officialMinutes`                    | provider minutes (type 119); `null` when the provider sent none                                                                                                                                   |
| `scoringStatisticTypeIds`            | types with a value above zero among: goals 52, saves 57, assists 79, red 83, yellow 84, second yellow 85, goals conceded 88, penalties missed 112, penalties saved 113, rating 118, own goals 324 |
| `unknownStatisticTypeIds`            | goalkeeper types 57 and 113 sent as an explicit null (unknown is never zero)                                                                                                                      |
| `zeroStatisticTypeIds`               | types sent with an explicit 0                                                                                                                                                                     |
| `eventTypeIds`                       | types of the provider's match events whose player or related player is this player                                                                                                                |

No names and no raw payload: only ids, type ids and numbers. Unnamed rows have no entry (they
stay in `unnamedRows` as before). The rating counts as a scoring-relevant value because a
rated player was on the pitch; this is deliberately conservative.

Reading it for a substitute: he is **unused with no scoring event** only if `role` is
`substitute`, `officialMinutes` is `null` or `0`, `scoringStatisticTypeIds` is `[]`,
`unknownStatisticTypeIds` is `[]` and `eventTypeIds` is `[]`. Explicit zeros are evidence of
zero; null or unknown values are not.

## What did not change

- The ingest function, its arguments, the coverage and the rows sent to it, the page and
  orchestrator passes, the one-fixture canary and the adaptive path: **identical to main**.
  The new field exists only in diagnose output.
- No database object. `participation` is never sent to the database.

## Issues recorded for the later exception design (not fixed here)

These are about the earlier draft (commit `fa389697` on
`claude/inspiring-ptolemy-nqgvcm`, which is **not** merged) and must be settled in the next
review.

- **A. The "at most 2" limit is applied in the wrong place.** The draft returned no
  declarations when more than two substitutes in the payload were unused, before the database
  knows which of them are unplaceable. Eight unused substitutes, only one of them unmapped,
  would wrongly lose the exclusion. The limit belongs on the players actually approved and
  eligible for exclusion, never on all unused substitutes.
- **B. Scope must be explicit and owner-reviewed.** A one-fixture canary must not by itself
  exclude every qualifying unmapped substitute. The scope should be an exact fixture id plus an
  exact allowlist of provider player ids (maximum two), reviewed by the owner, with the provider
  evidence independently satisfying the unused rule. First use: fixture 19874711, player
  38227322 only. Nobody discovered at run time is added.
- **C. "No provider mapping" does not prove "no canonical or Fantasy record".** A canonical
  player could exist for the same person without this provider's mapping. An exclusion needs a
  reviewed preflight establishing: no safe canonical match; no Fantasy player believed to be
  him; no squad owning that identity; no locked lineup referencing it. The generic rule must
  not claim mapping absence proves these.
- **D. The database does not independently verify match events.** In the draft the importer
  checked `eventTypeIds`; the SQL declaration never carried them. The later design must either
  describe the events check truthfully as trusted importer evidence, or carry an evidence
  digest (or the event evidence itself) through a contract the database can validate.

## Next step (after this is merged)

One read-only diagnose run (`DIAGNOSE_CURRENT_FINISHED_PERFORMANCES`) for fixture 19874711
only, then read the `participation` entry for provider player 38227322.
