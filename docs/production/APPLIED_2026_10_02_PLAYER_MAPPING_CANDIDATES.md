# Applied 2 October 2026: player-mapping candidates on Production V2

Project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`).
Results: **MAS_FES_CANDIDATE_CANARY_APPLIED_AND_VERIFIED**, then
**CANDIDATE_POPULATION_APPLIED_AND_VERIFIED** for the other 15 clubs.

This recorded what Sofascore and Flashscore currently list for all 16 Botola squads, as
reviewable candidates. Nothing was mapped. No proposal exists. No schedule was created and no
Fantasy state changed. The backend itself is recorded in
`APPLIED_2026_10_02_PLAYER_MAPPING_BACKEND.md`.

## What a candidate is

One row per provider player id in `app_private.football_player_mapping_candidates`, plus one
observation per (candidate, squad it was seen in) in `..._observations`. They hold structured
signals (shirt, position, date-of-birth state, height, nationality, squad completeness) and one
display name that is for a human reader only and is purged on the reviewed 90-day rule. No raw
provider payload is stored. Candidates and observations cannot be deleted (a trigger forbids it).

Everything was written through the one trusted recorder
`api.football_mapping_record_observations` (service role only), which writes only those two tables.

## Step 1: Maghreb Fès canary

| Item | Value |
| --- | --- |
| Clean dry-run | run 36972777094 |
| Write | run 36973306325, attempt 1, one recorder call, no retry |
| Source | 31 Sofascore and 30 Flashscore squad players, both squads `COMPLETE` |
| Recorder result | 61 candidates created, 61 observations created, 0 changed |
| After | 61 candidates (31 Sofascore, 30 Flashscore), 61 observations, no shared ids |

## Step 2: the other 15 clubs

| Item | Value |
| --- | --- |
| Reviewed main commit | `9115ce2ec613b708df9d0227a571be3b9a4ad1e9` |
| Workflow | `.github/workflows/production-remaining-clubs-candidate-population.yml` |
| Runner | `scripts/backend/production-remaining-clubs-candidate-population.ts` |
| Clean dry-run | run 36976704629 |
| Write | **run 36977121262**, attempt 1, one recorder call, no retry |
| Dry-run counts the write was locked to | 945 observations, 943 new candidates |
| Source | 15 Sofascore and 15 Flashscore squad requests, none failed |
| Recorder result | 943 candidates created, 945 observations created, 0 changed |

The write only ran because a fresh collection matched the reviewed dry-run counts exactly, and
because production still held 61 candidates, 61 observations, 0 proposals and 1,541 mapping rows.

An earlier dry-run (run 36975182445) stopped on one malformed item before any write. The
validator was changed to mirror the recorder exactly (PR 290) and the dry-run then showed zero
malformed items.

## Final counts, read from production after the write

| | Candidates | Observations |
| --- | --- | --- |
| Sofascore | 539 | 541 |
| Flashscore | 465 | 465 |
| **Total** | **1,004** | **1,006** |

- **Two multi-squad identities**: both Sofascore. Each candidate appears in two squads, which is
  why Sofascore has 541 observations for 539 candidates. They carry the `MULTI_SQUAD_OBSERVATION`
  flag.
- **0 duplicate provider identities**: one candidate per (provider, external id).
- **All 1,004 candidates are `unmapped`.**
- **0 proposals.**
- **0 reviewed-provider mapping rows** (no Sofascore or Flashscore mapping exists).
- **1,541 `football_provider_mappings` rows**, same identity digest
  `5a3a2a1e748ecdf488f9f98e29f942b5` as before the backend was installed.

## Warning: Widad Témara, Flashscore

Flashscore returned only 16 players for Widad Témara (Sofascore returned 26). That squad is
recorded as `INCOMPLETE_PROVIDER_SQUAD`. It is the only incomplete squad of the 30 recorded. A
player missing from an incomplete squad is not evidence of anything, and the squad has not been
repaired or topped up. Every other squad is `COMPLETE`.

## Proof nothing else changed

Read from production after each write, against the value before it:

| Area | Before and after |
| --- | --- |
| Cron | 14 jobs, same digest `5e3bb0b2d3bfc5d697ff50dfe78cfd06`; no mapping schedule |
| Fantasy | gameweek digest `9568bcf1c092fca15a0bdf9a08c117ca` and automation digest `928850644d57be77310d96878aa8d5a8` identical; 0 finalizing gameweeks; lifecycle tick off |
| Players and fixtures | 993 players, 496 fixtures, unchanged |
| Resolver | `api.resolve_football_mapping` md5 `c4c7253284afa52aea055f74e3806d73`, unchanged |
| Mapping constraints | digest `84d45fbd1c71c689561c39afe04094c9`, unchanged |
| Audit | 3 events, no decision row |
| Providers | `fixture`, `flashscore`, `sofascore`, `sportsmonks` |
| Browser access | 0 new table grants to API roles; row security forced on the new tables |
| Other sessions | 0 busy at the final read |

## Evidence

Run logs (counts only; no names, no dates of birth, no secrets):
runs 36973306325 (Maghreb Fès) and 36977121262 (other 15 clubs). Both are closed evidence.

## Still not authorized

Creating proposals, executing mappings, scheduling expiry or purge jobs, reconciler integration,
Fantasy scoring changes, GW1/J1 recovery changes.
