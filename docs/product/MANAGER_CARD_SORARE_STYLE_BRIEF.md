# Manager Card, collectible style: screen-work brief

AGENTS.md "Screen work" rule 3. Written 2026-10-09 on `claude/manager-card-sorare-style` (from `main`
`8fae526c`, the merge of #382), before any interface change, after inspecting the incumbent card
(`src/components/manager-card/**`, `src/components/gradins/**`, the share picture, the fixtures and the
evidence of `docs/product/manager-card-section/`). The design spec the build follows is
[`MANAGER_CARD_SORARE_STYLE_PLAN.md`](MANAGER_CARD_SORARE_STYLE_PLAN.md); the direction mock is
[`manager-card-sorare-style/mock.html`](manager-card-sorare-style/mock.html). Copy this page into the
draft pull request description.

**The owner's request (2026-10-09, verbatim):** « I want you to change the design of the card, I want it
to clone SoRare cards, same design same style, but no pictures. I do not want the current style. it is
too generic use /impeccable to design it according to sorare. make the plan and let sonnet 5.5
implement it. » Plus, the same day: the lowest tier is displayed **LASTREET** (one word, uppercase, the
same Latin word in Arabic); the stored key stays `HOMA` / `homa`.

**Scope.** The card object only, everywhere it is drawn: the full card, the 44–80 px tokens, the
24–32 px minis, the founder detail and the card art in the 1080 × 1920 share picture; the stage it
stands on; and the tier's display label. The app chrome around the card (headers, the rating line,
blocks, sheets, navigation) keeps Design System V2 and does not change, apart from the stage's rail
(an Écharpe prop) and the tier word's isolation in Arabic.

**Legal guardrail.** Follow Sorare's football card closely in layout, proportions, layering, type
contrast, frame furniture, foil ladder and light, as the owner asks. Do not copy Sorare's logo, its
wordmark, its rarity names (Limited, Rare, Super Rare, Unique), its season badges or any of its artwork
files; nothing is traced or sampled from its images. Our tier names (LASTREET, STADE, PRO, CHAMPION,
LEGEND), our BotolaGO wordmark, our serial format (`BOT #482913`) and our own generated art take those
places. The word "sorare" never appears in shipped text, class names, file names under `src/` or assets.

## What must be preserved

- **The data, exactly as the server gives it.** `CardProfile` and `CardStrings` (`types.ts`) are not
  changed; the card draws the server's number and never computes one. Stats CAP · SEL · TRF · CON, the
  season label, the serial, the founder year, the club (initials and two colours), the name (display
  name, else team name).
- **Every state of the card**, each drawn as the object's own empty part, never a 0, a lock, a question
  mark or a sealed/covered state:
  null rating → « — » on the number, announced « pas encore de note » / «لا تقييم بعد»; forming → k of
  N marks (`counted` / `minRated`); provisional → no change to the art, the app's « Provisoire » pill
  beside it (and on the share picture); null tier → the unfoiled base card with no tier word, never
  LASTREET before a rating; serial or none (`BOT —` on the same carrier); founder or not (no founder
  part at all when not); club or none; unnamed guest (an empty name line); the five tiers; long Latin
  names; Arabic names; a Latin name in the Arabic interface and the reverse; `sample` fixtures printing
  « Exemple » / «مثال».
- **Business rules.** Fantasy scoring, the gameweek lifecycle, tiers and their thresholds (server-side),
  moments and their acknowledgement, the founder rule, the season rules. The card is display-only.
  The tier key `homa` (`HOMA` in the database, #381 applied on production) is not renamed anywhere:
  no migration, no contract change, no fixture key change; only the displayed word changes.
- **The off switch and the gates.** `MANAGER_CARD_ENABLED = false` ships the app byte-for-byte as
  today: the renderer stays a lazily imported chunk named `gradins-*`, no new request, storage key or
  console message. `scripts/qa/manager-card-off-bundle-gate.ts`, `scripts/qa/manager-card-fixture-gate.ts`
  and `scripts/qa/i18n-gate.ts` keep passing.
- **The renderer contract.** One root element, `role="img"`, the `cardLabel` sentence as
  `aria-label`, `dir` from the interface language, every attribute and text node through one escape,
  only the allowed tags, a text-free `image()` SVG plus text runs, a founder `detail()`, a DOM-free
  `aspect()` and `tokenBox()`. `renderer-contract.test.ts` runs on the new renderer unchanged except
  for additions.
- **Motion rules.** Beats are requested by name (`make`, `tick`, `first`, `tier`, `legend`, `founder`,
  `castoff`), each ≤ 600 ms; nothing that moves holds the number, the serial or any text; the number
  is opaque and on top at t = 0 of every beat; no count-up, flip, cover, blur-in, scratch or
  tap-to-reveal; nothing runs under `prefers-reduced-motion: reduce`, while the page is hidden, or on
  tokens and minis.
- **Product truths and wording.** No banned word (plan 2.5: no « rare », « limité », « édition »,
  « exclusif », pack, pull, reveal, scarcity or supply wording), no « x/1000 »-style count on the card,
  no crest (club disc with initials), nothing implying the league or a club endorses the card.
- **Accessibility and Arabic.** 44 × 44 targets, contrast floors, the label spoken as drawn, Arabic as a
  first language: mirrored layout, Western digits isolated, no letter-spacing on Arabic text, names in
  Changa.
- **Every surface** listed in the plan's §5: G1 stage (GradinsHome, GuestHero, NoTeamHero), G2 card
  page and its five-step tier ladder, G4 face-à-face (two full cards), the replay sheet, the hero frame
  of each moment, the M2 born panel, the founder block, the season rack, league band and rows, guest
  points, the account setup row, the Fantasy hub block, rank token, save line, league row mini, league
  band, guest intro point, and the share picture.

## The specific improvements

1. **A collectible card in the language of Sorare's football cards** (the 2026-27 generation, with
   the 2022-23 card's centred rating culture): golden-ratio portrait (1 : 1.618), a dark lacquered
   plate, a raised tab at the top-leading corner, a cut bottom-trailing corner, a leading rail with a
   lit tube and the vertical BotolaGO wordmark, a trailing capsule and tube, a large art window, a
   bottom plate with labelled stats in hairline-divided columns, the name in two lines (heavy sans
   over light condensed serif, uppercase), and the identifier small at the foot.
2. **No photo: the shirt without the player.** The art window holds a club-coloured shirt (sleeves,
   cuffs, V collar and stitches in the club's second colour, a knit mesh, a chest disc with the club's
   initials), and on it the rating **printed inside the chest** like a real shirt number (twill
   outline, raised with light-following highlight and shade), over a
   generated field of light ribbons and glitch bars in the tier's colour, unique to each card (seeded
   by its serial) and stable.
3. **A six-step foil ladder** (base, LASTREET, STADE, PRO, CHAMPION, LEGEND): unfoiled graphite, steel,
   amber, red, ice blue, violet with a prismatic foil, foil intensity rising with the tier.
   3a. **Premium detail** (owner, revision 2): grain, guilloche, bevelled and recessed edges, hairlines,
   micro-print, a season stamp, captions, screw-head rivets, sharp light streaks; all vector, crisp at
   DPR 2–3, dropping by size on tokens.
   3b. **Holographic items for CHAMPION and LEGEND only** (owner, revision 2): rainbow diffraction foil
   that follows the light, a diffraction grid and spectral streaks, prismatic edge foil, sparkles and
   a BotolaGO holographic seal with the tier; LEGEND stronger than CHAMPION.
   3c. **Real depth on every card** (owner, revision 2): five layers in CSS 3D (field, shirt, number,
   frame, holo) with parallax, an extruded rim, a contact shadow that moves against the light, an
   embossed number; at rest the card already leans; cards are larger on the stage (296 / 336 px).
4. **Light that follows the hand.** On a mouse or pen, the card tilts up to 7°/9°, its layers part,
   and the sheen, the shadow, the raised number and (top tiers) the holographic foil follow; on
   touch-only phones a slow idle float while on screen; under reduced motion the card is still at its
   rest lean.
5. **Beats in the card's own material** (all ≤ 600 ms, the number never touched): tubes ignite and a
   sheen crosses (`make`), a mark lights (`tick`), the field kindles under the number (`first`), the
   foil sweeps in from the foot (`tier`), the prism crosses (`legend`), the capsule lights (`founder`),
   a seal line runs across the plate (`castoff`).
6. **Tokens that read as the same card** at 44–80 px, and minis at 24–32 px that keep its silhouette,
   colour and number.
7. **The tier label LASTREET** for the lowest tier, in French and Arabic, isolated as a Latin run in
   Arabic.
8. **The Écharpe direction removed** (code, styles, tests, the stage's rail); history keeps it.

**Revision 3 (owner feedback on revision 2, 2026-10-09; plan §16).** The owner's words: « fix the
jersey they are too long. make sure the dimensions are correct. add hexagonal honeycomb background
with layered gradients for each cards color, add geometric texture, and a shield-style card frame.
make the jerseys 3D », then ten points on backgrounds, clutter, the jersey, hierarchy, the six tiers,
lighting, materials, small sizes, holography and Arabic/French, with « Preserve the existing card
structure, statistics, tier system, color identity, interactions and business logic ». What changes:

9. **The jersey at real proportions, in 3D**: length 1.44 × pit-to-pit, span across the sleeves ≈ the
   length, a visible hem, sleeves, cuffs and a collar in proportion; fabric mesh, folds, seams, volume
   shading, a rim light, a cast shadow on the backboard (plan §5.1). The number is refitted to the new
   chest (§5.2).
10. **Football backgrounds**: a honeycomb backboard with layered gradients in each tier's colour (lines,
    raised cells or foil cells by tier), two stadium floodlights, the centre circle and halfway line, a
    backlight behind the jersey (§5.3). The sci-fi ribbons, glitch bars and pixel rain go.
11. **About half the drawn elements removed** (measured: 205–284 → 105–118 per card): tubes, rivets,
    the season stamp, guilloche, micro-print, captions, stitches, sparkles, the seal, the grid (§16).
12. **A shield-style frame**: an embossed metal shield band round the art inside the unchanged
    asymmetric outline, a metal outer edge, physical materials per tier (§3.2, §5.4).
13. **Hierarchy**: under the shield's point the tier word in a metal plaque, then the name, then the
    stats, centred; the name is tied to the artwork (§3.3).
14. **Six tier treatments**: base graphite, LASTREET brushed silver and a street cage, STADE black and
    gold with spotlights, PRO crimson with raised dark-red hex tiles, CHAMPION cyan–teal foil, LEGEND
    deep purple with prismatic foil, the most prestigious (§5.4).
15. **Restrained holography** on CHAMPION and LEGEND only: foil in the honeycomb cells and on the edges
    and plaque, in each tier's narrow palette, never over the number or the plate's text (§5.5).
16. **Small sizes redrawn**: at 80, 64, 48 and 32 px the token keeps the OVR, the tier's metal and
    colour and an enlarged jersey; every texture and text drops (§7).
17. **Arabic and French**: centred names with a particle rule for long names (`LES LIONS`,
    `عبد الرحمن`), the tier word in Arabic in the Arabic interface (LASTREET stays Latin), mirrored
    capsule and rail (§3.3, §4).

## Acceptance criteria

Measured as CLAUDE.md "Evidence" says: overflow from element rectangles, contrast from rasterised
pixels, each run against a dev server started from the tree being measured on its own port.

**Visual**

- Before/after screenshots, development preview (`VITE_MANAGER_CARD_PREVIEW=1`, mock modes), at
  390 × 844 (2×) and 1440 × 900 (1×), French and Arabic, light and dark, of: G1 `rated`, `forming1`,
  `founder`, `legend`, `homa`, `clubNull` and the signed-out guest view (with a club tried on); G2 `rated` (with the ladder) and `founder`
  (founder block); G4 face-à-face; the replay sheet; the M4 hero; the Fantasy hub block and the
  rankings row with a token; the league band with minis; the share picture (FR and AR). Before from
  `main` `8fae526c` (port 4181), after from the branch (its own port). Listed in
  `docs/product/manager-card-sorare-style/INDEX.md`.
- A gallery page of every fixture × tier × theme × language at full, 80, 64, 56, 44, 32, 28 and
  24 px, captured once.
- Contrast from pixels at stage size (296 and 336 px wide), light and dark, at rest **and** with the
  pointer over the text (worst sheen, and for CHAMPION and LEGEND the diffraction foil centred on the
  text): the number ≥ 3:1 against the shirt under it; stat values,
  name lines and the tier word ≥ 4.5:1 against the plate; stat labels, serial and season ≥ 4.5:1; the
  card's outer edge ≥ 3:1 against the page in both themes.
- No element escapes 390 px (rectangles, not `scrollWidth`); the card never overflows its column at
  320 px either.
- Arabic: layout mirrored (tab and rail at the right, capsule and the cut corner at the left, text
  right-aligned, stats CAP first at the right); digits Western and LTR; LASTREET isolated (`<bdi
dir="ltr">` or LRI/PDI) and set in the Latin face, computed `letter-spacing` 0 on every Arabic run.
- **The number inside the shirt** (rev. 3): for every fixture, OVR 1–99 and « — », the painted ink of
  the `[data-mc="ovr"]` group (with its outlines) lies inside the chest box (jersey space x 336–664,
  y 476–796; card space x 316.3–683.7, y 447.1–805.5) and inside the shirt path, measured from pixels
  in Chromium and asserted in unit tests from the ink metrics; on tokens inside their transformed
  boxes (plan §7).
- **The jersey's dimensions** (rev. 3): `getBBox` of the shirt in jersey space is 190, 300, 810, 899;
  length ÷ pit-to-pit 1.40–1.50 and sleeve span ÷ length 0.95–1.10 (unit test); a visible hem band
  and stitch line, sleeves with cuffs, the V collar and the inside of the back.
- **Shield and silhouette** (rev. 3): the outline path is byte-identical to revision 2 (tab and cut
  corner); the art window is the shield path of plan §3.2; the shield band and the outer edge are
  metal (gradient strokes), visible in the close-up crops.
- **Clutter** (rev. 3): none of these elements exists in the markup of any tier: tubes, rivets, season
  stamp, guilloche, micro-print, the tab's captions, glitch bars, pixel rain, ribbons, sparkles, the
  holographic seal, the diffraction grid (unit test by class and by count); drawn elements per full
  card ≤ 125.
- **Tier treatments** (rev. 3): each tier's honeycomb mode, floodlight count, cage (LASTREET only),
  pool (STADE only), cells (PRO only) and foil (CHAMPION, LEGEND only) as plan §5.3–5.4 (unit test); a
  close-up crop per tier in the after set.
- **Small sizes** (rev. 3): at 80, 64, 48 and 32 px every token shows the number (none on the 24
  mini), the tier's metal edge and the jersey; no text other than the number, no pattern, mask or
  filter in a token's markup (unit test); at 32 px a two-digit number is ≥ 7 CSS px tall (measured
  7.4–8.9 in the mock).
- **Detail and crispness** (rev. 3): zoomed crops at DPR 2 and 3 of a PRO and a LEGEND card, at rest
  and mid-tilt, show the honeycomb emboss, the grain, the shirt's mesh, folds, seams and hem, and the
  metal edges without blur; the card markup contains no `<image>`, no raster data and no
  `feTurbulence`; no `will-change` at rest.
- **Holographic items** (rev. 3): present on CHAMPION and LEGEND (honeycomb foil, edge / band /
  plaque-rim foil, glints, diffraction), absent on every other tier (unit test and DOM query);
  LEGEND's foil opacities and glint count exceed CHAMPION's; the diffraction never covers the number
  or the plate's text (its box ends at 69 % of the card height and its mask has a hole over the
  chest; contrast with the pointer over the number and over the name meets the floors); under reduced
  motion both stay visibly iridescent (screenshot).
- **Depth**: on every tier the full card has five layers and seven rims with distinct `translateZ`
  and `transform-style: preserve-3d` on the tilt element (computed styles); no `filter`, `opacity`,
  `clip-path` or `overflow` that flattens 3D on its ancestors; a pointer sweep moves `--mc-ax`/`--mc-ay`
  and the contact shadow; screenshots at rest show the lean, the rim and the shadow, with motion and
  with reduced motion.
- Long names (`longNameLatin`, a 24-character single word, `arabicName`) fit their lines without
  clipping or overlap, measured from text rectangles.

**Functional**

- Every fixture draws in both languages and themes with no console error or failed request
  (`observePage`).
- At t = 0 of every beat, the `[data-mc="ovr"]` element has opacity 1 and `elementFromPoint` at its
  centre returns it or a descendant (the foil and tilt layers have `pointer-events: none`).
- Reduced motion: `document.getAnimations()` is empty after load on every Gradins screen, the card does
  not tilt, the static sheen shows.
- Every beat's measured length ≤ 600 ms (`renderer.beatMs`; `getAnimations()` filtered to beat names, the idle float excluded), and the tests assert no animated group
  contains `data-mc="ovr"`, the serial or a `<text>`.
- No user-visible « HOMA » or «حومة» anywhere: `rg -n "HOMA|حومة"` over `src/i18n`, rendered
  `innerText` of every screen and the share picture's text runs in both languages finds none.
- `rg -in sorare src public` finds nothing.
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run build`,
  `bun scripts/qa/i18n-gate.ts`, `bun scripts/qa/manager-card-fixture-gate.ts`,
  `bun scripts/qa/manager-card-off-bundle-gate.ts`, and Playwright `tests/e2e/gradins.e2e.ts` (preview)
  and `tests/e2e/gradins-off.e2e.ts` pass; the switch-off before/after comparison of Home, Fantasy,
  Pépites and the bar is 0.0% different.
- Performance recorded: `full()` ≤ 25 ms, `token()` ≤ 3 ms, the renderer chunk ≤ 60 kB gzip, G1
  data-to-`data-mc-ready` ≤ 400 ms at CPU × 4; tilt keeps 60 fps on a mid laptop (no long task
  > 50 ms while moving).
- The Impeccable detector's findings on the changed files fixed or listed with a reason.
- Draft pull request only. No merge, publish, migration, Edge Function or database write without the
  owner.
