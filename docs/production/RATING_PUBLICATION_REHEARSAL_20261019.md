# Historical rating publication rehearsal

Production V2 `tkewgajrljbwgwedqsxn`, 2026-10-19. One manual writer; only two isolated Backend quality workflows were active, neither touching production. Scheduled-job and worker-lease gates held; no queued HTTP requests, live worker lease or processing erasure was present. Six relevant writer switches were paused and restored to their measured baseline; email mode stayed off and worker scheduling stayed off.

Canonical migration SHA-256: `d57d81ba1815e693283ee44246eb83d143abf2dd9fe7c2635729664b3ad1322a`. Executed the exact generated promoter, published reviewed plans 5/6/7, verified the customer reads, then ended with a deliberate exception. The transaction rolled back.

Receipt: 3 publications, 1,982 indexed player rows, all 20 owned team/gameweek reads matched independently checked proposal totals, provisional state and absent final score. The full batch took 1,317.879ms. The displayed rules started from GW1 only after all three publications existed. No substitute rating, forced finalization, player mapping or prize operation occurred.

Independent post-rollback read: migration absent, publication tables absent, original result/snapshot/event/point/ranking/mapping/alias/gameweek/membership/lineup/prize fingerprints matched the pre-write baseline, and all six switches were restored. This is rehearsal evidence, **not a committed publication receipt**.

Database CI at commit `f69008c99fc5a9b00f15505334cc84f525cb7cce` passed the complete pgTAP suite and database lint, then detected expected generated-type drift for the new reader wrappers. The authoritative regenerated types came from artifact 12168218557, run 39212629535. The final commit must pass both required quality jobs before merge/promotion.

Review follow-up: the original final commit `9aa603c1` passed both quality jobs (6,832 database tests), then GitHub correctly refused the merge while two review threads remained unresolved. The subsequent fix restricts loops to confirmed server pending flags and extends visible revisions to season aggregates, top players, recap captain values and deadline briefing form. Manager Card calculations retain their sealed inputs. The expanded rollback rehearsal at canonical SHA `853f1f3e5a2a260372acd5bf3b869e6ce9d7775726c0a315be98550db3ffc432` passed all original owned reads plus independent aggregate, top-player and briefing checks, then verified unchanged fingerprints and restored switches again.

The season-statistics body differs between production and the original migration only by three explanatory comment blocks. Both exact MD5s are pinned (`1b141bf8a70e0db8e6ecd402b2f9beb9`, `92abdd253aa8b1f51ce28b77bde13c5d`). No executable SQL differs. The next canonical source adds only that explicitly measured pre-state acceptance; it must pass the final database replay and production pre-commit rehearsal before promotion.
