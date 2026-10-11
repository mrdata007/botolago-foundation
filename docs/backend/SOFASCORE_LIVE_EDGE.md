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
   unaffected. Then apply `20261011110000_football_sofascore_snapshot_teams.sql`
   (adds each fixture's home and away team ids to the snapshot; the backfill needs
   it, the live tick falls back to the event's clubs without it). Migration first,
   then deploy the function.
2. Deploy the Edge Function `football-live-refresh`. Secret `RAPIDAPI_KEY` is
   already set. Optional: `SOFASCORE_MIN_REMAINING` (default 100),
   `SOFASCORE_TOURNAMENT_ID` (default 937), `SOFASCORE_SEASON_ID` (default 102220).
3. Pause the football refresh jobs first if you write fixtures meanwhile
   (AGENTS.md). Deploying is the owner's step.

## Requests per tick

- live job: 1 (`tournaments/get-live-events?sport=football`), up to 12 more for
  match details (see below), plus 1
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

## Match details (events, lineups, team statistics)

Code: `supabase/functions/_shared/sofascore-match-details.ts`, wired in
`sofascore-live-refresh.ts`. Same RPC and payload as the SportsMonks path
(`api.ingest_football_match_details`, provider `sofascore`), so the match page
reads them the same way.

Requests: 3 per fixture, in this order, all read before anything is written for
that fixture: `matches/get-incidents`, `matches/get-lineups`,
`matches/get-statistics` (`?matchId=<event id>`). A provider failure, or a quota
refusal, on any of them leaves that fixture unwritten. A quota refusal also ends
the run (the remaining fixtures keep their quota) and is not recorded as a
rejection against the fixture. Lineups or statistics the provider does not have
(404) are stored as empty; incidents are required.

When:

- Live tick (`fixtures` job), after the scores are written: at most
  `SOFASCORE_DETAILS_PER_TICK` fixtures (default 4, max 8, `0` = off), so at most
  12 more requests. Order: a mapped fixture written as finished this tick, then
  mapped fixtures in play whose score or status was written or whose
  `changeTimestamp` is under 150 s old, newest change first. The season job
  fetches none. Details never hold a score back; the outcome is in
  `matchDetails` of the response and the log line.
- `{"job":"match_details_backfill"}`: asks
  `api.service_football_match_details_due('sofascore', <season>, 'backfill', n)`,
  which returns finished fixtures of the current season, mapped to SofaScore,
  with no "details stored" mark and fewer than two earlier backfill rejections.
  At most `SOFASCORE_DETAILS_BACKFILL_LIMIT` per run (default 4, max 10, `0` =
  off). Run it by hand until the backlog is empty; it is not scheduled.
- `shadow`: the same reads, one `shadow_match_details` log line per fixture with
  the payload, nothing written (no RPC, no ingestion run).

Mapping to the payload:

| Payload                    | From                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events` goal              | incident `goal/regular` (also any other goal class)                                                                                                                                                         |
| `events` penalty_goal      | incident `goal/penalty`                                                                                                                                                                                     |
| `events` own_goal          | incident `goal/ownGoal` (not seen in the 10 sample matches: class name to confirm), placed on the side the score moved for                                                                                  |
| `events` missed_penalty    | `inGamePenalty/missed` (and `saved`)                                                                                                                                                                        |
| `events` yellow/second/red | `card/yellow`, `card/yellowRed`, `card/red`                                                                                                                                                                 |
| `events` substitution      | `substitution/regular`: player = player in, related = player out                                                                                                                                            |
| event key, minute, order   | incident `id`, `time` + `addedTime`; sorted by match time, `sequence` 1..n; rescinded and `period` incidents dropped; unknown types counted in `skipped`                                                    |
| `lineups`                  | `home` / `away` of the reply, attached to the fixture's own clubs; `substitute` false = starting, true = bench; `shirtNumber`; `position` G/D/M/F; `formation`; order 1..n for starters, 100+ for the bench |
| `statistics`               | period `ALL` only: `totalShotsOnGoal` shots, `shotsOnGoal` shots_on_target, `goalkeeperSaves` saves, `ballPossession`, `cornerKicks`, `fouls`, `offsides`, `passes`, `expectedGoals`                        |
| `pressure`, `absences`     | `[]` and `null` (the RPC keeps what is stored)                                                                                                                                                              |

Rules that matter:

- Goals come from incidents only. A lineup player's `goals` can undercount.
- Side is the fixture's home/away, never a lineup row's `teamId` (real lineups
  carry other clubs' ids for loaned players). The clubs are the database's home
  and away (`homeTeamId` / `awayTeamId` of the snapshot, mapped back to SofaScore
  team ids), falling back to the event's for the live tick.
- Players go by SofaScore id and name. The RPC resolves them through the active
  `sofascore` player mappings; a player with none is stored by name (lineups) or
  named in the event's `detail`, as an unknown SportsMonks player is. No player
  mapping is created here.
- Minutes played are not sent: the RPC has no field for them.
- Statistic keys other than the first three above are SofaScore's published names,
  not yet seen in the committed samples (those matches carry shots, shots on
  target, saves and cards only). A key that does not match is simply not stored;
  `accuratePasses` is not mapped (a count, `pass_accuracy` is a percentage).

Environment (all optional): `SOFASCORE_DETAILS_PER_TICK`,
`SOFASCORE_DETAILS_BACKFILL_LIMIT`.

Known limit: events are keyed `sofascore:event:<incident id>`, the SportsMonks
ones `sportsmonks:event:<id>`. A match whose details were stored by SportsMonks
and are then fetched from SofaScore shows both. The backfill skips marked
fixtures, so this can only happen to a match that was live across the switch.

## Open points

- Finished status codes 100/110/120 are an assumption (see `sofascore-fixtures.ts`).
- After the switch, a fixture last written by SportsMonks keeps its
  `provider_updated_at`; SofaScore updates older than that are skipped as stale
  until its `changeTimestamp` passes it.
- `venue_id` is sent as null, as on the SportsMonks path.
