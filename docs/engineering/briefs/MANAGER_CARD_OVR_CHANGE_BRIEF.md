# Brief: the rating change, animated once (Curva)

Approved screen work (AGENTS.md, "Screen work"). Owner decision, 2026-10-12:
"every time the rating goes up or down there's a notification saying your score
went up / went down, and it shows as an animation when the user opens the app
and checks the card." Written after reading the existing Curva home and card
page (`src/components/curva/CurvaHome.tsx`, `CurvaCardPage.tsx`,
`CardStage.tsx` (`CardStage`, `RatingLine`, `RatingChangeChip`),
`rating-change.ts`, `use-rating-change.ts`, `card-motion.css`,
`use-launch-gate.ts`), the card hooks (`src/services/use-manager-card.ts`) and
the contracts (`src/backend/manager-card/contracts.ts`), before the first
interface change.

The backend half is a separate pull request (`claude/manager-card-week-one`):
it adds `card.ovrChanges` to `api.get_my_manager_card` (zero or one pending
change: `{kind: "ovr_changed", key: "ovr_up:<gameweek id>" |
"ovr_down:<gameweek id>", direction, gameweekSeq, fromOvr, toOvr, delta,
fromTier, toTier, occurredAt}`) and lets `api.ack_manager_card_moments` take
those keys. This screen work reads the key when it is there and changes nothing
when it is not, so it can merge before or after the backend.

## What is there today

- Under the card, `RatingLine` prints « 62 OVR · STADE » and, when the history
  says the number moved at the latest stored journée, a chip « −2 ▼ »
  (`RatingChangeChip`, positive or negative colour, arrow as a second cue,
  spoken « note en baisse de 2 »). The chip pops once per round **on this
  phone** (`localStorage`, `botolago.card.rating_badge.v1.<user>`), after the
  card's entrance.
- The number itself never moves: the card and the rating line show the new
  number straight away.
- A provisional card already shows its number with the « Provisoire » pill
  (`ProvisionalBadge`) and the card drawing shows the number too.

## What must be preserved

- The card drawing (`eclat/`), its entrance, tilt, « Retourner », the back, the
  moments and the sharing sheet. The animation does not touch the drawing.
- The first screen's fit on a phone (`FIT_HEIGHT_WIDTH*`): nothing is added
  under the card, the rating line keeps its height (the chip already sits in it).
- The history chip as it is when there is no server change to tell (a phone
  that has not got the backend, a change already acknowledged).
- The browser never computes a rating: it shows the two numbers the server
  stored.
- Reduced motion: no movement at all.
- The provisional styling: the « Provisoire » pill beside the number.

## Improvements (exactly these)

1. **The number counts.** When the card read carries a pending change, the
   rating line's number starts at the old value and counts to the new one
   (Motion, about a second, eased out), after the card's entrance has landed.
2. **A short glow.** Behind the card, a soft halo in the positive colour for a
   rise, in a soft negative colour for a fall, fades in while the number counts
   and fades out after. It is a separate layer behind the card (opacity only),
   not a filter on the card, so the card's 3D tilt is untouched.
3. **The chip tells the server's change.** The chip shows the change's own
   delta (« +4 ▲ » / « −3 ▼ ») and pops as the number lands.
4. **Once, everywhere.** When the count ends (or at once under reduced motion),
   the change is acknowledged through the existing acknowledgement call
   (`useAckMoments`, optimistic: removed from the cached card, written to this
   phone, retried on the next read if the call fails). The server keeps it, so
   it does not replay on this phone or on another one.
5. **Reduced motion:** the final number and the chip, no count, no glow, no pop;
   the change is still acknowledged.

## Acceptance criteria

Visual

- 390 x 844 and 1280 x 800, French and Arabic (right to left): the rating line
  and chip stay on one line under the card; no horizontal overflow (element
  rectangles inside the viewport, measured, not `scrollWidth`); the chip keeps
  « +4 ▲ » left to right in Arabic.
- During the count the halo is visible behind the card and ends transparent;
  rise green (`--ui-positive`), fall soft red (`--ui-negative`).
- A provisional card shows the number and the « Provisoire » pill.

Functional

- With a pending change: the number shown goes from `fromOvr` to `toOvr` and
  ends at the card's number; the acknowledgement is sent once with the change's
  key; the cached card no longer lists it.
- Without `ovrChanges` (older backend) or with an empty list: exactly today's
  behaviour.
- A change whose `toOvr` is not the card's number, or a new season showing last
  season's number, is ignored (and not acknowledged).
- Reduced motion: no count, final number at once, chip without pop,
  acknowledgement still sent.
- French and Arabic words exist for everything new (the spoken chip already has
  them).

Evidence

- Model tests (`ovr-change.test.ts`), server-rendered French and Arabic tests,
  the existing Curva tests, typecheck, lint, Prettier.
- Screenshots from a development-only sample route
  (`/dev/manager-card-ovr-change-sample`, same guard as
  `/dev/manager-card-sample`), at most eight compressed JPEGs next to this brief
  in `manager-card-ovr-change/`, with the overflow measurements.
