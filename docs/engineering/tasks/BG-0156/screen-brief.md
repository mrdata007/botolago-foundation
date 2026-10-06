# BG-0156 · Pépites visuals from data and real assets (screen brief)

Owner request, 2026-10-06, from a real iPhone in dark mode: "add more visuals
to pepites, the page looks bland there are no visuals no AI SLOP". The owner
approved this screen work; merge and publish wait for the owner's OK on the
draft pull request.

Branch `claude/pepites-visuals`. This brief is committed on its own, before
any interface change, as AGENTS.md "Screen work" rule 3 requires; copy it
into the draft pull request description.

Scope: `/pepites` (the normal edition state and the "before the first
edition" state production shows today), `/pepites/classement` (phone table,
desktop table), the earlier-week page `/pepites/semaine/$n` (it reuses the
Top 10 parts), and the player page `/pepites/joueur/$playerId` only to keep
it consistent. Method, compare, reveal and admin are out of scope.

## What I inspected (before server on port 5500 = `main` at af8b0a74, production data, read-only)

- Production has no published edition: `pepites_version` answers
  `source: "previous_season"`, so `/pepites` shows "Classement final
  2025/2026" with a plain list of ten cards: rank, name, score. Nothing
  else, although the page already fetches the ranking rows for those ten
  players (`pepites_ranking`, 50 rows: club, position, age, minutes, goals,
  assists, rating).
- Every 2025/26 row has a club (40/40), position (40/40) and age (40/40).
  No row has a photo (0/40): `player_photo_for(player, 'app')` returns one
  only under a signed release for in-app use, so every disc is a silhouette
  today.
- The fourteen clubs of that list are all in the app's club catalogue
  (`football_team_catalog`, the same ids as `app.teams`), each with a
  SportsMonks crest path. Crests are cleared for in-app display (owner,
  2026-09-23); the rest of the app shows them in every match row and table.
- The edition state already has a feature card for N°1 (`TopTenHero`) and
  rich rows (club edge, photo disc, meta line, ten-segment bar). The
  fallback state uses none of it.
- `/pepites/classement` on a phone is a table with no club, no photo (the
  disc is hidden under a 384px table) and no picture of the score; from
  768px a three-card podium with shirts sits above a full table.
- The percentile wheel exists only in the story card (`share-image.ts`); the
  player page shows the same five percentiles as bars. Both read
  `score.percentiles` from `pepites_player`.

## What must be preserved

**Data and order.** The ranking order, ranks, scores, the editorial order of
an edition, the filters and sorts, load-more, followed players, the
"unranked" word, movement marks and the editor's line. Nothing in the
backend, `pepites-route.ts`, the queries' keys or the scoring changes. No
figure is invented: a value the data does not carry is a dash.

**The 3-round rule and its copy.** Before the first edition the page keeps
its own title ("Classement final {season}"), the season line, and the card
"Premier Top 10 de la saison après la journée {round}" with its body, from
the methodology's `first_edition_round` (3 by default). Last season's list is
never shown as this week's.

**Methodology and copy.** The method link, the "about" paragraph, every
existing string in French and Arabic. New copy only if a visual needs a
label the dictionaries lack, in both languages.

**Photo rights.** A player photo shows only when the read RPC returns one
(the release allows in-app use). No provider image, no share-scope change.
Crests only from the club catalogue the app already shows.

**Test contracts.** Every `data-testid` the e2e suites read stays on an
element doing the same job: ten `pepites-top-entry` links on `/pepites` (N°1
plus nine), `pepites-hero`, `pepites-edition-title`, `pepites-previous-title`,
`pepites-top10`, `pepites-before-first`, the filter chips, `pepites-ranking-row`
on the phone rows only (with the screen-reader position inside),
`pepites-desktop-table`, `pepites-desktop-filters`, exactly one visible `<h1>`
per breakpoint. `pepites-desktop-podium` is replaced (see below), so the e2e
lines that read it are updated to the new top-3 treatment, and only those.

**Accessibility.** Decorative images (`alt=""`, `aria-hidden`), every figure
also printed as text so colour or shape is never the only cue, the 44px tap
floor, focus rings, one link per row.

**Arabic and RTL.** Logical properties only, no Arabic letter-spacing, Latin
digits with no space inside a number, a name keeps its own direction where it
can be cut, no manual icon flip.

**Performance.** Sized images (every disc and the band have a fixed box, so
no layout shift when a crest or photo arrives), lazy below the fold, one
photo for the band from the existing 800/1600 assets, no new dependency. The
club catalogue is fetched in the browser only, never in the server render, so
a failed catalogue read cannot turn a Pépites page into a 503.

**Identity.** DESIGN.md: club colour only through the club palette, the
Earned Gradient only as the action colour (here: progress), Changa at most
800, the one lift, kit tokens in light and dark. None of the retired Pépites
layer (night band with a slanted cut, energy gradient, mono, slant, ghost
numbers, `--pepites-*`).

## Improvements being made

1. **Every row carries data you can see** (Top 10 rows in both states, and
   the ranking tables): the player's photo when its release allows in-app
   use, otherwise the club's crest from the catalogue (the club-colour disc
   with the club's initials while it loads or if it fails); the club colour
   as the inline-start edge (the 4px edge of the Pépites cards and the share
   pictures; in a table, the standings' start-edge bar); a meta line with
   club and position; the ten-segment score bar; ranks 1 to 3 on the white
   score plate with Tunnel Navy figures, as in the redrawn share pictures,
   and ranks 4+ muted. The before-first-edition list stops being a bare list:
   it uses the same rows as an edition, with the figures the page already
   loads.

2. **One top-3 treatment: a featured N°1** (not a podium). It replaces the
   edition's N°1 card, the bare first row of the fallback list, and the
   desktop podium of the ranking. Why this one and not a podium of three:
   - a three-across podium does not fit a 390px phone without cutting names
     (about 110px a column), and the phone is where the owner looked;
   - the edition state already leads with N°1, so both states and both pages
     get one structure;
   - it can show _why_ the player leads: the five parts of the Rising score
     as the five-slice percentile wheel of the story card (real
     `score.percentiles` from `pepites_player`, the same read and cache key
     as the player page, so opening the player is instant), where a podium
     can only repeat name and score;
   - ranks 2 and 3 keep their distinction in the list, on the white plate.

   The N°1 sits on the app's stadium photo band (the Home band's floodlit
   crowd photograph under a flat navy veil, full-bleed on a phone and a 16px
   panel from 640px, as Home and Matches put a photo band directly under
   their header). On it: the club colour as the inline-start edge, the rank
   on the white plate, the name in Changa, club · position · age, the score
   on the white score plate, the wheel with the photo or crest at its centre
   and the action gradient filling each slice from the inside out (progress,
   the Earned Gradient's job), a legend whose markers show which slice is
   which and print each percentile, and on `/pepites` the editor's line and
   four figures. A past week (`/pepites/semaine/$n`) shows no wheel: today's
   percentiles are not that week's.

3. **A header that is not flat, in the app's pattern.** The white title band
   stays, because on Pépites it holds controls that need a surface (filter
   chips, back pill, share and reveal buttons) and because every hub
   (Matches, News, Fantasy, Clubs) opens on it. The photo band follows it
   directly, as on Matches, where the white title band is followed by the
   photo date strip; the same photograph and construction as Home's band.

4. **Player page, consistent.** Its hero takes the club colour as its
   inline-start edge, like the rows and the band. Nothing else changes there.

Not done, on purpose: no new colours, shadows, radii or fonts; no glow,
blur, sparkle, confetti, emoji, decorative icon, glass or illustration; no
stock picture (the unused trophy photo `ranking-card.webp` stays unused: the
Pépites ranking has no trophy); no gradient other than the action gradient
on the wheel's values.

## Acceptance criteria (visual and functional)

Visual:

- `/pepites` in the fallback state, at 390px in dark (the owner's phone):
  the first screen shows the photo band with N°1's crest, wheel, plate and
  score, and every row under it a crest disc, club edge, meta line and
  ten-segment bar. Same in light, in Arabic (RTL mirrored: edge and plate on
  the right, slices running counter-clockwise like the story card), and at
  1440px.
- The edition state (shown locally by answering the page's own reads with an
  edition built from production rows) and `/pepites/semaine/$n` use the same
  band and rows.
- `/pepites/classement`: the band above the table when the list is in
  ranking order; phone rows with the club edge, crest disc (from a 352px
  table; dropped below it so a name keeps its width), position and club, the
  plate for 1 to 3 and the ten-segment bar under the score; desktop rows the
  same, in the full table.
- Contrast measured from rasterised sRGB pixels in both themes: body and
  muted text on the band ≥ 4.5:1 at its brightest point behind the text,
  plate figures ≥ 4.5:1, club edges and crest discs ≥ 3:1 against what they
  sit on (or the club palette's own measured edge).
- No horizontal overflow and nothing off-screen at 360, 390 and 1440px,
  measured with bounding rects; no name cut in the phone table at 360, 390,
  414 and 430px in French and Arabic.
- No layout shift when the crest catalogue or the percentiles arrive (fixed
  boxes); the band photo is one 800w/1600w `srcset`.

Functional:

- Ten `pepites-top-entry` links on `/pepites` in both states, N°1 first,
  each opening its player; filters still filter the Top 10 and the band.
- The percentile wheel shows exactly `score.percentiles` for the five parts
  in the methodology's order; an unknown part is an empty slice and a dash.
- Ranks, scores and order identical to before (checked row by row against
  the before server).
- Unit tests for the new pure geometry and the new glyphs (plate, disc
  order photo → crest → initials, wheel slices and mirror); the Pépites
  option-a guard and the share-image draw tests still pass; e2e lines that
  read the podium updated to the featured N°1.
- `bun run typecheck`, `bun run lint` (0 errors), `bun test`, prettier on
  the changed files, and the i18n gate if any dictionary or `t()` call
  changes.
