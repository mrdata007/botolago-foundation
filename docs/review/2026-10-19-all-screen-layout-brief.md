# Screen layout refinement — implementation brief

## Improved request

Optimize BotolaGO's existing screen layouts across phone, tablet and desktop,
using the product, design system and rendered application as the authorities.
Inventory all route families; fix demonstrated shared layout and interaction
defects; improve dense discovery screens where extra space improves scanning.
Preserve brand identity, French/Arabic parity, accessible navigation and every
business rule. Validate with before/after screenshots, bounding-box measurements,
keyboard and scrolling flows, relevant tests, type checking and a production
build. Push the reviewable result, merge and publish under the owner's existing
authorization, after successful checks.

## Preserve

- Existing components, tokens, club palettes, typography and content ordering.
- Fantasy rules, scoring, lifecycle, budgets, filters, pagination and data access.
- Phone navigation, safe-area clearance and intentionally swipeable chip rows.
- Reading widths for articles, help, legal text and account forms.
- Authorization boundaries: inspect admin through existing local samples; do not
  represent a redirected or protected route as verified privileged content.
- UI-kit and global token ownership; make screen-level changes only.

## Evidence and professional judgment

Primary sources are `PRODUCT.md`, `AGENTS.md`,
`docs/engineering/DESIGN_SYSTEM_V2.md`, the route/component source and the running
app with existing mock repositories. No database writes are needed.

The inventory found 98 route components, including wrappers, redirects, samples
and protected pages. A 45-scenario rendered survey is more useful than claiming
98 independently verified screens. Actual final paths are recorded in each
observation. The initial French desktop survey passed 43 scenarios; the landing
page has no main landmark and the standalone mapping sample intentionally lacks
its production shell. The latter is a test-context exception, not a product bug.

The Matches tab labels occupy the full 1440px viewport while the title and body
occupy 672px. Dense screens also inherit that reading width. At 200% root font
size the AppShell body and title use different width units and diverge. Transfer
scroll tests independently reproduce the Arabic tablet/desktop action button
ending at y=806 in a 700px viewport; all six tested picker flows fail to restore
focus after Escape.

Widening every page would harm readability and merely stretch rows. Prefer a
bounded data canvas and purposeful columns. Root-font enlargement is a stress
test, not proof of browser-zoom or WCAG compliance. Overflow-hidden/clip can hide
defects; inspect element rectangles, not just document scroll width. Mock data
proves layout and local interaction, not live-service correctness.

## Specific changes

1. Align AppShell header bands and content to the selected canvas, including
   enlarged root fonts; bound Matches tabs to the same canvas.
2. Give standings, club discovery and the news hub the existing wide canvas.
   Use four desktop club columns and editorial/news columns where content exists;
   retain independent loading, empty and error behavior.
3. Add an opt-in wide Fantasy frame for dense data screens and the Curva card/
   information composition. Use a desktop filter/results composition for players
   instead of widening a single stream. Keep pitch/team and prose screens compact.
4. Enable the existing non-scroll-container sticky frame for squad creation and
   transfers; restore picker focus to its connected opener on close.
5. Add a landing main landmark and keyboard bypass without visual rearrangement.

Admin, authentication, profile, prizes and other route families are included in
the survey. Change them only if direct evidence establishes an additional defect.

## Method and acceptance

- Record screenshots and geometry before editing; inspect the changed families
  in French and Arabic at 390px and 1440px, plus tablet/breakpoint stress cases.
- Afterward run all 45 scenarios in both languages at phone and desktop widths.
  Require visible content and expected direction; record redirects explicitly.
- Require title/tab/content canvas alignment (within 1px); no unintended escaped
  controls/headings. Intentional horizontal scrolling is measured separately.
- At 390/768/1440px and 700px height, transfer actions must remain within the
  viewport after scrolling. Opening the picker, pressing Escape and returning
  focus to Add must pass in both languages.
- Verify changed layouts in dark mode and with 200% root font enlargement.
  Check the landing skip link focuses content beyond its navigation.
- Preserve functional filtering, sorting and keyboard access on the player list.
- Run relevant existing unit/e2e tests, design-system contracts, typecheck and
  production build. Review the final diff for business-logic changes and run the
  React quality checklist after multi-component TSX edits.
- Commit representative before/after image evidence and a results report with
  measured improvements, exact coverage, limitations and any outstanding failures.

This brief is committed before interface edits, as required by `AGENTS.md`.
