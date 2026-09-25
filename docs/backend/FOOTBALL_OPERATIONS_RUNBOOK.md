# Football operations runbook

This runbook covers BotolaGO Production V2 Phase 3. It does not authorize production deployment or production cron activation.

## Runtime modes

The browser uses `VITE_FOOTBALL_DATA_MODE`:

- `mock`: deterministic preview/test repository.
- `supabase`: controlled V2 `api` RPCs.

Development defaults to `mock` when the variable is absent. Production fails closed when it is absent or invalid. Production never falls back to mock data after a Supabase error.

The server uses `FOOTBALL_PROVIDER`. Phase 3 supports only `fixture`, which is a deterministic test adapter and is not live. Selecting a production provider requires a reviewed adapter, contractual media/data rights, staging soak tests, and a separate activation change.

## Ingestion jobs

The provider interface and runner isolate these jobs:

1. competitions
2. seasons
3. rounds
4. teams
5. players
6. squads
7. fixtures
8. standings
9. lineups
10. live fixtures
11. match events
12. match statistics
13. player availability
14. fixture finalization

Each execution receives its own run ID, bounded pages, checkpoint, counters, retry budget, and sanitized error. Record-level rejection does not abort the entire page. Exhausting the configured page budget records a partial failure instead of losing the cursor.

The concrete Supabase gateway enables normalized fixture persistence only. Other concrete write adapters remain disabled until a production provider is selected; the capability interface and deterministic runner tests are complete, but no fake catalog/event integration is claimed.

## Match details (events, statistics, lineups, xG, pressure, absences)

The match page's Résumé, Stats and Compos tabs are filled by the live refresh (`football-live-refresh`), after the scores: `supabase/functions/_shared/sportsmonks-match-details.ts` asks `api.service_football_match_details_due` which fixtures are on, about to start or finalized in the last two hours, fetches each from SportsMonks (`/fixtures/{id}` with events, statistics, lineups, formations, sidelined players, and the `xGFixture` and `pressure` add-ons) and stores it with `api.ingest_football_match_details` (migration `20260925141500`). A request refused with the add-ons is retried once without them and counted as `addOnsUnavailable`. xG is two team statistics (`expected_goals`, `expected_goals_on_target`); the pressure index is `app.fixture_pressure` (read by `api.football_match_pressure`); the absent players are `app.fixture_absences` (read by `api.football_match_absences`). A failure there is reported in the reply's `matchDetails` and never holds back a score. Each pass is an ingestion run with `job_type = 'match_events'`; a failed fixture is a rejection on that run.

Events keep their row id from one refresh to the next (the page's goal takeover is keyed on it); an event the provider stops reporting is removed, down to the last one; a section missing from the reply keeps what is stored, as does an empty statistics, lineups or pressure section (an events or absences list, even empty, is the provider's current word); an older reply changes nothing. Players missing from the catalogue are counted as `unmappedPlayers` and, from migration `20260925170000`, stored in the lineup by the provider's name (`app.lineup_players.player_name`, no `player_id`); `api.football_match_lineups` returns them as `unlistedPlayers` beside `players`, and the site shows both as one team sheet ([`APPLY_2026_09_25_LINEUP_NAMES.md`](../production/APPLY_2026_09_25_LINEUP_NAMES.md)). The body `{"job":"match_details_backfill"}` fetches finished matches with no details, ten per call; a match stored once (even with nothing in it, marked in `app_private.football_match_details_syncs`) or refused twice by the backfill is not asked for again; deleting a match's mark has the backfill fetch it again. Owner steps: [`docs/production/APPLY_2026_09_25_MATCH_DETAILS.md`](../production/APPLY_2026_09_25_MATCH_DETAILS.md).

## Local and staging scheduling scaffold

No `pg_cron` job and no hosted scheduled Edge Function is activated by Phase 3.

Recommended cadence configuration for later activation:

| Fixture state                                             | Eligibility | Suggested cadence        |
| --------------------------------------------------------- | ----------- | ------------------------ |
| More than six hours before kickoff                        | no          | none                     |
| Six to one hours before kickoff                           | yes         | 15 minutes               |
| One hour to ten minutes before kickoff                    | yes         | 5 minutes                |
| Ten minutes before kickoff until live                     | yes         | 30 seconds               |
| Live / half-time / extra time / penalties                 | yes         | 15 seconds               |
| Delayed                                                   | yes         | 60 seconds               |
| Suspended                                                 | yes         | 5 minutes                |
| Finished correction window                                | yes         | 5 minutes for 15 minutes |
| Cancelled / abandoned / finalized after correction window | no          | none                     |

`liveSchedulingDecision` is the executable local/test policy. Activation must be a separate reviewed deployment that enforces one scheduler leader, concurrency limits, quota budgets, and environment-specific provider credentials.

## Stale data and corrections

- Fixture, lineup, event, statistic, standing, and availability rows carry provider update time plus source sequence.
- Older timestamps or lower same-timestamp sequences are rejected as `STALE_UPDATE`.
- Terminal fixture regression is rejected as `INVALID_FIXTURE_STATE` unless a trusted correction transaction explicitly enables correction mode.
- Events have one fixture-scoped idempotency key and an optional provider event key.
- Replayed provider IDs resolve to one internal UUID. Conflicting UUIDs return `MAPPING_COLLISION`.

Do not manually edit canonical rows from a browser or expose `app`/`app_private`. A future admin correction flow must call a dedicated trusted RPC, record actor and reason, and preserve the canonical UUID.

## Realtime

Only `api.live_fixture_updates` is published. Canonical Football tables are not published. The projection is browser read-only and contains no provider identity or operational metadata.

Clients treat a Realtime message as an invalidation hint and re-fetch `football_match_detail` or the appropriate feed RPC. Do not make a WebSocket payload the source of truth.

## Provider outage

The client policy combines timeout, bounded exponential backoff, jitter, retry budget, and a temporary circuit breaker. On an outage:

1. Stop creating new wide synchronization work.
2. Preserve the last successful checkpoint.
3. Keep public reads on the last canonical data with freshness timestamps.
4. Record stable provider error codes; never record authorization headers or raw secrets.
5. Resume a bounded job from its checkpoint after the circuit reset window.
6. Do not retry malformed payloads until mapping or adapter logic changes.

## Media and licensing

Football media accepts validated HTTPS references or controlled `football/` Storage paths. Browser upload is disabled. Do not copy provider logos, crests, player photos, or venue images until redistribution rights and required attribution are confirmed. The frozen UI remains functional with deterministic code/color fallbacks.

Team crests are confirmed: on 2026-09-23 the owner confirmed the SportsMonks plan allows copying them into `football-media` and serving them from there. Player photos stay out by the owner's choice (the UI shows kit shirts instead). Competition logos and venue images remain unconfirmed.

## Validation commands

```bash
bun run backend:migrations:check
bun run backend:secrets:check
bun run backend:db:start
bun run backend:db:reset
bun run backend:db:test
bun run backend:db:lint
bun run backend:types:check
bun run typecheck
bun run test
bun run lint
bun run build
```

Run all database commands against local or the approved V2 staging project only. Phase 3 must not modify Production V2 or the legacy project.

## Rollback

Application rollback is first: set staging to a reviewed build using `VITE_FOOTBALL_DATA_MODE=mock`. The additive Football schema may remain dormant. If staging schema reversal is necessary, write and review a new inverse migration that removes API grants/projection first, then dependent match/ingestion objects, then catalog objects. Never reset a remote database and never apply a down migration to the legacy project.
