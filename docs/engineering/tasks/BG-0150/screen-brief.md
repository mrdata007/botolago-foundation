# BG-0150 — Directional icons point the reading way in Arabic

Screen brief, written before any interface change (AGENTS.md, "Screen work").
Branch `claude/rtl-icon-mirroring`, cut from `origin/main` at `a6fac90`.

The owner approved mirroring directional icons in Arabic following Material's
bidirectionality guidance, Google's icon mirror list and Apple's HIG "Right to
left" page. Research with the full icon inventory: every icon the app imports
from lucide-react was rendered and classified.

## What was inspected

- `src/styles.css:757-772`: four unlayered rules flip `.lucide-chevron-right`,
  `.lucide-chevron-left`, `.lucide-arrow-right` and `.lucide-arrow-left` with
  `transform: scaleX(-1)` under `html[dir="rtl"]`. Nothing else mirrors.
- Six icons also carry a manual flip that composes with that rule and turns the
  icon back, so in Arabic they point the French way today:
  - `rtl:-scale-x-100` on the Pépites "classement complet" chevron
    (`PepitesHome.tsx:158`), the two Pépites ranking back links
    (`PepitesRanking.tsx:152`, `:224`), the Pépites player back link
    (`PepitesPlayerPage.tsx:285`) and the Home deadline strip chevron
    (`DeadlineStrip.tsx:60`);
  - `rtl:rotate-180` on the Prizes terms chevron (`PrizesPage.tsx:104`).

  Tailwind 4 emits these as the separate `scale` and `rotate` properties, which
  stack with `transform` instead of replacing it.

- `src/components/ui/calendar.tsx:29-30` rotates the day-picker chevrons in RTL
  as well. Nothing imports the component today, but it would double-flip the
  moment something did.
- Icons that show forward or backward movement, or draw lines of text, and do
  not mirror today: sign in (`LogIn`, 7 files), sign out (`LogOut`, profile),
  undo transfer (`Undo2`), trend (`TrendingUp`), the sort icons on the Fantasy
  players and fixtures lists, the help icon (`CircleHelp`, Arabic writes `؟`),
  the terms icon (`FileText`) and the News icon (`Newspaper`, bottom nav, Home,
  notifications).

## What must be preserved

- Every icon that is not directional stays exactly as drawn in both languages:
  clocks and timers, refresh/retry and the loading spinner, play, checkmarks,
  info and warning marks, search, pencils, slashed "off" icons, the swap and
  substitution arrows, share, the WhatsApp bubble and the language glyph.
- French renders exactly as before: no icon is flipped when `dir="ltr"`.
- The photo flips (`rtl:-scale-x-100` on the stadium images in `index.tsx`,
  `fantasy.profile.tsx`, `PageBackground.tsx`, `PhotoPageHeader.tsx`,
  `LandingPage.tsx`, `DateStrip.tsx`) and the Pépites rating chart flip
  (`PepitesPlayerPage.tsx:1135`) are not icons and stay.
- Icon size, colour, position, spacing and hover behaviour are unchanged; the
  only property that changes is the horizontal direction of the glyph.
- No copy, routing, data, Fantasy rule, scoring or gameweek logic changes. The
  brand identity is untouched.
- The rule stays unlayered with the same specificity as today, so no Tailwind
  utility can override it by accident.

## Improvements being made

1. One rule in `src/styles.css` replaces the four, keyed on lucide's
   **canonical** class names (an alias such as `CircleHelp` renders
   `.lucide-circle-question-mark`, not `.lucide-circle-help`). It mirrors 13
   icon classes: chevron left/right, arrow left/right, log in, log out, undo-2,
   trending up, the two sort icons, circle question mark, file text and
   newspaper. Its comment lists what deliberately stays as drawn.
2. The six manual flips that cancel the rule are removed, so those chevrons
   point the reading way in Arabic: the Home deadline strip, the Prizes terms
   link, the Pépites "full ranking" link and the three Pépites back links.
3. The two latent RTL rotations in `ui/calendar.tsx` are removed.
4. Three contract tests in `src/components/ui-kit/ui-kit.contract.test.ts`
   pin the behaviour so it cannot drift back:
   - the selector list in `styles.css` equals a `MIRRORED` constant;
   - every mirrored lucide component still renders the class the rule targets
     (a lucide upgrade that renames an icon fails the test instead of silently
     un-mirroring it);
   - no lucide icon anywhere in `src/**/*.tsx` carries `rtl:-scale-x-100`,
     `rtl:rotate-180` or an `rtl:**:[…svg]:rotate…` class.

## Acceptance criteria (visual and functional)

- In Arabic (`dir="rtl"`), every rendered icon of the 13 mirrored classes has a
  net horizontal flip of exactly one: computed `transform` is
  `matrix(-1, 0, 0, 1, 0, 0)` and computed `scale` and `rotate` are `none`.
- In Arabic, every other rendered lucide icon has `transform`, `scale` and
  `rotate` all `none` (an icon that animates, such as the spinner, is reported
  separately rather than counted as flipped).
- In French, no lucide icon is flipped.
- Measured in the rendered pages on the dev server, per page, for `/`,
  `/fantasy`, `/fantasy/players`, `/fantasy/fixtures`, `/fantasy/rules`,
  `/profile`, `/prizes`, `/notifications`, `/news`, a match page, `/pepites`,
  `/pepites/classement`, a Pépites player page and `/auth/login`, before
  (untouched `main`) and after.
- Before/after screenshots of those routes in French and Arabic at 390 px and
  1440 px, light theme; a few icons cropped and compared side by side. Layout,
  spacing and colour do not move; only the mirrored glyphs change direction.
- `bun test src/components/ui-kit`, the full `bun test`, `bun run typecheck`,
  `bun run lint` (no new errors or warnings) and Prettier on the changed files
  all pass.
