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

| M6 | 2026-10-11: Fantasy player points come from **SofaScore alone, in simple mode** (minutes, goals, own goals, cards, clean sheet, goals conceded); assists, saves and penalty saves/misses score no points until a second source cross-checks them. Supersedes M3 (Flashscore as required cross-check) for scoring. |

| M7 | 2026-10-11: **Flashscore is no longer used.** SofaScore is the only provider for all football data, including Fantasy. Supersedes M3. |

| M8 | 2026-10-11: assists, saves and penalty saves/misses **score from SofaScore when available**: on full-coverage matches they count (fixture can reach full mode); on limited-coverage matches they are unknown, never 0, and the fixture scores in simple mode. Refines M6. |

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

### ID bridge on production data, read only, 2026-10-10

Staging holds no real Botola season (only the load-test and scoring-proof
seasons), so the owner allowed the bridge's two read-only modes to read
Production V2 (`sofascore-id-bridge-production-read.yml`, pinned to main
`a0b89e6`). Nothing was written.

- `propose-teams` (run 38080540391): 15 of 16 clubs paired from 3–4 agreeing
  fixtures each, no conflicts; AS FAR Rabat had 1 (its round-1 match is still
  postponed) and pointed at the only unpaired internal team. The owner
  approved all 16 pairings.
- `dry-run` with the approved pairing (run 38080678843) would create:
  competition 1, season 1, teams 16, rounds 4, fixtures 31 of 32 (1 matched by
  round, 1 postponed-only); 0 conflicts, 0 ambiguous, 0 re-points. One
  fixture (`1296b2e5-bb59-4f18-8ef7-dc0b2990bc3a`) has no SofaScore event and
  stays unmapped until reviewed.
- Writing these rows on production is owner-run through the release runbook.
- The production environment's `RAPIDAPI_KEY` (`production-admin-activation`)
  still reports the free 500-request limit; it needs the paid key.
- Known workflow bug: a run whose report lists review items shows as failed
  (the step shell's `-e` stops on the pipeline before the exit-2 handling).

### Production write, 2026-10-10 (owner-run)

Owner-run through the reviewed package (PRs #415, #416; main
`632ab97cebefb369f6add662b86180bcc62b3457`), following
`docs/production/SOFASCORE_ID_BRIDGE_PRODUCTION_RUNBOOK.md`: rehearsal rolled
back, then apply. **Exactly 53 SofaScore links applied and verified** on
Production V2 (competition 1, season 1, teams 16, rounds 4, fixtures 31).
Existing player mappings were preserved; the paused pg_cron jobs were restored
to their original settings. Owner report, 2026-10-10. Fixture
`1296b2e5-bb59-4f18-8ef7-dc0b2990bc3a` stays unlinked pending review.

### SportsMonks unpaid; staging write for the live switch, 2026-10-11

The owner confirmed SportsMonks is not paid: production results stopped after
10 Oct (Kawkab Marrakech v Ittihad Tanger, Amal Tiznit v Difaâ El Jadida show no
score). Permanent fix: PR #422 (live refresh reads SofaScore behind the
data-source switch) with its owner-run release package
(`scripts/backend/apply-sofascore-live-switch.sql`,
`.github/workflows/football-live-refresh-deploy.yml`,
`docs/production/SOFASCORE_LIVE_RELEASE_RUNBOOK.md`). Stopgap: PR #423.

Staging write (orchestrator, owner-approved staging workflows): Staging V2,
branch `claude/sofascore-live-edge`; no other staging writer running; `plan`
(run 38110767594) listed only `20261011090000` and `20261011100000`;
`rehearse` (38110831694) passed and rolled back; `apply` (38110898595) applied
both.

### Production release of the live switch, 2026-10-11 (owner-run)

PR #422 merged (main `01910e1bd58e13c82e78c5657da3e19fd2a6e247`), including the
owner's fix that never sends a null round (skips `unresolved_round`) and reports
ingestion-run completion failures. Owner-run, following
`docs/production/SOFASCORE_LIVE_RELEASE_RUNBOOK.md`:
`scripts/backend/apply-sofascore-live-switch.sql` rehearsal passed, committed
run "Applied" (migrations `20261011090000`, `20261011100000`; four function
md5s pinned from CI run 38110909523); `football-live-refresh` deployed;
`football_data_source_configure('shadow')` returned
`{"source":"shadow","updatedAt":"2026-10-11T04:56:33Z"}`; live refresh stayed
on. Pending: read the first `football_live_refresh_sofascore` shadow log (next
season tick ≈ 05:30 UTC), then switch to `'sofascore'`.

Owner then switched the source to `'sofascore'` without waiting for a match.
The 06:30 and 07:30 UTC season ticks returned HTTP 503
`scheduler_token_not_configured`: the Edge secret `BOTOLAGO_SCHEDULER_TOKEN`
was missing in Production V2 (SportsMonks being unpaid hid this until then).
Owner saved the secret from the Vault value and reset the season heartbeat; no
redeploy. At 08:00 UTC SofaScore marked the three missing round matches
finished — Moghreb Tétouan 0–0 FUS Rabat, Kawkab Marrakech 2–1 Ittihad Tanger,
Amal Tiznit 2–5 Difaâ El Jadida — and the live run returned HTTP 200. Source
stays `'sofascore'`, live refresh on. Still to confirm: the other scheduled
functions that send the same token (notification email/push dispatch, ops
alert email, AI content, account deletion) stopped returning 503.

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

### Production release of the automatic path, 2026-10-11 (owner-run)

PRs #426 (automatic Fantasy, player matching, match details, orchestrator
without SportsMonks, Pépites from SofaScore, single install), #427 (match
write-ups, Arabic article link), #428 (hide test accounts), #429 (page speed)
merged; main `638a97863c0e88d1957be7238f6f851734a95cb0`. Before the install the
owner ran read-only checks: 27 repo versions were missing from
`schema_migrations`; 22 matched the repo exactly (history only), two had
nothing to compare, `fantasy_player_season_stats` matched with comments
stripped, `fantasy_gameweek_summary` differed (replaced by the reviewed
version), and 20260925090500, 20261001170000 and 20261010140000 were not
applied. The single script (`scripts/backend/apply-sofascore-automatic.sql`)
applied or verified all of it. Owner steps: Fantasy tick paused; rehearsal
passed; commit run "Installed and verified"; `football-live-refresh` deployed
(run 38152607562, version 20); Manager Card compute paused; adaptive policy
activated from gameweek 3 (season 5ada3e98…, `{"enabled":true,"fromGameweek":3}`);
backfill request 1696 HTTP 200, `due` 0; Edge secrets
`SOFASCORE_FANTASY_CATCHUP_HOURS=168`, `SOFASCORE_FANTASY_CATCHUP_PER_TICK=4`;
Fantasy tick and Manager Card compute back on; GitHub variable
`FANTASY_AUTOMATION_ENABLED=true`.

Open: UTS Rabat 0-0 RSB Berkane (event 17256977) held — two appearing SofaScore
players (Saad Kouk #40, Souleymane Sy #37) have no app player at all
(`no_candidate`). Fix in progress on `claude/sofascore-unknown-players`. The
other seven round-3 matches are caught up by the ticks.
