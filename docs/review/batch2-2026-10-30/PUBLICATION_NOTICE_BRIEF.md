# Brief: "Points de la Journée N : samedi à 14h" notice

Screen work under AGENTS.md "Screen work". Written and committed before the
first interface edit. Plan: `docs/review/batch2-2026-10-29/PUBLISH_ALL_AT_ONCE_PLAN.md`
(on `claude/phase1-audit-log`, owner approved on 2026-10-29).

## What the screens look like today (inspected)

- `/fantasy/points` (`src/routes/fantasy.points.tsx`): a header with the team and
  the journée stepper, a navy strip with the journée's points, average and best,
  the pitch or list, and short grey notes (`ui.text.meta`, `ui.tone.muted`) such
  as "closed on provisional points". A journée with no result renders the squad
  with en-dash plates and "–" in the strip.
- `/fantasy/rankings` (`src/routes/fantasy.rankings.tsx`): tabs "Général" and
  "Journée", a table with a "En attente" cell while the journée's points are
  provisional (`gameweekPointsWaiting`).

## What must be preserved

- Everything about scoring, the pitch, the jerseys, the strip, the stepper, the
  tables and the brand. No new colour, font, radius or layout.
- The en-dash plates and "–" values while a journée has no points. The notice
  explains them; it does not replace them.
- French and Arabic (right to left) layout; times shown in Morocco time.
- Guest, mock and cloud modes behave as before. A journée that is not gated
  (Journée 5 and earlier) shows no notice.

## What changes

1. One grey sentence on the points screen, in the same style as the existing
   notes, under the stepper and above the strip, for the journée being viewed
   when it is waiting for its publication time:
   - FR: «Points de la Journée 6 : samedi 31 oct. à 14h»
   - AR: «نقاط الجولة 6 : السبت 31 أكتوبر على الساعة 14:00»
2. The same sentence on the rankings screen, above the table, for the oldest
   journée still waiting. It names the journée and the time, nothing else.
3. The sentence leaves by itself once the points are published (the screens
   already refetch every 30 s; the notice query refetches every 60 s while it
   shows).
4. Only design tokens already in `ui` are used (`ui.text.meta`, `ui.tone.muted`,
   `ui.space.gutter`). No new component.

## Acceptance criteria

Functional

- A journée that is waiting shows the sentence with the day and the hour in
  Morocco time (Africa/Casablanca), whatever the viewer's own time zone.
- If the ratings were not ready at the first slot, the sentence shows the next
  slot (the database moves `publishAt`).
- A published journée, a journée that is not gated, and a database without the
  feature show nothing and do not error.
- The sentence disappears without a reload after publication.

Visual

- At 320 px wide and on desktop, in French and in Arabic (dir="rtl"): the
  sentence wraps inside the gutter, no horizontal scroll, no overlap with the
  stepper or the strip; contrast of the muted tone is unchanged.
- Before and after screenshots at 320 px and desktop for FR and AR, for both
  screens.

Tests

- Unit tests for the French and Arabic wording and the Morocco-time formatting.
- Contract test: `publishAt` and `publicationHeld` parse, and a database that
  lacks them still parses.

## What was measured (30 Oct 2026)

Rankings screen, production bundle against a local stub backend that reports
Journée 6 as waiting for Saturday 31 Oct 14:00, headless Chromium 149 with the
viewer's clock set to New York (the sentence must still say Morocco time):

- `screenshots/rankings-before-*` (the bundle of `origin/main`) and
  `screenshots/rankings-after-*` (this branch): French and Arabic, 320 px and
  1280 px. `scrollWidth` equals `clientWidth` in all eight (320 = 320, 1280 =
  1280), `dir` is `ltr` in French and `rtl` in Arabic.
- The sentence reads «Points de la Journée 6 : samedi 31 oct. à 14h» and
  «نقاط الجولة 6: السبت، 31 أكتوبر على الساعة 14:00». At 320 px in Arabic it wraps
  to two lines, with the hour on the second; nothing overlaps.

Not measured: the points screen. It needs a signed-in manager with a team, which
the sandbox has no account for. It uses the same `PublicationNoticeLine`, right
under the journée stepper, so only its position differs; it has to be looked at
once with a real account (staging).
