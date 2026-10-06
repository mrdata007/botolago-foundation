# Brief: store readiness inside the phone app

Approved screen work (AGENTS.md, "Screen work"). Written after inspecting the
screens and before the first interface change. The phone app is the Capacitor
shell in `capacitor.config.ts`, which opens the live site; the site tells it is
inside the app with `src/lib/native-app.ts`.

A store-readiness audit found four problems in the web code. This brief covers
those four and nothing else.

## What must be preserved

- Everything a browser visitor sees today. Every change below either applies
  only inside the app (items 1 and 2) or is a no-op wherever there is no
  notch (item 3: `env(safe-area-inset-*)` is `0px` in a browser without one).
  Item 4 adds one small control and one contact row in browsers too.
- E-mail and password sign-in and sign-up, unchanged, in the app and in the
  browser. `OAUTH_PROVIDERS_ENABLED` stays the switch for the browser.
- Share in the app wherever it actually works: the system share sheet
  (`navigator.share`, already feature-detected), WhatsApp and "Copier le lien".
- The server render and the first client render stay identical (no hydration
  mismatch). Pre-paint decisions are made the way the theme and the splash
  already make them: an inline head script puts an attribute on `<html>`, CSS
  reads it, React reads it back only after mount.
- The design system (DESIGN_SYSTEM_V2.md): kit primitives and `ui.*` tokens,
  logical properties only, 44px targets, French and Arabic with RTL.
- Fantasy rules, scoring, the gameweek lifecycle, league membership and every
  other business rule. No database change, no migration, no new table.
- Account deletion UI and copy (owned by another lane), `src/content/legal`,
  `scripts/mobile`, `codemagic.yaml` and `capacitor.config.ts` (owned by other
  lanes) are not touched.

## Improvements

1. **No Google or Apple sign-in inside the app.** Google refuses OAuth in an
   embedded web view, and on iPhone the shell hands any outside address to
   Safari, so the sign-in can never come back to the app. Inside the app the
   two buttons and their "ou continuer avec" divider are hidden on login and
   on sign-up (the only two places they render; the auth prompt dialog links
   to those pages and has no provider button). Browsers keep them.
2. **No dead "Télécharger l'image" inside the app.** The share sheet's
   download is an `<a download href="blob:…">`. Neither Capacitor shell
   handles downloads (no `WKDownloadDelegate` on iOS, no `DownloadListener`
   on Android), so the tap does nothing. Inside the app that one action is
   hidden. The system share button stays: it only renders when
   `navigator.canShare({ files })` says yes (iPhone's WKWebView supports it;
   Android's WebView has no Web Share API, so it never renders there).
   WhatsApp and copy-link stay on both.
3. **Notch and home indicator.** `viewport-fit=cover` is added to the viewport
   meta, so on an iPhone the page draws under the status bar and the home
   indicator and `env(safe-area-inset-*)` returns real values. Most fixed and
   sticky chrome already pads with them (top bar, page header, bottom
   navigation, sheets, auth and landing screens). This change completes the
   set: the toasts, the reading progress bar, the player page's action bar,
   the shadcn sheet's top/side variants, the centred kit dialog's height, and
   the bars that sit at the bottom edge on wide screens (`md:bottom-0`).
4. **Report another user's name (App Store guideline 1.2).** A small
   "Signaler" / "إبلاغ" action next to other people's Fantasy team and
   manager names (a league's standings, the overall ranking) and next to the
   name of a league the reader does not own (the league page header; Fantasy
   and Pronostics), plus the Pronostics league standings and the prize
   winners. It opens the reader's mail app on a pre-filled message to
   support@botolago.com naming what is reported (team, league or user), the
   visible name, its id and the page address. Never shown on the reader's own
   team, own row or own league. `ReportIssueSheet` (Pépites) was checked and
   is not reusable: it writes a player-data correction keyed to a player id
   and a fixed list of player fields. support@botolago.com is also added as a
   contact row on the profile page, for every visitor.

## Acceptance criteria

Functional

- With a Capacitor bridge on the page (simulated by a stub of what the
  native side injects), login and sign-up show no Google/Apple button and no
  divider from the first paint; without it, both still show.
- Server HTML is identical with and without the app; no hydration warning in
  the browser console in either case.
- Inside the app the share sheet has no "Télécharger l'image"; in a browser
  it still does.
- `viewport-fit=cover` is in the served viewport meta. Every fixed or sticky
  element at the top or bottom edge carries an `env(safe-area-inset-*)` term
  in its computed padding or position.
- The report action is absent on the reader's own row and own league, present
  on others, and its link is a `mailto:support@botolago.com` with a subject
  and a body holding the kind, the name, the id and the page URL.
- Capacitor's iOS (`WebViewDelegationHandler`) and Android
  (`Bridge.launchIntent`) sources are checked to hand `mailto:` to the
  system rather than loading it in the web view.
- Unit tests for the detection script, the mailto builder and the gating;
  `bun test`, `bun run typecheck`, eslint and prettier on touched files pass.

Visual

- Before/after screenshots at 390x844 and desktop, French and Arabic (RTL),
  of the login page (browser and app), the share sheet (browser and app), a
  league page with the report action and its menu, the overall ranking, and
  the profile contact row: in
  `docs/engineering/briefs/store-readiness-in-app/`.
- No horizontal overflow at 390px; the report control keeps the name column
  readable and has a 44px target; the menu opens toward the inline end in
  both directions.
