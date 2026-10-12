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
  the frame, the BOTOLA GO mark, the season badge, the fonts. The drawing's one
  change is the empty-statistic mark (three muted dots instead of a bare dash,
  see improvement 1); layout, fonts, labels and picture size are the same in the
  app, in the shared picture and on every other surface.
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

Revised after review (2026-10-12): the first version added a new panel under the
card, which made the page show the four statistics three times (the card, the
new panel, the existing "Ce que dit votre carte" panel). There is no new panel
now. The existing panel and the card's own strip are improved instead.

1. **Empty statistics explain themselves.**
   - On the card: a missing statistic is drawn as three small muted dots (an
     ellipsis that reads as "waiting"), not a bare dash. They are shapes, so no
     font is involved and the layout, frame and picture size are the same.
   - In the existing statistics panel ("Ce que dit votre carte"): where the
     number would go, an empty statistic shows a short reason made from its own
     `nullReason` (French and Arabic): "après J7" (only while the journée the
     card lists is still to come), "en attente", "pas de transfert",
     "{n} journées après le transfert", "semaines non comptées",
     "classement non définitif", "capitaine par défaut", in the muted tone. The
     existing longer explanation line stays. No number is invented.
2. **Clearer labels.** In that panel each label reads "CAP · Capitaine",
   "SEL · Titulaires", "TRF · Transferts", "CON · Régularité"; Arabic shows the
   word only (القائد، التشكيلة، الانتقالات، الثبات), because the card's label
   already is the word. The accessible text of each cell is its code, word and
   either the value or the reason. The labels on the card stay the codes.
3. **A richer card while the number is pending.** In the same panel, a row of
   facts the screen already holds, each only when known: Fantasy total points and
   rank in the league being shown (the standings "Les vôtres" already reads) and
   the journées counted (only once all needed journées are counted, so the
   forming counter is not repeated). It shows only while the card has no number
   and the season is running.

   Not available without a backend change (listed in the pull request, not
   built): the overall (all-managers) rank, the points of the latest journée
   next to the card, the club's full name with its crest, and a projected date
   for the first note.

The panel is lower on the page, so the first screen's fit is untouched. A card
with a number gets no facts row; its panel only gains the clearer labels. The
panel on the card page ("Votre carte") shares the cell and gets the same labels
and reasons.

New strings use the existing `card.*` pattern in `copy.ts` and both dictionaries
with identical keys; layout uses logical properties only; figures are isolated
for Arabic (`bdi dir="ltr"`).

## Acceptance criteria

Functional

- Two of four filled (the owner's case): the card shows two values and two
  waiting dots; the panel shows the two values and, for the others, a short
  reason; the "2/4" box and the 3-of-4 sentence are unchanged.
- Zero of four (a new manager): four short reasons, no dash anywhere in the
  panel; no facts row unless standings are loaded.
- Four of four with a rating: no facts row, no waiting dots; labels clearer.
- A card with `statsKnown` false (a new season showing last season's number) or
  a closed season shows no facts row.
- Facts: points and rank appear only when the user's own standing is loaded; a
  loading or failed read draws no placeholder and no zero.
- French and Arabic have the same keys and no empty value; the i18n gate passes;
  no AI-authorship wording anywhere.
- The panel is a link as before (the "Voir le détail" row keeps its 44 px target).

Visual

- At 390 px and 1280 px, in French and Arabic (`dir="rtl"`), no element extends
  beyond the viewport, measured from element bounding rects (not `scrollWidth`).
- The card, its box and the next-round line are at the same position as before
  at 390 x 844 (the first screen's fit is not disturbed); the card keeps its
  size, fonts and frame, and the waiting dots sit in the column of the missing
  statistic.
- Codes read as codes (heavy, label size), words at the meta size, reasons in the
  muted tone at the body size.
- Arabic is mirrored by logical properties; digits stay left to right.

Validation: `bun run typecheck`, `bun run lint`, `prettier --check` on changed
files and the relevant `bun test` paths pass; tests for French and Arabic with
`dir`; before/after screenshots of the owner's case (two of four) at both widths
in both languages (8 compressed JPEGs, with the measurement JSON), served by a
development-only sample route with invented data (`/dev/manager-card-sample`,
the same guard as the other `dev.*` routes). In the sample, the app's dev-only
mock-auth badge ("MODE DÉMO", `AuthModeBadge`, fixed in the viewport corner) is
hidden by the capture script only, so a full-page screenshot is legible; the
badge itself is pre-existing and untouched.
