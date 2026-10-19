# BotolaGO screen layouts — evidence and results

The implementation follows the [committed brief](../../2026-10-19-all-screen-layout-brief.md).
It preserves the UI kit, brand, content, phone navigation and all business rules.
This is a layout and interaction refinement; no database changes were made.

## What improved

| Screen / behavior                                                                 | Before                                     | After                                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Matches calendar tabs at 1440px                                                   | 1440px tabs over a 672px title/body        | Tabs, title and body share 672px                                         |
| Standings, clubs, news, players, rankings, fixture difficulty and Curva at 1440px | 672px canvas                               | 1024px canvas (+52.4%)                                                   |
| Club discovery on desktop                                                         | Three columns                              | Four columns; phone stays two                                            |
| News discovery on desktop                                                         | Lead and top stories stacked               | Lead beside top stories when both exist; latest rows use two columns     |
| Player discovery on desktop                                                       | Filters above results, swipeable club row  | Filters beside results; club choices wrap; phone keeps its swipe row     |
| Curva information beside the fixed card                                           | 248px available by grid calculation        | 600px available; card size remains unchanged                             |
| Arabic transfer action after scrolling, 700px viewport                            | Button bottom at 805.6px on tablet/desktop | Button inside viewport within 1px tolerance                              |
| Closing the player picker with Escape                                             | Focus lost in all six baseline cases       | Focus returns to the opener in both languages at 390/768/1440px          |
| Landing page                                                                      | No main landmark or keyboard bypass        | One main landmark and a skip link that focuses content beyond navigation |
| Articles / login                                                                  | 672px / 432px measured inner width         | Same measured widths                                                     |

The width measurements are in `responsive.json` and `baseline.json`. Curva's
information widths are calculated from the unchanged 352px track, 24px gap and
48px total gutter; the rendered card-size test checks the card independently.

## Verification

- **180/180 responsive layout cases:** 45 route scenarios × French/Arabic ×
  390/1440px. The initial combined run also contained interaction tests; its one
  failure was an immediate row count before player data settled. The test now
  waits for a visible row, and both filter flows passed on rerun.
- **60/60 dark-mode breakpoint cases:** ten affected/shared screen families ×
  French/Arabic × 320/768/1024px, including the admin sample.
- **16/16 enlarged-font and interaction checks:** six 200% root-font scenarios
  plus ten landing, player-filter and transfer-action flows.
- **25 existing browser regressions passed:** global navigation and search, hub skip targets,
  profile dialog focus, 44px targets, phone table expansion, Curva headings and
  card sizing. The two multi-page hub tests passed serially with a 120-second
  test budget after cold/concurrent development-server timeouts. The Curva size
  test now explicitly requests reduced motion through its existing helper;
  that file already documents that Chromium can ignore the context setting.
- **10,708 unit tests passed; 23 expected skips; zero failures.** The first
  sandbox-only attempt could not bind ports for SSR tests; the complete rerun
  with local server binding enabled passed.
- Type checking, changed-file lint, whitespace checks and the production build
  passed. The production legal publication gate passed without exemptions.
- React review: no new fetches, effects, dependencies or business-state changes;
  layout uses logical properties and existing tokens. The picker captures its
  opener once, then restores focus only while that element is connected.

The environment refresh stopped the dedicated development server. Runs that
received `ERR_CONNECTION_REFUSED` were discarded and repeated after restarting
it. Those failures are not treated as product evidence.

## Coverage and limits

`route-inventory.json` lists 98 route components. These include nested wrappers,
redirects, OAuth and development screens, and protected admin routes; they are
not 98 independently rendered product screens. The 45 scenarios span public
football/news, Fantasy, Pépites, Curva, profile, notifications, authentication,
landing, prizes, Plus, legal pages and three existing admin samples.

Each observation records the requested and final path. In the existing mock
state, squad creation redirects to the team page and prediction leagues to the
prediction hub; these observations do not verify separate builder/league states.
Transfer tests exercise the shared builder's action dock and picker directly.
Admin samples render real components with sample data, without claiming a live
privileged session or testing every admin module's data states.

Geometry checks examine element rectangles, including clipping shells. Genuine
horizontal scrollers are exempt from viewport-edge assertions; tables, chip rows
and carousels that intentionally scroll still require functional review. The
assertions are a layout regression check, not a complete accessibility audit.

Root-font enlargement stresses rem-sized controls and canvas alignment; it does
not enlarge every fixed-pixel type token and is not equivalent to browser zoom
or proof of WCAG compliance. No production performance or conversion improvement
is claimed from mock-data screenshots.

## Primary sources and reproduction

Sources: `PRODUCT.md`, `AGENTS.md`, `docs/engineering/DESIGN_SYSTEM_V2.md`, the
component/route code and the running app's DOM. Relevant original accessibility
criteria are [WCAG 2.2 reflow](https://www.w3.org/TR/WCAG22/#reflow),
[bypass blocks](https://www.w3.org/TR/WCAG22/#bypass-blocks) and
[focus order](https://www.w3.org/TR/WCAG22/#focus-order). The W3C source was
retrieved directly and returned HTTP 200.

Dedicated local server: port 4378 in this checkout, using the existing mock
repositories for auth, football, news, notifications, Fantasy, prizes,
predictions, Pépites and Manager Card, with Pépites preview enabled. No shared
backend was used. Browser: repository Playwright workflow with system Chromium.

```sh
E2E_BASE_URL=http://127.0.0.1:4378 E2E_CHROMIUM_PATH=/usr/bin/chromium \
  bun run test:e2e tests/e2e/screen-layout.e2e.ts --workers=2

SCREEN_LAYOUT_SCREENS=calendar,standings,clubs,news,players,difficulty,curva,curva-card,landing,admin \
SCREEN_LAYOUT_WIDTHS=320,768,1024 SCREEN_LAYOUT_THEMES=dark \
E2E_BASE_URL=http://127.0.0.1:4378 E2E_CHROMIUM_PATH=/usr/bin/chromium \
  bun run test:e2e tests/e2e/screen-layout.e2e.ts --grep dark --workers=2

SCREEN_LAYOUT_SCREENS=home,calendar,players SCREEN_LAYOUT_WIDTHS=1440 \
SCREEN_LAYOUT_FONT_SCALE=2 E2E_BASE_URL=http://127.0.0.1:4378 \
E2E_CHROMIUM_PATH=/usr/bin/chromium \
  bun run test:e2e tests/e2e/screen-layout.e2e.ts --workers=2
```

The PNGs are unmodified browser captures: paired French desktop views, Arabic
phone/desktop views, the Arabic transfer dock, plus dark and enlarged-font
examples. `baseline.json`, `responsive.json`, `breakpoints-dark.json` and
`enlarged-root-font.json` retain raw geometry observations and run statistics.
