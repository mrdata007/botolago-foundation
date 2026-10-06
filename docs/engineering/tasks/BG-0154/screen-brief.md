# BG-0154 — Phone app polish after BG-0151: screen brief

Owner request, 2026-10-06 ("fix these then publish"), four of the follow-ups left
after #353 to #358. Branch `claude/app-polish-followups`, from `main` at `2f13117b`.

1. Two typed arrows point the wrong way in Arabic: the Home results link and the
   Matches empty-day link.
2. In the phone app the status bar's clock and icons follow the phone's light or
   dark setting, not the theme the app shows.
3. On the Fantasy player page, on a notched iPhone turned sideways, the bottom
   buttons reach the home-indicator band.
4. On the sign-in screens and Jouer, scrolled content shows behind the clock in
   the app.

Inspected before writing this, on untouched `main` (the server on :5400, release
`2f13117b`): `src/routes/index.tsx` and `src/routes/matches.index.tsx` (the two
literal "→"), the BG-0150 mirror rule in `src/styles.css` and its contract test,
the `fantasy.points.tsx` precedent; `src/theme/theme.ts`, `provider.tsx`,
`ThemeSwitcher`, `src/lib/native-app.ts`, `NativePushBridge`; `@capacitor/core`
8.5.2's `SystemBars` types and docs, the Android `SystemBars.java` and iOS
`SystemBars.swift`/`CAPBridgeViewController.swift` sources, and the iOS template's
`Info.plist`; `FantasyFrame`, the player page's action bar, `AuthShell`,
`LandingPage`, `SplashScreen`, `WelcomeScreen`, `safe-area.test.ts`.

Measured on main with Chromium's safe-area override (read-only page loads):

- **Arrows.** Both links render today ("Voir les derniers résultats →" on Home,
  "Derniers résultats : sam. 3 oct. →" on Matches). In Arabic the arrow sits at
  the end of the line, on the left, and points right: backwards.
- **What is under the clock.** At 390x844 with a 47px top inset, light and dark,
  on the 27 routes of the screenshot list: only `/auth/*` and `/jouer` have a dark
  top in the light theme; every other route has the theme's own surface there.
  Scrolled, `/auth/register` shows the white sheet under the clock (mean
  luminance 0.93 in light) and `/jouer` its light sections (0.85 at 1500px).
- **Player page sideways.** At 844x390 (insets: 47 left and right, 21 bottom) the
  action bar does not stick: at the top of the page it sits at y=780..873 in
  French (930..1023 in Arabic), below a 390px window, and half way down it is
  still below the window. Its scroll container is `main.fpl-column`
  (`overflow: hidden` from `md`), not the page. Portrait (390x844) has no scroll
  container and the bar sticks. The same applies to every `md` width: at
  1440x900 in Arabic the page is 1086px tall and the bar starts below the window
  (930..1014) instead of sticking.

## What must be preserved

- **Portrait phones and every screen without insets look the same.** The Home
  and Matches links keep their label, colour, weight and 44px tap height; the
  player page in portrait keeps its bar where it is; Fantasy inner screens keep
  their status-bar strip exactly as BG-0151 made it (same classes, same surface,
  phones only).
- **The website is unchanged by the native work.** Everything that talks to the
  status bar runs only inside the app (`nativePlatform()` is not null). In a
  browser it never loads `@capacitor/core` and never calls anything.
- **The theme itself.** The inline head script, the provider's SSR-safe first
  render, the Clair/Sombre/Système choice and its storage key are not changed.
- **Accessible names.** The links keep their translated label as their name; the
  new arrow is `aria-hidden` (the old "→" was read out as part of the name).
- **The BG-0150 contract.** No `rtl:` flip on the new icons; the one mirror rule in
  `styles.css` does the turning, and no new class is added to it.
- **Fantasy screens other than the player page.** The squad builder and
  transfer-confirmation bars (also sticky inside the Fantasy column) keep today's
  behaviour; this change does not touch them.
- BotolaGO's identity and business logic: colours, type, copy, routing, Fantasy
  rules, scoring, the gameweek lifecycle and Pronostics. No new dependency, no
  `@capacitor/status-bar`, no native project change.

## Improvements being made

1. **Arrows that turn in Arabic.** The literal "→" after the Home results link and
   in the Matches empty-day link becomes an `aria-hidden` lucide `ArrowRight`,
   16px beside the 15px label with a 6px gap (the Landing page's text-link
   recipe), which the BG-0150 rule mirrors under `dir="rtl"`.
2. **Status bar follows the app's theme (app only).** When the theme on screen is
   known after start-up, when the reader picks Clair or Sombre, and when the phone
   switches while Système is chosen, the app calls Capacitor 8's built-in
   `SystemBars.setStyle`: dark icons on the light theme (`SystemBarsStyle.Light`),
   light icons on the dark theme (`SystemBarsStyle.Dark`; Capacitor names the
   style after the background, verified in the iOS and Android sources). On
   Android the navigation bar follows the theme as well.
3. **Light icons over the dark bands.** The sign-in screens (`AuthShell`), the
   Landing page (`/jouer`, and `/` on a first visit) and the launch splash draw a
   dark top whatever the theme, so while one is on screen the status bar keeps
   light icons. Each screen declares it while it is mounted, so no route list has
   to be kept in step. `WelcomeScreen` is not mounted anywhere in `src` (the demo
   has its own), so it needs nothing.
4. **Player page sideways.** From `md` the Fantasy column clips its rounded
   corners with `overflow: clip` (plus `display: flow-root`, which keeps the block
   formatting context `hidden` gave) on the player page, instead of
   `overflow: hidden`. `clip` does not make the column a scroll container, so the
   bar sticks to the window and its bottom padding (the larger of the inset and
   12px) keeps the buttons clear of the home indicator. Opted into by the player
   page only, through a `FantasyFrame` prop.
5. **A status-bar strip on the sign-in screens and Jouer.** The sticky strip
   Fantasy inner screens already have becomes a small shared component
   (`StatusBarStrip`). `AuthShell` and `LandingPage` render it in the ink-deep of
   their dark band, so scrolled content passes under it. 0px tall where the inset
   is 0, so no browser without a notch changes.

## Acceptance criteria (visual and functional)

- **Arrows.** French: the arrow points right after the label. Arabic: it sits at
  the end of the line (left) and points left. Same label text and 44px tap height
  as before; the link's accessible name is the label alone. 390 and 1440, light
  and dark. No literal arrow glyph is left in JSX text anywhere in `src` (a test
  scans for one).
- **Status bar, unit-tested with a stand-in for Capacitor.** In a browser nothing
  is loaded or called. In the app: start-up, a choice and a system change while
  Système each send the style for the theme then on screen (Light for light, Dark
  for dark), a repeat of the same theme sends nothing, a held dark band sends Dark
  whatever the theme and releasing it restores the theme's style, iPhone gets one
  call (its `setStyle` ignores `bar`), Android one per bar with the navigation bar
  on the theme's style, and a failed call is retried on the next change.
- **Status bar, in a browser with a stand-in bridge.** With a fake iPhone bridge
  on the page, the real `@capacitor/core` sends `setStyle` to the bridge with the
  right style at start-up, on Clair/Sombre, on an emulated system change under
  Système, and DARK on `/auth/login` and `/jouer` in the light theme. Without the
  bridge, no call and no `@capacitor/core` request.
- **Player page.** At 844x390 with landscape insets, fr and ar, light: at the top,
  half way and at the end of the page the bar's bottom edge is at the window's
  bottom (390) and its buttons end at or above 369 (390 - 21), its scroll
  container is the page; portrait 390x844 with insets gives the same numbers as
  main. At 1440x900 in French, the page renders pixel-identical to main at the
  top and at the end of the scroll. Where the page is taller than the window
  (Arabic at 1440x900, a short window) the bar now stays at the bottom of the
  window while the page scrolls, as on phones — the behaviour its code always
  described.
- **Strips.** At 390x844 with a 47px top inset, scrolled: the top 47px on
  `/auth/login`, `/auth/register` and `/jouer` is the ink-deep strip (dark in both
  themes), where main showed the white sheet or light sections. At rest the strip
  sits over the band's dark top. With no inset the strip is 0px tall and the pages
  match main pixel for pixel at 390 and 1440. Fantasy inner screens render the
  same strip markup as before.
- French and Arabic (right to left), phone (390) and desktop (1440), light and
  dark. Typecheck, lint (0 errors), the relevant tests and the full `bun test`
  pass; Prettier is clean on the changed files.

Not checked here, and recorded as open: a real iPhone and Android phone (the
status bar, the strips under a real notch, Android's navigation bar), which the
owner's list also names.
