## Format

WebP for the card pictures, as the BEFORE set (`before/to-webp.py`, quality 92, method 6, never resized): 319
files, 23.0 MB (the PNGs the scripts write were 115.2 MB and are not committed: re-running the scripts writes
them again). `capture-log.json` and `capture-log-gallery.json` are the scripts' own logs.

## What was measured while capturing

| Check                                                                       | How                                                                                   | Result                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The new renderer drew every picture that has a card                         | `capture-log.json`, per picture: the class of the first `[role="img"]` the page drew  | 191 `mc-eclat` cards, 105 `mc-tok` tokens, 11 pictures with no card art (the same 11 text-only surfaces as before); the gallery's 12 pictures say `eclat-v1` in `capture-log-gallery.json`                             |
| Same names as the BEFORE set                                                | the two logs, by name                                                                 | 307 of 307 card pictures and 12 of 12 gallery pictures have the name of a BEFORE picture, and no BEFORE picture is missing                                                                                             |
| Language and direction                                                      | per picture: `html[data-lang]` and `dir` read after the capture against the file name | 307 of 307 agree: `fr` pictures are `ltr`, `ar` pictures `rtl`                                                                                                                                                         |
| No console error, page error, failed request or HTTP status of 400 or more  | the same listeners on every page of every picture                                     | none on 307 pictures and 12 gallery pictures                                                                                                                                                                           |
| What differs in composition from the BEFORE set, apart from the card itself | the two logs, kind of card art per name                                               | the born panel on the team page (`teamBorn-*`, `team-born-*`: 6 pictures) draws the 80 px **token** where the BEFORE set drew a 96 px card (review fix: the compact card's text is 6 px at 96 px, see §17 of the plan) |

## What is not here, and why

- **`switch-off/`**: the section-off pictures are not taken again here. The switch-off comparison against `main`
  (production builds of both trees, 0.0000 % on every picture, byte-identical server HTML) is in
  [`../wp4/results/switch-off-compare.txt`](../wp4/results/switch-off-compare.txt), and the built-output
  Playwright spec `tests/e2e/gradins-off.e2e.ts` was run for the commit that adds this folder.
- **No picture was taken twice in this run.** The development server was warmed up first (one browser visit to
  eight routes, so Vite had compiled the card's modules), and the log shows 307 captured, 0 failed, no problem
  and no skeleton: every card drawn carries `data-mc-ready` (the founder pages and the replay sheet count the
  founder detail's crop as a card without that attribute, as in the BEFORE set).
- **`picture-forming1-*`, G1 « Club » and « Saisons » at 1440, the recap line, the late signer's line and the
  import prompt's block**: absent for the reasons the BEFORE set gives.
- **Motion**: the pictures are at rest. The tilt, the beats and the idle float are measured in
  `src/components/manager-card/eclat/README.md` and the Playwright suite, not pictured.

## Two subfolders (not part of the name-for-name set)

- **`gallery/`** (28 sheets): every fixture and tier at every size, light and dark, French and Arabic, by
  [`../wp4/capture-gallery-all.mjs`](../wp4/capture-gallery-all.mjs): `full-fixtures-<lang>-<theme>` (every fixture with a card and the
  guest at 296 px), `full-tiers-…` (six tiers on four clubs at 264 px), `tokens-fixtures-…` (every fixture at 80, 64, 56, 48, 44, 32, 28
  and 24 px), `tokens-tiers-<size>-…` (six tiers on every club and on none at 80, 64, 48 and 32 px). Cards at rest, as `ManagerCard` and
  `CardToken` insert them. Log: `gallery/capture-log-gallery-all.json`.
- **`detail/`** (28 close-ups) by [`../wp4/detail-crops.mjs`](../wp4/detail-crops.mjs), 3 device pixels per CSS pixel:
  `art-<tier>-fr-<theme>` (the shield, the shirt and the number of each tier), `plate-<tier>-fr-dark` (plaque, name, stats, serial),
  `art-legend-ar-dark` and `plate-legend-ar-dark`, and `crisp-<pro|legend>-dpr<2|3>-<rest|tilt>` (a PRO and a LEGEND card whole, at
  rest and with the pointer over the upper part). The first take of the four tilted pictures had no tilt in three of them (the page had
  just loaded); they were taken again alone and the log records the computed transform of each.

## Servers

One development server, on port 4194 only, started for this run from the tree above and stopped by its process
id at the end of the WP4 measurements. Nothing is left running. No database, migration, Edge Function, deployment or Lovable call was
made, and nothing was pushed.
