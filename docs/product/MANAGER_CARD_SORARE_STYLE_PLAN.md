# Manager Card, collectible style: design spec and build plan

The spec the implementers follow **literally**. Brief (preserve / improve / accept):
[`MANAGER_CARD_SORARE_STYLE_BRIEF.md`](MANAGER_CARD_SORARE_STYLE_BRIEF.md). Direction mock (open in a
browser, it follows this spec): [`manager-card-sorare-style/mock.html`](manager-card-sorare-style/mock.html).
Branch `claude/manager-card-sorare-style` from `main` `8fae526c`. Written 2026-10-09 by the design
director; nothing here has been built yet.

Where this spec gives a number, use that number. Where it says "measure", measure in Chromium on the
built card and write the value into the module's README. Where something is not covered, follow the
incumbent plan ([`MANAGER_CARD_SECTION_PLAN.md`](MANAGER_CARD_SECTION_PLAN.md)) and say so in the
commit message.

---

## 0. Decisions (the build's defaults; owner questions in §15)

| #   | Decision                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Model: Sorare's football card of the **2026-27 generation** (dark lacquered plate, raised tab, cut corner, lit tubes, two-face name). The rating is the centrepiece, as Sorare's in-app hex score is beside every card; on our card it is the shirt number.                            |
| D2  | No photo: **the shirt without the player.** A club-coloured shirt panel with a V collar fills the art window; the rating sits on it as a giant shirt number; behind it a generated field of light ribbons and glitch bars in the tier colour, seeded by the serial, unique and stable. |
| D3  | The card is a **dark object in both app themes** (Sorare's are). Theme changes only the outer edge, the rim and the drop shadow.                                                                                                                                                       |
| D4  | Six-step foil ladder: base (no tier) graphite · LASTREET steel · STADE amber · PRO red · CHAMPION ice blue · LEGEND violet + prism.                                                                                                                                                    |
| D5  | Name in two lines: first word in **Changa 800** caps; the rest in **Instrument Serif 400** caps (new, self-hosted, OFL, loaded only by the card chunk). Arabic names: Changa 800 over Changa 300.                                                                                      |
| D6  | Fixed aspect 1 : 1.618 for every card (no height that changes with the data).                                                                                                                                                                                                          |
| D7  | No card back, no flip: a flip hides the number (brief: never hidden), and the back would repeat the stats the page already shows under the card.                                                                                                                                       |
| D8  | Tilt and moving foil on mouse and pen only; touch gets the static sheen; no device orientation.                                                                                                                                                                                        |
| D9  | New renderer `src/components/manager-card/eclat/` (« éclat », the shine), id `eclat-v1`. Écharpe (`echarpe/`) is **deleted** in the last integration commit; git history keeps it.                                                                                                     |
| D10 | Tier `homa` is displayed **LASTREET** in French and Arabic (Latin word, isolated in Arabic). Key unchanged everywhere.                                                                                                                                                                 |
| D11 | Our serial stays `BOT #482913`. No « x/1000 »: our cards have no supply cap and the plan bans scarcity and count wording.                                                                                                                                                              |

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

**Units.** One SVG, `viewBox="0 0 1000 1618"`. All numbers below are viewBox units (= per-mille of the
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

### 3.2 Layers, bottom to top

| z   | Layer               | Geometry                                                                                                                                                                                                                                                                                 |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plate               | `OUTLINE` filled `plate`; a linear gradient top → bottom: 0 `deep` at .55 opacity, .30 `plate`, 1 `plate`.                                                                                                                                                                               |
| 2   | Art window          | Rect x 62–982, y 22–1110, `rx 18`; clip for z 3–6. Fill: radial gradient centred (780, 90), r 1150: 0 `glow` .85, .38 `deep` .9, 1 `plate`.                                                                                                                                              |
| 3   | Field               | Generated ribbons and glitch bars (§5.3), clipped to the window.                                                                                                                                                                                                                         |
| 4   | Shirt panel         | §5.1, clipped to the window, fading into the plate over its last 200 units.                                                                                                                                                                                                              |
| 5   | Number              | §5.2, `<g data-mc="ovr">`.                                                                                                                                                                                                                                                               |
| 6   | Window vignette     | Linear gradient over the window, top → bottom: 0 transparent, .78 transparent, 1 `plate` 1.0 (the photo-into-plate fade).                                                                                                                                                                |
| 7   | Bottom plate        | Path from (0, 1110) to (1000, 1110) down the outline; fill `plate` .94 with a top highlight line y 1110, 2 units, white .16; inner gradient 0 `deep` .22 → .35 transparent.                                                                                                              |
| 8   | Leading rail        | Rect x 0–62, y 330–1110, fill `plate` .9, trailing hairline x 62, white .10. Tube: rect x 25–35, y 360–640, `rx 5`, fill `tube`, glow = same rect blurred (`feGaussianBlur` stdDeviation 6) in `glow` .9 beneath.                                                                        |
| 9   | Rail mark           | The BotolaGO wordmark (`src/assets/brand/botolago-wordmark-light.svg?raw`, unmodified, nested `<svg>`), rotated −90°, height 30, its baseline centre at (31, 880), reading bottom → top, opacity .78. Arabic: the same, at x 969, reading bottom → top (a rotated mark is not mirrored). |
| 10  | Tab                 | Path: x 0–206 from y 0 to 392, its top following the outline, trailing corners r 22, fill `plate` .82, 1.5-unit stroke white .14, inner top highlight white .08. Contents §3.3.                                                                                                          |
| 11  | Trailing capsule    | Rect x 836–908, y 1150–1402, `rx 36`, fill `#000` .35, 1.5-unit stroke white .12. Tube: rect x 965–975, y 1150–1390, `rx 5`, `tube` with its blurred `glow` beneath. Founder content §6.                                                                                                 |
| 12  | Rivets              | Circles r 6, fill white .22 with a 1-unit `#000` .4 lower arc: (24, 1592), (974, 34), (974, 1124), (24, 1124).                                                                                                                                                                           |
| 13  | Text                | §3.3, §4.                                                                                                                                                                                                                                                                                |
| 14  | Edge                | `OUTLINE` stroked 3 units `edge` (theme-specific, §5.4), plus in dark theme an outer rim: `OUTLINE` stroked 1.5 units `#FFFFFF` .16 outside the edge.                                                                                                                                    |
| 15  | Foil overlay (HTML) | A `<div class="mc-eclat__foil" aria-hidden="true">` absolutely over the SVG, `pointer-events: none`, `clip-path` §3.1. §8.                                                                                                                                                               |

Every text and every number group sits **above** z 1–12 and below only z 14–15, which take no
pointer events. A transparent hit rect covers the number's box inside its group.

### 3.3 Furniture and text positions (LTR; mirror x in Arabic)

| Element       | Position                                                   | Face, size, weight, case, tracking                                           | Colour                                                                              |
| ------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Season        | tab, centre x 103, baseline 112                            | Manrope 800, 30, `font-variant-numeric: tabular-nums`, tracking .04em        | `#FFFFFF` .88                                                                       |
| Club disc     | tab, centre (103, 230), r 50                               | fill `club.primary`; ring 7 units `club.secondary` (else white .5)           | —                                                                                   |
| Club initials | disc centre, baseline 230 + 0.35 × 34                      | Changa 800, 34, caps, tracking .02em (Latin), 0 (Arabic)                     | white or `#0E1116`, whichever is ≥ 4.5:1 on `primary`                               |
| Sample pill   | x 744–952 (anchored at the trailing end), y 44–92, `rx 24` | Manrope 800, 26, caps, tracking .1em (Latin); fill `#000` .5                 | `#FFFFFF`                                                                           |
| Number        | §5.2                                                       | Changa 800                                                                   | §5.2                                                                                |
| « OVR »       | centre x 500, baseline 818                                 | Manrope 800, 34, tracking .16em                                              | `#FFFFFF` .82                                                                       |
| Stat labels   | x 56, 196, 336, 476 (start), baseline 1178                 | Manrope 700, 34, caps, tracking .08em                                        | `label`                                                                             |
| Stat values   | same x, baseline 1240                                      | Manrope 800, 56, tabular-nums                                                | `#FFFFFF`                                                                           |
| Stat dividers | x 172, 312, 452; y 1146–1250; 1.5 units                    | —                                                                            | `#FFFFFF` .22                                                                       |
| Tier word     | x 600 (start), baseline 1178                               | Changa 800, 36, caps, tracking .12em (Latin words, incl. LASTREET in Arabic) | `glow` (`lastreet`: `#E6ECF3`), with a 1-unit `#000` .5 shadow at dy 1.5 (engraved) |
| Name line 1   | x 56, baseline 1352                                        | Changa 800, max 92, min 60, caps                                             | `#FFFFFF`                                                                           |
| Name line 2   | x 56, baseline 1478                                        | Instrument Serif 400, max 132, min 84, caps                                  | `#FFFFFF`                                                                           |
| Serial        | x 56, baseline 1572                                        | Manrope 600, 38, tabular-nums, tracking .02em                                | `#FFFFFF` .74                                                                       |

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

### 5.1 The shirt panel (the club)

- Path (LTR, mirrored in Arabic): start (262, 1110) up to (262, 300), then the shoulder `Q 262 250 312
250`, L (420, 250), the collar `L 500 330 L 580 250`, L (688, 250) `Q 738 250 738 300`, down to
  (738, 1110), Z. (Panel 476 wide, 47.6 % of the card.)
- Fill: `club.primary`. Light: a linear gradient overlay left → right: 0 `#FFFFFF` .10, .45 transparent,
  1 `#000` .22 (the cloth turns away from the light); top → bottom: .80 transparent → 1 `plate` 1.0.
- Collar trim: the V `M 420 250 L 500 330 L 580 250` stroked 16 units `club.secondary` (else white
  .85), round joins; a 2-unit inner line white .18 offset 10 units inside.
- Side seams: x 300 and 700, y 330–1050, 3 units, `club.secondary` .35 (else white .12).
- **No club**: a training bib. Fill `plate` lightened 6 % (`mix(plate, #fff, .06)`), collar and seams
  in `edge`, a 2-unit keyline round the panel in `glow` .55. Same shape.
- The panel never takes a crest, a sponsor, a pattern of the real kit or any logo.

### 5.2 The number (the shirt number)

- `<g data-mc="ovr">` containing: a transparent hit rect (x 220–780, y 360–780) and one `<text>`:
  centre x 500, baseline 760, Changa 800, size 520, `text-anchor="middle"`, `direction="ltr"`,
  `font-variant-numeric: normal`. Width of two digits ≈ 560 (overflows the panel a little, as a player
  overflows Sorare's window; intended).
- Fill: `#FFFFFF` when its contrast against `club.primary` is ≥ 3:1, else `#0E1116`. Stroke 8 units
  `plate` at .55 with `paint-order: stroke`, then a drop shadow: `feGaussianBlur`
  stdDeviation 12 of the glyph offset dy 14 in `#000` .45 (a filter on a **copy** of the text placed
  before the group, so the group itself has no filter).
- Null rating: the same `<text>` with « — » (U+2014), size **360**, baseline **660** (at 520 the dash
  reads as a slab). Forming marks below (§6).
- It is **never** inside an animated element, a mask or a clip that changes over time.

### 5.3 The field (generated, unique per card)

Seed = FNV-1a 32-bit of `serial ?? (name + "|" + season)`; PRNG mulberry32. Inside the window:

1. **Ribbons**: 5 cubic Béziers from x −80 to 1080. For ribbon i (0–4): start y = 120 + 170 i + r(−60,
   60); two controls at x 330 and 670 with y = start ± r(80, 260); end y = start + r(−120, 120).
   Stroke `glow`, width r(4, 26), opacity r(.25, .7), `stroke-linecap="round"`, no fill. Ribbons 1 and 3
   are drawn twice: once blurred (stdDeviation 10, opacity × .8) under the sharp one.
2. **Glitch bars**: 18 rects. y = r(40, 560) snapped to 12-unit rows, height 9 or 14, width r(24, 140),
   x = r(70, 960 − width); fill `tube` at r(.35, .85) for 12 of them, `glow` .6 for 6.
3. **Pixel rain**: 40 squares 8 × 8 on a 16-unit grid in two vertical bands x 70–240 and 760–982, y
   40–620, opacity r(.1, .35), fill `tube`.
4. Base (no tier): only items 2 and 3, in `#8C95A3` at half the opacities. LEGEND: ribbons stroked with
   the **prism** gradient (§5.4) instead of `glow`.

The field is static. It is the card's fingerprint: the same card always draws the same field; a
different serial draws a different one.

### 5.4 The foil ladder (tokens)

A TypeScript table in `eclat/foil.ts`, literal hex (the share image's SVG cannot read CSS variables).

| Tier (`code`) | Display  | `plate`   | `deep`    | `glow`    | `tube`    | `label`   | `edge` light | `edge` dark | Sheen α | Holo α | Holo stops                                                                                                 |
| ------------- | -------- | --------- | --------- | --------- | --------- | --------- | ------------ | ----------- | ------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `null` (base) | —        | `#12151B` | `#262B35` | `#6B7484` | `#3A414D` | `#8C95A3` | `#3A414D`    | `#59616E`   | .10     | 0      | —                                                                                                          |
| `homa`        | LASTREET | `#111418` | `#3B4450` | `#C7D0DC` | `#EEF3F9` | `#9BA5B2` | `#5C6672`    | `#AEB8C5`   | .22     | .10    | `#FFFFFF`, `#C7D0DC`, `#8E99A8`, `#FFFFFF`                                                                 |
| `stade`       | STADE    | `#1C1403` | `#7A4E12` | `#F2B544` | `#FFF2DA` | `#AA9C7E` | `#9A6B16`    | `#E9B055`   | .26     | .14    | `#FFE7A8`, `#F2B544`, `#C97F1E`, `#FFF2DA`                                                                 |
| `pro`         | PRO      | `#1D0507` | `#8E1F27` | `#F0545A` | `#FFE1E2` | `#B6A3A2` | `#B1262E`    | `#EA6263`   | .26     | .14    | `#FFB3B6`, `#F0545A`, `#B1262E`, `#FFE1E2`                                                                 |
| `champion`    | CHAMPION | `#03111C` | `#155C80` | `#5FD0EE` | `#E0F5FC` | `#86A0AE` | `#1F6F96`    | `#6FCFE5`   | .28     | .20    | `#B8F0FF`, `#5FD0EE`, `#2B7FB8`, `#E0F5FC`                                                                 |
| `legend`      | LEGEND   | `#13041C` | `#6A2380` | `#E061E8` | `#F9E1FD` | `#9C93A6` | `#8E3A9A`    | `#DE5EE4`   | .30     | .32    | prism: `#FF6AD5` 0, `#C774E8` .18, `#AD8CFF` .36, `#8795E8` .52, `#94D0FF` .68, `#5EE7DF` .84, `#FFE29A` 1 |

Light and dark app themes (D3): the card's inside is identical; `edge` takes the light or dark column
(light ≥ 3:1 against `#FFFFFF`, dark ≥ 3:1 against the dark page `--ui-page` in dark — measure); the
dark theme adds the outer rim (z 14); the drop shadow is CSS on the root:
light `filter: drop-shadow(0 10px 18px rgb(12 18 32 / .26)) drop-shadow(0 2px 3px rgb(12 18 32 / .22))`;
dark `filter: drop-shadow(0 14px 26px rgb(0 0 0 / .55))`. Tokens and minis use no filter (§7).

---

## 6. Every state, drawn

| State (fixture)                                            | Number     | Tier / foil                    | Marks                                                                                                                                           | Other                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ---------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rated (`rated` 84 PRO)                                     | 84         | `pro`, tier word PRO           | none                                                                                                                                            | Provisional changes nothing in the art.                                                                                                                                                                                                         |
| Forming (`born0` 0/3, `forming1` 1/3, `eve2`, `notFinal2`) | « — »      | base, no tier word             | N capsules centred under the dash: each 74 × 18, `rx 9`, gap 22, top y 800; k filled `tube` with `glow` blur, the rest stroked 2 units white .3 | —                                                                                                                                                                                                                                               |
| `insufficient3` (3/3, OVR null)                            | « — »      | base                           | none (k ≥ N)                                                                                                                                    | —                                                                                                                                                                                                                                               |
| Null tier with a number (never expected)                   | the number | base                           | none                                                                                                                                            | —                                                                                                                                                                                                                                               |
| `homa` 61                                                  | 61         | `homa`, tier word **LASTREET** | —                                                                                                                                               | —                                                                                                                                                                                                                                               |
| `tierUp` 88, `legend` 93, `tierDown` 79                    | as given   | `champion`, `legend`, `stade`  | —                                                                                                                                               | —                                                                                                                                                                                                                                               |
| Serial null (`born0`)                                      | —          | —                              | —                                                                                                                                               | Serial line `BOT —` (`serialLine`, as today)                                                                                                                                                                                                    |
| Founder (`founder`)                                        | —          | —                              | —                                                                                                                                               | Capsule lit: fill linear gradient `glow` .9 → `deep`; « ·26 » (last two digits of `founder`) Changa 800 34, white, rotated −90° at the capsule centre, reading bottom → top; the capsule's stroke `tube` 2 units. Not a founder: empty capsule. |
| Club null (`clubNull`)                                     | —          | —                              | —                                                                                                                                               | Tab without the disc (season alone, moved to baseline 200); bib panel §5.1.                                                                                                                                                                     |
| Unnamed guest (`guestProfile()`)                           | « — »      | base                           | as counted                                                                                                                                      | Empty name line §4.                                                                                                                                                                                                                             |
| Guest with a club tried on                                 | « — »      | base                           | —                                                                                                                                               | Panel in that club's colours.                                                                                                                                                                                                                   |
| `sample`                                                   | —          | —                              | —                                                                                                                                               | « EXEMPLE » / «مثال» pill §3.3.                                                                                                                                                                                                                 |
| `seasonStarted` (2027/28 forming, previous 86)             | « — »      | base                           | 0/3                                                                                                                                             | Season `2027/28` in the tab; the previous season's number stays in the DOM line, not on the card.                                                                                                                                               |
| Long Latin, Arabic name                                    | —          | —                              | —                                                                                                                                               | §4.                                                                                                                                                                                                                                             |

`label()` stays `cardLabel(cleanProfile(p), s)`; what is spoken is what is drawn.

---

## 7. Every surface and size

`tokenBox(profile, size)` = `{ width: round(size × 0.618), height: size }` for every profile. Tokens and
minis are a `<span>` of that box with one SVG, the same `OUTLINE` scaled, **no filters, no blur, no
foil overlay, no beats**, whole-pixel geometry where it matters.

| Surface (component)                                                                                                                                                               | Size                      | What is drawn                                                                                                                                                                                                                            | What drops                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| G1 stage (`CardStage` in `GradinsHome`, `GuestHero`, `NoTeamHero`), G2 (`GradinsCardPage`), hero frames (`HeroFrame`, `MomentHero`), M2 (`CardBornPanel`), replay (`ReplaySheet`) | full, 240 px (≥ 768: 264) | everything                                                                                                                                                                                                                               | —                                                                    |
| G4 face-à-face (`HeadToHeadSheet`)                                                                                                                                                | full, 200 px              | everything; tilt off (no `tilt` prop)                                                                                                                                                                                                    | —                                                                    |
| Founder block (`FounderBlock`, `detail(p, "founder")`)                                                                                                                            | crop                      | viewBox `560 1100 440 518` of the full card (the capsule, the trailing tube, the cut corner and the serial's end), mirrored in Arabic (`0 1100 440 518`), rendered max 22 rem wide, its own root `role="img"` with `strings.founderLine` | —                                                                    |
| Tokens 80, 64 (`HubCardBlock`, `gradins-card-setup-row`, `SeasonRack`)                                                                                                            | 49 × 80, 40 × 64          | outline, plate, window field glow (radial only), 3 ribbons, shirt panel, number (size 0.36 × height, Changa 800), edge 1.5 px; at 80 also the club disc (r 7 px) in the tab                                                              | stats, name, serial, season, rail mark, capsule, rivets, glitch bars |
| Tokens 56, 44 (`LeagueBand`, `TierLadder`, `RankCardToken`, `CardSaveLine`)                                                                                                       | 35 × 56, 27 × 44          | outline, plate, radial glow, shirt panel, number (0.36 × height: 20, 16 px), edge 1 px                                                                                                                                                   | ribbons, disc                                                        |
| Minis 32, 28 (`LeagueRows`, `LeagueRowMini`)                                                                                                                                      | 20 × 32, 17 × 28          | outline (tab and cut corner kept), plate in `deep`, shirt panel as a flat club-coloured rect, number at 0.42 × height (13, 12 px), edge 1 px                                                                                             | everything else                                                      |
| Mini 24 (`GuestPoints`, `LeagueCardBand`, `GuestIntroCardPoint`)                                                                                                                  | 15 × 24                   | outline, `deep` plate, club panel, edge                                                                                                                                                                                                  | the number (the row prints it)                                       |
| Share picture (`card-share-image.ts`, `image()`)                                                                                                                                  | 760 × 1229.7 art          | the full card at rest with the static sheen baked into the SVG (a linear gradient at the rest position, §8) and every text as a `TextRun`                                                                                                | the HTML foil overlay                                                |

Numbers on tokens and minis: white or `#0E1116` by contrast against the panel, as §5.2, ≥ 3:1. A null
number on a token draws « — » at the same size; on the 24 mini nothing.

Share picture: `CARD_IMAGE_LAYOUT.card` (y 352–1496) already fits the art by scale; the art is drawn at
707 × 1144. `TextRun.face` gains `"serif"` (Instrument Serif) and `"displayLight"` (Changa 300); the
share module loads both before drawing (extend its font list, not `loadShareFonts` in Pépites). Every
run of `image()`: season, club initials, sample, the number (or « — »), OVR, the four labels and
values, the tier word, the two name lines, the serial, the founder « ·26 ».

---

## 8. Light and tilt (desktop), static sheen (everywhere)

Markup of the full card:

```html
<div
  class="mc-eclat mc-eclat--{tier|base} mc-eclat--{light|dark}[ mc-eclat--beat-{beat}]"
  role="img"
  aria-label="…"
  dir="ltr|rtl"
  style="--mc-px:62;--mc-py:18"
>
  <div class="mc-eclat__tilt">
    <svg class="mc-svg" viewBox="0 0 1000 1618" aria-hidden="true" focusable="false">…</svg>
    <div class="mc-eclat__foil" aria-hidden="true"></div>
  </div>
</div>
```

`eclat.css` (scoped under `.mc-eclat`, shipped with the chunk):

- `.mc-eclat { aspect-ratio: 1000 / 1618; perspective: 900px; }` `.mc-eclat__tilt { transform:
rotateX(var(--mc-rx, 0deg)) rotateY(var(--mc-ry, 0deg)); transform-style: preserve-3d; }`
- `.mc-eclat__foil` = two backgrounds, `pointer-events: none`, `clip-path` §3.1:
  1. Sheen: `linear-gradient(var(--mc-sheen-angle), transparent calc(var(--mc-px) * 1% − 22%), rgb(255
255 255 / var(--mc-sheen)) calc(var(--mc-px) * 1%), transparent calc(var(--mc-px) * 1% + 22%))`,
     `mix-blend-mode: soft-light`. `--mc-sheen-angle: 115deg`, `245deg` under `[dir="rtl"]`.
  2. Holo (tiers with Holo α > 0): `repeating-linear-gradient(var(--mc-sheen-angle), <holo stops>
   spread over 0–24%)`, `background-size: 300% 300%`, `background-position: calc(var(--mc-px) * 1%)
   calc(var(--mc-py) * 1%)`, `mix-blend-mode: color-dodge`, opacity = Holo α. LEGEND's prism stops.
     `--mc-sheen` = the tier's Sheen α. Rest position `--mc-px: 62; --mc-py: 18`.
- `.mc-eclat--light { filter: <light drop shadows> }`, `.mc-eclat--dark { filter: <dark> }` (§5.4).

`tilt.ts` exports `mountTilt(el): () => void`, the renderer's `mount`:

- Listens on the card root for `pointermove`, `pointerenter`, `pointerleave`; acts only for
  `pointerType` `mouse` or `pen`; touch does nothing (no scroll interference).
- On move (rAF-throttled, one write per frame): `px = 100 × (x − left) / width`, `py` likewise;
  `--mc-px`, `--mc-py`; `--mc-ry = (px − 50) / 50 × 9deg`, `--mc-rx = (50 − py) / 50 × 7deg`.
- On leave: add `.mc-eclat--settle` (`transition: --mc-rx, --mc-ry 450ms cubic-bezier(.2,.8,.2,1)`,
  with `@property` registrations for the four variables) and write the rest values; remove the class on
  `transitionend`.
- Inert while `document.hidden`; never mounted under reduced motion (`ManagerCard` already guards);
  returns a cleanup that removes listeners and the inline variables.
- Measure: no long task > 50 ms while moving; contrast of the name and stats with the pointer resting on
  them (worst sheen) still ≥ 4.5:1.

`ManagerCard`'s `sway` prop is renamed **`tilt`** (same semantics: the screen opts in; G1, G2 and hero
frames do; sheets and panels do not).

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

`appliedBeat()` rules as today: a beat with nothing to do on this card is dropped without a trace
(`tier` on the base card, `founder` on a non-founder, `legend` on a non-LEGEND, `tick`/`first` with
nothing counted). `beatMs()` returns the totals above; `BEAT_CAP_MS = 600`.

---

## 10. The stage (G1, G2)

`CardStage` loses the rail (`data-stage-rail`, `RAIL_CENTRE`, the LEGEND exception) — an Écharpe
prop. In its place a **contact shadow**: an ellipse under the card, 86 % of the card width, 18 px
tall, centred 6 px below the card's bottom, `radial-gradient(closest-side, rgb(0 0 0 / .28),
transparent)` in light, `.5` in dark, `aria-hidden`, `pointer-events: none`, logical insets only. The
card is centred; widths 240 / 264 as today; `pt-5 md:pt-6` kept; the stage gains 12 px bottom padding
for the tilt's travel. The e2e overflow probe's rail exemption is removed.

---

## 11. LASTREET (tier `homa`, display only)

- Dictionaries: `src/i18n/dictionary-fr.ts` `"card.tier.homa": "LASTREET"`; `src/i18n/dictionary-ar.ts`
  `"card.tier.homa": "LASTREET"`. No key renamed; `TierCode` stays `"homa"`; the DTO, contracts,
  fixtures (`homa` id and thresholds), analytics event names (`card_share_preview_homa`) and the
  database are untouched.
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
  shirt.ts             the panel, collar, seams, bib (§5.1)
  full.ts              fullCard, cardAspect (constant), cardImage (text runs), founderDetail, appliedBeat
  token.ts             tokens and minis (§7)
  beats.ts             BEAT_MS, BEAT_CAP_MS = 600, which classes animate per beat
  tilt.ts              mountTilt (§8)
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
- `ManagerCard.test.tsx`: `tilt` prop.
- `gradins.e2e.ts`: drop the rail exemption; keep the number-at-every-frame test (the selector is the
  same); add a tilt check (mouse move over the card changes `--mc-ry`; with `reducedMotion: "reduce"`
  it does not).

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

| WP   | Owner files                                                                                                                                                                                                                            | Order                                              | Does                                                                                                                                                                                                                                                                                                                                                                                                                                 | Done when                                                                                                                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP0  | `docs/product/manager-card-sorare-style/before/**`, its capture scripts                                                                                                                                                                | first, at once, on a worktree of `main` `8fae526c` | The **before** set of the brief's list (390 @2× and 1440 @1×, FR/AR, light/dark) from the base tree with `VITE_MANAGER_CARD_PREVIEW=1` and the mock modes, reusing `docs/product/manager-card-section/wp6b/capture.mjs` and `wp1/capture-off.mjs`; plus the switch-off set (Home, Fantasy, Pépites, the bar).                                                                                                                        | Every file of the list exists, named `<screen>-<fixture>-<lang>-<theme>-<width>.png`, and `before/INDEX.md` lists them with the command and port.                                                                                                                                                           |
| WP1  | `src/components/manager-card/eclat/**` except `token.ts`, `beats.ts`, `tilt.ts` and the beats section of `eclat.css`; `public/fonts/instrument-serif*`, `public/fonts/README.md`; `renderer.ts` (TextRun faces)                        | after the brief commit; parallel with WP0, WP3a    | §3–§6, §7's share-art `image()` and `detail()`, §12.1–12.2 (not yet switching `active-renderer.ts`). Unit tests of §12.4 for full, name, field, foil. A dev-only gallery route is **not** added; use a Bun script that writes `scratchpad` HTML of every fixture for eyeballing.                                                                                                                                                     | The new tests pass; `eclatRenderer` passes `describeRendererContract` (temporarily add `describeRendererContract("eclat", eclatRenderer)` in the contract test); full() timing recorded. Screenshot of the gallery (scratchpad) at 264 px for the 6 tiers × FR/AR matches the mock (`mock.html`) in layout. |
| WP2  | `eclat/token.ts`, `eclat/beats.ts`, `eclat/tilt.ts`, `eclat.css` beats + tilt sections, their tests                                                                                                                                    | after WP1's first commit (geometry, foil, view)    | §7 tokens and minis, §8 tilt and foil overlay, §9 beats, `appliedBeat`.                                                                                                                                                                                                                                                                                                                                                              | Token tests per size; beat tests (no number/serial/text in animated classes, totals ≤ 600); tilt tests; in Chromium with motion on, every beat's `document.getAnimations()` total duration ≤ 600 ms; with reduced motion, empty.                                                                            |
| WP3a | `src/i18n/dictionary-{fr,ar}.ts` (the one key), `src/i18n/i18n-allowlist.ts`, `scripts/qa/i18n-gate.ts` baselines, `tier-word.tsx`, `copy.ts` (`isolateLatin`), the §11 call sites, their tests                                        | at once, parallel                                  | §11 LASTREET.                                                                                                                                                                                                                                                                                                                                                                                                                        | `bun scripts/qa/i18n-gate.ts` 0; the new no-HOMA test; an Arabic render test finds `bdi[dir=ltr]` round LASTREET in RatingLine, TierLadder and a moment heading.                                                                                                                                            |
| WP3b | `active-renderer.ts`, `ManagerCard.tsx`, `CardStage.tsx`, `HeroFrame.tsx`, `FounderBlock.tsx`, `moments/card-share-image.ts` (+ draw test), `tests/e2e/gradins*.ts`, `gradins.source.test.ts`, the §12.3 deletions and comment updates | after WP1 and WP2 merge                            | Switch the app to `eclat-v1`, the stage (§10), `tilt` prop, share picture faces, delete Écharpe (§12.3), README.                                                                                                                                                                                                                                                                                                                     | `bun run build`; `bun scripts/qa/manager-card-off-bundle-gate.ts`; `bun scripts/qa/manager-card-fixture-gate.ts`; Playwright `gradins.e2e.ts` (preview, port 4193) and `gradins-off.e2e.ts` (built output) pass; the number-at-every-frame test passes.                                                     |
| WP4  | `docs/product/manager-card-sorare-style/INDEX.md`, `after/**`, measurement scripts, the PR description                                                                                                                                 | last                                               | The **after** set matching WP0 name for name; the gallery capture (every fixture × tier × size × theme × lang); contrast from pixels (`scripts/qa/contrast-probe.mjs`, incl. pointer-over-text sheen); overflow at 320/390 (`scripts/qa/layout-probe.mjs`); RTL checks; reduced motion; perf (CPU × 4); switch-off comparison against `main` (0.0 %); the Impeccable detector on changed files; a draft PR with the brief pasted in. | Every brief criterion has a row in `INDEX.md` with the command, the port, the number and the file. Draft PR opened; not merged, not published.                                                                                                                                                              |

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
3. **The shirt panel carries the club's colours; with no club, a neutral bib.** Alternative: no shirt,
   the number alone on the field (more abstract, loses the club).
