# BotolaGO audit — Design, UX, Mobile, RTL & Accessibility (stream `design-a11y`)

Auditor role: Senior Product Designer + Accessibility specialist. Benchmark bar: FPL, SofaScore, OneFootball, 365Scores, FotMob.
Date: 2026-09-24. Live target: https://botolago.com (Chromium 1194 via Playwright, 1440×900 / 390×844 / 360×780, FR and AR).
Evidence root: `scratchpad/shots/design-a11y/` (screenshots `page-viewport-lang.png`, `-fold` = viewport only, `data/*.json` = DOM audit + axe + contrast per page, `data/_special.json` = onboarding/keyboard/dialog/reflow probes).

> Important context for every screenshot of a data-driven page: between ~16:20 and ~16:45 UTC production Postgres was returning `57014 canceling statement due to statement timeout` on the public RPCs (`football_matches_by_date`, `football_home_matches`, `football_season_catalog`, `fantasy_hub`, `news_feed`) — the audit itself saturated the database (coordinator notice). Load-time numbers are therefore NOT reported by this stream. What that degraded window DID expose is a real design defect — the product has no visible failure state for a slow or failing backend (finding D-01) — and every screenshot taken in that window is labelled as such. Captures after 17:00 UTC were taken one page at a time with ≥8 s between navigations.

---

## 0. Scorecard (0–100)

| Area | Score | One-line rationale |
|---|---|---|
| UI (visual design system) | 72 | Coherent, tokenised Option A kit (Changa/Manrope/Noto), club-colour system, consistent radii/elevation. Loses points for a phone-only canvas at desktop, blank crest discs on the biggest clubs, and the leftover shadcn primitives with physical CSS. |
| UX (flows, states, discoverability) | 54 | Three gates before content on first visit (splash → language → welcome), infinite skeletons with no error surface, signed-out Fantasy hub shows "Mes ligues / Notifications" toggles to a visitor with no account, logo is not a home link, no footer/legal on content pages. |
| Mobile experience | 70 | Genuinely mobile-first: 44 px floors are enforced in the kit, bottom nav with `aria-current`, no horizontal overflow measured, 15–16 px inputs. Loses points for sticky-bar stacking on /matches (title + tabs + chips + date strip), 11 px consent links, and the three-gate onboarding on a phone. |
| Accessibility (WCAG 2.2 AA) | 68 | Strong foundations (landmarks, labelled icon buttons, `aria-label` on match cards, focus ring token, reduced-motion global rule, Radix dialogs, live-region form errors). Gaps: no skip link, `<h1>` missing on the match page while loading, skeletons silent to AT, focus lost after AuthPromptDialog closes, two identically-named `nav` landmarks, French `<title>`/`<h1>` in Arabic, contrast over photos not manually verified. |
| French localization | 78 | Complete dictionary parity (1,425/1,425 keys), NBSP typography handled, but `Profile` (English) in the primary nav and profile title, mixed straight/curly apostrophes (104 vs 37), inconsistent chip-name translation (Joker / Triple Capitaine translated; Free Hit / Bench Boost not). |
| Arabic / RTL | 74 | `dir`/`lang` switching, logical properties in 90 %+ of app code, mirrored chevrons, Arabic leading floor derived from font metrics, Changa Arabic subset, `<bdi>` scores. Loses points for ~90 physical utilities still in `src/components/ui/*`, the language chooser title being French-first, Latin brand strings in AR copy, and the first-visit experience defaulting the whole SSR shell to French. |

(Scores are relative to the named benchmarks; a 70 means "competent, clearly below FotMob/SofaScore polish".)

---

## 1. Method (what was actually run)

- Playwright/Chromium only (WebKit/Firefox not installed → Safari-specific behaviour is UNVERIFIED).
- Per page/viewport/language: full-page + viewport screenshot; DOM audit (landmarks, headings, `lang/dir`, every interactive element's bounding box, inputs, computed fonts, gutters, card radii/padding, fixed/sticky bars, truncation, overflow with `getBoundingClientRect().right > innerWidth`, Latin-word scan of rendered text); axe-core 4.13 (`wcag2a/2aa/21a/21aa/22aa/best-practice`), injected from `.audit-tmp/a11y/axe.min.js` (CDN download succeeded); a custom contrast audit that rasterises every computed colour through a `<canvas>` so `oklch()` is measured as sRGB (the brief's warning), walking ancestors for the effective background. Elements over photos/gradients are skipped by that audit (reported as "over image").
- Special probes: first-visit splash + language chooser timing (normal and `prefers-reduced-motion: reduce`), welcome screen, language menu open + real switch, keyboard Tab order with focus-ring contrast, AuthPromptDialog (opened via the club "Suivre" button — no data written), 640 px (≈200 % zoom) and 320 px (≈400 %) reflow, empty-submit login validation, jank hints (backdrop-filter count, animations, CLS).
- Source: `rg` counts of physical vs logical Tailwind utilities; `bun` script over `src/i18n/dictionaries.ts` for parity, Latin-in-AR, English-in-FR, apostrophes, NBSP.
- Nothing was written anywhere: no accounts, no guest sessions ("Continuer en invité" calls `authService.continueAsGuest()` which would create an anonymous auth user, so it was never clicked — the welcome gate was bypassed by seeding `localStorage.botolago.welcomed=1`, the language gate by `botolago.language`, the splash by `sessionStorage.botolago.splashShown=1`).

---

## 2. Findings (severity-ordered)

Top findings at a glance: **D-01** (no failure state, infinite skeletons, P1) · **D-02** (three gates + anonymous auth user before content, P1) · **D-07** (signed-out Fantasy hub shows logged-in IA, P2) · **D-04** (no skip link / footer / logo link, duplicate landmarks, P2) · **D-18** (article language ≠ UI language, P2) · **D-06/D-15** (French SSR shell and titles for Arabic users, P2) · **D-03** ("Profile" in French nav, P2) · **D-08** (empty pre-match summary, P2) · **D-09/D-16/D-17/D-20** (truncation, P3) · **D-10/D-11/D-13/D-14** (targets, input zoom, ARIA misuse, crest plates, P3).

Screenshot index (all under `scratchpad/shots/design-a11y/`): `{home,matches,match,standings,clubs,club,news,article,fantasy,fantasy-rankings,fantasy-players,fantasy-create,login,register,prizes,404,terms,privacy}-{1440,390,360}-{fr,ar}.png` (full page) and `…-fold.png` (viewport); `first-visit-splash-*`, `first-visit-chooser-*`, `first-visit-after-choose-ar-390`, `welcome-*`, `language-menu-*`, `language-switched-*`, `keyboard-*-tab2/tab8`, `auth-prompt-390-{fr,ar}`, `reflow-*-{640,320}`, `login-error-390-*`, `matches-scrolled-*`. Pages captured during the degraded window (16:30–16:45 UTC) are the `*-1440-fr.png` set and are labelled as such where cited; the 390 px FR/AR sets and the 1440 AR set were taken after 17:00 UTC one page at a time. The task asked for a "mobile navigation open state": the product has no hamburger/drawer — the bottom nav is always visible (`home-390-*-fold.png`) — so the language menu open state is captured instead.




---

## 7. RTL issue table (observed on the live Arabic UI)

| # | Issue | Severity | Evidence |
|---|---|---|---|
| R1 | `<html lang/dir>` only switch after hydration; SSR is always `fr`/`ltr` (D-06) | P2 | `__root.tsx:272`, `provider.tsx:47-60` |
| R2 | Document `<title>`, OG title and the home `<h1>` stay French/Latin in Arabic (D-15/D-19) | P2 | `data/*-390-ar.json → meta.title` |
| R3 | Language chooser: French title, Arabic demoted to description, French pre-selected (D-05) | P3 | `first-visit-chooser-390.png` |
| R4 | Bottom-nav label "الملف الشخصي" ellipsised at 390 and 360 px (D-16) | P3 | `bars-390-ar`, `bars-360-ar` |
| R5 | Arabic club names truncate in fixture rows; short names inconsistent across clubs ("الجيش"/"الرجاء" vs "الدفاع الجديدي") (D-17) | P3 | `home-390-ar.json → truncated` |
| R6 | Article page: French edition inside the Arabic shell with French related rail; LTR ellipsis inside RTL cards (D-18) | P2 | `article-390-ar.png` |
| R7 | `auth.email_placeholder` is English "you@example.com" in AR while FR is localised "vous@exemple.com" | P4 | `login-390-ar.inputs[0].placeholder` |
| R8 | Language menu items lack `lang` attributes ("العربية" read by a French TTS voice) | P4 | `_special.json → languageMenu-390.menu.items[].lang = null` |
| R9 | ~90 physical utilities survive, almost all in unused V1 `src/components/ui/*` files; live exposure = `SeasonPicker` (`ui/select`) | P4 | `rg` counts in §8 |
| R10 | Mixed-script strings "تشكيلة Free Hit", "BotolaGO Fantasy" inside Arabic sentences rely on the bidi algorithm with no `<bdi>`/`dir` | P4 | dictionary scan |
| ✓ | Verified correct: mirrored back arrows/chevrons, split hero halves, `<bdi>` scores ("21:00", "2 – 1"), Western digits with `ar-MA` formatting, `text-start/end`, logical padding, Arabic leading floors, Changa Arabic display, `--mesh-x-*`/`--splash-dir` flips, tab keyboard arrows follow `direction` | — | `match-390-ar.png`, `club-390-ar-fold.png`, `home-1440-ar-fold.png`, `tabs-keyboard.ts` |

## 8. RTL / Arabic — source audit (measured with `rg -oP`, tests excluded, `src/**/*.{ts,tsx,css}`)

| Class family | Physical (wrong for RTL) | Logical (correct) |
|---|---|---|
| margin | `ml-` 6, `mr-` 4 | `ms-` 12, `me-` 4 |
| padding | `pl-` 6, `pr-` 9 | `ps-` 66, `pe-` 58 |
| inset | `left-` 21, `right-` 9 | `start-` 17, `end-` 16 |
| text-align | `text-left` 9, `text-right` 4 | `text-start` 35, `text-end` 26 |
| radius | `rounded-l-` 3, `rounded-r-` 3 | `rounded-s-` 5, `rounded-e-` 5 |
| border | `border-l*` 6, `border-r*` 16 (includes false positives such as `border-rule`) | `border-s*` 36, `border-e*` 9 |
| other | `space-x-` 3, `translate-x` 12 | `rtl:` 19, `ltr:` 68 |

Where the physical ones live (`rg -noP … | head -40`): almost entirely `src/components/ui/*` — the V1 shadcn primitives (`sheet.tsx`, `calendar.tsx`, `alert.tsx`, `table.tsx`, `command.tsx`, `alert-dialog.tsx`, `switch.tsx`, `resizable.tsx`). Import check: **none of those files is imported by app code any more except `ui/select.tsx` (used by `src/components/matches/SeasonPicker.tsx`)**. So the RTL exposure is (a) `SeasonPicker`'s `translate-x-1` scroll buttons — cosmetic — and (b) ~15 dead files that will bite the first developer who reaches for them. The kit (`src/components/ui-kit/primitives.tsx`) and every routed screen use logical utilities, `dir`-aware `--mesh-x-*` / `--splash-dir` / `--stripe-angle` custom properties, `to bottom` gradients, and `html[dir=rtl] .lucide-chevron-*` / `.lucide-arrow-*` mirroring (`src/styles.css:758-769`). Letter-spacing is force-normalised for Arabic (`html[dir="rtl"] * { letter-spacing: normal }`, `styles.css:748`).

Digits: `Intl.NumberFormat("ar-MA")` / `DateTimeFormat("ar-MA")` are used everywhere (`MatchCard.tsx:117`, `fantasy.index.tsx:373`, `format-time.ts`), and the dictionary contains **0** Arabic-Indic digits against 51 keys with Western digits — consistent (Moroccan convention is Western digits). Scores are three flex children each in its own `<bdi>` (`MatchCard.tsx:186-192`) so "2 – 1" mirrors correctly; goal difference is `<bdi>` (`StandingsTable.tsx:195`).

Fonts: `html[dir=rtl] body { font-family: var(--font-arabic); line-height: 1.75 }`; `--ui-leading-flat` 1.4→1.95, `copy` 1.55→1.9, `prose` 1.7→2, `display` 1.25→1.95 under `[dir=rtl]` (`styles.css:1451-1482`), derived from canvas TextMetrics of Noto Sans Arabic (A 15 / D 8 / d 6 at 11 px). Changa ships an Arabic subset and is kept for display text in both scripts.

## 9. FR / AR parity — dictionary audit (`bun run .audit-tmp/a11y/dict-scan.ts`)

| Check | Result |
|---|---|
| Keys | fr 1,425 / ar 1,425; missing in ar: 0; missing in fr: 0; empty ar: 0 |
| Identical fr==ar | 7, all allow-listed (`app.name`, `language.*`, `notfound.code`, punctuation tails, `fantasy.stat.none`) |
| AR values containing Latin words | 53 — all `BotolaGO`, `Fantasy`, `Google`, `Apple`, `AAL1/2`, `https`, `Free Hit`, `demo@botolago.ma`. Acceptable brand/technical tokens, except `fantasy.points.free_hit_restored` / `fantasy.freehit.restored` ("تشكيلة Free Hit") and `fpl.more_about` ("BotolaGO Fantasy") — mixed-script inside a sentence, see bidi note below. |
| FR values that are English | **`nav.profile` = "Profile"**, **`profile.title` = "Profile"** (should be "Profil"). Both render in the primary nav on every page (screenshots: every `*-1440-fr.png` top bar, `*-390-fr.png` bottom nav). The i18n gate cannot catch this: it checks fr≠ar and Arabic script presence, not French correctness (`src/i18n/i18n-gate.test.ts`, allow-list `src/i18n/i18n-allowlist.ts`). |
| Chip names | `fantasy.chip.bench_boost` = "Bench Boost", "Free Hit" untranslated; "Joker" (Wildcard) and "Triple Capitaine" translated — inconsistent policy in FR and in AR. |
| French typography | 104 keys use a straight apostrophe `'`, 37 use the typographic `’` — mixed within the same screens (e.g. article H1 "l'attaquant" straight, body "l’international" curly in `article-1440-fr.png`). NBSP before `? ! : ;` — 24 keys correct, 0 missing. |
| `<html lang>` | Switches `fr`↔`ar` and `dir` after mount (`provider.tsx:54-60`); SSR always `lang="fr" dir="ltr"`, so an Arabic user's first paint is French/LTR until hydration (see finding D-06). |
| Per-content `lang` | Article bodies, bylines and tags carry `lang`/`dir` of the content language (`news.$articleId.tsx:323-541`, `ArticleCard.tsx:130-133`) — correct WCAG 3.1.2 handling; measured on `article-1440-fr`: `langMismatchNodes: ["fr","ar"]`. |

## 10. Onboarding — what a first-time visitor goes through (source + measured)

Sequence on a fresh browser at `/` (signed-out):

1. **Launch splash** — server-rendered on every load, shown when `sessionStorage.botolago.splashShown` is unset (`src/components/splash/launch-splash.ts`), i.e. once per tab session, and it re-appears in every new tab. Hold 800 ms + 350 ms fade (250 + 200 under reduced motion), counted from first paint (`SplashScreen.tsx:54-55`). `role="status"` on a purely decorative element (`SplashScreen.tsx:72`) means AT users hear "BotolaGO" announced as a status update. A 10 s failsafe removes it if the app never boots. It cannot be skipped by tapping.
2. **Language chooser** (`FirstLaunchLanguage.tsx`) — a hand-rolled Radix dialog that blocks Escape, outside-click and has no close control (by design, `:26-32`). Title is the French string, the Arabic string is demoted to the dialog *description* (`:73-81`), and the pre-selected option is French — the gate is not neutral between the two audiences. Stored in `localStorage.botolago.language`; there is no URL form (`/fr`, `/ar` → 404, verified), so a shared link always opens in the recipient's stored language or French.
3. **Welcome screen** (`WelcomeScreen.tsx`, rendered by `routes/index.tsx:97-110` when `status === "anonymous" && !hasWelcomed()`) — a third full-screen gate on `/` only: "Explorer BotolaGO" (primary) and "Continuer en invité" (text link) both call `authService.continueAsGuest()` then `markWelcomeDone()`. Both create an anonymous Supabase auth user before the visitor has seen a single score. Deep links to `/matches`, `/news`, … skip this gate entirely, so the gate is inconsistent: the home page is the only page that demands a decision.
4. Then Home. On `/fantasy` a **fourth** modal follows on first visit (`FantasyOnboarding.tsx`, 3 steps, `localStorage.botolago.fantasy.onboarded`).

Benchmarks: FotMob/SofaScore/OneFootball show live content on the first paint and ask for language/notifications later, in context. FPL asks to sign in only when you try to pick a squad. Measured timings for 1–2 are in `data/_special.json` → `firstVisit-*` (see finding D-05).

## 11. Typography — measured on the live pages (`data/*.json → audit.fonts`, top families by count)

- Body face Manrope (FR) / Noto Sans Arabic (AR); display face Changa 800 for hub titles (34 px), section headings (22 px / 27.5 px leading = 1.25), screen headers (19 px), tab labels (16 px). Loaded weights on home: `Changa 800, Manrope 400, Manrope 800` (Manrope 600/700 and Changa 600/700 requested in the Google Fonts URL but not used on the first screen — `__root.tsx:232`).
- Text ramp is px-literal tokens (`--ui-text-hero` 34 → `--ui-text-micro` 11, `styles.css:1017-1025`), heavy by default (600 body, 700 strong, 800 heavy). Most-used styles on home: `Manrope 13px/800/20.15px` ×14 (meta labels), `Changa 22px/800` ×10, `Manrope 16px/400` ×10 (prose). The product reads as **loud**: 13 px at weight 800 uppercase is the single most frequent text style. Compared with FotMob (mostly 400/500/600 with one bold step), the hierarchy has fewer quiet steps, so nothing stands out.
- Smallest live text: 11 px (`ui.text.micro`) on nav labels, "Journée" tags, consent line on auth screens (`login-1440-fr.json → targets.small`: two 11 px legal links, 15 px tall). 11 px legal consent text is below the comfortable floor on a phone.
- Arabic: leading 1.95 on single-line styles makes Arabic bars taller than French (bottom nav 82 vs 76 px per `styles.css:19`), measured in `data/_special.json → bars-*`.
- Line-clipping: DOM scan for `overflow:hidden` leaves with `scrollHeight > clientHeight` (`audit.vclip`) is reported per page below; the team's own BG-0124 fix (flat leading floors) holds on the pages measured.

## 12. Colour system — tokens as rasterised

- One token layer `--ui-*` with a light/dark pair each; dark mode is shipped but gated off (`DARK_MODE_ENABLED=false`) pending two contrast defects the flag itself documents (BG-0083 `--ui-ink` as text 1.25:1 in dark; BG-0084 Fantasy light-only surfaces). Good discipline, but it means no dark mode at launch — every benchmark app offers one, and Moroccan fans watch evening kick-offs.
- Brand: deep navy `oklch(.32 .1 258)` ink, action gradient spring→sky `oklch(.88 .19 152) → oklch(.88 .11 205)` with ink-deep text (measured ≥ 6:1 in the audit), live red `--ui-live` (fill) / `--ui-live-fg` (text, 6.38:1 on white). Club colours per club via `data-club` custom properties with per-theme measured foregrounds (`src/lib/club-palette.ts`).
- Weak spot: `--ui-rule` (`oklch(.93 .006 250)`) is the kit's **default** input border in `FIELD_BOX` (`primitives.tsx:1641`) although the stylesheet says it "fails WCAG 1.4.11 for a control's edge"; in practice every public form overrides it with `--ui-rule-strong` (measured 3.12:1 on `/auth/login`, `data/_special.json → login-390-fr.inputs[].borderVsPage`). See D-12.
- Muted text `--ui-on-surface-muted oklch(.45 .02 258)` on white ≈ 7:1, faint `oklch(.555 …)` ≈ 4.9:1 — both pass; the audit found **0** solid-background AA failures on home, news, article, fantasy, standings at 1440 (`data/*-1440-fr.json → contrast.failures`), which is better than most of the benchmarks.

## 13. What would make BotolaGO exceptional (not just "like FotMob") — Moroccan-fan-specific

1. **Kick-off in the fan's day, not in UTC arithmetic.** Show every kick-off with the Casablanca time *and* the context Moroccan fans actually plan around: "après le ftour" during Ramadan, "avant/après la prière du vendredi", Eid days. The data model already pins `MATCH_TIME_ZONE`; add a small Moroccan calendar layer (Hijri dates for Ramadan/Eid, national holidays) and surface it in the gameweek band ("Journée 14 · 2ᵉ nuit de Ramadan · coups d'envoi 22:00"). No benchmark does this.
2. **Darija voice option.** The product is FR/AR (fusha). Match-day copy in Darija (Arabic or Latin script, user-selectable) for the live strip, goal takeover ("BUT !") and push copy would be the first premium football app to speak the way the stands do. Keep fusha for legal/editorial.
3. **Derby mode.** Wydad–Raja (and FAR–Wydad, MAS–Fès region) get a dedicated skin for the 72 h around the fixture: split club-colour hero already exists (`MatchCard hero`); add H2H history, tifo gallery from the community, and a Fantasy "derby captain" mini-game. Derby day is when a Moroccan app wins or loses its users.
4. **Stadium & travel card.** Each match page: stadium capacity, ticket link (Guichet/ticket.ma when available), how to get there (tram/train lines: Casablanca tram to Stade Mohammed V, ONCF to Rabat/Tangier), and the TV channel (Arryadia/SNRT, beIN). FotMob has "TV" but not transit; for a domestic league this is the killer utility.
5. **Botola + national team + CAF in one timeline.** Fans follow the Lions de l'Atlas and Moroccan clubs in CAF Champions League/Confederation Cup as one story. Add those competitions to the same match list with a filter chip; the standings zone bars already point at CAF places.
6. **Offline-first match list.** Moroccan mobile data is patchy in stadiums. Cache the current gameweek and standings for offline (service worker), and show the "hors ligne" banner that already exists (`OfflineBanner`) with the cached kick-off list instead of skeletons.
7. **Fantasy for WhatsApp leagues.** Private leagues are how Moroccan friend groups play. Add a one-tap "share league to WhatsApp" with a pre-rendered image card (rank table), and a weekly "résumé de la ligue" image the admin can forward. The `ShareButton` exists; make the payload a picture.
8. **Prize system with local sponsors** is already scaffolded (`PRIZES_ENABLED`); pair it with Moroccan telecom/retail (inwi is already the league sponsor) and show progress toward the monthly prize on the Fantasy card. Make the prize page the reason to create a team.
9. **Club-first personalisation on first launch.** Replace the language gate + welcome gate with a single "Choose your club" screen (language inferred from `navigator.language`, switchable in the bar). Home then opens on that club's next match and news, like OneFootball's onboarding, but with 16 Botola crests instead of 500 European ones.
10. **Referee & VAR transparency.** Moroccan fan discourse is dominated by refereeing. Show the referee's name, their season stats (cards/penalties per game) and VAR decisions in the timeline. Data provider (SportsMonks) exposes referees.
11. **Arabic-first, not Arabic-second.** Make the language chooser truly bilingual (Arabic title first for `ar-*` browsers), SSR the Arabic shell for returning Arabic users (cookie instead of localStorage), and give Arabic its own typographic pass (Changa Arabic at display sizes is heavy; consider a lighter Kufi for body headings).
12. **Live audio commentary integration** (Radio Mars / Medi1 streams) on the live match page — a phone in the pocket during Friday traffic is the Moroccan use case.

### D-01 — A slow or failing backend leaves every hub on skeletons indefinitely; no error state ever reaches the user
- Severity: **P1** · Confidence: **VERIFIED**
- Location: `/`, `/matches`, `/matches/standings`, `/clubs`, `/clubs/$id`, `/news`, `/fantasy`, `/fantasy/players`, `/matches/$id`; `src/services/query-client.ts`; `src/routes/matches.index.tsx:240-313`
- Evidence: during the 16:20–16:45 UTC contention window `football_matches_by_date` returned HTTP 500 (`57014 statement timeout`) after ~29 s, then `net::ERR_ABORTED`; `/matches` was still on three shimmer rows and a "Chargement" season pill **55 s after navigation** (`discover4.mjs` output; screenshot `_probe-matches-1440-fr.png`, `standings-1440-fr.png`, `news-1440-fr.png`, `club-1440-fr.png`, `fantasy-1440-fr.png`, `fantasy-players-1440-fr.png`, `match-1440-fr.png` = spinner "Chargement…" with no `<h1>`). `data/home-1440-fr.json → rec.http` lists 500s on `news_feed`, `football_home_matches`, and CORS-blocked `fantasy_hub`/`fantasy_top_players` (a PostgREST 500 carries no `Access-Control-Allow-Origin`, so the browser reports it as a CORS failure).
- Recurrence under light load: at 17:15 UTC, with a single browser context and ≥8 s between navigations, `news_home_modules` (home, AR) and `football_matches_by_date` (matches, AR) still returned 500 (`data/home-1440-ar.json`, `matches-1440-ar.json → rec.http`), and `/matches` again sat on skeletons for the whole 12 s poll window. So the trigger is not only the audit's contention; the UI's behaviour when it happens is the design defect.
- Root cause: the QueryClient sets only `staleTime` (`query-client.ts:4-12`) and keeps TanStack Query's default `retry: 3` with exponential back-off; with a ~30 s RPC timeout that is >2 minutes before `isError` flips and `ErrorState` (`States.tsx:95`) renders. There is no request timeout, no "slow" state after N seconds, no stale-while-error fallback, and the `OfflineBanner` only reacts to `navigator.onLine`.
- User impact: on a real 3G stadium connection or any database hiccup the product looks broken for minutes with no message and no retry affordance; the match page shows a bare spinner with a "Retour" button and nothing else. Every benchmark app shows cached data + "mise à jour impossible" within a few seconds.
- Fix: `retry: 1`, `retryDelay ≤ 2 s`, an AbortSignal timeout (~8 s) in the Supabase RPC wrapper, a "toujours en chargement… réessayer" affordance after ~6 s, and `placeholderData`/persisted cache so the last good gameweek renders under a stale badge. Files: `src/services/query-client.ts`, `src/services/football/*`, `src/components/common/States.tsx`. Complexity: M.

### D-02 — Three full-screen gates before a first-time visitor sees a single score (splash → language → welcome), and the welcome gate creates an auth user
- Severity: **P1** · Confidence: **VERIFIED** (source + first-visit probe)
- Location: `src/routes/__root.tsx:317-339` (LaunchGate), `src/components/splash/*`, `src/components/shell/FirstLaunchLanguage.tsx`, `src/routes/index.tsx:93-110`, `src/components/welcome/WelcomeScreen.tsx`
- Evidence: fresh-context run of `/` at 390 px: splash painted first, chooser dialog after it (timings in `data/_special.json → firstVisit-390`), screenshots `first-visit-splash-390.png`, `first-visit-chooser-390.png`; after choosing a language the page behind is the **welcome screen** (`welcome-390-fr.png`), not Home. "Explorer BotolaGO" and "Continuer en invité" both call `authService.continueAsGuest()` (`index.tsx:103-107`), i.e. `signInAnonymously` — an auth row per curious visitor.
- Current: ~1.2 s splash (hold 800 + fade 350 ms) + a mandatory modal (Escape/outside-click blocked, no close) + a full-screen welcome. Deep links (`/matches`, `/news/…`) skip the welcome gate entirely, so the gate is inconsistent (only `/` has it).
- Expected (FotMob/OneFootball): content on first paint; language inferred from `Accept-Language`/`navigator.language` with a one-tap switch in the bar; sign-in asked in context (follow a club, create a Fantasy team).
- Fix: drop the welcome screen or move it to `/fantasy`; infer language and make the chooser a dismissible banner; keep the splash only for the installed PWA. Complexity: M.

### D-03 — "Profile" in the French primary navigation (bottom nav, top bar, Explore tiles, profile title)
- Severity: **P2** · Confidence: **VERIFIED**
- Location: `src/i18n/dictionaries.ts:28` (`"nav.profile": "Profile"`), `profile.title` (same); rendered in `BottomNav`, `TopBar`, Home "Explorer" tiles
- Evidence: every FR screenshot's nav (`home-390-fr.png` bottom bar and Explore tile, `*-1440-fr.png` top bar); `dict-scan.ts` output "FR values with English-looking words: nav.profile = Profile, profile.title = Profile".
- Root cause: the i18n gate (`scripts/qa/i18n-gate.ts`) checks fr≠ar and Arabic-script presence, never French correctness; the allow-list comment even records `profile.title` as previously flagged.
- Fix: "Profil" in both keys; add a small English-word denylist to the gate. Complexity: S.

### D-04 — No skip link, no footer/legal on any content page, two landmarks with the same name, and the wordmark is not a link home
- Severity: **P2** · Confidence: **VERIFIED**
- Location: `src/components/shell/TopBar.tsx`, `BottomNav.tsx`, `AppShell.tsx`, `src/components/brand/Logo.tsx`
- Evidence: DOM audit on every page: `skipLink:false`, `footer:0`, `footerLinks:[]` (`data/*.json → audit.landmarks`); `rg "Skip to|Aller au contenu"` over `src` = 0 hits; two `<nav aria-label="Navigation principale">` (top + bottom) on every page (`audit.landmarks.nav`); `Logo` renders a plain `<div><img>` with no `<a>` (`Logo.tsx:60-72`), confirmed `logoIsLink:false` on 390/1440 captures; 4–5 `<header>` elements per page (`audit.landmarks.header` = 4 on home, 5 with the live strip: `SectionHeader` uses `<header>` for every section, `SectionHeader.tsx:53`).
- Impact: keyboard users tab through the whole nav on every page (WCAG 2.4.1 Bypass Blocks — the only landmark-based bypass is `main`, which screen readers can jump to, so this is a best-practice fail rather than a hard AA fail); screen-reader landmark lists show "banner" ×5 and two identically named navigations (2.4.6/4.1.2 quality); Terms/Privacy/contact/"made with" are reachable only from `/profile` and the auth screens — a trust-signal gap versus every benchmark (all carry a footer with legal, contact, app-store links).
- Fix: `<a href="#main" class="sr-only focus:not-sr-only">Aller au contenu</a>` first in `TopBar`; `aria-label` "Navigation principale" (top) vs "Navigation mobile" (bottom); `SectionHeader` → `<div>`; `Logo` wrapped in `<Link to="/">` in `TopBar`; a compact footer in `AppShell` (legal, contact, source credits, version). Complexity: S–M.

### D-05 — The launch splash is announced as a live status and blocks all interaction; language chooser is French-first
- Severity: **P3** · Confidence: **VERIFIED** (source) / timings in `data/_special.json`
- Location: `SplashScreen.tsx:72-76` (`role="status"` on the decorative splash), `FirstLaunchLanguage.tsx:73-81` (French `<Title>`, Arabic demoted to `<Description>`, `selected` defaults to `"fr"`)
- Impact: VoiceOver/TalkBack announce "BotolaGO" as a status on every new tab; the Arabic majority audience is greeted by a French heading and a pre-ticked French tile.
- Fix: `aria-hidden` on the splash (or no role); pick the default tile from `navigator.language`; put both endonyms at title level (`<Title>` "Choisissez votre langue / اختر لغتك"). Complexity: S.

### D-06 — Arabic returning visitors get a French, LTR first paint (SSR is hard-coded `lang="fr" dir="ltr"`)
- Severity: **P2** · Confidence: **VERIFIED** (source) / LIKELY for the visible flash (not filmed)
- Location: `src/routes/__root.tsx:272`, `src/i18n/provider.tsx:38-60` (language read from `localStorage` after mount)
- Evidence: `curl https://botolago.com/` returns `<html lang="fr" dir="ltr">`; the provider "upgrades after mount". With the site's own measured slow-phone hydration (BG notes in `launch-splash.ts` cite ~4 s on a throttled profile), an Arabic user sees French/LTR content — and the French wordmark position — for that long on every load; the splash masks it only once per tab session.
- Fix: persist the choice in a cookie as well and read it in the server handler (`src/server.ts`) to render `lang`/`dir` and the dictionary server-side; or add `/ar` URL prefix (also fixes shareability and SEO hreflang). Complexity: M–L.

### D-07 — Signed-out Fantasy hub renders the whole logged-in information architecture around a "Compte requis" card
- Severity: **P2** · Confidence: **VERIFIED**
- Location: `/fantasy` signed out; `src/routes/fantasy.index.tsx:120-160` (`FantasyPhaseBody phase="guest"`), the sections after it are unconditional
- Evidence: `fantasy-390-fr.png`, `fantasy-1440-fr.png`: under the gate card the visitor sees "Mes ligues → Ligues générales: Général –", "Ligues privées: Aucune ligue pour le moment", "Rejoindre des ligues / Gérer les ligues", "Coupes: Vous n'êtes pas encore qualifié pour la coupe" plus a four-line explanation of cup draws, and "Notifications" with two toggles (Rappels Fantasy / E-mails) — all for an account that does not exist. Headings list from the DOM: `h2 Compte requis / h2 Mes ligues / h3 Ligues générales / h3 Ligues privées / h3 Coupes / … / h2 Notifications`.
- Impact: the first Fantasy screen a Moroccan fan sees is a list of things they don't have. FPL's logged-out landing is one hero + "Play now" + prizes; OneFootball hides personal sections until sign-in. Conversion suffers and the page reads as broken ("–" rank, empty leagues).
- Also observed: the gameweek band says "JOURNÉE 1 · DATE LIMITE jeu. 24 sept., 14:30 — OUVERTE" at 17:00 UTC (18:00 Casablanca), i.e. the deadline shown is in the past while the status pill says "open" (`GameweekStatusText.tsx:33-34` renders the backend `status`). Either the deadline copy or the status is wrong for the reader; LIKELY a data-state issue, but the UI should never show a past deadline as open.
- Fix: a dedicated guest hub (hero, how-it-works in 3 tiles, prizes, top players, CTA), personal sections only when `hasTeam`; derive "open/locked" from `deadline < now` client-side as a guard. Complexity: M.

### D-08 — The pre-match "Résumé" tab is an empty state ("Aucun fait marquant pour le moment")
- Severity: **P2** · Confidence: **VERIFIED**
- Location: `/matches/$matchId?tab=summary` for a scheduled match; `src/routes/matches.$matchId.tsx`
- Evidence: `match-390-fr.png`: split club-colour hero (good), then an inbox icon and "Aucun fait marquant pour le moment.", then related news. Stats / Compos / Face à face are separate tabs.
- Expected (FotMob/SofaScore pre-match): venue, referee, form (last 5), H2H summary, probable line-ups, TV channel — the "Face à face" data already exists one tab away. An empty summary on the most-visited pre-match screen is a missed opportunity, and "fait marquant" (highlight) copy is wrong for a match that hasn't started.
- Fix: a scheduled-match summary composed of `HeadToHead` + `FormChips` + kickoff/venue card; keep the empty panel for live matches with no events yet. Complexity: M.

### D-09 — Club names truncate on almost every match row at 390 px; the "Reporté" badge steals the centre track
- Severity: **P3** · Confidence: **VERIFIED**
- Location: `src/components/common/MatchCard.tsx:146-149` (`rowName` prefers the full name when `shortName` is an all-caps code) and the `4px | 1fr | auto | 1fr | 4px` grid (`:318`)
- Evidence: `data/home-390-fr.json → audit.truncated`: "Ittihad Tanger" (96 px in 83), "Difaâ El Jadida" (99/83), "CODM Meknès" (99/83); `matches-390-fr.json`: "Raja Casablanca" (113/75). Screenshots `home-390-fr.png`, `matches-390-fr.png` ("Ittihad Ta…", "Difaâ El Ja…", "CODM Me…", "Raja Cas…"). The postponed row shows a 96 px "REPORTÉ" pill in the middle track, squeezing both names.
- Impact: the two most important words on a fixture row are cut on the most common phone width; FotMob/SofaScore solve this with curated short names ("Raja CA", "IR Tanger", "DHJ") and a fixed-width centre column.
- Fix: curate `shortName` per club (3–12 chars, both languages) and use it in rows; move the postponed/cancelled badge under the time, as the live pill already is. Complexity: S.

### D-10 — Save/bookmark buttons and carousel dots are 24–32 px; legal consent links are 11 px / 15 px tall
- Severity: **P3** · Confidence: **VERIFIED**
- Location: `src/components/news/SavedButton.tsx` (`variant="thumb"` 32×32), `LatestCarousel.tsx` dots (24×32), auth consent line (`ConsentLine`, 11 px)
- Evidence: `data/news-390-fr.json → targets.small`: 5× "Enregistrer" 32×32, 5× "Article n sur 5" 24–28×32; `article-390-fr.json`: 6× "Enregistrer" 32×32 + "ElBotola" link 51×18; `match-390-fr.json`: 3× 32×32; `login-1440-fr.json`: "Conditions d'utilisation" 128×15 at 11 px, "Politique de confidentialité" 251×32 at 11 px.
- WCAG 2.5.8 (AA, 24×24) passes; the kit's own 44 px floor (`--ui-tap-min`), Apple HIG 44 pt and Material 48 dp do not. Save is the only action on a news row and sits over the thumbnail corner next to the card link — mis-taps open the article instead of saving.
- Fix: 44 px hit area via `ui.hitArea` (already used by `UiCheckbox`), consent line at ≥ 12 px with 44 px link rows. Complexity: S.

### D-11 — Inputs and selects are 13–15 px: iOS Safari will zoom the page on focus
- Severity: **P3** · Confidence: **LIKELY** (WebKit not available; behaviour is documented Safari behaviour for `font-size < 16px` with a viewport that allows zoom)
- Location: `FIELD_BOX`/`UiInput` (`ui.text.body` = 15 px), `UiSelect` 13 px; `__root.tsx:196` viewport `width=device-width, initial-scale=1` (correctly no `maximum-scale`)
- Evidence: `data/login-390-fr.json → inputs[].fontSize = "15px"` (email, password); `fantasy-players-390-fr.json`: search 15 px, two `<select>` at 13 px, `fantasy-rankings` search 15 px.
- Fix: `font-size: 16px` on inputs/selects at `max-width: 767px` (or `text-[16px]` in `FIELD_BOX`); keep the visual size with `md:text-[15px]`. Complexity: S.

### D-12 — The kit's default field border is the 1.2:1 divider token; every public screen overrides it, so the defect is latent, not live
- Severity: **P4** · Confidence: **VERIFIED** (measured 3.12:1 on the live auth fields; source for the default)
- Location: `src/components/ui-kit/primitives.tsx:1638-1644` (`FIELD_BOX … border-[color:var(--ui-rule)]`); overrides in `src/components/auth/auth-classes.ts` (`authFieldClass`) and `src/components/fantasy-lists/SearchField.tsx:35` (`--ui-rule-strong`)
- Evidence: `data/_special.json → login-390-fr.inputs[].borderColor = "oklch(0.64 0.02 258)"`, `borderVsPage = 3.12` (passes 1.4.11); the stylesheet comment (`styles.css:1202-1207`) already says `--ui-rule` "fails WCAG 1.4.11 for a control's edge" and offers `--ui-rule-strong`. The Fantasy players' price/sort `<select>`s use a `border-transparent` sunken pill (`fantasy.players.tsx:275-280`), whose fill measures ≈1.15:1 against the page — identifiable only by their text and chevron.
- Fix: make `FIELD_BOX` default to `--ui-rule-strong` so the next screen built on `UiInput` is correct without a per-screen override. Complexity: S.

### D-13 — News carousel: `<li role="group">` inside `<ul>` (ARIA misuse) and 24 px dot controls
- Severity: **P3** · Confidence: **VERIFIED** (axe)
- Location: `src/components/news/LatestCarousel.tsx:68-80`
- Evidence: axe on `/news` 390 FR: `list` (serious, WCAG 1.3.1, 1 node: `<ul>` has children with `role=group`), `aria-allowed-role` ×5 (`li role="group" aria-roledescription="slide"`). No autoplay (good, `:24`).
- Fix: `<div role="group" aria-roledescription="carousel">` with `<div role="group" aria-roledescription="slide">` children, or plain `<ul><li>` without roles. Complexity: S.

### D-14 — Crest discs render as empty white plates until the badge decodes; one club ships the provider's generic shield
- Severity: **P3** · Confidence: **VERIFIED** (empty plates observed during the slow window: `clubs-1440-fr.png` 9 of 16 clubs blank; healthy run `clubs-390-fr.png` all badges present) / Amal Tiznit generic shield VERIFIED in every capture
- Location: `src/components/common/ClubCrest.tsx:123-136` (the `<img>` plate is `absolute inset-0` with an opaque `--ui-scorebox` background over the monogram, so the monogram only appears once the image *fails*, never while it *loads*); data: `scripts/qa/crest-coverage.mjs` header documents the shared 2,555-byte placeholder for Amal Tiznit / Yacoub El Mansour
- Fix: paint the plate only after `load` (opacity transition), so the club-colour monogram shows during loading; replace the two placeholder crests. Complexity: S.

### D-15 — In Arabic, the document `<title>`, OG title and the home `<h1>` stay French
- Severity: **P2** · Confidence: **VERIFIED**
- Location: `src/routes/index.tsx:58-72, 275` (`HOME_TITLE` is a French literal used for `<title>`, `og:title`, `twitter:title` and the sr-only `<h1>`); `__root.tsx:198` default title/description also French-only
- Evidence: `data/home-390-ar.json → meta.title = "BotolaGO — Actualité, matchs et Fantasy du football marocain"`, `landmarks.h1[0].text` = same, while `lang=ar dir=rtl`. An Arabic screen-reader user hears a French page name; the browser tab / share sheet shows French.
- Fix: `t("home.meta_title")` for the client `<title>`/`<h1>` (the SSR head can stay French until D-06 is solved). Complexity: S.

### D-16 — Bottom-nav label "الملف الشخصي" is ellipsised at 390 px and 360 px
- Severity: **P3** · Confidence: **VERIFIED**
- Location: `src/components/shell/BottomNav.tsx:101` (`max-w-full truncate`), `nav.profile` = "الملف الشخصي" (12 characters)
- Evidence: `data/home-390-ar.json → audit.truncated: {"text":"الملف الشخصي","sw":77,"cw":71}`; screenshots `home-390-ar.png`, `matches-390-ar.png` ("الملف الشخ…"). The code comment on `BottomNav.tsx:47` shows the team tuned padding for 320 px but it still fails at 390 px with 5 items.
- Fix: a shorter nav label ("حسابي" / "الملف") or `text-[10px]` for the Arabic micro step; never truncate a nav label. Complexity: S.

### D-17 — Arabic club names in match rows: "الدفاع الجديدي" truncates like the French ones (see D-09)
- Severity: **P3** · Confidence: **VERIFIED** — `home-390-ar.json → truncated: الدفاع الجديدي 92/83`. Same fix as D-09: curated Arabic short names ("الدفاع", "الجيش", "الرجاء" are already used for some rows — the `matches-390-ar.png` row shows "الجيش / الرجاء", proving the data exists but is inconsistent across clubs).

## 3. Visual inconsistencies (measured / observed)

| # | Where | What | Evidence |
|---|---|---|---|
| V1 | Every hub at 1440 | The product is a 672 px phone column centred in a 1440 px window with the top bar spanning full width; tabs (`UiTabs`) and page-title bands are full-bleed while content is 640 px, so the "Calendrier / Classement" underline runs edge to edge and the active tab indicator sits 300 px from its label's column. | `matches-1440-fr.png`, `standings-1440-fr.png` (`_probe-matches-1440-fr.png`) |
| V2 | Fantasy vs the rest at 1440 | Fantasy screens sit in a *second* frame: a 28 px-radius raised "phone column" (`--ui-radius-column`, `ui.shadow.column`) with its own back header, while Home/News/Matches use flat full-bleed bands. Fantasy looks like an embedded app inside the site. | `fantasy-rankings-1440-fr.png`, `fantasy-players-1440-fr.png` vs `news-1440-fr.png` |
| V3 | Detail screens | Three different top bars: global wordmark bar (hubs), `UiHeader` with a "Retour" pill + kicker (match, article, club, Fantasy sub-screens), and the dark photo band on auth. The match page has the pill + "BOTOLA PRO INWI · J. 1" kicker; the club page pill + "CLUBS"; the article pill + no kicker + two icon buttons. | `match-390-fr.png`, `club-1440-fr.png`, `article-1440-fr.png` |
| V4 | Cards | Card padding varies: news rows `12/12/12/14` (`py-3 pe-3 ps-3.5`), club tiles `24`, Fantasy list rows `10/12`, hub tiles `16`, gate card `20`; radius 14 (cards) vs 16 (sheets/hero/news lead) vs 28 (Fantasy column) vs fully round controls. Consistent tokens, but four card paddings on one page. | `data/*-1440-fr.json → audit.cards` (e.g. fantasy: `p=0`, `10/12`, `16`, `20` on one page) |
| V5 | Section headers | Home section titles are Changa 22/800 with a "Tout voir" link; Fantasy uses uppercase 12 px labels ("LIGUES GÉNÉRALES") as sub-heads plus Changa 22 for "Mes ligues"; the players list uses none. Same product, three header grammars. | `fantasy-390-fr.png`, `home-390-fr.png` |
| V6 | Chips | Status filter chips are round navy/sunken pills (`Tous / En direct / À venir / Résultats`), position chips on players are the same, but the news club filter row adds crest avatars and the standings/Fantasy tabs are underline tabs — three selection idioms side by side on /news. | `news-390-fr.png` |
| V7 | Buttons | Primary = spring→sky gradient with ink-deep text on Fantasy/auth; primary = navy ink pill on 404/error/"Créer un compte"; "Voir le classement 2025/2026" is a full-width sunken pill. Two primary styles on adjacent screens (`fantasy-create-390-fr.png` gradient + navy stacked). | `fantasy-create-1440-fr.png`, `404-390-fr.png`, `standings-390-fr.png` |
| V8 | Sticky stack on /matches at 390 | 65 px top bar + 59 px status chips sticky (`fixed[]` in `matches-390-fr.json`) + 76 px bottom nav = 200 px of chrome on an 844 px screen (24 %); the date band + day strip add 160 px more non-sticky. Only two fixture rows are visible above the fold. | `matches-390-fr.png` |
| V9 | Type weight | 13 px / 800 / uppercase is the most frequent text style on Home (`fonts[0]`), so kickers, times, tags, and section eyebrows all shout at the same volume. | `data/home-1440-fr.json → fonts` |
| V10 | Empty states | Four illustration styles: 3-D render (rankings ladder, standings board, 404 corner flag), flat inbox glyph disc (match summary), photo-less gradient plates (news), plain text ("Aucune ligue pour le moment" with a trophy render). Renders are charming but the flat disc breaks the set. | `fantasy-rankings-390-fr.png`, `standings-390-fr.png`, `match-390-fr.png`, `404-390-fr.png` |
| V11 | Apostrophes | Straight `'` in headings ("l'attaquant", "Conditions d'utilisation", "n'est pas") vs typographic `’` in body ("s’est engagé", "l’équipe") on the same screens. | `article-1440-fr.png`, `standings-390-fr.png`, dictionary scan 104 vs 37 |
| V12 | Language trigger | "FR" in a grey disc on light bars, "🌐 FR" glass pill on the auth photo band, "ع" in Arabic — the only control whose shape changes per screen. | `login-1440-fr-fold.png` vs `home-390-fr.png` |
| V13 | Crest discs | On the match hero the away crest sits on a white disc with a shadow, the home one on a grey disc; in lists both are white plates; in the club grid they have a hairline ring — three treatments of the same asset. | `match-390-fr.png`, `clubs-390-fr.png` |

### D-18 — Article URLs are per-edition, so an Arabic reader who opens a French edition gets a French article inside an Arabic shell (and vice versa); related lists mix scripts
- Severity: **P2** · Confidence: **VERIFIED**
- Location: `src/routes/news.$articleId.tsx:194-195, 455-470` (content language = the edition's; translations are separate article ids offered as a "اقرأ هذا المقال بالعربية" pill)
- Evidence: `article-390-ar.png` (UI in Arabic: back "رجوع", nav, "اقرأ أيضًا"), but H1 + body in French, byline "خ.م (البطولة)" in Arabic, source "Source : ElBotola" in French, club chip "Wydad Casablanca" in Latin; `data/article-390-ar.json → textScan: latinChars 1516 vs arabicChars 227`; the "read also" rail lists six French headlines under an Arabic heading. The same edition in the FR UI shows the Arabic byline. The FR `<title>` is used in the AR tab.
- Bidi note: the mixed byline line "خ.م (البطولة) · 23 sept. 2026 · 1 min de lecture" renders acceptably because each span carries `lang`/`dir`, but the related-card titles do not get the `line-clamp` ellipsis on the correct side in RTL for Latin text (ellipsis lands at the visual left of an LTR run inside an RTL card — see "…Wydad de Témar" in the screenshot).
- Also: one `news_article_detail` RPC returned **404** in the AR run (`rec.http`) before a fallback rendered — LIKELY the client requesting the Arabic sibling first; check the backend stream.
- Expected: `/news/{id}` should resolve to the edition in the reader's UI language when one exists (or redirect), and the related rail should be filtered to the UI language. Complexity: M.

### D-19 — Page `<title>`s stay French in the Arabic UI on match, club, standings and article pages
- Severity: **P3** · Confidence: **VERIFIED** — `data/match-390-ar.json → title "Amal Tiznit — Ittihad Tanger | BotolaGO"`, `club-390-ar → "Amal Tiznit — matchs, classement et effectif | BotolaGO"`, `standings-390-ar → "Classement Botola Pro — points, forme et buts | BotolaGO"`. Extends D-15; the `head()` functions build titles with French literals and Latin club names. Complexity: S.

### D-20 — At 320 px (≈400 % zoom of a 1280 desktop) every club name in a match row collapses to 2–4 letters
- Severity: **P3** · Confidence: **VERIFIED**
- Location: `MatchCard.tsx` list grid (`minmax(0,1fr)` name tracks + `truncate`)
- Evidence: `reflow-home-320-fr.png`; `data/_special.json → reflow-home-320.truncated`: "Amal Tiznit" 77 px in 48, "Ittihad Tanger" 96/48, "UTS Rabat" 72/48, "FUS Rabat" 70/48, "Difaâ El Jadida" 99/48, "CODM Meknès" 99/48. No horizontal scroll (1.4.10 reflow technically passes) but the fixture becomes "Amal… 21:00 Ittiha…", which is information loss for low-vision users who rely on 400 % zoom.
- Fix: same as D-09 (curated short names) plus a two-line name allowance below 360 px. Complexity: S.

## 4. Accessibility issue table (WCAG 2.2 AA unless marked BP = best practice)

| # | Issue | WCAG | Impact | Instances (measured) | Evidence |
|---|---|---|---|---|---|
| A1 | No skip link; first Tab lands on "Accueil" (desktop) / the language button (mobile) | 2.4.1 (BP given `main` exists) | moderate | every page | `_special.json → keyboard-*` seq[0]; `audit.landmarks.skipLink=false` ×36 pages |
| A2 | Two `<nav>` landmarks with the same name "Navigation principale"; 4–5 `<header>` (banner) elements per page from `SectionHeader` | 1.3.1 / 2.4.6 (BP) | moderate | all hubs (header ×4 home, ×5 with live strip; nav ×2) | `audit.landmarks` |
| A3 | Match page has no `<h1>` while loading (spinner only); 404/error/welcome pages have no `main` landmark | 1.3.1 / 2.4.6 (BP `page-has-heading-one`, `landmark-one-main`) | moderate | match (loading state), 404 ×2, welcome ×4 | axe `match-1440-fr`, `404-390-*`, `welcome-*` |
| A4 | Skeleton loading states are `aria-hidden` with no `role="status"`/live text on hubs (Home, News, Clubs, Standings); AT users get silence, sighted users get shimmer | 4.1.3 | moderate | Home rails, /news, /clubs, /matches/standings, /clubs/$id | `Skeletons.tsx:31-135` (`aria-hidden` on every shell); Fantasy hub is the exception (`fantasy.index.tsx:123` `role=status`) |
| A5 | Splash `role="status"` on a decorative element — announced on every new tab | 4.1.3 (misuse) | minor | 1 per session | `SplashScreen.tsx:72` |
| A6 | Language chooser: French title, Arabic as description; `aria-modal` absent (siblings are `aria-hidden` so trap holds); Escape/outside blocked by design with no close | 3.1.1 / 2.1.2 (no trap: Tab cycles inside — OK) | moderate | 1 | `_special.json → firstVisit-390.dlg` |
| A7 | Language menu: selected item marked with `aria-current` on `role=menuitem` (should be `menuitemradio` + `aria-checked`); items lack `lang` | 4.1.2 / 3.1.2 | minor | 2 items | `_special.json → languageMenu-390.menu.items` (`checked:null`), `primitives.tsx:2578` |
| A8 | AuthPromptDialog: initial focus on the close button; after Escape focus goes to `<body>` instead of the invoking "Suivre" button | 2.4.3 | moderate | every `requireAuth` prompt (club follow, news follow) | `_special.json → authPrompt-390-fr.focusAfter.tag = "body"` |
| A9 | Live auth fields measure 3.12:1 (pass); the kit default `FIELD_BOX` border is `--ui-rule` ≈1.2:1 (latent); players filter selects are borderless sunken pills ≈1.15:1 | 1.4.11 | minor (latent) | 2 selects on /fantasy/players | D-12; `login-390-*.inputs[].borderVsPage = 3.12` |
| A10 | Save buttons 32×32, carousel dots 24×32, "ElBotola" source link 18 px tall, consent links 15 px tall | 2.5.8 passes (≥24) — fails kit/Apple 44 px | minor | 10 on /news, 7 on article, 3 on match, 2–5 on auth | `targets.small` per page |
| A11 | Carousel `<ul>` with `<li role="group">` children | 1.3.1 (axe `list`, serious) + `aria-allowed-role` ×5 | serious (axe) | /news FR+AR | axe `news-390-*` |
| A12 | Contrast "incomplete": text over photo bands (gameweek band "JOURNÉE 1", "Bonsoir · date", auth hero "Le football marocain, réuni.", crest monograms over image plates) — axe cannot resolve; manual pixel check on `home-390-fr-fold.png`: white 800-weight on the darkest part of the stadium scrim reads clearly, but the scrim is a gradient and the top-left "Bonsoir" line sits on the lighter floodlight area | 1.4.3 | needs manual sign-off | 10 nodes on home, 5 on fantasy, 3 on auth | axe `incomplete.color-contrast`; contrast audit skips image backgrounds |
| A13 | Page `<title>` and home `<h1>` stay French in the Arabic UI; article `<title>` uses the edition's language regardless of UI | 2.4.2 / 3.1.1 | moderate | all AR pages | D-15, D-19 |
| A14 | Postponed badge and status conveyed by colour + text (OK); form chips "V/N/D" have `role=img` + label (OK); bottom-nav active state = weight + colour + `aria-current` (OK) | — | pass | — | `StandingsTable.tsx:268-284`, `BottomNav.tsx` |
| A15 | `prefers-reduced-motion`: global rule zeroes all animations/transitions; splash hold shortened; carousel has no autoplay | 2.3.3 | pass | — | `styles.css:959-981`; `firstVisit-390-reduced.html.anims = 0` |
| A16 | Form validation: fields carry `aria-describedby` to an always-mounted `role=alert aria-live=polite` line (`reserveError`); labels via `<label for>`; `autocomplete` present | 3.3.1 / 3.3.2 / 1.3.5 | pass | login/register | `audit.inputs` (labelled:true, describedBy set) |
| A17 | Match cards: whole card is one `<a>` with a composed `aria-label` (teams, score/kick-off, status), inner content `aria-hidden` | 4.1.2 | pass — but the label repeats "vs" in French ("Amal Tiznit vs Ittihad Tanger"); use "contre" | — | `MatchCard.tsx:165-183`, `dictionaries.ts matches.vs` |
| A18 | Zoom/reflow: 640 px and 320 px produce no horizontal scroll on home, standings, players, fantasy, article | 1.4.4 / 1.4.10 | pass (with D-20 content loss) | — | `_special.json → reflow-*` |
| A19 | Focus visibility: 2 px `--ui-ink-fg` ring with 2 px page-colour offset on every control; visible on links, cards, chips (screenshots) | 2.4.7 / 2.4.11 | pass | — | `keyboard-home-1440-fr-tab2.png`, `tab8.png`; `tokens.ts:670` |
| A20 | Touch targets: 0 elements under 44×44 on home, matches, clubs, club, standings, fantasy hub/rankings/players/create at 390 px | 2.5.8 | pass | — | `targets.small = []` on those pages |

axe-core 4.13 summary across 36 FR/AR 390-px pages + 18 FR 1440-px pages: **violations** — `region` (BP, 1–4 per hub: `UiPageTitle` band and `UiTabs` sit outside `main`), `list` (1, /news), `aria-allowed-role` (5, /news), `landmark-one-main` (404, welcome), `page-has-heading-one` (match while loading). **No WCAG A/AA violations of the automated ruleset other than `list`** — the residual risk is in the "incomplete" contrast-over-photo set and the manual items above.

## 5. Mobile findings (390 × 844 and 360 × 780, iPhone UA, touch)

| Check | Result | Evidence |
|---|---|---|
| Horizontal overflow (`scrollingElement.scrollWidth` vs `innerWidth` **and** any element with `getBoundingClientRect().right > innerWidth` outside a horizontal scroller) | **0 offenders on all 36 pages at 390 px**, 0 at 640 / 320 px; `html,body{overflow-x:clip}` is set (`styles.css:801-804`) so the second test was the one that mattered | `data/*-390-*.json → overflow.elements = []` |
| Touch targets < 44×44 | Home 0/20, Matches 0/25, Standings 0/10, Clubs 0/22, Club 0/18, Fantasy 0/27, Rankings 0/13, Players 0/85, Create 0/8; **News 10/52**, **Article 7/22**, **Match 3/19**, Login 2/12, Register 5/17 (details in D-10) | `targets.small` |
| Bottom nav | 76 px FR / 82 px AR, `aria-current="page"`, 5 × 75 px items ≥ 59 px tall, gradient pill + weight + colour for the active state; label "الملف الشخصي" truncates at 390 and 360 (D-16); 11 px labels | `_special.json → bars-*` |
| Sticky headers | Top bar 65 px everywhere; `/matches` adds a 59 px sticky chip row (200 px chrome with the nav); match page adds a 49 px sticky tab bar; Fantasy sub-screens use a 65 px `UiHeader` | `audit.fixed` |
| Safe areas | `env(safe-area-inset-top/bottom)` folded into `--topbar-h` / `--bottomnav-h` (`styles.css:35-46`), `pb-28` clearance under content (`UiScreen`) | source + `bars-390-fr.cssVars` |
| Input zoom on focus | 15 px inputs, 13 px selects → iOS Safari zooms (D-11, LIKELY) | `audit.inputs` |
| Tap delay | `width=device-width` viewport → no 300 ms delay; `touch-action: auto` | `jank-home-390` |
| Scroll performance hints | 0 `backdrop-filter` elements on Home (the glass tokens are unused there), 0 running animations after load, 10/13 images lazy, **8/13 images without width/height attributes**, buffered CLS **0.171** on one healthy load of Home at 390 px (LIKELY — single sample, > 0.1 "needs improvement"; the performance stream owns the number) | `_special.json → jank-home-390` |
| Text truncation | Club names in fixture rows (D-09/D-17/D-20), news kicker "Dernières actualités" at 320 px, nav label in AR | `audit.truncated` |
| Thumb reach | Primary actions (Se connecter, Créer mon équipe, Continuer) sit in the lower half; the language switcher and share/save icons are top-right, out of one-hand reach; the date strip's prev/next arrows are 44 px discs in the dark band | screenshots |
| Empty/error/loading states | Loading: shimmer skeletons (silent to AT); error: `ErrorState` with retry (never reached in practice, D-01); empty: illustrated panels ("Le classement n'est pas encore disponible", "Pas encore de classement", "Aucun fait marquant") — good copy, inconsistent art (V10); after-action feedback: sonner toasts (`Toaster` in root) | `States.tsx`, screenshots |
| Affordances | Match rows read as tappable (card, chevron-less but full-width hover/press states); club tiles obvious; the Fantasy "Général – ›" league row and the "Voir le classement 2025/2026" sunken pill are the two controls that look like static text/labels | `fantasy-390-fr.png`, `standings-390-fr.png` |
| Discoverability | Clubs hub is reachable only via Home "Explorer" tiles and the standings table — not in the primary nav (5 items: Accueil, Actualités, Fantasy, Matches, Profile). `/prizes` silently redirects to `/fantasy` (flag off) with no message. | `discover.json`, `prizes-390-*` final URL |

## 6. Trust signals

| Signal | Status | Evidence |
|---|---|---|
| Source attribution on licensed articles | Present: "Source : ElBotola" / "المصدر: البطولة" with a link, byline with initials disc, `<time dateTime>` publish + "Mis à jour il y a 4 heures" | `article-1440-fr.png`, `news.$articleId.tsx:389-503` |
| Dates on match rows / day bands | Present, localised (`ar-MA` / `fr-FR`), Casablanca TZ | `MatchCard.tsx:131-141` |
| Legal pages | `/terms` and `/privacy` exist in FR and AR, well structured (h1 + numbered h2), contact `support@botolago.com`, Moroccan law/loi 31-08 named; company "en cours de constitution", RC/ICE "en cours" — honest but reads as pre-launch; no "last updated" date on either page | `terms-390-*.png`, `src/content/legal/documents.ts:44,166` |
| Reachability of legal/contact | Only from `/profile`, the auth screens' consent lines (11 px) and the register checkbox; no footer anywhere (D-04) | `audit.meta.footerLinks = []` |
| "Made with Lovable" badge | **Absent** in the DOM and the served HTML (`curl` grep for "lovable" = 0 visible strings) | `audit.meta.lovableBadge=false` ×54 |
| Brand consistency | One wordmark, one icon mark, favicon `/favicon.png?v=2`, OG image 1200×630 declared; tab title in French only (D-15) | `__root.tsx:216-236` |
| Error/404 tone | Illustrated 404 with a clear action; generic error boundary with retry; but the `<title>` of the 404 is the home title | `404-390-fr.png`, `data/404-390-fr.json → meta.title` |
| Sponsor/data credits | "Botola Pro Inwi" naming is used (league sponsor) but no data-provider credit (SportsMonks) and no "Botola Pro" logo/licence line — benchmarks show provider credit in the footer | `clubs-390-fr.png` subtitle |

## 14. Coverage and limits

- Captured: 18 routes × 1440 px (FR; 10 in AR) + 18 routes × 390 px (FR + AR) + 10 routes × 360 px (FR + AR) = 211 PNGs, each with a DOM audit, axe run and rasterised contrast audit (`data/*.json`), plus 40 special-state probes (`data/_special.json`). The chain log is `.audit-tmp/a11y/chain.log`; scripts are `.audit-tmp/a11y/{lib,capture,special,discover*}.mjs` and `dict-scan.ts`.
- Not verified (say so per the brief): Safari/WebKit and Firefox behaviour (input-zoom D-11 is LIKELY only), real screen-reader output (VoiceOver/TalkBack/NVDA not available — ARIA was inspected structurally), any signed-in screen (no account was created or used: Fantasy team/transfers/points/leagues/profile are UNVERIFIED), dark mode (flag off), the live-match state and goal takeover (no live match during the window), the prize pages (flag off → redirect), and push/email notification copy.
- Timing numbers are deliberately absent: everything measured before 16:50 UTC was under audit-induced database contention (the coordinator's notice), and the performance stream owns load metrics. The `firstVisit-*` durations in `_special.json` are network-bound and should not be quoted as splash durations; the design intent is the source (800 ms hold + 350 ms fade, 250 + 200 reduced-motion).
- No production writes, no sign-ups, no guest sessions; the only POSTs were read-only RPC probes (`football_*`, `news_feed` with `{}` bodies) and two GET requests to `/auth/v1/authorize` that return a redirect without creating anything. Note for the lead: contrary to the `OAUTH_PROVIDERS_ENABLED` comment history in `feature-flags.ts`, Google and Apple both redirect correctly to their providers now (`.audit-tmp/a11y/oauth-probe.log`), so the auth buttons are live.
