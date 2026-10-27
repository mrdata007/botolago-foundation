# PageSpeed: stable layout, earlier hero, lighter first load (screen brief)

Owner-approved performance and accessibility change of 2026-10-27, from the
PageSpeed Insights run of botolago.com (mobile: Performance 64, Accessibility
94, Best Practices 96, SEO 100; LCP 5.0 s, CLS 0.148, TBT 140 ms). Branch
`claude/festive-volta-oochbu-pagespeed`. No database write, no migration, no
deploy. Owner decisions: zoom is allowed, no HSTS preload, the Content Security
Policy is report-only.

## What must be preserved

- Every screen looks and reads the same in French and Arabic, phone and
  desktop, LTR and RTL: no copy, colour, spacing, type face or component change.
  The only visible difference allowed is that things stop jumping while the
  page loads.
- Brand identity (wordmark, faces, palette), Fantasy rules, scoring, the
  gameweek lifecycle and every other business rule.
- The home band, the story rail, the match carousel and the splash behave as
  they do today (data, order, live polling, `staleTime`).
- `frame-ancestors 'self'` and `X-Frame-Options` on botolago.com stay enforced;
  HSTS stays as it is.

## Improvements (item numbers are the owner's PageSpeed brief)

- P1 The home band photograph is preloaded from the document head (hashed URL,
  `imagesrcset`/`imagesizes`) and carries explicit width/height and `loading="eager"`.
- P2 CLS: the story rail reserves its final height while it loads (it arrives
  from the browser and pushed the whole page down); wordmark gets its aspect
  ratio; metric-matched fallback faces for Manrope and Changa; only Manrope
  Latin and Changa Latin are preloaded.
- P3 Arabic and signature faces are requested only when text that needs them is drawn.
- P4 Long cache for `/fonts/*` (30 days) alongside the existing `/assets/*` rule.
- A1 Zoom allowed (`width=device-width, initial-scale=1, viewport-fit=cover`),
  form fields at 16px so iOS does not zoom on focus; the safe-area test is
  updated to the new rule.
- B1 The Seline request that answers 400 is fixed or its event removed.
- C1 `/llms.txt` (static, text/plain).
- P7 Right-sized topic images with srcset/sizes and true width/height; lazy
  below the fold.
- P8 Animations that touch only transform and opacity.
- P6 Lazy WebGL/canvas after first paint if it is not needed for first paint;
  bundle report.
- P5 Render-blocking CSS: investigated, changed only if styling cannot break.
- B2 `Cross-Origin-Opener-Policy: same-origin-allow-popups` and a
  `Content-Security-Policy-Report-Only` built from what the site loads.

Anything that cannot be done safely is skipped and said so in the report.

## Acceptance criteria

- Home at 390 px, French and Arabic: layout-shift total below 0.1 (measured
  with a PerformanceObserver on a production build served by `wrangler dev`).
- French home requests no Arabic or signature face.
- Before/after screenshots of `/`, `/news`, an article and `/matches` at 390
  and 1280 px, French and Arabic, differ only where content loads late.
- `/fonts/*` responses carry a long Cache-Control; `/llms.txt` is 200 text/plain.
- No new console error; the Seline 400 is gone.
- `bun run typecheck`, eslint and prettier on changed files, `bun run build`,
  and `bun test` pass; evidence claims are for runs that were executed.
