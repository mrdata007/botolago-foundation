# Manager Card collectible redesign: the BEFORE set

The incumbent card (the Écharpe, renderer `echarpe-v2`) on every surface that draws it, captured from
`main` at `8fae526c` (the merge of #382) before any interface change, so the after set (WP4) can be
laid beside it name for name. Work package WP0 of
[`../../MANAGER_CARD_SORARE_STYLE_PLAN.md`](../../MANAGER_CARD_SORARE_STYLE_PLAN.md) §13; the criteria
it serves are in [`../../MANAGER_CARD_SORARE_STYLE_BRIEF.md`](../../MANAGER_CARD_SORARE_STYLE_BRIEF.md).
Nothing here touched a database: every server ran in the mock data modes.

The owner's earlier reference set of the app with the section off is
[`../../manager-card-section/before/`](../../manager-card-section/before/); this set is the one for
the card.

## Where the pictures come from

| What                                                      | Value                                                                                                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree captured                                             | `/home/user/mc-sorare-base`, a detached `git worktree` of `main` at `8fae526c` (`git rev-parse HEAD` read back before and after the run)                             |
| Renderer in the pictures                                  | `echarpe-v2`: the card's root class is `mc-echarpe …` on every picture (recorded per picture in `capture-log.json`, `drawn.root`)                                    |
| Same code as the branch                                   | `git diff --stat 8fae526c 73630b4b -- src public` is empty: the redesign branch holds no source change at the time of capture, only docs                             |
| Server                                                    | `bun run dev` of that tree on **port 4190**, started for this run and stopped by its process id afterwards; no other server was measured                             |
| Preview on (every picture here but the switch-off folder) | the command below, with `VITE_MANAGER_CARD_PREVIEW=1`                                                                                                                |
| Preview off (`switch-off/`)                               | the same command without `VITE_MANAGER_CARD_PREVIEW` and `VITE_PEPITES_PREVIEW` (what a reader gets when the section is not built in)                                |
| Browser                                                   | Chromium `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, Playwright from the repository's own `node_modules`                                                   |
| Viewports                                                 | 390 × 844 at device scale 2 (780 × 1688 files) and 1440 × 900 at scale 1; the share picture is 1080 × 1920 (its own pixels)                                          |
| Clock and motion                                          | clock fixed at 2026-10-08T20:00:00Z (a countdown reads the same in the after run), `prefers-reduced-motion: reduce` (the card is at rest, no beat mid-way)           |
| Account                                                   | the mock auth's demo account (`demo@botolago.ma`) seeded into storage; « guest » pictures are signed out                                                             |
| Data                                                      | the development fixtures of `src/backend/manager-card/fixtures.ts`, chosen with `?mc=<fixture>`; the card prints « Exemple » / «مثال» (`sample`) as the preview does |

```
cd /home/user/botolago-app && git worktree add --detach /home/user/mc-sorare-base 8fae526c
ln -sfn /home/user/botolago-app/node_modules /home/user/mc-sorare-base/node_modules
cd /home/user/mc-sorare-base
VITE_FOOTBALL_DATA_MODE=mock VITE_FANTASY_DATA_MODE=mock VITE_AUTH_MODE=mock \
VITE_MANAGER_CARD_DATA_MODE=mock VITE_NEWS_DATA_MODE=mock VITE_NOTIFICATIONS_DATA_MODE=mock \
VITE_PRIZES_DATA_MODE=mock VITE_PREDICTIONS_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock \
VITE_MANAGER_CARD_PREVIEW=1 VITE_PEPITES_PREVIEW=1 \
  bun run dev -- --host 127.0.0.1 --port 4190 --strictPort
```

## Scripts (re-run them against the branch for the after set)

| Script                   | Does                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture-before.mjs`     | Every surface listed below, with the preview on: `node docs/product/manager-card-sorare-style/before/capture-before.mjs --base=http://127.0.0.1:<port> --out=<dir> [--only=<screen>] [--match=<regex>] [--jobs=3]`. Pictures are saved as PNG; `--list` prints the names. `capture-log.json` holds, per picture, the final URL, console errors, page errors, failed requests and whether a card was drawn, by which renderer. |
| `capture-gallery.mjs`    | The gallery pictures: the six tiers at 264 px, the edge states, and eight profiles at 80, 64, 56, 44, 32, 28 and 24 px, in both languages and themes. It opens a Gradins page of the dev server and lays out what `ManagerCard` and `CardToken` insert, from the app's own modules; no source is changed.                                                                                                                     |
| `capture-switch-off.mjs` | Home (first visit and returning), Fantasy, Pépites and the navigation bar with the preview off, 390 @2× and 1440 @1×, French and Arabic light and Fantasy 390 dark: `wp1/capture-off.mjs` unchanged under a new header. Its output goes to `switch-off/`; `report.json` there is what `wp1/compare-off.mjs` reads (the HTML it also writes is not committed, see the end of this page).                                       |
| `to-webp.py`             | Turns the PNGs the two capture scripts write into the committed WebP files (see "Format" at the end of this page).                                                                                                                                                                                                                                                                                                            |
| `build-index.py`         | Rebuilds the tables of this file from the folder and the logs; the prose above comes from `index-header.md`.                                                                                                                                                                                                                                                                                                                  |

Names are `<screen>-<fixture>-<lang>-<theme>-<width>`: `screen` is the surface (table below), `fixture`
the `?mc=` card (or `guest`), `lang` `fr` | `ar`, `theme` `light` | `dark`, `width` 390 | 1440 (the share
picture: 1080). The after set uses the same names, so a pair is two files with one name.

## Conventions the pictures follow

- **A hero and the stage are two pictures.** On arrival a fresh session shows the moment's hero (M4) in
  the slot above the stage, and the hero carries the card. `hero-<fixture>` is that arrival. `g1-<fixture>`
  is the page after the hero has been dismissed with its × (the mock acknowledgement), so the stage's
  own card, the rating line and the blocks are what is shown.
- **The « MODE DÉMO » / «وضع تجريبي» pill** is drawn by the mock data mode, fixed above the bottom bar;
  it sits over the foot of some pictures, exactly as it did in every earlier evidence set. The after
  run has it too.
- **Viewport pictures.** Everything is the first screen or a scroll position chosen to put the part in
  frame (`g2Ladder`, `g2Founder`, the Fantasy blocks, `g1-guestTryOn`), not a full-page capture.
- **The share picture does not depend on the theme**: the picture the sheet draws in the dark theme
  (`picture-rated-fr-dark-1080`) is byte-identical to its light twin, so the other fixtures are saved
  in light only (check at the end of this page).
- **Text-only surfaces** are in the set because the card's words are part of the redesign's reach:
  the three hints (`hint-cap`, `hint-sel`, `hint-trf`), `first-transfer-line` and `profile-delete`
  draw no card art, only the card's copy beside it; the after set must read the same.
- **Tokens and minis** are seen in place (hub 80 px, league rows 28 px, rankings, the league band, the
  tier ladder, the season rack) and, at every size and tier on one page, in the `gallery-*` pictures.
