# GW5/6 calendar admission

Owner authorization: 20 October 2026, “go”, following the explicit proposal to import available GW5/6 fixtures and verify opening and reminders.

Primary evidence: successful read-only diagnostic run 39404722376, next-matches capture 2026-10-20T10:00:16.685Z, tournament 937 / season 102220. The complete page has 17 events and no next page. Sixteen events form rounds 5 and 6: eight matches and sixteen distinct existing clubs per round. The additional round-1 replay is excluded to preserve sealed history.

Preserve all existing fixtures, rounds, provider mappings, manager selections, transfers, published points, calculation versions and competition seals. Create only two new rounds and sixteen upcoming fixtures through the existing ingestion RPCs; then use the existing calendar RPC to derive gameweeks, assignments and deadlines. No direct opening, invented dates, ratings or new scoring policy.

Method: validate the raw feed with the released SofaScore parser; pin parent identities and live RPC definitions; reject pre-existing candidates and incomplete/duplicate clubs. Pause and drain relevant writers, including Pépites; rehearse the actual transaction with deliberate rollback and verify it independently; apply identical source, restore all switches, and let normal lifecycle/email automation progress.

Acceptance: exactly 16 imported fixtures / 2 rounds / 2 gameweeks / 16 assignments; exact API native IDs, clubs and kickoffs; zero changes to existing protected rows; GW5 opens through normal progression; GW6 stays scheduled; deadlines follow the existing rules; opening and 24-hour reminders retain consent, cutoff and deduplication checks; independent production health passes. Confirm PR543 is merged (f335d41d0f155093f6b388b7edc632ddf0fe79c8).

The provider currently sends changeTimestamp=0 for all upcoming events. Preserve the released adapter’s freshness semantics exactly; do not replace it with a claimed provider update time. The genuine capture time is recorded separately in this receipt.

## Production result

Production writer: this owner-authorized operation on `tkewgajrljbwgwedqsxn`. The only other running GitHub jobs were application/database CI on their isolated local stack; no production mutation workflow or other agent was active. Scheduled related writers were held, paused and drained; Pépites was confirmed `public` before being paused and restored. Existing maintenance safeguards and the email activation cutoff were retained.

The first rehearsal caught an ambiguous SQL loop variable and rolled back without adding any rows; all 23 protected fingerprints and the original 32/4/4 fixture/round/gameweek counts were independently verified. The variable was disambiguated before the successful full-path rehearsal. Its deliberate PASS exception rolled back all new objects; a separate read again verified exact restoration. The identical source then applied, changing only the execution-mode literal. Default-rehearsal SQL SHA256: `3878d69265ad07edaa833df260f73051d9f488c7f05deff7b59030909d1dfe7c`.

The guarded RPC operation added exactly 2 rounds, 16 fixtures, 2 scheduled gameweeks and 16 assignments. All 23 protected sets remained identical immediately after import. All original automation switches were restored. No migration, Edge deployment, provider remapping, fabricated rating or direct gameweek opening occurred.

Normal orchestrator [39405871483](https://github.com/mrdata007/botolago-foundation/actions/runs/39405871483) succeeded and opened GW5 at 10:09:44.769188 UTC (14:09 Dubai), using the existing GW4 version31 progression journal. GW6 stayed scheduled. Seven authenticated owner-context team reads returned GW5, 15 squad members, 15 lineup members and 2 free transfers each. After normal progression, all 22 historical/protected sets remained unchanged; the seven team rows advanced normally to GW5, with seven new lineups. The original lineups were verified separately.

GW5 deadline: **24 October 2026, 13:30 UTC / 17:30 Dubai**. First kickoff: 15:00 UTC / 19:00 Dubai. GW6 deadline: **30 October, 17:30 UTC / 21:30 Dubai**.

The normal 10:10 UTC email cron completed the single GW5 opening event, delivered seven in-app notices and sent seven emails with provider acceptance, between 10:10:01.8158 and 10:10:04.618248 UTC. Provider acceptance does not establish inbox receipt. The read-only deadline-payload checks rejected sending now, accepted the 24-hour boundary (**23 October, 13:30 UTC / 17:30 Dubai**) and rejected the final 29 minutes. No deadline event was created early. Consent, deduplication and the original 19 October activation cutoff remain unchanged.

Database health was `ok`, with no failed checks. Independent production watchdog runs [39405965085](https://github.com/mrdata007/botolago-foundation/actions/runs/39405965085) and [39406078190](https://github.com/mrdata007/botolago-foundation/actions/runs/39406078190) both succeeded. PR543 is merged, including the previously verified production email fix.

## Verified remaining dependency

This operation clears the missing GW5/6 calendar gate. It does **not** prove that rating delays can never block a later opening. The released worker returns `fantasy_ratings_pending` before its close steps, and the live `api.service_begin_fantasy_close` guard rejects pending fixture/player inputs. GW5’s last kickoff is 29 October at 20:00 UTC; GW6’s selection deadline is 30 October at 17:30 UTC. A genuine short unrated appearance may therefore require its approved 24-hour proof after the next selection deadline. This is a concrete timing risk, not a claim that future ratings will be missing.

The recommended next correction is to separate the availability of the next selection window from final rating settlement, while retaining the final-scoring seal guard. It needs an explicit contract for Free Hit restoration, transfer rollover and sale-price snapshots before opening, plus replay/concurrency tests proving those changes happen once and late rating corrections cannot alter already executed trades or historical selections. Do not solve it by reducing the 24-hour proof, guessing ratings, moving the API deadline or forcing finalization. The current calendar receipt does not authorize an unreviewed change to those economic rules.
