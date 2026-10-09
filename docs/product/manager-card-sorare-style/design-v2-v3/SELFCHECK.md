# Manager Card revision 3: design self-check

Measured 2026-10-09 in Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) on `docs/product/manager-card-sorare-style/mock.html` as committed (file://, no dev server), script `scratchpad/v3/selfcheck.mjs`, raw output `selfcheck.json`. DPR 2, `reducedMotion: reduce` unless stated.

## Console errors

- light 1440 px: 0 errors
- light 390 px: 0 errors
- dark 1440 px: 0 errors
- dark 390 px: 0 errors

## Overflow (element rectangles of every `body *`, SVG descendants included)

| theme, width | viewport | max right | min left | first escaping | card text outside its card | name lines outside x 100-900 |
| ------------ | -------- | --------- | -------- | -------------- | -------------------------- | ---------------------------- |
| light 1440   | 1440     | 1340      | 100      | none           | 0                          | 0 of 18                      |
| light 390    | 390      | 390       | 0        | none           | 0                          | 0 of 18                      |
| dark 1440    | 1440     | 1340      | 100      | none           | 0                          | 0 of 18                      |
| dark 390     | 390      | 390       | 0        | none           | 0                          | 0 of 18                      |

## The number inside the chest box (pixel scan, 1 viewBox unit = 1 px)

Number group rendered alone in red (fill, twill and outer outline), bounding box of the red pixels. Box in jersey space x 336-664, y 476-796 (dash: 380-620 x 556-644); card space = 1.12 x - 60, 1.12 y - 86. `inside shirt` = all four corners of the ink box pass `isPointInFill` on the shirt path.

| OVR | font size | ink box (jersey space) | ink box (card space)         | inside chest box | inside shirt |
| --- | --------- | ---------------------- | ---------------------------- | ---------------- | ------------ |
| 8   | 300       | [406, 527, 591, 745]   | [394.7, 504.2, 601.9, 748.4] | True             | True         |
| 11  | 283.3     | [345, 535, 659, 737]   | [326.4, 513.2, 678.1, 739.4] | True             | True         |
| 44  | 243.2     | [342, 551, 658, 723]   | [323, 531.1, 677, 723.8]     | True             | True         |
| 88  | 251.7     | [344, 544, 656, 729]   | [325.3, 523.3, 674.7, 730.5] | True             | True         |
| 99  | 254.1     | [342, 543, 658, 730]   | [323, 522.2, 677, 731.6]     | True             | True         |
| —   | 220       | [401, 574, 599, 627]   | [389.1, 556.9, 610.9, 616.2] | True             | True         |

## Tokens: the number's ink size in CSS px (club RAJA, PRO)

| OVR | 80 px             | 64 px             | 48 px             | 32 px            |
| --- | ----------------- | ----------------- | ----------------- | ---------------- |
| 8   | 18.62 h x 15.96 w | 15.21 h x 13.04 w | 21.03 h x 18.03 w | 15.1 h x 12.95 w |
| 11  | 11.81 h x 19.37 w | 9.65 h x 15.83 w  | 12.35 h x 20.25 w | 8.86 h x 14.52 w |
| 44  | 9.89 h x 19.57 w  | 8.09 h x 16 w     | 10.34 h x 20.46 w | 7.42 h x 14.67 w |
| 88  | 10.75 h x 19.3 w  | 8.79 h x 15.78 w  | 11.24 h x 20.18 w | 8.06 h x 14.47 w |
| 99  | 10.85 h x 19.47 w | 8.87 h x 15.92 w  | 11.34 h x 20.35 w | 8.14 h x 14.6 w  |

At 32 px (card 20 px wide) two digits are 7.4-8.9 CSS px tall (14.8-17.7 device px at DPR 2) and 14.5-14.7 px wide; one digit is 15.1 px tall. See `design-v2-v3/after/tokens-*.png`.

## Contrast from rasterised pixels

Each text element screenshotted twice at DPR 2 (as drawn, then with that element hidden; for the OVR the whole number layer hidden, so the background is the shirt under it). Text colour = median luminance of the 4 % of pixels that change most. Background two ways: `bbox` = median of the hidden shot inside the element's rectangle; `ring` = median of unchanged pixels within 3 device px of the glyphs. `ring p5` = the 5th-percentile ring pixel closest to the text luminance; for names and the tier word that ring also reaches the other name line and the plaque's metal rim, so it is a floor, not a reading. For the OVR the ring is the number's own outline (twill), not the shirt, so the shirt reading is `bbox`. Pointer poses: motion on, the pointer held over the name / over the number of each card in turn (sheen and, on CHAMPION and LEGEND, the diffraction centred there).

| page, pose                    | kind      | n   | min bbox median       | min ring median       | min ring p5                |
| ----------------------------- | --------- | --- | --------------------- | --------------------- | -------------------------- |
| light, rest                   | name      | 13  | 11.79 (legend ALAOUI) | 11.87 (homa HAMZA)    | 9.77 (champion ABDELKARIM) |
| light, rest                   | tier      | 8   | 6.86 (pro PRO)        | 6.86 (pro PRO)        | 6 (pro PRO)                |
| light, rest                   | statValue | 36  | 8.76 (champion —)     | 8.66 (champion —)     | 7.91 (champion —)          |
| light, rest                   | statLabel | 36  | 5.35 (homa SEL)       | 5.28 (homa SEL)       | 4.49 (base SEL)            |
| light, rest                   | ovr       | 9   | 3.35 (champion 91)    | 3.62 (champion 91)    | 2.13 (champion 88)         |
| dark, rest                    | name      | 13  | 11.79 (legend ALAOUI) | 11.87 (homa HAMZA)    | 9.77 (champion ABDELKARIM) |
| dark, rest                    | tier      | 8   | 6.86 (pro PRO)        | 6.86 (pro PRO)        | 6 (pro PRO)                |
| dark, rest                    | statValue | 36  | 8.76 (champion —)     | 8.66 (champion —)     | 7.91 (champion —)          |
| dark, rest                    | statLabel | 36  | 5.35 (homa SEL)       | 5.28 (homa SEL)       | 4.49 (base SEL)            |
| dark, rest                    | ovr       | 9   | 3.35 (champion 91)    | 3.62 (champion 91)    | 2.13 (champion 88)         |
| dark, pointer over the name   | name      | 13  | 11.79 (legend ALAOUI) | 12.18 (legend ALAOUI) | 7.85 (legend YASMINE)      |
| dark, pointer over the name   | tier      | 8   | 6.86 (pro PRO)        | 6.86 (pro PRO)        | 6 (pro PRO)                |
| dark, pointer over the name   | statValue | 36  | 8.76 (champion —)     | 8.66 (champion —)     | 7.91 (champion —)          |
| dark, pointer over the name   | statLabel | 36  | 5.35 (homa SEL)       | 5.28 (homa SEL)       | 4.49 (base SEL)            |
| dark, pointer over the name   | ovr       | 9   | 3.35 (champion 91)    | 3.62 (champion 91)    | 2.13 (champion 88)         |
| dark, pointer over the number | name      | 13  | 12.05 (stade KARIM)   | 12.78 (stade BENNANI) | 7.15 (stade KARIM)         |
| dark, pointer over the number | tier      | 8   | 6.86 (pro PRO)        | 6.86 (pro PRO)        | 6 (pro PRO)                |
| dark, pointer over the number | statValue | 36  | 8.76 (champion —)     | 8.66 (champion —)     | 7.91 (champion —)          |
| dark, pointer over the number | statLabel | 36  | 4.92 (homa CAP)       | 4.88 (homa CAP)       | 4.31 (homa CAP)            |
| dark, pointer over the number | ovr       | 9   | 3.35 (champion 91)    | 3.62 (champion 91)    | 2.13 (champion 88)         |

Floors: names, tier word, stat values and stat labels at stage size are small text (4.5:1); the number is large text and a graphic (3:1 against the shirt). Every median meets its floor in every pose. Lowest: stat labels 4.88 (ring, pointer over the number), OVR 3.35 against the shirt (CHAMPION 91 on Raja green, Arabic interface).

## Clutter: drawn elements per full card (path, rect, circle, ellipse, text, line, polygon outside defs, masks, patterns, clip paths; rims excluded)

| tier     | rev 2 drawn | rev 3 drawn | change | rev 2 text | rev 3 text | rev 2 markup bytes | rev 3 markup bytes |
| -------- | ----------- | ----------- | ------ | ---------- | ---------- | ------------------ | ------------------ |
| base     | 205         | 105         | -49 %  | 26         | 23         | 39154              | 31038              |
| homa     | 214         | 105         | -51 %  | 26         | 23         | 40702              | 32248              |
| stade    | 224         | 111         | -50 %  | 30         | 26         | 41693              | 32125              |
| pro      | 224         | 110         | -51 %  | 30         | 26         | 41700              | 31746              |
| champion | 262         | 113         | -57 %  | 32         | 26         | 48176              | 33933              |
| legend   | 284         | 118         | -58 %  | 33         | 27         | 52057              | 34526              |

## Pointer sweep (relative only)

`perf.mjs`: headless Chromium 1194, software raster, 1440 px DPR 2, the LEGEND card, 90 pointer moves in a circle 16 ms apart, `requestAnimationFrame` deltas. Not a budget measurement (no GPU); it compares the two revisions on the same machine.

|       | card() markup build, ms per card | frames | median frame ms | p95  | max  |
| ----- | -------------------------------- | ------ | --------------- | ---- | ---- |
| rev 2 | 0.46                             | 93     | 33.4            | 50.1 | 66.7 |
| rev 3 | 0.16                             | 159    | 16.7            | 33.4 | 66.7 |

## Not run

No app code exists yet for revision 3, so `bun test`, typecheck, lint, build, the gates and the e2e suites were not run for this design step; `rg -in sorare src public` was run (below in the commit notes). Docker and the database were not touched.
