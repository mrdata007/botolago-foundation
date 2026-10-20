# Final native-rating email recovery

Production GW4 finalized normally at 09:10:25 UTC on 20 October. All seven final
manager reads and totals were verified; all health checks and the external
watchdog passed. At 09:15, email fanout cancelled seven valid current events.
Direct predicate inspection proves the only failed prerequisite is the obsolete
`fantasy_rating_policy.enabled` flag. The API-only cutover intentionally keeps
that legacy policy disabled; native season policy and the sealed v31 native
snapshot are present, complete, and have no pending ratings. Do not enable the
old scoring policy.

Replace that obsolete prerequisite with authoritative native-season activation
and the current sealed native snapshot: correct rules/version, persisted player
results, no pending fixtures/players and valid approved Not rated evidence.
Preserve ownership, consent, score/version equality, lineup finalization,
selected-player final points, historical-revision suppression, activation
cutoff and deduplication checks. No scoring or email template change.

Add real SQL regressions for native scoring with legacy policy disabled, missing
or unsealed/non-native/stale/pending snapshots, and existing send guards. Stage
with automation off, require CI, rehearse and independently prove rollback
before production apply. Replay only the exact seven cancelled, post-activation
GW4 events if still current, eligible and never delivered; no new events or
historical backfill. Verify actual dispatcher acceptance without claiming inbox
receipt.
