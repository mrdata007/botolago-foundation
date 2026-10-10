# Motion plan, round 4: things that leave

Status: **built on `claude/motion-round-4-exits`; draft pull request, not merged.**
Scope approved by the owner on 2026-10-10: add Motion (motion.dev) only for
exit animations, the one thing the app's CSS toolkit cannot do (it can
animate an element that arrives, not one React has already removed). Follows
`MOTION_PLAN_3.md`.

## Library

- `motion`, pinned exactly to `13.4.4` (released 2026-09-25; not the new 14.x
  major).
- Only `LazyMotion` with `domMin` (the animation and exit features, without
  the hover, tap and focus gestures that `domAnimation` adds and nothing here
  uses), the `m.*` components and `AnimatePresence`, from `motion/react`.
  Never the full `motion.*` components, which bundle every feature. Budget:
  no more than about 20 KB gzip added to the client, measured from
  `vite build` output before and after.
- One shared wrapper in `src/lib/motion-exit.tsx`, so screens never import
  `motion/react` directly. It provides the `LazyMotion` boundary and the
  `MotionConfig reducedMotion="user"` setting, and reads its durations and
  easings from the existing tokens (`--duration-*`, `--ease-*`).

## What must be preserved

- Everything that already animates on arrival (`enter-rise`, `stagger`,
  `useArrivals`, `useFlip`, `swap-in`) keeps working as it does now.
- Behaviour: the same items are removed at the same moment in the data.
  Animation only delays what is drawn, never what is stored or sent.
- The server render is unchanged: no `initial` animation on first paint
  (`initial={false}` on `AnimatePresence`).
- Reduced motion: things leave at once, with no fade or collapse.
- RTL: any sideways movement follows `--vt-dir` or the logical direction.
- Accessibility: focus never lands on an element that is leaving. An element
  that is leaving is `aria-hidden` and `inert`.

## Improvements

1. **Notifications, dismiss.** A dismissed card fades and its row collapses
   to zero height (`--duration-sheet`, `--ease-standard`), so the list closes
   up smoothly instead of jumping. Focus moves to the next card's dismiss
   button, or to the heading if none remains.
2. **Fantasy transfers, player out.** On the pitch, the outgoing player's
   card fades and scales down while the empty slot (or the incoming player)
   fades in, in the same place (a cross-fade keyed by player id, not by slot).
   Undo and reset play it the other way. The existing `useFlip` reorder slide
   is kept.
3. **Global search.** The results panel fades out when it closes (cleared
   query, blur, Escape) instead of vanishing, and rows that drop out while
   typing fade out.

## Acceptance criteria

- Each of the three plays its exit at 390px and 1440px, in French and in
  Arabic, measured in a browser: the element is still present and its opacity
  is between 0 and 1 part-way through, and it is gone after the duration.
- Under reduced motion each element is gone within one frame.
- No layout shift on first load. The server HTML of the three screens is
  identical before and after, apart from the expected wrapper attributes.
- Client bundle growth reported, at most about 20 KB gzip.
- `bun test`, typecheck, lint and Prettier pass (one test fails already:
  `src/backend/news/editorial-session.test.ts`, "GMT" vs "GMT+0" from this
  container's ICU data, and it fails the same way on `main`).
