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
2. **No photo: the shirt without the player.** The art window holds a club-coloured shirt panel with a
   V collar in the club's second colour, and on it the rating set as a giant shirt number, over a
   generated field of light ribbons and glitch bars in the tier's colour, unique to each card (seeded
   by its serial) and stable.
3. **A six-step foil ladder** (base, LASTREET, STADE, PRO, CHAMPION, LEGEND): unfoiled graphite, steel,
   amber, red, ice blue, violet with a prismatic foil, foil intensity rising with the tier.
4. **Light that follows the hand.** On a mouse or pen, the card tilts up to 7°/9° and a sheen and a
   holographic layer follow the pointer; at rest and under reduced motion a fixed sheen.
5. **Beats in the card's own material** (all ≤ 600 ms, the number never touched): tubes ignite and a
   sheen crosses (`make`), a mark lights (`tick`), the field kindles under the number (`first`), the
   foil sweeps in from the foot (`tier`), the prism crosses (`legend`), the capsule lights (`founder`),
   a seal line runs across the plate (`castoff`).
6. **Tokens that read as the same card** at 44–80 px, and minis at 24–32 px that keep its silhouette,
   colour and number.
7. **The tier label LASTREET** for the lowest tier, in French and Arabic, isolated as a Latin run in
   Arabic.
8. **The Écharpe direction removed** (code, styles, tests, the stage's rail); history keeps it.

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
- Contrast from pixels at stage size (240 and 264 px wide), light and dark, at rest **and** with the
  pointer over the text (worst sheen): the number ≥ 3:1 against the shirt panel under it; stat values,
  name lines and the tier word ≥ 4.5:1 against the plate; stat labels, serial and season ≥ 4.5:1; the
  card's outer edge ≥ 3:1 against the page in both themes.
- No element escapes 390 px (rectangles, not `scrollWidth`); the card never overflows its column at
  320 px either.
- Arabic: layout mirrored (tab and rail at the right, capsule and the cut corner at the left, text
  right-aligned, stats CAP first at the right); digits Western and LTR; LASTREET isolated (`<bdi
dir="ltr">` or LRI/PDI) and set in the Latin face, computed `letter-spacing` 0 on every Arabic run.
- Long names (`longNameLatin`, a 24-character single word, `arabicName`) fit their lines without
  clipping or overlap, measured from text rectangles.

**Functional**

- Every fixture draws in both languages and themes with no console error or failed request
  (`observePage`).
- At t = 0 of every beat, the `[data-mc="ovr"]` element has opacity 1 and `elementFromPoint` at its
  centre returns it or a descendant (the foil and tilt layers have `pointer-events: none`).
- Reduced motion: `document.getAnimations()` is empty after load on every Gradins screen, the card does
  not tilt, the static sheen shows.
- Every beat's measured length ≤ 600 ms (`renderer.beatMs`), and the tests assert no animated group
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
