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

- 390 x 844 and 1280 x 800, French and Arabic (right to left): on a phone the
  rating line and chip stay on one line under the card (in the 352 px desktop
  column the « Provisoire » pill may wrap under them, centred, as it already
  does with the history chip); no horizontal overflow (element
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

## Results (validation before review)

Screenshots in `manager-card-ovr-change/` (eight compressed JPEGs, 336 KB in
all). "Before" is the existing sample route (`/dev/manager-card-sample?case=full`,
no change to tell), taken before the first interface change. "After" is
`/dev/manager-card-ovr-change-sample`, 820 ms after the glow lit: a rise
58 → 62 (provisional) at 390 px in French and Arabic, a fall 66 → 63 at 1280 px
in French and Arabic. `measurements.json` holds every measurement:

- horizontal overflow from element rectangles: 0 px in all fourteen runs (before,
  rise and fall at 390 and 1280 in both languages, and reduced motion);
- the rating line is one line on a phone (33 px French, 39 px Arabic); at
  1280 px in French the « Provisoire » pill wraps under the rise's chip in the
  352 px column, as it does with the existing history chip;
- the count, sampled every 60 ms: rise 58 → 59 → 60 → 61 → 62 on both the rating
  line and the card's print, glow `up` while it counts, the chip « +4 ▲ »
  popping, then the glow off and one acknowledgement
  (`ovr_up:<gameweek id>`); fall 66 → 65 → 64 → 63 the same way in `down`;
- reduced motion: 62 and « +4 ▲ » at once, no glow, no pop, and the change
  acknowledged;
- the Arabic chip keeps « +4 ▲ » / « −3 ▼ » left to right (`bdi dir="ltr"`) and
  speaks « ارتفع التقييم بمقدار 4 ».

Tests: `src/components/curva/ovr-change.test.ts` (the model and the contract)
and `ovr-change.render.test.tsx` (server render in French and Arabic: the card's
own number, the provisional pill, no glow, no chip, nothing acknowledged; the
chip in both directions; the halo's tones), plus the existing Curva, Manager
Card, services and QA tests.
