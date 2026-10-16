# BotolaGO UX copy overhaul

French and Arabic copy now gives the useful rule, status or next action without repeating the screen heading. The pass removes redundant subtitles, corrects misleading feature promises and tightens football terminology while preserving business rules and the existing visual system.

The six requested specialists worked in independent read-only lanes; one implementation writer integrated their recommendations and the critical reviewer’s corrections. The pre-edit [brief](BRIEF.md) was committed before interface changes.

## Deliverables

| Deliverable | Evidence |
| --- | --- |
| A. Full screen coverage | [Every route and named state](COVERAGE.md), [tabs/dialogs/source inventory](SCREEN-INVENTORY.md), [machine-readable records](SCREEN-COVERAGE.json) |
| B. Bilingual before/after audit | [Final changes and reasons](COPY-AUDIT.md), all 3,258 original key pairs in [CSV](COPY-INVENTORY.csv) / [JSON](COPY-INVENTORY.json), [reconsidered recommendations](RECOMMENDATIONS-NOT-APPLIED.json) |
| C. Visual comparisons | [Matched FR/AR mobile/desktop gallery and measurements](VISUAL-COMPARISONS.md) |
| D. Implementation | [Changed files and remaining limits](IMPLEMENTATION.md), [validation results](VALIDATION.md), [editorial identity](EDITORIAL.md) |
| E. Independent verdict | [Final critical review](INDEPENDENT-REVIEW.md), original specialist findings under [specialists](specialists/) |

## Outcome and scope

216 translation keys changed, including 19 retired pairs; 364 language entries changed. Another 75 inline replacements improve source copy. The complete key ledger retains useful unchanged labels, instructions, timing and policy details rather than manufacturing edits for every screen.

All 98 route definitions are classified. Baseline evidence contains 435 accepted screenshots across 322 named-state/language/viewport combinations. These figures include layouts, redirects and repeated captures; they are not a claim of 98 fully inspected public workflows. The coverage report distinguishes full-image inspection, contact-sheet crops, captured-only views, redirects/error fallbacks and source-only states.

Visual and UI validation uses development mock services and synthetic local sessions. Real staff/MFA/provider flows and unavailable production states remain explicitly unverified. No production writes, merge or deployment occurred. This work is delivered for review in a draft pull request.

The full raw evidence is preserved outside the repository at `/workspace/botolago-ux-audit-evidence`; selected exact screenshot pairs are committed here for portable review. That folder and its archive include original manifests, capture harnesses and validation logs. Paths in the raw records identify local evidence; committed gallery links remain usable in GitHub.
