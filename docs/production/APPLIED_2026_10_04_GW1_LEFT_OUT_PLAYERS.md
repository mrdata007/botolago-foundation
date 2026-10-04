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

19874709 (MAS vs Zemamra). Provider lineup 39 rows:

- club 16938 (Zemamra): 19 rows, **none placeable** (13 no mapping, 6 mapped with no 2026/27 club record there);
- club 2846 (MAS): 20 rows, 13 placed, 7 not placeable.

26 would be left out (limit 20) and 13 kept (minimum 22). Nobody's points depend on them:
the only held player at Zemamra is Belfada (owner-confirmed absent), and the 7 held MAS
players are all mapped (4 in this lineup, placed). The limit is the coverage table's own
bound (`excluded_incomplete_rows <= 20`, `valid_player_rows >= 22`), kept by the rule.

## Not attempted

19874710 (needs the Zniti decision, approved). The GW1 worker. GW2.

## Later the same morning

- 06:4x: owner: "raise the limit and import 710". Live refresh paused; 19874710 ingested (27 placed incl. 404731 at 270260 by the owner decision: 90 min, 2 conceded; 13 left out; forward rule for 37550342); live refresh restored. GW1 ready: 705, 706, 707, 708, 710, 711; pending 709.
- Limit change opened as PR #328 (`20261004130000`).
