# Club notification emails — implementation brief

The owner selected **Club for all eight notification emails** on 20 October 2026.
This extends the five-direction review on this branch into production rendering.

## Preserve

Keep subjects, preheaders, plain text, greetings, factual content, fixture/day
grouping, favorite-club emphasis, scores (including zero/negative values), ranks,
confirmed deadlines, timezones and all CTA, preferences and unsubscribe targets.
Keep input validation, trusted Fantasy readiness guards, consent and dispatch
behavior intact. No migration, sending, or delivery-setting change is needed.

## Improvements

Apply the selected Club layout consistently to the eight generic templates and
the three trusted automated Fantasy moments: official white PNG wordmark on navy,
white reading area, cyan score/deadline panels and full-width rounded mint/cyan
actions with a solid-color fallback. Share a pure table-based HTML shell, with
inline styling, accessible image fallback text, and French/Arabic typography.
Preserve the existing content model and render it directly; browser extraction
remains a preview tool only. Prevent French punctuation being stranded on a line.

## Acceptance and evidence

Capture fresh before/after renders for all eight types in both languages and
the trusted Fantasy variants at 320/390/1280px. Check element and text bounds,
images, primary action target/height, RTL, ordered content and link preservation
against the existing render output. Check inline-only and images-blocked fallback.
Run existing renderer/dispatch tests, meaningful branding safety checks,
typecheck, scoped lint/format and committed-secret checks. Update draft PR 548
with implementation/evidence; merging and deployment await owner release approval.
