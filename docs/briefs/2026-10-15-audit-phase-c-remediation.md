# Audit remediation, Phase C (screen brief)

Owner request, 2026-10-15: after Phase B was merged (pull request 490), begin
Phase C of the 2026-10-14 audit roadmap: premium UI/UX and localization
refinement. This brief covers every interface change in that work (AGENTS.md,
"Screen work").

Branch `claude/friendly-turing-ry5fcs`, with one short-lived lane branch per
topic merged into it. Nothing is merged to `main`, deployed or applied to a
database without the owner's approval. No production data, job or setting is
touched.

## What must be preserved

- Every Fantasy scoring rule, guard, deadline and the server's authority; the
  Phase A and Phase B fixes (see `docs/audits/`).
- The brand identity, design tokens and typography. No rebrand, no global type
  shrink, no new features.
- Gameplay and username rules: the username validator is NOT widened (only the
  message that describes it is corrected). Arabic correct today stays as it is.
- Genuinely weekly editions keep the word "semaine".
- Published copy never carries an AI-authorship notice.
- No database writes; migrations are not expected in this phase (a lane that
  thinks it needs one stops and reports).

## Decisions that are the owner's, not made here

- **MOB-01** the viewport cap that limits pinch zoom (an accessibility policy
  that also protects native-shell behaviour).
- **LOC-09** which Arabic name the Pépites sub-brand uses (`PRODUCT.md` leaves
  it unsettled).
- **VIS-003, VIS-004, VIS-005** desktop Fantasy layout, editorial imagery and the
  home fixture hierarchy: recommendations that need product input and image
  rights.
- A native Arabic reader signs off every new Arabic string before release.

## Improvements (finding IDs from the audit register)

| Lane | Findings                                    | Change                                                                                                                                                                                          |
| ---- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | FR-01, FR-02, FR-03, LOC-02, LOC-10, LOC-11 | Exact French and Arabic wording: non-participation reasons, round versus week, staff verb spellings, the username message matching its rule, the unsubscribe scope, small inconsistencies.      |
| C2   | LOC-03, LOC-04                              | Arabic plural forms for counts and transfer confirmations; one Arabic Fantasy glossary (transfers, form, availability, chips) used on every screen.                                             |
| C3   | LOC-06, LOC-07, LOC-08, LOC-05              | The profile language control says what it changes; dates follow the chosen language; Arabic article text keeps its font and upright emphasis; the first-paint question is evaluated in writing. |
| C4   | MOB-02, MOB-03, MOB-04, MOB-05              | Search results are exposed to assistive technology; carousel controls reach 44px; role descriptions are localized; a keyboard "skip to content" exists.                                         |
| C5   | VIS-001, SOL-04                             | The hub heading keeps the route name under tight space (if reproduced); the bare `/auth` address leads somewhere useful.                                                                        |

Not in this work: MOB-01, LOC-09, VIS-002 to VIS-005 (see above), PRO-05/06,
UX-011 and all Phase D items.

## Acceptance criteria

- French and Arabic copy exist for every new or changed string, with matching
  keys and placeholders in both dictionaries; Arabic follows the register's
  exact proposals unless a documented reason differs.
- Right-to-left: no new physical left/right styles; numbers, prices, scores,
  codes and alphabet fragments stay readable inside Arabic text (isolated).
- Mobile and desktop: no new overflow (measured by element bounds, not
  `scrollWidth`); every new or changed control keeps a 44px target.
- Each fixed finding has a regression test that fails on the old code and
  passes on the new, and the existing tests of the touched area still pass.
- Contrast and target sizes are measured on rendered output (rasterized sRGB,
  not parsed `oklch`), at 320, 390 and 1440px, light and dark, French and
  Arabic.
- `bun run typecheck`, the i18n gate (baselines must match what it measures),
  eslint and prettier on touched files pass.
- Anything that cannot be verified here (a real device, a screen reader, a
  native Arabic read) is reported as not run, never as passed.
