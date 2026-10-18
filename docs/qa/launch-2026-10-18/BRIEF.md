# Launch QA repair brief — 18 October 2026

Authorized scope: five first-time-user browser personas, merge observed friction by affected persona count, repair once, rerun all five.

## Preserve

BotolaGO brand, existing design-system tokens and 44px touch floor, French and Arabic/RTL parity, public guest access, Fantasy rules and authoritative round availability, auth validation and consent requirements. No production database writes, deployment or merge.

## Specific improvements

1. Expose existing Terms and Privacy pages on the landing page before signup (skeptic's screenshot-backed finding).
2. Retain non-secret login/registration fields when visiting another page or using Back/Forward (breaker's screenshot-backed finding). Never persist passwords or consent. Clear drafts when authentication/registration succeeds.

## Acceptance

- Landing policy links are visible, keyboard accessible, translated with existing keys and at least44px tall on desktop and375px, French and Arabic.
- Login email and registration name, username, email survive same-tab navigation/reload, with no cross-tab localStorage persistence. Password and consent start empty/unaccepted on remount.
- Invalid form input still produces validation without external writes; repeated clicks do not crash or bypass validation.
- Before/after browser screenshots; five persona reruns on production build, mobile Slow3G; relevant existing tests and typecheck.
- Current Fantasy round is closed: report that actual state, never change business rules to fabricate a saved-team success. Public first success is reading a real match score/detail; account creation/save remains outside this no-write run.

## Evidence exclusions

Initial browser scripts that targeted the language radio as a button were corrected and excluded. Untrusted proxy certificates caused strict Chromium to fail public backend reads; Chromium-only test configuration accommodates that environment. Development payload timings are excluded from production performance conclusions. The report keeps these limitations separate from product defects.
