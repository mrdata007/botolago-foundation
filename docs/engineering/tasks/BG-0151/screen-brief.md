# BG-0151 — `viewport-fit=cover` with safe-area fixes: screen brief

> **Note, 2026-10-06, after merging main.** Main's store readiness work (#358,
> commit e2458524) landed the same `viewport-fit=cover` change first: items 1, 3,
> 4, 5, 6 and 9 below and the Pépites reveal are now main's code. This branch now
> adds items 2, 7, 8 and 10, the BG-0151 tests and the docs. #358 also made the
> app iPhone only and upright, so the iPad and landscape app checks below no
> longer apply. The brief is otherwise kept as approved.

Owner decision, 2026-10-05: add `viewport-fit=cover`, with the safe-area fixes it
needs, in one change. Branch `claude/viewport-fit-cover`, from `main` at `a6fac90`.

Why: the phone app (Capacitor 8) loads botolago.com in a web view that fills the
whole screen. Without `viewport-fit=cover`, iOS reports every
`env(safe-area-inset-*)` as 0, so the kit's safe-area padding never switches on:
the top bar sits under the clock and the bottom navigation sits on the home
indicator. On Android, Capacitor's `SystemBars` passes the real insets through
only when it sees `cover`. The investigation, with file and line references,
is in the lane research (viewport-fit) the orchestrator holds.

Inspected before writing this: the root viewport meta (`src/routes/__root.tsx`),
the `body` block in `src/styles.css`, `ui.safe.*` in `tokens.ts`, `TopBar`,
`BottomNav`, `UiHeader`, `UiSheet`, `UiModal`, `FantasyFrame`, the toaster, the
reading-progress bar, every `fixed`/`sticky` element with `bottom-0` in `src`,
and the four bars that drop to `md:bottom-0`. Screenshots and layout boxes of
seven routes, before the change, with and without emulated insets, were taken
from untouched `main` (fr and ar, 390x844 portrait and 844x390 landscape).

## What must be preserved

- **Nothing moves on a screen without insets.** Every desktop browser and
  every phone or tablet that reports 0 insets keeps today's layout to the
  pixel: the top bar's height and row position, the bottom navigation's height
  and labels, the sticky bars' 12px and 16px bottom padding, toasts 16px from
  the top, the reading-progress bar at the very top, a dialog's 88% height cap,
  and a `body` with no side padding.
- The kit's existing safe-area handling stays as it is: `ui.safe.top`,
  `ui.safe.bottom`, `--topbar-h`, `--bottomnav-h`, and the components that
  already use them (`TopBar`, `BottomNav`, `UiHeader`, `UiSheet`, `AuthShell`,
  `WelcomeScreen`, `MatchTopBar`, `GoalMoment`, `LiveStrip`). They already use
  `max(env(...), fallback)`, which `cover` simply switches on.
- `--ui-gutter` stays a plain `var(--ui-space-N)` alias (the kit contract test
  pins it). The side insets are handled on `body`, not by changing the gutter.
- Direction safety. No physical `left`/`right`/`pl-`/`pr-` utilities. The side
  letterbox is symmetric, so French (left to right) and Arabic (right to left)
  get the same result.
- BotolaGO's identity and business logic: colours, type, copy, routing, the
  Fantasy rules, scoring, the gameweek lifecycle and Pronostics are untouched.
  No new dependency: no `@capacitor/status-bar` and no native plugin.

## Improvements being made

1. **Viewport meta.** `width=device-width, initial-scale=1, viewport-fit=cover`
   in `src/routes/__root.tsx`.
2. **Side letterbox on `body`.** `padding-inline` is the larger of the left and
   right insets. In landscape on a notched iPhone this keeps Home, match
   detail and the Landing sections out from under the notch, as Safari does
   today without `cover`. It is 0 wherever there is no side inset.
3. **Toasts** start 16px below the status bar instead of 16px from the screen
   edge (`src/components/ui/sonner.tsx`, the offset props only).
4. **Reading-progress bar** sits at the bottom of the status bar, not under it
   (`ReadingProgress.tsx`).
5. **Fantasy player page actions** ("Comparer", "Recruter") keep clear of the
   home indicator: bottom padding is the larger of the inset and 12px.
6. **Bars that drop to the bottom edge from 768px** (Pronostics sticky bar,
   Fantasy team bar, squad builder bar, transfer confirmation bar) keep clear of
   the home indicator in iPhone landscape and on iPad: padding is the larger of
   the inset and today's 16px or 12px.
7. **Landing page sticky button.** Its safe-area padding was silently dropped
   by class merging (a later `pb-3` won). It now uses one padding that is the
   larger of the inset and 12px.
8. **Fantasy inner screens on a phone.** Their header does not stick, so
   scrolled content would pass under the clock. A strip exactly as tall as the
   status bar, in the header's surface colour, now sticks at the top. It is 0px
   tall in a browser.
9. **Centred dialogs** (`UiModal`) cap their height so a very tall one stays
   inside the insets. Identical to today when the insets are 0.
10. **Android first paint.** `capacitor.config.ts` gets
    `SystemBars.initialViewportFitValueHint: "cover"` to avoid a layout jump on
    first paint. It takes effect at the next native build.
11. **Docs and tests.** `PRODUCT.md`, `docs/mobile/PHONE_APP.md` and
    `docs/engineering/DESIGN_SYSTEM_V2.md` record the decision. New tests pin
    the viewport meta and check that every `fixed`/`sticky` element with
    `bottom-0` carries safe-area padding, with the exceptions listed and
    explained.

Not in this change: `src/components/pepites/PepitesReveal.tsx` (the Pépites
restyle lane owns it; it needs the same bottom fix), the status bar's text
colour in the app (`SystemBars.setStyle`, a dark-mode follow-up), and the
Landing final section's 8px bottom padding below 1024px (an existing issue).

## Acceptance criteria (visual and functional)

Visual, measured from the page's layout boxes, not by eye:

- **Before vs after, no insets** (fr and ar, 390x844 and 844x390; `/`, a
  match, a Fantasy player, `/pronostics`, `/jouer`, a news article,
  `/fantasy/rules`): the boxes of the top header and its row, `main`, the
  bottom navigation and every pinned bar match to within 0.5px; `body` padding
  is 0; a toast sits 16px from the top.
- **Before vs after on desktop, no insets** (fr and ar, 1440x900; the same
  seven routes plus `/fantasy/team`, and the sign-in `UiModal` opened on a club
  page): the same boxes match to within 0.5px, a toast sits 16px from the top,
  and the dialog opens in the same box with the same 88dvh height cap. Added
  after review: the lane named phone sizes only, and the screen-work rules ask
  for a desktop check as well.
- **After, with emulated insets** (portrait: 47px top, 34px bottom; landscape:
  21px bottom, 47px each side):
  - the top bar's row starts at or below the top inset on every route, and no
    text or control sits under the top inset at scroll 0;
  - bottom navigation labels and the content of every pinned bottom bar end
    above the bottom inset;
  - in landscape, no text or control sits inside either 47px side zone;
  - a toast starts at least 16px below the top inset;
  - on Fantasy inner screens, scrolled, the status-bar zone shows pinned
    chrome, not page content.
- **Before, with the same insets**, is recorded too, as the evidence of what
  `cover` alone would break.
- Screens checked in French and Arabic (right to left), phone portrait and
  landscape, and desktop at 1440.

Functional:

- New tests: the root viewport meta contains `viewport-fit=cover`; the
  `bottom-0` safe-area scanner passes, and every exception in it is checked.
- Existing tests still pass: `src/components/shell`, `src/components/ui-kit`,
  `scripts/mobile/codemagic.test.ts`, then the full `bun test`; `typecheck`;
  `lint` with 0 errors; prettier on the changed files.

Known limit of the evidence: Chromium applies `env()` whenever insets are
emulated, whatever the viewport meta says. These checks prove the layout
answers the insets correctly, and that nothing changes without them. They do
not prove the iOS gate itself (WebKit reporting insets only with `cover`).
That needs a TestFlight build on a notched iPhone, an iPad and an Android 15+
phone, in French and Arabic.
