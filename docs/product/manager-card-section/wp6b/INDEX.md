# WP6b · integration, review fixes and evidence: files

The evidence itself, criterion by criterion, is [`../INDEX.md`](../INDEX.md). This folder holds what WP6b made: the
pictures of the finish review's fixes, the scripts that measure them, and the result files of the runs.

## Pictures (`after/`)

34 files, 256-colour PNG, named `<screen>-<fixture>-<fr|ar>-<light|dark>-390[-full].png` (`-full` is the whole page at 390). Made by
`capture.mjs` (G1, the guest, the club block, G2, G6) and `capture-team-born.mjs` (the team page's born panel), then `shrink-pictures.py`.

| Files                                              | What                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `team-born-born0-*`, `team-born-born0Serial-*`     | The team page's born panel, 213 px, with and without a serial, light and dark |
| `g1-forming1-*`, `g1-rated-*`, `g1-seasonClosed-*` | G1 with the round line under the identity line; the whole page for `forming1` |
| `g1-guest-*`, `g1-guest-tryon-*`                   | The guest: the dash, the club discs wrapped                                   |
| `g1-club-block-*`                                  | « Votre club » without its side bar                                           |
| `g2-rated-*`, `g6-rated-*`                         | « Vos moments » as the heading of the list                                    |

## Scripts

| File                       | What it measures                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture.mjs`              | The pictures above (`BASE=http://127.0.0.1:4186 node …/capture.mjs [--only=g1,guest,club,g2]`)                                                          |
| `capture-team-born.mjs`    | The born panel's height and where the pitch's first row ends, with the picture; exits 1 when the first row is under the bar or a control is under 44 px |
| `dash-contrast.mjs`, `.py` | The guest dash's colour and its contrast with the rib's two column shades, from rasterised pixels                                                       |
| `card-contrast.mjs`, `.py` | The card's own labels (number, name, patch text) from rasterised pixels at the stage size, against 3:1 and 4.5:1                                        |
| `try-on-measure.mjs`       | The club discs at 320, 360, 375, 390, 430, 768 and 1440, both languages: inside the window, at least 44 × 44                                            |
| `perf.mjs`                 | G1 data to card at CPU × 4, and the renderer's own timings                                                                                              |
| `shrink-pictures.py`       | Rewrites each PNG with an adaptive 256-colour palette                                                                                                   |

## Results (`results/`)

`bun-test.txt`, `build-and-gates.txt`; `e2e-gradins-on.txt`, `e2e-suites-switch-off.txt`, `e2e-pepites.txt`, `e2e-built-output-smoke.txt`;
`off-compare-production.txt` and `.json`, `off-compare-development-server.txt`; `on-capture-nav.txt`, `on-probe-wp3.txt`,
`on-layout-{light,dark,visitor}.txt`, `on-contrast-{light,dark,visitor}.txt`; `card-contrast-result.txt`, `dash-contrast-result.txt`,
`try-on-result.txt`; `perf.json`; `impeccable.json`.
