# BotolaGO — Launch-readiness re-check (2026-09-25)

Follow-up to [`2026-09-24-FULL_STACK_PRODUCT_AND_SEARCH_AUDIT.md`](2026-09-24-FULL_STACK_PRODUCT_AND_SEARCH_AUDIT.md).
Same method and the same 16 areas plus an overall score. The re-check was
read-only: no deploys, no migrations, no data changes.

- **Checked:** 2026-09-25, 07:10–07:50 UTC. The sitemap was checked again at the end.
- **Live release:** matches `main` at `86c0fac` (read from the `x-botolago-release` header).
- **Evidence:** [`2026-09-25-recheck-evidence/`](2026-09-25-recheck-evidence/), read-only SQL on production, GitHub Actions logs, and live HTTP and browser runs.
- **Labels:** VERIFIED means seen directly. LIKELY means inferred from strong evidence. UNVERIFIED means it could not be checked.

---

## 1. Verdict

**Not launch-ready yet, but close.** The product has improved a lot in the last
24 hours. The Fantasy season now moves forward, live scores work, and pages
arrive with real content that Google can read.

Four things still stand between it and a public launch:

1. **The sitemap has been down since this morning's fix (new regression).**
   `/sitemap.xml` returns 503 on every request. Google cannot discover new pages.
2. **The season data job is still failing.** Only 2 of the season's rounds (16
   fixtures) are loaded, so the Fantasy season runs out after round 2 unless this is fixed.
3. **Failure alerts are built but switched off.** If something breaks, nobody is told.
4. **Last night showed the site buckles under real crawler traffic.** 10–25% of
   data requests failed each hour from about 17:00 to 06:00 UTC while Googlebot
   crawled. The failures stopped at about 07:00 after the fixes and the database
   upgrade. The upgrade has not yet been proven under load.

A **quiet soft launch** (no marketing push) is reasonable once items 1 and 3
are done. A **real launch** also needs items 2 and 4.

---

## 2. Scorecard (0–100), yesterday vs today

| Area | 24 Sep | 25 Sep | Change | Why |
|---|---|---|---|---|
| Functionality | 55 | **70** | +15 | Fantasy GW1 locked and live, GW2 open for new teams, live scores finalised a real match. Minus: only 2 rounds loaded, Pronostics hidden. |
| Frontend engineering | 66 | **70** | +4 | Server rendering has a 3 s data budget and now ships content. `/matches` is still client-only. |
| Backend engineering | 60 | **66** | +6 | Launch-fix migrations applied, a lifecycle tick every 5 min, health checks. Minus: a new migration shipped an 8 s query past the 3 s limit. |
| Reliability | 32 | **52** | +20 | Lifecycle unblocked, live refresh on, database upgraded, 0 errors since 07:00. Minus: error storm overnight, sitemap down, orchestrator failing, alerts off. |
| Security | 62 | **70** | +8 | Open redirect closed, click-jacking protection on. Still no full CSP or Permissions-Policy, anonymous calls unthrottled, sanitize-html not bumped, rotation UNVERIFIED. |
| Performance | 42 | **50** | +8 | Main data call is 0.3–0.6 s, bigger database, content in the first response. Mobile Lighthouse **not re-measured** today, so the score is held back. |
| UI | 72 | **72** | 0 | No material change seen. |
| UX | 52 | **58** | +6 | New users get a clear message: "Journée 1 clôturée, votre équipe jouera à partir de la Journée 2". Guest Fantasy hub still shows signed-in screens. |
| Mobile experience | 66 | **67** | +1 | Browser re-test clean at 360 and 390 px. |
| Accessibility | 68 | **68** | 0 | No material change seen. |
| French localization | 78 | **78** | 0 | Standings H1 still reads "Matches". |
| Arabic / RTL | 70 | **70** | 0 | Arabic articles still marked `lang="fr"`. Club codes still auto-truncated. |
| SEO | 25 | **42** | +17 | Real content and structured data in the HTML, truthful dates, real 404s. Held down by the sitemap 503, errors served to Googlebot overnight, `/matches` client-only, and missing canonicals on `/news` and `/fantasy`. |
| AEO / AI discoverability | 14 | **30** | +16 | Organization, WebSite, Breadcrumb and SportsEvent data present. No about or editorial pages, and news has no image or source data. |
| Code quality | 60 | **61** | +1 | Lint has 0 errors and 14 warnings. Dead code is unchanged. |
| Automated testing | 58 | **62** | +4 | 2,876 unit tests pass (up from 2,599) and CI is green. No test caught the sitemap timeout. |
| **Overall** | **48** | **60** | **+12** | The core now works. Ops safety nets and search visibility still lag. |

---

## 3. Fixed since yesterday (VERIFIED)

| Yesterday's problem | Now | Evidence |
|---|---|---|
| Fantasy GW1 stuck open, new teams refused (P0-1) | GW1 `live` and locked, 6/6 lineups locked. GW2 `scheduled`, deadline 2026-10-02 14:30Z. New users are sent to GW2. | SQL on `app.fantasy_gameweeks`; screenshots `shot-fantasy-signedin-hub.png`, `shot-fantasy-signedin-create.png` |
| Live scores off | Live refresh on. Amal Tiznit 1–3 Ittihad Tanger was finalised at 22:00Z. | SQL on `app.football_matches` |
| Lifecycle never advanced | `fantasy_lifecycle_tick` runs every 5 min and was enabled 07:18Z. `ops_health_checks()` reports all ok. | SQL |
| Database too small (500s under light load) | shared_buffers 2 GB, max_connections 160, work_mem 12 MB. `football_matches_by_date` takes 0.3–0.6 s. | `show` settings; timed calls |
| Open redirect | Closed | Live HTTP test |
| No click-jacking protection | `frame-ancestors 'self'` plus X-Frame-Options | Response headers |
| Empty HTML for Google | Home, standings, clubs and news render content on the server with structured data | `curl` of each page |
| False article dates, soft 404s, match 307s | Truthful dates, real 404s, no 307 | HTTP checks |
| Launch-fix migrations pending | `20260924200000`–`200600` applied | `supabase_migrations.schema_migrations` |
| Prizes page | Live | Browser |
| Pronostics | Degrades gracefully ("Bientôt disponible"), not linked anywhere, migrations not applied | `shot-pronostics.png` |

Browser re-test: 10 pages in French and Arabic at 360, 390 and 1440 px, both
signed in and signed out. There were 0 console errors and 0 failed data calls.

Local checks, run in this re-check: migrations validate (105), secret scan
clean, typecheck clean, lint 0 errors, and 2,876/2,876 unit tests pass
(`local-checks.log`). pgTAP was **not** run because Docker is unavailable here;
CI's `database-quality` job is green on `main`.

---

## 4. Still open

### Blockers

**B1. Sitemap down (new regression).** VERIFIED
- `/sitemap.xml` returns `503` with `Retry-After: 300` on every request, including the final check at the end of this re-check.
- Cause: `api.news_sitemap_entries` was rewritten in `20260924200600_news_truthful_modified_dates.sql` (lines 125–160). It now joins a grouped `max(created_at)` over every article revision. The full set takes about **8.4 s**, and anonymous calls are cut off at **3 s** (`57014 statement timeout`).
- The route is correctly built to fail closed, so it returns 503 rather than a broken sitemap. Google keeps retrying but finds nothing new.
- Fix direction: an index on revisions by `(article_edition_id, created_at desc)` with a lateral `limit 1`, or storing the last-modified time on the edition row.

**B2. Season data job still failing.** VERIFIED
- The `fantasy-season-orchestrator` workflow runs #38, #39 and #40 all failed. The latest failure is `CURRENT_SEASON_RECOVERY_FAIL code=squad_profile_position_conflict`.
- No run has used the new code yet.
- Only 2 rounds (16 fixtures) are in the database. Round 3 onward does not exist, so there will be no GW3 unless this is fixed.

**B3. Failure alerts are off.** VERIFIED
- `app_private.ops_alert_state.enabled = false`, and no webhook is configured.
- The owner runbook, step 7 of `docs/production/APPLY_2026_09_24_LAUNCH_FIXES.md`, turns this on.

**B4. Proven fragility under crawl.** VERIFIED (errors), UNVERIFIED (whether the upgrade holds)
- From about 17:00 to 06:00 UTC, 10–25% of data calls failed each hour.
- That includes 2,308 failures from `news_related_articles` during a Googlebot crawl and 2,613 statement timeouts.
- There have been 0 errors since about 07:00, after the fixes and the upgrade. No load test has confirmed that the upgrade holds.

### Should fix before a marketing push

| Item | Status |
|---|---|
| Postponed FAR–Raja fixture still stores a 0–0 score | VERIFIED |
| `/matches` sends no content in the HTML (client-only) | VERIFIED |
| `/news` and `/fantasy` have no canonical tag | VERIFIED |
| Arabic articles served with `lang="fr"`; no `/ar` URLs | VERIFIED |
| News structured data has no image or source organisation; `og:image` is generic | VERIFIED |
| `www` redirect is 302 (should be 301); `/MATCHES` returns 200 (duplicate URL) | VERIFIED |
| Security headers: CSP is frame-ancestors only; no Permissions-Policy; HSTS has no preload | VERIFIED |
| `sanitize-html` still 2.17.5 | VERIFIED |
| Anonymous timeout still 3 s (fine once queries are fast, but it leaves no headroom) | VERIFIED |
| Standings page H1 reads "Matches" | VERIFIED |
| Arabic club codes auto-truncated | VERIFIED |
| Guest Fantasy hub shows signed-in screens | VERIFIED |
| Two audit test accounts still in production and need deleting | VERIFIED |
| Credential rotation after the 18 Sep incident; backups | UNVERIFIED |

---

## 5. Owner actions, in order

1. **Fix the sitemap query** (B1). This is a code change plus a new migration. Until it ships, Google gets no sitemap.
2. **Turn on alerts** (B3). This is runbook step 7: store the webhook secret, then run `select app_private.ops_alert_configure(true);`.
3. **Fix the orchestrator's squad position conflict** (B2). Then confirm one green run and check that rounds 3+ appear in the database.
4. **Watch one busy evening** after the upgrade (B4). Look at the API 5xx rate per hour, or run a small load test.
5. **Delete the two audit test accounts.**
6. Then work through the "should fix" table above.

Once steps 1–4 are done and a matchday passes cleanly, the expected score is
about **68–72**, which is launch-ready for a soft launch.
