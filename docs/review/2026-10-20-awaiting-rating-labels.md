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
