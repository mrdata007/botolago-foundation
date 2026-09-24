# BotolaGO — Full-Stack Product & Search Audit

**Date:** 24 September 2026 (evidence gathered 16:20–17:45 UTC, the first matchday of Botola Pro 2026/27 and the first Fantasy gameweek).
**Scope:** repository `mrdata007/botolago-foundation` at `d257de7` (main after PR #195) and the live product at https://botolago.com, backed by Supabase project `tkewgajrljbwgwedqsxn` (Production V2).
**Method:** eight review streams (browser QA, frontend, backend/database, security, performance, SEO/AEO, design/mobile/accessibility/RTL, plus lead verification) ran read-only against the code, the live site and the production database. The lead re-executed every P0/P1 claim before including it. Nothing was deployed, migrated, deleted or changed in production; the only writes were two test sign-ups (listed in §37).
**Confidence labels:** VERIFIED = observed directly; LIKELY = strong code evidence, not executed; UNVERIFIED = could not be checked, with the missing access named.
**Evidence:** the eight stream reports and the cited screenshots and data files are checked in beside this document under `docs/audits/2026-09-24-audit-evidence/` (streams `A`–`H`, `shots/`). Full artefact sets (211 design screenshots, 252 QA screenshots, 40 Lighthouse reports) were too large to commit; their summaries are in the stream reports.

> **One caution before reading.** Between 16:20 and 16:48 UTC the audit's own read traffic (seven concurrent automated browsers, roughly 1.5–2 API calls per second) saturated the production database. Real visitors received HTTP 500s on the home page during that window. Every timing quoted below states whether it was measured under that contention or afterwards at quiet time; the mechanisms and the capacity conclusion stand either way, but absolute numbers from the window are not steady-state figures.

---

## 1. Executive summary (for a non-engineer)

BotolaGO is a genuinely well-built product in many places: the design system is coherent, Arabic right-to-left support is among the best I have audited, the sign-up and login flow now works end to end (verified today with a real account), the database is locked down properly, and the standings maths is correct. It is **not launch-ready as a football platform**, for four reasons that matter more than everything else in this report:

1. **Fantasy is stuck on its first matchday.** The gameweek deadline was computed from a match that was later postponed, so it closed six and a half hours before the first real kick-off. The gameweek is still marked "open" hours after that deadline, the automated season job has failed on every run since 09:57 UTC, only one gameweek and two rounds of fixtures exist in the database, and a brand-new user who builds a squad is refused by the server with a message that says "import failed". New sign-ups cannot play Fantasy at all right now, and nothing alerts anyone.
2. **The production database is too small for real traffic.** It is on the smallest compute tier with a 3-second query budget for visitors. About two requests per second, less than a quiet matchday, made the home page, matches page and news feed return errors to real visitors. The matches query alone takes 1.5 seconds when the site is idle.
3. **Live scores are switched off in production.** The 15-minute refresh job runs but is disabled by configuration, so tonight's results depend on a GitHub job that in practice fires every 4–5 hours. Nobody is paged when it fails.
4. **Google cannot see the product.** Search engines receive pages whose football content (matches, standings, clubs, news lists) is loaded by JavaScript after the fact; the home page a crawler renders is a welcome screen with zero links; article pages randomly serve "do not index" when the database is slow; all 15,690 articles claim they were modified today; and only French exists at the URL level, so the Arabic majority audience is unreachable through search. The site is not indexed in Bing at all and the brand's only search footprint is this GitHub repository.

Underneath those four, there is a long tail: an open redirect on the live login page, no security headers, a live deployment that is behind `main`, drifted migration history, no error monitoring, a 400 KB JavaScript payload on every page, a first-visit mobile experience that takes 10 seconds to show anything meaningful, and dozens of smaller polish and data-quality issues. Full detail follows.

**Overall verdict: functional prototype at production URL, not a launched platform.** Product maturity 48/100. The path to launch is clear and mostly engineering, not rewrite: fix the Fantasy lifecycle and alerting, resize and cache the backend, ship the SEO rendering fixes, and close the security and deployment gaps listed in §29.

---

## 2. Overall product state

| Area | State today |
|---|---|
| Public read surfaces (home, matches, standings, clubs, news, articles) | Work when the database is quiet; every internal link resolves; standings correct; postponed matches handled. Fail to empty skeletons with no error message under load. |
| Accounts | Sign-up → email (bilingual, code + link, from `noreply@botolago.com`) → code → profile setup → session → logout → login all VERIFIED working today (3.2 s sign-up, 2.8 s login at quiet time). Google/Apple OAuth are enabled. |
| Fantasy | Squad builder, rules (15 players, 2-5-5-3, budget, 3-per-club, forced positions) enforced client- and server-side. But the season cannot advance: one gameweek, two rounds, deadline anchored to a postponed match, orchestrator red, server refuses new teams with `fantasy_gameweek_locked`. |
| News/CMS | 15,690 licensed ElBotola articles (2,478 FR / 13,212 AR) live, source credited; CMS not exercised in a browser (no editor account); no hero images on imported articles; modified dates false. |
| Live data | SportsMonks integration exists; live refresh disabled in production; provider refresh job failing today. |
| Notifications / email | Transactional auth email works; product notification emails ship switched off. |
| Prizes, dark mode | Built, gated off by feature flags. |
| Observability | None in production (no error tracker, no uptime check, no alert on job failure). |

---

## 3. Architecture overview

**Frontend.** TanStack Start (SSR) + React 19 + TanStack Router (file routes in `src/routes`, 59 routes) + TanStack Query + Tailwind v4 + a home-grown kit (`src/components/ui-kit/primitives.tsx`) over Radix. Built by Vite through `@lovable.dev/vite-tanstack-config` (Nitro server, Cloudflare preset); `src/server.ts` wraps SSR errors. Language is a client-side choice stored in `localStorage["botolago.language"]`; there are no `/fr` or `/ar` URLs and the server always renders French/LTR. Feature flags are build-time constants in `src/lib/feature-flags.ts` (`NEWS_ENABLED=true`, `DARK_MODE_ENABLED=false`, `OAUTH_PROVIDERS_ENABLED=true`, `PRIZES_ENABLED=false`).

**Hosting/deploy.** botolago.com is served by Lovable hosting behind Cloudflare (`x-deployment-id psr2…`, `server: cloudflare`); publishing means merging to `main` and deploying from Lovable. A Vercel project exists as a documented fallback. CI (`backend-quality.yml`) runs on pull requests only: typecheck, unit tests, lint, build, one anonymous Playwright spec, and a `database-quality` job that runs 65 pgTAP files on a local Supabase.

**Backend.** Supabase (Postgres 17, eu-west-3, Micro-class compute: `shared_buffers` 224 MB, `max_connections` 60). Schemas `app` (domain tables, 128 tables with RLS + force RLS), `app_private` (operations), `api` (220 `SECURITY DEFINER` functions, the only schema PostgREST exposes; 44 anonymous, 90 authenticated, 86 service-role). Roles: `anon` `statement_timeout=3s`, `authenticated` `8s`. Eight edge functions (football ingest/live refresh, news ingest/editorial write/media upload, email dispatch/unsubscribe). pg_cron: `news-publish-due-editions` every minute, `notification-email-tick` every 5 min, `football-live-refresh` every 15 min (returns `disabled` in production). GitHub-scheduled workflows: `fantasy-season-orchestrator.yml` (hourly cron, fires every ~5 h in practice), `football-current-season-recovery.yml` (daily, skipped all week: its variable gate is unset). Data providers: SportsMonks (fixtures, squads, performances), ElBotola licensed import (articles), GNews (stood down). Email: Resend (custom SMTP `noreply@botolago.com`).

**Authentication.** Supabase Auth (email + password with 6-digit code or link confirmation, Google, Apple); sessions in `localStorage` (supabase-js default); admin surfaces gated server-side with MFA/aal2, recent-auth window and dual control.

**Scale today (production, read-only):** 26 auth users (3 unconfirmed, 20 created in the last 7 days), 6 Fantasy teams, 2 leagues, 539 Fantasy players, 929 players, 21 active teams (16 are Botola Pro 2026/27), 496 fixtures (16 for the current season), 14,302 stories / 15,798 article editions.

**Route inventory.** Public: `/`, `/matches`, `/matches/$matchId` (tabs summary/stats/lineups/h2h), `/matches/standings`, `/clubs`, `/clubs/$clubId`, `/news`, `/news/$articleId`, `/fantasy` (+ `create`, `team`, `transfers`, `players`, `players/$id`, `leagues`, `leagues/$id`, `leagues/join`, `rankings`, `points`, `fixtures`, `rules`, `help`, `profile`, `top-players`), `/prizes`, `/prizes/terms` (redirect while off), `/privacy`, `/terms`, `/unsubscribe`, `/sitemap.xml`, `/robots.txt`. Auth: `/auth/login|register|verify|callback|forgot-password|update-password|mfa-challenge|profile-setup`, `/profile`, `/profile/security`. Admin: `/admin/*` (approvals, audit, news, prizes, security, staff, users). Machine: `/mcp`, `/.mcp/*`, `/.well-known/oauth-protected-resource`, `/.lovable/oauth/consent` (dead surface, see §12).

**Key user flows traced.** (1) Home: SSR shell (330 chars of text, nav links only) → 400 KB JS → hydrate → splash → language chooser → welcome screen → 7 RPCs (13 in Arabic) → content. (2) Match page: SSR loader calls `football_match_detail` (French), hydrates, then 8–13 client RPCs including 3× `news_feed`. (3) Sign-up: form → `POST /auth/v1/signup` → Resend email → `/auth/verify` → `verifyOtp` → `/auth/profile-setup` → `/`. (4) Fantasy create: draft in `localStorage` → 15 picks (client rules) → name/captain → `create_fantasy_team` RPC (server rules: budget, positions, club cap, deadline).

---

## 4. Production readiness assessment

**Not ready.** Blocking items are the four in §1 plus the security and deployment gaps below. What is in place: strong database authorisation model, migrations with pgTAP coverage in CI, structured runbooks and a decision ledger, sign-up email fixed, WAF in front of Supabase.

| Capability | Status | Evidence |
|---|---|---|
| Logging | Structured redacting logger exists (`src/backend/logging.ts`) but has no sink; production edge/postgres logs only in Supabase console. Expected conditions (`STALE_UPDATE` ×102/day, `NEWS404` ×115/day) logged at ERROR, burying real errors. | Stream B F7 |
| Error reporting (client) | None in production: `src/lib/lovable-error-reporting.ts` forwards only to the Lovable editor preview hooks. | VERIFIED (code) |
| Monitoring / alerting | None. The orchestrator runbook says "the red run is the only escalation channel". Heartbeat tables exist but nothing reads them. Two failed orchestrator runs today went unnoticed. | VERIFIED |
| Health checks / uptime | None. | VERIFIED (grep) |
| Backups / PITR | UNVERIFIED (not visible from read-only tooling; ledger BG-0002 says the org was upgraded to Pro for backups). Confirm in Dashboard → Database → Backups. | — |
| Migrations | Forward-only convention documented; but 23 of 90 migrations are recorded in production under different versions and 12 of those with different SQL than the repo (Stream B F5). `supabase db push` would disagree with production. | VERIFIED (stream B) |
| Rollback strategy | Lovable redeploy of a previous `main`; no documented DB rollback beyond migration "restore" scripts. | LIKELY |
| CI/CD | PR-gated CI is good (2,599 unit tests, pgTAP, lint, build, anonymous e2e). No CI on push to `main`; no deploy pipeline for edge functions (drift: `news-ingest` deployed 2026-08-01 vs source 09-19; `news-ingest-elbotola` never deployed); live web deployment is behind `main` (login sanitiser from 21 Sep is not live). | VERIFIED |
| Deployment gates | Manual Lovable publish; no staging acceptance gate before production; `fantasy-authenticated-e2e.yml` needs secrets that are not set (ledger BG-0028). | VERIFIED |
| Staging/production separation | Separate projects; staging used only by a few workflows; nothing verifies a migration ran on staging first. | VERIFIED (stream B) |
| Feature flags | Build-time constants, well documented. | VERIFIED |
| Secrets | No committed secrets (scan passes); workflows mask; post-incident credential rotation (eslint loader supply-chain incident of 18 Sep) still `HALTED_FOR_INPUT` in the ledger. | VERIFIED / UNVERIFIED (rotation) |
| Rate limits | None on `/rest/v1/rpc/*`; Supabase Auth defaults (dashboard values UNVERIFIED). | VERIFIED |
| Third-party outages | SportsMonks retries with backoff and classification; Resend daily caps enforced in DB; no fallback for provider squad-guard failures (that is what broke today). | VERIFIED |
| Data sync / background jobs | Live refresh disabled; orchestrator every ~5 h; recovery job skipped daily; hand-run SQL scripts outside the concurrency group (how the migration drift happened). | VERIFIED |
| Single points of failure | The Micro database; the single GitHub-scheduled orchestrator with no alert; the one publisher of content (ElBotola licence); the owner's single admin account (only staff principal). | VERIFIED |

---

## 5. Scorecard (0–100)

| Area | Score | Basis |
|---|---|---|
| Functionality | 55 | Public surfaces and the account journey work; Fantasy season cannot advance and refuses new teams; live scores off; many state/copy bugs. |
| Frontend engineering | 66 | Clean SSR/hydration discipline, code-split routes, fail-closed data modes; no route error/pending boundaries, duplicate RPCs, mock data and both dictionaries in the entry, no request timeouts. |
| Backend engineering | 60 | Thoughtful schema, RLS, idempotent RPCs, checkpointed finalisation; per-row JSON RPCs, catalogue scan on the hottest path, migration drift, undeployed functions. |
| Reliability | 32 | Production returned 500s under light load; Fantasy lifecycle blocked; live refresh off; scheduler cadence 5 h; zero alerting. |
| Security | 62 | RPC-only API, RLS + force, `search_path` discipline, MFA admin, HMAC-bound HTML; minus live open redirect, no CSP/frame protection, unthrottled anonymous RPCs, tokens in localStorage, pending rotation. |
| Performance | 42 | Desktop 85–97 Lighthouse when quiet; mobile 38–52 everywhere; 400 KB JS baseline; first-visit LCP 10 s; backend capacity 25. |
| UI | 72 | Coherent tokenised kit, club colours, consistent radii; phone-column desktop, four card paddings, two primary button styles, loud 13 px/800 type. |
| UX | 52 | Three gates before content; infinite skeletons with no error; signed-out Fantasy shows logged-in IA; empty pre-match summary; no footer; season/filter state not in URL. |
| Mobile experience | 66 | Genuinely mobile-first, 44 px floors on hubs, zero overflow; sticky chrome 24 % of the viewport on /matches, truncated club names, 15 px inputs (iOS zoom), 16 s to content on slow 3G. |
| Accessibility | 68 | Landmarks, labelled icon buttons, live-region errors, focus ring, reduced motion; no skip link, duplicate nav names, silent skeletons, focus lost after dialogs, French titles in Arabic. |
| French localization | 78 | 1,425/1,425 keys; "Profile" in the nav, mixed apostrophes, inconsistent chip names, "Matches/Matchs". |
| Arabic / RTL | 70 | Mirroring, `<bdi>` scores, logical properties, Arabic leading; French SSR shell and titles, truncated nav label, auto-truncated Arabic club codes, 3 clubs untranslated. |
| SEO | 25 | Robots/sitemap/canonical/hreflang skeleton exists; content client-only, welcome interstitial indexed, random `noindex` on timeouts, false dates, one language, 99.9 % syndicated URLs, no entity schema. |
| AEO / AI discoverability | 14 | No Organization/WebSite schema, no about/editorial/author pages, no answerable plain-text facts, AI bots allowed but receive empty shells. |
| Code quality | 60 | Strict TS, zero `as any`, documented decisions; ~4,700 dead lines, two component systems, 29 unused deps, 400–1,100-line components, unused-code checks off. |
| Automated testing | 58 | 2,599 unit + ~1,700 pgTAP assertions in CI; 41 test files assert on source text; no authenticated journey protected in CI; no test for the postponement path that broke today. |
| **Overall product maturity** | **48** | A polished shell over an unfinished operating model. |

---

## 6. P0 findings

### P0-1 — Fantasy season lifecycle is broken on its first matchday: deadline anchored to a postponed match, gameweek stuck "open", orchestrator failing, new users refused
- **Confidence:** VERIFIED (SQL, GitHub job logs, live browser test with a real account)
- **Affected:** `app.fantasy_gameweeks` (GW1 `7fcb28c5…`), `api.service_advance_fantasy_lifecycle`, `api.create_fantasy_team`, `.github/workflows/fantasy-season-orchestrator.yml`, `scripts/backend/current-season-recovery.ts:342-354`, `/fantasy`, `/fantasy/create`.
- **Evidence:**
  - GW1: `status=open`, `deadline_at=2026-09-24 13:30Z`, `points_state=provisional`, `finalized_at=null`; it is the only gameweek row. Round 1 fixtures: FAR Rabat–Raja Casablanca `15:00Z` **postponed** (still carries `home_score=0, away_score=0`), Amal Tiznit–Ittihad Tanger `20:00Z` (first real kick-off), six more on 26–27 Sep. 13:30Z = 90 min before the postponed fixture, i.e. 6.5 h before the first real match.
  - Orchestrator run #37 (15:02Z): step "Refresh provider fixtures and results" printed `CURRENT_SEASON_RECOVERY_FAIL code=current_squad_empty_or_oversized` (guard requires exactly 16 provider squads with 1–100 members), then "Orchestrate the Fantasy season" printed `FANTASY_ORCHESTRATOR_FAILED`; run #36 (09:57Z) also failed; run #35 (04:44Z) succeeded. Postgres logs at 15:03Z: `fantasy_fixture_resolution_required` (the lifecycle refuses to lock while a counting assignment is postponed); `app_private.fantasy_job_runs` and `fantasy_lifecycle_transitions` have 0 rows — no lifecycle transition has ever happened in production.
  - Live test (17:31Z, quiet): a freshly verified account built a valid 15-player squad (bank 13.6 left), named it, pressed "Entrer l'effectif" → `POST /rest/v1/rpc/create_fantasy_team` → **409 `fantasy_gameweek_locked`** → UI text "L'importation a échoué. Aucune modification n'a été enregistrée." with no toast and no mention of the deadline; the hub still shows "JOURNÉE 1 · DATE LIMITE jeu. 24 sept., 14:30 — OUVERTE". Screenshots `shots/squad-03-filled.png`, `shots/squad-06-after-submit.png`, `shots/browser-qa/j7-fr-desktop_fantasy.png`.
  - Only 2 rounds (16 fixtures) of the 2026/27 season exist; `rounds.starts_at/ends_at` are null. Ledger BG-0087 ("fixture list stops after matchday 1") is therefore still true one round later.
- **Reproduction:** sign in with any account that has no team → `/fantasy/create` → pick 15 players → name → submit.
- **Current / expected:** server correctly refuses; UI says open and blames an "import". Expected: deadline derived from the first *non-postponed* counting fixture, recomputed when a fixture is postponed; gameweek flips to `locked` at the deadline by a job; a new user is told the gameweek is closed and enrolled into the next one; the next gameweek exists.
- **Root cause:** (a) deadline derivation uses `min(kickoff_at)` over all assigned fixtures including `postponed`; (b) nothing flips status at the deadline (the lifecycle only advances inside the GitHub orchestrator); (c) the provider squad guard fails closed for the whole run when one squad is empty or oversized (which team is UNVERIFIED — needs the run artefact `fantasy-season-orchestrator-36017188883`); (d) the orchestrator refuses to run when the refresh step fails, so the lifecycle never gets a chance; (e) the remediation script `scripts/backend/fantasy-gw1-defer-postponed-and-realign.sql` exists but has not been applied.
- **Impact:** every user who joined after 13:30Z today (that is most of the 20 users created this week) cannot play; the 6 existing lineups are not locked while matches are played; scoring/finalisation cannot start; prizes cannot be evaluated; the product's headline feature looks broken on launch day.
- **Fix:** (1) owner runs the reviewed defer-and-realign script (deadline → 18:30Z for GW1 or accept and open GW2); (2) load the full 2026/27 calendar and create GW2+ rows; (3) make the squad guard per-team (skip/quarantine the one bad squad, continue the run) and let the orchestrator proceed on refresh failure with a warning; (4) move "lock at deadline" into pg_cron; (5) auto-defer postponed counting fixtures and recompute the deadline; (6) UI: derive "Fermée" from `deadline < now` client-side, and map `fantasy_gameweek_locked` to "La journée est clôturée — vous entrerez en Journée 2"; (7) alert on any red orchestrator run. **Files:** `scripts/backend/current-season-recovery.ts`, `scripts/backend/fantasy-season-orchestrator.ts`, migration for `service_advance_fantasy_lifecycle` / deadline rule, `src/routes/fantasy.create.tsx`, `src/components/fpl/GameweekStatusText.tsx`. **Complexity:** M (fix) + S (script) + M (alerting).

### P0-2 — Production database has no headroom: ~1.5–2 read requests/second produce statement timeouts and HTTP 500 for real visitors
- **Confidence:** VERIFIED (Supabase logs, direct RPC timings, quiet-time re-measurement)
- **Affected:** all anonymous read RPCs (`news_feed`, `football_matches_by_date`, `football_home_matches`, `news_article_detail`, `fantasy_player_pool`, `news_sitemap_entries`, …), home/matches/news/article pages.
- **Evidence:** Postgres `canceling statement due to statement timeout` per hour: 0 all day, 1/10/5 at 13:00–15:00, **601 in the 16:00 hour**; PostgREST RPC: 7,451 calls, **567 × 500**, p95 10.4 s (p50 5.5 s / p95 27 s in the 16:40 bucket). Real visitors on iOS Safari saw 21 × 500 with p95 21 s. Instance settings read via SQL: `shared_buffers=224 MB`, `max_connections=60`, `work_mem=2 MB`, `max_parallel_workers=2`; `anon statement_timeout=3s`. `pg_stat_activity` showed no lock or IO waits — pure CPU starvation. Quiet-time (17:24Z, 0 active backends): `news_feed` 0.31–0.45 s, `football_matches_by_date` **1.50–1.54 s idle**, auth token 0.29–0.77 s (vs 4–15 s under load); cron jobs failed to start 14 times ("job startup timeout") between 16:35 and 16:48Z and never before. Under load, `EXPLAIN` of a trivially cheap aggregate took >20 s.
- **Current / expected:** a handful of automated browsers took the site down; a matchday crowd of a few hundred will do the same. Expected: p95 < 500 ms at 10× this load.
- **Root cause (compound):** smallest compute tier; every read is a plpgsql function assembling nested JSON per row (a page of 20 fixtures ≈ 100 sub-queries); `football_matches_by_date` scans `pg_timezone_names` on every call (P1-5); no HTTP cache between browsers and PostgREST (`cache-control: no-cache` on HTML, `cf-cache-status: DYNAMIC` on RPCs); 3 automatic retries multiply load; 3 s anon timeout turns slow into broken.
- **Impact:** outages on match days; SEO crawlers get 500s; every downstream stream's timings were affected today.
- **Fix:** upgrade compute at least one tier (Small/Medium) and check burst credits; fix P1-5; edge-cache anonymous RPC payloads and public SSR HTML (30–60 s `s-maxage`, `stale-while-revalidate`); rewrite the four hottest JSON builders as set-based queries; `retry: 1` with jitter; Cloudflare rate limit on `/rest/v1/rpc/*`; only then raise the anon timeout to 8 s. **Complexity:** S (compute) / M (cache) / L (query rework).

### P0-3 — Live match refresh is disabled in production and the fallback fires every ~5 hours; no alert on failure
- **Confidence:** VERIFIED (stream B read `app_private.notification_email_settings`: `football_live_refresh_enabled=false`, `functions_base_url=null`; `football_live_refresh_tick()` returns `disabled`; `api.live_fixture_updates` has 0 rows; GitHub run history)
- **Evidence:** pg_cron `football-live-refresh` "succeeds" every 15 min returning `1 row` (a no-op). `fantasy-season-orchestrator.yml` (`cron: 12 * * * *`) actually ran at 00:28, 05:56, 11:29, 16:53, 20:18, 23:39 on 23 Sep and 04:44, 09:57, 15:02 on 24 Sep — GitHub's scheduler delays it 4–5 h, and the last two runs failed (P0-1). `football-current-season-recovery.yml` was **skipped** on every scheduled run this week (`vars.FOOTBALL_CURRENT_SCHEDULE_ENABLED` unset).
- **Impact:** during tonight's 20:00Z match the site shows no live minute or score; results and Fantasy points arrive hours late or not at all; nobody is notified.
- **Fix:** set `functions_base_url` and `football_live_refresh_enabled=true` through `app_private.notification_email_configure(...)` after confirming the Vault scheduler token matches the deployed `football-live-refresh` function; re-home the time-critical lifecycle steps (lock at deadline, lock→live, provisional scoring) to pg_cron; set the recovery workflow variable or remove the dead schedule; wire GitHub Actions failure → email/Slack. **Complexity:** S (enable) / M (re-home) / S (alerting).

---

## 7. P1 findings

### P1-1 — Open redirect after password sign-in on the live site; the repo fix is not deployed and is itself bypassable
- **Confidence:** VERIFIED (live SSR HTML + deployed chunk; repo bypass demonstrated by stream F)
- **Evidence:** `curl https://botolago.com/auth/login?next=https://evil.example` → server HTML contains `href="/auth/register?next=https%3A%2F%2Fevil.example"`; deployed `assets/auth.login-CrvznNXP.js` (5,015 B) contains `window.location.href=n` with no sanitiser. Repo `src/routes/auth.login.tsx:30-34` (`sanitizeNext`, added 21 Sep in `3dca4cd`) accepts `/\evil.example` and `/\t/evil.example`, both of which browsers resolve to `https://evil.example/`. Screenshot `shots/security/login-next-backslash.png`.
- **Impact:** phishing hop starting on the real domain right after a real sign-in.
- **Fix:** use `sanitizeAuthCallbackNext` from `src/lib/auth-callback.ts` (already correct and tested) in `auth.login.tsx`; navigate with the router instead of `location.href`; add regression tests; **publish**. Also fix the deployment gap (P1-9). **Complexity:** S.

### P1-2 — Google indexes a welcome interstitial with zero links as the homepage, and every listing (matches, standings, clubs, news feed) is client-only
- **Confidence:** VERIFIED (raw HTML: home 330 visible chars / 7 nav links; `/news` 118 chars / 0 article links; `/matches/standings` no table; rendered DOM of `/` in a fresh profile: H1 "Bienvenue sur", 0 links — `shots/design-a11y/welcome-390-fr.png`)
- **Root cause:** `src/routes/index.tsx:97-101` swaps the SSR'd home for `<WelcomeScreen>` on a `localStorage` flag; list routes have no loaders (`useQuery` only) and the router has no dehydrate/hydrate bridge (`src/router.tsx`), so nothing but article bodies reaches HTML; no HTML link anywhere points at any `/matches/<id>` or `/clubs/<id>`; the sitemap lists no match or club URLs.
- **Fix:** render home content with the welcome as an overlay; add loaders + query dehydration for `/matches`, `/matches/standings` (full `<table>`), `/clubs`, `/news` (paginated); add match/club/player URLs to the sitemap. **Complexity:** S (welcome) / L (SSR bridge).

### P1-3 — Article pages randomly serve `noindex` when the database is slow; match and club pages serve indexable empty duplicates and soft 404s
- **Confidence:** VERIFIED mechanism (`src/routes/news.$articleId.tsx:56-71` `catch → null`, `src/lib/article-meta.ts:117` emits `robots noindex` when article is null; 9/24 timed fetches and 6/29 random sitemap URLs returned the 20,163-byte "Actualités — BotolaGO" shell during the window, alternating on the same URL — `shots/seo/timing_results.txt`, `sample30_results.txt`); frequency at steady state UNVERIFIED. `/matches/<bad-id>` → 307 → 200 "Chargement…" with self-canonical and no `noindex`; `/clubs/999999` → 200 "Club introuvable" indexable.
- **Fix:** never emit `noindex` on a transient error — return 503 with `Retry-After`; `notFound()` for unknown ids (real 404); make `news_article_detail` sub-second and avoid the fr→ar double round trip; cache SSR per URL. **Complexity:** M.

### P1-4 — All 15,690 articles claim they were modified today: sitemap `lastmod`, `dateModified`, `article:modified_time` and the visible "Mis à jour il y a 4 heures" are false
- **Confidence:** VERIFIED (parsed sitemap: 15,690 `lastmod` values all on 2026-09-24, 15,670 in the 12:00Z hour; SQL: every edition `updated_at` = 12:57Z today; `src/lib/sitemap.ts:79-81` and `api.news_sitemap_entries` use `updated_at`; `article-meta.ts:24-27` uses `updatedAt` for `dateModified`). Cause LIKELY the 12:xx bulk update by today's syndication/indexing migration.
- **Impact:** Google ignores an always-now `lastmod`, freshness signal lost, untruthful schema on 2023 stories, Discover/News eligibility risk.
- **Fix:** an editorial `content_updated_at` bumped only by body/title changes; show "Mis à jour" only when it differs from `published_at`. **Complexity:** S.

### P1-5 — `football_matches_by_date` scans `pg_timezone_names` on every call: the most expensive statement in the database
- **Confidence:** VERIFIED (`pg_get_functiondef`: `if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)`; `pg_stat_statements` 1,280 calls, 608 ms mean, 5,553 ms max, 778 s total; `EXPLAIN ANALYZE` of the catalogue lookup 101–785 ms quiet, 22,986 ms under load; the same pattern in two other migrations). Quiet HTTP timing 1.5 s.
- **Fix:** validate with `perform now() at time zone p_timezone` inside an exception block, or an allow-list; apply to the other two functions. **Complexity:** S.

### P1-6 — Only one language is indexable and shareable: SSR is hard-coded `lang="fr" dir="ltr"`, no `/ar` URLs, Arabic users get a French first paint on every load
- **Confidence:** VERIFIED (`src/routes/__root.tsx:272`; `/ar`, `/fr` → 404; Arabic reload samples: `898 ms fr/ltr` → `1,052 ms ar/rtl`; `<title>`, OG title and home `<h1>` French in the Arabic UI on every page — stream D D-15/D-19, stream C F1.3/F1.4). Article editions are the exception (own URLs + hreflang pairs) but sit inside a French document with French dates.
- **Impact:** the larger half of the Moroccan search market (Arabic queries dominate "ترتيب البطولة", "مباريات البطولة") is unreachable; layout flips after hydration for every Arabic user.
- **Fix:** short term: cookie + server-side `lang/dir` and dictionary, localised `head()` titles, `lang` from loader data on article pages; structural: `/ar/...` URL prefix with hreflang on every route and both languages in the sitemap. **Complexity:** M (cookie) / XL (URLs).

### P1-7 — Migration history in production does not match the repository (23 versions renumbered, 12 with different SQL)
- **Confidence:** VERIFIED (stream B: `supabase_migrations.schema_migrations` vs `supabase/migrations`, md5 comparison; appendix B of stream B lists every row)
- **Impact:** `supabase db push`/`migration list` and the promoter's history check would refuse or misapply; the repo cannot prove which SQL production runs for `fantasy_prizes`, `news_search_set_based`, `team_translations`, `fantasy_overall_standings` and 8 others; the forward-only rule in `CLAUDE.md` is unverifiable.
- **Fix:** one reconciliation (diff the 12 bodies, forward migrations where production differs, re-record versions), then make the promoter the only path and add a read-only CI check comparing `(version, md5)` per PR. **Complexity:** M.

### P1-8 — No error monitoring, uptime check or alerting anywhere; noisy ERROR logs
- **Confidence:** VERIFIED (repo grep; `lovable-error-reporting.ts`; heartbeats unread; two red orchestrator runs unnoticed; `STALE_UPDATE`/`NEWS404` logged at ERROR)
- **Fix:** client error sink (Sentry-class or a Supabase log RPC), Supabase log drain or a pg_cron watchdog table polled by an external uptime check, GitHub Actions failure notifications, downgrade expected conditions from ERROR. **Complexity:** M.

### P1-9 — The live deployment is behind `main`, and there is no automated deploy for web or edge functions
- **Confidence:** VERIFIED for the login route (P1-1: a 21 Sep fix absent from the live bundle); edge-function drift VERIFIED by stream B (`news-ingest` v37 from 2026-08-01 vs source 2026-09-19; `news-ingest-elbotola` never deployed; `football-ingest` 09-19 vs 09-22).
- **Impact:** security fixes and bug fixes merged to `main` are not necessarily live; nobody can say which commit production runs.
- **Fix:** deploy on merge (Lovable publish hook or the documented Vercel cutover), a `functions-deploy.yml` on merge, and a `/version` or response header carrying the git SHA. **Complexity:** S–M.

### P1-10 — First-visit mobile LCP is 10.6 s on the home page and 6.6–17 s elsewhere because the onboarding stack is client-only
- **Confidence:** VERIFIED (Lighthouse quiet run: `/` LCP 10.6 s with 8.1 s "resource load delay"; the language chooser's `<h2>` is the LCP element on match, standings, club and rankings pages; `/fantasy` 17.4 s; Slow-3G: shell at 3.7 s, football content at 16–17 s; `shots/performance` Lighthouse summary)
- **Root cause:** splash (once per tab) → hydration of 400 KB JS → language chooser (client decision) → welcome screen that discards the SSR'd home and loads a 100 KB hero not present in HTML.
- **Fix:** decide language and "welcomed" on the server; chooser/welcome in the initial HTML; preload or drop the hero; do not throw away the SSR home. **Complexity:** S–M.

### P1-11 — Every route ships ~400 KB gzip (1.27 MB) of JavaScript: mobile TBT 0.7–1.1 s and Lighthouse mobile 38–52 on every page
- **Confidence:** VERIFIED (build: 181 chunks, 659 KB gzip total, entry closure 347 KB gzip; sourcemap: both FR and AR dictionaries 163 KB minified on every page, supabase auth/realtime/storage 168 KB for anonymous readers, `src/mocks` 9 KB and mock repositories in production, zod 68 KB on the public path; `src/services/football.ts:45-46` instantiates mock repositories eagerly)
- **Fix:** lazy dictionaries per language, PostgREST-only client for anonymous pages, lazy mock/admin/zod paths, prune the ~40 modulepreloads; target ≤ 180 KB gzip on public routes. **Complexity:** M–L.

### P1-12 — A slow or failing backend leaves every hub on skeletons indefinitely with no error state or retry
- **Confidence:** VERIFIED (`/matches` still on shimmer rows 55 s after navigation with the RPC in 500; recurrence at 17:15Z under light load; `src/services/query-client.ts` only sets `staleTime`, default `retry: 3` with back-off, no request timeout anywhere except the Fantasy availability probe; skeletons `aria-hidden` with no `role=status`)
- **Fix:** `retry: 1`, `AbortSignal.timeout(~8 s)` in the Supabase fetch wrapper, a "toujours en chargement… réessayer" state after ~6 s, stale-while-error with the last good payload, `role=status` on skeletons. **Complexity:** M.

### P1-13 — Sitemap is regenerated per request from a 3.6 MB RPC and fails open to 9 URLs on timeout; no news sitemap, no index, uncompressed 2.7 MB when not gzipped
- **Confidence:** VERIFIED (`src/routes/sitemap[.]xml.ts:21-35` `catch { news = [] }`; 632-byte 9-URL sitemap observed at 16:30Z; 410 KB gzip / 2.7 MB raw; no `<news:>`/`<image:>`; matches/clubs absent)
- **Fix:** scheduled generation to storage, sitemap index (static, news last 48 h, articles per year, matches, clubs, players), 503 on failure. **Complexity:** S–M.

### P1-14 — Indexing 15,690 verbatim licensed ElBotola articles as BotolaGO content (publisher: BotolaGO, no canonical to the source) will most likely be treated as duplicate content
- **Confidence:** LIKELY (outcome) / VERIFIED (facts: 15,690 of 15,699 sitemap URLs are syndication; `isBasedOn` set, `publisher` BotolaGO, no canonical; ElBotola is Morocco's #3 sports site; Bing shows 0 URLs for `site:botolago.com`)
- **Fix (owner decision):** `noindex, follow` on verbatim copies (the state before today), index only articles with BotolaGO-added value, or at minimum honest `sourceOrganization`/`copyrightHolder` and a canonical to the original. **Complexity:** S.

### P1-15 — Post-incident credential rotation and hosted Auth hardening are not evidenced
- **Confidence:** UNVERIFIED (dashboard-only; ledger BG-0021 `HALTED_FOR_INPUT`; the 18 Sep eslint-loader incident ran in CI holding Supabase/AWS/GitHub tokens)
- **Fix (owner):** rotate `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SECRET_KEY`, DB password, `SPORTSMONKS_API_TOKEN`, `GNEWS_API_KEY`, ingestion secrets; enable CAPTCHA and leaked-password protection; record evidence in the ledger. **Complexity:** S (human).

---

## 8. P2 findings

| # | Finding | Confidence | Location / evidence | Fix | Size |
|---|---|---|---|---|---|
| P2-1 | No CSP, `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy`, COOP; `/auth/login` and `/admin` are frameable (clickjacking); HSTS without `preload` | VERIFIED (`shots/security/clickjacking-login-admin.png`) | Cloudflare/Lovable headers; inline head scripts need nonces | Edge headers, start `Report-Only` | M |
| P2-2 | Auth tokens in `localStorage`; any XSS = account takeover (amplified by P2-1) | VERIFIED (code) | `src/integrations/supabase/client.ts:52-63` | CSP first; later `@supabase/ssr` cookie sessions | L |
| P2-3 | `sanitize-html@2.17.5` (two open bypass advisories) is the sole trust boundary for `dangerouslySetInnerHTML` article bodies; version is part of the HMAC contract | VERIFIED (`bun audit`) | `package.json`, `sanitizer-policy.ts:15`, edge function | Bump to ≥2.17.7 on npm + Deno + DB verifier; re-sanitise | M |
| P2-4 | Privacy policy says no audience-measurement cookies, but Lovable injects `/~flock.js` (web-vitals + UA/referrer to api.tinybird.co, `session-id` cookie), Cloudflare sets `__cf_bm`, Google Fonts load; no consent UI | VERIFIED | `documents.ts:489/656`; live HTML | Disable analytics on the production domain or amend the policy; self-host fonts | S–M |
| P2-5 | Account deletion is requestable but nothing processes it; no data export (Loi 09-08) | VERIFIED (schema) / LIKELY (process) | `api.request_account_deletion`; no worker; 0 requests today | Deletion worker + admin view + export RPC | M |
| P2-6 | 44 anonymous RPCs unthrottled; a single client can exhaust the DB (DoS amplification) | VERIFIED | advisors `anon_security_definer_function_executable` ×44 | Cloudflare rate limit on `/rest/v1/rpc/*`; caching | S–M |
| P2-7 | Home issues 7 RPCs (13 in Arabic, incl. `news_feed(50)` twice), `fantasy_hub` called 3–5× per load, loader data refetched on the client, catalogues refetched every 15 s | VERIFIED (waterfalls; `fantasy_hub` ×5 on `/fantasy/create` in the lead's test) | `src/routes/index.tsx:149-208`, `fantasy-runtime.ts:177`, `query-client.ts` | Single `news_home_modules`, memoise hub, `staleTime: Infinity` for catalogues, dehydration bridge | M |
| P2-8 | No route-level error/pending components outside `/admin`; loaders swallow errors to `null`; no link preloading | VERIFIED | `src/router.tsx:8-13`, `matches.$matchId.tsx:75-77`, `clubs.$clubId.tsx:80-82`, `news.$articleId.tsx:67-69` | Router defaults, per-section `errorComponent`, `preload="intent"` | S–M |
| P2-9 | React #418 hydration error on `/` twice a day: greeting uses the host's local hour (server UTC vs client UTC+1) | VERIFIED (error observed 17:14Z) / LIKELY (cause) | `src/routes/index.tsx:80-86` | Zone the greeting like `dateLine` (BG-0100) | S |
| P2-10 | Three full-screen gates before any content (splash → mandatory language dialog → welcome); chooser pops over an already-rendered page; French-first chooser | VERIFIED | `__root.tsx:317-339`, `FirstLaunchLanguage.tsx`, `index.tsx:97-110` | Infer language, dismissible banner, welcome as overlay/route | M |
| P2-11 | Signed-out Fantasy hub renders logged-in IA ("Mes ligues", cup rules, notification toggles) around a "Compte requis" card; gameweek band shows a past deadline as "OUVERTE" | VERIFIED (`shots/design-a11y/fantasy-390-fr.png`) | `fantasy.index.tsx:120-160`, `GameweekStatusText.tsx:33` | Dedicated guest hub; client-side deadline guard | M |
| P2-12 | Finished matches show future-tense empty copy ("statistiques disponibles au coup d'envoi") and have no events/stats/lineups | VERIFIED (`shots/browser-qa/j3-fr-desktop-match-finished-tab0.png`) | data gap + status-unaware copy | Status-aware copy; backfill last seasons if the plan covers it | S / M |
| P2-13 | Pre-match "Résumé" tab is an empty state while H2H/form data sits one tab away | VERIFIED (`shots/design-a11y/match-390-fr.png`) | `matches.$matchId.tsx` | Compose scheduled-match summary | M |
| P2-14 | Club fixture rows show only "21:00 · J. 2", never a date | VERIFIED (`shots/browser-qa/j3-fr-desktop-club0-tab1.png`) | `ClubFixtureRow` | Add day/date | S |
| P2-15 | Unknown match/article ids: SSR 200, 2–6 s spinner, generic error; non-UUID match id triggers 4× RPC 500; article ids retried 8× on 404 | VERIFIED | loaders | Validate ids, `notFound()`, no retry on 404 | S |
| P2-16 | No footer on any page; legal/contact reachable only from auth forms; legal H1s read "(FR)"/"(AR)"; no skip link; two `nav` landmarks with the same name; wordmark not a home link | VERIFIED | `AppShell`, `TopBar`, `Logo.tsx:60-72`, legal docs | Footer, skip link, distinct nav names, logo link | S–M |
| P2-17 | Article URLs are per edition, so an Arabic reader who opens a French edition gets a French article inside an Arabic shell with a French related rail (and vice versa) | VERIFIED (`shots/design-a11y/article-390-ar.png`) | `news.$articleId.tsx:194-195, 455-470` | Resolve to the edition in the UI language when it exists; filter related by language | M |
| P2-18 | News cards all use stock plates: imported articles have no hero image; `og:image` is always the generic stadium; NewsArticle schema lacks required `image` | VERIFIED (`shots/browser-qa/j3-fr-desktop-news-after-more.png`) | `sanitizeArticleAttribution`, import pipeline | Ingest images (licence permitting) or per-article generated cards | M |
| P2-19 | Structured data limited to NewsArticle (missing `image`, `publisher.logo`; author = source initials as `Person`); no Organization/WebSite/SportsEvent/SportsTeam/BreadcrumbList anywhere; 0 JSON-LD on the home page | VERIFIED | `article-meta.ts` | Add truthful entity schema | M |
| P2-20 | Missing canonicals (`/news`, `/fantasy/*`, legal), `/fantasy/rules` duplicates `/fantasy` title, standings H1 is "Matches", `/fantasy/*` personal pages not `noindex`, `www` → apex is 302, `/MATCHES` 200, every match link carries `?tab=summary` via a 307 | VERIFIED | routes' `head()` | Canonical everywhere, per-child heads, H1 fix, 301s | S |
| P2-21 | Google Fonts CSS (3 families, 13 weights) render-blocking (~1.1 s mobile); Noto Sans Arabic never loads on FR pages | VERIFIED | `__root.tsx:225-232` | Self-host 5–6 used weights, preload two, non-blocking CSS | S |
| P2-22 | `/news` mobile CLS 0.13–0.41 and a lazy-loaded LCP image; 1200 px topic images served into 88 px slots (438 KB) | VERIFIED | `/news` grid, `LatestCarousel` | Reserve space, eager lead image, `srcset` | S–M |
| P2-23 | Performance hygiene: `app.players` never analysed (planner sees 42 of 929 rows), 18 GB temp spill (work_mem 2 MB), 5 unindexed FKs incl. `player_fixture_performances(player_id, team_id)`, 133 unused indexes | VERIFIED (advisors, `pg_stat_*`) | database | `analyze`, add the two FK indexes before scoring, prune later | S |
| P2-24 | Edge-function deploy drift and an undeployed function (`news-ingest-elbotola`) | VERIFIED | `list_edge_functions` vs repo | `functions-deploy.yml` on merge | S |
| P2-25 | ~4,700 lines of dead code (26/32 shadcn files, V1 Fantasy cloud layer reading `public.*` tables production does not expose, older Fantasy components), ~29 unused runtime dependencies, unused-code checks disabled | VERIFIED | `tsconfig.json` (`noUnusedLocals: false`), `eslint.config.js:56` | Delete, add `knip`, re-enable checks | M |
| P2-26 | Mock/demo data and mock services ship in the production entry bundle | VERIFIED (`src/services/football.ts:45-46`, sourcemap) | services | Lazy-import mocks behind build-time mode | M |
| P2-27 | Five relegated/non-current clubs are still `active=true` with empty squads and appear in the Fantasy club filter and standings data; "WCA" as Wydad's short name; auto-truncated Arabic "codes" ("الد", "الم"); three clubs with no Arabic name; two clubs with the provider placeholder crest marked `validated` | VERIFIED (SQL; `shots/browser-qa/j11-ar-m360-standings-2025.png`) | `app.teams`, `app.media_assets`, ingest validation | Curate names/codes/crests, deactivate non-current clubs | S (data) |
| P2-28 | Test suite shape: 41 of 169 test files assert on source text; CI e2e covers 5 anonymous routes; every authenticated journey (auth, Fantasy create/save/transfer, profile, CMS) unprotected in CI; overflow helper structurally blind under `overflow-x: clip` | VERIFIED | `tests/e2e/*`, `backend-quality.yml:47` | See §24 | L |
| P2-29 | Staff session-revocation worker is manual/unscheduled; MCP routes trust `X-Forwarded-Host` and advertise a dead OAuth surface with high-severity transitive advisories | VERIFIED | `session-revocation-worker.server.ts`, `src/routes/mcp.ts` | Schedule the worker; remove MCP routes until wanted | S |
| P2-30 | Home greeting/date, `formatRelativeTime` and article "updated" chips computed at render → sporadic hydration mismatches | LIKELY | `format-time.ts:7-16`, `ArticleCard.tsx:164` | Mounted-only relative labels | S |

---

## 9. P3 / P4 improvements

- "Profile" (English) in the French nav, title and Explore tile; "Matches" vs "Matchs" inconsistency; mixed straight/curly apostrophes (104 vs 37 keys); chip names half-translated (Joker/Triple Capitaine vs Free Hit/Bench Boost). (P3, VERIFIED)
- Club names truncate on most fixture rows at 390 px and collapse to 2–4 letters at 320 px; "الملف الشخصي" bottom-nav label ellipsised at 390/360; the "REPORTÉ" pill steals the centre track. (P3)
- Save/bookmark buttons 32 px, carousel dots 24 px, 11 px consent links; inputs 15 px / selects 13 px (iOS zoom on focus — LIKELY, WebKit not available). (P3)
- Language chooser tiles have no selection semantics; language menu uses `aria-current` on `menuitem`; AuthPromptDialog drops focus to `<body>` on close; splash has `role="status"`; `<li role="group">` in the carousel (axe serious); register `aria-describedby` points at a non-existent element; email inputs not forced LTR in Arabic forms; match card label says "vs" in French. (P3)
- Season, tab filter and news club filter are not in the URL (lost on reload/back/share); `/auth/verify` opened directly shows a broken sentence with a live countdown; `/prizes` silently redirects guests to `/fantasy`; FDR legend overlaps rows on desktop; `fantasy_player_gameweek_history` 404 ×3 on every player page although the RPC exists; kick-off date lacks the year on past-season matches; Arabic byline "Par خ.م (البطولة)" in the French UI; meta descriptions cut mid-word; article club chips are not links although club pages exist; `/fantasy/rules` renders "Chargement…" in SSR. (P3)
- Coming back online after an offline period renders `/news` with no content, no error and no retry (one sample). (P3)
- Desktop is a 640 px phone column with full-bleed tab bars; Fantasy sits in a second "raised column" frame; three top-bar styles; four card paddings; two primary button styles; four empty-state illustration styles; 13 px/800 uppercase is the most frequent text style. (P3/P4)
- Dark mode shipped but off pending two contrast defects (BG-0083/84); admin console carries 320 design divergences (deferred). (P4)
- `pg_net` extension in `public`; `service_verify_scheduler_token` compares tokens non-constant-time; `/admin*` HTML `no-cache` rather than `no-store`; `oven-sh/setup-bun@v2` tag-pinned; `.audit-tmp`-style scratch folders not in eslint ignores. (P4)
- `botolago.fantasy.drafts` survives sign-out (LIKELY, observed in the lead's test). (P4)

---

## 10. Frontend audit

Executed: `bun run build` (exit 0, two >500 kB chunk warnings), `tsc --noEmit` (clean), `eslint` (0 errors, 14 fast-refresh warnings), `bun test` (2,599 pass / 0 fail across 216 files, 18.7 s), `bun audit` (41 advisories: 21 high, mostly build chain; 1 direct: sanitize-html).

**Strengths (VERIFIED):** strict TypeScript with zero hand-written `as any`; zod at 22 backend boundaries; data-mode selection throws in production unless `supabase` (fail-closed); SSR/hydration discipline explained in comments; every interval/listener has cleanup; open-redirect sanitiser with tests in `lib/auth-callback.ts`; enforced i18n gate (1,425/1,425 keys, 0 hard-coded strings); sanitiser allow-list + DB MAC; routes code-split (58 route chunks); lucide tree-shaken; single React copy.

**Weaknesses:** see P1-11, P1-12, P2-7, P2-8, P2-9, P2-25, P2-26, P2-30. Additional detail:
- **State:** `AuthProvider` re-renders every consumer when the auth prompt opens (P4); `FantasyOwnedProvider` puts `isFetching` in context (double re-render per refetch, P4); `staleTime` for `["football","clubs",lang]` declared at 7 sites with values from 15 s to 5 min; `use-live-matches.ts` polls every 60 s on Home and Matches even when nothing is live (1 RPC/min per open tab — deliberate, but costly given P0-2).
- **Fragile hotspots:** `admin.news.$articleEditionId.tsx` (one 1,125-line component, 19 hooks, exhaustive-deps disabled), `fantasy.transfers.tsx` `TransfersBody` (670 lines, 158 branches, 12 `useState`), `fantasy.team.tsx` (517), `news.$articleId.tsx` `ArticlePage` (452), `fpl/AddPlayerScreen.tsx` (448), `auth-supabase.ts` `buildAuthUser` (305 lines, 87 branches — every auth transition passes through it), `useFantasyScreen` memo with 20+ deps and lint suppressed. Route tests grep the source instead of rendering these.
- **Two Supabase clients, two generated type files:** the default client is typed with a stale `public`-schema file (`src/integrations/supabase/types.ts`) that still typechecks, which is why dead code reading `public.fantasy_teams` "reads as live" (ledger BG-0061).
- **Dependencies:** react 19.2.5, vite 8, nitro 3.0 beta (pinned by the Lovable config), TanStack trio three minor versions apart, `@lovable.dev/mcp-js` a major behind and dragging `fast-uri`/`ip-address` advisories.

Full detail: evidence stream A.

---

## 11. Backend / database audit

Executed (read-only): security and performance advisors, `list_tables`/`pg_class`/`pg_policies`/`role_table_grants`, 220 function privileges, migration history vs repo with md5, extensions, cron jobs and run details, row counts, 17 integrity checks, `pg_stat_statements`, `pg_stat_user_tables/indexes`, `pg_stat_activity`, 14 function definitions, 24 h of postgres/edge/function/auth logs, GitHub run histories and failed-job logs, plus the lead's quiet-time re-measurements.

**Strengths (VERIFIED):** RLS + force RLS on all 128 tables; only `api` exposed; all 220 `api` functions `SECURITY DEFINER` with `search_path=''`; service RPCs gated by `is_service_request()`; scheduler token in Vault; MFA enforced for editorial writes; idempotency keys and `lock_version` on Fantasy mutations; checkpointed 12-stage finalisation; `for update skip locked` in the publish job; advisory lock in the email tick; all production-mutating workflows share one concurrency group; data integrity clean (0 duplicates/orphans/nulls; the 480 unfinalised fixtures are historical).

**Weaknesses:** P0-1, P0-2, P0-3, P1-5, P1-7, P1-8, P2-6, P2-23, P2-24, and:
- `api.news_feed` calls `news_is_public()` and `news_article_card()` per row (≈90 buffer hits per card) and the planner picks the non-partial index; fine idle, first to time out under CPU pressure.
- Hand-run SQL-editor scripts (`scripts/backend/apply-*.sql`, `fantasy-*.sql`) sit outside the workflow concurrency group — exactly the path that produced the migration drift.
- `docs/backend/MIGRATIONS.md` says security-definer functions must live in `app_private`; every `api` function contradicts it.
- Nothing verifies a migration ran on staging before production.
- **Can it support 10× users?** Not as deployed. Connection pooling is fine (26 of 60 connections, no waits); CPU per request is the limit. With P1-5, set-based JSON for the four hottest RPCs, edge caching of anonymous reads, one compute tier up and a throttle, 10× is credible on the current schema.

Full detail: evidence stream B (with SQL appendix and migration drift list).

---

## 12. Security audit (defensive, OWASP Top 10 2021)

| Risk | Finding |
|---|---|
| A01 Broken access control | Server-side admin gating with MFA/aal2, dual control, audit log — good. Open redirect on live login (P1-1). Fantasy IDOR controls present (`fantasy_assert_owner`, hashed 128-bit invite codes). Username enumeration via `api.username_availability` (accepted trade-off). Register reveals "email already registered" (P3). |
| A02 Cryptographic failures | Tokens in `localStorage` (P2-2); HSTS present without preload. |
| A03 Injection | Parameterised RPCs; `websearch_to_tsquery`; HTML bodies sanitised server-side with HMAC proof; sanitiser version vulnerable (P2-3); no reflected XSS found. |
| A04 Insecure design | Unthrottled anonymous RPCs on a tiny DB (P2-6 / P0-2); MCP surface exposed but non-functional (P2-29). |
| A05 Security misconfiguration | No CSP / frame-ancestors / Permissions-Policy (P2-1); `pg_net` in `public`; hosted Auth settings UNVERIFIED (CAPTCHA, leaked-password check, min length); `db.network_restrictions` UNVERIFIED. |
| A06 Vulnerable components | 41 advisories; sanitize-html direct; `fast-uri`/`ip-address` via mcp-js (server side). |
| A07 Identification/auth failures | Email confirmation on, generic login error, neutral forgot-password copy; OAuth callback scrubs tokens and sanitises `next` correctly; rotation after the supply-chain incident pending (P1-15). |
| A08 Software/data integrity | eslint-loader incident turned into a CI guard (`check-config-integrity.mjs` before `bun install`), `minimumReleaseAge` 24 h, 63 actions SHA-pinned; migration history drift undermines integrity claims (P1-7). |
| A09 Logging/monitoring | None in production (P1-8); sensitive data not logged; workflows mask secrets. |
| A10 SSRF | Ingestion fetches only configured provider URLs; MCP `X-Forwarded-Host` reflection (P3). |
| Privacy | Policy contradicted by hosting analytics/cookies (P2-4); deletion never executed, no export (P2-5); no anonymous PII readable (verified probes). |

Full detail: evidence stream F.

---

## 13. Performance audit

Measured with Lighthouse 13.5 (Chromium 1194; mobile simulated slow 4G + 4× CPU; desktop 10 Mbps), Playwright waterfalls, CDP slow-3G, an INP proxy, `pg_stat_statements`, curl TTFB series and a sourcemap build. Two runs per page; the quiet run (17:00–17:13Z) is the one to trust.

| Page | Mobile Perf | Mobile LCP | Mobile TBT | Desktop Perf | Desktop LCP |
|---|---|---|---|---|---|
| `/` | 48 | 10.6 s | 0.78 s | 88 | 2.2 s |
| `/matches` | 47 | 6.4 s | 1.01 s | 90 | 1.6 s |
| `/matches/<id>` | 43 | 8.5–9.0 s | 0.7–0.8 s | 93 | 1.1 s |
| `/matches/standings` | 44 | 8.3 s | 0.86 s | 88 | 1.8 s |
| `/clubs/<id>` | 46 | 8.4 s | 0.83 s | 96 | 0.8 s |
| `/news` | 39 | 9.8 s (CLS 0.13; 0.41 contended) | 1.10 s | 88 | 1.9 s |
| `/news/<id>` | 48 | 6.6 s | 0.92 s | 88 | 1.7 s |
| `/fantasy` | 46 | 17.4 s | 0.80 s | 77 | 2.7 s |
| `/fantasy/rankings` | 47 | 7.3 s | 0.98 s | 96 | 0.9 s |

Other measured facts: HTML TTFB median 0.36 s (p90 1.0 s); 35–54 JS files / ~400 KB gzip / 1.27 MB decoded per route; `/news` 438 KB of images; hydration long task 435–493 ms and language switch 272–288 ms (would fail INP 200 ms on a mid-range phone), ordinary taps 50–100 ms; slow 3G: shell 3.7 s, football content 16–17 s; sitemap 2.7 s / 410 KB gzip regenerated per request. Root causes ranked: backend capacity (P0-2), onboarding stack as LCP (P1-10), JS baseline (P1-11), catalogue scan (P1-5), duplicate/unbridged RPCs (P2-7), no caching (P1-13, P2-12), fonts (P2-21), news images/CLS (P2-22). Full detail and the 12-step fix list: evidence stream E.

---

## 14. UI audit

The Option A kit (Changa display + Manrope body + Noto Sans Arabic, `--ui-*` tokens, club palettes, 44 px tap floor, consistent radii/elevation) is coherent and measured contrast passes AA on every solid background sampled (0 failures at 1440 across home/news/article/fantasy/standings). Inconsistencies (all VERIFIED with screenshots in stream D §3): phone-column desktop with full-bleed tab bars (V1); Fantasy in a second raised frame (V2); three detail-page top bars (V3); four card paddings and three radii (V4); three section-header grammars (V5); three selection idioms on `/news` (V6); two primary button styles (V7); 24 % sticky chrome on `/matches` at 390 px (V8); loud type ramp (V9); four empty-state illustration styles (V10); apostrophes (V11); language trigger shape varies (V12); three crest treatments (V13). Crest discs render as blank white plates until the image decodes (D-14).

---

## 15. UX audit

- **Onboarding:** three gates before content on `/` (P2-10), a fourth on first `/fantasy` visit; deep links skip the welcome gate (inconsistent); chooser is French-first and mandatory; splash cannot be skipped and re-appears in every new tab.
- **Failure states:** none reach the user (P1-12); offline returns show empty pages (P3).
- **Fantasy:** signed-out hub shows account-only widgets (P2-11); after the deadline the hub says "OUVERTE" and the create flow lets a user build and name a whole squad before a misleading "import failed" (P0-1); captain defaults to the first pick (a 4.8 goalkeeper in the lead's test — LIKELY the wrong default); an in-progress squad lives only in `localStorage` (VERIFIED, BG-0094); 32-hex invite codes cannot be shared by voice (ledger BG-0127).
- **Matches:** empty pre-match summary (P2-13); finished matches with future-tense copy (P2-12); season/filter state not in URL (P3); every match link redirects (P2-20).
- **Clubs/news:** fixture rows without dates (P2-14); stock images everywhere (P2-18); no search over 15k articles and "Tout voir" is really "load more" (P3); Arabic readers get French articles inside the Arabic shell (P2-17).
- **Trust:** no footer/legal/contact/provider credit on content pages (P2-16); legal pages say the company is "en cours de constitution"; false "Mis à jour" chips (P1-4); `/prizes` silently redirects (P3).
- **What works well:** RTL, form validation and error copy, gated Fantasy routes with `?next=`, postponed-match handling (no phantom 0–0), not-found states for clubs/players, standings maths, no dead links from home, sonner feedback on actions, illustrated empty states.

---

## 16. Mobile audit

VERIFIED at 390 and 360 px in FR and AR (54 captures, iPhone UA): 0 horizontal-overflow elements (measured with `getBoundingClientRect().right > innerWidth`, since `overflow-x: clip` hides `scrollWidth`); 0 elements under 44×44 on home, matches, standings, clubs, club, fantasy hub/rankings/players/create; but 10 small targets on `/news`, 7 on articles, 3 on match pages, 2–5 on auth (P3). Bottom nav 76 px FR / 82 px AR with `aria-current`; safe areas handled; no 300 ms tap delay; 15 px inputs / 13 px selects → iOS zoom (LIKELY). Sticky chrome on `/matches` 200 px of 844 (V8). Club-name truncation at 390/360/320 (P3). Buffered CLS 0.171 on one healthy home load (single sample). Slow-3G content at 16–17 s (P1-11). WebKit/Firefox UNVERIFIED (not installed; download forbidden by the environment).

---

## 17. Accessibility audit (WCAG 2.2 AA)

axe-core 4.13 across 54 pages: no A/AA violations other than `list` (carousel `<li role=group>`, serious) and best-practice `region`/`landmark-one-main`/`page-has-heading-one` items. Manual findings (stream D §4): no skip link (A1); two `nav` landmarks named identically and 4–5 `<header>` per page (A2); match page has no `<h1>` while loading, 404/welcome pages lack `main` (A3); skeletons `aria-hidden` with no live text (A4); splash `role=status` (A5); chooser French-first, Escape/outside blocked (A6); language menu semantics (A7); AuthPromptDialog focus management (A8); latent 1.2:1 default field border and borderless selects (A9); small targets (A10); carousel roles (A11); contrast over photos needs manual sign-off (A12); French `<title>`/`<h1>` in Arabic (A13). Passes: colour-independent status, reduced motion honoured globally, form errors via `aria-describedby` + live region, composed `aria-label` on match cards, visible 2 px focus ring everywhere, 200 %/400 % reflow without horizontal scroll (with content loss at 320 px). Screen-reader output UNVERIFIED (no VoiceOver/TalkBack/NVDA available).

---

## 18. French / Arabic / RTL audit

**French:** 1,425/1,425 keys; NBSP typography correct; defects: "Profile" ×2 (nav + title), "Matches/Matchs", apostrophes, chip names, legal H1 "(FR)" suffix, `auth.email_placeholder` localised in FR only.
**Arabic/RTL (VERIFIED correct):** `dir`/`lang` switching after mount, mirrored chevrons/arrows/split hero, `<bdi>` scores and goal difference, Western digits with `ar-MA` formatting (consistent, Moroccan convention), logical CSS utilities in all live code (physical ones survive only in dead shadcn files + `SeasonPicker`), Arabic leading floors derived from font metrics, Changa Arabic subset, per-content `lang` on article bodies, scroll direction and tab arrows follow `direction`, no overflow at 390/360.
**Arabic defects:** French SSR shell and first paint (P1-6); French `<title>`/OG/home `<h1>` on every page (A13); language chooser French-first; nav label truncation; auto-truncated Arabic club "codes" and three untranslated clubs (P2-27); French edition inside the Arabic shell (P2-17); email inputs not LTR; mixed-script strings without `<bdi>`; French dates on Arabic article bylines; menu items lack `lang`.

---

## 19. Fantasy audit

**Rules (docs/backend/FANTASY_RULES_V1.md) vs implementation:** squad 15 (2/5/5/3), budget 100, max 3 per club, forced position per slot, captain/vice — enforced client-side (disabled rows, forced position) and server-side (`create_fantasy_team` refused a post-deadline squad with `fantasy_gameweek_locked`; earlier ledger regression BG-0056 verified budget and club-cap refusals). Formation changes, chips, transfers, points, leagues and finalisation could not be exercised because no team could be created today (season locked) — UNVERIFIED in the browser; their DB logic is covered by pgTAP and 34 mocked service tests.

**Season state (VERIFIED):** one gameweek, two rounds, deadline derived from a postponed fixture, gameweek stuck open, 0/6 lineups locked, orchestrator red, live refresh off, `fantasy_job_runs` and `fantasy_lifecycle_transitions` empty — the lifecycle has never transitioned in production. GitHub scheduling drift (5 h) makes the hourly design a fiction.

**Data:** 539 Fantasy players with 69 distinct prices (pricing fixed since BG-0011); 21 active clubs of which 5 are not in the league (they appear in the picker's club filter); ledger BG-0057 duplicate players and BG-0071/0074/0075 (stats hard-coded to 0, blank manager names, points page gaps) remain open per the ledger — the points/rankings pages could not be verified because there are no scored gameweeks (rankings: "0 managers classés").

**Product:** guest hub shows logged-in IA; the create flow builds a squad before refusing; error copy says "import failed"; captain defaults to the first pick; draft only in `localStorage`; invite codes are 32-hex; no share-to-WhatsApp; prizes gated off with a silent redirect.

---

## 20. News / CMS audit

**Pipeline (VERIFIED):** 14,302 stories / 15,798 editions imported from ElBotola under a recorded licence (`app.publishers`), 2,478 FR + 13,212 AR published, 34 per language in the last 7 days, newest 2026-09-23 22:23Z; 108 legacy GNews/ElBotola stubs archived and non-publishable; scheduled publication via pg_cron every minute (1,438 successful runs today); search set-based (fixed today); club tagging backfilled today (11,092 stories, 16,097 links). Server-side HMAC-bound sanitisation, staff-gated magic-byte-checked uploads, MFA for editorial writes.

**Gaps:** every edition's `updated_at` bumped today (P1-4); no hero images on imported articles and generic `og:image` (P2-18); `publisher` claims BotolaGO on syndicated text (P1-14); no author pages, editorial policy, about/contact page; bylines are source initials; Arabic byline shown in the French UI; no search UI; no pagination on `/news`; the CMS was not exercised in a browser (production has one staff account — the owner's — and no QA editor account: UNVERIFIED); the "Programmé" flow and scheduling were verified only at the DB level by the earlier News launch report; no news sitemap (P1-13). French original content: none observed — everything public is syndication.

---

## 21. SEO audit

Summary of stream G (all VERIFIED unless noted): robots.txt sane (blocks `/admin`, `/auth`, `/profile`, `/mcp`; no AI-bot rules — decide explicitly); sitemap 15,699 URLs, no duplicates, all article `lastmod` today (P1-4), no news/image extensions, no index file, will silently truncate near 50k, fails open (P1-13); http→https 301, `www` 302 (should be 301), trailing slash 307, uppercase paths 200; soft 404s on match/club (P1-3); article `noindex` on timeouts (P1-3); listings client-only and the rendered home is an interstitial (P1-2); titles/descriptions unique per route but `/fantasy/rules` duplicates `/fantasy`, `/news` and `/fantasy` lack canonicals, standings H1 is "Matches", `/fantasy/*` personal pages indexable, `/profile` title "Profile" (P2-20); UUID slugs everywhere although `article_editions.slug` and `teams.slug` exist; no breadcrumbs; article club chips not links; structured data limited to NewsArticle without `image` (P2-19); hreflang correct only for article pairs (2,992 pairs), no `x-default` in the sitemap; one indexable language (P1-6); crawl budget dominated by 15,690 syndicated URLs of which an unknown share returns `noindex` shells (P1-14); Lighthouse SEO category 84.5 on articles (robots/crawlable audit), 100 elsewhere.

---

## 22. Search competitor analysis

Limits: WebSearch is US-based; Bing SERPs fetched by curl; Google not queryable from this environment; no volumes or Moroccan geo. Treat as "who is present", not positions.

- **Indexing/brand:** `site:botolago.com` → 0 results in Bing; brand query "botolago" → this GitHub repository's PR titles and internal reports. Google UNVERIFIED. The brand competes with "Botola" (ElBotola/البطولة: site, apps, socials; SNRT's official "Botola" app) and Arabic users cannot form it from بطولة; a fixed Arabic spelling is needed.
- **FR intents:** "classement Botola" → footmercato, FotMob, Flashscore, soccer24, 365scores, frmf.ma; "résultats/match Botola aujourd'hui" → footlive, flashscore, Sofascore, matchendirect, ElBotola; "calendrier Botola 2026-2027" → aujourdhui.ma, footmercato, hespress FR; "actualité Botola / football maroc" → foot-africa, livefoot, footmercato, marocfoot; "Fantasy Botola" → fanbotola.co "Botola Pro Fantasy" (apps), botolapromanager.ma, botolahub.com, DerbyFoot — contested but weak incumbents.
- **AR intents:** "البطولة" → FRMF, ElBotola; "البطولة الاحترافية / الدوري المغربي" → FRMF, FilGoal, Winwin, kooora, 365scores, jdwel, btolat; "ترتيب البطولة" → frmf.ma, FilGoal, kooora, jdwel; "مباريات البطولة اليوم / نتائج" → kooora, FilGoal, btolat, 365scores; "أخبار البطولة" → RadioMars, Hespress, Almountakhab; **"فانتازي البطولة" → no dedicated result — the clearest 3-month opening.**
- **Competitor table, keyword/intent map and page-type analysis:** stream G §2.2–2.3.
- **Realistic positioning:** head terms ("Botola", "البطولة") belong to ElBotola/FRMF and are not winnable; live-score intents belong to global aggregators and Google's own OneBox; winnable in 3–12 months: brand, "Fantasy Botola Pro" FR and "فانتازي البطولة" AR, per-round long-tail ("classement Botola Pro journée 12"), per-club hubs with FR+AR names, "programme TV Botola du jour", match previews/reports — **only after** the technical preconditions in §35 are met. Controllable: rendering, URLs/language, index policy, schema, sitemaps, entity pages, content cadence, latency, brand spelling, Search Console. Not controllable: competitors' authority, Google's canonical choice for syndicated text, SERP features, JS-rendering cadence for a new domain.

---

## 23. AEO / AI discoverability audit

Proven practice vs experimental is separated. State: no `Organization`/`WebSite`/`sameAs`; `/about`, editorial policy, contact, author pages absent; no plain-text answerable facts in HTML ("X leads the Botola Pro with N points", "next match A vs B, date, channel"); standings table exists as a real `<table>` in the component but never in HTML; source attribution honest (`isBasedOn`, visible "Source : ElBotola") but `publisher` and `author` misrepresent syndicated content; club names consistent FR/AR in data; AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) allowed and served identical HTML — which, without JS execution, is nav + "Chargement" + article bodies; `llms.txt` absent (experimental, optional). Recommendations (proven): SSR standings + one-paragraph summary regenerated on data change (FR+AR), SportsEvent/SportsTeam/Organization/BreadcrumbList, About/Editorial/Contact/Authors, FAQ page for Fantasy with `FAQPage`, consistent Arabic brand name, truthful dates. Experimental: `llms.txt`, a stable public JSON of standings/fixtures.

---

## 24. Automated testing analysis (test coverage gap analysis)

**Inventory:** 216 bun test files / 2,599 tests (services 34, lib 23, backend ~45, routes 9, components ~45, i18n 2, scripts ~20); 65 pgTAP files (~1,688 assertions, run in CI on a local Supabase; CI #630 green at 16:11Z; **not run here — Docker unavailable**); 9 Playwright specs, of which CI runs only `anonymous.acceptance.e2e.ts` (5 routes × 2 languages × 6 viewports asserting `lang`/`dir`, visibility, overflow, fonts); `fantasy.journey`, `staging.acceptance`, `news-cms.authenticated` skip without secrets and are wired to no workflow; `legal-brackets`, `dark-mode-flag`, `news-hero-fallback` not in CI; `fantasy-authenticated-e2e.yml` exists but its environment/secrets are unset. No visual-regression suite; accessibility only via the anonymous spec's structural checks. Edge functions tested against mocks only. `scripts/backend/fantasy-load-test.py` exists but is not wired in.

**Critical journeys with no reliable automated protection:**
1. Sign-up → email → code → profile setup → session → logout → login (real Supabase).
2. Fantasy create/save → transfers → pick team/captain → points → leagues (against real RPCs).
3. Gameweek lifecycle with a postponed counting fixture (the exact path that broke today) — no pgTAP or e2e.
4. Match detail loader/head/polling; standings route + season switch; club follow mutation.
5. Public article rendering with the sanitised body (only behind credentials-gated spec).
6. Profile edit, avatar upload, MFA challenge, admin CMS journeys in a browser.
7. Scheduler plumbing (`football_live_refresh_tick`, `invoke_scheduled_function`, `service_verify_scheduler_token`).
8. Performance regression (no RPC cost budget, no test under the anon 3 s timeout, no load test).
9. Real overflow assertion (the helper is blind under `overflow-x: clip`).
10. Sitemap/SEO output (a test that the sitemap never returns 9 URLs on failure, that loaders never emit `noindex` on errors).

**What to add (in order):** (a) nightly authenticated Playwright job against staging with seeded accounts covering 1, 2, 4, 5, 6; (b) pgTAP for the postponement/deferral path, the deadline rule and scheduler functions; (c) a CI `EXPLAIN` cost budget for the 10 hottest RPCs and a 5-minute k6/locust run against staging on every backend PR; (d) sitemap/robots/head contract tests (503 on failure, no `noindex` on errors); (e) axe in the anonymous spec; (f) a real overflow assertion; (g) `knip` + `bun audit --audit-level=high` in CI; (h) CI on push to `main` and a post-deploy smoke against production.

---

## 25. Technical-debt register

| ID | Item | Evidence | Size |
|---|---|---|---|
| TD-1 | Remove dead shadcn `components/ui/*`, older Fantasy components, V1 cloud repository and stale `integrations/supabase/types.ts`; drop ~29 unused deps; add `knip`; re-enable `noUnusedLocals`/`no-unused-vars` | P2-25 | M |
| TD-2 | Lazy-load mock repositories behind build-time mode | P2-26 | M |
| TD-3 | Router defaults (pending/error), per-section `errorComponent`, `preload="intent"` | P2-8 | S–M |
| TD-4 | Query dehydration bridge for SSR loaders; loaders for list routes | P1-2, P2-7 | L |
| TD-5 | Memoise `hub()`, drop `all-players-for-alerts`, single home news call, catalogue `staleTime: Infinity` | P2-7 | S–M |
| TD-6 | Request timeout + `retry: 1` + failure UI | P1-12 | M |
| TD-7 | Split dictionaries per language; PostgREST-only client for anonymous pages; zod off the public path; prune modulepreloads | P1-11 | M–L |
| TD-8 | Coordinated sanitize-html bump (npm + Deno + MAC version) | P2-3 | M |
| TD-9 | Break up the five 400–1,100-line route components; remove `exhaustive-deps` suppressions | §10 | L |
| TD-10 | Language in the URL or cookie read server-side | P1-6 | XL / M |
| TD-11 | Migration history reconciliation + CI drift check; promoter as the only path | P1-7 | M |
| TD-12 | Edge-function deploy workflow; web deploy on merge; version header | P1-9, P2-24 | S–M |
| TD-13 | `pg_timezone_names` validation ×3; set-based JSON builders for `football_matches_by_date`, `news_feed`, `news_article_detail`, `news_related_articles` | P1-5, P0-2 | S / L |
| TD-14 | Re-home lifecycle steps to pg_cron; per-team squad guard; alerting | P0-1, P0-3 | M |
| TD-15 | Fix `docs/backend/MIGRATIONS.md` convention text; move `pg_net` to `extensions` | stream B | S |
| TD-16 | Curate club codes/short names/Arabic names/crests; deactivate non-current clubs | P2-27 | S |
| TD-17 | Nightly authenticated e2e; pgTAP for postponement; RPC cost budget; load test | §24 | L |
| TD-18 | Align TanStack versions; plan nitro beta exit and mcp-js upgrade or removal | §10 | S / M |
| TD-19 | Ledger hygiene: `LAUNCH_LEDGER.yaml` is dated 21 Sep with 60+ non-DONE items, several already resolved (BG-0106/0107/0108 email) and several confirmed still open today (BG-0005, BG-0043, BG-0057, BG-0087, BG-0094, BG-0110, BG-0135) — re-baseline it | this audit | S |

---

## 26. Missing features or incomplete flows

- Fantasy: no gameweek beyond 1; no lifecycle transition ever executed; transfers/chips/points/leagues untestable this season until fixed; no share-to-WhatsApp; prizes off; captain default questionable; draft not server-side.
- Live: live minute/score/events off; finished matches have no events/stats/lineups (data gap); no "programme TV/channel" info; no referee data.
- News: no search UI, no pagination, no images, no author/about/editorial pages, no French original content, CMS unexercised in a browser.
- Accounts: deletion not processed; no data export; email notifications off; password change/2FA present but unverified in this audit.
- Discovery: no footer, no breadcrumbs, no club pages linked from articles, clubs hub not in primary nav, no dark mode.
- Platform: no monitoring, no deploy pipeline, no rate limiting, no caching layer, no staging gate.

---

## 27. Top 20 recommended improvements (impact order)

1. Repair the Fantasy GW1 state and make deadlines/locking automatic and postponement-aware (P0-1).
2. Resize the database, add edge caching for anonymous reads, and fix the timezone scan (P0-2, P1-5).
3. Enable live refresh in production and move lifecycle-critical steps to pg_cron (P0-3).
4. Alerting: GitHub failures, cron heartbeats, client errors, uptime (P1-8).
5. Publish the login redirect fix with the correct sanitiser; establish deploy-on-merge and a version header (P1-1, P1-9).
6. Render real content server-side: home under the welcome overlay, loaders + dehydration for matches/standings/clubs/news (P1-2).
7. Never `noindex` on error; real 404/503; cache SSR per URL (P1-3).
8. Truthful modification dates; sitemap index with news sitemap; matches/clubs/players in the sitemap; fail closed (P1-4, P1-13).
9. Decide the licensed-content index policy (P1-14).
10. Server-side language (cookie now, `/ar` URLs later); localised titles; Arabic dates on Arabic editions (P1-6).
11. Failure states everywhere: timeouts, `retry: 1`, stale-while-error, retry affordance (P1-12).
12. Onboarding: content on first paint, dismissible language banner, no welcome gate (P1-10, P2-10).
13. Cut the JS baseline to ≤ 180 KB gzip (P1-11).
14. Security headers with CSP, frame-ancestors, Permissions-Policy; sanitize-html bump; rate limit RPCs; rotate credentials (P2-1, P2-3, P2-6, P1-15).
15. Reconcile migration history and add the CI drift check (P1-7).
16. Structured data: Organization/WebSite/SportsEvent/SportsTeam/BreadcrumbList; article `image`; entity pages (P2-19, §23).
17. Guest Fantasy hub, status-aware match copy, dated club fixtures, pre-match summary (P2-11 to P2-14).
18. Data curation: club names/codes/crests/Arabic, deactivate non-current clubs, duplicate players (P2-27, BG-0057).
19. Footer, skip link, landmark names, logo link, focus management, carousel roles (P2-16, §17).
20. Test the journeys that matter: nightly authenticated e2e, postponement pgTAP, RPC cost budget, load test (§24).

---

## 28. TOP 10 highest-priority actions (impact and dependency order)

1. **Today:** apply the reviewed GW1 defer/realign script or open GW2; load the full calendar; create gameweek rows; enable live refresh. (Owner + backend, hours.)
2. **Today:** wire a failure notification for the orchestrator, cron heartbeats and 5xx rate; put someone on call for the first match week.
3. **This week:** upgrade the database tier; replace the `pg_timezone_names` check; add a Cloudflare rate limit on `/rest/v1/rpc/*`.
4. **This week:** publish `main` (login sanitiser) after switching `auth.login.tsx` to `sanitizeAuthCallbackNext`; add deploy-on-merge and the version header.
5. **This week:** per-team squad guard and orchestrator continues on refresh failure; auto-defer postponed fixtures; client-side "Fermée" guard; honest post-deadline copy and GW2 enrolment.
6. **Next 2 weeks:** edge cache for anonymous RPC payloads and public HTML; `retry: 1` + timeouts + failure UI; single home news call; memoised hub.
7. **Next 2 weeks:** SEO rendering: welcome as overlay, loaders + dehydration for the four list routes, real 404/503, no `noindex` on errors, truthful dates, sitemap index, index policy decision.
8. **Next 2 weeks:** security headers (report-only → enforce), sanitize-html bump, credential rotation evidence, CAPTCHA/leaked-password protection.
9. **Weeks 3–4:** migration reconciliation + CI drift check; edge-function deploy pipeline; nightly authenticated e2e on staging; postponement pgTAP.
10. **Weeks 3–6:** server-side language (cookie), localised titles, Arabic byline dates; entity schema and About/Editorial pages; JS baseline diet; onboarding rework.

---

## 29. BEFORE-LAUNCH checklist

- [ ] GW1 deadline/lock state repaired; GW2+ exist; new users can create a team and are told which gameweek they enter.
- [ ] Live refresh enabled and verified on one real match (score/minute updates within 15 min).
- [ ] Orchestrator green on two consecutive scheduled runs; failure notifications delivered to a human.
- [ ] Database tier upgraded; `football_matches_by_date` < 300 ms idle; home/matches/news p95 < 1 s at 10 RPC/s on staging (load test).
- [ ] Anonymous RPC rate limit and edge cache in place; `retry: 1` and timeouts shipped; failure states visible.
- [ ] Login redirect fix live; deploy-on-merge; production reports its git SHA.
- [ ] CSP (report-only at minimum), `frame-ancestors 'none'`, Permissions-Policy, HSTS preload submitted.
- [ ] sanitize-html ≥ 2.17.7 on all three sides; credentials rotated; CAPTCHA + leaked-password protection on; backups/PITR confirmed.
- [ ] Migration history reconciled; hand-run SQL scripts retired in favour of the promoter.
- [ ] SEO minimum: home content in HTML, loaders for lists, real 404/503, no `noindex` on errors, truthful dates, sitemap index, canonicals everywhere, `noindex` on personal pages, `www` 301; Search Console and Bing Webmaster verified.
- [ ] Licensed-content index policy decided and applied.
- [ ] Privacy policy matches reality (analytics, cookies, fonts) or analytics disabled; deletion worker exists.
- [ ] Data curation: club names/codes/crests/Arabic; non-current clubs deactivated; duplicate players resolved.
- [ ] Footer with legal/contact/provider credit; "Profile" → "Profil"; legal H1 suffixes removed.
- [ ] Nightly authenticated e2e passing on staging; pgTAP for the postponement path; CI on `main`.
- [ ] Test accounts and QA leagues cleaned up (§37 and ledger BG-0023).

---

## 30. AFTER-LAUNCH improvement list

Guest Fantasy hub and onboarding rework; pre-match summary; status-aware match copy and dated club fixtures; per-edition language resolution and Arabic dates; article images and per-article `og:image`; news search, pagination and author/about/editorial pages; structured data for events/teams/breadcrumbs; JS baseline diet and font self-hosting; `/news` CLS and responsive images; dead-code removal and component decomposition; dark mode once BG-0083/84 close; account deletion worker and data export; email notifications switched on with monitoring of Resend caps; prizes launch; share-to-WhatsApp; accessibility fixes (skip link, landmarks, dialog focus, carousel roles, targets, iOS input size); `/ar` URLs and hreflang on all routes.

---

## 31. 30-day engineering roadmap

| Week | Deliverables |
|---|---|
| 1 | GW1 repair + GW2; live refresh on; alerting; DB tier + timezone fix + rate limit; login fix published; deploy-on-merge; version header; test-account cleanup. |
| 2 | Edge caching (RPC + HTML); `retry: 1`/timeouts/failure UI; home RPC consolidation; welcome overlay; real 404/503; truthful dates; sitemap index; index-policy decision; CSP report-only; sanitize-html bump; credential rotation evidence. |
| 3 | Loaders + dehydration for matches/standings/clubs/news; canonicals/H1/noindex fixes; per-team squad guard + auto-deferral + pg_cron locking; migration reconciliation + CI drift check; edge-function deploy workflow. |
| 4 | Nightly authenticated e2e on staging; postponement pgTAP; RPC cost budget + load test in CI; CSP enforced; footer/skip link/landmarks; data curation (clubs, crests, Arabic names, duplicates); ledger re-baseline. |

## 32. 60-day product / SEO roadmap

Server-side language via cookie with localised heads; Arabic bylines/dates; entity pages (About, Editorial policy, Contact, Authors) in FR+AR; Organization/WebSite/SportsEvent/SportsTeam/BreadcrumbList; per-round pages (`/matches/journee-N`) and club hubs with slugs (`/clubs/raja-casablanca`) in the sitemap; news pagination + search + images; Fantasy landing page ("Fantasy Botola Pro" / "فانتازي البطولة": rules, prizes, how to play, FAQ schema) and guest hub; pre-match summary composed from H2H/form/venue/TV; JS baseline ≤ 180 KB gzip; onboarding rework; Search Console monitoring of index coverage and the `noindex`-shell rate; first original FR/AR editorial cadence (previews/reports per round).

## 33. 90-day growth / technical roadmap

`/ar/` URL architecture with hreflang on every route and both languages in the sitemap; SSR standings with plain-text summaries (AEO); per-match preview/report pages with SportsEvent status transitions; player pages with truthful stats once scoring runs; "programme TV Botola du jour" and Moroccan-calendar context (Ramadan/Eid kick-off framing); WhatsApp league sharing with rendered cards; prizes launch with sponsor; email notifications on; dark mode; PWA offline gameweek cache; Referee/VAR transparency data; brand: Arabic spelling, social profiles, `sameAs`, app-store presence decision; consider whether the public GitHub repository should stay public; capacity: set-based JSON RPCs, materialised home modules, compute headroom for match-day peaks; cookie sessions (`@supabase/ssr`) behind CSP.

---

## 34. Recommended target architecture (where the current one needs improvement)

- **Rendering:** keep TanStack Start SSR but make it data-complete: route loaders for every public page, TanStack Query dehydration into the HTML, language resolved on the server (cookie today, URL prefix later), welcome/language as overlays never replacing content. Cache anonymous HTML at the edge (`s-maxage` 30–60 s, `stale-while-revalidate`), purge on publish/result.
- **Read API:** anonymous reads served from cached, set-based JSON (materialised `home_modules`, `standings_json`, `fixtures_by_day_json` refreshed by the ingest/cron), behind Cloudflare with rate limits; per-row plpgsql JSON only for authenticated personal views. PostgREST-only client for anonymous pages; auth client lazy-loaded.
- **Lifecycle:** all time-critical Fantasy transitions (lock at deadline, lock→live, provisional scoring, finalisation trigger) in pg_cron with heartbeats; GitHub Actions only for provider-heavy sync, with per-team fault isolation and alerting; postponements handled as first-class events that recompute deadlines.
- **Delivery:** deploy-on-merge for web and edge functions with the git SHA in a header; staging acceptance (nightly authenticated e2e + load test) as a required gate; migrations only through the promoter with a CI history check; no hand-run SQL against production.
- **Observability:** client error sink, Supabase log drain, uptime check on `news_feed`/`football_matches_by_date` p95, alert routing to a human.
- **Security:** CSP with nonces for the two inline head scripts, frame-ancestors none, cookie sessions when feasible, rotation runbook executed and evidenced, CAPTCHA on auth.
- **Content model:** editorial timestamps separate from row `updated_at`; slugs in URLs with UUID aliases; article images stored in `news-media`; author and source entities; index policy encoded in the sitemap/head builders rather than decided ad hoc.

---

## 35. Search growth strategy

**What must be true first (technical):** every public page returns its primary content and links in HTML with correct 404/503 semantics; Arabic has URLs; the indexable set is honest (original pages indexed, verbatim syndication `noindex, follow` or canonicalised, truthful dates); an entity exists (Organization schema, About/Editorial/Contact/Authors, Arabic brand spelling, social profiles, Search Console + Bing verified, sitemap index submitted); latency and caching such that crawlers never hit Postgres.

**Then editorial (FR + AR):** per-round preview/recap pages, club hubs with FR/AR names and slugs, per-match previews and reports with SportsEvent markup, a daily "programme TV Botola" page with kick-off times and channels, a Fantasy explainer/FAQ landing, and at least a few original stories per week that add Moroccan context the aggregators lack. Internal linking: articles → clubs/matches/players; home → standings widget with real rows; footer → hubs.

**Horizons (no ranking promises):** 3 months — technical fixes 1–4, the ~30 original pages indexed, presence for the brand, "Fantasy Botola Pro" (FR) and "فانتازي البطولة" (AR, near-empty today). 6 months — per-round and per-club pages, long-tail like "classement Botola Pro journée 12", "Raja Casablanca calendrier 2026-2027", "مباراة الرجاء والوداد موعد"; Discover exposure only with real images and original content. 12 months — compete on "classement Botola" FR long-tail and Arabic "ترتيب البطولة الاحترافية" variants, club navigational secondary results; head terms remain ElBotola's/FRMF's. Track: index coverage, `noindex`-shell rate (target 0), crawl stats, CWV field data once CrUX exists, query share for the target clusters.

---

## 36. What would make BotolaGO exceptional

Concrete, Moroccan-fan-specific ideas (from the design stream, endorsed by the lead):
1. Kick-offs framed in the fan's day — Ramadan/Eid and Friday-prayer context in the gameweek band and match cards (a Hijri/holiday layer on the existing Casablanca time zone).
2. A Darija voice for match-day copy (live strip, goal takeover, push), with fusha kept for editorial/legal.
3. Derby mode: a 72-hour skin for Wydad–Raja and FAR–Wydad with H2H history, community tifo gallery and a "derby captain" mini-game.
4. Stadium & travel card on every match: capacity, ticket link, tram/train lines, TV channel (Arryadia/SNRT/beIN).
5. One timeline for Botola, the Lions de l'Atlas and Moroccan clubs in CAF competitions.
6. Offline-first current gameweek and standings (service worker) with the existing offline banner showing cached kick-offs instead of skeletons.
7. WhatsApp-native private leagues: one-tap share with a rendered rank-table image and a weekly league recap card.
8. Local-sponsor prizes (inwi is the league sponsor) surfaced on the Fantasy card as the reason to create a team.
9. Club-first first launch: "choose your club" instead of language + welcome gates; home opens on that club's next match and news.
10. Referee/VAR transparency: referee name and season stats, VAR decisions in the timeline.
11. Arabic-first typography and chooser, Arabic SSR shell for returning Arabic users.
12. Live radio commentary integration (Radio Mars / Medi1) on the live match page.

---

## 37. Unknowns / things not verified

- **Browsers:** WebKit/Safari and Firefox behaviour (not installed; download forbidden). iOS input-zoom finding is LIKELY only.
- **Screen readers:** VoiceOver/TalkBack/NVDA output not tested; ARIA inspected structurally.
- **Supabase dashboard settings:** CAPTCHA, leaked-password protection, password policy, session limits, redirect allow-list details, network restrictions, backups/PITR, compute tier name and burst credits.
- **Credential rotation** after the 18 Sep incident.
- **Which provider squad** tripped `current_squad_empty_or_oversized` (workflow artefact / provider token needed).
- **Steady-state frequency** of article `noindex` shells and RPC 500s outside the audit window (Search Console and a synthetic check would answer it).
- **Google index status** (only Bing could be queried); Search Console access.
- **Authenticated Fantasy flows beyond create** (transfers, chips, points, leagues, finalisation), the admin CMS in a browser, profile edit/avatar/MFA, email notification copy, prize flows, dark mode, live-match state and goal takeover — not exercisable today (season locked, no editor account, flags off, no live match during the window).
- **Slow-3G on every page** (only home and matches, per throttle).
- **Stored-HTML scan** of 15.8k article bodies for dangerous markup (query timed out during contention; not retried to avoid load).
- **pgTAP** could not run here (no Docker); CI run #630 is the evidence that it passes.
- **Exploitation of the open redirect after a real sign-in** was not executed (the SSR propagation and deployed code are the evidence).

**Production writes made by this audit (please clean up):** `auth.users` `alisarhane73+audit20260924@gmail.com` (created 17:25Z, unconfirmed, no profile) and `compak2026+audit20260924@gmail.com` (created 17:28Z, confirmed, profile "Audit Tester" @audit2026b, no team/league/follows). Nothing else was written; the squad submission was refused by the server.

---

## 38. Evidence appendix

**Tests and checks executed (lead):** `bun install --frozen-lockfile`; `bun run typecheck` (exit 0); `eslint .` excluding scratch (0 errors / 14 warnings); `bun test` (2,599 pass / 0 fail, 216 files); `bun run backend:migrations:check` (90 valid); `bun run backend:secrets:check` (clean); `check-config-integrity.mjs` (37 files OK); `bun run legal:gate` (OK); `bun run backend:types:check` (fails: Docker unavailable); `bun audit` (41 advisories); `bun run build` (stream A/E; exit 0). Not run: pgTAP (no Docker), Playwright suites requiring credentials.

**Browsers/viewports:** Chromium 1194 (Playwright 1.61) at 1440×900, 390×844 (iPhone UA), 360×780, 320 and 640 (reflow); FR and AR; timezone Africa/Casablanca; Lighthouse 13.5 mobile (slow 4G, 4× CPU) and desktop; CDP slow-3G. WebKit/Firefox not available.

**Pages inspected:** `/`, `/matches`, three match pages (upcoming, finished, postponed ×2), `/matches/standings` (4 views, 3 seasons), `/clubs` and three club pages (4 tabs each), `/news`, six articles (FR/AR), 13 Fantasy routes signed out and signed in, all auth routes, `/profile`, `/prizes`, `/privacy`, `/terms`, `/unsubscribe`, `/admin*` signed out, 404s, `/sitemap.xml`, `/robots.txt`, `/.well-known/oauth-protected-resource`, `/mcp`, 30 random sitemap URLs, 12 timed article fetches, raw HTML of every page type.

**Live commands (representative):** `curl -sS -D - https://botolago.com/…` for status/headers/TTFB; `curl -X POST …/rest/v1/rpc/{news_feed,football_matches_by_date}` timings; `curl -X POST …/auth/v1/token?grant_type=password` (bad credentials) timings; `curl …/auth/v1/settings`; `curl …/auth/v1/authorize?provider={google,apple}`; `OPTIONS …/auth/v1/signup`; Playwright scripts for first visit, home, matches, match detail, standings, clubs, news, Fantasy, auth, static pages, offline, sign-up/verify/login/logout, squad build/submit (`.audit-tmp/*.mjs`, not committed).

**Database checks (read-only, production):** `pg_roles.rolconfig`; `pg_settings`; `pg_stat_activity` (repeated); `pg_locks`; `cron.job` and `cron.job_run_details`; `app.fantasy_seasons/gameweeks`, round/fixture listing for the current season, `app.teams` × `team_memberships` squad sizes, `app.article_editions` by language/status, `auth.users` counts and the two audit rows; `supabase_migrations.schema_migrations` vs repo; advisors (security 307 findings, performance 139); `pg_stat_statements`; `pg_stat_user_tables/indexes`; `pg_get_functiondef` for 14 functions; 17 integrity queries; `query_logs` for postgres/edge/function/auth sources (hourly and 5-minute buckets, 15:00–17:30Z). Every query is listed in stream B appendix A and stream E §0.

**Files inspected (selection):** `AGENTS.md`, `CLAUDE.md`, `package.json`, `vite.config.ts`, `playwright.config.ts`, `tsconfig.json`, `.env.production`, `.github/workflows/*.yml`, `src/routes/__root.tsx`, `index.tsx`, `auth.*.tsx`, `matches.*.tsx`, `clubs.*.tsx`, `news.*.tsx`, `fantasy.*.tsx`, `sitemap[.]xml.ts`, `src/router.tsx`, `src/server.ts`, `src/lib/{feature-flags,auth-callback,article-meta,sitemap,lovable-error-reporting,format-time}.ts`, `src/services/{auth-supabase,football,fantasy-runtime,fantasy-owned-repository,query-client,news}.ts`, `src/i18n/*`, `src/components/{shell,welcome,splash,fpl,news,common,ui-kit}/*`, `src/backend/**`, `supabase/config.toml`, `supabase/migrations/*` (90), `supabase/functions/*`, `supabase/tests/database/*` (65), `scripts/backend/*`, `scripts/vercel/ignore-build.mjs`, `docs/engineering/LAUNCH_LEDGER.yaml`, `docs/backend/{ENVIRONMENTS,EMAIL_NOTIFICATIONS,NEWS_LAUNCH_REPORT,NEWS_CMS_ACTIVATION_AUDIT,FANTASY_RULES_V1}.md`, `docs/production/HUMAN_ACTIONS_2026_09_21.md`, `docs/qa/*`.

**Committed evidence:** `docs/audits/2026-09-24-audit-evidence/streams/A…H` (eight stream reports and the lead's verification notes) and `docs/audits/2026-09-24-audit-evidence/shots/` (Lighthouse and waterfall summaries, SEO timing/sampling logs, and the screenshots cited above: Fantasy hub with a past deadline shown as open, matches page on infinite skeletons, finished match with future-tense copy, Arabic register form with an LTR value reversed, club fixtures without dates, stock news plates, Arabic standings at 360 px, home/matches/news/match/article/fantasy/standings/clubs captures in FR and AR, first-visit chooser and welcome screen, clickjacking and open-redirect proofs, sign-up/verify/profile screens, the filled squad and the refused submission).
