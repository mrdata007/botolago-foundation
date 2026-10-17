# Sweep fixes A: brief

Date: 2026-10-16. Branch `work/sweep-fixes-a`, from `origin/main`. Source: the browser state sweep
(defects D1, D4, D5 and one stale test). Screen work under AGENTS.md "Screen work": this brief is
committed before any interface change. No database, staging or production is touched, and nothing
is pushed.

## What must be preserved

- Fantasy rules, scoring, the gameweek lifecycle and every other business rule: none of the files
  touched here contain any. Brand identity, colours, type and spacing do not change.
- The error screen keeps its look, its words and its two actions ("Réessayer", "Retour à
  l'accueil"). For an ordinary error (not a failed page file) "Réessayer" keeps doing exactly what
  it does today: `router.invalidate()` then `reset()`.
- The delete-account and sign-out dialogs keep their wording, their order of controls, the
  disabled red button until the box is ticked, and their behaviour on confirm.
- The "Comment les points sont calculés" link and the Matchs / Classement filter chips keep their
  painted size and position. Only the area that reacts to a tap grows.
- The search test keeps checking the same thing: name over kind, name at least 70% of the row.

## Specific improvements

1. **E5 / D1, retry after a page file fails.** A failed dynamic import is remembered by the
   browser, so re-running it never works. For a chunk-load failure only, "Réessayer" does one
   `window.location.reload()`. A flag in `sessionStorage` (inside try/catch) allows one automatic
   reload per tab per minute-long window, so a file that is truly gone cannot cause a reload loop;
   a second tap inside the window falls back to the normal path. If `sessionStorage` is blocked,
   the reload is still allowed once per page load (a reload resets that, so the guard is
   best effort there).
2. **G3 / SR9, focus after closing a dialog.** The delete-account dialog and the sign-out dialog
   (same file, same cause: opened from state, no trigger) hand focus back to the button that
   opened them through the `onCloseAutoFocus` prop that `UiModal` already has.
3. **K2, tap targets under 44 px.** The points link and the two chips that shrink below 44 px at
   320 px in Arabic ("الكل" on Matchs, "العام" on Classement) get a transparent hit area of at
   least 44 by 44 px behind them (a pseudo-element, in the same way as `ui.hitArea`), without
   changing the painted box.
4. **Repo e2e drift.** `tests/e2e/mobile-readability.e2e.ts` reads the option's two lines through
   `option > div > span` (the option now wraps a div). Same assertions.

## Acceptance criteria

Functional:

- A failed page file: after the network is back, one tap on "Réessayer" brings the page back
  (production build, 390x844, French and Arabic). A second failure inside the window does not
  reload again and the screen stays usable ("Retour à l'accueil" still works).
- Any other error: "Réessayer" does not reload the page.
- Delete dialog and sign-out dialog: after Annuler, the close cross or Escape,
  `document.activeElement` is the button that opened the dialog.
- Unit tests cover the chunk-error detection, the loop guard (including a throwing
  `sessionStorage`) and the retry decision.

Visual / measured (390x844 and 1440x900, French and Arabic RTL, plus 320x568 Arabic for the chips):

- Before / after screenshots of the touched screens look the same (the painted boxes are equal to
  the pixel).
- With `getBoundingClientRect` plus an `elementFromPoint` scan: the points link and the 320 px
  Arabic chips have an effective hit area of at least 44 by 44 px after the change; the painted
  box is unchanged.
- No new overflow: no element past the screen edge.

Checks:

- `bun run typecheck`, eslint and prettier on touched files, the unit tests of the touched areas,
  and the touched Playwright specs (`mobile-readability.e2e.ts`, plus the accessibility spec if it
  covers the dialogs) pass. Anything that cannot be run is said so in the report.
