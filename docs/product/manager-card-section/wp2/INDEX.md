# WP2 · Écharpe renderer: captures

The card, drawn by `src/components/manager-card/echarpe`, seen through the real `/gradins` route of
the branch (WP1's stub G1 with the card stage; WP3 replaces the page around it). Every image was
looked at. Everything below was made by one script:

```
cd /home/user/mc-wp2
VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock VITE_AUTH_MODE=mock \
VITE_FANTASY_DATA_MODE=mock VITE_FOOTBALL_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock \
  bun run dev -- --host 127.0.0.1 --port 4188 --strictPort          # own server, own port
E2E_BASE_URL=http://127.0.0.1:4188 bun docs/product/manager-card-section/wp2/capture.ts
```

The script signs in with the mock demo account, opens `/gradins?mc=<fixture>` and waits for the
card's `data-mc-ready="1"`. The PNGs were then reduced to 256 colours (Pillow, median cut, no
dithering) to keep the folder near 5 MB; the numbers in the tables are read from the live page, not
from the images:

```
python3 -c "import glob; from PIL import Image; [Image.open(f).convert('RGB').quantize(256, Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True) for f in glob.glob('docs/product/manager-card-section/wp2/*.png')]"
```

## The stage: `stage-<fixture>-<fr|ar>-<light|dark>-390.png`

390 × 844, reduced motion (the finished card). Fixtures: `rated`, `forming1`, `founder`, `legend`,
`longNameLatin`, `arabicName`, `clubNull`. « Running animations » is `document.getAnimations().length`
after load: 0 on every capture. « The number » is the `[data-mc="ovr"]` group: its value (or the
dash), its size in CSS px, its computed opacity (itself times its ancestors') and whether the thing
under its centre is the number or a part of it.

| File                                 | Fixture       | Language | Theme | Running animations | The number                         |
| ------------------------------------ | ------------- | -------- | ----- | ------------------ | ---------------------------------- |
| stage-rated-fr-light-390.png         | rated         | fr       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-forming1-fr-light-390.png      | forming1      | fr       | light | 0                  | dash (198x74, opacity 1, hit true) |
| stage-founder-fr-light-390.png       | founder       | fr       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-legend-fr-light-390.png        | legend        | fr       | light | 0                  | 93 (83x58, opacity 1, hit true)    |
| stage-longNameLatin-fr-light-390.png | longNameLatin | fr       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-arabicName-fr-light-390.png    | arabicName    | fr       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-clubNull-fr-light-390.png      | clubNull      | fr       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-rated-fr-dark-390.png          | rated         | fr       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-forming1-fr-dark-390.png       | forming1      | fr       | dark  | 0                  | dash (198x74, opacity 1, hit true) |
| stage-founder-fr-dark-390.png        | founder       | fr       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-legend-fr-dark-390.png         | legend        | fr       | dark  | 0                  | 93 (83x58, opacity 1, hit true)    |
| stage-longNameLatin-fr-dark-390.png  | longNameLatin | fr       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-arabicName-fr-dark-390.png     | arabicName    | fr       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-clubNull-fr-dark-390.png       | clubNull      | fr       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-rated-ar-light-390.png         | rated         | ar       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-forming1-ar-light-390.png      | forming1      | ar       | light | 0                  | dash (198x74, opacity 1, hit true) |
| stage-founder-ar-light-390.png       | founder       | ar       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-legend-ar-light-390.png        | legend        | ar       | light | 0                  | 93 (82x57, opacity 1, hit true)    |
| stage-longNameLatin-ar-light-390.png | longNameLatin | ar       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-arabicName-ar-light-390.png    | arabicName    | ar       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-clubNull-ar-light-390.png      | clubNull      | ar       | light | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-rated-ar-dark-390.png          | rated         | ar       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-forming1-ar-dark-390.png       | forming1      | ar       | dark  | 0                  | dash (198x74, opacity 1, hit true) |
| stage-founder-ar-dark-390.png        | founder       | ar       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-legend-ar-dark-390.png         | legend        | ar       | dark  | 0                  | 93 (82x57, opacity 1, hit true)    |
| stage-longNameLatin-ar-dark-390.png  | longNameLatin | ar       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-arabicName-ar-dark-390.png     | arabicName    | ar       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |
| stage-clubNull-ar-dark-390.png       | clubNull      | ar       | dark  | 0                  | 84 (193x83, opacity 1, hit true)   |

## The beats: `beat-<beat>-<fixture>[-at-k-of-n]-t<ms>-<fr|ar>-light-390.png`

Motion on. The stub G1 passes no beat to the card (WP4's hero will), so the script replaces the
stage's card with the renderer's own markup for that beat, in the same page (fonts, theme, layout),
pauses every animation and sets its clock to the stated time: the first frame (t = 0), the middle
and the end. The stage alone is clipped, with a margin for the rail and the fringe. At t = 0 the
number is in the page, opaque and what a pointer finds at its centre, on every beat. `-at-3-of-3`
shows the card as it is when the first rating appears (3 journées counted of 3); `rated` itself is
past the minimum, where the beat knits the newest season stripe (one row).

| File                                               | Beat    | At     | Animations paused | The number                |
| -------------------------------------------------- | ------- | ------ | ----------------- | ------------------------- |
| beat-first-rated-t0-fr-light-390.png               | first   | 0 ms   | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-t250-fr-light-390.png             | first   | 250 ms | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-t490-fr-light-390.png             | first   | 490 ms | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-at-3-of-3-t0-fr-light-390.png     | first   | 0 ms   | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-at-3-of-3-t250-fr-light-390.png   | first   | 250 ms | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-at-3-of-3-t490-fr-light-390.png   | first   | 490 ms | 2                 | 84, opacity 1, hit true   |
| beat-founder-founder-t0-fr-light-390.png           | founder | 0 ms   | 8                 | 84, opacity 1, hit true   |
| beat-founder-founder-t300-fr-light-390.png         | founder | 300 ms | 8                 | 84, opacity 1, hit true   |
| beat-founder-founder-t600-fr-light-390.png         | founder | 600 ms | 8                 | 84, opacity 1, hit true   |
| beat-make-born0Serial-t0-fr-light-390.png          | make    | 0 ms   | 20                | dash, opacity 1, hit true |
| beat-make-born0Serial-t200-fr-light-390.png        | make    | 200 ms | 20                | dash, opacity 1, hit true |
| beat-make-born0Serial-t450-fr-light-390.png        | make    | 450 ms | 20                | dash, opacity 1, hit true |
| beat-make-born0Serial-t700-fr-light-390.png        | make    | 700 ms | 20                | dash, opacity 1, hit true |
| beat-tick-forming1-at-2-of-3-t0-fr-light-390.png   | tick    | 0 ms   | 2                 | dash, opacity 1, hit true |
| beat-tick-forming1-at-2-of-3-t200-fr-light-390.png | tick    | 200 ms | 2                 | dash, opacity 1, hit true |
| beat-tick-forming1-at-2-of-3-t360-fr-light-390.png | tick    | 360 ms | 2                 | dash, opacity 1, hit true |
| beat-tier-tierUp-t0-fr-light-390.png               | tier    | 0 ms   | 2                 | 88, opacity 1, hit true   |
| beat-tier-tierUp-t300-fr-light-390.png             | tier    | 300 ms | 2                 | 88, opacity 1, hit true   |
| beat-tier-tierUp-t600-fr-light-390.png             | tier    | 600 ms | 2                 | 88, opacity 1, hit true   |
| beat-legend-legend-t0-fr-light-390.png             | legend  | 0 ms   | 2                 | 93, opacity 1, hit true   |
| beat-legend-legend-t270-fr-light-390.png           | legend  | 270 ms | 2                 | 93, opacity 1, hit true   |
| beat-legend-legend-t540-fr-light-390.png           | legend  | 540 ms | 2                 | 93, opacity 1, hit true   |
| beat-castoff-seasonClosed-t0-fr-light-390.png      | castoff | 0 ms   | 1                 | 86, opacity 1, hit true   |
| beat-castoff-seasonClosed-t200-fr-light-390.png    | castoff | 200 ms | 1                 | 86, opacity 1, hit true   |
| beat-castoff-seasonClosed-t380-fr-light-390.png    | castoff | 380 ms | 1                 | 86, opacity 1, hit true   |
| beat-first-rated-t0-ar-light-390.png               | first   | 0 ms   | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-t250-ar-light-390.png             | first   | 250 ms | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-t490-ar-light-390.png             | first   | 490 ms | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-at-3-of-3-t0-ar-light-390.png     | first   | 0 ms   | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-at-3-of-3-t250-ar-light-390.png   | first   | 250 ms | 2                 | 84, opacity 1, hit true   |
| beat-first-rated-at-3-of-3-t490-ar-light-390.png   | first   | 490 ms | 2                 | 84, opacity 1, hit true   |
| beat-founder-founder-t0-ar-light-390.png           | founder | 0 ms   | 8                 | 84, opacity 1, hit true   |
| beat-founder-founder-t300-ar-light-390.png         | founder | 300 ms | 8                 | 84, opacity 1, hit true   |
| beat-founder-founder-t600-ar-light-390.png         | founder | 600 ms | 8                 | 84, opacity 1, hit true   |
| beat-make-born0Serial-t0-ar-light-390.png          | make    | 0 ms   | 20                | dash, opacity 1, hit true |
| beat-make-born0Serial-t200-ar-light-390.png        | make    | 200 ms | 20                | dash, opacity 1, hit true |
| beat-make-born0Serial-t450-ar-light-390.png        | make    | 450 ms | 20                | dash, opacity 1, hit true |
| beat-make-born0Serial-t700-ar-light-390.png        | make    | 700 ms | 20                | dash, opacity 1, hit true |
| beat-tick-forming1-at-2-of-3-t0-ar-light-390.png   | tick    | 0 ms   | 2                 | dash, opacity 1, hit true |
| beat-tick-forming1-at-2-of-3-t200-ar-light-390.png | tick    | 200 ms | 2                 | dash, opacity 1, hit true |
| beat-tick-forming1-at-2-of-3-t360-ar-light-390.png | tick    | 360 ms | 2                 | dash, opacity 1, hit true |
| beat-tier-tierUp-t0-ar-light-390.png               | tier    | 0 ms   | 2                 | 88, opacity 1, hit true   |
| beat-tier-tierUp-t300-ar-light-390.png             | tier    | 300 ms | 2                 | 88, opacity 1, hit true   |
| beat-tier-tierUp-t600-ar-light-390.png             | tier    | 600 ms | 2                 | 88, opacity 1, hit true   |
| beat-legend-legend-t0-ar-light-390.png             | legend  | 0 ms   | 2                 | 93, opacity 1, hit true   |
| beat-legend-legend-t270-ar-light-390.png           | legend  | 270 ms | 2                 | 93, opacity 1, hit true   |
| beat-legend-legend-t540-ar-light-390.png           | legend  | 540 ms | 2                 | 93, opacity 1, hit true   |
| beat-castoff-seasonClosed-t0-ar-light-390.png      | castoff | 0 ms   | 1                 | 86, opacity 1, hit true   |
| beat-castoff-seasonClosed-t200-ar-light-390.png    | castoff | 200 ms | 1                 | 86, opacity 1, hit true   |
| beat-castoff-seasonClosed-t380-ar-light-390.png    | castoff | 380 ms | 1                 | 86, opacity 1, hit true   |

No console error, page error, failed request or 4xx/5xx response on any capture.

## What the captures show

- **Mirror.** In Arabic the Logo Blue selvedge is on the left, the back drop on the right, the
  patch's logo at the right and its ratings read right to left from CAP; the knitted words are not
  mirrored (the Latin name `ALI` stays `ALI`; the Arabic tier word reads right to left); the serial
  is always left to right. The beats knit from the reading side: right to left in Arabic.
- **Names.** `longNameLatin` is « Abdelkarim Benjelloun-Alaoui »: knitted at 24 characters cut at a
  word boundary (plan 6.4.1), so `ABDELKARIM` in two lines on PRO; the second word is in the text
  under the card. `arabicName` is «فاطمة الزهراء», sampled from Changa 800 in the browser in two lines.
- **States.** `forming1` is the base scarf (no tier word, a tone-on-tone name band, loose fringe),
  a knitted dash, one stripe knitted and two tacking lines; `clubNull` is undyed wool with
  charcoal figures; `founder` carries `·26` and the cream cast-on with 2026 and its cables;
  `legend` is held overhead with the supporter, the ratings on the two hanging ends.
- **Dark.** The card is the same object; the scarf takes a lit edge and its tassels and the avatar
  a lighter ply, as in the lab.
- **Not measured here.** Contrast is not read from these images (WP6 does, from rasterised pixels).
  The yarn choices were checked by computation against every club of the kit table
  (`echarpe/palette.test.ts`); that is arithmetic, not a measurement of pixels.
