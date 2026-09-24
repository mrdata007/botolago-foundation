# BotolaGO audit — Technical SEO / AEO stream (`seo`)

Date: 2026-09-24 (16:25–17:00 UTC). Live site: https://botolago.com. Repo branch: claude/quirky-faraday-e8xnss (merged with origin/main).
Artefacts: `scratchpad/shots/seo/` — `raw/*.html` (curl SSR HTML per page type), `raw/*.h` (headers), `sitemap.xml` (2.7 MB), `sample30_results.txt`, `timing_results.txt`, `match_titles.txt`, `rendered_fr_*.json` + `fr_*.png` (Playwright), `bing_site.html`, `bing_brand.html`.

**Load caveat (important for reading every timing number below).** The coordinator reported that the combined audit saturated production between 16:20 and 16:45 UTC (real visitors got 500s). My own fetches (≈100 curl requests at ~1/s, 5 Playwright page loads, and two heavy read-only SQL aggregates that hit the 60 s MCP timeout) fell inside that window. Every failure *mechanism* below is verified in code and by direct RPC responses; the *frequency* of SSR failures under normal traffic is **UNVERIFIED** and should be re-measured on a quiet day. All live fetching stopped at 16:47 UTC.

---

## 0. Executive summary

BotolaGO has a reasonable SEO skeleton (robots.txt, single canonical per article, hreflang pairs, NewsArticle JSON-LD, unique titles/descriptions per route, no www/http duplicates) but, as Google actually sees it today, the site is close to invisible:

1. **The only content that reaches the SSR HTML is the article body.** Home, /matches, /matches/standings, /clubs and /news ship zero match/club/article links and 51–334 characters of text; everything is fetched from Supabase after hydration. The standings table — the single most searched Botola query — is not in the HTML at all.
2. **Article SSR silently degrades to `noindex`.** The route loader wraps the `news_article_detail` RPC in `try/catch`; the anon role has `statement_timeout=3s`; the RPC took 3.6–11.7 s during the audit and returned `57014 canceling statement due to statement timeout`. When that happens the page is served with `<meta name="robots" content="noindex">`, no body and no JSON-LD. 6/29 random sitemap URLs and 9/24 timed fetches came back that way. Match and club pages fail the same way but *without* noindex, producing indexable empty duplicates titled "Match Botola Pro — BotolaGO".
3. **The rendered homepage is a welcome interstitial with zero links** for any visitor without `localStorage["botolago.welcomed"]` — which is exactly what Googlebot's renderer is. Google indexes the rendered DOM, so the homepage as indexed is "Bienvenue sur… Continuer en invité".
4. **Every one of the 15,690 articles carries a false modification date of today** (`<lastmod>`, `dateModified`, `article:modified_time`, and the visible "Mis à jour il y a 4 heures" on a 2023 story). The sitemap lastmod is therefore worthless and the schema is untruthful.
5. **Only French is indexable at the site level.** `<html lang="fr" dir="ltr">` is hard-coded, the server always renders French, there are no language URLs for home/matches/standings/clubs. Arabic exists only as separate article editions (good), but even those are served inside a `lang="fr"` document with French dates.
6. **15,690 of 15,699 sitemap URLs are syndicated ElBotola articles**, republished under BotolaGO with the original linked and `isBasedOn` set but no canonical to the source. The realistic outcome is that Google treats ElBotola as canonical and BotolaGO's copies as duplicates; the licensed archive brings almost no organic search value and is the main crawl-budget consumer.
7. **Nothing is indexed yet** in Bing (`site:botolago.com` → 0 results) and the brand query "botolago" returns only the GitHub repository. Google could not be queried from this environment (UNVERIFIED for Google).
8. **"Fantasy Botola" is not uncontested**: fanbotola.co "Botola Pro Fantasy" (iOS/Android, AR/FR/EN), botolapromanager.ma "BotolaFantasy", botolahub.com and DerbyFoot Manager already hold the query.

Scorecard suggestions: **SEO 27/100**, **AEO / AI discoverability 14/100** (rationale in §8).

---

## Part 1 — Technical SEO

### 1.1 robots.txt — VERIFIED

`curl https://botolago.com/robots.txt` → 200, text/plain; identical to `public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /auth
Disallow: /profile
Disallow: /mcp
Disallow: /.mcp/
Disallow: /.lovable/
Sitemap: https://botolago.com/sitemap.xml
```

Observations:
- No rules for `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `CCBot`, `Bytespider` etc. — all AI crawlers are allowed by default. That may be intended (visibility in AI answers) but it is undocumented; see §3.
- `/fantasy/team`, `/fantasy/transfers`, `/fantasy/profile`, `/fantasy/leagues/*`, `/fantasy/points`, `/fantasy/rankings` (personal, login-gated pages) are neither disallowed nor `noindex` (grep of `src/routes/fantasy*.tsx` finds no `robots` meta; only `admin.tsx:28` and `unsubscribe.tsx:29` set one). They render a "Chargement…"/login shell to crawlers → thin, indexable URLs.
- `/auth/*` and `/profile` are blocked by robots.txt but have **no** `noindex` meta (`raw/_auth_login.html`, `raw/_profile.html`: `robots: []`). A robots-blocked URL can still appear in Google as a title-only result if linked; the standard pattern is `noindex` + not blocking, or both.
- `/admin` sends `noindex, nofollow` but is also robots-blocked, so Google never reads the meta (harmless contradiction, but the comment in `src/routes/admin.tsx:27` assumes it helps).

### 1.2 sitemap.xml — VERIFIED (parsed the live 2,716,524-byte file)

| Metric | Value |
|---|---|
| URLs | 15,699 (9 static + `/news` + 15,689 articles... exactly: 15,690 `/news/*` + 9 others) |
| Duplicates | 0 |
| `<lastmod>` present | 15,690 (all articles), none on static pages |
| `<lastmod>` valid ISO | 100 % — but **every value is 2026-09-24T09:00:38Z…12:57:54Z** (min/max). Zero spread over 15,690 URLs spanning 2023–2026. |
| `xhtml:link hreflang` | 5,984 links = 2,992 fr/ar pairs (self + counterpart, all self-referencing). 12,698 article entries have no counterpart. No `x-default` in the sitemap (the page `<head>` does emit x-default). |
| image / news / video extensions | none |
| Sitemap index / split | no — one file. Under the 50,000-URL / 50 MB limits, but `SITEMAP_NEWS_LIMIT = 50_000 - static - 1` (`src/lib/sitemap.ts:36`) means the file will silently truncate once the archive passes ~49,990 editions; there is no index. |
| Compression | Served `content-encoding: gzip` by Cloudflare when requested (409,933 bytes); uncompressed 2.7 MB otherwise. `cache-control: public, max-age=300`. |
| 30 random article URLs fetched | 30/30 HTTP 200; **6/29 evaluated returned the noindex "Actualités — BotolaGO" shell** (see 1.4); 0 real 404s; 23/23 loaded titles unique. |

Code: `src/routes/sitemap[.]xml.ts` calls `api.news_sitemap_entries(p_limit)` (`supabase/migrations/20260922180200_news_public_seo.sql:96`), whose `updatedAt` is `edition.updated_at`. `docs/backend/NEWS_LAUNCH_REPORT.md:148-152` documents the 2026-09-24 rewrite. The migrations that landed today — `20260924180000_news_story_team_tagging.sql`, `20260924180200_news_story_team_backfill.sql` — are the LIKELY cause of every `updated_at` being today (a backfill touching every edition through the `set_updated_at` trigger). I did not run the write path to confirm (read-only audit).

**Finding S-1 — Sitemap `lastmod` is uniform and meaningless; the article `dateModified` is untruthful**
- Severity: P1 · Confidence: VERIFIED (values) / LIKELY (root cause)
- Location: `src/lib/sitemap.ts:79-81`, `src/lib/article-meta.ts:24-27,133-138`, `api.news_sitemap_entries`, `app.article_editions.updated_at`
- Evidence: sitemap min/max lastmod `2026-09-24T09:00:38Z`–`2026-09-24T12:57:54Z` for 15,690 URLs; article `8a60a073…` (published 2023-09-21) shows `article:modified_time = 2026-09-24T12:51:25Z`, JSON-LD `dateModified` same, and the visible byline `<time …>il y a 4 heures</time>` labelled "Mis à jour" (`raw/re_8a60a073….html`).
- Impact: Google explicitly ignores lastmod that is "always now"; that removes the only freshness signal that could prioritise the ~10–20 genuinely new articles per day over 15,000 archive pages. The schema `dateModified` and the on-page "updated 4 hours ago" are false statements on old syndicated content — a trust/quality signal against the site and a Google News/Discover eligibility risk.
- Fix: derive `lastmod`/`dateModified` from an editorial timestamp (`source_updated_at` or `published_at`, or a dedicated `content_updated_at` bumped only by body/title revisions), never from the row's `updated_at` which tagging/backfill jobs touch. Hide the "Mis à jour" chip unless the editorial timestamp differs. Complexity: S (frontend) + S (SQL function).

**Finding S-2 — No news sitemap, no sitemap index, one monolithic file**
- Severity: P2 · Confidence: VERIFIED
- Evidence: `/news-sitemap.xml` → 404, `/sitemap_index.xml` → 404; the file has no `<news:news>` or `<image:image>` elements.
- Impact: Google News/Top Stories require a news sitemap (≤1,000 URLs, ≤48 h old, `news:publication_date`, `news:title`). Without it, and with a flat 2.7 MB file, fresh articles are discovered at the same priority as 2023 archive pages.
- Fix: `/sitemap.xml` becomes a sitemap index → `sitemap-static.xml`, `sitemap-news.xml` (last 48 h, news tags), `sitemap-articles-YYYY.xml` (per year), later `sitemap-matches.xml`, `sitemap-clubs.xml`, `sitemap-players.xml`. Add `image:image` where a real hero exists. Complexity: M.

### 1.3 HTTP status codes and redirects — VERIFIED (`curl -o /dev/null -w …`)

| URL | Result |
|---|---|
| `http://botolago.com/` | 301 → https ✔ |
| `https://www.botolago.com/` | **302** → apex (should be 301; 302 is treated as temporary) |
| `http://www.botolago.com/` | 302 → https apex (one hop, fine) |
| `/index` | 404 ✔ |
| `/matches/`, `/news/` (trailing slash) | 307 → without slash ✔ (307 rather than 301; Google accepts it) |
| `/MATCHES` | **200**, same content as `/matches`, canonical `/matches` (canonical mitigates; still a duplicate cluster for every uppercase variant) |
| `/fr`, `/ar` | 404 ✔ (no language URLs exist) |
| `/matches/999999999` | 307 → `/matches/999999999?tab=summary` → **200** "Chargement…", no `noindex`, self-canonical → **soft 404** |
| `/news/does-not-exist`, `/news/999999999` | **200** + `noindex` shell ("Actualités — BotolaGO") → soft 404 kept out of index, but still 200 |
| `/clubs/999999` | **200** "Club introuvable", **no noindex**, self-canonical → indexable soft 404 |
| `/news?page=2`, `/matches?page=2` | 200, identical to unparameterised (no pagination exists; params ignored; `/news` has no canonical to collapse them) |
| `/prizes` | 307 → `/fantasy` (PRIZES_ENABLED=false) ✔ |
| `/admin` | 200 + `noindex,nofollow` ("Vérification de l'accès") |
| `/llms.txt`, `/about`, `/humans.txt` | 404 |

Response headers on all HTML: no `X-Robots-Tag` (grep of `raw/*.h`: none). `cache-control: no-cache` on HTML.

**Finding S-3 — Soft 404s on match/club detail; failed SSR on match pages is indexable**
- Severity: P1 · Confidence: VERIFIED
- Location: `src/routes/matches.$matchId.tsx:65-106` (loader `catch → null`, head builds generic title, no robots meta), `src/routes/clubs.$clubId.tsx:70-108` (same), `src/routes/news.$articleId.tsx:56-72` + `src/lib/article-meta.ts:117` (adds `noindex` when article is null — the only route that does).
- Evidence: `match_titles.txt`: `befe1113…` and `b48265b5…` (both real fixtures, one is today's Amal Tiznit–Ittihad Tanger) → `Match Botola Pro — BotolaGO | h1: [] | text 63 | ld 0`, no noindex, response times 6.6 s and 18.5 s; `5dddc509…` → `UTS Rabat — FUS Rabat | BotolaGO`, H1 "UTS Rabat vs FUS Rabat", 275 chars. `/clubs/999999` → 200 "Club introuvable" without noindex.
- Impact: unknown IDs and any RPC failure yield 200 pages that are indexable, duplicate-titled and empty; Google classifies them as soft 404s and lowers crawl trust for the whole `/matches/` and `/clubs/` path.
- Fix: throw `notFound()` from the loader on a 404-class error so TanStack Start returns a real 404 status; on transient errors return HTTP 503 with `Retry-After` (or at minimum `noindex`) instead of a 200 shell; never emit a self-canonical on an error page. Complexity: S–M.

### 1.4 Indexability of article pages depends on database latency — the headline defect

**Finding S-4 — Article SSR falls back to `noindex` whenever the detail RPC exceeds the anon 3-second statement timeout**
- Severity: **P0 for SEO** (it randomly de-indexes valid, sitemap-listed URLs) · Confidence: VERIFIED mechanism; frequency UNVERIFIED outside the audit window
- Location: `src/routes/news.$articleId.tsx:56-71` (`try { ensureQueryData(... getArticleWithLanguageFallback(..., "fr", ...)) } catch { return null }`), `src/lib/article-meta.ts:114-117` (`...(article ? [] : [{ name: "robots", content: "noindex" }])`), `src/services/news.ts:370-399` (for an Arabic edition the French lookup 404s first, then a second RPC runs → two sequential DB calls per AR article), `pg_roles`: `anon → statement_timeout=3s`, `authenticated → 8s`.
- Evidence:
  - Direct RPC: `POST /rest/v1/rpc/news_article_detail` (anon key) → `500 {"code":"57014","message":"canceling statement due to statement timeout"}` at t=11.7 s and 9.8 s, then `200` at 3.6 s on the third try.
  - `timing_results.txt` (12 URLs × 2 passes): 9/24 responses were the 20,163-byte noindex shell, the rest 33–37 KB with JSON-LD; the *same URL* alternated (`ar pass1 … noindex`, `ar pass2 … ok`). TTFB 0.8–21.5 s.
  - `sample30_results.txt`: 6/29 random sitemap URLs → `Actualités — BotolaGO | robots ['noindex'] | ld 0`; re-fetching five of them 4 minutes later: 4 loaded, 1 still failed.
  - `docs/backend/NEWS_LAUNCH_REPORT.md:150-151` shows the team already hit the 3 s budget on the sitemap RPC and fixed that one; the detail RPC was not given the same treatment.
  - Playwright (list pages, FR): `500 …/rpc/news_feed` ×2, `football_home_matches`, `football_matches_by_date`, `football_competition_fixtures`, `news_team_filters` ×2, `news_home_modules` — all 500 during the window.
- Caveat: the audit itself was loading production at the time. But the design is fragile regardless: any 3 s blip on the DB flips a URL to `noindex`, Google caches that decision, and re-crawls of a 15,000-page site are slow. Because Googlebot fetches at its own cadence across days, even a few-percent failure rate steadily erodes the index.
- Fix (in order): (a) never emit `noindex` on an *error* — reserve it for a confirmed 404 and return HTTP 503/`Retry-After` (or plain 500) on failure so Google retries instead of de-indexing; (b) make `news_article_detail` cheap (`EXPLAIN` it; the same set-based rewrite + partial indexes done for the sitemap; avoid the fr→ar double round trip by resolving edition language from the id in one call); (c) add an SSR data cache (Cloudflare cache / KV / Nitro `cachedEventHandler` per article for 60–300 s, purged on publish) so crawlers never hit Postgres; (d) monitor: log `loaderData === null` renders with the reason, alert when > 0.5 %. Complexity: M.

### 1.5 JS rendering: what is in the SSR HTML vs the rendered DOM — VERIFIED

Body text length after stripping tags/scripts (curl) vs Playwright `innerText`, FR, desktop, ~2.5 s after `networkidle`:

| Page | SSR text chars | SSR links to match/club/article | Rendered text | Rendered links to match/club/article | Notes |
|---|---|---|---|---|---|
| `/` | 334 | 1 (`/matches/standings`) | 255 | **0** | Rendered = WelcomeScreen ("Bienvenue sur… Continuer en invité"), H1 "Bienvenue sur" — see S-5 |
| `/matches` | 329 | 0 | 221 | 0 | RPC 500 during window; SSR is "Chargement" + a date strip |
| `/matches/standings` | 129 | 0 | 175 | 0 | Rendered says "Le classement n'est pas encore disponible pour cette saison" (season 2026/27 started today; 16 fixtures loaded) — the standings URL is empty for the season's first days |
| `/clubs` | 94 | 0 | 51 | 0 | RPC 500; SSR has nothing but nav |
| `/news` | 118 | 0 | 1,501 | 10 articles | No pagination, no "load more" links; 10 of 15,690 articles reachable from the hub |
| `/news/<id>` (FR) | ~2,100 | 1 translation + 1 external | — | — | Full article body, H1, byline, source in SSR ✔ (`raw/s7.html`) |
| `/news/<id>` (AR) | ~1,900 | 1 external | — | — | Full Arabic body in SSR ✔ but `<html lang="fr" dir="ltr">` |
| `/matches/<id>` | 63–275 | 0 club links | not rendered (Playwright budget) | UNVERIFIED | Loader succeeds → H1 "UTS Rabat vs FUS Rabat", 275 chars; still no lineup/score text in HTML |
| `/clubs/<id>` | not fetched (throttle) | UNVERIFIED | UNVERIFIED | UNVERIFIED | Loader exists (`clubs.$clubId.tsx:70`); by code, SSR renders hero + title only |
| `/fantasy` | 914 | 0 | — | — | Static copy about leagues/cups; fine as a landing page but no keyword content ("Fantasy Botola Pro" appears once) |
| `/privacy` | 6,423 | 0 | — | — | The richest text page on the site is the privacy policy |

Code confirmation: `matches.index.tsx`, `matches.standings.tsx`, `clubs.index.tsx`, `index.tsx`, `news.tsx` have **no route `loader`**; they use `useQuery` only (grep output). Only `matches.$matchId`, `clubs.$clubId`, `news.$articleId` (and fantasy player) have loaders, and the code comment at `matches.$matchId.tsx:48-63` explains why: the app builds a fresh `QueryClient` per side with no dehydrate/hydrate bridge, so SSR-fetched query data is thrown away unless it is also loader data.

**Finding S-5 — The rendered homepage is an onboarding interstitial with zero links**
- Severity: P1 · Confidence: VERIFIED
- Location: `src/routes/index.tsx:97-101` (`const showWelcome = mounted && status === "anonymous" && !hasWelcomed(); if (showWelcome) return <WelcomeScreen …/>`), `src/lib/welcome.ts` (`localStorage["botolago.welcomed"]`).
- Evidence: Playwright, fresh profile, `/` → `h1: ['Bienvenue sur']`, `textLen 255`, `links 0`, screenshot `shots/seo/fr_.png`; raw SSR HTML of `/` has 18 links and the home skeleton.
- Impact: Google's Web Rendering Service has no localStorage, so the indexed homepage (rendered DOM wins over raw HTML) is the welcome screen: no links to matches/clubs/news, no H1 about Botola. Internal PageRank from the root page goes nowhere; the home snippet in results will be "Bienvenue sur — Actualités, matchs et Fantasy…".
- Fix: render the home content underneath and show the welcome as an overlay/dialog (like `FirstLaunchLanguage`), or gate the welcome on a route (`/welcome`) that is `noindex`. Never swap the root document's content on a client-only flag. Complexity: S.

**Finding S-6 — Core listings (matches, standings, clubs, news feed) are client-only; no crawl path to matches/clubs/players**
- Severity: P1 · Confidence: VERIFIED
- Evidence: table above; `raw/_matches.html`, `raw/_matches_standings.html`, `raw/_clubs.html`, `raw/_news.html` contain only nav links (10 internal links each).
- Impact: (1) Google must render every page and wait for Supabase XHR (which returned 500s during the window) — content that is "queued for rendering" is indexed hours to days late or never on low-authority domains; (2) there is **no HTML link anywhere to any `/matches/<id>` or `/clubs/<id>`** in SSR output, so those 496+ fixture pages and 16–48 club pages are orphaned for crawlers and absent from the sitemap; (3) the standings table, the highest-intent Botola query, is never in the HTML; (4) `/news` exposes 10 articles and no pagination — the archive is reachable only through the sitemap.
- Fix: add loaders (and the missing QueryClient dehydrate/hydrate bridge in `src/router.tsx`) for `/matches` (today ± 3 days + current round), `/matches/standings` (full `<table>` — `StandingsTable.tsx:76` already renders a real `<table>` with `<caption>`/`<th scope>`), `/clubs` (all clubs with links), `/news` (first 20 + `?page=N` or `/news/page/N` with `rel=next/prev` links); add match, club and player URLs to the sitemap; put a "Classement" widget with real rows in SSR on the home page. Complexity: L (touches the SSR/hydration architecture).

### 1.6 Indexability signals per route type — VERIFIED from raw HTML

| Route | `<title>` | meta description | canonical | robots meta | OG/Twitter | JSON-LD |
|---|---|---|---|---|---|---|
| `/` | "BotolaGO — Actualité, matchs et Fantasy du football marocain" (61 ch) | ✔ | `https://botolago.com/` ✔ | – | 8 OG / 4 TW, og:image 1200×630 | **none** |
| `/matches` | "Matches Botola Pro — scores en direct \| BotolaGO" | ✔ | ✔ | – | ✔ | none |
| `/matches/standings` | "Classement Botola Pro — points, forme et buts \| BotolaGO" | ✔ (mentions "Inwi", 16 clubs) | ✔ | – | ✔ | none |
| `/clubs` | "Clubs de Botola Pro — BotolaGO" | ✔ | ✔ | – | ✔ | none |
| `/clubs/<id>` | "<Club> — matchs, classement et effectif \| BotolaGO" / generic on failure | ✔ | ✔ (strips `?tab`/`?season`) | – (even on not-found) | twitter:card `summary` | none |
| `/matches/<id>` | "<Home> — <Away> \| BotolaGO" / "Match Botola Pro — BotolaGO" on failure | ✔ | ✔ (strips `?tab`) | – (even on failure) | og:type website | none |
| `/news` | "Actualités — BotolaGO" | ✔ | **missing** | – | ✔ | none |
| `/news/<id>` | "<headline> — BotolaGO" | ✔ (seo.description ?? summary, often truncated with "…") | ✔ one per edition | `noindex` only when article null | og:type article, og:locale, article:published_time, **og:image = generic /og-image.jpg** | NewsArticle |
| `/fantasy` | "Fantasy — BotolaGO" | ✔ | **missing** | – | ✔ | none |
| `/fantasy/rules` | **"Fantasy — BotolaGO" (duplicate of /fantasy)** | duplicate | missing | – | | none |
| `/privacy` | ✔ | ✔ | missing | – | | none |
| `/profile` | "Profile — BotolaGO" (English word on a French site) | ✔ | missing | **none** (robots-blocked only) | | |
| `/auth/login` | "Se connecter — BotolaGO" | generic root description | missing | **none** | | |
| `/admin` | root title | root description | missing | `noindex, nofollow` ✔ | | |

Additional on-page facts:
- `/matches/standings` **H1 is "Matches"** (`matches.standings.tsx:144` reuses `t("matches.title")`); the title says "Classement". H1/title mismatch on the most valuable page.
- Home H1 duplicates the title verbatim (`index.tsx:274` comment says it is for crawlers); acceptable but the visible page has no H1 that a user reads.
- Article H1 = headline ✔, exactly one H1 ✔, H2 only for "Clubs" chips; body headings are whatever ElBotola supplied.
- Headings on `/fantasy`: H1 + 4×H2 + 4×H3 — fine. `/clubs`, `/news`, `/matches` have a single H1 and nothing else in SSR.
- Images: article hero `alt = hero.alt ?? title` ✔ (but heroes are absent — see S-8); `ClubCrest` images rendered client-side; SSR pages have 1–4 `<img>` (logo + decorative with empty alt) — nothing to flag except that nothing meaningful is in HTML.
- Breadcrumbs: none (no `<nav aria-label="breadcrumb">`, no `BreadcrumbList`); only a "Retour" back button.
- Slugs: URLs are UUIDs for articles, matches and clubs. `app.article_editions.slug` exists and `api.news_article_detail` accepts a slug (`20260922180200_news_public_seo.sql:29-35`), and `app.teams.slug` exists (`raja-casablanca-3b0f1fc95b29`), yet neither is used in URLs or the sitemap. Match pages have no slug at all.
- Duplicate titles: articles 23/23 unique in the sample; match pages: every failed render shares "Match Botola Pro — BotolaGO" (2 of 3 fetched); `/fantasy` = `/fantasy/rules`.
- `/MATCHES` and other case variants return 200 (canonical corrects, but a 301 to lowercase is cleaner).

**Finding S-7 — Missing canonicals, duplicate/mis-scoped titles, wrong H1 on standings**
- Severity: P2 · Confidence: VERIFIED
- Location: `src/routes/news.tsx:54-66`, `src/routes/fantasy.tsx:4-16` (parent head shared by all `/fantasy/*` children without a child override), `src/routes/matches.standings.tsx:144`, `src/routes/privacy.tsx`, `src/routes/profile.tsx:69-80`.
- Fix: canonical on every public route; per-child `head()` for `/fantasy/rules`, `/fantasy/help`, `/fantasy/fixtures`; H1 "Classement Botola Pro 2026/2027"; `noindex` on `/fantasy/(team|transfers|profile|leagues/*|points|rankings)`, `/profile*`, `/auth/*`; 301 uppercase → lowercase at the edge. Complexity: S.

### 1.7 International / language — VERIFIED

What Googlebot receives (curl, any UA — Cloudflare served identical 45,033-byte HTML to Googlebot, Googlebot-Chrome, bingbot, GPTBot, ClaudeBot, PerplexityBot and Google-Extended UAs, no challenge):

- `<html lang="fr" dir="ltr">` on **every** URL, including Arabic article editions (`raw/s1.html`: `<html lang="fr" dir="ltr">` … `<article lang="ar" dir="rtl">`). `src/routes/__root.tsx:272` hard-codes it; `src/i18n/provider.tsx:53-60` rewrites `document.documentElement.lang/dir` *after mount* from `localStorage["botolago.language"]`. The code comment in `matches.$matchId.tsx:60-62` states it plainly: "the server always renders French".
- Home, `/matches`, `/matches/standings`, `/clubs`, `/news`, `/fantasy`: French text only in SSR. There are no `/ar/...` URLs (`/ar` → 404). An Arabic user and a French user share one URL whose content differs by localStorage → **the Arabic UI is unreachable by any crawler and cannot be linked, shared as Arabic, or targeted with hreflang**. For a Moroccan football audience where the dominant search language for this topic is Arabic (see Part 2), that removes the larger half of the addressable market.
- Articles are the exception and are done correctly at the URL level: each edition has its own `/news/<edition-uuid>`, self-canonical, with `hreflang="fr"/"ar"` + `x-default` in `<head>` and in the sitemap when the counterpart is public (`article-meta.ts:93-108`, `sitemap.ts:66-78`; 2,992 pairs). `og:locale` is `ar_MA` on AR editions ✔.
- But an AR edition is still wrapped in a French document: `<html lang="fr">`, French UI chrome ("Retour", "Accueil"), **French dates in the byline** (`<time title="14 février 2025 à 22:03">14 févr. 2025</time>` on an Arabic story — `raw/s1.html`), French "Chargement…". Google's language detection will mostly follow the body, but the mismatch is a quality signal against the page and the Arabic reader from search gets a French shell.
- `title` on AR editions is the Arabic headline + " — BotolaGO" ✔; description Arabic ✔.

**Finding S-8 — One indexable language; Arabic surface invisible; wrong `lang` on AR editions**
- Severity: P1 (strategic) · Confidence: VERIFIED
- Fix: (short term) make the article route set `<html lang/dir>` from `loaderData.language` (TanStack `head()` cannot set html attributes, but `RootShell` can read the matched route's loader data via `useMatches`) and format bylines in the edition's language; (structural) introduce language-prefixed URLs (`/ar/...` with `/` as fr or `/fr/` + `/ar/`), choose the language on the server from the URL (cookie/`Accept-Language` only for the redirect from `/`), emit hreflang pairs for every route, and list both in the sitemap. Complexity: XL (routing + i18n provider + every `Link`), but it is the precondition for any Arabic organic traffic.

### 1.8 Structured data — VERIFIED (every `application/ld+json` in raw HTML)

- Home, matches, standings, clubs, club detail, match detail, fantasy, news hub: **no JSON-LD at all**. No `Organization`, `WebSite` (+`SearchAction`), `SportsEvent`, `SportsTeam`, `SportsOrganization`, `BreadcrumbList`, `Person`.
- Article (`src/lib/article-meta.ts:15-50`) emits one `NewsArticle`:
  ```json
  {"@type":"NewsArticle","headline":"…","datePublished":"2026-05-08T21:45:43+00:00","dateModified":"2026-09-24T12:44:45.852889+00:00","mainEntityOfPage":{"@type":"WebPage","@id":"https://botolago.com/news/01ee9c4e-…"},"inLanguage":"fr","description":"…","author":{"@type":"Person","name":"ع.د (البطولة)"},"publisher":{"@type":"Organization","name":"BotolaGO"},"isBasedOn":"https://www.elbotola.com/article/2026-05-08-21-48-275.html"}
  ```
  Validation against Google's Article requirements:
  - `image` — **missing** on all three sampled articles (required for Article rich results / Top Stories). `resolveMediaUrl(article.hero)` is null because `sanitizeArticleAttribution` (`src/services/news.ts:224-231`) keeps a hero only when it has a `storagePath`; licensed imports evidently have none (share count with `hero_asset_id` UNVERIFIED — the DB aggregate timed out). Consequence: `og:image`/`twitter:image` fall back to the generic stadium image on every article, so every social share and every Discover card is identical.
  - `publisher.logo` — missing (recommended). `publisher.name` = "BotolaGO" while the story is ElBotola's — schema.org semantics of `publisher` is "the organisation that published this creative work", which for a licensed copy is defensible only because `isBasedOn` is present; `sourceOrganization`/`copyrightHolder: ElBotola` would be the honest shape.
  - `author` — a `Person` named "ع.د (البطولة)" (ElBotola's initials byline, plus the source name in parentheses). Not a real, verifiable person entity; no `url`. Google's author guidance prefers a resolvable author or an `Organization`.
  - `dateModified` — untruthful (S-1).
  - `headline` ✔ ≤110 chars; `datePublished` ✔ ISO 8601 with offset; `mainEntityOfPage` ✔; `inLanguage` ✔; `isBasedOn` ✔ (good, honest).
  - JSON-LD is properly escaped (`serializeJsonLd`) — the comment records that a previous version rendered `<script tag="script" …>` and broke on every article; that is now fixed ✔.
- OpenGraph/Twitter: root supplies `og:image` 1200×630 (`/og-image.jpg`, 117 KB JPEG ✔, HTTP 200); articles: `og:type=article`, `article:published_time`, `article:modified_time` (false), `og:locale`, `og:locale:alternate`; club: `twitter:card=summary`; match: `og:type=website` (should be `article`/none; there is no `SportsEvent` OG type — fine).

**Finding S-9 — Structured data is limited to a NewsArticle that fails Google's required `image` and carries false `dateModified`; no entity schema anywhere**
- Severity: P2 · Confidence: VERIFIED
- Fix: `Organization` (+ `logo`, `sameAs` social profiles, `url`) and `WebSite` on `/`; `SportsEvent` on match pages (`name`, `startDate` with timezone, `homeTeam`/`awayTeam` as `SportsTeam`, `location` when venue known, `eventStatus` mapped from `fixtures.status` incl. `EventPostponed`, `sport: Soccer`, `organizer: LNFP`); `SportsTeam` on club pages; `BreadcrumbList` on every detail page; for articles add `image` (real hero or a generated per-article card), `publisher.logo`, `sourceOrganization`, and an `Organization` author when the byline is a source initial. Only claim what is true. Complexity: M.

### 1.9 News SEO — VERIFIED / LIKELY

- URL structure: `/news/<uuid>` — no date, no slug, no section. Slugs exist in the DB and the RPC resolves them; nothing prevents `/news/<slug>` with the UUID kept as an alias (canonical must then point at the slug URL — `buildArticleHead` already normalises canonical to `article.id`, so it would need to switch to slug).
- Dates: `published_at` visible (`<time datetime>`) ✔ and in schema ✔; modified date false (S-1).
- Source transparency: visible "Source : ElBotola" / "المصدر: البطولة" linking the original (`target=_blank rel="noopener noreferrer"`, no `nofollow`) ✔; `isBasedOn` ✔. **No canonical to the source** — `docs/backend/NEWS_LAUNCH_REPORT.md:144` records the owner decision (2026-09-24) to index licensed articles like own content.
- Duplicate-content exposure: 15,690 of 15,699 indexable URLs are ElBotola's text. ElBotola is Morocco's #3 sports site (Similarweb, 3.95 M visits/month, 30 % organic) with 15+ years of authority. Google's canonicalisation will overwhelmingly choose the original; BotolaGO's copies land in "Duplicate, Google chose different canonical" in Search Console, consume crawl budget, and — in volume — read as a scraper site to the quality systems. Syndication guidance from Google (2023+) is that syndicated copies should use `noindex` if the publisher does not want them to compete; the `noindex, follow` variant that was removed today was the safer default.
- Authors: no author pages; bylines are initials; no editorial policy/masthead/contact page (`/about` 404). Google News Publisher Center and E-E-A-T reviewers look for exactly these.
- Images: no per-article `og:image` (S-9); no `image` sitemap.
- Freshness (DB, read-only, `published_at` per day, last 45 days): 2–24 editions/day, e.g. 2026-09-22 → 20, 09-23 → 4; newest edition 2026-09-23 (the site's own "il y a 18 heures" on /news at 16:40 UTC confirms nothing was published on 09-24 by that time). All of it is ElBotola syndication; I found no evidence of BotolaGO-originated articles in the public set (publisher slug check UNVERIFIED — the aggregate timed out).
- Google News/Top Stories eligibility: no news sitemap, no publisher entity page, no author transparency, syndicated content, false modified dates → not eligible in practice.

**Finding S-10 — The licensed archive is the whole indexable site and is structurally a duplicate of elbotola.com**
- Severity: P1 (strategy) · Confidence: LIKELY (outcome) / VERIFIED (facts)
- Fix options, in order of safety: (1) keep licensed articles `noindex, follow` (as the code did until today) and let them serve users, Fantasy context and internal linking while the site earns authority on its own pages; (2) index only licensed articles that BotolaGO materially adds to (a BotolaGO-written FR/AR intro, match/club/player entity links, structured data) and mark the rest `noindex`; (3) if the owner insists on indexing all, at least point `rel=canonical` to the original for verbatim copies (that is what Google asks syndicators to do) and stop presenting them with a BotolaGO `publisher`. Complexity: S (flag) / M (policy in SQL function + head builder).

### 1.10 Crawl budget — VERIFIED

- Indexable URL universe: ~15,699 sitemap URLs + orphaned `/matches/<uuid>` (16 for 2026/27, 240 per past season → ~496 in DB) + `/clubs/<uuid>` (20 active teams) + `/fantasy/players/<id>` + case variants + `?tab=`/`?season=` parameter variants (canonicalised) — of which fewer than 40 are BotolaGO-original pages.
- Parameter URLs: `?tab=summary|stats|lineups|h2h` on matches (every match link in the app carries `?tab=summary`, `MatchCard.tsx:345-347`), `?tab`/`?season` on clubs; all canonicalise to the bare URL ✔; `/news?page=N` accepted and un-canonicalised ✘.
- `/fantasy/*` personal pages: not blocked, not noindexed ✘. `/admin`: blocked ✔ + noindex ✔. `/mcp`, `/.mcp/`: blocked ✔.
- Budget consumer: the 15,690 archive URLs with identical `lastmod`, of which an unknown share returns `noindex` shells on a given crawl (S-4) — that combination is the worst case for a new domain: Google sees a large, slow, partly-noindex sitemap and throttles.

### 1.11 Performance signals (owned by another stream; noted only)

TTFB of SSR article pages during the audit ranged 0.8–21.5 s and the RPC timed out at 3 s; list pages need 3–4 Supabase XHRs after hydration. CWV pass/fail not measured here.

---

## Part 2 — Search landscape (limits: WebSearch is US-based Brave/Bing-style results; Google SERPs could not be fetched; Bing SERP HTML fetched via curl from a US egress; no Moroccan geo, no volumes; treat rankings as "who is present", not positions)

### 2.1 Is botolago.com indexed / does the brand exist?
- `site:botolago.com` via WebSearch → only GitHub PRs of `mrdata007/botolago-foundation`; via Bing HTML (`bing_site.html`) → **0 URLs on botolago.com** ("About 50 results", none from the domain). VERIFIED for Bing; Google UNVERIFIED (not queryable from here). Search Console submission status: UNVERIFIED (no access).
- "botolago" → GitHub repo pages and unrelated words (Bottarga, Botolan). No app-store listing, no social profiles surfaced. The public GitHub repository is currently the brand's only search footprint — PR titles such as "Fantasy prizes… shipped switched off" and internal reports are what a searcher finds. Consider whether that repo should be public.
- Brand conflict: "Botola" in search is owned by **ElBotola / البطولة** (site, apps with 1 M+ downloads, Instagram/X) and by the **SNRT "Botola" official app**. "البطولة" (single word) returns FRMF and ElBotola. "BotolaGO" reads as "Botola + GO"; Arabic users typing بطولة will never form the brand. A distinct, searchable brand in Arabic script (e.g. a fixed transliteration بوتولاغو used everywhere) is needed before brand queries can work.

### 2.2 Keyword / intent map (FR + AR)

| Query | Language | Intent | Who is present (observed) | Page type that wins | BotolaGO page today | Realistic status |
|---|---|---|---|---|---|---|
| Botola / Botola Pro | FR/EN | Navigational (ElBotola, SNRT app) + informational | Sofascore, Wikipedia, Soccerway, FotMob, BetExplorer, Flashscore, ElBotola, Google Play | league hub | `/` (indexed as welcome screen) | Not winnable head-on; brand-adjacent only |
| Botola Pro 1 / Botola Pro Inwi | FR | Informational (league) | mondefootball.fr, frmf.ma, h24info, MSN, Eurosport, ElBotola | league hub, journée recap | none | 12 m: journée recap pages |
| classement Botola / classement Botola Pro | FR | Informational, high-intent, recurring | footmercato.net, FotMob, flashscore.fr, soccer24, foot-direct, mercato.fr, 365scores, frmf.ma | standings table in HTML | `/matches/standings` (empty HTML, H1 "Matches") | 6 m possible for long-tail ("classement Botola Pro 2026-2027 journée 5") once SSR |
| résultats Botola / résultats Botola aujourd'hui | FR | Live/fresh | footlive.fr, flashscore.fr, Eurosport, Sofascore, matchendirect.fr, ElBotola, LiveScore | live-score list | `/matches` (client-only) | Hard; live-score giants |
| match Botola aujourd'hui / programme Botola | FR | Fresh, daily | matchaujourdhui.fr, ElBotola calendar, scores24, matchendirect, flashscore | "matches today" page with TV channel | none | 6 m: "Programme TV Botola du jour" page with kick-off times + channels (Arryadia) is a gap |
| calendrier Botola 2026-2027 | FR | Seasonal, high volume at season start | aujourdhui.ma, footmercato, hespress FR, flashscore, mondefootball, h24info | fixture list per journée | `/matches` | 3–6 m: per-round pages `/matches/journee-5` |
| actualité Botola / football maroc | FR | News | foot-africa, livefoot.fr, footmercato, marocfoot.net, afrik-foot, lesnouvellesdufoot | news hub | `/news` (10 links, no canonical) | Only with original reporting |
| Fantasy Botola / Botola fantasy | FR/EN | Navigational-transactional | **fanbotola.co** "Botola Pro Fantasy" (App Store, Play, Facebook), botolapromanager.ma "BotolaFantasy", botolahub.com, DerbyFoot Manager, fanarena.com | product landing + app store | `/fantasy` (914 chars) | 3 m: winnable with a real landing page (rules, prizes, how to play, screenshots, FAQ schema) — contested but weak incumbents |
| Raja Casablanca / Wydad / FAR Rabat (+ prochain match, actualité) | FR | Navigational (club) + fresh | FotMob, Sofascore, flashscore, foot.be, BeSoccer, wacofficiel.ma, wydad.net, as-far.ma, Eurosport, 365scores | club hub | `/clubs/<uuid>` (orphaned) | 6–12 m: club hubs with FR+AR names, fixtures, form, squad, news feed |
| البطولة | AR | Navigational (ElBotola) | frmf.ma, ElBotola apps/socials, kooora | brand | none in AR | Not winnable |
| البطولة الاحترافية / الدوري المغربي | AR | Informational | FRMF, FilGoal, Winwin, kooora, 365scores, jdwel, btolat, almountakhab | league hub | none in AR | Needs AR URLs |
| ترتيب البطولة / ترتيب الدوري المغربي | AR | High-intent recurring | frmf.ma/botola-pro/d1/classement, FilGoal, Winwin, kooora, as-far.ma, jdwel, 365scores | standings table | none in AR | 12 m after AR URLs + SSR |
| مباريات البطولة اليوم / نتائج البطولة | AR | Fresh/live | kooora, FilGoal, btolat, jdwel, 365scores, ElBotola, LNFP/Almountakhab Facebook | live list | none in AR | Hard |
| أخبار البطولة الاحترافية إنوي | AR | News | RadioMars, Hespress tag, Le Matin Sports FB, Almountakhab, mcg24, ElBotola | news | AR editions exist (syndicated) | Only original AR reporting |
| فانتازي البطولة / فانتازي الدوري المغربي | AR | Product | No dedicated result — FilGoal/kooora league pages dominate (they have "فانتازي في الجول" for Egypt) | product landing | none in AR | **3 m: near-empty in Arabic — the clearest opening** |

Intent split: FR queries are dominated by international score aggregators (Flashscore, FotMob, Sofascore, 365scores) and FR sports media; AR queries by kooora, FilGoal, 365scores AR, jdwel, btolat, plus FRMF and ElBotola. Hespress/le360 appear for calendar/season news rather than data. Nowhere did a page from botolago.com appear.

### 2.3 Competitor table

| Site | Type | Languages | Page types ranking | Strength vs BotolaGO | Notes |
|---|---|---|---|---|---|
| elbotola.com (البطولة) | Moroccan sports media + apps | AR, FR, EN | news, today's matches, analytics season/standings, club pages, apps | Authority, 3.95 M visits/mo, owns the "Botola" brand; is BotolaGO's *content source* | Blocks WebFetch (403) |
| kooora.com / kooora.com/… الدوري المغربي | Pan-Arab scores/news | AR | live results, standings, fixtures | #1 sports site in Morocco (Similarweb) | |
| FilGoal | Egyptian sports media | AR | standings/fixtures for Botola | Strong AR authority | |
| 365scores (fr/ar), Flashscore (fr), FotMob, Sofascore, Soccerway, LiveScore, matchendirect.fr, footlive.fr | Global live-score | FR/AR/EN | live scores, standings, team, match, player | Real-time data, app ecosystems | Unbeatable on "résultats/live"; beatable on local context |
| footmercato.net/maroc, mercato.fr, foot-direct, mondefootball.fr, livefoot.fr, foot-africa, afrik-foot | FR football media | FR | standings, calendar, news | Long-tail FR coverage | |
| frmf.ma, lnfp.ma | Federation/League | FR/AR | official standings, programme | Official entity; low UX | Would be the ideal `sameAs`/citation target |
| hespress (fr/ar), le360, h24info, aujourdhui.ma, RadioMars, Almountakhab, mcg24 | General/sports news | FR/AR | season news, calendar reveal, journée results | News authority | |
| jdwel.com, btolat.com, winwin.com | AR fixtures/standings sites | AR | جدول ترتيب / مواعيد pages | Specialised AR long-tail | Direct templates for what BotolaGO AR pages should be |
| fanbotola.co "Botola Pro Fantasy", botolapromanager.ma, botolahub.com, DerbyFoot Manager | Fantasy competitors | AR/FR/EN | app landing pages | Occupy "Fantasy Botola" today; not official; thin sites | Beatable with a content-rich web landing + prizes |
| SNRT "Botola" app | Official streaming app | AR/FR | app store | Owns "Botola app" | |

### 2.4 What is controllable vs not

Controllable: rendering (SSR of listings, standings, links), URL/language architecture, noindex policy, structured data, sitemaps, titles/H1s, entity pages (about/editorial/authors), original content cadence, internal linking, brand spelling in Arabic, server latency/caching, Search Console setup.
Not controllable: ElBotola's and the aggregators' authority; Google choosing the original as canonical for syndicated text; SERP features for live scores (Google's own sports OneBox answers "résultats Botola" without a click); the season's news cycle; how fast Google renders JS on a new domain.

### 2.5 What must be true before BotolaGO can compete (in order)

1. Every public page returns its primary content and its internal links in the HTML, with a real 404/503 on failure and never a `noindex` on transient errors (S-4, S-5, S-6, S-3).
2. Arabic has URLs (S-8). Without it, the larger market is out of reach and hreflang is impossible.
3. The indexable set is honest: original pages (home, standings, rounds, matches, clubs, players, Fantasy) indexed; syndicated copies `noindex` or canonicalised (S-10); truthful dates (S-1).
4. An entity exists: Organization schema, About/Contact/Editorial policy, author pages, Arabic brand spelling, social profiles, Search Console + Bing Webmaster verification, sitemap index submitted.
5. Then content: per-round pages, per-club hubs (FR+AR names, slugs), per-match previews/reports, a daily "programme TV" page, Fantasy explainer/FAQ, and at least a handful of original FR/AR stories per week.

Horizon (no ranking promises): **3 months** — technical fixes 1–4; index the ~30 original pages; realistic to appear for "BotolaGO", "Fantasy Botola Pro" (FR) and "فانتازي البطولة" (AR, near-empty). **6 months** — per-round and per-club pages in FR/AR; long-tail like "classement Botola Pro journée 12", "Raja Casablanca calendrier 2026-2027 Botola", "مباراة الرجاء والوداد موعد"; some Discover exposure if original content and images exist. **12 months** — compete on "classement Botola" FR long-tail and AR "ترتيب البطولة الاحترافية" variants, club navigational secondary results; head terms "Botola"/"البطولة" remain ElBotola's.

---

## Part 3 — AEO / AI discoverability

Proven SEO practice first; experimental items are labelled.

| Area | State | Evidence | Verdict |
|---|---|---|---|
| Entity clarity | No `Organization`/`WebSite` schema; no `sameAs`; `/about` 404; no contact/impressum; `meta author=BotolaGO` only | `raw/home.html`; curl `/about` 404 | Weak — AI systems have no machine-readable statement of what BotolaGO is |
| Factual consistency | Club names FR/AR consistent in DB (`app.team_translations`: FAR Rabat ↔ الجيش الملكي, FUS Rabat ↔ الفتح الرياضي…) ✔; article dates truthful for `published_at`, false for modified (S-1); standings "not available" text for the new season | SQL read; `raw/re_8a60a073…` | Mixed |
| Answerable content | No page states in plain HTML "X leads the Botola Pro with N points" or "next match: A vs B, date, channel"; standings not in SSR; the home summary is client-rendered | §1.5 table | Missing — the exact snippets LLM/AI Overviews quote |
| Source attribution | Visible "Source : ElBotola" + link + `isBasedOn` ✔; but `publisher: BotolaGO` and `Person` author initials | JSON-LD above | Partly honest; fix `sourceOrganization`/author |
| Author / editorial transparency | No author pages, no editorial policy, no corrections policy, no masthead | site 404s | Missing |
| Machine-readable data | Only NewsArticle JSON-LD; standings `<table>` exists in the component with `<caption>` and `<th scope>` ✔ but never in HTML | `StandingsTable.tsx:76-100` | Good markup, wrong rendering layer |
| Crawlability for AI bots | robots.txt has no AI-bot rules (all allowed); Cloudflare served identical HTML to GPTBot/ClaudeBot/PerplexityBot/Google-Extended UAs (no challenge, 200, 45,033 bytes); but those bots do **not** execute JS, so they see even less than Google: nav + "Chargement" + article bodies | curl UA test | Allowed but empty; decide explicitly (`Google-Extended`, `GPTBot`, `ClaudeBot`, `PerplexityBot`, `CCBot`, `Bytespider`) and document it |
| `llms.txt` (experimental, no evidence of adoption by major engines) | 404 | curl | Optional; low cost; do after the above |
| Freshness/consistency for AI | Modified dates all "today" would mislead any retrieval system into treating 2023 stories as current | S-1 | Fix first |

AEO recommendations (proven): SSR standings table + a one-paragraph plain-text summary above it ("Après la journée N, X est en tête avec P points…" and the AR equivalent) regenerated on data change; `SportsEvent` + `SportsTeam` + `Organization` (+`sameAs` to FRMF/LNFP references, social handles) + `BreadcrumbList`; About/Editorial/Contact pages; author entities; FAQ page for Fantasy with `FAQPage` markup (still shown for some queries and useful to LLMs); consistent Arabic brand name. Experimental: `llms.txt`, an `/api`-style public JSON of standings/fixtures with a stable schema (helps agents and partners; label as experimental).

---

## 4. Additional findings (P2–P4)

**S-11 — `www` → apex is a 302** · P3 · VERIFIED · `curl https://www.botolago.com/` → 302. Make it 301 at Cloudflare. Complexity: S.

**S-12 — `/news` has no canonical and swallows any query string; no pagination** · P2 · VERIFIED · `raw/_news.html` (no `<link rel=canonical>`), `/news?page=2` 200 identical. Add canonical and real paginated archive URLs (also needed for crawl discovery). Complexity: S/M.

**S-13 — Match links always carry `?tab=summary`** · P3 · VERIFIED · `MatchCard.tsx:345-347`, `/matches/<id>` → 307 → `?tab=summary`. Canonical handles it, but every internal link and every share URL is a parameter URL and the bare URL costs a redirect hop for crawlers. Default the tab without a redirect. Complexity: S.

**S-14 — English "Profile" in nav/title on a FR/AR site** · P4 · VERIFIED · `raw/_profile.html` title "Profile — BotolaGO"; nav "Profile". Cosmetic but visible in SERP titles. Complexity: S.

**S-15 — Meta descriptions truncated with an ellipsis from the summary** · P3 · VERIFIED · e.g. article `ee00418c…` description ends "…وأك" (cut mid-word, 160 chars hard limit) — `raw/s1.html`. Truncate at a word boundary and prefer `seo_description`. Complexity: S.

**S-16 — Article pages link to zero club/match/player entities** · P2 · VERIFIED · `news.$articleId.tsx:517-536` renders club chips as static `<li>` with the comment "there is no club page to link to yet" although `/clubs/$clubId` exists; related articles are client-fetched. Link chips to `/clubs/<id>`, render related articles server-side. Complexity: S.

**S-17 — Public GitHub repository is the brand's only search presence** · P3 · VERIFIED · WebSearch "botolago"/"site:botolago.com" → PR titles and internal reports (`docs/backend/*`, prize amounts, "News stays disabled"). Decide whether the repo should be public; at minimum it will outrank the site for the brand until the site is indexed. Complexity: S (decision).

**S-18 — `/fantasy/rules` renders "Chargement…" in SSR and duplicates the `/fantasy` title** · P3 · VERIFIED · `raw/_fantasy_rules.html`. The rules are static text; render them server-side with their own title/description — it is the natural "Fantasy Botola: règles" landing page. Complexity: S.

---

## 5. Scorecard suggestions

**Technical SEO: 27 / 100.** Credit for: correct http→https, no www duplicates, robots.txt and admin noindex, one canonical per article with hreflang pairs, unique titles/descriptions per route, article bodies in SSR, escaped JSON-LD, honest `isBasedOn`, gzip sitemap under limits. Deductions: main content client-only (−20), rendered homepage is an interstitial (−10), SSR degrades to noindex/empty on a 3 s DB timeout (−15), single language at URL level (−10), false modified dates (−5), 99.9 % of indexable URLs are syndicated duplicates (−8), soft 404s and no SportsEvent/Organization schema (−5).

**AEO / AI discoverability: 14 / 100.** No entity schema, no about/editorial/author pages, no answerable plain-text facts in HTML, AI crawlers allowed but receive empty shells; NewsArticle with `isBasedOn` and consistent FR/AR club names in data are the only positives.

---

## 6. Prioritised plan

| # | Action | Findings | Effort | Owner area |
|---|---|---|---|---|
| 1 | Loader failure → HTTP 503/`Retry-After` (never `noindex`); real 404 via `notFound()`; make `news_article_detail` sub-second; cache SSR data per URL (60–300 s) | S-4, S-3 | M | backend + frontend |
| 2 | Render home content with the welcome as an overlay/route | S-5 | S | frontend |
| 3 | Add QueryClient dehydrate/hydrate + loaders for `/matches`, `/matches/standings`, `/clubs`, `/news`; SSR the standings `<table>` and a plain-text summary; paginate `/news` | S-6, S-12 | L | frontend |
| 4 | Truthful `lastmod`/`dateModified`; sitemap index with news sitemap, per-year article files, matches/clubs/players | S-1, S-2 | M | backend + frontend |
| 5 | Decide licensed-content policy (recommend `noindex, follow` for verbatim copies) | S-10 | S | owner |
| 6 | Canonicals everywhere, per-child fantasy heads, standings H1, noindex on personal fantasy/profile/auth, 301 for uppercase and www | S-7, S-11, S-14, S-18 | S | frontend/edge |
| 7 | Structured data: Organization/WebSite, SportsEvent, SportsTeam, BreadcrumbList; article `image`, `publisher.logo`, `sourceOrganization` | S-9 | M | frontend |
| 8 | Language URLs (`/ar/…`), server-side language, hreflang on all routes, `lang`/`dir` from route data; AR dates on AR editions | S-8 | XL | architecture |
| 9 | Entity pages: About, Editorial policy, Contact, Authors; Arabic brand spelling; Search Console + Bing Webmaster; social profiles → `sameAs` | Part 3 | S/M | product |
| 10 | Editorial: per-round pages, club hubs, daily "programme TV Botola", Fantasy explainer/FAQ (FR+AR), original stories | Part 2 | ongoing | editorial |

---

## 7. Method and evidence index

- Raw HTML (what search engines fetch): `curl -sS -D raw/<page>.h -o raw/<page>.html https://botolago.com/<path>`; parsed with Python regex for title/meta/canonical/robots/hreflang/JSON-LD/H1/links/text.
- Rendered DOM: Playwright Chromium (`.audit-tmp/seo-render.mjs`, viewport 1280×900, fr-FR), 5 list pages, results in `rendered_fr_1790267837884.json` and `fr_*.png`. Detail pages were not rendered (Playwright budget after throttling) — those rows are marked UNVERIFIED.
- Sitemap: full download and parse (`sitemap.xml`, stats printed in this report); 30 random article URLs fetched once (`sample30_results.txt`), 12 URLs fetched twice for timing (`timing_results.txt`), 3 match pages (`match_titles.txt`), 5 refetches.
- Database (read-only SELECTs via Supabase MCP): `pg_roles` statement timeouts; `app.article_editions` columns; published_at per day (45 days); `app.team_translations`; `app.seasons`/`app.fixtures` counts; `pg_stat_activity`. Two aggregate queries over `article_editions` timed out (60 s) — hero/slug/seo_title coverage therefore UNVERIFIED.
- Search landscape: WebSearch (US-based) for 24 FR/AR queries; Bing HTML SERP via curl for `site:botolago.com` and `botolago`; DuckDuckGo refused the connection; Google not queried; elbotola.com returns 403 to fetchers.
- Not done: Lighthouse/CWV (other stream), Google Search Console (no access), Playwright on match/club/article pages, Arabic-seeded rendering.
