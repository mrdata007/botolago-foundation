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

## What is here

| Screen                 | What it is                                                                      | How it is reached                                                                                                   | Fixtures                                                                                                           | Pictures |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------: |
| `g1`                   | G1, Gradins home (stage, rating line, blocks)                                   | `/gradins?mc=<fixture>` signed in; a hero, if one arrives, is dismissed first, so the stage's card is what is shown | `arabicName`, `clubNull`, `forming1`, `founder`, `guest`, `guestTryOn`, `homa`, `legend`, `longNameLatin`, `rated` |       72 |
| `hero`                 | M4 hero: the card as a moment hands it over                                     | `/gradins?mc=<fixture>` signed in, as it arrives (first rating, tier up, founder, season closed, returning, launch) | `founder`, `launchArrival`, `legend`, `rated`, `returning`, `seasonClosed`, `tierUp`                               |       32 |
| `born`                 | M2 born panel on G1                                                             | `/gradins?mc=born0Serial`                                                                                           | `born0Serial`                                                                                                      |        2 |
| `teamBorn`             | M2 born panel on the team page                                                  | `/fantasy/team?mc=born0Serial`                                                                                      | `born0Serial`                                                                                                      |        4 |
| `g1People`             | G1 lower down: « Les vôtres » (rows with 28 px tokens)                          | `/gradins?mc=rated`, hero dismissed, the people block at the top of the frame                                       | `rated`                                                                                                            |        4 |
| `g1Club`               | G1 lower down: « Votre club » (the club's mates)                                | same, the club block                                                                                                | `rated`                                                                                                            |        4 |
| `g1Seasons`            | G1 lower down: « Vos saisons » (the season's token)                             | same, the seasons block                                                                                             | `rated`                                                                                                            |        4 |
| `g1GuestPoints`        | The signed-out page's four points (24 px minis)                                 | `/gradins` signed out, scrolled to the points                                                                       | `guest`                                                                                                            |        4 |
| `g2`                   | G2, « Votre carte » (the card page, its numbers)                                | `/gradins/carte?mc=<fixture>`, top of the page                                                                      | `founder`, `rated`                                                                                                 |       16 |
| `g2Ladder`             | G2, the five-step tier ladder in frame                                          | `/gradins/carte?mc=rated`, the ladder scrolled to the middle                                                        | `rated`                                                                                                            |        8 |
| `g2Founder`            | G2, the founder block in frame                                                  | `/gradins/carte?mc=founder`, the block scrolled to the middle                                                       | `founder`                                                                                                          |        8 |
| `g3`                   | G3, « Les vôtres » (league band with minis, rows with tokens)                   | `/gradins/les-votres?mc=rated`                                                                                      | `rated`                                                                                                            |        8 |
| `g4`                   | G4, « Face à face » (two full cards)                                            | `/gradins/les-votres?mc=rated`, the first row that is not mine opened                                               | `rated`                                                                                                            |        8 |
| `g6`                   | G6, the seasons (the rack)                                                      | `/gradins/saisons?mc=<fixture>`                                                                                     | `rated`, `returning`, `seasonClosed`                                                                               |       12 |
| `replay`               | The replay sheet                                                                | `/gradins/carte?mc=<fixture>`, « Revoir », first item                                                               | `founder`, `returning`                                                                                             |       10 |
| `share`                | The share sheet (card picture, message, buttons)                                | `/gradins?mc=<fixture>`, hero dismissed, « Partager »                                                               | `founder`, `legend`, `rated`                                                                                       |       12 |
| `picture`              | The share picture itself, 1080 x 1920                                           | the image of the share sheet, saved from its blob URL                                                               | `arabicName`, `clubNull`, `founder`, `homa`, `legend`, `longNameLatin`, `rated`                                    |       15 |
| `setup-name`           | Profile setup, step 1: the card's token beside the typed name                   | `/auth/profile-setup?next=/fantasy/create`, new account, a name typed                                               | `rated`                                                                                                            |        8 |
| `setup-club`           | Profile setup, step 2: a club tapped, the token takes its colours               | same, « Suivant », the third club                                                                                   | `rated`                                                                                                            |        8 |
| `profile-delete`       | The account-deletion dialog's card line (text only)                             | `/profile?mc=rated`, « Supprimer mon compte »                                                                       | `rated`                                                                                                            |        4 |
| `hub-guest-intro`      | Fantasy hub, the guest's intro card point                                       | `/fantasy`, signed out                                                                                              | `rated`                                                                                                            |        8 |
| `hub-owner`            | Fantasy hub, the card block (80 px token)                                       | `/fantasy?mc=<fixture>` signed in                                                                                   | `born0`, `forming1`, `homa`, `insufficient3`, `legend`, `rated`, `seasonClosed`                                    |       23 |
| `create-name-guest`    | Team builder, name step, the save line (visitor)                                | `/fantasy/create`, squad filled, « Suivant »                                                                        | `rated`                                                                                                            |        2 |
| `create-name-signedin` | Team builder, name step, the save line (signed in)                              | same, signed in with no team                                                                                        | `rated`                                                                                                            |        2 |
| `create-name-return`   | Team builder, back from sign-up (M1c)                                           | same, draft taken over by the new account                                                                           | `rated`                                                                                                            |        2 |
| `team-born`            | Team page, the born panel (Fantasy)                                             | `/fantasy/team?mc=born0`                                                                                            | `born0`                                                                                                            |        2 |
| `rankings-token`       | Fantasy rankings, the row's token                                               | `/fantasy/rankings?mc=<fixture>`                                                                                    | `forming1`, `rated`                                                                                                |       10 |
| `hint-cap`             | Hint on the captain's tile (CAP)                                                | `/fantasy/team?mc=forming1`, a player tapped                                                                        | `forming1`                                                                                                         |        2 |
| `hint-sel`             | Hint on the starting-eleven choice (SEL)                                        | `/fantasy/team?mc=forming1`, « Remplacer »                                                                          | `forming1`                                                                                                         |        1 |
| `hint-trf`             | Hint on transfers (TRF)                                                         | `/fantasy/transfers?mc=forming1`                                                                                    | `forming1`                                                                                                         |        2 |
| `first-transfer-line`  | The first-transfer line                                                         | `/fantasy/transfers?mc=insufficient3`, one transfer made, « Suivant »                                               | `insufficient3`                                                                                                    |        2 |
| `league-band`          | Fantasy league page, the card band with minis                                   | `/fantasy/leagues/lg1?mc=rated`                                                                                     | `rated`                                                                                                            |        8 |
| `gallery-full-tiers`   | Gallery: the six tiers, full card at 264 px                                     | `capture-gallery.mjs`                                                                                               | -                                                                                                                  |        4 |
| `gallery-full-states`  | Gallery: forming, founder, long Latin name, Arabic name, no club, unnamed guest | `capture-gallery.mjs`                                                                                               | -                                                                                                                  |        4 |
| `gallery-tokens`       | Gallery: 80, 64, 56, 44, 32, 28, 24 px for eight profiles                       | `capture-gallery.mjs`                                                                                               | -                                                                                                                  |        4 |
|                        | **Total**                                                                       |                                                                                                                     |                                                                                                                    |  **319** |

Pictures in this folder: 319, 37.5 MB.

Switch-off set (`switch-off/`): 17 page pictures, 13 navigation-bar crops, 6.0 MB; plus `report.json` (the HTML the script also writes is not committed, see the end of this page).

## Problems seen while capturing

None: no console error, page error, failed request or HTTP status of 400 or more on any picture.

## Every file

### `g1` (72)

`g1-arabicName-ar-dark-390.webp`, `g1-arabicName-ar-light-390.webp`, `g1-arabicName-fr-dark-390.webp`, `g1-arabicName-fr-light-390.webp`, `g1-clubNull-ar-dark-1440.webp`, `g1-clubNull-ar-dark-390.webp`, `g1-clubNull-ar-light-1440.webp`, `g1-clubNull-ar-light-390.webp`, `g1-clubNull-fr-dark-1440.webp`, `g1-clubNull-fr-dark-390.webp`, `g1-clubNull-fr-light-1440.webp`, `g1-clubNull-fr-light-390.webp`, `g1-forming1-ar-dark-1440.webp`, `g1-forming1-ar-dark-390.webp`, `g1-forming1-ar-light-1440.webp`, `g1-forming1-ar-light-390.webp`, `g1-forming1-fr-dark-1440.webp`, `g1-forming1-fr-dark-390.webp`, `g1-forming1-fr-light-1440.webp`, `g1-forming1-fr-light-390.webp`, `g1-founder-ar-dark-1440.webp`, `g1-founder-ar-dark-390.webp`, `g1-founder-ar-light-1440.webp`, `g1-founder-ar-light-390.webp`, `g1-founder-fr-dark-1440.webp`, `g1-founder-fr-dark-390.webp`, `g1-founder-fr-light-1440.webp`, `g1-founder-fr-light-390.webp`, `g1-guest-ar-dark-1440.webp`, `g1-guest-ar-dark-390.webp`, `g1-guest-ar-light-1440.webp`, `g1-guest-ar-light-390.webp`, `g1-guest-fr-dark-1440.webp`, `g1-guest-fr-dark-390.webp`, `g1-guest-fr-light-1440.webp`, `g1-guest-fr-light-390.webp`, `g1-guestTryOn-ar-dark-1440.webp`, `g1-guestTryOn-ar-dark-390.webp`, `g1-guestTryOn-ar-light-1440.webp`, `g1-guestTryOn-ar-light-390.webp`, `g1-guestTryOn-fr-dark-1440.webp`, `g1-guestTryOn-fr-dark-390.webp`, `g1-guestTryOn-fr-light-1440.webp`, `g1-guestTryOn-fr-light-390.webp`, `g1-homa-ar-dark-1440.webp`, `g1-homa-ar-dark-390.webp`, `g1-homa-ar-light-1440.webp`, `g1-homa-ar-light-390.webp`, `g1-homa-fr-dark-1440.webp`, `g1-homa-fr-dark-390.webp`, `g1-homa-fr-light-1440.webp`, `g1-homa-fr-light-390.webp`, `g1-legend-ar-dark-1440.webp`, `g1-legend-ar-dark-390.webp`, `g1-legend-ar-light-1440.webp`, `g1-legend-ar-light-390.webp`, `g1-legend-fr-dark-1440.webp`, `g1-legend-fr-dark-390.webp`, `g1-legend-fr-light-1440.webp`, `g1-legend-fr-light-390.webp`, `g1-longNameLatin-ar-dark-390.webp`, `g1-longNameLatin-ar-light-390.webp`, `g1-longNameLatin-fr-dark-390.webp`, `g1-longNameLatin-fr-light-390.webp`, `g1-rated-ar-dark-1440.webp`, `g1-rated-ar-dark-390.webp`, `g1-rated-ar-light-1440.webp`, `g1-rated-ar-light-390.webp`, `g1-rated-fr-dark-1440.webp`, `g1-rated-fr-dark-390.webp`, `g1-rated-fr-light-1440.webp`, `g1-rated-fr-light-390.webp`

### `hero` (32)

`hero-founder-ar-dark-1440.webp`, `hero-founder-ar-dark-390.webp`, `hero-founder-ar-light-1440.webp`, `hero-founder-ar-light-390.webp`, `hero-founder-fr-dark-1440.webp`, `hero-founder-fr-dark-390.webp`, `hero-founder-fr-light-1440.webp`, `hero-founder-fr-light-390.webp`, `hero-launchArrival-ar-light-390.webp`, `hero-launchArrival-fr-light-390.webp`, `hero-legend-ar-dark-1440.webp`, `hero-legend-ar-dark-390.webp`, `hero-legend-ar-light-1440.webp`, `hero-legend-ar-light-390.webp`, `hero-legend-fr-dark-1440.webp`, `hero-legend-fr-dark-390.webp`, `hero-legend-fr-light-1440.webp`, `hero-legend-fr-light-390.webp`, `hero-rated-ar-dark-1440.webp`, `hero-rated-ar-dark-390.webp`, `hero-rated-ar-light-1440.webp`, `hero-rated-ar-light-390.webp`, `hero-rated-fr-dark-1440.webp`, `hero-rated-fr-dark-390.webp`, `hero-rated-fr-light-1440.webp`, `hero-rated-fr-light-390.webp`, `hero-returning-ar-light-390.webp`, `hero-returning-fr-light-390.webp`, `hero-seasonClosed-ar-light-390.webp`, `hero-seasonClosed-fr-light-390.webp`, `hero-tierUp-ar-light-390.webp`, `hero-tierUp-fr-light-390.webp`

### `born` (2)

`born-born0Serial-ar-light-390.webp`, `born-born0Serial-fr-light-390.webp`

### `teamBorn` (4)

`teamBorn-born0Serial-ar-dark-390.webp`, `teamBorn-born0Serial-ar-light-390.webp`, `teamBorn-born0Serial-fr-dark-390.webp`, `teamBorn-born0Serial-fr-light-390.webp`

### `g1People` (4)

`g1People-rated-ar-dark-390.webp`, `g1People-rated-ar-light-390.webp`, `g1People-rated-fr-dark-390.webp`, `g1People-rated-fr-light-390.webp`

### `g1Club` (4)

`g1Club-rated-ar-dark-390.webp`, `g1Club-rated-ar-light-390.webp`, `g1Club-rated-fr-dark-390.webp`, `g1Club-rated-fr-light-390.webp`

### `g1Seasons` (4)

`g1Seasons-rated-ar-dark-390.webp`, `g1Seasons-rated-ar-light-390.webp`, `g1Seasons-rated-fr-dark-390.webp`, `g1Seasons-rated-fr-light-390.webp`

### `g1GuestPoints` (4)

`g1GuestPoints-guest-ar-dark-390.webp`, `g1GuestPoints-guest-ar-light-390.webp`, `g1GuestPoints-guest-fr-dark-390.webp`, `g1GuestPoints-guest-fr-light-390.webp`

### `g2` (16)

`g2-founder-ar-dark-1440.webp`, `g2-founder-ar-dark-390.webp`, `g2-founder-ar-light-1440.webp`, `g2-founder-ar-light-390.webp`, `g2-founder-fr-dark-1440.webp`, `g2-founder-fr-dark-390.webp`, `g2-founder-fr-light-1440.webp`, `g2-founder-fr-light-390.webp`, `g2-rated-ar-dark-1440.webp`, `g2-rated-ar-dark-390.webp`, `g2-rated-ar-light-1440.webp`, `g2-rated-ar-light-390.webp`, `g2-rated-fr-dark-1440.webp`, `g2-rated-fr-dark-390.webp`, `g2-rated-fr-light-1440.webp`, `g2-rated-fr-light-390.webp`

### `g2Ladder` (8)

`g2Ladder-rated-ar-dark-1440.webp`, `g2Ladder-rated-ar-dark-390.webp`, `g2Ladder-rated-ar-light-1440.webp`, `g2Ladder-rated-ar-light-390.webp`, `g2Ladder-rated-fr-dark-1440.webp`, `g2Ladder-rated-fr-dark-390.webp`, `g2Ladder-rated-fr-light-1440.webp`, `g2Ladder-rated-fr-light-390.webp`

### `g2Founder` (8)

`g2Founder-founder-ar-dark-1440.webp`, `g2Founder-founder-ar-dark-390.webp`, `g2Founder-founder-ar-light-1440.webp`, `g2Founder-founder-ar-light-390.webp`, `g2Founder-founder-fr-dark-1440.webp`, `g2Founder-founder-fr-dark-390.webp`, `g2Founder-founder-fr-light-1440.webp`, `g2Founder-founder-fr-light-390.webp`

### `g3` (8)

`g3-rated-ar-dark-1440.webp`, `g3-rated-ar-dark-390.webp`, `g3-rated-ar-light-1440.webp`, `g3-rated-ar-light-390.webp`, `g3-rated-fr-dark-1440.webp`, `g3-rated-fr-dark-390.webp`, `g3-rated-fr-light-1440.webp`, `g3-rated-fr-light-390.webp`

### `g4` (8)

`g4-rated-ar-dark-1440.webp`, `g4-rated-ar-dark-390.webp`, `g4-rated-ar-light-1440.webp`, `g4-rated-ar-light-390.webp`, `g4-rated-fr-dark-1440.webp`, `g4-rated-fr-dark-390.webp`, `g4-rated-fr-light-1440.webp`, `g4-rated-fr-light-390.webp`

### `g6` (12)

`g6-rated-ar-dark-1440.webp`, `g6-rated-ar-dark-390.webp`, `g6-rated-ar-light-1440.webp`, `g6-rated-ar-light-390.webp`, `g6-rated-fr-dark-1440.webp`, `g6-rated-fr-dark-390.webp`, `g6-rated-fr-light-1440.webp`, `g6-rated-fr-light-390.webp`, `g6-returning-ar-light-390.webp`, `g6-returning-fr-light-390.webp`, `g6-seasonClosed-ar-light-390.webp`, `g6-seasonClosed-fr-light-390.webp`

### `replay` (10)

`replay-founder-ar-light-390.webp`, `replay-founder-fr-light-390.webp`, `replay-returning-ar-dark-1440.webp`, `replay-returning-ar-dark-390.webp`, `replay-returning-ar-light-1440.webp`, `replay-returning-ar-light-390.webp`, `replay-returning-fr-dark-1440.webp`, `replay-returning-fr-dark-390.webp`, `replay-returning-fr-light-1440.webp`, `replay-returning-fr-light-390.webp`

### `share` (12)

`share-founder-ar-light-390.webp`, `share-founder-fr-light-390.webp`, `share-legend-ar-light-390.webp`, `share-legend-fr-light-390.webp`, `share-rated-ar-dark-1440.webp`, `share-rated-ar-dark-390.webp`, `share-rated-ar-light-1440.webp`, `share-rated-ar-light-390.webp`, `share-rated-fr-dark-1440.webp`, `share-rated-fr-dark-390.webp`, `share-rated-fr-light-1440.webp`, `share-rated-fr-light-390.webp`

### `picture` (15)

`picture-arabicName-ar-light-1080.webp`, `picture-arabicName-fr-light-1080.webp`, `picture-clubNull-ar-light-1080.webp`, `picture-clubNull-fr-light-1080.webp`, `picture-founder-ar-light-1080.webp`, `picture-founder-fr-light-1080.webp`, `picture-homa-ar-light-1080.webp`, `picture-homa-fr-light-1080.webp`, `picture-legend-ar-light-1080.webp`, `picture-legend-fr-light-1080.webp`, `picture-longNameLatin-ar-light-1080.webp`, `picture-longNameLatin-fr-light-1080.webp`, `picture-rated-ar-light-1080.webp`, `picture-rated-fr-dark-1080.webp`, `picture-rated-fr-light-1080.webp`

### `setup-name` (8)

`setup-name-rated-ar-dark-1440.webp`, `setup-name-rated-ar-dark-390.webp`, `setup-name-rated-ar-light-1440.webp`, `setup-name-rated-ar-light-390.webp`, `setup-name-rated-fr-dark-1440.webp`, `setup-name-rated-fr-dark-390.webp`, `setup-name-rated-fr-light-1440.webp`, `setup-name-rated-fr-light-390.webp`

### `setup-club` (8)

`setup-club-rated-ar-dark-1440.webp`, `setup-club-rated-ar-dark-390.webp`, `setup-club-rated-ar-light-1440.webp`, `setup-club-rated-ar-light-390.webp`, `setup-club-rated-fr-dark-1440.webp`, `setup-club-rated-fr-dark-390.webp`, `setup-club-rated-fr-light-1440.webp`, `setup-club-rated-fr-light-390.webp`

### `profile-delete` (4)

`profile-delete-rated-ar-dark-390.webp`, `profile-delete-rated-ar-light-390.webp`, `profile-delete-rated-fr-dark-390.webp`, `profile-delete-rated-fr-light-390.webp`

### `hub-guest-intro` (8)

`hub-guest-intro-rated-ar-dark-1440.webp`, `hub-guest-intro-rated-ar-dark-390.webp`, `hub-guest-intro-rated-ar-light-1440.webp`, `hub-guest-intro-rated-ar-light-390.webp`, `hub-guest-intro-rated-fr-dark-1440.webp`, `hub-guest-intro-rated-fr-dark-390.webp`, `hub-guest-intro-rated-fr-light-1440.webp`, `hub-guest-intro-rated-fr-light-390.webp`

### `hub-owner` (23)

`hub-owner-born0-ar-light-390.webp`, `hub-owner-born0-fr-light-390.webp`, `hub-owner-forming1-ar-dark-1440.webp`, `hub-owner-forming1-ar-dark-390.webp`, `hub-owner-forming1-ar-light-1440.webp`, `hub-owner-forming1-ar-light-390.webp`, `hub-owner-forming1-fr-dark-1440.webp`, `hub-owner-forming1-fr-dark-390.webp`, `hub-owner-forming1-fr-light-1440.webp`, `hub-owner-forming1-fr-light-390.webp`, `hub-owner-homa-fr-light-390.webp`, `hub-owner-insufficient3-ar-light-390.webp`, `hub-owner-insufficient3-fr-light-390.webp`, `hub-owner-legend-fr-light-390.webp`, `hub-owner-rated-ar-dark-1440.webp`, `hub-owner-rated-ar-dark-390.webp`, `hub-owner-rated-ar-light-1440.webp`, `hub-owner-rated-ar-light-390.webp`, `hub-owner-rated-fr-dark-1440.webp`, `hub-owner-rated-fr-dark-390.webp`, `hub-owner-rated-fr-light-1440.webp`, `hub-owner-rated-fr-light-390.webp`, `hub-owner-seasonClosed-fr-light-390.webp`

### `create-name-guest` (2)

`create-name-guest-rated-ar-light-390.webp`, `create-name-guest-rated-fr-light-390.webp`

### `create-name-signedin` (2)

`create-name-signedin-rated-ar-light-390.webp`, `create-name-signedin-rated-fr-light-390.webp`

### `create-name-return` (2)

`create-name-return-rated-ar-light-390.webp`, `create-name-return-rated-fr-light-390.webp`

### `team-born` (2)

`team-born-born0-ar-light-390.webp`, `team-born-born0-fr-light-390.webp`

### `rankings-token` (10)

`rankings-token-forming1-ar-light-390.webp`, `rankings-token-forming1-fr-light-390.webp`, `rankings-token-rated-ar-dark-1440.webp`, `rankings-token-rated-ar-dark-390.webp`, `rankings-token-rated-ar-light-1440.webp`, `rankings-token-rated-ar-light-390.webp`, `rankings-token-rated-fr-dark-1440.webp`, `rankings-token-rated-fr-dark-390.webp`, `rankings-token-rated-fr-light-1440.webp`, `rankings-token-rated-fr-light-390.webp`

### `hint-cap` (2)

`hint-cap-forming1-ar-light-390.webp`, `hint-cap-forming1-fr-light-390.webp`

### `hint-sel` (1)

`hint-sel-forming1-fr-light-390.webp`

### `hint-trf` (2)

`hint-trf-forming1-ar-light-390.webp`, `hint-trf-forming1-fr-light-390.webp`

### `first-transfer-line` (2)

`first-transfer-line-insufficient3-ar-light-390.webp`, `first-transfer-line-insufficient3-fr-light-390.webp`

### `league-band` (8)

`league-band-rated-ar-dark-1440.webp`, `league-band-rated-ar-dark-390.webp`, `league-band-rated-ar-light-1440.webp`, `league-band-rated-ar-light-390.webp`, `league-band-rated-fr-dark-1440.webp`, `league-band-rated-fr-dark-390.webp`, `league-band-rated-fr-light-1440.webp`, `league-band-rated-fr-light-390.webp`

### `gallery-full-tiers` (4)

`gallery-full-tiers-ar-dark-1700.webp`, `gallery-full-tiers-ar-light-1700.webp`, `gallery-full-tiers-fr-dark-1700.webp`, `gallery-full-tiers-fr-light-1700.webp`

### `gallery-full-states` (4)

`gallery-full-states-ar-dark-1700.webp`, `gallery-full-states-ar-light-1700.webp`, `gallery-full-states-fr-dark-1700.webp`, `gallery-full-states-fr-light-1700.webp`

### `gallery-tokens` (4)

`gallery-tokens-ar-dark-1000.webp`, `gallery-tokens-ar-light-1000.webp`, `gallery-tokens-fr-dark-1000.webp`, `gallery-tokens-fr-light-1000.webp`

## Format

The PNGs the capture scripts write come to 129 MB (the full set 119.6 MB, the gallery 9.7 MB; a 780 × 1688
picture of a knitted card is 0.3 to 0.9 MB), over the 40 MB the brief allows for PNG, so the committed
card pictures are **WebP** (`to-webp.py`, quality 92, method 6, never resized): 319 files, 37.5 MB. Against
the PNGs, measured on five of the committed files at quality 92, the mean absolute difference per channel
is 0.5 to 1.4 of 255 (`g3-rated-fr-light-390` 0.48, `g1-legend-ar-dark-390` 1.15,
`hero-legend-fr-light-390` 1.07, `picture-legend-fr-light-1080` 1.44, `gallery-tokens-fr-light-1000`
0.61; the 99th percentile 7 to 14), and small text and the 24 px minis read the same side by side. The PNGs are
not committed: re-running the scripts writes them again. The **switch-off folder stays PNG** (6.0 MB with
`report.json`) because `wp1/compare-off.mjs` reads PNG captures and the after run compares
against this folder directly. The after set is saved the same way, WebP for the card pictures, so a
pair is two WebP files with one name.

## What was measured while capturing

| Check                                                                                          | How                                                                                                                                                           | Result                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The tree captured is `main` `8fae526c` and unchanged                                           | `git -C /home/user/mc-sorare-base rev-parse HEAD` and `git status --short` after the run; `git diff --stat 8fae526c 73630b4b -- src public`                   | `8fae526cf86ca143cf5d45beba9fde7763b8351e`, 0 changed files; the branch's source differs from `main` by 0 files                                                                                                                                                                       |
| The incumbent renderer drew every picture that has a card                                      | `capture-log.json`, per picture: the class of the first `[role="img"]` the page drew                                                                          | 197 pictures draw `mc-echarpe` cards, 99 more draw `mc-tk` tokens (the Écharpe's token), 11 draw no card art (the text-only surfaces above); the gallery's 12 pictures say `echarpe-v2` in `capture-log-gallery.json`                                                                 |
| Language and direction                                                                         | per picture: `html[data-lang]` and `dir` read after the capture against the file name                                                                         | 307 of 307 agree: `fr` pictures are `ltr`, `ar` pictures `rtl`                                                                                                                                                                                                                        |
| No console error, page error, failed request or HTTP status of 400 or more on any card picture | the same listeners on every page of every picture                                                                                                             | none on 307 pictures and 12 gallery pictures; 2 pictures (`picture-forming1-*`) were dropped, see below                                                                                                                                                                               |
| The share picture does not depend on the theme                                                 | `picture-rated-fr-light-1080` and `picture-rated-fr-dark-1080` taken from the same page in the two themes                                                     | the two PNGs have the same md5 (`d8ba09f07ac6051f50ade5ec7957e81a`) and no differing pixel; the other fixtures are saved in light                                                                                                                                                     |
| The switch-off set is today's app                                                              | the preview-off pictures against the owner's reference set `manager-card-section/before/`, per pixel (a channel off by more than 2 of 255 counts), same sizes | Pépites 0.000% (3 pictures), Home 0.065% and 0.101%, Fantasy 0.156%, 0.389%, 0.507% and 0.508%: the same residuals `manager-card-section/wp6b` reports for the base tree (Pépites 0.000%, Home 0.065% and 0.101%, Fantasy 0.156% to 0.508%; a countdown and fonts, no card)           |
| The section is off in that set                                                                 | `report.json`: the four `/gradins*` addresses without following redirects                                                                                     | 307 to `/fantasy` on all four                                                                                                                                                                                                                                                         |
| Home logs a hydration `pageerror` on the dev server                                            | one page, `/`, visited with and without Playwright's fixed clock                                                                                              | 0 errors without the clock, 1 with it: the server renders with the real time and the browser with the fixed one. It is the capture's clock, not the app; React rebuilds the tree and the picture is the same. `report.json` records it for the 8 Home pages; no card picture logs one |

## What is not here, and why

- **The server HTML of the switch-off pages** (`capture-switch-off.mjs` writes it to `switch-off/html/`): the
  repository's `format:check` would reformat it, and `compare-off.mjs` needs the bytes. It is kept out;
  the after run captures both trees fresh, as `manager-card-section/wp1` did. SHA-256 of the raw HTML of
  this capture, for the record: `/` 459b2def2ccc290e (home), `/` returning 388aea487b540e0f (home-returning),
  `/fantasy` af6de00341d0ce02, `/pepites` 7ed972472851cfa8, `/matches` ad68f089e9ea5c43 (first 16 hex
  digits; 166,921, 166,921, 66,740, 156,800 and 94,659 bytes).
- **`picture-forming1-*`**: a card with no number has no share sheet (the page offers the invitation
  instead), so there is no picture to save. The two attempts timed out looking for the share button and
  were removed from the script; `capture-log.json` lists them under `dropped`.
- **G1 « Club » and « Saisons » at 1440**: at 1440 the card column is sticky and the page already shows
  those blocks beside it in the `g1-*` pictures; the two extra pictures showed nothing new and were dropped.
- **The recap line (`RecapCardLine`), the late signer's hub line and the import prompt's block**: the mock
  data has no finished round with a card that counts it, nor a cloud account with an empty cloud squad,
  so these are not reachable in any picture (as `manager-card-section/wp5/INDEX.md` already says).
- **Motion**: the pictures are at rest (reduced motion). The beats, the sway and the idle states are
  measured, not pictured, in the after run's own measurements.
- **The after set's new compositions** (the redrawn 80, 64, 48 and 32 px tokens, the G4 card's own
  sizing) have no before of their own: the incumbent's tokens at every size are in `gallery-tokens-*`.

## Servers

One development server at a time was started from `/home/user/mc-sorare-base`, on port 4190 only, and each
was stopped by its process id before the next: preview on (the card pictures, the retries, the gallery),
preview off (`switch-off/`), then preview on again for the last scenes added to the script (`g1People`,
`g1Club`, `g1Seasons`, `g1GuestPoints`, `setup-*`, `profile-delete`). It is the same tree at the same commit
throughout (`git status` clean, `HEAD` unchanged). Nothing is left running. No database, migration, Edge
Function, deployment or Lovable call was made, and nothing was pushed.
