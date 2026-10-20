# Awaiting-rating text

Owner request: replace the rating loop with visible French/Arabic wording.

Preserve: existing points, real zeroes, Not rated labels, partial points,
pending predicates, accessibility, BotolaGO styling and all scoring rules.

Change: replace only the shared pending-rating icon with readable text;
French `En attente des notes`, Arabic `في انتظار التقييمات`, selected by the
existing language setting. Fit the full wording inside player points boxes
and the points list, including narrow mobile layouts and Arabic RTL.

Acceptance: no spinner for pending ratings; no invented zero; earned points
remain visible. Capture before/after pitch and list views in French/Arabic
at mobile and desktop widths. Check text visibility, clipping and runtime
errors, and run the existing component, localization and type checks.

Verified on the dedicated local mock-data server at port 4347, using this
checkout and browser-only pending-rating fixtures. All eight after-change
combinations passed: French/Arabic, 390/1280px, pitch/list. Each view exposes
three pending labels and zero rating spinners, with no clipped label text,
offscreen paragraphs or browser errors. Arabic retains RTL. Missing points
stay blank while partial earned points and genuine zeroes remain visible.

[Before/after screenshots and measured browser checks](evidence/2026-10-20-awaiting-rating-labels/)
are committed alongside this report. Existing component and localization
suites: 23 tests passed. TypeScript, scoped ESLint, Prettier and whitespace
checks passed. This is a frontend presentation change; no database or
scoring operation was performed.
