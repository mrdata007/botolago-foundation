# Lead notes (facts gathered by the lead, 2026-09-24)

## Repo / CI / tests (VERIFIED locally)
- Branch merged with origin/main d257de7 (PR #195). Working tree clean except .audit-tmp (git-excluded).
- `bun run typecheck` exit 0. `eslint .` (excluding .audit-tmp): 0 errors, 14 warnings (react-refresh/only-export-components).
- `bun test`: 2599 pass / 0 fail across 216 files (18.7s).
- migrations check: 90 validated; secrets check: none; config integrity: 37 files OK; legal gate: OK.
- `backend:types:check` needs Docker -> cannot run here (Docker unavailable). pgTAP (65 files) cannot run here.
- CI backend-quality.yml: runs on pull_request + push to backend/* branches only. NOT on push to main (post-merge main is not re-verified). Last 8 PR runs all success (run 630).
- Shallow clone: `git merge-base --is-ancestor c72f9ad origin/main` said NOT ancestor but the clone was --depth 50; treat "force push" as UNVERIFIED/likely shallow artefact.

## Live site (VERIFIED with curl 16:23 UTC)
- / 200 TTFB 0.35s 45KB; /matches 200; /news 200; /fantasy 200; /clubs 200 (1.0s); /matches/standings 200; /sitemap.xml 200 2.7MB 2.2s; /robots.txt 200; /nonexistent 404 (real 404). /fr and /ar -> 404 (no language URLs).
- Headers: HSTS, nosniff, referrer-policy strict-origin-when-cross-origin, cache-control no-cache. Missing: CSP, X-Frame-Options, Permissions-Policy. server: cloudflare, x-deployment-id psr2 (Lovable hosting).
- Playwright (Chromium 1194 via proxy + SPKI) 390px home: 0 console errors, 8 supabase requests, first-visit language chooser h1 "Bienvenue sur".
- Google + Apple OAuth ARE enabled on prod auth (302 to accounts.google.com / appleid.apple.com). OAUTH_PROVIDERS_ENABLED=true consistent.

## Feature flags (src/lib/feature-flags.ts)
NEWS_ENABLED=true (since 2026-09-24, ElBotola licensed), DARK_MODE_ENABLED=false (contrast defects BG-0083/84), OAUTH_PROVIDERS_ENABLED=true, PRIZES_ENABLED=false.

## Error reporting
src/lib/lovable-error-reporting.ts only forwards to window.__lovableEvents / __lovableReportRuntimeError (editor preview only). No Sentry/other. => production has no client error monitoring (LIKELY; check live HTML for lovable.js).

## Production DB (read-only, 16:30 UTC)
- auth.users 26 (3 unconfirmed, 20 created in last 7d); profiles 26; fantasy_teams 6; fantasy_leagues 2; memberships 2; fantasy_players 539; players 929; teams 21; fixtures 496; stories 14302; article_editions 15798; notifications 0; user_bans 0; deletion requests 0.
- Fantasy season 2026/2027 status registration_open; ONLY ONE gameweek row: GW1 status open, deadline 2026-09-24 13:30Z (passed), starts 15:00Z, ends 2026-09-28, points_state provisional, finalized_at null.
- Fantasy season orchestrator GH workflow (hourly cron 12 * * * *, gated by vars.FANTASY_AUTOMATION_ENABLED): runs #36 (09:57Z) and #37 (15:02Z) today FAILED at step "Orchestrate the Fantasy season"; earlier runs succeeded. -> investigate logs.
- football-current-season-recovery.yml daily 07:43Z: scheduled runs all "skipped" (vars.FOOTBALL_CURRENT_SCHEDULE_ENABLED not 'true').
- Launch ledger (docs/engineering/LAUNCH_LEDGER.yaml, updated 2026-09-21) open items include P0: BG-0087 fixtures stop after matchday 1; BG-0106/0107/0108 signup email (stock template, callback allowlist, built-in mail rate limited); BG-0073 global ranking empty; BG-0088; BG-0021 credential rotation; BG-0004 orchestrator var. Many may be resolved since; verify.
- docs/production/HUMAN_ACTIONS_2026_09_21.md §2.4: "Signup is STILL broken" as of 09-21 (built-in Supabase mail rate-limited, /auth/callback not allowlisted). Current state UNVERIFIED without a signup test.
- Production has no QA accounts except 3 synthetic e2e.* accounts whose credentials are GitHub secrets (not available here).

## Production capacity observations (16:30–16:43 UTC, WHILE 7 audit agents were reading the site/DB)
- max_connections=60; 26 connections, 11–13 active (mostly PostgREST from the site under audit load).
- Trivially cheap queries (EXPLAIN cost < 4000, HashAggregate over 15.8k rows) took >20s (statement_timeout) and >60s (MCP timeout); a pg_stat_activity aggregation from another audit session was 22s old. No lock waits, no IO waits → CPU starvation (tiny compute).
- pg_cron: news-publish-due-editions failed 3x and notification-email-tick 1x with "job startup timeout" at 16:35–16:38 (none in the previous 7 days) → coincides with audit load.
- Auth: POST /auth/v1/token (bad creds) took 14.7s, 8.3s, 4.1s; /auth/v1/health 0.79s; REST root 0.17–0.39s.
- Live signup attempt (alisarhane73+audit20260924@gmail.com) at 16:41: POST /auth/v1/signup hung >60s, browser showed "Connexion impossible. Vérifiez votre réseau et réessayez." (CORS preflight itself is fine: OPTIONS 200 with ACAO * in 0.36s). RETRY when quiet. Unknown whether a user row was created (check auth.users for the alias later).
- MUST re-measure all of the above after agents finish to separate baseline from audit-induced load.
- Auth settings (public /auth/v1/settings): email signup on, google+apple on, mailer_autoconfirm false, disable_signup false, anonymous off.

## Fantasy orchestrator failure (VERIFIED from GH job logs)
- Run #37 (15:02Z) step "Refresh provider fixtures and results" → `CURRENT_SEASON_RECOVERY_FAIL code=current_squad_empty_or_oversized` (scripts/backend/current-season-recovery.ts:354 validateCurrentSquads: needs exactly 16 squads with 1..100 members) → then `FANTASY_ORCHESTRATOR_FAILED` because RECOVERY_STEP_OUTCOME=failure. Run #36 (09:57Z) also failed (same step per step list; log tail cut). Run #35 (04:44Z) succeeded. Mode: canary.
- Consequence: no provider refresh and no orchestration since ~05:00Z on the first Fantasy matchday (GW1 kicks off 2026-09-24 15:00Z, deadline 13:30Z). Ledger BG-0005 (promoted-club squad guard) is BLOCKED.
- Current season 2026/2027 (id d03223b0…): only 2 rounds / 16 fixtures loaded (round 1: 24–27 Sep, round 2: 2–3 Oct; statuses not_started, postponed). 496 fixtures total across 3 seasons. Only ONE fantasy_gameweeks row exists. rounds.starts_at null.

## Lead verifications of stream findings (17:05 UTC)
- Frontend: VERIFIED eager mock repos (src/services/football.ts:45-46), un-memoised hub() (src/services/fantasy-runtime.ts:177), router.tsx has no defaultErrorComponent/defaultPendingComponent, `bun audit` flags sanitize-html (direct, >=1.9.0 <=2.17.6) + 41 advisories mostly build chain.
- Backend: VERIFIED via SQL: round 1 has 8 fixtures; FAR Rabat–Raja Casablanca 2026-09-24 15:00Z status postponed with home_score/away_score 0/0 (should be null); first real match Amal Tiznit–Ittihad Tanger 20:00Z; GW1 deadline 13:30Z = 90 min before the POSTPONED fixture → deadline 6.5 h too early. postgres_logs show `fantasy_fixture_resolution_required` in the 15:00Z hour (1 hit). "WCA" short_name for Wydad still in data (BG-0110 open).
- Security: VERIFIED live open redirect: `curl https://botolago.com/auth/login?next=https://evil.example` SSR HTML contains href="/auth/register?next=https%3A%2F%2Fevil.example"; deployed chunk auth.login-CrvznNXP.js (5,015 B) contains `window.location.href=n` and NO startsWith sanitiser; repo main has sanitizeNext since 3dca4cd (2026-09-21 20:28Z) → live deployment is behind main for this route; repo sanitiser itself bypassable with "/\evil.example" (per security stream node demo).
- Live raw HTML: only /assets/index-*.js + /~flock.js (Lovable web-vitals → api.tinybird.co). 0 JSON-LD blocks on the homepage. No lovable-badge in HTML.
- SEO (lead-verified locally from saved artefacts): sitemap.xml = 15,699 URLs (15,690 /news/*, 9 static; NO /matches/*, /clubs/* URLs), all 15,690 article lastmod values dated 2026-09-24 (15,670 in the 12:00Z hour) → false modification dates; 2.7MB uncompressed (content-length 2716524, no content-encoding), cache-control public max-age=300, no <news:> or <image:> tags, 5,984 hreflang xhtml:link entries. Raw SSR HTML: home 330 visible chars / 7 distinct nav links, /news 118 chars / 0 article links. Article fetches under load: 9/24 returned the 20,163-byte "Actualités — BotolaGO" shell with robots noindex and no JSON-LD (loader error path).

## Quiet-time re-measurement (17:24 UTC, 0 active DB backends, all audit browsers stopped) — VERIFIED
- auth POST /token (bad creds): 0.77 / 0.29 / 0.44 s (vs 4.1–14.7 s at 16:41–16:43 under audit load).
- rpc news_feed (fr, 10): 0.45 / 0.31 / 0.34 s. rpc football_matches_by_date (today, Casablanca, 20): 1.50 / 1.54 s IDLE → pg_timezone_names scan baseline; exceeds the 3 s anon timeout with very few concurrent callers.
- HTML TTFB: / 0.40 s, /matches 0.41 s, /news 0.36 s.
- article_editions group-by and team_memberships join: instant (were >20 s under load). cron failures: 14 between 16:35 and 16:48 UTC (audit window), none since.
- Conclusion: the 16:20–16:48 outage (statement timeouts, PostgREST 500s, cron "job startup timeout") was caused by the audit's ~1.5 req/s of concurrent RPCs on a Micro-class instance. Baseline is acceptable at idle but has no headroom.
- Squad sizes (current season): 16 Botola Pro clubs have 21–47 memberships; 5 non-current clubs still `active=true` with 0 memberships (Chabab Mohammédia, JS Soualem, Olympic Safi, Olympique Dcheïra, Yacoub El Mansour) — ledger BG-0043. Which provider squad tripped `current_squad_empty_or_oversized` is UNVERIFIED (needs the workflow artefact / provider token).
- News editions: fr published 2,478 (34 in last 7 d), ar published 13,212 (34 in last 7 d); newest published 2026-09-23 22:23Z; every edition's updated_at = 2026-09-24 12:57Z (bulk bump → false lastmod/dateModified). 108 archived legacy stubs.
- Design stream correction: `continueAsGuest()` (auth-supabase.ts:320) only writes a local guest flag; it does NOT create an anonymous auth user (anonymous sign-ins are disabled in prod settings).

## Authenticated journey (lead, 17:25–17:40 UTC, quiet) — VERIFIED
- Signup #1 alisarhane73+audit20260924@gmail.com at 17:25: POST /auth/v1/signup 200 in 3.2 s, auth user created (unconfirmed; mailbox not connected to this session, so NOT verified). Signup #2 compak2026+audit20260924@gmail.com at 17:28: 200 in 3.0 s; confirmation email from noreply@botolago.com arrived at 17:28:17 (3 s), bilingual FR/AR subject "BotolaGO | Confirmez votre adresse e-mail | أكّد بريدك الإلكتروني", contains link (redirect_to=/auth/callback?next=/) AND 6-digit code. Custom SMTP is therefore configured (was noreply@mail.app.supabase.io on 2026-09-21 per the compak2026+bg0090 thread; a 09-23 email already showed the custom sender). BG-0106/0107/0108 appear RESOLVED.
- /auth/verify with the code: POST /auth/v1/verify → /auth/profile-setup?next=/ in 3.2 s ("Compte vérifié" toast), 3-step profile setup (photo, display name, username), "Passer" → /. /profile shows name, @audit2026b, email, prefs, security (2FA), legal links, delete account. Session survives reload (sb-…-auth-token in localStorage). Logout via "Se déconnecter" works (token removed, redirect /); `botolago.fantasy.drafts` key survives logout (LIKELY minor).
- Password login: POST /token → / in 2.8 s.
- Fantasy create (signed in, after the GW1 deadline): page shows "Journée 1 · Date limite : 24 sept., 14:30", hub says "OUVERTE". Picker: bottom sheet, club filter lists 21 clubs incl. 5 relegated (Chabab Mohammédia, JS Soualem, Olympic Safi, Olympique Dcheïra, Yacoub El Mansour), price filter, players sorted by price. Filled 15/15 cheapest (bank 13.6): 3-per-club enforced by DISABLING a 4th player of the same club (CODM Meknès at slot 11: 19 disabled rows), already-picked players disabled, position forced by slot. Draft persisted in localStorage across reload (BG-0094 still true: localStorage only). Name step: captain auto-set to first pick (a 4.8 GK Tafay), vice = first DEF. Submit "Entrer l'effectif" → rpc create_fantasy_team **409 PT409 fantasy_gameweek_locked** → UI shows "L'importation a échoué. Aucune modification n'a été enregistrée." (wrong copy: "import failed"; no mention of the deadline; no toast). Server correctly refused; NO fantasy team was created. /fantasy/team, /transfers, /points, /leagues, /leagues/join all redirect to /fantasy/create for a user without a team. Rankings: "0 managers classés".
- Consequence: every user who signs up after 13:30Z today cannot create a Fantasy team, and because only ONE gameweek exists and the orchestrator is failing, there is no GW2 to enrol into → new users are locked out of Fantasy indefinitely, while the hub shows the gameweek as "OUVERTE".
- Production writes made by this audit (for cleanup): auth.users alisarhane73+audit20260924@gmail.com (unconfirmed, no profile completed), compak2026+audit20260924@gmail.com (confirmed, profile "Audit Tester" @audit2026b). No fantasy team, league, follow or article was created.
- fantasy_hub RPC fired 5× on one /fantasy/create load (confirms frontend F4 duplication).
