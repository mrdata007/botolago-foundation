# Manager Card, collectible style: design spec and build plan

The spec the implementers follow **literally**. Brief (preserve / improve / accept):
[`MANAGER_CARD_SORARE_STYLE_BRIEF.md`](MANAGER_CARD_SORARE_STYLE_BRIEF.md). Direction mock (open in a
browser, it follows this spec): [`manager-card-sorare-style/mock.html`](manager-card-sorare-style/mock.html).
Branch `claude/manager-card-sorare-style` from `main` `8fae526c`. Written 2026-10-09 by the design
director; nothing here has been built yet. **Revision 2 (same day, owner feedback on the mock):** more
pixels and fine detail (§3.2, §5.6), the number printed inside the shirt (§5.2), holographic items on
CHAMPION and LEGEND only (§5.5), real depth on every card (§8). Where revision 2 and an older line
disagree, revision 2 wins.

Where this spec gives a number, use that number. Where it says "measure", measure in Chromium on the
built card and write the value into the module's README. Where something is not covered, follow the
incumbent plan ([`MANAGER_CARD_SECTION_PLAN.md`](MANAGER_CARD_SECTION_PLAN.md)) and say so in the
commit message.

---

## 0. Decisions (the build's defaults; owner questions in §15)

| #   | Decision                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Model: Sorare's football card of the **2026-27 generation** (dark lacquered plate, raised tab, cut corner, lit tubes, two-face name). The rating is the centrepiece, as Sorare's in-app hex score is beside every card; on our card it is the shirt number.                                                  |
| D2  | No photo: **the shirt without the player.** A club-coloured shirt panel with a V collar fills the art window; the rating sits on it as a giant shirt number; behind it a generated field of light ribbons and glitch bars in the tier colour, seeded by the serial, unique and stable.                       |
| D3  | The card is a **dark object in both app themes** (Sorare's are). Theme changes only the outer edge, the rim and the drop shadow.                                                                                                                                                                             |
| D4  | Six-step foil ladder: base (no tier) graphite · LASTREET steel · STADE amber · PRO red · CHAMPION ice blue · LEGEND violet + prism.                                                                                                                                                                          |
| D5  | Name in two lines: first word in **Changa 800** caps; the rest in **Instrument Serif 400** caps (new, self-hosted, OFL, loaded only by the card chunk). Arabic names: Changa 800 over Changa 300.                                                                                                            |
| D6  | Fixed aspect 1 : 1.618 for every card (no height that changes with the data).                                                                                                                                                                                                                                |
| D7  | No card back, no flip: a flip hides the number (brief: never hidden), and the back would repeat the stats the page already shows under the card.                                                                                                                                                             |
| D8  | Tilt, depth parallax and moving light on mouse and pen; on touch-only devices a slow idle float (7 s, ±0.3 of the tilt range) while the card is on screen; no device orientation; under reduced motion the card is still and keeps its static depth.                                                         |
| D9  | New renderer `src/components/manager-card/eclat/` (« éclat », the shine), id `eclat-v1`. Écharpe (`echarpe/`) is **deleted** in the last integration commit; git history keeps it.                                                                                                                           |
| D10 | Tier `homa` is displayed **LASTREET** in French and Arabic (Latin word, isolated in Arabic). Key unchanged everywhere.                                                                                                                                                                                       |
| D11 | Our serial stays `BOT #482913`. No « x/1000 »: our cards have no supply cap and the plan bans scarcity and count wording.                                                                                                                                                                                    |
| D12 | **Premium detail** (rev. 2): grain, guilloche, bevels, recessed window walls, hairlines, micro-print, captions, a season stamp, screw-head rivets, sharper light streaks, a stitched mesh shirt with sleeves, cuffs and a chest disc. All vector (no raster image), crisp at DPR 2–3; it drops by size (§7). |
| D13 | **The number is printed on the shirt** (rev. 2): fitted inside the chest box with margin, outlined like tackle-twill, raised with light-following highlight and shade. Never outside the shirt; « — » too.                                                                                                   |
| D14 | **Holographic items for CHAMPION and LEGEND only** (rev. 2): pointer-following rainbow diffraction foil, a diffraction grid in the field, spectral ribbons, prismatic edge foil, sparkles and a BotolaGO holographic seal with the tier; LEGEND stronger. Other tiers: none.                                 |
| D15 | **Depth on every card** (rev. 2): the full card is five stacked layers in CSS 3D (field, shirt, number, frame, holo) plus a 7-step extruded rim, with parallax, a moving contact shadow and an embossed number; CSS and SVG only (no WebGL). Tokens get static depth.                                        |
| D16 | Stage card width (rev. 2): **296 px** on phones (`min(296px, 100vw − 32px)`), **336 px** from 768 px; G4 stays 200 px.                                                                                                                                                                                       |

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
player**: the club's colours as a shirt panel with a V collar, and on it the manager's rating as a giant
white shirt number, standing in a field of tier-coloured light ribbons and glitch bars generated from the
card's serial, so no two cards are the same. The name sits low in Sorare's two-face set (heavy sans over
light serif), the four stats run across the plate in labelled hairline columns, the identifier sits at
the foot. On a desk the card leans toward the pointer and a sheen and a foil follow it; on a phone it
holds a fixed sheen. Rarer tiers carry more foil, LEGEND a prism.

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

### 3.2 Layers, bottom to top (revision 2)

The full card is **five SVG layers** stacked in CSS 3D (§8), plus seven rim SVGs. Every layer uses the
same viewBox; shapes are drawn LTR and mirrored as a group in Arabic; text is never mirrored. The SVG
`<defs>` (gradients, patterns, filters, clip paths) live once in the base layer; the other layers
reference them by id (ids are document-wide and made unique per card by `scope-ids.ts`). `WINDOW` =
`M80 22H964Q982 22 982 40V1092Q982 1110 964 1110H80Q62 1110 62 1092V40Q62 22 80 22Z`; `RING` =
`OUTLINE + WINDOW` filled with `fill-rule="evenodd"` (the frame with the window cut out).

| Layer (z, §8)                          | Contents, bottom to top                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **base** (0)                           | `OUTLINE` filled `plate`; `WINDOW` filled with the radial gradient (centre (780, 90), r 1150: 0 `glow` .85, .38 `deep` .9, 1 `plate`); the field (§5.3) clipped to `WINDOW`, with, for CHAMPION and LEGEND, the diffraction grid (§5.5); the grain pattern (§5.6) over the window; the window vignette (linear 0 → .78 transparent → 1 `plate`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| rims (1–7)                             | Seven copies of `RING`, each in its own SVG at z 1…7 (§8), filled `mix(edge, #000, .25 + .07 k)`: the card's thickness and the window's inner walls, visible when the card turns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **shirt** (3)                          | §5.1, clipped to `WINDOW` (the frame above hides the sleeve ends behind the tab and the window edge).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **number** (6)                         | §5.2: the fabric shadow copy, the shade copy, the highlight copy, then `<g data-mc="ovr">` (hit rect, two outline copies, the fill), « OVR », the forming marks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **frame** (8)                          | `RING` filled `plate`, then the plate gradient (0 `deep` .55 → .3 `plate`), then the grain; the bottom plate glow (y 1110 → 1618: 0 `deep` .25 → .35 transparent); the guilloche (§5.6) clipped to `OUTLINE`; the window **recess** (`WINDOW` stroked 10 units with a gradient from `#000` .6 at top-leading to `#FFF` .25 at bottom-trailing: the walls of a sunken window); the window hairline (`WINDOW` stroked 1.2 white .22); the plate's double top hairline (y 1109 1.5 white .2; y 1116 0.8 white .08); the leading rail (x 0–62, y 330–1110, `plate` .6, a 1.2 white .12 trailing hairline) and its tube; the tab (fill `plate` .9, grain, an inner hairline inset 10 units white .12, outer stroke 1.5 white .18) and its contents; the capsule (and its inner hairline inset 8, white .08) and the trailing tube; the four rivets; the season stamp; the **bevel** (`OUTLINE` stroked 10, clipped to `OUTLINE`, gradient top-leading `#FFF` .38 → .45 transparent → .55 transparent → bottom-trailing `#000` .5); the edge (`OUTLINE` stroked 3 `edge`); the dark theme's outer rim; then every text of §3.3. |
| **holo** (9), CHAMPION and LEGEND only | §5.5: prismatic edge foil, sparkles, the holographic seal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| foil overlay (9.5, HTML)               | `<div class="mc-eclat__foil">`: the sheen (every tier) and the diffraction foil (CHAMPION, LEGEND), §8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Tubes** (rail x 25–35, y 360–640; trailing x 965–975, y 1150–1390; `rx 5`): a blurred copy in `glow`
.9 (stdDeviation 6) under the `tube` fill, plus a 2.4-unit specular core (inset 2 units, white .8).
**Rivets** at (24, 1592), (974, 34), (974, 1124), (24, 1124): r 6.5, fill `mix(plate, #FFF, .35)`, a
1-unit `#000` .5 ring, a slot (7 × 1.2, `#000` .55) and a 1.4-unit white .6 glint at (−2, −2.5).

Every layer but the number takes no pointer events (`pointer-events: none` on the SVG); in the number
layer only `[data-mc="ovr"]` does. The foil, holo and frame layers therefore never steal
`elementFromPoint` from the number.

### 3.3 Furniture and text positions (LTR; mirror x in Arabic)

| Element           | Position                                                                                                            | Face, size, weight, case, tracking                                                                                          | Colour                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Club name caption | tab, centre x 103, baseline 66, fitted to 160 units                                                                 | Manrope 800, 16, caps, tracking .14em (Latin), 0 (Arabic); `club.name[lang]`                                                | `#FFFFFF` .7                                                                        |
| Season            | tab, centre x 103, baseline 318 (no club: 200)                                                                      | Manrope 800, 30, `font-variant-numeric: tabular-nums`                                                                       | `#FFFFFF` .9                                                                        |
| Season caption    | tab, centre x 103, baseline 346 (no club: 228)                                                                      | Manrope 700, 15, caps, tracking .22em; Arabic Noto Sans Arabic 700, 17; new key `card.caption.season` « Saison » / «الموسم» | `label`                                                                             |
| Club disc         | tab, centre (103, 222), r 50, inner hairline r 40 white .3                                                          | fill `club.primary`; ring 7 units `club.secondary` (else white .5)                                                          | —                                                                                   |
| Club initials     | disc centre, baseline 234                                                                                           | Changa 800, 34, caps, tracking .02em (Latin), 0 (Arabic)                                                                    | white or `#0E1116`, whichever is ≥ 4.5:1 on `primary`                               |
| Sample pill       | x 744–952 (anchored at the trailing end), y 44–92, `rx 24`                                                          | Manrope 800, 26, caps, tracking .1em (Latin); fill `#000` .5                                                                | `#FFFFFF`                                                                           |
| Number            | §5.2                                                                                                                | Changa 800                                                                                                                  | §5.2                                                                                |
| « OVR »           | centre x 500, baseline 868 (inside the shirt)                                                                       | Manrope 800, 30, tracking .18em                                                                                             | the number's fill at .85                                                            |
| Season stamp      | window, centre (920, 160), r 40, `#000` .28, ring 1.5 white .5, dashed inner ring r 33                              | « 26 » Changa 800 22 at baseline 157, « 27 » Manrope 800 11 at 178 (the two halves of the season)                           | `#FFFFFF` .85 / .6                                                                  |
| Micro-print       | rail: x 52, from y 1100 upward, rotated −90°, clipped to 760 units; plate foot: x 56, baseline 1604, clipped to 700 | Manrope 700, 9.5, tracking .12em; the string « BOTOLAGO · {season} · BOT #{serial} · » repeated (no words to translate)     | `#FFFFFF` .34 / .3                                                                  |
| Stat labels       | x 56, 196, 336, 476 (start), baseline 1178                                                                          | Manrope 700, 34, caps, tracking .08em                                                                                       | `label`                                                                             |
| Stat values       | same x, baseline 1240                                                                                               | Manrope 800, 56, tabular-nums                                                                                               | `#FFFFFF`                                                                           |
| Stat dividers     | x 172, 312, 452; y 1146–1250; 1.5 units                                                                             | —                                                                                                                           | `#FFFFFF` .22                                                                       |
| Tier word         | x 600 (start), baseline 1178                                                                                        | Changa 800, 36, caps, tracking .12em (Latin words, incl. LASTREET in Arabic)                                                | `glow` (`lastreet`: `#E6ECF3`), with a 1-unit `#000` .5 shadow at dy 1.5 (engraved) |
| Name line 1       | x 56, baseline 1352                                                                                                 | Changa 800, max 92, min 60, caps                                                                                            | `#FFFFFF`                                                                           |
| Name line 2       | x 56, baseline 1478                                                                                                 | Instrument Serif 400, max 132, min 84, caps                                                                                 | `#FFFFFF`                                                                           |
| Serial            | x 56, baseline 1572                                                                                                 | Manrope 600, 38, tabular-nums, tracking .02em                                                                               | `#FFFFFF` .74                                                                       |

Stat value null → « — ». **Arabic stat labels** (`القائد`, `التشكيلة`, `الانتقالات`, `الثبات`) are
set in Noto Sans Arabic 700 (`var(--ui-font-body)` in Arabic), size 30, letter-spacing 0, each shrunk to
fit 128 units (min 24); they are ornamental duplicates of the stat tiles the page prints in the DOM.

**Anchors and direction.** `text-anchor` resolves against the run's own `direction`: an RTL run's
`start` is its right edge. In the Arabic interface every Latin or digit run is `direction="ltr"`
with `text-anchor="end"` at the mirrored x; every Arabic run is `direction="rtl"` with
`text-anchor="start"` at the mirrored x; in the French interface an Arabic run is `direction="rtl"`
with `text-anchor="end"` at x. The mock's `t()` helper is the reference. Stat label words are the app's (`strings.stats`): CAP · SEL · TRF · CON /
the Arabic short forms. In Arabic the four columns run right to left (CAP at x 944 end-anchored, then
804, 664, 524) and dividers at 828, 688, 548; the tier word starts at x 400 end-anchored.

**Contrast checks this layout must pass** (measure from pixels, §12): labels ≥ 4.5:1 on the plate;
values, names, tier word ≥ 4.5:1; serial ≥ 4.5:1; season ≥ 4.5:1 on the tab.

---

## 4. Names

**Split.** Clean as today (`knitName`'s first steps, moved to `eclat/name.ts`): trim, collapse spaces,
drop emoji and symbols, drop control and bidi characters; Arabic script: drop tatweel and harakat.
Latin script: uppercase with `toLocaleUpperCase("fr")` **keeping accents** (É, Ç), apostrophes and
hyphens. Then:

- two or more words → line 1 = first word, line 2 = the rest;
- one word → line 2 only (the serif line), baseline 1452, max 156, min 84; line 1 empty;
- empty (unnamed guest) → no text; an empty name line: a 2-unit rule at y 1478, x 56–420, white .22.

**Fit.** Width budget for each line: 744 units (x 56–800). Font size = `min(max, budget ÷ width(text at
size 1))`. If that is below the line's min: drop the last word of line 2 and try again (never cut
inside a word, never an ellipsis); if line 2 has one word left and still does not fit at min, set it at
min with `textLength = 744` and `lengthAdjust="spacingAndGlyphs"`. The full name is always in the label
and in the DOM under the card.

**Measuring.** `full()` takes an injected `measure(text, face, weight): number` (width at size 1). In
the browser, `eclat/measure.ts` uses a canvas `measureText` after `document.fonts.load` of the three
faces (Changa 800, Changa 300, Instrument Serif 400; wait at most 1.5 s, like `raster.ts`), caching per
string. On the server and in tests, `eclat/metrics.ts` gives committed advance widths (generated once in
Chromium by `eclat/scripts/measure-faces.ts`, a Playwright script, and committed as data: A–Z, À–Ü,
digits, space, `-`, `'`, `.` for Changa 800 and Instrument Serif 400; Arabic falls back to 0.52 em per
letter for Changa 800 and 0.46 em for Changa 300). `active-renderer.load()` awaits `ready()` (the font
load) before handing the renderer over, as today.

**Arabic script names.** Line 1 Changa 800 (max 92, min 60), line 2 **Changa 300** (max 112, min 76);
`direction="rtl"`, `unicode-bidi="isolate"`, letter-spacing 0. In the Arabic interface they are
end-anchored at x 944; in the French interface start-anchored at x 56 with `direction="rtl"` on the run.
A Latin name in the Arabic interface keeps the Latin faces and is end-anchored at x 944 with
`direction="ltr"`.

Fixtures to check by eye and by rectangles: `Ali`, `Les Lions du Derb`, `Abdelkarim
Benjelloun-Alaoui` (line 2 BENJELLOUN-ALAOUI fits at ≈ 92), `فاطمة الزهراء`, a 24-letter single word,
an empty name, every hostile name of `markup-safety.ts`.

---

## 5. The no-photo centre and the foil ladder

### 5.1 The shirt (the club), revision 2

- **Silhouette** (LTR, mirrored in Arabic): `M270 1110L270 440L214 462L196 350Q206 300 268 276L352 252
L432 250L500 322L568 250L648 252L732 276Q794 300 804 350L786 462L730 440L730 1110Z`: body x 270–730,
  short sleeves to x 196 / 804, a V neck. Sleeve tops reach under the tab; the frame layer covers them.
- **Fill** `club.primary`; then the **mesh** pattern (7 × 7: a 0.9-unit diagonal white .09, the other
  diagonal `#000` .10, a 0.6-unit vertical white .04: the knit of a football shirt); then the cloth
  light (left → right: 0 `#000` .18, .22 `#FFF` .12, .5 transparent, 1 `#000` .28); then the fade into
  the plate (y 250 → 1110: .8 transparent → 1 `plate`).
- **Cuffs**: `M196 350L214 462L232 455L214 346Z` and its mirror `M804 350L786 462L768 455L786 346Z` in
  `club.secondary` .95.
- **Collar**: back-neck band `M432 250Q500 234 568 250` stroked 10 `secondary`; the V
  `M432 250L500 322L568 250` stroked 18 `secondary`, round joins and caps; an inner trim line
  `M446 266L500 316L554 266` 2 units white .22.
- **Stitches** (dashed `6 5`, 1.6 units, `secondary` .5): raglan seams `M440 264L284 434` and
  `M560 264L716 434`, side seams x 286 and 714 from y 452 to 1070, cuff stitches `M226 352L242 450` and
  `M774 352L758 450`.
- **Chest disc** (the crest's place, never a crest): centre (628, 398) r 30, fill `mix(primary, #000,
.25)`, ring 4 `secondary`, inner hairline r 23 `secondary` .45, the club initials Changa 800 17 at
  baseline 404 (white or `#0E1116`, ≥ 4.5:1). Arabic: mirrored to (372, 398).
- **No club**: a training bib — same silhouette, fill `mix(plate, #FFF, .07)`, cuffs, collar and
  stitches in `edge` (dark column) / white .25, a 2.5-unit keyline in `glow` .55, no chest disc.
- Never a sponsor, a real kit pattern, a crest or any logo.

### 5.2 The number, printed inside the shirt (revision 2)

- **Chest box**: x 306–694 (the body minus 36 units each side), y 500–830; the number with all its
  outlines must lie inside it. Font: Changa 800, `text-anchor="middle"` at x 500, `direction="ltr"`.
  Size = `min(330, 330 × 352 ÷ (width at 330 + 22))` (352 = box width − 2 × 18 margin; 22 = the outer
  outline). Baseline 800. Two digits at most (the view clamps 1–99); one digit sits at 330.
  The box is checked on the glyphs' ink (cap height and advances from `metrics.ts`, or `getBBox()`
  narrowed to the cap height in the browser), not the font's em box, which runs below the baseline.
- **Layers of the print**, bottom to top: (1) fabric shadow — a copy, `#000` .35, blur stdDeviation 5,
  translated (0, 8); (2) shade — a copy, `#000` .42, class `mc-num-sh`; (3) highlight — a copy,
  `#FFF` .55, class `mc-num-hi` (both moved by the light, §8); (4) `<g data-mc="ovr">`: the hit rect
  (x 306–694, y 500–830; dash: y 560–760), the outer outline (stroke 22 `plate` .75, round joins), the
  twill outline (stroke 11), the fill.
- **Fill**: `#FFFFFF` if ≥ 3:1 on `club.primary`, else `#0E1116`. **Twill**: `club.secondary` if its
  contrast with the fill is ≥ 1.6, else `mix(primary, #000, .45)` under a white fill, else white. No
  club: fill white, twill `glow`.
- **Null rating**: « — » at size 260, baseline 720, the same print layers; the forming marks under it
  (§6, now 60 × 16, gap 18, top y 790).
- The number group is never inside a beat's animated element, a mask or a clip that changes; the light
  moves only the shade and highlight copies, which sit outside the group.

### 5.3 The field (generated, unique per card), revision 2

Seed = FNV-1a 32-bit of `serial ?? (name + "|" + season)`; PRNG mulberry32. Inside the window:

1. **Ribbons**: 6 cubic Béziers from x −80 to 1080. For ribbon i: start y = 110 + 150 i + r(−50, 50);
   controls at x 330 and 670 with y = start ± r(80, 240); end y = start + r(−110, 110). Stroke `glow`
   (CHAMPION and LEGEND: the tier's spectral gradient, §5.5), width r(5, 24), opacity r(.3, .7),
   round caps. Odd ribbons get a soft copy under them (width × 2, opacity × .55, stdDeviation 10).
   **Every ribbon gets a 1.6-unit specular core** in `tube` at opacity × .9 (the sharp light streak).
2. **Glitch bars**: 22 rects, y = r(36, 600) on 12-unit rows, height 8 or 13, width r(20, 150);
   fill `tube` r(.35, .85) for 14, `glow` .6 for 8; half of them get a 4–14-unit "tail" rect 6 units
   after their end.
3. **Pixel rain**: 56 squares 6 × 6 on a 12-unit grid, bands x 70–238 and 776–980, y 36–660, opacity
   r(.08, .35), fill `tube`.
4. Base (no tier): items 2 and 3 only, in `#8C95A3`, half the opacities.

The field is static. It is the card's fingerprint: the same card always draws the same field; a
different serial draws a different one.

### 5.4 The foil ladder (tokens)

A TypeScript table in `eclat/foil.ts`, literal hex (the share image's SVG cannot read CSS variables).

| Tier (`code`) | Display  | `plate`   | `deep`    | `glow`    | `tube`    | `label`   | `edge` light | `edge` dark | Sheen α | Holo (rev. 2)                                         | Ribbon gradient                                                                                            |
| ------------- | -------- | --------- | --------- | --------- | --------- | --------- | ------------ | ----------- | ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `null` (base) | —        | `#12151B` | `#262B35` | `#6B7484` | `#3A414D` | `#8C95A3` | `#3A414D`    | `#59616E`   | .12     | none                                                  | —                                                                                                          |
| `homa`        | LASTREET | `#111418` | `#3B4450` | `#C7D0DC` | `#EEF3F9` | `#9BA5B2` | `#5C6672`    | `#AEB8C5`   | .24     | none                                                  | —                                                                                                          |
| `stade`       | STADE    | `#1C1403` | `#7A4E12` | `#F2B544` | `#FFF2DA` | `#AA9C7E` | `#9A6B16`    | `#E9B055`   | .26     | none                                                  | —                                                                                                          |
| `pro`         | PRO      | `#1D0507` | `#8E1F27` | `#F0545A` | `#FFE1E2` | `#B6A3A2` | `#B1262E`    | `#EA6263`   | .26     | none                                                  | —                                                                                                          |
| `champion`    | CHAMPION | `#03111C` | `#155C80` | `#5FD0EE` | `#E0F5FC` | `#86A0AE` | `#1F6F96`    | `#6FCFE5`   | .28     | foil .30, grid .16, 16 sparks, seal r 58              | `#5FD0EE` 0, `#7A6BFF` .33, `#6BFF95` .67, `#B8F0FF` 1                                                     |
| `legend`      | LEGEND   | `#13041C` | `#6A2380` | `#E061E8` | `#F9E1FD` | `#9C93A6` | `#8E3A9A`    | `#DE5EE4`   | .32     | foil .42, grid .26, 34 sparks, seal r 68, double ring | prism: `#FF6AD5` 0, `#C774E8` .18, `#AD8CFF` .36, `#8795E8` .52, `#94D0FF` .68, `#5EE7DF` .84, `#FFE29A` 1 |

Light and dark app themes (D3): the card's inside is identical; `edge` takes the light or dark column
(light ≥ 3:1 against `#FFFFFF`, dark ≥ 3:1 against the dark page — measure); the dark theme adds the
outer rim; the contact shadow (§8) is `rgb(8 12 24 / .42)` in light and `rgb(0 0 0 / .7)` in dark.
**No CSS `filter` on the card root or on any 3D ancestor** (a filter flattens `preserve-3d`); shadows
are their own element.

### 5.5 Holographic items (CHAMPION and LEGEND only, revision 2)

`SPECTRUM` = `#FF4D6D`, `#FFB347`, `#FFF36B`, `#6BFF95`, `#4DD6FF`, `#7A6BFF`, `#FF6BD6` (a
`linearGradient` (0,0) → (1000,1618), `spreadMethod="reflect"`).

| Item             | Where                                                                       | Spec                                                                                                                                                                                                                                                                                                                                                                                                                               | CHAMPION      | LEGEND                            |
| ---------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------- |
| Diffraction foil | foil overlay `::after`                                                      | `repeating-linear-gradient(angle, SPECTRUM at 0, 2, 4 … 12 %)`, `background-size: 400%`, position `calc(50% + ax × 50%) calc(50% − ay × 50%)`, `mix-blend-mode: color-dodge`, masked by a radial gradient centred on the light (`#000` → .45 at 38 % → .18): the rainbow follows the pointer.                                                                                                                                      | opacity .30   | opacity .42                       |
| Diffraction grid | base layer, in the window                                                   | `SPECTRUM` rect masked by a pattern of 1.2-unit lines every 11 units rotated −28°                                                                                                                                                                                                                                                                                                                                                  | opacity .16   | opacity .26                       |
| Spectral ribbons | base layer (§5.3)                                                           | the ribbon gradient of §5.4 instead of `glow`                                                                                                                                                                                                                                                                                                                                                                                      | cool spectrum | full prism                        |
| Prismatic edge   | holo layer                                                                  | `OUTLINE` stroked with `SPECTRUM`, clipped to `OUTLINE` (inner half only, the `edge` stroke stays outside for the ≥ 3:1 boundary)                                                                                                                                                                                                                                                                                                  | width 6, .7   | width 9, .9                       |
| Sparkles         | holo layer                                                                  | four-point stars (`M x y−s Q x y x+s y Q x y x y+s Q x y x−s y Q x y x y−s Z`), drawn paths, seeded, never inside the chest box (x 290–710, y 470–890); fill white, every third one a `SPECTRUM` colour; two classes whose opacity follows the light: `.25 + (ax + 1) × .375` and `.25 + (1 − ax) × .375`                                                                                                                          | 16, s 5–15    | 34, s 5–20                        |
| Holographic seal | holo layer, centre (880, 1036) (Arabic (120, 1036)), over the window's foot | a soft shadow disc; a disc filled `SPECTRUM`; the line pattern at .25; 12 rotated ellipses (rx .72 r, ry .26 r, 0.7 white .35: guilloche); a ring r − 5 (1.5 white .8); a drawn star at (cx, cy − 14) s 13; the tier word (Changa 800 13; Arabic 17) and « BOTOLAGO » (Manrope 800 8.5, tracking .16em) in `#0E1116`. The group has `filter: hue-rotate(calc(var(--mc-ax) × 120deg))` (a leaf element, so it does not flatten 3D). | r 58          | r 68, a dashed second ring r − 11 |

Under reduced motion every item is still there and still iridescent, frozen at the rest light (ax .24,
ay .64; Arabic ax −.24). Tiers below CHAMPION have none of these, and the tests assert it.

### 5.6 Fine detail (all tiers, revision 2)

- **Grain**: a 17 × 17 pattern of five dots (r .6–.9; white .06–.08 and `#000` .14–.18) over the window
  (base layer) and over the frame and tab (frame layer).
- **Guilloche**: 16 sine lines across the bottom plate, line i: y = 1128 + 30 i + 9 sin(6π x/1000 +
  .5 i), sampled every 20 units, 0.8 white .05; and 8 concentric ellipses round the capsule centre
  (872, 1276), rx 70 − 5k, ry 150 − 9k, 0.8 white .035.
- **Bevel, recess, hairlines, rivets, stamp, captions, micro-print**: §3.2 and §3.3.
- **Crispness**: everything is vector; no `<image>`, no raster texture, no `feTurbulence`. Filters are
  only the three Gaussian blurs (6, 10, 5) with `color-interpolation-filters="sRGB"`. Hairlines ≥ 0.8
  units (0.24 px at 296 px wide, visible as a tone at DPR 2–3, intended).

---

## 6. Every state, drawn

| State (fixture)                                            | Number     | Tier / foil                    | Marks                                                                                                                                                                              | Other                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rated (`rated` 84 PRO)                                     | 84         | `pro`, tier word PRO           | none                                                                                                                                                                               | Provisional changes nothing in the art.                                                                                                                                                                                                         |
| Forming (`born0` 0/3, `forming1` 1/3, `eve2`, `notFinal2`) | « — »      | base, no tier word             | N capsules centred under the dash inside the shirt: each 60 × 16, `rx 8`, gap 18, top y 790; k filled (`#FFF2DA` with a blurred copy under it), the rest stroked 2 units white .45 | —                                                                                                                                                                                                                                               |
| `insufficient3` (3/3, OVR null)                            | « — »      | base                           | none (k ≥ N)                                                                                                                                                                       | —                                                                                                                                                                                                                                               |
| Null tier with a number (never expected)                   | the number | base                           | none                                                                                                                                                                               | —                                                                                                                                                                                                                                               |
| `homa` 61                                                  | 61         | `homa`, tier word **LASTREET** | —                                                                                                                                                                                  | —                                                                                                                                                                                                                                               |
| `tierUp` 88, `legend` 93, `tierDown` 79                    | as given   | `champion`, `legend`, `stade`  | —                                                                                                                                                                                  | —                                                                                                                                                                                                                                               |
| Serial null (`born0`)                                      | —          | —                              | —                                                                                                                                                                                  | Serial line `BOT —` (`serialLine`, as today)                                                                                                                                                                                                    |
| Founder (`founder`)                                        | —          | —                              | —                                                                                                                                                                                  | Capsule lit: fill linear gradient `glow` .9 → `deep`; « ·26 » (last two digits of `founder`) Changa 800 34, white, rotated −90° at the capsule centre, reading bottom → top; the capsule's stroke `tube` 2 units. Not a founder: empty capsule. |
| Club null (`clubNull`)                                     | —          | —                              | —                                                                                                                                                                                  | Tab without the disc and the club caption (season at baseline 200, its caption at 228); the bib (§5.1).                                                                                                                                         |
| Unnamed guest (`guestProfile()`)                           | « — »      | base                           | as counted                                                                                                                                                                         | Empty name line §4.                                                                                                                                                                                                                             |
| Guest with a club tried on                                 | « — »      | base                           | —                                                                                                                                                                                  | Panel in that club's colours.                                                                                                                                                                                                                   |
| `sample`                                                   | —          | —                              | —                                                                                                                                                                                  | « EXEMPLE » / «مثال» pill §3.3.                                                                                                                                                                                                                 |
| `seasonStarted` (2027/28 forming, previous 86)             | « — »      | base                           | 0/3                                                                                                                                                                                | Season `2027/28` in the tab; the previous season's number stays in the DOM line, not on the card.                                                                                                                                               |
| Long Latin, Arabic name                                    | —          | —                              | —                                                                                                                                                                                  | §4.                                                                                                                                                                                                                                             |

`label()` stays `cardLabel(cleanProfile(p), s)`; what is spoken is what is drawn.

---

## 7. Every surface and size

`tokenBox(profile, size)` = `{ width: round(size × 0.618), height: size }` for every profile. Tokens and
minis are a `<span>` of that box with **one flat SVG** (no 3D layers, no foil overlay, no beats, no
filters, no blur), whole-pixel geometry where it matters. Their depth is static: a 1-px rim copy of the
outline in `mix(edge, #000, .45)` offset (1, 1) px (mirrored in Arabic) under the card, a 1-px top-
leading highlight (white .3) and bottom-trailing shade (`#000` .4) along the outline.

| Surface (component)                                                                                                                                                               | Size                      | What is drawn                                                                                                                                                                                                                                                                                             | What drops                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| G1 stage (`CardStage` in `GradinsHome`, `GuestHero`, `NoTeamHero`), G2 (`GradinsCardPage`), hero frames (`HeroFrame`, `MomentHero`), M2 (`CardBornPanel`), replay (`ReplaySheet`) | full, 296 px (≥ 768: 336) | everything, in 3D (§8)                                                                                                                                                                                                                                                                                    | —                                                                                                                    |
| G4 face-à-face (`HeadToHeadSheet`)                                                                                                                                                | full, 200 px              | everything at the static rest pose; no `tilt` prop                                                                                                                                                                                                                                                        | micro-print (illegible at 200)                                                                                       |
| Founder block (`FounderBlock`, `detail(p, "founder")`)                                                                                                                            | crop                      | viewBox `560 1100 440 518` of the flat card (capsule, trailing tube, cut corner, the serial's end), Arabic `0 1100 440 518`, max 22 rem wide, own root `role="img"`                                                                                                                                       | —                                                                                                                    |
| Tokens 80, 64 (`HubCardBlock`, `gradins-card-setup-row`, `SeasonRack`)                                                                                                            | 49 × 80, 40 × 64          | outline with static depth, plate, radial glow, 3 ribbons (no cores), the shirt silhouette with collar and cuffs (no mesh, no stitches), the number at the §5.2 fit with one outline (twill) and no copies; CHAMPION/LEGEND: prismatic edge 1.5 px and the seal as a 6-px spectral dot; at 80 the tab disc | grain, guilloche, micro-print, captions, stamp, rivets, stats, name, serial, glitch bars, sparkles, foil, chest disc |
| Tokens 56, 44 (`LeagueBand`, `TierLadder`, `RankCardToken`, `CardSaveLine`)                                                                                                       | 35 × 56, 27 × 44          | outline with static depth, plate, radial glow, shirt silhouette flat, number with twill outline; CHAMPION/LEGEND: prismatic edge 1 px                                                                                                                                                                     | ribbons, collar trim, cuffs, disc, seal                                                                              |
| Minis 32, 28 (`LeagueRows`, `LeagueRowMini`)                                                                                                                                      | 20 × 32, 17 × 28          | outline (tab and cut corner kept), `deep` plate, the shirt as a flat club rect with a V notch, number (no outline) at 0.42 × height; CHAMPION/LEGEND: a 1-px spectral edge                                                                                                                                | everything else                                                                                                      |
| Mini 24 (`GuestPoints`, `LeagueCardBand`, `GuestIntroCardPoint`)                                                                                                                  | 15 × 24                   | outline, `deep` plate, club rect, edge (spectral for CHAMPION/LEGEND)                                                                                                                                                                                                                                     | the number (the row prints it)                                                                                       |
| Share picture (`card-share-image.ts`, `image()`)                                                                                                                                  | 760 × 1229.7 art          | the five layers flattened into one SVG at the rest pose (no 3D), the sheen and, for CHAMPION/LEGEND, a diffraction band baked as a static gradient; every text as a `TextRun`                                                                                                                             | the HTML foil overlay, the rims, the contact shadow                                                                  |

Numbers on tokens and minis: white or `#0E1116` by contrast against the panel, as §5.2, ≥ 3:1. A null
number on a token draws « — » at the same size; on the 24 mini nothing.

Share picture: `CARD_IMAGE_LAYOUT.card` (y 352–1496) already fits the art by scale; the art is drawn at
707 × 1144. `TextRun.face` gains `"serif"` (Instrument Serif) and `"displayLight"` (Changa 300); the
share module loads both before drawing (extend its font list, not `loadShareFonts` in Pépites). Every
run of `image()`: season, club initials, sample, the number (or « — »), OVR, the four labels and
values, the tier word, the two name lines, the serial, the founder « ·26 ».

---

## 8. Depth, light and tilt (revision 2)

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

- `.mc-eclat { aspect-ratio: 1000/1618; container-type: inline-size; --mc-ax: .24; --mc-ay: .64 }`
  (Arabic `--mc-ax: -.24`). `@property --mc-ax` and `--mc-ay`: `<number>`, inherits, initial 0.
- `.mc-eclat__persp { position: absolute; inset: 0; perspective: 300cqw }`.
- `.mc-eclat__tilt { transform-style: preserve-3d; transform: rotateX(calc(var(--mc-ay) * 7deg))
rotateY(calc(var(--mc-ax) * 9deg)) }`. **At rest the card already leans** (≈ 4.5° and 2°), so depth
  shows without any motion.
- Each layer `.mc-l { position: absolute; inset: 0; pointer-events: none; backface-visibility: hidden;
transform: translateZ(calc(var(--z) * 1cqw)) scale(calc(1 - var(--z) / 300)) }` (the scale cancels
  the perspective's magnification so the layers align face-on). Depths `--z`: base 0, rims 1…7, shirt
  3, number 6, frame 8, holo 9, foil 9.5. The window is a box 8 % of the card's width deep: the shirt
  and number float inside it, the frame is the front surface, the rims are its side walls.
- **Contact shadow** `.mc-eclat__shadow { position: absolute; inset: 5% 7% -2.5% 7%; border-radius:
6cqw; background: <§5.4>; filter: blur(4.5cqw); transform: translate(calc(var(--mc-ax) * -5cqw),
calc(3cqw + var(--mc-ay) * 3cqw)) }`: it lies opposite the light and moves with it. It is a sibling of
  the 3D tree, so its filter flattens nothing.
- **Raised number**: `.mc-num-hi { transform: translate(calc(var(--mc-ax) * 5px), calc(var(--mc-ay) *
-5px - 2px)) }`, `.mc-num-sh { transform: translate(calc(var(--mc-ax) * -7px), calc(var(--mc-ay) *
7px + 7px)) }` (SVG user units): the highlight sits toward the light, the shade away from it.
- **Sheen** (every tier), foil `::before`: `linear-gradient(var(--mc-sheen-angle), transparent
calc(50% + ax × 40% − 22%), rgb(255 255 255 / var(--mc-sheen)) calc(50% + ax × 40%), transparent
calc(50% + ax × 40% + 22%))`, `soft-light`; angle 115deg, 245deg in Arabic. Diffraction (`::after`):
  §5.5.
- **Flattening rules** (each one breaks the depth): no `filter`, `opacity < 1`, `overflow` other than
  visible, `clip-path`, `mask`, `mix-blend-mode` or `isolation` on `.mc-eclat`, `.mc-eclat__persp` or
  `.mc-eclat__tilt`. The foil's `clip-path` and blend live on the foil itself, a leaf.
- **Crispness**: `will-change: transform` only while a pointer is moving (`.mc-eclat--active`),
  removed on settle; no `will-change` at rest (it would freeze a blurry raster). Check zoomed crops at
  DPR 2 and 3 at rest and mid-tilt.

### 8.3 `tilt.ts`, the renderer's `mount`

- Mouse and pen: on `pointermove` (rAF-throttled) write `--mc-ax = clamp(2 × (x − left) / width − 1)`
  and `--mc-ay = clamp(1 − 2 × (y − top) / height)` on the root, add `.mc-eclat--active`. On
  `pointerleave` add `.mc-eclat--settle` (`transition: --mc-ax 450ms, --mc-ay 450ms
cubic-bezier(.2,.8,.2,1)`), write the rest values, remove `--active`.
- **Touch-only devices** (`(hover: none)`): an `IntersectionObserver` toggles `.mc-eclat--idle`
  while the card is on screen; in CSS, inside `@media (prefers-reduced-motion: no-preference) and
(hover: none)`, `.mc-eclat--idle { animation: mc-float 7s ease-in-out infinite alternate }` with
  keyframes on `--mc-ax`/`--mc-ay` (0 % rest; 50 % −.28, .38; 100 % .1, .2). The float pauses while a
  beat plays (`.mc-eclat--beat-* { animation-play-state: paused }` on the root) and while
  `document.hidden`. It moves the whole card and its light; it never changes the number's opacity or
  covers it.
- Never mounted under reduced motion (`ManagerCard` guards): the card stays at the rest pose — still
  leaning, layered, shadowed, embossed and (CHAMPION/LEGEND) iridescent.
- Returns a cleanup (listeners, observer, inline variables). No long task > 50 ms while moving.
- `ManagerCard`'s `sway` prop is renamed **`tilt`** (G1, G2 and hero frames opt in; sheets do not).

### 8.4 Performance of the depth

Seven rims are seven tiny SVGs with one path each; the five layers share one `<defs>`. Budget: the
stage card's markup ≤ 60 kB, `full()` ≤ 25 ms, 60 fps while tilting on a mid laptop (no frame > 20 ms
in a 3-second pointer sweep, Performance panel trace), and the idle float ≤ 2 % CPU on a throttled ×4
profile. WebGL / three.js is not used: the CSS 3D gives the depth the owner asked for at zero bundle
cost, and a WebGL runtime would add ≈ 150 kB gzip to the card chunk, over the 60 kB budget.

---

## 9. Beats (motion contract)

All CSS, inside `@media (prefers-reduced-motion: no-preference)`, scoped `.mc-eclat--beat-<name>`.
Only these elements ever animate: the tubes (`.mc-tube`), the field group (`.mc-field`), the foil
overlay's `::after` sweep, the forming marks (`.mc-mark`), the capsule (`.mc-capsule`), the seal line
(`.mc-seal`). **Never** the number group, the serial, the tier word, any `<text>`, the shirt panel. The
tests parse each beat's markup and assert no animated class contains `data-mc="ovr"`, the serial or a
`<text>`.

| Beat      | When (unchanged moments)              | What moves                                                                                                                                                                                                                                                                                                                                                                                                       | Total  |
| --------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `make`    | M2 born, M4 arrival, guest first view | Tubes ignite: opacity .15 → 1 in `steps(3)`, 180 ms, the leading tube at 0, the trailing at 60. Field reveals from the reading side: `clip-path: inset(0 100% 0 0)` → `inset(0)` (Arabic `inset(0 0 0 100%)`), 420 ms, `cubic-bezier(.16,1,.3,1)`, delay 60. Sheen sweep: the foil's `::after` (a 30 %-wide white .35 soft-light band) translates −120 % → 220 %, 480 ms, `cubic-bezier(.3,.7,.2,1)`, delay 120. | 600 ms |
| `tick`    | G1, a new counted journée             | The newest filled mark: `transform: scale(.4)` → 1 and its glow opacity 0 → 1, 260 ms `cubic-bezier(.16,1,.3,1)`, delay 40. If no marks (rated), the trailing tube pulses opacity 1 → .4 → 1, 300 ms.                                                                                                                                                                                                            | 300 ms |
| `first`   | M4 fresh, replay of a first rating    | The field kindles: `.mc-field` opacity .35 → 1, 360 ms ease-out, delay 40; the sheen sweep as `make`, delay 80.                                                                                                                                                                                                                                                                                                  | 560 ms |
| `tier`    | M8 up to STADE, PRO, CHAMPION         | The foil arrives from the foot: `.mc-field` `clip-path: inset(100% 0 0 0)` → `inset(0)`, 420 ms `cubic-bezier(.16,1,.3,1)`; tubes ignite (as `make`) at 200; sheen sweep at 120.                                                                                                                                                                                                                                 | 600 ms |
| `legend`  | M8 up to LEGEND                       | The prism crosses: the holo layer's `background-position` 0 % → 100 %, 540 ms `cubic-bezier(.3,.7,.2,1)`; tubes ignite at 0.                                                                                                                                                                                                                                                                                     | 540 ms |
| `founder` | M9, G2 founder Revoir                 | The capsule lights: its stroke `stroke-dashoffset` length → 0, 360 ms, then its fill opacity 0 → 1, 160 ms at 360 (the « ·26 » text is drawn above the fill and never moves).                                                                                                                                                                                                                                    | 520 ms |
| `castoff` | M10 season closed                     | A seal line (y 1110, 2 units, `tube`) draws from the reading side: `stroke-dashoffset` 1000 → 0, 380 ms `cubic-bezier(.2,.8,.2,1)`, delay 40; the tubes settle to opacity .6 over the same time.                                                                                                                                                                                                                 | 420 ms |

Beats run on the layers' own elements (the tubes in the frame layer, `.mc-field` in the base layer, the
foil's sweep); the idle float (§8.3) is not a beat, is paused during one, and is excluded when the beats'
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
reserved box before the chunk loads. The card is centred; widths **296 px** (`min(296px, 100% )`) and
**336 px** from 768 px (revision 2); `ManagerCard width={336}`; `pt-5 md:pt-6` kept; the stage gains
18 px bottom padding and 8 px inline padding for the tilt's travel and the shadow. The e2e overflow probe's rail exemption is removed.

---

## 11. LASTREET (tier `homa`, display only)

- Dictionaries: `src/i18n/dictionary-fr.ts` `"card.tier.homa": "LASTREET"`; `src/i18n/dictionary-ar.ts`
  `"card.tier.homa": "LASTREET"`. No key renamed; `TierCode` stays `"homa"`; the DTO, contracts,
  fixtures (`homa` id and thresholds), analytics event names (`card_share_preview_homa`) and the
  database are untouched.
- New key (revision 2) `card.caption.season`: « Saison » / «الموسم», the tab's caption.
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
  field.ts             seeded ribbons, bars, rain (§5.3); pure
  shirt.ts             the shirt, mesh, cuffs, collar, stitches, chest disc, bib (§5.1)
  number.ts            the chest-box fit and the print layers (§5.2)
  holo.ts              diffraction grid, prismatic edge, sparkles, seal (§5.5)
  ornament.ts          grain, guilloche, bevel, recess, rivets, stamp, micro-print (§5.6)
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
- `markup-safety.ts`: allowed tags unchanged (div, svg, g, defs, clipPath, linearGradient,
  radialGradient, stop, path, rect, circle, text, filter, feGaussianBlur are all already there); drop
  `pattern`, `feTurbulence`, `feColorMatrix`, `mask` only if nothing uses them any more (check the plain
  renderer).

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
- `eclat/name.test.ts`: the fixtures of §4 fit inside 744 with the committed metrics; word-drop rule;
  hostile names escaped.
- `eclat/field.test.ts`: same seed → identical markup; two serials → different; base tier has no
  ribbons.
- `eclat/foil.test.ts`: every ladder colour pair of §3.3 meets its floor with `contrastRatio`; `edge`
  light ≥ 3:1 on `#FFFFFF`; white/ink choice on every club of the kit table ≥ 3:1 (number) and ≥ 4.5:1
  (initials).
- `eclat/tilt.test.ts` (happy-dom): mouse moves write the variables; touch does not; cleanup removes
  listeners.
- `eclat/number.test.ts`: for every OVR 1–99, « — », both themes and every club of the kit table,
  the number's box (from the committed metrics, incl. the 22-unit outline) lies inside the chest box
  x 306–694, y 500–830; fill ≥ 3:1 on the shirt.
- `eclat/holo.test.ts`: CHAMPION and LEGEND markup has the holo layer, the seal, sparkles, the grid
  and the `mc-holo` class; base, LASTREET, STADE and PRO have none of them; LEGEND has more sparkles
  and a larger seal than CHAMPION.
- `eclat/layers.test.ts`: the full card has five layers + seven rims in z order, only the number layer
  takes pointer events, no `filter`/`opacity`/`clip-path` style on the 3D ancestors; tokens are one
  flat SVG; the size table of §7 (what drops) is asserted per size.
- `ManagerCard.test.tsx`: `tilt` prop.
- `gradins.e2e.ts`: drop the rail exemption; keep the number-at-every-frame test (the selector is the
  same); add a tilt check (mouse move over the card changes `--mc-ax`; with `reducedMotion: "reduce"`
  it does not, and `getAnimations()` stays empty); a depth check (the number layer's computed
  transform has a translateZ; `.mc-eclat__tilt` has `transform-style: preserve-3d`).

### 12.5 Performance

`full()` builds one string; the field is ~70 elements; no `feTurbulence`. Budgets as plan 6.6: `full()`
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
- No Unicode glyph as an icon: the founder mark is text « ·26 », the capsule is drawn.
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
   motion). Alternative: still on phones, depth shown only by the rest lean and the shadow.
4. **The shirt panel carries the club's colours; with no club, a neutral bib.** Alternative: no shirt,
   the number alone on the field (more abstract, loses the club).
