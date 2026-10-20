# UX writing — verification and screenshots

See the [implementation report](../../2026-10-20-ux-writing-report.md) and
[shared glossary](../../UX_WRITING_GLOSSARY.md). Screenshots are unmodified
captures of this checkout's local mock services. They show fictional accounts,
payment details and match data; no payment, message or email was sent.

## Results

| Check                           | Result                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline FR/AR, 390/1440px      | 50 passed: 40 rendered scenarios and 10 interactions                                                                                           |
| Main responsive pass            | 190 passed: 45 route scenarios × FR/AR × 390/1440px, plus 10 interactions                                                                      |
| Narrow/dark pass                | 46 passed: 9 screen families × FR/AR × 320/768px, plus 10 interactions                                                                         |
| Account copy flows              | 16 passed: resend confirmation/cooldown, registration, onboarding and profile editing × FR/AR × 390/1440px                                     |
| Plus copy flows                 | 16 passed: style selection, payment/unavailable state, member recap/briefing and locked previews × FR/AR × 390/1440px                          |
| Email geometry                  | 24 passed: 3 moments × FR/AR × 390/1280px, before and after                                                                                    |
| Full unit/component suite       | 10,772 passed, 23 expected skips, zero failures across 794 files                                                                               |
| Localisation                    | Gate passed; 201 i18n tests passed; approved Arabic terminology retained                                                                       |
| TypeScript and production build | Passed, including the legal publication gate                                                                                                   |
| Notification template           | Isolated PostgreSQL 17 fixture passed; metadata/variables, retained editions, untouched Arabic/stored notices and both refusal guards verified |

The responsive observations record zero escaped headings/controls and zero
silently clipped headings/controls. Real horizontal scrollers are exempt from
viewport-edge checks. Account/Plus/email checks also inspect text ranges rather
than relying on document scroll width. These are targeted fit and interaction
checks, not a complete accessibility certification.

The full suite was rerun after fixing intentional wording assertions and the
notification migration's release-inventory entry. Earlier concurrent runs hit
an i18n setup timeout and a timing-sensitive, unchanged lifecycle test. The
lifecycle file passed all 52 tests alone; the final complete run above passed.
An auth capture during Vite hot reload was discarded and rerun with a quiet
server; all final account cases passed with clean diagnostics.

## Captures and measured correction

- Transfers: [French before](before-transfers-fr-390.png) /
  [after](after-transfers-fr-390.png), [Arabic before](before-transfers-ar-390.png) /
  [after](after-transfers-ar-390.png). Amounts now name M/م and deductions name
  points; the values are unchanged. Mock deadlines are generated relative to the
  capture time, so their minutes differ between runs.
- Compact Arabic: [320px dark transfer screen](after-transfers-ar-dark-320.png).
  Budget/point labels wrap; digits and decimal values retain their order.
- First-use explanation: [320px landing page](after-landing-fr-dark-320.png)
  writes millions in full rather than introducing an unexplained M.
- Accounts: [Arabic verification](after-verify-ar-390.png) keeps the email left
  to right and translates the countdown. The dedicated tests also verify a
  successful resend announces completion and restarts its cooldown.
- Payment: [Arabic receipt instructions](after-payment-ar-390.png) explicitly
  request the attachment; the actual WhatsApp URL retains the account code.
- Plus passed-deadline board: [before the text-fit fix](briefing-before-text-fit-fix-fr-1440.png)
  versus [after](briefing-after-text-fit-fix-fr-1440.png). The long notice
  previously squeezed the desktop heading into a narrow column. One existing
  container selector now gives the notice its own row. The first image is an
  intentionally retained failed layout capture, after copy edits but before the
  CSS correction; the second is a focused board capture. The Plus run improved
  from 15/16 to 16/16, and both French/Arabic desktop headings were inspected.
- Email: [French before](before-email-selection-fr-390.png) /
  [after](after-email-selection-fr-390.png), plus
  [Arabic points](after-email-points-ar-390.png). All 12 final email screenshots
  and four baseline samples were inspected during verification.

The development-only yellow demo badge appears in browser captures and may
overlap fixed controls. This is a fixture overlay, not production copy or a new
interaction introduced by this change.

## Raw evidence and reproduction

- `browser-summary.json`: pass counts, routes and redirects.
- `baseline-geometry.json`, `responsive-geometry.json`, `narrow-dark-geometry.json`:
  original route, direction, element boxes, escaped/clipped findings and final path.
- `email-geometry-summary.json`: 24 email observations, CTA destinations/heights,
  logo loading, direction and isolated numeric values. The `/tmp` screenshot
  paths describe the original run; selected images are copied alongside this file.
- `notification-template-test.txt`, `notification-template-guards.txt`: isolated
  SQL execution and guard results. The container had no network or published
  ports, was the only writer to its own disposable database, and was removed.
  Two original template fixtures became three editions after migration; only
  French changed. This is not a full Supabase/pgTAP run or a production apply.

Use Bun 1.3.14 and the locked dependencies. Start this checkout on its own port
with the existing auth, football, news, notifications, Fantasy, predictions,
Prospects, prizes and manager-card mock modes, plus `VITE_MANAGER_CARD_PREVIEW=1`,
`VITE_PREMIUM_PREVIEW=1` and `VITE_PEPITES_PREVIEW=1`.

```sh
E2E_BASE_URL=http://127.0.0.1:4378 E2E_CHROMIUM_PATH=/usr/bin/chromium \
  bun run test:e2e tests/e2e/screen-layout.e2e.ts --workers=2

SCREEN_LAYOUT_SCREENS=home,landing,transfers,players,rules,profile,curva,reset,plus \
SCREEN_LAYOUT_WIDTHS=320,768 SCREEN_LAYOUT_THEMES=dark \
E2E_BASE_URL=http://127.0.0.1:4378 E2E_CHROMIUM_PATH=/usr/bin/chromium \
  bun run test:e2e tests/e2e/screen-layout.e2e.ts --workers=2

E2E_BASE_URL=http://127.0.0.1:4378 E2E_CHROMIUM_PATH=/usr/bin/chromium \
  bun run test:e2e tests/e2e/ux-writing.e2e.ts tests/e2e/ux-writing-plus.e2e.ts --workers=2

bun scripts/qa/i18n-gate.ts
bun test
bun run typecheck
bun run build
```

## Coverage limits

The 45 scenarios include wrappers/redirects and three existing admin samples;
they are not 45 independently verified production workflows. Squad creation
redirected to `/fantasy/team`, and prediction leagues to `/pronostics`, as recorded
in the raw observations. Shared builder/picker surfaces were exercised through
transfers; the separate complete first-team wizard and prediction-league flow
were source/component-reviewed rather than fully browser-verified.

Guest/member/locked/unavailable states were exercised where fixtures support
them. The suite does not independently visit every loading/error/lifecycle state.
Live backend flags, real accounts, payment configuration, hardware/native
permission dialogs, every share destination and inbox-client email rendering or
delivery remain unverified. No new Arabic native-reader sign-off was obtained.
