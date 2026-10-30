# Brief: the whole app in Readex Pro (2026-10-30)

Approved by the owner on 2026-10-30: change the font of the whole app, in French and Arabic, to
Readex Pro (free, SIL Open Font License), for a cleaner, sportier look. The owner had asked for the
Premier League's own typeface; that face is the league's licensed property and is not copied or
imitated here. Readex Pro is an independent family with its own design.

## What must be preserved

- Every screen's layout, colours, spacing, icons, copy and business logic. Only the typeface changes.
- The Manager Card (the collectible card and its share picture) keeps Changa, Manrope and Noto Sans
  Arabic: its layout is fitted to their committed measurements (`eclat/metrics.ts`).
- French and Arabic stay equal: right-to-left layout, the Arabic leading and type steps.
- Self-hosting, fingerprinted assets and `font-display: swap`, with a size-matched stand-in so the
  page does not jump when the face arrives.

## The improvements

- One face, Readex Pro, for display (titles, team names, scores, tabs) and body, in both languages,
  replacing Changa, Manrope and Noto Sans Arabic in the app's stylesheet tokens.
- The share pictures (Prospects post and story, the Fantasy recap, BotolaGO+ trophies and rivals,
  the BotolaGO+ briefing) draw with Readex Pro too.
- Known trade-offs: Readex Pro tops out at weight 700 (titles declared at 800 render at 700); it has
  no tabular figures (numbers in a column align by the cell, not digit by digit); it has no minute
  prime (63′), which falls to the next face for that one glyph.

## Acceptance criteria

- Visual: the home, matches, standings and Fantasy screens render in Readex Pro in French and
  Arabic, on a 390px phone and a 1280px desktop, with before/after screenshots.
- Functional: `scripts/qa/layout-probe.mjs` reports no clipped or scrolled text on those screens
  that was not already there before the change.
- Tests: the unit suite passes apart from failures that also fail on `main`.
