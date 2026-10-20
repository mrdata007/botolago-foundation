# GW5/6 calendar admission

Owner authorization: 20 October 2026, “go”, following the explicit proposal to import available GW5/6 fixtures and verify opening and reminders.

Primary evidence: successful read-only diagnostic run 39404722376, next-matches capture 2026-10-20T10:00:16.685Z, tournament 937 / season 102220. The complete page has 17 events and no next page. Sixteen events form rounds 5 and 6: eight matches and sixteen distinct existing clubs per round. The additional round-1 replay is excluded to preserve sealed history.

Preserve all existing fixtures, rounds, provider mappings, manager selections, transfers, published points, calculation versions and competition seals. Create only two new rounds and sixteen upcoming fixtures through the existing ingestion RPCs; then use the existing calendar RPC to derive gameweeks, assignments and deadlines. No direct opening, invented dates, ratings or new scoring policy.

Method: validate the raw feed with the released SofaScore parser; pin parent identities and live RPC definitions; reject pre-existing candidates and incomplete/duplicate clubs. Pause and drain relevant writers, including Pépites; rehearse the actual transaction with deliberate rollback and verify it independently; apply identical source, restore all switches, and let normal lifecycle/email automation progress.

Acceptance: exactly 16 imported fixtures / 2 rounds / 2 gameweeks / 16 assignments; exact API native IDs, clubs and kickoffs; zero changes to existing protected rows; GW5 opens through normal progression; GW6 stays scheduled; deadlines follow the existing rules; opening and 24-hour reminders retain consent, cutoff and deduplication checks; independent production health passes. Confirm PR543 is merged (f335d41d0f155093f6b388b7edc632ddf0fe79c8).

The provider currently sends changeTimestamp=0 for all upcoming events. Preserve the released adapter’s freshness semantics exactly; do not replace it with a claimed provider update time. The genuine capture time is recorded separately in this receipt.
