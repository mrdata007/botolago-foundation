# BotolaGO+ offer, step 2: « Votre saison » and « Détail du duel »

Screen-work brief (AGENTS.md, "Screen work"). Written before any interface change, on branch
`claude/plus-step2-analytics`. Copy it into the draft pull request description.

Step 2 of the offer showed one bar chart and a rivalry strip behind « Voir le détail ». The owner
rejected it: not informative enough, not analytical enough. It is the teaser for the paid career
detail and the detailed duels, so it has to read like a real analytics screen while staying
readable on a phone in a few seconds. The approved design is variant 6 of the design round
(variants 1, 2, 3 and 5 combined, four pill tabs per screen, animated), with the owner's
follow-up: less text, a more premium look.

## What must be preserved

- The offer frame: top bar (back, four-segment progress, close), the logo, « Voir les prix », the
  sticky « Choisir mon pass », the order of the four steps, steps 1, 3 and 4 and everything else in
  the offer. Swipe and arrow-key navigation between steps keeps working.
- The « Exemple » marking: the screens still say plainly that the figures are an example.
- The logo is the only way the product name appears (`PlusLogo`, never typed text).
- French in the « vous » register; Arabic with the same meaning; Western digits in both.
- Business logic: nothing here reads or changes Fantasy rules, scoring, the gameweek lifecycle, or
  any database. No migration, no backend call. The data stays example data (`plus-season-data.ts`)
  until lane C serves the real reads.
- Brand identity and the existing `--po-*` tokens (navy surface, mint accent, sky secondary,
  Changa display, Manrope body).
- Existing tests: dictionary parity, banned words, « vous » register, the logo and paywall tests.

## What changes

1. **« Votre saison »** with four pill tabs: Résumé, Points, Décisions, Note.
   - Résumé: the headline gap to the league, the trio league / you / best, four tiles against the
     league (points per journée, best journée, captain, net transfers), and the way into the duel.
   - Points: cumulative points against the league, points per journée against the league average
     with the best journée picked out, where the points come from (starters + captain − penalties),
     a season balance table, and a journée-by-journée ledger with the rank after each.
   - Décisions: captain (points kept and left on the table), transfers (net per journée, best and
     worst), consistency (gap to the league per journée).
   - Note: the overall rating (OVR) over the journées against the league, the four ratings with the
     league mark, rank and trend, strengths and what to work on, and how the OVR is built.
2. **« Détail du duel »**, opened from the season screen (« Voir le duel »), with a header shared by
   its four tabs (the two managers, journées won, a proportion bar, the lead in points) and tabs
   Course, Comparaison, Décisions, Notes.
   - Course: the cumulative race, the per-journée gap as bars only, and « Où le duel a basculé »
     with the cumulative lead. One change against the design mock: the cumulative-lead line appears
     once (in « Où le duel a basculé »), not also over the per-journée bars.
   - Comparaison: mirrored rows, you on one side and Sami on the other, in four groups.
   - Décisions: paired bars for points and for decisions, and the categories won.
   - Notes: the ratings face to face with rank on each side.
3. **Animations** (see the acceptance list).
4. **Owner feedback, applied throughout (less text, more premium).**
   - Each block carries one headline written as the finding, with the key number in it
     (« +41 points au-dessus de la ligue », « Vos capitaines : +18 vs la ligue »,
     « 26 points laissés par vos capitaines », « Vous menez Sami de 14 points »). No headline plus
     sub-text pairs, no « Ce que ça dit » or « Pourquoi vous menez » paragraphs, no takeaway
     sentence under a chart, no explanatory footnote, no legend sentence. Only short labels survive
     where a number would be ambiguous (axis ticks, one to three words on a tile, one or two word
     legends). The full sentences that were removed visually live in `aria-label`s.
   - « Exemple » becomes a small pill, not a dashed box with a sentence.
   - Fewer boxes: no card borders; surfaces with a very subtle top-to-bottom gradient and a 1px
     inner highlight at the top, 20px radius, 20 to 24px padding, 28 to 32px between blocks.
   - Hero numbers big (display font, 44 to 64px, tight, tabular). Mint is the accent, used
     sparingly: one soft glow behind the hero number and behind the active tab.
   - Charts: 2px lines, soft area fills fading to transparent, two or three faint grid lines,
     rounded bar tops, end dots with a soft halo.
   - Tabs: a frosted pill bar (translucent surface, backdrop blur), mint active pill with a faint glow.
   - Secondary text is quieter but stays at 4.5:1 or better; one display weight for headlines.

## Acceptance criteria

### Functional

- Both screens render every number from `plus-season-data.ts`; no figure is typed in the copy. A
  unit test re-asserts every invariant of the dataset: totals 616 / 602 / 575, wins 7 to 4, margins
  and the cumulative lead, averages, ranks, 521 + 111 − 16 = 616, 27 − 16 = 11, 26 points left,
  OVR = rounded mean of the four ratings = 72, contributions +5 +3 +1 −1 = +8 against a league at 64.
- The tab bar is an accessible tablist: `role="tablist"`, `role="tab"` with `aria-selected`,
  `aria-controls`, roving `tabindex`, Left/Right (mirrored in Arabic), Home and End; the panel is a
  `role="tabpanel"` labelled by its tab. Targets are 44px high. The bar is sticky at the top of the
  scrolling area, under the offer's top bar.
- The duel opens from the season screen and the offer's back button returns to the season screen
  (not to step 1) while the duel is open. Choosing the pass works from both.
- Reduced motion: no animation at all, every value is final at first paint. At rest, with motion on,
  every value equals the reduced-motion value exactly.
- Dictionary parity (French and Arabic keys and placeholders identical), the banned-words test and
  the « vous » test pass.

### Visual and measured (390 and 1280 wide, French and Arabic, every tab of both screens)

- No horizontal overflow, measured on element boxes (not only `scrollWidth`; the page sets
  `overflow-x` clipping).
- Smallest rendered text 12px or more (SVG drawn 1:1 with its viewBox on a phone).
- Text contrast of 4.5:1 or more, read from rasterised pixels (not from `oklch` strings).
- Charts are drawn to scale with a real axis; bars start at their baseline; labels do not collide.
- Before and after screenshots are kept.

### Right to left

- Text and layout mirror: tabs, the pill, tiles, tables, the two sides of the duel (you stay on the
  reading-start side), lists and headlines.
- **Time charts keep J.1 on the left**, in Arabic too. A time axis is not text; mirroring it would
  contradict every sports chart the reader knows. Axis numbers are Western digits. This is
  different from the previous step 2, which put the first journée on the right (flagged then for
  the Arabic reviewer); the reviewer should confirm the new rule.
- Numbers and signs are isolated (`bdi`, left to right) so « +41 » never becomes « 41+ ».
- The sliding tab pill moves along the reading direction.

### Motion (variant 6, NOTES.md)

Only `transform`, `opacity` and `stroke-dashoffset`; nothing loops; one pulse, once.

- Lines draw: `pathLength` 1, offset 1 to 0, 700ms ease-out. Dashed lines draw through a mask.
- Vertical bars grow from their baseline: `scaleY`, 420ms ease-out, `i × 35ms` stagger (captain's
  « left » segment +260ms).
- Fill bars (points stack, ratings, contributions, duel paired bars, proportion bar): `scaleX`,
  600ms ease-out, `i × 60ms`, from the start side (the rival's from the other side).
- Values, dots and end labels fade in over 300ms after 450ms.
- Counters count from 0 to the value in 600ms (cubic ease-out), tabular figures, exact text at the end.
- Tab change: the panel fades and slides up 8px in 200ms; the pill slides in 240ms on
  `cubic-bezier(.3,.7,.2,1)`.
- Duel header: the proportion bar fills on open; one pulse ring on the race's end point (scale 1 to
  2.8, opacity .7 to 0, 600ms, after 800ms), once.

## Not in scope

No change to steps 1, 3 or 4, to pricing, to the paywall, to checkout, to Fantasy, to any backend or
migration. No merge and no deploy: a draft pull request for the owner.
