# Next-match badges and captain marker on narrow plates: screen brief

Owner request, 2026-10-07: fix the two limits left by
[`ios-zoom-and-pitch-lines.md`](ios-zoom-and-pitch-lines.md) (PR #369).

1. On `/fantasy/team` and `/fantasy/points`, the next-match badge under a
   player ("RCA (D)", with the opponent's crest in live data) is wider than a
   narrow plate's figure band. Its end and rounded edge are cut off, and the
   band's ellipsis shows as a stray dot beside it.
2. The captain or vice marker ("C" / "V") sits 12px past the shirt's
   inline-end shoulder. On a 320–360px phone, in the last slot of a
   five-player row, that is past the plate and across the touchline.

Branch `claude/pitch-badges-marker`, from `main` at `3f6293d`.

## What was inspected

`FplPlayerCard.tsx` (the `RoleMarker` and the shirt wrapper it is placed
against), `useNextFixtures.tsx` (the badge: `px-1.5`, a 14px crest, `gap-1`,
the text), `UiPlayerPlate` in `primitives.tsx` (the figure band is
`block truncate px-1`), and the measurements from PR #369: five-row plates
are 48px at 320, 61px at 390, 63.5px at 402; the badge without a crest is
about 55px, with one about 73px.

## What must be preserved

- Wide plates look exactly as today: the marker's place on the shoulder, the
  badge with its crest, colours and text. "Wide" means the badge and marker
  already fit: every desktop plate.
- The badge keeps its difficulty colour, its rounded ends and its `title`.
- Arabic mirrors French; only logical properties are used.
- Every Fantasy rule and the plate design otherwise.

## Improvements being made

1. **The plate is a size container** (`@container` on `UiPlayerPlate`'s
   root), so its contents can ask how wide the plate is.
2. **Marker:** its offset becomes `max(-0.75rem, 50% - 50cqw)`: the usual 12px
   overhang while the plate has room, and on a narrow plate it slides in so
   its edge never passes the plate's (its ring hangs 2px, like the warning
   disc's). Plates sit 6px inside the touchline, so the marker always clears
   the line.
3. **Badge:** it never grows past its band (`max-w-full`), the crest drops
   out below an 80px plate, the padding tightens below 68px, and as a last
   resort the code text is cut with "…" inside the badge. No more cut-off
   badge end or stray dot.

## Acceptance criteria

- Chromium, `/fantasy/team` in 3-5-2 with the captain moved to the last slot
  of the five-row, 320–430px and 1280px, French and Arabic: the marker (with
  its ring) is at least 2px inside the touchline's inner edge everywhere.
- On the same pages, every badge's box fits inside its figure band (no
  overflow, no stray dot); with a crest (forced in the test) the crest shows
  on plates of 80px and wider.
- On desktop (84px plates) marker and badge are unchanged to within 0.5px.
  On phones the marker moves only where it would leave the plate, and the
  crest drops only where the badge with it was already cut off (a 76px
  plate's band holds 68px; the badge with a crest needs about 73px).
- `bun test`, `typecheck`, `lint`, prettier.
