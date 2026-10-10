# Navigation speed: no page transition between same-level destinations

Status: approved by the owner on 2026-10-10 ("Drop the page slide on the main tabs"); implementation not started.

## Measured on the live site

Mid-range phone emulation (390x844, DPR 3, 4x CPU throttle). Every route change runs a full-page
View Transition (`src/lib/page-transition.ts`, `src/router.tsx` `defaultViewTransition`, CSS in
`src/styles.css` around the `::view-transition` rules):

- `startViewTransition` becomes ready 175 to 405 ms after the tap.
- The transition finishes 460 to 590 ms after the tap, and the old page is frozen until then.
- Bottom-nav moves already use the `fade` kind; Matches / Classement / Pronostics are full route
  navigations with a forward/back slide.

## Must be preserved

- The forward/back slide for drill-down and back (list to match detail and back).
- The theme and language cross-fade (`withViewTransition` in `src/lib/motion.ts`).
- The bottom nav's sliding pill.
- Reduced motion: no transition at all.
- RTL (Arabic) layout and behaviour, and every route with its behaviour (search params such as the
  season go along, as before).
- Business logic and brand identity are untouched.

## Improvement

Moving between same-level destinations starts no view transition: the bottom-nav destinations and
the route-backed section tabs (Matches / Classement / Pronostics). Only `page-transition.ts`
decides; the router still passes `defaultViewTransition`, which now answers `false` for those moves.

## Acceptance criteria

- No `document.startViewTransition` call and no `::view-transition` pseudo-elements on same-level
  moves; both still present on drill-down and back.
- Unit tests cover the new cases; existing tests pass.
- Measured before/after: transition fired yes/no, tap to new content, long frames, long tasks, in
  French and Arabic, on 390x844 with 4x CPU.
