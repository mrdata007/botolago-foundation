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

1. **Warm the sections' code.** Once the page has settled (browser idle), the app fetches the code
   of the other primary destinations, one after another, code only (no data, no loaders). A tap
   then has nothing to download. Skipped on a data-saver connection.
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
