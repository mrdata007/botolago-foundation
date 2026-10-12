# Goal moment motion: a celebration, not a slide

Status: **built on `claude/motion-goal-moment`; no pull request yet.**
Scope approved by the owner on 2026-10-12 (part 3 of 3 of the motion redesign).
Frontend only: `src/components/matches/GoalMoment.tsx`, a commented block in
`src/styles.css`, and tests. Nothing in the database, migrations, Edge Functions
or `scripts/backend/`.

## Inspected on main

The panel (club colour, 7% stripes) slides up in 320 ms. "BUT !" and the scorer
card fade/zoom in over 420 ms, then **everything sits still for about 1.6 s**,
and the panel slides out. A static slide, not a celebration.

## What must be preserved

- `GOAL_MOMENT_MS` = 2400 ms start to finish; its own timer, tap anywhere or
  Escape dismisses sooner.
- Never takes focus, traps nothing; `aria-hidden` (the header's live region
  announces the score once).
- Reduced motion: the static banner under the bar, same duration, no movement.
- A clipping frame that starts under the top bar (`top-[var(--topbar-h)]`),
  so nothing passes over the bar.
- "BUT !" leans forward in French only; the tilt is mirrored for Arabic
  (`ltr:italic ltr:-rotate-[4deg] rtl:rotate-[4deg]`); Changa has no italic.
- Club palette through `clubStyle`; the small label sits on a patch of plain
  fill so its contrast is measured against the fill, not the stripes.
- When `score` is absent no score is shown. When `useGoalMoment` decides
  (never for a goal present at load) is untouched.
- Transform and opacity only, so a phone holds 60 fps.

## Improvements

1. Stripes become a transformed, oversized layer in the club colours that pans
   slowly for the whole moment (no `background-position` animation).
2. "BUT !" slams in: scales down from large with overshoot, and a tiny impact
   shake of the content stack on landing.
3. A light diagonal sweep crosses at the impact.
4. The scorer card swings in (3D rotate, spring-like settle) a beat after the
   word.
5. The new score ticks: the scoring side's number rolls from the previous value
   to the new one, then pops.
6. The stack keeps a slow push-in so nothing sits dead still while it is held.
7. Exit is together and quick: the panel leaves as one.

## Acceptance criteria

Visual: a frame strip at 40 ms steps shows the slam (large to settled in about
a third of a second), the shake, the card swing after it, the score roll, and a
non-static hold; it reads as sports-broadcast, not cartoonish; the club colours
and brand type are unchanged. French, Arabic (RTL, mirrored tilt and stripes),
1440 px desktop and reduced motion (static banner) each recorded on video.

Functional: `bun run typecheck`, ESLint, Prettier, `bun test` (existing goal
moment, ui-kit contract and safe-area tests stay green) and `bun run build`
pass; total duration remains 2.4 s; dismiss, focus and a11y behaviour as above.
