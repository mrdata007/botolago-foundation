# Premium launch splash

Brief for the launch splash rebuild. Owner approved 2026-10-11: the current
night-pitch motion (floodlights, ball flight with a light trail, flare, ripple)
reads as amateur. The target is premium, Sorare-level polish: fewer effects,
natural springy motion. Written and committed before any interface change
(AGENTS.md, Screen work rule 3).

## What must be preserved

- **First paint before any JS.** The splash is in the server HTML and the head
  script (`launch-splash.ts`) marks the load before the first paint. The ball
  and letters choreography is therefore pure CSS on server-rendered markup and
  starts at first paint. Only the WebGL rings need JS, and they fade in when it
  mounts.
- **Hold counted from first paint** (`claimLaunchSplash` returns the head
  script's `performance.now()`), not from hydration. `HOLD_MS` semantics stay.
- **Failsafe** (`SPLASH_FAILSAFE_MS`), `data-splash` gating, `claimLaunchSplash`
  / `releaseLaunchSplash`, StrictMode safety (idempotent claim, effect cleanup
  releases everything, the GL context is created and disposed inside an effect).
- **`onDone` read through a ref**, so a parent re-render cannot restart timers.
- **System bars:** `systemBars.holdDarkBand()` while the splash is up.
- **Reduced motion = the finished frame only:** logo, no rings, no motion.
  Animations are declared only under `prefers-reduced-motion: no-preference`,
  so the default state of every layer is its finished state.
- **RTL and Arabic.** The wordmark is a Latin logo and keeps its order in FR and
  AR (the box is `dir="ltr"`). No gradient angles, no `to left` / `to right`
  bias in anything that is not the fixed logo.
- **Accessibility:** `role="status"`, `aria-hidden` once leaving, and the
  wordmark exposes the name "BotolaGO" as a single image (`role="img"`).
- **Lovable / Capacitor:** no new dependency, no native plugin, no change to the
  head script contract, background stays dark in both themes.
- **Business logic and identity:** the logo artwork itself is unchanged.

## What is replaced

Every layer of the pitch story: floodlights, pitch, halfway line, ball flight
(three nested layers), tail, flare, ground ripple, shine, ground bar and their
keyframes in `src/styles.css`.

## Choreography (all CSS, from first paint; t = 0 is first paint)

The wordmark's ball is its last glyph, at the right end. The ball enters at the
centre of the screen; the wordmark then glides into place ("camera pan") while
the letters reveal outward from the ball, nearest first.

| t (ms)     | Event                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 0          | Night-navy field, nothing else. A soft blue halo sits behind the ball position at 0.                                                            |
| 0 - 260    | Ball fades in (opacity, early).                                                                                                                 |
| 0 - 760    | Ball: scale 0.55 to 1 with a spring overshoot (about 1.06 then settle), blur 10px to 0, spin -70deg to 0.                                       |
| 80 - 700   | Halo blooms with the ball.                                                                                                                      |
| about 400  | WebGL rings (when JS has mounted) fade in over 450 ms, pulsing out from the ball. On a slow load they join later, in phase with the same clock. |
| 620 - 1500 | Camera pan: the wordmark box eases from the ball-centred offset to centre (`cubic-bezier(0.22, 1, 0.36, 1)`, 880 ms).                           |
| 700 - 1180 | Swoosh arcs above the ball draw outward from it (clip wipe).                                                                                    |
| 760 + 55n  | Letters G, A, L, O, T, O, B (n = 0..6) each: opacity 0 to 1, blur 6px to 0, rise 10px to 0, scale 0.96 to 1, 520 ms, soft spring easing.        |
| about 1650 | Finished frame. Rings keep pulsing under the logo.                                                                                              |
| 2200       | `HOLD_MS`: leaving starts. 450 ms fade with scale 1.0 to 1.025 into the app. No hard cut.                                                       |

Reduced motion: finished frame for 250 ms hold, 200 ms fade, as before.

## Rings (React Bits MagicRings, adapted)

A raw WebGL2 full-screen-triangle renderer (`src/components/splash/magic-rings.ts`),
one draw per frame, the original fragment math with the mouse, hover, parallax
and burst uniforms removed. No three.js, no dependency.

- Colours: floodlight blue, `hsl(205 100% 76%)` (`uColor`) to `hsl(214 100% 62%)`
  (`uColorTwo`).
- Canvas: a square centred on the ball, inside the wordmark box, behind the
  letters; DPR capped at 1.5; luminance alpha mode (`uCoverageAlpha` 0).
- Parameters are tuned in px relative to the ball radius `R`, not the screen:
  rings start at about 1.2 R and spread to about 6 R; ring count 5; attenuation
  and thickness tuned so they read as fine light lines. Final numbers (`RING_LOOK`
  in `magic-rings.ts`): 5 rings, speed 1.1, attenuation 34, line thickness 1.5,
  base radius 0.075, scale rate 0.30, noise 0.035, ring gap 1.5, fade in 0.7,
  fade out 0.5, `hsl(205 100% 76%)` to `hsl(214 100% 62%)`; rings fade in from
  420 ms over 520 ms, with the cycle offset by 1 s so the first pulses are near
  the ball. The swoosh arcs draw from 700 ms (final tuning).
- Stops when the document is hidden or the component unmounts; GL resources
  disposed; `webglcontextlost` stops drawing. No WebGL2: no rings, never an
  error.

## Acceptance criteria

Visual

1. The ball appears first and alone; letters follow outward from it, left of it.
2. No flash, pop or hard cut; rings fade in, never pop; the exit is a gentle
   fade and scale.
3. Rings are centred on the ball (checked on frames, phone and desktop).
4. Nothing clipped at 320 px; the final frame is balanced and crisp.
5. FR and AR identical; the wordmark never mirrors.

Functional 6. Splash is painted before JS (server markup contains the inline ball and the
letters). Hold is measured from first paint. Failsafe and gating unchanged. 7. Reduced motion shows the finished frame with no animation and no canvas. 8. `getContext` returning null does not throw. 9. Smooth: no long run of frames over 25 ms under 4x CPU throttle on the phone
profile (measured, reported with the caveat that headless Chromium renders
WebGL in software). 10. Added client JS under 5 KB gzip (measured from `bun run build`). 11. `bun run typecheck`, eslint, prettier, and the full `bun test` pass (the
known GMT vs GMT+0 `editorial-session.test.ts` failure excepted).

## Revision 2 (owner review: the ball must be the hero)

The first cut showed a small ball in an empty screen. Reworked:

- **Hero ball.** It arrives at the middle of the screen at 3.2 times its size in
  the logo (about 31% of a 390 px phone's width, 215 px on a desktop), with a
  spring (scale 0.62 to 1 of that, overshoot), blur 5px to 0 and a 24 degree turn.
- **Rings around it.** Full-viewport canvas (no box edge), centred every frame
  on the ball's live on-screen centre (`getBoundingClientRect` of the ball path)
  and sized by its live radius, DPR capped at 1.5. Born at 1.2 R, spreading 1.9 R
  per cycle (about 3 R at most, so inside the screen at the hero size even at
  320 px). `uCutaway` 0.1 scales the original's angular cut-away, so the rings
  are near-complete circles; ring gap 1.08, attenuation 55, thickness 1.4, noise
  0.03, 5 rings, speed 1.5.
- **Assembly.** The ball holds and the rings pulse until 900 ms, then it shrinks
  and travels to its place at the end of the wordmark in one move (650 ms,
  slight settle). The rings follow it, scale with it and fade out between 950
  and 1600 ms, so no edge ever cuts them. The letters reveal outward from it.
  The travel is `translate` and `scale` from CSS custom properties computed from
  the logo's geometry: no JS measuring for the CSS part.
- **Size.** The wordmark is `min(80vw, 35rem, 84vh)`: 80% of a phone's width,
  560 px on desktop; the `vh` term keeps the hero's rings inside a phone on its
  side.

Timeline (ms from first paint):

| t (ms)      | Event                                                             |
| ----------- | ----------------------------------------------------------------- |
| 0 - 800     | Ball arrives, big, at the middle of the screen. Halo with it.     |
| 350 - 850   | Rings fade in around it (JS, when mounted; later on a slow load). |
| 900 - 1550  | Ball shrinks and travels home. Rings follow and fade out.         |
| 1000 + 50n  | Letters G, A, L, O, T, O, B (n = 0..6): blur to sharp, rise, in.  |
| 1300 - 1900 | Swoosh arcs draw outward from the ball.                           |
| about 1950  | Finished frame.                                                   |
| 2300        | `HOLD_MS`: 450 ms fade with scale to 1.03 into the app.           |
