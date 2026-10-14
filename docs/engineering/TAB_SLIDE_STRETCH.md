# Tab motion: Slide and Stretch

Status: built on `claude/tab-slide-stretch`. Chosen by the owner on 2026-10-14 from the React Bits
preview ("I will go with Slide and Stretch"): Slide is modelled on React Bits' Animated Content,
Stretch on its Rubber Segment. No React Bits code or animation library is added; both are built
with what the app already has.

## Inspected before the change

- Moving between same-level destinations (the bottom-bar sections, and Matches / Classement /
  Pronostics) has no animation at all since 2026-10-10 (NAVIGATION_SPEED.md): the view
  transition that used to run there kept the old page frozen for about 0.5 s on a mid-range
  phone, and was dropped for that reason.
- Each page draws its own frame: `AppShell` (most pages) or `FantasyFrame` (Fantasy), each with its
  own top bar and its own `BottomNav`. The bar's green pill slides to the new tab with a CSS
  transition from where the last bar left it (`lastPlacement` in BottomNav.tsx).
- Some pages put bars fixed to the screen edge inside their content (the Pronostics bar, the
  Fantasy team and fixtures pages, the landing page).

## Must be preserved

- No view transition between same-level destinations, and so no wait before the new page shows:
  Slide animates the new page as it appears, it never holds the old one.
- The drill-down and back slides (view transitions), the theme and language cross-fade.
- The top bar and the bottom bar stay still; bars fixed inside a page stay in place.
- Reduced motion: no Slide and no Stretch (the pill jumps, the page appears).
- RTL: in Arabic the next tab is on the left, so its page arrives from the left.
- Business logic, routes and brand identity untouched.

## Improvements

1. **Slide.** On a move between two same-level destinations, the new page's content (everything
   under the top bar) arrives from the side of the tab that was tapped: from the reading end when
   the tab is further along the bar, from the other side when it is earlier. 300 ms, 40 px, from
   transparent, with a soft settle. It moves the content by its offset (`left`), not by a
   transform, so a bar fixed inside the page is not carried along.
2. **Stretch.** The pill stretches from its tab toward the new one, flattening slightly, then
   gathers on the new tab with a small squash and settles: 460 ms, in place of the plain glide.

## Acceptance criteria

- Tapping a tab further along the bar: the content arrives from the right in French and from the
  left in Arabic; an earlier tab, the reverse. The same for Calendrier / Classement / Pronostics.
- The top bar and the bottom bar do not move; no horizontal scrollbar appears.
- No view transition starts on these moves (as before); drill-down and back unchanged.
- The pill stretches and settles on the new tab, in both directions and both languages.
- With reduced motion, neither animation runs.
- Checked at 390x844 and 1366x860, French and Arabic, with frames before and after.
- Unit tests for the direction rules; existing tests, typecheck and lint pass.
