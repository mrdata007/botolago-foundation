# Share picture matches the card in the app: brief

Written before any interface change, as `AGENTS.md` (Screen work, rule 3) asks. Branch
`claude/share-card-matches-app`. The owner reported that the card shared as a picture is not the
same as the card in the app.

## What was found

The share picture draws the card from `shield/image.ts`, a second, hand-kept copy of the drawing
that `shield/full.ts` + `shield.css` make on screen. Rendered side by side
(`scripts/qa/share-card-compare.sh`) they differ in three ways:

1. The club name is squeezed into a blob on every card. `image.ts` hands the picture drawer
   `fitWidth: 82`, which is in card units; the drawer reads it in picture pixels (`renderer.ts`
   says so), so the line is squeezed to about 80 px instead of about 580.
2. The paid editions (BotolaGO+) lose their finish: Pixel's pixel field, Electric's crackling
   border, glow and sparks, Holo's prism foil and sparks are drawn by `full.ts` (`editionFx`) and
   never by `image.ts`.
3. The rating column is laid out differently. The picture centred the tier word on a fixed
   column and fixed « OVR » in place, so CHAMPION and LEGEND ran over the card's left edge.
   Measured in a browser, the app's column starts 4.5 % in from the inline start, is at least
   22 % wide and grows to its widest line; the number and the tier word are each centred in it,
   and « OVR » follows the number's end. (This corrects the first reading of this brief, which
   said the tier word is left-aligned.)

## Must be preserved

- The picture's layout, size (1080 x 1920), palette, wordmark, caption, name, rating line,
  season, disc and footer: `card-share-image.ts` layout is unchanged.
- Everything about ratings, tiers, tier metals, the live card (`full.ts`, `shield.css`) and the
  share message and channels. No business rule changes.
- Arabic: mirrored layout, no tracking on Arabic runs, digits and Latin codes left to right.
- The picture stays a still: no animation, no `<text>`, no external image or font in the art SVG
  (an SVG drawn as an image loads neither, and a loaded picture would taint the canvas).

## Improvements

1. `fitWidth` in picture pixels, so the club name reads as it does on the card.
2. The rating column is laid out by the card's rule (see 3 above), measured with the real fonts.
3. Still versions of the paid editions' layers in the art: Pixel (the pixel field), Electric
   (glow, crackle border, sparks), Holo (prism foil bands, sparks), as one frame of what the
   card shows. Chrome has no extra layers in the card, so nothing to add.

## Acceptance

Visual: for every tier and every edition, in French and Arabic, the picture's card shows the same
text in the same place as the app card, the same finish, and nothing runs outside the card.
Measured on rasterised pixels from a render of the real code, not read off the code.

Functional: existing tests pass (`bun test src/components/manager-card`), new tests pin the
`fitWidth` unit and the tier word's position, the art SVG contains no `<text>`, `<image>` or
external reference, `bunx tsc --noEmit` and lint pass on the touched files.
