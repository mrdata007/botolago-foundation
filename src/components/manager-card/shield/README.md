# The collector shield: the Manager Card

The card renderer the app draws (`../active-renderer.ts`, id `shield-v1`), owner's design of
2026-10-13: a shield-shaped collector card in the metal of the tier the manager has earned, with no
photo. The manager's name is the art, written as a holographic autograph; the rating and the tier
stand at the top, the club, the four statistics and the crest below. Free for everyone. Our own
artwork: no third party's names, marks, fonts or images. It implements `CardRenderer`
(`../renderer.ts`); Éclat (`../eclat/`) stays beside it, and going back is a change to
`active-renderer.ts` alone.

## The metal follows the tier (`metal.ts`)

| Step                 | Metal                                         |
| -------------------- | --------------------------------------------- |
| no tier yet (`base`) | graphite                                      |
| LASTREET (`homa`)    | silver                                        |
| STADE                | gold                                          |
| PRO                  | red-gold                                      |
| CHAMPION             | cyan holographic (green to blue, no violet)   |
| LEGEND               | purple prism holographic (violet, pink, cyan) |

One table in literal colours feeds everything: the full card (custom properties on its root), the
tokens and the share art (SVG gradients) and `palette()` for the faces the screens draw in DOM (the
back, the burst, the ceremony). `metal.test.ts` measures every text colour against every stop of
its face (4.5:1) and keeps violet and pink to LEGEND.

## Files

| File                       | What                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `index.ts`                 | `shieldRenderer`; imports `shield.css`.                                                                       |
| `curva-shield-renderer.ts` | The lazily loaded entry; its name is the chunk's, which the off-bundle gate allows (`curva-*`).               |
| `estimate.ts`              | `ASPECT` = 1.366 (100 : 136.6), the only module meant for the main bundle.                                    |
| `geometry.ts`              | The outline, its CSS polygon (`outline()`), the emblem's glyphs, the swash.                                   |
| `metal.ts`                 | The six metals and their CSS, the palette.                                                                    |
| `name.ts`, `metrics.ts`    | The autograph: cleaning, script, initials, measure (canvas, or the committed table), fit to one or two lines. |
| `full.ts`                  | `fullCard`, `founderDetail`, `beatRoot`.                                                                      |
| `token.ts`, `image.ts`     | Tokens (24 to 80 px) and the share art.                                                                       |
| `tilt.ts`                  | `mount`: the tilt on a mouse or pen, the float on touch.                                                      |
| `beats.ts`, `shield.css`   | The beats' timing table and the stylesheet (layout, light, 3D, motion).                                       |
| `fonts.ts`                 | `ready()`: the faces the card fits and prints.                                                                |

## How a card is built

One root element (`role="img"`, the same label as before, `dir` from the interface language) whose
layers are absolutely placed spans: the card's thickness, the frame (the metal through the
outline's mask), the face (through the inner line's mask), the art (monogram and autograph), the
text (club, stats, crest, founder's capsule, serial, sample), the number (rating, « OVR », tier word
or forming marks), the frame's lines, the light and the emblem. Every size is in `cqw` of the root,
which is a size container, so a card is drawn from its width alone. Logical properties mirror the
Arabic card (rating at the top right, emblem off the right edge); no text is mirrored by a
transform, digits and Latin codes are set left to right, and no Arabic text is tracked.

The autograph follows the name's script: Mr Dafoe for a Latin name, Aref Ruqaa 700 for an Arabic
one, on one line rising 6 to 7 degrees with a pen swash under it. Its ink and the monogram's are the
metal's foil (`--sh-sig`), which slides with the light (`--mc-ax`). A name is fitted to 80 % of the
card's width; one too long for one line at its least size breaks once at the word that balances the
lines; one word with no space shrinks.

## Motion

At rest the card is flat 2D. With a mouse or a pen over it, it turns (up to 11 degrees) and the
light follows; the layers take their heights only then. On a touch-only screen it floats while on
screen. The seven beats are root classes and CSS keyframes (`beats.ts` and `shield.css` agree,
`beats.test.ts` checks); none moves the number, the text layer or the serial. Under
`prefers-reduced-motion: reduce` nothing moves.

## The serial

The face prints « BOT #… · season » under the crest because the owner's layout of 2026-10-13 asks for
it (`SERIAL_ON_FACE` in `full.ts`). The card's label, the share picture and the rest of the app still
do not show it (decision of 2026-10-12); `SERIAL_ON_FACE = false` takes it off the face alone.

## Fonts

Mr Dafoe and Aref Ruqaa (OFL, `public/fonts/` with their licences) are declared in `shield.css`, so
with the section off they are never requested. Changa and Manrope are the app's.
