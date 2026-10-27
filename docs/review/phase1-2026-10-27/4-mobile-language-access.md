## Findings

Method note. Local app: this tree (`/home/user/botolago-foundation`), `vite dev` on port 47123 with every `VITE_*_DATA_MODE=mock` (demo data from `src/mocks/`). Playwright Chromium at 320, 360 and 390 px, French and Arabic, 17 routes plus 10 more with real mock IDs. Dev server, so timings are not representative. Overflow = bounding boxes against viewport (not scrollWidth). Contrast = canvas-converted computed sRGB, composited over the real ancestor backgrounds. Tap targets = painted box, then re-probed with `elementFromPoint` because the design system extends hit areas with `::after` (see "found fine"). I loaded 4 public botolago.com pages (/, /matches, /news, one article) with curl, anonymously. Scripts and raw output: `.../phase1/scripts/` and `.../phase1/mobile-shots/` (JSON, txt, PNG).

### M1 - Pinch-zoom is switched off for everyone
- What: viewport meta contains `maximum-scale=1`. On Android Chrome and in the Capacitor app nobody can zoom. The code comment itself says "Android browsers no longer do" pinch.
- Where: every screen. `src/routes/__root.tsx:241-242` (comment 225-240). Production confirmed: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"/>` on botolago.com/ and /matches.
- Why it matters to fans: the app uses 11 px text for nav labels, dates, club codes, player form (see M5). A fan with weak eyesight, or on a 5-inch screen in sunlight, cannot enlarge a score or a price. This is also a WCAG 1.4.4 failure.
- Severity: High
- Effort: S-M (remove the cap, and set input font-size to 16 px so iOS does not auto-zoom on focus; that was the reason for the cap. Test sign-in on iPhone).
- Proof: file:line above; curl output saved in `mobile-shots/prod-*.html`.

### M2 - Arabic users get a French, left-to-right page first; Arabic is applied only after JavaScript runs
- What: the server always renders `<html lang="fr" dir="ltr">`. The reader's language is in `localStorage` (`botolago.language`), which the server cannot see. `lang`/`dir` flip only after hydration, and the Arabic dictionary is a separate lazy chunk (`arabic.load()`), so text stays French until it arrives.
- Where: `src/routes/__root.tsx:342`; `src/i18n/provider.tsx:21,85,~119-137`. Production: `<html lang="fr" dir="ltr">` on / and /matches.
- Why it matters: on a cheap Android phone and weak mobile data, an Arabic fan sees French text, LTR layout, then a jump to RTL. A screen reader (TalkBack) reads the first paint with a French voice. Link previews and search see only French.
- Severity: High
- Effort: M (a cookie that the server reads for `lang`/`dir` and the first-render dictionary; the inline head script that already sets the theme could at least set `lang`/`dir` before first paint, S).
- Proof measured (dev, so only indicative): at 2.5 s after load with Arabic stored, 3 of 51 Arabic runs were still `lang=fr dir=ltr` (`ar|320|/`, `ar|320|/fantasy`, `ar|360|/` in `measure-all.json`; `ar|360|/clubs/…03` and `ar|360|/matches/…01` in `measure-ids.json`). With 4x CPU and slow 3G throttling the dev page was still French/LTR after 30 s (`lang-flash-output.txt`; dev bundle is unminified, so a production-build measurement is still needed). The launch splash hides some of this on first open of a session; I did not measure how often.

### M3 - Browser-tab titles stay French in Arabic mode
- What: static French `<title>`. In Arabic mode, `document.title` was French on: Home, Matches, Standings, Clubs, News, Login, Register, Notifications (measured). Fantasy and Pépites titles are translated, so the pattern exists.
- Where: `src/routes/matches.index.tsx:106`, `src/routes/news.tsx:104`, `src/routes/auth.login.tsx:35`, `src/routes/notifications.tsx:50`, `src/routes/clubs.index.tsx:35`, `src/routes/index.tsx:103,154`. Fix pattern already used in `src/routes/pepites.index.tsx:49` (sets `document.title` after mount).
- Why it matters: TalkBack announces the page title on navigation and the Android recent-apps/tab list shows it; an Arabic reader hears a French title on an Arabic page.
- Severity: Medium
- Effort: S
- Proof: `ar|360|/…` `title` fields in `mobile-shots/measure-all.json` (e.g. `/auth/login` = "Se connecter — BotolaGO" with `lang=ar dir=rtl`). Article titles are correct in production (curl: "Aperçu du match : …"); the generic titles I saw on mock match/club/article pages are a mock artefact, not reported.

### M4 - Green and magenta text on tinted chips is below 4.5:1
- What: `--ui-positive` (oklch .52 .14 150 = rgb 10,126,58) and `--ui-negative` (rgb 201,15,120) used as text on their own pale tints.
- Where / measured (light theme):
  - "Journée double" chip, 12 px: 3.90:1 (rgb 10,126,58 on rgb 206,229,216), `/fantasy/players/fp_rca_7`.
  - "NOUV." movement chip, 12 px: 3.90:1, `/pepites`.
  - Rank-change arrow and "12 k" value, 9.75-13 px: 4.05:1 (on rgb 223,228,236), `/fantasy/rankings`.
  - "Blessé" chip, 12 px: 4.04:1 (rgb 201,15,120 on rgb 245,212,231), `/fantasy/players`.
  Source tokens: `src/styles.css:2064-2065` (light), 2308-2309 (dark; dark theme measured 0 failures on 6 pages).
- Why it matters: injury and double-gameweek badges are the signals Fantasy managers act on, and they are small, on sunlit phones.
- Severity: Medium
- Effort: S. Per the brand rule, add a darker text-only shade (for example `--ui-positive-text` about oklch .46 .13 150 and `--ui-negative-text`), keep the fills and brand colours unchanged.
- Proof: `mobile-shots/measure-all.json`, `measure-ids.json` (`contrast` arrays). The white-on-white "contrast" hits on login/prizes are text over photos and `sr-only` spans; I discarded them.

### M5 - A lot of text is 11 px or smaller, in both languages
- What: `--ui-text-micro: 11px` is used for bottom-nav labels, weekday labels, club codes, "Forme", prices' unit. Smaller still: club monograms 9.6 px (`club-crest-style.ts:51-52`, `min(1em,40cqi)`), rank arrows 9.75 px (`primitives.tsx:2101`), an 8.25 px "M" in `/fantasy/transfers`. Arabic uses the same 11 px, where Arabic letters look smaller.
- Where: token `src/styles.css:1756`; bottom nav on every screen.
- Why it matters: with M1 (no zoom) these are unreadable for some fans. Counts of text nodes under 12 px at 360 px: Fantasy players 138, Transfers 67, Fantasy team 37, Home 42 (38 at 11 px + 4 at 9.6 px), Matches 28, Standings 12.
- Severity: Medium
- Effort: S-M (raise micro to 12 px, give Arabic 12-13 px; check the 320 px standings and pitch tokens after).
- Proof: `small` arrays in `measure-all.json`; Arabic nav screenshot `mobile-shots/home2-ar-320.png`.

### M6 - Terms / Privacy links on sign-in and sign-up are tiny targets
- What: two inline links under the form. Effective hit area (probed): French 121x16 px, Arabic 84-121 x 24-30 px. The 44 px hit-area helper is not applied to them.
- Where: `/auth/login`, `/auth/register`; the link class `underline underline-offset-2` in the auth screens (`src/routes/auth.register.tsx` ~line 221 `linkClassName`).
- Why it matters: two links 6 px apart on a 320 px phone; a fat thumb opens the wrong legal page. Low impact otherwise.
- Severity: Low
- Effort: S (add `ui.hitFloor` or `py-2`).
- Proof: `mobile-shots/hitarea-output.txt`.

### M7 - Header + table header + bottom nav cover about half the screen in landscape
- What: sticky/fixed bars: top bar 65 px, standings column header 33 px, bottom nav 76 px = 174 px. Portrait 360x740 = 24%; landscape 640x360 = 48%; landscape 568x320 = 54%. On a match page the sticky tab row (49 px) plus top bar (65 px) = 32% of 640x360.
- Where: `AppShell` topbar/bottom nav (`--topbar-h`, `--bottomnav-h`, `src/styles.css:36-50`), standings sticky `th`.
- Why it matters: a fan who rotates the phone to watch a live match page sees 1-2 rows of content.
- Severity: Low (most use is portrait)
- Effort: S-M (hide the bottom nav or shrink bars under `@media (max-height: 480px)`).
- Proof: `mobile-shots/extra-output.txt` (first block), `sticky-landscape640x360_*.png`, `standings-ar-320x568-scrolled.png`.

### M8 - Possible: old Android WebView / Chrome renders the page without colours
- What: the CSS relies on `oklch()` (207 uses in `styles.css`, no fallback), `color-mix`, container-query units (`cqi`), `@layer`, Tailwind v4. These need Chrome/WebView about 111 (March 2023) or newer.
- Where: `src/styles.css`, `src/components/common/club-crest-style.ts`; the Capacitor app uses the phone's own system WebView (`capacitor.config.ts`, `docs/mobile/PHONE_APP.md:402` already says to test WebView 140+ and an older one).
- Why it matters: cheap Android Go phones that never update System WebView; if colours are invalid the page can show black/transparent text and white-on-white.
- Severity: Medium (unmeasured; this is a risk, I could not run an old WebView here)
- Effort: M to verify (see Android section), S-M to add a safe baseline if it fails.
- Proof: code only.

### M9 - Smaller items
- Low, M9a: Home `<title>` says "Actualité, matchs et Fantasy" (singular) while the rest of the site says "Actualités". `src/routes/index.tsx:103` (production title confirmed by curl). Effort S.
- Low, M9b: Arabic countdown on Home at 320 px wraps between a number and its unit ("بقي 37" / "س 59 · الخميس"). Proof `mobile-shots/home2-ar-320.png`. Effort S (`white-space: nowrap` on each number+unit pair, `<bdi>`).
- Low, M9c: Noto Sans Arabic is the biggest font (166 KB woff2, `public/fonts/noto-sans-arabic-arabic-wght-normal.woff2`) and the Arabic stack falls back to Segoe UI Arabic / Tahoma, which Android does not have; with `font-display: swap` and `--ui-leading-display: 1.95` text can reflow when it loads. `src/styles.css:2262-2263`, `src/fonts.css:73-76`. Effort S (preload the Arabic file for Arabic readers, or size-adjust the fallback).
- Low, M9d: in Arabic mode the live strip and club badges show Latin codes ("FAR 1 – 1 WAC", "WAC/RCA/RSB" discs, and in Fantasy "(م)" next to "FUS"). In mock data the codes come from `crestPlaceholder`; real crest images may replace the discs but the live strip text is `LiveStrip.tsx:93` territory. Proof `mobile-shots/matches-ar-320x568.png`. Effort S-M, see Questions.

## How to test Android without an Android phone

What matters for BotolaGO: the Android "app" is a Capacitor shell that opens `https://botolago.com` in the phone's System WebView (`capacitor.config.ts`: `server.url`, `webDir` only holds the offline page). So almost every Android bug is a web bug in Chrome/WebView on a small, slow phone. Only push notifications, status/navigation-bar insets (`SystemBars`, `viewport-fit=cover`) and the offline page are native-specific.

Recommended order, cheapest first:
1. Chrome DevTools device mode (free, today). Good for: layout at 320/360/412 px, touch events, CPU 4x/6x and "Slow 3G" throttling, Arabic RTL, dark mode. Limits: it is desktop Chromium. It does not use Android fonts (Roboto/Noto), cannot set the Android "font size: largest" or "display size", has no gesture-nav/safe-area insets, no real memory pressure, and runs the newest Chromium, so it can never show the old-WebView problem (M8).
2. Android Studio emulator (free, needs a computer with 8 GB+ RAM and virtualisation). Create Pixel images for API 26 (Android 8), 28, 34. Settings > Display > Font size = Largest, Display size = Largest; turn on TalkBack; switch to 3-button and gesture navigation; update/downgrade Chrome and Android System WebView from the Play-enabled image. This is the best way to find old-WebView failures and large-text overflow. It can install the signed `.apk` that the Codemagic `android` workflow produces (`codemagic.yaml`: artifacts `android/app/build/outputs/**/*.apk`) by dragging it onto the emulator, which also covers the shell and offline page.
3. BrowserStack or LambdaTest real devices (paid, per-minute or monthly; check current plans). Pick 3-4 cheap devices that match your fans: a Samsung Galaxy A-series (A03/A14), a Xiaomi Redmi (9A/12), a Tecno/Infinix and one Android 8/9 phone. Use "Live" for the website and "App Live" with the Codemagic `.apk` for the shell. This is the only option with true low-end CPU/RAM and OEM keyboards and browsers. If your fans use Huawei devices without Google services, ask whether to include one (WebView version there differs).
4. Firebase Test Lab (the project already uses Firebase for push; free quota is small). Upload the Codemagic `.apk` and run a Robo test on 5-6 low-end real devices. It finds crashes and takes screenshots across devices, but a Robo crawler of a remote WebView is shallow, so use it as a smoke test only, after a new native build. Not the place to test fonts or Arabic layout.
5. Remote debugging via `chrome://inspect` on a borrowed phone: only if the owner can borrow a phone for 15 minutes (USB debugging). Works for Chrome on that phone. The release `.apk` from Codemagic is not debuggable, so it does not expose the WebView; use Chrome on the phone instead.

Best fit: steps 1 and 2 weekly (free), step 3 once before each big release for the 3-4 real devices, step 4 only when the Codemagic Android workflow changes. Use WebPageTest or DevTools with CPU 4x throttle for speed, but that is the Speed teammate's lane.

## What I checked and found fine

- Horizontal overflow: 0 elements outside the viewport (bounding-box check, excluding items inside scroll containers) at 320, 360 and 390 px, French and Arabic, on Home, Matches, match detail, Standings, Clubs, club page, News, article, Fantasy hub, team, players, player, transfers, rankings, leagues, prizes, notifications, profile, login, register, forgot-password, Pépites (`overflow` arrays empty in all JSON). The standings table keeps rank, club, P, GD, Pts at 320 px with no overflow (`matches_standings-ar-320.png`).
- Tap targets: raw bounding boxes flagged about 40 controls under 44 px (news save buttons 32x32, ranking "Signaler" 32x32 x29, club-name links 23 px high, Fantasy chip buttons 65x32). Probing the real hit area showed the design-system `hitArea` / `hitFloor` helpers (`src/components/ui-kit/tokens.ts:739,755`) give every one of them at least 44x44 effective. Only M6 remained. Bottom nav, top bar, filter chips, day strip, tabs and Fantasy "+" player buttons were already at least 44 px painted.
- RTL basics: `lang=ar dir=rtl` is applied once the language loads; CSS uses logical properties (236 logical-class uses versus 1 physical-class use in app code, a comment; the physical classes in `src/components/ui/{pagination,command,calendar,alert,table}.tsx` belong to shadcn components that no app screen imports). Directional icons are mirrored once in `src/styles.css:753-785`; back arrow, date-strip chevrons and the countdown chevron point the right way in Arabic screenshots. `letter-spacing` is reset for Arabic (`styles.css:747-751`). 328 `<bdi>` uses isolate numbers and names.
- Scores in RTL: Arabic strip reads home on the right, "FAR 1 – 1 WAC" with matching crests, minute `63′` and the score digits are LTR-isolated (`measure` text order from `/matches`, screenshots `home2-ar-320.png`, `matches-ar-320x568.png`).
- Screen readers: 0 interactive elements without an accessible name on all 27 routes, both languages; 0 `<img>` without `alt` (decorative ones use `alt="" aria-hidden`); live score headline has `aria-live="polite" aria-atomic` and a spoken sentence (`MatchScoreHeader.tsx:176-178`); skip link "Aller au contenu" and `Passer les matchs` exist; one `h1` per page, sensible `h2/h3` on News and Fantasy.
- Focus visibility: tabbing 18 stops on /matches, /fantasy/players, /auth/login and /news, every focused element showed a ring (global `:focus-visible` rule at `styles.css:823`, plus `ui.focus`).
- Dark theme: 0 text-contrast failures on Matches, Standings, Fantasy players, team, News, Login at 360 px (after the 7 s data wait; an earlier run on skeletons was discarded).
- Safe areas: `viewport-fit=cover`, `--topbar-h` and `--bottomnav-h` include `env(safe-area-inset-*)` (`styles.css:36,46,820`); Capacitor `SystemBars` hint set. Reading only, see below.
- Motion: `prefers-reduced-motion` handled (`styles.css:1419,1427,1568`).
- Fonts are self-hosted woff2 with `font-display: swap`, Arabic subset separate.
- Contrast of muted/secondary text: no failures found in light theme beyond M4.

## What I could not check and why

- Real notch/gesture-bar safe-area behaviour: Chromium cannot simulate `env(safe-area-inset-*)`. Needs an emulator or device.
- Android system font scaling (Settings > Font size): not simulable in desktop Chromium; my 150%/200% `html{font-size}` test did not move the layout because most sizes are px tokens, so it was inconclusive. Needs the emulator (see above).
- Old WebView / old Chrome rendering (M8) and real low-end CPU timing: no such runtime here.
- TalkBack/VoiceOver actual speech: only checked names, roles, `lang` and `aria-live` in the DOM.
- Real production data in Arabic: I used mock data (`VITE_*_DATA_MODE=mock`) and did not log in, so Fantasy squad building, player pages with real stats, long Arabic player names and live match updates were not measured. Mock-only artefacts ("Joueur exemple N", generic match/club titles, "MODE DÉMO" badge) are not reported.
- Language flash (M2) in a production build: the dev server bundle is far larger; I did not build (that writes into the repo, which Phase 1 forbids).
- Capacitor shell itself (offline page, push, status bar): no native build here.
- Only 4 botolago.com pages were loaded (HTML only), no scripts executed against production.

## Questions for the Lead

1. M2: is a cookie-based language (readable on the server) acceptable, or must language stay in `localStorage`? That decides M-vs-L effort. Also, should the speed teammate measure the real Arabic first-paint on a production build with throttling? I could not.
2. M1: may the cap be removed? It was added for the iOS focus-zoom problem (fields are 15 px). The safe fix needs fields at 16 px, a visual change for the owner.
3. M9d: in production, do club short codes in Arabic come from the database (Latin `code`) or from an Arabic `short_name`? I only saw mock data.
4. M4: confirm that a darker text-only green/magenta shade counts as an addition under the "brand colours are fixed" rule.
5. Which Android devices do the owner's fans actually use (Samsung A, Xiaomi, Tecno, Huawei)? That sets the BrowserStack list. Analytics (device model/WebView version) would answer it.
