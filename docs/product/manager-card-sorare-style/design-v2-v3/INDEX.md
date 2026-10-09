# Manager Card design preview: revision 2 → revision 3

Before / after of the static design preview
([`../mock.html`](../mock.html)) for the owner's revision 3 feedback (2026-10-09). The spec is
[`MANAGER_CARD_SORARE_STYLE_PLAN.md`](../../MANAGER_CARD_SORARE_STYLE_PLAN.md) (revision 3 sections,
record in §16) and the brief
[`MANAGER_CARD_SORARE_STYLE_BRIEF.md`](../../MANAGER_CARD_SORARE_STYLE_BRIEF.md). This is a design
preview only: no app code changed, nothing merged or deployed.

- **Before** = revision 2, the file at commit `470beb0e`
  (`git show 470beb0e:docs/product/manager-card-sorare-style/mock.html`).
- **After** = revision 3, `../mock.html` in this commit.

## How the pictures were made

Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) through Playwright, the mock
opened as a `file://` page (no dev server), Google Fonts loaded, `document.fonts.ready` awaited.
Device scale factor 2, `reducedMotion: "reduce"` (stable frames at the rest lean) except the tilt
crops, which allow motion and hold the pointer at 86 % / 18 % of the card for 700 ms.

```
node scripts/capture.mjs <mock.html> <out dir>        # full pages, tier crops, tokens, Arabic row, tilt
node scripts/crop-names.mjs <mock.html> <png> "#names" dark|light
node scripts/quant.mjs <png …>                         # palette compression of the full pages and rows
node scripts/compose.mjs [390]                         # the comparison sheets (Playwright HTML → WebP)
node scripts/selfcheck.mjs <mock.html> <rev2 mock.html> > selfcheck.json ; python3 scripts/gen_md.py
node scripts/perf.mjs <rev2 mock.html> <mock.html>     # relative pointer-sweep frame times
```

The scripts were run from the session scratchpad; they import Playwright from
`/home/user/mc-sorare/node_modules` and sharp from `/home/user/botolago-app/node_modules`, so adjust
those two paths to run them elsewhere. The full-page PNGs and the row PNGs are palette-compressed
(sharp `palette: true, quality: 92`); the tier, tilt and token crops are lossless. Contrast was
measured live in the browser, never from these files.

## Comparison sheets (`compare/`)

| File                                                                                                                     | What                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [`compare/tier-base.webp`](compare/tier-base.webp)                                                                       | base (forming 1/3), revision 2 / 3, dark and light page                                                  |
| [`compare/tier-lastreet.webp`](compare/tier-lastreet.webp)                                                               | LASTREET 61, no club                                                                                     |
| [`compare/tier-stade.webp`](compare/tier-stade.webp)                                                                     | STADE 79                                                                                                 |
| [`compare/tier-pro.webp`](compare/tier-pro.webp)                                                                         | PRO 84, sample                                                                                           |
| [`compare/tier-champion.webp`](compare/tier-champion.webp)                                                               | CHAMPION 88, long name                                                                                   |
| [`compare/tier-legend.webp`](compare/tier-legend.webp)                                                                   | LEGEND 99, founder                                                                                       |
| [`compare/tilt.webp`](compare/tilt.webp)                                                                                 | PRO and LEGEND with the pointer over the top-trailing corner (motion on)                                 |
| [`compare/arabic.webp`](compare/arabic.webp)                                                                             | the Arabic interface row                                                                                 |
| [`compare/tokens.webp`](compare/tokens.webp)                                                                             | small sizes: revision 2's single shrunk LEGEND row against revision 3's 6 tiers × 80 / 64 / 48 / 32 / 24 |
| [`compare/grid-1440.webp`](compare/grid-1440.webp)                                                                       | the whole preview at 1440 px, dark and light                                                             |
| [`compare/grid-390-dark.webp`](compare/grid-390-dark.webp), [`compare/grid-390-light.webp`](compare/grid-390-light.webp) | the whole preview at 390 px                                                                              |

## Raw captures

`before/` and `after/` hold the same names: `full-1440-{dark,light}.png`, `full-390-{dark,light}.png`,
`tier-{base,lastreet,stade,pro,champion,legend}-{dark,light}.png` (one card at 296 px, DPR 2),
`tokens-{dark,light}.png`, `arabic-{dark,light}.png`, `tilt-{pro,legend}-dark.png`, and
`capture-log.txt` (console errors: none in either revision). `after/` adds
`names-{dark,light}.png` (the long-name row, new in revision 3).

## Self-check of revision 3

[`SELFCHECK.md`](SELFCHECK.md) (copy of the scratchpad `v3/design-selfcheck.md`). In short, measured:
no console error at 1440 and 390 in either theme; no element rectangle outside the 390 px viewport;
the number's painted ink inside the chest box and the shirt for 8, 11, 44, 88, 99 and « — »; contrast
medians from pixels: names ≥ 11.8, tier word ≥ 6.9, stat values ≥ 8.7, stat labels ≥ 4.9, the number
≥ 3.35 against its shirt; at 32 px a two-digit number is 7.4–8.9 CSS px tall; drawn elements per card
205–284 → 105–118.

## What changed (summary; detail in the plan's §16)

- Jersey at measured flat-lay proportions (length 1.44 × pit-to-pit, sleeve span ≈ length, visible
  hem), drawn in 3D: mesh, folds, seams, volume, rim light, cast shadow.
- Honeycomb backboard per tier (lines, raised cells, or foil cells), two floodlights, centre circle and
  halfway line, a backlight behind the jersey; the ribbons, glitch bars and pixel rain are gone.
- A shield-shaped embossed metal frame inside the unchanged asymmetric outline; metal outer edge.
- Name under the artwork, centred, the tier in a metal plaque at the shield's point, stats below.
- Removed: tubes, rivets, season stamp, guilloche, micro-print, tab captions, stitches, sparkles, the
  holographic seal and the diffraction grid.
- Restrained foil on CHAMPION and LEGEND only, kept off the number and the plate's text.
- Tokens recomposed per size with an enlarged jersey.
