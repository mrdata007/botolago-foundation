# Manager Card, collectible style: design spec and build plan

The spec the implementers follow **literally**. Brief (preserve / improve / accept):
[`MANAGER_CARD_SORARE_STYLE_BRIEF.md`](MANAGER_CARD_SORARE_STYLE_BRIEF.md). Direction mock (open in a
browser, it follows this spec): [`manager-card-sorare-style/mock.html`](manager-card-sorare-style/mock.html).
Branch `claude/manager-card-sorare-style` from `main` `8fae526c`. Written 2026-10-09 by the design
director; nothing here has been built yet. **Revision 2 (same day, owner feedback on the mock):** more
pixels and fine detail (§3.2, §5.6), the number printed inside the shirt (§5.2), holographic items on
CHAMPION and LEGEND only (§5.5), real depth on every card (§8). Where revision 2 and an older line
disagree, revision 2 wins. **Revision 3 (same day, owner feedback on revision 2; record in §16):** the
jersey at measured proportions and drawn in 3D (§5.1), the number refitted to its chest (§5.2), a
honeycomb backboard with floodlights and pitch lines instead of the sci-fi field (§5.3), a shield-shaped
metal frame inside the unchanged outline (§3.2), the name under the artwork with the tier in a plaque
(§3.3), about half the drawn elements removed (§16), six material treatments (§5.4), restrained foil
(§5.5), tokens redrawn per size (§7). Where revision 3 and an older line disagree, revision 3 wins.
**Revision 3, critique fixes (same day; record in §16.1):** independent critics reviewed the revision 3
mock; their findings are applied in place in the sections above (flat and crisp at rest, the foil kept
off the tab, the shield raised 80 and a larger name, stats centred, LEGEND's own materials, a fuller
3D jersey in truer club colours, a real collar, lipped metal, token shirts that keep their sleeves, a
200 px G4 card). **Revision 3, confirmer fixes (same day; record in §16.2):** the G4 card specified at
its real phone widths (160 px, 136–138 px at a 320 px screen) with the stat labels dropped and every
remaining run ≥ 8 CSS px, and the base card's forming marks moved into the plaque so its name sits
exactly where every rated card's does. The sections above are the current spec.

Where this spec gives a number, use that number. Where it says "measure", measure in Chromium on the
built card and write the value into the module's README. Where something is not covered, follow the
incumbent plan ([`MANAGER_CARD_SECTION_PLAN.md`](MANAGER_CARD_SECTION_PLAN.md)) and say so in the
commit message.

---

## 0. Decisions (the build's defaults; owner questions in §15)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Model: Sorare's football card of the **2026-27 generation** (dark lacquered plate, raised tab, cut corner, lit tubes, two-face name). The rating is the centrepiece, as Sorare's in-app hex score is beside every card; on our card it is the shirt number.                                                                                                                               |
| D2  | No photo: **the shirt without the player** (rev. 3): a club-coloured match shirt at measured flat-lay proportions, drawn in 3D (volume, folds, fabric mesh, hem, cast shadow), framed in a shield on a honeycomb backboard in the tier colour with two floodlights and the centre circle. The rating is printed on its chest.                                                             |
| D3  | The card is a **dark object in both app themes** (Sorare's are). Theme changes only the outer edge, the rim and the drop shadow.                                                                                                                                                                                                                                                          |
| D4  | Six-step foil ladder: base (no tier) graphite · LASTREET steel · STADE amber · PRO red · CHAMPION ice blue · LEGEND violet + prism.                                                                                                                                                                                                                                                       |
| D5  | Name in two lines: first word in **Changa 800** caps; the rest in **Instrument Serif 400** caps (new, self-hosted, OFL, loaded only by the card chunk). Arabic names: Changa 800 over Changa 300.                                                                                                                                                                                         |
| D6  | Fixed aspect 1 : 1.618 for every card (no height that changes with the data).                                                                                                                                                                                                                                                                                                             |
| D7  | No card back, no flip: a flip hides the number (brief: never hidden), and the back would repeat the stats the page already shows under the card.                                                                                                                                                                                                                                          |
| D8  | Tilt, depth parallax and moving light on mouse and pen; on touch-only devices a slow idle float (7 s, ±0.3 of the tilt range) while the card is on screen; no device orientation; under reduced motion the card is still and keeps its static depth. At rest the card is flat 2D and crisp; 3D only while moving (critique fix, §8.2).                                                    |
| D9  | New renderer `src/components/manager-card/eclat/` (« éclat », the shine), id `eclat-v1`. Écharpe (`echarpe/`) is **deleted** in the last integration commit; git history keeps it.                                                                                                                                                                                                        |
| D10 | Tier `homa` is displayed **LASTREET** in French and Arabic (Latin word, isolated in Arabic). Key unchanged everywhere.                                                                                                                                                                                                                                                                    |
| D11 | Our serial stays `BOT #482913`. No « x/1000 »: our cards have no supply cap and the plan bans scarcity and count wording.                                                                                                                                                                                                                                                                 |
| D12 | **Premium through material, not ornament** (rev. 3): metal edging and an embossed shield band, the honeycomb emboss, grain, brushed metal (LASTREET), the shirt's mesh, folds and seams. Revision 2's ornaments (tubes, rivets, stamp, guilloche, micro-print, captions, ribbons, glitch bars, pixel rain) are removed (§16). All vector, crisp at DPR 2–3; tokens drop all texture (§7). |
| D13 | **The number is printed on the shirt** (rev. 2): fitted inside the chest box with margin, outlined like tackle-twill, raised with light-following highlight and shade. Never outside the shirt; « — » too.                                                                                                                                                                                |
| D14 | **Holographic foil for CHAMPION and LEGEND only, restrained** (rev. 3): foil in the honeycomb cells, on the outer edge, the shield band and the plaque rim, a soft diffraction kept off the number and the plate's text, two / four glints; each tier's own narrow palette; LEGEND stronger. No seal, no sparkle field, no seven-hue rainbow. Other tiers: none.                          |
| D15 | **Depth on every card** (rev. 2): the full card is five stacked layers (field, shirt, number, frame, holo) plus a 7-step extruded rim; in CSS 3D with parallax while a pointer moves, in 2D at rest (visible thickness, contact shadow, embossed number); CSS and SVG only (no WebGL). Tokens get static depth.                                                                           |
| D16 | Stage card width (rev. 2): **296 px** on phones (`min(296px, 100vw − 32px)`), **336 px** from 768 px. G4 (the face-à-face sheet): **200 px** from 768 px, `min(160 px, (viewport − 44 px) ÷ 2)` below (160 at 390, 138 at 320); one G4 spec holds from 136 to 200 px (§7).                                                                                                                |
| D17 | **Shield frame** (rev. 3): the art window is a heater shield with an embossed metal band; the outline (tab, cut corner) is unchanged (§3.2).                                                                                                                                                                                                                                              |
| D18 | **Hierarchy** (rev. 3): under the shield's point, centred: the tier word in a metal plaque, the name, the stats, the serial (§3.3).                                                                                                                                                                                                                                                       |
| D19 | **The founder capsule sits along the cut corner** (rev. 3), only on founders; the tubes become two floodlights in the field (§3.3, §5.3, §9).                                                                                                                                                                                                                                             |

**D16, round 2 (2026-10-10).** On a phone, G1's owner stage no longer draws a fixed 296 px: the card is
`min(100vw − 32 px, clamp(232 px, (100svh − top bar − bottom bar − 236 px) ÷ 1.618, 296 px))` wide, 232 to
296 px by the phone's height, so that the next-round line clears the bottom bar (evidence finding 2; the
236 px is what G1 draws around the card in French, with 20 px of room). It stays 1 : 1.618, stays 336 px from
768 px, and G2, the guest hero and G4 keep the widths above (§10). This departs from D16 as written; it is
recorded here so that the plan and the code agree, and the draft pull request is where the owner confirms it.

**Legal guardrail.** Match the style and layout language closely; never copy Sorare's logo, wordmark,
rarity names, season badges or artwork files, never trace or sample their images, never write
"sorare" in shipped code, class names, file names, assets or copy. Our marks, tier names, serial format
and generated art take those places.

---

## 1. Research: Sorare's football card

### 1.1 Sources

| Source                                                                                                                                                                                                                                                                                                                                                                                                     | What it gave                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sorare public GraphQL `https://api.sorare.com/graphql`, query `anyCard(slug: "kylian-mbappe-lottin-<year>-<rarity>-1") { pictureUrl }`, years 2022–2026, the four rarities                                                                                                                                                                                                                                 | 20 official card renders, 771 × 1248 px PNG with alpha (`assets.sorare.com/card/<uuid>/picture/…`), measured below. Not committed (their artwork). |
| Coincheck NFT listings, e.g. [Mitoma 2021-22 235/1000](https://coincheck.com/nft/assets/item/0x629a673a8242c2ac4b7b8c5d8735fbeac21a6205/58175304389054654601730624785688331718766620201489422968107335496340479931884), [2022-23 105/1000](https://coincheck.com/nft/assets/item/0x629a673a8242c2ac4b7b8c5d8735fbeac21a6205/72480242421972280603789013978795073258274615712288232621171337462556107509729) | The 2021-22 and 2022-23 Limited renders (same 771 × 1248), metadata (season, serial, position, edition, level, XP).                                |
| sorare.com landing, captured 2026-10 at 1440 × 900 and 390 × 844 (`scratchpad/sorare/live/01-landing-*.png`, earlier onboarding research)                                                                                                                                                                                                                                                                  | The current cards in context: tilted, lit, with the two-face name and the HOLO / SHINY pills of the Arcade set.                                    |
| App Store screenshots US/FR/GB (`scratchpad/sorare/store/appstore-*.jpg`)                                                                                                                                                                                                                                                                                                                                  | Cards at in-app thumbnail size (≈ 175 px wide in a 6-up grid), the Hyperglitch set, the Arcade board.                                              |
| [Fantasy Football Scout, beginners guide to Sorare cards](https://www.fantasyfootballscout.co.uk/2022/10/16/the-beginners-guide-to-sorare-cards/); [LaLiga Expert, Limited cards](https://laligaexpert.com/2021/08/18/sorare-limited-cards/); [AS Monaco, Sorare 2022-23](https://asmonaco.com/en/sorare-cards-as-monaco-launch-2022-2023)                                                                 | Scarcity colours (Limited yellow, Rare red, Super Rare blue, Unique black/purple), supply per season (1000/100/10/1), serial « n/N ».              |
| [SportBusiness: 3D cards for 2023-24](https://www.sportbusiness.com/news/sorare-launches-3d-digital-cards-for-2023-24-premier-league-season/), [Decrypt](https://decrypt.co/154975/sorare-launches-ar-equipped-3d-digital-football-player-cards)                                                                                                                                                           | From 2023-24 a frame joins front and back for 3D depth, with lighting; bespoke frames per league.                                                  |
| [Sorare help: Pro, Set and scarcity](https://help.sorare.com/hc/en-us/articles/4406429217053-Understanding-Sorare-Cards-Pro-Set-and-Scarcity-Levels) (403 to the fetcher; quoted from the earlier research)                                                                                                                                                                                                | Set (common) cards free and unlimited; Pro cards by scarcity.                                                                                      |

Mobbin has no Sorare screens (searched 2026-10-09).

### 1.2 Anatomy across generations (measured on the 771 × 1248 renders)

All generations: **aspect 771 : 1248 = 1 : 1.619** (the golden ratio); the scarcity colour owns the
whole card; the player photo is a cut-out over a scarcity-coloured abstract field and fades into a
dark bottom plate that carries the text.

| Generation          | Shape                                                                                                                                              | Top                                                                               | Centre                                                                                                                         | Bottom                                                                                                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2021-22             | Rounded rect, r = 40 px (5.2 % of width)                                                                                                           | Season `2021-22` and serial `235/1000` top-left; crest and shirt number top-right | Photo on a honeycomb field in the scarcity colour                                                                              | Name in two centred bold lines; AGE · POSITION · COUNTRY in three labelled columns                                                                                                                                                                                                   |
| 2022-23             | Metallic frame in the scarcity colour around a recessed rounded window                                                                             | Season + serial top-left, club code + shirt number + crest top-right              | Photo on faceted "lightning" foil                                                                                              | Bold wide name centred, position, age + flag, a scarcity emblem disc bottom-left, league mark bottom-right, a centred edition tab                                                                                                                                                    |
| 2023-24             | Thick lacquered frame, hexagonal window, faceted foil (holographic triangles)                                                                      | Season, club code, shirt number                                                   | Photo in a hexagon                                                                                                             | Serial and scarcity word on the hexagon's lower edge; name, position, age, country                                                                                                                                                                                                   |
| 2024-25             | Full-bleed, a vertical leading rail                                                                                                                | League mark; season `24 25` stacked top-trailing                                  | Photo on liquid-chrome swirls                                                                                                  | Rail stats AGE / POS / country / #; name bold two lines bottom-left, serial `1/1000`, wordmark bottom-right                                                                                                                                                                          |
| 2025-26             | Dark frame, raised top-leading tab, a vertical brand tab at top-trailing, cut bottom-trailing corner                                               | Tab: league mark over crest                                                       | Photo on light-streak / data-rain field                                                                                        | FRA · POS · AGE labelled micro-row with hairline dividers; name heavy sans two lines; serial `1/1000`                                                                                                                                                                                |
| **2026-27** (model) | Dark plate; tab rising 8 px above the top at the leading corner; top-trailing r ≈ 22 px; bottom-trailing corner cut at 45° (legs ≈ 160 px); rivets | Tab (x 21–158, y 0–300): league mark, crest                                       | Photo on red/amber/cyan/magenta light ribbons with **glitch-pixel bars**; leading rail with a lit tube and vertical brand mark | Plate from y ≈ 860 (69 %): FRA · POS · AGE labels over values with hairlines, then the scarcity word engraved; first name **heavy grotesque caps**, surname **light condensed Didone caps**; serial `1/100` at the foot; a trailing capsule slot and a lit tube on the trailing edge |

2026-27 sampled colours (averages of saturated pixels; plate = bottom plate): Limited glow `#E9B055`
deep `#A16E32` plate `#1C1402`; Rare glow `#EA6263` deep `#A6353A` plate `#1C0506` edge `#C22F35`;
Super Rare glow `#6FCFE5` deep `#4980A1` plate `#03111B` edge `#6DBCDF`; Unique glow `#DE5EE4` deep
`#9C3AA6` plate `#13041C` edge `#BA63C3`. Micro labels sit at ≈ 6.5 : 1 on their plate; tubes are
near-white tinted (`#FFF4E3`, `#FEE2E3`, `#E1F4FB`, `#F8E2FD`).

Type (2026-27): first name ≈ 7.8 % of card width font size, surname ≈ 13 % (cap height ≈ 9.7 %), micro
labels ≈ 2.6 %, values ≈ 4.4 %, serial ≈ 3.2 %; text inset from the leading edge 5.4 %.

Small sizes (App Store grid, ≈ 175 px wide): the same card scaled; micro labels become texture, the
name and the field colour carry it. Sorare shows the numeric score **beside** a card in lists (a hex
badge), never inside it.

Light: the 3D viewer and the landing tilt cards in perspective with a moving specular sheen;
holographic variants add a rainbow layer that shifts with the angle; rarer cards carry more foil.

---

## 2. The direction in one paragraph

A dark, lacquered collectible in the exact proportions and furniture of a current Sorare football card,
coloured end to end by its tier. Where Sorare puts the player, we put **the player's shirt without the
player**: the club's match shirt at real proportions, drawn in 3D, framed in a metal shield on a
honeycomb backboard lit by two floodlights, and on its chest the manager's rating printed as a shirt
number (revision 3). The honeycomb's phase comes from the card's serial, so no two cards are the same.
Under the shield's point the tier sits in a metal plaque and the name hangs right below it in Sorare's
two-face set (heavy sans over light serif); the four stats run across the plate in labelled hairline
columns, the identifier sits at the foot. At rest the card lies flat and crisp; on a desk it tilts into
3D toward the pointer and a sheen, a specular streak along the metal and a foil follow it; on a phone it
floats slowly. Rarer tiers carry more foil, LEGEND a prism.

---

## 3. The full card: geometry

**Units.** Each layer is an SVG with `viewBox="0 0 1000 1618"` (§8 stacks five of them). All numbers below are viewBox units (= per-mille of the
card's width). LTR coordinates; in Arabic **mirror every x** as `1000 − x` (and anchors start ↔ end),
by drawing inside `<g transform="matrix(-1 0 0 1 1000 0)">` for shapes only — **text is never
mirrored by transform**: compute mirrored x and use `text-anchor` and `direction` instead. Digits stay
LTR. `aspect()` returns `1.618` always; `estimateAspect()` returns `1.618`.

### 3.1 Outline

```
M 0 40  Q 0 0 40 0  L 206 0  L 216 10  L 972 10  Q 1000 10 1000 38
L 1000 1418  L 800 1618  L 28 1618  Q 0 1618 0 1590  Z
```

The tab rises 10 above the body between x 0 and 206 (step at 45°); the bottom-trailing corner is cut at
45° from (1000, 1418) to (800, 1618). This path (`OUTLINE`) is the clip for every layer, and the
`clip-path: polygon()` of the foil overlay uses its corners in % (`0 2.5%, 4% 0, 20.6% 0, 21.6% 0.6%,
100% 0.6%, 100% 87.6%, 80% 100%, 0 100%`, mirrored in Arabic).

### 3.2 Layers, bottom to top (revision 3)

The full card is **five SVG layers** stacked in CSS 3D (§8), plus seven rim SVGs. Every layer uses the
same viewBox; shapes are drawn LTR and mirrored as a group in Arabic; text is never mirrored. The SVG
`<defs>` (gradients, patterns, masks, filters, clip paths) live once in the base layer; the other layers
reference them by id (ids are document-wide and made unique per card by `scope-ids.ts`); the holo layer
carries its own one `<mask>` in a local `<defs>`.

**The shield window** (rev. 3, replaces the rounded rectangle; the outline of §3.1 is unchanged):

```
WINDOW    = M62 46 Q62 22 86 22 H914 Q938 22 938 46 V830
            C938 935 600 985 500 1056  C400 985 62 935 62 830 Z
WINDOW_IN = M78 62 Q78 38 102 38 H898 Q922 38 922 62 V830
            C922 925 595 970 500 1036  C405 970 78 925 78 830 Z   (LEGEND's inner foil hairline, 16 inside)
RING      = OUTLINE + WINDOW   (fill-rule="evenodd": the frame with the shield cut out)
TAB       = M0 40 Q0 0 40 0 L206 0 L206 280 Q206 302 184 302 L0 302 Z
POINT_Y   = 1056
```

A heater shield, symmetric about x 500: flat top, straight sides to y 830 (the "shoulders" where the
curve starts), two cubic curves meeting in a point at (500, 1056). (Critique fix: the point was at
1136, which left 215 empty units between the hem and the point and cramped the plate; it rose 80, and
at the hem's corner (card 274, 909) the band's centre is at y ≈ 965, so the field stays clear under
the shirt.) The trailing strip x 938–1000 is now
plain frame, the mirror of the leading rail x 0–62. **Reconciling "shield frame" with "preserve the
asymmetric silhouette":** the outer outline (raised tab at the top-leading corner, cut bottom-trailing
corner) is untouched; the shield is the embossed metal **inner** frame round the art, so the card reads
as a crest mounted in the familiar asymmetric plate.

**Jersey space.** The shirt and the number are drawn in their own coordinates (§5.1–5.2) and placed on
the card with `JT = matrix(1.12 0 0 1.12 -60 -86)` (x' = 1.12 x − 60, y' = 1.12 y − 86). The transform
is symmetric about x 500, so it commutes with the Arabic mirror. Clip paths that must stay in card space
(the window) sit on a group **outside** `JT`; clips, gradients and patterns used inside the jersey are
in jersey space.

| Layer (z, §8)                          | Contents, bottom to top                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **base** (0)                           | `OUTLINE` filled `plate` and stroked 2 in the darkest rim colour (`mix(metal[3], #000, .71)`, so the back face never ends in a bright line); then, clipped to `WINDOW`: the field gradient; `<g class="mc-field">` = honeycomb (§5.3, per tier), the LASTREET cage and brushed sheen, grain, the pitch lines; the backlight; `<g class="mc-flood">` = the two floodlights; the STADE pool; the vignette; the foot shade; the dark-shirt aura (§5.3); `<g class="mc-shirt-cast">` = the jersey's cast shadow (§5.1). Exact values §5.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| rims (1–7)                             | Seven copies of `RING`, each in its own SVG (§8), filled `mix(metal[3], #000, .35 + (7 − k) × .06)` (k 7 next to the face is the lightest, k 1 at the back the darkest; `metal[3]` = the tier's fourth metal stop): the card's thickness and the shield's inner walls. At rest they are offset in 2D (§8.2); in 3D they sit at z 1…7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **shirt** (3)                          | `<g clip-path="url(#win)"><g transform="JT">` §5.1 `</g></g>`. No text (the chest disc carries no initials, critique fix).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **number** (5)                         | A local `<defs>` with `clipPath numclip` (a copy of the fill `<text>`); `<g transform="JT">` §5.2: the fabric shadow copy, the shade copy, the highlight copy, then `<g data-mc="ovr">` (hit rect, outer outline, twill, fill, mesh, light), then the **cloth-on-print** overlay (static, outside the group, clipped to `numclip`), « OVR » `</g>`. (The forming marks moved to the frame's plaque, §3.3, confirmer fix.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **frame** (8)                          | In order: `RING` filled `plate`; `RING` filled the plate gradient (linear y 1040 → 1618: 0 `deep` .5, .45 `deep` 0); `RING` filled grain; (LASTREET) `RING` filled the brush pattern; the **plate emboss** (`<g mask="url(#plfade)" opacity=".22">` holding `RING` filled `hexD` and `RING` filled `hexL`; `plfade` = linear y 960 → 1380: 0 `#FFF` 0, .24 `#FFF` 1, .67 `#FFF` .6, 1 `#FFF` 0); (STADE) `RING` filled the gold band (linear y 1060 → 1260: 0 `glow` 0, .45 `glow` .12, 1 `glow` 0). **Shield band**: the inner shadow (`WINDOW` stroked 44 `#000` .6, blur `b8`, clipped to `WINDOW`), the metal (`WINDOW` stroked 22 `url(#metal)`), (LASTREET) the brush (stroke 22), the bevel (stroke 22 `url(#bevel)`), the **lit lip** (`WINDOW` stroked 22 `#FFF` .5, `mask="url(#lipWL)"`) and the **shadow lip** (`WINDOW` stroked 22 `#000` .55, `mask="url(#lipWD)"`). **Outer edge**, clipped to `OUTLINE`: stroke 24 metal, (LASTREET) stroke 24 brush, stroke 24 bevel, lit lip (`#FFF` .45, `lipOL`), shadow lip (`#000` .5, `lipOD`) (12 units of metal inside the outline). The **specular streak**: `<g mask="url(#metalm)"><rect class="mc-spec-shift" width="1000" height="1618" fill="url(#spec)"/></g>`. **Tab**: shadow (`TAB` `#000` .45, translate (0, 6), blur `b5`), fill `plate`, grain, rim (`TAB` stroked 16 metal and 16 bevel, clipped to `TAB`), the club disc or the neutral placeholder (§3.3). **Plaque** (§3.3; on a forming base card it holds the forming marks). **Founder capsule** (§3.3). The theme edge (`OUTLINE` stroked `EDGE_W` = 10 in `edge`, §18 round 2 review; it was 3), the dark theme's outer rim (as revision 2). Then every text of §3.3. Removed by the critique: the 28-unit groove under the band, the 30-unit groove under the outer edge and the band's centre ridge (they read as a double wire). |
| **holo** (9), CHAMPION and LEGEND only | §5.5: foil through the edge / band / tab-rim / plaque-rim (LEGEND: + inner hairline) mask, glints.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| foil overlay (9.5, HTML)               | `<div class="mc-eclat__foil">`: the sheen (every tier) and the restrained diffraction (CHAMPION, LEGEND), §5.5 and §8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Gradients and masks shared by the frame** (all `gradientUnits="userSpaceOnUse"`, masks
`maskUnits="userSpaceOnUse" x −20 y −20 w 1040 h 1660`): `metal` linear (0, 0) → (1000, 1618) with
the tier's seven metal stops at 0, 1/6 … 1 (§5.4); `bevel` linear (0, 0) → (1000, 1618): 0 `#FFF` .3,
.4 `#FFF` 0, .6 `#000` 0, 1 `#000` .4. `lipWL` = `WINDOW` stroked 22 `#FFF` minus `WINDOW` stroked 22
`#000` translated (2.4, 3.2) (the slivers of the band that face up and to the leading side); `lipWD`
the same with (−2.4, −3.2); `lipOL` / `lipOD` the same on `OUTLINE` stroked 24 with (±2, ±2.6). `metalm`
= `WINDOW` stroked 22 `#FFF` plus `OUTLINE` stroked 24 `#FFF` clipped to `OUTLINE`. `spec` linear (0, 0)
→ (1000, 1618): .44 `#000` 0, .47 `#000` .22, .50 `spec` .85, .53 `#000` .22, .56 `#000` 0 (the tier's
`spec` colour, §5.4: a narrow polished highlight with dark shoulders that travels along the metal as the
card turns, §8.2). `brush` pattern 240 × 5: rect y .4 h .7 `#FFF` .1 (full width), rect x 40 y 2.4 w
200 h .6 `#FFF` .06, rect y 3.8 w 170 h .7 `#000` .14. `grain` pattern 17 × 17: circles (3, 4) r .9
`#FFF` .06, (11, 2) r .7 `#000` .16, (7, 12) r .8 `#FFF` .05, (14, 10) r .9 `#000` .12.

**Removed in revision 3** (do not build; full list §16): the tubes, the rivets, the season stamp, the
guilloche, both micro-print lines, the tab's club caption and season caption, the tab's inner
hairline, the rail's darkened panel and hairline, the plate's double hairline, the trailing capsule
slot.

Every layer but the number takes no pointer events (`pointer-events: none` on the SVG); in the number
layer only `[data-mc="ovr"]` does. The foil, holo and frame layers therefore never steal
`elementFromPoint` from the number.

### 3.3 Furniture and text positions (revision 3; LTR, mirror x in Arabic)

The plate is re-ordered so the name hangs directly under the artwork (owner, revision 3: "the
manager's name must not look disconnected"): **shield point → tier plaque → name → stats → serial**,
all centred on x 500. Centred text needs no mirroring (`X(500) = 500`). Critique fixes: the shield's
point rose 80 (y 1056), the plaque moved up with it, the freed height went to a larger name, the stats
were re-centred on x 500, and the plate's vertical rhythm was evened out (point → plaque 14, plaque
→ name ink ≈ 40, rule 1404, labels 1462, values 1520, serial 1584, ≥ 20 units from the bottom metal).

**Type ramp** (viewBox units): the number (fitted, ≈ 240–300) / name line 2 (Instrument Serif, max
120; one-word line max 144) / name line 1 (Changa 800, 80) / stat values 52 / tier word 44 / meta:
**34** (club initials, the wordmark, Arabic stat labels) and **30** (season, serial, sample pill, Latin
stat labels, the founder « 26 »). Nothing smaller is drawn on the full card.

| Element              | Position (viewBox units)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Face, size, weight, case, tracking                                                                                                                                                                                                                      | Colour                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Club disc            | tab, centre (103, 134): shadow r 56 `#000` .4 at (0, 4) blur `b5`; disc r 54 `club.primary`; the rib gradient over it at .5; ring r 51, stroke 6 `club.secondary` (else white .5)                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                       | —                                                                                 |
| No club: placeholder | the same shadow, disc r 54 filled `edgeL`, rib gradient .5, ring r 51 stroke 6 `edgeD` .55, and an embossed hexagon `hexPath(103, 134, 22)` stroked 3 `#000` .45 translated (1, 1.5) then stroked 2 `light` .5. Never a logo, never text                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                                                       | —                                                                                 |
| Club initials        | (103, 146), anchor middle, `direction="ltr"`. Not on the G4 card (§7): the disc's colours alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Changa 800, 34, tracking .02em (Latin UI), 0 (Arabic UI)                                                                                                                                                                                                | white or `#0E1116`, whichever is ≥ 4.5:1 on `primary`                             |
| Season               | (103, 262) with or without a club (the placeholder keeps the tab's composition)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Manrope 800, 30, tabular-nums, `direction="ltr"`                                                                                                                                                                                                        | `#FFFFFF` .92                                                                     |
| Sample pill          | rect 230 × 50, x 706–936 (Arabic 64–294), y 44–94, `rx 25`, `#000` .55; text baseline (822.2, 79.8) (Arabic x 179)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Manrope 800 30, tracking .08em; Arabic «مثال» Noto Sans Arabic 800 30                                                                                                                                                                                   | `#FFFFFF`                                                                         |
| Number, « OVR »      | §5.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                       | —                                                                                 |
| Tier plaque          | an elongated hexagon centred on x 500: `M x0 1106 L x0+24 1070 H x1−24 L x1 1106 L x1−24 1142 H x0+24 Z`, width `max(240, wordInk + 104)` (forming base card: `max(240, marksWidth + 104)`, below); a shadow copy `#000` .5 at (0, 5) blur `b5`; fill `mix(plate, #000, .35)` (**LEGEND**: the moving foil instead, a `mc-foil-shift` rect x0−60 … x1+60, y 1040–1172 filled `foil`, clipped to the plaque); stroke 4 `url(#metal)`; a top hairline `M x0+26 1075 H x1−26` white .12 (LEGEND .4), 1.2                                                                                                                                 | —                                                                                                                                                                                                                                                       | —                                                                                 |
| Tier word            | (500, 1121), anchor middle (G4: size 60, baseline 1127, §7). Latin words (also LASTREET in Arabic): x 504.84, `direction="ltr"`. Arabic words: x 500, `direction="rtl"`, `unicode-bidi="isolate"`                                                                                                                                                                                                                                                                                                                                                                                                                                     | Changa 800, 44; tracking .22em (Latin), 0 (Arabic)                                                                                                                                                                                                      | `wordFill` (§5.4); LEGEND `#1A0626` on its foil plaque (≥ 7:1 on every foil stop) |
| Name line 1          | (500, 1236), anchor middle, then placed by ink (§4); G4 min 60                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Changa 800, max 80, min 56, caps                                                                                                                                                                                                                        | `#FFFFFF`                                                                         |
| Name line 2          | (500, 1342), anchor middle, then placed by ink (§4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Instrument Serif 400, max 120, min 80, caps; Arabic script: Changa 300, **max 92**, min 72                                                                                                                                                              | `#FFFFFF`                                                                         |
| One-word name        | (500, 1316), anchor middle, then placed by ink (§4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Instrument Serif 400, max 144, **min 64** (Arabic script: Changa 800, max 112, min 72)                                                                                                                                                                  | `#FFFFFF`                                                                         |
| Forming marks (base) | **confirmer fix**: when the card is forming (OVR null and `counted < min`), the **plaque** is drawn without a word and holds the N marks, centred on (500, 1106): each 60 × 22 (G4: 72 × 28), gap 18 (G4: 22), `rx` half the height. A **filled** mark: a glow copy `#FFF2DA` .35 blurred `b5`, then the mark filled `#FFF2DA`, stroke 3 `mix(plate, #000, .5)`. An **empty** mark: inset 2 (56 × 18), filled `mix(plate, #000, .25)`, stroke 4 `#FFF2DA` at .8. Arabic: filled from the right. The name keeps the rated cards' position (plaque → name 68, name → rule 88 for « ALI »). Nothing is drawn on the shirt under the dash | —                                                                                                                                                                                                                                                       |
| No plaque at all     | (base card that is not forming, e.g. `insufficient3`, or a number with no tier) the name block keeps its baselines and `fit()` then centres its **ink** between the shield's point (1056) and the rule (1404): equal gaps (121 / 121 for « ALI »). Empty name: the rule at y 1229                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                       |
| Empty name           | rect x 330–670, y 1300 (no plaque: 1229), h 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                       | white .22                                                                         |
| Name/stats rule      | rect x 190–810, y 1404, h 1.4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                       | white .14                                                                         |
| Stat labels          | (not on the G4 card: the sheet lists CAP, SEL, TRF, CON with their long names directly under the two cards, in this order) centres x **252, 417, 583, 748** (pitch 165.3, centred on 500; Arabic 748, 583, 417, 252 so CAP is rightmost), baseline 1462 (Arabic 1460), anchor middle; Latin x + .04em (the trailing tracking)                                                                                                                                                                                                                                                                                                         | Manrope 800, 30, caps, tracking .08em; Arabic Noto Sans Arabic 700, **34**, fitted to **165** units (min 26)                                                                                                                                            | `label` (§5.4)                                                                    |
| Stat values          | same x, baseline 1520 (G4: size 64, baseline 1515)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Manrope 800, 52, tabular-nums, `direction="ltr"`                                                                                                                                                                                                        | `#FFFFFF`                                                                         |
| Stat dividers        | x **335, 500, 665** (mirrored in Arabic), y 1436–1526 (G4: 1452–1532), 1.4 wide                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                       | white .14                                                                         |
| Serial               | (500, 1584), anchor middle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Manrope 600, 30, tabular-nums, tracking .04em                                                                                                                                                                                                           | `#FFFFFF` .8                                                                      |
| Founder capsule      | along the cut corner: a group `rotate(-45 872 1482)` holding a shadow rect (x 808, y 1458, 128 × 48, rx 24, `#000` .45, translate (0, 3)) and the capsule (same rect, fill linear (830, 1524) → (914, 1440) `deep` → `glow`, stroke 3 `url(#metal)`). Arabic: mirrored with the shapes. Clearance to the nearest stat ink ≥ 24 (measured 32.5–39.5)                                                                                                                                                                                                                                                                                   | a group `translate(872 1482) rotate(−45)` (Arabic `translate(128 1482) rotate(45)`): a drawn four-point star `star(−25, 0, 11)` `#FFF`, then « 26 » (last two digits of `founder`) at x 12, anchor middle, `dominant-baseline="central"`, Changa 800 30 | `#FFFFFF`                                                                         |
| Wordmark             | leading rail, `translate(32 600) rotate(−90)` (Arabic x 968), x 2.4 (half the trailing tracking), anchor middle: a debossed pair, first `#000` .5 at `dy` 1.5, then `#FFF` .78                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Changa 800, **34**, tracking .14em, uppercase « BOTOLAGO » (critique fix: « BotolaGO » at 26 read « Botola60 »)                                                                                                                                         | —                                                                                 |

Not a founder: **no capsule at all** (revision 3; the empty slot was clutter). Stat value null →
« — ». Arabic stat labels (`القائد`, `التشكيلة`, `الانتقالات`, `الثبات`) are ornamental duplicates of the
stat tiles the page prints in the DOM. Removed from revision 2: the club-name caption, the « SAISON »
caption (the key `card.caption.season` is **not** added), the season stamp, the micro-print, the stat
tier word at x 600. Removed by the critique: the chest-disc initials (§5.1).

**Anchors and direction.** Centre-anchored runs are direction-neutral; set `direction` on each run as
above (Latin and digits `ltr`, Arabic `rtl` with `unicode-bidi="isolate"`). Digits stay LTR.

**Contrast this layout must pass** (measure from pixels, §12): name lines, stat values, stat labels,
serial, season, the wordmark, the sample pill and the tier word ≥ 4.5:1 against what is under them; the
number ≥ 3:1 against the shirt; « OVR » ≥ 4.5:1 against its own halo (and as high as the club colour
allows against the bare shirt: white on Raja green tops out at 4.2:1). Revision 3 mock with the
critique fixes, measured (§16): names ≥ 10.3 (10.3 with the pointer over the name, 11.3 at rest), tier word ≥ 7.1, values ≥ 12.1, labels ≥ 6.86, meta
≥ 5.15, the number's fill ≥ 3.27 against the shirt under it, « OVR » ≥ 8.9 against its halo.

---

## 4. Names (revision 3)

**Split.** Clean as today (`knitName`'s first steps, moved to `eclat/name.ts`): trim, collapse spaces,
drop emoji and symbols, drop control and bidi characters; Arabic script: drop tatweel and harakat.
Latin script: uppercase with `toLocaleUpperCase("fr")` **keeping accents** (É, Ç), apostrophes and
hyphens. Then:

- two words → line 1 = first word, line 2 = the second;
- three words or more → line 1 = the first word, **unless the first word is a particle** (`LE`, `LA`,
  `LES`, `EL`, `AL`, `DE`, `DU`, `DES`, `ABD`, `ABOU`, `ABU`, `عبد`, `أبو`, `ابو`, `ابن`, `بن`,
  compared after uppercasing): then line 1 = the first two words (`LES LIONS` / `DU DERB SIDI MAAROUF`,
  `عبد الرحمن` / `بن جلون العلوي`); line 2 = the rest;
- one word → the one-word line only (§3.3); line 1 empty;
- empty (unnamed guest) → no text; the empty name rule of §3.3.

**Fit.** Every line is centred on x 500 with a width budget of **790 units** (x 105–895), and the
budget is the margin of the line's **ink**, not of its advance (round 2: the 24-letter serif word, fitted by
advance, put its « A » 2.2 units left of x 105 on 8 of 100 drawings). Font size = `min(max, budget ÷
width(text at size 1), budget ÷ 2 ÷ reach)` where `reach` is how far the ink goes from the line's centre
on its wider side (`max(w ÷ 2 − x0, x1 − w ÷ 2)`, size 1), floored to a tenth; the ink fit only ever
shrinks a line that is already at the advance fit, by up to a few tenths of a unit of size. If that is
below the line's min: drop the last word of line 2 and try again (never cut inside a word, never an
ellipsis); if line 2 (or the one-word line) has one word left and still does not fit at min, set it at
min with `textLength` and `lengthAdjust="spacing"` (never `spacingAndGlyphs`, which pinches the glyphs;
the one-word min is 64, where the 24-letter fixture needs almost no correction). `textLength` is 790
less twice the larger overhang of the line's first and last letters past their advance, so the ink of a
spaced line keeps the margin too (786 for the serif « A » at 64). The full name is always in the label
and in the DOM under the card. Sizes, faces and mins: §3.3.

**Vertical placement by ink** (critique fix: baselines alone let Arabic descenders cross the rule).
After sizing, measure each line's ink (`actualBoundingBoxAscent/Descent` of the face at its size, from
`measure.ts`, or the committed metrics on the server):

1. the last line (line 2, or the one-word line): if `baseline + descent > 1404 − 14`, set
   `baseline = 1390 − descent`;
2. two lines: if `(baseline2 − ascent2) − (baseline1 + descent1) < 12`, set
   `baseline1 = baseline2 − ascent2 − 12 − descent1`;
3. the first line's ink top must stay ≥ 20 below the plaque (1142) or, with no tier word, the shield
   point (1056); a name that cannot is a bug in the sizes, not a case to handle (the mock logs a
   warning; none fires on any fixture).

The rule, the stats and the serial never move. Measured on every fixture (§16): ink to the rule ≥ 22
(`بن جلون العلوي`, Changa 300 92: ink bottom 1382), gap between lines ≥ 16, first line ≥ 33 below
the plaque or point.

**Measuring.** `full()` takes an injected `measure(text, face, weight): number` (width at size 1). In
the browser, `eclat/measure.ts` uses a canvas `measureText` after `document.fonts.load` of the three
faces (Changa 300/800, Instrument Serif 400; wait at most 1.5 s, like `raster.ts`), caching per
string. On the server and in tests, `eclat/metrics.ts` gives committed advance widths **and ink boxes**
(`actualBoundingBoxLeft/Right/Ascent/Descent` at size 100 for the digits 0–9 and « — » in Changa 800,
needed by §5.2), generated once in Chromium by `eclat/scripts/measure-faces.ts`, a Playwright script,
and committed as data: A–Z, À–Ü, digits, space, `-`, `'`, `.` for Changa 800 and Instrument Serif 400;
Arabic falls back to 0.52 em per letter for Changa 800 and 0.46 em for Changa 300.
`active-renderer.load()` awaits `ready()` (the font load) before handing the renderer over, as today.

**Arabic script names.** `direction="rtl"`, `unicode-bidi="isolate"`, letter-spacing 0, centred like
every other name. A Latin name in the Arabic interface keeps the Latin faces and `direction="ltr"`.

Fixtures to check by eye and by rectangles (all in the mock's « Noms longs » row or the main rows):
`Ali`, `Les Lions du Derb Sidi Maarouf` (Arabic UI), `Abdelkarim Benjelloun-Alaoui` (line 2
BENJELLOUN-ALAOUI fits at ≈ 92), `فاطمة الزهراء`, `عبد الرحمن بن جلون العلوي` (French UI),
`Mohammedabdelhakimalaoui` (24 letters, one word: 67.4 at the 790 budget, no textLength needed;
`Abdelrahmanebenjellounel` fits at 69.4, not 69.8, so the « A »'s overhang keeps x 105), an
empty name, every hostile
name of `markup-safety.ts`.

---

## 5. The no-photo centre and the foil ladder

### 5.1 The shirt (the club), revision 3: real proportions, drawn in 3D

**Proportions, measured.** A men's M football shirt laid flat measures about 50.8 cm across the
chest (pit to pit), 73.7 cm long (high point of the shoulder to the hem) and 21 cm along a short
sleeve (size-charts.com soccer shirt table); vintage Inter Milan shirts listed flat measure 50 × 68 cm
(S) and 60 × 75 cm (L) (Grailed listings). So **length ≈ 1.45 × pit-to-pit** (1.25–1.45 across the
sources), the shoulder seam-to-seam width ≈ 0.88 × pit-to-pit, and with the sleeves dropping about 35°
from horizontal on a flat lay the span across the sleeves comes out **about equal to the length** (the
owner's check). Revision 2's shirt was 460 wide and ≈ 850 long with no hem (1.85 : 1, too long).

Revision 3, in **jersey space** (placed on the card by `JT`, §3.2; card-space values in brackets).
Critique fix: the body tapers about 3 % at the waist and the hem corners are rounded (the body was a
perfect rectangle and read as a boxy T-shirt).

| Measure                      | Jersey space                                | On the card (× 1.12) | Ratio                              |
| ---------------------------- | ------------------------------------------- | -------------------- | ---------------------------------- |
| High point of shoulder (HPS) | y 300, neck x 422–578                       | y 250                | neck width 156 = 0.38 × pit-to-pit |
| Hem (centre / corners)       | y 899.8 (curve apex) / 878 → rounded r ≈ 11 | y 921.8 / 897.4      | length 600 = **1.44 × pit-to-pit** |
| Pit to pit                   | x 292–708 = 416                             | 466                  | —                                  |
| Waist                        | x 304–696 = 392 at y 700                    | 439                  | 0.94 × pit-to-pit                  |
| Hem width                    | x 300–700 = 400                             | 448                  | 0.96 × pit-to-pit                  |
| Shoulder points              | (318, 330), (682, 330): 364 wide            | 408                  | 0.875 × pit-to-pit, slope 16°      |
| Sleeve (top edge)            | (318, 330) → (190, 418): 155                | 174                  | 19 cm on a 73.7 cm shirt, 35° down |
| Cuff opening                 | (190, 418) → (226, 552): 139                | 156                  | —                                  |
| Span across the sleeves      | x 190–810 = 620                             | 694                  | **1.03 × length**                  |
| Front V depth                | to (500, 384), 84 below the HPS             | y 344                | —                                  |

`getBBox` of `SHIRT` in jersey space: 190, 300, 810, 899.8 (card space x 152.8–847.2, y 250–921.8).

Paths (jersey space, LTR; the shapes are mirrored with the card in Arabic):

```
SHIRT    = M422 300 L318 330 L190 418 L226 552 L292 492 C294 580 304 640 304 700
           C304 770 300 830 300 878 Q300 889 311 890.6 Q500 909 689 890.6 Q700 889 700 878
           C700 830 696 770 696 700 C696 640 706 580 708 492 L774 552 L810 418 L682 330
           L578 300 Q500 316 422 300 Z
SLEEVE_L = M318 330 L190 418 L226 552 L292 492 C298 440 308 380 318 330 Z   (SLEEVE_R: x → 1000 − x)
NECK_IN  = M422 300 Q500 316 578 300 L500 384 Z                               (the inside of the back, seen through the V)
HEM      = M300 866 Q500 888 700 866 L700 878 Q700 889 689 890.6 Q500 909 311 890.6 Q300 889 300 878 Z
CUFF_L   = M190 418 L226 552 L244 539 L208 405 Z                                (CUFF_R: x → 1000 − x)
```

**Colour fidelity** (critique fix: stacked black overlays turned Wydad maroon and FUS ochre). Every
light overlay on the body uses the shirt's own **highlight tint** `hl = mix(fill, #FFF, .4)` instead
of white (white desaturates a club colour), and the dark overlays are lighter than revision 3's. With
`darkShirt` = L\* of `fill` < 25 (FAR's black): the knit's light dots drop to .03, the backlight gains
.15, the shadow-side edge light rises to .30, and an aura sits behind the shirt (§5.3).

**Drawing, bottom to top** (inside `<g clip-path="url(#win)"><g transform="JT">`; `fill` = `primary`,
`sec` = `secondary`; no club: `fill = mix(plate, #FFF, .30)`, `sec = edge dark`):

1. `SHIRT` filled `fill`; `NECK_IN` filled `mix(fill, #000, .55)`.
2. Inside `<g clip-path="url(#shirt)">` (clip = `SHIRT`, jersey space):
   - **fabric**: `SHIRT` filled `knit`, a piqué (critique fix: the hexagon mesh echoed the backdrop's
     honeycomb): pattern 7 × 6 with dots r 1.2 `#000` .08 at (1.75, 1.5) and (5.25, 4.5) and r .7
     `#FFF` .05 (dark shirts .03) at (1.35, 1.1) and (4.85, 4.1); masked by `knitm` (a rect filled
     linear x 292 → 708: 0 `#FFF` .45, .55 `#FFF` 1, 1 `#FFF` .7) so the texture weakens in shadow;
     not drawn at 200 px;
   - **sleeve volume**, across the sleeve's axis (perpendicular to its 35° line): `SLEEVE_L` filled
     linear (254, 374) → (328, 482): 0 `#FFF` .14, .45 `#000` .04, 1 `#000` .35; `SLEEVE_R` filled
     linear (746, 374) → (672, 482): 0 `#FFF` .18, .5 `#FFF` 0, 1 `#000` .28 (the lit side);
   - **body as a cylinder**: `SHIRT` filled `volX` linear x 292 → 708: 0 `#000` .34, .1 `#000` .12,
     .2 `#000` 0, .34 `hl` .1, .56 `hl` .44 (the specular ridge), .72 `hl` .1, .82 `#000` 0, .92 `#000`
     .12, 1 `#000` .36 (both sides fall off); then `volY` linear y 300 → 906: 0 `hl` .24, .4 `hl` 0, 1
     `#000` .12; then the **key light** radial centre (660, 360) r 380: 0 `hl` .36 → 1 `hl` 0;
   - **chest and shoulder volume**, one group with filter `b14`: ellipses (420, 410) and (590, 410)
     rx 95 ry 55 filled `hl` .34 (pectorals), ellipse (500, 520) rx 190 ry 30 `#000` .16 (the shadow
     under the chest);
   - **creases**, one group with filter `b4` (critique fix: `b8` turned them into smudges). Each
     crease is a pair: the dark line, then the same path translated (5, −3) toward the light, stroked
     half as wide in `hl` at 1.6 × the light value given. `fill="none"` on every path:
     flanks (kept out of the chest box, critique fix) `M300 520 C318 600 328 680 332 770` `#000` .32
     w 12 / light .16 · `M700 520 C682 600 672 680 668 770` `#000` .24 w 12 / .2 ·
     the **centre crease** (under the number, so the print can follow it, §5.2): `M512 400 C504 540
512 700 504 862` `hl` .18 w 16, and the pair `M470 560 C478 660 470 760 476 860` `#000` .24 w 10
     / .12 · the hem ripple `M300 846 C360 830 420 862 500 850 S640 832 700 848` `#000` .3 w 10 / .14 ·
     armpit tension `M296 470 C270 486 248 510 232 540` `#000` .3 w 10 / .12 and `M704 470 C730 486 752
510 768 540` `#000` .2 w 10 / .14;
   - the collar's shadow `M418 304 L500 392 L582 304` `#000` .45 w 22 translated (0, 10), filter `b8`;
   - **armhole seams**: `M318 330 C306 380 298 440 292 492 M682 330 C694 380 702 440 708 492` `#000` .32
     w 3, and the same shifted by (3, 4) `#FFF` .14 w 1.4;
   - **hem**: `HEM` filled `#000` .14; the stitch line `M300 868 Q500 890 700 868` `#FFF` .18 w 1.6; the
     hem's underside `M311 889 Q500 907 689 889` `#000` .45 w 5;
   - **cuffs**: `CUFF_L`, `CUFF_R` filled `sec`, then each filled its sleeve's gradient;
   - **rim light** (lit side): `SHIRT` stroked 10 with linear (320, 760) → (760, 340): .55 `light` 0, 1
     `light` .7; **edge light** (shadow side, critique fix for separation): `SHIRT` stroked 6 with
     linear x 190 → 520: 0 `#FFF` .18, .55 `#FFF` .14, 1 `#FFF` 0 (dark shirts .30 / .24 / 0).
3. The **collar**, in `<g clip-path="url(#collar)">` where `collar` = `SHIRT` ∪ rect (400, 300, 200 ×
   100), so nothing rises above the shoulder line (critique fix: round caps stuck out as "horns"):
   the **back-neck rib** `M422 300 Q500 316 578 300` stroked 14 `sec`, again stroked 14 with the rib
   gradient (linear y 290 → 390: 0 `#FFF` .22, 1 `#000` .3) — drawn first, so the collar wraps; the
   inner shadow `M429.7 292.9 L500 368.4 L570.3 292.9` `#000` .35 w 3 translated (0, 3); the **front
   V** `M422 300 L500 384 L578 300` stroked 18 `sec` with `stroke-linecap="butt"`,
   `stroke-linejoin="miter"`, `stroke-miterlimit="4"`, again with the rib gradient; a trim on its upper
   edge `M428.6 293.9 L500 371.7 L571.4 293.9` `#FFF` .3 w 1.4.
4. **Chest disc** (the crest's place, never a crest), only with a club: circle (600, 428) r 24, fill
   `mix(primary, #000, .22)`, stroke 3.5 `sec`, the rib gradient over it at .6. **No text** (critique
   fix: the initials came out at 5 CSS px and repeated the tab's disc).

**Cast shadow** (base layer, §5.3): `SHIRT` filled `#000` .7 (dark shirts .4), filter `b18`,
`transform="translate(-20 30) JT"`, inside `<g class="mc-shirt-cast">` (moves against the light, §8).

Never a sponsor, a real kit pattern, a crest or any logo. With no club the shirt is
`mix(plate, #FFF, .30)` (critique fix: .16 merged with the charcoal field) with trims in `edge dark`.

**Measured** (shirt layer alone, body outside the chest box; critic's script `meas.py`; §16): median
ΔE76 from the club primary Raja 12.3, Wydad 15.8, FUS 15.3, FAR 8.4 (revision 3: 19.7, 24.8, 26.1,
9.1); body L\* p5–p95 spread 27–31 (revision 3: 23–32).

### 5.2 The number, printed inside the shirt (revision 3)

- **Chest box** (jersey space): x 336–664, y 476–796, ink centred at (500, 636) (card space x
  316.3–683.7, y 447.1–805.5). The number with all its outlines must lie inside it. Font: Changa 800,
  `text-anchor="middle"`, `direction="ltr"`. **Fit on the ink, not the em box**: with `w1`, `h1` = the
  ink width and height at size 1 (from `metrics.ts`, §4), size = `min(300, (328 − 2 × 10 − 12) ÷ w1,
(320 − 2 × 10 − 12) ÷ h1)` (10 = half the outer outline, 12 = margin); then
  `x = 500 − (inkRight − inkLeft) ÷ 2`, `baseline = 636 + (inkAscent − inkDescent) ÷ 2` at that size.
  Measured sizes (Chromium, revision 3 mock): 8 → 300, 11 → 283.3, 44 → 243.2, 88 → 251.7,
  99 → 254.1; the painted ink of every one lies inside the box and inside the shirt (pixel scan,
  scratchpad `v3/design-selfcheck.md`). Number height ≈ 0.31 × the shirt's length (599) (≈ 23 cm on a
  73.7 cm shirt: between the 10–15 cm of a front number and the 25–35 cm of a back number in the UEFA
  Equipment Regulations, art. 10, scaled to a chest).
- **Layers of the print**, bottom to top, all inside `<g transform="JT">`: (1) fabric shadow — a copy,
  `#000` .35, filter `b5`, translated (0, 8); (2) shade — `#000` .38, class `mc-num-sh`; (3)
  highlight — `#FFF` .42, class `mc-num-hi` (both moved by the light, §8); (4) `<g data-mc="ovr">`:
  the hit rect (the chest box; dash: x 380–620, y 556–644), the outer outline (stroke 20
  `mix(primary, #000, .55)` .8, round joins), the twill (stroke 10), the fill, the **mesh** (a copy
  filled `knit`, opacity .3: the print takes the fabric's texture; not at 200 px), the **print light**
  (a copy filled linear y 476 → 796: 0 `#FFF` .22, .55 `#FFF` 0); then, **outside** the group,
  static and non-interactive, the **cloth on the print** (critique fix: the folds stopped sharply at
  the glyph edges): `<g clip-path="url(#numclip)" opacity=".55">` holding the centre crease of §5.1
  (filter `b4`, its light in `#FFF`) and a rect x 292–708, y 300–906 filled `numvol` at .5 (round 2:
  `volX`'s dark sides, 0 `#000` .34, .1 .12, .2 0, then clear to .82, .92 .12, 1 .36, with none of its
  `hl` lift in the middle: that tint pulled a white fill down to .92–.95 of white, 0.1–0.2 of contrast
  against the shirt); `numclip` is
  a `clipPath` containing a copy of the fill `<text>` (jersey space). The group is never animated and
  takes no pointer events.
- **Fill**: `#FFFFFF` if ≥ 3:1 on `club.primary`, else `#0E1116`. **Twill**: `club.secondary` if its
  contrast with the fill is ≥ 1.6, else `mix(primary, #000, .45)` under a white fill, else white. No
  club: fill by the same test on `mix(plate, #FFF, .16)`, twill `glow`.
- **« OVR »** (critique fix: 26 units at .86 failed 4.5:1 on 9 of 11 cards): (503.2, 830) jersey
  space (x + half the trailing tracking), Manrope 800 **32**, tracking .2em, the number's fill at 1,
  with a halo `stroke-width="6"` (**14 since §17**), `stroke-linejoin="round"`, `paint-order="stroke"`, stroke
  `mix(primary, #000, .55)` (**.8 since §17**) under a white fill, `mix(primary, #FFF, .45)` under an ink fill; outside the
  knit and print-light copies. Not drawn at 200 px. Measured: fill against its halo ≥ 8.9:1 on every
  card; fill against the bare shirt 3.7 on Raja green (white's ceiling there is 4.2:1), ≥ 5.0 on
  Wydad, FUS and MAS.
- **Null rating**: « — » fitted to the box x 380–620, y 560–640 centred at y 600 (max 220), the same
  print layers. **Confirmer fix: the forming marks are no longer drawn here**; they sit in the plaque
  under the shield's point (§3.3), and the paragraph below is history. Revision 3 drew them under the
  dash: N capsules 60 wide, gap 18, centred on x 500
  (critique fix: the empty ones measured 1.6:1): a **filled** mark is y 686–708 (`rx 11`) filled
  `#FFF2DA` with stroke 3 `mix(primary, #000, .55)` and a blurred copy (`b5`, `#FFF2DA` .55) under it;
  an **empty** mark is x + 2, y 688, 56 × 18, `rx 9`, filled `mix(primary, #000, .62)` with stroke 4
  `#FFF2DA`. Measured on Raja green: filled 3.8:1, empty fill 3.4–3.9:1 against the shirt (its thin
  ring 3.0–3.2). The label speaks the count (« 1 journée comptée sur 3 », `cardLabel`'s
  `a11y.counted`, unchanged).
- The number group is never inside a beat's animated element, a mask or a clip that changes; the light
  moves only the shade and highlight copies, which sit outside the group.

### 5.3 The field (revision 3): honeycomb backboard, floodlights, pitch lines

Revision 2's ribbons, glitch bars and pixel rain are **removed**. The field is a lit backboard in the
tier's colour, every item clipped to `WINDOW`, in this order (card space):

1. **Field gradient**: rect 0, 0, 1000 × 1060 filled linear y 22 → 1056: 0 `deep`, .55
   `mix(deep, plate, fieldMix)` (`fieldMix` .62, STADE .8), 1 `plate`.
2. `<g class="mc-field">` (the beats' reveal target):
   - **Honeycomb** (§5.4 says which mode). Hexagons are flat-top, radius 30; the pattern tile is
     **90 × 51.96** with five hexagons centred at (0, 0), (90, 0), (0, 51.96), (90, 51.96), (45, 25.98)
     (`hexPath(cx, cy, r)` = six `L` points at angles 0°, 60° … 300°, two decimals). Built as `<pattern>`
     elements (allowed by `markup-safety.ts`), never as generated paths. Every honeycomb pattern carries
     `patternTransform="translate(ox + dx, oy + dy)"` where **(ox, oy) is the card's fingerprint**:
     mulberry32 seeded with FNV-1a of `serial ?? name + "|" + season`, `ox = floor(r() × 90)`,
     `oy = floor(r() × 52)` (same card, same phase; another serial, another phase).
     - `hexD` stroke `#000` .55 w 2.6, (dx, dy) = (1.6, 2.2) — the cast edge of the emboss;
     - `hexL` stroke `#FFF` .2 w 1.4, (−1, −1.2) — the lit edge;
     - `hexM` stroke `light` .12 w 1.3 (STADE: `glow` .32), (0, 0) — the face line;
     - `hexC` (PRO): each hexagon r 27 filled `deep` .75 and again filled the cell gradient
       (objectBoundingBox, y 0 → 1: 0 `#FFF` .16, .45 `#FFF` 0, 1 `#000` .45) — raised dark-red tiles;
     - `hexW` (mask for CHAMPION and LEGEND): each hexagon r 27 filled `#FFF`.
     - Modes: **line** = `<g mask="url(#hexfade)" opacity="op">` with rects (0, 0, 1000 × 1056) filled
       `hexD`, `hexL`, `hexM`; **cells** = the same group with `hexC` then `hexL`; **holo** = the group
       (no opacity) with `hexD` at .45, then `<g mask="url(#cells)" opacity="op">` holding the moving
       foil rect (`class="mc-foil-shift"`, x −50, y −30, 1050 × 1120, filled `foil`, §5.5) — on LEGEND
       wrapped in `<g mask="url(#lightm)">` — then `hexL`. LASTREET wraps the whole set in
       `<g mask="url(#cageinv)">` (linear y 22 → 560: `#FFF` 0 → 1) so the fence and the honeycomb never
       overlap into a crosshatch.
     - `hexfade` mask (critique fix: **inverted**, so the jersey gets a calm zone and the cells show
       toward the frame): a rect filled radial centre (500, 560) r 640: 0 `#FFF` .12, .42 `#FFF` .3, .75
       `#FFF` .72, 1 `#FFF` .5. `cells` mask: a rect filled `hexW`. `lightm` (LEGEND): an ellipse
       (500, 560) r 380 of class `mc-light-follow` (§8.2) filled radial `#FFF` 1 → .55 `#FFF` .6 → 1 `#FFF`
       0, so about a third of the cells catch foil, where the light falls.
   - **LASTREET cage** (street football's fence): rect filled the pattern 44 × 44 holding
     `M0 22 L22 0 L44 22 L22 44 Z` stroked `#000` .4 w 1.6 translated (1, 1) (the wire's shadow on the
     backboard) and again stroked `light` .5 w 1.6, opacity **.38**, masked by a linear fade y 22 → 560
     (`#FFF` → `#FFF` 0). Then the **brushed sheen**: rect filled `brush` at .5.
   - **Grain**: rect filled `grain` (§3.2).
   - **Pitch lines** (the centre circle round the jersey and the halfway line behind it): circle
     (500, 630) r 318 and `M62 630 H938`, each drawn twice — `#000` .4 w 5 translated (2, 3) / (0, 3),
     then `light` .16 w 3 (an embossed line).
3. **Backlight** (soft light behind the jersey, centred so the field glows on both sides of the shirt):
   rect filled radial centre (500, 560) r 470: 0 `glow` .9, .5 `glow` .3, 1 `glow` 0, at opacity
   `back` (§5.4), + .15 for a dark shirt (§5.1).
4. `<g class="mc-flood">` **floodlights** (two; base: only the second): a beam
   `M x0−16 22 L x0+16 22 L xr 980 L xl 980 Z` filled linear y 22 → 980 (0 `beam` 1, .55 `beam`
   .35, 1 `beam` 0; `beam` = `beamCol` or `light`), filter `b14`, opacity `beamA`/`beamB`, with
   (x0, xl, xr) = (262, 330, 640) and (846, 380, 720); STADE adds a **narrow core** per beam,
   `M x0−5 22 L x0+5 22 L xr−c 900 L xl+c 900 Z` with c = .32 (xr − xl), same fill, filter `b5`, at .9 ×
   the beam's opacity; and its lamp, an ellipse (x0, 30) rx 80 ry 30 filled radial (0 `#FFF` 1, .35
   `beam` .6, 1 `beam` 0) at `min(1, 3.2 × beam opacity)`.
5. **STADE pool**: ellipse (500, 930) rx 330 ry 84 filled radial centre (500, 930) r 320 with
   `gradientTransform="translate(0 698) scale(1 .25)"`: 0 `light` .55 → 1 `light` 0.
6. **Vignette**: radial centre (500, 540) r 740: .5 `plate` 0 → 1 `plate` .9. **Foot**: linear y 760 →
   1056: `plate` 0 → `plate` .75 (darkens the shield's point).
7. **Dark-shirt aura** (only when the shirt's L\* < 25, critique fix for FAR's black shirt on LEGEND):
   `SHIRT` filled `glow` .55, filter `b18`, `transform="translate(500 603) scale(1.06) translate(-500
-603) JT"`.
8. The jersey's **cast shadow** (§5.1).

Measured (critic's `field.py`, flat pose, median of x 380–620, y 60–200): STADE L\* 9.6, C\* 8.0
(revision 3: 24.0 / 23.9, bronze); LEGEND L\* 15.5 away from the light (revision 3: 36.5,
lavender). Background texture (Sobel, background-only regions, §16): LEGEND fine texture 25.2 % →
17.0 %, strong edges 5.2 → 6.1 %.

The field is static apart from the foil shift. It is the card's fingerprint through the honeycomb
phase.

### 5.4 The foil ladder (revision 3 tokens)

A TypeScript table in `eclat/foil.ts`, literal hex. `tube` and the ribbon gradient are gone; `light` is
the rim-light colour; `beamCol` (STADE) the floodlight colour where it differs; `metal` is the
seven-stop frame gradient (§3.2); `spec` the colour of the travelling specular streak (§3.2); `tokEdge`
the 2 px token ring below 80 px (§7); `foil` is the CHAMPION/LEGEND holographic gradient. Critique
fixes in bold.

| Tier (`code`) | Display  | `plate`   | `deep`        | `glow`    | `light`   | `label`   | `edge` light / dark       | Sheen α | Beams A / B   | `back`  | Honeycomb                                  | `wordFill`            |
| ------------- | -------- | --------- | ------------- | --------- | --------- | --------- | ------------------------- | ------- | ------------- | ------- | ------------------------------------------ | --------------------- |
| `null` (base) | —        | `#12151B` | `#262B35`     | `#6B7484` | `#AAB3C0` | `#A3ACB9` | `#3A414D` / **`#626C7B`** | .08     | 0 / .05       | .22     | line, .50                                  | —                     |
| `homa`        | LASTREET | `#111418` | `#343B45`     | `#C7D0DC` | `#E8EEF5` | `#B5BFCA` | `#5C6672` / `#AEB8C5`     | .16     | .04 / .08     | **.45** | line, .42 + cage + brushed field and frame | `#E6ECF3`             |
| `stade`       | STADE    | `#0E0B05` | **`#1A140A`** | `#F2B544` | `#FFE2A6` | `#CDBB95` | `#9A6B16` / `#E9B055`     | .18     | **.18 / .28** | .36     | line (gold face), .75 + pool + gold band   | `#F6C96A`             |
| `pro`         | PRO      | `#1A0407` | `#6E0F18`     | `#F0545A` | `#FFC2C2` | `#D6B9B9` | `#B1262E` / `#EA6263`     | .18     | .06 / .12     | .34     | cells, 1                                   | `#FF9396`             |
| `champion`    | CHAMPION | `#03111C` | `#0D4A63`     | `#5FD0EE` | `#D8F6FF` | `#A9C9D6` | **`#145678`** / `#6FCFE5` | .20     | .08 / .14     | .34     | holo, **.30**                              | `#8FE6F7`             |
| `legend`      | LEGEND   | `#0D0314` | **`#1E0730`** | `#C77DFF` | `#F0D8FF` | `#C3B4D0` | **`#69257A`** / `#DE5EE4` | .22     | **.04 / .08** | .40     | holo, .60 **inside the light** (`lightm`)  | **`#1A0626` on foil** |

STADE also has `fieldMix` .8 (the field's middle stop), `beamCol` `#FFD27A` and the beam cores (§5.3).

| Tier       | `metal` stops (0 → 1, seven)                                              | `spec`    | `tokEdge` | `foil` stops (0 → 1, six)                                   | Material read                                     |
| ---------- | ------------------------------------------------------------------------- | --------- | --------- | ----------------------------------------------------------- | ------------------------------------------------- |
| base       | `#22262D` `#4A515C` `#2B3038` **`#575D67`** `#30353D` `#555C67` `#1E2228` | `#B8C0CC` | `#454C57` | —                                                           | dark graphite, minimal light                      |
| `homa`     | `#5D6670` `#D9DFE6` `#8E98A3` `#F4F7FA` `#78828D` `#C3CAD2` `#4E5660`     | `#FFFFFF` | `#C9D1DA` | —                                                           | brushed silver on charcoal, street cage           |
| `stade`    | `#5A3D0C` `#C99634` `#FFE9B0` **`#805917`** `#F0C566` `#6E4A10` `#D7A748` | `#FFF4D6` | `#E9B055` | —                                                           | deep black and metallic gold, spotlights          |
| `pro`      | **`#3A0509` `#9E1C24` `#E0424A` `#6E0E15` `#C0303A` `#8A141C` `#4A080E`** | `#FFD0D0` | `#E0424A` | —                                                           | crimson, raised dark-red hex tiles, red metal     |
| `champion` | `#0B3A48` `#3FAFC9` `#D9F8FF` **`#196679`** `#8BE3F2` `#0E4B5C` `#5CC9DF` | `#E8FCFF` | foil      | `#4FE0F0` `#3FB8C9` `#A6F0FF` `#6FA8FF` `#46D9C8` `#BDF6FF` | cyan–teal chrome, controlled iridescence          |
| `legend`   | `#2A0A3C` `#8E44B8` `#F2D6FF` `#5A1E7A` `#C98BEA` `#3A0F52` `#A866D0`     | `#FBEFFF` | foil      | `#FF8AD8` `#C59BFF` `#8FB4FF` `#7FF0E0` `#FFE3A8` `#E6A6FF` | deep purple and black, prismatic foil (strongest) |

PRO's metal lost the wide `#F27C80` pink stop (critique fix: the frame read salmon); the pink now
lives only in its narrow specular streak (`spec` `#FFD0D0`).

Round 2, contrast (measured from rasterised pixels at 296 and 336 px, `wp4/contrast-card.mjs`; the
changed tokens are in bold above). (a) **Light edge of CHAMPION and LEGEND**: the foil (`holo.edge` .55
and .85) is painted over the 3-unit edge stroke and lifted the line to 2.83–2.98:1 on the light page;
`edge` light goes from `#1F6F96` to `#145678` and from `#8E3A9A` to `#69257A` (the foil opacities are
unchanged), and the line reads 3.4:1 or more. (b) **Dark theme**: `edge` dark of the base card `#59616E`
→ `#626C7B` (3.15 → 3.7:1 against the page). The seven thickness walls are `metal[3]` mixed 35–71 %
toward black (`layers.ts`), so the back wall cannot reach 3:1 against a near-black page with any
colour (white would read 2.2:1); what can be chosen is whether the walls are seen. PRO's and LEGEND's
always sat under 1.5:1 and the silhouette was their lit edge line (6.0 and 6.4:1); the base, STADE and
CHAMPION walls climbed to 2.2:1 and the silhouette read as that ramp (1.96–2.28). `metal[3]` of those
three goes down by about a fifth so that their first four walls also stay under 1.5:1 and the lit
edge line is the silhouette (3.7, 10.2 and 11.1:1); LASTREET's silver walls stay lit (4.2:1 at the
fourth). Page colours measured: light `#F4F6F8`, dark `#040A17`.

Light and dark app themes (D3): the card's inside is identical; `edge` takes the light or dark column
(light ≥ 3:1 against `#FFFFFF`, dark ≥ 3:1 against the dark page — measure); the dark theme adds the
outer rim; the contact shadow (§8) is `rgb(8 12 24 / .42)` in light and `rgb(0 0 0 / .7)` in dark.
**No CSS `filter` on the card root or on any 3D ancestor** (a filter flattens `preserve-3d`); shadows
are their own element.

### 5.5 Holographic items (CHAMPION and LEGEND only, revision 3: restrained)

Revision 2's seal, sparkle field, diffraction grid, spectral ribbons and seven-hue `SPECTRUM` are
**removed** ("avoid rainbow overload, excessive sparkles"). What stays is foil on material, in each
tier's own narrow palette (`foil`, §5.4), moving with the light:

| Item             | Where                               | Spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | CHAMPION                                                   | LEGEND                                               |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| `foil` gradient  | base-layer defs                     | linear (0, 0) → (260, 180), `gradientUnits="userSpaceOnUse"`, `spreadMethod="reflect"`, the six `foil` stops                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                          | —                                                    |
| Honeycomb foil   | base layer, honeycomb **holo** mode | §5.3: foil seen through the hexagon cells only; LEGEND only where the light falls (`lightm`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | .30                                                        | .60 in the light                                     |
| Edge, band, rims | holo layer                          | `<mask id="hm">` (userSpaceOnUse, 0 0 1000 1618) = `OUTLINE` stroked 22 `#FFF` at opacity `edge`, clipped to `OUTLINE` (11 units inside); `WINDOW` stroked 20 `#FFF` at `band`; (LEGEND) `WINDOW_IN` stroked 3 `#FFF` .9; then **`TAB` filled `#000`** (critique blocker: the band's foil crossed the opaque tab, the club disc and the season) and the tab's own foil rim (`TAB` stroked 16 `#FFF` at `edge`, clipped to `TAB`); the plaque path stroked 4 `#FFF`. Then `<g mask="url(#hm)">` holding the moving rect (`mc-foil-shift`, x −62, y −30, 1100 × 1678, filled `foil`). Mirrored with the shapes in Arabic, so the cut-out follows the tab. | edge .55, band .35                                         | edge .85, band .60, + inner hairline                 |
| Foil plaque      | frame layer                         | §3.3: the plaque filled with the moving foil, the word in `#1A0626`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                          | yes                                                  |
| Glints           | holo layer                          | four-point stars (`star(x, y, s)`) filled `#FFF`, classes `mc-glint-a`/`-b` alternating, at (938, 830) s 16, (500, 1056) s 20, then (62, 830) s 16, (1000, 38) s 16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | first 2                                                    | all 4                                                |
| Diffraction      | foil overlay `::after` (HTML, §8)   | `linear-gradient(angle, transparent 0, f1 30%, f2 42%, f3 54%, f4 66%, transparent 92%)`, `background-size: 260%`, position `calc(50% + ax × 50%) calc(50% − ay × 30%)`, `mix-blend-mode: color-dodge`, `inset: 0 0 35% 0` (ends at y 1052, above the plaque; **never over the plate's text**), masked by the light-following ellipse intersected with a hole over the chest (`radial-gradient(ellipse 30% 26% at 50% 59.5%, transparent 70%, #000 100%)`, `mask-composite: intersect`): **the foil never crosses the number**                                                                                                                          | opacity .16; f1–f4 `#4FE0F0` `#A6F0FF` `#46D9C8` `#8FB4FF` | opacity .24; `#FF8AD8` `#C59BFF` `#7FF0E0` `#FFE3A8` |

LEGEND outranks CHAMPION (critique fix: the two read as one rarity in two colours) by two **material
features no other tier has** — the foil plaque with a dark engraved word and the second foil hairline
shield 16 units inside the band — and by contrast of setting: a near-black purple field (`deep`
`#1E0730`, beams .04/.08) in which only the cells under the light catch foil, against CHAMPION's
evenly lit cells at .30; plus a stronger edge and band (.85/.60 vs .55/.35), a wider prismatic palette,
four glints against two and a stronger diffraction (.24 vs .16). No new sparkles. Under reduced motion
every item is still there and still iridescent, frozen at the rest light (ax .24, ay .64; Arabic ax
−.24). Tiers below CHAMPION have none of these, and the tests assert it.

### 5.6 Fine detail and materials (all tiers, revision 3)

- **Kept as material**: grain (field, plate, tab), the shield band's metal / bevel / lit and shadow
  lips, the outer edge's metal / bevel / lips, the travelling specular streak, the brushed pattern
  (LASTREET), the honeycomb emboss (field and, faded, the plate), the shirt's piqué, creases, seams,
  hem stitch, rim and edge light, the plaque's hairline.
- **Removed** (§16): guilloche, micro-print, rivets, the season stamp, captions, tubes, glitch bars,
  pixel rain, ribbons, sparkles, seal, diffraction grid, the trailing capsule slot, stitched raglan
  and side seams, cuff stitches, the disc's inner hairline; by the critique: the band's centre ridge
  and the two hard grooves, the chest-disc initials, the 26-unit wordmark (replaced, §3.3).
- **Crispness**: everything is vector; no `<image>`, no raster texture, **no `feTurbulence`** (the
  fabric is a vector pattern). Filters are only Gaussian blurs with `color-interpolation-filters="sRGB"`:
  `b4` (stdDeviation 4, the creases), `b5` (5; region −20 % / 140 %), `b8` (8), `b14` (14; region x
  −40 % w 180 %, y −10 % h 120 %), `b18` (18). Hairlines ≥ 0.8 units. The card is **flat at rest**
  (§8.2) so text and hairlines are rasterised once, unresampled.

---

## 6. Every state, drawn

| State (fixture)                                            | Number     | Tier / foil                    | Marks                                                                                                                                                                                                                                                                                         | Other                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rated (`rated` 84 PRO)                                     | 84         | `pro`, tier word PRO           | none                                                                                                                                                                                                                                                                                          | Provisional changes nothing in the art.                                                                                                                                                                               |
| Forming (`born0` 0/3, `forming1` 1/3, `eve2`, `notFinal2`) | « — »      | base, no tier word             | N marks in the **plaque** under the shield's point (§3.3, confirmer fix): 60 wide, gap 18, 22 tall; k filled `#FFF2DA` with a dark keyline and a soft glow, the rest dark with a 4-unit `#FFF2DA` ring (filled 15.6:1, ring 10.0:1 against the plaque); the name at the rated cards' position | —                                                                                                                                                                                                                     |
| `insufficient3` (3/3, OVR null)                            | « — »      | base                           | none (k ≥ N): no plaque, the name centred by its ink between the point and the rule (§3.3)                                                                                                                                                                                                    | —                                                                                                                                                                                                                     |
| Null tier with a number (never expected)                   | the number | base                           | none                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                     |
| `homa` 61                                                  | 61         | `homa`, tier word **LASTREET** | —                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                     |
| `tierUp` 88, `legend` 93, `tierDown` 79                    | as given   | `champion`, `legend`, `stade`  | —                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                     |
| Serial null (`born0`)                                      | —          | —                              | —                                                                                                                                                                                                                                                                                             | Serial line `BOT —` (`serialLine`, as today)                                                                                                                                                                          |
| Founder (`founder`)                                        | —          | —                              | —                                                                                                                                                                                                                                                                                             | The capsule along the cut corner (§3.3, rev. 3): fill `deep` → `glow`, stroke 3 metal; a drawn star and « 26 » Changa 800 30, white, rotated −45° (Arabic +45°); at 200 px the star alone. Not a founder: no capsule. |
| Club null (`clubNull`)                                     | —          | —                              | —                                                                                                                                                                                                                                                                                             | The tab keeps its composition with the neutral placeholder disc (an embossed hexagon, §3.3; season at baseline 262); the neutral shirt `mix(plate, #FFF, .30)` (§5.1).                                                |
| Unnamed guest (`guestProfile()`)                           | « — »      | base                           | as counted                                                                                                                                                                                                                                                                                    | Empty name line §4.                                                                                                                                                                                                   |
| Guest with a club tried on                                 | « — »      | base                           | —                                                                                                                                                                                                                                                                                             | Panel in that club's colours.                                                                                                                                                                                         |
| `sample`                                                   | —          | —                              | —                                                                                                                                                                                                                                                                                             | « EXEMPLE » / «مثال» pill §3.3.                                                                                                                                                                                       |
| `seasonStarted` (2027/28 forming, previous 86)             | « — »      | base                           | 0/3                                                                                                                                                                                                                                                                                           | Season `2027/28` in the tab; the previous season's number stays in the DOM line, not on the card.                                                                                                                     |
| Long Latin, Arabic name                                    | —          | —                              | —                                                                                                                                                                                                                                                                                             | §4.                                                                                                                                                                                                                   |

`label()` stays `cardLabel(cleanProfile(p), s)`; what is spoken is what is drawn.

---

## 7. Every surface and size (revision 3)

`tokenBox(profile, size)` = `{ width: round(size × 0.618), height: size }` for every profile. Tokens and
minis are a `<span>` of that box with **one flat SVG** (no 3D layers, no foil overlay, no beats, no
filters, no blur, no patterns, no masks). **They are redrawn per size, not shrunk**: below the full card
the frame furniture, the plate's text and every texture are unreadable, so each size keeps only the OVR,
the tier identity (metal and field colour) and the jersey, and the jersey is **enlarged** inside the
silhouette so the number stays legible; the number never gets smaller as the token grows (critique fix:
it was smaller at 64 than at 48).

Let `u = 1618 ÷ size` (viewBox units per CSS pixel). Composition by size: **card** at ≥ 80 px,
**jersey** at 28–79 px, **mini** below 28 px. Every token draws the **token shirt** (critique fix: the
full shirt's 620-unit sleeve span, scaled 1.9–2.1 ×, lost its sleeves outside the silhouette):

```
SHIRT_TOKEN = M424 300 L352 318 L276 372 L298 452 L324 438 C320 600 318 760 316 888
              Q500 906 684 888 C682 760 680 600 676 438 L702 452 L724 372 L648 318 L576 300
              Q500 316 424 300 Z            (short raised sleeves: span 448, body 352–368; bbox 276, 300, 724, 897)
NECK_TOKEN  = M424 300 Q500 316 576 300 L500 384 Z
TOKEN_WINDOW = M62 46 Q62 22 86 22 H914 Q938 22 938 46 V1150 C938 1270 600 1410 500 1490
               C400 1410 62 1270 62 1150 Z  (80 px: a taller shield, its point at 1490)
TIER_BAR    = M320 1540 L346 1506 H654 L680 1540 L654 1574 H346 Z   (the plaque, without its word)
```

under `T = translate(500 Yc) scale(k) translate(−500 −603)` (603 = the jersey's vertical centre),
mirrored with the card in Arabic. Gradients for tokens: `metal` (§5.4; CHAMPION/LEGEND use their
`foil` stops instead), `field` linear y 0 → 1618: 0 `mix(deep, glow, .25)`, .6 `deep`, 1 `plate`;
`back` radial (500, 660) r 620: `glow` .55 → 0; `vol` linear x 316 → 684: 0 `#000` .26, .62 `#FFF` .12,
1 `#000` .22. The shirt: `SHIRT_TOKEN` filled `primary` (no club: `mix(plate, #FFF, .30)`), `NECK_TOKEN`
filled `mix(fill, #000, .55)`, `vol`, the V `M424 300 L500 380 L576 300` stroked `sec` (24 at 80, 30
below; butt caps, miter joins), and a keyline `SHIRT_TOKEN` stroked `0.9u ÷ k` `#000` .35 (no club:
`u ÷ k` in `light` .6, so the grey shirt separates from the grey field).

Static depth on every token: the outline copy filled `mix(edge, #000, .45)` translated (u, u) (Arabic
(−u, u)) under the card. Theme edge on every token: `OUTLINE` stroked `0.9u` in `edge`.

| Size (surfaces)                                                                                                                                                                          | Composition | `k`, `Yc` | Drawn                                                                                                                                                                                                                                                                                                                                                                                                                                             | Dropped                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full, 296 / 336 px (G1, G2, hero frames, M2, replay)                                                                                                                                     | card        | —         | everything (§3–§5); flat at rest, 3D while moving (§8)                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                                                                                                                                               |
| **G4, 136–200 px** (two cards face to face, at rest, no tilt; `HeadToHeadSheet`: 200 px from 768 px, `min(160, (viewport − 44) ÷ 2)` below, so 160 at 390 and 138 at 320; confirmer fix) | card        | —         | the full card, every remaining run sized for **≥ 8 CSS px at 136 px** (≥ 58 units): tier word 60 (baseline 1127, plaque sized to it), sample pill text 60 in a 380 × 84 pill, stat values 64 at baseline 1515 with dividers 1452–1532, name line 1 min 60 (line 2 and one-word mins already 64–80); forming marks 72 × 28; founder capsule with the star only (star r 16). Measured: min run 12.0 px at 200, 9.6 at 160 (also Arabic), 8.2 at 136 | the serial, the wordmark, « OVR », the season, the **club initials** (the disc's colours stay), the **stat labels** (the sheet prints CAP/SEL/TRF/CON with their long names directly under the cards, in the same order), the founder « 26 », the shirt's piqué and the print's mesh, the grain |
| 80 px, 49 × 80 (`HubCardBlock`, `gradins-card-setup-row`, `SeasonRack`)                                                                                                                  | card        | 1.86, 720 | plate, `TOKEN_WINDOW` filled `field` + `back`, the token shirt clipped to the window, `TOKEN_WINDOW` stroked `2u` metal, the **tier bar** filled metal, the edge (`OUTLINE` stroked `2u` metal clipped to the outline: 1 px), the number (box = the chest box)                                                                                                                                                                                    | name, stats, serial, season, tab, honeycomb, floodlights, pitch lines, folds, piqué, seams, hem, cuffs, disc, plaque text, glints, foil overlay                                                                                                                                                 |
| 64 px, 40 × 64 (same surfaces)                                                                                                                                                           | **jersey**  | 1.82, 780 | plate, the whole outline filled `field` + `back`, a **2 px ring** (`OUTLINE` stroked `4u` in `tokEdge`, foil on CHAMPION/LEGEND, clipped, drawn under the shirt), the token shirt clipped to the outline, the **tier bar** in `tokEdge` (foil), the number (box = the body: jersey x 322–678, y 440–840, centre 640)                                                                                                                              | as 80, and the window                                                                                                                                                                                                                                                                           |
| 56, 48, 44 px: 35 × 56, 30 × 48, 27 × 44 (`LeagueBand`, `TierLadder`, `RankCardToken`, `CardSaveLine`; 48 is the owner's check size)                                                     | jersey      | 2.04, 820 | as 64 with a **foot band** (rect y `1618 − 3u`, height `3u`, `tokEdge`/foil) instead of the tier bar; the sleeve tips overlap the ring                                                                                                                                                                                                                                                                                                            | the tier bar                                                                                                                                                                                                                                                                                    |
| 32, 28 px: 20 × 32, 17 × 28 (`LeagueRows`, `LeagueRowMini`)                                                                                                                              | jersey      | 2.21, 820 | as 48                                                                                                                                                                                                                                                                                                                                                                                                                                             | as 48                                                                                                                                                                                                                                                                                           |
| 24 px, 15 × 24 (`GuestPoints`, `LeagueCardBand`, `GuestIntroCardPoint`)                                                                                                                  | mini        | 2.21, 820 | as 32 without the number (the row prints it)                                                                                                                                                                                                                                                                                                                                                                                                      | the number                                                                                                                                                                                                                                                                                      |
| Share picture (`card-share-image.ts`, `image()`)                                                                                                                                         | card        | —         | the five layers flattened into one SVG at the rest pose (no 3D), the sheen and, for CHAMPION/LEGEND, the foil at its rest position; every text as a `TextRun`                                                                                                                                                                                                                                                                                     | the HTML foil overlay, the rims, the contact shadow                                                                                                                                                                                                                                             |
| Founder block (`FounderBlock`, `detail(p, "founder")`)                                                                                                                                   | crop        | —         | viewBox `560 1100 440 518` of the flat card (the cut corner with the founder capsule, the serial's end), Arabic `0 1100 440 518`, max 22 rem wide, own root `role="img"`                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                               |

Tier identity below 80 px: the 2 px ring separates the six tiers by **value** as well as hue (base dark
graphite `#454C57`, LASTREET light silver, STADE gold, PRO crimson, CHAMPION and LEGEND foil).

**The number on tokens** (`<g data-mc="ovr">`, two texts: an outline then the fill): fill white or
`#0E1116` by ≥ 3:1 on `primary`; outline stroke `2 × half` in `mix(primary, #000, .6)` under a white
fill, else white; `half = 1.1u` (card composition) or `0.8u` (jersey composition). Fit box (card
units): the box transformed by `T` (x `500 + (x − 500) k`, y `Yc + (y − 603) k`). Size = the §5.2 ink
fit with max 10000 (the box decides). A null number draws « — » at the same fit; nothing on the 24
mini.

Measured in the mock (two-digit ink height in CSS px, PRO, Raja; one digit in brackets): 80 px
14.1–16.8 (26.5); 64 px 12.1–14.4 (26.6); 48 px 10.1–12.0 (22.1); 32 px 7.1–8.4 (15.6). Targets: ≥ 14
at 80, ≥ 12 at 64, ≥ 10 at 48, ≥ 7 at 32 — all met. Holographic tiers on tokens: the edge, the ring,
the tier bar and the foot band take the `foil` gradient (static), nothing moves.

Share picture: `CARD_IMAGE_LAYOUT.card` (y 352–1496) already fits the art by scale; the art is drawn at
707 × 1144. `TextRun.face` gains `"serif"` (Instrument Serif) and `"displayLight"` (Changa 300); the
share module loads both before drawing (extend its font list, not `loadShareFonts` in Pépites). Every
run of `image()`: season, club initials, sample, the number (or « — »), OVR, the four labels and
values, the tier word, the two name lines, the serial, the founder « 26 » (its star is drawn in the
art). No chest-disc initials (removed).

---

## 8. Depth, light and tilt (revision 2, depths and light-following parts revised in revision 3)

### 8.1 Markup

```html
<div
  class="mc-eclat mc-eclat--{tier|base} mc-eclat--{light|dark}[ mc-holo][ mc-eclat--beat-{beat}]"
  role="img"
  aria-label="…"
  dir="ltr|rtl"
  style="--mc-sheen:.28;--mc-holo:.30"
>
  <div class="mc-eclat__shadow" aria-hidden="true"></div>
  <div class="mc-eclat__persp">
    <div class="mc-eclat__tilt">
      <svg class="mc-l mc-l--base">…defs, plate, window, field…</svg>
      <svg class="mc-l mc-rim" style="--k:1">…RING…</svg> … (k = 1 … 7)
      <svg class="mc-l mc-l--shirt">…</svg>
      <svg class="mc-l mc-l--num">
        …
        <g data-mc="ovr">…</g>
        …
      </svg>
      <svg class="mc-l mc-l--frame">…</svg>
      <svg class="mc-l mc-l--holo">…</svg>
      <!-- CHAMPION, LEGEND only -->
      <div class="mc-eclat__foil" aria-hidden="true"></div>
    </div>
  </div>
</div>
```

One root element, as the contract asks; all inner SVGs `aria-hidden`, `focusable="false"`.

### 8.2 The 3D (CSS, `eclat.css`)

**Flat at rest, 3D only while moving** (critique blocker: at rest the whole stack was drawn through a
perspective rotate plus `translateZ`/`scale`, which resamples every layer; measured edge step on the
name 43.7 at rest against 102.4 flat at DPR 2). The card is a plain 2D stack whenever no pointer is
moving over it, always under reduced motion, and on the G4 and sheet surfaces; the 3D tree exists only
in the states `.mc-eclat--active` (pointer), `.mc-eclat--idle` (touch float) and `.mc-eclat--settle`
(easing back), and fades in and out through a registered number `--mc-t`, so there is never a jump.

- `.mc-eclat { aspect-ratio: 1000/1618; container-type: inline-size; --mc-ax: .24; --mc-ay: .64;
--mc-dx: 1; --mc-t: 0; transition: --mc-t 450ms cubic-bezier(.2,.8,.2,1) }` (Arabic `--mc-ax: -.24;
--mc-dx: -1`). `@property --mc-ax`, `--mc-ay`, `--mc-t`: `<number>`, inherits, initial 0.
  `.mc-eclat--active, .mc-eclat--idle { --mc-t: 1 }`.
- `.mc-eclat__persp { position: absolute; inset: 0; perspective: 300cqw }`.
- **At rest**: `.mc-eclat__tilt { transform: none }` (transform-style flat), `.mc-l { transform: none }`,
  `.mc-eclat__foil { transform: none }`. The static depth is drawn in 2D: each rim
  `.mc-rim { transform: translate(calc(var(--o) * .12cqw * var(--mc-dx)), calc(var(--o) * .12cqw)) }`
  with `--o = 8 − k` (the back wall k 1 offset most, 2.5 px at 296), so the card's thickness shows at
  the trailing and bottom edges and inside the window's top-leading edges; plus the contact shadow, the
  raised number's shade and highlight, and the jersey's cast shadow.
- **In 3D** (`:is(.mc-eclat--active, .mc-eclat--idle, .mc-eclat--settle)`): `.mc-eclat__tilt {
transform-style: preserve-3d; transform: rotateX(calc(var(--mc-ay) * 7deg * var(--mc-t)))
rotateY(calc(var(--mc-ax) * 9deg * var(--mc-t))) }`; each layer and the foil overlay `transform:
translateZ(calc(var(--z) * 1cqw * var(--mc-t))) scale(calc(1 − var(--z) * var(--mc-t) / 300))` (the
  scale cancels the perspective's magnification so the layers align face-on); each rim
  `translate3d(calc(var(--o) * .12cqw * var(--mc-dx) * (1 − var(--mc-t))), calc(var(--o) * .12cqw *
(1 − var(--mc-t))), calc(var(--z) * 1cqw * var(--mc-t))) scale(…)` (the 2D offset hands over to
  real depth). Depths `--z`: base 0, rims 1…7, shirt 3, **number 5**, frame 8, holo 9, foil 9.5. The
  window is a box 8 % of the card's width deep.
- **Contact shadow** `.mc-eclat__shadow { position: absolute; inset: 5% 7% -2.5% 7%; border-radius:
6cqw; background: <§5.4>; filter: blur(4.5cqw); transform: translate(calc(var(--mc-ax) * -5cqw),
calc(3cqw + var(--mc-ay) * 3cqw)) }`: it lies opposite the light and moves with it. It is a sibling of
  the 3D tree, so its filter flattens nothing.
- **Raised number**: `.mc-num-hi { transform: translate(calc(var(--mc-ax) * 4px), calc(var(--mc-ay) *
-4px - 2px)) }`, `.mc-num-sh { transform: translate(calc(var(--mc-ax) * -6px), calc(var(--mc-ay) *
6px + 5px)) }` (SVG user units, jersey space; the number layer is not mirrored).
- **Light-following parts inside mirrored groups** multiply x by `--mc-dx` (critique side fix: in
  Arabic the cast shadow moved toward the light): `.mc-shirt-cast { transform: translate(calc(var(--mc-ax)
  - -14px _ var(--mc-dx)), calc(var(--mc-ay) _ 10px)) }`; `.mc-foil-shift { translate(calc(var(--mc-ax)
  - 50px _ var(--mc-dx)), calc(var(--mc-ay) _ -30px)) }`; **specular streak** `.mc-spec-shift {
    translate(calc(var(--mc-ax) _ 160px _ var(--mc-dx)), calc(var(--mc-ay) _ -100px)) }`; **LEGEND's
light** `.mc-light-follow { translate(calc(var(--mc-ax) _ 260px _ var(--mc-dx)), calc(var(--mc-ay) _
    -220px)) }`. These are 2D SVG translations (re-rendered as vectors, never resampled). Every moving
rect stays within 62 units of the card at rest (the 320 px overflow probe stays clean): honeycomb
foil x −50 … 1000, edge foil x −62 … 1038, specular 0 … 1000. **Glints**: `.mc-glint-a { opacity:
    calc(.2 + (ax + 1) × .4) }`, `.mc-glint-b { opacity: calc(.2 + (1 − ax) × .4) }`.
- **Sheen** (every tier), foil `::before`: `linear-gradient(var(--mc-sheen-angle), transparent
calc(50% + ax × 40% − 20%), rgb(255 255 255 / var(--mc-sheen)) calc(50% + ax × 40%), transparent
calc(50% + ax × 40% + 20%))`, `soft-light`; angle 115deg, 245deg in Arabic. Round 2 (contrast): a
  `mask-image` on the `::before` thins the sheen to a fifth over the chest, `radial-gradient(ellipse 24%
14% at 50% 38.7%, rgb(0 0 0 / .2) 0, rgb(0 0 0 / .2) 60%, #000 100%)`, centred on the number (the
  diffraction's own hole is 30 % × 26 % of its box). Soft-light lifts a mid-tone shirt by .03 to .04
  of luminance and leaves a white print as it is, which took the number to 3.0–3.1:1 against its shirt
  with the pointer over it; with the hole it reads 3.39 or more (`wp4/contrast-card.mjs`, every
  fixture, fr and ar, light and dark, 296 and 336 px, rest and pointer). The mask is on the foil's own
  leaf, so the flattening rules below hold. Diffraction (`::after`): §5.5.
- **Flattening rules** (each one breaks the depth while it is on): no `filter`, `opacity < 1`,
  `overflow` other than visible, `clip-path`, `mask`, `mix-blend-mode` or `isolation` on `.mc-eclat`,
  `.mc-eclat__persp` or `.mc-eclat__tilt`. The foil's `clip-path` and blend live on the foil itself, a
  leaf.
- **Crispness**: `will-change: transform` only while a pointer is moving (`.mc-eclat--active`). Check
  zoomed crops at DPR 2 and 3 at rest (must equal the flat render) and mid-tilt. Measured in the mock:
  rest 95.4 = flat 95.4 at DPR 2, 95.8 = 95.8 at DPR 3 (§16).

### 8.3 `tilt.ts`, the renderer's `mount`

- Mouse and pen: on `pointermove` (rAF-throttled) write `--mc-ax = clamp(2 × (x − left) / width − 1)`
  and `--mc-ay = clamp(1 − 2 × (y − top) / height)` on the root, remove `.mc-eclat--settle`, add
  `.mc-eclat--active` (`--mc-t` eases 0 → 1). On `pointerleave` add `.mc-eclat--settle`
  (`transition: --mc-ax, --mc-ay, --mc-t 450ms cubic-bezier(.2,.8,.2,1)`), write the rest values,
  remove `--active`; on the root's `transitionend` for `--mc-t` (and a 520 ms timeout as a fallback)
  remove `--settle` if the card is not active again, which returns it to the flat 2D stack. Measured in
  the mock: rest `transform: none` → active `matrix3d(…)`, `--mc-t` 1 → 150 ms after leaving `--mc-t`
  .03 → after settle `transform: none`, `transform-style: flat`, no running animation.
- **Touch-only devices** (`(hover: none)`): an `IntersectionObserver` toggles `.mc-eclat--idle`
  while the card is on screen; in CSS, inside `@media (prefers-reduced-motion: no-preference) and
(hover: none)`, `.mc-eclat--idle { animation: mc-float 7s ease-in-out infinite alternate }` with
  keyframes on `--mc-ax`/`--mc-ay` (0 % rest; 50 % −.28, .38; 100 % .1, .2). The float does not run while a
  beat plays (round 2 review, §18: the tilt does not start it on a root that carries `data-mc-beat`,
  and starts it on the drawing that follows the beat) and stops while `document.hidden`. It moves the whole card and its light; it never changes the number's opacity or
  covers it.
- Never mounted under reduced motion (`ManagerCard` guards) nor on G4: the card stays flat at the rest
  pose — with its 2D thickness, contact shadow, embossed number, travelling-light parts at their rest
  position and (CHAMPION/LEGEND) iridescent.
- Returns a cleanup (listeners, observer, inline variables). No long task > 50 ms while moving.
- `ManagerCard`'s `sway` prop is renamed **`tilt`** (G1, G2 and hero frames opt in; sheets do not).

### 8.4 Performance of the depth

Seven rims are seven tiny SVGs with one path each; the five layers share one `<defs>`. Revision 3
mock: 31–34 kB of markup per stage card, 39–44 kB with the critique fixes (the lip masks and creases
repeat long path strings; gzip removes most of it) (revision 2: 39–52 kB); in a headless software-raster
pointer sweep the median frame halved against revision 2 (16.7 ms vs 33.4 ms, relative only; not
re-measured after the critique fixes). Budget: the stage card's markup ≤ 46 kB (raised from 40 for the
critique's material fixes), `full()` ≤ 25 ms, 60 fps while tilting on a mid laptop (no frame > 20 ms
in a 3-second pointer sweep, Performance panel trace), and the idle float ≤ 2 % CPU on a throttled ×4
profile. WebGL / three.js is not used: the CSS 3D gives the depth the owner asked for at zero bundle
cost, and a WebGL runtime would add ≈ 150 kB gzip to the card chunk, over the 60 kB budget.

---

## 9. Beats (motion contract)

All CSS, inside `@media (prefers-reduced-motion: no-preference)`, scoped `.mc-eclat--beat-<name>`.
Only these elements ever animate: the floodlights (`.mc-flood`, rev. 3: the tubes are gone), the field
group (`.mc-field`), the foil overlay's `::after` sweep, the foil shift (`.mc-foil-shift`), the forming marks (`.mc-mark`), the capsule (`.mc-capsule`), the seal line
(`.mc-seal`). **Never** the number group, the serial, the tier word, any `<text>`, the shirt panel. The
tests parse each beat's markup and assert no animated class contains `data-mc="ovr"`, the serial or a
`<text>`.

| Beat      | When (unchanged moments)              | What moves                                                                                                                                                                                                                                                                                                                                                                                       | Total  |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `make`    | M2 born, M4 arrival, guest first view | Floodlights ignite (rev. 3): `.mc-flood` opacity .15 → 1 in `steps(3)`, 180 ms. Field reveals from the reading side: `clip-path: inset(0 100% 0 0)` → `inset(0)` (Arabic `inset(0 0 0 100%)`), 420 ms, `cubic-bezier(.16,1,.3,1)`, delay 60. Sheen sweep: the foil's `::after` (a 30 %-wide white .35 soft-light band) translates −120 % → 220 %, 480 ms, `cubic-bezier(.3,.7,.2,1)`, delay 120. | 600 ms |
| `tick`    | G1, a new counted journée             | The newest filled mark: `transform: scale(.4)` → 1 and its glow opacity 0 → 1, 260 ms `cubic-bezier(.16,1,.3,1)`, delay 40. If no marks (rated), the floodlights pulse opacity 1 → .4 → 1, 300 ms.                                                                                                                                                                                               | 300 ms |
| `first`   | M4 fresh, replay of a first rating    | The field kindles: `.mc-field` opacity .35 → 1, 360 ms ease-out, delay 40; the sheen sweep as `make`, delay 80.                                                                                                                                                                                                                                                                                  | 560 ms |
| `tier`    | M8 up to STADE, PRO, CHAMPION         | The foil arrives from the foot: `.mc-field` `clip-path: inset(100% 0 0 0)` → `inset(0)`, 420 ms `cubic-bezier(.16,1,.3,1)`; floodlights ignite (as `make`) at 200; sheen sweep at 120.                                                                                                                                                                                                           | 600 ms |
| `legend`  | M8 up to LEGEND                       | The prism crosses (rev. 3): the diffraction's `background-position` 0 % → 100 % and `.mc-foil-shift` translate −50 → 50 units, 540 ms `cubic-bezier(.3,.7,.2,1)`; floodlights ignite at 0.                                                                                                                                                                                                       | 540 ms |
| `founder` | M9, G2 founder Revoir                 | The capsule lights: its stroke `stroke-dashoffset` length → 0, 360 ms, then its fill opacity 0 → 1, 160 ms at 360 (the « ·26 » text is drawn above the fill and never moves).                                                                                                                                                                                                                    | 520 ms |
| `castoff` | M10 season closed                     | A seal line (rev. 3: `WINDOW` stroked 2 units `light`, in the frame layer, class `.mc-seal`) draws round the shield from the top-leading corner: `stroke-dasharray` = its length (`pathLength="1000"`), `stroke-dashoffset` 1000 → 0, 380 ms `cubic-bezier(.2,.8,.2,1)`, delay 40; the floodlights settle to opacity .6 over the same time.                                                      | 420 ms |

Beats run on the layers' own elements (the floodlights and `.mc-field` in the base layer, the capsule
and the seal line in the frame layer, the foil's sweep); the idle float (§8.3) is not a beat, is paused during one, and is excluded when the beats'
lengths are measured (`getAnimations()` filtered to `mc-beat-*` names). The `legend` beat moves the
diffraction foil's `background-position`.

`appliedBeat()` rules as today: a beat with nothing to do on this card is dropped without a trace
(`tier` on the base card, `founder` on a non-founder, `legend` on a non-LEGEND, `tick`/`first` with
nothing counted). `beatMs()` returns the totals above; `BEAT_CAP_MS = 600`.

---

## 10. The stage (G1, G2)

`CardStage` loses the rail (`data-stage-rail`, `RAIL_CENTRE`, the LEGEND exception) — an Écharpe
prop. In its place a **contact shadow**: an ellipse under the card, 86 % of the card width, 18 px
tall, centred 6 px below the card's bottom, `radial-gradient(closest-side, rgb(0 0 0 / .28),
transparent)` in light, `.5` in dark, `aria-hidden`, `pointer-events: none`, logical insets only. The
card's own contact shadow (§8.2) replaces this ellipse when it is drawn; keep the ellipse only for the
reserved box before the chunk loads. The card is centred; widths **296 px** (`min(296px, 100% )`; on G1's owner
stage 232 to 296 px by the phone's height, D16 round 2) and **336 px** from 768 px (revision 2); `ManagerCard width={336}`; `pt-5 md:pt-6` kept; the stage gains
18 px bottom padding and 8 px inline padding for the tilt's travel and the shadow. The e2e overflow probe's rail exemption is removed.

---

## 11. LASTREET (tier `homa`, display only)

- Dictionaries: `src/i18n/dictionary-fr.ts` `"card.tier.homa": "LASTREET"`; `src/i18n/dictionary-ar.ts`
  `"card.tier.homa": "LASTREET"`. No key renamed; `TierCode` stays `"homa"`; the DTO, contracts,
  fixtures (`homa` id and thresholds), analytics event names (`card_share_preview_homa`) and the
  database are untouched.
- ~~New key `card.caption.season`~~: **not added** (revision 3 removes the tab's caption).
- i18n gate: the key reads the same in both languages and has no Arabic script → add it to
  `IDENTICAL_ALLOWED` and `NO_ARABIC_SCRIPT_ALLOWED` in `src/i18n/i18n-allowlist.ts` with the reason
  (« LASTREET is the tier's name, a Latin word in both languages, owner 2026-10-09 »), and move
  `BASELINES` W1 9 → 10, W2 9 → 10 in `scripts/qa/i18n-gate.ts` with a comment in the house style.
- **Isolation in Arabic.** Add `TierWord` (in `src/components/manager-card/copy.tsx`-adjacent
  `tier-word.tsx`): renders `<bdi dir="ltr" translate="no">LASTREET</bdi>` for `homa` (and plain text
  for the other tiers, which are Arabic words in Arabic, Latin in French). In the Arabic UI the Latin
  run takes `--ui-font-display`'s Latin glyphs (Changa) and its `ltr:` tracking applies; check the
  computed `letter-spacing` of Arabic runs stays 0. For plain-string contexts (canvas, `aria-label`
  sentences built by concatenation, `title`): wrap in U+2066 … U+2069 when `lang === "ar"`
  (`isolateLatin(text)` in `copy.ts`); `cardLabel` keeps the bare word (screen readers).
- Call sites to switch to `TierWord` or `isolateLatin` (grep `tier[`/`tiers[`): `gradins/CardStage.tsx`
  (`RatingLine`), `ThisRoundBlock.tsx`, `LeagueRows.tsx` (string concatenation " · " — make it a node),
  `RevoirList.tsx`, `HistoryTable.tsx`, `TierLadder.tsx` (×3), `SeasonRack.tsx` (concatenation),
  `manager-card/inline/HubCardBlock.tsx` (×2), `moments/moment-text.tsx` (`tierWord` → a node for
  `fill()`), `moments/card-share-image.ts` (tier run: `face: "display"`, `dir: "ltr"`), the renderer's
  tier word (`direction="ltr"`, Latin tracking). Interpolated Arabic sentences with `{tier}`
  (`card.onboarding.m4.sheet.tier_distance`, `m8.up.heading`, `m8.down.line`, `m10.closed`,
  `m12.item.tier`, the `first`/today line) must receive the node.
- Tests: `copy.test.ts` (`homa: "LASTREET"`), `gradins.blocks.render.test.tsx` (the five words),
  `gradins.render.test.tsx` (`63 OVR · LASTREET`), plus a new test: no rendered text of any screen in
  either language contains `HOMA` or `حومة`, and in Arabic the word sits in a `bdi[dir=ltr]`.
- Docs: replace the visible word in `MANAGER_CARD_SECTION_PLAN.md` appendix A and the README tables
  with « LASTREET (key `homa`) »; leave history (evidence of #382) as written.

---

## 12. Architecture

### 12.1 Files

```
src/components/manager-card/eclat/
  README.md            what, why, the research links, measured numbers, how to add a beat
  index.ts             eclatRenderer: CardRenderer (id "eclat-v1"), ready(), mountTilt
  gradins-renderer.ts  the lazy entry (chunk name gradins-renderer, allowed by the off-bundle gate)
  geometry.ts          OUTLINE, every coordinate of §3 as named constants, mirror helpers
  foil.ts              the ladder of §5.4, contrast helpers (use src/lib/colour.ts)
  view.ts              cleanProfile, serialLine, label, labelAttr, esc (moved from echarpe/view.ts and knit.ts esc)
  name.ts              cleaning, split and fit (§4); pure, takes `measure`
  measure.ts           browser canvas measure + ready() font loading (Changa 300/800, Instrument Serif)
  metrics.ts           committed advance widths (data) + fallback measure
  field.ts             honeycomb (seeded phase), cage, pitch lines, backlight, floodlights, pool (§5.3, rev. 3); pure
  shirt.ts             the shirt, mesh, cuffs, collar, stitches, chest disc, bib (§5.1)
  number.ts            the chest-box fit and the print layers (§5.2)
  holo.ts              honeycomb foil, edge / band / plaque-rim foil mask, glints (§5.5, rev. 3)
  ornament.ts          frame materials: metal, bevel, brush, grain, shield band, outer edge, tab rim, plaque, capsule (§3.2–3.3, §5.6, rev. 3)
  layers.ts            assembles the five layers and the rims (§8.1); flatten() for tokens, detail and image
  full.ts              fullCard, cardAspect (constant), cardImage (text runs), founderDetail, appliedBeat
  token.ts             tokens and minis (§7)
  beats.ts             BEAT_MS, BEAT_CAP_MS = 600, which classes animate per beat
  tilt.ts              mountTilt: pointer light, settle, idle float (§8.3)
  ids.ts               unique SVG ids (as echarpe/ids.ts)
  estimate.ts          estimateAspect = () => 1.618 (the only module in the main bundle)
  eclat.css            foil, tilt, shadows, beats (all keyframes in no-preference)
  scripts/measure-faces.ts  regenerates metrics.ts (Playwright, Chromium)
  *.test.ts            render, name fit, field determinism, foil contrast, beats, tilt (happy-dom)
public/fonts/instrument-serif-latin-400-normal.woff2, …-latin-ext-…, instrument-serif-LICENSE.txt
  (Fontsource @fontsource/instrument-serif, version recorded in public/fonts/README.md)
```

`eclat.css` declares the `@font-face` for `"Instrument Serif"` (both subsets, `unicode-range`,
`font-display: swap`); it is never declared in `src/fonts.css` (the face is the card's, not the app's,
and with the switch off it is never requested). Changa is referenced as `var(--ui-font-display)` and
Manrope as `var(--ui-font-body)`; the card CSS never declares Changa (design-system contract). The SVG
`<text>` elements set `font-family` through classes (`.mc-f-d`, `.mc-f-dl`, `.mc-f-s`, `.mc-f-b`), and
the share image passes faces by name.

### 12.2 Interface changes (small, additive)

- `renderer.ts`: `TextRun.face` adds `"serif" | "displayLight"`; `CardRenderer.mount` doc: "the tilt";
  `id` example "eclat-v1".
- `ManagerCard.tsx`: prop `sway` → `tilt`; doc comments updated. `CardToken.tsx` unchanged.
- `active-renderer.ts`: `id: "eclat-v1"`, `load` imports `./eclat/gradins-renderer`, awaits `ready()`,
  returns `eclatRenderer`; `estimateAspect` from `./eclat/estimate`.
- `markup-safety.ts` (rev. 3, checked against `ALLOWED_CARD_TAGS`): **no new tag**. Revision 3 uses
  `div`, `span`, `svg`, `g`, `defs`, `clipPath`, `pattern`, `linearGradient`, `radialGradient`,
  `stop`, `path`, `rect`, `circle`, `ellipse`, `text`, `mask`, `filter`, `feGaussianBlur`, all on the
  list. `pattern` and `mask` are now **required** (honeycomb, knit, brush, grain, cage; the honeycomb
  fade, the foil cells, the edge foil): do not drop them. `feTurbulence` and `feColorMatrix` stay
  allowed but unused by eclat (the plain renderer may still use them; check before any removal). The
  attributes used (`patternTransform`, `gradientTransform`, `spreadMethod`, `maskUnits`,
  `unicode-bidi`, `textLength`, `lengthAdjust`, `pathLength`, `class`, `style` with custom properties)
  pass `findUnsafeMarkup` (it checks tag names, `on*` attribute names, `javascript:` URLs and angle
  brackets in values). The CSS-only pieces (the diffraction's `mask-composite`, the custom-property
  transforms) live in `eclat.css`, outside the markup.

### 12.3 Écharpe removal (last integration commit, after every test is green on eclat)

Delete `src/components/manager-card/echarpe/`. Update: `gradins.source.test.ts` (forbid importing
`/eclat/` from screens instead of `/echarpe/`), `tests/e2e/gradins-off.e2e.ts` regex (`echarpe` →
`eclat`), `moments/card-share-image.draw.test.ts` (`echarpeRenderer` → `eclatRenderer`),
`plain-renderer.ts` comments, `storage.ts` comment, `ReplaySheet.tsx`, `use-stage-beat.ts`,
`NoTeamHero.tsx`, `GuestHero.tsx`, `ClubTryOn.tsx`, `SeasonRack.tsx`, `FounderBlock.tsx` comments that
describe knitting or the scarf (words only; behaviour unchanged). `rg -n "echarpe|Écharpe|knit|scarf|tassel" src tests scripts`
must then find only history-neutral words, listed in the PR if any remain.

### 12.4 Tests

- `renderer-contract.test.ts` unchanged; it runs on `eclat-v1` automatically through `activeRenderer`.
  The "reserves a box close to the shape" test becomes exact (1.618).
- `eclat/render.test.ts`: per fixture × lang × theme: root shape, `data-mc="ovr"` present with « — »
  for null, no `>0<`; the serial carrier; founder capsule only for founders; club null bib; tier word
  per tier and none for null; LASTREET with `direction="ltr"`; Arabic mirrored (the tab's x > 794);
  beats: animated classes never contain the number, serial or text; `beatMs ≤ 600`.
- `eclat/name.test.ts`: the fixtures of §4 fit inside 790 (rev. 3) with the committed metrics;
  word-drop rule; the particle rule (`Les Lions du Derb Sidi Maarouf` → `LES LIONS` /
  `DU DERB SIDI MAAROUF`; `عبد الرحمن بن جلون العلوي` → `عبد الرحمن` / `بن جلون العلوي`; `Ali Ben` stays
  `ALI` / `BEN`); hostile names escaped.
- `eclat/field.test.ts` (rev. 3): same seed → identical markup; two serials → different honeycomb
  `patternTransform`; every tier has the honeycomb in its mode (base/LASTREET/STADE line, PRO cells,
  CHAMPION/LEGEND holo); only LASTREET has the cage, only STADE the pool; base has one floodlight, the
  others two; no ribbon, glitch bar or pixel-rain element remains.
- `eclat/shirt.test.ts` (rev. 3): the shirt path is the §5.1 constant; its bbox in card space after `JT`
  is x 152.8–847.2, y 250–921.8 (`getBBox` of `SHIRT` in jersey space: 190, 300, 810, 899.8; length ÷
  pit-to-pit between 1.40 and 1.50, span ÷ length between 0.95 and 1.10); the hem, cuffs, collar
  (clipped to `collar`, nothing above y 300) and cast shadow are present; the chest disc has no
  `<text>`; no club → the neutral shirt `mix(plate, #FFF, .30)`, no disc, the tab's placeholder;
  `SHIRT_TOKEN`'s bbox is 276, 300, 724, 897 and every token uses it.
- `eclat/foil.test.ts`: every ladder colour pair of §3.3 meets its floor with `contrastRatio`; `edge`
  light ≥ 3:1 on `#FFFFFF`; white/ink choice on every club of the kit table ≥ 3:1 (number) and ≥ 4.5:1
  (initials).
- `eclat/tilt.test.ts` (happy-dom): mouse moves write the variables; touch does not; cleanup removes
  listeners.
- `eclat/number.test.ts` (rev. 3): for every OVR 1–99, « — », both themes and every club of the kit
  table, the number's ink box (from the committed ink metrics, plus 10 units of outline on each side)
  lies inside the chest box x 336–664, y 476–796 in jersey space (dash: 380–620 × 556–644) and its four
  corners inside `SHIRT`; fill ≥ 3:1 on the shirt. Tokens: the same inside their transformed boxes (§7)
  at 80, 64, 48, 32.
- `eclat/holo.test.ts` (rev. 3): CHAMPION and LEGEND markup has the holo layer, the `hm` mask, the foil
  shift rect, the honeycomb cells mask and the `mc-holo` class; base, LASTREET, STADE and PRO have none
  of them; LEGEND has more glints (4 vs 2) and higher foil opacities than CHAMPION; no seal, no sparkle
  field, no grid in any tier.
- `eclat/layers.test.ts`: the full card has five layers + seven rims in z order, only the number layer
  takes pointer events, no `filter`/`opacity`/`clip-path` style on the 3D ancestors; tokens are one
  flat SVG; the size table of §7 (what drops) is asserted per size, including the G4 card at 200, 160 and 136 px (no
  serial, wordmark, « OVR », season, club initials or stat labels; every remaining text ≥ 58 units, so
  ≥ 8 CSS px at 136 px); a forming base card has the marks inside the plaque and none in the number
  layer, and its name lines carry the rated cards' baselines; the holo mask contains the
  `TAB` cut-out; LEGEND alone has the foil plaque and `WINDOW_IN`.
- `eclat/name.test.ts` adds the ink placement of §4: for every fixture the last line's ink ends ≥ 14
  above the rule and two lines keep ≥ 12 between their inks.
- `ManagerCard.test.tsx`: `tilt` prop.
- `gradins.e2e.ts`: drop the rail exemption; keep the number-at-every-frame test (the selector is the
  same); add a tilt check (mouse move over the card changes `--mc-ax`; with `reducedMotion: "reduce"`
  it does not, and `getAnimations()` stays empty); a depth check (at rest `.mc-eclat__tilt` and every
  layer compute `transform: none` and the first rim a 2D translate; with the pointer over the card the
  number layer's computed transform has a translateZ and `.mc-eclat__tilt` has `transform-style:
preserve-3d`; 600 ms after the pointer leaves, `transform: none` again).

### 12.5 Performance

`full()` builds one string; a full card is ≈ 121–136 drawn elements (rev. 3 with the critique fixes,
measured in the mock; 105–118 before them: the crease pairs, the band and edge lips, the specular
streak, the plate emboss and the tab placeholder are material, not decoration), five blur filters
(`b4`, `b5`, `b8`, `b14`, `b18`), no `feTurbulence`. Budgets as plan 6.6: `full()`
≤ 25 ms, `token()` ≤ 3 ms, chunk ≤ 60 kB gzip (Écharpe's charts are gone, expect ≈ 25 kB), G1 data to
`data-mc-ready` ≤ 400 ms at CPU × 4. Record in `eclat/README.md`.

---

## 13. Work packages (Sonnet implementers)

Git: each package in its own worktree and branch off `claude/manager-card-sorare-style`, merged back
in the order below by the coordinator (no force-push, no rewriting pushed history). Dev-server ports:
base tree 4181, WP0 4190, WP1 4191, WP2 4192, WP3 4193, WP4 4194 — never measure another worktree's
server. No database access in any package (mock modes only). The brief is committed first, on the
branch, before any interface change (AGENTS.md rule 3).

**Common "done when"** (each package, on its tree): `bun test`, `bun run typecheck`, `bun run lint`,
`bun run format:check` exit 0; `rg -in sorare src public` empty; `rg -n "HOMA|حومة" src/i18n` empty
after WP3.

| WP   | Owner files                                                                                                                                                                                                                                           | Order                                              | Does                                                                                                                                                                                                                                                                                                                                                                                                                                 | Done when                                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP0  | `docs/product/manager-card-sorare-style/before/**`, its capture scripts                                                                                                                                                                               | first, at once, on a worktree of `main` `8fae526c` | The **before** set of the brief's list (390 @2× and 1440 @1×, FR/AR, light/dark) from the base tree with `VITE_MANAGER_CARD_PREVIEW=1` and the mock modes, reusing `docs/product/manager-card-section/wp6b/capture.mjs` and `wp1/capture-off.mjs`; plus the switch-off set (Home, Fantasy, Pépites, the bar).                                                                                                                        | Every file of the list exists, named `<screen>-<fixture>-<lang>-<theme>-<width>.png`, and `before/INDEX.md` lists them with the command and port.                                                                                                                                                           |
| WP1  | `src/components/manager-card/eclat/**` except `token.ts`, `beats.ts`, `tilt.ts`, `holo.ts`, `layers.ts` and the 3D, foil and beats sections of `eclat.css`; `public/fonts/instrument-serif*`, `public/fonts/README.md`; `renderer.ts` (TextRun faces) | after the brief commit; parallel with WP0, WP3a    | §3–§6 (incl. §5.1 shirt, §5.2 number fit, §5.6 detail), §7's share-art `image()` and `detail()`, §12.1–12.2 (not yet switching `active-renderer.ts`). Unit tests of §12.4 for full, name, field, foil. A dev-only gallery route is **not** added; use a Bun script that writes `scratchpad` HTML of every fixture for eyeballing.                                                                                                    | The new tests pass; `eclatRenderer` passes `describeRendererContract` (temporarily add `describeRendererContract("eclat", eclatRenderer)` in the contract test); full() timing recorded. Screenshot of the gallery (scratchpad) at 264 px for the 6 tiers × FR/AR matches the mock (`mock.html`) in layout. |
| WP2  | `eclat/token.ts`, `eclat/beats.ts`, `eclat/tilt.ts`, `eclat/holo.ts`, `eclat/layers.ts`, `eclat.css` 3D + foil + beats sections, their tests                                                                                                          | after WP1's first commit (geometry, foil, view)    | §7 tokens and minis (static depth, detail drops), §5.5 holographic items, §8 depth layers, light, tilt and idle float, §9 beats, `appliedBeat`.                                                                                                                                                                                                                                                                                      | Token tests per size; beat tests (no number/serial/text in animated classes, totals ≤ 600); tilt tests; in Chromium with motion on, every beat's `document.getAnimations()` total duration ≤ 600 ms; with reduced motion, empty.                                                                            |
| WP3a | `src/i18n/dictionary-{fr,ar}.ts` (the one key), `src/i18n/i18n-allowlist.ts`, `scripts/qa/i18n-gate.ts` baselines, `tier-word.tsx`, `copy.ts` (`isolateLatin`), the §11 call sites, their tests                                                       | at once, parallel                                  | §11 LASTREET.                                                                                                                                                                                                                                                                                                                                                                                                                        | `bun scripts/qa/i18n-gate.ts` 0; the new no-HOMA test; an Arabic render test finds `bdi[dir=ltr]` round LASTREET in RatingLine, TierLadder and a moment heading.                                                                                                                                            |
| WP3b | `active-renderer.ts`, `ManagerCard.tsx`, `CardStage.tsx`, `HeroFrame.tsx`, `FounderBlock.tsx`, `moments/card-share-image.ts` (+ draw test), `tests/e2e/gradins*.ts`, `gradins.source.test.ts`, the §12.3 deletions and comment updates                | after WP1 and WP2 merge                            | Switch the app to `eclat-v1`, the stage (§10), `tilt` prop, share picture faces, delete Écharpe (§12.3), README.                                                                                                                                                                                                                                                                                                                     | `bun run build`; `bun scripts/qa/manager-card-off-bundle-gate.ts`; `bun scripts/qa/manager-card-fixture-gate.ts`; Playwright `gradins.e2e.ts` (preview, port 4193) and `gradins-off.e2e.ts` (built output) pass; the number-at-every-frame test passes.                                                     |
| WP4  | `docs/product/manager-card-sorare-style/INDEX.md`, `after/**`, measurement scripts, the PR description                                                                                                                                                | last                                               | The **after** set matching WP0 name for name; the gallery capture (every fixture × tier × size × theme × lang); contrast from pixels (`scripts/qa/contrast-probe.mjs`, incl. pointer-over-text sheen); overflow at 320/390 (`scripts/qa/layout-probe.mjs`); RTL checks; reduced motion; perf (CPU × 4); switch-off comparison against `main` (0.0 %); the Impeccable detector on changed files; a draft PR with the brief pasted in. | Every brief criterion has a row in `INDEX.md` with the command, the port, the number and the file. Draft PR opened; not merged, not published.                                                                                                                                                              |

Screenshots: `VITE_*_DATA_MODE=mock VITE_AUTH_MODE=mock VITE_MANAGER_CARD_PREVIEW=1 VITE_PEPITES_PREVIEW=1
bun run dev -- --host 127.0.0.1 --port <port> --strictPort`, fixtures with `?mc=<id>`, Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (`E2E_CHROMIUM_PATH`), as in
`docs/product/manager-card-section/INDEX.md` "How to read the runs".

---

## 14. Craft floor for the implementers (impeccable)

- One authored moment per screen: the card. Nothing else on the page gains glow, glass or gradients.
- Shadows have an offset and a blur (§5.4); no zero-offset coloured halos outside the tubes, which are
  light sources, not decoration.
- No Unicode glyph as an icon: the founder mark is a drawn star and the text « 26 », the capsule is drawn.
- The number is not gradient text: solid fill, keyline, shadow. The foil passes over the whole card
  (material), never as a text fill.
- Theme the parts nobody draws: the stage's focus rings and the share sheet stay on the kit.
- At every size, read it at arm's length: if a 44 px token does not read as "the same card, this tier",
  fix the token, not the spec.

---

## 15. Owner questions (default in bold, built unless the owner says otherwise)

1. **The card is dark in both app themes**, like Sorare's (alternative: a light plate in the light
   theme, which loses the lacquer and the glow).
2. **A new serif face (Instrument Serif) for the second name line**, loaded only with the card; the
   alternative is Changa 300 for both scripts, closer to the app, further from Sorare's look.
3. **On phones the card floats slowly by itself** (7 s, only while on screen, never under reduced
   motion). Alternative: still on phones, depth shown only by the 2D thickness and the shadow.
4. **The shirt panel carries the club's colours; with no club, a neutral shirt.** Alternative: no shirt,
   the number alone on the field (more abstract, loses the club).
5. **Revision 3: the name under the artwork, centred, with the tier in a plaque at the shield's point
   and the stats below the name** (owner asked for the name to be tied to the artwork). Alternative:
   revision 2's order (stats above the name, left-aligned, tier word in the stats row).
6. **Revision 3: the founder capsule along the cut corner, founders only.** Alternative: the trailing
   vertical capsule of revision 2, with an empty slot for non-founders.

---

## 16. Revision 3 record (owner feedback on revision 2, 2026-10-09)

**The feedback, in short:** the jerseys are too long, get the dimensions right; a hexagonal honeycomb
background with layered gradients in each card's colour, geometric texture, a shield-style frame;
3D jerseys; ten numbered points (football backgrounds, ≈ 40 % less clutter, a premium 3D jersey, a
clear hierarchy of name / OVR / tier with the name tied to the artwork, six tier treatments, lighting
and depth, physical materials with the asymmetric silhouette kept, small sizes that drop micro-detail,
restrained holography for CHAMPION and LEGEND, Arabic and French). Structure, statistics, tiers,
colour identity, interactions and business logic are unchanged.

**Decisions (rev. 3)**

| #   | Decision                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Jersey at measured flat-lay proportions (length 1.44 × pit-to-pit, span 1.04 × length, visible hem) drawn in 3D with vector shading only (§5.1).                                       |
| R2  | A shield-shaped embossed metal inner frame inside the unchanged outline (§3.2).                                                                                                        |
| R3  | Backgrounds are a honeycomb backboard (emboss, cells or foil per tier), floodlights, the centre circle and halfway line; no ribbons, bars or pixel rain (§5.3).                        |
| R4  | The plate reads shield point → tier plaque → name → stats → serial, centred; the tier word sits in a metal plaque at the shield's point (§3.3).                                        |
| R5  | The founder capsule moves to the cut corner and exists only for founders; the tubes become floodlights; the season stamp, captions, micro-print, rivets and guilloche go (list below). |
| R6  | Holography is foil on material in a narrow tier palette, kept off the number and the plate's text (§5.5).                                                                              |
| R7  | Tokens are recomposed per size with an enlarged jersey; no texture below full size (§7).                                                                                               |
| R8  | Everything stays inside the markup-safety allow-list (no new tags; §12.2).                                                                                                             |

**What was removed for clutter** (from the revision 2 card, all tiers unless named): 22 glitch bars and
their tails; 56 pixel-rain squares; 6 light ribbons with their soft copies and specular cores; 16
guilloche lines and 8 capsule ellipses; both micro-print lines; the season stamp (disc, dashed ring,
two numbers); the tab's club-name caption and « SAISON » caption; the tab's inner hairline; the leading
tube and the trailing tube (with their glow copies and cores); the four rivets; the rail's dark panel
and its hairline; the plate's second hairline; the empty capsule slot on non-founders; the shirt's
dashed raglan, side and cuff stitches; the collar's inner trim line (replaced by one highlight); the
disc's inner hairline; on CHAMPION and LEGEND the 16 / 34 sparkles, the holographic seal (disc,
twelve guilloche ellipses, rings, star, two captions) and the diffraction grid. **Measured**: drawn
elements per full card (outside defs, masks, patterns and clip paths; rims excluded) fall from
205–284 to 105–118 (−49 % to −58 %), and the card's markup from 39–52 kB to 31–34 kB.

**Research used (revision 3)**

| Source                                                                                                                                                                                                                                                                                         | What it gave                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [size-charts.com, football jersey size guide](https://size-charts.com/topics/sports-size-chart/football-jersey-size-soccer-shirt-size-guide/)                                                                                                                                                  | Men's M: body width 50.8 cm, body length 73.66 cm, sleeve 20.96 cm (garment dimensions).             |
| Grailed listings of a Nike Inter Milan 2000-01 home shirt, [L](https://www.grailed.com/listings/85138945-nike-inter-milano-nike-2000-2001-home-football-shirt-size-l-bnwt) and [S](https://www.grailed.com/listings/85139164-nike-inter-milano-nike-2000-2001-home-football-shirt-size-s-bnwt) | Flat pit-to-pit 60 / 50 cm, back length 75 / 68 cm: length 1.25–1.36 × pit-to-pit.                   |
| [Toffs, what is pit-to-pit](https://www.toffs.com/the-terrace/what-is-pit-to-pit-measurement.html)                                                                                                                                                                                             | How a flat lay is measured (armpit to armpit; shoulder top to hem).                                  |
| [UEFA Equipment Regulations, art. 10 Numbers](https://documents.uefa.com/r/kAuxpRxKhaqJDwAnTtB4CQ/_xmVDZGRigAabXoSDMpTsw)                                                                                                                                                                      | Back numbers 25–35 cm high, stroke 2–5 cm; front numbers 10–15 cm; numbers 1–99.                     |
| [FIFPlay, the FUT 16 card design](https://www.fifplay.com/fifa-16-ultimate-team-new-card-design/)                                                                                                                                                                                              | FUT puts the name directly under the player art and the attributes below it: the order R4 follows.   |
| Revision 2 research (§1)                                                                                                                                                                                                                                                                       | The 2022-23 and 2023-24 Sorare generations' honeycomb field and hexagonal window, the frame's metal. |

Honeycomb in football is the goal net's hexagonal mesh and the hexagonal jacquard of current match
shirts; the shirt's knit (§5.1) and the backboard (§5.3) use the same hexagon, at 4.2 and 30 units.

**Self-check of the revision 3 mock, before the critique** (Chromium 1194, DPR 2; scratchpad `v3/design-selfcheck.md`, the
pictures in `manager-card-sorare-style/design-v2-v3/`): no console error at 1440 and 390 in either
theme; no element rectangle outside the viewport at 390 (max right 390.0, min left 0); the number's
painted ink inside the chest box and inside the shirt for 8, 11, 44, 88, 99 and « — »; contrast medians
from pixels: names ≥ 11.8, tier word ≥ 6.9, stat values ≥ 8.7, stat labels ≥ 4.9 (with the pointer over the number; 5.3 at rest), the number ≥ 3.35
on its shirt; at 32 px two digits are 7.4–8.9 CSS px tall.

### 16.1 Revision 3 critique fixes (2026-10-09)

Three critics (collectible, hierarchy, jersey-and-material) and a measurement pass reviewed the
revision 3 mock; every finding was applied in the mock and in this plan unless the table says
otherwise. Measured on the mock (Chromium 1194, DPR 2, scripts in
`manager-card-sorare-style/design-v2-v3/scripts/`); the critics' own scripts were re-run where they
existed.

| Finding (severity)                                  | Outcome                                                                                                                                                                                                                                                                        | Measured after                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Holo band crosses the tab (blocker)                 | Applied: `TAB` cut out of `hm`, plus a foil rim on the tab (§5.5)                                                                                                                                                                                                              | crops: no foil over the disc or season, LTR and Arabic                                                                                                                                         |
| Flat-looking 3D jersey (blocker)                    | Applied with the jersey-colour finding: cylinder `volX`, pectoral and chest-shadow volume, cross-axis sleeves, paired creases at `b4` (§5.1)                                                                                                                                   | body L\* p5–p95 spread 27–31 (was 23–32); the ≥ 38 target is **not met**: a wider spread pulled the median away from the club colour (next row), and colour fidelity was kept                  |
| Soft text at rest, 3D resampling (blocker)          | Applied: flat 2D at rest and under reduced motion, 3D only while moving, `--mc-t` hand-over, 2D rim offsets (§8.2)                                                                                                                                                             | name edge step rest = flat (95.4 = 95.4 DPR 2, 95.8 = 95.8 DPR 3; was 43.7 vs 102.4); rest `transform: none`, back to none after settle                                                        |
| LEGEND not more prestigious                         | Applied: foil plaque with `#1A0626` word, inner foil hairline, CHAMPION cells .30 (the hierarchy critic's value, lower than the .35 asked here), LEGEND beams .04/.08, LEGEND foil cells only under the light (§5.5)                                                           | LEGEND field L\* 15.6 away from the light (was 36.5)                                                                                                                                           |
| Folds read as drips under the number                | Applied: the diagonal folds re-routed along the flanks; only the centre crease passes under the print, which now carries it (§5.1–5.2)                                                                                                                                         | zoom crops                                                                                                                                                                                     |
| Arabic line 2 crosses the rule; lines touch         | Applied: ink-based placement, Arabic line 2 max 92 (§4). **Variant**: the rule and stats never move; the name moves up instead (the critic offered moving the rule down)                                                                                                       | every fixture: ink ≥ 22 above the rule, lines ≥ 16 apart, line 1 ≥ 33 below the plaque/point                                                                                                   |
| Stats off-axis (two critics)                        | Applied: centres 252/417/583/748, dividers 335/500/665 (the hierarchy critic's equal pitch)                                                                                                                                                                                    | stat centres' mean x 500.0–500.1; founder capsule ≥ 32.5 units from any stat ink; widest Arabic label (`الانتقالات` at 34) clear of its dividers                                               |
| « Botola60 » wordmark; type ramp nits               | Applied as a real mark, **removal declined**: « BOTOLAGO », Changa 800 34, .14em, debossed, at y 600 — the card's only brand signature, and AGENTS.md rule 6 keeps BotolaGO's identity; meta consolidated to 34 / 30                                                           | wordmark and every meta run ≥ 5.15:1                                                                                                                                                           |
| LASTREET / no-club card unfinished                  | Applied: neutral shirt `mix(plate, #FFF, .30)`, `back` .45, brushed field, a hexagon placeholder in the tab (§3.3)                                                                                                                                                             | LASTREET shirt/field 1.55–2.12 (was 1.04–1.52)                                                                                                                                                 |
| Small sizes: empty plaque, weak tier identity       | Applied: 2 px ring in `tokEdge` (foil) below 80, separating by value; the bar kept at 80/64 as the plaque without its word (§7)                                                                                                                                                | `tokens-*.png`                                                                                                                                                                                 |
| Flat lower plate                                    | Applied: faded honeycomb emboss on the plate, STADE gold band, LASTREET brush (§3.2)                                                                                                                                                                                           | stat labels ≥ 6.86:1 (floor 4.9)                                                                                                                                                               |
| Name 20 % smaller, empty shield foot, uneven rhythm | Applied: shield point 1136 → 1056, plaque 1070–1142, name 80 / 120 / 144, rule 1404, labels 1462, values 1520, serial 1584 (§3.3)                                                                                                                                              | —                                                                                                                                                                                              |
| Base card's floating name                           | Applied: the name block moves up 86 with no tier word (§3.3). **Superseded by §16.2** (the marks fill the plaque instead)                                                                                                                                                      | line 1 ink 68 below the point (other tiers 42–68 below the plaque)                                                                                                                             |
| Busiest texture under the jersey                    | Applied: `hexfade` inverted and lowered (.12 centre → .72 → .5 at the frame), holo `hexD` .45, CHAMPION .30, LEGEND under the light only                                                                                                                                       | fine texture in background-only regions (own Sobel probe): LEGEND 25.2 → 17.0 %, CHAMPION 18.1 → 21.3 %, base 5.1 → 13.1 % (the honeycomb now sits toward the frame); **≤ revision 2 not met** |
| Chest-disc initials, EXEMPLE size                   | Applied: no initials; sample pill 230 × 50 at 30 (the type ramp's 30, not the 28 asked)                                                                                                                                                                                        | —                                                                                                                                                                                              |
| Club colours washed out                             | Applied: lighter darks, highlights in the shirt's own tint (§5.1)                                                                                                                                                                                                              | median ΔE Raja 12.3, Wydad 15.8, FUS 15.3, FAR 8.4 (was 19.7 / 24.8 / 26.1 / 9.1); **≤ 10 met on FAR only**                                                                                    |
| Collar « horns »                                    | Applied with one **variant**: butt/miter V clipped to the shirt and a band at the shoulder line; the back-neck rib follows the back neckline (`Q500 316`) instead of `Q500 282`, which would itself rise 16 units above the shoulders                                          | nothing drawn above jersey y 300                                                                                                                                                               |
| Number flat on folded cloth                         | Applied: static cloth overlay clipped to the glyphs (§5.2)                                                                                                                                                                                                                     | number fill ≥ 3.27:1 on its shirt (every card)                                                                                                                                                 |
| Shirt dissolves into the field                      | Applied: centred backlight, shadow-side edge light, dark-shirt aura and backlight +.15                                                                                                                                                                                         | critic's `sep.py`: ≥ 1.6 on base, STADE, PRO, CHAMPION; LASTREET 1.55–2.12; **LEGEND/FAR 1.05–1.48 not met** (the probe sits in the cast shadow on the left; the aura reads in the crops)      |
| Frame bands read as double wire                     | Applied: ridge and hard grooves removed, lit and shadow lips, a travelling specular streak (§3.2, §8.2)                                                                                                                                                                        | band profile (PRO, y 300): lip 72 · body 45 · lip 23 L\*                                                                                                                                       |
| Rim brightness reversed                             | Applied: tier metal, darkest at the back, 2 px dark stroke on the base outline                                                                                                                                                                                                 | crops at rest and tilted                                                                                                                                                                       |
| STADE muddy, LEGEND lavender                        | Applied (§5.4)                                                                                                                                                                                                                                                                 | STADE field L\* 9.6, C\* 8.0 (targets ≤ 14, ≤ 12)                                                                                                                                              |
| PRO metal salmon                                    | Applied: crimson stops; pink only in the specular streak                                                                                                                                                                                                                       | band at x 933: y 100 rgb(220, 97, 104), y 300 rgb(189, 65, 72) (was rgb(236, 141, 145), rgb(205, 101, 105)); mean y 60–800 rgb(164, 60, 66)                                                    |
| Token jersey loses its sleeves; 64 smaller than 48  | Applied: `SHIRT_TOKEN`, new `k`/`Yc`, 64 in the jersey composition (§7)                                                                                                                                                                                                        | two digits 14.1 / 12.1 / 10.1 / 7.1 CSS px at 80 / 64 / 48 / 32 (targets met)                                                                                                                  |
| « OVR » label fails 4.5:1                           | Applied: 32 units, opaque, halo (§5.2)                                                                                                                                                                                                                                         | ≥ 8.9:1 against its halo; against the bare shirt 3.7 on Raja (white's ceiling there is 4.2), ≥ 5.0 elsewhere                                                                                   |
| Micro text                                          | Applied (crest text removed, wordmark made real, pill enlarged)                                                                                                                                                                                                                | —                                                                                                                                                                                              |
| G4 at 200 px unseen                                 | Applied: a 200 px row in the mock and in §7; **superseded by §16.2** (160 and 136 px)                                                                                                                                                                                          | every remaining run ≥ 8 CSS px                                                                                                                                                                 |
| Forming pips 1.6:1                                  | Applied: 22-unit marks, dark-filled empty marks with a light ring (§5.2)                                                                                                                                                                                                       | Raja: filled 3.8, empty fill 3.4–3.9, empty ring 3.0–3.2; label speaks « 1 journée comptée sur 3 »                                                                                             |
| Nits                                                | Applied: long one-word min 64 with `lengthAdjust="spacing"`, founder star + « 26 », shirt taper and rounded hem, piqué instead of hex mesh, cage/honeycomb separated and the cage .38 with a shadow, Arabic labels 34 fitted to 165, `p.note` wrapping and the 360 px grid gap | the 320 / 390 / 1440 pages: no element outside the viewport, `scrollWidth` = viewport                                                                                                          |

Side fix found while measuring: the light-following parts inside mirrored groups moved the wrong way in
Arabic (the cast shadow went toward the light); they now multiply x by `--mc-dx` (§8.2). Drawn
elements per full card: 121–136 (revision 2: 205–284, so −40 % to −52 %; revision 3 before the
critique: 105–118), markup 39–44 kB.

### 16.2 Confirmer fixes (2026-10-09)

A confirmer reviewed revision 3 with the critique fixes and found two remaining issues; both are
applied in the mock and in the sections above. Measured with the scripts in
`manager-card-sorare-style/design-v2-v3/scripts/` (`extra.mjs` for the layout and the G4 runs,
`g4widths.mjs` for the G4 row at 1440, 390 and 320 px), Chromium 1194, DPR 2, reduced motion.

| Finding (severity)                                                                                                                                                                             | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Measured after                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G4 only specified at 200 px; on phones the sheet gives 160 px (138 at a 320 px screen), where the season, initials, sample pill, stat labels and tier word fell to 5.4–7.5 CSS px (should-fix) | Applied: one G4 spec for 136–200 px (§7). **Dropped** below the full card: the stat labels (the sheet prints CAP, SEL, TRF, CON with their long names directly under the two cards, in the same order), the club initials (the disc's colours stay), and, as before, the season, serial, wordmark, « OVR », founder « 26 ». **Enlarged** to ≥ 58 units: tier word 60, sample pill 60 (380 × 84), stat values 64, name line 1 min 60. The mock's G4 row now shows the pair at 200 px, at 160 px (French and Arabic interface) and at 136 px (the 320 px screen: a forming base card and the long-name CHAMPION). D16 records the sheet's widths | Every remaining run, font size × rendered width: min **12.0** CSS px at 200, **9.6** at 160 (Arabic too), **8.2** at 136 (tier word CHAMPION; stat values 8.7). The page at 320 px: all eight G4 cards 136 px, min 8.16; at 390: 171 / 160 / 136, min 8.16. No console message, no element outside the viewport, `scrollWidth` = viewport at 320, 390, 1440 |
| Base card's name floats with a dead band of ≈ 176 units above the rule, twice the rated cards' (should-fix)                                                                                    | Applied, the confirmer's second option in a form that keeps one layout for every tier: the forming marks (the 1/3 marks) leave the shirt and fill the **plaque** under the shield's point, where rated cards print the tier word; the name keeps the rated cards' baselines. A base card with no marks (`insufficient3`, or a number without a tier) has no plaque and its name is centred by its ink between the point and the rule (the confirmer's first option)                                                                                                                                                                            | « ALI » base (marks): plaque → name **68**, name → rule **88**; PRO and LASTREET « ALI » / « HAMZA »: 68 / 88 and 67 / 88. No plaque: point → name 121, name → rule 121 (one word); 95 / 95 (two words). Marks against the plaque: filled 15.6:1, empty ring 10.0:1 (296 px card: 18.6 × 7.4 CSS px)                                                        |

The base card's field under the hem moved by one point of L\* (the plaque now sits there: 15.1 → 14.6);
every other jersey-critic measurement is unchanged. Comparison sheets and captures were re-rendered
(`design-v2-v3/after/`, `compare/`); `after/g4-320-dark.png` is the G4 row at a 320 px screen.

## 17. Review fixes (2026-10-09, after the first build)

The build was reviewed (code, measurement and fidelity lenses) and every finding a verifier confirmed
is fixed in one commit, « Manager Card collectible: review fixes ». What changed, and what it was
measured with (Chromium 1194, DPR 2, mock data modes, a development server on its own port):

| Finding                                                                                                                                           | Fix                                                                                                                                                                                                                                                                                              | Measured                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A club colour went into attributes unchecked (the old renderer's test for a hostile colour was dropped)                                           | `cleanProfile` (`eclat/view.ts`) keeps a club only if its primary is `#rgb` or `#rrggbb` and reads a secondary that is not one as none; one change covers full, token, detail and image. Hostile-colour tests in `eclat/render.test.ts` and `renderer-contract.test.ts`                          | `findUnsafeMarkup` is empty for the full card, every token size, the detail and the share art, in both languages; both tests fail on the old `cleanProfile`                                                                                                                           |
| `html[dir="rtl"] * { letter-spacing: normal }` outranks the tracking attributes: LASTREET, « OVR », the serial and the wordmark lost it in Arabic | Tracking is an inline `style` on the `<text>` (`eclat/text.ts`, `trackingStyle`; « OVR » in `number.ts`), which outranks the rule; Arabic runs still carry none                                                                                                                                  | e2e under the app's stylesheet: computed letter-spacing of LASTREET, « OVR », the serial and BOTOLAGO is above 0 in French and in Arabic, and 0 for every Arabic-script run                                                                                                           |
| The share picture drew a name line that the card closes up by `textLength` at its natural width, past the art                                     | `TextRun.fitWidth` (`renderer.ts`), set from `textLength` in `toRun`; `drawArtText` closes the run's letter spacing to it (never opens it), and uses `fillText`'s `maxWidth` where the canvas does not space the letters (no `letterSpacing`, and Arabic, whose width does not move in Chromium) | `card-share-image.draw.test.ts`: the long Latin and the long Arabic name run no wider than 790 units of the art and stay inside it; in Chromium the Arabic one is narrowed by `maxWidth` (letter spacing did not move it), the Latin one is closed up by spacing                      |
| G1's round line fell 31 px under the bottom bar in Arabic and the e2e was loosened to allow it                                                    | The strict assertion is back. On a phone in Arabic the stage gives back its own padding (`CardStage`: top 20 → 12, bottom 18 → 0, the rating line's gap 12 → 8; `GradinsHome`: the identity line's gap 4 → 0), which the Arabic line boxes (leading 1.95) make visually larger than French's     | 390 × 844: French line ends 760.1 against the bar at 767.6; Arabic 759.0 against 761.6 (it was 793.0)                                                                                                                                                                                 |
| The born panel drew the compact card at 96 px, where the plate's text is 6 px                                                                     | The panel draws the 80 px token (the rating, the tier's identity, the jersey); 136 px would put the pitch's first row under the bar. `compact-floor.test.ts` reads the sources: no `<ManagerCard compact>` under 136 px                                                                          | Panel 200 px in French, 192 px in Arabic (ceilings 295 and 229)                                                                                                                                                                                                                       |
| « OVR » read 3.3:1 against its halo with the pointer over it (the 1 px halo disappears when the tilted label is resampled)                        | Halo `stroke-width` 6 → 14 (`OVR_HALO`), dark halo `mix(primary, #000, .8)` (it was .55), the share picture's eight offsets follow the width                                                                                                                                                     | Label against its halo (the brief's floor, 4.5:1), 8 fixtures × light and dark × French and Arabic: at rest 13.4 to 15.1, with the pointer over it **5.95 to 7.2**; against the bare shirt 2.8 to 3.2 with the pointer (white on Raja green tops out at 4.2 against the shirt itself) |
| The tier ladder drew five identical graphite tokens (`tierKeyOf` is `base` without a number) and dimmed four of them to 2.7:1                     | `CardProfile.ladder` (`types.ts`) makes `tierKeyOf` return the profile's tier without a number; `ladderProfile` (`to-profile.ts`) builds the ladder's step; no dimming                                                                                                                           | e2e: five different tokens, foil on CHAMPION and LEGEND only, a dash each, opacity 1; dash against its shirt **3.57:1** on all five (4.25 on STADE), both themes, French and Arabic                                                                                                   |
| The CSS sheen and diffraction crossed the tab: the club initials read 3.98:1 with the pointer over them                                           | The overlay's `clip-path` is the outline with the tab cut out (`FOIL_CLIP`, 20.6 % × 18.7 %), mirrored in Arabic; `holo.test.ts` reads the stylesheet and tests points of the tab and of the body against both polygons                                                                          | Initials against the disc, with the pointer over them, 5.05:1 on PRO, CHAMPION and LEGEND, light and dark, French and Arabic (the same as at rest)                                                                                                                                    |
| The renderer chunk and fonts started loading when the first card mounted, after the data                                                          | `preloadCardRenderer()` (`use-card-renderer.ts`), called by the `/gradins` layout as it mounts, in parallel with the page's data; with the section off nothing calls it                                                                                                                          | See `eclat/README.md`, « Measured »: development-server figures only                                                                                                                                                                                                                  |
| No after evidence of the card's surfaces                                                                                                          | `docs/product/manager-card-sorare-style/after/` with an `INDEX.md`, captured with the WP0 script                                                                                                                                                                                                 | See its `INDEX.md`                                                                                                                                                                                                                                                                    |

## 18. Round 2 (2026-10-10, integration)

The evidence of the first build (`docs/product/manager-card-sorare-style/INDEX.md`, « Findings that need the owner's eye ») was
answered in three lanes and an integration. The sections above are the current spec; this is what changed after §17 and what each
change was measured with (Chromium 1194, DPR 2 or 3, mock data modes, a development server of the integration tree on its own port).

- **Layout** (`gradins/CardStage.tsx`, `GradinsHome.tsx`, `PeopleBlock.tsx`). « Les vôtres » is no longer cut beside the 352 px card
  (finding 1): `PeopleBlock` has its own header, in which the link goes under the heading in French from 768 px instead of truncating
  it; 0 truncated headings in French and Arabic at 768, 1024, 1280 and 1440, and every heading of 13 screens at 7 widths whole. G1's
  card follows the phone's height (D16 round 2, §10): the next-round line ends 19.89 px (French) and 26.98 px (Arabic) above the bottom
  bar at 390 × 844 and 7.09 and 8.16 px at 360 × 740, for every state; below about 730 px of height it cannot clear the bar with a
  card of 232 px or more (finding 2).
- **Contrast** (§4, §5.2, §5.4, §8.2: `name.ts`, `number.ts`, `foil.ts`, `eclat.css`). A name is sized by its ink as well as its
  advance, so it keeps the 105 to 895 margin (100 of 100 drawings fit; the widest ink is 786.76). The number's cloth overlay has its
  own gradient, and the foil's sheen is thinned over the chest (§8.2): the number reads 3.42 or more at rest and 3.41 or more with the
  pointer on it, on all 64 cards (round 1: 3.00 and 2.94). The outer edge reads 3.46 or more on both pages, for every tier (round 1:
  2.83 on the light page, 1.96 with the walls on the dark page): CHAMPION's and LEGEND's light-page edge colours were darkened, the
  base card's dark-page edge lightened, and the walls of the base card, STADE and CHAMPION darkened by about a fifth in `metal[3]`.
  That last change makes those three tiers' first walls dimmer in the dark theme than the owner's design preview draws them; it is
  the one decision to review (to undo it: revert the three `metal[3]` values and the `walls` test in `foil.test.ts`, and accept the
  edge with the walls counted at 1.96 to 2.29 in the dark theme, a reading without a floor).
- **Tilt** (`eclat/tilt.ts`, `pose.ts`, `lift.ts`, `layers.ts`, the 3D and foil sections of `eclat.css`). A frame no longer restyles
  every SVG element: the tilt writes two non-inherited properties on the root and the foil, and the layers, the rims and the shadows
  are moved by transforms the compositor eases (README « Tilt performance »). Median frame 16.7 ms at CPU x1 and x4 (round 1: 33 to
  50 ms and 67 to 83 ms); a few long tasks of 56 to 75 ms per 3 s run remain, and the 336 px card's frame rate is under 60 on a busy
  machine, because a software rasteriser's draw time grows with the layers' area. The card also keeps its tilt when the host replaces
  its markup shortly after mount (a mutation observer on the host's children), which the old tilt lost on 5 of 30 loads. Share art
  and the founder detail are unchanged; a card that tilts is rebuilt once at mount (`data-mc-lift`).
- **Integration.** `origin/main` (#389, #390, #391: Home stories) merged with no file touched by both sides. `DESIGN.md` declares the
  card's own face (Instrument Serif, loaded only with the card), its six materials, its shadow black and its corner. The design
  preview's whole-page grids were retaken by stitching viewport screenshots: the half-drawn cards in the lower rows were an artefact
  of a single full-page capture of `preserve-3d` layers, not a bug in the mock.

- **Round 2 review fixes** (`eclat/tilt.ts`, `geometry.ts`, `ornament.ts`, `holo.ts`, `tests/e2e/gradins.e2e.ts`; the review of the
  integrated head `777bf6db`: 4 findings, all confirmed by a second reader).
  - _The touch float lost its depth after about half a second (blocker)._ `startFloat` writes the float's first pose, whose 450 ms
    transition ends in a `transitionend` that `onEnd` took for the end of a settle, so `flat()` cleared every layer's height and the
    number's crop; a finger's `pointerleave` after a tap, or the `pointercancel` of a pan, did the same through `onLeave`. Now a
    touch `pointerleave` or `pointercancel` is ignored, `onEnd` ignores the end of the float's own opening turn, and `flat()` puts the
    float back instead of clearing when the card is `--idle` (a pen that has left a floating card). Measured with a `hasTouch` and
    `isMobile` context at 390 × 844: the reviewer's probe read `none` on every leaf and no crop from about 700 ms; now the frame's leaf
    and the number read `matrix3d` with the crop kept, 1.5 s after the card appears and 1 s after a tap, and the new e2e reads `none`
    on the old file.
  - _The float started over a beat (should-fix)._ `syncIdle` now wants the float only when the root has no `data-mc-beat`. The test
    that stood for it only read a string from `lift.ts`; `tilt.test.ts` now mounts the tilt on a root with the attribute and checks
    nothing floats, runs or is written.
  - _The outer edge held 3:1 at rest only (should-fix)._ With the pointer on the card (the normal desktop state) the line read 1.5
    to 2.9 against the page on 5 of 6 tiers: the foil's edge band lay over the 3-unit line on CHAMPION and LEGEND, and the tilt
    resamples the layer, so a line under one device pixel wide (3 units, of which half is outside the layer's box and clipped:
    0.44 px at 296 px) lost its contrast. `EDGE_W` is now 10 (5 units show: 1.5 px at 296 px, 1.7 px at 336) and the foil's mask
    keeps that band clear (a black stroke of the same width along the outline, `holo.ts`). The colours are unchanged. The
    brief's criterion is read again at five pointer places (`wp4/contrast-card.mjs`, the centre and the 15 % / 85 % corners).
    The first review text suggested 6 units drawn above the holo layer; a stroke along the outline shows only its inner half, so
    that is 3 units shown, and in a trial of the width on the running card (same method) 6 units without clearing the foil left
    CHAMPION and LEGEND at 1.65 to 2.06 on the light page, and with the foil cleared 3.06 and 3.13 at 296 px and 3 of 60
    readings under 3 at 336 px (HOMA dark 2.45, STADE light 2.98). 10 units with the foil cleared holds both sizes with the
    pointer, so that was chosen instead of a layer above the holo. One visible change, for the owner: the outer line of the
    frame is about 1 px thicker, and on CHAMPION and LEGEND the foil no longer reaches the very edge: a dark line (the tier's
    edge colour) frames it on a light page.
  - _The e2e that says « flat again » did not look at what the tilt moves (should-fix)._ `depth()` now reads the frame's and the
    rims' leaves, the cast and the lifted pieces as well as the layers, and `will-change` on every element; both the rest and
    the after-leaving blocks (and the reduced-motion one) assert no 3D transform and no `will-change`. Planting a `translateZ` and a
    `will-change` on the frame's leaf, the rims and the cast is seen by the new query (3 transforms, 3 `will-change`) and was not
    by the old one (0).
