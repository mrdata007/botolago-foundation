# Manager Card: the club's real crest on the tab

Owner request, approved 2026-10-10. Screen: the Manager Card (Curva), renderer `eclat-v1`
(`src/components/manager-card/eclat/`). Branch `claude/manager-card-club-crest`.

## What was inspected

- The tab above the shield (top-left in French, top-right in Arabic) carries the season and a
  disc 108 units across (`DISC`, `geometry.ts`): the club's primary colour, a ring in its second
  colour and the club's initials (`plate.ts`, `ornament.ts` `tabDisc`). The face-à-face card
  (`compact`) draws the same disc without the initials. With no club it is a neutral hexagon.
- Tokens and minis (24 to 80 px, `token.ts`) have no disc: only the shirt and the number.
- The share picture (`moments/card-share-image.ts`) draws the card's art (the same disc and the
  initials as a canvas run) and a second club disc with initials beside the name.
- The card's club comes from the Manager Card API (`cardClubSchema`): no crest URL. The app's
  football catalogue (`footballService.getClubs`, query `["football", "clubs", lang]`) has each
  club's crest; `src/components/curva/club-resolve.ts` already joins a card club to it by id,
  then slug, then name.

## What must be preserved

- The disc's place and size on the tab, the season under it, the tab, the shield, the shirt, the
  number, the name, the stats, the serial, the tier plaque and marks, the foil, the beats and the
  tilt; every business rule (rating, tiers, forming marks, founder).
- The monogram disc exactly as it is today whenever there is no crest, while the crest has not
  loaded yet, or when it fails to load. The neutral hexagon for a card with no club.
- The Arabic mirror (the tab on the right) without mirroring the crest picture itself; the
  markup-safety contract (one escape, a tag allow-list, no handlers).
- Sharing: the picture must still be produced when the crest cannot be drawn on a canvas.
- No database or migration change: the crest comes from the catalogue the front end already loads.

## The improvement

- Full card and face-à-face card: when the club has a crest and it has loaded, the disc becomes a
  light plate (as `ClubCrest` draws a crest: club badges are drawn for a light ground) ringed in
  the club's colour, with the crest inside it, in the same spot and at the same size; the initials
  are not drawn over it.
- Share picture: the same plate and crest on the card's tab and on the disc beside the name, when
  the crest loads with CORS (so the canvas stays exportable); otherwise the monogram, as today.

## Acceptance criteria

Visual

- A club with a crest shows the crest on a light plate at the tab's disc position, French (left)
  and Arabic (right), light and dark theme, 390 px mobile and desktop; the crest is never mirrored.
- No crest, a crest that is still loading, or a broken crest URL: the current monogram disc,
  never a broken-image glyph and never an empty plate.
- Nothing else on the card moves (compare before/after screenshots).

Functional

- The crest URL is validated (https, local http, or a raster `data:image`) and escaped; anything
  else is dropped and the monogram is drawn. The markup-safety check allows `<image>` only with
  such an `href`.
- The share picture is produced in every case; with a crest that cannot be read with CORS it
  falls back to the monogram.
- Unit tests cover the crest-versus-monogram choice; typecheck, the manager-card tests, ESLint,
  Prettier and the build pass.

## Evidence (2026-10-10)

Measured on a development server in the mock data modes (`/curva/carte?mc=rated`, Chromium
1194, 2x, reduced motion); no database was read or written. The mock football catalogue has no
crest images, so for the screenshots only the browser's copy of the mock repository is given a crest
URL per club, answered with `test-crest.png`, an invented shield marked « TEST »
(`make-test-crest.mjs`); nothing in the app is changed for it.

- `capture.mjs`: `screenshots/before-ok-*` (before the change), `after-ok-*` (crest loads),
  `after-broken-*` (crest answers 404), at 390 and 1440 px, French and Arabic, light and dark
  theme; `*-tab.png` is the tab enlarged.
- `compare.mjs`: every `after-ok` differs from `before` only inside the tab's disc (about 5–16 % of
  the width at the inline start, 5–12 % of the height); every `after-broken` is pixel-identical to
  `before`.
- `share-check.mjs`: the share picture drawn by the app's code in Chromium, with the crest served
  from a second origin with CORS (`screenshots/share-cors-*`: crest on the tab and beside the name)
  and without (`share-nocors-*`: the initials, and a PNG still comes back).
