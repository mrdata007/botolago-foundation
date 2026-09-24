# BotolaGO audit — Backend / database stream

Date: 2026-09-24 (evidence gathered 16:28–16:45 UTC). Project: `tkewgajrljbwgwedqsxn` (BotolaGO Production V2, eu-west-3, Postgres 17.6). All database access was read-only (SELECT / EXPLAIN / catalog / `pg_get_functiondef`); no writes, no deploys, no workflow dispatches. Docker is not available in this container, so pgTAP was **not** executed here; CI's `database-quality` job is the authority for those (see §7).

Scratch artefacts: `scratchpad/backend-work/security_advisors.txt` (all 307 advisor findings verbatim), `scratchpad/backend-work/api_functions.txt` (all 220 `api` functions with roles and config).

**Measurement caveat (important):** between roughly 16:20 and 16:45 UTC the production database was CPU-starved by the audit itself (several review streams crawling the live site concurrently, plus this stream's three `EXPLAIN ANALYZE` runs). Real visitors received statement timeouts and PostgREST 500s in that window. Every absolute timing quoted below from that window (9.2 s, 9.6 s, 23 s) therefore measures *audit contention on a Micro-class instance*, not steady state; the steady-state figures are the `pg_stat_statements` means (accumulated since the last stats reset, before the audit) and the 13:00–15:00 UTC hourly error counts. The conclusion that the instance cannot absorb ~1.5 anonymous RPC/s stands, because that is the load the audit applied. Confirmed instance settings (single catalog query, 16:47 UTC): `shared_buffers = 28672 × 8 kB = 224 MB`, `max_connections = 60`, `work_mem = 2184 kB`, role `anon` → `statement_timeout=3s`, role `authenticated` → `statement_timeout=8s` (Micro-class; exact tier not exposed by the API). No further heavy queries were run after the coordinator's notice.

---

## 0. Executive summary

| # | Finding | Severity | Confidence |
|---|---------|----------|------------|
| 1 | Production Postgres saturates under ~1.5 req/s of RPC traffic: trivial queries took 9–23 s, 389 statement-timeouts and 371 HTTP 500s in the 16:00 UTC hour on `news_feed`, `news_related_articles`, `news_article_detail`, `fantasy_player_pool`, `football_matches_by_date`, `football_season_catalog`, `fantasy_gameweek_summary`. Anon role has `statement_timeout=3s`. Cannot support today's audience, let alone 10x. | **P0** | VERIFIED |
| 2 | `api.football_matches_by_date` (the /matches page RPC, 1,259 calls, 760 s total, the most expensive statement in the database) validates `p_timezone` with a full scan of `pg_timezone_names` on every call — 22.9 s measured under load, 505–826 ms mean historically, 5.5 s max. Same pattern in two other migrations. | **P1** | VERIFIED |
| 3 | Fantasy Gameweek 1 is stuck `open` 3 h after its deadline: a postponed fixture (FAR Rabat v Raja, 15:00 UTC) still counts, so `service_advance_fantasy_lifecycle` raises `fantasy_fixture_resolution_required`; the last two scheduled orchestrator runs are red; 0 of 6 lineups are locked while GW1's real matches kick off at 20:00 UTC tonight. The only "alert" is a red GitHub run. A remediation script exists but has not been applied. | **P1** | VERIFIED |
| 4 | Live match refresh is switched off in production (`football_live_refresh_enabled=false`, `functions_base_url=null`): the 15-min pg_cron job returns `disabled`, `api.live_fixture_updates` is empty, and the only other results path (GitHub-scheduled orchestrator, cron `12 * * * *`) actually fires every ~5 h (04:44, 09:57, 15:02 UTC today). Scores tonight will lag by hours. | **P1** | VERIFIED |
| 5 | Migration history drift: 23 of the 90 repo migrations are recorded in production under **different version timestamps**, and for 12 of them the SQL production recorded is **not byte-identical** to the repo file. `supabase db push` / `migration list` would disagree with production; the repository's forward-only guarantee is not verifiable. | **P1** | VERIFIED |
| 6 | Edge function deploy drift: `news-ingest-elbotola` exists in the repo but is not deployed; `news-ingest` was last deployed 2026-08-01 while its source changed 2026-09-19; `football-ingest` deployed 09-19, source changed 09-22. There is no deploy pipeline for functions (only one-off "gate" workflows), so what runs in production is unknown. | **P2** | VERIFIED |
| 7 | No observability or alerting at all: no error tracker, no uptime/health monitor, no alert on pg_cron / edge-function / orchestrator failure; DB heartbeats exist but nothing reads them; 102 expected `STALE_UPDATE` rejections/day are logged as `ERROR`, burying real errors. | **P2** | VERIFIED |
| 8 | Security posture is sound in structure (RLS + `force` on all 128 tables, only `api` exposed, all 220 `api` functions `SECURITY DEFINER` with `search_path=''`, service RPCs gated by `is_service_request()`, scheduler token in Vault, MFA on staff), but 44 expensive RPCs are anonymous and unthrottled (amplifies #1), `pg_net` sits in `public`, and the written convention in `docs/backend/MIGRATIONS.md` ("security definer must live in app_private") is contradicted by every API function. Auth rate limits, captcha, leaked-password protection and backups/PITR are UNVERIFIED from here. | **P2** | VERIFIED / UNVERIFIED |
| 9 | Performance hygiene: 3,706 temp files / 18 GB spilled (work_mem 2 MB), `app.players` never analysed (planner sees 42 rows, table has 929), 133 unused indexes, 5 unindexed FKs (two on the 9,258-row `player_fixture_performances`), `article_search_documents` = 100 MB (largest object) with an unused 1.2 MB index. | **P2** | VERIFIED |
| 10 | Database tests: 65 pgTAP files / ~1,688 assertions run in CI on a local Supabase (latest `Backend quality` run #630 green at 16:11 UTC). Gaps: no test for `football_live_refresh_tick`, `invoke_scheduled_function`, `service_verify_scheduler_token`; no test pins the anon 3 s timeout against RPC cost; no load/performance regression test. | **P3** | VERIFIED (CI) / not run locally |

Scorecard suggestions (0–100): **Backend engineering 62 · Reliability 35 · Security (backend) 70 · Automated testing (database) 72.**

---

## 1. Findings in detail

### F1 — Production database saturates under light load; core read RPCs return HTTP 500

- **Severity:** P0 · **Confidence:** VERIFIED
- **Affected:** every anonymous read RPC in `api` (news feed, article detail, related articles, fantasy player pool, fantasy gameweek summary, matches by date, season catalog); PostgREST role `anon`.
- **Evidence:**
  - `select rolname, rolconfig from pg_roles` → `anon: statement_timeout=3s`, `authenticated: 8s`, `authenticator: 8s`. (3 s is stricter than Supabase's 8 s default; nothing in `supabase/migrations` sets it, so it was set out-of-band — UNVERIFIED who/when.)
  - Log query, postgres_logs, `error_severity='ERROR'`: `canceling statement due to statement timeout` × 145 in the sample and, bucketed by hour: 13:00 → 1, 14:00 → 10, 15:00 → 2, **16:00 → 389**.
  - Log query, edge_logs `/rest/v1/rpc/%` per hour: 13:00 → 414 req / 1×500, 14:00 → 397 / 7, 15:00 → 1,016 / 2, **16:00 → 5,363 req / 371×500** (≈1.5 req/s).
  - postgrest_logs: `Warp server error: Thread killed by timeout manager` at 16:34:54; 500s on `POST /rpc/news_feed`, `news_related_articles`, `news_article_detail`, `fantasy_player_pool`, `fantasy_gameweek_summary`, `football_matches_by_date`, `football_season_catalog`, `news_team_filters`, `news_sitemap_entries`, `news_home_modules` (user agents: HeadlessChrome/141 = the concurrent audit crawlers, plus Android Chrome, curl, quic-go).
  - My own measurements at 16:40 UTC as `postgres` (no timeout; **taken during the audit-contention window, see caveat in §0 — they show what the instance does under ~1.5 req/s, not idle performance**): `explain analyze select count(*) from app.article_editions e join app.stories s …` (15,798 rows, all index-only) → **Execution 9,645 ms, Planning 2,375 ms**; `explain analyze select api.football_matches_by_date(current_date,'fr','Africa/Casablanca', p_limit:=20)` → **9,187 ms** with only 2,482 shared-buffer hits; `explain analyze select exists(select 1 from pg_timezone_names where name='Africa/Casablanca')` → **22,986 ms**.
  - Instance shape: `max_connections=60`, `shared_buffers=28672` (224 MB), `work_mem=2184 kB`, `pg_stat_database`: `temp_files=3706`, `temp_bytes=18 GB`, cache hit 100 %. This is the Nano/Micro compute class (exact tier UNVERIFIED — `get_project` does not expose it; the dashboard's CPU / burst-credit graph is needed).
  - `pg_stat_activity` at the same moment: 6 active PostgREST backends, none waiting on locks or IO (`wait_event` null) → pure CPU starvation, not lock contention.
  - Steady-state cost from `pg_stat_statements` (since last reset): `football_matches_by_date` 871 calls @ 505 ms mean + 388 calls @ 826 ms mean (max 5,553 ms); `news_related_articles` 327 @ 368 ms; team news feed 421 @ 247 ms; `football_competition_fixtures` 396 @ 142 ms; `fantasy_hub` 10,797 @ 18 ms. Several of these already exceed the 3 s anon timeout at p99 even before tonight's load.
- **Current behaviour:** at ~1.5 RPC/s the database's CPU is exhausted, every RPC slows 10–100×, hits the 3 s anon timeout and the site renders errors/empties (the frontend stream will see this as "Aucun contenu" boxes and empty match lists).
- **Expected:** a 30-team league site with 14k articles should serve these reads in tens of milliseconds and survive 50 req/s.
- **Root cause (compound):** (a) smallest compute tier, likely with burst credits exhausted; (b) every read is a `plpgsql`/`sql` `SECURITY DEFINER` function that builds nested JSON per row (`app_private.football_match_json` → `football_competition_json`, `football_team_json`×2, `football_venue_json` — 5 sub-selects per fixture), so a page of 20 fixtures is ~100 sub-queries; (c) F2's `pg_timezone_names` scan; (d) a 3 s anon timeout turns slow into broken; (e) no HTTP caching layer in front of PostgREST (`cache-control: no-cache` per brief).
- **Impact:** user-facing outages under normal match-day traffic; SEO crawlers get 500s on /news and /matches; every other stream's measurements taken this evening are affected.
- **Recommended fix:** (1) upgrade compute at least one tier and check burst credits; (2) fix F2; (3) cache anonymous RPC responses (edge/CDN cache on the Lovable/Cloudflare front with `s-maxage` 30–60 s, or `pg` materialised JSON for feed/home modules); (4) rewrite the hottest JSON builders as set-based joins (one query per page, not per row); (5) raise anon `statement_timeout` to 8 s only after (1)–(4) so that a slow query degrades instead of cascading; (6) add a load test to CI against staging (`scripts/backend/fantasy-load-test.py` exists but is not wired in).
- **Files:** `supabase/migrations/20260720095354_football_api_security.sql` (`football_matches_by_date`, `football_match_json`), `20260924180100_news_feed_filters_first.sql` (`news_feed`), `20260924173000_news_search_set_based.sql`, `src/backend/football/supabase-repository.ts`, `src/backend/news/supabase-repository.ts`.
- **Complexity:** L

### F2 — `football_matches_by_date` validates the timezone by scanning `pg_timezone_names` on every call

- **Severity:** P1 · **Confidence:** VERIFIED
- **Affected:** `api.football_matches_by_date` (`supabase/migrations/20260720095354_football_api_security.sql`, also referenced in `20260802090000_football_season_browser.sql`); the same `pg_timezone_names` check is in `20260720121727_notification_delivery_runtime.sql`.
- **Evidence:** `pg_get_functiondef` shows
  ```sql
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
  ```
  `pg_timezone_names` is a set-returning function that walks the whole tz database (Filter removed 102 rows before the match; ~1,200 rows total) with no index; measured 22,986 ms under load, and it is the dominant component of the 505–826 ms mean for this RPC in `pg_stat_statements` (the fixture query itself touches 2,482 buffers).
- **Fix:** replace with a cheap validation: `perform (now() at time zone p_timezone)` inside `begin … exception when invalid_parameter_value then raise …` (Postgres validates the zone name in O(1) against the tz cache), or an allow-list (`Africa/Casablanca`, `Europe/Paris`, `UTC`). Apply the same to the two other migrations. **Complexity:** S

### F3 — Fantasy GW1 lifecycle is stuck; deadline passed, lineups unlocked, orchestrator red

- **Severity:** P1 · **Confidence:** VERIFIED
- **Affected:** `app.fantasy_gameweeks` (GW1 `7fcb28c5-9b69-4591-bcda-437c6c961c5c`), `api.service_advance_fantasy_lifecycle`, `.github/workflows/fantasy-season-orchestrator.yml`, `scripts/backend/fantasy-gw1-defer-postponed-and-realign.sql`.
- **Evidence:**
  - GW1: `status=open`, `points_state=provisional`, `deadline_at=2026-09-24 13:30Z`, `starts_at=15:00Z`, 8 counting assignments; season `2026/2027` `registration_open`.
  - Assignment list: FAR Rabat v Raja Casablanca `kickoff 15:00Z`, fixture `status=postponed` (provider update 15:03:02Z), assignment still `assigned / counts_points=true`. The other 7 fixtures: 24 Sep 20:00, 26 Sep 16/18/20, 27 Sep 16/18/18 UTC, `not_started`.
  - `app.fantasy_lineups`: 6 lineups for GW1, `locked_at` set on **0**.
  - `service_advance_fantasy_lifecycle` (definition read): in status `open` after the deadline it raises `PT409 fantasy_fixture_resolution_required` when any counting assignment's fixture is `postponed/cancelled/suspended/abandoned`. postgres_logs at 15:03:25Z: `fantasy_fixture_resolution_required`; edge_logs: `POST /rest/v1/rpc/service_advance_fantasy_lifecycle → 409`.
  - GitHub Actions `fantasy-season-orchestrator.yml`: run #36 (09:57Z) **failure**, run #37 (15:02Z) **failure**, both at step 7 "Orchestrate the Fantasy season"; earlier runs green.
  - `app_private.fantasy_job_runs` and `fantasy_lifecycle_transitions` are empty (0 live rows) — no lifecycle transition has ever happened in production.
  - The deadline 13:30Z was derived from the now-postponed 15:00Z fixture (deadline = earliest counting kickoff − 90 min), so managers were cut off 6.5 h before the first real kickoff (20:00Z).
  - `scripts/backend/fantasy-gw1-defer-postponed-and-realign.sql` documents exactly this state and the repair (defer the assignment with `resolution='operator_deferred'`, recompute the deadline); the assignment is unchanged, so it has not been run.
- **Impact:** GW1 cannot lock → cannot go `live` → no scoring/finalisation; users see a "deadline passed" state with editable-or-not ambiguity (deadline is enforced per mutation, so edits are refused but nothing is frozen); prize evaluation blocked; the only signal is a red workflow nobody is paged for.
- **Fix:** run the reviewed remediation script (owner authorisation), then have the orchestrator's `escalate`/`failed` verdict notify a human (GitHub → email/Slack), and make postponement handling automatic: when the provider marks a counting fixture `postponed` before the deadline, auto-defer it and recompute the deadline (the `fantasy_calendar_sync` migration already knows unconfirmed kickoffs; extend it to postponements). **Complexity:** M

### F4 — Live refresh disabled; results depend on a GitHub cron that fires every ~5 h

- **Severity:** P1 · **Confidence:** VERIFIED
- **Evidence:** `app_private.notification_email_settings`: `football_live_refresh_enabled=false`, `functions_base_url=null`, `mode=off`. `app_private.football_live_refresh_tick()` returns `'disabled'` when either is unset (definition read); `cron.job_run_details` shows the job "succeeding" every 15 min (`1 row`) — a no-op. `api.live_fixture_updates` count = 0. `football-live-refresh` and `notification-email-dispatch` were deployed today 13:17–13:22Z (v2) but never wired up. The fallback, `fantasy-season-orchestrator.yml` (`cron: "12 * * * *"`), actually ran at 09-23 00:28, 05:56, 11:29, 16:53, 20:18, 23:39 and 09-24 04:44, 09:57, 15:02 UTC — GitHub's scheduler is delaying it 4–5 h. `football-current-season-recovery.yml` (07:43 daily) was **skipped** on every scheduled run this week (its `if:` gate requires a variable that is not set on the schedule path).
- **Impact:** during tonight's 20:00Z GW1 matches the site shows no live minute/score and results may arrive hours late; email notifications (`mode=off`) are inert by design but the live-refresh flag is the one that matters for the product.
- **Fix:** set `functions_base_url` + `football_live_refresh_enabled=true` via `app_private.notification_email_configure(...)` (owner), verify the Vault secret `botolago_scheduler_token` matches the deployed function; move the orchestrator's time-critical steps (lock at deadline, lock→live) to pg_cron as well, keeping GitHub for the heavy provider sync. **Complexity:** S (enable) / M (re-home lifecycle to pg_cron)

### F5 — Migration history in production does not match the repository

- **Severity:** P1 · **Confidence:** VERIFIED
- **Evidence:** `supabase_migrations.schema_migrations` (90 rows) vs `supabase/migrations` (90 files): 67 versions match; **23 names are recorded under different versions** (e.g. repo `20260919130000_news_editorial_admin_bridge` ↔ prod `20260919212409`; repo `20260924173000_news_search_set_based` ↔ prod `20260924142407`; full list in the appendix). Comparing `md5(statements[1])` with the repo file: **12 of the 23 differ** in content (`fantasy_leagues_anon_callable_signature`, `news_article_detail_not_found_status`, `fantasy_player_statistics`, `news_stand_down`, `fantasy_overall_standings`, `team_translations`, `fantasy_points_read_surfaces`, `story_teams_seed`, `fantasy_prizes`, `news_sitemap_licensed`, `news_feed_indexes`, `news_search_set_based`); 11 are byte-identical apart from the version. The 4 most recent (`20260924160000`, `180000`, `180100`, `180200`) were applied by hand through `scripts/backend/apply-*.sql` in the SQL editor and match. `git log --all` shows no file ever carried the production timestamps, so the applying tool renumbered them (the CLI-style `HHMMSS` values look like `supabase migration new` at apply time, i.e. a second working copy / Lovable-side apply).
- **Impact:** `supabase db push --linked` (used by `gate4-…` and `g7-…` workflows) would try to apply 23 "new" migrations — mostly `create or replace` so some would silently redefine functions with the repo's (different) bodies, others would fail on `create table` — and `scripts/backend/phase7e-production-migration-promoter.py`'s `assert_history` would refuse to run at all. The repo cannot prove what SQL production is running for those 12 objects; CLAUDE.md's "never edit an applied migration" rule cannot be checked by `bun run backend:migrations:check`.
- **Fix:** reconcile once (owner-run script that re-records the 23 rows under the repo versions after diffing the 12 divergent bodies and, where production differs, adding a forward migration that restates the repo definition); then make the promoter the *only* path and add a CI check that compares `schema_migrations` (version, md5) with the repo on every PR (read-only). **Complexity:** M

### F6 — Edge function deployment drift and no deploy pipeline

- **Severity:** P2 · **Confidence:** VERIFIED
- **Evidence:** `list_edge_functions` → 7 deployed; repo has 8 (`news-ingest-elbotola` missing, though `config.toml` declares it with `verify_jwt=true`). `news-ingest` deployed v37 at 2026-08-01T20:27Z; `supabase/functions/_shared/gnews.ts` last changed 2026-09-19. `football-ingest` v63 deployed 2026-09-19T20:07Z; `_shared/sportsmonks-fixtures.ts` changed 2026-09-22 (that change is what `football-live-refresh`, deployed today, reuses — so two functions share a module at two different versions). Deploy commands exist only inside 8 one-off gate/backfill workflows; there is no "deploy functions on merge" workflow. (The ElBotola import is in practice run by `news-elbotola-licensed-import.yml` → `bun scripts/backend/elbotola-licensed-import.ts`, so the undeployed function is dead code rather than a broken feature.)
- **Fix:** a single `functions-deploy.yml` on merge to `main` (`supabase functions deploy <name> --project-ref …` for each), record the deployed git SHA in a function secret or response header, and delete or deploy `news-ingest-elbotola`. **Complexity:** S

### F7 — No monitoring, alerting or error tracking; error logs are noisy

- **Severity:** P2 · **Confidence:** VERIFIED
- **Evidence:** repo grep for sentry/datadog/pagerduty/betterstack/uptime/alerting → only a comment in `src/backend/news/supabase-repository.ts` and sitemap code; `src/backend/logging.ts` is a redacting structured logger with no sink to an external system. Heartbeat tables (`news_schedule_heartbeat`, `notification_email_heartbeat`) and `api.service_notification_email_health()` exist but nothing polls them. The runbook says of the orchestrator: "the red run is the only escalation channel that exists". postgres_logs last 24 h: `STALE_UPDATE` × 102 (freshness guard rejecting unchanged provider rows during the 15:02 sync, surfaced as HTTP 400 on `ingest_football_catalog_entity`) and `NEWS404 news_article_not_found` × 115 logged at ERROR severity — both expected conditions raised with `raise exception`, so real errors (the 389 timeouts) are interleaved with noise.
- **Fix:** Supabase log drains or at least a pg_cron "watchdog" that writes to a `health` table read by an external uptime check; GitHub Actions failure → email/Slack; return expected not-found/stale as data (or `raise … using errcode` at NOTICE-level custom codes PostgREST maps without logging as ERROR). **Complexity:** M

### F8 — Security: structurally good, but anonymous RPCs are unthrottled and several controls are UNVERIFIED

- **Severity:** P2 · **Confidence:** VERIFIED (structure) / UNVERIFIED (dashboard-only settings)
- **Verified strengths:** PostgREST exposes only `api` (`config.toml schemas = ["api"]`; live `role_table_grants` confirm anon has SELECT only on `api.live_fixture_updates` (policy `true`, realtime feed, 0 rows) and authenticated only on 4 `security_invoker` "my_*" views + 5 own-row tables with correct `auth.uid()` policies). All 128 tables in `app`/`app_private`: `relrowsecurity=true`, `relforcerowsecurity=true`. All 220 `api` functions are `SECURITY DEFINER` with `search_path=''` (0 exceptions), service ones gate on `app_private.is_service_request()` (JWT role = service_role), scheduler token lives in Vault (`app_private.scheduler_token()`), edge functions with `verify_jwt=false` verify a 64-hex token via `service_verify_scheduler_token` and cap body size; `notification-email-unsubscribe` is one-way. Workflows: secrets only via `${{ secrets.* }}`, masked in logs (verified in run logs: `SUPABASE_SECRET_KEY: ***`), no `set -x`, project-ref guards on every production workflow, `concurrency: botolago-production-v2-mutation` serialises all mutating workflows. Auth: 26 users, 3 unconfirmed (11.5 %), 1 verified TOTP factor (staff), MFA enforced for editorial writes (`20260919150000`).
- **Advisor (security), verbatim categories:** `rls_enabled_no_policy` INFO ×128 (by design — access is via RPC), `extension_in_public` WARN ×1 (`pg_net` in `public` — https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), `anon_security_definer_function_executable` WARN ×44, `authenticated_security_definer_function_executable` WARN ×134 (https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable). Full text in `backend-work/security_advisors.txt`. No `function_search_path_mutable`, no `security_definer_view`, no auth-config lints were raised.
- **Weaknesses:** (a) the 44 anon RPCs (`news_feed`, `news_search`, `football_matches_by_date`, `fantasy_player_pool`, …) have no per-IP throttle; combined with F1 a single client can take the site down (the audit crawler effectively did); (b) `api.username_availability` is anon-callable → username enumeration (low); (c) `docs/backend/MIGRATIONS.md` states "A security definer function … must live in app_private" — every `api` function violates this, so the document is not the convention; (d) `config.toml` `[auth.rate_limit]`, `[auth.captcha]`, `enable_confirmations`, `minimum_password_length=8`, `password_requirements=""` are **local-dev** settings only; the production dashboard values (rate limits, captcha, leaked-password protection, OTP expiry, SMTP) are UNVERIFIED — the `phase7e-production-admin-preflight.yml` workflow fetches `/config/auth` but I could not read a run artefact; (e) `db.network_restrictions` disabled in config (production value UNVERIFIED); (f) backups/PITR: UNVERIFIED (Management API not reachable read-only from here; the preflight workflow reads `/database/backups`, so an artefact from its last run would answer this).
- **Fix:** WAF/rate-limit anon `/rest/v1/rpc/*` at Cloudflare (the site is already behind it) — e.g. 60 req/min/IP; move `pg_net` to `extensions`; fix the docs; export the auth config check as a scheduled read-only workflow with a visible artefact. **Complexity:** S–M

### F9 — Performance hygiene

- **Severity:** P2 · **Confidence:** VERIFIED
- **Evidence:** advisor (performance): `unindexed_foreign_keys` ×5 — `app.player_fixture_performances(player_id)`, `(team_id)`, `app.stories(import_converted_by)`, `app_private.fantasy_free_hit_lineup_snapshots(source_lineup_id)`, `app_private.notification_email_unsubscribe_tokens(delivery_id)` (https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys); `unused_index` ×133 (https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) — most on empty admin/notification tables, but on populated ones: `fantasy_player_point_events_fixture_idx` 1.9 MB, `stories_publisher_created_idx` 1.5 MB, `article_search_documents_story_idx` 1.2 MB, `fixtures_kickoff_idx`, `players_fantasy_search_idx`; `auth_db_connections_absolute` INFO (Auth capped at 10 connections; https://supabase.com/docs/guides/deployment/going-into-prod). `pg_stat_user_tables`: `app.players` `n_live_tup=42` vs real 929 rows, `last_autoanalyze=null` → wrong plans on every player join; `app.teams` 337,634 seq scans (21 rows, fine); `app_private.news_team_aliases` 31,605 seq scans / 5.6 M tuples read (the club-tagging backfill at 15:36–15:43Z); dead-tuple ratio > 85 % on `fantasy_gameweeks`, `fantasy_teams`, `fantasy_fixture_assignments`, heartbeat tables (tiny, harmless). `pg_stat_database`: 3,706 temp files / 18 GB (work_mem 2 MB). Sizes: `article_search_documents` 100 MB, `article_editions` 49 MB, `fantasy_player_point_events` 14 MB (0 live rows — bloat from a rollback/cleanup), `stories` 10 MB.
- **Fix:** `analyze app.players` (and set `autovacuum_analyze_scale_factor` lower on small hot tables), add the two `player_fixture_performances` FK indexes, `vacuum full`/`pg_repack` `fantasy_player_point_events`, drop unused indexes after a full match-week of stats, review the temp-spilling queries (`pg_stat_statements` `temp_blks_written`) — likely `news_search`/`article_search_documents` builds. **Complexity:** S

### F10 — Data integrity (mostly clean)

- **Severity:** P3 · **Confidence:** VERIFIED
- All 17 integrity checks passed with 0 rows except: `finished_not_finalized = 480` — all 480 finished fixtures are historical (2024-08-30 … 2026-07-05), `finalized_at` was introduced in `20260922200000_fixture_finalization_preserved` for the current season only; expected. `app.rounds` for 2026/27: 2 rounds, `status=planned`, `starts_at/ends_at` null (SportsMonks has published two rounds; the season browser shows no round windows). Two `postponed` fixtures, one with the provider placeholder kickoff `2026-10-02 00:00Z` (handled by `fantasy_kickoff_confirmed`). No duplicate players (name+DOB or provider id), no duplicate fixtures, no orphan editions/stories, no squads on inactive/ineligible players, 14 upcoming fixtures, 21 active teams, 1 current season. Notifications: 0 rows, 0 dead letters (feature off). News: 15 ingestion runs succeeded, last 2026-09-18; 2 failed `provider_invalid_request` in August; 0 rejections. Football ingestion: 5 partial `squads` runs (`invalid_provider_payload`, 07-31/08-02), 3 failed `player_fixture_performances` (`mapping_not_found` / `historical_fixture_coverage_incomplete`, 08-02), 2 partial `competitions` (`catalog_item_rejected`, latest 09-14) — all old and documented in `docs/backend/LAUNCH_DATA_RECOVERY_2026_09_14.md`-era reports; no failures in the last 9 days.

### F11 — Jobs: concurrency, idempotency, retries, error swallowing (analysis)

- **pg_cron** (5 jobs, all active, all 200 sampled runs `succeeded`, max duration 0.6 s; 7-day pruning jobs for `job_run_details`): `news_publish_due_editions` uses `for update skip locked` and per-row `exception when others` (records failures in `news_schedule_runs`; good); `notification_email_tick` takes `pg_try_advisory_xact_lock` and records partial/failed with error text (good); `football_live_refresh_tick` has no lock but fires an async `net.http_post` — overlap safety is delegated to the fixture handler's provider-freshness guard (`STALE_UPDATE`), which is correct but means every overlap logs 8–16 ERRORs.
- **Edge functions:** `sportsmonks-fixtures.ts` retries 429/5xx with backoff up to `FOOTBALL_PROVIDER_MAX_RETRIES` (live refresh sets 2, timeout 15 s), classifies `provider_rate_limited` / `provider_unavailable`, and writes a `football_ingestion_runs` row with counts; `notification-email-dispatch` claims rows with expiry, retries 5× then dead-letters (per runbook; `notification_dead_letters` table exists). Catch blocks (`elbotola.ts`, `gnews.ts`, `notification-email-dispatch.ts`) return sanitised codes rather than swallowing silently. Trigger secrets are per-process random (live refresh) — good.
- **Fantasy finalisation:** `src/backend/fantasy/finalization.ts` is a resumable 12-stage checkpointed pipeline keyed by `calculationVersion`; `service_advance_fantasy_lifecycle` serialises on `select … for update` + `lock_version` (409 `stale_update`); user mutations carry `p_idempotency_key` (`app_private.fantasy_idempotency_keys`) and `p_expected_version`. Design is sound; the production gap is operational (F3), not logical.
- **Workflows:** all production-mutating workflows share `concurrency.group: botolago-production-v2-mutation` (`cancel-in-progress: false`) — this enforces the "one writer at a time" rule for GitHub-originated writes, but hand-run SQL-editor scripts (`scripts/backend/apply-*.sql`, `fantasy-*.sql`, `football-deactivate-non-current-teams.sql`) are outside it, which is exactly how F5 happened.
- **Staging separation:** staging `srdrflfrfpwixsllveid` is only used by `fantasy-authenticated-e2e.yml` (daily 03:00), `phase6-*` and `phase65-functional-acceptance.yml`; nothing verifies that a migration ran on staging before production (the promoter checks history, not staging). Recommend a required "applied on staging" check.

### F12 — Testing (database)

- 65 pgTAP files under `supabase/tests/database`, ~1,688 assertion calls (grep count; the last green CI commit message reports "database tests 1,706/1,706"). Coverage by name: identity, football (domain/RLS/ingestion/squads/standings/finalisation), news (domain/RLS/lifecycle/schedule/search/legacy imports/licensed syndication/team tagging/stand-down), notifications (domain/RLS/email delivery), fantasy (domain/RLS/ruleset/scoring worker/lifecycle/verified finalisation/next-GW progression/prizes/rating guard/calendar rollback/overall standings/points surfaces), admin (authorisation/control plane/security ops/activation/moderation, each with an RLS twin), `rls_harness`, `season_bounds_guard`. CI `database-quality` job: `supabase start` → `db reset` → `bun run backend:db:test` → `backend:db:lint` → generated-types check; latest run #630 **success** at 2026-09-24T16:11Z (pull_request). Not run locally (no Docker) — not claimed.
- Gaps: no test touches `football_live_refresh_tick`, `invoke_scheduled_function`, `service_verify_scheduler_token`, `scheduler_token` (only `news_scheduled_publication.test.sql` and `notification_email_delivery.test.sql` cover cron entry points); no test asserts an RPC's cost/plan or runs under the anon 3 s timeout; no test covers the F3 postponement path (`fantasy_fixture_resolution_required` after deadline with a real remediation); edge-function unit tests exist (`_shared/*.test.ts`, run by `bun test` in CI) but only against mocks; `scripts/backend/fantasy-load-test.py` is not in CI.

---

## 2. Can the backend support 10× users?

**No, not as deployed.** Evidence: at ~1.5 anonymous RPC/s the database already fails (F1). Connection pooling is fine (PostgREST pool, 21 backends of 60, no waits), the issue is CPU per request: every page is 1–5 RPCs each doing per-row JSON sub-selects, several validate input by scanning a system SRF (F2), nothing is cached between PostgREST and the browser (`cache-control: no-cache`), and the anon timeout is 3 s. The RPC-per-page pattern is otherwise reasonable (no N+1 from views; `fantasy_hub` 18 ms mean shows the design can be fast), so the fix is targeted: F2, set-based JSON builders for the 4 hottest RPCs, edge caching of anonymous reads, one compute tier up, and a throttle. With those, 10× is credible on the current schema.

## 3. Backups / PITR

UNVERIFIED. Not visible through the read-only SQL/MCP surface used here. `phase7e-production-admin-preflight.yml` calls `GET /v1/projects/{ref}/database/backups` and `/billing/addons`; the owner can run it (read-only) or open Dashboard → Database → Backups. Note that with 200 MB of data and daily backups only, a bad hand-run SQL-editor script (F5's path) could lose up to a day of user fantasy mutations; PITR is the mitigation to confirm.

---

## 4. Scorecard suggestions

| Area | Score | Rationale |
|------|-------|-----------|
| Backend engineering | 62 | Thoughtful schema, RLS, idempotency, checkpointed finalisation and runbooks; undermined by per-row JSON RPCs, a system-catalog scan on the hottest path, drifted migration history and undeployed/stale functions. |
| Reliability | 35 | Live production is producing 500s tonight; GW1 lifecycle blocked; live refresh off; scheduler cadence 5 h instead of 1 h; zero alerting. |
| Security (backend) | 70 | Strong RLS/definer/search_path discipline, service gating, Vault token, MFA; minus unthrottled anon RPCs, `pg_net` in public, unverifiable auth/backups config, docs that misstate the convention. |
| Automated testing (database) | 72 | Broad pgTAP suite run in CI on every PR with lint and type checks; no coverage of scheduler plumbing, performance, or the postponement path that broke today. |

---

## 5. Appendix A — database checks executed (all read-only)

| # | Query (abridged) | Result |
|---|------------------|--------|
| 1 | `get_advisors security` | 4 lint types, 307 findings (128 INFO rls_no_policy, 1 WARN pg_net in public, 44 anon secdef, 134 authenticated secdef) |
| 2 | `get_advisors performance` | 5 unindexed FKs, 133 unused indexes, Auth connections absolute |
| 3 | `list_migrations` / `select version from supabase_migrations.schema_migrations` | 90 rows; 23 versions differ from repo filenames |
| 4 | `select version,name,md5(statements[1]) … where version >= '20260919'` vs local md5 | 12 of 23 renumbered migrations differ in content |
| 5 | `list_extensions` | pg_cron 1.6.4, pg_net 0.20.4 (public), pg_stat_statements 1.11, pgtap 1.3.3, vault, pgcrypto, unaccent, uuid-ossp installed |
| 6 | `select schema_name from information_schema.schemata` | api, app, app_private, auth, cron, extensions, graphql*, net, pgbouncer, public, realtime, storage, supabase_migrations, vault |
| 7 | `pg_class` sizes + `relrowsecurity/relforcerowsecurity` for app/api/app_private/public | 128 tables, all RLS + force; largest `article_search_documents` 100 MB |
| 8 | `list_edge_functions` | 7 deployed (no `news-ingest-elbotola`); news-ingest v37 from 2026-08-01 |
| 9 | `pg_policies` for exposed schemas | 25 policies; only anon policy is `live_fixture_updates_public_read (true)` |
| 10 | `information_schema.role_table_grants` anon/authenticated | anon: SELECT on api.live_fixture_updates only; authenticated: 4 api views + 5 app tables |
| 11 | `pg_proc` in api/public with `has_function_privilege` | 220 api functions, all SECURITY DEFINER, all with `search_path=''`; 44 anon-callable |
| 12 | `cron.job` | 5 jobs (news publish */1, email tick */5, live refresh */15, 2 prune jobs 03:17/03:37) |
| 13 | `cron.job_run_details` last 200 / non-succeeded | 200 succeeded, 0 failures; max 0.59 s |
| 14 | Row counts (fixtures, teams, players, stories, editions, fantasy_*, profiles, auth.users, mfa, notifications, …) | 496 / 21 / 929 / 14,302 / 15,798 / 6 teams, 94 squad rows, 539 fantasy players, 2 leagues / 26 profiles / 26 users, 3 unconfirmed / 1 MFA / 0 notifications, 0 dead letters |
| 15 | `pg_stat_statements` top 15 by total and by mean (calls ≥ 5) | football_matches_by_date 440 s + 320 s total; news_related 120 s; count join by scoped_pat 1.5 s mean |
| 16 | `pg_stat_user_tables` seq scans / live / dead / analyze | players n_live_tup 42 (never analysed); news_team_aliases 31,605 seq scans |
| 17 | `pg_stat_user_indexes idx_scan=0 and size>500 kB` | 4 indexes (point_events fixture idx 1.9 MB, stories_publisher_created 1.5 MB, point_events pkey 1.3 MB, search_documents_story 1.2 MB) |
| 18 | dead-tuple ratio > 20 rows | 17 tables, highest ratios on tiny fantasy/heartbeat tables |
| 19 | `information_schema.columns` for 14 app + 12 app_private tables | used to write integrity queries |
| 20 | 17 integrity checks (dup players, dup fixtures, orphans, null kickoff, finished w/o score, unfinalised, stale scheduled, squad on inactive, stories w/o edition, …) | all 0 except finished_not_finalized=480 (historical) |
| 21 | fixtures by status | finished 480, not_started 14, postponed 2 |
| 22 | fantasy_gameweeks joined to season/assignments | GW1 open, deadline 13:30Z passed, 8 assignments, first kickoff 15:00Z (postponed) |
| 23 | rounds for current season | 2 rounds, planned, no dates |
| 24 | heartbeats, email settings, email runs, fantasy_job_runs, football/news ingestion run status + failures, live_updates | live refresh disabled, email off, 0 job runs, 0 live updates; historic ingestion failures only |
| 25 | `pg_get_functiondef` fantasy_league_standings, fantasy_player_gameweek_history, football_live_refresh_tick, notification_email_tick, news_publish_due_editions, football_matches_by_date, service_advance_fantasy_lifecycle, service_verify_scheduler_token, username_availability, invoke_scheduled_function, fantasy_kickoff_confirmed, is_service_request, scheduler_token, football_match_json | read; findings F2, F3, F8, F11 |
| 26 | `explain (analyze,buffers) select api.football_matches_by_date(current_date,'fr','Africa/Casablanca',p_limit:=20)` | 9,187 ms, 2,482 buffers |
| 27 | `explain analyze select exists(select 1 from pg_timezone_names where name='Africa/Casablanca')` | 22,986 ms |
| 28 | `explain analyze select count(*) from app.article_editions join app.stories` | 9,645 ms exec, 2,375 ms plan |
| 29 | `pg_roles rolconfig` | anon statement_timeout=3s, authenticated/authenticator 8s |
| 30 | `pg_stat_activity` grouped | 6 active PostgREST backends, no waits; 2 idle-in-txn read-only |
| 31 | `pg_stat_database` + settings | max_conn 60, shared_buffers 224 MB, work_mem 2 MB, temp 18 GB, deadlocks 0 |
| 32 | secdef-without-search_path count; api secdef count; rejection columns; rejections last 2 d | 0; 220/220; 26 total, 0 recent |
| 33 | lineups locked, postponed fixtures + assignments, GW1 assignment list, fantasy_teams status | 0/6 locked; FAR–Raja postponed still counts; 6 active teams |
| 34 | Logs: sources; postgres ERROR by message and per hour; edge status codes; non-2xx by path; 500/409 detail; function_edge_logs; auth paths; RPC volume per hour | 395 postgres ERRORs/24 h (145 timeouts sample, 389 in 16:00 h), 371 HTTP 500 in 16:00 h, 5,363 RPC/h |
| 35 | GitHub Actions (read): orchestrator runs, backend-quality runs, recovery runs, failed-job logs | orchestrator #36/#37 failed at "Orchestrate" step; CI #630 green; recovery skipped ×6 |

## 6. Appendix B — migration version drift (repo → production)

```
news_editorial_admin_bridge            20260919130000 → 20260919212409  (content same)
news_editorial_mfa_enforcement         20260919150000 → 20260919212452  (same)
news_editorial_server_side_sanitization 20260919160000 → 20260919212553 (same)
fantasy_leagues_anon_callable_signature 20260921120000 → 20260921111012 (DIFFERENT)
news_article_detail_not_found_status   20260921140000 → 20260921135655  (DIFFERENT)
fantasy_player_statistics              20260921160000 → 20260922131525  (DIFFERENT)
news_stand_down                        20260921170000 → 20260922131708  (DIFFERENT)
fantasy_overall_standings              20260921180000 → 20260922131802  (DIFFERENT)
team_translations                      20260921190000 → 20260922131948  (DIFFERENT)
fantasy_points_read_surfaces           20260921200000 → 20260922132158  (DIFFERENT)
story_teams_seed                       20260921220000 → 20260922132247  (DIFFERENT)
news_legacy_imports                    20260922180000 → 20260922220941  (same)
news_scheduled_publication             20260922180100 → 20260922221202  (same)
news_public_seo                        20260922180200 → 20260923043708  (same)
fixture_finalization_preserved         20260922200000 → 20260923044153  (same)
current_performance_batch_scope        20260922200100 → 20260923044401  (same)
news_licensed_syndication              20260924100000 → 20260924041012  (same)
notification_email_types               20260924140000 → 20260924130807  (same)
notification_email_delivery            20260924140100 → 20260924131431  (same)
fantasy_prizes                         20260924120000 → 20260924133723  (DIFFERENT)
news_sitemap_licensed                  20260924163000 → 20260924135118  (DIFFERENT)
news_feed_indexes                      20260924170000 → 20260924141229  (DIFFERENT)
news_search_set_based                  20260924173000 → 20260924142407  (DIFFERENT)
```
("same" = md5 of repo file equals `md5(statements[1])` recorded in production; "DIFFERENT" = the recorded SQL is not the repo file.)

## 7. Appendix C — workflows that write to a database

| Workflow | Schedule | Target | Writes |
|----------|----------|--------|--------|
| fantasy-season-orchestrator.yml | `12 * * * *` (fires ~every 5 h in practice) | production | provider fixture refresh, calendar sync, performances, lifecycle, prizes |
| football-current-season-recovery.yml | `43 7 * * *` (skipped on schedule all week) | production | fixtures/squads recovery |
| fantasy-manual-worker.yml | dispatch | production | lifecycle worker |
| football-current-finished-performances.yml | dispatch | production | performance ingestion |
| news-elbotola-licensed-import.yml / news-elbotola-recovery.yml | dispatch (recovery cron commented out) | production | article import |
| g5-production-gnews-schedule.yml | dispatch (cron commented out) | production | GNews ingest via edge function |
| g5/g7/gate2c/2d/2f/3b/4 canaries & backfills | dispatch/push | production (`db push`, `functions deploy`, secrets) | one-off |
| phase7e-b-production-migration-promotion.yml | dispatch | production | migrations via promoter |
| phase6-*, phase65-functional-acceptance.yml, fantasy-authenticated-e2e.yml (03:00 daily) | | staging | test data |
| backend-quality.yml | PR/push | local Supabase in CI | none |
| gate2e-sportsmonks-current-season-readiness.yml | `17 6 * * *` | none (provider read) | none |
