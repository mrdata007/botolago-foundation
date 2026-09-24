# BotolaGO audit — Performance stream

Date: 2026-09-24 (all times UTC). Live site: https://botolago.com. Repo branch: claude/quirky-faraday-e8xnss.
Artefacts: `scratchpad/shots/performance/` (Lighthouse JSON+HTML under `lh/`, waterfall JSON per page, screenshots, `lighthouse-summary.json`, `waterfall-summary.json`, `inp-proxy.json`, `slow3g-*.json`). Scripts: `/home/user/botolago-foundation/.audit-tmp/perf/`.

## 0. Read this first — measurement conditions and the contention incident

Every number in this report is labelled with its UTC time and whether other audit streams were active, because **the audit itself saturated the production database between ~16:20 and ~16:50 UTC**, and measurements taken in that window measure our own contention, not the site.

Evidence (Supabase `query_logs`, project `tkewgajrljbwgwedqsxn`; first pulled 16:40–16:47, final pull 17:32 UTC covering 12:00–17:31):

Postgres `canceling statement due to statement timeout` per hour (postgres_logs):

| hour (UTC) | 23 Sep 16:00 … 24 Sep 12:00 | 13:00 | 14:00 | 15:00 | **16:00** | 17:00 (to 17:31) |
|---|---|---|---|---|---|---|
| timeouts | 0 every hour | 1 | 10 | 5 | **601** | 32 |

PostgREST `/rest/v1/rpc/*` per hour (edge_logs):

| hour | calls | HTTP 500 | p50 origin ms | p95 origin ms |
|---|---|---|---|---|
| 23 Sep 16:00–24 Sep 07:00 (each) | 163 | 0 | 96–168 | 312–501 |
| 08:00 | 1,400 | 0 | 97 | 332 |
| 09:00 | 2,236 | 0 | 104 | 452 |
| 12:00 | 235 | 0 | 47 | 554 |
| 13:00 | 414 | 1 | 128 | 1,085 |
| 14:00 | 397 | 7 | 108 | 1,408 |
| 15:00 | 1,016 | 2 | 154 | 1,230 |
| **16:00** | **7,451** | **567** | **191** | **10,410** |
| 17:00 (to 17:31) | 4,664 | 36 | 130 | 1,509 |

Per 5-minute bucket, `/rest/v1/*` (edge_logs, 15:00–17:31):

| bucket | calls | 500s | p50 ms | p95 ms | what was running |
|---|---|---|---|---|---|
| 15:00 | 167 | 0 | 163 | 492 | other streams only |
| 15:10 | 70 | 0 | 303 | 3,430 | |
| 15:15 | 156 | 0 | 86 | 1,899 | |
| 15:20–15:40 | 18–48 | 0–2 | 57–312 | 391–2,121 | |
| 15:45 | 141 | 0 | 52 | 733 | |
| 15:50 | 148 | 0 | 116 | 1,271 | |
| 15:55 | 244 | 0 | 149 | 704 | |
| 16:00 | 608 | 0 | 154 | 980 | |
| 16:05 | 1,052 | 1 | 159 | 1,188 | |
| 16:10 | 333 | 0 | 124 | 711 | |
| 16:15 | 699 | 0 | 162 | 881 | |
| 16:20 | 596 | 28 | 231 | 3,636 | |
| 16:25 | 411 | 3 | 163 | 1,081 | this stream starts (curl TTFB loop, discovery) |
| 16:30 | 597 | 69 | 428 | 7,351 | + Lighthouse smoke + waterfall |
| 16:35 | 715 | 170 | 1,948 | 14,519 | + Lighthouse run 1 + waterfall batch, other streams' browsers |
| 16:40 | 565 | 170 | **5,482** | **26,855** | same; `get_advisors`/`pg_stat_statements` dashboard queries also ran (10–16 s each) |
| 16:45 | 484 | 121 | 3,232 | 18,682 | lead warned; other streams pausing |
| 16:50 | 548 | 3 | 170 | 1,009 | Lighthouse run 1 tail only |
| 16:55 | 871 | 2 | 128 | 874 | quiet probes |
| 17:00 | 1,063 | 2 | 132 | 1,434 | Lighthouse run 2 (sequential, 8 s pauses) |
| 17:05 | 929 | 0 | 125 | 864 | run 2 |
| 17:10 | 1,040 | 9 | 118 | 1,332 | run 2 + INP/slow-3G |
| 17:15 | 730 | 25 | 142 | 3,149 | slow-3G + INP; other streams resuming |
| 17:20 | 429 | 0 | 145 | 623 | |
| 17:25 | 360 | 0 | 127 | 482 | |
| 17:30 | 158 | 0 | 132 | 1,507 | |

Reading it: ~3 RPC/s from one sequential Lighthouse run (17:00–17:10) keeps p95 at 0.9–1.4 s with a handful of 500s — that is the ceiling. Two or three browsers plus a few curl loops (16:30–16:45, still only ~2 RPC/s but with more of the heavy `news_feed`/`matches_by_date` calls in flight at once and dashboard queries on top) took p50 to 5.5 s and p95 to 27 s, and 567 requests failed in the hour.

Who generated the load (edge_logs, `/rest/v1/*`, 13:00→16:47, by user agent): headless Linux Chrome 5,191 calls / 334 × 500 (p95 7.9 s) — Lighthouse and Playwright from several streams; Pixel 6 / moto g / iPhone-emulated UAs 85–151 calls each with p95 19–21 s; `curl/8.5.0` 101 calls; empty UA 645 calls / 38 × 500. Real visitors (macOS Chrome 656 calls, iOS Safari 342/81 calls, Instagram in-app 32 calls) were on the site during the window; the iOS 17.5 UA saw 21 × 500 with p95 21 s.

Why it collapses so easily (VERIFIED): the production database is a **Micro-class instance** (`shared_buffers = 224MB`, `effective_cache_size = 384MB`, `max_connections = 60`, `max_parallel_workers = 2`, `work_mem = 2184kB` — `SHOW`-level settings read via `execute_sql` at 16:41), PostgREST runs the RPCs as `anon` with `statement_timeout = 3s` and as `authenticated` with `8s` (`pg_roles.rolconfig`), several hot RPCs cost 0.2–0.7 s of CPU each when idle (section 4), and every page issues 4–13 RPCs (section 3). Roughly **2 RPC/s sustained (7,451 calls in the 16:00 hour) was enough to push p95 to 10.4 s and produce 601 statement timeouts / 567 HTTP 500s**, and ~3 RPC/s from a single sequential Lighthouse run already sits at p95 ≈ 1–1.4 s. A single Botola matchday with a few hundred concurrent visitors will do the same. This is the headline capacity finding (F-01).

Actions taken: the lead was warned at 16:47; other streams paused/throttled until ~17:00. My matrix was re-run sequentially from 16:56 (run 2) with 8 s pauses; where a measurement was taken under contention it is marked **[contended]**, and quiet-window re-measurements are marked **[quiet]**.

The environment also shapes some Lighthouse audits: the container's egress goes through a TLS-intercepting proxy, so Chrome negotiates HTTP/1.1 (Lighthouse "modern-http" insight reports 5.9 s of savings — an artefact; `curl` to the origin gets HTTP/2), and Google Fonts occasionally failed through the proxy. HTTP/2-dependent numbers are therefore not reported as findings.

## 1. Scorecard (0–100, my suggestion)

| Area | Score | Why |
|---|---|---|
| Performance (desktop) | 62 | Desktop Lighthouse 85–97 on shell pages when the DB is quiet, but every page's content arrives 1–3 s after the shell via 4–13 client RPCs; article/match SSR depends on DB latency; sitemap and catalogue queries have no caching. |
| Mobile performance | 38 | Mobile Lighthouse 33–52 across all pages even with a quiet DB: ~400 KB gzip / 1.27 MB of JS on every route, TBT 0.6–1.0 s, first-visit LCP is the language chooser image discovered only after hydration (10.2 s), CLS 0.41 on /news. |
| Backend capacity / resilience | 25 | Micro instance, 3 s anon timeout, 0.6 s mean CPU per `/matches` query, no server-side caching; audit read traffic alone (~2 RPC/s) produced 601 statement timeouts and 567 × HTTP 500 in one hour. |

## 2. Findings, ranked by impact

### F-01 — Production DB has no headroom: ~1.5 read-RPC/s produces statement timeouts and HTTP 500 on the home page
- Severity: **P0** — Confidence: VERIFIED
- Location: Supabase project `tkewgajrljbwgwedqsxn` (Micro compute), roles `anon` (`statement_timeout=3s`), `authenticated` (`8s`); RPCs `api.news_feed`, `api.football_matches_by_date`, `api.football_home_matches`, `api.news_related_articles`, `api.news_sitemap_entries`.
- Evidence: tables in section 0. Caught response at 16:39 (`curl POST /rest/v1/rpc/news_feed {"p_language":"ar","p_limit":50}`): `HTTP 500 {"code":"57014","message":"canceling statement due to statement timeout"}`, `x-envoy-upstream-service-time: 7987`. Home page waterfall 16:38 [contended]: `football_home_matches` 500 after 6.6 s, `news_feed` fr 500 after 7.3 s, `news_feed` ar 500 after 12.5 s, `football_live_matches` 200 after 16.8 s for a 2-byte `[]`. `EXPLAIN ANALYZE select api.news_feed('fr',50)` = 3,617 ms at 16:37 [contended] vs 239 ms at 16:55 [quiet] with identical buffer counts (4,378 shared hits) — pure CPU starvation, not I/O.
- Current behaviour: under modest concurrency the home page renders empty "En direct & à venir" / news sections and console errors; React Query retries (3× with back-off) multiply the load (the club page issued `news_feed` ×3, `football_team_fixtures` ×2, `football_competition_fixtures` ×2, `football_standings` ×2 in one load).
- Expected: p95 < 500 ms at 10× this load; a failing RPC should not be retried into a saturated DB; hot read paths should be cached.
- Root cause: (a) compute tier far too small for 15.8k-article News + per-request JSON assembly in plpgsql; (b) no HTTP cache layer between browsers and PostgREST (every visitor hits Postgres for identical public payloads); (c) query design that does per-call catalogue scans (F-04) and per-row function calls; (d) retries without jitter/circuit-breaking.
- Fix: upgrade compute (Small/Medium is the minimum for launch), add `Cache-Control`/edge caching for anonymous public RPCs (PostgREST supports `Cache-Control` via `response.headers`, or route public reads through a server function with a 30–60 s cache), fix F-04/F-05, set `retry: 1` with `retryDelay` jitter for read queries, and put a synthetic check on `news_feed` p95. Complexity: M (compute + caching) / L (query rework).

### F-02 — First-visit mobile LCP is a client-only onboarding layer (splash → language chooser → WelcomeScreen) rendered after hydration: home LCP 10.2–10.6 s, 6.6–17 s on every other page
- Severity: **P1** — Confidence: VERIFIED
- Location: `src/routes/index.tsx:97-105` (`showWelcome = mounted && status === "anonymous" && !hasWelcomed()` replaces the SSR'd home with `<WelcomeScreen>`; key `localStorage["botolago.welcomed"]`, `src/lib/welcome.ts`), `src/components/welcome/WelcomeScreen.tsx:56` (`<PageBackground variant="auth" photo="welcome">` → `/assets/welcome-DtTMxlyF.webp` 1080×1920, 99.6 KB, `srcset` 720w/1080w, `fetchpriority="high"` but not in the HTML), `src/routes/__root.tsx:304-341` (`LaunchGate`: splash then `FirstLaunchLanguage` dialog), `src/i18n/provider.tsx:38-51` (`hasChosen` resolved in `useEffect` after mount).
- Evidence: Lighthouse home mobile run 1 (16:34, before contention): Performance 52, FCP 1.8 s, **LCP 10.2 s**, TBT 727 ms, SI 5.1 s. `lcp-breakdown`: TTFB 190 ms, **resource load delay 8,508 ms**, load 1,457 ms, render delay 67 ms. `lcp-discovery`: "Request is discoverable in initial document: false". Network timeline (navStart-relative): HTML done 664 ms; `index-BQJLG-CU.js` 682→3,787 ms (161 KB); `welcome-CfpUGJx6.js` (1 KB, the chooser's lazy route chunk) 724→**7,388 ms**; `welcome-DtTMxlyF.webp` requested at **8,698 ms**, done 10,152 ms. Screenshot: `shots/performance/home-mobile-fr.png` (chooser covering the page).
- Run 2 [quiet, 17:00]: Performance 48, LCP 10.6 s (resource load delay 8,108 ms), identical shape — this is not contention. And it is not only the home page: on `/matches/<id>`, `/matches/standings`, `/clubs/<id>` and `/fantasy/rankings` the mobile LCP element is the chooser's `<h2 id="radix-_r_1_">` title with 6.6–8.1 s "element render delay"; on `/fantasy` it is the chooser image again (LCP 17.4 s, resource load delay 16 s). See the LCP-element list in section 7.
- Launch sequence (`src/routes/__root.tsx:304-341` `LaunchGate`, `src/components/splash/SplashScreen.tsx:40-64`, `launch-splash.ts`): a head script shows a full-screen splash once per session (`sessionStorage["botolago.splashShown"]`, failsafe 10 s), it holds 800 ms + 350 ms fade *after first paint*, then `splashDone && isHydrated && !hasChosen` mounts `FirstLaunchLanguage` (Radix modal dialog over `PageBackground photo="welcome"`). So a first visit is: SSR shell (hidden behind the splash) → JS 400 KB → hydrate → splash leaves → chooser + its 100 KB hero → LCP. Returning visitors skip both, so field LCP will be bimodal, and Lighthouse/CrUX "first visit" numbers will always look like this.
- Current: a new visitor loads `/`, gets the SSR home shell (hidden behind the splash), 400 KB of JS hydrates it, the language chooser dialog appears, and after choosing, the home route *discards the server-rendered home* and renders the WelcomeScreen ("Explorer BotolaGO / Se connecter / Continuer en invité") with the crowd photo — the LCP. Playwright with the language pre-seeded but `botolago.welcomed` unset (17:17): `document.querySelectorAll("a[href]")` = **0 links, no `<nav>`**, body text = the welcome copy only; the seven home RPCs still fire behind it. Returning visitors skip all three layers, so field LCP will be bimodal.
- Root cause: language, splash and welcome are all client-only decisions (SSR always renders `fr`/`ltr`, `hasChosen: true`, no welcome; everything flips after mount), rendered only after hydration and the splash, with images that are not in the initial HTML.
- Fix: decide language and "welcomed" on the server (cookie or `Accept-Language`) so whichever screen the visitor will see is the one in the initial HTML; if the layers must stay client-side, render the chooser/welcome from the entry chunk before data, `<link rel="preload" as="image" imagesrcset=…>` the welcome hero (or drop it — it is decorative), and do not throw away the SSR'd home under the welcome. Complexity: S (preload/inline) / M (server-side language + welcome).

### F-03 — Every route ships ~400 KB gzip (1.27 MB) of JavaScript in 35–54 files; mobile TBT 0.6–1.0 s on every page
- Severity: **P1** — Confidence: VERIFIED
- Location: build output `.output/public/assets/` (`bun run build`, 16:32): 181 JS files, 2,196,509 B raw / 659,410 B gzip total; entry `index-BQJLG-CU.js` 522,769 B raw / 160,309 B gzip; `primitives-1x24yP0b.js` 327,062 / 92,256 (Radix primitives, 47 `radix` refs); `client-Dg2E3-J-.js` 205,573 / 52,442 (supabase-js); `use-unsaved-changes-guard-BsFH6Xz3.js` 233,257 / 92,960 (zod + sanitize-html + dayjs; loaded by admin/editorial routes only); `schemas-5lu9WtyA.js` 70,362 / 18,583 (zod, 480 refs). `__root.tsx` emits ~40 `<link rel="modulepreload">` per page.
- Evidence (waterfalls, `shots/performance/*.json`): home 51 JS / 398 KB transfer / 1,273 KB decoded; /matches 40 / 391 KB / 1,270 KB; /fantasy/rankings 35 / 375 KB / 1,231 KB; /news/<id> 43 / 392 KB / 1,266 KB; /fantasy 54 / 395 KB. Lighthouse mobile TBT: home 727 ms, /matches 950 ms, standings 804 ms, club 996 ms [contended], match 775 ms; `bootup-time` attributes 904 ms scripting to `index-*.js` on home; long tasks on home: 11 (315, 253, 184, 164, 133 ms…) mostly in `index-*.js`; `unused-javascript` 133 KB (index 71 KB, client 42 KB, primitives 22.5 KB wasted on home). INP proxy (4× CPU throttle, 16:47): home load long tasks 243 ms and 435 ms.
- Route splitting IS in place (one chunk per route: `matches._matchId` 47.8 KB, `fantasy.rankings` 12.6 KB, `admin.*` separate) and the home page does not pull admin/fantasy route chunks; the problem is the shared baseline: React 19 + TanStack Router/Query/Start + supabase-js + Radix + zod + sonner + motion + marked land on every page. The 45 KB HTML also carries ~40 modulepreload links so all of it is fetched before the entry executes.
- Sourcemap breakdown (section 6) pins the baseline: `src/i18n/dictionaries.ts` (189 KB source, **163 KB minified, both languages**) is in the shared `primitives` chunk; `@supabase/auth-js` + `realtime-js` + `phoenix` + `storage-js` = 168 KB minified in `client-*.js` although anonymous pages only need `postgrest-js` (15 KB); `src/mocks/fantasy-data.ts` (9 KB) and `src/backend/football/mock-repository.ts` (6 KB) reach production through `src/services/fantasy-owned-repository.ts:26` (`import { fantasyPlayers as mockPlayers } from "@/mocks/fantasy-data"`) and `src/services/mock.ts`, even though `VITE_*_DATA_MODE=supabase` makes them dead code; `src/backend/admin/*` contracts/errors/route-access (13 KB) are in the entry for every visitor.
- Fix: measure with the sourcemap build (section 6) and cut the baseline: lazy-load supabase-js auth only when a session exists (anonymous pages need only PostgREST fetches — a 5 KB `fetch` wrapper), move zod schemas to server-only validation for public reads, drop `sonner`/`motion` from the entry, defer `~flock.js` further (already `defer`), review the 40 modulepreloads (preload only the route's critical chunks). Target ≤ 180 KB gzip on public routes. Complexity: M–L.

### F-04 — `/matches` main query `football_matches_by_date` scans `pg_timezone_names` (1,196 rows) on every call: 0.6 s mean, up to 5.5 s, fails the 3 s anon timeout under load
- Severity: **P1** — Confidence: VERIFIED
- Location: `api.football_matches_by_date` (function body: `if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)`), migration containing it (`grep -l pg_timezone_names supabase/migrations/*.sql` → 3 files).
- Evidence: `pg_stat_statements` (since last reset): `football_matches_by_date` 1,280 calls, **608 ms mean**, 5,553 ms max, 778 s total — the single most expensive statement in the database, ahead of `news_feed` (2,546 calls, 131 ms mean). `EXPLAIN ANALYZE select 1 from pg_catalog.pg_timezone_names where name='Africa/Casablanca'`: **100.9 ms** (16:53) and **784.6 ms** (16:55) — Function Scan, 1,195 rows removed by filter. The rest of the function is cheap: candidates index-only scan on `fixtures_season_kickoff_idx` 0.12 ms; `app_private.football_match_json(fixture,'fr')` 9.2 ms/fixture. Whole function: 673 ms and 2,677 ms in two EXPLAINs [quiet-ish], returning 2 fixtures. Via HTTP [quiet, 16:52]: 1.25 s, 0.82 s, 1.26 s, and one **500 at 4.96 s** while a single Lighthouse run was in progress. Waterfall /matches [contended]: 500 after 9.9 s then a retry.
- Impact: the matches calendar — the most visited page on a matchday — is the slowest RPC on the platform and is the first to fail for signed-out users (3 s timeout).
- Fix: validate the timezone with `p_timezone` against a tiny allow-list, or `begin perform now() at time zone p_timezone; exception when invalid_parameter_value then raise …; end` (no catalogue scan); cache `football_match_json` output or precompute a `fixtures_json` column updated by the ingest; add `Cache-Control` for anonymous callers. Complexity: S (timezone check) / M (JSON cache).

### F-05 — Home page issues 7 RPCs (13 in Arabic) including two `news_feed` × 50 articles to render three cards; SSR-loaded pages refetch on the client
- Severity: **P1** — Confidence: VERIFIED (calls) / LIKELY (refetch cause)
- Location: `src/routes/index.tsx:149-208` (nine `useQuery`s), `src/services/news.ts:337-366` (`getNewsEdition` with `selection === "auto"` fetches `[preferredLanguage, otherLanguage]` at `limit: 50` in parallel, then `getHomeModules`), `src/router.tsx` (fresh `QueryClient` per side, no dehydrate/hydrate bridge — documented in `src/routes/matches.$matchId.tsx:47-64`), `src/services/query-client.ts` (`staleTime: 15_000`).
- Evidence (waterfall JSON): home FR: `football_live_matches`, `fantasy_hub` (signed-out), `football_home_matches`, `news_feed(fr,50)`, `news_feed(ar,50)`, `football_team_catalog(100)`, `football_season_catalog(12)`; `news_feed` returns 57–65 KB JSON per language (15 KB gzip) for a section that shows a handful of cards. Home AR: all seven fired for `fr` first (server renders French, client flips to `ar` after mount) then six again for `ar` — **13 RPCs**, duplicates `news_feed(fr)`×2 and `news_feed(ar)`×2. Article FR: `news_article_detail(fr)` from the SSR loader **and again from the client** (`news_article_detail`, `news_team_filters`, `news_related_articles` ×2 with a 500 retry); Article AR: `news_article_detail(fr)` ×2 + `(ar)` ×2 (language fallback runs on server and client). Match page: `football_match_detail` + `head_to_head` + `standings` + `timeline` + `statistics` + `lineups` + `news_feed(50)` ×3 = 13 requests. Club page: 12 RPCs with 4 duplicated pairs. Standings: `football_competition_fixtures` and `football_standings` each ×2.
- Root cause: (a) "auto" edition logic fetches both languages; (b) `fantasy_hub` and catalogue RPCs are fetched for anonymous users; (c) the router's server `QueryClient` is thrown away so loader-warmed queries are re-fetched client-side once `dataUpdatedAt` is >15 s old (always true when SSR TTFB is slow) and every Arabic reader double-fetches because the first client render is French; (d) 3 automatic retries.
- Fix: one `news_home_modules(lang)` call for the home rail (it already exists and returns 7 KB); fetch the other language only when the first is empty; wire TanStack Query dehydration into the Start SSR (`@tanstack/react-query` `dehydrate`/`HydrationBoundary` via router context) or pass loader data as `initialData` with `staleTime: Infinity`; read the language cookie on the server so Arabic readers do not fetch French first; `retry: 1`. Complexity: M.

### F-06 — Article and match pages are SSR-rendered *per request* against the DB with no cache: TTFB 0.6–1.4 s when quiet, 4–23 s under contention, and the HTML silently degrades to an empty shell
- Severity: **P1** — Confidence: VERIFIED
- Location: `src/routes/news.$articleId.tsx:56-70` (loader → `news_article_detail`), `src/routes/matches.$matchId.tsx:65-79` (loader → `football_match_detail`, `catch { return null }`), HTML `cache-control: no-cache, must-revalidate, max-age=0`.
- Evidence: `/news/2064690e-…` TTFB: 8.35 s (16:39), then 20.8 / 4.4 / 9.0 / 19.7 / 9.8 s (16:41, ×5) [contended]; 0.58 / 0.58 / 1.07 s [quiet, 16:51]. `/matches/f8c23493-…`: 307 → `?tab=summary` (adds a round trip: 196 ms) then TTFB 23.3 s [contended, 16:39]; 1.0 / 1.45 / 0.89 s [quiet]. When the loader fails the page still returns 200 with generic `<title>Match Botola Pro — BotolaGO</title>` and body text "Retour Chargement…" (waterfall `match-finished-mobile-fr`: raw text 89 chars; article run: raw text 83 chars, `<title>Officiel : Le Wydad AC…</title>` came from the loader on the 16:39 curl but the body was empty in the 16:40 run). When it succeeds the article body IS in the HTML (`grep -c Ganvoula` = 2) and the match title is real.
- Impact: SEO/social previews and first paint of the two most linkable page types depend on DB latency at request time; a slow DB turns them into shells that Google will index as thin.
- Fix: cache SSR HTML at the edge for anonymous requests (`Cache-Control: public, s-maxage=60, stale-while-revalidate=600` for articles, 15–30 s for live matches), or ISR-style server cache keyed by id+language; return 503 with `Retry-After` instead of a 200 shell when the loader fails (or at least `noindex`); drop the 307 by accepting `/matches/:id` without `?tab=`. Complexity: M.

### F-07 — Sitemap: 15,699 URLs / 410 KB gzip regenerated per request from a 3.6 MB RPC (3 s), and silently collapses to 9 URLs whenever the RPC exceeds the timeout
- Severity: **P2** (SEO impact P1) — Confidence: VERIFIED
- Location: `src/routes/sitemap[.]xml.ts:21-35` (`try { … } catch { news = [] }`, `cache-control: public, max-age=300`), `api.news_sitemap_entries` (`p_limit` 49,990; mean 716 ms, max 2,014 ms in `pg_stat_statements`).
- Evidence: 16:30 [contended]: `sitemap.xml` 200, 632 B, **9 URLs**, TTFB 3.8 s and 5.4 s; `POST news_sitemap_entries` at 16:44 → 500 `57014` after 8.2 s. 16:51 [quiet]: RPC 200 in 3.0 s returning **3,639,769 B JSON (600 KB gzip)**; `sitemap.xml` 200 in 2.7 s, 410,152 B on the wire (gzip, `content-encoding: gzip` confirmed on both), 15,699 `<url>` entries. No `cf-cache-status`/`age` header → not served from the edge despite `max-age=300`.
- Fix: generate the sitemap on a schedule (pg_cron → storage object, or a nitro cached handler with `stale-while-revalidate`), split into a sitemap index with ≤ 5,000 URLs per file (Google's 50 MB/50k limit is fine but a 410 KB single file is slow to fetch), and never emit a "successful" 9-URL sitemap on failure (return 503 so crawlers keep the previous copy). Complexity: S–M.

### F-08 — Google Fonts stylesheet (3 families, 13 weights) is render-blocking, no self-hosting; Arabic weights declared but unused on FR pages
- Severity: **P2** — Confidence: VERIFIED
- Location: `src/routes/__root.tsx:225-232` (`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Changa:wght@600;700;800&family=Manrope:wght@400;600;700;800;900&family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap">`, preconnects present).
- Evidence: Lighthouse home mobile `render-blocking-insight`: est. savings 1,170 ms — `fonts.googleapis.com/css2…` 1,362 ms, `styles-C_navA4_.css` 876 ms. Network: CSS2 response 3 KB but 884 ms (677→1,561 ms) on the critical path; then `manrope…woff2` 25 KB and `changa…woff2` 24 KB (1,782→3,087 ms). `document.fonts` on FR pages: only Manrope 400/600/700/800 and Changa 800 actually load (5 files); Noto Sans Arabic never loads on FR, Manrope 900 never loads anywhere observed. `font-display: swap` is set (font-display audit passes) so it is FOUT, not FOIT, but the CSS itself blocks first paint.
- Fix: self-host the 5–6 used weights as `woff2` in `/assets` with `<link rel="preload" as="font">` for the two above-the-fold faces, load the stylesheet non-blocking (`media="print" onload`) or inline the `@font-face` rules; load Noto Sans Arabic only when `dir=rtl`. Complexity: S.

### F-09 — /news (mobile): CLS 0.41 and a 30 s LCP; card images 1200×672 served for 88×68 and 315×200 slots
- Severity: **P2** — Confidence: VERIFIED
- Location: `/news` grid and "latest" list; topic placeholder images `topic-*.webp` (1200×672, 47–156 KB each).
- Evidence: Lighthouse news mobile run 1 (16:45 [contended for LCP; CLS is not DB-dependent]): CLS **0.412**, LCP 30.8 s (resource load delay 29.2 s — the hero card image waits for `news_home_modules`), Performance 35; desktop LCP 5.7 s (render delay 2.2 s). Waterfall: 10 images, **438 KB** transferred on /news (vs 7–54 KB on other pages); `topic-transfer/fans/press/referee` 1200×672 rendered at 315×200 (3.8×) and 88×68 (**13.6×**), `loading="lazy"` but 11 images in the first viewport-ish grid. `image-delivery-insight` est. savings 34 KB on home; the news page is where the real waste is.
- Run 2 [quiet, 17:05]: CLS 0.131, LCP 9.8 s; the LCP element is the lead card's hero `<img … width="1440" height="810" loading="lazy">` — **the LCP image is lazy-loaded**, which defers it behind everything else (Lighthouse `lcp-discovery`: "LCP resources should not use loading=lazy"); the same `topic-transfer` image is the LCP on the article page (6.6 s mobile) with `image-delivery-insight` estimating 361–418 KB of savings on /news and /news/<id>. `render-blocking-insight` on /news: 1,130 ms.
- Fix: reserve space for the hero/lead card (aspect-ratio box) and the "À la une" tabs to remove the shift; never lazy-load the lead/hero image (`loading="eager"` + `fetchpriority="high"`, preload it once the SSR knows the lead); serve responsive `srcset` for topic images at 320/640/960 widths (or use the Supabase image renderer already used for crests with `?width=`). Complexity: S–M.

### F-10 — Static shell pages (standings, club, fantasy, rankings) render "Chargement…" server-side; content is 100% client-fetched
- Severity: **P2** — Confidence: VERIFIED
- Evidence: raw HTML text (curl, scripts/styles stripped): `/matches/standings` → "Matches Chargement Calendrier Classement" (no table, 6 KB); `/clubs/<id>` → club name + "Chargement Aperçu Matchs…" (squad/standings absent); `/fantasy/rankings` → "Classement Général Journée Mes ligues Chargement…"; `/` → nav + section headings only (395 chars of text, no match or news data); pre-hydration `innerText` 290 chars → post-hydration 255 (the chooser). Only the article body and match title/meta are SSR'd (F-06).
- Impact: FCP is fast (0.5–0.8 s mobile) but meaningful content depends on the JS + RPC chain: Slow-3G `/matches` shows fixtures at **16.8 s** (shell at 4.0 s, 16:51 [quiet]); home on Slow 3G never showed match/news content within 170 s [contended, re-run pending in section 5]. Crawlers see loading placeholders.
- Fix: server loaders for the public catalogue pages (standings, club overview, fixtures list) with the dehydration bridge from F-05, plus edge caching from F-06. Complexity: M.

### F-11 — Anonymous `fantasy_hub` and full team/season catalogues on every public page
- Severity: **P3** — Confidence: VERIFIED
- Evidence: `fantasy_hub` is the most-called RPC in `pg_stat_statements` (18,304 calls); it is issued on `/`, `/fantasy`, `/fantasy/rankings` for signed-out visitors (`useFantasyAvailability`), 4× on `/fantasy` in one load [contended retries]. `football_team_catalog(100)` (6.7 KB) and `football_season_catalog(12)` are fetched on `/`, `/matches`, `/matches/standings`, `/clubs/<id>`, `/fantasy` with `staleTime: 15_000`, so any navigation >15 s later re-fetches them.
- Fix: `staleTime: Infinity` + `gcTime` long for catalogues (they change once a season); skip `fantasy_hub` when there is no session; ship the 16-club catalogue in the HTML (it is 6.7 KB). Complexity: S.

### F-12 — HTML is `no-cache`; JS/CSS/images are `immutable` (good); `sitemap.xml` and RPC responses have no edge cache; TTFB is fine
- Severity: **P3** — Confidence: VERIFIED
- Evidence (curl, 16:30–16:33, 10 requests each, 1/s): `/` TTFB min 0.197 s, **median 0.363 s**, p90 1.03 s; `/matches` median 0.384 s, p90 1.34 s (TLS handshake ~0.10 s; the p90 outliers coincide with the contention ramp). Headers: HTML `cache-control: no-cache, must-revalidate, max-age=0`, `server: cloudflare`, no `cf-cache-status`; `/assets/*.js|css|svg` `public, max-age=31536000, immutable` + gzip (from `.output/public/_headers`); `.webp` `immutable` with ETag; `robots.txt` gzip. HTML is gzip (45 KB → 7.4 KB).
- Fix: `s-maxage` for anonymous HTML of public pages (see F-06); keep `no-cache` for authenticated. Complexity: S.

### F-13 — INP proxy: language switch causes a 272 ms interaction and 217 ms long task; page-load long tasks of 243/435 ms
- Severity: **P3** — Confidence: VERIFIED (4× CPU throttle, 390 px, 16:47 [contended — CPU only, DB not involved])
- Evidence (`inp-proxy.json`): home load: 5 long tasks totalling 978 ms (243 ms @590 ms, 435 ms @1,175 ms); open language switcher: worst event 112 ms; switch to Arabic: **272 ms** event + 217 ms long task (re-render of the whole tree + `dir` flip + refetch of all queries in `ar`); matches "Résultats" filter: 48 ms. Navigation clicks (bottom nav, match card, tab) are re-measured in section 5.
- Fix: memoise the i18n `t`/`tr` functions (they are recreated every render via `useMemo` on `lang` — fine — but every consumer re-renders); avoid refetching catalogues on language change (keys include `lang` even for numeric data); split the entry chunk (F-03) so hydration is not a 435 ms task. Complexity: S–M.

### F-14 — Performance advisors: 5 unindexed FKs (incl. `player_fixture_performances.player_id/team_id`), 132 unused indexes, Auth on a fixed 10-connection pool
- Severity: P3 — Confidence: VERIFIED (`get_advisors type=performance`, 16:36)
- `app.player_fixture_performances` FK `player_id` and `team_id` without covering index (fantasy points queries join on these); `app.stories.import_converted_by`, two `app_private` FKs. 132 never-used indexes cost write time on ingest (fixtures, notifications, fantasy_rankings) and shared_buffers on a 224 MB cache. Auth `db_max_pool_size` is absolute (10) — irrelevant until compute grows, then it must be changed to a percentage.
- Fix: add the two `player_fixture_performances` indexes before the first gameweek scores; review unused indexes after a full matchday of traffic. Complexity: S.

## 3. Network waterfalls (Playwright + `performance.getEntriesByType`, mobile 390×844 DPR 3, FR unless noted)

All taken 16:38–16:47 UTC [contended] except where noted; request counts, bytes and duplicate patterns are structural and not affected by contention, RPC durations are.

| page | reqs | JS files / gzip / decoded | CSS | img | RPCs | RPC 4xx/5xx | dup RPCs | SSR text chars | DOM |
|---|---|---|---|---|---|---|---|---|---|
| / (FR) | 69 | 51 / 398 KB / 1,273 KB | 28 KB | 6 / 167 KB | 7 | 3 | 0 | 395 | 124→231 |
| / (AR) | 78 | 51 / 398 KB | 28 KB | 6 / 167 KB | **13** | 6 | 2 pairs | 395 | 124 |
| / (desktop) | 69 | 51 / 398 KB | 28 KB | 6 / 133 KB | 7 | 4 | 0 | 395 | 124 |
| /matches | 53 | 40 / 391 KB / 1,270 KB | 28 KB | 4 / 54 KB | 3 (+1 retry) | 1 | 1 | 378 | 232 |
| /matches/<finished> | 63 | 42 / 398 KB | 28 KB | 6 / 7 KB | 8 (+4 crest images) | 2 | `news_feed` ×3 | 89 (loader failed) | 228 |
| /matches/<upcoming> | 54 | 42 / 399 KB | 28 KB | 4 / 7 KB | 1 (+2 crests) | 1 | `news_feed` ×2 | 326 | 222 |
| /matches/standings | 53 | 39 / 390 KB | 28 KB | 3 / 11 KB | 4 (+2 retries) | 0 | 2 pairs | 186 | 214 |
| /clubs/<id> | 68 | 49 / 406 KB / 1,307 KB | 28 KB | 4 / 7 KB | 10 (+2 crests) | 5 | 4 pairs | 246 | 246 |
| /news | 58 | 40 / 387 KB | 28 KB | **10 / 438 KB** | 3 | 0 | 0 | 140 | 389 |
| /news/<id> FR | 55 | 43 / 392 KB | 28 KB | 3 / 39 KB | 3 (+1 retry) | 1 | `related` ×2 | 83 (loader failed) | 188 |
| /news/<id> AR | 57 | 43 / 392 KB | 28 KB | 2 / 7 KB | 6 | 2 | `detail(fr)`×2, `detail(ar)`×2 | 83 | 139 |
| /fantasy | 74 | 54 / 395 KB | 28 KB | 4 / 83 KB | 10 | 5 | `fantasy_hub` ×4, `news_feed` ×3 | 933 | 305 |
| /fantasy/rankings (signed-out) | 46 | 35 / 375 KB / 1,231 KB | 28 KB | 4 / 41 KB | 2 | 0 | 0 | 191 | 185 |

Language is client-side only (`localStorage["botolago.language"]`); `/news/<id>` is the same URL for FR and AR, the AR run differs only by the RPC pattern above. `document.documentElement.lang/dir` flip to `ar/rtl` after hydration.

Third parties: `fonts.googleapis.com` (CSS 3 KB, render-blocking), `fonts.gstatic.com` (2 woff2, 49 KB), first-party `/~flock.js` analytics (8.3 KB gzip / 21 KB, `defer`, low priority, proxied to `/~api/analytics`), Supabase REST + Storage image renderer for crests (`/storage/v1/render/image/public/football-media/...?width=128` 150–470 ms each). No ads, no tag manager.

Slowest RPCs (quiet window, HTTP TTFB incl. ~100 ms TLS, 16:52): `football_matches_by_date` 0.82–1.26 s (+1 × 500 at 4.96 s), `news_feed(fr,50)` 0.46–1.41 s, `fantasy_overall_standings` 0.31–1.17 s, `football_home_matches` 0.69 s, `football_competition_fixtures` 0.67 s, `football_standings` 0.64 s (returns `[]`, 2 bytes), `fantasy_hub` 0.54 s, `football_live_matches` 0.53 s (returns `[]`), `news_home_modules` 0.49 s, `football_team_catalog` 0.41 s, `football_season_catalog` 0.40 s. Server-side (`pg_stat_statements`, means): `football_matches_by_date` 608 ms, `news_related_articles` 379 ms, `football_team_fixtures` 232 ms, `football_competition_fixtures` 210 ms, `news_article_detail` 206 ms, `news_feed` 131 ms, `football_live_matches` 114 ms, `news_team_filters` 95 ms, `football_season_catalog` 70 ms, `football_home_matches` 63 ms, `fantasy_hub` 18 ms.

The "12-second hang" on `/fantasy/rankings` (docs/engineering/VERCEL_CUTOVER.md §3): signed-out the page issues only `fantasy_hub` + `fantasy_overall_standings` (0.3–1.2 s quiet; 4.9 s [contended]); no 401 and no 12 s hang was reproduced — the page renders "Pas encore de classement" at DCL 2.6 s [contended]. Under the contention window every page hung for 10–40 s, which is the same symptom with a different cause (F-01).

## 4. Database / API latency, root causes

- `api.news_feed(fr,50)`: 239 ms quiet, 3.6 s contended; plan is an ordered index scan on `article_editions_language_published_idx` (not the covering partial index `article_editions_public_feed_idx`, whose predicate matches the query — the planner picks the non-partial index because `published_at is not null` is the leading condition) filtered by `app_private.news_is_public()` (SQL function → `news_story_is_publishable()` → `news_story_is_legacy_import()` per row) and then `app_private.news_article_card()` per row with 4 lateral aggregates + an `auth.uid()` saved-articles `exists` per card. 4,378 buffer hits for 50 rows — ~90 buffers per card. With 13,212 public AR / 2,478 FR editions this is fine when idle and the first thing to time out at 3 s under CPU pressure.
- `api.football_matches_by_date`: `pg_timezone_names` scan (F-04); everything else < 10 ms.
- `api.football_live_matches`: 5 ms server-side, but 0.5 s over HTTP — the fixed overhead per PostgREST RPC from this container is ~350–450 ms (TLS to eu-west-3 + PostgREST + JWT). Seven of these in parallel is fine; seven sequential (Arabic double fetch, retries) is not.
- `news_sitemap_entries`: 716 ms mean, 3.6 MB payload, 20 calls (F-07).
- No RPC sets `Cache-Control`; Cloudflare in front of Supabase returns `cf-cache-status: DYNAMIC`.

## 5. Interaction (INP proxy) and Slow-3G

See F-13 for the 16:47 run. Re-run 17:13 [quiet], same protocol (390 px, 4× CPU, language pre-seeded): home load long tasks 7 totalling 1,234 ms (211, **493**, 281 ms > 200 ms); open language switcher: `pointerdown` **160 ms** (133 ms processing) + 141 ms long task; switch to Arabic: **288 ms** event + 244 ms long task; /matches "Résultats" filter: 64 ms. Both runs agree: the page-load hydration task (435–493 ms) and the language switch (272–288 ms) are the two interactions that would fail the 200 ms INP threshold on a mid-range phone; ordinary filter clicks are fine.

Navigation interactions (17:18 [quiet], onboarding layers pre-dismissed via `botolago.welcomed=1` + `botolago.splashShown`, `inp-nav.json`): bottom-nav tap to /matches: worst event **248 ms** (`pointerover` on the link; route chunk load + render) with long tasks 103 / 198 / 54 ms; tap a match card → /matches/<id>: 72 ms, long task 180 ms; match tab switch (4 tabs): 96 ms; bottom-nav to /news: 48 ms; tap an article card: 80 ms. So client-side navigations are 50–100 ms except the first jump into a route family, which pays the lazy route chunk (~200–250 ms at 4× CPU); the two >200 ms interactions remain hydration and the language switch.

Slow 3G (CDP: 400 ms RTT, 400 kbps, 4× CPU, 390 px, FR pre-seeded):

| page | FCP / shell text | nav hydrated | meaningful content | note |
|---|---|---|---|---|
| /matches (16:51 [quiet]) | 3.8 s / 4.0 s | 4.0 s | **16.8 s** (fixture names) | 400 KB JS at 400 kbps ≈ 8 s + RPC chain |
| /matches (17:16 [quiet], repeat) | 3.7 s / 3.6 s | 3.6 s | **16.8 s** | reproducible to the 100 ms |
| / (16:48 [contended]) | 3.6 s / 3.6 s | 3.6 s | never (170 s) | first-visit: WelcomeScreen replaces home (F-02); 255 chars of body text |
| / (17:13 [quiet]) | 3.7 s / 3.8 s | 3.8 s | never (170 s) | same — this is the onboarding layer, not the DB |
| / (17:18 [quiet], `botolago.welcomed=1`, returning visitor) | 3.7 s / 3.7 s | 3.7 s | **16.0 s** (match/news content, 472 chars) | identical shape to /matches: shell at ~3.7 s, content at ~16 s |

On a Slow-3G phone the site therefore shows its header and empty sections for ~12 s on every page before any football content appears; the shell FCP is fine (3.7 s) but the JS baseline (400 KB ≈ 8 s at 400 kbps) plus the RPC chain (parallel, ≥ 0.5 s each after ~400 ms RTT) is the whole story. This is also why the Lighthouse mobile "element render delay" is ~7 s on data-driven pages.

## 6. Bundle analysis (`LEGAL_GATE_ALLOW_PLACEHOLDERS=1 bun run build`, 16:32, output `.output/public/assets`, 227 files, 5.1 MB; server bundle 6.2 MB)

Totals: JS 181 files 2,196,509 B raw / **659,410 B gzip**; CSS 1 file 157,669 B / 25,640 B gzip; images 41 webp 2.2 MB + 4 svg 28 KB; no self-hosted fonts.

Largest client chunks (raw / gzip, contents by string signature):

| chunk | raw | gzip | contains |
|---|---|---|---|
| `index-BQJLG-CU.js` (entry) | 522,769 | 160,309 | React 19 + react-dom, TanStack Start/Router/Query runtime, sonner (126 refs), motion (7), marked (4), input-otp, supabase refs (15) |
| `primitives-1x24yP0b.js` | 327,062 | 92,256 | Radix UI primitives (47 refs), lucide, immer |
| `use-unsaved-changes-guard-BsFH6Xz3.js` | 233,257 | 92,960 | zod, sanitize-html, dayjs — admin/editorial only (not loaded on public pages, verified in waterfalls) |
| `client-Dg2E3-J-.js` | 205,573 | 52,442 | supabase-js (72 refs) incl. auth, realtime, storage clients |
| `schemas-5lu9WtyA.js` | 70,362 | 18,583 | zod schemas for API DTO validation (480 `zod` refs) — loaded on every page |
| `matches._matchId-c21Xy95D.js` | 47,829 | — | match detail route |
| `LegalRoutePage-BxXn6zEl.js` | 39,801 | — | privacy/terms content |
| route chunks | 7–25 KB each | — | one per route: `admin.*` (8), `fantasy.*` (13), `news*`, `clubs.$clubId`, `matches.*`, `auth` |

Code-splitting: VERIFIED one chunk per route; home does not load `admin.*`/`fantasy.*` route chunks (it loads `use-fantasy-availability`, `auth`, `editorial-markdown`, `news`, `schemas`, `validation` helper chunks). What is not split is the platform baseline (≈ 340 KB gzip before any route code). recharts, date-fns locales and embla were not found in any client chunk (`grep -c` = 0).

Sourcemap breakdown (`vite build --sourcemap` + `source-map-explorer`, 17:17, minified bytes before gzip — `.audit-tmp/perf/sme.json`):

| chunk (minified) | contents |
|---|---|
| `index-*.js` 511 KB | react-dom 171 KB, @tanstack/router-core 47 KB, **app `src/backend` 46 KB** (repositories for every domain incl. admin/prizes/news editorial), app `src/services` 36 KB, **sonner 32 KB**, @tanstack/query-core 31 KB, app `src/routes` 27 KB, seroval 19 KB, `src/lib` 18 KB, react-router 16 KB, `src/components` 15 KB, start-client-core 11 KB, **app `src/mocks` 9 KB** (mock data shipped to production), routeTree 5 KB |
| `primitives-*.js` 319 KB | **app `src/i18n` 164 KB** — the complete FR *and* AR dictionaries on every page for every visitor (each visitor uses one), `src/components` 37 KB, tailwind-merge 26 KB, @radix-ui/* ≈ 45 KB (menu, dialog, dropdown, popper, roving-focus, dismissable-layer), @floating-ui ≈ 22 KB, react-remove-scroll 6 KB |
| `client-*.js` 201 KB | **@supabase/auth-js 92 KB, realtime-js 29 KB, phoenix 25 KB, storage-js 21 KB** = 168 KB that an anonymous reader never exercises; postgrest-js 15 KB and supabase-js 10 KB are the only parts public pages use |
| `schemas-*.js` 69 KB | zod 67.5 KB (DTO validation of every RPC response in the browser) |
| `use-unsaved-changes-guard-*.js` 228 KB | dom-serializer 66 KB, postcss 49 KB, entities 40 KB, htmlparser2 24 KB, sanitize-html 12 KB, domutils/domhandler 18 KB, dayjs 7 KB — admin/editorial only (not loaded on public pages) |

The three cheapest wins in the baseline are therefore: split the dictionaries per language (−80 KB minified on every page), stop shipping auth-js/realtime/storage to anonymous sessions (−168 KB), and drop `src/mocks` + `sonner` from the entry (−41 KB).

Images shipped in the bundle: 41 webp totalling 2.2 MB, largest `topic-fans` 156 KB, `fantasy-hero` 103 KB, `topic-stadium` 101 KB, `welcome-wide` 100 KB, `welcome` 99 KB — all single-resolution except `home-band-stadium` (800/1600) and `welcome` (720/1080).

## 7. Lighthouse matrix

Recipe: Lighthouse 13.5.0, Chromium 1194, `--preset=perf --form-factor=mobile` (simulated 4G/4× CPU) and `--form-factor=desktop --screenEmulation.disabled` (simulated 40 ms RTT / 10 Mbps / 1× CPU), categories performance+accessibility+best-practices+seo, two runs per page. Run 1 = 16:34–16:51 UTC (**contended from ~16:36**: other streams' browsers + my waterfall batch), run 2 = 16:56 UTC onwards (other streams paused). Medians of the two runs are reported; where the runs disagree by more than 2× the quiet run is the one to believe and is shown in brackets.

Run timestamps: run 1 mobile/desktop pairs 16:34→16:51 (home 16:34/16:35 were before contention began; everything from 16:36 on is [contended]); run 2 17:00→17:13 [quiet]. Values = median of the two runs, with run 2 in parentheses where the two runs differ by more than 2× (run 2 is the one to believe). TTFB = Lighthouse `server-response-time`. Legacy audits `render-blocking-resources`, `uses-responsive-images`, `modern-image-formats`, `offscreen-images` are not in Lighthouse 13's perf preset; the equivalent insights are given in the notes column. `unused-css-rules` = 0 KB everywhere (one 25 KB gzip stylesheet). Font-display passes everywhere (`swap`). Third-party summary is empty in LH 13 for these pages (only Google Fonts is third-party; see F-08).

**Mobile** (simulated slow 4G, 4× CPU, 412×823):

| page | Perf | A11y/BP/SEO | LCP | FCP | TBT | CLS | SI | TTI | TTFB | bytes | unused JS | main-thread | boot-up | DOM | long tasks (n / ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 50 (48) | 100/98/100 | 10.4 s (10.6) | 2.1 s | 0.75 s | 0.002 | 5.4 s | 9.5 s | 0.50 s (0.95) | 673 KB | 133 KB | 6.3 s | 1.07 s | 231 | 11.5 / 1.55 s |
| /matches | 46.5 (47) | 100/98/100 | 6.5 s (6.4) | 2.1 s | 0.98 s (1.01) | 0.015 | 7.5 s | 10.1 s | 0.11 s | 564 KB | 131 KB | 11.5 s | 1.24 s | 213 | 10 / 1.73 s |
| /matches/<finished> | 40 (43) | 100/100/100 | 11.2 s (9.0) | 5.6 s | 0.74 s | 0.008 | 10.5 s | 12.1 s | 3.4 s (2.0) | 655 KB | 133 KB | 2.9 s | 1.02 s | 235 | 11.5 / 1.57 s |
| /matches/<upcoming> | 41 (43) | 100/98/100 | 14.7 s (8.5) | 9.2 s | 0.73 s | 0.005 | 14.2 s | 15.1 s | 7.0 s (1.4) | 690 KB | 133 KB | 3.1 s | 0.97 s | 160 | 9.5 / 1.41 s |
| /matches/standings | 46.5 (44) | 100/100/100 | 8.0 s (8.3) | 2.2 s | 0.83 s | 0.009 | 7.5 s | 12.1 s | 0.81 s (1.3) | 551 KB | 132 KB | 7.4 s | 1.20 s | 170 | 11.5 / 1.69 s |
| /clubs/<id> | 39.5 (46) | 100/98/100 | 13.7 s (8.4) | 7.4 s | 0.91 s | 0.019 | 13.0 s | 16.0 s | 5.6 s (0.38) | 703 KB | 131 KB | 11.3 s | 1.22 s | 200 | 11.5 / 1.76 s |
| /news | 37 (39) | 100/98/100 | 20.3 s (9.8) | 1.8 s | 0.82 s (1.10) | 0.272 (0.13) | 7.1 s | 8.0 s | 0.13 s | 947 KB | 132 KB | 10.6 s | 1.29 s | 346 | 12 / 1.72 s |
| /news/<id> | 43.5 (48) | 100/98/84.5 | 22.0 s (6.6) | 9.7 s | 0.79 s | 0.019 | 14.7 s | 15.9 s | 8.1 s (0.40) | 761 KB | 133 KB | 3.1 s | 1.06 s | 188 | 10.5 / 1.51 s |
| /fantasy | 47 (46) | 100/100/100 | 20.8 s (17.4) | 1.9 s | 0.76 s | 0.016 | 8.5 s | 9.6 s | 0.21 s | 797 KB | 133 KB | 9.5 s | 1.40 s | 280 | 10.5 / 1.50 s |
| /fantasy/rankings | 51 (47) | 100/100/100 | 7.0 s (7.3) | 1.8 s | 0.79 s (0.98) | 0.000 | 6.6 s | 8.5 s | 0.14 s | 522 KB | 132 KB | 4.1 s | 0.96 s | 147 | 10.5 / 1.44 s |

**Desktop** (no emulation, simulated 40 ms RTT / 10 Mbps, 1× CPU):

| page | Perf | A11y/BP/SEO | LCP | FCP | TBT | CLS | SI | TTFB | bytes | main-thread | DOM |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 92.5 (88) | 100/100/100 | 1.5 s (2.2) | 0.57 s | 0.03 s | 0.007 | 1.5 s | 0.13 s | 688 KB | 1.1 s | 231 |
| /matches | 87.5 (90) | 100/98/100 | 1.7 s | 0.85 s | 0.06 s | 0.047 | 2.3 s | 0.75 s (0.17) | 564 KB | 2.8 s | 213 |
| /matches/<finished> | 89.5 (93) | 100/98/100 | 1.1 s | 0.83 s | 0.05 s | 0.018 | 7.9 s (contended) | 10.2 s (0.70) | 587 KB | 0.9 s | 164 |
| /matches/<upcoming> | 90 (93) | 100/98/100 | 1.1 s | 0.88 s | 0.03 s | 0.008 | 7.5 s (contended) | 9.8 s (1.1) | 692 KB | 0.8 s | 200 |
| /matches/standings | 87 (88) | 100/100/100 | 1.9 s | 0.77 s | 0.03 s | 0.012 | 2.0 s | 0.20 s | 552 KB | 1.6 s | 170 |
| /clubs/<id> | 91.5 (96) | 100/98/100 | 0.9 s | 0.54 s | 0.07 s | 0.008 | 3.0 s | 2.1 s (0.48) | 705 KB | 1.8 s | 200 |
| /news | 79.5 (88) | 100/98/100 | 3.8 s (1.9) | 0.79 s | 0.03 s | 0.008 | 2.0 s | 0.15 s | 728 KB | 2.4 s | 283 |
| /news/<id> | 89 (88) | 100/98/84.5 | 1.2 s (1.7) | 0.70 s | 0.04 s | 0.017 | 3.9 s | 3.6 s (0.46) | 708 KB | 1.0 s | 164 |
| /fantasy | 75 (77) | 100/100/100 | 3.1 s (2.7) | 0.92 s | 0.05 s | 0.016 | 2.9 s | 0.16 s | 799 KB | 1.8 s | 280 |
| /fantasy/rankings | 95.5 (96) | 100/100/100 | 0.9 s | 0.67 s | 0.01 s | 0.009 | 1.8 s | 0.17 s | 521 KB | 0.8 s | 147 |

Reading the mobile table: FCP is 1.8–2.2 s wherever the SSR shell is served quickly (home, /matches, standings, news, fantasy), i.e. the shell is fine; **LCP is 6–17 s everywhere** because the LCP element is either data (standings rows, club header, rankings — "element render delay" ≈ 7 s: the JS + RPC chain) or an image discovered after hydration (home chooser: resource load delay 8.1–8.5 s; /news lead image 8.2 s; /fantasy hero 16 s). TBT 0.73–1.01 s on every page with 10–12 long tasks totalling 1.4–1.8 s is the JS baseline (F-03). The match and article pages additionally inherit SSR TTFB (F-06): 2.0 s / 1.4 s even in the quiet run, 6–16 s contended. The article SEO score of 84.5 on both runs is the a11y/SEO streams' domain (a `robots`/`crawlable` audit), noted for the record only.

LCP elements (run 2, from `lcp-breakdown-insight`): `/` mobile+desktop → the WelcomeScreen's background `<img sizes="100vw" fetchpriority="high" srcset="welcome-720… 720w, welcome… 1080w">` (`PageBackground photo="welcome"`, `WelcomeScreen.tsx:56`); `/fantasy` → the fantasy hero `<img class="absolute inset-0 -z-10 …">` (`fantasy-hero-*.webp` 103 KB, resource load delay 16 s: requested only when the route chunk renders); `/matches` → `<img src="/assets/matches-header-BzD6zCjr.webp">` (43 KB header art, load duration 5.7 s on mobile because it competes with 400 KB of JS at the same priority); `/matches/<id>`, `/matches/standings`, `/clubs/<id>`, `/fantasy/rankings` mobile → `<h2 id="radix-_r_1_" …>` — the Radix `DialogTitle` of the language chooser (`FirstLaunchLanguage.tsx`), with "element render delay" 6.6–8.1 s; `/news` and `/news/<id>` → the lead card's `topic-transfer` hero with `loading="lazy"`; desktop shell pages → the wordmark SVG or the same chooser title. In other words: **for a first-time visitor the mobile LCP on every page is the language chooser**, which only exists after the JS baseline has loaded, hydrated and the launch splash has left.

Per-run detail (with timestamps and warnings): `shots/performance/lighthouse-summary.json`.

## 8. Prioritised fix list

| # | Fix | Finding | Impact | Complexity |
|---|---|---|---|---|
| 1 | Upgrade Supabase compute to Small/Medium; raise `anon` statement_timeout to 8 s only after the queries below are fixed | F-01 | stops matchday outages | S (cost) |
| 2 | Replace the `pg_timezone_names` check in `football_matches_by_date` | F-04 | −0.5 s p50 / −5 s p99 on /matches; frees ~40% of DB CPU | S |
| 3 | Edge/server cache for anonymous public RPC payloads and SSR HTML (30–60 s, `stale-while-revalidate`) | F-01, F-06, F-12 | DB load ÷ 10–100 for anonymous traffic | M |
| 4 | Home news rail: one `news_home_modules` call, no dual-language `news_feed(50)`; catalogues `staleTime: Infinity`; skip `fantasy_hub` when signed out; `retry: 1` | F-05, F-11 | 7→3 RPCs on `/`, 13→4 in AR | S–M |
| 5 | Server-side language (cookie) + language chooser in initial HTML, hero preloaded or removed | F-02 | first-visit mobile LCP 10 s → ~2.5 s | M |
| 6 | Self-host the 5 used font files, preload two, non-blocking font CSS | F-08 | −1.1 s render-blocking on mobile | S |
| 7 | Query dehydration bridge for SSR loaders (no client refetch); no French-then-Arabic double fetch | F-05 | −50% RPCs on article/match pages | M |
| 8 | Trim the shared JS baseline (supabase-js auth lazy, zod off the public path, sonner/motion out of entry, prune modulepreloads) to ≤ 180 KB gzip | F-03 | mobile TBT 0.8 s → ~0.3 s, Slow-3G content −4 s | L |
| 9 | Scheduled sitemap generation with sitemap index; fail closed | F-07 | SEO, −3 s per crawler fetch | S–M |
| 10 | /news: reserve space for lead card (CLS 0.41 → <0.1), responsive `srcset` for topic images | F-09 | CLS, −350 KB | S |
| 11 | SSR loaders for standings/club/fixtures (with #3 and #7) | F-10 | meaningful content in HTML | M |
| 12 | Indexes on `player_fixture_performances(player_id)`/`(team_id)`; prune unused indexes later | F-14 | fantasy scoring queries | S |

## 9. What was not verified

- Field data (CrUX) — no origin data available for a new domain; all numbers are lab.
- HTTP/2, early hints, priority hints behaviour — the container's proxy downgrades to HTTP/1.1; `curl` confirmed HTTP/2 at the origin but Lighthouse could not exercise it.
- Authenticated flows (fantasy team/transfers) — signed-out only per brief.
- pgTAP/database tests — Docker unavailable; not relevant to this stream.
- Lighthouse accessibility/best-practices/SEO scores are recorded (table above) but not analysed; the a11y and SEO streams own them.
