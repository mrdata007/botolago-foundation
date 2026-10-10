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

Filled in from the ingestion design (work item 1). Rough order of magnitude
before the design: live polling for ~32 matches a month plus an hourly
fixture refresh and post-match detail pulls lands in the low thousands of
requests a month; the free tier (500) cannot carry it.

## 5. Phases

Each phase is its own pull request, reviewed before the next starts.
SportsMonks stays live until phase 6.

| # | Phase | Kind |
|---|---|---|
| 0 | This plan; pressure chart removed from the match page (M4) | docs, frontend |
| 1 | Probe: capture trimmed SofaScore fixtures for the season list, live list, detail, teams, squads, standings (≈20 requests) | read-only, quota |
| 2 | Parsers and adapters for those endpoints, unit-tested on the fixtures | code only |
| 3 | Forward-only migration letting the ingest RPCs accept provider `sofascore`; ID bridge that attaches SofaScore IDs to the existing fixture, team and season rows (no duplicates) | staging DB write |
| 4 | SofaScore live refresh and season refresh Edge Function, dry-run then staging, SportsMonks paused on staging while it runs | staging DB write |
| 5 | Fantasy performances from SofaScore + Flashscore (Fantasy plan phases 4–5), staging comparison against SportsMonks results | staging DB write |
| 6 | Production cut-over through the release runbook (owner-run), then retire SportsMonks jobs, secrets, workflows and code | production, owner-run |

## 6. Work items in flight

1. Ingestion design (endpoint map, RPC mapping, ID bridge, budget, probe list).
2. Pressure chart removal — branch `claude/drop-pressure-chart`.

## 7. Owner prerequisites

- Subscribe the RapidAPI app to the chosen paid SofaScore tier (§4).
- `RAPIDAPI_KEY` in staging Supabase secrets (never in the repo or chat).
- Approve the phase 1 probe run (it spends ≈20 requests of quota).
