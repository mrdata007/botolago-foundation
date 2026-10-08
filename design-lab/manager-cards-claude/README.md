# Manager Card lab, exploration B (Claude)

A second, independent exploration of the BotolaGO Manager Card: ten directions, each
with its own silhouette, material, hierarchy and founder mark, tested at every size the
card will live at. It sits beside the first exploration (Codex, branch
`design/manager-card-exploration`, draft PR #377) and does not change it.

Everything here is fictional sample data and design work. Nothing in this folder is
imported by the app, linked from it, deployed, or connected to a database or API.

## Open it

From the repository root:

```sh
python3 -m http.server 4312 --bind 127.0.0.1 --directory design-lab/manager-cards-claude
```

Then open `http://127.0.0.1:4312/` (the gallery) or
`http://127.0.0.1:4312/preview.html?c=03` (one concept on one sheet; add `&v=v2` for a refined
version). A server is needed
because browsers block fonts loaded from `file://` pages.

The onboarding screens (« Le premier 84 », `ONBOARDING_PLAN.md` section 7) are on their own pages:

| Page                                                      | What it shows                                                                                                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding.html?c=07&v=v2`                               | Every onboarding screen and variant (S01 to S18 and D1) for one direction, in 390px phone frames (D1 at 1440), each labelled with its moment and fixture.                               |
| `onboarding.html?c=07&v=v2&screen=S05&variant=new-serial` | One screen at the width of its frame: the page the capture tools use.                                                                                                                   |
| `states.html?c=07&v=v2`                                   | One direction in every card state (fixtures `MC.ONB.FIX`): the full card in French and Arabic, tokens at 64, 44 and 28px, and the row. The bench the direction designs were checked on. |

`onboarding.html` queries: `c` and `v` pick the direction (`c=07&v=v2` Écharpe, `c=03&v=v2` Porte-clés,
`c=01` Lucarne, `c=05&v=v2` Semelle, `c=t1-touchline` Touchline), `lang=fr|ar`, `scheme=light|dark`,
`screen=S05` and `variant=<key>` for one screen, and `motion=1` to allow the card beats (without it
every beat is off, as under reduced motion). `states.html` takes `c`, `v`, `scheme` and `fix=<fixture>`.
Semelle pages carry the visible label « Test culturel en attente »: no onboarding moment ships on
Semelle until its cultural test passes.

Touchline (`t1-touchline`) is the fifth of the final top five, drawn in this lab under `CONTRACT.md`
(`src/concepts/t1-touchline.*`) with CRITIQUE.md's rework. It is not in the gallery's collection: open it
through `onboarding.html?c=t1-touchline`, `states.html?c=t1-touchline` or `preview.html?c=t1-touchline`.

For offline files with every font and image inlined:

```sh
node design-lab/manager-cards-claude/build.mjs
# → dist/manager-cards-claude.html          the gallery, one standalone page
# → dist/manager-card-exploration-b.html    the same page as a fragment, for publishing
# → dist/onboarding.html                    every onboarding screen for the five directions, with a
#                                           toolbar: direction, language, theme, motion, screen filter
# → dist/onboarding-artifact.html           the same page as a fragment, for publishing
#   (dist/ is git-ignored)
```

The built onboarding page cannot read a query string once published, so each choice is a control and
the grid re-renders in place; opened by hand, it still takes the same query as `onboarding.html`
(`c`, `v`, `lang`, `scheme`, `motion`, and `screen` as a filter). Its source is `onboarding-page.html`
(it also runs from a server), `src/onboarding/standalone.js` and `.css`.

## What is where

| Path                                                     | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRIEF.md`                                               | What must be preserved, the improvements targeted and the acceptance criteria, written before any card.                                                                                                                                                                                                                                                                                                                                                                                   |
| `DIRECTIONS.md`                                          | The ten directions as decided, the direction roll, and why each exists.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CRITIQUE.md`                                            | Scores, superlatives, the refined top three and the comparison with Codex.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `CONTRACT.md`                                            | The module contract every concept follows.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ONBOARDING_PLAN.md`                                     | Plan for how a manager first meets the card (« Le premier 84 »): moments, states, copy, open decisions, and the build plan the lab screens follow.                                                                                                                                                                                                                                                                                                                                        |
| `BACKEND_HANDOFF.md`                                     | Prompt for a new session to build the card's backend (data, rating maths, API, switch, job), including the onboarding's "seen" records (section 6a).                                                                                                                                                                                                                                                                                                                                      |
| `index.html`, `src/gallery.*`                            | The gallery: collection, detail sheet, leaderboard test, critique, refined top 3, vs Codex, final top 5.                                                                                                                                                                                                                                                                                                                                                                                  |
| `preview.html`                                           | Every surface of one concept on one page (used to build and check each one).                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/kit.js`                                             | Fixed data (ALI and the sample managers), strings in Latin and Arabic, the shared avatar, crest, flag and logo helpers.                                                                                                                                                                                                                                                                                                                                                                   |
| `src/brand.js`                                           | The BotolaGO logo, generated from `src/assets/brand/` by `tools/gen-brand.mjs`. Run `npx prettier --write design-lab/manager-cards-claude/src/brand.js` after regenerating it: the repository's lint step checks the lab's scripts against Prettier.                                                                                                                                                                                                                                      |
| `src/contexts.js`, `src/app-context.css`                 | The app places a card lives in: the ranking card, a comment line, a head-to-head strip, a size ladder and a silhouette test, in light and dark.                                                                                                                                                                                                                                                                                                                                           |
| `src/concepts/NN.js`, `NN.css`                           | One concept each. `NN-v2.*` is a refined version. `x0N-*` are the three directions cut after the critics (shown in the gallery's appendix). `00-contract.*` is a plumbing example, not a design.                                                                                                                                                                                                                                                                                          |
| `src/content/review.js`                                  | The critique, refinement and comparison content shown in the gallery.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ONBOARDING.md`                                          | The onboarding build brief: what is preserved, what improves, the sixteen acceptance criteria.                                                                                                                                                                                                                                                                                                                                                                                            |
| `onboarding.html`, `states.html`, `onboarding-page.html` | The onboarding pages above.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/onboarding/`                                        | `frame.js` (registry, app chrome, the card helper), `states.js` (fixtures), `strings.js` (every French and Arabic string under proposed `card.onboarding.*` keys), `screens-*.js` (the screens), `onboarding.css`, `page.js` and `page.css` (the grid renderer shared by both pages), `standalone.*` (the built page's toolbar).                                                                                                                                                          |
| `fonts/`                                                 | Lab-local faces: copies of the product's Changa, Manrope and Noto Sans Arabic, plus six OFL display faces (licences beside each).                                                                                                                                                                                                                                                                                                                                                         |
| `review/`                                                | Screenshots: desktop, mobile, Arabic, per-concept sheets, and renders of the Codex cards taken from their own branch.                                                                                                                                                                                                                                                                                                                                                                     |
| `review/onboarding/`                                     | The onboarding captures (WebP) per direction and `motion/`, `INDEX.md` (what each file is, by moment, and the command that made it) and `CHECKS.md` (the measured acceptance checks).                                                                                                                                                                                                                                                                                                     |
| `tools/capture.mjs`                                      | Screenshot helper (needs `playwright-core` and Chromium). Options for a section, an element, the colour scheme, the gallery language (`--ls=lang:ar`) and a click; it reports any element that escapes the page width.                                                                                                                                                                                                                                                                    |
| `tools/capture-onboarding.sh`                            | The capture matrix of `ONBOARDING_PLAN.md` section 7: calls `capture.mjs` for every screen, converts to WebP with ffmpeg, runs `capture-motion.mjs`, and rewrites `review/onboarding/INDEX.md`. `bash tools/capture-onboarding.sh [all\|lead\|others\|desktop\|motion\|2x]`.                                                                                                                                                                                                              |
| `tools/capture-motion.mjs`                               | One screen at t = 0 with the card beat on (every animation rewound and paused), or under reduced motion: the number and the serial are in the first painted frame.                                                                                                                                                                                                                                                                                                                        |
| `tools/check-onboarding.mjs`                             | The acceptance criteria 1 to 14 measured (rectangles, computed styles, text scans, `getAnimations()`, pixel contrast from screenshots) for every screen, variant and direction, plus criterion 15; writes `review/onboarding/CHECKS.md`, with the checklist for criterion 16. It serves the lab itself: `PW_CORE=… CHROME=… node design-lab/manager-cards-claude/tools/check-onboarding.mjs` from the repository root (`--only=07-v2`, `--ctx=fr/light`, `--skip-lint`, `--json=<file>`). |

## The fixed sample

ALI · 84 OVR · PRO · Morocco · 2026/27 · BOT #004821 · FOUNDER 2026 · CAP 91 (captaincy),
SEL 82 (selection), TRF 86 (transfers), CON 78 (consistency) · a neutral placeholder crest ·
one shared avatar, the manager seen from behind at the touchline. In Arabic the name is
علي. Five more fictional managers (one per tier) exist only to test leaderboards.

Tier previews hold ALI's data constant and change only the tier's material, so the tiers
can be compared. No tier, XP or OVR logic exists here.
