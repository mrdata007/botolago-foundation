# Card editions: the four paid finishes on the collector shield (brief)

Owner-approved screen work (the paid editions in the owner's `botolago-plus-sketch.html`, 2026-10).
Branch `claude/plus-card-editions`, from the lane B backend branch (which contains `main` with the
shield renderer). Written before any interface change, as `AGENTS.md` (Screen work) asks. Copy it
into the draft pull request description later.

Backend lane B already returns `edition` (`standard | holo | electric | pixel | chrome`) on card
reads, parsed in `src/backend/manager-card/contracts.ts` (absent or unknown reads as absent). This
lane only draws it.

## What must be preserved

- **The standard card, untouched.** `standard`, an absent edition and an unknown one draw exactly
  what the free card draws today: the metal follows the earned tier (graphite, silver, gold,
  red-gold, cyan holographic, purple prism). Same markup, same cache key.
- **Everything that says something.** The rating, OVR, the tier word, the four statistics, the club
  and crest, the founder capsule, the serial line, the forming marks, the sample label, the emblem
  diamond, the autograph and monogram: same place, same size, same text. An edition changes the
  material, never the content, the layout or the accessible name (the label does not mention the
  edition).
- **Business logic and contracts.** Rating, tiers, thresholds, forming, moments, sharing, Fantasy.
  The only contract change is one optional field on `CardProfile` (`edition?`).
- **The renderer contract and Éclat.** Screens still go through `ManagerCard` and `CardToken`;
  `renderer-contract.test.ts` passes unchanged in what it requires; `eclat/` is untouched.
- **Motion rules.** Everything moving sits inside `prefers-reduced-motion: no-preference`; beats
  never animate the number or the serial; the tilt only where a screen asks for it; no animation in
  tokens or lists.
- **Arabic.** Logical properties, digits and Latin codes left to right, no letter-spacing on Arabic.
- **Violet and pink prism stay LEGEND's.** The holo edition is green, cyan, blue only.
- **Identity.** BotolaGO's faces and tokens. No third-party names (EA, FIFA, FUT). The words
  "BotolaGO+" are never typed on the card.

## The specific improvements

1. `edition` flows from the parsed card (`MyCardDto`, `MemberCardDto`, the history replay) into
   `CardProfile.edition` (optional, absent for standard) and on to the renderer.
2. **Holo**: deep teal body, prism foil in diagonal bands that moves with the light and slowly
   drifts, glints, a hue-turning green/cyan/blue bezel, aqua ink.
3. **Electric**: black body with green bars, a bright wedge, mint ink, a neon autograph, and a green
   border that crackles (displacement filter, flickering between noise seeds) with a pulsing glow.
4. **Pixel**: navy body on a pixel grid, a stair-step wedge, a two-tone checker bezel that marches,
   a field of pixels that twinkles, a stepped 8-bit autograph.
5. **Chrome**: white marble with silver veins, a thick polished bezel with a gloss band that sweeps
   across it, dark ink and a gold-foil autograph.
6. Every paid edition: a glow in its colour behind the card and a slow sheen sweeping the face (the
   full card only).
7. **Tokens** (rows, blocks): the mini shield takes the edition's frame (including the checker for
   pixel) and face colours, still, with the rating. The **share picture** draws the edition's
   frame, face and ink as the card at rest.
8. A development-only way to force an edition for screenshots on the sample route
   (`/dev/manager-card-sample?edition=holo`), absent from production builds.

## Visual and functional acceptance criteria

- Every edition, at tier pro and legend and with no rating, French and Arabic, at 390 x 844 and
  1280 x 900, matches the approved sketch's finish (frame, face, signature ink, fx), rating and tier
  at the top start, emblem off the side, club band, stats, crest, serial.
- Text contrast read from rasterised pixels: 4.5:1 or more for the small text (stat labels, serial,
  club), 3:1 or more for the large (rating, stat values, tier word), on every edition. The unit
  tests measure every text colour against every stop of every edition's face.
- Standard markup is byte-identical to before for a profile with no edition.
- Arabic mirrors; nothing overflows the viewport at 390 px (element boxes).
- With reduced motion nothing animates (sheen, twinkle, crackle, hue, bezel sweep, marching
  pixels); the crackle is not SMIL, so the media query reaches it.
- Tokens and the compact and cropped cards carry no animation at all.
- Typecheck, lint, the manager-card, curva, auth, routes and inline tests, the full test run and the
  build pass; `tests/e2e/curva.e2e.ts` runs where a browser is available.
- Before/after screenshots kept as evidence (editions x tiers x languages x widths, tokens, contact
  sheet).

## Decisions

- The emblem keeps the earned tier's glyph (the edition is the material, the emblem is the tier);
  the sketch's per-edition glyphs are not drawn.
- The holo edition's body equals CHAMPION's metal on purpose (the sketch's holo is that metal); what
  differs is the live prism, the glints, the drift and the bezel.
- The card's DOM faces that take only a tier (`palette(tier)`: the back, the burst) keep the tier
  palette; the edition shows on the face and in tokens and the share picture.
