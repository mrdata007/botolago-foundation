# Manager Card design preview: revision 2 → revision 3 (with the critique fixes)

Before / after of the static design preview
([`../mock.html`](../mock.html)) for the owner's revision 3 feedback (2026-10-09). The spec is
[`MANAGER_CARD_SORARE_STYLE_PLAN.md`](../../MANAGER_CARD_SORARE_STYLE_PLAN.md) (revision 3 sections,
record in §16) and the brief
[`MANAGER_CARD_SORARE_STYLE_BRIEF.md`](../../MANAGER_CARD_SORARE_STYLE_BRIEF.md). This is a design
preview only: no app code changed, nothing merged or deployed.

- **Before** = revision 2, the file at commit `470beb0e`
  (`git show 470beb0e:docs/product/manager-card-sorare-style/mock.html`).
- **After** = revision 3 with the critique fixes (plan §16.1), `../mock.html` in this commit. The
  revision 3 mock as first committed (before the critique) is commit `2f2f487d`; the self-check
  compares against it where the critics measured it.

## How the pictures were made

Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) through Playwright, the mock
opened as a `file://` page (no dev server), Google Fonts loaded, `document.fonts.ready` awaited.
Device scale factor 2, `reducedMotion: "reduce"` (stable frames at the rest pose: revision 2 leans,
revision 3 is flat 2D at rest) except the tilt crops, which allow motion and hold the pointer at
86 % / 18 % of the card for 700 ms (revision 3 is then in 3D).

```
node scripts/capture.mjs <mock.html> <out dir>        # full pages, tier crops, tokens, Arabic row, tilt
node scripts/crop-names.mjs <mock.html> <png> "#names" dark|light
node scripts/quant.mjs <png …>                         # palette compression of the full pages and rows
node scripts/compose.mjs [390]                         # the comparison sheets (Playwright HTML → WebP)
node scripts/selfcheck.mjs <mock.html> <rev2 mock.html> <rev3-pre mock.html> > selfcheck-final.json
node scripts/extra.mjs <mock.html> <rev2 mock.html> <rev3-pre mock.html> > extra-final.json  # layout, pips, sharpness, texture
node scripts/numcon.mjs <mock.html> dark > numcon-final.json ; node scripts/halo.mjs <mock.html> > halo-final.json
node scripts/ov.mjs <mock.html> ; node scripts/tiltcheck.mjs <mock.html>   # overflow 320/390/1440, tilt lifecycle
node scripts/critic-jersey/shirtonly.mjs <dir> ; node scripts/critic-jersey/big.mjs <dir>  # <dir>/rev3.html = the mock
python3 meas.py ; python3 sep.py ; python3 field.py ; python3 band.py              # run inside <dir>
python3 scripts/gen_md.py                                # SELFCHECK.md from the outputs above
node scripts/perf.mjs <rev2 mock.html> <mock.html>     # relative pointer-sweep frame times (not re-run)
```

The scripts were run from the session scratchpad; they import Playwright from
`/home/user/mc-sorare/node_modules` and sharp from `/home/user/botolago-app/node_modules`, so adjust
those two paths to run them elsewhere. The full-page PNGs and the row PNGs are palette-compressed
(sharp `palette: true, quality: 92`); the tier, tilt and token crops are lossless. Contrast was
measured live in the browser, never from these files.

## Comparison sheets (`compare/`)

| File                                                                                                                     | What                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`compare/tier-base.webp`](compare/tier-base.webp)                                                                       | base (forming 1/3), revision 2 / 3, dark and light page                                                                                 |
| [`compare/tier-lastreet.webp`](compare/tier-lastreet.webp)                                                               | LASTREET 61, no club                                                                                                                    |
| [`compare/tier-stade.webp`](compare/tier-stade.webp)                                                                     | STADE 79                                                                                                                                |
| [`compare/tier-pro.webp`](compare/tier-pro.webp)                                                                         | PRO 84, sample                                                                                                                          |
| [`compare/tier-champion.webp`](compare/tier-champion.webp)                                                               | CHAMPION 88, long name                                                                                                                  |
| [`compare/tier-legend.webp`](compare/tier-legend.webp)                                                                   | LEGEND 99, founder                                                                                                                      |
| [`compare/tilt.webp`](compare/tilt.webp)                                                                                 | PRO and LEGEND with the pointer over the top-trailing corner (motion on)                                                                |
| [`compare/arabic.webp`](compare/arabic.webp)                                                                             | the Arabic interface row                                                                                                                |
| [`compare/tokens.webp`](compare/tokens.webp)                                                                             | small sizes: revision 2's single shrunk LEGEND row against revision 3's 6 tiers × 80 / 64 / 48 / 32 / 24 (token shirts, 2 px tier ring) |
| [`compare/grid-1440.webp`](compare/grid-1440.webp)                                                                       | the whole preview at 1440 px, dark and light                                                                                            |
| [`compare/grid-390-dark.webp`](compare/grid-390-dark.webp), [`compare/grid-390-light.webp`](compare/grid-390-light.webp) | the whole preview at 390 px (composed at DPR 1.5: at DPR 2 the page is taller than WebP allows)                                         |

## Raw captures

`before/` and `after/` hold the same names: `full-1440-{dark,light}.png`, `full-390-{dark,light}.png`,
`tier-{base,lastreet,stade,pro,champion,legend}-{dark,light}.png` (one card at 296 px, DPR 2),
`tokens-{dark,light}.png`, `arabic-{dark,light}.png`, `tilt-{pro,legend}-dark.png`, and
`capture-log.txt` (console errors: none in either revision). `after/` adds
`names-{dark,light}.png` (the long-name row, new in revision 3) and `g4-{dark,light}.png` (the 200 px
face-à-face row, new with the critique fixes; revision 2 had no 200 px view).

## Self-check (revision 3 with the critique fixes)

[`SELFCHECK.md`](SELFCHECK.md), measured on the committed mock. In short: no console error or warning
at 1440, 390 and 320 px in either theme; no element rectangle outside the viewport at 320 and 390;
the number's painted ink inside the chest box and the shirt for 8, 11, 44, 88, 99 and « — »; contrast
from pixels: names ≥ 10.3 (10.3 with the pointer over the name, 11.3 at rest), tier word ≥ 7.1, stat values ≥ 12.1, stat labels ≥ 6.86, meta (season,
initials, serial, wordmark, sample) ≥ 5.15, the number's fill ≥ 3.27 against its shirt, « OVR » ≥ 8.9
against its halo (3.7 against bare Raja green, whose white ceiling is 4.2), forming marks ≥ 3:1 by
their fill; two-digit token numbers ≥ 14.1 / 12.1 / 10.1 / 7.1 CSS px at 80 / 64 / 48 / 32; at rest
the text is as sharp as a flat render (95.4 = 95.4 at DPR 2; revision 3 was 43.7 against 102.4);
G4 text ≥ 8 CSS px; drawn elements per card 205–284 (rev 2) → 121–136. Not met and reported: the
jersey critic's shading-spread target (≥ 38; now 27–31) and colour-distance target (ΔE ≤ 10; now
8.4–15.8), shirt/field separation on LEGEND's black FAR shirt (1.05–1.48 at the critic's probe
points), and background fine texture at or below revision 2 (LEGEND 25 → 17 %, but still above
revision 2's 9.5 % by the same probe).

## What changed

Revision 3 (detail in the plan's §16):

- Jersey at measured flat-lay proportions (length 1.44 × pit-to-pit, sleeve span ≈ length, visible
  hem), drawn in 3D: fabric, folds, seams, volume, rim light, cast shadow.
- Honeycomb backboard per tier (lines, raised cells, or foil cells), two floodlights, centre circle and
  halfway line, a backlight behind the jersey; the ribbons, glitch bars and pixel rain are gone.
- A shield-shaped embossed metal frame inside the unchanged asymmetric outline; metal outer edge.
- Name under the artwork, centred, the tier in a metal plaque at the shield's point, stats below.
- Removed: tubes, rivets, season stamp, guilloche, micro-print, tab captions, stitches, sparkles, the
  holographic seal and the diffraction grid.
- Restrained foil on CHAMPION and LEGEND only, kept off the number and the plate's text.
- Tokens recomposed per size with an enlarged jersey.

Critique fixes (plan §16.1, finding by finding): flat and crisp at rest with 3D only while moving; no
foil across the tab; the shield's point raised 80 and a larger name hanging from it on every tier;
stats centred; LEGEND's own foil plaque and inner foil shield, CHAMPION's cells calmer; a rounder
jersey in truer club colours with creases that cross the print, a collar that wraps, a tapered body
and piqué knit, no chest initials; lipped metal with a travelling specular streak; PRO crimson, STADE
black and gold, LEGEND near black; LASTREET's lighter shirt and tab placeholder; the « BOTOLAGO »
wordmark; token shirts that keep their sleeves and a 2 px tier ring; a 200 px G4 row; larger « OVR »,
pips and Arabic labels; Arabic names placed by their ink.
