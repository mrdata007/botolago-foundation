# Validation

Checked on the feature branch against the mock preview. These results cover the copy implementation and relevant existing tests; they do not validate production services or authorize release.

| Check | Result | Evidence |
| --- | --- | --- |
| Relevant unit/component/route suites | **2,850 passed, 0 failed**, 175 files, 79,851 assertions | `botolago-tests-final-clean.log` |
| Final correction suites | **85 passed, 0 failed**, 9 files after Saved/fallback edits | `botolago-final-corrections-tests.log` |
| Existing browser tests | **16 passed** | `botolago-e2e-verified.log` |
| TypeScript | Passed, `tsc --noEmit` | `botolago-typecheck-final.log` |
| Changed TS/TSX lint | Passed, targeted ESLint | `botolago-lint-final.log` |
| Changed TS/TSX formatting | Passed, targeted Prettier check | `botolago-format-final-check.log` |
| Localization gate | Passed: parity, placeholders/plurals and existing warning budgets; unused-key baseline measured at 242 | `botolago-i18n-final.log` |
| Legal placeholders | Passed, no unfilled placeholders | `botolago-legal-gate-final.log` |
| Diff whitespace | Passed, `git diff --check` | Git diff |
| Matched rendered comparisons | 48 accepted before/after pairs, French/Arabic, mobile/desktop; 8 after-only narrow/dark checks | [Visual manifest](VISUAL-MANIFEST.json), [gallery](VISUAL-COMPARISONS.md) |
| Static fatal-error fallback | Original/final HTML at 390/1440px, light/dark; final card within viewport and both recovery targets ≥44px | Raw evidence `fallback/manifest.json`; existing colour tests rerun after CSS change |
| Independent critique | Semantic and personally inspected visual acceptance, with named pre-existing/unverified limits | [Verdict](INDEPENDENT-REVIEW.md) |

## Reproducible commands

The 2,850-test broad run preceded the final Saved empty-sentence removal and standalone fallback CSS correction. The affected News/Saved/fallback suites were then rerun: 85 passed. Localization and formatting were rerun after the final dictionary change.

Bun 1.3.14 is the repository-pinned package manager. The cloud image initially lacked it and several already-declared dependencies. They were installed in a temporary tools directory; repository dependency manifests and lockfiles did not change. Use a normal complete install when reproducing.

```sh
bun test --timeout 20000 src/i18n/ src/content/legal/ src/components/plus/ src/components/curva/ src/components/manager-card/ src/components/landing/ src/components/pepites/ src/components/news/ src/components/admin/ src/routes/ src/lib/delivery-promise.test.ts src/lib/error-page.test.ts src/backend/admin/route-access.test.ts
bun run typecheck
bun scripts/qa/i18n-gate.ts
bun scripts/qa/legal-placeholder-gate.ts
```

Run ESLint and `prettier --check` on the changed TS/TSX paths from the diff. No new test files were added; existing exact-copy assertions were updated to the final text while semantic tests remain.

The existing browser suites are `tests/e2e/empty-states.e2e.ts` and `tests/e2e/accessibility-keyboard.e2e.ts`, run serially with Chromium against `http://127.0.0.1:4173`. They cover FR/AR mobile/desktop skip links, search option naming/announcements, 44px prediction dots and empty-state recovery.

```sh
E2E_BASE_URL=http://127.0.0.1:4173 E2E_CHROMIUM_PATH=/usr/bin/chromium node node_modules/playwright/cli.js test --config=/tmp/botolago-playwright.config.ts tests/e2e/empty-states.e2e.ts tests/e2e/accessibility-keyboard.e2e.ts --workers=1 --reporter=line
```

The temporary config imports the repository config and retains the assertions, with absolute test/output paths and 45s expectation/ 120s test timeouts to accommodate cloud development compilation. Earlier runs with the normal 10s expectation budget timed out under parallel capture/compilation load; the successful final run has all 16 cases passing. This is environmental retry evidence, not an assertion that the first attempts passed.

## Rendered evidence contract

Before serves the frozen original source on 4174; after serves the edited source on 4173. Each uses isolated Vite optimizer caches, identical development mock service modes, explicit card/Plus flags, fresh browser contexts and synthetic local accounts. Arabic acceptance checks actual language, direction and visible heading immediately before and after capture. Version2 resets/asserts scroll position before viewport captures. Payment/offer lower internal scrollers have separate images. Real clocks and capture timestamps are recorded; no frozen-time equivalence is claimed.

Initial dependency overlays, wrong-language first paints, fixture waits that expected a production sign-in gate in mock news mode, stale contexts and interrupted captures were rejected. Accepted evidence is explicitly indexed. Full baseline inspection levels and inaccessible states are recorded in [coverage](COVERAGE.md).

## Practical limits

No production build, native-device run, numerical contrast audit, screen-reader certification or production end-to-end validation is claimed. Real staff authorization/MFA, provider callbacks, valid production tokens, public recaps unavailable in mock mode and external payment/deletion success remain unverified. No database or production writes occurred. No merge or deployment occurred.

Logs, exact captures, capture harnesses and manifests are preserved in `/workspace/botolago-ux-audit-evidence` and its archive. [Source fingerprints](SOURCE-FINGERPRINTS.json) identify the original/final changed source bytes used for review.
