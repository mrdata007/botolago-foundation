# BG-0155 — Home: the gameweek band's matches as a carousel — screen brief

Owner request, 2026-10-06, from a screenshot of Home on a real iPhone in the dark
theme: "You need to add a carousel to scroll to see the other matches, this one
shows only 1 match." The owner approved the screen work; merge and publish wait
for the owner's OK on the draft pull request. Branch `claude/home-match-carousel`,
from `main` at `af8b0a74`.

Inspected before writing this, on untouched `main` (the server on :5500, release
`af8b0a74`): `src/routes/index.tsx` (`HomeContent`, `GameweekBand`, the live block
under the band), `src/components/home/NextMatchPick.tsx`,
`src/components/common/MatchCard.tsx` (the `hero` variant),
`src/components/predictions/use-match-votes.ts`, `footballService.getHomeMatches`
and `api.football_home_matches` (`20260720095354_football_api_security.sql`),
`src/components/landing/LandingLive.tsx` (reads the same query), the two existing
snap carousels (`LatestCarousel`, `SwipeDeck`) and `MyClubsRow`,
`index.home-structure.test.ts`, `matches-home.option-a.test.ts`, `DESIGN.md`, and
the impeccable craft floor, layout and adapt references.

Measured on main (dark theme, read-only page loads):

- **Source.** Home asks `football_home_matches` for 3 fixtures (live first, then by
  kick-off; the function accepts 1 to 10). The band shows the first scheduled one
  as the pick card; "À venir" lists the same three. The round on screen (Journée 3)
  has more matches than the three the payload carries, so the band can never show
  them.
- **Live.** When a match is live the band carries no pick card; each live match is
  the split club-colour card under the band, the first overlapping its lower edge
  by 64px, the others stacked below it.
- **Geometry.** 390 wide: band 390×298 in French, 390×344 in Arabic; the pick card
  358×148 (French) and 358×155 (Arabic) with its three vote buttons. 1440 wide: the
  band is the centre column, 560px wide with 512px of content; the card 512×145.
- **The vote arrives late.** The server's HTML has no vote (the votes are read in
  the browser); "Qui va gagner ?" and its buttons then add about 81px to the band,
  pushing everything below it down.
- **CLS on a fresh load** (PerformanceObserver, buffered, new context, 2 runs each):
  French 390 0.0158 / 0.0158, French 1440 0.0383 / 0.0413; Arabic 390 0.6917 /
  0.6917, Arabic 1440 0.6284 / 0.6282. Arabic is dominated by the French first paint
  switching to Arabic after load, a known product gap outside this change.

## What must be preserved

- **The band.** The night photograph (the crowd photo while a match is live), the
  scrim to the bottom, the greeting and date line, "JOURNÉE n" in the display face,
  the Fantasy deadline pill, full-bleed on a phone and a rounded panel from `sm`,
  light text on the ink ground. No new colour, shadow or radius value.
- **The cards.** The pick card stays `NextMatchPick` (the 10% light panel, inverse
  crest discs, the kick-off in the score step with its weekday, "Qui va gagner ?"
  and three capsule buttons, the chosen one filled). A live match stays the split
  card, `MatchCard` `hero` (club-colour halves, the white score plate over the seam,
  the live pill, the minute that ticks, the red progress bar, the flipping score).
- **Every prediction rule.** The tap is still the match page's own "who wins" vote
  through `useMatchVotes`: the same record and cache, kept on the account when
  signed in and on the phone for a visitor, closed at kick-off, absent when the game
  is off or the match is not covered. Nothing about Pronostics score predictions
  changes, and no rule moves into the browser.
- **Live behaviour.** A live match is the split card, follows the score at the live
  strip's pace (`matchesRefetchInterval`), and leaves at full time; the band shows
  the crowd photo while any match is live. A single live match with nothing else to
  show still rises out of the band's lower edge, as today.
- **One match: as today** (no indicator, no buttons). **No match: as today** (the
  band with no card).
- **"À venir"** keeps exactly today's rows (the first three of the payload, the day
  chips, "Mes clubs", the reminder bells) and its "Tout voir". The landing page's
  "En ce moment" block, which reads the same query, keeps its rows too.
- **The page.** Section order and `index.home-structure.test.ts`; server rendering in
  French with a first client render equal to it (no hydration mismatch); no layout
  shift added; no new dependency; nothing moves on its own.
- **Arabic.** Logical properties only; directional icons mirrored by the BG-0150 rule
  alone (no new right-to-left flip); Latin digits.

## Improvements being made

1. **The hero becomes a carousel of the round's matches.** Every live match first,
   then the upcoming matches of the journée the band names, by kick-off. Same query
   as today: Home asks for 10 fixtures instead of 3 (the function's maximum; a round
   is 8), and "À venir" and the landing block keep the first three. When the journée
   has nothing live or left to play, the card is today's next match.
2. **Native scroll snapping, no library, no auto-advance.** On a phone each card is
   88% of the band's content width and the next card peeks at the inline end (about
   14% of a card), running to the screen edge so the swipe is obvious.
3. **Position indicator** under the cards: dots up to six cards, "2 / 8" beyond. It
   is presentational; each card's own label carries its position.
4. **Previous / next buttons** (the glass 44px icon button of photo bands) from `lg`,
   and on any fine pointer at narrower widths; disabled at the ends.
   **Desktop decision: one card with the next peeking, not as many as fit.** The
   band is the centre column, 512px of content at 1440; two cards would be 250px
   each, where the club names and the three vote labels wrap to two or three lines.
   At tablet width (688px) two cards would still be under the ~420px a card needs to
   keep its names and vote labels on one line. One card reads better at every width.
5. **Arabic.** The track follows `dir="rtl"`: the first match on the right, the next
   coming from the left; "previous" on the right with the chevron the BG-0150 rule
   mirrors; the dots fill from the right; "2 / 8" is three pieces in a row that
   follows the page direction.
6. **Accessibility.** A region with `aria-roledescription` "carrousel" / "عرض دوّار"
   and the label "Matchs de la journée" / "مباريات الجولة"; each card a group,
   described as "diapositive" / "شريحة" and labelled "Match 2 sur 8" /
   "المباراة 2 من 8", from the dictionaries. Tab walks a card's controls, then the
   next card's, and the focused card is brought to the start of the track. The
   buttons are real buttons with names. Under reduced motion every scroll the
   carousel makes is instant.
7. **No jumping.** Every card is as tall as the tallest (live, upcoming, voted), and a
   pick card's vote row sits at its foot so the rows line up. While a card's votes
   load, the vote row's space is held (the question invisible, three blank capsules),
   so the band no longer grows by ~81px after load; this also applies to the single
   card. Votes are read for the card in view and its neighbours, not for eight cards
   at once.
8. **Live in the carousel.** With two cards or more, live matches are split cards
   inside the band's foot (the band keeps the crowd photo) instead of stacking under
   it; several live matches swipe side by side.

## Acceptance criteria (visual and functional)

Visual (French and Arabic, 390 and 1440, light and dark; before = :5500, after =
this branch):

- Above the cards the band is unchanged: same photo, scrim, greeting, title, pill.
- 390: the first card starts at the 16px gutter; the next card shows 40 to 60px at
  the inline end; nothing in `main` outside the track crosses 0..390 (bounding
  rects, not `scrollWidth`).
- 1440: one card and the peek in the centre column; previous and next buttons, 44px,
  either side of the indicator; "previous" disabled on the first card.
- Every card in a carousel has the same height (measured, within 1px); swiping and
  voting do not change the track's height.
- Arabic: the first card's right edge at the gutter; the next card on the left; the
  previous button on the right with its chevron drawn mirrored.
- The active dot or the "n / N" text measures at least 3:1 (dot) and 4.5:1 (text)
  against the band, read from rasterised pixels.

Functional:

- Swipe and wheel snap to cards; next and previous move exactly one card; Tab brings
  the focused card into view; with reduced motion a button press lands in the same
  frame.
- Each card's vote acts on its own match only and is kept as today.
- One match: no region, no indicator, no buttons. No match: no card.
- SSR: the server's HTML holds the carousel with the first card current; no hydration
  warning in the console.
- CLS on a fresh load, measured the same way as above: French no worse than main and
  the vote's late jump gone; Arabic no worse than main.
- `bun run typecheck`, `bun run lint` (0 errors), the relevant tests then the full
  `bun test`, Prettier on the changed files, and the i18n gate at its baselines.
