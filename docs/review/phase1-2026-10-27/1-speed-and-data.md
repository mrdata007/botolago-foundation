# BotolaGO Phase 1 audit: SPEED & DATA (speed-r1)

Auditor: Speed & Data. Read-only. Repo HEAD ab4506b (live site serves release 171479f, 4 merge commits behind HEAD, an ancestor of HEAD).
What I ran: `bun run build` (passed, 60 s; output in gitignored `.output/`, `git status` clean), grep and file reading, and 10 anonymous GETs to botolago.com (limit was 15). No database, no RapidAPI, no Sportmonks, no admin login.
Caveat on measurements: sizes are exact. Timings (TTFB) were taken from a US-based sandbox through a proxy, so they are not what a phone in Morocco sees. Treat them as relative.

## Findings

### S1. RapidAPI plan may be exhausted until the 10 Nov reset, which would freeze live scores (UNVERIFIED, needs the owner)
- What: On 26 Oct the provider itself answered "0 of 10,000 remaining" while our counter said 9,036. The migration that fixes this ships today (27 Oct). The budget guard now treats the provider's figure as the floor: `used = greatest(counted + offset, limit - remaining)`. If RapidAPI still reports 0 remaining, `used` = 10,000, which is above the hard limit. FIXED 1: the limit in force by code is 9,700 (column default `hard_limit integer not null default 9700`, `20261026143000_rapidapi_budget_guard_and_poll_schedule.sql:67`; soft default 8,500). The 9,950 (and soft 9,600) in the header of `20261027100000` are values that header says were in use in production; I could not verify them ("reported in the header, unverified"). Either way 10,000 is above both. Every `football-live-refresh` run then answers `skipped: monthly_budget_hard_limit` and sends nothing. The quota window resets on the 10th (`reset_day_of_month` = 10), so that would be 14 days of no live scores, no fixture refresh and no Fantasy ratings.
- Where: `supabase/functions/_shared/rapidapi-client.ts:199-204` (hard stop); `supabase/migrations/20261027100000_rapidapi_provider_quota_floor.sql:2-9` (the incident); `docs/backend/SOFASCORE_LIVE_EDGE.md:404-420`.
- Why it matters to fans: A fan opens a live match during the weekend of 31 Oct and the score and minute never move. The Fantasy points that depend on provider data stay late.
- Severity: Critical if the plan is really at 0 today; High until someone checks. I cannot read the database or the RapidAPI dashboard.
- Effort: S to confirm (owner reads the RapidAPI dashboard and `select api.admin_rapidapi_calls_this_month()` as staff). Fix is a plan decision, not code.
- Proof: the migration header lines above; the guard code at rapidapi-client.ts:199. The current quota state is a question for the Lead (Q1).

### S2. Fifteen manual workflows call RapidAPI with no call counter and no budget guard, and one of them uses the Flashscore host
- What: `football-live-refresh` (live, season, rating polls, catalog) counts every request and enforces the limits. The scripts under `scripts/backend/` build their own client from `src/backend/football/provider/rapidapi-client.ts`, which has neither. They are all `workflow_dispatch` only (no schedule), so they cost only when someone runs them. But their calls land in the provider's quota and not in `app_private.rapidapi_call_counts`. That is the most likely source of the "964 uncounted calls" in the 26 Oct incident. The doc admits it.
- Where: workflows with `RAPIDAPI` secrets: `provider-probe.yml`, `sofascore-live-shadow-compare.yml` (1 to 12 polls per run), `sofascore-ratings-audit.yml`, `sofascore-recovery-diagnostic.yml`, `sofascore-fantasy-simple-{read,rehearsal,apply}.yml`, `sofascore-id-bridge-{staging,production-read,production-rehearsal,production-apply}.yml`, `sofascore-catalog-id-mapping-production-read.yml`, `sofascore-squad-link-production-read.yml`, `production-mas-fes-candidate-canary.yml`, `production-remaining-clubs-candidate-population.yml`. Code: `scripts/backend/sofascore-live-shadow-compare.ts:23,56`, `sofascore-ratings-audit.ts:4,47`, `sofascore-id-bridge-fetch.ts:21,216`, `sofascore-fantasy-simple-ingest.ts:31,260`. Doc: `docs/backend/SOFASCORE_LIVE_EDGE.md` ("scripts under scripts/backend/ ... do not [go through the guard]").
- Why it matters to fans: A staff member running one of these near the cap can silently use the calls that keep live scores running. Nothing warns anyone.
- Severity: Medium. Effort: M (route the script clients through the same counter and budget read, or have each workflow refuse above a number of used calls).
- Proof: grep above; the 15 workflows all show `workflow_dispatch:` as their only trigger.

### S3. The budget guard fails open when the budget read fails
- What: `loadRapidApiBudget` returns null on any database error. The comment says "the run goes on without the guard". The only remaining protection is the client's `minRemaining` floor of 100 (from the provider's headers). So a database blip during the busiest minutes removes the 9,700 stop.
- Where: `supabase/functions/_shared/rapidapi-budget.ts:7-9,36-44`; `rapidapi-client.ts:27` (`DEFAULT_MIN_REMAINING = 100`).
- Why it matters to fans: Low direct effect. It is how an overspend slips through, and overspend leads to S1.
- Severity: Low. Effort: S (when the read fails, fall back to essential endpoints only).
- Proof: file lines above.

### S4. Home page makes an anonymous visitor download auth, MFA and Fantasy code they never use
- What: The home HTML has 95 `modulepreload` links. I measured the 90 that exist in my local build: 1,030,502 bytes raw, 314,343 bytes gzip (the 5 others, including the entry chunk, are extra). They include `AuthProvider`, `second-factor`, `step-up`, `fantasy-hub-share`, `schemas` (zod, 71 KB), `provider` (250 KB, the UI kit plus the whole French dictionary) and `client` (205 KB, supabase-js including Realtime that the app never uses; no `.channel(`/realtime calls outside admin). Entry chunk `index-D4SJEbLu.js` is 508 KB raw, 159 KB gzip.
- Where: live `https://botolago.com/` head (preloads) vs `.output/public/assets/*`; root route `src/routes/__root.tsx` wraps everything in AuthProvider; `src/i18n/provider.tsx:5` imports `./dictionary-fr` (227 KB source) statically.
- Why it matters to fans: On mobile data the first screen waits on roughly 340 to 470 KB of gzipped JavaScript plus 36 KB CSS, 26 KB HTML and a 57 KB hero image before it is interactive. At about 1.5 Mbps that is 3 to 4 seconds of transfer. Most visitors are logged out.
- Severity: Medium. Effort: M to L (lazy-load the auth and Fantasy providers for anonymous routes; move French strings per route).
- Proof: `grep -o 'rel="modulepreload"' ` on the saved home HTML = 95; per-file gzip sizes from `.output/public/assets` (provider 249,976 / 67,543 gz; client 205,510 / 52,122 gz; primitives 115,645 / 34,539 gz; schemas 71,176 / 18,704 gz; AuthProvider 56,820 / 18,192 gz). Local build hashes differ slightly from live for the 5 newest chunks (live is 4 commits behind), so totals are within a few percent.

### S5. Self-hosted fonts are served with no cache headers at all
- What: `/assets/*` gets `cache-control: public, max-age=31536000, immutable` (from the generated `_headers`). But `/fonts/*.woff2`, `/og-image.jpg`, `/favicon.png` and `/apple-touch-icon.png` come back with no `Cache-Control`, no `ETag` and no `Last-Modified`. A browser with no validator and no freshness cannot reuse the file after the session; it downloads it again. Arabic readers pay most: Noto Sans Arabic Arabic subset is 165,960 bytes and Changa Arabic 23,076 bytes; French readers load Manrope latin (24,836) and Changa latin (23,064). No font is preloaded (0 `rel="preload" as="font"` in the home head), so text shows in the fallback face first and then swaps (`font-display: swap`).
- Where: `src/fonts.css:1-60`; `public/fonts/` (no `public/_headers` file exists; only the build-generated `.output/public/_headers`, which covers `/assets/*` only). Live headers: `curl -I https://botolago.com/fonts/changa-latin-wght-normal.woff2` shows none of the cache headers.
- Why it matters to fans: A returning Arabic-language fan on mobile data re-downloads about 190 KB of fonts on every visit and sees a font swap flash each time.
- Where the fix goes (FIXED 3): the site is served by Lovable hosting on Cloudflare Workers, not Vercel. Evidence: `docs/operations/DEPLOYMENT.md:9` ("Website ... Lovable hosting, `botolago.com` ... Publish in Lovable puts it live"); `.output/nitro.json` (`preset: cloudflare-module`, assets via an `ASSETS` binding, `.output/server/wrangler.json`); `tests/e2e/built-output-serve.ts:7-9` ("the target the site deploys with: a Worker"); live headers on every response: `Server: cloudflare`, `Cf-Ray: ...-IAD`, and no `x-vercel-id`. `vercel.json` only holds an ignore-build command (`scripts/vercel/ignore-build.mjs`) for Vercel preview builds. So a cache rule is either a `public/_headers` file (Cloudflare Workers static-assets format; the build already writes the `/assets/*` rule into `.output/public/_headers`) or a `cache-control` set in `src/lib/response-headers.ts`. Whether Lovable honours a custom `_headers` file is unverified (Q8).
- Severity: Medium. Effort: S (add a `/fonts/*` rule; file names are not hashed, so a 30-day max-age, or rename with a hash and use one year).
- Proof: measured on 27 Oct, response headers for `/fonts/changa-latin-wght-normal.woff2` (Content-Length 23064, no Cache-Control/ETag/Last-Modified) vs `/assets/provider-DkrcTa3y.js` (`Cache-Control: public, max-age=31536000, immutable`).

### S6. Arabic readers get a French page first, then a second download and a full data refetch
- What: Server rendering is always French (`getHomeMatches("fr")`, query keys end in `"fr"`). The Arabic dictionary (`dictionary-ar`, 243,586 bytes raw, 56,722 gzip) is only fetched after hydration when the stored language is Arabic. All data queries include the language in their key, so the Arabic reader refetches matches, clubs, seasons, standings and news from Supabase again after the switch.
- Where: `src/routes/index.tsx:111-146` (loader prefetches with "fr"); `src/i18n/provider.tsx:27-45` (Arabic on demand, with the comment "every page is first rendered in French").
- Why it matters to fans: A large share of the audience reads Arabic. They see French text and left-to-right layout flash, then it flips, after an extra 57 KB and about five extra Supabase calls. On a slow connection the flip is late.
- Severity: Medium. Effort: M to L (remember the language in a cookie so the server can render Arabic; the server already sets headers per path in `src/lib/response-headers.ts`).
- Proof: file lines above; `.output/public/assets/dictionary-ar-OfgYbVC6.js` size.

### S7. Public pages are rendered on every visit and never cached at the edge, and each home render waits on 5 Supabase calls
- What: HTML for `/`, `/news`, `/matches/standings` comes back `Cache-Control: no-cache, must-revalidate, max-age=0`. The home loader runs 4 queries in parallel (home matches, clubs, seasons, news edition), then a 5th (standings) that depends on the seasons result, so there are two sequential rounds against Supabase before the first byte. Measured TTFB from the sandbox: `/` 3.49 s, `/news` 2.31 s, `/matches/standings` 1.02 s. Only `/auth`, `/admin`, `/profile`, `/fantasy` etc. are explicitly `private, no-store`; nothing sets a short shared-cache lifetime for the public ones.
- Where: `src/routes/index.tsx:111-146`; `src/lib/response-headers.ts:49-56`; live headers on 27 Oct.
- Why it matters to fans: Every fan who opens the home page triggers the same five database reads that a thousand other fans just triggered. During a derby this is the page everyone opens at once, and its speed is the database's speed.
- Where the fix goes (FIXED 3): HTML is produced by the Worker (`src/server.ts` calls `withSiteHeaders`), so a short `s-maxage` + `stale-while-revalidate` for public paths goes in `src/lib/response-headers.ts` next to the existing `private, no-store` rule (whether Cloudflare in front of Lovable's hosting keeps it is unverified, Q8). Hosting evidence is in S5.
- Severity: Medium (High only if S8's load grows). Effort: M (shared-cache lifetime for logged-out public HTML; or run the standings query in the first batch).
- Proof: curl timings above; loader code above.

### S8. Browser polling goes straight to Supabase, uncached, and scales with users: about 15 to 55 requests per second on a normal evening and 135 to 220 at a derby peak (at 5,000 active users)  (FIXED 2)
- What: Every foreground tab polls RPCs directly (`supabase.rpc`), with no shared cache in front. On Home with a match live, one reader runs: live strip every 30 s (`useLiveMatches`), home fixtures every 30 s (`matchesRefetchInterval`), home stories every 60 s, Fantasy availability every 60 s (a full Fantasy hub read, S10) and, when signed in, notifications every 60 s. That is about 6.5 requests a minute (0.108 req/s per tab). With nothing live the live strip still polls every 60 s, plus stories and availability: 3 a minute (0.05 req/s per tab). Hidden tabs do not poll.
- Estimate (my arithmetic, not a measurement). "5,000 active users" is read as the number who use the app in the window, not who are on the page at once, so I state concurrency:
  - Typical evening, 5 to 10% concurrent = 250 to 500 tabs: no match live 12 to 25 req/s; a match live 27 to 54 req/s.
  - Derby peak, 25 to 40% concurrent = 1,250 to 2,000 tabs, all polling at the live rate: 135 to 217 req/s.
  - On top: page loads. A kick-off surge of 1,000 loads in 5 minutes is 3.3 loads/s, and each home load adds 5 SSR reads (S7), about 17 req/s.
  - Upper bound if all 5,000 were on Home at once (not a realistic case): 250 idle, 540 live.
- Where: `src/components/matches/use-live-matches.ts:21-22`; `src/lib/match-refresh.ts:101-113` (30 s live, 60 s idle); `src/components/home/HomeStories.tsx:19-20`; `src/services/use-fantasy-availability.ts:62-66`; `src/services/use-my-notifications.ts:19,39`; `src/routes/index.tsx:253`; `src/routes/matches.$matchId.tsx:220`; `src/services/query-client.ts:62-72`.
- Why it matters to fans: The peak coincides with kick-off and goals. If the database slows at 20:00 on a derby night, every fan's score freezes together.
- Severity (re-justified): Medium at 5,000 active users. 135 to 220 simple RPC reads per second is within what a normal hosted Postgres API handles, but I do not know the compute size and the load is entirely uncached. It becomes High if the audience grows about five times (about 1,000 req/s at derby peak) or if the RPCs behind the live strip are slow; the cost of being wrong is a visible outage at the worst moment. Effort: M (short-TTL cache for the live-list RPC; drop the Fantasy hub from the 60 s poll, S10).
- Proof: grep results for `refetchInterval` in the files above; no `.channel(`/Realtime use outside admin screens; rates = intervals in those files.

### S9. Clients poll every 30 s but the server only writes new data every 120 s
- What: The live job currently runs every 120 seconds (`live_interval_seconds` ships at 120 until the 10 Nov reset; stretches to 180 s or more past the soft limit). The browser asks for the live list every 30 s. Three of four live polls return unchanged data. When the interval goes back to 60 s on 10 Nov, one of two will.
- Where: `supabase/migrations/20261026143000_rapidapi_budget_guard_and_poll_schedule.sql:17-18,60-61` (default 120 and comment); `src/lib/match-refresh.ts:57-59,110-113`.
- Why it matters to fans: No visible difference to the fan; it is wasted load and battery (S8).
- Severity: Low to Medium. Effort: S (ask the database for its effective live interval and set the browser's poll to match; or send a `last_changed` marker).
- Proof: migration lines above; client intervals above.

### S10. Public RPC polls for a visitor with no Fantasy team
- What: `useFantasyAvailability` runs on Home and on every Fantasy route for every visitor, every 60 s, and the query is the full Fantasy hub (`cloud.getHub`). Its answer is only used to decide whether to show a create-team call to action.
- Where: `src/services/use-fantasy-availability.ts:62-66`; `src/services/fantasy-runtime.ts:250-253,427-430`.
- Why it matters to fans: Slower Home on weak connections and database load for something that rarely changes (Fantasy opens and closes a few times a season).
- Severity: Medium. Effort: S (staleTime of 5 minutes, no interval).
- Proof: file lines above.

### S11. Sportmonks and Flashscore code is still wired in, and the database default points at Sportmonks
- What: Production football data comes from SofaScore, but `app_private.football_data_source_settings` is created with the value `sportsmonks` as the default (the comment says "sportsmonks (default)"). If that row is ever reset, the live job would call Sportmonks (unpaid) and fail. The hourly Fantasy orchestrator also falls back to running Sportmonks steps when it cannot read the switch (fail-safe by design), and then needs `SPORTSMONKS_API_TOKEN`. Two daily scheduled workflows still target Sportmonks but are gated by repo variables (`SPORTSMONKS_CHECKS_ENABLED`, `FOOTBALL_CURRENT_SCHEDULE_ENABLED`); I cannot see those variables' values.
- Where: `supabase/migrations/20261011090000_football_data_source_switch.sql:32,45-46`; `supabase/functions/_shared/football-live-refresh.ts:144-160,235` (default source path); `scripts/backend/read-football-data-source.ts` (fail-safe); `.github/workflows/gate2e-sportsmonks-current-season-readiness.yml:3-6,29-37`, `football-current-season-recovery.yml:22-23,41-44`, `fantasy-season-orchestrator.yml:134-160`.
- Why it matters to fans: Low today. It is a trap: a database reset or restore to a state where the switch row is the default would silently send live scores to a provider that cannot answer.
- Severity: Low to Medium. Effort: S (change the default to `sofascore` in a new migration; no migration edit).
- Proof: lines above.

### S12. Sportmonks/Flashscore dead code is large (inventory in its own section below)
- What: About 8,600 lines of Edge Function code (`football-ingest` and `_shared/sportsmonks-*`), 24 workflows, around 90 scripts, 33 migrations, 117 test files under `supabase/tests`, and 209 files that mention Flashscore (mostly the player-identity mapping tool in `src/backend/football/identity/` and `src/components/admin/player-mappings/`). Nothing here runs per fan visit. Cost is review time, build and CI time, and risk of someone running a dead workflow.
- Severity: Low. Effort: L. See "Leftover Sportmonks / Flashscore" below for what is safe to delete.
- Proof: counts in that section.

### S13. News topic fallback pictures are one size (1440 x 810) for every screen
- What: The fallback article pictures (for stories without their own photo) are shipped as a single WebP per topic, 15 KB to 156 KB (`topic-fans.webp` 156,236; `topic-stadium` 101,188; `topic-matchday` 71,322; `topic-goal` 63,370), and rendered with `width="1440" height="810"`, no `srcset`. Home shows three at once on a ~350 px wide phone. They are lazy-loaded and cached forever (`/assets/*`), so this is a one-time cost per picture. Club crests, by contrast, are well done (Supabase render URLs with 64/96/128 px `srcset`, lazy).
- Where: `src/components/common/ArticleHeroFallback.tsx`; `src/assets/news/topics/*.webp`; live home HTML `<img src="/assets/topic-goal-BEYxjzf1.webp" ... width="1440">`.
- Why it matters to fans: Up to 150 KB for a picture drawn at a quarter of that width.
- Severity: Low. Effort: S (generate an 640 px variant and add a `srcset`).
- Proof: file sizes above; HTML snippet from the live page.

## Sofascore call estimate (table + assumptions)

### Every path that can reach RapidAPI (verified in code)
| # | Path | Trigger | Gate | User-triggerable? |
|---|---|---|---|---|
| 1 | Edge `football-live-refresh` job `fixtures` (live feed) | pg_cron `football-live-refresh` every minute, but only calls the function per cadence (`football-live-cadence.ts`) | switch `football_live_refresh_enabled` and source = sofascore; budget guard | No |
| 2 | Same function, job `season_fixtures` | pg_cron `football-season-refresh` every 10 min; fires hourly if a fixture is within a day, else every 3 h (03:00 UTC daily full pass) | same switch (`20261026143000`:440-516) | No |
| 3 | job `rating_polls` | pg_cron `fantasy-rating-polls` every 5 min, only if a poll is due | same switch, source sofascore | No |
| 4 | job `catalog_weekly` | pg_cron `football-catalog-weekly`, Sundays 04:17 UTC | same switch (`shadow` writes nothing) | No |
| 5 | job `match_details_backfill` | none (no cron, manual call only) | scheduler token | No |
| 6 | Staged stats pulls (inside the live job) | live tick, 2 pulls per tick max | `fantasy_staged_stats_configure` (ships off); stops at 8,500 | No |
| 7 | Standings (inside the live and season jobs) | after a match is written as finished; once a day in the season pass | same | No |
| 8 | 15 manual GitHub workflows (S2) | `workflow_dispatch` only | owner dispatch, no counter | No (owner only) |

User-visit risk: none found. The Edge Function has `verify_jwt = false` (`supabase/config.toml:406-409`) but checks `x-botolago-scheduler-token` in-process with a constant-time compare before anything else (`scheduler-token.ts:36-58`); no browser code invokes it (`grep functions.invoke` shows only news/photo upload functions); no migration grants a user-facing function that calls `invoke_scheduled_function`. Browser data comes from the database only. So the call count does not depend on the number of users.

### Estimate for a 30-day window (assumptions stated)
Assumptions: 16 clubs, 8 matches per round, 4 rounds per window, 3 kick-off slots per round (the repo's own docs use 3 and 5; 5 slots adds about 120 calls per round at 60 s). A live match lasts about 110 minutes. Live poll interval 120 s (the shipped default until the 10 Nov reset) and 60 s afterwards. Per-match cost 29 requests and per-slot costs are from `docs/backend/SOFASCORE_LIVE_EDGE.md:457-466`; I re-derived the slot costs (T = 120: 2+1+55+1+4 = 63; T = 60: 118). Rating polls and staged pulls are my own estimate. These are arithmetic on assumptions, not a measurement.

| Lane | Per day (match day / quiet day) | Per 30 days, typical | Notes |
|---|---|---|---|
| Live feed + details, interval 120 s | per slot 63; per match 29 | 4 x (3 x 63 + 8 x 29) = **1,684** | at 60 s: 4 x (3 x 118 + 8 x 29) = **2,344** |
| Season refresh (2 requests per run) | 48 (hourly) / 16 (3-hourly) | 4 busy days x 48 + 3 quiet x 16 per week = 240/week, x 30/7 = **1,028** | a "busy" day is any day within 24 h of a fixture |
| Daily full-season pass (extra pages) | about 6 to 22 | **180 to 660** (I use 240) | up to 12 pages per direction, stops when no next page (`sofascore-live-refresh.ts:651-665`, `SEASON_FULL_MAX_PAGES_DEFAULT = 12`) |
| Standings | about 1 per finished slot + 1 daily | **about 50** | |
| Rating polls (lineups, marks at 15 min ... 14 d) | 0 to 9 per fixture | **about 160** (5 per fixture x 32); worst 288 | docs say about 3 |
| Staged stats (if switched on; ships off) | 3 requests per pull | **480** average, **672** worst (docs) | not counted in the doc's live model |
| Weekly catalog (16 squads + images) | Sunday only | **about 90** | 16 squads x 4 + about 16 crests the first time, then 28-day recheck |
| Manual workflows (S2) | n/a | 0 to several hundred, uncounted | depends on what staff run |
| **Total, interval 120 s (now)** | | **about 3,700** (3,300 to 4,300) | 37% of 10,000 |
| **Total, interval 60 s (after 10 Nov)** | | **about 4,400** (4,000 to 5,000) | 44% |
| **Pessimistic** (60 s, 5 slots, quiet-day pages 22, ratings 288, staged 672, catalog 130, 300 manual) | | **about 6,300** | 63% |

Reading: the steady-state design fits the 10,000 plan with room (3,700 to 6,300). The failures so far were not the design; they were the old code paths (25 Oct: 4,000 calls for 2 matches, fixed by `20261026143000`) and uncounted callers (S2). Whether the live system is healthy today depends on the real counter, which I could not read (S1). The model above also relies on the migration `20261026143000` being applied and on `football-live-refresh` being deployed with it; I could not check either.

Does it depend on the number of users? No. Every call is scheduled by pg_cron or started by the owner.

| Scenario | Calls per 30 days |
|---|---|
| At 5,000 active users | Same as now (no per-user calls). Proof: no browser or user-callable function reaches RapidAPI; `football-live-refresh` has `verify_jwt = false` (`supabase/config.toml:406-409`) but rejects any request without the scheduler token before touching the database (`supabase/functions/_shared/scheduler-token.ts:36-58`), and no browser code invokes it (`grep functions.invoke` shows only news and photo upload functions). (FIXED 5) |

## Leftover Sportmonks / Flashscore (inventory)

Counting method: case-insensitive `sportsmonks|sportmonks` over the whole repo (excluding node_modules, .git, build output) gives **378 files**; `flashscore` gives **209 files**. Both are higher than the figure the Lead gave (about 35 / 150), because tests, docs, SQL apply scripts and the spelling "sportmonks" are included. By area (Sportmonks / Flashscore): `scripts` 88/7, `supabase/tests` 53/9, `docs` 53+/32, `supabase/migrations` 33/8, `supabase/functions` 30/5, `.github/workflows` 24/3, `src` 28/87 (Flashscore mostly `src/backend/football/identity` 47 files and `src/backend/fantasy` 23).

### Still running or scheduled (not dead)
- `football-live-refresh` still contains the Sportmonks branch and runs it when `api.football_data_source()` = `sportsmonks` (the DB default, S11): `supabase/functions/_shared/football-live-refresh.ts:31-32,144-160`. It also holds the setting-less fallbacks `FOOTBALL_PROVIDER: "sportsmonks"` (`:111-113`).
- The six SofaScore modules import TYPES from `_shared/sportsmonks-fixtures.ts` (`FixtureRpcClient`, `FixtureRpcResult`): `sofascore-catalog.ts:35`, `sofascore-fantasy-auto.ts:89`, `sofascore-live-refresh.ts:83`, `sofascore-match-details.ts:46`, `sofascore-staged-stats.ts:44`, `sofascore-standings.ts:19`. So `sportsmonks-fixtures.ts` cannot be deleted; those types must be moved to a neutral file first.
- Hourly `fantasy-season-orchestrator.yml` (schedule `12 * * * *`) reads the source and skips Sportmonks steps while SofaScore is the source; it falls back to Sportmonks when it cannot read the switch (`:134-160`).
- Daily, gated by repo variables whose values I cannot see: `gate2e-sportsmonks-current-season-readiness.yml` (06:17 UTC, needs `SPORTSMONKS_CHECKS_ENABLED == 'true'`) and `football-current-season-recovery.yml` (07:43 UTC, needs `FOOTBALL_CURRENT_SCHEDULE_ENABLED == 'true'`; it calls Sportmonks, `:88,108`).
- pg_cron: no job calls `football-ingest`. The only provider-facing cron jobs are the SofaScore ones above.
- Edge `football-ingest` (Sportmonks catalog, fixtures, historical content/performance, ratings; 5 handlers) is deployed with `verify_jwt = true` (`supabase/config.toml:374-377`): callable by an authenticated caller, not scheduled.
- Secrets/env names: `SPORTSMONKS_API_TOKEN` (23 workflows and scripts, `.env.example:56`), `FOOTBALL_SPORTSMONKS_*` (`.env.example:57-64`), `FOOTBALL_LIVE_LEAGUE_ID/SEASON_ID`. For Flashscore only the RapidAPI key plus host `flashscore*.p.rapidapi.com`, allowed in `supabase/functions/_shared/rapidapi-client.ts:32` (`allowedHosts`) and used by the manual mapping workflows.
- DB objects: provider name rows `'sportsmonks'`/`'flashscore'` in `football_provider_mappings`; the `football_data_source` enum value; `20261001150000_register_sofascore_flashscore_providers.sql` registers Flashscore; mapping tables `20261001160000_*`; reconciled provider observations `20261003180000_*`. These hold production data and history: leave them.

### Dead code (nothing scheduled or user-facing runs it)
- Edge: `supabase/functions/football-ingest/` (index.ts) and `_shared/sportsmonks-{catalog,historical-content,historical-player-performance,player-ratings,match-details}.ts` plus their tests. Roughly 8,600 lines including `sportsmonks-fixtures.ts` and tests.
- Workflows (manual or push-by-ticket-file only): `gate2b`, `gate2c`, `gate2d`, `gate2f`, `gate3a`, `gate3b`, `gate4`, `g5-*` (2), `g7-*` (4), `football-current-{finished-performances,player-list,roster-audit}`, `pepites-historical-identity-report`. Several have `push:` triggers on trigger-ticket JSON files under `docs/production/` and need a commit to fire, so they are dormant, not scheduled.
- Scripts: the `scripts/backend/sportsmonks-*.ts` probes, `g5-*`, `g7-*`, `gate4-*`, `current-season-*`, `current-player-list.ts`, `write-gate4-function-secrets.ts`, and the many one-off `apply-2026*.sql` files.
- App: `src/backend/football/provider/sportsmonks-adapter.ts` (770 lines) and `sportsmonks-config.server.ts`. The `provider/` folder is imported only by scripts and tests (`rapidapi-config.server.ts` has no importer in `src`).
- Comments only: `StatComparison.tsx:64`, `PressureChart.tsx:22`, `match-freshness.ts:56`, `use-club-catalogue.ts:10` mention Sportmonks in comments. Check `PressureChart`: the "Pressure Index" is a Sportmonks add-on, so it likely never has data under SofaScore (question Q5).
- Flashscore: the player-identity mapping tool (`src/backend/football/identity/*flashscore*`, `src/components/admin/player-mappings/flashscore-manifest.ts`, bulk mapping, `docs/production/manifests`) is admin-only staff tooling. It is not dead if staff still map players; it is a decision for the owner.

### Safe to delete now (no migration, no behaviour change)
1. The dormant workflows listed above and their scripts, after the owner confirms the two repo variables are unset.
2. `supabase/functions/football-ingest/` and the five `_shared/sportsmonks-*` handler files plus tests, after removing it from `supabase/config.toml` and un-deploying the function in Supabase (that part is a deployment, which AGENTS.md says needs the owner's approval).
3. `src/backend/football/provider/sportsmonks-*` and their tests.
4. `.env.example` Sportmonks lines.
### Needs care or a migration
- Move the shared types out of `sportsmonks-fixtures.ts` (rename, not delete) before removing it.
- Remove the Sportmonks branch of `football-live-refresh` only after setting the switch default to `sofascore` in a new forward migration (never edit an applied migration; `CLAUDE.md`). Keep `shadow` if still wanted.
- Do not touch migrations that mention Sportmonks (33 files): they are applied history. DB values (provider names, mapping rows) stay.
- Orchestrator fail-safe (`scripts/backend/read-football-data-source.ts`) should be flipped to "skip" only together with the default change.

## Performance baseline for Phase 2 (FIXED 4)

How measured: Lighthouse is not installed here, so I used Playwright with the sandbox's Chromium (`/opt/pw-browsers/chromium-1243`) on a mobile profile (412x823, DPR 2.625, touch), CDP CPU throttling 4x, network latency 150 ms, upload 750 kbit/s, cold cache, median of 3 runs. The page is the repo's own production build served by `tests/e2e/built-output-serve.ts` on port 4318 with its stub backend on 4319 (the repo's harness, used in place of `vite preview` because the build is a Cloudflare Worker module; built from this tree with `bun tests/e2e/built-output-build.ts`). The script is `scratchpad/perf.cjs` (not in the repo). No Performance score: that needs Lighthouse. Treat the numbers as a relative baseline, not as what production shows.

Limits of this run:
- The stub backend has no data: no matches, clubs, players, news or standings. Pages rendered their empty states (Home 1.6 k characters of text, Matches 0.6 k, Standings 0.9 k, Fantasy hub 1.7 k, the player page only the "Joueur" shell, 0.3 k). LCP on a populated page will differ. `/pepites/joueur/1` returned a 404, so I used `/fantasy/players/1` as the player page.
- The local server sends files uncompressed, so "transfer" and "JS" below are uncompressed (about 3x what production sends; production serves gzip). Run A uses 1.6 Mbit/s (Lighthouse "Slow 4G" bandwidth) and is therefore too pessimistic. Run B raises the bandwidth to 5.3 Mbit/s (1.6 Mbit/s times gzip's roughly 3.3x) to approximate production. Use B as the baseline.
- 4x CPU throttling on a sandbox core is roughly a low-end phone, not a measured one.

| Page | Run B: FCP | Run B: LCP | Run B: load event | Transfer (uncompressed) | JS (uncompressed) | Run A: LCP (1.6 Mbit/s, no gzip) |
|---|---|---|---|---|---|---|
| `/` | 2.0 s | 2.6 s | 6.6 s | 2,385 KB | 1,736 KB | 7.3 s |
| `/matches` | 1.9 s | 2.1 s | 5.4 s | 2,162 KB | 1,742 KB | 6.7 s |
| `/matches/standings` | 1.8 s | 6.6 s | 5.3 s | 2,117 KB | 1,750 KB | 13.5 s |
| `/fantasy/players/1` | 1.9 s | 7.7 s | 5.9 s | 2,006 KB | 1,675 KB | 13.5 s (that run hit a 404 page) |
| `/fantasy` | 1.9 s | 9.1 s | 6.3 s | 2,189 KB | 1,777 KB | 15.7 s |

Observations: JS is about 1.7 MB uncompressed on every page, the shared app shell (about 400 KB gzip by the production build figures in S4). LCP comes 4 to 7 s after FCP on Standings, Player and Fantasy even with empty data, which suggests the largest element appears late (after a client query or the launch splash); I did not trace why. Suggested Phase 2 targets (my proposal): Home LCP under 2.5 s on Slow 4G with gzip, JS under 300 KB gzip on Home; rerun real Lighthouse on staging with data before and after.

## What I checked and found fine

- No RapidAPI/Sofascore call can be started by a fan visit or by any logged-in user. The only entry points are pg_cron through the scheduler token and manual GitHub workflows (table above). `football-live-refresh` checks the token before touching the database (`scheduler-token.ts:36-58`, timing-safe).
- Server-side budget design is sound once the real figures are right: soft limit allows only live feed and incidents; hard limit sends nothing; polls stretch to 180 s over the soft limit; provider-reported quota is now a floor (`20261027100000`); each request is counted per job and endpoint, retries included; the client does not retry a 429 (`rapidapi-client.ts:12-14`).
- The 25 Oct root cause (rating candidates waking the live tick every 60 s) is removed: rating polls are on fixed back-off marks and no longer wake the live tick (`20261026143000`:48-60,170-215).
- Scores, fixtures, standings and details are written to the database and served from it. No browser or Worker code calls a sports provider.
- Static assets: `/assets/*` is `max-age=31536000, immutable` and gzip (checked live on CSS and JS). Images in `src/assets` are WebP, the home hero has a 800/1600 `srcset` with `fetchpriority=high` and a matching preload; club crests use Supabase image rendering at 64/96/128 px and lazy loading. The 3.3 MB `public/demo/app.html` is only loaded by `/demo` (`src/routes/demo.tsx`).
- Arabic dictionary is already on demand (not in the entry bundle), and the Arabic and Latin font files use `unicode-range` so a French reader does not fetch the Arabic subset.
- Big admin-only chunks (`PlayerMappingsScreen` 501 KB, `sanitizer` 231 KB, `SofascorePlayerQueueScreen`) are not in the home preload list.
- Analytics: the Seline script is `async` and told not to track page views on its own; the two other scripts are `defer`.
- Query defaults: `staleTime` 15 s globally, 10 min for the season catalog (`query-client.ts:62-75`), 5 min for many catalog reads; all interval polls set `refetchIntervalInBackground: false`, so hidden tabs do not poll. No Realtime subscriptions or websockets in fan-facing code.
- HTML page itself is small: 25.7 KB gzip (179 KB raw, 46 KB of that is serialised router state).

## What I could not check and why

- Live database contents: the current `football_data_source`, `rapidapi_budget_settings` (soft/hard limit, live interval, reset day, offset), `rapidapi_call_counts`, the last month's real calls, which cron jobs are active, whether migrations `20261026143000` and `20261027100000` are applied, staged-stats and Fantasy-worker switches. No database access was allowed.
- The RapidAPI dashboard (plan, usage, reset date) and the Edge Function logs.
- GitHub repository variables (`SPORTSMONKS_CHECKS_ENABLED`, `FOOTBALL_CURRENT_SCHEDULE_ENABLED`) and secrets: not visible from here.
- Lighthouse (not installed; see the baseline section for the Playwright substitute and its limits) and TTFB from Morocco. Server timings are from a US sandbox. Page-weight figures in S4 come from the production build output and the live HTML; the baseline section uses a stub-backend build.
- Supabase capacity: I do not know the compute size, so the 250 to 560 requests per second figure is a load estimate, not a pass/fail.
- Supabase Storage image headers (crest URLs on `supabase.co`): outside "botolago.com pages", so I did not request them.
- Live bundle vs my build: live release 171479f is 4 merge commits behind HEAD; five newest chunks have different hashes, so byte totals could differ by a few percent.

## Questions for the Lead

1. Q1 (blocks S1): Can the owner open the RapidAPI dashboard and tell us today's used/remaining and the real reset date? If it is at or near 0, live data is blocked by our own guard until the 10th. Is a plan upgrade or a temporary raise of limits acceptable, and who may run `app_private.rapidapi_budget_configure` (AGENTS.md says production writes need the owner)?
2. Q2: Should the Phase 2 plan assume interval 120 s until 10 Nov then 60 s? The browser poll rate (S9) depends on it.
3. Q3: Are the repo variables `SPORTSMONKS_CHECKS_ENABLED` and `FOOTBALL_CURRENT_SCHEDULE_ENABLED` set? If either is `true`, a daily workflow still calls Sportmonks.
4. Q4: Is Sportmonks cancelled for good? If yes, is the owner willing to approve (a) a forward migration changing the data-source default to `sofascore`, (b) un-deploying `football-ingest`? Both are deployments per `AGENTS.md`/`CLAUDE.md`.
5. Q5: Does the match page "Pressure" chart and the expected-goals row (Sportmonks add-ons) show anything under SofaScore? If not, they are a dead UI block (the Pulse/Stats lane should check).
6. Q6: Is the player-identity mapping tool (Flashscore + SofaScore) still in active use by staff? It accounts for most "flashscore" files, and deleting it is a product decision.
7. Q7: Worker cost of rendering HTML on every visit is invisible from the repo (Lovable hosting on Cloudflare Workers; plan and bill not visible). Is it a concern?
8. Q8: Does Lovable's publish pipeline honour a `public/_headers` file and a `s-maxage` on HTML? Only Lovable (or a test publish by the owner) can answer; it decides how S5 and S7 are fixed.
