# GW1 recovery package, 1 October 2026

**Status: prepared, NOT applied.** Nothing here has been run against production
except read-only queries and two read-only `DIAGNOSE_CURRENT_FINISHED_PERFORMANCES`
workflow runs (36830045703 for 19874705, 36830153958 for 19874711; both
`writesAttempted: false`, no database write). Production: `tkewgajrljbwgwedqsxn`.
Gameweek 1 (`7fcb28c5-…`) is `provisional`; GW2's deadline is 2 Oct 14:30 UTC.

Source evidence: orchestrator run 36796732583 (artifacts 11133214909 and the
recovery file), the two runs above, stored player-list observations, stored
match events, and the database state read on 1 Oct 07:20–08:00 UTC. Treat
every row as historical; the repair re-checks it (the scripts refuse when the
world differs).

## What blocks GW1

Six of the seven counted fixtures have no player data. 19874708 has an
accepted snapshot (35 rows, points published) and is **not** a blocker (below).

| Fixture  | Importer's refusal                                          | Cause                                                                                                                                                                                                                                                                   | Status                                              |
| -------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 19874705 | `PLAYER_MEMBERSHIP_NOT_FOUND` (first of several)            | 40 provider players, **17 unplaced**: 15 have no mapping (14 at club 9511, 1 at 9535), 2 are mapped but have no club record.                                                                                                                                            | Confirmed                                           |
| 19874707 | `PLAYER_MAPPING_NOT_FOUND`                                  | 40 players, **11 unplaced**: 9 no mapping, 2 mapped without a club record. One (37541460) has **no position at the provider**, so the existing rules skip him and 707 keeps failing.                                                                                    | Confirmed; blocked on his position                  |
| 19874711 | `PLAYER_MAPPING_NOT_FOUND`                                  | 39 players, **12 unplaced**: 8 no mapping, 4 mapped without a club record (one is listed at another club).                                                                                                                                                              | Confirmed                                           |
| 19874709 | `current_goal_totals_mismatch` (16938: 3 final, 2 credited) | Stored events show 3 goals by two named players (a starter, a substitute). Neither is among the provider-identified lineup players. Behind this, **12 more players are unplaced** (3 no mapping, 9 no club record) that the importer has not reached yet.               | Identity part confirmed; goal gap needs the payload |
| 19874710 | `current_defensive_statistics_incomplete` (37550342)        | A starter with 60–89 minutes whose side conceded: goals at 62' and 73', after the side's first substitution (46'), so the narrow timeline proof cannot apply. Needs his official minutes or provider goals-conceded. Behind this, **10 more players unplaced** (3 + 7). | Cause confirmed; evidence missing                   |
| 19874706 | `current_goal_totals_mismatch` (16850: 3 final, 4 credited) | No lineup or events are stored for it (the live refresh has been off since 26 Sept 22:24 UTC). Cannot be traced from the database.                                                                                                                                      | Unresolved                                          |
| 19874708 | `current_starter_minutes_missing` (1 starter)               | The accepted snapshot is stable (28 Sept 08:42: 35 rows, all 22 starters ≥ 60 min, unchanged across four ingests). The 1 Oct provider response lacks minutes for one starter, on the same code that accepted it before. Not a GW1 blocker: its points are published.    | Provider change, unresolved; noise                  |

Totals: 62 unplaced players in five fixtures, plus 706 unknown.

### Did the recovery's `fixtures_scope` cause this? No.

The recovery skipped squads only because of its scope, and its squad import refuses
once the Fantasy catalog is staged (`fantasy_catalog_already_staged`). The cause is
that the 25 and 27 Sept player-list updates observed lineups for **19874708 only**
(an observation of 707, 709 and 710 was recorded on 26 and 27 Sept and never
applied), and none ever covered 705, 706 or 711.

## The three database refusals, exactly

- `PLAYER_MAPPING_NOT_FOUND`: no active `football_provider_mappings` row for the
  provider player id (`20260925120000_…sql`, line ~211).
- `PLAYER_MEMBERSHIP_NOT_FOUND`: mapped, but no `app.team_memberships` row for the
  2026/27 season at the fixture's club covering the kickoff **date**
  (`valid_from <= kickoff::date` and `valid_to` null or later).
- It stops at the first offending row, so a fix for the named player alone would
  expose the next one. Every identified lineup member counts, including an unused
  substitute.

## Repair path (existing, owner-approved mechanism, scoped)

The supported route is the player-list update (`docs/backend/CURRENT_PLAYER_LIST_UPDATE.md`).
Its plan decides each player by the 25 Sept rules: only positive evidence, a name
is matched only against hand-typed players at the same club (equal full name,
one to one), a held player keeps their Fantasy squad place and price.

1. **Observe** (existing workflow "Observe current Football player list",
   `fixture_ids` = the fixtures to repair). Records one observation row.
2. **List** the unplaced players: `scripts/backend/diagnose-fixture-identities.sql`
   (read-only; tested on 705 and 707).
3. **Scope**: `scripts/backend/record-scoped-player-list-observation.sql`. Rehearsal first.
   It records only the listed players, refuses unless the list equals exactly what
   is unplaced, refuses any plan change outside the list, and refuses a Fantasy move
   of a player a team holds unless that move was accepted.
   **Under 30 minutes after step 1** (the record function refuses older).
4. **Apply** the scoped plan with the existing `apply-current-player-list.sql`
   (Fantasy tick paused first; within 24 hours; rehearsal first).

Expected effect, from the stored 27 Sept plan restricted to 707, 709 and 710
(proxy; the real plan is computed on a fresh observation): 25 new Fantasy catalog
players (prices 4.8–10.6 from the opening-catalog formula) and 7 Fantasy club
moves. **One move touches a held player**: Anas Zniti (goalkeeper, 404731) is held
in 1 Fantasy squad and 1 GW1 lineup, filed under RSB Berkane, listed by the provider
at CODM Meknès. Moving him changes which fixture scores for him. The owner must
accept or reject that explicitly.

## Local changes

`scripts/backend/current-season-performances.ts` (+ tests): the three validation
refusals now name, in numbers and provider ids only, what was missing:

- goal mismatch: who was credited, the provider's goal events (id, type, side,
  scorer id, minute) and unidentified lineup rows per club;
- defensive check: the player's minutes, goals his side conceded, whether the
  provider gave his goals conceded, and the timeline's two boundaries;
- starter minutes: the starter's provider id and the statistics it did carry.

No behaviour changed: the same fixtures pass and fail. The existing diagnostic
already lists each lineup's provider ids for fixtures that validate (which is how
705 and 711 were resolved).

## Tests

Run locally: `bun test scripts/backend` (549 pass, 0 fail, 12 skipped),
`bun run typecheck`, eslint and prettier on the two changed files, the committed
secret scan. Read-only against production: the resolver script (705 and 707
reproduced the earlier results), the unresolved-set query (33 players across 707,
709, 710), the pure-filter observation builder (16 clubs, 3 lineups, 33 players,
accepted by `current_player_list_season`), and the plan postflight/report logic on
the stored plan.

**NOT_RUN:** `record-scoped-player-list-observation.sql` end to end (recording,
planning the new row, the rehearsal raise on real data) and the apply, because they
need a fresh observation and a write; no disposable database was available (no
Docker). pgTAP was not run.

## One-fixture canary and stop conditions

After steps 1–4, ingest **one** fixture with `INGEST_CURRENT_FINISHED_PERFORMANCES`
and `only_fixture_external_id`. 19874705 and 19874711 are the candidates (neither
has a validation failure; their 12 and 17 unplaced players have no computed plan
until they are observed, so check that every one is placed first). 19874707 cannot
go first (37541460).
Expect: rows equal to the identified lineup, goals reconcile, no `PLAYER_*` refusal.
Stop (ingest nothing else) on any refusal, a row count that is not the lineup, or a
points change nobody expected. Ingestion keeps history (`active` flag), so a corrected
re-ingest supersedes; there is no automated undo.

Undo of the identity repair: `docs/backend/CURRENT_PLAYER_LIST_UPDATE.md`, "Undo"
(the applied plan and result are kept in `app_private.current_player_list_updates`).

## Approvals needed (none given)

1. Observe: records one production row (workflow dispatch).
2. Recording the scoped observation (one row), real run.
3. Applying the plan (changes players, mappings, memberships, Fantasy catalog; tick paused).
4. Merging the diagnostic change (needed before the workflow can use it: it runs main only).
5. A further diagnose run with the merged change, for 706, 708, 709, 710.
6. INGEST of the canary and then the rest.
7. Accepting or rejecting Zniti's move.
8. A decision on 37541460 (no provider position): obtain it from an official source,
   or decide whether an unused substitute with no resolvable identity may be left out,
   as unnamed rows are. Unknown participation must stay unknown.

## Is this sufficient for GW1?

No. It can clear the identity refusals of 705, 711 and, once 37541460 is resolved,
707, and unblock the identity part of 709 and 710. It does not fix: 706 (no
evidence), 709's missing third goal attribution, 710's defensive evidence, or 708's
provider change. Finalization also needs every counted fixture certified, no pending
participation for a held player, and the normal seal; one successful ingestion does
not finalize GW1.
