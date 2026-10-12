# Public content SSR — Step 2 verification

Measured on 12 October 2026. Scope: the approved
[brief](../engineering/briefs/public-content-ssr.md). No deployment or database
write was performed.

## What changed

Public Fantasy loaders now fetch players, history, top performers, fixture
difficulty and anonymous rankings before rendering. Club loaders fetch the
selected season's fixtures, standings and selected squad tab. Pépites uses the
same ranking cache key on the server and in the component. Help answers use
native HTML disclosures, including when JavaScript is disabled.

The existing three-second SSR budget and temporary-failure response mechanism
are reused. Missing players return 404; failed reads are marked for 503 with
`Retry-After: 120`. Successful public queries survive hydration even when a
React Query observer replaces their metadata. Personal ranks are excluded from
the public rankings snapshot; account and MFA guards remain in place.

## Raw HTML comparison

Baseline: `04819601` (scope brief, before implementation), port 4187.
After: `3a0652e9`, port 4186. Both used the same local mock adapters. Browser
JavaScript was disabled. Counts below are records in DOM markup, not embedded
JSON or script strings. Help answer text is in initially collapsed disclosures.
The complete captured text is in [raw-html-report.json](public-content-ssr/raw-html-report.json).

| Page                        | Before                                    | After                                                    |
| --------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| `/fantasy/players`          | 0 player links                            | 25 player links with names/prices                        |
| `/fantasy/top-players`      | Intro and loading shell                   | Five named players and performance totals                |
| `/fantasy/fixtures`         | 0 fixture cells                           | 48 fixture cells                                         |
| `/fantasy/rankings`         | 0 table rows                              | 25 public ranking rows                                   |
| `/fantasy/players/fp_rca_7` | Identity, empty history/fixtures sections | Identity, explicit empty history, five upcoming fixtures |
| Club overview               | Identity and loading shell                | Season statistics and three match links                  |
| Club `?tab=squad`           | Identity and loading shell                | Season statistics and two mock squad members             |
| `/pepites/classement`       | 0 ranking rows                            | 20 ranking rows                                          |
| `/fantasy/help`             | Questions only                            | All ten answers in HTML                                  |

All nine updated URLs returned 200 with JavaScript disabled. This demonstrates
rendering with deterministic fixtures, not completeness or accuracy of live data.

## Checks executed

- Production build against the repository's local backend stub, with its
  production-project-reference guard; TypeScript, focused ESLint, Prettier and
  `git diff --check` passed.
- 211 tests across 18 files passed: public SSR/hydration, club loaders, failure
  status, bounded prefetch, account switching/MFA, Fantasy runtime, availability,
  fixture difficulty, rules and Pépites. After the final rankings query cleanup,
  its eight SSR/account tests were rerun and passed.
- All 17 tests in `tests/e2e/seo-rendering.e2e.ts` passed in Chromium, including
  raw HTML, missing-player 404 and native help interaction without JavaScript.
- Nine updated screens checked at 390×900 and 1440×900 in French and Arabic:
  36 cases, all HTTP 200, no `pageerror`, correct `lang`/`dir`, and no out-of-viewport
  main text/control bounds outside intentional horizontal scrollers. See
  [browser-report.json](public-content-ssr/browser-report.json).
- The report also preserves 36 baseline cases. The baseline club/squad pages
  produced React concurrent-render errors in that combined run; a standalone
  revisit rendered normally. No claim is made about fixing their cause.

These are local mock-data browser checks and production compilation against a
stub, not a production-data smoke test or a Core Web Vitals measurement. Arabic
checks verify the existing browser language/RTL behavior; separate language
URLs and server-language selection remain Step 5.

## Before/after screenshots

These pairs capture the hydrated UI to verify that the SSR change preserves its
appearance. Identical pairs are expected; the raw HTML table above measures the
rendering improvement.

| Screen                  | Before                                                  | After                                                 |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Players, French mobile  | [Before](public-content-ssr/before-players-fr-390.png)  | [After](public-content-ssr/after-players-fr-390.png)  |
| Players, Arabic desktop | [Before](public-content-ssr/before-players-ar-1440.png) | [After](public-content-ssr/after-players-ar-1440.png) |
| Help, Arabic mobile     | [Before](public-content-ssr/before-help-ar-390.png)     | [After](public-content-ssr/after-help-ar-390.png)     |
| Pépites, French desktop | [Before](public-content-ssr/before-pepites-fr-1440.png) | [After](public-content-ssr/after-pepites-fr-1440.png) |

## How to verify in an approved preview

1. Use **View Page Source** on `/fantasy/players`, `/fantasy/top-players`,
   `/fantasy/fixtures`, `/fantasy/rankings`, `/pepites/classement` and a real club
   URL. Find real record names in table/card markup outside `<script>` tags.
2. Open the club URL with `?tab=squad` and inspect its source for squad members.
   Open a linked player and verify identity, history state and upcoming fixtures.
3. Disable JavaScript and reload `/fantasy/help`. Open a question: its answer
   should still appear. Open a second: the first should close in modern browsers.
4. Inspect `/fantasy/players/00000000-0000-4000-8000-000000000000`: it should
   return HTTP 404, not a successful blank player page.
5. With JavaScript enabled, check player filters/pagination, club tabs, and
   French/Arabic layouts. Sign in through the usual flow and verify personal
   Fantasy state; sign out and confirm personal ranks disappear.

For repeatable local automation, run the SEO Playwright file against a Vite
server with all `VITE_*_DATA_MODE` adapters and `VITE_AUTH_MODE` set to `mock`.
Use a separate mode such as `--mode seo-audit`; never substitute production
data for the mock-name assertions. Build with
`bun --no-env-file tests/e2e/built-output-build.ts` to use the guarded local stub.

Clean public URLs, localized metadata, language URLs, schema additions,
sitemaps/content work and mobile performance tuning remain later SEO steps.
