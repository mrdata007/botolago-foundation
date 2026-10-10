# Full move from SportsMonks to SofaScore — master plan

Status: **in progress, nothing switched yet.** SportsMonks keeps running in
production until the cut-over phase below. This plan authorises no database
write; `AGENTS.md` and `CLAUDE.md` apply in full (one writer per database,
forward-only migrations, unique migration timestamps, staging first, dry-run,
owner-run production path, screen-work rules).

It extends [`FANTASY_SOFASCORE_FLASHSCORE_PLAN.md`](FANTASY_SOFASCORE_FLASHSCORE_PLAN.md),
which covered Fantasy player performances only.

## 1. Owner decisions (2026-10-10)

| # | Decision |
|---|---|
| M1 | SofaScore (RapidAPI, Api Dojo, `sofascore.p.rapidapi.com`) replaces SportsMonks for **all** football data: fixtures and schedule, live scores, match pages, teams, squads, player performances. This supersedes default D1 of the Fantasy plan ("keep SportsMonks for catalog/fixtures"). |
| M2 | Upgrade to a **paid SofaScore plan** so live scores keep working. The tier is chosen from the request budget in §4. |
| M3 | Flashscore (FlashLive, same RapidAPI key) stays as the cross-check source for Fantasy assists and penalties, as in the Fantasy plan. |
| M4 | The SportsMonks-only **pressure chart** on the match page is removed. |
| M5 | The SportsMonks **preseason player ratings** job is retired. Ratings already stored stay untouched, so this season's Fantasy prices do not change. |

### Open decision carried forward

- **Next season's Fantasy starting prices.** `app_private.fantasy_initial_price_v1`
  is seeded from `app.player_season_ratings`
  (`20260803210943_fantasy_catalog_activation.sql`). With the SportsMonks
  ratings job retired, the 2027/28 catalogue needs a new rating source (for
  example the SofaScore average match rating, or BotolaGO's own 2026/27 points)
  before it is built, otherwise every unrated player falls back to 6.0 and the
  same price. Decide before the 2027/28 catalogue build.

## 2. What SportsMonks does today

Provider IDs are not baked into app tables: every fixture, team, season and
player is an internal UUID, linked to providers through
`app_private.football_provider_mappings`. The switch is therefore ingestion
code plus SQL guards, not a data model rebuild.

| Feature | SportsMonks path today | Cadence |
|---|---|---|
| Live scores, match pages (events, lineups, team stats) | pg_cron `football-live-refresh` → Edge `football-live-refresh` (`_shared/football-live-refresh.ts`, `sportsmonks-fixtures.ts`, `sportsmonks-match-details.ts`) | every 2 min in play, 5 min pre-kickoff |
| Fixture list, kickoff moves, postponements | pg_cron `football-season-refresh` (`20260926113100`) | hourly |
| Competitions, seasons, rounds, teams, squads | GitHub `football-current-season-recovery.yml` → Edge `football-ingest` | daily |
| Fantasy calendar, gameweeks, performances | GitHub `fantasy-season-orchestrator.yml`, `current-season-performances.ts` | hourly / manual |
| Team crests | `sportsmonks-catalog.ts`, `attach_football_team_crest` | with catalog |
| Preseason ratings (retired, M5) | Edge job `preseason_ratings` | manual |
| Pressure chart (removed, M4) | match details add-on | with live refresh |
| Readiness probe | `gate2e-sportsmonks-current-season-readiness.yml` | daily, read-only |

SQL functions that reject any provider other than `'sportsmonks'` need a
forward-only migration before SofaScore data can flow through them
(historical/current performance, squad recovery, player list, crest and rating
RPCs; see the inventory in §6 work item 2).

## 3. Already built for SofaScore

- Adapters: `src/backend/football/provider/sofascore-adapter.ts`
  (lineups, incidents, statistics, detail), `flashscore-adapter.ts`,
  `rapidapi-client.ts` with a quota guard that reads RapidAPI's rate-limit
  headers.
- Reconciler and identity tooling: `src/backend/fantasy/provider-*.ts`,
  `reconciled-ingestion.ts`, migration `20261003180000` (applied status
  unconfirmed).
- Player mapping: 191 reviewed SofaScore player mappings in production
  (2026-10-03); 0 Flashscore mappings; Flashscore batch prepared, not run.
- Not built: SofaScore fixture list, live scores, teams/squads/crests
  ingestion, any scheduled SofaScore job.

## 4. Request budget (to pick the paid tier)

One Botola month is about 4 rounds × 8 matches = 32 matches on about 16 match
days. SofaScore only (Flashscore has its own quota on its own host). Endpoint
names marked "to probe" are not yet confirmed.

| Item | Assumption | Requests / month |
|---|---|---|
| Live scores | one call returns every live match, filtered to Botola (937); a poll every 2 min over a ~2 h window, ~16 match days (to probe) | ≈ 960 (≈ 400 at 5 min) |
| Fixture list refresh (kickoff moves, postponements) | `tournaments/get-next-matches` pages 0–2 every 3 h (to probe) | ≈ 240 |
| After-match details | detail, lineups, incidents, statistics × 32, plus one re-pull | ≈ 260 |
| Standings, squads, ID bridge | daily standings, squads on demand | ≈ 60 |
| **Total** | | **≈ 1,500–1,600** |

**Size the paid tier at about 2,500–3,000 requests a month** (20 % margin plus
re-runs; failed calls also count). If the live endpoint turns out to be paged
per tournament, live polling can reach ≈ 1,900 and the total ≈ 2,500, which
still fits. The client's quota guard (`minRemaining`, default 100, in
`rapidapi-client.ts`) is raised with the new tier and fails closed.

### Probe results, 2026-10-10 (provider-probe run 38067728045, 5 requests)

- Confirmed: `tournaments/get-last-matches` (24 events per page, paged with
  `hasNextPage`), `tournaments/get-next-matches` (12 per page),
  `tournaments/get-standings?type=total` (all 16 clubs with SofaScore team IDs),
  `tournaments/get-seasons`. Status types seen: `finished`, `postponed`,
  `notstarted`.
- **A postponed match gets a new SofaScore event ID when it is replayed**; the
  old event stays listed as `postponed` in the same round. The ID bridge maps
  the replacement and re-points a mapping when a replacement appears.
- Live list: **`tournaments/get-live-events?sport=football`** (confirmed by run
  38069075854). One request returns every in-play football match worldwide
  (438 at the time, ≈ 1.8 MB) with status code, `statusTime`, scores and
  half-time scores; filter on `tournament.uniqueTournament.id == 937`. Live
  polling therefore costs one request per poll, as budgeted (≈ 960 a month at
  2 min). `matches/get-live` and `matches/list-live` do not exist (404).
- Paid tier active from 2026-10-10 17:05 UTC (provider-probe run 38070242572):
  **10,000 requests a month** on the GitHub `staging-load-test` key, about four
  times the ≈ 2,500 needed. The same key still has to be set as the Supabase
  Edge secret `RAPIDAPI_KEY` on staging (and later production) before any
  SofaScore Edge job runs.

## 5. Phases

Each phase is its own pull request, reviewed before the next starts.
SportsMonks keeps running until P6, and every staging write respects the
one-writer rule.

| # | Phase | Kind | Owns |
|---|---|---|---|
| P0 | This plan; pressure chart removed from the match page (M4) | docs, frontend | `docs/backend`, `src/components/matches` |
| P1 | Probe (≈ 18 requests, list in §8) and trimmed fixtures | read-only, quota | `tests/fixtures/providers/sofascore` |
| P2 | Fixture-list, live-list, standings and squad parsers; status mapping; quota guard raised | code only | `src/backend/football/provider/` |
| P3 | ID bridge: attach SofaScore IDs to the existing competition, season, round, team and fixture rows through `api.resolve_football_mapping` (dry-run default, never creates a fixture, reports 0 or 2+ matches). Teams via a reviewed 16-row name table. Players stay on the reviewed mapping process | staging DB write | `scripts/backend/sofascore-id-bridge.ts` |
| P4 | Forward-only migration lifting the `'sportsmonks'`-only checks on the RPCs the new path calls, with a `pg_get_functiondef` preflight. The fixture, match-details and catalog RPCs already accept any registered provider | migration | `supabase/migrations` |
| P5 | SofaScore fixtures and match-details Edge code (Deno port of the RapidAPI client), shadow mode first; a source switch (`football_live_source`, default `sportsmonks`) read by the live and season refresh ticks and by the orchestrator scripts | code + staging write | `supabase/functions/_shared/sofascore-*.ts`, tick migrations |
| P6 | Fantasy performances from SofaScore + Flashscore (Fantasy plan phases 4–5) and staging comparison against SportsMonks; flip the switch on staging for 1–2 match days, then production through the release runbook (owner-run) | staging, then production | settings |
| P7 | Retire SportsMonks: jobs, secrets, workflows, `sportsmonks-*` code, dead RPC guards, pressure plumbing | production, owner-run | many |

Kept as is: club crests are already curated in storage
(`20261001170000`) and are not re-fetched. Pressure and preseason-rating tables
stay in place and simply stop being fed until P7.

## 6. Work in review (draft pull requests)

| PR | Phase | What |
|---|---|---|
| #408 | P0 | This plan |
| #407 | P0 | Pressure chart removed from the match page |
| #410 | P2 | Fixture-list and league-table parsers (unknown statuses left out, never guessed) |
| #411 | P3 | ID bridge: dry-run tool linking SofaScore IDs to existing rows |
| #409 | P5 | RapidAPI client for Edge Functions (not wired) |

Open from review:
- The 16 club → `app.teams.id` pairings for the ID bridge need owner review
  (staging and production UUIDs may differ, so read each from its own database).
- Moving a fixture mapping to a replayed match's new SofaScore ID needs a new,
  reviewed RPC (P4): `api.resolve_football_mapping` cannot re-point a mapping.
- The in-play status codes are unconfirmed until a probe during a live match.

### Live status codes, confirmed 2026-10-10 (lane 3, ≈ 28 probe requests)

Watched 17256979 (Kawkab Marrakech 2–1 Ittihad Tanger) from kickoff to full
time and the first half of 17256971 (US Amal Tiznit v Difaâ El Jadida):

| SofaScore `status` | code | App status |
|---|---|---|
| `notstarted` "Not started" | 0 | `not_started` |
| `inprogress` "1st half" | 6 | `live_first_half` |
| `inprogress` "Halftime" | 31 | `half_time` |
| `inprogress` "2nd half" | 7 | `live_second_half` |
| `finished` "Ended" | 100 | `finished` |

- `changes.changeTimestamp` moved on every status change and every goal seen
  and stayed fixed when nothing changed, so the freshness guard holds. A
  not-started match can already carry a timestamp and a 0–0 score a few
  minutes before kickoff.
- The live list carried the Botola match (`uniqueTournament.id` 937) with the
  same fields as `matches/detail`.
- Not yet observed: 110/120 (extra time, penalties; Botola league matches do
  not use them).
- **Gap:** 149 of 447 live matches worldwide used code **20 "Started"**, an
  in-play code with no half. The app has no "live, half unknown" status, so the
  parsers leave such a match out and list it for review rather than guess a
  half. Both Botola matches used the detailed codes; if a Botola match ever
  reports 20, it is caught by the unknown-status report.

### Staging write, 2026-10-10 (owner-approved)

Database: Staging V2 (`srdrflfrfpwixsllveid`). Writer: the orchestrator session,
through **Staging database update** on branch `claude/sofascore-repoint-mapping`.
Before writing: no other staging writer was running (in-progress and queued
runs listed; the workflow's writer guard also passed); `plan` (run 38073132035)
listed 29 pending migrations, the owner chose to bring staging fully level;
`rehearse` (38073866860) passed for the first 8 and stopped as designed at the
enum migration `20261005120000`; `apply` (38073992875) applied all 29 one at a
time, `pending: []`; `check` (38074209633) passed, load-test seed intact.
Applied: the 28 migrations already on `main` up to `20261010120300` plus
`20261010140000_sofascore_repoint_fixture_mapping`. The pg_cron jobs they add
arrive with their switches off.

## 7. Owner prerequisites

- ~~Subscribe to a paid SofaScore tier~~ — done 2026-10-10 (10,000 a month).
- `RAPIDAPI_KEY` in staging Supabase secrets (never in the repo or chat).
- Approve the P1 probe run (≈ 18 requests of quota).

## 8. P1 probe list

Re-capture: `tournaments/get-last-matches?tournamentId=937&seasonId=102220&pageIndex=0` and `pageIndex=1`.
To confirm: `tournaments/get-next-matches` (pages 0, 1), `tournaments/get-standings?tournamentId=937&seasonId=102220&type=total`,
`tournaments/get-seasons?tournamentId=937`, the live list (`matches/get-live?sport=football` or the name the
listing shows), `matches/detail` for a finished and an upcoming match, `matches/get-lineups` for a full
(17132481) and a limited (16958239) match, `matches/get-incidents` and `matches/get-statistics` (17132481),
`teams/get-squad`, `teams/get-next-matches` (fallback), and one `matches/detail` during a live match if one is on.
Trimmed files only; raw payloads never enter the repository.
