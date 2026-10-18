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

## Additional baseline finding before mobile edit

The production375px Slow3G run confirmed an entirely blank navy screen after language selection (mobile/before-02-landing.png,77.9seconds from start). The lazy LandingFallback in src/routes/index.tsx renders an empty div. Preserve its dark ground and lazy-loading strategy; add an announced, translated loading state plus a usable public matches escape. Acceptance: no empty fallback, clear status and44px link in French/Arabic; mobile can reach actual public match data under the same throttle. This issue affected1/5 personas and joins the same repair pass.

## Review follow-up before release

Preserve all non-secret drafts while OAuth redirects or is cancelled. Clear all four auth-draft fields centrally only when a confirmed authenticated session exists, including email verification and OAuth callback. Preserve the existing SSR hydration seed and MFA gates. Acceptance: policy/history retention still passes; failed/unconfirmed auth does not clear drafts; confirmed authentication clears both login and registration drafts without touching other session storage. These changes address PR521's two review conversations before merging.
