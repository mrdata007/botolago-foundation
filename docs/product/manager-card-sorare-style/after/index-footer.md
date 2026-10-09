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

- **`switch-off/`**: the section-off pictures are not taken again. With the section off the page is the app's
  own, and that is checked by `tests/e2e/gradins-off.e2e.ts` (9 tests on the production build) and the
  off-bundle gate, both run for the commit that adds this folder, rather than by pictures.
- **Three pictures were taken twice.** `g1-rated-fr-light-390`, `g1-rated-fr-dark-390` and `g1-rated-ar-light-390`
  were the first pictures of the run on a cold development server and showed the loading skeleton
  (`drawn.cards` 0 in the first log); the three were captured again with `--match` and the log holds the
  second capture (`retaken` in `capture-log.json`).
- **`picture-forming1-*`, G1 « Club » and « Saisons » at 1440, the recap line, the late signer's line and the
  import prompt's block**: absent for the reasons the BEFORE set gives.
- **Motion**: the pictures are at rest. The tilt, the beats and the idle float are measured in
  `src/components/manager-card/eclat/README.md` and the Playwright suite, not pictured.

## Servers

One development server, on port 4193 only, started for this run from the tree above and stopped by its process
id at the end. Nothing is left running. No database, migration, Edge Function, deployment or Lovable call was
made, and nothing was pushed.
