# Builder report: RapidAPI call reduction and the SportAPI switch

Branch `claude/rapidapi-call-reduction` (from `origin/claude/rapidapi-call-reduction`,
then `origin/main` merged in at `9d2f38e9`; no rebase, no force-push). 2026-10-28.
No database access to any real database, no provider call, no deploy, no secret, no PR.

## 1. What the previous WIP (71f819cc) did, and what I kept or changed

| WIP change                                                                                                                               | Verdict                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scripts' client (`src/backend/football/provider/rapidapi-client.ts`): no retries, a 100-request cap and a 1,500-call reserve on the Sofascore host; explicit caps in `sofascore-catalog-id-mapping.ts` and `sofascore-ratings-audit.ts` | Kept. Checked every script that builds the client: the largest legitimate run is 60 requests (id bridge, 30 pages x 2) or 36 (Fantasy ingest, 12 fixtures x 3), so the 100 cap truncates none. The client cannot write to the database, so these calls are capped, not counted into `app_private.rapidapi_call_counts` (said in the docs). |
| Edge client: retry only essential endpoints, 1 retry instead of 2; `essentialEndpoints` override                                          | Kept.                                                                                                                                                                                                                                    |
| `football-live-refresh.ts`: an unreadable budget fails closed (`UNREADABLE_BUDGET`, soft limit 0); the rating polls add `matches/get-lineups` to the essential set | Kept and verified (`rapidapi-unreadable-budget.test.ts`, the catalog handler test). With the new per-host read it also fails closed on a database that lacks the migration.                                                                |
| Season job: full-season pass Mondays instead of daily                                                                                    | Kept.                                                                                                                                                                                                                                    |
| `selectLiveDetailTargets`: dropped the `changeTimestamp` trigger and `detailsChangeWindowMs`                                             | Kept (the provider's change timestamp moves for every minor edit).                                                                                                                                                                       |
| `selectLiveDetailTargets`: **never** read lineups for a match in play                                                                    | Changed. The brief wants line-ups once when published. Restored: lineups once on the tick that sees the match start, and again on a written tick only while none is stored (`hasLineups === false`). Unknown players reach the staff's matching list again (`fantasy.fromLiveReplies`). |
| `selectLiveDetailTargets`: incidents on every written tick (score, status or period)                                                     | Tightened. Incidents only when the score moved, or the match reached half time, extra time or penalties.                                                                                                                                 |
| One post-match follow-up always at +90 min (3 requests per match, even when the details were stored)                                    | Changed. A stored match is never read again. A finished match is retried (within 3 h) only when nothing was stored since the whistle (the whistle fetch failed or was refused).                                                           |
| Tests rewritten to the above                                                                                                             | Kept and extended (`sofascore-live-details.test.ts`: kickoff lineups-only, lineups unavailable is not a rejection, retry only when never stored, half time reads incidents, second-half start reads nothing).                            |

The WIP tests passed on arrival; the merge of `main` was clean.

## 2. Part A: call waste

| What                                                                                                                                            | Where                                                                                           | Calls saved (per match unless said)                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| In play: incidents only on a score change or the arrival of half time, extra time, penalties (not on `changeTimestamp`, not on every written status) | `sofascore-live-refresh.ts:317-376` (`selectLiveDetailTargets`, `INCIDENT_STATUSES` :128)          | about 12 (incidents 16 -> 4)                                                                               |
| Lineups once when the match starts; again only while none is stored; never statistics in play                                                  | same, `lineupsOnly` target; `sofascore-match-details.ts:589` (type), `:716-750` (fetch)          | in play 1 instead of repeated reads                                                                        |
| Whistle fetch (trio) once; no routine follow-ups. Retry only a finished match never stored after the whistle                                    | `sofascore-live-refresh.ts:395-402`                                                              | 6 (two follow-ups of 3)                                                                                    |
| The same path is never sent twice in one run (answered from memory, not counted)                                                               | `rapidapi-client.ts:171` (`answered`), `:268`                                                    | removes duplicates between the whistle fetch, the Fantasy catch-up and the staged pulls of the same match |
| A request off the essential list (live feed, incidents) is never retried; 1 retry for the essential ones                                        | `rapidapi-client.ts:41`, `sendWithRetries`                                                       | a timeout or 5xx no longer bills 3 calls                                                                   |
| Budget unreadable: fail closed (essential endpoints only)                                                                                       | `football-live-refresh.ts:94`, `:262`                                                            | a database blip cannot lift the guard                                                                      |
| Scripts: no retries, 100 requests per run, 1,500-call reserve on the Sofascore host                                                             | `src/backend/football/provider/rapidapi-client.ts:50-51,113`                                     | a rate-limited script call billed 3, now 1                                                                 |
| Season job full pass weekly (Monday), not daily                                                                                                 | `sofascore-live-refresh.ts:104,592,648`                                                          | 10 to 24 a day on 6 of 7 days                                                                              |
| Staged-statistics stop follows the host's plan (12,000 on SportAPI)                                                                             | `sofascore-staged-stats.ts:57,80`                                                                | keeps the Fantasy re-pulls running on the SportAPI plan                                                     |

### Calls per match day, before and after

Measured on production (10-27 Oct): live job `matches/get-lineups` 2,204, `get-incidents` 1,876,
`get-statistics` 1,719, `get-live-events` 1,419; season job `get-next-matches` 301, `get-last-matches` 271,
`get-lineups` 161, `get-statistics` 149, `get-incidents` 149; catalog 48; standings about 19. Days: quiet about 50;
24 Oct 1,755; 25 Oct 4,000; 26 Oct 1,040.

Model (arithmetic on assumptions, not a measurement; per slot of simultaneous kickoffs at a live poll of T = 180 s:
2 ticks before kickoff + 1 announcement + 37 in play + 1 fallback + 4 after = 45; season job hourly near a match = 48 a day;
standings about 4):

| Day                                          | Before (main as deployed 27 Oct)         | After (this branch)                          |
| -------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| per match                                    | about 29 (incidents 16, lineups, trio 3, follow-ups 6, rating polls 3) | about 11 (incidents 4, lineups 1.2, trio 3, rating polls 3) |
| 4 matches in 2 slots                         | 90 + 4 x 29 + 48 + 4 = about 260         | 90 + 4 x 11 + 48 + 4 = **about 185 (target <= 200 met)** |
| full round, 8 matches in 3 slots             | 135 + 8 x 29 + 48 + 4 = about 425        | 135 + 8 x 11 + 48 + 4 = about 275            |
| same, `season_match_hours` = 3               | about 395                                | about 245                                    |
| same, and live poll T = 240 s                | about 365                                | about 215                                    |
| quiet day                                    | 16 to 24 + daily full pass (10 to 24)    | 16 to 24 (full pass Mondays only)            |

The target of 200 holds for a day of up to about 5 matches in 2 slots at the current settings. A full 8-match, 3-slot day is
about 275; the two owner knobs above (an optional `rapidapi_budget_configure`, section 6) bring it to about 215 to 245. For a
30-day SportAPI window with 4 rounds the model gives roughly 3,000 requests against 15,000. The pre-fix days (1,755 / 4,000)
came from the rating-candidate loop that `20261026143000` already removed; the live-job endpoint counts above are mostly that loop.

## 3. Part A2: the SportAPI switch

- `RAPIDAPI_HOST` is read by `rapidApiHostOf` (`rapidapi-client.ts:427`): empty or absent = Sofascore host; `sportapi7.p.rapidapi.com` =
  SportAPI; **anything else is refused** (`provider_not_configured`, nothing sent). There was no `RAPIDAPI_HOST` in the code before.
- `supabase/functions/_shared/sportapi-translate.ts` (new): path translation, one case per endpoint (all ids validated as plain numbers):

  | Sofascore-host path                                                  | SportAPI path                                                         |
  | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
  | `matches/get-lineups\|get-incidents\|get-statistics?matchId=X`      | `api/v1/event/X/lineups\|incidents\|statistics`                       |
  | `tournaments/get-live-events?sport=football`                         | `api/v1/sport/football/events/live`, filtered to unique tournament 937 |
  | `tournaments/get-next-matches\|get-last-matches?tournamentId&seasonId&pageIndex=N` | `api/v1/unique-tournament/{t}/season/{s}/events/next\|last/N`          |
  | `tournaments/get-standings?...&type=total`                           | `api/v1/unique-tournament/{t}/season/{s}/standings/total`             |
  | `teams/get-squad?teamId=X`                                           | `api/v1/team/X/players`                                               |
  | `teams/get-logo?teamId=X`, `players/get-image?playerId=X`            | `api/v1/team/X/image`, `api/v1/player/X/image` (binary PNG expected, **not captured**) |

  An endpoint with no equivalent, or a bad id, sends nothing.
- The client counts, applies the essential list and the budget under the **Sofascore-host endpoint name** on either host, so callers,
  counters and the guard are unchanged. `allowedHosts` accepts the new host. Quota headers keep their names.
- The catalog's image capture now also matches SportAPI's `/api/v1/(team|player)/{id}/image` URLs (`sofascore-catalog.ts`).
- Fixtures: `tests/fixtures/providers/sportapi/` (9 files + README). **Trimmed copies, not the raw captures**: the repo is public and
  `tests/fixtures/providers/README.md` forbids committing third-party payloads; the same keep-lists are used for lineups, incidents,
  statistics, and the event lists keep 3 events, the squad 6 players, with no birth dates or market values (a test enforces it).
- Tests: `sportapi-translate.test.ts` (35 tests): one path test per endpoint; the real answers through the real parsers
  (`parseSofascoreLineups/Incidents/Statistics`, `normalizeSofascoreMatchDetails`, `parseSofascoreEvents`, `parseStandingsRows`,
  `parseSquad`); the live filter; 404 -> `data_unavailable`; unsupported endpoint sends nothing; 429 not retried; no duplicate
  request in a run; images; host choice; per-host budget read and counting; handler tests in `football-live-refresh.test.ts`.

### Shape differences (SportAPI answers of 27 Oct against the Sofascore host)

The repository only holds **trimmed** Sofascore-host fixtures (lineups, incidents, statistics), so those were compared by key path
and type; every endpoint was also run through the real parsers on the untrimmed SportAPI answer. Result: no type differs; SportAPI is a
superset (raw Sofascore objects).

| Endpoint     | Difference                                                                                                                                                                                              | Handling                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| all          | path parameters, not a query string                                                                                                                                                                     | `translateToSportApi`                                                 |
| all          | missing data is HTTP 404 `{"error":{"code":404,...}}`; the Sofascore host answered 200 with an `error` body                                                                                             | client maps 404 to `data_unavailable`; callers already handle both    |
| all          | quota headers `x-ratelimit-requests-limit/-remaining` same names; extra `x-ratelimit-rapid-free-plans-*` ignored (the capture key was a 50-call free plan)                                              | `readQuota` unchanged                                                 |
| live events  | world feed (103 foreign events in the capture), unfiltered by the request; **no Botola match was in play in the capture** (the test builds one from a captured event)                                  | `onlyBotolaLiveEvents` keeps unique tournament 937 (and unreadable ones, counted as malformed). `foreignTournamentCount` no longer counts the world's events |
| next / last  | same events and `hasNextPage`; more fields                                                                                                                                                              | `withHasNextPage` forces a boolean                                    |
| lineups      | superset: `confirmed`, `statisticalVersion`, `supportStaff`, colours, string `jerseyNumber`, `ratingVersions`, about 60 statistics; the one path only the Sofascore-host fixtures have, `statistics.penaltyMiss`, is absent from the capture (the match had none) | passed through                                                        |
| incidents    | superset: `isLive`, `timeSeconds`, `reversedPeriodTime*`, richer player objects; `assist1` absent in the capture (no assist)                                                                             | passed through                                                        |
| statistics   | each item also has `homeTotal`, `awayTotal`, `compareCode`, `renderType`, `statisticsType`, `valueType`; period `ALL` only                                                                              | passed through                                                        |
| standings    | one `total` table of 16 rows with `updatedAtTimestamp`; extra row fields                                                                                                                                | passed through                                                        |
| squad        | `players[].player`: `id`, `name`, `position` G/D/M/F, numeric `shirtNumber`, string `jerseyNumber`; 5 of 35 have neither; extra `foreignPlayers` (also listed in `players`), `nationalPlayers`, `supportStaff` | passed through (`parseSquad` reads `shirtNumber`)                     |
| images       | native `/team/{id}/image`; binary, not captured                                                                                                                                                         | catalog client keeps the bytes for either URL form                    |

## 4. Migration `20261028100000_rapidapi_budget_per_host.sql`

Later than every migration on main (`20261027150000` is the last; `main` had no new commits when I finished). Forward-only; nothing dropped;
every old function keeps its signature and, for the Sofascore host, its answer.

- `host` column (default Sofascore host) on `app_private.rapidapi_call_counts` and `app_private.rapidapi_provider_quota`; the host joins both primary keys.
- `app_private.rapidapi_host_budgets` (RLS forced, no grants): SportAPI seeded **15,000 / soft 13,500 / hard 14,700 / reset day 27 / offset 0**;
  `app_private.rapidapi_host_budget_configure` changes it. The Sofascore row stays `app_private.rapidapi_budget_settings`, untouched.
- `rapidapi_host_settings`, `rapidapi_window_start_for`, `rapidapi_calls_for_host` (count + offset, never below the provider's own `limit - remaining` **for that host**), `rapidapi_active_host`
  (host of the most recent call recorded today or yesterday; Sofascore when none).
- Host-less readers follow the active host: `rapidapi_calls_this_month()` (health check, staged stop), `rapidapi_live_interval_seconds()` (cron cadence),
  `rapidapi_budget_health()` (80% / 95% of the host's quota: 8,000 / 9,500 for Sofascore, same text), `api.admin_rapidapi_calls_this_month()` (adds `host`, `hosts`).
- New service-role functions: `api.service_rapidapi_host_budget(host)` (unknown host = zero limits, nothing sent), `api.service_record_rapidapi_host_calls`,
  `api.service_record_rapidapi_host_quota`. The old three (`service_rapidapi_budget`, `service_record_rapidapi_calls`, `_quota`) now answer for the Sofascore host.
- pgTAP: `supabase/tests/database/rapidapi_budget_per_host.test.sql` (60 assertions: windows, separate counts, active host, unknown host, per-host floor, health per host, configure).
  **I could not run pgTAP (no Docker).** CI `database-quality` is the authority. As a substitute I started a throwaway local PostgreSQL 16 (no Supabase, no real data), loaded the real
  function and table definitions of `20261013110000`, `20261026143000`, `20261027100000` (extracted from the files), a 40-line pgTAP shim, then: the old `rapidapi_call_budget` and
  `rapidapi_provider_quota_floor` tests gave the same results before and after the migration (the one failing assertion, 5.1 of `rapidapi_call_budget`, is the stub's no-op permission check);
  the new test file gave 60 of 60; the guarded script ran as a rehearsal, as a commit, and refused a second run. The `rapidapi_budget_guard` test needs tables I did not stub, so it was not run.
- `src/backend/generated/database.types.ts`: the three new RPCs added **by hand** in the generator's format (CI `backend:types:check` will confirm).
- Guarded apply script `scripts/backend/apply-20261028100000-rapidapi-budget-per-host.sql` (+ `...-script.test.ts`, 5 tests): rehearsal by default; md5 pins of the 7 replaced functions
  (method reproduces two pins production gave `20261026143000`); records the migration whole in `supabase_migrations.schema_migrations` after a sha256 check; postflight proves the Sofascore
  count, budget answer and live interval are unchanged. Documented in `docs/production/SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md` (a test requires every migration to be listed there) and
  `docs/backend/SOFASCORE_LIVE_EDGE.md` ("Provider hosts").

## 5. Tests run (this branch, final commit)

```
bun run lint            -> 0 errors, 40 warnings (the same warnings as before)
bun run typecheck       -> tsc --noEmit, no output
bun test                -> 11035 pass, 1 fail, Ran 11059 tests across 821 files
                           the one failure: "the scheduled time as the editor reads it > Morocco's Ramadan clock change is followed (UTC+0 in Ramadan 2027)" (known; fails on main with this Bun)
bun run backend:migrations:check -> Validated 267 migration(s).
bun run backend:secrets:check    -> No high-confidence secrets found in tracked files.
bun run build           -> vite build, "built in 2.49s", nitro output generated
```

Before my changes, `bun test supabase/functions src/backend` on the merged WIP: 2399 pass, 1 fail (the same Ramadan test).

## 6. OWNER STEPS (nothing here is done; each is a production action for the owner)

Order matters: **migration, then secrets, then deploy.** The deploy workflow runs only from `main`, so this branch has to be merged first (the lead's decision).

1. **(Recommended, AGENTS.md "one writer")** Pause the live refresh for the minute the migration takes. In Supabase dashboard > project
   "BotolaGO Production V2" > SQL Editor > New query run `select mode, football_live_refresh_enabled from app_private.notification_email_settings;`
   and write the answer down. Then run `select app_private.notification_email_configure('off', null, null, false);`.
   (If you skip this and a live refresh holds the table, the script stops cleanly after 5 s: run it again.)
2. **Apply the migration.** SQL Editor > New query > paste the whole of `scripts/backend/apply-20261028100000-rapidapi-budget-per-host.sql` > Run.
   It is a rehearsal: the result row must say **"Rehearsal passed"** and the messages tab shows `rapidapi: Sofascore count N unchanged; SportAPI 15000 / 13500 / 14700, window from the 27th, count 0`.
   Then change the single line `rollback;` near the bottom to `commit;` and Run again: the result row says **"Applied."**
   If any check says `stop:`, do not edit it: send the message to the lead.
3. **Restore the refresh** (if you paused it): `select app_private.notification_email_configure('<mode you wrote down>', null, null, <true if football_live_refresh_enabled was true>);`.
4. **Edge Function secrets.** Dashboard > Edge Functions > Secrets (Manage secrets) > add `RAPIDAPI_HOST` = `sportapi7.p.rapidapi.com` (exactly that, no `https://`).
   `RAPIDAPI_KEY`: on RapidAPI one application key works for every API that application is subscribed to; if SportAPI was subscribed under the **same** RapidAPI application, leave the key.
   If you made a **new** application/key for SportAPI, replace `RAPIDAPI_KEY` with it. (The GitHub workflows' `RAPIDAPI_KEY` secrets are separate and stay on the Sofascore host.)
5. **Deploy `football-live-refresh`** (merged `main` commit): GitHub > Actions > "Football live refresh deploy" > Run workflow from `main`, `expected_commit` = the merged SHA,
   `confirmation` = `DEPLOY_FOOTBALL_LIVE_REFRESH`; approve the `production-admin-activation` environment. Or from a terminal at that commit:
   `supabase functions deploy football-live-refresh --project-ref tkewgajrljbwgwedqsxn`.
6. **(Optional, brings a full 8-match day under about 245)** `select app_private.rapidapi_budget_configure(p_season_match_hours => 3);`.
7. **Check it worked** (within two or three minutes, the live tick is every 3 minutes):
   - SQL Editor, read only: `select app_private.rapidapi_active_host(), app_private.rapidapi_calls_for_host('sportapi7.p.rapidapi.com');` -> host `sportapi7.p.rapidapi.com`, count growing from 0.
   - `select endpoint, status_code, sum(calls) from app_private.rapidapi_call_counts where host = 'sportapi7.p.rapidapi.com' group by 1, 2;` -> `tournaments/get-live-events` with status **200** (not 429).
   - Dashboard > Edge Functions > football-live-refresh > Logs: lines `football_live_refresh_sofascore` with `"result":"ok"`; **no** `rapidapi_budget_unavailable`, no `provider_not_configured`.
   - `select status, count(*) from app.fixtures where kickoff_at < now() group by 1;` -> Journée 5 matches leave the `live_*` statuses and become `finished`.
   - The live Fantasy page leaves "Journée 5 EN DIRECT" after the fixtures are final and the worker runs (not instant).
8. **Roll back** (no migration rollback needed; it is additive and the Sofascore answers are unchanged): Edge Function secrets > delete `RAPIDAPI_HOST` (or set it to `sofascore.p.rapidapi.com`), restore the previous `RAPIDAPI_KEY`.
   If the code itself is at fault, rerun the deploy workflow with the previous `main` commit. The new migration can stay.

## 7. What I could not check

- pgTAP in CI (Docker unavailable): see section 4 for the substitute; CI `database-quality` decides.
- Any real SportAPI or Sofascore call (not allowed): the live feed with a **Botola match in play**, the image endpoints (binary, not captured), the paid plan's quota headers (the capture key reported a limit of 50).
- That production's seven replaced function bodies match the repository: the md5 method reproduces two production pins from `20261026143000` exactly, but the script's own pins are checked only when the owner runs it.
- `bun run backend:types:check` (needs a local database): the types file was edited by hand.
- The Edge runtime itself (Deno): tests run under Bun; imports follow the existing `.ts` style.
- A before/after measurement: the day totals are a model.

## 8. Questions for the Lead

1. `RAPIDAPI_HOST`: the brief says the value exists already; the code had none. If production's secret holds anything but the two reviewed hosts (a URL, a different spelling) the function answers 503. Is it set today, and to what?
2. Is the SportAPI subscription on the same RapidAPI application as Sofascore (key unchanged) or a new key?
3. Fixtures are committed **trimmed** (repo policy, public repo), not as the raw captures. Acceptable?
4. "Incidents on a card change": the live feed carries no card data, so cards between goals appear at half time and full time only. Reading incidents per card would add about 4 calls a match. Wanted?
5. Active-host inference (host of the latest recorded call) drives the host-less DB readers and the cron cadence; the alternative is an explicit setting the owner flips with the secret. I chose inference to avoid a second thing to forget. Agree?
6. I used a throwaway local PostgreSQL 16 (no Supabase, no real data) to run the new SQL, which is a loose reading of "no psql". If that is not allowed, say so and I will not do it again.
7. The 15 manual workflows' scripts still talk to the Sofascore host (their paths are not translated): they need the translator copied into `src/` to use SportAPI. Out of scope here; say if wanted.
8. The staged-statistics stop on SportAPI is the constant 12,000 (soft limit 13,500): fine?
