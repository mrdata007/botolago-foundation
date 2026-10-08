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

For one offline file with every font and image inlined:

```sh
node design-lab/manager-cards-claude/build.mjs
# → dist/manager-cards-claude.html          one standalone page
# → dist/manager-card-exploration-b.html    the same page as a fragment, for publishing
#   (dist/ is git-ignored)
```

## What is where

| Path | What it is |
| --- | --- |
| `BRIEF.md` | What must be preserved, the improvements targeted and the acceptance criteria, written before any card. |
| `DIRECTIONS.md` | The ten directions as decided, the direction roll, and why each exists. |
| `CRITIQUE.md` | Scores, superlatives, the refined top three and the comparison with Codex. |
| `CONTRACT.md` | The module contract every concept follows. |
| `ONBOARDING_PLAN.md` | Plan for how a manager first meets the card (« Le premier 84 »): moments, states, copy, open decisions. Plan only, no screens built yet. |
| `BACKEND_HANDOFF.md` | Prompt for a new session to build the card's backend (data, rating maths, API, switch, job), including the onboarding's "seen" records (section 6a). |
| `index.html`, `src/gallery.*` | The gallery: collection, detail sheet, leaderboard test, critique, refined top 3, vs Codex, final top 5. |
| `preview.html` | Every surface of one concept on one page (used to build and check each one). |
| `src/kit.js` | Fixed data (ALI and the sample managers), strings in Latin and Arabic, the shared avatar, crest, flag and logo helpers. |
| `src/brand.js` | The BotolaGO logo, generated from `src/assets/brand/` by `tools/gen-brand.mjs`. Run `npx prettier --write design-lab/manager-cards-claude/src/brand.js` after regenerating it: the repository's lint step checks the lab's scripts against Prettier. |
| `src/contexts.js`, `src/app-context.css` | The app places a card lives in: the ranking card, a comment line, a head-to-head strip, a size ladder and a silhouette test, in light and dark. |
| `src/concepts/NN.js`, `NN.css` | One concept each. `NN-v2.*` is a refined version. `x0N-*` are the three directions cut after the critics (shown in the gallery's appendix). `00-contract.*` is a plumbing example, not a design. |
| `src/content/review.js` | The critique, refinement and comparison content shown in the gallery. |
| `fonts/` | Lab-local faces: copies of the product's Changa, Manrope and Noto Sans Arabic, plus six OFL display faces (licences beside each). |
| `review/` | Screenshots: desktop, mobile, Arabic, per-concept sheets, and renders of the Codex cards taken from their own branch. |
| `tools/capture.mjs` | Screenshot helper (needs `playwright-core` and Chromium). Options for a section, an element, the colour scheme, the gallery language (`--ls=lang:ar`) and a click; it reports any element that escapes the page width. |

## The fixed sample

ALI · 84 OVR · PRO · Morocco · 2026/27 · BOT #004821 · FOUNDER 2026 · CAP 91 (captaincy),
SEL 82 (selection), TRF 86 (transfers), CON 78 (consistency) · a neutral placeholder crest ·
one shared avatar, the manager seen from behind at the touchline. In Arabic the name is
علي. Five more fictional managers (one per tier) exist only to test leaderboards.

Tier previews hold ALI's data constant and change only the tier's material, so the tiers
can be compared. No tier, XP or OVR logic exists here.
