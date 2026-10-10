## Format

The PNGs the capture scripts write come to 129 MB (the full set 119.6 MB, the gallery 9.7 MB; a 780 × 1688
picture of a knitted card is 0.3 to 0.9 MB), over the 40 MB the brief allows for PNG, so the committed
card pictures are **WebP** (`to-webp.py`, quality 92, method 6, never resized): 319 files, 37.5 MB. Against
the PNGs, measured on five of the committed files at quality 92, the mean absolute difference per channel
is 0.5 to 1.4 of 255 (`g3-rated-fr-light-390` 0.48, `g1-legend-ar-dark-390` 1.15,
`hero-legend-fr-light-390` 1.07, `picture-legend-fr-light-1080` 1.44, `gallery-tokens-fr-light-1000`
0.61; the 99th percentile 7 to 14), and small text and the 24 px minis read the same side by side. The PNGs are
not committed: re-running the scripts writes them again. The **switch-off folder stays PNG** (6.0 MB with
`report.json`) because `wp1/compare-off.mjs` reads PNG captures and the after run compares
against this folder directly. The after set is saved the same way, WebP for the card pictures, so a
pair is two WebP files with one name.

## What was measured while capturing

| Check                                                                                          | How                                                                                                                                                           | Result                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The tree captured is `main` `8fae526c` and unchanged                                           | `git -C /home/user/mc-sorare-base rev-parse HEAD` and `git status --short` after the run; `git diff --stat 8fae526c 73630b4b -- src public`                   | `8fae526cf86ca143cf5d45beba9fde7763b8351e`, 0 changed files; the branch's source differs from `main` by 0 files                                                                                                                                                                       |
| The incumbent renderer drew every picture that has a card                                      | `capture-log.json`, per picture: the class of the first `[role="img"]` the page drew                                                                          | 197 pictures draw `mc-echarpe` cards, 99 more draw `mc-tk` tokens (the Écharpe's token), 11 draw no card art (the text-only surfaces above); the gallery's 12 pictures say `echarpe-v2` in `capture-log-gallery.json`                                                                 |
| Language and direction                                                                         | per picture: `html[data-lang]` and `dir` read after the capture against the file name                                                                         | 307 of 307 agree: `fr` pictures are `ltr`, `ar` pictures `rtl`                                                                                                                                                                                                                        |
| No console error, page error, failed request or HTTP status of 400 or more on any card picture | the same listeners on every page of every picture                                                                                                             | none on 307 pictures and 12 gallery pictures; 2 pictures (`picture-forming1-*`) were dropped, see below                                                                                                                                                                               |
| The share picture does not depend on the theme                                                 | `picture-rated-fr-light-1080` and `picture-rated-fr-dark-1080` taken from the same page in the two themes                                                     | the two PNGs have the same md5 (`d8ba09f07ac6051f50ade5ec7957e81a`) and no differing pixel; the other fixtures are saved in light                                                                                                                                                     |
| The switch-off set is today's app                                                              | the preview-off pictures against the owner's reference set `manager-card-section/before/`, per pixel (a channel off by more than 2 of 255 counts), same sizes | Pépites 0.000% (3 pictures), Home 0.065% and 0.101%, Fantasy 0.156%, 0.389%, 0.507% and 0.508%: the same residuals `manager-card-section/wp6b` reports for the base tree (Pépites 0.000%, Home 0.065% and 0.101%, Fantasy 0.156% to 0.508%; a countdown and fonts, no card)           |
| The section is off in that set                                                                 | `report.json`: the four `/gradins*` addresses without following redirects                                                                                     | 307 to `/fantasy` on all four                                                                                                                                                                                                                                                         |
| Home logs a hydration `pageerror` on the dev server                                            | one page, `/`, visited with and without Playwright's fixed clock                                                                                              | 0 errors without the clock, 1 with it: the server renders with the real time and the browser with the fixed one. It is the capture's clock, not the app; React rebuilds the tree and the picture is the same. `report.json` records it for the 8 Home pages; no card picture logs one |

## What is not here, and why

- **The server HTML of the switch-off pages** (`capture-switch-off.mjs` writes it to `switch-off/html/`): the
  repository's `format:check` would reformat it, and `compare-off.mjs` needs the bytes. It is kept out;
  the after run captures both trees fresh, as `manager-card-section/wp1` did. SHA-256 of the raw HTML of
  this capture, for the record: `/` 459b2def2ccc290e (home), `/` returning 388aea487b540e0f (home-returning),
  `/fantasy` af6de00341d0ce02, `/pepites` 7ed972472851cfa8, `/matches` ad68f089e9ea5c43 (first 16 hex
  digits; 166,921, 166,921, 66,740, 156,800 and 94,659 bytes).
- **`picture-forming1-*`**: a card with no number has no share sheet (the page offers the invitation
  instead), so there is no picture to save. The two attempts timed out looking for the share button and
  were removed from the script; `capture-log.json` lists them under `dropped`.
- **G1 « Club » and « Saisons » at 1440**: at 1440 the card column is sticky and the page already shows
  those blocks beside it in the `g1-*` pictures; the two extra pictures showed nothing new and were dropped.
- **The recap line (`RecapCardLine`), the late signer's hub line and the import prompt's block**: the mock
  data has no finished round with a card that counts it, nor a cloud account with an empty cloud squad,
  so these are not reachable in any picture (as `manager-card-section/wp5/INDEX.md` already says).
- **Motion**: the pictures are at rest (reduced motion). The beats, the sway and the idle states are
  measured, not pictured, in the after run's own measurements.
- **The after set's new compositions** (the redrawn 80, 64, 48 and 32 px tokens, the G4 card's own
  sizing) have no before of their own: the incumbent's tokens at every size are in `gallery-tokens-*`.

## Servers

One development server at a time was started from `/home/user/mc-sorare-base`, on port 4190 only, and each
was stopped by its process id before the next: preview on (the card pictures, the retries, the gallery),
preview off (`switch-off/`), then preview on again for the last scenes added to the script (`g1People`,
`g1Club`, `g1Seasons`, `g1GuestPoints`, `setup-*`, `profile-delete`). It is the same tree at the same commit
throughout (`git status` clean, `HEAD` unchanged). Nothing is left running. No database, migration, Edge
Function, deployment or Lovable call was made, and nothing was pushed.
