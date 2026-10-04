# GW1 left-out players: applied and imported, 4 October 2026

Production `tkewgajrljbwgwedqsxn`. Owner-approved ("go all the way, stop at the first surprise").

## Done

| Time (UTC) | Step                                                                                                                                                                  | Result                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 06:15      | Merged PR #327 at `890210c9` (CI green: database-quality, application-quality, Vercel review)                                                                         | main `2f8140b2`                                                                                                                                                                            |
| 06:16      | Live refresh paused (`notification_email_configure('off', null, null, false)`); mode stayed `off`; Fantasy tick already off; no workflow, cron run or query in flight |                                                                                                                                                                                            |
| 06:17      | `apply-20261004120000-current-fixture-left-out-players.sql`, rehearsal (rollback)                                                                                     | "Rehearsal passed"; re-read: nothing persisted                                                                                                                                             |
| 06:18      | Same script with `commit;`                                                                                                                                            | "Applied"; history row, table, grants verified                                                                                                                                             |
| 06:19      | Diagnose (read-only) 706-710                                                                                                                                          | 706, 707, 709, 710 validate (706 and 709 goals from match events; 710 forward rule for 37550342); 708 `current_starter_minutes_missing` (already accepted, not a blocker); no unnamed rows |
| 06:20      | Diagnose (read-only) 711                                                                                                                                              | validates; no unnamed rows                                                                                                                                                                 |
| 06:21      | Ingest 711 (canary)                                                                                                                                                   | 27 placed, 12 left out; score 2-1 = 2 placed goals + 1 left-out goal; scoring document accepts it                                                                                          |
| 06:23      | Ingest 707                                                                                                                                                            | 29 placed, 11 left out                                                                                                                                                                     |
| 06:25      | Ingest 706                                                                                                                                                            | 33 placed, 7 left out; one goal corrected from match events                                                                                                                                |
| 06:27      | Ingest 709                                                                                                                                                            | **Refused, `LEFT_OUT_ROWS_EXCEEDED`. Nothing written.** Stopped here.                                                                                                                      |
| 06:30      | Live refresh restored (`… true`)                                                                                                                                      |                                                                                                                                                                                            |

GW1 scoring document now: ready 705, 706, 707, 708, 711; pending 709, 710. GW1 stays `provisional`; the worker was not run.

## Why 709 stopped

19874709 (Wydad Casablanca vs Widad Témara, 1-3; earlier notes, the 20261004130000 migration's
comment and its apply script call it "MAS vs Zemamra" by mistake: that is 19874711, Maghreb Fès
vs CR Khemis Zemamra. The club ids used everywhere were the right ones). Provider lineup 39 rows:

- club 16938 (Widad Témara): 19 rows, **none placeable** (13 no mapping, 6 mapped with no 2026/27 club record there);
- club 2846 (Wydad Casablanca): 20 rows, 13 placed, 7 not placeable.

26 would be left out (limit 20) and 13 kept (minimum 22). Nobody's points depend on them:
the only held player at Widad Témara is Belfada (owner-confirmed absent), and the 7 held Wydad
players are all mapped (4 in this lineup, placed). The limit is the coverage table's own
bound (`excluded_incomplete_rows <= 20`, `valid_player_rows >= 22`), kept by the rule.

## Not attempted

19874710 (needs the Zniti decision, approved). The GW1 worker. GW2.

## Later the same morning

- 06:4x: owner: "raise the limit and import 710". Live refresh paused; 19874710 ingested (27 placed incl. 404731 at 270260 by the owner decision: 90 min, 2 conceded; 13 left out; forward rule for 37550342); live refresh restored. GW1 ready: 705, 706, 707, 708, 710, 711; pending 709.
- Limit change opened as PR #328 (`20261004130000`).

## Raised limit applied; 709 stopped again

| Time (UTC) | Step                                                                                                                                         | Result                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 06:44      | Merged PR #328 at `b9538920` (CI green: database-quality, application-quality, Vercel review; Codex P1 on the cron guard fixed and resolved) | main `31a33877`                                                                                                                                                              |
| 06:45      | Live refresh paused; no workflow, cron run or other query in flight                                                                          |                                                                                                                                                                              |
| 06:45      | `apply-20261004130000-current-fixture-left-out-limit.sql` from main (sha256 of the file equal to the PR head's), rehearsal                   | "Rehearsal passed"; re-read: not recorded, both functions at their old md5, old constraints                                                                                  |
| 06:45      | Same script with `commit;`                                                                                                                   | "Applied"; history row, new limits in the import, the scoring check and both constraints (validated against all 246 coverage rows), import callable by the service role only |
| 06:46      | Ingest 19874709 (run 37183773443, commit `31a33877`)                                                                                         | **Refused, `LEFT_OUT_PLAYER_HELD`. Nothing written.** Stopped here.                                                                                                          |
| 06:47      | Live refresh restored                                                                                                                        |                                                                                                                                                                              |

### Why

Provider 37771847, **Mouad Enzo**, started for Wydad Casablanca (2846) in 19874709. He is
mapped, but the catalogue files him at CODM Meknès: club record CODM 2026-09-24..2027-06-30,
Fantasy club CODM, MID, 7.3. With no Wydad record on match day he would be left out, and he is a
GW1 **starter** in one locked lineup (`28ea2df1-…`, not captain), so the rule refused, as it
should. He is not on CODM's GW1 team sheet (19874710), so he played one GW1 match, for Wydad.
Same case as Zniti: scoring his 709 row at Wydad (`placeAtFixtureClub`, his Fantasy club
unchanged) needs an owner decision.

Earlier checks looked at held players whose Fantasy club is one of the two clubs, which is why
he was missed. All other left-out mapped rows of 709 are held by nobody. Held GW1 players with
no provider link anywhere: Belfada (approved absent) and Lahouizi (Amal Tiznit, 19874708,
already imported).

GW1 scoring document: ready 705, 706, 707, 708, 710, 711; pending 709. GW1 stays
`provisional`; the worker was not run.

## Enzo decision; 709 in, GW1 complete

Owner: "Yes, score Enzo at Wydad and import 709".

| Time (UTC) | Step                                                                                                                    | Result                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 07:06      | Merged PR #329 at `94dac903` (approved `placeAtFixtureClub` 37771847 at 2846 for 19874709; CI green, Codex no findings) | main `23333508`                                                                                                                                                                                     |
| 07:06      | Live refresh paused; Fantasy tick off; no workflow, cron run or other query in flight                                   |                                                                                                                                                                                                     |
| 07:06      | Ingest 19874709 (run 37184789838, commit `23333508`)                                                                    | **Accepted.** 14 placed (Enzo at Wydad by the decision), 25 left out; Belfada absence re-checked; score 1-3 = 1 placed goal + 3 left-out goals (one goal statistic corrected from the match events) |
| 07:07      | Live refresh restored                                                                                                   |                                                                                                                                                                                                     |

Checked after: coverage `accepted` (14 valid, 25 excluded by mapping, 0 unnamed); Enzo's row at
Wydad Casablanca (started, 76 min, 2 conceded, no goal or assist); his club records unchanged.

GW1 scoring document: **all seven fixtures ready**, no pending fixture, no pending player, and
the validator reports no problem. 68 left-out rows recorded across GW1. GW1 stays
`provisional`; the Fantasy worker has not been run (waiting on the owner).

## GW1 Fantasy worker: stopped before completion

Owner: "yes run the GW1 scorer".

| Time (UTC) | Step                                                                                         | Result                                                                           |
| ---------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 07:09      | Live refresh paused; tick off; nothing in flight. Before: 6 provisional results at calc 19   |                                                                                  |
| 07:09      | `fantasy-manual-worker.yml` run 37184934088 (commit `23333508`, GW1, calculation version 19) | **Failed, `fantasy_rankings_incomplete`** in `service_complete_fantasy_gameweek` |
| 07:10      | Live refresh restored                                                                        |                                                                                  |

Where it stopped: the snapshot was sealed at calculation version **20** (chosen by
`service_prepare_fantasy_live_scoring`); GW1 is `finalizing`; all 6 team results are `final`
(8, 6, 10, 5, 6, 8 points); overall and gameweek rankings exist for all 6 teams (ranks 1-6), and
for league "Les lions De Settat". GW1 is not `finalized`; prices, finalized notifications,
prizes and GW2 preparation have not run; GW2 is still `scheduled`.

Cause: a mismatch between two functions. `service_fantasy_scoring_league_page` lists only
**active** leagues for ranking (`20260925090500`), but the completion check
(`20260914200730`) requires league rankings for every **active membership**, whatever the
league's state. Team `88c70be9` is an active member of "E2E Ligue tor4" (`1fdca6a8`), an
inactive test league created 2026-09-23, so that league is never ranked and the check can never
pass. Not related to the GW1 football data.

A retry must use calculation version **20** (a `finalizing` gameweek does not re-prepare).

## Completion fix applied; GW1 finalized

Owner: "Go with option 1, fix the check and finish GW1".

| Time (UTC) | Step                                                                                                                                                  | Result                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 07:22      | Merged PR #330 at `60d8af25` (CI green incl. database-quality; Codex no findings)                                                                     | main `166977b8`                                                                                                                                              |
| 07:23      | Live refresh paused; tick off; nothing in flight                                                                                                      |                                                                                                                                                              |
| 07:23      | `apply-20261004140000-fantasy-completion-skips-inactive-leagues.sql` (statements of the main file; migration sha256 checked by the script), rehearsal | "Rehearsal passed"; re-read: not recorded, function md5 still `77537675…`                                                                                    |
| 07:24      | Same with `commit;`                                                                                                                                   | "Applied"; history row; function md5 `b0a24c74…` (the reviewed new version); service role only                                                               |
| 07:28      | `fantasy-manual-worker.yml` run 37185871150 (commit `166977b8`, GW1, calculation version 20)                                                          | GW1 **finalized** 07:28:27; then failed at GW2 preparation, `fantasy_next_gameweek_not_openable` (GW2's deadline, 2026-10-02 14:30, has passed), as expected |
| 07:29      | Live refresh restored                                                                                                                                 |                                                                                                                                                              |

Checked after:

- GW1 `finalized`, points `final`, calculation version 20. Final scores 10, 8, 8, 6, 6, 5 (unchanged
  from the first run). Gameweek and overall rankings 1-6.
- Postwork recorded complete (07:28:28): price pass over the catalogue, no price changed;
  finalized notifications enqueued (in-app only; e-mail mode `off`).
- Prize "Recharge mobile + maillot d'un club de la Botola" (gameweek tier, 500 MAD): winner
  "Les Lions" (`f8e8a444`, 8 points; tie with `327d3570` broken by fewer transfers), status
  `pending` (staff verification before payment). "ak47 FC" (`84e5a704`, 10 points) was skipped
  with reason `staff`, as the prize rules require.
- GW2 untouched: `scheduled`, lock version 1, its one lineup from 2026-09-25. Step 5 (GW2
  carry-over) has to deal with its past deadline.
