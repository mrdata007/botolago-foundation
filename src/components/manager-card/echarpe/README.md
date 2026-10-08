# Écharpe v2: the card renderer

The supporter's scarf, folded over the barrier rail. This folder implements the `CardRenderer`
interface (`../renderer.ts`) and is loaded as its own chunk by `../active-renderer.ts`. Plan:
`docs/product/MANAGER_CARD_SECTION_PLAN.md` sections 5.4, 6.4 to 6.7.

## Source

Ported from the design lab, branch `claude/affectionate-galileo-8l9mxh`, commit
**`b3844de8576b5c3e45821537fdfa6bfa9cc464dd`** ("design-lab: onboarding screens, first groups
(checkpoint)"), files `design-lab/manager-cards-claude/src/concepts/07-v2.js`, `07-v2.css`,
`src/kit.js`, `src/brand.js`, read with `git show`. Never from the lab's working copy.

The lab's beats are committed there (`BEATS`, `knit()`, the `c07v2-stitch` keyframes, `make`,
`first`, `tick`) and are ported as they work: stitch-stepped clip reveals, rows staggered, a
knitter's easing (26 steps along the fast part of a row, 10 over the last stretch).

## Files

| File                                  | What                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                            | `echarpeRenderer`, `ready()`, `mountSway`, `estimateAspect`, `knitName`. Imports `echarpe.css`.                                         |
| `charts.ts`                           | The hand-cleaned stitch charts, unchanged from the lab (data only; generated from the lab file).                                        |
| `knit.ts`                             | Pure primitives over bitmaps and stitch grids: `word`, `hjoin`, `grid`, `stamp`, `gridRuns`, `trim`, `vstack`, `castOff`.               |
| `knit-name.ts`                        | `knitName`: what is knitted from a name (plan 6.4.1). No charts, so the estimate can use it.                                            |
| `names.ts`                            | The name ladder (8, 7, 6 rows, the year stacked, lines) for Latin and Arabic; `RasterText` is injected.                                 |
| `motifs.ts`                           | The number (or its dash), the tier word.                                                                                                |
| `geometry.ts`                         | Constants, gauges, the row plan of the hanging scarf, the patch box, LEGEND's frame, `marksOf`. Pure numbers, no markup.                |
| `estimate.ts`                         | `estimateAspect(profile, lang)`: the box to reserve before the chunk loads. Imports only `geometry`, `knit-name` and types.             |
| `palette.ts`                          | The yarns, from the club's two colours, with contrast floors (see below).                                                               |
| `yarn.ts`, `avatar.ts`, `wordmark.ts` | Stitch textures and tassels; the hooded supporter; the BotolaGO wordmark read from `src/assets/brand/*.svg?raw`.                        |
| `patch.ts`                            | The woven patch. Text goes through an `emit` callback: `<text>` in the card, canvas text runs in the share image.                       |
| `caston.ts`                           | The five cast-on rows, the cable twists, the bound loops.                                                                               |
| `hanging.ts`, `legend.ts`             | HOMA to CHAMPION and the base scarf; LEGEND raised overhead.                                                                            |
| `token.ts`                            | Tokens (44 to 80 px) and minis (24 to 32 px).                                                                                           |
| `full.ts`                             | The root element, `aspect`, `image()`, the founder detail.                                                                              |
| `view.ts`                             | The cleaned profile (every field range-checked) and the accessible label.                                                               |
| `beats.ts`, `echarpe.css`             | The beat timing table and the row wrapper; the keyframes (all inside `prefers-reduced-motion: no-preference`).                          |
| `sway.ts`, `raster.ts`, `ids.ts`      | Drag-to-sway; the Arabic sampler (browser only); unique SVG ids.                                                                        |
| `test-data.ts`, `test-markup.ts`      | Test support: the card words of both languages, a profile per case, a strict reader for the renderer's markup. Not imported by the app. |

## What was dropped from the lab

The gallery registration (philosophy, idea, belonging, risks, notes, colourways), `share()` (an
HTML composition, replaced by `image()`), `row()`, the country (D16: none in v1), the
"J.01 to J.07 · Exemple" note (the patch's note is the season label; a `sample` profile adds
`strings.sample`), the thumb mode, the share composition's second half (`_share`, `_rail`), the bare
head of the avatar, the 01 Lucarne, 03 Porte-clés, 05 Semelle and Touchline modules. The all-white
wordmark file is not bundled (the patch is always a light yarn; the share module draws its own).

## What changed from the lab, and why

- **Strings and types.** The lab's `p.name = {lat, ar}`, `p.id`, `o.lang` and `MC.*` helpers are
  replaced by `CardProfile`, `CardStrings` and one `esc()`. Tiers are the app's lowercase codes.
  A name is one string: its script picks the chart, the interface language picks the mirroring.
- **Every field is range-checked** (`view.ts`): an OVR is an integer from 1 to 99 or a dash, a serial
  is digits, a tier is one of five, a season is digits, `/`, space, `.` and `-`, the club's hex
  colours are parsed. Anything else reads as the object's own empty part.
- **Theme.** Read from `options.theme`, not from the page: the rim, the drop shadow and the token
  edges are decided where the card is drawn (`mc-echarpe--dark|light`, `mc-tk--dark|light`).
- **Contrast floors** (`palette.ts`). The lab's note says it was "rendered for two proof colourways,
  not for real club palettes". Swept over the app's kit table (`palette.test.ts`), several clubs fell
  below 3:1 (STADE's red 84 on AS FAR's navy 1.8:1, on Difaâ's green 1.1:1; the name on FUS and
  Berkane's orange 2.1:1 and 2.7:1; HOMA's relief on orange 2.2:1; PRO's figures on a mid-tone
  ground). The yarn choices keep the lab's pick where it clears 3.2:1 (3:1 for stripes) and fall to
  the next candidate where it does not (cream, the second colour, charcoal; for HOMA's relief, the
  other direction). Raja, Wydad and the other clubs that already cleared the floor are unchanged.
- **Names too long for the gauge** (`names.ts`). The lab's last resort is one letter a line, which
  on HOMA (27 stitches) turned « Mohammed Abderrahmane » into a card 5.4 times as tall as it is wide.
  The ladder now drops trailing words (the cut the 24-character limit already makes, at a word
  boundary) and tries again; one-letter lines remain only for one absurd word. The full name is
  always in the text under the card.
- **The number is a group of its own.** The 84 (or its dash) is drawn in `<g data-mc="ovr">` with a
  transparent hit rectangle, above the ground and below only the knit's texture, which has
  `pointer-events="none"`. A pointer at its centre finds it, at every instant of every beat.
- **Season stripes.** Past the minimum, one stripe per counted journée, at most seven
  (`MAX_STRIPES`), so the scarf keeps one height all season; with no counted journées, none.
- **Allow-list.** The plan's tag allow-list lacks `filter`, `feTurbulence`, `feColorMatrix`,
  `feGaussianBlur` and `mask`, which the lab's grain, soft shadows and LEGEND's fade need. They are
  inert; the test allows exactly those five more.

## The beats (plan 5.4)

`full(profile, { beat })` takes one beat. A beat that has nothing to knit on this card (a founder
beat on a non-founder, a tier beat on the base scarf) is ignored without a trace: no class, no row.
`beatMs(beat)` is the whole length; the screen drops the beat after that.

| Beat      | What knits or moves                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make`    | Cast-on rows from the foot (0, gap 36, 170), cables and bound loops, tacking lines (110, 45, 190), the base scarf's name band (200, gap min(26, 310 / (rows - 1)), 190)                |
| `tick`    | The newest counted stripe, two rows lower first (30, 90, 240); past the minimum the newest season stripe (one row)                                                                     |
| `first`   | The last counted stripe under the number already there (80, 110, 300)                                                                                                                  |
| `tier`    | The new tassel (the last, at the inline end) drops in; the fringe swings once                                                                                                          |
| `legend`  | The arms rise and the fists settle (see below)                                                                                                                                         |
| `founder` | The five cream rows knit across from the foot in eight steps (60 + 80 per row, 100 each), the cables with the top row, then the year (·26) onto the name band (opacity, 120 ms at 480) |
| `castoff` | The bound loops along the lower edge, one row of 320 ms in eight steps                                                                                                                 |

- Rows are `<g class="mc-kr" style="--mc-d:…;--mc-t:…">`, revealed by a stepped `clip-path` from the
  reading side (right to left in Arabic).
- **Nothing that moves holds the number, the serial or any text.** Tests parse every beat's markup
  and check that no animated group (`mc-kr`, `mc-fringe`, `mc-tassel-new`, `mc-fy`, `mc-lg-arms`,
  `mc-lg-fists`) contains `data-mc="ovr"`, the serial or a `<text>`.
- **LEGEND.** The plan's table says "the band lifts and settles". The band carries the 84 and the
  drapes carry the serial, so neither may sit in a moving group; the arms rise (translateY 18 px,
  opacity .4 to 1, 420 ms) and the **fists** settle (translateY 12 px, scaleY .96 to 1, 420 ms,
  delay 120) instead. Total 540 ms.
- Reduced motion: every keyframe and every `animation` is inside `@media (prefers-reduced-motion:
no-preference)`. Measured in Chromium: `document.getAnimations()` is empty for every beat.
- **To add a beat:** add its name to `BeatName` (`../types.ts`, WP1), a timing entry in `beats.ts`
  (and `BEAT_MS`), wrap the rows it knits with `knit(beat, part, index, inner)` where they are drawn,
  put its keyframes in the `no-preference` block of `echarpe.css`, and add a row to the beat tests.
  A renderer lists the beats it supports in `beats`; screens request by name.

## The sway

`echarpeRenderer.mount(el)` (exported as `mountSway` too) is the optional `mount` of `CardRenderer`:
`ManagerCard` calls it after inserting a full card when the screen asks for `sway` and the reader
has not asked for less motion. It swings the hanging scarf from the rail while a mouse or pen is
pressed and dragged (a damped pendulum, at most 1.2 s), does nothing while the page is hidden or on
a LEGEND card (held, not hung), and returns its cleanup.

## Fonts

The patch is set in Manrope (French) and Noto Sans Arabic (Arabic); the Arabic names with no chart
are sampled from Changa 800 on a canvas (`raster.ts`). `ready()` asks the page to load both Changa
subsets and waits at most 1.5 s; `active-renderer.ts` awaits it inside `load()` before the first card
is drawn, and a sample is cached only when the font reports ready.

## Label

`label()` is the app's own `cardLabel` (`../copy.ts`, « Carte de manager, Ali, 84 OVR, PRO, Raja CA,
BOT #482913 ») on the profile as the object can show it, so what is spoken is what is drawn. The
root's `aria-label` is that sentence without control and direction characters (the contract's
`stripControls`), escaped. A token's label is shorter: who, the number, the tier, the founder line.

## Measured

Recorded on the development machine (Bun and Chromium 141, `scratchpad` harness, not committed):

| What                                             | CPU x1                                  | CPU x4 (throttled) |
| ------------------------------------------------ | --------------------------------------- | ------------------ |
| `full()`, charted Latin PRO                      | 0.2 ms                                  | 0.4 ms             |
| `full()`, founder, long name, LEGEND (worst)     | 0.2 ms                                  | 1.2 ms             |
| `full()`, Arabic name sampled from Changa, first | 17.9 ms                                 | 72 ms              |
| `full()`, the same name, cached                  | 0.2 ms                                  | 0.8 ms             |
| `token()`                                        | under 0.1                               | under 0.1          |
| markup parsed and laid out (PRO)                 | 3.7 ms                                  | 14.5 ms            |
| Chunk (JS + CSS), minified                       | 116 kB, 33.5 kB gzip, + 1.1 kB gzip CSS |                    |

Budget (plan 6.6): 25 ms, 60 ms, 3 ms and 60 kB gzip.
