# Éclat: the collectible Manager Card

« Éclat », the shine. The card renderer of the collectible direction: a dark lacquered plate in a
metal shield frame, the club's match shirt in 3D on a honeycomb backboard with the manager's rating
printed on its chest, the tier in a plaque, the name hanging under the artwork, four stats and the
serial. Implements `CardRenderer` (`../renderer.ts`), id `eclat-v1`, and is the card the app draws:
`../active-renderer.ts` loads it. It replaced the first direction, whose folder was
deleted in the commit that switched the app over (git history keeps it).

Design: the Manager Card collectible plan in `docs/product/` (revision 3, with the critique and
confirmer fixes), its brief next to it, and the direction mock (`mock.html` in the design's folder
there), which the markup matches. Nothing in this folder reads a database, and
nothing here carries a third party's name, mark or artwork.

## Status of this folder

| Part                                                                                                      | State                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `full()`, `label()`, `aspect()`, `detail()`, `image()`, names, shirt, number                              | WP1: complete, tested, compared with the mock (below)                                                                        |
| `layers.ts`, `holo.ts`, `token.ts`, `beats.ts`, `tilt.ts`, the 3D, foil and beats sections of `eclat.css` | WP2: tokens per size, the holographic items, the depth, the tilt and the beats, each tested and measured in Chromium (below) |
| `active-renderer.ts`, the stage, the heroes, the sheets, the share picture                                | WP3b: the app serves `eclat-v1` (see "In the app" below)                                                                     |

## Files

| File                                                      | What                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                                                | `eclatRenderer`, `ready()`, `mountTilt`, `estimateAspect`. Imports `eclat.css`.                                                                               |
| `gradins-renderer.ts`                                     | The entry the section loads lazily; its file name is the chunk's name, which the off-bundle gate allows (`gradins-*`).                                        |
| `estimate.ts`                                             | `estimateAspect()` = 1.618, `ASPECT`. The only module meant for the main bundle: it imports nothing but a type.                                               |
| `geometry.ts`                                             | Every coordinate: outline, shield window, tab, shirt, chest box, tokens, honeycomb helpers, mirror helpers. Pure numbers and strings.                         |
| `foil.ts`                                                 | The six-step ladder (plan 5.4), the tier word (LASTREET), colour helpers over `src/lib/colour.ts`, the shirt's colours and the number's fill and twill.       |
| `view.ts`                                                 | The cleaned profile, the escape, the label, `serialLine`, a token's label.                                                                                    |
| `metrics.ts`, `measure.ts`                                | The committed face metrics (generated), and the measure: canvas in a browser, the table elsewhere. `ready()` loads the faces.                                 |
| `name.ts`                                                 | Name cleaning, the split, the fit to 790 units, the placement by ink, the Arabic stat label's fit. Pure.                                                      |
| `field.ts`                                                | The backboard: honeycomb (phase from the serial), fence, brushing, grain, pitch lines, backlight, floodlights, pool, vignette, aura, cast shadow.             |
| `shirt.ts`, `number.ts`                                   | The shirt in 3D, and the number: its fit on the ink, the print, « OVR », and the runs the share picture draws.                                                |
| `ornament.ts`, `plaque.ts`, `plate.ts`                    | The frame's materials and shapes, the tier plaque or forming marks, and the plate's text and furniture.                                                       |
| `text.ts`, `ctx.ts`                                       | A text described once (`<text>` or a share-picture run), and what one card's parts share.                                                                     |
| `full.ts`                                                 | `fullCard`, `cardImage` (share art), `founderDetail`, `appliedBeat`, `buildParts`.                                                                            |
| `layers.ts`, `holo.ts`, `token.ts`, `beats.ts`, `tilt.ts` | The layer stack and rims, the holographic layer, tokens and minis, the beats' timeline, the tilt (WP2's).                                                     |
| `pose.ts`, `lift.ts`                                      | The tilt's numbers and transform strings (pure), and the one-time rebuild of a tilting card's DOM so the parts that follow the light are layers of their own. |
| `ids.ts`                                                  | Unique SVG ids (`mc-<n>-…`); `../scope-ids.ts` makes the cached markup unique per mounted card.                                                               |
| `eclat.css`                                               | Fonts (Instrument Serif), text faces, the layer stack; then the 3D, foil and beats sections.                                                                  |
| `scripts/measure-faces.ts`                                | Regenerates `metrics.ts` (Playwright, Chromium).                                                                                                              |
| `../../../../scripts/qa/manager-card-gallery.ts`          | Writes a static gallery of every fixture, tier and size, and the mock's own cards for a side-by-side.                                                         |
| `test-data.ts`, `test-markup.ts`                          | Test support: the card words of both languages, a profile per case, the mock's cards; a strict reader for the markup. Not imported by the app.                |

## How a card is built

`full()` makes one string. `buildParts` draws the layers; `stack()` (`layers.ts`) puts them in the
root.

```
<div class="mc-eclat mc-eclat--{tier|base} mc-eclat--{light|dark}[ mc-holo][ mc-eclat--beat-x]" role="img" …>
  <div class="mc-eclat__shadow">
  <div class="mc-eclat__persp"><div class="mc-eclat__tilt">
    <svg class="mc-l mc-l--base">   defs, plate, field (honeycomb, floodlights, cast shadow)
    <svg class="mc-l mc-rim"> × 7    the card's thickness in the tier's metal
    <svg class="mc-l mc-l--shirt">   the shirt
    <svg class="mc-l mc-l--num">     the number: the only layer that takes the pointer
    <svg class="mc-l mc-l--frame">   plate, shield band, edge, tab, plaque, capsule, all the text
    <svg class="mc-l mc-l--holo">    CHAMPION and LEGEND only
    <div class="mc-eclat__foil">     the sheen (and the diffraction on CHAMPION and LEGEND)
```

- Shapes are drawn left to right and mirrored as a group in Arabic (`mirror`); **a text is never
  mirrored by a transform**, its x is mirrored and its `direction` set. Digits stay left to right.
- Every manager-supplied string (the name, the initials, the season, the serial, the label) goes
  through the one `esc` (`view.ts`). Tags are the allow-list's (`../markup-safety.ts`): no new tag;
  `pattern` and `mask` are required (honeycomb, the shirt's piqué, brushing, grain, the foil's cells).
- No `<image>`, no raster texture, no `feTurbulence`; filters are Gaussian blurs only.
- At rest the card is flat 2D and crisp; in 3D only while a pointer moves (`.mc-eclat--active`), a
  touch-only screen floats it (`--idle`), and it eases back (`--settle`). Verified in Chromium: at
  rest `.mc-eclat__tilt` computes `transform: none`, with a pointer over it `matrix3d(…)` and
  `preserve-3d`, 600 ms after it leaves `none` again, and with reduced motion nothing changes and
  `document.getAnimations()` is empty.
- The number: `[data-mc="ovr"]` with a transparent hit rectangle over the chest box; at its centre
  `elementFromPoint` finds it. It is never inside an animated element, a mask or a clip that changes.

## Names (plan 4)

Cleaned (`name.ts`): trim, collapse spaces, drop emoji, symbols, control and direction characters,
tatweel and harakat; uppercase in French keeping accents; apostrophes, dots and hyphens stay, and a
dash set between spaces is a hyphen. Split: two words → one each; three or more → the first word,
or the first two when the first is a particle (`LES LIONS` / `DU DERB SIDI MAAROUF`,
`عبد الرحمن` / `بن جلون العلوي`); one word → the one-word line. Fit: 790 units of ink (x 105 to 895, a first or last letter that
overhangs its advance shrinks the line a little); below a line's
minimum the last words of line 2 go (never part of a word); a single word still too wide is set at
its minimum with `textLength` (790 less the overhang) and `lengthAdjust="spacing"`. Placed by ink: the last line's ink ends at
least 14 above the rule, two lines keep 12 between their inks, the first line's ink stays 20 below the
plaque. The full name is always in the label and in the text the page prints under the card.

## Measuring

`metrics.ts` is generated by `scripts/measure-faces.ts` (`bun src/components/manager-card/eclat/
scripts/measure-faces.ts`): advance widths, ink boxes and pair kerning of Changa 800 and Instrument
Serif 400 for the capitals a cleaned name holds, every rating 1 to 99 and the dash, and the
dictionary's own words (Arabic labels and tier words). Arabic names fall back on an average per
letter (0.596 em in Changa 800, 0.494 in Changa 300). In a browser `measure.ts` measures with a canvas
once `ready()` has loaded the faces; **a rating always comes from the table**, so a number is fitted
the same everywhere. Checked in Chromium on the mock's twelve cards: the canvas layout and the
table layout agree on every text's size and position (largest difference 0), and on the plaque's
width to 0.01 unit.

## Fonts

Instrument Serif 400 (OFL, Fontsource 5.3.0, `public/fonts/`) is declared in `eclat.css`, never in
`src/fonts.css`: with the section switched off it is never requested. Changa and Manrope are the
app's (`src/fonts.css`); Noto Sans Arabic carries the Arabic stat labels and the sample pill.
`ready()` loads the faces it measures and prints (Changa 300 and 800, Instrument Serif, Noto Sans Arabic 700, Manrope 600 and 800) and waits at most 1.5 s; `active-renderer.ts` awaits it inside
`load()`.

## The tier word: LASTREET

The lowest tier (key `homa`) is displayed LASTREET in French and in Arabic (a Latin word, set left to
right and tracked in both: the tracking is an inline `style` on the `<text>` (`text.ts`,
`trackingStyle`), because the app's `html[dir="rtl"] * { letter-spacing: normal }` outranks a
presentation attribute and would strip LASTREET, « OVR », the serial and the wordmark of their
tracking in the Arabic interface; `tests/e2e/gradins.e2e.ts` reads the computed value under the
app's stylesheet). The renderer owns the word (`foil.ts`, `tierWord`, and `withTierNames` for
the label), so a card and its label say LASTREET whatever a dictionary holds. The dictionaries say
LASTREET too now (the key is still `homa`), and the screens set the word in an isolated left-to-right
run in Arabic (`../tier-word.tsx`).

## Interface additions (all optional, `../renderer.ts`)

- `RenderOptions.compact`: the face-à-face sheet's card (136 to 200 px): no serial, wordmark, « OVR »,
  season, club initials or stat labels; every remaining text is 58 units or more, so 8 CSS px at
  136 px. `ManagerCard` takes a `compact` prop (it is part of the render-cache key); the face-à-face
  sheet's card passes it, no other card does. Below 136 px the plate's text is under 8 CSS px, so a
  card that small is a `CardToken` (the born panel's 80 px token), never a compact card
  (`compact-floor.test.ts`).
- `TextRun.face` gains `"serif"` (Instrument Serif) and `"displayLight"` (Changa 300); `weight` gains
  300; `tracking` (letter spacing in image units), `rotate` (degrees about the run's point) and
  `fitWidth` (the width a name line that still overflows at its smallest size is closed up to, by
  spacing, as the card's `textLength` does; the drawer never opens it, and where the canvas does not
  space the letters, as in Arabic, it narrows the glyphs with `fillText`'s maximum width) are new.
- `CardProfile.ladder`: the tier ladder's token is drawn in its tier's material although it has no
  number (`tierKeyOf` is `base` for a profile with no rating otherwise); `ladderProfile` in
  `../to-profile.ts` builds the step. `moments/card-share-image.ts` maps the faces and honours both, and loads Instrument Serif,
  Changa Light and the figures' faces before it draws.
- `CardRenderer.mount` is the tilt. `ManagerCard`'s `tilt` prop (it was `sway`) asks for it; the
  rule for mounting it (asked for, a renderer that has it, the card in the page, no request for less
  motion) is `../mount-pointer.ts`.

## In the app

- **The stage** (`gradins/CardStage.tsx`, plan 10): the card is 296 px wide on a phone (never closer
  than 16 px to an edge) and 336 px from 768 px, centred, in a stage with 8 px each side and 18 px
  under the card for the tilt and the shadow it casts. Every card is 1 : 1.618, so the box reserved
  before the chunk loads (`estimate.ts`) is the box the card fills. An ellipse under the reserved box
  stands in for the card's own shadow until the card is drawn.
- **The heroes** (`moments/HeroFrame.tsx`) use the same widths and the tilt; the replay sheet draws
  the card at 296 px.
- **The share picture** (`moments/card-share-image.ts`): `image()`'s art and runs, drawn with the
  card's faces; LASTREET is left to right and tracked in both languages.
- **Tests**: `tests/e2e/gradins.e2e.ts` has the depth spec (flat at rest, `preserve-3d` and a number
  layer with height under a mouse, the number still what a click at its centre lands on, flat again
  after the pointer leaves) and the reduced-motion spec (no light written, no 3D, no animation).

## Share picture

`image()` returns the five layers flattened into one SVG at the rest pose, 707 × 1144 (the band the
picture allows), with no `<text>` and no stylesheet: the travelling parts carry their rest transforms
(`translate(12 -19.2)` for the foil, `(38.4 -64)` for the specular streak, `(-3.36 6.4)` for the
cast shadow). Every text is a run: season, club initials, sample, the number (an outline and a
twill made of eight offset copies, then the fill), « OVR » with its halo, the four labels and values,
the tier word, the two name lines, the serial and the founder's « 26 » (rotated 45 degrees along the
cut corner). The rail's wordmark is not drawn. The sheen and the foil overlay are HTML and are not
in it.

## Measured

Chromium 1194 and Bun 1.4 on the development machine; scripts in `scripts/`, the harness not
committed.

| What                                                                             | Result                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `full()`, median over 300 cards of the mock's twelve, in Chromium (canvas)       | **0.1 ms** (timer resolution), p95 0.3 ms, worst 2.3 ms; the first call 0.3 ms                                                                                                                                                                                                                                                       |
| `full()`, the same in Bun (table)                                                | 0.2 ms, p95 0.5 ms, worst 4.6 ms                                                                                                                                                                                                                                                                                                     |
| `token()`, 64 px                                                                 | 0.01 ms, p95 0.04 ms                                                                                                                                                                                                                                                                                                                 |
| Markup of a stage card                                                           | 38.1 to 42.6 kB (budget 46 kB)                                                                                                                                                                                                                                                                                                       |
| Éclat's own code, minified (without the shared card words)                       | 67 kB, **21.7 kB gzip**, CSS 10 kB, 2.6 kB gzip (budget 60 kB gzip, whole chunk)                                                                                                                                                                                                                                                     |
| Pixels against the mock, the twelve stage cards at DPR 2 (same page, same fonts) | up to 0.5 % of pixels differ by more than 24/255 per channel, all on the edges of the number, the plaque and the names (the mock measures text on a canvas at the drawn size and rounds the ink to whole pixels; this renderer measures at 1000 px); the G4 cards 0.3 to 0.9 %; the tokens 0.4 %. No layout or treatment difference. |

Budgets (plan 12.5): `full()` 25 ms, `token()` 3 ms, chunk 60 kB gzip, stage markup 46 kB, and G1's
card box in the page to `data-mc-ready` 400 ms at CPU x4.

### G1, data to `data-mc-ready` (budget 400 ms at CPU x4)

Chromium 1194 with `Emulation.setCPUThrottlingRate` 4, a 390 x 844 phone at DPR 2, seven runs per row
(cold: a fresh context, so the chunk and the faces are fetched; warm: a second visit), the mock data
modes, the machine shared with other work (load average 0.2 to 4). The interval runs from the
rating line first existing (the data is on screen) to the first `data-mc-ready`; the guest page has
no rating line, so there it runs from the card's box first existing. Medians in ms; the runs of a
row spread over 150 to 600 ms, so read the medians as a shape, not to the millisecond.

**On the development server** (every module its own request, React in its development build), the
incumbent card (Écharpe, `main`) against this branch:

| Page                                     | Incumbent, cold / warm | This branch, cold / warm |
| ---------------------------------------- | ---------------------- | ------------------------ |
| `/gradins?mc=rated`, French              | 832 / 509              | 596 / 498                |
| `/gradins?mc=rated`, Arabic              | 846 / 537              | 625 / 560                |
| `/gradins?mc=forming1`, French           | 836 / 483              | 508 / 469                |
| `/gradins?mc=legend`, French             | 850 / 502              | 524 / 503                |
| `/gradins`, guest, French (box to ready) | 661 / 484              | 772 / 628                |

The signed-in pages are 26 to 39 % faster cold than the incumbent's and level warm (the likely reason is
the head start of `preloadCardRenderer()` in the `/gradins` layout: the chunk and the faces load
while the data is on its way, which the incumbent's card does not do). None is under 400 ms here, and the renderer is not why. A sampling profile of the
interval on this branch (250 us samples, cold, 444 to 548 ms) puts 0 ms of self time in this
folder and 14 to 24 ms in `manager-card/`; the time is React's development build rendering the page
(`jsxDEV` 98 ms, the engine's own `(program)` 97 ms, garbage collection 36 ms, the reconciler's
checks and the date formatter after them). `full()` takes 0.1 ms. The guest page is slower than the
incumbent's on the development server because nothing there waits for data: the renderer's modules
load level by level (five deep, about a second at x4) on the path to the card, which one chunk does
not do in a build.

**On a production build**, for the guest page only. The preview that serves the section is
development-only (`MANAGER_CARD_PREVIEW` needs `import.meta.env.DEV`), so no committed build holds
the card. The figures below come from a scratch copy of each tree (never committed) with the
development gates of the card's four service files forced on and the mock data mode, built with
`vite build` in the smoke test's mode (`tests/e2e/built-output-build.ts`, a stub backend, its two ports
changed) and served by `tests/e2e/built-output-serve.ts`, the Worker module the site deploys. A
signed-in page needs the mock sign-in, which a production bundle refuses, so **G1 as defined (data to
ready on a signed-in page) has no production figure**; the guest page is the one the build can show.

| Guest `/gradins`, production build, CPU x4, 7 runs | Incumbent                         | This branch                       |
| -------------------------------------------------- | --------------------------------- | --------------------------------- |
| Cold, card's box to `data-mc-ready`                | 313 (217 to 361)                  | 308 (275 to 403)                  |
| Warm                                               | 135 (118 to 163)                  | 137 (98 to 146)                   |
| Renderer chunk, minified / gzip                    | 81.0 / 26.8 kB (CSS 3.2 / 1.1 kB) | 76.3 / 25.1 kB (CSS 9.8 / 2.5 kB) |
| Font files fetched                                 | 3                                 | 6                                 |

Both are under 400 ms on this page. `ready()` fetches six files on a French page, among them the
166 kB Arabic subset of Noto Sans Arabic, because its sample text holds Arabic letters; this
harness does not throttle the network and a build whose sample had none came out at 291 ms
against 308 ms, which is inside the spread, so no change was made. On a slow connection that is
where to look first.

## Looking at it

```
bun scripts/qa/manager-card-gallery.ts <out-dir>
```

writes `compare-light|dark.html` (the mock's cards, on the mock's own page chrome) and
`all-light|dark.html` (every fixture in French and Arabic, the six tiers, the founder's crop, the
share art with its runs, the tokens at every size). Serve `<out-dir>` with `/eclat.css` and `/fonts/`
mapped to this folder's stylesheet and `public/fonts`, and open it.

## Tokens and minis (plan 7)

`token.ts` draws one flat SVG per size, redrawn rather than shrunk. Composition by size (the shirt is
the short-sleeved token shirt, enlarged by `k` about its centre, moved to height `Yc`):

| Size (px)  | Composition | `k`, `Yc` | Drawn                                                                               | Rating (two digits, CSS px tall, measured) |
| ---------- | ----------- | --------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| 80         | card        | 1.86, 720 | shield window, shirt, tier bar, 1 px metal edge, rating in the chest box            | 13.8 to 17.4 (plan target 14)              |
| 64         | jersey      | 1.82, 780 | whole outline as the field, 2 px ring in the tier's colour, shirt, tier bar, rating | 11.9 to 15.0 (12)                          |
| 56, 48, 44 | jersey      | 2.04, 820 | as 64 with a foot band in place of the tier bar                                     | 9.9 to 12.5 at 48 (10)                     |
| 32, 28     | jersey      | 2.21, 820 | as 48                                                                               | 6.9 to 8.7 at 32 (7)                       |
| 24         | mini        | 2.21, 820 | as 32 without the rating (the row prints it)                                        | none                                       |

The plan's targets came from a canvas that rounds the ink to whole pixels; measured at 1000 px
the narrowest number ("44") is within 1.1 % of each. A one-digit 8 is set at 40.5 px at 80 and 40.7 px
at 64 (0.3 % smaller): the boxes are the plan's. CHAMPION and LEGEND paint the ring, the tier bar, the
foot band and the edge with the foil gradient (static). The thickness is the outline copy a pixel
down and away from the light, on the trailing side in both languages. `token()` builds in 0.013 ms
(median, Bun), markup 4.0 to 4.7 kB.

## Motion

Everything that moves is CSS, `prefers-reduced-motion: no-preference` only.

- **Tilt** (`tilt.ts`, the renderer's `mount`; the numbers are `pose.ts`'s): flat 2D at rest; with a
  mouse or pen over the card, `.mc-eclat--active` turns the tree 7 and 9 degrees in a 300cqw
  perspective, the layers lift to their depths (base 0, rims 1 to 7, shirt 3, number 5, frame 8,
  holo 9, foil overlay 9.5) and the light (`--mc-ax`, `--mc-ay`) follows the pointer with a 120 ms
  lag; leaving eases back over 450 ms (`--settle`) to the flat stack, and the layers, inline
  transforms and `will-change` are gone 520 ms after the pointer left at the latest. A touch-only
  screen floats the card (`--idle`) while it is on screen and the page is visible: a compositor
  animation of transforms (Web Animations), nothing on the main thread. A finger never tilts it, and
  under reduced motion nothing mounts. How it is built, and what it costs, is the next section.
- **Beats** (`beats.ts`, `TIMELINE`): what moves in each beat, with its start and length. `BEAT_MS`
  and `ANIMATED` are derived from it, `beats.test.ts` reads `eclat.css` and checks that the
  stylesheet declares exactly that, and nothing a beat names holds the rating, the serial, a text
  or the shirt. Measured in Chromium (every animation of the card, delay plus duration):

  | Beat      | Moves (start + length, ms)                                     | Ends |
  | --------- | -------------------------------------------------------------- | ---- |
  | `make`    | floodlights 0+180, field reveal 60+420, sheen 120+480          | 600  |
  | `tick`    | newest mark 40+260, or (a rated card) floodlight pulse 0+300   | 300  |
  | `first`   | field 40+360, sheen 80+480                                     | 560  |
  | `tier`    | field rises 0+420, floodlights 200+180, sheen 120+480          | 600  |
  | `legend`  | floodlights 0+180, foil shift 0+540 (three), diffraction 0+540 | 540  |
  | `founder` | capsule line, then fill, 0+520                                 | 520  |
  | `castoff` | seal line 40+380, floodlights dip 40+380                       | 420  |

  The sheen is a white band that crosses the card from the reading side and ends off the card (on
  CHAMPION and LEGEND the diffraction slides in instead); the field reveals from the reading side in
  both languages with one keyframe, because it sits inside the group the card mirrors. Every beat
  ends in the state the card rests in, so dropping the beat's class never jumps (compared to the
  card with no beat: identical but for anti-aliasing at edges, largest box-filtered difference 21 of
  255).

### Tilt performance (what is written, what it costs)

**The rule: a frame of tilt is compositing only.** The compositor moves layers that were rasterised
once; the page does no style recalculation, no layout, no paint and no raster for the card. In a
software-rendered Chromium (this sandbox: headless, no GPU, DPR 2) the first version held 20 to 30
frames a second on PRO and LEGEND while the same page with no card held 60. The cause was one line:
the tilt wrote `--mc-ax` and `--mc-ay`, registered as inherited numbers, on the card's root, so every
one of its thousand SVG elements was restyled and every layer repainted on every frame.

What the tilt writes now:

- `pose.ts` (pure, tested): every number and transform string. The card's turn, each layer's height
  (`translateZ` with a `scale` of exactly `1 - z / 300`, six decimals, which keeps the layers lined up
  with the flat card: a rounded scale softened every text at the centre pose), each of the seven rim
  walls, the contact shadow, and the 2D parallax of the parts that live inside a flat group.
- `lift.ts` (once, when a card mounts to tilt; a card that plays a beat is left alone): rebuilds that
  card's DOM so the parts that follow the light are layers of their own. The jersey's cast shadow, the
  frame's specular streak, LEGEND's plaque foil and the honeycomb's foil are taken out of the SVG layer
  they were drawn in (pieces in a flat `.mc-leaf` group, in the same order, with copies of the masks
  and clips they sat under); the shirt's crease blur is split into runs that lie together (one blur over
  sparse creases is seven browser layers); the number layer is cropped to the box that holds it, only
  while the card moves (`NUM_BOX`, 14 % of a card, whole CSS pixels so the glyphs keep their
  anti-aliasing). Nothing is added to the drawing and nothing is removed, the markup `full()` builds
  is not changed (the share art and the founder's detail read the original), and at rest the pieces
  are one browser layer again. `svg.mc-l.mc-l--*` are still there; `.mc-leaf`, `.mc-rims`, `.mc-s`,
  `.mc-cast` and `.mc-crop` are what is new in a tilting card's tree.
- `eclat.css`, "3D": `--mc-ax` and `--mc-ay` are `inherits: false` and are written only on the elements
  that read them (the root and the foil overlay); the parts' rest poses come from static `--mc-rx`
  and `--mc-ry`; `will-change: transform` and the transitions exist only inside `--active`, `--idle`
  and `--settle`. What sits under a mask or a clip gets no transition (a composited element under a
  mask costs a mask layer rasterised per frame): `tilt.ts` eases it, one small SVG root repainted at a
  time.
- `tilt.ts` also follows a card whose root was replaced after it mounted (the host sets the card's
  markup again a moment after the first mount): the previous tilt kept the detached first root and the
  card never tilted, on 5 loads of 30 in a first count and on 6 of the 16 before-runs below. It
  watches the host's children and mounts on the new root.

Measured (Chromium 1194, headless, software compositing, DPR 2, a 3 s pointer sweep over the card,
4 cores shared with other work: load average 1.2 to 2.1 during the runs, before and after
interleaved on two dev servers). Before is `3488fdc9` (the commit this lane started from), after is
this branch. A run in which the card never tilted (the lost-tilt race above) is left out of the
before column. Script: a Playwright harness with `requestAnimationFrame` intervals, the Long Tasks
observer and a CDP trace (`devtools.timeline`, `cc`, `viz`); not committed.

| Tier, card width                             | Frames a second (mean, per run) | Median frame / p95 | Frames over 20 ms (of ~175) | Long tasks in 3 s (longest) | Viz draw (ms) | Raster in 3 s (ms) | Style + layout (ms a frame) |
| -------------------------------------------- | ------------------------------- | ------------------ | --------------------------- | --------------------------- | ------------- | ------------------ | --------------------------- |
| PRO, 296 px, before                          | 31.3, 31.3                      | 33.3 / 50.0        | 76, 70 (of 94)              | 0 to 1 (53 ms)              | 27.7          | 3712               | 3.9                         |
| PRO, 296 px, **after**                       | 59, 59, 59                      | 16.7 / 16.8        | 0, 0, 1                     | 0                           | 10.5          | 932                | 1.3                         |
| LEGEND, 296 px, before                       | 27.3                            | 33.3 / 50.0        | 75 (of 82)                  | 1 (73 ms)                   | 30.1          | 4088               | 4.3                         |
| LEGEND, 296 px, **after**                    | 57.3, 58.3, 58.7                | 16.7 / 16.8        | 3, 1, 4                     | 0 to 1 (50 ms)              | 12.0          | 2518               | 1.4                         |
| PRO, 336 px, before                          | 23, 25                          | 33.4 / 58.4        | 72, 67 (of 75, 69)          | 1 (62 ms)                   | 37.3          | 3912               | 3.6                         |
| PRO, 336 px, **after**                       | 54.3, 55.3, 58                  | 16.7 / 33.3        | 4, 13, 9                    | 1 (66 ms)                   | 14.1          | 1412               | 1.3                         |
| LEGEND, 336 px, before                       | 22.3, 23.3, 24.7                | 33.4 / 50.1        | 70, 70, 67 (of ~70)         | 2 to 4 (79 ms)              | 38.0          | 4435               | 4.1                         |
| LEGEND, 336 px, **after**                    | 47, 51.7, 55.3                  | 16.7 / 33.3        | 9, 32, 16                   | 1 to 2 (100 ms)             | 16.6          | 3217               | 1.5                         |
| Touch float, PRO / LEGEND, 296 px, before    | 29 / 26.7                       | 33.3 / 50.0        | 76 / 76                     | 0                           |               |                    |                             |
| Touch float, PRO / LEGEND, 296 px, **after** | 56.7, 58.3 / 58.3, 58.3         | 16.7 / 16.8        | 4, 0 / 0, 0                 | 0                           |               |                    |                             |
| The page with no card, 296 and 336 px        | 58.3 to 59                      | 16.7 / 16.8        | 0 to 1                      | 0                           |               |                    |                             |

The median frame is 16.7 ms (60 a second) in every run after the change, at both widths. The mean
falls under 55 only at 336 px, in the runs where the compositor's draw (software, proportional to
the layers' area: 21 layers on PRO and 26 on LEGEND draw content, 16 and 21 of them the size of the card, at DPR 2) takes more than a frame: PRO 336 px
averages 14.1 ms a draw and LEGEND 336 px 16.6 ms, the LEGEND target of 55 a second is **not
reliably met at 336 px here**. A GPU compositor draws the same layers in a fraction of that; this
sandbox cannot show it. At 296 px, the width of a phone, every tier holds 57 to 59.

A second set of four runs of the same code, interleaved with a variant of it, at a load average
of 2.3, gave 58.0 to 58.7 frames a second on PRO and 56.3 to 57.3 on LEGEND at 336 px (and 58.7 to
59.3 at 296 px): the spread from one set to another is wider than the difference between two
versions of the code, so read the first table as the busy-machine case.

Why 336 px costs more than its area says: from a card 316 px wide on, the layers are taller than
512 CSS px and the browser tiles them (PRO, measured by forcing the card's width: 36 quads a draw
up to 312 px, 102 from 320 px; 738 raster tasks a sweep against 3141), which adds about 5 % to the
draw. The area is the larger part of it (draw time on PRO: 10.0 ms at 296 px, 10.9 at 312, 12.3 at
320, 14.0 at 336).

The one long task over 50 ms that remains at 336 px comes at the pointer's first entry: the main
thread is blocked in the commit while the compositor rasterises the 3D layers of a card that was
flat (`will-change` is deliberately absent at rest, so that a page of cards holds no layers). It is
once per entry, 59 to 100 ms in software raster, 0 to 1 task of 50 ms at 296 px. Holding every other
write for the first 100 ms after the entry did not remove it (the second frame's commit, which
carries the compositor's start of the transitions, waits for the first frame's raster whatever it
carries), so the tilt does not do it.

The touch float is transform-only: the card carries ten running animations, all of them `transform`,
which the compositor runs; a page with a floating card has no main-thread work for it (measured with
`hasTouch` and `isMobile` contexts, and by listing `document.getAnimations()` keyframes).

The card is the same card. Pointer-position captures of the card at rest and at five places
(top left, centre, bottom right, top right, bottom left, then rest again), eight fixtures (forming,
PRO, tier-up, LEGEND, founder, Homa, an Arabic name, a long Latin name) in French and Arabic at 390 and
1280 px (224 pairs, before against after, same server settings): 0.009 % of pixels differ by more than
24 of 255 (median; worst pair 0.076 %), 0.005 % at rest, and the differences are the anti-aliased
edges of thin outlines and the blur of the cast shadow (the second figure, more than 2 of 255 in a
channel, is 1.8 % of pixels at the median).

To add a moving part: write it as a `transform` through `pose.ts`, never as a custom property on the
root, never on something under a mask or clip unless `lift.ts` first makes it a root of its own;
put its `will-change` and its transition inside the three tilt states; and add its case to
`tilt.test.ts` (which reads `eclat.css`) so the next change cannot put the repaint back.

## To add a beat

Add its name to `BeatName` (`../types.ts`), its moves to `TIMELINE` (`beats.ts`; `BEAT_MS` follows
and may not pass `BEAT_CAP_MS`), put its keyframes in the `no-preference` block of `eclat.css` with
the same start and length, say in `appliedBeat` (`full.ts`) when it has nothing to do on a card, and
add it to the beat tests. A beat may move only the floodlights, the field group, the foil overlay's
`::after`, the foil shift, the marks, the capsule and the seal line, never the number, the serial, a
text or the shirt, and each of its keyframes must end where the card rests.
