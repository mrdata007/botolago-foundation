# Applied 3 October 2026: 189-row bulk player-mapping batch on Production V2

Project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`).
Result: **BULK_189_EXECUTED_AND_VERIFIED**. The batch is complete and closed.

This mapped 189 Sofascore players to their app players, in one controlled batch, through the
reviewed path (propose, approve, execute) and nothing else. The owner pressed propose, approve
and execute personally from an authenticated MFA session; no agent acted as the owner. How the
batch was built and run is in `PLAYER_MAPPING_BULK_BATCH_RUNBOOK.md`.

## What was approved

| Item                 | Value                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| Manifest             | `docs/production/manifests/player-mapping-bulk-2026-10-02.manifest.json` |
| Manifest SHA-256     | `b3c4caf466b696892cdcf857a6c21789db06212485e758d19ce3415a613f2f82`       |
| Rows                 | exactly 189 Sofascore candidates (Tier A 108, Tier B 81)                 |
| Code                 | PR 313, merged to `main` at `6ae01a13fe0690ff2d0cf4c1872c68e7d460e3a2`   |
| Single-operator mode | ON (`allow_self_approval = true`), unchanged and not part of this batch  |

Names are not in the manifest by construction: a row is a candidate id, a provider id, an app
player id and a fingerprint. Names are for a human reader only and were never an input.

## Production, read after the execute

|                                                | Count                                                           |
| ---------------------------------------------- | --------------------------------------------------------------- |
| All provider mappings (every entity type)      | 1,732                                                           |
| Reviewed, active Sofascore **player** mappings | 191 (the 189 plus the two earlier singles)                      |
| Flashscore player mappings                     | **0**                                                           |
| Proposals executed                             | 191, none pending or approved-but-unexecuted                    |
| Candidates                                     | 1,004: 191 mapped, 813 unmapped (348 Sofascore, 465 Flashscore) |
| Observations                                   | 1,006                                                           |

The two earlier single mappings were unchanged by the batch: Sofascore 359280 to
`6c06addc-4cdc-4598-ba94-42221728122b`, and Sofascore 794543 to
`e89f9f19-6a19-4086-b157-839deaad2e8e`.

A read on 3 October, before any reconciler work, matched these numbers exactly (latest player
mapping row update `2026-10-03 06:14:07 UTC`).

## What this does and does not change

- It changes nothing a user sees, and no Fantasy state: no scoring, no finalisation, no deadline,
  no price, no schedule.
- **No Flashscore id is mapped.** A Sofascore mapping alone cannot pair a Sofascore lineup entry
  with a Flashscore one. See `FANTASY_MAPPING_AWARE_RECONCILER.md` for what that means for the
  reconciler and for Fantasy ingestion.
- The 813 unmapped candidates are not decided. Nothing here approves, rejects or ignores them.
