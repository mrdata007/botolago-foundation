# BotolaGO French and Arabic UX writing — implementation brief

## Preserve

Keep the product identity, routes, gameplay, scoring, deadlines, squad/budget rules,
subscription entitlements, payment flow and account behavior. Keep licensed content,
legal meaning, attribution, translation keys and interpolation/rich-text tokens.
French addresses readers as vous; Arabic uses Modern Standard Arabic, approved
football terminology, Western digits and existing mixed-script isolation.

## Specific improvements

Review all fan-facing product areas and their loading, empty, success, error,
confirmation and notification states. Rewrite unclear headings/actions, remove
redundant subtitles, replace technical wording with actionable explanations, and
retain text that already works. Review languages independently, then together.

Prioritize Fantasy: introductory budget shorthand (100 M / 100 م), unexplained
100.0 in help, unitless remaining funds and player prices, ambiguous transfer
costs, position-code errors, squad selection, captain/chip actions and scoring
explanations. Preserve the current million-based scale without inventing a real
currency or changing stored values. Explain the game budget at first use.

Correct known mismatches: verification resend confirmation repeats its action;
WhatsApp only prepopulates a code and still requires attaching a payment receipt;
changing card style does not freeze its rating. Keep dynamic prices, dates and
rules, approved Arabic offer terminology, and unavailable-feature distinctions.

Create a shared FR/AR glossary and a coverage/report document, including specific
documentation contradictions and unreachable states. Do not modify staff-only
admin, partner demo, editorial articles or already-applied migrations. No shared
database writes, messages, deployments or merges are part of this implementation.

## Acceptance and evidence

Capture before/after examples using this checkout's dedicated mock-data server.
Inspect French and Arabic at 390px and 1440px, affected compact controls at 320px,
and dark/enlarged-text samples. Verify text wrapping, clipping, button fit,
hierarchy, accessibility labels and RTL number/name/code presentation. Measure
element and text boxes; document scroll width alone cannot establish no clipping.

Run the existing i18n gate and terminology tests, affected component tests,
typecheck, changed-file lint and production build. Update exact-copy assertions
only for deliberate improvements; explain legitimate warning-baseline changes.
Use mock/local fixtures; distinguish fixture evidence from live availability.
Open a draft PR with this preservation/improvement/acceptance brief and the final
report; do not merge or deploy.

## Initial inspection and environment

Source inspection covered dictionaries, account flows, Fantasy introduction,
builder/picker, transfers/rules, payment and manager-card components and current
rule/product documents. Baseline typecheck is blocked by absent Motion and
Capacitor dependencies; Bun is absent from PATH. Restore the locked toolchain
before validation. Browser connector tools are unavailable; repository Playwright
checks with system Chromium provide local rendered evidence where runnable.

This brief is committed before interface edits, as required by AGENTS.md.
