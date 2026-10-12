# Motion: calm, instant everyday screens (part 1 of 3)

Owner direction (2026-10-12): the motion reads as amateur, too many effects and
all of them stiff. Target feel is Sorare / iOS: a new page or tab appears at
once and fully drawn. Motion stays only where it carries meaning. This brief
is committed before any interface change, per `AGENTS.md` (Screen work).

Scope: everyday screens (page open, in-page tabs, lists). Out of scope and
owned elsewhere: Manager Card, launch splash, `GoalMoment`.

## What the inspection found (origin/main)

1. **Blank page, then a grey fade-in.** `Section` (`src/components/common/Section.tsx`)
   wraps almost every block of every page in `animate-in fade-in-0
   slide-in-from-bottom-2 duration-500`. Each Section mounts at opacity 0, so
   the first 80-120 ms of every page open show a blank body, and the whole page
   then fades up over 500 ms while sliding 8 px. A skeleton that is swapped for
   real content remounts the Section, so it fades in again and shifts.
2. **Grey film on drill-down.** The root view transition animates the old page
   to opacity 0 and the new page from opacity 0 at once (`vt-out-*`, `vt-in-*`),
   on top of the UA default `mix-blend-mode: plus-lighter`. Mid-way both
   snapshots are about half transparent over the white document, which is the
   washed-out film seen in the clips.
3. **Tab switch shows a blank frame.** The match tab panel is keyed on the tab
   and carries `tab-panel-in` (opacity 0 to 1, 180 ms), so the new panel starts
   invisible. Same class on club, Pepites, fantasy leagues and rankings tabs.
4. **Rise and stagger of lists.** `enter-rise` + `stagger` (up to 8 steps of 40
   ms) on Home news, club match list, predictions, search results, Pepites top
   ten and the pitch rows; many small `pop`s on counters.

## What must be preserved

- Reduced motion: everything instant (CSS and the JS helpers).
- Only transform and opacity animate; 60 fps.
- Visual identity, French and Arabic, RTL direction of slides and of the tab
  underline, all business logic and data flow.
- Meaningful motion: the tab underline sliding, the bottom-nav pill, sheets and
  dialogs opening, a rank/score reacting to a real change, press feedback.
- Manager Card, splash and `GoalMoment` are not touched.
- No new libraries. `styles.css` edits are one commented block.

## Improvements

- Pages and sections render drawn on the first frame: no opacity-0 mount
  animation on `Section`, tab panels, list items or the article body.
- Tab switch is an instant swap; the underline slides with a short spring-like
  ease (fast start, soft settle, tiny overshoot) instead of a timed fade.
- View transitions kept for drill-down only, as a quick crisp cross-fade: the
  outgoing page stays opaque underneath, the incoming one fades and slides a
  few pixels over it, `mix-blend-mode: normal`, so the composite never dips
  below full opacity and there is no grey.
- Remove rise-in, stagger and decorative pops on lists. Keep `pop` only for a
  value that really changed.
- Reserve space so nothing jumps: skeletons match their content's size.
- New tokens `--ease-spring` (indicators) and `--ease-settle-soft`; one ease
  family for what remains.

## Acceptance criteria

Visual (phone 390x844 @2x, desktop 1440, French and Arabic, reduced motion):

- Open a page from the bottom nav: no frame where the body is blank, no frame
  with a semi-transparent page, no section moving after it appears.
- Switch the match tabs: the first frame after the tap already shows the new
  panel at full opacity; only the underline moves, about 200 ms.
- Drill-down (match, article) and back: minimum composite opacity stays at 1
  with no grey; the transition is 160-220 ms.
- Lists appear complete with their page; no stagger.
- Reduced motion: no animation at all, in every flow above.

Functional:

- `bun run typecheck`, ESLint and Prettier on changed files, `bun test`,
  `bun run build` pass (one known unrelated failure:
  `src/backend/news/editorial-session.test.ts`).
- A test pins that `Section` no longer animates from opacity 0, and that the
  view-transition CSS never fades the old page.
- Before/after videos and frame strips recorded from this worktree's dev
  server and reviewed frame by frame.
