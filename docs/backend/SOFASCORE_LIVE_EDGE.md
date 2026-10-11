# SofaScore live refresh in the Edge Function

`football-live-refresh` reads live scores, results and the season calendar from
SofaScore (RapidAPI) when `api.football_data_source()` says so. SportsMonks is
not called on that path. Code: `supabase/functions/_shared/sofascore-live-refresh.ts`
(wired in `football-live-refresh.ts`).

## The switch

```sql
select app_private.football_data_source();                 -- read it
select app_private.football_data_source_configure('shadow');
select app_private.football_data_source_configure('sofascore');
select app_private.football_data_source_configure('sportsmonks'); -- back
```

| Value         | What the function does                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sportsmonks` | Unchanged: SportsMonks reads and writes, with match details.                                                                                                                                                                                                                                                                                            |
| `shadow`      | Reads SofaScore, builds the exact `api.ingest_football_fixture` calls, logs them as ONE JSON line (`football_live_refresh_sofascore`, `result: "shadow"`), writes nothing. SportsMonks is not called either (it is no longer paid for). Note the migration comment for the switch says "SportsMonks writes" in shadow; that is not what this code does. |
| `sofascore`   | Reads SofaScore and writes through `api.ingest_football_fixture`, the same RPC and error classes as the SportsMonks path.                                                                                                                                                                                                                               |

Flip `shadow` first, read the Edge logs for a match day, compare with
`scripts/backend/sofascore-live-shadow-compare.ts`, then flip `sofascore`.

## Does the cron tick need the SportsMonks switch?

Yes. Both ticks are gated by the same flag, `football_live_refresh_enabled` in
`app_private.notification_email_settings` (and `functions_base_url` must be
set). Read from `app_private.football_live_refresh_tick()` and
`football_season_refresh_tick()` (migration 20260926113100):

- off: both return `disabled` and never call the function. Leave it ON.
- the live tick additionally calls the function only when a current-season
  fixture is in play or about to start (every 2 min), kicks off within 10
  minutes (every 5), or was finalized within 2 hours (every 15). Otherwise it
  is `idle`. The statuses it reads are those in `app.fixtures`, which the
  SofaScore path keeps up to date.
- the season tick calls it once an hour regardless of matches.

`app_private.football_data_source_configure` does not change either tick.

## Deploy

1. Apply migration `20261011100000_football_sofascore_live_snapshot.sql`
   (`api.football_sofascore_live_snapshot()`, service role, read only). Without
   it the SofaScore path answers `database_unavailable`; `sportsmonks` is
   unaffected.
2. Deploy the Edge Function `football-live-refresh`. Secret `RAPIDAPI_KEY` is
   already set. Optional: `SOFASCORE_MIN_REMAINING` (default 100),
   `SOFASCORE_TOURNAMENT_ID` (default 937), `SOFASCORE_SEASON_ID` (default 102220).
3. Pause the football refresh jobs first if you write fixtures meanwhile
   (AGENTS.md). Deploying is the owner's step.

## Requests per tick

- live job: 1 (`tournaments/get-live-events?sport=football`), plus 1
  (`get-last-matches` page 0) only when a mapped fixture that production shows
  in play, or that kicked off in the last 3 hours without a status, is missing
  from the live list (the final whistle).
- season job: 2 (`get-next-matches`, `get-last-matches`, page 0), hourly.

Every request logs `quotaRemaining` / `quotaLimit`. Below the client's floor
(`SOFASCORE_MIN_REMAINING`) the client refuses: the function answers 429
`provider_rate_limited` and writes nothing (all reads happen before the first
write).

## What gets written

Only events whose fixture, competition, season, round and both teams have an
active SofaScore mapping. Unmapped events are logged, never ingested (the RPC
would create a fixture). Unknown SofaScore statuses are never written. A call is
sent only if it changes something: kickoff, status, period, score, or a new
`finalizedAt`. Skipped, and logged: unchanged, stale (older than the stored
`provider_updated_at`, which the database trigger would reject), and a
finished/cancelled/abandoned fixture asked to change status. `finalizedAt` is set
for finished codes 100/110/120 only. Each write tick records a `fixtures`
ingestion run (provider `sofascore`) because the ops checks `live_scores` and
`provider_refresh` read run freshness from `football_ingestion_runs`.

## Not included

Match details (events, lineups, team statistics) are not read from SofaScore:
the `match_details_backfill` job answers `skipped`, and the live job reports
`matchDetails: skipped`. A later change ports them.

## Open points

- Finished status codes 100/110/120 are an assumption (see `sofascore-fixtures.ts`).
- After the switch, a fixture last written by SportsMonks keeps its
  `provider_updated_at`; SofaScore updates older than that are skipped as stale
  until its `changeTimestamp` passes it.
- `venue_id` is sent as null, as on the SportsMonks path.
