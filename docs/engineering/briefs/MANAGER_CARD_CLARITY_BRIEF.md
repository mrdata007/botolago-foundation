# Brief: Manager Card clarity (Curva home)

Approved screen work (AGENTS.md, "Screen work", approved by the owner on
2026-10-12). Written after reading the existing Curva home and the Manager Card
code (`src/components/curva/CurvaHome.tsx`, `CardStage.tsx` (`RatingLine`),
`StatTiles.tsx`, `curva-state.ts`, `src/components/manager-card/` (`copy.ts`,
`to-profile.ts`, `eclat/plate.ts`), the contracts in
`src/backend/manager-card/contracts.ts`) and before the first interface change.

No backend work: no migration, no script, no new RPC, no new query, nothing run
against any database. Everything shown comes from data the screen already holds.

## What the owner saw

On a phone, in French, for a team with two of the four statistics filled: the
card with a stat strip `CAP — | SEL 99 | TRF — | CON 99`, under it the box
"Statistiques remplies · 2/4 / Votre note s'affiche dès que 3 statistiques sur 4
sont remplies.", then "Depuis la J1 · WCA · 1 ligue" and "J4 · date limite
lun. 12 oct. à 18:30".

What the code says about it:

- The strip is part of the card's drawing (`eclat/plate.ts`, SVG). On a 296 px
  card its labels are about 9 px tall, and an empty value is a bare "—". Nothing
  beside the card says what CAP, SEL, TRF or CON mean, or why one is empty.
- The meaning of the codes is in the product plan
  (`docs/product/MANAGER_CARD_SECTION_PLAN.md`, `card.stat_long.*`, `m2.line2`,
  `gradins.guest.point.rating.body`): CAP is the captain choices, SEL the choice
  of the starting eleven, TRF the transfers, CON the regularity (French
  "régularité", Arabic "الثبات"). The product copy never says "constance"; this
  work uses "Régularité" so the card and the rest of the app use one word.
- The reason a statistic is empty already exists, per statistic, in the card
  data (`stats.<code>.nullReason`, six values) and is already written out in
  full on the "Ce que dit votre carte" tiles further down the page. It is not
  near the card.
- The first screen of the home is fitted to the window's height (`fitHeight`,
  the reserves in `CardStage.tsx`): what sits between the card and the
  next-round line is measured to the pixel. Anything added under the card there
  would shrink the card.

## What must be preserved

- The card's look and brand identity: the drawing (`eclat/`), the jersey art,
  the frame, the BOTOLA GO mark, the season badge, the fonts. The drawing is not
  edited, so the card stays identical in the app, in the shared picture and on
  every other surface.
- The flip / compare button ("Retourner"), the card's back, the entrance and the
  tilt, the moments, the Gradins and the sharing sheet.
- The 3-of-4 rule and its message ("Votre note s'affiche dès que 3 statistiques
  sur 4 sont remplies."), the "Statistiques remplies · k/4" box, the forming box
  and every calculation. The browser still never computes a rating; a missing
  value stays absent, never 0.
- The first screen's fit: card size, rating box, identity line and next-round
  line keep their measured positions (the `FIT_HEIGHT_WIDTH*` reserves are not
  touched).
- Existing tests' intent. Existing copy keys keep their text.

## Improvements (exactly these three)

1. **Empty statistics explain themselves.** Under the card, a compact strip of
   the four statistics. A statistic with a value shows the value. One without
   shows a short plain reason derived from the card's own `nullReason`
   (French and Arabic), for instance "après J7" when the card lists the
   rating journées, "aucun transfert", "en attente". A screen reader gets the
   full existing sentence (`card.reason.*`) for the same statistic. No number is
   ever invented.
2. **Clearer labels.** Each statistic in that strip shows its short code
   together with its word: Capitaine, Titulaires, Transferts, Régularité
   (Arabic: القائد، التشكيلة، الانتقالات، الثبات). The accessible name of each
   cell is the word plus its value or its reason, not the bare code.
3. **A richer card while the number is pending.** Under the strip, real facts
   the screen already receives, each shown only when known: the team's total
   Fantasy points and rank in the league being shown (the standings the page
   already reads for "Les vôtres"), and the journées counted. The club and the
   first journée are already in the identity line and stay there.

   Not available without a backend change (listed in the pull request, not
   built): the overall (all-managers) rank, the points of the latest journée
   next to the card, the club's full name with its crest in the strip, and a
   projected date for the first note.

Where it goes: in the stage column under the next-round line, so the first
screen's fit is untouched (it appears as the page scrolls on a phone, and in the
sticky column beside the card from 768 px). It shows only while the card has no
number of its own (`ovr` is null) and the season is not over. A card with a
number keeps "Ce que dit votre carte" as it is.

New strings use the existing `card.*` pattern in `copy.ts` and both dictionaries
with identical keys; layout uses logical properties only; figures are isolated
for Arabic (`bdi dir="ltr"`).

## Acceptance criteria

Functional

- Two of four filled (the owner's case): the strip shows the two values and, for
  the other two, a short reason from `nullReason`; the "2/4" box and the 3-of-4
  sentence are unchanged.
- Zero of four (a new manager): four short reasons, none is a bare dash, no
  number anywhere in the strip.
- Four of four with a rating: the strip and the facts are not drawn; the rating
  line is as before.
- A card with `statsKnown` false (a new season showing last season's number) or
  a closed season draws neither.
- Facts: points and rank appear only when the user's own standing row is loaded;
  a failed or loading read draws no placeholder and no zero.
- French and Arabic have the same keys and no empty value; the i18n gate passes;
  no AI-authorship wording anywhere.
- The strip is not interactive; if it ever becomes so, its targets are 44 px.

Visual

- At 390 px and 1280 px, in French and Arabic (`dir="rtl"`), no element extends
  beyond the viewport, measured from element bounding rects (not `scrollWidth`).
- The card, its box and the next-round line are at the same position as before
  at 390 x 844 (the first screen's fit is not disturbed).
- Codes read as codes (heavy, label size), words at the meta size or larger, the
  reasons in the muted tone but at least 12 px; contrast measured from rasterised
  sRGB in light and dark.
- Arabic is mirrored by logical properties; digits stay left to right.

Validation: `bun run typecheck`, `bun run lint`, `prettier --check` on changed
files and the relevant `bun test` paths pass; SSR tests for French and Arabic
with `dir`; before/after screenshots at both widths in both languages for
three cases (two of four, four of four rated, zero of four), served by a
development-only sample route with invented data
(`/dev/manager-card-sample`, the same guard as the other `dev.*` routes).
