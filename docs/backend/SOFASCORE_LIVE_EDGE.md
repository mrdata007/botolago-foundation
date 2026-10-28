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
  fixture is in play (every 60 s, see "Live polling every 60 seconds" below),
  is delayed/suspended or past kickoff without the feed saying so (every 2
  min), kicks off within 10 minutes (every 5), or was finalized within 2 hours
  (every 15). Otherwise it is `idle`. The statuses it reads are those in
  `app.fixtures`, which the SofaScore path keeps up to date.
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

- live job: 1 (`tournaments/get-live-events?sport=football`), more for match
  details (see below: 1 per changed match in play, 3 per match at full time), plus 1
  (`get-last-matches` page 0) only when a mapped fixture that production shows
  in play, or that kicked off in the last 3 hours without a status, is missing
  from the live list (the final whistle).
- season job: 2 (`get-next-matches`, `get-last-matches`, page 0), hourly while a
  fixture is within a day either side of now, every 3 hours otherwise (see
  "Budget guard and the per-round model" below).
- `rating_polls` job: one `matches/get-lineups` per Fantasy rating poll that is
  due, nothing else (no live feed).

Every request logs `quotaRemaining` / `quotaLimit`. Below the client's floor
(`SOFASCORE_MIN_REMAINING`) the client refuses: the function answers 429
`provider_rate_limited` and writes nothing (all reads happen before the first
write). A 429 from the provider is never sent again (every try is a counted
call); 5xx, timeouts and network errors are retried twice with backoff.

## What gets written

Only events whose fixture, competition, season, round and both teams have an
active SofaScore mapping. Unmapped events are logged, never ingested (the RPC
would create a fixture). Unknown SofaScore statuses are never written. A call is
sent only if it changes something: kickoff, status, period, score, a new
`finalizedAt`, or the live minute (see "The live minute"). Skipped, and logged: unchanged, stale (older than the stored
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

Requests: 3 per fixture at full time and in the post-match refresh, in this order,
all read before anything is written for that fixture (a match in play reads fewer,
see "Live polling every 60 seconds"): `matches/get-incidents`, `matches/get-lineups`,
`matches/get-statistics` (`?matchId=<event id>`). A quota refusal leaves that
fixture unwritten and ends the run (the remaining fixtures keep their quota); it
is not recorded as a rejection against the fixture.

The three sections are independent (since 2026-10-14, migration
`20261014120000` and this code; before it, one unreadable reply threw the whole
fixture away):

- **"No data" is not a failure.** For data SofaScore does not have (yet),
  RapidAPI answers HTTP 200 with a body `{"error": {"code": 404, ...}}` (the
  coverage audit of 2026-10-01 saw it; SofaScore itself answers 404). Both are
  "no data": lineups and statistics are sent empty (the RPC keeps what is
  stored), and incidents leave a match in play `unavailable` (counted, not a
  rejection). A finished match without incidents is still a rejection, so the
  backfill stops after two.
- **A failing optional reply does not sink the events.** A lineups or
  statistics request that fails (other than a quota refusal), or a reply that
  cannot be read, is sent empty and reported in `matchDetails.partial`
  (`leftOut`); the events are stored. Unreadable incidents are sent as
  `events: null` (the stored timeline is kept) while the lineups and statistics
  are stored. The Fantasy step is not handed a set with a failed reply (it reads
  the match again itself).
- **The database stores section by section.** `api.ingest_football_match_details`
  still refuses the whole delivery when it cannot be this fixture's (not an
  object, a section that is not a list, an unknown fixture, a club that is not one
  of the match's two, a statistic/lineup/pressure/absence with no club). Otherwise
  each section (events, statistics, each club's lineup, pressure, absences) is
  stored on its own: one that fails (two events with one key, a doubled pressure
  minute, an unknown absence category, an event Fantasy still references and the
  provider dropped) is rolled back alone and named in `rejectedSections`; a bad
  row (event type, period, minute, added time or order out of range, a negative or
  non-numeric statistic, a lineup player with an unknown slot or position) is left
  out and counted (`eventsRejected`, `statisticsRejected`,
  `lineupPlayersRejected`). An event left out is not deleted: its stored version
  stays.
- **Reported.** A fixture stored without a section counts as stored; the run is
  `partial` with `error_code = 'match_details_section_rejected'` and one
  `football_ingestion_rejections` row per fixture (`details_section_left_out` or
  `details_section_rejected`, the sections and the row count in
  `validation_issues`). `match_details_item_rejected` still means a fixture was
  not stored at all.

Root cause this fixed (FUS Rabat 1-1 Raja, 2026-10-13, event 17256975): while
the match was on, every details attempt read the incidents, the lineups and the
statistics; SofaScore had no team statistics for this limited-coverage match
until full time, the statistics reply was the `{"error": ...}` body, the
statistics parser refused it, and with it the goals, the card, the
substitutions and both lineups. The 9 `partial` runs of that evening match those
attempts (each one alongside the post-match refresh of RS Berkane - Renaissance
Zemamra, which stored); the 11 events appeared at 21:53:06, the full-time read,
when the cards-only statistics reply was readable. Replies:
`tests/fixtures/providers/sofascore/17256975.*`, test
`supabase/functions/_shared/sofascore-match-details-sections.test.ts`. The
fixture behind each of those 9 runs is inferred from the run counts, not read;
this read-only query confirms it (expected: `17256975`,
`invalid_provider_payload`, nine times, between kickoff and 21:52):

```sql
select rejection.external_id, rejection.error_code, rejection.created_at
  from app_private.football_ingestion_rejections rejection
  join app_private.football_ingestion_runs run on run.id = rejection.run_id
 where run.provider_name = 'sofascore' and run.job_type = 'match_events'
   and run.created_at between '2026-10-13 19:55Z' and '2026-10-13 22:30Z'
 order by rejection.created_at;
```

When:

- Live tick (`fixtures` job), after the scores are written: at most
  `SOFASCORE_DETAILS_PER_TICK` fixtures (default 4, max 8, `0` = off). Order: a
  mapped fixture written as finished this tick (3 requests), then mapped fixtures
  in play whose score or status was written (a write that only moves the minute
  does not count) or whose `changeTimestamp` is under
  90 s old, newest change first (1 request: incidents only; 2 on the tick that
  sees the match start). The season job
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
- Every statistic key above is seen in a real reply (RS Berkane - Renaissance
  Zemamra, 17256978, read from SofaScore on 2026-10-14: 18 rows, 9 per club). A
  key that does not match is simply not stored; `accuratePasses` is not mapped (a
  count, `pass_accuracy` is a percentage). A limited-coverage match has only the
  cards lines, none of which is shown, so it stores no team statistics at all.
- Team statistics can appear after the 2-hour post-match refresh has ended (that
  same Berkane match had none stored on the evening; its full statistics were at
  SofaScore the next morning). The staged statistics pulls of finished matches
  (`sofascore-staged-stats.ts`, docs/backend/SOFASCORE_STAGED_STATS.md) already
  read the three replies again days later for Fantasy; the same replies now also
  go through `api.ingest_football_match_details` (scope `staged`), so the late
  statistics are stored. **No extra request.**

Environment (all optional): `SOFASCORE_DETAILS_PER_TICK`,
`SOFASCORE_DETAILS_BACKFILL_LIMIT`.

What the match page says about it: a match in play is read for its incidents
only, so on this feed the Stats tab has nothing to wait for. The page cannot read
the switch above, and the switch defaults to `sportsmonks`, so the empty Stats
panel uses wording that is true on both feeds: no statistics yet, shown here as
soon as they exist, most often after the match (`matches.detail.no_stats_updating`).
It does not say the page updates itself for them.

Known limit: events are keyed `sofascore:event:<incident id>`, the SportsMonks
ones `sportsmonks:event:<id>`. A match whose details were stored by SportsMonks
and are then fetched from SofaScore shows both. The backfill skips marked
fixtures, so this can only happen to a match that was live across the switch.

## Live polling every 60 seconds

> Since migration `20261026143000` the in-play interval is the setting
> `live_interval_seconds` (60 to 300; it ships at 120 for the cycle ending on the
> 10 Nov reset), and is stretched to at least 180 s once the counted calls reach
> the soft limit. The 60 s figures below are the default of the original
> migration. Rating candidates no longer wake this tick (see below).

Migration `20261013110100_football_live_refresh_60s.sql` replaces
`app_private.football_live_refresh_tick()`; `20261013110200_football_live_refresh_post_final_30min.sql`
replaces it again (post-match refresh every 30 minutes instead of 15, below). pg_cron already wakes it every minute
(`* * * * *`, 20260924200500), so only the cadence changed, not the schedule.

| When (current season, kickoff confirmed)                                                         | Calls the function   |
| ------------------------------------------------------------------------------------------------ | -------------------- |
| a fixture is `live_first_half`, `half_time`, `live_second_half`, `extra_time` or `penalties`     | every 60 s           |
| `delayed` / `suspended`, or past kickoff while the feed still says scheduled / not started (3 h) | every 2 min          |
| kickoff within the next 10 minutes                                                               | every 5 min          |
| finalized within the last 2 hours (post-match refresh)                                           | every 30 min         |
| otherwise                                                                                        | idle: nothing called |

Start: the first minute tick after a fixture shows an in-play status (or, for a
match the feed has not announced, within 2 minutes of kickoff). Stop: when the
fixture turns `finished` it leaves the 60 s class; the 30-minute post-match
refresh (2 hours after the final whistle, as before but half as often) takes over. Outside windows the tick is `idle`
and forgets its last call, so the next match starts at once. The 20 s slack on
the heartbeat is kept: a tick pg_cron starts a few seconds late still calls.

The decision as a pure function, with tests that also read the migration and fail
if its status lists or windows drift:
`supabase/functions/_shared/football-live-cadence.ts` (`liveRefreshCadenceSeconds`,
`shouldInvokeLiveRefresh`). Not guarded against: an Edge call that outlives a
minute can overlap the next one of the same job (the `busy` answer only separates
the live and season jobs). Every write is idempotent and the stale guards hold,
so an overlap costs requests, not correctness; the call normally takes a few
seconds.

**Details while a match is in play (what the 60 s cadence costs).** Live scores
and the minute come from the one `tournaments/get-live-events` request per tick,
shared by every match in play. The old rule fetched all three detail replies
(incidents, lineups, statistics) for a changed match in play; at 60 s that would
triple the cost for data that does not move between goals. Now:

- a match in play whose score or status was written, or whose provider
  `changeTimestamp` moved in the last 90 s (one polling interval plus a late tick;
  it was 150 s), reads **`matches/get-incidents` only**: 1 request. A write that
  changes only the minute (kickoff, status, period, score and finalization as
  stored) is not a reason: the clock moves every tick, and counting it would cost
  one incidents request per match in play per minute (about 110 per match instead
  of the 29 below). The payload
  carries empty lineups and statistics, and the RPC keeps what is stored for those
  (an empty list is not a deletion; events are replaced by the incidents list, as
  before).
- the tick that sees the match start (stored status not yet in play) also reads
  `matches/get-lineups`: 2 requests, once, so unknown players still reach the
  staff matching list before full time (the live matching of 20261012120000 keeps
  working; it needs the lineups once, not every minute).
- lineups SofaScore had not published on that tick (no lineup stored: the snapshot's
  `hasLineups`, migration 20261014120000) are read again with the incidents, but
  only on a tick that wrote the score or the status (kickoff, a goal, half-time,
  the second half), never on a `changeTimestamp` move alone, and no more once a
  lineup is stored. Usually 0 extra requests (lineups are out before kickoff);
  at most about 6 per match (3 status writes + 2.7 goals) for a match whose
  lineups never come. Without the migration, `hasLineups` is absent and the old
  rule (the kickoff tick only) applies.
- statistics are read at full time only, with the lineups and incidents again
  (3 requests, written as finished this tick), then in the 2-hour post-match
  refresh, unchanged.

`changeTimestamp` is assumed to move when an incident is added; this is how the
150 s rule already worked, and a goal always moves the score. If a card or
substitution does not move it, it shows at the next score/status write or at full
time at the latest.

## Request cost model for live polling

Assumptions (estimates, not measurements): a Botola round is 8 matches over about
5 kickoff slots; a match is on for about 110 minutes (45 + 15 + 45 + stoppage);
about 15 incidents move per match (2.7 goals, 4 cards, 8 substitutions) and each
is fetched 1 to 2 times (the write tick, then the 90 s window), about 1.7 times; 4
rounds a month; the hourly season job (2 requests) runs all month.

Shared by all matches of one slot (live-events requests are per tick, not per match):

| Part                                        | Arithmetic       | Requests |
| ------------------------------------------- | ---------------- | -------- |
| before kickoff (5 min cadence, 10 min)      | 2 ticks x 1      | 2        |
| start not yet announced (2 min)             | about 1 tick x 1 | 1        |
| in play, 60 s                               | 110 ticks x 1    | 110      |
| final whistle fallback (`get-last-matches`) | 1                | 1        |
| post-match 2 h at 30 min                    | 4 ticks x 1      | 4        |
| **slot total**                              |                  | **118**  |

Per match:

| Part                                                                               | Arithmetic | Requests |
| ---------------------------------------------------------------------------------- | ---------- | -------- |
| incidents in play: 15 x 1.7 = 25.5, + 3 status writes, + 1 lineups at start, about | -          | 29       |
| full time: incidents + lineups + statistics                                        | 3          | 3        |
| post-match refresh, 4 ticks x 3 replies                                            | 4 x 3      | 12       |
| **match total**                                                                    |            | **44**   |

Round: 5 slots x 118 + 8 matches x 44 = 590 + 352 = **942 requests**.
Month: 4 rounds x 942 = 3,768, plus the season job 2 x 24 x 30 = 1,440, so about
**5,210 of 10,000**. That leaves about 4,800 for the other SofaScore lanes
(standings, clubs and players, images, ID mapping) and for backfills, before the
8,000 warning.

For comparison, the same model with the previous rules (2 min in play, all three
replies for a changed match, 150 s window, post-match every 15 min) is
5 x 67 + 8 x 102 = 335 + 816 = 1,151 per round, so the 60 s cadence with
incidents-only is cheaper than the 2 minute one while twice as fresh.

Post-match refresh every 30 minutes instead of 15 (this migration): per match
4 x 3 = 12 instead of 8 x 3 = 24, per slot 4 live-events requests instead of 8.
Saving per round: 8 x 12 + 5 x 4 = 96 + 20 = 116; per month 4 x 116 = **464
requests** (the earlier "about 380" left out the shared live-events ticks).
Round 1,058 -> 942, month 5,672 -> 5,208. Live-events cost scales with slots, not
matches: a round played in 3 slots instead of 5 saves about 2 x 118 = 236.

## RapidAPI call counter and budget

Migration `20261013110000_rapidapi_call_budget.sql`; code in
`supabase/functions/_shared/rapidapi-client.ts` (`onRequest` hook, one event per
HTTP attempt, retries included, status 0 when there was no answer) and
`rapidapi-call-counter.ts`.

- Table `app_private.rapidapi_call_counts`: one row per UTC day, job
  (`fixtures`, `season_fixtures`, `match_details_backfill`), endpoint and HTTP
  status, with a `calls` counter. The endpoint is the path without any query
  (`matches/get-incidents`), so no event id, key or payload is stored.
- Counting never breaks or delays a refresh: the client only calls a cheap hook
  (a throw is swallowed); the totals are written with **one** call to
  `api.service_record_rapidapi_calls` after the refresh's own work, waiting at most
  2 s; a failure or timeout is logged as `rapidapi_count_failed` (with the number
  of calls lost) and the refresh's answer is unchanged. Before the migration is
  applied the same log line appears and nothing else happens. A counted run in
  `shadow` mode counts too (it spends quota); a client injected by a test does not.
- Only the Edge Function path is counted. Scripts that build their own client
  (`scripts/backend/*`, `src/backend/football/provider/`) call SofaScore too and
  are not counted here; run them knowing that.
- Health: the `rapidapi_budget` check of `app_private.ops_health_checks()` (added
  through a wrapper, like `manager_card`) is `ok` below 8,000 calls in the current
  UTC calendar month, `warn` from 8,000, `fail` (which pages the owner through
  `ops-alert-tick`) from 9,500. The detail states the count only. The watchdog's
  `REQUIRED_DATABASE_CHECKS` does not list it until production has the migration.
- Staff read: `api.admin_rapidapi_calls_this_month()` (permission
  `football.read_operations`) returns `{month, monthlyLimit, warnAt, failAt, total,
items: [{job, endpoint, calls}]}` for the current month. Read only.

```sql
-- the same numbers from SQL, by job and endpoint
select job, endpoint, sum(calls) calls
  from app_private.rapidapi_call_counts
 where day >= app_private.rapidapi_window_start()   -- the quota window, not the calendar month
 group by 1, 2 order by calls desc;
```

The count is our own tally, not the provider's: RapidAPI's dashboard stays the
authority (the client also logs `quotaRemaining` and refuses below the floor).

## The provider's figure is the floor

Migration `20261027100000_rapidapi_provider_quota_floor.sql`. On 26 Oct our count
read 9,036 while RapidAPI answered `quotaRemaining: 0` of 10,000: about 964 calls
were never counted, so the soft and hard limits never fired. Every reply carries
`x-ratelimit-requests-remaining` and `-limit`. Each run keeps the smallest
`remaining` it saw and writes it once, after its work, with
`api.service_record_rapidapi_quota` into `app_private.rapidapi_provider_quota`
(one row per quota window). The database keeps an observation only if it is not
older than the stored one and not from before the window start.
`app_private.rapidapi_calls_this_month()` then returns
`greatest(counted + offset, limit - remaining)`, so the Edge budget read, the
health check and the staff read all see at least what the provider says. In a
run the client also takes `limit - remaining` of its last reply as a floor for the
soft and hard limits. A missing function (Edge deployed before the migration) is
logged as `rapidapi_quota_unavailable`; a failed write as `rapidapi_quota_failed`;
neither stops a run. After the plan resets the old row is ignored: it belongs to the
previous window.

## Budget guard and the per-round model

Migration `20261026143000_rapidapi_budget_guard_and_poll_schedule.sql`; code in
`rapidapi-client.ts` (guard), `rapidapi-budget.ts` (reads the budget),
`sofascore-live-refresh.ts` (details schedule, `rating_polls`).

**What went wrong on 25 Oct (4,000 calls for 2 matches).** Every Fantasy rating
candidate made the live tick fire every 60 s (candidates were polled every 5 minutes
for 6 hours, 30 minutes for 2 days, then every 2 hours, complete or not). Each
call then read the live feed, the three detail replies of every fixture finalized in
the last 2 hours (up to 4), and a catch-up fetch for native-rating fixtures,
which never get an observation and so stayed "never attempted" for ever (the
`season_fixtures` job paid that one too, about 24 times a day).

**Now:**

- Live play: one `get-live-events` per poll, shared by all matches. Incidents (1
  request) only on a tick that wrote a score change, or the arrival of half time,
  extra time or penalties; the provider's `changeTimestamp` moving is not a reason
  (it moves for every minor edit), and cards and substitutions between two goals wait
  for the whistle. Lineups (1 request) once, on the tick that sees the match start
  (again on a written tick only while none is stored). Statistics never in play.
- Full time: the trio once at the whistle. A finished match whose details were not
  stored since the whistle (that fetch failed or was refused) is retried when the
  database lists a mark (+30 / +90 min, `api.service_football_details_schedule()`)
  and nothing was stored since; a match that is stored is not read again (the staged
  statistics pulls refresh the late statistics). The season job's full pass is
  Mondays, not daily.
- Within one run the client never sends the same path twice (it returns the answer it
  already has), and a request that is not on the essential list (live feed, incidents)
  is never retried. A budget that cannot be read fails closed: only the essential
  endpoints (and the rating polls' lineups) are sent.
- Rating polls (`fantasy-rating-polls`, every 5 minutes, calls the Edge job
  `rating_polls` only when a poll is due): one lineups request per fixture at +15
  min, +1 h, +3 h, +12 h, +24 h, +48 h, +4 d, +7 d, +14 d after full time, none once
  the fixture's latest `app_private.fantasy_api_rating_sources` row is `ready`; a
  failed attempt is retried every 30 minutes for 6 hours after the mark.
- Season refresh: every `season_match_hours` (1) while a fixture is within a day
  either side of now; otherwise every `season_quiet_hours` (3; 0 = the 03:00 UTC
  daily pass only). Not 6 hours: the `provider_refresh` health check fails after 4
  without a season refresh.
- Catch-up never fetches a native-rating fixture; staged pulls stop at 8,500 calls on
  the Sofascore plan (12,000 on SportAPI's).

**Per-day model** (estimates, 2026-10-28). Per slot (matches kicking off together),
at a live poll interval T: 2 ticks before kickoff, 1 for the announcement, 110 x
60 / T in play, 1 fallback, 4 post-match ticks. T = 60: 118; T = 120: 63; T = 180:
45; T = 240: 36. Per match, now: incidents about 4 (about 3 goals and half time), 1
lineups at the start (about 1.2 with a retry), the trio once at the whistle (3),
rating polls about 3: about 11 (it was about 29: incidents about 16 from score or
status writes and "moved" reads, lineups, the trio, two follow-ups of 3, polls). A
day is the slots, the matches, the season job (hourly near a match: 2 requests an
hour, 48 a day; 16 with `season_match_hours` = 3) and standings (about 4).
At T = 180: a day of 4 matches in 2 slots is 90 + 4 x 11 + 48 + 4 = about 185 (it
was 90 + 4 x 29 + 48 + 4 = about 260). A full round of 8 matches in 3 slots on one
day is 135 + 8 x 11 + 48 + 4 = about 275 (it was about 425); with
`season_match_hours` = 3 about 245, and with T = 240 as well about 215. Quiet days are
the season job (16 to 24) plus the Monday full pass. Staged statistics pulls
(about 15 requests a match over three weeks) are spread over the following days. For a
window of 30 days with 4 rounds this is roughly 3,000 requests. The model is arithmetic on assumptions, not a measurement: read the counter after
the first match day.

**Reading and changing the guard.**

```sql
select api.admin_rapidapi_calls_this_month();            -- as staff: window, total, limits, by job
select * from app_private.rapidapi_budget_settings;      -- as the owner
select app_private.rapidapi_budget_configure(
  p_soft_limit => 8500, p_hard_limit => 9700, p_reset_day => 10, p_used_offset => 470,
  p_live_interval => 120, p_season_quiet_hours => 3, p_season_match_hours => 1);  -- null leaves a value
select app_private.rapidapi_budget_configure(p_live_interval => 60);              -- back to 60 s
```

The count is the table's sum since the most recent reset day (UTC) plus
`used_offset` (calls the provider counted that the table never saw: the counter has
rows from 14 Oct only). Above `soft_limit` the Edge client sends only
`tournaments/get-live-events` and `matches/get-incidents`, and the live poll is at
least 180 s; at `hard_limit` no call is sent and the run answers
`{"status":"skipped","reason":"monthly_budget_hard_limit"}`. Each run reads the
count once (`api.service_rapidapi_budget`) and adds its own requests. The
`rapidapi_budget` health check (warn at 80% of the plan, fail at 95%: 8,000 / 9,500
of 10,000) uses the same window and offset. Everything through
`football-live-refresh` (live, season, rating polls, details backfill, weekly
catalog) goes through the guard. Scripts under `scripts/backend/` and
`src/backend/football/provider/` build their own client; it cannot write to the
database, so it does not count into `app_private.rapidapi_call_counts`, but it never
retries, refuses to send once the provider reports fewer than 1,500 calls left on the
Sofascore host, and stops after 100 requests per run (`maxRequests`).

## Provider hosts: Sofascore and SportAPI

Migration `20261028100000_rapidapi_budget_per_host.sql`, applied with
`scripts/backend/apply-20261028100000-rapidapi-budget-per-host.sql`; code in
`rapidapi-client.ts`, `sportapi-translate.ts`, `rapidapi-budget.ts`,
`rapidapi-call-counter.ts`.

The Edge secret `RAPIDAPI_HOST` picks the host the football data is read from: the
Sofascore host `sofascore.p.rapidapi.com` (the default, also when it is empty or
absent) or SportAPI's `sportapi7.p.rapidapi.com`. Any other value is refused
(`provider_not_configured`, nothing sent). `RAPIDAPI_KEY` is the key of that host's
subscription. Callers do not change: they ask for the Sofascore-host paths, and on
SportAPI the client sends the native path and hands back the same shapes
(`sportapi-translate.ts`; the table of differences is in
`tests/fixtures/providers/sportapi/README.md`). Calls are counted, and the essential
list applies, under the Sofascore-host endpoint names on either host.

Each host has its own budget, count and provider-quota floor:

| Host                       | Quota  | Soft   | Hard   | Window starts | Settings                                                      |
| -------------------------- | ------ | ------ | ------ | ------------- | ------------------------------------------------------------- |
| `sofascore.p.rapidapi.com` | 10,000 | 8,500  | 9,700  | the 10th      | `app_private.rapidapi_budget_settings` (as before)            |
| `sportapi7.p.rapidapi.com` | 15,000 | 13,500 | 14,700 | the 27th      | `app_private.rapidapi_host_budgets`, `rapidapi_host_budget_configure` |

```sql
select * from app_private.rapidapi_host_budgets;                                        -- as the owner
select app_private.rapidapi_host_budget_configure('sportapi7.p.rapidapi.com', p_used_offset => 25);
select api.admin_rapidapi_calls_this_month();   -- the active host's window, total, limits, by job; "hosts" lists both
```

`app_private.rapidapi_active_host()` is the host of the most recent request recorded
today or yesterday; the readers with no host argument (the `rapidapi_budget` health
check, the staged-statistics stop, the live cadence in
`app_private.rapidapi_live_interval_seconds()`, the staff read) follow it, so they
switch with the secret. The Edge client reads its own host with
`api.service_rapidapi_host_budget(host)`; an unknown host reads as zero limits and
nothing is sent. Rolling back is setting `RAPIDAPI_HOST` empty (or to the Sofascore
host): the Sofascore count is untouched.

## The live minute

**Server.** `computeLiveMinute` (`sofascore-fixtures.ts`, pure, tested) writes
`fixtures.minute` from SofaScore's `time.currentPeriodStartTimestamp` (seconds, when
the current half started): minute = the period's base (0 first half, 45 second
half, 90 first extra half, 105 second extra half) + whole minutes since the half
started + 1, capped at the end of the period (45 / 90 / 105 / 120). Extra time is
told apart by the status code (41 first half, 42 second). **No half start time, no
minute is written** (and none at half-time, penalties or outside play); a start
more than 2 minutes in the future is treated as a bad clock. `addedTime` stays
null: added minutes are never computed. While a clock runs the fixture is written
every tick even if the score did not change (the minute moved), at no SofaScore
cost: a clock-only write never asks for match details. From migration
`20261013190000_football_sofascore_snapshot_minute` the live snapshot carries the
stored minute, and the computed one is compared with it, null included: a minute
equal to the stored one is not written, and when the half start disappears the
null is written (`api.ingest_football_fixture` sets `minute` from the payload, so
a JSON null clears it) and the app shows the match stage instead of a frozen
minute. On a database without that migration the snapshot has no `minute`; then a
computed minute is always written and a null one never is (the minute can stay
frozen until the next status change).

**App.** `src/lib/live-minute.ts`: `liveMinuteLabel` / `liveClock`. A capped
minute reads **45+ / 90+ / 105+ / 120+** (the clock stopped, time is being
added); "45+2" appears only if the provider gave `addedTime`. With no minute, the
match stage stands in so a live match never shows a blank clock: "1re mi-temps" /
"Mi-temps" / "2e mi-temps" / "Prolongations" / "T.a.b." (Arabic: الشوط الأول /
استراحة / الشوط الثاني / وقت إضافي / ركلات ترجيح; keys `matches.stage.*` and
`matches.status.*`). Used by the match card, header, top bar and live strip. The
ticking minute does not tick past a capped minute.

**Confirm that SofaScore sends the half start.** Each live tick's summary line
(`event: "football_live_refresh_sofascore"`, `job: "fixtures"`) carries
`periodStart`, one entry per fixture in a running period, once per tick, no
payload: `{eventId, period, present, minute}`. In the Supabase dashboard, Edge
Functions > `football-live-refresh` > Logs, search for `periodStart` during a live
match: `present: true` with a `minute` means SofaScore sends it; `present: false`
(and `minute: null`) means it does not, and the app shows the stage words. The
line is absent when nothing is in a running period. In shadow mode the same field
is in the shadow line.

## Fantasy observations (automatic)

Code: `supabase/functions/_shared/sofascore-fantasy-auto.ts`, called from
`sofascore-match-details.ts` and `sofascore-live-refresh.ts`. Full description,
switches and limits: docs/backend/SOFASCORE_FANTASY_SIMPLE.md, "Automatic path".

In short: for a finished and finalized fixture, the incidents and lineups that
were just fetched for the match details also build the Fantasy request, which is
recorded with `api.service_record_sofascore_fantasy_observation`. This runs on
the live tick (a fixture written as finished, and the 2-hour post-final
refresh) and on the details backfill; retries and catch-up also run on every
tick, the season job included. It runs after the scores and the details, never
throws and cannot fail them. Source `sofascore` records; `shadow` makes a dry run
and logs; `sportsmonks` does nothing.

- Extra requests: none for a fixture whose details were fetched. A held match is
  retried from replies stored in `app_private.sofascore_fantasy_attempts`
  (migration `20261011140000`), also with no request. At most
  `SOFASCORE_FANTASY_CATCHUP_PER_TICK` (default 1) never-attempted finished
  fixtures are fetched per tick, 3 requests each.
- One log line per fixture, `football_live_refresh_fantasy`: `recorded`,
  `held:<blocker>`, `skipped:<reason>` or `error:<code>`. The tick's answer has a
  `fantasy` summary.
- Off switch: Edge secret `SOFASCORE_FANTASY_ENABLED=false`. The other optional
  settings are `SOFASCORE_FANTASY_RETRIES_PER_TICK`,
  `SOFASCORE_FANTASY_CATCHUP_PER_TICK`, `SOFASCORE_FANTASY_CATCHUP_HOURS`,
  and `SOFASCORE_FANTASY_FETCH_ATTEMPTS`. (`SOFASCORE_FANTASY_MAX_ATTEMPTS` is gone: a held match is retried until 21 days after kickoff, decided by the database; `SOFASCORE_FANTASY_CATCHUP_HOURS` now defaults to 504.)
- Needs migrations `20261011120000` and `20261011140000`; without the second the
  step logs `skipped:state_function_missing` once and does nothing else, so no
  match is recorded. `20261011130000` (automatic player matching) is optional:
  the function is feature-detected (`PGRST202` / `42883`) and, when missing,
  unmapped players simply hold their match back. `20261011110000` is required by
  the deploy workflow's gate.
- Adaptive scoring must be active for the gameweek
  (`app_private.fantasy_adaptive_policy`), or the match is held as
  `held:adaptive_policy_not_enabled` and retried after the owner activates it.
- Before building, unmapped appearing players are offered to
  `api.service_sofascore_auto_map_players` when that function exists.
- Deploy order: migrations, then the Edge Function. Pause the football and
  Fantasy writers first if you write meanwhile (AGENTS.md).

## Pépites (player appearances)

Pépites reads each player's appearances from `app.player_fixture_performances`
(active rows with minutes). Only SportsMonks used to write it, so when SportsMonks
stopped, Pépites, its weekly editions and the player stats stopped moving. Migration
`20261011180000` and the Fantasy step now keep that table from SofaScore.

**How.** The step does not fetch or parse anything again. The database derives the
rows from the Fantasy observation that was already recorded for the match
(`api.service_sync_sofascore_player_performances`), so the numbers are the ones
Fantasy scores, built from the same replies, the same reviewed player mappings and
the same checks. The Edge Function asks for it in two places, both in `sofascore`
mode only and both without a SofaScore request:

- right after a match is recorded, or found already recorded, for that one match.
  The ratings SofaScore gave in the replies in hand are passed along (Pépites uses
  them; Fantasy does not);
- at the end of every sweep, for up to `SOFASCORE_PEPITES_SYNC_PER_TICK` finished
  matches (default 20, 0 switches it off) whose observation has no rows yet. This
  is also the backfill: the matches finished since SportsMonks stopped are filled
  by it on the first runs after the migration. Those rows have no rating, because
  the replies were not kept (Pépites then ranks without a rating component for
  them and says so with its `low_rating_sample` flag).

**What a row holds.** Minutes, starts, goals, own goals, cards, goals conceded and
the clean sheet always (SofaScore establishes them for every match). Assists,
penalties missed, saves and penalties saved only where SofaScore gives them (a
full-coverage match, or an assist an incident names). Anything else is **empty
(NULL), never zero**: that is why `assists` and `penalties_missed` may now be NULL
(`saves` and `penalties_saved` already could). Pépites already reads these columns
that way (assists summed ignoring empty ones, penalties shown as unknown, a
goalkeeper's missing saves as "saves unknown"). An outfield player has no saves
collected (NULL).

**Who wins.** A match another provider already has active rows for keeps them
(`refused:sofascore_performances_other_provider_rows`). A newer observation of the
same match replaces the SofaScore rows (the old ones are set inactive, not
deleted). The same observation again writes nothing. Only a finished, finalized
match whose newest observation is SofaScore's, whose fixture mapping and every
player mapping are still reviewed, is written; a reviewed correction as the newest
observation is not turned into rows.

**Fantasy is not touched.** The Fantasy scoring input embeds a digest of every
active row of each match and is recomputed against the stored snapshot digest
(`fantasy_scoring_input_changed`). So the migration also patches the two functions
that read these rows for that document to ignore `source_provider = 'sofascore'`;
the document is byte for byte what it was. The legacy coverage table is not
written.

**Not covered.** Only matches that have a SofaScore observation get rows, so a
match Fantasy never records (a gameweek already finalizing or finalized, adaptive
scoring not on for it, held for review, or recorded earlier from SportsMonks) has
none. A read-only list of finished matches without any active row:

```sql
select f.id, f.kickoff_at, f.status
  from app.fixtures f
 where f.status = 'finished' and f.finalized_at is not null
   and not exists (select 1 from app.player_fixture_performances p
                    where p.fixture_id = f.id and p.active)
 order by f.kickoff_at desc;
```

If the migration is not applied, the function is missing and the step logs
`skipped:performances_function_missing` once per run and carries on. Logs:
`football_live_refresh_performances`, one line per match (`written`, `unchanged`,
`rated`, `refused:<reason>`).

## Open points

- `time.currentPeriodStartTimestamp` is not in the committed samples: until the
  `periodStart` log shows `present: true` on a live match, the minute may stay null
  and the app shows the stage words.
- Finished status codes 100/110/120 are an assumption (see `sofascore-fixtures.ts`).
- After the switch, a fixture last written by SportsMonks keeps its
  `provider_updated_at`; SofaScore updates older than that are skipped as stale
  until its `changeTimestamp` passes it.
- `venue_id` is sent as null, as on the SportsMonks path.
