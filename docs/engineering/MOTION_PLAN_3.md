# Motion plan, round 3: four gaps closed

Status: **built on `claude/motion-round-3`; draft pull request, not merged.**
Scope approved by the owner on 2026-10-10. Follows `MOTION_PLAN.md` and
`MOTION_PLAN_2.md` and uses the same toolkit (`src/lib/motion.ts`, the
utilities in `src/styles.css`).

## Audit (2026-10-10)

The owner asked for richer animation using Motion (motion.dev), React Bits
and LottieFiles. The audit found that most of what was asked for already
ships, with no library: route slides in the reading direction, the Manager
Card's reveal (`manager-card/eclat`), count-ups, green/red flashes and
sliding rows for points and rankings, the goal moment, the live score flip,
full-time pop, confetti, the captain ring, chip shine, the Pépites card flip
and the direction-aware shimmer. All of it collapses under reduced motion.

Library decision (owner, 2026-10-10):

- **Motion**: approved, but only for exit animations (an item leaving the
  screen), which the app has no machinery for. None of this round needs it,
  so it is not added yet. It comes with that work, loaded lazily
  (`LazyMotion` + `domAnimation`) to keep it small.
- **LottieFiles** and **React Bits**: not used. The player and the assets are
  heavy for phones, and stock effects would not match the brand.

## What must be preserved

- BotolaGO's identity: the tab look (Changa label, 4px accent bar under the
  active tab, heavier weight), the colours, the rank discs.
- Every behaviour: tab keyboard roving and ids, which panel shows, the rank
  figures and their accessible labels, the loading states' size and place.
- The motion rules: tokens only, `transform`/`opacity` only, RTL-aware, the
  server renders the finished state, nothing under reduced motion.

## Improvements

1. **Tabs.** The accent bar under the active tab slides to the newly chosen
   tab (one bar for the whole tab list, instead of one per tab that jumps).
   Tab panels that did not yet do so fade and rise in on a switch, as the
   match and club pages already do, through one shared `tab-panel-in`
   utility.
2. **Smooth scrolls respect reduced motion.** The four JavaScript smooth
   scrolls (date strip, prediction swipe deck, Fantasy points, rankings) ask
   `scrollBehavior()` and jump instead of gliding when the reader wants less
   motion. CSS cannot do this for them: an explicit `behavior: "smooth"` in
   script wins over the stylesheet.
3. **Shimmer everywhere.** The last three blinking (`animate-pulse`)
   placeholders use the shimmer: the landing page's button while the sign-in
   state loads, the notifications inbox, the admin security worker stats.
4. **Rank arrows react.** When a rank changes while the page is open, its
   arrow rolls in from the direction of the change (up for a better rank),
   and the disc variant pops once. Never on first show.

## Acceptance criteria

- The tab bar sits exactly where the old one did (4px, the tab's accent,
  under the active tab), at load and after a switch, in French and Arabic,
  at 390px and 1440px; in Arabic it slides the other way.
- With reduced motion on, nothing slides, fades or rolls; scrolls jump.
- No `animate-pulse` remains in `src/` outside comments.
- Existing tests, typecheck, lint and format pass.
