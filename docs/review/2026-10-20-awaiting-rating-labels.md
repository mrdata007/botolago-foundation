# Awaiting-rating popup: verification

The approved behavior is a compact pending marker opening a popup with the
French/Arabic waiting message and loop. The pre-implementation contract is
in [the popup brief](2026-10-20-awaiting-rating-popup.md).

Verified on the dedicated local mock-data server at port 4347, using this
checkout and browser-only pending-rating fixtures. All eight combinations
passed: French/Arabic, 390/1280px, pitch/list. Each has three pending triggers
of at least 44px in both dimensions, with no nested buttons or browser errors.
The rating boxes stay compact. The animated loop appears only inside the
popup, alongside `En attente des notes` / `في انتظار التقييمات`.

Keyboard opening, trapped focus, Escape dismissal, the translated close
button and focus restoration passed in every combination. The loop animates
normally and stops under reduced motion. A local cache transition from
pending to ready closes the popup and removes the pending controls, checked
for each language and viewport. Arabic retains RTL. Earned points, genuine
zeroes and Not rated markers retain their existing behavior.

[Before/after, popup screenshots and measured browser checks](evidence/2026-10-20-awaiting-rating-labels/)
are committed alongside this report. Existing component and localization
suites: 23 tests passed. TypeScript, scoped ESLint, Prettier and whitespace
checks passed. This is a frontend presentation change; no database or
scoring operation was performed.
