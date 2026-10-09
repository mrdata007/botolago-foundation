# Manager Card revision 3 with the critique fixes: design self-check

Measured 2026-10-09 in Chromium 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) on `docs/product/manager-card-sorare-style/mock.html` as committed (file://, no dev server). Scripts in `scripts/` (`selfcheck.mjs`, `extra.mjs`, `numcon.mjs`, `halo.mjs`, `ov.mjs`, `tiltcheck.mjs`; the jersey critic's own scripts in `scripts/critic-jersey/`). DPR 2, `reducedMotion: reduce` unless stated. « rev 3 » below = the revision 3 mock before the critique (commit `2f2f487d`); « rev 3b » = this commit.

## Console messages

- light 1440 px: 0 errors or warnings
- light 390 px: 0 errors or warnings
- light 320 px: 0 errors or warnings
- dark 1440 px: 0 errors or warnings
- dark 390 px: 0 errors or warnings
- dark 320 px: 0 errors or warnings

## Overflow (element rectangles of every `body *`, SVG descendants included)

| theme, width | viewport | max right | min left | first escaping | card text outside its card |
| ------------ | -------- | --------- | -------- | -------------- | -------------------------- |
| light 1440   | 1440     | 1340      | 100      | none           | 0                          |
| light 390    | 390      | 390       | 0        | none           | 0                          |
| light 320    | 320      | 320       | 0        | none           | 0                          |
| dark 1440    | 1440     | 1340      | 100      | none           | 0                          |
| dark 390     | 390      | 390       | 0        | none           | 0                          |
| dark 320     | 320      | 320       | 0        | none           | 0                          |

`ov.mjs` on the same file also reports `scrollWidth` = the viewport at 320, 390 and 1440 in both themes.

## The number inside the chest box (pixel scan, 1 viewBox unit = 1 px)

| OVR | font size | ink box (jersey space) | ink box (card space)         | inside chest box | inside shirt |
| --- | --------- | ---------------------- | ---------------------------- | ---------------- | ------------ |
| 8   | 300       | [406, 527, 591, 745]   | [394.7, 504.2, 601.9, 748.4] | True             | True         |
| 11  | 283.3     | [345, 535, 659, 737]   | [326.4, 513.2, 678.1, 739.4] | True             | True         |
| 44  | 243.2     | [342, 551, 658, 723]   | [323, 531.1, 677, 723.8]     | True             | True         |
| 88  | 251.7     | [344, 544, 656, 729]   | [325.3, 523.3, 674.7, 730.5] | True             | True         |
| 99  | 254.1     | [342, 543, 658, 730]   | [323, 522.2, 677, 731.6]     | True             | True         |
| —   | 220       | [401, 574, 599, 627]   | [389.1, 556.9, 610.9, 616.2] | True             | True         |

## Tokens: the number's ink in CSS px (club RAJA, PRO)

| OVR | 80 px             | 64 px             | 48 px             | 32 px             |
| --- | ----------------- | ----------------- | ----------------- | ----------------- |
| 8   | 26.48 h x 22.7 w  | 26.57 h x 22.77 w | 22.13 h x 18.97 w | 15.56 h x 13.33 w |
| 11  | 16.78 h x 27.52 w | 14.44 h x 23.68 w | 12.01 h x 19.7 w  | 8.41 h x 13.8 w   |
| 44  | 14.06 h x 27.81 w | 12.1 h x 23.93 w  | 10.06 h x 19.9 w  | 7.05 h x 13.94 w  |
| 88  | 15.27 h x 27.43 w | 13.15 h x 23.61 w | 10.93 h x 19.63 w | 7.66 h x 13.75 w  |
| 99  | 15.42 h x 27.67 w | 13.27 h x 23.8 w  | 11.03 h x 19.8 w  | 7.73 h x 13.87 w  |

Targets (critique): two digits ≥ 14 / 12 / 10 / 7 CSS px tall at 80 / 64 / 48 / 32. The number now grows with the token.

## Contrast from rasterised pixels (`selfcheck.mjs`)

Method as in revision 3 (text shot vs the same shot with the element hidden; `bbox` = median background in the element's rectangle, `ring` = unchanged pixels within 3 device px of the glyphs). Rows now cover the main, Arabic, long-name and 200 px G4 rows. For the number and « OVR » this method reads the twill or the halo as the text on dark-on-light prints, so their direct readings are in the next table.

| page, pose                    | kind      | n   | min bbox median                        | min ring median                        |
| ----------------------------- | --------- | --- | -------------------------------------- | -------------------------------------- |
| light, rest                   | name      | 21  | 11.3 (full stade KARIM)                | 11.48 (full stade KARIM)               |
| light, rest                   | tier      | 13  | 7.09 (full pro PRO)                    | 7.09 (full pro PRO)                    |
| light, rest                   | statValue | 56  | 12.11 (full homa 64)                   | 12.11 (full homa 64)                   |
| light, rest                   | statLabel | 56  | 6.86 (full homa SEL)                   | 6.86 (full homa SEL)                   |
| light, rest                   | meta      | 53  | 5.15 (arabic champion RCA)             | 5.15 (arabic champion RCA)             |
| dark, rest                    | name      | 21  | 11.3 (full stade KARIM)                | 11.48 (full stade KARIM)               |
| dark, rest                    | tier      | 13  | 7.09 (full pro PRO)                    | 7.09 (full pro PRO)                    |
| dark, rest                    | statValue | 56  | 12.11 (full homa 64)                   | 12.11 (full homa 64)                   |
| dark, rest                    | statLabel | 56  | 6.86 (full homa SEL)                   | 6.86 (full homa SEL)                   |
| dark, rest                    | meta      | 53  | 5.15 (arabic champion RCA)             | 5.15 (arabic champion RCA)             |
| dark, pointer over the name   | name      | 21  | 10.36 (names stade MOHAMMEDABDELHAKIM) | 10.32 (names stade MOHAMMEDABDELHAKIM) |
| dark, pointer over the name   | tier      | 13  | 7.09 (full pro PRO)                    | 7.09 (full pro PRO)                    |
| dark, pointer over the name   | statValue | 56  | 12.11 (full homa 64)                   | 12.11 (full homa 64)                   |
| dark, pointer over the name   | statLabel | 56  | 6.86 (full homa SEL)                   | 6.86 (full homa SEL)                   |
| dark, pointer over the name   | meta      | 53  | 5.15 (arabic champion RCA)             | 5.15 (arabic champion RCA)             |
| dark, pointer over the number | name      | 21  | 11.13 (names stade MOHAMMEDABDELHAKIM) | 10.78 (names stade MOHAMMEDABDELHAKIM) |
| dark, pointer over the number | tier      | 13  | 7.09 (full pro PRO)                    | 7.09 (full pro PRO)                    |
| dark, pointer over the number | statValue | 56  | 12.11 (full homa 64)                   | 12.11 (full homa 64)                   |
| dark, pointer over the number | statLabel | 56  | 6.86 (full homa SEL)                   | 6.86 (full homa SEL)                   |
| dark, pointer over the number | meta      | 53  | 5.15 (arabic champion RCA)             | 5.15 (arabic champion RCA)             |

## The number and « OVR » against the shirt (`numcon.mjs`, `halo.mjs`)

Fill pixels located by repainting the fill magenta (overlays above it hidden); background = the same pixels with the whole number layer hidden. Dark page, rest.

| row    | tier     | number fill vs shirt | « OVR » fill vs shirt |
| ------ | -------- | -------------------- | --------------------- |
| full   | base     | 3.27                 | —                     |
| full   | homa     | 5.63                 | 5.05                  |
| full   | stade    | 5.38                 | 5.35                  |
| full   | pro      | 3.83                 | 3.72                  |
| full   | champion | 5.35                 | 5.74                  |
| full   | legend   | 14.74                | 11.88                 |
| arabic | champion | 3.77                 | 3.77                  |
| arabic | homa     | 5.44                 | 5.45                  |
| arabic | legend   | 14.87                | 12.06                 |
| names  | stade    | 8.05                 | 8.7                   |
| names  | pro      | 5.43                 | 5.37                  |
| names  | champion | 3.8                  | 3.75                  |
| g4     | pro      | 3.81                 | —                     |
| g4     | legend   | 15                   | —                     |

« OVR » fill against its own halo: min 8.91 over 11 cards. White on Raja green (#0a8f3a) cannot exceed 4.2:1, so the halo carries the 4.5:1.

## Forming marks (base card, Raja shirt)

| mark | bright part vs shirt | dark part vs shirt | height CSS px |
| ---- | -------------------- | ------------------ | ------------- |
| on   | 3.8                  | 2.84               | 8.3           |
| off  | 2.95                 | 3.94               | 7.3           |
| off  | 3.23                 | 3.4                | 7.3           |

Filled marks: the cream fill (3.8:1). Empty marks: the dark fill 3.4–3.9:1; the 4-unit cream ring 3.0–3.2 (antialiased).

## Layout (viewBox units, `extra.mjs`)

| row    | tier     | dir | name lines (size: ink top–bottom)                           | ink to rule | gap between lines | below plaque/point | stat centres' mean x | capsule clearance |
| ------ | -------- | --- | ----------------------------------------------------------- | ----------- | ----------------- | ------------------ | -------------------- | ----------------- |
| full   | base     | ltr | ALI 144: 1124–1230                                          | 174         | —                 | 68                 | 500                  | —                 |
| full   | homa     | ltr | HAMZA 144: 1209–1316                                        | 88          | —                 | 67                 | 500                  | —                 |
| full   | stade    | ltr | KARIM 80: 1186–1236; BENNANI 120: 1254–1344                 | 60          | 18                | 44                 | 500                  | —                 |
| full   | pro      | ltr | ALI 144: 1210–1316                                          | 88          | —                 | 68                 | 500                  | —                 |
| full   | champion | ltr | ABDELKARIM 80: 1186–1236; BENJELLOUN-ALAOU 104.2: 1265–1365 | 39          | 29                | 44                 | 500                  | —                 |
| full   | legend   | ltr | YASMINE 80: 1184–1238; ALAOUI 120: 1254–1344                | 60          | 16                | 42                 | 500                  | 39.5              |
| arabic | champion | rtl | فاطمة 80: 1175–1236; الزهراء 92: 1278–1366                  | 38          | 42                | 33                 | 500                  | —                 |
| arabic | homa     | rtl | HAMZA 144: 1209–1316                                        | 88          | —                 | 67                 | 500                  | —                 |
| arabic | legend   | rtl | سلمى 112: 1245–1349                                         | 55          | —                 | 103                | 500                  | 32.5              |
| names  | stade    | ltr | MOHAMMEDABDELHAK 67.4: 1266–1317                            | 87          | —                 | 124                | 500                  | —                 |
| names  | pro      | ltr | عبد الرحمن 80: 1175–1259; بن جلون العلوي 92: 1278–1382      | 22          | 19                | 33                 | 500.1                | —                 |
| names  | champion | rtl | LES LIONS 80: 1184–1238; DU DERB SIDI MAA 93.6: 1273–1343   | 61          | 35                | 42                 | 500.1                | —                 |
| g4     | pro      | ltr | ALI 144: 1210–1316                                          | 88          | —                 | 68                 | 500                  | —                 |
| g4     | legend   | ltr | YASMINE 80: 1184–1238; ALAOUI 120: 1254–1344                | 60          | 16                | 42                 | 500                  | 35.5              |

## Crispness and depth

- At rest under reduced motion: `.mc-eclat__tilt` transform `none`, `transform-style: flat`, frame layer `none`, first rim `matrix(1, 0, 0, 1, 2.4864, 2.4864)` (the 2D thickness).
- Motion allowed (`tiltcheck.mjs`, LEGEND): rest `none` → pointer over the card `matrix3d(…)`, `--mc-t` 1, `preserve-3d` → 150 ms after leaving `--mc-t` ≈ .01 → after the settle `none`, `flat`; `document.getAnimations()` 0.
- Mean luminance step across the name's glyph edges (PRO « ALI », motion allowed, no pointer) against the same page with every transform removed:

| file, DPR     | at rest | flat  |
| ------------- | ------- | ----- |
| rev3-pre dpr2 | 43.7    | 102.4 |
| rev3-pre dpr3 | 41.1    | 102.6 |
| rev3b dpr2    | 95.4    | 95.4  |
| rev3b dpr3    | 95.8    | 95.8  |

## G4 at 200 px: every remaining text run

- RCA 8 px, EXEMPLE 8 px, PRO 8.8 px, ALI 28.8 px, CAP 8 px, 91 10.4 px, SEL 8 px, 82 10.4 px, TRF 8 px, 86 10.4 px, CON 8 px, 78 10.4 px
- FAR 8 px, LEGEND 8.8 px, YASMINE 16 px, ALAOUI 24 px, CAP 8 px, 95 10.4 px, SEL 8 px, 92 10.4 px, TRF 8 px, 90 10.4 px, CON 8 px, 94 10.4 px

## Background texture (Sobel on background-only regions: top band, both sides below the sleeves, under the hem; % of pixels)

| tier     | rev 2 strong / fine | rev 3 strong / fine | rev 3b strong / fine |
| -------- | ------------------- | ------------------- | -------------------- |
| base     | 1.22 / 5.02         | 5.18 / 5.05         | 3.26 / 13.06         |
| homa     | 5.27 / 9.23         | 5.84 / 4.85         | 3.34 / 14.87         |
| stade    | 4.06 / 8.24         | 6.58 / 8.49         | 4.35 / 18.55         |
| pro      | 6.98 / 9.86         | 6.83 / 6.77         | 5.31 / 16.01         |
| champion | 2.17 / 12.31        | 5.28 / 18.12        | 3.08 / 21.32         |
| legend   | 2.5 / 9.52          | 5.19 / 25.18        | 6.14 / 17.02         |

Thresholds: strong > 120, fine 24–120 (Sobel magnitude on 0–255 grey). This is not the hierarchy critic's script (not kept), so compare columns, not their numbers.

## The jersey critic's scripts, re-run (`scripts/critic-jersey/`, 900 px card at DPR 2, flat pose)

### Shirt layer: body colour and spread (`meas.py`)

```
== shirt-only layer: body pixels outside chest box/collar/disc ==
base n 330054 median rgb [ 30 130  65] L* p5/p50/p95 33.9/47.7/64.0 range 30.1 primary #0a8f3a primary L*a*b* [ 51.9 -51.   35.7] median L*a*b* [ 47.8 -43.1  27.2] dE 12.3
homa n 329949 median rgb [88 91 92] L* p5/p50/p95 27.0/38.4/56.6 range 29.6 primary None primary L*a*b* None median L*a*b* [38.4 -1.  -1. ] dE None
stade n 330013 median rgb [175  34  56] L* p5/p50/p95 26.7/38.7/53.5 range 26.8 primary #c8102e primary L*a*b* [42.5 65.9 35.7] median L*a*b* [38.8 56.  23.9] dE 15.8
pro n 330054 median rgb [ 30 130  65] L* p5/p50/p95 33.9/47.7/64.0 range 30.1 primary #0a8f3a primary L*a*b* [ 51.9 -51.   35.7] median L*a*b* [ 47.8 -43.1  27.2] dE 12.3
champion n 330062 median rgb [207 129  22] L* p5/p50/p95 44.9/60.9/75.5 range 30.7 primary #f28e00 primary L*a*b* [68.2 30.5 73.8] median L*a*b* [60.8 22.9 62.8] dE 15.3
legend n 330045 median rgb [35 34 35] L* p5/p50/p95 4.0/13.7/35.3 range 31.3 primary #111111 primary L*a*b* [5.1 0.  0. ] median L*a*b* [13.4  0.7 -0.5] dE 8.4
```

### Shirt edge against the field (`sep.py`; the « L shoulder » probe sits above the shoulder line and samples field against field)

```
base      L sleeve 39/10 dE53 cr2.50 | R sleeve 50/17 dE54 cr3.20 | L shoulder 15/16 dE1 cr1.03 | L body 41/11 dE59 cr2.73 | R body 44/16 dE58 cr2.71
homa      L sleeve 31/15 dE16 cr1.66 | R sleeve 48/28 dE21 cr2.12 | L shoulder 28/27 dE1 cr1.01 | L body 34/20 dE14 cr1.62 | R body 39/27 dE13 cr1.55
stade     L sleeve 30/5 dE53 cr2.06 | R sleeve 46/16 dE50 cr2.82 | L shoulder 29/27 dE3 cr1.09 | L body 34/10 dE57 cr2.13 | R body 38/20 dE52 cr1.89
pro       L sleeve 39/15 dE69 cr2.23 | R sleeve 54/26 dE69 cr2.80 | L shoulder 25/25 dE4 cr1.02 | L body 43/16 dE72 cr2.57 | R body 47/23 dE71 cr2.37
champion  L sleeve 52/30 dE67 cr2.21 | R sleeve 65/42 dE60 cr2.20 | L shoulder 39/42 dE3 cr1.10 | L body 55/26 dE81 cr2.87 | R body 59/31 dE77 cr2.73
legend    L sleeve 20/21 dE27 cr1.05 | R sleeve 44/33 dE31 cr1.48 | L shoulder 41/25 dE20 cr1.77 | L body 14/21 dE29 cr1.23 | R body 22/31 dE23 cr1.37
```

### Field colour (`field.py`)

```
base      top L* 16.5 C*  6.6 rgb[36 41 50] | side L* 10.8 rgb[26 29 37] | under-hem L* 15.1 rgb[35 38 45] | lamp L* 19.8 vs side-low L*  9.8
homa      top L* 25.1 C*  5.8 rgb[54 60 68] | side L* 16.8 rgb[37 42 48] | under-hem L* 22.9 rgb[52 55 59] | lamp L* 30.9 vs side-low L* 15.0
stade     top L*  9.6 C*  8.0 rgb[32 26 15] | side L*  5.7 rgb[23 18  8] | under-hem L* 22.8 rgb[58 54 47] | lamp L* 25.1 vs side-low L*  5.6
pro       top L* 23.0 C* 38.4 rgb[104  26  33] | side L* 16.3 rgb[80 17 23] | under-hem L* 21.8 rgb[76 43 47] | lamp L* 29.6 vs side-low L* 15.8
champion  top L* 37.7 C* 21.1 rgb[ 40  95 118] | side L* 28.1 rgb[27 71 90] | under-hem L* 27.8 rgb[50 68 80] | lamp L* 41.2 vs side-low L* 26.2
legend    top L* 15.6 C* 28.8 rgb[49 30 70] | side L* 11.3 rgb[40 22 56] | under-hem L* 26.3 rgb[67 59 76] | lamp L* 28.8 vs side-low L* 12.3
```

### Frame band profiles (`band.py`)

```
pro y 300 L* x916..1000 step2: 16 15 15 15 14 13 72 45 46 46 45 45 45 45 45 44 23 18 19 19 18 18 18 18 18 18 17 17 18 18 19 17 17 17 17 16 43 41 42 41 41 40 5
pro y 700 L* x916..1000 step2: 9 7 7 6 3 2 65 32 32 32 32 32 32 32 32 32 13 12 13 13 13 12 12 13 13 12 12 12 15 13 12 12 12 13 13 12 37 34 34 34 34 34 5
pro band x933 down y60..880: 33 57 57 51 46 41 33 24 76 21 28 33 36 39
stade y 300 L* x916..1000 step2: 13 13 11 11 10 9 90 79 80 80 79 79 79 79 79 78 41 12 12 12 12 12 11 12 12 11 11 11 11 11 13 10 10 11 11 10 60 74 75 75 74 74 5
stade y 700 L* x916..1000 step2: 3 6 6 2 1 1 82 63 63 63 63 63 64 64 64 64 30 5 5 6 6 5 5 5 5 5 5 5 8 5 5 5 5 5 5 5 54 66 67 67 67 67 5
stade band x933 down y60..880: 88 91 92 86 80 73 63 46 88 43 57 65 70 73
homa y 300 L* x916..1000 step2: 19 18 16 15 15 14 88 77 77 77 77 77 77 78 78 77 40 25 25 25 24 25 24 25 24 24 24 24 24 24 26 23 23 23 23 23 66 80 80 80 80 80 5
homa y 700 L* x916..1000 step2: 8 7 7 7 5 4 90 80 80 80 80 80 79 80 79 79 37 19 19 20 20 19 19 19 19 19 19 19 22 19 19 19 19 19 19 19 63 76 76 76 76 75 5
homa band x933 down y60..880: 77 73 70 74 77 82 84 72 99 70 80 78 71 62
legend y 300 L* x916..1000 step2: 22 18 36 77 17 17 84 77 77 77 77 76 76 76 75 75 50 17 17 17 17 17 16 17 17 16 16 16 16 15 17 15 15 15 15 14 56 82 82 83 83 83 5
legend y 700 L* x916..1000 step2: 6 5 25 67 5 4 72 61 61 62 62 62 62 62 62 62 36 7 7 9 8 7 7 7 7 7 7 7 11 7 7 7 7 7 7 6 45 68 68 68 68 68 5
legend band x933 down y60..880: 84 88 90 85 77 75 74 68 86 61 60 62 64 66
```

## Clutter: drawn elements per full card (outside defs, masks, patterns, clip paths; rims excluded)

| tier     | rev 2 | rev 3 | rev 3b | rev 2 → 3b | rev 3b markup bytes |
| -------- | ----- | ----- | ------ | ---------- | ------------------- |
| base     | 205   | 105   | 121    | -41 %      | 39245               |
| homa     | 214   | 105   | 129    | -40 %      | 41967               |
| stade    | 224   | 111   | 130    | -42 %      | 41133               |
| pro      | 224   | 110   | 126    | -44 %      | 39996               |
| champion | 262   | 113   | 129    | -51 %      | 42401               |
| legend   | 284   | 118   | 136    | -52 %      | 44361               |

## Not run

This is a design step: no app code exists for revision 3, so `bun test`, typecheck, lint, build, the gates and the e2e suites were not run. The pointer-sweep frame timing (`perf.mjs`) was not re-run after the critique fixes. No database, Docker or network service was touched.
