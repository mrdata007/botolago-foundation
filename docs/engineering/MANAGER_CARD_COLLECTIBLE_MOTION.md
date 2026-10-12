# Manager Card as a physical collectible: entrance, flip, tilt, tier-up, rating chip

Status: **in build on `claude/motion-card-collectible`; no pull request yet.** Part 2 of 3 of
the owner-approved "Sorare-style" motion redesign. The direction was approved by the owner;
this brief is written before any interface change, as `AGENTS.md` ("Screen work") asks. It
builds on `MANAGER_CARD_MOTION.md` and `CURVA_CARD_SPEED.md`; read those for what is already
there. Curva is off in production (`MANAGER_CARD_ENABLED = false`); preview with
`VITE_MANAGER_CARD_PREVIEW=1` and `?mc=rated|tierUp|legend|cleared|forming1`.

## What was recorded on main (before)

- **Entrance** (`/curva?mc=rated`, session flags cleared): the card fades in over about 100 ms,
  slightly warped. No reveal, no sense of an object.
- **Flip** (`/curva/carte`): the card is squashed flat and swapped; no edge, no depth, no light.
- **Tier-up / Legend** (`?mc=tierUp`, `?mc=legend`): the card just appears; the burst is so
  faint on the white page that it reads as a smudge.
- **Rating chip** (`?mc=cleared`): the pop is small and fast.
- **Tilt**: follows the pointer with a short fixed lag and a plain ease back; a finger never
  tilts it (it floats on phones).

## What must be preserved

- The card's number, serial, text and shirt never animate inside the SVG. Éclat beats stay at
  600 ms or less (`BEAT_CAP_MS`); keyframes live only inside `prefers-reduced-motion:
no-preference`; `tilt.ts` owns the 3D tilt tree, so flip, entrance and ceremony transforms sit
  on wrappers outside it.
- Reduced motion: no flips, spins, bursts, sweeps; content swaps at once; the chip still shows.
- Accessibility: the flip button is keyboard operable and `aria-pressed`; the hidden face is
  `inert` and `aria-hidden`; the status region announces the face; French and Arabic/RTL; the
  server render shows the finished state; the 24-80 px `CardToken` gets no motion.
- Moment logic (which hero, once per session, gates, acknowledgements), once-per-visit entrance
  and its skip rules (hero showing, reduced motion, server-drawn card, launch gate), the
  once-per-round chip memory, and the card box (no layout shift).
- Business logic, scoring, the brand identity. Other areas (`splash/**`, `GoalMoment.tsx`, page
  transitions, `primitives.tsx`) are not touched.
- 60 fps: transform and opacity only; no layout-affecting animation; no filter animation on
  large areas; nothing new on the main thread per frame except the tilt's existing small repaint.

## Improvements

1. **Springs.** One small pure module (`curva/spring.ts`) samples a damped spring into Web
   Animations keyframes and into a CSS `linear()` easing, so every motion below is a compositor
   animation with real overshoot. No new library.
2. **Entrance.** The card rises from below with depth, turns slightly and settles with weight
   (spring, about 760 ms, one small overshoot); its ground shadow grows as it lands; one light
   sweep crosses its foil (a DOM glint layer clipped to the card outline, outside the SVG).
3. **Flip.** A true 3D turn: `perspective` on the parent, `preserve-3d`, `backface-visibility:
hidden` on both faces, a thickness slab of thin edge layers between the faces so the edge is
   visible edge-on, the card lifts (translateZ and scale) and its ground shadow grows mid-turn,
   the faces darken toward the edge and a glint crosses the face turning in. Spring-timed, about
   520 ms.
4. **Tilt.** Spring smoothing with momentum: the card follows the pointer on a soft spring and
   returns to rest with a slight overshoot. Phones: a finger dragging across the card tilts it
   (horizontal drags; vertical still scrolls the page); no device orientation, no permission.
   Desktop hover tilt stays.
5. **Tier-up and Legend.** A spotlight: the page dims behind the card, the card spins in (one and
   a half turns, face and back) and lands with a spring overshoot, the ground shadow thuds, the
   burst fires on impact over the dim so light reads, the tier badge stamps on, and Legend gets
   a full rainbow foil sweep. About 1.5 s in all; a tap anywhere or Escape dismisses it.
6. **Rating chip.** A confident spring pop (scale 0.3 to 1.2 to 1, a soft ring) in a larger,
   readable chip. Leftover micro-pops that fight the above are removed from the card's stage.

## Acceptance criteria

Visual, by eye on recorded video and frame strips (390 x 844 at 2x touch, 1440 desktop, French
and Arabic, plus reduced motion):

- The entrance reads as an object arriving: depth, weight, one overshoot, one sweep, shadow.
- The flip reads as a card turning over: visible edge when edge-on, lift, shadow growth, glint.
- The tier-up is clearly visible on the light page: dimmed spotlight, impact, stamp. Legend adds
  the rainbow sweep. Total under 1.6 s.
- The chip pop is noticeable and readable.
- Tilt eases with momentum; a drag on a phone tilts the card; nothing prompts for permission.

Functional:

- Every existing test passes. Changed pins (only these, each because the approved motion
  contradicts them): `flip-state.test.ts` (the turn is 520 ms and a WAAPI spring, not a 340 ms
  transition). Everything else is additive.
- Reduced motion: no flip animation, no sweep, no ceremony, no drag-driven 3D, no spin.
- Beats <= 600 ms; keyframes only in the no-preference block; no filter animation on large areas.
- The stage has the same box before and after; the SVG's content is untouched.
- `bun run typecheck`, ESLint and Prettier on changed files, full `bun test` (one known
  unrelated failure: `src/backend/news/editorial-session.test.ts`), and `bun run build`.

## As built

- **Springs** are `manager-card/motion/spring.ts` (damped spring and cubic-Bezier sampled into Web
  Animations keyframes). `CardGlint` (`motion/CardGlint.tsx`) is the band of light, clipped to the
  card outline (`motion/outline.ts`).
- **Entrance** (`curva/entrance.ts`, `use-stage-entrance.ts`): spring (zeta 0.52), 780 ms, rises 56 px,
  tipped back 26 degrees, one overshoot; the light sweep starts at 34 % (about 265 ms) and takes
  620 ms; the ground shadow grows with it. `entranceFrames` keeps its tested shape.
- **Flip** (`curva/flip-state.ts`, `CardStage.tsx`): 520 ms, curve `cubic-bezier(0.5, 0, 0.2, 1.22)`
  (leaves slowly, swings fast, overshoots 5 %, settles; a spring from rest leaves at full speed and
  read as a snap). Lift 90 px (translateZ), 9 edge layers of the tier's metal (5 px thick) while
  turning, faces shaded up to 50 % edge-on, glint on the face turning in, ground shadow grows
  to 1.16 x 1.7. A second tap mid-turn turns back from where the card is.
- **Tilt** (`eclat/tilt.ts`, `eclat.css`): follow 150 ms; letting go is a 760 ms transition with
  overshoot (`cubic-bezier(0.22, 1.45, 0.4, 1)`) and the inner parts' light is a real damped spring
  (critically damped following, zeta 0.55 settling). A finger that touches down and drags tilts the
  card (pointer events; `touch-action: pan-y` only on touch-only screens); no orientation sensor.
- **Tier-up** (`moments/TierCeremony.tsx`, `ceremony.ts`, `ceremony.css`): 1.5 s. Dim with a spotlight
  (fixed layer inside the card's raised stacking context, tap or Escape ends it), spin in one full
  turn over 980 ms (lands at 520 ms), thud, burst over the dim (800 ms, screen blend), badge stamp at
  560 ms, glint (rainbow for Legend), fade from 1240 ms. The card's back for the spin is passed in
  by Curva (`cardBack`) because nothing outside Curva may import Curva's files.
  Lesson recorded: an opacity animation on the spinner flattens its 3D context, so the fade is on the
  perspective wrapper.
- **Chip** (`curva/card-motion.css`): spring pop and ring, after 620 ms so it follows the entrance.
- **Pinned test changed**: `flip-state.test.ts` (340 ms to a 450-600 ms animation). Additive tests:
  `spring.test.ts`, `ceremony.test.ts`, the flip's frames, the tilt's drag and spring.
- Not done: phone drag tilt is the existing 9 degree range (modest by design); the beat of the card
  itself is unchanged and plays at the impact.

## Serial not shown, logo for the wordmark

- The card's serial (« BOT #482913 ») is no longer drawn or read anywhere a user sees: not on the front
  (Éclat plate), the back, the plain renderer, the share picture, the born panel, the card page, the
  deletion request line, nor in the card's accessible name. It stays in the data (types, profile
  mapping, backend) and still seeds the honeycomb's phase. Pins that asserted it was shown now assert it is
  absent (`render.test.ts`, `copy.test.ts`, `card-share-image.draw.test.ts`, `moment-text.test.tsx`, ...).
- The rail's typed « BOTOLAGO » and the back's letter-spaced one are the logo (`wordmark-paths.ts`).
