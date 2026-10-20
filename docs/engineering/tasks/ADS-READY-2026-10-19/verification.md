# Ad-space verification — 19 October 2026

The feature branch is based on `a7091085`. The brief was committed as `a2abb110` before any interface change. All visual evidence uses local mock/stub data; no production database was written.

## Checks

- TypeScript: `tsc --noEmit` passed.
- Legal placeholder gate passed.
- Production bundle built successfully against the repository's isolated local stub backend (`bun --no-env-file tests/e2e/built-output-build.ts`). The build helper verified that the bundle contains no production Supabase project reference.
- 234 targeted unit/contract tests passed across six files: ad activation/entitlement gates, script singleton and one request per DOM node, native exclusion, Home structure, article lead, root route and the UI-kit contract.
- Four before-change browser runs passed: French/Arabic × mobile 390 px/desktop 1280 px.
- Eight after-change browser runs passed: French/Arabic × 320, 390, 768 and 1280 px. Each walked Home → News → article, measured each ad's actual container/child boxes (rather than relying on the clipped document scroll width), checked reserved heights of 100/250 px and recorded zero Google ad requests. Home/News were also inspected in dark mode.
- Three production-bundle checks passed: French 390 px and Arabic 1280 px Home → News → article journeys, plus the unconfigured `/ads.txt` response. The test stub was extended with article-detail/related RPC answers after the first run exposed missing fixtures; no application fallback was weakened.
- Formatting and `git diff --check` passed.

Before/after sample screenshots are committed below. The full screenshot set is retained locally in `/workspace/ads-evidence`; it includes additional widths and dark-theme views. Screenshot capture and route navigation were run through the repository's Playwright test harness using the installed Chromium. A stale development optimizer initially prevented hydration; clean dependency/cache setup resolved it before the successful baseline and after runs.

| Screen | Before | After |
| --- | --- | --- |
| Home, French, 390 px | [Before](evidence/home-fr-390-before.png) | [After](evidence/home-fr-390-after.png) |
| Home, Arabic, 390 px | [Before](evidence/home-ar-390-before.png) | [After](evidence/home-ar-390-after.png) |
| News, French, 1280 px | [Before](evidence/news-fr-1280-before.png) | [After](evidence/news-fr-1280-after.png) |
| Article, Arabic, 1280 px | [Before](evidence/article-ar-1280-before.png) | [After](evidence/article-ar-1280-after.png) |

## Limits and release

No Google account/approved IDs exist, so actual paid ad delivery, Google account verification, CMP behaviour and ads.txt acceptance cannot be tested yet. Activation instructions are in [ADVERTISING.md](../../ADVERTISING.md). No real sponsor artwork was supplied; its config validation is tested, while screenshots show the honest house fallback. The live application has not been published or merged: AGENTS.md requires owner review of a draft PR first.
