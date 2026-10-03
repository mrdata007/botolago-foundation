# Applied 2026-10-01: GW1 fixture 19874705 identity and catalog repair

Stage: **COMMITTED.** Not ingested, not scored, not finalized. Production project
`tkewgajrljbwgwedqsxn` (BotolaGO Production V2).

## What ran

| Step               | Result                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator pause | `Fantasy season orchestrator` set to `disabled_manually` by the owner at 10:21 UTC (prior state: `active`, variable `FANTASY_AUTOMATION_ENABLED=true`). Verified by `get_workflow` before the Observe, before the rehearsal and after the commit. Its latest run is still #71 (07:10 UTC).                                                  |
| Other controls     | `lifecycle_tick_enabled = false`, `football_live_refresh_enabled = false`, no running cron job, no active query, no queued or waiting workflow, only pull-request CI runs on disposable databases. Unchanged by the repair (automation hash identical).                                                                                     |
| Fresh Observe      | run 36848752230, main `0b01db46`, observation `e3aec6fc-8b33-45c6-a6de-75582394d245`, observed 10:23:01 UTC.                                                                                                                                                                                                                                |
| Scoped record      | pinned `record-scoped-player-list-observation.sql` (blob `6c8ed81c`), `scope_dry_run = false`, the 17 ids: scoped observation `94ac375d-f787-433c-aa82-42272864b5a6`, plan digest `3ccf6fea0f3369adf6c258298e356ccc3324200c49e26a1827b195801f2b40fe` (the expected one).                                                                    |
| Plan check         | all 17 rows equal the reviewed table and the owner's list (identity, club, position, price); 15 `add`, 2 `mapped` + `join`, 17 Fantasy `add`, 0 moves, 0 skipped, 0 club-limit violations.                                                                                                                                                  |
| Apply rehearsal    | pinned `apply-current-player-list.sql` (blob `7f89b633`) as shipped (ends in `rollback;`): "Not applied", 17-change summary; every hash and count then equal to the baseline except `observations` (+1, the scoped record).                                                                                                                 |
| Committed apply    | the same script with the single line `rollback;` changed to `commit;`: applied update **`1f32f093-01ee-469d-81d2-edd1d3e0e271`** at 10:26:04.992565 UTC. `added 15, joined 2, fantasyAdded 17, moved 0, linked 0, duplicatesRetired 0, removedMemberships []`. The script's closing advice to switch the tick back on was **not** followed. |

## Row deltas against the baseline (taken after the fresh Observe)

| Table                              | Baseline          | After                               | Delta |
| ---------------------------------- | ----------------- | ----------------------------------- | ----- |
| `app.players`                      | 978               | 993                                 | +15   |
| provider mappings                  | 1526              | 1541                                | +15   |
| `app.team_memberships`             | 1851              | 1868                                | +17   |
| `app.fantasy_players` (catalog)    | 606               | 623 (621 active, as before plus 17) | +17   |
| `fantasy_player_price_history`     | 606               | 623                                 | +17   |
| `fantasy_initial_price_evidence`   | 606               | 623                                 | +17   |
| `current_player_list_updates`      | 2                 | 3                                   | +1    |
| `current_player_list_observations` | 7 (after Observe) | 8 (scoped record)                   | +1    |

Unchanged, hash-identical to the baseline: squads (109), Fantasy teams (7), lineups (7),
lineup players (105), scoring snapshots (18), point events (852), gameweek points (606),
gameweeks (2), player performances (9426), performance coverage (241), automation settings,
adaptive policy, cron jobs (14). Every pre-existing row of players, mappings, club records,
Fantasy players, price history and initial-price evidence is byte-identical (hashes of each
table excluding exactly the new rows equal the baseline hashes). The two existing players
keep one canonical row each and their old-season club records; there is no duplicate by name.

## The rows created

Club records are 2026-09-24 to 2027-06-30 (Moghreb Tétouan for all but 37640437, RSB Berkane).
Fantasy entries are `available`, `active`, `eligible`; price source: the opening-catalog
formula with fallback rating 6 and confidence 0 (a default, not an observed performance rating).

| Provider id | Position, price | Canonical | Canonical player                       | Mapping                                | Club record                            | Fantasy player                         | Price history                          |
| ----------- | --------------- | --------- | -------------------------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- |
| 37308657    | DEF 5.00        | existing  | `ac7d265e-c87b-45a9-ad84-2d1c1ddd9f08` | `94901288-b804-4967-adb7-b6609b436f4b` | `24e305aa-2153-4759-8b5d-69ec406de68b` | `bf0a4ab0-6083-4a47-bc65-c5ed4db8d03d` | `2765aa3c-b83e-4cdf-a8a1-117e271f2134` |
| 37532637    | DEF 5.00        | new       | `c41c1fb0-f731-4b81-b9fa-a447221a248c` | `3a4be2bd-3fea-4e57-ab74-b747349e6493` | `32509cb5-bee3-4c37-8985-3a9c145df23d` | `dbbd6954-ca50-4536-86c6-1b57f204e78c` | `ddc02bb3-4681-45bd-a6dc-331e9062f27d` |
| 37612154    | MID 7.20        | new       | `deba1d28-5fbf-45fb-8a06-d3679d705b05` | `1ce7a443-544b-43fe-a4da-8379d20eb65b` | `5bf608b9-1f46-43a0-ac3e-03bda066d0f2` | `83d417b1-249a-4749-9259-4defa0798015` | `06e13720-eabd-4108-9a30-2ca8971a62b6` |
| 37635144    | FWD 7.20        | existing  | `1f44ae29-1347-42b1-9251-9510f2ec0cbc` | `57be8115-d6b7-4da5-acdd-e913f44ac49d` | `3bf44bbc-b821-476c-a67d-d607d243584d` | `7840070e-dd70-4533-a798-9f8bf114b657` | `f74aafc2-efab-427e-af8b-390d31b29343` |
| 37640437    | MID 7.20        | new       | `3f92a4da-e29b-4399-a055-12f0c2d0f8d7` | `51cc4136-85c5-445c-b964-9208cbc29ec0` | `3ff5b769-029c-4c09-ba13-4cafae391abd` | `afc9a45b-92b1-4eaa-a9c5-3b5ef68540b8` | `71d495ee-d7d9-42f2-b809-6706ffeb0f40` |
| 37753134    | DEF 5.00        | new       | `e2537d88-97c9-481f-b761-ee05a17fc1e9` | `c07c3ea8-69ac-4481-974e-caa2dea8c7ca` | `35d8cefe-f3d7-438c-a042-cac68c754ea7` | `ea9958b4-59f3-4316-ad86-17d0c7c1f5dd` | `5ec9bd91-9181-44d2-bc65-4ee684e7de13` |
| 37901711    | GK 4.80         | new       | `e1e8327c-054b-4561-bd68-769bee8e7ef0` | `eb17ad9e-094d-4b4a-8484-2fb939ebd10d` | `5b97cf9e-7dff-4a56-82b6-2f1f10ec7087` | `6068e4e6-9dff-4bbe-8ee2-29c807df168c` | `e4e95d2a-dc09-462d-a3f4-2275282bd44f` |
| 37947231    | GK 4.80         | new       | `26c0a49f-7859-4370-b44d-6d512dfc4c86` | `ec5e80d7-4d8a-4398-8f33-791e2e5b3f90` | `a1228167-a7bb-4386-805a-8e4a65d12372` | `31771896-3800-4576-ab4b-a873fe1d30c9` | `75f9922c-a37e-4f60-b076-86f25e86954b` |
| 38227065    | DEF 5.00        | new       | `1b308106-c53e-4581-872a-c0f1e699d7fe` | `7c0fb8b9-dbaf-489e-9ce3-f0f3fc7c4986` | `b21ac4c6-67ba-4325-8310-faabeb0d12d1` | `b07a7de7-30a6-408e-8922-26c89ad94bc3` | `16fa1e2c-7e2a-4353-ab36-2df20fbfcd74` |
| 38227066    | MID 7.20        | new       | `9285f7bb-cc04-4701-994f-36ae5f1955f4` | `bfc37b60-6edc-4ae9-ba67-ba017c778c7b` | `bc01c3e9-9bd7-45f9-bee7-412ba64d221b` | `2676c10e-aeea-450f-a7d5-3f7f1536ba33` | `3adeab8b-0457-423c-b542-e1904ac8f90d` |
| 38227067    | MID 7.20        | new       | `987a00e2-5b0f-4e97-a2e1-1ec691516cb6` | `b3fda207-ceca-4ab8-b63b-6eefe262d7b9` | `68aa9a43-c26c-4786-b6cc-4993f237d096` | `e2bcc9fb-1033-4963-b4a3-e24f0933efba` | `678375db-be76-4d88-a45f-ba49aa5be6ab` |
| 38227068    | FWD 7.20        | new       | `ed49c51c-ad9c-42f0-99e4-90c26a313102` | `167416e3-d356-4993-b982-de8865d87028` | `663e3f74-f371-4e0e-8ae3-5903431b835b` | `325745d4-4f3e-4926-8157-085b1878d465` | `043c0c3f-1c7b-44c9-a839-bcde7ab6a337` |
| 38227072    | MID 7.20        | new       | `ba1bc16b-25a8-470f-b4bc-5854fa42792a` | `970392cb-87fd-4d97-87cc-eb13edbb3dd3` | `20f5b2fa-e9e1-4106-a086-c4725b8c7f58` | `f39379b3-fa01-4918-9858-3e34d1f8675f` | `d874dc17-23cd-4dfc-945c-ab833e401f27` |
| 38227323    | MID 7.20        | new       | `614df713-0161-494a-86af-3a2b275e1d69` | `c148b137-8e90-4ed1-a9dc-bf7e2ed81d12` | `132baf01-85e3-4af1-8447-5c698c447cfc` | `decc7c5f-9a42-443f-89f4-c65b04b269ab` | `c6a7ec45-4ab8-43a9-b04e-b6dd43fa1020` |
| 38227324    | FWD 7.20        | new       | `fa048ef9-9799-4be0-a04c-a45b38bfcc6d` | `bc4151e5-e002-4282-916f-b5b78df05cd5` | `ecd13850-4d89-4571-936c-ec68bd6a82c4` | `a958ddc3-2f02-4082-b1b1-65a745568038` | `f6343a91-85e5-4b55-8063-fe11ccfb0e35` |
| 38227325    | MID 7.20        | new       | `7d92f9d4-9aaa-47b7-9c91-19f415fe33b7` | `14fc8288-78af-4c26-a752-ec7f9daa4185` | `346dc9a9-7ec6-4b3b-aeef-ba6d0e338268` | `ec92f8be-3bfe-489a-ba59-e18d5e6fcce4` | `7adc3628-5e55-43e6-bf23-b270b8d5b078` |
| 38227326    | DEF 5.00        | new       | `c1b0f118-4622-4375-818c-65fe4ceeadd5` | `506b533e-8749-4260-95ad-af44be8ec537` | `59fba6da-51fe-4b56-8093-d5b59d084409` | `b68ebabc-31cc-49c6-9be6-325fccd67452` | `9f62567f-0668-4af2-9f7b-26f3d425fe73` |

All 40 identified lineup players of the fixture now pass the importer's identity check
(active mapping, club record covering the kickoff date): `identity_40 OK = 40`.

## Not done

No ingest, orchestrator run, scoring, finalization, deadline change or automation
re-enablement. The 17 players are in no squad or lineup and have no performance rows, point
events or gameweek points.

## If a later check disagrees: recovery stance

There is no scripted undo and none was run. Capture the exact rows with
`scripts/backend/verify-gw1-705-repair.sql` and report; a correction is a reviewed forward
change under its own approval (the apply's retire path sets `active = false` /
`eligible = false` on a Fantasy row instead of deleting). Do not delete or re-apply blindly.
