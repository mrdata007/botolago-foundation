# BotolaGO launch fixes — 25 September 2026

## 1. Executive summary

This implementation starts from `main` at `71f1cfb830ad4a501e036c37e573b561550cb52f`, not the older audit branch. The audit branch has 3 exclusive commits; main has 56. The full audit and its eight streams were reviewed before changes. The initial suite passed 2,973 tests.

Most original P0 repairs had already landed after the audit. Read-only production inspection confirms the Fantasy lifecycle is active, GW1 is live, GW2 exists, live refresh is enabled, and the optimized matches RPC is installed. Reapplying the old remediation script or reopening GW1 would be wrong.

This branch fixes remaining defects: missing matches SSR after its redesign, successful empty responses during public-data failures, unnecessary SSR retries, missing news-index canonical, silently green malformed health reports, cacheable private responses, excessive home news payload, and external font dependency. It preserves the design, RTL, authorization and existing data.

**Launch approval is withheld.** No new production deployment or authenticated new-user verification was performed. The production redirect deployment and full registration/verification/squad persistence path remain P0 verification gates. A passing build is not launch clearance. No production writes, resets, secret rotations, billing changes or account deletions were performed.

## Baseline before implementation

| Area               | Audit finding                                             | Current repo state                                                                                    | Current production state                                   | Action                                                           |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Fantasy            | Postponed opening fixture closed GW1; squad import failed | Postponement/enrolment migration and typed error handling present                                     | GW1 live; GW2 scheduled; six teams retained                | Preserve live GW1; verify regression coverage and enrolment gate |
| Season automation  | Repeated failed runs                                      | Fixture-only recovery avoids staged-catalog guard; lifecycle tick and bounded scoring workers present | Tick healthy; orchestrator run 36142756949 successful      | Verify current health, do not rerun historical repair            |
| Alerts             | Failures unnoticed                                        | GitHub issue alerts, watchdog and database webhook already implemented                                | Webhook configured/enabled; no recorded delivery           | Fix malformed-health false success; retain delivery test gate    |
| Database           | Matches about 1.5 seconds; browsing outages               | Timezone validation and related-article set-based fixes present                                       | Fix migrations recorded; compute already upgraded by owner | Bounded read-only remeasurement; reduce duplicate work           |
| Live scores        | Disabled; refresh every 4–5 hours                         | Adaptive refresh migration present                                                                    | Enabled; minute cron active                                | Preserve verified pipeline; inspect health                       |
| Security           | Live login behind redirect fix                            | Shared sanitizer present on auth routes                                                               | Live frontend inaccessible from execution environment      | Regression tests; private cache headers; owner publish gate      |
| SEO                | SPA content; transient noindex; false lastmod             | Detail-page 404/503, sitemap/date and public SSR fixes present                                        | Date/sitemap migrations applied; frontend unverified       | Restore matches SSR, public-list 503, news canonical             |
| Frontend           | Heavy first load                                          | Route chunks and query hydration already present                                                      | Deployed bundle not independently fetched                  | Bound home news, self-host same fonts; mobile checks             |
| Migration history  | 23 renamed, 12 different SQL                              | Aliases and normalized comparison already implemented                                                 | 110 entries match; one intentionally deferred migration    | Save fresh ledger, no history mutation                           |
| Monitoring/cleanup | Incomplete error visibility; audit accounts               | Release header, error sink, ops health present                                                        | All health checks OK at 15:38 UTC; audit accounts absent   | Strengthen watchdog; preserve cleanup already completed          |

## 2. Fix matrix

| Finding                   | Severity | Root cause                                                                                 | Fix                                                                                                                           | Tests                                                                                                                                                    | Production action required                                  | Status                                                      |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Squad import failure      | P0       | Old enrolment selected the closed current GW; client masked typed backend failures         | Existing `20260924200000` selects eligible enrolment GW; `fantasy-errors.ts` retains domain code and safe user message        | Existing Fantasy unit and SQL regressions; authenticated journey needs credentials                                                                       | Sanctioned fresh-user acceptance                            | Previously fixed; end-to-end verification outstanding       |
| Wrong deadline/state      | P0       | Postponed fixture participated in deadline selection; missing lifecycle transition         | Existing eligible-fixture calendar sync and lifecycle tick; already-started windows preserved                                 | `fantasy_postponement_and_enrolment.test.sql` covers first/middle postponement, reschedule, no valid fixtures, locked GW, next GW, before/after deadline | No reapplication; verify UI after publish                   | Database state verified                                     |
| Season failures           | P0       | Recovery tried to restage an already-staged Fantasy player catalogue                       | Existing fixture-only recovery; idempotent fixture/performance ingestion and lifecycle workers                                | Orchestrator/lifecycle/current-performance suites; successful production run                                                                             | None for existing job                                       | Operational evidence healthy                                |
| Failure alerts            | P0       | Originally no channel; remaining parser filtered invalid checks into an empty green report | Fail closed on missing/invalid health and run-history data; empty overall report fails                                        | Watchdog and GitHub alert tests                                                                                                                          | Merge branch; run real alert/recovery test                  | Code verified; delivery unverified                          |
| Database stability        | P0       | Timezone catalogue scan and per-row related-article work; excess frontend queries          | Existing SQL fixes; this branch disables SSR retries and bounds home feeds                                                    | Read-only EXPLAIN; news and SSR tests                                                                                                                    | Publish frontend                                            | Query improvement verified; launch concurrency not measured |
| Live scores               | P0       | Runtime flag off and reliance on delayed GitHub schedule                                   | Existing minute cron with adaptive refresh, bounded provider requests                                                         | Existing refresh/provider tests; production health and prior ingestion evidence                                                                          | None to enable; next active-match observation               | Enabled; no current live-match end-to-end run here          |
| Redirect deployment       | P0       | Manual Lovable publish separate from main                                                  | Existing hardened sanitizer; this branch prevents caching private/auth responses                                              | Auth redirect and response-header tests                                                                                                                  | Owner publish and confirm release                           | Code verified; deployment gate open                         |
| Article transient noindex | P1       | Backend failures previously collapsed into not-found                                       | Existing detail loaders return 503 with retry semantics                                                                       | Detail-page status tests                                                                                                                                 | Publish latest frontend                                     | Existing code verified, live not verified                   |
| False sitemap dates       | P1       | Import timestamp used as modification date; later migration replaced optimized function    | Existing truthful-date migration plus forward sitemap correction                                                              | Existing sitemap tests; production migration ledger                                                                                                      | None for database; frontend verification                    | Database applied                                            |
| Public crawling           | P1       | Matches redesign omitted SSR loader; list failures still answered 200                      | Restore season/day prefetch and hydrate same selection; failed public data returns 503/no-store; news canonical only on index | No-JavaScript HTML tests and SSR budget tests                                                                                                            | Publish branch after merge                                  | Implemented                                                 |
| Frontend load             | P1       | Home read up to 100 feed cards for three visible stories; fonts required another origin    | Six feed cards total; same variable fonts self-hosted with subset ranges and swap                                             | News request bounds; French/Arabic viewport suite                                                                                                        | Publish                                                     | Implemented; core JS size still substantial                 |
| Migration drift           | P1       | Apply-time version aliases, comment formatting and statement splitting                     | Existing alias comparison reused; fresh normalized ledger committed                                                           | 80 exact + 7 split-equivalent + 23 alias-equivalent; 0 unknown/different                                                                                 | Deferred migration only after GW1 scoring per its own guard | Reconciled history, not rewritten                           |
| Observability             | P1       | Malformed response could suppress health checks                                            | Strict health validation; release/error infrastructure retained                                                               | Watchdog/GitHub-alert tests                                                                                                                              | Merge and test delivery                                     | Partial operational verification                            |
| Language URLs             | P1       | Locale is selected client-side, not stable public URL                                      | Migration plan below; no false hreflang or disruptive redirects                                                               | Existing RTL viewport coverage                                                                                                                           | Separate routing/content migration                          | Deferred prerequisite plan                                  |

## 3. Fantasy verification

Read-only database evidence: GW1 `7fcb28c5-9b69-4591-bcda-437c6c961c5c` is live. Its historical deadline remains 24 September 13:30 UTC deliberately: changing an already-started competition can invalidate fair participation. GW2 `d4324127-ce55-4943-973f-4cf2f9a12780` is scheduled for 2 October, deadline 14:30 UTC and first kickoff 16:00 UTC. New enrolment uses the next eligible gameweek.

Production contains six teams, six lineups and 90 lineup players; 94 squad membership rows include membership history and are not interpreted as a current-squad count. The database reports no open gameweek past deadline and no deadline at risk. These are preservation/state checks, not proof that a new person registered and saved a squad.

| Journey step                    | Evidence in this session                                                   |
| ------------------------------- | -------------------------------------------------------------------------- |
| Register and verify email       | Not exercised; no sanctioned fresh-account credentials/mailbox             |
| Build and submit legal squad    | Unit/domain regression coverage; credentialed browser suite skipped        |
| Reload/re-login and retain team | Existing six stored lineups observed; fresh-user journey still unverified  |
| Correct gameweek/deadline       | Production rows and healthy lifecycle/deadline checks                      |
| Postponement/rescheduling rules | Existing eight SQL regression scenarios inspected; local pgTAP unavailable |

The existing `Fantasy authenticated E2E` workflow is the sanctioned write-capable acceptance path. Do not reset a production team to manufacture a fresh-user test.

## 4. Performance evidence

Production measurements were individual, bounded read-only `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` calls with a 5-second statement timeout. No load test was run. The top-level function plan does not expose nested SQL plans or represent anonymous network latency. Production compute was already upgraded by the owner, so improvements cannot be attributed solely to this branch.

| Measure                             | Before                                                      | Current / after                              | Interpretation                                                               |
| ----------------------------------- | ----------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| Matches RPC                         | Audit about 1,500 ms; earlier remediation recorded 1,025 ms | 4.620 ms execution                           | Current production, warm cache, one call                                     |
| Home matches RPC                    | No comparable baseline captured here                        | 11.521 ms execution                          | Current production, one call                                                 |
| News feed, 12 rows                  | Audit browsing failures; no comparable isolated number      | 21.105 ms execution                          | Current production, one call                                                 |
| Related articles                    | Prior applied-fix report 487 ms                             | Prior applied-fix report 32 ms               | Historical evidence, not remeasured here                                     |
| Home feed cards requested           | 50 per language, 100 total                                  | 3 per language, 6 total                      | 94% reduction in requested feed-card count; editorial module request remains |
| SSR retry amplification             | Inherited client retry policy                               | One attempt per public prefetch              | Regression test verifies exactly one call                                    |
| Font network dependency             | Google stylesheet + font origin                             | Same-origin WOFF2 subsets, no Google request | 324 KiB total stored assets; browsers select applicable subsets              |
| Core JS chunk                       | Audit roughly 400 KB transferred every page                 | Build figures in validation evidence         | Not claiming the core bundle problem fully solved                            |
| LCP / INP / CLS / first mobile load | Audit mobile around 10 seconds                              | No comparable production lab sample          | Viewport functionality is not a Web Vitals measurement                       |

## 5. SEO evidence

`tests/e2e/seo-rendering.e2e.ts` uses HTTP requests with no browser JavaScript. Local mock-backed `/matches`, `/clubs`, `/news` return HTTP 200 with an H1, actual detail links and `https://botolago.com` canonicals, without `noindex`. These tests passed. They do not establish the deployed frontend's content.

Public list prefetch failures and timeouts now mark responses for HTTP 503, `Retry-After: 120`, `Cache-Control: no-store`. Successful empty lists remain valid empty results. Detail-page tests retain genuine 404 versus temporary 503 behavior. Existing Organization, WebSite, BreadcrumbList, NewsArticle and valid SportsEvent JSON-LD code/tests remain intact. Production ledger confirms `news_truthful_modified_dates` and the forward `news_sitemap_set_based_again` correction.

### Safe language URL migration

Keep existing indexed URLs until equivalent translated resources and redirects can be verified. First introduce a route-locale resolver shared by loaders, query keys, canonical generation, HTML lang/dir and links. Then expose `/fr/...` and `/ar/...` only for available content, with self-canonicals and reciprocal `fr-MA`/`ar-MA` alternates; use `x-default` for the actual default/selector. Article language fallback must never advertise a translation that does not exist. Add a complete old-to-new redirect map and language-aware sitemap tests before enabling permanent redirects. Test direct SSR and hydration in both locales. This branch does not advertise alternate URLs that the application cannot yet serve.

## 6. Monitoring

Existing channels: GitHub `ops-alert` issues mentioning the owner for season/news/workflow failures; configured database webhook for failing health and recovery. Database cron checks every five minutes independently of delayed GitHub scheduling. Provider refresh, live-score freshness, cron failures, scoring/lifecycle, deadline locks and news publication are monitored. Browser error counts are privacy-preserving warnings, not a public-endpoint paging mechanism.

At 15:38:44 UTC, health reported all checks OK; lifecycle last ran at 15:35, news publication at 15:38, provider refresh at 13:43. Ten unhandled browser errors had been reported since 14:00, mostly `/news/:id`; healthy aggregate status does not mean zero user errors.

The webhook exists and is enabled, but `last_sent_at` and `last_request_id` are null. Delivery is **not verified**. Local alert tests verify formatting, deduplication, recovery and failure handling against mocked transports. They do not prove an owner received a message. No synthetic production failure was injected.

## 7. Deployment status

| Status              | Result                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| CODE COMPLETE       | This branch's scoped fixes implemented in separate commits; validation recorded below                          |
| DATABASE APPLIED    | Original launch fixes already recorded; this branch has no schema changes                                      |
| PRODUCTION DEPLOYED | Not performed; main and Lovable production are separate                                                        |
| PRODUCTION VERIFIED | Database state/health and bounded queries verified; frontend, fresh-user journey and alert delivery incomplete |

`20260925090500_fantasy_league_page_skip_empty` is the only pending repository migration. Its header explicitly requires GW1 to be locked **and scored** first. GW1 is still live. Do not apply it now or alter migration records to make the ledger appear equal.

Both named audit accounts are already absent from `auth.users` (count 0). No further deletion is needed.

## 8. Owner-only actions

1. **Publish after review/merge:** open [the Lovable project](https://lovable.dev/projects/9f9face2-4733-42fd-aa13-174fbe9f6c87) → confirm GitHub main is synced → **Publish** → **Update**. Verify `x-botolago-release` identifies the merged commit and safely test `/auth/login?next=https%3A%2F%2Fexample.com` without following an external destination. Manual owner publication is required by `docs/operations/DEPLOYMENT.md`.
2. **Credentialed acceptance:** GitHub repository → **Actions** → **Fantasy authenticated E2E** → **Run workflow** → target **staging** → confirmation **RUN_FANTASY_E2E** → **Run workflow**. Use the existing `fantasy-e2e` environment; if credentials are absent, Settings → Environments → fantasy-e2e → add `E2E_FANTASY_EMAIL` and `E2E_FANTASY_PASSWORD` for a sanctioned verified fresh test manager. Registration/email verification still needs that account's mailbox acceptance. Do not supply secrets in chat.
3. **Real notification test:** GitHub → **Actions** → **Production watchdog** → **Run workflow** → enable **simulate_failure** → run → confirm receipt of the `ops-alert` notification. Run again with the option off and confirm recovery. This checks the GitHub delivery path; separately confirm the configured webhook channel before treating webhook paging as verified.

No billing change, account deletion or production migration approval is requested for this branch.

## Validation evidence

- Baseline: 2,973 unit tests passed before edits.
- Final unit suite: 2,977 passed, 0 failed, 24,482 assertions across 255 files.
- TypeScript and ESLint passed. Production frontend build passed, and the legal placeholder gate passed without an exemption.
- Targeted auth, SSR, article availability, news and operational alert tests: 93 passed.
- Configuration integrity: 39 guarded files passed; migration filename/security validation passed.
- Local pgTAP was attempted and failed to connect to PostgreSQL. Docker/PostgreSQL are unavailable here. No production pgTAP or migration replay was attempted. PR database CI must pass before merge.
- Browser suite: **19 passed**, including no-JavaScript SEO, French/Arabic anonymous routes at 320, 360, 375, 390, 430, 768 and 1440 pixels, plus first-launch behavior.
- Authenticated Fantasy: six tests skipped because credentials were absent. This is a blocked acceptance gate, not a green Fantasy journey.
- Current build: core `index` chunk 460.68 kB raw / 145.50 kB gzip; shared `primitives` 249.94 / 73.99 kB and `use-unsaved-changes-guard` 233.24 / 92.58 kB. These are build chunks, not a measured route-transfer total. Before the font/payload change, the core chunk was 460.87 / 145.56 kB. No substantial JS reduction is claimed.
- First browser attempt failed on blocked Google Fonts requests. Assertions were retained; the actual external-font dependency was removed. Browser installation used an alternate packaged Chromium after the usual Playwright archive download failed. Local data modes were mock; tests made no production writes.

Fresh migration fingerprints are in `2026-09-25-launch-evidence/migration-ledger.tsv`. Reproduce the read-only comparison with:

```sh
bun scripts/backend/migration-ledger-compare.ts docs/audits/2026-09-25-launch-evidence/migration-ledger.tsv
```

This checks recorded migration content, not a fresh full schema replay. The earlier full schema comparison is documented in `docs/backend/MIGRATION_DRIFT.md`.

Production run evidence: [successful season orchestrator](https://github.com/mrdata007/botolago-foundation/actions/runs/36142756949), [successful prior watchdog](https://github.com/mrdata007/botolago-foundation/actions/runs/36124443302). The watchdog's latest listed run was older than its intended 30-minute cadence; database cron remains the independent alert mechanism. Scheduled GitHub time is not a delivery guarantee.

### Integration with latest main

Main advanced to `d862cf0ef4d282f46c8717a9dceec458d607d11f` during implementation (Pronostics changes). The unpublished branch was rebased cleanly onto it. After integration, 57 relevant tests, TypeScript, production build and five browser/SEO checks passed, including French and Arabic at 390px. The full 2,977-test and 19-browser-test results above precede that unrelated main update.

Publication used the connected GitHub Git Data API because command-line Git had no credentials. Each uploaded blob and commit tree was checked against its local Git SHA; logical commit boundaries were retained. No main ref was changed.

### GitHub verification outcome

Run [36156651234](https://github.com/mrdata007/botolago-foundation/actions/runs/36156651234) passed application quality, migration replay, all **2,283 pgTAP assertions across 85 files**, and schema lint. Generated-type verification was blocked by the external container registry: `public.ecr.aws/supabase/postgres-meta:v0.96.6` returned `toomanyrequests: Data limit exceeded` after four attempts. Recovery generation hit the same limit. This is not evidence of stale types; the overall database job is still red. No assertion or type gate was bypassed. A new CI run is required. The new raw-HTML SEO suite is now explicitly included in application CI. Local lint passed with 14 warnings and no errors.

## 9. Launch verification — 25 September, 16:00–16:25 UTC

This section records the gates that were still open above. Where it conflicts with an earlier status, this section is the newer measurement.

### CI

- Run [36157987718](https://github.com/mrdata007/botolago-foundation/actions/runs/36157987718) on `4af289c` passed everything. That includes 2,283 pgTAP assertions across 85 files, schema lint, and generated-type verification ("Generated database types are current"; the registry did not rate-limit it this time). The application job passed too, with the anonymous and raw-HTML SEO browser suites.
- `f057016` fixed the two review findings:
  - The watchdog now fails when the health payload omits a check that `ops_health_checks()` always emits, or when the payload's verdict disagrees with its own checks.
  - `/fantasy`, `/fantasy/` and `/pronostics/ligues/...` now get `private, no-store`.
- CI on `f057016` is green (database-quality and application-quality). Local results: 2,982 unit tests passed, typecheck passed, lint had 0 errors.

### Fresh-account Fantasy journey (production, owner-approved)

Staging could not run this journey. `srdrflfrfpwixsllveid` has 87 migrations (the latest is `20260921180544`). It lacks the enrolment fix `20260924200000`, has no pg_cron and no users, and its only season is the synthetic 2089/90 one with both gameweeks finalized. The owner chose one clearly named production test account instead.

| Step               | Evidence                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Register           | `compak2026+launch0925@gmail.com` was created at 16:18:11Z through `/auth/register`. The app then showed `/auth/verify`.                                                                                                                                     |
| Verification email | Arrived at 16:18:13Z from `noreply@botolago.com`, in French and Arabic, with both a 6-digit code and a link to `botolago.com/auth/callback`.                                                                                                                 |
| Verify             | The code was entered on `/auth/verify`. `email_confirmed_at` is 16:18:40Z. The optional profile step was skipped.                                                                                                                                            |
| Legal squad        | The squad is 2 GK, 5 DEF, 5 MID and 3 FWD, with at most 3 players per club. It cost 86.4 of 100 (bank 13.6). The create screen said "Journée 2 · Date limite : 2 oct., 15:30" and "La Journée 1 est clôturée. Votre équipe jouera à partir de la Journée 2." |
| Submit             | Team "QA Launch 0925" (`a5fb2af2-2f82-404e-9841-0b171ec41046`) was saved. Its `current_gameweek_id` is GW2 (`d4324127-…`), with one unlocked GW2 lineup of 15 players and 15 squad memberships.                                                              |
| Refresh            | `/fantasy/team` showed the same 15 players after a reload.                                                                                                                                                                                                   |
| Log out / log in   | While logged out, `/fantasy/team` showed "Compte requis". After a password login, the same 15 players came back.                                                                                                                                             |
| Gameweek/deadline  | The hub shows "Journée 1 · EN DIRECT" and "Journée 2 · Prochaine date limite · ven. 2 oct., 15:30", which is 14:30 UTC and matches the database.                                                                                                             |
| Errors             | The run had no 4xx/5xx responses and no page errors.                                                                                                                                                                                                         |
| Writer record      | Before (16:15:06Z): 26 users, 6 teams, 6 lineups, 90 lineup players, 94 memberships. After (16:23:03Z): 27, 7, 7, 105, 109. Exactly one account and one team were added. GW1 and GW2 were unchanged.                                                         |

Follow-up, not a data defect: during a live gameweek, `/fantasy/team` and `/fantasy/points` follow the season's current gameweek. A manager who joined for GW2 therefore sees "Journée 1 · EN DIRECT" and gets "deadline passed" on edits until GW2 opens. Existing managers see the same thing. The saved GW2 lineup is correct.

### Alert delivery and recovery

| Path             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub issue     | Watchdog run [36159173673](https://github.com/mrdata007/botolago-foundation/actions/runs/36159173673) ran with `simulate_failure`. It opened [#218](https://github.com/mrdata007/botolago-foundation/issues/218) at 16:11:58Z, mentioning `@mrdata007`; the only failing check was `simulated_failure`. The clean run [36159264917](https://github.com/mrdata007/botolago-foundation/actions/runs/36159264917) posted "Recovered" and closed #218 at 16:12:45Z. |
| Database webhook | `app_private.ops_alert_state` was enabled but had never sent. The Vault URL's host is `hooks.slack.com`. One owner-approved TEST message sent through the same URL (`net.http_post` request 13) got HTTP 200 `ok` from Slack at 16:14:25Z. No alert state or data was changed.                                                                                                                                                                                  |
| Receipt          | The owner must confirm the GitHub notification for #218 (email or app) and the TEST message in the Slack channel. The connected Gmail (`compak2026@gmail.com`) is not the GitHub notification inbox for `@mrdata007`.                                                                                                                                                                                                                                           |

**Owner result (about 17:00Z): neither message arrived.** The owner did not see the GitHub notification for #218 or the Slack TEST message. Both systems accepted the alert, so it was delivered somewhere the owner does not look: a Slack channel or workspace the owner does not use, and a GitHub notification address or setting the owner does not read. Alert delivery to the owner is therefore **not working** and remains a launch blocker. `20260926001000_ops_alert_email` adds email to the owner's inbox through the site's own sender, plus a one-call delivery test (`app_private.ops_alert_test()`). See `docs/operations/ALERTS.md`.

### Production frontend

- `x-botolago-release` is `d862cf0ef4d282f46c8717a9dceec458d607d11f`, which is current `main`.
- `/auth/login?next=https://example.com`, `next=//example.com` and `next=/\example.com` each answer 307 to `/auth/login`. With a safe `next=/fantasy/team`, the register link keeps `next=%2Ffantasy%2Fteam`.
- Raw HTML (no JavaScript):

  | Page                 | Status | Result                                                      |
  | -------------------- | ------ | ----------------------------------------------------------- |
  | `/`                  | 200    | h1, 3 match links, 5 club links, 3 article links, canonical |
  | `/matches/standings` | 200    | 16 club links                                               |
  | `/clubs`             | 200    | 16 club links                                               |
  | `/news`              | 200    | 10 article links; no canonical yet                          |
  | `/matches`           | 200    | h1 and canonical, but no match links (about 2.4 kB of text) |

  None of these pages has `noindex`. The missing `/matches` links and the missing `/news` canonical are what this PR fixes. They stay open until it is merged and published.
