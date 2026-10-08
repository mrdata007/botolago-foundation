# WP1 · Foundation: evidence

What the foundation changes for a reader, and how it was measured. Plan: `docs/product/MANAGER_CARD_SECTION_PLAN.md`
section 8.3 (with 3, 6, 7 and 9). The base for every comparison is commit `9e0de22e` (the plan and the card
types), extracted next to the branch and built the same way.

Nothing here touched a database, an Edge Function or a deployment. Every run used mock data modes or a stub
backend on this machine.

## What to look at

| Folder | What it holds                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `off/` | The switch OFF (the build as it ships): Home, Fantasy, Pépites in French and Arabic, light and dark, 390 and 1440, from the development server, next to `before/`.   |
| `on/`  | The switch ON (preview flag, mock data): the navigation of every checked page, and the foundation's own `/gradins` page with the plain card for a signed-out reader. |

`on/on.json` is the machine-readable result of `capture-on.mjs` (items, current tab, marker, redirects, console
and failed responses for every page state).

## The scripts

| File              | Use                                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build-tree.ts`   | Production build of one tree against a stub backend, every data mode on `supabase`, no preview flag, release sha pinned. `bun docs/product/manager-card-section/wp1/build-tree.ts <treeDir>` |
| `serve-built.ts`  | Serves a tree's `.output` with the e2e stub backend behind it, one origin, clock fixed through `fixed-date.ts`.                                                                              |
| `fixed-date.ts`   | `bun --preload ./…/fixed-date.ts`: the server's clock at one instant, so countdowns match between trees.                                                                                     |
| `capture-off.mjs` | Screenshots, navigation crops, server HTML, requests, storage keys and console errors, per page, language, theme and width.                                                                  |
| `compare-off.mjs` | Two captures compared (pixel diff, `<body>` equality, requests, storage, console, redirects), optionally against `before/` with `--ref=`.                                                    |
| `capture-on.mjs`  | The switch-on checks against a dev server started with `VITE_MANAGER_CARD_PREVIEW=1` and mock modes.                                                                                         |

## Switch OFF means identical (plan 9.1 to 9.4)

Production build of the base and of this branch, each served alone on port 4187, same fixed clock, French and
Arabic, light and dark, 390 and 1440:

- **Pixels.** 26 screenshots (13 pages and 13 navigation crops): every one differs by 0.0000% (no channel off by
  more than 2 of 255 anywhere).
- **Server HTML.** The `<body>` of `/`, `/fantasy`, `/matches` and `/pepites`: byte-for-byte equal once script
  elements and hashed asset names are normalised (47,084 / 108,699 / 66,447 / 32,504 bytes).
- **Requests.** No data request and no document request appears that the base does not make. The only difference
  is three shared library chunks that the bundler cut differently once the section's code exists:
  `jsx-runtime`, `utils` and `tslib.es6`. Raw JavaScript fetched by a first visit grows by about 17 KB, of
  which about 13 KB is the French copy deck.
- **Storage and console.** No localStorage or sessionStorage key on one side only; the console errors are the same
  on both sides (a 404 for a missing stub resource on `/pepites`, in the base too).
- **Addresses.** `/gradins`, `/gradins/carte`, `/gradins/les-votres` and `/gradins/saisons` answer `307` to
  `/fantasy`.
- **Section code.** `scripts/qa/manager-card-off-bundle-gate.ts` walks the static imports of the built chunks and
  fails if any ordinary page imports the section's data layer, card chunks or storage keys (301 chunks, passes).
- **Fixtures.** `scripts/qa/manager-card-fixture-gate.ts` finds no fixture sentinel, `mc=` id, label or sample
  name in the 673 files of the production bundle (and `--self-check` proves it would).

### Development server against the owner's references (`before/`)

Same capture, development server, switch off, compared with `docs/product/manager-card-section/before/`:

| Page                         | Differs                                                 |
| ---------------------------- | ------------------------------------------------------- |
| Pépites (3 screens)          | 0.000%                                                  |
| Home landing (fr, ar at 390) | 0.014% and 0.016%                                       |
| Fantasy (4 screens)          | 0.11% to 0.35%, scattered over the page's centre region |

The base tree produces the same figures against the same references (identical bounding boxes), so the Fantasy
residue is the environment (fonts and countdown), not this change. The development server's `<body>` and module
graph differ from production in ways unrelated to the section; that is why the identity proof above is on the
production build.

## Switch ON (plan 9.5 and 9.8)

`capture-on.mjs` against `VITE_MANAGER_CARD_PREVIEW=1` and mock modes: 32 page states (`/`, `/fantasy`,
`/pepites`, `/pepites/classement`, `/gradins`, `/gradins/carte`, plus `?mc=featureOff` on `/` and `/gradins`, in
French and Arabic, at 390 and 1440). Result: `SWITCH ON: the bar, the lit tab, the marker and the redirects are
as planned.`

- The bar reads Accueil, Actualités, Fantasy, Matches, Gradins (Arabic: الرئيسية، الأخبار، فانتازي،
  المباريات، المدرجات), in that order, as the bottom bar on a phone and as text links in the top bar on a desktop.
- Every item of the phone bar is at least 44 by 44.
- Fantasy is the current item on `/pepites` and `/pepites/classement`; Gradins is current on `/gradins` and
  `/gradins/carte`.
- `<html data-gradins="live">` is set while the section is live and absent otherwise.
- With the fixture `featureOff`: today's bar (Accueil, Actualités, Fantasy, Matches, Pépites), no marker, and
  `/gradins?mc=featureOff` lands on `/fantasy`. No console error in any state.
- The first run against a cold development server hit the script's 30 s `networkidle` limit (Vite compiling the
  client on first load); after a warm-up request the whole run passed. No code changed between the two.

## Tests and gates

| Check                                                         | Result                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `bun run typecheck`                                           | clean                                                                                               |
| `bun run lint`                                                | 0 errors; 31 warnings, none in the section's files (the ones in files I touched pre-date this work) |
| `bunx prettier --check` on every touched file and this folder | clean                                                                                               |
| `bun test` (whole repository)                                 | 6,437 pass, 17 skip, 1 fail                                                                         |
| `bun scripts/qa/i18n-gate.ts`                                 | pass                                                                                                |
| `bun run build`, then fixture gate and off-bundle gate        | build 0; both pass                                                                                  |
| `bun run backend:migrations:check`                            | 163 migrations validated (this work adds none)                                                      |
| `bunx playwright test --list`                                 | 209 tests in 16 files (the collection works in Node)                                                |

The one failing unit test is `src/backend/news/editorial-session.test.ts` (Morocco's Ramadan clock change): this
Node's ICU prints `GMT+0` where the test expects `GMT`. It fails the same on the base and has nothing to do with
this work.

### Browser suites, switch off, against the development server (mock modes, 2 workers)

Seven suites (`anonymous.acceptance`, `fantasy.journey`, `pepites`, `empty-states`, `mobile-readability`,
`seo-rendering`, `dark-mode-flag`): 105 tests, **94 passed, 6 skipped, 5 failed** in 9.9 minutes. The five
failures were re-run, with the same filter, on the base tree and then on this branch (the machine was shared with
other agents' development servers):

| Test                                                          | First run, branch                                          | Re-run, base                    | Re-run, branch    |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------- | ----------------- |
| `anonymous.acceptance:23` (one language and width of the six) | ar desktop fails (body font family lacks Noto Sans Arabic) | fr 320 fails (`goto` times out) | passes            |
| `mobile-readability:116` (club Matchs tab)                    | fr 360 fails (0 rows)                                      | passes                          | passes            |
| `mobile-readability:131` (search results)                     | fr 360 and fr 390 fail (combobox not found in 45 s)        | fr 360 fails (same error)       | passes            |
| `pepites:368` (signed-in Follow, then +Fantasy)               | fails (status line not shown)                              | fails (same line)               | fails (same line) |

Reading: four of the five are load-dependent and move between trees from one run to the next; the fifth,
`pepites:368`, fails identically on the base, so it is not caused by this work. Its cause was not investigated.
The 4-test-filter re-run on the branch: 22 passed, 1 failed (`pepites:368`).

## Not done here, on purpose

- No visual comparison of the card itself: the foundation ships the plain renderer; the Écharpe port (WP2) and
  the screens (WP3 to WP6) bring their own evidence.
- The Playwright suites were not run with the preview flag on. The browser checks of the switch-on state are the
  ones in `on/` (navigation, marker, redirects, console).
