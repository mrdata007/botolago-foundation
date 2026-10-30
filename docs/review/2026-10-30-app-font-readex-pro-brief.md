# App font: Readex Pro (Premier League Sans look) — brief

Approved by the owner on 2026-10-30: "change the font of the whole app",
replicating Premier League Sans. Premier League Sans is proprietary and is not
copied. The owner compared three free lookalikes on real BotolaGO screens
(Outfit, Readex Pro, Plus Jakarta Sans) and chose **Readex Pro** for French
and Arabic alike.

## What must be preserved

- Every screen's layout, colours, spacing, sizes, copy and behaviour. Only the
  typeface changes.
- Arabic support and right-to-left layout.
- Figures that line up in columns (tables, stats, prices, ranks).
- The Manager Card's own designed faces (Changa, Manrope, Noto Sans Arabic,
  Instrument Serif and the autograph faces), on screen and in its share
  picture, because its text is fitted with measured metrics.
- Business logic: none touched.

## Improvements made

- `src/fonts.css`: Readex Pro (Latin, Latin Extended, Arabic; variable
  160–700), a metric-matched local fallback ("Readex Pro Fallback") so text
  does not jump when the font arrives, and "BotolaGO Figures" — Readex Pro's
  digits at one width, because Readex Pro has no tabular figures.
- `src/styles.css`: `--font-sans`, `--font-arabic`, `--ui-font-body` and both
  `--ui-font-display` values now lead with Readex Pro. Body stacks lead with
  "BotolaGO Figures"; the display face does not, so standalone scores keep
  proportional digits.
- `src/routes/__root.tsx`: preloads Readex Pro Latin instead of Manrope and
  Changa (one font request instead of two on first paint).
- Share pictures (Pépites, Fantasy recap, trophies, the Manager Card picture's
  own captions) and the BotolaGO+ briefing draw in Readex Pro.
- Docs: `DESIGN_SYSTEM_V2.md` §2.1a and `public/fonts/README.md`.

## Acceptance criteria

- Computed font of body, headings, table cells and buttons is "BotolaGO
  Figures"/"Readex Pro" in French and Arabic (measured with Playwright on `/`,
  `/matches`, `/fantasy`, `/news`; Readex Pro and BotolaGO Figures load).
- No new clipping or horizontal overflow at 320px and 390px, French and
  Arabic, on `/`, `/matches`, `/fantasy`, `/news`, `/curva` (measured
  before/after: identical; the only `scrollWidth > clientWidth` leaves are the
  1px screen-reader-only labels, present before as well).
- `bun test src`: all pass except the Ramadan-clock scheduling test, which
  fails identically on the base commit (unrelated).
- `tsc --noEmit` clean; ESLint clean on changed files.
- Known trade-offs: Readex Pro's heaviest weight is 700, so text that asked for
  800/900 is a touch lighter; Readex Pro is a little wider, so a few Arabic
  lines wrap one line sooner.
