# Section loading: no frozen page after a tab tap

Status: built on `claude/instant-section-loading`. Approved by the owner on 2026-10-14 ("fix that",
about the old page staying frozen after a tap).

## Measured on the live site (before)

Mobile emulation, 390x844, botolago.com, signed out, French.

- Tapping Fantasy from Matches left the Matches page on screen, unchanged, for about 2.8 s. Only
  the bottom bar's pill moved. Then Fantasy appeared in one go.
- Cause: the first visit to a section downloads that section's code. Fantasy asked for about 45
  files after the tap; the last one finished about 5 s after it. The router keeps the old page up
  until the new page's code is in, and there is no pending screen (`defaultPendingComponent` is
  unset). A second visit is instant, because the files are cached.
- The section links do not preload (`defaultPreload` is unset), so nothing is fetched before the tap.

## Must be preserved

- No view transition between same-level destinations (NAVIGATION_SPEED.md); the drill-down and
  back slides, the theme and language cross-fade, and reduced motion as they are.
- The bottom nav and its sliding pill, the top bar, RTL (Arabic) layout.
- Every route, redirect and search parameter behaves as before; the server-rendered first page is
  unchanged (the pending screen never renders on the server).
- Business logic and brand identity untouched.

## Improvements

1. **Warm the sections' code.** Once the page has finished loading (the window's `load` event) and
   two more seconds have passed, the app fetches the code of the other primary destinations, one
   after another, while the browser is idle and never while a navigation is under way. Code only:
   no loader, no `beforeLoad`, no data. Skipped on a data-saver connection.
2. **A loading screen instead of a frozen page.** When the next page is still not ready 150 ms
   after the tap, the router shows the app frame (top bar, the section's title, the bottom bar on
   a primary destination) with the usual loading placeholders, until the page is in.

## Acceptance criteria

- After the first page settles, the primary sections' route code is fetched without a tap.
- Tapping a section whose code is not yet in shows the loading screen within about 150 ms, with
  the bottom bar still in place and its pill on the new tab; the real page replaces it when ready.
- Tapping a section whose code is in shows the new page at once, with no loading screen flash.
- Checked at 390x844 and 1366x860, in French and Arabic (RTL), with screenshots before and after.
- Existing unit tests, typecheck and lint pass.

## Result

Built with the project's own test build (`tests/e2e/built-output-build.ts`, stub backend), main
against this branch, same machine and run. Phone emulation 390x844, network throttled to 150 ms
round trip and 1.5 Mbit/s down, tap Matches -> Fantasy, two runs per cell. "Feedback" is the first
frame that shows the tap went somewhere other than the pill moving.

| When the tap comes                | main: feedback = Fantasy shown | branch: feedback | branch: Fantasy shown |
| --------------------------------- | ------------------------------ | ---------------- | --------------------- |
| 8 s after the page loaded         | 1.45 to 1.48 s                 | 0.09 to 0.10 s   | 0.40 to 0.43 s        |
| 2.5 s after the page loaded (fr)  | 1.44 to 1.47 s                 | 0.20 to 0.21 s   | 1.52 to 1.54 s        |
| 2.5 s after the page loaded (ar)  | 1.45 s                         | 0.22 to 0.23 s   | 0.65 to 1.58 s        |
| 0.3 s after the page started (fr) | 1.59 s                         | 0.20 to 0.21 s   | 1.55 s                |
| 0.3 s after the page started (ar) | 1.76 to 1.77 s                 | 0.21 to 0.22 s   | 2.46 to 2.78 s        |

- Once the code is in, the new section shows within about 0.1 s (main: about 1.5 s of frozen page).
- Whenever the page is not ready, the loading screen shows at about 0.2 s, in both languages.
- Known cost: a tap that lands just as the warm-up has started shares the connection with it. In
  the last row the Arabic page's own fonts were still loading and the warm-up had begun Home's
  files (fetched about 10 ms before the tap); requests in flight cannot be called back, so the
  full page arrived 0.7 to 1 s later than on main, behind a loading screen instead of a frozen
  page. The warm-up starts no new file while a navigation is under way.
- No data request is made by the warm-up: with no tap, the 9 s after the page settled fetched only
  `/assets/*.js` files.

Screenshots in `docs/qa/section-loading/`: the frozen live page before; the loading screen and the
finished page after, at 390 and 1366 wide, French and Arabic (right-to-left), and a match page,
whose loading screen keeps the bottom bar hidden as the page does.

Tests: `bun test` 8841 pass, 1 fail (the Ramadan 2027 clock test in
`src/backend/news/editorial-session.test.ts`, which fails on main too); typecheck and lint clean.
Two baselines move on purpose: the root route test lists the new empty `pendingComponent`, and
the i18n gate's W4 count goes 64 -> 65 for the loading screen's `t(section.labelKey)`.
