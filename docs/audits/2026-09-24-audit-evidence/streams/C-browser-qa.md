# BotolaGO audit — Browser QA stream (`browser-qa`)

Date: 2026-09-24, 16:25–17:20 UTC. Target: https://botolago.com (Lovable/Cloudflare, Supabase `tkewgajrljbwgwedqsxn`).
Tooling: Playwright 1.61 / Chromium 1194 (headless), scripts in `/home/user/botolago-foundation/.audit-tmp/j*.mjs`, harness `qa-lib.mjs`.
Screenshots: `scratchpad/shots/browser-qa/*.png`; raw JSON logs (console errors, failed requests, 4xx/5xx, timings per navigation): `scratchpad/shots/browser-qa/logs/*.json`.

Viewports: 1440×900 desktop, 390×844 mobile (iPhone Safari UA — still Chromium), 360×780 mobile. Languages: FR and AR (real RTL pass: `dir`, mirroring, alignment, scrollers, truncation, numerals). Timezone emulated `Africa/Casablanca`.

## Method notes and caveats (read first)

- **Throttle.** At 16:45 UTC the coordinator reported the audit was saturating production (real visitors got 500s 16:20–16:45, PostgREST p95 8–26 s). From then on every script ran one context at a time with ≥ 8 s between navigations (`pace()` in `qa-lib.mjs`), no page was retried more than once, and the slow-3G pass was **skipped** (only offline simulation was run, which costs the server nothing). All timings measured 16:20–16:50 UTC are labelled *measured under audit contention*. Timings after 16:50 are labelled *post-throttle*, but other audit streams were still running, so treat absolute numbers as upper bounds.
- **Incident (my fault).** When I stopped my own batch at 16:46 I ran `pkill -f chrome-linux/chrome`, which may have killed Chromium processes belonging to other audit streams (their node processes `seo-render2.mjs` and `perf/inp.mjs` were alive at the time). If those streams saw unexplained browser crashes around 16:46 UTC, that is why.
- **Not verified:** WebKit/Firefox (not installed — UNVERIFIED), signed-in flows (no account created, per brief), slow-3G (skipped per throttle), share/save buttons (icon-only buttons; my text-based locators missed them — UNVERIFIED, see §6).
- Every finding below carries VERIFIED / LIKELY / UNVERIFIED and points to a screenshot or a log entry.

## Summary of severities

| Sev | Count | Headline |
|---|---|---|
| P1 | 2 | Fantasy GW1 deadline anchored to a postponed fixture and still "open" 3.5 h after it; core RPCs (`football_matches_by_date`, `news_feed`, `fantasy_*`) 500 on Postgres statement timeouts → matches page shows endless skeletons |
| P2 | 8 | Finished matches show "stats available at kick-off / no highlights for the moment"; club fixtures have no dates; unknown match/article ids → 200 + long spinner + generic error (non-UUID id triggers RPC 500s); React #418 hydration error on home; no footer/legal links from main pages and "(FR)/(AR)" in legal H1s; AR users get a French/LTR first paint on every load and `<title>`/home H1 never localized; 3 interstitials before first content + chooser pops over an already-rendered page; news cards use generic stock plates everywhere |
| P3 | ~18 | "Profile" untranslated; 360 px truncation; AR club codes like "الد"/"الم"; email field not LTR in RTL forms; register `aria-describedby` dangling; `/auth/verify` broken sentence; season choice not in URL; 307 on every match URL; `/prizes` redirects guests to `/fantasy`; FDR legend overlaps rows; author "Par خ.م (البطولة)" in FR; console 404 noise; "Tout voir" = load-more; placeholder crests validated; etc. |

---

## 1. First visit: splash, language chooser, persistence

Scripts: `j1-firstvisit.mjs`, `j1b-choice.mjs`, `j2-home.mjs` (splash frames). Logs `j1-firstvisit.json`, `j1b-choice.json`.

**What happens (VERIFIED):** fresh tab → full-screen splash (`data-splash`, logo appears ~1.5–2 s in, 0.5 s frame is an empty blue field `j2-splash-desktop-t00510.png`) → language chooser modal (`j2-splash-desktop-t05548.png`) → after "Continuer" a **third** gate, the welcome screen (`j1b-desktop-fr-02-home.png`: "Explorer BotolaGO / Se connecter / Continuer en invité") → the real home. Language persists in `localStorage["botolago.language"]` across reload and pages; the header switcher (`aria-label="Langue"`) toggles FR↔AR instantly and re-renders content (`j1b-desktop-fr-05-after-switch.png`). Escape / outside click do not dismiss the chooser and focus is trapped inside it (good — it is a mandatory gate). Chooser still works when `localStorage` throws (falls back to in-memory choice; `j1-desktop-localstorage-blocked.png`).

### F1.1 Three interstitials before any content; chooser appears over an already-rendered page
- Severity P2 · Confidence VERIFIED
- Location: `src/routes/__root.tsx` LaunchGate, `src/components/shell/FirstLaunchLanguage.tsx`, `src/components/welcome/WelcomeScreen.tsx`, `src/routes/index.tsx:97`.
- Evidence: `j1-firstvisit.json` → `hydrationSamples`: desktop FR page fully rendered ("Accueil Actualités Fantasy Matches Profile…") at t≈1.5–2.0 s, chooser (`[role=dialog]`) appears only at t≈3.0–3.3 s; on reload with no choice it appears at 0.46 s after a FR paint. Then the welcome screen (`botolago.welcomed`) is a further full-screen stop.
- Impact: a first-time visitor sees splash → content → modal pops over it → welcome → content. Each gate is a bounce opportunity; the late pop is visually jarring.
- Fix: render the chooser decision like the splash (head script sets an attribute before first paint) or merge chooser + welcome into one screen; consider inferring language from `Accept-Language`/`navigator.language` and only *confirming* it. Complexity M.

### F1.2 Language tiles have no selection semantics
- Severity P3 · Confidence VERIFIED
- Evidence: `j1b-choice.json` → `selectedState`: both option `<button>`s have `aria-pressed=null`, `aria-checked=null`, `role=null`; the tick is `aria-hidden`. A screen-reader user cannot tell which language is selected before pressing "Continuer". `FirstLaunchLanguage.tsx:87-143`.
- Fix: `role="radiogroup"` + `role="radio"`/`aria-checked`, or `aria-pressed`. Complexity S.

### F1.3 Arabic users get a French/LTR first paint on every page load
- Severity P2 · Confidence VERIFIED
- Evidence: `j1b-choice.json` → `j1b-desktop-ar.reloadSamples`: `898ms fr/ltr "Accueil Actualités Fantasy…"` then `1052ms ar/rtl "مرحبًا بك…"`; mobile similar (`532 fr/ltr` → `787 ar/rtl`). Root cause is by design in `src/i18n/provider.tsx:39-51` (SSR always `fr/ltr`, language read after mount).
- Impact: flash of wrong language + full RTL layout flip (layout shift) on every navigation for the Arabic majority audience; SSR HTML is French for Arabic users (also an SEO/social-preview issue).
- Fix: persist the choice in a cookie as well and let the server render the right `lang/dir` + dictionary; or at minimum set `lang/dir` from a head inline script before first paint (same pattern as `SPLASH_INIT_SCRIPT`). Complexity M–L.

### F1.4 `<title>` and the home `<h1>` are never localized in Arabic
- Severity P3 · Confidence VERIFIED
- Evidence: with AR stored, `document.title` stays "Matches Botola Pro — scores en direct | BotolaGO", "Actualités — BotolaGO", "Se connecter — BotolaGO", "Clubs de Botola Pro — BotolaGO", "Classement Botola Pro — points, forme et buts | BotolaGO" (`j3-content.json` → `mobileAr.*.state.title`, `j7-fantasy.json` → `auth_ar.*.state.title`). AR home body text begins with the French sr-only H1 "BotolaGO — Actualité, matchs et Fantasy du football marocain" (`j7-fantasy.json` → `auth_ar._auth_callback.snap.text`).
- Fix: build `head()` titles from the dictionary once language is known (ties into F1.3). Complexity S–M.

---

## 2. Homepage (FR/AR × 3 viewports)

Screenshots `j2-home-{fr,ar}-{desktop,m390,m360}-{viewport,full,bottom}.png`. Home data captured in `j2-stdout.txt` was lost when I killed the batch; observations below come from screenshots and later loads (`j7-fantasy.json` auth_callback snapshots).

Sections: greeting banner "BON APRÈS-MIDI · JEUDI 24 SEPTEMBRE / JOURNÉE 1", "À venir" (today + Saturday), Fantasy card, "Actu Botola" (3 cards), standings snapshot (hidden when the season has no table — correct), "Explorer BotolaGO" tiles (Matches, Clubs, Fantasy, Actualités, Profile). Header nav on desktop; fixed bottom nav on mobile. No horizontal overflow at any viewport (`scrollW === clientW` and element-level measurement, `overflowers()`).

### F2.1 React hydration error #418 on the home page (greeting depends on local hour)
- Severity P2 · Confidence VERIFIED (error) / LIKELY (cause)
- Evidence: `j9-static.json` → `robust.rec.pageErrors`: `2x Minified React error #418` on `https://botolago.com/` at 17:14 UTC (iPhone UA, tz Africa/Casablanca). `src/routes/index.tsx:83-85` picks morning/afternoon/evening from `new Date().getHours()`; the server (UTC, 17 h → "après-midi") and the client (UTC+1, 18 h → "soir") disagree between 17:00–17:59 UTC and 11:00–11:59 UTC every day. Earlier snapshots show both "BON APRÈS-MIDI" (16:4x) and "BONSOIR" (17:05) for the same page.
- Impact: React throws away the SSR tree and re-renders on the client (slower LCP, flicker) for an hour twice a day; any other timezone-dependent text (the date line) has the same risk.
- Fix: compute the greeting after mount (`useEffect`) or pass the visitor timezone to the server (cookie/header). Complexity S.

### F2.2 No footer anywhere; legal pages unreachable from main pages
- Severity P2 · Confidence VERIFIED
- Evidence: `document.querySelector("footer")` is `null` on every page audited (`footer: null` in all `j3-content.json`/`j9-static.json` snapshots; `j2-home-fr-desktop-bottom.png`). `/privacy` and `/terms` are linked only from the auth forms and the register checkbox. No contact/about/social links, no © line.
- Impact: legal-compliance discoverability (Moroccan law 09-08 is cited in the policy itself), trust signals, and SEO internal linking are all missing.
- Fix: add a site footer to `AppShell` (legal, contact `support@botolago.com`, language). Complexity S.

### F2.3 "Profile" is untranslated in the French UI (header, bottom nav, Explorer tile, `/profile` H1)
- Severity P3 · Confidence VERIFIED
- Evidence: `j2-home-fr-desktop-full.png`, `j2-home-fr-m360-viewport.png`; `/profile` H1 = "Profile" (`j7-fantasy.json` → `auth_fr._profile.snap.h1`). Also "Matches" (nav) vs "Matchs" (club tab, meta title "matchs") inconsistency.
- Fix: dictionary keys `nav.profile` → "Profil"; pick one of Matches/Matchs. Complexity S.

### F2.4 Club names truncated on 360 px rows although codes exist
- Severity P3 · Confidence VERIFIED
- Evidence: `j2-home-fr-m360-viewport.png` ("Amal Tiz… / Ittihad T… / UTS Rab… / FUS Rab… / Difaâ El … / CODM …"); AR 390: "الدفاع الجد…" (`j2-home-ar-m390-full.png`). The bottom-nav label "الملف الشخصي" is truncated to "الملف الشخ…" at 360 and 390 (`rtl.truncated` in every AR snapshot).
- Fix: use `short_name`/code below ~400 px (they are already rendered as `AMA`, `ITT` in the DOM for a11y), shorten the AR nav label ("حسابي"). Complexity S.

### F2.5 Desktop layout is a 640 px phone column
- Severity P4 · Confidence VERIFIED
- Evidence: all desktop screenshots; the "Calendrier | Classement" tab bar runs edge-to-edge (1440 px) while content is 640 px (`j3-fr-desktop-matches.png`). Not a bug, but the desktop experience is a centered mobile app. Complexity L (design decision).

Link check: every internal link found on the home (matches, clubs, fantasy, news, profile, article and match deep links) resolved to a real page with no 404 (`j3-content.json`, `j7-fantasy.json`); `/fr` and `/ar` are 404 as documented.

---

## 3. Matches

Scripts `j3-content.mjs`, `j11-final.mjs`. Screenshots `j3-fr-desktop-matches*.png`, `j11-fr-desktop-matches-*.png`, `j3-ar-m390-matches.png`.

Works: date band with prev/next day (prev correctly disabled on the season's first day), 8-day strip, "Aujourd'hui" jump chip, status chips (Tous / En direct / À venir / Résultats; `aria-pressed` toggles), season picker (Radix select: 2026/2027 ACTUELLE, 2025/2026, 2024/2025), postponed match rendered as "REPORTÉ" (no 0–0 leak even though the DB row carries `home_score=0, away_score=0`), empty states with illustrations ("Aucun match programmé à cette date.", "Aucun résultat pour l'instant."). Kick-off times are correct for Casablanca (20:00 UTC → 21:00). AR: chips mirrored right-to-left (`الكل` at x=296–344 … `النتائج` at 103–163), date strip starts at the right and overflows to the left with `scrollLeft` working (`j11-final.json` → `mobileAr.matches.strip`), Latin numerals throughout (Moroccan convention, consistent).

### F3.1 Core RPCs time out → matches page shows endless skeletons; users saw 500s
- Severity P1 · Confidence VERIFIED (symptom) / LIKELY (root cause)
- Location: `api.football_matches_by_date`, `api.news_feed` / `news_article_card` / `news_is_public`, `api.fantasy_player_pool`, `api.fantasy_player_season_stats`, `api.football_competition_fixtures`, `api.football_match_detail`.
- Evidence:
  - Browser: HTTP 500 from `/rest/v1/rpc/football_matches_by_date` ×2 at 16:54 (`j3-content.json`), ×5 at 17:14–17:16 plus `news_feed` ×1 and `football_competition_fixtures` ×1 (`j11-final.json` → `desktop.rec.http`); `news_feed`, `fantasy_player_pool`, `fantasy_player_season_stats` 500s at 16:4x (`j1b-choice.json`). `/fantasy` took 22–33 s to reach network-idle at 16:4x (*under audit contention*).
  - UI: `j11-fr-desktop-matches-chip-Tous.png`, `j11-fr-desktop-matches-2025-prevdays.png` — three skeleton rows and nothing else while the query retries; the "2025/2026 → Résultats" view never showed any result during the whole pass (`j11-final.json` → `matches.prevSeasonResults` contains only the strip).
  - Postgres logs (`query_logs`, 16:52–17:01 UTC): `canceling statement due to statement timeout` with context `PL/pgSQL function api.football_matches_by_date(...) line 14 at IF` on `not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)`, and `SQL function "news_is_public" … / "news_article_card"` related-articles scoring (`(select count(*) from app.story_taxonomies … ) * 4 + (select count(*) from app.story_teams …)` per candidate).
- Reproduction: load `/matches` while the DB is under moderate concurrent load (a handful of automated browsers was enough), observe the RPC 500 in DevTools and the skeleton rows that never resolve (TanStack retries 3× with back-off, then `ErrorState` — but on the calendar the skeleton persisted for the whole 20 s observation window).
- Likely root cause: `pg_timezone_names` is a slow catalog view (it walks the tz database on every call) — validating `p_timezone` against it on every request is expensive under concurrency; the news related-articles scoring runs two correlated aggregate subqueries per candidate row. Both hit `statement_timeout`.
- Impact: the core fixtures page and news feed fail for real visitors under modest load (the coordinator confirmed visitors got 500s 16:20–16:45). This is a capacity/perf defect in the product, not just an audit artefact.
- Fix: replace the `pg_timezone_names` check with `pg_catalog.pg_timezone_names` cached in a small table, or simply `begin perform now() at time zone p_timezone; exception when others then raise …; end`; precompute related-article scores or cap candidates with an index-friendly query; add `set statement_timeout` per function with a clear error the client can render. Owners: backend stream. Complexity M.

### F3.2 Season selection is not in the URL — lost on reload, back and share
- Severity P3 · Confidence VERIFIED
- Evidence: `j11-final.json` → `matches.prevSeason.url` = `/matches` (no `?season=`), `afterReload` → back to 2026/2027 & today; `standings.afterBack.rows = 0` (returned to the empty 2026/27 table after visiting a club). The route declares a `season` search param (`matches.index.tsx:104`) but selection is local state only.
- Fix: write `season` to search params (`navigate({ search })`). Complexity S.

### F3.3 Every canonical match URL answers 307 → `?tab=summary`
- Severity P3 · Confidence VERIFIED
- Evidence: `curl -I /matches/<id>` → `307 Location: …?tab=summary` (also for unknown ids). Every deep link/share/sitemap URL pays a redirect and the canonical `<link>` (`/matches/<id>` without `?tab`) is never the URL a browser lands on. SEO stream should weigh in.
- Fix: default the tab in-app without redirecting (`validateSearch` default + no `redirect`). Complexity S.

### F3.4 Unknown match id → 200, spinner, then generic error; non-UUID id causes RPC 500s
- Severity P2 · Confidence VERIFIED
- Evidence: `j9-static.json` → `bogus`: `/matches/not-a-real-id` → SSR 200, "Une erreur est survenue. Réessayer" with `4x 500 …/rpc/football_match_detail`; `/matches/00000000-…` → "Chargement…" ≥ 2 s then the same generic error. Clubs do it right ("Club introuvable", `j9-fr-desktop_clubs_not-a-club.png`).
- Fix: validate the id (uuid) before calling the RPC, return a real 404 from the loader (`notFound()`), render "Match introuvable". Complexity S.

---

## 4. Match detail (upcoming, finished, 2 postponed)

Screenshots `j3-fr-desktop-match-{upcoming,finished,postponed,postponed2}-tab{0-3}.png`, `j3-ar-m390-match-*`.

Works: hero with club colours, score, status pill, kickoff line; tabs Résumé/Stats/Compos/Face à face (tab changes use `history.replace`, so back goes to the previous *page* — verified `backFromMatch`/`forwardToMatch`); postponed matches show "REPORTÉ · Date à confirmer · Ce match a été reporté. Nouvelle date à confirmer." and hide the placeholder 0–0 and the midnight placeholder kickoff (good); head-to-head with recent results and a "contexte au classement" table; "À lire aussi" related news; AR fully mirrored (`j3-ar-m390-match_finished-tab3.png`).

### F4.1 Finished matches use future-tense empty copy and have no events/stats/lineups
- Severity P2 · Confidence VERIFIED (UI) — data gap + copy bug
- Evidence: Wydad 1–2 UTS (5 July 2026, `finished`): Résumé "Aucun fait marquant pour le moment.", Stats "Les statistiques seront disponibles au coup d'envoi.", Compos "Les compositions ne sont pas encore publiées par la source officielle." (`j3-content.json` → `desktopFr.match_finished.tabContents`; `j3-fr-desktop-match-finished-tab0.png`). AR equivalents identical ("ستتوفر الإحصائيات عند انطلاق المباراة").
- Root cause: provider data absent for last season's fixtures (data gap: `app.match_events` etc. empty for those fixtures) **and** the empty-state copy ignores `fixture.status`.
- Fix: status-aware copy ("Aucune statistique disponible pour ce match." when finished); backfill events/stats for the last 2 seasons if the SportsMonks plan covers it. Complexity S (copy) / M (backfill).

### F4.2 Kick-off date has no year on past-season matches
- Severity P3 · Confidence VERIFIED
- Evidence: "Coup d'envoi dimanche 5 juillet · 18:00" for a 2026 match viewed in September 2026 while the season picker says 2026/2027 elsewhere. Add the year when the date is outside the current season. Complexity S.

### F4.3 Related-news images are stock plates repeated across cards
- Severity P3 · Confidence VERIFIED
- Evidence: `j3-fr-desktop-match-postponed.png` — three FAR/Raja articles share the same training-ground stock photo. See F6.2.

---

## 5. Standings

Screenshots `j3-fr-desktop-standings.png` (2026/27 empty state with "Voir le classement 2025/2026"), `j11-fr-desktop-standings-2025.png`, `j11-fr-desktop-standings-view-*.png`, `j11-ar-m360-standings-2025.png`.

**Correctness (VERIFIED):** 2025/26 final table, 16 rows, all `J=30`, `W+D+L=30`, `PTS = 3W+D` for every row (59,57,56,55,43,40,39,37,36,36,33,33,31,30,30,22), goal differences sum to 0, ties ordered by GD (Kawkab +1 above CODM −9 at 36; Yacoub −10 above Dcheïra −11 at 30). Views Général/Domicile/Extérieur/Forme (radio group with `aria-checked`), Home/Away tables are consistent (15 games each), qualification/relegation legend, sr-only labels in the position cell ("1 , Ligue des champions CAF"), club links work (`/clubs/<id>` → "Maghreb Fès"). Mobile 360 AR: table fits (328 px, no horizontal scroll needed, `overflow-x: hidden`), fully RTL, Latin numerals.

### F5.1 Arabic club naming is inconsistent: auto-truncated Arabic "codes" and untranslated names
- Severity P3 · Confidence VERIFIED (data gap + generation logic)
- Evidence: AR table rows (`j11-final.json` → `mobileAr.standings.table.rows`): "نهض نهضة بركان", "الد الدفاع الجديدي", "اتح اتحاد طنجة", "الك الكوكب المراكشي", "الم المكناسي", "حسن حسنية أكادير" (first-3-letters of the Arabic name used as the code) next to "MAS", "RCA", "WCA", "FUS", "UTS", "RCAZ"; three clubs have no Arabic name at all: "YEM Yacoub El Mansour", "OLY Olympique Dcheïra", "OLY Olympic Safi" (two clubs share the code "OLY"). In FR the news filter shows "WCA WCA" (Wydad's `short_name` is "WCA") and Zemamra appears as "Renaissance Club Athletic Zemamra" (clubs list), "RCA Zemamra" (fixtures/standings) and "CR Khemis Zemamra" (news filter).
- Fix: curate `code`, `short_name` and Arabic names per club in `app.teams`; never derive a code by truncating a name. Complexity S (data) — owner: content/backend.

### F5.2 Standings state lost on back navigation
- See F3.2 (`afterBack.rows = 0`).

---

## 6. Clubs (list + Raja, Wydad, Amal Tiznit)

Screenshots `j3-fr-desktop-clubs.png`, `j3-fr-desktop-club{0,1,2}-tab{0-3}.png`, `j11-fr-desktop-amal-squad-12s.png`, `j11-fr-desktop-club-follow-anon.png`, `j3-ar-m390-club0.png`.

Works: 16-club grid; club page with colour hero, season picker, tabs Aperçu/Matchs/Classement/Effectif (URL `?tab=squad` updates), news feed per club, squad grouped by position with shirt numbers (Raja 4/9/10/…, Wydad 4/14/14/…, Amal Tiznit loads after ~12 s under load), "Suivre" as guest opens the "Compte requis" dialog with "Continuer à explorer" (good), unknown club → "Club introuvable" (good).

### F6.1 Club fixtures show only a time and a round, never a date
- Severity P2 · Confidence VERIFIED
- Evidence: Matchs tab text "À venir · FAR Rabat REPORTÉ J. 1 Raja Casablanca · Raja Casablanca 21:00 J. 2 RCA Zemamra" (`j3-content.json` → `desktopFr.club0.tabContents[1]`; `j3-fr-desktop-club0-tab1.png`); the "Prochain match" card on Aperçu likewise ("21:00 · J. 2"). A fan cannot tell which day the match is.
- Fix: add the date (day + date) to `ClubFixtureRow`/next-match card, or group by date like `/matches`. Complexity S.

### F6.2 Placeholder crests passed asset validation
- Severity P3 · Confidence VERIFIED — data gap
- Evidence: Amal Tiznit and Yacoub El Mansour render the generic shield (`j3-fr-desktop-club2-tab3.png`, home rows). `app.media_assets` for both: `storage_path football/teams/{228516,274759}/crest.png`, `validation_status='validated'`, `attribution_url='https://cdn.sportmonks.com/images/soccer/team_placeholder.png'`.
- Fix: treat `team_placeholder.png` as "no crest" in `football-ingest` validation; source crests manually for promoted clubs. Complexity S.

### F6.3 "Statistiques" section on club overview is an empty state for the new season
- Severity P4 · Confidence VERIFIED (`emptyState: true` on all three club pages). Consider hiding until data exists, like the home standings block.

---

## 7. News

Screenshots `j3-fr-desktop-news*.png`, `j11-fr-desktop-news-*.png`, `j3-ar-m390-news.png`, articles `j3-fr-desktop-article{0,1,2}.png`, `j3-ar-m390-article*.png`.

Works: "À la une" carousel (5 items, dots + prev/next with labelled buttons "Article 1 sur 5"), "Les dernières" list, club filter chips (`aria-pressed`, filter applies to the latest feed only, by design), "Tout voir" loads 10 more (10 → 20, oldest visible "il y a 5 jours"), articles: title, author, published/updated `<time datetime>`, reading time, body (~200 words), "Source: ElBotola" link with `target=_blank rel="noopener noreferrer"`, club tags, "À lire aussi", cross-language link ("اقرأ هذا المقال بالعربية" / "Lire cet article en français"). Arabic article opened in the FR UI is rendered RTL with `lang=ar` and vice-versa (a French article inside the AR shell keeps `dir=ltr` paragraphs) — good. Meta description present; canonical correct.

### F7.1 Every news card shows a generic stock plate; imported articles have no hero image
- Severity P2 · Confidence VERIFIED — data gap with product impact
- Evidence: the 6 most recent editions (FR and AR) have `hero_asset_id IS NULL` (`app.article_editions`); cards fall back to `/assets/plate-latest-*.webp` / `topic-goal-*.webp` stock photos or a flat navy plate (`j3-fr-desktop-news-after-more.png`, `j3-ar-m390-news.png`); the same photo repeats across unrelated stories (`j3-fr-desktop-match-postponed.png`); `og:image` is always `/og-image.jpg`; article pages have zero `<img>` in the body (`meta.article.imgs = []`).
- Impact: the news product looks templated; social shares have no story image; users cannot distinguish cards visually.
- Fix: ingest ElBotola/GNews image URLs (licensing permitting) via `news-media-upload`; vary plates by taxonomy at least. Complexity M.

### F7.2 "Mis à jour il y a 4 heures" on every article after a bulk re-save
- Severity P3 · Confidence VERIFIED
- Evidence: all three articles carry `updated 2026-09-24T12:44:01.863958+00:00` (`j3-content.json` → `article*.meta.article.times`), i.e. one batch job touched every edition; the UI then advertises a false "updated" time on every article.
- Fix: do not bump `updated_at` (or the displayed `source_updated_at`) on non-editorial writes; show "Mis à jour" only when it differs materially from `published_at`. Complexity S.

### F7.3 Author/source attribution is Arabic in the French UI
- Severity P3 · Confidence VERIFIED
- Evidence: "Par خ.م (البطولة)" and avatar "خ" on French articles (`j3-fr-desktop-article0.png`); the source line lower down says "Source : ElBotola".
- Fix: map source labels per language (ElBotola / البطولة) and transliterate or drop initials-only bylines. Complexity S.

### F7.4 No search over ~15 000 articles; "Tout voir" is really "load more"
- Severity P3 · Confidence VERIFIED (`hasSearch: false`; `toutVoir.tag = BUTTON`, label unchanged after loading 10 more). Complexity S (label) / M (search — `app.article_search_documents` already exists).

### F7.5 Unknown article id: 200, "Chargement…" for > 6 s, 8 × 404 RPC retries, then a generic error
- Severity P2 · Confidence VERIFIED
- Evidence: `j9-static.json` → `bogus.news.samples` (2 s and 6 s "Chargement…", 15 s "Une erreur est survenue"); `8x 404 …/rpc/news_article_detail` (3 retries × language fallback). Same generic error instead of "Article introuvable"; SSR status 200 (soft-404 for crawlers).
- Fix: `notFound()` in the loader on null; no retry on 404; a proper 404 status. Complexity S.

### F7.6 Console noise: `news_article_detail` 404 on every cross-language article view
- Severity P4 · Confidence VERIFIED (`1x 404 news_article_detail` on AR-UI view of a FR article and on the fresh deep link). Harmless but pollutes monitoring; use `maybeSingle`/return null instead of a 404.

### F7.7 (UNVERIFIED) Save and Share buttons
- The bookmark buttons are icon-only (`aria-label="Enregistrer"`, local-storage store, no auth needed per `SavedButton.tsx`) and my text locators did not hit them; the article "Partager" button on desktop falls back to `navigator.clipboard.writeText` + toast (`ShareButton.tsx:33-36`) — no toast was observed in headless Chromium within 1.2 s, but headless clipboard permissions make this inconclusive. Re-test manually on a desktop browser: expect a "Lien copié" toast.

---

## 8. Fantasy signed-out (13 routes)

Script `j7-fantasy-auth.mjs`; screenshots `j7-fr-desktop_fantasy*.png`, `j7-ar-m360_fantasy*.png`, `j7-fr-desktop-player-*.png`.

Works: every route renders in < 3 s with no stuck spinner (checked at 2 s and 10 s: `stuck: false` everywhere); gated routes (`/fantasy/create`, `/team`, `/transfers`, `/points`, `/profile`, `/leagues`, `/leagues/join`) show a clean "Compte requis" panel with `Se connecter` / `Créer un compte` carrying `?next=` back to the page; public routes work: `/fantasy/players` (539 players, position/club/price filters, sort, 25-per-page with "Page 1 / 22", search narrows the list, compare), `/fantasy/players/<id>` (price/points/form/selection, next fixture with FDR, "Comparer", "Recruter"), `/fantasy/fixtures` (FDR grid), `/fantasy/rules`, `/fantasy/help` (accordion FAQ), `/fantasy/top-players` (honest "Journée 1 pas encore comptabilisée"), `/fantasy/rankings` (empty, "0 managers classés"). Unknown player id → "Joueur introuvable" (good). AR versions fully RTL at 360 px with no overflow. Squad-builder UI cannot be exercised without an account (it is behind the gate) — formation/budget/limits rules are therefore UNVERIFIED in the browser.

### F8.1 Gameweek 1 deadline is anchored to a postponed fixture and the gameweek stays "open" after the deadline
- Severity P1 · Confidence VERIFIED
- Location: `app.fantasy_gameweeks` (season 2026/2027, sequence 1); UI `/fantasy` header (`j7-fr-desktop_fantasy.png`: "JOURNÉE 1 · DATE LIMITE jeu. 24 sept., 14:30 — OUVERTE"; AR identical `j7-ar-m360_fantasy.png`).
- Evidence (SQL, read-only, 17:07 UTC): `deadline_at = 2026-09-24 13:30:00+00`, `starts_at = 15:00+00`, `status = 'open'`, `points_state = 'provisional'`, `db_now = 17:07:50+00`; first **non-postponed** kickoff of the round = `20:00+00`, first kickoff of any fixture (the postponed FAR–Raja, `befe1113…`) = `15:00+00`. 13:30 UTC = 14:30 Casablanca = exactly 90 min (rules page: "DATES LIMITES 90 min") before the postponed kickoff.
- Current behaviour: at 18:00 local the page tells every visitor the deadline was 14:30 *and* that the gameweek is open. Whether transfers are actually accepted after 13:30 UTC could not be tested without an account (UNVERIFIED), but either outcome is wrong: if accepted, managers can edit after seeing the "deadline"; if rejected, the UI lies.
- Likely root cause: deadline derivation uses `min(kickoff_at)` over all fixtures of the round including `status='postponed'` ones, and no job flips `status` at `deadline_at`.
- Fix: derive/recompute deadlines from non-postponed fixtures (and re-derive when a fixture is postponed), flip status on deadline (pg_cron `football-live-refresh` already runs every 15 min), and render "Fermée" when `now > deadline_at` regardless of status. Complexity M. Owner: backend/fantasy.

### F8.2 Signed-out Fantasy hub shows account-only widgets
- Severity P3 · Confidence VERIFIED
- Evidence: `j7-fr-desktop_fantasy.png`: "Mes ligues · Général – · Journée 1 –", "Coupes: Vous n'êtes pas encore qualifié", and two live "Notifications" toggles (Rappels Fantasy / E-mails) for a visitor with no account.
- Fix: hide or replace with a single sign-in prompt for guests. Complexity S.

### F8.3 `fantasy_player_gameweek_history` returns 404 ×3 on every player page
- Severity P3 · Confidence VERIFIED (symptom) / UNVERIFIED (cause)
- Evidence: `j7-fantasy.json` → `fantasyFr.rec.http`: `3x 404 …/rpc/fantasy_player_gameweek_history` while the function exists (`api.fantasy_player_gameweek_history(p_fantasy_player_id uuid)`) and a direct `POST` with the same player id returns `200 []`. The page silently shows "Aucune journée jouée". Possibly a schema/param mismatch in `getFantasyApi()` or a PostgREST schema-cache miss; needs a look at the request body in DevTools. Complexity S to diagnose.

### F8.4 FDR legend pill overlaps table rows on desktop
- Severity P3 · Confidence VERIFIED (`j7-fr-desktop_fantasy_fixtures.png`: the floating "LÉGENDE FDR" bar covers the Raja/Zemamra rows). Anchor it to the viewport bottom with padding, or make it non-floating. Complexity S.

---

## 9. Auth (FR desktop, AR mobile)

Screenshots `j8-{fr,ar}-*.png`.

Works (VERIFIED, both languages): labelled inputs with correct `autocomplete`, `novalidate` + custom validation, `aria-invalid` + `aria-describedby` error text for email/username/name/terms; messages: "Adresse e-mail requise / invalide", "Au moins 8 caractères", "Les mots de passe ne correspondent pas", "3–20 caractères…", "Vous devez accepter les conditions" (AR equivalents correct and RTL); wrong password → single generic "E-mail ou mot de passe incorrect." (no enumeration; Supabase `400 grant_type=password` in console, 4 s); forgot-password → always "Vérifiez votre boîte de réception… Si un compte est associé…" (no enumeration, `auth-supabase.ts:245-256`); password strength meter; show-password toggle with `aria-label`; Google/Apple buttons redirect to the real OAuth consent (Google `client_id 188249193101-…`) — not completed; `/auth/callback` → `/`; `/auth/mfa-challenge`, `/auth/profile-setup`, `/profile/security` → `/auth/login?next=…`; `/auth/update-password` direct → "Le lien a expiré · Demander un nouveau lien"; `/admin*` → "Authentification requise (Réf. unauthenticated/missing_token)".

### F9.1 Register reveals whether an e-mail / username is taken
- Severity P3 · Confidence LIKELY (code; not executed — no account created)
- Evidence: `src/services/auth-supabase.ts:88,98` map "already registered"/"username_taken" to `email_taken`/`username_taken`; `auth.register.tsx:126-128` shows "Un compte existe déjà avec cet e-mail." / "Ce nom d'utilisateur est déjà pris." Standard trade-off, but it is an enumeration oracle; consider the "check your inbox" pattern for e-mail. Complexity S.

### F9.2 Password field `aria-describedby` points at an element that does not exist; error not linked
- Severity P3 · Confidence VERIFIED
- Evidence: `j7-fantasy.json` → `auth_fr.register.empty.describedBy` = `"password:undefined"`; `auth.register.tsx:260` sets `aria-describedby={`${ids.pw}-strength`}` but the strength block (line 268) renders only when a password is typed, and the error text ("Au moins 8 caractères.") is never referenced. Complexity S.

### F9.3 E-mail inputs are not forced LTR in the Arabic UI
- Severity P3 · Confidence VERIFIED
- Evidence: `j8-ar-register-invalid.png` — the typed value `bad@` displays as "@bad"; e-mail/username/password fields inherit `dir=rtl`. Add `dir="ltr"` (or `dir="auto"`) on e-mail/username/password inputs. Complexity S.

### F9.4 `/auth/verify` opened directly shows a broken sentence and a live resend countdown
- Severity P3 · Confidence VERIFIED
- Evidence: redirects to `/auth/verify?email=` and renders "Nous avons envoyé un code à 6 chiffres à [nothing] … Renvoyer dans 27s" (`j8-fr-_auth_verify.png`). Redirect to login when `email` is empty. Complexity S.

### F9.5 (UNVERIFIED) The register form did not toast/flash on submit with a clearly invalid e-mail domain because client validation stops it — expected. Rate limiting on repeated wrong-password attempts was not tested (throttle rule).

---

## 10. Static pages, 404, admin, robustness

Script `j9-static-robust.mjs`; screenshots `j9-*.png`, `j10-*.png`.

- `/privacy`, `/terms` (FR and AR): complete legal texts (901/1270 words FR, 755/1003 AR), version "1.0 — 21 septembre 2026", contact `support@botolago.com`; **H1 reads "Politique de confidentialité (FR)" / "سياسة الخصوصية (AR)"** — a leftover suffix (P3, VERIFIED, `j9-fr-desktop_privacy.png`, `j9-ar-m360_privacy.png`). The AR privacy page's data table is `min-w-[32rem]` inside a scroller (`table` measured from x=−169 to 343 at 360 px) — scrollable, but the first column is off-screen on load in RTL (P4).
- `/prizes` and `/prizes/terms` **redirect anonymous visitors to `/fantasy`** (`j9-static.json` → `staticFr._prizes.nav`). If prizes are meant to attract sign-ups, they are invisible to exactly the audience that has not signed up (P3, VERIFIED). No prize-welcome dialog was observable.
- `/unsubscribe` (with or without token): "Ce lien n'est plus valide" with links to profile/home — fine.
- `/nope`, `/fr`: real HTTP 404 with a designed page in FR and AR (`j9-fr-desktop_nope.png`); page `<title>` stays the generic site title (P4).
- `/admin`, `/admin/users` signed out: "Authentification requise" with an internal reference string; `robots.txt` disallows `/admin`, `/auth`, `/profile`; no data leaked.
- Fresh-context deep links (`j10-fresh-deeplink-*.png`): the chooser overlays the match/article page; after choosing AR the page is rendered in AR (`state.lang=ar, dir=rtl`) with the correct content. SSR `<title>` present for both.
- Back/forward: back from an article to the home restored the scroll position (`scrollY 468`) and rendered without skeleton/error; forward chain consistent. (My mobile header-click trail only produced 3 history entries because the fixed bottom-nav links did not receive my clicks — inconclusive for a 5-deep chain, not a site defect.)
- Refresh mid-flow: club filter "Raja Casablanca" on `/news` is lost on reload (`filterAfterReload.pressed = ["Tous"]`) — consistent with F3.2: UI state never lands in the URL (P3).
- Offline: (a) client-side navigation while offline does nothing visible — no toast, no error, URL unchanged (`robust.offline.clientNav`); (b) full navigation → browser `ERR_INTERNET_DISCONNECTED` page (expected, no service worker); (c) coming back online and navigating back rendered `/news` with only the "Les dernières" heading and **no content, no error, no retry** at +3 s (`robust.offline.backOnline.text`, words = 10). P3, VERIFIED at one sample; TanStack `refetchOnReconnect` should have fired — worth checking `networkMode`/`onlineManager` wiring. Complexity S.
- Slow-3G: skipped per throttle instruction (UNVERIFIED).

---

## 11. Timings (per navigation; `ttfb`/`fcp`/`dcl` from Navigation Timing, `total` = goto→network-idle)

*Measured under audit contention (16:20–16:50 UTC):* `/` 4.2–6.9 s total (ttfb 0.17–0.99 s, fcp 0.6–1.2 s, dcl 2.2–2.7 s, ~560–720 KB); `/matches` 3.6–6.7 s; `/news` 1.9–3.4 s; `/fantasy` **22–33 s** (RPC retries after 500s).

*Post-throttle (16:52–17:19, other streams still active):* `/matches` 4.4–14.7 s total (the 14.7 s run is the one with 5× RPC 500s), ttfb 0.19–0.57 s; match detail SSR ttfb 0.8–3.5 s (postponed matches 2.3–3.5 s — the loader waits on `football_match_detail`); `/matches/standings` 2.6–12.7 s; `/clubs` 1.8–2.0 s; club pages 1.9–2.5 s; `/news` 1.9–3.4 s; articles 1.9–4.4 s; fantasy routes 2–6 s, `/fantasy/top-players` 12.7 s, player detail ttfb **4.2 s**; auth pages 1.0–3.5 s; legal pages 1.0–1.9 s. First-byte on the HTML is generally fine (150–600 ms); the long tails are all Supabase RPC latency/retries.

Console: zero JS exceptions except the React #418 hydration error (F2.1). Every 4xx/5xx observed is listed in the JSON logs; the only non-Supabase ones are the intended 404s.

---

## 12. What worked well (calibration)

The product is far from broken: the visual system is coherent and polished (club-colour rows, empty states with illustrations, consistent cards), the RTL implementation is genuinely good (mirrored chips/strips/carousel, correct scroll direction, `dir` switching per article language, mirrored FDR/standings, no horizontal overflow at 360/390), forms are accessible and correctly localized with no account-enumeration on login/forgot-password, gated Fantasy routes fail closed with a clear "Compte requis" panel that preserves `next=`, postponed fixtures are handled thoughtfully (no phantom 0–0, "Date à confirmer"), unknown clubs and players get real not-found states, the standings maths is correct across four views, the sitemap/robots are sane, and every internal link on the home resolves. The main weaknesses are backend latency under load, data completeness (events/stats/lineups/hero images/crests/Arabic names), the launch/first-paint choreography, and a set of small i18n/copy leftovers.

## 13. Evidence index

- Scripts: `.audit-tmp/qa-lib.mjs`, `j1-firstvisit.mjs`, `j1b-choice.mjs`, `j2-home.mjs`, `j3-content.mjs`, `j7-fantasy-auth.mjs`, `j9-static-robust.mjs`, `j11-final.mjs`.
- Logs: `shots/browser-qa/logs/{j1-firstvisit,j1b-choice,j3-content,j7-fantasy,j9-static,j11-final}.json`, stdout files alongside.
- SQL (read-only) used: `app.fantasy_gameweeks` deadline query; `app.fixtures` status/postponed sample; `app.teams`/`app.media_assets` crests; `app.article_editions` counts (FR 2 478 / AR 13 212 published) and hero presence; `pg_proc` for RPC existence; `query_logs` (postgres_logs) 16:50–17:02 UTC for statement timeouts.
