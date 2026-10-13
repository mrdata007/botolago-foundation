# Curva: the collector shield card (brief)

Owner-approved screen change, 2026-10-13. Branch `claude/curva-shield-card`, from `main` at
7e8e8ea0. The Manager Card that Curva draws (and every other place that draws the card: the stage,
its back, the heroes, the replay sheet, the born panel, the tier burst and ceremony, the tokens in
rows and blocks, the share picture) changes from Éclat (`src/components/manager-card/eclat/`, the
shirt on a honeycomb in a cut-cornered frame) to a new renderer, the collector shield
(`src/components/manager-card/shield/`, id `shield-v1`). It is free for everyone; no paid edition is
part of this change.

Inspected before writing this: the Éclat renderer and its README, the renderer contract
(`renderer.ts`, `renderer-contract.test.ts`, `markup-safety.ts`), `ManagerCard`, `CardToken`,
`CardStage`, `CardBack`, the moments (heroes, burst, ceremony, share picture), the dev sample route,
`/curva`, `/curva/carte` and `/curva/les-votres` with the development fixtures, in French and
Arabic at 390 x 844 and 1280 x 900 (screenshots kept with the pull request's evidence), and the
reference sketch of the shield (the owner's `botolago-plus-sketch.html`).

## What must be preserved

- **Business logic, untouched.** Fantasy rules, scoring, the gameweek lifecycle, the Manager Card's
  rating, tiers and their thresholds, the four statistics, forming (k of N journées), provisional,
  founder, serial and season, moments and their acknowledgement, the beats' names and when they
  play, sharing. Only the drawing changes.
- **The renderer contract.** Screens still never import a renderer; they go through `ManagerCard`
  and `CardToken`. The new renderer implements every method of `CardRenderer` (`full`, `token`,
  `aspect`, `tokenBox`, `detail("founder")`, `image`, `label`, `palette`, `beatMs`, `beatRoot`,
  `mount`) and passes `renderer-contract.test.ts` unchanged in what it requires. Switching back to
  Éclat stays a change to `active-renderer.ts` alone; the `eclat/` folder and its tests stay.
- **The same accessible name.** The root's `aria-label` is the same sentence as today (Éclat's
  `label`: name, rating or « pas encore de note », tier with LASTREET for `homa`, club, founder,
  serial).
- **Safety.** Every manager-supplied string goes through one escape; only the allow-listed tags; a
  club colour reaches an attribute only as a checked hex; a crest only through `crestHref`.
- **Empty states draw as their own empty part.** No rating is a dash, never 0; no club, no serial,
  no founder, no name each draw their empty part; the sample label on development fixtures.
- **Motion rules.** All motion off under `prefers-reduced-motion`; the tilt only where a screen
  asks for it; beats never animate the number or the serial.
- **Arabic.** The card mirrors with logical properties; digits and Latin codes stay left to right;
  no letter-spacing on Arabic.
- **Identity.** BotolaGO's tokens, faces (Changa, Manrope, Noto Sans Arabic) and the LASTREET tier
  word. No third-party names, logos, fonts or images (no EA, FIFA, FUT or FC marks).

## The specific improvements

1. **A shield-shaped collector card** (100 x 136.6: crown tip, shoulders, small ear steps, vertical
   sides, a rounded bottom to a point), our own artwork, with a layered frame (dark rim, bevel
   highlight, inner line).
2. **The metal follows the earned tier**: no tier yet graphite; LASTREET (`homa`) silver; STADE
   gold; PRO red-gold; CHAMPION cyan holographic; LEGEND purple prism holographic (violet and pink
   prism for LEGEND only).
3. **No photo: the name is the art**, written as a holographic autograph: Mr Dafoe (OFL) for a
   Latin name, Aref Ruqaa 700 (OFL) for an Arabic one, one line rising slightly, a pen swash under
   it, the ink a foil tuned to the tier metal whose colours slide with the tilt. A long name
   shrinks to fit; a very long one breaks to two lines. The initials stand as a large faint foil
   monogram at the top inline end.
4. **A collector layout**: the rating large at the top inline start with a small « OVR », the tier
   word under it; a diamond emblem hanging off the side edge; under the art a band with the club
   name, one row of the four statistics (short label above the value), the club crest centred
   under them, and « BOT #… · season » underneath.
5. **Tokens** become mini shields in the tier's metal with the rating; the **share picture** draws
   the shield; the **back, the flip edge and the ceremony** take the shield's outline from the
   renderer instead of the cut corner.
6. The fonts are self-hosted with their OFL licences and declared by the card's own stylesheet, so
   nothing is fetched from Google at run time and nothing loads while the section is off.

## Visual and functional acceptance criteria

- The stage card on `/curva`, `/curva/carte`, the heroes and the dev sample route draws the shield
  for every tier and for no rating, at 390 x 844 and 1280 x 900, in French and Arabic, matching the
  reference look (rating and tier top start, autograph across the art, monogram top end, emblem off
  the side, club band, four stats, crest, serial and season).
- Arabic mirrors the layout (rating at the top right, emblem off the right edge), the autograph is
  Ruq'ah for an Arabic name, no tracking on Arabic text.
- The box reserved before the renderer loads is the card's exact shape (`estimateAspect` equals
  `aspect`), so nothing jumps when the card arrives.
- Text contrast, read from rasterised pixels: 4.5:1 or more for the small text (stat labels,
  serial, club name), 3:1 or more for the large (rating, stat values, tier word).
- Nothing overflows the viewport at 390 px (checked by element boxes, not `scrollWidth` alone).
- Under reduced motion no animation runs and nothing is written by the tilt; with a pointer the
  card tilts and the foil follows; on touch it floats.
- `renderer-contract.test.ts` passes for the plain and the shield renderer; the shield's own unit
  tests pass; the existing Manager Card, Curva, moments, inline, auth and routes tests pass, with
  tests that asserted Éclat internals updated to the shield's equivalent behaviour (none skipped);
  lint, typecheck and build pass.
