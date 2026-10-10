# Manager Card collectible redesign: the AFTER set

The collectible (Éclat, renderer `eclat-v1`) on every surface that draws it, captured from the
redesign branch after round 2 (§18 of
[`../../MANAGER_CARD_SORARE_STYLE_PLAN.md`](../../MANAGER_CARD_SORARE_STYLE_PLAN.md); the first set was taken at the review-fix
commit `5e903f60`, §17), so it can be laid
beside the BEFORE set ([`../before/INDEX.md`](../before/INDEX.md)) **name for name**: every file here has the
file name of a file there (`g1-rated-fr-light-390.webp` is the same page, state, language, theme and
width in both). The criteria it serves are in
[`../../MANAGER_CARD_SORARE_STYLE_BRIEF.md`](../../MANAGER_CARD_SORARE_STYLE_BRIEF.md). Nothing here touched
a database: the server ran in the mock data modes.

## Where the pictures come from

| What                     | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tree captured            | `/home/user/mc-sorare`, branch `claude/manager-card-sorare-style` at `18f921ee` (the last source commit: the round 2 review fixes; the commits after it only touch documentation and measurement results), with `src/`, `public/`, `scripts/` and `tests/` exactly as committed (`git status --short` empty before the run). It replaces the set of the integration (port 4440 at `8e0c57ed`, last source commit `98a02df1`): of the 375 pictures, 231 differ and 144 are byte for byte the same (the surfaces that draw tokens only: the hub, rankings, league, setup, seasons and « Les vôtres » blocks); 213 differ in more than 0.1 % of their pixels (a channel off by more than 24 of 255) and 32 in more than 1 % (the close-ups and the gallery's full cards: 1.2 % median, up to 2.2 %). What changed in them is the card's outer line, drawn wider (5 units shown instead of 1.5, plan §18) and, on CHAMPION and LEGEND, the foil stopping short of it; the touch float, which the review fixes also changed, is motion and is not in a picture. The G1 phone pictures differ by 0.33 % at the median (up to 0.99 %), G2 0.40 %, the heroes 0.52 %, the share sheet 0.17 % |
| Renderer in the pictures | `eclat-v1`: the card's root class is `mc-eclat …` (191 pictures), its tokens are `mc-tok` (105 pictures), 11 pictures draw no card art (the text-only surfaces). Recorded per picture in `capture-log.json`, `drawn.root`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Server                   | `bun run dev` of that tree on **port 4490** (the finishing session's own port; round 2's integration used 4440), started for this run and stopped by its process id afterwards; no other server was measured. The same command as the BEFORE set (its page), with `--port 4490` and `VITE_MANAGER_CARD_PREVIEW=1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Scripts                  | The BEFORE set's, unchanged: `node docs/product/manager-card-sorare-style/before/capture-before.mjs --base=http://127.0.0.1:4490 --out=<dir> --jobs=3`, then `before/capture-gallery.mjs`, `wp4/capture-gallery-all.mjs` and `wp4/detail-crops.mjs`, then `before/to-webp.py` (WebP quality 92, never resized)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Browser and viewports    | Chromium `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, Playwright from the repository; 390 × 844 at device scale 2 (780 × 1688 files) and 1440 × 900 at scale 1; the share picture is 1080 × 1920 (its own pixels)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Clock and motion         | clock fixed at 2026-10-08T20:00:00Z (a countdown reads the same as in the BEFORE set), `prefers-reduced-motion: reduce` (the card is at rest)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Account and data         | the mock auth's demo account seeded into storage (« guest » pictures are signed out); the development fixtures of `src/backend/manager-card/fixtures.ts` chosen with `?mc=<fixture>`; the card prints « Exemple » / «مثال» (`sample`) as the preview does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

The eight surfaces the review asked to see are `g2` (votre carte), `g3` (les vôtres), `g4` (face à face,
French and Arabic), `g6` (seasons), `hero`, `share` (the sheet), `picture` (the exported image itself, French
and Arabic) and `hub-owner` / `rankings-token` / `league-band` (the in-line Fantasy surfaces), each at 390 @2×
in French and Arabic, light and dark where the table says so.

Names are `<screen>-<fixture>-<lang>-<theme>-<width>`, as in the BEFORE set (see its « Conventions the
pictures follow »: a hero and the stage are two pictures, the « MODE DÉMO » pill sits over the foot of some
pictures, viewport pictures rather than full pages, the share picture does not depend on the theme).

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

Pictures in this folder: 319, 23.0 MB.

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

WebP for the card pictures, as the BEFORE set (`before/to-webp.py`, quality 92, method 6, never resized): 319
files, 23.0 MB (the PNGs the scripts write were 113.3 MB and are not committed: re-running the scripts writes
them again). `capture-log.json` and `capture-log-gallery.json` are the scripts' own logs.

## What was measured while capturing

| Check                                                                       | How                                                                                   | Result                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The new renderer drew every picture that has a card                         | `capture-log.json`, per picture: the class of the first `[role="img"]` the page drew  | 191 `mc-eclat` cards, 105 `mc-tok` tokens, 11 pictures with no card art (the same 11 text-only surfaces as before); the gallery's 12 pictures say `eclat-v1` in `capture-log-gallery.json`                             |
| Same names as the BEFORE set                                                | the two logs, by name                                                                 | 307 of 307 card pictures and 12 of 12 gallery pictures have the name of a BEFORE picture, and no BEFORE picture is missing                                                                                             |
| Language and direction                                                      | per picture: `html[data-lang]` and `dir` read after the capture against the file name | 307 of 307 agree: `fr` pictures are `ltr`, `ar` pictures `rtl`                                                                                                                                                         |
| No console error, page error, failed request or HTTP status of 400 or more  | the same listeners on every page of every picture                                     | none on 307 pictures and 12 gallery pictures                                                                                                                                                                           |
| What differs in composition from the BEFORE set, apart from the card itself | the two logs, kind of card art per name                                               | the born panel on the team page (`teamBorn-*`, `team-born-*`: 6 pictures) draws the 80 px **token** where the BEFORE set drew a 96 px card (review fix: the compact card's text is 6 px at 96 px, see §17 of the plan) |

## What is not here, and why

- **`switch-off/`**: the section-off pictures are not taken again here. The switch-off comparison against `main`
  (production builds of both trees, 0.0000 % on every picture, byte-identical server HTML) is in
  [`../wp4/results/switch-off-compare.txt`](../wp4/results/switch-off-compare.txt), and the built-output
  Playwright spec `tests/e2e/gradins-off.e2e.ts` was run for the commit that adds this folder.
- **No picture was taken twice in this run.** The development server was warmed up first (one browser visit to
  eight routes, so Vite had compiled the card's modules), and the log shows 307 captured, 0 failed, no problem
  and no skeleton: every card drawn carries `data-mc-ready` (the founder pages and the replay sheet count the
  founder detail's crop as a card without that attribute, as in the BEFORE set).
- **`picture-forming1-*`, G1 « Club » and « Saisons » at 1440, the recap line, the late signer's line and the
  import prompt's block**: absent for the reasons the BEFORE set gives.
- **Motion**: the pictures are at rest. The tilt, the beats and the idle float are measured in
  `src/components/manager-card/eclat/README.md` and the Playwright suite, not pictured.

## Two subfolders (not part of the name-for-name set)

- **`gallery/`** (28 sheets): every fixture and tier at every size, light and dark, French and Arabic, by
  [`../wp4/capture-gallery-all.mjs`](../wp4/capture-gallery-all.mjs): `full-fixtures-<lang>-<theme>` (every fixture with a card and the
  guest at 296 px), `full-tiers-…` (six tiers on four clubs at 264 px), `tokens-fixtures-…` (every fixture at 80, 64, 56, 48, 44, 32, 28
  and 24 px), `tokens-tiers-<size>-…` (six tiers on every club and on none at 80, 64, 48 and 32 px). Cards at rest, as `ManagerCard` and
  `CardToken` insert them. Log: `gallery/capture-log-gallery-all.json`.
- **`detail/`** (28 close-ups) by [`../wp4/detail-crops.mjs`](../wp4/detail-crops.mjs), 3 device pixels per CSS pixel:
  `art-<tier>-fr-<theme>` (the shield, the shirt and the number of each tier), `plate-<tier>-fr-dark` (plaque, name, stats, serial),
  `art-legend-ar-dark` and `plate-legend-ar-dark`, and `crisp-<pro|legend>-dpr<2|3>-<rest|tilt>` (a PRO and a LEGEND card whole, at
  rest and with the pointer over the upper part). The first take of the four tilted pictures had no tilt in three of them (the page had
  just loaded); they were taken again alone and the log records the computed transform of each.

## Servers

One development server, on port 4490 only, started for this run from the tree above and stopped by its process
id at the end of the WP4 measurements. Nothing is left running. No database, migration, Edge Function, deployment or Lovable call was
made, and nothing was pushed.
