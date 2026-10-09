# Éclat: the collectible Manager Card

« Éclat », the shine. The card renderer of the collectible direction: a dark lacquered plate in a
metal shield frame, the club's match shirt in 3D on a honeycomb backboard with the manager's rating
printed on its chest, the tier in a plaque, the name hanging under the artwork, four stats and the
serial. Implements `CardRenderer` (`../renderer.ts`), id `eclat-v1`, and replaces Écharpe
(`../echarpe/`) when `../active-renderer.ts` is switched to it (WP3b).

Design: `docs/product/MANAGER_CARD_SORARE_STYLE_PLAN.md` (revision 3, the critique and confirmer
fixes) and the direction mock `docs/product/manager-card-sorare-style/mock.html`, which the markup
matches. Brief: `MANAGER_CARD_SORARE_STYLE_BRIEF.md`. Nothing in this folder reads a database, and
nothing here carries a third party's name, mark or artwork.

## Status of this folder

| Part                                                                                                      | State                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `full()`, `label()`, `aspect()`, `detail()`, `image()`, names, shirt, number                              | WP1: complete, tested, compared with the mock (below)                                                                                |
| `layers.ts`, `holo.ts`, `token.ts`, `beats.ts`, `tilt.ts`, the 3D, foil and beats sections of `eclat.css` | WP2's files: **a first, working version** written by WP1 so the renderer is whole and the contract passes; WP2 refines them in place |
| `active-renderer.ts` still serves Écharpe                                                                 | WP3b switches it                                                                                                                     |

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
| `layers.ts`, `holo.ts`, `token.ts`, `beats.ts`, `tilt.ts` | The layer stack and rims, the holographic layer, tokens and minis, the beat table, the tilt (WP2's, first version).                                     |
| `ids.ts`                                                  | Unique SVG ids (`mc-<n>-…`); `../scope-ids.ts` makes the cached markup unique per mounted card.                                                         |
| `eclat.css`                                               | Fonts (Instrument Serif), text faces, the layer stack; then the 3D, foil and beats sections.                                                            |
| `scripts/measure-faces.ts`                                | Regenerates `metrics.ts` (Playwright, Chromium).                                                                                                        |
| `scripts/gallery.ts`                                      | Writes a static gallery of every fixture, tier and size, and the mock's own cards for a side-by-side.                                                   |
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
  `pattern` and `mask` are required (honeycomb, knit, brushing, grain, the foil's cells).
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
`عبد الرحمن` / `بن جلون العلوي`); one word → the one-word line. Fit: 790 units; below a line's
minimum the last words of line 2 go (never part of a word); a single word still too wide is set at
its minimum with `textLength` and `lengthAdjust="spacing"`. Placed by ink: the last line's ink ends at
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
right and tracked in both). The renderer owns the word (`foil.ts`, `tierWord`, and `withTierNames` for
the label), so a card and its label say LASTREET whatever the dictionary still holds until the
dictionary change (WP3a) lands; after it, nothing here changes.

## Interface additions (all optional, `../renderer.ts`)

- `RenderOptions.compact`: the face-à-face sheet's card (136 to 200 px): no serial, wordmark, « OVR »,
  season, club initials or stat labels; every remaining text is 58 units or more, so 8 CSS px at
  136 px. **WP3b**: `ManagerCard` passes it for the sheet's card (`width ≤ 220`) and adds it to the
  render cache key.
- `TextRun.face` gains `"serif"` (Instrument Serif) and `"displayLight"` (Changa 300); `weight` gains
  300; `tracking` (letter spacing in image units) and `rotate` (degrees about the run's point) are
  new. `moments/card-share-image.ts` maps the faces and honours both (a small change there, so the
  folder type-checks; WP3b owns the rest of that file).
- `CardRenderer.mount` is documented as the tilt. `ManagerCard`'s `sway` prop becomes `tilt` in WP3b.

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

Budgets (plan 12.5): `full()` 25 ms, `token()` 3 ms, chunk 60 kB gzip, stage markup 46 kB.

## Looking at it

```
bun src/components/manager-card/eclat/scripts/gallery.ts <out-dir>
```

writes `compare-light|dark.html` (the mock's cards, on the mock's own page chrome) and
`all-light|dark.html` (every fixture in French and Arabic, the six tiers, the founder's crop, the
share art with its runs, the tokens at every size). Serve `<out-dir>` with `/eclat.css` and `/fonts/`
mapped to this folder's stylesheet and `public/fonts`, and open it.

## To add a beat

Add its name to `BeatName` (`../types.ts`), its length to `BEAT_MS` (`beats.ts`, at most
`BEAT_CAP_MS`) and its animated classes to `ANIMATED`, put its keyframes in the `no-preference` block
of `eclat.css`, say in `appliedBeat` (`full.ts`) when it has nothing to do on a card, and add it to
the beat tests. A beat may move only the floodlights, the field group, the foil overlay's `::after`,
the foil shift, the marks, the capsule and the seal line, never the number, the serial, a text or the
shirt.
