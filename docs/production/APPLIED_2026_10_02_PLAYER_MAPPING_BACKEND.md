# Applied 2 October 2026: player-mapping backend on Production V2

Project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`).
Result: **MAPPING_BACKEND_PRODUCTION_APPLIED_AND_VERIFIED**.

This installed the backend only. Nothing was mapped, no candidate or proposal exists,
no schedule was created, and no Fantasy state changed.

## What was applied

One transaction, one commit, three migrations in order:

| Migration | sha256 |
| --- | --- |
| `20261001150000_register_sofascore_flashscore_providers` | `0259c253dd732a80479659d0227588cc1b6178154fe71c407f951cf4ab84f8ff` |
| `20261001160000_football_player_mapping_tables` | `9377693f2c93836e211c6988de72dc7edafeee16d8a3d8edea1cf11fcc452005` |
| `20261001161000_football_player_mapping_functions` | `74e38306009dff996e12e191057232a269ef961c2e1176b330adbb268d4f0406` |

Script: `scripts/backend/apply-20261001150000-mapping-backend-combined.sql`
(rehearsed version sha256 `b323cf0d1dd447b6e0ca97296777e315b349b5923560adaecc4f906365e74022`).
The applied version is the same file with its single final `rollback;` turned into
`commit;` and nothing else changed (sha256
`0775796726f4edaf9de199907478880211a4bdfcc480458949d3ee459a368a61`).

## How

| Step | Reference |
| --- | --- |
| Reviewed main commit | `12beda305587e045b182c2ae96403db6c56d7955` |
| Full rehearsal (rolled back) | workflow run 36967513648, passed, production unchanged |
| Real application | workflow run 36969312051, attempt 1, `success` |
| Workflow | `.github/workflows/production-mapping-backend-apply.yml` (one-shot, owner only, main only) |
| Runner | `scripts/backend/production-mapping-backend-apply.py` |
| Evidence artifact | `mapping-backend-apply-36969312051` (30 days) |

Why a workflow: the interactive SQL tool times out at 60 seconds on the 160 KB script.

## Pre-flight (immediately before)

- main `12beda30`, the three migrations and the script byte-identical to the rehearsal;
- no workflow run in progress, no other database session active;
- no Fantasy gameweek finalizing, lifecycle tick off;
- providers `fixture`, `sportsmonks`; none of the three migrations recorded;
- 1,541 mapping rows, zero Sofascore or Flashscore rows;
- mapping-table constraint digest `84d45fbd1c71c689561c39afe04094c9`;
- `api.resolve_football_mapping` md5 `5d7ad20856e2bb22e2b7d44741e21be1`.

## Commit result

HTTP 201, result row: "Applied. The player-mapping backend is installed: providers
fixture, flashscore, sofascore, sportsmonks".

## Post-commit verification (read from production, not from the result row)

- **Migrations**: exactly three new rows (history 141 to 144), latest `20261001161000`.
- **Providers**: `sofascore` and `flashscore` added, both active, `configuration_version` 1;
  `fixture` and `sportsmonks` unchanged.
- **Existing mapping table**: 1,541 rows before and after, same identity digest
  `5a3a2a1e748ecdf488f9f98e29f942b5`, zero Sofascore or Flashscore rows, the two original
  unconditional unique constraints and the constraint digest unchanged, indexes, triggers and
  table grants unchanged.
- **Resolver guard**: `api.resolve_football_mapping` is now md5
  `c4c7253284afa52aea055f74e3806d73`, equal to the reviewed text plus only the guard; its grants
  are unchanged (`postgres`, `service_role`). Probes in a rolled-back transaction:
  Sofascore player creation `MAPPING_REVIEW_REQUIRED`; Flashscore player creation
  `MAPPING_REVIEW_REQUIRED`; lookup of an unmapped id `MAPPING_NOT_FOUND`; Sofascore team mapping
  still created; an existing SportsMonks mapping still resolves; a SportsMonks collision still
  `MAPPING_COLLISION`; a new SportsMonks player mapping still created; an unknown entity type
  `INVALID_ENTITY_TYPE`. No probe row was left behind.
- **New tables** (all empty): `football_player_mapping_candidates` 0, `..._observations` 0,
  `..._proposals` 0.
- **Authority**: forced row security on all three tables, no policy, no table grant to `anon`,
  `authenticated` or `service_role`; 12 staff functions executable by `authenticated` only;
  3 trusted jobs (`football_mapping_record_observations`, `football_mapping_expire_proposals`,
  `football_mapping_purge_display_names`) executable by `service_role` only; 20 internal helpers
  with no API-role grant; no PUBLIC grant on any new function; 35 new functions in total (15 in
  `api`, 20 in `app_private`). Proposer and approver must differ, enforced by the table check
  `football_player_mapping_proposals_two_people_check`; there is no single-approval mode.
- **Scheduling**: 14 cron jobs before and after, same digest, none mention the mapping workflow;
  the sweeper and the 90-day name purge are not scheduled.
- **Fantasy**: row counts of every `app.fantasy_*` table, the gameweek digest and the automation
  settings digest are identical before and after; zero finalizing gameweeks.
- **Audit**: 3 audit events before and after.

## Warnings and deviations

- The runner's after-read reported one other database session (`busy_sessions: 1`) at the moment
  it ran; a read a few minutes later showed none. It did not affect the change.
- The apply path is a new workflow merged for this purpose (PR 285, after the rehearsal workflow
  in PRs 283 and 284), because the interactive SQL tool could not carry the script.
- Earlier, one extra resolver guard was added to the reviewed design, owner-approved, so that
  registering the new providers does not open an uncontrolled player-mapping path.

## Still not authorized

Running the squad collector into production, populating candidates, creating proposals,
executing mappings, scheduling expiry or purge jobs, the admin screen, reconciler integration,
Fantasy scoring changes, GW1/J1 recovery changes.
