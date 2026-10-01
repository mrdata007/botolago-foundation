# GW1 recovery package, 1 October 2026

**Status: prepared and rehearsed on a disposable database, NOT applied.** Nothing
here has been run against production except read-only queries and read-only
`DIAGNOSE_CURRENT_FINISHED_PERFORMANCES` workflow runs (36830045703 for 19874705,
36830153958 for 19874711; both `writesAttempted: false`, no database write).
No production Observe, record, rehearsal, apply or INGEST has been run or approved. Production: `tkewgajrljbwgwedqsxn`.
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

## Provider evidence collected 1 Oct (read-only, one run per fixture)

Four runs of the protected diagnose workflow, all at the reviewed merge
`03d34c3e`, all `writesAttempted: false`. Provider ids only; no personal data.

| Fixture  | What the provider sent                                                                                                                                                                                                                                         | What it means                                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 19874706 | Team 16850: final score 3. Match events list exactly 3 goals for it (3', 68' penalty, 85'). Player statistics credit **4** goals, one to player 37551374 who has no goal event. Other team: events and statistics agree. No unidentified rows.                 | One extra goal credit in the player statistics. Disallowed goal or provider error: **unknown**. Not fixable by adding players; needs the provider's answer or an owner decision on which source wins.        |
| 19874709 | Team 16938: final score 3. Match events list 3 goals (19' penalty, 58', 90+6'); the last two are the same player (38227298). His statistics row credits **1** goal. Credited total is 2. No unidentified rows (the earlier "unnamed scorers" theory is wrong). | Statistics row is short by one goal; events agree with the final score. Why: **unknown**. Same kind of decision as 706, in the opposite direction.                                                           |
| 19874710 | One starter (37550342, team 270260): 62 minutes, team conceded 2 (last at 73'), no explicit goals-conceded figure, first substitution at 46'.                                                                                                                  | The old full-stat pipeline wants his goals-conceded or an official minutes proof. Only the last conceded minute is known, so his concessions cannot be derived. **Unknown stays unknown**; nothing invented. |
| 19874708 | One starter (38226822, team 228516) has no minutes figure (only stat types 88 and 118).                                                                                                                                                                        | Same code that accepted the stored snapshot before; provider response changed. Accepted snapshot preserved; not a GW1 blocker.                                                                               |

Consequence for the GW1 plan: 706 and 709 are **not** identity problems and no
catalog repair will clear them. They are data-disagreement problems that need a
separate, explicit decision. Neither was touched.

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
   A rehearsal applies the plan inside its transaction and re-runs the import's
   own identity checks; it is a write and needs the owner's authorization.
4. **Apply** the scoped plan with the existing `apply-current-player-list.sql`
   (Fantasy tick paused first; within 24 hours; rehearsal first).

Expected effect, from the stored 27 Sept plan restricted to 707, 709 and 710
(proxy; the real plan is computed on a fresh observation): 25 new Fantasy catalog
players (prices 4.8–10.6 from the opening-catalog formula) and 7 Fantasy club
moves. **One move touches a held player**: Anas Zniti (goalkeeper, 404731) is held
in 1 Fantasy squad and 1 GW1 lineup, filed under RSB Berkane, listed by the provider
at CODM Meknès. Moving him changes which fixture scores for him. The owner must
accept or reject that explicitly.

## What the existing apply bundles, and what the import needs

The import checks only an active provider mapping to a player and a club record
for the season covering the kickoff date (`api.ingest_current_player_fixture_performance`).
The existing apply (`service_apply_current_player_list`) does more, in one function
with no switch, and its last check requires the plan to reach zero changes:

| Step of the apply                                           | Needed for the import?                                                       | Needed to score GW1 for current squads?   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| Create the canonical player (`app.players`)                 | yes, when the player is unknown                                              | no                                        |
| Provider mapping                                            | yes                                                                          | no                                        |
| Dated club record (season start to season end)              | yes                                                                          | no                                        |
| Remove the player's other club records this season (a move) | not for a new player; it is what lets a moved player resolve at the new club | no                                        |
| Move the Fantasy player to the new club                     | no                                                                           | only if a team holds him (see Anas Zniti) |
| Add a new Fantasy player with a formula price               | **no**                                                                       | **no** (nobody holds him)                 |

So Fantasy catalog additions are optional expansion that the current apply cannot
skip. The recorder therefore stops until the owner accepts them
(`scope_ack_fantasy_additions`), and stops on any held-player move. An identity-only
apply would need a new migration (a variant of the apply that skips steps 5 and 6
and ignores Fantasy-only changes in its final check); it is not prepared and not
needed if the owner accepts the additions.

## First production candidate: 19874705

Chosen from the evidence, not from the older three-fixture estimate (25 additions
and 7 moves), which is not the scope of this package.

|                                                   | 19874705 | 19874711                                                 |
| ------------------------------------------------- | -------- | -------------------------------------------------------- |
| Players that cannot be placed                     | 17       | 12                                                       |
| Unknown to the canonical list (create, map, join) | 15       | 8                                                        |
| Known, with no club record (join)                 | 2        | 3                                                        |
| Known, listed at another club (move)              | 0        | 1 (also an existing, unheld Fantasy player: club change) |
| Held by a Fantasy team                            | 0        | 0                                                        |
| Existing membership rows changed or removed       | 0        | 1                                                        |
| Existing Fantasy rows changed                     | 0        | 1                                                        |
| Validation failure in the diagnostic              | none     | none                                                     |

705's repair is purely additive: nothing existing is moved, removed or repriced,
so it is the easiest to reverse (delete what was added). 711 is smaller but removes a
club record and changes an existing Fantasy player's club. The cost of 705 is more
additions, including 7 starters of club 9511 (its starting XI is mostly unknown to
the catalog). Risk: a no-position player among the 15, as in 707, would block it.
The fresh observation shows that; if it does, 711 is the fallback.

Exact required changes for 705 (provider ids; names, positions and dates of birth
come from the observation and are reviewed before anything is recorded):

- **Canonical player creation, provider mapping, dated club record (15):**
  club 9511: 37532637, 37612154, 37753134, 37901711, 37947231, 38227065, 38227066,
  38227067, 38227068, 38227072, 38227323, 38227324, 38227325, 38227326;
  club 9535: 37640437. (7 are starters.)
- **Dated club record only, player and mapping already exist (2):** 37308657
  (defender, listed at no club) and 37635144 (forward, listed at no club), both for 9511.
- **New Fantasy catalog entries and prices (17), coupled by the existing apply, not
  needed by the import:** one per player above, priced by the opening-catalog
  formula; their amounts exist only in the plan. Needs the owner's acceptance.
- **Existing Fantasy club, position or price changes: none.** No held player is involved.

## Observe of 19874705 on 1 Oct 2026 and the exact plan

Run 36838133534 (reviewed main `03d34c3e`, project `tkewgajrljbwgwedqsxn`). It made
exactly two database calls: record the observation (one insert, after waiting out
any running scheduled job) and plan it (a read; nothing is stored). Observation
`15b64b8d-ae40-4be3-9fdf-00f469e03282` was recorded at 08:44:09 UTC: 16 clubs,
490 squad players, 40 lineup players for 705, none unidentified or unnamed.

**This table is a filtered read-only preview, not an exact scoped plan.** It is the
17 entries of the stored full-season plan (133 changes, digest `f6be5b13…`) that
concern players in 705's lineup. A scoped plan with its own digest only exists
after the scoped recorder runs, which is a production write and is not approved.
The other 116 changes in the stored plan are not part of this package, among them
the 9 held-player Fantasy moves (Zniti included) and 5 players skipped as
ambiguous. The scoped recorder refuses any of them.

Recomputed from the fresh evidence (it matches the earlier estimate, but was not
forced to): **15 canonical creations, 2 membership-only repairs, 17 Fantasy
entries.** Read-only check against production just before: of the 40 lineup
players, 23 pass both identity checks and 17 do not (15 with no mapping, the 2
mapped ones with no 2026/27 club record), the same 17 ids as below.

| Provider id | Canonical identity                                                             | Position                                   | Mapping        | Dated membership                                                                      | Fantasy entry, price |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------- | -------------------- |
| 37901711    | **new** canonical player "Yassine Amaadour", born 2004-08-10                   | goalkeeper (provider squad position) → GK  | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, no shirt number | create, 4.80         |
| 37947231    | **new** canonical player "Zakaria Benabbou", born 1995-09-04                   | goalkeeper (provider squad position) → GK  | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, no shirt number | create, 4.80         |
| 37308657    | existing canonical player `ac7d265e…` (Achraf Marzak)                          | defender (existing canonical record) → DEF | already mapped | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, shirt 2         | create, 5.00         |
| 37532637    | **new** canonical player "Soulaimane Driouache", no birth date at the provider | defender (provider squad position) → DEF   | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, shirt 4         | create, 5.00         |
| 37753134    | **new** canonical player "Issam Bouabsidi", born 2004-03-27                    | defender (provider squad position) → DEF   | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, no shirt number | create, 5.00         |
| 38227065    | **new** canonical player "Yassine Aboursas", born 1996-06-15                   | defender (provider squad position) → DEF   | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, no shirt number | create, 5.00         |
| 38227326    | **new** canonical player "Youssef El Maataoui", no birth date at the provider  | defender (provider squad position) → DEF   | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, shirt 38        | create, 5.00         |
| 37612154    | **new** canonical player "Mohamed Kassou", born 2003-01-01                     | midfielder (provider squad position) → MID | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, shirt 19        | create, 7.20         |
| 38227066    | **new** canonical player "Mustapha El Crachna", born 2006-01-21                | midfielder (provider squad position) → MID | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, no shirt number | create, 7.20         |
| 38227067    | **new** canonical player "Yassin Crachna", born 2004-10-18                     | midfielder (provider squad position) → MID | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, shirt 21        | create, 7.20         |
| 38227072    | **new** canonical player "Hicham Zeghari", born 1998-11-20                     | midfielder (provider squad position) → MID | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, no shirt number | create, 7.20         |
| 38227323    | **new** canonical player "Wissam Erbati", no birth date at the provider        | midfielder (provider squad position) → MID | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, shirt 29        | create, 7.20         |
| 38227325    | **new** canonical player "Ayman Azzouzi", no birth date at the provider        | midfielder (provider squad position) → MID | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, shirt 37        | create, 7.20         |
| 37635144    | existing canonical player `1f44ae29…` (Anouar Ousserhane)                      | forward (existing canonical record) → FWD  | already mapped | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, shirt 11        | create, 7.20         |
| 38227068    | **new** canonical player "Ali Salam", no birth date at the provider            | forward (provider squad position) → FWD    | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, shirt 22        | create, 7.20         |
| 38227324    | **new** canonical player "Nadir El Fadili", born 2006-02-13                    | forward (provider squad position) → FWD    | create mapping | create 2026/27 record at Moghreb Tétouan, 24 Sep 2026 to 30 Jun 2027, no shirt number | create, 7.20         |
| 37640437    | **new** canonical player "Hamza Kattoussi", no birth date at the provider      | midfielder (provider squad position) → MID | create mapping | create 2026/27 record at RSB Berkane, 24 Sep 2026 to 30 Jun 2027, shirt 34            | create, 7.20         |

Prices are the opening-catalog algorithm (`botolago-initial-price-v1.0`) with the
default rating 6 and confidence 0, because none of these players has history:
goalkeeper 4.80 (2), defender 5.00 (5), midfielder 7.20 (7), forward 7.20 (3).

Existing records changed: **none.** The two mapped players each have only an old
season club record, no 2026/27 record, no Fantasy entry and no performance rows;
every other row of the plan is an addition. No locked lineup, squad, price,
position or scoring reference changes: the 17 are new Fantasy players owned by
nobody, so no GW1 lineup (6 lineups, 90 rows) can contain them.

What the Fantasy additions mean for users, if approved: 17 more players
appear in the transfer market (catalog 606 to 623) at the prices above, and from
GW2 they can be bought like any other player; they carry no points, price history
or owners yet. They are **not needed for the import** (it needs only the mapping
and the dated club record), but the existing apply does them in the same step and
its final check refuses to finish unless they are done.

Not claimed: that 705 is ingestable. The two import checks can only be shown to
hold after the apply (they hold by construction and in the rehearsal, not in
production). The import also checks goalkeeper statistics against each keeper's
canonical position, and 705 has two new keepers (37901711, 37947231); that check
runs only inside the real import. 705's provider data itself passed the read-only
diagnose in full (40 valid rows, 22 starters identified, no statistic missing).

Clocks: the scoped recorder will only use a source observation under 30 minutes
old, and the apply refuses one older than 24 hours. The observation above is
therefore stale for the recorder from about 09:13 UTC, and a later approved
execution would need a fresh Observe first. The checks are not weakened.

## CI on this branch: the browser failure

Head `1163fe7c`: `database-quality` passed, and the GW1 rehearsal step ran **21
tests, 21 passed, 0 failed**. `application-quality` failed in the development-server
browser suite (33 tests). Diagnosis, from the failed run's own trace:

- The failure is a hydration mismatch on the Home page. The server and the browser
  render the same sample match with kickoff times one hour apart (10:25 and 11:25).
- Cause: the server's Node and the browser disagree about the Africa/Casablanca
  offset on 1 Oct 2026. Run locally, Node 22 and 24 with time-zone data 2026c give
  UTC+0, Node 20 and the browser give UTC+1. The same test passes on the default Node
  here and **fails when the dev server runs on Node 24**, which reproduces it.
- It is an environment difference (the runner image's Node time-zone data), not a
  regression: this branch changes no application code, PR #255 failed the same way
  and a re-run on another runner passed.
- No re-run was made. A re-run only tests which runner image it lands on.
- It is also a real risk to the product: match times are shown in Casablanca time,
  and whichever source is wrong shows wrong kickoff times. That is a separate fix.

## Rehearsal on a disposable database

`scripts/backend/gw1-identity-repair-rehearsal.test.ts` runs the real recorder, plan,
apply, identity resolver and the real statistics-import RPC on sanitized synthetic data
(an unmapped player, a mapped player with no club record, a correctly resolved one, a
held player whose club would change, and one with no provider position). Run locally on
a PostgreSQL built from this repository's own migrations (21 tests pass; they also
pass while the real `pg_cron` worker runs 14 jobs), and in CI's `database-quality` job
on the Supabase stack (see the pull request). It shows:

- before the repair the real import refuses with both `PLAYER_MEMBERSHIP_NOT_FOUND`
  and `PLAYER_MAPPING_NOT_FOUND`; after it the import's own checks pass for everyone
  except the player with no position, and the import refuses that lineup (and accepts
  the lineup without him);
- a repair writes the required mapping and a club record dated from the season start to
  its end, one per player, none duplicated; the held player's old club record is replaced,
  his price, squad place and position are unchanged and only his Fantasy club changes;
- a wrong list (a placed player listed, an unplaced one missing), a fixture the
  observation did not cover, a held-player move without the guard, Fantasy additions
  nobody accepted, and a source observation older than 30 minutes all stop with nothing
  saved; the apply refuses an observation older than 24 hours;
- a rehearsal leaves no persistent change (nine table counts and a hash of squads,
  prices, positions and the scoring snapshot, all unchanged) and reports
  `ineligibleAfterRehearsedApply` from the import's own checks after applying inside
  its transaction; without that step the report says nothing about eligibility;
- the apply waits for a transfer holding the squads lock; two applies at once give one
  update and no duplicate player; a failure part-way through rolls everything back and
  the apply then succeeds on retry; retrying an applied observation is refused;
- the resolver's read-only transaction refuses a write placed inside it, and a rehearsal
  that applies refuses while the Fantasy tick is on.

It found a defect in the first version of the recorder (its session temp function made a
second run in the same editor session fail), fixed. Removing the held-move guard, the
list-equality check or the post-apply eligibility check each fails the suite.

Not covered by that suite: the real production data volume, the plan's behaviour on
names it has never seen, and the scheduled jobs of production beyond the local ones.

## The two special cases

**Anas Zniti (provider 404731), fixture 19874710. Not in the first package.**
Evidence: the stored provider lineup of 19874710 (26 Sept 18:00 UTC) lists him as CODM
Meknès's **starting goalkeeper (shirt 1)**; the provider lineup of 19874705, Berkane's
match, does not include him; our 2026/27 record at RSB Berkane was carried over on 17 Sept
(not dated provider evidence), and his 2025/26 Berkane record ended 2026-07-05.
He is held in 1 Fantasy squad and in that team's locked GW1 lineup as a starter (slot 1,
not captain; the team has a Bench Boost active, which does not change a starter). His
Fantasy club is Berkane, so GW1 looks for him in 19874705, where he is not listed:
his participation is unknown, which blocks that lineup and the gameweek. Canonical
correction (a club record at CODM from the provider evidence) and Fantasy policy (which
fixture scores for a held player) are separate decisions; the existing apply makes
both at once. If he played the whole match for CODM (two goals conceded at 62' and
73', so no clean sheet): 2 for the appearance, minus 1 for goals conceded, plus one
point per three saves; his minutes and saves are unknown until 19874710 imports.
Nothing is executed.

**Player 37541460 (no provider position), fixture 19874707.** Provider data: bench,
shirt 24, FUS Rabat; no date of birth, no position. Our data: no mapping and no player
under any similar name. `app.players.position` is NOT NULL with four values (no
"unknown"), and the import rejects any other position, so a canonical identity cannot
be created without a real position; the Fantasy catalog position is derived from it
and is not needed. His participation stays unknown: he is not omitted, and nothing is
invented. The position can be sought from the provider's lineup row (`position_id`,
not exposed by the diagnostic today) or an official source; either needs approval.
He blocks 19874707 only, not the first fixture.

## How the safety claims were checked

`STABLE` is not a complete no-write guarantee (a stable function can call a volatile
one). For the production functions actually invoked, the bodies and callees were read:
`api.football_current_performance_fixture_batch` is a wrapper over `_v1` that reads
only; `app_private.current_player_list_plan` and `current_player_list_season` call only
non-volatile helpers and contain no write statements; the one volatile function found
(`fantasy_validate_scoring_document`, called by `fantasy_scoring_input_document`) was not
called. The resolver script declares its transaction read only, and a test shows PostgreSQL
refusing a write inside it. A rehearsal that applies and rolls back is a write and is not
run against production without authorization.

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
