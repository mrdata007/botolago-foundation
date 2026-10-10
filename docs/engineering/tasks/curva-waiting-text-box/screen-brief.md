# Curva: the waiting text in a box, and no « 2/2 » without a score

Owner report, 2026-10-10 (approved fix). Curva is live. A manager with 2 finished
journées (the rules' minimum is now 2) sees under their card « Carte en
formation · 2/2 » and no score. The card shows SEL 99 and CON 99, CAP and TRF
empty (—). « 2/2 » with no score reads as broken.

Branch `claude/curva-waiting-text-box`, from `main` at `8618138c`.

## Why there is no score

`supabase/migrations/20261008123200_manager_card_compute.sql`, the `rated` CTE:
OVR is the rounded mean of the non-null stats, and is null when fewer than 3 of
the 4 (CAP, SEL, TRF, CON) are non-null (« null under three »). With 2 journées
counted and 2 stats filled the server says `ratingState: "insufficient"`
(`ovrNullReason: "too_few_stats"`). The client already knows this state, but the
rating line under the card ignores it and prints the journée counter, which is
full.

## Inspected

`src/components/curva/CardStage.tsx` (`RatingLine`), `CurvaHome.tsx`,
`CurvaCardPage.tsx`, `ThisRoundBlock.tsx`, `curva-state.ts`, `people.ts`,
`LeagueRows.tsx`; `src/components/manager-card/copy.ts`,
`inline/HubCardBlock.tsx`, `inline/inline-model.ts`, `inline/RankCardToken.tsx`,
`inline/RecapCardLine.tsx`; `src/backend/manager-card/contracts.ts` and
`fixtures.ts` (`insufficient3`: 3/3 counted, CAP and SEL filled); the dictionary
keys `card.onboarding.m3.*`, `m5.row.forming`.

## What must be preserved

- The card drawing, its renderer and the share image (untouched; the club crest
  is changed concurrently on another branch in `manager-card/eclat/`).
- Scores, ratings, tiers, the rules and every business rule; the server's
  `ratingState` decides the state, the screen only words it.
- The rated line (« 84 OVR · PRO », « Provisoire », last season's label) exactly
  as it is.
- The forming words « Carte en formation · k/n » (only now inside a box).
- Real DOM text, figures in their own isolated runs, accurate screen-reader text.
- The rest of Curva, the Fantasy hub and the league rows, unchanged.

## Improvements

1. Under the card, while there is no score, the line becomes a text box (a
   bordered, filled, rounded callout from the ui-kit tokens: `ui.surface.card`,
   `ui.rule.all`, `ui.radius.card`), readable in light and dark, French and
   Arabic.
   - Forming (counted < minimum): « Carte en formation · 1/3 » in the box.
   - Insufficient (counted ≥ minimum, fewer than 3 stats): « Statistiques
     remplies · 2/4 » and « Votre note s'affiche dès que 3 statistiques sur 4
     sont remplies. » (Arabic in the dictionary). Never « 2/2 ».
2. The same insufficient state stops showing a full journée counter wherever
   it did: « Cette journée » on Curva, the Fantasy hub's card block, the
   rankings token, a league member's row.
3. The needed count (3) is one named constant beside the card copy, with a
   comment pointing at the SQL rule; the total (4) is the number of stat codes.

## Acceptance criteria

- Forming fixture (`?mc=forming1`): a box under the card with « Carte en
  formation · 1/3 ».
- Insufficient fixture (`?mc=insufficient3`): a box with « Statistiques
  remplies · 2/4 » and the sentence; no « 3/3 » anywhere under the card, in
  « Cette journée », or in the hub block.
- Rated fixture: rating line identical to before (no box).
- 390 px and desktop, French and Arabic (RTL), light and dark: no horizontal
  overflow (measured by bounding boxes, not `scrollWidth`), body text contrast
  ≥ 4.5:1 read from rasterised pixels.
- `bun run typecheck`, the curva and manager-card tests, the i18n gate, ESLint,
  Prettier and `bun run build` pass.
