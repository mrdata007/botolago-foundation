# iPhone zoom and pitch touchlines: screen brief

Owner report, 2026-10-06, from the iPhone app (two issues):

1. "The names of the players get out of the line of the pitch." On the squad
   builder, the outer name plates of a five-player row sit across and past the
   white touchlines.
2. "When I am scrolling through the app, it involuntarily zooms in and I can't
   zoom back out. You need to remove zooming in." The screenshots show every
   page enlarged by about 1.067 and anchored at the left edge, and the zoom
   stays from page to page.

Branch `claude/ios-zoom-and-pitch-lines`, from `main` at `af8b0a7`.

## What was inspected before writing this

- The root viewport meta (`src/routes/__root.tsx`) and the two tests that pin
  it (`src/components/shell/safe-area.test.ts`).
- Every text field, search field and dropdown a phone user can reach, and the
  size of its text: the kit's `UiInput`, `UiSelect` and `UiTextarea` use the
  body size, `--ui-text-body: 15px`; the header search uses 13px.
- Capacitor 8's iOS shell (`node_modules/@capacitor/ios`). It leaves zoom off
  by default (`zoomEnabled: false`): the first pinch switches the pinch gesture
  off for good (`WebViewDelegationHandler.swift`, `scrollViewWillBeginZooming`).
  It does not stop WebKit's own zoom when a field gets focus.
- WebKit's focus zoom (`WKWebViewIOS.mm`, `_zoomToFocusRect`): it zooms by
  16 ÷ the field's text size, capped by the page's `maximum-scale`, and does
  not zoom back when the field loses focus. 16 ÷ 15 = 1.067, which matches the
  screenshots: a 15px field, most likely the sign-in email or password.
- The pitch: `UiPitchSurface` and `UiPlayerPlate` in
  `src/components/ui-kit/primitives.tsx`, `FplPitch`, `FplPlayerCard`, and
  every screen that draws a pitch (`/fantasy/team`, `/fantasy/points`, the squad
  builder on `/fantasy/create` and `/fantasy/transfers`, the Landing page's
  demonstration pitch, the demo app).
- Screenshots and layout boxes of the pitch before the change: squad builder
  (2-5-5-3), team page in 3-5-2, and the Landing pitch, French and Arabic, at
  390 and 402 wide and at 1280.

What the before measurements show. The touchlines are drawn 3% in from each
side of the turf. Rows of players only have 4px of side padding, so a row of
five plates shrinks to fill the whole width and its outer plates sit 4px from
the turf edge: across the line by 6.7px at 390 wide and 7.1px at 402, 9px
including the warning disc. Rows of four also reach the line on phones up to
390 wide. Desktop is clear.

## What must be preserved

- How every screen looks, apart from the pitch rows below. The viewport change
  and the double-tap rule draw nothing.
- The pitch itself: turf, mowing bands, markings, the plate design (shirt, name
  band, figure band, warning disc, captain and vice markers), row order, the
  swap animation, the bench strip's look.
- Rows that already sit inside the lines keep their plate size: goalkeepers,
  rows of three, rows of four from 390 wide, and everything on desktop.
- Right to left: Arabic mirrors French exactly. Only logical padding is used.
- `viewport-fit=cover` and the safe-area handling that depends on it.
- Fantasy rules, scoring, the gameweek lifecycle, squad rules and every other
  business rule; BotolaGO's identity.

## Improvements being made

1. **No more zoom in the app.** The viewport meta gains `maximum-scale=1`:
   `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`.
   WebKit caps the focus zoom at that value, so tapping a field no longer
   zooms. In the app's web view the same cap also stops double-tap and pinch
   zoom. `user-scalable=no` is not added: it changes nothing more in the app.
2. **No double-tap zoom on the website.** `touch-action: manipulation` on
   `html`. Panning, scrolling and pinching are unaffected; only the double-tap
   zoom goes.
3. **Plates stay inside the touchlines.** The pitch rows are padded by the
   touchline's inner edge (3.3% of the turf width) plus 6px, instead of 4px.
   Rows that do not fit shrink a little more, and long names are cut with "…"
   as they already are (the full name stays in the plate's `title` and the
   screen-reader label). At 402 wide a five-plate row goes from 69.2px to
   63.5px per plate.
4. **Bench on small phones.** On screens narrower than about 364px the four
   bench plates have fixed widths and the last one is cut off by the pitch card.
   They now shrink like the pitch rows. Nothing changes from 364px up.
5. **Tests and docs.** The viewport pins are updated and say why
   `maximum-scale=1` is there. A new source test models every row size at every
   common width and fails if a plate or its corner disc could cross a
   touchline. `DESIGN.md`, `DESIGN_SYSTEM_V2.md` and `docs/mobile/PHONE_APP.md`
   record both changes.

Not in this change:

- The captain or vice marker (the "C" or "V" disc on the shirt) can still
  overhang the line by up to 5px on 320 to 360px phones, when that player is in
  the last slot of a five-player row. Containing it would move the marker on
  narrow plates, which changes the plate design. It is clear from 375px up.
- Raising every field to 16px text (the alternative zoom fix that keeps pinch
  zoom on Android websites). It would change how every form looks.
- The demo app's own pages (`demo/index.html`, `public/demo/*`), the server
  error page and the app's offline page keep their own viewport tags. None has
  a text field.

Trade-off, stated plainly. With `maximum-scale=1`, visitors using Chrome on an
Android phone can no longer pinch to zoom the website unless they switch on
"Force enable zoom" in Chrome's accessibility settings. iPhone Safari visitors
can still pinch to zoom (Safari ignores the cap for pinching), and the app
never allowed pinch zoom. Browser text-size settings keep working everywhere.
External accessibility audits (Lighthouse, axe) will flag the tag.

## Acceptance criteria

Visual, measured from layout boxes in Chromium, not by eye:

- On the squad builder (two five-plate rows), the team page in 3-5-2 and the
  Landing pitch, at 320, 360, 375, 390, 402 and 430 wide and at 1280, in French
  and Arabic: every name and figure band, warning disc and corner badge sits at
  least 2px inside the inner edge of both touchlines.
- Goalkeeper rows, rows of three, rows of four from 390 wide and every row on
  desktop keep their plate width to within 0.5px.
- Bench plates at 320 wide sit inside the pitch card; at 375 and up they are
  unchanged to within 0.5px.
- Before and after screenshots at phone and desktop sizes, French and Arabic.
- The served viewport tag reads
  `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`,
  exactly once, and `html` computes `touch-action: manipulation`.

Functional:

- `src/components/shell/safe-area.test.ts`, `src/components/ui-kit`, the new
  pitch test, then the full `bun test`; `typecheck`; `lint` with 0 errors;
  prettier on the changed files.

Known limit of the evidence: no browser available here reproduces iOS zoom
(there is no WebKit, and Chromium does not zoom on focus). The zoom fix is
proven from WebKit's and Capacitor's source and by the served tag. Confirm on
the iPhone after the site is published: tap the sign-in email field, then the
search on `/fantasy/players`; the page must not zoom. A page already zoomed
resets when the app is reopened. The fix reaches the app with the website
Publish; no new app build is needed.
