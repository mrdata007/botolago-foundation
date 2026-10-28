# More life: seven screens the owner flagged as pale (screen brief)

Owner feedback on the 2026-10-28 screen review (comment threads on the review
gallery): the Curva ranking "is too pale, it needs more life", the Fantasy
profile "needs more life as well", the Fantasy rules should be "more animated
and full of life", the Top players should "use gradients for the boxes", and
the Fantasy rankings, the Players list and the Clubs page need "more life"
too. Branch `claude/screens-more-life`.

Scope:

- `/curva/classement`: `src/components/curva-ranking/RankingView.tsx` and
  `ranking-motion.css`.
- `/fantasy/profile`: `src/routes/fantasy.profile.tsx` (season tab).
- `/fantasy/rules`: `src/routes/fantasy.rules.tsx`.
- `/fantasy/top-players`: `src/routes/fantasy.top-players.tsx`.
- `/fantasy/rankings`: `src/routes/fantasy.rankings.tsx` and, where only this
  screen uses it, `MyRankCard`. Shared list components change only in ways
  that keep the other screens using them as they are.
- `/fantasy/players`: `src/routes/fantasy.players.tsx` (the list screen).
- `/clubs`: `src/routes/clubs.index.tsx` and the components only it uses.

## What must be preserved

- Every figure, rule and business behaviour on these screens: the ranking
  order and ties (`ranking.ts`), the rated / unrated / own-outside split, the
  league chips and the Ma ligue / Tous switch; the profile's values, chip
  states (`chipDisplayState`) and the chip information sheets; every rule,
  number and the points table on the rules page. No copy is reworded except
  where a new label is added to both dictionaries.
- The brand: navy ink, the spring-to-sky action gradient, the display face,
  the tier names and colours of the Manager Card.
- French and Arabic (RTL), tap targets of at least 44px, light and dark theme,
  the existing data-testids the tests rely on.
- The calm-motion rule from `docs/engineering/MOTION_CALM_SCREENS.md`: nothing
  starts invisible. Any new motion starts from a visible resting state, uses
  transform/opacity only, and is switched off under
  `prefers-reduced-motion: reduce`.

## Improvements

1. **Curva ranking.** A dark stadium-style band opens the list with a podium
   of the top three (rank 1 raised in the centre, 2 and 3 either side), each
   showing name, tier and OVR in a token coloured by tier. Ranks 1-3 in the
   list carry gold / silver / bronze badges. Each row's OVR sits in a tier-
   coloured block, the four statistics get small bars, and the reader's own
   row is tinted with the action gradient rather than a grey wash.
2. **Fantasy profile.** The season overview opens with a coloured hero (team
   name, total points and overall rank large on the header gradient), the
   other figures as a grid of stat tiles, and the four chips as coloured
   cards, each with its own icon and state, instead of a grey list with
   outlined "JOUER" buttons.
3. **Fantasy rules.** A coloured hero over the illustration, the key figures
   as bright tiles, each rule section with its own accent colour and icon
   badge, the points table with coloured positive / negative values, and a
   light, one-off rise of the sections as they scroll into view (from a
   visible state, never from blank).

4. **Top players.** The player-of-the-week card and the #2-#5 boxes on
   brand gradients (mint-to-sky, navy, and the club colour where the card
   already uses it), the #2 and #3 medals in silver and bronze, the four
   headline figures as gradient tiles, and the points comparison bars as
   gradients.
5. **Fantasy rankings.** "Mon classement" on the header gradient with the
   rank large, the reader's row in the list tinted with the action gradient,
   the top three ranks with gold / silver / bronze badges, and coloured
   up / down movement pills.
6. **Players list.** Position filter chips in their position colours, each
   row's price and points in a gradient block, a club-colour edge kept and
   strengthened, the add button on the action gradient, and the injured flag
   as a bright pill.
7. **Clubs.** Each club tile on a gradient of that club's own colours (the
   club colours already in the data, with a readable text colour checked on
   each), crest raised on the tile.

## Acceptance criteria

- Visual: each screen reads as clearly more colourful than the review
  screenshots at 390px and at 1440px, in light and dark theme, with text
  contrast of at least 4.5:1 measured on the rasterised page.
- Functional: same data, same order, same links and actions as before; the
  existing tests for these screens pass (`RankingView.render.test.tsx`,
  `ranking.test.ts`, `fantasy-rules.ssr.test.tsx`,
  `fantasy-rules.ar.ssr.test.tsx`, `fantasy-rankings-account.test.ts`), plus typecheck and lint.
- French and Arabic screenshots, Arabic laid out right to left with the
  podium and gradients mirrored correctly.
- Before / after screenshots added to the review gallery for the owner.
