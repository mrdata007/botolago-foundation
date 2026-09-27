# Read-only production comparison — 2026-09-27

Project: `tkewgajrljbwgwedqsxn`. Gameweek 1:
`7fcb28c5-9b69-4591-bcda-437c6c961c5c`, season
`5ada3e98-2929-405a-a3f1-a26de8e51933`. Status **live**, scoring input version **0**.
Read-only SQL inspected all seven counted, nonsuperseded assignments. No writes,
mode selections, activation or finalization were performed.

| SportsMonks fixture | Match                              | Stored state                         | Proposal from currently certifiable evidence | Missing facts / score difference                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------- | ------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19874708            | Amal Tiznit 1–3 Ittihad Tanger     | Finished; 28 active performance rows | Simple, pending repair                       | Home goal has no stored attribution (home 0, away 3). Three unidentified starters in legacy coverage. Field-level and discipline/participation evidence still needed. Total delta unknown; excluding the three legacy assists removes 9 raw player points from that component only. |
| 19874707            | UTS Rabat 2–1 FUS Rabat            | Finished; no active performance rows | Simple, pending repair                       | Scorer/participation/discipline and field evidence needed; total delta unknown. Incident identified missing Ajerrar scorer identity; reverify against the first rollout audit.                                                                                                      |
| 19874710            | Difaâ El Jadida 2–6 CODM Meknès    | Finished; no active performance rows | Simple, pending repair                       | All player core evidence and reconciliation needed; total delta unknown.                                                                                                                                                                                                            |
| 19874709            | Wydad Casablanca 1–3 Widad Témara  | Finished; no active performance rows | Simple, pending repair                       | All player core evidence and reconciliation needed; total delta unknown.                                                                                                                                                                                                            |
| 19874705            | Moghreb Tétouan – RSB Berkane      | Not started, 27 Sep 16:00 UTC        | Awaiting match and cutoff                    | No final score or player facts; delta unknown.                                                                                                                                                                                                                                      |
| 19874711            | Maghreb Fès – CR Khemis Zemamra    | Not started, 27 Sep 18:00 UTC        | Awaiting match and cutoff                    | No final score or player facts; delta unknown.                                                                                                                                                                                                                                      |
| 19874706            | Kawkab Marrakech – Hassania Agadir | Not started, 27 Sep 20:00 UTC        | Awaiting match and cutoff                    | No final score or player facts; delta unknown.                                                                                                                                                                                                                                      |

These are **proposals**, not selected modes. This query did not fetch new provider
payloads or certify any event. Legacy `scoring_statistics_complete=true` for
19874708 is insufficient because its normalizer manufactured omitted zeros and
its stored home goals do not reconcile. Never promote that flag to full readiness.

The first validated rollout audit may change a proposal before selection. The
three unplayed fixtures may qualify for full mode if certified data arrives by
their cutoffs. After selection, late data only corrects facts in the same mode.
The gameweek cannot finalize in this state. Complete per-player and manager-score
deltas require certified core data, and must be rerun before enabling production.
