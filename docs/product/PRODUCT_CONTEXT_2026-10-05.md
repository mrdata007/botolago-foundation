# BotolaGO product context — evidence snapshot, 2026-10-05

This is the dated evidence behind [`PRODUCT.md`](../../PRODUCT.md). `PRODUCT.md` holds durable
product truth for Impeccable and other agents. This file holds what changes week to week, and where
each claim comes from.

- **Do not keep this file up to date.** It is a snapshot. When the facts move, write a new dated
  snapshot and update `PRODUCT.md`.
- **How it was made:**
  - It is a read-only pass over the repository (docs, code, migrations, production `APPLIED_*`
    records).
  - The public site was checked with plain unauthenticated `GET` requests.
  - No database was queried, and no application code was changed.
- **Status words used below:**
  - **Live**: deployed on botolago.com, with production evidence (public unless the row says otherwise).
  - **Off**: built in code, but switched off or not delivering.
  - **Planned**: described in a plan, with no code behind it.
  - **Unknown**: the evidence does not settle it.

## 1. Owner answers (2026-10-05)

| Question                                       | Answer                                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who should refinement serve first?             | Fans first, Fantasy grows: Moroccan fans (at home and abroad) who check scores, results and the table; Fantasy is the main sign-up goal.                                                                          |
| Which language do most users read?             | About even between French and Arabic (an estimate; no measured split exists in the repository).                                                                                                                   |
| Should the writing style stay as it is?        | Yes: French _vous_, Modern Standard Arabic (no Darija), short, direct, no hype, never invents numbers.                                                                                                            |
| How should future screen work start?           | Straight in code, recorded as `"buildPath": "code"` in `.impeccable/config.json`.                                                                                                                                 |
| Brief given with the request (owner, same day) | Refinement, not redesign. Preserve brand identity, working features, business rules and the frontend stack. Capacitor distribution later. Do not invent features or present planned ones as live; label unknowns. |

The owner also set rules for all future approved screen work:

- inspect the screen first;
- write down the preserve list, improvements and acceptance criteria;
- work on a separate feature branch, and validate;
- preserve BotolaGO's identity and business logic;
- open a draft pull request, then wait: nothing is merged or deployed without the owner's approval.

These rules are recorded in [`AGENTS.md`](../../AGENTS.md#screen-work). They do not authorise any
interface change during setup or a read-only audit.

## 2. What the public site served

- **Version:** on 2026-10-05, `https://botolago.com/` carried
  `<meta name="botolago-release" content="236afae3b21c5f70eb64c60ac4520913cf347a6d">`. That is the
  repository's `main` at the time (the merge of PR #345), so the published site matched the code.
  Publishing stays a manual owner step in Lovable (`docs/operations/DEPLOYMENT.md`).
- **French, server-rendered:** every public French route returned 200 with server-rendered HTML and
  `<html lang="fr" dir="ltr">` (`src/routes/__root.tsx`).
- **No language URLs:** `/ar`, `/ar/matches` and `/fr` returned 404 (`docs/engineering/LANGUAGE_URLS.md`:
  "plan, not built").
- **Sitemap:** 15,711 URLs, of which 15,690 are `/news/<edition>` articles. It holds no match or club
  detail pages and no `/ar` URLs.
- **Missing install pieces:** no `theme-color` meta, no web manifest, and one shared `og-image.jpg` on
  every page.

## 3. Feature status

### Live

| Area                    | What exists                                                                                                                                                                                                                                       | Evidence                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matches and live scores | Calendar, live strip, match page (Résumé / Stats / Compos / Face à face). The server polls SportsMonks every 2 min in play and every 5 min just before kick-off; the page re-checks every 30 s.                                                   | `supabase/migrations/20260924200500_football_live_refresh_cadence.sql`; `docs/audits/2026-09-25-launch-evidence/migration-ledger.tsv`; `src/lib/match-refresh.ts`; live `/matches`                                    |
| Match details           | Events, team stats, lineups, absences, xG and pressure (each shown only when the provider sends it)                                                                                                                                               | migration ledger rows for `20260925141500` and `20260925170000`; `src/routes/matches.$matchId.tsx`                                                                                                                    |
| Fan match votes         | Who wins, both teams score, first goal; no points                                                                                                                                                                                                 | `docs/production/APPLIED_2026_09_25_MATCH_VOTES.md`                                                                                                                                                                   |
| Standings               | Computed from results and labelled "provisoire" / "non officiel"; zones for the CAF competitions and relegation                                                                                                                                   | `src/routes/matches.standings.tsx`; `src/components/matches/StandingsTable.tsx`; live `/matches/standings`                                                                                                            |
| Clubs                   | 16-club directory, club pages (Aperçu / Matchs / Classement / Effectif), follow                                                                                                                                                                   | `src/routes/clubs.*.tsx`; live `/clubs`                                                                                                                                                                               |
| News                    | ElBotola licensed archive since 2021-09-23 (about 15,690 editions, 13,212 of them Arabic), credited "Source : ElBotola" on French editions and "المصدر: البطولة" on Arabic ones, with a link; editorial CMS in `/admin/news`                      | `src/lib/feature-flags.ts` (`NEWS_ENABLED`); `docs/backend/NEWS_LAUNCH_REPORT.md`; `supabase/migrations/20260924170000_news_feed_indexes.sql` (Arabic count); `src/routes/news.$articleId.tsx` (credit); live `/news` |
| Fantasy                 | Ruleset v1 game; leagues by invite code; global rankings; gameweek recap; guest squad building                                                                                                                                                    | `docs/backend/FANTASY_RULES_V1.md`; `src/routes/fantasy.*.tsx`; `docs/production/APPLIED_2026_10_04_GW1_LEFT_OUT_PLAYERS.md`                                                                                          |
| Prizes                  | Gameweek "Recharge mobile + maillot d'un club de la Botola" (500 MAD), monthly "Smartphone" (2,500 MAD; awarded per block of 4 gameweeks), season "Voyage pour le derby + smartphone haut de gamme" (25,000 MAD), all from Go Sports Technologies | `docs/production/APPLIED_2026_09_24_FANTASY_PRIZES.md`; `src/content/legal/prize-terms.ts`                                                                                                                            |
| Pronostics              | Database mode `public` since 2026-09-25 14:56 UTC; 3 / 1 / 0 scoring; round and season boards; mini-leagues sharing Fantasy league codes                                                                                                          | `docs/production/APPLIED_2026_09_25_PREDICTIONS.md`; live `/pronostics`                                                                                                                                               |
| Pépites                 | Under-23 ranking. Database mode `public` per the 2026-10-04 record. It shows the 2025/26 final ranking until the first 2026/27 Top 10 (chosen by the editors) after round 3; none had been published at the last record                           | `src/lib/feature-flags.ts` (`PEPITES_ENABLED`); `docs/production/APPLIED_2026_10_04_GW1_LEFT_OUT_PLAYERS.md`; live `/pepites`                                                                                         |
| Landing page            | `/jouer`, and `/` for first-time signed-out visitors                                                                                                                                                                                              | `docs/engineering/LANDING_PAGE_2026_10_03.md`; `src/routes/index.tsx`; live `/jouer`                                                                                                                                  |
| Accounts                | Email + password with an emailed 6-digit code; optional two-step sign-in (TOTP); account-deletion request                                                                                                                                         | `src/routes/auth.register.tsx`; `src/routes/profile.security.tsx`; `src/routes/profile.tsx`                                                                                                                           |
| Legal                   | Terms v1.1 (24 Sept 2026), Privacy v1.2 (25 Sept 2026), prize rules                                                                                                                                                                               | `src/content/legal/documents.ts`; live `/terms`, `/privacy`                                                                                                                                                           |
| Analytics               | Seline: cookieless, EU-hosted, botolago.com production only                                                                                                                                                                                       | `src/lib/analytics.ts`; `src/lib/feature-flags.ts` (`ANALYTICS_ENABLED`)                                                                                                                                              |
| Admin console           | Deployed, staff only (not public), with MFA: staff, approvals, audit, security, news CMS, users and bans, prizes, Pépites data, player mapping                                                                                                    | `src/routes/admin*.tsx`; `docs/production/APPLIED_2026_09_24_ADMIN_USER_MODERATION.md`                                                                                                                                |

### Off: built, but switched off or not delivering

| Item                                            | Status                                                                                                                                                                                                                                                                  | Evidence                                                                                                                                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email notifications                             | Mode `off` at the last record (2026-10-04). Affected: match-day previews and results, kick-off alerts, Fantasy deadline and recap emails, and the Pépites weekly email.                                                                                                 | `docs/backend/EMAIL_NOTIFICATIONS.md`; `docs/production/APPLIED_2026_10_04_GW1_LEFT_OUT_PLAYERS.md`                                                                                                                                |
| In-app inbox, match reminder bell               | The inbox (`/notifications`) and bell are built. Inbox rows are created by the email tick, which stops before that step while mode is `off`, so very probably nothing arrives.                                                                                          | `supabase/migrations/20260924140100_notification_email_delivery.sql`; `docs/backend/FANTASY_FINALIZED_NOTIFICATIONS.md`                                                                                                            |
| Dark mode                                       | The theme machinery is built; `DARK_MODE_ENABLED = false`. Fantasy has no dark version yet (BG-0084, queued)                                                                                                                                                            | `src/lib/feature-flags.ts`                                                                                                                                                                                                         |
| Google / Apple sign-in                          | `OAUTH_PROVIDERS_ENABLED = true`, so the buttons render. The flag's own note says the providers were not enabled in Supabase. **Unknown** whether they work.                                                                                                            | `src/lib/feature-flags.ts`; `docs/engineering/LANDING_PAGE_2026_10_03.md`                                                                                                                                                          |
| Fantasy Cup, public leagues                     | Screens and copy exist. There is no backend cup, the client only creates private leagues, and the join function accepts only private codes. Head-to-head leagues are only a disabled option with "coming later" copy.                                                   | `src/services/fantasy-runtime.ts`; `src/routes/fantasy.leagues.join.tsx`                                                                                                                                                           |
| AI-written articles                             | "Ships switched off"; no record of the migration in production                                                                                                                                                                                                          | `docs/backend/AI_CONTENT_GENERATION.md`                                                                                                                                                                                            |
| GNews ingestion, earlier ElBotola metadata feed | Dormant; their schedules are removed or commented out                                                                                                                                                                                                                   | `docs/backend/GNEWS_INTEGRATION.md`; `.github/workflows/g5-production-gnews-schedule.yml`; `.github/workflows/news-elbotola-recovery.yml`                                                                                          |
| Sofascore / Flashscore Fantasy data             | Chosen as Fantasy's player-data sources (owner, 2026-10-01). 191 reviewed Sofascore identity mappings and 0 Flashscore on 2026-10-03; the reconciled scoring path is built with no production record. GW1 and GW2 were scored from SportsMonks data.                    | `docs/backend/FANTASY_SOFASCORE_FLASHSCORE_PLAN.md`; `docs/backend/RECONCILED_SCORING_INGESTION.md`; `docs/production/APPLIED_2026_10_03_PLAYER_MAPPING_BULK_189.md`; `docs/production/APPLIED_2026_10_04_GW1_LEFT_OUT_PLAYERS.md` |
| Adaptive Fantasy scoring v2                     | Built; no production activation record                                                                                                                                                                                                                                  | `docs/backend/ADAPTIVE_FANTASY_SCORING.md`                                                                                                                                                                                         |
| Unused pieces                                   | FantasyOnboarding, FantasyImportPrompt, FantasyAccessGate, ConflictBar, LeagueTable, Pitch, PlayerShirt, SquadListToggle, UnsavedBadge and the FantasyBrand lockup: nothing imports them. A deadline-first home layout is switched off (`HOME_DEADLINE_FIRST = false`). | `src/components/fantasy/`; `src/components/brand/FantasyBrand.tsx`; `src/lib/feature-flags.ts`                                                                                                                                     |
| Per-prize sponsor credit                        | Sponsor name and logo ("Offert par {sponsor}") are built into `/prizes` and `/admin/prizes`, but unused: no prize has a sponsor.                                                                                                                                        | `supabase/migrations/20260924120000_fantasy_prizes.sql`; `src/components/prizes/PrizesPage.tsx`; `src/lib/feature-flags.ts`                                                                                                        |

### Planned only

- **Language URLs** (`/ar/...` with hreflang): `docs/engineering/LANGUAGE_URLS.md`.
- **Web push:** step 3 of `docs/engineering/PHASE5_ENGAGEMENT_PLAN.md`. That plan (2 Oct) puts native
  iOS/Android out of scope, which the owner's Capacitor intent now reopens (phone push was then
  built on main; see section 8).
- **Capacitor or any native wrapper:** stated by the owner on 2026-10-05; nothing existed in the
  repository at the time of this check. Superseded the same day: see section 8.
- **Morocco national-team section:** `docs/engineering/MOROCCO_NATIONAL_TEAM_PLAN.md`
  ("plan, not built").
- **Other plans:**
  - Fantasy advice guides (`docs/seo/BOTOLAGO_SEO_OPERATING_SYSTEM.md`);
  - server-made share cards (Phase 5, step 5);
  - the gameweek and leaderboard "présenté par" sponsor placements, which appear only in the pitch
    demo (`demo/src/steps.ts`).

## 4. State at the last records (it will change)

- **Fantasy rounds:** Fantasy GW1 was finalized on 2026-10-04 at 07:28 UTC. GW2 was opened with an
  owner-only "open missed gameweek" tool and finalized at 08:45 UTC. GW3 was `not_staged` because the
  provider had not published round 3. The hourly orchestrator and the 5-minute Fantasy tick were
  switched back on (`docs/production/APPLIED_2026_10_04_GW1_LEFT_OUT_PLAYERS.md`).
- **New teams:** on 2026-10-03 new Fantasy teams could not be created, because there was no round to
  join. The landing page then shows "Les inscriptions sont fermées pour cette journée" with the
  button "Découvrir le jeu" (`src/components/landing/LandingPage.tsx`, `src/i18n/dictionary-fr.ts`). The current availability state renders in the
  browser only, so the server HTML could not show it.
- **Scale:**
  - GW1 had 6 ranked teams and GW2 had 7, several of them QA, E2E or staff teams.
  - On 2026-09-25 there were 26 to 28 accounts, test and audit accounts included
    (`docs/audits/2026-09-25-LAUNCH-FIXES.md`; `docs/production/APPLIED_2026_09_25_SITEMAP_AND_AUDIT_ACCOUNTS.md`).
- **Prize winners:** GW1 and GW2 winners were recorded as pending staff verification; staff team
  `ak47 FC` was skipped.
- **News freshness:** the newest article on the site was dated 23 Sept 2026. The archive import runs
  only when started by hand; no automated source is switched on, and nothing newer had been
  published through the editorial CMS.
- **Pépites:** it showed "Classement final 2025/2026" and announced the first 2026/27 Top 10 after
  round 3.

## 5. Open questions

| Question                                                                                      | Why it matters                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When will email notifications be switched on?                                                 | At the last record (2026-10-04, email mode `off`), the reminder bell and several toasts promise emails that are not sent, and the inbox very probably stays empty.                                                                                                                                                |
| Are Google / Apple sign-in providers enabled in production Supabase?                          | If not, the sign-in and sign-up screens show dead buttons.                                                                                                                                                                                                                                                        |
| Will the Fantasy Cup and public leagues be built, or their screens removed or relabelled?     | Refinement should not polish dead paths.                                                                                                                                                                                                                                                                          |
| How will Capacitor load the app: the remote server-rendered site, or a bundled client?        | Auth redirects, deep links, safe areas (`viewport-fit=cover` is missing), push and frame headers all depend on it.                                                                                                                                                                                                |
| Which language-URL plan, if any, is adopted?                                                  | Arabic readers get a French first paint today, and Arabic pages other than articles cannot be indexed.                                                                                                                                                                                                            |
| Which brand blue is canonical: the logo's `#0151fc` or the interface's navy token?            | Refinement must preserve identity, and the two values differ.                                                                                                                                                                                                                                                     |
| Is there an Arabic-script form of "BotolaGO"? `بوتولاجو` appears once.                        | Copy and future store listings need one rule.                                                                                                                                                                                                                                                                     |
| Which Arabic Top 10 label is final for Pépites, `أفضل 10` or `توب 10`?                        | Terminology consistency.                                                                                                                                                                                                                                                                                          |
| Is the Arabic club-name seed applied?                                                         | If not, club names show in Latin script on Arabic screens.                                                                                                                                                                                                                                                        |
| Who made the stadium photography and object renders, and under what licence?                  | It decides reuse in marketing, share images and store screenshots.                                                                                                                                                                                                                                                |
| What formal accessibility target applies (for example WCAG 2.2 AA)?                           | Practice follows AA thresholds, but no formal conformance level is written down for the public app (the admin console specs ask only for WCAG AA contrast).                                                                                                                                                       |
| What do Seline and other dashboards outside the repository show about real users and devices? | The repository has no audience evidence beyond the owner's answers.                                                                                                                                                                                                                                               |
| Who acts as "la rédaction" that Pépites copy credits?                                         | The only staff account on record (2026-09-22) is the owner's.                                                                                                                                                                                                                                                     |
| Is Morocco's year-round UTC+0 from 2026-09-20 confirmed?                                      | Every kick-off and deadline display depends on it. Its legal source (decree n° 2.26.530, IANA tz 2026c) is cited only in code comments (`src/lib/morocco-time.ts`, `supabase/functions/_shared/morocco-time.ts`), never in a document; `docs/production/HUMAN_ACTIONS_2026_09_21.md` still says Morocco is UTC+1. |

## 6. Interface copy that disagrees with the product

These are recorded for future refinement work. Nothing was changed.

- **Promises that are not delivered:**
  - The reminder bell, the Pépites weekly toast and the Fantasy hub's email switch promise emails and
    reminders that email mode `off` does not deliver.
  - Fantasy help (`fpl.help.a.team_name`) says "Contactez l’équipe BotolaGO depuis votre profil pour
    toute modification", but Profile has no contact entry.
- **Features that do not exist:**
  - The Cup copy (`fpl.cup_*`, `fpl.cups`) and the join screen's `fpl.public_help` ("… et 3 ligues
    publiques") describe features that do not exist.
  - The Fantasy onboarding copy mentions "bonus" points, which ruleset v1 disables; the component is
    not mounted.
- **Wrong numbers:** `fantasy.rules.scoring_desc` gives a goalkeeper goal 6 points, while ruleset v1
  gives 10.
- **Inconsistent naming:**
  - French uses "Matches" in the nav, the Matches title, the standings column "Matches joués" and the
    Fantasy player tab, but "Matchs" elsewhere.
  - `/matches/standings` has the h1 "Matches", and `/pepites` has no h1.

## 7. Documents that disagree with code or production

Prefer the latest dated `APPLIED_*` record and the code over these. An `APPLIED_*` record is true for
its date and can be superseded by a later migration.

- **`docs/engineering/LAUNCH_LEDGER.yaml`** (its header says updated 2026-09-21, though some entries run
  to 2026-09-26) is stale on several points: the legal
  texts (they exist), the CMS (deployed), News (on), Arabic letter-spacing (fixed) and team
  translations (table created).
- **Pépites status:**
  - `PEPITES_PLAN.md`, `PEPITES_ARCHITECTURE.md` and `PEPITES_V1_1_HANDOFF.md` say Pépites is off or
    unbuilt; production says `public`.
  - The comments in `src/routes/pepites.tsx` and `.github/workflows/backend-quality.yml` are also
    stale.
- **Live refresh cadence:** `AGENTS.md` and `docs/production/APPLIED_2026_09_24_LIVE_REFRESH_ON.md`
  say 15 minutes; migration `20260924200500` changed it to a 1-minute tick calling the provider every
  2 minutes in play.
- **`docs/engineering/DESIGN_SYSTEM_V2.md`** is behind the code on:
  - the language chooser (now an opaque sheet, not the dark mesh);
  - Pépites, which it never mentions (it takes Profile's bottom-nav slot, and Profile moves to the top
    bar);
  - route transitions (now built);
  - Changa's source (self-hosted).
- **Admin console look:** `src/styles.css` and ledger BG-0144 say the admin console is dark;
  `src/routes/admin.tsx` uses the light product look.
- **Older plans:** `docs/backend/ENVIRONMENTS.md`, `FOOTBALL_DOMAIN_PLAN.md`, `NEWS_DOMAIN_PLAN.md` and
  `NOTIFICATIONS_DOMAIN_PLAN.md` describe pre-launch states.
- **`.lovable/plan.md`** describes `/fantasy/rankings` as unbuilt, with glass surfaces. The route
  exists, and Option A cards and surfaces are opaque (glass survives only as a button wash on club
  blocks, photos and the mesh).
- **Sign-up email:** ledger BG-0106/BG-0108 describe the stock Supabase sign-up email. The 2026-09-25
  audit shows mail from `noreply@botolago.com` in French and Arabic.

## 8. Merged to `main` after the site check (later on 2026-10-05)

Sections 1 to 7 describe the repository at `236afae`. This work was merged afterwards, up to `main` at
`b6d91af`. None of it was checked against the live site.

| Item                                  | Status in the repository                                                                                                                                                                                                                                                                 | Evidence                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Phone app (Capacitor shell)           | The shell opens the live site; the offline page, the phone-side push code and a manual-only Codemagic cloud build are written; per the doc, "no build has ever been run and nothing has been tried on a real phone". This answers the section 5 question on how Capacitor loads the app. | `docs/mobile/PHONE_APP.md`; `capacitor.config.ts`; `codemagic.yaml`                    |
| Push alerts, sending side             | Kick-off reminder, 1-hour and 24-hour Fantasy deadlines, final score, goals and "goal cancelled" can be queued per phone. The switch ships `off`, the dispatcher function is not deployed, and no phone can register yet. **Unknown:** whether the push migrations are applied.          | `docs/backend/PUSH_NOTIFICATIONS.md`                                                   |
| Public gameweek recaps                | Opt-in public recap of a finalized gameweek at `/journee/<publicId>`. Both switches are off after the migration. **Unknown:** whether the migration is applied.                                                                                                                          | `docs/backend/FANTASY_PUBLIC_RECAPS.md`; `src/routes/journee.$publicId.tsx`            |
| Home "Mes clubs" row, match-page tabs | A Home row with each favourite and followed club's next match; match pages open on their tabs once a match is live or finished.                                                                                                                                                          | `src/components/home/MyClubsRow.tsx`; git log of `main`                                |
| Pépites photo publishing              | A GitHub Actions button publishes approved player photos, pausing the Pépites tick during the run.                                                                                                                                                                                       | `.github/workflows/pepites-photo-publish.yml`; `scripts/backend/pepites-tick-pause.ts` |
