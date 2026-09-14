# Finalized Fantasy notification events

The trusted lifecycle worker calls
`api.service_enqueue_gameweek_finalized_notifications(p_gameweek_id uuid,
p_calculation_version bigint, p_after_team_id uuid default null,
p_limit integer default 100)` after finalization. The maximum batch is 1000.
Only `service_role` has execution permission; the function also validates the
service request claim.

The gameweek must be finalized at the exact calculation version. Its scoring
snapshot must be sealed with persisted players and no newer calculation snapshot.
All locked lineups must have final results at that version; mismatched scores,
missing results, and payloads outside the existing notification contract fail
before event insertion.
Later provider updates do not change the completed calculation's notification
facts or prevent resuming its remaining event batches.

Each response contains `scanned`, `enqueued`, `skipped`, `nextCursor`, and
`hasMore`. Continue with `p_after_team_id = nextCursor` while `hasMore` is true.
Treat a non-advancing cursor or inconsistent counters as a failed worker run.
A failed SQL call rolls back its entire batch. After interruption, repeating a
batch or restarting from a null cursor is safe: events use a deterministic key
and UUID derived from gameweek, Fantasy team, and calculation version. A reused
identity with different facts fails instead of silently discarding the conflict.

Events use the existing `gameweek_finalized` type, `fantasy` source, one target
user, and safe payload `{ "gameweek": <number>, "points": <final score> }`.
The source and correlation ID are the gameweek UUID. The event timestamp is the
gameweek's finalization time. French and Arabic in-app templates already exist.

This operation records durable events only. It does not create user
notifications, claim fanout work, queue deliveries, or send push/email. The
existing notification consumer remains responsible for user preferences,
quiet hours, and channel settings. Event enqueue counts are not delivery counts.
No consumer, external delivery, production call, or schedule is enabled by this
migration.

The focused pgTAP file is
`supabase/tests/database/fantasy_finalized_notification_batches.test.sql`.

The lifecycle worker also records postwork in the private
`fantasy_gameweek_postwork` journal, keyed by gameweek and calculation version.
It calls `service_run_fantasy_price_batch` with sequential player cursors before
enqueueing events. The wrapper uses the existing market calculation and derives
its source version from the gameweek sequence plus one. Zero-movement players
still advance the durable cursor; they do not need fabricated price history.
Restarting at a null cursor resumes from the journal's checkpoint, and retrying
the previous request returns its cached response. The player catalog is pinned
for the duration of the pass.

After every price page and finalized-event page has completed, call
`service_complete_fantasy_postwork(gameweek_id, calculation_version)`. It verifies
the terminal price checkpoint and every expected target-user event before
stamping `completed_at`. Next-gameweek progression must verify this exact-version
timestamp. The journal proves completed price processing and durable event
enqueueing; it does not assert that users received notifications.

Postwork regressions are in
`supabase/tests/database/fantasy_postwork_journal.test.sql`.
