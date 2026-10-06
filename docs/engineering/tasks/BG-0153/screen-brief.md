# BG-0153 · The share pictures on the main design (screen brief)

Owner request, 2026-10-06: "The Pépites and Fantasy share pictures still use
the old Pépites style" — fix it, then publish. This is the follow-up BG-0152
left open: Pépites moved onto the kit, but the pictures its share sheets draw
did not.

Branch `claude/share-images-main-look`. This brief is committed on its own,
before any change to the pictures, as AGENTS.md "Screen work" rule 3 requires;
copy it into the draft pull request description.

Scope, three pictures drawn on a canvas in the reader's browser:

- `src/components/pepites/share-image.ts`: the Pépites **Top 10 post**
  (1080×1350) and a player's **story card** (1080×1920);
- `src/components/fantasy/recap-image.ts`: the Fantasy **"Ma journée"
  recap post** (1080×1350), which imports its helpers from `share-image.ts`.

Today all three draw the retired Pépites look: the night `#070d24` with
violet and teal glows, a mint-sky-violet "energy" gradient used as a text
colour (titles, names, scores), a skewed slant on titles and figures, IBM Plex
Mono for every meta line, a hand-drawn "GO" square with a "DATA" tag
(`GoMark`), and a five-colour wheel with a violet slice. The recap uses the
same night, a mint-to-sky band and gradient-coloured score.

Out of scope: the share sheets and flows themselves (`PepitesShareSheet`,
`ShareImageSheet`, the native share and save code), the copy, every screen,
and the public demo (`public/demo/app.html`, a self-contained bundle that
embeds its own copy of the old fonts).

## What must be preserved

**Sizes.** 1080×1350 for the Top 10 post and the recap, 1080×1920 for the
story card (`SHARE_IMAGE_SIZE`, `STORY_IMAGE_SIZE`; the Pépites e2e suite
checks the decoded sizes).

**Every piece of content, in its order.**

- Top 10 post: the brand mark with the section's name, the kicker
  ("U23 · BOTOLA PRO"), the title ("TOP 10" / "أفضل 10"), the section's name
  in large type, the week line ("SEMAINE 16 · RISING SCORE"), then ten rows of
  rank, photo or club disc with initials, name, club · position, the
  ten-segment bar and the score; then the footer address and the legend.
- Story card: the brand mark and the kicker, the large ghost rank ("05"), the
  first name and the surname on two lines (one word goes on the second line),
  club · position · age, the five-slice percentile wheel with each value at its
  slice ("–" when missing) around the photo or the club disc, the five-label
  legend (four, then one, centred), then the score, the rank line, the
  minutes and rating line, and the footer address.
- Recap: the approved white wordmark, the kicker ("Ma journée BotolaGO"), the
  heading ("Journée 9 · Résultat final"), the team name, the total with its
  unit, up to three factual lines on a panel, and the footer.

**Strings and figures.** Every string arrives translated from the callers
(`PepitesShareButton`, `PepitesPlayerShareButton`, `GameweekRecapCard`), and
the models are built exactly as now: `shareImageModel`, `storyModel`,
`splitName`, `sharePhotoUrl` and `lineRuns` keep their code and output. The
digit rules hold: Latin digits in both languages, no grouping in
`formatNumber`, the French narrow space in `formatCount` ("1 159"), the
French uppercase of names and meta, Arabic names as written, the ghost rank
padded to two digits, the segments `round(score / 10)`.

**Arabic.** The pictures mirror: the inline start is the right edge, the
kicker and the scores sit at the inline end, the wheel runs counter-clockwise
from twelve o'clock with its legend read right to left, the recap's figure
reads first from the right with its unit on its left. Names stay isolated
(U+2068/U+2069) and the recap's left-to-right runs ("8 × 2 = 16", "−4") are
still drawn one by one (`lineRuns`, `drawLine`), so their order and sign hold.
No letter-spacing in Arabic.

**Photos.** A picture carries a player's photo only when its release allows
social use (`scope = 'in_app_and_social'`). Photos load with
`crossOrigin = "anonymous"`; one that fails to load gives way to the club
disc and initials, and a canvas a photo would taint is drawn again without
photos. A withdrawn edition has no picture.

**Fonts.** The faces are loaded with `document.fonts.load` before drawing,
because a canvas does not wait for them.

**Flows and names.** The share sheets, previews, native share, save, the
WhatsApp and copy-link actions, the analytics events and the file names
(`pepites-semaine-{n}.png`, `pepites-{slug}.png`, `botolago-journee-{n}.png`)
do not change. Every export another module uses keeps its signature:
`SHARE_IMAGE_SIZE`, `STORY_IMAGE_SIZE`, `sharePhotoUrl`, `shareImageModel`,
`storyModel`, `splitName`, `loadImage`, `roundRect`, `toPng`, `canvasOf`,
`renderShareImage`, `renderStoryImage`, `lineRuns`, `renderRecapImage` and
the model types.

**Brand.** The logo files are not touched: the pictures use the approved
all-white wordmark (`src/assets/brand/botolago-wordmark-light.svg`) as it is.

## Improvements being made

1. **The app's night colours only.** The ground is Tunnel Navy and the
   panels Floodlight Navy, the two navies the app paints; `#070d24`, the
   glows and every violet go. Type is white, and the quieter lines take the
   kit's muted foreground for a navy fill. Each colour is a kit token
   converted to sRGB hex for the canvas and cited beside its value. The hex
   values were read from pixels Chromium painted, not computed from `oklch`:

   | Token                                  | Use                                                  | sRGB                  |
   | -------------------------------------- | ---------------------------------------------------- | --------------------- |
   | `--ui-ink-deep` (Tunnel Navy)          | ground; text on the gradient and plate               | `#001c49`             |
   | `--ui-ink` (Floodlight Navy)           | panels, wheel track, ghost figures                   | `#0c3164`             |
   | `--ui-on-ink-plain` (Home Shirt White) | type, lit segments, score plate                      | `#ffffff`             |
   | `--ui-on-ink-muted`                    | meta, kicker, legend, unlit ranks                    | `#cad2dd`             |
   | `--ui-accent-spring` (Fresh Turf)      | top stop of the action gradient                      | `#60fa97`             |
   | `--ui-accent-sky` (Matchday Sky)       | bottom stop of the action gradient                   | `#73edfa`             |
   | `--ui-rule`, dark value, on each navy  | hairlines                                            | `#2c4d79` / `#223b62` |
   | `--ui-ink-edge`, dark value            | the ring that keeps a navy club disc visible on navy | `#737b86`             |

2. **The action gradient once per picture, with intent, never as a text
   colour** (The Earned Gradient Rule). It runs from Fresh Turf at the top to
   Matchday Sky at the bottom, and any text on it is Tunnel Navy:
   - Top 10 post: the week pill, like the Fantasy deadline pill;
   - story card: the percentile values in the wheel, as the app fills
     progress with it;
   - recap: the plate behind the total, like a selected Fantasy plate.
     Titles, names and scores that were gradient-coloured become white Changa.
3. **No slant, no mono.** Every skew goes. Meta lines, kickers, the week line,
   the rank line and the footers move from IBM Plex Mono to Manrope (French)
   or Noto Sans Arabic (Arabic) in the kit's label and meta weights,
   letter-spaced in French only. Changa carries titles, names and standalone
   figures, never above 800.
4. **The approved wordmark instead of the hand-drawn mark.** The `GoMark`
   lock-up (a typed "GO" in a white square, the section's name, a "DATA" tag
   in the energy gradient) becomes the white BotolaGO wordmark, a hairline and
   the section's name, as on the Pépites screens, which dropped the "DATA" tag
   in BG-0152.
5. **The screens' own glyphs.** A Top 10 row reads like the Top 10 card on
   `/pepites`: the club's colour on the row's inline-start edge, a flat club
   disc with initials in the club's own legible ink (white or near-black,
   `inkOn`), the ten-segment bar lit in white over a recessed Tunnel Navy
   track, Changa rank and score; ranks 1 to 3 stay emphasised, by colour
   instead of gradient. The story card's score sits on the white score plate
   with Tunnel Navy digits, the app's signature for a standalone score, and
   the club colour runs down the card's inline-start edge where the club glow
   was. A photo fills its disc without stretching.
6. **One wheel colour, a legend that still maps.** The wheel's five slices
   lose their five colours (one was violet, and none was a kit token). The
   values are painted in the action gradient over a Floodlight Navy track,
   and each legend entry carries a small wheel that marks its own slice, so the
   legend keeps its labels, its order and its place.
7. **IBM Plex Mono retired.** Once nothing draws with it, its `@font-face`
   rules in `src/fonts.css` and its files in `public/fonts/` are removed, and
   the docs that said the share images still used it are corrected.

## Acceptance criteria (visual and functional)

Visual:

- Each picture, in French and Arabic, reads as BotolaGO's main look: navy
  grounds, white type, Changa titles and figures, Manrope or Noto Sans Arabic
  for the rest, club colour only where the data supplies it, the action
  gradient exactly once with Tunnel Navy text on it.
- No `#070d24`, no violet (no colour with a hue between 240° and 330° at more
  than 25% saturation), no IBM Plex Mono, no slant, no gradient text.
- Arabic mirrors as listed under "What must be preserved"; French and Arabic
  before/after pictures for all three, with a photo and without, and with a
  one-word name and a 100 score on the story card.
- Text contrast measured from the rendered pixels: body and meta text at
  least 4.5:1 on its ground, large text at least 3:1.
- Nothing overflows its area: long names and team names shrink or stay inside
  their column in both languages.

Functional:

- Every contract under "What must be preserved" holds; the existing model and
  `lineRuns` tests pass unchanged.
- New tests pin the palette (every colour the pictures paint is a cited token
  or a club colour from the data, and none is `#070d24` or violet), the faces
  (no Plex or monospace, Changa at most 800) and the Arabic mirroring of the
  drawn positions.
- `bun run typecheck`, `bun run lint` (0 errors), the relevant tests and the
  full `bun test` pass; `bunx prettier --check` passes on the changed files.
