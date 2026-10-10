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

| File                                                      | What                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                                                | `eclatRenderer`, `ready()`, `mountTilt`, `estimateAspect`. Imports `eclat.css`.                                                                         |
| `gradins-renderer.ts`                                     | The entry the section loads lazily; its file name is the chunk's name, which the off-bundle gate allows (`gradins-*`).                                  |
| `estimate.ts`                                             | `estimateAspect()` = 1.618, `ASPECT`. The only module meant for the main bundle: it imports nothing but a type.                                         |
| `geometry.ts`                                             | Every coordinate: outline, shield window, tab, shirt, chest box, tokens, honeycomb helpers, mirror helpers. Pure numbers and strings.                   |
| `foil.ts`                                                 | The six-step ladder (plan 5.4), the tier word (LASTREET), colour helpers over `src/lib/colour.ts`, the shirt's colours and the number's fill and twill. |
| `view.ts`                                                 | The cleaned profile, the escape, the label, `serialLine`, a token's label.                                                                              |
| `metrics.ts`, `measure.ts`                                | The committed face metrics (generated), and the measure: canvas in a browser, the table elsewhere. `ready()` loads the faces.                           |
| `name.ts`                                                 | Name cleaning, the split, the fit to 790 units, the placement by ink, the Arabic stat label's fit. Pure.                                                |
| `field.ts`                                                | The backboard: honeycomb (phase from the serial), fence, brushing, grain, pitch lines, backlight, floodlights, pool, vignette, aura, cast shadow.       |
| `shirt.ts`, `number.ts`                                   | The shirt in 3D, and the number: its fit on the ink, the print, « OVR », and the runs the share picture draws.                                          |
| `ornament.ts`, `plaque.ts`, `plate.ts`                    | The frame's materials and shapes, the tier plaque or forming marks, and the plate's text and furniture.                                                 |
| `text.ts`, `ctx.ts`                                       | A text described once (`<text>` or a share-picture run), and what one card's parts share.                                                               |
| `full.ts`                                                 | `fullCard`, `cardImage` (share art), `founderDetail`, `appliedBeat`, `buildParts`.                                                                      |
| `layers.ts`, `holo.ts`, `token.ts`, `beats.ts`, `tilt.ts` | The layer stack and rims, the holographic layer, tokens and minis, the beats' timeline, the tilt (WP2's).                                               |
| `ids.ts`                                                  | Unique SVG ids (`mc-<n>-…`); `../scope-ids.ts` makes the cached markup unique per mounted card.                                                         |
| `eclat.css`                                               | Fonts (Instrument Serif), text faces, the layer stack; then the 3D, foil and beats sections.                                                            |
| `scripts/measure-faces.ts`                                | Regenerates `metrics.ts` (Playwright, Chromium).                                                                                                        |
| `../../../../scripts/qa/manager-card-gallery.ts`          | Writes a static gallery of every fixture, tier and size, and the mock's own cards for a side-by-side.                                                   |
| `test-data.ts`, `test-markup.ts`                          | Test support: the card words of both languages, a profile per case, the mock's cards; a strict reader for the markup. Not imported by the app.          |

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

### G1, card box to `data-mc-ready` (budget 400 ms at CPU x4)

Chromium 1194 with `Emulation.setCPUThrottlingRate` 4, a 390 x 844 phone, five runs per row, the
mock data modes. The interval runs from the stage's `.mc-card` box appearing (client-only, so it marks
the data arriving) to the first `data-mc-ready`. **Development-server figures only**: the preview
that serves the section exists only on a development server (`MANAGER_CARD_PREVIEW` needs
`import.meta.env.DEV`), where modules are unbundled and React is the development build, so a
production figure could not be taken and the budget is **not shown met**.

| Page                                    | Before: the chunk starts with the first card | With `preloadCardRenderer()` in the `/gradins` layout |
| --------------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| `/gradins?mc=rated`, first visit (cold) | 1070 to 1188 ms                              | 599 to 744 ms                                         |
| `/gradins?mc=rated`, reloaded (warm)    | 501 to 621 ms                                | 408 to 740 ms                                         |
| `/gradins`, guest, first visit          | 600 to 809 ms                                | 632 to 890 ms                                         |
| `/gradins`, guest, reloaded             | 497 to 672 ms                                | 584 to 681 ms                                         |

The head start helps where the renderer's modules and faces have to be fetched (the first visit of
a signed-in manager: about 40 % less) and changes nothing once they are cached or when the data
arrives at once, as the mock's does: the warm rows are within the spread of the runs. What is left
is main-thread work at x4 once the data is in, not the load. Script: a MutationObserver on
`.mc-card` and `[data-mc-ready]`, run before and after the change on the same server.

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

- **Tilt** (`tilt.ts`, the renderer's `mount`): flat 2D at rest; with a mouse or pen over the card,
  `.mc-eclat--active` turns the tree 7 and 9 degrees in a 300cqw perspective, the layers lift to
  their depths (base 0, rims 1 to 7, shirt 3, number 5, frame 8, holo 9, foil overlay 9.5) and the
  light (`--mc-ax`, `--mc-ay`) follows the pointer with a 120 ms lag; leaving eases back over 450 ms
  (`--settle`) to the flat stack. A touch-only screen floats the card (`--idle`) while it is on screen
  and the page is visible. A finger never tilts it, and under reduced motion nothing mounts.
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

## To add a beat

Add its name to `BeatName` (`../types.ts`), its moves to `TIMELINE` (`beats.ts`; `BEAT_MS` follows
and may not pass `BEAT_CAP_MS`), put its keyframes in the `no-preference` block of `eclat.css` with
the same start and length, say in `appliedBeat` (`full.ts`) when it has nothing to do on a card, and
add it to the beat tests. A beat may move only the floodlights, the field group, the foil overlay's
`::after`, the foil shift, the marks, the capsule and the seal line, never the number, the serial, a
text or the shirt, and each of its keyframes must end where the card rests.
