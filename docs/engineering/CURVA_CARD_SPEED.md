# Curva card speed: why the card's motion felt sluggish, and the fixes

Status: **brief written before any code change; the fixes follow on branch `claude/curva-card-speed`.**
Scope: frontend only (`src/components/manager-card/`, `src/components/curva/`). No database, no
backend script, no change to the card's look, choreography or business rules. Curva is switched off in
production (`MANAGER_CARD_ENABLED = false`); everything here was measured on the local preview
(`VITE_MANAGER_CARD_PREVIEW=1`, mock data modes, `?mc=<fixture>`).

The owner's report: "the animations in the Curva card are sluggish". The card's motion is the Éclat
beats and tilt/float (`eclat/`), and, since PR #405, the entrance, the flip, the tier-up burst and the
rating chip (`curva/`, `moments/`). This note measures them, ranks the causes with evidence, and sets
the acceptance numbers the fixes must reach.

## How it was measured

- Playwright with Chromium 141 (`/opt/pw-browsers/chromium`), headless, **software-rendered** (no GPU),
  on a 4-core machine shared with other agents (load average 2 to 4 during the runs).
- Two profiles: a mid-range phone (390 x 844, DPR 3, `isMobile`, `hasTouch`, CDP
  `Emulation.setCPUThrottlingRate` 4) and a desktop (1440 x 900, DPR 1, mouse, unthrottled; the tilt
  also at CPU x4).
- The development server (React's development build, one request per module), the mock demo user,
  French. Storage is reset on every load (entrance, hero and moment memories), so each run is a "first
  visit". Entrance and burst runs are on a warm cache (a first load, then the measured one).
- Frame times are `requestAnimationFrame` intervals in the window of the motion; long tasks come from
  the Long Tasks observer; "input to first frame" is the click's `timeStamp` to the first frame after
  the transition or animation starts (events, no polling: polling `getAnimations()` in the frame loop
  was tried first and distorted the results). Median of 5 runs per row.
- Chrome traces (`devtools.timeline`, `cc`, `viz`, invalidation tracking) and CPU profiles of the
  worst cases; the layer tree from CDP `LayerTree`. Scripts, traces and screenshots are kept next to
  the work (not committed).

## Measured before the fix

Median of 5 runs, French. A "frame over 33 ms" is a dropped frame at 30 fps.

| Scenario                 | Profile    | Frames in window | Median frame (ms) | Worst frame (ms) | Frames over 33 ms | Long tasks (count, longest ms) | Input to first frame (ms) | Duration (ms) |
| ------------------------ | ---------- | ---------------- | ----------------- | ---------------- | ----------------- | ------------------------------ | ------------------------- | ------------- |
| Entrance                 | phone      | 3                | 233.3             | 566.7            | 3                 | 7, 513                         | -                         | 985           |
| Entrance                 | desktop    | 14               | 33.4              | 100              | 9                 | 1, 99                          | -                         | 638           |
| Flip, front to back      | phone      | 69               | 16.7              | 83.4             | 2                 | 1, 94                          | 142                       | 417           |
| Flip, back to front      | phone      | 58               | 16.7              | 83.4             | 4                 | 1, 79                          | 92                        | 417           |
| Flip, front to back      | desktop    | 68               | 16.7              | 16.8             | 0                 | 0, 0                           | 61                        | 413           |
| Flip, back to front      | desktop    | 66               | 16.7              | 33.4             | 0                 | 0, 0                           | 29                        | 423           |
| Tier-up burst (`tierUp`) | phone      | 6                | 266.7             | 333.3            | 5                 | 8, 599                         | -                         | 1379          |
| Tier-up burst (`tierUp`) | desktop    | 58               | 16.7              | 100              | 5                 | 2, 118                         | -                         | 1241          |
| Legend burst (`legend`)  | phone      | 7                | 233.3             | 300              | 6                 | 7, 619                         | -                         | 1242          |
| Legend burst (`legend`)  | desktop    | 53               | 16.7              | 83.4             | 7                 | 3, 105                         | -                         | 1241          |
| "Revoir" beat replay     | phone      | 68               | 16.7              | 183.4            | 7                 | 5, 150                         | 294                       | 516           |
| "Revoir" beat replay     | desktop    | 96               | 16.7              | 50               | 1                 | 0, 0                           | 162                       | 350           |
| Pointer tilt, 2 s sweep  | desktop    | 107              | 16.7              | 33.5             | 3                 | 0, 0                           | 78                        | -             |
| Pointer tilt, 2 s sweep  | desktop x4 | 63               | 33.3              | 66.7             | 23                | 1, 73                          | -                         | -             |
| Touch idle float, 5 s    | phone      | 299              | 16.7              | 16.8             | 0                 | 0, 0                           | -                         | -             |

The float is fine. The entrance and the bursts on a phone are the worst: 3 to 7 frames in about a
second. The flip, the replay and the tilt drop frames and answer late.

Layer tree (CDP, phone, DPR 3): the card at rest on a touch screen is 22 drawing layers and 26.7
megapixels (the float keeps the 3D stack alive), 3 of them in the flat state while it turns. Desktop
at rest: 17 layers, 3.9 megapixels; tilting: 33 layers, 6.6 megapixels.

## Causes, ranked

**1. The whole card is redrawn on every re-render of its parent (the main cause).**
`ManagerCard` hands React `dangerouslySetInnerHTML={{ __html: html }}`, a new object on every
render. React 19 compares that prop by identity (`react-dom` `updateProperties`: `nextProp !== lastProp`)
and, when it differs, sets `innerHTML` again, even though the string is the same. So any state change in
a component above the card replaces the card's DOM: 39 kB parsed again, about a thousand SVG nodes
restyled and laid out ("Removed from layout / Added to layout" for hundreds of `path`, `g`, `rect`,
`clipPath`, `mask`, `pattern` in the invalidation trace), every layer rasterised again, the lifted
tilt DOM (`lift.ts`) thrown away and rebuilt, and the float restarted. Counted with a setter spy on
`innerHTML` (phone):

| Moment                                 | Card HTML writes     |
| -------------------------------------- | -------------------- |
| `/curva` first load (entrance)         | 8                    |
| `/curva` hero `tierUp`, first load     | 18                   |
| One flip to the back and back to front | 4                    |
| One "Revoir"                           | 4 (2 are the beat's) |

The flip's click handler is a 137 ms task at CPU x4 (`EventDispatch` 123 ms, 39 ms of forced style and
layout), and the replay and the hero get a second rewrite plus a getBBox-heavy `liftCard` (436 ms of
`getBBox` in the hero's window) each time. Emulating the fix (skipping a write of identical
markup) alone: flip input to first frame 142 to 125 ms (front to back) and 92 to 71 ms, back to front
frames over 25 ms 13 to 6, hero burst 6 to 18 to 26 frames, replay 36.6 to 45 fps. The README of the
Éclat folder already met the symptom ("the host had its markup set again after the tilt was mounted",
about one load in six) and made the tilt follow the new root; the cause was not found.

**2. Entrance and hero beat start while the page is still rendering.**
The entrance animation is compositor work (transform and opacity) and plays perfectly on a loaded page:
re-running the same keyframes on the loaded phone page gives 33 frames and none over 33 ms, for all five
variants tried (as built, no opacity, flat 2D, opacity only, transform only). In the real run it starts
at the stage's mount, the same moment React is rendering the rest of the screen: the CPU profile of
the 1.2 s window is 500 ms of `jsxDEV` plus 130 to 165 ms of `getBBox` (the tilt's lift, a forced layout
of a dirty page), and the first frame arrives 900 ms after the animation starts. The user sees an
empty slot, then three frames. The hero's beat and burst start the same way (`beat` is on the first
HTML). Part of this is the development build's cost; the collision is the cause, and it exists in a
production build with less room.

**3. A beat is played by drawing the card again, twice.**
`beat` is part of the markup key, so a beat is a new HTML string: one rewrite to start it, one to end
it (`beatMs + 50`), each followed by a fresh `liftCard`. The only difference between the card with and
without a beat is the root's classes (`mc-eclat--beat-x`, `mc-eclat--pulse`) and `data-mc-beat`
(except `castoff`, which adds the seal path). Measured with every `animation` switched off, the replay
is as janky as with them (18 to 22 frames over 25 ms, 183 to 266 ms worst frame): the beat's keyframes
are not the cost, the redraw is. Applying the beat's classes in place on a floating phone card: 40 to
57 fps against 30, and `tick` 60 fps.

**4. The back face is always in the tree and always layered.**
`CardBack` (about 60 nodes, a 3D-rotated, backface-hidden layer of the card's size) is mounted at rest.
Taking it out under a pointer sweep at CPU x4 moved the tilt from 26.6 to 31.5 fps to 33.8 to 40.2
(three runs each, noisy; the same direction in every pair). It costs a layer and a raster on every
card page for a face most visits never turn.

**5. Durations and the click path.**
The flip is 420 ms (`--duration-hero`) and the entrance 525 ms (`entranceMs(420)`), both over the
400 ms where a motion starts to hold the user up; the flip's click effect also calls `tokenMs`, which
is a `getComputedStyle` read and forces a style recalculation inside the click (33 ms of
`getPropertyValue` in the click's CPU profile).

**Looked at and ruled out.** The tier-up burst's own cost on a quiet page (the standalone burst
layers, masked or not: 51 to 59 fps, within the noise of the baseline layer); the entrance keyframes;
the float (60 fps, 0 frames over 25 ms); the card's compositor layers during the turn (the flat
stack is 3 big layers); `backface-visibility` (no change with it removed). The float's ten animations
do tick style on the main thread each frame in this Chromium (about 1 ms at CPU x4); not changed here.

## What must be preserved

- **The look.** Every pixel of the card at rest, front and back, and the choreography of every beat
  (`TIMELINE`, `eclat.css` keyframes, `BEAT_CAP_MS` of 600 ms). Rest screenshots are compared before
  and after.
- **The card's rules and their tests, unchanged:** the number, serial, text and shirt never animate;
  beats at most 600 ms; keyframes only in the `prefers-reduced-motion: no-preference` block; `tilt.ts`
  owns the 3D tree (`beats.test.ts`, `layers.test.ts`, `holo.test.ts`, `tilt.test.ts` and every other
  Éclat test pass without edits).
- Right to left (the flip direction `--vt-dir`, the entrance lean, the burst's symmetry), French and
  Arabic.
- Reduced motion: no flip turn, no burst, no entrance, no beat, no float; content changes at once;
  `document.getAnimations()` empty.
- The flip's accessibility: the button is `aria-pressed` and keyboard operable, focus stays on it,
  the hidden face is `inert` and `aria-hidden`, the status line announces the face, the number is the
  hit target of the front.
- Business logic: moment selection, once per session, deadline gates, acknowledgements, ratings.
- The server render: the finished state, the same HTML for the same input.

## The fixes

1. **Stop rewriting the card's HTML when it did not change.** Memoise the `{ __html }` object on
   `html` in `ManagerCard`, `CardToken` and `FounderBlock`. A test pins that a re-render does not touch
   the host.
2. **Play a beat in place.** A new optional renderer method gives the root attributes a beat adds;
   `ManagerCard` keeps one markup string per card, adds and removes the beat's classes on the root, and
   draws the card again only for a beat that changes the markup (`castoff`) or a renderer without the
   method. The tilt is told when a beat starts and ends, so the lift and the float behave as before.
3. **Start the entrance when the page is quiet.** The entrance is created paused (the first frame,
   opacity 0, is what shows, so nothing flashes) and plays when a few frames in a row come on time,
   or after 700 ms at the latest. The tilt and the float still wait for it to land.
4. **Do not mount what is not shown.** The back face's content is mounted when the reader reaches for
   the button (pointer down, focus) or turns the card, not at rest; its box, `inert` and `aria-hidden`
   stay in the stage.
5. **Shorter, cheaper motion.** The flip turns in 340 ms (own constant, not the shared hero token),
   the entrance in 420 ms; the click path reads no computed style.
6. **Cut the redraws that remain** where the measurements after 1 to 5 still show them (the hero's
   duplicated card writes, the crest arriving after the first draw), without touching choreography.

## Acceptance criteria

Same method, median of at least 3 runs (5 where it is cheap), phone x4 unless stated.

| Measure                                                  | Before              | Must reach                                                                                       |
| -------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| Card HTML writes on `/curva` first load                  | 8                   | at most 2 (first draw, crest)                                                                    |
| Card HTML writes, hero `tierUp` first load               | 18                  | at most 3                                                                                        |
| Card HTML writes, one round-trip flip                    | 4                   | 0                                                                                                |
| Card HTML writes, one "Revoir"                           | 4                   | 0 for `first`/`make`/`tick`/`tier`/`legend`                                                      |
| Flip, phone: frames over 33 ms per turn                  | 2 and 4             | at most 1                                                                                        |
| Flip, phone: worst frame                                 | 83 ms               | at most 70 ms                                                                                    |
| Flip, phone: input to first frame                        | 142 and 92 ms       | at most 100 ms                                                                                   |
| Flip duration                                            | 417 ms              | at most 340 ms                                                                                   |
| Replay, phone: input to first frame                      | 294 ms              | at most 120 ms                                                                                   |
| Replay, phone: frames over 33 ms                         | 7                   | at most 3                                                                                        |
| Entrance, phone: frames in the played animation          | 3 in 985 ms         | at least 20, none over 50 ms                                                                     |
| Entrance duration (play to landed)                       | 525 ms              | at most 420 ms                                                                                   |
| Burst, phone: frames in the window                       | 6 and 7             | at least 25                                                                                      |
| Burst, desktop: frames over 33 ms                        | 5 and 7             | at most 3                                                                                        |
| Tilt, desktop and desktop x4: frames a second            | 50.6 and 29.8       | not lower (the back face goes)                                                                   |
| Float, phone                                             | 60, none over 25 ms | unchanged                                                                                        |
| Rest state, front and back, FR and AR, phone and desktop | -                   | no pixel differs by more than 24/255 outside antialiased edges; the worst difference is reported |
| Reduced motion                                           | static              | still static: no animation on the card, no turn                                                  |
| Existing tests                                           | pass                | pass unchanged; typecheck, eslint, prettier, build, off-bundle gate pass                         |

## What cannot be shown here

The browser is headless and software-rendered, so GPU raster and compositing gains are neither
measured nor claimed; the development build's React cost inflates the entrance and burst windows (the
quiet start is chosen so that it helps wherever the page is busy, not to hide that). The sandbox has no
real phone; CPU x4 stands in for a mid-range one.
